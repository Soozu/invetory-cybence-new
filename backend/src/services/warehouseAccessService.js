import { HttpError } from '../utils/http.js'

export const isAdministrator = user => user?.role === 'Administrator'

// null means unrestricted; an empty array deliberately means no warehouse access.
export function getAccessibleWarehouseIds(user) {
  if (isAdministrator(user)) return null
  return [...new Set(user?.warehouseIds || [])]
}

export function canAccessWarehouse(user, warehouseId) {
  return isAdministrator(user) || Boolean(warehouseId && getAccessibleWarehouseIds(user).includes(warehouseId))
}

export function requireWarehouseAccess(user, warehouseId) {
  if (!canAccessWarehouse(user, warehouseId)) throw new HttpError(403, 'You do not have access to this warehouse.')
}

export function requireWarehouseAdministration(user) {
  if (!isAdministrator(user)) throw new HttpError(403, 'Only administrators can manage warehouse access.')
}

export function warehouseWhere(user, warehouseId, field = 'warehouseId') {
  if (warehouseId) {
    requireWarehouseAccess(user, warehouseId)
    return { [field]: warehouseId }
  }
  const ids = getAccessibleWarehouseIds(user)
  return ids === null ? {} : { [field]: { in: ids } }
}

export function applyWarehouseScope(where, user, field = 'warehouseId') {
  const scope = warehouseWhere(user, undefined, field)
  return Object.keys(scope).length ? { AND: [where, scope] } : where
}

export function transferWhere(user, warehouseId) {
  if (warehouseId) requireWarehouseAccess(user, warehouseId)
  const ids = warehouseId ? [warehouseId] : getAccessibleWarehouseIds(user)
  return ids === null ? {} : { OR: [
    { sourceWarehouseId: { in: ids } }, { destinationWarehouseId: { in: ids } }
  ] }
}

export function requireTransferAccess(user, transfer, event) {
  if (event) return requireWarehouseAccess(user, event === 'receive' ? transfer.destinationWarehouseId : transfer.sourceWarehouseId)
  if (!canAccessWarehouse(user, transfer.sourceWarehouseId) && !canAccessWarehouse(user, transfer.destinationWarehouseId)) {
    throw new HttpError(403, 'You do not have access to this transfer.')
  }
}

export function serialWhere(user) {
  const ids = getAccessibleWarehouseIds(user)
  return ids === null ? {} : { OR: [
    { warehouseId: { in: ids } },
    { asset: { warehouseId: { in: ids } } },
    { returnSelections: { some: { returnItem: { supplierReturn: { warehouseId: { in: ids }, status: { in: ['SHIPPED', 'COMPLETED'] } } } } } },
    { transferSelections: { some: { OR: [{ outcome: 'LOST' }, { transferItem: { transfer: { status: { in: ['IN_TRANSIT', 'PARTIAL', 'DISCREPANCY'] } } } }], transferItem: { transfer: transferWhere(user) } } } }
  ] }
}

export function activityWhere(user) {
  const ids = getAccessibleWarehouseIds(user)
  // Unscoped historical logs remain administrator-only: their warehouse cannot be inferred safely.
  return ids === null ? {} : { OR: [
    { warehouseId: { in: ids } }, { relatedWarehouseId: { in: ids } }
  ] }
}
