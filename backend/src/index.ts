import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import authRoutes      from './routes/auth';
import campaignRoutes  from './routes/campaigns';
import donationRoutes  from './routes/donations';
import webhookRoutes   from './routes/webhooks';
import nonprofitRoutes from './routes/nonprofit';
import nonprofitsRoutes from './routes/nonprofits';
import adminRoutes     from './routes/admin';
import charitiesRoutes  from './routes/charities';
import activitiesRoutes from './routes/activities';
import webRoutes        from './routes/web';
import { renderDirectoryPage } from './routes/directory';

const app  = express();
const PORT = process.env.PORT ?? 3000;

// Trust Railway's reverse proxy so rate-limiter and IP detection work correctly
app.set('trust proxy', 1);

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

// Static assets (logo, OG images, etc.)
app.use('/static', express.static(path.join(__dirname, '../public')));

// Stripe webhooks need raw body before JSON parsing
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));
app.use(express.json());

app.use('/auth',      authRoutes);
app.use('/campaigns', campaignRoutes);
app.use('/donations', donationRoutes);
app.use('/webhooks',  webhookRoutes);
app.use('/nonprofit', nonprofitRoutes);
app.use('/nonprofits', nonprofitsRoutes);
app.use('/admin',       adminRoutes);
app.use('/charities',   charitiesRoutes);
app.use('/activities',  activitiesRoutes);
app.use('/c',           webRoutes);

// Web: public charity directory page
app.get('/directory', async (req, res) => {
  const { db } = await import('./config/supabase');
  const { data } = await db.from('charities').select('*').eq('is_active', true)
    .order('is_featured', { ascending: false }).order('name_en');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(renderDirectoryPage(data ?? []));
});

app.get('/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));
app.use((_, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => console.log(`[チャリアス API] listening on :${PORT}`));
export default app;
