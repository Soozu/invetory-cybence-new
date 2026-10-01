import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { authenticate } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { loginSchema, changePasswordSchema } from '../validators/auth.js'
import * as controller from '../controllers/authController.js'

export const authRoutes = Router()
authRoutes.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next() })
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,handler:(req,res)=>res.status(429).json({success:false,message:'Too many authentication attempts. Try again later.',errors:[]}) })
authRoutes.post('/login', authLimiter, validate(loginSchema), controller.login)
authRoutes.post('/refresh', authLimiter, controller.refresh)
authRoutes.post('/logout', controller.logout)
authRoutes.get('/me', authenticate, controller.me)
authRoutes.post('/change-password', authenticate, validate(changePasswordSchema), controller.changePassword)
