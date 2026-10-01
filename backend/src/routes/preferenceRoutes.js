import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { ok } from '../utils/http.js'
import { getPreferences,updatePreferences } from '../services/preferenceService.js'
export const preferenceRoutes=Router()
preferenceRoutes.use(authenticate)
preferenceRoutes.get('/',async(req,res)=>ok(res,await getPreferences(req.user)))
preferenceRoutes.put('/',async(req,res)=>ok(res,await updatePreferences(req.body,req.user),'Preferences saved.'))
