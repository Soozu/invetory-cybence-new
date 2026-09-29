import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { useInventory } from '../context/InventoryContext.jsx'
import { can, routePermission } from '../lib/permissions.js'
import { Button, LoadingSkeleton } from './ui.jsx'

export default function ProtectedRoute() {
  const { authState, authError, retryConnection, user } = useInventory()
  const location = useLocation()
  if (authState === 'loading') return <div className="mx-auto max-w-4xl px-5 py-20"><LoadingSkeleton rows={6}/></div>
  if (authState === 'error') return <div className="flex min-h-screen items-center justify-center bg-[var(--canvas)] p-5"><div className="panel max-w-md p-8 text-center"><AlertCircle className="mx-auto text-rose-500" size={30}/><h1 className="mt-4 font-display text-xl font-bold">Cannot load inventory</h1><p className="mt-2 text-sm subtle">{authError}</p><Button className="mt-6" icon={RefreshCw} onClick={retryConnection}>Try again</Button></div></div>
  if (authState !== 'authenticated') return <Navigate to="/login" state={{ from: location.pathname }} replace/>
  const permission = routePermission(location.pathname)
  if (permission && !can(user, permission)) return <div className="flex min-h-screen items-center justify-center bg-[var(--canvas)] p-5"><div className="panel max-w-md p-8 text-center"><AlertCircle className="mx-auto text-amber-500" size={30}/><h1 className="mt-4 font-display text-xl font-bold">Access restricted</h1><p className="mt-2 text-sm subtle">Your role does not allow this page.</p><Button className="mt-6" onClick={()=>window.history.back()}>Go back</Button></div></div>
  return <Outlet/>
}
