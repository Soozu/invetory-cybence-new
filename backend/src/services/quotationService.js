import { prisma } from '../config/prisma.js'
import { inventoryTransaction } from './inventoryService.js'
import { createOrderInTransaction } from './procurementService.js'
import { requestRecord } from './purchaseRequestService.js'
import { rfqRecord, currentVersion, quotationsOpen } from './rfqService.js'
import { currencyTotals } from '../utils/currency.js'
import { nextReference } from '../utils/references.js'
import { HttpError } from '../utils/http.js'
import { audit } from '../utils/audit.js'

const include = { supplier: { select: { id: true, companyName: true, supplierCode: true } }, items: { include: { rfqItem: { include: { product: { select: { id: true, name: true, sku: true } } } } } }, purchaseOrder: { select: { id: true, poNumber: true, status: true } } }
async function quotationRecord(tx, rfqId, id, user) {
  const rfq = await rfqRecord(tx, rfqId, user), row = await tx.supplierQuotation.findUnique({ where: { id }, include })
  if (!row || row.rfqId !== rfqId) throw new HttpError(404, 'Quotation not found in this RFQ.')
  return { row, rfq }
}
export async function getQuotation(rfqId, id, user) { return (await quotationRecord(prisma, rfqId, id, user)).row }
async function quotationValues(tx, rfq, input) {
  quotationsOpen(rfq)
  if (!rfq.suppliers.some(invitation => invitation.supplierId === input.supplierId) || (await tx.supplier.findUnique({ where: { id: input.supplierId } }))?.status !== 'ACTIVE') throw new HttpError(400, 'The supplier must be active and invited to this RFQ.')
  if (input.items.length !== rfq.items.length || new Set(input.items.map(item => item.rfqItemId)).size !== input.items.length) throw new HttpError(400, 'Quote every requested item exactly once.')
  const { lines, ...totals } = currencyTotals(input.items.map(line => {
    const item = rfq.items.find(item => item.id === line.rfqItemId)
    if (!item) throw new HttpError(400, 'Quotation line does not belong to this RFQ.')
    return { rfqItemId: item.id, description: item.description, quantity: item.quantity, unitPrice: line.unitPrice, brandOffered: line.brandOffered, modelOffered: line.modelOffered, notes: line.notes }
  }), input.tax, input.shipping)
  if (input.validUntil && new Date(input.validUntil) < new Date(input.quotationDate)) throw new HttpError(400, 'Validity cannot end before the quotation date.')
  return { supplierReference: input.supplierReference, quotationDate: input.quotationDate, validUntil: input.validUntil, deliveryDays: input.deliveryDays,
    paymentTerms: input.paymentTerms, notes: input.notes, ...totals, items: { create: lines } }
}
export async function createQuotation(rfqId, input, req) {
  return inventoryTransaction(async tx => {
    const rfq = await rfqRecord(tx, rfqId, req.user), values = await quotationValues(tx, rfq, input), year = new Date().getFullYear()
    if (await tx.supplierQuotation.count({ where: { rfqId, supplierId: input.supplierId } })) throw new HttpError(409, 'A quotation already exists for this supplier. Edit its draft or start a new RFQ round.')
    const row = await tx.supplierQuotation.create({ data: { ...values, rfqId, supplierId: input.supplierId, quotationNumber: await nextReference(tx, `quotation-${year}`, `QTN-${year}`) }, include })
    await tx.rFQ.update({ where: { id: rfqId }, data: { updatedAt: new Date() } })
    await audit(tx, req, 'CREATED', 'Quotations', 'SupplierQuotation', row.id, `Recorded draft ${row.quotationNumber} for ${rfq.rfqNumber}.`, { warehouseId: rfq.warehouseId })
    return row
  })
}
export async function updateQuotation(rfqId, id, input, req) {
  return inventoryTransaction(async tx => {
    const { row, rfq } = await quotationRecord(tx, rfqId, id, req.user); currentVersion(row, input)
    if (row.status !== 'DRAFT') throw new HttpError(409, 'Only draft quotations can be edited.')
    if (input.supplierId !== row.supplierId) throw new HttpError(400, 'The quotation supplier cannot be changed.')
    const values = await quotationValues(tx, rfq, input)
    await tx.supplierQuotationItem.deleteMany({ where: { quotationId: id } })
    const updated = await tx.supplierQuotation.update({ where: { id }, data: values, include })
    await tx.rFQ.update({ where: { id: rfqId }, data: { updatedAt: new Date() } })
    await audit(tx, req, 'UPDATED', 'Quotations', 'SupplierQuotation', id, `Updated draft ${row.quotationNumber}.`, { warehouseId: rfq.warehouseId })
    return updated
  })
}
export async function transitionQuotation(rfqId, id, action, input, req) {
  return inventoryTransaction(async tx => {
    const { row, rfq } = await quotationRecord(tx, rfqId, id, req.user); currentVersion(row, input); quotationsOpen(rfq)
    if (row.status !== 'DRAFT' || !['submit','cancel'].includes(action)) throw new HttpError(409, 'This quotation cannot perform that action.')
    if (action === 'submit' && row.validUntil && row.validUntil <= new Date()) throw new HttpError(409, 'An expired quotation cannot be submitted.')
    const changed = await tx.supplierQuotation.updateMany({ where: { id, status: 'DRAFT' }, data: { status: action === 'submit' ? 'SUBMITTED' : 'CANCELLED', ...(action === 'submit' ? { submittedAt: new Date() } : {}) } })
    if (changed.count !== 1) throw new HttpError(409, 'Quotation changed concurrently.')
    if (action === 'submit') await tx.rFQSupplier.update({ where: { rfqId_supplierId: { rfqId, supplierId: row.supplierId } }, data: { respondedAt: new Date() } })
    await tx.rFQ.update({ where: { id: rfqId }, data: { updatedAt: new Date() } })
    await audit(tx, req, action.toUpperCase(), 'Quotations', 'SupplierQuotation', id, `${action} ${row.quotationNumber}.`, { warehouseId: rfq.warehouseId })
    return tx.supplierQuotation.findUnique({ where: { id }, include })
  })
}
export async function convertQuotation(rfqId, id, input, req) {
  return inventoryTransaction(async tx => {
    const { row, rfq } = await quotationRecord(tx, rfqId, id, req.user); currentVersion(row, input)
    if (rfq.status !== 'AWARDED' || rfq.selectedQuotationId !== id || row.status !== 'ACCEPTED' || row.purchaseOrderId) throw new HttpError(409, 'Only the awarded, unconverted quotation can create a purchase order.')
    if (row.validUntil && row.validUntil <= new Date()) throw new HttpError(409, 'The awarded quotation has expired. Obtain a current quotation before ordering.')
    if (input.items.length !== row.items.length || new Set(input.items.map(item => item.quotationItemId)).size !== input.items.length || new Set(input.items.map(item => item.productId)).size !== input.items.length) throw new HttpError(400, 'Map every quoted line to a distinct catalog product once.')
    const lines = input.items.map(line => {
      const item = row.items.find(item => item.id === line.quotationItemId)
      if (!item || (item.rfqItem.productId && item.rfqItem.productId !== line.productId)) throw new HttpError(400, 'Preserve requested catalog products and quoted line identities.')
      return { productId: line.productId, quantity: item.quantity, unitCost: Number(item.unitPrice) }
    })
    const request = rfq.purchaseRequestId ? await requestRecord(tx, rfq.purchaseRequestId, req.user) : null
    if (request && (request.status !== 'APPROVED' || request.purchaseOrderId)) throw new HttpError(409, 'The source request is no longer available for conversion.')
    const order = await createOrderInTransaction(tx, { supplierId: row.supplierId, warehouseId: rfq.warehouseId, expectedDelivery: input.expectedDelivery,
      reference: row.quotationNumber, notes: input.notes, tax: Number(row.tax), shipping: Number(row.shipping), items: lines }, req)
    if (!order.total.equals(row.total)) throw new HttpError(409, 'Purchase order totals do not match the awarded quotation.')
    const changed = await tx.supplierQuotation.updateMany({ where: { id, status: 'ACCEPTED', purchaseOrderId: null }, data: { status: 'CONVERTED', purchaseOrderId: order.id, convertedAt: new Date() } })
    if (changed.count !== 1) throw new HttpError(409, 'Quotation changed concurrently.')
    if (request) {
      const converted = await tx.purchaseRequest.updateMany({ where: { id: request.id, status: 'APPROVED', purchaseOrderId: null }, data: { status: 'CONVERTED', purchaseOrderId: order.id, convertedAt: new Date() } })
      if (converted.count !== 1) throw new HttpError(409, 'Purchase request changed concurrently.')
      await audit(tx, req, 'CONVERTED', 'Purchase Requests', 'PurchaseRequest', request.id, `Converted ${request.prNumber} through ${rfq.rfqNumber} and ${row.quotationNumber} to draft ${order.poNumber}.`, { warehouseId: rfq.warehouseId })
    }
    await tx.rFQ.update({ where: { id: rfqId }, data: { updatedAt: new Date() } })
    await audit(tx, req, 'CONVERTED', 'Quotations', 'SupplierQuotation', id, `Converted awarded ${row.quotationNumber} to draft ${order.poNumber}.`, { warehouseId: rfq.warehouseId })
    return { quotation: await tx.supplierQuotation.findUnique({ where: { id }, include }), purchaseOrder: order }
  })
}
