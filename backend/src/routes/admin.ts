/**
 * Admin routes
 * All endpoints require role = 'admin'.
 */
import { Router, Request, Response } from 'express';
import { db } from '../config/supabase';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { z } from 'zod';
import { stripe } from '../config/stripe';
import { stripeService } from '../services/stripeService';

const router = Router();
const guard = [requireAuth, requireRole('admin')];

// GET /admin/stats — platform-wide numbers
router.get('/stats', ...guard, async (_req: Request, res: Response) => {
  const { data, error } = await db
    .from('admin_platform_stats')
    .select('*')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /admin/nonprofits — list all nonprofit profiles with optional ?status= filter
router.get('/nonprofits', ...guard, async (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;

  let query = db
    .from('nonprofit_profiles')
    .select(`
      id, name_ja, name_en, category, status, rejection_reason,
      donorbox_campaign_id, donorbox_account_email,
      website_url, logo_url, created_at, reviewed_at,
      user_profiles!nonprofit_profiles_user_id_fkey(display_name)
    `)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /admin/nonprofits/:id — single nonprofit profile detail
router.get('/nonprofits/:id', ...guard, async (req: Request, res: Response) => {
  const { data, error } = await db
    .from('nonprofit_profiles')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

// POST /admin/nonprofits/:id/approve
router.post('/nonprofits/:id/approve', ...guard, async (req: Request, res: Response) => {
  const { data, error } = await db.rpc('approve_nonprofit', {
    p_profile_id: req.params.id,
    p_admin_id:   req.userId,
  });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true, nonprofit_id: data });
});

// POST /admin/nonprofits/:id/reject
const rejectSchema = z.object({
  reason: z.string().min(1).max(500),
});

router.post('/nonprofits/:id/reject', ...guard, async (req: Request, res: Response) => {
  const parsed = rejectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { error } = await db.rpc('reject_nonprofit', {
    p_profile_id: req.params.id,
    p_admin_id:   req.userId,
    p_reason:     parsed.data.reason,
  });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// GET /admin/users — list users with roles (paginated)
router.get('/users', ...guard, async (req: Request, res: Response) => {
  const page  = Math.max(0, parseInt(req.query.page as string ?? '0'));
  const limit = 50;

  const { data, error } = await db
    .from('user_roles')
    .select('role, created_at, user_profiles!user_roles_user_id_fkey(display_name, avatar_url, total_donated_jpy, total_distance_km)')
    .order('created_at', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PATCH /admin/users/:userId/role — promote or change role
const roleSchema = z.object({ role: z.enum(['athlete', 'nonprofit', 'admin']) });

router.patch('/users/:userId/role', ...guard, async (req: Request, res: Response) => {
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { error } = await db
    .from('user_roles')
    .update({ role: parsed.data.role })
    .eq('user_id', req.params.userId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// POST /admin/nonprofits/:id/connect — start Stripe Connect onboarding
router.post('/nonprofits/:id/connect', ...guard, async (req: Request, res: Response) => {
  const { data: nonprofit } = await db
    .from('nonprofits')
    .select('id, name_en, stripe_account_id')
    .eq('id', req.params.id)
    .single();

  if (!nonprofit) return res.status(404).json({ error: 'Nonprofit not found' });

  const appUrl = process.env.APP_URL ?? 'https://donate.charityathletes.org';
  const returnUrl  = `${appUrl}/admin/connect/complete?nonprofit_id=${nonprofit.id}`;
  const refreshUrl = `${appUrl}/admin/nonprofits/${nonprofit.id}/connect`;

  try {
    if (nonprofit.stripe_account_id) {
      // Already has an account — just generate a new link
      const url = await stripeService.createConnectAccountLink({
        accountId:  nonprofit.stripe_account_id,
        returnUrl,
        refreshUrl,
      });
      return res.json({ url, accountId: nonprofit.stripe_account_id });
    }

    // Create new Express account
    const { accountId, url } = await stripeService.createConnectOnboardingLink({
      nonprofitId:   nonprofit.id,
      nonprofitName: nonprofit.name_en,
      returnUrl,
      refreshUrl,
    });

    // Save account ID immediately (before onboarding completes)
    await db.from('nonprofits').update({ stripe_account_id: accountId }).eq('id', nonprofit.id);

    return res.json({ url, accountId });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /admin/connect/complete — callback after nonprofit completes onboarding
router.get('/connect/complete', async (req: Request, res: Response) => {
  const nonprofitId = req.query.nonprofit_id as string;
  if (!nonprofitId) return res.status(400).send('Missing nonprofit_id');

  const { data: nonprofit } = await db
    .from('nonprofits')
    .select('name_en, stripe_account_id')
    .eq('id', nonprofitId)
    .single();

  if (!nonprofit?.stripe_account_id) {
    return res.send('<h2>Setup incomplete. Please try again.</h2>');
  }

  // Verify the account is actually enabled
  try {
    const account = await stripe.accounts.retrieve(nonprofit.stripe_account_id);
    const ready = account.charges_enabled && account.payouts_enabled;
    return res.send(`
      <html><body style="font-family:sans-serif;max-width:500px;margin:60px auto;text-align:center">
        <h2>${ready ? '✅' : '⏳'} Stripe Connect ${ready ? 'Active' : 'Pending'}</h2>
        <p><strong>${nonprofit.name_en}</strong> ${ready
          ? 'is now connected. Donations will go directly to their Stripe account.'
          : 'has started onboarding but setup is not complete yet. They may need to provide more information.'
        }</p>
        <p style="color:#86868b;font-size:13px">Account ID: ${nonprofit.stripe_account_id}</p>
      </body></html>
    `);
  } catch (err: any) {
    return res.status(500).send(`<h2>Error: ${err.message}</h2>`);
  }
});

export default router;
