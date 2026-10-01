import { deliverNotifications } from './notificationDelivery.js'
import { warehouseWhere } from './warehouseAccessService.js'
import { serialWhere } from './warehouseAccessService.js'
import { prisma } from '../config/prisma.js'

export async function ensureWarrantyNotifications(user) {
  if (user.role !== 'Administrator' && !user.permissions.includes('assets.VIEW')) return
  const setting = await prisma.systemSetting.findUnique({ where: { key: 'warrantyNotifications' } })
  if (setting?.value === 'false') return
  const preferences=await prisma.userPreference.findUnique({where:{userId:user.id},select:{notifications:true}})
  if(preferences?.notifications?.warrantyExpiring===false)return
  const now = new Date()
  const soon = new Date(now.getTime() + 30 * 86_400_000)
  const serials = await prisma.serialNumber.findMany({
    where: { warrantyEnd: { gte: now, lte: soon }, status: { not: 'DISPOSED' }, ...serialWhere(user) },
    include: { product: { select: { name: true } }, asset: { select: { warehouseId: true } } }
  })
  const rows=[]
  for (const serial of serials) {
    const dedupeKey = `warranty:${user.id}:${serial.id}:${serial.warrantyEnd.toISOString()}`
    rows.push({
      dedupeKey, userId: user.id, warehouseId: serial.warehouseId || serial.asset?.warehouseId || null, type: 'WARRANTY_EXPIRING', title: 'Warranty expiring soon',
      message: `${serial.product.name} (${serial.serialNumber}) warranty ends on ${serial.warrantyEnd.toISOString().slice(0, 10)}.`,
      referenceType: 'SerialNumber', referenceId: serial.id
    })
  }
  await deliverNotifications(prisma,rows)
}

export async function ensureMaintenanceNotifications(user){
  if(user.role!=='Administrator'&&!user.permissions?.includes('assets.VIEW'))return
  const pref=await prisma.userPreference.findUnique({where:{userId:user.id},select:{notifications:true}})
  if(pref?.notifications?.maintenanceDue===false)return
  const now=new Date(),scope=warehouseWhere(user)
  const [plans,records]=await Promise.all([
    prisma.preventiveMaintenancePlan.findMany({where:{status:'ACTIVE',nextDueAt:{lte:now},asset:{...scope,status:{notIn:['DISPOSED','RETIRED','LOST']}}},include:{asset:{select:{assetTag:true,warehouseId:true}}}}),
    prisma.maintenanceRecord.findMany({where:{...scope,status:'SCHEDULED',serviceDate:{lte:now},asset:{status:{notIn:['DISPOSED','RETIRED','LOST']}}},include:{asset:{select:{assetTag:true}}}})
  ])
  await deliverNotifications(prisma,[...plans.map(row=>({dedupeKey:`maintenance-plan:${user.id}:${row.id}:${row.nextDueAt.toISOString()}`,userId:user.id,warehouseId:row.asset.warehouseId,type:'MAINTENANCE_DUE',title:'Preventive maintenance due',message:`${row.asset.assetTag}: ${row.title} is due.`,referenceType:'PreventiveMaintenancePlan',referenceId:row.id})),...records.map(row=>({dedupeKey:`maintenance-record:${user.id}:${row.id}:${row.serviceDate.toISOString()}`,userId:user.id,warehouseId:row.warehouseId,type:'MAINTENANCE_DUE',title:'Maintenance due',message:`${row.asset.assetTag}: scheduled service is due.`,referenceType:'MaintenanceRecord',referenceId:row.id}))])
}
export async function ensureUserNotifications(user){await ensureWarrantyNotifications(user);await ensureMaintenanceNotifications(user)}
