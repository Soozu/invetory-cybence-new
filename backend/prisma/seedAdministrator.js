import bcrypt from 'bcrypt'

const modules = ['imports', 'attachments', 'dashboard', 'products', 'categories', 'brands', 'inventory', 'stock_counts', 'reservations', 'purchase_requests', 'rfqs', 'supplier_returns', 'warranty_claims', 'suppliers', 'purchasing', 'warehouses', 'assets', 'reports', 'users', 'settings']
const actions = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'EXPORT']
const roleNames = ['Administrator', 'Inventory Manager', 'Warehouse Staff', 'Procurement Officer', 'Asset Manager', 'Viewer']
const returnRoleActions = { 'Warehouse Staff': ['VIEW', 'SHIP'], 'Procurement Officer': ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'COMPLETE'], 'Inventory Manager': ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'SHIP'], Viewer: ['VIEW'] }

// Bootstrap access definitions and one account only. Never seed business records.
export async function seedAdministrator(prisma, config = process.env) {
  const roles = new Map()
  for (const name of roleNames) roles.set(name, await prisma.role.upsert({ where: { name }, update: {}, create: { name, description: `${name} access` } }))
  const permissions = []
  for (const module of modules) for (const action of (module === 'imports' ? ['VIEW','CREATE','CONFIRM'] : module === 'attachments' ? ['VIEW','CREATE','EDIT','DELETE'] : module === 'warranty_claims' ? ['VIEW','CREATE','EDIT','APPROVE'] : module === 'reservations' ? ['VIEW', 'CREATE', 'RELEASE', 'FULFILL'] : module === 'purchase_requests' ? ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'CONVERT'] : module === 'supplier_returns' ? ['VIEW','CREATE','EDIT','APPROVE','SHIP','COMPLETE'] : module === 'rfqs' ? ['VIEW','CREATE','EDIT','ISSUE','CLOSE','AWARD','CONVERT'] : actions)) {
    if (module === 'stock_counts' && !['VIEW', 'CREATE', 'EDIT', 'APPROVE'].includes(action)) continue
    const permission = await prisma.permission.upsert({ where: { module_action: { module, action } }, update: {}, create: { module, action } })
    permissions.push(permission)
  }
  const warrantyRoleActions = { 'Asset Manager': ['VIEW','CREATE','EDIT','APPROVE'], 'Inventory Manager': ['VIEW','CREATE','EDIT'], 'Procurement Officer': ['VIEW','EDIT','APPROVE'], 'Warehouse Staff': ['VIEW'], Viewer: ['VIEW'] }
  const roleModules = {
    'Inventory Manager': ['dashboard', 'products', 'categories', 'brands', 'inventory', 'stock_counts', 'reservations', 'purchase_requests', 'rfqs', 'supplier_returns', 'warranty_claims', 'suppliers', 'warehouses', 'reports'],
    'Warehouse Staff': ['dashboard', 'products', 'inventory', 'stock_counts', 'reservations', 'purchase_requests', 'supplier_returns', 'warranty_claims', 'warehouses'],
    'Procurement Officer': ['dashboard', 'products', 'suppliers', 'purchase_requests', 'rfqs', 'supplier_returns', 'purchasing', 'warranty_claims', 'reports'],
    'Asset Manager': ['dashboard', 'products', 'inventory', 'assets', 'warranty_claims', 'reports'],
    Viewer: modules
  }
  for (const [name, allowedModules] of Object.entries(roleModules)) {
    const allowed = permissions.filter(permission => (allowedModules.includes(permission.module) || ['attachments','imports'].includes(permission.module)) && (name !== 'Viewer' ? true : permission.action === 'VIEW') && !(name === 'Warehouse Staff' && ['stock_counts', 'purchase_requests'].includes(permission.module) && !['VIEW', 'CREATE', 'EDIT'].includes(permission.action)) && (permission.module !== 'warranty_claims' || warrantyRoleActions[name]?.includes(permission.action)) && (permission.module !== 'supplier_returns' || returnRoleActions[name]?.includes(permission.action)) && !(name === 'Inventory Manager' && ['purchase_requests','rfqs'].includes(permission.module) && permission.action === 'CONVERT'))
    await prisma.rolePermission.createMany({ data: allowed.map(permission => ({ roleId: roles.get(name).id, permissionId: permission.id })), skipDuplicates: true })
  }
  const email = (config.SEED_ADMIN_EMAIL || 'admin@techstock.local').toLowerCase()
  const password = config.SEED_ADMIN_PASSWORD || 'Admin123!'
  return prisma.user.upsert({
    where: { email }, update: {}, create: {
      firstName: 'TechStock', lastName: 'Admin', email,
      passwordHash: await bcrypt.hash(password, 12), roleId: roles.get('Administrator').id
    }
  })
}
