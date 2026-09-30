import { z } from 'zod'

export const transferScanSchema = z.object({ items: z.array(z.object({
  id: z.string().min(1), serialNumbers: z.array(z.string().trim().min(1).max(191)).max(10000)
})).max(100).optional() }).refine(value => !value.items || new Set(value.items.map(item => item.id)).size === value.items.length, { path: ['items'], message: 'Duplicate transfer item.' })

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
