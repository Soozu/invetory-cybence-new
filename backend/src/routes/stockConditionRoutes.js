import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { conditionChangeSchema } from '../validators/stockConditions.js'
import * as controller from '../controllers/stockConditionController.js'
export const stockConditionRoutes = Router()
stockConditionRoutes.use(authenticate)
stockConditionRoutes.get('/', authorize('inventory', 'VIEW'), controller.balances)
stockConditionRoutes.get('/serials', authorize('inventory', 'VIEW'), controller.serials)
stockConditionRoutes.get('/history', authorize('inventory', 'VIEW'), controller.history)
stockConditionRoutes.post('/', authorize('inventory', 'EDIT'), validate(conditionChangeSchema), controller.change)
