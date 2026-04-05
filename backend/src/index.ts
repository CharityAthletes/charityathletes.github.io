import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import authRoutes      from './routes/auth';
import campaignRoutes  from './routes/campaigns';
import donationRoutes  from './routes/donations';
import webhookRoutes   from './routes/webhooks';
import nonprofitRoutes from './routes/nonprofit';
import nonprofitsRoutes from './routes/nonprofits';
import adminRoutes     from './routes/admin';
import webRoutes       from './routes/web';

const app  = express();
const PORT = process.env.PORT ?? 3000;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", 'https://js.stripe.com'],
      frameSrc:    ["'self'", 'https://js.stripe.com', 'https://*.stripe.com'],
      connectSrc:  ["'self'", 'https://api.stripe.com'],
      imgSrc:      ["'self'", 'data:', 'https:'],
      styleSrc:    ["'self'", "'unsafe-inline'"],
    },
  },
}));
app.use(cors({
  origin: [process.env.WEB_URL ?? 'https://charityathletes.com', /^charityathletes:\/\//],
  credentials: true,
}));
app.use(rateLimit({ windowMs: 15 * 60_000, max: 200, standardHeaders: true, legacyHeaders: false }));

// Stripe webhooks need raw body before JSON parsing
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));
app.use(express.json());

app.use('/auth',      authRoutes);
app.use('/campaigns', campaignRoutes);
app.use('/donations', donationRoutes);
app.use('/webhooks',  webhookRoutes);
app.use('/nonprofit', nonprofitRoutes);
app.use('/nonprofits', nonprofitsRoutes);
app.use('/admin',     adminRoutes);
app.use('/c',         webRoutes);

app.get('/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));
app.use((_, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => console.log(`[チャリアス API] listening on :${PORT}`));
export default app;
