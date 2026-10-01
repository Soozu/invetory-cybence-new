import { testAccessToken } from './sessionFixture.js'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { suggestionQuery, replenishmentSchema, performanceQuery } from '../src/validators/replenishment.js'

it('validates warehouse, snapshots, explicit supplier and real bounded date windows', () => {
  expect(suggestionQuery.safeParse({}).success).toBe(false)
  expect(performanceQuery.safeParse({ dateFrom: '2026-02-30', dateTo: '2026-03-01' }).success).toBe(false)
  expect(performanceQuery.safeParse({ dateFrom: '2026-04-01', dateTo: '2026-03-01' }).success).toBe(false)
  expect(performanceQuery.safeParse({ dateFrom: '2024-01-01', dateTo: '2026-01-01' }).success).toBe(false)
  expect(replenishmentSchema.safeParse({ warehouseId: 'w', productId: 'p', snapshot: 'a'.repeat(64), kind: 'ORDER', notes: 'Replenish' }).success).toBe(false)
})
describe.skipIf(!process.env.TEST_DATABASE_URL)('replenishment and supplier performance with isolated MySQL', () => {
  let db, service, f, server, origin, count = 0
  const key = Date.now().toString(36)
  const call = async (token, path, body) => { const response = await fetch(`${origin}/api/replenishment${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) }); return { status: response.status, ...await response.json() } }
  beforeAll(async () => {
    if (!/^techstock_test_warehouse_[a-z0-9_]+$/.test(new URL(process.env.TEST_DATABASE_URL).pathname.slice(1))) throw Error('Unsafe test schema')
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
    db = (await import('../src/config/prisma.js')).prisma; service = await import('../src/services/replenishmentService.js')
    const a = await db.warehouse.create({ data: { name: `Reorder A ${key}`, code: `RO-A-${key}` } }), b = await db.warehouse.create({ data: { name: `Reorder B ${key}`, code: `RO-B-${key}` } })
    const category = await db.category.create({ data: { name: `RO ${key}`, slug: `ro-${key}` } }), brand = await db.brand.create({ data: { name: `RO ${key}`, slug: `ro-${key}` } })
    const supplier = await db.supplier.create({ data: { companyName: `RO supplier ${key}`, supplierCode: `RO-${key}` } })
    const users = {}, tokens = {}, { env } = await import('../src/config/env.js')
    const grants = [...service.reorderPermissions, ...service.performancePermissions, 'purchasing.CREATE', 'purchase_requests.CREATE']
    for (const [name, warehouses, permissions] of [['writer', [a], grants], ['reader', [a], grants.filter(key => !key.endsWith('CREATE'))], ['outsider', [b], grants], ['unassigned', [], grants], ['restricted', [a], ['inventory.VIEW']]]) {
      const role = await db.role.create({ data: { name: `RO ${name} ${key}` } })
      for (const grant of new Set(permissions)) { const [module, action] = grant.split('.'); const p = await db.permission.upsert({ where: { module_action: { module, action } }, create: { module, action }, update: {} }); await db.rolePermission.create({ data: { roleId: role.id, permissionId: p.id } }) }
      const record = await db.user.create({ data: { firstName: name, lastName: 'RO', email: `ro-${name}-${key}@test.invalid`, passwordHash: 'unused', roleId: role.id, warehouseAssignments: { create: warehouses.map(row => ({ warehouseId: row.id })) } } })
      users[name] = { id: record.id, role: role.name, roleId: role.id, warehouseIds: warehouses.map(row => row.id), permissions: [...new Set(permissions)] }; tokens[name] = await testAccessToken(db,record.id,env.accessSecret)
    }
    f = { a, b, category, brand, supplier, users, tokens, req: { user: users.writer, get: () => null } }
    const { app } = await import('../src/app.js'); server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); origin = `http://127.0.0.1:${server.address().port}`
  }, 30000)
  afterAll(async () => { if (server) await new Promise(resolve => server.close(resolve)); if (db) await db.$disconnect() })
  async function product(extra = {}) { return db.product.create({ data: { name: `Reorder ${key}-${++count}`, sku: `RO-${key}-${count}`, categoryId: f.category.id, brandId: f.brand.id, defaultSupplierId: f.supplier.id, minimumStock: 3, reorderPoint: 5, maximumStock: 10, purchaseCost: '20.10', ...extra } }) }
  const suggestion = async p => (await service.listSuggestions(suggestionQuery.parse({ warehouse: f.a.id, search: p.sku }), f.users.writer)).data[0]
  const input = (p, row, kind = 'REQUEST') => replenishmentSchema.parse({ warehouseId: f.a.id, productId: p.id, snapshot: row.snapshot, kind, supplierId: f.supplier.id, notes: 'Verified replenishment need' })
  async function order(p, status, quantity, receivedQuantity = 0, extras = {}) { return db.purchaseOrder.create({ data: { poNumber: `RO-PO-${key}-${++count}`, warehouseId: f.a.id, supplierId: f.supplier.id, createdById: f.users.writer.id, status, subtotal: '201.00', total: '201.00', items: { create: { productId: p.id, quantity, receivedQuantity, unitCost: '20.10', subtotal: '201.00' } }, ...extras }, include: { items: true } }) }
  it('uses aggregate holds once, conditions, real commitments and remaining partial PO quantities', async () => {
    const p = await product()
    await db.warehouseStock.create({ data: { productId: p.id, warehouseId: f.a.id, quantity: 10, reservedQuantity: 7, quarantineQuantity: 2, defectiveQuantity: 1, forRepairQuantity: 1, returnPendingQuantity: 1 } })
    await order(p, 'PARTIAL', 5, 3); await order(p, 'DRAFT', 1); await order(p, 'CANCELLED', 99); await order(p, 'RECEIVED', 99, 99)
    await order(p, 'APPROVED', 99, 0, { warehouseId: f.b.id })
    expect(await suggestion(p)).toMatchObject({ quantity: 10, unavailable: 7, available: 3, incoming: 2, planned: 1, projected: 6, target: 10, suggestedQuantity: 4 })
  })
  it('includes products without a balance, excludes inactive products and zero triggers, and uses minimum fallback', async () => {
    const p = await product({ reorderPoint: 0, maximumStock: 0 }); expect(await suggestion(p)).toMatchObject({ available: 0, threshold: 3, target: 3, suggestedQuantity: 3 })
    expect(await suggestion(await product({ status: 'INACTIVE' }))).toBeUndefined()
    expect(await suggestion(await product({ minimumStock: 0, reorderPoint: 0 }))).toBeUndefined()
    const covered = await product(); await order(covered, 'APPROVED', 15); expect(await suggestion(covered)).toMatchObject({ incoming: 15, suggestedQuantity: 0 })
  })
  it('creates only an explicit linked draft PR, preserves exact quantities/cost and rejects repeat snapshots', async () => {
    const p = await product(), row = await suggestion(p), before = await db.purchaseOrder.count()
    const value = await service.createReplenishment(input(p, row), f.req)
    expect(value.document).toMatchObject({ status: 'DRAFT', warehouseId: f.a.id, items: [{ productId: p.id, quantity: 10 }] }); expect(value.document.items[0].estimatedUnitCost.toFixed(2)).toBe('20.10')
    expect(await db.purchaseOrder.count()).toBe(before); expect(await suggestion(p)).toMatchObject({ planned: 10, suggestedQuantity: 0 })
    await expect(service.createReplenishment(input(p, row), f.req)).rejects.toMatchObject({ status: 409 })
    await db.purchaseRequest.update({ where: { id: value.document.id }, data: { status: 'CANCELLED' } }); expect((await suggestion(p)).suggestedQuantity).toBe(10)
  })
  it('counts converted PR/RFQ procurement once via its PO, rather than both documents', async () => {
    const p = await product(), request = await service.createReplenishment(input(p, await suggestion(p)), f.req), po = await order(p, 'DRAFT', 10)
    await db.purchaseRequest.update({ where: { id: request.document.id }, data: { status: 'CONVERTED', purchaseOrderId: po.id } })
    expect(await suggestion(p)).toMatchObject({ planned: 10, incoming: 0, suggestedQuantity: 0 })
  })
  it('creates exactly one draft PO under competing conversions, with decimal totals and no stock change', async () => {
    const p = await product(), row = await suggestion(p), body = input(p, row, 'ORDER')
    const outcomes = await Promise.allSettled([service.createReplenishment(body, f.req), service.createReplenishment(body, f.req)])
    expect(outcomes.filter(value => value.status === 'fulfilled')).toHaveLength(1); expect(outcomes.find(value => value.status === 'rejected').reason).toMatchObject({ status: 409 })
    const po = outcomes.find(value => value.status === 'fulfilled').value.document
    expect(po.status).toBe('DRAFT'); expect(po.items[0].quantity).toBe(10); expect(po.total.toFixed(2)).toBe('201.00'); expect(po.items[0].unitCost.toFixed(2)).toBe('20.10')
    expect(await db.warehouseStock.count({ where: { productId: p.id } })).toBe(0); expect(await db.stockMovement.count({ where: { productId: p.id } })).toBe(0)
    expect(await db.purchaseOrder.count({ where: { items: { some: { productId: p.id } } } })).toBe(1)
  })
  it('rejects stale stock, thresholds and price changes and unavailable suppliers without documents', async () => {
    const p = await product(), row = await suggestion(p)
    await db.warehouseStock.create({ data: { productId: p.id, warehouseId: f.a.id, quantity: 1 } }); await expect(service.createReplenishment(input(p, row), f.req)).rejects.toMatchObject({ status: 409 })
    const next = await suggestion(p); await db.product.update({ where: { id: p.id }, data: { purchaseCost: '21.11', maximumStock: 12 } }); await expect(service.createReplenishment(input(p, next), f.req)).rejects.toMatchObject({ status: 409 })
    const inactive = await db.supplier.create({ data: { companyName: `Inactive ${key}`, supplierCode: `RO-IN-${key}`, status: 'INACTIVE' } })
    await expect(service.createReplenishment({ ...input(p, await suggestion(p), 'ORDER'), supplierId: inactive.id }, f.req)).rejects.toMatchObject({ status: 400 })
    expect(await db.purchaseOrder.count({ where: { items: { some: { productId: p.id } } } })).toBe(0)
  })
  it('prevents competing PR and PO actions from planning the same need twice', async () => {
    const p = await product(), row = await suggestion(p)
    const results = await Promise.allSettled([service.createReplenishment(input(p, row, 'REQUEST'), f.req), service.createReplenishment(input(p, row, 'ORDER'), f.req)])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(result => result.status === 'rejected').reason).toMatchObject({ status: 409 })
    expect(await suggestion(p)).toMatchObject({ planned: 10, suggestedQuantity: 0 })
  })
  it('enforces warehouse and each source/read/create permission over HTTP and next-request revocation', async () => {
    const p = await product(), row = await suggestion(p), path = `/suggestions?warehouse=${f.a.id}&search=${p.sku}`
    expect((await call(f.tokens.reader, path)).status).toBe(200); expect((await call(f.tokens.reader, '/documents', input(p, row))).status).toBe(403)
    expect((await call(f.tokens.outsider, path)).status).toBe(403); expect((await call(f.tokens.unassigned, path)).status).toBe(403); expect((await call(f.tokens.restricted, path)).status).toBe(403)
    expect((await call(f.tokens.outsider, '/documents', input(p, row, 'ORDER'))).status).toBe(403)
    const assignment = await db.userWarehouse.findFirst({ where: { userId: f.users.reader.id, warehouseId: f.a.id } }); await db.userWarehouse.delete({ where: { id: assignment.id } }); expect((await call(f.tokens.reader, path)).status).toBe(403)
    expect((await call(f.tokens.restricted, '/supplier-performance?dateFrom=2026-09-01&dateTo=2026-09-30')).status).toBe(403)
    expect((await call(f.tokens.writer, '/supplier-performance?dateFrom=2026-02-30&dateTo=2026-03-01')).status).toBe(400)
  })
  it('rejects inactive warehouse and paginates products deterministically', async () => {
    const value = await service.listSuggestions(suggestionQuery.parse({ warehouse: f.a.id, search: `RO-${key}`, pageSize: 1, page: 2 }), f.users.writer); expect(value.data).toHaveLength(1); expect(value.meta).toMatchObject({ page: 2, pageSize: 1 })
    const w = await db.warehouse.create({ data: { name: `Inactive RO ${key}`, code: `RO-WI-${key}`, status: 'INACTIVE' } }); await expect(service.listSuggestions({ warehouse: w.id }, { role: 'Administrator' })).rejects.toMatchObject({ status: 400 })
  })
  async function receipt(po, quantity, date) { return db.purchaseReceipt.create({ data: { receiptNumber: `RO-RCV-${key}-${++count}`, purchaseOrderId: po.id, warehouseId: po.warehouseId, receivedById: f.users.writer.id, receivedAt: new Date(date), items: { create: { purchaseOrderItemId: po.items[0].id, productId: po.items[0].productId, quantity } } }, include: { items: true } }) }
  it('computes cohort metrics with exact receipt value, full completion, inclusive due dates and shipped returns once', async () => {
    const supplier = await db.supplier.create({ data: { companyName: `Metric ${key}`, supplierCode: `RO-M-${key}` } }), p = await product()
    const extras = { supplierId: supplier.id, orderDate: new Date('2026-09-01T00:00:00Z'), expectedDelivery: new Date('2026-09-05T00:00:00Z') }
    const po = await order(p, 'RECEIVED', 10, 10, extras), first = await receipt(po, 4, '2026-09-03T00:00:00Z'); await receipt(po, 6, '2026-09-05T23:59:00Z')
    await order(p, 'APPROVED', 2, 0, extras); await order(p, 'DRAFT', 100, 0, extras); await order(p, 'CANCELLED', 100, 0, extras)
    for (const [status, quantity, returnedAt] of [['COMPLETED', 2, '2026-09-10'], ['PENDING', 1, null], ['SHIPPED', 1, '2026-10-02']]) await db.supplierReturn.create({ data: { returnNumber: `RO-RTV-${key}-${++count}`, supplierId: supplier.id, purchaseOrderId: po.id, receiptId: first.id, warehouseId: f.a.id, createdById: f.users.writer.id, reason: 'DEFECTIVE', status, returnedAt: returnedAt && new Date(returnedAt), items: { create: { productId: p.id, receiptItemId: first.items[0].id, quantity, reason: 'DEFECTIVE', condition: 'DEFECTIVE' } } } })
    const result = await service.supplierPerformance({ dateFrom: '2026-09-01', dateTo: '2026-09-30', supplier: supplier.id }, f.users.writer)
    expect(result.data[0]).toMatchObject({ orders: 2, orderedUnits: 12, receivedUnits: 10, returnedUnits: 2, receivedValue: '201.00', completedDueOrders: 1, onTimeOrders: 1, onTimePercent: 100, firstReceiptSamples: 1, averageFirstReceiptDays: 2, returnPercent: 20, openOverdueOrders: 1 })
    expect((await service.supplierPerformance({ dateFrom: '2026-09-02', dateTo: '2026-09-30', supplier: supplier.id }, f.users.writer)).data).toEqual([])
    expect((await service.supplierPerformance({ dateFrom: '2026-09-01', dateTo: '2026-09-30', supplier: supplier.id }, f.users.outsider)).data).toEqual([])
    expect((await call(f.tokens.unassigned, '/supplier-performance?dateFrom=2026-09-01&dateTo=2026-09-30')).data).toEqual([])
  })
  it('reports unknown samples as null, preserves late completion, ignores future receipts and scopes mixed warehouses', async () => {
    const supplier = await db.supplier.create({ data: { companyName: `Late ${key}`, supplierCode: `RO-L-${key}` } }), p = await product(), extras = { supplierId: supplier.id, orderDate: new Date('2026-09-01'), expectedDelivery: new Date('2026-09-03') }
    const po = await order(p, 'RECEIVED', 2, 2, extras); await receipt(po, 2, '2026-09-04')
    const future = await order(p, 'PARTIAL', 2, 1, { ...extras, expectedDelivery: null }); await receipt(future, 1, '2026-10-01')
    const foreign = await order(p, 'RECEIVED', 10, 10, { ...extras, warehouseId: f.b.id }); await receipt(foreign, 10, '2026-09-02')
    const result = (await service.supplierPerformance({ dateFrom: '2026-09-01', dateTo: '2026-09-30', supplier: supplier.id }, f.users.writer)).data[0]
    expect(result).toMatchObject({ orders: 2, receivedUnits: 2, onTimePercent: 0, firstReceiptSamples: 1, averageFirstReceiptDays: 3 })
    const empty = await db.supplier.create({ data: { companyName: `No samples ${key}`, supplierCode: `RO-N-${key}` } }); await order(p, 'APPROVED', 2, 0, { ...extras, supplierId: empty.id, expectedDelivery: null })
    expect((await service.supplierPerformance({ dateFrom: '2026-09-01', dateTo: '2026-09-30', supplier: empty.id }, f.users.writer)).data[0]).toMatchObject({ onTimePercent: null, averageFirstReceiptDays: null, returnPercent: null, firstReceiptSamples: 0 })
  })
})
