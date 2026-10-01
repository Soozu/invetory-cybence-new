import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { apiRequest, assetUrl } from '../lib/api.js'
import * as usersApi from '../services/userService.js'
import * as auth from '../services/authService.js'
import * as productsApi from '../services/productService.js'
import * as inventoryApi from '../services/inventoryService.js'
import * as ordersApi from '../services/purchaseOrderService.js'

const InventoryContext = createContext(null)
const empty = {
  products: [], stockLocations: {}, stockBalances: {}, transferDestinations: [], defaultWarehouseId: null, categories: [], brands: [], warehouses: [], suppliers: [],
  orders: [], transfers: [], movements: [], serials: [], assets: [], maintenance: [],
  users: [], roles: [], permissionCatalog: [], logs: [], notifications: [], permissions: {},
  settings: {}, dashboardSummary: null
}
const enumValue = value => value?.toUpperCase().replaceAll(' ', '_')
const requiredId = (rows, name, label) => {
  const id = rows.find(row => row.name === name)?.id
  if (!id) throw new Error(`Choose a valid ${label}.`)
  return id
}
const messageOf = error => error?.errors?.[0]?.message || error?.message || 'The request could not be completed.'

export function InventoryProvider({ children }) {
  const [data, setData] = useState(empty)
  const [user, setUser] = useState(null)
  const [authState, setAuthState] = useState('loading')
  const [authError, setAuthError] = useState('')
  const [toast, setToast] = useState(null)
  const [pendingOperations, setPendingOperations] = useState(0)
  const notify = useCallback((message, kind = 'success') => setToast({ id: Date.now(), message, kind }), [])
  const refreshData = useCallback(async () => {
    const response = await apiRequest('/bootstrap')
    const transferDestinations = response.data.transferDestinations || []
    setData({
      ...empty, ...response.data, transferDestinations,
      products: response.data.products.map(product => ({ ...product, image: assetUrl(product.image) }))
    })
    return response.data
  }, [])

  const restore = useCallback(async () => {
    setAuthState('loading')
    setAuthError('')
    try {
      const session = await auth.restoreSession()
      setUser(session.user)
      await refreshData()
      setAuthState('authenticated')
    } catch (error) {
      if (error.status === 401) {
        setUser(null)
        setData(empty)
        setAuthState('unauthenticated')
      } else {
        setAuthError(messageOf(error))
        setAuthState('error')
      }
    }
  }, [refreshData])
  useEffect(() => { restore() }, [restore])
  useEffect(() => {
    const expired = () => { setUser(null); setData(empty); setAuthState('unauthenticated') }
    window.addEventListener('techstock:session-expired', expired)
    return () => window.removeEventListener('techstock:session-expired', expired)
  }, [])

  const login = async (email, password, remember) => {
    const loggedIn = await auth.login(email, password, remember)
    setUser(loggedIn)
    await refreshData()
    setAuthError('')
    setAuthState('authenticated')
    return loggedIn
  }
  const logout = async () => {
    try { await auth.logout() }
    catch { /* Clear the client session even if the API is temporarily unavailable. */ }
    finally { setUser(null); setData(empty); setAuthError(''); setAuthState('unauthenticated') }
  }
  const run = async (operation, success) => {
    setPendingOperations(count => count + 1)
    try {
      const result = await operation()
      await refreshData()
      if (success) notify(success)
      return result
    } catch (error) {
      notify(messageOf(error), 'error')
      return null
    } finally {
      setPendingOperations(count => Math.max(0, count - 1))
    }
  }
  const productPayload = async product => ({
    name: product.name.trim(), sku: product.sku.trim(), barcode: product.barcode || null,
    categoryId: requiredId(data.categories, product.category, 'category'),
    brandId: requiredId(data.brands, product.brand, 'brand'),
    defaultSupplierId: product.supplier ? requiredId(data.suppliers, product.supplier, 'supplier') : null,
    model: product.model || null, description: product.description || null, unit: product.unit || 'pcs',
    minimumStock: Number(product.min) || 0, maximumStock: Number(product.max) || 0,
    reorderPoint: Number(product.reorder) || 0, purchaseCost: Number(product.cost) || 0,
    warrantyMonths: Number.parseInt(product.warranty, 10) || 0,
    trackSerialNumbers: Boolean(product.serialTracking),
    image: await productsApi.uploadProductImage(product.image),
    status: product.inactive ? 'INACTIVE' : 'ACTIVE'
  })
  const saveProduct = product => run(async () => {
    const payload = await productPayload(product)
    const response = product.id ? await productsApi.updateProduct(product.id, payload) : await productsApi.createProduct(payload)
    return response.data.id
  }, product.id ? 'Product updated.' : 'Product created.')
  const archiveProduct = id => run(() => productsApi.updateProduct(id, {
    status: data.products.find(product => product.id === id)?.inactive ? 'ACTIVE' : 'INACTIVE'
  }), 'Product status updated.')
  const adjustStock = form => run(() => inventoryApi.adjustStock({
    productId: form.productId,
    warehouseId: requiredId(data.warehouses, form.warehouse, 'warehouse'),
    type: enumValue(form.type), quantity: Number(form.quantity), reason: form.reason,
    referenceNumber: form.reference || undefined, notes: form.notes || undefined,
    serialNumbers: form.serialNumbers?.split(/[\n,]+/).map(value => value.trim()).filter(Boolean)
  }), 'Stock updated.')
  const createTransfer = form => run(async () => {
    const response = await inventoryApi.createTransfer({
      sourceWarehouseId: requiredId(data.warehouses, form.from, 'source warehouse'),
      destinationWarehouseId: requiredId(data.transferDestinations, form.to, 'destination warehouse'),
      notes: form.notes || null,
      items: [{ productId: form.productId, quantity: Number(form.quantity) }]
    })
    await inventoryApi.transferAction(response.data.id, 'submit')
    return response.data.id
  }, 'Transfer request created.')
  const transferAction = (id, action) => run(() => inventoryApi.transferAction(id, action), ({ submit: 'Transfer submitted.', approve: 'Transfer approved.', ship: 'Transfer shipped.', receive: 'Transfer received.', cancel: 'Transfer cancelled.' })[action])
  const addSupplier = supplier => run(() => apiRequest('/suppliers', { method: 'POST', body: {
    companyName: supplier.name, contactPerson: supplier.contact || null, email: supplier.email || null,
    phone: supplier.phone || null, address: supplier.address || null, taxId: supplier.taxId || null,
    paymentTerms: supplier.terms || null, notes: supplier.notes || null
  } }), 'Supplier added.')
  const addCategory = category => run(() => apiRequest('/categories', { method: 'POST', body: {
    name: category.name, description: category.description || null,
    parentId: category.parent ? requiredId(data.categories, category.parent, 'parent category') : null
  } }), 'Category added.')
  const addBrand = brand => run(() => apiRequest('/brands', { method: 'POST', body: {
    name: brand.name, description: brand.description || null, logo: brand.logo || null
  } }), 'Brand added.')
  const toggleCategory = name => {
    const record = data.categories.find(item => item.name === name)
    return run(() => apiRequest(`/categories/${record.id}`, { method: 'PUT', body: { status: record.status === 'Active' ? 'INACTIVE' : 'ACTIVE' } }), 'Category status updated.')
  }
  const toggleBrand = name => {
    const record = data.brands.find(item => item.name === name)
    return run(() => apiRequest(`/brands/${record.id}`, { method: 'PUT', body: { status: record.status === 'Active' ? 'INACTIVE' : 'ACTIVE' } }), 'Brand status updated.')
  }
  const addWarehouse = warehouse => run(() => apiRequest('/warehouses', { method: 'POST', body: {
    name: warehouse.name, address: warehouse.location || null,
    managerId: data.users.find(user => user.name === warehouse.manager)?.id || null
  } }), 'Warehouse added.')
  const createOrder = (form, status = 'Draft') => run(async () => {
    const response = await ordersApi.createPurchaseOrder({
      supplierId: requiredId(data.suppliers, form.supplier, 'supplier'),
      warehouseId: requiredId(data.warehouses, form.warehouse, 'warehouse'),
      expectedDelivery: form.expected || null, reference: form.reference || null, notes: form.notes || null,
      tax: Number(form.tax) || 0, shipping: Number(form.shipping) || 0,
      items: form.lines.map(line => ({ productId: line.productId, quantity: Number(line.quantity), unitCost: Number(line.cost) }))
    })
    if (status !== 'Draft') await ordersApi.purchaseOrderAction(response.data.id, 'submit')
    return response.data.id
  }, status === 'Draft' ? 'Purchase order saved as draft.' : 'Purchase order submitted.')
  const orderAction = (id, action) => run(() => ordersApi.purchaseOrderAction(id, action), ({ submit: 'Purchase order submitted.', approve: 'Purchase order approved.', cancel: 'Purchase order cancelled.' })[action])
  const receiveOrder = (orderId, quantities, serialInputs = {}) => run(() => {
    const order = data.orders.find(item => item.id === orderId)
    const items = order.lines.filter(line => Number(quantities[line.productId]) > 0).map(line => ({
      purchaseOrderItemId: line.id, quantity: Number(quantities[line.productId]),
      serialNumbers: (serialInputs[line.productId] || '').split(/[\n,]+/).map(value => value.trim()).filter(Boolean)
    }))
    return ordersApi.receivePurchaseOrder(orderId, { items })
  }, 'Purchase order received.')
  const setSerialStatus = (id, status) => run(() => apiRequest(`/serial-numbers/${id}/status`, {
    method: 'PATCH', body: { status: enumValue(status) }
  }), 'Serial status updated.')
  const markNotification = id => run(() => apiRequest(id ? `/notifications/${id}/read` : '/notifications/read-all', { method: 'POST' }))
  const saveSettings = settings => run(() => apiRequest('/settings', { method: 'PUT', body: {
    companyName: settings.company || '', companyLogo: settings.logo || '',
    email: settings.email || '', phone: settings.phone || '', address: settings.address || '',
    currency: 'PHP',
    ...(data.warehouses.some(warehouse => warehouse.name === settings.defaultWarehouse)
      ? { defaultWarehouseId: data.warehouses.find(warehouse => warehouse.name === settings.defaultWarehouse).id }
      : {}),
    lowStockNotifications: Boolean(settings.lowStockAlerts), warrantyNotifications: Boolean(settings.warrantyAlerts),
    weeklySummary: Boolean(settings.weeklySummary), defaultMinimumStock: Number(settings.defaultMinStock) || 0
  } }), 'Settings saved.')
  const addUser = account => run(() => {
    const [firstName, ...rest] = account.name.trim().split(/\s+/)
    return usersApi.createUser({
      firstName, lastName: rest.join(' ') || firstName, email: account.email,
      password: account.password,
      roleId: data.roles.find(role => role.name === account.role)?.id,
      warehouseIds: account.warehouseIds || [], defaultWarehouseId: account.defaultWarehouseId || null
    })
  }, 'User added.')
  const setUserWarehouses = (id, value) => run(async () => {
    const response = await usersApi.updateWarehouseAssignments(id, { warehouseIds: value.warehouseIds, defaultWarehouseId: value.defaultWarehouseId || null })
    if (id === user?.id) setUser(current => ({ ...current, ...response.data }))
    return response
  }, 'Warehouse access saved.')
  const toggleUser = id => run(() => apiRequest(`/users/${id}/change-status`, { method: 'POST', body: {
    status: data.users.find(user => user.id === id)?.status === 'Active' ? 'INACTIVE' : 'ACTIVE'
  } }), 'User status updated.')
  const setPermission = (role, module, action, enabled) => run(() => {
    const roleRecord = data.roles.find(item => item.name === role)
    const permission = data.permissionCatalog.find(item => item.module === module.toLowerCase() && item.action === action.toUpperCase())
    if (!roleRecord || !permission) throw new Error('Unknown role or permission.')
    const current = roleRecord.permissionIds.filter(id => id !== permission.id)
    return apiRequest(`/roles/${roleRecord.id}/permissions`, { method: 'PUT', body: {
      permissionIds: enabled ? [...current, permission.id] : current
    } })
  }, 'Permissions saved.')

  return <InventoryContext.Provider value={{
    ...data, user, authState, authError, isMutating: pendingOperations > 0, retryConnection: restore, login, logout, refreshData, notify, toast,
    saveProduct, archiveProduct, adjustStock, createTransfer, transferAction,
    addSupplier, addCategory, addBrand, toggleCategory, toggleBrand, addWarehouse, createOrder, orderAction,
    receiveOrder,
    setSerialStatus, markNotification, saveSettings, addUser, setUserWarehouses, toggleUser, setPermission
  }}>{children}</InventoryContext.Provider>
}

export function useInventory() {
  const value = useContext(InventoryContext)
  if (!value) throw new Error('InventoryProvider missing')
  return value
}
