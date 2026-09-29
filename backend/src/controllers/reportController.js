import { ok } from '../utils/http.js'
import { report } from '../services/reportService.js'

export const get = async (req, res) => ok(res, await report(req.params.kind, req.query))
