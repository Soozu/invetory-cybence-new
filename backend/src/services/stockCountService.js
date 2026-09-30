import { prisma } from '../config/prisma.js'
import { inventoryTransaction, changeStock, validateSerials } from './inventoryService.js'
import { warehouseWhere, requireWarehouseAccess } from './warehouseAccessService.js'
import { paginate } from '../utils/query.js'
import { HttpError } from '../utils/http.js'
import { nextReference } from '../utils/references.js'
import { recordSerialEvents } from '../utils/serialEvents.js'
import { audit } from '../utils/audit.js'

const include = {
  warehouse: { select: { id: true, name: true, code: true } },
  createdBy: { select: { firstName: true, lastName: true } }, approvedBy: { select: { firstName: true, lastName: true } },
  _count: { select: { items: true } }
}
async function authorizedCount(tx, id, user, options = {}) {
  const count = await tx.stockCount.findUnique({ where: { id }, ...options })
  if (!count) throw new HttpError(404, 'Stock count not found.')
  requireWarehouseAccess(user, count.warehouseId)
  return count
}
const requireStatus = (count, status) => {
  if (count.status !== status) throw new HttpError(409, `This action requires a ${status.toLowerCase().replaceAll('_', ' ')} stock count.`)
}

export async function listCounts(query, user) {
  const where = warehouseWhere(user, query.warehouse)
  if (query.status && !['DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'CANCELLED'].includes(query.status)) throw new HttpError(400, 'Invalid count status.')
  if (query.status) where.status = query.status
  if (query.search) where.countNumber = { contains: query.search }
  return paginate(prisma.stockCount, { where, include, query, allowedSort: ['createdAt', 'countNumber', 'status', 'startedAt'], defaultSort: 'createdAt' })
}

export async function getCount(id, user) {
  const count = await authorizedCount(prisma, id, user, { include })
  const [countedItems, varianceItems] = await Promise.all([
    prisma.stockCountItem.count({ where: { stockCountId: id, countedQuantity: { not: null } } }),
    prisma.stockCountItem.count({ where: { stockCountId: id, variance: { not: 0 } } })
  ])
  return { ...count, countedItems, varianceItems }
}

export async function countItems(id, query, user) {
  await authorizedCount(prisma, id, user)
  const where = { stockCountId: id }
  if (query.search) where.product = { OR: [{ name: { contains: query.search } }, { sku: { contains: query.search } }] }
  const result = await paginate(prisma.stockCountItem, { where, include: { product: true, serials: true, adjustment: true }, query,
    allowedSort: ['productId', 'expectedQuantity', 'countedQuantity', 'variance'], defaultSort: 'productId' })
  result.data = result.data.map(item => ({ ...item,
    expectedSerials: item.serials.filter(serial => serial.isExpected).map(serial => serial.serialNumber),
    scannedSerials: item.serials.filter(serial => serial.isScanned).map(serial => serial.serialNumber),
    missingSerials: item.serials.filter(serial => serial.isExpected && !serial.isScanned).map(serial => serial.serialNumber),
    unexpectedSerials: item.serials.filter(serial => !serial.isExpected && serial.isScanned).map(serial => serial.serialNumber)
  }))
  return result
}

export async function createCount(input, req) {
  requireWarehouseAccess(req.user, input.warehouseId)
  return inventoryTransaction(async tx => {
    const warehouse = await tx.warehouse.findUnique({ where: { id: input.warehouseId } })
    if (!warehouse || warehouse.status !== 'ACTIVE') throw new HttpError(400, 'Warehouse is unavailable.')
    const year = new Date().getFullYear()
    const count = await tx.stockCount.create({ data: {
      ...input, countNumber: await nextReference(tx, `stock-count-${year}`, `SC-${year}`), createdById: req.user.id
    }, include })
    await audit(tx, req, 'CREATED', 'Stock Counts', 'StockCount', count.id, `Created ${count.countNumber}.`, { warehouseId: count.warehouseId })
    return count
  })
}

export async function startCount(id, req) {
  return inventoryTransaction(async tx => {
    const count = await authorizedCount(tx, id, req.user)
    requireStatus(count, 'DRAFT')
    const changed = await tx.stockCount.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'IN_PROGRESS', startedAt: new Date() } })
    if (changed.count !== 1) throw new HttpError(409, 'Count changed concurrently.')
    const products = await tx.product.findMany({ where: { status: { not: 'ARCHIVED' } }, include: {
      stocks: { where: { warehouseId: count.warehouseId } },
      serialNumbers: { where: { warehouseId: count.warehouseId, status: { notIn: ['ASSIGNED', 'DISPOSED', 'MISSING', 'ISSUED'] } } }
    } })
    for (const product of products) {
      const stock = product.stocks[0]
      const quantity = stock?.quantity || 0
      if (product.trackSerialNumbers && quantity !== product.serialNumbers.length) throw new HttpError(409, `Serialized balance for ${product.sku} must be reconciled before counting.`)
      await tx.stockCountItem.create({ data: {
        stockCountId: id, productId: product.id, expectedQuantity: quantity,
        expectedReservedQuantity: stock?.reservedQuantity || 0, expectedStockUpdatedAt: stock?.updatedAt || null,
        serials: { create: product.serialNumbers.map(serial => ({ serialNumber: serial.serialNumber, serialNumberId: serial.id, isExpected: true, expectedStatus: serial.status })) }
      } })
    }
    await audit(tx, req, 'STARTED', 'Stock Counts', 'StockCount', id, `Captured inventory snapshot for ${count.countNumber}.`, { warehouseId: count.warehouseId })
    return tx.stockCount.findUnique({ where: { id }, include })
  })
}

export async function saveCountItems(id, input, req) {
  return inventoryTransaction(async tx => {
    const count = await authorizedCount(tx, id, req.user)
    requireStatus(count, 'IN_PROGRESS')
    const allScans = input.items.flatMap(item => item.serialNumbers || [])
    if (new Set(allScans).size !== allScans.length) throw new HttpError(400, 'Each scanned serial number must be unique.')
    for (const inputItem of input.items) {
      const item = await tx.stockCountItem.findUnique({ where: { id: inputItem.id }, include: { product: true } })
      if (!item || item.stockCountId !== id) throw new HttpError(400, 'Item does not belong to this stock count.')
      const scans = inputItem.serialNumbers || []
      if (item.product.trackSerialNumbers && scans.length !== inputItem.countedQuantity) throw new HttpError(400, `Count ${item.product.sku} by scanning one serial per unit.`)
      if (!item.product.trackSerialNumbers && scans.length) throw new HttpError(400, 'Serials supplied for a product without tracking.')
      if (scans.length && await tx.stockCountSerial.count({ where: { item: { stockCountId: id, id: { not: item.id } }, isScanned: true, serialNumber: { in: scans } } })) {
        throw new HttpError(400, 'A serial was already scanned for another product in this count.')
      }
      await tx.stockCountSerial.updateMany({ where: { stockCountItemId: item.id }, data: { isScanned: false } })
      for (const serialNumber of scans) await tx.stockCountSerial.upsert({ where: { stockCountItemId_serialNumber: { stockCountItemId: item.id, serialNumber } },
        create: { stockCountItemId: item.id, serialNumber, isScanned: true }, update: { isScanned: true } })
      await tx.stockCountItem.update({ where: { id: item.id }, data: {
        countedQuantity: inputItem.countedQuantity, variance: inputItem.countedQuantity - item.expectedQuantity, notes: inputItem.notes
      } })
    }
    await audit(tx, req, 'COUNTED', 'Stock Counts', 'StockCount', id, `Saved ${input.items.length} count lines for ${count.countNumber}.`, { warehouseId: count.warehouseId })
    return { id, savedItems: input.items.length }
  })
}

export async function submitCount(id, req) {
  return inventoryTransaction(async tx => {
    const count = await authorizedCount(tx, id, req.user)
    requireStatus(count, 'IN_PROGRESS')
    if (!await tx.stockCountItem.count({ where: { stockCountId: id } })) throw new HttpError(400, 'This count has no inventory lines.')
    if (await tx.stockCountItem.count({ where: { stockCountId: id, countedQuantity: null } })) throw new HttpError(400, 'Count every line before submitting. Enter zero for items not found.')
    const changed = await tx.stockCount.updateMany({ where: { id, status: 'IN_PROGRESS' }, data: { status: 'SUBMITTED', submittedAt: new Date() } })
    if (changed.count !== 1) throw new HttpError(409, 'Count changed concurrently.')
    await audit(tx, req, 'SUBMITTED', 'Stock Counts', 'StockCount', id, `Submitted ${count.countNumber} for approval.`, { warehouseId: count.warehouseId })
    return { id, status: 'SUBMITTED' }
  })
}

export async function approveCount(id, req) {
  return inventoryTransaction(async tx => {
    const count = await authorizedCount(tx, id, req.user, { include: { items: { include: { product: true, serials: true } } } })
    requireStatus(count, 'SUBMITTED')
    const changed = await tx.stockCount.updateMany({ where: { id, status: 'SUBMITTED' }, data: { status: 'APPROVED', approvedById: req.user.id, approvedAt: new Date() } })
    if (changed.count !== 1) throw new HttpError(409, 'Count changed concurrently.')
    for (const item of count.items) {
      const stock = await tx.warehouseStock.findUnique({ where: { productId_warehouseId: { productId: item.productId, warehouseId: count.warehouseId } } })
      if ((stock?.quantity || 0) !== item.expectedQuantity || (stock?.reservedQuantity || 0) !== item.expectedReservedQuantity ||
        (stock?.updatedAt?.getTime() ?? null) !== (item.expectedStockUpdatedAt?.getTime() ?? null)) {
        throw new HttpError(409, `Stock changed after the snapshot for ${item.product.sku}. Cancel and start a fresh count.`)
      }
      if (item.countedQuantity === null) throw new HttpError(409, 'A submitted count has an incomplete line.')
      const missing = item.serials.filter(serial => serial.isExpected && !serial.isScanned)
      const unexpected = item.serials.filter(serial => !serial.isExpected && serial.isScanned)
      if (item.product.trackSerialNumbers) {
        const current = await tx.serialNumber.findMany({ where: { productId: item.productId, warehouseId: count.warehouseId, status: { notIn: ['ASSIGNED', 'DISPOSED', 'MISSING', 'ISSUED'] } } })
        const expected = item.serials.filter(serial => serial.isExpected)
        if (current.length !== expected.length || expected.some(serial => !current.some(actual => actual.id === serial.serialNumberId && actual.status === serial.expectedStatus))) {
          throw new HttpError(409, `Serial inventory changed after the snapshot for ${item.product.sku}.`)
        }
        if (missing.some(serial => serial.expectedStatus !== 'AVAILABLE')) throw new HttpError(409, 'Reserved or held serials cannot be removed through a stock count.')
        await validateSerials(tx, item.product, count.warehouseId, -missing.length, missing.map(serial => serial.serialNumber))
        const existing = await tx.serialNumber.findMany({ where: { serialNumber: { in: unexpected.map(serial => serial.serialNumber) } } })
        if (existing.some(serial => serial.productId !== item.productId || serial.warehouseId !== count.warehouseId || serial.status !== 'MISSING')) throw new HttpError(409, 'An unexpected serial already belongs to inventory or an asset.')
        if (missing.length) {
          const removed = await tx.serialNumber.updateMany({ where: { id: { in: missing.map(serial => serial.serialNumberId) }, status: 'AVAILABLE', warehouseId: count.warehouseId }, data: { status: 'MISSING' } })
          if (removed.count !== missing.length) throw new HttpError(409, 'Serial inventory changed concurrently.')
          await recordSerialEvents(tx, missing.map(serial => serial.serialNumberId), { type: 'COUNT_MISSING', fromStatus: 'AVAILABLE', toStatus: 'MISSING', warehouseId: count.warehouseId,
            referenceType: 'StockCount', referenceId: id, referenceNumber: count.countNumber }, req)
        }
        for (const serial of unexpected) {
          const recovered = existing.find(actual => actual.serialNumber === serial.serialNumber)
          const created = recovered ? await tx.serialNumber.update({ where: { id: recovered.id }, data: { status: 'AVAILABLE' } }) : await tx.serialNumber.create({ data: { productId: item.productId, warehouseId: count.warehouseId, serialNumber: serial.serialNumber } })
          await tx.stockCountSerial.update({ where: { id: serial.id }, data: { serialNumberId: created.id } })
          await recordSerialEvents(tx, [created.id], { type: recovered ? 'COUNT_RECOVERED' : 'COUNT_DISCOVERED', fromStatus: recovered ? 'MISSING' : null, toStatus: 'AVAILABLE', warehouseId: count.warehouseId,
            referenceType: 'StockCount', referenceId: id, referenceNumber: count.countNumber }, req)
        }
      }
      const variance = item.countedQuantity - item.expectedQuantity
      // A replacement of serials at equal quantity still has a traceable reconciliation movement.
      if (variance || missing.length || unexpected.length) {
        await changeStock(tx, { productId: item.productId, warehouseId: count.warehouseId, delta: variance, type: 'CORRECTION',
          referenceNumber: count.countNumber, userId: req.user.id, notes: item.notes || `Approved physical count ${count.countNumber}` })
        const adjustment = await tx.stockAdjustment.create({ data: {
          referenceNumber: await nextReference(tx, 'adjustment', `ADJ-${new Date().getFullYear()}`), productId: item.productId,
          warehouseId: count.warehouseId, type: 'CORRECTION', quantity: item.countedQuantity, reason: `Approved stock count ${count.countNumber}`, userId: req.user.id, notes: item.notes
        } })
        await tx.stockCountItem.update({ where: { id: item.id }, data: { adjustmentId: adjustment.id } })
      }
    }
    await audit(tx, req, 'APPROVED', 'Stock Counts', 'StockCount', id, `Approved ${count.countNumber} and reconciled inventory variances.`, { warehouseId: count.warehouseId })
    return { id, status: 'APPROVED' }
  })
}

export async function cancelCount(id, req) {
  return inventoryTransaction(async tx => {
    const count = await authorizedCount(tx, id, req.user)
    if (['APPROVED', 'CANCELLED'].includes(count.status)) throw new HttpError(409, 'This stock count is already closed.')
    const changed = await tx.stockCount.updateMany({ where: { id, status: count.status }, data: { status: 'CANCELLED' } })
    if (changed.count !== 1) throw new HttpError(409, 'Count changed concurrently.')
    await audit(tx, req, 'CANCELLED', 'Stock Counts', 'StockCount', id, `Cancelled ${count.countNumber}.`, { warehouseId: count.warehouseId })
    return { id, status: 'CANCELLED' }
  })
}
