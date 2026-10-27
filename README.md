# IMSOP backend

Node API, .NET 8 gateway, OperationsService and SupplyChainService. PostgreSQL is the existing durable store. The repositories and Node/.NET entity identities remain independent.

Start with the [current capability and architecture inventory](docs/CURRENT_PLATFORM.md), [API](docs/API.md), [workspace provisioning](docs/PROVISIONING.md), [recovery](docs/RECOVERY.md), [deployment](docs/DEPLOYMENT.md), [Oracle ARM64 runbook](deploy/oracle/README.md), and [remediation review/results](docs/remediation/RESULTS.md). Historical platform designs and Kubernetes examples are explicitly unqualified.

The remediation branch adds scoped revocable sessions, atomic recovery with durable encrypted delivery, deterministic shipment projection, bounded reads/reports, durable exception review and a transactional purchase-order outbox. Production rollout and ambiguous ownership backfill are not performed automatically.
