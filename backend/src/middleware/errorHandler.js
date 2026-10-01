import { Prisma } from '@prisma/client'
import { ZodError } from 'zod'
import multer from 'multer'
import { HttpError } from '../utils/http.js'
import { logEvent } from './requestLogging.js'

export function notFound(req, res, next) {
  next(new HttpError(404, `Route ${req.method} ${req.path} not found.`))
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error)
  const bodyErrors = {
    'entity.parse.failed': [400, 'Request body must contain valid JSON.'],
    'entity.too.large': [413, 'Request body exceeds the configured size limit.'],
    'encoding.unsupported': [415, 'Request body encoding is unsupported.'],
    'charset.unsupported': [415, 'Request body charset is unsupported.'],
    'request.aborted': [400, 'Request body was interrupted.'],
    'request.size.invalid': [400, 'Request body size is invalid.']
  }
  const bodyError = bodyErrors[error.type]
  const expectedStatus=bodyError?.[0]||error.status||(error instanceof ZodError||error instanceof multer.MulterError?400:({P2002:409,P2003:400,P2025:404,P2034:409}[error.code]||500))
  logEvent(expectedStatus<500?'warn':'error','request_error',{requestId:req.requestId||null,code:typeof error.code==='string'&&/^[A-Z0-9_]{1,30}$/.test(error.code)?error.code:null,status:expectedStatus})
  if (bodyError) return res.status(bodyError[0]).json({ success: false, message: bodyError[1], errors: [] })
  if (error instanceof multer.MulterError) return res.status(400).json({ success: false, message: error.code === 'LIMIT_FILE_SIZE' ? 'Image must be smaller than 800 KB.' : error.message, errors: [] })
  if (error instanceof ZodError) return res.status(400).json({ success: false, message: 'Validation failed.', errors: error.errors.map(item => ({ field: item.path.join('.'), message: item.message })) })
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return res.status(409).json({ success: false, message: `A record with this ${error.meta?.target?.join(', ') || 'value'} already exists.`, errors: [] })
    if (error.code === 'P2003') return res.status(400).json({ success: false, message: 'A referenced record does not exist or this record is still in use.', errors: [] })
    if (error.code === 'P2025') return res.status(404).json({ success: false, message: 'Record not found.', errors: [] })
    if (error.code === 'P2034') return res.status(409).json({ success: false, message: 'Concurrent inventory update. Please retry.', errors: [] })
  }
  if (error instanceof HttpError) return res.status(error.status).json({ success: false, message: error.message, errors: error.errors })
  res.status(500).json({ success: false, message: 'Internal server error.', errors: [] })
}
