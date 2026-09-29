import { apiRequest, refreshSession, setAccessToken } from '../lib/api.js'

export async function login(email, password, remember = false) {
  const result = await apiRequest('/auth/login', { method: 'POST', body: { email, password, remember } })
  setAccessToken(result.data.accessToken)
  return result.data.user
}
export const restoreSession = () => refreshSession()
export async function logout() {
  try { await apiRequest('/auth/logout', { method: 'POST' }) }
  finally { setAccessToken(null) }
}
export const getMe = () => apiRequest('/auth/me')
export const changePassword = (currentPassword, newPassword) => apiRequest('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } })
