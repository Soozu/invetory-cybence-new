import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import * as controller from '../controllers/dashboardController.js'

export const dashboardRoutes = Router()
dashboardRoutes.use(authenticate, authorize('dashboard', 'VIEW'))
dashboardRoutes.get('/summary', controller.summary)
dashboardRoutes.get('/movements', controller.movements)
dashboardRoutes.get('/category-distribution', controller.categoryDistribution)
dashboardRoutes.get('/low-stock', controller.lowStock)
dashboardRoutes.get('/recent-activity', controller.recentActivity)
