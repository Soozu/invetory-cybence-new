import { z } from 'zod'

export const adjustmentSchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  type: z.enum(['STOCK_IN', 'STOCK_OUT', 'CORRECTION', 'DAMAGE', 'RETURN', 'OPENING_STOCK']),
  quantity: z.coerce.number().int().min(0),
  reason: z.string().trim().min(2),
  referenceNumber: z.string().trim().max(100).optional(),
  notes: z.string().max(4000).optional(),
  serialNumbers: z.array(z.string().trim().min(1)).optional()
}).refine(value => value.type === 'CORRECTION' || value.quantity > 0, {
  path: ['quantity'], message: 'Quantity must be greater than zero.'
})

export const serialStatusSchema = z.object({
  status: z.enum(['AVAILABLE', 'RESERVED', 'DEFECTIVE', 'FOR_REPAIR', 'RETURNED', 'QUARANTINE'])
})
