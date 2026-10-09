import assert from 'node:assert/strict';
import test from 'node:test';
import app from './app';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from './config/security';
import crypto from 'node:crypto';

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
