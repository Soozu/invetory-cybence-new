import { z } from 'zod'
export const labelType = z.enum(['product', 'serial', 'asset', 'warehouse'])
export const lookupSchema = z.object({ code: z.string().trim().min(1).max(255), type: labelType.optional(), warehouse: z.string().min(1).optional() })
export const labelSchema = z.object({ type: labelType, id: z.string().min(1).max(191) })
