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
app.use('/api', (req, res, next) => {
  const usesCookie = /(?:^|;\s*)imsop_access=/.test(req.headers.cookie || '');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && usesCookie && !req.headers.authorization) {
    if (!req.headers.origin || !getAllowedOrigins().includes(req.headers.origin)) {
      return res.status(403).json({ error: 'Cross-site session request blocked' });
    }
  }
  next();
});

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

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((error: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (res.headersSent) return _next(error);
  const status = error.status === 400 || error.status === 413 ? error.status : 500;
  if (status === 500) console.error('[api] Request failed', { name: error.name });
  res.status(status).json({ error: status === 400 ? 'Invalid JSON body' : status === 413 ? 'Request body too large' : 'Internal server error' });
});

export default app;
