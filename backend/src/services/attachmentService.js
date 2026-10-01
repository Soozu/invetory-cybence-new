import crypto from 'node:crypto'
import { prisma } from '../config/prisma.js'
import { inventoryTransaction } from './inventoryService.js'
import { permit, version, revise } from './assetWorkflowRules.js'
import { attachmentParent, findAttachmentSources } from './attachmentSources.js'
import { attachmentPolicy, validateAttachmentFile } from './attachmentFiles.js'
import { storeAttachment, readAttachment, removeUncommittedAttachment } from './attachmentStorage.js'
import { storageProvider } from './storageService.js'
import { audit } from '../utils/audit.js'
import { HttpError } from '../utils/http.js'

const include = { uploadedBy: { select: { firstName: true, lastName: true } } }
export function attachmentDTO(row) {
  const { storedName, storageKey, storageProvider, sha256, requestKey, ...publicRow } = row; return publicRow
}
export async function listAttachmentSources(type, query, user) { permit(user, 'VIEW', 'attachments'); return findAttachmentSources(prisma, type, query, user) }
export async function listAttachments(type, id, query, user) {
  permit(user, 'VIEW', 'attachments'); const parent = await attachmentParent(prisma, type, id, user)
  const where = { entityType: type, entityId: id, ...(query.archived === 'true' ? {} : { archivedAt: null }) }, page = Number(query.page), limit = 20
  const [rows, total] = await Promise.all([prisma.attachment.findMany({ where, include, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit, skip: (page - 1) * limit }), prisma.attachment.count({ where })])
  return { data: rows.map(attachmentDTO), parent, policy: attachmentPolicy(), pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } }
}
async function priorUpload(tx, input, user, file, sha256) {
  const row = await tx.attachment.findUnique({ where: { entityType_entityId_uploadedById_requestKey: { entityType: input.entityType, entityId: input.entityId, uploadedById: user.id, requestKey: input.requestKey } }, include })
  if (row && (row.sha256 !== sha256 || row.fileName !== file.fileName || row.mimeType !== file.mimeType || row.size !== file.size)) throw new HttpError(409, 'This upload reference was used for a different document. Choose the file again.')
  return row
}
export async function createAttachment(input, upload, req) {
  permit(req.user, 'CREATE', 'attachments'); permit(req.user, 'VIEW', 'attachments')
  await attachmentParent(prisma, input.entityType, input.entityId, req.user, true)
  const file = await validateAttachmentFile(upload), sha256 = crypto.createHash('sha256').update(upload.buffer).digest('hex')
  const prior = await priorUpload(prisma, input, req.user, file, sha256)
  if (prior) return attachmentDTO(prior)
  const key = crypto.randomUUID() + '.bin'; await storeAttachment(key, upload.buffer)
  try {
    const row = await inventoryTransaction(async tx => {
      const parent = await attachmentParent(tx, input.entityType, input.entityId, req.user, true)
      const existing = await priorUpload(tx, input, req.user, file, sha256)
      if (existing) return existing
      const created = await tx.attachment.create({ data: { ...input, ...file, sha256, uploadedById: req.user.id, storedName: key, storageKey: key, storageProvider: storageProvider(), warehouseId: parent.warehouseId, relatedWarehouseId: parent.relatedWarehouseId }, include })
      await audit(tx, req, 'ATTACHMENT_UPLOADED', 'Attachments', input.entityType, input.entityId, `Attached ${file.fileName} to ${parent.label}.`, parent)
      return created
    })
    if (row.storageKey !== key) await removeUncommittedAttachment(key)
    return attachmentDTO(row)
  } catch (error) {
    await removeUncommittedAttachment(key)
    if (error.code === 'P2002') { const winner = await priorUpload(prisma, input, req.user, file, sha256); if (winner) return attachmentDTO(winner) }
    throw error
  }
}
export async function downloadAttachment(id, user) {
  permit(user, 'VIEW', 'attachments')
  const row = await prisma.attachment.findUnique({ where: { id } }); if (!row) throw new HttpError(404, 'Attachment not found.')
  await attachmentParent(prisma, row.entityType, row.entityId, user)
  if (row.archivedAt) throw new HttpError(409, 'Restore this archived attachment before downloading.')
  const buffer = await readAttachment(row.storageKey,row.storageProvider)
  if (buffer.length !== row.size || crypto.createHash('sha256').update(buffer).digest('hex') !== row.sha256) throw new HttpError(409, 'Attachment integrity check failed. Contact an administrator.')
  return { buffer, fileName: row.fileName, mimeType: row.mimeType }
}
export async function archiveAttachment(id, input, req, restore = false) {
  permit(req.user, restore ? 'EDIT' : 'DELETE', 'attachments'); permit(req.user, 'VIEW', 'attachments')
  return inventoryTransaction(async tx => {
    const row = await tx.attachment.findUnique({ where: { id } }); if (!row) throw new HttpError(404, 'Attachment not found.')
    const parent = await attachmentParent(tx, row.entityType, row.entityId, req.user, true); version(row, input.expectedUpdatedAt)
    if (Boolean(row.archivedAt) !== restore) throw new HttpError(409, restore ? 'Attachment is already active.' : 'Attachment is already archived.')
    await revise(tx.attachment, row, { archivedAt: restore ? null : new Date(), archivedById: restore ? null : req.user.id })
    await audit(tx, req, restore ? 'ATTACHMENT_RESTORED' : 'ATTACHMENT_ARCHIVED', 'Attachments', row.entityType, row.entityId, `${restore ? 'Restored' : 'Archived'} ${row.fileName}: ${input.notes}`, parent)
    return attachmentDTO(await tx.attachment.findUnique({ where: { id }, include }))
  })
}
