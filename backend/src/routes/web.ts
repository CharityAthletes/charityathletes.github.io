import { Router, Request, Response } from 'express';
import { db } from '../config/supabase';
import Stripe from 'stripe';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';

// Tight limiter for pledge submissions: 5 per IP per hour.
// Legitimate donors rarely need more than one; this prevents Stripe customer spam.
const pledgeRateLimit = rateLimit({
  windowMs:        60 * 60_000,
  max:             5,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: 'Too many pledge attempts from this IP. Please try again later.' },
});

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

// ── GET /c/:id — donor-facing campaign page ───────────────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
  const { data: campaign, error } = await db
    .from('campaigns')
    .select('*, nonprofits(name_ja, name_en, logo_url, website_url)')
    .eq('id', req.params.id)
    .single();

  if (error) console.error('[Web] campaign query error:', error);
  if (!campaign) return res.status(404).send(`<h1>Campaign not found</h1><p>${error?.message ?? ''}</p>`);

  // ?a=userId — show a specific joined athlete's page; defaults to campaign creator
  const athleteId = (req.query.a as string) || campaign.created_by;

  const { data: athleteProfile } = await db
    .from('user_profiles')
    .select('display_name, avatar_url')
    .eq('user_id', athleteId)
    .single();
  (campaign as any).user_profiles = athleteProfile;

  const stripeKey = process.env.STRIPE_PUBLISHABLE_KEY ?? '';
  const proto    = req.headers['x-forwarded-proto'] ?? req.protocol ?? 'https';
  const apiBase  = process.env.APP_URL?.startsWith('http')
    ? process.env.APP_URL
    : `${proto}://${req.headers.host}`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(renderPage(campaign, stripeKey, apiBase, req.params.id, athleteId));
});

// ── GET /c/:id/data — JSON for the page ──────────────────────────────────────

router.get('/:id/data', async (req: Request, res: Response) => {
  try {
    const { data: campaign } = await db
      .from('campaigns')
      .select('*, nonprofits(name_ja, name_en)')
      .eq('id', req.params.id).single();

    if (!campaign) return res.status(404).json({ error: 'Not found' });

    // Expand sport_type aliases so e.g. "Ride" also matches "VirtualRide", "EBikeRide", "GravelRide"
    const sportTypeAliases: Record<string, string[]> = {
      Ride:  ['Ride', 'MountainBikeRide', 'GravelRide', 'EBikeRide', 'EMountainBikeRide', 'Handcycle', 'VelomobileRide', 'VirtualRide'],
      Run:   ['Run', 'TrailRun', 'VirtualRun', 'Wheelchair'],
      Walk:  ['Walk', 'Hike', 'Wheelchair'],
      Swim:  ['Swim', 'OpenWaterSwim'],
    };
    const expandedTypes = (campaign.sport_types ?? []).flatMap(
      (t: string) => sportTypeAliases[t] ?? [t]
    );

    // ?a=userId — show a specific athlete's activities; defaults to creator
    const athleteId = (req.query.a as string) || campaign.created_by || null;

    // Build activities query — only filter by sport_type when types are actually configured
    let activityQuery = db.from('activities')
      .select('id, name, sport_type, distance_meters, start_date, moving_time_seconds, strava_activity_id, map_polyline, photo_urls')
      .is('deleted_at', null)
      .gte('start_date_local', campaign.start_date ?? '')
      .order('start_date_local', { ascending: false })
      .limit(20);
    if (athleteId) activityQuery = activityQuery.eq('user_id', athleteId);
    if (campaign.end_date) activityQuery = activityQuery.lte('start_date_local', campaign.end_date);
    if (expandedTypes.length > 0) activityQuery = activityQuery.in('sport_type', expandedTypes);

    // Pledges: scope to this athlete when ?a= is present; otherwise all campaign pledges
    let pledgesQuery = db.from('donor_pledges')
      .select('flat_amount_jpy, per_km_rate_jpy, status')
      .eq('campaign_id', req.params.id)
      .in('status', ['pending', 'confirmed', 'charged']);
    if (req.query.a && athleteId) pledgesQuery = pledgesQuery.eq('athlete_user_id', athleteId);

    const [{ data: activities }, { data: pledges }] = await Promise.all([
      activityQuery,
      pledgesQuery,
    ]);

    const totalKm = (activities ?? []).reduce((s, a) => s + (a.distance_meters / 1000), 0);
    const totalPledgedFlat = (pledges ?? []).reduce((s, p) => s + (p.flat_amount_jpy ?? 0), 0);
    const totalPledgedPerKm = (pledges ?? []).reduce((s, p) => s + ((p.per_km_rate_jpy ?? 0) * totalKm), 0);

    return res.json({
      campaign,
      activities: activities ?? [],
      totalKm: Math.round(totalKm * 10) / 10,
      donorCount: (pledges ?? []).length,
      estimatedTotal: Math.round(totalPledgedFlat + totalPledgedPerKm),
    });
  } catch (err: any) {
    console.error('[Web] /data error:', err);
    return res.status(500).json({ error: err?.message ?? 'Internal error' });
  }
});

// ── POST /c/:id/pledge ────────────────────────────────────────────────────────
// Flat donation  → PaymentIntent  → charged immediately
// Per-km pledge  → SetupIntent    → card saved, charged after campaign ends

const pledgeSchema = z.object({
  donor_name:       z.string().min(1),
  donor_email:      z.string().email(),
  flat_amount_jpy:  z.number().int().min(1).nullable().default(null),
  per_km_rate_jpy:  z.number().int().min(1).nullable().default(null),
  currency:         z.enum(['jpy', 'usd', 'aud']).default('jpy'),
  tip_amount:       z.number().int().min(1).nullable().default(null),
  is_anonymous:     z.boolean().default(false),
  athlete_user_id:  z.string().uuid().nullable().default(null),
}).refine(d => d.flat_amount_jpy != null || d.per_km_rate_jpy != null, {
  message: 'At least one pledge type required',
}).refine(d => !(d.flat_amount_jpy != null && d.per_km_rate_jpy != null), {
  message: 'Choose one pledge type only',
});

router.post('/:id/pledge', pledgeRateLimit, async (req: Request, res: Response) => {
  const parsed = pledgeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { donor_name, donor_email, flat_amount_jpy, per_km_rate_jpy, currency, tip_amount, is_anonymous, athlete_user_id } = parsed.data;
  const isFlat = flat_amount_jpy != null;

  // Convert human-readable amount to Stripe units.
  // JPY is zero-decimal (no conversion); USD/AUD use cents (multiply by 100).
  const toStripeUnits = (v: number) => currency === 'jpy' ? v : v * 100;

  // Create Stripe customer
  const customer = await stripe.customers.create({
    name:  donor_name,
    email: donor_email,
    metadata: { campaign_id: req.params.id },
  });

  if (isFlat) {
    // ── Flat: charge immediately via PaymentIntent ───────────────────────────
    const baseUnits = toStripeUnits(flat_amount_jpy!);
    const tipUnits  = tip_amount ? toStripeUnits(tip_amount) : 0;
    const paymentIntent = await stripe.paymentIntents.create({
      amount:   baseUnits + tipUnits,
      currency,
      customer: customer.id,
      payment_method_types: ['card'],
      metadata: { campaign_id: req.params.id, donor_name, donor_email, tip_amount: String(tip_amount ?? 0) },
    });

    const { error } = await db.from('donor_pledges').insert({
      campaign_id:              req.params.id,
      donor_name,
      donor_email,
      flat_amount_jpy,
      per_km_rate_jpy:          null,
      currency,
      tip_amount,
      stripe_customer_id:       customer.id,
      stripe_payment_intent_id: paymentIntent.id,
      is_anonymous,
      athlete_user_id,
      status:                   'pending',
    });
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ client_secret: paymentIntent.client_secret, type: 'payment' });
  } else {
    // ── Per-km: save card via SetupIntent, charge later ──────────────────────
    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      payment_method_types: ['card'],
      metadata: {
        campaign_id:      req.params.id,
        donor_name,
        donor_email,
        per_km_rate_jpy:  String(per_km_rate_jpy),
        currency,
      },
    });

    const { error } = await db.from('donor_pledges').insert({
      campaign_id:             req.params.id,
      donor_name,
      donor_email,
      flat_amount_jpy:         null,
      per_km_rate_jpy,
      currency,
      tip_amount:              null,
      stripe_customer_id:      customer.id,
      stripe_setup_intent_id:  setupIntent.id,
      is_anonymous,
      athlete_user_id,
      status:                  'pending',
    });
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ client_secret: setupIntent.client_secret, type: 'setup' });
  }
});

// ── POST /c/:id/pledge/confirm ────────────────────────────────────────────────
// Handles both PaymentIntent (pi_…) and SetupIntent (seti_…) confirmations

router.post('/:id/pledge/confirm', async (req: Request, res: Response) => {
  const { intent_id } = req.body;
  if (!intent_id) return res.status(400).json({ error: 'Missing intent_id' });

  if (intent_id.startsWith('pi_')) {
    // Flat donation — mark as charged immediately
    const pi = await stripe.paymentIntents.retrieve(intent_id);
    if (pi.status !== 'succeeded') return res.status(400).json({ error: 'Payment not completed' });

    await db.from('donor_pledges')
      .update({
        status:                    'charged',
        stripe_payment_method_id:  pi.payment_method as string,
        charged_amount_jpy:        pi.amount,
        charged_at:                new Date().toISOString(),
      })
      .eq('stripe_payment_intent_id', intent_id);

    // Recalculate and update campaign raised amount from all charged pledges
    const { data: charged } = await db.from('donor_pledges')
      .select('charged_amount_jpy')
      .eq('campaign_id', req.params.id)
      .eq('status', 'charged');
    const totalRaised = (charged ?? []).reduce((s: number, p: any) => s + (p.charged_amount_jpy ?? 0), 0);
    await db.from('campaigns').update({ raised_amount_jpy: totalRaised }).eq('id', req.params.id);
  } else {
    // Per-km pledge — card saved, will be charged at campaign end
    const si = await stripe.setupIntents.retrieve(intent_id);
    if (si.status !== 'succeeded') return res.status(400).json({ error: 'Card not confirmed' });

    await db.from('donor_pledges')
      .update({
        status:                    'confirmed',
        stripe_payment_method_id:  si.payment_method as string,
      })
      .eq('stripe_setup_intent_id', intent_id);
  }

  res.json({ ok: true });
});

export default router;

// ── HTML renderer ─────────────────────────────────────────────────────────────

function renderPage(campaign: any, stripeKey: string, apiBase: string, campaignId: string, athleteId: string = ''): string {
  const np   = campaign.nonprofits;
  const athlete = campaign.user_profiles;
  const endDate   = new Date(campaign.end_date).toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric' });
  const endDateEn = new Date(campaign.end_date).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });

  // ── Server-side HTML escape helpers ───────────────────────────────────────
  // Must be applied to every user-controlled value inserted into the template.
  const h = (s: string | null | undefined): string =>
    String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  // For src/href attributes: only allow http/https/relative URLs to block javascript: injection.
  const safeUrl = (url: string | null | undefined): string => {
    const u = String(url ?? '').trim();
    return (u.startsWith('https://') || u.startsWith('http://') || u.startsWith('/')) ? h(u) : '';
  };

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${h(campaign.title_ja)} | チャリアス</title>
  <meta property="og:type"        content="website">
  <meta property="og:title"       content="${h(campaign.title_ja)} | チャリアス (Charity Athletes)">
  <meta property="og:description" content="${h(campaign.description_ja || campaign.description_en || 'チャリアスのチャリティキャンペーンを応援してください！')}">
  <meta property="og:url"         content="https://charityathletes-production.up.railway.app/c/${h(campaignId)}">
  <meta property="og:image"       content="${safeUrl(np?.logo_url) || 'https://charityathletes-production.up.railway.app/static/logo.png'}">
  <meta name="twitter:card"       content="summary_large_image">
  <meta name="twitter:title"      content="${h(campaign.title_ja)} | チャリアス">
  <meta name="twitter:description" content="${h(campaign.description_ja || campaign.description_en || '')}">
  <script src="https://js.stripe.com/v3/"></script>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f7;color:#1d1d1f;min-height:100vh}
    .hero{background:linear-gradient(135deg,#007B83,#2E7D32);color:#fff;padding:32px 20px 40px}
    .hero h1{font-size:24px;font-weight:700;margin-bottom:6px}
    .hero .sub{opacity:.85;font-size:14px}
    .hero .meta{margin-top:16px;font-size:13px;opacity:.8}
    .card{background:#fff;border-radius:16px;padding:20px;margin:16px;box-shadow:0 2px 12px rgba(0,0,0,.08)}
    .section-title{font-size:13px;font-weight:600;color:#86868b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px}
    .stat-row{display:flex;gap:12px;margin:-8px 16px 0;position:relative;z-index:1}
    .stat{background:#fff;border-radius:14px;padding:16px;flex:1;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.1)}
    .stat .val{font-size:22px;font-weight:700;color:#007B83}
    .stat .lbl{font-size:11px;color:#86868b;margin-top:2px}
    .progress-bar{background:#f0f0f0;border-radius:99px;height:8px;margin:10px 0}
    .progress-fill{background:linear-gradient(90deg,#007B83,#2E7D32);border-radius:99px;height:8px;transition:width .5s}
    .activity-row{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f0f0f0}
    .activity-row:last-child{border-bottom:none}
    .activity-icon{width:36px;height:36px;background:#E0F7FA;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
    .activity-info{flex:1}
    .activity-name{font-size:14px;font-weight:500}
    .activity-meta{font-size:12px;color:#86868b}
    .activity-dist{font-size:14px;font-weight:700;color:#007B83}
    input,select{width:100%;padding:12px;border:1.5px solid #e0e0e0;border-radius:10px;font-size:15px;margin-top:6px;outline:none;transition:border .2s}
    input:focus,select:focus{border-color:#007B83}
    label{font-size:14px;font-weight:500;color:#444;display:block;margin-top:14px}
    .rate-grid{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
    .rate-btn{padding:8px 14px;border:2px solid #007B83;border-radius:99px;background:#fff;color:#007B83;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s}
    .rate-btn.active{background:#007B83;color:#fff}
    .stripe-element{padding:12px 14px;border:1.5px solid #d0d0d0;border-radius:10px;margin-top:8px;min-height:48px;background:#f9f9f9}
    .btn{width:100%;padding:15px;background:linear-gradient(135deg,#007B83,#2E7D32);color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;margin-top:18px;transition:opacity .2s}
    .btn:disabled{opacity:.5;cursor:not-allowed}
    .success-box{background:#e8f9ee;border:1px solid #34c759;border-radius:12px;padding:20px;text-align:center;display:none}
    .success-box h3{color:#1a8736;font-size:18px;margin-bottom:8px}
    .success-box p{color:#444;font-size:14px}
    .error-msg{color:#fff;font-size:14px;font-weight:600;margin-top:10px;display:none;background:#ff3b30;border-radius:10px;padding:12px 14px;line-height:1.5}
    .test-banner{background:#ff9500;color:#fff;border-radius:10px;padding:12px 14px;font-size:13px;margin-bottom:14px;line-height:1.6}
    .calc-box{background:#E0F7FA;border-radius:10px;padding:12px;margin-top:12px;font-size:14px}
    .calc-box strong{color:#007B83;font-size:18px}
    .type-tabs{display:flex;gap:8px;margin:12px 0}
    .type-tab{flex:1;padding:12px 8px;border:2px solid #e0e0e0;border-radius:12px;background:#fff;font-size:14px;font-weight:600;cursor:pointer;text-align:center;transition:all .15s;color:#86868b}
    .type-tab.active{border-color:#007B83;color:#007B83;background:#E0F7FA}
    .donation-panel{display:none}
    .donation-panel.active{display:block}
    #loading{text-align:center;padding:40px;color:#86868b}
    .curr-btn{padding:6px 14px;border:2px solid #e0e0e0;border-radius:99px;background:#fff;color:#86868b;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s}
    .curr-btn.active{border-color:#007B83;color:#007B83;background:#E0F7FA}
    /* Language toggle */
    .lang-toggle{display:flex;gap:6px}
    .lang-btn{background:rgba(255,255,255,0.2);color:#fff;border:1.5px solid rgba(255,255,255,0.5);border-radius:99px;padding:4px 12px;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s}
    .lang-btn.active{background:#fff;color:#007B83;border-color:#fff}
    span.en{display:none}
    html.lang-en span.ja{display:none}
    html.lang-en span.en{display:inline}
    p.en,div.en{display:none}
    html.lang-en p.ja,html.lang-en div.ja{display:none}
    html.lang-en p.en,html.lang-en div.en{display:block}
  </style>
  <script>(function(){try{var l=localStorage.getItem('ca_lang');if(l==='en')document.documentElement.classList.add('lang-en');}catch(e){}}())</script>
</head>
<body>

<div class="hero">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
    <div style="display:flex;align-items:center;gap:10px">
      <img src="/static/logo.png" alt="チャリアス"
           style="width:44px;height:44px;border-radius:10px;object-fit:cover;flex-shrink:0">
      <span style="font-size:14px;font-weight:600;opacity:.9"><span class="ja">チャリアス</span><span class="en">Charity Athletes</span></span>
    </div>
    <div class="lang-toggle">
      <button class="lang-btn" id="btn-lang-ja">日本語</button>
      <button class="lang-btn" id="btn-lang-en">EN</button>
    </div>
  </div>
  <h1><span class="ja">${h(campaign.title_ja)}</span><span class="en">${h(campaign.title_en || campaign.title_ja)}</span></h1>
  <div class="meta" style="display:flex;align-items:center;gap:12px;margin-top:16px">
    ${athlete?.avatar_url
      ? `<img src="${safeUrl(athlete.avatar_url)}" alt="${h(athlete.display_name ?? '')}"
             style="width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,0.6);flex-shrink:0">`
      : `<div style="width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,0.25);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">🏃</div>`
    }
    <div>
      ${athlete?.display_name ? `<div style="font-weight:600;font-size:15px">${h(athlete.display_name)}</div>` : ''}
      ${np ? `<div style="font-size:13px;opacity:.85;margin-top:2px">🏢 <span class="ja">${h(np.name_ja)}</span><span class="en">${h(np.name_en || np.name_ja)}</span></div>` : ''}
      <div style="font-size:12px;opacity:.75;margin-top:2px">📅 <span class="ja">${endDate}まで</span><span class="en">Ends ${endDateEn}</span></div>
    </div>
  </div>
</div>

<div class="stat-row">
  <div class="stat"><div class="val" id="stat-km">…</div><div class="lbl"><span class="ja">走行距離</span><span class="en">My Distance</span></div></div>
  <div class="stat"><div class="val" id="stat-donors">…</div><div class="lbl"><span class="ja">サポーター</span><span class="en">Donors</span></div></div>
  <div class="stat"><div class="val" id="stat-total">…</div><div class="lbl"><span class="ja">寄付見込額</span><span class="en">Est. Total</span></div></div>
</div>

<div class="card" style="margin-top:28px">
  <div class="section-title"><span class="ja">活動履歴</span><span class="en">Activities</span></div>
  <div id="activities-hint" style="display:none;font-size:12px;color:#86868b;margin-bottom:10px;margin-top:-6px">
    🗺️ <span class="ja">アクティビティをタップするとマップや写真が表示されます</span><span class="en">Tap an activity to see the map &amp; photos</span>
  </div>
  <div id="activities"><div id="loading"><span class="ja">読み込み中…</span><span class="en">Loading…</span></div></div>
</div>

${(campaign.description_ja || campaign.description_en) ? `
<div class="card">
  <div class="section-title"><span class="ja">キャンペーンについて</span><span class="en">About</span></div>
  ${campaign.description_ja ? `<p class="ja" style="font-size:14px;line-height:1.6;color:#444">${h(campaign.description_ja)}</p>` : ''}
  ${campaign.description_en ? `<p class="en" style="font-size:14px;line-height:1.6;color:#444">${h(campaign.description_en)}</p>` : ''}
</div>` : ''}

<div class="card" id="how-it-works-card">
  <button type="button" id="hiw-btn" style="width:100%;background:none;border:none;padding:0;cursor:pointer;text-align:left">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div class="section-title" style="margin-bottom:0">💡 <span class="ja">使い方</span><span class="en">How It Works</span></div>
      <span id="hiw-chevron" style="font-size:18px;color:#86868b;transition:transform .25s">▾</span>
    </div>
  </button>
  <div id="how-it-works" style="display:none;margin-top:14px">
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;gap:12px;align-items:flex-start">
        <div style="background:#007B83;color:#fff;font-weight:700;font-size:13px;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">1</div>
        <div>
          <div style="font-weight:600;font-size:14px"><span class="ja">🏃 このアスリートが走る・漕ぐ・泳ぐ</span><span class="en">🏃 The athlete runs, rides or swims</span></div>
          <div class="ja" style="font-size:13px;color:#86868b;margin-top:2px">このページには<strong>このアスリート</strong>の活動と走行距離が表示されます。StravaがすべてのKmを自動追跡します。</div>
          <div class="en" style="font-size:13px;color:#86868b;margin-top:2px">This page shows <strong>this athlete's</strong> activities and distance. Strava tracks every km automatically.</div>
        </div>
      </div>
      <div style="display:flex;gap:12px;align-items:flex-start">
        <div style="background:#007B83;color:#fff;font-weight:700;font-size:13px;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">2</div>
        <div>
          <div style="font-weight:600;font-size:14px"><span class="ja">💳 あなたが寄付を申し込む</span><span class="en">💳 You make a pledge</span></div>
          <div class="ja" style="font-size:13px;color:#86868b;margin-top:2px">定額または距離連動（例：1kmあたり¥10）で申し込めます。匿名での寄付も可能です。</div>
          <div class="en" style="font-size:13px;color:#86868b;margin-top:2px">Pledge a flat amount or a per-km rate (e.g. ¥10 per km). You can donate anonymously if you prefer.</div>
        </div>
      </div>
      <div style="display:flex;gap:12px;align-items:flex-start">
        <div style="background:#007B83;color:#fff;font-weight:700;font-size:13px;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">3</div>
        <div>
          <div style="font-weight:600;font-size:14px"><span class="ja">✅ 寄付が届く</span><span class="en">✅ Your donation goes to the charity</span></div>
          <div class="ja" style="font-size:13px;color:#86868b;margin-top:2px">定額寄付はすぐに請求されます。距離連動はキャンペーン終了後に<strong>このアスリート</strong>の総走行距離をもとに請求されます。</div>
          <div class="en" style="font-size:13px;color:#86868b;margin-top:2px">Flat donations charge immediately. Per-km pledges charge at campaign end based on <strong>this athlete's</strong> total distance — not the combined total of all participants.</div>
        </div>
      </div>
    </div>
  </div>
</div>

<div class="card">
  <div class="section-title"><span class="ja">寄付を申し込む</span><span class="en">Pledge to Donate</span></div>

  <form id="pledge-form" onsubmit="return false">
    <label><span class="ja">お名前</span><span class="en">Your Name</span></label>
    <input id="donor-name" type="text" placeholder="山田 太郎">

    <label><span class="ja">メールアドレス</span><span class="en">Email</span></label>
    <input id="donor-email" type="email" placeholder="taro@example.com">

    <label style="margin-top:16px"><span class="ja">通貨</span><span class="en">Currency</span></label>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button type="button" class="curr-btn active" data-currency="jpy">🇯🇵 JPY ¥</button>
      <button type="button" class="curr-btn" data-currency="usd">🇺🇸 USD $</button>
      <button type="button" class="curr-btn" data-currency="aud">🇦🇺 AUD A$</button>
    </div>

    <label style="margin-top:16px"><span class="ja">寄付の種類</span><span class="en">Donation Type</span></label>
    <div class="type-tabs">
      ${campaign.has_flat_donation ? `<button type="button" class="type-tab active" data-type="flat">💴 <span class="ja">定額寄付</span><span class="en">Flat Donation</span><br><span style="font-size:11px;font-weight:400"><span class="ja">Flat Donation</span><span class="en">Charged immediately</span></span></button>` : ''}
      ${campaign.has_per_km_donation ? `<button type="button" class="type-tab${!campaign.has_flat_donation ? ' active' : ''}" data-type="perkm">🚴 <span class="ja">距離連動</span><span class="en">Per-km Pledge</span><br><span style="font-size:11px;font-weight:400"><span class="ja">Per-km Pledge</span><span class="en">Charged at campaign end</span></span></button>` : ''}
    </div>

    ${campaign.has_flat_donation ? `
    <div class="donation-panel active" id="panel-flat">
      <div style="font-size:12px;color:#86868b;margin-bottom:8px">
        <span class="ja">⚡ 申し込み後すぐに請求されます</span><span class="en">⚡ Your card is charged immediately on pledge</span>
      </div>
      <input id="flat-amount" type="number" placeholder="3000" min="100" step="1">
      <div id="flat-amount-hint" style="font-size:12px;color:#86868b;margin-top:4px"><span class="ja">円（¥100以上）</span><span class="en">JPY (¥100 minimum)</span></div>
    </div>` : ''}

    ${campaign.has_per_km_donation ? `
    <div class="donation-panel${!campaign.has_flat_donation ? ' active' : ''}" id="panel-perkm">
      <div style="font-size:12px;color:#86868b;margin-bottom:8px">
        <span class="ja">🕐 キャンペーン終了後に請求されます — <strong>このアスリート</strong>の走行距離 × あなたのレート${campaign.max_distance_km ? `（上限 ${campaign.max_distance_km} km）` : ''}</span>
        <span class="en">🕐 Charged after campaign ends · <strong>this athlete's</strong> distance × your rate${campaign.max_distance_km ? ` (max ${campaign.max_distance_km} km cap)` : ''}</span>
      </div>
      <div id="rate-grid" class="rate-grid">
        ${(campaign.suggested_per_km_jpy ?? [10,20,50]).map((r: number) =>
          `<button type="button" class="rate-btn" data-rate="${r}">¥${r}/km</button>`
        ).join('')}
        <button type="button" class="rate-btn" data-rate="-1" id="btn-other"><span class="ja">その他</span><span class="en">Other</span></button>
      </div>
      <div id="custom-rate-row" style="display:none;align-items:center;gap:6px;margin-top:10px;flex-wrap:wrap">
        <span id="custom-rate-sym" style="font-size:14px;color:#444">¥</span>
        <input id="custom-rate" type="number" placeholder="30" min="1"
          style="width:72px;padding:6px 8px;border:2px solid #007B83;border-radius:8px;font-size:14px;font-weight:600;color:#1d1d1f;outline:none;-moz-appearance:textfield">
        <span style="font-size:14px;color:#444">/km</span>
      </div>
      <div class="calc-box" id="calc-box" style="display:none">
        <span class="ja">現在 </span><span id="calc-km">0</span> km × <span id="calc-curr-sym">¥</span><span id="calc-rate">0</span>/km = <strong id="calc-total">¥0</strong>
        ${campaign.max_distance_km ? `<br><small style="color:#86868b"><span class="ja">（上限 ${campaign.max_distance_km} km 適用）</span><span class="en">(max ${campaign.max_distance_km} km cap applies)</span></small>` : ''}
      </div>
    </div>` : ''}

    <label style="display:flex;align-items:center;gap:10px;margin-top:20px;cursor:pointer;font-size:14px;color:#444;user-select:none">
      <input type="checkbox" id="anon-check" style="width:18px;height:18px;accent-color:#007B83;cursor:pointer;flex-shrink:0">
      <span><span class="ja">匿名で寄付する</span><span class="en">Donate anonymously</span><br><span style="font-size:11px;color:#86868b"><span class="ja">キャンペーン作成者にお名前は表示されません</span><span class="en">Your name won't be shown to the campaign creator</span></span></span>
    </label>

    <label style="margin-top:20px"><span class="ja">カード情報</span><span class="en">Payment Card</span></label>
    ${stripeKey.startsWith('pk_test_') ? `
    <div class="test-banner">
      🧪 <strong><span class="ja">テストモード</span><span class="en">Test Mode</span></strong><br>
      <span class="ja">実際のカードは使用できません。以下のテストカードをご利用ください：</span><span class="en">Real cards won't work. Use this test card:</span><br>
      <strong>4242 4242 4242 4242</strong> · Exp: <span class="ja">任意の将来の日付</span><span class="en">any future date</span> · CVC: <span class="ja">任意3桁</span><span class="en">any 3 digits</span>
    </div>` : ''}
    <div class="stripe-element" id="card-element"></div>
    <div class="error-msg" id="card-error"></div>

    <label id="tip-row" style="display:flex;align-items:center;gap:10px;margin-top:14px;cursor:pointer;font-size:14px;color:#444;user-select:none">
      <input type="checkbox" id="tip-check" style="width:18px;height:18px;accent-color:#007B83;cursor:pointer;flex-shrink:0">
      <span>
        <span class="ja">チャリアスをサポートする</span><span class="en">Support CharityAthletes</span>
        (<span id="tip-label">+¥100</span>)<br>
        <span style="font-size:11px;color:#86868b"><span class="ja">チャリアスは手数料ゼロ。チップでサービスを維持しています。</span><span class="en">CharityAthletes charges no platform fee — tips keep it running.</span></span>
      </span>
    </label>

    <div style="font-size:11px;color:#86868b;margin-top:10px;line-height:1.5">
      <span class="ja">🔒 カード情報はStripeにより安全に処理されます。<br>
      定額寄付はすぐに請求されます。距離連動はキャンペーン終了後にこのアスリートの走行距離をもとに請求されます。</span>
      <span class="en">🔒 Your card details are securely processed by Stripe.<br>
      Flat donations are charged immediately. Per-km pledges are charged after the campaign ends based on this athlete's distance.</span>
    </div>

    <button type="button" class="btn" id="pledge-btn"><span class="ja">寄付を申し込む</span><span class="en">Pledge to Donate</span></button>
  </form>

  <div class="success-box" id="success-box">
    <h3>✅ <span class="ja">申し込み完了！</span><span class="en">Done!</span></h3>
    <p><span class="ja">ご支援ありがとうございます。<br>キャンペーン終了後にメールをお送りします。</span><span class="en">Thank you for your support!</span></p>
  </div>
</div>

<div style="text-align:center;padding:24px;font-size:12px;color:#86868b;display:flex;align-items:center;justify-content:center;gap:8px">
  <img src="/static/logo.png" alt="" style="width:20px;height:20px;border-radius:5px;opacity:.6">
  Powered by <strong><span class="ja">チャリアス</span><span class="en">Charity Athletes</span></strong>
</div>

<script>
// ── Global error capture (must be first) ──────────────────────────────────
window.addEventListener('error', function(ev) {
  var el = document.getElementById('loading') || document.getElementById('activities');
  if (el) el.innerHTML = '<p style="color:#ff3b30;font-size:12px;padding:8px">JS Error: ' + ev.message + ' (L' + ev.lineno + ')</p>';
});
window.addEventListener('unhandledrejection', function(ev) {
  var el = document.getElementById('loading') || document.getElementById('activities');
  if (el) el.innerHTML = '<p style="color:#ff3b30;font-size:12px;padding:8px">Async Error: ' + (ev.reason && ev.reason.message ? ev.reason.message : ev.reason) + '</p>';
});

// ── Language toggle ────────────────────────────────────────────────────────
var currentLang = 'ja';
function t(ja, en) { return currentLang === 'en' ? en : ja; }
function applyLang(l) {
  currentLang = l;
  if (l === 'en') document.documentElement.classList.add('lang-en');
  else document.documentElement.classList.remove('lang-en');
  var jBtn = document.getElementById('btn-lang-ja');
  var eBtn = document.getElementById('btn-lang-en');
  if (jBtn) jBtn.classList.toggle('active', l === 'ja');
  if (eBtn) eBtn.classList.toggle('active', l === 'en');
  try { localStorage.setItem('ca_lang', l); } catch(ex) {}
}

// ── How it works toggle ────────────────────────────────────────────────────
function toggleHowItWorks() {
  var el = document.getElementById('how-it-works');
  var ch = document.getElementById('hiw-chevron');
  var open = el.style.display === 'block';
  el.style.display = open ? 'none' : 'block';
  ch.style.transform = open ? '' : 'rotate(180deg)';
}

// ── Constants ──────────────────────────────────────────────────────────────
const CAMPAIGN_ID = '${campaignId}';
const ATHLETE_ID  = '${athleteId}';
const API = '${apiBase}';

// ── Currency config ────────────────────────────────────────────────────────
var CURRENCY = {
  jpy: { sym:'¥',  name:'JPY', flatMin:100, flatPlaceholder:'3000',
         flatHint: function() { return t('円（¥100以上）','JPY (¥100 minimum)'); },
         kmRates:[10,20,50],
         kmLabel: function(r) { return '¥'+r+'/km'; },
         rateDisplay: function(r) { return String(r); },
         calcTotal: function(km,r) { return '¥'+Math.round(km*r).toLocaleString(); },
         tipAmt:100, tipLabel:'+¥100',
         toStripe: function(v) { return v; } },
  usd: { sym:'$',  name:'USD', flatMin:1,   flatPlaceholder:'20',
         flatHint: function() { return 'USD ($1 minimum)'; },
         kmRates:[10,25,50],
         kmLabel: function(r) { return '$'+(r/100).toFixed(2)+'/km'; },
         rateDisplay: function(r) { return (r/100).toFixed(2); },
         calcTotal: function(km,r) { return '$'+(km*r/100).toFixed(2); },
         tipAmt:1, tipLabel:'+$1',
         toStripe: function(v) { return v*100; } },
  aud: { sym:'A$', name:'AUD', flatMin:1,   flatPlaceholder:'20',
         flatHint: function() { return 'AUD (A$1 minimum)'; },
         kmRates:[10,25,50],
         kmLabel: function(r) { return 'A$'+(r/100).toFixed(2)+'/km'; },
         rateDisplay: function(r) { return (r/100).toFixed(2); },
         calcTotal: function(km,r) { return 'A$'+(km*r/100).toFixed(2); },
         tipAmt:1, tipLabel:'+A$1',
         toStripe: function(v) { return v*100; } },
};

// ── State (declared BEFORE Stripe init so functions always have access) ────
var currentCurrency = 'jpy';
let currentRate = 0;
let currentKm   = 0;
let currentType = '${campaign.has_flat_donation ? 'flat' : 'perkm'}';
let maxKm       = ${campaign.max_distance_km ?? 'null'};
let stripe      = null;
let cardEl      = null;

// ── UI functions ───────────────────────────────────────────────────────────

function selectRate(rate, btn) {
  document.querySelectorAll('.rate-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const customRow  = document.getElementById('custom-rate-row');
  const customInput = document.getElementById('custom-rate');
  const calcBox    = document.getElementById('calc-box');
  if (rate === -1) {
    if (customRow)  { customRow.style.display = 'flex'; }
    if (customInput){ customInput.value = ''; customInput.focus(); }
    currentRate = 0;
    // Show calc preview so donor knows what to expect
    if (calcBox) {
      calcBox.style.display = 'block';
      const safeKm = (isNaN(currentKm) || currentKm == null) ? 0 : currentKm;
      const km = maxKm ? Math.min(safeKm, maxKm) : safeKm;
      document.getElementById('calc-km').textContent    = km.toFixed(1);
      document.getElementById('calc-rate').textContent  = '?';
      document.getElementById('calc-total').textContent = '¥?';
    }
  } else {
    if (customRow)  customRow.style.display = 'none';
    currentRate = rate;
    updateCalc();
  }
}

function onCustomRate(val) {
  currentRate = parseInt(val) || 0;
  updateCalc();
}

function updateFlatCalc() {}

function selectCurrency(currency) {
  currentCurrency = currency;
  var cfg = CURRENCY[currency];
  // Update currency buttons
  document.querySelectorAll('.curr-btn').forEach(function(b) { b.classList.remove('active'); });
  var activeBtn = document.querySelector('[data-currency="'+currency+'"]');
  if (activeBtn) activeBtn.classList.add('active');
  // Update flat panel min/placeholder/hint
  var flatInput = document.getElementById('flat-amount');
  var flatHint  = document.getElementById('flat-amount-hint');
  if (flatInput) { flatInput.min = cfg.flatMin; flatInput.placeholder = cfg.flatPlaceholder; flatInput.value = ''; }
  if (flatHint)  flatHint.textContent = cfg.flatHint();
  // Rebuild per-km rate buttons
  var rateGrid = document.getElementById('rate-grid');
  if (rateGrid) {
    rateGrid.innerHTML = cfg.kmRates.map(function(r) {
      return '<button type="button" class="rate-btn" data-rate="'+r+'">'+cfg.kmLabel(r)+'</button>';
    }).join('') + '<button type="button" class="rate-btn" data-rate="-1" id="btn-other">'+t('その他','Other')+'</button>';
  }
  // Update currency symbols in custom rate row and calc box
  var sym = document.getElementById('custom-rate-sym');
  if (sym) sym.textContent = cfg.sym;
  var calcSym = document.getElementById('calc-curr-sym');
  if (calcSym) calcSym.textContent = cfg.sym;
  // Update tip label
  var tipLabel = document.getElementById('tip-label');
  if (tipLabel) tipLabel.textContent = cfg.tipLabel;
  // Reset rate selection and hide calc
  currentRate = 0;
  var calcBox = document.getElementById('calc-box');
  if (calcBox) calcBox.style.display = 'none';
}

function selectType(type, btn) {
  currentType = type;
  // Update tab highlight
  document.querySelectorAll('.type-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // Show/hide panels directly (bypasses any CSS specificity issues)
  const flatPanel  = document.getElementById('panel-flat');
  const perkmPanel = document.getElementById('panel-perkm');
  if (flatPanel)  flatPanel.style.display  = (type === 'flat')  ? 'block' : 'none';
  if (perkmPanel) perkmPanel.style.display = (type === 'perkm') ? 'block' : 'none';
  // Tip only applies to flat (immediate) donations
  var tipRow = document.getElementById('tip-row');
  if (tipRow) tipRow.style.display = (type === 'flat') ? 'flex' : 'none';
  // Auto-select first rate when switching to per-km
  if (type === 'perkm' && currentRate === 0) {
    const firstRateBtn = document.querySelector('#panel-perkm .rate-btn:not(#btn-other)');
    if (firstRateBtn) firstRateBtn.click();
  }
}

// ── HTML escape ────────────────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Polyline decoder (Google encoded polyline algorithm) ───────────────────
function decodePolyline(str) {
  var idx=0, lat=0, lng=0, coords=[];
  while (idx < str.length) {
    var b, shift=0, result=0;
    do { b=str.charCodeAt(idx++)-63; result|=(b&0x1f)<<shift; shift+=5; } while(b>=0x20);
    lat += (result&1) ? ~(result>>1) : (result>>1);
    shift=0; result=0;
    do { b=str.charCodeAt(idx++)-63; result|=(b&0x1f)<<shift; shift+=5; } while(b>=0x20);
    lng += (result&1) ? ~(result>>1) : (result>>1);
    coords.push([lat/1e5, lng/1e5]);
  }
  return coords;
}

// ── Route map renderer (Leaflet) ───────────────────────────────────────────
var leafletMaps = {};
function renderMap(id, polyline) {
  if (leafletMaps[id] || !polyline) return;
  var coords = decodePolyline(polyline);
  if (coords.length < 2) return;
  var map = L.map(id, { zoomControl:false, attributionControl:false, dragging:false,
                         scrollWheelZoom:false, touchZoom:false, doubleClickZoom:false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  var poly = L.polyline(coords, { color:'#007B83', weight:3, opacity:0.9 }).addTo(map);
  L.circleMarker(coords[0],              { radius:5, fillColor:'#2E7D32', color:'#fff', weight:2, fillOpacity:1 }).addTo(map);
  L.circleMarker(coords[coords.length-1],{ radius:5, fillColor:'#007B83', color:'#fff', weight:2, fillOpacity:1 }).addTo(map);
  map.fitBounds(poly.getBounds().pad(0.15));
  leafletMaps[id] = map;
}

// ── Activity expand / collapse ─────────────────────────────────────────────
var activityData = {};
function toggleActivity(id) {
  var detail  = document.getElementById('detail-'+id);
  var chevron = document.getElementById('chev-'+id);
  if (!detail) return;
  var isOpen = detail.style.display === 'block';
  // close all others first
  document.querySelectorAll('[id^="detail-"]').forEach(function(d) { d.style.display='none'; });
  document.querySelectorAll('[id^="chev-"]').forEach(function(c) { c.style.transform=''; });
  if (!isOpen) {
    detail.style.display = 'block';
    if (chevron) chevron.style.transform = 'rotate(180deg)';
    var d = activityData[id];
    if (d && d.polyline) {
      setTimeout(function() { renderMap('map-'+id, d.polyline); }, 60);
    }
  }
}

// Load live data
async function loadData() {
  try {
    const res  = await fetch(API + '/c/' + CAMPAIGN_ID + '/data' + (ATHLETE_ID ? '?a=' + ATHLETE_ID : ''));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    currentKm  = isNaN(data.totalKm) ? 0 : (data.totalKm || 0);

    document.getElementById('stat-km').textContent     = currentKm.toFixed(1) + ' km';
    document.getElementById('stat-donors').textContent = data.donorCount ?? 0;
    document.getElementById('stat-total').textContent  = '¥' + (data.estimatedTotal ?? 0).toLocaleString();

    const actEl = document.getElementById('activities');
    var hintEl = document.getElementById('activities-hint');
    if (!data.activities.length) {
      if (hintEl) hintEl.style.display = 'none';
      actEl.innerHTML = '<p style="color:#86868b;font-size:14px;text-align:center;padding:16px">'
        + '<span class="ja">まだ活動がありません</span><span class="en">No activities yet during this campaign</span></p>';
    } else {
      var hasAnyDetail = data.activities.some(function(a) {
        return (a.map_polyline && a.map_polyline.length > 10) || (a.photo_urls && a.photo_urls.length > 0);
      });
      if (hintEl) hintEl.style.display = hasAnyDetail ? 'block' : 'none';
      activityData = {};
      actEl.innerHTML = data.activities.map(a => {
        const km       = (a.distance_meters / 1000).toFixed(1);
        const mins     = Math.floor(a.moving_time_seconds / 60);
        const time     = mins >= 60 ? Math.floor(mins/60)+'h '+(mins%60)+'m' : mins+'m';
        const dateJa   = new Date(a.start_date).toLocaleDateString('ja-JP', {month:'short', day:'numeric'});
        const dateEn   = new Date(a.start_date).toLocaleDateString('en-US', {month:'short', day:'numeric'});
        const datePart = '<span class="ja">'+dateJa+'</span><span class="en">'+dateEn+'</span>';
        const icon     = a.sport_type.includes('Ride') ? '🚴' : a.sport_type.includes('Run') ? '🏃' : a.sport_type.includes('Swim') ? '🏊' : '🚶';
        const hasMap    = !!(a.map_polyline && a.map_polyline.length > 10);
        const hasPhotos = !!(a.photo_urls && a.photo_urls.length > 0);
        const hasDetail = hasMap || hasPhotos;

        activityData[a.id] = { polyline: a.map_polyline || '', photos: a.photo_urls || [] };

        const safeName = esc(a.name);
        const header = '<div class="activity-row"'
          + (hasDetail ? ' data-act-id="'+a.id+'" style="cursor:pointer;border-bottom:none"' : '')
          + '>'
          + '<div class="activity-icon">'+icon+'</div>'
          + '<div class="activity-info">'
          + '<div class="activity-name">'+safeName+'</div>'
          + '<div class="activity-meta">'+datePart+' · '+time+'</div>'
          + '</div>'
          + '<div style="display:flex;align-items:center;gap:6px">'
          + '<div class="activity-dist">'+km+' km</div>'
          + (hasDetail ? '<span id="chev-'+a.id+'" style="font-size:16px;color:#86868b;transition:transform .25s">▾</span>' : '')
          + '</div>'
          + '</div>';

        const mapHtml = hasMap
          ? '<div id="map-'+a.id+'" style="height:200px;background:#e8f5f9"></div>'
          : '';
        const photosHtml = hasPhotos
          ? '<div style="display:flex;gap:8px;overflow-x:auto;padding:10px 12px;-webkit-overflow-scrolling:touch">'
            + a.photo_urls.map(url =>
                '<img src="'+url+'" style="width:160px;height:110px;object-fit:cover;border-radius:8px;flex-shrink:0" loading="lazy">'
              ).join('')
            + '</div>'
          : '';
        const detail = hasDetail
          ? '<div id="detail-'+a.id+'" style="display:none;border-top:1px solid #f0f0f0">'
            + mapHtml + photosHtml + '</div>'
          : '';

        return '<div style="border:1px solid #eee;border-radius:12px;margin-bottom:10px;overflow:hidden;background:#fff">'
          + header + detail + '</div>';
      }).join('');
    }
    updateCalc();
  } catch(e) {
    console.error('[loadData]', e);
    var loadEl = document.getElementById('loading');
    if (loadEl) loadEl.innerHTML = '<span class="ja">読み込み失敗</span><span class="en">Failed to load</span>';
    var actEl2 = document.getElementById('activities');
    if (actEl2 && !loadEl) actEl2.innerHTML = '<p style="color:#ff3b30;font-size:14px;text-align:center;padding:16px"><span class="ja">読み込みに失敗しました</span><span class="en">Failed to load</span></p>';
  }
}

function updateCalc() {
  const calcBox = document.getElementById('calc-box');
  if (!calcBox || currentRate === 0) { if(calcBox) calcBox.style.display='none'; return; }
  calcBox.style.display = 'block';
  const safeKm = (isNaN(currentKm) || currentKm == null) ? 0 : currentKm;
  const km = maxKm ? Math.min(safeKm, maxKm) : safeKm;
  var cfg = CURRENCY[currentCurrency];
  document.getElementById('calc-km').textContent       = km.toFixed(1);
  document.getElementById('calc-curr-sym').textContent = cfg.sym;
  document.getElementById('calc-rate').textContent     = cfg.rateDisplay(currentRate);
  document.getElementById('calc-total').textContent    = cfg.calcTotal(km, currentRate);
}

async function submitPledge() {
  const name  = document.getElementById('donor-name').value.trim();
  const email = document.getElementById('donor-email').value.trim();

  if (!name)  return alert('お名前を入力してください / Please enter your name');
  if (!email) return alert('メールアドレスを入力してください / Please enter your email');
  const emailOk = email.indexOf('@') > 0 && email.lastIndexOf('.') > email.indexOf('@') + 1 && !email.includes(' ');
  if (!emailOk) return alert('有効なメールアドレスを入力してください（例: taro@example.com）\\nPlease enter a valid email address (e.g. taro@example.com)');

  var cfg = CURRENCY[currentCurrency];
  let flat = null;
  let rate = null;

  if (currentType === 'flat') {
    const flatEl = document.getElementById('flat-amount');
    flat = flatEl ? (parseInt(flatEl.value) || null) : null;
    if (!flat || flat < cfg.flatMin) return alert(t('金額を入力してください（最低'+cfg.flatMin+'）', 'Please enter an amount (minimum '+cfg.flatMin+')'));
  } else {
    rate = currentRate;
    if (!rate || rate < 1) return alert(t('1kmあたりのレートを選択してください', 'Please select a per-km rate'));
  }

  const tipCheck = document.getElementById('tip-check');
  const tipAmount = (currentType === 'flat' && tipCheck && tipCheck.checked) ? cfg.tipAmt : null;

  if (!stripe || !cardEl) return alert('カード決済システムを読み込めませんでした。ページを再読み込みしてください。 Card system failed to load. Please refresh the page.');

  const btn = document.getElementById('pledge-btn');
  btn.disabled = true;
  btn.textContent = '処理中… / Processing…';

  const errEl = document.getElementById('card-error');
  errEl.style.display = 'none';

  try {
    // Create pledge — backend returns client_secret + type ('payment' | 'setup')
    const pledgeRes = await fetch(API + '/c/' + CAMPAIGN_ID + '/pledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        donor_name:       name,
        donor_email:      email,
        flat_amount_jpy:  flat,
        per_km_rate_jpy:  rate,
        currency:         currentCurrency,
        tip_amount:       tipAmount,
        is_anonymous:     !!(document.getElementById('anon-check') && document.getElementById('anon-check').checked),
        athlete_user_id:  ATHLETE_ID || null,
      }),
    });
    const pledgeData = await pledgeRes.json();
    if (!pledgeRes.ok) throw new Error(pledgeData.error || 'Pledge failed');

    let intentId;

    if (pledgeData.type === 'payment') {
      // Flat donation — charge immediately
      const { paymentIntent, error } = await stripe.confirmCardPayment(pledgeData.client_secret, {
        payment_method: { card: cardEl, billing_details: { name, email } }
      });
      if (error) throw new Error(error.message);
      intentId = paymentIntent.id;
    } else {
      // Per-km — save card for later charge
      const { setupIntent, error } = await stripe.confirmCardSetup(pledgeData.client_secret, {
        payment_method: { card: cardEl, billing_details: { name, email } }
      });
      if (error) throw new Error(error.message);
      intentId = setupIntent.id;
    }

    // Confirm in backend
    await fetch(API + '/c/' + CAMPAIGN_ID + '/pledge/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent_id: intentId }),
    });

    // Show appropriate success message
    const successBox = document.getElementById('success-box');
    successBox.innerHTML = pledgeData.type === 'payment'
      ? '<h3>✅ 寄付完了！</h3><p>ご支援ありがとうございます。カードへの請求が完了しました。<br><br>Thank you! Your donation has been charged.</p>'
      : "<h3>✅ 申し込み完了！</h3><p>ご支援ありがとうございます。<br>キャンペーン終了後、アスリートの走行距離に応じて請求されます。<br><br>Thank you! Your card will be charged at campaign end based on the athlete's total distance.</p>";

    document.getElementById('pledge-form').style.display = 'none';
    successBox.style.display = 'block';
    loadData();
  } catch(e) {
    const msg = e.message || String(e);
    console.error('[Pledge error]', msg);
    errEl.textContent = msg;
    errEl.style.display = 'block';
    alert('エラー / Error: ' + msg);
    btn.disabled = false;
    btn.textContent = '寄付を申し込む / Pledge';
  }
}

// ── Stripe initialisation (last, in try-catch so UI still works if it fails) ─
if (typeof Stripe === 'undefined') {
  const el = document.getElementById('card-element');
  if (el) el.innerHTML = '<p style="color:#ff3b30;font-size:13px;padding:4px">Stripe.js の読み込みに失敗しました。ページを再読み込みしてください。<br>Stripe.js failed to load — please refresh.</p>';
} else {
  try {
    stripe = Stripe('${stripeKey}');
    const elements = stripe.elements();
    cardEl = elements.create('card', {
      style: {
        base: {
          fontSize: '16px',
          color: '#1d1d1f',
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          '::placeholder': { color: '#adb5bd' },
        }
      },
      hidePostalCode: true,
    });
    cardEl.mount('#card-element');
  } catch(e) {
    console.error('Stripe init failed:', e);
    const el = document.getElementById('card-element');
    if (el) el.innerHTML = '<p style="color:#ff3b30;font-size:13px;padding:4px">カード決済の読み込みに失敗しました。ページを再読み込みください。<br>Card payment failed to load. Please refresh the page.</p>';
  }
}

// Wire pledge button
var pledgeBtn = document.getElementById('pledge-btn');
if (pledgeBtn) pledgeBtn.addEventListener('click', function() { submitPledge(); });

// Wire How It Works toggle (event listener — no onclick needed)
var hiwBtn = document.getElementById('hiw-btn');
if (hiwBtn) hiwBtn.addEventListener('click', toggleHowItWorks);

// Wire language buttons
var langJaBtn = document.getElementById('btn-lang-ja');
var langEnBtn = document.getElementById('btn-lang-en');
if (langJaBtn) langJaBtn.addEventListener('click', function() { applyLang('ja'); });
if (langEnBtn) langEnBtn.addEventListener('click', function() { applyLang('en'); });

// All button clicks via event delegation
document.addEventListener('click', function(e) {
  // Activity row expand/collapse
  var actRow = e.target.closest('[data-act-id]');
  if (actRow) { toggleActivity(actRow.dataset.actId); return; }

  var currBtn = e.target.closest('[data-currency]');
  if (currBtn) { selectCurrency(currBtn.dataset.currency); return; }

  var tab = e.target.closest('[data-type]');
  if (tab) { selectType(tab.dataset.type, tab); return; }

  var rateBtn = e.target.closest('[data-rate]');
  if (rateBtn) { selectRate(parseInt(rateBtn.dataset.rate, 10), rateBtn); return; }
});

// Wire up custom rate input (avoids CSP issues with inline oninput)
var customRateInput = document.getElementById('custom-rate');
if (customRateInput) {
  customRateInput.addEventListener('input', function() {
    onCustomRate(this.value);
  });
}

// Init language button state from localStorage
(function() {
  try {
    var saved = localStorage.getItem('ca_lang') || 'ja';
    currentLang = saved;
    var jBtn = document.getElementById('btn-lang-ja');
    var eBtn = document.getElementById('btn-lang-en');
    if (jBtn) jBtn.classList.toggle('active', saved === 'ja');
    if (eBtn) eBtn.classList.toggle('active', saved === 'en');
  } catch(ex) {
    currentLang = 'ja';
    var jBtn2 = document.getElementById('btn-lang-ja');
    if (jBtn2) jBtn2.classList.add('active');
  }
}());

loadData();
</script>
</body>
</html>`;
}
