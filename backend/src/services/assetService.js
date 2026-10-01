import { warehouseWhere, requireWarehouseAccess, canAccessWarehouse, isAdministrator } from './warehouseAccessService.js'
import { prisma } from '../config/prisma.js'
import { inventoryTransaction, changeStock } from './inventoryService.js'
import { paginate } from '../utils/query.js'
import { HttpError } from '../utils/http.js'
import { nextReference } from '../utils/references.js'
import { permit, version, revise, ownedAsset, serviceable, assetEvent } from './assetWorkflowRules.js'

const include = { product: true, serialNumber: true, warehouse: true, assignments: { orderBy: { createdAt: 'desc' } } }
const maintenanceInclude = { asset: { include: { product: true, serialNumber: true } }, plan: true }
const openRepairs = (tx, assetId) => tx.maintenanceRecord.count({ where: { assetId, status: 'IN_REPAIR' } })
const active = (tx, assetId) => tx.assetAssignment.findFirst({ where: { assetId, status: 'ACTIVE' } })
function history(row, user) {
  return { ...row, assignments: row.assignments.filter(a => isAdministrator(user) || (a.warehouseId ? canAccessWarehouse(user, a.warehouseId) : a.status === 'ACTIVE')) }
}
export async function listAssets(query, user) {
  permit(user, 'VIEW'); const where = warehouseWhere(user, query.warehouse)
  if (query.status) where.status = query.status
  if (query.assigned === 'true') where.assignments = { some: { status: 'ACTIVE' } }
  if (query.search) where.OR = [{ assetTag: { contains: query.search } }, { product: { name: { contains: query.search } } }, { serialNumber: { serialNumber: { contains: query.search } } }]
  const result = await paginate(prisma.asset, { where, include, query, allowedSort: ['assetTag', 'createdAt', 'status', 'purchaseDate'], defaultSort: 'createdAt' })
  result.data = result.data.map(row => history(row, user)); return result
}
export async function getAsset(id, user) {
  permit(user, 'VIEW'); const asset = await ownedAsset(prisma, id, user)
  const row = await prisma.asset.findUnique({ where: { id }, include: { ...include, events: { where: warehouseWhere(user), include: { user: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' } }, maintenanceRecords: { where: isAdministrator(user) ? {} : { OR: [warehouseWhere(user), { warehouseId: null, status: { in: ['SCHEDULED', 'IN_REPAIR'] } }] }, orderBy: { createdAt: 'desc' } }, maintenancePlans: true } })
  return { ...history(row, user), historyNotice: 'Recorded history starts at installation. Earlier events and unknown legacy warehouse snapshots are not reconstructed.' }
}
export async function createAsset(input, req) {
  permit(req.user, 'CREATE'); requireWarehouseAccess(req.user, input.warehouseId)
  return inventoryTransaction(async tx => {
    const product = await tx.product.findUnique({ where: { id: input.productId } })
    if (!product || product.status !== 'ACTIVE') throw new HttpError(400, 'Product is unavailable.')
    if (product.trackSerialNumbers && !input.serialNumberId) throw new HttpError(400, 'A serial number is required for this product.')
    if (!product.trackSerialNumbers && input.serialNumberId) throw new HttpError(400, 'This product does not track serial numbers.')
    if (input.serialNumberId) {
      if (await tx.warrantyClaim.count({ where: { activeSerialId: input.serialNumberId } })) throw new HttpError(409, 'Close the warehouse warranty claim before moving this serial into company assets.')
      const serial = await tx.serialNumber.findFirst({ where: { id: input.serialNumberId, productId: product.id, warehouseId: input.warehouseId, status: 'AVAILABLE', asset: null, maintenanceRecords: { none: { status: { in: ['SCHEDULED', 'IN_REPAIR'] } } }, reservationSelections: { none: { fulfilledAt: null, item: { reservation: { status: 'ACTIVE' } } } } } })
      if (!serial) throw new HttpError(400, 'Serial number is unavailable at this warehouse.')
    }
    const assetTag = await nextReference(tx, 'asset', 'AST', 6)
    await changeStock(tx, { productId: product.id, warehouseId: input.warehouseId, delta: -1, type: 'ASSET_ASSIGNMENT', referenceNumber: assetTag, userId: req.user.id, notes: 'Moved from warehouse inventory to company assets' })
    if (input.serialNumberId) {
      const changed = await tx.serialNumber.updateMany({ where: { id: input.serialNumberId, status: 'AVAILABLE', warehouseId: input.warehouseId }, data: { warehouseId: null } })
      if (changed.count !== 1) throw new HttpError(409, 'Serial number changed concurrently.')
    }
    const asset = await tx.asset.create({ data: { ...input, assetTag }, include })
    await assetEvent(tx, asset, 'ASSET_CREATED', 'Registered as a company asset; removed from warehouse stock.', req, asset.id, {}, 'ASSET_CREATED', 'AVAILABLE')
    return asset
  })
}
export async function updateAsset(id, input, req) {
  permit(req.user, 'EDIT')
  return inventoryTransaction(async tx => {
    const row = await ownedAsset(tx, id, req.user); version(row, input.expectedUpdatedAt)
    const { expectedUpdatedAt, ...data } = input
    if (data.warehouseId && data.warehouseId !== row.warehouseId) {
      requireWarehouseAccess(req.user, data.warehouseId)
      const warehouse = await tx.warehouse.findUnique({ where: { id: data.warehouseId } })
      if (warehouse?.status !== 'ACTIVE') throw new HttpError(400, 'Destination warehouse is inactive.')
      if (!['AVAILABLE', 'QUARANTINE'].includes(row.status) || await active(tx, id) || await tx.maintenanceRecord.count({ where: { assetId: id, status: { in: ['SCHEDULED', 'IN_REPAIR'] } } }) || await tx.warrantyClaim.count({ where: { assetId: id, activeSerialId: { not: null } } })) throw new HttpError(409, 'Close custody, maintenance and claims before moving asset ownership.')
    }
    if ('warehouseId' in data && !data.warehouseId) throw new HttpError(400, 'Asset ownership requires a warehouse.')
    await revise(tx.asset, row, data)
    await assetEvent(tx, row, 'ASSET_UPDATED', data.notes || 'Updated asset details.', req, id, { destinationWarehouseId: data.warehouseId || row.warehouseId })
    return tx.asset.findUnique({ where: { id }, include })
  })
}
export async function assignAsset(id, input, req, handover = false) {
  permit(req.user, 'EDIT')
  return inventoryTransaction(async tx => {
    const row = await ownedAsset(tx, id, req.user); version(row, input.expectedUpdatedAt)
    if (row.status !== (handover ? 'ASSIGNED' : 'AVAILABLE') || await openRepairs(tx, id)) throw new HttpError(409, 'Asset is not available for this custody action.')
    if (row.serialNumber && (row.serialNumber.warehouseId || row.serialNumber.status !== row.status)) throw new HttpError(409, 'Serial ownership or condition needs reconciliation before issuing custody.')
    const previous = await active(tx, id)
    if (handover) {
      if (!previous) throw new HttpError(409, 'No active assignment found.')
      version(previous, input.expectedAssignmentUpdatedAt)
      if (!input.conditionOnReturn || !input.notes?.trim()) throw new HttpError(400, 'Handover inspection and notes are required.')
      await revise(tx.assetAssignment, previous, { status: 'RETURNED', returnedDate: new Date(), returnedById: req.user.id, conditionOnReturn: input.conditionOnReturn, returnNotes: input.notes })
    } else if (previous) throw new HttpError(409, 'An active custodian already exists.')
    await revise(tx.asset, row, { status: 'ASSIGNED' })
    const assignment = await tx.assetAssignment.create({ data: { assetId: id, warehouseId: row.warehouseId, assignedById: req.user.id, assignedTo: input.assignedTo, department: input.department, location: input.location, conditionOnAssign: input.conditionOnAssign, notes: input.notes } })
    if (row.serialNumberId) await tx.serialNumber.update({ where: { id: row.serialNumberId }, data: { status: 'ASSIGNED' } })
    await assetEvent(tx, row, handover ? 'HANDOVER' : 'ASSIGNED', input.notes || `Assigned to ${input.assignedTo}.`, req, assignment.id, { assignedTo: input.assignedTo, previousAssignmentId: previous?.id || null }, handover ? 'HANDOVER' : 'ASSIGNED', 'ASSIGNED')
    return assignment
  })
}
export async function returnAsset(id, input, req) {
  permit(req.user, 'EDIT')
  return inventoryTransaction(async tx => {
    const row = await ownedAsset(tx, id, req.user); version(row, input.expectedUpdatedAt)
    if (!['ASSIGNED', 'QUARANTINE'].includes(row.status) || await openRepairs(tx, id)) throw new HttpError(409, 'Complete repair before returning custody.')
    const assignment = await active(tx, id)
    if (!assignment) throw new HttpError(409, 'No active assignment found.')
    version(assignment, input.expectedAssignmentUpdatedAt)
    if (!['AVAILABLE', 'QUARANTINE'].includes(input.disposition) || !input.conditionOnReturn?.trim()) throw new HttpError(400, 'Return inspection and disposition are required.')
    if (row.status === 'QUARANTINE' && input.disposition !== 'QUARANTINE') throw new HttpError(409, 'A quarantined asset needs a separate inspection before release.')
    if (row.serialNumber && !['ASSIGNED', 'AVAILABLE'].includes(row.serialNumber.status) && input.disposition !== 'QUARANTINE') throw new HttpError(409, 'Serial condition requires quarantine and a separate inspection.')
    await revise(tx.assetAssignment, assignment, { status: 'RETURNED', returnedDate: new Date(), returnedById: req.user.id, conditionOnReturn: input.conditionOnReturn, returnNotes: input.notes })
    await revise(tx.asset, row, { status: input.disposition })
    if (row.serialNumberId) await tx.serialNumber.update({ where: { id: row.serialNumberId }, data: { status: input.disposition } })
    await assetEvent(tx, row, 'RETURNED', input.conditionOnReturn, req, assignment.id, { disposition: input.disposition }, 'RETURNED', input.disposition)
    return { assetId: id, assignmentId: assignment.id }
  })
}
export async function inspectAsset(id, input, req) {
  permit(req.user, 'EDIT')
  return inventoryTransaction(async tx => {
    const row = await ownedAsset(tx, id, req.user); version(row, input.expectedUpdatedAt)
    if (row.status !== 'QUARANTINE' || await openRepairs(tx, id)) throw new HttpError(409, 'Only quarantined assets outside active repair can be inspected.')
    if (!input.notes?.trim()) throw new HttpError(400, 'Inspection evidence is required.')
    const status = await active(tx, id) ? 'ASSIGNED' : 'AVAILABLE'
    await revise(tx.asset, row, { status }); if (row.serialNumberId) await tx.serialNumber.update({ where: { id: row.serialNumberId }, data: { status } })
    await assetEvent(tx, row, 'INSPECTED', input.notes, req, id, { disposition: status }, 'INSPECTED', status)
    return tx.asset.findUnique({ where: { id }, include })
  })
}
export async function closeAsset(id, status, req, input = req.validated || {}) {
  permit(req.user, status === 'DISPOSED' ? 'DELETE' : 'EDIT')
  return inventoryTransaction(async tx => {
    const row = await ownedAsset(tx, id, req.user); version(row, input.expectedUpdatedAt)
    if (!['RETIRED', 'DISPOSED'].includes(status)) throw new HttpError(400, 'Invalid closure status.')
    if (['RETIRED', 'DISPOSED', 'LOST'].includes(row.status) || await active(tx, id)) throw new HttpError(409, 'Return custody before closing this asset, or it is already closed.')
    if (await tx.maintenanceRecord.count({ where: { assetId: id, status: { in: ['SCHEDULED', 'IN_REPAIR'] } } }) || await tx.warrantyClaim.count({ where: { assetId: id, activeSerialId: { not: null } } })) throw new HttpError(409, 'Close open maintenance and claims first.')
    if (!input.notes?.trim()) throw new HttpError(400, 'A closure reason is required.')
    await revise(tx.asset, row, { status }); if (row.serialNumberId && status === 'DISPOSED') await tx.serialNumber.update({ where: { id: row.serialNumberId }, data: { status } })
    await assetEvent(tx, row, status, input.notes, req, id, {}, status, status === 'DISPOSED' ? status : undefined)
    return tx.asset.findUnique({ where: { id } })
  })
}
export async function listMaintenance(query, user) {
  permit(user, 'VIEW'); const where = { asset: warehouseWhere(user, query.warehouse), ...(isAdministrator(user) ? {} : { OR: [{ warehouseId: null, status: { in: ['SCHEDULED', 'IN_REPAIR'] } }, warehouseWhere(user)] }) }
  if (query.status) where.status = query.status
  if (query.asset) where.assetId = query.asset
  return paginate(prisma.maintenanceRecord, { where, include: maintenanceInclude, query, allowedSort: ['createdAt', 'serviceDate', 'cost', 'status'], defaultSort: 'createdAt' })
}
export async function getMaintenance(id, user, tx = prisma) {
  permit(user, 'VIEW'); const row = await tx.maintenanceRecord.findUnique({ where: { id }, include: maintenanceInclude })
  if (!row) throw new HttpError(404, 'Maintenance record not found.')
  requireWarehouseAccess(user, row.asset.warehouseId); if (row.warehouseId) requireWarehouseAccess(user, row.warehouseId)
  else if (!isAdministrator(user) && ['COMPLETED', 'CANCELLED'].includes(row.status)) throw new HttpError(403, 'Legacy service has no recorded warehouse scope.')
  return row
}
export async function beginRepair(tx, asset) {
  if (asset.status !== 'MAINTENANCE') await revise(tx.asset, asset, { status: 'MAINTENANCE', servicePreviousStatus: asset.status, servicePreviousSerialStatus: asset.serialNumber?.status || null })
  else await revise(tx.asset, asset, {})
  if (asset.serialNumberId) await tx.serialNumber.update({ where: { id: asset.serialNumberId }, data: { status: 'FOR_REPAIR' } })
}
export async function createMaintenance(input, req) {
  permit(req.user, 'CREATE')
  return inventoryTransaction(async tx => {
    const asset = await ownedAsset(tx, input.assetId, req.user); version(asset, input.expectedAssetUpdatedAt); serviceable(asset)
    if (input.serialNumberId && input.serialNumberId !== asset.serialNumberId) throw new HttpError(400, 'Serial does not belong to this asset.')
    if (!['SCHEDULED', 'IN_REPAIR'].includes(input.status || 'SCHEDULED')) throw new HttpError(400, 'Use explicit maintenance completion or cancellation.')
    const { expectedAssetUpdatedAt, ...data } = input
    const record = await tx.maintenanceRecord.create({ data: { ...data, serialNumberId: asset.serialNumberId, warehouseId: asset.warehouseId, createdById: req.user.id, status: input.status || 'SCHEDULED' } })
    if (record.status === 'IN_REPAIR') await beginRepair(tx, asset); else await revise(tx.asset, asset, {})
    await assetEvent(tx, asset, 'MAINTENANCE_CREATED', input.issue, req, record.id, { status: record.status }, record.status === 'IN_REPAIR' ? 'SENT_FOR_REPAIR' : 'MAINTENANCE_CREATED', record.status === 'IN_REPAIR' ? 'FOR_REPAIR' : undefined)
    return record
  })
}
export async function updateMaintenance(id, input, req) {
  permit(req.user, 'EDIT')
  return inventoryTransaction(async tx => {
    const record = await getMaintenance(id, req.user, tx); version(record, input.expectedUpdatedAt)
    const asset = await ownedAsset(tx, record.assetId, req.user); version(asset, input.expectedAssetUpdatedAt); serviceable(asset)
    if (['COMPLETED', 'CANCELLED'].includes(record.status)) throw new HttpError(409, 'Closed maintenance cannot be edited.')
    if (input.status && (input.status !== 'IN_REPAIR' || record.status !== 'SCHEDULED')) throw new HttpError(409, 'Use the explicit start, completion or cancellation action.')
    const { expectedUpdatedAt, expectedAssetUpdatedAt, ...data } = input
    if (data.assetId || data.serialNumberId || data.planId) throw new HttpError(400, 'Maintenance identities cannot be edited.')
    await revise(tx.maintenanceRecord, record, data)
    if (data.status === 'IN_REPAIR') await beginRepair(tx, asset); else await revise(tx.asset, asset, {})
    await assetEvent(tx, asset, data.status === 'IN_REPAIR' ? 'MAINTENANCE_STARTED' : 'MAINTENANCE_UPDATED', data.notes || data.issue || record.issue, req, id, {}, data.status === 'IN_REPAIR' ? 'SENT_FOR_REPAIR' : 'MAINTENANCE_UPDATED', data.status === 'IN_REPAIR' ? 'FOR_REPAIR' : undefined)
    return tx.maintenanceRecord.findUnique({ where: { id } })
  })
}
export async function finishMaintenance(id, status, req, input = req.validated || {}) {
  permit(req.user, 'EDIT')
  return inventoryTransaction(async tx => {
    const record = await getMaintenance(id, req.user, tx); version(record, input.expectedUpdatedAt)
    const asset = await ownedAsset(tx, record.assetId, req.user); version(asset, input.expectedAssetUpdatedAt)
    if (['COMPLETED', 'CANCELLED'].includes(record.status)) throw new HttpError(409, 'Maintenance is already closed.')
    if (!['COMPLETED', 'CANCELLED'].includes(status) || !input.notes?.trim()) throw new HttpError(400, 'Closure notes are required.')
    if (status === 'COMPLETED' && (record.status !== 'IN_REPAIR' || !['AVAILABLE', 'QUARANTINE'].includes(input.inspectionResult))) throw new HttpError(409, 'Start service and record an inspection before completing it.')
    const completedAt = new Date()
    await revise(tx.maintenanceRecord, record, { status, notes: input.notes, inspectionResult: status === 'COMPLETED' ? input.inspectionResult : null, ...(status === 'COMPLETED' ? { completedDate: completedAt, ...(input.cost != null ? { cost: input.cost } : {}) } : {}) })
    const other = await openRepairs(tx, asset.id)
    // An adverse inspection remains latched until the last parallel repair closes.
    const adverse = (status === 'COMPLETED' && input.inspectionResult === 'QUARANTINE') || asset.servicePreviousStatus === 'QUARANTINE'
    if (record.status === 'IN_REPAIR' && !other) {
      const safe = status === 'COMPLETED' ? !adverse : ['AVAILABLE', 'ASSIGNED'].includes(asset.servicePreviousStatus) && (!asset.serialNumberId || ['AVAILABLE', 'ASSIGNED'].includes(asset.servicePreviousSerialStatus))
      const restored = safe ? (await active(tx, asset.id) ? 'ASSIGNED' : 'AVAILABLE') : 'QUARANTINE'
      await revise(tx.asset, asset, { status: restored, servicePreviousStatus: null, servicePreviousSerialStatus: null })
      if (asset.serialNumberId) await tx.serialNumber.update({ where: { id: asset.serialNumberId }, data: { status: restored } })
    } else await revise(tx.asset, asset, other && adverse ? { servicePreviousStatus: 'QUARANTINE' } : {})
    if (status === 'COMPLETED' && record.planId) {
      const plan = await tx.preventiveMaintenancePlan.findUnique({ where: { id: record.planId } })
      if (plan.nextDueAt.getTime() !== record.plannedDueAt.getTime()) throw new HttpError(409, 'Plan due date changed during service.')
      await revise(tx.preventiveMaintenancePlan, plan, { nextDueAt: new Date(completedAt.getTime() + plan.intervalDays * 86400000) })
    }
    const updatedAsset = await tx.asset.findUnique({ where: { id: asset.id } })
    await assetEvent(tx, asset, status === 'COMPLETED' ? 'MAINTENANCE_COMPLETED' : 'MAINTENANCE_CANCELLED', input.notes, req, id, { inspectionResult: input.inspectionResult || null, status: updatedAsset.status }, status === 'COMPLETED' ? 'MAINTENANCE_COMPLETED' : 'MAINTENANCE_CANCELLED', record.status === 'IN_REPAIR' ? (other ? 'FOR_REPAIR' : updatedAsset.status) : undefined)
    return tx.maintenanceRecord.findUnique({ where: { id } })
  })
}
