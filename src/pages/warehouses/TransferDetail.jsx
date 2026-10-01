import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useInventory } from '../../context/InventoryContext.jsx'
import { can } from '../../lib/permissions.js'
import { Badge, Button, Card, Field, LoadingSkeleton, Modal, PageHeader } from '../../components/ui.jsx'
import { getTransfer, recordTransferArrival, resolveTransferDiscrepancy } from '../../services/transferService.js'

const label = value => value.toLowerCase().replaceAll('_', ' ')
const scans = value => value.split(/\r?\n/).map(row => row.trim()).filter(Boolean)
const outstanding = item => item.quantity - item.receivedQuantity - item.lostQuantity - item.returnedQuantity
const actions = { MISSING: ['RECEIVE_LATE', 'MARK_LOST', 'RETURN_TO_SOURCE'], DAMAGED: ['ACKNOWLEDGE_QUARANTINE'], UNEXPECTED: ['RETURN_UNEXPECTED', 'DOCUMENT_DISPOSITION'] }
const actionLabels = { INVESTIGATE: 'Add investigation note', RECEIVE_LATE: 'Record physically recovered units', MARK_LOST: 'Confirm lost units', RETURN_TO_SOURCE: 'Record physical return to source', ACKNOWLEDGE_QUARANTINE: 'Acknowledge damage; retain quarantine', RETURN_UNEXPECTED: 'Confirm unexpected units returned', DOCUMENT_DISPOSITION: 'Document unexpected unit disposition' }

export default function TransferDetail() {
  const { id } = useParams(), { user, refreshData, notify } = useInventory()
  const [record, setRecord] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [form, setForm] = useState(null), [pending, setPending] = useState(false)
  const requests = useRef(0)
  async function load(rebase = false) {
    const current = ++requests.current
    setLoading(true)
    try {
      const response = await getTransfer(id)
      if (current !== requests.current) return
      setRecord(response.data); setError('')
      if (rebase) setForm(previous => previous && ({ ...previous, expectedUpdatedAt: response.data.updatedAt, expectedDiscrepancyUpdatedAt: response.data.discrepancies.find(row => row.id === previous.caseId)?.updatedAt }))
    } catch (err) { if (current === requests.current) setError(err.message) }
    finally { if (current === requests.current) setLoading(false) }
  }
  useEffect(() => { setRecord(null); setForm(null); load(); return () => { requests.current++ } }, [id])
  const access = warehouseId => user?.role === 'Administrator' || user?.warehouseIds?.includes(warehouseId)
  const receiving = record && access(record.destinationWarehouseId) && can(user, 'inventory.EDIT') && !record.arrivalClosedAt && ['IN_TRANSIT', 'PARTIAL', 'DISCREPANCY'].includes(record.status)
  function openArrival() {
    setError(''); setForm({ mode: 'arrival', expectedUpdatedAt: record.updatedAt, finalArrival: false, notes: '', unexpected: [], items: Object.fromEntries(record.items.map(item => [item.id, { goodQuantity: 0, damagedQuantity: 0, goodSerials: '', damagedSerials: '' }])) })
  }
  function openCase(row, investigate) {
    setError(''); setForm({ mode: 'case', caseId: row.id, expectedUpdatedAt: record.updatedAt, expectedDiscrepancyUpdatedAt: row.updatedAt, action: investigate ? 'INVESTIGATE' : actions[row.kind][0], quantity: investigate ? 0 : row.quantity - row.resolvedQuantity, condition: 'QUARANTINE', notes: '' })
  }
  function changeLine(lineId, key, value) { setForm(previous => ({ ...previous, items: { ...previous.items, [lineId]: { ...previous.items[lineId], [key]: value } } })) }
  async function submit() {
    setPending(true); setError('')
    try {
      const response = form.mode === 'arrival' ? await recordTransferArrival(id, {
        expectedUpdatedAt: form.expectedUpdatedAt, finalArrival: form.finalArrival, notes: form.notes,
        items: Object.entries(form.items).map(([lineId, row]) => ({ id: lineId, goodQuantity: Number(row.goodQuantity), damagedQuantity: Number(row.damagedQuantity), goodSerials: scans(row.goodSerials), damagedSerials: scans(row.damagedSerials) })),
        unexpected: form.unexpected.map(row => ({ ...row, quantity: Number(row.quantity), serialNumber: row.serialNumber.trim() || undefined }))
      }) : await resolveTransferDiscrepancy(id, form.caseId, { expectedUpdatedAt: form.expectedUpdatedAt, expectedDiscrepancyUpdatedAt: form.expectedDiscrepancyUpdatedAt, action: form.action, quantity: Number(form.quantity), condition: form.condition, notes: form.notes })
      requests.current++; setRecord(response.data); setForm(null); notify('Transfer record saved.')
      try { await refreshData() } catch { setError('Saved successfully. Reload the overview to refresh its balances.') }
    } catch (err) { setError(err.message) }
    finally { setPending(false) }
  }
  const caseRow = record?.discrepancies.find(row => row.id === form?.caseId)
  return <>
    <Link to="/inventory/transfers" className="mb-5 flex items-center gap-2 text-sm text-brand-600"><ArrowLeft size={15}/>Back to transfers</Link>
    <PageHeader eyebrow="Warehouse transfer" title={record?.transferNumber || 'Transfer detail'} subtitle={record ? `${record.sourceWarehouse.name} → ${record.destinationWarehouse.name}` : 'Loading transfer…'} actions={<div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={loading || pending} onClick={() => load()}>Reload transfer</Button>{receiving && <Button disabled={loading || pending} onClick={openArrival}>Record arrival</Button>}</div>}/>
    {!form && error && <p role="alert" className="mb-4 text-sm text-rose-600">{error}</p>}
    {!record ? loading ? <LoadingSkeleton/> : <Card className="p-5">Transfer could not be loaded.</Card> : <>
      <Card className="mb-5 space-y-2 p-5"><Badge>{label(record.status)}</Badge><p className="text-sm">{record.notes || 'No transfer notes.'}</p><p className="text-xs subtle">{record.arrivalClosedAt ? 'Arrival closed. Missing units require explicit resolution.' : 'Only physically received units enter destination stock.'} Damaged units enter quarantine; acknowledgement retains their hold.</p></Card>
      <div className="mb-5 grid gap-4 lg:grid-cols-2">{record.items.map(item => <Card className="min-w-0 space-y-2 p-5" key={item.id}><Link to={`/products/${item.productId}`} className="font-semibold text-brand-600">{item.product.name}</Link><p className="text-xs subtle">{item.product.sku}</p><p className="text-sm">Shipped {item.quantity} · Received {item.receivedQuantity} · Outstanding {outstanding(item)}</p><p className="text-sm">Lost {item.lostQuantity} · Returned to source {item.returnedQuantity}</p>{item.serialSelections.length > 0 && <details className="text-xs"><summary className="cursor-pointer">Exact shipped identities</summary>{item.serialSelections.map(row => <p key={row.serialNumberId} className="mt-2 break-all">{row.serialNumber.serialNumber} · {label(row.outcome)} · {label(row.serialNumber.status)}</p>)}</details>}</Card>)}</div>
      <h2 className="mb-3 font-semibold">Discrepancies & investigation</h2>
      {!record.discrepancies.length && <Card className="mb-5 p-5 text-sm subtle">No discrepancies recorded.</Card>}
      {record.discrepancies.map(row => <Card className="mb-4 min-w-0 space-y-3 p-5" key={row.id}>
        <div className="flex flex-wrap items-center justify-between gap-2"><strong className="capitalize">{label(row.kind)} · {record.items.find(item => item.id === row.transferItemId)?.product.sku}</strong><Badge>{row.resolvedQuantity === row.quantity ? 'Resolved' : 'Open'}</Badge></div>
        {row.observedSerial && <p className="break-all text-sm">Serial: {row.observedSerial}</p>}<p className="text-sm">Quantity {row.quantity} · Unresolved {row.quantity - row.resolvedQuantity}</p><p className="whitespace-pre-wrap break-words text-sm">{row.notes}</p>
        {row.kind === 'UNEXPECTED' && <p className="text-xs subtle">Observation only. Stock and serial ownership have not changed.</p>}
        {row.resolutions.map(resolution => <div key={resolution.id} className="rounded-lg border divider p-3 text-xs"><strong>{actionLabels[resolution.action]} · {resolution.quantity} units</strong><p className="mt-1 whitespace-pre-wrap break-words">{resolution.notes}</p><p className="mt-1 subtle">{resolution.user.firstName} {resolution.user.lastName} · {new Date(resolution.createdAt).toLocaleString()}</p></div>)}
        {row.resolvedQuantity < row.quantity && <div className="flex flex-wrap gap-2">{can(user, 'inventory.EDIT') && <Button variant="secondary" disabled={pending || loading} onClick={() => openCase(row, true)}>Add investigation</Button>}{access(record.destinationWarehouseId) && can(user, 'inventory.APPROVE') && <Button disabled={pending || loading} onClick={() => openCase(row, false)}>Resolve discrepancy</Button>}</div>}
      </Card>)}
      <h2 className="mb-3 mt-5 font-semibold">Arrival history</h2>
      {!record.arrivals.length && <Card className="p-5 text-sm subtle">No arrival ledger. Older completed transfers retain their original receipt quantities and shipped selections.</Card>}
      {record.arrivals.map(row => <Card key={row.id} className="mb-3 space-y-2 p-5"><strong>{row.referenceNumber}</strong><p className="text-xs subtle">{row.receivedBy.firstName} {row.receivedBy.lastName} · {new Date(row.createdAt).toLocaleString()} · {row.finalArrival ? 'Final arrival' : 'Partial arrival'}</p><p className="whitespace-pre-wrap break-words text-sm">{row.notes}</p>{row.lines.map(line => <p key={line.transferItemId} className="text-sm">{record.items.find(item => item.id === line.transferItemId)?.product.sku}: {line.goodQuantity} good, {line.damagedQuantity} quarantined</p>)}</Card>)}
    </>}
    {form && record && <Modal open title={form.mode === 'arrival' ? 'Record physical arrival' : form.action === 'INVESTIGATE' ? 'Investigate discrepancy' : 'Resolve discrepancy'} description={record.transferNumber} width="max-w-3xl" onOpenChange={value => { if (!value && !pending) { setForm(null); setError('') } }} footer={<><Button variant="secondary" disabled={pending} onClick={() => { setForm(null); setError('') }}>Cancel</Button><Button loading={pending} disabled={loading || !form.notes.trim() || (form.mode === 'case' && (!caseRow || caseRow.resolvedQuantity === caseRow.quantity))} onClick={submit}>Save record</Button></>}>
      <div className="max-h-[60vh] space-y-4 overflow-auto">
        {form.mode === 'arrival' ? <>
          <p className="text-xs subtle">Enter this arrival only. Good units become available; damaged units are held in quarantine. Exact shipped serials are required. Unexpected observations add no stock.</p>
          {record.items.map(item => <div key={item.id} className="space-y-3 rounded-xl border divider p-4"><strong className="text-sm">{item.product.sku} · {outstanding(item)} outstanding</strong><div className="grid gap-3 sm:grid-cols-2">{['good', 'damaged'].map(kind => <div key={kind}><Field label={`${kind === 'good' ? 'Good' : 'Damaged'} quantity`}><input aria-label={`${item.product.sku} ${kind} quantity`} type="number" min="0" max={outstanding(item)} className="field" disabled={pending} value={form.items[item.id][`${kind}Quantity`]} onChange={event => changeLine(item.id, `${kind}Quantity`, event.target.value)}/></Field>{item.product.trackSerialNumbers && <Field label={`${kind === 'good' ? 'Good' : 'Damaged'} serials — one per line`}><textarea aria-label={`${item.product.sku} ${kind} serials`} className="field mt-2 min-h-24" disabled={pending} value={form.items[item.id][`${kind}Serials`]} onChange={event => changeLine(item.id, `${kind}Serials`, event.target.value)}/></Field>}</div>)}</div>{item.product.trackSerialNumbers && <details className="text-xs"><summary>Remaining shipped serials</summary>{item.serialSelections.filter(row => row.outcome === 'IN_TRANSIT').map(row => <p className="mt-1 break-all" key={row.serialNumberId}>{row.serialNumber.serialNumber}</p>)}</details>}</div>)}
          <Button variant="secondary" disabled={pending || form.unexpected.length >= 100} onClick={() => setForm(previous => ({ ...previous, unexpected: [...previous.unexpected, { id: record.items[0].id, quantity: 1, serialNumber: '', notes: '' }] }))}>Add unexpected observation</Button>
          {form.unexpected.map((row, index) => <div key={index} className="space-y-2 rounded-xl border divider p-4"><p className="text-sm font-semibold">Unexpected observation {index + 1}</p>{[['id', 'Related transfer line'], ['quantity', 'Observed quantity'], ['serialNumber', 'Unexpected serial'], ['notes', 'Observation notes']].map(([key, title]) => <Field label={title} key={key}>{key === 'id' ? <select aria-label={`${title} ${index + 1}`} className="field" disabled={pending} value={row.id} onChange={event => setForm(previous => ({ ...previous, unexpected: previous.unexpected.map((value, i) => i === index ? { ...value, [key]: event.target.value } : value) }))}>{record.items.map(item => <option key={item.id} value={item.id}>{item.product.sku}</option>)}</select> : <input aria-label={`${title} ${index + 1}`} className="field" type={key === 'quantity' ? 'number' : 'text'} min={key === 'quantity' ? 1 : undefined} value={row[key]} disabled={pending} onChange={event => setForm(previous => ({ ...previous, unexpected: previous.unexpected.map((value, i) => i === index ? { ...value, [key]: event.target.value } : value) }))}/>}</Field>)}<Button variant="secondary" disabled={pending} onClick={() => setForm(previous => ({ ...previous, unexpected: previous.unexpected.filter((_, i) => i !== index) }))}>Remove observation {index + 1}</Button></div>)}
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={pending} checked={form.finalArrival} onChange={event => setForm(previous => ({ ...previous, finalArrival: event.target.checked }))}/>Final arrival: close normal receiving and open cases for all remaining missing units.</label>
        </> : <>
          {form.action !== 'INVESTIGATE' && <><Field label="Resolution"><select aria-label="Resolution" className="field" value={form.action} disabled={pending} onChange={event => setForm(previous => ({ ...previous, action: event.target.value }))}>{(actions[caseRow?.kind] || []).filter(value => value !== 'RETURN_TO_SOURCE' || access(record.sourceWarehouseId)).map(value => <option key={value} value={value}>{actionLabels[value]}</option>)}</select></Field><Field label="Units resolved in this action"><input aria-label="Units resolved" className="field" type="number" min="1" max={caseRow?.quantity - caseRow?.resolvedQuantity} value={form.quantity} disabled={pending} onChange={event => setForm(previous => ({ ...previous, quantity: event.target.value }))}/></Field>{form.action === 'RECEIVE_LATE' && <Field label="Recovered unit condition"><select aria-label="Recovered unit condition" className="field" value={form.condition} disabled={pending} onChange={event => setForm(previous => ({ ...previous, condition: event.target.value }))}><option value="QUARANTINE">Quarantine pending inspection</option><option value="AVAILABLE">Available — inspected and cleared</option></select></Field>}</>}
          <p className="text-xs subtle">{form.action === 'ACKNOWLEDGE_QUARANTINE' ? 'Acknowledgement preserves the stock hold. Use Stock Conditions for a separate inspected condition change.' : form.action === 'RETURN_TO_SOURCE' ? 'Physically returned units enter source quarantine. Both warehouse assignments are required.' : form.action === 'MARK_LOST' ? 'Shipment already removed these units. This action records loss without subtracting stock again.' : form.action === 'INVESTIGATE' ? 'Add findings without changing stock or resolving quantity.' : 'Record the actual investigation outcome. Unexpected observations never create inventory.'}</p>
        </>}
        <Field label="Inspection / investigation notes" required><textarea aria-label="Inspection / investigation notes" disabled={pending} className="field min-h-24" value={form.notes} onChange={event => setForm(previous => ({ ...previous, notes: event.target.value }))}/></Field>
        {error && <div role="alert" className="space-y-2"><p className="text-sm text-rose-600">{error}</p><Button variant="secondary" disabled={pending || loading} onClick={() => load(true)}>Reload transfer; retain inputs</Button></div>}
      </div>
    </Modal>}
  </>
}
