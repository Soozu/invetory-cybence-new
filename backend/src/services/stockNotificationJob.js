import { prisma } from '../config/prisma.js'
import { deliverNotifications } from './notificationDelivery.js'
import { publicUser } from '../middleware/auth.js'
import { warehouseWhere } from './warehouseAccessService.js'
import { ensureUserNotifications } from './notificationService.js'
const select={id:true,role:{include:{permissions:{include:{permission:true}}}},warehouseAssignments:true}
export async function reminderJob(){
  let cursor
  do{const rows=await prisma.user.findMany({where:{status:'ACTIVE'},select,take:100,orderBy:{id:'asc'},...(cursor?{cursor:{id:cursor},skip:1}:{})});for(const row of rows)await ensureUserNotifications(publicUser(row));cursor=rows.length===100?rows.at(-1).id:null}while(cursor)
}
export async function stockNotificationJob(){
  let userCursor
  do{const users=await prisma.user.findMany({where:{status:'ACTIVE'},select,take:100,orderBy:{id:'asc'},...(userCursor?{cursor:{id:userCursor},skip:1}:{})})
    for(const row of users){const user=publicUser(row);if(user.role!=='Administrator'&&!user.permissions.includes('inventory.VIEW'))continue
      let cursor
      do{const stocks=await prisma.warehouseStock.findMany({where:{...warehouseWhere(user),product:{status:'ACTIVE'}},include:{product:{select:{id:true,name:true,reorderPoint:true,minimumStock:true}}},orderBy:{id:'asc'},take:100,...(cursor?{cursor:{id:cursor},skip:1}:{})}),data=[]
        for(const stock of stocks){const available=stock.quantity-stock.reservedQuantity,threshold=stock.product.reorderPoint||stock.product.minimumStock;if(available>threshold)continue
          const type=available<=0?'OUT_OF_STOCK':'LOW_STOCK'
          data.push({userId:user.id,warehouseId:stock.warehouseId,type,title:available<=0?'Out of stock':'Low stock',message:`${stock.product.name}: ${available} available units.`,referenceType:'Product',referenceId:stock.product.id,dedupeKey:`stock-daily:${user.id}:${stock.id}:${type}:${new Date().toISOString().slice(0,10)}`})
        }
        await deliverNotifications(prisma,data);cursor=stocks.length===100?stocks.at(-1).id:null
      }while(cursor)
    }userCursor=users.length===100?users.at(-1).id:null
  }while(userCursor)
}
