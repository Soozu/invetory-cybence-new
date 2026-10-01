import { ApiError, apiRequest } from '../lib/api.js'

export const getDashboardMovements = (period,warehouse) => apiRequest('/dashboard/movements', { params: { period,warehouse } })
export const getCategoryDistribution = warehouse => apiRequest('/dashboard/category-distribution',{params:{warehouse}})
export const getRecentActivity = limit => apiRequest('/dashboard/recent-activity', { params: { limit } })

export async function getDashboardOverview(warehouse){
  const params={warehouse}
  const [summary,low,activity]=await Promise.all([apiRequest('/dashboard/summary',{params}),apiRequest('/dashboard/low-stock',{params}),apiRequest('/dashboard/recent-activity',{params})])
  const totals=summary.data
  const fields=['totalProducts','totalInventoryUnits','inventoryValue','lowStock','outOfStock','activeSuppliers']
  if(!totals||!fields.every(key=>['number','string'].includes(typeof totals[key])&&String(totals[key]).trim()!==''&&Number.isFinite(Number(totals[key])))||!Array.isArray(low.data)||!Array.isArray(activity.data))throw new ApiError(502,'The server returned incomplete dashboard data. Please try again.')
  return {summary:totals,low:low.data,activity:activity.data}
}
