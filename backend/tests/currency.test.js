import { describe, expect, it } from 'vitest'
import { currencyTotals } from '../src/utils/currency.js'
describe('decimal currency calculations',()=>{
  it('calculates line, subtotal, tax and shipping using decimal arithmetic',()=>{
    const result=currencyTotals([{quantity:3,unitPrice:0.1},{quantity:2,unitPrice:100.25}],0.2,0.05)
    expect(result.lines[0].subtotal.toFixed(2)).toBe('0.30');expect(result.subtotal.toFixed(2)).toBe('200.80');expect(result.total.toFixed(2)).toBe('201.05')
  })
  it('rejects overflow and negative line amounts',()=>{
    expect(()=>currencyTotals([{quantity:2,unitPrice:999999999999.99}],0,0)).toThrow('supported currency range')
    expect(()=>currencyTotals([{quantity:1,unitPrice:-1}],0,0)).toThrow('supported currency range')
  })
})
