import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ClipboardList, Plus } from 'lucide-react'
import { useInventory } from '../../context/InventoryContext.jsx'
import { can } from '../../lib/permissions.js'
import { Badge, Button, Card, EmptyState, Field, FilterBar, InfoGrid, LoadingSkeleton, Modal, PageHeader, SearchInput, Select } from '../../components/ui.jsx'
import ScanInput from '../../components/ScanInput.jsx'
import ServerTable from '../../components/ServerTable.jsx'
import * as api from '../../services/stockCountService.js'

const statuses = ['DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'CANCELLED']
const label = value => value.toLowerCase().replaceAll('_', ' ').replace(/^./, char => char.toUpperCase())
const scans = value => value.split(/\r?\n/).map(serial => serial.trim()).filter(Boolean)
const date = value => value ? new Date(value).toLocaleString() : '—'
function ErrorState({ error, retry }) { return <Card><EmptyState title={error.status === 403 ? 'Access denied' : error.status === 404 ? 'Stock count not found' : 'Unable to load stock counts'} description={error.message} action={<Button variant="secondary" onClick={retry}>Try again</Button>}/></Card> }

export function StockCounts() {
  const { user, warehouses, notify } = useInventory(), navigate = useNavigate()
  const [filters, setFilters] = useState({ page: 1, limit: 20, search: '', warehouse: '', status: '' })
  const [result, setResult] = useState(null), [error, setError] = useState(null), [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false), [warehouseId, setWarehouse] = useState(user.defaultWarehouseId || ''), [notes, setNotes] = useState(''), [pending, setPending] = useState(false), [formError, setFormError] = useState('')
  const [version, setVersion] = useState(0)
  useEffect(() => { let active = true; setLoading(true); setError(null); api.listCounts(filters).then(data => { if (active) setResult(data) }).catch(err => { if (active) setError(err) }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [filters, version])
  const change = (key, value) => setFilters(current => ({ ...current, [key]: value, page: 1 }))
  async function create(event) { event.preventDefault(); setPending(true); setFormError(''); try { const response = await api.createCount({ warehouseId, notes }); notify('Stock count created.'); navigate(`/inventory/stock-counts/${response.data.id}`) } catch (err) { setFormError(err.message) } finally { setPending(false) } }
  return <><PageHeader eyebrow="Inventory" title="Stock Counts" subtitle="Reconcile physical inventory with a recorded warehouse snapshot." actions={can(user, 'stock_counts.CREATE') && <Button icon={Plus} onClick={() => setOpen(true)}>Create count</Button>}/>
    <FilterBar><SearchInput value={filters.search} onChange={value => change('search', value)} placeholder="Search count number"/><Select aria-label="Warehouse filter" className="sm:w-52" value={filters.warehouse} onChange={value => change('warehouse', value)} options={warehouses.map(w => ({ value: w.id, label: w.name }))} placeholder="All accessible warehouses"/><Select aria-label="Status filter" className="sm:w-44" value={filters.status} onChange={value => change('status', value)} options={statuses.map(value => ({ value, label: label(value) }))} placeholder="All statuses"/></FilterBar>
    {loading ? <LoadingSkeleton/> : error ? <ErrorState error={error} retry={() => setVersion(v => v + 1)}/> : <ServerTable rows={result.data} pagination={result.pagination} onPage={page => setFilters(current => ({ ...current, page }))} emptyTitle="No stock counts yet" emptyDescription="Create a stock count to reconcile physical inventory." columns={[
      { key: 'countNumber', label: 'Count', render: row => <Link className="font-semibold text-brand-600" to={`/inventory/stock-counts/${row.id}`}>{row.countNumber}</Link> },
      { key: 'warehouse', label: 'Warehouse', render: row => row.warehouse.name }, { key: 'status', label: 'Status', render: row => <Badge>{label(row.status)}</Badge> },
      { key: 'items', label: 'Lines', render: row => row._count.items }, { key: 'createdAt', label: 'Created', render: row => date(row.createdAt) }
    ]}/>}
    <Modal open={open} onOpenChange={value => { if (!pending) setOpen(value) }} title="Create stock count" description="Choose the warehouse. Inventory is captured when you start the count."><form onSubmit={create} className="space-y-4"><Field label="Warehouse" required><Select aria-label="Count warehouse" required value={warehouseId} onChange={setWarehouse} options={warehouses.filter(w => w.status === 'Operational').map(w => ({ value: w.id, label: w.name }))} placeholder="Select warehouse"/></Field><Field label="Notes"><textarea aria-label="Count notes" className="field min-h-24" maxLength={4000} value={notes} onChange={event => setNotes(event.target.value)}/></Field>{formError && <p role="alert" className="text-sm text-rose-600">{formError}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={pending} disabled={!warehouseId}>Create count</Button></div></form></Modal>
  </>
}

export function StockCountDetail() {
  const { id } = useParams(), { user, notify, refreshData } = useInventory()
  const [count, setCount] = useState(null), [result, setResult] = useState(null), [query, setQuery] = useState({ page: 1, limit: 20, search: '' })
  const [drafts, setDrafts] = useState({}), [error, setError] = useState(null), [loading, setLoading] = useState(true), [pending, setPending] = useState(false), [actionError, setActionError] = useState(''), [confirm, setConfirm] = useState(''), [version, setVersion] = useState(0)
  const dirty = Object.keys(drafts).length > 0, editable = count?.status === 'IN_PROGRESS' && can(user, 'stock_counts.EDIT')
  useEffect(() => { let active = true; setLoading(true); setError(null); Promise.all([api.getCount(id), api.getCountItems(id, query)]).then(([metadata, items]) => { if (active) { setCount(metadata.data); setResult(items); setDrafts({}) } }).catch(err => { if (active) setError(err) }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [id, query, version])
  useEffect(() => {
    if (!dirty) return
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    const leave = event => {
      const link = event.target.closest?.('a[href]')
      if (link && new URL(link.href).pathname !== window.location.pathname && !window.confirm('Leave this stock count and discard unsaved edits?')) { event.preventDefault(); event.stopPropagation() }
    }
    window.addEventListener('beforeunload', warn); document.addEventListener('click', leave, true)
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', leave, true) }
  }, [dirty])
  const draft = row => drafts[row.id] || { countedQuantity: row.countedQuantity === null ? '' : String(row.countedQuantity), serialText: row.scannedSerials.join('\n'), notes: row.notes || '' }
  const edit = (row, key, value) => setDrafts(current => ({ ...current, [row.id]: { ...draft(row), [key]: value } }))
  async function action(event) {
    setPending(true); setActionError('')
    try {
      if (event === 'save') {
        const items = Object.entries(drafts).map(([itemId, values]) => {
          const row = result.data.find(item => item.id === itemId), serialNumbers = scans(values.serialText)
          const quantity = row.product.trackSerialNumbers ? serialNumbers.length : Number(values.countedQuantity)
          if (!row.product.trackSerialNumbers && values.countedQuantity.trim() === '') throw new Error('Enter a quantity for every edited line, including zero when not found.')
          if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error('Counted quantities must be whole numbers of zero or more.')
          return { id: itemId, countedQuantity: quantity, serialNumbers, notes: values.notes }
        })
        await api.saveCountItems(id, items)
      } else { await api.transitionCount(id, event); if (event === 'approve') await refreshData() }
      notify(event === 'save' ? 'Count lines saved.' : `Stock count ${event} completed.`); setConfirm(''); setDrafts({}); setVersion(v => v + 1)
    } catch (err) { setActionError(err.message) } finally { setPending(false) }
  }
  if (loading) return <LoadingSkeleton rows={6}/>
  if (error) return <ErrorState error={error} retry={() => setVersion(v => v + 1)}/>
  return <><PageHeader eyebrow="Inventory / Stock Counts" title={count.countNumber} subtitle={`${count.warehouse.name} · ${label(count.status)}`} actions={<>
    {count.status === 'DRAFT' && can(user, 'stock_counts.EDIT') && <Button loading={pending} onClick={() => action('start')}>Start count</Button>}
    {editable && <><Button variant="secondary" loading={pending} disabled={!dirty} onClick={() => action('save')}>Save counts</Button><Button disabled={dirty || count.countedItems !== count._count.items || !count._count.items || pending} onClick={() => setConfirm('submit')}>Submit for review</Button></>}
    {count.status === 'SUBMITTED' && can(user, 'stock_counts.APPROVE') && <Button disabled={pending} onClick={() => setConfirm('approve')}>Approve corrections</Button>}
    {!['APPROVED', 'CANCELLED'].includes(count.status) && can(user, 'stock_counts.EDIT') && <Button variant="secondary" disabled={pending || dirty} onClick={() => setConfirm('cancel')}>Cancel count</Button>}
  </>}/>
    <Card className="mb-5 p-5"><InfoGrid items={[["Counted lines", `${count.countedItems} / ${count._count.items}`], ["Quantity variances", String(count.varianceItems)], ["Snapshot started", date(count.startedAt)], ["Created by", `${count.createdBy.firstName} ${count.createdBy.lastName}`], ["Approved", date(count.approvedAt)], ["Notes", count.notes]]}/></Card>
    {actionError && <p role="alert" className="mb-4 rounded-xl border border-rose-200 p-4 text-sm text-rose-600">{actionError}</p>}
    {count.status === 'DRAFT' ? <Card><EmptyState icon={ClipboardList} title="Ready to start" description="Starting captures quantities and serial numbers. Inventory remains usable; approval will require a fresh count if stock changes."/></Card> : <>
      <FilterBar><div className="flex-1"><input aria-label="Search count products" placeholder="Search product or SKU, then press Enter" disabled={pending || dirty} className="field" defaultValue={query.search} onKeyDown={event => { if (event.key === 'Enter') setQuery({ ...query, page: 1, search: event.currentTarget.value }) }}/></div><span className="text-xs subtle">{dirty ? 'Save your edits before changing pages or leaving this count.' : 'Enter zero explicitly for items not found.'}</span></FilterBar>
      <ServerTable rows={result.data} pagination={result.pagination} disabled={dirty || pending} onPage={page => setQuery(current => ({ ...current, page }))} emptyTitle="No count lines found" emptyDescription="Try another search." columns={[
        { key: 'product', label: 'Product', render: row => <div className="min-w-40"><div className="font-semibold">{row.product.name}</div><div className="mt-1 text-xs subtle">{row.product.sku}</div>{row.product.trackSerialNumbers && <Badge>Serialized</Badge>}</div> },
        { key: 'expectedQuantity', label: 'Expected' },
        { key: 'countedQuantity', label: 'Counted', render: row => row.product.trackSerialNumbers ? <div className="min-w-48"><div className="mb-2 text-xs">{editable ? scans(draft(row).serialText).length : row.countedQuantity ?? 'Not counted'} units</div>{editable ? <textarea aria-label={`Scanned serials for ${row.product.sku}`} placeholder="One serial per line; leave empty for zero" disabled={pending} className="field min-h-24" value={draft(row).serialText} onChange={event => edit(row, 'serialText', event.target.value)}/> : <div className="max-h-40 overflow-auto whitespace-pre-line text-xs">{row.scannedSerials.join('\n') || 'No scanned serials'}</div>}<div className="mt-2">{editable && <ScanInput serial disabled={pending} label={`Scan serial for ${row.product.sku}`} onScan={value => { const values = scans(draft(row).serialText); if (values.includes(value)) { setActionError("This serial is already scanned for this line."); return } edit(row, "serialText", [...values, value].join("\n")) }}/>}</div>{editable && row.countedQuantity === null && !drafts[row.id] && <Button variant="ghost" size="sm" disabled={pending} onClick={() => edit(row, 'serialText', '')}>Confirm zero units</Button>}</div> : editable ? <input type="number" min="0" step="1" aria-label={`Counted quantity for ${row.product.sku}`} disabled={pending} className="field w-24" value={draft(row).countedQuantity} onChange={event => edit(row, 'countedQuantity', event.target.value)}/> : row.countedQuantity ?? 'Not counted' },
        { key: 'variance', label: 'Variance', render: row => { const values = draft(row), quantity = row.product.trackSerialNumbers ? scans(values.serialText).length : Number(values.countedQuantity); return drafts[row.id] ? quantity - row.expectedQuantity : row.variance ?? '—' } },
        { key: 'serials', label: 'Serial reconciliation', render: row => row.product.trackSerialNumbers ? <details className="min-w-48 text-xs"><summary className="cursor-pointer font-semibold text-brand-600">Review serial differences</summary>{[['Expected', row.expectedSerials], ['Scanned', row.scannedSerials], ['Missing', row.missingSerials], ['Unexpected', row.unexpectedSerials]].map(([name, values]) => <div className="mt-3" key={name}><strong>{name} ({values.length})</strong><div className="max-h-32 overflow-auto whitespace-pre-line subtle">{values.join('\n') || 'None'}</div></div>)}</details> : '—' },
        { key: 'notes', label: 'Notes', render: row => editable ? <textarea aria-label={`Count notes for ${row.product.sku}`} disabled={pending} className="field min-w-40" maxLength={4000} value={draft(row).notes} onChange={event => edit(row, 'notes', event.target.value)}/> : <div className="max-w-48 text-xs">{row.notes || '—'}{row.adjustment && <p className="mt-2 font-semibold text-brand-600">{row.adjustment.referenceNumber}</p>}</div> }
      ]}/>
    </>}
    <Modal open={Boolean(confirm)} onOpenChange={value => { if (!pending && !value) setConfirm('') }} title={confirm === 'approve' ? 'Approve inventory corrections' : confirm === 'submit' ? 'Submit stock count' : 'Cancel stock count'} description={confirm === 'approve' ? `Apply ${count.varianceItems} quantity variances and recorded serial differences at ${count.warehouse.name}. New stock changes will require a fresh count.` : confirm === 'submit' ? 'Saved quantities and serials will be locked for approval.' : 'The recorded count will be retained without changing stock.'} footer={<><Button variant="secondary" disabled={pending} onClick={() => setConfirm('')}>Back</Button><Button loading={pending} onClick={() => action(confirm)}>{confirm === 'approve' ? 'Approve corrections' : confirm === 'submit' ? 'Submit count' : 'Cancel count'}</Button></>}><p className="text-sm">{count.countNumber} · {count.countedItems} counted lines</p>{actionError && <p role="alert" className="mt-3 text-sm text-rose-600">{actionError}</p>}</Modal>
  </>
}
