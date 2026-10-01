import { prisma } from '../config/prisma.js'
import { inventoryTransaction, changeStock } from './inventoryService.js'
import { warehouseWhere, requireWarehouseAccess } from './warehouseAccessService.js'
import { HttpError } from '../utils/http.js'
import { paginate } from '../utils/query.js'
import { nextReference } from '../utils/references.js'
import { recordSerialEvents } from '../utils/serialEvents.js'
import { audit } from '../utils/audit.js'

const include = { warehouse: { select: { id: true, name: true, code: true } }, requestedBy: { select: { firstName: true, lastName: true } }, _count: { select: { items: true } } }
const itemInclude = { product: true, serials: { include: { serial: { select: { id: true, serialNumber: true, status: true } } } } }
async function reservation(tx, id, user, detail = false) {
  const record = await tx.inventoryReservation.findUnique({ where: { id }, include: detail ? { ...include, items: { include: itemInclude } } : include })
  if (!record) throw new HttpError(404, 'Reservation not found.')
  if (user) requireWarehouseAccess(user, record.warehouseId)
  return record
}
function active(record) { if (record.status !== 'ACTIVE') throw new HttpError(409, 'Reservation is already closed.') }
function unexpired(record) { if (record.expiresAt && record.expiresAt <= new Date()) throw new HttpError(409, 'Reservation has expired and cannot be fulfilled.') }

// A reservation changes availability without changing physical on-hand quantity.
async function hold(tx, { productId, warehouseId, delta, referenceNumber, userId, type, notes }) {
  const stock = await tx.warehouseStock.findUnique({ where: { productId_warehouseId: { productId, warehouseId } } })
  const nextReserved = (stock?.reservedQuantity || 0) + delta
  if (!stock || nextReserved < 0 || nextReserved > stock.quantity) throw new HttpError(409, 'Insufficient available inventory for this reservation.')
  const changed = await tx.warehouseStock.updateMany({ where: { id: stock.id, quantity: stock.quantity, reservedQuantity: stock.reservedQuantity }, data: { reservedQuantity: nextReserved } })
  if (changed.count !== 1) throw new HttpError(409, 'Stock changed concurrently. Please retry.')
  await tx.stockMovement.create({ data: { productId, warehouseId, referenceNumber, userId, type, quantity: 0, previousQuantity: stock.quantity, newQuantity: stock.quantity,
    previousReservedQuantity: stock.reservedQuantity, newReservedQuantity: nextReserved, notes } })
}

export async function listReservations(query, user) {
  const where = warehouseWhere(user, query.warehouse)
  if (query.status) { if (!['ACTIVE', 'FULFILLED', 'RELEASED', 'EXPIRED', 'CANCELLED'].includes(query.status)) throw new HttpError(400, 'Invalid reservation status.'); where.status = query.status }
  if (query.search) where.OR = [{ reservationNumber: { contains: query.search } }, { referenceId: { contains: query.search } }]
  return paginate(prisma.inventoryReservation, { where, include, query, allowedSort: ['createdAt', 'reservationNumber', 'expiresAt', 'status'], defaultSort: 'createdAt' })
}
export const getReservation = (id, user) => reservation(prisma, id, user)
export async function reservationAvailability(query, user) {
  if (!query.warehouse) throw new HttpError(400, 'Select a warehouse.')
  const where = warehouseWhere(user, query.warehouse)
  where.product = { status: 'ACTIVE', ...(query.search ? { OR: [{ name: { contains: query.search } }, { sku: { contains: query.search } }] } : {}) }
  if (query.product) where.productId = query.product
  const result = await paginate(prisma.warehouseStock, { where, include: { product: { select: { id: true, name: true, sku: true, trackSerialNumbers: true } } }, query, allowedSort: ['productId', 'quantity', 'reservedQuantity'], defaultSort: 'productId' })
  result.data = result.data.map(stock => ({ ...stock, availableQuantity: stock.quantity - stock.reservedQuantity }))
  return result
}
export async function reservationItems(id, query, user) {
  await reservation(prisma, id, user)
  const where = { reservationId: id }
  if (query.search) where.product = { OR: [{ name: { contains: query.search } }, { sku: { contains: query.search } }] }
  return paginate(prisma.inventoryReservationItem, { where, include: itemInclude, query, allowedSort: ['productId', 'quantity', 'fulfilledQuantity'], defaultSort: 'productId' })
}
export async function createReservation(input, req) {
  requireWarehouseAccess(req.user, input.warehouseId)
  if (input.expiresAt && new Date(input.expiresAt) <= new Date()) throw new HttpError(400, 'Expiry must be in the future.')
  return inventoryTransaction(async tx => {
    const warehouse = await tx.warehouse.findUnique({ where: { id: input.warehouseId } })
    if (warehouse?.status !== 'ACTIVE') throw new HttpError(400, 'Warehouse is unavailable.')
    const { items, ...metadata } = input, year = new Date().getFullYear()
    const created = await tx.inventoryReservation.create({ data: { ...metadata, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      requestedById: req.user.id, reservationNumber: await nextReference(tx, `reservation-${year}`, `RSV-${year}`) } })
    for (const line of items) {
      const product = await tx.product.findUnique({ where: { id: line.productId } })
      if (product?.status !== 'ACTIVE') throw new HttpError(400, 'Product is unavailable.')
      const exact = line.serialNumbers || []
      if (new Set(exact).size !== exact.length || (exact.length && exact.length !== line.quantity)) throw new HttpError(400, 'Select one unique serial per reserved unit.')
      if (!product.trackSerialNumbers && exact.length) throw new HttpError(400, 'This product does not track serials.')
      const serials = product.trackSerialNumbers ? await tx.serialNumber.findMany({ where: { productId: product.id, warehouseId: input.warehouseId, status: 'AVAILABLE', asset: null, ...(exact.length ? { serialNumber: { in: exact } } : {}) }, orderBy: { serialNumber: 'asc' }, take: line.quantity }) : []
      if (product.trackSerialNumbers && serials.length !== line.quantity) throw new HttpError(409, 'Insufficient available serials at this warehouse.')
      await hold(tx, { productId: product.id, warehouseId: input.warehouseId, delta: line.quantity, referenceNumber: created.reservationNumber, userId: req.user.id, type: 'RESERVATION_CREATED', notes: input.notes })
      if (serials.length) {
        const changed = await tx.serialNumber.updateMany({ where: { id: { in: serials.map(serial => serial.id) }, status: 'AVAILABLE', warehouseId: input.warehouseId }, data: { status: 'RESERVED' } })
        if (changed.count !== serials.length) throw new HttpError(409, 'Serials changed concurrently.')
        await recordSerialEvents(tx, serials.map(serial => serial.id), { type: 'RESERVED', fromStatus: 'AVAILABLE', toStatus: 'RESERVED', warehouseId: input.warehouseId,
          referenceType: 'InventoryReservation', referenceId: created.id, referenceNumber: created.reservationNumber }, req)
      }
      await tx.inventoryReservationItem.create({ data: { reservationId: created.id, productId: product.id, quantity: line.quantity, serials: { create: serials.map(serial => ({ serialNumberId: serial.id })) } } })
    }
    await audit(tx, req, 'RESERVED', 'Reservations', 'InventoryReservation', created.id, `Reserved stock under ${created.reservationNumber}.`, { warehouseId: input.warehouseId })
    return reservation(tx, created.id, req.user)
  })
}

export async function fulfillReservation(id, input, req) {
  return inventoryTransaction(async tx => {
    const record = await reservation(tx, id, req.user, true); active(record); unexpired(record)
    for (const line of input.items) {
      const item = record.items.find(item => item.id === line.id)
      if (!item) throw new HttpError(400, 'Item does not belong to this reservation.')
      if (line.expectedFulfilledQuantity !== item.fulfilledQuantity || line.quantity > item.quantity - item.fulfilledQuantity) throw new HttpError(409, 'Fulfillment changed or exceeds remaining quantity. Reload this reservation.')
      const pendingSerials = item.serials.filter(serial => !serial.fulfilledAt), exact = line.serialNumbers || []
      if (new Set(exact).size !== exact.length || (exact.length && exact.length !== line.quantity)) throw new HttpError(400, 'Select one unique serial per fulfilled unit.')
      const selected = item.product.trackSerialNumbers ? (exact.length ? pendingSerials.filter(selection => exact.includes(selection.serial.serialNumber)) : pendingSerials.slice(0, line.quantity)) : []
      if ((!item.product.trackSerialNumbers && exact.length) || (item.product.trackSerialNumbers && selected.length !== line.quantity)) throw new HttpError(400, 'Fulfillment serials must belong to the remaining reservation.')
      if (selected.length) {
        const changed = await tx.serialNumber.updateMany({ where: { id: { in: selected.map(selection => selection.serialNumberId) }, warehouseId: record.warehouseId, status: 'RESERVED' }, data: { status: 'ISSUED' } })
        if (changed.count !== selected.length) throw new HttpError(409, 'Reserved serials have changed.')
        await tx.inventoryReservationSerial.updateMany({ where: { id: { in: selected.map(selection => selection.id) }, fulfilledAt: null }, data: { fulfilledAt: new Date() } })
        await recordSerialEvents(tx, selected.map(selection => selection.serialNumberId), { type: 'ISSUED', fromStatus: 'RESERVED', toStatus: 'ISSUED', warehouseId: record.warehouseId,
          referenceType: 'InventoryReservation', referenceId: id, referenceNumber: record.reservationNumber }, req)
      }
      const stock = await tx.warehouseStock.findUnique({ where: { productId_warehouseId: { productId: item.productId, warehouseId: record.warehouseId } } })
      if (!stock || stock.reservedQuantity < line.quantity) throw new HttpError(409, 'Reserved balance is inconsistent.')
      const released = await tx.warehouseStock.updateMany({ where: { id: stock.id, quantity: stock.quantity, reservedQuantity: stock.reservedQuantity }, data: { reservedQuantity: { decrement: line.quantity } } })
      if (released.count !== 1) throw new HttpError(409, 'Stock changed concurrently.')
      const { movement } = await changeStock(tx, { productId: item.productId, warehouseId: record.warehouseId, delta: -line.quantity, type: 'STOCK_OUT', referenceNumber: record.reservationNumber, userId: req.user.id, notes: `Fulfilled reservation ${record.reservationNumber}` })
      await tx.stockMovement.update({ where: { id: movement.id }, data: { previousReservedQuantity: stock.reservedQuantity, newReservedQuantity: stock.reservedQuantity - line.quantity } })
      const changed = await tx.inventoryReservationItem.updateMany({ where: { id: item.id, fulfilledQuantity: line.expectedFulfilledQuantity }, data: { fulfilledQuantity: { increment: line.quantity } } })
      if (changed.count !== 1) throw new HttpError(409, 'Reservation changed concurrently.')
      item.fulfilledQuantity += line.quantity
    }
    if (record.items.every(item => item.fulfilledQuantity === item.quantity)) await tx.inventoryReservation.update({ where: { id }, data: { status: 'FULFILLED', closedAt: new Date() } })
    else await tx.inventoryReservation.update({ where: { id }, data: { updatedAt: new Date() } })
    await audit(tx, req, 'FULFILLED', 'Reservations', 'InventoryReservation', id, `Issued reserved inventory from ${record.reservationNumber}.`, { warehouseId: record.warehouseId,before:record,after:await tx.inventoryReservation.findUnique({where:{id}}) })
    return reservation(tx, id, req.user)
  })
}

async function closeReservation(tx, record, status, req) {
  active(record)
  const changed = await tx.inventoryReservation.updateMany({ where: { id: record.id, status: 'ACTIVE' }, data: { status, closedAt: new Date() } })
  if (changed.count !== 1) throw new HttpError(409, 'Reservation changed concurrently.')
  for (const item of record.items) {
    const remaining = item.quantity - item.fulfilledQuantity
    if (!remaining) continue
    const serials = item.serials.filter(serial => !serial.fulfilledAt)
    if (serials.length) {
      const released = await tx.serialNumber.updateMany({ where: { id: { in: serials.map(selection => selection.serialNumberId) }, status: 'RESERVED', warehouseId: record.warehouseId }, data: { status: 'AVAILABLE' } })
      if (released.count !== serials.length) throw new HttpError(409, 'Reserved serials have changed.')
      await recordSerialEvents(tx, serials.map(selection => selection.serialNumberId), { type: status === 'EXPIRED' ? 'RESERVATION_EXPIRED' : 'RELEASED', fromStatus: 'RESERVED', toStatus: 'AVAILABLE', warehouseId: record.warehouseId,
        referenceType: 'InventoryReservation', referenceId: record.id, referenceNumber: record.reservationNumber, notes: status.toLowerCase() }, req)
    }
    await hold(tx, { productId: item.productId, warehouseId: record.warehouseId, delta: -remaining, referenceNumber: record.reservationNumber,
      userId: req.user?.id || null, type: status === 'EXPIRED' ? 'RESERVATION_EXPIRED' : 'RESERVATION_RELEASED', notes: `${status.toLowerCase()} ${record.reservationNumber}` })
  }
  await audit(tx, req, status, 'Reservations', 'InventoryReservation', record.id, `${status.toLowerCase()} ${record.reservationNumber}; released remaining holds.`, { warehouseId: record.warehouseId,before:record,after:await tx.inventoryReservation.findUnique({where:{id:record.id}}) })
  return { id: record.id, status }
}
export async function releaseReservation(id, req, status = 'RELEASED') {
  if (!['RELEASED', 'CANCELLED'].includes(status)) throw new HttpError(400, 'Invalid closing status.')
  return inventoryTransaction(async tx => closeReservation(tx, await reservation(tx, id, req.user, true), status, req))
}
export async function expireReservations(now = new Date()) {
  const due = await prisma.inventoryReservation.findMany({ where: { status: 'ACTIVE', expiresAt: { lte: now } }, select: { id: true }, orderBy: { expiresAt: 'asc' }, take: 100 })
  let expired = 0
  for (const { id } of due) {
    const committed = await inventoryTransaction(async tx => {
    const record = await reservation(tx, id, null, true)
    if (record.status !== 'ACTIVE' || !record.expiresAt || record.expiresAt > now) return
    await closeReservation(tx, record, 'EXPIRED', { user: null, get: () => null }); return true
    })
    if (committed) expired++
  }
  return expired
}
