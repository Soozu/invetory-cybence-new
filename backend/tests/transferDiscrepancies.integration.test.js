import { testAccessToken } from './sessionFixture.js'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'

describe.skipIf(!process.env.TEST_DATABASE_URL)('transfer discrepancies with isolated MySQL', () => {
  let db, transfers, receipts, validators, f, server, origin
  const suffix = Date.now().toString(36)
  const call = async (token, path, body) => {
    const response = await fetch(`${origin}/api${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) })
    return { status: response.status, ...(await response.json()) }
  }
  beforeAll(async () => {
    if (!/^techstock_test_warehouse_[a-z0-9_]+$/.test(new URL(process.env.TEST_DATABASE_URL).pathname.slice(1))) throw Error('Unsafe test schema')
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
    db = (await import('../src/config/prisma.js')).prisma
    transfers = await import('../src/services/transferService.js'); receipts = await import('../src/services/transferReceiptService.js'); validators = await import('../src/validators/transfers.js')
    const warehouses = await Promise.all(['A', 'B', 'C'].map(code => db.warehouse.create({ data: { name: `Discrepancy ${code} ${suffix}`, code: `TD-${code}-${suffix}` } })))
    const category = await db.category.create({ data: { name: `TD ${suffix}`, slug: `td-${suffix}` } }), brand = await db.brand.create({ data: { name: `TD ${suffix}`, slug: `td-${suffix}` } })
    const users = {}, tokens = {}, { env } = await import('../src/config/env.js')
    for (const [name, indexes, permissions] of [['source', [0], ['VIEW', 'EDIT']], ['receiver', [1], ['VIEW', 'EDIT']], ['approver', [1], ['VIEW', 'EDIT', 'APPROVE']], ['outsider', [2], ['VIEW', 'EDIT', 'APPROVE']], ['reader', [1], ['VIEW']]]) {
      const role = await db.role.create({ data: { name: `TD ${name} ${suffix}` } })
      for (const action of permissions) { const p = await db.permission.upsert({ where: { module_action: { module: 'inventory', action } }, create: { module: 'inventory', action }, update: {} }); await db.rolePermission.create({ data: { roleId: role.id, permissionId: p.id } }) }
      users[name] = await db.user.create({ data: { firstName: name, lastName: 'TD', email: `td-${name}-${suffix}@test.invalid`, passwordHash: 'unused', roleId: role.id, warehouseAssignments: { create: indexes.map(index => ({ warehouseId: warehouses[index].id })) } } })
      tokens[name] = await testAccessToken(db,users[name].id,env.accessSecret)
    }
    const { app } = await import('../src/app.js'); server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); origin = `http://127.0.0.1:${server.address().port}`
    f = { a: warehouses[0], b: warehouses[1], c: warehouses[2], category, brand, users, tokens, req: { user: { id: users.approver.id, role: 'Administrator' }, get: () => null } }
  }, 30000)
  afterAll(async () => { if (server) await new Promise(resolve => server.close(resolve)); if (db) await db.$disconnect() })
  let sequence = 0
  async function shipment(serialized = true, quantity = 3, extra = false) {
    const key = `${suffix}-${++sequence}`
    const product = await db.product.create({ data: { name: `TD product ${key}`, sku: `TD-${key}`, categoryId: f.category.id, brandId: f.brand.id, trackSerialNumbers: serialized } })
    await db.warehouseStock.create({ data: { productId: product.id, warehouseId: f.a.id, quantity: quantity + 2 } })
    const serials = serialized ? await Promise.all(Array.from({ length: quantity }, (_, index) => db.serialNumber.create({ data: { serialNumber: `TD-SN-${key}-${index}`, productId: product.id, warehouseId: f.a.id } }))) : []
    let second
    if (extra) { second = await db.product.create({ data: { name: `Extra ${key}`, sku: `TD-X-${key}`, categoryId: f.category.id, brandId: f.brand.id } }); await db.warehouseStock.create({ data: { productId: second.id, warehouseId: f.a.id, quantity: 2 } }) }
    const transfer = await transfers.createTransfer({ sourceWarehouseId: f.a.id, destinationWarehouseId: f.b.id, items: [{ productId: product.id, quantity }, ...(second ? [{ productId: second.id, quantity: 2 }] : [])] }, f.req)
    await transfers.transitionTransfer(transfer.id, 'submit', f.req); await transfers.transitionTransfer(transfer.id, 'approve', f.req)
    await transfers.transitionTransfer(transfer.id, 'ship', f.req, serialized ? { items: [{ id: transfer.items[0].id, serialNumbers: serials.map(row => row.serialNumber) }] } : {})
    return { transfer: await transfers.getTransfer(transfer.id, f.req.user), product, serials, line: transfer.items[0], second }
  }
  function input(s, options = {}) { return validators.transferArrivalSchema.parse({ expectedUpdatedAt: s.transfer.updatedAt.toISOString(), notes: 'Physically checked delivery', ...options }) }
  async function arrive(s, options) { s.transfer = await receipts.receiveTransfer(s.transfer.id, input(s, options), f.req); return s.transfer }
  async function resolve(s, row, action, quantity = 1, extra = {}) {
    const body = validators.transferResolutionSchema.parse({ expectedUpdatedAt: s.transfer.updatedAt.toISOString(), expectedDiscrepancyUpdatedAt: row.updatedAt.toISOString(), notes: 'Verified investigation outcome', action, quantity, ...extra })
    s.transfer = await receipts.resolveTransferDiscrepancy(s.transfer.id, row.id, body, f.req); return s.transfer
  }
  const stock = s => db.warehouseStock.findUnique({ where: { productId_warehouseId: { productId: s.product.id, warehouseId: f.b.id } } })
  it('backfills legacy completion without changing identities, quantities, timestamps or inventing receipts', async () => {
    const row = await transfers.getTransfer('test-legacy-transfer', f.req.user)
    expect(row).toMatchObject({ status: 'RECEIVED', arrivalClosedAt: null, arrivals: [], discrepancies: [] })
    expect(row.updatedAt.toISOString()).toBe('2026-09-01T12:00:00.000Z')
    expect(row.items[0]).toMatchObject({ quantity: 1, receivedQuantity: 1, lostQuantity: 0, returnedQuantity: 0 })
    expect(row.items[0].serialSelections[0]).toMatchObject({ outcome: 'RECEIVED', serialNumber: { id: 'test-legacy-serial', warehouseId: 'test-legacy-warehouse', status: 'AVAILABLE' } })
  })
  it('records partial good/damaged arrivals with exact identities and condition holds', async () => {
    const s = await shipment()
    await arrive(s, { items: [{ id: s.line.id, goodQuantity: 1, damagedQuantity: 1, goodSerials: [s.serials[0].serialNumber], damagedSerials: [s.serials[1].serialNumber] }] })
    expect(s.transfer.status).toBe('DISCREPANCY'); expect(s.transfer.items[0].receivedQuantity).toBe(2)
    expect(await stock(s)).toMatchObject({ quantity: 2, reservedQuantity: 1, quarantineQuantity: 1 })
    expect(s.transfer.items[0].serialSelections.find(row => row.serialNumberId === s.serials[1].id).serialNumber).toMatchObject({ status: 'QUARANTINE', warehouseId: f.b.id, receiptId: null, purchaseOrderItemId: null })
    expect(s.transfer.arrivals[0].lines[0]).toMatchObject({ goodSerialIds: [s.serials[0].id], damagedSerialIds: [s.serials[1].id] })
    await resolve(s, s.transfer.discrepancies[0], 'ACKNOWLEDGE_QUARANTINE')
    expect(s.transfer.status).toBe('PARTIAL'); expect(await stock(s)).toMatchObject({ quantity: 2, reservedQuantity: 1, quarantineQuantity: 1 })
    await arrive(s, { finalArrival: true, items: [{ id: s.line.id, goodQuantity: 1, goodSerials: [s.serials[2].serialNumber] }] })
    expect(s.transfer.status).toBe('RECEIVED'); expect(await stock(s)).toMatchObject({ quantity: 3, reservedQuantity: 1 })
  })
  it('closes missing cases without fabricating stock and records exact loss once', async () => {
    const s = await shipment(); await arrive(s, { finalArrival: true, items: [{ id: s.line.id, goodQuantity: 1, goodSerials: [s.serials[0].serialNumber] }] })
    expect(s.transfer.discrepancies.map(row => row.serialNumberId).sort()).toEqual(s.serials.slice(1).map(row => row.id).sort())
    const movementCount = await db.stockMovement.count({ where: { productId: s.product.id } })
    await resolve(s, s.transfer.discrepancies[0], 'MARK_LOST'); await resolve(s, s.transfer.discrepancies.find(row => row.resolvedQuantity === 0), 'MARK_LOST')
    expect(s.transfer.status).toBe('RESOLVED'); expect(s.transfer.items[0]).toMatchObject({ receivedQuantity: 1, lostQuantity: 2 })
    expect(await db.stockMovement.count({ where: { productId: s.product.id } })).toBe(movementCount)
    expect(await stock(s)).toMatchObject({ quantity: 1, reservedQuantity: 0 })
    expect(await db.serialNumber.count({ where: { id: { in: s.serials.slice(1).map(row => row.id) }, status: 'MISSING', warehouseId: null } })).toBe(2)
    const history = await call(f.tokens.source, `/serial-numbers/${s.serials[1].id}/events`)
    expect(history.status).toBe(200); expect(history.data.some(row => row.type === 'TRANSFER_LOST')).toBe(true)
    expect((await call(f.tokens.outsider, `/serial-numbers/${s.serials[1].id}/events`)).status).toBe(403)
  })
  it('recovers missing units in destination quarantine and returns found units to source quarantine', async () => {
    const s = await shipment(); await arrive(s, { finalArrival: true })
    await resolve(s, s.transfer.discrepancies[0], 'RECEIVE_LATE')
    await resolve(s, s.transfer.discrepancies.find(row => row.resolvedQuantity === 0), 'RETURN_TO_SOURCE')
    await resolve(s, s.transfer.discrepancies.find(row => row.resolvedQuantity === 0), 'MARK_LOST')
    expect(await stock(s)).toMatchObject({ quantity: 1, reservedQuantity: 1, quarantineQuantity: 1 })
    expect(await db.warehouseStock.findUnique({ where: { productId_warehouseId: { productId: s.product.id, warehouseId: f.a.id } } })).toMatchObject({ quantity: 3, reservedQuantity: 1, quarantineQuantity: 1 })
    expect(s.transfer.items[0]).toMatchObject({ receivedQuantity: 1, returnedQuantity: 1, lostQuantity: 1 }); expect(s.transfer.status).toBe('RESOLVED')
  })
  it('supports partial nonserialized missing resolution and conserves accounted quantities', async () => {
    const s = await shipment(false, 4); await arrive(s, { finalArrival: true, items: [{ id: s.line.id, goodQuantity: 1 }] })
    await resolve(s, s.transfer.discrepancies[0], 'INVESTIGATE', 0)
    expect(s.transfer.discrepancies[0].resolvedQuantity).toBe(0)
    await resolve(s, s.transfer.discrepancies[0], 'RECEIVE_LATE', 2, { condition: 'AVAILABLE' })
    expect(s.transfer.discrepancies[0].resolvedQuantity).toBe(2); expect(s.transfer.status).toBe('DISCREPANCY')
    await resolve(s, s.transfer.discrepancies[0], 'MARK_LOST', 1)
    expect(await stock(s)).toMatchObject({ quantity: 3, reservedQuantity: 0 }); expect(s.transfer.status).toBe('RESOLVED')
    expect(s.transfer.discrepancies[0].resolutions).toHaveLength(3)
  })
  it('retains unknown and foreign serial observations without creating or moving inventory', async () => {
    const s = await shipment(true, 1), foreign = await shipment(true, 1)
    await arrive(s, { unexpected: [{ id: s.line.id, quantity: 1, serialNumber: 'UNREGISTERED-OBSERVATION', notes: 'Box contains an unknown unit' }, { id: s.line.id, quantity: 1, serialNumber: foreign.serials[0].serialNumber, notes: 'Label belongs to another shipment' }] })
    expect(await stock(s)).toBeNull(); expect(await db.serialNumber.count({ where: { serialNumber: 'UNREGISTERED-OBSERVATION' } })).toBe(0)
    expect(await db.serialNumber.findUnique({ where: { id: foreign.serials[0].id } })).toMatchObject({ status: 'RESERVED', warehouseId: null })
    await resolve(s, s.transfer.discrepancies[0], 'RETURN_UNEXPECTED'); await resolve(s, s.transfer.discrepancies.find(row => row.resolvedQuantity === 0), 'DOCUMENT_DISPOSITION')
    expect(await stock(s)).toBeNull(); expect(s.transfer.status).toBe('PARTIAL')
  })
  it('preserves purchase receipt/supplier/warranty relationships through damage and inspected clearance', async () => {
    const procurement = await import('../src/services/procurementService.js'), conditions = await import('../src/services/stockConditionService.js')
    const supplier = await db.supplier.create({ data: { companyName: `TD supplier ${suffix}`, supplierCode: `TD-SUP-${suffix}` } })
    const product = await db.product.create({ data: { name: 'TD provenance', sku: `TD-PROV-${suffix}`, categoryId: f.category.id, brandId: f.brand.id, trackSerialNumbers: true, warrantyMonths: 24 } })
    const order = await procurement.createOrder({ supplierId: supplier.id, warehouseId: f.a.id, tax: 0, shipping: 0, items: [{ productId: product.id, quantity: 1, unitCost: 20 }] }, f.req)
    await procurement.transitionOrder(order.id, 'submit', f.req); await procurement.transitionOrder(order.id, 'approve', f.req)
    await procurement.receiveOrder(order.id, { items: [{ purchaseOrderItemId: order.items[0].id, quantity: 1, serialNumbers: [`TD-PROV-SN-${suffix}`] }] }, f.req)
    const serial = await db.serialNumber.findUnique({ where: { serialNumber: `TD-PROV-SN-${suffix}` } })
    const transfer = await transfers.createTransfer({ sourceWarehouseId: f.a.id, destinationWarehouseId: f.b.id, items: [{ productId: product.id, quantity: 1 }] }, f.req)
    await transfers.transitionTransfer(transfer.id, 'submit', f.req); await transfers.transitionTransfer(transfer.id, 'approve', f.req); await transfers.transitionTransfer(transfer.id, 'ship', f.req, { items: [{ id: transfer.items[0].id, serialNumbers: [serial.serialNumber] }] })
    const s = { transfer: await transfers.getTransfer(transfer.id, f.req.user), product, line: transfer.items[0] }
    await arrive(s, { finalArrival: true, items: [{ id: s.line.id, damagedQuantity: 1, damagedSerials: [serial.serialNumber] }] })
    await resolve(s, s.transfer.discrepancies[0], 'ACKNOWLEDGE_QUARANTINE')
    const held = await stock(s)
    await conditions.changeCondition({ productId: product.id, warehouseId: f.b.id, expectedUpdatedAt: held.updatedAt.toISOString(), fromCondition: 'QUARANTINE', toCondition: 'AVAILABLE', quantity: 1, serialNumberIds: [serial.id], reason: 'Inspection confirms no functional damage' }, f.req)
    const cleared = await db.serialNumber.findUnique({ where: { id: serial.id } })
    for (const key of ['receiptId', 'purchaseOrderItemId', 'supplierId', 'warrantyStart', 'warrantyEnd']) expect(cleared[key]).toEqual(serial[key])
    expect(cleared).toMatchObject({ status: 'AVAILABLE', warehouseId: f.b.id }); expect(await stock(s)).toMatchObject({ quantity: 1, reservedQuantity: 0, quarantineQuantity: 0 })
    expect(await db.activityLog.count({ where: { entityId: s.transfer.id } })).toBeGreaterThanOrEqual(5)
  })
  it('rejects wrong identities, duplicate identities and serial quantity mismatches atomically', async () => {
    for (const option of ['wrong', 'duplicate', 'mismatch', 'overlap']) {
      const s = await shipment(); const values = option === 'wrong' ? ['WRONG-SERIAL'] : option === 'duplicate' ? [s.serials[0].serialNumber, s.serials[0].serialNumber] : option === 'mismatch' ? [] : [s.serials[0].serialNumber]
      await expect(arrive(s, { items: [{ id: s.line.id, goodQuantity: option === 'duplicate' ? 2 : 1, goodSerials: values, ...(option === 'overlap' ? { damagedQuantity: 1, damagedSerials: values } : {}) }] })).rejects.toHaveProperty('status')
      expect(await stock(s)).toBeNull(); expect(await db.transferArrival.count({ where: { transferId: s.transfer.id } })).toBe(0)
    }
  })
  it('rejects overreceipt and rolls back earlier lines if a later serial changed', async () => {
    const s = await shipment(true, 2, true)
    await expect(arrive(s, { items: [{ id: s.line.id, goodQuantity: 3, goodSerials: s.serials.map(row => row.serialNumber) }] })).rejects.toMatchObject({ status: 400 })
    await db.serialNumber.update({ where: { id: s.serials[0].id }, data: { status: 'MISSING' } })
    await expect(arrive(s, { items: [{ id: s.transfer.items[1].id, goodQuantity: 1 }, { id: s.line.id, goodQuantity: 1, goodSerials: [s.serials[0].serialNumber] }] })).rejects.toMatchObject({ status: 409 })
    expect(await db.warehouseStock.findUnique({ where: { productId_warehouseId: { productId: s.second.id, warehouseId: f.b.id } } })).toBeNull()
    expect(await db.transferArrival.count({ where: { transferId: s.transfer.id } })).toBe(0)
  })
  it('serializes competing receipt requests and rejects stale/repeated serial arrivals', async () => {
    const s = await shipment(true, 1), body = input(s, { items: [{ id: s.line.id, goodQuantity: 1, goodSerials: [s.serials[0].serialNumber] }] })
    const results = await Promise.allSettled([receipts.receiveTransfer(s.transfer.id, body, f.req), receipts.receiveTransfer(s.transfer.id, body, f.req)])
    expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1); expect(results.find(row => row.status === 'rejected').reason.status).toBe(409)
    expect(await stock(s)).toMatchObject({ quantity: 1 }); expect(await db.transferArrival.count({ where: { transferId: s.transfer.id } })).toBe(1)
    await expect(receipts.receiveTransfer(s.transfer.id, body, f.req)).rejects.toMatchObject({ status: 409 })
  })
  it('does not absorb a legacy in-transit identity owned by an asset', async () => {
    const s = await shipment(true, 1)
    await db.asset.create({ data: { assetTag: `TD-LEGACY-AST-${suffix}`, productId: s.product.id, warehouseId: f.a.id, serialNumberId: s.serials[0].id } })
    await expect(arrive(s, { items: [{ id: s.line.id, goodQuantity: 1, goodSerials: [s.serials[0].serialNumber] }] })).rejects.toMatchObject({ status: 409 })
    expect(await stock(s)).toBeNull()
    await arrive(s, { finalArrival: true })
    await expect(resolve(s, s.transfer.discrepancies[0], 'MARK_LOST')).rejects.toMatchObject({ status: 409 })
    expect(s.transfer.discrepancies[0].resolvedQuantity).toBe(0)
  })
  it('serializes competing recovery/loss requests with one resolution and no double stock', async () => {
    const s = await shipment(true, 1); await arrive(s, { finalArrival: true }); const row = s.transfer.discrepancies[0]
    const base = { expectedUpdatedAt: s.transfer.updatedAt.toISOString(), expectedDiscrepancyUpdatedAt: row.updatedAt.toISOString(), quantity: 1, notes: 'Concurrent documented outcome' }
    const results = await Promise.allSettled(['RECEIVE_LATE', 'MARK_LOST'].map(action => receipts.resolveTransferDiscrepancy(s.transfer.id, row.id, validators.transferResolutionSchema.parse({ ...base, action }), f.req)))
    expect(results.filter(value => value.status === 'fulfilled')).toHaveLength(1)
    expect(await db.transferDiscrepancyResolution.count({ where: { discrepancyId: row.id } })).toBe(1)
    const final = await transfers.getTransfer(s.transfer.id, f.req.user); expect(final.items[0].receivedQuantity + final.items[0].lostQuantity).toBe(1)
    expect((await stock(s))?.quantity || 0).toBe(final.items[0].receivedQuantity)
  })
  it('rejects stale discrepancy versions, invalid actions and overresolution', async () => {
    const s = await shipment(false, 2); await arrive(s, { finalArrival: true }); const row = s.transfer.discrepancies[0]
    await resolve(s, row, 'INVESTIGATE', 0)
    await expect(resolve(s, row, 'MARK_LOST')).rejects.toMatchObject({ status: 409 })
    await expect(resolve(s, s.transfer.discrepancies[0], 'ACKNOWLEDGE_QUARANTINE')).rejects.toMatchObject({ status: 400 })
    await expect(resolve(s, s.transfer.discrepancies[0], 'MARK_LOST', 3)).rejects.toMatchObject({ status: 400 })
    expect(s.transfer.discrepancies[0].resolvedQuantity).toBe(0)
  })
  it('blocks legacy receiving after partial arrival/final closure and repeated resolved actions', async () => {
    const s = await shipment(false, 2); await arrive(s, { items: [{ id: s.line.id, goodQuantity: 1 }] })
    await expect(transfers.transitionTransfer(s.transfer.id, 'receive', f.req)).rejects.toMatchObject({ status: 409 })
    await arrive(s, { finalArrival: true })
    await expect(arrive(s, { items: [{ id: s.line.id, goodQuantity: 1 }] })).rejects.toMatchObject({ status: 409 })
    await resolve(s, s.transfer.discrepancies[0], 'MARK_LOST')
    await expect(resolve(s, s.transfer.discrepancies[0], 'MARK_LOST')).rejects.toMatchObject({ status: 409 })
  })
  it('enforces receive/approve permissions and source/destination warehouse scope on HTTP requests', async () => {
    const s = await shipment(false, 2), path = `/transfers/${s.transfer.id}`
    for (const user of ['source', 'outsider', 'reader']) expect((await call(f.tokens[user], `${path}/arrivals`, input(s, { finalArrival: true }))).status).toBe(403)
    expect((await call(f.tokens.outsider, path)).status).toBe(403)
    const result = await call(f.tokens.receiver, `${path}/arrivals`, input(s, { finalArrival: true })); expect(result.status).toBe(201)
    s.transfer = await transfers.getTransfer(s.transfer.id, f.req.user); const row = s.transfer.discrepancies[0]
    const body = validators.transferResolutionSchema.parse({ expectedUpdatedAt: s.transfer.updatedAt.toISOString(), expectedDiscrepancyUpdatedAt: row.updatedAt.toISOString(), action: 'MARK_LOST', quantity: 1, notes: 'Inspected loss evidence' })
    expect((await call(f.tokens.receiver, `${path}/discrepancies/${row.id}/resolve`, body)).status).toBe(403)
    expect((await call(f.tokens.source, `${path}/discrepancies/${row.id}/investigate`, { ...body, action: 'INVESTIGATE', quantity: 0 })).status).toBe(200)
    s.transfer = await transfers.getTransfer(s.transfer.id, f.req.user); const fresh = s.transfer.discrepancies[0]
    const rebased = { ...body, expectedUpdatedAt: s.transfer.updatedAt.toISOString(), expectedDiscrepancyUpdatedAt: fresh.updatedAt.toISOString() }
    expect((await call(f.tokens.approver, `${path}/discrepancies/${row.id}/resolve`, { ...rebased, action: 'RETURN_TO_SOURCE' })).status).toBe(403)
    expect((await call(f.tokens.approver, `${path}/discrepancies/${row.id}/investigate`, rebased)).status).toBe(400)
    expect((await call(f.tokens.approver, `${path}/discrepancies/${row.id}/resolve`, rebased)).status).toBe(200)
  })
  it('rechecks live assignments and permissions without trusting existing JWTs', async () => {
    const s = await shipment(false, 1), user = f.users.receiver
    await db.userWarehouse.deleteMany({ where: { userId: user.id } })
    expect((await call(f.tokens.receiver, `/transfers/${s.transfer.id}/arrivals`, input(s, { finalArrival: true }))).status).toBe(403)
    await db.userWarehouse.create({ data: { userId: user.id, warehouseId: f.b.id } })
    const permission = await db.permission.findUnique({ where: { module_action: { module: 'inventory', action: 'EDIT' } } })
    await db.rolePermission.deleteMany({ where: { roleId: user.roleId, permissionId: permission.id } })
    expect((await call(f.tokens.receiver, `/transfers/${s.transfer.id}/arrivals`, input(s, { finalArrival: true }))).status).toBe(403)
    await db.rolePermission.create({ data: { roleId: user.roleId, permissionId: permission.id } })
  })
  it('rejects inactive warehouse arrivals without creating ledger or stock', async () => {
    const s = await shipment(false, 1); await db.warehouse.update({ where: { id: f.b.id }, data: { status: 'INACTIVE' } })
    try { await expect(arrive(s, { items: [{ id: s.line.id, goodQuantity: 1 }] })).rejects.toMatchObject({ status: 404 }); expect(await stock(s)).toBeNull() }
    finally { await db.warehouse.update({ where: { id: f.b.id }, data: { status: 'ACTIVE' } }) }
  })
  it('does not ship classified unavailable or asset-owned serial stock', async () => {
    const s = await shipment(true, 1)
    const serial = await db.serialNumber.create({ data: { serialNumber: `TD-HELD-${suffix}`, productId: s.product.id, warehouseId: f.a.id, status: 'QUARANTINE' } })
    await db.warehouseStock.update({ where: { productId_warehouseId: { productId: s.product.id, warehouseId: f.a.id } }, data: { reservedQuantity: 1, quarantineQuantity: 1 } })
    const draft = await transfers.createTransfer({ sourceWarehouseId: f.a.id, destinationWarehouseId: f.b.id, items: [{ productId: s.product.id, quantity: 1 }] }, f.req)
    await transfers.transitionTransfer(draft.id, 'submit', f.req); await transfers.transitionTransfer(draft.id, 'approve', f.req)
    await expect(transfers.transitionTransfer(draft.id, 'ship', f.req, { items: [{ id: draft.items[0].id, serialNumbers: [serial.serialNumber] }] })).rejects.toMatchObject({ status: 400 })
    await db.serialNumber.update({ where: { id: serial.id }, data: { status: 'AVAILABLE' } }); await db.asset.create({ data: { assetTag: `TD-AST-${suffix}`, productId: s.product.id, warehouseId: f.a.id, serialNumberId: serial.id } })
    await expect(transfers.transitionTransfer(draft.id, 'ship', f.req, { items: [{ id: draft.items[0].id, serialNumbers: [serial.serialNumber] }] })).rejects.toMatchObject({ status: 400 })
  })
  it('validates versions, negative quantities and investigation endpoint bypasses', async () => {
    const s = await shipment(false, 1)
    expect((await call(f.tokens.receiver, `/transfers/${s.transfer.id}/arrivals`, { notes: 'No version', items: [] })).status).toBe(400)
    expect((await call(f.tokens.receiver, `/transfers/${s.transfer.id}/arrivals`, { ...input(s), items: [{ id: s.line.id, goodQuantity: -1 }] })).status).toBe(400)
    await expect(arrive(s, {})).rejects.toMatchObject({ status: 400 })
    await expect(arrive(s, { unexpected: [{ id: s.line.id, quantity: 1, serialNumber: 'DOUBLE', notes: 'First box' }, { id: s.line.id, quantity: 1, serialNumber: 'DOUBLE', notes: 'Same box' }] })).rejects.toMatchObject({ status: 400 })
  })
})
