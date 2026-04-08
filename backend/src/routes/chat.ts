import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a friendly support assistant for Charity Athletes (チャリアス), a mobile iOS app that connects athletes' Strava activities to charitable donations.

## About the App
- Athletes connect their Strava account and join fundraising campaigns
- Donors pledge a per-km rate (e.g. ¥10/km) or a flat amount
- When an athlete logs an activity on Strava, donors are automatically charged via Stripe
- Funds go directly to partner nonprofits via Donorbox

## Supported Sports
- Cycling (Ride), Virtual Ride, Running, Walking, Swimming

## Partner Nonprofits
- Cycling for Charity (サイクリング・フォー・チャリティ) - cyclingforcharityjapan.com
- Ashinaga (あしなが育英会) - ashinaga.org - supports children who lost a parent
- TELL Japan - telljp.com - mental health support in English in Japan

## Key Information
- App available on iOS App Store
- Sign in with Apple ID
- Payments processed securely by Stripe (card numbers never stored by the app)
- Strava data used: activity type, distance, start date/time only
- Available in Japanese and English

## Common Issues & Solutions

**Strava not syncing:**
- Check Strava is connected in Profile tab
- Ensure activity date is within campaign date range
- Check activity sport type matches campaign's eligible sports
- Verify activity saved correctly on Strava

**Can't sign in:**
- Uses Sign in with Apple - tap the button and authenticate with Face ID/Touch ID/passcode

**Donation questions:**
- Donors receive charges after each activity is logged
- To stop donations: email support@charityathletes.org
- Receipts available via Donorbox

**Account deletion:**
- Email support@charityathletes.org with subject "Account Deletion Request"

**Disconnect Strava:**
- In app: Profile → Strava Connection → Disconnect
- In Strava: Settings → My Apps → Charity Athletes → Revoke Access

## Contact
- Email: support@charityathletes.org
- Website: https://charityathletes.org
- Support page: https://charityathletes.org/support.html

## Response Guidelines
- Be friendly, concise, and helpful
- Respond in the same language the user writes in (Japanese or English)
- If you cannot resolve the issue, direct them to support@charityathletes.org
- Keep responses brief — 2-4 sentences unless more detail is needed
- Do not make up features or information not listed above`;

router.post('/', async (req: Request, res: Response) => {
  try {
    const { message, history = [] } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (message.length > 1000) {
      return res.status(400).json({ error: 'Message too long' });
    }

    // Build conversation history (max last 10 messages)
    const messages = [
      ...history.slice(-10).map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: message.trim() },
    ];

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages,
    });

    const reply = response.content[0].type === 'text' ? response.content[0].text : '';
    return res.json({ reply });
  } catch (err) {
    console.error('[chat] error:', err);
    return res.status(500).json({ error: 'Failed to get response. Please try again.' });
  }
});

export default router;
