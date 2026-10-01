import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma.js'
import { inventoryTransaction } from './inventoryService.js'
import { createOrderInTransaction } from './procurementService.js'
import { createRequestInTransaction } from './purchaseRequestService.js'
import { requireWarehouseAccess, warehouseWhere } from './warehouseAccessService.js'
import { HttpError } from '../utils/http.js'

export const reorderPermissions = ['inventory.VIEW', 'purchasing.VIEW', 'purchase_requests.VIEW', 'suppliers.VIEW']
export const performancePermissions = ['purchasing.VIEW', 'suppliers.VIEW', 'supplier_returns.VIEW']
export function requirePermissions(user, permissions) {
  if (user?.role !== 'Administrator' && !permissions.every(key => user?.permissions?.includes(key))) throw new HttpError(403, 'You do not have permission for the source documents in this view.')
}
const incomingStates = ['APPROVED', 'ORDERED', 'PARTIAL']
const plannedOrderStates = ['DRAFT', 'PENDING_APPROVAL']
const plannedRequestStates = ['DRAFT', 'SUBMITTED', 'APPROVED']
async function warehouse(tx, id, user) {
  requireWarehouseAccess(user, id)
  if ((await tx.warehouse.findUnique({ where: { id } }))?.status !== 'ACTIVE') throw new HttpError(400, 'Warehouse is unavailable.')
}
async function suggestions(tx, warehouseId, productId, search = '') {
  const products = await tx.product.findMany({ where: { status: 'ACTIVE', ...(productId ? { id: productId } : {}), ...(search ? { OR: [{ sku: { contains: search } }, { name: { contains: search } }] } : {}) }, orderBy: { sku: 'asc' },
    include: { defaultSupplier: { select: { id: true, companyName: true, status: true } }, stocks: { where: { warehouseId } },
      purchaseOrderItems: { where: { purchaseOrder: { warehouseId, status: { in: [...incomingStates, ...plannedOrderStates] } } }, include: { purchaseOrder: { select: { id: true, poNumber: true, status: true, updatedAt: true } } }, orderBy: { id: 'asc' } },
      purchaseRequestItems: { where: { request: { warehouseId, status: { in: plannedRequestStates }, purchaseOrderId: null } }, include: { request: { select: { id: true, prNumber: true, status: true, updatedAt: true } } }, orderBy: { id: 'asc' } } } })
  return products.map(product => {
    const stock = product.stocks[0], available = (stock?.quantity || 0) - (stock?.reservedQuantity || 0)
    const orders = product.purchaseOrderItems.map(line => ({ ...line.purchaseOrder, quantity: Math.max(0, line.quantity - line.receivedQuantity) }))
    const requests = product.purchaseRequestItems.map(line => ({ ...line.request, quantity: line.quantity }))
    const incoming = orders.filter(row => incomingStates.includes(row.status)).reduce((sum, row) => sum + row.quantity, 0)
    const planned = orders.filter(row => plannedOrderStates.includes(row.status)).reduce((sum, row) => sum + row.quantity, 0) + requests.reduce((sum, row) => sum + row.quantity, 0)
    const threshold = product.reorderPoint || product.minimumStock, target = Math.max(product.maximumStock, threshold)
    const projected = available + incoming + planned, suggestedQuantity = available <= threshold && threshold > 0 ? Math.max(0, target - projected) : 0
    // Versions and line identities make round trips and competing documents stale as well as changed totals.
    const snapshot = createHash('sha256').update(JSON.stringify({ warehouseId, product: [product.id, product.updatedAt, product.purchaseCost, threshold, target], stock: stock || null, orders, requests })).digest('hex')
    return { product: { id: product.id, name: product.name, sku: product.sku, unit: product.unit, purchaseCost: product.purchaseCost }, defaultSupplier: product.defaultSupplier,
      quantity: stock?.quantity || 0, unavailable: stock?.reservedQuantity || 0, quarantine: stock?.quarantineQuantity || 0, defective: stock?.defectiveQuantity || 0, forRepair: stock?.forRepairQuantity || 0, returnPending: stock?.returnPendingQuantity || 0,
      available, incoming, planned, projected, threshold, target, suggestedQuantity, snapshot, orders, requests }
  })
}
export async function listSuggestions(query, user) {
  requirePermissions(user, reorderPermissions)
  return inventoryTransaction(async tx => {
    await warehouse(tx, query.warehouse, user)
    const rows = (await suggestions(tx, query.warehouse, null, query.search)).filter(row => row.threshold > 0 && row.available <= row.threshold)
    return { data: rows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize), meta: { total: rows.length, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(rows.length / query.pageSize) }, suppliers: await tx.supplier.findMany({ where: { status: 'ACTIVE' }, select: { id: true, companyName: true }, orderBy: { companyName: 'asc' } }) }
  })
}
export async function createReplenishment(input, req) {
  requirePermissions(req.user, [...reorderPermissions, input.kind === 'ORDER' ? 'purchasing.CREATE' : 'purchase_requests.CREATE'])
  return inventoryTransaction(async tx => {
    await warehouse(tx, input.warehouseId, req.user)
    const row = (await suggestions(tx, input.warehouseId, input.productId))[0]
    if (!row || row.snapshot !== input.snapshot || row.suggestedQuantity < 1) throw new HttpError(409, 'This suggestion changed or is already covered. Refresh and review current quantities.')
    if (row.suggestedQuantity > 1000000) throw new HttpError(400, 'Suggested quantity exceeds the document limit. Review the product thresholds.')
    const note = `Reorder ${row.product.sku}: available ${row.available}, incoming ${row.incoming}, planned ${row.planned}, target ${row.target}. ${input.notes}`
    if (input.kind === 'REQUEST') return { kind: 'REQUEST', document: await createRequestInTransaction(tx, { warehouseId: input.warehouseId, department: 'Inventory replenishment', justification: note, items: [{ productId: row.product.id, description: row.product.name, quantity: row.suggestedQuantity, estimatedUnitCost: row.product.purchaseCost }] }, req) }
    return { kind: 'ORDER', document: await createOrderInTransaction(tx, { warehouseId: input.warehouseId, supplierId: input.supplierId, tax: 0, shipping: 0, reference: `Reorder ${row.product.sku}`.slice(0, 100), notes: note, items: [{ productId: row.product.id, quantity: row.suggestedQuantity, unitCost: row.product.purchaseCost }] }, req) }
  })
}

export async function supplierPerformance(query, user) {
  requirePermissions(user, performancePermissions)
  const end = new Date(`${query.dateTo}T23:59:59.999Z`)
  const scope = warehouseWhere(user, query.warehouse)
  return inventoryTransaction(async tx => {
    const orders = await tx.purchaseOrder.findMany({ where: { ...scope, ...(query.supplier ? { supplierId: query.supplier } : {}), orderDate: { gte: new Date(query.dateFrom), lte: end }, OR: [{ status: { in: ['APPROVED', 'ORDERED', 'PARTIAL', 'RECEIVED'] } }, { status: 'CANCELLED', receipts: { some: {} } }] },
      include: { supplier: { select: { id: true, companyName: true, supplierCode: true } }, items: true, receipts: { where: { receivedAt: { lte: end } }, orderBy: { receivedAt: 'asc' }, include: { items: true } }, supplierReturns: { where: { status: { in: ['SHIPPED', 'COMPLETED'] }, returnedAt: { lte: end } }, include: { items: true } } }, orderBy: { id: 'asc' } })
    const groups = new Map()
    for (const order of orders) {
      let row = groups.get(order.supplierId)
      if (!row) { row = { supplier: order.supplier, orders: 0, orderedUnits: 0, receivedUnits: 0, returnedUnits: 0, receivedValue: new Prisma.Decimal(0), completedDueOrders: 0, onTimeOrders: 0, openOverdueOrders: 0, firstReceiptSamples: 0, firstReceiptDaysTotal: 0, documents: [] }; groups.set(order.supplierId, row) }
      row.orders++; row.orderedUnits += order.items.reduce((sum, line) => sum + line.quantity, 0)
      const quantities = new Map(), costs = new Map(order.items.map(line => [line.id, line.unitCost]))
      let completedAt = null
      for (const receipt of order.receipts) {
        for (const line of receipt.items) { row.receivedUnits += line.quantity; quantities.set(line.purchaseOrderItemId, (quantities.get(line.purchaseOrderItemId) || 0) + line.quantity); row.receivedValue = row.receivedValue.plus(costs.get(line.purchaseOrderItemId).mul(line.quantity)) }
        if (!completedAt && order.items.every(line => (quantities.get(line.id) || 0) >= line.quantity)) completedAt = receipt.receivedAt
      }
      const first = order.receipts[0]?.receivedAt
      if (first && first >= order.orderDate) { row.firstReceiptSamples++; row.firstReceiptDaysTotal += (first - order.orderDate) / 86400000 }
      // Date-only promised delivery is inclusive of the entire UTC calendar day.
      const due = order.expectedDelivery && new Date(`${order.expectedDelivery.toISOString().slice(0, 10)}T23:59:59.999Z`)
      if (completedAt && due) { row.completedDueOrders++; if (completedAt <= due) row.onTimeOrders++ }
      if (!completedAt && due && due < end && order.status !== 'CANCELLED') row.openOverdueOrders++
      const receiptIds = new Set(order.receipts.map(receipt => receipt.id))
      row.returnedUnits += order.supplierReturns.filter(record => receiptIds.has(record.receiptId)).flatMap(record => record.items).reduce((sum, line) => sum + line.quantity, 0)
      row.documents.push({ id: order.id, poNumber: order.poNumber, status: order.status, warehouseId: order.warehouseId, completedAt })
    }
    return { window: { dateFrom: query.dateFrom, dateTo: query.dateTo, basis: 'PO orderDate cohort; actual receipts and shipped returns through dateTo (UTC). Draft/pending orders excluded; cancelled orders included only with receipts.' }, data: [...groups.values()].map(({ firstReceiptDaysTotal, ...row }) => ({ ...row, receivedValue: row.receivedValue.toFixed(2), onTimePercent: row.completedDueOrders ? row.onTimeOrders * 100 / row.completedDueOrders : null, averageFirstReceiptDays: row.firstReceiptSamples ? firstReceiptDaysTotal / row.firstReceiptSamples : null, returnPercent: row.receivedUnits ? row.returnedUnits * 100 / row.receivedUnits : null })) }
  })
}
