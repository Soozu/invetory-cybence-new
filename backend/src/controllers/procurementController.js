import { warehouseWhere } from '../services/warehouseAccessService.js'
import { prisma } from '../config/prisma.js'
import { ok } from '../utils/http.js'
import { paginate } from '../utils/query.js'
import * as service from '../services/procurementService.js'

export const list = async (req, res) => {
  const result = await service.listOrders(req.query, req.user)
  ok(res, result.data, 'OK', 200, { pagination: result.pagination })
}
export const get = async (req, res) => ok(res, await service.getOrder(req.params.id, req.user))
export const create = async (req, res) => ok(res, await service.createOrder(req.validated, req), 'Purchase order created.', 201)
export const update = async (req, res) => ok(res, await service.updateOrder(req.params.id, req.validated, req), 'Purchase order updated.')
export const submit = async (req, res) => ok(res, await service.transitionOrder(req.params.id, 'submit', req), 'Purchase order submitted.')
export const approve = async (req, res) => ok(res, await service.transitionOrder(req.params.id, 'approve', req), 'Purchase order approved.')
export const cancel = async (req, res) => ok(res, await service.transitionOrder(req.params.id, 'cancel', req), 'Purchase order cancelled.')
export const receive = async (req, res) => ok(res, await service.receiveOrder(req.params.id, req.validated, req), 'Inventory received successfully.', 201)
export const receipts = async (req, res) => {
  const result = await paginate(prisma.purchaseReceipt, {
    where: { ...(req.query.purchaseOrderId ? { purchaseOrderId: req.query.purchaseOrderId } : {}), ...warehouseWhere(req.user, req.query.warehouse) },
    include: { purchaseOrder: true, warehouse: true, items: { include: { product: true } } },
    query: req.query, allowedSort: ['receivedAt', 'createdAt'], defaultSort: 'receivedAt'
  })
  ok(res, result.data, 'OK', 200, { pagination: result.pagination })
}
