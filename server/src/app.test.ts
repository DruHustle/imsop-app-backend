import {hashPassword,verifyPassword} from './services/passwords';
import assert from "node:assert/strict";
import test from "node:test";
import app from "./app";
import { db, connection } from "./config/db";
import { readBounds } from "./controllers/operationalReads";
import jwt from "jsonwebtoken";
import {
  assertProductionConfiguration,
  getAllowedOrigins,
  getJwtSecret,
} from "./config/security";
import crypto from "node:crypto";
import { escapeHtml } from "./controllers/operationsController";
import { rateLimit } from "./middleware/rateLimit";
import { Request, Response } from "express";

test("API and authentication limits use independent windows and cover changing paths", () => {
  const apiLimiter = rateLimit(60_000, 120);
  const authLimiter = rateLimit(900_000, 1);
  const req = {
    ip: "limiter-test",
    baseUrl: "/api",
    path: "/auth/login",
  } as Request;
  let status = 200;
  let allowed = 0;
  const res = {
    setHeader() {},
    status(value: number) {
      status = value;
      return this;
    },
    json() {},
  } as unknown as Response;
  apiLimiter(req, res, () => allowed++);
  authLimiter(req, res, () => allowed++);
  assert.equal(allowed, 2);
  // A different route must still share the authentication limit for this IP.
  authLimiter(
    { ...req, path: "/auth/register" } as Request,
    res,
    () => allowed++,
  );
  assert.equal(status, 429);
  assert.equal(allowed, 2);
});

test("API errors return JSON and unsafe cross-site cookie requests are rejected", async () => {
  const server = app.listen(0);
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const missing = await fetch(`${base}/api/missing`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: "Not found" });
    const malformed = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { error: "Invalid JSON body" });
    for (const origin of [undefined, "https://untrusted.example"]) {
      const response = await fetch(`${base}/api/auth/logout`, {
        method: "POST",
        headers: {
          Cookie: "imsop_access=test",
          ...(origin && { Origin: origin }),
        },
      });
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), {
        error: "Cross-site session request blocked",
      });
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("HTML reports escape stored data", () => {
  assert.equal(
    escapeHtml(`<script>alert("x")</script> & 'quoted'`),
    "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quoted&#39;",
  );
});

test("allowed origins are trimmed and support multiple Vercel domains", () => {
  const previous = process.env.CORS_ALLOWED_ORIGINS;
  process.env.CORS_ALLOWED_ORIGINS =
    " https://imsop-app.vercel.app , https://preview.example.com ";
  try {
    assert.deepEqual(getAllowedOrigins(), [
      "https://imsop-app.vercel.app",
      "https://preview.example.com",
    ]);
  } finally {
    if (previous === undefined) delete process.env.CORS_ALLOWED_ORIGINS;
    else process.env.CORS_ALLOWED_ORIGINS = previous;
  }
});

test("production configuration rejects invalid Gmail app passwords", () => {
  const keys = [
    "NODE_ENV",
    "DATABASE_URL",
    "ALLOWED_ORIGIN",
    "CORS_ALLOWED_ORIGINS",
    "PASSWORD_RESET_BASE_URL",
    "JWT_SECRET",
    "EMAIL_PROVIDER",
    "GMAIL_APP_PASSWORD",
    "LOGISTICS_WEBHOOK_SECRETS",
    "RESET_DELIVERY_KEY",
  ] as const;
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://user:password@db.example.com:5432/imsop",
    ALLOWED_ORIGIN: "https://imsop-app.vercel.app",
    CORS_ALLOWED_ORIGINS: "https://imsop-app.vercel.app",
    PASSWORD_RESET_BASE_URL: "https://imsop-app.vercel.app/#/reset-password",
    JWT_SECRET: "a-secure-production-jwt-secret-at-least-32-characters",
    RESET_DELIVERY_KEY: "a".repeat(64),
    EMAIL_PROVIDER: "gmail",
    GMAIL_APP_PASSWORD: "not-an-app-password",
    LOGISTICS_WEBHOOK_SECRETS: JSON.stringify({
      carrier: "a-secure-provider-secret-at-least-32-characters",
    }),
  });
  try {
    assert.throws(
      () => assertProductionConfiguration(),
      /16-character Google App Password/,
    );
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("GET /health returns ok", async () => {
  const server = app.listen(0);

  try {
    const address = server.address();
    assert(
      address && typeof address === "object",
      "server should expose a bound port",
    );

    const res = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(res.status, 200);
    const health = await res.json();
    assert.equal(health.status, "ok");
    assert.equal(health.apiContract, 2);
    assert.equal(typeof health.revision, "string");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-frame-options"), "DENY");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

test("authentication routes validate input before accessing the database", async () => {
  const server = app.listen(0);
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const res = await fetch(
      `http://127.0.0.1:${address.port}/api/auth/register`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "invalid", password: "short", name: "" }),
      },
    );
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "Invalid request");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("protected operations reject anonymous requests", async () => {
  const server = app.listen(0);
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const res = await fetch(
      `http://127.0.0.1:${address.port}/api/operations/shipments`,
    );
    assert.equal(res.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("legacy claim-only credentials fail closed before role authorization", async () => {
  const server = app.listen(0);
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const token = jwt.sign(
      { id: 1, email: "guest@example.com", role: "guest" },
      getJwtSecret(),
      {
        expiresIn: "5m",
        issuer: "imsop-api",
        audience: "imsop-web",
      },
    );
    const res = await fetch(
      `http://127.0.0.1:${address.port}/api/operations/shipments`,
      {
        headers: { Cookie: `imsop_access=${token}` },
      },
    );
    assert.equal(res.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("logistics webhooks reject invalid signatures", async () => {
  process.env.LOGISTICS_WEBHOOK_SECRETS = JSON.stringify({
    test: "a-secure-test-secret-with-32-characters",
  });
  const server = app.listen(0);
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const res = await fetch(
      `http://127.0.0.1:${address.port}/api/integrations/logistics/test/events`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-imsop-timestamp": String(Math.floor(Date.now() / 1000)),
          "x-imsop-signature": "sha256=invalid",
        },
        body: JSON.stringify({}),
      },
    );
    assert.equal(res.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("signed logistics webhooks validate canonical payloads before database access", async () => {
  const secret = "a-secure-test-secret-with-32-characters";
  process.env.LOGISTICS_WEBHOOK_SECRETS = JSON.stringify({ test: secret });
  const body = JSON.stringify({ eventId: "evt-1" });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `sha256=${crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
  const server = app.listen(0);
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const res = await fetch(
      `http://127.0.0.1:${address.port}/api/integrations/logistics/test/events`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-imsop-timestamp": timestamp,
          "x-imsop-signature": signature,
        },
        body,
      },
    );
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "Invalid request");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

// Isolated database doubles exercise the actual auth middleware and read routes.
// No fixture writes, production database connections, or provider calls occur.
test("bounded operational reads preserve permissions, identities and event provenance", async (t) => {
  assert.deepEqual(readBounds({}), { limit: 100, offset: 0 });
  for (const limit of ["0", "501", "-1", "1.2", "Infinity", ["1"]])
    assert.throws(() => readBounds({ limit } as any));
  let rows: unknown[] = [];
  let activeRole = "user";
  t.mock.method(connection, "query", (async () => ({
    rows: [
      {
        id: 1,
        email: "isolated@example.test",
        role: activeRole,
        session_id: "00000000-0000-4000-8000-000000000001",
        workspace_id: "00000000-0000-4000-8000-000000000002",
      },
    ],
    rowCount: 1,
  })) as any);
  t.mock.method(db, "transaction", (async (callback: any) =>
    callback(db)) as any);
  let capturedLimit = 0;
  const selectMock = t.mock.method(
    db,
    "select",
    (fields?: Record<string, unknown>) => {
      const results =
        fields && "total" in fields
          ? [{ total: rows.length }]
          : rows.map((row) =>
              Object.fromEntries(
                Object.keys(fields || (row as object))
                  .filter((key) => key in (row as object))
                  .map((key) => [key, (row as Record<string, unknown>)[key]]),
              ),
            );
      const chain: any = {
        from() {
          return this;
        },
        orderBy() {
          return this;
        },
        where() {
          return this;
        },
        limit(n: number) {
          capturedLimit = n;
          return this;
        },
        offset() {
          return this;
        },
        then(resolve: (r: unknown[]) => void) {
          resolve(results);
        },
      };
      return chain;
    },
  );
  const server = app.listen(0);
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}/api/operations`;
    const read = (role: string, path: string) => {
      activeRole = role;
      return fetch(base + path, {
        headers: {
          Cookie: `imsop_access=${jwt.sign({ id: 1, sid: "00000000-0000-4000-8000-000000000001", email: "isolated@example.test", role }, getJwtSecret(), { expiresIn: "5m", issuer: "imsop-api", audience: "imsop-web" })}`,
        },
      });
    };
    for (const role of ["admin", "engineer", "analyst", "user"]) {
      rows = [{ id: 7, trackingNumber: "TRACKING-7", status: "in_transit" }];
      assert.equal((await read(role, "/shipments/7")).status, 200);
      assert.equal((await read(role, "/shipments?limit=5")).status, 200);
      assert.equal(
        (await read(role, "/orders?limit=5")).status,
        role === "user" ? 403 : 200,
      );
      assert.equal(
        (await read(role, "/shipments/7/events?limit=50")).status,
        200,
      );
      const ordersResponse = await read(role, "/orders/101");
      assert.equal(ordersResponse.status, role === "user" ? 403 : 200);
      const reports = await read(role, "/reports/access");
      assert.equal(
        reports.status,
        ["admin", "analyst"].includes(role) ? 200 : 403,
      );
      for (const path of ["/shipments/export/report", "/orders/export/report"])
        if (!["admin", "analyst"].includes(role))
          assert.equal((await read(role, path)).status, 403);
    }
    for (const path of [
      "/shipments",
      "/orders",
      "/shipments/7",
      "/shipments/7/events",
      "/orders/101",
      "/reports/access",
    ])
      assert.equal((await fetch(base + path)).status, 401);
    assert.equal((await read("admin", "/shipments/7a")).status, 400);
    assert.equal(
      (await read("admin", "/orders/5096db96-c450-4cb5-aefe-000000000001"))
        .status,
      400,
    );
    assert.equal((await read("admin", "/shipments?limit=501")).status, 400);
    rows = [];
    assert.equal((await read("admin", "/shipments/999")).status, 404);
    assert.equal((await read("admin", "/shipments/999/events")).status, 404);
    rows = [
      {
        id: 8,
        trackingNumber: "NOT-THE-ID",
        status: "in_transit",
        provider: "test-feed",
        observedAt: "2026-10-24T06:00:00Z",
        receivedAt: "2026-10-24T06:01:00Z",
      },
    ];
    const shipment = await (await read("user", "/shipments/8")).json();
    assert.equal(shipment.id, 8);
    assert.equal(shipment.trackingNumber, "NOT-THE-ID");
    assert.equal(shipment.observedAt, "2026-10-24T06:00:00Z");
    const list = await (
      await read("admin", "/shipments?limit=12&offset=0")
    ).json();
    assert.equal(capturedLimit, 12);
    assert.equal(list.total, 1);
    assert.equal(list.limit, 12);
    assert.equal(list.source, "node.shipments");
    rows = [
      {
        id: 9,
        trackingNumber: "NOT-THE-ID",
        provider: "test-feed",
        eventType: "in_transit",
        occurredAt: "2026-10-24T06:00:00Z",
        receivedAt: "2026-10-24T06:01:00Z",
        payload: "private-webhook-payload",
      },
    ];
    const eventPage = await (
      await read("user", "/shipments/8/events?limit=50")
    ).json();
    assert.deepEqual(Object.keys(eventPage.items[0]).sort(), [
      "eventType",
      "id",
      "occurredAt",
      "position",
      "provider",
      "receivedAt",
      "status",
    ]);
    assert.equal(eventPage.items[0].occurredAt, "2026-10-24T06:00:00Z");
    assert.equal(eventPage.items[0].payload, undefined);
    assert.equal(eventPage.items[0].position, null);
    assert.equal(eventPage.items[0].status, null);
    rows = [];
    const empty = await (await read("admin", "/shipments?limit=5")).json();
    assert.equal(empty.total, 0);
    assert.deepEqual(empty.items, []);
    selectMock.mock.mockImplementation(() => {
      throw new Error("isolated failure");
    });
    assert.equal((await read("admin", "/shipments?limit=5")).status, 503);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
});

test("legacy UTC timestamp decoder is independent of the process timezone", async () => {
  const { types } = await import("pg");
  const previous = process.env.TZ;
  process.env.TZ = "Pacific/Honolulu";
  try {
    const parsed = types.getTypeParser(1114)(
      "2026-10-26 09:00:00",
    ) as unknown as Date;
    assert.equal(parsed.toISOString(), "2026-10-26T09:00:00.000Z");
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("new password hashes distinguish 128-character inputs sharing the first 72 bytes", async () => {
  
  const a = "a".repeat(100) + "x",
    b = "a".repeat(100) + "y";
  const hashed = await hashPassword(a);
  assert.equal(await verifyPassword(a, hashed), true);
  assert.equal(await verifyPassword(b, hashed), false);
});
