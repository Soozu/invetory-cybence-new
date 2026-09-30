import { prisma } from '../config/prisma.js'
import { ok } from '../utils/http.js'
import * as service from '../services/transferService.js'

export const list = async (req, res) => {
  const result = await service.listTransfers(req.query, req.user)
  ok(res, result.data, 'OK', 200, { pagination: result.pagination })
}
export const get = async (req, res) => ok(res, await service.getTransfer(req.params.id, req.user))
export const create = async (req, res) => ok(res, await service.createTransfer(req.validated, req), 'Transfer created.', 201)
export const update = async (req, res) => ok(res, await service.updateTransfer(req.params.id, req.validated, req), 'Transfer updated.')
export const transition = event => async (req, res) => ok(res, await service.transitionTransfer(req.params.id, event, req, req.validated || {}), `Transfer ${event} complete.`)

export const destinations = async (req, res) => ok(res, await prisma.warehouse.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } }))
