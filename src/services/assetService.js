import { apiRequest } from '../lib/api.js'

export const getAssets = (params = {}) => apiRequest('/assets', { params })
export const createAsset = data => apiRequest('/assets', { method: 'POST', body: data })
export const assetAction = (id, action, data) => apiRequest(`/assets/${id}/${action}`, { method: 'POST', body: data })
export const getMaintenance = (params = {}) => apiRequest('/maintenance', { params })
export const createMaintenance = data => apiRequest('/maintenance', { method: 'POST', body: data })
export const maintenanceAction = (id, action) => apiRequest(`/maintenance/${id}/${action}`, { method: 'POST' })
