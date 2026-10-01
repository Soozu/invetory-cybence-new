import { z } from 'zod'
import { prisma } from '../config/prisma.js'
import { warehouseWhere,transferWhere,serialWhere } from './warehouseAccessService.js'
import { hasPermissions } from './reportCatalog.js'

const schema=z.object({q:z.string().trim().min(2).max(100),perType:z.coerce.number().int().min(1).max(5).default(3)}).strict()
export async function search(input,user){
  const {q,perType}=schema.parse(input),scope=warehouseWhere(user),contains={contains:q}
  const jobs=[]
  const add=(type,permission,model,where,select,title,subtitle,route)=>{
    if(!hasPermissions(user,[permission]))return
    jobs.push((async()=>{const [rows,total]=await prisma.$transaction([prisma[model].findMany({where,select,take:perType,orderBy:{id:'asc'}}),prisma[model].count({where})]);return {type,total,hasMore:total>rows.length,results:rows.map(r=>({type,id:r.id,title:title(r),subtitle:subtitle(r),route:route(r)}))}})())
  }
  add('Product','products.VIEW','product',{OR:[{name:contains},{sku:contains},{barcode:contains}]},{id:true,name:true,sku:true,barcode:true},r=>r.name,r=>`${r.sku}${r.barcode?` · ${r.barcode}`:''}`,r=>`/products/${r.id}`)
  add('Serial number','inventory.VIEW','serialNumber',{AND:[serialWhere(user),{serialNumber:contains}]},{id:true,serialNumber:true,status:true},r=>r.serialNumber,r=>r.status,r=>`/serial-numbers/${r.id}`)
  add('Asset','assets.VIEW','asset',{...scope,assetTag:contains},{id:true,assetTag:true,status:true},r=>r.assetTag,r=>r.status,r=>`/assets/${r.id}`)
  add('Supplier','suppliers.VIEW','supplier',{OR:[{companyName:contains},{supplierCode:contains}]},{id:true,companyName:true,supplierCode:true},r=>r.companyName,r=>r.supplierCode,r=>`/procurement/suppliers/${r.id}`)
  add('Purchase request','purchase_requests.VIEW','purchaseRequest',{...scope,prNumber:contains},{id:true,prNumber:true,status:true},r=>r.prNumber,r=>r.status,r=>`/procurement/purchase-requests/${r.id}`)
  add('RFQ','rfqs.VIEW','rFQ',{...scope,rfqNumber:contains},{id:true,rfqNumber:true,status:true},r=>r.rfqNumber,r=>r.status,r=>`/procurement/rfqs/${r.id}`)
  add('Quotation','rfqs.VIEW','supplierQuotation',{rfq:scope,OR:[{quotationNumber:contains},{supplierReference:contains}]},{id:true,quotationNumber:true,rfqId:true,status:true},r=>r.quotationNumber,r=>r.status,r=>`/procurement/rfqs/${r.rfqId}/quotations/${r.id}`)
  add('Purchase order','purchasing.VIEW','purchaseOrder',{...scope,poNumber:contains},{id:true,poNumber:true,status:true},r=>r.poNumber,r=>r.status,r=>`/procurement/purchase-orders/${r.id}`)
  add('Receipt','purchasing.VIEW','purchaseReceipt',{...scope,receiptNumber:contains},{id:true,receiptNumber:true,receivedAt:true},r=>r.receiptNumber,r=>r.receivedAt.toISOString().slice(0,10),r=>`/procurement/receipts/${r.id}`)
  add('Transfer','inventory.VIEW','stockTransfer',{AND:[transferWhere(user),{transferNumber:contains}]},{id:true,transferNumber:true,status:true},r=>r.transferNumber,r=>r.status,r=>`/inventory/transfers/${r.id}`)
  add('Warranty claim','warranty_claims.VIEW','warrantyClaim',{...scope,claimNumber:contains},{id:true,claimNumber:true,status:true},r=>r.claimNumber,r=>r.status,r=>`/assets/warranty-claims/${r.id}`)
  const groups=await Promise.all(jobs)
  return {query:q,groups:groups.filter(g=>g.total>0),data:groups.flatMap(g=>g.results),total:groups.reduce((n,g)=>n+g.total,0),perType}
}
