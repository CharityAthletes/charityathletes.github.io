import { Request, Response, NextFunction } from 'express';
import { dbAnon } from '../config/supabase';

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Bearer token' });
    return;
  }
  const { data: { user }, error } = await dbAnon.auth.getUser(header.slice(7));
  if (error || !user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
  req.userId = user.id;
  next();
}
