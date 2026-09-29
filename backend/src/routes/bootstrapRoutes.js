import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { ok } from '../utils/http.js'
import { bootstrap } from '../services/bootstrapService.js'

export const bootstrapRoutes = Router()
bootstrapRoutes.get('/', authenticate, async (req, res) => ok(res, await bootstrap(req.user)))
