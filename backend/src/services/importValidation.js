import crypto from 'node:crypto'
import { productSchema, supplierSchema } from '../validators/catalog.js'
import { assetSchema } from '../validators/assets.js'
import { HttpError } from '../utils/http.js'
import { importDefinition } from './importCsv.js'

const integer = (value, field, fallback = 0) => {
  if (value === '' || value == null) return fallback
  if (!/^\d{1,7}$/.test(value) || Number(value) > 1000000) throw new HttpError(400, `${field} must be a whole number between 0 and 1000000.`)
  return Number(value)
}
const textData = (values, fields) => Object.fromEntries(fields.filter(k => values[k]).map(k => [k, values[k]]))
const collation = new Intl.Collator('en',{sensitivity:'base'})
const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])) : value
// MySQL JSON storage can reorder object keys; snapshots compare values canonically.
export const importHash = value => crypto.createHash('sha256').update(JSON.stringify(sorted(JSON.parse(JSON.stringify(value))))).digest('hex')
const messages = error => error.errors?.length ? error.errors.map(e => `${e.path.join('.')}: ${e.message}`) : [error.message]

export async function validateImportRows(tx, type, rows, warehouseId) {
  const definition = importDefinition(type), output = [], seen = new Map(), allocations = new Map()
  const warehouse = definition.scoped ? await tx.warehouse.findUnique({ where: { id: warehouseId || '' } }) : null
  if (definition.scoped && warehouse?.status !== 'ACTIVE') throw new HttpError(409, 'Choose an active warehouse.')
  const unique = (kind, value) => { const prior = seen.get(kind) || []; if (prior.some(p=>collation.compare(p,value)===0)) throw new HttpError(400, `Duplicate ${kind} in this file: ${value}.`); prior.push(value); seen.set(kind,prior) }
  const reference = async (model, field, value, label) => {
    const row = value ? await tx[model].findUnique({ where: { [field]: value } }) : null
    if (row?.status !== 'ACTIVE') throw new HttpError(400, `${label} is missing or inactive.`)
    return row
  }
  for (const row of rows) {
    const v = row.values, context = { warehouse }, errors = []; let data = null
    try {
      for (const field of definition.required) if (!v[field]) throw new HttpError(400, `${field} is required.`)
      if (Object.values(v).some(value => value.length > 4000)) throw new HttpError(400, 'Cell text exceeds 4000 characters.')
      if (type === 'Products') {
        if (v.name.length > 191 || integer(v.warrantyMonths,'warrantyMonths') > 1200) throw new HttpError(400,'Product name is limited to 191 characters and warrantyMonths to 1200.')
        unique('SKU', v.sku)
        if (await tx.product.count({ where: { sku: v.sku } })) throw new HttpError(400, 'SKU already exists.')
        if (v.barcode) { unique('barcode', v.barcode); if (v.barcode.length > 191 || await tx.product.count({ where: { barcode: v.barcode } })) throw new HttpError(400, 'Barcode is too long or already exists.') }
        if (v.model?.length > 191) throw new HttpError(400, 'model must contain at most 191 characters.')
        context.category = await reference('category','slug',v.categorySlug,'Category slug')
        context.brand = await reference('brand','slug',v.brandSlug,'Brand slug')
        context.supplier = v.supplierCode ? await reference('supplier','supplierCode',v.supplierCode,'Supplier code') : null
        if (!/^\d{1,12}(\.\d{1,2})?$/.test(v.purchaseCost)) throw new HttpError(400, 'purchaseCost must be nonnegative with at most two decimal places.')
        if (v.trackSerialNumbers && !['true','false'].includes(v.trackSerialNumbers)) throw new HttpError(400, 'trackSerialNumbers must be true or false.')
        data = productSchema.parse({ ...textData(v,['sku','name','barcode','model','description','unit']), categoryId: context.category.id, brandId: context.brand.id, defaultSupplierId: context.supplier?.id || null, purchaseCost: v.purchaseCost, minimumStock: integer(v.minimumStock,'minimumStock'), maximumStock: integer(v.maximumStock,'maximumStock'), reorderPoint: integer(v.reorderPoint,'reorderPoint'), warrantyMonths: integer(v.warrantyMonths,'warrantyMonths'), trackSerialNumbers: v.trackSerialNumbers === 'true' })
      } else if (type === 'Suppliers') {
        if (v.companyName.length > 191) throw new HttpError(400,'companyName must contain at most 191 characters.')
        unique('supplier code', v.supplierCode)
        unique('supplier company name', v.companyName)
        if (await tx.supplier.count({ where: { supplierCode: v.supplierCode } })) throw new HttpError(400, 'Supplier code already exists.')
        if (await tx.supplier.count({ where: { companyName: v.companyName } })) throw new HttpError(400, 'Supplier company name already exists.')
        for (const field of ['contactPerson','email','phone','address','taxId','paymentTerms']) if (v[field]?.length > 191) throw new HttpError(400, `${field} must contain at most 191 characters.`)
        data = supplierSchema.parse(textData(v,definition.fields))
      } else {
        if (v.warehouseCode !== warehouse.code) throw new HttpError(400, 'warehouseCode must match the selected warehouse.')
        context.product = await reference('product','sku',v.sku,'SKU')
        const product = context.product
        context.stock = await tx.warehouseStock.findUnique({ where: { productId_warehouseId: { productId: product.id, warehouseId } } })
        if (type === 'OpeningStock') {
          unique('opening stock SKU', v.sku)
          if ((context.stock?.quantity || 0) !== 0 || (context.stock?.reservedQuantity || 0) !== 0 || await tx.stockMovement.count({ where: { productId: product.id, warehouseId } }) || await tx.serialNumber.count({ where: { productId: product.id, warehouseId } })) throw new HttpError(400, 'Opening stock requires no existing balance, serials or movement history. Use stock adjustments for established stock.')
          const quantity = integer(v.quantity,'quantity'), serials = v.serialNumbers ? v.serialNumbers.split(';').map(s => s.trim()) : []
          if (!quantity) throw new HttpError(400, 'quantity must be greater than zero.')
          if (product.trackSerialNumbers && quantity > 100) throw new HttpError(400, 'Import at most 100 serialized units per opening-stock row.')
          if (product.trackSerialNumbers ? serials.length !== quantity : serials.length > 0) throw new HttpError(400, 'Supply one semicolon-separated serial per serialized unit; leave empty for other products.')
          for (const serial of serials) { if (!serial || serial.length > 191) throw new HttpError(400, 'Serial must contain 1–191 characters.'); unique('serial number',serial) }
          if (serials.length && await tx.serialNumber.count({ where: { serialNumber: { in: serials } } })) throw new HttpError(400, 'Serial number already exists.')
          data = { productId: product.id, warehouseId, quantity, serialNumbers: serials, type: 'OPENING_STOCK', notes: v.notes || undefined }
        } else if (type === 'SerialNumbers') {
          unique('serial number',v.serialNumber)
          if (!product.trackSerialNumbers || v.serialNumber.length > 191 || await tx.serialNumber.count({ where: { serialNumber: v.serialNumber } })) throw new HttpError(400, 'Serial needs a serialized product, at most 191 characters and a unique number.')
          context.serialCount = await tx.serialNumber.count({ where: { productId: product.id, warehouseId } })
          const used = allocations.get(product.id) || 0, stock = context.stock
          if (!stock || stock.reservedQuantity || stock.quantity - context.serialCount <= used) throw new HttpError(400, 'Serial backfill requires an unreserved existing unit without a registered serial.')
          allocations.set(product.id,used + 1)
          data = { productId: product.id, warehouseId, serialNumber: v.serialNumber }
        } else {
          if (v.serialNumber) {
            unique('asset serial number',v.serialNumber)
            context.serial = await tx.serialNumber.findFirst({ where: { serialNumber: v.serialNumber, productId: product.id, warehouseId, status: 'AVAILABLE', asset: null, maintenanceRecords: { none: { status: { in: ['SCHEDULED','IN_REPAIR'] } } }, reservationSelections: { none: { fulfilledAt: null, item: { reservation: { status: 'ACTIVE' } } } } } })
            if (!context.serial || await tx.warrantyClaim.count({ where: { activeSerialId: context.serial.id } })) throw new HttpError(400, 'Serial is unavailable, held, under maintenance or has an active claim.')
          }
          if (product.trackSerialNumbers !== Boolean(v.serialNumber)) throw new HttpError(400, 'Serialized assets require an available serial; other assets must leave serialNumber empty.')
          const used = allocations.get(product.id) || 0, stock = context.stock
          if (!stock || stock.quantity - stock.reservedQuantity <= used) throw new HttpError(400, 'Insufficient available warehouse units for these assets.')
          if (v.purchaseDate && (!/^\d{4}-\d{2}-\d{2}$/.test(v.purchaseDate) || !Number.isFinite(Date.parse(v.purchaseDate)) || new Date(v.purchaseDate).toISOString().slice(0,10) !== v.purchaseDate)) throw new HttpError(400, 'purchaseDate must be a valid YYYY-MM-DD date.')
          data = assetSchema.parse({ productId: product.id, warehouseId, serialNumberId: context.serial?.id || null, ...(v.purchaseDate ? { purchaseDate: v.purchaseDate } : {}), notes: v.notes || null })
          allocations.set(product.id,used + 1)
        }
      }
    } catch (error) {
      if (!(error instanceof HttpError) && !error.errors) throw error
      errors.push(...messages(error)); data = null
    }
    output.push({ ...row, data: data ? JSON.parse(JSON.stringify(data)) : null, errors, fingerprint: importHash(context) })
  }
  return output
}
