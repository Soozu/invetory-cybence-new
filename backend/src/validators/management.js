import { z } from 'zod'

export const userSchema = z.object({
  firstName: z.string().trim().min(1), lastName: z.string().trim().min(1),
  email: z.string().email(), password: z.string().min(10).max(128),
  roleId: z.string().min(1), warehouseId: z.string().optional().nullable(),
  phone: z.string().optional().nullable(), status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional()
})
export const userUpdateSchema = userSchema.omit({ password: true }).partial()
export const userStatusSchema = z.object({ status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']) })
export const resetPasswordSchema = z.object({ newPassword: z.string().min(10).max(128) })
export const roleSchema = z.object({ name: z.string().trim().min(2), description: z.string().optional().nullable() })
export const permissionSetSchema = z.object({ permissionIds: z.array(z.string().min(1)) })
export const settingsSchema = z.record(z.union([z.string(), z.boolean(), z.number()]))
