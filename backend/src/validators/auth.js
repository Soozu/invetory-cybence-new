import { z } from 'zod'

export const passwordSchema=z.string().min(10).max(128).refine(value=>Buffer.byteLength(value,'utf8')<=72,'Password must be at most 72 UTF-8 bytes.')
export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(1024), remember: z.boolean().default(false) })
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema
})
