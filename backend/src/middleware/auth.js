import jwt from 'jsonwebtoken'
import { prisma } from '../config/prisma.js'
import { env } from '../config/env.js'
import { HttpError } from '../utils/http.js'

export const publicUser = user => ({
  id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email,
  roleId: user.roleId, role: user.role?.name, warehouseId: user.warehouseId,
  warehouseIds: user.warehouseAssignments?.map(item => item.warehouseId) || [],
  defaultWarehouseId: user.warehouseAssignments?.find(item => item.isDefault)?.warehouseId || null,
  avatar: user.avatar, phone: user.phone, status: user.status, lastLoginAt: user.lastLoginAt,
  permissions: user.role?.permissions?.map(item => `${item.permission.module}.${item.permission.action}`) || []
})

export async function authenticate(req, res, next) {
  const token = /^Bearer (.+)$/i.exec(req.get('authorization') || '')?.[1]
  if (!token) throw new HttpError(401, 'Authentication required.')
  let payload
  try { payload = jwt.verify(token, env.accessSecret, { algorithms: ['HS256'] }) }
  catch { throw new HttpError(401, 'Session expired. Please sign in again.') }
  if (payload.type !== 'access' || typeof payload.sid !== 'string' || typeof payload.sub !== 'string' || !Number.isInteger(payload.ver)) throw new HttpError(401, 'Session expired. Please sign in again.')
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { role: { include: { permissions: { include: { permission: true } } } }, warehouseAssignments: true }
  })
  if (!user || user.status !== 'ACTIVE') throw new HttpError(401, 'Account is inactive or unavailable.')
  const session = await prisma.session.findUnique({ where: { id: payload.sid }, select: { userId:true, authVersion:true, expiresAt:true, revokedAt:true,lastUsedAt:true } })
  if (!session || session.userId !== user.id || session.authVersion !== user.authVersion || payload.ver !== user.authVersion || session.revokedAt || session.expiresAt <= new Date()) throw new HttpError(401, 'Session expired. Please sign in again.')
  req.sessionId = payload.sid
  if(session.lastUsedAt<new Date(Date.now()-5*60000))await prisma.session.updateMany({where:{id:payload.sid,revokedAt:null,lastUsedAt:session.lastUsedAt},data:{lastUsedAt:new Date()}})
  req.user = publicUser(user)
  next()
}

export const authorize = (module, action) => (req, res, next) => {
  if (req.user?.role === 'Administrator' || req.user?.permissions.includes(`${module}.${action}`)) return next()
  throw new HttpError(403, 'You do not have permission for this action.')
}
