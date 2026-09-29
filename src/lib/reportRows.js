import { getReport } from '../services/reportService.js'

const date = value => value ? new Date(value).toISOString().slice(0, 10) : ''
const title = value => value?.toLowerCase().split('_').map(word => word[0].toUpperCase() + word.slice(1)).join(' ') || ''
const ids = (data, filters) => ({
  category: data.categories.find(item => item.name === filters.category)?.id || '',
  brand: data.brands.find(item => item.name === filters.brand)?.id || '',
  warehouse: data.warehouses.find(item => item.name === filters.warehouse)?.id || '',
  supplier: data.suppliers.find(item => item.name === filters.supplier)?.id || '',
  dateFrom: filters.start, dateTo: filters.end
})
const types = {
  'Inventory Summary': 'inventory-summary', 'Stock Movement': 'stock-movement',
  'Low Stock': 'low-stock', 'Out of Stock': 'out-of-stock',
  'Inventory Valuation': 'inventory-valuation', 'Warehouse Stock': 'warehouse-stock',
  'Supplier Purchases': 'supplier-purchases', 'Asset Report': 'assets', 'Warranty Report': 'warranties'
}

export async function fetchReportRows(type, filters, data) {
  const response = await getReport(types[type], ids(data, filters))
  const rows = response.data || []
  const productRow = item => ({
    Product: item.name, SKU: item.sku, Category: item.category?.name || '', Brand: item.brand?.name || '',
    Warehouse: item.stocks?.map(stock => stock.warehouse?.name).filter(Boolean).join(', ') || '',
    Stock: item.quantity, Status: title(item.status), Cost: Number(item.purchaseCost),
    Value: item.quantity * Number(item.purchaseCost)
  })
  if (type === 'Inventory Summary') return rows.map(item => {
    const { Product, SKU, Category, Brand, Warehouse, Stock, Status } = productRow(item)
    return { Product, SKU, Category, Brand, Warehouse, Stock, Status }
  })
  if (type === 'Low Stock' || type === 'Out of Stock') return rows.map(item => ({
    ...productRow(item), Minimum: item.minimumStock
  }))
  if (type === 'Inventory Valuation') return rows.map(item => ({
    Product: item.product.name, SKU: item.product.sku, Warehouse: item.warehouse.name,
    Stock: item.quantity, Cost: Number(item.product.purchaseCost), Value: item.value
  }))
  if (type === 'Warehouse Stock') {
    const groups = new Map()
    for (const item of rows) {
      const previous = groups.get(item.warehouseId) || { Warehouse: item.warehouse.name, Location: item.warehouse.address || '', Products: 0, Units: 0, Value: 0 }
      previous.Products += 1
      previous.Units += item.quantity
      previous.Value += item.value
      groups.set(item.warehouseId, previous)
    }
    return [...groups.values()]
  }
  if (type === 'Supplier Purchases') return rows.map(item => ({
    'PO Number': item.poNumber, Supplier: item.supplier.companyName, Items: item.items.length,
    Amount: Number(item.total), Date: date(item.orderDate), Status: title(item.status)
  }))
  if (type === 'Asset Report') return rows.map(item => ({
    Tag: item.assetTag, Product: item.product.name, Serial: item.serialNumber?.serialNumber || '',
    'Assigned To': item.assignments.find(assignment => assignment.status === 'ACTIVE')?.assignedTo || '—',
    Department: item.assignments.find(assignment => assignment.status === 'ACTIVE')?.department || '',
    Status: title(item.status)
  }))
  if (type === 'Warranty Report') return rows.map(item => ({
    Serial: item.serialNumber, Product: item.product.name, Supplier: item.supplier?.companyName || '',
    'Warranty Start': date(item.warrantyStart), 'Warranty End': date(item.warrantyEnd),
    Status: title(item.warrantyStatus)
  }))
  return rows.map(item => ({
    Date: date(item.createdAt), Reference: item.referenceNumber, Product: item.product.name,
    Movement: title(item.type), Quantity: item.quantity,
    From: item.sourceWarehouse?.name || '', To: item.destinationWarehouse?.name || item.warehouse?.name || ''
  }))
}
