import { z } from 'zod'
import { importTypes } from '../services/importCsv.js'
export const importType = z.enum(Object.keys(importTypes))
export const importId = z.string().trim().min(1).max(191)
export const importUpload = z.object({ requestKey: z.string().uuid(), warehouseId: importId.optional() }).strict()
export const importRevision = z.object({ expectedRevision: z.number().int().positive() }).strict()
export const importConfirm = importRevision.extend({ notes: z.string().trim().min(5).max(1000) }).strict()
export const importQuery = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1) }).strict()
export const importReferenceQuery = importQuery.extend({search:z.string().trim().max(100).default('')}).strict()
