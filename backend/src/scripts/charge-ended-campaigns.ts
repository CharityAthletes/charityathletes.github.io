/**
 * Charge donors for ended campaigns
 *
 * Usage (from backend/ directory):
 *   npx ts-node src/scripts/charge-ended-campaigns.ts
 *
 * Run this daily via cron or a scheduler.
 * It is safe to run multiple times — already-charged pledges are skipped.
 */

import 'dotenv/config';
import { chargeEndedCampaigns } from '../services/campaignChargeService';

async function main() {
  console.log('=== Campaign End Charge Job ===');
  console.log('Started:', new Date().toISOString());

  const result = await chargeEndedCampaigns();

  console.log('\n--- Summary ---');
  console.log('Campaigns processed:', result.campaignsProcessed);
  console.log('Pledges charged:    ', result.pledgesCharged);
  console.log('Pledges failed:     ', result.pledgesFailed);
  console.log('Pledges skipped:    ', result.pledgesSkipped);
  console.log('Finished:', new Date().toISOString());

  process.exitCode = result.pledgesFailed > 0 ? 1 : 0;
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exitCode = 1;
});
