/**
 * Strava webhook subscription management
 *
 * Usage (from backend/ directory):
 *   npx ts-node src/scripts/strava-webhook.ts status
 *   npx ts-node src/scripts/strava-webhook.ts register <public-callback-url>
 *   npx ts-node src/scripts/strava-webhook.ts delete
 *
 * Example:
 *   npx ts-node src/scripts/strava-webhook.ts register https://abc123.ngrok.io/webhooks/strava
 */

import 'dotenv/config';
import axios from 'axios';

const BASE = 'https://www.strava.com/api/v3/push_subscriptions';
const params = {
  client_id:     process.env.STRAVA_CLIENT_ID!,
  client_secret: process.env.STRAVA_CLIENT_SECRET!,
};

const [,, cmd, callbackUrl] = process.argv;

async function status() {
  const { data } = await axios.get(BASE, { params });
  if (!data.length) {
    console.log('No active Strava webhook subscription.');
  } else {
    console.log('Active subscription:', JSON.stringify(data, null, 2));
  }
}

async function register(url: string) {
  if (!url) { console.error('Please provide a callback URL.'); process.exit(1); }
  const { data } = await axios.post(BASE, {
    ...params,
    callback_url:  url,
    verify_token:  process.env.STRAVA_WEBHOOK_VERIFY_TOKEN!,
  });
  console.log('✅ Webhook registered:', JSON.stringify(data, null, 2));
}

async function del() {
  const { data: subs } = await axios.get(BASE, { params });
  if (!subs.length) { console.log('No subscription to delete.'); return; }
  await axios.delete(`${BASE}/${subs[0].id}`, { params });
  console.log(`✅ Deleted subscription ${subs[0].id}`);
}

(async () => {
  try {
    if      (cmd === 'status')   await status();
    else if (cmd === 'register') await register(callbackUrl);
    else if (cmd === 'delete')   await del();
    else {
      console.log('Commands: status | register <url> | delete');
      process.exit(1);
    }
  } catch (e: any) {
    console.error('Error:', e.response?.data ?? e.message);
    process.exit(1);
  }
})();
