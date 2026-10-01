import { apiRequest } from '../lib/api.js'
export { getTransfer, transferAction } from './inventoryService.js'
export const recordTransferArrival = (id, body) => apiRequest(`/transfers/${id}/arrivals`, { method: 'POST', body })
export const resolveTransferDiscrepancy = (id, caseId, body) => apiRequest(`/transfers/${id}/discrepancies/${caseId}/${body.action === 'INVESTIGATE' ? 'investigate' : 'resolve'}`, { method: 'POST', body })
