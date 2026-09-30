import { useEffect, useRef, useState } from 'react'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'

export default function InventoryLabel({ data, mode = 'qr', onReady }) {
  const barcodeRef = useRef(null), [qr, setQr] = useState(''), [error, setError] = useState('')
  const readyRef = useRef(onReady)
  readyRef.current = onReady
  useEffect(() => {
    let active = true; setError(''); setQr('')
    if (mode === 'qr') QRCode.toDataURL(data.qrValue, { errorCorrectionLevel: 'M', margin: 2, width: 256 }).then(value => { if (active) setQr(value) }).catch(() => { if (active) setError('Unable to generate this QR label.') })
    else {
      try { JsBarcode(barcodeRef.current, data.identifier, { format: 'CODE128', width: 2, height: 48, margin: 8, displayValue: false }); readyRef.current?.() }
      catch { setError('This identifier cannot be encoded in Code 128. Use QR instead.') }
    }
    return () => { active = false }
  }, [data, mode])
  return <article className="inventory-label"><div className="label-title">{data.title}</div><div className="label-sku">{data.sku || data.type}</div>{mode === 'qr' ? qr && <img className="label-qr" onLoad={() => readyRef.current?.()} src={qr} alt={`QR identifier ${data.identifier}`}/> : <svg ref={barcodeRef} className="label-barcode" aria-label={`Barcode ${data.identifier}`} role="img"/>}<div className="label-identifier">{data.identifier}</div>{data.serialNumber && data.serialNumber !== data.identifier && <div className="label-serial">S/N: {data.serialNumber}</div>}{error && <p role="alert" className="text-xs text-rose-600">{error}</p>}</article>
}
