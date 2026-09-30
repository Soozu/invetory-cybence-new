import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { reservationSchema, fulfillmentSchema } from '../validators/reservations.js'
import * as controller from '../controllers/reservationController.js'
export const reservationRoutes = Router()
reservationRoutes.use(authenticate)
reservationRoutes.get('/', authorize('reservations', 'VIEW'), controller.list)
reservationRoutes.get('/availability', authorize('reservations', 'VIEW'), controller.availability)
reservationRoutes.post('/', authorize('reservations', 'CREATE'), validate(reservationSchema), controller.create)
reservationRoutes.get('/:id', authorize('reservations', 'VIEW'), controller.get)
reservationRoutes.get('/:id/items', authorize('reservations', 'VIEW'), controller.items)
reservationRoutes.post('/:id/fulfill', authorize('reservations', 'FULFILL'), validate(fulfillmentSchema), controller.fulfill)
reservationRoutes.post('/:id/release', authorize('reservations', 'RELEASE'), controller.release('RELEASED'))
reservationRoutes.post('/:id/cancel', authorize('reservations', 'RELEASE'), controller.release('CANCELLED'))
