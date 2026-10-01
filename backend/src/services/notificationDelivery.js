import { warehouseWhere } from './warehouseAccessService.js'
import { hasPermissions } from './reportCatalog.js'

// Delivery channels are explicit. Only inApp is implemented in this phase.
export const notificationTypes={
  LOW_STOCK:['lowStock','inventory.VIEW'],OUT_OF_STOCK:['outOfStock','inventory.VIEW'],
  PURCHASE_APPROVAL_REQUEST:['purchaseApproval','purchasing.VIEW'],PURCHASE_APPROVED:['purchaseApproval','purchasing.VIEW'],
  PURCHASE_REQUEST_APPROVAL:['purchaseApproval','purchase_requests.VIEW'],PURCHASE_REQUEST_DECISION:['purchaseApproval','purchase_requests.VIEW'],
  TRANSFER_APPROVAL_REQUEST:['transferApproval','inventory.VIEW'],TRANSFER_APPROVED:['transferApproval','inventory.VIEW'],
  TRANSFER_RECEIVED:['transferReceived','inventory.VIEW'],PURCHASE_RECEIVING:['purchaseReceived','purchasing.VIEW'],
  WARRANTY_EXPIRING:['warrantyExpiring','assets.VIEW'],MAINTENANCE_DUE:['maintenanceDue','assets.VIEW'],WARRANTY_CLAIM_UPDATE:['warrantyClaimUpdate','warranty_claims.VIEW']
}
const enabled=(preferences,type)=>{const spec=notificationTypes[type];return spec&&preferences?.[spec[0]]!==false}
export async function notificationWhere(db,user){
  const preferences=await db.userPreference.findUnique({where:{userId:user.id},select:{notifications:true}})
  const types=Object.entries(notificationTypes).filter(([type,[,permission]])=>enabled(preferences?.notifications,type)&&hasPermissions(user,[permission])).map(([type])=>type)
  return {userId:user.id,archivedAt:null,type:{in:types},...warehouseWhere(user)}
}
export async function deliverNotifications(tx,rows){
  if(!rows.length)return {count:0}
  const settings=await tx.systemSetting.findMany({where:{key:{in:['lowStockNotifications','warrantyNotifications']}},select:{key:true,value:true}})
  const setting=Object.fromEntries(settings.map(row=>[row.key,row.value]))
  const users=await tx.user.findMany({where:{id:{in:[...new Set(rows.map(r=>r.userId))]},status:'ACTIVE'},select:{id:true,preferences:{select:{notifications:true}},warehouseAssignments:{select:{warehouseId:true}},role:{select:{name:true,permissions:{include:{permission:true}}}}}})
  const byId=new Map(users.map(row=>[row.id,{...row,permissions:row.role.permissions.map(r=>`${r.permission.module}.${r.permission.action}`),role:row.role.name}]))
  const data=rows.filter(row=>{
    const user=byId.get(row.userId),spec=notificationTypes[row.type]
    if(['LOW_STOCK','OUT_OF_STOCK'].includes(row.type)&&setting.lowStockNotifications==='false')return false
    if(row.type==='WARRANTY_EXPIRING'&&setting.warrantyNotifications==='false')return false
    return user&&enabled(user.preferences?.notifications,row.type)&&hasPermissions(user,[spec[1]])&&(user.role==='Administrator'||row.warehouseId&&user.warehouseAssignments.some(w=>w.warehouseId===row.warehouseId))
  })
  if(!data.length)return {count:0}
  return tx.notification.createMany({data,skipDuplicates:true})
}
// Adapter preserves existing call sites while all producers share preferences.
export const notificationWriter=tx=>({create:({data})=>deliverNotifications(tx,[data]),createMany:({data})=>deliverNotifications(tx,data)})
