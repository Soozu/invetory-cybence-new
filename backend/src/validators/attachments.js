import { z } from 'zod'
import { attachmentSources } from '../services/attachmentSources.js'
export const attachmentTarget = z.object({ entityType: z.enum(Object.keys(attachmentSources)), entityId: z.string().min(1).max(191) }).strict()
export const attachmentQuery = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), archived: z.enum(['true', 'false']).default('false') }).strict()
export const attachmentSourceQuery = z.object({ search: z.string().trim().max(100).default(''), page: z.coerce.number().int().min(1).max(100000).default(1) }).strict()
export const attachmentUpload = z.object({ requestKey: z.string().uuid() }).strict()
export const attachmentAction = z.object({ expectedUpdatedAt: z.string().datetime(), notes: z.string().trim().min(5).max(1000) }).strict()
export const attachmentId = z.string().min(1).max(191)
