import bcrypt from 'bcrypt'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { prisma } from '../config/prisma.js'
import { env } from '../config/env.js'
import { HttpError } from '../utils/http.js'
import { publicUser } from '../middleware/auth.js'
import { inventoryTransaction } from './inventoryService.js'

const userInclude = { role: { include: { permissions: { include: { permission: true } } } }, warehouseAssignments: true }
export const refreshHash = token => crypto.createHash('sha256').update(token).digest('hex')
export const refreshCookie = { httpOnly: true, secure: env.cookieSecure, sameSite: 'lax', path: '/api/auth' }
const dummyHash = bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12)
const invalid = () => new HttpError(401, 'Invalid email or password, or account temporarily unavailable.')
const expired = () => new HttpError(401, 'Session expired. Please sign in again.')
const metadata = req => ({ ipAddress: req?.ip?.slice(0,64) || null, userAgent: req?.get?.('user-agent')?.slice(0,512) || null })
function tokens(user, sid, remember) {
  const accessToken = jwt.sign({ sub:user.id, sid, ver:user.authVersion, type:'access' }, env.accessSecret, { expiresIn:env.accessExpires, algorithm:'HS256' })
  const refreshToken = jwt.sign({ sub:user.id, sid, ver:user.authVersion, type:'refresh', jti:crypto.randomUUID(), remember }, env.refreshSecret, { expiresIn:env.refreshExpires, algorithm:'HS256' })
  return { accessToken, refreshToken, expiry:new Date(jwt.decode(refreshToken).exp*1000) }
}
function respond(user, pair, res, remember) {
  res.cookie('techstock_refresh', pair.refreshToken, { ...refreshCookie, ...(remember ? {expires:pair.expiry} : {}) })
  return { accessToken:pair.accessToken, user:publicUser(user) }
}
async function createSession(tx, user, remember, req) {
  const sid=crypto.randomUUID(), pair=tokens(user,sid,remember)
  await tx.session.create({data:{id:sid,userId:user.id,authVersion:user.authVersion,refreshTokenHash:refreshHash(pair.refreshToken),expiresAt:pair.expiry,...metadata(req)}})
  return pair
}
export async function issueSession(user, res, remember=false, req) {
  const pair=await createSession(prisma,user,remember,req)
  return respond(user,pair,res,remember)
}
export async function login({email,password,remember}, res, req) {
  const found=await prisma.user.findUnique({where:{email:email.toLowerCase()},select:{id:true}})
  if(!found){await bcrypt.compare(password,await dummyHash);throw invalid()}
  // Serialize attempts per account. Failure results commit before returning 401.
  const result=await inventoryTransaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM User WHERE id=${found.id} FOR UPDATE`
    const user=await tx.user.findUnique({where:{id:found.id},include:userInclude}),now=new Date()
    if(!user||user.status!=='ACTIVE'||user.lockedUntil>now){await bcrypt.compare(password,await dummyHash);return null}
    if(!await bcrypt.compare(password,user.passwordHash)){
      const count=user.lockedUntil&&user.lockedUntil<=now ? 1 : user.failedLoginCount+1
      await tx.user.update({where:{id:user.id},data:{failedLoginCount:count,lastFailedLoginAt:now,lockedUntil:count>=5?new Date(now.getTime()+15*60000):null}})
      return null
    }
    await tx.user.update({where:{id:user.id},data:{lastLoginAt:now,failedLoginCount:0,lockedUntil:null}})
    return {user,pair:await createSession(tx,user,remember,req)}
  })
  if(!result)throw invalid()
  return respond(result.user,result.pair,res,remember)
}
export async function refresh(req,res) {
  const token=req.cookies?.techstock_refresh
  if(!token)throw expired()
  let payload
  try{payload=jwt.verify(token,env.refreshSecret,{algorithms:['HS256']})}catch{throw expired()}
  if(typeof payload.sub!=='string'||(payload.sid!==undefined&&typeof payload.sid!=='string')||(payload.type!==undefined&&payload.type!=='refresh'))throw expired()
  const hash=refreshHash(token),remember=Boolean(payload.remember)
  const result=await inventoryTransaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM User WHERE id=${payload.sub} FOR UPDATE`
    const user=await tx.user.findUnique({where:{id:payload.sub},include:userInclude}),now=new Date()
    if(!user||user.status!=='ACTIVE')throw expired()
    if(!payload.sid){
      // One-time conversion of a still-valid pre-Phase-15 refresh cookie.
      const old=await tx.refreshToken.findUnique({where:{tokenHash:hash}})
      if(!old||old.revokedAt||old.expiresAt<=now||old.userId!==user.id||user.authVersion!==0)throw expired()
      const claim=await tx.refreshToken.updateMany({where:{id:old.id,revokedAt:null},data:{revokedAt:now}})
      if(claim.count!==1)throw expired()
      return {user,pair:await createSession(tx,user,remember,req)}
    }
    if(payload.type!=='refresh'||payload.ver!==user.authVersion)throw expired()
    const current=await tx.session.findUnique({where:{id:payload.sid}})
    if(!current||current.userId!==user.id||current.authVersion!==user.authVersion||current.refreshTokenHash!==hash||current.revokedAt||current.expiresAt<=now)throw expired()
    const pair=tokens(user,current.id,remember)
    const changed=await tx.session.updateMany({where:{id:current.id,refreshTokenHash:hash,revokedAt:null},data:{refreshTokenHash:refreshHash(pair.refreshToken),lastUsedAt:now,expiresAt:pair.expiry}})
    if(changed.count!==1)throw expired()
    return {user,pair}
  })
  return respond(result.user,result.pair,res,remember)
}
export async function logout(req,res) {
  const token=req.cookies?.techstock_refresh
  if(token){
    let payload;try{payload=jwt.verify(token,env.refreshSecret,{algorithms:['HS256']})}catch{}
    if(typeof payload?.sub==='string')await inventoryTransaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM User WHERE id=${payload.sub} FOR UPDATE`
      await tx.refreshToken.updateMany({where:{tokenHash:refreshHash(token),revokedAt:null},data:{revokedAt:new Date()}})
      if(typeof payload.sid==='string'&&payload.type==='refresh')await tx.session.updateMany({where:{id:payload.sid,userId:payload.sub,revokedAt:null},data:{revokedAt:new Date()}})
    })
  }
  res.clearCookie('techstock_refresh',refreshCookie)
}
export async function changePassword(userId,currentPassword,newPassword,res) {
  const user=await prisma.user.findUnique({where:{id:userId}})
  if(!user||!await bcrypt.compare(currentPassword,user.passwordHash))throw new HttpError(400,'Current password is incorrect.')
  const passwordHash=await bcrypt.hash(newPassword,12)
  await inventoryTransaction(async tx=>{
    const changed=await tx.user.updateMany({where:{id:userId,passwordHash:user.passwordHash},data:{passwordHash,authVersion:{increment:1},failedLoginCount:0,lockedUntil:null}})
    if(changed.count!==1)throw new HttpError(409,'Password changed elsewhere. Sign in again.')
    await tx.refreshToken.updateMany({where:{userId,revokedAt:null},data:{revokedAt:new Date()}})
    await tx.session.updateMany({where:{userId,revokedAt:null},data:{revokedAt:new Date()}})
  })
  res.clearCookie('techstock_refresh',refreshCookie)
}
