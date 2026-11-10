import { AddReservesSheet } from './addreserves'
import { ListInput, Select } from './combo'
import { SampleHolds, SampleSheet } from './samples'
import { CustomerDashboard } from './statement'
import { StrainLink } from './strainCard'
import { useBack, scrollTop, scrollPos } from './nav'
import { useEffect, useMemo, useRef, useState } from 'react'
import { PRODUCT_LABEL } from './types'
import type { Backend } from './api'
import { readSheet } from 'read-excel-file/browser'
import { parseCsv } from './settings'
import { OpenMenu } from './menu'
import { CatalogButton } from './catalog'
import { RequestsPanel } from './requests'
import { STATE_LABEL } from './fulfill'
import type { CustomerTerms, FOrder, MenuNumbers, ReserveRequest, ReserveYears, Balance, Customer, ImportResult, Order, RoshiRow, Strain } from './types'

const n0 = (x: number) => Math.round(x).toLocaleString()

const STATUS_LABEL: Record<string, string> = { shipped: 'Shipped', pending: 'Confirmed', submitted: 'Submitted', draft: 'Draft', cancelled: 'Cancelled' }
const orderLbs = (o: Order) => o.order_lines.reduce((a, l) => a + Number(l.lbs), 0)
const fmtDate = (d: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' }) : ''

// Roshi "SO Detail" export -> rows for the import
const ROSHI_COLS: Record<string, keyof RoshiRow> = {
  'id1': 'line_id', 'sales order #': 'so_number', 'customer': 'customer', 'sku name': 'sku_name', 'sku id': 'sku_id',
  'so status': 'status', 'total - gross': 'gross', 'units': 'units', 'sales order date': 'order_date', 'date shipped': 'shipped_date',
  'package tag/lot': 'package_tag',
}
async function readRoshi(f: File): Promise<RoshiRow[]> {
  const grid: unknown[][] = /\.csv$/i.test(f.name)
    ? parseCsv((await f.text()).replace(/^﻿/, ''))
    : (await readSheet(f)).map(r => r.map(c => c instanceof Date ? c.toISOString() : c))
  const hdr = (grid[0] ?? []).map(h => String(h ?? '').trim().toLowerCase())
  const idx = Object.fromEntries(Object.entries(ROSHI_COLS).map(([h, k]) => [k, hdr.indexOf(h)])) as Record<keyof RoshiRow, number>
  for (const need of ['so_number', 'customer', 'sku_name', 'status', 'units'] as const)
    if (idx[need] < 0) throw new Error(`This doesn't look like a Roshi sales order export (no "${Object.keys(ROSHI_COLS).find(h => ROSHI_COLS[h] === need)}" column)`)
  const seen = new Map<string, number>()
  return grid.slice(1).map(r => {
    const get = (k: keyof RoshiRow) => idx[k] >= 0 && r[idx[k]] != null && String(r[idx[k]]).trim() !== '' ? String(r[idx[k]]).trim() : null
    const so = get('so_number') ?? '', sku = get('sku_name') ?? ''
    const key = `${so}|${get('sku_id') ?? sku}`; const n = (seen.get(key) ?? 0) + 1; seen.set(key, n)
    return {
      line_id: get('line_id') ?? `${key}|${n}`, so_number: so, customer: get('customer') ?? '', sku_name: sku, sku_id: get('sku_id'),
      status: get('status') ?? '', gross: get('gross') != null ? Number(String(get('gross')).replace(/[$,]/g, '')) : null,
      units: get('units') != null ? Number(String(get('units')).replace(/,/g, '')) : null,
      order_date: get('order_date'), shipped_date: get('shipped_date'), package_tag: get('package_tag'),
    }
  }).filter(r => /FL2[56]/.test(r.sku_name) && /fresh frozen/i.test(r.sku_name) && r.so_number)
}

export type SalesMode = 'customer' | 'strain' | 'orders' | 'requests' | 'menu'
export const SALES_TITLES: Record<SalesMode, string> = { menu: 'Open menu', orders: 'Orders', requests: 'Requests', customer: 'Reserves by customer', strain: 'Reserves by strain' }

/** Sales screens. The Sales module menu picks the screen (mode); isAdmin = Sales Admin (approvals, reserves, deadlines). */
export function ReservesView({ backend, customers, strains, onHand, flash, isAdmin, mode, onCounts, fulfil, onFulfil, onNewOrder, onDoc, onInvoice }: {
  backend: Backend; customers: Customer[]; strains: Strain[]; onHand: Map<string, number>
  flash: (t: string, bad?: boolean) => void; isAdmin: boolean; mode: SalesMode; onCounts?: () => void
  fulfil?: Map<number, FOrder>; onFulfil?: () => Promise<void>
  onNewOrder?: () => void; onDoc?: (kind: 'invoice' | 'so', id: number) => void; onInvoice?: (orderId: number) => void
}) {
  const [reqs, setReqs] = useState<ReserveRequest[]>([])
  const [nums, setNums] = useState<MenuNumbers[]>([])
  const [year, setYear] = useState<number | null>(null)
  const [bal, setBal] = useState<Balance[] | null>(null)
  const [ys, setYs] = useState<ReserveYears | null>(null)
  const [ry, setRy] = useState<number | null>(null)   // which crop's reserves
  useEffect(() => { backend.reserveYears().then(setYs).catch(() => {}) }, [])
  const [orders, setOrders] = useState<Order[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  // RES-4: Reserves by customer as a sortable table (computers and tablets; phones keep the cards)
  const [csort, setCsort] = useState<{ k: 'name' | 'strains' | 'res' | 'ship' | 'so' | 'left' | 'pct' | 'contract' | 'mmin' | 'price'; up: boolean }>({ k: 'res', up: false })
  // RES-5: By strain table sort + which strain is open
  const [ssort, setSsort] = useState<{ k: 'name' | 'cust' | 'have' | 'pend' | 'left' | 'free'; up: boolean }>({ k: 'name', up: true })
  const [sOpen, setSOpen] = useState<string | null>(null)
  const [cterms, setCterms] = useState<CustomerTerms[]>([])
  useEffect(() => { backend.listTerms().then(setCterms).catch(() => {}) }, [])
  const [adding, setAdding] = useState<{ preset: number | null } | null>(null)   // RES-1
  const [edit, setEdit] = useState<{ customer_id: number | null; strain: string; lbs: string; isNew: boolean; note?: string } | null>(null)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [sampleOf, setSampleOf] = useState<Order | null>(null)
  const [holdRev, setHoldRev] = useState(0)
  const [ost, setOst] = useState<string>('all')   // Orders table: status filter (restyle)
  const load = () => Promise.all([backend.listBalances(), backend.listOrders().catch(() => [] as Order[]),
      backend.listRequests().catch(() => [] as ReserveRequest[]), backend.menuNumbers().catch(() => [] as MenuNumbers[])])
    .then(([b, o, r, m]) => {
      setBal(b); setOrders(o); setReqs(r); setNums(m); setErr(null); onCounts?.()
    }).catch(e => setErr(String(e?.message ?? e)))
  useEffect(() => { load() }, [])
  // By customer: one customer at a time, with a Back button (and the phone's Back) to the full list
  const listY = useRef(0)
  const openCust = (id: number) => { listY.current = scrollPos(); setOpen(id); scrollTop() }
  const closeCust = () => { setOpen(null); requestAnimationFrame(() => scrollTop(listY.current)) }
  useBack(mode === 'customer' && open != null && open > 0, closeCust)
  useEffect(() => { setOpen(null) }, [mode])

  const cust = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers])
  const cname = (id: number) => cust.get(id)?.name ?? `#${id}`
  const onHandOf = (s: string) => onHand.get(s.toLowerCase()) ?? 0
  const pendingByStrain = useMemo(() => {
    const m = new Map<string, number>()
    for (const o of orders) if (o.status === 'pending') for (const l of o.order_lines) if ((l.product ?? 'fresh_frozen') === 'fresh_frozen') m.set(l.strain.toLowerCase(), (m.get(l.strain.toLowerCase()) ?? 0) + Number(l.lbs))
    return m
  }, [orders])

  if (err) return <div className="list"><h2>Reserves</h2><div className="warnbox">Reserves or orders aren't set up in the database yet. Run 009_reserves.sql and 010_orders.sql in Supabase, then refresh. ({err})</div></div>
  if (!bal) return <div className="list"><h2>Reserves</h2><p className="muted">Loading…</p></div>
  const cur = ys?.current ?? new Date().getFullYear()
  const rYear = ry ?? cur
  const future = rYear > cur
  const menuYears = [...new Set(nums.map(m => m.crop_year))].sort((a, b) => b - a)
  const yrSel = mode === 'strain' && !future ? (year ?? menuYears[0] ?? cur) : rYear
  const dl = ys?.years.find(y => y.year === rYear)?.deadline ?? null
  const allBal = bal
  const yearsWith = [...new Set([cur, ...(ys?.years ?? []).map(y => y.year), ...allBal.map(r => r.crop_year ?? cur), ...(mode === 'strain' ? menuYears : [])])].sort((a, b) => a - b)
  const balY = allBal.filter(r => (r.crop_year ?? cur) === rYear)

  const ql = q.toLowerCase()
  const sum = (rs: Balance[], k: 'reserved' | 'shipped' | 'pending' | 'remaining') => rs.reduce((a, r) => a + Number(r[k]), 0)
  const byCust = [...balY.reduce((m, r) => m.set(r.customer_id, [...(m.get(r.customer_id) ?? []), r]), new Map<number, Balance[]>())]
    .map(([id, rs]) => ({ id, name: cname(id), rs }))
    .filter(c => !ql || c.name.toLowerCase().includes(ql) || c.rs.some(r => r.strain.toLowerCase().includes(ql)))
    .sort((a, b) => sum(b.rs, 'reserved') - sum(a.rs, 'reserved'))
  const focus = mode === 'customer' && open != null && open > 0 ? [...balY.reduce((m, r) => m.set(r.customer_id, [...(m.get(r.customer_id) ?? []), r]), new Map<number, Balance[]>())].map(([id, rs]) => ({ id, name: cname(id), rs })).find(c => c.id === open) : undefined
  // numbers come from the database (same math as the customer menu); fall back to local math before 011 is run
  const years = [...new Set(nums.map(m => m.crop_year))].sort((a, b) => b - a)
  const yr = year ?? years[0]
  const byStrain = (nums.length ? nums.filter(m => m.crop_year === yr).map(m => ({ s: m.strain, rs: balY.filter(r => r.strain.toLowerCase() === m.strain.toLowerCase()),
      left: Number(m.reserved_left), have: Number(m.on_hand), pend: Number(m.pending), held: Number(m.held), free: Number(m.free), hidden: !m.on_menu }))
    : [...new Set([...balY.map(r => r.strain), ...[...onHand.keys()].map(k => strains.find(s => s.name.toLowerCase() === k)?.name ?? k)])].map(s => {
      const rs = balY.filter(r => r.strain.toLowerCase() === s.toLowerCase())
      const left = sum(rs, 'remaining'), have = onHandOf(s), pend = pendingByStrain.get(s.toLowerCase()) ?? 0
      return { s, rs, left, have, pend, held: 0, free: have - pend - left, hidden: false }
    })).filter(x => (x.have > 0 || x.left > 0) && (!ql || x.s.toLowerCase().includes(ql) || x.rs.some(r => cname(r.customer_id).toLowerCase().includes(ql))))
    .sort((a, b) => a.s.localeCompare(b.s))
  const shownOrders = [...orders].sort((a, b) => Number(b.status === 'submitted') - Number(a.status === 'submitted')).filter(o => !ql || cname(o.customer_id).toLowerCase().includes(ql) || (o.so_number ?? '').toLowerCase().includes(ql) || o.order_lines.some(l => l.strain.toLowerCase().includes(ql)))

  async function save() {
    if (!edit || edit.customer_id == null) return
    const lbs = Number(edit.lbs)
    try { await backend.setReserve(edit.customer_id, edit.strain, lbs, edit.note?.trim() || undefined, rYear !== cur ? rYear : undefined); await load(); setOpen(edit.customer_id); setEdit(null); flash(lbs === 0 ? 'Reserve removed' : 'Reserve saved') }
    catch (e) { flash(String((e as Error).message ?? e), true) }
  }
  async function copyMenu() {
    try {
      const rows = (await backend.openMenu()).filter(r => Number(r.available) > 0)
      const years = [...new Set(rows.map(r => r.crop_year))].sort((a, b) => b - a)
      const text = years.map(y => `${y} crop, fresh frozen (lbs open)\n` + rows.filter(r => r.crop_year === y).map(r => `${r.strain}: ${n0(Number(r.available))}`).join('\n')).join('\n\n')
      await navigator.clipboard.writeText(text); flash('Menu copied')
    } catch (e) { flash(String((e as Error).message ?? e), true) }
  }
  async function importFile(f: File) {
    setBusy(true); setResult(null)
    try {
      const rows = await readRoshi(f)
      if (!rows.length) throw new Error('No 2026 fresh frozen lines found in that file')
      const res = await backend.importRoshi(rows); setResult(res); await load()
    } catch (e) { flash(String((e as Error).message ?? e), true) } finally { setBusy(false) }
  }

  return (
    <div className="list reserves">
      <h2>{SALES_TITLES[mode]} {(mode === 'customer' || mode === 'strain') && <span className="muted">{cur} reserves: {n0(sum(allBal.filter(r => (r.crop_year ?? cur) === cur), 'remaining'))} lbs left of {n0(sum(allBal.filter(r => (r.crop_year ?? cur) === cur), 'reserved'))}</span>}</h2>
      <div className="row toolbar">
        <input className="search" type="search" placeholder="Search customer, strain or SO #" value={q} onChange={e => setQ(e.target.value)} />
        {mode === 'orders'
          ? <>{onNewOrder && <button className="primary" onClick={onNewOrder}>+ New order</button>}
            <label className={`ghost filebtn ${busy ? 'disabled' : ''}`}>{busy ? 'Importing…' : 'Import Roshi orders'}
              <input type="file" accept=".xlsx,.csv" disabled={busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importFile(f) }} /></label></>
          : isAdmin && mode !== 'requests' && mode !== 'menu' && <button className="primary" onClick={() => setAdding({ preset: focus?.id ?? null })}>+ Add reserves</button>}
      </div>
      {result && (
        <div className="okbox">
          Imported: {result.orders_added} new orders, {result.orders_updated} orders with a new status or date, {result.lines_added} new lines, {result.lines_updated} changed lines.
          {result.new_customers.length > 0 && <> New customers added: {result.new_customers.join(', ')}.</>}
          {result.new_strains.length > 0 && <> New strains added: {result.new_strains.join(', ')}.</>}
          <a onClick={() => setResult(null)}> Dismiss</a>
        </div>
      )}

      {(mode === 'customer' || mode === 'strain') && yearsWith.length > 1 && (
        <div className="row yearpick">
          <div className="seg yearseg">{yearsWith.map(y => <button key={y} className={y === yrSel ? 'on' : ''} onClick={() => { setRy(y); if (y <= cur) setYear(y) }}>{y} crop</button>)}</div>
          {future && <span className="muted">{dl ? `Customers can request ${rYear} reserves until ${new Date(dl + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}.` : `${rYear} requests are closed.`}</span>}
          {future && isAdmin && <DeadlineEdit year={rYear} value={dl} onSave={async v => { try { await backend.setReserveDeadline(rYear, v); setYs(await backend.reserveYears()); flash('Deadline saved') } catch (e) { flash(String((e as Error).message ?? e), true) } }} />}
        </div>
      )}
      {mode === 'customer' && !focus && byCust.length === 0 && <p className="muted">No {rYear} reserves yet.</p>}
      {mode === 'customer' && focus && (() => {
        const c = focus
        const cOrders = orders.filter(o => o.customer_id === c.id && o.status !== 'cancelled').sort((a, b) => (b.order_date ?? '').localeCompare(a.order_date ?? ''))
        const cReqs = reqs.filter(r => r.customer_id === c.id && r.status === 'pending')
        return (
          <div className="custfocus">
            <button className="ghost backbtn" onClick={closeCust}>‹ All customers</button>
            <div className="rescard">
              {/* RES-6: the customer's card closes it again (it looked like a fold you could tap shut) */}
              <button className="li setrow custhead" onClick={closeCust} aria-label={`Close ${c.name}`}>
                <div className="grow"><b>{c.name}</b>
                  <div className="muted">{c.rs.length} strain{c.rs.length === 1 ? '' : 's'} · {n0(sum(c.rs, 'shipped'))} shipped{sum(c.rs, 'pending') > 0 ? ` · ${n0(sum(c.rs, 'pending'))} pending` : ''}</div></div>
                <div className="num"><b>{n0(sum(c.rs, 'remaining'))}</b><div className="muted">of {n0(sum(c.rs, 'reserved'))} left ▴</div></div>
              </button>
              {/* RES-10: a sortable table; Sales Admins change reserves right in it */}
              <CustReserves key={`${c.id}-${rYear}`} backend={backend} cid={c.id} name={c.name} rs={c.rs} nums={nums} year={rYear} cur={cur} isAdmin={isAdmin} flash={flash}
                onSaved={async () => { await load(); setOpen(c.id) }} onAdd={() => setAdding({ preset: c.id })} />
            </div>
            <SampleHolds backend={backend} customerId={c.id} staff flash={flash} rev={holdRev} onChanged={load} />
            <h3>Account</h3>
            <CustomerDashboard backend={backend} customerId={c.id} staff />
            {cReqs.length > 0 && <><h3>Reserve requests waiting</h3>
              <table className="restable wide"><thead><tr><th>Strain</th><th className="num">Now</th><th className="num">Asked for</th><th>Crop</th></tr></thead>
                <tbody>{cReqs.map(r => <tr key={r.id}><td>{r.strain}</td><td className="num">{n0(Number(r.current_lbs))}</td><td className="num"><b>{n0(Number(r.requested_lbs))}</b></td><td>{r.crop_year ?? cur}</td></tr>)}</tbody></table></>}
            <h3>Orders</h3>
            {cOrders.length === 0 ? <p className="muted">No orders yet.</p> : (
              <table className="restable wide"><thead><tr><th>Order</th><th>Date</th><th>Status</th><th className="num">Lbs</th></tr></thead>
                <tbody>{cOrders.slice(0, 25).map(o => <tr key={o.id}><td>{o.so_number ?? `#${o.id}`}</td><td>{fmtDate(o.order_date)}</td>
                  <td><span className={`pill o-${o.status}`}>{STATUS_LABEL[o.status]}</span></td><td className="num">{n0(orderLbs(o))}</td></tr>)}</tbody></table>)}
            <button className="ghost backbtn" onClick={closeCust}>‹ All customers</button>
          </div>
        )
      })()}
      {mode === 'customer' && !focus && byCust.length > 0 && (() => {
        const termOf = (id: number) => cterms.find(x => x.customer_id === id && x.crop_year === rYear)
        const contractOf = (id: number) => termOf(id)?.contract_lbs ?? (rYear === cur ? cust.get(id)?.contract_lbs ?? null : null)
        const mminOf = (id: number) => termOf(id)?.monthly_min_lbs ?? (rYear === cur ? cust.get(id)?.monthly_min_lbs ?? null : null)
        const priceOf = (id: number) => { const v = termOf(id)?.price_per_lb ?? (rYear === cur ? cust.get(id)?.price_per_lb ?? null : null); return v == null ? null : Number(v) }
        const rows = byCust.map(c => { const res = sum(c.rs, 'reserved'), ship = sum(c.rs, 'shipped'), so = sum(c.rs, 'pending'), left = sum(c.rs, 'remaining')
          return { ...c, strains: c.rs.length, res, ship, so, left, pct: res > 0 ? ship / res : 0, contract: contractOf(c.id), mmin: mminOf(c.id), price: priceOf(c.id) } })
        const val = (r: typeof rows[number]) => csort.k === 'name' ? r.name.toLowerCase() : csort.k === 'contract' || csort.k === 'mmin' || csort.k === 'price' ? (r[csort.k] ?? -1) : r[csort.k]
        rows.sort((a, b) => { const x = val(a), y = val(b); const d = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number); return csort.up ? d : -d })
        const tot = rows.reduce((t, r) => ({ res: t.res + r.res, ship: t.ship + r.ship, so: t.so + r.so, left: t.left + r.left, strains: t.strains + r.strains }), { res: 0, ship: 0, so: 0, left: 0, strains: 0 })
        const th = (k: typeof csort.k, label: string, num = true) => <th className={`${num ? 'num ' : ''}sortth${csort.k === k ? ' on' : ''}`} aria-sort={csort.k === k ? (csort.up ? 'ascending' : 'descending') : 'none'}>
          <button className="linkbtn" onClick={() => setCsort(s => ({ k, up: s.k === k ? !s.up : k === 'name' }))}>{label}{csort.k === k ? (csort.up ? ' ▲' : ' ▼') : ''}</button></th>
        return <div className="cwrap rescwrap"><table className="ctable restbl">
          <thead><tr>{th('name', 'Customer', false)}{th('strains', 'Strains')}{th('contract', 'Contract')}{th('mmin', 'Monthly min')}{th('price', '$/lb')}{th('res', 'Reserved')}{th('ship', 'Shipped')}{th('so', 'Open SO')}{th('left', 'Left')}{th('pct', 'Shipped %')}</tr></thead>
          <tbody>{rows.map(r => <tr key={r.id} className="tap" onClick={() => openCust(r.id)}>
            <td><b>{r.name}</b></td>
            <td className="num">{r.strains}</td>
            <td className={`num ${r.contract != null && r.res > r.contract ? 'warn-t' : 'muted'}`} title={r.contract != null && r.res > r.contract ? `${n0(r.res - r.contract)} lbs over contract` : undefined}>{r.contract != null ? n0(r.contract) : '—'}</td>
            <td className="num muted">{r.mmin != null ? n0(r.mmin) : '—'}</td>
            <td className="num muted">{r.price != null ? `$${r.price.toFixed(2)}` : '—'}</td>
            <td className="num">{n0(r.res)}</td>
            <td className="num">{n0(r.ship)}</td>
            <td className="num">{r.so > 0 ? n0(r.so) : <span className="muted">0</span>}</td>
            <td className="num"><b>{n0(r.left)}</b></td>
            <td className="num"><span className="respct"><i style={{ width: `${Math.min(100, Math.round(r.pct * 100))}%` }} /></span> {Math.round(r.pct * 100)}%</td>
          </tr>)}</tbody>
          <tfoot><tr><td><b>{rows.length} customer{rows.length === 1 ? '' : 's'}</b></td><td className="num">{tot.strains}</td><td /><td /><td /><td className="num"><b>{n0(tot.res)}</b></td><td className="num">{n0(tot.ship)}</td><td className="num">{n0(tot.so)}</td><td className="num"><b>{n0(tot.left)}</b></td>
            <td className="num">{tot.res > 0 ? Math.round(tot.ship / tot.res * 100) : 0}%</td></tr></tfoot>
        </table></div>
      })()}
      {mode === 'customer' && !focus && byCust.map(c => (
        <div key={c.id} className="rescard rescard-ph">
          <button className="li setrow" onClick={() => openCust(c.id)}>
            <div className="grow"><b>{c.name}</b>
              <div className="muted">{c.rs.length} strain{c.rs.length === 1 ? '' : 's'} · {n0(sum(c.rs, 'shipped'))} shipped{sum(c.rs, 'pending') > 0 ? ` · ${n0(sum(c.rs, 'pending'))} pending` : ''}</div></div>
            <div className="num"><b>{n0(sum(c.rs, 'remaining'))}</b><div className="muted">of {n0(sum(c.rs, 'reserved'))} left ›</div></div>
          </button>
        </div>
      ))}

      {mode === 'strain' && future && (() => {
        const tot = [...balY.reduce((m, r) => m.set(r.strain, [...(m.get(r.strain) ?? []), r]), new Map<string, Balance[]>())].sort((a, b) => a[0].localeCompare(b[0]))
        const pend = reqs.filter(r => r.status === 'pending' && r.crop_year === rYear)
        return (
          <table className="restable wide">
            <thead><tr><th>Strain</th><th className="num">Customers</th><th className="num">Reserved</th><th className="num">Requested (waiting)</th></tr></thead>
            <tbody>{tot.map(([st, rs]) => <tr key={st}><td>{st}</td><td className="num">{rs.length}</td><td className="num"><b>{n0(sum(rs, 'reserved'))}</b></td>
              <td className="num">{n0(pend.filter(q => q.strain.toLowerCase() === st.toLowerCase()).reduce((a, q) => a + Number(q.requested_lbs) - Number(q.current_lbs), 0)) || ''}</td></tr>)}
            {!tot.length && <tr><td colSpan={4} className="muted">No {rYear} reserves yet.</td></tr>}</tbody>
          </table>
        )
      })()}
      {mode === 'strain' && !future && (
        <>
          {(() => {
            const rows = byStrain.map(x => ({ ...x, cust: x.rs.filter(r => Number(r.remaining) > 0 || Number(r.reserved) > 0).length }))
            const v = (x: typeof rows[number]) => ssort.k === 'name' ? x.s.toLowerCase() : ssort.k === 'cust' ? x.cust : x[ssort.k]
            rows.sort((a, b) => { const p = v(a), q2 = v(b); const d = typeof p === 'string' ? p.localeCompare(q2 as string) : (p as number) - (q2 as number); return ssort.up ? d : -d })
            const tot = rows.reduce((t, x) => ({ have: t.have + x.have, pend: t.pend + x.pend, left: t.left + x.left, free: t.free + x.free }), { have: 0, pend: 0, left: 0, free: 0 })
            const th = (k: typeof ssort.k, label: string, num = true) => <th className={`${num ? 'num ' : ''}sortth${ssort.k === k ? ' on' : ''}`} aria-sort={ssort.k === k ? (ssort.up ? 'ascending' : 'descending') : 'none'}>
              <button className="linkbtn" onClick={() => setSsort(o => ({ k, up: o.k === k ? !o.up : k === 'name' }))}>{label}{ssort.k === k ? (ssort.up ? ' ▲' : ' ▼') : ''}</button></th>
            return <div className="cwrap"><table className="ctable restbl resstr">
              <thead><tr>{th('name', 'Strain', false)}{th('cust', 'Customers')}{th('have', 'On hand')}{th('pend', 'Pending')}{th('left', 'Res. left')}{th('free', 'Free')}</tr></thead>
              <tbody>{rows.map(x => [
                <tr key={x.s} className={`tap ${sOpen === x.s ? 'open' : ''}`} onClick={() => setSOpen(sOpen === x.s ? null : x.s)}>
                  <td><span onClick={e => e.stopPropagation()}><StrainLink name={x.s} /></span>{x.hidden && <> <span className="pill old">hidden</span></>}</td>
                  <td className="num c-cu" data-l="customers ">{x.cust || <span className="muted">0</span>}{x.cust > 0 && <span className="muted"> {sOpen === x.s ? '▴' : '▾'}</span>}</td>
                  <td className="num c-st" data-l="on hand ">{n0(x.have)}</td><td className="num c-st" data-l="pending ">{x.pend ? n0(x.pend) : <span className="muted">0</span>}</td><td className="num c-st" data-l="res. left ">{n0(x.left)}</td>
                  <td className={`num c-fr ${x.free < 0 ? 'warn-t' : ''}`} data-l="free "><b>{n0(x.free)}</b>{x.held > 0 && <div className="muted small">{n0(x.held)} held</div>}</td>
                </tr>,
                sOpen === x.s && x.rs.length > 0 ? <tr key={`${x.s}-c`} className="resx"><td colSpan={6}>
                  {[...x.rs].sort((a, b) => Number(b.remaining) - Number(a.remaining)).map(r => <div key={r.id} className="resxr">
                    <b>{cname(r.customer_id)}</b>
                    <span className="muted small">{n0(Number(r.reserved))} reserved · {n0(Number(r.shipped))} shipped{Number(r.pending) > 0 ? ` · ${n0(Number(r.pending))} open SO` : ''}</span>
                    <b className="nw">{n0(Number(r.remaining))} left</b></div>)}
                </td></tr> : null])}</tbody>
              <tfoot><tr><td><b>{rows.length} strain{rows.length === 1 ? '' : 's'}</b></td><td /><td className="num"><b>{n0(tot.have)}</b></td><td className="num">{n0(tot.pend)}</td><td className="num">{n0(tot.left)}</td><td className="num"><b>{n0(tot.free)}</b></td></tr></tfoot>
            </table></div>
          })()}
          <p className="muted">Free = on hand − confirmed orders − approved reserves not yet shipped − sample holds on confirmed orders. Orders waiting for confirmation and reserve requests don't take anything until they're approved. Customers see Free rounded down to 10 lbs. On hand is what's in the freezers in this app. Negative means more is promised than is in the freezers.</p>
        </>
      )}

      {mode === 'menu' && <>
        <p className="muted">Exactly what customers see on the portal: open lbs rounded down to 10, hidden strains left out. <a onClick={copyMenu}>Copy as text</a></p>
        <div className="row toolbar"><CatalogButton backend={backend} flash={flash} /></div>
        <OpenMenu backend={backend} reserves={false} />
      </>}

      {mode === 'requests' && <SampleHolds backend={backend} staff showCustomer flash={flash} rev={holdRev} onChanged={load} />}
      {mode === 'requests' && <RequestsPanel backend={backend} reqs={reqs.filter(r => !ql || cname(r.customer_id).toLowerCase().includes(ql) || r.strain.toLowerCase().includes(ql))}
        nums={nums} cname={cname} cur={cur} isAdmin={isAdmin} flash={flash} onDone={load} />}

      {mode === 'orders' && (
        <>
          {orders.length === 0 && <p className="muted">No orders yet. Export sales orders from Roshi and import the file here.</p>}
          {orders.length > 0 && <div className="seg ostat" role="group" aria-label="Status">{['all', 'submitted', 'pending', 'shipped', 'draft', 'cancelled'].filter(k => k === 'all' || shownOrders.some(o => o.status === k)).map(k =>
            <button key={k} className={ost === k ? 'on' : ''} onClick={() => setOst(k)}>{k === 'all' ? 'All' : STATUS_LABEL[k]} <span className="segn">{k === 'all' ? shownOrders.length : shownOrders.filter(o => o.status === k).length}</span></button>)}</div>}
          {orders.length > 0 && <div className="cwrap"><table className="ctable otable slimmable">
            <thead><tr><th className="slim">Order</th><th className="slim">Customer</th><th className="hide-s">Date</th><th className="slim">Status</th><th className="hide-s">Fulfillment</th><th className="num">Lbs</th></tr></thead>
            <tbody>{shownOrders.filter(o => ost === 'all' || o.status === ost).map(o => [
              <tr key={o.id} className={`tap ${open === -o.id ? 'open sel' : ''}`} onClick={() => setOpen(open === -o.id ? null : -o.id)}>
                <td className="nw slim"><b>{o.so_number ?? `Order #${o.id}`}</b>{o.is_sample && <> <span className="pill sample">Sample</span></>}</td>
                <td className="slim">{cname(o.customer_id)}<div className="muted small">{o.source === 'portal' ? 'from portal' : ''}{o.roshi_status && o.roshi_status !== 'Fulfilled' ? `${o.source === 'portal' ? ' · ' : ''}Roshi: ${o.roshi_status}` : ''}</div></td>
                <td className="hide-s nw">{fmtDate(o.order_date)}</td>
                <td className="slim"><span className={`pill o-${o.status}`}>{STATUS_LABEL[o.status]}</span></td>
                <td className="hide-s">{o.status === 'pending' && fulfil?.get(o.id) && <span className={`pill fs-${fulfil.get(o.id)!.state}`}>{STATE_LABEL[fulfil.get(o.id)!.state]}{fulfil.get(o.id)!.stop ? ` · ${fulfil.get(o.id)!.stop!.load}` : ''}</span>}</td>
                <td className="num"><b>{n0(orderLbs(o))}</b></td>
              </tr>,
              // Msg 304: the order opens in the big side card (full-height sheet on a phone) instead of under its row
              open === -o.id ? <tr key={`x-${o.id}`} className="xrow-side"><td colSpan={6} className="slim" style={{ padding: 0, border: 0 }}><div className="scrim" onClick={() => setOpen(null)}><div className="sheet form wide side osheet" onClick={e => e.stopPropagation()}>
                    <div className="sheet-h"><div><h2>{o.so_number ?? `Order #${o.id}`}{o.is_sample && <> <span className="pill sample">Sample</span></>}</h2>
                      <div className="muted">{cname(o.customer_id)} · {fmtDate(o.order_date)} · <span className={`pill o-${o.status}`}>{STATUS_LABEL[o.status]}</span> · {n0(orderLbs(o))} lbs</div></div>
                      <button className="ghost" onClick={() => setOpen(null)}>✕</button></div>
                    <div className="rescard odetail">
                    {open === -o.id && fulfil?.get(o.id)?.state === 'needs_ok' && <FillOk f={fulfil.get(o.id)!} backend={backend} flash={flash} onDone={async () => { await load(); await onFulfil?.() }} />}
                    {open === -o.id && (o.status === 'pending' || o.status === 'shipped') && onDoc && <div className="row wrap orderdocs">
                      <button className="ghost small" onClick={() => onDoc('so', o.id)}>Sales order PDF</button>
                      {onInvoice && o.status === 'shipped' && <button className="ghost small" onClick={() => onInvoice(o.id)}>Invoice</button>}</div>}
                    {open === -o.id && o.status !== 'cancelled' && <div className="row wrap orderdocs"><button className="ghost small" onClick={() => setSampleOf(o)}>{o.is_sample ? `Samples: ${o.order_lines.filter(l => l.is_sample).map(l => `${l.strain}${Number(l.hold_lbs ?? 0) > 0 ? ` (holding ${n0(Number(l.hold_lbs))})` : ''}`).join(', ')} · change` : 'Mark sample lines…'}</button></div>}
                    {open === -o.id && <OrderEditor backend={backend} o={o} strains={strains} flash={flash} onChanged={load} isAdmin={isAdmin} />}
              </div></div></div></td></tr> : null,
            ])}</tbody>
          </table></div>}
          <p className="muted">Import the Roshi sales order export (the same one the menu engine uses) any time. New orders are added and existing ones are updated. Only 2026 fresh frozen lines, plus open 2025 ones, are used.</p>
        </>
      )}


      {sampleOf && <SampleSheet backend={backend} o={sampleOf} days={cust.get(sampleOf.customer_id)?.sample_hold_days ?? null} flash={flash} onClose={() => setSampleOf(null)}
        onDone={async () => { setSampleOf(null); setHoldRev(r => r + 1); await load() }} />}
      {adding && <AddReservesSheet backend={backend} customers={customers} flash={flash} preset={adding.preset} onClose={() => setAdding(null)}
        onDone={async id => { setAdding(null); await load(); if (mode === 'customer') setOpen(id) }} />}
      {edit && (
        <div className="scrim" onClick={() => setEdit(null)}>
          <div className="sheet form" onClick={e => e.stopPropagation()}>
            <div className="sheet-h"><h2>{edit.isNew ? 'Add reserve' : 'Edit reserve'}</h2><button className="ghost" onClick={() => setEdit(null)}>✕</button></div>
            <div className="field"><label>Customer</label>
              <Select value={edit.customer_id ?? ''} disabled={!edit.isNew} onChange={e => setEdit({ ...edit, customer_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Pick a customer…</option>
                {customers.filter(c => c.active && c.kind === 'external').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select></div>
            <div className="field"><label>Strain</label>
              <ListInput list="reserve-strains" value={edit.strain} disabled={!edit.isNew} onChange={e => setEdit({ ...edit, strain: e.target.value })} placeholder="Start typing" />
              <datalist id="reserve-strains">{strains.filter(s => s.active).map(s => <option key={s.id} value={s.name} />)}</datalist></div>
            <div className="field"><label>Reserved lbs <span className="muted">(the full amount, including what's already shipped)</span></label>
              <input type="number" min="0" step="10" value={edit.lbs} onChange={e => setEdit({ ...edit, lbs: e.target.value })} autoFocus={!edit.isNew} />
              {edit.strain && <span className="muted">{n0(onHandOf(edit.strain))} lbs on hand</span>}</div>
            <div className="field"><label>Reason <span className="muted">(optional; the customer sees this in their Reserve History)</span></label>
              <input type="text" value={edit.note ?? ''} onChange={e => setEdit({ ...edit, note: e.target.value })} placeholder="e.g. Strain came in under estimate, so reserves were reduced 10%" /></div>
            <div className="row between">
              {!edit.isNew ? <button className="ghost" onClick={() => setEdit({ ...edit, lbs: '0' })}>Set to 0 (remove)</button> : <span />}
              <div className="row">
                <button className="ghost" onClick={() => setEdit(null)}>Cancel</button>
                <button className="primary" disabled={edit.customer_id == null || !edit.strain.trim() || edit.lbs === '' || Number(edit.lbs) < 0} onClick={save}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function DeadlineEdit({ year, value, onSave }: { year: number; value: string | null; onSave: (v: string | null) => Promise<void> }) {
  const [v, setV] = useState(value ?? '')
  const [open, setOpen] = useState(false)
  if (!open) return <a onClick={() => { setV(value ?? ''); setOpen(true) }}>Change deadline</a>
  return (
    <span className="row">
      <input type="date" value={v} onChange={e => setV(e.target.value)} />
      <button className="primary small" onClick={async () => { await onSave(v || null); setOpen(false) }}>Save</button>
      <button className="ghost small" onClick={() => setOpen(false)}>Cancel</button>
      <span className="muted">Blank closes {year} requests.</span>
    </span>
  )
}

// read-only lists for the customer portal
export function MyReserves({ backend, year }: { backend: Backend; year?: number }) {
  const [rows, setRows] = useState<Balance[] | null>(null)
  useEffect(() => { backend.listBalances().then(b => setRows(b.filter(r => !year || r.crop_year == null || r.crop_year === year))).catch(() => setRows([])) }, [year])
  if (!rows) return <p className="muted">Loading…</p>
  if (!rows.length) return <p className="muted">No reserves on file yet.</p>
  const t = (k: 'reserved' | 'shipped' | 'pending' | 'remaining') => rows.reduce((a, r) => a + Number(r[k]), 0)
  return (
    <table className="restable">
      <thead><tr><th>Strain</th><th className="num">Reserved</th><th className="num">Shipped</th><th className="num">Pending</th><th className="num">Left</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.id}><td>{r.strain}</td><td className="num">{n0(Number(r.reserved))}</td><td className="num">{n0(Number(r.shipped))}</td><td className="num">{n0(Number(r.pending))}</td><td className="num"><b>{n0(Number(r.remaining))}</b></td></tr>)}</tbody>
      <tfoot><tr><td><b>Total lbs</b></td><td className="num">{n0(t('reserved'))}</td><td className="num">{n0(t('shipped'))}</td><td className="num">{n0(t('pending'))}</td><td className="num"><b>{n0(t('remaining'))}</b></td></tr></tfoot>
    </table>
  )
}

export function MyOrders({ backend, onChange }: { backend: Backend; onChange?: (msg: string) => void }) {
  const [rows, setRows] = useState<Order[] | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  useEffect(() => { backend.listOrders().then(setRows).catch(() => setRows([])) }, [])
  if (!rows) return <p className="muted">Loading…</p>
  if (!rows.length) return <p className="muted">No orders yet.</p>
  const maxYear = Math.max(...rows.flatMap(o => o.order_lines.map(l => l.crop_year ?? 0)))
  return (
    <>
      {rows.map(o => (
        <div key={o.id} className="rescard">
          <button className="li setrow" onClick={() => setOpen(open === o.id ? null : o.id)}>
            <div className="grow"><b>{o.so_number ?? `Order #${o.id}`}</b> <span className={`pill o-${o.status}`}>{STATUS_LABEL[o.status]}</span>{o.is_sample && <span className="pill sample">Sample</span>}
              <div className="muted">{fmtDate(o.order_date)}{o.shipped_date && o.status === 'shipped' ? ` · shipped ${fmtDate(o.shipped_date)}` : ''}</div></div>
            <b className="num">{n0(orderLbs(o))} lbs</b>
          </button>
          {open === o.id && (
            <table className="restable">
              <thead><tr><th>Strain</th><th className="num">Lbs</th><th className="num">$/lb</th></tr></thead>
              <tbody>{o.order_lines.map(l => <tr key={l.id}><td>{l.strain}{l.is_sample && <span className="pill sample">sample{Number(l.hold_lbs ?? 0) > 0 ? ` · holding ${n0(Number(l.hold_lbs))}` : ''}</span>}{l.product && l.product !== 'fresh_frozen' ? <span className="pill prod">{PRODUCT_LABEL[l.product]}</span> : null}{l.crop_year && l.crop_year < maxYear ? <span className="pill old">{l.crop_year} crop</span> : null}</td><td className="num">{n0(Number(l.lbs))}</td><td className="num">{l.price_per_lb != null ? `$${Number(l.price_per_lb).toFixed(2)}` : ''}</td></tr>)}</tbody>
              {(o.po_number || o.notes || o.status === 'submitted') && <tfoot><tr><td colSpan={3}>
                {o.po_number && <div className="muted">PO {o.po_number}</div>}{o.notes && <div className="muted">"{o.notes}"</div>}
                {o.status === 'submitted' && <button className="ghost small" onClick={async () => {
                  try { await backend.cancelMyOrder(o.id); onChange?.(`Order #${o.id} cancelled`) } catch (e) { onChange?.(String((e as Error).message)) }
                }}>Cancel this order</button>}
              </td></tr></tfoot>}
            </table>
          )}
        </div>
      ))}
    </>
  )
}

// staff: confirm / ship / cancel an order, change lbs or price on a line, add a line
function OrderEditor({ backend, o, strains, flash, onChanged, isAdmin }: {
  backend: Backend; o: Order; strains: Strain[]; flash: (t: string, bad?: boolean) => void; onChanged: () => void; isAdmin?: boolean
}) {
  // Roshi SO # field removed (Aziz 11/4); an SO # already on the order is kept as is
  const so = o.so_number ?? ''
  const [askCancel, setAskCancel] = useState(false)
  const [wantOn, setWantOn] = useState(o.wanted_date ?? '')
  useEffect(() => { setWantOn(o.wanted_date ?? '') }, [o.wanted_date])
  const [shipOn, setShipOn] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })
  const [edits, setEdits] = useState<Record<number, { lbs: string; price: string; year: number }>>({})
  const cy = new Date().getFullYear()
  const [add, setAdd] = useState({ strain: '', lbs: '' })
  const [busy, setBusy] = useState(false)
  // Add a strain: what this customer can order right now = open menu + their own reserve left, per strain + crop year
  const [avail, setAvail] = useState<{ k: string; strain: string; year: number; open: number; res: number }[] | null>(null)
  useEffect(() => {
    if (!(o.status === 'submitted' || o.status === 'pending')) return
    let gone = false
    // staff see the exact pounds left (211), not the portal's rounded-down-to-10
    const exact = async () => { const { data, error } = await backend.client()!.rpc('staff_ff_open'); if (error) throw error; return ((data ?? []) as { strain: string; crop_year: number; open_lbs: number }[]).map(r => ({ strain: r.strain, crop_year: r.crop_year, available: r.open_lbs })) }
    Promise.all([exact().catch(() => backend.openMenu().catch(() => [])), backend.listBalances().catch(() => [] as Balance[])]).then(([menu, bal]) => {
      const m = new Map<string, { k: string; strain: string; year: number; open: number; res: number }>()
      const at = (strain: string, year: number) => { const k = `${strain.toLowerCase()}|${year}`; let x = m.get(k); if (!x) { x = { k, strain, year, open: 0, res: 0 }; m.set(k, x) } return x }
      for (const r of menu) if (Number(r.available) > 0) at(r.strain, r.crop_year).open += Number(r.available)
      for (const b of bal) if (b.customer_id === o.customer_id && Number(b.remaining) > 0) at(b.strain, b.crop_year ?? cy).res += Number(b.remaining)
      if (!gone) setAvail([...m.values()].sort((a, b) => a.strain.localeCompare(b.strain) || b.year - a.year))
    })
    return () => { gone = true }
  }, [o.id, o.status])
  const addPick = avail?.find(x => x.k === add.strain) ?? null
  // can't add more than the list shows as available (Aziz 11/4)
  const addMax = addPick ? addPick.open + addPick.res : 0, addOver = !!addPick && Number(add.lbs) > addMax
  // Edit on a line: up to what it has now + what's still open / in reserve for that strain + crop year (fresh frozen lines)
  const lineMax = (l: Order['order_lines'][number], year: number) => {
    if (!avail || (l.product && l.product !== 'fresh_frozen')) return Infinity
    const x = avail.find(a => a.k === `${l.strain.toLowerCase()}|${year}`)
    // a confirmed order's lbs are already off the menu / reserve, so they count back in; a submitted one's aren't held yet
    return (x ? x.open + x.res : 0) + (o.status === 'pending' && year === (l.crop_year ?? cy) ? Number(l.lbs) : 0)
  }
  async function addLine() {
    if (!addPick) return
    if (Number(add.lbs) > addMax) throw new Error(`Only ${n0(addMax)} lbs of ${addPick.strain} available`)
    await backend.setOrderLine(o.id, null, addPick.strain, Number(add.lbs), null)
    if (addPick.year !== cy) {   // older crop: move the new line to that crop year
      const sb = backend.client()!
      const { data } = await sb.from('order_lines').select('id').eq('order_id', o.id).ilike('strain', addPick.strain).order('id', { ascending: false }).limit(1)
      const id = (data as { id: number }[] | null)?.[0]?.id
      if (id) { const { error } = await sb.rpc('set_order_line_year', { p_line: id, p_year: addPick.year }); if (error) throw new Error(error.message) }
    }
  }
  const run = async (f: () => Promise<void>, ok: string) => {
    setBusy(true)
    try { await f(); flash(ok); setEdits({}); setAdd({ strain: '', lbs: '' }); onChanged() } catch (e) { flash(String((e as Error).message ?? e), true) } finally { setBusy(false) }
  }
  const open_ = o.status === 'submitted' || o.status === 'pending' || o.status === 'draft'
  const total = o.order_lines.reduce((a, l) => a + Number(l.lbs) * Number(l.price_per_lb ?? 0), 0)
  return (
    <div className="ordered">
      <table className="restable">
        <thead><tr><th>Strain</th><th className="num">Lbs</th><th className="num">$/lb</th>{open_ && <th />}</tr></thead>
        <tbody>{o.order_lines.map(l => {
          const e = edits[l.id]
          const eMax = e ? lineMax(l, e.year) : Infinity, eOver = !!e && Number(e.lbs) > eMax
          return (
            <tr key={l.id}>
              <td>{l.strain}{!e && l.crop_year && l.crop_year !== cy ? <span className="pill old">{l.crop_year} crop</span> : null}{e && <Select className="inline" value={e.year} title="Crop year" onChange={x => setEdits({ ...edits, [l.id]: { ...e, year: Number(x.target.value) } })}>
                {[...new Set([cy, cy - 1, cy - 2, l.crop_year ?? cy])].sort((a, b) => b - a).map(y => <option key={y} value={y}>{y} crop</option>)}</Select>}{l.is_sample && <span className="pill sample">sample{Number(l.hold_lbs ?? 0) > 0 ? ` · holding ${n0(Number(l.hold_lbs))}` : ""}</span>}{l.product && l.product !== 'fresh_frozen' ? <span className="pill prod">{PRODUCT_LABEL[l.product]}</span> : null}<span className="muted">{l.farm ? ` · ${l.farm}` : ''}{l.crop_year ? ` · ${l.crop_year}` : ''}</span>{l.price_override && <div className="muted small">price overridden</div>}</td>
              {e ? <>
                <td className="num"><input className="qty" type="number" step="10" min="0" value={e.lbs} onChange={x => setEdits({ ...edits, [l.id]: { ...e, lbs: x.target.value } })} /></td>
                <td className="num"><input className="qty" type="number" step="0.5" min="0" value={e.price} onChange={x => setEdits({ ...edits, [l.id]: { ...e, price: x.target.value } })} /></td>
                <td className="num">{eOver && <div className="small" style={{ color: 'var(--bad)', fontWeight: 600, whiteSpace: 'nowrap' }}>Only {n0(eMax)} lbs available</div>}<button className="primary small" disabled={busy || eOver} onClick={() => run(async () => {
                  if (Number(e.lbs) > lineMax(l, e.year)) throw new Error(`Only ${n0(lineMax(l, e.year))} lbs of ${l.strain} available`)
                  if (Number(e.lbs) > 0 && e.year !== (l.crop_year ?? cy)) { const { error } = await backend.client()!.rpc('set_order_line_year', { p_line: l.id, p_year: e.year }); if (error) throw new Error(/set_order_line_year|schema cache/i.test(error.message) ? `${error.message} (run 098_crop_years.sql in Supabase)` : error.message) }
                  await backend.setOrderLine(o.id, l.id, l.strain, Number(e.lbs), e.price === '' ? null : Number(e.price))
                }, Number(e.lbs) === 0 ? 'Line removed' : 'Line saved')}>Save</button></td>
              </> : <>
                <td className="num">{n0(Number(l.lbs))}</td>
                <td className="num">{l.price_per_lb != null ? `$${Number(l.price_per_lb).toFixed(2)}` : ''}</td>
                {open_ && <td className="num"><button className="ghost small" onClick={() => setEdits({ ...edits, [l.id]: { lbs: String(l.lbs), price: l.price_per_lb != null ? String(l.price_per_lb) : '', year: l.crop_year ?? cy } })}>Edit</button></td>}
              </>}
            </tr>
          )
        })}</tbody>
        <tfoot>
          {open_ && <tr><td><Select value={add.strain} onChange={e => setAdd({ ...add, strain: e.target.value })} disabled={!avail}>
              <option value="">{avail ? (avail.length ? 'Add a strain' : 'Nothing on the menu or in reserves') : 'Loading menu…'}</option>
              {(avail ?? []).map(x => <option key={x.k} value={x.k}>{x.strain}{x.year !== cy ? ` (${x.year} crop)` : ''} · {n0(x.open + x.res)} lbs available{x.res > 0 ? ` (${n0(x.res)} reserve${x.open > 0 ? ` + ${n0(x.open)} open` : ''})` : ''}</option>)}
            </Select></td>
            <td className="num"><input className="qty" type="number" step="10" min="0" placeholder="lbs" value={add.lbs} onChange={e => setAdd({ ...add, lbs: e.target.value })} /></td>
            <td className="muted small">{addOver ? <span style={{ color: 'var(--bad)', fontWeight: 600 }}>Only {n0(addMax)} lbs available</span> : 'customer price'}</td>
            <td className="num"><button className="ghost small" disabled={busy || !addPick || !(Number(add.lbs) > 0) || addOver} onClick={() => run(addLine, 'Line added')}>Add</button></td></tr>}
          <tr><td colSpan={open_ ? 4 : 3}>
            <div className="muted">{total > 0 && <>Total ${total.toLocaleString(undefined, { maximumFractionDigits: 0 })} · </>}{o.po_number && <>PO {o.po_number} · </>}{o.wanted_date && !open_ && <>requested delivery {fmtDate(o.wanted_date)} · </>}{o.placed_by && <>placed by {o.placed_by}</>}{o.confirmed_by && <> · confirmed by {o.confirmed_by}</>}</div>
            {o.notes && <div className="muted">"{o.notes}"</div>}
          </td></tr>
        </tfoot>
      </table>
      {open_ && (
        <div className="row reqact">
          {o.status === 'submitted' && <button className="primary small" disabled={busy} onClick={() => run(() => backend.setOrderStatus(o.id, 'pending', so, ''), 'Order confirmed')}>Confirm</button>}
          {o.status === 'draft' && (isAdmin
            ? <button className="primary small" disabled={busy} onClick={() => run(() => backend.setOrderStatus(o.id, 'pending', so, ''), 'Draft confirmed')}>Confirm order</button>
            : <span className="muted small">Draft: a Sales Admin confirms it. It holds nothing until then.</span>)}
          <label className="row muted small" style={{ gap: 6 }}>Requested Delivery Date
            <input type="date" value={wantOn} disabled={busy} style={{ maxWidth: 150 }} aria-label="Requested Delivery Date"
              onChange={e => setWantOn(e.target.value)}
              onBlur={() => { const v = wantOn || null; if (v === (o.wanted_date ?? null) || (v && v < '2020-01-01')) { setWantOn(o.wanted_date ?? ''); return } run(async () => { const { error } = await backend.client()!.rpc('set_order_wanted', { p_order: o.id, p_date: v }); if (error) throw new Error(/set_order_wanted|schema cache/i.test(error.message) ? `${error.message} (run 209_order_wanted_date.sql in Supabase)` : error.message) }, v ? `Requested delivery ${fmtDate(v)}` : 'Requested delivery cleared') }} /></label>
          {o.status !== 'draft' && <span className="row"><input type="date" value={shipOn} onChange={e => setShipOn(e.target.value)} aria-label="Shipped on" title="The day it actually shipped" style={{ maxWidth: 150 }} />
            <button className="ghost small" disabled={busy} onClick={() => run(() => backend.setOrderStatus(o.id, 'shipped', so, '', shipOn || null), 'Marked shipped')}>Mark shipped</button></span>}
        </div>
      )}
      {open_ && <div className="row ocancel"><button className="ghost danger" disabled={busy} onClick={() => setAskCancel(true)}>Cancel order…</button></div>}
      {askCancel && <div className="scrim confirm-scrim" onClick={() => setAskCancel(false)}><div className="sheet form confirm" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <h2>Cancel {o.so_number ?? `order #${o.id}`}?</h2>
        <p className="muted">The order is marked Cancelled. If it's on a load that hasn't left, it comes off the load and its pallets go back to Needs a spot. This can't be undone from here.</p>
        <div className="row between fbar"><button className="ghost" onClick={() => setAskCancel(false)}>Keep the order</button>
          <button className="primary danger" disabled={busy} onClick={() => { setAskCancel(false); run(() => backend.setOrderStatus(o.id, 'cancelled', so, ''), 'Order cancelled') }}>Cancel order</button></div>
      </div></div>}
    </div>
  )
}

/** Sales OKs what Distribution assigned when it isn't exactly what was ordered */
export function FillOk({ f, backend, flash, onDone }: { f: FOrder; backend: Backend; flash: (t: string, bad?: boolean) => void; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const diffs = f.lines.map(l => ({ l, got: l.picks.reduce((a, p) => a + Number(p.lbs), 0) })).filter(x => (x.got > 0 || x.l.cant_fill) && x.got !== Number(x.l.lbs))
  return (
    <div className="warnbox fillok">
      <b>Distribution assigned different amounts.</b> OK them and the order lines change to match (and bill from there).
      <table className="restable"><thead><tr><th>Strain</th><th className="num">Ordered</th><th className="num">Assigned</th><th className="num">Diff</th></tr></thead>
        <tbody>{diffs.map(({ l, got }) => <tr key={l.id}><td>{l.strain}</td><td className="num">{n0(Number(l.lbs))}</td><td className="num"><b>{l.cant_fill && !got ? "can't fill" : n0(got)}</b></td>
          <td className={`num ${got > Number(l.lbs) ? 'up' : 'down'}`}>{got > Number(l.lbs) ? '+' : ''}{n0(got - Number(l.lbs))}</td></tr>)}</tbody></table>
      <div className="row"><button className="primary small" disabled={busy} onClick={async () => {
        setBusy(true); try { const n = await backend.approveFill(f.id); await onDone(); flash(`${n} line${n === 1 ? '' : 's'} OK'd`) } catch (e) { flash(String((e as Error).message ?? e), true) } finally { setBusy(false) } }}>OK these amounts</button>
        <span className="muted">Or ask Distribution to change the pallets.</span></div>
    </div>
  )
}

/** RES-10: one customer's reserves as a sortable table. Sales Admins type a new total in Reserved and save them all at once.
 *  Same limits as Add reserves: not under shipped + open SOs, up by at most what's open on the menu. */
function CustReserves({ backend, cid, name, rs, nums, year, cur, isAdmin, flash, onSaved, onAdd }: {
  backend: Backend; cid: number; name: string; rs: Balance[]; nums: MenuNumbers[]; year: number; cur: number; isAdmin: boolean
  flash: (t: string, bad?: boolean) => void; onSaved: () => Promise<void>; onAdd: () => void
}) {
  type K = 'name' | 'res' | 'ship' | 'so' | 'left' | 'open' | 'pct'
  const [srt, setSrt] = useState<{ k: K; up: boolean }>({ k: 'name', up: true })
  const [ed, setEd] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const openOf = (s: string) => { const m = nums.find(x => x.crop_year === year && x.on_menu && x.strain.toLowerCase() === s.toLowerCase()); return m ? Math.max(0, Math.floor(Number(m.free))) : 0 }
  const rows = rs.map(r => { const res = Number(r.reserved), ship = Number(r.shipped), so = Number(r.pending)
    return { r, key: r.strain.toLowerCase(), res, ship, so, left: Math.max(0, Number(r.remaining)), open: openOf(r.strain), pct: res > 0 ? ship / res : 0 } })
  const minOf = (x: typeof rows[number]) => x.ship + x.so
  const maxOf = (x: typeof rows[number]) => Math.max(x.res, x.ship + x.so) + x.open
  const changes = rows.filter(x => ed[x.key] !== undefined && ed[x.key] !== '' && Number(ed[x.key]) !== x.res).map(x => {
    const to = Number(ed[x.key])
    const err = !Number.isFinite(to) || to < 0 ? 'not a number' : to < minOf(x) ? `can't go under ${n0(minOf(x))} (shipped + open SOs)`
      : to > maxOf(x) ? `${n0(maxOf(x))} is the most (${n0(Math.max(x.res, x.ship + x.so))} theirs + ${n0(x.open)} open)` : ''
    return { x, to, d: to - x.res, err } })
  const bad = changes.some(c => c.err)
  const v = (x: typeof rows[number]) => srt.k === 'name' ? x.r.strain.toLowerCase() : x[srt.k]
  rows.sort((a, b) => { const p = v(a), q = v(b); const d = typeof p === 'string' ? p.localeCompare(q as string) : (p as number) - (q as number); return srt.up ? d : -d })
  const tot = rows.reduce((t, x) => ({ res: t.res + x.res, ship: t.ship + x.ship, so: t.so + x.so, left: t.left + x.left }), { res: 0, ship: 0, so: 0, left: 0 })
  const dTot = changes.filter(c => !c.err).reduce((a, c) => a + c.d, 0)
  const th = (k: K, label: string, num = true, title?: string) => <th className={`${num ? 'num ' : ''}sortth${srt.k === k ? ' on' : ''}`} title={title} aria-sort={srt.k === k ? (srt.up ? 'ascending' : 'descending') : 'none'}>
    <button className="linkbtn" onClick={() => setSrt(o => ({ k, up: o.k === k ? !o.up : k === 'name' }))}>{label}{srt.k === k ? (srt.up ? ' ▲' : ' ▼') : ''}</button></th>
  async function save() {
    if (!changes.length || bad) return
    setBusy(true); let done = 0
    try {
      for (const c of changes) { await backend.setReserve(cid, c.x.r.strain, c.to, note.trim() || undefined, year !== cur ? year : undefined); done++ }
      flash(`${done} reserve${done === 1 ? '' : 's'} saved for ${name}`); setEd({}); setNote(''); await onSaved()
    } catch (e) { flash(`${done ? `${done} saved, then: ` : ''}${String((e as Error).message ?? e)}`, true); if (done) await onSaved() }
    finally { setBusy(false) }
  }
  return <>
    <div className="cwrap"><table className="ctable restbl rescust">
      <thead><tr>{th('name', 'Strain', false)}{th('res', isAdmin ? 'Reserved (new total)' : 'Reserved')}{th('ship', 'Shipped')}{th('so', 'Open SO', true, 'On confirmed open sales orders; these lbs count against the reserve')}{th('left', 'Left')}{th('open', 'Open menu', true, 'Free on the menu: how much the reserve can go up')}{th('pct', 'Shipped %')}</tr></thead>
      <tbody>{rows.map(x => { const c = changes.find(z => z.x.key === x.key)
        return <tr key={x.r.id} className={c ? (c.err ? 'bad' : 'on') : ''}>
          <td className="c-n"><StrainLink name={x.r.strain} />{c?.err && <div className="warn-t small">{c.err}</div>}
            {Number(x.r.rejected ?? 0) > 0 && <div className="small warn-t" title="Rejected at delivery and back on this reserve. Lower the reserve if they shouldn't get these lbs back.">{n0(Number(x.r.rejected))} rejected, back on reserve</div>}</td>
          <td className="num c-r" data-l="reserved ">{isAdmin && <span className={`rdel ${c && !c.err ? (c.d > 0 ? 'ok-t' : 'warn-t') : ''}`}>{c && !c.err ? `${c.d > 0 ? '+' : ''}${n0(c.d)}` : ''}</span>}{isAdmin
            ? <input className={`qty ${c?.err ? 'bad' : ''}`} type="number" step="10" min="0" inputMode="numeric" aria-label={`Reserve total for ${x.r.strain}`}
                value={ed[x.key] ?? String(x.res)} onChange={e => setEd(m => ({ ...m, [x.key]: e.target.value }))} onFocus={e => e.target.select()} />
            : n0(x.res)}</td>
          <td className="num" data-l="shipped ">{n0(x.ship)}</td>
          <td className="num" data-l="open SO ">{x.so > 0 ? n0(x.so) : <span className="muted">0</span>}</td>
          <td className="num c-lf" data-l="left "><b>{c && !c.err ? n0(Math.max(0, c.to - x.ship - x.so)) : n0(x.left)}</b></td>
          <td className="num muted" data-l="open ">{n0(x.open)}</td>
          <td className="num c-pc" data-l=""><span className="respct"><i style={{ width: `${Math.min(100, Math.round(x.pct * 100))}%` }} /></span> {Math.round(x.pct * 100)}%</td>
        </tr> })}</tbody>
      <tfoot><tr><td><b>{rows.length} strain{rows.length === 1 ? '' : 's'}</b></td><td className="num"><b>{n0(tot.res + dTot)}</b>{dTot !== 0 && <div className="small muted">was {n0(tot.res)}</div>}</td><td className="num">{n0(tot.ship)}</td><td className="num">{n0(tot.so)}</td>
        <td className="num"><b>{n0(tot.left + changes.filter(c => !c.err).reduce((a, c) => a + Math.max(0, c.to - c.x.ship - c.x.so) - c.x.left, 0))}</b></td><td /><td className="num">{tot.res > 0 ? Math.round(tot.ship / tot.res * 100) : 0}%</td></tr></tfoot>
    </table></div>
    {isAdmin && changes.length > 0 && <div className="rescsave">
      <div className="grow"><b>{changes.length} change{changes.length === 1 ? '' : 's'}</b> <span className="muted">· {dTot > 0 ? '+' : ''}{n0(dTot)} lbs · new total {n0(tot.res + dTot)}</span></div>
      <input type="text" placeholder="Reason (optional, they see it in Reserve History)" value={note} onChange={e => setNote(e.target.value)} aria-label="Reason" />
      <button className="ghost" disabled={busy} onClick={() => { setEd({}); setNote('') }}>Cancel</button>
      <button className="primary" disabled={busy || bad} onClick={save}>{busy ? 'Saving…' : bad ? 'Fix the red lines' : `Save ${changes.length}`}</button>
    </div>}
    {isAdmin && <div className="row rescfoot"><span className="muted small">Type the new total in Reserved (it includes what's shipped and on open SOs). 0 removes a reserve that has nothing shipped or on an order.</span>
      <button className="ghost small" onClick={onAdd}>+ Add strains for {name}</button></div>}
  </>
}
