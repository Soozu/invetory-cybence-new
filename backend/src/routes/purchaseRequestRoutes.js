import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { purchaseRequestSchema, requestDecisionSchema, requestRejectSchema, requestConversionSchema } from '../validators/purchaseRequests.js'
import * as controller from '../controllers/purchaseRequestController.js'
export const purchaseRequestRoutes = Router()
purchaseRequestRoutes.use(authenticate)
purchaseRequestRoutes.get('/', authorize('purchase_requests', 'VIEW'), controller.list)
purchaseRequestRoutes.get('/:id', authorize('purchase_requests', 'VIEW'), controller.detail)
purchaseRequestRoutes.post('/', authorize('purchase_requests', 'CREATE'), validate(purchaseRequestSchema), controller.create)
purchaseRequestRoutes.put('/:id', authorize('purchase_requests', 'EDIT'), validate(purchaseRequestSchema), controller.update)
for (const action of ['submit', 'cancel']) purchaseRequestRoutes.post(`/:id/${action}`, authorize('purchase_requests', 'EDIT'), validate(requestDecisionSchema), controller.action(action))
purchaseRequestRoutes.post('/:id/approve', authorize('purchase_requests', 'APPROVE'), validate(requestDecisionSchema), controller.action('approve'))
purchaseRequestRoutes.post('/:id/reject', authorize('purchase_requests', 'APPROVE'), validate(requestRejectSchema), controller.action('reject'))
purchaseRequestRoutes.post('/:id/convert', authorize('purchase_requests', 'CONVERT'), authorize('purchasing', 'CREATE'), validate(requestConversionSchema), controller.convert)
