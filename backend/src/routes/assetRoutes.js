import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { assetSchema, assetUpdateSchema, assignmentSchema, handoverSchema, returnSchema, actionSchema, maintenanceSchema, maintenanceUpdateSchema, maintenanceFinishSchema } from '../validators/assets.js'
import * as controller from '../controllers/assetController.js'

export const assetRoutes = Router()
assetRoutes.use(authenticate)
assetRoutes.get('/assets', authorize('assets', 'VIEW'), controller.list)
assetRoutes.get('/assets/:id', authorize('assets', 'VIEW'), controller.get)
assetRoutes.post('/assets', authorize('assets', 'CREATE'), validate(assetSchema), controller.create)
assetRoutes.put('/assets/:id', authorize('assets', 'EDIT'), validate(assetUpdateSchema), controller.update)
assetRoutes.post('/assets/:id/assign', authorize('assets', 'EDIT'), validate(assignmentSchema), controller.assign)
assetRoutes.post('/assets/:id/handover', authorize('assets', 'EDIT'), validate(handoverSchema), controller.handover)
assetRoutes.post('/assets/:id/inspect', authorize('assets', 'EDIT'), validate(actionSchema), controller.inspect)
assetRoutes.post('/assets/:id/return', authorize('assets', 'EDIT'), validate(returnSchema), controller.returnItem)
assetRoutes.post('/assets/:id/retire', authorize('assets', 'EDIT'), validate(actionSchema), controller.close('RETIRED'))
assetRoutes.post('/assets/:id/dispose', authorize('assets', 'DELETE'), validate(actionSchema), controller.close('DISPOSED'))
assetRoutes.get('/maintenance', authorize('assets', 'VIEW'), controller.maintenanceList)
assetRoutes.get('/maintenance/:id', authorize('assets', 'VIEW'), controller.maintenanceGet)
assetRoutes.post('/maintenance', authorize('assets', 'CREATE'), validate(maintenanceSchema), controller.maintenanceCreate)
assetRoutes.put('/maintenance/:id', authorize('assets', 'EDIT'), validate(maintenanceUpdateSchema), controller.maintenanceUpdate)
assetRoutes.post('/maintenance/:id/complete', authorize('assets', 'EDIT'), validate(maintenanceFinishSchema), controller.maintenanceFinish('COMPLETED'))
assetRoutes.post('/maintenance/:id/cancel', authorize('assets', 'EDIT'), validate(maintenanceFinishSchema), controller.maintenanceFinish('CANCELLED'))
