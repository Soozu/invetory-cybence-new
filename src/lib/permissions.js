export function can(user, permission) {
  if (!user) return false
  return user.role === 'Administrator' || user.permissions?.includes(permission)
}

export function routePermission(path) {
  if (path === '/' || path.startsWith('/dashboard')) return 'dashboard.VIEW'
  if (path === '/products/new') return 'products.CREATE'
  if (/^\/products\/[^/]+\/edit$/.test(path)) return 'products.EDIT'
  if (path.startsWith('/products')) return 'products.VIEW'
  if (path.startsWith('/categories')) return 'categories.VIEW'
  if (path.startsWith('/brands')) return 'brands.VIEW'
  if (path.startsWith('/inventory') || path.startsWith('/monitoring/low-stock') || path.startsWith('/monitoring/out-of-stock') || path.startsWith('/monitoring/stock-movement')) return 'inventory.VIEW'
  if (path.startsWith('/warehouses')) return 'warehouses.VIEW'
  if (path.startsWith('/procurement/suppliers')) return 'suppliers.VIEW'
  if (path === '/procurement/purchase-orders/new') return 'purchasing.CREATE'
  if (path.startsWith('/procurement')) return 'purchasing.VIEW'
  if (path.startsWith('/assets') || path.startsWith('/monitoring/expiring-warranty')) return 'assets.VIEW'
  if (path.startsWith('/reports')) return 'reports.VIEW'
  if (path.startsWith('/management')) return 'users.VIEW'
  if (path.startsWith('/settings')) return 'settings.VIEW'
  return null
}
