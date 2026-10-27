# Reproducible qualification

Unit/mocked-browser results and real-stack results are separate. No production credentials, customers, mail or provider account is used.

```sh
pnpm -C server install --frozen-lockfile
NODE_ENV=test pnpm -C server test
pnpm -C server build
dotnet restore src/IMSOP.sln
dotnet build src/IMSOP.sln --no-restore -c Release
dotnet test src/IMSOP.sln --no-build -c Release
```

Use the supported .NET 8 SDK. On a host with a different SDK, the recorded checks use a disposable `mcr.microsoft.com/dotnet/sdk:8.0` container mounted at `/src`.

```sh
docker buildx build --platform linux/arm64 --build-arg APP_REVISION=$(git rev-parse HEAD) -f deploy/oracle/Dockerfile -t imsop-remediation:qualification --load .
docker compose -f server/system/compose.yaml up -d --wait
DATABASE_URL=postgresql://imsop_test:isolated-test-only@127.0.0.1:55467/imsop_test NODE_ENV=test TZ=Pacific/Honolulu pnpm -C server exec node --test --import tsx system/security.test.ts
DATABASE_URL=postgresql://imsop_test:isolated-test-only@127.0.0.1:55467/imsop_test NODE_ENV=test pnpm -C server exec node --test --import tsx system/gateway.test.ts
DATABASE_URL=postgresql://imsop_test:isolated-test-only@127.0.0.1:55467/imsop_test NODE_ENV=test pnpm -C server exec node --test --import tsx system/completion.test.ts
DATABASE_URL=postgresql://imsop_test:isolated-test-only@127.0.0.1:55467/imsop_test NODE_ENV=test pnpm -C server exec node system/mutation-check.mjs
NODE_ENV=test pnpm -C server exec node --import tsx system/configuration-check.ts
bash scripts/restore-drill.sh
DATABASE_URL=postgresql://imsop_test:isolated-test-only@127.0.0.1:55467/imsop_test NODE_ENV=test pnpm -C server exec tsx system/query-plans.ts
```

The gateway suite seeds only synthetic organizations/users and writes non-secret browser context IDs to `/tmp/imsop-browser-fixture.json`. Reset links stay in the SMTP sink memory and browser process; they are not stored in screenshots or fixture files. The development-only transport double persists messages by stable identity in memory and can simulate outage. Actual PostgreSQL transactions, the Node API, .NET JWT/session boundary, YARP cookie forwarding, EF queries and the outbox worker remain under test.

In the frontend sibling checkout:

```sh
pnpm exec tsc --noEmit
pnpm test
VITE_BASE_PATH=/ pnpm build
pnpm e2e
pnpm audit --prod --audit-level=moderate
pnpm exec playwright test --config playwright.system.config.ts
```

The ordinary E2E suite uses isolated fixtures and labels them accordingly. The system config uses the real gateway on 18067 through a local first-party preview proxy on 4189; it contains no `page.route` fulfillment. Run the gateway seed suite and `DATABASE_URL=postgresql://imsop_test:isolated-test-only@127.0.0.1:55467/imsop_test NODE_ENV=test pnpm -C server exec tsx system/scale-fixture.ts` before the browser system suite. After a deliberate backend restart, run `docker compose -f server/system/compose.yaml up -d --wait` before issuing gateway requests. It changes only disposable test passwords. The preview proxy exists only when `IMSOP_SYSTEM_API` equals the exact local verification URL and never changes the production Vercel proxy.

Node process timezone is Honolulu in the real database suite; the Compose database also uses Honolulu. Legacy UTC wall-time behavior is checked before/after upgrade; no timestamp conversion is performed. Migration checksum mutation, concurrent runners and deliberate SQL/cookie/scope/reset-route breakages must be rejected. The restore drill is data-preserving for its source and is separate from migration downgrade.

Stop only this named test stack with `docker compose -f server/system/compose.yaml down -v` after collecting evidence. It never touches existing IMSOP development, Onesa or sibling containers. See `docs/remediation/RESULTS.md` for exact results and limitations.

For a deliberate fresh-install rerun, use `IMSOP_DISPOSABLE_FRESH_INSTALL=yes bash server/system/fresh-boot-check.sh`. It deletes only the named disposable test stack's own volumes. PostgreSQL readiness checks use TCP, preventing the initialization server's temporary Unix socket from falsely satisfying readiness. The migration connector also retries bounded transient startup refusals. No application runtime schema privilege is required when migrations are executed separately as documented.

The follow-up suite adds actual purchase-item/receipt races and stock effects, opt-in SMTP acceptance/cancellation, provider response validation/isolation, reset final-attempt recovery and reviewed-plan dry-run/apply/conflict behavior. New browser completion uses the same seeded account before the reset matrix. Run backend suites and browser suites serially: the recovery matrix deliberately restarts only its disposable backend; running gateway tests concurrently would interrupt their connections.
