import { prisma } from '../config/prisma.js'
import { ok, HttpError } from '../utils/http.js'
import * as service from '../services/assetService.js'

export const list = async (req, res) => {
  const result = await service.listAssets(req.query)
  ok(res, result.data, 'OK', 200, { pagination: result.pagination })
}
export const get = async (req, res) => ok(res, await service.getAsset(req.params.id))
export const create = async (req, res) => ok(res, await service.createAsset(req.validated, req), 'Asset created.', 201)
export const update = async (req, res) => ok(res, await service.updateAsset(req.params.id, req.validated, req), 'Asset updated.')
export const assign = async (req, res) => ok(res, await service.assignAsset(req.params.id, req.validated, req), 'Asset assigned.')
export const returnItem = async (req, res) => ok(res, await service.returnAsset(req.params.id, req.validated, req), 'Asset returned.')
export const close = status => async (req, res) => ok(res, await service.closeAsset(req.params.id, status, req), `Asset ${status.toLowerCase()}.`)
export const maintenanceList = async (req, res) => {
  const result = await service.listMaintenance(req.query)
  ok(res, result.data, 'OK', 200, { pagination: result.pagination })
}
export const maintenanceGet = async (req, res) => {
  const record = await prisma.maintenanceRecord.findUnique({ where: { id: req.params.id }, include: { asset: true, serialNumber: true } })
  if (!record) throw new HttpError(404, 'Maintenance record not found.')
  ok(res, record)
}
export const maintenanceCreate = async (req, res) => ok(res, await service.createMaintenance(req.validated, req), 'Maintenance record created.', 201)
export const maintenanceUpdate = async (req, res) => ok(res, await service.updateMaintenance(req.params.id, req.validated, req), 'Maintenance record updated.')
export const maintenanceFinish = status => async (req, res) => ok(res, await service.finishMaintenance(req.params.id, status, req), `Maintenance ${status.toLowerCase()}.`)
