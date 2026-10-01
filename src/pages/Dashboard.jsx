import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, ArrowRight, Boxes, CalendarDays, CircleAlert, DollarSign, LoaderCircle, Package, PackageMinus, RefreshCw, Truck } from 'lucide-react'
import { useInventory } from '../context/InventoryContext.jsx'
import { getDashboardMovements, getCategoryDistribution,getDashboardOverview } from '../services/dashboardService.js'
import { getPreferences } from '../services/workspaceService.js'
import { number, peso, productStatus } from '../lib/format.js'
import { Badge, Button, Card, EmptyState, PageHeader, ProductCell, SectionHeading, StatCard } from '../components/ui.jsx'

const tooltipStyle={background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,color:'var(--text)',boxShadow:'0 12px 30px rgba(18,35,61,.12)',fontSize:12}

export default function Dashboard() {
  const navigate=useNavigate(),{products,movements,warehouses}=useInventory()
  const [period,setPeriod]=useState('30 Days')
  const [preferences,setPreferences]=useState(null),[warehouse,setWarehouse]=useState(''),[overview,setOverview]=useState(null),[overviewError,setOverviewError]=useState(''),[overviewLoading,setOverviewLoading]=useState(true),[retry,setRetry]=useState(0)
  useEffect(()=>{let live=true;setOverviewLoading(true);setOverviewError('');getPreferences().then(r=>{if(!live)return;setPreferences(r.data);setWarehouse(r.data.effectiveWarehouseId||'');setPeriod({'7d':'7 Days','30d':'30 Days','3m':'3 Months','6m':'6 Months','1y':'1 Year'}[r.data.dashboard.defaultPeriod])}).catch(e=>{if(live){setOverviewError(e.message||'Unable to load dashboard preferences. Please try again.');setOverviewLoading(false)}});return()=>{live=false}},[retry])
  useEffect(()=>{if(!preferences)return;let live=true;setOverviewLoading(true);setOverview(null);setOverviewError('');getDashboardOverview(warehouse).then(r=>{if(live)setOverview(r)}).catch(e=>{if(live)setOverviewError(e.message||'Unable to load dashboard totals. Please try again.')}).finally(()=>{if(live)setOverviewLoading(false)});return()=>{live=false}},[warehouse,preferences,products,movements])
  const [chartData,setChartData]=useState([])
  const [categoryShare,setCategoryShare]=useState([])
  const [movementState,setMovementState]=useState('loading')
  const [movementError,setMovementError]=useState('')
  const [categoryState,setCategoryState]=useState('loading')
  const [categoryError,setCategoryError]=useState('')
  const [movementRetry,setMovementRetry]=useState(0)
  const [categoryRetry,setCategoryRetry]=useState(0)
  useEffect(()=>{
    if(!preferences)return
    let active=true
    const periods={'7 Days':'7d','30 Days':'30d','3 Months':'3m','6 Months':'6m','1 Year':'1y'}
    setMovementState('loading')
    setMovementError('')
    getDashboardMovements(periods[period],warehouse).then(result=>{
      if(!active)return
      setChartData((Array.isArray(result.data)?result.data:[]).map(point=>({day:point.date,in:Number(point.stockIn)||0,out:Number(point.stockOut)||0})))
      setMovementState('success')
    }).catch(error=>{
      if(!active)return
      setMovementError(error.message)
      setMovementState('error')
    })
    return ()=>{active=false}
  },[period,movements,movementRetry,warehouse,preferences])
  useEffect(()=>{
    if(!preferences)return
    let active=true
    setCategoryState('loading')
    setCategoryError('')
    getCategoryDistribution(warehouse).then(result=>{
      if(!active)return
      const rows=(Array.isArray(result.data)?result.data:[]).filter(item=>Number(item.quantity)>0)
      const total=rows.reduce((sum,item)=>sum+Number(item.quantity),0)
      const colors=['#3768e9','#6a86df','#88a9f4','#9b8ae8','#4ab9ae','#f5a66a','#f16f84','#8b98ae']
      setCategoryShare(rows.map((item,index)=>({name:item.name,value:Math.round(Number(item.quantity)/total*100),color:colors[index%colors.length]})))
      setCategoryState('success')
    }).catch(error=>{
      if(!active)return
      setCategoryError(error.message)
      setCategoryState('error')
    })
    return ()=>{active=false}
  },[products,movements,categoryRetry,warehouse,preferences])
  const low=(overview?.low||[]).map(p=>({id:p.id,name:p.name,sku:p.sku,category:p.category.name,stock:p.quantity,reserved:p.reservedQuantity,min:p.minimumStock,reorder:p.reorderPoint,warehouse:p.stocks.map(w=>w.warehouse.name).join(', '),image:p.image}))
  const dashboardSummary=overview?.summary
  const summary=dashboardSummary?{products:dashboardSummary.totalProducts,units:dashboardSummary.totalInventoryUnits,value:dashboardSummary.inventoryValue,low:dashboardSummary.lowStock,out:dashboardSummary.outOfStock,suppliers:dashboardSummary.activeSuppliers}:{products:0,units:0,value:0,low:0,out:0,suppliers:0}
  const stats=[
    {label:'Total Products',value:number(summary.products),icon:Package,tone:'blue',hint:'Active catalog records'},
    {label:'Inventory Units',value:number(summary.units),icon:Boxes,tone:'violet',hint:'Across selected warehouses'},
    {label:'Inventory Value',value:peso(summary.value),valueClassName:'!text-[21px] 2xl:!text-[21px]',icon:DollarSign,tone:'green',hint:'At purchase cost'},
    {label:'Low Stock',value:number(summary.low),icon:CircleAlert,tone:'amber',hint:'Needs attention'},
    {label:'Out of Stock',value:number(summary.out),icon:PackageMinus,tone:'rose',hint:'Awaiting replenishment'},
    {label:'Active Suppliers',value:number(summary.suppliers),icon:Truck,tone:'blue',hint:'Approved partners'}
  ]
  const recent=(overview?.activity||[]).map(r=>({icon:Activity,text:r.description,person:r.user?`${r.user.firstName} ${r.user.lastName}`:'System',time:new Date(r.createdAt).toLocaleString()}))
  const sections={movement:(<Card className="min-w-0 p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><SectionHeading title="Inventory movement" subtitle="Recorded movement in selected warehouses"/><select aria-label="Inventory chart period" className="field w-[125px] !py-2 text-xs font-semibold" value={period} onChange={e=>setPeriod(e.target.value)}>{['7 Days','30 Days','3 Months','6 Months','1 Year'].map(k=><option key={k}>{k}</option>)}</select></div><div className="mt-5 flex items-center gap-5 text-[11px] font-semibold subtle"><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-brand-600"/>Stock In</span><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#91aef3]"/>Stock Out</span></div><div className="mt-4 h-[268px] w-full">{movementState==='loading'?<div role="status" className="flex h-full items-center justify-center gap-2 text-sm subtle"><LoaderCircle className="animate-spin" size={18}/>Loading inventory movement…</div>:movementState==='error'?<div className="flex h-full flex-col items-center justify-center gap-3 text-center"><div><p className="text-sm font-semibold">Unable to load inventory movement.</p><p className="mt-1 max-w-sm text-xs subtle">{movementError}</p></div><Button size="sm" variant="secondary" icon={RefreshCw} onClick={()=>setMovementRetry(value=>value+1)}>Try again</Button></div>:!chartData.some(point=>point.in>0||point.out>0)?<EmptyState title="No inventory movement data available for this period." description="Stock movement will appear after the first receipt, adjustment, transfer, or asset assignment."/>:<ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{top:8,right:4,left:-24,bottom:0}}><defs><linearGradient id="stockInFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3768e9" stopOpacity={.24}/><stop offset="100%" stopColor="#3768e9" stopOpacity={0}/></linearGradient><linearGradient id="stockOutFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#91aef3" stopOpacity={.14}/><stop offset="100%" stopColor="#91aef3" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="day" tickLine={false} axisLine={false} tick={{fill:'var(--muted)',fontSize:11}} dy={10}/><YAxis tickLine={false} axisLine={false} tick={{fill:'var(--muted)',fontSize:11}}/><Tooltip contentStyle={tooltipStyle}/><Area type="monotone" dataKey="in" name="Stock In" stroke="#3768e9" strokeWidth={2.5} fill="url(#stockInFill)" activeDot={{r:5}} animationDuration={650}/><Area type="monotone" dataKey="out" name="Stock Out" stroke="#91aef3" strokeWidth={2.2} fill="url(#stockOutFill)" activeDot={{r:5}} animationDuration={650}/></AreaChart></ResponsiveContainer>}</div></Card>),category:(<Card className="p-5 sm:p-6"><SectionHeading title="Stock by category" subtitle="Distribution across product groups"/><div className="relative mx-auto mt-1 h-[195px] max-w-[240px]">{categoryState==='loading'?<div role="status" className="flex h-full items-center justify-center gap-2 text-sm subtle"><LoaderCircle className="animate-spin" size={18}/>Loading category data…</div>:categoryState==='error'?<div className="flex h-full flex-col items-center justify-center gap-3 text-center"><div><p className="text-sm font-semibold">Unable to load category distribution.</p><p className="mt-1 max-w-sm text-xs subtle">{categoryError}</p></div><Button size="sm" variant="secondary" icon={RefreshCw} onClick={()=>setCategoryRetry(value=>value+1)}>Try again</Button></div>:categoryShare.length===0?<EmptyState title="No stock by category yet" description="Category distribution will appear when products have stock in a warehouse."/>:<><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categoryShare} dataKey="value" innerRadius={61} outerRadius={84} paddingAngle={3} stroke="none" animationDuration={650}>{categoryShare.map(d=><Cell key={d.name} fill={d.color}/>)}</Pie><Tooltip contentStyle={tooltipStyle} formatter={v=>`${v}%`}/></PieChart></ResponsiveContainer><div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="font-display text-[23px] font-extrabold">{number(summary.products)}</span><span className="text-[11px] subtle">products</span></div></>}</div><div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-2.5">{categoryShare.map(c=><div key={c.name} className="flex items-center justify-between gap-2 text-[11px]"><span className="flex min-w-0 items-center gap-2 truncate subtle"><i className="h-2 w-2 shrink-0 rounded-full" style={{background:c.color}}/>{c.name}</span><span className="font-bold">{c.value}%</span></div>)}</div></Card>),lowStock:(<Card className="min-w-0 overflow-hidden"><div className="flex items-center justify-between gap-3 p-5 pb-4 sm:px-6"><SectionHeading title="Low stock products" subtitle="Replenish these items before they run out"/><button onClick={()=>navigate('/monitoring/low-stock')} className="flex items-center gap-1 whitespace-nowrap text-xs font-bold text-brand-600 hover:text-brand-700">View all <ArrowRight size={13}/></button></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead className="table-head"><tr>{['Product','SKU','Category','Stock','Minimum','Warehouse','Status'].map(h=><th key={h} className="px-4 py-3 text-[10px] font-bold uppercase tracking-[.08em] first:pl-6">{h}</th>)}</tr></thead><tbody>{overviewLoading?<tr><td colSpan={7} className="px-6 py-8 text-center text-sm subtle" role="status">Loading low stock products...</td></tr>:low.length?low.slice(0,5).map(p=><tr key={p.id} onClick={()=>navigate(`/products/${p.id}`)} className="table-row cursor-pointer border-t"><td className="pl-6 pr-4 py-3"><ProductCell product={p}/></td><td className="px-4 py-3 font-medium subtle">{p.sku}</td><td className="px-4 py-3">{p.category}</td><td className="px-4 py-3 font-bold text-amber-600">{p.stock}</td><td className="px-4 py-3">{p.min}</td><td className="px-4 py-3">{p.warehouse}</td><td className="px-4 py-3"><Badge>{productStatus(p)}</Badge></td></tr>):<tr><td colSpan={7} className="px-6 py-8 text-center text-sm subtle">No low stock products to display.</td></tr>}</tbody></table></div></Card>),activity:(<Card className="p-5 sm:p-6"><SectionHeading title="Recent activity" subtitle="Latest changes across your inventory" action={<Activity size={16} className="subtle"/>}/><div className="mt-5 space-y-0">{overviewLoading?<div role="status" className="py-5 text-center text-sm subtle">Loading recent activity...</div>:recent.length?recent.map((a,i)=><div key={i} className="relative flex gap-3 pb-5 last:pb-0">{i<recent.length-1&&<span className="absolute left-[16px] top-9 h-[calc(100%-24px)] w-px bg-[var(--border)]"/>}<span className={`z-10 flex h-[33px] w-[33px] shrink-0 items-center justify-center rounded-full ${i===0?'bg-brand-50 text-brand-600 dark:bg-brand-500/10':'bg-[var(--surface-muted)] text-[var(--muted)]'}`}><a.icon size={15}/></span><div className="min-w-0 pt-0.5"><div className="text-xs font-semibold leading-relaxed">{a.text}</div><div className="mt-1 text-[11px] subtle">{a.person} <span className="mx-1">·</span> {a.time}</div></div></div>):<div className="py-5 text-center text-sm subtle">No activity records yet.</div>}</div><button onClick={()=>navigate('/monitoring/stock-movement')} className="mt-3 flex items-center gap-1 text-xs font-bold text-brand-600">View activity <ArrowRight size={13}/></button></Card>)}
  if(overviewError)return <><PageHeader title="Inventory Dashboard"/><Card className="space-y-3 p-5"><p role="alert" className="text-sm text-rose-600">{overviewError}</p><Button variant="secondary" onClick={()=>setRetry(v=>v+1)}>Retry dashboard</Button></Card></>
  if(!preferences)return <><PageHeader title="Inventory Dashboard"/><p role="status" className="flex items-center gap-2 text-sm subtle"><LoaderCircle className="animate-spin" size={18}/>Loading dashboard preferences...</p></>
  return <>
    <PageHeader eyebrow="Overview" title="Inventory Dashboard" subtitle="Monitor products, stock levels, suppliers, assets, and inventory activity." actions={<div className="flex flex-wrap items-center gap-3"><Button variant="secondary" size="sm" onClick={()=>navigate('/profile/preferences')}>Customize</Button><select aria-label="Dashboard warehouse" className="field max-w-56 text-xs" value={warehouse} onChange={e=>setWarehouse(e.target.value)}><option value="">All accessible warehouses</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select><div className="relative"><CalendarDays size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 subtle"/><select aria-label="Dashboard date range" className="field w-[160px] pl-9 text-xs font-semibold" value={period} onChange={event=>setPeriod(event.target.value)}>{['7 Days','30 Days','3 Months','6 Months','1 Year'].map(value=><option key={value}>{value}</option>)}</select></div></div>}/>
    {preferences.warehouseWarning&&<p className="mb-4 text-sm text-amber-600">{preferences.warehouseWarning}</p>}
    {overviewLoading&&<p role="status" className="mb-4 flex items-center gap-2 text-sm subtle"><LoaderCircle className="animate-spin" size={18}/>Loading inventory totals...</p>}
    {!overviewLoading&&summary.products===0&&summary.units===0&&<Card className="mb-5"><EmptyState title="No inventory yet" description="Your database has no active products or stock in the selected warehouses. Add your warehouses, categories, brands and products, then record stock to populate this dashboard."/></Card>}
    <div aria-busy={overviewLoading} className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6 2xl:gap-4">{preferences.dashboard.cards.map(key=>{const stat=stats[['products','units','value','low','out','suppliers'].indexOf(key)];return <StatCard key={key} {...stat} value={overviewLoading?'—':stat.value}/>})}</div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2">{preferences.dashboard.charts.map(key=><div key={key} className="min-w-0">{sections[key]}</div>)}</div>
  </>
}
