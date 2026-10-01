# Legacy inventory import — 2026-10-01

The owner-authorized category/product import from `C:\Users\King\Documents\dumps\Dump20261001` is complete in the currently configured TechStock database, `railway`. This is a data import; it does not complete the advanced-features expansion or its pending browser/deployment acceptance.

The source `inventory_system` database was not changed. Its 18 SQL dump files remain unchanged, with byte-identical retained copies. The import did not execute legacy schema SQL against TechStock or reuse the legacy migration ledger.

## Imported records

| Record | Verified result |
| --- | ---: |
| Categories | 13 |
| Products | 136 |
| Units at Cybence IT Solutions | 479 |
| Existing product barcodes retained | 134 |
| Recorded serial numbers registered | 19 |
| Positive opening balances | 134 |
| Explicit zero balances | 2 |

Every product has a warehouse balance at **Cybence IT Solutions**, including Romoss KC12 Powerbank and Biostar B450M Motherboard, whose source quantities are zero. The two zero balances use audited, zero-quantity corrections; no units were added. Product costs, thresholds, category relationships, recorded brand/model custom fields, barcodes and descriptions were checked against the parsed dump. Distinct legacy records remain distinct even when their names match.

All source SKUs were empty. New SKUs use `CYB-LEGACY-` followed by the six-digit legacy item ID. Source IDs and timestamps remain in product notes and the private mapping report; new TechStock timestamps identify this import rather than claiming to reproduce old purchase events.

Eleven brands come from explicitly recorded legacy custom fields. Products without such a recorded manufacturer use **Unspecified (legacy)**. Original product names and custom fields remain available; names alone were not used to assert a manufacturer. The initial import retained original category names and source classifications. The owner subsequently requested the five placeholder names be replaced as recorded below.

**Shopee (seller unspecified)** is the default supplier/source record, based on the owner's marketplace information. Seller contacts, addresses, invoices, tax details and payment terms remain unknown. No purchase orders or receipts were invented. The dump contains zero purchase orders and receipts; its other legacy tables and historical logs are retained in the source archive.

The recorded `costPrice` maps to purchase cost. Old retail prices and all 136 retail pricing records remain historical information in product notes and retained source data. They are not substituted for purchase cost. The recorded inventory value is **319,016.99**, without currency conversion; iNEXION's recorded zero cost remains zero and is marked unconfirmed. The dashboard's low-stock results reflect the retained source thresholds.

## Category names updated after owner review

| Imported name | Current name |
| --- | --- |
| Category 13 | Power Supplies & Batteries |
| Category 16 | Keyboards & Cameras |
| Category 19 | Cables & Adapters |
| Category 20 | Storage & Audio Accessories |
| Category 21 | Cooling & Gaming Accessories |

Names describe the actual mixed product groups. Category descriptions and slugs were updated through the existing audited catalog API. Category IDs and all product assignments remain intact. Complete before/after product, stock, serial and movement fingerprints match; 136 products, 13 categories and 479 units remain. Live category listing, product category display and dashboard checks pass. Evidence is retained in `backend/.test-runtime/category-renames-20261001-40b82b61/`.

The original import reports and plan describe the initial import and remain historical evidence. The completed one-off importer exits without replaying the old category names. Use current category slugs from TechStock for future product imports.

## Serial reconciliation

Legacy balances were established before enabling serial tracking on the 19 products with recorded serials. The existing validated **SerialNumbers** preview/confirmation workflow then registered existing units, with `HISTORY_STARTED` provenance and unknown earlier receipt, custody and warranty history. It did not add stock. Serial warranty dates and purchase/receipt relationships remain null.

Seven products have incomplete serial lists:

| Product | Units | Known serials | Missing serials |
| --- | ---: | ---: | ---: |
| Asus Marshmallow Mouse | 4 | 1 | 3 |
| KingSpec RAM | 5 | 1 | 4 |
| Vention Echo Lite | 3 | 1 | 2 |
| ASUS Laptop Charger | 6 | 1 | 5 |
| HP Laptop Charger | 4 | 1 | 3 |
| Acer AC550 Modular PSU | 6 | 1 | 5 |
| Acer AC1000 Modular PSU | 3 | 1 | 2 |
| Total | 31 | 7 | 24 |

These 24 units need physical serial reconciliation before operations requiring their serial identities. No replacement serials or warranty dates were generated. Products with no recorded serials remain untracked; their source data does not establish whether every physical unit has a manufacturer's serial.

## Evidence and recovery material

Private local evidence is under `backend/.test-runtime/legacy-import-20261001/`, which is ignored by Git:

- `pre-import.sql`: full destination backup with all 67 tables, 143,401 bytes; SHA-256 `8ab15aaacfbf88ccc136c72c79d5bdc8b6ed40471c9ddf75cac5ced0b95a082f`.
- `backup-manifest.json`, `baseline.json`, `retained-source-manifest.json` and `source/`: backup/table baseline and original dump copies with verified hashes.
- `plan.json`, `progress.json`, `zero-balances.json` and the individual serial CSVs: source-to-destination mapping and resumable operation references.
- `verification.json` and `imported-products.csv`: complete per-product verification and a readable inventory report.

Writes used the running Express API and its existing validation, permissions, business services, Prisma transactions and audits. Opening references and unique SKUs prevent a resumed importer from adding quantities a second time. The original administrator and existing roles/permissions, warehouse and supplier masters were retained. Unrelated purchasing, reservation, transfer, asset, maintenance and claim record counts stayed unchanged.

Final checks verified all product fields and category/supplier/warehouse relationships, exact costs and balances, movement reconciliation, 19 serial backfill batches and serial events, null warranty/receipt provenance and unchanged source hashes. Both product pages, categories, warehouse inventory, serials, global and warehouse-filtered dashboard totals, category distribution, and public/admin health endpoints returned HTTP 200. Browser automation was unavailable in this session, so these checks establish API/database persistence rather than visual acceptance.
