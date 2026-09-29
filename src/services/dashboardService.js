import { apiRequest } from '../lib/api.js'

export const getDashboardMovements = period => apiRequest('/dashboard/movements', { params: { period } })
export const getCategoryDistribution = () => apiRequest('/dashboard/category-distribution')
export const getRecentActivity = limit => apiRequest('/dashboard/recent-activity', { params: { limit } })
