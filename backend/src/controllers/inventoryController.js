import { prisma } from '../config/prisma.js'
import { ok, HttpError } from '../utils/http.js'
import { paginate } from '../utils/query.js'
import { adjustStock, changeSerialStatus } from '../services/inventoryService.js'
import { stockAlerts, warrantyRecords } from '../services/monitoringService.js'

export const adjustment = async (req, res) => ok(res, await adjustStock(req.validated, req), 'Stock adjusted successfully.', 201)

export const stocks = async (req, res) => {
  const where = {}
  if (req.query.product) where.productId = req.query.product
  if (req.query.warehouse) where.warehouseId = req.query.warehouse
  const result = await paginate(prisma.warehouseStock, {
    where, include: { product: true, warehouse: true }, query: req.query,
    allowedSort: ['createdAt', 'updatedAt', 'quantity'], defaultSort: 'updatedAt'
  })
  ok(res, result.data.map(row => ({ ...row, availableQuantity: row.quantity - row.reservedQuantity })), 'OK', 200, { pagination: result.pagination })
}

export const movements = async (req, res) => {
  const where = {}
  if (req.query.product) where.productId = req.query.product
  if (req.query.warehouse) where.warehouseId = req.query.warehouse
  if (req.query.movementType) where.type = req.query.movementType
  if (req.query.user) where.userId = req.query.user
  if (req.query.dateFrom || req.query.dateTo) where.createdAt = {
    ...(req.query.dateFrom ? { gte: new Date(req.query.dateFrom) } : {}),
    ...(req.query.dateTo ? { lte: new Date(`${req.query.dateTo}T23:59:59.999Z`) } : {})
  }
  const result = await paginate(prisma.stockMovement, {
    where, include: { product: true, warehouse: true, sourceWarehouse: true, destinationWarehouse: true, user: { select: { firstName: true, lastName: true } } },
    query: req.query, allowedSort: ['createdAt', 'quantity', 'type'], defaultSort: 'createdAt'
  })
  ok(res, result.data, 'OK', 200, { pagination: result.pagination })
}

export const serials = async (req, res) => {
  const where = {}
  if (req.query.product) where.productId = req.query.product
  if (req.query.warehouse) where.warehouseId = req.query.warehouse
  if (req.query.status) where.status = req.query.status
  if (req.query.supplier) where.supplierId = req.query.supplier
  if (req.query.search) where.serialNumber = { contains: req.query.search }
  const now = new Date(), soon = new Date(Date.now() + 30 * 86_400_000)
  if (req.query.warrantyStatus === 'expired') where.warrantyEnd = { lt: now }
  if (req.query.warrantyStatus === 'expiring') where.warrantyEnd = { gte: now, lte: soon }
  if (req.query.warrantyStatus === 'active') where.warrantyEnd = { gt: soon }
  const result = await paginate(prisma.serialNumber, {
    where, include: { product: true, warehouse: true, supplier: true, purchaseOrderItem: { include: { purchaseOrder: true } }, asset: { include: { assignments: { where: { status: 'ACTIVE' } } } } },
    query: req.query, allowedSort: ['createdAt', 'serialNumber', 'warrantyEnd', 'status'], defaultSort: 'createdAt'
  })
  ok(res, result.data, 'OK', 200, { pagination: result.pagination })
}

export const serial = async (req, res) => {
  const row = await prisma.serialNumber.findUnique({ where: { id: req.params.id }, include: { product: true, warehouse: true, supplier: true } })
  if (!row) throw new HttpError(404, 'Serial number not found.')
  ok(res, row)
}
export const serialStatus = async (req, res) => ok(res, await changeSerialStatus(req.params.id, req.validated.status, req), 'Serial status updated.')
export const lowStock = async (req, res) => ok(res, await stockAlerts('low'))
export const outOfStock = async (req, res) => ok(res, await stockAlerts('out'))
export const warranties = async (req, res) => ok(res, await warrantyRecords(req.query.status))
