import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Exercise the real centralized browser client in Node; this is not visual acceptance.
describe('frontend API transport regressions', () => {
  let api, fetchMock, events
  const json = (status, value) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
  const success = data => json(200, { success: true, data })
  const failure = (status, message = 'Request failed') => json(status, { success: false, message, errors: [] })
  beforeEach(async () => {
    vi.resetModules()
    vi.stubEnv('VITE_API_URL', 'https://api.test/api/')
    fetchMock = vi.fn(); events = new EventTarget()
    vi.stubGlobal('fetch', fetchMock); vi.stubGlobal('window', events)
    api = await import('../src/lib/api.js')
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('sends credentials and only the memory token, retaining zero and false query values', async () => {
    api.setAccessToken('memory-token'); fetchMock.mockResolvedValue(success({ id: 'row' }))
    await api.apiRequest('/rows', { params: { page: 0, enabled: false, empty: '', nil: null, omitted: undefined } })
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/api/rows?page=0&enabled=false')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'include', headers: { Authorization: 'Bearer memory-token' } })
    expect(fetchMock.mock.calls[0][1].headers['Content-Type']).toBeUndefined()
  })
  it('serializes JSON writes and surfaces backend field validation', async () => {
    fetchMock.mockResolvedValue(json(400, { success: false, message: 'Validation failed.', errors: [{ field: 'quantity', message: 'Use a positive quantity.' }] }))
    await expect(api.apiRequest('/rows', { method: 'POST', body: { quantity: -1 } })).rejects.toMatchObject({ status: 400, errors: [{ field: 'quantity', message: 'Use a positive quantity.' }] })
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ body: '{"quantity":-1}', headers: { 'Content-Type': 'application/json' } })
  })
  it('leaves multipart boundaries to fetch and retains the same body on refresh retry', async () => {
    const body = new FormData(); body.append('file', new Blob(['test']), 'test.txt')
    fetchMock.mockResolvedValueOnce(failure(401)).mockResolvedValueOnce(success({ accessToken: 'rotated' })).mockResolvedValueOnce(success({ id: 'uploaded' }))
    expect((await api.apiRequest('/attachments/Product/p', { method: 'POST', body })).data.id).toBe('uploaded')
    for (const index of [0, 2]) { expect(fetchMock.mock.calls[index][1].body).toBe(body); expect(fetchMock.mock.calls[index][1].headers['Content-Type']).toBeUndefined() }
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer rotated')
  })
  it('shares one in-flight refresh and resets the promise for a later refresh', async () => {
    let finish; fetchMock.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    const first = api.refreshSession(), second = api.refreshSession()
    expect(fetchMock).toHaveBeenCalledTimes(1); finish(success({ accessToken: 'one' }))
    expect(await first).toEqual(await second)
    fetchMock.mockResolvedValueOnce(success({ accessToken: 'two' })); await api.refreshSession()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('refreshes and retries concurrent unauthorized requests with one refresh call', async () => {
    let finish
    fetchMock.mockImplementation(url => url.endsWith('/auth/refresh') ? new Promise(resolve => { finish = resolve }) : Promise.resolve(fetchMock.mock.calls.length <= 2 ? failure(401) : success({ id: url })))
    const first = api.apiRequest('/a'), second = api.apiRequest('/b')
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    finish(success({ accessToken: 'new' })); await Promise.all([first, second])
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'))).toHaveLength(1)
  })
  it.each([403, 409, 429, 500])('does not refresh a %i response', async status => {
    fetchMock.mockResolvedValue(failure(status, 'Original error'))
    await expect(api.apiRequest('/rows')).rejects.toMatchObject({ status, message: 'Original error' }); expect(fetchMock).toHaveBeenCalledOnce()
  })
  it('does not refresh failed login credentials', async () => {
    fetchMock.mockResolvedValue(failure(401)); await expect(api.apiRequest('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 401 })
    expect(fetchMock).toHaveBeenCalledOnce()
  })
  it('emits session expiry and clears the token when refresh is rejected', async () => {
    const expired = vi.fn(); events.addEventListener('techstock:session-expired', expired); api.setAccessToken('old')
    fetchMock.mockResolvedValueOnce(failure(401)).mockResolvedValueOnce(failure(401))
    await expect(api.apiRequest('/rows')).rejects.toMatchObject({ status: 401 }); expect(expired).toHaveBeenCalledOnce()
    fetchMock.mockResolvedValueOnce(success([])); await api.apiRequest('/rows')
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBeUndefined()
  })
  it.each([429, 503])('preserves the session and original error during a temporary %i refresh failure', async status => {
    const expired = vi.fn(); events.addEventListener('techstock:session-expired', expired); api.setAccessToken('old')
    fetchMock.mockResolvedValueOnce(failure(401)).mockResolvedValueOnce(failure(status, 'Try again later.'))
    await expect(api.apiRequest('/rows')).rejects.toMatchObject({ status, message: 'Try again later.' }); expect(expired).not.toHaveBeenCalled()
    fetchMock.mockResolvedValueOnce(success([])); await api.apiRequest('/rows')
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer old')
  })
  it('preserves the session during an offline refresh and permits a later retry', async () => {
    const expired = vi.fn(); events.addEventListener('techstock:session-expired', expired)
    fetchMock.mockResolvedValueOnce(failure(401)).mockRejectedValueOnce(new TypeError('offline'))
    await expect(api.apiRequest('/rows')).rejects.toMatchObject({ status: 0 }); expect(expired).not.toHaveBeenCalled()
    fetchMock.mockResolvedValueOnce(success({ accessToken: 'recovered' })); await api.refreshSession()
  })
  it('retries a request at most once and preserves errors from that retry', async () => {
    fetchMock.mockResolvedValueOnce(failure(401)).mockResolvedValueOnce(success({ accessToken: 'new' })).mockResolvedValueOnce(failure(409, 'Stock changed.'))
    await expect(api.apiRequest('/rows')).rejects.toMatchObject({ status: 409, message: 'Stock changed.' }); expect(fetchMock).toHaveBeenCalledTimes(3)
  })
  it('rejects malformed successful JSON and incomplete refresh responses as transport errors', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>proxy response</html>', { status: 200 }))
    await expect(api.apiRequest('/rows')).rejects.toMatchObject({ status: 502 })
    fetchMock.mockResolvedValueOnce(success({})); await expect(api.refreshSession()).rejects.toMatchObject({ status: 502 })
  })
  it('downloads successful blobs while retaining JSON errors from denied downloads', async () => {
    fetchMock.mockResolvedValueOnce(new Response('document bytes', { status: 200 }))
    expect(await (await api.apiRequest('/files/f', { responseType: 'blob' })).text()).toBe('document bytes')
    fetchMock.mockResolvedValueOnce(failure(403, 'Access denied.'))
    await expect(api.apiRequest('/files/f', { responseType: 'blob' })).rejects.toMatchObject({ status: 403, message: 'Access denied.' })
  })
  it('bounds requests with an abort timeout', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation((url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))))
    const assertion = expect(api.apiRequest('/rows')).rejects.toMatchObject({ status: 0, message: expect.stringContaining('too long') })
    await vi.advanceTimersByTimeAsync(15000); await assertion; expect(vi.getTimerCount()).toBe(0)
  })
})
