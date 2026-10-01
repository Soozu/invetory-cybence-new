import { z } from 'zod'
import { prisma } from '../config/prisma.js'
import { inventoryTransaction } from './inventoryService.js'
import { HttpError } from '../utils/http.js'
import { audit } from '../utils/audit.js'
export const retentionSchema=z.object({expectedRevision:z.number().int().min(0),notificationDays:z.number().int().min(30).max(3650),activityDays:z.number().int().min(90).max(7300),backupDays:z.number().int().min(7).max(3650),sessionDays:z.number().int().min(7).max(365),archiveEnabled:z.boolean()}).strict()
const defaults={revision:0,notificationDays:365,activityDays:730,backupDays:30,sessionDays:30,archiveEnabled:false}
export async function retentionPolicy(){return await prisma.retentionPolicy.findUnique({where:{id:'default'}})||defaults}
export async function updateRetention(body,req){const {expectedRevision,...data}=retentionSchema.parse(body);return inventoryTransaction(async tx=>{
  const old=await tx.retentionPolicy.findUnique({where:{id:'default'}})
  if((old?.revision||0)!==expectedRevision)throw new HttpError(409,'Retention policy changed. Reload before saving.')
  const row=old?await tx.retentionPolicy.update({where:{id:'default',revision:expectedRevision},data:{...data,revision:{increment:1},updatedById:req.user.id}}):await tx.retentionPolicy.create({data:{...data,updatedById:req.user.id}})
  await audit(tx,req,'UPDATED','Operations','RetentionPolicy','default','Updated retention policy. Historical records and file bytes are retained.')
  return row
})}
const before=(now,days)=>new Date(now.getTime()-days*86400000)
export async function archivePreview(){
  const p=await retentionPolicy(),now=new Date()
  return {...p,eligible:{notifications:await prisma.notification.count({where:{archivedAt:null,isRead:true,createdAt:{lt:before(now,p.notificationDays)}}}),activityLogs:await prisma.activityLog.count({where:{archivedAt:null,createdAt:{lt:before(now,p.activityDays)}}})}}
}
export async function archiveHistory(req,body){
  const input=z.object({expectedRevision:z.number().int().min(0),confirmation:z.literal('ARCHIVE HISTORY')}).strict().parse(body)
  return inventoryTransaction(async tx=>{const p=await tx.retentionPolicy.findUnique({where:{id:'default'}})||defaults
    if(p.revision!==input.expectedRevision)throw new HttpError(409,'Retention policy changed. Preview again.')
    const now=new Date(),notificationWhere={archivedAt:null,isRead:true,createdAt:{lt:before(now,p.notificationDays)}},activityWhere={archivedAt:null,createdAt:{lt:before(now,p.activityDays)}}
    const [notificationIds,activityIds]=await Promise.all([tx.notification.findMany({where:notificationWhere,select:{id:true},orderBy:[{createdAt:'asc'},{id:'asc'}],take:1000}),tx.activityLog.findMany({where:activityWhere,select:{id:true},orderBy:[{createdAt:'asc'},{id:'asc'}],take:1000})])
    const notifications=await tx.notification.updateMany({where:{...notificationWhere,id:{in:notificationIds.map(r=>r.id)}},data:{archivedAt:now}}),logs=await tx.activityLog.updateMany({where:{...activityWhere,id:{in:activityIds.map(r=>r.id)}},data:{archivedAt:now}})
    if(req.user||notifications.count||logs.count)await audit(tx,req,'ARCHIVED','Operations','RetentionPolicy','default',`Archived ${notifications.count} read notifications and ${logs.count} activity records. No rows or files deleted.`)
    return {notifications:notifications.count,activityLogs:logs.count}
  })
}
export async function runRetention(){const p=await retentionPolicy();if(p.archiveEnabled)await archiveHistory({user:null,ip:null,get:()=>null},{expectedRevision:p.revision,confirmation:'ARCHIVE HISTORY'})}
export async function restoreHistory(type,id,req){const model={notifications:prisma.notification,activity:prisma.activityLog}[type];if(!model)throw new HttpError(400,'Unsupported archive type.');return prisma.$transaction(async tx=>{const m=type==='notifications'?tx.notification:tx.activityLog;const changed=await m.updateMany({where:{id,archivedAt:{not:null}},data:{archivedAt:null}});if(!changed.count)throw new HttpError(404,'Archived record not found.');await audit(tx,req,'RESTORED','Operations','RetentionPolicy',id,'Restored archived historical record.');return {restored:true}})}
export async function cleanupSessions(){
  const p=await retentionPolicy(),now=new Date(),cutoff=before(now,p.sessionDays)
  await prisma.session.updateMany({where:{expiresAt:{lt:now},revokedAt:null},data:{revokedAt:now}})
  // Retain session metadata; discard only old unusable credential hashes.
  await prisma.session.updateMany({where:{OR:[{expiresAt:{lt:cutoff}},{revokedAt:{lt:cutoff}}],refreshTokenHash:{not:null}},data:{refreshTokenHash:null}})
  await prisma.refreshToken.deleteMany({where:{OR:[{expiresAt:{lt:cutoff}},{revokedAt:{lt:cutoff}}]}})
}
