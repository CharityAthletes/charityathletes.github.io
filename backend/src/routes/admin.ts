/**
 * Admin routes
 * All endpoints require role = 'admin'.
 */
import { Router, Request, Response } from 'express';
import { db } from '../config/supabase';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { z } from 'zod';

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

export default router;
