import { apiRequest } from '../lib/api.js'

export const getDashboardMovements = (period,warehouse) => apiRequest('/dashboard/movements', { params: { period,warehouse } })
export const getCategoryDistribution = warehouse => apiRequest('/dashboard/category-distribution',{params:{warehouse}})
export const getRecentActivity = limit => apiRequest('/dashboard/recent-activity', { params: { limit } })

export async function getDashboardOverview(warehouse){const params={warehouse};const [summary,low,activity]=await Promise.all([apiRequest('/dashboard/summary',{params}),apiRequest('/dashboard/low-stock',{params}),apiRequest('/dashboard/recent-activity',{params})]);return {summary:summary.data,low:low.data,activity:activity.data}}
