import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import bcrypt from 'bcrypt'

describe.skipIf(!process.env.TEST_DATABASE_URL)('inventory reservations with isolated MySQL', () => {
  let db, service, inventory, server, origin, user, category, brand, sequence = 0
  const suffix = Date.now().toString(36)
  beforeAll(async () => {
    if (!/^techstock_test_warehouse_[a-z0-9_]+$/.test(new URL(process.env.TEST_DATABASE_URL).pathname.slice(1))) throw new Error('Unsafe test schema.')
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
    db = (await import('../src/config/prisma.js')).prisma
    service = await import('../src/services/reservationService.js'); inventory = await import('../src/services/inventoryService.js')
    const role = await db.role.create({ data: { name: `Reservation Operator ${suffix}` } })
    for (const action of ['VIEW', 'CREATE']) {
      const permission = await db.permission.findUnique({ where: { module_action: { module: 'reservations', action } } })
      await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } })
    }
    user = await db.user.create({ data: { firstName: 'Reserver', lastName: 'Test', email: `reserve-${suffix}@reservation.test`, passwordHash: await bcrypt.hash('ReservationTest123!', 4), roleId: role.id } })
    category = await db.category.create({ data: { name: `Reservation category ${suffix}`, slug: `reservation-category-${suffix}` } })
    brand = await db.brand.create({ data: { name: `Reservation brand ${suffix}`, slug: `reservation-brand-${suffix}` } })
    const { app } = await import('../src/app.js'); server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); origin = `http://127.0.0.1:${server.address().port}`
  }, 30000)
  afterAll(async () => { if (server) await new Promise(resolve => server.close(resolve)); if (db) await db.$disconnect() })
  async function fixture(serialized = false) {
    const key = `${suffix}-${++sequence}`
    const warehouse = await db.warehouse.create({ data: { name: `Reservation warehouse ${key}`, code: `RSV-${key}` } })
    const product = await db.product.create({ data: { name: 'Reservation test product', sku: `RSV-PRODUCT-${key}`, categoryId: category.id, brandId: brand.id, trackSerialNumbers: serialized } })
    const stock = await db.warehouseStock.create({ data: { productId: product.id, warehouseId: warehouse.id, quantity: 5, reservedQuantity: serialized ? 0 : 1 } })
    const serials = serialized ? await Promise.all(Array.from({ length: 5 }, (_, index) => db.serialNumber.create({ data: { productId: product.id, warehouseId: warehouse.id, serialNumber: `RSV-SERIAL-${key}-${index}` } }))) : []
    return { warehouse, product, stock, serials, req: { user: { id: user.id, role: 'Reservation Operator', warehouseIds: [warehouse.id] }, get: () => null } }
  }
  const reserve = (f, quantity, extra = {}) => service.createReservation({ warehouseId: f.warehouse.id, referenceType: 'Project', referenceId: 'Integration test', items: [{ productId: f.product.id, quantity }], ...extra }, f.req)
  const balance = f => db.warehouseStock.findUnique({ where: { id: f.stock.id } })
  const item = async record => (await service.reservationItems(record.id, { limit: 100 }, { role: 'Administrator' })).data[0]
  async function fulfill(f, record, quantity, extra = {}) { const line = await item(record); return service.fulfillReservation(record.id, { items: [{ id: line.id, quantity, expectedFulfilledQuantity: line.fulfilledQuantity, ...extra }] }, f.req) }
  const request = async (token, path, method = 'GET', body) => { const response = await fetch(`${origin}/api${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: response.status, ...(await response.json()) } }

  it('reserves availability, records hold movement, rejects over-reserving and releases only its own hold', async () => {
    const f = await fixture(); const record = await reserve(f, 3)
    expect(record.reservationNumber).toMatch(/^RSV-\d{4}-\d{5}$/); expect(await balance(f)).toMatchObject({ quantity: 5, reservedQuantity: 4 })
    const available = await service.reservationAvailability({ warehouse: f.warehouse.id }, f.req.user); expect(available.data[0].availableQuantity).toBe(1)
    await expect(reserve(f, 2)).rejects.toMatchObject({ status: 409 }); expect(await db.inventoryReservation.count({ where: { warehouseId: f.warehouse.id } })).toBe(1)
    await service.releaseReservation(record.id, f.req); expect(await balance(f)).toMatchObject({ quantity: 5, reservedQuantity: 1 })
    await expect(service.releaseReservation(record.id, f.req)).rejects.toMatchObject({ status: 409 })
    const movements = await db.stockMovement.findMany({ where: { referenceNumber: record.reservationNumber }, orderBy: { createdAt: 'asc' } })
    expect(movements.map(row => row.type)).toEqual(['RESERVATION_CREATED', 'RESERVATION_RELEASED']); expect(movements[0]).toMatchObject({ quantity: 0, previousReservedQuantity: 1, newReservedQuantity: 4 })
  })
  it('issues a partial reservation and releases the remaining balance without undoing fulfillment', async () => {
    const f = await fixture(); const record = await reserve(f, 4); const line = await item(record)
    await fulfill(f, record, 2); expect(await balance(f)).toMatchObject({ quantity: 3, reservedQuantity: 3 })
    expect((await service.getReservation(record.id, f.req.user)).status).toBe('ACTIVE')
    await expect(service.fulfillReservation(record.id, { items: [{ id: line.id, quantity: 2, expectedFulfilledQuantity: 0 }] }, f.req)).rejects.toMatchObject({ status: 409 })
    await service.releaseReservation(record.id, f.req, 'CANCELLED'); expect(await balance(f)).toMatchObject({ quantity: 3, reservedQuantity: 1 }); expect((await item(record)).fulfilledQuantity).toBe(2)
    expect(await db.stockMovement.count({ where: { referenceNumber: record.reservationNumber, type: 'STOCK_OUT', quantity: -2 } })).toBe(1)
  })
  it('fulfills fully once and rejects duplicate fulfillment', async () => {
    const f = await fixture(); const record = await reserve(f, 3); await fulfill(f, record, 3)
    expect((await service.getReservation(record.id, f.req.user)).status).toBe('FULFILLED'); expect(await balance(f)).toMatchObject({ quantity: 2, reservedQuantity: 1 })
    await expect(fulfill(f, record, 1)).rejects.toMatchObject({ status: 409 }); await expect(service.releaseReservation(record.id, f.req)).rejects.toMatchObject({ status: 409 })
  })
  it('expires a hold once and rejects fulfillment after expiry', async () => {
    const f = await fixture(); await expect(reserve(f, 1, { expiresAt: '2000-01-01T00:00:00Z' })).rejects.toMatchObject({ status: 400 })
    const record = await reserve(f, 2, { expiresAt: new Date(Date.now() + 60000).toISOString() })
    const past = new Date(Date.now() - 1000); await db.inventoryReservation.update({ where: { id: record.id }, data: { expiresAt: past } })
    await expect(fulfill(f, record, 1)).rejects.toMatchObject({ status: 409 }); await service.expireReservations(); expect(await balance(f)).toMatchObject({ quantity: 5, reservedQuantity: 1 })
    expect((await service.getReservation(record.id, f.req.user)).status).toBe('EXPIRED'); await service.expireReservations(); expect(await db.stockMovement.count({ where: { referenceNumber: record.reservationNumber, type: 'RESERVATION_EXPIRED' } })).toBe(1)
  })
  it('reserves exact or automatically selected serials and protects them from independent status changes', async () => {
    const f = await fixture(true); const exact = f.serials.slice(0, 2).map(serial => serial.serialNumber)
    const record = await reserve(f, 2, { items: [{ productId: f.product.id, quantity: 2, serialNumbers: exact }] })
    expect((await item(record)).serials.map(selection => selection.serial.serialNumber).sort()).toEqual(exact.sort())
    await expect(inventory.changeSerialStatus(f.serials[0].id, 'AVAILABLE', f.req)).rejects.toMatchObject({ status: 409 })
    await expect(reserve(f, 1, { items: [{ productId: f.product.id, quantity: 1, serialNumbers: [exact[0]] }] })).rejects.toMatchObject({ status: 409 })
    await fulfill(f, record, 1, { serialNumbers: [exact[1]] }); expect((await db.serialNumber.findUnique({ where: { serialNumber: exact[1] } })).status).toBe('ISSUED')
    await service.releaseReservation(record.id, f.req); expect((await db.serialNumber.findUnique({ where: { serialNumber: exact[0] } })).status).toBe('AVAILABLE')
    expect(await balance(f)).toMatchObject({ quantity: 4, reservedQuantity: 0 })
    const automatic = await reserve(f, 2); expect((await item(automatic)).serials).toHaveLength(2); await service.releaseReservation(automatic.id, f.req)
  })
  it('serial expiry releases exact serials without changing physical quantity', async () => {
    const f = await fixture(true); const record = await reserve(f, 2, { expiresAt: new Date(Date.now() + 60000).toISOString() })
    await db.inventoryReservation.update({ where: { id: record.id }, data: { expiresAt: new Date(Date.now() - 1) } }); await service.expireReservations()
    expect(await db.serialNumber.count({ where: { warehouseId: f.warehouse.id, status: 'AVAILABLE' } })).toBe(5); expect(await balance(f)).toMatchObject({ quantity: 5, reservedQuantity: 0 })
  })
  it('allows only one competing reservation for the last available units', async () => {
    const f = await fixture(); const results = await Promise.allSettled([reserve(f, 4), reserve(f, 4)])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1); expect(await balance(f)).toMatchObject({ quantity: 5, reservedQuantity: 5 })
  })
  it('rolls back multi-item reservations and fulfillment races do not double issue', async () => {
    const f = await fixture(); await expect(reserve(f, 1, { items: [{ productId: f.product.id, quantity: 1 }, { productId: 'nonexistent-product', quantity: 1 }] })).rejects.toMatchObject({ status: 400 })
    expect((await balance(f)).reservedQuantity).toBe(1)
    const record = await reserve(f, 4), line = await item(record), body = { items: [{ id: line.id, quantity: 2, expectedFulfilledQuantity: 0 }] }
    const results = await Promise.allSettled([service.fulfillReservation(record.id, body, f.req), service.fulfillReservation(record.id, body, f.req)])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1); expect(await balance(f)).toMatchObject({ quantity: 3, reservedQuantity: 3 })
  })
  it('enforces HTTP warehouse scope, permissions and validation', async () => {
    const own = await fixture(), foreign = await fixture(); await db.userWarehouse.create({ data: { userId: user.id, warehouseId: own.warehouse.id, isDefault: true } })
    const record = await reserve(foreign, 1), ownRecord = await reserve(own, 1)
    const login = await request('', '/auth/login', 'POST', { email: user.email, password: 'ReservationTest123!' }), token = login.data.accessToken
    expect((await request(token, `/reservations/${ownRecord.id}`)).status).toBe(200)
    for (const path of [`/reservations/${record.id}`, `/reservations/${record.id}/items`, `/reservations?warehouse=${foreign.warehouse.id}`, `/reservations/availability?warehouse=${foreign.warehouse.id}`]) expect((await request(token, path)).status).toBe(403)
    for (const event of ['release', 'cancel', 'fulfill']) expect((await request(token, `/reservations/${ownRecord.id}/${event}`, 'POST', { items: [] })).status).toBe(403)
    expect((await request(token, '/reservations', 'POST', { warehouseId: own.warehouse.id, items: [{ productId: own.product.id, quantity: 0 }] })).status).toBe(400)
    expect((await request(token, '/reservations?status=INVALID')).status).toBe(400)
    expect((await request(token, '/reservations/availability')).status).toBe(400)
  })
})
