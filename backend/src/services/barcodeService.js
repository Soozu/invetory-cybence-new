import { prisma } from '../config/prisma.js'
import { warehouseWhere, serialWhere, requireWarehouseAccess } from './warehouseAccessService.js'
import { inventoryTransaction } from './inventoryService.js'
import { nextReference } from '../utils/references.js'
import { HttpError } from '../utils/http.js'
import { audit } from '../utils/audit.js'

const permitted = (user, module, action = 'VIEW') => user.role === 'Administrator' || user.permissions.includes(`${module}.${action}`)
const productAccess = user => ['products', 'inventory', 'stock_counts', 'reservations', 'purchasing', 'assets'].some(module => permitted(user, module))
const serialAccess = user => ['inventory', 'stock_counts', 'reservations', 'purchasing', 'assets'].some(module => permitted(user, module))
const permittedType = (user, type) => type === 'product' ? productAccess(user) : type === 'serial' ? serialAccess(user) : permitted(user, type === 'asset' ? 'assets' : 'warehouses')
export async function lookup(input, user) {
  if (input.warehouse) requireWarehouseAccess(user, input.warehouse)
  let code = input.code, type = input.type
  const typed = /^TS:(product|serial|asset|warehouse):(.+)$/.exec(code)
  if (typed) { if (type && type !== typed[1]) throw new HttpError(400, 'Label type does not match the requested lookup.'); type = typed[1]; code = typed[2] }
  const results = []
  if ((!type || type === 'product') && productAccess(user)) {
    const rows = await prisma.product.findMany({ where: { status: { not: 'ARCHIVED' }, OR: [{ sku: code }, { barcode: code }] }, select: { id: true, name: true, sku: true, trackSerialNumbers: true }, take: 5 })
    results.push(...rows.map(row => ({ type: 'product', id: row.id, title: row.name, identifier: row.sku, productId: row.id, trackSerialNumbers: row.trackSerialNumbers, route: permitted(user, 'products') ? `/products/${row.id}` : null })))
  }
  if ((!type || type === 'serial') && serialAccess(user)) {
    const row = await prisma.serialNumber.findFirst({ where: { AND: [{ serialNumber: code }, serialWhere(user), ...(input.warehouse ? [{ warehouseId: input.warehouse }] : [])] }, select: { id: true, serialNumber: true, productId: true, warehouseId: true, status: true, product: { select: { name: true, sku: true } } } })
    if (row) results.push({ type: 'serial', id: row.id, title: row.product.name, identifier: row.serialNumber, productId: row.productId, sku: row.product.sku, warehouseId: row.warehouseId, status: row.status, route: permitted(user, 'inventory') ? `/serial-numbers/${row.id}` : null })
  }
  if ((!type || type === 'asset') && permitted(user, 'assets')) {
    const row = await prisma.asset.findFirst({ where: { assetTag: code, ...warehouseWhere(user, input.warehouse) }, select: { id: true, assetTag: true, warehouseId: true, product: { select: { name: true } } } })
    if (row) results.push({ type: 'asset', id: row.id, title: row.product.name, identifier: row.assetTag, warehouseId: row.warehouseId, route: `/assets?search=${encodeURIComponent(row.assetTag)}` })
  }
  if ((!type || type === 'warehouse') && permitted(user, 'warehouses')) {
    const row = await prisma.warehouse.findFirst({ where: { code, ...warehouseWhere(user, input.warehouse, 'id') }, select: { id: true, name: true, code: true } })
    if (row) results.push({ type: 'warehouse', id: row.id, title: row.name, identifier: row.code, route: `/warehouses/${row.id}` })
  }
  return results
}

export async function labelData(type, id, user) {
  if (!permittedType(user, type)) throw new HttpError(403, 'You do not have permission for this label type.')
  if (type === 'product') {
    const product = await prisma.product.findUnique({ where: { id }, select: { id: true, name: true, sku: true, barcode: true, status: true } })
    if (!product || product.status === 'ARCHIVED') throw new HttpError(404, 'Product not found.')
    return { type, title: product.name, sku: product.sku, identifier: product.barcode || product.sku, qrValue: `TS:product:${product.sku}` }
  }
  if (type === 'serial') {
    const row = await prisma.serialNumber.findFirst({ where: { AND: [{ id }, serialWhere(user)] }, select: { serialNumber: true, product: { select: { name: true, sku: true } } } })
    if (!row) throw new HttpError(404, 'Serial number not found or unavailable.')
    return { type, title: row.product.name, sku: row.product.sku, identifier: row.serialNumber, serialNumber: row.serialNumber, qrValue: `TS:serial:${row.serialNumber}` }
  }
  if (type === 'asset') {
    const row = await prisma.asset.findFirst({ where: { id, ...warehouseWhere(user) }, select: { assetTag: true, product: { select: { name: true, sku: true } }, serialNumber: { select: { serialNumber: true } } } })
    if (!row) throw new HttpError(404, 'Asset not found or unavailable.')
    return { type, title: row.product.name, sku: row.product.sku, identifier: row.assetTag, assetTag: row.assetTag, serialNumber: row.serialNumber?.serialNumber, qrValue: `TS:asset:${row.assetTag}` }
  }
  const row = await prisma.warehouse.findFirst({ where: { id, ...warehouseWhere(user, undefined, 'id') }, select: { name: true, code: true } })
  if (!row) throw new HttpError(404, 'Warehouse not found or unavailable.')
  return { type, title: row.name, identifier: row.code, qrValue: `TS:warehouse:${row.code}` }
}

export async function generateProductBarcode(id, req) {
  return inventoryTransaction(async tx => {
    // Serialize allocation for this product before reading its current barcode.
    await tx.$queryRaw`SELECT id FROM Product WHERE id = ${id} FOR UPDATE`
    const product = await tx.product.findUnique({ where: { id } })
    if (!product || product.status === 'ARCHIVED') throw new HttpError(404, 'Product not found.')
    if (product.barcode) return { id, barcode: product.barcode }
    let barcode
    for (let attempt = 0; attempt < 10; attempt++) {
      barcode = await nextReference(tx, 'product-barcode', 'PRD', 8)
      if (!await tx.product.count({ where: { OR: [{ barcode }, { sku: barcode }] } })) break
      barcode = null
    }
    if (!barcode) throw new HttpError(409, 'Unable to allocate a unique barcode. Retry generation.')
    await tx.product.update({ where: { id }, data: { barcode } })
    await audit(tx, req, 'BARCODE_CREATED', 'Products', 'Product', id, `Generated barcode for ${product.sku}.`)
    return { id, barcode }
  })
}
