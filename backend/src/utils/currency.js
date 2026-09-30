import { Prisma } from '@prisma/client'
import { HttpError } from './http.js'
export const amount = value => new Prisma.Decimal(value ?? 0).toDecimalPlaces(2)
export function currencyTotals(lines, tax, shipping, unitField = 'unitPrice') {
  const priced = lines.map(line => ({ ...line, [unitField]: amount(line[unitField]), subtotal: amount(line[unitField]).times(line.quantity) }))
  const subtotal = priced.reduce((sum, line) => sum.plus(line.subtotal), amount(0)), total = subtotal.plus(amount(tax)).plus(amount(shipping))
  if (priced.some(line => line.subtotal.isNegative() || line.subtotal.greaterThan('999999999999.99')) || total.isNegative() || total.greaterThan('999999999999.99')) throw new HttpError(400, 'Amount exceeds the supported currency range.')
  return { lines: priced, subtotal, tax: amount(tax), shipping: amount(shipping), total }
}
