import 'dotenv/config'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import bcrypt from 'bcrypt'
import { PrismaClient } from '@prisma/client'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const originalUrl = new URL(process.env.DATABASE_URL)
const testName = `techstock_test_warehouse_${Date.now().toString(36)}`
const testUrl = new URL(originalUrl)
testUrl.pathname = testName
// Bound fixture pools on high-core Windows hosts; bootstrap uses many parallel
// reads and each isolated Vitest module owns its own Prisma client.
testUrl.searchParams.set('connection_limit', '5')
if (!/^techstock_test_warehouse_[a-z0-9]+$/.test(testName) || testUrl.pathname === originalUrl.pathname) throw new Error('Unsafe test database target.')
const original = new PrismaClient({ datasources: { db: { url: originalUrl.href } } })
const test = new PrismaClient({ datasources: { db: { url: testUrl.href } } })
const runtimeRoot = path.join(root, '.test-runtime')
let workspace
const run = (args, env) => {
  const result = spawnSync(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`Verification command failed with status ${result.status}.`)
}

try {
  await original.$executeRawUnsafe(`CREATE DATABASE \`${testName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  await fs.mkdir(runtimeRoot, { recursive: true })
  workspace = await fs.mkdtemp(path.join(runtimeRoot, 'warehouse-'))
  const initialName = '20260929_initial'
  await fs.mkdir(path.join(workspace, 'migrations', initialName), { recursive: true })
  await fs.copyFile(path.join(root, 'prisma', 'schema.prisma'), path.join(workspace, 'schema.prisma'))
  await fs.copyFile(path.join(root, 'prisma', 'migrations', initialName, 'migration.sql'), path.join(workspace, 'migrations', initialName, 'migration.sql'))
  await fs.copyFile(path.join(root, 'prisma', 'migrations', 'migration_lock.toml'), path.join(workspace, 'migrations', 'migration_lock.toml'))
  run(['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', path.join(workspace, 'schema.prisma')], { DATABASE_URL: testUrl.href })
  await test.role.create({ data: { id: 'test-legacy-role', name: 'Legacy warehouse role' } })
  await test.warehouse.create({ data: { id: 'test-legacy-warehouse', name: 'Legacy warehouse', code: 'LEGACY' } })
  const legacyPasswordHash=await bcrypt.hash('LegacyTest123!',4)
  // Insert with the initial schema contract; the current client has newer defaults.
  await test.$executeRaw`INSERT INTO User (id,firstName,lastName,email,roleId,warehouseId,passwordHash,updatedAt) VALUES ('test-legacy-user','Legacy','Test','legacy@warehouse.test','test-legacy-role','test-legacy-warehouse',${legacyPasswordHash},NOW(3))`
  // Use the initial schema's columns before the lifecycle receipt link exists.
  await test.$executeRaw`INSERT INTO Category (id,name,slug,updatedAt) VALUES ('test-legacy-category','Legacy category','legacy-category',NOW(3))`
  await test.$executeRaw`INSERT INTO Brand (id,name,slug,updatedAt) VALUES ('test-legacy-brand','Legacy brand','legacy-brand',NOW(3))`
  await test.$executeRaw`INSERT INTO Product (id,name,sku,categoryId,brandId,updatedAt) VALUES ('test-legacy-product','Legacy product','LEGACY-SKU','test-legacy-category','test-legacy-brand',NOW(3))`
  await test.$executeRaw`INSERT INTO SerialNumber (id,serialNumber,productId,warehouseId,updatedAt) VALUES ('test-legacy-serial','LEGACY-SERIAL','test-legacy-product','test-legacy-warehouse',NOW(3))`
  // Exercise the new condition backfill on real pre-feature rows, then deploy
  // the final migration. Never mutate the original schema for these fixtures.
  const conditionMigration = '20261004_stock_conditions'
  for (const entry of await fs.readdir(path.join(root, 'prisma', 'migrations'), { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== initialName && entry.name < conditionMigration) {
      await fs.cp(path.join(root, 'prisma', 'migrations', entry.name), path.join(workspace, 'migrations', entry.name), { recursive: true })
    }
  }
  run(['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', path.join(workspace, 'schema.prisma')], { DATABASE_URL: testUrl.href })
  await test.$executeRaw`UPDATE Product SET trackSerialNumbers = 1 WHERE id = 'test-legacy-product'`
  await test.$executeRaw`INSERT INTO WarehouseStock (id,productId,warehouseId,quantity,reservedQuantity,updatedAt) VALUES ('test-legacy-condition-stock','test-legacy-product','test-legacy-warehouse',5,4,'2026-09-01 12:00:00.000')`
  await test.$executeRaw`INSERT INTO SerialNumber (id,serialNumber,productId,warehouseId,status,updatedAt) VALUES
    ('test-legacy-defective','LEGACY-DEFECT','test-legacy-product','test-legacy-warehouse','DEFECTIVE',NOW(3)),
    ('test-legacy-repair','LEGACY-REPAIR','test-legacy-product','test-legacy-warehouse','FOR_REPAIR',NOW(3)),
    ('test-legacy-pending','LEGACY-RETURN','test-legacy-product','test-legacy-warehouse','RETURN_PENDING',NOW(3)),
    ('test-legacy-reserved','LEGACY-RESERVED','test-legacy-product','test-legacy-warehouse','RESERVED',NOW(3))`
  await test.$executeRaw`INSERT INTO Product (id,name,sku,categoryId,brandId,updatedAt) VALUES ('test-legacy-condition-plain','Legacy return product','LEGACY-RTV','test-legacy-category','test-legacy-brand',NOW(3))`
  await test.$executeRaw`INSERT INTO WarehouseStock (id,productId,warehouseId,quantity,reservedQuantity,updatedAt) VALUES ('test-legacy-condition-plain-stock','test-legacy-condition-plain','test-legacy-warehouse',4,3,'2026-09-01 12:00:00.000')`
  await test.$executeRaw`INSERT INTO Supplier (id,companyName,supplierCode,updatedAt) VALUES ('test-legacy-condition-supplier','Legacy return supplier','LEGACY-RTV-S',NOW(3))`
  await test.$executeRaw`INSERT INTO PurchaseOrder (id,poNumber,supplierId,warehouseId,createdById,subtotal,total,updatedAt) VALUES ('test-legacy-condition-po','LEGACY-RTV-PO','test-legacy-condition-supplier','test-legacy-warehouse','test-legacy-user',4,4,NOW(3))`
  await test.$executeRaw`INSERT INTO PurchaseOrderItem (id,purchaseOrderId,productId,quantity,unitCost,subtotal) VALUES ('test-legacy-condition-po-item','test-legacy-condition-po','test-legacy-condition-plain',4,1,4)`
  await test.$executeRaw`INSERT INTO PurchaseReceipt (id,receiptNumber,purchaseOrderId,warehouseId,receivedById) VALUES ('test-legacy-condition-receipt','LEGACY-RTV-RCV','test-legacy-condition-po','test-legacy-warehouse','test-legacy-user')`
  await test.$executeRaw`INSERT INTO PurchaseReceiptItem (id,receiptId,purchaseOrderItemId,productId,quantity) VALUES ('test-legacy-condition-receipt-item','test-legacy-condition-receipt','test-legacy-condition-po-item','test-legacy-condition-plain',4)`
  await test.$executeRaw`INSERT INTO SupplierReturn (id,returnNumber,supplierId,purchaseOrderId,receiptId,warehouseId,status,reason,createdById,updatedAt) VALUES ('test-legacy-condition-return','LEGACY-RTV','test-legacy-condition-supplier','test-legacy-condition-po','test-legacy-condition-receipt','test-legacy-warehouse','PENDING','DEFECTIVE','test-legacy-user',NOW(3))`
  await test.$executeRaw`INSERT INTO SupplierReturnItem (id,supplierReturnId,receiptItemId,productId,quantity,heldQuantity,reason,\`condition\`) VALUES ('test-legacy-condition-return-item','test-legacy-condition-return','test-legacy-condition-receipt-item','test-legacy-condition-plain',2,2,'DEFECTIVE','DEFECTIVE')`
  // A completed pre-discrepancy transfer has no new arrival ledger. Backfill
  // selection outcomes only; do not move its serial or invent receipt history.
  await test.$executeRaw`INSERT INTO Warehouse (id,name,code,updatedAt) VALUES ('test-legacy-transfer-destination','Legacy transfer destination','LEGACY-TD',NOW(3))`
  await test.$executeRaw`INSERT INTO StockTransfer (id,transferNumber,sourceWarehouseId,destinationWarehouseId,requestedById,status,receivedAt,updatedAt) VALUES ('test-legacy-transfer','LEGACY-TRF','test-legacy-warehouse','test-legacy-transfer-destination','test-legacy-user','RECEIVED','2026-09-01 12:00:00.000','2026-09-01 12:00:00.000')`
  await test.$executeRaw`INSERT INTO StockTransferItem (id,transferId,productId,quantity,receivedQuantity) VALUES ('test-legacy-transfer-item','test-legacy-transfer','test-legacy-product',1,1)`
  await test.$executeRaw`INSERT INTO StockTransferSerial (transferItemId,serialNumberId) VALUES ('test-legacy-transfer-item','test-legacy-serial')`
  await test.$executeRaw`INSERT INTO Asset (id,assetTag,productId,warehouseId,status,updatedAt) VALUES ('test-legacy-asset','LEGACY-AST','test-legacy-product','test-legacy-warehouse','MAINTENANCE','2026-09-01 12:00:00.000')`
  await test.$executeRaw`INSERT INTO MaintenanceRecord (id,assetId,issue,status,updatedAt) VALUES ('test-legacy-maintenance','test-legacy-asset','Legacy repair','IN_REPAIR','2026-09-01 12:00:00.000')`
  run(['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { DATABASE_URL: testUrl.href })
  // Suites share permission/role fixtures in this disposable schema. Keep suites
  // sequential; each suite still exercises explicit concurrent business writes.
  run(['node_modules/vitest/vitest.mjs', 'run', '--no-file-parallelism'], { DATABASE_URL: testUrl.href, TEST_DATABASE_URL: testUrl.href })
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await test.$disconnect()
  await original.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${testName}\``)
  await original.$disconnect()
  if (workspace) {
    const resolved = await fs.realpath(workspace)
    const allowed = await fs.realpath(runtimeRoot)
    if (!resolved.startsWith(`${allowed}${path.sep}`)) throw new Error('Unsafe test workspace cleanup target.')
    await fs.rm(resolved, { recursive: true, force: true })
  }
}
