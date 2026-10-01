import { Router } from 'express'
import { z } from 'zod'
import { authenticate } from '../middleware/auth.js'
import { ok } from '../utils/http.js'
import * as service from '../services/reportScheduleService.js'
export const reportScheduleRoutes=Router()
reportScheduleRoutes.use(authenticate,(req,res,next)=>{res.set('Cache-Control','private, no-store');next()})
reportScheduleRoutes.get('/',async(req,res)=>{z.object({}).strict().parse(req.query);ok(res,await service.listSchedules(req.user))})
reportScheduleRoutes.post('/',async(req,res)=>ok(res,await service.createSchedule(req.body,req.user),'Schedule created.',201))
reportScheduleRoutes.put('/:id',async(req,res)=>ok(res,await service.updateSchedule(req.params.id,req.body,req.user)))
reportScheduleRoutes.get('/:id/runs',async(req,res)=>{const {page}=z.object({page:z.coerce.number().int().min(1).max(100000).default(1)}).strict().parse(req.query);const r=await service.scheduleRuns(req.params.id,page,req.user);ok(res,r.data,'OK',200,{pagination:r.pagination})})
reportScheduleRoutes.get('/runs/:id',async(req,res)=>ok(res,await service.scheduledResult(req.params.id,req.user)))
