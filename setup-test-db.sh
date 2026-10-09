#!/usr/bin/env bash
set -euo pipefail

repository_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$repository_dir"

docker compose up -d postgres
docker compose exec -T postgres dropdb --if-exists -U imsop imsop_test
docker compose exec -T postgres createdb -U imsop imsop_test

docker compose run --rm \
  -e DATABASE_URL=postgresql://imsop:imsop-postgres-local@postgres:5432/imsop_test \
  server node dist/migrate.js

echo "PostgreSQL test database imsop_test is ready."
