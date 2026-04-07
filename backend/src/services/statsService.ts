import { db } from '../config/supabase';

/**
 * Recalculates a user's stats and updates:
 *   - user_profiles.total_distance_km        (sum of all activities)
 *   - campaign_participations.total_distance_km / activity_count
 *       (distance within each campaign's sport-type / date-range / cap)
 *
 * Call this after every Strava sync.
 */
export async function recalcDistanceStats(userId: string): Promise<void> {
  // 1. Overall lifetime distance
  const { data: allActs } = await db
    .from('activities')
    .select('distance_meters')
    .eq('user_id', userId)
    .is('deleted_at', null);

  const totalDistanceKm =
    Math.round(
      ((allActs ?? []).reduce((s, a: any) => s + (a.distance_meters ?? 0), 0) / 1000) * 10
    ) / 10;

  await db
    .from('user_profiles')
    .update({ total_distance_km: totalDistanceKm })
    .eq('user_id', userId);

  // 2. Per-campaign distance for each participation
  const { data: participations } = await db
    .from('campaign_participations')
    .select('id, campaign_id, campaigns(start_date, end_date, sport_types, max_distance_km)')
    .eq('user_id', userId);

  for (const p of participations ?? []) {
    const campaign = (p as any).campaigns;
    if (!campaign) continue;

    let query = db
      .from('activities')
      .select('distance_meters')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .gte('start_date_local', campaign.start_date)
      .lte('start_date_local', campaign.end_date);

    const sportTypes: string[] = campaign.sport_types ?? [];
    if (sportTypes.length > 0) {
      query = query.in('sport_type', sportTypes);
    }

    const { data: campActs } = await query;
    let distKm =
      (campActs ?? []).reduce((s, a: any) => s + (a.distance_meters ?? 0), 0) / 1000;
    if (campaign.max_distance_km) distKm = Math.min(distKm, campaign.max_distance_km);
    distKm = Math.round(distKm * 10) / 10;

    await db
      .from('campaign_participations')
      .update({ total_distance_km: distKm, activity_count: (campActs ?? []).length })
      .eq('id', (p as any).id);
  }

  console.log(`[Stats] recalcDistanceStats for ${userId}: ${totalDistanceKm} km total`);
}

/**
 * Recalculates a user's total donated (raised) amount and updates:
 *   - user_profiles.total_donated_jpy  — total raised across all campaigns
 *   - campaign_participations.total_donated_jpy — per-campaign breakdown
 *
 * Counts:
 *   - Per-km pledges where athlete_user_id = userId (charged)
 *   - Flat donations (athlete_user_id IS NULL) on campaigns created_by userId
 *
 * Call this after pledges are charged (finalize or checkout webhook).
 */
export async function recalcDonatedStats(userId: string): Promise<void> {
  // Get all campaigns this user created (flat donations land here with athlete_user_id = null)
  const { data: createdCampaigns } = await db
    .from('campaigns')
    .select('id')
    .eq('created_by', userId);
  const createdIds = new Set((createdCampaigns ?? []).map((c: any) => c.id));

  // Get all campaign_participations for this user (for per-km pledges)
  const { data: participations } = await db
    .from('campaign_participations')
    .select('id, campaign_id')
    .eq('user_id', userId);

  // Build a unified set of campaign IDs to process
  const allCampaignIds = new Set([
    ...((participations ?? []).map((p: any) => p.campaign_id)),
    ...createdIds,
  ]);

  let grandTotal = 0;

  for (const campaignId of allCampaignIds) {
    // Per-km pledges directly tied to this athlete
    const { data: perKmPledges } = await db
      .from('donor_pledges')
      .select('charged_amount_jpy')
      .eq('campaign_id', campaignId)
      .eq('athlete_user_id', userId)
      .eq('status', 'charged');

    let campTotal = (perKmPledges ?? []).reduce(
      (s, pl: any) => s + (pl.charged_amount_jpy ?? 0), 0
    );

    // Flat donations (no specific athlete) on campaigns this user created
    if (createdIds.has(campaignId)) {
      const { data: flatPledges } = await db
        .from('donor_pledges')
        .select('charged_amount_jpy')
        .eq('campaign_id', campaignId)
        .is('athlete_user_id', null)
        .eq('status', 'charged');

      campTotal += (flatPledges ?? []).reduce(
        (s, pl: any) => s + (pl.charged_amount_jpy ?? 0), 0
      );
    }

    grandTotal += campTotal;

    // Update campaign_participations row if it exists
    const participation = (participations ?? []).find((p: any) => p.campaign_id === campaignId);
    if (participation) {
      await db
        .from('campaign_participations')
        .update({ total_donated_jpy: campTotal })
        .eq('id', (participation as any).id);
    }
  }

  await db
    .from('user_profiles')
    .update({ total_donated_jpy: grandTotal })
    .eq('user_id', userId);

  console.log(`[Stats] recalcDonatedStats for ${userId}: ¥${grandTotal} total`);
}
