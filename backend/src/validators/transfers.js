import { z } from 'zod'

export const transferScanSchema = z.object({ expectedUpdatedAt: z.string().datetime().optional(), items: z.array(z.object({
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

const serials = z.array(z.string().trim().min(1).max(191)).max(1000).default([])
const quantity = z.coerce.number().int().min(0).max(1000000)
const notes = z.string().trim().min(3).max(4000)
export const transferArrivalSchema = z.object({
  expectedUpdatedAt: z.string().datetime(), finalArrival: z.boolean().default(false), notes,
  items: z.array(z.object({ id: z.string().min(1), goodQuantity: quantity.default(0), damagedQuantity: quantity.default(0), goodSerials: serials, damagedSerials: serials })).max(100).default([]),
  unexpected: z.array(z.object({ id: z.string().min(1), quantity: z.coerce.number().int().positive().max(1000000), serialNumber: z.string().trim().min(1).max(191).optional(), notes })).max(100).default([])
})
export const transferResolutionSchema = z.object({
  expectedUpdatedAt: z.string().datetime(), expectedDiscrepancyUpdatedAt: z.string().datetime(),
  action: z.enum(['INVESTIGATE', 'RECEIVE_LATE', 'MARK_LOST', 'RETURN_TO_SOURCE', 'ACKNOWLEDGE_QUARANTINE', 'RETURN_UNEXPECTED', 'DOCUMENT_DISPOSITION']),
  quantity: quantity, condition: z.enum(['AVAILABLE', 'QUARANTINE']).default('QUARANTINE'), notes
}).refine(value => value.action !== 'INVESTIGATE' || value.quantity === 0, { path: ['quantity'], message: 'Investigation notes do not resolve units.' })
