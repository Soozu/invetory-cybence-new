import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import bcrypt from 'bcrypt'

describe.skipIf(!process.env.TEST_DATABASE_URL)('serial lifecycle with isolated MySQL', () => {
  let db, procurement, inventory, reservations, transfers, assets, lifecycle, server, origin, f
  const suffix = Date.now().toString(36)
  const http = async (token, path) => { const response = await fetch(`${origin}/api${path}`, { headers: { Authorization: `Bearer ${token}` } }); return { status: response.status, ...await response.json() } }
  beforeAll(async () => {
    if (!/^techstock_test_warehouse_[a-z0-9_]+$/.test(new URL(process.env.TEST_DATABASE_URL).pathname.slice(1))) throw Error('Unsafe test schema')
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
    db = (await import('../src/config/prisma.js')).prisma
    procurement = await import('../src/services/procurementService.js'); inventory = await import('../src/services/inventoryService.js')
    reservations = await import('../src/services/reservationService.js'); transfers = await import('../src/services/transferService.js')
    assets = await import('../src/services/assetService.js'); lifecycle = await import('../src/services/serialLifecycleService.js')
    const [a,b] = await Promise.all(['A','B'].map(code => db.warehouse.create({ data: { code:`LIFE-${code}-${suffix}`, name:`Lifecycle ${code} ${suffix}` } })))
    const category = await db.category.create({ data: { name:`Lifecycle category ${suffix}`,slug:`life-cat-${suffix}` } }), brand = await db.brand.create({ data: { name:`Lifecycle brand ${suffix}`,slug:`life-brand-${suffix}` } })
    const product = await db.product.create({ data: { name:'Lifecycle laptop', sku:`LIFE-${suffix}`, categoryId:category.id,brandId:brand.id,trackSerialNumbers:true,warrantyMonths:12 } })
    const supplier = await db.supplier.create({ data: { companyName:`Lifecycle supplier ${suffix}`,supplierCode:`LIFE-SUP-${suffix}` } })
    const role = await db.role.create({ data: { name:`Lifecycle viewer ${suffix}` } }), adminRole = await db.role.upsert({ where:{name:'Administrator'},create:{name:'Administrator'},update:{} })
    const permission = await db.permission.upsert({ where:{module_action:{module:'inventory',action:'VIEW'}},create:{module:'inventory',action:'VIEW'},update:{} })
    await db.rolePermission.create({ data:{roleId:role.id,permissionId:permission.id} })
    const passwordHash = await bcrypt.hash('LifecycleTest123!',4)
    const admin = await db.user.create({data:{firstName:'Lifecycle',lastName:'Admin',email:`life-admin-${suffix}@life.test`,passwordHash,roleId:adminRole.id}})
    const viewer = await db.user.create({data:{firstName:'Lifecycle',lastName:'Viewer',email:`life-view-${suffix}@life.test`,passwordHash,roleId:role.id,warehouseAssignments:{create:{warehouseId:b.id}}}})
    const {app} = await import('../src/app.js'); server=app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve)); origin=`http://127.0.0.1:${server.address().port}`
    const login = async email => {const result=await fetch(`${origin}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'LifecycleTest123!'})});return (await result.json()).data.accessToken}
    f={a,b,product,supplier,req:{user:{id:admin.id,role:'Administrator',permissions:[]},get:()=>null},viewer:{id:viewer.id,role:role.name,permissions:['inventory.VIEW'],warehouseIds:[b.id]},adminToken:await login(admin.email),viewerToken:await login(viewer.email)}
  },30000)
  afterAll(async()=>{if(server)await new Promise(resolve=>server.close(resolve));if(db)await db.$disconnect()})
  it('marks legacy history at migration time without inventing receipts',async()=>{
    const row=await lifecycle.getSerialLifecycle('test-legacy-serial',f.req.user)
    expect(row.receipt).toBeNull();expect(row.purchaseOrder).toBeNull()
    const events=await lifecycle.listSerialEvents(row.id,{},f.req.user)
    expect(events.data).toHaveLength(1);expect(events.data[0].type).toBe('HISTORY_STARTED');expect(events.data[0].referenceId).toBeNull()
  })
  it('links each serial to its exact partial receipt and records receiving atomically',async()=>{
    f.order=await procurement.createOrder({supplierId:f.supplier.id,warehouseId:f.a.id,tax:0,shipping:0,items:[{productId:f.product.id,quantity:2,unitCost:100}]},f.req)
    await procurement.transitionOrder(f.order.id,'submit',f.req);await procurement.transitionOrder(f.order.id,'approve',f.req)
    f.names=[`LIFE-SN1-${suffix}`,`LIFE-SN2-${suffix}`]
    f.receipts=[]
    for (const name of f.names) f.receipts.push(await procurement.receiveOrder(f.order.id,{items:[{purchaseOrderItemId:f.order.items[0].id,quantity:1,serialNumbers:[name]}]},f.req))
    f.serials=await db.serialNumber.findMany({where:{serialNumber:{in:f.names}},orderBy:{serialNumber:'asc'}})
    for(let i=0;i<2;i++){const row=await lifecycle.getSerialLifecycle(f.serials[i].id,f.req.user);expect(row.receipt.id).toBe(f.receipts[i].id);expect(row.purchaseOrder.id).toBe(f.order.id);expect(row.supplier.id).toBe(f.supplier.id);expect(row.warrantyEnd).not.toBeNull();expect((await lifecycle.listSerialEvents(row.id,{},f.req.user)).data[0]).toMatchObject({type:'RECEIVED',referenceId:f.receipts[i].id})}
  })
  it('records exact reservation, release and issue events; failed repeated actions add none',async()=>{
    const record=await reservations.createReservation({warehouseId:f.a.id,items:[{productId:f.product.id,quantity:1,serialNumbers:[f.names[1]]}]},f.req)
    await reservations.releaseReservation(record.id,f.req)
    await expect(reservations.releaseReservation(record.id,f.req)).rejects.toMatchObject({status:409})
    const next=await reservations.createReservation({warehouseId:f.a.id,items:[{productId:f.product.id,quantity:1,serialNumbers:[f.names[1]]}]},f.req)
    const line=await db.inventoryReservationItem.findFirst({where:{reservationId:next.id}})
    await reservations.fulfillReservation(next.id,{items:[{id:line.id,quantity:1,expectedFulfilledQuantity:0}]},f.req)
    await expect(reservations.fulfillReservation(next.id,{items:[{id:line.id,quantity:1,expectedFulfilledQuantity:0}]},f.req)).rejects.toMatchObject({status:409})
    const events=await db.serialEvent.findMany({where:{serialNumberId:f.serials[1].id}})
    expect(events.filter(event=>event.type==='RELEASED')).toHaveLength(1);expect(events.filter(event=>event.type==='ISSUED')).toHaveLength(1)
    expect((await lifecycle.getSerialLifecycle(f.serials[1].id,f.req.user)).status).toBe('ISSUED')
  })
  it('records transfer endpoints and filters previous warehouse history on live HTTP',async()=>{
    expect((await http(f.viewerToken,`/serial-numbers/${f.serials[0].id}`)).status).toBe(403)
    f.transfer=await transfers.createTransfer({sourceWarehouseId:f.a.id,destinationWarehouseId:f.b.id,items:[{productId:f.product.id,quantity:1}]},f.req)
    await transfers.transitionTransfer(f.transfer.id,'submit',f.req);await transfers.transitionTransfer(f.transfer.id,'approve',f.req)
    await transfers.transitionTransfer(f.transfer.id,'ship',f.req);await transfers.transitionTransfer(f.transfer.id,'receive',f.req)
    const record=await http(f.viewerToken,`/serial-numbers/${f.serials[0].id}`)
    expect(record.status).toBe(200);expect(record.data.warehouse.id).toBe(f.b.id);expect(record.data.purchaseOrder).toBeNull();expect(record.data.receipt).toBeNull()
    const events=await http(f.viewerToken,`/serial-numbers/${f.serials[0].id}/events`)
    expect(events.data.map(event=>event.type).sort()).toEqual(['TRANSFER_RECEIVED','TRANSFER_SHIPPED'])
    expect((await http(f.viewerToken,`/serial-numbers/${f.serials[1].id}/events`)).status).toBe(403)
  })
  it('retains asset custody through parallel repairs, assignment, return and disposal',async()=>{
    f.asset=await assets.createAsset({productId:f.product.id,serialNumberId:f.serials[0].id,warehouseId:f.b.id},f.req)
    const av=async()=>({expectedUpdatedAt:(await db.asset.findUnique({where:{id:f.asset.id}})).updatedAt.toISOString()}); const mv=async id=>({expectedUpdatedAt:(await db.maintenanceRecord.findUnique({where:{id}})).updatedAt.toISOString(),expectedAssetUpdatedAt:(await db.asset.findUnique({where:{id:f.asset.id}})).updatedAt.toISOString(),notes:'Verified service completion',inspectionResult:'AVAILABLE'});
    await assets.assignAsset(f.asset.id,{...await av(),assignedTo:'Lifecycle Person',department:'IT'},f.req)
    const repairs=[];for(let i=0;i<2;i++)repairs.push(await assets.createMaintenance({assetId:f.asset.id,expectedAssetUpdatedAt:(await av()).expectedUpdatedAt,serialNumberId:f.serials[0].id,issue:`Repair ${i}`,status:'IN_REPAIR',cost:0},f.req))
    await assets.finishMaintenance(repairs[0].id,'COMPLETED',f.req,await mv(repairs[0].id))
    expect((await db.serialNumber.findUnique({where:{id:f.serials[0].id}})).status).toBe('FOR_REPAIR')
    await assets.finishMaintenance(repairs[1].id,'COMPLETED',f.req,await mv(repairs[1].id))
    const active=await lifecycle.getSerialLifecycle(f.serials[0].id,f.req.user)
    expect(active.status).toBe('ASSIGNED');expect(active.asset.status).toBe('ASSIGNED');expect(active.asset.assignments[0].assignedTo).toBe('Lifecycle Person')
    expect((await lifecycle.getSerialLifecycle(f.serials[0].id,f.viewer)).asset).toBeNull()
    expect((await lifecycle.listSerialEvents(f.serials[0].id,{},f.viewer)).data.every(event=>!['Asset','AssetAssignment','MaintenanceRecord'].includes(event.referenceType))).toBe(true)
    await assets.returnAsset(f.asset.id,{...await av(),expectedAssignmentUpdatedAt:(await db.assetAssignment.findFirst({where:{assetId:f.asset.id,status:'ACTIVE'}})).updatedAt.toISOString(),conditionOnReturn:'Good inspection',disposition:'AVAILABLE'},f.req);await assets.closeAsset(f.asset.id,'DISPOSED',f.req,{...await av(),notes:'Approved end of lifecycle'})
    await expect(assets.closeAsset(f.asset.id,'DISPOSED',f.req,{...await av(),notes:'Repeated closure request'})).rejects.toMatchObject({status:409})
    const events=await lifecycle.listSerialEvents(f.serials[0].id,{},f.req.user)
    for(const type of ['RECEIVED','TRANSFER_SHIPPED','TRANSFER_RECEIVED','ASSET_CREATED','ASSIGNED','SENT_FOR_REPAIR','MAINTENANCE_COMPLETED','RETURNED','DISPOSED'])expect(events.data.some(event=>event.type===type)).toBe(true)
  })
  it('records status changes and stock movement together without duplicate events',async()=>{
    const name=`LIFE-ADJUST-${suffix}`
    await inventory.adjustStock({productId:f.product.id,warehouseId:f.b.id,type:'STOCK_IN',quantity:1,reason:'Lifecycle fixture',serialNumbers:[name]},f.req)
    const row=await db.serialNumber.findUnique({where:{serialNumber:name}})
    await inventory.changeSerialStatus(row.id,'DEFECTIVE',f.req);await inventory.changeSerialStatus(row.id,'DEFECTIVE',f.req)
    const history=await lifecycle.listSerialEvents(row.id,{},f.req.user)
    expect(history.data.filter(event=>event.type==='STATUS_CHANGED')).toHaveLength(1)
    const changed=history.data.find(event=>event.type==='STATUS_CHANGED');expect(changed).toMatchObject({fromStatus:'AVAILABLE',toStatus:'DEFECTIVE'})
    expect(await db.stockMovement.findFirst({where:{referenceNumber:changed.referenceNumber}})).toMatchObject({quantity:0,previousReservedQuantity:0,newReservedQuantity:1})
    expect((await http('',`/serial-numbers/${row.id}/events`)).status).toBe(401)
    expect((await http(f.adminToken,`/serial-numbers/${row.id}/events?sortBy=invalid`)).status).toBe(400)
  })
})
