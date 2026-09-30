import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import morgan from 'morgan'
import path from 'node:path'
import { env } from './config/env.js'
import { prisma } from './config/prisma.js'
import { authRoutes } from './routes/authRoutes.js'
import { catalogRoutes } from './routes/catalogRoutes.js'
import { inventoryRoutes } from './routes/inventoryRoutes.js'
import { procurementRoutes } from './routes/procurementRoutes.js'
import { purchaseRequestRoutes } from './routes/purchaseRequestRoutes.js'
import { rfqRoutes } from './routes/rfqRoutes.js'
import { transferRoutes } from './routes/transferRoutes.js'
import { assetRoutes } from './routes/assetRoutes.js'
import { dashboardRoutes } from './routes/dashboardRoutes.js'
import { reportRoutes } from './routes/reportRoutes.js'
import { managementRoutes } from './routes/managementRoutes.js'
import { bootstrapRoutes } from './routes/bootstrapRoutes.js'
import { stockCountRoutes } from './routes/stockCountRoutes.js'
import { reservationRoutes } from './routes/reservationRoutes.js'
import { barcodeRoutes } from './routes/barcodeRoutes.js'
import { notFound, errorHandler } from './middleware/errorHandler.js'

export const app = express()
app.disable('x-powered-by')
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors({
  origin(origin, done) {
    if (!origin || env.frontendUrls.includes(origin)) return done(null, true)
    done(new Error('Origin not allowed by CORS'))
  },
  credentials: true
}))
app.use(morgan('combined'))
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
app.use('/api/bootstrap', bootstrapRoutes)
app.use('/api/stock-counts', stockCountRoutes)
app.use('/api/reservations', reservationRoutes)
app.use('/api/purchase-requests', purchaseRequestRoutes)
app.use('/api/rfqs', rfqRoutes)
app.use('/api', barcodeRoutes)
app.use('/api', catalogRoutes)
app.use('/api', inventoryRoutes)
app.use('/api', procurementRoutes)
app.use('/api/transfers', transferRoutes)
app.use('/api', assetRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/reports', reportRoutes)
app.use('/api', managementRoutes)
app.use(notFound)
app.use(errorHandler)
