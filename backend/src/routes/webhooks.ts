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

  setImmediate(async () => {
    try {
      if (event.aspect_type === 'create') {
        const result = await stravaService.syncActivity(event.owner_id, event.object_id);
        if (result) await processActivityDonations(result.activityId);
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
        metadata: Record<string, string>;
        amount_total: number;
        customer: string;
      };
      // Manual donation completed via Checkout Session
      await db.from('donations').insert({
        user_id:      session.metadata.user_id,
        campaign_id:  session.metadata.campaign_id,
        participation_id: session.metadata.participation_id ?? null,
        flat_amount_jpy:  session.amount_total ?? 0,
        per_km_amount_jpy: 0,
        status:       'completed',
        trigger_type: 'manual',
        stripe_payment_intent_id: session.id,
        stripe_status: 'succeeded',
      });
    }
  } catch (err) {
    console.error('[Webhook/Stripe] Processing error', err);
    return res.status(500).send('Processing failed');
  }

  res.json({ received: true });
});

export default router;
