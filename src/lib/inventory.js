export function inventorySummary(products = [], suppliers = []) {
  const active = products.filter(product => !product.inactive)
  const units = products.reduce((sum, product) => sum + Number(product.stock || 0), 0)
  const reserved = products.reduce((sum, product) => sum + Number(product.reserved || 0), 0)
  return {
    products: active.length, units, reserved, available: units - reserved,
    value: products.reduce((sum, product) => sum + Number(product.stock || 0) * Number(product.cost || 0), 0),
    low: active.filter(product => product.stock - product.reserved > 0 && product.stock - product.reserved <= (product.reorder || product.min)).length,
    critical: active.filter(product => product.stock - product.reserved > 0 && product.stock - product.reserved <= (product.reorder || product.min) / 2).length,
    out: active.filter(product => product.stock - product.reserved <= 0).length,
    suppliers: suppliers.filter(supplier => supplier.status === 'Active').length
  }
}

export const withLiveWarehouseTotals = warehouses => warehouses
export const withLiveCatalogTotals = records => records
