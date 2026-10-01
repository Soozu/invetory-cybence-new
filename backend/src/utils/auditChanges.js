import { Prisma } from '@prisma/client'
// Explicit scalar allowlists. Never serialize whole records, request bodies,
// authentication objects, free-form notes, or arbitrary nested metadata.
const fields={
  product:['name','sku','barcode','categoryId','brandId','defaultSupplierId','minimumStock','maximumStock','reorderPoint','purchaseCost','warrantyMonths','trackSerialNumbers','status'],
  supplier:['companyName','supplierCode','status','paymentTerms'],
  category:['name','slug','parentId','status'],brand:['name','slug','status'],warehouse:['name','code','status','managerId'],
  purchaseorder:['supplierId','warehouseId','status','subtotal','tax','shipping','total','expectedDelivery'],
  purchaserequest:['warehouseId','department','requiredDate','status','purchaseOrderId'],
  rfq:['warehouseId','status','closingDate','selectedQuotationId'],supplierquotation:['supplierId','status','subtotal','tax','shipping','total','deliveryDays','quotationDate','validUntil'],
  supplierreturn:['status','supplierId','receiptId','warehouseId','returnedAt','completedAt'],
  stocktransfer:['status','sourceWarehouseId','destinationWarehouseId','shippedAt','receivedAt'],
  stockcount:['status','warehouseId','startedAt','submittedAt','approvedAt'],inventoryreservation:['status','warehouseId','expiresAt'],
  stockconditionchange:['quantity','reservedQuantity','quarantineQuantity','defectiveQuantity','forRepairQuantity','returnPendingQuantity'],
  stockadjustment:['quantity','reservedQuantity'],serialnumber:['status','warehouseId','warrantyStart','warrantyEnd'],
  asset:['status','warehouseId','purchaseDate','purchaseCost','assetTag'],
  maintenancerecord:['status','cost','serviceDate','completedDate','inspectionResult','kind'],
  preventivemaintenanceplan:['status','intervalDays','nextDueAt'],warrantyclaim:['status','outcome','providerReference','maintenanceId','supplierReturnId'],
  user:['firstName','lastName','roleId','warehouseId','status'],role:['name'],
  systemsetting:['companyName','defaultMinimumStock','defaultWarehouseId','lowStockNotifications','warrantyNotifications','weeklySummary']
}
const scalar=value=>{
  if(value==null)return null
  if(value instanceof Date)return value.toISOString()
  if(typeof value==='boolean'||typeof value==='number')return value
  if(typeof value==='string')return value.slice(0,500)
  if(Prisma.Decimal.isDecimal(value))return value.toFixed(2)
  return null
}
export function safeAuditChanges(entityType,before,after){
  if(before===undefined||after===undefined)return null
  const keys=fields[String(entityType||'').toLowerCase()]||[]
  return keys.flatMap(field=>{const a=scalar(before?.[field]),b=scalar(after?.[field]);return a===b?[]:[{field,before:a,after:b}]})
}
