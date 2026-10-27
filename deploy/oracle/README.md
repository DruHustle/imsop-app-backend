# Oracle backend

The API runs on the shared **Software Engineering Backend** VM, hostname
`software-engineering-backend`, ARM64, at `152.70.22.84`. The Onesa VM is separate.

- API: `https://imsop-api.152-70-22-84.sslip.io`
- Runtime directory: `/opt/imsop-app-backend`
- Readiness: `/ready`; liveness: `/health`
- Diagnostic port: `127.0.0.1:11001` (never public)
- External private network: `imsop-app-backend-ingress`
- Caddy upstream: `imsop-app-backend-api:10000`
- Initial source revision: `6eff140eafb7d9455a957ad86354fe5b157b1591`

## Build and deploy

Run the repository checks first. Build a clean checkout for ARM64 using
`docker build --platform linux/arm64 --build-arg APP_REVISION=<sha> -f deploy/oracle/Dockerfile -t imsop-app-backend:oracle-<sha> .`.
For IMSOP, the existing Dockerfile starts the .NET gateway, operations and supply
chain services plus the Node API; all internal service ports stay private.
Exclude local environment files, `.git`, dependencies, build output and private
files from the context. Transfer with `docker save`, verify the archive checksum
and load with `sudo docker load` on the VM. No registry credentials are needed.

Back up the installed manifest before updating its pinned image. Production
variables live in mode-600 `compose.runtime.json`, an untracked environment
override preserving the existing managed database, signing keys, CORS origins
and provider configuration. No database was copied or deleted. Never print or
commit this file. JSON strings must escape `$` as `$$` for Compose interpolation.

From the runtime directory, validate with
`sudo docker compose -f compose.yaml -f compose.runtime.json config --quiet`,
then update with
`sudo docker compose -f compose.yaml -f compose.runtime.json up -d --wait`.
If using this repository template directly, set `APP_IMAGE` to the tested tag.
Verify readiness, anonymous authentication rejection and allowed/denied origins
through both Oracle HTTPS and the frontend. Do not run destructive database
migrations or create production users to test deployment. Keep CORS restricted
to the actual production frontend origins; do not use a wildcard.

## Shared ingress and rollback

Caddy remains in `/opt/smart-factory-basyx` for continuity, with each application's
external ingress network declared in its Compose file. Back up and validate its
configuration before graceful reloads. Do not restart sibling applications or
duplicate the existing singleton IoT worker.

Oracle releases are manual and independent from frontend releases. The former
Render service stays suspended with automatic deployment disabled. Retain the
previous image and manifest; restore its tag and run the same Compose update
command to roll back. An emergency Render rollback requires explicitly resuming
and checking that service before restoring the frontend API destination.

## Remediation release verification

The immutable build label and `/version` must agree with the backend SHA in the release manifest. `/health` is liveness; `/ready` now checks required Node migration and service readiness. A historical healthy result is not a revision receipt. Build using an exact committed source and retain the OCI manifest digest from `--metadata-file`; inspect `docker image inspect --format '{{.Architecture}} {{index .Config.Labels "org.opencontainers.image.revision"}}' IMAGE` before transfer.

Recovery requires `RESET_DELIVERY_KEY` (64 hex characters, kept in the existing secret mechanism) in addition to the existing mail and reset-URL settings. Run Node migrations separately with `MIGRATION_DATABASE_URL`; runtime migration is disabled unless `RUN_NODE_MIGRATIONS=true`. Apply the separate .NET EF upgrades under their schema owner, then leave production `Database__AutoMigrate=false`. See [provisioning](../../docs/PROVISIONING.md) before assigning historical rows or restoring internal-user access.

Record installed image digest, mounted manifest identity and observed `/version` after an authorized rollout. Check first-party browser cookies, a permitted source read, a cross-workspace denial and report permissions using approved non-customer test accounts only. Backend compatibility precedes frontend release. Keep all internal ports private; the existing diagnostic mapping remains loopback-only. No provider accounts or customer records are needed for isolated qualification.

Rollback rehearsal uses a previous **compatible scoped** image on the isolated stack, verifies version/readiness, then restores the candidate. Preserve migrations, outbox messages and operational records. An earlier image that exposes unassigned operational rows is not a safe security rollback. A destructive migration reversal is never implied by image rollback.
