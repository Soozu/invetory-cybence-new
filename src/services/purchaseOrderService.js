import { apiRequest } from '../lib/api.js'

export const getPurchaseOrders = (params = {}) => apiRequest('/purchase-orders', { params })
export const getPurchaseOrder = id => apiRequest(`/purchase-orders/${id}`)
export const createPurchaseOrder = data => apiRequest('/purchase-orders', { method: 'POST', body: data })
export const updatePurchaseOrder = (id, data) => apiRequest(`/purchase-orders/${id}`, { method: 'PUT', body: data })
export const purchaseOrderAction = (id, action) => apiRequest(`/purchase-orders/${id}/${action}`, { method: 'POST' })
export const receivePurchaseOrder = (id, data) => apiRequest(`/purchase-orders/${id}/receive`, { method: 'POST', body: data })
