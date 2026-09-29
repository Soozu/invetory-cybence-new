import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, KeyRound, Settings } from 'lucide-react'
import { useInventory } from '../../context/InventoryContext.jsx'
import { changePassword } from '../../services/authService.js'
import { can } from '../../lib/permissions.js'
import { Badge, Button, Card, Field, InfoGrid, Modal, PageHeader, SectionHeading } from '../../components/ui.jsx'

export default function Profile() {
  const navigate = useNavigate()
  const { user: session, users, logs, logout } = useInventory()
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' })
  const [passwordError, setPasswordError] = useState('')
  const [saving, setSaving] = useState(false)
  const user = users.find(row => row.id === session?.id) || {
    ...session,
    name: `${session?.firstName || ''} ${session?.lastName || ''}`.trim(),
    initials: `${session?.firstName?.[0] || ''}${session?.lastName?.[0] || ''}`,
    warehouse: 'All locations', status: session?.status, lastLogin: session?.lastLoginAt || 'Never'
  }
  const recent = logs.filter(row => row.user === user?.name).slice(0, 5)

  const submitPassword = async event => {
    event.preventDefault()
    if (passwords.next.length < 10) { setPasswordError('Use at least 10 characters.'); return }
    if (passwords.next !== passwords.confirm) { setPasswordError('New passwords do not match.'); return }
    setSaving(true)
    setPasswordError('')
    try {
      await changePassword(passwords.current, passwords.next)
      await logout()
      navigate('/login', { replace: true, state: { passwordChanged: true } })
    } catch (error) {
      setPasswordError(error.message || 'Could not change password.')
    } finally { setSaving(false) }
  }

  return <>
    <PageHeader eyebrow="Account" title="My Profile" subtitle="Your account information and recent workspace activity." actions={<>
      <Button variant="secondary" icon={KeyRound} onClick={() => setPasswordOpen(true)}>Change password</Button>
      {can(session, 'settings.VIEW') && <Button variant="secondary" icon={Settings} onClick={() => navigate('/settings')}>Account Settings</Button>}
    </>}/>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
      <Card className="overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-brand-600 to-blue-400"/>
        <div className="px-6 pb-6">
          <div className="-mt-8 flex h-16 w-16 items-center justify-center rounded-2xl border-4 border-[var(--surface)] bg-slate-900 text-lg font-bold text-white shadow-lg">{user?.initials}</div>
          <div className="mt-4 flex flex-wrap items-center gap-3"><h2 className="font-display text-xl font-extrabold">{user?.name}</h2><Badge>{user?.status}</Badge></div>
          <p className="mt-1 text-sm subtle">{user?.role}</p>
          <div className="mt-7 border-t divider pt-6"><InfoGrid items={[["Email", user?.email], ["Role", user?.role], ["Assigned Warehouse", user?.warehouse], ["Last Login", user?.lastLogin], ["Account Status", user?.status]]} columns="md:grid-cols-2"/></div>
        </div>
      </Card>
      <Card className="p-6">
        <SectionHeading title="Recent activity" subtitle="Your latest changes in TechStock" action={<Activity size={16} className="subtle"/>}/>
        <div className="mt-5 space-y-4">{recent.length ? recent.map(item => <div key={item.id} className="flex gap-3 border-b divider pb-4 last:border-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10"><Activity size={15}/></span>
          <div><div className="text-xs font-semibold leading-relaxed">{item.description}</div><div className="mt-1 text-[11px] subtle">{item.date} · {item.module}</div></div>
        </div>) : <p className="text-xs subtle">No recent activity yet.</p>}</div>
        {can(session, 'users.VIEW') && <Button variant="ghost" size="sm" className="mt-3" onClick={() => navigate('/management/activity')}>View all activity</Button>}
      </Card>
    </div>
    <Modal open={passwordOpen} onOpenChange={setPasswordOpen} title="Change password" description="Update your account password. You will sign in again afterward.">
      <form onSubmit={submitPassword} className="space-y-4">
        <Field label="Current password" required><input className="field" type="password" autoComplete="current-password" value={passwords.current} onChange={event => setPasswords(value => ({ ...value, current: event.target.value }))} required/></Field>
        <Field label="New password" required><input className="field" type="password" autoComplete="new-password" minLength={10} value={passwords.next} onChange={event => setPasswords(value => ({ ...value, next: event.target.value }))} required/></Field>
        <Field label="Confirm new password" required><input className="field" type="password" autoComplete="new-password" minLength={10} value={passwords.confirm} onChange={event => setPasswords(value => ({ ...value, confirm: event.target.value }))} required/></Field>
        {passwordError && <p role="alert" className="text-xs text-rose-600">{passwordError}</p>}
        <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="secondary" onClick={() => setPasswordOpen(false)}>Cancel</Button><Button type="submit" loading={saving}>Save password</Button></div>
      </form>
    </Modal>
  </>
}
