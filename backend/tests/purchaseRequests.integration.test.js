import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import bcrypt from 'bcrypt'
import { purchaseRequestSchema, requestConversionSchema } from '../src/validators/purchaseRequests.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('purchase requests with isolated MySQL',()=>{
  let db,service,f,server,origin
  const suffix=Date.now().toString(36)
  const http=async(token,path,method='GET',body)=>{const response=await fetch(`${origin}/api${path}`,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,...await response.json()}}
  beforeAll(async()=>{
    if(!/^techstock_test_warehouse_[a-z0-9_]+$/.test(new URL(process.env.TEST_DATABASE_URL).pathname.slice(1)))throw Error('Unsafe test schema')
    process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;db=(await import('../src/config/prisma.js')).prisma;service=await import('../src/services/purchaseRequestService.js')
    const [a,b]=await Promise.all(['A','B'].map(code=>db.warehouse.create({data:{name:`Purchase request ${code} ${suffix}`,code:`PR-${code}-${suffix}`}})))
    const category=await db.category.create({data:{name:`PR category ${suffix}`,slug:`pr-cat-${suffix}`}}),brand=await db.brand.create({data:{name:`PR brand ${suffix}`,slug:`pr-brand-${suffix}`}})
    const products=await Promise.all([0,1].map(index=>db.product.create({data:{name:`PR product ${index}`,sku:`PR-P-${suffix}-${index}`,categoryId:category.id,brandId:brand.id}})))
    const supplier=await db.supplier.create({data:{companyName:`PR supplier ${suffix}`,supplierCode:`PR-S-${suffix}`}})
    const adminRole=await db.role.upsert({where:{name:'Administrator'},create:{name:'Administrator'},update:{}}),role=await db.role.create({data:{name:`PR requester ${suffix}`}}),viewerRole=await db.role.create({data:{name:`PR viewer ${suffix}`}})
    for(const action of ['VIEW','CREATE','EDIT']){const permission=await db.permission.findUnique({where:{module_action:{module:'purchase_requests',action}}});await db.rolePermission.create({data:{roleId:role.id,permissionId:permission.id}});if(action==='VIEW')await db.rolePermission.create({data:{roleId:viewerRole.id,permissionId:permission.id}})}
    const passwordHash=await bcrypt.hash('PurchaseRequest123!',4),makeUser=(name,roleId,warehouseId)=>db.user.create({data:{firstName:name,lastName:'Test',email:`pr-${name}-${suffix}@pr.test`,passwordHash,roleId,warehouseAssignments:{create:{warehouseId}}}})
    const admin=await makeUser('admin',adminRole.id,a.id),requester=await makeUser('requester',role.id,a.id),viewer=await makeUser('viewer',viewerRole.id,b.id)
    const {app}=await import('../src/app.js');server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));origin=`http://127.0.0.1:${server.address().port}`
    const login=async user=>(await http('', '/auth/login','POST',{email:user.email,password:'PurchaseRequest123!'})).data.accessToken
    f={a,b,products,supplier,adminToken:await login(admin),token:await login(requester),viewerToken:await login(viewer),req:{user:{id:admin.id,role:'Administrator'},get:()=>null},requester:{id:requester.id,role:role.name,warehouseIds:[a.id]}}
  },30000)
  afterAll(async()=>{if(server)await new Promise(resolve=>server.close(resolve));if(db)await db.$disconnect()})
  const input=()=>({department:'IT',warehouseId:f.a.id,requiredDate:null,justification:'Replace aging equipment',items:[{productId:f.products[0].id,description:'',quantity:2,estimatedUnitCost:100.25},{productId:null,description:'A new network adapter',quantity:3,estimatedUnitCost:20.50}]})
  const step=async(record,event,notes)=>service.transitionRequest(record.id,event,{expectedUpdatedAt:record.updatedAt.toISOString(),notes},f.req)
  const conversion=record=>({expectedUpdatedAt:record.updatedAt.toISOString(),supplierId:f.supplier.id,tax:5.75,shipping:10,items:record.items.map(item=>({purchaseRequestItemId:item.id,productId:item.productId||f.products[1].id,unitCost:Number(item.estimatedUnitCost)}))})
  it('creates catalog/free-text items and preserves estimates without orders or stock writes',async()=>{
    const before={orders:await db.purchaseOrder.count(),movements:await db.stockMovement.count()}
    f.record=await service.createRequest(input(),f.req)
    expect(f.record.prNumber).toMatch(/^PR-\d{4}-\d{5}$/);expect(f.record.items).toHaveLength(2);expect(f.record.items[0].description).toBe(f.products[0].name);expect(f.record.items[1].productId).toBeNull();expect(Number(f.record.items[0].estimatedUnitCost)).toBe(100.25)
    expect(await db.purchaseOrder.count()).toBe(before.orders);expect(await db.stockMovement.count()).toBe(before.movements)
    expect(purchaseRequestSchema.safeParse({...input(),items:[{...input().items[0],quantity:0}]}).success).toBe(false)
    expect(purchaseRequestSchema.safeParse({...input(),items:[{productId:null,description:'',quantity:1,estimatedUnitCost:0}]}).success).toBe(false)
    expect(purchaseRequestSchema.safeParse({...input(),items:[input().items[0],input().items[0]]}).success).toBe(false)
    expect(purchaseRequestSchema.safeParse({...input(),items:[{...input().items[0],estimatedUnitCost:1.001}]}).success).toBe(false)
  })
  it('edits only current drafts and requires explicit submit/approve decisions with no automatic PO',async()=>{
    const stale=f.record.updatedAt.toISOString();f.record=await service.updateRequest(f.record.id,{...input(),expectedUpdatedAt:stale,department:'Infrastructure'},f.req)
    await expect(service.transitionRequest(f.record.id,'submit',{expectedUpdatedAt:stale},f.req)).rejects.toMatchObject({status:409})
    const before=await db.purchaseOrder.count();f.record=await step(f.record,'submit')
    await expect(service.updateRequest(f.record.id,{...input(),expectedUpdatedAt:f.record.updatedAt.toISOString()},f.req)).rejects.toMatchObject({status:409})
    f.record=await step(f.record,'approve','Business need accepted');expect(f.record.status).toBe('APPROVED');expect(f.record.approvedBy.id).toBe(f.req.user.id);expect(await db.purchaseOrder.count()).toBe(before)
    await expect(step(f.record,'approve')).rejects.toMatchObject({status:409})
    expect(await db.notification.count({where:{referenceType:'PurchaseRequest',referenceId:f.record.id}})).toBeGreaterThan(0)
  })
  it('requires exact catalog mapping and rolls back invalid or overflowing conversions',async()=>{
    const before=await db.purchaseOrder.count(),data=conversion(f.record)
    await expect(service.convertRequest(f.record.id,{...data,items:data.items.slice(0,1)},f.req)).rejects.toMatchObject({status:400})
    await expect(service.convertRequest(f.record.id,{...data,items:data.items.map(line=>({...line,productId:f.products[1].id}))},f.req)).rejects.toMatchObject({status:400})
    await expect(service.convertRequest(f.record.id,{...data,supplierId:'missing'},f.req)).rejects.toMatchObject({status:400})
    await expect(service.convertRequest(f.record.id,{...data,items:data.items.map(line=>({...line,unitCost:999999999999.99}))},f.req)).rejects.toMatchObject({status:400})
    expect(await db.purchaseOrder.count()).toBe(before);expect((await service.getRequest(f.record.id,f.req.user)).status).toBe('APPROVED')
    expect(requestConversionSchema.safeParse({...data,items:[data.items[0],data.items[0]]}).success).toBe(false)
  })
  it('creates one linked draft PO under competing conversions, preserving approved quantities',async()=>{
    const data=conversion(f.record),before=await db.purchaseOrder.count(),results=await Promise.allSettled([service.convertRequest(f.record.id,data,f.req),service.convertRequest(f.record.id,data,f.req)])
    expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);expect(await db.purchaseOrder.count()).toBe(before+1)
    const result=results.find(result=>result.status==='fulfilled').value
    expect(result.request.status).toBe('CONVERTED');expect(result.request.purchaseOrderId).toBe(result.purchaseOrder.id);expect(result.purchaseOrder.status).toBe('DRAFT');expect(result.purchaseOrder.reference).toBe(f.record.prNumber);expect(result.purchaseOrder.items.map(item=>item.quantity).sort()).toEqual([2,3]);expect(Number(result.purchaseOrder.total)).toBe(277.75)
    expect((await db.purchaseOrder.findUnique({where:{id:result.purchaseOrder.id},include:{sourcePurchaseRequest:true}})).sourcePurchaseRequest.id).toBe(f.record.id)
    await expect(service.convertRequest(f.record.id,data,f.req)).rejects.toMatchObject({status:409})
  })
  it('keeps rejected/cancelled requests and rejects invalid transitions',async()=>{
    let record=await service.createRequest(input(),f.req);record=await step(record,'submit');await expect(step(record,'reject','')).rejects.toMatchObject({status:400});record=await step(record,'reject','Budget deferred');expect(record.rejectedBy.id).toBe(f.req.user.id);expect(record.approvalNotes).toBe('Budget deferred')
    await expect(service.convertRequest(record.id,conversion(record),f.req)).rejects.toMatchObject({status:409});record=await step(record,'cancel');expect(record.items).toHaveLength(2);await expect(step(record,'cancel')).rejects.toMatchObject({status:409})
  })
  it('enforces warehouse scope, separate approval/conversion permissions and live input validation',async()=>{
    const created=await http(f.token,'/purchase-requests','POST',input());expect(created.status).toBe(201);const record=created.data
    expect((await http(f.token,`/purchase-requests/${record.id}`)).status).toBe(200)
    expect((await http(f.viewerToken,`/purchase-requests/${record.id}`)).status).toBe(403)
    expect((await http(f.token,`/purchase-requests?warehouse=${f.b.id}`)).status).toBe(403)
    expect((await http(f.token,'/purchase-requests','POST',{...input(),warehouseId:f.b.id})).status).toBe(403)
    for(const action of ['approve','reject','convert'])expect((await http(f.token,`/purchase-requests/${record.id}/${action}`,'POST',{})).status).toBe(403)
    expect((await http(f.token,`/purchase-requests/${record.id}/submit`,'POST',{})).status).toBe(400)
    expect((await http(f.token,'/purchase-requests?status=INVALID')).status).toBe(400)
    expect((await http(f.viewerToken,'/purchase-requests','POST',input())).status).toBe(403)
    expect((await http(f.viewerToken,'/purchase-requests')).data).toEqual([])
    expect((await http(f.token,'/bootstrap')).data.products.some(product=>product.id===f.products[0].id)).toBe(true)
  })
})
