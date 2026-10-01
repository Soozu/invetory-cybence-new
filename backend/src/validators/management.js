import { z } from 'zod'
import { passwordSchema } from './auth.js'

export const userSchema = z.object({
  firstName: z.string().trim().min(1), lastName: z.string().trim().min(1),
  email: z.string().email(), password: passwordSchema,
  roleId: z.string().min(1), warehouseId: z.string().optional().nullable(),
  warehouseIds: z.array(z.string().min(1)).max(100).refine(ids => new Set(ids).size === ids.length, 'Duplicate warehouse assignment.').optional(),
  defaultWarehouseId: z.string().min(1).optional().nullable(),
  phone: z.string().optional().nullable(), status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional()
})
export const userUpdateSchema = userSchema.omit({ password: true }).partial()
export const warehouseAssignmentsSchema = z.object({
  warehouseIds: z.array(z.string().min(1)).max(100).refine(ids => new Set(ids).size === ids.length, 'Duplicate warehouse assignment.'),
  defaultWarehouseId: z.string().min(1).nullable()
}).refine(input => !input.defaultWarehouseId || input.warehouseIds.includes(input.defaultWarehouseId), {
  message: 'Default warehouse must be assigned.', path: ['defaultWarehouseId']
})
export const userStatusSchema = z.object({ status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']) })
export const resetPasswordSchema = z.object({ newPassword: passwordSchema })
export const roleSchema = z.object({ name: z.string().trim().min(2), description: z.string().optional().nullable() })
export const permissionSetSchema = z.object({ permissionIds: z.array(z.string().min(1)) })
export const settingsSchema = z.record(z.union([z.string(), z.boolean(), z.number()]))
