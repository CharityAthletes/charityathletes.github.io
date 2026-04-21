/**
 * emailService.ts — transactional email via Resend (https://resend.com)
 *
 * Set RESEND_API_KEY in .env to enable. All functions silently no-op if the
 * key is absent so the app works without email configured.
 *
 * Add to .env:
 *   RESEND_API_KEY=re_xxxxxx
 *   EMAIL_FROM=チャリアス <noreply@charityathletes.org>
 */

const RESEND_URL = 'https://api.resend.com/emails';
const from = process.env.EMAIL_FROM ?? 'チャリアス <noreply@charityathletes.org>';

async function send(to: string, subject: string, html: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return; // email not configured — silently skip

  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[Email] send error', res.status, body);
    }
  } catch (err) {
    console.error('[Email] fetch error:', err);
  }
}

// ── #5 Donation receipt ───────────────────────────────────────────────────────

export async function sendDonationReceipt(opts: {
  donorEmail: string;
  donorName: string;
  campaignTitleJa: string;
  campaignTitleEn: string;
  amountJpy: number;
  isFlat: boolean;
  rateJpy?: number;
  athleteName: string;
}): Promise<void> {
  const { donorEmail, donorName, campaignTitleJa, campaignTitleEn, amountJpy, isFlat, rateJpy, athleteName } = opts;

  const subjectJa = `✅ 寄付の申し込みを受け付けました — ${campaignTitleJa}`;
  const subjectEn = `✅ Donation pledge received — ${campaignTitleEn}`;

  const htmlJa = isFlat ? `
<p>${donorName} さん、ご寄付ありがとうございます。</p>
<p>「<strong>${campaignTitleJa}</strong>」へ ¥${amountJpy.toLocaleString()} の寄付を受け付けました。<br>
カードへの請求は完了しています。</p>
<p>アスリート <strong>${athleteName}</strong> の活動をぜひ応援してください！</p>
<p style="color:#86868b;font-size:12px">— チャリアス (Charity Athletes)</p>
` : `
<p>${donorName} さん、距離連動の寄付を申し込みいただきありがとうございます。</p>
<p>「<strong>${campaignTitleJa}</strong>」へ ¥${rateJpy}/km のレートで申し込まれました。<br>
イベント終了後、アスリート <strong>${athleteName}</strong> の総走行距離に基づいて請求されます。</p>
<p style="color:#86868b;font-size:12px">— チャリアス (Charity Athletes)</p>
`;

  const htmlEn = isFlat ? `
<p>Hi ${donorName},</p>
<p>Thank you for your donation of <strong>¥${amountJpy.toLocaleString()}</strong> to <strong>${campaignTitleEn}</strong>!<br>
Your card has been charged.</p>
<p>Cheer on athlete <strong>${athleteName}</strong> and follow their progress!</p>
<p style="color:#86868b;font-size:12px">— Charity Athletes</p>
` : `
<p>Hi ${donorName},</p>
<p>Your per-km pledge of <strong>¥${rateJpy}/km</strong> for <strong>${campaignTitleEn}</strong> is confirmed.<br>
You will be charged at campaign end based on <strong>${athleteName}</strong>'s total distance.</p>
<p style="color:#86868b;font-size:12px">— Charity Athletes</p>
`;

  await send(donorEmail, `${subjectJa} / ${subjectEn}`, `${htmlJa}<hr>${htmlEn}`);
}

// ── #4 Mid-campaign weekly progress email ────────────────────────────────────

export async function sendWeeklyProgressEmail(opts: {
  athleteEmail: string;
  athleteName: string;
  campaignTitleJa: string;
  campaignTitleEn: string;
  campaignId: string;
  totalKm: number;
  estimatedJpy: number;
  donorCount: number;
  daysLeft: number;
  appUrl: string;
}): Promise<void> {
  const { athleteEmail, athleteName, campaignTitleJa, campaignTitleEn, campaignId, totalKm, estimatedJpy, donorCount, daysLeft, appUrl } = opts;
  const donorPageUrl = `${appUrl}/c/${campaignId}`;

  const subject = `📊 週次レポート: ${campaignTitleJa} | Weekly Update: ${campaignTitleEn}`;

  const html = `
<table style="max-width:480px;margin:0 auto;font-family:-apple-system,sans-serif;color:#1d1d1f">
  <tr><td style="background:linear-gradient(135deg,#007B83,#2E7D32);padding:24px;border-radius:12px 12px 0 0;text-align:center">
    <h2 style="color:#fff;margin:0">📊 週次レポート / Weekly Update</h2>
    <p style="color:rgba(255,255,255,0.85);margin:8px 0 0">${campaignTitleJa}</p>
  </td></tr>
  <tr><td style="background:#fff;padding:24px;border-radius:0 0 12px 12px;box-shadow:0 2px 12px rgba(0,0,0,.08)">
    <p>${athleteName} さん / Hi ${athleteName},</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr>
        <td style="padding:12px;background:#f5f5f7;border-radius:8px;text-align:center;width:33%">
          <div style="font-size:24px;font-weight:700;color:#007B83">${totalKm.toFixed(1)} km</div>
          <div style="font-size:11px;color:#86868b;margin-top:2px">走行距離 / Distance</div>
        </td>
        <td style="width:4px"></td>
        <td style="padding:12px;background:#f5f5f7;border-radius:8px;text-align:center;width:33%">
          <div style="font-size:24px;font-weight:700;color:#007B83">¥${estimatedJpy.toLocaleString()}</div>
          <div style="font-size:11px;color:#86868b;margin-top:2px">寄付見込 / Est. Raised</div>
        </td>
        <td style="width:4px"></td>
        <td style="padding:12px;background:#f5f5f7;border-radius:8px;text-align:center;width:33%">
          <div style="font-size:24px;font-weight:700;color:#007B83">${donorCount}</div>
          <div style="font-size:11px;color:#86868b;margin-top:2px">サポーター / Donors</div>
        </td>
      </tr>
    </table>
    <p style="color:#86868b;font-size:13px">
      残り <strong style="color:#1d1d1f">${daysLeft} 日</strong> / <strong style="color:#1d1d1f">${daysLeft} days left</strong>
    </p>
    <a href="${donorPageUrl}" style="display:block;background:linear-gradient(135deg,#007B83,#2E7D32);color:#fff;text-align:center;padding:14px;border-radius:10px;text-decoration:none;font-weight:700;margin-top:16px">
      イベントページを見る / View Campaign Page
    </a>
    <p style="color:#86868b;font-size:11px;margin-top:16px">
      チャリアス (Charity Athletes) · <a href="${donorPageUrl}" style="color:#007B83">charityathletes.org</a>
    </p>
  </td></tr>
</table>
`;

  await send(athleteEmail, subject, html);
}
