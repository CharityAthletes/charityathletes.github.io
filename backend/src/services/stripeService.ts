import { stripe } from '../config/stripe';
import { db } from '../config/supabase';
import type Stripe from 'stripe';

export const stripeService = {
  // ── Customer ──────────────────────────────────────────────────────────────

  async getOrCreateCustomer(userId: string, email: string, name: string): Promise<string> {
    const { data: profile } = await db
      .from('user_profiles')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single();

    if (profile?.stripe_customer_id) return profile.stripe_customer_id as string;

    const customer = await stripe.customers.create({
      email,
      name,
      metadata: { supabase_user_id: userId },
    });

    await db
      .from('user_profiles')
      .update({ stripe_customer_id: customer.id })
      .eq('user_id', userId);

    return customer.id;
  },

  // ── Save card (SetupIntent) ───────────────────────────────────────────────

  async createSetupIntent(customerId: string): Promise<{ client_secret: string }> {
    const intent = await stripe.setupIntents.create({
      customer:             customerId,
      payment_method_types: ['card'],
      usage:                'off_session',
    });
    return { client_secret: intent.client_secret! };
  },

  // ── Off-session charge (activity-triggered donation) ─────────────────────

  async chargeOffSession(params: {
    customerId: string;
    amountJpy:  number;
    campaignId: string;
    activityId: string;
    userId:     string;
    description: string;
  }): Promise<Stripe.PaymentIntent> {
    const customer = await stripe.customers.retrieve(params.customerId) as Stripe.Customer;
    const pmId = customer.invoice_settings?.default_payment_method as string | undefined;
    if (!pmId) throw new Error('No default payment method on file');

    return stripe.paymentIntents.create({
      amount:         params.amountJpy,   // JPY = zero-decimal currency
      currency:       'jpy',
      customer:       params.customerId,
      payment_method: pmId,
      off_session:    true,
      confirm:        true,
      description:    params.description,
      metadata: {
        campaign_id: params.campaignId,
        activity_id: params.activityId,
        user_id:     params.userId,
      },
    });
  },

  // ── One-time manual donation (Checkout Session) ───────────────────────────

  async createCheckoutSession(params: {
    customerId:  string;
    amountJpy:   number;
    campaignId:  string;
    userId:      string;
    successUrl:  string;
    cancelUrl:   string;
  }): Promise<{ url: string }> {
    const session = await stripe.checkout.sessions.create({
      mode:     'payment',
      customer: params.customerId,
      line_items: [{
        price_data: {
          currency:     'jpy',
          product_data: { name: 'チャリアス 寄付 / Charity Athletes Donation' },
          unit_amount:  params.amountJpy,
        },
        quantity: 1,
      }],
      success_url: params.successUrl,
      cancel_url:  params.cancelUrl,
      metadata: {
        campaign_id: params.campaignId,
        user_id:     params.userId,
        trigger_type: 'manual',
      },
    });
    return { url: session.url! };
  },

  // ── Webhook ───────────────────────────────────────────────────────────────

  constructEvent(payload: Buffer, sig: string): Stripe.Event {
    return stripe.webhooks.constructEvent(
      payload,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  },
};
