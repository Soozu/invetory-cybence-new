import { ok, HttpError } from '../utils/http.js'
import * as service from '../services/attachmentService.js'
import { attachmentTarget, attachmentQuery, attachmentSourceQuery, attachmentUpload, attachmentAction, attachmentId } from '../validators/attachments.js'
export const sources = async (req, res) => { const { entityType } = attachmentTarget.parse({ entityType: req.params.entityType, entityId: '_' }); const result = await service.listAttachmentSources(entityType, attachmentSourceQuery.parse(req.query), req.user); ok(res, result.data, 'OK', 200, { pagination: result.pagination }) }
export const list = async (req, res) => { const target = attachmentTarget.parse(req.params); const result = await service.listAttachments(target.entityType, target.entityId, attachmentQuery.parse(req.query), req.user); ok(res, result.data, 'OK', 200, { pagination: result.pagination, parent: result.parent, policy: result.policy }) }
export const create = async (req, res) => { const target = attachmentTarget.parse(req.params); ok(res, await service.createAttachment({ ...target, ...attachmentUpload.parse(req.body) }, req.file, req), 'Document attached.', 201) }
export const download = async (req, res) => {
  const file = await service.downloadAttachment(attachmentId.parse(req.params.id), req.user)
  res.set({ 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "default-src 'none'; sandbox", 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin' })
  res.attachment(file.fileName).type(file.mimeType).send(file.buffer)
}
export const action = restore => async (req, res) => ok(res, await service.archiveAttachment(attachmentId.parse(req.params.id), attachmentAction.parse(req.body), req, restore), restore ? 'Attachment restored.' : 'Attachment archived. The file is retained and can be restored.')
