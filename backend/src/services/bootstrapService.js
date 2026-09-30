import { warehouseWhere, transferWhere, serialWhere, activityWhere } from './warehouseAccessService.js'
import { prisma } from '../config/prisma.js'
import { summary } from './dashboardService.js'
import { readSettings, userScope } from './managementService.js'
import { ensureWarrantyNotifications } from './notificationService.js'

const day = value => value ? value.toISOString().slice(0, 10) : ''
const dateTime = value => value ? value.toISOString().slice(0, 16).replace('T', ' ') : ''
const label = value => value?.toLowerCase().split('_').map(part => part[0].toUpperCase() + part.slice(1)).join(' ') || ''
const productKind = category => ({ Components: 'gpu', Storage: 'storage', Networking: 'network', 'Power Equipment': 'power', Servers: 'server', CCTV: 'camera', Printers: 'printer', Laptops: 'laptop', Computers: 'desktop', Software: 'software' })[category] || 'accessory'

export async function bootstrap(user) {
  const can = module => user.role === 'Administrator' || user.permissions.includes(`${module}.VIEW`)
  const productAccess = ['products', 'inventory', 'stock_counts', 'reservations', 'purchase_requests', 'rfqs', 'warehouses', 'purchasing', 'assets', 'dashboard', 'reports'].some(can)
  const transferDestinations = user.role === 'Administrator' || user.permissions.includes('inventory.CREATE')
    ? await prisma.warehouse.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } }) : []
  await ensureWarrantyNotifications(user)
  const [productRows, categoryRows, brandRows, warehouseRows, supplierRows, orderRows, transferRows,
    movementRows, serialRows, assetRows, maintenanceRows, userRows, logRows, notificationRows,
    roleRows, permissionRows, settings, dashboardSummary] = await Promise.all([
    prisma.product.findMany({ include: { category: true, brand: true, defaultSupplier: true, stocks: { where: warehouseWhere(user), include: { warehouse: true } } }, orderBy: { createdAt: 'desc' } }),
    prisma.category.findMany({ include: { children: true }, orderBy: { name: 'asc' } }),
    prisma.brand.findMany({ orderBy: { name: 'asc' } }),
    prisma.warehouse.findMany({ where: warehouseWhere(user, undefined, 'id'), include: { manager: true, stock: { include: { product: true } } }, orderBy: { name: 'asc' } }),
    prisma.supplier.findMany({ include: { _count: { select: { products: true, purchaseOrders: { where: warehouseWhere(user) } } } }, orderBy: { companyName: 'asc' } }),
    prisma.purchaseOrder.findMany({ where: warehouseWhere(user), include: { supplier: true, warehouse: true, createdBy: true, items: true }, orderBy: { createdAt: 'desc' } }),
    prisma.stockTransfer.findMany({ where: transferWhere(user), include: { sourceWarehouse: true, destinationWarehouse: true, requestedBy: true, items: true }, orderBy: { createdAt: 'desc' } }),
    prisma.stockMovement.findMany({ where: warehouseWhere(user), include: { sourceWarehouse: true, destinationWarehouse: true, warehouse: true, user: true }, orderBy: { createdAt: 'desc' }, take: 500 }),
    prisma.serialNumber.findMany({ where: serialWhere(user), include: { warehouse: true, supplier: true, purchaseOrderItem: { include: { purchaseOrder: true } }, asset: { include: { assignments: { where: { status: 'ACTIVE' } } } } }, orderBy: { createdAt: 'desc' } }),
    prisma.asset.findMany({ where: warehouseWhere(user), include: { product: true, serialNumber: true, assignments: { orderBy: { createdAt: 'desc' } } }, orderBy: { createdAt: 'desc' } }),
    prisma.maintenanceRecord.findMany({ where: { asset: warehouseWhere(user) }, include: { asset: { include: { serialNumber: true } } }, orderBy: { createdAt: 'desc' } }),
    prisma.user.findMany({ where: userScope(user), include: { role: true, warehouse: true, warehouseAssignments: { include: { warehouse: { select: { id: true, name: true } } } } }, orderBy: { createdAt: 'desc' } }),
    prisma.activityLog.findMany({ where: activityWhere(user), include: { user: true }, orderBy: { createdAt: 'desc' }, take: 500 }),
    prisma.notification.findMany({ where: { userId: user.id, ...warehouseWhere(user) }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.role.findMany({ include: { permissions: { include: { permission: true } } } }),
    prisma.permission.findMany(),
    readSettings(), summary(user)
  ])
  const products = productRows.map(row => {
    const stock = row.stocks.reduce((sum, item) => sum + item.quantity, 0)
    const reserved = row.stocks.reduce((sum, item) => sum + item.reservedQuantity, 0)
    const primary = [...row.stocks].sort((a, b) => b.quantity - a.quantity)[0]
    return {
      id: row.id, name: row.name, sku: row.sku, barcode: row.barcode || '',
      category: row.category.name, brand: row.brand.name, model: row.model || '',
      stock, reserved, inWarehouseScope: row.stocks.length > 0, min: row.minimumStock, max: row.maximumStock,
      reorder: row.reorderPoint, cost: Number(row.purchaseCost),
      warehouse: primary?.warehouse.name || '', supplier: row.defaultSupplier?.companyName || '',
      warranty: row.warrantyMonths ? `${row.warrantyMonths} Months` : 'No warranty',
      serialTracking: row.trackSerialNumbers, kind: productKind(row.category.name),
      image: row.image || '', description: row.description || '', unit: row.unit,
      created: day(row.createdAt), inactive: row.status !== 'ACTIVE', status: row.status
    }
  })
  const stockLocations = Object.fromEntries(productRows.map(row => [row.id, Object.fromEntries(row.stocks.map(stock => [stock.warehouse.name, stock.quantity]))]))
  const stockBalances = Object.fromEntries(productRows.map(row => [row.id, row.stocks.map(stock => ({ warehouseId: stock.warehouseId, warehouse: stock.warehouse.name, quantity: stock.quantity, reservedQuantity: stock.reservedQuantity, availableQuantity: stock.quantity - stock.reservedQuantity }))]))
  const categories = categoryRows.map(row => ({
    id: row.id, name: row.name, parent: categoryRows.find(parent => parent.id === row.parentId)?.name || '',
    description: row.description || (row.parentId ? `Subcategory of ${categoryRows.find(parent => parent.id === row.parentId)?.name || 'another category'}` : ''),
    status: label(row.status), children: row.children.map(child => child.name),
    products: productRows.filter(product => product.categoryId === row.id).length,
    stock: productRows.filter(product => product.categoryId === row.id).reduce((sum, product) => sum + product.stocks.reduce((subtotal, item) => subtotal + item.quantity, 0), 0)
  }))
  const brands = brandRows.map(row => ({
    id: row.id, name: row.name, status: label(row.status), logo: row.logo || '',
    products: productRows.filter(product => product.brandId === row.id).length,
    stock: productRows.filter(product => product.brandId === row.id).reduce((sum, product) => sum + product.stocks.reduce((subtotal, item) => subtotal + item.quantity, 0), 0)
  }))
  const warehouses = warehouseRows.map(row => ({
    id: row.id, name: row.name, location: row.address || '', code: row.code,
    manager: row.manager ? `${row.manager.firstName} ${row.manager.lastName}` : 'Unassigned',
    status: row.status === 'ACTIVE' ? 'Operational' : 'Inactive',
    products: new Set(row.stock.filter(item => item.quantity > 0).map(item => item.productId)).size,
    units: row.stock.reduce((sum, item) => sum + item.quantity, 0),
    value: row.stock.reduce((sum, item) => sum + item.quantity * Number(item.product.purchaseCost), 0)
  }))
  const suppliers = supplierRows.map(row => ({
    id: row.id, name: row.companyName, contact: row.contactPerson || '',
    email: row.email || '', phone: row.phone || '', address: row.address || '',
    taxId: row.taxId || '', terms: row.paymentTerms || '', notes: row.notes || '',
    products: row._count.products, orders: row._count.purchaseOrders, status: label(row.status)
  }))
  const orders = orderRows.map(row => ({
    id: row.id, number: row.poNumber, supplier: row.supplier.companyName,
    warehouse: row.warehouse.name, items: row.items.length, amount: Number(row.total),
    subtotal: Number(row.subtotal), tax: Number(row.tax), shipping: Number(row.shipping),
    date: day(row.orderDate), expected: day(row.expectedDelivery), status: label(row.status),
    createdBy: `${row.createdBy.firstName} ${row.createdBy.lastName}`,
    reference: row.reference || '', notes: row.notes || '',
    lines: row.items.map(item => ({ id: item.id, productId: item.productId, quantity: item.quantity, received: item.receivedQuantity, cost: Number(item.unitCost) }))
  }))
  const transfers = transferRows.map(row => ({
    id: row.id, number: row.transferNumber, sourceWarehouseId: row.sourceWarehouseId, destinationWarehouseId: row.destinationWarehouseId, from: row.sourceWarehouse.name,
    to: row.destinationWarehouse.name, items: row.items.length,
    productId: row.items[0]?.productId, quantity: row.items[0]?.quantity || 0,
    requestedBy: `${row.requestedBy.firstName} ${row.requestedBy.lastName}`,
    date: day(row.requestedAt), status: label(row.status), notes: row.notes || ''
  }))
  const movements = movementRows.map(row => ({
    id: row.id, date: dateTime(row.createdAt), reference: row.referenceNumber,
    productId: row.productId,
    movement: row.type === 'TRANSFER_IN' || row.type === 'TRANSFER_OUT' ? 'Transfer' :
      row.type === 'PURCHASE_RECEIVING' || row.type === 'OPENING_STOCK' ? 'Stock In' : label(row.type),
    quantity: row.quantity, from: row.sourceWarehouse?.name || (row.quantity < 0 ? row.warehouse.name : '—'),
    to: row.destinationWarehouse?.name || (row.quantity > 0 ? row.warehouse.name : '—'),
    by: row.user ? `${row.user.firstName} ${row.user.lastName}` : 'System', notes: row.notes || ''
  }))
  const serials = serialRows.map(row => ({
    id: row.id, serial: row.serialNumber, productId: row.productId,
    warehouse: row.warehouse?.name || 'Asset pool', po: row.purchaseOrderItem?.purchaseOrder.poNumber || '—',
    supplier: row.supplier?.companyName || '—', start: day(row.warrantyStart), end: day(row.warrantyEnd),
    status: label(row.status), assignedTo: row.asset?.assignments[0]?.assignedTo || '—'
  }))
  const assets = assetRows.map(row => {
    const assignment = row.assignments.find(item => item.status === 'ACTIVE')
    return {
      id: row.id, tag: row.assetTag, productId: row.productId,
      serial: row.serialNumber?.serialNumber || '', assignedTo: assignment?.assignedTo || '',
      department: assignment?.department || '', location: assignment?.location || '',
      purchaseDate: day(row.purchaseDate), dateAssigned: day(assignment?.assignedDate),
      warrantyEnd: day(row.serialNumber?.warrantyEnd), status: label(row.status)
    }
  })
  const maintenance = maintenanceRows.map(row => ({
    id: row.id, asset: row.asset.assetTag, serial: row.asset.serialNumber?.serialNumber || '',
    issue: row.issue, technician: row.technician || '', date: day(row.serviceDate),
    cost: Number(row.cost), status: label(row.status)
  }))
  const users = userRows.map(row => ({
    id: row.id, name: `${row.firstName} ${row.lastName}`, email: row.email,
    role: row.role.name, warehouseIds: row.warehouseAssignments.map(item => item.warehouseId), defaultWarehouseId: row.warehouseAssignments.find(item => item.isDefault)?.warehouseId || '',
    warehouse: row.role.name === 'Administrator' ? 'All warehouses' : row.warehouseAssignments.map(item => item.warehouse.name).join(', ') || 'No warehouse access',
    status: label(row.status), lastLogin: row.lastLoginAt ? dateTime(row.lastLoginAt) : 'Never',
    initials: `${row.firstName[0]}${row.lastName[0]}`.toUpperCase()
  }))
  const logs = logRows.map(row => ({
    id: row.id, date: dateTime(row.createdAt), user: row.user ? `${row.user.firstName} ${row.user.lastName}` : 'System',
    action: label(row.action), module: row.module, description: row.description, ip: row.ipAddress || '—'
  }))
  const notifications = notificationRows.map(row => ({
    id: row.id, title: row.title, message: row.message, time: dateTime(row.createdAt),
    type: row.type.includes('STOCK') ? 'warning' : 'success', read: row.isRead,
    path: row.referenceType === 'Product' ? `/products/${row.referenceId}` :
      row.referenceType === 'SerialNumber' ? '/assets/warranties' :
      row.referenceType === 'StockTransfer' ? '/inventory/transfers' : '/procurement/purchase-orders'
  }))
  const permissions = Object.fromEntries(roleRows.map(row => [row.name, Object.fromEntries(
    row.permissions.reduce((map, item) => {
      const module = item.permission.module[0].toUpperCase() + item.permission.module.slice(1)
      map.set(module, { ...map.get(module), [item.permission.action[0] + item.permission.action.slice(1).toLowerCase()]: true })
      return map
    }, new Map())
  )]))
  return {
    products: productAccess ? products : [], stockLocations: productAccess ? stockLocations : {}, stockBalances: productAccess ? stockBalances : {},
    categories: can('categories') || productAccess ? categories : [], brands: can('brands') || productAccess ? brands : [],
    warehouses: can('warehouses') || productAccess ? warehouses : [],
    suppliers: can('rfqs') || can('suppliers') || can('purchasing') || can('reports') ? suppliers : [],
    orders: can('purchasing') || can('reports') ? orders : [],
    transfers: can('inventory') ? transfers : [], movements: can('inventory') || can('dashboard') || can('reports') ? movements : [],
    serials: can('inventory') || can('assets') || can('reports') ? serials : [],
    assets: can('assets') || can('reports') ? assets : [], maintenance: can('assets') ? maintenance : [],
    users: can('users') ? users : [], logs: can('users') ? logs : [], notifications,
    permissions: can('users') ? permissions : {},
    roles: can('users') ? roleRows.map(role => ({ id: role.id, name: role.name, permissionIds: role.permissions.map(item => item.permissionId) })) : [],
    permissionCatalog: can('users') ? permissionRows.map(permission => ({ id: permission.id, module: permission.module, action: permission.action })) : [],
    settings: can('settings') ? {
      company: settings.companyName || 'TechStock Inventory', logo: settings.companyLogo || '',
      address: settings.address || '', phone: settings.phone || '', email: settings.email || '',
      currency: 'PHP ₱', defaultWarehouse: warehouses.find(row => row.id === settings.defaultWarehouseId)?.name || '',
      lowStockAlerts: settings.lowStockNotifications ?? true,
      warrantyAlerts: settings.warrantyNotifications ?? true,
      weeklySummary: settings.weeklySummary ?? false,
      defaultMinStock: settings.defaultMinimumStock ?? 10
    } : {},
    transferDestinations, defaultWarehouseId: user.defaultWarehouseId,
    dashboardSummary: can('dashboard') ? dashboardSummary : null
  }
}
