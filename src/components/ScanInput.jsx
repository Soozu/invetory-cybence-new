import { useState } from 'react'
import { ScanLine } from 'lucide-react'
import useBarcodeScanner from '../hooks/useBarcodeScanner.js'

export const serialIdentifier = value => value.trim().replace(/^TS:serial:/, '')
export default function ScanInput({ onScan, label = 'Scan or enter identifier', disabled = false, global = false, serial = false }) {
  const [code, setCode] = useState(''), [error, setError] = useState('')
  const scan = value => {
    if (disabled || !value.trim()) return
    if (serial && /^TS:/.test(value.trim()) && !/^TS:serial:.+/.test(value.trim())) { setError('Scan a serial number label for this field.'); return }
    setError(''); onScan(serial ? serialIdentifier(value) : value.trim()); setCode('')
  }
  useBarcodeScanner(scan, { enabled: global && !disabled })
  return <div className="relative"><ScanLine size={16} className="pointer-events-none absolute left-3 top-3 subtle"/><input aria-label={label} placeholder={`${label}, then Enter`} disabled={disabled} className="field pl-10" value={code} onChange={event => setCode(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); scan(code) } }}/>{error && <p role="alert" className="mt-1 text-xs text-rose-600">{error}</p>}</div>
}
