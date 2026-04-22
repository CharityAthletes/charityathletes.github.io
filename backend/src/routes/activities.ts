import { Router, Request, Response } from 'express';
import { db } from '../config/supabase';
import { requireAuth } from '../middleware/auth';

const router = Router();

// GET /activities — return the current user's synced Strava activities
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const { data, error } = await db
    .from('activities')
    .select('id, name, sport_type, distance_meters, moving_time_seconds, total_elevation_gain, average_heartrate, start_date, strava_activity_id')
    .eq('user_id', req.userId!)
    .is('deleted_at', null)
    .order('start_date', { ascending: false })
    .limit(100);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

export default router;
