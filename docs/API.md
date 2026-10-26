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


## Operational workspace read API (26 October 2026)

These read-only additions reuse `shipments`, `orders`, and `logistics_events`; they do not create orders, shipments, integrations or operational effects. Existing report authorization is preserved.

| Method | Path | Roles | Result |
|---|---|---|---|
| GET | `/api/operations/shipments?limit=500&offset=0` | admin, engineer, analyst, user | Bounded shipment snapshot |
| GET | `/api/operations/shipments/{id}` | admin, engineer, analyst, user | Stable numeric shipment ID; 404 if absent |
| GET | `/api/operations/shipments/{id}/events?limit=50&offset=0` | admin, engineer, analyst, user | Event DTOs ordered by occurredAt DESC, id DESC |
| GET | `/api/operations/orders?limit=500&offset=0` | admin, engineer, analyst | Bounded Node operational orders |
| GET | `/api/operations/orders/{id}` | admin, engineer, analyst | Stable numeric Node order ID |
| GET | `/api/operations/reports/access` | admin, analyst | `{ "allowed": true }` after server authorization |

Pagination: integer `limit` 1–500 (default 100), integer `offset` 0–1000000 (default 0). Events cap the effective limit at 100. Invalid pagination/IDs return 400, unauthorized sessions 401, disallowed roles 403, missing records 404, unavailable stores 503. No failed source substitutes demonstration data.

Requesting either pagination parameter selects the list envelope:

```json
{
  "items": [], "total": 0, "limit": 500, "offset": 0,
  "source": "node.shipments", "scope": "Newest records by stable database ID"
}
```

Without pagination parameters, the legacy array response is retained but **bounded to 100 records**. Records are ordered by stable ID descending. `total` is a separate count of authorized source records; frontend metrics/filtering/reporting use only the explicitly loaded newest-500 scope. This release does not add arbitrary whole-database search or whole-history analytics.

Shipment DTOs keep `id` separate from `trackingNumber`, retain all existing snapshot fields, and add nullable `observedAt`, `receivedAt`, `provider` from the latest stored logistics event ordered by occurrence time and event ID. These are event evidence, not timestamps of every shipment snapshot field or proof of current provider connectivity. The read API does not reconcile out-of-order provider snapshot updates.

Event DTOs contain only `id`, `provider`, `eventType`, `occurredAt`, `receivedAt`; raw webhook payloads are deliberately excluded. Events are associated only through the shipment's stored tracking number. No order/document association is implied.

Node operational orders use numeric IDs, `orderNumber`, nullable `customerId`, `totalAmount`, `status`, and `createdAt`. Their amounts have **no currency contract**. They are not interchangeable with .NET PurchaseOrder GUIDs or `ApiResponse<PurchaseOrder>` envelopes. The .NET service contracts and gateway routes are unchanged. The workspace does not expose purchase-order creation without a full authorized organization/supplier selection flow.

Local tests exercise actual authentication/authorization middleware with deterministic database doubles. They perform no production reads/writes, provider calls, migrations or deployment. PostgreSQL query execution and live cross-service readiness require a separately configured integration environment.
