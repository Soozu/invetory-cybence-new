import { z } from 'zod'
export const returnReasons = ['DEFECTIVE', 'WRONG_ITEM', 'DAMAGED', 'WARRANTY', 'OVER_DELIVERY', 'OTHER']
export const supplierReturnSchema = z.object({
  receiptId: z.string().min(1), reason: z.enum(returnReasons), notes: z.string().max(4000).default(''),
  expectedUpdatedAt: z.string().datetime().optional(),
  items: z.array(z.object({
    receiptItemId: z.string().min(1), quantity: z.coerce.number().int().min(1).max(1000000),
    reason: z.enum(returnReasons), condition: z.enum(['AVAILABLE', 'DEFECTIVE', 'DAMAGED', 'FOR_REPAIR']),
    stockCondition: z.enum(['AVAILABLE', 'QUARANTINE', 'DEFECTIVE', 'FOR_REPAIR']).default('AVAILABLE'),
    serialNumberIds: z.array(z.string().min(1)).max(1000).default([])
  })).min(1).max(100)
}).refine(value => new Set(value.items.map(item => item.receiptItemId)).size === value.items.length, { path: ['items'], message: 'Choose each receipt line once.' })
  .refine(value => { const ids = value.items.flatMap(item => item.serialNumberIds); return new Set(ids).size === ids.length }, { path: ['items'], message: 'Choose each serial once.' })
export const supplierReturnActionSchema = z.object({
  expectedUpdatedAt: z.string().datetime(), shipmentReference: z.string().trim().max(191).optional(),
  notes: z.string().trim().max(4000).optional()
})
export const supplierReturnShipSchema = supplierReturnActionSchema.extend({ shipmentReference: z.string().trim().min(2).max(191) })
export const supplierReturnCompleteSchema = supplierReturnActionSchema.extend({ notes: z.string().trim().min(3).max(4000) })
