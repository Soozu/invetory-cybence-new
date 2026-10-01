import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestLogging } from '../src/middleware/requestLogging.js'
import { errorHandler } from '../src/middleware/errorHandler.js'

describe('structured log privacy', () => {
  afterEach(() => vi.restoreAllMocks())
  it('generates a request ID and logs only the route pattern, status and duration', () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    const req = { method: 'POST', route: { path: '/assets/:id' }, originalUrl: '/assets/private-id?password=private-query', body: { password: 'private-body' }, headers: { authorization: 'Bearer private-token', cookie: 'private-cookie', 'x-request-id': 'private-id' } }
    const res = new EventEmitter(); res.statusCode = 200; res.set = vi.fn()
    const next = vi.fn(); requestLogging(req, res, next); res.emit('finish')
    expect(next).toHaveBeenCalledOnce(); expect(req.requestId).toMatch(/^[a-f0-9-]{36}$/)
    expect(res.set).toHaveBeenCalledWith('X-Request-ID', req.requestId)
    const entry = JSON.parse(write.mock.calls[0][0])
    expect(entry).toMatchObject({ event: 'request', requestId: req.requestId, method: 'POST', route: '/assets/:id', status: 200 })
    expect(entry.durationMs).toBeGreaterThanOrEqual(0); expect(JSON.stringify(entry)).not.toMatch(/private-|authorization|cookie|password/)
  })
  it('omits raw exception and request data from sanitized errors and logs', () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    errorHandler(Object.assign(Error('mysql://private-password@host/schema'), { code: 'private-secret' }), { requestId: 'request', body: { secret: 'private-body' } }, res, vi.fn())
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Internal server error.', errors: [] })
    expect(JSON.parse(write.mock.calls[0][0])).toMatchObject({ event: 'request_error', status: 500, code: null })
    expect(write.mock.calls[0][0]).not.toMatch(/private-|mysql|schema/)
  })
  it('passes an error onward after headers are sent without double-writing', () => {
    const res = { headersSent: true, status: vi.fn(), json: vi.fn() }, next = vi.fn(), error = Error('Stream failed')
    errorHandler(error, {}, res, next); expect(next).toHaveBeenCalledWith(error); expect(res.status).not.toHaveBeenCalled(); expect(res.json).not.toHaveBeenCalled()
  })
})
