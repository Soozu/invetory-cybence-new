import { prisma } from '../config/prisma.js'
import { inventoryTransaction, changeStock } from './inventoryService.js'
import { paginate } from '../utils/query.js'
import { audit } from '../utils/audit.js'
import { HttpError } from '../utils/http.js'
import { nextReference } from '../utils/references.js'

const assetInclude = { product: true, serialNumber: true, warehouse: true, assignments: { orderBy: { createdAt: 'desc' } } }

export async function listAssets(query) {
  const where = {}
  if (query.status) where.status = query.status
  if (query.warehouse) where.warehouseId = query.warehouse
  if (query.search) where.OR = [{ assetTag: { contains: query.search } }, { product: { name: { contains: query.search } } }]
  return paginate(prisma.asset, { where, include: assetInclude, query, allowedSort: ['assetTag', 'createdAt', 'status', 'purchaseDate'], defaultSort: 'createdAt' })
}

export async function getAsset(id) {
  const asset = await prisma.asset.findUnique({ where: { id }, include: assetInclude })
  if (!asset) throw new HttpError(404, 'Asset not found.')
  return asset
}

export async function createAsset(input, req) {
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
    await audit(tx, req, 'CREATED', 'Assets', 'Asset', asset.id, `Created asset ${assetTag}.`)
    return asset
  })
}

export async function updateAsset(id, input, req) {
  return inventoryTransaction(async tx => {
    const asset = await tx.asset.update({ where: { id }, data: input, include: assetInclude })
    await audit(tx, req, 'UPDATED', 'Assets', 'Asset', id, `Updated asset ${asset.assetTag}.`)
    return asset
  })
}

export async function assignAsset(id, input, req) {
  return inventoryTransaction(async tx => {
    const asset = await tx.asset.findUnique({ where: { id } })
    if (!asset) throw new HttpError(404, 'Asset not found.')
    if (asset.status !== 'AVAILABLE') throw new HttpError(409, 'Only available assets can be assigned.')
    const changed = await tx.asset.updateMany({ where: { id, status: 'AVAILABLE' }, data: { status: 'ASSIGNED' } })
    if (changed.count !== 1) throw new HttpError(409, 'Asset changed concurrently.')
    const assignment = await tx.assetAssignment.create({ data: {
      assetId: id, assignedById: req.user.id, ...input
    } })
    if (asset.serialNumberId) await tx.serialNumber.update({ where: { id: asset.serialNumberId }, data: { status: 'ASSIGNED' } })
    await audit(tx, req, 'ASSIGNED', 'Assets', 'AssetAssignment', assignment.id, `Assigned ${asset.assetTag} to ${input.assignedTo}.`)
    return assignment
  })
}

export async function returnAsset(id, input, req) {
  return inventoryTransaction(async tx => {
    const asset = await tx.asset.findUnique({ where: { id } })
    if (!asset) throw new HttpError(404, 'Asset not found.')
    if (asset.status !== 'ASSIGNED') throw new HttpError(409, 'Asset is not assigned.')
    const assignment = await tx.assetAssignment.findFirst({ where: { assetId: id, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } })
    if (!assignment) throw new HttpError(409, 'No active assignment found.')
    await tx.assetAssignment.update({ where: { id: assignment.id }, data: {
      status: 'RETURNED', returnedDate: new Date(), conditionOnReturn: input.conditionOnReturn,
      notes: input.notes || assignment.notes
    } })
    await tx.asset.update({ where: { id }, data: { status: 'AVAILABLE' } })
    if (asset.serialNumberId) await tx.serialNumber.update({ where: { id: asset.serialNumberId }, data: { status: 'AVAILABLE' } })
    await audit(tx, req, 'RETURNED', 'Assets', 'AssetAssignment', assignment.id, `Returned ${asset.assetTag}.`)
    return { assetId: id, assignmentId: assignment.id }
  })
}

export async function closeAsset(id, status, req) {
  return inventoryTransaction(async tx => {
    const asset = await tx.asset.findUnique({ where: { id } })
    if (!asset) throw new HttpError(404, 'Asset not found.')
    if (asset.status === 'ASSIGNED') throw new HttpError(409, 'Return the asset before retiring or disposing it.')
    const updated = await tx.asset.update({ where: { id }, data: { status } })
    if (asset.serialNumberId && status === 'DISPOSED') await tx.serialNumber.update({ where: { id: asset.serialNumberId }, data: { status: 'DISPOSED' } })
    await audit(tx, req, status, 'Assets', 'Asset', id, `${status} ${asset.assetTag}.`)
    return updated
  })
}

export async function listMaintenance(query) {
  const where = {}
  if (query.status) where.status = query.status
  if (query.asset) where.assetId = query.asset
  return paginate(prisma.maintenanceRecord, { where, include: { asset: { include: { product: true, serialNumber: true } } }, query, allowedSort: ['createdAt', 'serviceDate', 'cost', 'status'], defaultSort: 'createdAt' })
}

export async function createMaintenance(input, req) {
  return inventoryTransaction(async tx => {
    const asset = await tx.asset.findUnique({ where: { id: input.assetId } })
    if (!asset) throw new HttpError(404, 'Asset not found.')
    if (input.serialNumberId && input.serialNumberId !== asset.serialNumberId) throw new HttpError(400, 'Serial number does not belong to this asset.')
    const record = await tx.maintenanceRecord.create({ data: { ...input, createdById: req.user.id } })
    if (input.status === 'IN_REPAIR') await tx.asset.update({ where: { id: asset.id }, data: { status: 'MAINTENANCE' } })
    await audit(tx, req, 'CREATED', 'Maintenance', 'MaintenanceRecord', record.id, `Created maintenance record for ${asset.assetTag}.`)
    return record
  })
}

export async function updateMaintenance(id, input, req) {
  return inventoryTransaction(async tx => {
    const record = await tx.maintenanceRecord.findUnique({ where: { id } })
    if (!record) throw new HttpError(404, 'Maintenance record not found.')
    const updated = await tx.maintenanceRecord.update({ where: { id }, data: input })
    if (input.status === 'IN_REPAIR') await tx.asset.update({ where: { id: record.assetId }, data: { status: 'MAINTENANCE' } })
    await audit(tx, req, 'UPDATED', 'Maintenance', 'MaintenanceRecord', id, 'Updated maintenance record.')
    return updated
  })
}

export async function finishMaintenance(id, status, req) {
  return inventoryTransaction(async tx => {
    const record = await tx.maintenanceRecord.findUnique({ where: { id } })
    if (!record) throw new HttpError(404, 'Maintenance record not found.')
    if (['COMPLETED', 'CANCELLED'].includes(record.status)) throw new HttpError(409, 'Maintenance record is already closed.')
    const updated = await tx.maintenanceRecord.update({ where: { id }, data: {
      status, ...(status === 'COMPLETED' ? { completedDate: new Date() } : {})
    } })
    await tx.asset.updateMany({ where: { id: record.assetId, status: 'MAINTENANCE' }, data: { status: 'AVAILABLE' } })
    await audit(tx, req, status, 'Maintenance', 'MaintenanceRecord', id, `${status} maintenance record.`)
    return updated
  })
}
