import { prisma } from '../config/prisma.js'
import { inventoryTransaction, changeStock } from './inventoryService.js'
import { paginate } from '../utils/query.js'
import { audit } from '../utils/audit.js'
import { HttpError } from '../utils/http.js'
import { nextReference } from '../utils/references.js'

const include = {
  sourceWarehouse: true, destinationWarehouse: true,
  requestedBy: { select: { firstName: true, lastName: true } },
  items: { include: { product: true, serialSelections: { include: { serialNumber: true } } } }
}

export async function listTransfers(query) {
  const where = {}
  if (query.status) where.status = query.status
  if (query.warehouse) where.OR = [{ sourceWarehouseId: query.warehouse }, { destinationWarehouseId: query.warehouse }]
  if (query.search) where.transferNumber = { contains: query.search }
  return paginate(prisma.stockTransfer, { where, include, query, allowedSort: ['createdAt', 'requestedAt', 'status'], defaultSort: 'createdAt' })
}

export async function getTransfer(id) {
  const transfer = await prisma.stockTransfer.findUnique({ where: { id }, include })
  if (!transfer) throw new HttpError(404, 'Transfer not found.')
  return transfer
}

async function checkItems(tx, input) {
  const ids = input.items.map(item => item.productId)
  if (await tx.product.count({ where: { id: { in: ids }, status: 'ACTIVE' } }) !== ids.length) throw new HttpError(400, 'One or more products are unavailable.')
  const locations = await tx.warehouse.findMany({ where: { id: { in: [input.sourceWarehouseId, input.destinationWarehouseId] }, status: 'ACTIVE' } })
  if (locations.length !== 2) throw new HttpError(400, 'Source or destination warehouse is unavailable.')
}

export async function createTransfer(input, req) {
  return inventoryTransaction(async tx => {
    await checkItems(tx, input)
    const transferNumber = await nextReference(tx, `transfer-${new Date().getFullYear()}`, `TRF-${new Date().getFullYear()}`)
    const transfer = await tx.stockTransfer.create({ data: {
      transferNumber, sourceWarehouseId: input.sourceWarehouseId,
      destinationWarehouseId: input.destinationWarehouseId,
      requestedById: req.user.id, notes: input.notes,
      items: { create: input.items.map(item => ({ productId: item.productId, quantity: item.quantity })) }
    }, include })
    await audit(tx, req, 'CREATED', 'Transfers', 'StockTransfer', transfer.id, `Created ${transferNumber}.`)
    return transfer
  })
}

export async function updateTransfer(id, input, req) {
  return inventoryTransaction(async tx => {
    const transfer = await tx.stockTransfer.findUnique({ where: { id } })
    if (!transfer) throw new HttpError(404, 'Transfer not found.')
    if (transfer.status !== 'DRAFT') throw new HttpError(409, 'Only draft transfers can be edited.')
    await checkItems(tx, input)
    await tx.stockTransferItem.deleteMany({ where: { transferId: id } })
    const updated = await tx.stockTransfer.update({ where: { id }, data: {
      sourceWarehouseId: input.sourceWarehouseId, destinationWarehouseId: input.destinationWarehouseId,
      notes: input.notes, items: { create: input.items.map(item => ({ productId: item.productId, quantity: item.quantity })) }
    }, include })
    await audit(tx, req, 'UPDATED', 'Transfers', 'StockTransfer', id, `Updated ${transfer.transferNumber}.`)
    return updated
  })
}

export async function transitionTransfer(id, event, req) {
  const transitions = {
    submit: { from: 'DRAFT', to: 'PENDING' },
    approve: { from: 'PENDING', to: 'APPROVED' },
    ship: { from: 'APPROVED', to: 'IN_TRANSIT' },
    receive: { from: 'IN_TRANSIT', to: 'RECEIVED' }
  }
  return inventoryTransaction(async tx => {
    const transfer = await tx.stockTransfer.findUnique({ where: { id }, include })
    if (!transfer) throw new HttpError(404, 'Transfer not found.')
    if (event === 'cancel') {
      if (!['DRAFT', 'PENDING', 'APPROVED'].includes(transfer.status)) throw new HttpError(409, 'A shipped or completed transfer cannot be cancelled.')
      const cancelled = await tx.stockTransfer.update({ where: { id }, data: { status: 'CANCELLED' } })
      await audit(tx, req, 'CANCELLED', 'Transfers', 'StockTransfer', id, `Cancelled ${transfer.transferNumber}.`)
      return cancelled
    }
    const transition = transitions[event]
    if (transfer.status !== transition.from) throw new HttpError(409, `Cannot ${event} a ${transfer.status.toLowerCase()} transfer.`)
    if (event === 'ship') {
      for (const item of transfer.items) {
        if (item.product.trackSerialNumbers) {
          const serials = await tx.serialNumber.findMany({
            where: { productId: item.productId, warehouseId: transfer.sourceWarehouseId, status: 'AVAILABLE' },
            orderBy: { createdAt: 'asc' }, take: item.quantity
          })
          if (serials.length !== item.quantity) throw new HttpError(400, `Insufficient available serial numbers for ${item.product.sku}.`)
          const changed = await tx.serialNumber.updateMany({
            where: { id: { in: serials.map(serial => serial.id) }, status: 'AVAILABLE' },
            data: { status: 'RESERVED', warehouseId: null }
          })
          if (changed.count !== serials.length) throw new HttpError(409, 'Serial numbers changed concurrently. Please retry.')
          await tx.stockTransferSerial.createMany({ data: serials.map(serial => ({ transferItemId: item.id, serialNumberId: serial.id })) })
        }
        await changeStock(tx, {
          productId: item.productId, warehouseId: transfer.sourceWarehouseId,
          delta: -item.quantity, type: 'TRANSFER_OUT', referenceNumber: transfer.transferNumber,
          sourceWarehouseId: transfer.sourceWarehouseId, destinationWarehouseId: transfer.destinationWarehouseId,
          userId: req.user.id, notes: transfer.notes
        })
      }
    }
    if (event === 'receive') {
      for (const item of transfer.items) {
        await changeStock(tx, {
          productId: item.productId, warehouseId: transfer.destinationWarehouseId,
          delta: item.quantity, type: 'TRANSFER_IN', referenceNumber: transfer.transferNumber,
          sourceWarehouseId: transfer.sourceWarehouseId, destinationWarehouseId: transfer.destinationWarehouseId,
          userId: req.user.id, notes: transfer.notes
        })
        await tx.stockTransferItem.update({ where: { id: item.id }, data: { receivedQuantity: item.quantity } })
        if (item.product.trackSerialNumbers) {
          const serialIds = item.serialSelections.map(selection => selection.serialNumberId)
          if (serialIds.length !== item.quantity) throw new HttpError(409, 'Transfer serial selection is incomplete.')
          const changed = await tx.serialNumber.updateMany({
            where: { id: { in: serialIds }, status: 'RESERVED', warehouseId: null },
            data: { status: 'AVAILABLE', warehouseId: transfer.destinationWarehouseId }
          })
          if (changed.count !== serialIds.length) throw new HttpError(409, 'Transfer serial status changed concurrently.')
        }
      }
      await tx.notification.create({ data: {
        userId: transfer.requestedById, type: 'TRANSFER_RECEIVED', title: 'Transfer received',
        message: `${transfer.transferNumber} arrived at ${transfer.destinationWarehouse.name}.`,
        referenceType: 'StockTransfer', referenceId: id
      } })
    }
    const data = { status: transition.to,
      ...(event === 'approve' ? { approvedById: req.user.id, approvedAt: new Date() } : {}),
      ...(event === 'ship' ? { shippedAt: new Date() } : {}),
      ...(event === 'receive' ? { receivedById: req.user.id, receivedAt: new Date() } : {})
    }
    const changed = await tx.stockTransfer.update({ where: { id }, data })
    await audit(tx, req, event.toUpperCase(), 'Transfers', 'StockTransfer', id, `${event} ${transfer.transferNumber}.`)
    if (event === 'submit') {
      const approvers = await tx.user.findMany({ where: { role: { name: 'Administrator' }, status: 'ACTIVE' }, select: { id: true } })
      if (approvers.length) await tx.notification.createMany({ data: approvers.map(user => ({
        userId: user.id, type: 'TRANSFER_APPROVAL_REQUEST', title: 'Transfer needs approval',
        message: `${transfer.transferNumber} is awaiting approval.`, referenceType: 'StockTransfer', referenceId: id
      })) })
    }
    if (event === 'approve') await tx.notification.create({ data: {
      userId: transfer.requestedById, type: 'TRANSFER_APPROVED', title: 'Transfer approved',
      message: `${transfer.transferNumber} was approved.`, referenceType: 'StockTransfer', referenceId: id
    } })
    return changed
  })
}
