import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { search } from '../services/searchService.js'
export const searchRoutes=Router()
searchRoutes.use(authenticate)
searchRoutes.get('/',async(req,res)=>{res.set('Cache-Control','private, no-store');res.json({success:true,...await search(req.query,req.user)})})
