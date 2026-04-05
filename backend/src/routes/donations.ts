import { Router, Request, Response } from 'express';
import { db } from '../config/supabase';
import { stripeService } from '../services/stripeService';
import { requireAuth } from '../middleware/auth';

const router = Router();

// GET /donations — user's history (most recent 50)
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const { data, error } = await db
    .from('donations')
    .select(`
      id, flat_amount_jpy, per_km_amount_jpy, total_amount_jpy,
      distance_km, status, trigger_type, created_at,
      campaigns(title_ja, title_en, nonprofits(name_ja, name_en)),
      activities(name, sport_type, distance_meters)
    `)
    .eq('user_id', req.userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /donations/summary — totals for the current user
router.get('/summary', requireAuth, async (req: Request, res: Response) => {
  const { data, error } = await db
    .from('user_profiles')
    .select('total_distance_km, total_donated_jpy')
    .eq('user_id', req.userId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /donations/payment-method — returns saved card brand + last4
router.get('/payment-method', requireAuth, async (req: Request, res: Response) => {
  const { data: profile } = await db
    .from('user_profiles')
    .select('stripe_customer_id')
    .eq('user_id', req.userId!)
    .single();

  if (!profile?.stripe_customer_id) return res.json({ card: null });

  try {
    const { stripeService } = await import('../services/stripeService');
    const pms = await (await import('../config/stripe')).stripe.paymentMethods.list({
      customer: profile.stripe_customer_id,
      type: 'card',
    });
    const pm = pms.data[0];
    if (!pm?.card) return res.json({ card: null });
    res.json({ card: { brand: pm.card.brand, last4: pm.card.last4, expMonth: pm.card.exp_month, expYear: pm.card.exp_year } });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /donations/setup-payment — returns SetupIntent client_secret + ephemeral key
router.post('/setup-payment', requireAuth, async (req: Request, res: Response) => {
  const { data: authUser } = await db.auth.admin.getUserById(req.userId!);
  const { data: profile } = await db
    .from('user_profiles')
    .select('display_name')
    .eq('user_id', req.userId)
    .single();

  const customerId = await stripeService.getOrCreateCustomer(
    req.userId!,
    authUser.user?.email ?? '',
    profile?.display_name ?? ''
  );

  await db.from('user_profiles')
    .update({ stripe_customer_id: customerId })
    .eq('user_id', req.userId!);

  const intent = await stripeService.createSetupIntent(customerId);
  res.json(intent);
});

// POST /donations/confirm-setup — deferred flow: create+confirm SetupIntent with payment method
router.post('/confirm-setup', requireAuth, async (req: Request, res: Response) => {
  const { payment_method_id } = req.body;
  if (!payment_method_id) return res.status(400).json({ error: 'payment_method_id required' });

  const { data: profile } = await db
    .from('user_profiles')
    .select('stripe_customer_id')
    .eq('user_id', req.userId!)
    .single();

  if (!profile?.stripe_customer_id) return res.status(400).json({ error: 'No Stripe customer' });

  const { stripe } = await import('../config/stripe');
  const intent = await stripe.setupIntents.create({
    customer: profile.stripe_customer_id,
    payment_method: payment_method_id,
    usage: 'off_session',
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    confirm: true,
  });

  // Set as the customer's default payment method so off-session charges work
  await stripe.customers.update(profile.stripe_customer_id, {
    invoice_settings: { default_payment_method: payment_method_id },
  });

  res.json({ client_secret: intent.client_secret });
});

export default router;
