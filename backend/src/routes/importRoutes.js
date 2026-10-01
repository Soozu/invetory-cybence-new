import { Router } from 'express'
import multer from 'multer'
import { rateLimit } from 'express-rate-limit'
import { authenticate, authorize } from '../middleware/auth.js'
import { importPermit } from '../services/importService.js'
import { importType } from '../validators/imports.js'
import { MAX_IMPORT_BYTES } from '../services/importCsv.js'
import { HttpError } from '../utils/http.js'
import * as c from '../controllers/importController.js'
const routes = Router()
routes.use(authenticate,authorize('imports','VIEW'))
const limit = rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:'draft-8',legacyHeaders:false,message:{success:false,message:'Too many import previews. Try again later.',errors:[]}})
const receive = async (req,res,next) => {
  importPermit(req.user,importType.parse(req.params.type),true)
  const parser = multer({storage:multer.memoryStorage(),preservePath:true,limits:{fileSize:MAX_IMPORT_BYTES,files:1,fields:2,fieldSize:191,parts:4}}).single('file')
  await new Promise((resolve,reject)=>parser(req,res,error=>error?reject(new HttpError(error.code==='LIMIT_FILE_SIZE'?413:400,'Upload one CSV file of at most 1 MB with its import reference and optional warehouse.')):resolve()))
  next()
}
routes.get('/',c.list)
routes.get('/templates/:type',c.template)
routes.get('/reference-codes/:type/:kind',c.references)
routes.post('/preview/:type',authorize('imports','CREATE'),limit,receive,c.preview)
routes.get('/:id/rejected.csv',c.rejected)
routes.post('/:id/revalidate',authorize('imports','CREATE'),c.revalidate)
routes.post('/:id/confirm',authorize('imports','CONFIRM'),c.confirm)
routes.get('/:id',c.get)
export const importRoutes = routes
