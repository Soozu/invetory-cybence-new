import { z } from 'zod'

export const stockCountSchema = z.object({ warehouseId: z.string().min(1), notes: z.string().trim().max(4000).optional().nullable() })
export const stockCountItemsSchema = z.object({ items: z.array(z.object({
  id: z.string().min(1), countedQuantity: z.coerce.number().int().min(0),
  serialNumbers: z.array(z.string().trim().min(1).max(191)).max(10000).optional(), notes: z.string().trim().max(4000).optional().nullable()
})).min(1).max(100) }).refine(value => new Set(value.items.map(item => item.id)).size === value.items.length, { path: ['items'], message: 'Duplicate count item.' })
