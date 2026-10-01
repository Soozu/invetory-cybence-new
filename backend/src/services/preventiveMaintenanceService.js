import { prisma } from '../config/prisma.js'
import { inventoryTransaction } from './inventoryService.js'
import { warehouseWhere } from './warehouseAccessService.js'
import { paginate } from '../utils/query.js'
import { HttpError } from '../utils/http.js'
import { permit, version, revise, ownedAsset, serviceable, assetEvent } from './assetWorkflowRules.js'

export async function listPlans(query, user) {
  permit(user, 'VIEW'); const where = { asset: warehouseWhere(user, query.warehouse) }
  if (query.asset) where.assetId = query.asset
  if (query.status) where.status = query.status
  if (query.due === 'true') { where.status = 'ACTIVE'; where.nextDueAt = { lte: new Date() } }
  return paginate(prisma.preventiveMaintenancePlan, { where, include: { asset: { include: { product: true } }, records: { where: { status: { in: ['SCHEDULED', 'IN_REPAIR'] } }, select: { id: true, status: true } } }, query, allowedSort: ['nextDueAt', 'createdAt', 'status'], defaultSort: 'nextDueAt' })
}
export async function createPlan(input, req) {
  permit(req.user, 'CREATE')
  return inventoryTransaction(async tx => {
    const asset = await ownedAsset(tx, input.assetId, req.user); version(asset, input.expectedAssetUpdatedAt); serviceable(asset)
    const { expectedAssetUpdatedAt, ...data } = input
    const plan = await tx.preventiveMaintenancePlan.create({ data })
    await revise(tx.asset, asset, {}); await assetEvent(tx, asset, 'PLAN_CREATED', input.instructions, req, plan.id, { intervalDays: plan.intervalDays, nextDueAt: plan.nextDueAt.toISOString() })
    return plan
  })
}
export async function updatePlan(id, input, req) {
  permit(req.user, 'EDIT')
  return inventoryTransaction(async tx => {
    const plan = await tx.preventiveMaintenancePlan.findUnique({ where: { id } }); if (!plan) throw new HttpError(404, 'Maintenance plan not found.')
    const asset = await ownedAsset(tx, plan.assetId, req.user); version(plan, input.expectedUpdatedAt); serviceable(asset)
    if (plan.status === 'CANCELLED') throw new HttpError(409, 'Cancelled plans are immutable.')
    if (await tx.maintenanceRecord.count({ where: { planId: id, status: { in: ['SCHEDULED', 'IN_REPAIR'] } } }) && (input.nextDueAt || input.intervalDays)) throw new HttpError(409, 'Complete or cancel the current occurrence before changing its schedule.')
    const { expectedUpdatedAt, ...data } = input
    await revise(tx.preventiveMaintenancePlan, plan, data); await assetEvent(tx, asset, 'PLAN_UPDATED', input.instructions || `Plan ${input.status || 'updated'}. Existing services are retained.`, req, id, { status: input.status || plan.status })
    return tx.preventiveMaintenancePlan.findUnique({ where: { id } })
  })
}
export async function schedulePlan(id, input, req) {
  permit(req.user, 'CREATE')
  try { return await inventoryTransaction(async tx => {
    const plan = await tx.preventiveMaintenancePlan.findUnique({ where: { id } }); if (!plan) throw new HttpError(404, 'Maintenance plan not found.')
    const asset = await ownedAsset(tx, plan.assetId, req.user); version(plan, input.expectedUpdatedAt); version(asset, input.expectedAssetUpdatedAt); serviceable(asset)
    if (plan.status !== 'ACTIVE' || await tx.maintenanceRecord.count({ where: { planId: id, status: { in: ['SCHEDULED', 'IN_REPAIR'] } } })) throw new HttpError(409, 'Plan is paused, cancelled or already has an open service.')
    const record = await tx.maintenanceRecord.create({ data: { assetId: asset.id, serialNumberId: asset.serialNumberId, warehouseId: asset.warehouseId, planId: id, plannedDueAt: plan.nextDueAt, kind: 'PREVENTIVE', issue: plan.title, description: plan.instructions, serviceDate: plan.nextDueAt, status: 'SCHEDULED', createdById: req.user.id } })
    await revise(tx.preventiveMaintenancePlan, plan, {}); await revise(tx.asset, asset, {})
    await assetEvent(tx, asset, 'PREVENTIVE_SCHEDULED', plan.instructions, req, record.id, { planId: id, plannedDueAt: plan.nextDueAt.toISOString() })
    return record
  }) } catch (error) { if (error.code === 'P2002') throw new HttpError(409, 'This due occurrence already exists. Review its retained service record before changing the due date.'); throw error }
}
