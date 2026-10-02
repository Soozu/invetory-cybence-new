import { Router } from 'express'
import { z } from 'zod'
import { authenticate } from '../middleware/auth.js'
import { ok } from '../utils/http.js'
import * as service from '../services/sessionService.js'
import { sessionPublicIpSchema } from '../validators/session.js'
export const sessionRoutes=Router()
sessionRoutes.use(authenticate,(req,res,next)=>{res.set('Cache-Control','private, no-store');next()})
const page=query=>z.object({page:z.coerce.number().int().min(1).max(100000).default(1)}).strict().parse(query).page
sessionRoutes.get('/',async(req,res)=>{const r=await service.sessions(req.user.id,req,page(req.query));ok(res,r.data,'OK',200,{pagination:r.pagination})})
sessionRoutes.put('/current/public-ip',async(req,res)=>{ok(res,await service.reportPublicIp(sessionPublicIpSchema.parse(req.body),req))})
sessionRoutes.post('/others/revoke',async(req,res)=>{z.object({}).strict().parse(req.body);ok(res,await service.revokeSessions(req.user.id,'others',req))})
sessionRoutes.post('/:id/revoke',async(req,res)=>{z.object({}).strict().parse(req.body);ok(res,await service.revokeSessions(req.user.id,req.params.id,req))})
sessionRoutes.get('/users/:userId',async(req,res)=>{service.requireAdmin(req.user);const r=await service.sessions(req.params.userId,req,page(req.query));ok(res,r.data,'OK',200,{pagination:r.pagination})})
sessionRoutes.post('/users/:userId/revoke',async(req,res)=>{z.object({confirmation:z.literal('REVOKE ALL SESSIONS')}).strict().parse(req.body);ok(res,await service.revokeSessions(req.params.userId,'all',req))})
sessionRoutes.post('/users/:userId/unlock',async(req,res)=>{z.object({}).strict().parse(req.body);ok(res,await service.unlockAccount(req.params.userId,req))})
