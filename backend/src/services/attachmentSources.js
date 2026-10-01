import { HttpError } from '../utils/http.js'
import { requireWarehouseAccess, requireTransferAccess, warehouseWhere, transferWhere } from './warehouseAccessService.js'
import { permit } from './assetWorkflowRules.js'

export const attachmentSources = {
  Product: { model: 'product', module: 'products', label: 'name', search: ['name', 'sku'], global: true },
  Supplier: { model: 'supplier', module: 'suppliers', label: 'companyName', search: ['companyName', 'supplierCode'], global: true },
  PurchaseRequest: { model: 'purchaseRequest', module: 'purchase_requests', label: 'prNumber' },
  RFQ: { model: 'rFQ', module: 'rfqs', label: 'rfqNumber' },
  SupplierQuotation: { model: 'supplierQuotation', module: 'rfqs', label: 'quotationNumber', include: { rfq: true } },
  PurchaseOrder: { model: 'purchaseOrder', module: 'purchasing', label: 'poNumber' },
  PurchaseReceipt: { model: 'purchaseReceipt', module: 'purchasing', label: 'receiptNumber' },
  SupplierReturn: { model: 'supplierReturn', module: 'supplier_returns', label: 'returnNumber' },
  StockTransfer: { model: 'stockTransfer', module: 'inventory', label: 'transferNumber' },
  Asset: { model: 'asset', module: 'assets', label: 'assetTag' },
  MaintenanceRecord: { model: 'maintenanceRecord', module: 'assets', label: 'issue', include: { asset: true } },
  WarrantyClaim: { model: 'warrantyClaim', module: 'warranty_claims', label: 'claimNumber' }
}
export function descriptor(type) {
  const entry = Object.hasOwn(attachmentSources, type) && attachmentSources[type]
  if (!entry) throw new HttpError(400, 'Unsupported attachment record type.')
  return entry
}
export async function attachmentParent(tx, type, id, user, write = false) {
  const entry = descriptor(type); permit(user, 'VIEW', entry.module)
  if (write) permit(user, 'EDIT', entry.module)
  const row = await tx[entry.model].findUnique({ where: { id }, ...(entry.include ? { include: entry.include } : {}) })
  if (!row) throw new HttpError(404, 'Attachment record not found.')
  const owner = row.rfq || row
  let warehouseId = owner.warehouseId || null, relatedWarehouseId = null
  if (type === 'StockTransfer') {
    requireTransferAccess(user, row); warehouseId = row.sourceWarehouseId; relatedWarehouseId = row.destinationWarehouseId
  } else if (!entry.global) {
    // Unknown closed legacy service ownership is not inferred from a later asset move.
    if (type === 'MaintenanceRecord' && !warehouseId && ['SCHEDULED', 'IN_REPAIR'].includes(row.status)) warehouseId = row.asset.warehouseId
    requireWarehouseAccess(user, warehouseId)
  }
  return { label: row[entry.label], warehouseId, relatedWarehouseId, module: entry.module }
}
export async function findAttachmentSources(tx, type, query, user) {
  const entry = descriptor(type); permit(user, 'VIEW', entry.module)
  let where = entry.global ? {} : type === 'StockTransfer' ? transferWhere(user) : type === 'SupplierQuotation' ? { rfq: warehouseWhere(user) } : warehouseWhere(user)
  if (type === 'MaintenanceRecord' && user.role !== 'Administrator') where = { OR: [warehouseWhere(user), { warehouseId: null, status: { in: ['SCHEDULED', 'IN_REPAIR'] }, asset: warehouseWhere(user) }] }
  if (query.search) where = { AND: [where, { OR: (entry.search || [entry.label]).map(field => ({ [field]: { contains: query.search } })) }] }
  const page = Number(query.page), limit = 20
  const [rows, total] = await Promise.all([tx[entry.model].findMany({ where, orderBy: { id: 'asc' }, skip: (page - 1) * limit, take: limit, select: { id: true, [entry.label]: true } }), tx[entry.model].count({ where })])
  return { data: rows.map(row => ({ entityType: type, entityId: row.id, label: row[entry.label] })), pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } }
}
