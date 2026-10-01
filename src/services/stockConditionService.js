import { apiRequest } from '../lib/api.js'

export const listBalances = params => apiRequest('/inventory/conditions', { params })
export const listHistory = params => apiRequest('/inventory/conditions/history', { params })
export const listSerials = params => apiRequest('/inventory/conditions/serials', { params })
export const changeCondition = body => apiRequest('/inventory/conditions', { method: 'POST', body })
