import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { transferSchema, transferScanSchema, transferArrivalSchema, transferResolutionSchema } from '../validators/transfers.js'
import * as controller from '../controllers/transferController.js'

export const transferRoutes = Router()
transferRoutes.use(authenticate)
transferRoutes.get('/', authorize('inventory', 'VIEW'), controller.list)
transferRoutes.get('/destinations', authorize('inventory', 'CREATE'), controller.destinations)
transferRoutes.get('/:id', authorize('inventory', 'VIEW'), controller.get)
transferRoutes.post('/', authorize('inventory', 'CREATE'), validate(transferSchema), controller.create)
transferRoutes.put('/:id', authorize('inventory', 'EDIT'), validate(transferSchema), controller.update)
transferRoutes.post('/:id/arrivals', authorize('inventory', 'EDIT'), validate(transferArrivalSchema), controller.arrival)
transferRoutes.post('/:id/discrepancies/:discrepancyId/investigate', authorize('inventory', 'EDIT'), validate(transferResolutionSchema.refine(value => value.action === 'INVESTIGATE', { message: 'Investigation endpoint accepts notes only.' })), controller.resolution)
transferRoutes.post('/:id/discrepancies/:discrepancyId/resolve', authorize('inventory', 'APPROVE'), validate(transferResolutionSchema.refine(value => value.action !== 'INVESTIGATE', { message: 'Select an explicit resolution.' })), controller.resolution)
for (const event of ['submit', 'approve', 'ship', 'receive', 'cancel']) {
  transferRoutes.post(`/:id/${event}`, authorize('inventory', event === 'approve' ? 'APPROVE' : 'EDIT'), ...(event === 'ship' || event === 'receive' ? [validate(transferScanSchema.optional())] : []), controller.transition(event))
}
