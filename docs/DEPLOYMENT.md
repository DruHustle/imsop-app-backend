# Deployment Guide

## Required production secrets

Never commit these values. Configure them in the private Oracle Compose runtime override or Kubernetes secrets:

- `DATABASE_URL`
- `JWT_SECRET` (at least 32 random characters)
- `ALLOWED_ORIGIN` (exact frontend origin)
- `PASSWORD_RESET_BASE_URL`
- `EMAIL_PROVIDER=gmail`
- `GMAIL_FROM=notifications.imsop@gmail.com`
- `GMAIL_APP_PASSWORD` or Gmail OAuth client credentials
- `LOGISTICS_WEBHOOK_SECRETS` (JSON provider-to-secret map; every secret at least 32 characters)

Use a Google App Password, not the account password. Resend is already supported for a later verified domain by setting `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, and `EMAIL_FROM`.

## Local development

Backend:

```bash
cp server/.env.example server/.env
docker compose up -d mysql
cd server
pnpm install --frozen-lockfile
pnpm build
pnpm db:migrate
pnpm dev
```

Frontend, in the sibling `imsop-app-frontend` repository:

```bash
cp .env.example .env
pnpm install --frozen-lockfile
pnpm dev
```

## Oracle production

The production API runs on the shared **Software Engineering Backend** Oracle VM
at `https://imsop-api.152-70-22-84.sslip.io`. See
[Oracle image deployment and rollback](../deploy/oracle/README.md) for the tested
ARM64 image, private runtime override, ingress and release commands.

The single production image contains the .NET gateway, Operations and Supply
Chain services, and Node API. Internal service ports remain private. Existing
managed PostgreSQL data, signing keys, provider settings and authorization
controls are preserved. No production database is created or copied by the
hosting migration.

The Vercel frontend uses its same-origin `/api/*` proxy; GitHub Pages uses the
Oracle HTTPS origin. Do not resume retired services or restore obsolete
Blueprint/deploy-hook instructions. Roll back to the previous tested Oracle
image and verify readiness before routing traffic.

## Local complete stack

Start the same backend topology locally:

```bash
docker compose up -d --build
curl --fail http://127.0.0.1:8080/ready
docker compose ps
```

The databases are private to the Compose network. Public development ports are gateway `8080`, Node API `3001`, Operations `5101`, and Supply Chain `5102`.

## Kubernetes

The main-branch CI workflow publishes the .NET service images to GitHub Container Registry using the repository's built-in `GITHUB_TOKEN`:

```text
ghcr.io/druhustle/imsop-gateway:<git-sha>
ghcr.io/druhustle/imsop-operationsservice:<git-sha>
ghcr.io/druhustle/imsop-supplychainservice:<git-sha>
```

It also updates `latest` for convenience. Production manifests should use the immutable Git SHA tag or image digest, not `latest`. No ACR credentials are required. If a package is private, configure an image-pull secret in the deployment cluster; public packages can be pulled directly.

Create `db-secrets` and `api-secrets`, then deploy an immutable image tag/digest:

```bash
export IMSOP_IMAGE=ghcr.io/druhustle/imsop-gateway@sha256:<digest>
bash scripts/deploy-kubernetes.sh
```

The deployment uses three replicas, `maxUnavailable: 0`, readiness/liveness probes, and revision history. If rollout health fails, the script runs `kubectl rollout undo` and verifies the restored revision.

## Frontend

The frontend GitHub Pages workflow builds only after its tests pass. Configure:

```text
VITE_API_URL=https://imsop-api.152-70-22-84.sslip.io
VITE_GOOGLE_MAPS_API_KEY=<restricted-browser-key>
```

Restrict the Maps key by HTTPS referrer and enable only the required Maps APIs.

## Release verification

```bash
# Backend repository
DOTNET_ROLL_FORWARD=Major dotnet test src/IMSOP.sln -m:1
pnpm -C server test
pnpm -C server build

# Frontend repository
pnpm test
pnpm build
pnpm e2e
```

After deployment, verify `/health`, `/ready`, demo login for all roles, every authorized route, access-denied behavior, operations/map/export, profile/settings, logout, and mobile navigation.

