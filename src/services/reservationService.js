import { apiRequest } from '../lib/api.js'
export const listReservations = params => apiRequest('/reservations', { params })
export const getReservation = id => apiRequest(`/reservations/${id}`)
export const getReservationItems = (id, params) => apiRequest(`/reservations/${id}/items`, { params })
export const availability = params => apiRequest('/reservations/availability', { params })
export const createReservation = body => apiRequest('/reservations', { method: 'POST', body })
export const fulfillReservation = (id, items) => apiRequest(`/reservations/${id}/fulfill`, { method: 'POST', body: { items } })
export const closeReservation = (id, event) => apiRequest(`/reservations/${id}/${event}`, { method: 'POST' })
