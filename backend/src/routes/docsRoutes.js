import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { requireAdmin } from '../services/sessionService.js'
import { openApi } from '../services/openApiService.js'
import { ok } from '../utils/http.js'
export const docsRoutes=Router()
docsRoutes.use(authenticate,(req,res,next)=>{requireAdmin(req.user);res.set('Cache-Control','private, no-store');next()})
docsRoutes.get('/',(req,res)=>ok(res,openApi()))
docsRoutes.get('/openapi.json',(req,res)=>res.json(openApi()))
