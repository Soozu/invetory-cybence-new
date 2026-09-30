import { ok } from '../utils/http.js'
import * as service from '../services/stockCountService.js'

export const list = async (req, res) => { const result = await service.listCounts(req.query, req.user); ok(res, result.data, 'OK', 200, { pagination: result.pagination }) }
export const get = async (req, res) => ok(res, await service.getCount(req.params.id, req.user))
export const items = async (req, res) => { const result = await service.countItems(req.params.id, req.query, req.user); ok(res, result.data, 'OK', 200, { pagination: result.pagination }) }
export const create = async (req, res) => ok(res, await service.createCount(req.validated, req), 'Stock count created.', 201)
export const save = async (req, res) => ok(res, await service.saveCountItems(req.params.id, req.validated, req), 'Count lines saved.')
export const transition = event => async (req, res) => ok(res, await service[`${event}Count`](req.params.id, req), `Stock count ${event} completed.`)
