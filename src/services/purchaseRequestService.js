import { apiRequest } from '../lib/api.js'
export const listRequests = params => apiRequest('/purchase-requests', { params })
export const getRequest = id => apiRequest(`/purchase-requests/${id}`)
export const saveRequest = (id, body) => apiRequest(id ? `/purchase-requests/${id}` : '/purchase-requests', { method: id ? 'PUT' : 'POST', body })
export const requestAction = (id, action, body = {}) => apiRequest(`/purchase-requests/${id}/${action}`, { method: 'POST', body })
