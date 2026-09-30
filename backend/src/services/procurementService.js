import { warehouseWhere, requireWarehouseAccess } from './warehouseAccessService.js'
import { prisma } from '../config/prisma.js'
import { inventoryTransaction, changeStock } from './inventoryService.js'
import { paginate } from '../utils/query.js'
import { audit } from '../utils/audit.js'
import { HttpError } from '../utils/http.js'
import { nextReference } from '../utils/references.js'
import { recordSerialEvents } from '../utils/serialEvents.js'
import { currencyTotals } from '../utils/currency.js'

const include = {
  supplier: true, warehouse: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  items: { include: { product: true } }, receipts: { include: { items: true } }
}

export async function listOrders(query, user) {
  const where = warehouseWhere(user, query.warehouse)
  if (query.supplier) where.supplierId = query.supplier
  if (query.warehouse) where.warehouseId = query.warehouse
  if (query.status) where.status = query.status
  if (query.search) where.OR = [{ poNumber: { contains: query.search } }, { supplier: { companyName: { contains: query.search } } }]
  if (query.dateFrom || query.dateTo) where.orderDate = {
    ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
    ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) } : {})
  }
  return paginate(prisma.purchaseOrder, { where, include, query, allowedSort: ['orderDate', 'createdAt', 'expectedDelivery', 'total', 'status'], defaultSort: 'createdAt' })
}

export async function getOrder(id, user) {
  const order = await prisma.purchaseOrder.findUnique({ where: { id }, include })
  if (!order) throw new HttpError(404, 'Purchase order not found.')
  requireWarehouseAccess(user, order.warehouseId)
  return order
}

async function validatedLines(tx, input) {
  const ids = input.items.map(item => item.productId)
  const products = await tx.product.findMany({ where: { id: { in: ids }, status: 'ACTIVE' }, select: { id: true } })
  if (products.length !== ids.length) throw new HttpError(400, 'One or more products are unavailable.')
  const draftLines = input.items.map(item => ({ productId: item.productId, quantity: item.quantity, unitCost: item.unitCost }))
  return currencyTotals(draftLines, input.tax, input.shipping, 'unitCost')
}

export async function createOrder(input, req) {
  requireWarehouseAccess(req.user, input.warehouseId)
  return inventoryTransaction(tx => createOrderInTransaction(tx, input, req))
}

export async function createOrderInTransaction(tx, input, req) {
    requireWarehouseAccess(req.user, input.warehouseId)
    const [supplier, warehouse] = await Promise.all([
      tx.supplier.findUnique({ where: { id: input.supplierId } }),
      tx.warehouse.findUnique({ where: { id: input.warehouseId } })
    ])
    if (!supplier || supplier.status !== 'ACTIVE' || !warehouse || warehouse.status !== 'ACTIVE') throw new HttpError(400, 'Supplier or warehouse is unavailable.')
    const { lines, subtotal, total } = await validatedLines(tx, input)
    const poNumber = await nextReference(tx, `po-${new Date().getFullYear()}`, `PO-${new Date().getFullYear()}`)
    const order = await tx.purchaseOrder.create({ data: {
      poNumber, supplierId: input.supplierId, warehouseId: input.warehouseId,
      createdById: req.user.id, expectedDelivery: input.expectedDelivery,
      reference: input.reference, notes: input.notes, subtotal, tax: input.tax,
      shipping: input.shipping, total, items: { create: lines }
    }, include })
    await audit(tx, req, 'CREATED', 'Purchasing', 'PurchaseOrder', order.id, `Created ${poNumber}.`, { warehouseId: input.warehouseId })
    return order
}

export async function updateOrder(id, input, req) {
  requireWarehouseAccess(req.user, input.warehouseId)
  return inventoryTransaction(async tx => {
    const existing = await tx.purchaseOrder.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Purchase order not found.')
    requireWarehouseAccess(req.user, existing.warehouseId)
    if (existing.status !== 'DRAFT') throw new HttpError(409, 'Only draft purchase orders can be edited.')
    const { lines, subtotal, total } = await validatedLines(tx, input)
    await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } })
    const order = await tx.purchaseOrder.update({ where: { id }, data: {
      supplierId: input.supplierId, warehouseId: input.warehouseId,
      expectedDelivery: input.expectedDelivery, reference: input.reference,
      notes: input.notes, subtotal, tax: input.tax, shipping: input.shipping,
      total, items: { create: lines }
    }, include })
    await audit(tx, req, 'UPDATED', 'Purchasing', 'PurchaseOrder', id, `Updated ${order.poNumber}.`, { warehouseId: order.warehouseId })
    return order
  })
}

export async function transitionOrder(id, event, req) {
  const transitions = {
    submit: { from: ['DRAFT'], to: 'PENDING_APPROVAL' },
    approve: { from: ['PENDING_APPROVAL'], to: 'APPROVED' },
    cancel: { from: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ORDERED', 'PARTIAL'], to: 'CANCELLED' }
  }
  const transition = transitions[event]
  return inventoryTransaction(async tx => {
    const order = await tx.purchaseOrder.findUnique({ where: { id } })
    if (!order) throw new HttpError(404, 'Purchase order not found.')
    requireWarehouseAccess(req.user, order.warehouseId)
    if (!transition.from.includes(order.status)) throw new HttpError(409, `Cannot ${event} a ${order.status.toLowerCase()} purchase order.`)
    const changed = await tx.purchaseOrder.update({ where: { id }, data: {
      status: transition.to, ...(event === 'approve' ? { approvedById: req.user.id } : {})
    } })
    await audit(tx, req, event.toUpperCase(), 'Purchasing', 'PurchaseOrder', id, `${event} ${order.poNumber}.`, { warehouseId: order.warehouseId })
    if (event === 'submit') {
      const approvers = await tx.user.findMany({ where: { role: { name: 'Administrator' }, status: 'ACTIVE' }, select: { id: true } })
      if (approvers.length) await tx.notification.createMany({ data: approvers.map(user => ({
        userId: user.id, type: 'PURCHASE_APPROVAL_REQUEST', title: 'Purchase order needs approval',
        message: `${order.poNumber} is awaiting approval.`, referenceType: 'PurchaseOrder', referenceId: id
      })) })
    }
    if (event === 'approve') await tx.notification.create({ data: {
      userId: order.createdById, warehouseId: order.warehouseId, type: 'PURCHASE_APPROVED', title: 'Purchase order approved',
      message: `${order.poNumber} was approved.`, referenceType: 'PurchaseOrder', referenceId: id
    } })
    return changed
  })
}

export async function receiveOrder(id, input, req) {
  return inventoryTransaction(async tx => {
    const order = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: { include: { product: true } } } })
    if (!order) throw new HttpError(404, 'Purchase order not found.')
    requireWarehouseAccess(req.user, order.warehouseId)
    if (!['APPROVED', 'ORDERED', 'PARTIAL'].includes(order.status)) throw new HttpError(409, 'This purchase order is not ready for receiving.')
    if (new Set(input.items.map(item => item.purchaseOrderItemId)).size !== input.items.length) throw new HttpError(400, 'Duplicate purchase order item.')
    const byId = new Map(order.items.map(item => [item.id, item]))
    const allSerials = input.items.flatMap(item => item.serialNumbers || [])
    if (new Set(allSerials).size !== allSerials.length) throw new HttpError(400, 'Duplicate serial number in this receipt.')
    for (const item of input.items) {
      const ordered = byId.get(item.purchaseOrderItemId)
      if (!ordered) throw new HttpError(400, 'Receipt item does not belong to this purchase order.')
      if (ordered.receivedQuantity + item.quantity > ordered.quantity) throw new HttpError(400, `Cannot receive more than ordered for ${ordered.product.sku}.`)
      if (ordered.product.trackSerialNumbers && (item.serialNumbers?.length || 0) !== item.quantity) throw new HttpError(400, `Enter ${item.quantity} serial numbers for ${ordered.product.sku}.`)
      if (!ordered.product.trackSerialNumbers && item.serialNumbers?.length) throw new HttpError(400, 'Serial numbers supplied for a product without serial tracking.')
    }
    if (allSerials.length && await tx.serialNumber.count({ where: { serialNumber: { in: allSerials } } })) throw new HttpError(409, 'A serial number already exists.')
    const receiptNumber = await nextReference(tx, `receipt-${new Date().getFullYear()}`, `RCV-${new Date().getFullYear()}`)
    const receipt = await tx.purchaseReceipt.create({ data: {
      receiptNumber, purchaseOrderId: id, warehouseId: order.warehouseId,
      receivedById: req.user.id, notes: input.notes
    } })
    for (const item of input.items) {
      const ordered = byId.get(item.purchaseOrderItemId)
      const updated = await tx.purchaseOrderItem.updateMany({
        where: { id: ordered.id, receivedQuantity: ordered.receivedQuantity },
        data: { receivedQuantity: { increment: item.quantity } }
      })
      if (updated.count !== 1) throw new HttpError(409, 'Receiving changed concurrently. Please retry.')
      await tx.purchaseReceiptItem.create({ data: {
        receiptId: receipt.id, purchaseOrderItemId: ordered.id,
        productId: ordered.productId, quantity: item.quantity
      } })
      await changeStock(tx, {
        productId: ordered.productId, warehouseId: order.warehouseId,
        delta: item.quantity, type: 'PURCHASE_RECEIVING',
        referenceNumber: receiptNumber, userId: req.user.id, notes: `Received ${order.poNumber}`
      })
      if (ordered.product.trackSerialNumbers) {
        const warrantyStart = new Date(), warrantyEnd = new Date()
        warrantyEnd.setMonth(warrantyEnd.getMonth() + ordered.product.warrantyMonths)
        await tx.serialNumber.createMany({ data: item.serialNumbers.map(serialNumber => ({
          serialNumber, productId: ordered.productId, warehouseId: order.warehouseId,
          purchaseOrderItemId: ordered.id, receiptId: receipt.id, supplierId: order.supplierId,
          warrantyStart, warrantyEnd
        })) })
        const receivedSerials = await tx.serialNumber.findMany({ where: { receiptId: receipt.id, serialNumber: { in: item.serialNumbers } }, select: { id: true } })
        await recordSerialEvents(tx, receivedSerials.map(serial => serial.id), { type: 'RECEIVED', toStatus: 'AVAILABLE', warehouseId: order.warehouseId,
          referenceType: 'PurchaseReceipt', referenceId: receipt.id, referenceNumber: receiptNumber, notes: `Received from ${order.poNumber}` }, req)
      }
    }
    const receivedByItem = new Map(input.items.map(item => [item.purchaseOrderItemId, item.quantity]))
    const complete = order.items.every(item => item.receivedQuantity + (receivedByItem.get(item.id) || 0) === item.quantity)
    await tx.purchaseOrder.update({ where: { id }, data: { status: complete ? 'RECEIVED' : 'PARTIAL' } })
    await audit(tx, req, 'RECEIVED', 'Purchasing', 'PurchaseReceipt', receipt.id, `Received ${receiptNumber} for ${order.poNumber}.`, { warehouseId: order.warehouseId })
    await tx.notification.create({ data: {
      userId: order.createdById, warehouseId: order.warehouseId, type: 'PURCHASE_RECEIVING', title: 'Purchase order received',
      message: `${order.poNumber} was ${complete ? 'fully' : 'partially'} received.`, referenceType: 'PurchaseOrder', referenceId: id
    } })
    return { ...receipt, status: complete ? 'RECEIVED' : 'PARTIAL' }
  })
}
