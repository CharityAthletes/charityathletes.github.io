/**
 * Donation Engine
 *
 * Called after a new Strava activity is synced.
 * For each active campaign participation:
 *   - Checks sport type match and date range
 *   - Calculates:  flat_amount + (distance_km × pledge_per_km_jpy)
 *     Both portions are independently enabled/disabled per participation.
 *   - Charges via Stripe off-session
 *   - Records the donation and updates aggregates via a single RPC call
 */
import { db } from '../config/supabase';
import { stripeService } from './stripeService';
import { donorboxService } from './donorboxService';

interface ActivityRow {
  id: string;
  user_id: string;
  sport_type: string;
  distance_meters: number;
  start_date: string;
  name: string;
  is_processed: boolean;
}

interface ParticipationWithCampaign {
  id: string;
  campaign_id: string;
  user_id: string;
  pledge_flat_enabled: boolean;
  pledge_per_km_jpy: number | null;
  stripe_customer_id: string | null;
  campaigns: {
    id: string;
    sport_types: string[];
    flat_amount_jpy: number | null;
    per_km_rate_jpy: number | null;
    start_date: string;
    end_date: string;
    is_active: boolean;
    donorbox_campaign_id: string;
    nonprofits: {
      donorbox_account_id: string;
    } | null;
  };
}

export async function processActivityDonations(activityId: string): Promise<void> {
  const { data: activity } = await db
    .from('activities')
    .select('*')
    .eq('id', activityId)
    .single<ActivityRow>();

  if (!activity || activity.is_processed) return;

  const { data: participations } = await db
    .from('campaign_participations')
    .select('*, campaigns(*, nonprofits(donorbox_account_id))')
    .eq('user_id', activity.user_id);

  const now = new Date();
  const distanceKm = activity.distance_meters / 1000;

  for (const p of (participations ?? []) as ParticipationWithCampaign[]) {
    const c = p.campaigns;

    // Guard: campaign must be active, in date range, and sport must match
    if (!c.is_active) continue;
    if (new Date(c.start_date) > now || new Date(c.end_date) < now) continue;
    if (!c.sport_types.some(t => activity.sport_type.toLowerCase().includes(t.toLowerCase()))) continue;

    // Calculate donation amounts
    const flatJpy = (p.pledge_flat_enabled && c.flat_amount_jpy) ? c.flat_amount_jpy : 0;
    const perKmJpy = (p.pledge_per_km_jpy != null)
      ? Math.round(p.pledge_per_km_jpy * distanceKm)
      : 0;
    const totalJpy = flatJpy + perKmJpy;
    if (totalJpy <= 0) continue;

    // Create pending donation record
    const { data: donation, error: donErr } = await db
      .from('donations')
      .insert({
        user_id:          activity.user_id,
        campaign_id:      c.id,
        participation_id: p.id,
        activity_id:      activity.id,
        flat_amount_jpy:  flatJpy,
        per_km_amount_jpy: perKmJpy,
        distance_km:      distanceKm,
        status:           'pending',
        trigger_type:     'activity',
      })
      .select('id')
      .single();

    if (donErr || !donation) {
      console.error('[DonationEngine] Failed to insert donation', donErr);
      continue;
    }

    // Require saved payment method
    if (!p.stripe_customer_id) {
      console.info(`[DonationEngine] User ${activity.user_id} has no Stripe customer; skipping charge`);
      continue;
    }

    try {
      const desc = `チャリアス: ${activity.name} ${distanceKm.toFixed(1)}km — ¥${totalJpy}`;
      const intent = await stripeService.chargeOffSession({
        customerId:  p.stripe_customer_id,
        amountJpy:   totalJpy,
        campaignId:  c.id,
        activityId:  activity.id,
        userId:      activity.user_id,
        description: desc,
      });

      await db
        .from('donations')
        .update({
          stripe_payment_intent_id: intent.id,
          stripe_status:            intent.status,
          status:                   intent.status === 'succeeded' ? 'completed' : 'pending',
        })
        .eq('id', donation.id);

      if (intent.status === 'succeeded') {
        // Update all aggregates atomically
        await db.rpc('record_donation_completed', {
          p_donation_id:      donation.id,
          p_participation_id: p.id,
          p_campaign_id:      c.id,
          p_user_id:          activity.user_id,
          p_total_jpy:        totalJpy,
          p_distance_km:      distanceKm,
        });

        // Async Donorbox reconciliation (fire-and-forget)
        void reconcileDonorbox(c.donorbox_campaign_id, c.nonprofits?.donorbox_account_id, totalJpy, activity.user_id);
      }
    } catch (err: unknown) {
      console.error('[DonationEngine] Stripe charge failed', err instanceof Error ? err.message : err);
      await db.from('donations').update({ status: 'failed' }).eq('id', donation.id);
    }
  }

  await db.from('activities').update({ is_processed: true }).eq('id', activityId);
}

async function reconcileDonorbox(
  campaignId: string,
  donorboxAccountId: string | undefined,
  amountJpy: number,
  userId: string
): Promise<void> {
  if (!donorboxAccountId) return;
  try {
    const { data: profile } = await db
      .from('user_profiles')
      .select('display_name')
      .eq('user_id', userId)
      .single();
    const { data: authUser } = await db.auth.admin.getUserById(userId);

    await donorboxService.recordDonation({
      accountEmail: donorboxAccountId,     // stored as email in nonprofits table
      apiKey:       process.env.DONORBOX_MASTER_API_KEY ?? '',
      campaignId,
      amountJpy,
      donorName:  profile?.display_name ?? 'Anonymous',
      donorEmail: authUser.user?.email ?? '',
      note:       'チャリアス経由の寄付 / via Charity Athletes',
    });
  } catch (err) {
    console.warn('[DonationEngine] Donorbox reconciliation failed:', err);
  }
}
