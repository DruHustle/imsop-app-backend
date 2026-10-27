import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
// Bind a reviewed plan to its configured database identity without persisting
// passwords. This is a consistency check, not an authorization credential.
export function connectionFingerprint(client: PoolClient) {
  const p = (client as any).connectionParameters;
  if (!p?.host || !p.database || !p.user)
    throw new Error("Database identity is unavailable");
  return createHash("sha256")
    .update(
      JSON.stringify({
        host: p.host,
        port: Number(p.port),
        database: p.database,
        user: p.user,
      }),
    )
    .digest("hex");
}
