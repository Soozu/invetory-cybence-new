import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { planSchema, planUpdateSchema, scheduleSchema, claimSchema, claimActionSchema } from '../validators/assets.js'
import * as c from '../controllers/assetWorkflowController.js'
export const assetWorkflowRoutes = Router()
assetWorkflowRoutes.use(authenticate)
assetWorkflowRoutes.get('/preventive-maintenance', authorize('assets', 'VIEW'), c.listPlans)
assetWorkflowRoutes.post('/preventive-maintenance', authorize('assets', 'CREATE'), validate(planSchema), c.createPlan)
assetWorkflowRoutes.put('/preventive-maintenance/:id', authorize('assets', 'EDIT'), validate(planUpdateSchema), c.updatePlan)
assetWorkflowRoutes.post('/preventive-maintenance/:id/schedule', authorize('assets', 'CREATE'), validate(scheduleSchema), c.schedulePlan)
assetWorkflowRoutes.get('/warranty-claims', authorize('warranty_claims', 'VIEW'), c.listClaims)
assetWorkflowRoutes.get('/warranty-claims/sources', authorize('warranty_claims', 'CREATE'), c.listSources)
assetWorkflowRoutes.get('/warranty-claims/:id', authorize('warranty_claims', 'VIEW'), c.getClaim)
assetWorkflowRoutes.post('/warranty-claims', authorize('warranty_claims', 'CREATE'), validate(claimSchema), c.createClaim)
for (const action of ['edit', 'submit', 'accept', 'reject', 'resolve', 'cancel']) assetWorkflowRoutes.post(`/warranty-claims/:id/${action}`, authorize('warranty_claims', ['accept', 'reject', 'resolve'].includes(action) ? 'APPROVE' : 'EDIT'), validate(claimActionSchema), c.claimAction(action))
