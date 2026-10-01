export function can(user, permission) {
  if (!user) return false
  if (permission?.all) return permission.all.every(key => can(user, key))
  if (Array.isArray(permission)) return permission.some(key => can(user, key))
  return user.role === 'Administrator' || user.permissions?.includes(permission)
}

export function routePermission(path) {
  if (path.startsWith('/assets/warranty-claims')) return 'warranty_claims.VIEW'
  if (path.startsWith('/procurement/reorder')) return { all: ['inventory.VIEW', 'purchasing.VIEW', 'purchase_requests.VIEW', 'suppliers.VIEW'] }
  if (path.startsWith('/procurement/supplier-performance')) return { all: ['purchasing.VIEW', 'suppliers.VIEW', 'supplier_returns.VIEW'] }
  if (path === '/' || path.startsWith('/dashboard')) return 'dashboard.VIEW'
  if (path === '/products/new') return 'products.CREATE'
  if (/^\/products\/[^/]+\/edit$/.test(path)) return 'products.EDIT'
  if (path.startsWith('/products')) return 'products.VIEW'
  if (path.startsWith('/categories')) return 'categories.VIEW'
  if (path.startsWith('/brands')) return 'brands.VIEW'
  if (path.startsWith('/inventory/stock-counts')) return 'stock_counts.VIEW'
  if (path.startsWith('/inventory/scanner') || path.startsWith('/inventory/labels')) return ['products.VIEW', 'inventory.VIEW', 'stock_counts.VIEW', 'reservations.VIEW', 'assets.VIEW', 'warehouses.VIEW', 'purchasing.VIEW']
  if (path.startsWith('/inventory/reservations')) return 'reservations.VIEW'
  if (path.startsWith('/serial-numbers')) return 'inventory.VIEW'
  if (path.startsWith('/inventory') || path.startsWith('/monitoring/low-stock') || path.startsWith('/monitoring/out-of-stock') || path.startsWith('/monitoring/stock-movement')) return 'inventory.VIEW'
  if (path.startsWith('/warehouses')) return 'warehouses.VIEW'
  if (path === '/procurement/purchase-requests/new') return 'purchase_requests.CREATE'
  if (/^\/procurement\/purchase-requests\/[^/]+\/edit$/.test(path)) return 'purchase_requests.EDIT'
  if (path.startsWith('/procurement/purchase-requests')) return 'purchase_requests.VIEW'
  if (path === '/procurement/rfqs/new') return 'rfqs.CREATE'
  if (/^\/procurement\/rfqs\/[^/]+\/edit$/.test(path) || /\/quotations\/(new|[^/]+\/edit)$/.test(path)) return 'rfqs.EDIT'
  if (path.startsWith('/procurement/rfqs')) return 'rfqs.VIEW'
  if (path === '/procurement/supplier-returns/new') return 'supplier_returns.CREATE'
  if (/^\/procurement\/supplier-returns\/[^/]+\/edit$/.test(path)) return 'supplier_returns.EDIT'
  if (path.startsWith('/procurement/supplier-returns')) return 'supplier_returns.VIEW'
  if (path.startsWith('/procurement/suppliers')) return 'suppliers.VIEW'
  if (path === '/procurement/purchase-orders/new') return 'purchasing.CREATE'
  if (path.startsWith('/procurement')) return 'purchasing.VIEW'
  if (path.startsWith('/assets') || path.startsWith('/monitoring/expiring-warranty')) return 'assets.VIEW'
  if (path.startsWith('/reports')) return 'reports.VIEW'
  if (path.startsWith('/management')) return 'users.VIEW'
  if (path.startsWith('/settings')) return 'settings.VIEW'
  return null
}
