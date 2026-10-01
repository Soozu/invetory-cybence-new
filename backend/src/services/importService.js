import crypto from 'node:crypto'
import { prisma } from '../config/prisma.js'
import { HttpError } from '../utils/http.js'
import { audit } from '../utils/audit.js'
import { nextReference } from '../utils/references.js'
import { recordSerialEvents } from '../utils/serialEvents.js'
import { inventoryTransaction, adjustStockInTransaction } from './inventoryService.js'
import { createProductInTransaction, createCatalogInTransaction } from './catalogService.js'
import { createAssetInTransaction } from './assetService.js'
import { requireWarehouseAccess, isAdministrator } from './warehouseAccessService.js'
import { importTypes, importDefinition, parseImportCsv, exportCsv } from './importCsv.js'
import { validateImportRows, importHash } from './importValidation.js'

export function importPermit(user, type, write = false) {
  const d = importDefinition(type)
  const grants = ['imports.VIEW',`${d.module}.VIEW`,...(write ? ['imports.CREATE',`${d.module}.${d.action}`] : [])]
  if (!isAdministrator(user) && grants.some(p => !user?.permissions?.includes(p))) throw new HttpError(403, 'Import and source-module permissions are required.')
  return d
}
async function batchFor(tx, id, user, write = false) {
  const batch = await tx.importBatch.findUnique({ where: { id } })
  if (!batch) throw new HttpError(404, 'Import preview not found.')
  if (!isAdministrator(user) && batch.uploadedById !== user.id) throw new HttpError(403, 'This import belongs to another user.')
  importPermit(user,batch.type,write)
  if (batch.warehouseId) requireWarehouseAccess(user,batch.warehouseId)
  return batch
}
function revision(batch, input) {
  if (batch.status !== 'PREVIEW') throw new HttpError(409, 'This batch is already confirmed.')
  if (batch.expiresAt <= new Date()) throw new HttpError(409, 'Preview expired. Upload a fresh CSV file.')
  if (batch.revision !== input.expectedRevision) throw new HttpError(409, 'Preview changed. Reload and review it before confirmation.')
}
function view(batch, page = 1) {
  const rows = batch.rows, invalidRows = rows.filter(row => row.errors.length).length
  return { id: batch.id, type: batch.type, fileName: batch.fileName, warehouseId: batch.warehouseId, status: batch.status, revision: batch.revision, uploadedById: batch.uploadedById, createdAt: batch.createdAt, expiresAt: batch.expiresAt, confirmedAt: batch.confirmedAt, confirmedById: batch.confirmedById, notes: batch.notes, result: batch.result, summary: { totalRows: rows.length, validRows: rows.length - invalidRows, invalidRows }, rows: rows.slice((page - 1) * 20, page * 20).map(({rowNumber,values,errors}) => ({rowNumber,values,errors})), pagination: { page, total: rows.length, totalPages: Math.max(1,Math.ceil(rows.length / 20)) } }
}
export async function previewImport(type, input, file, req) {
  const definition = importPermit(req.user,type,true)
  if (definition.scoped) {
    if (!input.warehouseId) throw new HttpError(400, 'Select a warehouse for this import.')
    requireWarehouseAccess(req.user,input.warehouseId)
  } else if (input.warehouseId) throw new HttpError(400, 'This catalog import has no warehouse scope.')
  const rawRows = parseImportCsv(type,file), sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex')
  const work = async tx => {
    const existing = await tx.importBatch.findUnique({ where: { uploadedById_requestKey: { uploadedById: req.user.id, requestKey: input.requestKey } } })
    if (existing) {
      if (existing.sha256 !== sha256 || existing.type !== type || existing.fileName !== file.originalname || existing.warehouseId !== (input.warehouseId || null)) throw new HttpError(409, 'Upload reference already belongs to a different file or import scope.')
      return view(await batchFor(tx,existing.id,req.user,true))
    }
    if (await tx.importBatch.count({ where: { uploadedById: req.user.id, status: 'PREVIEW', expiresAt: { gt: new Date() } } }) >= 20) throw new HttpError(429, 'At most 20 active previews are allowed. Confirm existing previews or wait for expiry.')
    const rows = await validateImportRows(tx,type,rawRows,input.warehouseId)
    const batch = await tx.importBatch.create({ data: { type, warehouseId: input.warehouseId || null, fileName: file.originalname, sha256, requestKey: input.requestKey, uploadedById: req.user.id, rows, expiresAt: new Date(Date.now() + 86400000) } })
    await audit(tx,req,'PREVIEWED','Imports','ImportBatch',batch.id,`Validated ${rows.length} ${type} import rows; no business rows written.`,{warehouseId:batch.warehouseId})
    return view(batch)
  }
  try { return await inventoryTransaction(work) } catch (error) {
    if (error.code !== 'P2002') throw error
    return inventoryTransaction(work)
  }
}
export async function getImport(id, query, user) { return view(await batchFor(prisma,id,user),query.page || 1) }
export async function listImports(query, user) {
  if (!isAdministrator(user) && !user?.permissions?.includes('imports.VIEW')) throw new HttpError(403,'Import viewing permission is required.')
  const types = Object.keys(importTypes).filter(type => { try { importPermit(user,type); return true } catch { return false } })
  const where = { type: { in: types }, ...(isAdministrator(user) ? {} : { uploadedById: user.id, OR: [{warehouseId:null},{warehouseId:{in:user.warehouseIds || []}}] }) }
  const [data,total] = await Promise.all([prisma.importBatch.findMany({ where, select: { id:true,type:true,fileName:true,status:true,revision:true,warehouseId:true,createdAt:true,expiresAt:true,confirmedAt:true }, orderBy:[{createdAt:'desc'},{id:'desc'}], take:20,skip:((query.page || 1)-1)*20 }),prisma.importBatch.count({where})])
  return {data,pagination:{page:query.page || 1,total,totalPages:Math.max(1,Math.ceil(total/20))}}
}
export async function revalidateImport(id, input, req) {
  return inventoryTransaction(async tx => {
    const batch = await batchFor(tx,id,req.user,true); revision(batch,input)
    const rows = await validateImportRows(tx,batch.type,batch.rows.map(({rowNumber,values})=>({rowNumber,values})),batch.warehouseId)
    const changed = await tx.importBatch.updateMany({where:{id,revision:batch.revision,status:'PREVIEW'},data:{rows,revision:{increment:1}}})
    if (!changed.count) throw new HttpError(409,'Preview changed concurrently.')
    await audit(tx,req,'REVALIDATED','Imports','ImportBatch',id,'Revalidated staged rows without applying the import.',{warehouseId:batch.warehouseId})
    return view(await tx.importBatch.findUnique({where:{id}}))
  })
}
export async function confirmImport(id, input, req) {
  if (!isAdministrator(req.user) && !req.user?.permissions?.includes('imports.CONFIRM')) throw new HttpError(403,'Import confirmation permission is required.')
  if (!input.notes?.trim() || input.notes.trim().length < 5) throw new HttpError(400,'An import reason of at least five characters is required.')
  return inventoryTransaction(async tx => {
    const batch = await batchFor(tx,id,req.user,true)
    if (batch.status === 'IMPORTED') return view(batch)
    revision(batch,input)
    if (batch.rows.some(r=>r.errors.length)) throw new HttpError(409,'This preview contains rejected rows. Correct the CSV and upload it again.')
    const fresh = await validateImportRows(tx,batch.type,batch.rows.map(({rowNumber,values})=>({rowNumber,values})),batch.warehouseId)
    if (fresh.some((row,index)=>row.errors.length || row.fingerprint !== batch.rows[index].fingerprint || importHash(row.data) !== importHash(batch.rows[index].data))) throw new HttpError(409,'Source data changed. Revalidate and review the preview before confirming.')
    const result = []
    for (const row of fresh) {
      let record, reference
      if (batch.type === 'Products') record = await createProductInTransaction(tx,row.data,req)
      else if (batch.type === 'Suppliers') record = await createCatalogInTransaction(tx,'suppliers',row.data,req)
      else if (batch.type === 'OpeningStock') { const applied = await adjustStockInTransaction(tx,{...row.data,reason:input.notes},req); record = applied.adjustment; reference = record.referenceNumber }
      else if (batch.type === 'Assets') { record = await createAssetInTransaction(tx,{...row.data,...(row.data.purchaseDate?{purchaseDate:new Date(row.data.purchaseDate)}:{})},req); reference = record.assetTag }
      else {
        record = await tx.serialNumber.create({data:row.data})
        const stock = await tx.warehouseStock.findUniqueOrThrow({where:{productId_warehouseId:{productId:row.data.productId,warehouseId:batch.warehouseId}}})
        reference = await nextReference(tx,'serial-import','SIM')
        await tx.stockMovement.create({data:{productId:row.data.productId,warehouseId:batch.warehouseId,type:'CORRECTION',quantity:0,previousQuantity:stock.quantity,newQuantity:stock.quantity,previousReservedQuantity:stock.reservedQuantity,newReservedQuantity:stock.reservedQuantity,referenceNumber:reference,userId:req.user.id,notes:`Registered existing unit ${row.data.serialNumber}; ${input.notes}`}})
        await recordSerialEvents(tx,[record.id],{type:'HISTORY_STARTED',fromStatus:null,toStatus:'AVAILABLE',warehouseId:batch.warehouseId,referenceType:'ImportBatch',referenceId:id,referenceNumber:reference,notes:'Existing unit serial backfill. Earlier history and warranty provenance are unknown.'},req)
        await audit(tx,req,'CREATED','Inventory','SerialNumber',record.id,`Registered existing unit ${row.data.serialNumber}.`,{warehouseId:batch.warehouseId})
      }
      result.push({rowNumber:row.rowNumber,id:record.id,reference:reference || record.sku || record.supplierCode || record.serialNumber})
    }
    const changed = await tx.importBatch.updateMany({where:{id,revision:batch.revision,status:'PREVIEW'},data:{status:'IMPORTED',revision:{increment:1},confirmedAt:new Date(),confirmedById:req.user.id,notes:input.notes,result}})
    if (!changed.count) throw new HttpError(409,'Another confirmation changed this preview.')
    await audit(tx,req,'IMPORTED','Imports','ImportBatch',id,`Confirmed ${result.length} ${batch.type} rows: ${input.notes}`,{warehouseId:batch.warehouseId})
    return view(await tx.importBatch.findUnique({where:{id}}))
  })
}
export async function rejectedImportCsv(id, user) {
  const batch = await batchFor(prisma,id,user), fields = importDefinition(batch.type).fields
  return exportCsv([['rowNumber',...fields,'errors'],...batch.rows.filter(r=>r.errors.length).map(r=>[r.rowNumber,...fields.map(f=>r.values[f] || ''),r.errors.join(' | ')])])
}
export function importTemplate(type, user) { importPermit(user,type); return exportCsv([importDefinition(type).fields]) }

export async function importReferenceCodes(type, kind, query, user) {
  importPermit(user,type)
  const kinds = type === 'Products' ? ['categories','brands','suppliers'] : importDefinition(type).scoped ? ['products'] : []
  if (!kinds.includes(kind)) throw new HttpError(400,'This reference directory is unavailable for the import type.')
  const model = {categories:'category',brands:'brand',suppliers:'supplier',products:'product'}[kind], code = {categories:'slug',brands:'slug',suppliers:'supplierCode',products:'sku'}[kind], name = kind === 'suppliers' ? 'companyName' : 'name'
  const where = {status:'ACTIVE',...(query.search?{OR:[{[code]:{contains:query.search}},{[name]:{contains:query.search}}]}:{})}
  const [records,total] = await Promise.all([prisma[model].findMany({where,select:{[code]:true,[name]:true},orderBy:{[code]:'asc'},take:20,skip:(query.page-1)*20}),prisma[model].count({where})])
  return {data:records.map(row=>({code:row[code],name:row[name]})),pagination:{page:query.page,total,totalPages:Math.max(1,Math.ceil(total/20))}}
}
