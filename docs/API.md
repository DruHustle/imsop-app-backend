# Current API reference

See [current architecture and contract](CURRENT_PLATFORM.md) and [isolated commands/results](remediation/RESULTS.md). These paths are actual reachable source contracts; the older platform API design is archived.

All operational calls require a valid cookie/bearer session and provisioned workspace. The root Vercel frontend uses same-origin `/api` through its existing first-party proxy. Session cookie is HttpOnly, Secure in production, SameSite=None in production. Cookie mutations require an allowed Origin; do not bypass CSRF checks. API errors return JSON with an `error`; session expiry/revocation returns 401 and `SESSION_EXPIRED`. Unprovisioned accounts return 403; inaccessible stable IDs return 404.

| Method/path | Contract / access |
|---|---|
| POST `/api/auth/register` | `{email,password,name}`; password 12–128; no workspace automatically assigned |
| POST `/api/auth/login` | `{email,password}`; response `{user}`, HttpOnly cookie; no JWT response |
| GET `/api/auth/me` | Public user profile only |
| GET `/api/auth/session` | Verified session identity, role, workspace and explicit organization association; no password/hash |
| POST `/api/auth/logout` | Revoke presented session and clear cookie; await 204 |
| POST `/api/auth/request-reset` | `{email}`; neutral 202 recovery-request acknowledgement, no credential returned |
| POST `/api/auth/reset-password` | `{token,newPassword}`; one atomic consumption; generic invalid/expired/used response |
| POST `/api/auth/change-password/:id` | Current and new password; own account; revokes all account sessions |
| PATCH `/api/auth/profile/:id` | `{name}`; own account only |
| GET `/api/operations/shipments` | All four roles; bounded list contract below |
| GET `/api/operations/shipments/summary` | Same authorized filters, aggregate counts and original-promise metric definition |
| GET `/api/operations/shipments/:id` | Scoped numeric ID; snapshot and projection provenance |
| GET `/api/operations/shipments/:id/events` | Scoped event metadata, at most 100; no raw webhook payload |
| GET `/api/operations/orders[/:id]` | Node numeric orders; admin/engineer/analyst; currency nullable |
| GET `/api/operations/reports/access` | admin/analyst export permission |
| GET `/api/operations/{shipments,orders}/export/report` | HTML, same filters, cap 10,000, escaped values and report metadata |
| GET `/api/operations/reviews` | Workspace cases, bounded limit/offset |
| GET `/api/operations/reviews/operators` | Permitted workspace operator list, admin/engineer |
| GET/POST `/api/operations/reviews/:id/actions` | Read history; write admin/engineer `{action,version,note?,assigneeId?}`; optimistic version, 409 on conflict |
| GET `/api/operations/notifications` | Latest 100 scoped review activities with per-user read state; in-app capability |
| POST `/api/operations/notifications/:id/read` | Persist own read state; no cross-workspace IDs |
| GET `/api/operations/integrations` | admin/engineer sanitized source registry, configuration flags and last receipt/observation; no connectivity claim |
| GET/POST `/api/telemetry` | Scoped bounded reads and role-controlled writes |
| POST `/api/integrations/logistics/:provider/events` | HMAC-signed contract v2; provider bound server-side to workspace |
| GET `/health`, `/ready`, `/version` | Sanitized revision/contract/schema identity; readiness checks schema/dependencies |
| GET `/supply-chain/api/v1/orders/:guid` | Separate .NET entity/envelope, organization from live session introspection |
| GET `/supply-chain/api/v1/orders/{suppliers,products}` | Bounded authorized relationship lists |
| POST `/supply-chain/api/v1/orders` | admin/engineer; `Idempotency-Key` required; `{supplierId,orderNumber,totalAmount}`; caller organization rejected; draft plus durable outbox |

Lists: `limit=1..500`, `offset=0..1000000`, literal `q` (max 200), exact `identifier`, `status` (including attention/active), shipment carrier/mode, `from`/`to` UTC creation dates, `sort=newest|tracking|eta`. Stable-ID `cursor` and `maxId` are available with newest sort; other sorts use bounded offset and maxId. Default no-pagination legacy contract remains a bounded array. Do not supply workspace/organization query identifiers. Dates and timestamps in responses are ISO UTC. Decimal amounts remain exact strings, not inferred currency values.

Webhook contract example (isolated sample, not a real provider request):

```json
{"eventId":"sample-delivery-1","eventType":"shipment.delivered","trackingNumber":"SAMPLE-10","status":"delivered","occurredAt":"2026-10-27T09:00:00Z","actualArrival":"2026-10-27T08:55:00Z"}
```

Sign the exact UTF-8 body using `sha256=HMAC_SHA256(secret, timestamp + "." + body)`, headers `x-imsop-timestamp` (epoch seconds within 300 seconds) and `x-imsop-signature`. Secrets are per connector alias, at least 32 characters. Events accept road/rail/air/sea/parcel/other, explicit route corrections and nullable optional evidence. See the reducer contract for tie, clear and delivery-correction semantics. Unknown fields are rejected.

Order `sent` means accepted by the configured transport, never fulfillment completed. Retry with identical key/content returns the same order; key reuse with changed content returns 409. No purchasing form or invented supplier/product selection is enabled in this release.
