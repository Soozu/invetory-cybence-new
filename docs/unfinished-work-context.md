# TechStock Inventory — unfinished work handoff

Checkpoint date: 2026-09-30. This is a development checkpoint. The full advanced-features expansion is unfinished.

GitHub repository: `Soozu/invetory-cybence-new`. Checkpoint branch: `codex/advanced-features-checkpoint`. Based on `main` commit `37eab53`. Continue from the checkpoint branch; main does not include these updates yet.

## Project and rules

Continue the existing TechStock Inventory project at:

`C:\Users\kingp\Desktop\Codes\Inventory-Cybence\invetory-cybence-new`

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

See `docs/advanced-features.md` for contracts, migrations and verification evidence.

## Phase 7: RFQs and quotations — code exists, feature unfinished

Written:

- Prisma RFQ, requested-item, supplier-invitation, quotation and quotation-item models and relationships.
- Migration `20261002_rfqs`; no destructive changes to existing stock/order tables.
- `rfqs.VIEW/CREATE/EDIT/ISSUE/CLOSE/AWARD/CONVERT` permissions. PO conversion also requires `purchasing.CREATE`.
- RFQ draft → issued → closed → manual award, plus retained cancellation; approved PR snapshot or standalone items.
- One quote per supplier per RFQ round, exact requested-item identity/quantity, invited active suppliers, draft editing, explicit submission, closing/expiry guards.
- Server decimal totals, manual selection with reviewer/time/reason, and explicit awarded-quote conversion to a DRAFT PO in one transaction.
- Active RFQs block independent source-PR cancellation/direct PO conversion.
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

### Immediate next work

1. Add dedicated RFQ/quotation integration tests in `backend/tests/` before claiming completion. Cover approved-PR snapshots, invalid supplier/item identities, authoritative quantities/totals, stale edits, immutable submitted offers, closing deadlines, expiry, cancellation retention, comparison excluding drafts, manual award without automatic ranking, unauthorized actions, warehouse scope, and competing award/conversion requests.
2. Verify full PR → RFQ → multiple submitted quotes → close → manual award → explicit DRAFT PO flow. Check exact quantities/prices/tax/shipping and linked identities, one PO under competing conversion, no automatic order on award, and no stock changes before receiving.
3. Run `npm test`, `npm run test:integration` in backend and `npm run build` in root; inspect diff. The integration runner owns and removes a newly generated disposable schema.
4. Review/apply the pending RFQ migration safely to the original database, preserving existing counts, and apply only its SQL to the persistent UI schema (which has no migration ledger). Do not deploy the entire migration chain to that persistent UI schema.
5. Restart original API on 5000 and isolated UI API on 5050. Check `/api/health` and actual PR/RFQ endpoints; a health response alone does not prove schema compatibility.
6. Verify pages in the browser using only isolated UI records: create/issue RFQ, record/submit multiple offers, comparison, close, select with reason, convert with free-text catalog mapping, reload and check persistence/errors. Include a deliberate higher-price selection with a business reason to demonstrate manual selection.
7. Update progress documentation with actual evidence; then proceed to supplier returns, inventory conditions and transfer discrepancies.

## Remaining expansion in required order

- Supplier returns / RTV, defective and quarantine inventory, exact serial states and physical return movements.
- Transfer discrepancies: partial receipt, missing/unexpected/damaged serials, investigation/resolution and audit.
- Reorder suggestions with explicit PR/draft-PO creation; supplier performance from real receipts/returns.
- Asset custody improvements, preventive maintenance scheduling, warranty claims.
- File/document attachments; CSV/Excel preview, validation, explicit confirmation, import result and rejected-row report.
- Additional reports and saved filters, detailed safe audit diffs, notification preferences, dashboard customization and permission-aware backend global search.
- Refresh-token session administration, login failures/temporary lockout, backup visibility and carefully confirmed restore, retention/archival, storage abstraction, background jobs, production monitoring and protected API documentation.
- Cross-module/security/concurrency tests and deployment guidance for environment, migrations, HTTPS/reverse proxy, process management, uploads, logs and backups.

Existing maintenance/custody/reporting/refresh-token support is not completion of these new features. Existing simple reservation expiry worker and local safety snapshot are not full background-job or backup administration.

## Verification and local database state

Latest checkpoint checks:

- Root `npm run build`: passes, 2,479 modules.
- Backend `npm test`: 24 passed / 41 live tests skipped.
- Backend `npm run test:integration`: all 65 tests passed in 12 files; migration chain applied in a disposable schema and runner removed it.
- RFQ-specific workflow tests and browser verification: pending.
- Staged diff check: trailing blank-line warnings in three migration files, retained to preserve already-applied checksums.
- New API health check: pending; APIs remain stopped after Prisma generation.

Original database: `techstock_inventory`. Migrations through `20261001_purchase_requests` were applied. Last confirmed original counts: 16 products / 5 purchase orders. No synthetic PR/RFQ records were added there. `20261002_rfqs` is not yet applied there.

Retained pre-warehouse migration safety snapshot: `techstock_backup_warehouse_munmaea8`. Preserve it. CREATE TABLE LIKE + inserted rows retains data/indexes, not foreign keys; it is not a supported restore implementation.

Persistent UI-only schema: `techstock_test_warehouse_munmaea8`. It contains synthetic verification records and has migrations through PR applied by SQL, without `_prisma_migrations`. Its RFQ migration is pending. Local ignored `backend/.warehouse-test-state.json` holds the schema identifiers, not credentials. Read environment locally without printing secrets.

Frontend development surfaces were started at localhost:5174 (original API) and 127.0.0.1:5176 (isolated API). Recheck running processes/ports before launching; do not terminate unrelated user processes. The original API and UI API were deliberately stopped for Prisma generation. The RFQ code now reads RFQ relationships from PR detail, so the pending schema must exist before restarting this checkpoint's API.

Local-only files excluded from Git: `.env`, backend `.env`, uploads/logs, test runtime, test schema state, temporary UI fixture scripts and before-schema snapshots. Preserve these for continuation until isolated verification is complete. Eventually stop isolated services and remove only the exact owned test schema/files; retain the original database and safety snapshot.

The backend package-lock has pre-existing optional dependency metadata changes unrelated to this checkpoint. They are preserved locally and excluded from the checkpoint commit. Do not overwrite them while continuing.
