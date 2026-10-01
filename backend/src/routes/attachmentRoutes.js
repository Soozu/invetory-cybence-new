import { Router } from 'express'
import multer from 'multer'
import { rateLimit } from 'express-rate-limit'
import { authenticate, authorize } from '../middleware/auth.js'
import { attachmentParent } from '../services/attachmentSources.js'
import { attachmentPolicy } from '../services/attachmentFiles.js'
import { attachmentTarget } from '../validators/attachments.js'
import { prisma } from '../config/prisma.js'
import { HttpError } from '../utils/http.js'
import * as c from '../controllers/attachmentController.js'
const routes = Router()
routes.use(authenticate)
const uploadLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: 'draft-8', legacyHeaders: false, message: { success: false, message: 'Too many document uploads. Try again later.', errors: [] } })
const receive = async (req, res, next) => {
  const target = attachmentTarget.parse(req.params)
  await attachmentParent(prisma, target.entityType, target.entityId, req.user, true)
  const parser = multer({ storage: multer.memoryStorage(), preservePath: true, limits: { fileSize: attachmentPolicy().maxBytes, files: 1, fields: 1, fieldSize: 100, parts: 3 } }).single('file')
  await new Promise((resolve, reject) => parser(req, res, error => error ? reject(new HttpError(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, error.code === 'LIMIT_FILE_SIZE' ? 'Document exceeds the configured attachment size limit.' : 'Upload one document and its upload reference.')) : resolve()))
  next()
}
routes.get('/sources/:entityType', authorize('attachments', 'VIEW'), c.sources)
routes.get('/files/:id', authorize('attachments', 'VIEW'), c.download)
routes.post('/files/:id/archive', authorize('attachments', 'DELETE'), c.action(false))
routes.post('/files/:id/restore', authorize('attachments', 'EDIT'), c.action(true))
routes.get('/:entityType/:entityId', authorize('attachments', 'VIEW'), c.list)
routes.post('/:entityType/:entityId', authorize('attachments', 'VIEW'), authorize('attachments', 'CREATE'), uploadLimit, receive, c.create)
export const attachmentRoutes = routes
