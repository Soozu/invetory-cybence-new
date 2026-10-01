import { attachmentRoutes } from './routes/attachmentRoutes.js'
import { importRoutes } from './routes/importRoutes.js'
import { preferenceRoutes } from './routes/preferenceRoutes.js'
import { searchRoutes } from './routes/searchRoutes.js'
import { sessionRoutes } from './routes/sessionRoutes.js'
import { systemRoutes } from './routes/systemRoutes.js'
import { reportScheduleRoutes } from './routes/reportScheduleRoutes.js'
import { docsRoutes } from './routes/docsRoutes.js'
import { requestLogging } from './middleware/requestLogging.js'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import path from 'node:path'
import { env } from './config/env.js'
import { prisma } from './config/prisma.js'
import { authRoutes } from './routes/authRoutes.js'
import { catalogRoutes } from './routes/catalogRoutes.js'
import { inventoryRoutes } from './routes/inventoryRoutes.js'
import { procurementRoutes } from './routes/procurementRoutes.js'
import { purchaseRequestRoutes } from './routes/purchaseRequestRoutes.js'
import { rfqRoutes } from './routes/rfqRoutes.js'
import { supplierReturnRoutes } from './routes/supplierReturnRoutes.js'
import { stockConditionRoutes } from './routes/stockConditionRoutes.js'
import { transferRoutes } from './routes/transferRoutes.js'
import { replenishmentRoutes } from './routes/replenishmentRoutes.js'
import { assetRoutes } from './routes/assetRoutes.js'
import { assetWorkflowRoutes } from './routes/assetWorkflowRoutes.js'
import { dashboardRoutes } from './routes/dashboardRoutes.js'
import { reportRoutes } from './routes/reportRoutes.js'
import { managementRoutes } from './routes/managementRoutes.js'
import { bootstrapRoutes } from './routes/bootstrapRoutes.js'
import { stockCountRoutes } from './routes/stockCountRoutes.js'
import { reservationRoutes } from './routes/reservationRoutes.js'
import { barcodeRoutes } from './routes/barcodeRoutes.js'
import { notFound, errorHandler } from './middleware/errorHandler.js'
import { HttpError } from './utils/http.js'

export const app = express()
app.disable('x-powered-by')
app.set('trust proxy', env.trustProxy)
app.use(requestLogging)
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors({
  origin(origin, done) {
    if (!origin || env.frontendUrls.includes(origin)) return done(null, true)
    done(new HttpError(403, 'Origin not allowed by CORS.'))
  },
  credentials: true
}))
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())
app.use('/uploads', express.static(path.resolve('uploads')))

app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ success: true, status: 'healthy', database: 'connected' })
  } catch {
    res.status(503).json({ success: false, status: 'degraded', database: 'unavailable' })
  }
})
app.use('/api/auth', authRoutes)
app.use('/api/sessions', sessionRoutes)
app.use('/api/system', systemRoutes)
app.use('/api/report-schedules', reportScheduleRoutes)
app.use('/api/docs', docsRoutes)
app.use('/api/bootstrap', bootstrapRoutes)
app.use('/api/stock-counts', stockCountRoutes)
app.use('/api/reservations', reservationRoutes)
app.use('/api/purchase-requests', purchaseRequestRoutes)
app.use('/api/rfqs', rfqRoutes)
app.use('/api/supplier-returns', supplierReturnRoutes)
app.use('/api/inventory/conditions', stockConditionRoutes)
app.use('/api', barcodeRoutes)
app.use('/api', catalogRoutes)
app.use('/api', inventoryRoutes)
app.use('/api', procurementRoutes)
app.use('/api/transfers', transferRoutes)
app.use('/api/replenishment', replenishmentRoutes)
app.use('/api', assetRoutes)
app.use('/api', assetWorkflowRoutes)
app.use('/api/attachments', attachmentRoutes)
app.use('/api/imports', importRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/reports', reportRoutes)
app.use('/api/preferences', preferenceRoutes)
app.use('/api/search', searchRoutes)
app.use('/api', managementRoutes)
app.use(notFound)
app.use(errorHandler)
