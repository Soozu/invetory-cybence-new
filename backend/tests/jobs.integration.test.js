import { beforeAll,afterAll,describe,it,expect } from 'vitest'
import { testAccessToken } from './sessionFixture.js'
import { openApi,describeSchema } from '../src/services/openApiService.js'
import { z } from 'zod'
it('documents valid schema references, authentication, pagination, scope and exact restore confirmation',()=>{
  const spec=openApi();expect(spec.openapi).toBe('3.1.0');expect(Object.keys(spec.paths).length).toBeGreaterThan(70)
  const walk=value=>{if(!value||typeof value!=='object')return;if(value.$ref)expect(spec.components.schemas[value.$ref.split('/').at(-1)]).toBeDefined();Object.values(value).forEach(walk)};walk(spec.paths);walk(spec.components.schemas)
  expect(spec.paths['/system/restores/{id}/confirm'].post['x-administrator-only']).toBe(true)
  expect(spec.paths['/auth/refresh'].post.security).toEqual([{RefreshCookie:[]}])
  expect(describeSchema(z.object({name:z.string().min(2),optional:z.string().optional()}).strict()).required).toEqual(['name'])
})
describe.skipIf(!process.env.TEST_DATABASE_URL)('leased jobs and scoped report scheduling',()=>{
  let db,jobs,schedule,stock,notification,server,origin,f
  const stamp=Date.now().toString(36)
  async function http(token,path,body,method=body?'POST':'GET'){const r=await fetch(origin+'/api'+path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()}}
  beforeAll(async()=>{
    process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;db=(await import('../src/config/prisma.js')).prisma
    ;[jobs,schedule,stock,notification]=await Promise.all(['jobService','reportScheduleService','stockNotificationJob','notificationService'].map(n=>import(`../src/services/${n}.js`)))
    const warehouse=await db.warehouse.create({data:{name:'Job '+stamp,code:'JB-'+stamp}}),category=await db.category.create({data:{name:'Job '+stamp,slug:'jb-'+stamp}}),brand=await db.brand.create({data:{name:'Job '+stamp,slug:'jb-'+stamp}})
    const role=await db.role.create({data:{name:'Jobs '+stamp}}),grants=['reports.VIEW','inventory.VIEW','products.VIEW','assets.VIEW']
    for(const key of grants){const [module,action]=key.split('.'),p=await db.permission.upsert({where:{module_action:{module,action}},create:{module,action},update:{}});await db.rolePermission.create({data:{roleId:role.id,permissionId:p.id}})}
    const users=[];for(let i=0;i<2;i++)users.push(await db.user.create({data:{firstName:'Job',lastName:String(i),email:`job-${i}-${stamp}@test.invalid`,passwordHash:'never-expose-job-secret',roleId:role.id,warehouseAssignments:{create:{warehouseId:warehouse.id}}}}))
    const product=await db.product.create({data:{name:'Job product '+stamp,sku:'JB-'+stamp,categoryId:category.id,brandId:brand.id,purchaseCost:'12.34',reorderPoint:5}});await db.warehouseStock.create({data:{productId:product.id,warehouseId:warehouse.id,quantity:2}})
    f={warehouse,product,users,actor:{id:users[0].id,role:role.name,permissions:grants,warehouseIds:[warehouse.id]},other:{id:users[1].id,role:role.name,permissions:grants,warehouseIds:[warehouse.id]},token:await testAccessToken(db,users[0].id,process.env.JWT_ACCESS_SECRET)}
    const roleAdmin=await db.role.upsert({where:{name:'Administrator'},create:{name:'Administrator'},update:{}}),admin=await db.user.create({data:{firstName:'Admin',lastName:'Jobs',email:`job-admin-${stamp}@test.invalid`,passwordHash:'unused',roleId:roleAdmin.id}});f.adminToken=await testAccessToken(db,admin.id,process.env.JWT_ACCESS_SECRET)
    server=(await import('../src/app.js')).app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));origin=`http://127.0.0.1:${server.address().port}`
  },30000)
  afterAll(async()=>{if(server)await new Promise(r=>server.close(r));if(db)await db.$disconnect()})
  it('allows one overlapping lease, recovers expired ownership and retains sanitized failure status',async()=>{
    let release;const wait=new Promise(r=>release=r),first=jobs.withJobLease('lease-test-'+stamp,()=>wait)
    while(!await db.jobLease.count({where:{name:'lease-test-'+stamp,owner:{not:null}}}))await new Promise(r=>setTimeout(r,5))
    expect((await jobs.withJobLease('lease-test-'+stamp,()=>{throw Error('Must not run')})).skipped).toBe(true);release();expect((await first).skipped).toBe(false)
    await db.jobLease.update({where:{name:'lease-test-'+stamp},data:{owner:'dead-owner',leaseUntil:new Date(Date.now()-1000)}});expect((await jobs.withJobLease('lease-test-'+stamp,async()=>42)).result).toBe(42)
    await expect(jobs.withJobLease('lease-test-'+stamp,()=>{throw Error('secret detail must not persist')})).rejects.toBeTruthy();expect((await db.jobLease.findUnique({where:{name:'lease-test-'+stamp}})).lastError).not.toMatch(/secret detail/)
  })
  it('schedules only owned valid configurations and rejects stale controls',async()=>{
    const saved=await db.savedReport.create({data:{userId:f.actor.id,name:'Job valuation',reportType:'inventory-valuation',filters:{warehouse:f.warehouse.id},columns:['sku','quantity','value'],sortBy:'sku',sortOrder:'asc'}});f.saved=saved
    await expect(schedule.createSchedule({savedReportId:saved.id,intervalDays:1},f.other)).rejects.toHaveProperty('status',404)
    f.schedule=await schedule.createSchedule({savedReportId:saved.id,intervalDays:1},f.actor)
    await expect(schedule.updateSchedule(f.schedule.id,{expectedRevision:999,intervalDays:1,enabled:false},f.actor)).rejects.toHaveProperty('status',409)
    expect((await http(f.token,'/report-schedules')).body.data.some(r=>r.id===f.schedule.id)).toBe(true)
  })
  it('generates exact bounded snapshots once per occurrence and rechecks owner/warehouse/source access',async()=>{
    await db.reportSchedule.update({where:{id:f.schedule.id},data:{nextRunAt:new Date(Date.now()-1000)}})
    await Promise.all([schedule.runReportSchedules(),schedule.runReportSchedules()]);const runs=await schedule.scheduleRuns(f.schedule.id,1,f.actor);expect(runs.data).toHaveLength(1);f.run=runs.data[0]
    const result=await schedule.scheduledResult(f.run.id,f.actor);expect(result.status).toBe('COMPLETE');expect(result.result.data[0].value).toBe('24.68');expect(result.result.pagination.limit).toBe(100)
    await expect(schedule.scheduledResult(f.run.id,f.other)).rejects.toHaveProperty('status',404);await expect(schedule.scheduledResult(f.run.id,{...f.actor,warehouseIds:[]})).rejects.toHaveProperty('status',403);await expect(schedule.scheduledResult(f.run.id,{...f.actor,permissions:['reports.VIEW']})).rejects.toHaveProperty('status',403)
  })
  it('records failure when source permission is revoked and does not leak business rows',async()=>{const p=await db.permission.findUnique({where:{module_action:{module:'inventory',action:'VIEW'}}});await db.rolePermission.delete({where:{roleId_permissionId:{roleId:f.users[0].roleId,permissionId:p.id}}});await db.reportSchedule.update({where:{id:f.schedule.id},data:{nextRunAt:new Date(Date.now()-1000)}});await schedule.runReportSchedules();const failure=await db.scheduledReportRun.findFirst({where:{scheduleId:f.schedule.id,status:'FAILED'}});expect(failure.result).toBeNull();await db.rolePermission.create({data:{roleId:f.users[0].roleId,permissionId:p.id}})})
  it('deduplicates scheduled stock notifications and honors per-user preferences and warehouse grants',async()=>{
    await stock.stockNotificationJob();const before=await db.notification.count({where:{userId:f.actor.id,type:'LOW_STOCK',referenceId:f.product.id}});expect(before).toBe(1);await stock.stockNotificationJob();expect(await db.notification.count({where:{userId:f.actor.id,type:'LOW_STOCK',referenceId:f.product.id}})).toBe(before)
    const pref=await import('../src/services/preferenceService.js'),v=await pref.getPreferences(f.other);await pref.updatePreferences({expectedRevision:v.revision,notifications:{...v.notifications,lowStock:false},dashboard:v.dashboard},f.other)
    await db.notification.deleteMany({where:{userId:f.other.id,referenceId:f.product.id}});await stock.stockNotificationJob();expect(await db.notification.count({where:{userId:f.other.id,referenceId:f.product.id}})).toBe(0)
  },30000)
  it('protects machine-readable OpenAPI in every environment and returns a downloadable specification',async()=>{expect((await http(f.token,'/docs/openapi.json')).status).toBe(403);const r=await http(f.adminToken,'/docs/openapi.json');expect(r.status).toBe(200);expect(r.body.openapi).toBe('3.1.0');expect(r.body.paths['/inventory/adjust'].post.requestBody).toBeDefined();expect(JSON.stringify(r.body)).not.toMatch(/never-expose-job-secret|JWT_ACCESS_SECRET|DATABASE_URL/)})
})
