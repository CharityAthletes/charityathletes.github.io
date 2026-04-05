import { createClient } from '@supabase/supabase-js';

const url  = process.env.SUPABASE_URL!;
const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.SUPABASE_ANON_KEY!;

if (!url || !svcKey || !anonKey) throw new Error('Missing Supabase env vars');

/** Service-role client — bypasses RLS. Use only in trusted server code. */
export const db = createClient(url, svcKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Anon client — respects RLS. Use to validate user JWTs. */
export const dbAnon = createClient(url, anonKey);
