import { ok } from '../utils/http.js'
import * as service from '../services/purchaseRequestService.js'
export const list = async (req, res) => { const result = await service.listRequests(req.query, req.user); ok(res, result.data, 'OK', 200, { pagination: result.pagination }) }
export const detail = async (req, res) => ok(res, await service.getRequest(req.params.id, req.user))
export const create = async (req, res) => ok(res, await service.createRequest(req.validated, req), 'Purchase request created.', 201)
export const update = async (req, res) => ok(res, await service.updateRequest(req.params.id, req.validated, req), 'Purchase request updated.')
export const action = event => async (req, res) => ok(res, await service.transitionRequest(req.params.id, event, req.validated || {}, req), 'Purchase request updated.')
export const convert = async (req, res) => ok(res, await service.convertRequest(req.params.id, req.validated, req), 'Draft purchase order created.', 201)
