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
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { role: { include: { permissions: { include: { permission: true } } } }, warehouseAssignments: true }
  })
  if (!user || user.status !== 'ACTIVE') throw new HttpError(401, 'Account is inactive or unavailable.')
  req.user = publicUser(user)
  next()
}

export const authorize = (module, action) => (req, res, next) => {
  if (req.user?.role === 'Administrator' || req.user?.permissions.includes(`${module}.${action}`)) return next()
  throw new HttpError(403, 'You do not have permission for this action.')
}
