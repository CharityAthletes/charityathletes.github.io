/**
 * Webhook endpoints
 *
 *  GET  /webhooks/strava   — Strava hub.challenge verification
 *  POST /webhooks/strava   — Strava activity events (create / delete)
 *  POST /webhooks/stripe   — Stripe payment events (raw body required)
 */
import { Router, Request, Response } from 'express';
import { stravaService } from '../services/stravaService';
import { stripeService } from '../services/stripeService';
import { processActivityDonations } from '../services/donationEngine';
import { recalcDistanceStats, recalcDonatedStats } from '../services/statsService';
import { db } from '../config/supabase';
import type { StravaWebhookEvent } from '../types';

const router = Router();

// ── Strava webhook verification ───────────────────────────────────────────────

router.get('/strava', (req: Request, res: Response) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query as Record<string, string>;
  if (mode === 'subscribe' && token === process.env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
    res.json({ 'hub.challenge': challenge });
  } else {
    res.status(403).json({ error: 'Forbidden' });
  }
});

// ── Strava activity events ────────────────────────────────────────────────────

router.post('/strava', (req: Request, res: Response) => {
  // Must respond within 2 s; process async
  res.sendStatus(200);

  const event = req.body as StravaWebhookEvent;
  if (event.object_type !== 'activity') return;

  // Verify subscription_id matches ours — blocks spoofed events from anyone
  // who discovers this URL.  Set STRAVA_WEBHOOK_SUBSCRIPTION_ID in Railway env
  // to the numeric ID returned when you registered the webhook with Strava.
  const expectedSubId = process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID;
  if (expectedSubId && String(event.subscription_id) !== expectedSubId) {
    console.warn('[Webhook/Strava] Rejected event with unexpected subscription_id:', event.subscription_id);
    return;
  }

  setImmediate(async () => {
    try {
      if (event.aspect_type === 'create') {
        const result = await stravaService.syncActivity(event.owner_id, event.object_id);
        if (result) {
          await processActivityDonations(result.activityId);
          await recalcDistanceStats(result.userId);
        }
      } else if (event.aspect_type === 'update') {
        // Re-sync so edits to name, sport type, distance, etc. are reflected immediately
        const result = await stravaService.syncActivity(event.owner_id, event.object_id);
        if (result) await recalcDistanceStats(result.userId);
      } else if (event.aspect_type === 'delete') {
        await stravaService.markActivityDeleted(event.object_id);
      }
    } catch (err) {
      console.error('[Webhook/Strava] Processing error', err);
    }
  });
});

// ── Stripe events ─────────────────────────────────────────────────────────────
// NOTE: express.raw() is applied to this route in index.ts before JSON parsing.

router.post('/stripe', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;
  let event;
  try {
    event = stripeService.constructEvent(req.body as Buffer, sig);
  } catch {
    return res.status(400).send('Webhook signature verification failed');
  }

  console.log('[Webhook/Stripe] received event type:', event.type);

  try {
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as { id: string };
      await db.from('donations')
        .update({ status: 'completed', stripe_status: 'succeeded' })
        .eq('stripe_payment_intent_id', pi.id)
        .eq('status', 'pending');   // idempotent
    }

    if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object as { id: string };
      await db.from('donations')
        .update({ status: 'failed' })
        .eq('stripe_payment_intent_id', pi.id);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as {
        id: string;
        payment_intent: string | null;
        metadata: Record<string, string>;
        amount_total: number;
        customer: string;
      };
      const campaignId  = session.metadata.campaign_id;
      const userId      = session.metadata.user_id;
      const amountTotal = session.amount_total ?? 0;

      console.log('[Webhook/Stripe] checkout.session.completed', { campaignId, userId, amountTotal });

      // Manual donation completed via Checkout Session
      const { error: insertErr } = await db.from('donations').insert({
        user_id:                  userId,
        campaign_id:              campaignId,
        flat_amount_jpy:          amountTotal,
        per_km_amount_jpy:        0,
        status:                   'completed',
        trigger_type:             'manual',
        stripe_payment_intent_id: session.payment_intent ?? session.id,
      });

      if (insertErr) {
        console.error('[Webhook/Stripe] donation insert failed', insertErr);
      } else {
        // Look up donor name for the pledge record
        const { data: profile } = await db
          .from('user_profiles')
          .select('display_name')
          .eq('user_id', userId)
          .single();

        // Also insert into donor_pledges so it appears in the donor list
        const { error: pledgeErr } = await db.from('donor_pledges').insert({
          campaign_id:              campaignId,
          donor_name:               profile?.display_name ?? 'Anonymous',
          donor_email:              '',
          flat_amount_jpy:          amountTotal,
          per_km_rate_jpy:          null,
          stripe_customer_id:       session.customer,
          stripe_payment_method_id: session.payment_intent ?? session.id,
          is_anonymous:             false,
          athlete_user_id:          null,
          status:                   'charged',
          charged_amount_jpy:       amountTotal,
          charged_at:               new Date().toISOString(),
        });
        if (pledgeErr) console.error('[Webhook/Stripe] donor_pledges insert failed', pledgeErr);
        else console.log('[Webhook/Stripe] donor_pledges insert succeeded');

        // Update campaign raised amount from all completed donations
        const { data: charged } = await db
          .from('donations')
          .select('flat_amount_jpy, per_km_amount_jpy')
          .eq('campaign_id', campaignId)
          .eq('status', 'completed');
        const totalRaised = (charged ?? []).reduce(
          (s: number, d: any) => s + (d.flat_amount_jpy ?? 0) + (d.per_km_amount_jpy ?? 0), 0
        );
        const { error: updateErr } = await db
          .from('campaigns')
          .update({ raised_amount_jpy: totalRaised })
          .eq('id', campaignId);
        if (updateErr) console.error('[Webhook/Stripe] campaign update failed', updateErr);
        else console.log('[Webhook/Stripe] raised_amount_jpy updated to', totalRaised);

        // Recalc donated stats for the donor
        if (userId) await recalcDonatedStats(userId);
      }
    }
  } catch (err) {
    console.error('[Webhook/Stripe] Processing error', err);
    return res.status(500).send('Processing failed');
  }

  res.json({ received: true });
});

export default router;
