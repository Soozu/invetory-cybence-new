import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { purchaseOrderSchema, receivingSchema } from '../validators/procurement.js'
import * as controller from '../controllers/procurementController.js'
import { prisma } from '../config/prisma.js'
import { warehouseWhere } from '../services/warehouseAccessService.js'
import { ok,HttpError } from '../utils/http.js'

export const procurementRoutes = Router()
procurementRoutes.use(authenticate)
procurementRoutes.get('/purchase-orders', authorize('purchasing', 'VIEW'), controller.list)
procurementRoutes.get('/purchase-orders/:id', authorize('purchasing', 'VIEW'), controller.get)
procurementRoutes.post('/purchase-orders', authorize('purchasing', 'CREATE'), validate(purchaseOrderSchema), controller.create)
procurementRoutes.put('/purchase-orders/:id', authorize('purchasing', 'EDIT'), validate(purchaseOrderSchema), controller.update)
procurementRoutes.post('/purchase-orders/:id/submit', authorize('purchasing', 'CREATE'), controller.submit)
procurementRoutes.post('/purchase-orders/:id/approve', authorize('purchasing', 'APPROVE'), controller.approve)
procurementRoutes.post('/purchase-orders/:id/cancel', authorize('purchasing', 'EDIT'), controller.cancel)
procurementRoutes.post('/purchase-orders/:id/receive', authorize('purchasing', 'EDIT'), validate(receivingSchema), controller.receive)
procurementRoutes.get('/receipts', authorize('purchasing', 'VIEW'), controller.receipts)
procurementRoutes.get('/receipts/:id',authorize('purchasing','VIEW'),async(req,res)=>{
  const row=await prisma.purchaseReceipt.findFirst({where:{id:req.params.id,...warehouseWhere(req.user)},select:{id:true,receiptNumber:true,receivedAt:true,notes:true,purchaseOrder:{select:{id:true,poNumber:true}},warehouse:{select:{name:true}},receivedBy:{select:{firstName:true,lastName:true}},items:{select:{id:true,quantity:true,product:{select:{name:true,sku:true}}}}}})
  if(!row)throw new HttpError(404,'Receipt not found.')
  ok(res,row)
})
