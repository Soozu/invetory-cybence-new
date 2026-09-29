import { z } from 'zod'

export const assetSchema = z.object({
  productId: z.string().min(1), warehouseId: z.string().min(1),
  serialNumberId: z.string().optional().nullable(),
  purchaseDate: z.coerce.date().optional().nullable(), notes: z.string().max(4000).optional().nullable()
})
export const assetUpdateSchema = z.object({
  notes: z.string().max(4000).optional().nullable(),
  purchaseDate: z.coerce.date().optional().nullable(),
  warehouseId: z.string().optional().nullable()
})
export const assignmentSchema = z.object({
  assignedTo: z.string().trim().min(2), department: z.string().trim().optional().nullable(),
  location: z.string().trim().optional().nullable(), conditionOnAssign: z.string().optional().nullable(),
  notes: z.string().max(4000).optional().nullable()
})
export const returnSchema = z.object({ conditionOnReturn: z.string().optional().nullable(), notes: z.string().max(4000).optional().nullable() })
export const maintenanceSchema = z.object({
  assetId: z.string().min(1), serialNumberId: z.string().optional().nullable(),
  issue: z.string().trim().min(2), description: z.string().max(4000).optional().nullable(),
  technician: z.string().optional().nullable(), serviceDate: z.coerce.date().optional().nullable(),
  completedDate: z.coerce.date().optional().nullable(), cost: z.coerce.number().finite().min(0).default(0),
  status: z.enum(['SCHEDULED', 'IN_REPAIR', 'COMPLETED', 'CANCELLED']).default('SCHEDULED'),
  notes: z.string().max(4000).optional().nullable()
})
