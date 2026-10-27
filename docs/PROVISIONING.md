# Explicit workspace provisioning and safe legacy recovery

Operations owner: the administrator responsible for the existing IMSOP backend release and database. Product/data owner must approve a manifest associating legacy records, provider aliases and users with workspaces. There is no automatic public-signup access, email-domain inference or guessed row ownership.

1. Take a provider-native backup and record its recovery point. Rehearse restoring a disposable copy using [recovery](RECOVERY.md).
2. Run the read-only preflight with a migration/admin connection: `NODE_ENV=test DATABASE_URL=<reviewed database> pnpm -C server exec tsx system/preflight.ts`. It emits counts only. Review unassigned records, ambiguous provider/tracking groups and unprovisioned accounts.
3. Prepare an operator-reviewed mapping file outside version control with source evidence. Create UUID workspaces and, if supported by evidence, a separate `dotnet_organization_id` association to an existing .NET organization. Do not copy identifiers from an API request.
4. In one transaction insert `workspace_memberships(user_id,workspace_id)` and set each approved user's `active_workspace_id`. A user has one active workspace per login. Multiple memberships require explicit operator selection; there is no workspace switch UI in this release. Role changes remain controlled server operations.
5. Assign only the explicitly reviewed shipment/order/telemetry/event row IDs. Resolve each legacy shipment's provider and related event history before assigning; never split/merge ambiguous histories automatically. The new composite identity can detect collisions. Unresolved rows remain inaccessible. Do not set a historical promise from a current ETA.
6. Insert a `logistics_connectors` binding for each independently scoped signing-key alias. Configure the matching HMAC secret in the existing deployment secret mechanism. Provider alias and workspace are server controlled.
7. Verify two users from separate workspaces, an unprovisioned registration, role permissions, guessed IDs, reports, events and .NET organization mapping in a restored isolated copy. Require users to log in again after provisioning; the workspace/version trigger invalidates old sessions.

This repository deliberately does not include an executable blanket ownership backfill. None was applied to production. Legitimate internal accounts are preserved in place; their access resumes through explicit membership and a reviewed mapping. Never relax scope merely to restore an ambiguous historical view.
