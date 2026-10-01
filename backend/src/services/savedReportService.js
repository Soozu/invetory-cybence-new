import { prisma } from '../config/prisma.js'
import { HttpError } from '../utils/http.js'
import { inventoryTransaction } from './inventoryService.js'
import { reportOptions } from './enhancedReportService.js'
import { accessibleReports } from './reportCatalog.js'
import { savedReportSchema, revisionSchema } from '../validators/reporting.js'

export async function savedReports(user) {
  const kinds=accessibleReports(user).map(r=>r.kind)
  return prisma.savedReport.findMany({where:{userId:user.id,archivedAt:null,reportType:{in:kinds}},orderBy:[{updatedAt:'desc'},{id:'asc'}]})
}
export async function saveReport(id, input, user) {
  const v=savedReportSchema.parse(input)
  const {q}=reportOptions(v.reportType,{...v.filters,columns:v.columns.join(','),sortBy:v.sortBy,sortOrder:v.sortOrder},user)
  const data={name:v.name,reportType:v.reportType,filters:Object.fromEntries(['warehouse','category','brand','supplier','dateFrom','dateTo'].filter(k=>q[k]).map(k=>[k,q[k]])),columns:v.columns,sortBy:v.sortBy,sortOrder:v.sortOrder}
  return inventoryTransaction(async tx=>{
    if(!id){
      if(v.expectedRevision!==0)throw new HttpError(409,'New configurations must use revision 0.')
      if(await tx.savedReport.count({where:{userId:user.id,archivedAt:null}})>=50)throw new HttpError(400,'Archive a saved report before creating more than 50 configurations.')
      return tx.savedReport.create({data:{...data,userId:user.id}})
    }
    const changed=await tx.savedReport.updateMany({where:{id,userId:user.id,archivedAt:null,revision:v.expectedRevision},data:{...data,revision:{increment:1}}})
    if(changed.count!==1)throw new HttpError(409,'Saved report changed or is unavailable. Reload before saving.')
    return tx.savedReport.findUnique({where:{id}})
  })
}
export async function archiveReport(id,input,user){
  const v=revisionSchema.parse(input)
  const changed=await prisma.savedReport.updateMany({where:{id,userId:user.id,archivedAt:null,revision:v.expectedRevision},data:{archivedAt:new Date(),revision:{increment:1}}})
  if(changed.count!==1)throw new HttpError(409,'Saved report changed or is unavailable. Reload before archiving.')
  return {id,archived:true}
}
