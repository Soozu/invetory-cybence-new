import { errorText } from '../../lib/errors.js'
import { useEffect,useState } from 'react'
import { useParams,Link } from 'react-router-dom'
import { Button,Card,PageHeader } from '../../components/ui.jsx'
import { getReceipt } from '../../services/workspaceService.js'
export default function ReceiptDetail(){
  const {id}=useParams(),[row,setRow]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0)
  useEffect(()=>{let live=true;setRow(null);setError('');getReceipt(id).then(r=>{if(live)setRow(r.data)}).catch(e=>{if(live)setError(errorText(e))});return()=>{live=false}},[id,retry])
  return <><PageHeader eyebrow="Procurement" title={row?.receiptNumber||'Purchase receipt'} subtitle="Recorded receiving document."/>{error?<div role="alert" className="space-y-3 text-sm"><p className="text-rose-600">{error}</p><Button variant="secondary" onClick={()=>setRetry(v=>v+1)}>Retry</Button></div>:!row?<p role="status" className="text-sm subtle">Loading receipt…</p>:<Card className="space-y-4 p-5"><Link className="text-sm font-semibold text-brand-600" to={`/procurement/purchase-orders/${row.purchaseOrder.id}`}>{row.purchaseOrder.poNumber}</Link><p className="text-sm">{row.warehouse.name} · {new Date(row.receivedAt).toLocaleString()} · {row.receivedBy.firstName} {row.receivedBy.lastName}</p><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="table-head"><tr><th className="p-3">Product</th><th className="p-3">SKU</th><th className="p-3">Received units</th></tr></thead><tbody>{row.items.map(i=><tr key={i.id} className="border-t divider"><td className="p-3">{i.product.name}</td><td className="p-3">{i.product.sku}</td><td className="p-3">{i.quantity}</td></tr>)}</tbody></table></div><p className="text-sm subtle">{row.notes||'No receipt notes.'}</p></Card>}</>
}
