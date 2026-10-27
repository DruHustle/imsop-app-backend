import { connectionFingerprint } from "./provisioningIdentity";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { Pool, PoolClient } from "pg";
const uuid = z.string().uuid(),
  positive = z.number().int().positive();
const schema = z
  .object({
    version: z.literal(1),
    targetFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    sourceEvidence: z.string().trim().min(20).max(2000),
    workspaces: z
      .array(
        z.object({
          id: uuid,
          name: z.string().trim().min(1).max(200),
          organizationId: uuid.nullable(),
        }),
      )
      .min(1)
      .max(100),
    members: z
      .array(
        z.object({
          userId: positive,
          expectedEmail: z.string().email(),
          workspaceId: uuid,
        }),
      )
      .max(1000),
    records: z
      .array(
        z.object({
          table: z.enum([
            "shipments",
            "orders",
            "telemetry",
            "logistics_events",
          ]),
          id: positive,
          workspaceId: uuid,
          provider: z.string().min(1).max(100).optional(),
        }),
      )
      .max(10000),
    connectors: z
      .array(
        z.object({ provider: z.string().min(1).max(100), workspaceId: uuid }),
      )
      .max(100),
  })
  .strict();
export async function provisionWorkspaces(
  input: unknown,
  client: PoolClient,
  apply = false,
  operatorName?: string,
) {
  const plan = schema.parse(input),
    workspaces = new Set(plan.workspaces.map((w) => w.id));
  if (
    [...plan.members, ...plan.records, ...plan.connectors].some(
      (row) => !workspaces.has(row.workspaceId),
    )
  )
    throw new Error(
      "Every assignment must name a workspace in the reviewed plan",
    );
  if (plan.targetFingerprint !== connectionFingerprint(client))
    throw new Error("Reviewed plan targets a different database");
  if (apply && (!operatorName?.trim() || operatorName.length > 200))
    throw new Error("An operator name is required for an auditable apply");
  const canonical = (value: any): any =>
    Array.isArray(value)
      ? value
          .map(canonical)
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, canonical(value[key])]),
          )
        : value;
  const hash = createHash("sha256")
    .update(JSON.stringify(canonical(plan)))
    .digest("hex");
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      "provision:" + hash,
    ]);
    if (
      apply &&
      (
        await client.query(
          "SELECT plan_hash FROM provisioning_runs WHERE plan_hash=$1",
          [hash],
        )
      ).rowCount
    ) {
      await client.query("COMMIT");
      return { applied: false, alreadyApplied: true, planHash: hash };
    }
    for (const workspace of plan.workspaces) {
      if (
        workspace.organizationId &&
        !(
          await client.query(
            "SELECT id FROM supply_chain.organizations WHERE id=$1",
            [workspace.organizationId],
          )
        ).rowCount
      )
        throw new Error("Mapped organization does not exist");
      const old = (
        await client.query(
          "SELECT name,dotnet_organization_id FROM workspaces WHERE id=$1 FOR UPDATE",
          [workspace.id],
        )
      ).rows[0];
      if (
        old &&
        (old.name !== workspace.name ||
          old.dotnet_organization_id !== workspace.organizationId)
      )
        throw new Error("Existing workspace differs from reviewed plan");
      if (apply && !old)
        await client.query(
          "INSERT INTO workspaces(id,name,dotnet_organization_id) VALUES($1,$2,$3)",
          [workspace.id, workspace.name, workspace.organizationId],
        );
    }
    for (const member of plan.members) {
      const user = (
        await client.query(
          "SELECT email,active_workspace_id,disabled FROM users WHERE id=$1 FOR UPDATE",
          [member.userId],
        )
      ).rows[0];
      if (
        !user ||
        user.email !== member.expectedEmail ||
        user.disabled ||
        (user.active_workspace_id &&
          user.active_workspace_id !== member.workspaceId)
      )
        throw new Error(
          "Account identity or existing workspace differs from reviewed plan",
        );
      if (apply) {
        await client.query(
          "INSERT INTO workspace_memberships(user_id,workspace_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [member.userId, member.workspaceId],
        );
        await client.query(
          "UPDATE users SET active_workspace_id=$1 WHERE id=$2",
          [member.workspaceId, member.userId],
        );
      }
    }
    for (const record of [...plan.records].sort((a, b) =>
      (a.table + a.id).localeCompare(b.table + b.id),
    )) {
      // Table names come solely from the closed enum above; values are parameters.
      const row = (
        await client.query(
          `SELECT * FROM ${record.table} WHERE id=$1 FOR UPDATE`,
          [record.id],
        )
      ).rows[0];
      if (!row || (row.workspace_id && row.workspace_id !== record.workspaceId))
        throw new Error(
          "Missing record or cross-workspace reassignment rejected",
        );
      if (
        ["shipments", "logistics_events"].includes(record.table) &&
        (!record.provider || (row.provider && row.provider !== record.provider))
      )
        throw new Error("An explicit compatible provider mapping is required");
      if (apply) {
        if (record.table === "shipments")
          await client.query(
            "UPDATE shipments SET workspace_id=$1,provider=$2 WHERE id=$3",
            [record.workspaceId, record.provider, record.id],
          );
        else
          await client.query(
            `UPDATE ${record.table} SET workspace_id=$1 WHERE id=$2`,
            [record.workspaceId, record.id],
          );
      }
    }
    for (const connector of plan.connectors) {
      const old = (
        await client.query(
          "SELECT workspace_id FROM logistics_connectors WHERE provider=$1 FOR UPDATE",
          [connector.provider],
        )
      ).rows[0];
      if (old && old.workspace_id !== connector.workspaceId)
        throw new Error("Connector rebinding rejected");
      if (apply)
        await client.query(
          "INSERT INTO logistics_connectors(provider,workspace_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [connector.provider, connector.workspaceId],
        );
    }
    if (apply)
      await client.query(
        "INSERT INTO provisioning_runs(plan_hash,operator_name,source_evidence,reviewed_plan) VALUES($1,$2,$3,$4)",
        [hash, operatorName!.trim(), plan.sourceEvidence, JSON.stringify(plan)],
      );
    await client.query(apply ? "COMMIT" : "ROLLBACK");
    return {
      applied: apply,
      planHash: hash,
      workspaces: plan.workspaces.length,
      members: plan.members.length,
      records: plan.records.length,
      connectors: plan.connectors.length,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
if (require.main === module) {
  void (async () => {
    const [file, option] = process.argv.slice(2);
    if (!file || !process.env.DATABASE_URL || (option && option !== "--apply"))
      throw new Error(
        "Usage: DATABASE_URL=<migration connection> node --import tsx system/provision-workspaces.ts reviewed-private-plan.json [--apply]",
      );
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5000,
      statement_timeout: 15000,
    });
    try {
      const client = await pool.connect();
      try {
        console.log(
          JSON.stringify(
            await provisionWorkspaces(
              JSON.parse(await readFile(file, "utf8")),
              client,
              option === "--apply",
              process.env.PROVISIONING_OPERATOR,
            ),
          ),
        );
      } finally {
        client.release();
      }
    } finally {
      await pool.end();
    }
  })().catch(() => {
    console.error(
      "Provisioning failed; no changes committed. Review the plan and database preflight.",
    );
    process.exitCode = 1;
  });
}
