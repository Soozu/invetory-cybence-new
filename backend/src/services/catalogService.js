import { warehouseWhere, requireWarehouseAccess, requireWarehouseAdministration } from './warehouseAccessService.js'
import { prisma } from '../config/prisma.js'
import { inventoryTransaction } from './inventoryService.js'
import { paginate } from '../utils/query.js'
import { audit } from '../utils/audit.js'
import { HttpError } from '../utils/http.js'
import { nextReference } from '../utils/references.js'
import { stockAlerts } from './monitoringService.js'

const config = {
  categories: { model: 'category', search: ['name', 'slug'], sort: ['name', 'createdAt', 'status'], relation: 'products' },
  brands: { model: 'brand', search: ['name', 'slug'], sort: ['name', 'createdAt', 'status'], relation: 'products' },
  suppliers: { model: 'supplier', search: ['companyName', 'supplierCode', 'email'], sort: ['companyName', 'createdAt', 'status'], relation: 'products' },
  warehouses: { model: 'warehouse', search: ['name', 'code', 'address'], sort: ['name', 'createdAt', 'status'], relation: 'stock' }
}

const slugify = value => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const searchWhere = (fields, search) => search ? { OR: fields.map(field => ({ [field]: { contains: search } })) } : {}

export async function listCatalog(kind, query, user) {
  const item = config[kind]
  const where = { ...searchWhere(item.search, query.search), ...(kind === 'warehouses' ? warehouseWhere(user, undefined, 'id') : {}) }
  if (query.status) where.status = query.status
  if (kind === 'categories' && query.parentId) where.parentId = query.parentId
  return paginate(prisma[item.model], { where, query, allowedSort: item.sort, defaultSort: 'name' })
}

export async function getCatalog(kind, id, user) {
  if (kind === 'warehouses') requireWarehouseAccess(user, id)
  const item = config[kind]
  const record = await prisma[item.model].findUnique({ where: { id } })
  if (!record) throw new HttpError(404, `${kind.slice(0, -1)} not found.`)
  return record
}

async function assertCategoryParent(tx, id, parentId) {
  let current = parentId
  while (current) {
    if (current === id) throw new HttpError(400, 'A category cannot be its own ancestor.')
    const parent = await tx.category.findUnique({ where: { id: current }, select: { parentId: true } })
    if (!parent) throw new HttpError(400, 'Parent category not found.')
    current = parent.parentId
  }
}

export async function createCatalog(kind, input, req) {
  if (kind === 'warehouses') requireWarehouseAdministration(req.user)
  const item = config[kind]
  return inventoryTransaction(async tx => {
    const data = { ...input }
    if (kind === 'categories' || kind === 'brands') data.slug ||= slugify(data.name)
    if (kind === 'suppliers') data.supplierCode ||= await nextReference(tx, 'supplier', 'SUP', 5)
    if (kind === 'warehouses') data.code ||= await nextReference(tx, 'warehouse', 'WH', 3)
    if (kind === 'categories' && data.parentId) await assertCategoryParent(tx, null, data.parentId)
    const record = await tx[item.model].create({ data })
    await audit(tx, req, 'CREATED', kind, item.model, record.id, `Created ${kind.slice(0, -1)} ${data.name || data.companyName}.`)
    return record
  })
}

export async function updateCatalog(kind, id, input, req) {
  if (kind === 'warehouses') requireWarehouseAccess(req.user, id)
  const item = config[kind]
  return inventoryTransaction(async tx => {
    const existing = await tx[item.model].findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Record not found.')
    const data = { ...input }
    if ((kind === 'categories' || kind === 'brands') && data.name && !data.slug) data.slug = slugify(data.name)
    if (kind === 'categories' && data.parentId) await assertCategoryParent(tx, id, data.parentId)
    const record = await tx[item.model].update({ where: { id }, data })
    await audit(tx, req, 'UPDATED', kind, item.model, id, `Updated ${kind.slice(0, -1)}.`)
    return record
  })
}

export async function deleteCatalog(kind, id, req) {
  if (kind === 'warehouses') requireWarehouseAccess(req.user, id)
  const item = config[kind]
  return inventoryTransaction(async tx => {
    const existing = await tx[item.model].findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Record not found.')
    const used = await tx[item.model].findUnique({ where: { id }, include: { _count: { select: { [item.relation]: true } } } })
    if (used._count[item.relation]) throw new HttpError(409, 'This record is in use and cannot be deleted.')
    if (kind === 'categories' && await tx.category.count({ where: { parentId: id } })) throw new HttpError(409, 'Move child categories before deleting this category.')
    if (kind === 'suppliers' && await tx.purchaseOrder.count({ where: { supplierId: id } })) throw new HttpError(409, 'This supplier has purchase history and cannot be deleted.')
    if (kind === 'warehouses' && (
      await tx.purchaseOrder.count({ where: { warehouseId: id } }) ||
      await tx.stockMovement.count({ where: { warehouseId: id } }) ||
      await tx.stockTransfer.count({ where: { OR: [{ sourceWarehouseId: id }, { destinationWarehouseId: id }] } })
    )) throw new HttpError(409, 'This warehouse has inventory history and cannot be deleted.')
    await tx[item.model].delete({ where: { id } })
    await audit(tx, req, 'DELETED', kind, item.model, id, `Deleted ${kind.slice(0, -1)}.`)
    return { id }
  })
}

const productInclude = {
  category: true, brand: true, defaultSupplier: true,
  stocks: { include: { warehouse: true } }
}
export async function listProducts(query, user) {
  const where = { ...searchWhere(['name', 'sku', 'model', 'barcode'], query.search) }
  if (query.category) where.categoryId = query.category
  if (query.brand) where.brandId = query.brand
  if (query.supplier) where.defaultSupplierId = query.supplier
  if (query.status) where.status = query.status
  if (query.warehouse) where.stocks = { some: warehouseWhere(user, query.warehouse) }
  if (['OUT_OF_STOCK', 'LOW_STOCK'].includes(query.stockStatus)) {
    const matching = await stockAlerts(query.stockStatus === 'OUT_OF_STOCK' ? 'out' : 'low', user, query.warehouse)
    where.id = { in: matching.map(product => product.id) }
  }
  const result = await paginate(prisma.product, {
    where, include: { ...productInclude, stocks: { ...productInclude.stocks, where: warehouseWhere(user, query.warehouse) } }, query,
    allowedSort: ['name', 'sku', 'createdAt', 'purchaseCost', 'status'], defaultSort: 'createdAt'
  })
  result.data = result.data.map(productView)
  return result
}

export function productView(product) {
  const quantity = product.stocks?.reduce((sum, stock) => sum + stock.quantity, 0) || 0
  const reservedQuantity = product.stocks?.reduce((sum, stock) => sum + stock.reservedQuantity, 0) || 0
  return { ...product, purchaseCost: Number(product.purchaseCost), quantity, reservedQuantity, availableStock: quantity - reservedQuantity }
}

export async function getProduct(id, user) {
  const product = await prisma.product.findUnique({ where: { id }, include: { ...productInclude, stocks: { ...productInclude.stocks, where: warehouseWhere(user) } } })
  if (!product) throw new HttpError(404, 'Product not found.')
  return productView(product)
}

export async function createProduct(input, req) {
  return inventoryTransaction(async tx => {
    const product = await tx.product.create({ data: { ...input, barcode: input.barcode || null } })
    await audit(tx, req, 'CREATED', 'Products', 'Product', product.id, `Created product ${product.sku}.`)
    return product
  })
}

export async function updateProduct(id, input, req) {
  return inventoryTransaction(async tx => {
    const existing = await tx.product.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Product not found.')
    const minimumStock = input.minimumStock ?? existing.minimumStock
    const maximumStock = input.maximumStock ?? existing.maximumStock
    if (maximumStock > 0 && maximumStock < minimumStock) throw new HttpError(400, 'Maximum stock must be at least minimum stock.', [{ field: 'maximumStock' }])
    const product = await tx.product.update({ where: { id }, data: { ...input, ...(input.barcode === '' ? { barcode: null } : {}) } })
    await audit(tx, req, 'UPDATED', 'Products', 'Product', id, `Updated product ${product.sku}.`)
    return product
  })
}

export async function archiveProduct(id, req) {
  return inventoryTransaction(async tx => {
    const product = await tx.product.update({ where: { id }, data: { status: 'ARCHIVED' } })
    await audit(tx, req, 'ARCHIVED', 'Products', 'Product', id, `Archived product ${product.sku}.`)
    return product
  })
}

export async function deleteProduct(id, req) {
  return inventoryTransaction(async tx => {
    const product = await tx.product.findUnique({ where: { id }, include: { _count: { select: {
      stocks: true, movements: true, serialNumbers: true, purchaseOrderItems: true, assets: true
    } } } })
    if (!product) throw new HttpError(404, 'Product not found.')
    if (Object.values(product._count).some(Boolean)) {
      const archived = await tx.product.update({ where: { id }, data: { status: 'ARCHIVED' } })
      await audit(tx, req, 'ARCHIVED', 'Products', 'Product', id, `Archived product ${product.sku} with history.`)
      return { archived: true, product: archived }
    }
    await tx.product.delete({ where: { id } })
    await audit(tx, req, 'DELETED', 'Products', 'Product', id, `Deleted product ${product.sku}.`)
    return { archived: false, id }
  })
}
