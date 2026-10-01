import { apiRequest } from '../lib/api.js'
export const suggestions = params => apiRequest('/replenishment/suggestions', { params })
export const createDocument = body => apiRequest('/replenishment/documents', { method: 'POST', body })
export const performance = params => apiRequest('/replenishment/supplier-performance', { params })
