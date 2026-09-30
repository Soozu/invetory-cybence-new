import { describe,expect,it } from 'vitest'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import { lookupSchema } from '../src/validators/barcodes.js'
describe('label encoding and lookup contract',()=>{
  it('encodes the generated identifier with Code 128 and a typed serial with QR',()=>{
    const barcode={};JsBarcode(barcode,'PRD-00000001',{format:'CODE128'});expect(barcode.encodings[0].data.length).toBeGreaterThan(0)
    const qr=QRCode.create('TS:serial:SERIAL-123',{errorCorrectionLevel:'M'});expect(qr.modules.size).toBeGreaterThan(20)
  })
  it('rejects empty or oversized identifiers and invalid entity types',()=>{
    for(const input of [{code:''},{code:'a'.repeat(256)},{code:'valid',type:'password'}])expect(lookupSchema.safeParse(input).success).toBe(false)
  })
})
