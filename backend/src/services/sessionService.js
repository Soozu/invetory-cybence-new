import { prisma } from '../config/prisma.js'
import { inventoryTransaction } from './inventoryService.js'
import { HttpError } from '../utils/http.js'
import { audit } from '../utils/audit.js'
export function requireAdmin(user){if(user?.role!=='Administrator')throw new HttpError(403,'Administrator access is required.')}
const select={id:true,userId:true,ipAddress:true,reportedPublicIp:true,reportedPublicIpAt:true,userAgent:true,createdAt:true,lastUsedAt:true,expiresAt:true,revokedAt:true}
export async function reportPublicIp({sessionId,ipAddress},req){
  // Bind a delayed browser lookup to the session that started it, even after account switches.
  if(sessionId!==req.sessionId)throw new HttpError(409,'The active session changed. Refresh and try again.')
  const now=new Date(),data={reportedPublicIp:ipAddress,reportedPublicIpAt:now}
  const updated=await prisma.session.updateMany({where:{id:req.sessionId,userId:req.user.id,revokedAt:null,expiresAt:{gt:now}},data})
  if(updated.count!==1)throw new HttpError(401,'Session expired. Please sign in again.')
  return data
}
export async function sessions(userId,req,page=1){
  if(userId!==req.user.id)requireAdmin(req.user)
  const where={userId,revokedAt:null,expiresAt:{gt:new Date()}}
  const [data,total]=await Promise.all([prisma.session.findMany({where,select,orderBy:[{createdAt:'desc'},{id:'asc'}],take:20,skip:(page-1)*20}),prisma.session.count({where})])
  return {data:data.map(row=>({...row,current:row.id===req.sessionId})),pagination:{page,limit:20,total,totalPages:Math.ceil(total/20)}}
}
export async function revokeSessions(userId,id,req){
  if(userId!==req.user.id)requireAdmin(req.user)
  return inventoryTransaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM User WHERE id=${userId} FOR UPDATE`
    const where={userId,revokedAt:null,...(id==='others'?{id:{not:req.sessionId}}:id==='all'?{}:{id})}
    const count=await tx.session.updateMany({where,data:{revokedAt:new Date()}})
    if(id!=='others'&&id!=='all'&&!count.count)throw new HttpError(404,'Active session not found.')
    if(id==='all'){
      await tx.user.update({where:{id:userId},data:{authVersion:{increment:1}}})
      await tx.refreshToken.updateMany({where:{userId,revokedAt:null},data:{revokedAt:new Date()}})
    }else if(id==='others')await tx.refreshToken.updateMany({where:{userId,revokedAt:null},data:{revokedAt:new Date()}})
    await audit(tx,req,'REVOKED','Security','Session',id==='all'||id==='others'?null:id,`Revoked ${count.count} sessions for account ${userId}.`)
    return {revoked:count.count,currentRevoked:userId===req.user.id&&(id==='all'||id===req.sessionId)}
  })
}
export async function unlockAccount(userId,req){
  requireAdmin(req.user)
  return inventoryTransaction(async tx=>{await tx.user.update({where:{id:userId},data:{failedLoginCount:0,lockedUntil:null}});await audit(tx,req,'UNLOCKED','Security','User',userId,'Administrator cleared temporary account lockout.');return {unlocked:true}})
}
