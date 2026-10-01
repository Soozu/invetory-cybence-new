import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import bcrypt from 'bcrypt'
import { rfqSchema, quotationSchema, quotationConversionSchema } from '../src/validators/rfqs.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('RFQs and supplier quotations with isolated MySQL', () => {
  let db, rfqs, quotes, requests, f, server, origin
  const suffix = Date.now().toString(36)
  const http = async (token, path, method = 'GET', body) => {
    const response = await fetch(`${origin}/api${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
    return { status: response.status, ...await response.json() }
  }
  beforeAll(async () => {
    if (!/^techstock_test_warehouse_[a-z0-9_]+$/.test(new URL(process.env.TEST_DATABASE_URL).pathname.slice(1))) throw Error('Unsafe test schema')
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
    db = (await import('../src/config/prisma.js')).prisma
    rfqs = await import('../src/services/rfqService.js')
    quotes = await import('../src/services/quotationService.js')
    requests = await import('../src/services/purchaseRequestService.js')
    const warehouses = await Promise.all(['A', 'B'].map(code => db.warehouse.create({ data: { name: `RFQ ${code} ${suffix}`, code: `RFQ-${code}-${suffix}` } })))
    const category = await db.category.create({ data: { name: `RFQ category ${suffix}`, slug: `rfq-category-${suffix}` } })
    const brand = await db.brand.create({ data: { name: `RFQ brand ${suffix}`, slug: `rfq-brand-${suffix}` } })
    const products = await Promise.all([0, 1].map(index => db.product.create({ data: { name: `RFQ product ${index}`, sku: `RFQ-P-${suffix}-${index}`, categoryId: category.id, brandId: brand.id } })))
    const suppliers = await Promise.all([0, 1, 2].map(index => db.supplier.create({ data: { companyName: `RFQ supplier ${index} ${suffix}`, supplierCode: `RFQ-S-${suffix}-${index}` } })))
    const adminRole = await db.role.upsert({ where: { name: 'Administrator' }, create: { name: 'Administrator' }, update: {} })
    const passwordHash = await bcrypt.hash('RFQTest123!', 4)
    const makeUser = async (name, actions, warehouse, purchasing = false) => {
      const role = await db.role.create({ data: { name: `RFQ ${name} ${suffix}` } })
      for (const action of actions) {
        const permission = await db.permission.findUnique({ where: { module_action: { module: 'rfqs', action } } })
        await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } })
      }
      if (purchasing) {
        const permission = await db.permission.upsert({ where: { module_action: { module: 'purchasing', action: 'CREATE' } }, create: { module: 'purchasing', action: 'CREATE' }, update: {} })
        await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } })
      }
      return db.user.create({ data: { firstName: name, lastName: 'Test', email: `rfq-${name}-${suffix}@rfq.test`, passwordHash, roleId: role.id, ...(warehouse ? { warehouseAssignments: { create: { warehouseId: warehouse.id } } } : {}) } })
    }
    const admin = await db.user.create({ data: { firstName: 'RFQ admin', lastName: 'Test', email: `rfq-admin-${suffix}@rfq.test`, passwordHash, roleId: adminRole.id } })
    const users = {
      admin,
      editor: await makeUser('editor', ['VIEW', 'CREATE', 'EDIT'], warehouses[0]),
      foreign: await makeUser('foreign', ['VIEW', 'CREATE', 'EDIT', 'ISSUE', 'CLOSE', 'AWARD', 'CONVERT'], warehouses[1], true),
      viewer: await makeUser('viewer', ['VIEW'], warehouses[0]),
      unassigned: await makeUser('unassigned', ['VIEW'], null),
      converter: await makeUser('converter', ['VIEW', 'CONVERT'], warehouses[0]),
      operator: await makeUser('operator', ['VIEW', 'CREATE', 'EDIT', 'ISSUE', 'CLOSE', 'AWARD', 'CONVERT'], warehouses[0], true),
      blind: await makeUser('blind', ['CREATE'], warehouses[0]),
      poOnly: await makeUser('po-only', ['VIEW'], warehouses[0], true)
    }
    const { app } = await import('../src/app.js')
    server = app.listen(0, '127.0.0.1')
    await new Promise(resolve => server.once('listening', resolve))
    origin = `http://127.0.0.1:${server.address().port}`
    const tokens = {}
    for (const [name, user] of Object.entries(users)) tokens[name] = (await http('', '/auth/login', 'POST', { email: user.email, password: 'RFQTest123!' })).data.accessToken
    f = { warehouses, products, suppliers, users, tokens, req: { user: { id: admin.id, role: 'Administrator' }, get: () => null } }
  }, 30000)
  afterAll(async () => { if (server) await new Promise(resolve => server.close(resolve)); if (db) await db.$disconnect() })
  const version = row => ({ expectedUpdatedAt: row.updatedAt.toISOString() })
  const input = () => ({ warehouseId: f.warehouses[0].id, closingDate: new Date(Date.now() + 86400000), supplierIds: f.suppliers.slice(0, 2).map(row => row.id), items: [{ productId: f.products[0].id, description: '', quantity: 2 }, { productId: null, description: 'Network adapter', quantity: 3 }] })
  const action = (row, event) => rfqs.transitionRFQ(row.id, event, version(row), f.req)
  const fresh = row => rfqs.getRFQ(row.id, f.req.user)
  const issued = async () => action(await rfqs.createRFQ(input(), f.req), 'issue')
  const quoteInput = (row, supplier = 0, price = 10.25) => ({ supplierId: f.suppliers[supplier].id, quotationDate: new Date(), validUntil: new Date(Date.now() + 172800000), deliveryDays: 3, paymentTerms: 'Net 30', tax: 1.23, shipping: 2.34, items: row.items.map(item => ({ rfqItemId: item.id, unitPrice: price, brandOffered: 'Test brand' })) })
  const submit = (row, quote) => quotes.transitionQuotation(row.id, quote.id, 'submit', version(quote), f.req)
  const conversion = quote => ({ ...version(quote), items: quote.items.map(item => ({ quotationItemId: item.id, productId: item.rfqItem.productId || f.products[1].id })) })
  const award = (row, quote) => rfqs.awardRFQ(row.id, { ...version(row), quotationId: quote.id, notes: 'Faster delivery meets the business deadline' }, f.req)

  it('validates supplier, requested-item, date, currency and mapping identities', async () => {
    expect(rfqSchema.safeParse({ ...input(), supplierIds: [f.suppliers[0].id, f.suppliers[0].id] }).success).toBe(false)
    expect(rfqSchema.safeParse({ ...input(), items: [{ description: '', quantity: 0 }] }).success).toBe(false)
    const row = await issued(), data = quoteInput(row)
    expect(quotationSchema.safeParse({ ...data, items: [data.items[0], data.items[0]] }).success).toBe(false)
    expect(quotationSchema.safeParse({ ...data, items: [{ ...data.items[0], unitPrice: 1.001 }] }).success).toBe(false)
    expect(quotationSchema.safeParse({ ...data, validUntil: new Date(0) }).success).toBe(false)
    await expect(rfqs.createRFQ({ ...input(), supplierIds: ['missing'] }, f.req)).rejects.toMatchObject({ status: 400 })
    await expect(rfqs.createRFQ({ ...input(), items: [input().items[0], input().items[0]] }, f.req)).rejects.toMatchObject({ status: 400 })
    await expect(quotes.createQuotation(row.id, { ...data, supplierId: f.suppliers[2].id }, f.req)).rejects.toMatchObject({ status: 400 })
    await expect(quotes.createQuotation(row.id, { ...data, items: data.items.slice(0, 1) }, f.req)).rejects.toMatchObject({ status: 400 })
    await expect(quotes.createQuotation(row.id, { ...data, items: data.items.map(item => ({ ...item, rfqItemId: 'foreign' })) }, f.req)).rejects.toMatchObject({ status: 400 })
    const before = await db.supplierQuotation.count()
    await expect(quotes.createQuotation(row.id, { ...data, items: data.items.map(item => ({ ...item, unitPrice: 999999999999.99 })) }, f.req)).rejects.toMatchObject({ status: 400 })
    expect(await db.supplierQuotation.count()).toBe(before)
  })

  it('snapshots only approved PR lines and blocks competing RFQs and direct PR conversion/cancellation', async () => {
    let request = await requests.createRequest({ department: 'IT', warehouseId: f.warehouses[0].id, justification: 'Replace equipment', items: input().items.map(item => ({ ...item, estimatedUnitCost: 5 })) }, f.req)
    await expect(rfqs.createRFQ({ ...input(), purchaseRequestId: request.id }, f.req)).rejects.toMatchObject({ status: 409 })
    request = await requests.transitionRequest(request.id, 'submit', version(request), f.req)
    request = await requests.transitionRequest(request.id, 'approve', version(request), f.req)
    const data = { ...input(), purchaseRequestId: request.id, items: [{ description: 'Forged quantity', quantity: 999 }] }
    const results = await Promise.allSettled([rfqs.createRFQ(data, f.req), rfqs.createRFQ(data, f.req)])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const row = results.find(result => result.status === 'fulfilled').value
    expect(row.items.map(item => item.quantity).sort()).toEqual([2, 3])
    expect(row.items.map(item => item.purchaseRequestItemId).sort()).toEqual(request.items.map(item => item.id).sort())
    await expect(requests.transitionRequest(request.id, 'cancel', version(request), f.req)).rejects.toMatchObject({ status: 409 })
    await expect(requests.convertRequest(request.id, { ...version(request), supplierId: f.suppliers[0].id, items: [] }, f.req)).rejects.toMatchObject({ status: 409 })
    f.request = request; f.flow = row
  })

  it('rejects stale draft edits, stale issuing, source changes and post-issue edits', async () => {
    let row = await rfqs.createRFQ(input(), f.req)
    const stale = version(row)
    // Force a distinct millisecond version so the test does not depend on timing.
    await db.rFQ.update({ where: { id: row.id }, data: { updatedAt: new Date(row.updatedAt.getTime() + 1000) } })
    await expect(rfqs.updateRFQ(row.id, { ...input(), ...stale }, f.req)).rejects.toMatchObject({ status: 409 })
    await expect(rfqs.transitionRFQ(row.id, 'issue', stale, f.req)).rejects.toMatchObject({ status: 409 })
    row = await fresh(row)
    await expect(rfqs.updateRFQ(row.id, { ...input(), ...version(row), purchaseRequestId: f.request.id }, f.req)).rejects.toMatchObject({ status: 400 })
    row = await rfqs.updateRFQ(row.id, { ...input(), ...version(row), notes: 'Revised invitation' }, f.req)
    row = await action(row, 'issue')
    await expect(rfqs.updateRFQ(row.id, { ...input(), ...version(row) }, f.req)).rejects.toMatchObject({ status: 409 })
    let request = await requests.createRequest({ department: 'IT', justification: 'Verify source changes before issue', warehouseId: f.warehouses[0].id, items: input().items.map(item => ({ ...item, estimatedUnitCost: 5 })) }, f.req)
    request = await requests.transitionRequest(request.id, 'submit', version(request), f.req)
    request = await requests.transitionRequest(request.id, 'approve', version(request), f.req)
    const linked = await rfqs.createRFQ({ ...input(), purchaseRequestId: request.id }, f.req)
    await db.purchaseRequest.update({ where: { id: request.id }, data: { status: 'CANCELLED' } })
    await expect(action(linked, 'issue')).rejects.toMatchObject({ status: 409 })
    expect((await fresh(linked)).status).toBe('DRAFT')
    expect((await fresh(linked)).suppliers.every(invitation => invitation.invitedAt === null)).toBe(true)
  })

  it('uses authoritative quantities and decimals, excludes drafts and freezes submitted offers', async () => {
    f.flow = await action(f.flow, 'issue')
    expect(f.flow.suppliers.every(row => row.invitedAt)).toBe(true)
    const data = quoteInput(f.flow)
    let quote = await quotes.createQuotation(f.flow.id, { ...data, total: 0, items: data.items.map(item => ({ ...item, quantity: 999, subtotal: 0 })) }, f.req)
    expect(quote.items.map(item => item.quantity).sort()).toEqual([2, 3])
    expect(quote.total.toFixed(2)).toBe('54.82')
    expect((await rfqs.compareRFQ(f.flow.id, f.req.user)).quotations).toHaveLength(0)
    await expect(quotes.createQuotation(f.flow.id, data, f.req)).rejects.toMatchObject({ status: 409 })
    const stale = version(quote)
    await db.supplierQuotation.update({ where: { id: quote.id }, data: { updatedAt: new Date(quote.updatedAt.getTime() + 1000) } })
    await expect(quotes.updateQuotation(f.flow.id, quote.id, { ...data, ...stale }, f.req)).rejects.toMatchObject({ status: 409 })
    await expect(quotes.transitionQuotation(f.flow.id, quote.id, 'submit', stale, f.req)).rejects.toMatchObject({ status: 409 })
    quote = await quotes.getQuotation(f.flow.id, quote.id, f.req.user)
    await expect(quotes.updateQuotation(f.flow.id, quote.id, { ...data, ...version(quote), supplierId: f.suppliers[1].id }, f.req)).rejects.toMatchObject({ status: 400 })
    quote = await quotes.updateQuotation(f.flow.id, quote.id, { ...data, ...version(quote), paymentTerms: 'Net 45' }, f.req)
    quote = await submit(f.flow, quote)
    await expect(quotes.updateQuotation(f.flow.id, quote.id, { ...data, ...version(quote) }, f.req)).rejects.toMatchObject({ status: 409 })
    await expect(submit(f.flow, quote)).rejects.toMatchObject({ status: 409 })
    const comparison = await rfqs.compareRFQ(f.flow.id, f.req.user)
    expect(comparison.quotations.map(row => row.id)).toEqual([quote.id])
    expect(comparison.rfq.selectedQuotationId).toBeNull()
    expect(comparison.rfq.suppliers.find(row => row.supplierId === quote.supplierId).respondedAt).not.toBeNull()
    f.low = quote
    f.high = await submit(f.flow, await quotes.createQuotation(f.flow.id, quoteInput(f.flow, 1, 20.10), f.req))
  })

  it('requires current close and explicit manual award, permits a higher-price business choice without ordering', async () => {
    const before = { orders: await db.purchaseOrder.count(), movements: await db.stockMovement.count(), stocks: await db.warehouseStock.findMany({ orderBy: { id: 'asc' } }) }
    await expect(award(await fresh(f.flow), f.high)).rejects.toMatchObject({ status: 409 })
    await expect(action(f.flow, 'close')).rejects.toMatchObject({ status: 409 })
    f.flow = await action(await fresh(f.flow), 'close')
    await expect(quotes.createQuotation(f.flow.id, quoteInput(f.flow, 2), f.req)).rejects.toMatchObject({ status: 409 })
    await expect(rfqs.awardRFQ(f.flow.id, { ...version(f.flow), quotationId: f.high.id, notes: '' }, f.req)).rejects.toMatchObject({ status: 400 })
    f.flow = await award(f.flow, f.high)
    expect(f.flow.selectedQuotationId).toBe(f.high.id)
    expect(f.flow.selectedBy.id).toBe(f.req.user.id)
    expect(f.flow.selectionNotes).toContain('Faster delivery')
    expect(await db.purchaseOrder.count()).toBe(before.orders)
    expect(await db.stockMovement.count()).toBe(before.movements)
    expect(await db.warehouseStock.findMany({ orderBy: { id: 'asc' } })).toEqual(before.stocks)
    expect((await requests.getRequest(f.request.id, f.req.user)).status).toBe('APPROVED')
    f.high = await quotes.getQuotation(f.flow.id, f.high.id, f.req.user)
    await expect(quotes.convertQuotation(f.flow.id, f.low.id, conversion(f.low), f.req)).rejects.toMatchObject({ status: 409 })
  })

  it('rolls back invalid mappings and creates one exact linked draft PO under competing conversions', async () => {
    const data = conversion(f.high), before = await db.purchaseOrder.count(), movements = await db.stockMovement.count()
    expect(quotationConversionSchema.safeParse({ ...data, items: [data.items[0], data.items[0]] }).success).toBe(false)
    await expect(quotes.convertQuotation(f.flow.id, f.high.id, { ...data, items: data.items.slice(0, 1) }, f.req)).rejects.toMatchObject({ status: 400 })
    await expect(quotes.convertQuotation(f.flow.id, f.high.id, { ...data, items: data.items.map(item => ({ ...item, productId: f.products[1].id })) }, f.req)).rejects.toMatchObject({ status: 400 })
    await expect(quotes.convertQuotation(f.flow.id, f.high.id, { ...data, items: data.items.map(item => ({ ...item, productId: 'missing' })) }, f.req)).rejects.toMatchObject({ status: 400 })
    await expect(quotes.convertQuotation(f.flow.id, f.high.id, { ...data, expectedUpdatedAt: new Date(0).toISOString() }, f.req)).rejects.toMatchObject({ status: 409 })
    expect(await db.purchaseOrder.count()).toBe(before)
    const results = await Promise.allSettled([quotes.convertQuotation(f.flow.id, f.high.id, data, f.req), quotes.convertQuotation(f.flow.id, f.high.id, data, f.req)])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(result => result.status === 'rejected').reason.status).toBe(409)
    expect(await db.purchaseOrder.count()).toBe(before + 1)
    const { quotation, purchaseOrder: order } = results.find(result => result.status === 'fulfilled').value
    expect(order.status).toBe('DRAFT'); expect(order.supplierId).toBe(f.high.supplierId); expect(order.warehouseId).toBe(f.flow.warehouseId)
    expect(order.items.map(item => item.quantity).sort()).toEqual([2, 3])
    expect(order.items.every(item => item.unitCost.toFixed(2) === '20.10')).toBe(true)
    expect(order.subtotal.toFixed(2)).toBe('100.50'); expect(order.tax.toFixed(2)).toBe('1.23'); expect(order.shipping.toFixed(2)).toBe('2.34'); expect(order.total.toFixed(2)).toBe('104.07')
    expect(quotation.purchaseOrderId).toBe(order.id)
    const request = await requests.getRequest(f.request.id, f.req.user)
    expect(request.status).toBe('CONVERTED'); expect(request.purchaseOrderId).toBe(order.id)
    const linked = await db.purchaseOrder.findUnique({ where: { id: order.id }, include: { sourcePurchaseRequest: true, sourceQuotation: true } })
    expect(linked.sourcePurchaseRequest.id).toBe(request.id); expect(linked.sourceQuotation.rfqId).toBe(f.flow.id)
    expect(await db.stockMovement.count()).toBe(movements)
    await expect(action(await fresh(f.flow), 'cancel')).rejects.toMatchObject({ status: 409 })
    expect(await db.activityLog.count({ where: { entityId: quotation.id, action: 'CONVERTED' } })).toBe(1)
  })

  it('allows one winner under competing manual awards and rejects draft or unrelated offers', async () => {
    let row = await issued()
    let a = await quotes.createQuotation(row.id, quoteInput(row), f.req)
    await expect(award(await action(await fresh(row), 'close'), a)).rejects.toMatchObject({ status: 400 })
    // A fresh RFQ is required once collection has closed.
    row = await issued()
    a = await submit(row, await quotes.createQuotation(row.id, quoteInput(row), f.req))
    const b = await submit(row, await quotes.createQuotation(row.id, quoteInput(row, 1), f.req))
    row = await action(await fresh(row), 'close')
    await expect(award(row, f.low)).rejects.toMatchObject({ status: 400 })
    const results = await Promise.allSettled([award(row, a), award(row, b)])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(result => result.status === 'rejected').reason.status).toBe(409)
    expect(await db.supplierQuotation.count({ where: { rfqId: row.id, status: 'ACCEPTED' } })).toBe(1)
  })

  it('enforces closing deadlines, offer expiry, supplier availability and conversion expiry', async () => {
    let row = await issued(), quote = await quotes.createQuotation(row.id, quoteInput(row), f.req)
    await db.supplierQuotation.update({ where: { id: quote.id }, data: { validUntil: new Date(0) } })
    quote = await quotes.getQuotation(row.id, quote.id, f.req.user)
    await expect(submit(row, quote)).rejects.toMatchObject({ status: 409 })
    await db.supplierQuotation.update({ where: { id: quote.id }, data: { validUntil: new Date(Date.now() + 86400000) } })
    quote = await quotes.getQuotation(row.id, quote.id, f.req.user)
    await db.supplier.update({ where: { id: quote.supplierId }, data: { status: 'INACTIVE' } })
    try { await expect(submit(row, quote)).rejects.toMatchObject({ status: 400 }) } finally { await db.supplier.update({ where: { id: quote.supplierId }, data: { status: 'ACTIVE' } }) }
    await db.rFQ.update({ where: { id: row.id }, data: { closingDate: new Date(0) } })
    await expect(submit(row, quote)).rejects.toMatchObject({ status: 409 })
    await expect(quotes.updateQuotation(row.id, quote.id, { ...quoteInput(row), ...version(quote) }, f.req)).rejects.toMatchObject({ status: 409 })
    await expect(quotes.createQuotation(row.id, quoteInput(row, 1), f.req)).rejects.toMatchObject({ status: 409 })
    row = await issued(); quote = await submit(row, await quotes.createQuotation(row.id, quoteInput(row), f.req))
    row = await action(await fresh(row), 'close')
    await db.supplierQuotation.update({ where: { id: quote.id }, data: { validUntil: new Date(0) } })
    await expect(award(row, quote)).rejects.toMatchObject({ status: 409 })
    await db.supplierQuotation.update({ where: { id: quote.id }, data: { validUntil: new Date(Date.now() + 86400000) } })
    row = await award(row, quote)
    await db.supplierQuotation.update({ where: { id: quote.id }, data: { validUntil: new Date(0) } })
    quote = await quotes.getQuotation(row.id, quote.id, f.req.user)
    await expect(quotes.convertQuotation(row.id, quote.id, conversion(quote), f.req)).rejects.toMatchObject({ status: 409 })
  })

  it('retains cancelled rounds and quotations and reopens the source PR for a fresh round', async () => {
    let request = await requests.createRequest({ department: 'IT', justification: 'Collect revised supplier offers', warehouseId: f.warehouses[0].id, items: input().items.map(item => ({ ...item, estimatedUnitCost: 5 })) }, f.req)
    request = await requests.transitionRequest(request.id, 'submit', version(request), f.req)
    request = await requests.transitionRequest(request.id, 'approve', version(request), f.req)
    let row = await rfqs.createRFQ({ ...input(), purchaseRequestId: request.id }, f.req)
    row = await action(row, 'issue')
    const quote = await submit(row, await quotes.createQuotation(row.id, quoteInput(row), f.req))
    row = await action(await fresh(row), 'cancel')
    expect(row.items).toHaveLength(2); expect(row.suppliers).toHaveLength(2)
    expect((await quotes.getQuotation(row.id, quote.id, f.req.user)).status).toBe('CANCELLED')
    expect((await rfqs.compareRFQ(row.id, f.req.user)).quotations).toHaveLength(0)
    await expect(action(row, 'issue')).rejects.toMatchObject({ status: 409 })
    expect((await rfqs.createRFQ({ ...input(), purchaseRequestId: request.id }, f.req)).id).not.toBe(row.id)
  })

  it('enforces every action permission and both conversion permissions over HTTP', async () => {
    const token = f.tokens.viewer, row = await rfqs.createRFQ(input(), f.req)
    expect((await http(token, `/rfqs/${row.id}`)).status).toBe(200)
    expect((await http(token, '/rfqs', 'POST', input())).status).toBe(403)
    expect((await http(token, `/rfqs/${row.id}`, 'PUT', {})).status).toBe(403)
    for (const event of ['issue', 'close', 'cancel', 'award']) expect((await http(token, `/rfqs/${row.id}/${event}`, 'POST', {})).status).toBe(403)
    expect((await http(token, `/rfqs/${row.id}/quotations`, 'POST', {})).status).toBe(403)
    for (const method of ['PUT', 'POST']) expect((await http(token, `/rfqs/${f.flow.id}/quotations/${f.high.id}${method === 'POST' ? '/submit' : ''}`, method, {})).status).toBe(403)
    for (const name of ['viewer', 'converter', 'poOnly']) expect((await http(f.tokens[name], `/rfqs/${f.flow.id}/quotations/${f.high.id}/convert`, 'POST', {})).status).toBe(403)
    for (const event of ['issue', 'close', 'award']) expect((await http(f.tokens.editor, `/rfqs/${row.id}/${event}`, 'POST', {})).status).toBe(403)
    expect((await http(f.tokens.editor, `/rfqs/${row.id}/issue`, 'POST', {})).status).toBe(403)
    expect((await http(f.tokens.admin, `/rfqs/${row.id}/issue`, 'POST', {})).status).toBe(400)
    expect((await http(token, '/rfqs?status=INVALID')).status).toBe(400)
    for (const path of ['/rfqs', `/rfqs/${row.id}`, `/rfqs/${row.id}/comparison`, `/rfqs/${f.flow.id}/quotations/${f.high.id}`]) expect((await http(f.tokens.blind, path)).status).toBe(403)
  })

  it('enforces warehouse scope for lists, filters, RFQs, quotations, comparison and writes', async () => {
    const token = f.tokens.foreign, row = await issued(), quote = await quotes.createQuotation(row.id, quoteInput(row), f.req)
    expect((await http(token, '/rfqs')).data).toEqual([])
    expect((await http(f.tokens.unassigned, '/rfqs')).data).toEqual([])
    expect((await http(token, `/rfqs?warehouse=${row.warehouseId}`)).status).toBe(403)
    for (const path of [`/rfqs/${row.id}`, `/rfqs/${row.id}/comparison`, `/rfqs/${row.id}/quotations/${quote.id}`]) expect((await http(token, path)).status).toBe(403)
    expect((await http(token, '/rfqs', 'POST', input())).status).toBe(403)
    for (const event of ['close', 'cancel', 'award']) expect((await http(token, `/rfqs/${row.id}/${event}`, 'POST', { ...version(row), quotationId: quote.id, notes: 'Scope test' })).status).toBe(403)
    expect((await http(token, `/rfqs/${row.id}/quotations`, 'POST', quoteInput(row, 1))).status).toBe(403)
    expect((await http(token, `/rfqs/${row.id}/quotations/${quote.id}/convert`, 'POST', conversion(quote))).status).toBe(403)
    expect((await http(f.tokens.admin, `/rfqs/${f.flow.id}/quotations/${quote.id}`)).status).toBe(404)
    expect((await http(token, '/rfqs', 'POST', { ...input(), warehouseId: f.warehouses[1].id, purchaseRequestId: f.request.id })).status).toBe(403)
    expect((await http(token, `/rfqs/${row.id}`, 'PUT', { ...input(), ...version(row) })).status).toBe(403)
    expect((await http(token, `/rfqs/${row.id}/issue`, 'POST', version(row))).status).toBe(403)
    expect((await http(token, `/rfqs/${row.id}/quotations/${quote.id}`, 'PUT', { ...quoteInput(row), ...version(quote) })).status).toBe(403)
    for (const event of ['submit', 'cancel']) expect((await http(token, `/rfqs/${row.id}/quotations/${quote.id}/${event}`, 'POST', version(quote))).status).toBe(403)
  })

  it('completes PR to manually selected quotation to exactly one draft PO through real HTTP', async () => {
    const admin = f.tokens.admin, token = f.tokens.operator
    const before = { orders: await db.purchaseOrder.count(), movements: await db.stockMovement.count(), stocks: await db.warehouseStock.findMany({ orderBy: { id: 'asc' } }) }
    let result = await http(admin, '/purchase-requests', 'POST', { department: 'IT', justification: 'HTTP procurement acceptance workflow', warehouseId: f.warehouses[0].id, items: input().items.map(item => ({ ...item, estimatedUnitCost: 5 })) })
    expect(result.status).toBe(201)
    let request = result.data
    for (const event of ['submit', 'approve']) { result = await http(admin, `/purchase-requests/${request.id}/${event}`, 'POST', { expectedUpdatedAt: request.updatedAt }); expect(result.status).toBe(200); request = result.data }
    result = await http(token, '/rfqs', 'POST', { ...input(), purchaseRequestId: request.id })
    expect(result.status).toBe(201)
    let row = result.data
    expect(row.items.map(item => item.purchaseRequestItemId).sort()).toEqual(request.items.map(item => item.id).sort())
    result = await http(token, `/rfqs/${row.id}/issue`, 'POST', { expectedUpdatedAt: row.updatedAt }); expect(result.status).toBe(200); row = result.data
    const offers = []
    for (const supplier of [0, 1]) {
      result = await http(token, `/rfqs/${row.id}/quotations`, 'POST', { ...quoteInput(row, supplier, supplier ? 20.10 : 10.25), quantity: 999, total: 0 })
      expect(result.status).toBe(201)
      const quote = result.data
      result = await http(token, `/rfqs/${row.id}/quotations/${quote.id}/submit`, 'POST', { expectedUpdatedAt: quote.updatedAt }); expect(result.status).toBe(200); offers.push(result.data)
    }
    result = await http(token, `/rfqs/${row.id}/comparison`); expect(result.status).toBe(200); expect(result.data.quotations).toHaveLength(2); expect(result.data.rfq.selectedQuotationId).toBeNull(); row = result.data.rfq
    result = await http(token, `/rfqs/${row.id}/close`, 'POST', { expectedUpdatedAt: row.updatedAt }); expect(result.status).toBe(200); row = result.data
    result = await http(token, `/rfqs/${row.id}/award`, 'POST', { expectedUpdatedAt: row.updatedAt, quotationId: offers[1].id, notes: 'Higher price accepted for faster delivery' }); expect(result.status).toBe(200)
    expect(result.data.selectedQuotationId).toBe(offers[1].id); expect(await db.purchaseOrder.count()).toBe(before.orders)
    const quote = (await http(token, `/rfqs/${row.id}/quotations/${offers[1].id}`)).data
    const body = { expectedUpdatedAt: quote.updatedAt, items: quote.items.map(item => ({ quotationItemId: item.id, productId: item.rfqItem.productId || f.products[1].id })), quantity: 999, tax: 0, shipping: 0 }
    const conversions = await Promise.all([http(token, `/rfqs/${row.id}/quotations/${quote.id}/convert`, 'POST', body), http(token, `/rfqs/${row.id}/quotations/${quote.id}/convert`, 'POST', body)])
    expect(conversions.map(response => response.status).sort()).toEqual([201, 409])
    const order = conversions.find(response => response.status === 201).data.purchaseOrder
    expect(order.status).toBe('DRAFT'); expect(order.total).toBe('104.07'); expect(order.subtotal).toBe('100.5'); expect(order.tax).toBe('1.23'); expect(order.shipping).toBe('2.34')
    expect(order.items.map(item => item.quantity).sort()).toEqual([2, 3]); expect(order.items.every(item => Number(item.unitCost) === 20.10)).toBe(true)
    const projected = (await http(admin, '/bootstrap')).data.orders.find(item => item.id === order.id)
    expect(projected.lines.map(line => line.subtotal).sort()).toEqual([40.20, 60.30]); expect(projected.amount).toBe(104.07)
    request = (await http(admin, `/purchase-requests/${request.id}`)).data
    expect(request.status).toBe('CONVERTED'); expect(request.purchaseOrder.id).toBe(order.id); expect(request.rfqs[0].id).toBe(row.id)
    expect((await http(token, `/rfqs/${row.id}/quotations/${quote.id}`)).data.purchaseOrder.id).toBe(order.id)
    expect(await db.purchaseOrder.count()).toBe(before.orders + 1); expect(await db.stockMovement.count()).toBe(before.movements); expect(await db.warehouseStock.findMany({ orderBy: { id: 'asc' } })).toEqual(before.stocks)
  })

  it('serializes close against quotation submission and rejects stale simultaneous draft edits', async () => {
    let row = await issued(), quote = await quotes.createQuotation(row.id, quoteInput(row), f.req)
    const edits = await Promise.allSettled(['First revision', 'Second revision'].map(notes => quotes.updateQuotation(row.id, quote.id, { ...quoteInput(row), ...version(quote), notes }, f.req)))
    expect(edits.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(edits.find(result => result.status === 'rejected').reason.status).toBe(409)
    quote = await quotes.getQuotation(row.id, quote.id, f.req.user); row = await fresh(row)
    const race = await Promise.allSettled([submit(row, quote), action(row, 'close')])
    expect(race.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(race.find(result => result.status === 'rejected').reason.status).toBe(409)
    row = await fresh(row)
    if (row.status === 'ISSUED') row = await action(row, 'close')
    expect(row.status).toBe('CLOSED')
    quote = await quotes.getQuotation(row.id, quote.id, f.req.user)
    await expect(submit(row, quote)).rejects.toMatchObject({ status: 409 })
  })

  it('revokes existing-token warehouse access on the next RFQ and quotation request', async () => {
    const row = await issued(), quote = await quotes.createQuotation(row.id, quoteInput(row), f.req), token = f.tokens.operator
    expect((await http(token, `/rfqs/${row.id}`)).status).toBe(200)
    await db.userWarehouse.deleteMany({ where: { userId: f.users.operator.id } })
    for (const path of [`/rfqs/${row.id}`, `/rfqs/${row.id}/comparison`, `/rfqs/${row.id}/quotations/${quote.id}`]) expect((await http(token, path)).status).toBe(403)
    expect((await http(token, '/rfqs')).data).toEqual([])
    expect((await http(token, `/rfqs/${row.id}/quotations/${quote.id}/submit`, 'POST', version(quote))).status).toBe(403)
    expect((await quotes.getQuotation(row.id, quote.id, f.req.user)).status).toBe('DRAFT')
  })

  it('advances document versions when the clock trails stored timestamps and keeps old forms stale', async () => {
    let row = await rfqs.createRFQ(input(), f.req)
    row = await db.rFQ.update({ where: { id: row.id }, data: { updatedAt: new Date(Date.now() + 60000) } })
    const old = version(row), previous = row.updatedAt.getTime()
    row = await rfqs.updateRFQ(row.id, { ...input(), ...old, notes: 'Current revision' }, f.req)
    expect(row.updatedAt.getTime()).toBeGreaterThan(previous)
    await expect(rfqs.updateRFQ(row.id, { ...input(), ...old, notes: 'Stale overwrite' }, f.req)).rejects.toMatchObject({ status: 409 })
    const beforeIssue = row.updatedAt.getTime()
    row = await action(row, 'issue')
    expect(row.updatedAt.getTime()).toBeGreaterThan(beforeIssue)
    const beforeQuote = row.updatedAt.getTime()
    let quote = await quotes.createQuotation(row.id, quoteInput(row), f.req)
    expect((await fresh(row)).updatedAt.getTime()).toBeGreaterThan(beforeQuote)
    quote = await db.supplierQuotation.update({ where: { id: quote.id }, data: { updatedAt: new Date(Date.now() + 60000) } })
    const oldQuote = version(quote), beforeEdit = quote.updatedAt.getTime()
    quote = await quotes.updateQuotation(row.id, quote.id, { ...quoteInput(row), ...oldQuote, notes: 'Current offer' }, f.req)
    expect(quote.updatedAt.getTime()).toBeGreaterThan(beforeEdit)
    await expect(submit(row, { ...quote, updatedAt: new Date(oldQuote.expectedUpdatedAt) })).rejects.toMatchObject({ status: 409 })
    const beforeSubmit = quote.updatedAt.getTime()
    quote = await submit(row, quote)
    expect(quote.updatedAt.getTime()).toBeGreaterThan(beforeSubmit)
    row = await action(await fresh(row), 'close')
    const beforeAward = row.updatedAt.getTime(), quoteBeforeAward = quote.updatedAt.getTime()
    row = await award(row, quote); quote = await quotes.getQuotation(row.id, quote.id, f.req.user)
    expect(row.updatedAt.getTime()).toBeGreaterThan(beforeAward)
    expect(quote.updatedAt.getTime()).toBeGreaterThan(quoteBeforeAward)
    const beforeConvert = quote.updatedAt.getTime()
    const converted = await quotes.convertQuotation(row.id, quote.id, conversion(quote), f.req)
    expect(converted.quotation.updatedAt.getTime()).toBeGreaterThan(beforeConvert)
    expect((await fresh(row)).updatedAt.getTime()).toBeGreaterThan(row.updatedAt.getTime())
  })
})
