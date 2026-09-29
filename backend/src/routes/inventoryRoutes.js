import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { adjustmentSchema, serialStatusSchema } from '../validators/inventory.js'
import * as controller from '../controllers/inventoryController.js'

export const inventoryRoutes = Router()
inventoryRoutes.use(authenticate)
inventoryRoutes.get('/inventory/stocks', authorize('inventory', 'VIEW'), controller.stocks)
inventoryRoutes.get('/inventory/movements', authorize('inventory', 'VIEW'), controller.movements)
inventoryRoutes.post('/inventory/adjust', authorize('inventory', 'EDIT'), validate(adjustmentSchema), controller.adjustment)
inventoryRoutes.get('/stock-movements', authorize('inventory', 'VIEW'), controller.movements)
inventoryRoutes.get('/serial-numbers', authorize('inventory', 'VIEW'), controller.serials)
inventoryRoutes.get('/serial-numbers/:id', authorize('inventory', 'VIEW'), controller.serial)
inventoryRoutes.patch('/serial-numbers/:id/status', authorize('inventory', 'EDIT'), validate(serialStatusSchema), controller.serialStatus)
inventoryRoutes.get('/monitoring/low-stock', authorize('inventory', 'VIEW'), controller.lowStock)
inventoryRoutes.get('/monitoring/out-of-stock', authorize('inventory', 'VIEW'), controller.outOfStock)
inventoryRoutes.get('/warranties', authorize('assets', 'VIEW'), controller.warranties)
