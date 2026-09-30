import { requireWarehouseAccess } from './warehouseAccessService.js'
import { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma.js'
import { audit } from '../utils/audit.js'
import { HttpError } from '../utils/http.js'
import { nextReference } from '../utils/references.js'
import { recordSerialEvents } from '../utils/serialEvents.js'

export async function inventoryTransaction(work) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000
      })
    } catch (error) {
      if (error.code !== 'P2034' || attempt === 2) throw error
      // Let the competing transaction commit before restarting a fresh snapshot.
      await new Promise(resolve => setTimeout(resolve, 25 * (2 ** attempt) + Math.floor(Math.random() * 50)))
    }
  }
}

const uniqueSerials = serials => new Set(serials).size === serials.length

export async function validateSerials(tx, product, warehouseId, delta, serials = []) {
  if (!product.trackSerialNumbers || delta === 0) {
    if (serials.length) throw new HttpError(400, 'Serial numbers are only accepted for a serialized stock change.')
    return
  }
  if (serials.length !== Math.abs(delta) || !uniqueSerials(serials)) {
    throw new HttpError(400, 'Serial number count must match quantity and each serial must be unique.')
  }
  if (delta < 0) {
    const count = await tx.serialNumber.count({ where: {
      productId: product.id, warehouseId, status: 'AVAILABLE', serialNumber: { in: serials }
    } })
    if (count !== serials.length) throw new HttpError(400, 'One or more serial numbers are unavailable at this warehouse.')
  } else {
    const count = await tx.serialNumber.count({ where: { serialNumber: { in: serials } } })
    if (count) throw new HttpError(409, 'A serial number already exists.')
  }
}

export async function changeStock(tx, {
  productId, warehouseId, delta, type, referenceNumber, userId,
  notes, sourceWarehouseId, destinationWarehouseId
}) {
  const product = await tx.product.findUnique({ where: { id: productId } })
  const warehouse = await tx.warehouse.findUnique({ where: { id: warehouseId } })
  if (!product || product.status === 'ARCHIVED') throw new HttpError(404, 'Product not found or archived.')
  if (!warehouse || warehouse.status !== 'ACTIVE') throw new HttpError(404, 'Warehouse not found or inactive.')
  await tx.warehouseStock.upsert({
    where: { productId_warehouseId: { productId, warehouseId } },
    create: { productId, warehouseId, quantity: 0, reservedQuantity: 0 },
    update: {}
  })
  const stock = await tx.warehouseStock.findUnique({ where: { productId_warehouseId: { productId, warehouseId } } })
  const nextQuantity = stock.quantity + delta
  if (nextQuantity < stock.reservedQuantity) throw new HttpError(400, 'Insufficient available stock.')
  const changed = await tx.warehouseStock.updateMany({
    where: { id: stock.id, quantity: stock.quantity, reservedQuantity: stock.reservedQuantity },
    data: { quantity: nextQuantity }
  })
  if (changed.count !== 1) throw new HttpError(409, 'Stock changed concurrently. Please retry.')
  const movement = await tx.stockMovement.create({ data: {
    referenceNumber, productId, warehouseId, type, quantity: delta,
    previousQuantity: stock.quantity, newQuantity: nextQuantity,
    sourceWarehouseId, destinationWarehouseId, userId, notes
  } })
  const threshold = product.reorderPoint || product.minimumStock
  const previousAvailable = stock.quantity - stock.reservedQuantity
  const currentAvailable = nextQuantity - stock.reservedQuantity
  if (delta < 0 && previousAvailable > threshold && currentAvailable <= threshold) {
    const admins = await tx.user.findMany({ where: { role: { name: 'Administrator' }, status: 'ACTIVE' }, select: { id: true } })
    if (admins.length) await tx.notification.createMany({ data: admins.map(user => ({
      userId: user.id, type: currentAvailable === 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK',
      title: currentAvailable === 0 ? 'Product out of stock' : 'Low stock alert',
      message: `${product.name} has ${currentAvailable} available units at ${warehouse.name}.`,
      referenceType: 'Product', referenceId: product.id, warehouseId
    })) })
  }
  return { stock: { ...stock, quantity: nextQuantity, availableQuantity: currentAvailable }, movement }
}

export async function adjustStock(input, req) {
  requireWarehouseAccess(req.user, input.warehouseId)
  return inventoryTransaction(async tx => {
    const product = await tx.product.findUnique({ where: { id: input.productId } })
    if (!product) throw new HttpError(404, 'Product not found.')
    const stock = await tx.warehouseStock.findUnique({ where: { productId_warehouseId: { productId: input.productId, warehouseId: input.warehouseId } } })
    const current = stock?.quantity || 0
    const delta = input.type === 'CORRECTION' ? input.quantity - current
      : ['STOCK_OUT', 'DAMAGE'].includes(input.type) ? -input.quantity : input.quantity
    await validateSerials(tx, product, input.warehouseId, delta, input.serialNumbers || [])
    const referenceNumber = input.referenceNumber || await nextReference(tx, 'adjustment', `ADJ-${new Date().getFullYear()}`)
    const movementType = ['DAMAGE', 'CORRECTION', 'RETURN', 'OPENING_STOCK'].includes(input.type) ? input.type : input.type
    const result = await changeStock(tx, {
      productId: input.productId, warehouseId: input.warehouseId, delta,
      type: movementType, referenceNumber, userId: req.user.id,
      notes: input.notes || input.reason
    })
    const serials = input.serialNumbers || []
    if (product.trackSerialNumbers && delta > 0) {
      const warrantyStart = new Date()
      const warrantyEnd = new Date(warrantyStart)
      warrantyEnd.setMonth(warrantyEnd.getMonth() + product.warrantyMonths)
      await tx.serialNumber.createMany({ data: serials.map(serialNumber => ({
        serialNumber, productId: product.id, warehouseId: input.warehouseId,
        warrantyStart, warrantyEnd
      })) })
    }
    if (product.trackSerialNumbers && delta < 0) {
      await tx.serialNumber.updateMany({
        where: { serialNumber: { in: serials } }, data: { status: 'DISPOSED' }
      })
    }
    const adjustment = await tx.stockAdjustment.create({ data: {
      referenceNumber, productId: input.productId, warehouseId: input.warehouseId,
      type: input.type, quantity: input.quantity, reason: input.reason,
      notes: input.notes, userId: req.user.id
    } })
    if (product.trackSerialNumbers && serials.length) {
      const affected = await tx.serialNumber.findMany({ where: { serialNumber: { in: serials } }, select: { id: true } })
      await recordSerialEvents(tx, affected.map(serial => serial.id), { type: delta > 0 ? 'STOCK_ADDED' : 'STOCK_REMOVED', fromStatus: delta < 0 ? 'AVAILABLE' : null,
        toStatus: delta < 0 ? 'DISPOSED' : 'AVAILABLE', warehouseId: input.warehouseId, referenceType: 'StockAdjustment', referenceId: adjustment.id, referenceNumber, notes: input.reason }, req)
    }
    await audit(tx, req, 'ADJUSTED', 'Inventory', 'StockAdjustment', adjustment.id, `${input.type} ${input.quantity} ${product.sku}`, { warehouseId: input.warehouseId })
    return { adjustment, ...result }
  })
}

export async function changeSerialStatus(id, status, req) {
  return inventoryTransaction(async tx => {
    const serial = await tx.serialNumber.findUnique({ where: { id } })
    if (!serial) throw new HttpError(404, 'Serial number not found.')
    requireWarehouseAccess(req.user, serial.warehouseId)
    if (!serial.warehouseId || ['ASSIGNED', 'DISPOSED', 'MISSING', 'ISSUED'].includes(serial.status)) {
      throw new HttpError(409, 'This serial is managed through its asset or stock movement.')
    }
    if (serial.status === status) return serial
    if (await tx.inventoryReservationSerial.count({ where: { serialNumberId: id, fulfilledAt: null, item: { reservation: { status: 'ACTIVE' } } } })) throw new HttpError(409, 'Release or fulfill this serial through its inventory reservation.')
    const held = value => ['RESERVED', 'DEFECTIVE', 'FOR_REPAIR', 'RETURNED'].includes(value)
    const reservationDelta = Number(held(status)) - Number(held(serial.status))
    const stock = await tx.warehouseStock.findUnique({ where: {
      productId_warehouseId: { productId: serial.productId, warehouseId: serial.warehouseId }
    } })
    if (!stock) throw new HttpError(409, 'Warehouse balance is missing for this serial.')
    if (reservationDelta) {
      if (!stock || stock.reservedQuantity + reservationDelta < 0 || stock.reservedQuantity + reservationDelta > stock.quantity) {
        throw new HttpError(409, 'Warehouse balance cannot support this serial status.')
      }
      const changed = await tx.warehouseStock.updateMany({
        where: { id: stock.id, reservedQuantity: stock.reservedQuantity },
        data: { reservedQuantity: { increment: reservationDelta } }
      })
      if (changed.count !== 1) throw new HttpError(409, 'Warehouse balance changed concurrently.')
    }
    const changed = await tx.serialNumber.updateMany({ where: { id, status: serial.status }, data: { status } })
    if (changed.count !== 1) throw new HttpError(409, 'Serial status changed concurrently.')
    const referenceNumber = await nextReference(tx, 'serial-status', 'SER')
    await tx.stockMovement.create({ data: { productId: serial.productId, warehouseId: serial.warehouseId, quantity: 0,
      previousQuantity: stock.quantity, newQuantity: stock.quantity, previousReservedQuantity: stock.reservedQuantity,
      newReservedQuantity: stock.reservedQuantity + reservationDelta, type: 'CORRECTION', referenceNumber, userId: req.user.id,
      notes: `${serial.serialNumber}: ${serial.status} → ${status}` } })
    await recordSerialEvents(tx, [id], { type: 'STATUS_CHANGED', fromStatus: serial.status, toStatus: status, warehouseId: serial.warehouseId,
      referenceType: 'SerialNumber', referenceId: id, referenceNumber }, req)
    await audit(tx, req, 'STATUS_CHANGED', 'Serial Numbers', 'SerialNumber', id, `Changed ${serial.serialNumber} to ${status}.`, { warehouseId: serial.warehouseId })
    return tx.serialNumber.findUnique({ where: { id } })
  })
}
