import { prisma } from '../config/prisma.js'
import { inventoryTransaction } from './inventoryService.js'
import { requestRecord } from './purchaseRequestService.js'
import { warehouseWhere, requireWarehouseAccess } from './warehouseAccessService.js'
import { paginate } from '../utils/query.js'
import { nextReference } from '../utils/references.js'
import { HttpError } from '../utils/http.js'
import { audit } from '../utils/audit.js'

const person = { select: { id: true, firstName: true, lastName: true } }
const include = { warehouse: { select: { id: true, name: true, code: true } }, createdBy: person, selectedBy: person,
  purchaseRequest: { select: { id: true, prNumber: true, status: true } },
  suppliers: { include: { supplier: { select: { id: true, companyName: true, supplierCode: true } } } },
  items: { include: { product: { select: { id: true, name: true, sku: true } } } },
  quotations: { select: { id: true, quotationNumber: true, supplierId: true, status: true, total: true, validUntil: true, updatedAt: true, purchaseOrder: { select: { id: true, poNumber: true } } } }
}
export async function rfqRecord(tx, id, user) {
  const row = await tx.rFQ.findUnique({ where: { id }, include })
  if (!row) throw new HttpError(404, 'RFQ not found.')
  requireWarehouseAccess(user, row.warehouseId)
  return row
}
export function currentVersion(row, input) {
  if (!input.expectedUpdatedAt || new Date(input.expectedUpdatedAt).getTime() !== row.updatedAt.getTime()) throw new HttpError(409, 'Document changed since you opened it. Reload before continuing.')
}
// Millisecond timestamps are optimistic version tokens. Always advance them,
// including fast writes and clocks adjusted backwards, so old forms stay stale.
export const nextDocumentVersion = row => new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1))
export const getRFQ = (id, user) => rfqRecord(prisma, id, user)
export async function listRFQs(query, user) {
  const where = warehouseWhere(user, query.warehouse)
  if (query.status) { if (!['DRAFT','ISSUED','CLOSED','AWARDED','CANCELLED'].includes(query.status)) throw new HttpError(400, 'Invalid RFQ status.'); where.status = query.status }
  if (query.search) where.rfqNumber = { contains: query.search }
  return paginate(prisma.rFQ, { where, include, query, allowedSort: ['createdAt','rfqNumber','closingDate','status'], defaultSort: 'createdAt' })
}
export function quotationsOpen(rfq) {
  if (rfq.status !== 'ISSUED' || (rfq.closingDate && rfq.closingDate <= new Date())) throw new HttpError(409, 'This RFQ is not open for quotations.')
}
async function validatedRFQ(tx, input, user, existingId) {
  requireWarehouseAccess(user, input.warehouseId)
  if ((await tx.warehouse.findUnique({ where: { id: input.warehouseId } }))?.status !== 'ACTIVE') throw new HttpError(400, 'Warehouse is unavailable.')
  if (input.closingDate && new Date(input.closingDate) <= new Date()) throw new HttpError(400, 'Closing date must be in the future.')
  if (new Set(input.supplierIds).size !== input.supplierIds.length || await tx.supplier.count({ where: { id: { in: input.supplierIds }, status: 'ACTIVE' } }) !== input.supplierIds.length) throw new HttpError(400, 'A supplier is repeated or inactive.')
  if (input.purchaseRequestId) {
    const request = await requestRecord(tx, input.purchaseRequestId, user)
    if (request.status !== 'APPROVED' || request.warehouseId !== input.warehouseId) throw new HttpError(409, 'Choose an approved request for this warehouse.')
    if (await tx.rFQ.count({ where: { purchaseRequestId: request.id, status: { not: 'CANCELLED' }, ...(existingId ? { id: { not: existingId } } : {}) } })) throw new HttpError(409, 'This request already has an active RFQ. Cancel that RFQ before creating another.')
    return request.items.map(item => ({ productId: item.productId, purchaseRequestItemId: item.id, description: item.description, quantity: item.quantity, notes: item.notes }))
  }
  if (!input.items?.length) throw new HttpError(400, 'Add requested items.')
  const ids = input.items.flatMap(item => item.productId ? [item.productId] : [])
  const products = await tx.product.findMany({ where: { id: { in: ids }, status: 'ACTIVE' }, select: { id: true, name: true } })
  if (new Set(ids).size !== ids.length || products.length !== ids.length) throw new HttpError(400, 'A requested product is repeated or unavailable.')
  return input.items.map(item => ({ productId: item.productId || null, description: item.description || products.find(product => product.id === item.productId)?.name, quantity: item.quantity, notes: item.notes }))
}
export async function createRFQ(input, req) {
  return inventoryTransaction(async tx => {
    const items = await validatedRFQ(tx, input, req.user), year = new Date().getFullYear()
    const row = await tx.rFQ.create({ data: { rfqNumber: await nextReference(tx, `rfq-${year}`, `RFQ-${year}`), purchaseRequestId: input.purchaseRequestId || null,
      warehouseId: input.warehouseId, createdById: req.user.id, closingDate: input.closingDate, notes: input.notes,
      suppliers: { create: input.supplierIds.map(supplierId => ({ supplierId })) }, items: { create: items } }, include })
    await audit(tx, req, 'CREATED', 'RFQs', 'RFQ', row.id, `Created ${row.rfqNumber}.`, { warehouseId: row.warehouseId })
    return row
  })
}
export async function updateRFQ(id, input, req) {
  return inventoryTransaction(async tx => {
    const row = await rfqRecord(tx, id, req.user); currentVersion(row, input)
    if (row.status !== 'DRAFT') throw new HttpError(409, 'Only draft RFQs can be edited.')
    if ((input.purchaseRequestId || null) !== row.purchaseRequestId) throw new HttpError(400, 'The source request cannot be changed.')
    const items = await validatedRFQ(tx, input, req.user, id)
    await tx.rFQItem.deleteMany({ where: { rfqId: id } }); await tx.rFQSupplier.deleteMany({ where: { rfqId: id } })
    const updated = await tx.rFQ.update({ where: { id }, data: { warehouseId: input.warehouseId, closingDate: input.closingDate, notes: input.notes, updatedAt: nextDocumentVersion(row),
      suppliers: { create: input.supplierIds.map(supplierId => ({ supplierId })) }, items: { create: items } }, include })
    await audit(tx, req, 'UPDATED', 'RFQs', 'RFQ', id, `Updated ${row.rfqNumber}.`, { warehouseId: row.warehouseId, relatedWarehouseId: input.warehouseId,before:row,after:updated })
    return updated
  })
}
export async function transitionRFQ(id, action, input, req) {
  return inventoryTransaction(async tx => {
    const row = await rfqRecord(tx, id, req.user); currentVersion(row, input)
    const steps = { issue: { from: ['DRAFT'], to: 'ISSUED' }, close: { from: ['ISSUED'], to: 'CLOSED' }, cancel: { from: ['DRAFT','ISSUED','CLOSED','AWARDED'], to: 'CANCELLED' } }, step = steps[action]
    if (!step || !step.from.includes(row.status)) throw new HttpError(409, 'This RFQ cannot perform that action.')
    if (row.quotations.some(quote => quote.purchaseOrder)) throw new HttpError(409, 'An RFQ linked to a purchase order cannot be cancelled.')
    if (action === 'issue') {
      if (!row.items.length || !row.suppliers.length || (row.closingDate && row.closingDate <= new Date())) throw new HttpError(400, 'Review requested items, invited suppliers and closing date before issuing.')
      if (row.purchaseRequestId && (await requestRecord(tx, row.purchaseRequestId, req.user)).status !== 'APPROVED') throw new HttpError(409, 'The source request is no longer approved.')
      if (await tx.supplier.count({ where: { id: { in: row.suppliers.map(item => item.supplierId) }, status: 'ACTIVE' } }) !== row.suppliers.length) throw new HttpError(400, 'An invited supplier is inactive.')
      await tx.rFQSupplier.updateMany({ where: { rfqId: id }, data: { invitedAt: new Date() } })
    }
    if (action === 'cancel') for (const quote of row.quotations) {
      await tx.supplierQuotation.update({ where: { id: quote.id }, data: { status: 'CANCELLED', updatedAt: nextDocumentVersion(quote) } })
    }
    const changed = await tx.rFQ.updateMany({ where: { id, status: row.status }, data: { status: step.to, updatedAt: nextDocumentVersion(row),
      ...(action === 'issue' ? { issuedAt: new Date() } : {}), ...(action === 'close' ? { closedAt: new Date() } : {}) } })
    if (changed.count !== 1) throw new HttpError(409, 'RFQ changed concurrently.')
    await audit(tx, req, action.toUpperCase(), 'RFQs', 'RFQ', id, `${action} ${row.rfqNumber}.`, { warehouseId: row.warehouseId,before:row,after:await tx.rFQ.findUnique({where:{id}}) })
    return rfqRecord(tx, id, req.user)
  })
}
export async function compareRFQ(id, user) {
  const rfq = await getRFQ(id, user)
  const quotations = await prisma.supplierQuotation.findMany({ where: { rfqId: id, status: { in: ['SUBMITTED','ACCEPTED','CONVERTED'] } }, include: { supplier: { select: { id: true, companyName: true } }, items: true, purchaseOrder: { select: { id: true, poNumber: true } } }, orderBy: { quotationNumber: 'asc' } })
  return { rfq, quotations }
}
export async function awardRFQ(id, input, req) {
  return inventoryTransaction(async tx => {
    const row = await rfqRecord(tx, id, req.user); currentVersion(row, input)
    if (row.status !== 'CLOSED') throw new HttpError(409, 'Close the RFQ before manually selecting a quotation.')
    const quote = await tx.supplierQuotation.findUnique({ where: { id: input.quotationId }, include: { items: true, supplier: true } })
    if (!quote || quote.rfqId !== id || quote.status !== 'SUBMITTED' || quote.supplier.status !== 'ACTIVE') throw new HttpError(400, 'Choose a submitted quotation from an active invited supplier.')
    if (quote.validUntil && quote.validUntil <= new Date()) throw new HttpError(409, 'The quotation has expired. Obtain a current quotation before awarding.')
    if (quote.items.length !== row.items.length || row.items.some(item => !quote.items.some(line => line.rfqItemId === item.id && line.quantity === item.quantity))) throw new HttpError(409, 'Quotation lines do not match the requested items.')
    if (!input.notes?.trim()) throw new HttpError(400, 'Explain the manual selection.')
    await tx.supplierQuotation.update({ where: { id: quote.id }, data: { status: 'ACCEPTED', updatedAt: nextDocumentVersion(quote) } })
    const changed = await tx.rFQ.updateMany({ where: { id, status: 'CLOSED', selectedQuotationId: null }, data: { status: 'AWARDED', selectedQuotationId: quote.id, selectedById: req.user.id, selectedAt: new Date(), selectionNotes: input.notes, updatedAt: nextDocumentVersion(row) } })
    if (changed.count !== 1) throw new HttpError(409, 'RFQ changed concurrently.')
    await audit(tx, req, 'AWARDED', 'RFQs', 'RFQ', id, `Manually selected ${quote.quotationNumber} for ${row.rfqNumber}. ${input.notes}`, { warehouseId: row.warehouseId,before:row,after:await tx.rFQ.findUnique({where:{id}}) })
    return rfqRecord(tx, id, req.user)
  })
}
