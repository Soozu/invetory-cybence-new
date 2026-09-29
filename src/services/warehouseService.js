import { apiRequest } from '../lib/api.js'

export const getWarehouses = (params = {}) => apiRequest('/warehouses', { params })
export const getWarehouse = id => apiRequest(`/warehouses/${id}`)
export const createWarehouse = data => apiRequest('/warehouses', { method: 'POST', body: data })
export const updateWarehouse = (id, data) => apiRequest(`/warehouses/${id}`, { method: 'PUT', body: data })
