import { ok } from '../utils/http.js'
import { getSerialLifecycle, listSerialEvents } from '../services/serialLifecycleService.js'
export const detail = async (req, res) => ok(res, await getSerialLifecycle(req.params.id, req.user))
export const events = async (req, res) => {
  const result = await listSerialEvents(req.params.id, req.query, req.user)
  ok(res, result.data, 'OK', 200, { pagination: result.pagination })
}
