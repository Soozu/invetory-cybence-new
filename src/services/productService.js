import { apiOrigin, apiRequest } from '../lib/api.js'

export const getProducts = (params = {}) => apiRequest('/products', { params })
export const getProduct = id => apiRequest(`/products/${id}`)
export const createProduct = data => apiRequest('/products', { method: 'POST', body: data })
export const updateProduct = (id, data) => apiRequest(`/products/${id}`, { method: 'PUT', body: data })
export const archiveProduct = id => apiRequest(`/products/${id}/archive`, { method: 'POST' })
export const deleteProduct = id => apiRequest(`/products/${id}`, { method: 'DELETE' })
export const getProductInventory = id => apiRequest(`/products/${id}/inventory`)
export async function uploadProductImage(dataUrl) {
  if (dataUrl?.startsWith(`${apiOrigin}/uploads/`)) return dataUrl.slice(apiOrigin.length)
  if (!dataUrl?.startsWith('data:')) return dataUrl || ''
  const blob = await fetch(dataUrl).then(response => response.blob())
  const form = new FormData()
  form.append('image', blob, 'product-image.png')
  return (await apiRequest('/products/image', { method: 'POST', body: form })).data.url
}
