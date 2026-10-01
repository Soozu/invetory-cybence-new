import fs from 'node:fs/promises'
import { createReadStream,createWriteStream } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { prisma } from '../config/prisma.js'
import { HttpError } from '../utils/http.js'
import { audit } from '../utils/audit.js'
import { storageRoot,storageProvider } from './storageService.js'
const uuid=/^[a-f0-9-]{36}$/
const digest=buffer=>crypto.createHash('sha256').update(buffer).digest('hex')
export const restoreTarget=value=>/^techstock_restore_[a-z0-9_]{1,46}$/.test(value)
export function backupRoot(){
  const root=path.resolve(process.env.BACKUP_STORAGE_DIR||'.private-storage/backups')
  for(const dir of [path.resolve('uploads'),storageRoot()])if(root===dir||root.startsWith(dir+path.sep)||dir.startsWith(root+path.sep))throw Error('Backup storage must be separate from upload storage.')
  return root
}
async function directory(id){
  if(!uuid.test(id))throw new HttpError(404,'Backup not found.')
  const root=backupRoot();await fs.mkdir(root,{recursive:true,mode:0o700})
  if((await fs.lstat(root)).isSymbolicLink())throw Error('Backup root must not be a symbolic link.')
  const dir=path.join(await fs.realpath(root),id)
  try{if((await fs.lstat(dir)).isSymbolicLink())throw Error('Invalid backup directory.')}catch(error){if(error.code!=='ENOENT')throw error}
  return dir
}
export async function mysqlTool(name){
  const configured=process.env[name==='mysqldump'?'MYSQLDUMP_PATH':'MYSQL_PATH']
  const candidates=configured?[configured]:process.platform==='win32'?[`C:/Program Files/MySQL/MySQL Server 8.0/bin/${name}.exe`]:[`/usr/bin/${name}`,`/usr/local/bin/${name}`]
  for(const file of candidates){try{await fs.access(file);return file}catch{}}
  throw new HttpError(503,'MySQL backup tools are not configured on this host.')
}
export async function backupConfiguration(){
  try{storageProvider();backupRoot();await mysqlTool('mysqldump');return {provider:'LOCAL_MYSQL',configured:true,schedulingMinutes:Number(process.env.BACKUP_INTERVAL_MINUTES||0)}}
  catch{return {provider:'LOCAL_MYSQL',configured:false,schedulingMinutes:0}}
}
function databaseOptions(url){
  if(url.protocol!=='mysql:'||!/^\/[a-zA-Z0-9_]{1,64}$/.test(url.pathname))throw Error('Unsupported database configuration.')
  return [`--host=${url.hostname}`,`--port=${url.port||3306}`,`--user=${decodeURIComponent(url.username)}`,'--default-character-set=utf8mb4']
}
export async function runMysql(name,args,{input,output,url=new URL(process.env.DATABASE_URL)}={}){
  const executable=await mysqlTool(name)
  // Credentials go only to the child environment, never shell text, logs or argv.
  const child=spawn(executable,[...databaseOptions(url),...args],{shell:false,windowsHide:true,env:{...process.env,MYSQL_PWD:decodeURIComponent(url.password)},stdio:['pipe','pipe','pipe']})
  child.stderr.resume()
  const completed=new Promise((resolve,reject)=>{child.once('error',()=>reject(new HttpError(503,'MySQL tool could not start.')));child.once('exit',code=>code===0?resolve():reject(new HttpError(503,'MySQL tool failed. Check host configuration.')))})
  const timeout=setTimeout(()=>child.kill(),20*60000);timeout.unref()
  try{
    await Promise.all([completed,input?pipeline(createReadStream(input),child.stdin):Promise.resolve(child.stdin.end()),output?pipeline(child.stdout,createWriteStream(output,{flags:'wx',mode:0o600})):Promise.resolve(child.stdout.resume())])
  }finally{clearTimeout(timeout);if(child.exitCode===null)child.kill()}
}
async function fingerprint(file){
  const hash=crypto.createHash('sha256');let size=0
  for await(const chunk of createReadStream(file)){hash.update(chunk);size+=chunk.length}
  return {size,sha256:hash.digest('hex')}
}
async function copyTree(source,destination,prefix,files){
  let stat;try{stat=await fs.lstat(source)}catch(error){if(error.code==='ENOENT')return;throw error}
  if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('Invalid upload directory.')
  await fs.mkdir(destination,{recursive:true,mode:0o700})
  for(const item of await fs.readdir(source,{withFileTypes:true})){
    if(item.isSymbolicLink())throw Error('Symbolic links are not included in backups.')
    if(!/^[a-zA-Z0-9._ -]+$/.test(item.name))throw Error('Unsupported upload filename.')
    const from=path.join(source,item.name),to=path.join(destination,item.name),relative=prefix+'/'+item.name
    if(item.isDirectory())await copyTree(from,to,relative,files)
    else if(item.isFile()){await fs.copyFile(from,to,fs.constants.COPYFILE_EXCL);await fs.chmod(to,0o600);files.push({path:relative,...await fingerprint(to)})}
    else throw Error('Unsupported upload file type.')
  }
}
const dto=row=>({...row,databaseBytes:String(row.databaseBytes),uploadsBytes:String(row.uploadsBytes)})
export async function listBackups(page=1){const [data,total]=await Promise.all([prisma.backupRun.findMany({orderBy:[{startedAt:'desc'},{id:'asc'}],take:20,skip:(page-1)*20}),prisma.backupRun.count()]);return {data:data.map(dto),pagination:{page,limit:20,total,totalPages:Math.ceil(total/20)},configuration:await backupConfiguration()}}
export async function requestBackup(req){
  if(!(await backupConfiguration()).configured)throw new HttpError(503,'Configure MySQL tools and private backup storage first.')
  const days=(await prisma.retentionPolicy.findUnique({where:{id:'default'}}))?.backupDays||30
  const row=await prisma.$transaction(async tx=>{
    // Database lease serializes requests and avoids an unbounded backup queue.
    await tx.jobLease.upsert({where:{name:'backup-request'},create:{name:'backup-request'},update:{}})
    await tx.$queryRaw`SELECT name FROM JobLease WHERE name='backup-request' FOR UPDATE`
    if(await tx.backupRun.count({where:{status:{in:['PENDING','RUNNING']}}}))throw new HttpError(409,'A backup is already pending or running.')
    const created=await tx.backupRun.create({data:{status:'PENDING',databaseStatus:'PENDING',uploadsStatus:'PENDING',schemaName:new URL(process.env.DATABASE_URL).pathname.slice(1),requestedById:req?.user?.id||null,retainedUntil:new Date(Date.now()+days*86400000)}})
    if(req)await audit(tx,req,'REQUESTED','Operations','BackupRun',created.id,'Requested database and upload backup.')
    return created
  })
  return dto(row)
}
export async function processBackup(){
  // A killed tool/process cannot leave the one-item queue blocked indefinitely.
  await prisma.backupRun.updateMany({where:{status:'RUNNING',startedAt:{lt:new Date(Date.now()-25*60000)}},data:{status:'FAILED',databaseStatus:'FAILED',uploadsStatus:'FAILED',errorSummary:'Backup interrupted. Create a new backup after checking storage.',completedAt:new Date()}})
  const row=await prisma.backupRun.findFirst({where:{status:'PENDING'},orderBy:{startedAt:'asc'}})
  if(!row)return
  if((await prisma.backupRun.updateMany({where:{id:row.id,status:'PENDING'},data:{status:'RUNNING',databaseStatus:'RUNNING',startedAt:new Date()}})).count!==1)return
  let databaseComplete=false
  try{
    storageProvider();const dir=await directory(row.id);await fs.mkdir(dir,{mode:0o700})
    await runMysql('mysqldump',['--single-transaction','--no-tablespaces','--set-gtid-purged=OFF','--hex-blob','--routines','--events','--triggers','--skip-comments',row.schemaName],{output:path.join(dir,'database.sql')})
    const files=[{path:'database.sql',...await fingerprint(path.join(dir,'database.sql'))}]
    databaseComplete=true
    await prisma.backupRun.update({where:{id:row.id},data:{databaseStatus:'COMPLETE',uploadsStatus:'RUNNING'}})
    await copyTree(storageRoot(),path.join(dir,'attachments'),'attachments',files)
    await copyTree(path.resolve('uploads'),path.join(dir,'uploads'),'uploads',files)
    // Every attachment present in the live database must have backed-up bytes.
    // Extra files copied after the SQL snapshot are safe, retained additions.
    const attachments=await prisma.attachment.findMany({select:{storageKey:true,sha256:true,size:true,storageProvider:true}})
    for(const a of attachments){const file=files.find(f=>f.path==='attachments/'+a.storageKey);if(a.storageProvider!=='LOCAL'||!file||file.sha256!==a.sha256||file.size!==a.size)throw Error('Attachment coverage check failed.')}
    const manifest=Buffer.from(JSON.stringify({version:1,id:row.id,schema:row.schemaName,createdAt:new Date().toISOString(),files}))
    await fs.writeFile(path.join(dir,'manifest.json'),manifest,{flag:'wx',mode:0o600})
    await prisma.backupRun.update({where:{id:row.id},data:{status:'COMPLETE',databaseStatus:'COMPLETE',uploadsStatus:'COMPLETE',databaseBytes:files[0].size,uploadsBytes:files.slice(1).reduce((n,f)=>n+f.size,0),fileCount:files.length-1,manifestHash:digest(manifest),completedAt:new Date()}})
  }catch{
    await prisma.backupRun.update({where:{id:row.id},data:{status:'FAILED',databaseStatus:databaseComplete?'COMPLETE':'FAILED',uploadsStatus:'FAILED',errorSummary:'Backup failed. Check tools, storage and file coverage.',completedAt:new Date()}})
    throw new HttpError(503,'Backup failed. Check tools, storage and file coverage.')
  }
}
export async function verifyBackup(id){
  const row=await prisma.backupRun.findUnique({where:{id}})
  if(!row||row.status!=='COMPLETE'||!row.manifestHash)throw new HttpError(409,'A completed backup is required.')
  const dir=await directory(id),bytes=await fs.readFile(path.join(dir,'manifest.json'))
  if(digest(bytes)!==row.manifestHash)throw new HttpError(409,'Backup manifest integrity check failed.')
  const manifest=JSON.parse(bytes)
  if(manifest.version!==1||manifest.id!==id||manifest.schema!==row.schemaName||!Array.isArray(manifest.files)||!manifest.files.some(f=>f.path==='database.sql'))throw new HttpError(409,'Invalid backup manifest.')
  const seen=new Set()
  for(const file of manifest.files){
    if(typeof file.path!=='string'||!(/^(database\.sql|(attachments|uploads)\/[a-zA-Z0-9._ /-]+)$/).test(file.path)||file.path.split('/').some(p=>!p||p==='.'||p==='..')||seen.has(file.path))throw new HttpError(409,'Invalid backup file reference.')
    seen.add(file.path);let at=dir
    for(const part of file.path.split('/')){at=path.join(at,part);if((await fs.lstat(at)).isSymbolicLink())throw new HttpError(409,'Invalid backup file reference.')}
    const found=await fingerprint(at)
    if(found.size!==file.size||found.sha256!==file.sha256)throw new HttpError(409,'Backup file integrity check failed.')
  }
  return {row,dir,manifest}
}
export async function planRestore(backupId,targetSchema,req){
  if(!restoreTarget(targetSchema))throw new HttpError(400,'Use a new techstock_restore_ schema name.')
  const {row}=await verifyBackup(backupId)
  const existing=await prisma.$queryRaw`SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=${targetSchema}`
  if(existing.length)throw new HttpError(409,'Restore target must be a new schema.')
  const plan=await prisma.restorePlan.create({data:{backupId,targetSchema,manifestHash:row.manifestHash,requestedById:req.user.id,expiresAt:new Date(Date.now()+30*60000)}})
  return {...plan,confirmation:`RESTORE ${backupId} INTO ${targetSchema}`,execution:'OFFLINE_CLI'}
}
export async function confirmRestore(id,confirmation,req){
  const plan=await prisma.restorePlan.findUnique({where:{id}})
  if(!plan||plan.requestedById!==req.user.id||plan.status!=='PENDING'||plan.expiresAt<=new Date())throw new HttpError(409,'Restore plan expired or unavailable.')
  if(confirmation!==`RESTORE ${plan.backupId} INTO ${plan.targetSchema}`)throw new HttpError(400,'Exact restore confirmation is required.')
  const {row}=await verifyBackup(plan.backupId)
  if(row.manifestHash!==plan.manifestHash)throw new HttpError(409,'Backup changed. Create a new plan.')
  return prisma.$transaction(async tx=>{const changed=await tx.restorePlan.updateMany({where:{id,status:'PENDING',expiresAt:{gt:new Date()}},data:{status:'CONFIRMED',confirmedAt:new Date()}});if(changed.count!==1)throw new HttpError(409,'Restore plan changed.');await audit(tx,req,'CONFIRMED','Operations','RestorePlan',id,`Confirmed offline restore into new schema ${plan.targetSchema}.`);return {id,status:'CONFIRMED',command:`npm run backup:restore -- --plan ${id}`,execution:'OFFLINE_CLI'}})
}
// No HTTP endpoint runs restore. An operator executes a confirmed plan into a NEW
// schema and NEW file directory, verifies it, then controls any deployment cutover.
export async function executeRestore(id){
  if(!uuid.test(id))throw Error('Invalid restore plan reference.')
  const plan=await prisma.restorePlan.findUnique({where:{id}})
  if(!plan||plan.status!=='CONFIRMED'||plan.expiresAt<=new Date()||!restoreTarget(plan.targetSchema))throw Error('Confirmed, unexpired restore plan required.')
  if(!await prisma.user.count({where:{id:plan.requestedById,status:'ACTIVE',role:{name:'Administrator'}}}))throw Error('Restore approval account is no longer an active administrator.')
  const {row,dir,manifest}=await verifyBackup(plan.backupId)
  if(row.manifestHash!==plan.manifestHash)throw Error('Backup changed.')
  if((await prisma.$queryRaw`SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=${plan.targetSchema}`).length)throw Error('Restore target already exists.')
  const destination=path.join(backupRoot(),'restored-'+id)
  try{await fs.lstat(destination);throw Error('Restore file destination already exists.')}catch(error){if(error.code!=='ENOENT')throw error}
  if((await prisma.restorePlan.updateMany({where:{id,status:'CONFIRMED',expiresAt:{gt:new Date()}},data:{status:'RUNNING'}})).count!==1)throw Error('Restore plan is already claimed.')
  try{
    await prisma.$executeRawUnsafe(`CREATE DATABASE \`${plan.targetSchema}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
    await runMysql('mysql',[plan.targetSchema],{input:path.join(dir,'database.sql')})
    await fs.mkdir(destination,{mode:0o700});const files=[]
    for(const kind of ['attachments','uploads'])await copyTree(path.join(dir,kind),path.join(destination,kind),kind,files)
    for(const f of files){const expected=manifest.files.find(row=>row.path===f.path);if(!expected||expected.sha256!==f.sha256||expected.size!==f.size)throw Error('Restored file integrity mismatch.')}
    if(files.length!==manifest.files.filter(f=>f.path!=='database.sql').length)throw Error('Restored upload set is incomplete.')
    // Restored authentication material must never reactivate old access/cookies.
    await prisma.$executeRawUnsafe(`UPDATE \`${plan.targetSchema}\`.\`User\` SET authVersion=authVersion+1`)
    await prisma.$executeRawUnsafe(`UPDATE \`${plan.targetSchema}\`.\`Session\` SET revokedAt=NOW(3),refreshTokenHash=NULL`)
    await prisma.$executeRawUnsafe(`UPDATE \`${plan.targetSchema}\`.\`RefreshToken\` SET revokedAt=NOW(3)`)
    await prisma.$executeRawUnsafe(`DELETE FROM \`${plan.targetSchema}\`.\`JobLease\``)
    await prisma.$executeRawUnsafe(`UPDATE \`${plan.targetSchema}\`.\`BackupRun\` SET status='FAILED',errorSummary='Restored historical in-progress backup.' WHERE status IN ('PENDING','RUNNING')`)
    await prisma.$executeRawUnsafe(`UPDATE \`${plan.targetSchema}\`.\`RestorePlan\` SET status='EXPIRED' WHERE status IN ('PENDING','CONFIRMED','RUNNING')`)
    await prisma.restorePlan.update({where:{id},data:{status:'COMPLETE',completedAt:new Date()}})
    return {targetSchema:plan.targetSchema,filesDirectory:destination,status:'COMPLETE',cutover:'Manual verification and environment cutover required.'}
  }catch{await prisma.restorePlan.update({where:{id},data:{status:'FAILED',completedAt:new Date()}});throw Error('Restore failed; partial new target retained for diagnosis. Original database and uploads unchanged.')}
}
