import { z } from 'zod'

export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1), remember: z.boolean().default(false) })
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10).max(128)
})
