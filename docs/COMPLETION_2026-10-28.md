# Integration support and deployment follow-up

The owner selected Oracle/Vercel as the only deployment target and explicitly withheld production provisioning and forecast/Service Bus/SAP activation. No names, memberships, provider targets or ownership mappings are inferred. The [review template](provisioning-review.template.json) remains non-executable; [activation requirements](OPTIONAL_INTEGRATIONS.md) remain separate from implementation qualification.

This change adds explicit forecast/SAP enable flags, server-only credential-file references, startup configuration checks, scoped SAP OData metadata receipts, validated Service Bus activation and truthful organization-scoped outbox status. Saved orders and queues are preserved when dispatch is disabled or unavailable. SAP support inspects service metadata; business synchronization and ownership mappings are not claimed.

Local validation: 22 Node tests and TypeScript build; 11 .NET 8 tests; production Node dependency audit with no known advisories. Tests cover disabled defaults, invalid activation, ambiguous/missing credentials, actual HTTP metadata transport to an isolated provider, bounded/unreadable responses and production rejection of development transport doubles. Existing real PostgreSQL/gateway, migration, recovery and paired browser qualification remain release gates. Their final CI result, not a local working-tree image, qualifies publication.

The approved production runtime hardening uses separate Node/public and .NET/supply-chain service roles, leaving the schema owner in protected operator configuration for migrations. An outbound-blocked restore rehearsal passed 28 authenticated workflow requests, denied DDL/provisioning/migration writes/deletion/cross-schema data, and verified the retained scoped rollback image. This operational configuration change does not assign production records or memberships. Optional integrations and operational mail remain disabled.

The existing Gmail account passed TLS/SMTP authentication without sending a message. No inbox delivery or external order/forecast/SAP connection is claimed. Existing provider subscriptions and infrastructure are retained.
