import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import bcrypt from 'bcrypt'
import { conditionChangeSchema } from '../src/validators/stockConditions.js'
import { balanceSnapshot } from '../src/utils/stockConditions.js'

it('validates condition changes, explicit versions, reasons and unique serial identities', () => {
  const input = { productId: 'p', warehouseId: 'w', expectedUpdatedAt: new Date().toISOString(), fromCondition: 'AVAILABLE', toCondition: 'QUARANTINE', quantity: 2, reason: 'Inspection hold', serialNumberIds: [] }
  expect(conditionChangeSchema.safeParse(input).success).toBe(true)
  for (const patch of [{ expectedUpdatedAt: undefined }, { quantity: 0 }, { quantity: 1.5 }, { reason: ' ' }, { toCondition: 'AVAILABLE' }, { fromCondition: 'RESERVED' }, { toCondition: 'RETURN_PENDING' }, { serialNumberIds: ['s', 's'] }]) expect(conditionChangeSchema.safeParse({ ...input, ...patch }).success).toBe(false)
})

describe.skipIf(!process.env.TEST_DATABASE_URL)('Stock conditions with isolated MySQL', () => {
  let db, service, inventory, returns, purchasing, reservations, counts, transfers, assets, server, origin, f
  const suffix = Date.now().toString(36)
  const http = async (token, path, method = 'GET', body) => {
    const response = await fetch(`${origin}/api${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
    return { status: response.status, ...await response.json() }
  }
  beforeAll(async () => {
    if (!/^techstock_test_warehouse_[a-z0-9_]+$/.test(new URL(process.env.TEST_DATABASE_URL).pathname.slice(1))) throw Error('Unsafe test schema')
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
    db = (await import('../src/config/prisma.js')).prisma
    service = await import('../src/services/stockConditionService.js'); inventory = await import('../src/services/inventoryService.js')
    returns = await import('../src/services/supplierReturnService.js'); purchasing = await import('../src/services/procurementService.js')
    reservations = await import('../src/services/reservationService.js'); counts = await import('../src/services/stockCountService.js')
    transfers = await import('../src/services/transferService.js'); assets = await import('../src/services/assetService.js')
    const warehouses = await Promise.all(['A', 'B'].map(code => db.warehouse.create({ data: { name: `Conditions ${code} ${suffix}`, code: `CND-${code}-${suffix}` } })))
    const category = await db.category.create({ data: { name: `Conditions ${suffix}`, slug: `cnd-${suffix}` } })
    const brand = await db.brand.create({ data: { name: `Conditions ${suffix}`, slug: `cnd-${suffix}` } })
    const supplier = await db.supplier.create({ data: { companyName: `Conditions ${suffix}`, supplierCode: `CND-${suffix}` } })
    const role = await db.role.upsert({ where: { name: 'Administrator' }, create: { name: 'Administrator' }, update: {} })
    const passwordHash = await bcrypt.hash('ConditionTest123!', 4)
    const admin = await db.user.create({ data: { firstName: 'Conditions', lastName: 'Admin', email: `cnd-admin-${suffix}@test.local`, passwordHash, roleId: role.id } })
    const users = { admin }, tokens = {}
    for (const [name, actions, warehouse] of [['viewer', ['VIEW'], warehouses[0]], ['operator', ['VIEW', 'EDIT'], warehouses[0]], ['foreign', ['VIEW', 'EDIT'], warehouses[1]], ['unassigned', ['VIEW', 'EDIT'], null], ['noPermission', [], warehouses[0]]]) {
      const role = await db.role.create({ data: { name: `Conditions ${name} ${suffix}` } })
      for (const action of actions) {
        const permission = await db.permission.upsert({ where: { module_action: { module: 'inventory', action } }, create: { module: 'inventory', action }, update: {} })
        await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } })
      }
      users[name] = await db.user.create({ data: { firstName: name, lastName: 'Test', email: `cnd-${name}-${suffix}@test.local`, passwordHash, roleId: role.id, ...(warehouse ? { warehouseAssignments: { create: { warehouseId: warehouse.id } } } : {}) } })
    }
    const { app } = await import('../src/app.js'); server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); origin = `http://127.0.0.1:${server.address().port}`
    for (const [name, user] of Object.entries(users)) tokens[name] = (await http('', '/auth/login', 'POST', { email: user.email, password: 'ConditionTest123!' })).data.accessToken
    f = { warehouses, category, brand, supplier, users, tokens, req: { user: { id: admin.id, role: 'Administrator' }, get: () => null }, sequence: 0 }
  }, 30000)
  afterAll(async () => { if (server) await new Promise(resolve => server.close(resolve)); if (db) await db.$disconnect() })
  async function fixture(serialized = false, received = false) {
    const n = ++f.sequence, warehouse = f.warehouses[0]
    const product = await db.product.create({ data: { name: `Condition product ${n}`, sku: `CND-${suffix}-${n}`, categoryId: f.category.id, brandId: f.brand.id, trackSerialNumbers: serialized } })
    let serials = [], receipt
    if (received) {
      const po = await purchasing.createOrder({ supplierId: f.supplier.id, warehouseId: warehouse.id, tax: 0, shipping: 0, items: [{ productId: product.id, quantity: 5, unitCost: 12.34 }] }, f.req)
      await purchasing.transitionOrder(po.id, 'submit', f.req); await purchasing.transitionOrder(po.id, 'approve', f.req)
      const row = await purchasing.receiveOrder(po.id, { items: [{ purchaseOrderItemId: po.items[0].id, quantity: 5, serialNumbers: serialized ? Array.from({ length: 5 }, (_, i) => `CND-SN-${suffix}-${n}-${i}`) : [] }] }, f.req)
      receipt = await returns.getSource(row.id, f.req.user); serials = receipt.items[0].serials
    } else {
      await db.warehouseStock.create({ data: { productId: product.id, warehouseId: warehouse.id, quantity: 5 } })
      if (serialized) serials = await Promise.all(Array.from({ length: 5 }, (_, i) => db.serialNumber.create({ data: { productId: product.id, warehouseId: warehouse.id, serialNumber: `CND-SN-${suffix}-${n}-${i}` } })))
    }
    const stock = () => db.warehouseStock.findUnique({ where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } } })
    return { product, warehouse, serials, receipt, stock }
  }
  const input = async (x, fromCondition = 'AVAILABLE', toCondition = 'QUARANTINE', quantity = 1, serialNumberIds = []) => ({ productId: x.product.id, warehouseId: x.warehouse.id, expectedUpdatedAt: (await x.stock()).updatedAt.toISOString(), fromCondition, toCondition, quantity, serialNumberIds, reason: 'Inspection result recorded' })
  const change = async (x, from, to, quantity = 1, ids = []) => service.changeCondition(await input(x, from, to, quantity, ids), f.req)
  const returnDraft = (x, quantity, stockCondition, serialNumberIds = []) => returns.createReturn({ receiptId: x.receipt.id, reason: 'DEFECTIVE', items: [{ receiptItemId: x.receipt.items[0].id, quantity, reason: 'DEFECTIVE', condition: 'DEFECTIVE', stockCondition, serialNumberIds }] }, f.req)
  const action = (row, event, patch = {}) => returns.transitionReturn(row.id, event, { expectedUpdatedAt: row.updatedAt.toISOString(), ...patch }, f.req)

  it('backfills known legacy holds without changing totals, timestamps or unknown holds', async () => {
    const serial = await db.warehouseStock.findUnique({ where: { id: 'test-legacy-condition-stock' } })
    expect(serial).toMatchObject({ quantity: 5, reservedQuantity: 4, quarantineQuantity: 0, defectiveQuantity: 1, forRepairQuantity: 1, returnPendingQuantity: 1 })
    expect(serial.updatedAt.toISOString()).toBe('2026-09-01T12:00:00.000Z')
    expect(balanceSnapshot(serial).reservedOnlyQuantity).toBe(1)
    const plain = await db.warehouseStock.findUnique({ where: { id: 'test-legacy-condition-plain-stock' } })
    expect(plain).toMatchObject({ quantity: 4, reservedQuantity: 3, returnPendingQuantity: 2, defectiveQuantity: 0, forRepairQuantity: 0 })
    expect(balanceSnapshot(plain).reservedOnlyQuantity).toBe(1)
    const row = await returns.getReturn('test-legacy-condition-return', f.req.user)
    await action(row, 'cancel')
    expect(await db.warehouseStock.findUnique({ where: { id: plain.id } })).toMatchObject({ quantity: 4, reservedQuantity: 1, returnPendingQuantity: 0 })
  })
  it('moves quantity-only stock through inspection, defect, repair and clearance with immutable balances', async () => {
    const x = await fixture(); await db.warehouseStock.update({ where: { id: (await x.stock()).id }, data: { reservedQuantity: 1 } })
    const record = await change(x, 'AVAILABLE', 'QUARANTINE', 3)
    expect(record).toMatchObject({ quantity: 3, fromCondition: 'AVAILABLE', toCondition: 'QUARANTINE', beforeBalances: { quantity: 5, availableQuantity: 4, reservedOnlyQuantity: 1 }, afterBalances: { quantity: 5, availableQuantity: 1, quarantineQuantity: 3 } })
    expect(await x.stock()).toMatchObject({ quantity: 5, reservedQuantity: 4, quarantineQuantity: 3 })
    await change(x, 'QUARANTINE', 'DEFECTIVE', 2); await change(x, 'DEFECTIVE', 'FOR_REPAIR', 2); await change(x, 'FOR_REPAIR', 'AVAILABLE', 2)
    expect(balanceSnapshot(await x.stock())).toMatchObject({ quantity: 5, availableQuantity: 3, reservedOnlyQuantity: 1, quarantineQuantity: 1, defectiveQuantity: 0, forRepairQuantity: 0 })
    expect(await db.stockMovement.findUnique({ where: { id: record.stockMovementId } })).toMatchObject({ type: 'CONDITION_CHANGED', quantity: 0, previousQuantity: 5, newQuantity: 5 })
    expect(await db.activityLog.count({ where: { entityId: record.id, warehouseId: x.warehouse.id, action: 'CONDITION_CHANGED' } })).toBe(1)
    expect((await db.stockConditionChange.findUnique({ where: { id: record.id } })).afterBalances.quarantineQuantity).toBe(3)
  })
  it('changes exact serialized units and preserves receipt identity and lifecycle history', async () => {
    const x = await fixture(true, true), ids = x.serials.slice(0, 2).map(s => s.id)
    const record = await change(x, 'AVAILABLE', 'QUARANTINE', 2, ids)
    expect(record.serialSelections.map(s => s.serialNumberId).sort()).toEqual(ids.sort())
    expect(await db.serialNumber.count({ where: { productId: x.product.id, status: 'QUARANTINE', receiptId: x.receipt.id, warehouseId: x.warehouse.id } })).toBe(2)
    expect(await db.serialEvent.count({ where: { referenceId: record.id, referenceType: 'StockConditionChange', fromStatus: 'AVAILABLE', toStatus: 'QUARANTINE' } })).toBe(2)
    await change(x, 'QUARANTINE', 'FOR_REPAIR', 2, ids); await change(x, 'FOR_REPAIR', 'AVAILABLE', 2, ids)
    expect(await x.stock()).toMatchObject({ quantity: 5, reservedQuantity: 0, quarantineQuantity: 0, forRepairQuantity: 0 })
  })
  it('rejects insufficient sources, malformed serial sets and foreign serials atomically', async () => {
    const x = await fixture(true), other = await fixture(true)
    const before = await x.stock(), history = await db.stockConditionChange.count()
    for (const ids of [[], [x.serials[0].id, x.serials[0].id], [other.serials[0].id, x.serials[1].id], [x.serials[0].id]]) await expect(change(x, 'AVAILABLE', 'QUARANTINE', 2, ids)).rejects.toMatchObject({ status: expect.any(Number) })
    await expect(change(x, 'DEFECTIVE', 'AVAILABLE', 1, [x.serials[0].id])).rejects.toMatchObject({ status: 409 })
    await expect(change(x, 'AVAILABLE', 'QUARANTINE', 6, x.serials.map(s => s.id))).rejects.toMatchObject({ status: 409 })
    const plain = await fixture(); await expect(change(plain, 'AVAILABLE', 'DEFECTIVE', 1, [x.serials[0].id])).rejects.toMatchObject({ status: 400 })
    expect(await x.stock()).toEqual(before); expect(await db.stockConditionChange.count()).toBe(history)
  })
  it('invalidates stale balances after round trips and a backward clock', async () => {
    const x = await fixture(), stale = await input(x)
    await change(x, 'AVAILABLE', 'QUARANTINE'); await change(x, 'QUARANTINE', 'AVAILABLE')
    await expect(service.changeCondition(stale, f.req)).rejects.toMatchObject({ status: 409 })
    const version = (await x.stock()).updatedAt.getTime(), spy = vi.spyOn(Date, 'now').mockReturnValue(version - 60000)
    try { await change(x, 'AVAILABLE', 'QUARANTINE') } finally { spy.mockRestore() }
    expect((await x.stock()).updatedAt.getTime()).toBeGreaterThan(version)
  })
  it('permits one competing conversion from the same version, with one audit and movement', async () => {
    const x = await fixture(), body = await input(x, 'AVAILABLE', 'DEFECTIVE', 5)
    const results = await Promise.allSettled([service.changeCondition(body, f.req), service.changeCondition({ ...body, toCondition: 'QUARANTINE' }, f.req)])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(r => r.status === 'rejected').reason.status).toBe(409)
    expect(await x.stock()).toMatchObject({ quantity: 5, reservedQuantity: 5 })
    expect(await db.stockConditionChange.count({ where: { productId: x.product.id } })).toBe(1)
    expect(await db.stockMovement.count({ where: { productId: x.product.id, type: 'CONDITION_CHANGED' } })).toBe(1)
  })
  it('preserves reservation holds across condition moves and release; held stock cannot be issued', async () => {
    const x = await fixture(), reservation = await reservations.createReservation({ warehouseId: x.warehouse.id, referenceType: 'Project', items: [{ productId: x.product.id, quantity: 2 }] }, f.req)
    await change(x, 'AVAILABLE', 'QUARANTINE', 3)
    await expect(inventory.adjustStock({ productId: x.product.id, warehouseId: x.warehouse.id, type: 'STOCK_OUT', quantity: 1, reason: 'Blocked issue' }, f.req)).rejects.toMatchObject({ status: 400 })
    await expect(reservations.createReservation({ warehouseId: x.warehouse.id, items: [{ productId: x.product.id, quantity: 1 }] }, f.req)).rejects.toMatchObject({ status: 409 })
    await reservations.releaseReservation(reservation.id, f.req)
    expect(balanceSnapshot(await x.stock())).toMatchObject({ quantity: 5, availableQuantity: 2, reservedOnlyQuantity: 0, quarantineQuantity: 3 })
    await inventory.adjustStock({ productId: x.product.id, warehouseId: x.warehouse.id, type: 'STOCK_OUT', quantity: 2, reason: 'Available units only' }, f.req)
    expect(await x.stock()).toMatchObject({ quantity: 3, reservedQuantity: 3, quarantineQuantity: 3 })
  })
  it('serial reservations and asset custody cannot be bypassed through condition changes', async () => {
    const x = await fixture(true), ids = [x.serials[0].id]
    const reservation = await reservations.createReservation({ warehouseId: x.warehouse.id, items: [{ productId: x.product.id, quantity: 1, serialNumbers: [x.serials[0].serialNumber] }] }, f.req)
    await expect(change(x, 'AVAILABLE', 'QUARANTINE', 1, ids)).rejects.toMatchObject({ status: 409 })
    await expect(inventory.changeSerialStatus(ids[0], 'QUARANTINE', f.req)).rejects.toMatchObject({ status: 409 })
    await reservations.releaseReservation(reservation.id, f.req)
    await change(x, 'AVAILABLE', 'QUARANTINE', 1, ids)
    await expect(assets.createAsset({ productId: x.product.id, warehouseId: x.warehouse.id, serialNumberId: ids[0] }, f.req)).rejects.toMatchObject({ status: 400 })
    await change(x, 'QUARANTINE', 'AVAILABLE', 1, ids)
    await assets.createAsset({ productId: x.product.id, warehouseId: x.warehouse.id, serialNumberId: ids[0] }, f.req)
    await expect(change(x, 'AVAILABLE', 'QUARANTINE', 1, ids)).rejects.toMatchObject({ status: 409 })
  })
  it('generic serial changes maintain classified buckets and cannot release return-pending stock', async () => {
    const x = await fixture(true, true), id = x.serials[0].id
    await inventory.changeSerialStatus(id, 'DEFECTIVE', f.req); await inventory.changeSerialStatus(id, 'FOR_REPAIR', f.req); await inventory.changeSerialStatus(id, 'QUARANTINE', f.req)
    expect(await x.stock()).toMatchObject({ quantity: 5, reservedQuantity: 1, defectiveQuantity: 0, forRepairQuantity: 0, quarantineQuantity: 1 })
    let row = await returnDraft(x, 1, 'AVAILABLE', [id]); row = await action(row, 'submit')
    await expect(inventory.changeSerialStatus(id, 'AVAILABLE', f.req)).rejects.toMatchObject({ status: 409 })
    await expect(change(x, 'QUARANTINE', 'AVAILABLE', 1, [id])).rejects.toMatchObject({ status: 409 })
    await action(row, 'cancel'); await inventory.changeSerialStatus(id, 'AVAILABLE', f.req)
    expect(await x.stock()).toMatchObject({ quantity: 5, reservedQuantity: 0, quarantineQuantity: 0, returnPendingQuantity: 0 })
  })
  it('transfers ship only available units and retain classified stock at the source', async () => {
    const x = await fixture(); await change(x, 'AVAILABLE', 'QUARANTINE', 4)
    const transfer = await transfers.createTransfer({ sourceWarehouseId: x.warehouse.id, destinationWarehouseId: f.warehouses[1].id, items: [{ productId: x.product.id, quantity: 2 }] }, f.req)
    await transfers.transitionTransfer(transfer.id, 'submit', f.req); await transfers.transitionTransfer(transfer.id, 'approve', f.req)
    await expect(transfers.transitionTransfer(transfer.id, 'ship', f.req)).rejects.toMatchObject({ status: 400 })
    expect(await x.stock()).toMatchObject({ quantity: 5, reservedQuantity: 4, quarantineQuantity: 4 })
  })
  it('invalidates count snapshots after held-to-held changes even when totals match', async () => {
    const x = await fixture(); await change(x, 'AVAILABLE', 'QUARANTINE', 2)
    const count = await counts.createCount({ warehouseId: x.warehouse.id }, f.req); await counts.startCount(count.id, f.req)
    const items = await db.stockCountItem.findMany({ where: { stockCountId: count.id }, include: { product: true, serials: true } })
    for (const item of items) await counts.saveCountItems(count.id, { items: [{ id: item.id, countedQuantity: item.expectedQuantity, serialNumbers: item.product.trackSerialNumbers ? item.serials.map(s => s.serialNumber) : [] }] }, f.req)
    await counts.submitCount(count.id, f.req); await change(x, 'QUARANTINE', 'DEFECTIVE', 2)
    await expect(counts.approveCount(count.id, f.req)).rejects.toMatchObject({ status: 409 })
    expect(await x.stock()).toMatchObject({ quantity: 5, reservedQuantity: 2, defectiveQuantity: 2 })
  })
  it('moves nonserialized quarantined returns into pending, restores on cancel and removes only at shipment', async () => {
    const x = await fixture(false, true); await change(x, 'AVAILABLE', 'QUARANTINE', 3)
    let row = await returnDraft(x, 2, 'QUARANTINE'); row = await action(row, 'submit')
    expect(row.items[0].heldQuantity).toBe(0)
    expect(await x.stock()).toMatchObject({ quantity: 5, reservedQuantity: 3, quarantineQuantity: 1, returnPendingQuantity: 2 })
    row = await action(row, 'approve'); await action(row, 'cancel')
    expect(await x.stock()).toMatchObject({ quantity: 5, reservedQuantity: 3, quarantineQuantity: 3, returnPendingQuantity: 0 })
    row = await returnDraft(x, 3, 'QUARANTINE'); row = await action(row, 'submit'); row = await action(row, 'approve'); await action(row, 'ship', { shipmentReference: 'Defective stock parcel' })
    expect(await x.stock()).toMatchObject({ quantity: 2, reservedQuantity: 0, quarantineQuantity: 0, returnPendingQuantity: 0 })
  })
  it('revalidates the nonserialized source condition at submission and rolls back an exhausted bucket', async () => {
    const x = await fixture(false, true); await change(x, 'AVAILABLE', 'DEFECTIVE', 2)
    const row = await returnDraft(x, 2, 'DEFECTIVE'); await change(x, 'DEFECTIVE', 'AVAILABLE', 1)
    const before = await x.stock(); await expect(action(row, 'submit')).rejects.toMatchObject({ status: 409 })
    expect(await x.stock()).toEqual(before); expect((await returns.getReturn(row.id, f.req.user)).status).toBe('DRAFT')
  })
  it('competing condition and return holds cannot consume the same quantity twice', async () => {
    const x = await fixture(false, true), row = await returnDraft(x, 5, 'AVAILABLE'), body = await input(x, 'AVAILABLE', 'QUARANTINE', 5)
    const results = await Promise.allSettled([action(row, 'submit'), service.changeCondition(body, f.req)])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const stock = await x.stock(); expect(stock.reservedQuantity).toBe(5); expect(stock.quarantineQuantity + stock.returnPendingQuantity).toBe(5)
  })
  it('blocks inactive warehouses and archived products with no audit or balance mutation', async () => {
    const x = await fixture(), before = await x.stock()
    await db.product.update({ where: { id: x.product.id }, data: { status: 'ARCHIVED' } }); await expect(change(x, 'AVAILABLE', 'DEFECTIVE')).rejects.toMatchObject({ status: 409 })
    await db.product.update({ where: { id: x.product.id }, data: { status: 'ACTIVE' } }); await db.warehouse.update({ where: { id: x.warehouse.id }, data: { status: 'INACTIVE' } })
    try { await expect(change(x, 'AVAILABLE', 'DEFECTIVE')).rejects.toMatchObject({ status: 409 }) } finally { await db.warehouse.update({ where: { id: x.warehouse.id }, data: { status: 'ACTIVE' } }) }
    expect(await x.stock()).toEqual(before)
  })
  it('enforces HTTP permissions, scopes, no-access lists, serial selection and reload history', async () => {
    const x = await fixture(true), body = await input(x, 'AVAILABLE', 'QUARANTINE', 1, [x.serials[0].id])
    expect((await http('', '/inventory/conditions')).status).toBe(401)
    expect((await http(f.tokens.noPermission, '/inventory/conditions')).status).toBe(403)
    expect((await http(f.tokens.viewer, '/inventory/conditions', 'POST', body)).status).toBe(403)
    expect((await http(f.tokens.foreign, '/inventory/conditions', 'POST', body)).status).toBe(403)
    expect((await http(f.tokens.unassigned, '/inventory/conditions')).data).toEqual([])
    expect((await http(f.tokens.foreign, `/inventory/conditions?warehouse=${x.warehouse.id}`)).status).toBe(403)
    expect((await http(f.tokens.foreign, `/inventory/conditions/serials?warehouse=${x.warehouse.id}&product=${x.product.id}&condition=AVAILABLE`)).status).toBe(403)
    const created = await http(f.tokens.operator, '/inventory/conditions', 'POST', body); expect(created.status).toBe(201)
    expect((await http(f.tokens.operator, `/inventory/conditions/history?product=${x.product.id}`)).data[0].id).toBe(created.data.id)
    expect((await http(f.tokens.foreign, `/inventory/conditions/history?product=${x.product.id}`)).data).toEqual([])
    expect((await http(f.tokens.viewer, `/inventory/conditions?product=${x.product.id}&condition=QUARANTINE`)).data[0]).toMatchObject({ quantity: 5, availableQuantity: 4, quarantineQuantity: 1 })
    expect((await http(f.tokens.operator, '/inventory/conditions', 'POST', body)).status).toBe(409)
    expect((await http(f.tokens.operator, '/inventory/conditions', 'POST', { ...body, toCondition: 'RETURN_PENDING' })).status).toBe(400)
    const serials = await http(f.tokens.operator, `/inventory/conditions/serials?warehouse=${x.warehouse.id}&product=${x.product.id}&condition=QUARANTINE`)
    expect(serials.data.map(s => s.id)).toEqual([x.serials[0].id])
  })
  it('revoked assignments and permissions apply on the next request with the same token', async () => {
    const x = await fixture(), body = await input(x)
    await db.userWarehouse.deleteMany({ where: { userId: f.users.operator.id } })
    expect((await http(f.tokens.operator, '/inventory/conditions', 'POST', body)).status).toBe(403)
    expect((await http(f.tokens.operator, '/inventory/conditions/history')).data).toEqual([])
    await db.userWarehouse.create({ data: { userId: f.users.operator.id, warehouseId: x.warehouse.id } })
    const permission = await db.permission.findUnique({ where: { module_action: { module: 'inventory', action: 'EDIT' } } })
    await db.rolePermission.delete({ where: { roleId_permissionId: { roleId: f.users.operator.roleId, permissionId: permission.id } } })
    expect((await http(f.tokens.operator, '/inventory/conditions', 'POST', body)).status).toBe(403)
  })
  it('database constraints reject negative, excessive or unbacked condition quantities', async () => {
    const x = await fixture(), before = await x.stock()
    for (const patch of [{ quarantineQuantity: -1 }, { defectiveQuantity: 1 }, { reservedQuantity: 6 }, { reservedQuantity: 3, quarantineQuantity: 2, forRepairQuantity: 2 }]) await expect(db.warehouseStock.update({ where: { id: before.id }, data: patch })).rejects.toThrow()
    expect(await x.stock()).toEqual(before)
  })
})
