import { apiRequest } from '../lib/api.js'

export const getReport = (type, params = {}) => apiRequest(`/reports/${type}`, { params })
export const getDashboardSummary = () => apiRequest('/dashboard/summary')
export const getDashboardMovements = period => apiRequest('/dashboard/movements', { params: { period } })
export const getCategoryDistribution = () => apiRequest('/dashboard/category-distribution')
export const getRecentActivity = () => apiRequest('/dashboard/recent-activity')
