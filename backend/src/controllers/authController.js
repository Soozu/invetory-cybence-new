import { ok } from '../utils/http.js'
import * as service from '../services/authService.js'

export const login = async (req, res) => ok(res, await service.login(req.validated, res), 'Signed in successfully.')
export const refresh = async (req, res) => ok(res, await service.refresh(req, res), 'Session refreshed.')
export const me = async (req, res) => ok(res, req.user)
export const logout = async (req, res) => { await service.logout(req, res); ok(res, null, 'Signed out successfully.') }
export const changePassword = async (req, res) => {
  await service.changePassword(req.user.id, req.validated.currentPassword, req.validated.newPassword, res)
  ok(res, null, 'Password changed. Sign in again.')
}
