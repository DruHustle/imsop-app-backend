# IMSOP remediation qualification — 27 October 2026

The [supplied review](REVIEW-2026-10-26.txt) and [IMS-01–IMS-18 closure matrix](CLOSURE.md) are real repository content. All results below are isolated qualification; no production merge, deployment, customer mutation, provider connection or real mail send occurred.

## Revisions and working trees

Both independent repositories started clean, from freshly fetched main: backend `10da3ed91fd820660c1210dac4f2970b86e68788`, frontend `367f4abfc10d681d60c38244865a831d78be7588`. Existing branches (`fix/operational-event-timestamps` backend; `feat/operational-workspace-redesign` frontend), remotes and histories were preserved. Both remediation branches are `fix/imsop-remediation-20261027`.

The qualified backend runtime source is **`d2e78b391d5772e3b8ac2b8d919e8aabb40b3012`**. The frontend application source is **`5d1971070703d002f5eb28495d1da6345e7d93d1`**. Subsequent documentation, test and evidence commits do not change those application files. The [release manifest](../../verification/release-manifest.json) binds these revisions to contract 2, Node schema `003_projection_provenance.sql`, EF schema `202610270001_DurableOrders` and the qualified ARM64 image digest. It is an isolated candidate manifest, not a published or installed production release.

## Node, PostgreSQL and gateway results

Commands ran from this repository unless stated otherwise. Host Node was 20.20.1; the bundle uses Node 22 and supported .NET 8. PostgreSQL 16, Node process and database timezone checks use Pacific/Honolulu; historical UTC wall-time fields are preserved without conversion.

| Check and exact command | Result | Evidence |
|---|---|---|
| `pnpm -C server test` | 14 tests passed | [Node unit/HTTP fixtures](../../verification/node-unit.txt) |
| `pnpm -C server build` | TypeScript passed | [Node build](../../verification/node-build.txt) |
| `DATABASE_URL=postgresql://imsop_test:isolated-test-only@127.0.0.1:55467/imsop_test NODE_ENV=test TZ=Pacific/Honolulu pnpm -C server exec node --test --import tsx system/security.test.ts` | 11 tests passed against real PostgreSQL/direct Node HTTP | [PostgreSQL/security/upgrade](../../verification/real-postgres.txt) |
| `DATABASE_URL=postgresql://imsop_test:isolated-test-only@127.0.0.1:55467/imsop_test NODE_ENV=test pnpm -C server exec node --test --import tsx system/gateway.test.ts` | 5 tests passed through actual YARP/.NET/EF/PostgreSQL | [Gateway, SMTP sink and outbox](../../verification/gateway-system.txt) |
| `DATABASE_URL=postgresql://imsop_test:isolated-test-only@127.0.0.1:55467/imsop_test NODE_ENV=test pnpm -C server exec node system/mutation-check.mjs` | All four deliberate SQL/cookie/scope/reset-route breakages rejected | [Regression sensitivity](../../verification/mutation-checks.txt) |
| `bash scripts/restore-drill.sh` | Disposable restored copy matched all eight source table counts; **22 seconds**, snapshot **2026-10-27 00:50:22.537716 UTC** | [Restore](../../verification/restore-drill.txt) |
| `DATABASE_URL=postgresql://imsop_test:isolated-test-only@127.0.0.1:55467/imsop_test NODE_ENV=test pnpm -C server exec tsx system/query-plans.ts` | Actual EXPLAIN ANALYZE BUFFERS; 30 samples, median 8.57 ms / p95 35.66 ms | [Plans and measurements](../../verification/query-plans.txt) |
| `DATABASE_URL=postgresql://imsop_test:isolated-test-only@127.0.0.1:55467/imsop_test NODE_ENV=test pnpm -C server exec tsx system/preflight.ts` | Read-only synthetic ownership counts; no production backfill | [Preflight](../../verification/provisioning-preflight.json) |

The security suite covers public/unprovisioned and two-workspace access, role/resource denial, atomic concurrent recovery and change-password races, expiry/replay, out-of-order/sparse/equal-time/concurrent events, provider identity collisions, original-promise delivery corrections/currency/UTC reports, 620-row cursor selection and concurrent insert stability, fresh/legacy upgrade/concurrent migration/checksum mutation. The grouped unknown-mode scope predicate has a real cross-workspace regression.

The gateway suite covers cookie forwarding, scope/strict DTOs, one logical order with atomic outbox, failed transport/retry, crash lease recovery and redelivery identity, generated SMTP recovery links, reset/logout/disable/role-change/expiry rejection through .NET, and signed event intake. PostgreSQL, gateway and service code are real; external mail and broker are explicitly isolated doubles. No external fulfillment or inbox delivery is claimed.

Start the stack with `docker compose -p imsop-remediation -f server/system/compose.yaml up -d --wait`. After a deliberate backend restart, run the same `up -d --wait` before the gateway suite. Restart only this disposable backend between repeated identity scenarios to begin a fresh limiter window; the actual 10-request limiter remains unchanged. Starting immediately after restart without waiting produced a harness cancellation on this host; readiness sequencing corrected the run.

## .NET and ARM64/container qualification

```sh
docker build --target dotnet-build -f deploy/oracle/Dockerfile -t imsop-remediation:dotnet-build .
docker run --rm --entrypoint /bin/sh imsop-remediation:dotnet-build -c 'dotnet restore src/IMSOP.sln && dotnet build src/IMSOP.sln --no-restore -c Release && dotnet test src/IMSOP.sln --no-build -c Release'
docker buildx build --platform linux/arm64 --build-arg APP_REVISION=d2e78b391d5772e3b8ac2b8d919e8aabb40b3012 -f deploy/oracle/Dockerfile -t imsop-remediation:qualification --metadata-file /tmp/imsop-image-metadata.json --load .
docker image inspect imsop-remediation:qualification --format '{{.Architecture}} {{index .Config.Labels "org.opencontainers.image.revision"}}'
node server/system/release-receipt.mjs d2e78b391d5772e3b8ac2b8d919e8aabb40b3012
node scripts/release-manifest.mjs 5d1971070703d002f5eb28495d1da6345e7d93d1 d2e78b391d5772e3b8ac2b8d919e8aabb40b3012 sha256:38f517cd90370ebbd9570c381aa49cc25224cd2cc2e4e9c783b1835dd82786c2
```

Restore/build passed with zero warnings/errors and **4 .NET tests passed** ([log](../../verification/dotnet.txt)). [ARM64 build](../../verification/arm64-build.txt), [image identity](../../verification/image-identity.txt), [immutable digests](../../verification/image-digests.json) and [running candidate receipt](../../verification/candidate-restored-receipt.json) agree. Readiness 200, authorized .NET read 200 and anonymous session 401 were observed, with one canonical correlation response header. The [redacted trace](../../verification/correlation-trace.txt) follows the same ID through YARP, SupplyChainService and Node session introspection.

The rollback rehearsal switched only the isolated IMSOP backend from `d2e78b3` to the independently built, scoped-compatible `f8b52e56b16184adfb209f112c99c40bbb482483` image, then back. Version/readiness were verified at each step, and [all operational counts were unchanged](../../verification/rollback-data-preservation.json). [Before](../../verification/rollback-before.json), [rollback](../../verification/rollback-receipt.json), [after](../../verification/rollback-after.json). No reverse migration was run. The older image predates the single-header fix; this rehearsal establishes compatible image/data recovery, while the restored candidate separately passes the strict current header/auth receipt.

A second clean Compose project (`imsop-remediation-fresh`, only its own loopback ports/volumes) booted fresh Node/.NET schemas and passed readiness ([log](../../verification/fresh-stack-boot.txt)). It was removed afterward. This caught and fixed temporary-socket PostgreSQL readiness; readiness now uses TCP and migration connection retries are bounded. `NODE_ENV=test pnpm -C server exec node --import tsx system/configuration-check.ts` accepted an inert valid production configuration and rejected seven missing required settings without starting a listener, database or mail connection ([record](../../verification/production-configuration.txt)). Kubernetes is deliberately unsupported/retired, not claimed boot-qualified.

## Browser, design and actual scope

The frontend's [current exact commands, screenshots and visual inspection record](https://github.com/DruHustle/imsop-app-frontend/blob/fix/imsop-remediation-20261027/verification/remediation/RESULTS.md) separate unit, mocked browser and real browser results. The real suite uses port 4189 and the actual bundle on 18067, PostgreSQL, mail sink and signed event intake; no response fulfillment substitutes for the API/database. Synthetic scale fixtures are generated by `system/scale-fixture.ts` and contain 620 records with an old delayed shipment. Only fixture context IDs are written to `/tmp`; emitted reset credentials remain in the sink/browser memory and are scrubbed before screenshots.

The eight tabs follow the supplied board layouts and shared spacing/type/components. Original navy/slate/cyan and light/dark tokens and Light/Dark/System behavior remain authoritative. Actual authorized records drive metrics/charts, including original-promise delivery performance; illustrative board numbers are not a live source.

## Release and external limitations

No production merge/deployment, hosted version receipt, provider configuration inspection, customer backfill, production mail or provider account connection occurred. CI status is separate from installed/runtime identity. Existing hosted backup/monitoring settings are **unverified**, not presumed absent. The local restore is not a production RPO/RTO guarantee.

Before a separately authorized release, the existing owners must supply reviewed workspace/provider mappings, the recovery encryption key and configured secrets, apply both schema owners' forward migrations and verify the compatible backend before frontend rollout. See [provisioning](../PROVISIONING.md), [recovery](../RECOVERY.md), [deployment](../DEPLOYMENT.md) and the [optional forecast contract](../contracts/OPTIONAL_FORECAST_PROVIDER.md). Full purchasing UI, external notification delivery and model forecasts remain explicit product limits; durable API/order handling and the signed-event review/in-app notification cycle are implemented.
