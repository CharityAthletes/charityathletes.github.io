import { Router, Request, Response } from 'express';
import { db } from '../config/supabase';
import { stripeService } from '../services/stripeService';
import { requireAuth } from '../middleware/auth';
import { z } from 'zod';

const router = Router();

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
    .select('campaigns(*, nonprofits(id, name_ja, name_en, description_ja, description_en, logo_url, website_url))')
    .eq('user_id', req.userId!);

  if (error) return res.status(500).json({ error: error.message });
  const campaigns = (data ?? []).map((r: any) => r.campaigns).filter(Boolean);
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

  await db.rpc('increment_campaign_participants', { p_campaign_id: req.params.id });
  res.status(201).json(data);
});

// DELETE /campaigns/:id/join — leave a campaign
router.delete('/:id/join', requireAuth, async (req: Request, res: Response) => {
  const { error } = await db
    .from('campaign_participations')
    .delete()
    .eq('campaign_id', req.params.id)
    .eq('user_id', req.userId!);

  if (error) return res.status(500).json({ error: error.message });

  // Decrement participant count (floor at 0)
  await db.rpc('decrement_campaign_participants', { p_campaign_id: req.params.id });

  res.json({ ok: true });
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
