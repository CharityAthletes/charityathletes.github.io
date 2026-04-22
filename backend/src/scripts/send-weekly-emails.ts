/**
 * send-weekly-emails.ts (#4 — Mid-campaign weekly progress emails)
 *
 * Run weekly via cron (e.g. Railway cron or an external scheduler):
 *   npx ts-node src/scripts/send-weekly-emails.ts
 *
 * Or add to package.json:
 *   "weekly-emails": "ts-node src/scripts/send-weekly-emails.ts"
 *
 * Railway cron: set CRON_SCHEDULE=0 9 * * 1 (every Monday at 9 AM JST)
 */

import 'dotenv/config';
import { db } from '../config/supabase';
import { sendWeeklyProgressEmail } from '../services/emailService';

async function main() {
  console.log('[WeeklyEmails] Starting...');

  // Find all active campaigns with >=1 week remaining
  const { data: campaigns } = await db
    .from('campaigns')
    .select('id, title_ja, title_en, end_date, created_by, sport_types')
    .eq('is_active', true)
    .gt('end_date', new Date().toISOString());

  if (!campaigns || campaigns.length === 0) {
    console.log('[WeeklyEmails] No active campaigns');
    return;
  }

  const appUrl = process.env.APP_URL?.startsWith('http')
    ? process.env.APP_URL
    : 'https://donate.charityathletes.org';

  for (const campaign of campaigns) {
    const daysLeft = Math.ceil(
      (new Date(campaign.end_date).getTime() - Date.now()) / 86_400_000
    );

    // Skip campaigns ending in < 2 days (they'll get finalize email)
    if (daysLeft < 2) continue;

    // Get all athletes participating in this campaign
    const { data: participants } = await db
      .from('campaign_participations')
      .select('user_id, total_distance_km, total_donated_jpy')
      .eq('campaign_id', campaign.id);

    if (!participants || participants.length === 0) continue;

    // Get donor count and estimated total from pledges
    const { data: pledges } = await db
      .from('donor_pledges')
      .select('flat_amount_jpy, per_km_rate_jpy, status')
      .eq('campaign_id', campaign.id)
      .not('status', 'eq', 'cancelled');

    const donorCount = pledges?.length ?? 0;

    for (const participant of participants) {
      const { data: profile } = await db
        .from('user_profiles')
        .select('display_name')
        .eq('user_id', participant.user_id)
        .single();

      const { data: authUser } = await db.auth.admin.getUserById(participant.user_id);
      const email = authUser.user?.email;
      if (!email) continue;

      const km = participant.total_distance_km ?? 0;
      const flatTotal = (pledges ?? []).reduce((s, p) => s + (p.flat_amount_jpy ?? 0), 0);
      const perKmTotal = (pledges ?? []).reduce((s, p) => s + ((p.per_km_rate_jpy ?? 0) * km), 0);
      const estimatedJpy = Math.round(flatTotal + perKmTotal);

      await sendWeeklyProgressEmail({
        athleteEmail:     email,
        athleteName:      profile?.display_name ?? 'アスリート',
        campaignTitleJa:  campaign.title_ja,
        campaignTitleEn:  campaign.title_en ?? campaign.title_ja,
        campaignId:       campaign.id,
        totalKm:          km,
        estimatedJpy,
        donorCount,
        daysLeft,
        appUrl,
      });

      console.log(`[WeeklyEmails] Sent to ${email} for campaign ${campaign.id}`);
    }
  }

  console.log('[WeeklyEmails] Done');
}

main().catch(err => {
  console.error('[WeeklyEmails] Fatal error:', err);
  process.exit(1);
});
