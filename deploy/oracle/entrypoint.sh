#!/bin/sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

if [ -z "${ConnectionStrings__DefaultConnection:-}" ]; then
  echo "ConnectionStrings__DefaultConnection is required" >&2
  exit 1
fi

cd /app/node-api
if [ "${RUN_NODE_MIGRATIONS:-false}" = "true" ]; then
  node dist/migrate.js
fi
exec /usr/bin/supervisord -c /app/supervisord.conf
