import { z } from 'zod'
export const currencyAmount = z.coerce.number().finite().min(0).max(999999999999.99)
  .refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.001, 'Use at most two decimal places.')
