import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { get } from '../controllers/reportController.js'

export const reportRoutes = Router()
reportRoutes.use(authenticate, authorize('reports', 'VIEW'))
for (const kind of ['inventory-summary', 'stock-movement', 'low-stock', 'out-of-stock', 'inventory-valuation', 'warehouse-stock', 'supplier-purchases', 'assets', 'warranties']) {
  reportRoutes.get(`/${kind}`, (req, res, next) => { req.params.kind = kind; next() }, get)
}
