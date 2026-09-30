# Advanced features expansion

## Delivery order

This expansion is implemented as separate, verified features within the existing React → Express → Prisma → MySQL architecture. JavaScript/JSX, backend business references, transactional inventory writes, audit history, and the development seed remain in use.

1. Warehouse authorization and multiple user assignments.
2. Physical stock counts, then inventory reservations.
3. Barcode/QR support and serial lifecycle history.
4. Purchase requests, RFQs, quotations, comparison, and explicit conversion to orders.
5. Supplier returns, inventory conditions, and transfer discrepancies.
6. Reorder suggestions and supplier performance.
7. Asset custody, preventive maintenance, and warranty claims.
8. Attachments and validated CSV/Excel imports.
9. Additional reports, saved filters, audit diffs, notification/dashboard preferences, and backend global search.
10. Session administration, backup visibility, archival, storage providers, workers, monitoring, and API documentation.
11. Expanded cross-module tests and deployment preparation.

## Phase 1: warehouse access

Implemented in the current working tree:

- `UserWarehouse` holds multiple assignments and a preferred default. The old `User.warehouseId` stays synchronized as a compatibility default, but does not grant access by itself.
- Migration `20260930_warehouse_access` creates the assignment table, backfills existing non-null default assignments, and adds scope fields/indexes for notifications and audit logs. It contains no table drops or inventory resets.
- `warehouseAccessService.js` centralizes scope construction and resource checks. Administrator has unrestricted warehouse access; other users with no assignment have none.
- Authentication reloads database assignments on every authenticated request. Revocation therefore affects an already-issued access token on its next request.
- Bootstrap, warehouse detail/list endpoints, stock, movements, serials, purchasing/receiving, assets, maintenance, monitoring, dashboards, reports, and the existing loaded-data search source respect scope.
- Product/category/brand/supplier catalog metadata remains shared for authorized catalog/procurement users, so new products can be received. Stock balances, histories, order lists, valuations, and warehouse metrics are scoped. A warehouse filter must itself be authorized.
- Warehouse creation and user/role/access administration are administrator-only, in addition to the existing module permissions. Non-administrator user listings contain the requesting user's profile only.
- Users → Manage warehouse access supports multiple assignments and a default. New-user forms support the same fields.
- Warehouse selectors use the scoped backend result. Transfer source selections use assigned warehouses; a separate routing directory returns only destination identifiers, names, and codes.
- A transfer is visible to its source or destination. Create/edit/submit/approve/ship/cancel require source access; receiving requires destination access. Existing module action permissions are still required.
- Asset-owned serials remain visible through the asset's warehouse. In-transit serials are visible through the associated transfer's endpoints.
- Historical logs and notifications that cannot be assigned a warehouse confidently are retained for administrators and withheld from ordinary warehouse users. Exact order/receipt/transfer/asset references are backfilled. New warehouse operations record scope.

### API contracts

`PUT /api/users/:id/warehouses` requires Administrator and `users.EDIT`:

```json
{
  "warehouseIds": ["warehouse-a", "warehouse-b"],
  "defaultWarehouseId": "warehouse-a"
}
```

This replaces the assignment set transactionally. IDs must be unique, warehouses must exist and be active, and a supplied default must belong to the assignment set. Sending an empty set removes warehouse access. The user create/update contracts also accept `warehouseIds` and `defaultWarehouseId`; legacy `warehouseId` input remains supported.

`GET /api/transfers/destinations` requires `inventory.CREATE`. It returns `{ id, name, code }` records only, allowing a source user to request delivery to another warehouse without receiving access to that warehouse's inventory.

Unauthorized explicit warehouse filters, details, and actions return 403 using the existing error contract. An unfiltered list for an unassigned user is empty.

### Migration and verification

From `backend`:

```sh
npm run prisma:generate
npx prisma migrate deploy
npm test
npm run test:warehouse-access
```

The dedicated integration command creates an isolated MySQL schema, applies the initial migration, inserts a legacy single-warehouse assignment, applies current migrations, runs all tests through real HTTP/MySQL, then removes that schema. It requires a local database account allowed to create/drop disposable schemas. Never point test mutations at the original schema. Ordinary `npm test` skips the live suite unless its explicit test URL is supplied.

The development migration was applied successfully. Original catalog/order counts were preserved: 16 products and 5 purchase orders. A pre-migration table snapshot is retained in MySQL as `techstock_backup_warehouse_munmaea8`; it is a local safety snapshot, not an automated backup/restore feature. `CREATE TABLE LIKE` snapshots do not recreate foreign keys. Restoring requires a deliberate, reviewed procedure using the checked-in schema migrations and saved table data.

Verification covers multiple/no assignments, unauthorized filters and direct IDs, product quantity projections, bootstrap, dashboards, reports, stock/serial writes, receiving, assets, maintenance, transfers, double receipt rejection, assignment validation, and revocation with an existing token. The frontend production build and Prisma generation pass.

## Phase 2: physical stock counting

Implemented count sessions, immutable quantity/reservation/timestamp/serial snapshots, paginated count lines, explicit zero counts, exact serial reconciliation, and draft → in progress → submitted → approved transitions. Cancellation retains the record. Approval applies correction movements and linked adjustments in one serializable transaction. A changed balance, reservation, timestamp, or serial state rejects approval with 409; cancel and create a fresh count. Reserved/held units cannot be removed by a count.

Missing serials become `MISSING`, retaining their last warehouse and count history. Unexpected serials must be globally unique, or previously missing for the same product and warehouse; recovery preserves the original serial record and warranty. Newly discovered units receive no invented procurement or warranty history. An equal-quantity serial substitution still creates a correction movement and adjustment.

`/api/stock-counts` provides list/create, detail, paginated items, PATCH items, and start/submit/approve/cancel actions. `stock_counts.VIEW/CREATE/EDIT/APPROVE` are separate permissions. Inventory Manager receives all four; Warehouse Staff receives VIEW/CREATE/EDIT; Viewer receives VIEW. Administrator remains unrestricted. The permission editor now reads the backend catalog, including new modules.

Inventory → Stock Counts supports creation, snapshot start, counting, review and approval. Serialized counts use one scanned serial per line, with expected/scanned/missing/unexpected sets. Page changes are blocked until edits are saved. Saved quantities lock on submission. Loading/empty/error/retry states use the existing UI. Scanner keyboard integration follows in the barcode feature.

Migration `20260930_z_stock_counts` adds count tables and enum values without removing existing data. Verification: 35 backend tests passed in an isolated schema, including positive/negative/zero corrections, preserved holds, stale timestamps, exact serial substitution/recovery, duplicate scans, held serial removal rejection, approval races, repeated approval, and HTTP permissions/warehouse boundaries. Production build and health check passed. Browser verification approved a synthetic 10 → 8 count with its linked adjustment persisting after reload; no browser console errors.

## Phase 3: reservations

Implemented warehouse-scoped reservation records, line quantities, fulfillment quantities, exact serial selections, optional expiry and project/deployment references. On-hand quantity stays unchanged when reserved; availability is on-hand minus reserved. Creation, release, cancel, fulfillment and expiry use serializable transactions, movement history and scoped audit records. Existing holds from earlier workflows are preserved.

Serialized reservations accept exact serials or select available units deterministically on the backend. Reserved units cannot be changed independently using the serial status endpoint. Fulfillment issues units from inventory, marks exact serials `ISSUED` and records their original warehouse/history. Partial fulfillment keeps the remaining hold active. Releasing or expiring a partial reservation releases only unfulfilled units. Fully fulfilled and closed reservations cannot be acted on twice. Fulfillment supplies `expectedFulfilledQuantity` per line to reject duplicate partial submissions.

`/api/reservations` supports paginated list/create/detail/items, scoped searchable availability, fulfill, release and cancel. Permission keys are `reservations.VIEW/CREATE/RELEASE/FULFILL`; Inventory Manager and Warehouse Staff receive all four, Viewer only VIEW. The role matrix uses backend module and action names, including nonstandard actions.

Inventory → Reservations provides create, backend warehouse availability, multiple items, optional exact serials, references and expiry; detail supports partial issue and remaining release. No frontend stock arithmetic is persisted. Relevant writes refresh the existing workspace projection; reservation lists/items are fetched independently.

Migration `20260930_zz_reservations` preserves existing stock and adds reservation tables, serial `ISSUED`, reservation movement types and nullable previous/new reserved quantities on movements. No old history is invented. A simple internal worker starts with the API and expires up to 100 due reservations each minute, processing each transaction separately. Expired holds conservatively remain reserved until the worker runs; fulfillment is immediately blocked after expiry. Multiple API workers remain safe through transactional state checks. The job status is operational memory; durable job administration follows later. Keep API clocks synchronized and run migrations before starting the API.

Verification: 44 tests pass across seven files using an isolated schema. Reservation coverage includes over-reservation, preserving other holds, partial/full issue, stale partial submissions, repeated close, expiry, exact/automatic serial selection, protected serial status, serial expiry, competing last-unit reservations, multi-item rollback, fulfillment races, input validation, permissions and warehouse scope. Browser verification reserved two exact serials, issued one, released the other, and confirmed persistence after reload without console errors. Frontend build passes. The original migration was applied safely.

## Phase 4: barcode and QR support

Implemented exact backend lookup for SKU, product barcode, serial, asset tag and warehouse code. Typed QR identifiers use `TS:product:`, `TS:serial:`, `TS:asset:` or `TS:warehouse:` prefixes. Ambiguous raw identifiers return multiple matches for explicit selection. Warehouse and module permissions apply to lookup and label payloads; payloads contain identifiers and label text only.

Product barcode generation requires products.EDIT, uses the authoritative reference counter, checks SKU/barcode collisions and locks the product row before allocation. Repeated and competing requests return the same existing barcode. Serializable transaction retries now use a short bounded delay to avoid immediate repeat deadlocks.

Inventory → Scan & Labels provides keyboard scanner and manual lookup, QR/Code 128 labels, 40×30 mm, 50×25 mm and A4 layouts, and 1–100 copies. Printing waits for rendered labels. QR and barcode encoders are pinned npm dependencies (`qrcode` 1.5.4 and `jsbarcode` 3.12.1). Scanner capture ignores normal editable controls. Reusable focused serial inputs support stock counting, receiving, transfer packing/receiving and maintenance lookup. Transfer scans select exact available serials and receiving must match the shipped set; discrepancy handling follows in its own phase. Manual workflows remain available.

Verification: 51 tests pass across nine files in disposable MySQL, including barcode allocation races, identifier ambiguity, scoped lookup/labels, validation and exact transfer scans with mismatch rollback. Frontend build and diff check pass. Browser verification generated a synthetic product barcode and displayed QR and A4 Code 128 labels without console errors. Physical printer/scanner hardware and printer-specific calibration have not been tested; use 100% print scale and test a label before batching.

## Phase 5: serial lifecycle

Implemented `/serial-numbers/:id` with current product/warehouse/supplier, exact PO/receipt links, warranty, asset and current custody. Inventory lists and serial scan results link to the lifecycle page. Procurement links require purchasing.VIEW and access to the document warehouse; asset/assignee details require assets.VIEW and access to its warehouse. Lifecycle requires inventory.VIEW.

`GET /api/serial-numbers/:id` returns the scoped detail; `GET /api/serial-numbers/:id/events` returns paginated events. Events use their own warehouse boundaries: access to the unit’s current warehouse does not expose events from a different warehouse. Transfer events are visible to their endpoints. Asset/assignment/maintenance events also require assets.VIEW; receiving events require purchasing.VIEW.

Migration `20260930_zzz_serial_lifecycle` adds SerialEvent and a nullable exact receipt link. Existing serials receive one migration-time HISTORY_STARTED snapshot, explicitly described as the start of recording. No received date, exact partial receipt or old status transition is guessed. New receiving writes the exact receipt link. Events are created in the same transaction as receiving, stock adjustment/status changes, transfer shipment/arrival, reservation/release/issue/expiry, physical-count missing/discovered/recovered, asset creation/update/assignment/return/disposal and maintenance actions.

Maintenance changes serial state to FOR_REPAIR and restores ASSIGNED when custody remains active, or AVAILABLE otherwise, once all repairs close. Open repairs prevent asset retirement/disposal, and closed service records cannot be edited/reclosed. Direct serial status changes now create a zero-quantity stock movement with previous/new holds. Reservation worker completion counts increment after transaction commit, avoiding retry overcounts.

Verification: 57 tests pass across ten files, including legacy migration markers, exact partial receipt links, reservation/issue event idempotency, transfer history boundaries over HTTP, protected custody fields, parallel repair restoration, returns/disposal and atomic status/movement records. Suites sharing role/permission fixtures run sequentially; explicit competing-write tests still run concurrently within suites. Frontend build and diff check pass. The migration was applied with original 16 product/5 purchase-order counts unchanged. Browser verification followed a serial QR lookup into receipt/warranty/custody and five lifecycle events, then reloaded successfully without console errors.

## Phase 6: purchase requests

Implemented warehouse-scoped purchase requests with backend PR references, catalog and free-text lines, quantities, two-decimal estimates, department, required date and justification. Draft → submitted → approved/rejected, cancellation and explicit conversion retain records. Only drafts are editable. Editing, review and conversion require `expectedUpdatedAt`; a stale document returns 409 before changing it.

`/api/purchase-requests` supplies paginated list/create/detail/update, submit/approve/reject/cancel and convert endpoints. Permissions are purchase_requests.VIEW/CREATE/EDIT/APPROVE/CONVERT. Warehouse Staff receives VIEW/CREATE/EDIT, Inventory Manager also APPROVE, Procurement Officer all five, Viewer VIEW. Conversion additionally requires purchasing.CREATE. Submission notifies active administrators and warehouse-assigned approvers. Decisions notify the requester within warehouse scope.

Conversion is an explicit confirmation action. Every approved line must map once to a distinct active catalog product; existing catalog choices cannot be replaced. Free-text items require a catalog mapping. Quantities come from the approved request; the user confirms supplier, unit costs, delivery, tax and shipping. The request/PO relationship and CONVERTED state are saved in the same transaction as the draft PO, with audit records. No approval action automatically orders or changes stock. Competing conversions create one PO. The existing PO service exposes its transaction implementation for reuse without nesting independent commits. Currency overflow is rejected before a write.

Procurement → Purchase Requests provides server pagination/filtering, create/edit, review notes and approval, rejection/cancellation, and PO conversion. The UI displays estimates to two decimal places. Migration `20261001_purchase_requests` adds tables and permissions without modifying existing inventory or orders; the identifier sorts after the prior feature migrations.

Verification: 63 tests pass across eleven files, covering mixed item types, validation, stale review, immutable submission, no automatic ordering, invalid mapping/overflow rollback, competing conversions, rejected/cancelled records, backend permissions and warehouse scope. Prisma generation, frontend build, diff check and health checks pass. Browser verification created a mixed request, submitted/approved it and explicitly created a linked draft PO, then confirmed persistence after reload without console errors. Original records remain 16 products/5 purchase orders with no synthetic requests inserted there.

## Phase 7 checkpoint: RFQs and supplier quotations — unfinished

Schema and migration `20261002_rfqs`, permissions, validators, services, controllers and routes are written. RFQs retain requested catalog/free-text item snapshots, invited suppliers, workflow timestamps, and a manual award with reviewer and selection notes. Draft supplier quotations record prices, specifications and terms; submitted offers are immutable. Comparison includes submitted offers without choosing a winner. Awarded quotation conversion creates a linked draft PO transactionally, preserving the PR → RFQ → quotation → PO relationships. The server calculates currency with decimal arithmetic. A purchase request with an active RFQ cannot also convert directly or cancel independently.

Frontend RFQ list/create/detail, quotation create/edit/detail, comparison, manual award and conversion dialogs are written and routed. Navigation is permission-aware. Approved requests link to their active RFQ or offer RFQ creation. Inventory Manager seed permissions match the RFQ migration.

**Not finished:** dedicated RFQ/quotation business-flow, permission and concurrency tests; browser verification; migration application to the original development database and the persistent UI test schema; API restart and new health verification. The RFQ migration has passed application in disposable schemas, but this does not verify RFQ business rules. The API processes were stopped for Prisma generation and remain stopped at this checkpoint. The latest client/schema expects the RFQ tables, so apply the pending migration safely before restarting the API; this also affects purchase-request detail reads.

Checkpoint verification on 2026-09-30: frontend production build passes (2,479 modules); ordinary backend tests have 24 passing tests with 41 live tests skipped; `npm run test:integration` passes all 65 tests across 12 files in a newly created disposable MySQL schema, including migration application and cleanup. No RFQ-specific tests exist yet. The staged whitespace check reports trailing blank lines in three migration files; their SQL is retained unchanged to preserve already-applied migration checksums. The expansion is not a declaration of production readiness.

See [unfinished-work handoff](unfinished-work-context.md) for the next actions and remaining phases.
