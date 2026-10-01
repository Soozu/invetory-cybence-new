import { testAccessToken } from './sessionFixture.js'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { assignmentSchema, returnSchema, maintenanceSchema, planSchema, claimActionSchema } from '../src/validators/assets.js'

it('requires versions, inspected returns, valid schedules, decimal costs and explicit evidence', () => {
  expect(assignmentSchema.safeParse({ assignedTo: 'Alex' }).success).toBe(false)
  expect(returnSchema.safeParse({ conditionOnReturn: 'Good condition' }).success).toBe(false)
  expect(maintenanceSchema.safeParse({ assetId: 'a', issue: 'Failure', status: 'COMPLETED' }).success).toBe(false)
  expect(planSchema.safeParse({ assetId: 'a', title: 'Plan', instructions: 'Inspect', intervalDays: 0, nextDueAt: 'invalid' }).success).toBe(false)
  expect(claimActionSchema.safeParse({ expectedUpdatedAt: new Date().toISOString(), notes: 'Recorded evidence', outcome: 'AUTO_RESTOCK' }).success).toBe(false)
})
describe.skipIf(!process.env.TEST_DATABASE_URL)('asset custody, preventive maintenance and warranty workflows in disposable MySQL', () => {
  let db, assets, plans, claims, lifecycle, f, server, origin, counter = 0
  const key = Date.now().toString(36), iso = row => row.updatedAt.toISOString()
  const http = async (user, path, body, method = body ? 'POST' : 'GET') => { const r = await fetch(`${origin}/api${path}`, { method, headers: { Authorization: `Bearer ${f.tokens[user] || ''}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) }); return { status: r.status, ...await r.json() } }
  beforeAll(async () => {
    if (!/^techstock_test_warehouse_[a-z0-9]+$/.test(new URL(process.env.TEST_DATABASE_URL).pathname.slice(1))) throw Error('Unsafe schema')
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL; db = (await import('../src/config/prisma.js')).prisma
    assets = await import('../src/services/assetService.js'); plans = await import('../src/services/preventiveMaintenanceService.js'); claims = await import('../src/services/warrantyClaimService.js'); lifecycle = await import('../src/services/serialLifecycleService.js')
    const a = await db.warehouse.create({ data: { name: `Asset A ${key}`, code: `AW-A-${key}` } }), b = await db.warehouse.create({ data: { name: `Asset B ${key}`, code: `AW-B-${key}` } })
    const category = await db.category.create({ data: { name: `Asset ${key}`, slug: `aw-${key}` } }), brand = await db.brand.create({ data: { name: `Asset ${key}`, slug: `aw-${key}` } }), supplier = await db.supplier.create({ data: { companyName: `Asset supplier ${key}`, supplierCode: `AW-${key}` } })
    const users = {}, tokens = {}, { env } = await import('../src/config/env.js')
    const permissions = ['assets.VIEW','assets.CREATE','assets.EDIT','assets.DELETE','inventory.VIEW','warranty_claims.VIEW','warranty_claims.CREATE','warranty_claims.EDIT','warranty_claims.APPROVE','purchasing.VIEW','supplier_returns.VIEW']
    for (const [name, warehouses, grants] of [['writer',[a],permissions],['reader',[a],['assets.VIEW','warranty_claims.VIEW']],['outsider',[b],permissions],['unassigned',[],permissions],['claimOnly',[a],['warranty_claims.VIEW','warranty_claims.CREATE','warranty_claims.EDIT','warranty_claims.APPROVE']],['serialOnly',[a],['inventory.VIEW']]]) {
      const role = await db.role.create({ data: { name: `Asset ${name} ${key}` } })
      for (const grant of grants) { const [module, action] = grant.split('.'), permission = await db.permission.upsert({ where: { module_action: { module, action } }, create: { module, action }, update: {} }); await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } }) }
      const row = await db.user.create({ data: { firstName: name, lastName: 'Asset', email: `aw-${name}-${key}@test.invalid`, passwordHash: 'unused', roleId: role.id, warehouseAssignments: { create: warehouses.map(w => ({ warehouseId: w.id })) } } })
      users[name] = { id: row.id, role: role.name, warehouseIds: warehouses.map(w => w.id), permissions: grants }; tokens[name] = await testAccessToken(db,row.id,env.accessSecret)
    }
    f = { a, b, supplier, category, brand, users, tokens, req: { user: users.writer, get: () => null } }
    const { app } = await import('../src/app.js'); server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); origin = `http://127.0.0.1:${server.address().port}`
  }, 30000)
  afterAll(async () => { if (server) await new Promise(resolve => server.close(resolve)); if (db) await db.$disconnect() })
  async function fixture({ serialized = true, register = true, expired = false } = {}) {
    const n = ++counter, product = await db.product.create({ data: { name: `Asset equipment ${key}-${n}`, sku: `AW-${key}-${n}`, categoryId: f.category.id, brandId: f.brand.id, trackSerialNumbers: serialized, warrantyMonths: 12 } })
    await db.warehouseStock.create({ data: { productId: product.id, warehouseId: f.a.id, quantity: 3 } })
    let serial, receipt, order
    if (serialized) {
      order = await db.purchaseOrder.create({ data: { poNumber: `AW-PO-${key}-${n}`, supplierId: f.supplier.id, warehouseId: f.a.id, createdById: f.users.writer.id, status: 'RECEIVED', subtotal: '60.30', total: '60.30', items: { create: { productId: product.id, quantity: 3, receivedQuantity: 3, unitCost: '20.10', subtotal: '60.30' } } }, include: { items: true } })
      receipt = await db.purchaseReceipt.create({ data: { receiptNumber: `AW-RCV-${key}-${n}`, warehouseId: f.a.id, purchaseOrderId: order.id, receivedById: f.users.writer.id, items: { create: { purchaseOrderItemId: order.items[0].id, productId: product.id, quantity: 3 } } } })
      serial = await db.serialNumber.create({ data: { serialNumber: `AW-SN-${key}-${n}`, productId: product.id, warehouseId: f.a.id, supplierId: f.supplier.id, purchaseOrderItemId: order.items[0].id, receiptId: receipt.id, warrantyStart: new Date(Date.now() - 86400000), warrantyEnd: new Date(Date.now() + (expired ? -1 : 365) * 86400000) } })
    }
    const asset = register ? await assets.createAsset({ productId: product.id, warehouseId: f.a.id, ...(serial ? { serialNumberId: serial.id } : {}) }, f.req) : null
    return { product, serial, asset, receipt, order }
  }
  const assetVersion = async id => ({ expectedUpdatedAt: iso(await db.asset.findUnique({ where: { id } })) })
  const serviceVersion = async id => { const r = await db.maintenanceRecord.findUnique({ where: { id } }); return { expectedUpdatedAt: iso(r), expectedAssetUpdatedAt: (await assetVersion(r.assetId)).expectedUpdatedAt } }
  const custodyVersion = async id => ({ ...await assetVersion(id), expectedAssignmentUpdatedAt: iso(await db.assetAssignment.findFirst({ where: { assetId: id, status: 'ACTIVE' } })) })
  const assign = async (asset, name = 'Alex Rivera') => assets.assignAsset(asset.id, { ...await assetVersion(asset.id), assignedTo: name, notes: 'Original issuance notes', conditionOnAssign: 'Verified working' }, f.req)
  const repair = async (asset, status = 'IN_REPAIR') => assets.createMaintenance({ assetId: asset.id, expectedAssetUpdatedAt: (await assetVersion(asset.id)).expectedUpdatedAt, issue: 'Inspect device failure', status, cost: 20.10 }, f.req)
  const finish = async (record, status = 'COMPLETED', inspectionResult = 'AVAILABLE') => assets.finishMaintenance(record.id, status, f.req, { ...await serviceVersion(record.id), notes: 'Recorded closure inspection', ...(status === 'COMPLETED' ? { inspectionResult } : {}) })
  const plan = async asset => plans.createPlan({ assetId: asset.id, expectedAssetUpdatedAt: (await assetVersion(asset.id)).expectedUpdatedAt, title: 'Quarterly inspection', instructions: 'Inspect battery and power supply', intervalDays: 90, nextDueAt: new Date(Date.now() - 86400000) }, f.req)
  const schedule = async (p, a) => plans.schedulePlan(p.id, { expectedUpdatedAt: iso(await db.preventiveMaintenancePlan.findUnique({ where: { id: p.id } })), expectedAssetUpdatedAt: (await assetVersion(a.id)).expectedUpdatedAt }, f.req)
  const claim = async serial => claims.createClaim({ serialNumberId: serial.id, issue: 'Battery fails under load' }, f.req)
  const claimAct = async (c, action, extra = {}) => claims.claimAction(c.id, action, { expectedUpdatedAt: iso(await db.warrantyClaim.findUnique({ where: { id: c.id } })), notes: 'Recorded actual supplier evidence', ...extra }, f.req)
  const balances = async product => ({ stock: await db.warehouseStock.findMany({ where: { productId: product.id } }), movements: await db.stockMovement.findMany({ where: { productId: product.id } }) })

  it('migrates legacy service without guessed warehouse, fabricated events or changed timestamps', async () => {
    const a = await db.asset.findUnique({ where: { id: 'test-legacy-asset' } }), r = await db.maintenanceRecord.findUnique({ where: { id: 'test-legacy-maintenance' } })
    expect(a.servicePreviousStatus).toBeNull(); expect(r.warehouseId).toBeNull(); expect(r.planId).toBeNull(); expect(r.kind).toBe('CORRECTIVE'); expect(iso(a)).toBe('2026-09-01T12:00:00.000Z'); expect(iso(r)).toBe('2026-09-01T12:00:00.000Z'); expect(await db.assetEvent.count({ where: { assetId: a.id } })).toBe(0)
  })
  it('retains issue and return notes, actors, exact identity and custody after a handover', async () => {
    const x = await fixture(); const before = await balances(x.product), first = await assign(x.asset)
    await assets.assignAsset(x.asset.id, { ...await custodyVersion(x.asset.id), assignedTo: 'Sam Rivera', conditionOnReturn: 'Verified good condition', conditionOnAssign: 'Verified working', notes: 'Handover evidence retained' }, f.req, true)
    const rows = await db.assetAssignment.findMany({ where: { assetId: x.asset.id } }); expect(rows.filter(r => r.status === 'ACTIVE')).toHaveLength(1); expect(rows.find(r => r.id === first.id)).toMatchObject({ notes: 'Original issuance notes', returnNotes: 'Handover evidence retained', returnedById: f.users.writer.id, warehouseId: f.a.id })
    expect(await balances(x.product)).toEqual(before); expect((await db.serialNumber.findUnique({ where: { id: x.serial.id } })).warehouseId).toBeNull()
  })
  it('allows one custodian under competing assignments and rejects stale handover versions', async () => {
    const x = await fixture(), body = { ...await assetVersion(x.asset.id), assignedTo: 'Competing custodian' }
    const r = await Promise.allSettled([assets.assignAsset(x.asset.id, body, f.req), assets.assignAsset(x.asset.id, body, f.req)]); expect(r.filter(v => v.status === 'fulfilled')).toHaveLength(1); expect(r.find(v => v.status === 'rejected').reason.status).toBe(409)
    await expect(assets.assignAsset(x.asset.id, { ...await custodyVersion(x.asset.id), expectedAssignmentUpdatedAt: new Date(0).toISOString(), assignedTo: 'Next custodian', conditionOnReturn: 'Inspected', notes: 'Evidence' }, f.req, true)).rejects.toMatchObject({ status: 409 })
  })
  it('quarantines a failed return and requires a separate inspection without adding stock', async () => {
    const x = await fixture(); await assign(x.asset); const before = await balances(x.product)
    const body = { ...await custodyVersion(x.asset.id), conditionOnReturn: 'Damaged battery on return', disposition: 'QUARANTINE', notes: 'Damage evidence' }
    const r = await Promise.allSettled([assets.returnAsset(x.asset.id, body, f.req), assets.returnAsset(x.asset.id, body, f.req)]); expect(r.filter(v => v.status === 'fulfilled')).toHaveLength(1); expect(r.find(v => v.status === 'rejected').reason.status).toBe(409)
    expect((await db.asset.findUnique({ where: { id: x.asset.id } })).status).toBe('QUARANTINE'); await expect(assign(x.asset)).rejects.toMatchObject({ status: 409 })
    await assets.inspectAsset(x.asset.id, { ...await assetVersion(x.asset.id), notes: 'Battery replaced and tested' }, f.req); expect((await db.serialNumber.findUnique({ where: { id: x.serial.id } })).status).toBe('AVAILABLE'); expect(await balances(x.product)).toEqual(before)
  })
  it('records custody and service history for unserialized assets too', async () => {
    const x = await fixture({ serialized: false }); await assign(x.asset); const r = await repair(x.asset); await finish(r)
    expect((await assets.getAsset(x.asset.id, f.users.writer)).events.map(e => e.type)).toEqual(expect.arrayContaining(['ASSET_CREATED','ASSIGNED','MAINTENANCE_CREATED','MAINTENANCE_COMPLETED'])); expect((await db.asset.findUnique({ where: { id: x.asset.id } })).status).toBe('ASSIGNED')
  })
  it('retains custody through parallel repairs and latches an adverse inspection', async () => {
    const x = await fixture(); await assign(x.asset); const before = await balances(x.product), r1 = await repair(x.asset), r2 = await repair(x.asset)
    await finish(r1, 'COMPLETED', 'QUARANTINE'); expect((await db.serialNumber.findUnique({ where: { id: x.serial.id } })).status).toBe('FOR_REPAIR')
    await finish(r2); expect((await db.asset.findUnique({ where: { id: x.asset.id } })).status).toBe('QUARANTINE'); expect(await db.assetAssignment.count({ where: { assetId: x.asset.id, status: 'ACTIVE' } })).toBe(1); expect(await balances(x.product)).toEqual(before)
    await expect(assets.returnAsset(x.asset.id, { ...await custodyVersion(x.asset.id), disposition: 'AVAILABLE', conditionOnReturn: 'Looks good now' }, f.req)).rejects.toMatchObject({ status: 409 })
  })
  it('cancels repair without clearing a prior quarantine; unknown legacy state stays quarantined', async () => {
    const x = await fixture(); await db.asset.update({ where: { id: x.asset.id }, data: { status: 'QUARANTINE' } }); await db.serialNumber.update({ where: { id: x.serial.id }, data: { status: 'QUARANTINE' } }); await finish(await repair(x.asset), 'CANCELLED'); expect((await db.asset.findUnique({ where: { id: x.asset.id } })).status).toBe('QUARANTINE')
    const req = { ...f.req, user: { ...f.users.writer, role: 'Administrator' } }; const r = await db.maintenanceRecord.findUnique({ where: { id: 'test-legacy-maintenance' } }); await assets.finishMaintenance(r.id, 'CANCELLED', req, { ...await serviceVersion(r.id), notes: 'Legacy cancellation, condition unknown' }); expect((await db.asset.findUnique({ where: { id: r.assetId } })).status).toBe('QUARANTINE')
  })
  it('blocks stale service completion and completes a record once under competing requests', async () => {
    const x = await fixture(), r = await repair(x.asset), body = { ...await serviceVersion(r.id), notes: 'Verified final inspection', inspectionResult: 'AVAILABLE', cost: 123.45 }
    const results = await Promise.allSettled([assets.finishMaintenance(r.id,'COMPLETED',f.req,body),assets.finishMaintenance(r.id,'COMPLETED',f.req,body)]); expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1); expect(results.find(r => r.status === 'rejected').reason.status).toBe(409)
    expect(await db.assetEvent.count({ where: { assetId: x.asset.id, type: 'MAINTENANCE_COMPLETED' } })).toBe(1)
    expect((await db.maintenanceRecord.findUnique({where:{id:r.id}})).cost.toFixed(2)).toBe('123.45')
  })
  it('creates one preventive occurrence under concurrency and advances its due date once after completion', async () => {
    const x = await fixture(), p = await plan(x.asset), before = await balances(x.product), body = { expectedUpdatedAt: iso(p), expectedAssetUpdatedAt: (await assetVersion(x.asset.id)).expectedUpdatedAt }
    const results = await Promise.allSettled([plans.schedulePlan(p.id, body, f.req),plans.schedulePlan(p.id, body, f.req)]); expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1); expect(results.find(r => r.status === 'rejected').reason.status).toBe(409)
    const r = results.find(r => r.status === 'fulfilled').value; expect(r).toMatchObject({ kind:'PREVENTIVE', status:'SCHEDULED', planId:p.id, serialNumberId:x.serial.id }); expect(r.plannedDueAt).toEqual(p.nextDueAt)
    await expect(plans.updatePlan(p.id, { expectedUpdatedAt: iso(await db.preventiveMaintenancePlan.findUnique({where:{id:p.id}})), intervalDays:30 }, f.req)).rejects.toMatchObject({status:409})
    await assets.updateMaintenance(r.id, { ...await serviceVersion(r.id), status:'IN_REPAIR' }, f.req); await finish(r); const completed = await db.maintenanceRecord.findUnique({where:{id:r.id}}), advanced = await db.preventiveMaintenancePlan.findUnique({where:{id:p.id}})
    expect(Math.abs(advanced.nextDueAt - completed.completedDate - 90*86400000)).toBeLessThan(1000); expect(await balances(x.product)).toEqual(before)
  })
  it('pauses plans without cancelling services and retains cancelled due occurrences', async () => {
    const x = await fixture(), p = await plan(x.asset), r = await schedule(p,x.asset)
    await plans.updatePlan(p.id, { expectedUpdatedAt: iso(await db.preventiveMaintenancePlan.findUnique({where:{id:p.id}})), status:'PAUSED' },f.req); expect((await db.maintenanceRecord.findUnique({where:{id:r.id}})).status).toBe('SCHEDULED')
    await expect(schedule(p,x.asset)).rejects.toMatchObject({status:409}); await finish(r,'CANCELLED'); await plans.updatePlan(p.id, { expectedUpdatedAt: iso(await db.preventiveMaintenancePlan.findUnique({where:{id:p.id}})), status:'ACTIVE' },f.req); await expect(schedule(p,x.asset)).rejects.toMatchObject({status:409})
  })
  it('filters due plans, enforces scope and rejects changed asset versions at scheduling', async () => {
    const x = await fixture(), p = await plan(x.asset), old = (await assetVersion(x.asset.id)).expectedUpdatedAt; await assign(x.asset)
    await expect(plans.schedulePlan(p.id, {expectedUpdatedAt:iso(p),expectedAssetUpdatedAt:old},f.req)).rejects.toMatchObject({status:409})
    expect((await plans.listPlans({asset:x.asset.id,due:'true'},f.users.writer)).data.map(r=>r.id)).toContain(p.id); expect((await plans.listPlans({due:'true'},f.users.outsider)).data).toEqual([])
  })
  it('preserves exact receipt/supplier/serial coverage and one active claim under competition', async () => {
    const x = await fixture(), before = await balances(x.product), input = { serialNumberId:x.serial.id,issue:'Battery fails during operation' }
    const r = await Promise.allSettled([claims.createClaim(input,f.req),claims.createClaim(input,f.req)]); expect(r.filter(v=>v.status==='fulfilled')).toHaveLength(1); expect(r.find(v=>v.status==='rejected').reason.status).toBe(409)
    const c = r.find(v=>v.status==='fulfilled').value; expect(c).toMatchObject({serialNumberId:x.serial.id,assetId:x.asset.id,supplierId:f.supplier.id,receiptId:x.receipt.id,status:'DRAFT'}); expect(c.warrantyEnd).toEqual(x.serial.warrantyEnd); expect(await balances(x.product)).toEqual(before)
    const admin = {...f.users.writer,role:'Administrator'}; expect((await claims.listSources({search:x.serial.serialNumber},admin)).data.map(r=>r.id)).toContain(x.serial.id)
  })
  it('records submitted, accepted and resolved supplier decisions with exact completed service evidence', async () => {
    const x = await fixture(), c = await claim(x.serial); await claimAct(c,'submit'); await claimAct(c,'accept',{providerReference:'Supplier RMA-100'})
    await expect(claimAct(c,'resolve',{outcome:'REPAIRED',providerReference:'Supplier RMA-100',maintenanceId:(await repair(x.asset,'SCHEDULED')).id})).rejects.toMatchObject({status:409})
    const repairRecord = await repair(x.asset); await finish(repairRecord); const before = await balances(x.product), serialBefore = await db.serialNumber.findUnique({where:{id:x.serial.id}}), assetBefore = await db.asset.findUnique({where:{id:x.asset.id}})
    const resolved = await claimAct(c,'resolve',{outcome:'REPAIRED',providerReference:'Supplier RMA-100',maintenanceId:repairRecord.id}); expect(resolved.status).toBe('RESOLVED'); expect(resolved.maintenanceId).toBe(repairRecord.id); expect(resolved.activeSerialId).toBeNull(); expect(resolved.events.map(e=>e.action)).toEqual(expect.arrayContaining(['CREATED','SUBMIT','ACCEPT','RESOLVE']))
    expect(await balances(x.product)).toEqual(before); expect(await db.serialNumber.findUnique({where:{id:x.serial.id}})).toEqual(serialBefore); expect(await db.asset.findUnique({where:{id:x.asset.id}})).toEqual(assetBefore)
  })
  it('blocks expired, unknown or changed provenance and leaves the draft and stock unchanged', async () => {
    const expired = await fixture({expired:true}), c = await claim(expired.serial); await expect(claimAct(c,'submit')).rejects.toMatchObject({status:409}); expect((await claims.getClaim(c.id,f.users.writer)).status).toBe('DRAFT')
    const x = await fixture(); await db.serialNumber.update({where:{id:x.serial.id},data:{receiptId:null}}); await expect(claim(x.serial)).rejects.toMatchObject({status:409})
    const changed = await fixture(), draft = await claim(changed.serial); await db.serialNumber.update({where:{id:changed.serial.id},data:{warrantyEnd:new Date(Date.now()+400*86400000)}}); await expect(claimAct(draft,'submit')).rejects.toMatchObject({status:409})
  })
  it('never clears a warehouse stock hold when recording a warranty outcome', async () => {
    const x = await fixture({register:false}); await db.serialNumber.update({where:{id:x.serial.id},data:{status:'QUARANTINE'}}); await db.warehouseStock.updateMany({where:{productId:x.product.id},data:{reservedQuantity:1,quarantineQuantity:1}})
    const before = await balances(x.product), c = await claim(x.serial); await claimAct(c,'submit'); await claimAct(c,'accept',{providerReference:'RMA-stock'}); await claimAct(c,'resolve',{providerReference:'RMA-stock',outcome:'CREDIT'}); expect(await balances(x.product)).toEqual(before); expect((await db.serialNumber.findUnique({where:{id:x.serial.id}})).status).toBe('QUARANTINE')
  })
  it('rejects wrong supporting documents, stale decisions and repeated terminal actions', async () => {
    const x = await fixture(), y = await fixture(), c = await claim(x.serial), old = c.updatedAt; await claimAct(c,'submit'); await expect(claims.claimAction(c.id,'accept',{expectedUpdatedAt:old.toISOString(),notes:'Supplier evidence',providerReference:'RMA'},f.req)).rejects.toMatchObject({status:409}); await claimAct(c,'accept',{providerReference:'RMA-2'})
    const wrong = await repair(y.asset); await finish(wrong); await expect(claimAct(c,'resolve',{providerReference:'RMA-2',outcome:'REPAIRED',maintenanceId:wrong.id})).rejects.toMatchObject({status:409}); await expect(claimAct(c,'resolve',{providerReference:'RMA-2',outcome:'CREDIT',supplierReturnId:'missing-return'})).rejects.toMatchObject({status:409}); await claimAct(c,'resolve',{providerReference:'RMA-2',outcome:'UNREPAIRED'}); await expect(claimAct(c,'resolve',{providerReference:'RMA-2',outcome:'REPLACED'})).rejects.toMatchObject({status:409})
  })
  it('enforces warehouse and module permissions over actual APIs and hides linked histories', async () => {
    const x = await fixture(), c = await claim(x.serial)
    for (const path of [`/assets/${x.asset.id}`,`/warranty-claims/${c.id}`]) { expect((await http('outsider',path)).status).toBe(403); expect((await http('unassigned',path)).status).toBe(403); expect((await http('reader',path)).status).toBe(200) }
    expect((await http('reader',`/assets/${x.asset.id}/assign`,{...await assetVersion(x.asset.id),assignedTo:'Denied writer'})).status).toBe(403)
    expect((await http('claimOnly','/warranty-claims',{serialNumberId:x.serial.id,issue:'No source module access'})).status).toBe(403)
    const hidden = (await http('claimOnly',`/warranty-claims/${c.id}`)).data; expect(hidden.asset).toBeNull(); expect(hidden.receipt).toBeNull(); expect(hidden.assetId).toBeNull(); expect(hidden.receiptId).toBeNull()
    expect((await http('serialOnly',`/warranty-claims/${c.id}`)).status).toBe(403); expect((await lifecycle.listSerialEvents(x.serial.id,{},f.users.serialOnly)).data.every(e=>e.referenceType!=='WarrantyClaim')).toBe(true)
    expect((await http('outsider',`/preventive-maintenance?warehouse=${f.a.id}`)).status).toBe(403); expect((await http('outsider',`/warranty-claims/sources?warehouse=${f.a.id}`)).status).toBe(403)
  })
  it('prevents disposal during custody, service or an active claim and retains immutable history', async () => {
    const x = await fixture(), c = await claim(x.serial); await expect(assets.closeAsset(x.asset.id,'DISPOSED',f.req,{...await assetVersion(x.asset.id),notes:'Approved closure'})).rejects.toMatchObject({status:409}); await claimAct(c,'cancel'); await assign(x.asset); await expect(assets.closeAsset(x.asset.id,'DISPOSED',f.req,{...await assetVersion(x.asset.id),notes:'Approved closure'})).rejects.toMatchObject({status:409})
    await assets.returnAsset(x.asset.id,{...await custodyVersion(x.asset.id),conditionOnReturn:'Working condition inspected',disposition:'AVAILABLE'},f.req); await assets.closeAsset(x.asset.id,'DISPOSED',f.req,{...await assetVersion(x.asset.id),notes:'Approved end of useful life'}); expect((await assets.getAsset(x.asset.id,f.users.writer)).assignments).toHaveLength(1)
  })
  it('links an explicitly shipped exact supplier return without shipping or restocking twice', async () => {
    const x = await fixture({register:false}), c = await claim(x.serial); await claimAct(c,'submit'); await claimAct(c,'accept',{providerReference:'RMA-return'})
    const returns = await import('../src/services/supplierReturnService.js'), req = {...f.req,user:{...f.users.writer,role:'Administrator'}}, line = await db.purchaseReceiptItem.findFirst({where:{receiptId:x.receipt.id}})
    let r = await returns.createReturn({receiptId:x.receipt.id,reason:'WARRANTY',notes:'Warranty return evidence',items:[{receiptItemId:line.id,quantity:1,reason:'WARRANTY',condition:'DEFECTIVE',serialNumberIds:[x.serial.id]}]},req)
    for(const action of ['submit','approve','ship']) r = await returns.transitionReturn(r.id,action,{expectedUpdatedAt:iso(r),notes:'Confirmed physical return',...(action==='ship'?{shipmentReference:'Courier RMA-101'}:{})},req)
    const before = await balances(x.product), count = await db.purchaseOrder.count(), serial = await db.serialNumber.findUnique({where:{id:x.serial.id}})
    const result = await claimAct(c,'resolve',{providerReference:'RMA-return',outcome:'CREDIT',supplierReturnId:r.id}); expect(result.supplierReturnId).toBe(r.id); expect(result.supplierReturn.returnNumber).toBe(r.returnNumber); expect(await balances(x.product)).toEqual(before); expect(await db.serialNumber.findUnique({where:{id:x.serial.id}})).toEqual(serial); expect(await db.purchaseOrder.count()).toBe(count)
  })
  it('scopes historical custody and events when an available asset owner moves warehouses', async () => {
    const x = await fixture(); await assign(x.asset); await assets.returnAsset(x.asset.id,{...await custodyVersion(x.asset.id),conditionOnReturn:'Working condition inspected',disposition:'AVAILABLE'},f.req)
    const req = {...f.req,user:{...f.users.writer,role:'Administrator'}}
    await assets.updateAsset(x.asset.id,{...await assetVersion(x.asset.id),warehouseId:f.b.id},req)
    const row = await assets.getAsset(x.asset.id,f.users.outsider); expect(row.assignments).toEqual([]); expect(row.events).toEqual([]); await expect(assets.getAsset(x.asset.id,f.users.writer)).rejects.toMatchObject({status:403})
    await assets.assignAsset(x.asset.id,{...await assetVersion(x.asset.id),assignedTo:'Destination custodian'}, {...f.req,user:f.users.outsider}); expect((await assets.getAsset(x.asset.id,f.users.outsider)).assignments).toHaveLength(1)
  })
  it('observes warehouse revocation on the next authenticated read request', async () => {
    const x = await fixture(), c = await claim(x.serial); expect((await http('reader',`/warranty-claims/${c.id}`)).status).toBe(200)
    await db.userWarehouse.deleteMany({where:{userId:f.users.reader.id}}); expect((await http('reader',`/warranty-claims/${c.id}`)).status).toBe(403); expect((await http('reader',`/assets/${x.asset.id}`)).status).toBe(403)
  })
})
