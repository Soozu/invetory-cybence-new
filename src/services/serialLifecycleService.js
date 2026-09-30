import { apiRequest } from '../lib/api.js'
export const getSerial = id => apiRequest(`/serial-numbers/${id}`)
export const getEvents = (id, params) => apiRequest(`/serial-numbers/${id}/events`, { params })
