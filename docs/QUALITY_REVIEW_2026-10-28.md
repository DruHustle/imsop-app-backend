# IMSOP quality review — 28 October 2026

The user authorized review across the existing feature set, gap closure, main-branch updates and deployment. The review began at backend `22a956100fed2441a31ded1c18aff131b2b86475` and frontend `861aa781f86c98a4aaa70deddc2ac6375124b8a4`. Existing repository histories, infrastructure, IMSOP colors and themes are retained. No legacy ownership or memberships are inferred.

## Findings and fixes

| Area | Finding | Change |
|---|---|---|
| Operational orders | Search/date/status filters were local only; refining could not recover a selection above 10,000 rows | Forward filters before bounded reads; search source customer IDs as well as references; expose date controls and correct export scope |
| Read validation | Impossible calendar dates normalized silently; reversed ranges were accepted; report filter errors returned 500 | Reject invalid dates/ranges and return 400 consistently |
| Assistant | A fresh exact lookup returning no rows could retain a cached record; unavailable snapshots could be presented as ready/empty | Build exact answers from fresh authorized rows; preserve unavailable states; exact identifier reads match case consistently |
| Purchasing | Only 50 purchase orders and 100 catalog options were reachable | Purchase pagination and complete bounded catalog loading with duplicate/change detection; legacy array contracts preserved |
| Review permissions | Direct review reads accepted standard users despite the product's review role policy | Require admin/engineer/analyst for review queue/history; standard users retain permitted in-app notifications |
| Review state | Direct API calls could acknowledge resolved cases or reopen already-open cases | Validate transitions while holding the row lock and checking the optimistic version |
| Review history | Late responses could display another case's history | Cancel obsolete requests, clear history immediately, and apply only the current response |
| Review queue | Older cases could disappear behind the first 100 updated cases | State filtering and page controls |
| Forecast evidence | UI exposed only the latest run and first 100 predictions | Select from the recent five retained run summaries and page all predictions in the chosen run |
| Browser storage | A failed write could fall back to an older persisted identity; a corrupt demo session could reject bootstrap | Consistent memory fallback after a storage failure, validated demo identities and guarded bootstrap |
| Multiple tabs | Another tab could retain a previous account's workspace after sign-out/account replacement | Origin-scoped storage/channel notification clears the other tab's rendered identity and data |
| Response caching | Direct API and service responses did not consistently prohibit caching | Private, no-store across Node and .NET boundaries |
| Startup configuration | Node accepted origins containing paths/userinfo and recovery URLs outside the allowed frontend | Match strict origin rules and require the allowed recovery origin/route |
| Production dependencies | Fresh Node audit found five advisories, including high severity body-parser | Patched Nodemailer, body-parser and qs; frozen lockfile updated; regression for compressed trailing bytes; low-threshold Node and transitive NuGet audit gates |
| Release pipeline | Images could publish without real-stack qualification; deploy could silently skip missing credentials; no first-party backend revision route/frontend build identity | Gate images on actual PostgreSQL/gateway qualification; emit release.json; proxy /version; verify exact revisions, readiness, capabilities and anonymous rejection before/after Vercel publishing |

## Feature coverage and evidence

Authentication/recovery/session revocation, workspace scoping, shipment ingestion/projection and chronology, dashboards/analytics, order reads/exports, exact Assistant retrieval, purchase outbox and receiving, notifications, forecast adapter contracts, provisioning safeguards, themes/navigation and release/restore paths were examined against their current implementation.

The pull requests retain the exact final source, CI checks and reviewable diffs:

- [Backend #6](https://github.com/DruHustle/imsop-app-backend/pull/6)
- [Frontend #11](https://github.com/DruHustle/imsop-app-frontend/pull/11)

Local checks cover frontend types, 43 unit/component tests plus six deployment checks, production build and a zero-advisory production audit; Node unit/build and the patched production audit also pass. Real PostgreSQL/.NET/browser qualification runs in GitHub because the local execution environment cannot launch its required native processes. A local browser-launch failure is not counted as a feature test pass.

The first backend real-stack run passed the new order/review/purchasing regressions, existing session/projection/migration/forecast/mail/outbox checks, mutation sensitivity, actual Production-mode startup and a 23-table backup/restore rehearsal. The first frontend candidate passed all 116 desktop/mobile browser checks. Subsequent dependency and source changes must pass again before main release. Current final outcomes are recorded by the linked PR checks and main workflow runs rather than inferred from historical evidence.

## Production state and remaining prerequisites

Initial read-only probes found frontend `/` 200, first-party `/health` and `/ready` 200, and anonymous operational and purchase reads rejected with 401. The Oracle `/version` returned JSON 404 and frontend `/version` fell through to HTML. Those observations establish availability and anonymous rejection, not installation of current main.

The required runtime is still the existing ARM64 Oracle Software Engineering Backend VM. No authenticated deployment connection is present in this session. Build and publish qualified images, then use the existing operator-owned manifest, configuration/secrets and forward-migration procedure in [Oracle deployment](../deploy/oracle/README.md). Never copy test configuration to production. Verify the installed image/revision and preserve a compatible rollback image before publishing the paired frontend. The new production gate deliberately rejects the currently unversioned runtime.

Legacy records remain unassigned until verified ownership and approved memberships exist. Optional forecast/mail/SAP/provider capabilities cannot be established from code or demo data: forecasting needs authorized configuration and actual observations; operational mail needs provider configuration and explicit opt-in; SAP remains an unimplemented integration, not a connected feature. Hosted backup policy and monitoring access remain unverified. This release does not fabricate provider accounts, production data, accuracy or completed external integrations.

Maintainer advisories: [body-parser](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828), [Nodemailer](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-8c8m-p3m8-cjg8), [qs](https://github.com/ljharb/qs/security/advisories/GHSA-6pq8-jhm2-2vcw).
