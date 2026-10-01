import { beforeAll,afterAll,describe,it,expect } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'
import { testAccessToken } from './sessionFixture.js'
describe.skipIf(!process.env.TEST_DATABASE_URL)('operations in disposable MySQL and file storage',()=>{
  let db,host,backups,retention,storage,server,origin,admin,reader,tokens,root,backup,plan
  const stamp=Date.now().toString(36),target='techstock_restore_test_'+stamp,previous={}
  const req=()=>({user:{id:admin.id,role:'Administrator'},ip:'127.0.0.1',get:()=> 'Operations test'})
  async function http(identity,url,body,method=body?'POST':'GET'){const r=await fetch(origin+'/api'+url,{method,headers:{Authorization:'Bearer '+(tokens[identity]||''),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),requestId:r.headers.get('x-request-id')}}
  beforeAll(async()=>{
    if(!/^\/techstock_test_warehouse_[a-z0-9]+$/.test(new URL(process.env.TEST_DATABASE_URL).pathname))throw Error('Unsafe fixture database')
    host=new PrismaClient({datasources:{db:{url:process.env.TEST_DATABASE_URL}}})
    const url=new URL(process.env.TEST_DATABASE_URL),schema='techstock_test_warehouse_ops'+stamp
    await host.$executeRawUnsafe(`CREATE DATABASE \`${schema}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
    url.pathname='/'+schema;process.env.DATABASE_URL=url.href
    const migration=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env:{...process.env,DATABASE_URL:url.href},windowsHide:true,stdio:'pipe'})
    if(migration.status!==0)throw Error('Operations disposable schema migration failed')
    db=(await import('../src/config/prisma.js')).prisma
    const roles=await Promise.all(['Administrator','Operations reader '+stamp].map(name=>db.role.upsert({where:{name},update:{},create:{name}})))
    ;[admin,reader]=await Promise.all(roles.map((role,i)=>db.user.create({data:{firstName:'Operations',lastName:String(i),email:`ops-${i}-${stamp}@test.invalid`,roleId:role.id,passwordHash:'never-expose-ops-secret'}})))
    tokens={admin:await testAccessToken(db,admin.id,process.env.JWT_ACCESS_SECRET),reader:await testAccessToken(db,reader.id,process.env.JWT_ACCESS_SECRET)}
    root=await fs.mkdtemp(path.resolve('.test-runtime/operations-'))
    for(const [key,value]of Object.entries({BACKUP_STORAGE_DIR:path.join(root,'backups'),ATTACHMENT_STORAGE_DIR:path.join(root,'attachments'),ATTACHMENT_STORAGE_PROVIDER:'LOCAL'})){previous[key]=process.env[key];process.env[key]=value}
    ;[backups,retention,storage]=await Promise.all(['backupService','retentionService','storageService'].map(n=>import(`../src/services/${n}.js`)))
    server=(await import('../src/app.js')).app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));origin=`http://127.0.0.1:${server.address().port}`
  },30000)
  afterAll(async()=>{
    if(server)await new Promise(r=>server.close(r))
    if(db)await db.$disconnect()
    if(host){if(/^techstock_restore_test_[a-z0-9]+$/.test(target))await host.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${target}\``);await host.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`techstock_test_warehouse_ops${stamp}\``);await host.$disconnect()}
    for(const [key,value]of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value
    // Files remain inside ignored test runtime as evidence; no recursive deletion.
  })
  it('restricts health, backups and retention to administrator and emits safe request IDs',async()=>{for(const route of ['/system/health','/system/backups','/system/retention','/system/restores']){expect((await http('reader',route)).status).toBe(403);expect((await http('none',route)).status).toBe(401)}const r=await http('admin','/system/health');expect(r.status).toBe(200);expect(r.requestId).toMatch(/^[a-f0-9-]{36}$/);expect(r.body.data.database).toBe('connected');expect(JSON.stringify(r.body)).not.toMatch(/passwordHash|never-expose|DATABASE_URL|JWT_|MYSQL_PWD/);expect(r.body.data.appVersion).toBe('0.2.0')})
  it('keeps files behind the authorized download route, rejects traversal and unsupported providers',async()=>{const key=crypto.randomUUID()+'.bin';await storage.storageFor().upload(key,Buffer.from('storage regression'));expect((await storage.storageFor().read(key)).toString()).toBe('storage regression');expect(storage.storageFor().getUrl('attachment-id')).toBe('/api/attachments/files/attachment-id');await expect(storage.storageFor().upload('../escape',Buffer.from('bad'))).rejects.toHaveProperty('status',500);expect(()=>storage.storageFor('S3')).toThrow('unavailable');await storage.storageFor().delete(key);expect((await storage.storageStatus()).status).toBe('available')})
  it('returns retention defaults without writes and rejects stale or unsafe policy values',async()=>{expect((await retention.retentionPolicy()).revision).toBe(0);expect(await db.retentionPolicy.count()).toBe(0);expect((await http('admin','/system/retention',{expectedRevision:0,notificationDays:0},'PUT')).status).toBe(400);const p=await retention.updateRetention({expectedRevision:0,notificationDays:30,activityDays:90,backupDays:7,sessionDays:7,archiveEnabled:false},req());expect(p.revision).toBe(1);await expect(retention.updateRetention({expectedRevision:0,notificationDays:30,activityDays:90,backupDays:7,sessionDays:7,archiveEnabled:false},req())).rejects.toHaveProperty('status',409)})
  it('archives old read notifications and logs without deletion, retains unread and allows restore',async()=>{
    const old=new Date(Date.now()-100*86400000),n=await db.notification.create({data:{userId:reader.id,type:'LOW_STOCK',title:'Retention',message:'Evidence',isRead:true,createdAt:old}}),unread=await db.notification.create({data:{userId:reader.id,type:'LOW_STOCK',title:'Unread',message:'Retain',createdAt:old}}),log=await db.activityLog.create({data:{action:'RETENTION_TEST',module:'Operations',description:'Retain historical evidence',createdAt:old}})
    const preview=await retention.archivePreview();expect(preview.eligible.notifications).toBeGreaterThan(0);await expect(retention.archiveHistory(req(),{expectedRevision:1,confirmation:'DELETE'})).rejects.toBeTruthy();await retention.archiveHistory(req(),{expectedRevision:1,confirmation:'ARCHIVE HISTORY'});expect((await db.notification.findUnique({where:{id:n.id}})).archivedAt).toBeTruthy();expect((await db.notification.findUnique({where:{id:unread.id}})).archivedAt).toBeNull();expect((await db.activityLog.findUnique({where:{id:log.id}})).archivedAt).toBeTruthy();await retention.restoreHistory('notifications',n.id,req());expect((await db.notification.findUnique({where:{id:n.id}})).archivedAt).toBeNull()
  })
  it('cleans only expired credential material and retains session metadata and live sessions',async()=>{const old=new Date(Date.now()-20*86400000),s=await db.session.create({data:{userId:reader.id,authVersion:0,refreshTokenHash:crypto.randomBytes(32).toString('hex'),expiresAt:old,createdAt:old}});await retention.cleanupSessions();expect(await db.session.findUnique({where:{id:s.id}})).toMatchObject({refreshTokenHash:null});expect((await http('reader','/auth/me')).status).toBe(200)})
  it('requires explicit backup confirmation and bounds the queue',async()=>{expect((await http('admin','/system/backups',{confirmation:'wrong'})).status).toBe(400);backup=await backups.requestBackup(req());expect(backup.status).toBe('PENDING');await expect(backups.requestBackup(req())).rejects.toHaveProperty('status',409);expect((await backups.listBackups()).data[0].databaseBytes).toBe('0')})
  it('creates a real MySQL dump and uploads manifest, and verifies the file set',async()=>{
    const key=crypto.randomUUID()+'.bin',bytes=Buffer.from('Retained upload backup evidence')
    await storage.storageFor().upload(key,bytes)
    await db.attachment.create({data:{entityType:'Product',entityId:'backup-test-reference',fileName:'evidence.txt',storedName:key,storageKey:key,mimeType:'text/plain',size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),requestKey:crypto.randomUUID(),uploadedById:admin.id}})
    await backups.processBackup();const r=await backups.verifyBackup(backup.id);expect(r.row.status).toBe('COMPLETE');expect(r.manifest.files[0].path).toBe('database.sql');expect(r.row.databaseBytes>0n).toBe(true);expect((await http('admin',`/system/backups/${backup.id}/verify`,{})).status).toBe(200)
  },60000)
  it('rejects existing targets and incorrect confirmations, then performs only a new-schema offline restore',async()=>{await expect(backups.planRestore(backup.id,'techstock_inventory',req())).rejects.toHaveProperty('status',400);plan=await backups.planRestore(backup.id,target,req());await expect(backups.confirmRestore(plan.id,'wrong',req())).rejects.toHaveProperty('status',400);const confirmed=await backups.confirmRestore(plan.id,plan.confirmation,req());expect(confirmed.execution).toBe('OFFLINE_CLI');const r=await backups.executeRestore(plan.id);expect(r.targetSchema).toBe(target);expect((await db.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM \`${target}\`.\`User\` WHERE authVersion=0`))[0].n).toBe(0n);await expect(backups.executeRestore(plan.id)).rejects.toBeTruthy();expect((await http('reader','/auth/me')).status).toBe(200)},60000)
  it('detects tampered files before a restore plan can be created',async()=>{const r=await backups.verifyBackup(backup.id);await fs.appendFile(path.join(r.dir,'database.sql'),'\n-- tampered');await expect(backups.verifyBackup(backup.id)).rejects.toHaveProperty('status',409);await expect(backups.planRestore(backup.id,'techstock_restore_bad_'+stamp,req())).rejects.toHaveProperty('status',409)})
})
