import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
const origin = "http://127.0.0.1:18067",
  sink = "http://127.0.0.1:18027";
assert.match(
  process.env.DATABASE_URL || "",
  /@127\.0\.0\.1:55467\/imsop_test$/,
);
const db = new Pool({ connectionString: process.env.DATABASE_URL }),
  password = "Isolated-test-password-123";
let seq = 50;
async function call(
  path: string,
  body?: unknown,
  cookie?: string,
  extra: any = {},
) {
  return fetch(origin + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": `192.0.2.${++seq}`,
      Origin: "http://127.0.0.1:4189",
      ...(cookie ? { Cookie: cookie } : {}),
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function waitFor(check: () => Promise<boolean>, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Timed out waiting for isolated system state");
}
let a: any, b: any, publicUser: any;
async function createAccount(role: string) {
  const organizationId = randomUUID(),
    workspaceId = randomUUID(),
    email = randomUUID() + "@imsop.test";
  await db.query(
    "INSERT INTO supply_chain.organizations(id,name,timezone,status,subscription_tier,created_at,updated_at) VALUES($1,$2,'UTC','active','test',now(),now())",
    [organizationId, "Isolated " + organizationId],
  );
  await db.query(
    "INSERT INTO workspaces(id,name,dotnet_organization_id) VALUES($1,$2,$3)",
    [workspaceId, "Isolated " + workspaceId, organizationId],
  );
  const user = (
    await db.query(
      "INSERT INTO users(email,password,name,role,active_workspace_id) VALUES($1,$2,'IMSOP Verification',$3,$4) RETURNING id",
      [email, await bcrypt.hash(password, 4), role, workspaceId],
    )
  ).rows[0];
  await db.query(
    "INSERT INTO workspace_memberships(user_id,workspace_id) VALUES($1,$2)",
    [user.id, workspaceId],
  );
  const supplierId = randomUUID();
  await db.query(
    "INSERT INTO supply_chain.suppliers(id,organization_id,name,status) VALUES($1,$2,'Isolated Supplier','active')",
    [supplierId, organizationId],
  );
  const login = await call("/api/auth/login", { email, password });
  assert.equal(login.status, 200);
  return {
    ...user,
    organizationId,
    workspaceId,
    email,
    supplierId,
    cookie: login.headers.get("set-cookie")!.split(";")[0],
  };
}
before(async () => {
  await waitFor(async () => {
    try {
      return (await fetch(origin + "/ready")).ok;
    } catch {
      return false;
    }
  }, 30000);
  a = await createAccount("engineer");
  b = await createAccount("analyst");
});
after(() => db.end());
test("optional adapter configuration and durable transport status remain scoped and separate from connectivity", async () => {
  const status=await call("/api/operations/integrations",undefined,a.cookie);
  assert.equal(status.status,200);
  const body=await status.json();
  assert.equal(body.adapters.forecast.state,"configured");
  assert.equal(body.adapters.sap.state,"not-configured");
  assert.equal(body.adapters.sap.connectivity,"not probed");
  assert.equal((await call("/api/operations/integrations/sap/metadata",undefined,a.cookie)).status,503);
  const transport=await call("/supply-chain/api/v1/orders/transport",undefined,a.cookie);
  assert.equal(transport.status,200);
  const data=await transport.json();
  assert.equal(data.state,"configured");
  assert.equal(data.connectivity,"not probed");
  assert(Array.isArray(data.outbox));
});
test("gateway forwards cookies, rejects public/cross-workspace reads and validates order DTOs", async () => {
  const unprovisioned = await call("/api/auth/register", {
    email: randomUUID() + "@imsop.test",
    password,
    name: "Public Signup",
  });
  assert.equal(unprovisioned.status, 201);
  publicUser = unprovisioned.headers.get("set-cookie")!.split(";")[0];
  assert.equal(
    (await call("/api/operations/shipments?limit=10", undefined, publicUser))
      .status,
    403,
  );
  assert.equal(
    (
      await call(
        "/supply-chain/api/v1/orders/" + randomUUID(),
        undefined,
        publicUser,
      )
    ).status,
    403,
  );
  assert.equal(
    (await call("/supply-chain/api/v1/orders/suppliers", undefined, a.cookie))
      .status,
    200,
  );
  assert.equal(
    (
      await call(
        "/supply-chain/api/v1/orders",
        { supplierId: b.supplierId, orderNumber: "INVALID", totalAmount: 1 },
        a.cookie,
        { "Idempotency-Key": randomUUID() },
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "/supply-chain/api/v1/orders",
        {
          organizationId: b.organizationId,
          supplierId: a.supplierId,
          orderNumber: "INVALID",
          totalAmount: 1,
        },
        a.cookie,
        { "Idempotency-Key": randomUUID() },
      )
    ).status,
    400,
  );
});
test("outbox atomically stores one logical order, survives outage, retries and duplicate redelivery", async () => {
  await fetch(sink + "/transport/fail", { method: "POST" });
  const key = randomUUID(),
    body = {
      supplierId: a.supplierId,
      orderNumber: "QUAL-" + key,
      totalAmount: 125.5,
    };
  const responses = await Promise.all([
    call("/supply-chain/api/v1/orders", body, a.cookie, {
      "Idempotency-Key": key,
    }),
    call("/supply-chain/api/v1/orders", body, a.cookie, {
      "Idempotency-Key": key,
    }),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 201]);
  const ids = await Promise.all(
    responses.map(async (r) => (await r.json()).data.id),
  );
  assert.equal(ids[0], ids[1]);
  const id = ids[0];
  assert.equal(
    (await call("/supply-chain/api/v1/orders/" + id, undefined, b.cookie))
      .status,
    404,
  );
  assert.equal(
    (
      await call(
        "/supply-chain/api/v1/orders",
        { ...body, totalAmount: 126 },
        a.cookie,
        { "Idempotency-Key": key },
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS count FROM supply_chain.order_outbox WHERE order_id=$1",
        [id],
      )
    ).rows[0].count,
    1,
  );
  await waitFor(async () => {
    const row = (
      await db.query(
        "SELECT attempts,state FROM supply_chain.order_outbox WHERE order_id=$1",
        [id],
      )
    ).rows[0];
    return Number(row.attempts) > 0 && row.state === "pending";
  });
  const failed = (
    await db.query(
      "SELECT state FROM supply_chain.order_outbox WHERE order_id=$1",
      [id],
    )
  ).rows[0];
  assert.equal(failed.state, "pending");
  await fetch(sink + "/transport/fail", { method: "DELETE" });
  await db.query(
    "UPDATE supply_chain.order_outbox SET next_attempt_at=now() WHERE order_id=$1",
    [id],
  );
  await waitFor(
    async () =>
      (
        await db.query(
          "SELECT state FROM supply_chain.order_outbox WHERE order_id=$1",
          [id],
        )
      ).rows[0].state === "sent",
  );
  assert.equal(
    (
      await db.query(
        "SELECT dispatch_state FROM supply_chain.purchase_orders WHERE id=$1",
        [id],
      )
    ).rows[0].dispatch_state,
    "sent",
  );
  // Simulate the persisted lease left by a process crash after commit; stable message ID deduplicates a redelivery.
  await db.query(
    "UPDATE supply_chain.order_outbox SET state='sending',lease_until=now()-interval '1 minute',next_attempt_at=now() WHERE order_id=$1",
    [id],
  );
  await waitFor(
    async () =>
      (
        await db.query(
          "SELECT state FROM supply_chain.order_outbox WHERE order_id=$1",
          [id],
        )
      ).rows[0].state === "sent",
  );
  const deliveries = await (await fetch(sink + "/deliveries")).json();
  assert.equal(deliveries.filter((d: any) => d.id === id).length, 1);
});
test("generated recovery mail reaches only the SMTP sink; .NET rejects reset and logout revoked cookies", async () => {
  const response = await call("/api/auth/request-reset", { email: a.email });
  assert.equal(response.status, 202);
  assert.equal("token" in (await response.json()), false);
  let mail: any;
  await waitFor(async () => {
    mail = (await (await fetch(sink + "/messages")).json()).find((m: any) =>
      m.text.includes(a.email),
    );
    return !!mail;
  });
  const text = mail.text.replace(/=\n/g, "").replace(/=3D/g, "=");
  const link = text.match(/http:\/\/127\.0\.0\.1:4189\/[^\s<>]+/)?.[0];
  assert(link);
  assert.match(link, /#\/reset-password\?lang=en&token=/);
  const token = new URLSearchParams(new URL(link).hash.split("?")[1]).get(
    "token",
  );
  assert(token);
  assert.equal(
    (
      await call("/api/auth/reset-password", {
        token,
        newPassword: "New-isolated-password-123",
      })
    ).status,
    200,
  );
  assert.equal(
    (await call("/supply-chain/api/v1/orders/suppliers", undefined, a.cookie))
      .status,
    401,
  );
  assert.equal(
    (await call("/api/operations/shipments?limit=10", undefined, a.cookie))
      .status,
    401,
  );
  assert.equal((await call("/api/auth/logout", {}, b.cookie)).status, 204);
  assert.equal(
    (await call("/supply-chain/api/v1/orders/suppliers", undefined, b.cookie))
      .status,
    401,
  );
});
test("direct service session boundary rejects disabled, role-changed and expired sessions through gateway", async () => {
  for (const action of ["disabled", "role", "expiry"]) {
    const user = await createAccount("engineer");
    assert.equal(
      (
        await call(
          "/supply-chain/api/v1/orders/suppliers",
          undefined,
          user.cookie,
        )
      ).status,
      200,
    );
    if (action === "disabled")
      await db.query("UPDATE users SET disabled=true WHERE id=$1", [user.id]);
    if (action === "role")
      await db.query("UPDATE users SET role='user' WHERE id=$1", [user.id]);
    if (action === "expiry")
      await db.query(
        "UPDATE auth_sessions SET expires_at=now()-interval '1 minute' WHERE user_id=$1",
        [user.id],
      );
    assert.equal(
      (
        await call(
          "/supply-chain/api/v1/orders/suppliers",
          undefined,
          user.cookie,
        )
      ).status,
      401,
    );
  }
});
test("signed intake through gateway seeds a durable review workflow for real browser qualification", async () => {
  const user = await createAccount("admin");
  await db.query(
    "INSERT INTO logistics_connectors(provider,workspace_id) VALUES('isolated-carrier',$1) ON CONFLICT(provider) DO UPDATE SET workspace_id=EXCLUDED.workspace_id",
    [user.workspaceId],
  );
  const productId=randomUUID(),warehouseId=randomUUID();
  await db.query("INSERT INTO supply_chain.products(id,organization_id,sku,name,unit_price) VALUES($1,$2,'VERIFY-PART','Verification part',12.3456)",[productId,user.organizationId]);
  await db.query("INSERT INTO supply_chain.warehouses(id,organization_id,name) VALUES($1,$2,'Verification warehouse')",[warehouseId,user.organizationId]);
  const event = {
    eventId: randomUUID(),
    trackingNumber: "SYSTEM-SHP-10",
    eventType: "shipment.exception",
    status: "delayed",
    origin: "Berlin, Germany",
    destination: "Rotterdam, Netherlands",
    carrier: "Isolated Carrier",
    transportMode: "parcel",
    occurredAt: "2026-10-27T08:00:00Z",
    estimatedArrival: "2026-10-28T12:00:00Z",
    location: { latitude: 52.52, longitude: 13.4 },
  };
  const text = JSON.stringify(event),
    timestamp = String(Math.floor(Date.now() / 1000));
  const response = await call(
    "/api/integrations/logistics/isolated-carrier/events",
    event,
    undefined,
    {
      "x-imsop-timestamp": timestamp,
      "x-imsop-signature":
        "sha256=" +
        createHmac("sha256", "isolated-signing-secret-at-least-32-characters")
          .update(timestamp + "." + text)
          .digest("hex"),
    },
  );
  assert.equal(response.status, 202);
  const accepted = await response.json();
  await writeFile(
    "/tmp/imsop-browser-fixture.json",
    JSON.stringify({
      email: user.email,
      userId: user.id,
      workspaceId: user.workspaceId,
      shipmentId: accepted.shipmentId,
      supplierId:user.supplierId,productId,warehouseId,
    }),
  );
});
