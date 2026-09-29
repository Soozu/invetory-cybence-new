import 'dotenv/config'
import crypto from 'node:crypto'
import bcrypt from 'bcrypt'
import { PrismaClient } from '@prisma/client'
import {
  seedAssets, seedBrands, seedCategories, seedMaintenance, seedOrders, seedTransfers,
  seedProducts, seedSuppliers, seedUsers, seedWarehouses
} from '../../src/data/mockData.js'

const prisma = new PrismaClient()
const date = value => value ? new Date(`${value.slice(0, 10)}T00:00:00.000Z`) : null
const slug = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const warrantyMonths = value => Number.parseInt(value, 10) || 0
const modules = ['dashboard', 'products', 'categories', 'brands', 'inventory', 'suppliers', 'purchasing', 'warehouses', 'assets', 'reports', 'users', 'settings']
const actions = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'EXPORT']
const roleNames = ['Administrator', 'Inventory Manager', 'Warehouse Staff', 'Procurement Officer', 'Asset Manager', 'Viewer']
const status = value => ({ Available: 'AVAILABLE', Assigned: 'ASSIGNED', Reserved: 'RESERVED', 'For Repair': 'FOR_REPAIR', Maintenance: 'MAINTENANCE', 'In Repair': 'IN_REPAIR', Completed: 'COMPLETED', Scheduled: 'SCHEDULED' })[value] || value?.toUpperCase().replaceAll(' ', '_')

async function main() {
  const roles = new Map()
  for (const name of roleNames) roles.set(name, await prisma.role.upsert({ where: { name }, update: {}, create: { name, description: `${name} access` } }))
  const permissions = []
  for (const module of modules) for (const action of actions) {
    const permission = await prisma.permission.upsert({ where: { module_action: { module, action } }, update: {}, create: { module, action } })
    permissions.push(permission)
  }
  const roleModules = {
    'Inventory Manager': ['dashboard', 'products', 'categories', 'brands', 'inventory', 'suppliers', 'warehouses', 'reports'],
    'Warehouse Staff': ['dashboard', 'products', 'inventory', 'warehouses'],
    'Procurement Officer': ['dashboard', 'products', 'suppliers', 'purchasing', 'reports'],
    'Asset Manager': ['dashboard', 'products', 'inventory', 'assets', 'reports'],
    Viewer: modules
  }
  for (const [name, allowedModules] of Object.entries(roleModules)) {
    const allowed = permissions.filter(permission => allowedModules.includes(permission.module) && (name !== 'Viewer' ? true : permission.action === 'VIEW'))
    await prisma.rolePermission.createMany({ data: allowed.map(permission => ({ roleId: roles.get(name).id, permissionId: permission.id })), skipDuplicates: true })
  }
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@techstock.local').toLowerCase()
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin123!'
  const admin = await prisma.user.upsert({
    where: { email: adminEmail }, update: {}, create: {
      firstName: 'TechStock', lastName: 'Admin', email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 12), roleId: roles.get('Administrator').id
    }
  })
  const warehouses = new Map()
  for (const seed of seedWarehouses) warehouses.set(seed.name, await prisma.warehouse.upsert({
    where: { code: seed.code }, update: {}, create: { name: seed.name, code: seed.code, address: seed.location }
  }))
  const users = new Map([['Christian Dela Cruz', admin]])
  for (const seed of seedUsers.filter(user => user.role !== 'Administrator')) {
    const [firstName, ...rest] = seed.name.split(' ')
    const user = await prisma.user.upsert({ where: { email: seed.email }, update: {}, create: {
      firstName, lastName: rest.join(' '), email: seed.email,
      passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString('base64url'), 12),
      roleId: roles.get(seed.role).id, warehouseId: warehouses.get(seed.warehouse)?.id || null
    } })
    users.set(seed.name, user)
  }
  for (const seed of seedWarehouses) if (users.has(seed.manager)) {
    await prisma.warehouse.update({ where: { id: warehouses.get(seed.name).id }, data: { managerId: users.get(seed.manager).id } })
  }
  const categories = new Map()
  for (const seed of seedCategories) {
    const category = await prisma.category.upsert({ where: { name: seed.name }, update: {}, create: { name: seed.name, slug: slug(seed.name), description: seed.description } })
    categories.set(seed.name, category)
    for (const childName of seed.children) await prisma.category.upsert({
      where: { name: childName }, update: {}, create: { name: childName, slug: slug(childName), parentId: category.id }
    })
  }
  const brands = new Map()
  for (const seed of seedBrands) brands.set(seed.name, await prisma.brand.upsert({ where: { name: seed.name }, update: {}, create: { name: seed.name, slug: slug(seed.name) } }))
  const suppliers = new Map()
  for (const [index, seed] of seedSuppliers.entries()) suppliers.set(seed.name, await prisma.supplier.upsert({ where: { companyName: seed.name }, update: {}, create: {
    companyName: seed.name, supplierCode: `SUP-${String(index + 1).padStart(5, '0')}`,
    contactPerson: seed.contact, email: seed.email, phone: seed.phone, address: seed.address,
    taxId: seed.taxId, paymentTerms: seed.terms, notes: seed.notes
  } }))
  const products = new Map()
  for (const seed of seedProducts) {
    const product = await prisma.product.upsert({ where: { sku: seed.sku }, update: {}, create: {
      name: seed.name, sku: seed.sku, barcode: seed.barcode,
      categoryId: categories.get(seed.category).id, brandId: brands.get(seed.brand).id,
      defaultSupplierId: suppliers.get(seed.supplier)?.id, model: seed.model,
      description: seed.description, unit: 'pcs', minimumStock: seed.min,
      maximumStock: seed.max, reorderPoint: seed.reorder, purchaseCost: seed.cost,
      warrantyMonths: warrantyMonths(seed.warranty), trackSerialNumbers: seed.serialTracking,
      status: seed.inactive ? 'INACTIVE' : 'ACTIVE', createdAt: date(seed.created)
    } })
    products.set(seed.id, product)
    if (seed.stock > 0) {
      const warehouse = warehouses.get(seed.warehouse) || warehouses.get('Main Warehouse')
      const existing = await prisma.warehouseStock.findUnique({ where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } } })
      if (!existing) {
        await prisma.warehouseStock.create({ data: { productId: product.id, warehouseId: warehouse.id, quantity: seed.stock, reservedQuantity: seed.reserved } })
        const received = seed.id === 'p2' ? 25 : seed.id === 'p3' ? 8 : 0
        const opening = seed.stock - received
        if (opening > 0) await prisma.stockMovement.create({ data: {
          referenceNumber: `OPEN-${seed.sku}`, productId: product.id, warehouseId: warehouse.id,
          type: 'OPENING_STOCK', quantity: opening, previousQuantity: 0, newQuantity: opening,
          userId: admin.id, notes: 'Development seed opening stock', createdAt: date(seed.created)
        } })
        if (received > 0) await prisma.stockMovement.create({ data: {
          referenceNumber: seed.id === 'p2' ? 'RCV-2026-00341' : 'RCV-2026-00340',
          productId: product.id, warehouseId: warehouse.id, type: 'PURCHASE_RECEIVING',
          quantity: received, previousQuantity: opening, newQuantity: seed.stock,
          userId: admin.id, notes: 'Development seed purchase receipt', createdAt: date('2026-09-29')
        } })
      }
      if (seed.serialTracking) {
        const existingSerials = await prisma.serialNumber.count({ where: { productId: product.id, warehouseId: warehouse.id } })
        if (!existingSerials) await prisma.serialNumber.createMany({ data: Array.from({ length: seed.stock }, (_, index) => {
          const warrantyStart = date(seed.created)
          const warrantyEnd = new Date(warrantyStart)
          warrantyEnd.setUTCMonth(warrantyEnd.getUTCMonth() + warrantyMonths(seed.warranty))
          return {
            serialNumber: `${seed.sku}-${String(index + 1).padStart(5, '0')}`,
            productId: product.id, warehouseId: warehouse.id,
            supplierId: suppliers.get(seed.supplier)?.id,
            warrantyStart, warrantyEnd,
            status: index < seed.reserved ? 'RESERVED' : 'AVAILABLE'
          }
        }) })
      }
    }
  }
  const orders = new Map()
  for (const seed of seedOrders) {
    const existing = await prisma.purchaseOrder.findUnique({ where: { poNumber: seed.number } })
    if (existing) { orders.set(seed.id, existing); continue }
    const lines = seed.lines.map(line => ({
      productId: products.get(line.productId).id, quantity: line.quantity,
      receivedQuantity: line.received, unitCost: line.cost, subtotal: line.quantity * line.cost
    }))
    const subtotal = lines.reduce((sum, line) => sum + line.subtotal, 0)
    const order = await prisma.purchaseOrder.create({ data: {
      poNumber: seed.number, supplierId: suppliers.get(seed.supplier).id,
      warehouseId: warehouses.get(seed.warehouse).id, createdById: admin.id,
      orderDate: date(seed.date), expectedDelivery: date(seed.expected),
      subtotal, total: subtotal, status: status(seed.status), items: { create: lines }
    }, include: { items: true } })
    orders.set(seed.id, order)
    if (['po1', 'po3'].includes(seed.id)) {
      const receiptNumber = seed.id === 'po1' ? 'RCV-2026-00341' : 'RCV-2026-00340'
      await prisma.purchaseReceipt.create({ data: {
        receiptNumber, purchaseOrderId: order.id, warehouseId: order.warehouseId,
        receivedById: admin.id, receivedAt: date('2026-09-29'),
        items: { create: order.items.filter(item => item.receivedQuantity > 0).map(item => ({
          purchaseOrderItemId: item.id, productId: item.productId, quantity: item.receivedQuantity
        })) }
      } })
    }
  }
  for (const seed of seedTransfers) {
    if (await prisma.stockTransfer.findUnique({ where: { transferNumber: seed.number } })) continue
    const product = products.get(seed.productId)
    const source = warehouses.get(seed.from)
    const destination = warehouses.get(seed.to)
    if (!product || !source || !destination) continue
    await prisma.$transaction(async tx => {
      const transferStatus = status(seed.status)
      const transfer = await tx.stockTransfer.create({ data: {
        transferNumber: seed.number, sourceWarehouseId: source.id,
        destinationWarehouseId: destination.id,
        requestedById: users.get(seed.requestedBy)?.id || admin.id,
        approvedById: ['IN_TRANSIT', 'RECEIVED'].includes(transferStatus) ? admin.id : null,
        receivedById: transferStatus === 'RECEIVED' ? admin.id : null,
        requestedAt: date(seed.date), status: transferStatus, notes: seed.notes,
        items: { create: [{ productId: product.id, quantity: seed.quantity,
          receivedQuantity: transferStatus === 'RECEIVED' ? seed.quantity : 0 }] }
      }, include: { items: true } })
      if (!['IN_TRANSIT', 'RECEIVED'].includes(transferStatus)) return
      const stock = await tx.warehouseStock.findUnique({ where: { productId_warehouseId: {
        productId: product.id, warehouseId: source.id
      } } })
      if (!stock || stock.quantity - stock.reservedQuantity < seed.quantity) throw new Error(`Seed transfer ${seed.number} exceeds source stock.`)
      await tx.warehouseStock.update({ where: { id: stock.id }, data: { quantity: stock.quantity - seed.quantity } })
      await tx.stockMovement.create({ data: {
        referenceNumber: seed.number, productId: product.id, warehouseId: source.id,
        sourceWarehouseId: source.id, destinationWarehouseId: destination.id,
        type: 'TRANSFER_OUT', quantity: -seed.quantity,
        previousQuantity: stock.quantity, newQuantity: stock.quantity - seed.quantity,
        userId: admin.id, notes: seed.notes, createdAt: date('2026-09-30')
      } })
      if (product.trackSerialNumbers) {
        const serials = await tx.serialNumber.findMany({ where: {
          productId: product.id, warehouseId: source.id, status: 'AVAILABLE'
        }, take: seed.quantity, orderBy: { createdAt: 'asc' } })
        if (serials.length !== seed.quantity) throw new Error(`Seed transfer ${seed.number} lacks serials.`)
        await tx.serialNumber.updateMany({ where: { id: { in: serials.map(item => item.id) } }, data: {
          warehouseId: transferStatus === 'RECEIVED' ? destination.id : null,
          status: transferStatus === 'RECEIVED' ? 'AVAILABLE' : 'RESERVED'
        } })
        await tx.stockTransferSerial.createMany({ data: serials.map(item => ({
          transferItemId: transfer.items[0].id, serialNumberId: item.id
        })) })
      }
      if (transferStatus === 'RECEIVED') {
        const target = await tx.warehouseStock.upsert({ where: { productId_warehouseId: {
          productId: product.id, warehouseId: destination.id
        } }, create: { productId: product.id, warehouseId: destination.id, quantity: 0 }, update: {} })
        await tx.warehouseStock.update({ where: { id: target.id }, data: { quantity: target.quantity + seed.quantity } })
        await tx.stockMovement.create({ data: {
          referenceNumber: seed.number, productId: product.id, warehouseId: destination.id,
          sourceWarehouseId: source.id, destinationWarehouseId: destination.id,
          type: 'TRANSFER_IN', quantity: seed.quantity,
          previousQuantity: target.quantity, newQuantity: target.quantity + seed.quantity,
          userId: admin.id, notes: seed.notes, createdAt: date('2026-09-30')
        } })
      }
    })
  }
  const assetMap = new Map()
  for (const seed of seedAssets) {
    const product = products.get(seed.productId)
    let serial = await prisma.serialNumber.findUnique({ where: { serialNumber: seed.serial } })
    if (!serial) serial = await prisma.serialNumber.create({ data: {
      serialNumber: seed.serial, productId: product.id, warehouseId: null,
      warrantyStart: date(seed.purchaseDate), warrantyEnd: date(seed.warrantyEnd),
      status: seed.status === 'Assigned' ? 'ASSIGNED' : seed.status === 'Maintenance' ? 'FOR_REPAIR' : 'AVAILABLE'
    } })
    const warehouse = warehouses.get(seed.location)
    const asset = await prisma.asset.upsert({ where: { assetTag: seed.tag }, update: {}, create: {
      assetTag: seed.tag, productId: product.id, serialNumberId: serial.id,
      warehouseId: warehouse?.id, purchaseDate: date(seed.purchaseDate), status: status(seed.status)
    } })
    assetMap.set(seed.tag, asset)
    if (seed.assignedTo && !await prisma.assetAssignment.count({ where: { assetId: asset.id } })) {
      await prisma.assetAssignment.create({ data: {
        assetId: asset.id, assignedTo: seed.assignedTo,
        department: seed.department, location: seed.location,
        assignedById: admin.id, assignedDate: date(seed.dateAssigned)
      } })
    }
  }
  for (const seed of seedMaintenance) {
    const asset = assetMap.get(seed.asset)
    if (!asset || await prisma.maintenanceRecord.count({ where: { assetId: asset.id, issue: seed.issue } })) continue
    await prisma.maintenanceRecord.create({ data: {
      assetId: asset.id, serialNumberId: asset.serialNumberId,
      issue: seed.issue, technician: seed.technician, serviceDate: date(seed.date),
      cost: seed.cost, status: status(seed.status), createdById: admin.id
    } })
  }
  for (const [key, value] of Object.entries({
    companyName: 'TechStock Inventory', address: 'Cavite City, Philippines',
    email: 'hello@techstock.ph', phone: '+63 2 8810 2240', currency: 'PHP',
    lowStockNotifications: true, warrantyNotifications: true, weeklySummary: false,
    defaultWarehouseId: warehouses.get('Main Warehouse')?.id,
    defaultMinimumStock: 10
  })) await prisma.systemSetting.upsert({ where: { key }, update: {}, create: { key, value: JSON.stringify(value), group: 'general', updatedById: admin.id } })
  for (const [key, value] of [['po-2026', 481], ['transfer-2026', 152], ['receipt-2026', 341], ['asset', 184], ['supplier', seedSuppliers.length], ['warehouse', seedWarehouses.length]]) {
    await prisma.counter.upsert({ where: { key }, update: {}, create: { key, value } })
  }
  if (!await prisma.activityLog.count()) {
    await prisma.activityLog.createMany({ data: [
      { userId: admin.id, action: 'CREATED', module: 'Products', description: 'Loaded the development product catalog.', createdAt: date('2026-09-29') },
      { userId: admin.id, action: 'RECEIVED', module: 'Purchasing', description: 'Received opening purchase orders.', createdAt: date('2026-09-29') },
      { userId: admin.id, action: 'SHIPPED', module: 'Transfers', description: 'Shipped the branch replenishment transfer.', createdAt: date('2026-09-30') }
    ] })
  }
  const alertProducts = await prisma.product.findMany({ where: { status: 'ACTIVE' }, include: { stocks: true } })
  for (const product of alertProducts) {
    const available = product.stocks.reduce((sum, stock) => sum + stock.quantity - stock.reservedQuantity, 0)
    const threshold = product.reorderPoint || product.minimumStock
    if (available > threshold) continue
    const type = available <= 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK'
    if (await prisma.notification.count({ where: { userId: admin.id, type, referenceId: product.id } })) continue
    await prisma.notification.create({ data: {
      userId: admin.id, type, title: available <= 0 ? 'Product out of stock' : 'Low stock alert',
      message: `${product.name} has ${available} available units.`, referenceType: 'Product', referenceId: product.id
    } })
  }
  console.log(`Seed complete: ${seedProducts.length} products, ${seedWarehouses.length} warehouses, ${seedOrders.length} purchase orders.`)
  console.log(`Development admin: ${adminEmail}. Change the seeded password immediately outside local development.`)
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => prisma.$disconnect())
