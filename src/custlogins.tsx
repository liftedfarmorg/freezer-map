// Customer portal logins (SQL 203, 208).
//  * CustomerLogins: the customer card (Settings > Customers) lists who logs in for that customer.
//  * AllCustomerLogins: Sales > Settings > Customer logins, every customer login in one list.
// Owners, the Admin module and Sales Admins add logins, make invite/reset links, turn logins off and View as.
// Anyone with Sales can see the lists.
import { useCallback, useEffect, useState } from 'react'
import type { Backend } from './api'
import type { Customer } from './types'
import { LinkBox } from './users'
import { useSaved } from './saved'

interface Login { email: string; name: string | null; phone: string | null; last_seen: string | null; claimed: boolean; invited_at: string | null; customer_id?: number; customer?: string }
interface LoginList { can_edit: boolean; can_view_as?: boolean; users: Login[] }
type Flash = (t: string, bad?: boolean) => void
type Sb = NonNullable<ReturnType<Backend['client']>>
const ago = (s: string | null) => s ? new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''
const status = (u: Login) => u.claimed ? 'login set up' : u.invited_at ? `invited ${ago(u.invited_at)}, not set up yet` : 'not invited yet'

async function viewAs(sb: Sb, email: string, flash: Flash) {
  const { error } = await sb.rpc('start_view_as', { p_email: email })
  if (error) flash(/can_view_as_customers/.test(error.message) ? 'Run 208_customer_logins_view_as.sql in Supabase first' : error.message, true)
  else location.reload()
}

function useRun(flash: Flash, load: () => Promise<void>) {
  const [busy, setBusy] = useState(false)
  const run = async (f: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    setBusy(true)
    try { const { error } = await f(); if (error) { flash(error.message, true); return false } flash(ok); await load(); return true } finally { setBusy(false) }
  }
  return { busy, run }
}

function LoginRow({ backend, sb, u, list, customerName, showCustomer, open, setOpen, busy, run, flash, load }: {
  backend: Backend; sb: Sb; u: Login; list: LoginList; customerName: string; showCustomer?: boolean
  open: string | null; setOpen: (e: string | null) => void; busy: boolean
  run: (f: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => Promise<boolean>; flash: Flash; load: () => Promise<void>
}) {
  return <div>
    <div className="drow">
      <span className="grow">
        <b>{u.name || u.email}</b>{showCustomer && <span className="pill" style={{ marginLeft: 6 }}>{customerName}</span>}{' '}
        <span className="muted">{[u.name ? u.email : '', u.phone, status(u), u.last_seen ? `last in ${ago(u.last_seen)}` : ''].filter(Boolean).join(' · ')}</span>
      </span>
      {list.can_view_as && <button className="ghost small" title="See the portal the way they see it (read only, this tab only, 2 hours)" onClick={() => viewAs(sb, u.email, flash)}>View as</button>}
      {list.can_edit && <button className="ghost small" onClick={() => setOpen(open === u.email ? null : u.email)}>{u.claimed ? 'Reset link' : 'Invite link'}</button>}
      {list.can_edit && <button className="ghost small" disabled={busy} onClick={() => { if (window.confirm(`Turn off ${u.email}'s login for ${customerName}?`)) run(() => sb.rpc('remove_customer_login', { p_email: u.email }), 'Login turned off') }}>Turn off</button>}
    </div>
    {open === u.email && <LinkBox backend={backend} email={u.email} claimed={u.claimed} flash={flash} onLinked={load} />}
  </div>
}

function AddLogin({ customers, fixed, busy, onCancel, onAdd }: {
  customers?: Customer[]; fixed?: { id: number; name: string }; busy: boolean
  onCancel: () => void; onAdd: (customerId: number, email: string, name: string, phone: string) => void
}) {
  const [a, setA] = useState({ cust: fixed?.id ?? 0, email: '', name: '', phone: '' })
  const custName = fixed?.name ?? customers?.find(c => c.id === a.cust)?.name ?? 'this customer'
  return <div className="dlist">
    {!fixed && <select value={a.cust} onChange={e => setA({ ...a, cust: Number(e.target.value) })}>
      <option value={0}>Pick the customer…</option>
      {(customers ?? []).filter(c => c.active && c.kind === 'external').sort((x, y) => x.name.localeCompare(y.name)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>}
    <input type="email" autoFocus={!!fixed} placeholder="Email" value={a.email} onChange={e => setA({ ...a, email: e.target.value })} />
    <input placeholder="Name" value={a.name} onChange={e => setA({ ...a, name: e.target.value })} />
    <input type="tel" placeholder="Phone (optional)" value={a.phone} onChange={e => setA({ ...a, phone: e.target.value })} />
    <div className="row end">
      <button className="ghost small" onClick={onCancel}>Cancel</button>
      <button className="primary small" disabled={busy || !a.email.trim() || !a.cust} onClick={() => onAdd(a.cust, a.email.trim().toLowerCase(), a.name, a.phone)}>Add</button>
    </div>
    <p className="muted small">They'll only ever see {custName}'s reserves, menu and orders. After adding, make the invite link and send it to them.</p>
  </div>
}

export function CustomerLogins({ backend, customerId, customerName, flash }: { backend: Backend; customerId: number; customerName: string; flash: Flash }) {
  const sb = backend.client()
  const [list, setList] = useState<LoginList | null>(null)
  const [add, setAdd] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const load = useCallback(async () => {
    if (!sb) return
    const { data, error } = await sb.rpc('customer_logins', { p_customer: customerId })
    if (error) { setList({ can_edit: false, users: [] }); return }
    const d = data as LoginList
    setList({ ...d, users: d.users ?? [] })
  }, [sb, customerId])
  useEffect(() => { load() }, [load])
  const { busy, run } = useRun(flash, load)
  if (!sb || list == null) return null
  const rows = list.users
  return (
    <div className="field custlogins">
      <label>Portal logins <span className="muted">({rows.length})</span></label>
      {!rows.length && <p className="muted small">Nobody logs in for {customerName} yet.</p>}
      <div className="dlist">
        {rows.map(u => <LoginRow key={u.email} backend={backend} sb={sb} u={u} list={list} customerName={customerName} open={open} setOpen={setOpen} busy={busy} run={run} flash={flash} load={load} />)}
      </div>
      {list.can_edit && !add && <button className="ghost small" onClick={() => setAdd(true)}>+ Add a login</button>}
      {list.can_edit && add && <AddLogin fixed={{ id: customerId, name: customerName }} busy={busy} onCancel={() => setAdd(false)}
        onAdd={async (cid, em, name, phone) => { if (await run(() => sb.rpc('save_customer_login', { p_customer: cid, p_email: em, p_name: name, p_phone: phone }), `${em} added. Make their invite link.`)) { setAdd(false); setOpen(em) } }} />}
    </div>
  )
}

export function AllCustomerLogins({ backend, customers, flash }: { backend: Backend; customers: Customer[]; flash: Flash }) {
  const sb = backend.client()
  const [list, setList] = useState<LoginList | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useSaved('custlogins.AllCustomerLogins.q', '')
  const [add, setAdd] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const load = useCallback(async () => {
    if (!sb) return
    const { data, error } = await sb.rpc('all_customer_logins')
    if (error) { setErr(/all_customer_logins/.test(error.message) ? 'Run 208_customer_logins_view_as.sql in Supabase first.' : error.message); setList({ can_edit: false, users: [] }); return }
    const d = data as LoginList
    setErr(null); setList({ ...d, users: d.users ?? [] })
  }, [sb])
  useEffect(() => { load() }, [load])
  const { busy, run } = useRun(flash, load)
  if (!sb || list == null) return <p className="muted">Loading…</p>
  const ql = q.trim().toLowerCase()
  const rows = list.users.filter(u => !ql || `${u.email} ${u.name ?? ''} ${u.customer ?? ''} ${u.phone ?? ''}`.toLowerCase().includes(ql))
  const setUp = list.users.filter(u => u.claimed).length
  return (
    <div className="custlogins">
      <p className="muted small">{list.users.length} customer logins, {setUp} set up. {list.can_edit ? 'Add a login, make the invite or reset link, turn one off, or View as to see the portal the way they do (this tab only).' : 'Only Sales Admins, Admins and Owners can change these.'}</p>
      {err && <div className="warnbox">{err}</div>}
      <div className="row toolbar">
        <input className="search" type="search" placeholder="Search name, email or customer" value={q} onChange={e => setQ(e.target.value)} />
        {list.can_edit && !add && <button className="primary" onClick={() => setAdd(true)}>+ Add a login</button>}
      </div>
      {list.can_edit && add && <AddLogin customers={customers} busy={busy} onCancel={() => setAdd(false)}
        onAdd={async (cid, em, name, phone) => { if (await run(() => sb.rpc('save_customer_login', { p_customer: cid, p_email: em, p_name: name, p_phone: phone }), `${em} added. Make their invite link.`)) { setAdd(false); setOpen(em) } }} />}
      {!rows.length && !err && <p className="muted">{ql ? 'Nobody matches.' : 'No customer logins yet.'}</p>}
      <div className="dlist">
        {rows.map(u => <LoginRow key={u.email} backend={backend} sb={sb} u={u} list={list} customerName={u.customer ?? ''} showCustomer open={open} setOpen={setOpen} busy={busy} run={run} flash={flash} load={load} />)}
      </div>
    </div>
  )
}
