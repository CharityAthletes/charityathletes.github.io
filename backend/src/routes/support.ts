/**
 * Support / platform tip endpoint
 *
 *  POST /support/tip  — create a Stripe Checkout Session for a one-time
 *                       tip to CharityAthletes, returns { url }
 */
import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

const tipLimiter = rateLimit({
  windowMs:        60 * 60_000,
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: 'Too many tip attempts. Please try again later.' },
});

const tipSchema = z.object({
  amount:   z.number().int().min(1),
  currency: z.enum(['jpy', 'usd', 'aud']).default('jpy'),
});

const BASE_URL    = 'https://charityathletes.org';
const SUCCESS_URL = `${BASE_URL}/support.html?tip=thanks`;
const CANCEL_URL  = `${BASE_URL}/support.html`;

router.post('/tip', tipLimiter, async (req: Request, res: Response) => {
  const parsed = tipSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { amount, currency } = parsed.data;
  // JPY is zero-decimal; USD/AUD use cents
  const stripeAmount = currency === 'jpy' ? amount : amount * 100;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency,
          product_data: {
            name:        'チャリアス サポートチップ / Support CharityAthletes',
            description: 'チャリアスは手数料ゼロ。チップでサービスを維持しています。/ CharityAthletes charges no platform fee — tips keep it running.',
          },
          unit_amount: stripeAmount,
        },
        quantity: 1,
      }],
      mode:        'payment',
      success_url: SUCCESS_URL,
      cancel_url:  CANCEL_URL,
    });

    res.json({ url: session.url });
  } catch (err: any) {
    console.error('[Support/tip] Stripe error:', err);
    res.status(500).json({ error: err?.message ?? 'Failed to create checkout session' });
  }
});

export default router;
