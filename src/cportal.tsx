// Customer portal (redesign, 150): mobile-first home with tiles, Contract Reserves, Open Menu, Place an order,
// Orders & Statement, My Contract and Sample Holds for You. Layout and behaviour follow the approved prototype
// (see the project doc customer-portal-redesign-spec.md). Styles live in cportal.css, scoped under .cp.
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
const actDay = (at: string) => new Date(at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const actWhen = (at: string) => `${actDay(at)} · ${new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
/** typed lbs snap to the nearest 10 when the box is left (34 → 30, 35 → 40) */
const round10 = (v: number) => Math.sign(v) * Math.round(Math.abs(v) / 10) * 10
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
  chat: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.2A8 8 0 1 1 21 12Z" /><path d="M9 10.5h6M9 13.5h4" /></svg>,
  clock: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ verticalAlign: '-3px' }}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  user: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6" /></svg>,
  plusbox: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ verticalAlign: '-2px' }}><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8v8M8 12h8" /></svg>,
  share: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Share" role="img" style={{ verticalAlign: '-2px' }}><path d="M12 3v12M8 7l4-4 4 4" /><path d="M6 11v9h12v-9" /></svg>,
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
        onBlur={() => { if (not10(val)) onChange(round10(val)) }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
      <button type="button" onClick={() => onChange(snap(val, 10))} aria-label={`More ${label}`}>+</button>
    </span>
  )
}
/** an adjustment (+/−) to a reserve: − and + move by `step`; typing "-50" or "50" works too */
function AdjStepper({ val, step, min, max, bad, label, onChange, plain, what = 'reserve' }: { val: number; step: number; min: number; max: number; bad?: boolean; label: string; onChange: (n: number) => void; plain?: boolean; what?: string }) {
  // − and + stop at the limits (no lower than what's already shipped or ordered, no more than is available)
  const clamp = (n: number) => Math.min(Math.max(n, min), Math.max(max, min))
  const [txt, setTxt] = useState<string | null>(null)   // while typing, keep what they typed (e.g. a lone "-")
  const shown = txt ?? (plain ? (val ? String(val) : '') : val > 0 ? `+${val}` : val < 0 ? `−${Math.abs(val)}` : '')
  return (
    <span className={c(`stepper adj ${val ? 'on' : ''} ${bad ? 'bad' : ''}`)}>
      <button type="button" disabled={val <= min} onClick={() => { setTxt(null); onChange(clamp(val - step)) }} aria-label={`${step} lbs less ${label}`}>−</button>
      <input type="text" inputMode="numeric" value={shown} placeholder={plain ? '0' : '±0'} aria-label={plain ? `${label} ${what}, lbs` : `Change to ${label} reserve, lbs`} aria-invalid={bad ? 'true' : 'false'}
        onChange={e => { const t = e.target.value.replace(/[−–]/g, '-').replace(/[^0-9+-]/g, ''); setTxt(t); const n = Number(t.replace('+', '')); if (t === '' || t === '-' || t === '+') onChange(0); else if (!isNaN(n)) onChange(n) }}
        onBlur={() => { setTxt(null); if (not10(val)) { let r = round10(val)
          // rounding up never pushes a typed amount past the limit it was inside (e.g. 345 with 340 available → 340)
          if (val <= max && r > max) r = Math.floor(max / 10) * 10; if (val >= min && r < min) r = Math.ceil(min / 10) * 10
          onChange(r) } }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
      <button type="button" disabled={val >= max} onClick={() => { setTxt(null); onChange(clamp(val + step)) }} aria-label={`${step} lbs more ${label}`}>+</button>
    </span>
  )
}
const STEPS: [number, string][] = [[10, '10 lbs'], [50, '50 lbs'], [100, '100 lbs'], [650, 'A full pallet']]
const StepErr = ({ msg }: { msg: string }) => <p className={c('err')} style={{ margin: '2px 0 0' }}>{msg}</p>

/* ---------- data ---------- */
type Screen = 'yields' | 'yield' | 'ysent' | 'activity' | 'resmenu' | 'home' | 'contract' | 'reserves' | 'edit' | 'reqReview' | 'sent' | 'menu' | 'order' | 'review' | 'ordered' | 'orders' | 'holds'
/** reserve history (mockup): one entry per request (with Lifted's decision) or per change Lifted made */
export interface ActLine { s: string; y: number; from: number; to: number; ok?: number | null
  /** reserve after Lifted's decision on this line (null while waiting); when present it wins over the entry's status */
  after?: number | null }
export interface Act { id: string; at: string; by: 'you' | 'lifted'; who: string; kind: 'request' | 'adjust' | 'setup' | 'rejected'
  status?: 'waiting' | 'approved' | 'partly' | 'declined' | 'cancelled'; decidedAt?: string | null; decidedBy?: string | null
  lines: ActLine[]; note?: string | null; reply?: string | null; fromHold?: boolean }
/** yields (mockup): what the customer got from each strain on a shipped order. Fresh frozen -> hash -> rosin, or fresh frozen -> BHO */
export type YUnit = 'g' | 'kg' | 'lb' | '%'
/** one way a strain was run: washed to hash (and maybe pressed to rosin), or run to BHO. A strain can be split into several parts */
export interface YPart { bho: boolean; rosin: boolean; ff: number | null; outV: number | null; outU: YUnit; rosinV: number | null; rosinU: YUnit }
export interface YieldLine { s: string; y: number; shipped: number; parts: YPart[]; note: string }
export interface YieldReport { orderId: number; lines: YieldLine[]; sentAt: string | null; savedAt: string | null }
interface Data {
  cy: number; contract: boolean; terms: Terms | null; menu: MenuRow[]; bal: Balance[]; reqs: ReserveRequest[]; orders: Order[]; flags: number[]
  st: Statement | null; mc: MyContract | null; holds: SampleHold[]; holdDays: number; acts: Act[]; yields: YieldReport[] | null; prices: Record<number, number | null>; linePrices: Record<string, number | null>; qbo: Record<string, QboLine[]>
  /** 196: strain (lowercase name or alias) -> grade SHO/BHO and type short code (S, S/H, H, I/H, I) */
  tags: Record<string, Tag>
}
/** strain grade + type as the menu shows them */
interface Tag { g: string | null; t: string | null }
const TYPE_SHORT: Record<string, string> = { Sativa: 'S', 'Sativa Hybrid': 'S/H', Hybrid: 'H', 'Indica Hybrid': 'I/H', Indica: 'I' }
const TYPE_ORDER: Record<string, number> = { S: 1, 'S/H': 2, H: 3, 'I/H': 4, I: 5 }
const TYPE_LONG: Record<string, string> = { S: 'Sativa', 'S/H': 'Sativa hybrid', H: 'Hybrid', 'I/H': 'Indica hybrid', I: 'Indica' }
interface ResRow { k: string; s: string; y: number; res: number; used: number; left: number; asked: number | null
  /** desktop table: shipped, on any open SO (approved + submitted), and what's left after both */
  ful: number; so: number; rem: number }
interface MenuItem { k: string; s: string; y: number; open: number; hold: number; row: MenuRow }
interface OLine { k: string; s: string; y: number; resLeft: number; open: number; hold: number }
interface Detail { k: string; s: string; y: number; q: number; fromHold: number; fromRes: number; fromOpen: number; max: number; sample: boolean; hold: number; price: number | null }
interface Change { s: string; y: number; from: number; to: number; isNew?: boolean }
interface OLineView { s: string; y: number | null; lbs: number | null; price: number | null; amount: number | null }
interface ORow {
  key: string; label: string; status: 'submitted' | 'approved' | 'fulfillment' | 'shipped'; paid: boolean | null; date: string | null; due: string | null; wanted: string | null
  lines: OLineView[]; amount: number | null; po: string | null; so: string | null; order: Order | null; inv: StatementInvoice | null; holdLbs: number; rank: number
}

async function loadAll(backend: Backend): Promise<Data> {
  const safe = <T,>(p: Promise<T>, d: T) => p.catch(() => d)
  const actFn = (backend as unknown as { reserveActivity?: () => Promise<Act[]> }).reserveActivity
  const acts = actFn ? await safe(actFn.call(backend), [] as Act[]) : []
  const yFn = (backend as unknown as { myYields?: () => Promise<YieldReport[]> }).myYields
  const yields = yFn ? await safe(yFn.call(backend), null) : null   // null = this backend doesn't do yields yet (screens stay hidden)
  const [terms, ys, menu, bal, reqs, orders, flags, st, mc, holds, hd] = await Promise.all([
    safe(backend.myTerms(), null), safe(backend.reserveYears(), null), safe(backend.openMenu(), [] as MenuRow[]), safe(backend.listBalances(), [] as Balance[]),
    safe(backend.listRequests(), [] as ReserveRequest[]), safe(backend.listOrders(), [] as Order[]), safe(backend.myOrderFlags(), [] as number[]),
    safe(backend.statement(), null), safe(backend.myContract(), null), safe(backend.sampleHolds(), [] as SampleHold[]), safe(backend.mySampleHoldDays(), null),
  ])
  const cy = ys?.current ?? mc?.year ?? Math.max(new Date().getFullYear(), ...menu.map(m => m.crop_year))
  const years = [...new Set([cy, ...menu.map(m => m.crop_year), ...orders.flatMap(o => o.order_lines.map(l => l.crop_year ?? cy))])]
  const ps = await Promise.all(years.map(y => safe(backend.myTermsFor(y), null).then(t => [y, t?.price_per_lb ?? null] as const)))
  // 175: this customer's price per strain + crop year (contract, else item card, else market), same as place_order uses
  const lp = await safe(Promise.resolve(backend.client()?.rpc('my_line_prices')).then(r => (r?.data ?? []) as { strain: string; crop_year: number; price: number | null }[]), [])
  const linePrices: Record<string, number | null> = Object.fromEntries(lp.map(x => [`${x.strain}|${x.crop_year}`, x.price != null ? Number(x.price) : null]))
  // 196: grade + type per strain (until 196 is run this comes back empty and the columns show –)
  const tg = await safe(Promise.resolve(backend.client()?.rpc('menu_strain_tags')).then(r => (r?.data ?? []) as { strain: string; aliases: string[] | null; strain_type: string | null; grade: string | null }[]), [])
  const tags: Record<string, Tag> = {}
  for (const x of tg) { const v = { g: x.grade ?? null, t: x.strain_type ? TYPE_SHORT[x.strain_type] ?? null : null }
    for (const n of [x.strain, ...(x.aliases ?? [])]) if (n && !(n.toLowerCase().trim() in tags)) tags[n.toLowerCase().trim()] = v }
  const qbo = await safe(backend.qboInvoiceLines((st?.invoices ?? []).map(i => i.qbo_id).filter((x): x is string => !!x)), {} as Record<string, QboLine[]>)
  const prices: Record<number, number | null> = {}
  for (const [y, p] of ps) prices[y] = p != null ? Number(p) : (terms?.price_per_lb != null ? Number(terms.price_per_lb) : null)
  return { cy, contract: !!(terms?.reserves_enabled ?? mc?.reserves_enabled), terms, menu, bal, reqs, orders, flags, st, mc, holds, holdDays: hd ?? 10, acts, yields, prices, linePrices, qbo, tags }
}

/* ---------- the portal ---------- */
export function Portal({ backend, me, signOut }: { backend: Backend; me: Me; signOut: () => void }) {
  useEffect(() => { document.title = 'Lifted Farms Orders' }, [])
  const [d, setD] = useState<Data | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const reload = () => loadAll(backend).then(x => { setD(x); setLoadErr(null) }).catch(e => setLoadErr(String(e?.message ?? e)))
  useEffect(() => { reload() }, [])
  // keep numbers current: changes Lifted makes (approving, cancelling, shipping) show when the customer comes back to the portal
  const lastLoad = useRef(Date.now())
  const refresh = () => { if (Date.now() - lastLoad.current < 10000) return; lastLoad.current = Date.now(); reload() }
  useEffect(() => {
    const vis = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', vis); addEventListener('focus', refresh)
    const t = setInterval(() => { if (document.visibilityState === 'visible') refresh() }, 120000)
    return () => { document.removeEventListener('visibilitychange', vis); removeEventListener('focus', refresh); clearInterval(t) }
  }, [])

  const [screen, setScreen] = useState<Screen>('home')
  // desktop (1024px and wider): sidebar layout and dashboard home; phones and tablets keep the mobile screens
  const deskQ = '(min-width: 1024px)'
  const [desk, setDesk] = useState(() => matchMedia(deskQ).matches)
  useEffect(() => { const m = matchMedia(deskQ), f = () => setDesk(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f) }, [])
  useEffect(() => {
    history.replaceState({ ...(history.state ?? {}), cp: 'home' }, '')
    const pop = (e: PopStateEvent) => { setScreen((e.state?.cp as Screen) ?? 'home'); window.scrollTo({ top: 0 }) }
    addEventListener('popstate', pop); return () => removeEventListener('popstate', pop)
  }, [])
  const go = (s0: Screen) => {
    // desktop contract customers: Contract Reserves, Open Menu and Edit Reserves are one screen
    const s: Screen = desk && contract && (s0 === 'reserves' || s0 === 'menu' || s0 === 'edit') ? 'resmenu' : desk && !contract && s0 === 'menu' ? 'home' : s0
    setScreen(s); history.pushState({ cp: s }, ''); window.scrollTo({ top: 0 }); if (s === 'home' || s === 'activity' || s === 'orders' || s === 'reserves' || s === 'menu' || s === 'resmenu') refresh() }

  // phones: while the keyboard is up, hide the bottom bar (it rides above the keyboard and covers the box) and keep the box
  // being typed in centred on screen once the keyboard has opened
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    if (!matchMedia('(pointer: coarse)').matches) return
    const isBox = (el: EventTarget | null): el is HTMLInputElement => el instanceof HTMLInputElement && ['text', 'search', 'email', 'password'].includes(el.type) && !!el.closest('.cp')
    const centre = () => { const el = document.activeElement; if (isBox(el)) (el.closest('.cp-box, .cp-sel, .cp-mg, label') ?? el).scrollIntoView({ block: 'center', behavior: 'smooth' }) }
    let t = 0
    const onIn = (e: FocusEvent) => { if (!isBox(e.target)) return; setTyping(true); clearTimeout(t); t = window.setTimeout(centre, 350) }
    const onOut = () => setTimeout(() => { if (!isBox(document.activeElement)) setTyping(false) }, 50)
    const vv = window.visualViewport, onVV = () => { clearTimeout(t); t = window.setTimeout(centre, 120) }
    document.addEventListener('focusin', onIn); document.addEventListener('focusout', onOut); vv?.addEventListener('resize', onVV)
    return () => { document.removeEventListener('focusin', onIn); document.removeEventListener('focusout', onOut); vv?.removeEventListener('resize', onVV); clearTimeout(t) }
  }, [])
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
  const [reviewFrom, setReviewFrom] = useState<'menu' | 'edit'>('edit')
  const [reqNote, setReqNote] = useState('')
  const [lastReq, setLastReq] = useState<Change[]>([])
  const [lastReqRows, setLastReqRows] = useState<ReqRow[]>([]); const [lastReqNote, setLastReqNote] = useState('')
  const [q, setQ] = useState('')
  const [editQ, setEditQ] = useState('')
  const [orderQ, setOrderQ] = useState('')
  const [menuYear, setMenuYear] = useState<'all' | number>('all')
  const [gradeF, setGradeF] = useState<'all' | 'SHO' | 'BHO'>('all')   // grade filter on Reserves & Menu (desktop) and Open Menu (phones)
  // phones: a one-time tip to add the portal to the home screen (an icon keeps them signed in and they never need the link again)
  const [a2hs, setA2hs] = useState<'ios' | 'android' | null>(() => {
    try {
      const ua = navigator.userAgent, standalone = matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone
      if (standalone || localStorage.getItem('cp-a2hs-done')) return null
      return /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : null
    } catch { return null }
  })
  const hideA2hs = () => { setA2hs(null); try { localStorage.setItem('cp-a2hs-done', '1') } catch { /* private mode */ } }
  // desktop tables: click a column header to sort; default is strain A–Z
  const [sorts, setSorts] = useState<Record<string, { col: string; dir: number }>>({})
  const sortOf = (t: string) => sorts[t] ?? { col: 's', dir: 1 }
  function sortRows<T extends { s: string; y: number }>(t: string, list: T[], get: Record<string, (x: T) => number>): T[] {
    const { col, dir } = sortOf(t), g = get[col]
    const byName = (a: T, b: T) => a.s.localeCompare(b.s) || b.y - a.y
    return [...list].sort((a, b) => col === 's' || !g ? dir * byName(a, b) : dir * (g(a) - g(b)) || byName(a, b))
  }
  const sh = (t: string, col: string, label: React.ReactNode) => {
    const { col: c0, dir } = sortOf(t), on = c0 === col
    return <button key={col} type="button" className={c(`sorth ${on ? 'on' : ''}`)} aria-sort={on ? (dir > 0 ? 'ascending' : 'descending') : undefined}
      onClick={() => setSorts({ ...sorts, [t]: { col, dir: on ? -dir : col === 's' ? 1 : -1 } })}>{label}<i aria-hidden="true">{on ? (dir > 0 ? '▲' : '▼') : '↕'}</i></button>
  }
  const [notRes, setNotRes] = useState(false)
  const [rmRes, setRmRes] = useState<'all' | 'res' | 'not'>('all')
  const [stepCustom, setStepCustom] = useState(false)
  const [stepTxt, setStepTxt] = useState<string | null>(null)
  const [rmStep, setRmStepRaw] = useState(() => { try { return Number(localStorage.getItem('cp-rm-step')) || 10 } catch { return 10 } })
  const setRmStep = (n: number) => { setRmStepRaw(n); try { localStorage.setItem('cp-rm-step', String(n)) } catch { /* private mode */ } }

  // order form
  const [ord, setOrd] = useState<Record<string, number>>({})
  const [smp, setSmp] = useState<Record<string, boolean>>({})
  const [holdAsk, setHoldAsk] = useState<Record<string, number>>({})
  const [po, setPo] = useState(''); const [note, setNote] = useState(''); const [wanted, setWanted] = useState('')
  const [editing, setEditing] = useState<Order | null>(null)
  const [cal, setCal] = useState<{ y: number; m: number } | null>(null)
  const [focusK, setFocusK] = useState<string | null>(null)
  const [lastOrder, setLastOrder] = useState<{ label: string; lbs: number; res: number; amount: number | null; detail: Detail[]; modified: boolean; po?: string; wanted?: string; note?: string } | null>(null)

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
  // 196: grade (SHO / BHO) and type (S … I) per strain; desktop gets columns (blank when not set), phones a small pill
  const tagOf = (s: string): Tag => d?.tags[s.toLowerCase().trim()] ?? { g: null, t: null }
  const gradeCell = (s: string) => { const g = tagOf(s).g; return <span className={c('tagcell')}>{g ? <span className={c(`gtag g-${g.toLowerCase()}`)}>{g}</span> : null}</span> }
  const typeCell = (s: string) => { const t = tagOf(s).t; return <span className={c('tagcell')}>{t ? <span className={c('ttag')} title={TYPE_LONG[t]}>{t}</span> : null}</span> }
  // phones: the same colored grade chip (SHO teal, BHO gold) and gray type chip as the desktop columns, small and inline
  const tagPill = (s: string) => { const { g, t } = tagOf(s); return g || t ? <span className={c('tagpair')}>{g && <span className={c(`gtag g-${g.toLowerCase()}`)}>{g}</span>}{t && <span className={c('ttag')} title={TYPE_LONG[t]}>{t}</span>}</span> : null }
  const lastOrd = useMemo(() => { const m: Record<string, string> = {}
    for (const o of d?.orders ?? []) { if (o.status === 'draft' || o.status === 'cancelled' || !o.order_date) continue
      for (const l of o.order_lines) { const k = l.strain.toLowerCase().trim(); if (!m[k] || o.order_date > m[k]) m[k] = o.order_date } }
    return m }, [d])
  const lastOrdTxt = (s: string) => { const v = lastOrd[s.toLowerCase().trim()]; return v ? `Last ordered ${shortDate(v)}` : 'Not ordered before' }
  const gradeN = (s: string) => ({ SHO: 1, BHO: 2 } as Record<string, number>)[tagOf(s).g ?? ''] ?? 9
  const typeN = (s: string) => TYPE_ORDER[tagOf(s).t ?? ''] ?? 9

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
      const so = Number(b.pending) + Number(b.submitted ?? 0)
      out.set(kOf(b.strain, y), { k: kOf(b.strain, y), s: b.strain, y, res: Number(b.reserved), used: Number(b.shipped) + Number(b.pending), left: Math.max(Number(b.remaining), 0), asked: null,
        ful: Number(b.shipped), so, rem: Math.max(Number(b.reserved) - Number(b.shipped) - so, 0) })
    }
    for (const r of d.reqs) {
      const y = r.crop_year ?? cy
      if (r.status !== 'pending' || y > cy) continue
      const k = kOf(r.strain, y), x = out.get(k)
      if (x) x.asked = Number(r.requested_lbs)
      else out.set(k, { k, s: r.strain, y, res: 0, used: 0, left: 0, asked: Number(r.requested_lbs), ful: 0, so: 0, rem: 0 })
    }
    return [...out.values()].sort((a, b) => a.s.localeCompare(b.s) || b.y - a.y)
  }, [d])
  const resRow = (k: string) => reserves.find(r => r.k === k)
  const dt = reserves.reduce((a, r) => ({ ful: a.ful + r.ful, so: a.so + r.so, rem: a.rem + r.rem }), { ful: 0, so: 0, rem: 0 })
  const totals = reserves.reduce((a, r) => ({ res: a.res + r.res, used: a.used + r.used, left: a.left + r.left }), { res: 0, used: 0, left: 0 })

  const liveHolds = (d?.holds ?? []).filter(h => h.state === 'submitted' || h.state === 'waiting' || h.state === 'active')
  const activeHeld = (k: string) => liveHolds.filter(h => h.state === 'active' && kOf(h.strain, h.crop_year) === k).reduce((a, h) => a + Number(h.remaining), 0)
  const holdLbs = (h: SampleHold) => Number(h.state === 'active' ? h.remaining : h.hold_lbs)
  const sampleOf = (h: SampleHold) => Number(d?.orders.flatMap(o => o.order_lines).find(l => l.id === h.line_id)?.lbs ?? 0)
  const holdReq = (h: SampleHold) => d?.reqs.find(r => r.status === 'pending' && r.hold_line_id === h.line_id)
  const priceOf = (y: number, s?: string) => {
    const k = s ? `${s}|${y}` : '', lp = d?.linePrices ?? {}
    if (k && k in lp && lp[k] != null) return lp[k]
    return d?.prices[y] ?? (d?.terms?.price_per_lb != null ? Number(d.terms.price_per_lb) : null)
  }

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
  // problems on lines that will actually be sent (a strain just picked with no lbs yet is ignored)
  const sendErr = editNew.some(n => n.lbs > 0 && !!newErr(n)) || reserves.some(r => !!resErr(r))
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
    setLastReq(changes); setLastReqRows(reqRows(changes)); setLastReqNote(reqNote); clearEdit(); await reload(); go('sent')
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
    return { k: l.k, s: l.s, y: l.y, q: qv, ...sp, sample: !!smp[l.k], hold: smp[l.k] ? (holdAsk[l.k] ?? 0) : 0, price: priceOf(l.y, l.s) }
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
    setLastOrder({ label: o ? soLabel(o) : was ? soLabel(was) : `Order #${id}`, lbs: oTot.lbs, res: oTot.res, amount: oTot.amount, detail, modified: !!was, po, wanted, note })
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
          wanted: null, lines: ql?.length ? qboLines(ql) : lines, amount: inv ? Number(paid ? inv.total : inv.balance) : sum, po: o.po_number ?? inv?.po_number ?? null, so: o.so_number, order: o, inv, holdLbs, rank: 3 })
      } else {
        const ful = d.flags.includes(o.id)
        // pending = Lifted confirmed it (Approved); pallets assigned = In fulfillment
        const st: ORow['status'] = ful ? 'fulfillment' : o.status === 'pending' ? 'approved' : 'submitted'
        rows.push({ key: 'o' + o.id, label: soLabel(o), status: st, paid: null, date: o.order_date, due: null, wanted: o.wanted_date ?? null,
          lines, amount: sum, po: o.po_number ?? null, so: o.so_number, order: o, inv: null, holdLbs, rank: st === 'submitted' ? 0 : st === 'approved' ? 1 : 2 })
      }
    }
    for (const i of invs) {
      if (used.has(i) || i.kind === 'CreditMemo' || i.status === 'void') continue
      const paid = i.status === 'paid' || Number(i.balance) <= 0
      // invoices from QuickBooks can share id 0 (not made in the app), so key them by QuickBooks' id or number
      rows.push({ key: 'i' + (i.qbo_id ?? i.inv_number ?? i.id), label: i.inv_number, status: 'shipped', paid, date: i.invoice_date, due: i.due_date, wanted: null,
        lines: i.qbo_id && d.qbo[i.qbo_id] ? qboLines(d.qbo[i.qbo_id]) : [], amount: Number(paid ? i.total : i.balance),
        po: i.po_number, so: i.so_number, order: null, inv: i, holdLbs: 0, rank: 3 })
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
    setHoldSel([]); setHoldQty({}); setLastReq(ch); setLastReqRows(reqRows(ch)); setLastReqNote('From sample holds'); await reload(); go('sent')
  }
  async function doRelease(h: SampleHold) {
    const ok = await run(() => backend.releaseMyHold(h.line_id).then(() => true))
    setReleasing(null)
    if (!ok) return
    setHoldSel(s => s.filter(x => x !== h.line_id)); toast(`${fmt(holdLbs(h))} lbs of ${h.strain} released`); reload()
  }

  /* ---------- screens ---------- */
  const back = (to: Screen, label: string) => to === 'home' && desk ? null : <button className={c('back')} onClick={() => go(to)}>{I.back}{label}</button>
  const balance = d?.st?.balance

  function Home() {
    const open = orows.filter(o => o.status !== 'shipped'), nSub = open.filter(o => o.status === 'submitted').length, nApp = open.filter(o => o.status === 'approved').length, nFul = open.filter(o => o.status === 'fulfillment').length
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
          <div className={c('top')}><a className={c('logolink')} href="https://www.liftedfarms.com" target="_blank" rel="noopener noreferrer" aria-label="Lifted website (opens in a new tab)"><img className={c('logo')} src="/logo-dark.svg" alt="Lifted" /></a><button className={c('iconbtn')} onClick={() => setAcct(true)} aria-label="Account settings">{I.user}</button></div>
          <p className={c('cust')}>{me.customer_name}</p>
          <p className={c('bal')}>{balance ? money2(balance.amount) : '—'}</p>
          {balance && balance.past_due > 0
            ? <p className={c('sub')} style={{ color: '#f9a8b8' }}>Balance · {money2(balance.past_due)} past due</p>
            : <p className={c('sub mint')}>{balance ? 'Balance · nothing past due' : 'Balance'}</p>}
        </header>
        <main className={c('main lift')}>
          {adjustNote()}
          {a2hs && !desk && <section className={c('card a2hs')}>
            <div className={c('row')} style={{ alignItems: 'flex-start', gap: 10 }}><div className={c('grow')}>
              <p className={c('name')} style={{ fontSize: 16 }}>Add Lifted to your home screen</p>
              <p className={c('meta')} style={{ margin: '4px 0 0' }}>{a2hs === 'ios'
                ? <>In Safari, tap the <b>Share</b> button {I.share}, then <b>View More</b>, then {I.plusbox} <b>Add to Home Screen</b>.</>
                : <>Tap the <b>⋮</b> menu, then <b>Add to Home screen</b> (or <b>Install app</b>).</>}
                {' '}Open the portal from that icon and you'll stay signed in. You'll sign in once more the first time.</p></div>
              <button className={c('iconbtn')} style={{ color: 'var(--muted)', borderColor: 'var(--line)', flex: '0 0 auto' }} onClick={hideA2hs} aria-label="Hide this tip">{I.close}</button></div>
          </section>}
          {contract && <button className={c('tile')} onClick={() => go('reserves')}>
            <div className={c('row')}><div className={c('grow')}><p className={c('lbl')}>Contract Reserves</p><p className={c('big')}>{fmt(totals.left)} lbs left</p></div><span className={c('pillbtn')}>View / Edit</span></div>
            <p className={c('foot')}>of {fmt(totals.res)} reserved · {fmt(totals.used)} picked up · {plural(reserves.filter(r => r.res > 0).length, 'strain')}</p></button>}
          <button className={c('tile')} onClick={() => go('menu')}>
            <div className={c('row')}><div className={c('grow')}><p className={c('lbl')}>Open Menu</p><p className={c('big')}>{fmt(menuTotal)} lbs open</p></div><span className={c('pillbtn')}>{contract ? 'Add to Reserves' : 'View Menu'}</span></div>
            <p className={c('foot')}>{plural(menuN, 'strain')} · updates live as orders and reserves change</p></button>
          <div className={contract ? c('grid2') : ''}>
            <button className={c('tile small')} onClick={() => { setFilter('all'); go('orders') }}><p className={c('lbl')}>Orders &amp; Statement</p><p className={c('big')}>{open.length} in progress</p>
              {open.length > 0 && <p className={c('foot')} style={{ color: 'var(--blue)', marginTop: 4 }}>{[nSub ? `${nSub} submitted` : '', nApp ? `${nApp} approved` : '', nFul ? `${nFul} in fulfillment` : ''].filter(Boolean).join(' · ')}</p>}</button>
            {contract && <button className={c('tile small tint')} onClick={() => go('contract')}><p className={c('lbl')}>My Contract · {mon}</p>
              <p className={c('big')}>{fmt(thisMonth)} lbs <span style={{ fontSize: 13, fontWeight: 500 }}>picked up</span></p>
              <p className={c('foot')} style={{ marginTop: 4 }}>{min == null ? 'No monthly minimum' : leftMin ? <><b style={{ color: 'var(--blue)' }}>{fmt(leftMin)} to go</b> · {fmt(min)} lb min</> : <b>✓ {fmt(min)} lb min met</b>}</p></button>}
          </div>
          {yToDo.length > 0 && <button className={c('tile ytile')} onClick={() => yToDo.length === 1 ? openYield(yToDo[0].o.order!.id) : go('yields')}>
            <div className={c('row')}><div className={c('grow')}><p className={c('lbl')}>Report Yields</p><p className={c('big')}>{plural(yToDo.length, 'order')} to report</p></div><span className={c('pillbtn')}>Report</span></div>
            <p className={c('foot')}>{yToDo.slice(0, 3).map(x => x.o.label).join(', ')}{yToDo.length > 3 ? ` +${yToDo.length - 3} more` : ''} · how did your hash and rosin come out?</p></button>}
          {hs.length > 0 && <button className={c('tile')} style={{ background: 'var(--gold-bg)' }} onClick={() => go('holds')}>
            <div className={c('row')}><div className={c('grow')}><p className={c('lbl')} style={{ color: 'var(--gold)' }}>Sample Holds for You</p><p className={c('big')}>{plural(hs.length, 'strain')} · {fmt(hs.reduce((a, h) => a + holdLbs(h), 0))} lbs</p></div><span className={c('pillbtn')} style={{ background: '#fff', color: 'var(--gold)' }}>Review</span></div>
            <p className={c('foot')} style={{ color: 'var(--ink)', fontWeight: 500 }}>{shown}</p>
            <p className={c('foot')} style={{ color: 'var(--gold)', marginTop: 2 }}>{soon ? `Next hold ends in ${plural(daysUntil(soon.until), 'day')} (${soon.strain})` : 'Waiting on Lifted to confirm'}</p></button>}
        </main>
        <div className={c('dock')}><button className={c('btn full')} onClick={() => newOrder()}>Place an order</button></div>
      </div>
    )
  }

  function DeskHome() {
    const open = orows.filter(o => o.status !== 'shipped')
    const cur = d?.mc?.months?.length ? d.mc.months[d.mc.months.length - 1] : null
    const thisMonth = cur && cur.month.slice(0, 7) === iso(new Date()).slice(0, 7) ? Number(cur.lbs) : Number(d?.st?.month.shipped ?? 0)
    const min = d?.mc?.monthly_min_lbs ?? d?.st?.month.min ?? null, leftMin = min != null ? Math.max(Number(min) - thisMonth, 0) : null
    const months = d?.mc?.months ?? [], done = cur && cur.month.slice(0, 7) === iso(new Date()).slice(0, 7) ? months.slice(0, -1) : months
    const since = min != null ? done.reduce((a, m) => a + Number(m.lbs) - Number(min), 0) : null
    const menuTotal = menuItems.reduce((a, m) => a + m.open, 0), menuN = menuItems.filter(m => m.open > 0).length
    const hs = liveHolds.slice().sort((a, b) => (a.state === 'active' ? 0 : 1) - (b.state === 'active' ? 0 : 1) || daysUntil(a.until) - daysUntil(b.until))
    const mc = d?.mc, monthName = new Date().toLocaleDateString('en-US', { month: 'long' })
    const contracted = Number(mc?.contract_lbs ?? 0), gap = contracted - reserves.filter(r => r.y === (mc?.year ?? cy)).reduce((a, r) => a + r.res, 0)
    const terms = [contract ? `${mc?.year ?? cy} crop contract` : '', mc?.payment_terms ?? d?.st?.customer.terms ?? '', mc?.price_per_lb != null ? `$${Number(mc.price_per_lb).toFixed(2)}/lb` : ''].filter(Boolean).join(' · ')
    const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n))
    const chip = (o: ORow) => o.status === 'submitted' ? <span className={c('chip c-sub')}>Submitted</span> : o.status === 'approved' ? <span className={c('chip c-ok')}>Approved</span> : <span className={c('chip c-ful')}>In fulfillment</span>
    return (
      <div className={c('screen dhome')}>
        <div className={c('dhead')}>
          <div><h1>{me.customer_name}</h1>{terms && <p className={c('meta')} style={{ fontSize: 15, margin: '4px 0 0' }}>{terms}</p>}</div>
          <button className={c('btn hcta')} onClick={() => newOrder()}>Place an order</button>
        </div>
        {adjustNote()}
        <div className={c('kpis')}>
          <button className={c('kpi ink')} onClick={() => { setFilter('all'); go('orders') }}><p>Balance</p><b>{balance ? money(balance.amount) : '—'}</b>
            <small style={{ color: balance && balance.past_due > 0 ? '#f9a8b8' : 'var(--mint)' }}>{balance && balance.past_due > 0 ? `${money2(balance.past_due)} past due` : 'Nothing past due'} · {plural(openInvoices.length, 'open invoice')}</small></button>
          {contract && <button className={c('kpi')} onClick={() => go('reserves')}><p>Contract Reserves</p><b>{fmt(dt.rem)} lbs remaining</b><small>of {fmt(totals.res)} reserved · {fmt(dt.ful)} fulfilled · {fmt(dt.so)} on open SOs</small></button>}
          {contract && <button className={c('kpi tint')} onClick={() => go('contract')}><p>My Contract · {monthName}</p><b>{fmt(thisMonth)} lbs <span style={{ fontSize: 14, fontWeight: 500 }}>picked up</span></b>
            <small>{min == null ? 'No monthly minimum' : leftMin ? <><b style={{ color: 'var(--blue)', fontSize: 13, display: 'inline' }}>{fmt(leftMin)} to go</b> · {fmt(min)} lb min</> : `✓ ${fmt(min)} lb min met`}{since != null && done.length > 0 ? ` · ${sign(since)} since Oct` : ''}</small></button>}
          {contract ? <button className={c('kpi')} onClick={() => go('menu')}><p>Open Menu</p><b>{fmt(menuTotal)} lbs open</b><small>{plural(menuN, 'strain')} · Add to Reserves</small></button>
            : <div className={c('kpi')}><p>Open Menu</p><b>{fmt(menuTotal)} lbs open</b><small>{plural(menuN, 'strain')} · see the menu below</small></div>}
          {!contract && <button className={c('kpi')} onClick={() => { setFilter('all'); go('orders') }}><p>Orders &amp; Statement</p><b>{open.length} in progress</b><small>Orders, invoices and your statement</small></button>}
        </div>
        <div className={c('dgrid')}>
          {contract ? <section className={c('card')}>
            <div className={c('dcard-h')}><h2>Contract Reserves</h2><button className={c('pillbtn')} style={{ border: 0 }} onClick={() => go('resmenu')}>Open Reserves &amp; Menu</button></div>
            {reserves.length === 0 ? <p className={c('meta')} style={{ padding: 18, margin: 0 }}>No reserves yet. Add strains from the open menu.</p> : <div className={c('hscroll')}>
              <div className={c('htb head gt')}>{sh('home', 's', 'Strain')}{sh('home', 'g', 'Grade')}{sh('home', 't', 'Type')}{sh('home', 'res', 'Reserved')}{sh('home', 'ful', 'Fulfilled')}{sh('home', 'so', 'Open SO')}{sh('home', 'rem', 'Remaining')}{sh('home', 'open', <>Open menu<br />available</>)}</div>
              {sortRows('home', reserves, { g: r => gradeN(r.s), t: r => typeN(r.s), res: r => r.res, ful: r => r.ful, so: r => r.so, rem: r => r.rem, open: r => menuRow(r.k)?.open ?? 0 }).map(r => <div key={r.k} className={c('htb gt')}><span className={c('rmname')}>{r.s} {yrTag(r.y)} {r.asked != null && <span className={c('chip c-wait')}>{r.res ? `Asked ${fmt(r.asked)}` : `New · asked ${fmt(r.asked)}`} · waiting</span>}</span>{gradeCell(r.s)}{typeCell(r.s)}
                <span>{r.res ? fmt(r.res) : '–'}</span><span className={c('dim')}>{fmt(r.ful)}</span><span className={c('dim')}>{fmt(r.so)}</span><b>{fmt(r.rem)}</b><span className={c('dim')}>{fmt(menuRow(r.k)?.open ?? 0)}</span></div>)}
              <div className={c('htb total gt')}><b>Total · {plural(reserves.length, 'strain')}</b><span /><span /><b>{fmt(totals.res)}</b><span className={c('dim')}>{fmt(dt.ful)}</span><span className={c('dim')}>{fmt(dt.so)}</span><b style={{ color: 'var(--teal-ink)' }}>{fmt(dt.rem)}</b><span /></div>
            </div>}
            {gap > 0 && <p className={c('meta')} style={{ padding: '10px 18px 14px', margin: 0 }}>{fmt(gap)} lbs of your {fmt(contracted)} lb contract aren't reserved to a strain yet. <button className={c('linkish')} style={{ minWidth: 0, textAlign: 'left', display: 'inline' }} onClick={() => go('menu')}>Add to Reserves</button></p>}
          </section> : <section className={c('card')}>
            <div className={c('dcard-h')}><h2>Open Menu</h2><button className={c('pillbtn')} style={{ border: 0 }} onClick={() => newOrder()}>Place an order</button></div>
            {(() => { const all = menuItems.filter(m => m.open > 0), ql = q.toLowerCase(), years = [...new Set(all.map(m => m.y))].sort((a, b) => b - a)
              const om = all.filter(m => (!ql || m.s.toLowerCase().includes(ql)) && (menuYear === 'all' || m.y === menuYear))
              return <>{all.length > 0 && <div className={c('rmbar')} style={{ borderTop: '1px solid var(--line)' }}>
                <div className={c('filters')} role="group" aria-label="Filter the menu">
                  <button aria-pressed={menuYear === 'all'} onClick={() => setMenuYear('all')}>All</button>
                  {years.length > 1 && years.map(y => <button key={y} aria-pressed={menuYear === y} onClick={() => setMenuYear(menuYear === y ? 'all' : y)}>{y}</button>)}</div>
                <label className={c('search')}>{I.search}<input type="search" placeholder="Search strains" value={q} onChange={e => setQ(e.target.value)} aria-label="Search strains" /></label></div>}
              {all.length > 0 && om.length === 0 ? <p className={c('meta')} style={{ padding: 18, margin: 0, borderTop: '1px solid var(--line)' }}>No strains match.</p> : om.length === 0 ? <p className={c('meta')} style={{ padding: 18, margin: 0 }}>Nothing on the open menu right now.</p> : <div className={c('hscroll tall')}>
                <div className={c('htb head four')}>{sh('homenc', 's', 'Strain')}{sh('homenc', 'g', 'Grade')}{sh('homenc', 't', 'Type')}{sh('homenc', 'open', 'Open menu available')}</div>
                {sortRows('homenc', om, { open: m => m.open, g: m => gradeN(m.s), t: m => typeN(m.s) }).map(m => <div key={m.k} className={c('htb four')}><span className={c('rmname')}>{m.s} {yrTag(m.y)} {m.hold > 0 && <span className={c('chip c-wait')}>{fmt(m.hold)} held for you</span>}</span>{gradeCell(m.s)}{typeCell(m.s)}<b>{fmt(m.open)}</b></div>)}
                <div className={c('htb total four')}><b>Total · {plural(om.length, 'strain')}</b><span /><span /><b style={{ color: 'var(--teal-ink)' }}>{fmt(om.reduce((t, m) => t + m.open, 0))}</b></div>
              </div>}</> })()}
          </section>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <section className={c('card')}>
              <div className={c('dcard-h')}><h2>Orders in progress</h2><button className={c('linkish')} style={{ minWidth: 0 }} onClick={() => { setFilter('all'); go('orders') }}>All orders</button></div>
              {open.length === 0 && <p className={c('meta')} style={{ padding: '0 18px 16px', margin: 0 }}>Nothing in progress. <button className={c('linkish')} style={{ minWidth: 0, display: 'inline' }} onClick={() => newOrder()}>Place an order</button></p>}
              {open.map(o => <button key={o.key} className={c('li btnrow')} style={{ borderTop: '1px solid var(--line-2)' }} onClick={() => { setFilter('all'); setOpenRow(o.key); go('orders') }}>
                <div className={c('grow')}><p className={c('name')}>{o.label} {chip(o)}</p><p className={c('meta')}>Placed {shortDate(o.date)}{o.wanted ? <> · <b style={{ color: 'var(--ink)', fontWeight: 600 }}>Requested delivery {niceDate(o.wanted)}</b></> : ' · no date requested'}</p></div>
                <div className={c('r')}><b className={c('num')}>{o.amount != null ? money(o.amount) : ''}</b><p className={c('meta')}>{fmt(o.lines.reduce((a, l) => a + (l.lbs ?? 0), 0))} lbs</p></div></button>)}
            </section>
            {yToDo.length > 0 && <section className={c('card')}>
              <div className={c('dcard-h')}><h2>Report Yields</h2><button className={c('linkish')} style={{ minWidth: 0 }} onClick={() => go('yields')}>All</button></div>
              {yToDo.slice(0, 4).map(({ o, rep }) => <button key={o.key} className={c('li btnrow')} style={{ borderTop: '1px solid var(--line-2)' }} onClick={() => openYield(o.order!.id)}>
                <div className={c('grow')}><p className={c('name')}>{o.label} {rep?.savedAt ? <span className={c('chip c-wait')}>Draft</span> : null}</p><p className={c('meta')}>Shipped {shortDate(o.date)} · {plural(new Set(o.order!.order_lines.map(l => l.strain)).size, 'strain')}</p></div>
                <span className={c('pillbtn')}>{rep?.savedAt ? 'Finish' : 'Report'}</span></button>)}
            </section>}
            {hs.length > 0 && <section className={c('card')} style={{ background: 'var(--gold-bg)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className={c('row')} style={{ justifyContent: 'space-between' }}><h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Sample Holds for You</h2><button className={c('pillbtn')} style={{ border: 0, background: '#fff', color: 'var(--gold)' }} onClick={() => go('holds')}>Review</button></div>
              {hs.map(h => { const dl = daysUntil(h.until); return <div key={h.line_id} className={c('row')} style={{ fontSize: 14, gap: 8 }}><span className={c('grow')}>{h.strain} {yrTag(h.crop_year)}</span><b style={{ width: 70, textAlign: 'right' }}>{fmt(holdLbs(h))} lbs</b>
                <span style={{ width: 100, textAlign: 'right', fontWeight: 600, color: h.state !== 'active' ? 'var(--blue)' : dl <= 3 ? 'var(--red)' : 'var(--gold)' }}>{h.state !== 'active' ? 'Waiting' : `${plural(dl, 'day')} left`}</span></div> })}
            </section>}
          </div>
        </div>
      </div>
    )
  }

  // ---------- help & feedback: a note to Lifted (not a ticket; Sales sees them in Sales > Customer feedback) ----------
  const [fb, setFb] = useState<{ kind: 'problem' | 'question' | 'idea'; text: string; sent: boolean } | null>(null)
  // on desktop the ribbon lines up with the edges of whatever is on the screen above it (tables, cards), not the window
  const hbRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const bar = hbRef.current; const scr = bar?.previousElementSibling as HTMLElement | null
    if (!bar || !scr) return
    const fit = () => {
      if (!desk) { bar.style.marginLeft = ''; bar.style.width = ''; return }
      let l = Infinity, r = -Infinity
      for (const el of Array.from(scr.children) as HTMLElement[]) {
        const b = el.getBoundingClientRect(); if (b.width < 1 || b.height < 1) continue
        l = Math.min(l, b.left); r = Math.max(r, b.right)
      }
      if (!isFinite(l)) { bar.style.marginLeft = ''; bar.style.width = ''; return }
      const col = bar.parentElement!; const cb = col.getBoundingClientRect(); const pad = parseFloat(getComputedStyle(col).paddingLeft) || 0
      bar.style.marginLeft = `${Math.round(l - cb.left - pad)}px`; bar.style.width = `${Math.round(r - l)}px`
    }
    fit()
    const ro = new ResizeObserver(fit); ro.observe(scr); ro.observe(bar.parentElement!); for (const el of Array.from(scr.children)) ro.observe(el)
    return () => ro.disconnect()
  })
  const helpButton = () => <div ref={hbRef} className={c('helpbar')}>
    <span>Something not working, or have a question or idea?</span>
    <button className={c('btn ghost helpbtn')} onClick={() => setFb({ kind: 'problem', text: '', sent: false })}>{I.chat} Help &amp; feedback</button></div>
  async function sendFeedback() {
    if (!fb || !fb.text.trim()) return
    const device = `${desk ? 'Desktop' : 'Phone'} · ${navigator.userAgent.slice(0, 160)}`
    const ok = await run(async () => { const r = await backend.client()?.rpc('send_portal_feedback', { p_kind: fb.kind, p_message: fb.text.trim(), p_screen: screen, p_device: device })
      if (r?.error) throw new Error(r.error.message); return true })
    if (ok) setFb({ ...fb, sent: true })
  }
  function feedbackSheet() {
    if (!fb) return null
    const kinds: [typeof fb.kind, string][] = [['problem', "Something's not working"], ['question', 'A question'], ['idea', 'An idea']]
    return <><div className={c('scrim')} onClick={() => setFb(null)} />
      <div className={c('sheet')} role="dialog" aria-modal="true" aria-labelledby="cp-fb-t">
        {fb.sent ? <>
          <h2 id="cp-fb-t" style={{ margin: 0, fontSize: 22 }}>Thanks, we got it</h2>
          <p className={c('meta')} style={{ fontSize: 15, margin: 0 }}>Your note went straight to the Lifted team. If it needs an answer, we'll reach out to {me.email}.</p>
          <button className={c('btn full')} onClick={() => setFb(null)}>Done</button></>
        : <>
          <div className={c('row')} style={{ justifyContent: 'space-between' }}><h2 id="cp-fb-t" style={{ margin: 0, fontSize: 22 }}>Help &amp; feedback</h2>
            <button className={c('iconbtn')} style={{ color: 'var(--ink)', borderColor: 'var(--line)' }} onClick={() => setFb(null)} aria-label="Close">{I.close}</button></div>
          <p className={c('meta')} style={{ fontSize: 15, margin: 0 }}>Tell us what's going on. It goes straight to your Lifted team.</p>
          <div className={c('filters')} role="radiogroup" aria-label="What is it?">{kinds.map(([k, l]) => <button key={k} role="radio" aria-checked={fb.kind === k} aria-pressed={fb.kind === k} onClick={() => setFb({ ...fb, kind: k })}>{l}</button>)}</div>
          <label className={c('field')}>{fb.kind === 'problem' ? 'What happened?' : fb.kind === 'question' ? 'Your question' : 'Your idea'}
            <textarea className={c('fbtext')} rows={5} maxLength={5000} autoFocus value={fb.text} onChange={e => setFb({ ...fb, text: e.target.value })}
              placeholder={fb.kind === 'problem' ? 'What were you trying to do, and what went wrong?' : fb.kind === 'question' ? 'Ask us anything about the portal, your orders or reserves' : 'What would make the portal better for you?'} /></label>
          <p className={c('meta')} style={{ margin: 0, fontSize: 13 }}>We'll see your name, which screen you were on, and whether you're on a phone or computer.</p>
          <div className={c('row')} style={{ gap: 10 }}><button className={c('btn ghost')} style={{ flex: 1 }} onClick={() => setFb(null)}>Cancel</button>
            <button className={c('btn')} style={{ flex: 1.4 }} disabled={busy || !fb.text.trim()} onClick={sendFeedback}>{busy ? 'Sending…' : 'Send to Lifted'}</button></div></>}
      </div></>
  }

  // the +/− step chooser (Reserves & Menu and the desktop order screen share it)
  function stepSet() {
    return <div className={c('stepset')} role="group" aria-label="How much + and − move">
              <span>+/− step</span>{STEPS.map(([n, t]) => <button key={n} aria-pressed={rmStep === n && !stepCustom} title={t} onClick={() => { setStepCustom(false); setRmStep(n) }}>{n}</button>)}
              {stepCustom || !STEPS.some(([n]) => n === rmStep)
                ? <input className={c('stepin')} type="text" inputMode="numeric" aria-label="Custom step, lbs" autoFocus={stepCustom} value={stepTxt ?? String(rmStep)}
                    onChange={e => { const t = e.target.value.replace(/[^0-9]/g, '').slice(0, 5); setStepTxt(t); if (Number(t) >= 10) setRmStep(Math.round(Number(t) / 10) * 10) }}
                    onBlur={() => { setStepTxt(null); setStepCustom(false) }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                : <button onClick={() => { setStepCustom(true); setStepTxt('') }}>Custom</button>}<span>lbs</span></div>
  }

  // desktop: Contract Reserves + Open Menu + Edit Reserves on one table; edits happen in the row
  function ResMenuScreen() {
    const ql = q.toLowerCase()
    const keys = [...new Set([...reserves.map(r => r.k), ...menuItems.filter(m => m.open > 0 || m.hold > 0).map(m => m.k)])]
    const all = keys.map(k => { const r = resRow(k), m = menuRow(k); return { k, s: r?.s ?? m!.s, y: r?.y ?? m!.y, r, m, t: editNew.find(x => x.k === k) } })
      .sort((a, b) => a.s.localeCompare(b.s) || b.y - a.y)
    const years = [...new Set(all.map(x => x.y))].sort((a, b) => b - a)
    const list = sortRows('rm', all.filter(x => (!ql || x.s.toLowerCase().includes(ql)) && (menuYear === 'all' || x.y === menuYear) && (gradeF === 'all' || tagOf(x.s).g === gradeF)
      && (rmRes === 'all' || (rmRes === 'res' ? !!x.r : !x.r))), { res: x => x.r?.res ?? 0, ful: x => x.r?.ful ?? 0, so: x => x.r?.so ?? 0, rem: x => x.r?.res ? x.r.rem : 0, open: x => x.m?.open ?? 0, g: x => gradeN(x.s), t: x => typeN(x.s) })
    const menuBad = editNew.some(n => n.lbs > 0 && !!newErr(n)) || reserves.some(r => !!resErr(r))
    const menuTotal = menuItems.reduce((a, m) => a + m.open, 0)
    const fb = (on: boolean, label: string, f: () => void) => <button key={label} aria-pressed={on} onClick={f}>{label}</button>
    const sum = changes.slice(0, 3).map(ch => ch.isNew ? `${ch.s}${ch.y < cy ? ` (${ch.y})` : ''} new ${fmt(ch.to)}` : `${ch.s} ${fmt(ch.from)} → ${fmt(ch.to)}`).join(' · ') + (changes.length > 3 ? ` +${changes.length - 3} more` : '')
    const bad = [...reserves.filter(r => !!resErr(r)).map(r => r.s), ...editNew.filter(n => n.lbs > 0 && !!newErr(n)).map(n => n.s)]
    return (
      <div className={c('screen rm')}>
        <header className={c('hdr')}><div className={c('row')} style={{ justifyContent: 'space-between', alignItems: 'center' }}><h1>Reserves &amp; Menu</h1>
          {!!d?.acts.length && <button className={c('pillbtn hist')} onClick={() => go('activity')}>{I.clock} Reserve history</button>}</div>
          <p className={c('sub')}>Everything on the open menu and everything you have reserved, in one place. Lifted reviews every reserve change.</p></header>
        <div className={c('kpis five')}>
          <div className={c('kpi')}><p>Reserved</p><b>{fmt(totals.res)} lbs</b></div>
          <div className={c('kpi')}><p>Fulfilled</p><b>{fmt(dt.ful)} lbs</b></div>
          <div className={c('kpi')}><p>On open SOs</p><b>{fmt(dt.so)} lbs</b></div>
          <div className={c('kpi tint')}><p>Remaining</p><b>{fmt(dt.rem)} lbs</b></div>
          <div className={c('kpi')}><p>Open menu available</p><b>{fmt(menuTotal)} lbs</b></div>
        </div>
        <section className={c('card rmcard')}>
          <div className={c('rmbar')}>
            <div className={c('filters')} role="group" aria-label="Filter strains">
              {fb(rmRes === 'all' && menuYear === 'all' && gradeF === 'all', 'All', () => { setRmRes('all'); setMenuYear('all'); setGradeF('all') })}
              {fb(rmRes === 'res', 'Reserved', () => setRmRes(rmRes === 'res' ? 'all' : 'res'))}
              {fb(rmRes === 'not', 'Not reserved', () => setRmRes(rmRes === 'not' ? 'all' : 'not'))}
              {years.map(y => fb(menuYear === y, String(y), () => setMenuYear(menuYear === y ? 'all' : y)))}
              {fb(gradeF === 'SHO', 'SHO', () => setGradeF(gradeF === 'SHO' ? 'all' : 'SHO'))}
              {fb(gradeF === 'BHO', 'BHO', () => setGradeF(gradeF === 'BHO' ? 'all' : 'BHO'))}
            </div>
            {stepSet()}
            <label className={c('search')}>{I.search}<input type="search" placeholder="Search strains" value={q} onChange={e => setQ(e.target.value)} aria-label="Search strains" /></label>
          </div>
          {/* freeze pane: the title, totals, filters and column headers stay put; only the rows scroll */}
          <div className={c('rmscroll')}><div style={{ minWidth: 990 }}>
            <div className={c('rmt head')}>{sh('rm', 's', 'Strain')}{sh('rm', 'g', 'Grade')}{sh('rm', 't', 'Type')}{sh('rm', 'res', 'Reserved')}{sh('rm', 'ful', 'Fulfilled')}{sh('rm', 'so', 'Open SO')}{sh('rm', 'rem', 'Remaining')}{sh('rm', 'open', <>Open menu<br />available</>)}<span>Change reserve</span></div>
            {list.length === 0 && <p className={c('meta')} style={{ padding: 18, margin: 0 }}>Nothing matches.</p>}
            {list.map(x => {
              const { k, r, m, t } = x, open = m?.open ?? 0
              const hold = m && m.hold > 0 ? <span className={c('chip c-wait')}>{fmt(m.hold)} held for you</span> : null
              if (r) {
                const v = ed[k] ?? 0, base = r.asked ?? r.res, delta = v - base, changed = delta !== 0, e = resErr(r)
                const newRem = Math.max(v - r.ful - r.so, 0)
                return <div key={k} className={c(`rmt ${changed ? (e ? 'bad' : 'on') : ''}`)}>
                  <span className={c('rmname')}>{x.s} {yrTag(x.y)} {r.asked != null && <span className={c('chip c-wait')}>{r.res ? `Asked ${fmt(r.asked)}` : `New · asked ${fmt(r.asked)}`} · waiting</span>}{hold}{e && <span className={c('rmerr')} title={e}>{e}</span>}</span>
                  {gradeCell(x.s)}{typeCell(x.s)}
                  <span>{changed ? <><span className={c('muted')}>{fmt(base)} →</span> <b>{fmt(v)}</b></> : r.res ? fmt(r.res) : <span className={c('muted')}>–</span>}</span>
                  {r.res || r.ful || r.so ? <><span>{fmt(r.ful)}</span><span>{fmt(r.so)}</span></> : <><span className={c('muted')}>–</span><span className={c('muted')}>–</span></>}
                  <b style={changed ? { color: e ? 'var(--red)' : 'var(--teal-ink)' } : undefined}>{changed ? (e ? '–' : fmt(newRem)) : r.res ? fmt(r.rem) : <span className={c('muted')}>–</span>}</b>
                  <span className={c('muted')}>{fmt(open)}</span>
                  <span><AdjStepper val={delta} step={rmStep} min={Math.ceil(r.used / 10) * 10 - base} max={availFor(k)} bad={!!e} label={x.s} onChange={n => setRes(k, Math.max(base + n, 0))} /></span>
                </div>
              }
              const lbs = t?.lbs ?? 0, e = lbs > 0 && t ? newErr(t) : ''
              const setNew = (n: number) => { const v = Math.max(n, 0)
                if (!v) setEditNew(editNew.filter(z => z.k !== k))
                else if (t) setEditNew(editNew.map(z => z.k === k ? { ...z, lbs: v } : z))
                else setEditNew([...editNew, { k, s: x.s, y: x.y, lbs: v }]) }
              return <div key={k} className={c(`rmt ${lbs ? (e ? 'bad' : 'on') : ''}`)}>
                <span className={c('rmname')}>{x.s} {yrTag(x.y)} {lbs > 0 && <span className={c('chip c-ship')}>New</span>}{hold}{e && <span className={c('rmerr')} title={e}>{e}</span>}</span>
                {gradeCell(x.s)}{typeCell(x.s)}
                <span>{lbs ? <><span className={c('muted')}>0 →</span> <b>{fmt(lbs)}</b></> : <span className={c('muted')}>–</span>}</span>
                <span className={c('muted')}>–</span><span className={c('muted')}>–</span>
                <b style={lbs ? { color: e ? 'var(--red)' : 'var(--teal-ink)' } : undefined}>{lbs && !e ? fmt(lbs) : <span className={c('muted')}>–</span>}</b>
                <span className={c('muted')}>{fmt(open)}</span>
                <span><AdjStepper val={lbs} step={rmStep} min={0} max={availFor(k)} bad={!!e} label={x.s} onChange={setNew} /></span>
              </div>
            })}
            {list.length > 0 && <div className={c('rmt total')}><b>Total lbs</b><span /><span /><b>{fmt(totals.res)}</b><span>{fmt(dt.ful)}</span><span>{fmt(dt.so)}</span><b style={{ color: 'var(--teal-ink)' }}>{fmt(dt.rem)}</b><span className={c('muted')}>{fmt(menuTotal)}</span><span /></div>}
          </div></div>
        </section>
        <p className={c('meta')} style={{ margin: '0 4px' }}>Fulfilled = shipped. Open SO = on orders you've placed that haven't shipped. Remaining = reserved − fulfilled − open SO. Open menu available = what anyone can still reserve or order.</p>
        {(changes.length > 0 || menuBad) && <div className={c('dock white')}>
          <div className={c('grow')}><p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Reserve request · {plural(changes.length, 'change')}</p>
            <p className={c('meta')} style={{ margin: '2px 0 0' }}>{sum}{bad.length > 0 && <span style={{ color: 'var(--red)', fontWeight: 600 }}>{sum ? ' · ' : ''}{bad.join(', ')}: fix the red line</span>}</p></div>
          <button className={c('btn ghost')} onClick={clearEdit}>Cancel</button>
          <button className={c('btn')} disabled={!changes.length || menuBad} onClick={() => { setReviewFrom('menu'); go('reqReview') }}>{menuBad ? 'Fix the red lines' : 'Review changes'}</button>
        </div>}
      </div>
    )
  }

  function sidebar() {
    const nav: [Screen, string, boolean][] = [['home', 'Home', true], ['resmenu', 'Reserves & Menu', contract], ['yields', 'Yields', !!d?.yields], ['holds', 'Sample Holds', liveHolds.length > 0], ['orders', 'Orders & Statement', true], ['contract', 'My Contract', contract], ['activity', 'Reserve History', contract && !!d?.acts.length]]
    const group: Partial<Record<Screen, Screen>> = { edit: 'resmenu', reserves: 'resmenu', reqReview: 'resmenu', sent: 'resmenu', order: 'order', review: 'order', ordered: 'order', yield: 'yields', ysent: 'yields' }
    const on = group[screen] ?? screen
    return (
      <aside className={c('side')}>
        <a className={c('logolink')} href="https://www.liftedfarms.com" target="_blank" rel="noopener noreferrer" aria-label="Lifted website (opens in a new tab)"><img className={c('logo')} src="/logo-dark.svg" alt="Lifted" /></a>
        <nav aria-label="Portal">{nav.filter(n => n[2]).map(([s0, label]) => <button key={s0} className={c(`nav ${on === s0 ? 'on' : ''}`)} aria-current={on === s0 ? 'page' : undefined} onClick={() => { if (s0 === 'orders') setFilter('all'); go(s0) }}>
          {label}{s0 === 'holds' && <span className={c('chip c-wait')}>{liveHolds.length}</span>}{s0 === 'yields' && yToDo.length > 0 && <span className={c('chip c-wait')}>{yToDo.length}</span>}</button>)}</nav>
        <button className={c(`btn full ${on === 'order' ? 'on' : ''}`)} style={{ marginTop: 18 }} onClick={() => on === 'order' ? undefined : newOrder()}>Place an order</button>
        <div className={c('side-acct')}>
          <p style={{ margin: 0, color: '#fff', fontWeight: 600 }}>{me.display_name ?? me.customer_name}</p>
          <p style={{ margin: '2px 0 10px', wordBreak: 'break-all' }}>{me.email}</p>
          <button className={c('linkish')} style={{ minWidth: 0, textAlign: 'left', color: 'var(--mint)' }} onClick={() => setAcct(true)}>Account &amp; sign out</button>
        </div>
      </aside>
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

  // ---------- reserve history (mockup) ----------
  const [actF, setActF] = useState<'all' | 'you' | 'lifted'>('all')
  const [actOpen, setActOpen] = useState<string[]>([])
  const actSeenKey = 'cp-act-seen'
  const latestAdjust = (d?.acts ?? []).filter(a => a.by === 'lifted' && a.kind === 'adjust').sort((a, b) => b.at.localeCompare(a.at))[0]
  const [actSeen, setActSeen] = useState(() => { try { return localStorage.getItem(actSeenKey) ?? '' } catch { return '' } })
  const showAdjustNote = !!latestAdjust && latestAdjust.id !== actSeen && (Date.now() - new Date(latestAdjust.at).getTime()) < 30 * 864e5
  const seeHistory = () => { if (latestAdjust) { setActSeen(latestAdjust.id); try { localStorage.setItem(actSeenKey, latestAdjust.id) } catch { /* private mode */ } } go('activity') }
  const adjustNote = () => showAdjustNote && latestAdjust ? <button className={c('note gold actnote')} onClick={seeHistory}>
    <b>Lifted changed {latestAdjust.lines.length === 1 ? `your ${latestAdjust.lines[0].s} reserve` : `${latestAdjust.lines.length} of your reserves`}</b> on {actDay(latestAdjust.at)}. <u>See what changed and why</u></button> : null
  function ActivityScreen() {
    const acts = [...(d?.acts ?? [])].sort((a, b) => b.at.localeCompare(a.at))
    const ql = q.toLowerCase()
    const list = acts.filter(a => (actF === 'all' || a.by === actF) && (!ql || a.lines.some(l => l.s.toLowerCase().includes(ql))))
    const months: [string, Act[]][] = []
    for (const a of list) { const m = new Date(a.at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), g = months.find(x => x[0] === m); if (g) g[1].push(a); else months.push([m, [a]]) }
    const sign = (n: number) => n === 0 ? '0' : (n > 0 ? '+' : '−') + fmt(Math.abs(n))
    const title = (a: Act) => a.kind === 'rejected' ? 'Rejected at delivery: back on your reserve' : a.kind === 'setup' ? `Lifted set up your ${a.lines[0]?.y ?? cy} reserves`
      : a.kind === 'adjust' ? `Lifted changed ${a.lines.length === 1 ? 'your reserve' : `${a.lines.length} of your reserves`}`
      : a.fromHold ? 'You asked to reserve a sample hold' : `You asked to change ${plural(a.lines.length, 'reserve')}`
    const chip = (a: Act) => a.kind === 'rejected' ? <span className={c('chip c-ok')}>Back on reserve</span> : a.kind !== 'request' ? <span className={c('chip c-lifted')}>{a.kind === 'setup' ? 'Contract set up' : 'Changed by Lifted'}</span>
      : a.status === 'waiting' ? <span className={c('chip c-wait')}>Waiting on Lifted</span> : a.status === 'approved' ? <span className={c('chip c-ok')}>Approved</span>
      : a.status === 'partly' ? <span className={c('chip c-part')}>Partly approved</span> : a.status === 'declined' ? <span className={c('chip c-no')}>Not approved</span> : <span className={c('chip')}>Cancelled</span>
    const entry = (a: Act) => {
      const many = a.lines.length > 6, open = actOpen.includes(a.id), lines = many && !open ? a.lines.slice(0, 5) : a.lines
      const req = a.kind === 'request'
      const afterOf = (l: ActLine) => !req ? l.to : l.after !== undefined ? (l.after == null ? null : Number(l.after)) : a.status === 'approved' ? l.to : a.status === 'partly' ? (l.ok ?? l.to) : a.status === 'waiting' ? null : l.from
      const more = many && <button className={c('linkish act-more')} onClick={() => setActOpen(open ? actOpen.filter(x => x !== a.id) : [...actOpen, a.id])}>{open ? 'Show less' : `Show all ${a.lines.length} strains`}</button>
      const decided = req && a.decidedAt ? <>{chip(a)} {actDay(a.decidedAt)}{a.decidedBy ? ` by ${a.decidedBy}` : ''}{a.reply ? <> · “{a.reply}”</> : ''}</> : null
      const noteLbl = a.by === 'you' ? 'Your note' : a.kind === 'adjust' ? 'Why' : 'Note'
      return <section key={a.id} className={c('card act')}>
        <div className={c('act-h')}>
          <span className={c(`act-dot ${a.by}`)} aria-hidden="true">{a.by === 'lifted' ? <img src="/logo-dark.svg" alt="" /> : I.user}</span>
          <div className={c('grow')}><p className={c('name')}>{title(a)}</p>
            <p className={c('meta')} style={{ margin: '2px 0 0' }}>{actWhen(a.at)} · {a.who}</p></div>
          {chip(a)}
        </div>
        {a.kind === 'rejected' ? <>
          <div className={c('actt head nr')}><span>Strain</span><span></span><span></span><span>Back on reserve</span></div>
          {lines.map(l => <div key={l.s + l.y} className={c('actt nr')}><span className={c('rmname')}>{l.s} {yrTag(l.y)}</span><span></span><span></span><span className={c('up')}>+{fmt(l.to)}</span></div>)}
        </> : <>
        <div className={c(`actt head ${req ? '' : 'nr'}`)}><span>Strain</span><span>Before</span>{req && <span>Asked for</span>}<span>After</span><span>Change</span></div>
        {lines.map(l => {
          const after = afterOf(l)
          return <div key={l.s + l.y} className={c(`actt ${req ? '' : 'nr'}`)}>
            <span className={c('rmname')}>{l.s} {yrTag(l.y)}</span>
            <span className={c('muted')}>{fmt(l.from)}</span>
            {req && <span>{fmt(l.to)}</span>}
            <b>{after == null ? <span className={c('muted')} style={{ fontWeight: 500 }}>waiting</span> : fmt(after)}</b>
            <span className={c(after == null || after === l.from ? 'muted' : after > l.from ? 'up' : 'down')}>{after == null ? '–' : sign(after - l.from)}</span>
          </div>
        })}
        </>}
        {more}
        {(a.note || decided) && <div className={c(`act-notes ${a.by === 'lifted' && a.kind === 'adjust' ? 'gold' : ''}`)}>
          {a.note && <p><span className={c('meta')} style={{ display: 'inline' }}>{noteLbl}: </span>{a.note}</p>}
          {decided && <p className={c(`act-reply ${a.status}`)}>{decided}</p>}
        </div>}
      </section>
    }
    const fb = (id: typeof actF, label: string) => <button key={id} aria-pressed={actF === id} onClick={() => setActF(id)}>{label}</button>
    return (
      <div className={c('screen act-screen')}>
        <header className={c('hdr')}>{back(desk ? 'resmenu' : 'reserves', desk ? 'Reserves & Menu' : 'Contract Reserves')}<h1>Reserve History</h1>
          <p className={c('sub')}>Every change to your contract reserves: the ones you asked for, and any Lifted had to make.</p></header>
        <main className={c('main')}>
          <div className={c('rmbar act-bar')}>
            <div className={c('filters')} role="group" aria-label="Show">{fb('all', 'All')}{fb('you', 'Your requests')}{fb('lifted', 'Changes by Lifted')}</div>
            <label className={c('search')}>{I.search}<input type="search" placeholder="Search strains" value={q} onChange={e => setQ(e.target.value)} aria-label="Search strains" /></label>
          </div>
          {list.length === 0 && <p className={c('loading')}>Nothing here yet.</p>}
          {months.map(([m, as]) => <Fragment key={m}><p className={c('act-month')}>{m}</p>{as.map(entry)}</Fragment>)}
        </main>
      </div>
    )
  }

  function ReservesScreen() {
    return (
      <div className={c('screen')}>
        <header className={c('hdr')}>{back('home', 'Home')}<h1>Contract Reserves</h1><p className={c('sub')}>{fmt(totals.left)} of {fmt(totals.res)} lbs left to pick up</p>
          {!!d?.acts.length && <button className={c('pillbtn hist')} onClick={() => go('activity')}>{I.clock} Reserve history</button>}</header>
        <main className={c('main')}>
          <section className={c('card')}>
            <div className={c('tbl head')}><span>Strain</span><span>Reserved</span><span>Picked up</span><span>Left</span></div>
            {reserves.length === 0 && <p className={c('meta')} style={{ padding: 16 }}>No reserves yet. Add strains from the open menu.</p>}
            {reserves.map(r => <div key={r.k} style={{ borderBottom: '1px solid var(--line-2)' }}>
              <div className={c('tbl')} style={{ border: 0 }}><span style={{ fontWeight: 600 }}>{r.s} {tagPill(r.s)} {yrTag(r.y)}</span><span>{r.res ? fmt(r.res) : '–'}</span><span style={{ color: 'var(--muted)' }}>{fmt(r.used)}</span><b>{fmt(r.left)}</b></div>
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
        </main>
        <div className={c('dock white')}><button className={c('btn ghost')} style={{ flex: 1 }} onClick={cancel}>Cancel</button>
          <button className={c('btn')} style={{ flex: 2 }} disabled={busy || !changes.length || anyResErr} onClick={() => { setReviewFrom('edit'); go('reqReview') }}>{anyResErr ? 'Fix the red lines' : changes.length ? 'Review changes' : 'No changes yet'}</button></div>
      </div>
    )
  }

  // desktop request table: reserve and remaining, before and after, for each change
  type ReqRow = { ch: Change; remB: number; remA: number }
  function reqRows(chs: Change[]): ReqRow[] {
    return [...chs].sort((a, b) => a.s.localeCompare(b.s) || b.y - a.y).map(ch => { const r = resRow(kOf(ch.s, ch.y)), used = (r?.ful ?? 0) + (r?.so ?? 0)
      return { ch, remB: r?.res ? r.rem : 0, remA: Math.max(ch.to - used, 0) } })
  }
  function reqTable(rowsR: ReqRow[]) {
    const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n))
    const tot = rowsR.reduce((a, x) => ({ rb: a.rb + x.ch.from, ra: a.ra + x.ch.to, mb: a.mb + x.remB, ma: a.ma + x.remA }), { rb: 0, ra: 0, mb: 0, ma: 0 })
    const delta = (n: number) => n ? <small style={{ color: n > 0 ? 'var(--teal-ink)' : 'var(--red)' }}> ({sign(n)})</small> : null
    return <section className={c('card')}>
      <div className={c('rvt head')}><span>Strain</span><span>Reserve before</span><span>Reserve after</span><span>Remaining before</span><span>Remaining after</span></div>
      {rowsR.map(({ ch, remB, remA }) => <div key={ch.s + ch.y} className={c('rvt')}>
        <span className={c('rmname')}>{ch.s} {yrTag(ch.y)} {ch.isNew && <span className={c('chip c-ship')}>New</span>}</span>
        <span className={c('muted')}>{fmt(ch.from)}</span><span><b>{fmt(ch.to)}</b>{delta(ch.to - ch.from)}</span>
        <span className={c('muted')}>{fmt(remB)}</span><span><b>{fmt(remA)}</b>{delta(remA - remB)}</span></div>)}
      <div className={c('rvt total')}><b>Total · {plural(rowsR.length, 'strain')}</b><span>{fmt(tot.rb)}</span><span><b>{fmt(tot.ra)}</b>{delta(tot.ra - tot.rb)}</span><span>{fmt(tot.mb)}</span><span><b>{fmt(tot.ma)}</b>{delta(tot.ma - tot.mb)}</span></div>
    </section>
  }

  function ReqReviewScreen() {
    const backTo: Screen = reviewFrom
    if (!changes.length) return <div className={c('screen')}><header className={c('hdr')}>{back(backTo, 'Keep editing')}<h1>Review your request</h1></header><p className={c('loading')}>No changes yet.</p></div>
    const net = changes.reduce((a, ch) => a + ch.to - ch.from, 0), sorted = [...changes].sort((a, b) => a.s.localeCompare(b.s) || b.y - a.y)
    const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n))
    return (
      <div className={c('screen')}>
        <header className={c('hdr')}>{back(backTo, 'Keep editing')}<h1>Review your request</h1><p className={c('sub')}>Nothing is sent until you tap Send request.</p></header>
        <main className={c('main')}>
          {desk ? reqTable(reqRows(changes)) : <section className={c('card')}>
            {sorted.map(ch => <div key={ch.s + ch.y} className={c('li')} style={{ alignItems: 'flex-start' }}><div className={c('grow')}><p className={c('name')}>{ch.s} {yrTag(ch.y)} {ch.isNew && <span className={c('chip c-ship')}>New</span>}</p>
              <p className={c('meta num')}>{ch.isNew ? `Reserve ${fmt(ch.to)} lbs` : `${fmt(ch.from)} → ${fmt(ch.to)} lbs`}</p></div>
              <b className={c('num')} style={{ color: ch.to >= ch.from ? 'var(--teal-ink)' : 'var(--red)' }}>{sign(ch.to - ch.from)} lbs</b></div>)}
            <div className={c('li')} style={{ background: '#f7f9f6', alignItems: 'flex-start' }}><div className={c('grow')}><b>Total change</b>
              <p className={c('meta')}>{plural(changes.length, 'strain')} · reserves go from {fmt(totals.res)} to {fmt(totals.res + net)} lbs</p></div>
              <b className={c('num')} style={{ fontSize: 18 }}>{sign(net)} lbs</b></div>
          </section>}
          <label className={c('field')}>Note to Lifted (optional)<input type="text" value={reqNote} onChange={e => setReqNote(e.target.value)} /></label>
          <div className={c('note gold')}>Lifted reviews each change and we'll email you when it's decided. Until then they show as <b>waiting</b>, and the lbs stay open on the menu for everyone.</div>
        </main>
        <div className={c('dock white')}><button className={c('btn ghost')} style={{ flex: 1 }} onClick={() => go(backTo)}>Keep editing</button>
          <button className={c('btn')} style={{ flex: 1.4 }} disabled={busy || sendErr} onClick={sendReq}>{busy ? 'Sending…' : 'Send request'}</button></div>
      </div>
    )
  }

  // done screens (order sent, request sent, yields sent): buttons right under the summary, Back to Home on the left
  const doneBtns = (label: string, onClick: () => void) => <div className={c('donebtns')}>
    <button className={c('btn ghost')} onClick={() => go('home')}>Back to Home</button><button className={c('btn')} onClick={onClick}>{label}</button></div>
  function SentScreen() {
    const r = lastReq
    return (
      <div className={c('screen')}>
        <header className={c('hdr done-hdr')}><span className={c('check')}>{I.check}</span><h1 style={{ marginTop: 6 }}>Request sent</h1>
          <p className={c('sub')} style={{ fontSize: 15 }}>{plural(r.length, desk ? 'change' : 'reserve change')} sent to Lifted for review. We'll email you when Lifted approves them.</p></header>
        <main className={c('main')}>
          {desk ? <>{reqTable(lastReqRows)}{lastReqNote && <section className={c('card')} style={{ padding: '12px 16px', fontSize: 14 }}><span className={c('meta')} style={{ display: 'inline' }}>Note</span> {lastReqNote}</section>}</>
          : <section className={c('card')}>{r.map(ch => <div key={ch.s + ch.y} className={c('li')}><div className={c('grow')}><p className={c('name')}>{ch.s} {yrTag(ch.y)}</p>
            <p className={c('meta')} style={ch.isNew ? { color: 'var(--teal-ink)' } : undefined}>{ch.isNew ? 'New strain' : `${fmt(ch.from)} → ${fmt(ch.to)} lbs`}</p></div>
            <b className={c('num')}>{ch.isNew ? `${fmt(ch.to)} lbs` : `${ch.to > ch.from ? '+' : '−'}${fmt(Math.abs(ch.to - ch.from))} lbs`}</b></div>)}</section>}
          {doneBtns('View my reserves', () => go('reserves'))}
          <div className={c('note gold')}>Until Lifted approves, these show as <b>waiting</b> on your Contract Reserves, and the lbs stay open on the menu for everyone.</div>
        </main>
      </div>
    )
  }

  function MenuScreen() {
    const ql = q.toLowerCase()
    const shown = menuItems.filter(m => m.open > 0 || (contract && !!resRow(m.k)))
    const list = shown.filter(m => (!ql || m.s.toLowerCase().includes(ql)) && (menuYear === 'all' || m.y === menuYear) && (gradeF === 'all' || tagOf(m.s).g === gradeF) && (!notRes || !resRow(m.k))).sort((a, b) => a.s.localeCompare(b.s) || b.y - a.y)
    const total = menuItems.reduce((a, m) => a + m.open, 0)
    const years = [...new Set(shown.map(m => m.y))].sort((a, b) => b - a)
    // strains just picked with no lbs yet aren't errors here (their red line only shows once a number is typed)
    const menuBad = editNew.some(n => n.lbs > 0 && !!newErr(n)) || reserves.some(r => !!resErr(r))
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
          {<div className={c('filters')} role="group" aria-label="Filter the menu">
            <button aria-pressed={menuYear === 'all' && !notRes && gradeF === 'all'} onClick={() => { setMenuYear('all'); setNotRes(false); setGradeF('all') }}>All</button>
            {years.length > 1 && years.map(y => <button key={y} aria-pressed={menuYear === y} onClick={() => setMenuYear(menuYear === y ? 'all' : y)}>{y}</button>)}
            {contract && <button aria-pressed={notRes} onClick={() => setNotRes(!notRes)}>Not reserved</button>}
            <button aria-pressed={gradeF === 'SHO'} onClick={() => setGradeF(gradeF === 'SHO' ? 'all' : 'SHO')}>SHO</button>
            <button aria-pressed={gradeF === 'BHO'} onClick={() => setGradeF(gradeF === 'BHO' ? 'all' : 'BHO')}>BHO</button></div>}
          <section className={c('card')}>
            <div className={c(`mg mg-head ${contract ? '' : 'nc'}`)}><span>Strain</span><span className={c('mg-a')}>Available<span className={c('meta')} style={{ display: 'block', fontSize: 11, margin: 0 }}>lbs</span></span>{contract && <span style={{ textAlign: 'right' }}>Your reserve</span>}</div>
            {list.length === 0 && <p className={c('meta')} style={{ padding: 14 }}>{menuItems.length ? 'Nothing matches.' : 'Nothing on the menu right now.'}</p>}
            {list.map(m => {
              const nameCell = <div style={{ minWidth: 0 }}><p className={c('name')}>{m.s} {tagPill(m.s)}</p>{m.y < cy && <p className={c('meta')} style={{ margin: '1px 0 0' }}><span className={c('yr old')} style={{ fontSize: 12 }}>{m.y} crop</span></p>}</div>
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
        {contract ? ((changes.length > 0 || menuBad) ? <div className={c('dock white')}><button className={c('btn ghost')} style={{ flex: 1 }} onClick={clearEdit}>Cancel</button>
          <button className={c('btn')} style={{ flex: 2 }} disabled={!changes.length || anyResErr} onClick={() => { setReviewFrom('menu'); go('reqReview') }}>{menuBad ? 'Fix the red lines' : changes.length && !anyResErr ? 'Review changes' : 'Set the lbs'}</button></div> : null)
          : <div className={c('dock')}><button className={c('btn full')} onClick={() => newOrder()}>Place an order</button></div>}
      </div>
    )
  }

  function orderLineEl(l: OLine) {
    const picked = l.k in ord, qv = ord[l.k] ?? 0, sp = lineSplit(l, qv)
    const sub = l.resLeft ? <>{fmt(l.resLeft)} reserve + {fmt(l.open)} open</> : l.hold ? <span style={{ color: 'var(--gold)' }}>incl. {fmt(l.hold)} held for you</span> : null
    const unpick = () => { const o = { ...ord }; delete o[l.k]; setOrd(o); const s = { ...smp }; delete s[l.k]; setSmp(s); const h = { ...holdAsk }; delete h[l.k]; setHoldAsk(h) }
    const head = <div className={c('mg')}>
      <div style={{ minWidth: 0 }}><p className={c('name')}>{l.s} {tagPill(l.s)}</p>{(l.y < cy || sub) && <p className={c('meta')} style={{ margin: '1px 0 0' }}>{l.y < cy && <span className={c('yr old')} style={{ fontSize: 12 }}>{l.y} crop</span>}{l.y < cy && sub ? ' · ' : ''}{sub}</p>}<p className={c('meta')} style={{ margin: '1px 0 0', fontSize: 12 }}>{lastOrdTxt(l.s)}</p></div>
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
        <div className={c('row')} style={{ justifyContent: 'space-between' }}><h2 id="cp-cal-t" style={{ margin: 0, fontSize: 20 }}>Requested Delivery Date</h2>
          <button className={c('iconbtn')} style={{ color: 'var(--ink)', borderColor: 'var(--line)' }} onClick={() => setCal(null)} aria-label="Close">{I.close}</button></div>
        <div className={c('row')} style={{ justifyContent: 'space-between' }}><button className={c('calnav')} onClick={() => nav(-1)} disabled={!canPrev} aria-label="Previous month">{I.back}</button>
          <b style={{ fontSize: 16 }}>{first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</b>
          <button className={c('calnav')} onClick={() => nav(1)} aria-label="Next month" style={{ transform: 'scaleX(-1)' }}>{I.back}</button></div>
        <div className={c('cal')}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x, i) => <span key={i} className={c('dow')}>{x}</span>)}
          {Array.from({ length: lead }, (_, i) => <span key={'l' + i} />)}
          {Array.from({ length: days }, (_, i) => {
            const dt = new Date(y, m, i + 1), v = iso(dt), past = dt < t0, sel = wanted === v, isToday = v === iso(t0)
            return <button key={v} type="button" className={c(`day ${sel ? 'sel' : ''} ${isToday ? 'today' : ''}`)} disabled={past} aria-pressed={sel} onClick={() => { setWanted(v); setCal(null) }}
              aria-label={dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}>{i + 1}</button>
          })}</div>
        {wanted && <div className={c('row')}><button className={c('btn ghost')} style={{ flex: 1 }} onClick={() => { setWanted(''); setCal(null) }}>Clear date</button></div>}
      </div></>
  }

  // desktop order: same columns as Reserves & Menu; reserves, open menu and samples in their own sections
  function DeskOrderScreen() {
    const oq = orderQ.toLowerCase()
    const show = (l: OLine) => (!oq || l.s.toLowerCase().includes(oq) || l.k in ord) && (menuYear === 'all' || l.y === menuYear)
    const years = [...new Set(allLines.map(l => l.y))].sort((a, b) => b - a)
    const rg = (l: OLine) => resRow(l.k)
    const resd = sortRows('ores', orderable.resd.filter(show), { g: l => gradeN(l.s), t: l => typeN(l.s), res: l => rg(l)?.res ?? 0, ful: l => rg(l)?.ful ?? 0, so: l => rg(l)?.so ?? 0, rem: l => rg(l)?.rem ?? 0, open: l => l.open })
    const others = sortRows('oom', orderable.others.filter(show), { open: l => l.open, g: l => gradeN(l.s), t: l => typeN(l.s) })
    const clearLine = (k: string) => { const o = { ...ord }; delete o[k]; setOrd(o); const s0 = { ...smp }; delete s0[k]; setSmp(s0); const h = { ...holdAsk }; delete h[k]; setHoldAsk(h) }
    const setQ0 = (k: string, n: number) => { if (n > 0) setOrd({ ...ord, [k]: n }); else clearLine(k) }
    const money0 = (l: OLine, qv: number) => { const p0 = priceOf(l.y, l.s); return qv > 0 && p0 != null ? money(qv * p0) : '' }
    const label = oTot.bad ? 'Fix the red lines' : editing ? 'Review changes' : 'Review order'
    const head = (last: string) => <div className={c('odt head')}>{sh('ores', 's', 'Strain')}{sh('ores', 'g', 'Grade')}{sh('ores', 't', 'Type')}{sh('ores', 'res', 'Reserved')}{sh('ores', 'ful', 'Fulfilled')}{sh('ores', 'so', 'Open SO')}{sh('ores', 'rem', 'Remaining')}{sh('ores', 'open', <>Open menu<br />available</>)}<span>{last}</span><span>Amount</span></div>
    const line = (l: OLine) => {
      const r = resRow(l.k), qv = ord[l.k] ?? 0, sp = lineSplit(l, qv), isSmp = !!smp[l.k], e = qv && !isSmp ? lineError(l, qv) : ''
      const split = qv > 0 && !e && !not10(qv) ? <>{sp.fromRes > 0 && <span className={c('chip c-res')}>{fmt(sp.fromRes)} reserve</span>}{sp.fromHold > 0 && <span className={c('chip c-wait')}>{fmt(sp.fromHold)} held</span>}{sp.fromOpen > 0 && <span className={c('chip c-open')}>{fmt(sp.fromOpen)} open menu</span>}</> : null
      return <div key={l.k} className={c(`odt ${qv && !isSmp ? (e ? 'bad' : 'on') : ''}`)}>
        <span className={c('rmname')}>{l.s} {yrTag(l.y)} {l.hold > 0 && <span className={c('chip c-wait')}>{fmt(l.hold)} held for you</span>}<span className={c('lastord')}>{lastOrdTxt(l.s)}</span>{e ? <span className={c('rmerr')} title={e}>{e}</span> : split && <span className={c('rowchips')}>{split}</span>}</span>
        {gradeCell(l.s)}{typeCell(l.s)}
        {r?.res ? <><span>{fmt(r.res)}</span><span>{fmt(r.ful)}</span><span>{fmt(r.so)}</span><b>{fmt(r.rem)}</b></> : <><span className={c('muted')}>–</span><span className={c('muted')}>–</span><span className={c('muted')}>–</span><span className={c('muted')}>–</span></>}
        <span className={c('muted')}>{fmt(l.open)}</span>
        <span>{isSmp ? <span className={c('muted')} style={{ fontSize: 13 }}>In samples ↓</span>
          : <AdjStepper plain what="to order" val={qv} step={rmStep} min={0} max={sp.max} bad={!!e} label={l.s} onChange={n => setQ0(l.k, n)} />}</span>
        <b>{isSmp ? '' : money0(l, qv)}</b>
      </div>
    }
    // open menu: available, order lbs, and (on any strain without a reserve) sample + hold right in the row
    const openLine = (l: OLine) => {
      const qv = ord[l.k] ?? 0, sp = lineSplit(l, qv), isSmp = !!smp[l.k], hq = holdAsk[l.k] ?? 0, canSmp = !l.resLeft
      const e = qv ? lineError(l, qv) || (isSmp ? holdError(l, qv, hq) : '') : ''
      const split = qv > 0 && !e ? <>{sp.fromHold > 0 && <span className={c('chip c-wait')}>{fmt(sp.fromHold)} held for you</span>}{sp.fromOpen > 0 && <span className={c('chip c-open')}>{fmt(sp.fromOpen)} from open menu</span>}</> : null
      return <div key={l.k} className={c(`oom ${qv ? (e ? 'bad' : 'on') : ''}`)}>
        <span className={c('rmname')}>{l.s} {yrTag(l.y)} {l.hold > 0 && !qv && <span className={c('chip c-wait')}>{fmt(l.hold)} held for you</span>}<span className={c('lastord')}>{lastOrdTxt(l.s)}</span>{isSmp && <span className={c('chip c-wait')}>Sample</span>}{e ? <span className={c('rmerr')} title={e}>{e}</span> : split && <span className={c('rowchips')}>{split}</span>}</span>
        {gradeCell(l.s)}{typeCell(l.s)}
        <span className={c('muted')}>{fmt(l.open)}</span>
        <span><AdjStepper plain what="to order" val={qv} step={isSmp ? 10 : rmStep} min={0} max={sp.max} bad={!!lineError(l, qv) && qv > 0} label={l.s} onChange={n => setQ0(l.k, n)} /></span>
        <span>{canSmp && <input type="checkbox" className={c('smpchk')} checked={isSmp} aria-label={`Order ${l.s} as a sample`}
          onChange={ev => { if (ev.target.checked) { setSmp({ ...smp, [l.k]: true }); if (!ord[l.k]) setOrd({ ...ord, [l.k]: 10 }) } else { const s0 = { ...smp }; delete s0[l.k]; setSmp(s0); const h = { ...holdAsk }; delete h[l.k]; setHoldAsk(h) } }} />}</span>
        <span>{isSmp ? <AdjStepper plain what="to hold" val={hq} step={rmStep} min={0} max={Math.max(sp.max - qv, 0)} bad={!!holdError(l, qv, hq)} label={`${l.s} hold`} onChange={n => setHoldAsk({ ...holdAsk, [l.k]: n })} /> : <span className={c('muted')}>–</span>}</span>
        <b>{money0(l, qv)}</b>
      </div>
    }
    const p = priceOf(cy)
    return (
      <div className={c('screen dorder')}>
        <header className={c('hdr')}><div className={c('row')} style={{ justifyContent: 'space-between' }}><h1>{editing ? `Modify ${soLabel(editing)}` : 'New order'}</h1>
          <button className={c('iconbtn')} onClick={closeOrder} aria-label="Close">{I.close}</button></div>
          <p className={c('sub')}>Fresh frozen by the lb, in steps of 10. Use + and − or type the lbs you want.{p != null ? ` Your price: $${p.toFixed(2)}/lb.` : ''}</p></header>
        <div className={c('oside2')}>
          <div className={c('olists')}>
            <section className={c('card')}>
              <div className={c('rmbar')}>
                <div className={c('filters')} role="group" aria-label="Filter by crop year">
                  <button aria-pressed={menuYear === 'all'} onClick={() => setMenuYear('all')}>All</button>
                  {years.map(y => <button key={y} aria-pressed={menuYear === y} onClick={() => setMenuYear(menuYear === y ? 'all' : y)}>{y}</button>)}
                </div>
                {stepSet()}
                <label className={c('search')}>{I.search}<input type="search" placeholder="Search strains" value={orderQ} onChange={e => setOrderQ(e.target.value)} aria-label="Search strains to order" /></label>
              </div>
            </section>
            {contract && <section className={c('card')}>
              <div className={c('dcard-h')}><h2>From your reserves</h2><span className={c('meta')} style={{ margin: 0 }}>Your reserve is used first</span></div>
              {head('Order lbs')}
              {resd.length ? resd.map(line) : <p className={c('meta')} style={{ padding: '12px 18px', margin: 0 }}>{oq ? 'No reserved strains match.' : 'No reserve left to order.'}</p>}
            </section>}
            <section className={c('card')}>
              <div className={c('dcard-h')}><h2>From the open menu</h2><span className={c('meta')} style={{ margin: 0 }}>Tick Sample to try a strain first. If you like it, we hold it for you for {d?.holdDays ?? 10} days after the sample ships.</span></div>
              <div className={c('oom head')}>{sh('oom', 's', 'Strain')}{sh('oom', 'g', 'Grade')}{sh('oom', 't', 'Type')}{sh('oom', 'open', <>Open menu<br />available</>)}<span>Order lbs</span><span>Sample</span><span>Hold if you like it</span><span>Amount</span></div>
              {others.length ? others.map(openLine) : <p className={c('meta')} style={{ padding: '12px 18px', margin: 0 }}>{oq ? 'Nothing on the open menu matches.' : 'Nothing open on the menu right now.'}</p>}
            </section>
          </div>
          {/* the order builds up here, always in view */}
          <aside className={c('opanel2')}>
            <section className={c('card')}>
              <div className={c('dcard-h')} style={{ paddingBottom: 10 }}><h2>Your order</h2><span className={c('meta')} style={{ margin: 0 }}>{plural(detail.length, 'strain')}</span></div>
              {detail.length === 0 && <p className={c('meta')} style={{ padding: '0 18px 16px', margin: 0 }}>Use + or type lbs on any strain to start your order.</p>}
              <div className={c('olines')}>
                {detail.map(x => <div key={x.k} className={c('oline')}>
                  <div className={c('row')} style={{ gap: 8 }}><span className={c('grow')} style={{ fontWeight: 600, minWidth: 0 }}>{x.s} {yrTag(x.y)} {x.sample && <span className={c('chip c-wait')}>Sample</span>}</span>
                    <span className={c('num')}>{fmt(x.q)} lbs</span>{x.price != null && <b className={c('num')} style={{ width: 78, textAlign: 'right' }}>{money(x.q * x.price)}</b>}</div>
                  {x.sample && x.hold > 0 && <p className={c('meta')} style={{ margin: '2px 0 0', fontSize: 12 }}>Hold {fmt(x.hold)} lbs if you like it</p>}
                </div>)}
              </div>
              <div style={{ padding: '14px 18px', background: '#f7f9f6', borderTop: '1px solid var(--line-2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <p className={c('num')} style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{fmt(oTot.lbs)} lbs{oTot.amount != null && oTot.lbs ? ` · ${money(oTot.amount)}` : ''}</p>
                <div className={c('field')} style={{ marginTop: 8 }}><span id="cp-wanted-l">Requested Delivery Date</span>
                  <button type="button" className={c('datebtn')} aria-labelledby="cp-wanted-l" aria-haspopup="dialog" onClick={() => { const b = wanted ? new Date(wanted + 'T12:00') : today0(); setCal({ y: b.getFullYear(), m: b.getMonth() }) }}>
                    {wanted ? niceDate(wanted) : <span style={{ color: '#8a948d' }}>Choose a delivery date</span>}{I.cal}</button></div>
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button className={c('btn full')} disabled={!oTot.lbs || oTot.bad} onClick={() => go('review')}>{label}</button>
                  {detail.length > 0 && <button className={c('linkish')} style={{ minWidth: 0, textAlign: 'center' }} onClick={() => { setOrd({}); setSmp({}); setHoldAsk({}) }}>Clear order</button>}
                </div>
              </div>
              <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid var(--line-2)' }}>
                <label className={c('field')}>Note <span className={c('meta')} style={{ marginTop: -6 }}>optional</span><input type="text" placeholder="Pickup or delivery details" value={note} onChange={e => setNote(e.target.value)} /></label>
                <label className={c('field')}>PO # <span className={c('meta')} style={{ marginTop: -6 }}>optional</span><input type="text" value={po} onChange={e => setPo(e.target.value)} /></label>
              </div>
            </section>
          </aside>
        </div>
        {calendar()}
      </div>
    )
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
        {(() => {
          const lists = <>
            {contract && <><h2 className={c('h2')} style={{ marginTop: 0 }}>From your reserves</h2>{section(orderable.resd) ?? <p className={c('meta')} style={{ margin: '0 4px' }}>No reserve left to order.</p>}
              <h2 className={c('h2')} style={{ marginTop: 10 }}>From the open menu</h2></>}
            {section(orderable.others) ?? <p className={c('meta')} style={{ margin: '0 4px' }}>Nothing open on the menu right now.</p>}</>
          const fields = <section className={c('card')} style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className={c('grid2')}><label className={c('field')}>PO # <span className={c('meta')} style={{ marginTop: -6 }}>optional</span><input type="text" value={po} onChange={e => setPo(e.target.value)} /></label>
              <div className={c('field')}><span id="cp-wanted-l">Requested Delivery Date</span><span className={c('meta')} style={{ marginTop: -6 }}>optional</span>
                <button type="button" className={c('datebtn')} aria-labelledby="cp-wanted-l" aria-haspopup="dialog" onClick={() => { const b = wanted ? new Date(wanted + 'T12:00') : today0(); setCal({ y: b.getFullYear(), m: b.getMonth() }) }}>
                  {wanted ? niceDate(wanted) : <span style={{ color: '#8a948d' }}>Choose a date</span>}{I.cal}</button></div></div>
            <label className={c('field')}>Note <span className={c('meta')} style={{ marginTop: -6 }}>optional</span><input type="text" placeholder="Pickup or delivery details" value={note} onChange={e => setNote(e.target.value)} /></label>
          </section>
          const label = oTot.bad ? 'Fix the red lines' : editing ? 'Review changes' : 'Review order'
          // desktop: the order builds up in a panel beside the lists, always in view
          if (desk) return <main className={c('main oside')}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>{lists}</div>
            <aside className={c('opanel')}>
              <section className={c('card')}>
                <div className={c('dcard-h')} style={{ paddingBottom: 8 }}><h2>Your order</h2><span className={c('meta')} style={{ margin: 0 }}>{plural(detail.length, 'strain')}</span></div>
                {detail.length === 0 && <p className={c('meta')} style={{ padding: '0 18px 14px', margin: 0 }}>Tap + Add on a strain to start your order.</p>}
                {detail.map(x => <div key={x.k} className={c('row')} style={{ padding: '8px 18px', borderTop: '1px solid var(--line-2)', fontSize: 14 }}>
                  <span className={c('grow')} style={{ fontWeight: 600 }}>{x.s} {yrTag(x.y)} {x.sample && <span className={c('chip c-wait')}>Sample</span>}</span>
                  <span className={c('num')}>{fmt(x.q)} lbs</span>{x.price != null && <b className={c('num')} style={{ width: 76, textAlign: 'right' }}>{money(x.q * x.price)}</b>}</div>)}
                <div style={{ padding: '14px 18px', background: '#f7f9f6', borderTop: '1px solid var(--line-2)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className={c('row')}><div className={c('grow')}><p className={c('num')} style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{fmt(oTot.lbs)} lbs{oTot.amount != null ? ` · ${money(oTot.amount)}` : ''}</p>
                    {contract && <p className={c('meta')} style={{ margin: 0 }}>{fmt(oTot.res)} from reserves · {fmt(oTot.open)} from open menu</p>}</div></div>
                  <button className={c('btn full')} disabled={!oTot.lbs || oTot.bad} onClick={() => go('review')}>{label}</button>
                </div>
              </section>
              {fields}
            </aside>
          </main>
          return <><main className={c('main')}>{lists}{fields}</main>
            <div className={c('dock white')}><div className={c('grow')}><p className={c('num')} style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{fmt(oTot.lbs)} lbs</p>
              <p className={c('meta')} style={{ margin: 0 }}>{contract ? `${fmt(oTot.res)} reserve · ${fmt(oTot.open)} open` : ''}{oTot.amount != null ? `${contract ? ' · ' : ''}${money(oTot.amount)}` : ''}</p></div>
              <button className={c('btn')} disabled={!oTot.lbs || oTot.bad} onClick={() => go('review')}>{label}</button></div></>
        })()}
        {calendar()}
      </div>
    )
  }

  const splitText = (x: Detail) => [x.fromRes ? `${fmt(x.fromRes)} from reserve` : '', x.fromHold ? `${fmt(x.fromHold)} held for you` : '', x.fromOpen ? `${fmt(x.fromOpen)} from open menu` : ''].filter(Boolean).join(' · ')
  const orderTable = (dt: Detail[], tot: { lbs: number; amount: number | null }) => <section className={c('card')}>
            <div className={c('ort head')}><span>Strain</span><span>Order lbs</span><span>Price</span><span>Total</span></div>
            {dt.map(x => <div key={x.k} className={c('ort')}>
              <span className={c('rmname')}>{x.s} {yrTag(x.y)} {x.sample && <span className={c('chip c-wait')}>Sample</span>}
                {x.fromRes > 0 && <span className={c('chip c-res')}>{fmt(x.fromRes)} reserve</span>}{x.fromHold > 0 && <span className={c('chip c-wait')}>{fmt(x.fromHold)} held</span>}{x.fromOpen > 0 && <span className={c('chip c-open')}>{fmt(x.fromOpen)} open menu</span>}
                {x.hold > 0 && <span className={c('muted')} style={{ fontSize: 12, fontWeight: 500 }}>hold {fmt(x.hold)} lbs if you like it</span>}</span>
              <span>{fmt(x.q)} lbs</span><span>{x.price != null ? `$${x.price.toFixed(2)}/lb` : '–'}</span><b>{x.price != null ? money(x.q * x.price) : '–'}</b></div>)}
            <div className={c('ort total')}><b>Total · {plural(dt.length, 'strain')}</b><b>{fmt(tot.lbs)} lbs</b><span /><b style={{ fontSize: 18 }}>{tot.amount != null ? money(tot.amount) : '–'}</b></div>
    </section>

  function ReviewScreen() {
    if (!detail.length) return <div className={c('screen')}><header className={c('hdr')}>{back('order', 'Keep editing')}<h1>Review your order</h1></header><p className={c('loading')}>Nothing on the order yet.</p></div>
    return (
      <div className={c('screen')}>
        <header className={c('hdr')}>{back('order', 'Keep editing')}<h1>{editing ? `Review changes to ${soLabel(editing)}` : 'Review your order'}</h1>
          <p className={c('sub')}>{editing ? 'Saving sends the updated order back to Lifted to confirm.' : 'Nothing is sent until you tap Place order.'}</p></header>
        <main className={c('main')}>
          {desk ? orderTable(detail, oTot) : <section className={c('card')}>
            {detail.map(x => <div key={x.k} className={c('li')} style={{ alignItems: 'flex-start' }}><div className={c('grow')}><p className={c('name')}>{x.s} {yrTag(x.y)} {x.sample && <span className={c('chip c-wait')}>Sample</span>}</p>
              <p className={c('meta')}>{splitText(x)}{x.hold ? ` · hold ${fmt(x.hold)} lbs if you like it` : ''}</p>
              <p className={c('meta num')}>{fmt(x.q)} lbs{x.price != null ? ` × $${x.price.toFixed(2)}/lb` : ''}</p></div>
              <b className={c('num')}>{x.price != null ? money(x.q * x.price) : `${fmt(x.q)} lbs`}</b></div>)}
            <div className={c('li')} style={{ background: '#f7f9f6', alignItems: 'flex-start' }}><div className={c('grow')}><b>Total</b>
              <p className={c('meta')}>{fmt(oTot.lbs)} lbs{contract ? ` · ${fmt(oTot.res)} from reserves · ${fmt(oTot.lbs - oTot.res)} from open menu` : ''}</p></div>
              <b className={c('num')} style={{ fontSize: 18 }}>{oTot.amount != null ? money(oTot.amount) : `${fmt(oTot.lbs)} lbs`}</b></div>
          </section>}
          {(po || wanted || note) && <section className={c('card')} style={{ padding: '12px 16px', fontSize: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {po && <span><span className={c('meta')} style={{ display: 'inline' }}>PO</span> {po}</span>}
            {wanted && <span><span className={c('meta')} style={{ display: 'inline' }}>Requested delivery</span> {niceDate(wanted)}</span>}
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
          <p className={c('sub')} style={{ fontSize: 15 }}>{o.label}{desk ? '' : ` · ${fmt(o.lbs)} lbs`}. {o.modified ? 'Lifted will confirm the changes.' : "Lifted will confirm it and let you know when it's ready."}</p></header>
        <main className={c('main')}>
          {desk ? <>{orderTable(o.detail, o)}{doneBtns('View my orders', () => { setFilter('all'); go('orders') })}
            {(o.po || o.wanted || o.note) && <section className={c('card')} style={{ padding: '12px 16px', fontSize: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {o.po && <span><span className={c('meta')} style={{ display: 'inline' }}>PO</span> {o.po}</span>}
              {o.wanted && <span><span className={c('meta')} style={{ display: 'inline' }}>Requested delivery</span> {niceDate(o.wanted)}</span>}
              {o.note && <span><span className={c('meta')} style={{ display: 'inline' }}>Note</span> {o.note}</span>}</section>}
            {o.detail.filter(x => x.hold).map(x => <div key={'h' + x.k} className={c('note gold')}><b>Sample hold:</b> we'll hold {fmt(x.hold)} lbs of {x.s} for you for <b>{d?.holdDays ?? 10} days after this order ships</b>. The hold starts once Lifted confirms the order.</div>)}</>
          : <section className={c('card')}>{o.detail.map(x => <div key={x.k} className={c('li')}><div className={c('grow')}><p className={c('name')}>{x.s} {yrTag(x.y)} {x.sample && <span className={c('chip c-wait')}>Sample</span>}</p>
            <p className={c('meta')}>{[x.fromRes ? `${fmt(x.fromRes)} reserve` : '', x.fromHold ? `${fmt(x.fromHold)} held` : '', x.fromOpen ? `${fmt(x.fromOpen)} open menu` : ''].filter(Boolean).join(' · ')}{x.hold ? ` · holding ${fmt(x.hold)} lbs for you after it ships` : ''}</p></div>
            <b className={c('num')}>{fmt(x.q)} lbs</b></div>)}
            <div className={c('li')} style={{ background: '#f7f9f6' }}><b className={c('grow')}>Total</b><b className={c('num')}>{fmt(o.lbs)} lbs{o.amount != null ? ` · ${money(o.amount)}` : ''}</b></div></section>}
          {!desk && doneBtns('View my orders', () => { setFilter('all'); go('orders') })}
          {!desk && contract && o.res > 0 && <div className={c('note teal')}>After this order your <b>contract reserves</b> drop to <b>{fmt(totals.left)} lbs left</b>.{o.lbs - o.res > 0 ? ` The ${fmt(o.lbs - o.res)} open-menu lbs don't count against your reserve.` : ''}</div>}
        </main>
      </div>
    )
  }

  // ---------- yields (mockup) ----------
  // A strain on an order can be split into parts: some fresh frozen washed to hash (and maybe pressed to rosin), some run to BHO.
  const G_PER: Record<YUnit, number> = { g: 1, kg: 1000, lb: 453.592, '%': 0 }
  const UNITS: [YUnit, string][] = [['g', 'grams'], ['kg', 'kg'], ['lb', 'lbs'], ['%', '%']]
  const newPart = (ff: number | null): YPart => ({ bho: false, rosin: true, ff, outV: null, outU: 'g', rosinV: null, rosinU: 'g' })
  // shipped orders made in the app, newest first, with their report (if any)
  const yOrders = useMemo(() => (d?.yields ? orows.filter(o => o.status === 'shipped' && o.order && o.order.order_lines.length) : [])
    .map(o => ({ o, rep: d?.yields?.find(r => r.orderId === o.order!.id) ?? null })), [orows, d])
  const yToDo = yOrders.filter(x => !x.rep?.sentAt)
  const [yOrder, setYOrder] = useState<number | null>(null)
  const [yDraft, setYDraft] = useState<YieldLine[]>([])
  const [yEdit, setYEdit] = useState(true)   // a sent report opens locked; Edit report unlocks it
  const [yTxt, setYTxt] = useState<Record<string, string>>({})   // what's typed in each amount box, so "3." and "0.50" stay as typed
  const openYield = (orderId: number) => {
    const x = yOrders.find(z => z.o.order!.id === orderId); if (!x) return
    // one line per strain + crop year on the order (samples included); the first part starts with everything that shipped
    const by = new Map<string, YieldLine>()
    for (const l of x.o.order!.order_lines) { const y0 = l.crop_year ?? cy, k = l.strain + '|' + y0, v = by.get(k)
      if (v) v.shipped += Number(l.lbs); else by.set(k, { s: l.strain, y: y0, shipped: Number(l.lbs), parts: [], note: '' }) }
    const saved = x.rep?.lines ?? []
    setYDraft([...by.values()].map(l => { const sv = saved.find(z => z.s === l.s && z.y === l.y)
      return { ...l, note: sv?.note ?? '', parts: sv?.parts?.length ? sv.parts.map(p => ({ ...p })) : [newPart(l.shipped)] } }))
    setYEdit(!x.rep?.sentAt); setYTxt({}); setYOrder(orderId); go('yield')
  }
  // grams for each step of one part, and the yields worked out from them
  const yCalc = (p: YPart) => {
    const ffG = (p.ff ?? 0) * G_PER.lb
    const outG = p.outV == null ? null : p.outU === '%' ? ffG * p.outV / 100 : p.outV * G_PER[p.outU]
    const hashG = p.bho ? null : outG, bhoG = p.bho ? outG : null
    const rosinG = p.bho || !p.rosin || p.rosinV == null ? null : p.rosinU === '%' ? (hashG == null ? null : hashG * p.rosinV / 100) : p.rosinV * G_PER[p.rosinU]
    const of = (g: number | null, base: number | null) => g != null && base ? g / base * 100 : null
    return { ffG, hashG, bhoG, rosinG, hashPct: of(hashG, ffG), bhoPct: of(bhoG, ffG), rosinOfHash: of(rosinG, hashG), rosinOfFF: of(rosinG, ffG) }
  }
  const pct = (n: number | null) => n == null ? '–' : `${n < 10 ? n.toFixed(2) : n.toFixed(1)}%`
  const gFmt = (g: number | null) => g == null ? '' : g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g).toLocaleString()} g`
  const pDone = (p: YPart) => p.outV != null || (!p.bho && p.rosinV != null)
  const yDone = (l: YieldLine) => l.parts.some(pDone)
  async function saveYields(send: boolean) {
    if (yOrder == null) return
    const fn = (backend as unknown as { saveYields?: (id: number, lines: YieldLine[], send: boolean) => Promise<void> }).saveYields
    const ok = await run(async () => { if (fn) await fn.call(backend, yOrder, yDraft, send); return true })
    if (ok === undefined) return
    if (send) {   // confirmation page: a summary of what they just sent
      const x = yOrders.find(z => z.o.order!.id === yOrder)
      setYSent({ label: x?.o.label ?? 'this order', revised: !!x?.rep?.sentAt, lines: yDraft.map(l => ({ ...l, parts: l.parts.filter(pDone) })) })
      await reload(); go('ysent'); return
    }
    toast('Saved. You can finish later.'); await reload(); go('yields')
  }
  const [ySent, setYSent] = useState<{ label: string; revised: boolean; lines: YieldLine[] } | null>(null)
  const uTxt = (v: number | null, u: YUnit) => v == null ? '–' : u === '%' ? `${v}%` : `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${u === 'lb' ? (v === 1 ? 'lb' : 'lbs') : u}`
  const procTxt = (p: YPart) => p.bho ? 'BHO' : p.rosin ? 'Hash + Rosin' : 'Hash'
  function YieldSentScreen() {
    const r = ySent
    if (!r) return <div className={c('screen')}><p className={c('loading')}>Done.</p></div>
    const done = r.lines.filter(l => l.parts.length), blank = r.lines.filter(l => !l.parts.length)
    const runs = done.flatMap(l => l.parts.map(p => ({ orderId: 0, label: '', date: null, p, note: '', k: yCalc(p), draft: false })))
    const all = yAgg(runs), ffLbs = runs.reduce((a, x) => a + (x.p.ff ?? 0), 0)
    const outCell = (p: YPart) => { const k = yCalc(p), pc = p.bho ? k.bhoPct : k.hashPct
      return <>{uTxt(p.outV, p.outU)}{pc != null && p.outU !== '%' && <span className={c('meta')} style={{ display: 'inline' }}> · {pct(pc)}</span>}</> }
    const rosCell = (p: YPart) => { if (p.bho || !p.rosin || p.rosinV == null) return <span className={c('meta')} style={{ display: 'inline' }}>–</span>
      const k = yCalc(p); return p.rosinU === '%' ? <>{uTxt(p.rosinV, p.rosinU)} of hash</> : <>{uTxt(p.rosinV, p.rosinU)}{k.rosinOfHash != null && <span className={c('meta')} style={{ display: 'inline' }}> · {pct(k.rosinOfHash)} of hash</span>}</> }
    return (
      <div className={c('screen ysent')}>
        <header className={c('hdr done-hdr')}><span className={c('check')}>{I.check}</span><h1 style={{ marginTop: 6 }}>{r.revised ? 'Revisions sent' : 'Yields sent'}</h1>
          <p className={c('sub')} style={{ fontSize: 15 }}>{r.label} · {plural(done.length, 'strain')} sent to Lifted. Thank you! You can view or edit this report any time from Yields.</p></header>
        <main className={c('main')}>
          {desk ? <section className={c('card')} style={{ padding: 0, overflow: 'hidden' }}>
            <div className={c('ysum head')}><span>Strain</span><span>Process</span><span>Fresh frozen</span><span>Hash / BHO</span><span>Rosin</span></div>
            {done.map(l => <Fragment key={l.s + l.y}>{l.parts.map((p, pi) => <div key={pi} className={c(`ysum ${pi ? 'cont' : ''}`)}>
                <span>{pi === 0 && <><b>{l.s}</b> {yrTag(l.y)}{l.parts.length > 1 && <span className={c('meta')}>{plural(l.parts.length, 'run')}</span>}</>}</span>
                <span>{procTxt(p)}</span><span>{p.ff == null ? '–' : `${fmt(p.ff)} lbs`}</span><span>{outCell(p)}</span><span>{rosCell(p)}</span></div>)}
              {l.note && <div className={c('ysum cont note')}><span /><span className={c('meta')}>Note: {l.note}</span></div>}</Fragment>)}
            <div className={c('ysum total')}><span>Total · {plural(done.length, 'strain')}</span><span /><span>{fmt(ffLbs)} lbs</span>
              <span>{[all.hashPct != null ? `Hash ${pct(all.hashPct)}` : '', all.bhoPct != null ? `BHO ${pct(all.bhoPct)}` : ''].filter(Boolean).join(' · ') || '–'}</span>
              <span>{all.rosinOfHash != null ? `${pct(all.rosinOfHash)} of hash` : '–'}</span></div>
          </section>
          : <section className={c('card')}>{done.map(l => <div key={l.s + l.y} className={c('li')} style={{ alignItems: 'flex-start' }}><div className={c('grow')}>
              <p className={c('name')}>{l.s} {yrTag(l.y)}</p>
              {l.parts.map((p, pi) => <p key={pi} className={c('meta')}>{l.parts.length > 1 ? `Run ${pi + 1}: ` : ''}{procTxt(p)} · {p.ff == null ? '–' : `${fmt(p.ff)} lbs`} FF → {outCell(p)}{!p.bho && p.rosin && p.rosinV != null && <> · rosin {rosCell(p)}</>}</p>)}
              {l.note && <p className={c('meta')} style={{ fontStyle: 'italic' }}>“{l.note}”</p>}</div></div>)}
            <div className={c('li')} style={{ background: '#f7f9f6' }}><b className={c('grow')}>Total</b><b className={c('num')}>{fmt(ffLbs)} lbs FF{all.hashPct != null ? ` · ${pct(all.hashPct)} hash` : ''}</b></div></section>}
          {blank.length > 0 && <div className={c('note gold')}><b>Not reported yet:</b> {blank.map(l => l.s).join(', ')}. Add them any time from Yields when you've run them.</div>}
          {doneBtns('See my results', () => { setYTab('results'); go('yields') })}
        </main>
      </div>
    )
  }

  // one row per strain + crop year: every part they've reported, totals and lbs-weighted yields
  type YRun = { orderId: number; label: string; date: string | null; p: YPart; note: string; k: ReturnType<typeof yCalc>; draft: boolean }
  type YStrain = { s: string; y: number; runs: YRun[]; lbs: number; hashPct: number | null; rosinOfHash: number | null; rosinOfFF: number | null; bhoPct: number | null }
  // lbs-weighted yields over a set of parts
  const yAgg = (rs: YRun[]) => {
    const sumG = (f: (r: YRun) => number | null) => rs.reduce((a, r) => a + (f(r) ?? 0), 0)
    const hashRs = rs.filter(r => r.k.hashG != null), bhoRs = rs.filter(r => r.k.bhoG != null), rosRs = rs.filter(r => r.k.rosinG != null), both = rosRs.filter(r => r.k.hashG != null)
    const ff = (xs: YRun[]) => xs.reduce((a, r) => a + r.k.ffG, 0)
    const div = (a: number, b: number) => b > 0 ? a / b * 100 : null
    return { hashPct: div(sumG(r => r.k.hashG), ff(hashRs)), bhoPct: div(sumG(r => r.k.bhoG), ff(bhoRs)),
      rosinOfFF: div(sumG(r => r.k.rosinG), ff(rosRs)), rosinOfHash: div(both.reduce((a, r) => a + (r.k.rosinG ?? 0), 0), both.reduce((a, r) => a + (r.k.hashG ?? 0), 0)) }
  }
  const yStrains = useMemo((): YStrain[] => {
    const m = new Map<string, YStrain>()
    for (const r of d?.yields ?? []) {
      const o = orows.find(x => x.order?.id === r.orderId)
      for (const l of r.lines) for (const p of l.parts ?? []) { if (!pDone(p)) continue
        const key = l.s + '|' + l.y, v = m.get(key) ?? { s: l.s, y: l.y, runs: [], lbs: 0, hashPct: null, rosinOfHash: null, rosinOfFF: null, bhoPct: null }
        v.runs.push({ orderId: r.orderId, label: o?.label ?? `Order ${r.orderId}`, date: o?.date ?? r.savedAt, p, note: l.note, k: yCalc(p), draft: !r.sentAt }); m.set(key, v) }
    }
    for (const v of m.values()) {
      v.lbs = v.runs.reduce((a, r) => a + (r.p.ff ?? 0), 0); Object.assign(v, yAgg(v.runs))
      v.runs.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
    }
    return [...m.values()]
  }, [d, orows])
  const [yTab, setYTab] = useState<'report' | 'results' | null>(null)
  const [yOpen, setYOpen] = useState<string | null>(null)
  const [yProc, setYProc] = useState<'all' | 'SHO' | 'BHO'>('all')   // SHO = hash / hash + rosin runs, BHO = BHO runs

  function YieldsScreen() {
    const tab = yTab ?? (yToDo.length ? 'report' : 'results')
    const chipOf = (r: YieldReport | null) => r?.sentAt ? <span className={c('chip c-ok')}>Sent</span> : r?.savedAt ? <span className={c('chip c-wait')}>Draft</span> : <span className={c('chip c-sub')}>To report</span>
    const ql = q.toLowerCase()
    const years = [...new Set(yStrains.map(x => x.y))].sort((a, b) => b - a)
    // the SHO / BHO filter is by how they ran it (hash vs BHO), not the strain's grade: keep only those runs and redo the numbers
    const byProc = yStrains.map(x => { if (yProc === 'all') return x
      const runs = x.runs.filter(r => yProc === 'BHO' ? r.p.bho : !r.p.bho)
      return { ...x, runs, lbs: runs.reduce((a, r) => a + (r.p.ff ?? 0), 0), ...yAgg(runs) } }).filter(x => x.runs.length)
    const rows = sortRows('yres', byProc.filter(x => (!ql || x.s.toLowerCase().includes(ql)) && (menuYear === 'all' || x.y === menuYear)),
      { runs: x => x.runs.length, lbs: x => x.lbs, hash: x => x.hashPct ?? -1, roh: x => x.rosinOfHash ?? -1, rof: x => x.rosinOfFF ?? -1, bho: x => x.bhoPct ?? -1 })
    const tot = yAgg(rows.flatMap(x => x.runs))
    // each run under its strain: on desktop the same columns as the strain row above, so every % lines up
    const proc = (r: YRun) => r.p.bho ? <span className={c('ptag bho')}>BHO</span> : <span className={c('ptag')}>{r.p.rosin ? 'Hash + rosin' : 'Hash'}</span>
    const runList = (x: YStrain) => desk
      ? <div className={c('yruns2')}>{x.runs.map((r, i) => <div key={i} className={c('yres sub')}>
          <span className={c('yrunname')}><button className={c('linkish')} style={{ minWidth: 0, display: 'inline' }} onClick={() => openYield(r.orderId)}>{r.label}</button>
            <span className={c('muted')}>{shortDate(r.date)}</span>{proc(r)}{r.draft && <span className={c('chip c-wait')}>Draft</span>}</span>
          <span>{fmt(r.p.ff ?? 0)} lbs</span>
          <span>{pct(r.k.hashPct)}</span><span>{pct(r.k.rosinOfHash)}</span><span>{pct(r.k.rosinOfFF)}</span><span>{pct(r.k.bhoPct)}</span><span /></div>)}</div>
      : <div className={c('yruns')}>{x.runs.map((r, i) => <div key={i} className={c('yrunm')}>
          <p className={c('name')} style={{ fontSize: 14 }}><button className={c('linkish')} style={{ minWidth: 0, display: 'inline' }} onClick={() => openYield(r.orderId)}>{r.label}</button> <span className={c('muted')} style={{ fontWeight: 400 }}>{shortDate(r.date)} · {fmt(r.p.ff ?? 0)} lbs</span> {proc(r)}{r.draft && <> <span className={c('chip c-wait')}>Draft</span></>}</p>
          <p className={c('meta')}>{r.p.bho ? <>BHO <b>{pct(r.k.bhoPct)}</b> of FF</> : <>Hash <b>{pct(r.k.hashPct)}</b> of FF{r.k.rosinG != null && <> · Rosin <b>{pct(r.k.rosinOfHash)}</b> of hash · {pct(r.k.rosinOfFF)} of FF</>}</>}</p></div>)}</div>
    return (
      <div className={c('screen ylist')}>
        <header className={c('hdr')}>{back('home', 'Home')}<h1>Yields</h1>
          <p className={c('sub')}>Report how each strain ran, and see how your hash, rosin and BHO yields compare across strains and orders.</p></header>
        <main className={c('main')}>
          <div className={c('filters ytabs')} role="tablist" aria-label="Yields">
            <button role="tab" aria-selected={tab === 'results'} aria-pressed={tab === 'results'} onClick={() => setYTab('results')}>My results</button>
            <button role="tab" aria-selected={tab === 'report'} aria-pressed={tab === 'report'} onClick={() => setYTab('report')}>Report yields{yToDo.length > 0 ? ` (${yToDo.length})` : ''}</button></div>
          {tab === 'report' ? <>
            {yToDo.length > 0 && <div className={c('note teal')}><b>{plural(yToDo.length, 'order')}</b> waiting for yields. It takes less than a minute per strain, and you can save and finish later.</div>}
            <section className={c('card')}>
              {yOrders.length === 0 && <p className={c('meta')} style={{ padding: 16, margin: 0 }}>Once an order ships, it shows up here.</p>}
              {yOrders.map(({ o, rep }) => { const ls = o.order!.order_lines, strains = [...new Set(ls.map(l => l.strain))], done = rep?.lines.filter(yDone).length ?? 0
                return <button key={o.key} className={c('li btnrow')} onClick={() => openYield(o.order!.id)}>
                  <div className={c('grow')}><p className={c('name')}>{o.label} {chipOf(rep)}</p>
                    <p className={c('meta')}>Shipped {shortDate(o.date)} · {strains.length <= 3 ? strains.join(', ') : `${strains.slice(0, 3).join(', ')} +${strains.length - 3} more`}</p>
                    {rep && !rep.sentAt && <p className={c('meta')}>{done} of {plural(strains.length, 'strain')} filled in</p>}</div>
                  <span className={c('pillbtn')}>{rep?.sentAt ? 'View / edit' : rep?.savedAt ? 'Finish' : 'Report'}</span></button> })}
            </section></>
          : yStrains.length === 0 ? <section className={c('card')}><p className={c('meta')} style={{ padding: 16, margin: 0 }}>Nothing reported yet. Report yields on a shipped order and your results show up here. <button className={c('linkish')} style={{ minWidth: 0, display: 'inline' }} onClick={() => setYTab('report')}>Report yields</button></p></section>
          : <>
            <div className={c(`kpis ${desk ? 'five' : 'ykpis'}`)}>
              <div className={c('kpi')}><p>Fresh frozen run</p><b>{fmt(rows.reduce((a, x) => a + x.lbs, 0))} lbs</b><small>{plural(rows.length, 'strain')}</small></div>
              <div className={c('kpi')}><p>Hash yield</p><b>{pct(tot.hashPct)}</b><small>of fresh frozen</small></div>
              <div className={c('kpi')}><p>Rosin yield</p><b>{pct(tot.rosinOfHash)}</b><small>of hash</small></div>
              <div className={c('kpi')}><p>Rosin yield</p><b>{pct(tot.rosinOfFF)}</b><small>of fresh frozen</small></div>
              <div className={c('kpi')}><p>BHO yield</p><b>{pct(tot.bhoPct)}</b><small>of fresh frozen</small></div>
            </div>
            <div className={c('rmbar act-bar')}>
              <div className={c('filters')} role="group" aria-label="Filter strains">
                <button aria-pressed={menuYear === 'all' && yProc === 'all'} onClick={() => { setMenuYear('all'); setYProc('all') }}>All</button>
                {years.length > 1 && years.map(y => <button key={y} aria-pressed={menuYear === y} onClick={() => setMenuYear(menuYear === y ? 'all' : y)}>{y}</button>)}
                <button aria-pressed={yProc === 'SHO'} title="Hash and hash + rosin runs" onClick={() => setYProc(yProc === 'SHO' ? 'all' : 'SHO')}>SHO</button>
                <button aria-pressed={yProc === 'BHO'} title="BHO runs" onClick={() => setYProc(yProc === 'BHO' ? 'all' : 'BHO')}>BHO</button></div>
              <label className={c('search')}>{I.search}<input type="search" placeholder="Search strains" value={q} onChange={e => setQ(e.target.value)} aria-label="Search strains" /></label>
            </div>
            <section className={c('card')}>
              {desk ? <>
                <div className={c('yres head')}>{sh('yres', 's', 'Strain')}{sh('yres', 'runs', 'Runs')}{sh('yres', 'lbs', 'FF run')}{sh('yres', 'hash', <>Hash yield<br />of FF</>)}{sh('yres', 'roh', <>Rosin yield<br />of hash</>)}{sh('yres', 'rof', <>Rosin yield<br />of FF</>)}{sh('yres', 'bho', <>BHO yield<br />of FF</>)}<span /></div>
                {rows.map(x => { const key = x.s + '|' + x.y, open = yOpen === key
                  return <Fragment key={key}><button className={c(`yres ${open ? 'on' : ''}`)} onClick={() => setYOpen(open ? null : key)} aria-expanded={open}>
                    <span className={c('rmname')}>{x.s} {yrTag(x.y)}</span><span>{x.runs.length}</span><span>{fmt(x.lbs)} lbs</span>
                    <b style={{ color: 'var(--teal-ink)' }}>{pct(x.hashPct)}</b><b>{pct(x.rosinOfHash)}</b><span>{pct(x.rosinOfFF)}</span><b style={{ color: x.bhoPct != null ? 'var(--gold)' : undefined }}>{pct(x.bhoPct)}</b><span className={c('muted')}>{open ? I.up : I.down}</span></button>
                    {open && runList(x)}</Fragment> })}
              </> : rows.map(x => { const key = x.s + '|' + x.y, open = yOpen === key
                return <div key={key} style={{ borderTop: '1px solid var(--line-2)' }}><button className={c('li btnrow')} onClick={() => setYOpen(open ? null : key)} aria-expanded={open}>
                  <div className={c('grow')}><p className={c('name')}>{x.s} {yrTag(x.y)}</p>
                    <p className={c('meta')}>{plural(x.runs.length, 'run')} · {fmt(x.lbs)} lbs{x.rosinOfHash != null ? ` · Rosin ${pct(x.rosinOfHash)} of hash` : ''}{x.bhoPct != null ? ` · BHO ${pct(x.bhoPct)}` : ''}</p></div>
                  <div className={c('r')}><b className={c('num')} style={{ color: 'var(--teal-ink)' }}>{pct(x.hashPct)}</b><p className={c('meta')}>hash</p></div>{open ? I.up : I.down}</button>
                  {open && runList(x)}</div> })}
              {rows.length === 0 && <p className={c('meta')} style={{ padding: 16, margin: 0 }}>No strains match.</p>}
            </section>
            <p className={c('meta')} style={{ margin: '0 4px' }}>Yields are weighted by lbs run. Hash and BHO yields are ÷ fresh frozen; rosin yield is ÷ hash (and ÷ fresh frozen). Drafts count too.</p>
          </>}
        </main>
      </div>
    )
  }

  function YieldScreen() {
    const x = yOrders.find(z => z.o.order!.id === yOrder)
    if (!x) return <div className={c('screen')}><header className={c('hdr')}>{back('yields', 'Yields')}<h1>Report yields</h1></header><p className={c('loading')}>Pick an order to report.</p></div>
    const setL = (i: number, p: Partial<YieldLine>) => setYDraft(yDraft.map((l, j) => j === i ? { ...l, ...p } : l))
    const setP = (i: number, pi: number, p: Partial<YPart>) => setYDraft(yDraft.map((l, j) => j === i ? { ...l, parts: l.parts.map((q0, k) => k === pi ? { ...q0, ...p } : q0) } : l))
    // numbers with up to 2 decimals: keep what they typed, store the number
    const typed = (key: string, v: string): number | null => {
      let t = v.replace(/[^0-9.]/g, ''); const dot = t.indexOf('.')
      if (dot >= 0) t = t.slice(0, dot + 1) + t.slice(dot + 1).replace(/\./g, '').slice(0, 2)
      setYTxt({ ...yTxt, [key]: t }); return t === '' || t === '.' ? null : Number(t)
    }
    const shown = (key: string, v: number | null) => yTxt[key] ?? (v == null ? '' : String(v))
    const amount = (i: number, pi: number, l: YieldLine, p: YPart, which: 'out' | 'rosin') => {
      const v = which === 'out' ? p.outV : p.rosinV, u = which === 'out' ? p.outU : p.rosinU, what = which === 'rosin' ? 'rosin' : p.bho ? 'BHO' : 'hash', key = `${i}-${pi}-${which}`
      return <span className={c('yamt')}>
        <input type="text" inputMode="decimal" placeholder="0.00" value={shown(key, v)} aria-label={`${l.s} ${what} amount`}
          onChange={e => { const n = typed(key, e.target.value); setP(i, pi, which === 'out' ? { outV: n } : { rosinV: n }) }} />
        <select value={u} aria-label={`${l.s} ${what} unit`} onChange={e => setP(i, pi, which === 'out' ? { outU: e.target.value as YUnit } : { rosinU: e.target.value as YUnit })}>
          {UNITS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></span>
    }
    const filled = yDraft.filter(yDone).length
    const overOf = (l: YieldLine) => Math.round((l.parts.reduce((a, p) => a + (p.ff ?? 0), 0) - l.shipped) * 100) / 100
    const over = yDraft.filter(l => overOf(l) > 0)
    const sentAt = x.rep?.sentAt ?? null, locked = !!sentAt && !yEdit
    return (
      <div className={c('screen yform')}>
        <header className={c('hdr')}>{back('yields', 'Yields')}<h1>Yields · {x.o.label}</h1>
          <p className={c('sub')}>{sentAt ? `Shipped ${shortDate(x.o.date)}. Sent to Lifted ${shortDate(sentAt)}.` : `Shipped ${shortDate(x.o.date)}. Fill in what you have; leave a strain blank if you haven't run it yet.`}</p></header>
        <main className={c('main')}>
          {sentAt && (locked
            ? <div className={c('note ylock')}><span>{I.check} <b>Sent to Lifted {shortDate(sentAt)}.</b> This report is locked. Edit it to change a number, then submit your revisions.</span>
                <button className={c('btn ghost')} onClick={() => setYEdit(true)}>Edit report</button></div>
            : <div className={c('note gold')}><b>Editing a sent report.</b> Your changes go to Lifted when you tap Submit revisions.</div>)}
          
          <fieldset className={c('yfs')} disabled={locked}>
          {desk && <div className={c('yhead')}><span>Strain</span><span>Process</span><span>Fresh frozen run</span><span>Hash / BHO</span><span>Rosin</span><span /></div>}
          {yDraft.map((l, i) => { const used = l.parts.reduce((a, p) => a + (p.ff ?? 0), 0), left = Math.round((l.shipped - used) * 100) / 100
            return <section key={l.s + l.y} className={c(`card ycard ${left < 0 ? 'bad' : yDone(l) ? 'done' : ''}`)}>
              <div className={c('ybody')}>
                <div className={c('ystrain')}><p className={c('name')}>{l.s} {yrTag(l.y)}</p><p className={c('meta')}>{fmt(l.shipped)} lbs shipped</p>
                  {left < 0 ? <p className={c('err')} style={{ margin: '4px 0 0' }}>{fmt(-left)} lbs more than shipped. Lower the fresh frozen run{l.parts.length > 1 ? 's' : ''} to {fmt(l.shipped)} lbs or less.</p>
                    : l.parts.length > 1 && <p className={c('meta')}>{left === 0 ? 'All lbs accounted for' : `${fmt(left)} lbs not in a part yet`}</p>}</div>
                <div className={c('yparts')}>
                  {l.parts.map((p, pi) => { const k = yCalc(p)
                    return <div key={pi} className={c(`ypart ${l.parts.length > 1 ? 'split' : ''}`)}>
                      {!desk && l.parts.length > 1 && <p className={c('ypartn')}>Part {pi + 1}{p.bho ? ' · BHO' : ' · Hash'}</p>}
                      <div className={c('ycell yproc')} role="group" aria-label={`What you made from ${l.s}`}>
                        <label><input type="checkbox" checked={!p.bho} onChange={e => setP(i, pi, { bho: !e.target.checked })} /> Hash</label>
                        <label className={c(p.bho ? 'dim' : '')}><input type="checkbox" checked={!p.bho && p.rosin} disabled={p.bho} onChange={e => setP(i, pi, { rosin: e.target.checked })} /> Rosin</label>
                        <label><input type="checkbox" checked={p.bho} onChange={e => setP(i, pi, { bho: e.target.checked })} /> BHO</label></div>
                      <div className={c('ycell')}><span className={c('ylbl')}>Fresh frozen run</span>
                        <span className={c('yamt')}><input type="text" inputMode="decimal" value={shown(`${i}-${pi}-ff`, p.ff)} aria-label={`${l.s} fresh frozen run, lbs`} onChange={e => setP(i, pi, { ff: typed(`${i}-${pi}-ff`, e.target.value) })} /><span className={c('yunit')}>lbs</span></span></div>
                      <div className={c('ycell')}><span className={c('ylbl')}>{p.bho ? 'BHO' : 'Hash'}</span>
                        {amount(i, pi, l, p, 'out')}<span className={c('yout')}>{p.bho ? (k.bhoPct != null ? <><b className={c('gold')}>{pct(k.bhoPct)}</b> of fresh frozen{p.outU !== 'g' ? ` · ${gFmt(k.bhoG)}` : ''}</> : ' ')
                          : k.hashPct != null ? <><b>{pct(k.hashPct)}</b> of fresh frozen{p.outU !== 'g' ? ` · ${gFmt(k.hashG)}` : ''}</> : ' '}</span></div>
                      <div className={c(`ycell ${p.bho || !p.rosin ? 'off' : ''}`)}>{p.bho || !p.rosin ? (desk ? <span className={c('meta')}>{p.bho ? '' : 'No rosin'}</span> : null) : <>
                        <span className={c('ylbl')}>Rosin</span>{amount(i, pi, l, p, 'rosin')}
                        <span className={c('yout')}>{k.rosinOfHash != null || k.rosinOfFF != null ? <>{k.rosinOfHash != null && <><b>{pct(k.rosinOfHash)}</b> of hash</>}{k.rosinOfHash != null && k.rosinOfFF != null ? ' · ' : ''}{k.rosinOfFF != null && <>{pct(k.rosinOfFF)} of FF</>}</> : ' '}</span></>}</div>
                      <div className={c('ycell yx')}>{!locked && l.parts.length > 1 && <button className={c('iconbtn')} aria-label={`Remove part ${pi + 1}`} onClick={() => { setL(i, { parts: l.parts.filter((_, z) => z !== pi) }); setYTxt({}) }}>{I.close}</button>}</div>
                    </div> })}
                  {!locked && <button className={c('linkish ysplit')} onClick={() => setL(i, { parts: [...l.parts, { ...newPart(left > 0 ? left : null), bho: !l.parts[l.parts.length - 1].bho }] })}>+ Split this strain{l.parts.length === 1 ? ' (e.g. multiple runs, or some to hash, some to BHO)' : ''}</button>}
                </div>
              </div>
              <label className={c('ynote')}><span className={c('ylbl')}>Notes</span><input type="text" placeholder="Anything we should know: terps, color, how it washed…" value={l.note} onChange={e => setL(i, { note: e.target.value })} /></label>
            </section> })}
          </fieldset>
        </main>
        {locked ? <div className={c('dock white')}><button className={c('btn ghost')} style={{ flex: 1 }} onClick={() => go('yields')}>Back to Yields</button>
          <button className={c('btn')} style={{ flex: 1.4 }} onClick={() => setYEdit(true)}>Edit report</button></div>
        : <div className={c('dock white')}>{sentAt
          ? <button className={c('btn ghost')} style={{ flex: 1 }} disabled={busy} onClick={() => openYield(x.o.order!.id)}>Cancel changes</button>
          : <button className={c('btn ghost')} style={{ flex: 1 }} disabled={busy} onClick={() => saveYields(false)}>Save for later</button>}
          <button className={c('btn')} style={{ flex: 1.4 }} disabled={busy || filled === 0 || over.length > 0} title={over.length ? `More lbs than shipped: ${over.map(l => l.s).join(', ')}` : undefined}
            onClick={() => saveYields(true)}>{over.length ? (desk ? `Fix the red line${over.length > 1 ? 's' : ''} (more than shipped)` : 'Fix the red lines') : filled === 0 ? 'Fill in a strain' : sentAt ? 'Submit revisions' : desk ? `Send ${plural(filled, 'strain')} to Lifted` : 'Send to Lifted'}</button></div>}
      </div>
    )
  }

  function OrdersScreen() {
    const f = filter
    const list = orows.filter(o => f === 'all' || (f === 'submitted' && o.status === 'submitted') || (f === 'approved' && o.status === 'approved') || (f === 'fulfillment' && o.status === 'fulfillment') || (f === 'shipped' && o.status === 'shipped') || (f === 'unpaid' && o.paid === false) || (f === 'paid' && o.paid === true))
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
          <div className={c('filters')} role="group" aria-label="Filter orders">{fb('all', 'All')}{fb('submitted', 'Submitted')}{fb('approved', 'Approved')}{fb('fulfillment', 'In fulfillment')}{fb('shipped', 'Shipped')}{fb('unpaid', 'Unpaid')}{fb('paid', 'Paid')}</div>
          <section className={c('card')}>{list.length ? list.map(o => {
            const lbs = o.lines.reduce((a, l) => a + (l.lbs ?? 0), 0), isOpen = openRow === o.key
            const tags = o.status === 'submitted' ? <span className={c('chip c-sub')}>Submitted</span> : o.status === 'approved' ? <span className={c('chip c-ok')}>Approved</span> : o.status === 'fulfillment' ? <span className={c('chip c-ful')}>In fulfillment</span>
              : <><span className={c('chip c-ship')}>Shipped</span>{o.paid != null && <> <span className={c(`chip ${o.paid ? 'c-paid' : 'c-unpaid'}`)}>{o.paid ? 'Paid' : 'Unpaid'}</span></>}</>
            const sub = o.status !== 'shipped'
              ? <>Placed {shortDate(o.date)}{o.wanted ? <> · <b style={{ color: 'var(--ink)', fontWeight: 600 }}>Requested delivery {niceDate(o.wanted)}</b></> : ' · no date requested'}</>
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
                {o.status === 'approved' && <p className={c('meta')}>Lifted approved this order. Changing it sends it back to Lifted to approve again.</p>}
                {(o.status === 'submitted' || o.status === 'approved') && o.order ? <div className={c('row')} style={{ gap: 8, flexWrap: 'wrap' }}>
                  <button className={c('btn ghost')} style={{ height: 44, fontSize: 15, color: 'var(--teal-dk)', borderColor: 'var(--teal-dk)', flex: 1 }} onClick={() => modify(o.order!)}>Modify order</button>
                  <button className={c('btn ghost')} style={{ height: 44, fontSize: 15, color: 'var(--red)', flex: 1 }} onClick={() => setConfirmCancel(o)}>Cancel order</button></div>
                  : o.status === 'fulfillment' ? <div className={c('note')} style={{ background: 'var(--ful-bg)', color: 'var(--ful)', fontSize: 13, padding: '10px 12px' }}>Lifted is packing this order, so it can't be changed or cancelled here. Contact your Lifted rep to make changes.</div>
                  : o.status === 'shipped' ? <div className={c('row')} style={{ gap: 8, flexWrap: 'wrap' }}>
                    {o.inv ? <button className={c('btn ghost')} style={{ height: 44, fontSize: 15, color: 'var(--teal-dk)', borderColor: 'var(--teal-dk)', gap: 8, flex: 1 }} onClick={() => viewInvoice(o)}>{I.doc}View invoice (PDF)</button>
                      : <button className={c('btn ghost')} style={{ height: 44, fontSize: 15, gap: 8, flex: 1 }} disabled title="The invoice shows here as soon as Lifted sends it (usually the day it ships)">{I.doc}Invoice not ready yet</button>}
                    {d?.yields && o.order && <button className={c('btn ghost')} style={{ height: 44, fontSize: 15, color: 'var(--teal-dk)', borderColor: 'var(--teal-dk)', flex: 1 }} onClick={() => openYield(o.order!.id)}>{d.yields.find(r => r.orderId === o.order!.id)?.sentAt ? 'View / edit yields' : 'Report yields'}</button>}</div> : null}
              </div>}</div>
          }) : <p className={c('meta')} style={{ padding: 16 }}>Nothing here.</p>}</section>
        </main>
        {cx && <><div className={c('scrim')} onClick={() => setConfirmCancel(null)} />
          <div className={c('sheet')} role="alertdialog" aria-modal="true" aria-labelledby="cp-cx-t">
            <h2 id="cp-cx-t" style={{ margin: 0, fontSize: 22 }}>Cancel {cx.label}?</h2>
            <p className={c('meta')} style={{ fontSize: 15, margin: 0 }}>{fmt(cx.lines.reduce((a, l) => a + (l.lbs ?? 0), 0))} lbs{cx.amount != null ? ` · ${money(cx.amount)}` : ''}, placed {shortDate(cx.date)}{cx.wanted ? `, requested delivery ${niceDate(cx.wanted)}` : ''}. Any reserve lbs on this order go back to your reserve. This can't be undone.</p>
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
  useEffect(() => { if (d && !contract && (screen === 'activity' || screen === 'reserves' || screen === 'edit' || screen === 'reqReview' || screen === 'sent' || screen === 'contract')) setScreen('home') }, [d, contract, screen])
  useEffect(() => { if (focusK) { const t = setTimeout(() => setFocusK(null), 500); return () => clearTimeout(t) } }, [focusK])

  const SCREENS: Record<Screen, () => React.ReactElement> = {
    activity: ActivityScreen, resmenu: ResMenuScreen, home: Home, contract: ContractScreen, reserves: ReservesScreen, edit: EditScreen, reqReview: ReqReviewScreen, sent: SentScreen, menu: MenuScreen,
    order: OrderScreen, review: ReviewScreen, ordered: OrderedScreen, orders: OrdersScreen, holds: HoldsScreen, yields: YieldsScreen, yield: YieldScreen, ysent: YieldSentScreen,
  }
  return (
    <div className={['cp', typing ? 'cp-typing' : '', desk ? 'cp-desk' : ''].filter(Boolean).join(' ')}>
      {desk && d && sidebar()}
      <div className={c('col')}>
        {!d ? <div className={c('screen')}><header className={c('hdr home-hdr')}><div className={c('top')}><a className={c('logolink')} href="https://www.liftedfarms.com" target="_blank" rel="noopener noreferrer" aria-label="Lifted website (opens in a new tab)"><img className={c('logo')} src="/logo-dark.svg" alt="Lifted" /></a></div>
          <p className={c('cust')}>{me.customer_name}</p></header>
          <p className={c('loading')}>{loadErr ? <>Couldn't load your account: {loadErr} <button className={c('linkish')} onClick={reload}>Try again</button></> : 'Loading…'}</p></div>
          : desk && screen === 'home' ? DeskHome() : desk && screen === 'order' ? DeskOrderScreen() : SCREENS[screen]()}
        {d && helpButton()}
      </div>
      {account()}
      {feedbackSheet()}
      {toastMsg && <div className={c('toast')} role="status" aria-live="polite">{toastMsg}</div>}
    </div>
  )
}
