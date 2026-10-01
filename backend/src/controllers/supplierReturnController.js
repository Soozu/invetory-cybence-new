import { ok } from '../utils/http.js'
import * as returns from '../services/supplierReturnService.js'
export const list = async (req, res) => { const result = await returns.listReturns(req.query, req.user); ok(res, result.data, 'OK', 200, { pagination: result.pagination }) }
export const sources = async (req, res) => { const result = await returns.listSources(req.query, req.user); ok(res, result.data, 'OK', 200, { pagination: result.pagination }) }
export const source = async (req, res) => ok(res, await returns.getSource(req.params.receiptId, req.user))
export const detail = async (req, res) => ok(res, await returns.getReturn(req.params.id, req.user))
export const create = async (req, res) => ok(res, await returns.createReturn(req.validated, req), 'Draft return created.', 201)
export const update = async (req, res) => ok(res, await returns.updateReturn(req.params.id, req.validated, req), 'Return updated.')
export const action = event => async (req, res) => ok(res, await returns.transitionReturn(req.params.id, event, req.validated, req), 'Return updated.')
