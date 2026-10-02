# Original roadmap — phase status

**Repository split (2026-10-02):** The API now lives in the independent `inventory-cybence-backend` repository. Frontend source remains in `invetory-cybence-new`. Commands and paths below containing `backend/` describe the previous layout; run backend commands from the new backend root. Frontend client tests now live in frontend `tests/`. See [current repository setup](repository-separation.md).

Reviewed: 2026-10-01 (Asia/Manila), against the original advanced-features request, current source/models/routes and recorded verification. This review does not rerun the tests or provide new browser acceptance.

**Use these original phase numbers for future requests.** Previous progress messages used grouped checkpoints: checkpoint 11 combined original phases 11–12; checkpoint 12 combined 13–15; checkpoint 13 combined 16–17; checkpoint 14 combined 18–22; checkpoint 15 combined 23–29; checkpoint 16 covered expanded tests in original phase 30. The old checkpoint labels in feature documents and evidence filenames remain historical identifiers.

## All 31 phases

| Original phase | Feature | Current status |
|---|---|---|
| 1 | Warehouse access control | Implemented; scoped reads/writes and immediate grant revocation verified |
| 2 | Physical stock counting | Implemented; snapshot/reconciliation/approval/stale/concurrency checks verified |
| 3 | Inventory reservations | Implemented; hold/fulfillment/release/expiry/serial checks verified |
| 4 | Barcode and QR support | Implemented; lookup/labels/manual and keyboard input verified; physical scanner/printer hardware acceptance remains pending |
| 5 | Serial number lifecycle | Implemented; exact recorded history/provenance and authorization verified |
| 6 | Purchase requests | Implemented; approval and explicit source-linked PO conversion verified |
| 7 | RFQs and supplier quotations | Implemented; workflow, comparison, manual award/conversion and recorded browser acceptance verified |
| 8 | Supplier returns / RTV | Implemented; held/shipped quantities, serials, source links and recorded browser acceptance verified |
| 9 | Defective / quarantine stock | Implemented; classified balances, holds/history and recorded browser acceptance verified |
| 10 | Transfer discrepancies | Implemented; partial receipt/investigation/resolution and recorded browser acceptance verified |
| 11 | Reorder suggestions | Implemented; real scoped calculations and explicit competing document creation verified |
| 12 | Supplier performance | Implemented; PO cohorts, actual receipts/returns, denominators and unknown metrics verified |
| 13 | Asset custody improvements | Implemented; issue/handover/return/inspection history and recorded browser acceptance verified |
| 14 | Preventive maintenance | Implemented; exact scheduled occurrences, completion/cost and recorded browser acceptance verified |
| 15 | Warranty claims | Implemented; source evidence, decisions, stale/conflicting actions and recorded browser acceptance verified |
| 16 | Document attachments | Implemented for all twelve requested record types; backend/build checks pass; browser acceptance pending |
| 17 | CSV / Excel imports | Implemented as UTF-8 CSV for all five types, including transaction/preview/confirmation/rejected rows; browser acceptance pending. Export Excel worksheets to CSV |
| 18 | Reporting enhancements | Implemented; 23 scoped reports, owned configurations, exact money and one-page exports verified; browser acceptance pending |
| 19 | Detailed audit diff | Implemented; safe before/after fields and historical warehouse scope verified; browser acceptance pending |
| 20 | Notification preferences | Implemented; backend in-app preferences and delivery gates verified; browser acceptance pending |
| 21 | Dashboard customization | Implemented; backend account preferences for cards/charts/order/warehouse/date range; browser acceptance pending |
| 22 | Global search | Implemented; backend permission/scope-aware results and source links verified; browser acceptance pending |
| 23 | Session management | Implemented; self/admin sessions, lockout, rotation/revocation and real HTTP cookie behavior verified; browser acceptance pending |
| 24 | Backup management | Implemented; actual MySQL/file backups, manifests and confirmed offline new-schema restore verified in disposable environments; browser/hosting recovery acceptance pending |
| 25 | Data retention / archival | Implemented; revisioned policy, retained soft archival and credential cleanup verified; browser acceptance pending |
| 26 | File storage abstraction | Implemented local adapter and authenticated URLs; future S3/Cloudinary adapters remain future scope |
| 27 | Background jobs | Implemented; leased expiry/reminder/stock/report/session/archive/backup jobs verified; hosting operation acceptance deferred |
| 28 | Production monitoring | Implemented structured logs/request IDs/health/admin visibility; browser and actual production monitoring acceptance pending |
| 29 | API documentation | Implemented protected OpenAPI 3.1 for core contracts, with documented advanced-workflow limits; browser acceptance pending |
| 30 | Test coverage | Expanded automated checks passed: **334 tests / 31 files**, production frontend build and API reads passed. Coverage percentage is not measured |
| 31 | Deployment preparation | Phase 15 operations runbook/configuration foundations exist; further deployment work and target acceptance **deferred at the user's request** |

“Implemented” describes the code and recorded automated checks. Pending browser, hardware, hosting and dependency work keeps the complete expansion unfinished.

## What comes next

1. **Original Phase 16 attachment acceptance** is the earliest pending UI group: upload/download/archive/restore, rejected files, record selection, retry/input preservation, reload persistence, desktop/mobile/keyboard/console/screenshots. The saved browser permission must be changed through the actual setting before any retry; do not bypass it.
2. **Dependency maintenance can proceed while browser checks are blocked.** The [dependency review](dependency-review.md) records unresolved frontend/backend findings, including critical/high transitive packages. Make deliberate compatible updates and rerun integration/build checks.
3. After attachment acceptance, finish original Phase 17 imports, then Phase 18–22 reports/preferences/search and Phase 23–29 operational UI acceptance. The core implementations already exist; continue from them.
4. Keep Phase 31 deployment deferred until the user requests it again. No new phase after 31 is defined by the original roadmap.

Latest recorded verification: **334 integration passes, 92 unit passes / 242 live skips, 42 focused transport/log passes, 95 protected original API reads plus both health endpoints, 24 business tables unchanged and 579 retained snapshot fingerprints matching.** See [release verification](release-verification.md) for commands and limitations.

Implementation/context documents: [attachments and imports](attachments-and-imports.md), [reports and preferences](reports-and-preferences.md), [sessions and operations](sessions-and-operations.md), [unfinished work](unfinished-work-context.md). Local Phase 12–16 checkpoint updates remain uncommitted/unpushed on `a33a2fb`; no publication or deployment was performed during this status review.

Subsequent user instruction on 2026-10-01 authorizes a GitHub publication checkpoint of all current code, tests, migrations and documentation on `codex/advanced-features-checkpoint`. The pending acceptance/dependency work and deferred deployment above still apply. Check Git history for the published revision.
