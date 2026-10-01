import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useInventory } from '../context/InventoryContext.jsx'
import { Button, Card, Modal } from './ui.jsx'
import { can } from '../lib/permissions.js'
import * as api from '../services/attachmentService.js'

export default function AttachmentPanel({ entityType, entityId }) {
  const { user, notify } = useInventory(), [result, setResult] = useState(null), [error, setError] = useState(''), [revision, setRevision] = useState(0), [page, setPage] = useState(1), [archived, setArchived] = useState(false), [upload, setUpload] = useState(null), [busy, setBusy] = useState(false), [action, setAction] = useState(null), [notes, setNotes] = useState(''), fileInput = useRef(null)
  const module = api.attachmentTypes.find(([type]) => type === entityType)?.[2], view = can(user, 'attachments.VIEW') && can(user, `${module}.VIEW`), edit = can(user, `${module}.EDIT`)
  useEffect(() => {
    if (!view) return
    let active = true; setResult(null); setError('')
    api.getAttachments(entityType, entityId, { page, archived: String(archived) }).then(value => { if (active) setResult(value) }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [entityType, entityId, page, archived, revision, view])
  if (!view) return null
  async function send() {
    if (!upload || busy) return
    setBusy(true); setError('')
    try { await api.uploadAttachment(entityType, entityId, upload.file, upload.key); setUpload(null); if (fileInput.current) fileInput.current.value = ''; setPage(1); setRevision(v => v + 1); notify('Document attached.') }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function download(row) { setBusy(true); setError(''); try { await api.downloadAttachment(row) } catch (e) { setError(e.message) } finally { setBusy(false) } }
  async function change() {
    setBusy(true); setError('')
    try { await api.changeAttachment(action.row.id, action.kind, { expectedUpdatedAt: action.row.updatedAt, notes }); setAction(null); setNotes(''); setPage(1); setRevision(v => v + 1); notify('Attachment action recorded.') }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function reloadAction() {
    setBusy(true)
    try { const fresh = await api.getAttachments(entityType, entityId, { page, archived: 'true' }); const row = fresh.data.find(r => r.id === action.row.id); if (!row) throw Error('The attachment is no longer on this page. Cancel and refresh the list.'); setAction(a => ({ ...a, row })); setError('') } catch(e) { setError(e.message) } finally { setBusy(false) }
  }
  return <Card className="mt-6 space-y-4 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-base font-bold">Document attachments</h2><p className="mt-1 text-xs subtle">{result?.parent?.label || 'Documents for this record'} · Downloads require record access.</p></div><Button variant="secondary" size="sm" disabled={busy} onClick={() => setRevision(v => v + 1)}>Refresh attachments</Button></div>
    {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    {!result && !error && <p role="status" className="text-sm subtle">Loading attachments…</p>}
    {result && <>
      {edit && can(user, 'attachments.CREATE') && <div className="space-y-3 rounded-xl border divider p-4"><label className="block text-sm font-semibold" htmlFor={`attachment-file-${entityType}-${entityId}`}>Choose document</label><input ref={fileInput} id={`attachment-file-${entityType}-${entityId}`} type="file" className="block w-full min-w-0 text-sm" accept={result.policy.extensions.map(e => `.${e}`).join(',')} disabled={busy} onChange={e => { const file=e.target.files?.[0]; setUpload(file ? { file, key: crypto.randomUUID() } : null); setError('') }}/><p className="text-xs subtle">{result.policy.extensions.map(e=>e.toUpperCase()).join(', ')} · Up to {(result.policy.maxBytes/1024/1024).toFixed(1)} MB. Office documents with macros, embedded files or external links are rejected.</p><Button size="sm" disabled={!upload || busy} onClick={send}>{busy ? 'Working…' : 'Upload document'}</Button></div>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={archived} disabled={busy} onChange={e=>{setArchived(e.target.checked);setPage(1)}}/>Include archived attachments</label>
      {!result.data.length && <p className="py-3 text-sm subtle">No attachments for this record.</p>}
      <ul className="space-y-3">{result.data.map(row=><li key={row.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border divider p-4"><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{row.fileName}{row.archivedAt && ' · Archived'}</p><p className="mt-1 text-xs subtle">{(row.size/1024).toFixed(1)} KB · {row.uploadedBy.firstName} {row.uploadedBy.lastName} · {new Date(row.createdAt).toLocaleString()}</p></div><div className="flex flex-wrap gap-2">{!row.archivedAt && <Button size="sm" variant="secondary" disabled={busy} onClick={()=>download(row)}>Download</Button>}{edit && can(user,row.archivedAt?'attachments.EDIT':'attachments.DELETE') && <Button size="sm" variant="secondary" disabled={busy} onClick={()=>{setAction({row,kind:row.archivedAt?'restore':'archive'});setNotes('');setError('')}}>{row.archivedAt?'Restore':'Archive'}</Button>}</div></li>)}</ul>
      <div className="flex flex-wrap items-center gap-3 text-xs subtle"><span>{result.pagination.total} attachments · Page {page} of {result.pagination.totalPages}</span><Button size="sm" variant="secondary" disabled={busy || page<=1} onClick={()=>setPage(v=>v-1)}>Previous attachments</Button><Button size="sm" variant="secondary" disabled={busy || page>=result.pagination.totalPages} onClick={()=>setPage(v=>v+1)}>Next attachments</Button></div>
    </>}
    {action && <Modal open onOpenChange={v=>{if(!v&&!busy)setAction(null)}} title={`${action.kind === 'archive' ? 'Archive' : 'Restore'} attachment`} description={`${action.row.fileName}. Archiving retains the file and upload history; it can be restored.`}><label htmlFor="attachment-action-notes" className="mb-2 block text-sm font-semibold">Action reason</label><textarea id="attachment-action-notes" className="field" rows={3} value={notes} onChange={e=>setNotes(e.target.value)} disabled={busy}/>{error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}<div className="mt-4 flex flex-wrap gap-2"><Button disabled={busy || notes.trim().length<5} onClick={change}>Confirm {action.kind}</Button><Button variant="secondary" disabled={busy} onClick={reloadAction}>Reload attachment</Button><Button variant="secondary" disabled={busy} onClick={()=>setAction(null)}>Cancel</Button></div></Modal>}
  </Card>
}

const detailTargets = [
  [/^\/products\/([^/]+)$/, 'Product'], [/^\/procurement\/suppliers\/([^/]+)$/, 'Supplier'],
  [/^\/procurement\/purchase-requests\/([^/]+)$/, 'PurchaseRequest'], [/^\/procurement\/rfqs\/([^/]+)\/quotations\/([^/]+)$/, 'SupplierQuotation', 2],
  [/^\/procurement\/rfqs\/([^/]+)$/, 'RFQ'], [/^\/procurement\/purchase-orders\/([^/]+)$/, 'PurchaseOrder'],
  [/^\/procurement\/supplier-returns\/([^/]+)$/, 'SupplierReturn'], [/^\/inventory\/transfers\/([^/]+)$/, 'StockTransfer'],
  [/^\/assets\/warranty-claims\/([^/]+)$/, 'WarrantyClaim'], [/^\/assets\/([^/]+)$/, 'Asset']
]
export function RecordAttachments() {
  const { pathname } = useLocation()
  for (const [pattern, type, group=1] of detailTargets) { const match=pattern.exec(pathname); if (match && !['new','assigned','maintenance','preventive-maintenance','warranties','warranty-claims'].includes(match[group])) return <AttachmentPanel key={`${type}-${match[group]}`} entityType={type} entityId={match[group]}/> }
  return null
}
