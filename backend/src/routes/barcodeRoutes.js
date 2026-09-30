import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import * as controller from '../controllers/barcodeController.js'
export const barcodeRoutes = Router()
barcodeRoutes.use(authenticate)
barcodeRoutes.get('/lookup', controller.lookup)
barcodeRoutes.get('/labels/:type/:id', controller.label)
barcodeRoutes.post('/products/:id/barcode', authorize('products', 'EDIT'), controller.generate)
