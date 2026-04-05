/**
 * Nonprofit dashboard routes
 * All endpoints require role = 'nonprofit' AND status = 'approved'.
 */
import { Router, Request, Response } from 'express';
import { db } from '../config/supabase';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';

const router = Router();

// Shared guard: fetch the caller's approved nonprofit profile + nonprofit_id
async function getApprovedNonprofitId(userId: string): Promise<string | null> {
  const { data } = await db
    .from('nonprofit_profiles')
    .select('nonprofit_id, status')
    .eq('user_id', userId)
    .single();
  if (!data || data.status !== 'approved' || !data.nonprofit_id) return null;
  return data.nonprofit_id as string;
}

// GET /nonprofit/profile
router.get('/profile', requireAuth, requireRole('nonprofit'), async (req: Request, res: Response) => {
  const { data, error } = await db
    .from('nonprofit_profiles')
    .select('*')
    .eq('user_id', req.userId!)
    .single();
  if (error) return res.status(404).json({ error: 'Profile not found' });
  res.json(data);
});

// GET /nonprofit/dashboard — aggregate donation stats
router.get('/dashboard', requireAuth, requireRole('nonprofit'), async (req: Request, res: Response) => {
  const nonprofitId = await getApprovedNonprofitId(req.userId!);
  if (!nonprofitId) return res.status(403).json({ error: 'Nonprofit not approved yet' });

  // Total raised across all campaigns for this nonprofit
  const { data: totals } = await db
    .from('campaigns')
    .select('id, title_ja, title_en, raised_amount_jpy, participant_count, goal_amount_jpy')
    .eq('nonprofit_id', nonprofitId)
    .order('raised_amount_jpy', { ascending: false });

  const totalRaisedJpy = (totals ?? []).reduce((s, c) => s + (c.raised_amount_jpy ?? 0), 0);

  // Recent completed donations with athlete info (anonymised to display_name only)
  const campaignIds = (totals ?? []).map(c => c.id);
  let recentDonations: unknown[] = [];
  if (campaignIds.length > 0) {
    const { data } = await db
      .from('donations')
      .select(`
        id, total_amount_jpy, flat_amount_jpy, per_km_amount_jpy,
        distance_km, created_at, campaign_id,
        user_profiles!donations_user_id_fkey(display_name, avatar_url)
      `)
      .in('campaign_id', campaignIds)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(30);
    recentDonations = data ?? [];
  }

  // Top athletes (by total donated across this nonprofit's campaigns)
  let topAthletes: unknown[] = [];
  if (campaignIds.length > 0) {
    const { data } = await db.rpc('nonprofit_top_athletes', {
      p_nonprofit_id: nonprofitId,
      p_limit: 10,
    });
    topAthletes = data ?? [];
  }

  res.json({
    total_raised_jpy:  totalRaisedJpy,
    campaigns:         totals ?? [],
    recent_donations:  recentDonations,
    top_athletes:      topAthletes,
  });
});

// GET /nonprofit/campaigns — campaigns for this nonprofit
router.get('/campaigns', requireAuth, requireRole('nonprofit'), async (req: Request, res: Response) => {
  const nonprofitId = await getApprovedNonprofitId(req.userId!);
  if (!nonprofitId) return res.status(403).json({ error: 'Nonprofit not approved yet' });

  const { data, error } = await db
    .from('campaigns')
    .select('*')
    .eq('nonprofit_id', nonprofitId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

export default router;
