import { ok } from '../utils/http.js'
import * as rfqs from '../services/rfqService.js'
import * as quotes from '../services/quotationService.js'
export const list = async (req,res) => { const result=await rfqs.listRFQs(req.query,req.user);ok(res,result.data,'OK',200,{pagination:result.pagination}) }
export const detail = async (req,res) => ok(res,await rfqs.getRFQ(req.params.id,req.user))
export const create = async (req,res) => ok(res,await rfqs.createRFQ(req.validated,req),'RFQ created.',201)
export const update = async (req,res) => ok(res,await rfqs.updateRFQ(req.params.id,req.validated,req),'RFQ updated.')
export const action = event => async (req,res) => ok(res,await rfqs.transitionRFQ(req.params.id,event,req.validated,req),'RFQ updated.')
export const comparison = async (req,res) => ok(res,await rfqs.compareRFQ(req.params.id,req.user))
export const award = async (req,res) => ok(res,await rfqs.awardRFQ(req.params.id,req.validated,req),'Quotation manually selected.')
export const quotation = async (req,res) => ok(res,await quotes.getQuotation(req.params.id,req.params.quotationId,req.user))
export const createQuotation = async (req,res) => ok(res,await quotes.createQuotation(req.params.id,req.validated,req),'Draft quotation recorded.',201)
export const updateQuotation = async (req,res) => ok(res,await quotes.updateQuotation(req.params.id,req.params.quotationId,req.validated,req),'Quotation updated.')
export const quotationAction = event => async (req,res) => ok(res,await quotes.transitionQuotation(req.params.id,req.params.quotationId,event,req.validated,req),'Quotation updated.')
export const convertQuotation = async (req,res) => ok(res,await quotes.convertQuotation(req.params.id,req.params.quotationId,req.validated,req),'Draft purchase order created.',201)
