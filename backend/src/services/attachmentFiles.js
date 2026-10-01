import path from 'node:path'
import { fileTypeFromBuffer } from 'file-type'
import yauzl from 'yauzl'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { HttpError } from '../utils/http.js'

const officeMimes = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
const types = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', ...officeMimes }
export function attachmentPolicy() {
  const maxBytes = Number(process.env.ATTACHMENT_MAX_BYTES || 10 * 1024 * 1024)
  const extensions = (process.env.ATTACHMENT_ALLOWED_TYPES || 'pdf,png,jpg,jpeg,webp,docx,xlsx').split(',').map(v => v.trim().toLowerCase())
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 25 * 1024 * 1024 || !extensions.length || extensions.some(v => !Object.hasOwn(types, v))) throw Error('Invalid attachment upload configuration.')
  return { maxBytes, extensions }
}
const invalid = () => new HttpError(400, 'File content, extension and MIME type must match an allowed document format.')
const xmlParser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false, removeNSPrefix: true })
const attributeText = value => String(value).replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, entity) => {
  const code = entity[0].toLowerCase() === 'x' ? Number.parseInt(entity.slice(1), 16) : Number(entity)
  if (!Number.isSafeInteger(code) || code < 1 || code > 0x10ffff) throw invalid()
  return String.fromCodePoint(code)
}).trim()
function unsafeXml(value) {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, child]) => (key === '@_TargetMode' && attributeText(child).toLowerCase() === 'external') || (key === '@_ContentType' && /macroEnabled|vbaProject/i.test(attributeText(child))) || unsafeXml(child))
}
export function safeFileName(value) {
  if (typeof value !== 'string' || !value || value.length > 180 || /[\x00-\x1f\x7f\\/:]/.test(value) || value.startsWith('.') || value.endsWith('.') || value.trim() !== value) throw new HttpError(400, 'Use a file name of up to 180 characters without paths or control characters.')
  return value.normalize('NFC')
}
// Inspect the bounded OOXML archive without extracting or executing any entry.
async function inspectOffice(buffer, extension) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
      if (error) return reject(invalid())
      const entries = new Map(); let total = 0, settled = false
      const fail = () => { if (!settled) { settled = true; zip.close(); reject(invalid()) } }
      zip.on('error', fail)
      zip.on('entry', entry => {
        const name = entry.fileName
        total += entry.uncompressedSize
        if (entries.size >= 1000 || entries.has(name) || total > 50 * 1024 * 1024 || entry.uncompressedSize > 10 * 1024 * 1024 || (entry.generalPurposeBitFlag & 1) || /(^|\/)(\.\.|vbaProject\.bin)(\/|$)|\.(exe|dll|js|html|hta)$/i.test(name) || /\/embeddings\//i.test(name)) return fail()
        entries.set(name, '')
        if (name.endsWith('/')) return zip.readEntry()
        zip.openReadStream(entry, (err, stream) => {
          if (err) return fail()
          let bytes = 0; const chunks = []
          stream.on('error', fail)
          stream.on('data', chunk => { bytes += chunk.length; if (bytes > 10 * 1024 * 1024) { stream.destroy(); fail(); return } if (name.endsWith('.xml') || name.endsWith('.rels')) chunks.push(chunk) })
          stream.on('end', () => {
            if (settled) return
            const xml = Buffer.concat(chunks).toString('utf8')
            if (/<!DOCTYPE|<!ENTITY|macroEnabled|vbaProject|TargetMode\s*=\s*["']External["']/i.test(xml)) return fail()
            if (name.endsWith('.xml') || name.endsWith('.rels')) {
              try { if (XMLValidator.validate(xml) !== true || unsafeXml(xmlParser.parse(xml))) return fail() } catch { return fail() }
            }
            entries.set(name, xml); zip.readEntry()
          })
        })
      })
      zip.on('end', () => {
        if (settled) return
        const content = entries.get('[Content_Types].xml') || ''
        const main = extension === 'docx' ? 'word/document.xml' : 'xl/workbook.xml'
        const expected = extension === 'docx' ? 'wordprocessingml.document.main+xml' : 'spreadsheetml.sheet.main+xml'
        if (!entries.get(main) || !entries.has('_rels/.rels') || !content.includes(expected)) return fail()
        settled = true; zip.close(); resolve()
      })
      zip.readEntry()
    })
  })
}
export async function validateAttachmentFile(file) {
  if (!file?.buffer?.length) throw new HttpError(400, 'Choose a non-empty document.')
  const policy = attachmentPolicy(), fileName = safeFileName(file.originalname), extension = path.extname(fileName).slice(1).toLowerCase()
  if (file.buffer.length > policy.maxBytes) throw new HttpError(413, 'Document exceeds the configured attachment size limit.')
  if (!policy.extensions.includes(extension) || file.mimetype !== types[extension]) throw invalid()
  if (officeMimes[extension]) await inspectOffice(file.buffer, extension)
  else {
    let detected; try { detected = await fileTypeFromBuffer(file.buffer) } catch { throw invalid() }
    if (!detected || detected.mime !== types[extension]) throw invalid()
  }
  return { fileName, mimeType: types[extension], size: file.buffer.length }
}
