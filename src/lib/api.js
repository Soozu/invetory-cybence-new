const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '')
let accessToken = null
let refreshPromise = null

export class ApiError extends Error {
  constructor(status, message, errors = []) {
    super(message)
    this.status = status
    this.errors = errors
  }
}

const REQUEST_TIMEOUT_MS = 15000

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (error) {
    if (error?.name === 'AbortError') throw new ApiError(0, 'The server took too long to respond. Please try again.')
    throw error
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

export const apiOrigin = API_URL.replace(/\/api$/, '')
export const assetUrl = value => value?.startsWith('/uploads/') ? `${apiOrigin}${value}` : value || ''
export const setAccessToken = token => { accessToken = token }

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(response.status, payload.message || `Request failed (${response.status}).`, payload.errors || [])
  return payload
}

export async function refreshSession() {
  if (!refreshPromise) refreshPromise = fetchWithTimeout(`${API_URL}/auth/refresh`, {
    method: 'POST', credentials: 'include'
  }).then(parseResponse).then(payload => {
    accessToken = payload.data.accessToken
    return payload.data
  }).catch(error => {
    if (error instanceof ApiError) throw error
    throw new ApiError(0, 'Cannot connect to the TechStock API. Check that the backend and MySQL are running.')
  }).finally(() => { refreshPromise = null })
  return refreshPromise
}

export async function apiRequest(path, { method = 'GET', body, params, retry = true } = {}) {
  const query = params ? `?${new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '' && value !== null && value !== undefined)).toString()}` : ''
  const headers = { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) }
  if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json'
  let response
  try {
    response = await fetchWithTimeout(`${API_URL}${path}${query}`, {
      method, headers, credentials: 'include', body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body)
    })
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(0, 'Cannot connect to the TechStock API. Check that the backend and MySQL are running.')
  }
  if (response.status === 401 && retry && !path.startsWith('/auth/')) {
    try { await refreshSession(); return apiRequest(path, { method, body, params, retry: false }) }
    catch {
      accessToken = null
      window.dispatchEvent(new Event('techstock:session-expired'))
      throw new ApiError(401, 'Session expired. Please sign in again.')
    }
  }
  return parseResponse(response)
}
