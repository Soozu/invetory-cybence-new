import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import bcrypt from 'bcrypt'
import { supplierReturnSchema, supplierReturnShipSchema, supplierReturnCompleteSchema } from '../src/validators/supplierReturns.js'

it('validates return lines, exact serial identities, shipment and acknowledgement', () => {
  const data = { receiptId: 'receipt', reason: 'DEFECTIVE', items: [{ receiptItemId: 'item', quantity: 1, reason: 'DEFECTIVE', condition: 'DEFECTIVE', serialNumberIds: ['serial'] }] }
  expect(supplierReturnSchema.safeParse(data).success).toBe(true)
  for (const patch of [{ items: [] }, { items: [data.items[0], data.items[0]] }, { items: [{ ...data.items[0], quantity: -1 }] }, { items: [{ ...data.items[0], serialNumberIds: ['serial', 'serial'] }] }, { reason: 'INVALID' }]) expect(supplierReturnSchema.safeParse({ ...data, ...patch }).success).toBe(false)
  expect(supplierReturnShipSchema.safeParse({ expectedUpdatedAt: new Date().toISOString(), shipmentReference: ' ' }).success).toBe(false)
  expect(supplierReturnCompleteSchema.safeParse({ expectedUpdatedAt: new Date().toISOString(), notes: '' }).success).toBe(false)
})

describe.skipIf(!process.env.TEST_DATABASE_URL)('Supplier returns with isolated MySQL', () => {
  let db, returns, purchasing, inventory, counts, lifecycle, f, server, origin
  const suffix = Date.now().toString(36)
  const http = async (token, path, method = 'GET', body) => {
    const response = await fetch(`${origin}/api${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
    return { status: response.status, ...await response.json() }
  }
  beforeAll(async () => {
    if (!/^techstock_test_warehouse_[a-z0-9_]+$/.test(new URL(process.env.TEST_DATABASE_URL).pathname.slice(1))) throw Error('Unsafe test schema')
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
    db = (await import('../src/config/prisma.js')).prisma
    returns = await import('../src/services/supplierReturnService.js')
    purchasing = await import('../src/services/procurementService.js')
    inventory = await import('../src/services/inventoryService.js')
    counts = await import('../src/services/stockCountService.js')
    lifecycle = await import('../src/services/serialLifecycleService.js')
    const warehouses = await Promise.all(['A', 'B'].map(code => db.warehouse.create({ data: { name: `RTV ${code} ${suffix}`, code: `RTV-${code}-${suffix}` } })))
    const category = await db.category.create({ data: { name: `RTV category ${suffix}`, slug: `rtv-category-${suffix}` } })
    const brand = await db.brand.create({ data: { name: `RTV brand ${suffix}`, slug: `rtv-brand-${suffix}` } })
    const supplier = await db.supplier.create({ data: { companyName: `RTV supplier ${suffix}`, supplierCode: `RTV-S-${suffix}` } })
    const adminRole = await db.role.upsert({ where: { name: 'Administrator' }, create: { name: 'Administrator' }, update: {} })
    const passwordHash = await bcrypt.hash('ReturnTest123!', 4)
    const admin = await db.user.create({ data: { firstName: 'RTV', lastName: 'Admin', email: `rtv-admin-${suffix}@test.local`, passwordHash, roleId: adminRole.id } })
    const users = { admin }, tokens = {}
    for (const [name, actions, warehouse] of [['viewer', ['VIEW'], warehouses[0]], ['operator', ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'SHIP', 'COMPLETE'], warehouses[0]], ['foreign', ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'SHIP', 'COMPLETE'], warehouses[1]], ['unassigned', ['VIEW'], null]]) {
      const role = await db.role.create({ data: { name: `RTV ${name} ${suffix}` } })
      for (const action of actions) {
        const permission = await db.permission.findUnique({ where: { module_action: { module: 'supplier_returns', action } } })
        await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } })
      }
      users[name] = await db.user.create({ data: { firstName: name, lastName: 'Test', email: `rtv-${name}-${suffix}@test.local`, passwordHash, roleId: role.id, ...(warehouse ? { warehouseAssignments: { create: { warehouseId: warehouse.id } } } : {}) } })
    }
    const { app } = await import('../src/app.js'); server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); origin = `http://127.0.0.1:${server.address().port}`
    for (const [name, user] of Object.entries(users)) tokens[name] = (await http('', '/auth/login', 'POST', { email: user.email, password: 'ReturnTest123!' })).data.accessToken
    f = { warehouses, category, brand, supplier, users, tokens, req: { user: { id: admin.id, role: 'Administrator' }, get: () => null }, sequence: 0 }
  }, 30000)
  afterAll(async () => { if (server) await new Promise(resolve => server.close(resolve)); if (db) await db.$disconnect() })
  const version = row => ({ expectedUpdatedAt: row.updatedAt.toISOString() })
  const action = (row, event, patch = {}) => returns.transitionReturn(row.id, event, { ...version(row), ...patch }, f.req)
  async function fixture(serialized = false, quantity = 3) {
    const number = ++f.sequence
    const product = await db.product.create({ data: { name: `RTV product ${number}`, sku: `RTV-${suffix}-${number}`, categoryId: f.category.id, brandId: f.brand.id, trackSerialNumbers: serialized } })
    let po = await purchasing.createOrder({ supplierId: f.supplier.id, warehouseId: f.warehouses[0].id, tax: 0, shipping: 0, items: [{ productId: product.id, quantity, unitCost: 12.34 }] }, f.req)
    await purchasing.transitionOrder(po.id, 'submit', f.req); await purchasing.transitionOrder(po.id, 'approve', f.req)
    const received = await purchasing.receiveOrder(po.id, { items: [{ purchaseOrderItemId: po.items[0].id, quantity, serialNumbers: serialized ? Array.from({ length: quantity }, (_, i) => `RTV-SN-${suffix}-${number}-${i}`) : [] }] }, f.req)
    const receipt = await returns.getSource(received.id, f.req.user)
    const data = { receiptId: receipt.id, reason: 'DEFECTIVE', notes: 'Received goods failed inspection', items: [{ receiptItemId: receipt.items[0].id, quantity, reason: 'DEFECTIVE', condition: 'DEFECTIVE', serialNumberIds: receipt.items[0].serials.map(serial => serial.id) }] }
    const stock = () => db.warehouseStock.findUnique({ where: { productId_warehouseId: { productId: product.id, warehouseId: receipt.warehouseId } } })
    return { product, po, receipt, data, stock }
  }
  it('preserves receipt/PO/supplier/warehouse identity and changes no stock in draft', async () => {
    const x = await fixture(true), before = await x.stock(), movements = await db.stockMovement.count()
    const row = await returns.createReturn({ ...x.data, warehouseId: f.warehouses[1].id, supplierId: 'forged', purchaseOrderId: 'forged', items: x.data.items.map(item => ({ ...item, productId: 'forged' })) }, f.req)
    expect(row).toMatchObject({ status: 'DRAFT', supplierId: f.supplier.id, purchaseOrderId: x.po.id, receiptId: x.receipt.id, warehouseId: f.warehouses[0].id })
    expect(row.items[0]).toMatchObject({ productId: x.product.id, quantity: 3, heldQuantity: 0 })
    expect(await x.stock()).toEqual(before); expect(await db.stockMovement.count()).toBe(movements)
    expect(row.items[0].serialSelections.every(selection => selection.serialNumber.status === 'AVAILABLE')).toBe(true)
    const cancelled = await action(row, 'cancel'); expect(cancelled.status).toBe('CANCELLED'); expect(await x.stock()).toEqual(before)
  })
  it('holds on submission, removes stock only on shipment, retains provenance and completes without another movement', async () => {
    const x = await fixture(true); let row = await returns.createReturn(x.data, f.req)
    row = await action(row, 'submit'); expect(await x.stock()).toMatchObject({ quantity: 3, reservedQuantity: 3 })
    expect(row.items[0].serialSelections.every(selection => selection.serialNumber.status === 'RETURN_PENDING')).toBe(true)
    row = await action(row, 'approve'); expect(await x.stock()).toMatchObject({ quantity: 3, reservedQuantity: 3 })
    await expect(action(row, 'ship')).rejects.toMatchObject({ status: 400 })
    row = await action(row, 'ship', { shipmentReference: 'Courier RTV tracking 01' }); expect(await x.stock()).toMatchObject({ quantity: 0, reservedQuantity: 0 })
    expect(row.returnedAt).not.toBeNull(); expect(row.items[0].serialSelections.every(selection => selection.serialNumber.status === 'RETURNED' && selection.serialNumber.warehouseId === null && selection.serialNumber.receiptId === x.receipt.id)).toBe(true)
    await expect(action(row, 'cancel')).rejects.toMatchObject({ status: 409 })
    await expect(action(row, 'complete')).rejects.toMatchObject({ status: 400 })
    const before = await db.stockMovement.count(); row = await action(row, 'complete', { notes: 'Supplier acknowledged; credit reference CN-01' })
    expect(row.status).toBe('COMPLETED'); expect(await db.stockMovement.count()).toBe(before)
    expect(await db.stockMovement.count({ where: { referenceNumber: row.returnNumber, type: 'SUPPLIER_RETURN', quantity: -3 } })).toBe(1)
    expect(await db.serialEvent.count({ where: { referenceId: row.id, type: 'SUPPLIER_RETURNED' } })).toBe(3)
    expect(await db.activityLog.count({ where: { entityId: row.id } })).toBe(5)
    expect((await returns.getSource(x.receipt.id, f.req.user)).items[0]).toMatchObject({ returnableQuantity: 0, serials: [] })
    await expect(returns.createReturn(x.data, f.req)).rejects.toMatchObject({ status: 409 })
  })
  it('returns nonserialized quantities and never exceeds the receipt cap across completed returns', async () => {
    const x = await fixture(); const data = { ...x.data, items: [{ ...x.data.items[0], quantity: 2 }] }
    let row = await returns.createReturn(data, f.req); row = await action(row, 'submit'); row = await action(row, 'approve'); row = await action(row, 'ship', { shipmentReference: 'RTV-2' })
    expect(await x.stock()).toMatchObject({ quantity: 1, reservedQuantity: 0 })
    await expect(returns.createReturn(data, f.req)).rejects.toMatchObject({ status: 409 })
    expect((await returns.getSource(x.receipt.id, f.req.user)).items[0].returnableQuantity).toBe(1)
  })
  it('cancellation restores exact pre-hold serial conditions and preserves existing unavailable units once', async () => {
    const x = await fixture(true), serials = x.receipt.items[0].serials
    await inventory.changeSerialStatus(serials[0].id, 'DEFECTIVE', f.req); await inventory.changeSerialStatus(serials[1].id, 'FOR_REPAIR', f.req)
    let row = await returns.createReturn(x.data, f.req); row = await action(row, 'submit')
    expect(row.items[0].heldQuantity).toBe(1); expect(await x.stock()).toMatchObject({ quantity: 3, reservedQuantity: 3 })
    row = await action(row, 'approve'); row = await action(row, 'cancel')
    expect(await x.stock()).toMatchObject({ quantity: 3, reservedQuantity: 2 })
    expect(row.items[0].serialSelections.map(selection => selection.serialNumber.status).sort()).toEqual(['AVAILABLE', 'DEFECTIVE', 'FOR_REPAIR'])
    expect(await db.stockMovement.count({ where: { referenceNumber: row.returnNumber, type: 'RETURN_RELEASE', quantity: 0 } })).toBe(1)
  })
  it('ships already defective serials without double-counting their holds', async () => {
    const x = await fixture(true); await inventory.changeSerialStatus(x.receipt.items[0].serials[0].id, 'DEFECTIVE', f.req)
    let row = await returns.createReturn(x.data, f.req); row = await action(row, 'submit'); row = await action(row, 'approve'); await action(row, 'ship', { shipmentReference: 'Damaged parcel return' })
    expect(await x.stock()).toMatchObject({ quantity: 0, reservedQuantity: 0 })
  })
  it('rejects wrong receipt lines, serial sets, reserved/asset units and invalid quantities', async () => {
    const x = await fixture(true), other = await fixture(true)
    for (const item of [{ ...x.data.items[0], receiptItemId: other.receipt.items[0].id }, { ...x.data.items[0], quantity: 4 }, { ...x.data.items[0], serialNumberIds: x.data.items[0].serialNumberIds.slice(1) }, { ...x.data.items[0], serialNumberIds: other.data.items[0].serialNumberIds }, { ...x.data.items[0], serialNumberIds: [x.data.items[0].serialNumberIds[0], x.data.items[0].serialNumberIds[0], x.data.items[0].serialNumberIds[0]] }]) await expect(returns.createReturn({ ...x.data, items: [item] }, f.req)).rejects.toMatchObject({ status: expect.any(Number) })
    await inventory.changeSerialStatus(x.data.items[0].serialNumberIds[0], 'RESERVED', f.req)
    await expect(returns.createReturn(x.data, f.req)).rejects.toMatchObject({ status: 409 })
    const plain = await fixture(); await expect(returns.createReturn({ ...plain.data, items: [{ ...plain.data.items[0], serialNumberIds: ['fake'] }] }, f.req)).rejects.toMatchObject({ status: 400 })
    const { createAsset } = await import('../src/services/assetService.js')
    await createAsset({ productId: other.product.id, warehouseId: other.receipt.warehouseId, serialNumberId: other.data.items[0].serialNumberIds[0] }, f.req)
    await expect(returns.createReturn(other.data, f.req)).rejects.toMatchObject({ status: 409 })
  })
  it('revalidates draft serials and receipt claims at submission, rolls back all lines on failure', async () => {
    const x = await fixture(true), plain = await fixture()
    let row = await returns.createReturn(x.data, f.req)
    await inventory.changeSerialStatus(x.data.items[0].serialNumberIds[0], 'RESERVED', f.req)
    await expect(action(row, 'submit')).rejects.toMatchObject({ status: 409 }); expect((await returns.getReturn(row.id, f.req.user)).status).toBe('DRAFT')
    row = await returns.createReturn(plain.data, f.req)
    await inventory.adjustStock({ productId: plain.product.id, warehouseId: plain.receipt.warehouseId, type: 'STOCK_OUT', quantity: 3, reason: 'Issued before submission' }, f.req)
    const before = await db.stockMovement.count()
    await expect(action(row, 'submit')).rejects.toMatchObject({ status: 409 }); expect(await db.stockMovement.count()).toBe(before); expect((await returns.getReturn(row.id, f.req.user)).status).toBe('DRAFT')
  })
  it('rolls back earlier line holds when a later line cannot be held', async () => {
    const a = await fixture(), b = await fixture()
    let po = await purchasing.createOrder({ supplierId: f.supplier.id, warehouseId: a.receipt.warehouseId, tax: 0, shipping: 0, items: [a.product, b.product].map(product => ({ productId: product.id, quantity: 1, unitCost: 10 })) }, f.req)
    await purchasing.transitionOrder(po.id, 'submit', f.req); await purchasing.transitionOrder(po.id, 'approve', f.req)
    const received = await purchasing.receiveOrder(po.id, { items: po.items.map(item => ({ purchaseOrderItemId: item.id, quantity: 1 })) }, f.req)
    const receipt = await returns.getSource(received.id, f.req.user)
    const row = await returns.createReturn({ receiptId: receipt.id, reason: 'OTHER', items: receipt.items.map(item => ({ receiptItemId: item.id, quantity: 1, reason: 'OTHER', condition: 'AVAILABLE', serialNumberIds: [] })) }, f.req)
    const lastProduct = row.items.at(-1).productId
    await inventory.adjustStock({ productId: lastProduct, warehouseId: receipt.warehouseId, type: 'STOCK_OUT', quantity: 4, reason: 'Depleted later line' }, f.req)
    const before = await db.stockMovement.count(); await expect(action(row, 'submit')).rejects.toMatchObject({ status: 409 })
    expect(await db.stockMovement.count()).toBe(before)
    expect((await returns.getReturn(row.id, f.req.user)).items.every(item => item.heldQuantity === 0)).toBe(true)
    expect((await a.stock()).reservedQuantity).toBe(0); expect((await b.stock()).reservedQuantity).toBe(0)
  })
  it('serializes competing draft edits and advances versions even after a clock adjustment', async () => {
    const x = await fixture(), row = await returns.createReturn(x.data, f.req)
    const now = vi.spyOn(Date, 'now').mockReturnValue(row.updatedAt.getTime() - 10000)
    let edited
    try { edited = await returns.updateReturn(row.id, { ...x.data, ...version(row), notes: 'Clock adjusted' }, f.req) } finally { now.mockRestore() }
    expect(edited.updatedAt.getTime()).toBe(row.updatedAt.getTime() + 1)
    const results = await Promise.allSettled(['Edit one', 'Edit two'].map(notes => returns.updateReturn(row.id, { ...x.data, ...version(edited), notes }, f.req)))
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  })
  it('prevents new holds at an inactive warehouse while allowing hold cancellation', async () => {
    const x = await fixture(), row = await returns.createReturn(x.data, f.req)
    const held = await action(row, 'submit')
    await db.warehouse.update({ where: { id: x.receipt.warehouseId }, data: { status: 'INACTIVE' } })
    try {
      const cancelled = await action(held, 'cancel'); expect(cancelled.status).toBe('CANCELLED')
      const draft = await returns.createReturn(x.data, f.req); await expect(action(draft, 'submit')).rejects.toMatchObject({ status: 409 })
      expect(await x.stock()).toMatchObject({ quantity: 3, reservedQuantity: 0 })
    } finally { await db.warehouse.update({ where: { id: x.receipt.warehouseId }, data: { status: 'ACTIVE' } }) }
  })
  it('blocks generic serial status changes and stock issues against return holds; counts capture held serials', async () => {
    const x = await fixture(true); let row = await returns.createReturn(x.data, f.req); row = await action(row, 'submit')
    await expect(inventory.changeSerialStatus(x.data.items[0].serialNumberIds[0], 'AVAILABLE', f.req)).rejects.toMatchObject({ status: 409 })
    await expect(inventory.adjustStock({ productId: x.product.id, warehouseId: x.receipt.warehouseId, type: 'STOCK_OUT', quantity: 1, serialNumbers: [x.receipt.items[0].serials[0].serialNumber], reason: 'Invalid issue' }, f.req)).rejects.toMatchObject({ status: 400 })
    const plain = await fixture(); let plainRow = await returns.createReturn(plain.data, f.req); await action(plainRow, 'submit')
    await expect(inventory.adjustStock({ productId: plain.product.id, warehouseId: plain.receipt.warehouseId, type: 'STOCK_OUT', quantity: 1, reason: 'Invalid issue' }, f.req)).rejects.toMatchObject({ status: 400 })
    const count = await counts.createCount({ warehouseId: x.receipt.warehouseId, notes: 'Count held returns' }, f.req); await counts.startCount(count.id, f.req)
    const item = await db.stockCountItem.findFirst({ where: { stockCountId: count.id, productId: x.product.id }, include: { serials: true } })
    expect(item).toMatchObject({ expectedQuantity: 3, expectedReservedQuantity: 3 }); expect(item.serials.every(serial => serial.expectedStatus === 'RETURN_PENDING')).toBe(true)
  })
  it('edits drafts with strict versions, freezes submissions and preserves all cancelled records', async () => {
    const x = await fixture(); let row = await returns.createReturn(x.data, f.req), old = version(row)
    row = await returns.updateReturn(row.id, { ...x.data, ...version(row), notes: 'Edited draft' }, f.req)
    expect(row.updatedAt.getTime()).toBeGreaterThan(new Date(old.expectedUpdatedAt).getTime())
    await expect(returns.updateReturn(row.id, { ...x.data, ...old }, f.req)).rejects.toMatchObject({ status: 409 })
    await expect(returns.updateReturn(row.id, { ...x.data, ...version(row), receiptId: 'different' }, f.req)).rejects.toMatchObject({ status: 400 })
    await expect(returns.transitionReturn(row.id, 'submit', old, f.req)).rejects.toMatchObject({ status: 409 })
    row = await action(row, 'submit'); await expect(returns.updateReturn(row.id, { ...x.data, ...version(row) }, f.req)).rejects.toMatchObject({ status: 409 })
    row = await action(row, 'cancel'); expect(row.items).toHaveLength(1); expect(await x.stock()).toMatchObject({ quantity: 3, reservedQuantity: 0 })
    await expect(action(row, 'submit')).rejects.toMatchObject({ status: 409 })
  })
  it('allows only one competing receipt claim and only one physical shipment', async () => {
    const x = await fixture(), a = await returns.createReturn(x.data, f.req), b = await returns.createReturn(x.data, f.req)
    const claims = await Promise.allSettled([action(a, 'submit'), action(b, 'submit')]); expect(claims.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    let row = claims.find(result => result.status === 'fulfilled').value; expect(await x.stock()).toMatchObject({ quantity: 3, reservedQuantity: 3 })
    row = await action(row, 'approve')
    const ships = await Promise.allSettled([action(row, 'ship', { shipmentReference: 'Parcel 1' }), action(row, 'ship', { shipmentReference: 'Parcel 2' })]); expect(ships.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(await x.stock()).toMatchObject({ quantity: 0, reservedQuantity: 0 }); expect(await db.stockMovement.count({ where: { referenceNumber: row.returnNumber, type: 'SUPPLIER_RETURN' } })).toBe(1)
  })
  it('serial claim and ship/cancel races have one winner with consistent balances and identity', async () => {
    const x = await fixture(true), a = await returns.createReturn(x.data, f.req), b = await returns.createReturn(x.data, f.req)
    const claims = await Promise.allSettled([action(a, 'submit'), action(b, 'submit')]); expect(claims.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    let row = await action(claims.find(result => result.status === 'fulfilled').value, 'approve')
    const results = await Promise.allSettled([action(row, 'ship', { shipmentReference: 'Race parcel' }), action(row, 'cancel')]); expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    row = await returns.getReturn(row.id, f.req.user); expect(await x.stock()).toMatchObject({ quantity: row.status === 'SHIPPED' ? 0 : 3, reservedQuantity: 0 })
    expect(row.items[0].serialSelections.every(selection => selection.serialNumber.status === (row.status === 'SHIPPED' ? 'RETURNED' : 'AVAILABLE'))).toBe(true)
  })
  it('enforces every HTTP permission, warehouse scope, list boundaries and next-request revocation', async () => {
    const x = await fixture(), row = await returns.createReturn(x.data, f.req), path = `/supplier-returns/${row.id}`
    expect((await http('', '/supplier-returns')).status).toBe(401)
    expect((await http(f.tokens.viewer, path)).status).toBe(200)
    expect((await http(f.tokens.foreign, path)).status).toBe(403)
    expect((await http(f.tokens.foreign, `/supplier-returns/sources/${x.receipt.id}`)).status).toBe(403)
    expect((await http(f.tokens.foreign, '/supplier-returns', 'POST', x.data)).status).toBe(403)
    expect((await http(f.tokens.unassigned, '/supplier-returns')).data).toEqual([])
    expect((await http(f.tokens.foreign, '/supplier-returns')).data).toEqual([])
    expect((await http(f.tokens.viewer, '/supplier-returns/sources')).status).toBe(403)
    expect((await http(f.tokens.viewer, '/supplier-returns', 'POST', x.data)).status).toBe(403)
    expect((await http(f.tokens.viewer, path, 'PUT', { ...x.data, ...version(row) })).status).toBe(403)
    for (const event of ['submit', 'approve', 'ship', 'complete', 'cancel']) expect((await http(f.tokens.viewer, `${path}/${event}`, 'POST', { ...version(row), shipmentReference: 'Permission parcel', notes: 'Supplier acknowledgement' })).status).toBe(403)
    expect((await http(f.tokens.operator, '/supplier-returns?status=INVALID')).status).toBe(400)
    const permission = await db.permission.findUnique({ where: { module_action: { module: 'supplier_returns', action: 'EDIT' } } })
    await db.rolePermission.delete({ where: { roleId_permissionId: { roleId: f.users.operator.roleId, permissionId: permission.id } } })
    expect((await http(f.tokens.operator, `${path}/submit`, 'POST', version(row))).status).toBe(403)
    await db.rolePermission.create({ data: { roleId: f.users.operator.roleId, permissionId: permission.id } })
    const submitted = await http(f.tokens.operator, `${path}/submit`, 'POST', version(row)); expect(submitted.status).toBe(200)
    expect((await http(f.tokens.operator, `${path}/approve`, 'POST', { expectedUpdatedAt: submitted.data.updatedAt })).status).toBe(200)
  })
  it('keeps returned serial history scoped to its return warehouse and hides references without module permission', async () => {
    const x = await fixture(true); let row = await returns.createReturn(x.data, f.req); row = await action(row, 'submit'); row = await action(row, 'approve'); await action(row, 'ship', { shipmentReference: 'History parcel' })
    const serialId = x.data.items[0].serialNumberIds[0]
    const user = { role: 'Staff', warehouseIds: [x.receipt.warehouseId], permissions: ['inventory.VIEW', 'supplier_returns.VIEW'] }
    expect((await lifecycle.getSerialLifecycle(serialId, user)).status).toBe('RETURNED')
    expect((await lifecycle.listSerialEvents(serialId, {}, user)).data.filter(event => event.referenceType === 'SupplierReturn')).toHaveLength(2)
    expect((await lifecycle.listSerialEvents(serialId, {}, { ...user, permissions: ['inventory.VIEW'] })).data.some(event => event.referenceType === 'SupplierReturn')).toBe(false)
    await expect(lifecycle.getSerialLifecycle(serialId, { ...user, warehouseIds: [f.warehouses[1].id] })).rejects.toMatchObject({ status: 403 })
  })
})
