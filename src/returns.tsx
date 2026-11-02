import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Customer } from './types'
import { Select } from './combo'
import { money, rpc } from './ship'

// 159: Sales > Returns. Start a return from a shipped order (same permission as making an order). Distribution > Inbound receives it
// in METRC; that makes the credit memo (Product Return), which goes to QuickBooks 30 minutes later (or Send now in Accounting).

type Flash = (t: string, bad?: boolean) => void
interface RLine { id: number; strain: string; crop_year: number | null; site: string | null; lbs: number; received_lbs: number; price: number | null; tags: string[]
  packages: { tag: string; lbs: number; code: string | null; at: string }[] }
interface Credit { id: number; number: string; total: number; date: string; status: string; acct_status: 'pending' | 'sent' | 'error' | 'skip'; qbo_doc: string | null; error: string | null; sent_at: string | null; created_at: string }
interface Ret { id: number; rma: string; status: 'open' | 'received' | 'credited' | 'cancelled'; reason: string; notes: string | null; manifest: string | null
  customer_id: number; customer: string; order_id: number | null; so: string | null; created_by: string | null; created_at: string; received_at: string | null
  lines: RLine[]; credits: Credit[] }
interface ShippedOrder { id: number; so: string | null; customer_id: number; customer: string; shipped: string | null; lbs: number; strains: string | null }
interface OLine { id: number; strain: string; crop_year: number | null; product: string; shipped_lbs: number; returned_lbs: number; price: number | null; invoice: string | null; tags: string[]; site: string | null }

export const REASONS: Record<string, string> = { quality: 'Quality', wrong_strain: 'Wrong strain', overshipped: 'Overshipped', damaged: 'Damaged', yield: 'Yield', other: 'Other' }
const STATUS: Record<Ret['status'], [string, string]> = { open: ['Waiting for the product', 'm-warn'], received: ['Received', 'm-ok'], credited: ['Credited', 'm-ok'], cancelled: ['Cancelled', 'm-off'] }
const ACCT: Record<Credit['acct_status'], string> = { pending: 'goes to QuickBooks 30 min after it was made', sent: 'in QuickBooks', error: 'not sent', skip: 'not sent' }
const n2 = (x: number | null | undefined) => Number(x ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })
const day = (s: string | null | undefined) => (s ? new Date(s.length <= 10 ? s + 'T12:00:00' : s).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '')

async function qboRun<T>(sb: SupabaseClient, body: object): Promise<T> {
  const { data } = await sb.auth.getSession()
  const r = await fetch('/api/qbo/run', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({ error: `The server didn't answer (${r.status})` }))
  if (!r.ok) throw new Error(j.error ?? `Error ${r.status}`)
  return j as T
}

export function ReturnsView({ sb, customers, flash, canEdit, canSend }: { sb: SupabaseClient | null; customers: Customer[]; flash: Flash; canEdit: boolean; canSend: boolean }) {
  const [rows, setRows] = useState<Ret[] | null>(null)
  const [show, setShow] = useState<'open' | 'all'>('open')
  const [making, setMaking] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const load = async () => { try { setRows(await rpc<Ret[]>(sb, 'returns_list', {}, '159_returns')) } catch (e) { flash((e as Error).message, true); setRows([]) } }
  useEffect(() => { load() }, [])
  const list = (rows ?? []).filter(r => show === 'all' || r.status === 'open' || r.status === 'received' || r.credits.some(c => c.acct_status !== 'sent'))
  async function cancel(r: Ret) {
    const note = prompt(`Cancel ${r.rma} for ${r.customer}? Add a note (optional):`, '')
    if (note === null) return
    setBusy(r.rma)
    try { await rpc(sb, 'cancel_return', { p_id: r.id, p_note: note }, '159_returns'); flash(`${r.rma} cancelled`); await load() }
    catch (e) { flash((e as Error).message, true) } finally { setBusy(null) }
  }
  async function sendCm(c: Credit) {
    if (!sb || !confirm(`Send ${c.number} (${money(c.total)}) to QuickBooks now?`)) return
    setBusy(c.number)
    try { const r = await qboRun<{ doc_number: string; mode: string; note?: string }>(sb, { action: 'push_cm', credit_memo_id: c.id }); flash(r.note ?? `${c.number} is in QuickBooks (#${r.doc_number})`); await load() }
    catch (e) { flash((e as Error).message, true); await load() } finally { setBusy(null) }
  }
  async function linkCm(c: Credit) {
    if (!sb) return
    const num = prompt(`Already made in QuickBooks by hand? Type that credit memo's number to link ${c.number} to it (nothing changes in QuickBooks):`, '')
    if (!num) return
    setBusy(c.number)
    try { const r = await qboRun<{ warning?: string; qbo: { doc_number: string } }>(sb, { action: 'link_cm', credit_memo_id: c.id, qbo_doc: num }); flash(`${c.number} linked to QuickBooks #${r.qbo.doc_number}${r.warning ? `. ${r.warning}` : ''}`); await load() }
    catch (e) { flash((e as Error).message, true) } finally { setBusy(null) }
  }
  return <div className="list">
    <div className="row between wrap toolbar"><h2>Returns</h2>
      <div className="row">
        <select value={show} onChange={e => setShow(e.target.value as 'open' | 'all')}><option value="open">Open</option><option value="all">All</option></select>
        <button className="ghost small" onClick={load}>Refresh</button>
        {canEdit && <button className="primary small" onClick={() => setMaking(true)}>New return</button>}
      </div></div>
    <p className="muted">Start a return from a shipped order. The customer sends the product back on a METRC manifest; Distribution › Inbound receives it (it goes back into inventory to sell), and that makes the credit memo (Product Return, received lbs × invoice price), which goes to QuickBooks 30 minutes later.</p>
    {rows === null && <p className="muted">Loading…</p>}
    {rows && !list.length && <p className="muted">{show === 'open' ? 'No open returns.' : 'No returns yet.'}</p>}
    {list.map(r => {
      const [sl, sc] = STATUS[r.status]
      const want = r.lines.reduce((s, l) => s + Number(l.lbs), 0), got = r.lines.reduce((s, l) => s + Number(l.received_lbs), 0)
      return <div key={r.id} className="card">
        <div className="row between wrap">
          <div><b>{r.rma}</b> · <b>{r.customer}</b> <span className={`pill ${sc}`}>{sl}</span>
            <div className="muted small">{REASONS[r.reason] ?? r.reason}{r.so ? ` · order ${r.so}` : r.order_id ? ` · order #${r.order_id}` : ''} · started {day(r.created_at)}{r.created_by ? ` by ${r.created_by}` : ''}
              {r.received_at ? ` · received ${day(r.received_at)}${r.manifest ? ` (manifest ${r.manifest})` : ''}` : ''}</div>
            {r.notes && <div className="small">{r.notes}</div>}</div>
          <div className="row">
            <span className="small">{n2(got)} of {n2(want)} lbs back</span>
            {canEdit && r.status === 'open' && got === 0 && <button className="ghost small" disabled={!!busy} onClick={() => cancel(r)}>{busy === r.rma ? '…' : 'Cancel'}</button>}
          </div></div>
        <div className="tablewrap"><table className="ct"><thead><tr><th>Strain</th><th>Crop</th><th>Farm</th><th className="num">Lbs</th><th className="num">Received</th><th className="num">$/lb</th><th>Packages</th></tr></thead>
          <tbody>{r.lines.map(l => <tr key={l.id}><td>{l.strain}</td><td>{l.crop_year ?? ''}</td><td>{l.site ?? <span className="warn-t">?</span>}</td><td className="num">{n2(l.lbs)}</td>
            <td className="num">{n2(l.received_lbs)}</td><td className="num">{l.price == null ? <span className="warn-t">none</span> : money(l.price)}</td>
            <td className="small">{l.packages.length ? l.packages.map(p => `${p.code ?? p.tag} ${n2(p.lbs)}`).join(', ') : <span className="muted mono">{l.tags.join(', ') || 'tags we shipped: none on file'}</span>}</td></tr>)}</tbody></table></div>
        {r.credits.map(c => <div key={c.id} className="row between wrap small" style={{ marginTop: 6 }}>
          <span>Credit memo <b>{c.number}</b> {money(c.total)} · {c.acct_status === 'sent' ? <>in QuickBooks{c.qbo_doc && c.qbo_doc !== c.number ? ` as #${c.qbo_doc}` : ''}</> : <span className={c.acct_status === 'error' ? 'neg' : 'muted'}>{ACCT[c.acct_status]}</span>}
            {c.error && <span className="neg"> · {c.error}</span>}</span>
          {canSend && c.acct_status !== 'sent' && <span className="row">
            <button className="ghost small" disabled={!!busy} onClick={() => linkCm(c)}>Already in QuickBooks?</button>
            <button className="primary small" disabled={!!busy} onClick={() => sendCm(c)}>{busy === c.number ? 'Sending…' : 'Send now'}</button></span>}
        </div>)}
      </div>
    })}
    {making && <NewReturn sb={sb} customers={customers} flash={flash} onClose={() => setMaking(false)} onMade={async () => { setMaking(false); await load() }} />}
  </div>
}

function NewReturn({ sb, customers, flash, onClose, onMade }: { sb: SupabaseClient | null; customers: Customer[]; flash: Flash; onClose: () => void; onMade: () => void }) {
  const [cust, setCust] = useState<number | ''>('')
  const [orders, setOrders] = useState<ShippedOrder[] | null>(null)
  const [order, setOrder] = useState<number | ''>('')
  const [lines, setLines] = useState<OLine[] | null>(null)
  const [lbs, setLbs] = useState<Record<number, string>>({})
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const ext = useMemo(() => customers.filter(c => c.kind === 'external').sort((a, b) => a.name.localeCompare(b.name)), [customers])
  useEffect(() => {
    setOrders(null); setOrder(''); setLines(null)
    if (!cust) return
    rpc<ShippedOrder[]>(sb, 'returnable_orders', { p_customer: cust }, '159_returns').then(setOrders).catch(e => { flash((e as Error).message, true); setOrders([]) })
  }, [cust])
  useEffect(() => {
    setLines(null); setLbs({})
    if (!order) return
    rpc<OLine[]>(sb, 'return_order_lines', { p_order: order }, '159_returns').then(setLines).catch(e => { flash((e as Error).message, true); setLines([]) })
  }, [order])
  const picked = (lines ?? []).filter(l => Number(lbs[l.id] || 0) > 0)
  const over = picked.filter(l => Number(lbs[l.id]) > Number(l.shipped_lbs) - Number(l.returned_lbs) + 0.001)
  const total = picked.reduce((s, l) => s + Number(lbs[l.id]) * Number(l.price ?? 0), 0)
  async function save() {
    if (!order || !reason || !picked.length || over.length) return
    setBusy(true)
    try {
      const r = await rpc<{ rma: string }>(sb, 'create_return', { p_order: order, p_reason: reason, p_notes: notes,
        p_lines: picked.map(l => ({ line_id: l.id, lbs: Number(lbs[l.id]) })) }, '159_returns')
      flash(`${r.rma} started. Ask the customer to put ${r.rma} on their METRC manifest back to us.`)
      onMade()
    } catch (e) { flash((e as Error).message, true) } finally { setBusy(false) }
  }
  return <div className="scrim" onClick={onClose}>
    <div className="sheet form wide" onClick={e => e.stopPropagation()}>
      <div className="sheet-h"><h3>New return</h3><button className="ghost" aria-label="Close" onClick={onClose}>✕</button></div>
      <div className="field"><label>Customer</label>
        <Select value={cust === '' ? '' : String(cust)} onChange={e => setCust(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Pick a customer</option>{ext.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
      {cust !== '' && <div className="field"><label>Shipped order</label>
        <Select value={order === '' ? '' : String(order)} onChange={e => setOrder(e.target.value ? Number(e.target.value) : '')}>
          <option value="">{orders === null ? 'Loading…' : orders.length ? 'Pick the order it shipped on' : 'No shipped orders in the last 2 years'}</option>
          {(orders ?? []).map(o => <option key={o.id} value={o.id}>{o.so ?? `#${o.id}`} · {day(o.shipped)} · {n2(o.lbs)} lbs · {o.strains}</option>)}</Select></div>}
      {lines && <div className="tablewrap"><table className="ct"><thead><tr><th>Strain</th><th>Crop</th><th>Farm</th><th className="num">Shipped</th><th className="num">Can return</th><th className="num">$/lb</th><th className="num">Lbs back</th></tr></thead>
        <tbody>{lines.map(l => { const can = Math.max(Number(l.shipped_lbs) - Number(l.returned_lbs), 0); const bad = Number(lbs[l.id] || 0) > can + 0.001
          return <tr key={l.id}><td>{l.strain}</td><td>{l.crop_year ?? ''}</td><td>{l.site ?? <span className="warn-t">?</span>}</td><td className="num">{n2(l.shipped_lbs)}</td><td className="num">{n2(can)}</td>
            <td className="num">{l.price == null ? <span className="warn-t">none</span> : money(l.price)}</td>
            <td className="num"><input type="number" min={0} step="0.01" max={can} disabled={can <= 0} style={{ width: 90 }} className={bad ? 'bad' : ''} value={lbs[l.id] ?? ''}
              onChange={e => setLbs(m => ({ ...m, [l.id]: e.target.value }))} /></td></tr> })}</tbody></table></div>}
      {lines && !lines.length && <p className="muted">Nothing on this order can come back.</p>}
      {over.length > 0 && <p className="neg small">{over.map(l => l.strain).join(', ')}: more than can come back.</p>}
      <div className="field"><label>Reason</label>
        <select value={reason} onChange={e => setReason(e.target.value)}><option value="">Pick a reason</option>{Object.entries(REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div className="field"><label>Notes</label><textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="What happened (optional)" /></div>
      {picked.length > 0 && <p className="small">Credit if all of it comes back: <b>{money(total)}</b> <span className="muted">(the credit memo uses the weight we actually receive)</span></p>}
      <div className="row between"><button className="ghost" onClick={onClose}>Cancel</button>
        <button className="primary" disabled={busy || !order || !reason || !picked.length || over.length > 0} onClick={save}>{busy ? 'Saving…' : 'Start return'}</button></div>
    </div>
  </div>
}
