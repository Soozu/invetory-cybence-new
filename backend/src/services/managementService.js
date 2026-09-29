import bcrypt from 'bcrypt'
import { prisma } from '../config/prisma.js'
import { inventoryTransaction } from './inventoryService.js'
import { paginate } from '../utils/query.js'
import { audit } from '../utils/audit.js'
import { HttpError } from '../utils/http.js'
import { publicUser } from '../middleware/auth.js'

const userInclude = { role: { include: { permissions: { include: { permission: true } } } }, warehouse: true }

export async function listUsers(query) {
  const where = {}
  if (query.search) where.OR = [
    { firstName: { contains: query.search } }, { lastName: { contains: query.search } },
    { email: { contains: query.search } }
  ]
  if (query.role) where.roleId = query.role
  if (query.status) where.status = query.status
  const result = await paginate(prisma.user, { where, include: userInclude, query, allowedSort: ['firstName', 'lastName', 'email', 'createdAt', 'lastLoginAt', 'status'], defaultSort: 'createdAt' })
  result.data = result.data.map(user => ({ ...publicUser(user), warehouse: user.warehouse }))
  return result
}

export async function getUser(id) {
  const user = await prisma.user.findUnique({ where: { id }, include: userInclude })
  if (!user) throw new HttpError(404, 'User not found.')
  return { ...publicUser(user), warehouse: user.warehouse }
}

export async function createUser(input, req) {
  const { password, ...data } = input
  const passwordHash = await bcrypt.hash(password, 12)
  return inventoryTransaction(async tx => {
    const user = await tx.user.create({ data: { ...data, email: data.email.toLowerCase(), passwordHash }, include: userInclude })
    await audit(tx, req, 'CREATED', 'Users', 'User', user.id, `Created user ${user.email}.`)
    return publicUser(user)
  })
}

export async function updateUser(id, input, req) {
  return inventoryTransaction(async tx => {
    const user = await tx.user.update({ where: { id }, data: { ...input, ...(input.email ? { email: input.email.toLowerCase() } : {}) }, include: userInclude })
    await audit(tx, req, 'UPDATED', 'Users', 'User', id, `Updated user ${user.email}.`)
    return publicUser(user)
  })
}

export async function changeUserStatus(id, status, req) {
  if (id === req.user.id && status !== 'ACTIVE') throw new HttpError(400, 'You cannot deactivate your own account.')
  return inventoryTransaction(async tx => {
    const user = await tx.user.update({ where: { id }, data: { status }, include: userInclude })
    if (status !== 'ACTIVE') await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })
    await audit(tx, req, 'STATUS_CHANGED', 'Users', 'User', id, `Changed ${user.email} to ${status}.`)
    return publicUser(user)
  })
}

export async function resetPassword(id, password, req) {
  const passwordHash = await bcrypt.hash(password, 12)
  return inventoryTransaction(async tx => {
    const user = await tx.user.update({ where: { id }, data: { passwordHash } })
    await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })
    await audit(tx, req, 'PASSWORD_RESET', 'Users', 'User', id, `Reset password for ${user.email}.`)
    return { id }
  })
}

export async function listRoles() {
  return prisma.role.findMany({ include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } }, orderBy: { name: 'asc' } })
}
export async function createRole(input, req) {
  return inventoryTransaction(async tx => {
    const role = await tx.role.create({ data: input })
    await audit(tx, req, 'CREATED', 'Users', 'Role', role.id, `Created role ${role.name}.`)
    return role
  })
}
export async function updateRole(id, input, req) {
  return inventoryTransaction(async tx => {
    const role = await tx.role.update({ where: { id }, data: input })
    await audit(tx, req, 'UPDATED', 'Users', 'Role', id, `Updated role ${role.name}.`)
    return role
  })
}
export async function deleteRole(id, req) {
  return inventoryTransaction(async tx => {
    const role = await tx.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } })
    if (!role) throw new HttpError(404, 'Role not found.')
    if (role.name === 'Administrator' || role._count.users > 0) throw new HttpError(409, 'This role cannot be deleted while it is in use.')
    await tx.rolePermission.deleteMany({ where: { roleId: id } })
    await tx.role.delete({ where: { id } })
    await audit(tx, req, 'DELETED', 'Users', 'Role', id, `Deleted role ${role.name}.`)
    return { id }
  })
}
export async function setRolePermissions(id, permissionIds, req) {
  return inventoryTransaction(async tx => {
    const role = await tx.role.findUnique({ where: { id } })
    if (!role) throw new HttpError(404, 'Role not found.')
    if (role.name === 'Administrator') throw new HttpError(400, 'Administrator always has full access.')
    if (await tx.permission.count({ where: { id: { in: permissionIds } } }) !== new Set(permissionIds).size) throw new HttpError(400, 'Unknown permission ID.')
    await tx.rolePermission.deleteMany({ where: { roleId: id } })
    if (permissionIds.length) await tx.rolePermission.createMany({ data: [...new Set(permissionIds)].map(permissionId => ({ roleId: id, permissionId })) })
    await audit(tx, req, 'UPDATED', 'Users', 'Role', id, `Updated permissions for ${role.name}.`)
    return tx.role.findUnique({ where: { id }, include: { permissions: { include: { permission: true } } } })
  })
}

export async function readSettings() {
  const records = await prisma.systemSetting.findMany()
  return Object.fromEntries(records.map(record => { let value = record.value; try { value = JSON.parse(value) } catch {} return [record.key, value] }))
}

const settingsGroups = {
  companyName: 'general', companyLogo: 'general', address: 'general', phone: 'general', email: 'general', currency: 'general',
  defaultWarehouseId: 'warehouse', defaultMinimumStock: 'inventory', lowStockNotifications: 'notifications',
  warrantyNotifications: 'notifications', weeklySummary: 'notifications'
}
export async function updateSettings(input, req) {
  const unknown = Object.keys(input).filter(key => !settingsGroups[key])
  if (unknown.length) throw new HttpError(400, `Unknown setting: ${unknown.join(', ')}`)
  return inventoryTransaction(async tx => {
    for (const [key, value] of Object.entries(input)) {
      await tx.systemSetting.upsert({ where: { key }, create: { key, value: JSON.stringify(value), group: settingsGroups[key], updatedById: req.user.id }, update: { value: JSON.stringify(value), updatedById: req.user.id } })
    }
    await audit(tx, req, 'UPDATED', 'Settings', 'SystemSetting', null, `Updated ${Object.keys(input).length} settings.`)
    return input
  })
}
