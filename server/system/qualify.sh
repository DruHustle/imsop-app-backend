#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
export DATABASE_URL=postgresql://imsop_test:isolated-test-only@127.0.0.1:55467/imsop_test
export NODE_ENV=test
# Serial by design: the real browser recovery matrix restarts this backend.
docker compose -p imsop-remediation -f server/system/compose.yaml up -d --wait
TZ=Pacific/Honolulu pnpm -C server exec node --test --import tsx system/security.test.ts
pnpm -C server exec node --test --import tsx system/completion.test.ts
docker compose -p imsop-remediation -f server/system/compose.yaml restart backend
docker compose -p imsop-remediation -f server/system/compose.yaml up -d --wait
pnpm -C server exec node --test --import tsx system/gateway.test.ts
pnpm -C server exec node system/mutation-check.mjs
bash scripts/restore-drill.sh
pnpm -C server exec node --import tsx system/scale-fixture.ts
docker compose -p imsop-remediation -f server/system/compose.yaml restart backend
docker compose -p imsop-remediation -f server/system/compose.yaml up -d --wait
# Run the frontend real-browser command only after this script finishes.
