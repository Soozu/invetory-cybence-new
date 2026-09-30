import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { userSchema, userUpdateSchema, warehouseAssignmentsSchema, userStatusSchema, resetPasswordSchema, roleSchema, permissionSetSchema, settingsSchema } from '../validators/management.js'
import * as controller from '../controllers/managementController.js'

export const managementRoutes = Router()
managementRoutes.use(authenticate)
managementRoutes.get('/users', authorize('users', 'VIEW'), controller.users.list)
managementRoutes.get('/users/:id', authorize('users', 'VIEW'), controller.users.get)
managementRoutes.post('/users', authorize('users', 'CREATE'), validate(userSchema), controller.users.create)
managementRoutes.put('/users/:id', authorize('users', 'EDIT'), validate(userUpdateSchema), controller.users.update)
managementRoutes.put('/users/:id/warehouses', authorize('users', 'EDIT'), validate(warehouseAssignmentsSchema), controller.users.update)
managementRoutes.post('/users/:id/change-status', authorize('users', 'EDIT'), validate(userStatusSchema), controller.users.status)
managementRoutes.post('/users/:id/reset-password', authorize('users', 'EDIT'), validate(resetPasswordSchema), controller.users.password)
managementRoutes.get('/roles', authorize('users', 'VIEW'), controller.roles.list)
managementRoutes.get('/permissions', authorize('users', 'VIEW'), controller.roles.permissions)
managementRoutes.post('/roles', authorize('users', 'CREATE'), validate(roleSchema), controller.roles.create)
managementRoutes.put('/roles/:id', authorize('users', 'EDIT'), validate(roleSchema.partial()), controller.roles.update)
managementRoutes.delete('/roles/:id', authorize('users', 'DELETE'), controller.roles.remove)
managementRoutes.put('/roles/:id/permissions', authorize('users', 'EDIT'), validate(permissionSetSchema), controller.roles.setPermissions)
managementRoutes.get('/notifications', controller.notifications.list)
managementRoutes.post('/notifications/read-all', controller.notifications.readAll)
managementRoutes.post('/notifications/:id/read', controller.notifications.read)
managementRoutes.get('/activity-logs', authorize('users', 'VIEW'), controller.activity)
managementRoutes.get('/settings', authorize('settings', 'VIEW'), controller.settings.get)
managementRoutes.put('/settings', authorize('settings', 'EDIT'), validate(settingsSchema), controller.settings.update)
