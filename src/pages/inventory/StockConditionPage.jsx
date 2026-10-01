import { useEffect, useState } from 'react'
import { useInventory } from '../../context/InventoryContext.jsx'
import { can } from '../../lib/permissions.js'
import { shortDate } from '../../lib/format.js'
import { Button, Card, EmptyState, Field, FilterBar, LoadingSkeleton, Modal, PageHeader, SearchInput, Select } from '../../components/ui.jsx'
import ServerTable from '../../components/ServerTable.jsx'
import * as api from '../../services/stockConditionService.js'

const conditions = ['AVAILABLE', 'QUARANTINE', 'DEFECTIVE', 'FOR_REPAIR']
const label = value => value.toLowerCase().replaceAll('_', ' ').replace(/^./, char => char.toUpperCase())
const options = values => values.map(value => ({ value, label: label(value) }))
const emptyPage = { page: 1, total: 0, totalPages: 1 }
const message = error => error.errors?.[0]?.message || error.message
const balances = [['quantity', 'Physical'], ['availableQuantity', 'Available'], ['reservedOnlyQuantity', 'Other holds'], ['quarantineQuantity', 'Quarantine'], ['defectiveQuantity', 'Defective'], ['forRepairQuantity', 'For repair'], ['returnPendingQuantity', 'Return pending']]
const quantity = (row, condition) => row[({ AVAILABLE: 'availableQuantity', QUARANTINE: 'quarantineQuantity', DEFECTIVE: 'defectiveQuantity', FOR_REPAIR: 'forRepairQuantity' })[condition]] || 0

export default function StockConditionPage() {
  const { user, warehouses, notify, refreshData } = useInventory()
  const [tab, setTab] = useState('balances'), [query, setQuery] = useState({ page: 1, search: '', warehouse: '', condition: '' })
  const [rows, setRows] = useState([]), [pagination, setPagination] = useState(emptyPage), [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  const [stock, setStock] = useState(null), [detail, setDetail] = useState(null), [form, setForm] = useState({}), [pending, setPending] = useState(false), [formError, setFormError] = useState('')
  const [serials, setSerials] = useState([]), [serialPage, setSerialPage] = useState(emptyPage), [serialQuery, setSerialQuery] = useState({ page: 1, search: '' }), [serialLoading, setSerialLoading] = useState(false), [serialError, setSerialError] = useState('')
  useEffect(() => {
    let active = true; setLoading(true); setError('')
    const request = tab === 'balances' ? api.listBalances(query) : api.listHistory({ ...query, condition: undefined })
    request.then(result => { if (active) { setRows(result.data); setPagination(result.pagination) } }).catch(error => { if (active) setError(message(error)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [tab, query, retry])
  useEffect(() => {
    if (!stock?.product.trackSerialNumbers) return
    let active = true; setSerialLoading(true); setSerialError('')
    api.listSerials({ ...serialQuery, product: stock.productId, warehouse: stock.warehouseId, condition: form.fromCondition }).then(result => { if (active) { setSerials(result.data); setSerialPage(result.pagination) } }).catch(error => { if (active) setSerialError(message(error)) }).finally(() => { if (active) setSerialLoading(false) })
    return () => { active = false }
  }, [stock, form.fromCondition, serialQuery, retry])
  const filter = (key, value) => setQuery(current => ({ ...current, [key]: value, page: 1 }))
  const selectTab = next => {
    if (next === tab) return
    setLoading(true); setRows([]); setTab(next); setQuery(current => ({ ...current, page: 1, search: '' }))
  }
  const open = row => { setStock(row); setForm({ fromCondition: 'AVAILABLE', toCondition: 'QUARANTINE', quantity: 1, reason: '', serialNumberIds: [] }); setSerialQuery({ page: 1, search: '' }); setSerials([]); setFormError('') }
  const source = value => { setForm(current => ({ ...current, fromCondition: value, serialNumberIds: [], toCondition: current.toCondition === value ? conditions.find(condition => condition !== value) : current.toCondition })); setSerialQuery({ page: 1, search: '' }); setFormError('') }
  async function save(event) {
    event.preventDefault(); setPending(true); setFormError('')
    try {
      await api.changeCondition({ ...form, productId: stock.productId, warehouseId: stock.warehouseId, expectedUpdatedAt: stock.updatedAt })
      setStock(null); setRetry(value => value + 1); notify('Stock condition changed. Physical quantity preserved.'); await refreshData()
    } catch (error) { setFormError(message(error)) } finally { setPending(false) }
  }
  async function reloadBalance() {
    setPending(true); setFormError('')
    try {
      const result = await api.listBalances({ product: stock.productId, warehouse: stock.warehouseId })
      if (!result.data[0]) throw Error('This stock balance is no longer available.')
      setStock(result.data[0]); setForm(current => ({ ...current, serialNumberIds: [] })); setRetry(value => value + 1)
    } catch (error) { setFormError(message(error)) } finally { setPending(false) }
  }
  return <><PageHeader eyebrow="Inventory" title="Stock Conditions" subtitle="Keep inspection, defective and repair stock unavailable until it is cleared. Physical quantities stay unchanged."/>
    <Card className="mb-5 p-4 text-sm subtle">Available stock excludes all holds. Other holds include reservations and existing unclassified holds. Return-pending stock is managed through supplier returns.</Card>
    <div className="mb-4 flex gap-2"><Button variant={tab === 'balances' ? 'primary' : 'secondary'} onClick={() => selectTab('balances')}>Balances</Button><Button variant={tab === 'history' ? 'primary' : 'secondary'} onClick={() => selectTab('history')}>Condition history</Button></div>
    <FilterBar><SearchInput className="w-full sm:w-[240px]" value={query.search} onChange={value => filter('search', value)} placeholder={tab === 'balances' ? 'Search product or SKU' : 'Search condition reference'}/><Select className="w-full sm:w-[190px]" aria-label="Condition warehouse" value={query.warehouse} onChange={value => filter('warehouse', value)} options={warehouses.map(row => ({ value: row.id, label: row.name }))} placeholder="All warehouses"/>{tab === 'balances' && <Select className="w-full sm:w-[170px]" aria-label="Held condition filter" value={query.condition} onChange={value => filter('condition', value)} options={options([...conditions.slice(1), 'RETURN_PENDING'])} placeholder="All conditions"/>}<Button variant="secondary" onClick={() => setRetry(value => value + 1)}>Refresh</Button></FilterBar>
    {error ? <Card><EmptyState title="Conditions unavailable" description={error} action={<Button onClick={() => setRetry(value => value + 1)}>Retry</Button>}/></Card> : loading ? <LoadingSkeleton/> : <ServerTable rows={rows} pagination={pagination} onPage={page => setQuery(current => ({ ...current, page }))} emptyTitle={tab === 'balances' ? 'No matching stock balances' : 'No condition changes'} columns={tab === 'balances' ? [
      { key: 'product', label: 'Product', render: row => <div className="min-w-40"><strong>{row.product.name}</strong><p className="text-xs subtle">{row.product.sku}</p></div> }, { key: 'warehouse', label: 'Warehouse', render: row => row.warehouse.name }, ...balances.map(([key, label]) => ({ key, label })),
      { key: 'actions', label: 'Action', render: row => can(user, 'inventory.EDIT') && <Button size="sm" variant="secondary" aria-label={`Change ${row.product.sku}`} onClick={() => open(row)}>Change</Button> }
    ] : [
      { key: 'referenceNumber', label: 'Reference', render: row => <button className="font-semibold text-brand-600" onClick={() => setDetail(row)}>{row.referenceNumber}</button> }, { key: 'product', label: 'Product', render: row => row.product.sku }, { key: 'warehouse', label: 'Warehouse', render: row => row.warehouse.name },
      { key: 'condition', label: 'Change', render: row => `${label(row.fromCondition)} → ${label(row.toCondition)}` }, { key: 'quantity', label: 'Units' }, { key: 'reason', label: 'Reason', render: row => <p className="min-w-48 max-w-80 break-words">{row.reason}</p> }, { key: 'createdAt', label: 'Date', render: row => shortDate(row.createdAt) }
    ]}/>}
    <Modal open={Boolean(stock)} onOpenChange={open => { if (!open && !pending) setStock(null) }} title="Change stock condition" description={stock ? `${stock.product.sku} · ${stock.warehouse.name}` : ''}>
      {stock && <form onSubmit={save} className="space-y-4"><p className="text-sm subtle">Physical {stock.quantity} · Available {stock.availableQuantity} · Source balance {quantity(stock, form.fromCondition)}</p>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="From condition" required><Select aria-label="From condition" placeholder="Choose condition" required value={form.fromCondition} onChange={source} options={options(conditions)}/></Field><Field label="To condition" required><Select aria-label="To condition" placeholder="Choose condition" required value={form.toCondition} onChange={toCondition => setForm(current => ({ ...current, toCondition }))} options={options(conditions.filter(value => value !== form.fromCondition))}/></Field></div>
        <Field label="Units to change" required><input aria-label="Condition quantity" className="field" type="number" min={1} max={quantity(stock, form.fromCondition)} required value={form.quantity} onChange={event => setForm(current => ({ ...current, quantity: Number(event.target.value) }))}/></Field>
        <Field label="Reason / inspection result" required><textarea aria-label="Condition reason" className="field" rows={3} required minLength={3} maxLength={1000} value={form.reason} onChange={event => setForm(current => ({ ...current, reason: event.target.value }))}/></Field>
        {stock.product.trackSerialNumbers && <fieldset><legend className="mb-2 text-sm font-semibold">Exact serials · {form.serialNumberIds.length} selected / {form.quantity} required</legend><SearchInput value={serialQuery.search} onChange={search => setSerialQuery({ page: 1, search })} placeholder="Find source serial"/>
          {serialError ? <p role="alert" className="text-sm text-rose-600">{serialError}</p> : serialLoading ? <p className="py-3 text-sm subtle">Loading serials…</p> : <div className="my-3 max-h-48 space-y-2 overflow-y-auto rounded-xl border divider p-3">{serials.length ? serials.map(serial => <label key={serial.id} className="flex items-start gap-2 break-all text-sm"><input type="checkbox" aria-label={`Condition serial ${serial.serialNumber}`} checked={form.serialNumberIds.includes(serial.id)} onChange={event => setForm(current => ({ ...current, serialNumberIds: event.target.checked ? [...current.serialNumberIds, serial.id] : current.serialNumberIds.filter(id => id !== serial.id) }))}/>{serial.serialNumber}</label>) : <p className="text-sm subtle">No eligible serials in this condition.</p>}</div>}
          <div className="flex items-center justify-between gap-2 text-xs subtle"><span>Page {serialPage.page} of {Math.max(1, serialPage.totalPages)}</span><div className="flex gap-2"><Button type="button" size="sm" variant="secondary" disabled={serialLoading || serialPage.page <= 1} onClick={() => setSerialQuery(current => ({ ...current, page: current.page - 1 }))}>Previous serials</Button><Button type="button" size="sm" variant="secondary" disabled={serialLoading || serialPage.page >= serialPage.totalPages} onClick={() => setSerialQuery(current => ({ ...current, page: current.page + 1 }))}>Next serials</Button></div></div>
        </fieldset>}
        {formError && <p role="alert" className="text-sm text-rose-600">{formError}</p>}
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={pending} onClick={reloadBalance}>Reload balance</Button><Button type="submit" loading={pending} disabled={serialLoading || Boolean(serialError) || (stock.product.trackSerialNumbers && form.serialNumberIds.length !== form.quantity)}>Save condition change</Button></div>
      </form>}
    </Modal>
    <Modal open={Boolean(detail)} onOpenChange={open => { if (!open) setDetail(null) }} title={detail?.referenceNumber || 'Condition change'} description={detail ? `${detail.product.sku} · ${detail.warehouse.name}` : ''}>
      {detail && <div className="space-y-4 text-sm"><p>{detail.quantity} units · {label(detail.fromCondition)} → {label(detail.toCondition)}</p><p className="whitespace-pre-wrap break-words">{detail.reason}</p><p className="subtle">By {detail.user.firstName} {detail.user.lastName} · {shortDate(detail.createdAt)}</p><div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="py-2">Balance</th><th>Before</th><th>After</th></tr></thead><tbody>{balances.map(([key, name]) => <tr key={key} className="border-t divider"><td className="py-2">{name}</td><td>{detail.beforeBalances[key]}</td><td>{detail.afterBalances[key]}</td></tr>)}</tbody></table></div>{detail.serialSelections.length > 0 && <div><p className="mb-2 font-semibold">Exact serials</p>{detail.serialSelections.map(selection => <p key={selection.serialNumberId} className="break-all">{selection.serialNumber.serialNumber}</p>)}</div>}</div>}
    </Modal>
  </>
}
