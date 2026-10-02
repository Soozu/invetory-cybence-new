# Phase 16 — expanded release verification

**Repository split (2026-10-02):** The API now lives in the independent `inventory-cybence-backend` repository. Frontend source remains in `invetory-cybence-new`. Commands and paths below containing `backend/` describe the previous layout; run backend commands from the new backend root. Frontend client tests now live in frontend `tests/`. See [current repository setup](repository-separation.md).

Updated: 2026-10-01 (Asia/Manila).

**Automated development acceptance passed.** Deployment work is deferred at the user's request. Browser acceptance for Phases 13–15 remains pending because the saved local-preview permission has not been confirmed cleared. The full expansion remains unfinished until that backlog and dependency maintenance are resolved.

## Scope and changes

Phase 16 adds 68 regression checks to the existing 266: 42 transport/log checks, 25 live session/stock checks and one authenticated storage URL check. The existing React JSX → centralized API → Express → Prisma → MySQL architecture is retained. No dependency versions or database schema change in this phase.

The new checks reproduced nine failures before the transport fixes. Corrected behavior:

- Malformed JSON returns a sanitized 400 envelope; oversized JSON returns 413; unsupported encoding/charset returns 415. Body contents and parser internals are omitted from responses/logs.
- Disallowed CORS origins return 403 with no allow-origin header. Configured credentialed preflight and requests without an Origin retain their existing behavior.
- Authentication routes send `Cache-Control: private, no-store`, including validation failures, successful login, refresh and logout.
- The frontend preserves the session and original error during temporary refresh failures (offline, 429, 503). A rejected refresh with 401 clears the memory token and emits the existing session-expired event.
- Malformed successful JSON and incomplete successful refresh payloads surface an actionable transport error (client `ApiError` status 502).
- The storage adapter's private URL now resolves to the existing authenticated `/api/attachments/files/:id` route, verified through HTTP with both authorized and unauthorized users.

## Repeatable commands

From `backend`:

```bash
npm run test:transport
npm test -- --no-file-parallelism
npm run test:integration
```

`test:transport` runs the frontend API module in Node with mocked fetch, the actual Express boundary with a mocked database, and structured log checks. It supplies no browser screenshots or visual acceptance.

`npm test` runs unit checks and skips MySQL suites unless `TEST_DATABASE_URL` is set. Leave that variable unset for the unit command. Use the existing integration runner for MySQL: it creates a fresh `techstock_test_warehouse_...` schema, exercises upgrades from initial/legacy records, applies the full migration chain, runs suites sequentially and drops its own schema. Business actions and backup/restore drills use disposable schemas and ignored fixture directories. The development seed is not executed.

From the project root:

```bash
npm run build
git diff --check
```

## Coverage map

| Requirement | Durable test suites | Evidence covered |
|---|---|---|
| Warehouse grants and immediate revocation | `warehouseAccess.integration`, `releaseRegression.integration`, `reporting.integration` | Assigned/unassigned/admin reads, unauthorized writes, current grants for retained access tokens and exports/search |
| Stock count approval | `stockCounts.integration` | Snapshots, positive/negative corrections, exact serial discrepancies, stale balances and duplicate approval |
| Reservation rules | `reservations.integration`, `releaseRegression.integration` | Available stock, over-reservation, partial fulfillment, release/expiry, exact serial holds, rollback when a later item fails |
| Procurement | `purchaseRequests.integration`, `rfqs.integration`, `supplierReturns.integration`, `replenishment.integration` | Review/conversion states, exact provenance, quote comparison, physical return shipment and competing creation |
| Transfers and conditions | `transferDiscrepancies.integration`, `stockConditions.integration`, `warehouseAccess.integration` | Partial arrivals, missing/damaged/exact units, scope, double receive and held balances |
| Asset lifecycle | `assetWorkflows.integration`, `serialLifecycle.integration` | Custody, inspections, preventive occurrences, source-linked claims and retained serial history |
| Attachment/import boundaries | `attachments.integration`, `imports.integration`, `attachmentFiles`, `importCsv` | MIME/size/content guards, parent/module/warehouse authorization, retries, stale previews, atomic writes, CSV safety and retained archived bytes |
| Reports/preferences/audit/search | `reporting.integration`, `reporting`, `jobs.integration` | Exact monetary strings, source permissions, owned versioned configurations, preferences, safe audit fields, scope and snapshot revocation |
| Token and session rejection | `sessions.integration`, `releaseRegression.integration` | Expired/not-yet-valid/wrong-signature/wrong-algorithm/malformed/wrong-purpose tokens, unavailable/revoked/expired/foreign sessions, changed versions, inactive users and lockout recovery |
| HTTP authentication cookies | `releaseRegression.integration` | Real HttpOnly/Lax/path/remember behavior, rotation within one session, clear-cookie logout and immediate access rejection |
| Last-unit concurrency | `releaseRegression.integration`, existing workflow suites | One winner for two removals of five units, competing reservation/removal, one exact serialized removal; matching movement/audit/adjustment and no negative balances |
| Client transport | `frontendApi` | Query values, memory token, credentials, JSON field errors, multipart retry, shared refresh, bounded retry, temporary failures, malformed responses, binary downloads and abort timeout |
| HTTP/log contracts | `httpContracts`, `requestLogging` | Minimal readiness/outage, CORS, parser limits, protected routes, headers, generated request IDs and omitted credentials/body/query/exception details |
| Operations/recovery/jobs | `operations.integration`, `jobs.integration` | Actual MySQL dump/new-schema restore, manifest tamper, queue/state guards, soft retention, storage boundaries, leases and scoped scheduled reports |

These assertions cover the listed scenarios. Coverage percentages and physical hardware acceptance have not been measured.

## Final results

| Check | Result |
|---|---|
| Full disposable MySQL run | **334 passed / 31 files** |
| Unit run without MySQL fixtures | **92 passed / 242 skipped**, 17 passed files / 14 skipped files |
| Focused transport/log run | **42 passed / 3 files** |
| Production frontend build | Passed, 2504 modules |
| Original authenticated API reads | **95 passed**, including report/export and current operations endpoints |
| Public API health | Both original 5000 and isolated 5050 passed |
| Business data preservation | **24 table fingerprints unchanged** across original and persistent UI schemas |
| Retained snapshots | **579 fingerprints match** across ten Phase 13–15 snapshot schemas |
| Dependency audit | Reviewed; unresolved advisories recorded in [dependency review](dependency-review.md) |

Ignored local evidence: `backend/.test-runtime/phase16-final-integration.log`, `phase16-final-unit.log`, `phase16-transport-final.log`, `phase16-build.log`, `phase16-final-reads.json`, `phase16-preservation.json`, and audit JSON files. Evidence files and fixture bytes are excluded from Git.

Original data still contains 16 products, five POs, one existing attachment and zero synthetic claims, preventive plans or import batches. Original migration ledger remains 16 successful migrations; no Phase 16 migration was applied. The persistent UI schema still has no ledger and must not receive a replay of the full chain. Verification uses an existing active original administrator session in memory; no verification user/session is inserted there. Normal workers and session activity may update operational metadata separately from the checked business tables.

The final API code runs locally on 5000 and isolated 5050. The isolated preview is available on 5176 and the existing preview remains on 5173. Last observed ownership: original API PID 33136 / session 55876, isolated API PID 27180 / session 53786, isolated Vite PID 40692 / session 96036. Recheck ownership before restarting. HEAD remains `a33a2fb`; Phase 12–16 WIP is retained without a new commit/push.

## Remaining acceptance

1. Clear the saved browser permission through the actual setting, then complete the [Phase 13](attachments-and-imports.md), [Phase 14](reports-and-preferences.md) and [Phase 15](sessions-and-operations.md) desktop/mobile, keyboard, error/retry, reload persistence, console and screenshot checks. Do not bypass the block using another surface.
2. Complete dependency maintenance with compatible version changes and fresh integration/build verification. The current audit has unresolved findings, including critical/high transitive packages; passing business tests alone does not clear those findings.
3. Resume deployment preparation/acceptance only when the user requests it. HTTPS/proxy/production-cookie behavior, hosting durability, offsite copies and recovery acceptance remain deferred. The Phase 15 [operations runbook](deployment-operations.md) is retained.

No hosting target, deployment, real database restore or production cutover was performed.
