import { apiRequest } from '../lib/api.js'
export const lookup = (code, options = {}) => apiRequest('/lookup', { params: { code, ...options } })
export const labelData = (type, id) => apiRequest(`/labels/${type}/${id}`)
export const generateProductBarcode = id => apiRequest(`/products/${id}/barcode`, { method: 'POST' })
