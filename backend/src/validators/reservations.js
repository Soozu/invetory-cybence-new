import { z } from 'zod'
const serials = z.array(z.string().trim().min(1).max(191)).max(10000).optional()
export const reservationSchema = z.object({
  warehouseId: z.string().min(1), referenceType: z.string().trim().max(100).optional(), referenceId: z.string().trim().max(191).optional(),
  expiresAt: z.string().datetime({ offset: true }).optional().nullable(), notes: z.string().trim().max(4000).optional(),
  items: z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().positive(), serialNumbers: serials })).min(1).max(100)
}).refine(value => new Set(value.items.map(item => item.productId)).size === value.items.length, { path: ['items'], message: 'Each product must occur once.' })
export const fulfillmentSchema = z.object({ items: z.array(z.object({
  id: z.string().min(1), quantity: z.number().int().positive(), expectedFulfilledQuantity: z.number().int().nonnegative(), serialNumbers: serials
})).min(1).max(100) }).refine(value => new Set(value.items.map(item => item.id)).size === value.items.length, { path: ['items'], message: 'Duplicate fulfillment item.' })
