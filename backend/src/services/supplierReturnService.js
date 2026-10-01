import { prisma } from '../config/prisma.js'
import { inventoryTransaction } from './inventoryService.js'
import { warehouseWhere, requireWarehouseAccess } from './warehouseAccessService.js'
import { paginate } from '../utils/query.js'
import { nextReference } from '../utils/references.js'
import { HttpError } from '../utils/http.js'
import { audit } from '../utils/audit.js'
import { recordSerialEvents } from '../utils/serialEvents.js'
import { conditionValues, conditionDeltas, updateConditionBalance, balanceSnapshot } from '../utils/stockConditions.js'

const person = { select: { id: true, firstName: true, lastName: true } }
const include = {
  supplier: { select: { id: true, companyName: true } }, warehouse: { select: { id: true, name: true, code: true } },
  purchaseOrder: { select: { id: true, poNumber: true } }, receipt: { select: { id: true, receiptNumber: true } }, createdBy: person, approvedBy: person,
  items: { include: { product: { select: { id: true, name: true, sku: true, trackSerialNumbers: true } }, serialSelections: { include: { serialNumber: true } } } }
}
const activeClaims = ['PENDING', 'APPROVED', 'SHIPPED', 'COMPLETED']
const eligibleStatuses = ['AVAILABLE', 'DEFECTIVE', 'FOR_REPAIR', 'QUARANTINE']
const nextVersion = row => new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1))
const stale = (row, input) => {
  if (!input.expectedUpdatedAt || new Date(input.expectedUpdatedAt).getTime() !== row.updatedAt.getTime()) throw new HttpError(409, 'This return changed. Reload it before continuing.')
}
async function record(tx, id, user) {
  const row = await tx.supplierReturn.findUnique({ where: { id }, include })
  if (!row) throw new HttpError(404, 'Supplier return not found.')
  requireWarehouseAccess(user, row.warehouseId)
  return row
}
export const getReturn = (id, user) => record(prisma, id, user)
export async function listReturns(query, user) {
  const where = warehouseWhere(user, query.warehouse)
  if (query.status && !['DRAFT', 'PENDING', 'APPROVED', 'SHIPPED', 'COMPLETED', 'CANCELLED'].includes(query.status)) throw new HttpError(400, 'Invalid return status.')
  if (query.status) where.status = query.status
  if (query.search) where.OR = [{ returnNumber: { contains: query.search } }, { supplier: { companyName: { contains: query.search } } }]
  return paginate(prisma.supplierReturn, { where, include, query, allowedSort: ['createdAt', 'status', 'returnNumber'], defaultSort: 'createdAt' })
}
export async function listSources(query, user) {
  const where = warehouseWhere(user, query.warehouse)
  if (query.search) where.OR = [{ receiptNumber: { contains: query.search } }, { purchaseOrder: { poNumber: { contains: query.search } } }]
  return paginate(prisma.purchaseReceipt, { where, include: { purchaseOrder: { select: { poNumber: true, supplier: { select: { companyName: true } } } }, warehouse: { select: { name: true } } }, query, allowedSort: ['receivedAt'], defaultSort: 'receivedAt' })
}
async function source(tx, id, user) {
  const receipt = await tx.purchaseReceipt.findUnique({ where: { id }, include: { warehouse: true, purchaseOrder: { include: { supplier: true } }, items: { include: { product: true } } } })
  if (!receipt) throw new HttpError(404, 'Purchase receipt not found.')
  requireWarehouseAccess(user, receipt.warehouseId)
  if (receipt.warehouseId !== receipt.purchaseOrder.warehouseId) throw new HttpError(409, 'Receipt and purchase order warehouses do not match.')
  return receipt
}
export async function getSource(id, user) {
  const receipt = await source(prisma, id, user)
  const items = []
  for (const line of receipt.items) {
    const claims = await prisma.supplierReturnItem.aggregate({ where: { receiptItemId: line.id, supplierReturn: { status: { in: activeClaims } } }, _sum: { quantity: true } })
    const serials = line.product.trackSerialNumbers ? await prisma.serialNumber.findMany({ where: {
      receiptId: id, purchaseOrderItemId: line.purchaseOrderItemId, productId: line.productId, warehouseId: receipt.warehouseId,
      status: { in: eligibleStatuses }, asset: { is: null }, maintenanceRecords: { none: { status: { in: ['SCHEDULED', 'IN_REPAIR'] } } }
    }, orderBy: { serialNumber: 'asc' }, select: { id: true, serialNumber: true, status: true } }) : []
    const stock = await prisma.warehouseStock.findUnique({ where: { productId_warehouseId: { productId: line.productId, warehouseId: receipt.warehouseId } } })
    items.push({ ...line, returnableQuantity: Math.max(0, line.quantity - (claims._sum.quantity || 0)), serials, stockBalances: stock ? balanceSnapshot(stock) : null })
  }
  return { ...receipt, items }
}
async function validatedLines(tx, receipt, input, excludeId) {
  if (!input.items?.length || new Set(input.items.map(item => item.receiptItemId)).size !== input.items.length) throw new HttpError(400, 'Choose each receipt line once.')
  const allIds = input.items.flatMap(item => item.serialNumberIds || [])
  if (new Set(allIds).size !== allIds.length) throw new HttpError(400, 'Choose each serial once.')
  const lines = []
  for (const item of input.items) {
    const line = receipt.items.find(line => line.id === item.receiptItemId)
    if (!line || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > line.quantity) throw new HttpError(400, 'Return quantity must be within its received line quantity.')
    const claims = await tx.supplierReturnItem.aggregate({ where: { receiptItemId: line.id, supplierReturn: { status: { in: activeClaims }, ...(excludeId ? { id: { not: excludeId } } : {}) } }, _sum: { quantity: true } })
    if (item.quantity + (claims._sum.quantity || 0) > line.quantity) throw new HttpError(409, 'This receipt quantity is already claimed by another return.')
    const ids = item.serialNumberIds || []
    let serials = []
    if (line.product.trackSerialNumbers) {
      if (ids.length !== item.quantity) throw new HttpError(400, `Choose exactly ${item.quantity} serials for ${line.product.sku}.`)
      serials = await tx.serialNumber.findMany({ where: {
        id: { in: ids }, productId: line.productId, warehouseId: receipt.warehouseId, receiptId: receipt.id,
        purchaseOrderItemId: line.purchaseOrderItemId, supplierId: receipt.purchaseOrder.supplierId, status: { in: eligibleStatuses },
        asset: { is: null }, maintenanceRecords: { none: { status: { in: ['SCHEDULED', 'IN_REPAIR'] } } }
      } })
      if (serials.length !== ids.length) throw new HttpError(409, 'A selected serial is unavailable, managed by an asset/repair, or belongs to a different receipt.')
    } else if (ids.length) throw new HttpError(400, 'Serials are only accepted for serialized products.')
    const stockCondition = item.stockCondition || 'AVAILABLE'
    if (!conditionValues.includes(stockCondition)) throw new HttpError(400, 'Choose a valid source stock condition for this return.')
    lines.push({ receiptItemId: line.id, productId: line.productId, quantity: item.quantity, reason: item.reason, condition: item.condition, stockCondition,
      serialSelections: { create: serials.map(serial => ({ serialNumberId: serial.id, previousStatus: serial.status })) } })
  }
  return lines
}
export async function createReturn(input, req) {
  return inventoryTransaction(async tx => {
    const receipt = await source(tx, input.receiptId, req.user)
    const items = await validatedLines(tx, receipt, input)
    const returnNumber = await nextReference(tx, `supplier-return-${new Date().getFullYear()}`, `RTV-${new Date().getFullYear()}`)
    const row = await tx.supplierReturn.create({ data: { returnNumber, receiptId: receipt.id, purchaseOrderId: receipt.purchaseOrderId, supplierId: receipt.purchaseOrder.supplierId,
      warehouseId: receipt.warehouseId, createdById: req.user.id, reason: input.reason, notes: input.notes, items: { create: items } }, include })
    await audit(tx, req, 'CREATED', 'Supplier Returns', 'SupplierReturn', row.id, `Created ${returnNumber} from ${receipt.receiptNumber}.`, { warehouseId: row.warehouseId })
    return row
  })
}
export async function updateReturn(id, input, req) {
  return inventoryTransaction(async tx => {
    const row = await record(tx, id, req.user); stale(row, input)
    if (row.status !== 'DRAFT') throw new HttpError(409, 'Only draft returns can be edited.')
    if (input.receiptId !== row.receiptId) throw new HttpError(400, 'The source receipt cannot be changed.')
    const receipt = await source(tx, row.receiptId, req.user)
    const items = await validatedLines(tx, receipt, input, id)
    await tx.supplierReturnItem.deleteMany({ where: { supplierReturnId: id } })
    const result = await tx.supplierReturn.update({ where: { id }, data: { reason: input.reason, notes: input.notes, updatedAt: nextVersion(row), items: { create: items } }, include })
    await audit(tx, req, 'UPDATED', 'Supplier Returns', 'SupplierReturn', id, `Updated ${row.returnNumber}.`, { warehouseId: row.warehouseId })
    return result
  })
}

// reservedQuantity already represents every unavailable unit in the existing inventory contract.
// A return hold joins that balance; previously defective/repair serials remain held once, not twice.
async function changeBalance(tx, row, item, event, req) {
  const stock = await tx.warehouseStock.findUnique({ where: { productId_warehouseId: { productId: item.productId, warehouseId: row.warehouseId } } })
  if (!stock) throw new HttpError(409, 'Warehouse balance is missing for this return.')
  const hold = event === 'submit' ? (item.product.trackSerialNumbers ? item.serialSelections.filter(selection => selection.previousStatus === 'AVAILABLE').length : item.stockCondition === 'AVAILABLE' ? item.quantity : 0) : item.heldQuantity
  const delta = event === 'ship' ? -item.quantity : 0
  const reservedDelta = event === 'submit' ? hold : event === 'cancel' ? -hold : -item.quantity
  const bucketDeltas = {}
  const selections = item.product.trackSerialNumbers ? item.serialSelections.map(selection => ({ status: selection.previousStatus, quantity: 1 })) : [{ status: item.stockCondition, quantity: item.quantity }]
  for (const selection of selections) {
    const deltas = event === 'submit' ? conditionDeltas(selection.status, 'RETURN_PENDING', selection.quantity) : event === 'cancel' ? conditionDeltas('RETURN_PENDING', selection.status, selection.quantity) : { returnPendingQuantity: -selection.quantity }
    for (const [key, amount] of Object.entries(deltas)) bucketDeltas[key] = (bucketDeltas[key] || 0) + amount
  }
  const { quantity, reservedQuantity } = await updateConditionBalance(tx, stock, { quantityDelta: delta, reservedDelta, bucketDeltas })
  await tx.stockMovement.create({ data: { productId: item.productId, warehouseId: row.warehouseId, referenceNumber: row.returnNumber,
    type: event === 'ship' ? 'SUPPLIER_RETURN' : event === 'submit' ? 'RETURN_HOLD' : 'RETURN_RELEASE', quantity: delta,
    previousQuantity: stock.quantity, newQuantity: quantity, previousReservedQuantity: stock.reservedQuantity, newReservedQuantity: reservedQuantity,
    userId: req.user.id, notes: `${event} ${row.returnNumber}${row.shipmentReference ? ` · ${row.shipmentReference}` : ''}` } })
  if (event === 'submit') await tx.supplierReturnItem.update({ where: { id: item.id }, data: { heldQuantity: hold } })
  for (const selection of item.serialSelections) {
    const fromStatus = event === 'submit' ? selection.previousStatus : 'RETURN_PENDING'
    const toStatus = event === 'submit' ? 'RETURN_PENDING' : event === 'cancel' ? selection.previousStatus : 'RETURNED'
    const updated = await tx.serialNumber.updateMany({ where: { id: selection.serialNumberId, status: fromStatus, warehouseId: row.warehouseId }, data: { status: toStatus, ...(event === 'ship' ? { warehouseId: null } : {}) } })
    if (updated.count !== 1) throw new HttpError(409, 'A return serial changed. Reload before continuing.')
    await recordSerialEvents(tx, [selection.serialNumberId], { type: event === 'ship' ? 'SUPPLIER_RETURNED' : event === 'submit' ? 'RETURN_HELD' : 'RETURN_RELEASED',
      fromStatus, toStatus, warehouseId: row.warehouseId, referenceType: 'SupplierReturn', referenceId: row.id, referenceNumber: row.returnNumber }, req)
  }
}
export async function transitionReturn(id, event, input, req) {
  const transitions = { submit: ['DRAFT', 'PENDING'], approve: ['PENDING', 'APPROVED'], ship: ['APPROVED', 'SHIPPED'], complete: ['SHIPPED', 'COMPLETED'] }
  return inventoryTransaction(async tx => {
    const row = await record(tx, id, req.user); stale(row, input)
    const cancel = event === 'cancel'
    if (cancel ? !['DRAFT', 'PENDING', 'APPROVED'].includes(row.status) : !transitions[event] || row.status !== transitions[event][0]) throw new HttpError(409, `Cannot ${event} this return.`)
    if (event === 'submit') {
      const receipt = await source(tx, row.receiptId, req.user)
      if (receipt.warehouse.status !== 'ACTIVE') throw new HttpError(409, 'Activate this warehouse before submitting a return.')
      await validatedLines(tx, receipt, { items: row.items.map(item => ({ ...item, serialNumberIds: item.serialSelections.map(selection => selection.serialNumberId) })) }, id)
      // Snapshot the actual pre-hold state again: a draft never owns its serials.
      for (const item of row.items) for (const selection of item.serialSelections) {
        selection.previousStatus = (await tx.serialNumber.findUnique({ where: { id: selection.serialNumberId } })).status
        await tx.supplierReturnSerial.update({ where: { returnItemId_serialNumberId: { returnItemId: item.id, serialNumberId: selection.serialNumberId } }, data: { previousStatus: selection.previousStatus } })
      }
    }
    if (event === 'ship' && !input.shipmentReference?.trim()) throw new HttpError(400, 'Enter a physical shipment reference.')
    if (event === 'ship' && (await tx.warehouse.findUnique({ where: { id: row.warehouseId } })).status !== 'ACTIVE') throw new HttpError(409, 'Activate this warehouse before shipping a return.')
    if (event === 'complete' && !input.notes?.trim()) throw new HttpError(400, 'Record the supplier acknowledgement or credit outcome.')
    if (event === 'submit' || event === 'ship' || (cancel && row.status !== 'DRAFT')) {
      for (const item of row.items) await changeBalance(tx, { ...row, shipmentReference: input.shipmentReference }, item, event, req)
    }
    const changed = await tx.supplierReturn.updateMany({ where: { id, updatedAt: row.updatedAt, status: row.status }, data: {
      status: cancel ? 'CANCELLED' : transitions[event][1], updatedAt: nextVersion(row),
      ...(event === 'submit' ? { submittedAt: new Date() } : {}), ...(event === 'approve' ? { approvedById: req.user.id, approvedAt: new Date() } : {}),
      ...(event === 'ship' ? { returnedAt: new Date(), shipmentReference: input.shipmentReference.trim() } : {}),
      ...(event === 'complete' ? { completedAt: new Date(), completionNotes: input.notes.trim() } : {})
    } })
    if (changed.count !== 1) throw new HttpError(409, 'This return changed concurrently.')
    await audit(tx, req, event.toUpperCase(), 'Supplier Returns', 'SupplierReturn', id, `${event} ${row.returnNumber}${input.notes ? `: ${input.notes}` : ''}.`, { warehouseId: row.warehouseId })
    return record(tx, id, req.user)
  })
}
