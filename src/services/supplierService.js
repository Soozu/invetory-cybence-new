import { apiRequest } from '../lib/api.js'

export const getSuppliers = (params = {}) => apiRequest('/suppliers', { params })
export const createSupplier = data => apiRequest('/suppliers', { method: 'POST', body: data })
export const updateSupplier = (id, data) => apiRequest(`/suppliers/${id}`, { method: 'PUT', body: data })
export const getCategories = (params = {}) => apiRequest('/categories', { params })
export const createCategory = data => apiRequest('/categories', { method: 'POST', body: data })
export const updateCategory = (id, data) => apiRequest(`/categories/${id}`, { method: 'PUT', body: data })
export const getBrands = (params = {}) => apiRequest('/brands', { params })
export const createBrand = data => apiRequest('/brands', { method: 'POST', body: data })
export const updateBrand = (id, data) => apiRequest(`/brands/${id}`, { method: 'PUT', body: data })
