import { z } from 'zod'

const text = z.string().trim().min(1)
const optionalText = z.string().trim().max(4000).optional().nullable()

export const categorySchema = z.object({
  name: text.max(150), slug: text.max(180).optional(), description: optionalText,
  parentId: z.string().optional().nullable(), status: z.enum(['ACTIVE', 'INACTIVE']).optional()
})
export const brandSchema = z.object({
  name: text.max(150), slug: text.max(180).optional(), logo: optionalText,
  description: optionalText, status: z.enum(['ACTIVE', 'INACTIVE']).optional()
})
export const supplierSchema = z.object({
  companyName: text.max(200), supplierCode: text.max(60).optional(),
  contactPerson: optionalText, email: z.string().email().optional().nullable(),
  phone: optionalText, address: optionalText, taxId: optionalText,
  paymentTerms: optionalText, notes: optionalText,
  status: z.enum(['ACTIVE', 'INACTIVE']).optional()
})
export const warehouseSchema = z.object({
  name: text.max(150), code: text.max(40).optional(), address: optionalText,
  managerId: z.string().optional().nullable(), phone: optionalText,
  email: z.string().email().optional().nullable(), status: z.enum(['ACTIVE', 'INACTIVE']).optional()
})
const productBaseSchema = z.object({
  name: text.max(250), sku: text.max(100), barcode: z.string().trim().optional().nullable(),
  categoryId: z.string().min(1), brandId: z.string().min(1),
  defaultSupplierId: z.string().optional().nullable(), model: optionalText,
  description: optionalText, unit: text.max(30).default('pcs'),
  minimumStock: z.coerce.number().int().min(0).default(0),
  maximumStock: z.coerce.number().int().min(0).default(0),
  reorderPoint: z.coerce.number().int().min(0).default(0),
  purchaseCost: z.coerce.number().finite().min(0),
  warrantyMonths: z.coerce.number().int().min(0).default(0),
  trackSerialNumbers: z.boolean().default(false), image: optionalText,
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional()
})
export const productSchema = productBaseSchema.refine(value => value.maximumStock === 0 || value.maximumStock >= value.minimumStock, {
  path: ['maximumStock'], message: 'Maximum stock must be at least minimum stock.'
})
export const productUpdateSchema = productBaseSchema.partial().refine(value => value.maximumStock === undefined || value.minimumStock === undefined || value.maximumStock === 0 || value.maximumStock >= value.minimumStock, {
  path: ['maximumStock'], message: 'Maximum stock must be at least minimum stock.'
})

export const partial = schema => schema.partial()
