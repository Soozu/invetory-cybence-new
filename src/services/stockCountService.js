import { apiRequest } from '../lib/api.js'

export const listCounts = params => apiRequest('/stock-counts', { params })
export const getCount = id => apiRequest(`/stock-counts/${id}`)
export const getCountItems = (id, params) => apiRequest(`/stock-counts/${id}/items`, { params })
export const createCount = body => apiRequest('/stock-counts', { method: 'POST', body })
export const saveCountItems = (id, items) => apiRequest(`/stock-counts/${id}/items`, { method: 'PATCH', body: { items } })
export const transitionCount = (id, event) => apiRequest(`/stock-counts/${id}/${event}`, { method: 'POST' })
