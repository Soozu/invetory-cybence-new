import { deliverNotifications } from './notificationDelivery.js'
import { prisma } from '../config/prisma.js'
import { inventoryTransaction } from './inventoryService.js'
import { warehouseWhere, requireWarehouseAccess, canAccessWarehouse } from './warehouseAccessService.js'
import { permit, version, revise } from './assetWorkflowRules.js'
import { paginate } from '../utils/query.js'
import { nextReference } from '../utils/references.js'
import { HttpError } from '../utils/http.js'
import { recordSerialEvents } from '../utils/serialEvents.js'
import { audit } from '../utils/audit.js'

const can = (u, module) => u.role === 'Administrator' || u.permissions?.includes(`${module}.VIEW`)
const sourceInclude = { product: { select: { id: true, name: true, sku: true } }, supplier: { select: { id: true, companyName: true } }, asset: { select: { id: true, assetTag: true, status: true, warehouseId: true } }, receipt: { include: { items: true, purchaseOrder: true } }, purchaseOrderItem: true }
const include = { serialNumber: { select: { id: true, serialNumber: true, product: { select: { name: true, sku: true } } } }, supplier: { select: { id: true, companyName: true } }, warehouse: { select: { id: true, name: true } }, asset: { select: { id: true, assetTag: true, warehouseId: true } }, receipt: { select: { id: true, receiptNumber: true, warehouseId: true, purchaseOrderId: true } }, maintenance: true, supplierReturn: { select: { id: true, returnNumber: true, warehouseId: true } }, events: { orderBy: { createdAt: 'desc' }, include: { user: { select: { firstName: true, lastName: true } } } } }
function coverage(start, end, now = new Date()) {
  if (!start || !end || end < start) return false
  const dayEnd = new Date(end); dayEnd.setUTCHours(23, 59, 59, 999)
  return now >= start && now <= dayEnd
}
function sourceScope(user, warehouse) {
  const OR = []
  if (can(user, 'inventory')) OR.push({ asset: null, warehouseId: { not: null }, ...warehouseWhere(user, warehouse) })
  if (can(user, 'assets')) OR.push({ asset: { is: { warehouseId: { not: null }, ...warehouseWhere(user, warehouse) } } })
  return { OR }
}
function provenance(row) {
  return Boolean(row.supplierId && row.receiptId && row.purchaseOrderItemId && row.warrantyStart && row.warrantyEnd && row.warrantyEnd >= row.warrantyStart && row.receipt?.purchaseOrder.supplierId === row.supplierId && row.purchaseOrderItem?.productId === row.productId && row.receipt.purchaseOrderId === row.purchaseOrderItem.purchaseOrderId && row.receipt.items.some(item => item.productId === row.productId && item.purchaseOrderItemId === row.purchaseOrderItemId))
}
function viewSource(row, user) {
  const wh = row.asset?.warehouseId || row.warehouseId
  return { id: row.id, serialNumber: row.serialNumber, product: row.product, supplier: row.supplier, asset: row.asset, warehouseId: wh, status: row.status, warrantyStart: row.warrantyStart, warrantyEnd: row.warrantyEnd, hasProvenance: provenance(row), covered: coverage(row.warrantyStart, row.warrantyEnd), receipt: can(user, 'purchasing') && row.receipt && canAccessWarehouse(user, row.receipt.warehouseId) ? { id: row.receipt.id, receiptNumber: row.receipt.receiptNumber, purchaseOrderId: row.receipt.purchaseOrderId } : null }
}
function redact(row, user) {
  const receipt = row.receipt && can(user, 'purchasing') && canAccessWarehouse(user, row.receipt.warehouseId) ? row.receipt : null
  const asset = row.asset && can(user, 'assets') && canAccessWarehouse(user, row.asset.warehouseId) ? row.asset : null
  const maintenance = row.maintenance && can(user, 'assets') && canAccessWarehouse(user, row.maintenance.warehouseId) ? row.maintenance : null
  const supplierReturn = row.supplierReturn && can(user, 'supplier_returns') && canAccessWarehouse(user, row.supplierReturn.warehouseId) ? row.supplierReturn : null
  return { ...row, receipt, receiptId: receipt?.id || null, asset, assetId: asset?.id || null, maintenance, maintenanceId: maintenance?.id || null, supplierReturn, supplierReturnId: supplierReturn?.id || null, covered: coverage(row.warrantyStart, row.warrantyEnd) }
}
async function source(tx, id, user) {
  const row = await tx.serialNumber.findUnique({ where: { id }, include: sourceInclude })
  if (!row) throw new HttpError(404, 'Serial number not found.')
  permit(user, 'VIEW', row.asset ? 'assets' : 'inventory'); requireWarehouseAccess(user, row.asset?.warehouseId || row.warehouseId)
  if (!(row.asset?.warehouseId || row.warehouseId)) throw new HttpError(409, 'Record asset warehouse ownership before opening a claim.')
  if (!provenance(row)) throw new HttpError(409, 'Exact receipt, PO line, supplier and warranty dates are required. Legacy provenance is not guessed.')
  if (row.asset && ['RETIRED', 'DISPOSED', 'LOST'].includes(row.asset.status)) throw new HttpError(409, 'A closed or lost asset cannot open a claim.')
  if (!['AVAILABLE', 'ASSIGNED', 'QUARANTINE', 'DEFECTIVE', 'FOR_REPAIR'].includes(row.status)) throw new HttpError(409, 'This serial is reserved, shipped or unavailable for a new claim.')
  if (await tx.inventoryReservationSerial.count({ where: { serialNumberId: id, fulfilledAt: null, item: { reservation: { status: 'ACTIVE' } } } })) throw new HttpError(409, 'Release active reservation before opening a claim.')
  return row
}
export async function listSources(query, user) {
  permit(user, 'CREATE', 'warranty_claims')
  const where = sourceScope(user, query.warehouse)
  if (query.search) where.AND = [{ OR: [{ serialNumber: { contains: query.search } }, { asset: { assetTag: { contains: query.search } } }] }]
  const result = await paginate(prisma.serialNumber, { where, include: sourceInclude, query, allowedSort: ['serialNumber', 'createdAt'], defaultSort: 'createdAt' }); result.data = result.data.map(row => viewSource(row, user)); return result
}
export async function listClaims(query, user) {
  permit(user, 'VIEW', 'warranty_claims'); const where = warehouseWhere(user, query.warehouse)
  if (query.status) where.status = query.status
  if (query.search) where.OR = [{ claimNumber: { contains: query.search } }, { serialNumber: { serialNumber: { contains: query.search } } }]
  const result = await paginate(prisma.warrantyClaim, { where, include, query, allowedSort: ['createdAt', 'claimNumber', 'status'], defaultSort: 'createdAt' }); result.data = result.data.map(row => redact(row, user)); return result
}
export async function getClaim(id, user, tx = prisma) {
  permit(user, 'VIEW', 'warranty_claims'); const row = await tx.warrantyClaim.findUnique({ where: { id }, include })
  if (!row) throw new HttpError(404, 'Warranty claim not found.')
  requireWarehouseAccess(user, row.warehouseId); return tx === prisma ? redact(row, user) : row
}
async function event(tx, row, action, notes, req, data = {}) {
  await tx.warrantyClaimEvent.create({ data: { claimId: row.id, userId: req.user.id, action, notes, data } })
  await recordSerialEvents(tx, [row.serialNumberId], { type: `WARRANTY_${action}`, warehouseId: row.warehouseId, referenceType: 'WarrantyClaim', referenceId: row.id, referenceNumber: row.claimNumber, notes }, req)
  const after=await tx.warrantyClaim.findUnique({where:{id:row.id}})
  await audit(tx, req, action, 'Warranty Claims', 'WarrantyClaim', row.id, `${action} ${row.claimNumber}.`, { warehouseId: row.warehouseId,before:action==='CREATED'?null:row,after })
  const recipients=await tx.user.findMany({where:{status:'ACTIVE',OR:[{role:{name:'Administrator'}},{warehouseAssignments:{some:{warehouseId:row.warehouseId}}}]},select:{id:true}})
  await deliverNotifications(tx,recipients.map(u=>({userId:u.id,warehouseId:row.warehouseId,type:'WARRANTY_CLAIM_UPDATE',title:'Warranty claim updated',message:`${row.claimNumber}: ${after.status.toLowerCase()}.`,referenceType:'WarrantyClaim',referenceId:row.id})))
}
export async function createClaim(input, req) {
  permit(req.user, 'CREATE', 'warranty_claims')
  try { return await inventoryTransaction(async tx => {
    const row = await source(tx, input.serialNumberId, req.user)
    const claimNumber = await nextReference(tx, 'warranty-claim', 'WC', 6)
    const claim = await tx.warrantyClaim.create({ data: { claimNumber, serialNumberId: row.id, activeSerialId: row.id, assetId: row.asset?.id || null, warehouseId: row.asset?.warehouseId || row.warehouseId, supplierId: row.supplierId, receiptId: row.receiptId, warrantyStart: row.warrantyStart, warrantyEnd: row.warrantyEnd, issue: input.issue } })
    await event(tx, claim, 'CREATED', input.issue, req); return redact(await tx.warrantyClaim.findUnique({ where: { id: claim.id }, include }), req.user)
  }) } catch (error) { if (error.code === 'P2002') throw new HttpError(409, 'An active claim already exists for this exact serial.'); throw error }
}
export async function claimAction(id, action, input, req) {
  permit(req.user, ['accept', 'reject', 'resolve'].includes(action) ? 'APPROVE' : 'EDIT', 'warranty_claims')
  return inventoryTransaction(async tx => {
    const row = await getClaim(id, req.user, tx); version(row, input.expectedUpdatedAt)
    const transitions = { submit: ['DRAFT', 'SUBMITTED'], accept: ['SUBMITTED', 'ACCEPTED'], reject: ['SUBMITTED', 'REJECTED'], resolve: ['ACCEPTED', 'RESOLVED'] }
    const data = {}
    if (action === 'edit') {
      if (row.status !== 'DRAFT') throw new HttpError(409, 'Only drafts can be edited.')
      if (!input.issue?.trim()) throw new HttpError(400, 'Issue description is required.')
      data.issue = input.issue
    } else if (action === 'cancel') {
      if (!['DRAFT', 'SUBMITTED'].includes(row.status)) throw new HttpError(409, 'Only draft or submitted claims can be cancelled.')
      data.status = 'CANCELLED'; data.activeSerialId = null
    } else {
      const transition = transitions[action]
      if (!transition || row.status !== transition[0]) throw new HttpError(409, 'Claim is not in the required state for this action.')
      data.status = transition[1]
      if (action === 'submit') {
        const current = await source(tx, row.serialNumberId, req.user)
        if ((current.asset?.id || null) !== row.assetId || (current.asset?.warehouseId || current.warehouseId) !== row.warehouseId || current.receiptId !== row.receiptId || current.supplierId !== row.supplierId || current.warrantyStart.getTime() !== row.warrantyStart.getTime() || current.warrantyEnd.getTime() !== row.warrantyEnd.getTime()) throw new HttpError(409, 'Claim source changed. Cancel the draft and review the current source.')
        if (!coverage(row.warrantyStart, row.warrantyEnd)) throw new HttpError(409, 'Warranty coverage is expired, future dated or unknown.')
        data.submittedAt = new Date()
      }
      if (['accept', 'resolve'].includes(action)) {
        if (!input.providerReference?.trim()) throw new HttpError(400, 'Recorded supplier reference is required.')
        data.providerReference = input.providerReference
      }
      if (action === 'resolve') {
        if (!['REPAIRED', 'REPLACED', 'CREDIT', 'UNREPAIRED'].includes(input.outcome)) throw new HttpError(400, 'An explicit supplier outcome is required.')
        if (input.maintenanceId) {
          permit(req.user, 'VIEW'); const record = await tx.maintenanceRecord.findUnique({ where: { id: input.maintenanceId } })
          if (!record || !row.assetId || record.assetId !== row.assetId || record.serialNumberId !== row.serialNumberId || record.warehouseId !== row.warehouseId || record.status !== 'COMPLETED') throw new HttpError(409, 'Supporting service must be completed for this exact asset, serial and warehouse.')
          data.maintenanceId = record.id
        }
        if (input.supplierReturnId) {
          permit(req.user, 'VIEW', 'supplier_returns'); const document = await tx.supplierReturn.findUnique({ where: { id: input.supplierReturnId }, include: { items: { include: { serialSelections: true } } } })
          if (!document || document.warehouseId !== row.warehouseId || document.receiptId !== row.receiptId || document.supplierId !== row.supplierId || !['SHIPPED', 'COMPLETED'].includes(document.status) || !document.items.some(item => item.serialSelections.some(s => s.serialNumberId === row.serialNumberId))) throw new HttpError(409, 'Supporting return must contain this exact serial, receipt, supplier and warehouse and have shipped.')
          data.supplierReturnId = document.id
        }
        data.outcome = input.outcome; data.resolvedAt = new Date(); data.activeSerialId = null
      }
      if (action === 'reject') data.activeSerialId = null
    }
    if (!input.notes?.trim()) throw new HttpError(400, 'Action evidence or notes are required.')
    data.notes = input.notes; await revise(tx.warrantyClaim, row, data)
    await event(tx, row, action.toUpperCase(), input.notes, req, { status: data.status || row.status, providerReference: data.providerReference || null, outcome: data.outcome || null, maintenanceId: data.maintenanceId || null, supplierReturnId: data.supplierReturnId || null })
    return redact(await tx.warrantyClaim.findUnique({ where: { id }, include }), req.user)
  })
}
