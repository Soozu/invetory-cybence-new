# Phase 13: attachments and validated imports

Updated 2026-10-01. Implementation, migrations, backend integration and frontend build pass. **Browser acceptance remains unfinished:** a saved browser permission blocks the local preview even after the user approved resuming checks. Do not mark this phase fully accepted or skip its remaining UI checks.

## Attachments

`Attachment` retains the document kind and record ID, original filename, generated stored name, MIME, byte count, provider/key, SHA-256, uploader, upload request UUID, timestamps, archive actor/time and upload-time warehouse scope. Storage keys, stored names and digests are omitted from public responses. Access follows the current source record, including warehouse changes; stored scope is an audit snapshot.

Supported records: Product, Supplier, PurchaseRequest, RFQ, SupplierQuotation, PurchaseOrder, PurchaseReceipt, SupplierReturn, StockTransfer, Asset, MaintenanceRecord and WarrantyClaim. Quotation scope follows its RFQ; transfers allow either endpoint for document access. Unknown closed legacy maintenance scope remains administrator-only. Products with retained documents archive rather than hard-delete; suppliers with retained documents cannot be hard-deleted, including when the documents are archived.

Permissions are checked in services and on every authenticated request:

| Operation | Attachment permission | Source permission |
| --- | --- | --- |
| Search, list, download | `attachments.VIEW` | Source `VIEW` |
| Upload | `attachments.VIEW`, `attachments.CREATE` | Source `VIEW`, `EDIT` |
| Archive | `attachments.VIEW`, `attachments.DELETE` | Source `VIEW`, `EDIT` |
| Restore | `attachments.VIEW`, `attachments.EDIT` | Source `VIEW`, `EDIT` |

Warehouse ownership applies in addition. Administrator uses the existing administrator policy. Standard roles receive attachment actions; Viewer receives VIEW only. Source permissions still control which records can be changed.

### Storage and validation

Configure `ATTACHMENT_MAX_BYTES` (default 10 MB, maximum 25 MB), `ATTACHMENT_ALLOWED_TYPES` (default pdf,png,jpg,jpeg,webp,docx,xlsx) and `ATTACHMENT_STORAGE_DIR` (default `.private-storage/attachments`). The directory must be outside public uploads. The isolated local API uses `.test-runtime/phase13-ui-files`; do not point it at original document storage.

Uploads authorize before multipart parsing, bound files/fields/bytes, reject path/control filenames, and match allowed extensions, MIME and detected content. DOCX/XLSX validation reads bounded ZIP entries without extracting them, checks required content declarations, and rejects malformed XML, declarations/entities, external relationships including encoded attributes, macros, encryption, duplicate/unsafe paths and embedded executables. PDF/images use content signature detection; this is not antivirus scanning or exhaustive document/image decoding. Downloads are authenticated attachments with no-store, nosniff and restrictive response headers.

Local storage uses generated UUID keys with exclusive writes. A failed metadata/audit transaction removes only its own uncommitted file. Files are immutable; archive retains bytes and metadata for restore. Same-target/user/request UUID retries return one document and audit event; a different payload on that UUID returns 409. Archive/restore require `expectedUpdatedAt` and a 5–1000 character reason. Archived files cannot be downloaded until restored. Cloud storage and retention administration remain later work.

### Routes

- `GET /api/attachments/sources/:entityType`: scoped record labels/search, 20 per page.
- `GET /api/attachments/:entityType/:entityId`: active documents by default; `archived=true` includes retained archived documents.
- `POST /api/attachments/:entityType/:entityId`: multipart `file`, `requestKey` UUID.
- `GET /api/attachments/files/:id`: authenticated download.
- `POST /api/attachments/files/:id/archive` or `/restore`: JSON version and reason.

The frontend has an Attachments hub for all twelve types and a contextual panel on supported record detail pages. Receipts and maintenance can be selected through the hub. Inputs are retained after errors, upload retries retain their UUID, and stale actions offer explicit reload.

## CSV imports

The new `/imports` page replaces the old product importer. The old importer and its sequential/partial context helper were removed. No CSV row creates a product, supplier, unit, serial or asset before explicit batch confirmation.

Format is **UTF-8 CSV**, optionally with BOM; XLSX parsing is not implemented. Export an Excel worksheet as CSV. Original scope allowed CSV and/or XLSX. Limits: 1 MB, 100 data rows, 32 KB parsed record, 4000 characters per cell, 100 serialized units per opening-stock row. Quoted commas, doubled quotes and multiline text are handled by the pinned `csv-parse` parser. Duplicate/unknown/missing headers and malformed files are rejected rather than truncated. Blank physical lines are skipped; row numbers in preview/report identify logical CSV records, with header counted as row 1.

| Type | Required columns | Effect after confirmation |
| --- | --- | --- |
| Products | sku,name,categorySlug,brandSlug,purchaseCost | Creates catalog products with no stock |
| Suppliers | supplierCode,companyName | Creates suppliers with exact supplied unique codes |
| OpeningStock | sku,warehouseCode,quantity | Adds an audited opening adjustment and movement; serialized units need semicolon-separated serialNumbers |
| SerialNumbers | sku,warehouseCode,serialNumber | Registers existing unreserved units, records history start and a zero-quantity correction; physical stock is unchanged |
| Assets | sku,warehouseCode | Registers company assets through the existing asset service; consumes one available unit per row; serialized products also need serialNumber |

Download templates contain all supported optional headers. The frontend includes paginated/searchable reference-code directories for active category/brand slugs, supplier codes and SKUs. Directories return only names/codes under the import's source permission. Warehouse selections use the current scoped directory and show their codes. Each warehouse CSV code must match the explicitly selected warehouse.

Products validate active category/brand/supplier references, duplicate SKU/barcode, strict nonnegative two-decimal costs, integer thresholds and true/false tracking. Supplier codes/company names and serial numbers are checked against both the file and database. Database constraints remain the final uniqueness guard. Asset dates use exact valid YYYY-MM-DD; eligibility includes availability, serial ownership, active maintenance, holds and claims. Aggregate rows cannot consume more units than are available.

Opening stock is limited to a warehouse/product pair with no nonzero balance, registered warehouse serials or stock movement history. Established stock uses the existing adjustment workflow. Serialized opening stock follows the existing adjustment warranty-date policy; it does not invent a supplier receipt. Serial backfill requires unreserved physical units without registered serials and leaves receipt, supplier and warranty provenance unknown. It does not fabricate historical receiving, custody or maintenance. Assets are registered AVAILABLE, without automatic custody assignments.

### Staging and confirmation

`ImportBatch` stores temporary parsed CSV rows, validated inputs, errors, dependency fingerprints, upload SHA/request UUID, uploader/warehouse, revision, expiry, status and immutable confirmation result/actor/reason. JSON is staging data; confirmed masters and inventory remain relational. Previews expire after 24 hours, and each uploader is limited to 20 active previews. Metadata is retained; automatic purge/retention is later administration work.

Import VIEW plus source VIEW are required to read templates/directories/previews/reports. CREATE plus the native source write action are required to stage/revalidate. CONFIRM additionally gates confirmation. Products/Suppliers/Assets use native CREATE; stock/serial imports use inventory EDIT. Batch contents are private to the uploader and administrators, with current warehouse authorization checked again. Revocation affects the next authenticated request.

Preview writes staging and audit only. A confirmed batch applies **all rows in one serializable transaction**, reusing the existing product, supplier, adjustment and asset transaction helpers. Any rejected row or later failure prevents the whole batch from being applied. Confirmation revalidates current references, balances, serial eligibility and dependencies. Changed dependencies return 409; explicit revalidation creates a new revision and requires another review. Fingerprints compare canonical values because MySQL JSON may reorder object keys. Uploaded data is never accepted as authoritative normalized input.

Same upload UUID/scope/file retries create one preview. Same batch confirmation retries return the stored result without repeating movements, assets, counters or audit events. Concurrent batches cannot register/consume the same remaining unit. The frontend requires review confirmation and an import reason, preserves the reason after failures/reload, shows row errors, pagination, results and record links, and supports safe rejected-row CSV download. Exported user text is quoted and spreadsheet formulas are neutralized.

### Routes

- `GET /api/imports`: authorized recent batch summaries, 20 per page.
- `GET /api/imports/templates/:type`: authenticated header template CSV.
- `GET /api/imports/reference-codes/:type/:kind`: active reference directory, search/page.
- `POST /api/imports/preview/:type`: multipart `file`, `requestKey`, optional `warehouseId` (required for warehouse types).
- `GET /api/imports/:id?page=1`: preview/result, summary and 20 rows per page.
- `POST /api/imports/:id/revalidate`: `expectedRevision` integer.
- `POST /api/imports/:id/confirm`: `expectedRevision` integer and 5–1000 character `notes` reason.
- `GET /api/imports/:id/rejected.csv`: authorized rejected logical rows and error explanations.

## Local verification and continuation

- Additive migrations `20261007_attachments` and `20261008_validated_imports` are applied to original `techstock_inventory` (13 successful migrations). Only inspected pending SQL was applied to `techstock_test_warehouse_munmaea8`; it still has no migration ledger. Do not replay that chain or mutate original with synthetic acceptance data.
- Attachment snapshots: `techstock_backup_attachments_original_muowp94m` (56 tables), `techstock_backup_attachments_ui_muowp94m` (55). Import snapshots: `techstock_backup_imports_original_muoxrtwu` (57), `techstock_backup_imports_ui_muoxrtwu` (56). All 224 snapshot table fingerprints pass; earlier Phase 12/warehouse snapshots are retained.
- Original business rows are unchanged, with 16 products / 5 POs / zero synthetic claims, plans, attachments or import batches. The older attachment baseline detected normal active-session refresh-token rotation (revokedAt on one prior token and new token rows); it is recorded separately, without dumping credentials. Only feature permission/grant and migration rows were added to other pre-existing original tables. The fresh import baseline confirms all 57 original and 56 isolated pre-existing table rows, including the retained isolated PDF, unchanged after the import migration/checks.
- Final disposable MySQL integration: **215 passed / 22 files**, including 14 live attachment tests, 19 live import tests, and seven unit tests each for attachment validation and CSV parsing. It covers all twelve attachment parents/five import types, authenticated transport, limits, spoofing/OOXML, archive/restore, source/owner/warehouse permissions and next-request revocation, retries/concurrency, stale state, rollback and stock/custody/provenance invariants. The runner removes only its owned disposable schema.
- Final `npm test`: **41 passed / 174 live skipped**. Frontend production build: passes, 2494 modules. Prisma validates/generates; diff whitespace check passes. Both APIs return healthy database status; **66 authenticated feature/list/detail reads** pass after final restart. These API checks do not replace browser acceptance.
- New pinned dependencies: file-type 22.1.1, yauzl 3.4.0, fast-xml-parser 5.11.2 and csv-parse 7.0.3. file-type requires Node >=22; tested on Node 24.14.0. Final registry audit reports nine existing project advisories and none in these four new dependencies. Existing Prisma/tooling dependencies were not upgraded as part of this feature. See the [CSV parser options](https://csv.js.org/parse/options/) for parsing controls.
- Original API 5000 and isolated API 5050 run the final backend. Existing original preview 5173 and isolated preview 5176 remain. Before stopping a process, check ownership; Prisma generation on Windows needs the owned APIs stopped to release its DLL. Isolated attachment storage remains `.test-runtime/phase13-ui-files`.
- Earlier isolated browser upload succeeded: `inspection-evidence.pdf` appears on WC-000001 (resolved/repaired claim) and persisted as a real attachment. Further browser operations were blocked; the user's subsequent approval did not clear the saved permission setting. **Still required:** browser download/archive/restore, malformed upload feedback, hub receipt/maintenance selection, all five CSV preview/confirmation/result flows, stale/conflicting preview values, reload persistence, desktop/mobile layouts, console review and screenshots. Clear the saved browser block before attempting these checks; do not use another surface to bypass it.
- Local logs, migration helpers, snapshots, credentials and fixtures remain ignored under `backend/.test-runtime/phase13-*`. This continuation is uncommitted and unpushed; previous unrelated lockfile edits and Phase 12 changes are preserved.

After Phase 13 browser acceptance, continue the requested reporting/preferences/search expansion. Administration, jobs, cloud storage, monitoring, API documentation and deployment preparation remain unfinished.
