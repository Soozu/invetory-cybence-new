import { apiRequest } from '../lib/api.js'
export const listReturns = params => apiRequest('/supplier-returns', { params })
export const listSources = params => apiRequest('/supplier-returns/sources', { params })
export const getSource = id => apiRequest(`/supplier-returns/sources/${id}`)
export const getReturn = id => apiRequest(`/supplier-returns/${id}`)
export const saveReturn = (id, body) => apiRequest(id ? `/supplier-returns/${id}` : '/supplier-returns', { method: id ? 'PUT' : 'POST', body })
export const returnAction = (id, action, body) => apiRequest(`/supplier-returns/${id}/${action}`, { method: 'POST', body })
