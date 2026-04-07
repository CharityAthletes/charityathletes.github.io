import { Router, Request, Response } from 'express';
import { db } from '../config/supabase';

const router = Router();

// GET /nonprofits — public list of active nonprofits (for campaign creation picker)
router.get('/', async (_req: Request, res: Response) => {
  const { data, error } = await db
    .from('nonprofits')
    .select('id, name_ja, name_en, description_ja, description_en, logo_url, website_url')
    .eq('is_active', true)
    .order('name_en');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

export default router;
