import { notificationWriter } from './notificationDelivery.js'
import { transferWhere, requireTransferAccess, requireWarehouseAccess } from './warehouseAccessService.js'
import { prisma } from '../config/prisma.js'
import { inventoryTransaction, changeStock } from './inventoryService.js'
import { paginate } from '../utils/query.js'
import { audit } from '../utils/audit.js'
import { HttpError } from '../utils/http.js'
import { nextReference } from '../utils/references.js'
import { recordSerialEvents } from '../utils/serialEvents.js'
import { transferInclude, receiveLegacyTransfer } from './transferReceiptService.js'

const include = transferInclude

export async function listTransfers(query, user) {
  if (query.status && !['DRAFT', 'PENDING', 'APPROVED', 'IN_TRANSIT', 'PARTIAL', 'DISCREPANCY', 'RECEIVED', 'RESOLVED', 'CANCELLED'].includes(query.status)) throw new HttpError(400, 'Invalid transfer status.')
  const where = { AND: [transferWhere(user, query.warehouse)] }
  if (query.status) where.status = query.status
  if (query.warehouse) where.OR = [{ sourceWarehouseId: query.warehouse }, { destinationWarehouseId: query.warehouse }]
  if (query.search) where.transferNumber = { contains: query.search }
  return paginate(prisma.stockTransfer, { where, include, query, allowedSort: ['createdAt', 'requestedAt', 'status'], defaultSort: 'createdAt' })
}

export async function getTransfer(id, user) {
  const transfer = await prisma.stockTransfer.findUnique({ where: { id }, include })
  if (!transfer) throw new HttpError(404, 'Transfer not found.')
  requireTransferAccess(user, transfer)
  return transfer
}

async function checkItems(tx, input) {
  const ids = input.items.map(item => item.productId)
  if (await tx.product.count({ where: { id: { in: ids }, status: 'ACTIVE' } }) !== ids.length) throw new HttpError(400, 'One or more products are unavailable.')
  const locations = await tx.warehouse.findMany({ where: { id: { in: [input.sourceWarehouseId, input.destinationWarehouseId] }, status: 'ACTIVE' } })
  if (locations.length !== 2) throw new HttpError(400, 'Source or destination warehouse is unavailable.')
}

export async function createTransfer(input, req) {
  requireWarehouseAccess(req.user, input.sourceWarehouseId)
  return inventoryTransaction(async tx => {
    await checkItems(tx, input)
    const transferNumber = await nextReference(tx, `transfer-${new Date().getFullYear()}`, `TRF-${new Date().getFullYear()}`)
    const transfer = await tx.stockTransfer.create({ data: {
      transferNumber, sourceWarehouseId: input.sourceWarehouseId,
      destinationWarehouseId: input.destinationWarehouseId,
      requestedById: req.user.id, notes: input.notes,
      items: { create: input.items.map(item => ({ productId: item.productId, quantity: item.quantity })) }
    }, include })
    await audit(tx, req, 'CREATED', 'Transfers', 'StockTransfer', transfer.id, `Created ${transferNumber}.`, { warehouseId: transfer.sourceWarehouseId, relatedWarehouseId: transfer.destinationWarehouseId })
    return transfer
  })
}

export async function updateTransfer(id, input, req) {
  return inventoryTransaction(async tx => {
    const transfer = await tx.stockTransfer.findUnique({ where: { id } })
    if (!transfer) throw new HttpError(404, 'Transfer not found.')
    requireTransferAccess(req.user, transfer, 'edit')
    requireWarehouseAccess(req.user, transfer.sourceWarehouseId)
    if (transfer.status !== 'DRAFT') throw new HttpError(409, 'Only draft transfers can be edited.')
    requireWarehouseAccess(req.user, input.sourceWarehouseId)
    await checkItems(tx, input)
    await tx.stockTransferItem.deleteMany({ where: { transferId: id } })
    const updated = await tx.stockTransfer.update({ where: { id }, data: {
      sourceWarehouseId: input.sourceWarehouseId, destinationWarehouseId: input.destinationWarehouseId,
      notes: input.notes, items: { create: input.items.map(item => ({ productId: item.productId, quantity: item.quantity })) }
    }, include })
    await audit(tx, req, 'UPDATED', 'Transfers', 'StockTransfer', id, `Updated ${transfer.transferNumber}.`, { warehouseId: transfer.sourceWarehouseId, relatedWarehouseId: transfer.destinationWarehouseId })
    return updated
  })
}

export async function transitionTransfer(id, event, req, input = {}) {
  if (event === 'receive') return receiveLegacyTransfer(id, input, req)
  const transitions = {
    submit: { from: 'DRAFT', to: 'PENDING' },
    approve: { from: 'PENDING', to: 'APPROVED' },
    ship: { from: 'APPROVED', to: 'IN_TRANSIT' }
  }
  return inventoryTransaction(async tx => {
    const transfer = await tx.stockTransfer.findUnique({ where: { id }, include })
    if (!transfer) throw new HttpError(404, 'Transfer not found.')
    requireTransferAccess(req.user, transfer, event)
    if (input.expectedUpdatedAt && new Date(input.expectedUpdatedAt).getTime() !== transfer.updatedAt.getTime()) throw new HttpError(409, 'Transfer changed. Reload before continuing.')
    if (event === 'cancel') {
      if (!['DRAFT', 'PENDING', 'APPROVED'].includes(transfer.status)) throw new HttpError(409, 'A shipped or completed transfer cannot be cancelled.')
      const cancelled = await tx.stockTransfer.update({ where: { id }, data: { status: 'CANCELLED' } })
      await audit(tx, req, 'CANCELLED', 'Transfers', 'StockTransfer', id, `Cancelled ${transfer.transferNumber}.`, { warehouseId: transfer.sourceWarehouseId, relatedWarehouseId: transfer.destinationWarehouseId })
      return cancelled
    }
    const transition = transitions[event]
    if (!transition) throw new HttpError(400, 'Invalid transfer action.')
    if (transfer.status !== transition.from) throw new HttpError(409, `Cannot ${event} a ${transfer.status.toLowerCase()} transfer.`)
    if (input.items && event === 'ship') {
      if (input.items.some(line => !transfer.items.some(item => item.id === line.id && item.product.trackSerialNumbers))) throw new HttpError(400, 'Scanned item must be a serialized line in this transfer.')
      for (const item of transfer.items.filter(item => item.product.trackSerialNumbers)) {
        const scans = input.items.find(line => line.id === item.id)?.serialNumbers
        if (!scans || scans.length !== item.quantity || new Set(scans).size !== scans.length) throw new HttpError(400, `Scan every serial for ${item.product.sku} exactly once.`)
      }
    }
    if (event === 'ship') {
      for (const item of transfer.items) {
        if (item.product.trackSerialNumbers) {
          const serials = await tx.serialNumber.findMany({
            where: { productId: item.productId, warehouseId: transfer.sourceWarehouseId, status: 'AVAILABLE', asset: null,
              maintenanceRecords: { none: { status: { in: ['SCHEDULED', 'IN_REPAIR'] } } }, reservationSelections: { none: { fulfilledAt: null, item: { reservation: { status: 'ACTIVE' } } } },
              ...(input.items ? { serialNumber: { in: input.items.find(line=>line.id===item.id).serialNumbers } } : {}) },
            orderBy: { createdAt: 'asc' }, take: item.quantity
          })
          if (serials.length !== item.quantity) throw new HttpError(400, `Insufficient available serial numbers for ${item.product.sku}.`)
          const changed = await tx.serialNumber.updateMany({
            where: { id: { in: serials.map(serial => serial.id) }, status: 'AVAILABLE' },
            data: { status: 'RESERVED', warehouseId: null }
          })
          if (changed.count !== serials.length) throw new HttpError(409, 'Serial numbers changed concurrently. Please retry.')
          await tx.stockTransferSerial.createMany({ data: serials.map(serial => ({ transferItemId: item.id, serialNumberId: serial.id })) })
          await recordSerialEvents(tx, serials.map(serial => serial.id), { type: 'TRANSFER_SHIPPED', fromStatus: 'AVAILABLE', toStatus: 'RESERVED',
            warehouseId: transfer.sourceWarehouseId, relatedWarehouseId: transfer.destinationWarehouseId,
            referenceType: 'StockTransfer', referenceId: id, referenceNumber: transfer.transferNumber }, req)
        }
        await changeStock(tx, {
          productId: item.productId, warehouseId: transfer.sourceWarehouseId,
          delta: -item.quantity, type: 'TRANSFER_OUT', referenceNumber: transfer.transferNumber,
          sourceWarehouseId: transfer.sourceWarehouseId, destinationWarehouseId: transfer.destinationWarehouseId,
          userId: req.user.id, notes: transfer.notes
        })
      }
    }
    const data = { status: transition.to,
      ...(event === 'approve' ? { approvedById: req.user.id, approvedAt: new Date() } : {}),
      ...(event === 'ship' ? { shippedAt: new Date() } : {})
    }
    const changed = await tx.stockTransfer.update({ where: { id }, data })
    await audit(tx, req, event.toUpperCase(), 'Transfers', 'StockTransfer', id, `${event} ${transfer.transferNumber}.`, { warehouseId: transfer.sourceWarehouseId, relatedWarehouseId: transfer.destinationWarehouseId,before:transfer,after:changed })
    if (event === 'submit') {
      const approvers = await tx.user.findMany({ where: { role: { name: 'Administrator' }, status: 'ACTIVE' }, select: { id: true } })
      if (approvers.length) await notificationWriter(tx).createMany({ data: approvers.map(user => ({
        userId: user.id, warehouseId: transfer.sourceWarehouseId, type: 'TRANSFER_APPROVAL_REQUEST', title: 'Transfer needs approval',
        message: `${transfer.transferNumber} is awaiting approval.`, referenceType: 'StockTransfer', referenceId: id
      })) })
    }
    if (event === 'approve') await notificationWriter(tx).create({ data: {
      userId: transfer.requestedById, warehouseId: transfer.sourceWarehouseId, type: 'TRANSFER_APPROVED', title: 'Transfer approved',
      message: `${transfer.transferNumber} was approved.`, referenceType: 'StockTransfer', referenceId: id
    } })
    return changed
  })
}
