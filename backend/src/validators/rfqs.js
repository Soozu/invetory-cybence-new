import { z } from 'zod'
import { currencyAmount } from './currency.js'
const requestedItem = z.object({ productId: z.string().min(1).nullable().optional(), description: z.string().trim().max(500).default(''), quantity: z.coerce.number().int().min(1).max(1000000), notes: z.string().max(4000).optional() })
  .refine(value => value.productId || value.description.length >= 2, { path: ['description'], message: 'Choose a product or describe the item.' })
export const rfqSchema = z.object({
  expectedUpdatedAt: z.string().datetime().optional(), purchaseRequestId: z.string().min(1).nullable().optional(), warehouseId: z.string().min(1),
  closingDate: z.coerce.date().nullable().optional(), notes: z.string().max(4000).optional(),
  supplierIds: z.array(z.string().min(1)).min(1).max(20).refine(ids => new Set(ids).size === ids.length, 'Choose each supplier once.'),
  items: z.array(requestedItem).min(1).max(100).optional()
}).refine(value => value.purchaseRequestId || value.items?.length, { path: ['items'], message: 'Provide items or an approved purchase request.' })
export const rfqActionSchema = z.object({ expectedUpdatedAt: z.string().datetime() })
export const rfqAwardSchema = rfqActionSchema.extend({ quotationId: z.string().min(1), notes: z.string().trim().min(3).max(4000) })
export const quotationSchema = z.object({
  expectedUpdatedAt: z.string().datetime().optional(), supplierId: z.string().min(1), supplierReference: z.string().trim().max(100).optional().nullable(),
  quotationDate: z.coerce.date(), validUntil: z.coerce.date().optional().nullable(), deliveryDays: z.coerce.number().int().min(0).max(3650).optional().nullable(),
  paymentTerms: z.string().trim().max(191).optional().nullable(), tax: currencyAmount.default(0), shipping: currencyAmount.default(0), notes: z.string().max(4000).optional(),
  items: z.array(z.object({ rfqItemId: z.string().min(1), unitPrice: currencyAmount, brandOffered: z.string().max(100).optional(), modelOffered: z.string().max(100).optional(), notes: z.string().max(4000).optional() })).min(1).max(100)
}).refine(value => new Set(value.items.map(item => item.rfqItemId)).size === value.items.length, { path: ['items'], message: 'Each requested item must appear once.' })
  .refine(value => !value.validUntil || value.validUntil >= value.quotationDate, { path: ['validUntil'], message: 'Validity cannot end before the quotation date.' })
export const quotationConversionSchema = rfqActionSchema.extend({
  expectedDelivery: z.coerce.date().nullable().optional(), notes: z.string().max(4000).optional(),
  items: z.array(z.object({ quotationItemId: z.string().min(1), productId: z.string().min(1) })).min(1).max(100)
}).refine(value => new Set(value.items.map(item => item.quotationItemId)).size === value.items.length && new Set(value.items.map(item => item.productId)).size === value.items.length, { path: ['items'], message: 'Map each quotation line to a distinct product once.' })
