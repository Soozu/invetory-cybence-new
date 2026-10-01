import { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma.js'
import { HttpError } from '../utils/http.js'
import { warehouseWhere, transferWhere, serialWhere, getAccessibleWarehouseIds } from './warehouseAccessService.js'
import { requireReport,hasPermissions } from './reportCatalog.js'
import { supplierPerformance } from './replenishmentService.js'
import { reportQuery } from '../validators/reporting.js'

const day = value => value ? value.toISOString().slice(0,10) : null
const money = value => value == null ? null : new Prisma.Decimal(value).toFixed(2)
const productWhere = q => ({ ...(q.category ? { categoryId:q.category } : {}), ...(q.brand ? { brandId:q.brand } : {}), ...(q.supplier ? { defaultSupplierId:q.supplier } : {}) })
const range = q => q.dateFrom || q.dateTo ? { ...(q.dateFrom ? { gte:new Date(q.dateFrom) } : {}), ...(q.dateTo ? { lte:new Date(`${q.dateTo}T23:59:59.999Z`) } : {}) } : undefined
export function reportOptions(kind, input, user) {
  const spec = requireReport(user,kind), q = reportQuery.parse(input)
  for (const key of ['warehouse','category','brand','supplier','dateFrom','dateTo']) if (q[key] && !spec.filters.includes(key)) throw new HttpError(400, `This report does not support ${key}.`)
  warehouseWhere(user,q.warehouse)
  q.sortBy ||= spec.defaultSort; q.sortOrder ||= spec.defaultOrder
  if (!spec.sorts.includes(q.sortBy)) throw new HttpError(400,'Unsupported sort column.')
  const columns = q.columns ? q.columns.split(',') : spec.columns.map(c=>c.key)
  if (!columns.length || new Set(columns).size!==columns.length || columns.some(key=>!spec.columns.some(c=>c.key===key))) throw new HttpError(400,'Invalid report columns.')
  if (['fast-moving','slow-moving','supplier-performance'].includes(kind)) {
    q.dateTo ||= day(new Date())
    q.dateFrom ||= day(new Date(new Date(q.dateTo).getTime()-89*86400000))
    if (q.dateFrom>q.dateTo) throw new HttpError(400,'Start date must be on or before end date.')
  }
  return { q, spec, columns }
}
async function stockReport(kind,q) {
  const ids = q.warehouse ? [q.warehouse] : getAccessibleWarehouseIds(q.user)
  const predicates = [Prisma.sql`1=1`]
  if (ids!==null) predicates.push(ids.length ? Prisma.sql`s.warehouseId IN (${Prisma.join(ids)})` : Prisma.sql`1=0`)
  if(q.category) predicates.push(Prisma.sql`p.categoryId=${q.category}`)
  if(q.brand) predicates.push(Prisma.sql`p.brandId=${q.brand}`)
  if(q.supplier) predicates.push(Prisma.sql`p.defaultSupplierId=${q.supplier}`)
  if(kind==='low-stock') predicates.push(Prisma.sql`p.status='ACTIVE' AND s.quantity-s.reservedQuantity>0 AND s.quantity-s.reservedQuantity<=IF(p.reorderPoint>0,p.reorderPoint,p.minimumStock)`)
  if(kind==='out-of-stock') predicates.push(Prisma.sql`p.status='ACTIVE' AND s.quantity-s.reservedQuantity=0`)
  const last = Prisma.sql`(SELECT MAX(m.createdAt) FROM StockMovement m WHERE m.productId=s.productId AND m.warehouseId=s.warehouseId AND m.quantity>0 AND m.createdAt<=${q.now})`
  const demand = ['fast-moving','slow-moving'].includes(kind) ? Prisma.sql`(SELECT COALESCE(SUM(-m.quantity),0) FROM StockMovement m WHERE m.productId=s.productId AND m.warehouseId=s.warehouseId AND m.quantity<0 AND m.type IN ('STOCK_OUT','ASSET_ASSIGNMENT') AND m.createdAt>=${new Date(q.dateFrom)} AND m.createdAt<=${new Date(`${q.dateTo}T23:59:59.999Z`)})` : Prisma.sql`0`
  const from = Prisma.sql`FROM WarehouseStock s JOIN Product p ON p.id=s.productId JOIN Warehouse w ON w.id=s.warehouseId WHERE ${Prisma.join(predicates,' AND ')}`
  // Every SQL identifier and direction comes from these fixed maps, never request text.
  const orders = { sku:Prisma.sql`sku`,quantity:Prisma.sql`quantity`,value:Prisma.sql`value`,ageDays:Prisma.sql`ageDays`,demandUnits:Prisma.sql`demandUnits` }
  const direction = q.sortOrder==='asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`
  const [rows, totals] = await prisma.$transaction([
    prisma.$queryRaw(Prisma.sql`SELECT s.id,p.sku,p.name AS product,w.name AS warehouse,s.quantity,s.quantity-s.reservedQuantity AS available,p.purchaseCost AS cost,s.quantity*p.purchaseCost AS value,${last} AS lastInbound,TIMESTAMPDIFF(DAY,${last},${q.now}) AS ageDays,${demand} AS demandUnits ${from} ORDER BY ${orders[q.sortBy]} ${direction},s.id ASC LIMIT ${q.limit} OFFSET ${(q.page-1)*q.limit}`),
    prisma.$queryRaw(Prisma.sql`SELECT COUNT(*) AS total ${from}`)
  ], { isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead })
  return { rows:rows.map(r=>({...r,quantity:Number(r.quantity),available:Number(r.available),cost:money(r.cost),value:money(r.value),lastInbound:day(r.lastInbound),ageDays:r.ageDays==null?null:Number(r.ageDays),demandUnits:Number(r.demandUnits)})), total:Number(totals[0].total) }
}
export async function enhancedReport(kind,input,user) {
  const {q,spec,columns} = reportOptions(kind,input,user), scope=warehouseWhere(user,q.warehouse), product=productWhere(q), dates=range(q), now=new Date()
  let result
  if(['inventory-summary','warehouse-stock','inventory-valuation','inventory-aging','fast-moving','slow-moving','low-stock','out-of-stock'].includes(kind)) result=await stockReport(kind,{...q,user,now})
  else if(kind==='supplier-performance') {
    const performance=await supplierPerformance(q,user)
    const rows=performance.data.map(r=>({...r,supplier:r.supplier.companyName,id:r.supplier.id}))
    rows.sort((a,b)=>{const x=a[q.sortBy],y=b[q.sortBy];if(x==null||y==null)return x==null?(y==null?0:1):-1;const diff=typeof x==='string'?x.localeCompare(y):x-y;return (q.sortOrder==='asc'?diff:-diff)||a.id.localeCompare(b.id)})
    result={rows:rows.slice((q.page-1)*q.limit,q.page*q.limit),total:rows.length}
  } else {
    let model,where,include,map,orderBy={[q.sortBy]:q.sortOrder}
    switch(kind){
      case 'stock-movement': model='stockMovement';where={...scope,product,...(dates?{createdAt:dates}:{})};include={product:true,warehouse:true};map=r=>({id:r.id,reference:r.referenceNumber,sku:r.product.sku,warehouse:r.warehouse.name,type:r.type,quantity:r.quantity,previous:r.previousQuantity,current:r.newQuantity,createdAt:r.createdAt.toISOString()});break
      case 'stock-adjustment': model='stockAdjustment';where={...scope,product,...(dates?{createdAt:dates}:{})};include={product:true,warehouse:true};map=r=>({id:r.id,reference:r.referenceNumber,sku:r.product.sku,warehouse:r.warehouse.name,type:r.type,quantity:r.quantity,reason:r.reason,createdAt:r.createdAt.toISOString()});break
      case 'cycle-count-variance': model='stockCountItem';where={stockCount:{...scope,...(dates?{createdAt:dates}:{})}};include={stockCount:{include:{warehouse:true}},product:true};orderBy=q.sortBy==='createdAt'?{stockCount:{createdAt:q.sortOrder}}:orderBy;map=r=>({id:r.id,reference:r.stockCount.countNumber,sku:r.product.sku,warehouse:r.stockCount.warehouse.name,status:r.stockCount.status,expected:r.expectedQuantity,counted:r.countedQuantity,variance:r.variance,createdAt:r.stockCount.createdAt.toISOString()});break
      case 'transfer-discrepancy': model='transferDiscrepancy';where={transfer:transferWhere(user,q.warehouse),...(dates?{createdAt:dates}:{})};include={transfer:{include:{sourceWarehouse:true,destinationWarehouse:true}},transferItem:{include:{product:true}}};map=r=>({id:r.id,reference:r.transfer.transferNumber,sku:r.transferItem.product.sku,source:r.transfer.sourceWarehouse.name,destination:r.transfer.destinationWarehouse.name,kind:r.kind,quantity:r.quantity,resolved:r.resolvedQuantity,createdAt:r.createdAt.toISOString()});break
      case 'purchase-request': model='purchaseRequest';where={...scope,...(dates?{createdAt:dates}:{})};include={warehouse:true,_count:{select:{items:true}}};map=r=>({id:r.id,reference:r.prNumber,warehouse:r.warehouse.name,department:r.department,status:r.status,lineCount:r._count.items,createdAt:r.createdAt.toISOString()});break
      case 'rfq': model='rFQ';where={...scope,...(dates?{createdAt:dates}:{})};include={warehouse:true,_count:{select:{quotations:true}}};map=r=>({id:r.id,reference:r.rfqNumber,warehouse:r.warehouse.name,status:r.status,closingDate:day(r.closingDate),quotations:r._count.quotations,createdAt:r.createdAt.toISOString()});break
      case 'supplier-comparison': model='supplierQuotation';where={rfq:scope,...(q.supplier?{supplierId:q.supplier}:{}),...(dates?{quotationDate:dates}:{})};include={rfq:{include:{warehouse:true}},supplier:true};map=r=>({id:r.id,reference:r.quotationNumber,rfq:r.rfq.rfqNumber,supplier:r.supplier.companyName,warehouse:r.rfq.warehouse.name,status:r.status,total:money(r.total),deliveryDays:r.deliveryDays,quotationDate:day(r.quotationDate)});break
      case 'supplier-purchases': model='purchaseOrder';where={...scope,...(q.supplier?{supplierId:q.supplier}:{}),...(dates?{orderDate:dates}:{})};include={supplier:true,warehouse:true};map=r=>({id:r.id,reference:r.poNumber,supplier:r.supplier.companyName,warehouse:r.warehouse.name,status:r.status,total:money(r.total),orderDate:day(r.orderDate)});break
      case 'supplier-return': model='supplierReturn';where={...scope,...(q.supplier?{supplierId:q.supplier}:{}),...(dates?{createdAt:dates}:{})};include={supplier:true,warehouse:true,items:{select:{quantity:true}}};map=r=>({id:r.id,reference:r.returnNumber,supplier:r.supplier.companyName,warehouse:r.warehouse.name,status:r.status,reason:r.reason,units:r.items.reduce((s,i)=>s+i.quantity,0),createdAt:r.createdAt.toISOString()});break
      case 'assets': model='asset';where={...scope,product};include={product:true,serialNumber:true,warehouse:true};map=r=>({id:r.id,tag:r.assetTag,product:r.product.name,serial:r.serialNumber?.serialNumber||null,warehouse:r.warehouse?.name||null,status:r.status,purchaseDate:day(r.purchaseDate)});break
      case 'asset-assignment-history': model='assetAssignment';where={...scope,...(dates?{assignedDate:dates}:{})};include={asset:true,warehouse:true};map=r=>({id:r.id,tag:r.asset.assetTag,assignedTo:r.assignedTo,department:r.department,warehouse:r.warehouse?.name||null,status:r.status,assignedDate:day(r.assignedDate),returnedDate:day(r.returnedDate)});break
      case 'asset-maintenance-cost': model='maintenanceRecord';where={...scope,...(dates?{createdAt:dates}:{})};include={asset:true,warehouse:true};map=r=>({id:r.id,tag:r.asset.assetTag,warehouse:r.warehouse?.name||null,issue:r.issue,status:r.status,kind:r.kind,cost:money(r.cost),serviceDate:day(r.serviceDate),completedDate:day(r.completedDate),createdAt:r.createdAt.toISOString()});break
      case 'warranties': model='serialNumber';where={AND:[serialWhere(user),...(q.warehouse?[{OR:[{warehouseId:q.warehouse},{asset:{warehouseId:q.warehouse}}]}]:[])],product};include={product:true,warehouse:true,asset:{include:{warehouse:true}}};map=r=>({id:r.id,serial:r.serialNumber,product:r.product.name,warehouse:r.warehouse?.name||r.asset?.warehouse.name||null,status:r.status,warrantyStart:day(r.warrantyStart),warrantyEnd:day(r.warrantyEnd)});break
      case 'warranty-claims': model='warrantyClaim';where={...scope,...(q.supplier?{supplierId:q.supplier}:{}),...(dates?{createdAt:dates}:{})};include={serialNumber:{include:{product:true}},warehouse:true,supplier:true};map=r=>({id:r.id,reference:r.claimNumber,serial:r.serialNumber.serialNumber,product:r.serialNumber.product.name,warehouse:r.warehouse.name,supplier:r.supplier?.companyName||null,status:r.status,outcome:r.outcome,createdAt:r.createdAt.toISOString()});break
      default: throw new HttpError(404,'Report not found.')
    }
    const [records,total]=await prisma.$transaction([prisma[model].findMany({where,include,orderBy:[orderBy,{id:'asc'}],take:q.limit,skip:(q.page-1)*q.limit}),prisma[model].count({where})], {isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead})
    result={rows:records.map(map),total}
  }
  return {data:result.rows.map(row=>Object.fromEntries(columns.map(key=>[key,row[key]??null]))),columns:columns.map(key=>spec.columns.find(c=>c.key===key)),pagination:{page:q.page,limit:q.limit,total:result.total,totalPages:Math.ceil(result.total/q.limit)},basis:spec.basis,generatedAt:now.toISOString(),filters:Object.fromEntries(spec.filters.filter(k=>q[k]).map(k=>[k,q[k]])),sortBy:q.sortBy,sortOrder:q.sortOrder,canExport:hasPermissions(user,['reports.EXPORT'])}
}
