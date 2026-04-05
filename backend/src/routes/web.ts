import { Router, Request, Response } from 'express';
import { db } from '../config/supabase';
import Stripe from 'stripe';
import { z } from 'zod';

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

  // Fetch athlete profile separately
  let athlete = null;
  if (campaign.created_by) {
    const { data } = await db.from('user_profiles').select('display_name, avatar_url').eq('user_id', campaign.created_by).single();
    athlete = data;
  }
  (campaign as any).user_profiles = athlete;

  const stripeKey = process.env.STRIPE_PUBLISHABLE_KEY ?? '';
  const apiBase  = process.env.APP_URL?.startsWith('http')
    ? process.env.APP_URL
    : `http://${req.headers.host}`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(renderPage(campaign, stripeKey, apiBase, req.params.id));
});

// ── GET /c/:id/data — JSON for the page ──────────────────────────────────────

router.get('/:id/data', async (req: Request, res: Response) => {
  const { data: campaign } = await db
    .from('campaigns')
    .select('*, nonprofits(name_ja, name_en), user_profiles!campaigns_created_by_fkey(display_name)')
    .eq('id', req.params.id).single();

  if (!campaign) return res.status(404).json({ error: 'Not found' });

  const [{ data: activities }, { data: pledges }] = await Promise.all([
    db.from('activities')
      .select('id, name, sport_type, distance_meters, start_date, moving_time_seconds')
      .eq('user_id', campaign.created_by)
      .in('sport_type', campaign.sport_types ?? [])
      .gte('start_date', campaign.start_date ?? '')
      .lte('start_date', campaign.end_date ?? new Date().toISOString())
      .order('start_date', { ascending: false })
      .limit(20),
    db.from('donor_pledges')
      .select('flat_amount_jpy, per_km_rate_jpy, status')
      .eq('campaign_id', req.params.id)
      .in('status', ['confirmed', 'charged']),
  ]);

  const totalKm = (activities ?? []).reduce((s, a) => s + (a.distance_meters / 1000), 0);
  const totalPledgedFlat = (pledges ?? []).reduce((s, p) => s + (p.flat_amount_jpy ?? 0), 0);
  const totalPledgedPerKm = (pledges ?? []).reduce((s, p) => s + ((p.per_km_rate_jpy ?? 0) * totalKm), 0);

  res.json({
    campaign,
    activities: activities ?? [],
    totalKm: Math.round(totalKm * 10) / 10,
    donorCount: (pledges ?? []).length,
    estimatedTotal: Math.round(totalPledgedFlat + totalPledgedPerKm),
  });
});

// ── POST /c/:id/pledge ────────────────────────────────────────────────────────
// Flat donation  → PaymentIntent  → charged immediately
// Per-km pledge  → SetupIntent    → card saved, charged after campaign ends

const pledgeSchema = z.object({
  donor_name:      z.string().min(1),
  donor_email:     z.string().email(),
  flat_amount_jpy: z.number().int().min(100).nullable().default(null),
  per_km_rate_jpy: z.number().int().min(1).nullable().default(null),
}).refine(d => d.flat_amount_jpy != null || d.per_km_rate_jpy != null, {
  message: 'At least one pledge type required',
}).refine(d => !(d.flat_amount_jpy != null && d.per_km_rate_jpy != null), {
  message: 'Choose one pledge type only',
});

router.post('/:id/pledge', async (req: Request, res: Response) => {
  const parsed = pledgeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { donor_name, donor_email, flat_amount_jpy, per_km_rate_jpy } = parsed.data;
  const isFlat = flat_amount_jpy != null;

  // Create Stripe customer
  const customer = await stripe.customers.create({
    name:  donor_name,
    email: donor_email,
    metadata: { campaign_id: req.params.id },
  });

  if (isFlat) {
    // ── Flat: charge immediately via PaymentIntent ───────────────────────────
    const paymentIntent = await stripe.paymentIntents.create({
      amount:   flat_amount_jpy!,
      currency: 'jpy',
      customer: customer.id,
      payment_method_types: ['card'],
      metadata: { campaign_id: req.params.id, donor_name, donor_email },
    });

    const { error } = await db.from('donor_pledges').insert({
      campaign_id:              req.params.id,
      donor_name,
      donor_email,
      flat_amount_jpy,
      per_km_rate_jpy:          null,
      stripe_customer_id:       customer.id,
      stripe_payment_intent_id: paymentIntent.id,
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
      },
    });

    const { error } = await db.from('donor_pledges').insert({
      campaign_id:             req.params.id,
      donor_name,
      donor_email,
      flat_amount_jpy:         null,
      per_km_rate_jpy,
      stripe_customer_id:      customer.id,
      stripe_setup_intent_id:  setupIntent.id,
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

function renderPage(campaign: any, stripeKey: string, apiBase: string, campaignId: string): string {
  const np   = campaign.nonprofits;
  const athlete = campaign.user_profiles;
  const endDate = new Date(campaign.end_date).toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric' });

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${campaign.title_ja} | チャリアス</title>
  <meta property="og:type"        content="website">
  <meta property="og:title"       content="${campaign.title_ja} | チャリアス (Charity Athletes)">
  <meta property="og:description" content="${campaign.description_ja || campaign.description_en || 'チャリアスのチャリティキャンペーンを応援してください！'}">
  <meta property="og:url"         content="https://charityathletes-production.up.railway.app/c/${campaignId}">
  <meta property="og:image"       content="${np?.logo_url || 'https://charityathletes-production.up.railway.app/static/logo.png'}">
  <meta name="twitter:card"       content="summary_large_image">
  <meta name="twitter:title"      content="${campaign.title_ja} | チャリアス">
  <meta name="twitter:description" content="${campaign.description_ja || campaign.description_en || ''}">
  <script src="https://js.stripe.com/v3/"></script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f7;color:#1d1d1f;min-height:100vh}
    .hero{background:linear-gradient(135deg,#FF6B35,#c0392b);color:#fff;padding:32px 20px 40px}
    .hero h1{font-size:24px;font-weight:700;margin-bottom:6px}
    .hero .sub{opacity:.85;font-size:14px}
    .hero .meta{margin-top:16px;font-size:13px;opacity:.8}
    .card{background:#fff;border-radius:16px;padding:20px;margin:16px;box-shadow:0 2px 12px rgba(0,0,0,.08)}
    .section-title{font-size:13px;font-weight:600;color:#86868b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px}
    .stat-row{display:flex;gap:12px;margin:-8px 16px 0;position:relative;z-index:1}
    .stat{background:#fff;border-radius:14px;padding:16px;flex:1;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.1)}
    .stat .val{font-size:22px;font-weight:700;color:#FF6B35}
    .stat .lbl{font-size:11px;color:#86868b;margin-top:2px}
    .progress-bar{background:#f0f0f0;border-radius:99px;height:8px;margin:10px 0}
    .progress-fill{background:linear-gradient(90deg,#FF6B35,#c0392b);border-radius:99px;height:8px;transition:width .5s}
    .activity-row{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f0f0f0}
    .activity-row:last-child{border-bottom:none}
    .activity-icon{width:36px;height:36px;background:#fff5f0;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
    .activity-info{flex:1}
    .activity-name{font-size:14px;font-weight:500}
    .activity-meta{font-size:12px;color:#86868b}
    .activity-dist{font-size:14px;font-weight:700;color:#FF6B35}
    input,select{width:100%;padding:12px;border:1.5px solid #e0e0e0;border-radius:10px;font-size:15px;margin-top:6px;outline:none;transition:border .2s}
    input:focus,select:focus{border-color:#FF6B35}
    label{font-size:14px;font-weight:500;color:#444;display:block;margin-top:14px}
    .rate-grid{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
    .rate-btn{padding:8px 14px;border:2px solid #FF6B35;border-radius:99px;background:#fff;color:#FF6B35;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s}
    .rate-btn.active{background:#FF6B35;color:#fff}
    .stripe-element{padding:12px 14px;border:1.5px solid #d0d0d0;border-radius:10px;margin-top:8px;min-height:48px;background:#f9f9f9}
    .btn{width:100%;padding:15px;background:linear-gradient(135deg,#FF6B35,#c0392b);color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;margin-top:18px;transition:opacity .2s}
    .btn:disabled{opacity:.5;cursor:not-allowed}
    .success-box{background:#e8f9ee;border:1px solid #34c759;border-radius:12px;padding:20px;text-align:center;display:none}
    .success-box h3{color:#1a8736;font-size:18px;margin-bottom:8px}
    .success-box p{color:#444;font-size:14px}
    .error-msg{color:#ff3b30;font-size:13px;margin-top:8px;display:none}
    .calc-box{background:#fff5f0;border-radius:10px;padding:12px;margin-top:12px;font-size:14px}
    .calc-box strong{color:#FF6B35;font-size:18px}
    .type-tabs{display:flex;gap:8px;margin:12px 0}
    .type-tab{flex:1;padding:12px 8px;border:2px solid #e0e0e0;border-radius:12px;background:#fff;font-size:14px;font-weight:600;cursor:pointer;text-align:center;transition:all .15s;color:#86868b}
    .type-tab.active{border-color:#FF6B35;color:#FF6B35;background:#fff5f0}
    .donation-panel{display:none}
    .donation-panel.active{display:block}
    #loading{text-align:center;padding:40px;color:#86868b}
  </style>
</head>
<body>

<div class="hero">
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
    <img src="/static/logo.png" alt="チャリアス"
         style="width:44px;height:44px;border-radius:10px;object-fit:cover;flex-shrink:0">
    <span style="font-size:14px;font-weight:600;opacity:.9">チャリアス / Charity Athletes</span>
  </div>
  <h1>${campaign.title_ja}</h1>
  ${campaign.title_en !== campaign.title_ja ? `<div class="sub">${campaign.title_en}</div>` : ''}
  <div class="meta" style="display:flex;align-items:center;gap:12px;margin-top:16px">
    ${athlete?.avatar_url
      ? `<img src="${athlete.avatar_url}" alt="${athlete.display_name ?? ''}"
             style="width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,0.6);flex-shrink:0">`
      : `<div style="width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,0.25);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">🏃</div>`
    }
    <div>
      ${athlete?.display_name ? `<div style="font-weight:600;font-size:15px">${athlete.display_name}</div>` : ''}
      ${np ? `<div style="font-size:13px;opacity:.85;margin-top:2px">🏢 ${np.name_ja}</div>` : ''}
      <div style="font-size:12px;opacity:.75;margin-top:2px">📅 ${endDate}まで</div>
    </div>
  </div>
</div>

<div class="stat-row">
  <div class="stat"><div class="val" id="stat-km">…</div><div class="lbl">合計距離</div></div>
  <div class="stat"><div class="val" id="stat-donors">…</div><div class="lbl">サポーター</div></div>
  <div class="stat"><div class="val" id="stat-total">…</div><div class="lbl">寄付見込額</div></div>
</div>

<div class="card" style="margin-top:28px">
  <div class="section-title">活動履歴 / Activities</div>
  <div id="activities"><div id="loading">読み込み中…</div></div>
</div>

${campaign.description_ja ? `
<div class="card">
  <div class="section-title">キャンペーンについて</div>
  <p style="font-size:14px;line-height:1.6;color:#444">${campaign.description_ja}</p>
  ${campaign.description_en && campaign.description_en !== campaign.description_ja
    ? `<p style="font-size:13px;line-height:1.6;color:#86868b;margin-top:8px">${campaign.description_en}</p>` : ''}
</div>` : ''}

<div class="card">
  <div class="section-title">寄付を申し込む / Pledge to Donate</div>

  <form id="pledge-form" onsubmit="return false">
    <label>お名前 / Your Name</label>
    <input id="donor-name" type="text" placeholder="山田 太郎">

    <label>メールアドレス / Email</label>
    <input id="donor-email" type="email" placeholder="taro@example.com">

    <label style="margin-top:16px">寄付の種類 / Donation Type</label>
    <div class="type-tabs">
      ${campaign.has_flat_donation ? `<button type="button" class="type-tab active" data-type="flat">💴 定額寄付<br><span style="font-size:11px;font-weight:400">Flat Donation</span></button>` : ''}
      ${campaign.has_per_km_donation ? `<button type="button" class="type-tab${!campaign.has_flat_donation ? ' active' : ''}" data-type="perkm">🚴 距離連動<br><span style="font-size:11px;font-weight:400">Per-km Pledge</span></button>` : ''}
    </div>

    ${campaign.has_flat_donation ? `
    <div class="donation-panel active" id="panel-flat">
      <div style="font-size:12px;color:#86868b;margin-bottom:8px">
        ⚡ 申し込み後すぐに請求されます<br>Your card is charged immediately on pledge
      </div>
      <input id="flat-amount" type="number" placeholder="例: 3000" min="100">
      <div style="font-size:12px;color:#86868b;margin-top:4px">円 / JPY (¥100以上)</div>
    </div>` : ''}

    ${campaign.has_per_km_donation ? `
    <div class="donation-panel${!campaign.has_flat_donation ? ' active' : ''}" id="panel-perkm">
      <div style="font-size:12px;color:#86868b;margin-bottom:8px">
        🕐 キャンペーン終了後に請求されます — アスリートの距離 × あなたのレート${campaign.max_distance_km ? `（上限 ${campaign.max_distance_km} km）` : ''}<br>
        Charged after campaign ends · athlete's distance × your rate${campaign.max_distance_km ? ` (max ${campaign.max_distance_km} km cap)` : ''}
      </div>
      <div class="rate-grid">
        ${(campaign.suggested_per_km_jpy ?? [10,20,50]).map((r: number) =>
          `<button type="button" class="rate-btn" data-rate="${r}">¥${r}/km</button>`
        ).join('')}
        <button type="button" class="rate-btn" data-rate="-1" id="btn-other">その他</button>
      </div>
      <div id="custom-rate-row" style="display:none;align-items:center;gap:6px;margin-top:10px;flex-wrap:wrap">
        <span style="font-size:14px;color:#444">¥</span>
        <input id="custom-rate" type="number" placeholder="30" min="1"
          style="width:72px;padding:6px 8px;border:2px solid #FF6B35;border-radius:8px;font-size:14px;font-weight:600;color:#1d1d1f;outline:none;-moz-appearance:textfield">
        <span style="font-size:14px;color:#444">/km</span>
      </div>
      <div class="calc-box" id="calc-box" style="display:none">
        現在 <span id="calc-km">0</span> km × ¥<span id="calc-rate">0</span>/km = <strong id="calc-total">¥0</strong>
        ${campaign.max_distance_km ? `<br><small style="color:#86868b">（上限 ${campaign.max_distance_km} km 適用）</small>` : ''}
      </div>
    </div>` : ''}

    <label style="margin-top:20px">カード情報 / Payment Card</label>
    <div class="stripe-element" id="card-element"></div>
    <div class="error-msg" id="card-error"></div>

    <div style="font-size:11px;color:#86868b;margin-top:10px;line-height:1.5">
      🔒 カード情報はStripeにより安全に処理されます。<br>
      定額寄付はすぐに請求されます。距離連動はキャンペーン終了後に請求されます。<br>
      Flat donations are charged immediately. Per-km pledges are charged after the campaign ends.
    </div>

    <button type="button" class="btn" id="pledge-btn" onclick="submitPledge()">寄付を申し込む / Pledge</button>
  </form>

  <div class="success-box" id="success-box">
    <h3>✅ 申し込み完了！</h3>
    <p>ご支援ありがとうございます。<br>キャンペーン終了後にメールをお送りします。<br><br>Thank you for your support!</p>
  </div>
</div>

<div style="text-align:center;padding:24px;font-size:12px;color:#86868b;display:flex;align-items:center;justify-content:center;gap:8px">
  <img src="/static/logo.png" alt="" style="width:20px;height:20px;border-radius:5px;opacity:.6">
  Powered by <strong>チャリアス</strong> · Charity Athletes
</div>

<script>
// ── Constants ──────────────────────────────────────────────────────────────
const CAMPAIGN_ID = '${campaignId}';
const API = '${apiBase}';

// ── State (declared BEFORE Stripe init so functions always have access) ────
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
      const km = maxKm ? Math.min(currentKm, maxKm) : currentKm;
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
  // Auto-select first rate when switching to per-km
  if (type === 'perkm' && currentRate === 0) {
    const firstRateBtn = document.querySelector('#panel-perkm .rate-btn:not(#btn-other)');
    if (firstRateBtn) firstRateBtn.click();
  }
}

// Load live data
async function loadData() {
  try {
    const res  = await fetch(API + '/c/' + CAMPAIGN_ID + '/data');
    const data = await res.json();
    currentKm  = data.totalKm;

    document.getElementById('stat-km').textContent     = data.totalKm.toFixed(1) + ' km';
    document.getElementById('stat-donors').textContent = data.donorCount + '人';
    document.getElementById('stat-total').textContent  = '¥' + data.estimatedTotal.toLocaleString();

    const actEl = document.getElementById('activities');
    if (!data.activities.length) {
      actEl.innerHTML = '<p style="color:#86868b;font-size:14px;text-align:center;padding:16px">まだ活動がありません</p>';
    } else {
      actEl.innerHTML = data.activities.map(a => {
        const km   = (a.distance_meters / 1000).toFixed(1);
        const date = new Date(a.start_date).toLocaleDateString('ja-JP', {month:'short', day:'numeric'});
        const icon = a.sport_type.includes('Ride') ? '🚴' : a.sport_type === 'Run' ? '🏃' : '🏊';
        return '<div class="activity-row">'
          + '<div class="activity-icon">' + icon + '</div>'
          + '<div class="activity-info">'
          + '<div class="activity-name">' + a.name + '</div>'
          + '<div class="activity-meta">' + date + '</div>'
          + '</div>'
          + '<div class="activity-dist">' + km + ' km</div>'
          + '</div>';
      }).join('');
    }
    updateCalc();
  } catch(e) {
    document.getElementById('loading').textContent = '読み込み失敗';
  }
}

function updateCalc() {
  const calcBox = document.getElementById('calc-box');
  if (!calcBox || currentRate === 0) { if(calcBox) calcBox.style.display='none'; return; }
  calcBox.style.display = 'block';
  const km = maxKm ? Math.min(currentKm, maxKm) : currentKm;
  document.getElementById('calc-km').textContent   = km.toFixed(1);
  document.getElementById('calc-rate').textContent = currentRate;
  document.getElementById('calc-total').textContent = '¥' + Math.round(km * currentRate).toLocaleString();
}

async function submitPledge() {
  const name  = document.getElementById('donor-name').value.trim();
  const email = document.getElementById('donor-email').value.trim();

  if (!name)  return alert('お名前を入力してください');
  if (!email) return alert('メールアドレスを入力してください');

  let flat = null;
  let rate = null;

  if (currentType === 'flat') {
    const flatEl = document.getElementById('flat-amount');
    flat = flatEl ? (parseInt(flatEl.value) || null) : null;
    if (!flat || flat < 100) return alert('¥100以上の金額を入力してください');
  } else {
    rate = currentRate;
    if (!rate || rate < 1) return alert('1km あたりのレートを選択してください');
  }

  if (!stripe || !cardEl) return alert('カード決済システムを読み込めませんでした。ページを再読み込みしてください。 Card system failed to load. Please refresh the page.');

  const btn = document.getElementById('pledge-btn');
  btn.disabled = true;
  btn.textContent = '処理中…';

  const errEl = document.getElementById('card-error');
  errEl.style.display = 'none';

  try {
    // Create pledge — backend returns client_secret + type ('payment' | 'setup')
    const pledgeRes = await fetch(API + '/c/' + CAMPAIGN_ID + '/pledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        donor_name:      name,
        donor_email:     email,
        flat_amount_jpy: flat,
        per_km_rate_jpy: rate,
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
    errEl.textContent = e.message;
    errEl.style.display = 'block';
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
    if (el) el.innerHTML = '<p style="color:#ff3b30;font-size:13px;padding:4px">カード決済の読み込みに失敗しました。ページを再読み込みください。</p>';
  }
}

// All button clicks via event delegation
document.addEventListener('click', function(e) {
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

loadData();
</script>
</body>
</html>`;
}
