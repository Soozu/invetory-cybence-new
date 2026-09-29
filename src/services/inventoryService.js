import { apiRequest } from '../lib/api.js'

export const getStocks = (params = {}) => apiRequest('/inventory/stocks', { params })
export const getMovements = (params = {}) => apiRequest('/inventory/movements', { params })
export const adjustStock = data => apiRequest('/inventory/adjust', { method: 'POST', body: data })
export const getSerialNumbers = (params = {}) => apiRequest('/serial-numbers', { params })
export const getLowStock = () => apiRequest('/monitoring/low-stock')
export const getOutOfStock = () => apiRequest('/monitoring/out-of-stock')
export const getWarranties = (params = {}) => apiRequest('/warranties', { params })
export const getTransfers = (params = {}) => apiRequest('/transfers', { params })
export const createTransfer = data => apiRequest('/transfers', { method: 'POST', body: data })
export const transferAction = (id, action) => apiRequest(`/transfers/${id}/${action}`, { method: 'POST' })
