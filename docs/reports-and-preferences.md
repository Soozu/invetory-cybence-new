# Phase 14 — reports, audit diffs, preferences and global search

Updated 2026-10-01. Implementation and backend/build acceptance pass. Browser acceptance remains pending; Phase 13 browser checks remain pending too. The full expansion is not finished.

## Reports

- `/reports` uses the backend catalog, real paged data, applicable filters, selected columns and validated sorting. It replaces the previous management-page report implementation.
- `GET /api/reports/catalog` lists only reports permitted by `reports.VIEW` and their native source permissions. `GET /api/reports/data/:kind` applies these same permissions and current warehouse assignments on every request. Existing nine report endpoints remain compatible and now also require native source access.
- Catalog contains 23 report types: inventory summary, warehouse stock, valuation, aging, fast/slow movement, low/out of stock, movement, count variance, adjustments, transfer discrepancies, PRs, RFQs, quotation comparison, supplier purchases/returns/performance, assets, assignment history, maintenance costs, coverage and claims. Claims require `warranty_claims.VIEW`; supplier performance requires purchasing, suppliers and supplier-return access.
- Query: `page` (1–100000), `limit` (1–100), `sortBy`, `sortOrder`, comma-separated `columns`, and only the filters declared by the report. Reject unknown keys, unsupported fields/sorts/columns, duplicate columns, invalid calendar dates, reversed ranges and inaccessible warehouses.
- Stock queries use parameterized SQL, fixed identifier/direction maps, database ordering and pagination. Every integer expression is converted to a JSON-safe number; money remains exact decimal strings. Other document reports use scoped ORM queries with count/page reads. Supplier performance reuses the existing complete PO-cohort calculation, then sorts/pages its supplier aggregates on the backend; it does not truncate the cohort. This aggregate can be expensive for very large windows.
- Valuation is **current physical units × current purchase cost**, including unavailable units. It is not historical or FIFO valuation. Current-stock reports reject date filters.
- Aging measures **days since the latest recorded positive movement**, including corrections and arrivals, with a fixed generation timestamp. Missing inbound history is unknown. It does not reconstruct lot age or invent opening dates.
- Fast/slow demand sums negative `STOCK_OUT` and `ASSET_ASSIGNMENT` only. Transfers, corrections, damage and supplier returns do not count as demand. Existing warehouse-stock rows with zero demand remain included. Default window is the 90 calendar days ending on `dateTo`, or today, in UTC. The resolved dates are returned.
- Count variance uses stored count snapshots; assignment and service histories use recorded historical warehouses. Unknown historical warehouses remain administrator-only. Undefined cost/rate/date/outcome values stay unknown. Supplier performance preserves the existing order-date cohort, exact receipt values, return provenance, whole promised UTC day, denominators and unknown rates.
- Excel/PDF controls explicitly export **one selected page and columns**. `GET /api/reports/export/:kind` independently requires `reports.EXPORT` and rechecks source/warehouse access, fetching a fresh page. No silently capped “all records” export is offered. A report can change between preview and export; exported values come from the fresh read.

## Saved report configurations

- `GET/POST /api/reports/saved`, `PUT /api/reports/saved/:id`, `POST /api/reports/saved/:id/archive`.
- Store name, report type, filters, selected columns and sort settings in `SavedReport`. JSON contains configuration only, never a copy of report business rows.
- Each configuration is owned by its authenticated user; no submitted owner ID is accepted. Lists filter currently permitted report types. Applying an old saved configuration rechecks current source and warehouse access when generating.
- New configurations use `expectedRevision: 0`; edits/archive require the current revision and return 409 on stale/unavailable/foreign records. Serializable writes enforce at most 50 active configurations per user. Archive retains history. UI supports save/update/save as new/archive and keeps typed fields after errors; reload obtains saved revisions explicitly.

## Safe audit diffs

- Add nullable `ActivityLog.changes`: an array of `{field,before,after}` values. Existing events are not backfilled from current data.
- `safeAuditChanges` only accepts explicit scalar field allowlists for known entities. Passwords/hashes, tokens/secrets, email/auth payloads, arbitrary metadata, request bodies and free-form notes are never copied into snapshots. Dates and decimals are normalized; unchanged values are omitted. Uninstrumented events retain `null`; no fabricated detail is displayed.
- Hooks cover catalog/product changes and costs/thresholds, PO/PR/RFQ/quotation transitions/edits, supplier returns, counts/reservations, adjustment and condition balances, serial states, asset states/ownership, maintenance costs/status/inspection, warranty decisions, user status/role/default warehouse and selected nonsecret system settings. Detailed line and custody history remains in the existing relational/event ledgers; snapshots do not replace those ledgers.
- `/management/activity` now reads server pagination and filters. `GET /api/activity-logs` and `/:id` require `users.VIEW` and recorded warehouse/related-warehouse scope. Detail shows before/after values or the explicit historical/uninstrumented notice. No whole user/auth record is returned.

## Account preferences and notifications

- `/profile/preferences`, available in the profile menu; authenticated self-service `GET/PUT /api/preferences`. `UserPreference` stores validated notification/dashboard configuration and one optimistic revision. GET returns defaults without inserting rows. PUT accepts only the caller's preferences and returns 409 on stale writes.
- Only `inApp` is implemented. Nine independent categories: low stock, out of stock, purchase approval (PO/PR), transfer approval, transfer received, purchase received, warranty expiring, maintenance due and warranty claim updates.
- Existing producers use one delivery helper inside their business transactions. It checks active recipient, preferences, native module grants, warehouse access and global stock/warranty switches. Approval and receiving notifications have actual document scope. Transfer arrivals notify the requester. Claim events notify eligible scoped users with claim status, without changing stock/custody.
- Reads/bootstrap and mark-read operations recheck preferences, permissions and warehouse scope. Disabled categories hide retained history and suppress new delivery; old rows are not deleted. Unknown producer types are withheld.
- Warranty reminders and due active preventive plans/scheduled services are generated from real records at notification/bootstrap reads with stable dedupe keys. Date changes create a distinct due occurrence; reads do not create duplicate reminders. This is read-triggered delivery, not a complete background scheduling system.
- Out-of-stock delivery now fires when a previously low product reaches zero, even if a low-stock alert was already sent.

## Dashboard customization

- Persist selected stat cards and their order, selected charts/sections and their DOM order, default accessible active warehouse and default period (`7d/30d/3m/6m/1y`). All widgets may be hidden deliberately.
- Default warehouse affects actual summary, movements, category, low-stock and activity API queries. Each query authorizes the selected warehouse. Card/catalog supplier count remains company-wide. Stock summaries are current; the period controls the movement chart.
- An unavailable/revoked default is retained in configuration but its effective warehouse becomes null, with an explanatory warning. It never expands current warehouse grants. Retry/reload obtains current preferences. Array updates from bootstrap refresh dashboard queries, including after the movement history reaches its 500-row bootstrap limit.

## Backend global search

- `GET /api/search?q=...&perType=3`: trimmed 2–100 characters, 1–5 matches per type, authenticated, private/no-store response.
- Finds product name/SKU/barcode, serial, asset tag, supplier name/code, PR, RFQ, quotation/reference, PO, receipt, transfer and claim numbers. Each type has independent native VIEW permission and appropriate warehouse/transfer/serial scope; shared catalog masters retain their existing shared scope.
- Returns type/ID/title/subtitle/route, per-type total and `hasMore`. Counts are computed after authorization. No contact/auth data or financial line payload is returned. Search is bounded with explicit refine-search guidance.
- Ctrl K uses the backend service with debounce, stale-response guards, accessible input/result buttons and loading/empty/error/retry states. Native receipt detail API/page was added so receipt search has a real destination. Scoped receipt detail requires purchasing VIEW and returns 404 outside access.

## Migration and retained state

- Additive `20261009_reports_preferences`: two configuration tables and nullable audit JSON only. No stock rewrite, destructive reset, fixtures or permission changes are required.
- Original `techstock_inventory`: 14 successful migrations. Persistent UI `techstock_test_warehouse_munmaea8`: inspected pending SQL only, no ledger; **never replay the full migration chain there**.
- Fresh snapshots before migration: `techstock_backup_phase14_original_muoz1dg7` (58 tables) and `techstock_backup_phase14_ui_muoz1dg7` (57). Their 115 table fingerprints match. All 339 table fingerprints across these and the four retained Phase 13 snapshots also match.
- All baseline records remain retained. Current original still has 16 products, 5 POs, 0 claims/plans/import batches and 1 existing attachment. Live application activity during this work completed a maintenance record and synchronized its asset/serial, created an account/warehouse assignment and saved personal preferences, and rotated login tokens. These changes were preserved and recorded separately; do not claim the active database stayed byte-for-byte unchanged. Physical stock/movement/counter rows did not change against the Phase 14 baseline.
- No synthetic Phase 14 mutation fixtures were inserted into the original or persistent UI schema by this implementation. Business-rule tests use fresh disposable schemas only. No commit/push occurred; HEAD remains `a33a2fb`, with previous Phase 12/13 and lockfile work retained.

## Verification and pending acceptance

- Final disposable MySQL integration: **241 tests / 24 files pass**, including 18 Phase 14 live checks and 8 unit checks. Coverage includes every report/sort and HTTP JSON serialization, exact values/demand, unknown history, scope/permissions/revocation, export access, config ownership/stale revisions, preference defaults, due dedupe, delivery/global switches, search types/routes/privacy, safe diffs and warehouse dashboard/receipt reads.
- Separate unit-only run: **49 pass**, with 192 database integration checks skipped as intended.
- Production frontend build: passes (2501 modules). Prisma schema validation/client generation and diff whitespace checks pass. No Phase 14 dependencies were added.
- Both health endpoints and **184 authenticated real API reads** pass, including all 23 report types and export pages, receipt details and retained feature lists/details. Read JWTs remain in memory. Runtime evidence is ignored under `backend/.test-runtime/phase14-*`.
- Local APIs: original 5000, isolated 5050. Preview: isolated 5176, existing original 5173 preserved. Check current process ownership before changing a server; do not terminate an unrelated replacement process.
- Browser tools were not retried because the saved block for `http://127.0.0.1:5176` has not been confirmed cleared. Still verify report preview/pagination/Excel/PDF, saved configuration conflicts, activity details, preferences/reload/scope fallback, dashboard order, Ctrl K/search/receipt routes, keyboard, desktop/mobile, console/screenshots and Phase 13 attachment/import acceptance. Browser network logs alone do not prove visual acceptance.
- Next development group: Phase 15 session/security administration, backup/retention controls, job expansion, monitoring, protected OpenAPI and deployment preparation. Existing reservation-expiry worker is not completion of that group.
