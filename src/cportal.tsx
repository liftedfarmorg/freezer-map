// Customer portal (redesign, 150): mobile-first home with tiles, Contract Reserves, Open Menu, Place an order,
// Orders & Statement, My Contract and Sample Holds for You. Layout and behaviour follow the approved prototype
// (see the project doc customer-portal-redesign-spec.md). Styles live in cportal.css, scoped under .cp.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import './cportal.css'
import { downloadStatement } from './statement'
import type { Backend } from './api'
import type { Balance, Me, QboLine, MenuRow, MyContract, Order, OrderInput, ReserveLineInput, ReserveRequest, SampleHold, Statement, StatementInvoice, Terms } from './types'

/* ---------- helpers ---------- */
const c = (s: string) => s.split(/\s+/).filter(Boolean).map(x => 'cp-' + x).join(' ')
const fmt = (n: number | null | undefined) => Math.round(Number(n ?? 0)).toLocaleString('en-US')
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US')
const money2 = (n: number) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const f10 = (n: number | null | undefined) => Math.max(0, Math.floor(Number(n ?? 0) / 10) * 10)
const not10 = (v: number) => v % 10 !== 0
const TEN = 'Use steps of 10 lbs, like 120 or 130'
const lc = (s: string) => s.toLowerCase()
const kOf = (s: string, y: number) => lc(s) + '|' + y
const iso = (d: Date) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
const day = (v: string | null | undefined) => (v ? new Date(v.slice(0, 10) + 'T12:00') : null)
const shortDate = (v: string | null | undefined) => day(v)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) ?? ''
const niceDate = (v: string) => new Date(v + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
const daysUntil = (v: string | null | undefined) => { const d = day(v); if (!d) return 0; d.setHours(0, 0, 0, 0); return Math.max(0, Math.round((d.getTime() - today0().getTime()) / 86400000)) }
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
const snap = (v: number, d: number) => Math.max(0, d > 0 ? Math.floor(v / 10) * 10 + 10 : Math.ceil(v / 10) * 10 - 10)
const soLabel = (o: Order) => o.so_number || `Order #${o.id}`
const priceFmt = (p: number) => `$${p % 1 ? p.toFixed(2) : p}/lb`
/** QuickBooks' invoice lines as the portal shows them: fresh frozen lines are lbs of a strain; other lines (shipping, discounts, deposits) keep their amount */
function qboLines(lines: QboLine[]): OLineView[] {
  const out: OLineView[] = []
  for (const l of lines) {
    const desc = (l.description ?? '').split('\n')[0].trim(), text = `${l.item ?? ''} ${l.description ?? ''}`
    const amount = l.amount != null ? Number(l.amount) : null
    if (/fresh frozen/i.test(text) && Number(l.price ?? 0) >= 0 && Number(l.qty ?? 0) > 0) {
      const yr = /\bFL(\d{2})-/.exec(l.description ?? '')
      out.push({ s: desc.replace(/\s*-\s*fresh frozen$/i, '') || (l.item ?? ''), y: yr ? 2000 + Number(yr[1]) : null, lbs: Number(l.qty), price: l.price != null ? Number(l.price) : null, amount })
    } else if (amount) out.push({ s: desc || (l.item ?? '').replace(/^.*:/, ''), y: null, lbs: null, price: null, amount })
  }
  return out
}

const I = {
  back: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>,
  down: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5f6b64" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>,
  up: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5f6b64" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>,
  user: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6" /></svg>,
  close: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>,
  search: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  doc: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /></svg>,
  check: <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>,
  cal: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>,
}

/** typed quantity in lbs with −/+ 10 buttons */
function Stepper({ val, on, bad, label, onChange, autoFocus }: { val: number; on?: boolean; bad?: boolean; label: string; onChange: (n: number) => void; autoFocus?: boolean }) {
  return (
    <span className={c(`stepper ${on ? 'on' : ''} ${bad ? 'bad' : ''}`)}>
      <button type="button" onClick={() => onChange(snap(val, -10))} aria-label={`Less ${label}`}>−</button>
      <input type="text" inputMode="numeric" pattern="[0-9]*" value={val ? String(val) : ''} placeholder="0" aria-label={`${label} lbs`} aria-invalid={bad ? 'true' : 'false'} autoFocus={autoFocus}
        onChange={e => { const d = e.target.value.replace(/[^0-9]/g, '').slice(0, 6); onChange(d ? Number(d) : 0) }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
      <button type="button" onClick={() => onChange(snap(val, 10))} aria-label={`More ${label}`}>+</button>
    </span>
  )
}
const StepErr = ({ msg }: { msg: string }) => <p className={c('err')} style={{ margin: '2px 0 0' }}>{msg}</p>

/* ---------- data ---------- */
type Screen = 'home' | 'contract' | 'reserves' | 'edit' | 'sent' | 'menu' | 'order' | 'review' | 'ordered' | 'orders' | 'holds'
interface Data {
  cy: number; contract: boolean; terms: Terms | null; menu: MenuRow[]; bal: Balance[]; reqs: ReserveRequest[]; orders: Order[]; flags: number[]
  st: Statement | null; mc: MyContract | null; holds: SampleHold[]; holdDays: number; prices: Record<number, number | null>; qbo: Record<string, QboLine[]>
}
interface ResRow { k: string; s: string; y: number; res: number; used: number; left: number; asked: number | null }
interface MenuItem { k: string; s: string; y: number; open: number; hold: number; row: MenuRow }
interface OLine { k: string; s: string; y: number; resLeft: number; open: number; hold: number }
interface Detail { k: string; s: string; y: number; q: number; fromHold: number; fromRes: number; fromOpen: number; max: number; sample: boolean; hold: number; price: number | null }
interface Change { s: string; y: number; from: number; to: number; isNew?: boolean }
interface OLineView { s: string; y: number | null; lbs: number | null; price: number | null; amount: number | null }
interface ORow {
  key: string; label: string; status: 'submitted' | 'fulfillment' | 'shipped'; paid: boolean | null; date: string | null; due: string | null; wanted: string | null
  lines: OLineView[]; amount: number | null; po: string | null; so: string | null; order: Order | null; inv: StatementInvoice | null; holdLbs: number; rank: number
}

async function loadAll(backend: Backend): Promise<Data> {
  const safe = <T,>(p: Promise<T>, d: T) => p.catch(() => d)
  const [terms, ys, menu, bal, reqs, orders, flags, st, mc, holds, hd] = await Promise.all([
    safe(backend.myTerms(), null), safe(backend.reserveYears(), null), safe(backend.openMenu(), [] as MenuRow[]), safe(backend.listBalances(), [] as Balance[]),
    safe(backend.listRequests(), [] as ReserveRequest[]), safe(backend.listOrders(), [] as Order[]), safe(backend.myOrderFlags(), [] as number[]),
    safe(backend.statement(), null), safe(backend.myContract(), null), safe(backend.sampleHolds(), [] as SampleHold[]), safe(backend.mySampleHoldDays(), null),
  ])
  const cy = ys?.current ?? mc?.year ?? Math.max(new Date().getFullYear(), ...menu.map(m => m.crop_year))
  const years = [...new Set([cy, ...menu.map(m => m.crop_year), ...orders.flatMap(o => o.order_lines.map(l => l.crop_year ?? cy))])]
  const ps = await Promise.all(years.map(y => safe(backend.myTermsFor(y), null).then(t => [y, t?.price_per_lb ?? null] as const)))
  const qbo = await safe(backend.qboInvoiceLines((st?.invoices ?? []).map(i => i.qbo_id).filter((x): x is string => !!x)), {} as Record<string, QboLine[]>)
  const prices: Record<number, number | null> = {}
  for (const [y, p] of ps) prices[y] = p != null ? Number(p) : (terms?.price_per_lb != null ? Number(terms.price_per_lb) : null)
  return { cy, contract: !!(terms?.reserves_enabled ?? mc?.reserves_enabled), terms, menu, bal, reqs, orders, flags, st, mc, holds, holdDays: hd ?? 10, prices, qbo }
}

/* ---------- the portal ---------- */
export function Portal({ backend, me, signOut }: { backend: Backend; me: Me; signOut: () => void }) {
  useEffect(() => { document.title = 'Lifted Farms Orders' }, [])
  const [d, setD] = useState<Data | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const reload = () => loadAll(backend).then(x => { setD(x); setLoadErr(null) }).catch(e => setLoadErr(String(e?.message ?? e)))
  useEffect(() => { reload() }, [])

  const [screen, setScreen] = useState<Screen>('home')
  useEffect(() => {
    history.replaceState({ ...(history.state ?? {}), cp: 'home' }, '')
    const pop = (e: PopStateEvent) => { setScreen((e.state?.cp as Screen) ?? 'home'); window.scrollTo({ top: 0 }) }
    addEventListener('popstate', pop); return () => removeEventListener('popstate', pop)
  }, [])
  const go = (s: Screen) => { setScreen(s); history.pushState({ cp: s }, ''); window.scrollTo({ top: 0 }) }

  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const toastT = useRef<number>()
  const toast = (m: string) => { setToastMsg(m); clearTimeout(toastT.current); toastT.current = window.setTimeout(() => setToastMsg(null), 3200) }
  const [busy, setBusy] = useState(false)
  async function run<T>(f: () => Promise<T>): Promise<T | undefined> {
    setBusy(true)
    try { return await f() } catch (e) { toast(String((e as Error).message ?? e)) } finally { setBusy(false) }
  }

  // account
  const [acct, setAcct] = useState(false)
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('')

  // reserve editing (shared by Open Menu and Edit Reserves)
  const [edit, setEdit] = useState<Record<string, number> | null>(null)
  const [editNew, setEditNew] = useState<{ k: string; s: string; y: number; lbs: number }[]>([])
  const [menuOpen, setMenuOpen] = useState<string[]>([])
  const [editFrom, setEditFrom] = useState<Screen>('reserves')
  const [reqNote, setReqNote] = useState('')
  const [lastReq, setLastReq] = useState<Change[]>([])
  const [q, setQ] = useState('')
  const [editQ, setEditQ] = useState('')
  const [orderQ, setOrderQ] = useState('')
  const [menuYear, setMenuYear] = useState<'all' | number>('all')

  // order form
  const [ord, setOrd] = useState<Record<string, number>>({})
  const [smp, setSmp] = useState<Record<string, boolean>>({})
  const [holdAsk, setHoldAsk] = useState<Record<string, number>>({})
  const [po, setPo] = useState(''); const [note, setNote] = useState(''); const [wanted, setWanted] = useState('')
  const [editing, setEditing] = useState<Order | null>(null)
  const [cal, setCal] = useState<{ y: number; m: number } | null>(null)
  const [focusK, setFocusK] = useState<string | null>(null)
  const [lastOrder, setLastOrder] = useState<{ label: string; lbs: number; res: number; amount: number | null; detail: Detail[]; modified: boolean } | null>(null)

  // orders
  const [filter, setFilter] = useState('all')
  const [openRow, setOpenRow] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState<ORow | null>(null)
  const [stBusy, setStBusy] = useState(false)

  // holds
  const [holdSel, setHoldSel] = useState<number[]>([])
  const [holdQty, setHoldQty] = useState<Record<number, number>>({})
  const [releasing, setReleasing] = useState<SampleHold | null>(null)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setConfirmCancel(null); setCal(null); setReleasing(null); setAcct(false) } }
    addEventListener('keydown', esc); return () => removeEventListener('keydown', esc)
  }, [])

  /* ---------- derived ---------- */
  const cy = d?.cy ?? new Date().getFullYear()
  const contract = !!d?.contract
  const yrTag = (y: number) => y < cy ? <span className={c('yr old')}>{y} crop</span> : null

  const menuItems: MenuItem[] = useMemo(() => (d?.menu ?? []).filter(m => m.crop_year <= cy).map(m => ({
    k: kOf(m.strain, m.crop_year), s: m.strain, y: m.crop_year, open: f10(m.available), hold: Number(m.my_hold ?? 0), row: m,
  })), [d])
  const menuRow = (k: string) => menuItems.find(m => m.k === k)

  const reserves: ResRow[] = useMemo(() => {
    if (!d) return []
    const out = new Map<string, ResRow>()
    for (const b of d.bal) {
      const y = b.crop_year ?? cy
      if (y > cy || Number(b.reserved) <= 0) continue
      out.set(kOf(b.strain, y), { k: kOf(b.strain, y), s: b.strain, y, res: Number(b.reserved), used: Number(b.shipped) + Number(b.pending), left: Math.max(Number(b.remaining), 0), asked: null })
    }
    for (const r of d.reqs) {
      const y = r.crop_year ?? cy
      if (r.status !== 'pending' || y > cy) continue
      const k = kOf(r.strain, y), x = out.get(k)
      if (x) x.asked = Number(r.requested_lbs)
      else out.set(k, { k, s: r.strain, y, res: 0, used: 0, left: 0, asked: Number(r.requested_lbs) })
    }
    return [...out.values()].sort((a, b) => a.s.localeCompare(b.s) || b.y - a.y)
  }, [d])
  const resRow = (k: string) => reserves.find(r => r.k === k)
  const totals = reserves.reduce((a, r) => ({ res: a.res + r.res, used: a.used + r.used, left: a.left + r.left }), { res: 0, used: 0, left: 0 })

  const liveHolds = (d?.holds ?? []).filter(h => h.state === 'submitted' || h.state === 'waiting' || h.state === 'active')
  const activeHeld = (k: string) => liveHolds.filter(h => h.state === 'active' && kOf(h.strain, h.crop_year) === k).reduce((a, h) => a + Number(h.remaining), 0)
  const holdLbs = (h: SampleHold) => Number(h.state === 'active' ? h.remaining : h.hold_lbs)
  const sampleOf = (h: SampleHold) => Number(d?.orders.flatMap(o => o.order_lines).find(l => l.id === h.line_id)?.lbs ?? 0)
  const holdReq = (h: SampleHold) => d?.reqs.find(r => r.status === 'pending' && r.hold_line_id === h.line_id)
  const priceOf = (y: number) => d?.prices[y] ?? (d?.terms?.price_per_lb != null ? Number(d.terms.price_per_lb) : null)

  /* ---------- reserve edits ---------- */
  const ed: Record<string, number> = edit ?? Object.fromEntries(reserves.map(r => [r.k, r.asked ?? r.res]))
  const setRes = (k: string, v: number) => setEdit({ ...ed, [k]: v })
  const availFor = (k: string) => (menuRow(k)?.open ?? 0) + f10(activeHeld(k))
  function resErr(r: ResRow) {
    const v = ed[r.k] ?? 0, base = r.asked ?? r.res
    if (v === base) return ''   // only lines being changed are checked (some reserves aren't in steps of 10)
    if (not10(v)) return TEN
    if (v < r.used) return `Can't go below the ${fmt(r.used)} lbs already picked up`
    if (v - base > availFor(r.k)) return `Only ${fmt(availFor(r.k))} more lbs available`
    return ''
  }
  const newErr = (n: { k: string; lbs: number }) => not10(n.lbs) ? TEN : n.lbs > availFor(n.k) ? `Only ${fmt(availFor(n.k))} lbs available` : n.lbs <= 0 ? 'Enter how many lbs to reserve, or remove it' : ''
  const changes: Change[] = [
    ...editNew.filter(n => n.lbs > 0).map(n => ({ s: n.s, y: n.y, from: 0, to: n.lbs, isNew: true })),
    ...reserves.filter(r => (ed[r.k] ?? 0) !== (r.asked ?? r.res)).map(r => ({ s: r.s, y: r.y, from: r.res, to: ed[r.k] ?? 0 })),
  ]
  const anyResErr = editNew.some(n => !!newErr(n)) || reserves.some(r => !!resErr(r))
  const clearEdit = () => { setEdit(null); setEditNew([]); setMenuOpen([]); setReqNote(''); setEditQ('') }
  const changedLine = (r: ResRow) => {
    const v = ed[r.k] ?? 0, base = r.asked ?? r.res
    return v !== base ? <span style={{ color: 'var(--teal-ink)', fontWeight: 500 }}>Was {fmt(base)} · {v > base ? '+' : '−'}{fmt(Math.abs(v - base))}</span> : null
  }
  async function sendReq() {
    const lines: ReserveLineInput[] = changes.map(ch => ({ strain: ch.s, crop_year: ch.y, lbs: ch.to }))
    const n = await run(() => backend.requestReserveLines(lines, reqNote))
    if (n === undefined) return
    setLastReq(changes); clearEdit(); await reload(); go('sent')
  }

  /* ---------- order form ---------- */
  const addBack: Record<string, number> = {}
  if (editing && editing.status === 'pending') for (const l of editing.order_lines) { const k = kOf(l.strain, l.crop_year ?? cy); addBack[k] = (addBack[k] ?? 0) + Number(l.lbs) }
  const orderable = useMemo(() => {
    const lines: OLine[] = menuItems.map(m => ({ k: m.k, s: m.s, y: m.y, resLeft: contract ? f10(m.row.my_left) : 0, open: m.open + (addBack[m.k] ?? 0), hold: f10(m.hold) }))
    if (editing) for (const l of editing.order_lines) {   // lines on the order that aren't on the menu any more
      const k = kOf(l.strain, l.crop_year ?? cy)
      if (!lines.some(x => x.k === k)) lines.push({ k, s: l.strain, y: l.crop_year ?? cy, resLeft: 0, open: Number(l.lbs), hold: 0 })
    }
    const isRes = (l: OLine) => contract && !!menuRow(l.k) && Number(menuRow(l.k)!.row.my_reserved ?? 0) > 0
    const sort = (a: OLine, b: OLine) => a.s.localeCompare(b.s) || b.y - a.y
    const resd = lines.filter(isRes).sort(sort)
    const others = lines.filter(l => !isRes(l) && (l.open + l.hold > 0 || l.k in ord)).sort(sort)
    return { resd, others }
  }, [menuItems, contract, editing, ord, d])
  const lineSplit = (l: OLine, qv: number) => {
    const fromHold = Math.min(qv, l.hold), fromRes = Math.min(qv - fromHold, l.resLeft), fromOpen = qv - fromHold - fromRes
    return { fromHold, fromRes, fromOpen, max: l.resLeft + l.open + l.hold }
  }
  const lineError = (l: OLine, qv: number) => { const sp = lineSplit(l, qv); return not10(qv) ? TEN : qv > sp.max ? `Only ${fmt(sp.max)} lbs available` : '' }
  const holdError = (l: OLine, qv: number, h: number) => {
    const max = lineSplit(l, qv).max, room = Math.max(max - qv, 0)
    return not10(h) ? TEN : h > room ? `Only ${fmt(room)} lbs left to hold (${fmt(max)} available − ${fmt(qv)} lb sample)` : ''
  }
  const allLines = [...orderable.resd, ...orderable.others]
  const detail: Detail[] = allLines.filter(l => (ord[l.k] ?? 0) > 0).map(l => {
    const qv = ord[l.k], sp = lineSplit(l, qv)
    return { k: l.k, s: l.s, y: l.y, q: qv, ...sp, sample: !!smp[l.k], hold: smp[l.k] ? (holdAsk[l.k] ?? 0) : 0, price: priceOf(l.y) }
  })
  const oTot = {
    lbs: detail.reduce((a, x) => a + x.q, 0), res: detail.reduce((a, x) => a + x.fromRes, 0), open: detail.reduce((a, x) => a + x.fromOpen + x.fromHold, 0),
    amount: detail.some(x => x.price == null) ? null : detail.reduce((a, x) => a + x.q * (x.price ?? 0), 0),
    bad: allLines.some(l => l.k in ord && (!!lineError(l, ord[l.k] ?? 0) || (smp[l.k] && !!holdError(l, ord[l.k] ?? 0, holdAsk[l.k] ?? 0)))),
  }
  function newOrder(pre: Record<string, number> = {}) {
    setEditing(null); setOrd(pre); setSmp({}); setHoldAsk({}); setPo(''); setNote(''); setWanted(''); setOrderQ(''); go('order')
  }
  function modify(o: Order) {
    const m: Record<string, number> = {}, s: Record<string, boolean> = {}, h: Record<string, number> = {}
    for (const l of o.order_lines) {
      const k = kOf(l.strain, l.crop_year ?? cy); m[k] = (m[k] ?? 0) + Number(l.lbs)
      if (l.is_sample) { s[k] = true; if (l.hold_lbs) h[k] = Number(l.hold_lbs) }
    }
    setOrderQ(''); setEditing(o); setOrd(m); setSmp(s); setHoldAsk(h); setPo(o.po_number ?? ''); setNote(o.notes ?? ''); setWanted(o.wanted_date ?? ''); go('order')
  }
  function closeOrder() { const was = editing; setEditing(null); setOrd({}); go(was ? 'orders' : 'home') }
  async function placeOrder() {
    const lines: OrderInput[] = detail.map(x => ({ strain: x.s, crop_year: x.y, lbs: x.q, sample: x.sample, hold_lbs: x.sample && x.hold > 0 ? x.hold : null }))
    const was = editing
    const id = await run(() => was ? backend.updateMyOrder(was.id, lines, note, po, wanted || null) : backend.placeOrder(lines, note, po, wanted || null, lines.some(l => l.sample)))
    if (id === undefined) return
    const fresh = await loadAll(backend).catch(() => null)
    if (fresh) setD(fresh)
    const o = fresh?.orders.find(x => x.id === id)
    setLastOrder({ label: o ? soLabel(o) : was ? soLabel(was) : `Order #${id}`, lbs: oTot.lbs, res: oTot.res, amount: oTot.amount, detail, modified: !!was })
    setEditing(null); setOrd({}); setSmp({}); setHoldAsk({}); setPo(''); setNote(''); setWanted(''); setOpenRow('o' + id)
    go('ordered')
  }

  /* ---------- orders & statement ---------- */
  const orows: ORow[] = useMemo(() => {
    if (!d) return []
    const invs = d.st?.invoices ?? []
    const used = new Set<StatementInvoice>()
    const rows: ORow[] = []
    for (const o of d.orders) {
      if (o.status === 'draft' || o.status === 'cancelled') continue
      const lines: OLineView[] = o.order_lines.map(l => ({ s: l.strain, y: l.crop_year ?? cy, lbs: Number(l.lbs), price: l.price_per_lb != null ? Number(l.price_per_lb) : null, amount: null }))
      const sum = lines.some(l => l.price == null) ? null : lines.reduce((a, l) => a + (l.lbs ?? 0) * (l.price ?? 0), 0)
      const holdLbs = o.order_lines.reduce((a, l) => a + (l.is_sample ? Number(l.hold_lbs ?? 0) : 0), 0)
      if (o.status === 'shipped') {
        // the invoice for this order: linked through the app, or (orders from before the app) QuickBooks' invoice numbered with the SO
        const inv = o.so_number ? invs.find(i => i.kind !== 'CreditMemo' && i.so_number === o.so_number)
          ?? invs.find(i => i.kind !== 'CreditMemo' && !used.has(i) && i.inv_number === o.so_number) ?? null : null
        if (inv) used.add(inv)
        const paid = inv ? inv.status === 'paid' || Number(inv.balance) <= 0 : null
        const ql = inv?.qbo_id ? d.qbo[inv.qbo_id] : undefined   // what was actually invoiced (shipped weights) when QuickBooks has it
        rows.push({ key: 'o' + o.id, label: inv?.inv_number ?? soLabel(o), status: 'shipped', paid, date: o.shipped_date ?? inv?.invoice_date ?? o.order_date, due: inv?.due_date ?? null,
          wanted: null, lines: ql?.length ? qboLines(ql) : lines, amount: inv ? Number(paid ? inv.total : inv.balance) : sum, po: o.po_number ?? inv?.po_number ?? null, so: o.so_number, order: o, inv, holdLbs, rank: 2 })
      } else {
        const ful = d.flags.includes(o.id)
        rows.push({ key: 'o' + o.id, label: soLabel(o), status: ful ? 'fulfillment' : 'submitted', paid: null, date: o.order_date, due: null, wanted: o.wanted_date ?? null,
          lines, amount: sum, po: o.po_number ?? null, so: o.so_number, order: o, inv: null, holdLbs, rank: ful ? 1 : 0 })
      }
    }
    for (const i of invs) {
      if (used.has(i) || i.kind === 'CreditMemo' || i.status === 'void') continue
      const paid = i.status === 'paid' || Number(i.balance) <= 0
      // invoices from QuickBooks can share id 0 (not made in the app), so key them by QuickBooks' id or number
      rows.push({ key: 'i' + (i.qbo_id ?? i.inv_number ?? i.id), label: i.inv_number, status: 'shipped', paid, date: i.invoice_date, due: i.due_date, wanted: null,
        lines: i.qbo_id && d.qbo[i.qbo_id] ? qboLines(d.qbo[i.qbo_id]) : [], amount: Number(paid ? i.total : i.balance),
        po: i.po_number, so: i.so_number, order: null, inv: i, holdLbs: 0, rank: 2 })
    }
    return rows.sort((a, b) => a.rank - b.rank || String(b.date ?? '').localeCompare(String(a.date ?? '')))
  }, [d])
  const openInvoices = (d?.st?.invoices ?? []).filter(i => i.status === 'open' && Number(i.balance) > 0 && i.kind !== 'CreditMemo')
  const sb = backend.client()
  async function viewInvoice(r: ORow) {
    const i = r.inv
    if (!i) return
    if (!i.qbo_id || !sb) { window.open(`/?doc=${i.share_token}`, '_blank', 'noopener'); return }
    const w = window.open('', '_blank')
    try {
      const { data } = await sb.auth.getSession()
      const res = await fetch('/api/qbo/doc', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify({ kind: i.kind ?? 'Invoice', qbo_id: i.qbo_id }) })
      const j = await res.json().catch(() => ({})) as { url?: string; error?: string }
      if (!res.ok || !j.url) throw new Error(j.error ?? `Couldn't open it (${res.status})`)
      if (w) w.location.href = j.url; else location.href = j.url
    } catch (e) { w?.close(); toast(String((e as Error).message ?? e)) }
  }

  /* ---------- holds ---------- */
  const holdMenuOpen = (h: SampleHold) => menuRow(kOf(h.strain, h.crop_year))?.open ?? 0
  const holdErr = (h: SampleHold) => {
    const v = holdQty[h.line_id] ?? holdLbs(h), max = f10(holdLbs(h)) + holdMenuOpen(h)
    return not10(v) ? TEN : v > max ? `Only ${fmt(max)} lbs available (${fmt(holdLbs(h))} held + ${fmt(holdMenuOpen(h))} on the menu)` : v <= 0 ? 'Enter how many lbs to reserve' : ''
  }
  async function holdSendAll() {
    const picked = liveHolds.filter(h => holdSel.includes(h.line_id) && h.state === 'active' && !holdReq(h))
    const by = new Map<string, { h: SampleHold; v: number }>()
    for (const h of picked) { const k = kOf(h.strain, h.crop_year), v = holdQty[h.line_id] ?? f10(holdLbs(h)), x = by.get(k); if (x) x.v += v; else by.set(k, { h, v }) }
    const lines: ReserveLineInput[] = [], ch: Change[] = []
    for (const [k, { h, v }] of by) {
      const r = resRow(k), base = r ? (r.asked ?? r.res) : 0
      lines.push({ strain: h.strain, crop_year: h.crop_year, lbs: base + v, hold_line: h.line_id })
      ch.push({ s: h.strain, y: h.crop_year, from: r?.res ?? 0, to: base + v, isNew: !r })
    }
    const n = await run(() => backend.requestReserveLines(lines, 'From sample holds'))
    if (n === undefined) return
    setHoldSel([]); setHoldQty({}); setLastReq(ch); await reload(); go('sent')
  }
  async function doRelease(h: SampleHold) {
    const ok = await run(() => backend.releaseMyHold(h.line_id).then(() => true))
    setReleasing(null)
    if (!ok) return
    setHoldSel(s => s.filter(x => x !== h.line_id)); toast(`${fmt(holdLbs(h))} lbs of ${h.strain} released`); reload()
  }

  /* ---------- screens ---------- */
  const back = (to: Screen, label: string) => <button className={c('back')} onClick={() => go(to)}>{I.back}{label}</button>
  const balance = d?.st?.balance

  function Home() {
    const open = orows.filter(o => o.status !== 'shipped'), nSub = open.filter(o => o.status === 'submitted').length, nFul = open.length - nSub
    const mon = new Date().toLocaleDateString('en-US', { month: 'short' })
    const cur = d?.mc?.months?.length ? d.mc.months[d.mc.months.length - 1] : null
    const thisMonth = cur && cur.month.slice(0, 7) === iso(new Date()).slice(0, 7) ? Number(cur.lbs) : Number(d?.st?.month.shipped ?? 0)
    const min = d?.mc?.monthly_min_lbs ?? d?.st?.month.min ?? null, leftMin = min != null ? Math.max(Number(min) - thisMonth, 0) : null
    const menuTotal = menuItems.reduce((a, m) => a + m.open, 0), menuN = menuItems.filter(m => m.open > 0).length
    const hs = liveHolds, act = hs.filter(h => h.state === 'active').sort((a, b) => daysUntil(a.until) - daysUntil(b.until)), soon = act[0]
    const names = hs.map(h => h.strain), shown = names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3} more` : '')
    return (
      <div className={c('screen')}>
        <header className={c('hdr home-hdr')}>
          <div className={c('top')}><img className={c('logo')} src="/logo-dark.svg" alt="Lifted" /><button className={c('iconbtn')} onClick={() => setAcct(true)} aria-label="Account settings">{I.user}</button></div>
          <p className={c('sub')} style={{ marginTop: 22, fontSize: 15 }}>{me.customer_name}</p>
          <p className={c('bal')}>{balance ? money2(balance.amount) : '—'}</p>
          {balance && balance.past_due > 0
            ? <p className={c('sub')} style={{ color: '#f9a8b8' }}>Balance · {money2(balance.past_due)} past due</p>
            : <p className={c('sub mint')}>{balance ? 'Balance · nothing past due' : 'Balance'}</p>}
        </header>
        <main className={c('main lift')}>
          {contract && <button className={c('tile')} onClick={() => go('reserves')}>
            <div className={c('row')}><div className={c('grow')}><p className={c('lbl')}>Contract Reserves</p><p className={c('big')}>{fmt(totals.left)} lbs left</p></div><span className={c('pillbtn')}>View / Edit</span></div>
            <p className={c('foot')}>of {fmt(totals.res)} reserved · {fmt(totals.used)} picked up · {plural(reserves.filter(r => r.res > 0).length, 'strain')}</p></button>}
          <button className={c('tile')} onClick={() => go('menu')}>
            <div className={c('row')}><div className={c('grow')}><p className={c('lbl')}>Open Menu</p><p className={c('big')}>{fmt(menuTotal)} lbs open</p></div><span className={c('pillbtn')}>{contract ? 'Add to Reserves' : 'View Menu'}</span></div>
            <p className={c('foot')}>{plural(menuN, 'strain')} · updates live as orders and reserves change</p></button>
          <div className={contract ? c('grid2') : ''}>
            <button className={c('tile small')} onClick={() => { setFilter('all'); go('orders') }}><p className={c('lbl')}>Orders &amp; Statement</p><p className={c('big')}>{open.length} in progress</p>
              {open.length > 0 && <p className={c('foot')} style={{ color: 'var(--blue)', marginTop: 4 }}>{[nSub ? `${nSub} submitted` : '', nFul ? `${nFul} in fulfillment` : ''].filter(Boolean).join(' · ')}</p>}</button>
            {contract && <button className={c('tile small tint')} onClick={() => go('contract')}><p className={c('lbl')}>My Contract · {mon}</p>
              <p className={c('big')}>{fmt(thisMonth)} lbs <span style={{ fontSize: 13, fontWeight: 500 }}>picked up</span></p>
              <p className={c('foot')} style={{ marginTop: 4 }}>{min == null ? 'No monthly minimum' : leftMin ? <><b style={{ color: 'var(--blue)' }}>{fmt(leftMin)} to go</b> · {fmt(min)} lb min</> : <b>✓ {fmt(min)} lb min met</b>}</p></button>}
          </div>
          {hs.length > 0 && <button className={c('tile')} style={{ background: 'var(--gold-bg)' }} onClick={() => go('holds')}>
            <div className={c('row')}><div className={c('grow')}><p className={c('lbl')} style={{ color: 'var(--gold)' }}>Sample Holds for You</p><p className={c('big')}>{plural(hs.length, 'strain')} · {fmt(hs.reduce((a, h) => a + holdLbs(h), 0))} lbs</p></div><span className={c('pillbtn')} style={{ background: '#fff', color: 'var(--gold)' }}>Review</span></div>
            <p className={c('foot')} style={{ color: 'var(--ink)', fontWeight: 500 }}>{shown}</p>
            <p className={c('foot')} style={{ color: 'var(--gold)', marginTop: 2 }}>{soon ? `Next hold ends in ${plural(daysUntil(soon.until), 'day')} (${soon.strain})` : 'Waiting on Lifted to confirm'}</p></button>}
        </main>
        <div className={c('dock')}><button className={c('btn full')} onClick={() => newOrder()}>Place an order</button></div>
      </div>
    )
  }

  function ContractScreen() {
    const mc = d?.mc
    if (!mc) return <div className={c('screen')}><header className={c('hdr')}>{back('home', 'Home')}<h1>My Contract</h1></header><p className={c('loading')}>Your contract details aren't available right now.</p></div>
    const min = mc.monthly_min_lbs != null ? Number(mc.monthly_min_lbs) : null
    const months = mc.months ?? [], last = months[months.length - 1]
    const isCur = !!last && last.month.slice(0, 7) === iso(new Date()).slice(0, 7)
    const done = isCur ? months.slice(0, -1) : months, now = isCur ? Number(last.lbs) : 0
    const mName = (m: string) => new Date(m.slice(0, 10) + 'T12:00').toLocaleDateString('en-US', { month: 'long' })
    let run0 = 0
    const rows = done.map(m => { const dd = Number(m.lbs) - (min ?? 0); run0 += dd; return { m: mName(m.month), lbs: Number(m.lbs), d: dd, run: run0, early: Number(m.early ?? 0) } })
    const cum = run0
    const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n))
    const col = (n: number) => n > 0 ? 'var(--teal-ink)' : n < 0 ? 'var(--red)' : 'var(--muted)'
    const reserved = reserves.filter(r => r.y === mc.year).reduce((a, r) => a + r.res, 0), contracted = Number(mc.contract_lbs ?? 0), gap = contracted - reserved
    const grid = { gridTemplateColumns: 'minmax(0,1fr) 72px 72px 80px' }
    const monthName = new Date().toLocaleDateString('en-US', { month: 'long' })
    return (
      <div className={c('screen')}>
        <header className={c('hdr')}>{back('home', 'Home')}<h1>My Contract</h1><p className={c('sub')}>Your {mc.year} crop contract terms and monthly pickups</p></header>
        <main className={c('main')}>
          <section className={c('card terms')}>
            <div><p className={c('meta')}>Price</p><b className={c('num')}>{mc.price_per_lb != null ? <>${Number(mc.price_per_lb).toFixed(2)}<small>/lb</small></> : '—'}</b></div>
            <div><p className={c('meta')}>Payment terms</p><b>{mc.payment_terms ?? d?.st?.customer.terms ?? '—'}</b></div>
            <div><p className={c('meta')}>Deposit balance</p><b className={c('num')}>{mc.deposit_usd != null ? money(Number(mc.deposit_usd)) : '—'}</b></div>
            <div><p className={c('meta')}>Monthly minimum</p><b className={c('num')}>{min != null ? `${fmt(min)} lbs` : '—'}</b></div>
          </section>
          {contracted > 0 && <section className={c('card')} style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className={c('row')}><div className={c('grow')}><p className={c('meta')} style={{ margin: 0 }}>Contracted</p><p className={c('num')} style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 700 }}>{fmt(contracted)} lbs</p></div>
              <div className={c('r')}><p className={c('meta')} style={{ margin: 0 }}>Reserved</p><p className={c('num')} style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 700 }}>{fmt(reserved)} lbs</p></div></div>
            {gap > 0 ? <div className={c('row')} style={{ background: 'var(--teal-bg)', borderRadius: 12, padding: '10px 12px', gap: 10 }}><p className={c('grow')} style={{ margin: 0, color: 'var(--teal-ink)', fontSize: 14 }}><b>{fmt(gap)} lbs</b> of your contract aren't reserved to a strain yet.</p>
              {contract && <button className={c('pillbtn')} style={{ border: 0, background: '#fff' }} onClick={() => go('menu')}>Add to Reserves</button>}</div>
              : gap < 0 ? <p className={c('meta')} style={{ margin: 0 }}>You've reserved {fmt(-gap)} lbs more than your contract.</p>
              : <p className={c('meta')} style={{ margin: 0, color: 'var(--teal-ink)' }}>Your full contract is reserved.</p>}
          </section>}
          <h2 className={c('h2')}>Monthly pickups</h2>
          <section className={c('card')} style={{ padding: 18, display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
            <div><p className={c('meta')} style={{ margin: 0 }}>Picked up in {monthName}</p><p className={c('num')} style={{ margin: '2px 0 0', fontSize: 28, fontWeight: 700 }}>{fmt(now)} lbs</p></div>
            {min != null && <div><p className={c('meta')} style={{ margin: 0, color: 'var(--blue)' }}>Left to meet minimum</p><p className={c('num')} style={{ margin: '2px 0 0', fontSize: 28, fontWeight: 700, color: 'var(--blue)' }}>{fmt(Math.max(min - now, 0))} lbs</p></div>}
          </section>
          {min != null && rows.length > 0 && <section className={c('card')} style={{ background: 'var(--ink)', color: '#fff', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className={c('grow')}><p style={{ margin: 0, fontSize: 13, color: 'var(--muted-dk)' }}>Cumulative vs. minimum</p><p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--muted-dk)' }}>Since October · completed months</p></div>
            <p className={c('num')} style={{ margin: 0, fontSize: 26, fontWeight: 700, color: cum >= 0 ? 'var(--mint)' : '#f9a8b8' }}>{sign(cum)} lbs <span style={{ fontSize: 14, fontWeight: 500 }}>{cum >= 0 ? 'over' : 'under'}</span></p>
          </section>}
          {min != null && (rows.length > 0 || isCur) && <>
            <h2 className={c('h2 small')}>By month</h2>
            <section className={c('card')}>
              <div className={c('tbl head')} style={grid}><span>Month</span><span>Picked up</span><span>vs. {fmt(min)}</span><span>Running</span></div>
              {rows.map(r => <div key={r.m} className={c('tbl')} style={grid}><span style={{ fontWeight: 500 }}>{r.m}{r.early > 0 && <small className={c('meta')} style={{ display: 'block', fontWeight: 400, fontSize: 12 }}>incl. {fmt(r.early)} lbs picked up before October</small>}</span>
                <span>{fmt(r.lbs)}</span><span style={{ color: col(r.d) }}>{sign(r.d)}</span><b style={{ color: col(r.run) }}>{sign(r.run)}</b></div>)}
              {isCur && <div className={c('tbl total')} style={{ ...grid, color: 'var(--muted)' }}><span>{monthName} <small>(so far)</small>{rows.length === 0 && Number(last.early) > 0 && <small className={c('meta')} style={{ display: 'block', fontSize: 12 }}>incl. {fmt(last.early)} lbs picked up before October</small>}</span><span>{fmt(now)}</span><span>{sign(now - min)}</span><span>{sign(cum + now - min)}</span></div>}
            </section></>}
        </main>
      </div>
    )
  }

  function ReservesScreen() {
    return (
      <div className={c('screen')}>
        <header className={c('hdr')}>{back('home', 'Home')}<h1>Contract Reserves</h1><p className={c('sub')}>{fmt(totals.left)} of {fmt(totals.res)} lbs left to pick up</p></header>
        <main className={c('main')}>
          <section className={c('card')}>
            <div className={c('tbl head')}><span>Strain</span><span>Reserved</span><span>Picked up</span><span>Left</span></div>
            {reserves.length === 0 && <p className={c('meta')} style={{ padding: 16 }}>No reserves yet. Add strains from the open menu.</p>}
            {reserves.map(r => <div key={r.k} style={{ borderBottom: '1px solid var(--line-2)' }}>
              <div className={c('tbl')} style={{ border: 0 }}><span style={{ fontWeight: 600 }}>{r.s} {yrTag(r.y)}</span><span>{r.res ? fmt(r.res) : '–'}</span><span style={{ color: 'var(--muted)' }}>{fmt(r.used)}</span><b>{fmt(r.left)}</b></div>
              {r.asked != null && <div style={{ padding: '0 16px 12px' }}><span className={c('chip c-wait')}>{r.res ? `You asked to change to ${fmt(r.asked)}` : `New: you asked for ${fmt(r.asked)}`} · waiting on Lifted</span></div>}
            </div>)}
            <div className={c('tbl total')}><b>Total lbs</b><b>{fmt(totals.res)}</b><span style={{ color: 'var(--muted)' }}>{fmt(totals.used)}</span><b style={{ color: 'var(--teal-ink)' }}>{fmt(totals.left)}</b></div>
          </section>
          <p className={c('meta')} style={{ margin: '0 4px' }}>Picked up includes orders that are placed but not shipped yet.</p>
        </main>
        <div className={c('dock')}><button className={c('btn full')} onClick={() => { setEditFrom('reserves'); go('edit') }}>Edit my reserves</button></div>
      </div>
    )
  }

  function EditScreen() {
    const back: [Screen, string] = editFrom === 'menu' ? ['menu', 'Open Menu'] : ['reserves', 'Contract Reserves']
    const cancel = () => { clearEdit(); go(back[0]) }
    const items: { s: string; y: number; el: React.ReactNode }[] = [
      ...reserves.map(r => {
        const v = ed[r.k] ?? 0, base = r.asked ?? r.res, changed = v !== base, e = resErr(r), onMenu = fmt(menuRow(r.k)?.open ?? 0)
        const newLeft = Math.max(v - r.used, 0)
        return { s: r.s, y: r.y, el: <div key={r.k} className={c(`box ${changed ? 'on' : ''}`)}><div className={c('row')} style={{ gap: 12 }}><div className={c('grow')}><p className={c('name')}>{r.s} {yrTag(r.y)}</p>
          <p className={c('meta')}>{changed ? <>{changedLine(r)}<br /><b style={{ color: 'var(--ink)' }}>{fmt(newLeft)} left</b> after this change</>
            : <><b style={{ color: 'var(--ink)' }}>{fmt(r.left)} left</b> · {fmt(r.used)} picked up{r.asked != null && <><br /><span style={{ color: 'var(--gold)' }}>Asked for {fmt(r.asked)} · waiting</span></>}</>}
            <br />{onMenu} on open menu</p></div>
          <Stepper val={v} on={changed} bad={!!e} label={r.s} onChange={n => setRes(r.k, n)} /></div>{e && <StepErr msg={e} />}</div> }
      }),
      ...editNew.map((n, i) => {
        const e = newErr(n)
        return { s: n.s, y: n.y, el: <div key={'new' + n.k} className={c('box on')}><div className={c('row')} style={{ gap: 12 }}><div className={c('grow')}><p className={c('name')}>{n.s} {yrTag(n.y)}</p>
          <p className={c('meta')} style={{ color: 'var(--teal-ink)', fontWeight: 500 }}>New · {fmt(menuRow(n.k)?.open ?? 0)} lbs on open menu</p></div>
          <Stepper val={n.lbs} on bad={!!e && n.lbs > 0} label={n.s} onChange={v => setEditNew(editNew.map((x, j) => j === i ? { ...x, lbs: v } : x))} /></div>
          {e && <StepErr msg={e} />}
          <button className={c('linkish')} style={{ minWidth: 0, textAlign: 'left', color: 'var(--red)' }} onClick={() => setEditNew(editNew.filter((_, j) => j !== i))}>Remove</button></div> }
      }),
    ].sort((a, b) => a.s.localeCompare(b.s) || b.y - a.y).filter(x => !editQ || x.s.toLowerCase().includes(editQ.toLowerCase()))
    return (
      <div className={c('screen')}>
        <header className={c('hdr')}><button className={c('back')} onClick={() => go(back[0])}>{I.back}{back[1]}</button><h1>Edit Reserves</h1>
          <p className={c('sub')}>Set the total lbs you want for each strain, in steps of 10. Tap a number to type it. Lifted reviews each change.</p>
          <label className={c('search')}>{I.search}<input type="search" placeholder="Search strains" value={editQ} onChange={e => setEditQ(e.target.value)} aria-label="Search your reserves" /></label></header>
        <main className={c('main')}>
          <div className={c('colhead')}><h2 className={c('h2 small')} style={{ margin: 0 }}>Your reserves</h2><span>Total reserve</span></div>
          {items.map(x => x.el)}
          {items.length === 0 && <p className={c('meta')} style={{ margin: '0 4px' }}>No reserves match "{editQ}".</p>}
          <button className={c('btn ghost')} style={{ height: 48, border: '1.5px dashed #9aa69e', background: 'transparent', color: 'var(--teal-dk)', fontSize: 15 }} onClick={() => go('menu')}>+ Add a strain from the open menu</button>
          <label className={c('field')} style={{ marginTop: 4 }}>Note to Lifted (optional)<input type="text" value={reqNote} onChange={e => setReqNote(e.target.value)} /></label>
        </main>
        <div className={c('dock white')}><button className={c('btn ghost')} style={{ flex: 1 }} onClick={cancel}>Cancel</button>
          <button className={c('btn')} style={{ flex: 2 }} disabled={busy || !changes.length || anyResErr} onClick={sendReq}>{anyResErr ? 'Fix the red lines' : busy ? 'Sending…' : changes.length ? `Send ${plural(changes.length, 'change')}` : 'No changes yet'}</button></div>
      </div>
    )
  }

  function SentScreen() {
    const r = lastReq
    return (
      <div className={c('screen')}>
        <header className={c('hdr done-hdr')}><span className={c('check')}>{I.check}</span><h1 style={{ marginTop: 6 }}>Request sent</h1>
          <p className={c('sub')} style={{ fontSize: 15 }}>{plural(r.length, 'reserve change')} sent to Lifted for review. We'll email you when Lifted approves them.</p></header>
        <main className={c('main')}>
          <section className={c('card')}>{r.map(ch => <div key={ch.s + ch.y} className={c('li')}><div className={c('grow')}><p className={c('name')}>{ch.s} {yrTag(ch.y)}</p>
            <p className={c('meta')} style={ch.isNew ? { color: 'var(--teal-ink)' } : undefined}>{ch.isNew ? 'New strain' : `${fmt(ch.from)} → ${fmt(ch.to)} lbs`}</p></div>
            <b className={c('num')}>{ch.isNew ? `${fmt(ch.to)} lbs` : `${ch.to > ch.from ? '+' : '−'}${fmt(Math.abs(ch.to - ch.from))} lbs`}</b></div>)}</section>
          <div className={c('note gold')}>Until Lifted approves, these show as <b>waiting</b> on your Contract Reserves, and the lbs stay open on the menu for everyone.</div>
        </main>
        <div className={c('dock stack')}><button className={c('btn')} onClick={() => go('reserves')}>View my reserves</button><button className={c('btn ghost')} onClick={() => go('home')}>Back to Home</button></div>
      </div>
    )
  }

  function MenuScreen() {
    const ql = q.toLowerCase()
    const shown = menuItems.filter(m => m.open > 0 || (contract && !!resRow(m.k)))
    const list = shown.filter(m => (!ql || m.s.toLowerCase().includes(ql)) && (menuYear === 'all' || m.y === menuYear)).sort((a, b) => a.s.localeCompare(b.s) || b.y - a.y)
    const total = menuItems.reduce((a, m) => a + m.open, 0)
    const years = [...new Set(shown.map(m => m.y))].sort((a, b) => b - a)
    const nNew = editNew.length, nChg = changes.filter(x => !x.isNew).length
    const parts = [nNew ? plural(nNew, 'new strain') : '', nChg ? plural(nChg, 'change') : ''].filter(Boolean).join(' · ')
    const toggleTray = (m: MenuItem) => {
      if (editNew.some(t => t.k === m.k)) setEditNew(editNew.filter(t => t.k !== m.k))
      else { setEditNew([...editNew, { k: m.k, s: m.s, y: m.y, lbs: 0 }]); setFocusK('tray' + m.k) }
    }
    return (
      <div className={c('screen')}>
        <header className={c('hdr')} style={{ paddingBottom: 16 }}>{back('home', 'Home')}
          <div><div className={c('row')} style={{ justifyContent: 'space-between', alignItems: 'baseline' }}><h1>Open Menu</h1><span className={c('sub')}>{fmt(total)} lbs available</span></div>
            {contract && <p className={c('sub mint')} style={{ marginTop: 4 }}>Pick a strain and choose how many lbs to add to your contract reserves. Lifted reviews every request.</p>}</div>
          <label className={c('search')}>{I.search}<input type="search" placeholder="Search strains" value={q} onChange={e => setQ(e.target.value)} aria-label="Search strains" /></label>
        </header>
        <main className={c('main')} style={{ paddingTop: 12 }}>
          {years.length > 1 && <div className={c('filters')} role="group" aria-label="Filter by harvest year">
            {(['all', ...years] as ('all' | number)[]).map(y => <button key={y} aria-pressed={menuYear === y} onClick={() => setMenuYear(y)}>{y === 'all' ? 'All' : String(y)}</button>)}</div>}
          <section className={c('card')}>
            <div className={c(`mg mg-head ${contract ? '' : 'nc'}`)}><span>Strain</span><span className={c('mg-a')}>Available<span className={c('meta')} style={{ display: 'block', fontSize: 11, margin: 0 }}>lbs</span></span>{contract && <span style={{ textAlign: 'right' }}>Your reserve</span>}</div>
            {list.length === 0 && <p className={c('meta')} style={{ padding: 14 }}>{menuItems.length ? 'Nothing matches.' : 'Nothing on the menu right now.'}</p>}
            {list.map(m => {
              const nameCell = <div style={{ minWidth: 0 }}><p className={c('name')}>{m.s}</p>{m.y < cy && <p className={c('meta')} style={{ margin: '1px 0 0' }}><span className={c('yr old')} style={{ fontSize: 12 }}>{m.y} crop</span></p>}</div>
              const cells = <>{nameCell}<b className={c('num mg-a')}>{fmt(m.open)}</b></>
              if (!contract) return <div key={m.k} className={c('mg nc')}>{cells}</div>
              const r = resRow(m.k), t = !r ? editNew.find(x => x.k === m.k) : undefined
              let right: React.ReactNode, pick: React.ReactNode = null, sel = false
              if (r) {
                const v = ed[r.k] ?? 0, base = r.asked ?? r.res, changed = v !== base, open = menuOpen.includes(r.k) || changed, e = resErr(r)
                sel = changed
                right = open
                  ? <button className={c('linkish')} onClick={() => { setRes(r.k, base); setMenuOpen(menuOpen.filter(x => x !== r.k)) }}><span>{fmt(r.res)} reserved</span>{changed ? 'Undo' : 'Close'}</button>
                  : <button className={c('linkish')} onClick={() => setMenuOpen([...menuOpen, r.k])}><span>{fmt(r.res)} reserved</span>{r.asked != null ? 'Waiting · Edit' : 'Change'}</button>
                if (open) pick = <><div className={c('row')} style={{ gap: 10, padding: '0 14px 12px', flexWrap: 'wrap' }}><span className={c('grow')} style={{ fontSize: 14, fontWeight: 600 }}>Your reserve total
                  <span className={c('meta')} style={{ display: 'block', fontWeight: 400 }}>{changed ? changedLine(r) : `${fmt(r.used)} already picked up`}</span></span>
                  <Stepper val={v} on={changed} bad={!!e} label={m.s} onChange={n => setRes(r.k, n)} /></div>{e && <div style={{ padding: '0 14px 12px' }}><StepErr msg={e} /></div>}</>
              } else if (t) {
                sel = true
                const e = newErr(t)
                right = <button className={c('linkish')} style={{ color: 'var(--red)' }} onClick={() => toggleTray(m)}>Remove</button>
                pick = <><div className={c('row')} style={{ gap: 10, padding: '0 14px 12px', flexWrap: 'wrap' }}><span className={c('grow')} style={{ fontSize: 14, fontWeight: 600 }}>How many lbs to reserve?</span>
                  <Stepper val={t.lbs} on bad={!!e && t.lbs > 0} label={m.s} autoFocus={focusK === 'tray' + m.k} onChange={n => setEditNew(editNew.map(x => x.k === m.k ? { ...x, lbs: n } : x))} /></div>
                  {e && t.lbs > 0 && <div style={{ padding: '0 14px 12px' }}><StepErr msg={e} /></div>}</>
              } else right = <button className={c('outline-btn')} onClick={() => toggleTray(m)} disabled={m.open <= 0}>+ Reserve</button>
              return <div key={m.k} className={sel ? c('sel') : ''} style={{ borderBottom: '1px solid var(--line-2)', background: sel ? 'var(--teal-tint)' : undefined }}>
                <div className={c('mg')}>{cells}<div style={{ textAlign: 'right' }}>{right}</div></div>{pick}</div>
            })}
          </section>
        </main>
        {contract ? ((nNew || nChg) ? <button className={c('tray')} disabled={anyResErr} onClick={() => { setEditFrom('menu'); go('edit') }}>
          <span className={c('grow')}><b style={{ fontSize: 16 }}>Reserve request</b><small>{parts || 'Set lbs'}</small></span><span className={c('go')}>{anyResErr ? 'Fix red lines' : 'Review'}</span></button> : null)
          : <div className={c('dock')}><button className={c('btn full')} onClick={() => newOrder()}>Place an order</button></div>}
      </div>
    )
  }

  function orderLineEl(l: OLine) {
    const picked = l.k in ord, qv = ord[l.k] ?? 0, sp = lineSplit(l, qv)
    const sub = l.resLeft ? <>{fmt(l.resLeft)} reserve + {fmt(l.open)} open</> : l.hold ? <span style={{ color: 'var(--gold)' }}>incl. {fmt(l.hold)} held for you</span> : null
    const unpick = () => { const o = { ...ord }; delete o[l.k]; setOrd(o); const s = { ...smp }; delete s[l.k]; setSmp(s); const h = { ...holdAsk }; delete h[l.k]; setHoldAsk(h) }
    const head = <div className={c('mg')}>
      <div style={{ minWidth: 0 }}><p className={c('name')}>{l.s}</p>{(l.y < cy || sub) && <p className={c('meta')} style={{ margin: '1px 0 0' }}>{l.y < cy && <span className={c('yr old')} style={{ fontSize: 12 }}>{l.y} crop</span>}{l.y < cy && sub ? ' · ' : ''}{sub}</p>}</div>
      <b className={c('num mg-a')}>{fmt(sp.max)}</b>
      <div style={{ textAlign: 'right' }}>{picked ? <button className={c('linkish')} style={{ color: 'var(--red)' }} onClick={unpick}>Remove</button>
        : <button className={c('outline-btn')} onClick={() => { setOrd({ ...ord, [l.k]: 10 }); setFocusK('ord' + l.k) }} aria-label={`Add ${l.s}`}>+ Add</button>}</div></div>
    if (!picked) return <div style={{ borderBottom: '1px solid var(--line-2)' }}>{head}</div>
    const e = lineError(l, qv), sampleOk = !l.resLeft, hq = holdAsk[l.k] ?? 0, he = smp[l.k] ? holdError(l, qv, hq) : ''
    return (
      <div style={{ borderBottom: '1px solid var(--line-2)', background: 'var(--teal-tint)' }}>
        {head}
        <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className={c('row')} style={{ gap: 10, flexWrap: 'wrap' }}><span className={c('grow')} style={{ fontSize: 14, fontWeight: 600 }}>How many lbs?</span>
            <Stepper val={qv} on bad={!!e} label={l.s} autoFocus={focusK === 'ord' + l.k} onChange={n => setOrd({ ...ord, [l.k]: n })} /></div>
          {e && <StepErr msg={e} />}
          <div className={c('chips')}>
            {qv > 0 && !not10(qv) && <>{sp.fromRes > 0 && <span className={c('chip c-res')}>{fmt(sp.fromRes)} from your reserve</span>}{sp.fromHold > 0 && <span className={c('chip c-wait')}>{fmt(sp.fromHold)} held for you</span>}{sp.fromOpen > 0 && <span className={c('chip c-open')}>{fmt(sp.fromOpen)} from open menu</span>}</>}
            {sampleOk && <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, marginLeft: 'auto' }}>
              <input type="checkbox" checked={!!smp[l.k]} onChange={ev => { setSmp({ ...smp, [l.k]: ev.target.checked }); if (!ev.target.checked) { const h = { ...holdAsk }; delete h[l.k]; setHoldAsk(h) } }} style={{ width: 18, height: 18, accentColor: 'var(--teal-dk)' }} /> Sample</label>}
          </div>
          {sampleOk && smp[l.k] && <><div className={c('row')} style={{ justifyContent: 'space-between', fontSize: 13, color: 'var(--muted)', background: '#fff', borderRadius: 10, padding: '8px 10px', flexWrap: 'wrap' }}>
            <span>If you like it, hold for me <span style={{ fontSize: 12 }}>({d?.holdDays ?? 10} days after it ships · up to {fmt(Math.max(sp.max - qv, 0))} lbs)</span></span>
            <Stepper val={hq} bad={!!he} label={`${l.s} hold`} onChange={n => setHoldAsk({ ...holdAsk, [l.k]: n })} /></div>{he && <StepErr msg={he} />}</>}
        </div>
      </div>
    )
  }

  function calendar() {
    if (!cal) return null
    const t0 = today0(), { y, m } = cal, first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate(), lead = first.getDay()
    const canPrev = y > t0.getFullYear() || m > t0.getMonth()
    const nav = (dd: number) => { let mm = m + dd, yy = y; if (mm < 0) { mm = 11; yy-- } if (mm > 11) { mm = 0; yy++ } setCal({ y: yy, m: mm }) }
    return <>
      <div className={c('scrim')} onClick={() => setCal(null)} />
      <div className={c('sheet')} role="dialog" aria-modal="true" aria-labelledby="cp-cal-t">
        <div className={c('row')} style={{ justifyContent: 'space-between' }}><h2 id="cp-cal-t" style={{ margin: 0, fontSize: 20 }}>Wanted by</h2>
          <button className={c('iconbtn')} style={{ color: 'var(--ink)', borderColor: 'var(--line)' }} onClick={() => setCal(null)} aria-label="Close">{I.close}</button></div>
        <div className={c('row')} style={{ justifyContent: 'space-between' }}><button className={c('calnav')} onClick={() => nav(-1)} disabled={!canPrev} aria-label="Previous month">{I.back}</button>
          <b style={{ fontSize: 16 }}>{first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</b>
          <button className={c('calnav')} onClick={() => nav(1)} aria-label="Next month" style={{ transform: 'scaleX(-1)' }}>{I.back}</button></div>
        <div className={c('cal')}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x, i) => <span key={i} className={c('dow')}>{x}</span>)}
          {Array.from({ length: lead }, (_, i) => <span key={'l' + i} />)}
          {Array.from({ length: days }, (_, i) => {
            const dt = new Date(y, m, i + 1), v = iso(dt), past = dt < t0, sel = wanted === v, isToday = v === iso(t0)
            return <button key={v} type="button" className={c(`day ${sel ? 'sel' : ''} ${isToday ? 'today' : ''}`)} disabled={past} aria-pressed={sel} onClick={() => setWanted(v)}
              aria-label={dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}>{i + 1}</button>
          })}</div>
        <div className={c('row')}><button className={c('btn ghost')} style={{ flex: 1 }} onClick={() => setWanted('')}>Clear</button>
          <button className={c('btn')} style={{ flex: 1.4 }} onClick={() => setCal(null)}>{wanted ? `Done · ${niceDate(wanted)}` : 'Done'}</button></div>
      </div></>
  }

  function OrderScreen() {
    const p = priceOf(cy)
    const oq = orderQ.toLowerCase(), match = (l: OLine) => !oq || l.s.toLowerCase().includes(oq) || l.k in ord
    const section = (all: OLine[]) => { const arr = all.filter(match); return arr.length ? <section className={c('card')}>
      <div className={c('mg mg-head')}><span>Strain</span><span className={c('mg-a')}>Available<span className={c('meta')} style={{ display: 'block', fontSize: 11, margin: 0 }}>lbs</span></span><span /></div>
      {arr.map(l => <Fragment key={l.k}>{orderLineEl(l)}</Fragment>)}</section> : oq && all.length ? <p className={c('meta')} style={{ margin: '0 4px' }}>No strains match "{orderQ}".</p> : null }
    return (
      <div className={c('screen')}>
        <header className={c('hdr')}><div className={c('row')} style={{ justifyContent: 'space-between' }}><h1>{editing ? `Modify ${soLabel(editing)}` : 'New order'}</h1>
          <button className={c('iconbtn')} onClick={closeOrder} aria-label="Close">{I.close}</button></div>
          <p className={c('sub')}>{contract ? 'Order from your contract reserves, or straight off the open menu.' : 'Order off the open menu.'} Fresh frozen by the lb, in steps of 10. Tap a number to type it.{p != null ? ` Your price: $${p.toFixed(2)}/lb.` : ''}</p>
          <label className={c('search')}>{I.search}<input type="search" placeholder="Search strains" value={orderQ} onChange={e => setOrderQ(e.target.value)} aria-label="Search strains to order" /></label></header>
        <main className={c('main')}>
          {contract && <><h2 className={c('h2')} style={{ marginTop: 0 }}>From your reserves</h2>{section(orderable.resd) ?? <p className={c('meta')} style={{ margin: '0 4px' }}>No reserve left to order.</p>}
            <h2 className={c('h2')} style={{ marginTop: 10 }}>From the open menu</h2></>}
          {section(orderable.others) ?? <p className={c('meta')} style={{ margin: '0 4px' }}>Nothing open on the menu right now.</p>}
          <section className={c('card')} style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className={c('grid2')}><label className={c('field')}>PO # <span className={c('meta')} style={{ marginTop: -6 }}>optional</span><input type="text" value={po} onChange={e => setPo(e.target.value)} /></label>
              <div className={c('field')}><span id="cp-wanted-l">Wanted by</span><span className={c('meta')} style={{ marginTop: -6 }}>optional</span>
                <button type="button" className={c('datebtn')} aria-labelledby="cp-wanted-l" aria-haspopup="dialog" onClick={() => { const b = wanted ? new Date(wanted + 'T12:00') : today0(); setCal({ y: b.getFullYear(), m: b.getMonth() }) }}>
                  {wanted ? niceDate(wanted) : <span style={{ color: '#8a948d' }}>Choose a date</span>}{I.cal}</button></div></div>
            <label className={c('field')}>Note <span className={c('meta')} style={{ marginTop: -6 }}>optional</span><input type="text" placeholder="Pickup or delivery details" value={note} onChange={e => setNote(e.target.value)} /></label>
          </section>
        </main>
        <div className={c('dock white')}><div className={c('grow')}><p className={c('num')} style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{fmt(oTot.lbs)} lbs</p>
          <p className={c('meta')} style={{ margin: 0 }}>{contract ? `${fmt(oTot.res)} reserve · ${fmt(oTot.open)} open` : ''}{oTot.amount != null ? `${contract ? ' · ' : ''}${money(oTot.amount)}` : ''}</p></div>
          <button className={c('btn')} disabled={!oTot.lbs || oTot.bad} onClick={() => go('review')}>{oTot.bad ? 'Fix the red lines' : editing ? 'Review changes' : 'Review order'}</button></div>
        {calendar()}
      </div>
    )
  }

  const splitText = (x: Detail) => [x.fromRes ? `${fmt(x.fromRes)} from reserve` : '', x.fromHold ? `${fmt(x.fromHold)} held for you` : '', x.fromOpen ? `${fmt(x.fromOpen)} from open menu` : ''].filter(Boolean).join(' · ')
  function ReviewScreen() {
    if (!detail.length) return <div className={c('screen')}><header className={c('hdr')}>{back('order', 'Keep editing')}<h1>Review your order</h1></header><p className={c('loading')}>Nothing on the order yet.</p></div>
    return (
      <div className={c('screen')}>
        <header className={c('hdr')}>{back('order', 'Keep editing')}<h1>{editing ? `Review changes to ${soLabel(editing)}` : 'Review your order'}</h1>
          <p className={c('sub')}>{editing ? 'Saving sends the updated order back to Lifted to confirm.' : 'Nothing is sent until you tap Place order.'}</p></header>
        <main className={c('main')}>
          <section className={c('card')}>
            {detail.map(x => <div key={x.k} className={c('li')} style={{ alignItems: 'flex-start' }}><div className={c('grow')}><p className={c('name')}>{x.s} {yrTag(x.y)} {x.sample && <span className={c('chip c-wait')}>Sample</span>}</p>
              <p className={c('meta')}>{splitText(x)}{x.hold ? ` · hold ${fmt(x.hold)} lbs if you like it` : ''}</p>
              <p className={c('meta num')}>{fmt(x.q)} lbs{x.price != null ? ` × $${x.price.toFixed(2)}/lb` : ''}</p></div>
              <b className={c('num')}>{x.price != null ? money(x.q * x.price) : `${fmt(x.q)} lbs`}</b></div>)}
            <div className={c('li')} style={{ background: '#f7f9f6', alignItems: 'flex-start' }}><div className={c('grow')}><b>Total</b>
              <p className={c('meta')}>{fmt(oTot.lbs)} lbs{contract ? ` · ${fmt(oTot.res)} from reserves · ${fmt(oTot.lbs - oTot.res)} from open menu` : ''}</p></div>
              <b className={c('num')} style={{ fontSize: 18 }}>{oTot.amount != null ? money(oTot.amount) : `${fmt(oTot.lbs)} lbs`}</b></div>
          </section>
          {(po || wanted || note) && <section className={c('card')} style={{ padding: '12px 16px', fontSize: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {po && <span><span className={c('meta')} style={{ display: 'inline' }}>PO</span> {po}</span>}
            {wanted && <span><span className={c('meta')} style={{ display: 'inline' }}>Wanted by</span> {niceDate(wanted)}</span>}
            {note && <span><span className={c('meta')} style={{ display: 'inline' }}>Note</span> {note}</span>}</section>}
          {detail.filter(x => x.hold).map(x => <div key={'h' + x.k} className={c('note gold')}><b>Sample hold:</b> we'll hold {fmt(x.hold)} lbs of {x.s} for you for <b>{d?.holdDays ?? 10} days after this order ships</b>, so you can try the sample first. The hold starts once Lifted confirms the order. {contract ? 'Reserve' : 'Order'} them any time before it ends.</div>)}
          <p className={c('meta')} style={{ margin: '0 4px' }}>Lifted confirms every order before it ships.</p>
        </main>
        <div className={c('dock white')}><button className={c('btn ghost')} style={{ flex: 1 }} onClick={() => go('order')}>Keep editing</button>
          <button className={c('btn')} style={{ flex: 1.4 }} disabled={busy} onClick={placeOrder}>{busy ? 'Sending…' : editing ? 'Save changes' : 'Place order'}</button></div>
      </div>
    )
  }

  function OrderedScreen() {
    const o = lastOrder
    if (!o) return <div className={c('screen')}><p className={c('loading')}>Done.</p></div>
    return (
      <div className={c('screen')}>
        <header className={c('hdr done-hdr')}><span className={c('check')}>{I.check}</span><h1 style={{ marginTop: 6 }}>{o.modified ? 'Order updated' : 'Order sent'}</h1>
          <p className={c('sub')} style={{ fontSize: 15 }}>{o.label} · {fmt(o.lbs)} lbs. {o.modified ? 'Lifted will confirm the changes.' : "Lifted will confirm it and let you know when it's ready."}</p></header>
        <main className={c('main')}>
          <section className={c('card')}>{o.detail.map(x => <div key={x.k} className={c('li')}><div className={c('grow')}><p className={c('name')}>{x.s} {yrTag(x.y)} {x.sample && <span className={c('chip c-wait')}>Sample</span>}</p>
            <p className={c('meta')}>{[x.fromRes ? `${fmt(x.fromRes)} reserve` : '', x.fromHold ? `${fmt(x.fromHold)} held` : '', x.fromOpen ? `${fmt(x.fromOpen)} open menu` : ''].filter(Boolean).join(' · ')}{x.hold ? ` · holding ${fmt(x.hold)} lbs for you after it ships` : ''}</p></div>
            <b className={c('num')}>{fmt(x.q)} lbs</b></div>)}
            <div className={c('li')} style={{ background: '#f7f9f6' }}><b className={c('grow')}>Total</b><b className={c('num')}>{fmt(o.lbs)} lbs{o.amount != null ? ` · ${money(o.amount)}` : ''}</b></div></section>
          {contract && o.res > 0 && <div className={c('note teal')}>After this order your <b>contract reserves</b> drop to <b>{fmt(totals.left)} lbs left</b>.{o.lbs - o.res > 0 ? ` The ${fmt(o.lbs - o.res)} open-menu lbs don't count against your reserve.` : ''}</div>}
        </main>
        <div className={c('dock stack')}><button className={c('btn')} onClick={() => { setFilter('all'); go('orders') }}>View my orders</button><button className={c('btn ghost')} onClick={() => go('home')}>Back to Home</button></div>
      </div>
    )
  }

  function OrdersScreen() {
    const f = filter
    const list = orows.filter(o => f === 'all' || (f === 'submitted' && o.status === 'submitted') || (f === 'fulfillment' && o.status === 'fulfillment') || (f === 'shipped' && o.status === 'shipped') || (f === 'unpaid' && o.paid === false) || (f === 'paid' && o.paid === true))
    const fb = (id: string, label: string) => <button key={id} aria-pressed={f === id} onClick={() => setFilter(id)}>{label}</button>
    const cx = confirmCancel
    return (
      <div className={c('screen')}>
        <header className={c('hdr')}>{back('home', 'Home')}<h1>Orders &amp; Statement</h1></header>
        <main className={c('main')}>
          {d?.st && <button className={c('tile row')} style={{ gap: 12 }} disabled={stBusy} onClick={async () => { setStBusy(true); try { await downloadStatement(d.st!, false) } catch (e) { toast(String((e as Error).message ?? e)) } finally { setStBusy(false) } }}>
            <span style={{ color: 'var(--teal-dk)' }}>{I.doc}</span><div className={c('grow')}><p className={c('name')} style={{ fontSize: 16 }}>Current statement</p>
              <p className={c('meta')}>{money2(d.st.balance.amount)} balance · {plural(openInvoices.length, 'open invoice')}</p></div>
            <span className={c('pillbtn')} style={{ background: 'none', padding: 0 }}>{stBusy ? 'Making…' : 'PDF'}</span></button>}
          <div className={c('filters')} role="group" aria-label="Filter orders">{fb('all', 'All')}{fb('submitted', 'Submitted')}{fb('fulfillment', 'In fulfillment')}{fb('shipped', 'Shipped')}{fb('unpaid', 'Unpaid')}{fb('paid', 'Paid')}</div>
          <section className={c('card')}>{list.length ? list.map(o => {
            const lbs = o.lines.reduce((a, l) => a + (l.lbs ?? 0), 0), isOpen = openRow === o.key
            const tags = o.status === 'submitted' ? <span className={c('chip c-sub')}>Submitted</span> : o.status === 'fulfillment' ? <span className={c('chip c-ful')}>In fulfillment</span>
              : <><span className={c('chip c-ship')}>Shipped</span>{o.paid != null && <> <span className={c(`chip ${o.paid ? 'c-paid' : 'c-unpaid'}`)}>{o.paid ? 'Paid' : 'Unpaid'}</span></>}</>
            const sub = o.status !== 'shipped'
              ? <>Placed {shortDate(o.date)}{o.wanted ? <> · <b style={{ color: 'var(--ink)', fontWeight: 600 }}>Wanted by {niceDate(o.wanted)}</b></> : ' · no date requested'}</>
              : <>Shipped {shortDate(o.date)}{o.paid === false && o.due ? ` · due ${shortDate(o.due)}` : ''}</>
            return <div key={o.key} style={{ borderBottom: '1px solid var(--line-2)', background: isOpen ? '#fbfcfb' : undefined }}>
              <button className={c('li btnrow')} onClick={() => setOpenRow(isOpen ? null : o.key)} aria-expanded={isOpen}>
                <div className={c('grow')}><p className={c('name')}>{o.label} {tags}</p><p className={c('meta')}>{sub}</p>
                  {o.holdLbs > 0 && o.status !== 'shipped' && <p className={c('meta')} style={{ color: 'var(--gold)', fontWeight: 600 }}>Sample · {fmt(o.holdLbs)} lbs to hold</p>}</div>
                <div className={c('r')}><b className={c('num')} style={o.paid ? { color: 'var(--muted)' } : undefined}>{o.amount != null ? money(o.amount) : ''}</b>{lbs > 0 && <p className={c('meta')}>{fmt(lbs)} lbs</p>}</div>{isOpen ? I.up : I.down}</button>
              {isOpen && <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, color: 'var(--muted)' }}>
                {o.lines.map((l, i) => <div key={i} className={c('row')}><span className={c('grow')}>{l.s} {l.y != null && yrTag(l.y)}</span>
                  {l.lbs != null ? <><span className={c('num')} style={{ width: 64, textAlign: 'right' }}>{fmt(l.lbs)} lbs</span>
                    <span className={c('num')} style={{ width: 72, textAlign: 'right' }}>{l.price != null ? priceFmt(l.price) : ''}</span></>
                    : <span className={c('num')} style={{ width: 136, textAlign: 'right' }}>{l.amount != null ? (l.amount < 0 ? '−' : '') + money2(Math.abs(l.amount)) : ''}</span>}</div>)}
                {o.lines.length === 0 && o.status === 'shipped' && <p className={c('meta')}>Open the invoice for the details.</p>}
                {o.status === 'shipped' && o.paid === false && o.inv && Number(o.inv.balance) < Number(o.inv.total) && <p className={c('meta')}>{money(Number(o.inv.total) - Number(o.inv.balance))} of {money(Number(o.inv.total))} paid · {money(Number(o.inv.balance))} open</p>}
                {(o.po || (o.status === 'shipped' && o.so && o.so !== o.label)) && <p className={c('meta')}>{[o.status === 'shipped' && o.so && o.so !== o.label ? `Order ${o.so}` : '', o.po ? `PO ${o.po}` : ''].filter(Boolean).join(' · ')}</p>}
                {o.status === 'submitted' && o.order ? <div className={c('row')} style={{ gap: 8, flexWrap: 'wrap' }}>
                  <button className={c('btn ghost')} style={{ height: 44, fontSize: 15, color: 'var(--teal-dk)', borderColor: 'var(--teal-dk)', flex: 1 }} onClick={() => modify(o.order!)}>Modify order</button>
                  <button className={c('btn ghost')} style={{ height: 44, fontSize: 15, color: 'var(--red)', flex: 1 }} onClick={() => setConfirmCancel(o)}>Cancel order</button></div>
                  : o.status === 'fulfillment' ? <div className={c('note')} style={{ background: 'var(--ful-bg)', color: 'var(--ful)', fontSize: 13, padding: '10px 12px' }}>Lifted is packing this order, so it can't be changed or cancelled here. Contact your Lifted rep to make changes.</div>
                  : o.inv ? <button className={c('btn ghost')} style={{ height: 44, fontSize: 15, color: 'var(--teal-dk)', borderColor: 'var(--teal-dk)', gap: 8 }} onClick={() => viewInvoice(o)}>{I.doc}View invoice (PDF)</button> : null}
              </div>}</div>
          }) : <p className={c('meta')} style={{ padding: 16 }}>Nothing here.</p>}</section>
        </main>
        {cx && <><div className={c('scrim')} onClick={() => setConfirmCancel(null)} />
          <div className={c('sheet')} role="alertdialog" aria-modal="true" aria-labelledby="cp-cx-t">
            <h2 id="cp-cx-t" style={{ margin: 0, fontSize: 22 }}>Cancel {cx.label}?</h2>
            <p className={c('meta')} style={{ fontSize: 15, margin: 0 }}>{fmt(cx.lines.reduce((a, l) => a + (l.lbs ?? 0), 0))} lbs{cx.amount != null ? ` · ${money(cx.amount)}` : ''}, placed {shortDate(cx.date)}{cx.wanted ? `, wanted by ${niceDate(cx.wanted)}` : ''}. Any reserve lbs on this order go back to your reserve. This can't be undone.</p>
            <div className={c('card')} style={{ background: '#f7f9f6' }}>{cx.lines.map((l, i) => <div key={i} className={c('li')}><span className={c('grow')}>{l.s} {l.y != null && yrTag(l.y)}</span><b className={c('num')}>{fmt(l.lbs)} lbs</b></div>)}</div>
            <button className={c('btn full')} style={{ background: 'var(--red)' }} disabled={busy} onClick={async () => {
              const ok = await run(() => backend.cancelMyOrder(cx.order!.id).then(() => true)); setConfirmCancel(null)
              if (ok) { toast(`${cx.label} cancelled`); reload() } }}>Yes, cancel order</button>
            <button className={c('btn ghost full')} onClick={() => setConfirmCancel(null)}>Keep order</button>
          </div></>}
      </div>
    )
  }

  function HoldsScreen() {
    const rank = (h: SampleHold) => h.state === 'active' ? (holdReq(h) ? 1 : 0) : 2
    const hs = liveHolds.slice().sort((a, b) => rank(a) - rank(b) || daysUntil(a.until) - daysUntil(b.until))
    const act = hs.filter(h => h.state === 'active' && !holdReq(h))
    const picked = act.filter(h => holdSel.includes(h.line_id)), lbs = picked.reduce((a, h) => a + (holdQty[h.line_id] ?? f10(holdLbs(h))), 0), bad = picked.some(h => !!holdErr(h))
    const pick = (h: SampleHold) => {
      if (holdSel.includes(h.line_id)) setHoldSel(holdSel.filter(x => x !== h.line_id))
      else { setHoldSel([...holdSel, h.line_id]); setHoldQty(q0 => ({ ...q0, [h.line_id]: q0[h.line_id] ?? f10(holdLbs(h)) })) }
    }
    const card = (h: SampleHold) => {
      const k = kOf(h.strain, h.crop_year), sample = sampleOf(h), so = h.so_number ?? `order #${h.order_id}`, rq = holdReq(h)
      if (h.state !== 'active') return <div key={h.line_id} className={c('box')}><div className={c('row')}><div className={c('grow')}><p className={c('name')}>{h.strain} {yrTag(h.crop_year)}</p>
        <p className={c('meta')}>{sample ? `${fmt(sample)} lb sample on ${so}` : `Sample on ${so}`}</p></div><span className={c('chip c-sub')}>Waiting</span></div>
        <p className={c('meta')} style={{ margin: 0 }}>We'll hold <b style={{ color: 'var(--ink)' }}>{fmt(holdLbs(h))} lbs</b> for {d?.holdDays ?? 10} days after this order ships{h.state === 'submitted' ? ', once Lifted confirms it' : ''}.</p>
        <div className={c('row')}><button className={c('btn ghost')} style={{ flex: 1, height: 44, fontSize: 15, color: 'var(--red)' }} onClick={() => setReleasing(h)}>Release</button></div></div>
      if (rq) return <div key={h.line_id} className={c('box')}><div className={c('row')}><div className={c('grow')}><p className={c('name')}>{h.strain} {yrTag(h.crop_year)}</p>
        <p className={c('meta')}>{fmt(holdLbs(h))} lbs held · until {shortDate(h.until)}</p></div><span className={c('chip c-wait')}>Reserve requested</span></div>
        <p className={c('meta')} style={{ margin: 0 }}>You asked to reserve <b style={{ color: 'var(--ink)' }}>{fmt(rq.requested_lbs)} lbs</b> in total. We keep holding these lbs while Lifted reviews it.</p></div>
      const on = holdSel.includes(h.line_id), v = holdQty[h.line_id] ?? f10(holdLbs(h)), open = menuRow(k)?.open ?? 0, max = f10(holdLbs(h)) + open, e = on ? holdErr(h) : '', dl = daysUntil(h.until)
      return <div key={h.line_id} className={c(`box ${on ? 'on' : ''}`)}>
        <div className={c('row')} style={{ alignItems: 'flex-start' }}>
          {contract && <label className={c('hchk')}><input type="checkbox" checked={on} onChange={() => pick(h)} aria-label={`Add ${h.strain} to reserves`} /></label>}
          <div className={c('grow')}><p className={c('name')} style={{ fontSize: 16 }}>{h.strain} {yrTag(h.crop_year)}</p><p className={c('meta')}>{sample ? `From your ${fmt(sample)} lb sample on ${so}` : `From your sample on ${so}`}</p></div>
          <div className={c('r')}><b className={c('num')} style={{ fontSize: 18 }}>{fmt(holdLbs(h))} lbs</b><p className={c('meta')} style={{ color: dl <= 3 ? 'var(--red)' : 'var(--gold)', fontWeight: 600 }}>{plural(dl, 'day')} left</p></div></div>
        <p className={c('meta')} style={{ margin: 0 }}>Held until <b style={{ color: 'var(--ink)' }}>{shortDate(h.until)}</b>. After that the lbs go back on the menu.</p>
        {on && <div style={{ background: '#f7f9f6', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className={c('row')} style={{ flexWrap: 'wrap' }}><span className={c('grow')} style={{ fontSize: 14, fontWeight: 600 }}>Lbs to reserve<span className={c('meta')} style={{ display: 'block', fontWeight: 400 }}>Up to {fmt(max)}: {fmt(holdLbs(h))} held + {fmt(open)} available</span></span>
            <Stepper val={v} on bad={!!e} label={h.strain} onChange={n => setHoldQty({ ...holdQty, [h.line_id]: n })} /></div>
          {e ? <StepErr msg={e} /> : v !== f10(holdLbs(h)) ? <p className={c('meta')} style={{ margin: 0, color: 'var(--teal-ink)', fontWeight: 500 }}>{v > holdLbs(h) ? `${fmt(v - holdLbs(h))} lbs more than your hold` : `${fmt(holdLbs(h) - v)} lbs go back on the menu`}</p> : null}</div>}
        <div className={c('row')} style={{ gap: 8 }}>
          {contract ? <button className={c(`btn ${on ? 'ghost' : ''}`)} style={{ flex: 1.4, height: 44, fontSize: 15 }} onClick={() => pick(h)}>{on ? '✓ Added · Undo' : 'Add to Reserves'}</button>
            : <button className={c('btn')} style={{ flex: 1.4, height: 44, fontSize: 15 }} onClick={() => newOrder({ [k]: f10(holdLbs(h)) })}>Order it</button>}
          <button className={c('btn ghost')} style={{ flex: 1, height: 44, fontSize: 15, color: 'var(--red)' }} onClick={() => setReleasing(h)}>Release</button></div>
      </div>
    }
    const rel = releasing
    return (
      <div className={c('screen')}>
        <header className={c('hdr')}>{back('home', 'Home')}<h1>Sample Holds for You</h1>
          <p className={c('sub')}>After you try a sample, we hold the lbs you asked for. {contract ? 'Pick the ones to add to your reserves, or release them.' : 'Order them, or release them.'}</p></header>
        <main className={c('main')}>
          {contract && act.length > 1 && <div className={c('row')} style={{ justifyContent: 'space-between', margin: '0 4px' }}><span className={c('meta')} style={{ margin: 0 }}>{act.length} active holds</span>
            <button className={c('linkish')} style={{ minWidth: 0 }} onClick={() => { if (picked.length === act.length) setHoldSel([]); else { setHoldSel(act.map(h => h.line_id)); setHoldQty(q0 => { const n = { ...q0 }; for (const h of act) n[h.line_id] = n[h.line_id] ?? f10(holdLbs(h)); return n }) } }}>{picked.length === act.length ? 'Clear selection' : 'Select all'}</button></div>}
          {hs.length ? hs.map(card) : <div className={c('card')} style={{ padding: 18 }}><p className={c('name')}>Nothing on hold</p><p className={c('meta')}>When you order a sample and ask us to hold more, it shows up here.</p></div>}
        </main>
        {picked.length > 0 && <div className={c('dock white')}><div className={c('grow')}><p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{plural(picked.length, 'strain')} · {fmt(lbs)} lbs</p><p className={c('meta')} style={{ margin: 0 }}>One reserve request for Lifted to review</p></div>
          <button className={c('btn')} disabled={bad || busy} onClick={holdSendAll}>{bad ? 'Fix red lines' : busy ? 'Sending…' : 'Send request'}</button></div>}
        {rel && <><div className={c('scrim')} onClick={() => setReleasing(null)} /><div className={c('sheet')} role="alertdialog" aria-modal="true" aria-labelledby="cp-rl-t">
          <h2 id="cp-rl-t" style={{ margin: 0, fontSize: 22 }}>Release {fmt(holdLbs(rel))} lbs of {rel.strain}?</h2>
          <p className={c('meta')} style={{ fontSize: 15, margin: 0 }}>We'll stop holding these lbs and put them back on the menu for everyone. This can't be undone.</p>
          <button className={c('btn full')} style={{ background: 'var(--red)' }} disabled={busy} onClick={() => doRelease(rel)}>Yes, release</button>
          <button className={c('btn ghost full')} onClick={() => setReleasing(null)}>Keep holding</button></div></>}
      </div>
    )
  }

  function account() {
    if (!acct) return null
    return <><div className={c('scrim')} onClick={() => setAcct(false)} />
      <div className={c('sheet')} role="dialog" aria-modal="true" aria-labelledby="cp-acct-t">
        <div className={c('row')} style={{ justifyContent: 'space-between' }}><h2 id="cp-acct-t" style={{ margin: 0, fontSize: 20 }}>Account</h2>
          <button className={c('iconbtn')} style={{ color: 'var(--ink)', borderColor: 'var(--line)' }} onClick={() => setAcct(false)} aria-label="Close">{I.close}</button></div>
        <p className={c('meta')} style={{ margin: 0, fontSize: 15 }}>{me.customer_name}<br />Signed in as {me.display_name ? `${me.display_name} (${me.email})` : me.email}</p>
        {me.viewing_as ? <p className={c('meta')}>You're viewing the portal as this customer.</p> : <>
          <form className={c('pw')} onSubmit={async e => { e.preventDefault(); const ok = await run(() => backend.changePassword(pw).then(() => true)); if (ok) { setPw(''); setPw2(''); setAcct(false); toast('Password changed') } }}>
            <b>Change password</b>
            <input type="password" autoComplete="new-password" placeholder="New password (8+ characters)" value={pw} onChange={e => setPw(e.target.value)} />
            <input type="password" autoComplete="new-password" placeholder="New password again" value={pw2} onChange={e => setPw2(e.target.value)} />
            {pw2.length > 0 && pw !== pw2 && <p className={c('err')} style={{ margin: 0 }}>Passwords don't match</p>}
            <button className={c('btn')} disabled={busy || pw.length < 8 || pw !== pw2}>Change password</button>
          </form>
          <button className={c('btn ghost full')} onClick={signOut}>Sign out</button></>}
      </div></>
  }

  // the order form screens need a loaded menu; send people home if a reload drops them somewhere odd
  useEffect(() => { if (d && !contract && (screen === 'reserves' || screen === 'edit' || screen === 'sent' || screen === 'contract')) setScreen('home') }, [d, contract, screen])
  useEffect(() => { if (focusK) { const t = setTimeout(() => setFocusK(null), 500); return () => clearTimeout(t) } }, [focusK])

  const SCREENS: Record<Screen, () => React.ReactElement> = {
    home: Home, contract: ContractScreen, reserves: ReservesScreen, edit: EditScreen, sent: SentScreen, menu: MenuScreen,
    order: OrderScreen, review: ReviewScreen, ordered: OrderedScreen, orders: OrdersScreen, holds: HoldsScreen,
  }
  return (
    <div className="cp">
      <div className={c('col')}>
        {!d ? <div className={c('screen')}><header className={c('hdr home-hdr')}><div className={c('top')}><img className={c('logo')} src="/logo-dark.svg" alt="Lifted" /></div>
          <p className={c('sub')} style={{ marginTop: 22, fontSize: 15 }}>{me.customer_name}</p></header>
          <p className={c('loading')}>{loadErr ? <>Couldn't load your account: {loadErr} <button className={c('linkish')} onClick={reload}>Try again</button></> : 'Loading…'}</p></div>
          : SCREENS[screen]()}
      </div>
      {account()}
      {toastMsg && <div className={c('toast')} role="status" aria-live="polite">{toastMsg}</div>}
    </div>
  )
}
