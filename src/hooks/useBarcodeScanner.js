import { useEffect, useRef } from 'react'

// Keyboard-wedge scanners end a rapid sequence with Enter. Editable controls
// keep their normal behavior; a focused ScanInput supports scanners there.
export default function useBarcodeScanner(onScan, { enabled = true, minLength = 3, maxDelay = 50 } = {}) {
  const callback = useRef(onScan)
  useEffect(() => { callback.current = onScan }, [onScan])
  useEffect(() => {
    if (!enabled) return
    let buffer = '', lastAt = 0
    const keydown = event => {
      if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing || event.target.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"]')) { buffer = ''; return }
      const now = performance.now()
      if (now - lastAt > maxDelay) buffer = ''
      if (event.key === 'Enter') {
        if (buffer.length >= minLength) { event.preventDefault(); callback.current(buffer) }
        buffer = ''
      } else if (event.key.length === 1) buffer = (buffer + event.key).slice(0, 255)
      else buffer = ''
      lastAt = now
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [enabled, minLength, maxDelay])
}
