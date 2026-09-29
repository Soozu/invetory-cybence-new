import { prisma } from '../config/prisma.js'
import { stockAlerts } from './monitoringService.js'
import { HttpError } from '../utils/http.js'

const periods = { '7d': 7, '30d': 30, '3m': 90, '6m': 180, '1y': 365 }
export function periodWindow(period = '30d') {
  if (!periods[period]) throw new HttpError(400, 'Invalid period. Use 7d, 30d, 3m, 6m, or 1y.')
  const from = new Date()
  from.setDate(from.getDate() - periods[period] + 1)
  from.setHours(0, 0, 0, 0)
  return { from, days: periods[period] }
}

export async function summary() {
  const [totalProducts, stocks, low, out, activeSuppliers] = await Promise.all([
    prisma.product.count({ where: { status: 'ACTIVE' } }),
    prisma.warehouseStock.findMany({ select: { quantity: true, product: { select: { purchaseCost: true } } } }),
    stockAlerts('low'), stockAlerts('out'),
    prisma.supplier.count({ where: { status: 'ACTIVE' } })
  ])
  return {
    totalProducts, totalInventoryUnits: stocks.reduce((sum, stock) => sum + stock.quantity, 0),
    inventoryValue: stocks.reduce((sum, stock) => sum + stock.quantity * Number(stock.product.purchaseCost), 0),
    lowStock: low.length, outOfStock: out.length, activeSuppliers
  }
}

export async function movements(period) {
  const { from, days } = periodWindow(period)
  const rows = await prisma.stockMovement.findMany({ where: { createdAt: { gte: from } }, select: { createdAt: true, quantity: true, type: true } })
  const monthly = days > 30
  const points = new Map()
  for (let offset = 0; offset < days; offset++) {
    const date = new Date(from)
    date.setDate(date.getDate() + offset)
    const key = monthly ? date.toISOString().slice(0, 7) : date.toISOString().slice(0, 10)
    if (!points.has(key)) points.set(key, { date: key, stockIn: 0, stockOut: 0 })
  }
  for (const movement of rows) {
    const key = monthly ? movement.createdAt.toISOString().slice(0, 7) : movement.createdAt.toISOString().slice(0, 10)
    const point = points.get(key)
    if (!point) continue
    if (movement.quantity > 0) point.stockIn += movement.quantity
    else point.stockOut += Math.abs(movement.quantity)
  }
  return [...points.values()]
}

export async function categoryDistribution() {
  const rows = await prisma.warehouseStock.findMany({
    select: { quantity: true, product: { select: { category: { select: { id: true, name: true } } } } }
  })
  const values = new Map()
  for (const row of rows) {
    const category = row.product.category
    const entry = values.get(category.id) || { id: category.id, name: category.name, quantity: 0 }
    entry.quantity += row.quantity
    values.set(category.id, entry)
  }
  return [...values.values()].sort((a, b) => b.quantity - a.quantity)
}

export async function recentActivity(limit = 8) {
  return prisma.activityLog.findMany({ take: Math.min(25, Math.max(1, Number(limit) || 8)), orderBy: { createdAt: 'desc' }, include: { user: { select: { firstName: true, lastName: true } } } })
}
