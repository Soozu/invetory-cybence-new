import { deliverNotifications } from './notificationDelivery.js'
import { inventoryTransaction, changeStock } from './inventoryService.js'
import { requireTransferAccess, requireWarehouseAccess } from './warehouseAccessService.js'
import { updateConditionBalance } from '../utils/stockConditions.js'
import { HttpError } from '../utils/http.js'
import { nextReference } from '../utils/references.js'
import { audit } from '../utils/audit.js'
import { recordSerialEvents } from '../utils/serialEvents.js'

const actor = { select: { firstName: true, lastName: true } }
export const transferInclude = {
  sourceWarehouse: { select: { id: true, name: true, code: true } }, destinationWarehouse: { select: { id: true, name: true, code: true } },
  requestedBy: actor,
  items: { include: { product: true, serialSelections: { include: { serialNumber: true } } } },
  arrivals: { include: { receivedBy: actor }, orderBy: { createdAt: 'asc' } },
  discrepancies: { include: { resolutions: { include: { user: actor }, orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'asc' } }
}
const remaining = item => item.quantity - item.receivedQuantity - item.lostQuantity - item.returnedQuantity
const nextTime = value => new Date(Math.max(Date.now(), value.getTime() + 1))
const unownedSerial = { asset: null, maintenanceRecords: { none: { status: { in: ['SCHEDULED', 'IN_REPAIR'] } } }, reservationSelections: { none: { fulfilledAt: null, item: { reservation: { status: 'ACTIVE' } } } } }
function version(record, expected) {
  if (!expected || new Date(expected).getTime() !== record.updatedAt.getTime()) throw new HttpError(409, 'Transfer or discrepancy changed. Reload before recording this action.')
}
async function load(tx, id, user) {
  const record = await tx.stockTransfer.findUnique({ where: { id }, include: transferInclude })
  if (!record) throw new HttpError(404, 'Transfer not found.')
  requireTransferAccess(user, record)
  return record
}
async function finish(tx, transfer, req, closedAt = transfer.arrivalClosedAt) {
  const items = await tx.stockTransferItem.findMany({ where: { transferId: transfer.id } })
  const cases = await tx.transferDiscrepancy.findMany({ where: { transferId: transfer.id } })
  const open = cases.some(row => row.resolvedQuantity < row.quantity)
  const accounted = items.every(item => remaining(item) === 0)
  const status = open ? 'DISCREPANCY' : accounted ? items.some(item => item.lostQuantity || item.returnedQuantity) ? 'RESOLVED' : 'RECEIVED' : 'PARTIAL'
  const changed = await tx.stockTransfer.updateMany({ where: { id: transfer.id, updatedAt: transfer.updatedAt }, data: {
    status, arrivalClosedAt: closedAt, updatedAt: nextTime(transfer.updatedAt),
    ...(accounted ? { receivedAt: new Date(), receivedById: req.user.id } : {})
  } })
  if (changed.count !== 1) throw new HttpError(409, 'Transfer changed concurrently. Reload before retrying.')
  return tx.stockTransfer.findUnique({ where: { id: transfer.id }, include: transferInclude })
}
// Positive stock is added only for a physically identified arrival/recovery.
async function addUnits(tx, transfer, item, quantity, serials, condition, warehouseId, referenceNumber, req, notes) {
  const { movement } = await changeStock(tx, { productId: item.productId, warehouseId, delta: quantity, type: 'TRANSFER_IN', referenceNumber,
    sourceWarehouseId: transfer.sourceWarehouseId, destinationWarehouseId: transfer.destinationWarehouseId, userId: req.user.id, notes })
  if (condition === 'QUARANTINE') {
    const stock = await tx.warehouseStock.findUnique({ where: { productId_warehouseId: { productId: item.productId, warehouseId } } })
    await updateConditionBalance(tx, stock, { reservedDelta: quantity, bucketDeltas: { quarantineQuantity: quantity } })
    await tx.stockMovement.update({ where: { id: movement.id }, data: { previousReservedQuantity: stock.reservedQuantity, newReservedQuantity: stock.reservedQuantity + quantity } })
  }
  if (serials.length) {
    const ids = serials.map(row => row.serialNumberId)
    const changed = await tx.serialNumber.updateMany({ where: { id: { in: ids }, productId: item.productId, warehouseId: null, status: 'RESERVED', ...unownedSerial }, data: { warehouseId, status: condition } })
    if (changed.count !== quantity) throw new HttpError(409, 'A shipped serial changed or is no longer in transit.')
    const selected = await tx.stockTransferSerial.updateMany({ where: { transferItemId: item.id, serialNumberId: { in: ids }, outcome: 'IN_TRANSIT' }, data: { outcome: warehouseId === transfer.sourceWarehouseId ? 'RETURNED' : 'RECEIVED' } })
    if (selected.count !== quantity) throw new HttpError(409, 'Shipped selection changed concurrently.')
    await recordSerialEvents(tx, ids, { type: warehouseId === transfer.sourceWarehouseId ? 'TRANSFER_RETURNED' : 'TRANSFER_RECEIVED', fromStatus: 'RESERVED', toStatus: condition,
      warehouseId, relatedWarehouseId: warehouseId === transfer.sourceWarehouseId ? transfer.destinationWarehouseId : transfer.sourceWarehouseId,
      referenceType: 'StockTransfer', referenceId: transfer.id, referenceNumber, notes }, req)
  }
  return movement.id
}
function selectSerials(item, values, quantity) {
  if (!item.product.trackSerialNumbers) {
    if (values.length) throw new HttpError(400, 'Nonserialized lines cannot receive serial numbers.')
    return []
  }
  if (values.length !== quantity || new Set(values).size !== values.length) throw new HttpError(400, 'Each received unit requires one distinct serial number.')
  const serials = values.map(value => item.serialSelections.find(row => row.serialNumber.serialNumber === value && row.outcome === 'IN_TRANSIT'))
  if (serials.some(row => !row)) throw new HttpError(409, 'Received serials differ from the remaining shipped selection. Record unexpected units separately.')
  return serials
}
async function arrival(tx, transfer, input, req) {
  requireWarehouseAccess(req.user, transfer.destinationWarehouseId)
  if (!['IN_TRANSIT', 'PARTIAL', 'DISCREPANCY'].includes(transfer.status) || transfer.arrivalClosedAt) throw new HttpError(409, 'Arrival is closed. Resolve its missing-unit cases explicitly.')
  const received = [], cases = [], allScans = []
  for (const line of input.items) {
    const item = transfer.items.find(row => row.id === line.id)
    if (!item) throw new HttpError(400, 'Receipt line does not belong to this transfer.')
    const good = line.goodQuantity, damaged = line.damagedQuantity
    if (good + damaged > remaining(item)) throw new HttpError(400, 'Receipt exceeds the remaining shipped quantity.')
    const goodSerials = selectSerials(item, line.goodSerials, good), damagedSerials = selectSerials(item, line.damagedSerials, damaged)
    allScans.push(...line.goodSerials, ...line.damagedSerials)
    received.push({ item, good, damaged, goodSerials, damagedSerials })
  }
  if (new Set(input.items.map(line => line.id)).size !== input.items.length || new Set(allScans).size !== allScans.length) throw new HttpError(400, 'Duplicate received line or serial number.')
  for (const observation of input.unexpected) {
    const item = transfer.items.find(row => row.id === observation.id)
    if (!item) throw new HttpError(400, 'Unexpected observation must identify a transfer line.')
    if (item.product.trackSerialNumbers && (!observation.serialNumber || observation.quantity !== 1)) throw new HttpError(400, 'Record each unexpected serial separately with quantity one.')
    if (observation.serialNumber && transfer.items.some(row => row.serialSelections.some(selection => selection.serialNumber.serialNumber === observation.serialNumber))) throw new HttpError(400, 'A shipped identity cannot be reported as unexpected.')
    cases.push({ transferItemId: item.id, kind: 'UNEXPECTED', quantity: observation.quantity, observedSerial: observation.serialNumber || null, notes: observation.notes })
  }
  const observed = input.unexpected.filter(row => row.serialNumber).map(row => row.serialNumber)
  if (new Set(observed).size !== observed.length) throw new HttpError(400, 'Duplicate unexpected serial observation.')
  if (!input.finalArrival && !cases.length && !received.some(row => row.good + row.damaged > 0)) throw new HttpError(400, 'Record received units, an unexpected observation, or a final arrival.')
  const referenceNumber = await nextReference(tx, `transfer-arrival-${new Date().getFullYear()}`, `TRC-${new Date().getFullYear()}`)
  const ledger = []
  for (const line of received) {
    const movements = []
    if (line.good) movements.push(await addUnits(tx, transfer, line.item, line.good, line.goodSerials, 'AVAILABLE', transfer.destinationWarehouseId, referenceNumber, req, input.notes))
    if (line.damaged) {
      movements.push(await addUnits(tx, transfer, line.item, line.damaged, line.damagedSerials, 'QUARANTINE', transfer.destinationWarehouseId, referenceNumber, req, input.notes))
      if (line.item.product.trackSerialNumbers) cases.push(...line.damagedSerials.map(row => ({ transferItemId: line.item.id, kind: 'DAMAGED', quantity: 1, serialNumberId: row.serialNumberId, observedSerial: row.serialNumber.serialNumber, notes: input.notes })))
      else cases.push({ transferItemId: line.item.id, kind: 'DAMAGED', quantity: line.damaged, notes: input.notes })
    }
    await tx.stockTransferItem.update({ where: { id: line.item.id }, data: { receivedQuantity: { increment: line.good + line.damaged } } })
    ledger.push({ transferItemId: line.item.id, goodQuantity: line.good, damagedQuantity: line.damaged, goodSerialIds: line.goodSerials.map(row => row.serialNumberId), damagedSerialIds: line.damagedSerials.map(row => row.serialNumberId), stockMovementIds: movements })
  }
  if (input.finalArrival) {
    for (const item of transfer.items) {
      const count = remaining(item) - (received.find(row => row.item.id === item.id)?.good || 0) - (received.find(row => row.item.id === item.id)?.damaged || 0)
      if (!count) continue
      if (item.product.trackSerialNumbers) {
        const serials = await tx.stockTransferSerial.findMany({ where: { transferItemId: item.id, outcome: 'IN_TRANSIT' }, include: { serialNumber: true } })
        if (serials.length !== count) throw new HttpError(409, 'Remaining shipped serial identities are inconsistent.')
        cases.push(...serials.map(row => ({ transferItemId: item.id, kind: 'MISSING', quantity: 1, serialNumberId: row.serialNumberId, observedSerial: row.serialNumber.serialNumber, notes: input.notes })))
      } else cases.push({ transferItemId: item.id, kind: 'MISSING', quantity: count, notes: input.notes })
    }
  }
  const document = await tx.transferArrival.create({ data: { referenceNumber, transferId: transfer.id, receivedById: req.user.id, finalArrival: input.finalArrival, notes: input.notes, lines: ledger } })
  if (cases.length) await tx.transferDiscrepancy.createMany({ data: cases.map(row => ({ ...row, transferId: transfer.id, arrivalId: document.id })) })
  await audit(tx, req, 'ARRIVAL_RECORDED', 'Transfers', 'StockTransfer', transfer.id, `${referenceNumber}: ${input.notes}`, { warehouseId: transfer.destinationWarehouseId, relatedWarehouseId: transfer.sourceWarehouseId })
  const result=await finish(tx, transfer, req, input.finalArrival ? new Date() : undefined)
  await deliverNotifications(tx,[{userId:transfer.requestedById,warehouseId:transfer.sourceWarehouseId,type:'TRANSFER_RECEIVED',title:'Transfer arrival recorded',message:`${transfer.transferNumber}: ${referenceNumber} recorded.`,referenceType:'StockTransfer',referenceId:transfer.id}])
  return result
}
export async function receiveTransfer(id, input, req) {
  return inventoryTransaction(async tx => { const transfer = await load(tx, id, req.user); requireWarehouseAccess(req.user, transfer.destinationWarehouseId); version(transfer, input.expectedUpdatedAt); return arrival(tx, transfer, input, req) })
}
// Existing full-receipt endpoint remains a single, ledger-backed arrival.
export async function receiveLegacyTransfer(id, input, req) {
  return inventoryTransaction(async tx => {
    const transfer = await load(tx, id, req.user)
    requireWarehouseAccess(req.user, transfer.destinationWarehouseId)
    if (transfer.status !== 'IN_TRANSIT' || transfer.arrivals.length) throw new HttpError(409, 'Use the partial-arrival workflow for this transfer.')
    if (input.expectedUpdatedAt) version(transfer, input.expectedUpdatedAt)
    if (input.items?.some(line => !transfer.items.some(item => item.id === line.id && item.product.trackSerialNumbers))) throw new HttpError(400, 'Scanned item must be a serialized transfer line.')
    return arrival(tx, transfer, { finalArrival: true, unexpected: [], notes: 'Full shipment received.', items: transfer.items.map(item => ({ id: item.id, goodQuantity: item.quantity, damagedQuantity: 0,
      goodSerials: item.product.trackSerialNumbers ? input.items ? input.items.find(row => row.id === item.id)?.serialNumbers || [] : item.serialSelections.map(row => row.serialNumber.serialNumber) : [], damagedSerials: [] })) }, req)
  })
}
export async function resolveTransferDiscrepancy(id, discrepancyId, input, req) {
  return inventoryTransaction(async tx => {
    const transfer = await load(tx, id, req.user)
    const discrepancy = transfer.discrepancies.find(row => row.id === discrepancyId)
    if (!discrepancy) throw new HttpError(404, 'Transfer discrepancy not found.')
    if (input.action === 'INVESTIGATE') requireTransferAccess(req.user, transfer)
    else requireWarehouseAccess(req.user, transfer.destinationWarehouseId)
    version(transfer, input.expectedUpdatedAt); version(discrepancy, input.expectedDiscrepancyUpdatedAt)
    if (discrepancy.resolvedQuantity >= discrepancy.quantity) throw new HttpError(409, 'This discrepancy is already resolved.')
    const allowed = { MISSING: ['RECEIVE_LATE', 'MARK_LOST', 'RETURN_TO_SOURCE'], DAMAGED: ['ACKNOWLEDGE_QUARANTINE'], UNEXPECTED: ['RETURN_UNEXPECTED', 'DOCUMENT_DISPOSITION'] }
    if (input.action !== 'INVESTIGATE' && !allowed[discrepancy.kind].includes(input.action)) throw new HttpError(400, 'Resolution does not match this discrepancy.')
    const quantity = input.action === 'INVESTIGATE' ? 0 : input.quantity
    if ((input.action !== 'INVESTIGATE' && quantity < 1) || quantity > discrepancy.quantity - discrepancy.resolvedQuantity) throw new HttpError(400, 'Resolution quantity exceeds the unresolved case quantity.')
    const item = transfer.items.find(row => row.id === discrepancy.transferItemId)
    let movementId = null
    if (discrepancy.kind === 'MISSING' && quantity) {
      const serials = discrepancy.serialNumberId ? item.serialSelections.filter(row => row.serialNumberId === discrepancy.serialNumberId && row.outcome === 'IN_TRANSIT') : []
      if (item.product.trackSerialNumbers && (quantity !== 1 || serials.length !== 1)) throw new HttpError(409, 'Missing serial is no longer in transit.')
      if (input.action === 'MARK_LOST') {
        if (serials.length) {
          const changed = await tx.serialNumber.updateMany({ where: { id: discrepancy.serialNumberId, warehouseId: null, status: 'RESERVED', ...unownedSerial }, data: { status: 'MISSING' } })
          if (changed.count !== 1) throw new HttpError(409, 'Missing serial changed concurrently.')
          await tx.stockTransferSerial.update({ where: { transferItemId_serialNumberId: { transferItemId: item.id, serialNumberId: discrepancy.serialNumberId } }, data: { outcome: 'LOST' } })
          await recordSerialEvents(tx, [discrepancy.serialNumberId], { type: 'TRANSFER_LOST', fromStatus: 'RESERVED', toStatus: 'MISSING', warehouseId: transfer.destinationWarehouseId, relatedWarehouseId: transfer.sourceWarehouseId,
            referenceType: 'StockTransfer', referenceId: id, referenceNumber: transfer.transferNumber, notes: input.notes }, req)
        }
        await tx.stockTransferItem.update({ where: { id: item.id }, data: { lostQuantity: { increment: quantity } } })
      } else {
        const returned = input.action === 'RETURN_TO_SOURCE'
        if (returned) requireWarehouseAccess(req.user, transfer.sourceWarehouseId)
        movementId = await addUnits(tx, transfer, item, quantity, serials, returned ? 'QUARANTINE' : input.condition, returned ? transfer.sourceWarehouseId : transfer.destinationWarehouseId, transfer.transferNumber, req, input.notes)
        await tx.stockTransferItem.update({ where: { id: item.id }, data: returned ? { returnedQuantity: { increment: quantity } } : { receivedQuantity: { increment: quantity } } })
      }
    }
    await tx.transferDiscrepancyResolution.create({ data: { discrepancyId, action: input.action, quantity, notes: input.notes, userId: req.user.id, stockMovementId: movementId } })
    const changed = await tx.transferDiscrepancy.updateMany({ where: { id: discrepancyId, updatedAt: discrepancy.updatedAt, resolvedQuantity: discrepancy.resolvedQuantity }, data: { resolvedQuantity: { increment: quantity }, updatedAt: nextTime(discrepancy.updatedAt) } })
    if (changed.count !== 1) throw new HttpError(409, 'Discrepancy changed concurrently.')
    await audit(tx, req, input.action, 'Transfers', 'StockTransfer', id, `${discrepancy.kind}: ${quantity} units. ${input.notes}`, { warehouseId: transfer.destinationWarehouseId, relatedWarehouseId: transfer.sourceWarehouseId })
    return finish(tx, transfer, req)
  })
}
