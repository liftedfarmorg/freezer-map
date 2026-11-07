import { Select } from './combo'
import { Fold } from './fold'
import { DEFAULT_CATEGORIES, DEFAULT_NURSERIES, MultiPick, NURSERIES_KEY, PRODUCT_CATEGORIES_KEY, useCatList } from './catlists'
import { StrainProfileEdit, eff, loadProfiles, mmdd } from './strains'
import type { StrainProfile } from './strains'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { readSheet } from 'read-excel-file/browser'
import type { Backend } from './api'
import { QboCustomerImport } from './qboImport'
import { CustomerLogins } from './custlogins'
import { ItemGeneratorSheet, StrainCodesSheet, StrainMetrcSheet, loadStrainPlan } from './strainMetrc'
import type { Customer, CustomerTerms, ListName, ListRow, ReserveYears, Settings, Strain, Vehicle } from './types'

// ---------- column definitions per list ----------

type Kind = 'text' | 'int' | 'num' | 'bool' | 'kind' | 'aliases' | 'color' | 'active' | 'area' | 'terms'
interface Col { key: string; label: string; kind: Kind; synonyms: string[]; hint?: string }

const COLS: Record<ListName, Col[]> = {
  vehicles: [
    { key: 'name', label: 'Name', kind: 'text', synonyms: ['name', 'vehicle', 'vehicle name', 'truck'] },
    { key: 'plate', label: 'Plate', kind: 'text', synonyms: ['plate', 'license plate', 'plate #', 'plate number', 'tag'] },
    { key: 'kind', label: 'Type', kind: 'text', synonyms: ['type', 'kind', 'vehicle type'], hint: 'Freezer truck, trailer…' },
    { key: 'spaces', label: 'Pallet spaces', kind: 'int', synonyms: ['spaces', 'pallet spaces', 'pallets', 'capacity'] },
    { key: 'across', label: 'Pallets across', kind: 'int', synonyms: ['across', 'pallets across', 'width'], hint: 'usually 2' },
    { key: 'owner', label: 'Owner / carrier', kind: 'text', synonyms: ['owner', 'carrier', 'company'], hint: 'Lifted, or the carrier name' },
    { key: 'notes', label: 'Notes', kind: 'text', synonyms: ['notes', 'note', 'comments'] },
    { key: 'active', label: 'Active', kind: 'active', synonyms: ['active', 'status'] },
  ],
  customers: [
    { key: 'name', label: 'Name', kind: 'text', synonyms: ['name', 'customer', 'customer name', 'company', 'business name'] },
    { key: 'kind', label: 'Internal or external', kind: 'kind', synonyms: ['type', 'kind', 'internal', 'internal/external'] },
    { key: 'license', label: 'License #', kind: 'text', synonyms: ['license', 'license #', 'license number', 'licence', 'state license'] },
    { key: 'address', label: 'Address', kind: 'text', synonyms: ['address', 'location', 'ship to'] },
    { key: 'contact', label: 'Contact', kind: 'text', synonyms: ['contact', 'phone', 'email', 'contact info'] },
    { key: 'qbo_name', label: 'QuickBooks name', kind: 'text', synonyms: ['quickbooks name', 'qbo name', 'qb name', 'quickbooks customer'], hint: 'exactly as in QuickBooks; invoices are matched on it. Import from QuickBooks fills it in' },
    { key: 'legal_name', label: 'Legal name', kind: 'text', synonyms: ['legal name', 'legal', 'entity', 'company legal name'], hint: 'on invoices, if different' },
    { key: 'payment_terms', label: 'Payment terms', kind: 'terms', synonyms: ['payment terms', 'terms', 'net'], hint: 'default for this customer' },
    { key: 'sample_hold_days', label: 'Sample hold (days)', kind: 'int', synonyms: ['sample hold', 'sample hold days', 'hold days'], hint: 'how long a sample order holds product after it ships; blank = 10' },
    { key: 'billing_address', label: 'Billing address', kind: 'area', synonyms: ['billing address', 'bill to', 'billing'] },
    { key: 'billing_contact', label: 'Billing contact', kind: 'text', synonyms: ['billing contact', 'ap contact', 'accounts payable'] },
    { key: 'billing_email', label: 'Billing email', kind: 'text', synonyms: ['billing email', 'ap email', 'invoice email'], hint: 'invoices go here' },
    { key: 'billing_phone', label: 'Billing phone', kind: 'text', synonyms: ['billing phone', 'ap phone'] },
    { key: 'ship_to_name', label: 'Ship-to premises name', kind: 'text', synonyms: ['ship to name', 'premises name', 'receiving premises'] },
    { key: 'ship_to_address', label: 'Ship-to address', kind: 'area', synonyms: ['ship to', 'ship to address', 'shipping address', 'premises address'], hint: 'blank = Address' },
    { key: 'receiving_contact', label: 'Receiving contact', kind: 'text', synonyms: ['receiving contact', 'receiving', 'dock contact'] },
    { key: 'reserves_enabled', label: 'Reserves', kind: 'bool', synonyms: ['reserves', 'reserves enabled', 'has reserves'], hint: 'off: portal ordering from the open menu only' },
    { key: 'price_per_lb', label: 'Price $/lb', kind: 'num', synonyms: ['price', 'price per lb', 'price/lb', '$/lb', 'contract price'], hint: 'fresh frozen contract price, used on orders and invoices; blank = the market price (Sales settings › Market price)' },
    { key: 'contract_lbs', label: 'Contract lbs', kind: 'num', synonyms: ['contract lbs', 'contract', 'contracted lbs'] },
    { key: 'monthly_min_lbs', label: 'Monthly minimum lbs', kind: 'num', synonyms: ['monthly min', 'monthly minimum', 'min lbs'] },
    { key: 'deposit_usd', label: 'Deposit $', kind: 'num', synonyms: ['deposit', 'deposit $', 'deposit usd'] },
    { key: 'storage_fee', label: 'Storage fee', kind: 'num', synonyms: ['storage', 'storage fee'] },
    { key: 'notes', label: 'Notes', kind: 'text', synonyms: ['notes', 'note', 'comments'] },
    { key: 'active', label: 'Active', kind: 'active', synonyms: ['active', 'status'] },
  ],
  strains: [
    { key: 'name', label: 'Name', kind: 'text', synonyms: ['name', 'strain', 'strain name', 'cultivar'] },
    { key: 'aliases', label: 'Other names', kind: 'aliases', synonyms: ['aliases', 'alias', 'other names', 'also known as', 'aka'], hint: 'comma separated' },
    { key: 'show_on_menu', label: 'Show on menu', kind: 'bool', synonyms: ['show on menu', 'on menu', 'menu'], hint: 'off: customers can\'t order new lbs of it' },
    { key: 'trial', label: 'Trial strain', kind: 'bool', synonyms: ['trial', 'trial strain'], hint: 'T pallets; follows it through the crop plan, plantings, harvests and inventory. Turn off when it goes into production.' },
    { key: 'color', label: 'Map color', kind: 'color', synonyms: ['color', 'colour', 'map color', 'hex'], hint: '#RRGGBB' },
    { key: 'notes', label: 'Notes', kind: 'text', synonyms: ['notes', 'note', 'comments', 'lineage'] },
    { key: 'active', label: 'Active', kind: 'active', synonyms: ['active', 'status'] },
  ],
}
// how the Settings › Section picker groups the sections (Msg 296)
const SECTION_GROUPS: [string, string[]][] = [
  ['Lists', ['customers', 'strains', 'locations', 'vehicles', 'nurseries']],
  ['Sales', ['categories', 'terms', 'market', 'contract', 'deadlines', 'shipping', 'fulfill']],
  ['People', ['users', 'logins', 'people', 'perms']],
  ['System', ['licenses', 'alerts', 'app']],
]
const TITLES: Record<ListName, string> = { vehicles: 'Vehicles', customers: 'Customers', strains: 'Strains' }
const SINGULAR: Record<ListName, string> = { vehicles: 'vehicle', customers: 'customer', strains: 'strain' }
const LOCKED = new Set(['ohr', 'gvr'])

// ---------- value parsing ----------

const norm = (v: unknown) => (v == null ? '' : String(v)).trim()
function parseColor(v: string): string | null | undefined {
  if (!v) return undefined
  const m = v.replace(/^#/, '').match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) return null // invalid
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1]
  return '#' + h.toLowerCase()
}
function parseActive(v: string): boolean | undefined {
  if (!v) return undefined
  return !/^(no|n|false|0|retired|inactive)$/i.test(v)
}
function parseKind(v: string): 'internal' | 'external' | undefined {
  if (!v) return undefined
  return /^(internal|int|yes|y|true|1)$/i.test(v) ? 'internal' : 'external'
}
const parseAliases = (v: string) => v ? v.split(/[,;|]/).map(x => x.trim()).filter(Boolean) : []

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ } else if (c === '"') q = false; else cell += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}

// ---------- import plan ----------

interface PlanRow { line: number; name: string; status: 'new' | 'update' | 'same' | 'error'; msg?: string; changes?: string[]; row?: Partial<ListRow> }

function buildPlan(list: ListName, grid: string[][], existing: ListRow[]): { plan: PlanRow[]; found: string[]; error?: string } {
  const cols = COLS[list]
  // header = first row in the top 10 that has a recognisable name column
  let hi = -1, map: Record<string, number> = {}
  for (let r = 0; r < Math.min(grid.length, 10) && hi < 0; r++) {
    const heads = grid[r].map(h => norm(h).toLowerCase())
    const m: Record<string, number> = {}
    for (const c of cols) { const i = heads.findIndex(h => c.synonyms.includes(h)); if (i >= 0) m[c.key] = i }
    if (m.name != null) { hi = r; map = m }
  }
  if (hi < 0) return { plan: [], found: [], error: `Couldn't find a "${cols[0].label}" column in the first rows. Download the template to see the expected headings.` }
  const byName = new Map(existing.map(e => [e.name.toLowerCase(), e]))
  const seen = new Set<string>()
  const plan: PlanRow[] = []
  for (let r = hi + 1; r < grid.length; r++) {
    const get = (k: string) => map[k] != null ? norm(grid[r][map[k]]) : ''
    const name = get('name')
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) { plan.push({ line: r + 1, name, status: 'error', msg: 'Listed twice in the file' }); continue }
    seen.add(key)
    const ex = byName.get(key)
    const row: Record<string, unknown> = {}
    let bad = ''
    for (const c of cols) {
      if (c.key === 'name' || map[c.key] == null) continue
      const v = get(c.key)
      if (c.kind === 'text') { if (v) row[c.key] = v }
      else if (c.kind === 'bool') { const b = parseActive(v); if (b !== undefined) row[c.key] = b }
      else if (c.kind === 'num') { if (v) { const n = Number(v.replace(/[$,]/g, '')); if (isNaN(n) || n < 0) bad = `"${v}" isn't a number for ${c.label}`; else row[c.key] = n } }
      else if (c.kind === 'int') { if (v) { const n = parseInt(v, 10); if (!(n > 0)) bad = `"${v}" isn't a whole number for ${c.label}`; else row[c.key] = n } }
      else if (c.kind === 'active') { const a = parseActive(v); if (a !== undefined) row.active = a }
      else if (c.kind === 'kind') { const k = parseKind(v); if (k) row.kind = k }
      else if (c.kind === 'color') { const col = parseColor(v); if (col === null) bad = `"${v}" isn't a color like #A1B2C3`; else if (col) row.color = col }
      else if (c.kind === 'aliases') {
        const al = parseAliases(v)
        if (al.length) row.aliases = [...new Set([...((ex as Strain | undefined)?.aliases ?? []), ...al])]
      }
    }
    if (bad) { plan.push({ line: r + 1, name, status: 'error', msg: bad }); continue }
    if (list === 'customers' && ex && LOCKED.has(key) && ((row.kind && row.kind !== 'internal') || row.active === false)) {
      delete row.kind; delete row.active
    }
    if (!ex) { plan.push({ line: r + 1, name, status: 'new', row: { name, ...row } as Partial<ListRow> }); continue }
    const changes = Object.keys(row).filter(k => JSON.stringify((ex as unknown as Record<string, unknown>)[k] ?? null) !== JSON.stringify(row[k]))
    if (!changes.length) plan.push({ line: r + 1, name: ex.name, status: 'same' })
    else plan.push({ line: r + 1, name: ex.name, status: 'update', changes, row: { id: ex.id, ...Object.fromEntries(changes.map(k => [k, row[k]])) } as Partial<ListRow> })
  }
  return { plan, found: cols.filter(c => map[c.key] != null).map(c => c.label) }
}

function downloadTemplate(list: ListName, rows: ListRow[]) {
  const cols = COLS[list]
  const esc = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
  const cell = (r: ListRow, c: Col) => {
    const v = (r as unknown as Record<string, unknown>)[c.key]
    if (c.kind === 'active') return v === false ? 'No' : 'Yes'
    if (c.kind === 'aliases') return (v as string[] | undefined)?.join(', ') ?? ''
    return v == null ? '' : String(v)
  }
  const lines = [cols.map(c => c.label), ...rows.map(r => cols.map(c => cell(r, c)))].map(l => l.map(esc).join(','))
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = `${TITLES[list]} - Lifted Inventory.csv`; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// ---------- screen ----------

/** A module's Settings: the shared lists it uses (vehicles, customers, strains) plus any extra sections of its own.
 *  The Strains list is the same one in every module that shows it. */
export function SettingsView({ backend, inventoryStrains, onChanged, flash, lists, title, extra, canTerms, focus = 'dist', startOn }: {
  backend: Backend; inventoryStrains: Map<string, number>
  onChanged: () => void; flash: (t: string, bad?: boolean) => void
  lists: ListName[]; title: string; extra?: { k: string; l: string; node: ReactNode }[]; canTerms?: boolean
  /** which module is looking: decides which strain numbers lead the row */
  focus?: StrainFocus
  /** open on one of the extra sections instead of the first list */
  startOn?: string
}) {
  const [data, setData] = useState<Settings | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [tab, setTab] = useState<ListName>(lists[0] ?? 'strains')
  const [q, setQ] = useState('')
  const [showRetired, setShowRetired] = useState(false)
  const [edit, setEdit] = useState<Partial<ListRow> | null>(null)
  const [plan, setPlan] = useState<{ rows: PlanRow[]; found: string[]; file: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [other, setOther] = useState<string | null>(startOn ?? (lists.length ? null : extra?.[0]?.k ?? null))
  const [qbo, setQbo] = useState(false)
  const [ordF, setOrdF] = useState<'all' | 'res' | 'menu'>('all')   // customers table: All / Reserves on / Menu only
  const [terms, setTerms] = useState<{ code: string; label: string }[]>([])
  const [metrcFor, setMetrcFor] = useState<{ id: number; isNew: boolean } | null>(null)
  const [codes, setCodes] = useState(false)
  const [gen, setGen] = useState(false)
  const sb = backend.client()
  const cats = useCatList(backend, PRODUCT_CATEGORIES_KEY, DEFAULT_CATEGORIES).list
  const nurseries = useCatList(backend, NURSERIES_KEY, DEFAULT_NURSERIES).list
  const [pickOpen, setPickOpen] = useState(false)
  const [catF, setCatF] = useState('')
  const [where, setWhere] = useState<'all' | 'inv' | 'nurs' | 'field' | 'out'>('all')
  // strains in the nursery (active mothers) and in the field (this crop year's plantings). Outside nurseries = the strain card's Nurseries.
  const [grow, setGrow] = useState<{ moms: Set<string>; field: Set<string> } | null>(null)
  useEffect(() => {
    if (!lists.includes('strains') || !sb) return
    const y = new Date().getFullYear()
    Promise.all([sb.from('nursery_mothers').select('strain').eq('status', 'active'), sb.from('cult_plantings').select('strain').gte('crop_year', y)]).then(([m, p]) => {
      const lc = (x: string) => x.trim().toLowerCase()
      const pl = (p.data ?? []) as { strain: string }[]
      setGrow({ moms: new Set(((m.data ?? []) as { strain: string }[]).map(r => lc(r.strain))), field: new Set(pl.map(r => lc(r.strain))) })
    }).catch(() => {})
  }, [])
  // customer balances: QuickBooks' balance when production is connected, else the app's open invoices
  const [bal, setBal] = useState<Map<number, number>>(new Map())
  useEffect(() => {
    if (!lists.includes('customers') || !sb) return
    Promise.all([sb.from('acct_customer_balances').select('customer_id,balance').eq('env', 'production'), sb.from('invoices').select('customer_id,total').eq('status', 'open')]).then(([q, i]) => {
      const m = new Map<number, number>()
      const qb = (q.data ?? []) as { customer_id: number; balance: number | null }[]
      if (qb.length) qb.forEach(r => { if (r.balance != null) m.set(r.customer_id, Number(r.balance)) })
      else ((i.data ?? []) as { customer_id: number; total: number }[]).forEach(r => m.set(r.customer_id, (m.get(r.customer_id) ?? 0) + Number(r.total)))
      setBal(m)
    }).catch(() => {})
  }, [])
  useEffect(() => { if (lists.includes('customers')) backend.paymentTerms().then(t => setTerms(t.filter(x => x.active))).catch(() => {}) }, [])
  const [carriers, setCarriers] = useState<{ id: number; name: string; license_no: string | null }[]>([])
  useEffect(() => { if (lists.includes('customers')) sb?.rpc('pickup_carriers').then(({ data }) => setCarriers((data ?? []) as { id: number; name: string; license_no: string | null }[]), () => {}) }, [])

  const load = () => backend.loadSettings().then(d => { setData(d); setErr(null) }).catch(e => setErr(String(e?.message ?? e)))
  useEffect(() => { load() }, [])
  const [profiles, setProfiles] = useState<Map<number, StrainProfile>>(new Map())
  const loadProfilesNow = () => { if (lists.includes('strains')) loadProfiles(backend.client()).then(setProfiles) }
  useEffect(loadProfilesNow, [])

  const rows = (data?.[tab] ?? []) as ListRow[]
  const names = (r: ListRow) => [r.name, ...(((r as Strain).aliases) ?? [])].map(x => x.trim().toLowerCase())
  const inWhere = (r: ListRow) => tab !== 'strains' || where === 'all' ? true
    : where === 'inv' ? palletsOf(r as Strain, inventoryStrains) > 0
    : where === 'nurs' ? names(r).some(n => grow?.moms.has(n))
    : where === 'field' ? names(r).some(n => grow?.field.has(n))
    : ((r as Strain).nurseries ?? []).some(x => !/^1PN$/i.test(x.trim()))
  const shown = rows.filter(r => (showRetired || r.active) && inWhere(r) && (tab !== 'customers' || !catF || ((r as Customer).product_categories ?? []).includes(catF))
    && (!q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase())))

  // strains on pallets that the list doesn't know (by name or other name)
  const unknownStrains = useMemo(() => {
    if (!data) return []
    const known = new Set(data.strains.flatMap(s => [s.name, ...(s.aliases ?? [])]).map(x => x.toLowerCase()))
    return [...inventoryStrains.entries()].filter(([n]) => !known.has(n.toLowerCase())).map(([n]) => n)
  }, [data, inventoryStrains])

  async function save(row: Partial<ListRow>) {
    setBusy(true)
    try {
      // strain type goes through set_strain_type (it also sets METRC's indica / sativa %), not a plain update
      const st = tab === 'strains' && 'strain_type' in row ? (row as Strain).strain_type ?? null : undefined
      const was = tab === 'strains' ? ((data?.strains ?? []).find(x => x.id === row.id)?.strain_type ?? null) : null
      const plain = { ...row } as Record<string, unknown>; delete plain.strain_type
      await backend.saveRow(tab, plain as Partial<ListRow>)
      if (st !== undefined && st !== was && row.id && sb) { const { error } = await sb.rpc('set_strain_type', { p_strain: row.id, p_type: st }); if (error) throw new Error(error.message) }
      await load(); onChanged(); setEdit(null); flash('Saved')
      // a new strain: show what METRC needs for it (only to people who can send it)
      if (tab === 'strains' && !row.id && sb) {
        const { data: made } = await sb.from('strains').select('id').ilike('name', String(row.name ?? '').trim().replace(/[%_\\]/g, m => `\\${m}`)).limit(1)
        const id = (made?.[0] as { id: number } | undefined)?.id
        if (id) loadStrainPlan(sb, id, {}).then(p => { if (p.can_send) setMetrcFor({ id, isNew: true }) }).catch(() => {})
      }
    }
    catch (e) { flash((e as Error).message, true) } finally { setBusy(false) }
  }
  async function addMissing() {
    setBusy(true)
    try { for (const n of unknownStrains) await backend.saveRow('strains', { name: n } as Partial<Strain>); await load(); onChanged(); flash(`${unknownStrains.length} strains added`) }
    catch (e) { flash((e as Error).message, true) } finally { setBusy(false) }
  }
  async function pickFile(f: File) {
    try {
      const grid = /\.csv$/i.test(f.name)
        ? parseCsv((await f.text()).replace(/^﻿/, ''))
        : (await readSheet(f)).map(r => r.map(c => c instanceof Date ? c.toISOString().slice(0, 10) : norm(c)))
      const res = buildPlan(tab, grid, rows)
      if (res.error) { flash(res.error, true); return }
      setPlan({ rows: res.plan, found: res.found, file: f.name })
    } catch (e) { flash(`Couldn't read ${f.name}: ${(e as Error).message}`, true) }
  }
  async function applyPlan() {
    if (!plan) return
    setBusy(true)
    let done = 0
    try {
      for (const r of plan.rows) if ((r.status === 'new' || r.status === 'update') && r.row) { await backend.saveRow(tab, r.row); done++ }
      await load(); onChanged(); setPlan(null); flash(`Imported ${done} ${TITLES[tab].toLowerCase()}`)
    } catch (e) { await load(); flash(`Stopped after ${done}: ${(e as Error).message}`, true) } finally { setBusy(false) }
  }

  if (err) return <div className="list"><h2>Settings</h2><div className="warnbox">Settings aren't set up in the database yet. Run the 003_settings.sql update in Supabase, then refresh. ({err})</div></div>
  if (!data) return <div className="muted">Loading settings…</div>

  return (
    <div className="list settings">
      {(() => {
        // Msg 296: one "Settings › Section ▾" picker instead of a row of tabs, sections grouped
        const secs = [...lists.map(t => ({ k: `list:${t}`, l: TITLES[t], n: (data[t] as ListRow[]).filter(r => r.active).length as number | null, go: () => { setTab(t); setQ(''); setOther(null) }, on: t === tab && !other })),
          ...(extra ?? []).map(x => ({ k: x.k, l: x.l, n: null as number | null, go: () => setOther(x.k), on: other === x.k }))]
        const cur = secs.find(x => x.on) ?? secs[0]
        const groups = SECTION_GROUPS.map(([g, keys]) => ({ g, items: secs.filter(x => keys.includes(x.k.replace(/^list:/, ''))) })).filter(x => x.items.length)
        const rest = secs.filter(x => !SECTION_GROUPS.some(([, keys]) => keys.includes(x.k.replace(/^list:/, ''))))
        if (rest.length) groups.push({ g: 'More', items: rest })
        return <div className="setpick-h">
          <h2><span className="muted">{title.replace(/ settings$/, '')} settings ›</span></h2>
          {secs.length > 1 ? <span className="setpick-w">
            <button className="setpick-btn" aria-haspopup="menu" aria-expanded={pickOpen} onClick={() => setPickOpen(!pickOpen)}>{cur?.l}{cur?.n != null && <span className="muted"> {cur.n}</span>} ▾</button>
            {pickOpen && <><div className="modscrim" onClick={() => setPickOpen(false)} />
              <div className="setpick-menu" role="menu">{groups.map(gr => <div key={gr.g}><div className="setpick-g">{gr.g}</div>
                {gr.items.map(x => <button key={x.k} role="menuitem" className={x.on ? 'on' : ''} onClick={() => { x.go(); setPickOpen(false) }}>{x.l}{x.n != null && <span className="muted"> {x.n}</span>}</button>)}</div>)}</div></>}
          </span> : <h2>{cur?.l}</h2>}
        </div>
      })()}
      {other ? extra?.find(x => x.k === other)?.node : <>
      <div className="row toolbar">
        <input className="search" type="search" placeholder={`Search ${TITLES[tab].toLowerCase()}`} value={q} onChange={e => setQ(e.target.value)} />
        {tab === 'customers' && <button className="ghost" onClick={() => setQbo(true)}>Import from QuickBooks</button>}
        {tab === 'strains' && sb && <button className="ghost" onClick={() => setCodes(true)}>METRC codes</button>}
        {tab === 'strains' && sb && <button className="ghost" onClick={() => setGen(true)}>METRC item generator</button>}
        <button className="primary" onClick={() => setEdit(tab === 'customers' ? { kind: 'external', active: true } as Partial<Customer> : tab === 'strains' ? { aliases: [], active: true, show_on_menu: true } as Partial<Strain> : { active: true, spaces: 8, across: 2 } as Partial<Vehicle>)}>+ Add</button>
      </div>
      <Fold id={`set.${tab}.tools`} title="Import, export and retired">
        <div className="row toolbar">
          <label className="ghost small filebtn">Import spreadsheet
            <input type="file" accept=".xlsx,.xlsm,.csv" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pickFile(f) }} />
          </label>
          <button className="ghost small" onClick={() => downloadTemplate(tab, rows)}>Download as spreadsheet</button>
          <label className="check small-check"><input type="checkbox" checked={showRetired} onChange={e => setShowRetired(e.target.checked)} /> Show retired</label>
        </div>
        <p className="muted">Import adds new {TITLES[tab].toLowerCase()} and updates existing ones by name. Blank cells don't overwrite anything. The download doubles as a template.</p>
      </Fold>

      {tab === 'strains' && unknownStrains.length > 0 && (
        <div className="warnbox">{unknownStrains.length} strain{unknownStrains.length > 1 ? 's' : ''} on pallets {unknownStrains.length > 1 ? "aren't" : "isn't"} in the list: {unknownStrains.slice(0, 6).join(', ')}{unknownStrains.length > 6 ? '…' : ''}. <a onClick={addMissing}>Add {unknownStrains.length > 1 ? 'them' : 'it'}</a>, or add {unknownStrains.length > 1 ? 'them' : 'it'} as another name on an existing strain.</div>
      )}

      {shown.length === 0 && <p className="muted">Nothing here yet. Add one, or import a spreadsheet.</p>}
      {tab === 'customers' && <div className="seg setf" role="group" aria-label="What they buy">{['', ...cats].map(k => <button key={k || 'any'} className={catF === k ? 'on' : ''} onClick={() => setCatF(k)}>{k || 'Any category'}</button>)}</div>}
      {tab === 'strains' && <div className="seg setf" role="group" aria-label="Where">{([['all', 'All'], ['inv', 'In inventory'], ['nurs', 'In the nursery'], ['field', 'In the field'], ['out', 'Outside nurseries']] as const).map(([k, l]) =>
        <button key={k} className={where === k ? 'on' : ''} onClick={() => setWhere(k)}>{l}</button>)}</div>}
      {tab === 'customers' && shown.length > 0 && (() => { const ext = (shown as Customer[]).filter(c => c.active && c.kind !== 'internal')
        return <div className="seg setf" role="group" aria-label="Ordering">{([['all', 'All', ext.length], ['res', 'Reserves on', ext.filter(c => c.reserves_enabled).length], ['menu', 'Menu only', ext.filter(c => !c.reserves_enabled).length]] as const).map(([k, l, n]) =>
          <button key={k} className={ordF === k ? 'on' : ''} onClick={() => setOrdF(k)}>{l} <span className="segn">{n}</span></button>)}</div> })()}
      {groupsOf(tab, shown, inventoryStrains).map(([gk, gl, gr]) => gr.length > 0 && (
        <Fold key={gk} id={`set.${tab}.${gk}`} title={gl} count={gr.length} open={gk === 'main'} force={!!q}>
          <SetTable list={tab} rows={gr.filter(r => tab !== 'customers' || gk !== 'main' || ordF === 'all' || ((r as Customer).reserves_enabled ? 'res' : 'menu') === ordF)}
            terms={terms} profiles={profiles} inv={inventoryStrains} focus={focus} onOpen={r => setEdit(structuredClone(r))} bal={bal} sel={edit?.id ?? null} />
        </Fold>
      ))}

      {edit && <EditForm key={`${tab}-${edit.id ?? 'new'}`} list={tab} row={edit} busy={busy} onClose={() => setEdit(null)} onSave={save} terms={terms} carriers={carriers} cats={cats} nurseries={nurseries}
        tabExtra={tab === 'customers' && edit.id != null && (edit as Customer).kind !== 'internal' ? {
          contract: canTerms ? <TermsByYear backend={backend} c={edit as Customer} /> : null,
          logins: <CustomerLogins backend={backend} customerId={edit.id} customerName={String(edit.name ?? '')} flash={flash} /> } : undefined}
        extra={tab === 'customers' ? null
          : tab === 'strains' && edit.id != null ? <>
              {sb && <div className="row" style={{ margin: '6px 0 10px' }}><button className="ghost small" onClick={() => { const id = edit.id!; setEdit(null); setMetrcFor({ id, isNew: false }) }}>METRC: strain and items on every license</button></div>}
              {profiles.get(edit.id) && <StrainProfileEdit sb={backend.client()} p={profiles.get(edit.id)!} flash={flash} onSaved={loadProfilesNow} />}
            </> : null} />}
      {metrcFor && sb && <StrainMetrcSheet sb={sb} strainId={metrcFor.id} isNew={metrcFor.isNew} flash={flash} onClose={() => { setMetrcFor(null); load() }} />}
      {codes && sb && <StrainCodesSheet sb={sb} onClose={() => setCodes(false)} />}
      {gen && sb && <ItemGeneratorSheet sb={sb} flash={flash} onClose={() => setGen(false)} />}
      {plan && <ImportPreview list={tab} plan={plan} busy={busy} onClose={() => setPlan(null)} onApply={applyPlan} />}
      {qbo && tab === 'customers' && <QboCustomerImport backend={backend} customers={rows as Customer[]} terms={terms} flash={flash}
        onDone={() => { load(); onChanged() }} onClose={() => setQbo(false)} />}
      </>}
    </div>
  )
}

export type StrainFocus = 'dist' | 'sales' | 'cult' | 'nurs'
const palletsOf = (s: Strain, inv: Map<string, number>) =>
  [s.name, ...(s.aliases ?? [])].reduce((a, x) => a + (inv.get(x) ?? [...inv.entries()].find(([k]) => k.toLowerCase() === x.toLowerCase())?.[1] ?? 0), 0)
// ---------- settings lists as sortable tables (restyle, Msg 285) ----------
type TCol = { k: string; l: string; num?: boolean; slim?: boolean; v: (r: ListRow) => string | number | null | undefined; cell?: (r: ListRow) => ReactNode }
const money = (v: unknown, d = 2) => (v == null ? null : `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`)
const cityOf = (a: string | null) => { const p = (a ?? '').split(',').map(x => x.trim()); return p.length >= 3 ? p[p.length - 2] : null }
function setCols(list: ListName, terms: { code: string; label: string }[], profiles: Map<number, StrainProfile>, inv: Map<string, number>, focus: StrainFocus, bal?: Map<number, number>): TCol[] {
  if (list === 'customers') {
    const C = (r: ListRow) => r as Customer
    return [
      { k: 'name', l: 'Customer', v: r => r.name, cell: r => <><b>{r.name}</b>{!r.active && <span className="muted"> · retired</span>}</> },
      { k: 'bal', l: 'Balance', num: true, slim: true, v: r => bal?.get(r.id!) ?? null, cell: r => bal?.has(r.id!) ? money(bal.get(r.id!)) : null },
      { k: 'ord', l: 'Ordering', slim: true, v: r => C(r).kind === 'internal' ? 'Internal' : C(r).reserves_enabled ? 'Reserves on' : 'Menu only',
        cell: r => C(r).kind === 'internal' ? <span className="pill">Internal</span> : <span className={`pill ${C(r).reserves_enabled ? 'p-res' : ''}`}>{C(r).reserves_enabled ? 'Reserves on' : 'Menu only'}</span> },
      { k: 'terms', l: 'Terms', v: r => { const c = C(r).payment_terms; return c ? terms.find(t => t.code === c)?.label ?? c : null } },
      { k: 'price', l: '$ / lb', num: true, v: r => C(r).price_per_lb ?? null, cell: r => money(C(r).price_per_lb) },
      { k: 'cl', l: 'Contract lbs', num: true, v: r => C(r).contract_lbs ?? null, cell: r => C(r).contract_lbs == null ? null : Number(C(r).contract_lbs).toLocaleString() },
      { k: 'mm', l: 'Monthly min', num: true, v: r => C(r).monthly_min_lbs ?? null, cell: r => C(r).monthly_min_lbs == null ? null : Number(C(r).monthly_min_lbs).toLocaleString() },
      { k: 'dep', l: 'Deposit', num: true, v: r => C(r).deposit_usd ?? null, cell: r => money(C(r).deposit_usd, 0) },
      { k: 'lic', l: 'License', v: r => C(r).license, cell: r => C(r).license && <span className="mono">{C(r).license}</span> },
      { k: 'city', l: 'City', v: r => cityOf(C(r).address) },
      { k: 'contact', l: 'Contact', v: r => C(r).contact },
      { k: 'be', l: 'Billing email', v: r => C(r).billing_email, cell: r => C(r).billing_email && <span className="trunc">{C(r).billing_email}</span> },
      { k: 'qbo', l: 'QuickBooks name', v: r => C(r).qbo_name },
    ]
  }
  if (list === 'vehicles') {
    const V = (r: ListRow) => r as Vehicle
    return [
      { k: 'name', l: 'Vehicle', v: r => r.name, cell: r => <><b>{r.name}</b>{!r.active && <span className="muted"> · retired</span>}</> },
      { k: 'spaces', l: 'Spaces', num: true, v: r => V(r).spaces ?? null },
      { k: 'across', l: 'Across', num: true, v: r => V(r).across ?? null },
      { k: 'owner', l: 'Owner', v: r => V(r).owner },
      { k: 'kind', l: 'Kind', v: r => V(r).kind },
      { k: 'plate', l: 'Plate', v: r => V(r).plate, cell: r => V(r).plate && <span className="mono">{V(r).plate}</span> },
      { k: 'notes', l: 'Notes', v: r => V(r).notes, cell: r => V(r).notes && <span className="trunc">{V(r).notes}</span> },
    ]
  }
  const S = (r: ListRow) => r as Strain, P = (r: ListRow) => profiles.get(r.id)
  const n = (x: unknown, d = 1) => { const v = r1(x, d); return v == null ? null : Number(v) }
  const all: TCol[] = [
    { k: 'name', l: 'Strain', v: r => r.name, cell: r => { const ph = P(r)?.set?.photo_url
      return <span className="stcell">{ph ? <img className="sthumb sm" src={ph} alt="" loading="lazy" /> : <span className="sthumb sm init" style={{ background: S(r).color || `hsl(${hueOf(r.name)} 35% var(--thumb-l))` }}>{initials(r.name)}</span>}<b>{r.name}</b></span> } },
    { k: 'code', l: 'Code', v: r => S(r).code ?? null, cell: r => S(r).code && <span className="pill">{S(r).code}</span> },
    { k: 'status', l: 'Status', v: r => !r.active ? 'Retired' : S(r).trial ? 'Trial' : S(r).show_on_menu === false ? 'Hidden' : 'On menu',
      cell: r => !r.active ? <span className="pill">Retired</span> : <>{S(r).trial && <span className="pill s-trial">Trial</span>} {S(r).show_on_menu === false ? <span className="pill">Hidden</span> : <span className="pill p-res">On menu</span>}</> },
    { k: 'pallets', l: 'Pallets', num: true, v: r => palletsOf(S(r), inv) || null },
    { k: 'sl', l: 'Yield to SHO %', num: true, v: r => n(P(r)?.set?.solventless_pct) },
    { k: 'hc', l: 'Yield to BHO %', num: true, v: r => n(P(r)?.set?.hydrocarbon_pct) },
    { k: 'y', l: 'Lbs / plant', num: true, v: r => n(eff(P(r), 'yield_lbs_plant'), 2) },
    { k: 'ro', l: 'Rooting %', num: true, v: r => n(eff(P(r), 'rooting_pct'), 0) },
    { k: 'cu', l: 'Cuts / mother', num: true, v: r => n(eff(P(r), 'cuts_per_plant'), 0) },
    { k: 'hv', l: 'Harvest', v: r => (eff(P(r), 'harvest_mmdd') as string | null) ?? null, cell: r => { const h = eff(P(r), 'harvest_mmdd'); return h ? `~${mmdd(h as string)}` : null } },
    { k: 'type', l: 'Type', v: r => S(r).strain_type ?? null, cell: r => S(r).strain_type ? <span className="pill" title={S(r).strain_type!}>{TYPE_SHORT5[S(r).strain_type!] ?? S(r).strain_type}</span> : null },
    { k: 'lin', l: 'Lineage', v: r => S(r).lineage ?? null, cell: r => S(r).lineage && <span className="trunc">{S(r).lineage}</span> },
    { k: 'nur', l: 'Nurseries', v: r => S(r).nurseries?.join(', ') || null, cell: r => S(r).nurseries?.length ? <span className="trunc">{S(r).nurseries!.join(', ')}</span> : null },
    { k: 'aka', l: 'Other names', v: r => S(r).aliases?.join(', ') || null, cell: r => S(r).aliases?.length ? <span className="trunc muted">{S(r).aliases.join(', ')}</span> : null },
  ]
  // each module sees the numbers it works with (Msg 295)
  const BY: Record<StrainFocus, string[]> = {
    dist: ['pallets', 'hv', 'type', 'aka'],
    sales: ['pallets', 'sl', 'hc', 'type', 'lin'],
    cult: ['y', 'hv', 'type', 'lin', 'nur'],
    nurs: ['ro', 'cu', 'type', 'lin', 'nur'],
  }
  const keep = ['name', 'code', 'status', ...BY[focus]]
  return keep.map(k => all.find(x => x.k === k)!).filter(Boolean).map(x => (x.k === 'code' || x.k === 'type' ? { ...x, slim: true } : x))
}
function SetTable({ list, rows, terms, profiles, inv, focus, onOpen, bal, sel }: { list: ListName; rows: ListRow[]; terms: { code: string; label: string }[]; profiles: Map<number, StrainProfile>; inv: Map<string, number>; focus: StrainFocus; onOpen: (r: ListRow) => void; bal?: Map<number, number>; sel?: number | null }) {
  const cols = setCols(list, terms, profiles, inv, focus, bal)
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: 'name', dir: 1 })
  const c = cols.find(x => x.k === sort.k) ?? cols[0]
  const sorted = [...rows].sort((a, b) => {
    const x = c.v(a), y = c.v(b)
    if (x == null && y == null) return 0
    if (x == null) return 1
    if (y == null) return -1
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * sort.dir
  })
  if (!rows.length) return <p className="muted">None.</p>
  return (
    <div className="cwrap settable-w"><table className="ctable settable slimmable">
      <thead><tr>{cols.map((x, i) => <th key={x.k} className={`${x.num ? 'num' : ''} ${i === 0 ? 'pin' : ''} ${i === 0 || x.slim ? 'slim' : ''}`} aria-sort={sort.k === x.k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
        <button onClick={() => setSort(s => ({ k: x.k, dir: s.k === x.k ? (-s.dir as 1 | -1) : 1 }))}>{x.l}{sort.k === x.k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>)}</tr></thead>
      <tbody>{sorted.map(r => <tr key={r.id} className={`tap ${r.active ? '' : 'retired'} ${sel != null && r.id === sel ? 'sel' : ''}`} tabIndex={0} onClick={() => onOpen(r)} onKeyDown={e => { if (e.key === 'Enter') onOpen(r) }}>
        {cols.map((x, i) => { const v = x.cell ? x.cell(r) : x.v(r); return <td key={x.k} className={`${x.num ? 'num' : ''} ${i === 0 ? 'pin' : ''} ${i === 0 || x.slim ? 'slim' : ''}`}>{v == null || v === '' || v === false ? <span className="muted">—</span> : typeof v === 'number' ? v.toLocaleString() : v}</td> })}
      </tr>)}</tbody>
    </table></div>
  )
}

const r1 = (x: unknown, d = 1) => (x == null ? null : String(Math.round(Number(x) * 10 ** d) / 10 ** d))
/** the order strain numbers show in, per module (first ones matter most there) */
const initials = (n: string) => (n.replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('') || '?').toUpperCase()
/** a steady pastel per strain when it has no color of its own */
const hueOf = (n: string) => [...n].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)

/** one strain in the Settings list: photo (or initials), name and tags, then the numbers that matter in this module */

/** the folds a list splits into: [key, title, rows] */
function groupsOf(list: ListName, rows: ListRow[], inv: Map<string, number>): [string, string, ListRow[]][] {
  if (list === 'strains') {
    const st = rows as Strain[]
    const has = (s: Strain) => [s.name, ...(s.aliases ?? [])].some(x => (inv.get(x) ?? [...inv.entries()].find(([k]) => k.toLowerCase() === x.toLowerCase())?.[1] ?? 0) > 0)
    return [['main', 'In the freezers', st.filter(r => r.active && r.show_on_menu !== false && has(r))], ['menu', 'On the menu, none in the freezers', st.filter(r => r.active && r.show_on_menu !== false && !has(r))], ['hidden', 'Hidden from menu', st.filter(r => r.active && r.show_on_menu === false)],
      ['retired', 'Retired', st.filter(r => !r.active)]]
  }
  if (list === 'customers') {
    const cs = rows as Customer[]
    return [['main', 'Customers', cs.filter(r => r.active && r.kind !== 'internal')], ['internal', 'Our sites and labs', cs.filter(r => r.active && r.kind === 'internal')], ['retired', 'Retired', cs.filter(r => !r.active)]]
  }
  return [['main', TITLES[list], rows.filter(r => r.active)], ['retired', 'Retired', rows.filter(r => !r.active)]]
}


// the customer form, split into tabs (Msg 296)
const CUST_TAB: Record<string, string> = { billing_address: 'billing', billing_contact: 'billing', billing_email: 'billing', billing_phone: 'billing',
  ship_to_name: 'shipping', ship_to_address: 'shipping', receiving_contact: 'shipping',
  payment_terms: 'contract', sample_hold_days: 'contract', reserves_enabled: 'contract', price_per_lb: 'contract', contract_lbs: 'contract', monthly_min_lbs: 'contract', deposit_usd: 'contract', storage_fee: 'contract' }
const STRAIN_TYPES_5 = ['Indica', 'Indica Hybrid', 'Hybrid', 'Sativa Hybrid', 'Sativa']
const TYPE_SHORT5: Record<string, string> = { Indica: 'I', 'Indica Hybrid': 'I/H', Hybrid: 'H', 'Sativa Hybrid': 'S/H', Sativa: 'S' }

export function EditForm({ list, row, busy, onClose, onSave, extra, terms, carriers, cats, nurseries, tabExtra }: {
  list: ListName; row: Partial<ListRow>; busy: boolean; onClose: () => void; onSave: (r: Partial<ListRow>) => void; extra?: React.ReactNode
  terms?: { code: string; label: string }[]; carriers?: { id: number; name: string; license_no: string | null }[]
  cats?: string[]; nurseries?: string[]; tabExtra?: { contract?: React.ReactNode; logins?: React.ReactNode }
}) {
  const [r, setR] = useState<Record<string, unknown>>(row as Record<string, unknown>)
  const [touched, setTouched] = useState<Set<string>>(new Set())
  const set = (k: string, v: unknown) => { setR(x => ({ ...x, [k]: v })); setTouched(t => new Set(t).add(k)) }
  const locked = list === 'customers' && row.id != null && LOCKED.has(String(row.name).toLowerCase())
  const [aliasText, setAliasText] = useState(((row as Strain).aliases ?? []).join(', '))
  const colorOk = !r.color || /^#[0-9a-f]{6}$/i.test(String(r.color))
  const [ctab, setCtab] = useState('overview')
  const isCust = list === 'customers', ext = isCust && r.kind !== 'internal'
  function submit() {
    const out: Record<string, unknown> = { ...r, name: String(r.name ?? '').trim() }
    for (const k of Object.keys(out)) if (typeof out[k] === 'string' && k !== 'name') out[k] = (out[k] as string).trim() || null
    if (list === 'strains') out.aliases = parseAliases(aliasText)
    // the new fields (296) only go out once they exist or someone set them
    for (const k of ['product_categories', 'lineage', 'nurseries']) if (!(k in row) && !touched.has(k)) delete out[k]
    onSave(out as Partial<ListRow>)
  }
  const fieldFor = (c: typeof COLS[ListName][number]) => (
    <div className="field" key={c.key}>
      <label>{c.label}{c.hint && <span className="muted"> ({c.hint})</span>}</label>
      {c.kind === 'kind' ? (
        <div className="choices">
          {(['external', 'internal'] as const).map(k => (
            <button key={k} disabled={locked} className={r.kind === k ? 'on' : ''} onClick={() => set('kind', k)}>{k === 'internal' ? 'Internal (our site or lab)' : 'External customer'}</button>
          ))}
        </div>
      ) : c.kind === 'aliases' ? (
        <input value={aliasText} onChange={e => setAliasText(e.target.value)} placeholder="e.g. KLP, Key Lime" />
      ) : c.kind === 'color' ? (
        <div className="row">
          <input type="color" value={colorOk && r.color ? String(r.color) : '#cccccc'} onChange={e => set('color', e.target.value)} />
          <input style={{ flex: 1 }} value={String(r.color ?? '')} placeholder="Auto" onChange={e => set('color', e.target.value)} />
          {Boolean(r.color) && <button className="ghost small" onClick={() => set('color', null)}>Auto</button>}
        </div>
      ) : c.kind === 'area' ? (
        <textarea rows={3} value={String(r[c.key] ?? '')} onChange={e => set(c.key, e.target.value)} />
      ) : c.kind === 'terms' ? (
        <Select value={String(r[c.key] ?? '')} onChange={e => set(c.key, e.target.value || null)}>
          <option value="">Due on receipt (default)</option>
          {(terms ?? []).map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
        </Select>
      ) : c.kind === 'bool' ? (
        <label className="check"><input type="checkbox" checked={Boolean(r[c.key] ?? c.key === 'show_on_menu')} onChange={e => set(c.key, e.target.checked)} /> On</label>
      ) : c.kind === 'num' ? (
        <input type="number" min="0" step="any" value={String(r[c.key] ?? '')} onChange={e => set(c.key, e.target.value === '' ? null : Number(e.target.value))} />
      ) : c.kind === 'int' ? (
        <input type="number" min="1" step="1" value={String(r[c.key] ?? '')} onChange={e => set(c.key, e.target.value === '' ? null : parseInt(e.target.value, 10))} />
      ) : (
        <input value={String(r[c.key] ?? '')} disabled={locked && c.key === 'name'} autoFocus={c.key === 'name'} onChange={e => set(c.key, e.target.value)} />
      )}
    </div>
  )
  const cols = COLS[list].filter(c => c.kind !== 'active')
  const carrier = ext && <div className="field">
    <label>Pickup carrier <span className="muted">(who picks up for them; fills in the driver, truck and transport license on a Customer pickup. Vehicles › Carriers)</span></label>
    <Select value={r.pickup_carrier_id == null ? '' : String(r.pickup_carrier_id)} onChange={e => set('pickup_carrier_id', e.target.value ? Number(e.target.value) : null)}>
      <option value="">None</option>
      {(carriers ?? []).map(k => <option key={k.id} value={k.id}>{k.name}{k.license_no ? ` · ${k.license_no}` : ''}</option>)}
    </Select></div>
  const tabs = [['overview', 'Overview'], ['billing', 'Billing'], ['shipping', 'Shipping'], ['contract', 'Contract and terms'], ...(tabExtra?.logins ? [['logins', 'Portal logins']] : [])]
  return (
    <div className="scrim" onClick={onClose}>
      <div className={`sheet form ${isCust || list === 'strains' ? 'big side' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="sheet-h"><h2>{row.id ? (String(row.name ?? '') || `Edit ${SINGULAR[list]}`) : `Add ${SINGULAR[list]}`}</h2><button className="ghost" onClick={onClose}>✕</button></div>
        {isCust ? <>
          <nav className="ftabs">{tabs.map(([k, l]) => <button key={k} className={ctab === k ? 'on' : ''} onClick={() => setCtab(k)}>{l}</button>)}</nav>
          {ctab === 'overview' && ext && <div className="field fsec">
            <label>What they buy <span className="muted">(product categories; Sales admins edit the list in Sales settings › Product categories)</span></label>
            <MultiPick options={cats ?? []} value={(r.product_categories as string[] | undefined) ?? []} onChange={v => set('product_categories', v)} /></div>}
          <div className="fgrid">{cols.filter(c => (CUST_TAB[c.key] ?? 'overview') === ctab).map(fieldFor)}</div>
          {ctab === 'shipping' && carrier}
          {ctab === 'contract' && tabExtra?.contract}
          {ctab === 'logins' && tabExtra?.logins}
        </> : list === 'strains' ? <>
          <div className="fgrid">{cols.filter(c => ['name', 'aliases'].includes(c.key)).map(fieldFor)}</div>
          <div className="field fsec">
            <label>Type <span className="muted">(one; shows on the menus in the app and the customer portal)</span></label>
            <div className="mpick">{STRAIN_TYPES_5.map(t => { const on = r.strain_type === t
              return <button type="button" key={t} className={`mpick-b ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => set('strain_type', on ? null : t)}><i>{on ? '✓' : ''}</i>{t} ({TYPE_SHORT5[t]})</button> })}</div></div>
          <div className="fgrid">
            <div className="field"><label>Lineage <span className="muted">(parents or cross, for example Gelato 41 x Mule Fuel)</span></label>
              <input value={String(r.lineage ?? '')} placeholder="Mother x Father" onChange={e => set('lineage', e.target.value)} /></div>
            <div className="field"><label>Nurseries <span className="muted">(where we get it; pick all that apply)</span></label>
              <MultiPick options={nurseries ?? []} value={(r.nurseries as string[] | undefined) ?? []} onChange={v => set('nurseries', v)} /></div>
          </div>
          <div className="fgrid">{cols.filter(c => !['name', 'aliases'].includes(c.key)).map(fieldFor)}</div>
        </> : cols.map(fieldFor)}
        {!colorOk && <div className="warn-t">Color must look like #A1B2C3</div>}
        {!isCust && list !== 'strains' && carrier}
        {extra}
        {locked && <p className="muted">{String(row.name)} is a Lifted site. You can edit its details but not rename or retire it.</p>}
        <div className="row between fbar">
          {row.id && !locked
            ? <button className="ghost" disabled={busy} onClick={() => onSave({ id: row.id, active: !r.active } as Partial<ListRow>)}>{r.active ? 'Retire' : 'Restore'}</button>
            : <span />}
          <div className="row">
            <button className="ghost" onClick={onClose}>Cancel</button>
            <button className="primary" disabled={busy || !String(r.name ?? '').trim() || !colorOk} onClick={submit}>Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ImportPreview({ list, plan, busy, onClose, onApply }: {
  list: ListName; plan: { rows: PlanRow[]; found: string[]; file: string }; busy: boolean; onClose: () => void; onApply: () => void
}) {
  const count = (s: PlanRow['status']) => plan.rows.filter(r => r.status === s).length
  const n = count('new'), u = count('update')
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet form wide" onClick={e => e.stopPropagation()}>
        <div className="sheet-h"><h2>Import {TITLES[list].toLowerCase()}</h2><button className="ghost" onClick={onClose}>✕</button></div>
        <p className="muted">{plan.file} · columns found: {plan.found.join(', ')}</p>
        <div className="row chips">
          <span className="chip new">{n} new</span><span className="chip upd">{u} updates</span>
          <span className="chip">{count('same')} unchanged</span>{count('error') > 0 && <span className="chip err">{count('error')} skipped</span>}
        </div>
        <div className="picklist preview">
          {plan.rows.filter(r => r.status !== 'same').map(r => (
            <div key={r.line} className={`prev s-${r.status}`}>
              <span className="muted">row {r.line}</span><b>{r.name}</b>
              <span>{r.status === 'new' ? 'new' : r.status === 'update' ? `update ${r.changes?.join(', ')}` : r.msg}</span>
            </div>
          ))}
          {n + u + count('error') === 0 && <div className="muted" style={{ padding: 10 }}>Everything in the file already matches.</div>}
        </div>
        <div className="row end">
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy || n + u === 0} onClick={onApply}>{busy ? 'Importing…' : `Import ${n + u}`}</button>
        </div>
      </div>
    </div>
  )
}

// contract terms by crop year: the terms above carry over until a later year gets its own
const TERM_KEYS: { k: keyof CustomerTerms; l: string }[] = [
  { k: 'price_per_lb', l: 'Price $/lb' }, { k: 'contract_lbs', l: 'Contract lbs' }, { k: 'monthly_min_lbs', l: 'Monthly min lbs' },
  { k: 'deposit_usd', l: 'Deposit $' }, { k: 'storage_fee', l: 'Storage fee' },
]
function TermsByYear({ backend, c }: { backend: Backend; c: Customer }) {
  const [rows, setRows] = useState<CustomerTerms[] | null>(null)
  const [ys, setYs] = useState<ReserveYears | null>(null)
  const [edit, setEdit] = useState<CustomerTerms | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const load = () => backend.listTerms().then(t => setRows(t.filter(x => x.customer_id === c.id))).catch(() => setRows([]))
  useEffect(() => { load(); backend.reserveYears().then(setYs).catch(() => {}) }, [c.id])
  if (!rows || !ys) return null
  const cur = ys.current
  const years = [...new Set([...ys.years.map(y => y.year).filter(y => y > cur), ...rows.map(r => r.crop_year)])].sort((a, b) => a - b)
  if (!years.length) return null
  const base = c as unknown as Record<string, number | null>
  const inForce = (y: number) => rows.filter(r => r.crop_year <= y).sort((a, b) => b.crop_year - a.crop_year)[0]
  const fmt = (t: Record<string, unknown>) => t.price_per_lb != null ? `$${Number(t.price_per_lb).toFixed(2)}/lb` : 'market price'
  async function save(clear: boolean) {
    if (!edit) return
    try { await backend.setTerms(edit, clear); setEdit(null); setMsg(clear ? `${edit.crop_year} terms removed` : `${edit.crop_year} terms saved`); load() }
    catch (e) { setMsg(String((e as Error).message ?? e)) }
  }
  return (
    <div className="field">
      <label>Terms by crop year</label>
      <p className="muted">The terms above are this customer's {cur} terms and carry over to later crops until a year gets its own.</p>
      {years.map(y => {
        const own = rows.find(r => r.crop_year === y), f = inForce(y)
        return (
          <div key={y} className="row between">
            <span><b>{y}</b> <span className="muted">{own ? fmt(own as unknown as Record<string, unknown>) : `same as ${f ? f.crop_year : cur} (${fmt((f ?? base) as unknown as Record<string, unknown>)})`}</span></span>
            <button className="ghost small" onClick={() => setEdit(own ?? { customer_id: c.id!, crop_year: y,
              price_per_lb: (f ?? base).price_per_lb ?? null, contract_lbs: (f ?? base).contract_lbs ?? null, monthly_min_lbs: (f ?? base).monthly_min_lbs ?? null,
              deposit_usd: (f ?? base).deposit_usd ?? null, storage_fee: (f ?? base).storage_fee ?? null })}>{own ? 'Edit' : `Set ${y} terms`}</button>
          </div>
        )
      })}
      {edit && (
        <div className="card-ish">
          <b>{edit.crop_year} terms</b>
          {TERM_KEYS.map(t => (
            <div key={t.k} className="field"><label>{t.l}</label>
              <input type="number" min="0" step="any" value={edit[t.k] == null ? '' : String(edit[t.k])}
                onChange={e => setEdit({ ...edit, [t.k]: e.target.value === '' ? null : Number(e.target.value) })} /></div>
          ))}
          <div className="row">
            <button className="primary small" onClick={() => save(false)}>Save {edit.crop_year} terms</button>
            {rows.some(r => r.crop_year === edit.crop_year) && <button className="ghost small" onClick={() => save(true)}>Remove (carry over instead)</button>}
            <button className="ghost small" onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </div>
      )}
      {msg && <p className="muted">{msg}</p>}
    </div>
  )
}
