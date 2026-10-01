import { z } from 'zod'
export const conditionChangeSchema = z.object({
  productId: z.string().min(1), warehouseId: z.string().min(1), expectedUpdatedAt: z.string().datetime(),
  fromCondition: z.enum(['AVAILABLE', 'QUARANTINE', 'DEFECTIVE', 'FOR_REPAIR']),
  toCondition: z.enum(['AVAILABLE', 'QUARANTINE', 'DEFECTIVE', 'FOR_REPAIR']),
  quantity: z.coerce.number().int().min(1).max(1000000), reason: z.string().trim().min(3).max(1000),
  serialNumberIds: z.array(z.string().min(1)).max(1000).default([])
}).refine(value => value.fromCondition !== value.toCondition, { path: ['toCondition'], message: 'Choose a different destination condition.' })
  .refine(value => new Set(value.serialNumberIds).size === value.serialNumberIds.length, { path: ['serialNumberIds'], message: 'Choose each serial once.' })
