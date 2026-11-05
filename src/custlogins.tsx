// The customer card (Settings > Customers): who logs in to the portal for this customer (SQL 203).
// Sales Admins, Admins and Owners add logins here and make the invite link; anyone with Sales can see the list.
import { useCallback, useEffect, useState } from 'react'
import type { Backend } from './api'
import { LinkBox } from './users'

interface Login { email: string; name: string | null; phone: string | null; last_seen: string | null; claimed: boolean; invited_at: string | null }
const ago = (s: string | null) => s ? new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''

export function CustomerLogins({ backend, customerId, customerName, flash }: { backend: Backend; customerId: number; customerName: string; flash: (t: string, bad?: boolean) => void }) {
  const sb = backend.client()
  const [rows, setRows] = useState<Login[] | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [add, setAdd] = useState<{ email: string; name: string; phone: string } | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    if (!sb) return
    const { data, error } = await sb.rpc('customer_logins', { p_customer: customerId })
    if (error) { setRows([]); return }
    const d = data as { can_edit: boolean; users: Login[] }
    setRows(d.users ?? []); setCanEdit(!!d.can_edit)
  }, [sb, customerId])
  useEffect(() => { load() }, [load])
  if (!sb || rows == null) return null
  const run = async (f: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    setBusy(true)
    try { const { error } = await f(); if (error) flash(error.message, true); else { flash(ok); await load() } } finally { setBusy(false) }
  }
  return (
    <div className="field custlogins">
      <label>Portal logins <span className="muted">({rows.length})</span></label>
      {!rows.length && <p className="muted small">Nobody logs in for {customerName} yet.</p>}
      <div className="dlist">
        {rows.map(u => <div key={u.email}>
          <div className="drow">
            <span className="grow"><b>{u.name || u.email}</b> <span className="muted">{[u.name ? u.email : '', u.phone, u.claimed ? 'login set up' : u.invited_at ? `invited ${ago(u.invited_at)}, not set up yet` : 'not invited yet', u.last_seen ? `last in ${ago(u.last_seen)}` : ''].filter(Boolean).join(' · ')}</span></span>
            {canEdit && <button className="ghost small" onClick={() => setOpen(open === u.email ? null : u.email)}>{u.claimed ? 'Reset link' : 'Invite link'}</button>}
            {canEdit && <button className="ghost small" disabled={busy} onClick={() => { if (window.confirm(`Turn off ${u.email}'s login for ${customerName}?`)) run(() => sb.rpc('remove_customer_login', { p_email: u.email }), 'Login turned off') }}>Turn off</button>}
          </div>
          {open === u.email && <LinkBox backend={backend} email={u.email} claimed={u.claimed} flash={flash} onLinked={load} />}
        </div>)}
      </div>
      {canEdit && !add && <button className="ghost small" onClick={() => setAdd({ email: '', name: '', phone: '' })}>+ Add a login</button>}
      {canEdit && add && <div className="dlist">
        <input type="email" autoFocus placeholder="Email" value={add.email} onChange={e => setAdd({ ...add, email: e.target.value })} />
        <input placeholder="Name" value={add.name} onChange={e => setAdd({ ...add, name: e.target.value })} />
        <input type="tel" placeholder="Phone (optional)" value={add.phone} onChange={e => setAdd({ ...add, phone: e.target.value })} />
        <div className="row end">
          <button className="ghost small" onClick={() => setAdd(null)}>Cancel</button>
          <button className="primary small" disabled={busy || !add.email.trim()} onClick={async () => {
            const em = add.email.trim().toLowerCase()
            await run(() => sb.rpc('save_customer_login', { p_customer: customerId, p_email: em, p_name: add.name, p_phone: add.phone }), `${em} added. Make their invite link.`)
            setAdd(null); setOpen(em)
          }}>Add</button>
        </div>
        <p className="muted small">They'll only ever see {customerName}'s reserves, menu and orders. After adding, make the invite link and send it to them.</p>
      </div>}
    </div>
  )
}
