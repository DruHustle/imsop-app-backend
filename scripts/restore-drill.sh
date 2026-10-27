#!/usr/bin/env bash
set -euo pipefail
# This script operates only on the explicitly named disposable verification database.
container=imsop-remediation-database-1
[ "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$container")" = imsop-remediation ]
backup_file=$(mktemp /tmp/imsop-restore.XXXXXX)
restore_database="imsop_test_restore_$(date +%s)"
started=$(date +%s)
trap 'rm -f "$backup_file"' EXIT
point=$(docker exec "$container" psql -U imsop_test -d imsop_test -Atc "SELECT now()")
docker exec "$container" pg_dump -U imsop_test -d imsop_test -Fc > "$backup_file"
docker exec "$container" createdb -U imsop_test "$restore_database"
docker exec -i "$container" pg_restore -U imsop_test -d "$restore_database" --no-owner < "$backup_file"
for table in users shipments logistics_events review_cases review_actions auth_sessions supply_chain.purchase_orders supply_chain.order_outbox; do
  source_count=$(docker exec "$container" psql -U imsop_test -d imsop_test -Atc "SELECT count(*) FROM $table")
  restored_count=$(docker exec "$container" psql -U imsop_test -d "$restore_database" -Atc "SELECT count(*) FROM $table")
  [ "$source_count" = "$restored_count" ]
  printf '%s: source=%s restored=%s\n' "$table" "$source_count" "$restored_count"
done
printf 'Restored snapshot point: %s\nDisposable destination: %s\nRecovery elapsed seconds: %s\n' "$point" "$restore_database" "$(($(date +%s)-started))"
# Keep the disposable restored copy for review; remove with an explicit test-only cleanup later.
