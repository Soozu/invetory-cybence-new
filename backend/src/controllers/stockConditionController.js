import { ok } from '../utils/http.js'
import * as service from '../services/stockConditionService.js'
const paginated = method => async (req, res) => { const result = await method(req.query, req.user); ok(res, result.data, 'OK', 200, { pagination: result.pagination }) }
export const balances = paginated(service.listBalances)
export const serials = paginated(service.conditionSerials)
export const history = paginated(service.listChanges)
export const change = async (req, res) => ok(res, await service.changeCondition(req.validated, req), 'Inventory condition updated.', 201)
