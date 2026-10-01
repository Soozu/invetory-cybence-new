import bcrypt from 'bcrypt'
import { prisma } from '../config/prisma.js'
import { inventoryTransaction } from './inventoryService.js'
import { paginate } from '../utils/query.js'
import { audit } from '../utils/audit.js'
import { HttpError } from '../utils/http.js'
import { publicUser } from '../middleware/auth.js'
import { requireWarehouseAdministration, isAdministrator } from './warehouseAccessService.js'

const userInclude = { role: { include: { permissions: { include: { permission: true } } } }, warehouse: true, warehouseAssignments: { include: { warehouse: { select: { id: true, name: true } } } } }

export function userScope(user) {
  return isAdministrator(user) ? {} : { id: user.id }
}

async function assignmentData(tx, input, req) {
  requireWarehouseAdministration(req.user)
  const warehouseIds = input.warehouseIds ?? (input.warehouseId ? [input.warehouseId] : [])
  const defaultWarehouseId = input.defaultWarehouseId ?? input.warehouseId ?? warehouseIds[0] ?? null
  if (defaultWarehouseId && !warehouseIds.includes(defaultWarehouseId)) throw new HttpError(400, 'Default warehouse must be assigned.')
  if (await tx.warehouse.count({ where: { id: { in: warehouseIds }, status: 'ACTIVE' } }) !== warehouseIds.length) {
    throw new HttpError(400, 'One or more assigned warehouses are unavailable.')
  }
  return { defaultWarehouseId, rows: warehouseIds.map(warehouseId => ({ warehouseId, isDefault: warehouseId === defaultWarehouseId })) }
}

const userView = user => ({
  ...publicUser(user), warehouse: user.warehouse,
  warehouseAssignments: user.warehouseAssignments?.map(item => ({ warehouseId: item.warehouseId, isDefault: item.isDefault, warehouse: item.warehouse })) || []
})

export async function listUsers(query, user) {
  const where = { AND: [userScope(user)] }
  if (query.search) where.OR = [
    { firstName: { contains: query.search } }, { lastName: { contains: query.search } },
    { email: { contains: query.search } }
  ]
  if (query.role) where.roleId = query.role
  if (query.status) where.status = query.status
  const result = await paginate(prisma.user, { where, include: userInclude, query, allowedSort: ['firstName', 'lastName', 'email', 'createdAt', 'lastLoginAt', 'status'], defaultSort: 'createdAt' })
  result.data = result.data.map(userView)
  return result
}

export async function getUser(id, actor) {
  const user = await prisma.user.findUnique({ where: { id }, include: userInclude })
  if (!user) throw new HttpError(404, 'User not found.')
  if (!isAdministrator(actor) && !await prisma.user.count({ where: { AND: [{ id }, userScope(actor)] } })) throw new HttpError(403, 'You do not have access to this user.')
  return userView(user)
}

export async function createUser(input, req) {
  requireWarehouseAdministration(req.user)
  const { password, warehouseIds, defaultWarehouseId, warehouseId, ...data } = input
  const passwordHash = await bcrypt.hash(password, 12)
  return inventoryTransaction(async tx => {
    const assignment = await assignmentData(tx, input, req)
    const user = await tx.user.create({ data: {
      ...data, email: data.email.toLowerCase(), passwordHash,
      warehouseId: assignment.defaultWarehouseId, warehouseAssignments: { create: assignment.rows }
    }, include: userInclude })
    await audit(tx, req, 'CREATED', 'Users', 'User', user.id, `Created user ${user.email}.`)
    return userView(user)
  })
}

export async function updateUser(id, input, req) {
  if(id===req.user.id&&input.status&&input.status!=='ACTIVE')throw new HttpError(400,'You cannot deactivate your own account.')
  return inventoryTransaction(async tx => {
    requireWarehouseAdministration(req.user)
    const before=await tx.user.findUnique({where:{id}})
    const { warehouseIds, defaultWarehouseId, warehouseId, ...data } = input
    const hasAssignments = ['warehouseIds', 'defaultWarehouseId', 'warehouseId'].some(key => key in input)
    const assignment = hasAssignments ? await assignmentData(tx, input, req) : null
    if (assignment) await tx.userWarehouse.deleteMany({ where: { userId: id } })
    const user = await tx.user.update({ where: { id }, data: {
      ...data, ...(input.status && input.status !== 'ACTIVE' ? {authVersion:{increment:1}} : {}), ...(input.email ? { email: input.email.toLowerCase() } : {}),
      ...(assignment ? { warehouseId: assignment.defaultWarehouseId, warehouseAssignments: { create: assignment.rows } } : {})
    }, include: userInclude })
    if(input.status && input.status !== 'ACTIVE'){
      await tx.session.updateMany({where:{userId:id,revokedAt:null},data:{revokedAt:new Date()}})
      await tx.refreshToken.updateMany({where:{userId:id,revokedAt:null},data:{revokedAt:new Date()}})
    }
    await audit(tx, req, 'UPDATED', 'Users', 'User', id, `Updated user ${user.email}.`,{before,after:user})
    return userView(user)
  })
}

export async function changeUserStatus(id, status, req) {
  requireWarehouseAdministration(req.user)
  if (id === req.user.id && status !== 'ACTIVE') throw new HttpError(400, 'You cannot deactivate your own account.')
  return inventoryTransaction(async tx => {
    const before=await tx.user.findUnique({where:{id}})
    const user = await tx.user.update({ where: { id }, data: { status,...(status!=='ACTIVE'?{authVersion:{increment:1}}:{}) }, include: userInclude })
    if (status !== 'ACTIVE') {
      await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })
      await tx.session.updateMany({where:{userId:id,revokedAt:null},data:{revokedAt:new Date()}})
    }
    await audit(tx, req, 'STATUS_CHANGED', 'Users', 'User', id, `Changed ${user.email} to ${status}.`,{before,after:user})
    return publicUser(user)
  })
}

export async function resetPassword(id, password, req) {
  requireWarehouseAdministration(req.user)
  const passwordHash = await bcrypt.hash(password, 12)
  return inventoryTransaction(async tx => {
    const user = await tx.user.update({ where: { id }, data: { passwordHash,authVersion:{increment:1},failedLoginCount:0,lockedUntil:null } })
    await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })
    await tx.session.updateMany({where:{userId:id,revokedAt:null},data:{revokedAt:new Date()}})
    await audit(tx, req, 'PASSWORD_RESET', 'Users', 'User', id, `Reset password for ${user.email}.`)
    return { id }
  })
}

export async function listRoles() {
  return prisma.role.findMany({ include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } }, orderBy: { name: 'asc' } })
}
export async function createRole(input, req) {
  requireWarehouseAdministration(req.user)
  return inventoryTransaction(async tx => {
    const role = await tx.role.create({ data: input })
    await audit(tx, req, 'CREATED', 'Users', 'Role', role.id, `Created role ${role.name}.`)
    return role
  })
}
export async function updateRole(id, input, req) {
  requireWarehouseAdministration(req.user)
  return inventoryTransaction(async tx => {
    const role = await tx.role.update({ where: { id }, data: input })
    await audit(tx, req, 'UPDATED', 'Users', 'Role', id, `Updated role ${role.name}.`)
    return role
  })
}
export async function deleteRole(id, req) {
  requireWarehouseAdministration(req.user)
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
  requireWarehouseAdministration(req.user)
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
    const rows=await tx.systemSetting.findMany({where:{key:{in:Object.keys(input)}}})
    const before=Object.fromEntries(rows.map(r=>{let v=r.value;try{v=JSON.parse(v)}catch{}return [r.key,v]}))
    for (const [key, value] of Object.entries(input)) {
      await tx.systemSetting.upsert({ where: { key }, create: { key, value: JSON.stringify(value), group: settingsGroups[key], updatedById: req.user.id }, update: { value: JSON.stringify(value), updatedById: req.user.id } })
    }
    await audit(tx, req, 'UPDATED', 'Settings', 'SystemSetting', null, `Updated ${Object.keys(input).length} settings.`,{before,after:input})
    return input
  })
}
