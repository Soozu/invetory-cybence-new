import { ok } from '../utils/http.js'
import * as service from '../services/dashboardService.js'
import { stockAlerts } from '../services/monitoringService.js'

export const summary = async (req, res) => ok(res, await service.summary(req.user))
export const movements = async (req, res) => ok(res, await service.movements(req.query.period || '30d', req.user))
export const categoryDistribution = async (req, res) => ok(res, await service.categoryDistribution(req.user))
export const lowStock = async (req, res) => ok(res, (await stockAlerts('low', req.user)).slice(0, 5))
export const recentActivity = async (req, res) => ok(res, await service.recentActivity(req.query.limit, req.user))
