import express from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes';
import operationsRoutes from './routes/operationsRoutes';
import telemetryRoutes from './routes/telemetryRoutes';
import { rateLimit } from './middleware/rateLimit';
import logisticsIntegrationRoutes from './routes/logisticsIntegrationRoutes';
import { db } from './config/db';
import { sql } from 'drizzle-orm';
import { getAllowedOrigins } from './config/security';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(cors({
  origin: getAllowedOrigins(),
  credentials: true,
}));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});
app.use(express.json({
  limit: '100kb',
  verify: (req, _res, buffer) => { (req as express.Request).rawBody = Buffer.from(buffer); },
}));
app.use('/api', rateLimit(60_000, 120));

app.use('/api/auth', authRoutes);
app.use('/api/operations', operationsRoutes);
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/integrations/logistics', logisticsIntegrationRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});
app.get('/ready', async (_req, res) => {
  try {
    await db.execute(sql`SELECT 1`);
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not_ready' });
  }
});

export default app;
