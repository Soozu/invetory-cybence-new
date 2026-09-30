import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { rfqSchema, rfqActionSchema, rfqAwardSchema, quotationSchema, quotationConversionSchema } from '../validators/rfqs.js'
import * as controller from '../controllers/rfqController.js'
export const rfqRoutes=Router()
rfqRoutes.use(authenticate)
rfqRoutes.get('/',authorize('rfqs','VIEW'),controller.list)
rfqRoutes.post('/',authorize('rfqs','CREATE'),validate(rfqSchema),controller.create)
rfqRoutes.get('/:id',authorize('rfqs','VIEW'),controller.detail)
rfqRoutes.put('/:id',authorize('rfqs','EDIT'),validate(rfqSchema),controller.update)
for(const [event,permission] of [['issue','ISSUE'],['close','CLOSE'],['cancel','EDIT']])rfqRoutes.post(`/:id/${event}`,authorize('rfqs',permission),validate(rfqActionSchema),controller.action(event))
rfqRoutes.get('/:id/comparison',authorize('rfqs','VIEW'),controller.comparison)
rfqRoutes.post('/:id/award',authorize('rfqs','AWARD'),validate(rfqAwardSchema),controller.award)
rfqRoutes.post('/:id/quotations',authorize('rfqs','EDIT'),validate(quotationSchema),controller.createQuotation)
rfqRoutes.get('/:id/quotations/:quotationId',authorize('rfqs','VIEW'),controller.quotation)
rfqRoutes.put('/:id/quotations/:quotationId',authorize('rfqs','EDIT'),validate(quotationSchema),controller.updateQuotation)
for(const event of ['submit','cancel'])rfqRoutes.post(`/:id/quotations/:quotationId/${event}`,authorize('rfqs','EDIT'),validate(rfqActionSchema),controller.quotationAction(event))
rfqRoutes.post('/:id/quotations/:quotationId/convert',authorize('rfqs','CONVERT'),authorize('purchasing','CREATE'),validate(quotationConversionSchema),controller.convertQuotation)
