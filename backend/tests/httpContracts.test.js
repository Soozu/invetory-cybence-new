import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
const mocked = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('../src/config/prisma.js', () => ({ prisma: { $queryRaw: mocked.query } }))
vi.mock('../src/config/env.js', () => ({ env: { frontendUrls: ['https://inventory.test'], trustProxy: 0, accessSecret: 'http-test-access-secret-at-least-32-chars', refreshSecret: 'http-test-refresh-secret-at-least-32-chars' } }))
import { app } from '../src/app.js'

describe('HTTP boundary contracts without database mutations', () => {
  let server, origin
  beforeAll(async () => { server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); origin = `http://127.0.0.1:${server.address().port}` })
  afterAll(async () => { await new Promise(resolve => server.close(resolve)) })
  beforeEach(() => { mocked.query.mockReset().mockResolvedValue([{ ready: 1 }]) })
  const request = (url, options) => fetch(origin + url, options)
  it('returns minimal readiness with headers and a generated request ID', async () => {
    const r = await request('/api/health', { headers: { 'X-Request-ID': 'client-supplied' } })
    expect(r.status).toBe(200); expect(await r.json()).toEqual({ success: true, status: 'healthy', database: 'connected' })
    expect(r.headers.get('x-request-id')).toMatch(/^[a-f0-9-]{36}$/); expect(r.headers.has('x-powered-by')).toBe(false)
    expect(r.headers.get('x-content-type-options')).toBe('nosniff')
  })
  it('reports a database outage without leaking connection errors', async () => {
    mocked.query.mockRejectedValue(Error('mysql://private:password@internal/schema'))
    const r = await request('/api/health'); expect(r.status).toBe(503)
    expect(await r.json()).toEqual({ success: false, status: 'degraded', database: 'unavailable' })
  })
  it('permits configured origins and credentialed preflight', async () => {
    const r = await request('/api/health', { method: 'OPTIONS', headers: { Origin: 'https://inventory.test', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } })
    expect(r.status).toBe(204); expect(r.headers.get('access-control-allow-origin')).toBe('https://inventory.test'); expect(r.headers.get('access-control-allow-credentials')).toBe('true')
  })
  it('rejects an unconfigured origin with a sanitized 403 envelope', async () => {
    const r = await request('/api/health', { headers: { Origin: 'https://unexpected.test' } })
    expect(r.status).toBe(403); expect(await r.json()).toEqual({ success: false, message: 'Origin not allowed by CORS.', errors: [] })
    expect(r.headers.get('access-control-allow-origin')).toBeNull(); expect(mocked.query).not.toHaveBeenCalled()
  })
  it.each([
    ['malformed JSON', '{"password":"private-value"', undefined, 400],
    ['oversized JSON', JSON.stringify({ notes: 'x'.repeat(1024 * 1024) }), undefined, 413],
    ['unsupported encoding', '{}', 'unsupported', 415]
  ])('returns a safe client error for %s', async (name, body, encoding, status) => {
    const r = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(encoding ? { 'Content-Encoding': encoding } : {}) }, body })
    expect(r.status).toBe(status); const result = await r.json()
    expect(result).toMatchObject({ success: false, errors: [] }); expect(result.message).not.toMatch(/private-value|SyntaxError|stack|node_modules/)
  })
  it('marks authentication responses as non-cacheable including validation failures', async () => {
    const r = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    expect(r.status).toBe(400); expect(r.headers.get('cache-control')).toBe('private, no-store')
  })
  it.each(['/api/auth/me', '/api/sessions', '/api/system/health', '/api/system/backups', '/api/system/retention', '/api/docs/openapi.json', '/api/report-schedules', '/api/reports/catalog', '/api/imports', '/api/preferences', '/api/search?q=test', '/api/inventory/stocks', '/api/attachments/Product/id'])('requires authentication for %s', async url => {
    const r = await request(url); expect(r.status).toBe(401); expect(await r.json()).toMatchObject({ success: false, errors: [] })
  })
})
