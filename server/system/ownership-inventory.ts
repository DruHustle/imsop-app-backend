import { connectionFingerprint } from "./provisioningIdentity";
import { Pool, PoolClient } from "pg";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parse } from "dotenv";
import { createHash } from "node:crypto";
const tables = [
  "shipments",
  "orders",
  "telemetry",
  "logistics_events",
  "supply_chain.purchase_orders",
  "supply_chain.purchase_order_items",
  "supply_chain.products",
  "supply_chain.suppliers",
  "supply_chain.warehouses",
  "supply_chain.inventories",
];
export async function ownershipInventory(client: PoolClient) {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    const meta = (
      await client.query(
        "SELECT current_database() AS database,current_user AS database_role,transaction_timestamp() AS snapshot,current_setting('transaction_read_only') AS read_only",
      )
    ).rows[0];
    if (meta.read_only !== "on")
      throw new Error("Read-only snapshot is required");
    const columns = async (table: string) => {
      const [schema, name] = table.includes(".")
        ? table.split(".")
        : ["public", table];
      return new Set(
        (
          await client.query(
            "SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2",
            [schema, name],
          )
        ).rows.map((r) => r.column_name),
      );
    };
    const records: any[] = [];
    const proposed: any[] = [];
    for (const table of tables) {
      const available = await columns(table);
      if (!available.has("id")) {
        records.push({
          sourceTable: table,
          available: false,
          count: null,
          records: [],
        });
        continue;
      }
      const fields = [
        "id",
        "workspace_id",
        "organization_id",
        "provider",
        "tracking_number",
        "order_number",
        "purchase_order_id",
        "product_id",
        "warehouse_id",
        "supplier_id",
      ].filter((field) => available.has(field));
      const rows: any[] = [];
      let cursor: string | undefined;
      while (true) {
        const page = (
          await client.query(
            `SELECT ${fields.map((field) => `source.${field}::text AS ${field}`).join(",")} FROM ${table} AS source${cursor ? " WHERE source.id>$1" : ""} ORDER BY source.id LIMIT 1000`,
            cursor ? [cursor] : [],
          )
        ).rows;
        if (!page.length) break;
        rows.push(...page);
        cursor = page[page.length - 1].id;
      }
      const count = (
        await client.query(`SELECT count(*)::text AS n FROM ${table}`)
      ).rows[0].n;
      if (count !== String(rows.length))
        throw new Error("Inventory snapshot is incomplete");
      records.push({
        sourceTable: table,
        available: true,
        count,
        records: rows.map((row) => ({
          id: row.id,
          storedWorkspaceId: row.workspace_id ?? null,
          storedOrganizationId: row.organization_id ?? null,
          ownershipEvidence: [
            ...(row.workspace_id
              ? [
                  {
                    field: "workspace_id",
                    value: row.workspace_id,
                    verified: false,
                  },
                ]
              : []),
            ...(row.organization_id
              ? [
                  {
                    field: "organization_id",
                    value: row.organization_id,
                    verified: false,
                  },
                ]
              : []),
          ],
          sourceReferences: Object.fromEntries(
            Object.entries(row).filter(
              ([key]) =>
                !["id", "workspace_id", "organization_id"].includes(key),
            ),
          ),
          referencesAreNotOwnershipApproval: true,
        })),
      });
      for (const row of rows)
        proposed.push({
          sourceTable: table,
          recordId: row.id,
          storedWorkspaceId: row.workspace_id ?? null,
          storedOrganizationId: row.organization_id ?? null,
          proposedWorkspaceId: null,
          approvedMemberIds: [],
          verifiedOwnershipEvidence: [],
          reviewStatus: "pending verified evidence",
        });
    }
    const readExisting = async (table: string, wanted: string[]) => {
      const available = await columns(table);
      const selected = wanted.filter((field) => available.has(field));
      if (!selected.length) return [];
      return (
        await client.query(
          `SELECT ${selected.map((field) => `${field}::text AS ${field}`).join(",")} FROM ${table}`,
        )
      ).rows;
    };
    const workspaces = await readExisting("workspaces", [
      "id",
      "name",
      "dotnet_organization_id",
    ]);
    const users = await readExisting("users", [
      "id",
      "email",
      "active_workspace_id",
    ]);
    const dotnetUsers = await readExisting("supply_chain.users", [
      "id",
      "email",
      "organization_id",
    ]);
    const memberships = await readExisting("workspace_memberships", [
      "user_id",
      "workspace_id",
    ]);
    const connectors = await readExisting("logistics_connectors", [
      "provider",
      "workspace_id",
    ]);
    await client.query("COMMIT");
    const targetFingerprint = connectionFingerprint(client);
    return {
      inventory: {
        version: 1,
        targetFingerprint,
        snapshotAt: new Date(meta.snapshot).toISOString(),
        readOnly: true,
        database: meta.database,
        databaseRole: meta.database_role,
        runtimeConnectionVerified: false,
        records,
        existingWorkspaces: workspaces,
        existingNodeUsers: users,
        existingDotnetUsers: dotnetUsers,
        existingMemberships: memberships,
        existingConnectorBindings: connectors,
        ownershipInferenceUsed: false,
      },
      manifest: {
        kind: "ownership-review-draft",
        version: 1,
        targetFingerprint,
        executable: false,
        productionAssignmentsApproved: false,
        sourceSnapshotAt: new Date(meta.snapshot).toISOString(),
        existingWorkspaceIds: workspaces.map((r) => r.id),
        existingNodeUserIds: users.map((r) => r.id),
        existingDotnetUserIds: dotnetUsers.map((r) => r.id),
        proposedAssignments: proposed,
        approvedMemberships: [],
        notes: [
          "Unsupported assignments deliberately remain null.",
          "Stored references are evidence for owner review, not approval.",
          "No ownership is inferred from roles, email domains, repository ownership or demo identities.",
          "This review draft is not accepted by the execution tool. Prepare a separately approved execution plan after verification.",
        ],
      },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
if (require.main === module) {
  void (async () => {
    const [envFile, outputDirectory] = process.argv.slice(2);
    if (!envFile || !outputDirectory)
      throw new Error(
        "Usage: node --import tsx system/ownership-inventory.ts explicit-env-file private-output-directory",
      );
    const config = parse(await readFile(resolve(envFile))),
      connectionString = config.DATABASE_URL;
    if (!connectionString || /REPLACE_|YOUR-/i.test(connectionString))
      throw new Error(
        "A valid explicitly selected database connection is required",
      );
    const pool = new Pool({
      connectionString,
      connectionTimeoutMillis: 10000,
      statement_timeout: 15000,
      options: "-c timezone=UTC",
    });
    try {
      const client = await pool.connect();
      try {
        const result = await ownershipInventory(client),
          output = resolve(outputDirectory);
        await mkdir(output, { recursive: true, mode: 0o700 });
        const inventory = {
          ...result.inventory,
          configurationFile: resolve(envFile),
          configuredHost: new URL(connectionString).hostname,
        };
        const text = JSON.stringify(inventory, null, 2) + "\n";
        await writeFile(join(output, "ownership-inventory.json"), text, {
          mode: 0o600,
        });
        await writeFile(
          join(output, "provisioning-review.json"),
          JSON.stringify(
            {
              ...result.manifest,
              inventorySha256: createHash("sha256").update(text).digest("hex"),
            },
            null,
            2,
          ) + "\n",
          { mode: 0o600 },
        );
        console.log(
          JSON.stringify({
            readOnly: true,
            productionAssignmentsApproved: false,
            runtimeConnectionVerified: false,
            tables: inventory.records.map((r) => ({
              table: r.sourceTable,
              count: r.count,
            })),
            files: ["ownership-inventory.json", "provisioning-review.json"],
          }),
        );
      } finally {
        client.release();
      }
    } finally {
      await pool.end();
    }
  })().catch((error) => {
    console.error(
      JSON.stringify({
        error:
          "Read-only inventory could not be completed; no writes attempted.",
        code: error.code ?? "INVENTORY_FAILED",
      }),
    );
    process.exitCode = 1;
  });
}
