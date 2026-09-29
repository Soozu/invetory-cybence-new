import { z } from 'zod'

const line = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
  unitCost: z.coerce.number().finite().min(0)
})

export const purchaseOrderSchema = z.object({
  supplierId: z.string().min(1), warehouseId: z.string().min(1),
  expectedDelivery: z.coerce.date().optional().nullable(),
  reference: z.string().trim().max(100).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  tax: z.coerce.number().finite().min(0).default(0),
  shipping: z.coerce.number().finite().min(0).default(0),
  items: z.array(line).min(1)
}).refine(value => new Set(value.items.map(item => item.productId)).size === value.items.length, {
  path: ['items'], message: 'Each product may appear only once.'
})

export const receivingSchema = z.object({
  notes: z.string().max(4000).optional(),
  items: z.array(z.object({
    purchaseOrderItemId: z.string().min(1),
    quantity: z.coerce.number().int().positive(),
    serialNumbers: z.array(z.string().trim().min(1)).optional()
  })).min(1)
})
