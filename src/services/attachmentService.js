import { apiRequest } from '../lib/api.js'
export const attachmentTypes = [
  ['Product', 'Products', 'products'], ['Supplier', 'Suppliers', 'suppliers'],
  ['PurchaseRequest', 'Purchase requests', 'purchase_requests'], ['RFQ', 'RFQs', 'rfqs'], ['SupplierQuotation', 'Quotations', 'rfqs'],
  ['PurchaseOrder', 'Purchase orders', 'purchasing'], ['PurchaseReceipt', 'Receipts', 'purchasing'], ['SupplierReturn', 'Supplier returns', 'supplier_returns'],
  ['StockTransfer', 'Transfers', 'inventory'], ['Asset', 'Assets', 'assets'], ['MaintenanceRecord', 'Maintenance', 'assets'], ['WarrantyClaim', 'Warranty claims', 'warranty_claims']
]
const target = (type, id) => `/attachments/${encodeURIComponent(type)}/${encodeURIComponent(id)}`
export const getAttachments = (type, id, params) => apiRequest(target(type, id), { params })
export const searchAttachmentSources = (type, params) => apiRequest(`/attachments/sources/${encodeURIComponent(type)}`, { params })
export const uploadAttachment = (type, id, file, requestKey) => { const body = new FormData(); body.append('file', file); body.append('requestKey', requestKey); return apiRequest(target(type, id), { method: 'POST', body }) }
export const changeAttachment = (id, action, body) => apiRequest(`/attachments/files/${encodeURIComponent(id)}/${action}`, { method: 'POST', body })
export async function downloadAttachment(row) {
  const blob = await apiRequest(`/attachments/files/${encodeURIComponent(row.id)}`, { responseType: 'blob' }), url = URL.createObjectURL(blob), link = document.createElement('a')
  link.href = url; link.download = row.fileName; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
