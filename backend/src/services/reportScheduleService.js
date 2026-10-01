import { z } from 'zod'
import { prisma } from '../config/prisma.js'
import { publicUser } from '../middleware/auth.js'
import { HttpError } from '../utils/http.js'
import { inventoryTransaction } from './inventoryService.js'
import { enhancedReport,reportOptions } from './enhancedReportService.js'
import { requireReport } from './reportCatalog.js'
import { requireWarehouseAccess } from './warehouseAccessService.js'
const createSchema=z.object({savedReportId:z.string().min(1).max(191),intervalDays:z.number().int().min(1).max(365)}).strict()
const updateSchema=z.object({expectedRevision:z.number().int().min(1),intervalDays:z.number().int().min(1).max(365),enabled:z.boolean()}).strict()
const query=report=>({...report.filters,columns:report.columns.join(','),sortBy:report.sortBy,sortOrder:report.sortOrder,page:1,limit:100})
export async function listSchedules(user){return prisma.reportSchedule.findMany({where:{userId:user.id},include:{savedReport:{select:{name:true,reportType:true,archivedAt:true}}},orderBy:{createdAt:'desc'},take:50})}
export async function createSchedule(input,user){const v=createSchema.parse(input);return inventoryTransaction(async tx=>{
  const report=await tx.savedReport.findFirst({where:{id:v.savedReportId,userId:user.id,archivedAt:null}})
  if(!report)throw new HttpError(404,'Saved report not found.')
  reportOptions(report.reportType,query(report),user)
  if(await tx.reportSchedule.count({where:{userId:user.id}})>=50)throw new HttpError(400,'Limit of 50 schedules per account reached.')
  return tx.reportSchedule.create({data:{...v,userId:user.id,nextRunAt:new Date(Date.now()+v.intervalDays*86400000)}})
})}
export async function updateSchedule(id,input,user){const v=updateSchema.parse(input);const changed=await prisma.reportSchedule.updateMany({where:{id,userId:user.id,revision:v.expectedRevision},data:{intervalDays:v.intervalDays,enabled:v.enabled,revision:{increment:1},nextRunAt:new Date(Date.now()+v.intervalDays*86400000)}});if(changed.count!==1)throw new HttpError(409,'Schedule changed or is unavailable. Reload before saving.');return prisma.reportSchedule.findUnique({where:{id}})}
function authorizeResult(run,user){
  const result=run.result;if(!result)return
  requireReport(user,result.reportType)
  if(result.scope.warehouse)requireWarehouseAccess(user,result.scope.warehouse)
  else if(user.role!=='Administrator'&&(result.scope.administrator||result.scope.warehouseIds.some(id=>!user.warehouseIds.includes(id))))throw new HttpError(403,'Report snapshot contains warehouses outside your current access.')
}
export async function scheduleRuns(id,page,user){
  if(!await prisma.reportSchedule.count({where:{id,userId:user.id}}))throw new HttpError(404,'Schedule not found.')
  const where={scheduleId:id},[rows,total]=await Promise.all([prisma.scheduledReportRun.findMany({where,select:{id:true,occurrence:true,status:true,errorSummary:true,generatedAt:true},orderBy:[{generatedAt:'desc'},{id:'asc'}],take:20,skip:(page-1)*20}),prisma.scheduledReportRun.count({where})])
  return {data:rows,pagination:{page,limit:20,total,totalPages:Math.ceil(total/20)}}
}
export async function scheduledResult(id,user){const run=await prisma.scheduledReportRun.findFirst({where:{id,schedule:{userId:user.id}}});if(!run)throw new HttpError(404,'Scheduled report not found.');authorizeResult(run,user);return {id:run.id,status:run.status,generatedAt:run.generatedAt,errorSummary:run.errorSummary,result:run.result?.report||null}}
export async function runReportSchedules(){
  const due=await prisma.reportSchedule.findMany({where:{enabled:true,nextRunAt:{lte:new Date()}},include:{savedReport:true},orderBy:{nextRunAt:'asc'},take:20})
  for(const schedule of due){
    let result=null,status='FAILED',errorSummary='Report unavailable under current configuration or permissions.'
    try{
      const row=await prisma.user.findUnique({where:{id:schedule.userId},include:{role:{include:{permissions:{include:{permission:true}}}},warehouseAssignments:true}})
      if(!row||row.status!=='ACTIVE'||schedule.savedReport.archivedAt||schedule.savedReport.userId!==schedule.userId)throw new HttpError(403,'Unavailable')
      const user=publicUser(row),report=await enhancedReport(schedule.savedReport.reportType,query(schedule.savedReport),user)
      result={reportType:schedule.savedReport.reportType,scope:{warehouse:report.filters.warehouse||null,administrator:user.role==='Administrator',warehouseIds:user.warehouseIds},report}
      status='COMPLETE';errorSummary=null
    }catch{/* Never copy internal errors or business/auth payloads into job status. */}
    await inventoryTransaction(async tx=>{
      const changed=await tx.reportSchedule.updateMany({where:{id:schedule.id,enabled:true,revision:schedule.revision,nextRunAt:schedule.nextRunAt},data:{nextRunAt:new Date(Math.max(Date.now(),schedule.nextRunAt.getTime())+schedule.intervalDays*86400000)}})
      if(changed.count!==1)return
      await tx.scheduledReportRun.create({data:{scheduleId:schedule.id,occurrence:schedule.nextRunAt,status,...(result?{result}:{}),errorSummary}})
    })
  }
}
