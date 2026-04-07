import { Router, Request, Response } from 'express';
import { db } from '../config/supabase';
import { stripe } from '../config/stripe';
import { stripeService } from '../services/stripeService';
import { recalcDonatedStats } from '../services/statsService';
import { requireAuth } from '../middleware/auth';
import { z } from 'zod';
import type Stripe from 'stripe';

const router = Router();

// Recount participants directly from campaign_participations — never drifts
async function syncParticipantCount(campaignId: string) {
  const { count } = await db
    .from('campaign_participations')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaignId);
  await db.from('campaigns')
    .update({ participant_count: count ?? 0 })
    .eq('id', campaignId);
}

// GET /campaigns — public campaigns only
router.get('/', async (_req: Request, res: Response) => {
  const { data, error } = await db
    .from('campaigns')
    .select('*, nonprofits(id, name_ja, name_en, description_ja, description_en, logo_url, website_url)')
    .eq('is_active', true)
    .eq('is_public', true)
    .gte('end_date', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /campaigns — athlete creates a campaign
const createSchema = z.object({
  nonprofit_id:         z.string().uuid(),
  title_ja:             z.string().min(1),
  title_en:             z.string().min(1),
  description_ja:       z.string().default(''),
  description_en:       z.string().default(''),
  sport_types:          z.array(z.string()).min(1),
  has_flat_donation:    z.boolean().default(false),
  has_per_km_donation:  z.boolean().default(false),
  max_distance_km:      z.number().int().min(1).nullable().default(null),
  suggested_per_km_jpy: z.array(z.number().int().min(1)).default([10, 20, 50]),
  donorbox_campaign_id: z.string().default(''),
  start_date:           z.string(),
  end_date:             z.string(),
  goal_amount_jpy:      z.number().int().min(0).default(0),
  is_public:            z.boolean().default(false),
}).refine(d => d.has_flat_donation || d.has_per_km_donation, {
  message: 'At least one donation type (flat or per-km) must be enabled',
});

router.post('/', requireAuth, async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const d = parsed.data;
  const { data, error } = await db.from('campaigns').insert({
    created_by:           req.userId,
    nonprofit_id:         d.nonprofit_id,
    title_ja:             d.title_ja,
    title_en:             d.title_en,
    description_ja:       d.description_ja,
    description_en:       d.description_en,
    sport_types:          d.sport_types,
    has_flat_donation:    d.has_flat_donation,
    has_per_km_donation:  d.has_per_km_donation,
    flat_amount_jpy:      d.has_flat_donation ? 1 : null,   // satisfies DB constraint
    per_km_rate_jpy:      d.has_per_km_donation ? 1 : null, // satisfies DB constraint
    max_distance_km:      d.max_distance_km,
    suggested_per_km_jpy: d.suggested_per_km_jpy,
    donorbox_campaign_id: d.donorbox_campaign_id,
    start_date:           d.start_date,
    end_date:             d.end_date,
    goal_amount_jpy:      d.goal_amount_jpy,
    is_public:            d.is_public,
    is_active:            true,
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// GET /campaigns/mine — campaigns the authenticated athlete has joined
// NOTE: must be before /:id to avoid Express matching "mine" as an id
router.get('/mine', requireAuth, async (req: Request, res: Response) => {
  const { data, error } = await db
    .from('campaign_participations')
    .select('total_distance_km, campaigns(*, nonprofits(id, name_ja, name_en, description_ja, description_en, logo_url, website_url))')
    .eq('user_id', req.userId!);

  if (error) return res.status(500).json({ error: error.message });
  const campaigns = (data ?? [])
    .filter((r: any) => r.campaigns)
    .map((r: any) => ({ ...r.campaigns, my_distance_km: r.total_distance_km ?? 0 }));
  res.json(campaigns);
});

// GET /campaigns/created — campaigns created by the authenticated athlete (incl. private)
router.get('/created', requireAuth, async (req: Request, res: Response) => {
  const { data, error } = await db
    .from('campaigns')
    .select('*, nonprofits(id, name_ja, name_en, description_ja, description_en, logo_url, website_url)')
    .eq('created_by', req.userId!)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

// GET /campaigns/:id
router.get('/:id', async (req: Request, res: Response) => {
  const { data, error } = await db
    .from('campaigns')
    .select('*, nonprofits(*)')
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

// GET /campaigns/:id/leaderboard
router.get('/:id/leaderboard', async (req: Request, res: Response) => {
  const { data, error } = await db
    .from('campaign_participations')
    .select('total_donated_jpy, total_distance_km, activity_count, user_profiles(display_name, avatar_url)')
    .eq('campaign_id', req.params.id)
    .order('total_donated_jpy', { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /campaigns/:id/participants — public list of joined athletes
router.get('/:id/participants', async (req: Request, res: Response) => {
  const { data, error } = await db
    .from('campaign_participations')
    .select('user_id, user_profiles(display_name, avatar_url)')
    .eq('campaign_id', req.params.id);

  if (error) return res.status(500).json({ error: error.message });

  const participants = (data ?? []).map((p: any) => ({
    userId:      p.user_id,
    displayName: p.user_profiles?.display_name ?? 'Athlete',
    avatarUrl:   p.user_profiles?.avatar_url ?? null,
  }));
  res.json(participants);
});

// GET /campaigns/:id/pledges — creator sees all; joined athlete sees only their own
router.get('/:id/pledges', requireAuth, async (req: Request, res: Response) => {
  const { data: campaign } = await db
    .from('campaigns').select('created_by').eq('id', req.params.id).single();

  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const isCreator = campaign.created_by === req.userId;

  // Non-creator must be a participant to see their own donor list
  if (!isCreator) {
    const { count } = await db
      .from('campaign_participations')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', req.params.id)
      .eq('user_id', req.userId!);
    if ((count ?? 0) === 0) return res.status(403).json({ error: 'Not a participant' });
  }

  let query = db
    .from('donor_pledges')
    .select('id, donor_name, is_anonymous, flat_amount_jpy, per_km_rate_jpy, status, charged_amount_jpy, athlete_user_id, created_at')
    .eq('campaign_id', req.params.id)
    .order('created_at', { ascending: false });

  // Non-creator only sees pledges assigned to them
  if (!isCreator) query = query.eq('athlete_user_id', req.userId!);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

// POST /campaigns/:id/join
const joinSchema = z.object({
  pledge_flat_enabled: z.boolean().default(false),
  pledge_per_km_jpy:   z.number().int().min(1).max(10_000).nullable().default(null),
});

router.post('/:id/join', requireAuth, async (req: Request, res: Response) => {
  const parsed = joinSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { pledge_flat_enabled, pledge_per_km_jpy } = parsed.data;

  const { data: campaign } = await db
    .from('campaigns')
    .select('id, is_active, end_date, flat_amount_jpy, per_km_rate_jpy')
    .eq('id', req.params.id)
    .single();

  if (!campaign?.is_active || new Date(campaign.end_date) < new Date()) {
    return res.status(400).json({ error: 'Campaign is not active' });
  }

  const { data, error } = await db
    .from('campaign_participations')
    .upsert(
      { campaign_id: req.params.id, user_id: req.userId!, pledge_flat_enabled, pledge_per_km_jpy },
      { onConflict: 'campaign_id,user_id' }
    )
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await syncParticipantCount(req.params.id);
  res.status(201).json(data);
});

// DELETE /campaigns/:id — creator deletes campaign (only if sole participant or no participants)
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  // Verify ownership
  const { data: campaign } = await db
    .from('campaigns')
    .select('id, created_by, participant_count')
    .eq('id', req.params.id)
    .single();

  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.created_by !== req.userId) return res.status(403).json({ error: 'Not your campaign' });

  // Count participants excluding the creator
  const { count } = await db
    .from('campaign_participations')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', req.params.id)
    .neq('user_id', req.userId!);

  if ((count ?? 0) > 0) {
    return res.status(400).json({
      error: 'Other participants have joined. Use archive to end the campaign instead.',
      canArchive: true,
    });
  }

  // Remove creator's own participation if present, then delete campaign
  await db.from('campaign_participations')
    .delete().eq('campaign_id', req.params.id);

  const { error } = await db.from('campaigns').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// PATCH /campaigns/:id — creator edits campaign details
const updateSchema = z.object({
  title_ja:        z.string().min(1).optional(),
  title_en:        z.string().min(1).optional(),
  description_ja:  z.string().optional(),
  description_en:  z.string().optional(),
  start_date:      z.string().optional(),
  end_date:        z.string().optional(),
  goal_amount_jpy: z.number().int().min(0).optional(),
  is_public:       z.boolean().optional(),
  max_distance_km: z.number().int().min(1).nullable().optional(),
  sport_types:     z.array(z.string()).min(1).optional(),
});

router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  const { data: campaign } = await db
    .from('campaigns').select('created_by').eq('id', req.params.id).single();

  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.created_by !== req.userId) return res.status(403).json({ error: 'Not your campaign' });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { data, error } = await db
    .from('campaigns')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select('*, nonprofits(id, name_ja, name_en, description_ja, description_en, logo_url, website_url)')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PATCH /campaigns/:id/archive — creator ends campaign early
router.patch('/:id/archive', requireAuth, async (req: Request, res: Response) => {
  const { data: campaign } = await db
    .from('campaigns').select('created_by').eq('id', req.params.id).single();

  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.created_by !== req.userId) return res.status(403).json({ error: 'Not your campaign' });

  const { error } = await db.from('campaigns')
    .update({ is_active: false }).eq('id', req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// DELETE /campaigns/:id/join — leave a campaign
router.delete('/:id/join', requireAuth, async (req: Request, res: Response) => {
  const { error } = await db
    .from('campaign_participations')
    .delete()
    .eq('campaign_id', req.params.id)
    .eq('user_id', req.userId!);

  if (error) return res.status(500).json({ error: error.message });

  await syncParticipantCount(req.params.id);
  res.json({ ok: true });
});

// POST /campaigns/:id/pledge — athlete pledges (per-km) using their saved card in the app
const pledgeSchema = z.object({
  per_km_rate_jpy:  z.number().int().min(1).max(100_000),
  donor_name:       z.string().min(1),
  is_anonymous:     z.boolean().default(false),
  athlete_user_id:  z.string().uuid().optional(), // which athlete the donor supports; defaults to creator
});

router.post('/:id/pledge', requireAuth, async (req: Request, res: Response) => {
  const parsed = pledgeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { per_km_rate_jpy, donor_name, is_anonymous, athlete_user_id } = parsed.data;

  // Verify campaign exists and accepts per-km pledges
  const { data: campaign } = await db
    .from('campaigns')
    .select('id, has_per_km_donation, is_active, end_date')
    .eq('id', req.params.id)
    .single();

  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (!campaign.is_active || new Date(campaign.end_date) < new Date()) {
    return res.status(400).json({ error: 'This campaign is no longer active' });
  }
  if (!campaign.has_per_km_donation) {
    return res.status(400).json({ error: 'This campaign does not accept per-km pledges' });
  }

  // Get user's Stripe customer ID
  const { data: profile } = await db
    .from('user_profiles')
    .select('stripe_customer_id')
    .eq('user_id', req.userId!)
    .single();

  if (!profile?.stripe_customer_id) {
    return res.status(400).json({ error: 'No payment method on file. Please add a card in your profile first.' });
  }

  // Get default payment method from Stripe
  const customer = await stripe.customers.retrieve(profile.stripe_customer_id) as Stripe.Customer;
  const pmId = customer.invoice_settings?.default_payment_method as string | undefined;

  if (!pmId) {
    return res.status(400).json({ error: 'No default payment method. Please add a card in your profile first.' });
  }

  // Insert pledge as confirmed (card already on file)
  const { error } = await db.from('donor_pledges').insert({
    campaign_id:              req.params.id,
    donor_name,
    donor_email:              '',
    flat_amount_jpy:          null,
    per_km_rate_jpy,
    stripe_customer_id:       profile.stripe_customer_id,
    stripe_payment_method_id: pmId,
    is_anonymous,
    athlete_user_id:          athlete_user_id ?? null,
    status:                   'confirmed',
  });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// POST /campaigns/:id/finalize — charge all confirmed per-km pledges and close campaign
router.post('/:id/finalize', requireAuth, async (req: Request, res: Response) => {
  // Verify ownership
  const { data: campaign } = await db
    .from('campaigns')
    .select('id, created_by, start_date, end_date, max_distance_km, sport_types')
    .eq('id', req.params.id)
    .single();

  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.created_by !== req.userId) return res.status(403).json({ error: 'Not your campaign' });

  // Calculate total km from creator's activities during campaign period
  const sportTypeAliases: Record<string, string[]> = {
    Ride: ['Ride','MountainBikeRide','GravelRide','EBikeRide','EMountainBikeRide','Handcycle','VelomobileRide','VirtualRide'],
    Run:  ['Run','TrailRun','VirtualRun','Wheelchair'],
    Walk: ['Walk','Hike'],
    Swim: ['Swim','OpenWaterSwim'],
  };
  const expandedTypes = (campaign.sport_types ?? []).flatMap(
    (t: string) => sportTypeAliases[t] ?? [t]
  );

  let activityQuery = db.from('activities')
    .select('distance_meters')
    .eq('user_id', req.userId!)
    .gte('start_date_local', campaign.start_date ?? '');
  if (campaign.end_date) activityQuery = activityQuery.lte('start_date_local', campaign.end_date);
  if (expandedTypes.length > 0) activityQuery = activityQuery.in('sport_type', expandedTypes);

  const { data: activities } = await activityQuery;
  const rawKm = (activities ?? []).reduce((s: number, a: any) => s + (a.distance_meters / 1000), 0);
  const cappedKm = campaign.max_distance_km
    ? Math.min(rawKm, campaign.max_distance_km)
    : rawKm;
  const totalKm = Math.round(cappedKm * 10) / 10;

  // Get all confirmed per-km pledges (includes which athlete each donor is supporting)
  const { data: pledges } = await db
    .from('donor_pledges')
    .select('id, donor_name, donor_email, per_km_rate_jpy, stripe_customer_id, stripe_payment_method_id, athlete_user_id')
    .eq('campaign_id', req.params.id)
    .eq('status', 'confirmed')
    .not('per_km_rate_jpy', 'is', null)
    .not('stripe_payment_method_id', 'is', null);

  const results = { charged: 0, skipped: 0, failed: 0, totalChargedJpy: 0 };

  // Cache km per athlete to avoid redundant queries
  const kmCache: Record<string, number> = {};
  kmCache[campaign.created_by] = totalKm; // creator's km already calculated

  for (const pledge of pledges ?? []) {
    // Use the pledge's specific athlete; fall back to creator for legacy pledges
    const athleteId: string = pledge.athlete_user_id ?? campaign.created_by;

    if (!(athleteId in kmCache)) {
      let aq = db.from('activities')
        .select('distance_meters')
        .eq('user_id', athleteId)
        .gte('start_date_local', campaign.start_date ?? '');
      if (campaign.end_date) aq = aq.lte('start_date_local', campaign.end_date);
      if (expandedTypes.length > 0) aq = aq.in('sport_type', expandedTypes);
      const { data: aActs } = await aq;
      const rawKm = (aActs ?? []).reduce((s: number, a: any) => s + (a.distance_meters / 1000), 0);
      kmCache[athleteId] = campaign.max_distance_km ? Math.min(rawKm, campaign.max_distance_km) : rawKm;
    }

    const pledgeKm = Math.round(kmCache[athleteId] * 10) / 10;
    const amountJpy = Math.round((pledge.per_km_rate_jpy ?? 0) * pledgeKm);

    // Stripe minimum for JPY is ¥50
    if (amountJpy < 50) {
      await db.from('donor_pledges').update({ status: 'skipped' }).eq('id', pledge.id);
      results.skipped++;
      continue;
    }

    try {
      const pi = await stripeService.chargeWithMethod({
        customerId:      pledge.stripe_customer_id,
        paymentMethodId: pledge.stripe_payment_method_id,
        amountJpy,
        campaignId:      req.params.id,
        donorName:       pledge.donor_name,
        description:     `チャリアス per-km donation — ${pledgeKm} km × ¥${pledge.per_km_rate_jpy}/km`,
      });

      await db.from('donor_pledges').update({
        status:             'charged',
        charged_amount_jpy: pi.amount,
        charged_at:         new Date().toISOString(),
      }).eq('id', pledge.id);

      results.charged++;
      results.totalChargedJpy += pi.amount;
    } catch (err: any) {
      console.error(`[Finalize] Failed to charge pledge ${pledge.id}:`, err.message);
      await db.from('donor_pledges').update({ status: 'failed' }).eq('id', pledge.id);
      results.failed++;
    }
  }

  // Recalculate total raised from all charged pledges
  const { data: allCharged } = await db
    .from('donor_pledges')
    .select('charged_amount_jpy')
    .eq('campaign_id', req.params.id)
    .eq('status', 'charged');
  const totalRaised = (allCharged ?? []).reduce((s: number, p: any) => s + (p.charged_amount_jpy ?? 0), 0);

  // Close campaign
  await db.from('campaigns').update({
    is_active:        false,
    raised_amount_jpy: totalRaised,
  }).eq('id', req.params.id);

  // Recalculate donated stats for every athlete whose pledges were charged
  const chargedAthleteIds = new Set<string>(
    (pledges ?? [])
      .filter((p: any) => p.athlete_user_id)
      .map((p: any) => p.athlete_user_id as string)
  );
  chargedAthleteIds.add(campaign.created_by); // always include creator
  for (const athleteId of chargedAthleteIds) {
    await recalcDonatedStats(athleteId);
  }

  res.json({ ok: true, totalKm, ...results });
});

// POST /campaigns/:id/donate  — manual one-time donation checkout
const donateSchema = z.object({ amount_jpy: z.number().int().min(100) });

router.post('/:id/donate', requireAuth, async (req: Request, res: Response) => {
  const parsed = donateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { data: profile } = await db
    .from('user_profiles')
    .select('display_name, stripe_customer_id')
    .eq('user_id', req.userId)
    .single();

  const { data: authUser } = await db.auth.admin.getUserById(req.userId!);
  const email = authUser.user?.email ?? '';

  const customerId = await stripeService.getOrCreateCustomer(req.userId!, email, profile?.display_name ?? '');

  const appUrl = process.env.APP_URL ?? 'charityathletes://';
  const session = await stripeService.createCheckoutSession({
    customerId,
    amountJpy:  parsed.data.amount_jpy,
    campaignId: req.params.id,
    userId:     req.userId!,
    successUrl: `${appUrl}donation/success`,
    cancelUrl:  `${appUrl}donation/cancel`,
  });

  res.json(session);
});

export default router;
