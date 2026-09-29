import crypto from 'node:crypto'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import multer from 'multer'
import { HttpError } from '../utils/http.js'

const productDir = path.resolve('uploads/products')
mkdirSync(productDir, { recursive: true })
const allowed = new Set(['image/png', 'image/jpeg', 'image/webp'])
export const productUpload = multer({
  storage: multer.diskStorage({
    destination: productDir,
    filename: (req, file, done) => done(null, `${crypto.randomUUID()}${({ 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' })[file.mimetype]}`)
  }),
  limits: { fileSize: 800_000, files: 1 },
  fileFilter: (req, file, done) => done(allowed.has(file.mimetype) ? null : new HttpError(400, 'Use a PNG, JPEG, or WEBP image.'), allowed.has(file.mimetype))
}).single('image')
