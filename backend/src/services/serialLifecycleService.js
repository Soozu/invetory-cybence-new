import { prisma } from '../config/prisma.js'
import { serialWhere, activityWhere, canAccessWarehouse } from './warehouseAccessService.js'
import { paginate } from '../utils/query.js'
import { HttpError } from '../utils/http.js'

const can = (user, module) => user.role === 'Administrator' || user.permissions.includes(`${module}.VIEW`)
export async function getSerialLifecycle(id, user) {
  const row = await prisma.serialNumber.findFirst({ where: { AND: [{ id }, serialWhere(user)] }, include: {
    product: { select: { id: true, name: true, sku: true, model: true } },
    warehouse: { select: { id: true, name: true, code: true } },
    supplier: { select: { id: true, companyName: true, supplierCode: true } },
    purchaseOrderItem: { select: { purchaseOrder: { select: { id: true, poNumber: true, warehouseId: true } } } },
    receipt: { select: { id: true, receiptNumber: true, warehouseId: true, receivedAt: true } },
    asset: { select: { id: true, assetTag: true, status: true, warehouseId: true, warehouse: { select: { id: true, name: true, code: true } }, assignments: { where: { status: 'ACTIVE' }, select: { assignedTo: true, department: true, location: true, assignedDate: true }, take: 1 } } }
  } })
  if (!row) {
    if (await prisma.serialNumber.count({ where: { id } })) throw new HttpError(403, 'You do not have access to this serial number.')
    throw new HttpError(404, 'Serial number not found.')
  }
  const order = row.purchaseOrderItem?.purchaseOrder
  return {
    id: row.id, serialNumber: row.serialNumber, product: row.product, status: row.status,
    warehouse: row.warehouse, supplier: row.supplier,
    purchaseOrder: order && can(user, 'purchasing') && canAccessWarehouse(user, order.warehouseId) ? order : null,
    receipt: row.receipt && can(user, 'purchasing') && canAccessWarehouse(user, row.receipt.warehouseId) ? row.receipt : null,
    warrantyStart: row.warrantyStart, warrantyEnd: row.warrantyEnd, registeredAt: row.createdAt,
    asset: row.asset && can(user, 'assets') && canAccessWarehouse(user, row.asset.warehouseId) ? row.asset : null,
    historyNotice: 'Lifecycle events are recorded from this feature’s installation. Earlier events without exact links are not reconstructed.'
  }
}

export async function listSerialEvents(id, query, user) {
  await getSerialLifecycle(id, user)
  // A serial moving into an accessible warehouse does not reveal events in other warehouses.
  const moduleScope = { AND: [activityWhere(user),
    ...(!can(user, 'assets') ? [{ OR: [{ referenceType: null }, { referenceType: { notIn: ['Asset', 'AssetAssignment', 'MaintenanceRecord'] } }] }] : []),
    ...(!can(user, 'purchasing') ? [{ OR: [{ referenceType: null }, { referenceType: { not: 'PurchaseReceipt' } }] }] : []),
    ...(!can(user, 'supplier_returns') ? [{ OR: [{ referenceType: null }, { referenceType: { not: 'SupplierReturn' } }] }] : []),
    ...(!can(user, 'warranty_claims') ? [{ OR: [{ referenceType: null }, { referenceType: { not: 'WarrantyClaim' } }] }] : [])
  ] }
  return paginate(prisma.serialEvent, { where: { serialNumberId: id, ...moduleScope },
    include: { user: { select: { firstName: true, lastName: true } }, warehouse: { select: { name: true, code: true } }, relatedWarehouse: { select: { name: true, code: true } } },
    query, allowedSort: ['occurredAt'], defaultSort: 'occurredAt' })
}
