import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { suggestionQuery, replenishmentSchema, performanceQuery } from '../validators/replenishment.js'
import * as controller from '../controllers/replenishmentController.js'
export const replenishmentRoutes = Router()
replenishmentRoutes.use(authenticate)
// Express 5 query is a getter: keep parsed/defaulted query on a separate property.
const query = schema => (req, res, next) => { req.parsedQuery = schema.parse(req.query); next() }
replenishmentRoutes.get('/suggestions', query(suggestionQuery), controller.suggestions)
replenishmentRoutes.post('/documents', validate(replenishmentSchema), controller.create)
replenishmentRoutes.get('/supplier-performance', query(performanceQuery), controller.performance)
