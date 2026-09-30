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
  await test.user.create({ data: { id: 'test-legacy-user', firstName: 'Legacy', lastName: 'Test', email: 'legacy@warehouse.test', roleId: 'test-legacy-role', warehouseId: 'test-legacy-warehouse', passwordHash: await bcrypt.hash('LegacyTest123!', 4) } })
  // Use the initial schema's columns before the lifecycle receipt link exists.
  await test.$executeRaw`INSERT INTO Category (id,name,slug,updatedAt) VALUES ('test-legacy-category','Legacy category','legacy-category',NOW(3))`
  await test.$executeRaw`INSERT INTO Brand (id,name,slug,updatedAt) VALUES ('test-legacy-brand','Legacy brand','legacy-brand',NOW(3))`
  await test.$executeRaw`INSERT INTO Product (id,name,sku,categoryId,brandId,updatedAt) VALUES ('test-legacy-product','Legacy product','LEGACY-SKU','test-legacy-category','test-legacy-brand',NOW(3))`
  await test.$executeRaw`INSERT INTO SerialNumber (id,serialNumber,productId,warehouseId,updatedAt) VALUES ('test-legacy-serial','LEGACY-SERIAL','test-legacy-product','test-legacy-warehouse',NOW(3))`
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
