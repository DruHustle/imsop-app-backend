import {
  mkdtemp,
  cp,
  symlink,
  readFile,
  writeFile,
  rm,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
if (!/@127\.0\.0\.1:55467\/imsop_test$/.test(process.env.DATABASE_URL || ""))
  throw new Error("Disposable database required");
const cases = [
  [
    "broken SQL",
    "src/models/schema.ts",
    'id: serial("id").primaryKey()',
    "id: serial('missing_id').primaryKey()",
    "workspace provisioning",
  ],
  [
    "lost cookie",
    "src/middleware/auth.ts",
    "slice(13)",
    "slice(14)",
    "logout, disabled",
  ],
  [
    "missing workspace predicate",
    "src/controllers/operationalReads.ts",
    "eq(t.workspaceId, req.user!.workspaceId!)",
    "sql`true`",
    "workspace provisioning",
  ],
  [
    "wrong emitted reset route",
    "src/services/resetLink.ts",
    'route || "/reset-password"',
    "'/forgot-password'",
    "mail builder",
  ],
];
for (const [label, file, from, to, pattern] of cases) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "imsop-mutation-"));
  try {
    for (const name of [
      "src",
      "system",
      "migrations",
      "package.json",
      "tsconfig.json",
    ])
      await cp(name, path.join(dir, name), { recursive: true });
    await symlink(
      path.resolve("node_modules"),
      path.join(dir, "node_modules"),
      "dir",
    );
    const target = path.join(dir, file),
      text = await readFile(target, "utf8");
    if (!text.includes(from))
      throw new Error("Mutation anchor missing: " + label);
    await writeFile(target, text.replace(from, to));
    const result = spawnSync(
      process.execPath,
      [
        "--test",
        "--test-name-pattern",
        pattern,
        "--import",
        "tsx",
        "system/security.test.ts",
      ],
      { cwd: dir, env: { ...process.env, NODE_ENV: "test" }, encoding: "utf8" },
    );
    if (result.status === 0 || !result.stdout.includes("not ok"))
      throw new Error(
        "Mutation was not rejected: " + label + " " + result.stderr,
      );
    console.log(label + ": rejected by real PostgreSQL/HTTP assertion");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
