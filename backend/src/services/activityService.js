import { z } from 'zod'
import { prisma } from '../config/prisma.js'
import { activityWhere } from './warehouseAccessService.js'
import { hasPermissions } from './reportCatalog.js'
import { HttpError } from '../utils/http.js'
import { dateOnly } from '../validators/reporting.js'

const schema=z.object({page:z.coerce.number().int().min(1).default(1),limit:z.coerce.number().int().min(1).max(100).default(20),search:z.string().trim().max(100).optional(),module:z.string().max(60).optional(),action:z.string().max(60).optional(),user:z.string().max(191).optional(),dateFrom:dateOnly.optional(),dateTo:dateOnly.optional(),sortBy:z.enum(['createdAt','action','module']).default('createdAt'),sortOrder:z.enum(['asc','desc']).default('desc')}).strict().refine(q=>!q.dateFrom||!q.dateTo||q.dateFrom<=q.dateTo,'Invalid date range.')
const actor={select:{firstName:true,lastName:true}}
const permit=user=>{if(!hasPermissions(user,['users.VIEW']))throw new HttpError(403,'Activity access is required.')}
export async function activityLogs(input,user){
  permit(user);const q=schema.parse(input),where={AND:[activityWhere(user)]}
  if(q.search)where.AND.push({OR:[{description:{contains:q.search}},{action:{contains:q.search}},{user:{OR:[{firstName:{contains:q.search}},{lastName:{contains:q.search}}]}}]})
  if(q.module)where.module=q.module
  if(q.action)where.action=q.action
  if(q.user)where.userId=q.user
  if(q.dateFrom||q.dateTo)where.createdAt={...(q.dateFrom?{gte:new Date(q.dateFrom)}:{}),...(q.dateTo?{lte:new Date(`${q.dateTo}T23:59:59.999Z`)}:{})}
  const [data,total]=await prisma.$transaction([prisma.activityLog.findMany({where,include:{user:actor},take:q.limit,skip:(q.page-1)*q.limit,orderBy:[{[q.sortBy]:q.sortOrder},{id:'asc'}]}),prisma.activityLog.count({where})])
  return {data,pagination:{page:q.page,limit:q.limit,total,totalPages:Math.ceil(total/q.limit)}}
}
export async function activityDetail(id,user){
  permit(user);const row=await prisma.activityLog.findFirst({where:{id,AND:[activityWhere(user)]},include:{user:actor}})
  if(!row)throw new HttpError(404,'Activity not found.')
  return row
}
