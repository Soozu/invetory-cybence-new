import * as service from '../services/replenishmentService.js'
export const suggestions = async (req, res) => res.json({ success: true, ...await service.listSuggestions(req.parsedQuery, req.user) })
export const create = async (req, res) => res.status(201).json({ success: true, data: await service.createReplenishment(req.body, req) })
export const performance = async (req, res) => res.json({ success: true, ...await service.supplierPerformance(req.parsedQuery, req.user) })
