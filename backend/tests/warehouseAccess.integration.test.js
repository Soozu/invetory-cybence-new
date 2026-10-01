import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import bcrypt from 'bcrypt'

const enabled = Boolean(process.env.TEST_DATABASE_URL)
describe.skipIf(!enabled)('warehouse boundaries through live HTTP and MySQL', () => {
  let db, server, origin, fixture
  const tokens = {}
  const request = async (identity, path, { method = 'GET', body } = {}) => {
    const response = await fetch(`${origin}/api${path}`, {
      method, headers: { ...(tokens[identity] ? { Authorization: `Bearer ${tokens[identity]}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    })
    return { status: response.status, ...(await response.json()) }
  }

  beforeAll(async () => {
    const suffix = Date.now().toString(36)
    const url = new URL(process.env.TEST_DATABASE_URL)
    if (!/^techstock_test_warehouse_[a-z0-9_]+$/.test(url.pathname.slice(1))) throw new Error('Integration tests require an isolated warehouse test schema.')
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
    const { prisma } = await import('../src/config/prisma.js')
    db = prisma
    const { app } = await import('../src/app.js')
    server = app.listen(0, '127.0.0.1')
    await new Promise(resolve => server.once('listening', resolve))
    origin = `http://127.0.0.1:${server.address().port}`
    const [a, b, c] = await Promise.all(['A', 'B', 'C'].map(code => db.warehouse.create({ data: { name: `Test ${code} ${suffix}`, code: `TEST-${code}-${suffix}` } })))
    const role = await db.role.create({ data: { name: `Warehouse Test Staff ${suffix}` } })
    for (const module of ['products', 'warehouses', 'inventory', 'purchasing', 'assets', 'reports', 'dashboard', 'users', 'settings']) {
      for (const action of ['VIEW', 'CREATE', 'EDIT', 'APPROVE']) {
        const permission = await db.permission.upsert({ where: { module_action: { module, action } }, create: { module, action }, update: {} })
        await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } })
      }
    }
    const adminRole = await db.role.upsert({ where: { name: 'Administrator' }, update: {}, create: { name: 'Administrator' } })
    const password = 'WarehouseTest123!'
    const passwordHash = await bcrypt.hash(password, 4)
    const identities = { admin: { roleId: adminRole.id, ids: [] }, a: { roleId: role.id, ids: [a.id] }, b: { roleId: role.id, ids: [b.id] }, multiple: { roleId: role.id, ids: [a.id, b.id] }, none: { roleId: role.id, ids: [] } }
    const users = {}
    for (const [key, input] of Object.entries(identities)) {
      users[key] = await db.user.create({ data: { firstName: key, lastName: 'Test', email: `${key}-${suffix}@warehouse.test`, passwordHash, roleId: input.roleId, warehouseId: input.ids[0] || null,
        warehouseAssignments: { create: input.ids.map((warehouseId, index) => ({ warehouseId, isDefault: index === 0 })) } } })
      const login = await request(key, '/auth/login', { method: 'POST', body: { email: users[key].email, password } })
      expect(login.status).toBe(200)
      tokens[key] = login.data.accessToken
    }
    const category = await db.category.create({ data: { name: `Test category ${suffix}`, slug: `test-category-${suffix}` } })
    const brand = await db.brand.create({ data: { name: `Test brand ${suffix}`, slug: `test-brand-${suffix}` } })
    const product = await db.product.create({ data: { name: 'Test cable', sku: `TEST-CABLE-${suffix}`, categoryId: category.id, brandId: brand.id, purchaseCost: 10, minimumStock: 8, reorderPoint: 8 } })
    await db.warehouseStock.createMany({ data: [{ productId: product.id, warehouseId: a.id, quantity: 5 }, { productId: product.id, warehouseId: b.id, quantity: 100 }] })
    const serialProduct = await db.product.create({ data: { name: 'Test serialized unit', sku: `TEST-SERIAL-${suffix}`, categoryId: category.id, brandId: brand.id, trackSerialNumbers: true } })
    await db.warehouseStock.createMany({ data: [{ productId: serialProduct.id, warehouseId: a.id, quantity: 1 }, { productId: serialProduct.id, warehouseId: b.id, quantity: 1 }] })
    const serial = await db.serialNumber.create({ data: { serialNumber: `TEST-SERIAL-B-${suffix}`, productId: serialProduct.id, warehouseId: b.id, warrantyEnd: new Date('2030-01-01') } })
    const supplier = await db.supplier.create({ data: { companyName: `Test vendor ${suffix}`, supplierCode: `TEST-VENDOR-${suffix}` } })
    const order = await db.purchaseOrder.create({ data: { poNumber: `TEST-PO-B-${suffix}`, supplierId: supplier.id, warehouseId: b.id, createdById: users.admin.id, status: 'APPROVED', subtotal: 10, total: 10, items: { create: { productId: product.id, quantity: 1, unitCost: 10, subtotal: 10 } } }, include: { items: true } })
    const asset = await db.asset.create({ data: { assetTag: `TEST-ASSET-B-${suffix}`, productId: product.id, warehouseId: b.id } })
    const maintenance = await db.maintenanceRecord.create({ data: { assetId: asset.id, issue: 'Test inspection', createdById: users.admin.id } })
    await db.stockMovement.createMany({ data: [a, b].map(warehouse => ({ productId: product.id, warehouseId: warehouse.id, referenceNumber: `TEST-${warehouse.code}`, quantity: 1, previousQuantity: 0, newQuantity: 1, type: 'OPENING_STOCK' })) })
    await db.activityLog.createMany({ data: [a, b].map(warehouse => ({ userId: users.admin.id, warehouseId: warehouse.id, action: 'TEST', module: 'Inventory', description: warehouse.name })) })
    await db.notification.createMany({ data: [a, b].map(warehouse => ({ userId: users.a.id, warehouseId: warehouse.id, type: 'LOW_STOCK', title: warehouse.name, message: 'Test notification' })) })
    fixture = { a, b, c, product, serialProduct, serial, order, asset, maintenance, users, supplier }
  }, 30000)

  afterAll(async () => { if (server) await new Promise(resolve => server.close(resolve)); if (db) await db.$disconnect() })

  it('preserves the legacy warehouse assignment through migration', async () => {
    const assignments = await db.userWarehouse.findMany({ where: { userId: 'test-legacy-user' } })
    expect(assignments).toHaveLength(1)
    expect(assignments[0]).toMatchObject({ warehouseId: 'test-legacy-warehouse', isDefault: true })
  })

  it('returns only assigned warehouse records, including multiple assignments and no assignments', async () => {
    const a = await request('a', '/warehouses')
    expect(a.data.map(row => row.id)).toEqual([fixture.a.id])
    const multiple = await request('multiple', '/warehouses')
    expect(multiple.data.map(row => row.id).sort()).toEqual([fixture.a.id, fixture.b.id].sort())
    expect((await request('none', '/warehouses')).data).toEqual([])
    expect((await request('admin', `/warehouses/${fixture.b.id}`)).status).toBe(200)
    expect((await request('a', '/warehouses', { method: 'POST', body: { name: 'Unauthorized warehouse', code: 'UNAUTHORIZED' } })).status).toBe(403)
    for (const suffix of ['', '/inventory', '/movements']) expect((await request('a', `/warehouses/${fixture.b.id}${suffix}`)).status).toBe(403)
  })

  it('scopes product balances and all inventory read paths', async () => {
    expect((await request('a', `/products/${fixture.product.id}`)).data.quantity).toBe(5)
    expect((await request('multiple', `/products/${fixture.product.id}`)).data.quantity).toBe(105)
    expect((await request('none', `/products/${fixture.product.id}`)).data.quantity).toBe(0)
    for (const path of ['/inventory/stocks', '/stock-movements', '/serial-numbers']) {
      const result = await request('a', path)
      expect(result.status).toBe(200)
      expect(result.data.every(row => row.warehouseId === fixture.a.id)).toBe(true)
      expect((await request('a', `${path}?warehouse=${fixture.b.id}`)).status).toBe(403)
    }
    expect((await request('a', `/products/${fixture.product.id}/inventory`)).data.every(row => row.warehouseId === fixture.a.id)).toBe(true)
    expect((await request('a', `/serial-numbers/${fixture.serial.id}`)).status).toBe(403)
  })

  it('rejects stock and serial writes before changing another warehouse', async () => {
    const adjustment = { productId: fixture.product.id, warehouseId: fixture.b.id, type: 'STOCK_OUT', quantity: 1, reason: 'Unauthorized test' }
    expect((await request('a', '/inventory/adjust', { method: 'POST', body: adjustment })).status).toBe(403)
    expect((await request('a', `/serial-numbers/${fixture.serial.id}/status`, { method: 'PATCH', body: { status: 'DEFECTIVE' } })).status).toBe(403)
    expect((await db.warehouseStock.findUnique({ where: { productId_warehouseId: { productId: fixture.product.id, warehouseId: fixture.b.id } } })).quantity).toBe(100)
  })

  it('rejects foreign purchasing, receiving, asset and maintenance access', async () => {
    const { order, asset, maintenance } = fixture
    for (const path of [`/purchase-orders/${order.id}`, `/assets/${asset.id}`, `/maintenance/${maintenance.id}`]) expect((await request('a', path)).status).toBe(403)
    expect((await request('a', `/purchase-orders/${order.id}/receive`, { method: 'POST', body: { items: [{ purchaseOrderItemId: order.items[0].id, quantity: 1 }] } })).status).toBe(403)
    expect((await request('a', `/assets/${asset.id}/assign`, { method: 'POST', body: { assignedTo: 'Unauthorized assignee', expectedUpdatedAt: asset.updatedAt.toISOString() } })).status).toBe(403)
    expect((await request('a', `/maintenance/${maintenance.id}`, { method: 'PUT', body: { issue: 'Unauthorized edit', expectedUpdatedAt: maintenance.updatedAt.toISOString(), expectedAssetUpdatedAt: asset.updatedAt.toISOString() } })).status).toBe(403)
    expect((await request('a', '/purchase-orders')).data).toEqual([])
    expect((await request('a', '/assets')).data).toEqual([])
    for (const path of ['/assets', '/purchase-orders', '/maintenance']) expect((await request('a', `${path}?warehouse=${fixture.b.id}`)).status).toBe(403)
  })

  it('filters bootstrap, dashboard, reports, search source data, logs and notifications', async () => {
    const boot = await request('a', '/bootstrap')
    expect(boot.status).toBe(200)
    expect(boot.data.warehouses.map(row => row.id)).toEqual([fixture.a.id])
    expect(boot.data.products.find(row => row.id === fixture.product.id).stock).toBe(5)
    expect(boot.data.orders).toEqual([])
    expect(boot.data.assets).toEqual([])
    expect(boot.data.serials.some(row => row.id === fixture.serial.id)).toBe(false)
    expect(boot.data.logs.every(row => row.description === fixture.a.name)).toBe(true)
    expect(boot.data.notifications.map(row => row.title)).toEqual([fixture.a.name])
    expect((await request('a', '/dashboard/summary')).data.totalInventoryUnits).toBe(6)
    expect((await request('none', '/dashboard/summary')).data.totalInventoryUnits).toBe(0)
    expect((await request('a', '/reports/warehouse-stock')).data.every(row => row.warehouseId === fixture.a.id)).toBe(true)
    expect((await request('a', `/reports/inventory-summary?warehouse=${fixture.b.id}`)).status).toBe(403)
    expect((await request('a', '/reports/inventory-summary')).data.find(row => row.id === fixture.product.id).quantity).toBe(5)
    expect((await request('a', '/monitoring/low-stock')).data.find(row => row.id === fixture.product.id).quantity).toBe(5)
    expect((await request('a', '/dashboard/category-distribution')).data.reduce((sum, row) => sum + row.quantity, 0)).toBe(6)
    expect((await request('none', '/bootstrap')).data.warehouses).toEqual([])
  })

  it('limits transfer actions to the correct endpoint warehouse', async () => {
    expect((await request('a', '/transfers', { method: 'POST', body: { sourceWarehouseId: fixture.b.id, destinationWarehouseId: fixture.a.id, items: [{ productId: fixture.product.id, quantity: 1 }] } })).status).toBe(403)
    const routing = await request('a', '/transfers/destinations')
    expect(routing.data.some(row => row.id === fixture.b.id)).toBe(true)
    expect(routing.data.every(row => Object.keys(row).sort().join(',') === 'code,id,name')).toBe(true)
    const create = await request('a', '/transfers', { method: 'POST', body: { sourceWarehouseId: fixture.a.id, destinationWarehouseId: fixture.b.id, items: [{ productId: fixture.product.id, quantity: 1 }] } })
    expect(create.status).toBe(201)
    const path = `/transfers/${create.data.id}`
    expect((await request('none', path)).status).toBe(403)
    expect((await request('a', `${path}/submit`, { method: 'POST' })).status).toBe(200)
    expect((await request('b', `${path}/approve`, { method: 'POST' })).status).toBe(403)
    expect((await request('admin', `${path}/approve`, { method: 'POST' })).status).toBe(200)
    expect((await request('b', `${path}/ship`, { method: 'POST' })).status).toBe(403)
    expect((await request('a', `${path}/ship`, { method: 'POST' })).status).toBe(200)
    expect((await request('a', `${path}/receive`, { method: 'POST' })).status).toBe(403)
    expect((await request('b', `${path}/receive`, { method: 'POST' })).status).toBe(200)
    expect((await request('b', `${path}/receive`, { method: 'POST' })).status).toBe(409)
  })

  it('requires administrator assignment changes and applies revocation to an existing access token', async () => {
    const path = `/users/${fixture.users.a.id}/warehouses`
    expect((await request('a', path, { method: 'PUT', body: { warehouseIds: [fixture.a.id, fixture.b.id], defaultWarehouseId: fixture.b.id } })).status).toBe(403)
    const grant = await request('admin', path, { method: 'PUT', body: { warehouseIds: [fixture.a.id, fixture.b.id], defaultWarehouseId: fixture.b.id } })
    expect(grant.status).toBe(200)
    expect((await request('a', `/warehouses/${fixture.b.id}`)).status).toBe(200)
    const invalid = await request('admin', path, { method: 'PUT', body: { warehouseIds: [fixture.a.id], defaultWarehouseId: fixture.b.id } })
    expect(invalid.status).toBe(400)
    expect((await request('a', `/users/${fixture.users.b.id}`)).status).toBe(403)
    expect((await request('admin', path, { method: 'PUT', body: { warehouseIds: [fixture.a.id], defaultWarehouseId: fixture.a.id } })).status).toBe(200)
    expect((await request('a', `/warehouses/${fixture.b.id}`)).status).toBe(403)
  })
})
