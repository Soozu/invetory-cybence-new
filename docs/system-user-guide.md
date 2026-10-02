# TechStock Inventory — Complete User Guide

**Prepared:** October 2, 2026

**Application:** https://inventory.cybenceitsolutions.com
**Audience:** Administrators, inventory managers, warehouse staff and viewers

This guide describes the current application screens and business workflows. The menus and actions you see depend on your role, action permissions, warehouse assignments and each document's status. Deployment configuration can also affect features such as file uploads and backups. Example quantities and references below are illustrations, not records to create in your live inventory.

## Contents

1. [Getting started](#1-getting-started)
2. [Dashboard and everyday navigation](#2-dashboard-and-everyday-navigation)
3. [Products, categories and brands](#3-products-categories-and-brands)
4. [Stock management and recording sold items](#4-stock-management-and-recording-sold-items)
5. [Stock conditions](#5-stock-conditions)
6. [Physical stock counts](#6-physical-stock-counts)
7. [Reservations and issuing stock](#7-reservations-and-issuing-stock)
8. [Scanning, labels and serial numbers](#8-scanning-labels-and-serial-numbers)
9. [Warehouses and stock transfers](#9-warehouses-and-stock-transfers)
10. [Procurement](#10-procurement)
11. [Asset management](#11-asset-management)
12. [Monitoring](#12-monitoring)
13. [Attachments and CSV imports](#13-attachments-and-csv-imports)
14. [Reports and report schedules](#14-reports-and-report-schedules)
15. [Users, roles, activity and settings](#15-users-roles-activity-and-settings)
16. [Profile, preferences and sessions](#16-profile-preferences-and-sessions)
17. [System administration](#17-system-administration)
18. [Daily operating checklist](#18-daily-operating-checklist)
19. [Troubleshooting and current limits](#19-troubleshooting-and-current-limits)

## 1. Getting started

### Sign in

1. Open the application address above.
2. Enter the email and password supplied by your administrator.
3. Sign in and wait for the workspace to load.
4. Open your profile menu and change a temporary password before regular use.
5. Check that the expected warehouses and menus are visible.

Passwords must be at least 10 characters and fit within 72 UTF-8 bytes. Five unsuccessful password attempts temporarily lock an account for 15 minutes. An administrator can clear a temporary lockout from Sessions.

### Understand access

- **Role permissions** control which modules and actions you can use.
- **Warehouse access** controls which warehouse stock and related documents you can see or change.
- An administrator can access all warehouses. Other users need explicit assignments.
- A non-administrator without warehouse assignments may see shared catalog information but have no warehouse stock access.
- A default warehouse is a convenience setting; it does not grant access to additional warehouses.
- Approval, issuing, receiving and editing can require different permissions. Seeing a document does not necessarily allow every action.

For a missing menu or warehouse, ask your administrator to review both your role and warehouse assignments.

### Understand inventory quantities

| Term | Meaning |
| --- | --- |
| On hand / Physical | Units recorded as physically held in warehouse inventory |
| Unavailable / Reserved | Units held for reservations, conditions or other controlled workflows |
| Available | Physical quantity minus unavailable quantity |
| Company asset | Equipment registered into the company asset pool, separate from warehouse stock |
| In transit | Units shipped between warehouses but not yet accounted for at the destination |

**Example:** 10 physical units with 3 unavailable units means 7 available units. Do not subtract reservations and condition holds again from the available total.

## 2. Dashboard and everyday navigation

### Dashboard

Use **Overview → Dashboard** for current totals, stock warnings, movement charts and recent activity. Where shown, select the warehouse and period you want to review. Stock totals are current; a chart's date period does not turn current stock into a historical balance.

If cards or sections are hidden, review **Profile menu → My Preferences**. Company-level catalog or supplier counts can differ from warehouse-level inventory totals.

### Search and quick actions

- Press **Ctrl + K**, or click **Search anything**, to find products, serials, suppliers, assets and procurement documents.
- Enter at least two characters. Search by SKU, serial, asset tag or document number when possible.
- Choose a result to open its record. Search results follow your current permissions.
- **Quick add** offers permitted shortcuts such as adding a product, creating a purchase order, adjusting stock or adding a supplier.
- The bell opens in-app notifications. Select an item to open its related page, or mark notifications read.
- Use the sun/moon control to change the visual theme.
- On a narrow screen, open the navigation menu to reach the same modules.

### Forms and document numbers

Use real product identities, exact warehouses and meaningful references. For example, put an external order number in a sale adjustment's reference field. Many workflows generate their own document number automatically; an external reference supplements that number.

If a form reports that the record changed, use its reload action, review the current values and submit again. Do not repeatedly confirm an old form or create a duplicate document to bypass the conflict.

## 3. Products, categories and brands

### Categories and Brands

1. Open **Inventory → Categories** or **Inventory → Brands**.
2. Search for an existing entry before creating another.
3. Use the available add/edit controls to maintain its name and other displayed fields.
4. Save, then select that category or brand when creating products.

These are catalog classifications. Renaming a category does not add, remove or transfer stock. Historical usage may prevent deletion or require archival instead.

### Add a product

1. Open **Inventory → Products** and select **Add Product**.
2. Enter the product name, unique SKU, category and brand.
3. Add the model, description and barcode if known.
4. Set the unit and stock thresholds: minimum, maximum and reorder point.
5. Enable **Track serial numbers** only when individual units should be identified.
6. Enter the purchase cost, default supplier and warranty period where applicable.
7. Optionally upload a product image: PNG, JPG or WEBP, up to 800 KB.
8. Select **Save Product**.

Creating a product creates a catalog record. Add its stock through receiving, an appropriate opening-stock import or an audited stock adjustment.

### View or edit a product

Search the Products page by name or SKU, open the product and review its available detail tabs. Use **Edit Product** to correct catalog fields. Use **Adjust stock** or the receiving workflow to change quantities.

Purchase cost supports inventory valuation; it is not a customer selling price or a sales payment record. Changing purchase cost affects current-cost valuation reports.

## 4. Stock management and recording sold items

### Make an adjustment

1. Open **Inventory → Stock Management**.
2. Click **Adjust** on a product, or select **New adjustment**.
3. Select the product and the warehouse physically affected.
4. Choose the adjustment type.
5. Enter the quantity, reason and any reference or supporting notes.
6. For a serial-tracked product, enter the exact serial numbers required for the units added or removed, one per line.
7. Click **Save adjustment**.
8. Check the updated balance and **Monitoring → Stock Movement**.

The quantity shown beside a product can include multiple accessible warehouses. The warehouse selected in the form determines which balance changes.

| Adjustment type | How to enter quantity | Effect |
| --- | --- | --- |
| Stock In | Positive units being added | Increases warehouse stock |
| Stock Out | Positive units being removed | Decreases warehouse stock |
| Correction | The new total physical count | Sets that warehouse/product balance to the submitted total, subject to holds and serial rules |
| Damage | Positive units physically removed | Decreases physical stock; use Stock Conditions for damaged units still physically held |
| Return | Positive units being added back | Adds stock subject to eligibility and serial uniqueness rules |
| Opening Stock | Positive starting units | Records an opening adjustment; use only an appropriate initial-stock workflow |

Stock removals cannot consume protected reservations, condition holds or more eligible units than are available. The server validates the selected serial identities.

### Example: two units sold

For two nonserialized units of the same product:

| Field | Example |
| --- | --- |
| Product | The exact SKU sold |
| Warehouse | The warehouse that supplied the items |
| Adjustment type | Stock Out |
| Quantity | `2`, not `-2` |
| Reason | `Sold 2 units` |
| Reference number | Your actual order or receipt number |
| Notes | Useful delivery or transaction context |

Save the adjustment. A physical balance of 10 becomes 8. If two different products were sold, make one adjustment for each product's quantity.

**Serial-tracked sale limitation:** the current generic Stock Out adjustment marks removed serials **Disposed**, not Sold. It does not create a sales invoice, customer balance or payment. Review this meaning before using it for serialized sales. The Reservations → Issue stock workflow records serials as **Issued**, but is an inventory issue workflow, not a dedicated sales module. See section 7.

### Customer returns

Confirm the actual product, quantity and inspected condition before adding returned stock. A generic Return adjustment is not a dedicated customer-return/refund process. Previously registered serials cannot simply be registered again as new units. Ask an administrator to review the appropriate lifecycle workflow for an already-issued or disposed serial.

Do not record the same delivery or sale twice through both receiving/issuing and a manual adjustment.

## 5. Stock conditions

Use **Inventory → Stock Conditions** when units remain physically in the warehouse but should not be available for normal use.

1. Find the product/warehouse balance.
2. Click **Change**.
3. Select **From condition** and **To condition**.
4. Enter **Units to change**.
5. Enter the **Reason / inspection result**.
6. For serialized units, select the exact eligible serials.
7. Select **Save condition change**.

Available, Quarantine, Defective and For Repair describe controlled stock conditions. A condition change preserves physical quantity and changes availability. For example, moving 2 of 10 available units to Quarantine leaves 10 physical and 8 available.

Return Pending is controlled by supplier returns. Reservation holds are controlled by reservations. The condition form cannot release those unrelated holds. Use inspection evidence when returning a unit to Available.

Review the condition history to see previous and new balances, actor, reason and selected serials. Use **Reload balance** if someone changed the balance while your form was open.

## 6. Physical stock counts

Use **Inventory → Stock Counts** to reconcile a physical count with a recorded snapshot.

1. Select **Create count**, choose the warehouse and add notes.
2. Open the new count and select **Start count**. This captures the expected quantities and serial identities.
3. Count the physical units for each product.
4. Enter the counted quantity. For serial-tracked products, record the exact observed serials, one per line, using the available scan/input controls.
5. Explicitly confirm zero units when none are physically present; a blank entry is not a completed zero count.
6. Select **Save counts** before changing pages.
7. Review variances and select **Submit for review**.
8. An authorized approver reviews the results and selects **Approve corrections**.

Typical progression: **Draft → In Progress → Submitted → Approved**. Cancellation retains the count record.

Approval applies audited corrections; entering or submitting counts alone does not change stock. Missing serials become Missing, and discovered/recovered serials follow reconciliation rules. Holds cannot be removed casually through counting.

If stock, holds or serial state changed after the snapshot, approval can reject the count as stale. Cancel the stale count and start a fresh one after reviewing the changes. Coordinate warehouse activity during a physical count to reduce this problem.

## 7. Reservations and issuing stock

Use **Inventory → Reservations** to hold units for a project, installation or deployment and issue them later.

### Reserve

1. Select **Reserve inventory**.
2. Choose the warehouse.
3. Add a reference type, actual reference and notes. Set an expiry if required.
4. Choose stocked products and quantities from the available stock list.
5. For serialized products, enter exact serials, one per line, or allow the backend to select available units.
6. Review the lines and select **Reserve stock**.

Reservation reduces available stock but leaves physical stock unchanged. Example: reserve 2 from 10 physical units; the balance is now 10 physical and 8 available.

### Issue reserved units

1. Open the reservation detail.
2. On the relevant line, select **Issue stock**.
3. Enter the quantity being physically issued now.
4. For serialized units, enter the exact reserved serials being issued, or use the supported remaining selection.
5. Review and confirm the action.

Issuing reduces physical stock and the matching reservation hold. Serialized units become **Issued**. Partial issue leaves the unissued quantity reserved.

### Release or cancel

- **Release remaining** frees units no longer needed without removing physical stock.
- **Cancel reservation** closes the reservation according to its current state and retains history.
- Expiry prevents further issue after the deadline; the worker releases remaining holds when it processes expiry.
- Already issued units are not automatically returned by release, cancellation or expiry.

An issue is not a company asset custody assignment. Register an asset and use its custody workflow for equipment that remains company-owned.

## 8. Scanning, labels and serial numbers

### Scan & Labels

1. Open **Inventory → Scan & Labels**.
2. Scan a barcode/QR identifier with a USB scanner, or type the barcode, SKU, serial or asset tag.
3. Submit with Enter.
4. Review the result and select **Open record** or **Print label**.

Scanning resolves an existing identifier; it does not itself receive, sell or remove inventory. No accessible match can mean the identifier is wrong, the record is absent or your permissions hide it. Normal text fields retain their ordinary typing behavior.

### Print labels

1. Open **Print label** from a supported record or scan result.
2. Choose **QR code** or **Code 128 barcode**.
3. Choose the layout: 40 × 30 mm, 50 × 25 mm or an A4 sheet.
4. Enter the number of copies, from 1 through 100.
5. Wait for the label preview to finish generating.
6. Select **Print labels** and print at 100% scaling.

Use QR for long or non-ASCII identifiers. Print and scan one sample before a batch. Authorized users can generate a missing product barcode. Labels contain identifiers, not a copy of all business data.

### Serial Numbers and lifecycle

1. Open **Inventory → Serial Numbers**.
2. Search the exact serial or product and filter by status if needed.
3. Select the serial or **View lifecycle**.
4. Review its current status, warehouse, supplier, procurement links, warranty dates, asset custody and event timeline.

Use receiving, reservations, transfers, counts, conditions and assets to perform their corresponding physical changes. A serial-status control is not a replacement for those business documents. Protected, held, asset-owned or in-transit serials can reject independent status changes.

Unknown history or missing receipt/warranty information means no reliable record is available. Do not invent earlier receipt dates or serial identities.

## 9. Warehouses and stock transfers

### Warehouses

Open **Inventory → Warehouses** to view balances, warehouse details and related history. Administrators can use **Add warehouse** to create a location with its name, address/location and manager. Assign user access separately through Users.

A product's primary warehouse is a display convenience. Inspect the actual warehouse balance before making an adjustment or shipment.

### Transfer stock

1. Open **Inventory → Stock Transfers** and use its transfer creation control.
2. Choose the product, source warehouse, destination warehouse, quantity and notes.
3. Create the transfer and submit/request approval using the available action.
4. An authorized source operator approves the transfer.
5. At physical shipment, record the shipped quantity and exact serial selection where applicable, then confirm shipment.
6. Open the transfer detail at the destination and select **Record arrival**.
7. Enter the quantities/serials that actually arrived in good or damaged condition. Record unexpected items if present.
8. Confirm the arrival. Record later arrivals separately when the delivery is partial.

Creating or approving a transfer does not mean the destination has received stock. Shipment removes units from the source; recorded arrival adds the accounted units at the destination. Damaged arrivals are quarantined.

Source access is required for source actions; destination access is required for receiving. A user can see a transfer through either accessible endpoint without gaining unrestricted access to the other warehouse.

### Discrepancies

Use the transfer's discrepancy panel to investigate missing, damaged or unexpected units:

- Add investigation notes and evidence.
- Record physically recovered units and their inspected condition.
- Confirm genuinely lost units after investigation.
- Record a physical return to the source where appropriate.
- Acknowledge damaged units while retaining quarantine.
- Record the return or documented disposition of unexpected units.

Use **Resolve discrepancy** only for the supported real outcome. A missing unit is not available destination stock. An unexpected observation does not automatically create a registered serial or ordinary stock. Review outstanding, received, lost and returned quantities before closing the transfer.

## 10. Procurement

There are two common paths:

```text
Direct order: Supplier → Purchase Order → Approval → Receiving
Sourced order: Purchase Request → Approval → RFQ → Quotations → Award → Draft PO → Approval → Receiving
```

Only physical receiving adds purchased units to stock. Requests, quotations, awards and order approval document intent and decisions.

### Suppliers

1. Open **Procurement → Suppliers**.
2. Search before adding another supplier.
3. Select **Add Supplier** and enter the company, contact details and available payment/tax fields.
4. Save and open the supplier to review its orders and related information.
5. Use **Create PO** when buying from that supplier.

Use attachments for actual supporting contracts or supplier documents. A supplier selection does not send the supplier a message.

### Purchase Requests

1. Open **Procurement → Purchase Requests** and create a request.
2. Enter the department, receiving warehouse, required date and justification.
3. Add catalog products or free-text requested equipment, quantities and estimated unit costs.
4. Select **Save draft request**.
5. Review and select **Submit for review**.
6. An authorized reviewer selects **Approve request** or **Reject request**, recording review notes.
7. For an approved request, choose **Create RFQ** or **Convert to draft PO** as appropriate.

Conversion needs an actual supplier, catalog mappings for free-text items and confirmed costs. The result is a draft purchase order, still subject to its own review and approval. Cancellation preserves the request history.

### RFQs & Quotations

1. Create an RFQ, optionally from an approved purchase request.
2. Choose the receiving warehouse, requested items, quantities, closing time and invited suppliers using the available form.
3. Save the draft and select **Issue RFQ** when reviewed.
4. Obtain supplier offers outside the app, then select **Record quotation**.
5. Select the invited supplier and record its reference, dates/validity, lead time, payment terms, offered prices, brands/models and item notes. Enter tax/shipping where the form provides them.
6. Save and **Submit quotation** so it is eligible for comparison.
7. Open **Compare quotations**, check total cost and the actual offered terms, and select a quotation.
8. Enter the selection reason and **Confirm manual award**.
9. Select **Convert awarded quotation to PO**, map any free-text equipment and review the resulting draft PO.

The app records RFQ and supplier decisions. Issuing an RFQ does not automatically email suppliers, and comparison does not automatically choose the cheapest offer. Review offered specifications, validity and delivery terms. Use Close/Cancel only when appropriate to the displayed state.

### Purchase Orders

1. Open **Procurement → Purchase Orders → Create Purchase Order**, or open a draft created by conversion.
2. Choose the supplier, destination warehouse, expected delivery and external reference.
3. Add product lines with quantities and unit costs; review tax/shipping and total where shown.
4. Select **Save Draft** for further review or **Submit Purchase Order** to request approval.
5. Open the order and use **Submit for approval** if it is still a draft.
6. An authorized approver selects **Approve order**.
7. Use **Receive items** when goods actually arrive.

An approved order is incoming procurement coverage, not on-hand inventory. Avoid creating a second order for the same need when an existing request, award or order already covers it.

### Receiving

1. Open **Procurement → Receiving** and select the relevant open PO.
2. Verify the supplier, warehouse and product lines.
3. Enter quantities delivered in this receipt, not the original ordered quantities unless the full balance arrived.
4. For serialized lines, enter one unique actual serial per received unit.
5. Check the remaining order quantities and confirm receiving through the form's action.
6. Review the recorded receipt, increased stock and serial records.

Partial receiving leaves the remaining quantity open. Receiving creates stock and procurement history; do not add the same units again through Stock In. Open receipt links from the order or global search to inspect a specific receipt and attach its evidence.

### Supplier Returns

1. Open **Procurement → Supplier Returns → Create return**.
2. Find and select the exact original receipt.
3. Choose the items, quantities, return reasons and observed/source stock conditions.
4. Select exact eligible serials for serialized items.
5. Select **Save draft return**.
6. Open it and select **Submit and hold stock**.
7. An authorized reviewer selects **Approve return**.
8. When the units physically leave, select **Confirm physical shipment** and record shipment evidence/reference.
9. Later, select **Record supplier outcome** and enter the real outcome/notes.

A draft does not hold stock. Submission holds eligible units; physical shipment removes them. Recording an outcome does not receive a replacement, add refunded cash or automatically create another PO. Before shipment, cancellation follows the permitted state and releases the return's hold. Already shipped goods cannot be undone by casually cancelling the document.

### Reorder Suggestions

1. Open **Procurement → Reorder Suggestions**.
2. Select the warehouse and search/filter products.
3. Review available units, reorder thresholds, planned requests/orders and incoming approved quantities.
4. Open existing source PR/PO links when coverage already exists.
5. For an uncovered suggestion, choose a request or order action, provide its reason and supplier when required, and confirm creation.
6. Review the resulting draft through the regular procurement workflow.

Suggestions use thresholds and recorded coverage, not demand forecasting. They create drafts only; they do not submit, approve or receive goods automatically. Reload stale suggestions before creating a document.

### Supplier Performance and Purchase History

- **Supplier Performance:** choose the date window and optional warehouse/supplier. Review receipt completion, on-time results, return rates and source orders. No data means insufficient recorded evidence, not a perfect or failed rating.
- **Purchase History:** search/filter retained purchase orders and open them to inspect original lines, statuses and receipts. Historical status does not replace physical receiving evidence.

Performance uses PO order dates and actual recorded receipts/shipped returns through the selected window. Rates depend on their displayed sample sizes and recorded promised dates.

## 11. Asset management

Company assets are equipment retained for company use. They have custody and service history separate from ordinary warehouse stock.

### Assets: register equipment

1. Open **Asset Management → Assets → Register asset**.
2. Choose the product and source warehouse.
3. For a serialized product, choose its exact available serial.
4. Add registration notes and confirm registration.
5. Open the resulting asset record.

Registration consumes one available warehouse unit and moves it into the company asset pool. Do not register the same physical device again. Registration alone does not assign a custodian.

### Assigned Equipment: custody

From the asset detail:

1. Select **Assign custody** for an available asset.
2. Enter the custodian name, department, location, condition on issue and evidence/notes.
3. Confirm and check **Assigned Equipment** for active custody.
4. To change custodians, use **Hand over custody**, recording the previous return inspection and new custody details.
5. When the asset returns, select **Return custody** and record its return inspection.
6. Choose the inspected disposition: Available or Quarantine.

Return disposition defaults conservatively to Quarantine in the current form. Choose Available only when inspection supports it. A custody return stays within the company asset pool; it does not add warehouse inventory.

Use **Inspect and release** where offered to clear an eligible quarantined asset after inspection. **Retire asset** and **Dispose asset** are terminal lifecycle actions, not sales or ordinary custody returns. Record evidence and verify the physical outcome before confirming.

### Warranty Tracking

Open **Asset Management → Warranty Tracking** to search recorded serial/equipment coverage and expiration dates. Use **Monitoring → Expiring Warranty** for the expiring subset. Unknown dates are not proof that a supplier warranty exists.

Warranty coverage is separate from claims. Use exact serial and procurement evidence when opening a claim.

### Maintenance Records: corrective service

1. Open the asset and select **Schedule corrective service**.
2. Enter the issue, technician if known, estimated cost and service date.
3. Open **Asset Management → Maintenance Records** and find the scheduled record.
4. Select **Start service** when work actually begins.
5. On completion, select **Complete service**, record the actual cost, final inspection and evidence.
6. Choose Available or Quarantine based on inspection.

Scheduling is not completion. Repair can retain custody and controlled holds. Cancelling service does not automatically prove an asset is safe to use; inspect its resulting state before assigning it.

### Preventive Maintenance

1. Open an eligible asset and select **Create preventive plan**.
2. Enter the plan title, service instructions, interval in days and next due date.
3. Open **Asset Management → Preventive Maintenance** to review active/due plans.
4. Select **Schedule occurrence** for the actual due service.
5. Start and complete that service through Maintenance Records.
6. Confirm the next due date after actual completion.

The next due date advances from completion time. A due plan does not automatically perform maintenance. Use Edit, Pause, Resume or Cancel plan where offered; existing service records remain retained.

### Warranty Claims

1. Open **Asset Management → Warranty Claims → Create warranty draft**.
2. Search the exact serial or asset tag and select an eligible source.
3. Review the supplier, receipt/PO, asset and recorded coverage; enter the warranty issue and evidence.
4. Create the draft, review it and submit when ready.
5. Record the supplier's actual acceptance or rejection using the permitted action.
6. Acceptance requires a recorded supplier/provider reference.
7. Resolve an accepted claim with the real outcome: Repaired, Replaced, Credit or Unrepaired.
8. Link a supporting completed service or physically shipped supplier return when appropriate and available.

Only one active claim can exist for an eligible serial. Missing/changed provenance or invalid coverage can block a claim. Closed claims remain in history.

**Claim outcomes record supplier evidence only.** A Repaired outcome does not release quarantine. Replaced does not create a replacement serial or stock. Credit does not record a payment. Perform inspection, replacement receiving, supplier return and procurement in their own workflows.

## 12. Monitoring

| Menu | How to use it |
| --- | --- |
| Low Stock | Review products nearing their configured thresholds; inspect the affected warehouse and existing procurement coverage |
| Out of Stock | Review products with no available inventory; check whether physical units are held or procurement is outstanding |
| Expiring Warranty | Review upcoming/expired recorded coverage; open equipment details before contacting suppliers |
| Stock Movement | Search references/products, filter the movement type and inspect signed quantity changes, warehouses and processor |

Stock Movement provides an audit trail of physical changes. Positive quantities add inventory; negative quantities remove it. Zero-quantity events can describe condition changes or serial reconciliation without changing physical totals. Use its CSV export for the displayed history available to your account.

## 13. Attachments and CSV imports

### Attachments

Use **Management → Attachments**, or a supported record's attachment panel.

1. Choose the record type and exact source record.
2. Upload the supporting file and wait for success.
3. Review its filename/date/uploader and download it to confirm the intended evidence.
4. Archive a document only when appropriate, entering the requested reason.
5. Include archived documents in the view and restore one with a reason when needed.

Supported records: Product, Supplier, Purchase Request, RFQ, Supplier Quotation, Purchase Order, Purchase Receipt, Supplier Return, Stock Transfer, Asset, Maintenance Record and Warranty Claim.

The current configured allowance is PDF, PNG, JPG/JPEG, WEBP, DOCX and XLSX, up to 10 MB. File content must match its format; protected/macro-enabled or unsupported Office documents can be rejected. XLSX can be an attachment even though it is not an import format.

Permissions must allow both the attachment action and its source record. Archived attachments retain their bytes but cannot be downloaded until restored. Private documents are downloaded through authenticated routes, not public filesystem links. Product images are a separate upload facility.

### CSV Imports

1. Open **Management → CSV Imports**.
2. Select the import type.
3. Select the intended warehouse for warehouse-based imports.
4. Select **Download CSV template** and use the provided reference-code directories.
5. Fill the template with real values. Preserve header names and exact reference codes.
6. Save as UTF-8 CSV. From Excel, export a CSV; uploading an Excel workbook is not supported for import.
7. Upload and generate the preview.
8. Review every row, errors and totals. Fix errors in your file or use explicit revalidation where appropriate.
9. Supply the confirmation reason and select **Confirm import** only after review.
10. Review the result and linked records. Download rejected-row CSV when offered.

| Import type | What confirmation does |
| --- | --- |
| Products | Creates catalog records without stock |
| Suppliers | Creates supplier records with supplied unique codes |
| OpeningStock | Adds initial stock to an eligible unused warehouse/product pair |
| SerialNumbers | Registers serial identities for eligible existing physical units; does not add units |
| Assets | Registers company equipment and consumes one available warehouse unit per row |

Limits: 1 MB per CSV, 100 data rows and a 24-hour preview lifetime. Serialized opening-stock rows use semicolon-separated serials in the template field. An invalid row prevents the confirmed batch from being applied; preview alone does not create business stock or catalog records.

If references or balances changed after preview, revalidate and review the new revision before confirmation. Existing inventory must not be imported again as opening stock. For already-imported units with missing serials, use the eligible SerialNumbers reconciliation import with actual device serials; do not invent serials or add the quantities again.

## 14. Reports and report schedules

### Generate and export a report

1. Open **Management → Reports**.
2. Choose an available report type.
3. Set its supported warehouse, date and other filters.
4. Select columns and sorting, then review the generated page.
5. Move through pages to inspect more results.
6. Select **Export this page to Excel** or **Export this page to PDF** when permitted.

Exports contain the selected page and columns, not every record in the system. The backend obtains fresh export data, so a concurrent update can change a value between preview and export.

### Available report families

| Family | Reports |
| --- | --- |
| Inventory | Inventory Summary; Warehouse Stock; Inventory Valuation; Inventory Aging; Slow Moving Items; Fast Moving Items; Low Stock; Out of Stock |
| Inventory history | Stock Movement; Cycle Count Variance; Stock Adjustments; Transfer Discrepancies |
| Procurement | Purchase Requests; Requests for Quotation; Supplier Comparison; Supplier Purchases; Supplier Returns; Supplier Performance |
| Assets and warranty | Assets; Asset Assignment History; Asset Maintenance Cost; Warranty Coverage; Warranty Claims |

Your account must have report permission and access to the underlying source modules.

Interpret reports using their displayed basis:

- Valuation uses current physical units multiplied by current purchase cost, including unavailable units. It is not FIFO or historical accounting valuation.
- Aging measures time since the latest recorded positive movement, not the actual age of every unit or lot.
- Fast/slow movement counts negative Stock Out and Asset Assignment movements as demand. Transfers, corrections, damage, supplier returns and reservation issues are not included in that demand definition.
- Current-stock reports do not accept historical date filters.
- Supplier comparison does not provide an automatic supplier award.
- Undefined dates, rates or costs remain unknown.

### Save a configuration

Choose a name and **Save configuration** after setting the type, filters, columns and sorting. Later, select it to reuse those settings. **Update saved report** changes the current saved configuration; **Save as new** makes another one. Archive an unused configuration when appropriate.

Saved configurations store settings, not frozen report results. They belong to your account and recheck your current access when used.

### Report Schedules

1. Save a report configuration first.
2. Open **System → Report Schedules**.
3. Choose the saved report and **Every N days**, from 1 through 365.
4. Select **Create schedule**.
5. Review its next occurrence; the first run is after the chosen interval.
6. Use **Save interval**, **Pause** or **Enable** to manage it.
7. Select **View runs**, then **Read snapshot** on a completed run.

Snapshots contain at most the first 100 rows. No email delivery is configured. The backend worker must run, and account/source/warehouse permissions are checked again at generation and viewing. Updating a schedule sets its next occurrence from the update.

## 15. Users, roles, activity and settings

### Users

Administrators use **Management → Users** to create accounts and manage warehouse access.

1. Select **Add User**.
2. Enter the person's name, email, temporary password and role.
3. Select their permitted warehouses and a default from that selection.
4. Save and give the user their sign-in details through your normal secure process.
5. Ask the user to change their temporary password.

For an existing user, open its action menu and select **Manage warehouse access**. Review the assigned set and default, then save. Removing a warehouse assignment affects subsequent requests; selecting a default does not expand access.

Use only account actions actually offered for your role. Session administration is available separately under Sessions.

### Roles & Permissions

1. Open **Management → Roles & Permissions**.
2. Select the role to review its module/action matrix.
3. Enable only the actions required for that responsibility using the available permission controls.
4. Changes are saved automatically when you toggle a permission; review the result before continuing.
5. Check the role together with each user's warehouse assignments.

View, Create, Edit, Delete, Approve, Fulfill and similar actions are distinct grants. New permissions do not bypass warehouse scope. Administrator-only system operations remain administrator-only.

### Activity Logs

Open **Management → Activity Logs**, apply available filters and open an entry to inspect the actor, action, record reference, time and recorded before/after changes.

Older or uninstrumented events can lack field-level differences. That is retained history, not proof that nothing happened. Use document, movement, serial and custody histories for the detailed business sequence.

### Settings

Use **System → Settings** for the organization-wide fields the screen offers. Tabs include General Settings, Inventory Settings, Warehouse Settings, Notification Settings, User Permissions, Backup Settings and System Information.

Edit actual supported fields and select **Save Changes**. General fields include the company identity/contact details, currency and logo. Inventory fields include defaults such as minimum stock and the default warehouse. Permission and backup tabs may provide guidance or links to their dedicated screens rather than perform those operations directly.

Defaults and display settings do not rewrite existing stock. Backup guidance or a JSON/CSV export is not a complete SQL-and-files backup. Personal notification/dashboard choices belong under My Preferences.

## 16. Profile, preferences and sessions

### My Profile and password

Open the profile menu → **My Profile** to review account details and recent activity. Select **Change password**, enter the current password and confirm the new password. Save and sign in again when requested; password changes invalidate existing access.

### My Preferences

1. Open profile menu → **My Preferences**.
2. Select the in-app notification categories you want.
3. Choose a default accessible warehouse and date period for the dashboard.
4. Select visible cards/charts and move them **Earlier** or **Later**.
5. Select **Save preferences**.

You may deliberately hide all widgets. Disabled notification categories hide retained items and suppress their delivery; they do not delete business history. If a saved warehouse is no longer accessible, select a valid replacement.

### Sessions

1. Open **System → Sessions** or profile menu → **Sessions**.
2. Review the current and other devices, login time, last activity and expiry.
3. Select **Refresh** to reload and retry current-device public IP detection.
4. Use **Sign out** on an unwanted session or **Sign out other sessions** to retain only the current device.
5. Signing out the current session requires signing in again.

Administrators can select an account, revoke all sessions using the required confirmation and clear a temporary lockout.

**Public IP (device reported)** is optional browser metadata from an external lookup. **Connection IP (server observed)** is the address seen by the API/proxy. A localhost development address is not the public internet address. Public-IP reporting may fail independently of sign-in and can change with VPN/network changes.

## 17. System administration

The following screens are administrator-only. Report Schedules and self-service Sessions have their separate access rules described above.

### System Health

Open **System → System Health** and select **Refresh**.

| Indicator | Interpretation |
| --- | --- |
| API: available | The authenticated health request reached the API |
| Database: connected | The API's database check succeeded |
| Uptime | Time since this API process started |
| Environment | Runtime environment, normally production on Railway |
| Upload storage: available | Private attachment directory exists and is readable/writable |
| Upload storage: not_initialized | Configured private attachment directory does not exist |
| Upload storage: unavailable | Provider, path, permissions or directory validation failed |
| Worker | Whether background jobs are enabled |
| Background jobs | Recorded run/success/error state for each job |
| Last backup | Most recent managed backup record, if any |

An available storage folder does not prove a persistent volume is attached. A successful backup job poll also does not prove a backup was created; check the actual managed backup record.

### Railway storage setup

The backend needs a separate persistent volume mounted at `/app/.private-storage`. The MySQL service's `/var/lib/mysql` volume stores database files and remains attached to MySQL.

Backend variables:

```env
ATTACHMENT_STORAGE_PROVIDER=LOCAL
ATTACHMENT_STORAGE_DIR=/app/.private-storage/attachments
BACKUP_STORAGE_DIR=/app/.private-storage/backups
MYSQLDUMP_PATH=/usr/bin/mysqldump
MYSQL_PATH=/usr/bin/mysql
JOBS_ENABLED=true
BACKUP_INTERVAL_MINUTES=0
```

After mounting the volume, initialize directories if the deployed startup does not do so:

```bash
mkdir -p -m 700 /app/.private-storage/attachments /app/.private-storage/backups
```

Read-only diagnostic from the backend console's `/app` directory:

```bash
node --input-type=module -e 'import {storageRoot,storageStatus} from "./src/services/storageService.js"; console.log({directory:storageRoot(),volumeMount:process.env.RAILWAY_VOLUME_MOUNT_PATH||"No volume detected",...await storageStatus()});'
```

Expect volume mount `/app/.private-storage` and status `available`. Executable variables specify paths; the deployment image must actually contain compatible MySQL client tools. Check with `mysqldump --version` and `mysql --version`. Product images require separate persistence for the current public `uploads` directory.

Do not put database passwords or JWT secrets into this guide, frontend configuration or Git. Keep credentials in Railway's backend variables.

### Backups

1. Open **System → Backups**.
2. Confirm the page reports configured backup tools/storage.
3. Select **Create backup** and provide the displayed confirmation.
4. Wait for the worker to process the queued backup, then refresh.
5. Check overall status and both database/upload components. A Pending or Failed backup is not complete.
6. On a Complete backup, select **Verify files** and check the result.

Managed backups include the SQL dump, private attachments, public uploaded files and an integrity manifest. `BACKUP_INTERVAL_MINUTES=0` means manual requests only. Automatic backup intervals are configured by an operator from 60 through 10080 minutes and require workers.

Keep a protected off-host copy as part of your operations process. File verification checks integrity; a separately controlled recovery drill establishes restore readiness.

### Restore plans

Restoration is an administrator/operator recovery procedure:

1. Select a complete backup and verify files.
2. Create a restore plan for a **new** schema whose name starts with `techstock_restore_`.
3. Review and enter the exact confirmation phrase displayed by the plan.
4. An operator executes the returned `npm run backup:restore -- --plan <plan-id>` command in the backend environment.
5. Verify the restored database and files before any deliberate application cutover.

The website confirms the plan; it does not execute the database import. Plans expire after 30 minutes. Existing schema targets are rejected. Do not change the live database connection merely because a plan is confirmed. For full operator details, use the backend recovery runbook.

### Retention

1. Open **System → Retention**.
2. Review the saved policy, revision and eligible record counts.
3. Set supported notification, activity, backup and expired-credential age targets.
4. Select **Save policy**.
5. To archive manually, review the preview and select **Archive using saved policy**, entering the required confirmation.

Retention is controlled archival/cleanup, not an inventory reset. Notification and activity history is retained according to its archive behavior; automatic backup-byte deletion is disabled. The backup retention target is a review target, not proof that old files were removed.

### API Documentation

Open **System → API Documentation** to browse the protected OpenAPI specification and download JSON. Use it for implemented endpoint methods, permissions, bodies and error contracts. Administrator access and authentication are required.

The basic `/api/health` endpoint reports API/database readiness only. `/api/system/health` provides the administrator operational details, including attachment storage. API documentation describes contracts; it does not connect or initialize a storage volume.

## 18. Daily operating checklist

### Beginning of the day

- Sign in and review notifications, low/out-of-stock items and due maintenance.
- Check the relevant warehouses and unexpected holds.
- Review pending approvals, expected purchases and transfers in transit.
- Administrators review System Health, failed jobs and actual backup status.

### During operations

- Receive purchases against their real POs and exact delivered serials.
- Record sold or issued units once through the appropriate workflow.
- Reserve stock before a planned issue when a hold is needed.
- Use condition changes for units still physically held but unsuitable for use.
- Record actual shipments, arrivals, custody handovers and inspection results.
- Attach receipts, supplier evidence and service documents to the correct record.

### End of the day

- Review Stock Movement against physical activity and external order references.
- Investigate unexplained variances and transfer discrepancies.
- Review unfulfilled reservations, open receiving and overdue services.
- Generate/export the required report pages and review pending approvals.
- Confirm required backups reached Complete and passed verification.
- Sign out on shared devices.

## 19. Troubleshooting and current limits

| Problem | Next action |
| --- | --- |
| Missing menu or action | Check role/action permissions and document status |
| Empty warehouse stock | Check warehouse assignments, filters, physical balance and holds |
| Not enough available stock | Review reservations, quarantine, repair and return-pending quantities |
| Serial rejected | Verify exact product/warehouse, eligibility, quantity and existing lifecycle/ownership |
| Record changed / conflict | Explicitly reload, review current values and submit the updated form |
| Import preview rejected | Use the correct template/codes, fix each row and revalidate before confirmation |
| Upload not_initialized | Initialize the configured directory on the backend's persistent volume |
| Upload unavailable | Have an operator check the provider, directory, permissions and storage configuration |
| mysqldump/mysql missing | Deploy an image containing compatible MySQL tools; paths alone do not install them |
| Backup remains Pending | Check worker enablement and backup job errors; do not queue duplicates |
| Refresh shows Vercel 404 | Deploy the frontend revision containing the root `vercel.json` SPA fallback |
| Report missing or inaccessible | Check reports permission, native source permissions and warehouse scope |
| Schedule has no snapshot | Check its first/next occurrence, enabled state, worker, saved configuration and current access |
| Sign-in rejected repeatedly | Wait for lockout expiry or ask an administrator to clear the temporary lockout |

### Current scope to remember

- The app manages inventory/procurement/assets; it does not provide a complete POS, customer invoicing, payment, refund or profit-accounting workflow.
- Generic serialized Stock Out marks serials Disposed. Reservation fulfillment marks them Issued. Neither records a dedicated Sold status.
- CSV imports require UTF-8 CSV; XLSX import parsing is not implemented.
- Report exports cover one selected page. Scheduled snapshots cover up to 100 rows and are not emailed.
- Warranty outcomes are evidence records and do not perform replacement receiving, stock clearance or payments.
- Company asset returns do not restock warehouse inventory.
- Local file storage depends on durable deployment storage. An available folder alone is not a persistence check.
- Historical unknown serial/receipt/warranty information stays unknown until supported reconciliation is performed with actual evidence.
- This guide was checked against source screens and workflow documentation. It does not certify that every feature has passed production browser acceptance or that every pending local deployment change has been published.

## Related documentation

- [Attachments and CSV import details](attachments-and-imports.md)
- [Reports and preferences](reports-and-preferences.md)
- [Sessions and system operations](sessions-and-operations.md)
- [Repository setup](repository-separation.md)
- [Backend recovery and deployment runbook](https://github.com/Soozu/inventory-cybence-backend/blob/main/docs/deployment-operations.md)
