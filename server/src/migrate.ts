import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import "./config/env";

// Adopt only the exact reviewed legacy migration; never bless arbitrary changed SQL.
const legacyChecksums: Record<string, string> = {
  "000_initial_schema.sql":
    "e51d9f630c504255bf80d636328137f37e682d49d8b3c65bb6eea8f4ba634dcc",
};
export async function migrate(
  connectionString = process.env.MIGRATION_DATABASE_URL ||
    process.env.DATABASE_URL,
  directory = path.resolve(process.cwd(), "migrations"),
) {
  if (!connectionString)
    throw new Error("A migration database URL is required");
  const pool = new Pool({ connectionString, connectionTimeoutMillis:5000 });
  const connection = await (async()=>{
    for(let attempt=0;;attempt++) {
      try{return await pool.connect();}
      catch(error) {
        const code=(error as {code?:string}).code;
        if(attempt>=4 || !['ECONNREFUSED','57P03'].includes(code||'')){await pool.end();throw error;}
        await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));
      }
    }
  })();
  try {
    await connection.query("SET lock_timeout = '30s'");
    await connection.query("SELECT pg_advisory_lock(491697, 1)");
    await connection.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (name varchar(255) PRIMARY KEY, applied_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, checksum text)`,
    );
    await connection.query(
      "ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text",
    );
    const files = (await fs.readdir(directory))
      .filter((file) => file.endsWith(".sql"))
      .sort();
    for (const file of files) {
      const body = await fs.readFile(path.join(directory, file), "utf8");
      const checksum = createHash("sha256").update(body).digest("hex");
      const result = await connection.query(
        "SELECT checksum FROM schema_migrations WHERE name=$1",
        [file],
      );
      if (result.rowCount) {
        const prior = result.rows[0].checksum || legacyChecksums[file];
        if (prior !== checksum)
          throw new Error(`Migration checksum mismatch: ${file}`);
        if (!result.rows[0].checksum)
          await connection.query(
            "UPDATE schema_migrations SET checksum=$1 WHERE name=$2",
            [checksum, file],
          );
        continue;
      }
      await connection.query("BEGIN");
      try {
        await connection.query(body);
        await connection.query(
          "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",
          [file, checksum],
        );
        await connection.query("COMMIT");
        console.log(`Applied migration ${file}`);
      } catch (error) {
        await connection.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await connection
      .query("SELECT pg_advisory_unlock(491697, 1)")
      .catch(() => undefined);
    connection.release();
    await pool.end();
  }
}
if (require.main === module)
  migrate().catch((error) => {
    console.error(JSON.stringify({event:"migration_failed",code:error.code||error.name,action:"Check database readiness, migration checksum and migration privileges"}));
    process.exitCode = 1;
  });
