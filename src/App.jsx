import Attachments from './pages/Attachments.jsx'
import Imports from './pages/Imports.jsx'
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
const StockConditions=lazy(()=>import('./pages/inventory/StockConditionPage.jsx'))
const StockCounts=lazy(()=>import('./pages/inventory/StockCountPages.jsx').then(m=>({default:m.StockCounts})))
const StockCountDetail=lazy(()=>import('./pages/inventory/StockCountPages.jsx').then(m=>({default:m.StockCountDetail})))
const Reservations=lazy(()=>import('./pages/inventory/ReservationPages.jsx').then(m=>({default:m.Reservations})))
const ReservationDetail=lazy(()=>import('./pages/inventory/ReservationPages.jsx').then(m=>({default:m.ReservationDetail})))
const Scanner=lazy(()=>import('./pages/inventory/ScannerPages.jsx').then(m=>({default:m.Scanner})))
const LabelPrinter=lazy(()=>import('./pages/inventory/ScannerPages.jsx').then(m=>({default:m.LabelPrinter})))
const StockMovement=lazy(()=>import('./pages/inventory/InventoryPages.jsx').then(m=>({default:m.StockMovement})))
const SerialNumbers=lazy(()=>import('./pages/inventory/InventoryPages.jsx').then(m=>({default:m.SerialNumbers})))
const SerialLifecycle=lazy(()=>import('./pages/inventory/SerialLifecycle.jsx'))
const LowStock=lazy(()=>import('./pages/inventory/InventoryPages.jsx').then(m=>({default:m.LowStock})))
const Warehouses=lazy(()=>import('./pages/warehouses/WarehousePages.jsx').then(m=>({default:m.Warehouses})))
const WarehouseDetails=lazy(()=>import('./pages/warehouses/WarehousePages.jsx').then(m=>({default:m.WarehouseDetails})))
const StockTransfers=lazy(()=>import('./pages/warehouses/WarehousePages.jsx').then(m=>({default:m.StockTransfers})))
const TransferDetail=lazy(()=>import('./pages/warehouses/TransferDetail.jsx'))
const SupplierReturns=lazy(()=>import('./pages/procurement/SupplierReturnPages.jsx').then(m=>({default:m.SupplierReturns})))
const SupplierReturnForm=lazy(()=>import('./pages/procurement/SupplierReturnPages.jsx').then(m=>({default:m.SupplierReturnForm})))
const SupplierReturnDetail=lazy(()=>import('./pages/procurement/SupplierReturnPages.jsx').then(m=>({default:m.SupplierReturnDetail})))
const Suppliers=lazy(()=>import('./pages/procurement/ProcurementPages.jsx').then(m=>({default:m.Suppliers})))
const ReorderSuggestions=lazy(()=>import('./pages/procurement/ReplenishmentPages.jsx').then(m=>({default:m.ReorderSuggestions})))
const SupplierPerformance=lazy(()=>import('./pages/procurement/ReplenishmentPages.jsx').then(m=>({default:m.SupplierPerformance})))
const SupplierDetails=lazy(()=>import('./pages/procurement/ProcurementPages.jsx').then(m=>({default:m.SupplierDetails})))
const PurchaseOrders=lazy(()=>import('./pages/procurement/ProcurementPages.jsx').then(m=>({default:m.PurchaseOrders})))
const CreatePurchaseOrder=lazy(()=>import('./pages/procurement/ProcurementPages.jsx').then(m=>({default:m.CreatePurchaseOrder})))
const PurchaseOrderDetails=lazy(()=>import('./pages/procurement/ProcurementPages.jsx').then(m=>({default:m.PurchaseOrderDetails})))
const Receiving=lazy(()=>import('./pages/procurement/ProcurementPages.jsx').then(m=>({default:m.Receiving})))
const PurchaseRequests=lazy(()=>import('./pages/procurement/PurchaseRequestPages.jsx').then(m=>({default:m.PurchaseRequests})))
const PurchaseRequestForm=lazy(()=>import('./pages/procurement/PurchaseRequestPages.jsx').then(m=>({default:m.PurchaseRequestForm})))
const PurchaseRequestDetail=lazy(()=>import('./pages/procurement/PurchaseRequestPages.jsx').then(m=>({default:m.PurchaseRequestDetail})))
const RFQs=lazy(()=>import('./pages/procurement/RFQPages.jsx').then(m=>({default:m.RFQs})))
const RFQForm=lazy(()=>import('./pages/procurement/RFQPages.jsx').then(m=>({default:m.RFQForm})))
const RFQDetail=lazy(()=>import('./pages/procurement/RFQPages.jsx').then(m=>({default:m.RFQDetail})))
const QuotationForm=lazy(()=>import('./pages/procurement/QuotationPages.jsx').then(m=>({default:m.QuotationForm})))
const QuotationDetail=lazy(()=>import('./pages/procurement/QuotationPages.jsx').then(m=>({default:m.QuotationDetail})))
const QuotationComparison=lazy(()=>import('./pages/procurement/QuotationComparison.jsx'))
const Assets=lazy(()=>import('./pages/assets/AssetPages.jsx').then(m=>({default:m.Assets})))
const AssignedEquipment=lazy(()=>import('./pages/assets/AssetPages.jsx').then(m=>({default:m.AssignedEquipment})))
const WarrantyTracking=lazy(()=>import('./pages/assets/AssetPages.jsx').then(m=>({default:m.WarrantyTracking})))
const MaintenanceRecords=lazy(()=>import('./pages/assets/AssetWorkflowPages.jsx').then(m=>({default:m.MaintenanceRecords})))
const AssetDetail=lazy(()=>import('./pages/assets/AssetWorkflowPages.jsx').then(m=>({default:m.AssetDetail})))
const PreventiveMaintenance=lazy(()=>import('./pages/assets/AssetWorkflowPages.jsx').then(m=>({default:m.PreventiveMaintenance})))
const WarrantyClaims=lazy(()=>import('./pages/assets/AssetWorkflowPages.jsx').then(m=>({default:m.WarrantyClaims})))
const WarrantyClaimDetail=lazy(()=>import('./pages/assets/AssetWorkflowPages.jsx').then(m=>({default:m.WarrantyClaimDetail})))
const Users=lazy(()=>import('./pages/management/ManagementPages.jsx').then(m=>({default:m.Users})))
const RolesPermissions=lazy(()=>import('./pages/management/ManagementPages.jsx').then(m=>({default:m.RolesPermissions})))
const ActivityLogs=lazy(()=>import('./pages/ActivityLogs.jsx'))
const Reports=lazy(()=>import('./pages/Reports.jsx'))
const Preferences=lazy(()=>import('./pages/Preferences.jsx'))
const Sessions=lazy(()=>import('./pages/Sessions.jsx'))
const SystemAdministration=lazy(()=>import('./pages/SystemAdministration.jsx'))
const ReportSchedules=lazy(()=>import('./pages/ReportSchedules.jsx'))
const ReceiptDetail=lazy(()=>import('./pages/procurement/ReceiptDetail.jsx'))
const Settings=lazy(()=>import('./pages/management/ManagementPages.jsx').then(m=>({default:m.Settings})))
const Profile=lazy(()=>import('./pages/management/Profile.jsx'))
import { Button, Card, EmptyState } from './components/ui.jsx'

function NotFound() { const navigate=useNavigate(); return <Card><EmptyState icon={SearchX} title="Page not found" description="The page you requested is not part of this inventory workspace." action={<Button icon={ArrowLeft} onClick={()=>navigate('/')}>Back to dashboard</Button>}/></Card> }
export default function App() { return <Routes><Route path="/login" element={<Login/>}/><Route element={<ProtectedRoute/>}><Route element={<DashboardLayout/>}>
  <Route path="/" element={<Dashboard/>}/><Route path="/attachments" element={<Attachments/>}/><Route path="/imports" element={<Imports/>}/>
  <Route path="/profile/sessions" element={<Sessions/>}/>
  <Route path="/profile/report-schedules" element={<ReportSchedules/>}/>
  <Route path="/system/health" element={<SystemAdministration/>}/><Route path="/system/backups" element={<SystemAdministration/>}/><Route path="/system/retention" element={<SystemAdministration/>}/><Route path="/system/docs" element={<SystemAdministration/>}/>
  <Route path="/products" element={<Products/>}/>
  <Route path="/products/new" element={<ProductForm/>}/>
  <Route path="/products/:id" element={<ProductDetails/>}/>
  <Route path="/products/:id/edit" element={<ProductForm/>}/>
  <Route path="/categories" element={<Categories/>}/>
  <Route path="/brands" element={<Brands/>}/>
  <Route path="/inventory/stock" element={<StockManagement/>}/>
  <Route path="/inventory/conditions" element={<StockConditions/>}/>
  <Route path="/inventory/stock-counts" element={<StockCounts/>}/>
  <Route path="/inventory/stock-counts/:id" element={<StockCountDetail/>}/>
  <Route path="/inventory/reservations" element={<Reservations/>}/>
  <Route path="/inventory/reservations/:id" element={<ReservationDetail/>}/>
  <Route path="/inventory/scanner" element={<Scanner/>}/>
  <Route path="/inventory/labels" element={<LabelPrinter/>}/>
  <Route path="/inventory/serial-numbers" element={<SerialNumbers/>}/>
  <Route path="/serial-numbers/:id" element={<SerialLifecycle/>}/>
  <Route path="/inventory/transfers" element={<StockTransfers/>}/>
  <Route path="/inventory/transfers/:id" element={<TransferDetail/>}/>
  <Route path="/warehouses" element={<Warehouses/>}/>
  <Route path="/warehouses/:id" element={<WarehouseDetails/>}/>
  <Route path="/monitoring/low-stock" element={<LowStock/>}/>
  <Route path="/monitoring/out-of-stock" element={<LowStock outOnly/>}/>
  <Route path="/monitoring/stock-movement" element={<StockMovement/>}/>
  <Route path="/monitoring/expiring-warranty" element={<WarrantyTracking expiringOnly/>}/>
  <Route path="/procurement/supplier-returns" element={<SupplierReturns/>}/>
  <Route path="/procurement/supplier-returns/new" element={<SupplierReturnForm/>}/>
  <Route path="/procurement/supplier-returns/:id/edit" element={<SupplierReturnForm/>}/>
  <Route path="/procurement/supplier-returns/:id" element={<SupplierReturnDetail/>}/>
  <Route path="/procurement/suppliers" element={<Suppliers/>}/>
  <Route path="/procurement/reorder" element={<ReorderSuggestions/>}/>
  <Route path="/procurement/supplier-performance" element={<SupplierPerformance/>}/>
  <Route path="/procurement/purchase-requests" element={<PurchaseRequests/>}/>
  <Route path="/procurement/purchase-requests/new" element={<PurchaseRequestForm/>}/>
  <Route path="/procurement/purchase-requests/:id/edit" element={<PurchaseRequestForm/>}/>
  <Route path="/procurement/purchase-requests/:id" element={<PurchaseRequestDetail/>}/>
  <Route path="/procurement/rfqs" element={<RFQs/>}/>
  <Route path="/procurement/rfqs/new" element={<RFQForm/>}/>
  <Route path="/procurement/rfqs/:id/edit" element={<RFQForm/>}/>
  <Route path="/procurement/rfqs/:id/comparison" element={<QuotationComparison/>}/>
  <Route path="/procurement/rfqs/:id/quotations/new" element={<QuotationForm/>}/>
  <Route path="/procurement/rfqs/:id/quotations/:quotationId/edit" element={<QuotationForm/>}/>
  <Route path="/procurement/rfqs/:id/quotations/:quotationId" element={<QuotationDetail/>}/>
  <Route path="/procurement/rfqs/:id" element={<RFQDetail/>}/>
  <Route path="/procurement/suppliers/:id" element={<SupplierDetails/>}/>
  <Route path="/procurement/purchase-orders" element={<PurchaseOrders/>}/>
  <Route path="/procurement/purchase-orders/new" element={<CreatePurchaseOrder/>}/>
  <Route path="/procurement/purchase-orders/:id" element={<PurchaseOrderDetails/>}/>
  <Route path="/procurement/receiving" element={<Receiving/>}/>
  <Route path="/procurement/receiving/:id" element={<Receiving detail/>}/>
  <Route path="/procurement/history" element={<PurchaseOrders history/>}/>
  <Route path="/assets" element={<Assets/>}/>
  <Route path="/assets/preventive-maintenance" element={<PreventiveMaintenance/>}/>
  <Route path="/assets/warranty-claims" element={<WarrantyClaims/>}/>
  <Route path="/assets/warranty-claims/:id" element={<WarrantyClaimDetail/>}/>
  <Route path="/assets/:id" element={<AssetDetail/>}/>
  <Route path="/assets/assigned" element={<AssignedEquipment/>}/>
  <Route path="/assets/warranties" element={<WarrantyTracking/>}/>
  <Route path="/assets/maintenance" element={<MaintenanceRecords/>}/>
  <Route path="/reports" element={<Reports/>}/>
  <Route path="/management/users" element={<Users/>}/>
  <Route path="/management/roles" element={<RolesPermissions/>}/>
  <Route path="/management/activity" element={<ActivityLogs/>}/>
  <Route path="/settings" element={<Settings/>}/>
  <Route path="/profile" element={<Profile/>}/><Route path="/profile/preferences" element={<Preferences/>}/><Route path="/procurement/receipts/:id" element={<ReceiptDetail/>}/>
  <Route path="*" element={<NotFound/>}/>
</Route></Route></Routes> }
