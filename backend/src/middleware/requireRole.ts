import { Request, Response, NextFunction } from 'express';
import { db } from '../config/supabase';

type Role = 'athlete' | 'nonprofit' | 'admin';

/**
 * Middleware factory. Call after requireAuth.
 * Example: router.get('/secret', requireAuth, requireRole('admin'), handler)
 */
export function requireRole(...allowed: Role[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthenticated' });
      return;
    }

    const { data, error } = await db
      .from('user_roles')
      .select('role')
      .eq('user_id', req.userId)
      .single();

    if (error || !data) {
      res.status(403).json({ error: 'Role not found' });
      return;
    }

    if (!allowed.includes(data.role as Role)) {
      res.status(403).json({ error: `Requires role: ${allowed.join(' | ')}` });
      return;
    }

    // Attach role for use in handlers
    req.userRole = data.role as Role;
    next();
  };
}

// Augment Express Request
declare global {
  namespace Express {
    interface Request {
      userId?:   string;
      userRole?: Role;
    }
  }
}
