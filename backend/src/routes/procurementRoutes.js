import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { purchaseOrderSchema, receivingSchema } from '../validators/procurement.js'
import * as controller from '../controllers/procurementController.js'

export const procurementRoutes = Router()
procurementRoutes.use(authenticate)
procurementRoutes.get('/purchase-orders', authorize('purchasing', 'VIEW'), controller.list)
procurementRoutes.get('/purchase-orders/:id', authorize('purchasing', 'VIEW'), controller.get)
procurementRoutes.post('/purchase-orders', authorize('purchasing', 'CREATE'), validate(purchaseOrderSchema), controller.create)
procurementRoutes.put('/purchase-orders/:id', authorize('purchasing', 'EDIT'), validate(purchaseOrderSchema), controller.update)
procurementRoutes.post('/purchase-orders/:id/submit', authorize('purchasing', 'CREATE'), controller.submit)
procurementRoutes.post('/purchase-orders/:id/approve', authorize('purchasing', 'APPROVE'), controller.approve)
procurementRoutes.post('/purchase-orders/:id/cancel', authorize('purchasing', 'EDIT'), controller.cancel)
procurementRoutes.post('/purchase-orders/:id/receive', authorize('purchasing', 'EDIT'), validate(receivingSchema), controller.receive)
procurementRoutes.get('/receipts', authorize('purchasing', 'VIEW'), controller.receipts)
