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
then update through the retention-aware deployment command below.
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

## Image retention after every deployment

Keep the installed release and one rehearsed compatible rollback. Once a deployment
passes readiness and exact revision verification, discard older unused IMSOP
images on both the development host and Oracle. Do not retain every historical
release or rejected candidate. Shared base layers may remain while still used.

Install `scripts/image_retention.py` and `scripts/deploy_compose.py` together in
`/opt/imsop-app-backend/tools/` on Oracle. After qualification, backup, migration
and rollback rehearsal, pin the new image in the existing manifest and run:

```sh
sudo python3 /opt/imsop-app-backend/tools/deploy_compose.py \
  --project-directory /opt/imsop-app-backend \
  --file compose.yaml --file compose.runtime.json --service app \
  --origin http://127.0.0.1:11001 --expect-revision FULL_BACKEND_SHA
```

For the local development Compose stack, run from the backend repository:

```sh
python3 scripts/deploy_compose.py --file docker-compose.yml \
  --origin http://127.0.0.1:8080 --build
```

The command snapshots each service's previous image before updating, waits for
Compose and gateway readiness, and verifies contract 2 plus the exact SHA on
Oracle. Only then does it update the mode-0600 `.image-retention.json` policy and
remove older images. An unchanged service keeps its prior rollback. Failed
deployment/verification leaves the existing policy and images intact. Both tools
use `.deployment.lock`, shared with the existing Oracle release tooling. Keep the
policy across releases; missing rollback images stop cleanup rather than guessing.
This command does not replace qualification, backups, migration procedures or
compatibility rehearsal. Use the saved manifest to roll back if promotion fails.

To review cleanup without deploying or restarting anything, use the cleanup tool
with explicit installed current and rollback references. It defaults to a dry run:

```sh
python3 scripts/image_retention.py --keep CURRENT_IMAGE --keep ROLLBACK_IMAGE
# After reviewing the plan, repeat with --apply.
```

Cleanup recognizes only the explicit IMSOP repository names and the exact
`IMSOP backend` image title. Every running or stopped container's image is
protected, including platform-manifest aliases. Images shared with other
repositories are retained. Ownership and references are checked again immediately
before removal by immutable ID, without `--force` or parent-image pruning.
Docker conflicts are reported, never overridden. Containers, volumes, database
data, backups, registry artifacts and unrelated applications are not removed.
No global `docker system prune` or `docker image prune -a` is used.
