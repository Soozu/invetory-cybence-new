import { prisma } from '../config/prisma.js'
import { inventoryTransaction } from './inventoryService.js'
import { HttpError } from '../utils/http.js'
import { canAccessWarehouse, requireWarehouseAccess } from './warehouseAccessService.js'
import { preferencesSchema, defaultNotifications, defaultDashboard } from '../validators/preferences.js'

export async function getPreferences(user){
  const row=await prisma.userPreference.findUnique({where:{userId:user.id}})
  const dashboard=row?.dashboard||defaultDashboard()
  let effectiveWarehouseId=dashboard.defaultWarehouseId,warehouseWarning=null
  if(effectiveWarehouseId&&(!canAccessWarehouse(user,effectiveWarehouseId)||(await prisma.warehouse.findUnique({where:{id:effectiveWarehouseId},select:{status:true}}))?.status!=='ACTIVE')){
    effectiveWarehouseId=null;warehouseWarning='Your saved warehouse is no longer available. The dashboard shows your currently accessible warehouses.'
  }
  return {revision:row?.revision||0,notifications:row?.notifications||defaultNotifications(),dashboard,effectiveWarehouseId,warehouseWarning,channels:['inApp']}
}
export async function updatePreferences(input,user){
  const v=preferencesSchema.parse(input)
  if(v.dashboard.defaultWarehouseId){
    requireWarehouseAccess(user,v.dashboard.defaultWarehouseId)
    if((await prisma.warehouse.findUnique({where:{id:v.dashboard.defaultWarehouseId},select:{status:true}}))?.status!=='ACTIVE')throw new HttpError(400,'Default warehouse is not active.')
  }
  try{
    await inventoryTransaction(async tx=>{
      const data={notifications:v.notifications,dashboard:v.dashboard}
      if(v.expectedRevision===0){
        if(await tx.userPreference.findUnique({where:{userId:user.id}}))throw new HttpError(409,'Preferences changed. Reload before saving.')
        await tx.userPreference.create({data:{...data,userId:user.id}})
      }else{
        const changed=await tx.userPreference.updateMany({where:{userId:user.id,revision:v.expectedRevision},data:{...data,revision:{increment:1}}})
        if(changed.count!==1)throw new HttpError(409,'Preferences changed. Reload before saving.')
      }
    })
  }catch(error){if(error.code==='P2002')throw new HttpError(409,'Preferences changed. Reload before saving.');throw error}
  return getPreferences(user)
}
