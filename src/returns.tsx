import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Customer } from './types'
import { Select } from './combo'
import { money, rpc } from './ship'

// 159: Sales > Returns. Start a return from a shipped order (same permission as making an order). Distribution > Inbound receives it
// in METRC; that makes the credit memo (Product Return), which goes to QuickBooks 30 minutes later (or Send now in Accounting).

type Flash = (t: string, bad?: boolean) => void
interface RLine { id: number; strain: string; crop_year: number | null; site: string | null; lbs: number; received_lbs: number; price: number | null; tags: string[]; reason?: string
  packages: { tag: string; lbs: number; code: string | null; at: string }[] }
interface Credit { id: number; number: string; total: number; date: string; status: string; acct_status: 'pending' | 'sent' | 'error' | 'skip'; qbo_doc: string | null; error: string | null; sent_at: string | null; created_at: string }
interface Ret { id: number; rma: string; status: 'open' | 'received' | 'credited' | 'cancelled'; reason: string; notes: string | null; manifest: string | null
  customer_id: number; customer: string; order_id: number | null; so: string | null; created_by: string | null; created_at: string; received_at: string | null
  lines: RLine[]; credits: Credit[] }
interface ShippedOrder { id: number; so: string | null; customer_id: number; customer: string; shipped: string | null; lbs: number; strains: string | null }
interface OLine { id: number; strain: string; crop_year: number | null; product: string; shipped_lbs: number; returned_lbs: number; price: number | null; invoice: string | null; tags: string[]; site: string | null }

export const REASONS: Record<string, string> = { quality: 'Quality', yield: 'Yield', wrong_strain: 'Wrong strain', overshipped: 'Overshipped', damaged: 'Damaged', not_delivered: 'Not delivered (on manifest, not on truck)', other: 'Other' }
const REASON_SHORT: Record<string, string> = { ...REASONS, not_delivered: 'Not delivered', mixed: 'Several reasons' }
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

export function ReturnsView({ sb, customers, flash, canEdit, canSend, isAdmin }: { sb: SupabaseClient | null; customers: Customer[]; flash: Flash; canEdit: boolean; canSend: boolean; isAdmin: boolean }) {
  const [rows, setRows] = useState<Ret[] | null>(null)
  const [show, setShow] = useState<'open' | 'all'>('open')
  const [making, setMaking] = useState(false)
  const [recv, setRecv] = useState<{ r: Ret; credit: boolean } | null>(null)
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
  async function emailsCm(c: Credit) {
    if (!sb) return
    setBusy(c.number)
    try { const r = await qboRun<{ to: string | null; cc: string | null; left: string[] }>(sb, { action: 'push_cm', emails_only: true, credit_memo_id: c.id }); flash(`${c.number} in QuickBooks now emails ${[r.to, r.cc].filter(Boolean).join(', ')}${r.left.length ? `. Didn't fit: ${r.left.join(', ')}` : ''}`) }
    catch (e) { flash((e as Error).message, true) } finally { setBusy(null) }
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
            <div className="muted small">{REASON_SHORT[r.reason] ?? r.reason}{r.so ? ` · order ${r.so}` : r.order_id ? ` · order #${r.order_id}` : ''} · started {day(r.created_at)}{r.created_by ? ` by ${r.created_by}` : ''}
              {r.received_at ? ` · received ${day(r.received_at)}${r.manifest ? ` (manifest ${r.manifest})` : ''}` : ''}</div>
            {r.notes && <div className="small">{r.notes}</div>}</div>
          <div className="row">
            <span className="small">{n2(got)} of {n2(want)} lbs back</span>
            {canEdit && r.status !== 'cancelled' && got < want - 0.001 && <button className="ghost small" disabled={!!busy} onClick={() => setRecv({ r, credit: false })}>Already received in METRC</button>}
            {isAdmin && r.status !== 'cancelled' && r.lines.some(l => l.reason === 'not_delivered' && Number(l.received_lbs) < Number(l.lbs) - 0.001) &&
              <button className="ghost small" disabled={!!busy} onClick={() => setRecv({ r, credit: true })}>Credit without receiving</button>}
            {canEdit && r.status === 'open' && got === 0 && <button className="ghost small" disabled={!!busy} onClick={() => cancel(r)}>{busy === r.rma ? '…' : 'Cancel'}</button>}
          </div></div>
        <div className="tablewrap"><table className="ct"><thead><tr><th>Strain</th><th>Crop</th><th>Farm</th><th>Reason</th><th className="num">Lbs</th><th className="num">Received</th><th className="num">$/lb</th><th>Packages</th></tr></thead>
          <tbody>{r.lines.map(l => <tr key={l.id}><td>{l.strain}</td><td>{l.crop_year ?? ''}</td><td>{l.site ?? <span className="warn-t">?</span>}</td><td className="small">{REASON_SHORT[l.reason ?? r.reason] ?? l.reason}</td><td className="num">{n2(l.lbs)}</td>
            <td className="num">{n2(l.received_lbs)}</td><td className="num">{l.price == null ? <span className="warn-t">none</span> : money(l.price)}</td>
            <td className="small">{l.packages.length ? l.packages.map(p => `${p.code ?? p.tag} ${n2(p.lbs)}`).join(', ') : <span className="muted mono">{l.tags.join(', ') || 'tags we shipped: none on file'}</span>}</td></tr>)}</tbody></table></div>
        {r.credits.map(c => <div key={c.id} className="row between wrap small" style={{ marginTop: 6 }}>
          <span>Credit memo <b>{c.number}</b> {money(c.total)} · {c.acct_status === 'sent' ? <>in QuickBooks{c.qbo_doc && c.qbo_doc !== c.number ? ` as #${c.qbo_doc}` : ''}</> : <span className={c.acct_status === 'error' ? 'neg' : 'muted'}>{ACCT[c.acct_status]}</span>}
            {c.error && <span className="neg"> · {c.error}</span>}</span>
          {canSend && c.acct_status === 'sent' && <button className="ghost small" disabled={!!busy} onClick={() => emailsCm(c)}>{busy === c.number ? '…' : 'Put billing emails on it in QuickBooks'}</button>}
          {canSend && c.acct_status !== 'sent' && <span className="row">
            <button className="ghost small" disabled={!!busy} onClick={() => linkCm(c)}>Already in QuickBooks?</button>
            <button className="primary small" disabled={!!busy} onClick={() => sendCm(c)}>{busy === c.number ? 'Sending…' : 'Send now'}</button></span>}
        </div>)}
      </div>
    })}
    {recv && <ReceiveSheet sb={sb} ret={recv.r} creditOnly={recv.credit} flash={flash} onClose={() => setRecv(null)} onDone={async () => { setRecv(null); await load() }} />}
    {making && <NewReturn sb={sb} customers={customers} flash={flash} onClose={() => setMaking(false)} onMade={async () => { setMaking(false); await load() }} />}
  </div>
}

function NewReturn({ sb, customers, flash, onClose, onMade }: { sb: SupabaseClient | null; customers: Customer[]; flash: Flash; onClose: () => void; onMade: () => void }) {
  const [cust, setCust] = useState<number | ''>('')
  const [orders, setOrders] = useState<ShippedOrder[] | null>(null)
  const [order, setOrder] = useState<number | ''>('')
  const [lines, setLines] = useState<OLine[] | null>(null)
  const [lbs, setLbs] = useState<Record<number, string>>({})
  const [why, setWhy] = useState<Record<number, string>>({})
  const [farm, setFarm] = useState<Record<number, string>>({})
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
    setLines(null); setLbs({}); setWhy({}); setFarm({})
    if (!order) return
    rpc<OLine[]>(sb, 'return_order_lines', { p_order: order }, '159_returns').then(setLines).catch(e => { flash((e as Error).message, true); setLines([]) })
  }, [order])
  const picked = (lines ?? []).filter(l => Number(lbs[l.id] || 0) > 0)
  const over = picked.filter(l => Number(lbs[l.id]) > Number(l.shipped_lbs) - Number(l.returned_lbs) + 0.001)
  const whyOf = (id: number) => why[id] || reason
  const noWhy = picked.filter(l => !whyOf(l.id))
  const total = picked.reduce((s, l) => s + Number(lbs[l.id]) * Number(l.price ?? 0), 0)
  async function save() {
    if (!order || noWhy.length || !picked.length || over.length) return
    setBusy(true)
    try {
      const r = await rpc<{ rma: string }>(sb, 'create_return', { p_order: order, p_reason: reason, p_notes: notes,
        p_lines: picked.map(l => ({ line_id: l.id, lbs: Number(lbs[l.id]), reason: whyOf(l.id), site: farm[l.id] || l.site || '' })) }, '159_returns')
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
      {lines && <div className="tablewrap"><table className="ct"><thead><tr><th>Strain</th><th>Crop</th><th>Farm</th><th className="num">Shipped</th><th className="num">Can return</th><th className="num">$/lb</th><th className="num">Lbs back</th><th>Reason</th></tr></thead>
        <tbody>{lines.map(l => { const can = Math.max(Number(l.shipped_lbs) - Number(l.returned_lbs), 0); const bad = Number(lbs[l.id] || 0) > can + 0.001
          return <tr key={l.id}><td>{l.strain}</td><td>{l.crop_year ?? ''}</td><td><select value={farm[l.id] ?? l.site ?? ''} onChange={e => setFarm(m => ({ ...m, [l.id]: e.target.value }))}>
              {!l.site && <option value="">?</option>}<option value="OHR">OHR</option><option value="GVR">GVR</option></select></td><td className="num">{n2(l.shipped_lbs)}</td><td className="num">{n2(can)}</td>
            <td className="num">{l.price == null ? <span className="warn-t">none</span> : money(l.price)}</td>
            <td className="num"><input type="number" min={0} step="0.01" max={can} disabled={can <= 0} style={{ width: 90 }} className={bad ? 'bad' : ''} value={lbs[l.id] ?? ''}
              onChange={e => setLbs(m => ({ ...m, [l.id]: e.target.value }))} /></td>
            <td><select value={why[l.id] ?? ''} disabled={can <= 0} onChange={e => setWhy(m => ({ ...m, [l.id]: e.target.value }))}>
              <option value="">{reason ? `Same (${REASON_SHORT[reason]})` : 'Pick'}</option>{Object.entries(REASONS).map(([k, v]) => <option key={k} value={k}>{REASON_SHORT[k] ?? v}</option>)}</select></td></tr> })}</tbody></table></div>}
      {lines && !lines.length && <p className="muted">Nothing on this order can come back.</p>}
      {over.length > 0 && <p className="neg small">{over.map(l => l.strain).join(', ')}: more than can come back.</p>}
      <div className="field"><label>Reason (for every line, unless a line says otherwise)</label>
        <select value={reason} onChange={e => setReason(e.target.value)}><option value="">Pick a reason</option>{Object.entries(REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div className="field"><label>Notes</label><textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="What happened (optional)" /></div>
      <p className="muted small">Quality and Yield release the customer's reserve on that strain (they keep only what they kept). Not delivered is credited as Product Refund; everything else as Product Return.</p>
      {picked.length > 0 && <p className="small">Credit if all of it comes back: <b>{money(total)}</b> <span className="muted">(the credit memo uses the weight we actually receive)</span></p>}
      <div className="row between"><button className="ghost" onClick={onClose}>Cancel</button>
        <button className="primary" disabled={busy || !order || noWhy.length > 0 || !picked.length || over.length > 0} onClick={save}>{busy ? 'Saving…' : 'Start return'}</button></div>
    </div>
  </div>
}

interface Cand { id: number; code: string; strain: string | null; status: string; tag: string | null; lbs_now: number | null; site: string | null; received_lbs: number | null
  received_on: string | null; manifest: string | null; from_name: string | null; ours: boolean; line_id: number | null }

/** "Already received in METRC": pick the packages already in the app; or (Sales Admins) credit Not delivered lines without any package */
function ReceiveSheet({ sb, ret, creditOnly, flash, onClose, onDone }: { sb: SupabaseClient | null; ret: Ret; creditOnly: boolean; flash: Flash; onClose: () => void; onDone: () => void }) {
  const [cands, setCands] = useState<Cand[] | null>(creditOnly ? [] : null)
  const [pick, setPick] = useState<Record<number, { on: boolean; line: number | ''; lbs: string }>>({})
  const [credit, setCredit] = useState<Record<number, string>>({})
  const [manifest, setManifest] = useState(ret.manifest ?? '')
  const [all, setAll] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (creditOnly) return
    rpc<Cand[]>(sb, 'return_candidates', { p_return: ret.id }, '161_return_receive_manual').then(c => {
      setCands(c)
      setPick(Object.fromEntries(c.map(x => [x.id, { on: x.ours, line: x.line_id ?? '', lbs: String(x.received_lbs ?? x.lbs_now ?? '') }])))
      const m = c.find(x => x.ours && x.manifest)?.manifest; if (m && !ret.manifest) setManifest(m)
    }).catch(e => { flash((e as Error).message, true); setCands([]) })
  }, [])
  const left = (l: RLine) => Math.max(Number(l.lbs) - Number(l.received_lbs), 0)
  const shown = (cands ?? []).filter(c => all || c.ours || (c.strain && ret.lines.some(l => l.strain.toLowerCase() === c.strain!.toLowerCase())) || pick[c.id]?.on)
  const chosen = (cands ?? []).filter(c => pick[c.id]?.on)
  const bad = chosen.filter(c => !pick[c.id].line || !(Number(pick[c.id].lbs) > 0))
  // two packages on one line can't take in more than the line has left (e.g. the package we shipped from and the customer's repackaged one)
  const overLines = ret.lines.filter(l => chosen.filter(c => Number(pick[c.id].line) === l.id).reduce((t, c) => t + Number(pick[c.id].lbs || 0), 0) > left(l) + 0.001)
  const items = creditOnly
    ? ret.lines.filter(l => Number(credit[l.id] || 0) > 0).map(l => ({ line_id: l.id, lbs: Number(credit[l.id]) }))
    : chosen.map(c => ({ pallet_id: c.id, line_id: Number(pick[c.id].line), lbs: Number(pick[c.id].lbs) }))
  const amount = items.reduce((s, i) => s + i.lbs * Number(ret.lines.find(l => l.id === i.line_id)?.price ?? 0), 0)
  async function save() {
    if (!items.length || bad.length || overLines.length) return
    if (!confirm(`${creditOnly ? 'Credit' : 'Receive'} ${items.length} line(s) on ${ret.rma} for ${ret.customer}? This makes a ${money(amount)} credit memo that goes to QuickBooks in 30 minutes.`)) return
    setBusy(true)
    try {
      const r = await rpc<{ credit_memo: string; total: number }>(sb, 'return_receive_manual', { p_return: ret.id, p_items: items, p_manifest: manifest || null, p_credit_only: creditOnly }, '161_return_receive_manual')
      flash(`${ret.rma}: credit memo ${r.credit_memo} (${money(r.total)}) made. It goes to QuickBooks in 30 minutes.`)
      onDone()
    } catch (e) { flash((e as Error).message, true) } finally { setBusy(false) }
  }
  return <div className="scrim" onClick={onClose}>
    <div className="sheet form wide" onClick={e => e.stopPropagation()}>
      <div className="sheet-h"><h3>{creditOnly ? 'Credit without receiving' : 'Already received in METRC'} · {ret.rma}</h3><button className="ghost" aria-label="Close" onClick={onClose}>✕</button></div>
      {creditOnly ? <>
        <p className="muted small">For Not delivered lines only, when nothing will come back on a METRC transfer. The credit is Product Refund.</p>
        <div className="tablewrap"><table className="ct"><thead><tr><th>Strain</th><th className="num">Left</th><th className="num">$/lb</th><th className="num">Lbs to credit</th></tr></thead>
          <tbody>{ret.lines.filter(l => l.reason === 'not_delivered' && left(l) > 0).map(l => <tr key={l.id}><td>{l.strain}</td><td className="num">{n2(left(l))}</td><td className="num">{money(l.price)}</td>
            <td className="num"><input type="number" min={0} max={left(l)} step="0.01" style={{ width: 90 }} value={credit[l.id] ?? ''} onChange={e => setCredit(m => ({ ...m, [l.id]: e.target.value }))} /></td></tr>)}</tbody></table></div>
      </> : <>
        <p className="muted small">The packages came in before this return existed (or were received on Inbound without picking it). Tick the ones that belong to {ret.rma}, check the line and the lbs that came in. They're marked returned on that line (farm and crop year from the line), just like a receive on Inbound.</p>
        <div className="field"><label>METRC manifest it came in on</label><input value={manifest} onChange={e => setManifest(e.target.value)} placeholder="e.g. 0011790727" /></div>
        {cands === null && <p className="muted">Loading…</p>}
        {cands && !cands.length && <p className="muted">No packages received on Inbound in the last 120 days that aren't on a return yet.</p>}
        {cands && cands.length > 0 && <div className="tablewrap"><table className="ct"><thead><tr><th></th><th>Package</th><th>Strain</th><th>Received</th><th>Return line</th><th className="num">Lbs in</th></tr></thead>
          <tbody>{shown.map(c => { const pk = pick[c.id] ?? { on: false, line: '', lbs: '' }; const set = (v: Partial<typeof pk>) => setPick(m => ({ ...m, [c.id]: { ...pk, ...v } }))
            return <tr key={c.id}><td><input type="checkbox" checked={pk.on} onChange={e => set({ on: e.target.checked })} /></td>
              <td>{c.code}{c.ours && <span className="pill m-ok" style={{ marginLeft: 4 }}>our tag</span>}<div className="muted small mono">{c.tag}</div></td>
              <td>{c.strain}<div className="muted small">{c.status}</div></td>
              <td className="small">{c.received_on ? day(c.received_on) : ''}{c.manifest ? ` · ${c.manifest}` : ''}<div className="muted">{c.from_name}</div></td>
              <td><select value={pk.line} onChange={e => set({ line: e.target.value ? Number(e.target.value) : '' })}><option value="">Pick</option>
                {ret.lines.map(l => <option key={l.id} value={l.id}>{l.strain} ({REASON_SHORT[l.reason ?? ret.reason] ?? l.reason}, {n2(left(l))} left)</option>)}</select></td>
              <td className="num"><input type="number" min={0} step="0.01" style={{ width: 90 }} value={pk.lbs} onChange={e => set({ lbs: e.target.value })} /></td></tr> })}</tbody></table></div>}
        {cands && cands.length > shown.length && <button className="ghost small" onClick={() => setAll(true)}>Show all {cands.length} recent packages</button>}
        {bad.length > 0 && <p className="neg small">Pick a return line and lbs for every ticked package.</p>}
        {overLines.length > 0 && <p className="neg small">More lbs ticked than are left on: {overLines.map(l => `${l.strain} (${n2(left(l))} left)`).join(', ')}. Untick the extra package.</p>}
      </>}
      {items.length > 0 && <p className="small">Credit memo: <b>{money(amount)}</b> ({items.length} line{items.length === 1 ? '' : 's'})</p>}
      <div className="row between"><button className="ghost" onClick={onClose}>Cancel</button>
        <button className="primary" disabled={busy || !items.length || bad.length > 0 || overLines.length > 0} onClick={save}>{busy ? 'Saving…' : creditOnly ? 'Credit' : 'Receive'}</button></div>
    </div>
  </div>
}
