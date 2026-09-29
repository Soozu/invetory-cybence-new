import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { categorySchema, brandSchema, supplierSchema, warehouseSchema, productSchema, productUpdateSchema } from '../validators/catalog.js'
import { productUpload } from '../config/upload.js'
import { ok } from '../utils/http.js'
import * as controller from '../controllers/catalogController.js'

export const catalogRoutes = Router()
catalogRoutes.use(authenticate)

for (const [kind, schema, module] of [
  ['categories', categorySchema, 'categories'], ['brands', brandSchema, 'brands'],
  ['suppliers', supplierSchema, 'suppliers'], ['warehouses', warehouseSchema, 'warehouses']
]) {
  const route = Router()
  const handler = controller.catalog(kind)
  route.get('/', authorize(module, 'VIEW'), handler.list)
  route.get('/:id', authorize(module, 'VIEW'), handler.get)
  route.post('/', authorize(module, 'CREATE'), validate(schema), handler.create)
  route.put('/:id', authorize(module, 'EDIT'), validate(schema.partial()), handler.update)
  route.delete('/:id', authorize(module, 'DELETE'), handler.remove)
  if (kind === 'suppliers') {
    route.get('/:id/products', authorize(module, 'VIEW'), controller.supplierProducts)
    route.get('/:id/purchase-orders', authorize(module, 'VIEW'), controller.supplierOrders)
  }
  if (kind === 'warehouses') {
    route.get('/:id/inventory', authorize(module, 'VIEW'), controller.warehouseInventory)
    route.get('/:id/movements', authorize(module, 'VIEW'), controller.warehouseMovements)
  }
  catalogRoutes.use(`/${kind}`, route)
}

const products = Router()
products.get('/', authorize('products', 'VIEW'), controller.products.list)
products.get('/:id', authorize('products', 'VIEW'), controller.products.get)
products.get('/:id/inventory', authorize('products', 'VIEW'), controller.products.inventory)
products.get('/:id/serial-numbers', authorize('products', 'VIEW'), controller.products.serials)
products.get('/:id/history', authorize('products', 'VIEW'), controller.products.history)
products.get('/:id/purchases', authorize('products', 'VIEW'), controller.products.purchases)
products.post('/', authorize('products', 'CREATE'), validate(productSchema), controller.products.create)
products.put('/:id', authorize('products', 'EDIT'), validate(productUpdateSchema), controller.products.update)
products.delete('/:id', authorize('products', 'DELETE'), controller.products.remove)
products.post('/:id/archive', authorize('products', 'EDIT'), controller.products.archive)
products.post('/image', authorize('products', 'CREATE'), productUpload, (req, res) => ok(res, { url: `/uploads/products/${req.file.filename}` }, 'Image uploaded.', 201))
catalogRoutes.use('/products', products)
