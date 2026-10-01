import { parse } from 'csv-parse/sync'
import { HttpError } from '../utils/http.js'

export const importTypes = {
  Products: { module: 'products', action: 'CREATE', fields: ['sku','name','categorySlug','brandSlug','purchaseCost','supplierCode','barcode','model','description','unit','minimumStock','maximumStock','reorderPoint','warrantyMonths','trackSerialNumbers'], required: ['sku','name','categorySlug','brandSlug','purchaseCost'], scoped: false },
  Suppliers: { module: 'suppliers', action: 'CREATE', fields: ['supplierCode','companyName','contactPerson','email','phone','address','taxId','paymentTerms','notes'], required: ['supplierCode','companyName'], scoped: false },
  OpeningStock: { module: 'inventory', action: 'EDIT', fields: ['sku','warehouseCode','quantity','serialNumbers','notes'], required: ['sku','warehouseCode','quantity'], scoped: true },
  SerialNumbers: { module: 'inventory', action: 'EDIT', fields: ['sku','warehouseCode','serialNumber','notes'], required: ['sku','warehouseCode','serialNumber'], scoped: true },
  Assets: { module: 'assets', action: 'CREATE', fields: ['sku','warehouseCode','serialNumber','purchaseDate','notes'], required: ['sku','warehouseCode'], scoped: true }
}
export const MAX_IMPORT_ROWS = 100
export const MAX_IMPORT_BYTES = 1048576
export function importDefinition(type) {
  if (!Object.hasOwn(importTypes, type)) throw new HttpError(400, 'Unsupported import type.')
  return importTypes[type]
}
export function parseImportCsv(type, file) {
  const definition = importDefinition(type)
  if (!file?.buffer?.length) throw new HttpError(400, 'Choose a UTF-8 CSV file.')
  if (file.buffer.length > MAX_IMPORT_BYTES) throw new HttpError(413, 'CSV files must be at most 1 MB.')
  if (!/^[^/\\\x00-\x1f]{1,180}\.csv$/i.test(file.originalname || '') || !['text/csv','text/plain','application/vnd.ms-excel','application/octet-stream'].includes(file.mimetype)) throw new HttpError(400, 'Only CSV files are supported. Export Excel sheets as UTF-8 CSV.')
  let text, records
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer) } catch { throw new HttpError(400, 'CSV must use UTF-8 encoding.') }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) throw new HttpError(400, 'CSV contains unsupported control characters.')
  try { records = parse(text, { bom: true, skip_empty_lines: true, max_record_size: 32768 }) } catch { throw new HttpError(400, 'Malformed CSV. Check quoting, columns and record size.') }
  const headers = records.shift()?.map(h => h.trim()) || []
  if (!headers.length || new Set(headers).size !== headers.length || headers.some(h => !definition.fields.includes(h)) || definition.required.some(h => !headers.includes(h))) throw new HttpError(400, `Use unique supported headers. Required: ${definition.required.join(', ')}.`)
  if (!records.length || records.length > MAX_IMPORT_ROWS) throw new HttpError(400, `Import between 1 and ${MAX_IMPORT_ROWS} data rows per file.`)
  return records.map((cells, index) => ({ rowNumber: index + 2, values: Object.fromEntries(headers.map((h, i) => [h, cells[i].trim()])) }))
}
// Quoting alone does not neutralize spreadsheet formulas in exported user text.
export function exportCsv(rows) {
  return '\ufeff' + rows.map(row => row.map(value => {
    const text = String(value ?? ''), safe = /^[\s]*[=+@\-]/.test(text) || /^[\t\r\n]/.test(text) ? "'" + text : text
    return '"' + safe.replaceAll('"', '""') + '"'
  }).join(',')).join('\r\n') + '\r\n'
}
