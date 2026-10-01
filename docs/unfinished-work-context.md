# TechStock Inventory — unfinished work handoff

Updated: 2026-10-01 for the requested GitHub checkpoint. **NOT FINISHED: Phase 12 acceptance and the full advanced-features expansion remain unfinished.**

GitHub repository: `Soozu/invetory-cybence-new`. Checkpoint branch: `codex/advanced-features-checkpoint`. This WIP checkpoint continues `d7a4832`, based on `main` commit `37eab53`, and includes Phase 7–11 continuation plus the unfinished Phase 12 implementation. The user explicitly requested committing/pushing this checkpoint with an unfinished status. Use the latest branch commit as the handoff revision. Main does not include the expansion.

## Project and rules

Continue the existing TechStock Inventory project at:

`C:\Users\kingp\Desktop\Codes\Inventory-Cybence\invetory-cybence-new`

The originating desktop path above is absent on the current machine. The active checkout is `G:\codes\Inventory-cybence`; verify paths and database state before using an older handoff.

Stack: React 18 / Vite 6 / JavaScript / JSX / Tailwind / Radix / Recharts / React Router; Express 5 / JavaScript ES modules / Prisma 6.19.3 / MySQL 8 / Zod / JWT / Vitest.

Preserve React → centralized API services → Express routes/controllers → business services → Prisma → MySQL. Do not rebuild, add TypeScript/TSX, POS, frontend mock business data, or inventory localStorage. Stock, permissions, references and history remain authoritative on the backend. Inventory writes must be transactional with movements and audit records. Keep warehouse scope and exact serialized units intact.

Work feature by feature. Inspect related code before editing, create incremental migrations, enforce backend permissions and warehouse access, provide loading/empty/error/retry UI, and add business-rule tests. Run backend tests, disposable MySQL integration tests, frontend build, diff check and API health after each completed feature. Do not use destructive tests or migration reset against the original database. Never publish secrets or synthetic UI fixture data.

## Completed and verified features

1. Warehouse access: multiple user assignments/default, central warehouse authorization, scoped queries and writes, next-request revocation, user assignment UI.
2. Physical stock counts: immutable starting snapshot, quantity and exact-serial reconciliation, approval corrections, stale-snapshot rejection, single approval.
3. Reservations: transactionally held quantity and serials, partial issue, release/cancel/expiry, availability and competing-write safeguards.
4. Barcode/QR: permission-aware lookup, stable backend product barcodes, keyboard/manual scan inputs, printable QR/Code 128 labels and scan integrations. Physical printer/scanner hardware remains untested.
5. Serial lifecycle: recorded events, exact new receipt links, warranty/custody metadata, permission and warehouse boundaries. Legacy units have migration-time history-start markers, not invented past events.
6. Purchase requests: catalog/free-text items, draft/submission/review, warehouse scope, stale-document guards, explicit conversion to one linked draft PO, notifications and audit.
7. RFQs and quotations: approved PR snapshots or standalone RFQs, invitations, submitted immutable offers, comparison, close, manual award without automatic ordering, and explicit conversion to one exact linked draft PO. Dedicated permission, scope, stale-document and concurrency tests and isolated browser verification pass.

8. Supplier returns / RTV: receipt-linked drafts, exact serial selection, submitted holds, approval, explicit physical shipment, supplier acknowledgement, retained cancellation, permissions/scope/stale/concurrency safeguards and isolated browser verification.
9. Defective/quarantine inventory: classified warehouse balances, exact serials, inspection reasons, immutable before/after history, stale/concurrency protection, reservation/return integration, safe legacy backfill and isolated browser acceptance.
10. Transfer discrepancies: ledger-backed partial/mixed arrival, exact missing/damaged/unexpected cases, audited investigation and partial resolution, physical recovery/source quarantine, loss accounting, warehouse/permission/version/concurrency safeguards and isolated browser acceptance.
11. Reorder suggestions and supplier performance: real scoped available/incoming/planned balances, threshold targets, stale snapshots and competing explicit PR/draft-PO creation; actual PO cohort receipt/return metrics with dates, denominators and source links. No new migration or automatic ordering.

See `docs/advanced-features.md` for contracts, migrations and verification evidence.

## Phase 7: RFQs and quotations — completed and verified

Written:

- Prisma RFQ, requested-item, supplier-invitation, quotation and quotation-item models and relationships.
- Migration `20261002_rfqs`; no destructive changes to existing stock/order tables.
- `rfqs.VIEW/CREATE/EDIT/ISSUE/CLOSE/AWARD/CONVERT` permissions. PO conversion also requires `purchasing.CREATE`.
- RFQ draft → issued → closed → manual award, plus retained cancellation; approved PR snapshot or standalone items.
- One quote per supplier per RFQ round, exact requested-item identity/quantity, invited active suppliers, draft editing, explicit submission, closing/expiry guards.
- Server decimal totals, manual selection with reviewer/time/reason, and explicit awarded-quote conversion to a DRAFT PO in one transaction.
- Active RFQs block independent source-PR cancellation/direct PO conversion.
- Submission rechecks active invited suppliers. RFQ forms show specific validation messages and retain values after errors. PO detail displays two-decimal prices and backend line subtotals with tax/shipping/total breakdown.
- Frontend RFQ pages, quotation form/detail, side-by-side comparison, award dialog and PO conversion dialog; routes, sidebar and PR links.

Important files:

```text
backend/prisma/schema.prisma
backend/prisma/migrations/20261002_rfqs/migration.sql
backend/prisma/seed.js
backend/src/services/rfqService.js
backend/src/services/quotationService.js
backend/src/services/purchaseRequestService.js
backend/src/services/procurementService.js
backend/src/utils/currency.js
backend/src/validators/rfqs.js
backend/src/controllers/rfqController.js
backend/src/routes/rfqRoutes.js
src/services/rfqService.js
src/pages/procurement/RFQPages.jsx
src/pages/procurement/QuotationPages.jsx
src/pages/procurement/QuotationComparison.jsx
src/pages/procurement/PurchaseRequestPages.jsx
src/App.jsx
src/lib/permissions.js
src/layouts/DashboardLayout.jsx
```

## Phase 8: supplier returns — completed and verified

Implementation: backend/prisma/migrations/20261003_supplier_returns, supplierReturnService/controller/routes/validators, exact SupplierReturnSerial selections, existing inventory/serial scope integration, frontend centralized supplierReturnService and SupplierReturnPages, navigation and permissions. DRAFT/PENDING/APPROVED/SHIPPED/COMPLETED/CANCELLED are retained documents. Only explicit SHIP removes stock; submission holds units, cancellation restores prior serial conditions, completion records acknowledgement. All source identities and quantity caps come from the receipt. See advanced-features.md for the full contract and permissions.

## Phase 9: defective/quarantine inventory — completed and verified

Implemented in 20261004_stock_conditions: WarehouseStock quarantineQuantity/defectiveQuantity/forRepairQuantity/returnPendingQuantity, StockConditionChange and exact serial selections, QUARANTINE serial status, zero-quantity CONDITION_CHANGED movements, scoped API/controller/business service and shared balance helper. Frontend StockConditionPage, centralized API service/navigation and return source-condition controls use real backend data. See advanced-features.md Phase 9 for contracts and verification.

reservedQuantity remains the aggregate unavailable balance. The four condition fields are subsets; available = quantity − reservedQuantity; other holds are the remaining reservations/unclassified legacy units. Do not reset/rederive aggregate balances from incomplete serial history. Changes preserve physical quantity and require expectedUpdatedAt, exact eligible serials for serialized products and inspection reason. Assets/maintenance and actual reservations/return-pending holds retain their owning workflow. Condition timestamps strictly advance, including held-to-held updates, to invalidate count snapshots. The database CHECK guards totals and nonnegative fields.

SupplierReturnItem.stockCondition selects the nonserialized source bucket independently of observed condition. Submit reclassifies it into returnPendingQuantity, adds aggregate holds only for AVAILABLE, cancel restores the source, and ship removes physical/pending/aggregate quantity once. Serialized returns derive previousStatus, including QUARANTINE. heldQuantity still means only the new aggregate hold. Preserve these rules in Phase 10.

## Phase 10: transfer discrepancies — completed and verified

Implemented in 20261005_transfer_discrepancies: TransferArrival, TransferDiscrepancy and TransferDiscrepancyResolution; StockTransfer arrivalClosedAt; item lostQuantity/returnedQuantity; serial selection outcomes; appended PARTIAL/DISCREPANCY/RESOLVED states and database accounting constraints. Backend transferReceiptService is shared by the new arrival workflow and legacy first-full-receipt endpoint. TransferDetail uses a centralized API service and real persisted records. See advanced-features.md Phase 10 for complete contracts.

Good arrivals add AVAILABLE stock. Damaged arrivals add QUARANTINE and one unavailable hold. Final arrival creates exact missing cases without stock. Unexpected observations never create inventory/serials. Investigation notes resolve zero units. Missing resolution supports physical recovery (default quarantine or inspected available), explicit loss (no second deduction) and physical source-quarantine return requiring both warehouses. Damage acknowledgement preserves holds; clearance stays in Stock Conditions. Partial case resolution is retained in an append-only actor/time ledger. Parent/case versions strictly advance; serialized arrival/recovery/loss rejects changed, asset/maintenance/reservation-owned identities. Preserve purchase receipt, supplier and warranty provenance.

## Phase 11: reorder suggestions and supplier performance — completed and verified

replenishmentService and dedicated validators/controllers/routes implement /api/replenishment/suggestions, /documents and /supplier-performance. JSX ReplenishmentPages uses its centralized API service. Warehouse selection is explicit; active SKUs with no balance are included. Available subtracts aggregate holds once; incoming is remaining APPROVED/ORDERED/PARTIAL PO quantity; planned is DRAFT/PENDING_APPROVAL PO quantity plus unconverted DRAFT/SUBMITTED/APPROVED PR quantity. Converted PR/RFQ pipelines count through their PO once. Reorder point falls back to minimum; target is max(maximum, trigger). Explicit draft creation rechecks a fingerprint of product/balance/active procurement in a serializable transaction, stores the calculation/reason and uses existing document creation/audit functions. No inventory or serial mutation and no approval/order placement. Cancelled procurement releases planned coverage; these fingerprints prevent competing creation against a current need, not permanent idempotency after cancellation.

Performance selects real PO orderDate cohorts with receipts and SHIPPED/COMPLETED returns through the UTC window end. Draft/pending POs are excluded; cancelled orders with actual receipts are included. Completion is derived from exact receipt quantities. On-time uses fully received orders with promised dates, with the entire promised UTC calendar day inclusive. First receipt days and return rate expose sample/quantity denominators; absent samples return null. Returns count physical shipment once, exclude later/pending/cancelled records, and never imply all returns are defects. Existing orderDate is not an actual supplier dispatch timestamp. Reorder and performance require all their source-module VIEW permissions plus warehouse access; creation adds the existing PR or PO CREATE permission. Preserve these contracts; see advanced-features.md Phase 11.

### Immediate next work: finish Phase 12 acceptance — asset custody, preventive maintenance and warranty claims

The Phase 12 schema, migration, backend services/routes/validators/permissions, centralized frontend API and JSX workflow pages are implemented. Custody now retains issue/return evidence and actors, explicit handover, quarantine and inspection. Preventive plans schedule one exact occurrence, record actual service cost and advance their due date on completion. Warranty claims retain exact serial/receipt/supplier/warehouse provenance, decisions and optional completed service/shipped-return evidence. Claim decisions never release quarantine, change stock/custody, create replacement units or orders. Version guards and transactional history cover competing writes. See the Phase 12 contract in advanced-features.md.

**Pending before declaring Phase 12 complete:** finish isolated browser submission, supplier acceptance/rejection and resolution/cancellation with linked evidence; verify reload persistence of those decisions and unchanged physical stock/custody; finish desktop/mobile layout and console/network error checks; repeat actual retained PR/RFQ/new asset/maintenance/plan/claim detail reads; record final acceptance evidence and update both documents. Backend test coverage alone is not full browser acceptance. Do not move on to attachments/imports until this acceptance is finished.

Current isolated browser checkpoint: AST-000185 (id cmuomdnh90007v150u9dc96rz), serial ISOLATED-TRF-muoi5wla-1, Dasma Warehouse. Registration consumed exactly one available warehouse unit. Custodian A → B handover and B's quarantined return retain separate issue/return notes. Competing stale handover returned 409; typed values survived explicit reload after the UI fix. A quarterly preventive occurrence was scheduled, started and completed with QUARANTINE inspection and actual cost 123.45; next due advanced exactly 90 days from completion. Asset remains quarantined and unassigned. WC-000001 (id cmuomou9q0001v17s6zl6q537) is **DRAFT**, linked to that asset, receipt RCV-2026-00344/source PO and TechSource Distribution. Do not describe this claim as submitted, accepted or resolved. All synthetic acceptance data remains only in the isolated UI schema.

Use fresh disposable schemas for mutations/concurrency tests. Keep original and snapshots intact. Run backend tests, disposable integration suite, frontend build, diff check, actual health/detail endpoint checks and isolated browser acceptance before declaring each feature complete. The persistent UI schema has no migration ledger: apply only inspected pending feature SQL, never replay the whole chain.

## Remaining expansion in required order

- Asset custody improvements, preventive maintenance scheduling, warranty claims.
- File/document attachments; CSV/Excel preview, validation, explicit confirmation, import result and rejected-row report.
- Additional reports and saved filters, detailed safe audit diffs, notification preferences, dashboard customization and permission-aware backend global search.
- Refresh-token session administration, login failures/temporary lockout, backup visibility and carefully confirmed restore, retention/archival, storage abstraction, background jobs, production monitoring and protected API documentation.
- Cross-module/security/concurrency tests and deployment guidance for environment, migrations, HTTPS/reverse proxy, process management, uploads, logs and backups.

Existing maintenance/custody/reporting/refresh-token support is not completion of these new features. Existing simple reservation expiry worker and local safety snapshot are not full background-job or backup administration.

## Verification and local database state

Latest checks on 2026-10-01 at the unfinished Phase 12 checkpoint:

- Final disposable MySQL integration: **168 passed / 18 files**, including 22 dedicated asset workflow tests. Coverage includes custody/history, stale/concurrent handover/return, quarantine inspection, parallel/legacy repairs, actual cost, one preventive occurrence and exact due advancement, plan edits, warranty provenance/coverage/source scope, one active claim, competing decisions, exact service/RTV evidence, permissions and next-request warehouse revocation. Frontend production build passes. Earlier migrations and dependencies remain unchanged.
- Migration **20261006_asset_workflows is already applied locally** to original techstock_inventory: eleven successful migrations, ten preceding ledger entries/checksums retained, every pre-existing business row unchanged. Only the pending Phase 12 SQL was applied to the ledger-free persistent UI schema; no migration ledger was created there. Do not replay the migration helpers or full chain against this UI schema. Original post-migration fingerprints and every retained safety-snapshot fingerprint still match at checkpoint; original remains 16 products / 5 POs / 0 PRs / 0 RFQs / 19 movements / 170 serials / 5 assets / 1 maintenance record, with no synthetic claims or plans.
- Original API 5000 and isolated API 5050 were restarted with the Phase 12 backend; health and authenticated asset/maintenance/plan/claim/PR/RFQ reads passed. Isolated Vite preview is 5176. Check actual owned process command lines before stopping/restarting. Original read verification used memory-signed requests without inserting login fixtures.
- Partial isolated browser acceptance is recorded above. Runtime evidence, scripts and credentials stay ignored: backend/.test-runtime/assets-integration.log, assets-build.log, assets-migration-ui.json, assets-checkpoint.json, assets-before-claim-ui.json and browser/preventive-plan.png / asset-warranty-checkpoint.png. Browser tab 11 retains the DRAFT claim for continuation. Original techstock_inventory and techstock_backup_rfq_muo0gr46 are intact. This is a requested WIP source checkpoint, not a production deployment or completed expansion.

Earlier checks on 2026-10-01 after reorder suggestions and supplier performance:

- Backend npm test: 27 pass / 119 live skipped at the initial 146-test run. Final disposable integration: 147 pass / 17 files, including 12 dedicated replenishment tests (one validation and 11 live). Frontend build passes (2,487 modules), diff check passes. Mixed PR/PO competition creates one draft, as does competing PO creation. Coverage includes conditions/unknown holds, no balance, remaining partial POs, foreign warehouse exclusions, converted PR deduplication, exact money, cancellation, stale stock/catalog/pricing, inactive suppliers/warehouses, module permissions, next-request revocation and cohort/receipt/return date boundaries/denominators.
- Phase 11 changes no schema, migration, seed grant or lockfile. Original ledger remains ten applied migrations through 20261005_transfer_discrepancies; persistent UI still has no ledger. Fingerprints of every original table (including the migration ledger) and every retained snapshot table match before/after acceptance. Original remains 16 products / 5 POs / 0 PRs / 0 RFQs / 19 movements / 170 serials, with no new condition/arrival/discrepancy records.
- Isolated browser created PR-2026-00002 (id cmuok32r0000bv10kjhxzyxe3): 80 GPU-ASUS-4060TI-O8G at estimated 28450.00, draft only. A competing form returned 409, retained its reason, and explicit reload showed planned 80 / suggested 0 / disabled creation. PO-2026-00486 (id cmuok4my0000jv10kea7ptvcd) is DRAFT, 99 CCTV-HIK-2143G2 at 5750.00, total 569250.00, Bacoor/SecureVision. PO reload and fresh-navigation PR/source links persist. UI totals: 16 products / 10 POs / 2 PRs / 1 RFQ / 2 offers / 2 returns / 44 movements / 177 serials / 5 conditions / 2 arrivals / 4 discrepancies. Stock history remains unchanged by both drafts; preceding fixtures remain intact.
- Both APIs restarted with final backend code; health, PR/RFQ lists, new reorder/performance reads and actual isolated old/new PR/RFQ/PO details return 200. Browser warehouse filtering, historical window changes/empty state, persisted coverage, default-width, 1,280-pixel desktop and 390-pixel mobile pages pass with contained table scrolling. Warehouse status-label and date-input event handling issues found in browser acceptance were fixed. Temporary lost/stale preview tabs were recovered in the same browser. Repeated hard reloads reached the existing shared login/refresh limiter (10 requests / 15 minutes); the final normal restart recovered the local preview, with no limiter or security change. Account/session limiter design remains future administration work. Viewport override reset.
- Ignored evidence: backend/.test-runtime/reorder-original-before.json, reorder-final-ui.json, reorder-integration.log, reorder-unit.log, reorder-build.log and browser/reorder-mobile.png, supplier-performance-mobile.png, supplier-performance-desktop.png. Guarded .reorder-final-ui.mjs is read-only and local only. Final review browser tab is 10. No commit/push or deployment was requested.

Earlier checks on 2026-10-01 after transfer discrepancies:

- Backend npm test: 26 pass / 109 live skipped. Disposable integration: 135 pass / 16 files, including 19 transfer discrepancy tests plus all prior RFQ/returns/conditions coverage. Prisma validate/generate, deployed schema comparison (empty diff), frontend build (2,485 modules) and diff check pass.
- Original ledger now has ten successful migrations through 20261005_transfer_discrepancies, preserving every earlier checksum. Fresh-client fingerprints prove all pre-existing original/UI business rows unchanged immediately after migration; original and snapshot also match after browser acceptance. An old client's cached raw-query column metadata produced a false mismatch after DDL; independent clients resolved it. Migration is applied; do not replay local migration scripts. Original counts stay 16 products / 5 POs / 0 PRs / 0 RFQs / 0 returns / 0 conditions / 0 arrivals / 0 discrepancies / 19 movements / 170 serials.
- Isolated acceptance PO-2026-00485 backs TRF-2026-00153 (id cmuoi5wm60014v1j0bem49z4p), Bacoor Branch → Dasma Warehouse. Browser performed submit/approve/exact shipment, wrong-serial error retaining inputs, partial TRC-2026-00001 and final TRC-2026-00002, unexpected/damaged/missing cases, competing investigation stale rejection/reload, quarantine acknowledgement, unexpected physical return, exact late recovery, partial plain recovery, loss and source-quarantine return. Final RESOLVED: cameras 3 received; mice 2 received / 1 lost / 1 returned; zero outstanding, four closed cases and eight investigation/resolution entries. Receipt/supplier/warranty relationships remain intact; unknown observation created no serial.
- UI counts now 16 products / 9 POs / 1 PR / 1 RFQ / 2 offers / 2 returns / 44 movements / 177 serials / 5 conditions / 2 arrivals / 4 discrepancies. Source cameras remain 2 physical / 1 repair hold; source mice 3 physical / 3 quarantined; destination cameras 3 physical / 2 quarantined / 1 available, mice 2 available. Retain previous acceptance records.
- Both APIs restarted with final code. Health, authenticated PR/RFQ/transfer lists and original/new transfer detail reads return 200. Isolated PR/RFQ details remain readable. Browser reload/fresh-tab persistence, list/detail navigation, desktop and 390-pixel mobile with no page overflow/errors pass; viewport reset. Navigation stalls in earlier preview tabs were recovered; final resolved detail is retained in browser tab 7.
- New ignored evidence: backend/.test-runtime/transfers-integration.log, transfers-unit.log, transfers-original-before.json, transfers-migration-evidence.json, transfers-ui-fixture.json, transfers-final-ui.json and browser/transfer-stale.png, transfer-resolved-desktop.png, transfer-resolved-mobile.png. Guarded .transfers-*-ui.mjs helpers are local only. UI still has no migration ledger. Do not rerun the fixture/migration helpers on populated state.

Earlier checks on 2026-09-30 after stock conditions:

- Backend npm test: 26 pass / 90 live skipped. Disposable integration: 116 pass / 15 files, including 19 condition, 15 RFQ and 17 supplier-return tests. The runner creates/migrates/removes its own schema, tests backfill with pre-Phase-9 fixtures and bounds test pools to five connections. Frontend build passes (2,483 modules), Prisma validate/generate pass, diff check passes; earlier migration files and lockfiles are retained.
- Original techstock_inventory: nine successful applied migrations through 20261004_stock_conditions, earlier checksums verified. Fresh-client fingerprints of all pre-existing business columns match before/after migration and UI acceptance. Counts remain 16 products / 5 POs / 0 PRs / 0 RFQs / 0 supplier returns / 0 condition changes / 19 movements / 170 serials. No original fixtures, stock mutations or login/session records were inserted. Migration preflight checked legacy hold consistency; classified backfill preserves physical/aggregate quantities and timestamps.
- Retained snapshot: techstock_backup_rfq_muo0gr46, recorded in ignored backend/.warehouse-test-state.json; 16 original products verified. Older munmaea8 schema names belong to the originating machine and were not present here; none were recreated or removed. Snapshot tables retain data/indexes via CREATE TABLE LIKE, not foreign keys; this is not a supported restore system.
- Persistent UI schema techstock_test_warehouse_muo0gr46 retains original copies plus prior RFQ acceptance (one PR, one RFQ, two offers, converted draft PO). The pending returns SQL and later condition SQL were applied individually, retaining their foreign keys/constraints and no migration ledger. Phase 9 used Prisma db execute for the complete pending SQL. The local raw-SQL runner split a semicolon inside a comment after DDL; missing permission statements were inspected/applied separately without replaying tables. Do not rerun the local migration or fixture scripts on the now-populated schema.
- UI now additionally contains received PO-2026-00483, receipt RCV-2026-00342, and completed RTV-2026-00001: two exact camera serials and two mice were received and physically returned. Drafts/approval did not remove stock; submission held units; shipment restored the fixture products' total/unavailable balances to their prior values; completion made no stock movement. Exact returned serials retain receipt links and no warehouse. Phase 8 UI counts were 16 products / 7 POs / 1 PR / 1 RFQ / 2 quotations / 1 supplier return / 25 movements / 172 serials. Keep these synthetic records isolated for review.
- UI additionally retains PO-2026-00484 → RCV-2026-00343 and CND-2026-00001…00005: two camera serials passed through quarantine/defect/repair; one exact unit cleared to AVAILABLE and one remains FOR_REPAIR. Two mice remain QUARANTINE. RTV-2026-00002 selected one quarantined mouse, held it in RETURN_PENDING with no double hold, then cancelled back to QUARANTINE. All classification/cancellation actions preserved physical quantities of two per fixture product. Final UI counts: 16 products / 8 POs / 1 PR / 1 RFQ / 2 quotations / 2 returns / 34 movements / 174 serials / 5 condition changes.
- Prior RFQ chain remains PR-2026-00001 → RFQ-2026-00001 → QTN-2026-00002 → PO-2026-00482, quantities 2/3 at 20.10, subtotal 100.50, tax 1.23, shipping 2.34, total 104.07. Award created no PO; separate conversion created one.
- Original and isolated APIs restarted. Health and authenticated PR/RFQ/return lists return 200; isolated real return/source detail reads return 200. Original verification used memory-signed tokens for read-only requests, with no login fixtures.
- Browser verified return draft creation/edit/reload, exact-serial error with preserved inputs, submit/hold, approve, explicit shipment, supplier outcome and final reload. Desktop and 390-pixel mobile detail checked; no page overflow or browser errors. Existing Router future warnings remain. Phase 9 balance/history, inspection/repair/clearance, two-form stale rejection with retained inputs, source-condition return persistence/cancellation and desktop/mobile checks also pass. A history tab render crash was fixed by clearing incompatible rows when switching tabs; repeated switches show no new browser errors. The isolated Stock Conditions page is open for review; viewport override reset.

### Running services and local evidence

- Original API http://localhost:5000/api and frontend http://localhost:5174.
- Isolated API http://127.0.0.1:5050/api and frontend http://127.0.0.1:5176, using VITE_API_URL=http://127.0.0.1:5050/api.
- Backend APIs are owned node server.js / node .rfq-launch-ui.mjs processes. Recheck actual port/process ownership before stopping or restarting. Prisma generation requires stopping these owned APIs first on Windows.
- Ignored .rfq-launch-ui.mjs selects the recorded test schema. Ignored .returns-*-ui.mjs and .conditions-*-ui.mjs scripts/credentials/fixtures are local only. Original data/snapshot must remain untouched. Local scripts have guards against reusing the fixture or migration state; do not run them blindly.
- Evidence: backend/.test-runtime/returns-integration.log, returns-unit.log, returns-original-before.json (row fingerprints only), returns-migration-evidence.json, returns-ui-fixture.json, returns-ui-draft/pending/approved/shipped/completed.json, and browser/supplier-return-completed.png / supplier-return-mobile.png. Phase 9 evidence: conditions-integration.log, conditions-unit.log, conditions-build.log, conditions-original-before.json, conditions-migration-evidence.json, conditions-health.json, conditions-ui-fixture/pending/final.json, browser/stock-conditions-desktop.png, stock-conditions-mobile.png, condition-stale.png, condition-clearance.png and condition-mobile-dialog.png. Prior RFQ evidence remains there too. Logs, environment, uploads, schema state, local scripts and synthetic credentials remain excluded from Git.

Phases 7–11 are complete for development acceptance. Phase 12 acceptance and the remaining expansion/deployment work are **NOT FINISHED**. This handoff accompanies the user-requested checkpoint on codex/advanced-features-checkpoint. Keep the original database, retained snapshot and isolated acceptance documents intact.
