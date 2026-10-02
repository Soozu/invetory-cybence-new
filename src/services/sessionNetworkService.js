import { apiRequest } from '../lib/api.js'

let lookupPromise = null
const reports = new Map()

async function lookupPublicIp() {
  if (lookupPromise) return lookupPromise
  lookupPromise = (async () => {
    const controller = new AbortController()
    const timeout = globalThis.setTimeout(() => controller.abort(), 5000)
    try {
      // This request comes from the browser, never the API server. No session credentials leave the app.
      const response = await fetch('https://api64.ipify.org?format=json', {
        signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store'
      })
      if (!response.ok) throw new Error('Public IP lookup unavailable.')
      const data = await response.json()
      if (typeof data?.ip !== 'string' || data.ip.length > 45 || !/^[0-9a-f:.]+$/i.test(data.ip)) {
        throw new Error('Invalid public IP response.')
      }
      return data.ip
    } finally { globalThis.clearTimeout(timeout) }
  })().finally(() => { lookupPromise = null })
  return lookupPromise
}

export function reportSessionPublicIp(sessionId, { force = false } = {}) {
  if (!sessionId) return Promise.reject(new Error('Current session unavailable.'))
  const previous = reports.get(sessionId)
  if (previous && (previous.pending || (!force && Date.now() - previous.startedAt < 300000))) return previous.promise
  // Retain only recent browser sessions, without keeping any tokens or IPs in browser storage.
  for (const [id, report] of reports) if (!report.pending && Date.now() - report.startedAt >= 300000) reports.delete(id)
  const report = { startedAt: Date.now(), pending: true }
  report.promise = lookupPublicIp().then(ipAddress => apiRequest('/sessions/current/public-ip', {
    method: 'PUT', body: { sessionId, ipAddress }, retry: false
  })).then(result => result.data).catch(error => {
    reports.delete(sessionId)
    throw error
  }).finally(() => { report.pending = false })
  reports.set(sessionId, report)
  return report.promise
}
