import { connection } from "../src/config/db";
// Read-only counts; do not guess legacy ownership, emit emails, row contents or credentials.
async function main() {
  const report: any = {
    generatedAt: new Date().toISOString(),
    unassigned: {},
    legacyTimestampPolicy:
      "Historical UTC wall time retained without conversion",
  };
  for (const table of ["shipments", "orders", "telemetry", "logistics_events"])
    report.unassigned[table] = (
      await connection.query(
        `SELECT count(*)::int AS count FROM ${table} WHERE workspace_id IS NULL`,
      )
    ).rows[0].count;
  report.unprovisionedUsers = (
    await connection.query(
      "SELECT count(*)::int AS count FROM users u WHERE NOT EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.user_id=u.id)",
    )
  ).rows[0].count;
  report.ambiguousProviderTracking = (
    await connection.query(
      "SELECT count(*)::int AS count FROM (SELECT tracking_number FROM logistics_events GROUP BY tracking_number HAVING count(DISTINCT provider)>1) x",
    )
  ).rows[0].count;
  console.log(JSON.stringify(report, null, 2));
}
main().finally(() => connection.end());
