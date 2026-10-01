import { HttpError } from './http.js'

export const conditionFields = { QUARANTINE: 'quarantineQuantity', DEFECTIVE: 'defectiveQuantity', FOR_REPAIR: 'forRepairQuantity', RETURN_PENDING: 'returnPendingQuantity' }
export const conditionValues = ['AVAILABLE', 'QUARANTINE', 'DEFECTIVE', 'FOR_REPAIR']
export const conditionQuantity = (stock, condition) => condition === 'AVAILABLE' ? stock.quantity - stock.reservedQuantity : stock[conditionFields[condition]] || 0
export const balanceSnapshot = stock => ({
  quantity: stock.quantity, availableQuantity: stock.quantity - stock.reservedQuantity, unavailableQuantity: stock.reservedQuantity,
  reservedOnlyQuantity: stock.reservedQuantity - Object.values(conditionFields).reduce((sum, key) => sum + (stock[key] || 0), 0),
  ...Object.fromEntries(Object.values(conditionFields).map(key => [key, stock[key] || 0]))
})

// Condition balances are subsets of the existing aggregate reservedQuantity.
// Ordinary reservations retain the remainder; no legacy hold is guessed or reset.
export async function updateConditionBalance(tx, stock, { quantityDelta = 0, reservedDelta = 0, bucketDeltas = {} }) {
  const next = { quantity: stock.quantity + quantityDelta, reservedQuantity: stock.reservedQuantity + reservedDelta,
    ...Object.fromEntries(Object.values(conditionFields).map(key => [key, (stock[key] || 0) + (bucketDeltas[key] || 0)])) }
  const held = Object.values(conditionFields).reduce((sum, key) => sum + next[key], 0)
  if (!Object.values(next).every(value => Number.isInteger(value) && value >= 0) || next.reservedQuantity > next.quantity || held > next.reservedQuantity) throw new HttpError(409, 'Condition or unavailable balance cannot support this change. Reload inventory.')
  const changed = await tx.warehouseStock.updateMany({ where: { id: stock.id, updatedAt: stock.updatedAt, quantity: stock.quantity, reservedQuantity: stock.reservedQuantity,
    ...Object.fromEntries(Object.values(conditionFields).map(key => [key, stock[key] || 0])) }, data: { ...next, updatedAt: new Date(Math.max(Date.now(), stock.updatedAt.getTime() + 1)) } })
  if (changed.count !== 1) throw new HttpError(409, 'Inventory changed concurrently. Reload inventory.')
  return { ...stock, ...next }
}
export function conditionDeltas(from, to, quantity) {
  const deltas = {}
  if (conditionFields[from]) deltas[conditionFields[from]] = -quantity
  if (conditionFields[to]) deltas[conditionFields[to]] = (deltas[conditionFields[to]] || 0) + quantity
  return deltas
}
