import { ok } from '../utils/http.js'
import * as service from '../services/reservationService.js'
export const list = async (req, res) => { const result = await service.listReservations(req.query, req.user); ok(res, result.data, 'OK', 200, { pagination: result.pagination }) }
export const get = async (req, res) => ok(res, await service.getReservation(req.params.id, req.user))
export const availability = async (req, res) => { const result = await service.reservationAvailability(req.query, req.user); ok(res, result.data, 'OK', 200, { pagination: result.pagination }) }
export const items = async (req, res) => { const result = await service.reservationItems(req.params.id, req.query, req.user); ok(res, result.data, 'OK', 200, { pagination: result.pagination }) }
export const create = async (req, res) => ok(res, await service.createReservation(req.validated, req), 'Inventory reserved.', 201)
export const fulfill = async (req, res) => ok(res, await service.fulfillReservation(req.params.id, req.validated, req), 'Reserved inventory issued.')
export const release = status => async (req, res) => ok(res, await service.releaseReservation(req.params.id, req, status), 'Remaining inventory released.')
