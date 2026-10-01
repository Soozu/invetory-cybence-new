import { notificationWriter } from './notificationDelivery.js'
import { prisma } from '../config/prisma.js'
import { inventoryTransaction } from './inventoryService.js'
import { createOrderInTransaction } from './procurementService.js'
import { requireWarehouseAccess, warehouseWhere } from './warehouseAccessService.js'
import { paginate } from '../utils/query.js'
import { HttpError } from '../utils/http.js'
import { nextReference } from '../utils/references.js'
import { audit } from '../utils/audit.js'

const person = { select: { id: true, firstName: true, lastName: true } }
const include = { warehouse: { select: { id: true, name: true, code: true } }, requestedBy: person, approvedBy: person, rejectedBy: person,
  rfqs: { where: { status: { not: 'CANCELLED' } }, take: 1, select: { id: true, rfqNumber: true, status: true } },
  purchaseOrder: { select: { id: true, poNumber: true, status: true } }, items: { include: { product: { select: { id: true, name: true, sku: true } } } } }
export async function requestRecord(tx, id, user) {
  const record = await tx.purchaseRequest.findUnique({ where: { id }, include })
  if (!record) throw new HttpError(404, 'Purchase request not found.')
  requireWarehouseAccess(user, record.warehouseId)
  return record
}
function unchanged(record, input) {
  if (!input.expectedUpdatedAt || new Date(input.expectedUpdatedAt).getTime() !== record.updatedAt.getTime()) throw new HttpError(409, 'Purchase request changed since you opened it. Reload before continuing.')
}
export const getRequest = (id, user) => requestRecord(prisma, id, user)
export async function listRequests(query, user) {
  const where = warehouseWhere(user, query.warehouse)
  if (query.status) { if (!['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CONVERTED', 'CANCELLED'].includes(query.status)) throw new HttpError(400, 'Invalid request status.'); where.status = query.status }
  if (query.search) where.OR = [{ prNumber: { contains: query.search } }, { department: { contains: query.search } }]
  return paginate(prisma.purchaseRequest, { where, include, query, allowedSort: ['createdAt', 'prNumber', 'requiredDate', 'status'], defaultSort: 'createdAt' })
}
async function validatedItems(tx, input) {
  const warehouse = await tx.warehouse.findUnique({ where: { id: input.warehouseId } })
  if (warehouse?.status !== 'ACTIVE') throw new HttpError(400, 'Warehouse is unavailable.')
  const ids = input.items.flatMap(item => item.productId ? [item.productId] : [])
  const products = await tx.product.findMany({ where: { id: { in: ids }, status: 'ACTIVE' }, select: { id: true, name: true } })
  if (new Set(ids).size !== ids.length || products.length !== ids.length) throw new HttpError(400, 'A catalog product is repeated or unavailable.')
  return input.items.map(item => ({ productId: item.productId || null, description: item.description || products.find(product => product.id === item.productId)?.name,
    quantity: item.quantity, estimatedUnitCost: item.estimatedUnitCost, notes: item.notes }))
}
export async function createRequest(input, req) {
  requireWarehouseAccess(req.user, input.warehouseId)
  return inventoryTransaction(tx => createRequestInTransaction(tx, input, req))
}
export async function createRequestInTransaction(tx, input, req) {
  requireWarehouseAccess(req.user, input.warehouseId)
  const items = await validatedItems(tx, input), year = new Date().getFullYear(), { items: ignored, expectedUpdatedAt: ignoredVersion, ...metadata } = input
  const record = await tx.purchaseRequest.create({ data: { ...metadata, requestedById: req.user.id, prNumber: await nextReference(tx, `purchase-request-${year}`, `PR-${year}`), items: { create: items } }, include })
  await audit(tx, req, 'CREATED', 'Purchase Requests', 'PurchaseRequest', record.id, `Created ${record.prNumber}.`, { warehouseId: input.warehouseId })
  return record
}
export async function updateRequest(id, input, req) {
  requireWarehouseAccess(req.user, input.warehouseId)
  return inventoryTransaction(async tx => {
    const record = await requestRecord(tx, id, req.user)
    if (record.status !== 'DRAFT') throw new HttpError(409, 'Only draft purchase requests can be edited.')
    unchanged(record, input)
    const items = await validatedItems(tx, input), { items: ignored, expectedUpdatedAt: ignoredVersion, ...metadata } = input
    await tx.purchaseRequestItem.deleteMany({ where: { purchaseRequestId: id } })
    const updated = await tx.purchaseRequest.update({ where: { id }, data: { ...metadata, items: { create: items } }, include })
    await audit(tx, req, 'UPDATED', 'Purchase Requests', 'PurchaseRequest', id, `Updated ${record.prNumber}.`, { warehouseId: record.warehouseId, relatedWarehouseId: input.warehouseId,before:record,after:updated })
    return updated
  })
}
export async function transitionRequest(id, action, input, req) {
  const steps = { submit: { from: ['DRAFT'], to: 'SUBMITTED' }, approve: { from: ['SUBMITTED'], to: 'APPROVED' }, reject: { from: ['SUBMITTED'], to: 'REJECTED' }, cancel: { from: ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'], to: 'CANCELLED' } }
  return inventoryTransaction(async tx => {
    const record = await requestRecord(tx, id, req.user), step = steps[action]
    if (!step || !step.from.includes(record.status)) throw new HttpError(409, 'This purchase request cannot perform that action.')
    unchanged(record, input)
    if (action === 'reject' && !input.notes?.trim()) throw new HttpError(400, 'Explain the rejection.')
    if (action === 'cancel' && await tx.rFQ.count({ where: { purchaseRequestId: id, status: { not: 'CANCELLED' } } })) throw new HttpError(409, 'Cancel the linked RFQ before cancelling this request.')
    const changed = await tx.purchaseRequest.updateMany({ where: { id, status: record.status }, data: { status: step.to,
      ...(action === 'submit' ? { submittedAt: new Date() } : {}),
      ...(action === 'approve' ? { approvedAt: new Date(), approvedById: req.user.id, approvalNotes: input.notes || null } : {}),
      ...(action === 'reject' ? { rejectedAt: new Date(), rejectedById: req.user.id, approvalNotes: input.notes } : {}) } })
    if (changed.count !== 1) throw new HttpError(409, 'Purchase request changed concurrently. Reload it.')
    await audit(tx, req, action.toUpperCase(), 'Purchase Requests', 'PurchaseRequest', id, `${action} ${record.prNumber}.${input.notes ? ` ${input.notes}` : ''}`, { warehouseId: record.warehouseId,before:record,after:await tx.purchaseRequest.findUnique({where:{id}}) })
    if (action === 'submit') {
      const approvers = await tx.user.findMany({ where: { status: 'ACTIVE', OR: [{ role: { name: 'Administrator' } },
        { warehouseAssignments: { some: { warehouseId: record.warehouseId } }, role: { permissions: { some: { permission: { module: 'purchase_requests', action: 'APPROVE' } } } } }] }, select: { id: true } })
      if (approvers.length) await notificationWriter(tx).createMany({ data: approvers.map(user => ({ userId: user.id, warehouseId: record.warehouseId, type: 'PURCHASE_REQUEST_APPROVAL', title: 'Purchase request needs review', message: `${record.prNumber} is awaiting review.`, referenceType: 'PurchaseRequest', referenceId: id })) })
    }
    if (['approve', 'reject'].includes(action)) await notificationWriter(tx).create({ data: { userId: record.requestedById, warehouseId: record.warehouseId, type: 'PURCHASE_REQUEST_DECISION', title: `Purchase request ${step.to.toLowerCase()}`, message: `${record.prNumber} was ${step.to.toLowerCase()}.`, referenceType: 'PurchaseRequest', referenceId: id } })
    return requestRecord(tx, id, req.user)
  })
}
export async function convertRequest(id, input, req) {
  return inventoryTransaction(async tx => {
    const record = await requestRecord(tx, id, req.user)
    if (record.status !== 'APPROVED' || record.purchaseOrderId) throw new HttpError(409, 'Only an approved, unconverted request can create a purchase order.')
    unchanged(record, input)
    if (await tx.rFQ.count({ where: { purchaseRequestId: id, status: { not: 'CANCELLED' } } })) throw new HttpError(409, 'Complete the active RFQ award workflow or cancel it before direct conversion.')
    if (input.items.length !== record.items.length || new Set(input.items.map(item => item.purchaseRequestItemId)).size !== input.items.length || new Set(input.items.map(item => item.productId)).size !== input.items.length) throw new HttpError(400, 'Map every request item to a distinct catalog product once.')
    const lines = input.items.map(line => {
      const item = record.items.find(item => item.id === line.purchaseRequestItemId)
      if (!item || (item.productId && item.productId !== line.productId)) throw new HttpError(400, 'Conversion must preserve requested catalog products and item identities.')
      return { productId: line.productId, quantity: item.quantity, unitCost: line.unitCost }
    })
    const order = await createOrderInTransaction(tx, { supplierId: input.supplierId, warehouseId: record.warehouseId, expectedDelivery: input.expectedDelivery,
      tax: input.tax, shipping: input.shipping, notes: input.notes, reference: record.prNumber, items: lines }, req)
    const changed = await tx.purchaseRequest.updateMany({ where: { id, status: 'APPROVED', purchaseOrderId: null }, data: { status: 'CONVERTED', purchaseOrderId: order.id, convertedAt: new Date() } })
    if (changed.count !== 1) throw new HttpError(409, 'Purchase request changed concurrently.')
    await audit(tx, req, 'CONVERTED', 'Purchase Requests', 'PurchaseRequest', id, `Converted ${record.prNumber} to draft ${order.poNumber}.`, { warehouseId: record.warehouseId })
    return { request: await requestRecord(tx, id, req.user), purchaseOrder: order }
  })
}
