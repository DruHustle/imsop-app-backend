# Operations, failure recovery and restore rehearsal

Owner: existing IMSOP release/database administrator; escalation: product/data owner for disputed workspace mapping, ingestion correction or order reconciliation. No new monitoring subscription is required.

Inspect redacted structured logs by `X-Request-ID`. Ingestion failure means the event transaction rolled back; retry the identical event identity and content. A 409 means identity reuse with different content and requires provider correction under a new event ID. A review resolution only resolves the human follow-up, never carrier delivery.

Reset queue: monitor pending age, attempts, failed/expired counts and worker error events. Confirm provider configuration/key access without printing it. Fix the provider, then request a new reset link after failure/expiry. Never log, manually extract or expose encrypted payloads. Back up the encryption key separately through the existing secret mechanism; lost keys make pending messages undeliverable, so expire them and reissue requests. Provider acceptance does not prove delivery.

Order outbox: inspect `state`, attempts, next attempt and lease age, scoped via the order API/authorized operator tooling. A disabled transport saves a draft and disabled outbox; enabling a configured transport resumes dispatch. After five attempts the row is failed. Recover by fixing configuration and explicitly resetting only reviewed failed rows to pending with attempts=0 and next_attempt_at=now(). Use the same message/order identity. A send-before-ack crash can redeliver; consumers must deduplicate MessageId. Never create a replacement order to work around a dispatch failure. There is no fulfillment consumer in this repository, so sent means transport accepted, not fulfilled.

## Schema owners and rollout

Node public-schema SQL is immutable, checksum recorded and serialized by advisory lock. Legacy initial ledger adoption accepts only the exact reviewed checksum. `MIGRATION_DATABASE_URL` supports a separate migration role. Runtime `DATABASE_URL` should receive only table SELECT/INSERT/UPDATE and sequence usage required by the API/workers; no CREATE/ALTER/DROP privileges. Run migrations as a separate release step. Oracle runtime migration is opt-in `RUN_NODE_MIGRATIONS=true` for isolated tests/bootstrap only; default false. Supply-chain schema and EF ledger belong to the .NET migration principal. Production `Database:AutoMigrate` remains false; apply its forward migrations with the supported .NET 8 EF tool in a single migration job before runtime starts.

The workspace/schema expansion preserves existing data but fails closed on unassigned rows and revokes legacy claim-only sessions. It requires coordinated backend rollout and reviewed provisioning before customers resume work. Deploy the compatible backend and check contracts before frontend rollout. If a partial release fails, preserve the migration ledger and data, repair forward and retry. Never edit already-applied SQL. Roll back application images without reversing durable tables or restoring an old insecure public-data access boundary. A schema rollback/data restore is a separate reviewed operation.

Legacy Node TIMESTAMP columns remain UTC wall time; driver decoding and projection writes use explicit UTC even with non-UTC process/database settings. No TIMESTAMPTZ conversion is performed. Before a future conversion inspect the historical producer/timezone evidence, compare samples in a restored copy, record the chosen interpretation and only then use an explicit `AT TIME ZONE` conversion. New queues, sessions and review audit timestamps use timestamptz.

## Disposable PostgreSQL restore drill

Use only the test Compose database. The drill script refuses any other container/database. `bash scripts/restore-drill.sh` takes a custom-format dump, restores a new disposable database, compares table counts and prints elapsed recovery time and the snapshot point. It never deletes the source database. This checks application recovery mechanics; it does not inspect or establish hosted-provider backup policy.

Proposed initial objectives for owner approval: RPO 24 hours, RTO 4 hours. These are planning targets, not verified production guarantees. Confirm the existing provider's backup retention, encryption, ownership, restore permissions and actual objectives before release. Hosted controls were not inspected and must not be described as absent.

Supply-chain bootstrap auto-migration also uses a PostgreSQL advisory lock around EF migration execution to serialize isolated concurrent starters. Its separate schema lock does not replace coordinating the two schema owners. Production uses a single explicit migration job.
