import { warehouseWhere, requireWarehouseAccess } from './warehouseAccessService.js'
import { prisma } from '../config/prisma.js'
import { inventoryTransaction, changeStock } from './inventoryService.js'
import { paginate } from '../utils/query.js'
import { audit } from '../utils/audit.js'
import { HttpError } from '../utils/http.js'
import { nextReference } from '../utils/references.js'
import { recordSerialEvents } from '../utils/serialEvents.js'

const assetInclude = { product: true, serialNumber: true, warehouse: true, assignments: { orderBy: { createdAt: 'desc' } } }

export async function listAssets(query, user) {
  const where = warehouseWhere(user, query.warehouse)
  if (query.status) where.status = query.status
  if (query.warehouse) where.warehouseId = query.warehouse
  if (query.search) where.OR = [{ assetTag: { contains: query.search } }, { product: { name: { contains: query.search } } }]
  return paginate(prisma.asset, { where, include: assetInclude, query, allowedSort: ['assetTag', 'createdAt', 'status', 'purchaseDate'], defaultSort: 'createdAt' })
}

export async function getAsset(id, user) {
  const asset = await prisma.asset.findUnique({ where: { id }, include: assetInclude })
  if (!asset) throw new HttpError(404, 'Asset not found.')
  requireWarehouseAccess(user, asset.warehouseId)
  return asset
}

export async function createAsset(input, req) {
  requireWarehouseAccess(req.user, input.warehouseId)
  return inventoryTransaction(async tx => {
    const product = await tx.product.findUnique({ where: { id: input.productId } })
    if (!product || product.status !== 'ACTIVE') throw new HttpError(400, 'Product is unavailable.')
    if (product.trackSerialNumbers && !input.serialNumberId) throw new HttpError(400, 'A serial number is required for this product.')
    if (input.serialNumberId) {
      const serial = await tx.serialNumber.findUnique({ where: { id: input.serialNumberId } })
      if (!serial || serial.productId !== product.id || serial.warehouseId !== input.warehouseId || serial.status !== 'AVAILABLE') throw new HttpError(400, 'Serial number is unavailable at this warehouse.')
    }
    const assetTag = await nextReference(tx, 'asset', 'AST', 6)
    await changeStock(tx, {
      productId: product.id, warehouseId: input.warehouseId, delta: -1,
      type: 'ASSET_ASSIGNMENT', referenceNumber: assetTag, userId: req.user.id,
      notes: 'Moved from warehouse inventory to company assets'
    })
    if (input.serialNumberId) {
      const changed = await tx.serialNumber.updateMany({
        where: { id: input.serialNumberId, status: 'AVAILABLE', warehouseId: input.warehouseId },
        data: { warehouseId: null }
      })
      if (changed.count !== 1) throw new HttpError(409, 'Serial number changed concurrently.')
    }
    const asset = await tx.asset.create({ data: { ...input, assetTag }, include: assetInclude })
    if (asset.serialNumberId) await recordSerialEvents(tx, [asset.serialNumberId], { type: 'ASSET_CREATED', fromStatus: 'AVAILABLE', toStatus: 'AVAILABLE', warehouseId: asset.warehouseId,
      referenceType: 'Asset', referenceId: asset.id, referenceNumber: assetTag, notes: 'Removed from warehouse inventory and registered as a company asset.' }, req)
    await audit(tx, req, 'CREATED', 'Assets', 'Asset', asset.id, `Created asset ${assetTag}.`, { warehouseId: input.warehouseId })
    return asset
  })
}

export async function updateAsset(id, input, req) {
  return inventoryTransaction(async tx => {
    const existing = await tx.asset.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Asset not found.')
    requireWarehouseAccess(req.user, existing.warehouseId)
    if ('warehouseId' in input) requireWarehouseAccess(req.user, input.warehouseId)
    const asset = await tx.asset.update({ where: { id }, data: input, include: assetInclude })
    if (asset.serialNumberId) await recordSerialEvents(tx, [asset.serialNumberId], { type: 'ASSET_UPDATED', warehouseId: existing.warehouseId, relatedWarehouseId: asset.warehouseId,
      referenceType: 'Asset', referenceId: id, referenceNumber: asset.assetTag }, req)
    await audit(tx, req, 'UPDATED', 'Assets', 'Asset', id, `Updated asset ${asset.assetTag}.`, { warehouseId: existing.warehouseId, relatedWarehouseId: asset.warehouseId })
    return asset
  })
}

export async function assignAsset(id, input, req) {
  return inventoryTransaction(async tx => {
    const asset = await tx.asset.findUnique({ where: { id } })
    if (!asset) throw new HttpError(404, 'Asset not found.')
    requireWarehouseAccess(req.user, asset.warehouseId)
    if (asset.status !== 'AVAILABLE') throw new HttpError(409, 'Only available assets can be assigned.')
    const changed = await tx.asset.updateMany({ where: { id, status: 'AVAILABLE' }, data: { status: 'ASSIGNED' } })
    if (changed.count !== 1) throw new HttpError(409, 'Asset changed concurrently.')
    const assignment = await tx.assetAssignment.create({ data: {
      assetId: id, assignedById: req.user.id, ...input
    } })
    if (asset.serialNumberId) await tx.serialNumber.update({ where: { id: asset.serialNumberId }, data: { status: 'ASSIGNED' } })
    if (asset.serialNumberId) await recordSerialEvents(tx, [asset.serialNumberId], { type: 'ASSIGNED', toStatus: 'ASSIGNED', warehouseId: asset.warehouseId,
      referenceType: 'AssetAssignment', referenceId: assignment.id, referenceNumber: asset.assetTag, notes: `Assigned to ${input.assignedTo}${input.department ? ` (${input.department})` : ''}.` }, req)
    await audit(tx, req, 'ASSIGNED', 'Assets', 'AssetAssignment', assignment.id, `Assigned ${asset.assetTag} to ${input.assignedTo}.`, { warehouseId: asset.warehouseId })
    return assignment
  })
}

export async function returnAsset(id, input, req) {
  return inventoryTransaction(async tx => {
    const asset = await tx.asset.findUnique({ where: { id } })
    if (!asset) throw new HttpError(404, 'Asset not found.')
    requireWarehouseAccess(req.user, asset.warehouseId)
    if (asset.status !== 'ASSIGNED') throw new HttpError(409, 'Asset is not assigned.')
    const assignment = await tx.assetAssignment.findFirst({ where: { assetId: id, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } })
    if (!assignment) throw new HttpError(409, 'No active assignment found.')
    await tx.assetAssignment.update({ where: { id: assignment.id }, data: {
      status: 'RETURNED', returnedDate: new Date(), conditionOnReturn: input.conditionOnReturn,
      notes: input.notes || assignment.notes
    } })
    await tx.asset.update({ where: { id }, data: { status: 'AVAILABLE' } })
    if (asset.serialNumberId) await tx.serialNumber.update({ where: { id: asset.serialNumberId }, data: { status: 'AVAILABLE' } })
    if (asset.serialNumberId) await recordSerialEvents(tx, [asset.serialNumberId], { type: 'RETURNED', toStatus: 'AVAILABLE', warehouseId: asset.warehouseId,
      referenceType: 'AssetAssignment', referenceId: assignment.id, referenceNumber: asset.assetTag, notes: input.conditionOnReturn }, req)
    await audit(tx, req, 'RETURNED', 'Assets', 'AssetAssignment', assignment.id, `Returned ${asset.assetTag}.`, { warehouseId: asset.warehouseId })
    return { assetId: id, assignmentId: assignment.id }
  })
}

export async function closeAsset(id, status, req) {
  return inventoryTransaction(async tx => {
    const asset = await tx.asset.findUnique({ where: { id } })
    if (!asset) throw new HttpError(404, 'Asset not found.')
    requireWarehouseAccess(req.user, asset.warehouseId)
    if (asset.status === 'ASSIGNED') throw new HttpError(409, 'Return the asset before retiring or disposing it.')
    if (['RETIRED', 'DISPOSED'].includes(asset.status)) throw new HttpError(409, 'Asset is already closed.')
    if (await tx.maintenanceRecord.count({ where: { assetId: id, status: { in: ['SCHEDULED', 'IN_REPAIR'] } } })) throw new HttpError(409, 'Close open maintenance before retiring or disposing this asset.')
    const updated = await tx.asset.update({ where: { id }, data: { status } })
    if (asset.serialNumberId && status === 'DISPOSED') await tx.serialNumber.update({ where: { id: asset.serialNumberId }, data: { status: 'DISPOSED' } })
    if (asset.serialNumberId) await recordSerialEvents(tx, [asset.serialNumberId], { type: status, ...(status === 'DISPOSED' ? { toStatus: status } : {}), warehouseId: asset.warehouseId,
      referenceType: 'Asset', referenceId: id, referenceNumber: asset.assetTag }, req)
    await audit(tx, req, status, 'Assets', 'Asset', id, `${status} ${asset.assetTag}.`, { warehouseId: asset.warehouseId })
    return updated
  })
}

export async function listMaintenance(query, user) {
  const where = { asset: warehouseWhere(user, query.warehouse) }
  if (query.status) where.status = query.status
  if (query.asset) where.assetId = query.asset
  return paginate(prisma.maintenanceRecord, { where, include: { asset: { include: { product: true, serialNumber: true } } }, query, allowedSort: ['createdAt', 'serviceDate', 'cost', 'status'], defaultSort: 'createdAt' })
}

export async function createMaintenance(input, req) {
  return inventoryTransaction(async tx => {
    const asset = await tx.asset.findUnique({ where: { id: input.assetId } })
    if (!asset) throw new HttpError(404, 'Asset not found.')
    requireWarehouseAccess(req.user, asset.warehouseId)
    if (['RETIRED', 'DISPOSED', 'LOST'].includes(asset.status)) throw new HttpError(409, 'A closed or lost asset cannot be serviced.')
    if (input.serialNumberId && input.serialNumberId !== asset.serialNumberId) throw new HttpError(400, 'Serial number does not belong to this asset.')
    const record = await tx.maintenanceRecord.create({ data: { ...input, createdById: req.user.id } })
    if (input.status === 'IN_REPAIR') await tx.asset.update({ where: { id: asset.id }, data: { status: 'MAINTENANCE' } })
    if (asset.serialNumberId && input.status === 'IN_REPAIR') await tx.serialNumber.update({ where: { id: asset.serialNumberId }, data: { status: 'FOR_REPAIR' } })
    if (asset.serialNumberId) await recordSerialEvents(tx, [asset.serialNumberId], { type: input.status === 'IN_REPAIR' ? 'SENT_FOR_REPAIR' : 'MAINTENANCE_CREATED',
      ...(input.status === 'IN_REPAIR' ? { toStatus: 'FOR_REPAIR' } : {}), warehouseId: asset.warehouseId,
      referenceType: 'MaintenanceRecord', referenceId: record.id, referenceNumber: asset.assetTag, notes: input.issue }, req)
    await audit(tx, req, 'CREATED', 'Maintenance', 'MaintenanceRecord', record.id, `Created maintenance record for ${asset.assetTag}.`, { warehouseId: asset.warehouseId })
    return record
  })
}

export async function updateMaintenance(id, input, req) {
  return inventoryTransaction(async tx => {
    const record = await tx.maintenanceRecord.findUnique({ where: { id }, include: { asset: true } })
    if (!record) throw new HttpError(404, 'Maintenance record not found.')
    requireWarehouseAccess(req.user, record.asset.warehouseId)
    if (['COMPLETED', 'CANCELLED'].includes(record.status)) throw new HttpError(409, 'Closed maintenance cannot be edited.')
    if (['COMPLETED', 'CANCELLED'].includes(input.status)) throw new HttpError(400, 'Use the maintenance completion or cancellation action.')
    if (record.status === 'IN_REPAIR' && input.status === 'SCHEDULED') throw new HttpError(409, 'Cancel repair before scheduling a new service.')
    if (input.assetId && input.assetId !== record.assetId) throw new HttpError(400, 'A maintenance record cannot be moved to another asset.')
    if (input.serialNumberId && input.serialNumberId !== record.asset.serialNumberId) throw new HttpError(400, 'Serial number does not belong to this asset.')
    const updated = await tx.maintenanceRecord.update({ where: { id }, data: input })
    if (input.status === 'IN_REPAIR') await tx.asset.update({ where: { id: record.assetId }, data: { status: 'MAINTENANCE' } })
    if (record.asset.serialNumberId && input.status === 'IN_REPAIR') await tx.serialNumber.update({ where: { id: record.asset.serialNumberId }, data: { status: 'FOR_REPAIR' } })
    if (record.asset.serialNumberId) await recordSerialEvents(tx, [record.asset.serialNumberId], { type: input.status === 'IN_REPAIR' && record.status !== 'IN_REPAIR' ? 'SENT_FOR_REPAIR' : 'MAINTENANCE_UPDATED',
      ...(input.status === 'IN_REPAIR' ? { toStatus: 'FOR_REPAIR' } : {}), warehouseId: record.asset.warehouseId,
      referenceType: 'MaintenanceRecord', referenceId: id, referenceNumber: record.asset.assetTag, notes: input.issue }, req)
    await audit(tx, req, 'UPDATED', 'Maintenance', 'MaintenanceRecord', id, 'Updated maintenance record.', { warehouseId: record.asset.warehouseId })
    return updated
  })
}

export async function finishMaintenance(id, status, req) {
  return inventoryTransaction(async tx => {
    const record = await tx.maintenanceRecord.findUnique({ where: { id }, include: { asset: true } })
    if (!record) throw new HttpError(404, 'Maintenance record not found.')
    requireWarehouseAccess(req.user, record.asset.warehouseId)
    if (['COMPLETED', 'CANCELLED'].includes(record.status)) throw new HttpError(409, 'Maintenance record is already closed.')
    const updated = await tx.maintenanceRecord.update({ where: { id }, data: {
      status, ...(status === 'COMPLETED' ? { completedDate: new Date() } : {})
    } })
    const otherRepairs = await tx.maintenanceRecord.count({ where: { assetId: record.assetId, id: { not: id }, status: 'IN_REPAIR' } })
    const activeAssignment = await tx.assetAssignment.count({ where: { assetId: record.assetId, status: 'ACTIVE' } })
    const restoredStatus = activeAssignment ? 'ASSIGNED' : 'AVAILABLE'
    if (!otherRepairs) {
      await tx.asset.updateMany({ where: { id: record.assetId, status: 'MAINTENANCE' }, data: { status: restoredStatus } })
      if (record.asset.serialNumberId) await tx.serialNumber.updateMany({ where: { id: record.asset.serialNumberId, status: 'FOR_REPAIR' }, data: { status: restoredStatus } })
    }
    if (record.asset.serialNumberId) await recordSerialEvents(tx, [record.asset.serialNumberId], { type: status === 'COMPLETED' ? 'MAINTENANCE_COMPLETED' : 'MAINTENANCE_CANCELLED',
      ...(record.status === 'IN_REPAIR' ? { toStatus: otherRepairs ? 'FOR_REPAIR' : restoredStatus } : {}), warehouseId: record.asset.warehouseId,
      referenceType: 'MaintenanceRecord', referenceId: id, referenceNumber: record.asset.assetTag }, req)
    await audit(tx, req, status, 'Maintenance', 'MaintenanceRecord', id, `${status} maintenance record.`, { warehouseId: record.asset.warehouseId })
    return updated
  })
}
