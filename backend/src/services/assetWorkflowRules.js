import { HttpError } from '../utils/http.js'
import { requireWarehouseAccess } from './warehouseAccessService.js'
import { audit } from '../utils/audit.js'
import { recordSerialEvents } from '../utils/serialEvents.js'

export function permit(user, action, module = 'assets') {
  if (user?.role !== 'Administrator' && !user?.permissions?.includes(`${module}.${action}`)) throw new HttpError(403, 'You do not have permission for this action.')
}
export function version(row, value) {
  if (!value || !Number.isFinite(new Date(value).getTime())) throw new HttpError(400, 'A document version is required. Reload the record.')
  if (row.updatedAt.getTime() !== new Date(value).getTime()) throw new HttpError(409, 'This record changed. Reload it before continuing.')
}
export const stamp = row => new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1))
export async function revise(model, row, data) {
  const changed = await model.updateMany({ where: { id: row.id, updatedAt: row.updatedAt }, data: { ...data, updatedAt: stamp(row) } })
  if (changed.count !== 1) throw new HttpError(409, 'This record changed. Reload it before continuing.')
}
export async function ownedAsset(tx, id, user) {
  const row = await tx.asset.findUnique({ where: { id }, include: { serialNumber: true } })
  if (!row) throw new HttpError(404, 'Asset not found.')
  requireWarehouseAccess(user, row.warehouseId)
  return row
}
export function serviceable(asset) {
  if (['RETIRED', 'DISPOSED', 'LOST'].includes(asset.status)) throw new HttpError(409, 'A closed or lost asset cannot be serviced.')
}
export async function assetEvent(tx, asset, type, notes, req, referenceId = asset.id, data = {}, serialType = type, toStatus) {
  await tx.assetEvent.create({ data: { assetId: asset.id, warehouseId: asset.warehouseId, userId: req.user.id, type, referenceId, notes: notes || type, data } })
  if (asset.serialNumberId) await recordSerialEvents(tx, [asset.serialNumberId], { type: serialType, ...(toStatus ? { toStatus } : {}), warehouseId: asset.warehouseId, referenceType: 'Asset', referenceId: asset.id, referenceNumber: asset.assetTag, notes: notes || type }, req)
  const after=await tx.asset.findUnique({where:{id:asset.id}})
  await audit(tx, req, type, 'Assets', 'Asset', asset.id, `${type}: ${asset.assetTag}.`, { warehouseId: asset.warehouseId,relatedWarehouseId:after?.warehouseId,before:type==='ASSET_CREATED'?null:asset,after })
}
