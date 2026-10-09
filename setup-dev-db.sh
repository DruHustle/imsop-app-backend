#!/usr/bin/env bash
set -euo pipefail

repository_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$repository_dir"

docker compose up -d postgres
docker compose run --rm server node dist/migrate.js

echo "PostgreSQL development schema is ready."
