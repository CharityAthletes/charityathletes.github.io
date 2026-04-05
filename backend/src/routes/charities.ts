import { Router, Request, Response } from 'express';
import { db } from '../config/supabase';
import { z } from 'zod';

const router = Router();

// ── GET /charities ─────────────────────────────────────────────────────────
// Public list with optional ?q= search and ?category= filter

router.get('/', async (req: Request, res: Response) => {
  let query = db
    .from('charities')
    .select('*')
    .eq('is_active', true)
    .order('is_featured', { ascending: false })
    .order('name_en');

  if (req.query.category) {
    query = query.eq('category', req.query.category as string);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // Client-side text search (Supabase free tier has no full-text on custom tables)
  const q = (req.query.q as string | undefined)?.toLowerCase();
  const filtered = q
    ? (data ?? []).filter(c =>
        (c.name_en + c.name_ja + c.description_en + c.category)
          .toLowerCase()
          .includes(q)
      )
    : (data ?? []);

  res.json(filtered);
});

// ── POST /charities/request ────────────────────────────────────────────────

const requestSchema = z.object({
  org_name:     z.string().min(1),
  donorbox_url: z.string().url().refine(u => u.includes('donorbox.org'), {
    message: 'Must be a donorbox.org URL',
  }),
  website_url:  z.string().url().optional().or(z.literal('')),
  category:     z.string().min(1),
  reason:       z.string().optional(),
  submitted_by: z.string().optional(),
});

router.post('/request', async (req: Request, res: Response) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { org_name, donorbox_url, website_url, category, reason, submitted_by } = parsed.data;

  // Attach athlete ID if logged in (token optional for donors too)
  let athleteId: string | null = null;
  const auth = req.headers.authorization?.replace('Bearer ', '');
  if (auth) {
    const { data: user } = await db.auth.getUser(auth);
    athleteId = user?.user?.id ?? null;
  }

  const { error } = await db.from('charity_requests').insert({
    org_name,
    donorbox_url,
    website_url: website_url || null,
    category,
    reason: reason || null,
    submitted_by: submitted_by || null,
    athlete_id: athleteId,
    status: 'pending',
  });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default router;
