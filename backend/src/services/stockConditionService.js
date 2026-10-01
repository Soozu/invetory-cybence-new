import { prisma } from '../config/prisma.js'
import { inventoryTransaction } from './inventoryService.js'
import { warehouseWhere, requireWarehouseAccess } from './warehouseAccessService.js'
import { paginate } from '../utils/query.js'
import { HttpError } from '../utils/http.js'
import { audit } from '../utils/audit.js'
import { nextReference } from '../utils/references.js'
import { recordSerialEvents } from '../utils/serialEvents.js'
import { conditionValues, conditionFields, conditionQuantity, balanceSnapshot, conditionDeltas, updateConditionBalance } from '../utils/stockConditions.js'

const include = { product: { select: { id: true, name: true, sku: true, trackSerialNumbers: true } }, warehouse: { select: { id: true, name: true, code: true } } }
export async function listBalances(query, user) {
  const where = warehouseWhere(user, query.warehouse)
  if (query.product) where.productId = query.product
  if (query.search) where.product = { OR: [{ name: { contains: String(query.search) } }, { sku: { contains: String(query.search) } }] }
  if (query.condition) {
    if (!conditionFields[query.condition]) throw new HttpError(400, 'Choose quarantine, defective, repair or return-pending inventory.')
    where[conditionFields[query.condition]] = { gt: 0 }
  }
  const result = await paginate(prisma.warehouseStock, { where, include, query, allowedSort: ['updatedAt', 'quantity', 'productId'], defaultSort: 'updatedAt' })
  result.data = result.data.map(row => ({ ...row, ...balanceSnapshot(row) }))
  return result
}
export async function conditionSerials(query, user) {
  if (!query.warehouse || !query.product || !conditionValues.includes(query.condition)) throw new HttpError(400, 'Choose a warehouse, product and source condition.')
  requireWarehouseAccess(user, query.warehouse)
  return paginate(prisma.serialNumber, { where: { productId: query.product, warehouseId: query.warehouse, status: query.condition,
    asset: { is: null }, maintenanceRecords: { none: { status: { in: ['SCHEDULED', 'IN_REPAIR'] } } },
    ...(query.search ? { serialNumber: { contains: String(query.search) } } : {}) },
    select: { id: true, serialNumber: true, status: true }, query, allowedSort: ['serialNumber'], defaultSort: 'serialNumber' })
}
const changeInclude = { ...include, user: { select: { firstName: true, lastName: true } }, serialSelections: { include: { serialNumber: { select: { id: true, serialNumber: true } } } } }
export async function listChanges(query, user) {
  const where = warehouseWhere(user, query.warehouse)
  if (query.product) where.productId = query.product
  if (query.search) where.referenceNumber = { contains: String(query.search) }
  return paginate(prisma.stockConditionChange, { where, include: changeInclude, query, allowedSort: ['createdAt', 'referenceNumber'], defaultSort: 'createdAt' })
}
export async function changeCondition(input, req) {
  requireWarehouseAccess(req.user, input.warehouseId)
  if (!conditionValues.includes(input.fromCondition) || !conditionValues.includes(input.toCondition) || input.fromCondition === input.toCondition || !Number.isInteger(input.quantity) || input.quantity < 1) throw new HttpError(400, 'Choose valid distinct conditions and a positive quantity.')
  return inventoryTransaction(async tx => {
    const stock = await tx.warehouseStock.findUnique({ where: { productId_warehouseId: { productId: input.productId, warehouseId: input.warehouseId } }, include })
    if (!stock) throw new HttpError(404, 'Warehouse stock not found.')
    if (!input.expectedUpdatedAt || stock.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime()) throw new HttpError(409, 'Inventory changed. Reload balances before continuing.')
    const [product, warehouse] = await Promise.all([tx.product.findUnique({ where: { id: input.productId } }), tx.warehouse.findUnique({ where: { id: input.warehouseId } })])
    if (product.status === 'ARCHIVED' || warehouse.status !== 'ACTIVE') throw new HttpError(409, 'Product is archived or warehouse is inactive.')
    if (conditionQuantity(stock, input.fromCondition) < input.quantity) throw new HttpError(409, 'Quantity exceeds the source condition balance.')
    const ids = input.serialNumberIds || []
    if (new Set(ids).size !== ids.length) throw new HttpError(400, 'Choose each serial once.')
    if (product.trackSerialNumbers) {
      if (ids.length !== input.quantity) throw new HttpError(400, 'Choose exactly one serial for every unit changed.')
      const count = await tx.serialNumber.count({ where: { id: { in: ids }, productId: product.id, warehouseId: warehouse.id, status: input.fromCondition, asset: { is: null }, maintenanceRecords: { none: { status: { in: ['SCHEDULED', 'IN_REPAIR'] } } } } })
      if (count !== ids.length) throw new HttpError(409, 'A selected serial is unavailable, managed by an asset/repair, or in another condition/warehouse.')
    } else if (ids.length) throw new HttpError(400, 'This product tracks quantities only.')
    const reservedDelta = (Number(input.toCondition !== 'AVAILABLE') - Number(input.fromCondition !== 'AVAILABLE')) * input.quantity
    const next = await updateConditionBalance(tx, stock, { reservedDelta, bucketDeltas: conditionDeltas(input.fromCondition, input.toCondition, input.quantity) })
    const referenceNumber = await nextReference(tx, `condition-${new Date().getFullYear()}`, `CND-${new Date().getFullYear()}`)
    const movement = await tx.stockMovement.create({ data: { referenceNumber, productId: product.id, warehouseId: warehouse.id, type: 'CONDITION_CHANGED', quantity: 0,
      previousQuantity: stock.quantity, newQuantity: stock.quantity, previousReservedQuantity: stock.reservedQuantity, newReservedQuantity: next.reservedQuantity,
      userId: req.user.id, notes: `${input.fromCondition} → ${input.toCondition}: ${input.quantity}. ${input.reason}` } })
    const row = await tx.stockConditionChange.create({ data: { referenceNumber, productId: product.id, warehouseId: warehouse.id, userId: req.user.id,
      fromCondition: input.fromCondition, toCondition: input.toCondition, quantity: input.quantity, reason: input.reason,
      beforeBalances: balanceSnapshot(stock), afterBalances: balanceSnapshot(next), stockMovementId: movement.id,
      serialSelections: { create: ids.map(serialNumberId => ({ serialNumberId })) } }, include: changeInclude })
    if (ids.length) {
      const updated = await tx.serialNumber.updateMany({ where: { id: { in: ids }, status: input.fromCondition, warehouseId: warehouse.id }, data: { status: input.toCondition } })
      if (updated.count !== ids.length) throw new HttpError(409, 'Selected serials changed concurrently.')
      await recordSerialEvents(tx, ids, { type: 'CONDITION_CHANGED', fromStatus: input.fromCondition, toStatus: input.toCondition, warehouseId: warehouse.id,
        referenceType: 'StockConditionChange', referenceId: row.id, referenceNumber, notes: input.reason }, req)
    }
    await audit(tx, req, 'CONDITION_CHANGED', 'Inventory', 'StockConditionChange', row.id, `${referenceNumber}: ${input.quantity} ${product.sku} ${input.fromCondition} → ${input.toCondition}: ${input.reason}`, { warehouseId: warehouse.id })
    return row
  })
}
