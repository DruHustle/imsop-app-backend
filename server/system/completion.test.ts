import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { Pool } from "pg";
assert.match(
  process.env.DATABASE_URL || "",
  /@127\.0\.0\.1:55467\/imsop_test$/,
);
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const origin = "http://127.0.0.1:18067",
  sink = "http://127.0.0.1:18027";
let a: any,
  b: any,
  user: any,
  sequence = 20;
async function seed(role = "engineer") {
  const org = randomUUID(),
    workspace = randomUUID(),
    sid = randomUUID(),
    product = randomUUID(),
    warehouse = randomUUID(),
    supplier = randomUUID(),
    email = randomUUID() + "@imsop.test";
  await db.query(
    "INSERT INTO supply_chain.organizations(id,name,timezone,status,subscription_tier,created_at,updated_at) VALUES($1,$2,'UTC','active','test',now(),now())",
    [org, "Completion " + org],
  );
  await db.query(
    "INSERT INTO workspaces(id,name,dotnet_organization_id) VALUES($1,'Completion verification',$2)",
    [workspace, org],
  );
  const id = (
    await db.query(
      "INSERT INTO users(email,password,name,role,active_workspace_id) VALUES($1,'not-a-login-fixture','Completion verification',$2,$3) RETURNING id",
      [email, role, workspace],
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO workspace_memberships(user_id,workspace_id) VALUES($1,$2)",
    [id, workspace],
  );
  await db.query(
    "INSERT INTO auth_sessions(id,user_id,workspace_id,version,role,expires_at) VALUES($1,$2,$3,0,$4,now()+interval '15 minutes')",
    [sid, id, workspace, role],
  );
  await db.query(
    "INSERT INTO supply_chain.suppliers(id,organization_id,name,status) VALUES($1,$2,'Completion supplier','active')",
    [supplier, org],
  );
  await db.query(
    "INSERT INTO supply_chain.products(id,organization_id,sku,name,unit_price) VALUES($1,$2,'PART-1','Completion product',12.3456)",
    [product, org],
  );
  await db.query(
    "INSERT INTO supply_chain.warehouses(id,organization_id,name) VALUES($1,$2,'Completion warehouse')",
    [warehouse, org],
  );
  const token = jwt.sign(
    { id, sid },
    "isolated-stack-signing-secret-at-least-32-characters",
    { issuer: "imsop-api", audience: "imsop-web", expiresIn: "15m" },
  );
  return {
    org,
    workspace,
    id,
    email,
    product,
    warehouse,
    supplier,
    cookie: "imsop_access=" + token,
  };
}
async function call(
  who: any,
  path: string,
  method = "GET",
  body?: unknown,
  key?: string,
) {
  return fetch(origin + path, {
    method,
    headers: {
      Cookie: who.cookie,
      Origin: "http://127.0.0.1:4189",
      "Content-Type": "application/json",
      "X-Forwarded-For": `192.0.2.${++sequence}`,
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function wait(check: () => Promise<boolean>) {
  const end = Date.now() + 25000;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Timed out waiting for persisted worker result");
}
before(async () => {
  a = await seed();
  b = await seed();
  user = await seed("user");
});
after(() => db.end());
test("purchase items, exact decimals, tenant validation, retry and receiving update stock atomically once", async () => {
  const path = "/supply-chain/api/v1/orders",
    key = randomUUID();
  const body = {
    supplierId: a.supplier,
    orderNumber: "COMPLETE-" + randomUUID(),
    currency: "EUR",
    items: [{ productId: a.product, quantity: 4, unitPrice: "12.3456" }],
  };
  assert.equal(
    (await call(user, path, "POST", body, randomUUID())).status,
    403,
  );
  assert.equal(
    (
      await call(
        a,
        path,
        "POST",
        { ...body, items: [{ ...body.items[0], productId: b.product }] },
        randomUUID(),
      )
    ).status,
    400,
  );
  const replies = await Promise.all([
    call(a, path, "POST", body, key),
    call(a, path, "POST", body, key),
  ]);
  assert.deepEqual(replies.map((r) => r.status).sort(), [200, 201]);
  const order = (await replies[0].json()).data;
  assert.equal((await call(b, path + "/" + order.id)).status, 404);
  assert.equal(
    (await call(a, path, "POST", { ...body, currency: "USD" }, key)).status,
    409,
  );
  assert.equal((await call(a, path, "POST", body, randomUUID())).status, 409);
  const stored = (
    await db.query(
      "SELECT total_amount::text,currency FROM supply_chain.purchase_orders WHERE id=$1",
      [order.id],
    )
  ).rows[0];
  assert.equal(stored.total_amount, "49.3824");
  assert.equal(stored.currency, "EUR");
  const list = await (await call(a, path)).json();
  assert.equal(
    list.items.find((o: any) => o.id === order.id).totalAmount,
    "49.3824",
  );
  const items = await (await call(a, path + "/" + order.id + "/items")).json();
  assert.equal(items.length, 1);
  const receipt = {
      warehouseId: a.warehouse,
      receivedAt: new Date().toISOString(),
      note: "Physical receipt observed at isolated warehouse",
      items: [{ itemId: items[0].id, quantity: 1 }],
    },
    receiptKey = randomUUID();
  assert.equal(
    (
      await call(
        a,
        path + "/" + order.id + "/receipts",
        "POST",
        { ...receipt, warehouseId: b.warehouse },
        randomUUID(),
      )
    ).status,
    400,
  );
  const received = await Promise.all([
    call(a, path + "/" + order.id + "/receipts", "POST", receipt, receiptKey),
    call(a, path + "/" + order.id + "/receipts", "POST", receipt, receiptKey),
  ]);
  assert(received.every((r) => r.status === 200));
  assert.equal(
    (
      await db.query(
        "SELECT quantity_on_hand FROM supply_chain.inventories WHERE organization_id=$1",
        [a.org],
      )
    ).rows[0].quantity_on_hand,
    1,
  );
  const finish = { ...receipt, items: [{ itemId: items[0].id, quantity: 3 }] };
  const racers = await Promise.all([
    call(a, path + "/" + order.id + "/receipts", "POST", finish, randomUUID()),
    call(a, path + "/" + order.id + "/receipts", "POST", finish, randomUUID()),
  ]);
  assert.deepEqual(racers.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (
      await db.query(
        "SELECT quantity_on_hand FROM supply_chain.inventories WHERE organization_id=$1",
        [a.org],
      )
    ).rows[0].quantity_on_hand,
    4,
  );
  assert.equal(
    (
      await db.query(
        "SELECT received_quantity FROM supply_chain.purchase_order_items WHERE id=$1",
        [items[0].id],
      )
    ).rows[0].received_quantity,
    4,
  );
  assert.equal(
    (
      await db.query(
        "SELECT status FROM supply_chain.purchase_orders WHERE id=$1",
        [order.id],
      )
    ).rows[0].status,
    "received",
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM supply_chain.purchase_receipts WHERE order_id=$1",
        [order.id],
      )
    ).rows[0].n,
    2,
  );
});
test("review email is explicitly opted in, transactional, scoped, cancellable and accepted only by the SMTP sink", async () => {
  assert.equal(
    (
      await call(a, "/api/operations/notifications/preferences", "PUT", {
        emailEnabled: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call(b, "/api/operations/notifications/preferences", "PUT", {
        emailEnabled: true,
      })
    ).status,
    200,
  );
  const shipment = (
    await db.query(
      "INSERT INTO shipments(workspace_id,provider,tracking_number,origin,destination,status) VALUES($1,'completion','MAIL-COMPLETE','A','B','delayed') RETURNING id",
      [a.workspace],
    )
  ).rows[0].id;
  const review = (
    await db.query(
      "INSERT INTO review_cases(workspace_id,shipment_id) VALUES($1,$2) RETURNING id",
      [a.workspace, shipment],
    )
  ).rows[0].id;
  assert.equal(
    (
      await call(a, `/api/operations/reviews/${review}/actions`, "POST", {
        action: "note",
        version: 0,
        note: "Email evidence test",
      })
    ).status,
    200,
  );
  await wait(
    async () =>
      Number(
        (
          await db.query(
            "SELECT count(*) AS n FROM notification_deliveries WHERE workspace_id=$1 AND state='sent'",
            [a.workspace],
          )
        ).rows[0].n,
      ) === 1,
  );
  assert.equal(
    Number(
      (
        await db.query(
          "SELECT count(*) AS n FROM notification_deliveries WHERE workspace_id=$1",
          [b.workspace],
        )
      ).rows[0].n,
    ),
    0,
  );
  const messages = await (await fetch(sink + "/messages")).json();
  assert(
    messages.some(
      (m: any) => m.text.includes(a.email) && m.text.includes("MAIL-COMPLETE"),
    ),
  );
  const tx = await db.connect();
  try {
    await tx.query("BEGIN");
    await tx.query(
      "INSERT INTO review_actions(workspace_id,case_id,action,note) VALUES($1,$2,'note','cancel before worker')",
      [a.workspace, review],
    );
    await tx.query(
      "UPDATE notification_deliveries SET lease_until=now()+interval '1 hour' WHERE workspace_id=$1 AND state='pending'",
      [a.workspace],
    );
    await tx.query("COMMIT");
  } finally {
    tx.release();
  }
  assert.equal(
    (
      await call(a, "/api/operations/notifications/preferences", "PUT", {
        emailEnabled: false,
      })
    ).status,
    200,
  );
  await db.query(
    "UPDATE notification_deliveries SET lease_until=now()-interval '1 second' WHERE workspace_id=$1 AND state='pending'",
    [a.workspace],
  );
  await wait(
    async () =>
      Number(
        (
          await db.query(
            "SELECT count(*) AS n FROM notification_deliveries WHERE workspace_id=$1 AND state='cancelled'",
            [a.workspace],
          )
        ).rows[0].n,
      ) === 1,
  );
});
test("forecast requests require source observations and preserve workspace, horizon, units and provider evidence", async () => {
  const path = "/api/operations/forecasts",
    today = new Date().toISOString().slice(0, 10),
    yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  assert.equal((await call(user, path)).status, 403);
  assert.equal((await call(a, path, "POST", { horizonDays: 2 })).status, 422);
  const observations = [
    {
      sku: "SKU-1",
      date: yesterday,
      quantity: 12.5,
      unit: "items",
      source: "Isolated source evidence",
    },
    {
      sku: "SKU-1",
      date: today,
      quantity: 14,
      unit: "items",
      source: "Isolated source evidence",
    },
  ];
  assert.equal(
    (await call(a, path + "/observations", "POST", { observations })).status,
    200,
  );
  assert.equal((await (await call(b, path)).json()).observations, 0);
  assert.equal((await call(a, path, "POST", { horizonDays: 91 })).status, 400);
  const response = await call(a, path, "POST", { horizonDays: 2 });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.predictions.length, 2);
  assert.equal(result.provider, "isolated-forecast");
  assert.equal(result.predictions[0].unit, "items");
  await fetch(sink + "/forecast/mode", { method: "POST" });
  try {
    assert.equal((await call(a, path, "POST", { horizonDays: 2 })).status, 502);
  } finally {
    await fetch(sink + "/forecast/mode", { method: "DELETE" });
  }
  assert.equal(
    Number(
      (
        await db.query(
          "SELECT count(*) AS n FROM forecast_runs WHERE workspace_id=$1",
          [a.workspace],
        )
      ).rows[0].n,
    ),
    1,
  );
  assert.equal((await (await call(b, path)).json()).runs.length, 0);
  assert.equal(
    (
      await call(a, path + "/observations", "POST", {
        observations: [{ ...observations[0], date: "2026-02-31" }],
      })
    ).status,
    400,
  );
});
test("a reset worker crash on its final lease becomes a failed row with erased credential material", async () => {
  const id = randomUUID();
  await db.query(
    "INSERT INTO reset_deliveries(id,user_id,reset_version,encrypted_payload,state,attempts,lease_until,expires_at) VALUES($1,$2,99,'not-a-real-credential','sending',5,now()-interval '1 second',now()+interval '15 minutes')",
    [id, a.id],
  );
  await wait(
    async () =>
      (await db.query("SELECT state FROM reset_deliveries WHERE id=$1", [id]))
        .rows[0].state === "failed",
  );
  assert.equal(
    (
      await db.query(
        "SELECT encrypted_payload FROM reset_deliveries WHERE id=$1",
        [id],
      )
    ).rows[0].encrypted_payload,
    null,
  );
});

test("reviewed ownership provisioning defaults to dry-run and refuses cross-workspace reassignment atomically", async () => {
  const { provisionWorkspaces } = await import("./provision-workspaces");
  const workspace = randomUUID(),
    email = randomUUID() + "@imsop.test";
  const id = (
    await db.query(
      "INSERT INTO users(email,password,name,role) VALUES($1,'not-a-login-fixture','Provision verification','user') RETURNING id",
      [email],
    )
  ).rows[0].id;
  const shipment = (
    await db.query(
      "INSERT INTO shipments(tracking_number,origin,destination) VALUES('PROVISION-'||$1,'A','B') RETURNING id",
      [randomUUID()],
    )
  ).rows[0].id;
  const client = await db.connect();
  const { connectionFingerprint } = await import("./provisioningIdentity");
  const plan = {
    version: 1,
    targetFingerprint: connectionFingerprint(client),
    sourceEvidence:
      "Explicit synthetic ownership evidence for isolated provisioning verification.",
    workspaces: [
      { id: workspace, name: "Reviewed test workspace", organizationId: null },
    ],
    members: [{ userId: id, expectedEmail: email, workspaceId: workspace }],
    records: [
      {
        table: "shipments",
        id: shipment,
        workspaceId: workspace,
        provider: "reviewed-source",
      },
    ],
    connectors: [{ provider: "reviewed-" + workspace, workspaceId: workspace }],
  };
  try {
    await assert.rejects(() =>
      provisionWorkspaces(
        { ...plan, targetFingerprint: "0".repeat(64) },
        client,
        true,
        "isolated-verifier",
      ),
    );
    assert.equal((await provisionWorkspaces(plan, client)).applied, false);
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM workspaces WHERE id=$1",
          [workspace],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (await provisionWorkspaces(plan, client, true, "isolated-verifier"))
        .applied,
      true,
    );
    assert.equal(
      (
        await db.query("SELECT active_workspace_id FROM users WHERE id=$1", [
          id,
        ])
      ).rows[0].active_workspace_id,
      workspace,
    );
    const replay = await provisionWorkspaces(
      plan,
      client,
      true,
      "isolated-verifier",
    );
    assert.equal(replay.alreadyApplied, true);
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM provisioning_runs WHERE plan_hash=$1",
          [replay.planHash],
        )
      ).rows[0].n,
      1,
    );
    const conflicting = {
      ...plan,
      records: [
        ...plan.records,
        {
          table: "shipments",
          id: (
            await db.query(
              "SELECT id FROM shipments WHERE workspace_id=$1 LIMIT 1",
              [a.workspace],
            )
          ).rows[0].id,
          workspaceId: workspace,
          provider: "reviewed-source",
        },
      ],
    };
    await assert.rejects(() =>
      provisionWorkspaces(conflicting, client, true, "isolated-verifier"),
    );
  } finally {
    client.release();
  }
});

test("ownership inventory uses a read-only snapshot, preserves IDs and leaves every proposed assignment blank", async () => {
  const { ownershipInventory } = await import("./ownership-inventory");
  const client = await db.connect();
  try {
    const result = await ownershipInventory(client);
    assert.equal(result.inventory.readOnly, true);
    assert.equal(result.inventory.ownershipInferenceUsed, false);
    assert.equal(result.manifest.productionAssignmentsApproved, false);
    assert.equal(result.manifest.executable, false);
    assert(
      result.manifest.proposedAssignments.every(
        (row: any) =>
          row.proposedWorkspaceId === null &&
          row.approvedMemberIds.length === 0 &&
          row.verifiedOwnershipEvidence.length === 0,
      ),
    );
    assert(
      result.inventory.existingNodeUsers.some(
        (row: any) => row.id === String(a.id),
      ),
    );
    const shipments = result.inventory.records.find(
      (row: any) => row.sourceTable === "shipments",
    );
    assert.equal(Number(shipments.count), shipments.records.length);
    assert(
      shipments.records.every(
        (row: any) =>
          row.id &&
          row.ownershipEvidence.every((e: any) => e.verified === false),
      ),
    );
  } finally {
    client.release();
  }
});

test("purchase pages and catalogs expose records beyond their first bounded page without crossing organizations", async () => {
  const path = "/supply-chain/api/v1/orders",
    prefix = randomUUID();
  await db.query(
    `INSERT INTO supply_chain.purchase_orders(id,organization_id,supplier_id,order_number,status,total_amount,created_at,dispatch_state)
    SELECT gen_random_uuid(),$1,$2,'PAGE-'||$3||'-'||n,'draft',1,now()-interval '1 day'*n,'disabled' FROM generate_series(1,51) n`,
    [a.org, a.supplier, prefix],
  );
  await db.query(
    `INSERT INTO supply_chain.products(id,organization_id,sku,name,unit_price)
    SELECT gen_random_uuid(),$1,'PAGE-'||$2||'-'||n,'Page product '||lpad(n::text,3,'0'),1 FROM generate_series(1,101) n`,
    [a.org, prefix],
  );
  const orders = await (await call(a, path + "?offset=50")).json();
  assert.equal(orders.offset, 50);
  assert(orders.total >= 51);
  assert(
    orders.items.some((o: any) => o.orderNumber === "PAGE-" + prefix + "-51"),
  );
  const first = await (
    await call(a, path + "/products?paged=true&offset=0")
  ).json();
  const second = await (
    await call(a, path + "/products?paged=true&offset=100")
  ).json();
  assert.equal(first.items.length, 100);
  assert.equal(first.total, 102);
  assert.equal(second.items.length, 2);
  assert.equal(
    new Set([...first.items, ...second.items].map((r: any) => r.id)).size,
    102,
  );
  const others = await (
    await call(b, path + "/products?paged=true&offset=0")
  ).json();
  assert.equal(others.total, 1);
  assert.equal(others.items[0].id, b.product);
  assert(
    Array.isArray(await (await call(a, path + "/products")).json()),
    "legacy array clients remain supported",
  );
  assert.equal(
    (await call(a, path + "/products?paged=true&offset=-1")).status,
    400,
  );
});
