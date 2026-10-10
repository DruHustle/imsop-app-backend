import assert from 'node:assert/strict';
import test from 'node:test';
import app from './app';
import jwt from 'jsonwebtoken';
import { assertProductionConfiguration, getAllowedOrigins, getJwtSecret } from './config/security';
import crypto from 'node:crypto';
import { escapeHtml } from './controllers/operationsController';
import { rateLimit } from './middleware/rateLimit';
import { Request, Response } from 'express';

test('API and authentication limits use independent windows and cover changing paths', () => {
  const apiLimiter = rateLimit(60_000, 120);
  const authLimiter = rateLimit(900_000, 1);
  const req = { ip: 'limiter-test', baseUrl: '/api', path: '/auth/login' } as Request;
  let status = 200;
  let allowed = 0;
  const res = {
    setHeader() {}, status(value: number) { status = value; return this; }, json() {},
  } as unknown as Response;
  apiLimiter(req, res, () => allowed++);
  authLimiter(req, res, () => allowed++);
  assert.equal(allowed, 2);
  // A different route must still share the authentication limit for this IP.
  authLimiter({ ...req, path: '/auth/register' } as Request, res, () => allowed++);
  assert.equal(status, 429);
  assert.equal(allowed, 2);
});

test('API errors return JSON and unsafe cross-site cookie requests are rejected', async () => {
  const server = app.listen(0);
  try {
    const address = server.address();
    assert(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}`;
    const missing = await fetch(`${base}/api/missing`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: 'Not found' });
    const malformed = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { error: 'Invalid JSON body' });
    for (const origin of [undefined, 'https://untrusted.example']) {
      const response = await fetch(`${base}/api/auth/logout`, {
        method: 'POST', headers: { Cookie: 'imsop_access=test', ...(origin && { Origin: origin }) },
      });
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), { error: 'Cross-site session request blocked' });
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});

test('HTML reports escape stored data', () => {
  assert.equal(escapeHtml(`<script>alert("x")</script> & 'quoted'`), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quoted&#39;');
});

test('allowed origins are trimmed and support multiple Vercel domains', () => {
  const previous = process.env.CORS_ALLOWED_ORIGINS;
  process.env.CORS_ALLOWED_ORIGINS = ' https://imsop-app.vercel.app , https://preview.example.com ';
  try {
    assert.deepEqual(getAllowedOrigins(), ['https://imsop-app.vercel.app', 'https://preview.example.com']);
  } finally {
    if (previous === undefined) delete process.env.CORS_ALLOWED_ORIGINS;
    else process.env.CORS_ALLOWED_ORIGINS = previous;
  }
});

test('production configuration rejects invalid Gmail app passwords', () => {
  const keys = ['NODE_ENV', 'DATABASE_URL', 'ALLOWED_ORIGIN', 'CORS_ALLOWED_ORIGINS', 'PASSWORD_RESET_BASE_URL', 'JWT_SECRET', 'EMAIL_PROVIDER', 'GMAIL_APP_PASSWORD', 'LOGISTICS_WEBHOOK_SECRETS'] as const;
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:password@db.example.com:5432/imsop',
    ALLOWED_ORIGIN: 'https://imsop-app.vercel.app',
    CORS_ALLOWED_ORIGINS: 'https://imsop-app.vercel.app',
    PASSWORD_RESET_BASE_URL: 'https://imsop-app.vercel.app/#/reset-password',
    JWT_SECRET: 'a-secure-production-jwt-secret-at-least-32-characters',
    EMAIL_PROVIDER: 'gmail',
    GMAIL_APP_PASSWORD: 'not-an-app-password',
    LOGISTICS_WEBHOOK_SECRETS: JSON.stringify({ carrier: 'a-secure-provider-secret-at-least-32-characters' }),
  });
  try {
    assert.throws(() => assertProductionConfiguration(), /16-character Google App Password/);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test('GET /health returns ok', async () => {
  const server = app.listen(0);

  try {
    const address = server.address();
    assert(address && typeof address === 'object', 'server should expose a bound port');

    const res = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok' });
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

test('authentication routes validate input before accessing the database', async () => {
  const server = app.listen(0);
  try {
    const address = server.address();
    assert(address && typeof address === 'object');
    const res = await fetch(`http://127.0.0.1:${address.port}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'invalid', password: 'short', name: '' }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'Invalid request');
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});

test('protected operations reject anonymous requests', async () => {
  const server = app.listen(0);
  try {
    const address = server.address();
    assert(address && typeof address === 'object');
    const res = await fetch(`http://127.0.0.1:${address.port}/api/operations/shipments`);
    assert.equal(res.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});

test('role-protected operations reject authenticated users without a permitted role', async () => {
  const server = app.listen(0);
  try {
    const address = server.address();
    assert(address && typeof address === 'object');
    const token = jwt.sign({ id: 1, email: 'guest@example.com', role: 'guest' }, getJwtSecret(), {
      expiresIn: '5m', issuer: 'imsop-api', audience: 'imsop-web',
    });
    const res = await fetch(`http://127.0.0.1:${address.port}/api/operations/shipments`, {
      headers: { Cookie: `imsop_access=${token}` },
    });
    assert.equal(res.status, 403);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});

test('logistics webhooks reject invalid signatures', async () => {
  process.env.LOGISTICS_WEBHOOK_SECRETS = JSON.stringify({ test: 'a-secure-test-secret-with-32-characters' });
  const server = app.listen(0);
  try {
    const address = server.address();
    assert(address && typeof address === 'object');
    const res = await fetch(`http://127.0.0.1:${address.port}/api/integrations/logistics/test/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-imsop-timestamp': String(Math.floor(Date.now() / 1000)), 'x-imsop-signature': 'sha256=invalid' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});

test('signed logistics webhooks validate canonical payloads before database access', async () => {
  const secret = 'a-secure-test-secret-with-32-characters';
  process.env.LOGISTICS_WEBHOOK_SECRETS = JSON.stringify({ test: secret });
  const body = JSON.stringify({ eventId: 'evt-1' });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `sha256=${crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
  const server = app.listen(0);
  try {
    const address = server.address();
    assert(address && typeof address === 'object');
    const res = await fetch(`http://127.0.0.1:${address.port}/api/integrations/logistics/test/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-imsop-timestamp': timestamp, 'x-imsop-signature': signature },
      body,
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'Invalid request');
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});
