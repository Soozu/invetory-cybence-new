import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { supplierReturnSchema, supplierReturnActionSchema, supplierReturnShipSchema, supplierReturnCompleteSchema } from '../validators/supplierReturns.js'
import * as controller from '../controllers/supplierReturnController.js'
import { HttpError } from '../utils/http.js'
export const supplierReturnRoutes = Router()
supplierReturnRoutes.use(authenticate)
const sourceAccess = (req, res, next) => {
  if (req.user.role === 'Administrator' || ['CREATE', 'EDIT'].some(action => req.user.permissions.includes(`supplier_returns.${action}`))) return next()
  throw new HttpError(403, 'You do not have permission to prepare supplier returns.')
}
supplierReturnRoutes.get('/sources', sourceAccess, controller.sources)
supplierReturnRoutes.get('/sources/:receiptId', sourceAccess, controller.source)
supplierReturnRoutes.get('/', authorize('supplier_returns', 'VIEW'), controller.list)
supplierReturnRoutes.get('/:id', authorize('supplier_returns', 'VIEW'), controller.detail)
supplierReturnRoutes.post('/', authorize('supplier_returns', 'CREATE'), validate(supplierReturnSchema), controller.create)
supplierReturnRoutes.put('/:id', authorize('supplier_returns', 'EDIT'), validate(supplierReturnSchema), controller.update)
for (const [event, permission] of [['submit', 'EDIT'], ['approve', 'APPROVE'], ['cancel', 'EDIT'], ['ship', 'SHIP'], ['complete', 'COMPLETE']]) {
  supplierReturnRoutes.post(`/:id/${event}`, authorize('supplier_returns', permission), validate(event === 'ship' ? supplierReturnShipSchema : event === 'complete' ? supplierReturnCompleteSchema : supplierReturnActionSchema), controller.action(event))
}
