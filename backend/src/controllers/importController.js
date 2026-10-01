import { ok } from '../utils/http.js'
import * as service from '../services/importService.js'
import { importType, importUpload, importId, importQuery, importRevision, importConfirm, importReferenceQuery } from '../validators/imports.js'
export const list = async (req,res) => { const result = await service.listImports(importQuery.parse(req.query),req.user); ok(res,result.data,'OK',200,{pagination:result.pagination}) }
export const get = async (req,res) => ok(res,await service.getImport(importId.parse(req.params.id),importQuery.parse(req.query),req.user))
export const preview = async (req,res) => ok(res,await service.previewImport(importType.parse(req.params.type),importUpload.parse(req.body),req.file,req),'CSV preview created. Review all rows before confirming.',201)
export const revalidate = async (req,res) => ok(res,await service.revalidateImport(importId.parse(req.params.id),importRevision.parse(req.body),req),'Preview revalidated. Review before confirming.')
export const confirm = async (req,res) => ok(res,await service.confirmImport(importId.parse(req.params.id),importConfirm.parse(req.body),req),'Import confirmed.')
const csv = (res,name,text) => res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}).attachment(name).type('text/csv; charset=utf-8').send(text)
export const template = (req,res) => { const type = importType.parse(req.params.type); return csv(res,`${type}-template.csv`,service.importTemplate(type,req.user)) }
export const rejected = async (req,res) => { const id = importId.parse(req.params.id); return csv(res,`import-${id}-rejected.csv`,await service.rejectedImportCsv(id,req.user)) }
export const references = async (req,res) => { const result=await service.importReferenceCodes(importType.parse(req.params.type),req.params.kind,importReferenceQuery.parse(req.query),req.user);ok(res,result.data,'OK',200,{pagination:result.pagination}) }
