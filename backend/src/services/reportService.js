import { prisma } from '../config/prisma.js'
import { stockAlerts, warrantyRecords } from './monitoringService.js'
import { HttpError } from '../utils/http.js'

const dateFilter = query => query.dateFrom || query.dateTo ? {
  ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
  ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) } : {})
} : undefined
const productWhere = query => ({
  ...(query.category ? { categoryId: query.category } : {}),
  ...(query.brand ? { brandId: query.brand } : {}),
  ...(query.supplier ? { defaultSupplierId: query.supplier } : {})
})

export async function report(kind, query) {
  const product = productWhere(query)
  const warehouseId = query.warehouse
  switch (kind) {
    case 'inventory-summary': return (await prisma.product.findMany({
      where: product,
      include: { category: true, brand: true, defaultSupplier: true, stocks: { include: { warehouse: true }, ...(warehouseId ? { where: { warehouseId } } : {}) } },
      orderBy: { name: 'asc' }, take: 5000
    })).filter(item => !warehouseId || item.stocks.length).map(item => ({
      ...item, quantity: item.stocks.reduce((sum, stock) => sum + stock.quantity, 0),
      purchaseCost: Number(item.purchaseCost)
    }))
    case 'stock-movement': return prisma.stockMovement.findMany({ where: {
      ...(warehouseId ? { warehouseId } : {}),
      ...(dateFilter(query) ? { createdAt: dateFilter(query) } : {}),
      ...(Object.keys(product).length ? { product } : {})
    }, include: { product: true, warehouse: true, user: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' }, take: 5000 })
    case 'low-stock': return (await stockAlerts('low')).filter(item => matches(item, query))
    case 'out-of-stock': return (await stockAlerts('out')).filter(item => matches(item, query))
    case 'inventory-valuation':
    case 'warehouse-stock': return (await prisma.warehouseStock.findMany({ where: {
      ...(warehouseId ? { warehouseId } : {}),
      ...(Object.keys(product).length ? { product } : {})
    }, include: { product: { include: { category: true, brand: true } }, warehouse: true } })).map(stock => ({
      ...stock, availableQuantity: stock.quantity - stock.reservedQuantity,
      value: stock.quantity * Number(stock.product.purchaseCost)
    }))
    case 'supplier-purchases': return prisma.purchaseOrder.findMany({ where: {
      ...(query.supplier ? { supplierId: query.supplier } : {}),
      ...(warehouseId ? { warehouseId } : {}),
      ...(dateFilter(query) ? { orderDate: dateFilter(query) } : {})
    }, include: { supplier: true, warehouse: true, items: true }, orderBy: { orderDate: 'desc' }, take: 5000 })
    case 'assets': return prisma.asset.findMany({ where: {
      ...(warehouseId ? { warehouseId } : {}),
      ...(Object.keys(product).length ? { product } : {})
    }, include: { product: true, serialNumber: true, assignments: true }, take: 5000 })
    case 'warranties': return (await warrantyRecords(query.status)).filter(item => matches({ ...item, category: item.product.categoryId, brand: item.product.brandId }, query))
    default: throw new HttpError(404, 'Report not found.')
  }
}

function matches(item, query) {
  if (query.category && item.category?.id !== query.category && item.category !== query.category) return false
  if (query.brand && item.brand?.id !== query.brand && item.brand !== query.brand) return false
  if (query.supplier && item.defaultSupplierId !== query.supplier && item.supplierId !== query.supplier) return false
  if (query.warehouse && !item.stocks?.some(stock => stock.warehouseId === query.warehouse) && item.warehouseId !== query.warehouse) return false
  return true
}
