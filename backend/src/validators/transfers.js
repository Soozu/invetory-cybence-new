import { z } from 'zod'

export const transferSchema = z.object({
  sourceWarehouseId: z.string().min(1),
  destinationWarehouseId: z.string().min(1),
  notes: z.string().max(4000).optional().nullable(),
  items: z.array(z.object({ productId: z.string().min(1), quantity: z.coerce.number().int().positive() })).min(1)
}).refine(value => value.sourceWarehouseId !== value.destinationWarehouseId, {
  path: ['destinationWarehouseId'], message: 'Source and destination must differ.'
}).refine(value => new Set(value.items.map(item => item.productId)).size === value.items.length, {
  path: ['items'], message: 'Each product may appear only once.'
})
