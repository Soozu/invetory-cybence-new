import { z } from 'zod'
import { currencyAmount as money } from './currency.js'
const item = z.object({ productId: z.string().min(1).nullable().optional(), description: z.string().trim().max(500).default(''), quantity: z.coerce.number().int().min(1).max(1000000), estimatedUnitCost: money.default(0), notes: z.string().max(4000).nullable().optional() })
  .refine(value => value.productId || value.description.length >= 2, { path: ['description'], message: 'Choose a product or describe the requested item.' })
export const purchaseRequestSchema = z.object({
  expectedUpdatedAt: z.string().datetime().optional(),
  department: z.string().trim().min(1).max(100), warehouseId: z.string().min(1), requiredDate: z.coerce.date().nullable().optional(),
  justification: z.string().trim().min(5).max(4000), items: z.array(item).min(1).max(100)
}).refine(value => { const products = value.items.filter(item => item.productId).map(item => item.productId); return new Set(products).size === products.length }, { path: ['items'], message: 'Combine repeated catalog products into one line.' })
export const requestDecisionSchema = z.object({ expectedUpdatedAt: z.string().datetime(), notes: z.string().trim().max(4000).optional() })
export const requestRejectSchema = requestDecisionSchema.extend({ notes: z.string().trim().min(2).max(4000) })
export const requestConversionSchema = z.object({
  expectedUpdatedAt: z.string().datetime(),
  supplierId: z.string().min(1), expectedDelivery: z.coerce.date().nullable().optional(), tax: money.default(0), shipping: money.default(0), notes: z.string().max(4000).optional(),
  items: z.array(z.object({ purchaseRequestItemId: z.string().min(1), productId: z.string().min(1), unitCost: money })).min(1).max(100)
}).refine(value => new Set(value.items.map(item => item.purchaseRequestItemId)).size === value.items.length, { path: ['items'], message: 'Each request line must appear once.' })
  .refine(value => new Set(value.items.map(item => item.productId)).size === value.items.length, { path: ['items'], message: 'Each mapped catalog product must appear once.' })
