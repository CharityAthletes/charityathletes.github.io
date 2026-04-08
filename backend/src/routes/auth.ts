import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import axios from 'axios';
import { stravaService } from '../services/stravaService';
import { recalcDistanceStats } from '../services/statsService';
import { db } from '../config/supabase';
import { stripe } from '../config/stripe';
import { requireAuth } from '../middleware/auth';

const router = Router();

// ── Athlete signup ────────────────────────────────────────────────────────────
// Supabase handles email/password auth directly from the iOS SDK.
// The iOS app calls supabase.auth.signUp() with role='athlete' in metadata;
// the DB trigger assigns the role automatically.
// This endpoint is kept for server-side token exchange if needed.

// GET /auth/me — return current user's role and profile
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const [{ data: role }, { data: profile }] = await Promise.all([
    db.from('user_roles').select('role').eq('user_id', req.userId!).single(),
    db.from('user_profiles').select('*').eq('user_id', req.userId!).single(),
  ]);

  // For nonprofits: also return profile status
  let nonprofitProfile = null;
  if (role?.role === 'nonprofit') {
    const { data } = await db
      .from('nonprofit_profiles')
      .select('id, status, name_ja, name_en, nonprofit_id, rejection_reason')
      .eq('user_id', req.userId!)
      .single();
    nonprofitProfile = data;
  }

  res.json({ ...profile, role: role?.role ?? 'athlete', nonprofit_profile: nonprofitProfile });
});

// POST /auth/nonprofit/register — create nonprofit account + profile
const nonprofitSignupSchema = z.object({
  email:                   z.string().email(),
  password:                z.string().min(8),
  display_name:            z.string().min(1),
  name_ja:                 z.string().min(1),
  name_en:                 z.string().min(1),
  description_ja:          z.string().default(''),
  description_en:          z.string().default(''),
  website_url:             z.string().url().optional(),
  category:                z.enum(['education','environment','health','children','disaster_relief','animal_welfare','other']),
  donorbox_campaign_id:    z.string().min(1),
  donorbox_account_email:  z.string().email(),
});

router.post('/nonprofit/register', async (req: Request, res: Response) => {
  const parsed = nonprofitSignupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const d = parsed.data;

  // Create Supabase auth user with role in metadata
  const { data: authData, error: authError } = await db.auth.admin.createUser({
    email:    d.email,
    password: d.password,
    email_confirm: false,   // require email confirmation
    user_metadata: {
      full_name: d.display_name,
      role:      'nonprofit',
    },
  });

  if (authError || !authData.user) {
    return res.status(400).json({ error: authError?.message ?? 'Signup failed' });
  }

  const userId = authData.user.id;

  // Create nonprofit_profile (status = 'pending' by default)
  const { error: profileError } = await db.from('nonprofit_profiles').insert({
    user_id:                userId,
    name_ja:                d.name_ja,
    name_en:                d.name_en,
    description_ja:         d.description_ja,
    description_en:         d.description_en,
    website_url:            d.website_url ?? null,
    category:               d.category,
    donorbox_campaign_id:   d.donorbox_campaign_id,
    donorbox_account_email: d.donorbox_account_email,
  });

  if (profileError) {
    // Rollback: delete the auth user to avoid orphan
    await db.auth.admin.deleteUser(userId);
    return res.status(500).json({ error: 'Failed to create nonprofit profile' });
  }

  res.status(201).json({ message: 'Nonprofit account created. Pending admin approval.' });
});

// ── Strava OAuth ──────────────────────────────────────────────────────────────

// Connect Strava to an existing account (requires auth)
router.get('/strava', requireAuth, async (req: Request, res: Response) => {
  const state = crypto.randomBytes(16).toString('hex');
  const { error: stateError } = await db.from('oauth_states').insert({
    state,
    user_id:    req.userId,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (stateError) console.error('[Strava Auth] failed to save state:', stateError);
  else console.log('[Strava Auth] state saved:', state);
  res.json({ url: stravaService.authorizationUrl(state) });
});

// Sign in / sign up via Strava (no auth required)
router.get('/strava/login', async (req: Request, res: Response) => {
  const state = crypto.randomBytes(16).toString('hex');
  const { error: stateError } = await db.from('oauth_states').insert({
    state,
    user_id:    null,    // null = login mode (not a connect)
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (stateError) {
    console.error('[Strava Login] failed to save state:', stateError);
    return res.status(500).json({ error: 'Failed to initiate Strava login' });
  }
  console.log('[Strava Login] state saved:', state);
  res.json({ url: stravaService.authorizationUrl(state) });
});

router.get('/strava/callback', async (req: Request, res: Response) => {
  console.log('[Strava Callback] hit:', req.query);
  const { code, state, error } = req.query as Record<string, string>;
  const appUrl = process.env.APP_URL ?? 'charityathletes://';

  if (error) return res.redirect(`${appUrl}auth/error?reason=${error}`);

  const { data: stateRow } = await db
    .from('oauth_states')
    .select('user_id')
    .eq('state', state)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (!stateRow) {
    console.log('[Strava Callback] state not found:', state);
    return res.redirect(`${appUrl}auth/error?reason=invalid_state`);
  }

  try {
    const tokens = await stravaService.exchangeCode(code);
    console.log('[Strava Callback] token exchange ok, athlete:', tokens.athlete?.id);

    await db.from('oauth_states').delete().eq('state', state);

    if (stateRow.user_id) {
      // ── Connect mode: link Strava to existing account ───────────────────────
      const userId = stateRow.user_id as string;

      // Remove any existing token row for this athlete_id (another user may own it)
      await db.from('strava_tokens')
        .delete()
        .eq('athlete_id', tokens.athlete.id)
        .neq('user_id', userId);

      await db.from('strava_tokens').upsert({
        user_id:       userId,
        athlete_id:    tokens.athlete.id,
        access_token:  tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at:    tokens.expires_at,
        scope:         'read,activity:read_all',
        updated_at:    new Date().toISOString(),
      }, { onConflict: 'user_id' });

      // Clear strava_athlete_id from any OTHER user that already has it (avoids unique constraint violation)
      await db.from('user_profiles')
        .update({ strava_athlete_id: null })
        .eq('strava_athlete_id', tokens.athlete.id)
        .neq('user_id', userId);

      // Upsert so it works even if the user_profiles row doesn't exist yet
      const { error: connectProfileErr, data: connectProfileData } = await db.from('user_profiles').upsert({
        user_id:           userId,
        strava_athlete_id: tokens.athlete.id,
        avatar_url:        tokens.athlete.profile,
        display_name:      `${tokens.athlete.firstname} ${tokens.athlete.lastname}`,
      }, { onConflict: 'user_id', ignoreDuplicates: false }).select('user_id, display_name, strava_athlete_id');

      if (connectProfileErr) {
        console.error('[Strava Connect] profile upsert error:', connectProfileErr);
      } else {
        console.log('[Strava Connect] profile upserted:', connectProfileData);
      }

      console.log('[Strava Callback] connect success');
      return res.redirect(`${appUrl}auth/strava-success`);

    } else {
      // ── Login mode: find or create account, then sign in ────────────────────
      const syntheticEmail = `strava_${tokens.athlete.id}@strava.users.charityathletes.com`;
      const displayName    = `${tokens.athlete.firstname} ${tokens.athlete.lastname}`;
      console.log('[Strava Login] athlete data:', JSON.stringify(tokens.athlete));

      // Find existing user by Strava athlete ID or by synthetic email
      let userId: string;
      const { data: existingProfile } = await db
        .from('user_profiles')
        .select('user_id')
        .eq('strava_athlete_id', tokens.athlete.id)
        .single();

      if (existingProfile) {
        userId = existingProfile.user_id;
        console.log('[Strava Login] existing user by strava_athlete_id:', userId);
      } else {
        // Check if synthetic email already exists (from a previous failed attempt)
        const { data: existingUsers } = await db.auth.admin.listUsers();
        const existingUser = existingUsers?.users?.find(u => u.email === syntheticEmail);

        if (existingUser) {
          userId = existingUser.id;
          console.log('[Strava Login] existing user by synthetic email:', userId);
        } else {
          // Create new Supabase user
          const { data: authData, error: authErr } = await db.auth.admin.createUser({
            email:          syntheticEmail,
            email_confirm:  true,
            user_metadata:  { full_name: displayName, role: 'athlete' },
          });
          if (authErr || !authData.user) throw new Error(authErr?.message ?? 'User creation failed');
          userId = authData.user.id;
          console.log('[Strava Login] new user created:', userId);
        }
      }

      // Save Strava tokens + update profile
      await db.from('strava_tokens').upsert({
        user_id:       userId,
        athlete_id:    tokens.athlete.id,
        access_token:  tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at:    tokens.expires_at,
        scope:         'read,activity:read_all',
        updated_at:    new Date().toISOString(),
      }, { onConflict: 'user_id' });

      // Wait for DB trigger to finish creating the user_profile row, then overwrite
      await new Promise(r => setTimeout(r, 1000));

      // Use upsert so it works whether the trigger created the row or not
      const { error: profileErr, data: profileData } = await db.from('user_profiles').upsert({
        user_id:           userId,
        strava_athlete_id: tokens.athlete.id,
        avatar_url:        tokens.athlete.profile,
        display_name:      displayName,
      }, { onConflict: 'user_id', ignoreDuplicates: false }).select('display_name, strava_athlete_id');

      if (profileErr) {
        console.error('[Strava Login] profile upsert error:', profileErr);
        // Fallback: try a plain update
        const { error: updateErr } = await db.from('user_profiles').update({
          strava_athlete_id: tokens.athlete.id,
          avatar_url:        tokens.athlete.profile,
          display_name:      displayName,
        }).eq('user_id', userId);
        if (updateErr) console.error('[Strava Login] fallback update error:', updateErr);
        else console.log('[Strava Login] fallback update succeeded');
      } else {
        console.log('[Strava Login] profile upserted:', profileData);
      }

      // Look up the actual email for this user (may differ from syntheticEmail if they linked via Google/Apple)
      const { data: authUser } = await db.auth.admin.getUserById(userId);
      const loginEmail = authUser?.user?.email ?? syntheticEmail;
      console.log('[Strava Login] generating session for email:', loginEmail);

      // Generate a magic link and immediately verify it server-side to get session tokens.
      const { data: linkData, error: linkErr } = await db.auth.admin.generateLink({
        type:  'magiclink',
        email: loginEmail,
      });
      if (linkErr || !linkData?.properties?.email_otp) throw new Error('Failed to generate login link');

      const { data: sessionData, error: sessionErr } = await db.auth.verifyOtp({
        email: loginEmail,
        token: linkData.properties.email_otp,
        type:  'email',
      });
      if (sessionErr || !sessionData?.session) {
        console.error('[Strava Login] OTP verify error:', sessionErr);
        throw new Error('Failed to create session from magic link');
      }

      const { access_token, refresh_token } = sessionData.session;
      console.log('[Strava Login] session created, redirecting to app');
      const params = new URLSearchParams({ access_token, refresh_token, token_type: 'bearer' });
      return res.redirect(`${appUrl}auth/strava-login?${params}`);
    }
  } catch (err) {
    console.error('[Auth] Strava callback error', err);
    return res.redirect(`${appUrl}auth/error?reason=server_error`);
  }
});

router.delete('/strava', requireAuth, async (req: Request, res: Response) => {
  await db.from('strava_tokens').delete().eq('user_id', req.userId);
  await db.from('user_profiles').update({ strava_athlete_id: null }).eq('user_id', req.userId);
  res.json({ ok: true });
});

// DELETE /auth/account — permanently delete the authenticated user's account
router.delete('/account', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId!;

  try {
    // 1. Fetch user profile to get Stripe customer and Strava info
    const { data: profile } = await db
      .from('user_profiles')
      .select('stripe_customer_id, strava_athlete_id')
      .eq('user_id', userId)
      .single();

    // 2. Cancel/delete Stripe customer if one exists
    if (profile?.stripe_customer_id) {
      try {
        await stripe.customers.del(profile.stripe_customer_id);
      } catch (err) {
        console.error('[DeleteAccount] Stripe customer deletion failed (continuing):', err);
      }
    }

    // 3. Revoke Strava token if connected
    if (profile?.strava_athlete_id) {
      try {
        const { data: stravaToken } = await db
          .from('strava_tokens')
          .select('access_token')
          .eq('user_id', userId)
          .single();

        if (stravaToken?.access_token) {
          await axios.post('https://www.strava.com/oauth/deauthorize', null, {
            params: { access_token: stravaToken.access_token },
          });
        }
      } catch (err) {
        console.error('[DeleteAccount] Strava deauthorization failed (continuing):', err);
      }
    }

    // 4. Delete all user data in dependency order
    await db.from('donor_pledges').delete().eq('donor_user_id', userId);
    await db.from('campaign_participations').delete().eq('user_id', userId);
    await db.from('activities').delete().eq('user_id', userId);
    await db.from('campaigns').delete().eq('created_by', userId);
    await db.from('strava_tokens').delete().eq('user_id', userId);
    await db.from('user_profiles').delete().eq('user_id', userId);

    // 5. Delete the Supabase auth user (service role client bypasses RLS)
    const { error: deleteAuthError } = await db.auth.admin.deleteUser(userId);
    if (deleteAuthError) {
      console.error('[DeleteAccount] Auth user deletion failed:', deleteAuthError);
      return res.status(500).json({ error: 'Failed to delete auth user' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[DeleteAccount] Unexpected error:', err);
    res.status(500).json({ error: 'Account deletion failed' });
  }
});

// ── Manual Strava sync ────────────────────────────────────────────────────────
// Fetches the last 30 activities from Strava and syncs any that are missing.

router.post('/strava/sync', requireAuth, async (req: Request, res: Response) => {
  try {
    const accessToken = await stravaService.getValidAccessToken(req.userId!);

    const axios = (await import('axios')).default;
    const { data: stravaActivities } = await axios.get(
      'https://www.strava.com/api/v3/athlete/activities',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { per_page: 30, page: 1 },
      }
    );

    let synced = 0;
    for (const a of stravaActivities as Array<{ id: number }>) {
      const result = await stravaService.syncActivity(
        0,               // athleteId not needed — we pass userId directly below
        a.id,
        req.userId!      // override: pass userId so we skip the athlete_id lookup
      );
      if (result) synced++;
    }

    // Recalculate distance stats after sync
    await recalcDistanceStats(req.userId!);

    res.json({ ok: true, synced });
  } catch (err: any) {
    console.error('[Strava] Manual sync error', err);
    res.status(500).json({ error: err.message ?? 'Sync failed' });
  }
});

export default router;
