import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import bcrypt from 'bcrypt'

describe.skipIf(!process.env.TEST_DATABASE_URL)('physical stock counts with isolated MySQL', () => {
  let db, service, server, origin, user, category, brand, foreignWarehouse, serialProduct, sequence = 0
  const suffix = Date.now().toString(36)
  const identity = warehouse => ({ user: { id: user.id, role: 'Count Operator', warehouseIds: [warehouse.id] }, get: () => null })
  const http = async (token, path, method = 'GET', body) => {
    const response = await fetch(`${origin}/api${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
    return { status: response.status, ...(await response.json()) }
  }
  beforeAll(async () => {
    if (!/^techstock_test_warehouse_[a-z0-9_]+$/.test(new URL(process.env.TEST_DATABASE_URL).pathname.slice(1))) throw new Error('Unsafe test schema.')
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
    db = (await import('../src/config/prisma.js')).prisma
    service = await import('../src/services/stockCountService.js')
    const role = await db.role.create({ data: { name: `Count Operator ${suffix}` } })
    for (const action of ['VIEW', 'CREATE', 'EDIT']) {
      const permission = await db.permission.findUnique({ where: { module_action: { module: 'stock_counts', action } } })
      await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } })
    }
    user = await db.user.create({ data: { firstName: 'Counter', lastName: 'Test', email: `count-${suffix}@count.test`, passwordHash: await bcrypt.hash('CountTest123!', 4), roleId: role.id } })
    category = await db.category.create({ data: { name: `Count category ${suffix}`, slug: `count-category-${suffix}` } })
    brand = await db.brand.create({ data: { name: `Count brand ${suffix}`, slug: `count-brand-${suffix}` } })
    serialProduct = await db.product.create({ data: { name: 'Count serialized test', sku: `COUNT-SERIAL-${suffix}`, categoryId: category.id, brandId: brand.id, trackSerialNumbers: true } })
    foreignWarehouse = await db.warehouse.create({ data: { name: `Foreign count ${suffix}`, code: `FOREIGN-COUNT-${suffix}` } })
    const { app } = await import('../src/app.js')
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); origin = `http://127.0.0.1:${server.address().port}`
  }, 30000)
  afterAll(async () => { if (server) await new Promise(resolve => server.close(resolve)); if (db) await db.$disconnect() })
  async function fixture({ quantity = 10, reservedQuantity = 0, serials = [] } = {}) {
    const key = `${suffix}-${++sequence}`
    const warehouse = await db.warehouse.create({ data: { name: `Count warehouse ${key}`, code: `COUNT-${key}` } })
    const product = await db.product.create({ data: { name: 'Count cable test', sku: `COUNT-CABLE-${key}`, categoryId: category.id, brandId: brand.id } })
    const stock = await db.warehouseStock.create({ data: { productId: product.id, warehouseId: warehouse.id, quantity, reservedQuantity } })
    if (serials.length) {
      await db.warehouseStock.create({ data: { productId: serialProduct.id, warehouseId: warehouse.id, quantity: serials.length, reservedQuantity: serials.filter(s => s.status && s.status !== 'AVAILABLE').length } })
      for (const serial of serials) await db.serialNumber.create({ data: { productId: serialProduct.id, warehouseId: warehouse.id, ...serial } })
    }
    const req = identity(warehouse)
    const count = await service.createCount({ warehouseId: warehouse.id, notes: 'Integration count' }, req)
    await service.startCount(count.id, req)
    const items = await db.stockCountItem.findMany({ where: { stockCountId: count.id }, include: { serials: true, product: true } })
    return { warehouse, product, stock, req, count, items }
  }
  async function record(f, quantity, serials) {
    const items = f.items.map(item => ({ id: item.id, countedQuantity: item.productId === f.product.id ? quantity : item.expectedQuantity,
      serialNumbers: item.product.trackSerialNumbers ? item.serials.map(s => s.serialNumber) : [] }))
    if (serials !== undefined) { const item = items.find(i => f.items.find(row => row.id === i.id).productId === serialProduct.id); item.serialNumbers = serials; item.countedQuantity = serials.length }
    for (let start = 0; start < items.length; start += 100) await service.saveCountItems(f.count.id, { items: items.slice(start, start + 100) }, f.req)
  }
  async function balance(f) { return db.warehouseStock.findUnique({ where: { id: f.stock.id } }) }

  it('captures an immutable snapshot and approves positive variance with a movement, adjustment and audit', async () => {
    const f = await fixture(); expect(f.count.countNumber).toMatch(/^SC-\d{4}-\d{5}$/)
    expect(f.items.find(item => item.productId === f.product.id)).toMatchObject({ expectedQuantity: 10, countedQuantity: null })
    await expect(service.submitCount(f.count.id, f.req)).rejects.toMatchObject({ status: 400 })
    await record(f, 13); expect((await balance(f)).quantity).toBe(10)
    await service.submitCount(f.count.id, f.req)
    await expect(service.saveCountItems(f.count.id, { items: [{ id: f.items[0].id, countedQuantity: 1 }] }, f.req)).rejects.toMatchObject({ status: 409 })
    await service.approveCount(f.count.id, f.req)
    expect((await balance(f)).quantity).toBe(13)
    const movement = await db.stockMovement.findMany({ where: { referenceNumber: f.count.countNumber } }); expect(movement).toHaveLength(1); expect(movement[0]).toMatchObject({ quantity: 3, previousQuantity: 10, newQuantity: 13, type: 'CORRECTION' })
    expect(await db.stockCountItem.count({ where: { stockCountId: f.count.id, adjustmentId: { not: null } } })).toBe(1)
    expect(await db.activityLog.count({ where: { entityId: f.count.id, action: 'APPROVED', warehouseId: f.warehouse.id } })).toBe(1)
    await expect(service.approveCount(f.count.id, f.req)).rejects.toMatchObject({ status: 409 })
    await expect(service.cancelCount(f.count.id, f.req)).rejects.toMatchObject({ status: 409 })
  })
  it('applies negative variance including explicit zero and preserves reserved quantities', async () => {
    const f = await fixture(); await record(f, 0); await service.submitCount(f.count.id, f.req); await service.approveCount(f.count.id, f.req); expect((await balance(f)).quantity).toBe(0)
    const held = await fixture({ reservedQuantity: 3 }); await record(held, 2); await service.submitCount(held.count.id, held.req)
    await expect(service.approveCount(held.count.id, held.req)).rejects.toMatchObject({ status: 400 }); expect((await balance(held)).quantity).toBe(10); expect((await service.getCount(held.count.id, held.req.user)).status).toBe('SUBMITTED')
  })
  it('rejects stale snapshots even when stock returns to the same quantity', async () => {
    const f = await fixture(); await record(f, 8); await service.submitCount(f.count.id, f.req)
    await db.warehouseStock.update({ where: { id: f.stock.id }, data: { updatedAt: new Date(f.stock.updatedAt.getTime() + 1000) } })
    await expect(service.approveCount(f.count.id, f.req)).rejects.toMatchObject({ status: 409 }); expect((await balance(f)).quantity).toBe(10)
    expect(await db.stockMovement.count({ where: { referenceNumber: f.count.countNumber } })).toBe(0)
  })
  it('records exact serial substitution at equal quantity, marks missing units and recovers them later', async () => {
    const first = `COUNT-S1-${suffix}`, second = `COUNT-S2-${suffix}`, unexpected = `COUNT-NEW-${suffix}`
    const f = await fixture({ serials: [{ serialNumber: first }, { serialNumber: second }] })
    await record(f, 10, [first, unexpected]); const review = await service.countItems(f.count.id, { limit: 100 }, f.req.user)
    const line = review.data.find(item => item.productId === serialProduct.id); expect(line.missingSerials).toEqual([second]); expect(line.unexpectedSerials).toEqual([unexpected])
    await service.submitCount(f.count.id, f.req); await service.approveCount(f.count.id, f.req)
    expect((await db.serialNumber.findUnique({ where: { serialNumber: second } })).status).toBe('MISSING')
    expect((await db.serialNumber.findUnique({ where: { serialNumber: unexpected } })).warrantyStart).toBeNull()
    expect(await db.stockMovement.count({ where: { referenceNumber: f.count.countNumber, quantity: 0 } })).toBe(1)
    const next = await service.createCount({ warehouseId: f.warehouse.id }, f.req); await service.startCount(next.id, f.req)
    const recovery = { ...f, count: next, items: await db.stockCountItem.findMany({ where: { stockCountId: next.id }, include: { product: true, serials: true } }) }
    await record(recovery, 10, [first, unexpected, second]); await service.submitCount(next.id, f.req); await service.approveCount(next.id, f.req)
    expect((await db.serialNumber.findUnique({ where: { serialNumber: second } })).status).toBe('AVAILABLE')
    expect(await db.serialNumber.count({ where: { serialNumber: second } })).toBe(1)
  })
  it('rejects quantity-only serial counts, duplicates, another product serial, and removal of held serials', async () => {
    const serial = `COUNT-HELD-${suffix}`; const f = await fixture({ serials: [{ serialNumber: serial, status: 'RESERVED' }] }); const item = f.items.find(row => row.productId === serialProduct.id)
    await expect(service.saveCountItems(f.count.id, { items: [{ id: item.id, countedQuantity: 1 }] }, f.req)).rejects.toMatchObject({ status: 400 })
    await expect(service.saveCountItems(f.count.id, { items: [{ id: item.id, countedQuantity: 2, serialNumbers: [serial, serial] }] }, f.req)).rejects.toMatchObject({ status: 400 })
    await record(f, 10, []); await service.submitCount(f.count.id, f.req); await expect(service.approveCount(f.count.id, f.req)).rejects.toMatchObject({ status: 409 })
    expect((await db.serialNumber.findUnique({ where: { serialNumber: serial } })).status).toBe('RESERVED')
  })
  it('approves only once when two approvals race', async () => {
    const f = await fixture(); await record(f, 8); await service.submitCount(f.count.id, f.req)
    const results = await Promise.allSettled([service.approveCount(f.count.id, f.req), service.approveCount(f.count.id, f.req)])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1); expect((await balance(f)).quantity).toBe(8)
    expect(await db.stockMovement.count({ where: { referenceNumber: f.count.countNumber } })).toBe(1)
  })
  it('enforces warehouse and approval permissions through HTTP', async () => {
    const f = await fixture(); await db.userWarehouse.create({ data: { userId: user.id, warehouseId: f.warehouse.id, isDefault: true } })
    const login = await http('', '/auth/login', 'POST', { email: user.email, password: 'CountTest123!' }); const token = login.data.accessToken
    expect((await http(token, `/stock-counts/${f.count.id}`)).status).toBe(200)
    expect((await http(token, `/stock-counts?warehouse=${foreignWarehouse.id}`)).status).toBe(403)
    expect((await http(token, '/stock-counts', 'POST', { warehouseId: foreignWarehouse.id })).status).toBe(403)
    expect((await http(token, `/stock-counts/${f.count.id}/approve`, 'POST')).status).toBe(403)
    const foreign = await service.createCount({ warehouseId: foreignWarehouse.id }, { user: { id: user.id, role: 'Administrator' }, get: () => null })
    for (const path of ['', '/items', '/start', '/cancel']) expect((await http(token, `/stock-counts/${foreign.id}${path}`, path === '/start' || path === '/cancel' ? 'POST' : 'GET')).status).toBe(403)
    expect((await http(token, `/stock-counts/${f.count.id}/items`, 'PATCH', { items: [{ id: f.items[0].id, countedQuantity: -1 }] })).status).toBe(400)
    expect((await http(token, '/stock-counts?status=BOGUS')).status).toBe(400)
  })
})
