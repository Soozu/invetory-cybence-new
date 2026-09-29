import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { assetSchema, assetUpdateSchema, assignmentSchema, returnSchema, maintenanceSchema } from '../validators/assets.js'
import * as controller from '../controllers/assetController.js'

export const assetRoutes = Router()
assetRoutes.use(authenticate)
assetRoutes.get('/assets', authorize('assets', 'VIEW'), controller.list)
assetRoutes.get('/assets/:id', authorize('assets', 'VIEW'), controller.get)
assetRoutes.post('/assets', authorize('assets', 'CREATE'), validate(assetSchema), controller.create)
assetRoutes.put('/assets/:id', authorize('assets', 'EDIT'), validate(assetUpdateSchema), controller.update)
assetRoutes.post('/assets/:id/assign', authorize('assets', 'EDIT'), validate(assignmentSchema), controller.assign)
assetRoutes.post('/assets/:id/return', authorize('assets', 'EDIT'), validate(returnSchema), controller.returnItem)
assetRoutes.post('/assets/:id/retire', authorize('assets', 'EDIT'), controller.close('RETIRED'))
assetRoutes.post('/assets/:id/dispose', authorize('assets', 'DELETE'), controller.close('DISPOSED'))
assetRoutes.get('/maintenance', authorize('assets', 'VIEW'), controller.maintenanceList)
assetRoutes.get('/maintenance/:id', authorize('assets', 'VIEW'), controller.maintenanceGet)
assetRoutes.post('/maintenance', authorize('assets', 'CREATE'), validate(maintenanceSchema), controller.maintenanceCreate)
assetRoutes.put('/maintenance/:id', authorize('assets', 'EDIT'), validate(maintenanceSchema.partial()), controller.maintenanceUpdate)
assetRoutes.post('/maintenance/:id/complete', authorize('assets', 'EDIT'), controller.maintenanceFinish('COMPLETED'))
assetRoutes.post('/maintenance/:id/cancel', authorize('assets', 'EDIT'), controller.maintenanceFinish('CANCELLED'))
