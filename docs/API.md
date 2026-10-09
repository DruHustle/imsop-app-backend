# API Reference

Default local Node API: `http://localhost:3001`  
Content type: `application/json`

Real-user authentication uses an `imsop_access` HttpOnly cookie. State-changing cross-site requests are constrained by exact CORS origins and `SameSite=Strict` cookies.

## Health

| Method | Path | Authentication | Purpose |
|---|---|---|---|
| GET | `/health` | Public | Process liveness |
| GET | `/ready` | Public | Database readiness |

## Authentication

| Method | Path | Authentication | Body |
|---|---|---|---|
| POST | `/api/auth/login` | Public/rate-limited | `{email,password}` |
| POST | `/api/auth/logout` | User | none |
| POST | `/api/auth/register` | Public/rate-limited | `{email,password,name}` |
| GET | `/api/auth/me` | User | none |
| POST | `/api/auth/request-reset` | Public/rate-limited | `{email}` |
| POST | `/api/auth/reset-password` | Public/rate-limited | `{token,newPassword}` |
| PATCH | `/api/auth/profile/{id}` | Same user | `{name}` |
| POST | `/api/auth/change-password/{id}` | Same user | `{currentPassword,newPassword}` |

Passwords must contain 12–128 characters for real accounts. Reset links expire after 15 minutes and become invalid after use.

## Operations and telemetry

| Method | Path | Roles |
|---|---|---|
| GET | `/api/operations/shipments` | admin, engineer, analyst, user |
| GET | `/api/operations/orders` | admin, engineer, analyst |
| GET | `/api/operations/shipments/export/report` | admin, analyst |
| GET | `/api/operations/orders/export/report` | admin, analyst |
| GET | `/api/telemetry` | admin, engineer, analyst |
| POST | `/api/telemetry` | admin, engineer |

Telemetry ingestion body:

```json
{"deviceId":"sensor-42","metricName":"temperature","metricValue":22.5}
```

## Logistics provider webhook

`POST /api/integrations/logistics/{provider}/events`

Headers:

```text
X-IMSOP-Timestamp: 1791510000
X-IMSOP-Signature: sha256=<hex HMAC>
```

Canonical payload:

```json
{
  "eventId": "evt-123",
  "eventType": "shipment.location",
  "trackingNumber": "SHP-001-2026",
  "status": "in_transit",
  "occurredAt": "2026-10-09T12:00:00.000Z",
  "origin": "Hamburg Port",
  "destination": "New York Port",
  "carrier": "Example Carrier",
  "transportMode": "sea",
  "estimatedArrival": "2026-10-20T08:00:00.000Z",
  "location": {"latitude": 40.684, "longitude": -74.0062, "label": "New York Port"}
}
```

Sign the exact raw JSON bytes as `HMAC_SHA256(providerSecret, timestamp + "." + rawBody)`. A successful new or duplicate event returns HTTP 202.

## .NET supply-chain API

All controller endpoints require a JWT with issuer `imsop-api`, audience `imsop-web`, and a valid role. Health endpoints remain public.

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/api/v1/orders` | admin, engineer, analyst | Create purchase order |
| GET | `/api/v1/orders/{id}` | admin, engineer, analyst | Retrieve purchase order |

