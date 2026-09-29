import { prisma } from '../config/prisma.js'

export async function stockAlerts(kind) {
  const products = await prisma.product.findMany({
    where: { status: 'ACTIVE' },
    include: { category: true, brand: true, defaultSupplier: true, stocks: { include: { warehouse: true } } }
  })
  return products.map(product => {
    const quantity = product.stocks.reduce((sum, stock) => sum + stock.quantity, 0)
    const reservedQuantity = product.stocks.reduce((sum, stock) => sum + stock.reservedQuantity, 0)
    return { ...product, purchaseCost: Number(product.purchaseCost), quantity, reservedQuantity, availableStock: quantity - reservedQuantity }
  }).filter(product => kind === 'out'
    ? product.availableStock <= 0
    : product.availableStock > 0 && product.availableStock <= (product.reorderPoint || product.minimumStock))
}

export async function warrantyRecords(status) {
  const now = new Date()
  const soon = new Date(now)
  soon.setDate(soon.getDate() + 30)
  const where = { warrantyEnd: { not: null } }
  if (status === 'active') where.warrantyEnd = { gt: soon }
  if (status === 'expiring') where.warrantyEnd = { gte: now, lte: soon }
  if (status === 'expired') where.warrantyEnd = { lt: now }
  const serials = await prisma.serialNumber.findMany({ where, include: { product: true, supplier: true, warehouse: true }, orderBy: { warrantyEnd: 'asc' } })
  return serials.map(serial => ({
    ...serial, warrantyStatus: serial.warrantyEnd < now ? 'EXPIRED' : serial.warrantyEnd <= soon ? 'EXPIRING' : 'ACTIVE',
    daysRemaining: Math.ceil((serial.warrantyEnd - now) / 86_400_000)
  }))
}
