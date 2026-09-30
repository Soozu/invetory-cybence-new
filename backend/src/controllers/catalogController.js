import { warehouseWhere, serialWhere } from '../services/warehouseAccessService.js'
import { prisma } from '../config/prisma.js'
import { ok } from '../utils/http.js'
import { paginate } from '../utils/query.js'
import * as service from '../services/catalogService.js'

export const catalog = kind => ({
  list: async (req, res) => {
    const result = await service.listCatalog(kind, req.query, req.user)
    ok(res, result.data, 'OK', 200, { pagination: result.pagination })
  },
  get: async (req, res) => ok(res, await service.getCatalog(kind, req.params.id, req.user)),
  create: async (req, res) => ok(res, await service.createCatalog(kind, req.validated, req), 'Created successfully.', 201),
  update: async (req, res) => ok(res, await service.updateCatalog(kind, req.params.id, req.validated, req), 'Updated successfully.'),
  remove: async (req, res) => ok(res, await service.deleteCatalog(kind, req.params.id, req), 'Deleted successfully.')
})

export const products = {
  list: async (req, res) => {
    const result = await service.listProducts(req.query, req.user)
    ok(res, result.data, 'OK', 200, { pagination: result.pagination })
  },
  get: async (req, res) => ok(res, await service.getProduct(req.params.id, req.user)),
  create: async (req, res) => ok(res, await service.createProduct(req.validated, req), 'Product created successfully.', 201),
  update: async (req, res) => ok(res, await service.updateProduct(req.params.id, req.validated, req), 'Product updated successfully.'),
  remove: async (req, res) => ok(res, await service.deleteProduct(req.params.id, req), 'Product removed or archived.'),
  archive: async (req, res) => ok(res, await service.archiveProduct(req.params.id, req), 'Product archived successfully.'),
  inventory: async (req, res) => ok(res, await prisma.warehouseStock.findMany({ where: { productId: req.params.id, ...warehouseWhere(req.user) }, include: { warehouse: true } })),
  serials: async (req, res) => ok(res, await prisma.serialNumber.findMany({ where: { productId: req.params.id, ...serialWhere(req.user) }, orderBy: { createdAt: 'desc' } })),
  history: async (req, res) => {
    const result = await paginate(prisma.stockMovement, { where: { productId: req.params.id, ...warehouseWhere(req.user) }, query: req.query, allowedSort: ['createdAt', 'type'], defaultSort: 'createdAt' })
    ok(res, result.data, 'OK', 200, { pagination: result.pagination })
  },
  purchases: async (req, res) => ok(res, await prisma.purchaseOrderItem.findMany({ where: { productId: req.params.id, purchaseOrder: warehouseWhere(req.user) }, include: { purchaseOrder: true }, orderBy: { purchaseOrder: { createdAt: 'desc' } } }))
}

export const supplierProducts = async (req, res) => ok(res, await prisma.product.findMany({ where: { defaultSupplierId: req.params.id }, include: { category: true, brand: true } }))
export const supplierOrders = async (req, res) => ok(res, await prisma.purchaseOrder.findMany({ where: { supplierId: req.params.id, ...warehouseWhere(req.user) }, orderBy: { createdAt: 'desc' } }))
export const warehouseInventory = async (req, res) => ok(res, await prisma.warehouseStock.findMany({ where: warehouseWhere(req.user, req.params.id), include: { product: true } }))
export const warehouseMovements = async (req, res) => {
  const result = await paginate(prisma.stockMovement, { where: warehouseWhere(req.user, req.params.id), query: req.query, allowedSort: ['createdAt', 'type'], defaultSort: 'createdAt' })
  ok(res, result.data, 'OK', 200, { pagination: result.pagination })
}
