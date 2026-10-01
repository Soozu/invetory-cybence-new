import { ok } from '../utils/http.js'
import * as plans from '../services/preventiveMaintenanceService.js'
import * as claims from '../services/warrantyClaimService.js'
export const listPlans = async (req, res) => { const r = await plans.listPlans(req.query, req.user); ok(res, r.data, 'OK', 200, { pagination: r.pagination }) }
export const createPlan = async (req, res) => ok(res, await plans.createPlan(req.validated, req), 'Plan created.', 201)
export const updatePlan = async (req, res) => ok(res, await plans.updatePlan(req.params.id, req.validated, req), 'Plan updated.')
export const schedulePlan = async (req, res) => ok(res, await plans.schedulePlan(req.params.id, req.validated, req), 'Preventive service scheduled.', 201)
export const listClaims = async (req, res) => { const r = await claims.listClaims(req.query, req.user); ok(res, r.data, 'OK', 200, { pagination: r.pagination }) }
export const listSources = async (req, res) => { const r = await claims.listSources(req.query, req.user); ok(res, r.data, 'OK', 200, { pagination: r.pagination }) }
export const getClaim = async (req, res) => ok(res, await claims.getClaim(req.params.id, req.user))
export const createClaim = async (req, res) => ok(res, await claims.createClaim(req.validated, req), 'Warranty draft created.', 201)
export const claimAction = action => async (req, res) => ok(res, await claims.claimAction(req.params.id, action, req.validated, req), 'Claim evidence recorded. Stock and custody remain governed by their explicit workflows.')
