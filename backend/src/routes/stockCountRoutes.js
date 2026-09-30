import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { stockCountSchema, stockCountItemsSchema } from '../validators/stockCounts.js'
import * as controller from '../controllers/stockCountController.js'

export const stockCountRoutes = Router()
stockCountRoutes.use(authenticate)
stockCountRoutes.get('/', authorize('stock_counts', 'VIEW'), controller.list)
stockCountRoutes.post('/', authorize('stock_counts', 'CREATE'), validate(stockCountSchema), controller.create)
stockCountRoutes.get('/:id', authorize('stock_counts', 'VIEW'), controller.get)
stockCountRoutes.get('/:id/items', authorize('stock_counts', 'VIEW'), controller.items)
stockCountRoutes.patch('/:id/items', authorize('stock_counts', 'EDIT'), validate(stockCountItemsSchema), controller.save)
for (const event of ['start', 'submit', 'approve', 'cancel']) stockCountRoutes.post(`/:id/${event}`, authorize('stock_counts', event === 'approve' ? 'APPROVE' : 'EDIT'), controller.transition(event))
