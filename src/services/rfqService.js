import { apiRequest } from '../lib/api.js'
export const listRFQs=params=>apiRequest('/rfqs',{params})
export const getRFQ=id=>apiRequest(`/rfqs/${id}`)
export const saveRFQ=(id,body)=>apiRequest(id?`/rfqs/${id}`:'/rfqs',{method:id?'PUT':'POST',body})
export const rfqAction=(id,action,body)=>apiRequest(`/rfqs/${id}/${action}`,{method:'POST',body})
export const compareRFQ=id=>apiRequest(`/rfqs/${id}/comparison`)
export const getQuotation=(id,quotationId)=>apiRequest(`/rfqs/${id}/quotations/${quotationId}`)
export const saveQuotation=(id,quotationId,body)=>apiRequest(`/rfqs/${id}/quotations${quotationId?`/${quotationId}`:''}`,{method:quotationId?'PUT':'POST',body})
export const quotationAction=(id,quotationId,action,body)=>apiRequest(`/rfqs/${id}/quotations/${quotationId}/${action}`,{method:'POST',body})
