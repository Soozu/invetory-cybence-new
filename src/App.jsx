import { lazy } from 'react'
import { Route, Routes, useNavigate } from 'react-router-dom'
import { ArrowLeft, SearchX } from 'lucide-react'
import DashboardLayout from './layouts/DashboardLayout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Login from './pages/Login.jsx'
const Dashboard=lazy(()=>import('./pages/Dashboard.jsx'))
const Products=lazy(()=>import('./pages/products/Products.jsx'))
const ProductDetails=lazy(()=>import('./pages/products/ProductDetails.jsx'))
const ProductForm=lazy(()=>import('./pages/products/ProductForm.jsx'))
const Categories=lazy(()=>import('./pages/catalog/CatalogPages.jsx').then(m=>({default:m.Categories})))
const Brands=lazy(()=>import('./pages/catalog/CatalogPages.jsx').then(m=>({default:m.Brands})))
const StockManagement=lazy(()=>import('./pages/inventory/InventoryPages.jsx').then(m=>({default:m.StockManagement})))
const StockMovement=lazy(()=>import('./pages/inventory/InventoryPages.jsx').then(m=>({default:m.StockMovement})))
const SerialNumbers=lazy(()=>import('./pages/inventory/InventoryPages.jsx').then(m=>({default:m.SerialNumbers})))
const LowStock=lazy(()=>import('./pages/inventory/InventoryPages.jsx').then(m=>({default:m.LowStock})))
const Warehouses=lazy(()=>import('./pages/warehouses/WarehousePages.jsx').then(m=>({default:m.Warehouses})))
const WarehouseDetails=lazy(()=>import('./pages/warehouses/WarehousePages.jsx').then(m=>({default:m.WarehouseDetails})))
const StockTransfers=lazy(()=>import('./pages/warehouses/WarehousePages.jsx').then(m=>({default:m.StockTransfers})))
const Suppliers=lazy(()=>import('./pages/procurement/ProcurementPages.jsx').then(m=>({default:m.Suppliers})))
const SupplierDetails=lazy(()=>import('./pages/procurement/ProcurementPages.jsx').then(m=>({default:m.SupplierDetails})))
const PurchaseOrders=lazy(()=>import('./pages/procurement/ProcurementPages.jsx').then(m=>({default:m.PurchaseOrders})))
const CreatePurchaseOrder=lazy(()=>import('./pages/procurement/ProcurementPages.jsx').then(m=>({default:m.CreatePurchaseOrder})))
const PurchaseOrderDetails=lazy(()=>import('./pages/procurement/ProcurementPages.jsx').then(m=>({default:m.PurchaseOrderDetails})))
const Receiving=lazy(()=>import('./pages/procurement/ProcurementPages.jsx').then(m=>({default:m.Receiving})))
const Assets=lazy(()=>import('./pages/assets/AssetPages.jsx').then(m=>({default:m.Assets})))
const AssignedEquipment=lazy(()=>import('./pages/assets/AssetPages.jsx').then(m=>({default:m.AssignedEquipment})))
const WarrantyTracking=lazy(()=>import('./pages/assets/AssetPages.jsx').then(m=>({default:m.WarrantyTracking})))
const MaintenanceRecords=lazy(()=>import('./pages/assets/AssetPages.jsx').then(m=>({default:m.MaintenanceRecords})))
const Users=lazy(()=>import('./pages/management/ManagementPages.jsx').then(m=>({default:m.Users})))
const RolesPermissions=lazy(()=>import('./pages/management/ManagementPages.jsx').then(m=>({default:m.RolesPermissions})))
const ActivityLogs=lazy(()=>import('./pages/management/ManagementPages.jsx').then(m=>({default:m.ActivityLogs})))
const Reports=lazy(()=>import('./pages/management/ManagementPages.jsx').then(m=>({default:m.Reports})))
const Settings=lazy(()=>import('./pages/management/ManagementPages.jsx').then(m=>({default:m.Settings})))
const Profile=lazy(()=>import('./pages/management/Profile.jsx'))
import { Button, Card, EmptyState } from './components/ui.jsx'

function NotFound() { const navigate=useNavigate(); return <Card><EmptyState icon={SearchX} title="Page not found" description="The page you requested is not part of this inventory workspace." action={<Button icon={ArrowLeft} onClick={()=>navigate('/')}>Back to dashboard</Button>}/></Card> }
export default function App() { return <Routes><Route path="/login" element={<Login/>}/><Route element={<ProtectedRoute/>}><Route element={<DashboardLayout/>}>
  <Route path="/" element={<Dashboard/>}/>
  <Route path="/products" element={<Products/>}/>
  <Route path="/products/new" element={<ProductForm/>}/>
  <Route path="/products/:id" element={<ProductDetails/>}/>
  <Route path="/products/:id/edit" element={<ProductForm/>}/>
  <Route path="/categories" element={<Categories/>}/>
  <Route path="/brands" element={<Brands/>}/>
  <Route path="/inventory/stock" element={<StockManagement/>}/>
  <Route path="/inventory/serial-numbers" element={<SerialNumbers/>}/>
  <Route path="/inventory/transfers" element={<StockTransfers/>}/>
  <Route path="/warehouses" element={<Warehouses/>}/>
  <Route path="/warehouses/:id" element={<WarehouseDetails/>}/>
  <Route path="/monitoring/low-stock" element={<LowStock/>}/>
  <Route path="/monitoring/out-of-stock" element={<LowStock outOnly/>}/>
  <Route path="/monitoring/stock-movement" element={<StockMovement/>}/>
  <Route path="/monitoring/expiring-warranty" element={<WarrantyTracking expiringOnly/>}/>
  <Route path="/procurement/suppliers" element={<Suppliers/>}/>
  <Route path="/procurement/suppliers/:id" element={<SupplierDetails/>}/>
  <Route path="/procurement/purchase-orders" element={<PurchaseOrders/>}/>
  <Route path="/procurement/purchase-orders/new" element={<CreatePurchaseOrder/>}/>
  <Route path="/procurement/purchase-orders/:id" element={<PurchaseOrderDetails/>}/>
  <Route path="/procurement/receiving" element={<Receiving/>}/>
  <Route path="/procurement/receiving/:id" element={<Receiving detail/>}/>
  <Route path="/procurement/history" element={<PurchaseOrders history/>}/>
  <Route path="/assets" element={<Assets/>}/>
  <Route path="/assets/assigned" element={<AssignedEquipment/>}/>
  <Route path="/assets/warranties" element={<WarrantyTracking/>}/>
  <Route path="/assets/maintenance" element={<MaintenanceRecords/>}/>
  <Route path="/reports" element={<Reports/>}/>
  <Route path="/management/users" element={<Users/>}/>
  <Route path="/management/roles" element={<RolesPermissions/>}/>
  <Route path="/management/activity" element={<ActivityLogs/>}/>
  <Route path="/settings" element={<Settings/>}/>
  <Route path="/profile" element={<Profile/>}/>
  <Route path="*" element={<NotFound/>}/>
</Route></Route></Routes> }
