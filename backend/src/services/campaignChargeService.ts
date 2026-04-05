/**
 * Campaign End Charge Service
 *
 * Finds all campaigns whose end_date has passed (is_active = true),
 * calculates total km, charges every confirmed per-km donor pledge,
 * then marks the campaign inactive.
 *
 * Run via:  npx ts-node src/scripts/charge-ended-campaigns.ts
 */

import { db } from '../config/supabase';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

interface CampaignRow {
  id: string;
  title_ja: string;
  created_by: string;
  start_date: string;
  end_date: string;
  max_distance_km: number | null;
  sport_types: string[];
}

interface PledgeRow {
  id: string;
  donor_name: string;
  donor_email: string;
  per_km_rate_jpy: number;
  stripe_customer_id: string;
  stripe_payment_method_id: string;
}

export interface ChargeResult {
  campaignsProcessed: number;
  pledgesCharged: number;
  pledgesFailed: number;
  pledgesSkipped: number;
}

export async function chargeEndedCampaigns(): Promise<ChargeResult> {
  const now = new Date().toISOString();

  // Find campaigns that have ended but haven't been closed yet
  const { data: campaigns, error } = await db
    .from('campaigns')
    .select('id, title_ja, created_by, start_date, end_date, max_distance_km, sport_types')
    .eq('is_active', true)
    .lt('end_date', now);

  if (error) throw new Error(`Failed to fetch campaigns: ${error.message}`);

  if (!campaigns?.length) {
    console.log('[CampaignCharge] No ended campaigns to process.');
    return { campaignsProcessed: 0, pledgesCharged: 0, pledgesFailed: 0, pledgesSkipped: 0 };
  }

  let pledgesCharged = 0;
  let pledgesFailed = 0;
  let pledgesSkipped = 0;

  for (const campaign of campaigns as CampaignRow[]) {
    console.log(`\n[CampaignCharge] Processing: "${campaign.title_ja}" (${campaign.id})`);

    try {
      const { charged, failed, skipped } = await chargeCampaign(campaign);
      pledgesCharged += charged;
      pledgesFailed  += failed;
      pledgesSkipped += skipped;

      // Mark campaign inactive after all pledges are processed
      await db.from('campaigns').update({ is_active: false }).eq('id', campaign.id);
      console.log(`[CampaignCharge] ✅ Campaign closed.`);
    } catch (err: any) {
      console.error(`[CampaignCharge] ❌ Campaign failed:`, err.message);
    }
  }

  return {
    campaignsProcessed: campaigns.length,
    pledgesCharged,
    pledgesFailed,
    pledgesSkipped,
  };
}

async function chargeCampaign(campaign: CampaignRow): Promise<{
  charged: number;
  failed: number;
  skipped: number;
}> {
  // ── 1. Calculate total km (same logic as donationEngine.ts) ─────────────────

  const { data: activities } = await db
    .from('activities')
    .select('distance_meters, sport_type')
    .eq('user_id', campaign.created_by)
    .gte('start_date', campaign.start_date)
    .lte('start_date', campaign.end_date)
    .is('deleted_at', null);

  // Use partial-match sport type filter (e.g. 'Run' matches 'TrailRun')
  const totalKm = (activities ?? [])
    .filter(a => campaign.sport_types.some(t =>
      a.sport_type.toLowerCase().includes(t.toLowerCase())
    ))
    .reduce((sum, a) => sum + a.distance_meters / 1000, 0);

  const cappedKm = campaign.max_distance_km
    ? Math.min(totalKm, campaign.max_distance_km)
    : totalKm;

  console.log(`  Athlete total: ${totalKm.toFixed(1)} km → charged at: ${cappedKm.toFixed(1)} km`);

  // ── 2. Fetch confirmed per-km pledges ────────────────────────────────────────

  const { data: pledges, error } = await db
    .from('donor_pledges')
    .select('id, donor_name, donor_email, per_km_rate_jpy, stripe_customer_id, stripe_payment_method_id')
    .eq('campaign_id', campaign.id)
    .eq('status', 'confirmed');

  if (error) throw new Error(`Failed to fetch pledges: ${error.message}`);

  console.log(`  Confirmed per-km pledges: ${pledges?.length ?? 0}`);

  let charged = 0;
  let failed  = 0;
  let skipped = 0;

  // ── 3. Charge each pledge ────────────────────────────────────────────────────

  for (const pledge of (pledges ?? []) as PledgeRow[]) {
    const chargeAmount = Math.round(cappedKm * pledge.per_km_rate_jpy);

    // Skip if amount is too small (Stripe minimum for JPY is ¥50)
    if (chargeAmount < 50) {
      console.log(`  ⏭  Skipping ${pledge.donor_email}: ¥${chargeAmount} below minimum`);
      await db.from('donor_pledges')
        .update({ status: 'skipped' })
        .eq('id', pledge.id);
      skipped++;
      continue;
    }

    try {
      const intent = await stripe.paymentIntents.create({
        amount:   chargeAmount,
        currency: 'jpy',
        customer: pledge.stripe_customer_id,
        payment_method: pledge.stripe_payment_method_id,
        off_session: true,
        confirm: true,
        description: `チャリアス: ${campaign.title_ja} — ${cappedKm.toFixed(1)}km × ¥${pledge.per_km_rate_jpy}/km`,
        metadata: {
          campaign_id:  campaign.id,
          pledge_id:    pledge.id,
          donor_email:  pledge.donor_email,
        },
      });

      await db.from('donor_pledges').update({
        status:                    'charged',
        charged_amount_jpy:        chargeAmount,
        charged_at:                new Date().toISOString(),
        stripe_payment_intent_id:  intent.id,
      }).eq('id', pledge.id);

      console.log(`  ✅ Charged ${pledge.donor_email}: ¥${chargeAmount.toLocaleString()}`);
      charged++;
    } catch (err: any) {
      console.error(`  ❌ Failed ${pledge.donor_email}:`, err.message);
      await db.from('donor_pledges')
        .update({ status: 'failed' })
        .eq('id', pledge.id);
      failed++;
    }
  }

  return { charged, failed, skipped };
}
