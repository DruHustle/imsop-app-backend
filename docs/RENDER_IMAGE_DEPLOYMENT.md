# Render deployment from a Docker image

IMSOP production uses one supervised backend image so it can be created as a single Render Web Service without a Blueprint. The image contains the public Gateway, Node API, Operations Service, and Supply Chain Service. Every service uses the same managed PostgreSQL database outside the container.

## Image

GitHub Actions publishes both immutable commit tags and `latest`:

```text
ghcr.io/druhustle/imsop-backend:<git-commit-sha>
ghcr.io/druhustle/imsop-backend:latest
```

Use the immutable SHA tag or digest for production releases and rollback. `latest` is suitable only for initial setup.

## Create the Render service

1. Select **New > Web Service**.
2. Select **Existing Image**.
3. Enter `ghcr.io/druhustle/imsop-backend:latest`.
4. If the GHCR package is private, add GitHub Container Registry credentials in Render. Prefer making this deployment package public if the source and image are intended to be public.
5. Name the service `imsop-backend-api` and choose Frankfurt.
6. Set the health check path to `/ready`.
7. Do not attach a persistent disk; databases are external.

## Required environment

```text
NODE_ENV=production
ASPNETCORE_ENVIRONMENT=Production
PORT=10000
DATABASE_URL=<managed PostgreSQL URL, for example postgresql://user:password@host:5432/database>
ConnectionStrings__DefaultConnection=<the same PostgreSQL database as an Npgsql connection string>
JWT_SECRET=<at least 32 random characters>
ALLOWED_ORIGIN=https://imsop-app.vercel.app
CORS_ALLOWED_ORIGINS=https://imsop-app.vercel.app
PASSWORD_RESET_BASE_URL=https://imsop-app.vercel.app/#/reset-password
EMAIL_PROVIDER=gmail
GMAIL_FROM=notifications.imsop@gmail.com
GMAIL_APP_PASSWORD=<Gmail app password>
LOGISTICS_WEBHOOK_SECRETS=<JSON copied from server/.env>
Database__AutoMigrate=true
ServiceBus__Enabled=false
```

Gmail OAuth variables can replace `GMAIL_APP_PASSWORD`. Do not copy local placeholder values into Render.

## Vercel

Set this Vercel production environment variable and redeploy:

```text
VITE_API_URL=https://imsop-backend-api.onrender.com
```

## Release and rollback

After GitHub Actions publishes a release, update the Render image to the new immutable SHA tag or digest and deploy. Verify `/health`, `/ready`, authentication, roles, logistics APIs, and the map from Vercel.

If verification fails, use Render's rollback action to restore the prior successful image-backed deploy. Retain older GHCR digests: image-backed rollback requires the target image to remain available.
