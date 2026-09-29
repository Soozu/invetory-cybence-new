import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Boxes, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react'
import { useInventory } from '../context/InventoryContext.jsx'
import { Button } from '../components/ui.jsx'

export default function Login() {
  const { authState, login, retryConnection, authError } = useInventory()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  if (authState === 'authenticated') return <Navigate to={location.state?.from || '/'} replace/>
  const submit = async event => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await login(email, password, remember)
      navigate(location.state?.from || '/', { replace: true })
    } catch (failure) {
      setError(failure.message || 'Unable to sign in.')
    } finally { setSubmitting(false) }
  }
  return <div className="flex min-h-screen bg-[var(--canvas)]">
    <div className="hidden w-[46%] flex-col justify-between bg-slate-950 p-12 text-white lg:flex">
      <div className="flex items-center gap-3 font-display text-xl font-extrabold"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600"><Boxes size={22}/></span>TechStock</div>
      <div className="max-w-lg"><p className="text-xs font-bold uppercase tracking-[.2em] text-blue-300">Inventory workspace</p><h1 className="mt-5 font-display text-5xl font-extrabold leading-tight">Every asset. Every movement. One clear view.</h1><p className="mt-5 text-base leading-7 text-slate-300">Manage products, stock, purchases, warehouses, and equipment in a connected workspace.</p></div>
      <p className="text-xs text-slate-400">© {new Date().getFullYear()} TechStock Inventory</p>
    </div>
    <div className="flex flex-1 items-center justify-center px-5 py-14"><div className="w-full max-w-[410px]"><div className="mb-10 flex items-center gap-3 font-display text-xl font-extrabold lg:hidden"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white"><Boxes size={22}/></span>TechStock</div><div className="mb-8"><p className="text-xs font-bold uppercase tracking-[.16em] text-brand-600">Welcome back</p><h2 className="mt-2 font-display text-3xl font-extrabold">Sign in to TechStock</h2><p className="mt-2 text-sm subtle">Use your workspace account to continue.</p></div>{location.state?.passwordChanged && <p className="mb-5 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700 dark:bg-emerald-500/10">Password changed. Sign in with your new password.</p>}<form onSubmit={submit} className="space-y-5"><label className="block"><span className="mb-2 block text-xs font-semibold">Email address</span><span className="relative block"><Mail size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 subtle"/><input className="field w-full pl-10" type="email" autoComplete="username" value={email} onChange={event=>setEmail(event.target.value)} placeholder="you@company.com" required/></span></label><label className="block"><span className="mb-2 block text-xs font-semibold">Password</span><span className="relative block"><LockKeyhole size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 subtle"/><input className="field w-full px-10" type={showPassword?'text':'password'} autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} placeholder="Enter your password" required/><button type="button" aria-label={showPassword?'Hide password':'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 subtle" onClick={()=>setShowPassword(value=>!value)}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></span></label><label className="flex cursor-pointer items-center gap-2 text-xs subtle"><input type="checkbox" checked={remember} onChange={event=>setRemember(event.target.checked)} className="h-4 w-4 accent-brand-600"/>Remember me on this device</label>{(error||authError)&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700 dark:bg-rose-500/10">{error||authError}</p>}<Button type="submit" className="w-full" loading={submitting}>Sign in</Button></form>{authState==='error'&&<button className="mt-4 text-xs font-semibold text-brand-600" onClick={retryConnection}>Retry server connection</button>}</div></div>
  </div>
}
