// Msg RES-1: Sales > Reserves > + Add reserve, built like New sales order (side card on computers, full screen with a
// bottom bar on phones). Pick a customer and see their reserve picture (what the customer portal shows them: reserved,
// fulfilled, on open SOs, remaining, their contract), then one table of their reserves plus every strain on the open menu
// for that crop year. Type the new total on any row; the summary lists the changes; Save runs set_reserve for each one.
import { useEffect, useMemo, useState } from 'react'
import type { Backend } from './api'
import type { Balance, Customer, CustomerTerms, Order, ReserveRequest, ReserveYears } from './types'

type Flash = (t: string, bad?: boolean) => void
const n0 = (v: number) => Math.round(v).toLocaleString()
const k = (s: string) => s.trim().toLowerCase()

export function AddReservesSheet({ backend, customers, flash, onClose, onDone, preset }: {
  backend: Backend; customers: Customer[]; flash: Flash; onClose: () => void; onDone: (customerId: number) => void; preset?: number | null
}) {
  const [cust, setCust] = useState<number | null>(preset ?? null)
  const [cq, setCq] = useState('')
  const [ys, setYs] = useState<ReserveYears | null>(null)
  const [year, setYear] = useState<number | null>(null)
  const [bal, setBal] = useState<Balance[] | null>(null)
  const [open, setOpen] = useState<{ strain: string; crop_year: number; open_lbs: number }[] | null>(null)
  const [terms, setTerms] = useState<CustomerTerms[]>([])
  const [reqs, setReqs] = useState<ReserveRequest[]>([])
  const [orders, setOrders] = useState<Order[] | null>(null)   // RES-7: their orders on strains with no reserve yet
  const [ed, setEd] = useState<Record<string, string>>({})   // strain key -> new total typed
  const [filter, setFilter] = useState<'all' | 'res' | 'not'>('all')
  const [q, setQ] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [sumOpen, setSumOpen] = useState(false)
  useEffect(() => {
    backend.reserveYears().then(setYs).catch(() => {})
    backend.listBalances().then(setBal).catch(() => setBal([]))
    backend.listTerms().then(setTerms).catch(() => {})
    backend.listRequests().then(setReqs).catch(() => {})
    backend.listOrders().then(setOrders).catch(() => setOrders([]))
    backend.client()?.rpc('staff_ff_open').then(({ data, error }) => setOpen(error ? [] : (data ?? []) as { strain: string; crop_year: number; open_lbs: number }[]), () => setOpen([]))
  }, [])
  const cur = ys?.current ?? new Date().getFullYear()
  const yr = year ?? cur
  const years = [...new Set([cur, ...(ys?.years ?? []).map(y => y.year)])].sort((a, b) => a - b)
  const deadline = ys?.years.find(y => y.year === yr)?.deadline ?? null
  useEffect(() => { setEd({}) }, [cust, yr])
  const c = customers.find(x => x.id === cust)
  const t = terms.find(x => x.customer_id === cust && x.crop_year === yr)
  const contractLbs = t?.contract_lbs ?? (yr === cur ? c?.contract_lbs ?? null : null)
  const pend = reqs.filter(r => r.customer_id === cust && r.status === 'pending' && (r.crop_year ?? cur) === yr)

  // one row per strain: their reserve (if any) + what's open on the menu
  const rows = useMemo(() => {
    if (cust == null || !bal || !open) return []
    const m = new Map<string, { key: string; strain: string; res: number; ful: number; so: number; rem: number; open: number; has: boolean }>()
    for (const b of bal) if (b.customer_id === cust && (b.crop_year ?? cur) === yr && (Number(b.reserved) > 0 || Number(b.shipped) > 0 || Number(b.pending) > 0))
      m.set(k(b.strain), { key: k(b.strain), strain: b.strain, res: Number(b.reserved), ful: Number(b.shipped), so: Number(b.pending), rem: Math.max(0, Number(b.remaining)), open: 0, has: true })
    // RES-7: strains on their confirmed or shipped orders with no reserve yet: once a reserve exists those lbs count against it
    for (const o of orders ?? []) if (o.customer_id === cust && (o.status === 'pending' || o.status === 'shipped')) for (const l of o.order_lines) {
      if ((l.product ?? 'fresh_frozen') !== 'fresh_frozen' || (l.crop_year ?? cur) !== yr || m.get(k(l.strain))?.has) continue
      const x = m.get(k(l.strain)) ?? { key: k(l.strain), strain: l.strain, res: 0, ful: 0, so: 0, rem: 0, open: 0, has: false }
      if (o.status === 'pending') x.so += Number(l.lbs); else x.ful += Number(l.lbs)
      m.set(x.key, x)
    }
    for (const o of open) if (o.crop_year === yr && Number(o.open_lbs) > 0) {
      const x = m.get(k(o.strain))
      if (x) x.open = Number(o.open_lbs)
      else m.set(k(o.strain), { key: k(o.strain), strain: o.strain, res: 0, ful: 0, so: 0, rem: 0, open: Number(o.open_lbs), has: false })
    }
    const used = (r: { ful: number; so: number }) => r.ful + r.so > 0 ? 1 : 0
    return [...m.values()].sort((a, b) => Number(b.has) - Number(a.has) || used(b) - used(a) || a.strain.localeCompare(b.strain))
  }, [cust, bal, open, orders, yr, cur])

  // new total: at least what's shipped + on open SOs, at most what they have + what's open on the menu
  const minOf = (r: typeof rows[number]) => r.ful + r.so
  // what's already shipped / on their open orders came out of the menu, so it counts toward the room (RES-7)
  const maxOf = (r: typeof rows[number]) => Math.max(r.res, r.ful + r.so) + r.open
  const changes = rows.filter(r => ed[r.key] !== undefined && ed[r.key] !== '' && Number(ed[r.key]) !== r.res)
    .map(r => { const to = Number(ed[r.key]); const err = to < minOf(r) ? `can't go under ${n0(minOf(r))} (shipped + open SOs)` : to > maxOf(r) ? `${n0(maxOf(r))} is the most (${n0(r.ful + r.so > r.res ? r.ful + r.so : r.res)} theirs + ${n0(r.open)} open)` : ''
      return { r, to, d: to - r.res, err } })
  const bad = changes.some(x => x.err)
  const tot = { res: rows.reduce((a, r) => a + r.res, 0), ful: rows.reduce((a, r) => a + r.ful, 0), so: rows.reduce((a, r) => a + r.so, 0), rem: rows.reduce((a, r) => a + r.rem, 0) }
  const newRes = tot.res + changes.reduce((a, x) => a + x.d, 0)
  const ql = q.trim().toLowerCase()
  const shown = rows.filter(r => (filter === 'all' || (filter === 'res') === r.has) && (!ql || r.strain.toLowerCase().includes(ql)))

  async function save() {
    if (cust == null || !changes.length || bad) return
    setBusy(true)
    let done = 0
    try {
      for (const x of changes) { await backend.setReserve(cust, x.r.strain, x.to, note.trim() || undefined, yr !== cur ? yr : undefined); done++ }
      flash(`${done} reserve${done === 1 ? '' : 's'} saved for ${c?.name ?? 'the customer'}`); onDone(cust)
    } catch (e) { flash(`${done ? `${done} saved, then: ` : ''}${String((e as Error).message ?? e)}`, true); if (done) onDone(cust) } finally { setBusy(false) }
  }

  const cql = cq.trim().toLowerCase()
  const custOpts = customers.filter(x => x.active && x.kind === 'external' && (!cql || x.name.toLowerCase().includes(cql))).sort((a, b) => Number(!!b.reserves_enabled) - Number(!!a.reserves_enabled) || a.name.localeCompare(b.name)).slice(0, 12)
  const loading = !bal || !open || !orders
  const sign = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${n0(Math.abs(v))}`
  const summary = <>
    <div className="no-sum-lines">{!changes.length ? <p className="muted small" style={{ margin: 14 }}>Type a new total next to a strain. Changes show up here.</p>
      : changes.map(x => <div key={x.r.key} className={`no-sline ${x.err ? 'bad' : ''}`}><div className="grow"><b>{x.r.strain}</b>
          <div className="muted small">{x.r.has ? `${n0(x.r.res)} → ${n0(x.to)}` : `new reserve`}{x.err ? ` · ${x.err}` : ''}</div></div>
          <span className="nw">{n0(x.to)} lbs</span><span className={`nw ${x.d > 0 ? 'ok-t' : 'warn-t'}`}>{sign(x.d)}</span>
          <button className="linkbtn" aria-label={`Undo ${x.r.strain}`} onClick={() => setEd(e => { const n = { ...e }; delete n[x.r.key]; return n })}>✕</button></div>)}</div>
    <div className="no-tot">
      <div><span className="muted">Reserved now</span><span>{n0(tot.res)} lbs</span></div>
      <div><span className="muted">Change</span><span>{sign(newRes - tot.res)} lbs</span></div>
      <div className="g"><span>New total</span><span>{n0(newRes)} lbs</span></div>
      {contractLbs != null && <p className={`small ${newRes > contractLbs ? 'warn-t' : 'muted'}`}>Contract: {n0(contractLbs)} lbs for {yr}{newRes > contractLbs ? ` · ${n0(newRes - contractLbs)} over` : newRes < contractLbs ? ` · ${n0(contractLbs - newRes)} still to reserve` : ' · right on it'}</p>}
      <div className="field" style={{ margin: '6px 0' }}><label>Reason <span className="muted">(optional; the customer sees it in their Reserve History)</span></label>
        <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Added at their request on the call 11/9" /></div>
      <button className="primary big" disabled={busy || !changes.length || bad} onClick={save}>{busy ? 'Saving…' : bad ? 'Fix the red lines' : `Save ${changes.length || ''} change${changes.length === 1 ? '' : 's'}`}</button>
    </div>
  </>

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet form neworder side no2 addres" onClick={e => e.stopPropagation()}>
        <div className="sheet-h"><h2>Add reserves</h2><button className="ghost" onClick={onClose}>✕</button></div>
        <div className="no-body">
          <div className="no-main">
            <section className="no-sec">
              {!c ? <>
                <div className="no-h">1 · Customer</div>
                <input className="search" type="search" autoFocus placeholder="Type a customer" value={cq} onChange={e => setCq(e.target.value)} aria-label="Customer" />
                <div className="no-copts">{custOpts.map(x => <button key={x.id} onClick={() => { setCust(x.id); setCq('') }}><b>{x.name}</b><span className="muted small">{x.reserves_enabled ? 'reserves on' : 'menu only (reserves off)'}</span></button>)}</div>
              </> : <>
                <div className="row no-cust"><div className="grow"><div className="no-cname">{c.name}</div>
                  <div className="muted small">{yr} crop{c.reserves_enabled ? '' : ' · reserves off'}</div></div>
                  {!preset && <button className="ghost small" onClick={() => setCust(null)}>Change</button>}</div>
                {years.length > 1 && <div className="seg" role="group" aria-label="Crop year">{years.map(y => <button key={y} className={y === yr ? 'on' : ''} onClick={() => setYear(y)}>{y}</button>)}</div>}
                {!c.reserves_enabled && <div className="warnbox">{c.name} is menu only: reserves are off for them. Turn them on in Sales › Customers if they're a contract customer.</div>}
                <div className="ar-kpis">
                  <div><span>Reserved</span><b>{n0(tot.res)}</b></div>
                  <div><span>Fulfilled</span><b>{n0(tot.ful)}</b></div>
                  <div><span>On open SOs</span><b>{n0(tot.so)}</b></div>
                  <div className="tint"><span>Remaining</span><b>{n0(tot.rem)}</b></div>
                </div>
                <div className="no-chips">
                  {contractLbs != null && <span className="pill">Contract {n0(contractLbs)} lbs</span>}
                  {t?.monthly_min_lbs != null && <span className="pill">{n0(t.monthly_min_lbs)} lbs/month min</span>}
                  {(t?.price_per_lb ?? c.price_per_lb) != null && <span className="pill">${Number(t?.price_per_lb ?? c.price_per_lb).toFixed(2)}/lb</span>}
                  {deadline && yr !== cur && <span className="pill">Requests due {new Date(deadline + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}
                  {pend.length > 0 && <span className="pill warnp">{pend.length} reserve request{pend.length === 1 ? '' : 's'} waiting</span>}
                </div>
              </>}
            </section>
            {c && <section className="no-sec no-menu">
              <div className="no-tabs"><span className="no-h">2 · Reserves · {yr} crop</span>
                {(['all', 'res', 'not'] as const).map(f => <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : f === 'res' ? 'Reserved' : 'Not reserved'}</button>)}</div>
              <input className="search" type="search" placeholder="Search strains" value={q} onChange={e => setQ(e.target.value)} aria-label="Search strains" />
              {loading ? <p className="muted">Loading reserves and the open menu…</p> : !shown.length ? <p className="muted">Nothing here{q ? ` for "${q}"` : ''}.</p> :
                <div className="no-twrap"><table className="ctable no-table ar-table"><thead><tr><th>Strain</th><th className="num" title="Reserved">Reserved</th><th className="num" title="Fulfilled (shipped)">Shipped</th><th className="num" title="On open sales orders">Open SO</th><th className="num" title="Remaining">Left</th><th className="num" title="Open menu available">Open menu</th><th className="num">New total</th></tr></thead>
                  <tbody>{shown.map(r => { const v = ed[r.key] ?? '', x = changes.find(z => z.r.key === r.key)
                    return <tr key={r.key} className={x ? (x.err ? 'bad' : 'on') : ''}>
                      <td className="c-n"><b>{r.strain}</b>{!r.has && x && <> <span className="pill">New</span></>}{!r.has && r.so > 0 && <div className="muted small">{n0(r.so)} on their open order, no reserve yet</div>}{x?.err && <div className="warn-t small">{x.err}</div>}</td>
                      <td className="num" data-l="reserved ">{r.has ? n0(r.res) : '—'}</td>
                      <td className="num" data-l="fulfilled ">{r.has || r.ful ? n0(r.ful) : '—'}</td>
                      <td className="num" data-l="open SO ">{r.has || r.so ? n0(r.so) : '—'}</td>
                      <td className="num" data-l="remaining "><b>{x && !x.err ? n0(Math.max(0, x.to - r.ful - r.so)) : r.has ? n0(r.rem) : '—'}</b></td>
                      <td className="num muted" data-l="open ">{n0(r.open)}</td>
                      <td className="num c-l"><input className={`qty ${x?.err ? 'bad' : ''}`} type="number" step="10" min="0" inputMode="numeric" aria-label={`New reserve total for ${r.strain}`}
                        placeholder={r.has ? n0(r.res).replace(/,/g, '') : '0'} value={v} onChange={e => setEd(m => ({ ...m, [r.key]: e.target.value }))} /></td>
                    </tr> })}</tbody></table></div>}
              <p className="muted small">New total is the whole reserve for that strain, including what's shipped and what's on their open orders (those lbs count against it, even on an order placed before the reserve). It can't go under shipped + open SOs, and can only go up by what's open on the menu. Saving changes the reserve right away (no request), the same as Edit reserve.</p>
            </section>}
          </div>
          <aside className="no-sum">
            <div className="no-h" style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>Changes</div>
            {summary}
          </aside>
        </div>
        <div className="no-bar"><button className="linkbtn grow" onClick={() => setSumOpen(true)}><b>{changes.length} change{changes.length === 1 ? '' : 's'}</b><span className="muted small"> · new total {n0(newRes)} lbs ▴</span></button>
          <button className="primary" disabled={busy || !changes.length || bad} onClick={save}>Save</button></div>
        {sumOpen && <div className="scrim no-sumscrim" onClick={() => setSumOpen(false)}><div className="sheet no-sumsheet" onClick={e => e.stopPropagation()}>
          <div className="sheet-h"><h2>Changes</h2><button className="ghost" onClick={() => setSumOpen(false)}>✕</button></div>{summary}</div></div>}
      </div>
    </div>
  )
}
