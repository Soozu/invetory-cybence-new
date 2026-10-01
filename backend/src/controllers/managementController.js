import { activityLogs,activityDetail } from '../services/activityService.js'
import { notificationWhere } from '../services/notificationDelivery.js'
import { warehouseWhere, activityWhere } from '../services/warehouseAccessService.js'
import { prisma } from '../config/prisma.js'
import { ok } from '../utils/http.js'
import { paginate } from '../utils/query.js'
import * as service from '../services/managementService.js'
import { ensureUserNotifications } from '../services/notificationService.js'

export const users = {
  list: async (req, res) => { const result = await service.listUsers(req.query, req.user); ok(res, result.data, 'OK', 200, { pagination: result.pagination }) },
  get: async (req, res) => ok(res, await service.getUser(req.params.id, req.user)),
  create: async (req, res) => ok(res, await service.createUser(req.validated, req), 'User created.', 201),
  update: async (req, res) => ok(res, await service.updateUser(req.params.id, req.validated, req), 'User updated.'),
  status: async (req, res) => ok(res, await service.changeUserStatus(req.params.id, req.validated.status, req), 'User status updated.'),
  password: async (req, res) => ok(res, await service.resetPassword(req.params.id, req.validated.newPassword, req), 'Password reset.')
}
export const roles = {
  list: async (req, res) => ok(res, await service.listRoles()),
  permissions: async (req, res) => ok(res, await prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { action: 'asc' }] })),
  create: async (req, res) => ok(res, await service.createRole(req.validated, req), 'Role created.', 201),
  update: async (req, res) => ok(res, await service.updateRole(req.params.id, req.validated, req), 'Role updated.'),
  remove: async (req, res) => ok(res, await service.deleteRole(req.params.id, req), 'Role deleted.'),
  setPermissions: async (req, res) => ok(res, await service.setRolePermissions(req.params.id, req.validated.permissionIds, req), 'Permissions updated.')
}
export const notifications = {
  list: async (req, res) => {
    await ensureUserNotifications(req.user)
    const result = await paginate(prisma.notification, { where: await notificationWhere(prisma,req.user), query: req.query, allowedSort: ['createdAt', 'isRead'], defaultSort: 'createdAt' })
    ok(res, result.data, 'OK', 200, { pagination: result.pagination })
  },
  read: async (req, res) => ok(res, await prisma.notification.updateMany({ where: { id: req.params.id, ...await notificationWhere(prisma,req.user) }, data: { isRead: true } }), 'Notification marked read.'),
  readAll: async (req, res) => ok(res, await prisma.notification.updateMany({ where: { isRead: false, ...await notificationWhere(prisma,req.user) }, data: { isRead: true } }), 'Notifications marked read.')
}
export const activity=async(req,res)=>res.json({success:true,...await activityLogs(req.query,req.user)})
export const activityGet=async(req,res)=>ok(res,await activityDetail(req.params.id,req.user))
export const settings = {
  get: async (req, res) => ok(res, await service.readSettings()),
  update: async (req, res) => ok(res, await service.updateSettings(req.validated, req), 'Settings updated.')
}
