import { Prisma } from '@prisma/client'
import { ZodError } from 'zod'
import multer from 'multer'
import { HttpError } from '../utils/http.js'

export function notFound(req, res, next) {
  next(new HttpError(404, `Route ${req.method} ${req.path} not found.`))
}

export function errorHandler(error, req, res, next) {
  if (error instanceof multer.MulterError) return res.status(400).json({ success: false, message: error.code === 'LIMIT_FILE_SIZE' ? 'Image must be smaller than 800 KB.' : error.message, errors: [] })
  if (error instanceof ZodError) return res.status(400).json({ success: false, message: 'Validation failed.', errors: error.errors.map(item => ({ field: item.path.join('.'), message: item.message })) })
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return res.status(409).json({ success: false, message: `A record with this ${error.meta?.target?.join(', ') || 'value'} already exists.`, errors: [] })
    if (error.code === 'P2003') return res.status(400).json({ success: false, message: 'A referenced record does not exist or this record is still in use.', errors: [] })
    if (error.code === 'P2025') return res.status(404).json({ success: false, message: 'Record not found.', errors: [] })
    if (error.code === 'P2034') return res.status(409).json({ success: false, message: 'Concurrent inventory update. Please retry.', errors: [] })
  }
  if (error instanceof HttpError) return res.status(error.status).json({ success: false, message: error.message, errors: error.errors })
  console.error(error)
  res.status(500).json({ success: false, message: 'Internal server error.', errors: [] })
}
