import { apiRequest } from '../lib/api.js'

export const createUser = body => apiRequest('/users', { method: 'POST', body })
export const updateWarehouseAssignments = (id, body) => apiRequest(`/users/${id}/warehouses`, { method: 'PUT', body })
