/**
 * pushService.ts — Apple Push Notification Service (APNS) via HTTP/2 (#1)
 *
 * Uses the node-apn package or the simpler fetch-based approach.
 * For production, add to .env:
 *   APNS_KEY_ID=       (your .p8 key ID from Apple Developer portal)
 *   APNS_TEAM_ID=      (your Apple Developer Team ID)
 *   APNS_KEY_PATH=     (path to AuthKey_XXXXXXXX.p8 file, or paste content in APNS_KEY_P8)
 *   APNS_KEY_P8=       (full contents of the .p8 file, newlines escaped as \n)
 *   APNS_BUNDLE_ID=    com.charityathletes.app
 *   APNS_ENV=          production | development  (default: development)
 *
 * This service gracefully no-ops if keys are not configured.
 */

import { db } from '../config/supabase';

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

// Lazy-initialised APNS provider (only created once)
let apnProvider: any = null;

async function getProvider() {
  if (apnProvider) return apnProvider;

  const keyId   = process.env.APNS_KEY_ID;
  const teamId  = process.env.APNS_TEAM_ID;
  const keyP8   = process.env.APNS_KEY_P8?.replace(/\\n/g, '\n');
  const keyPath = process.env.APNS_KEY_PATH;

  if (!keyId || !teamId || (!keyP8 && !keyPath)) return null; // not configured

  try {
    const apn = await import('apn');
    apnProvider = new apn.Provider({
      token: { key: keyP8 ?? keyPath!, keyId, teamId },
      production: process.env.APNS_ENV === 'production',
    });
    return apnProvider;
  } catch (err) {
    console.warn('[Push] apn module not installed. Run: npm install apn');
    return null;
  }
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const provider = await getProvider();
  if (!provider) return; // APNS not configured

  const bundleId = process.env.APNS_BUNDLE_ID ?? 'com.charityathletes.app';

  // Look up device tokens for this user
  const { data: tokens } = await db
    .from('device_tokens')
    .select('token')
    .eq('user_id', userId)
    .eq('platform', 'ios');

  if (!tokens || tokens.length === 0) return;

  const apn = await import('apn');
  const note = new apn.Notification();
  note.alert = { title: payload.title, body: payload.body };
  note.sound = 'default';
  note.topic = bundleId;
  if (payload.data) note.payload = payload.data;

  for (const { token } of tokens) {
    try {
      const result = await provider.send(note, token);
      if (result.failed.length > 0) {
        console.error('[Push] failed for token:', token, result.failed[0].response);
        // Remove invalid tokens
        if (result.failed[0].response?.reason === 'BadDeviceToken' ||
            result.failed[0].response?.reason === 'Unregistered') {
          await db.from('device_tokens').delete().eq('token', token);
        }
      }
    } catch (err) {
      console.error('[Push] error sending to', token, err);
    }
  }
}

export async function notifyAthleteNewDonor(opts: {
  athleteUserId: string;
  donorName: string;
  campaignTitleJa: string;
  campaignId: string;
  isAnonymous: boolean;
}): Promise<void> {
  const { athleteUserId, donorName, campaignTitleJa, campaignId, isAnonymous } = opts;
  const displayName = isAnonymous ? '匿名の方' : donorName;

  await sendPushToUser(athleteUserId, {
    title: '🎉 新しい寄付者が申し込みました',
    body:  `${displayName} が「${campaignTitleJa}」を支援してくれました！`,
    data:  { type: 'new_donor', campaign_id: campaignId },
  });
}
