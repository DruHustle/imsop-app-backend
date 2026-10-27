#!/usr/bin/env bash
set -euo pipefail
# Optional fresh-install rehearsal. Refuse to touch another Compose project.
[ "${IMSOP_DISPOSABLE_FRESH_INSTALL:-}" = yes ] || { echo 'Set IMSOP_DISPOSABLE_FRESH_INSTALL=yes only for the named disposable test stack.' >&2; exit 2; }
docker compose -f server/system/compose.yaml down -v
docker compose -f server/system/compose.yaml up -d --wait
