# Current IMSOP capability and architecture inventory

Authoritative as of 27 October 2026. This document supersedes the archived platform designs and generated public PDFs. Source contracts and isolated verification take precedence over architecture diagrams. Independent repositories, Node numeric IDs and .NET GUID entities remain independent. No production deployment is authorized by this remediation.

| Capability | State | Evidence / limits |
|---|---|---|
| React workspace, grouped navigation, themes, responsive shipment cards | Implemented | Frontend routes and Playwright suites |
| HttpOnly cookie authentication | Implemented | Node issues 15-minute JWT containing user ID and opaque session ID; every request checks PostgreSQL session/account/membership |
| Workspace access | Implemented; explicit provisioning required | Public registration has no operational workspace. Legacy rows are quarantined, not assigned by inference |
| Recovery | Implemented; provider configuration required in production | Encrypted PostgreSQL delivery queue; bounded retries; SMTP sink only in local qualification; acceptance means requested, never delivered |
| Shipment intake/projection | Implemented; configured providers only | Signed canonical webhook, workspace/provider/tracking identity, deterministic event replay, field provenance, immutable promise |
| Operational orders | Implemented scoped read/export | Node numeric records; unknown currency remains null; exact decimal strings |
| Purchase orders | Implemented API, separate GUID domain | Scoped supplier/product DTO, source currency, item totals, transaction/outbox, idempotent partial receiving and stock updates; draft/pending/disabled/failed/sent state |
| Exception review | Implemented | Signed exception → review → acknowledge/assign/note/resolve → audit → per-user in-app notification |
| Integration status | Implemented registry | Configuration and receipt evidence; no inference of current connectivity or successful provider sync |
| Analytics | Implemented descriptive metric | On time = actual arrival <= retained original promise; denominator requires explicit evidence of both |
| Assistant | Implemented deterministic retrieval | Exact identifiers, several records, authorized stable details; no model, bookings or side effects |
| Forecast provider adapter | Implemented; optional server configuration | Scoped historical source observations, bounded horizon, strict matching provider/model/snapshot/product/date/unit response, persisted runs; no model or account fabricated |
| Weather/ML training | Not implemented | No trained model, weather evidence, accuracy or financial impact is inferred |
| Review email notifications | Implemented; disabled until configured and opted in | Transactional queue, per-workspace preferences, bounded retries/leases, stable IDs, cancellation on opt-out/access removal. Provider acceptance is not inbox delivery |
| Oracle | Supported target; manual release | Existing ARM64 Software Engineering Backend VM; independent of Onesa and sibling applications |
| Kubernetes/Azure/Redis/Entra/GraphQL/WebSockets/Kafka/SignalR/Arc | Historical designs or unqualified examples | No active operational capability claimed |

## Request and schema boundaries

The root-base Vercel frontend retains first-party `/api` calls. Its existing proxy forwards cookies to the .NET YARP gateway; generic Node paths are forwarded to Node, `/supply-chain` removes that prefix and forwards to SupplyChainService. The .NET service validates the signed JWT and calls Node `/api/auth/session` on every request, forwarding only the presented credential and correlation ID. Failure or outage denies access. No cache permits a revoked session to remain usable. Service internal ports remain private.

Node owns public-schema migrations and tables. SupplyChainService owns `supply_chain` and its EF migration ledger. `workspaces.dotnet_organization_id` is an explicit operator-managed association to a .NET organization, never a cast of a Node user/order ID. Request DTOs cannot supply organization IDs. Every operational Node route applies workspace scope and then role permissions; every reachable .NET order query uses a verified organization filter.

Existing role policy remains: shipments and Assistant for admin/engineer/analyst/user; operational orders for admin/engineer/analyst; reports for admin/analyst. Review actions and purchase intake require admin/engineer. Analyst can inspect purchase orders and reviews; standard users can inspect their permitted in-app feed.

## Sessions and password recovery

Logout revokes the presented server session before clearing the cookie. Password reset/change atomically increments password reset and session versions. Role/disable/workspace changes trigger session-version revocation; membership removal fails the next request. JWT expiry and database expiry both apply. There is no refresh-token requirement. No access JWT is stored by the live browser.

Recovery tokens are audience/purpose restricted, expire in 15 minutes and are consumed by `UPDATE ... WHERE password_reset_version = expected RETURNING id`; password and both versions change together. The mail URL builder places exactly one token in the hash query, preserving other configured query parameters. The browser supports the historical outer query and hash query, rejects duplicates, removes the credential before rendering/analytics and keeps it in document memory only. A failed submission can retry; reload deliberately requires reopening the email link. Recovery always uses the real API, including from a demo identity. Demo recovery cannot simulate a password write.

Delivery credentials are AES-256-GCM encrypted under a separate 32-byte `RESET_DELIVERY_KEY`. The queue has a bounded lease, five attempts, exponential delay and expiry cleanup. Sent/failed/expired payloads are removed. Resend has a stable idempotency key and a 15-second timeout. SMTP is at least once after send-before-ack crashes; duplicate mail contains a token that still consumes once. Queue counts are visible to scoped administrators; failure logs contain only delivery identity/attempt. Provider acceptance is not proof of inbox delivery.

## Projection and delivery evidence contract v2

Webhook provider configuration binds a signing-key alias to one explicitly provisioned workspace. Use separate connector aliases for independently authorized accounts with the same carrier. Never rebind a connector to another workspace while old intake remains active. Identity is `(workspace, provider alias, trackingNumber)`; event identity is `(workspace, provider alias, eventId)`. A reused event identity with different canonical content returns 409. Legacy rows remain unassigned until a reviewed provider/workspace mapping exists.

The transaction takes a per-identity advisory lock, inserts the event, replays retained events ordered by `(occurredAt, eventId COLLATE C)` and commits the snapshot plus any initial review case atomically. Equal-time event IDs use byte order, independent of receipt race. Up to 10,000 events per shipment are supported; beyond this ingestion rolls back with an operator compaction requirement. This bound is a documented limitation, not silent truncation.

Absent fields preserve prior evidence. Explicit null clears carrier/mode/location/current ETA/actual arrival; route strings must be nonempty and are never inferred from a checkpoint label. Delivered status is terminal unless an explicit `shipment.corrected` event changes it. `shipment.delivered` requires `status=delivered` and explicit `actualArrival`; `occurredAt` is not fabricated into an arrival. Corrections retain all events. `projectionProvenance` identifies the event supplying each accumulated field; `snapshotEventId` and observation/receipt describe the latest event in the ordered projection. The first established provider estimate becomes immutable `promisedArrival`; later ETA revisions or late history cannot improve the promise retrospectively. Unknown legacy promises remain unknown.

## Bounded reads, precision and observability

Lists support literal search, exact identifier, status, carrier/mode, UTC creation dates, bounded limit/offset, stable-ID cursors, maxId high water and deterministic sort. Default legacy clients receive a bounded array of at most 100. Paginated clients receive `{items,total,limit,offset,maxId,nextCursor,source,scope,readAt,contractVersion}`. A read uses repeatable-read isolation; later cursor pages exclude new IDs above maxId. Concurrent corrections/deletes can invalidate a multi-page selection; the client requests refresh rather than claiming a complete partial result.

The frontend loads the complete matching selection in bounded pages, at most 10,000 records, and requires narrower filters above that. Table, map, local metrics and client export then use that selection; page controls only change table presentation. Assistant explicitly requested identities are retrieved afresh from scoped APIs. Source-read time and provider observation time are separate. Direct reports are capped at 10,000 and include mode, source, filters and generation time. Unknown currency is never assigned USD/EUR; decimal database values are formatted as exact strings. Mixed amounts are not aggregated. CSV cells are formula-neutralized; HTML values are escaped. Print workflows retain “Print / Save as PDF”.

Request logs use validated/generated correlation IDs across gateway, service and Node, with status, duration and route template. Credentials, body, email recipients and query strings are excluded from custom logs. Failure signals cover ingestion, reset delivery and outbox. This is application evidence, not a claim about hosted monitoring/backup settings.

The implemented optional forecast request/response and configuration contract is documented [here](contracts/OPTIONAL_FORECAST_PROVIDER.md). The provider must supply actual predictions; no account, model or observation history is invented. The UTC treatment of legacy timestamp reads is the retained application contract, not evidence about every historical producer's timezone; storage conversion remains deferred until that evidence is validated.


## Follow-up review and completion

The user authorized closing remaining code gaps and merging to main. [Follow-up review](remediation/FOLLOWUP-2026-10-27.md) supersedes the initial product deferrals. Purchasing is now available inside Orders for admin/engineer users: select actual scoped suppliers/products, supply source currency/prices, save a durable order, and record evidence-based partial warehouse receipts. Receipt keys and order/stock locks prevent replay and concurrent over-receipt. Legacy rows without item/currency evidence retain that absence. New order messages use contract 3 (decimal amount strings plus items/currency); existing queued contract 2 messages remain intact.

Operational emails are off unless `EMAIL_NOTIFICATIONS_ENABLED=true` and the existing mail provider is configured. Members must opt in for each workspace. Queued events are rechecked against current membership, disabled state and preference before send. In-app notices remain independent. No real email was sent during qualification.

Forecasts require an administrator-supplied HTTPS `FORECAST_PROVIDER_URL`, `FORECAST_PROVIDER_NAME`, optional server-only `FORECAST_PROVIDER_TOKEN` and a 1–90 day `FORECAST_MAX_HORIZON_DAYS`. Source observations are explicitly uploaded by admin/engineer; shipment counts and purchase amounts are not used as demand. The UI exposes source import, forecast requests, persisted evidence and provider limitations. The isolated provider is explicitly a contract double, not a prediction model.

Production provisioning remains pending verified assignments by the owner's explicit instruction. No production memberships or mappings are approved/applied. New audit schema 005 records future reviewed-plan execution transactionally and makes replays harmless; it does not assign any legacy row.
