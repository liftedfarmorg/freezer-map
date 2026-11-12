import { ListInput } from './combo'
import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Fold, isAdminOf } from './fold'
import { STRAIN_PHOTOS } from './strainPhotos'

// Strain profile: what the app's own data says (auto) and what an Admin set by hand (overrides).
export interface StrainAuto {
  rooting_pct: number | null; rooting_n: number | null; cuts_per_plant: number | null; cuts_src: string | null
  yield_lbs_plant: number | null; yield_n: number | null; harvest_mmdd: string | null; harvest_n: number | null
}
export interface StrainSet {
  rooting_pct?: number | null; cuts_per_plant?: number | null; yield_lbs_plant?: number | null; harvest_mmdd?: string | null
  solventless_pct?: number | null; hydrocarbon_pct?: number | null; spot_price?: number | null; photo_url?: string | null; menu_note?: string | null; updated_by?: string | null; updated_at?: string | null
  /** 325: the high end of the yield; solventless_pct / hydrocarbon_pct are the low */
  solventless_high_pct?: number | null; hydrocarbon_high_pct?: number | null
}
export interface StrainProfile { id: number; name: string; auto: StrainAuto; set: StrainSet }
export interface MenuInfo { name: string; solventless_pct: number | null; hydrocarbon_pct: number | null; spot_price: number | null; photo_url: string | null; menu_note: string | null; lineage: string | null
  /** 325: high end of the yield (missing until 325 is run) */
  solventless_high_pct?: number | null; hydrocarbon_high_pct?: number | null }

export async function loadProfiles(sb: SupabaseClient | null): Promise<Map<number, StrainProfile>> {
  if (!sb) return new Map()
  const { data, error } = await sb.rpc('strain_profiles')
  if (error) return new Map()
  return new Map(((data ?? []) as StrainProfile[]).map(p => [p.id, p]))
}
/** menu facts by lower-case strain name (anyone signed in, customers too) */
export async function loadMenuInfo(sb: SupabaseClient | null): Promise<Map<string, MenuInfo>> {
  if (!sb) return new Map()
  const { data, error } = await sb.rpc('strain_menu_info')
  if (error) return new Map()
  return new Map(((data ?? []) as MenuInfo[]).map(m => [m.name.toLowerCase(), m]))
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const mmdd = (s: string | null | undefined) => { if (!s) return ''; const [m, d] = s.split('-').map(Number); return m ? `${MON[m - 1]} ${d}` : s }
const f1 = (x: number | null | undefined, d = 1) => (x == null ? '' : String(Math.round(Number(x) * 10 ** d) / 10 ** d))
/** 325: a yield as a range, low–high ("4.5–6%"); one number when only one is set or they match; '' when neither */
export function yieldRange(lo: number | null | undefined, hi: number | null | undefined, sep = '–') {
  const a = lo == null ? null : Number(lo), b = hi == null ? null : Number(hi)
  if (a == null && b == null) return ''
  if (a == null || b == null || a === b) return `${f1(a ?? b)}%`
  return `${f1(a)}${sep}${f1(b)}%`
}
/** effective value: override, else auto */
export const eff = <K extends keyof StrainAuto & keyof StrainSet>(p: StrainProfile | undefined, k: K) => (p?.set?.[k] ?? p?.auto?.[k] ?? null) as StrainAuto[K] | null
export function profileLine(p: StrainProfile | undefined) {
  if (!p) return ''
  const s = p.set, bits = [
    yieldRange(s.solventless_pct, s.solventless_high_pct) ? `${yieldRange(s.solventless_pct, s.solventless_high_pct)} solventless` : '',
    yieldRange(s.hydrocarbon_pct, s.hydrocarbon_high_pct) ? `${yieldRange(s.hydrocarbon_pct, s.hydrocarbon_high_pct)} hydrocarbon` : '',
    eff(p, 'yield_lbs_plant') != null ? `${f1(eff(p, 'yield_lbs_plant'), 2)} lbs/plant` : '',
    eff(p, 'rooting_pct') != null ? `${f1(eff(p, 'rooting_pct'), 0)}% rooting` : '',
    eff(p, 'harvest_mmdd') ? `harvest ~${mmdd(eff(p, 'harvest_mmdd') as string)}` : '',
  ]
  return bits.filter(Boolean).join(' · ')
}

type Field = { k: keyof StrainSet; l: string; unit?: string; auto?: (a: StrainAuto) => string; text?: boolean; hint?: string; half?: boolean }
const GROUPS: { m: 'nursery' | 'cultivation' | 'sales'; l: string; fields: Field[] }[] = [
  { m: 'nursery', l: 'Nursery', fields: [
    { k: 'rooting_pct', l: 'Rooting rate', unit: '%', auto: a => a.rooting_pct != null ? `${f1(a.rooting_pct)}% from ${a.rooting_n} sorted batch${a.rooting_n === 1 ? '' : 'es'}` : '' },
    { k: 'cuts_per_plant', l: 'Cuts per plant', auto: a => a.cuts_per_plant != null ? `${f1(a.cuts_per_plant)} from ${a.cuts_src}` : '' },
  ] },
  { m: 'cultivation', l: 'Cultivation', fields: [
    { k: 'yield_lbs_plant', l: 'Fresh frozen per plant', unit: 'lbs', auto: a => a.yield_lbs_plant != null ? `${f1(a.yield_lbs_plant, 2)} lbs from ${a.yield_n} harvest${a.yield_n === 1 ? '' : 's'}` : '' },
    { k: 'harvest_mmdd', l: 'Typical harvest date', text: true, hint: 'MM-DD', auto: a => a.harvest_mmdd ? `${mmdd(a.harvest_mmdd)} (average of ${a.harvest_n})` : '' },
  ] },
  { m: 'sales', l: 'Sales and extraction', fields: [
    // 325: each yield is a low and a high, side by side; blank high = just the low
    { k: 'solventless_pct', l: 'SHO yield, low', unit: '%', half: true },
    { k: 'solventless_high_pct', l: 'high', unit: '%', hint: 'blank = one number', half: true },
    { k: 'hydrocarbon_pct', l: 'BHO yield, low', unit: '%', half: true },
    { k: 'hydrocarbon_high_pct', l: 'high', unit: '%', hint: 'blank = one number', half: true },
    { k: 'spot_price', l: 'Spot price', unit: '$/lb', hint: 'blank = the catalog\'s price' },
    { k: 'photo_url', l: 'Photo', text: true, hint: 'pick one of ours, or paste a link' },
    { k: 'menu_note', l: 'Menu note', text: true, hint: 'a line for the menu and catalog' },
  ] },
]

/** the strain sheet's profile: one fold per module; only that module's Admins can override */
// YLD-17 (SQL 328): what customers reported for this strain, all crop years, and what the menu shows because of it
type RepOne = { lo: number | null; hi: number | null; avg: number | null; runs: number; customers: number; lbs: number; ready: boolean }
type RepAll = { sho: RepOne; bho: RepOne; source: string; menu: { sho: number | null; sho_high: number | null; bho: number | null; bho_high: number | null } | null }
function ReportedBox({ sb, p }: { sb: SupabaseClient | null; p: StrainProfile }) {
  const [d, setD] = useState<RepAll | null>(null)
  useEffect(() => { sb?.rpc('strain_reported_yields', { p_strain: p.id }).then(({ data, error }) => setD(error ? null : (data as RepAll | null))) }, [p.id, JSON.stringify(p.set ?? {})])
  if (!d) return null
  const line = (nm: string, r: RepOne) => r.runs === 0 ? <div><b>{nm}</b> <span className="muted">no customer reports yet</span></div>
    : <div><b>{nm} {yieldRange(r.lo, r.hi)}</b> <span className="muted">avg {r.avg != null ? `${f1(r.avg)}%` : '–'} · {r.runs} run{r.runs === 1 ? '' : 's'} · {r.customers} customer{r.customers === 1 ? '' : 's'} · {Math.round(r.lbs).toLocaleString()} lbs</span>
      {' '}{d.source === 'reported' ? <span className="pill m-ok">on the menu</span> : r.ready ? <span className="pill m-ok">counts on the menu</span>
        : <span className="pill m-mute" title="Counts once 2+ customers and 100+ lbs have reported it">not counted yet</span>}</div>
  const m = d.menu, ms = [yieldRange(m?.sho, m?.sho_high) && `SHO ${yieldRange(m?.sho, m?.sho_high)}`, yieldRange(m?.bho, m?.bho_high) && `BHO ${yieldRange(m?.bho, m?.bho_high)}`].filter(Boolean).join(' · ')
  return <div className="srep">
    <div className="srep-h">Customer reports <span className="muted">· all crop years, sent reports only</span></div>
    {line('SHO', d.sho)}{line('BHO', d.bho)}
    <div className="muted small">Menu shows {ms || 'no yield'} · {d.source === 'reported' ? 'customer reports only (Sales › Open menu › Menu yields)'
      : 'the higher of the numbers above vs our low and high, at each end, once a report counts'}</div>
  </div>
}

/** STRAIN-INV-1: the strain card's tab (Details / Where / nursery / cultivation / sales); null = old fold layout */
export const StrainTab = createContext<string | null>(null)
/** show children only on one tab of the strain card (or always, outside the tabbed card) */
export function OnStrainTab({ tab, children }: { tab: string; children: ReactNode }) { const cur = useContext(StrainTab); return cur == null || cur === tab ? <>{children}</> : null }

export function StrainProfileEdit({ sb, p, flash, onSaved, saveRef }: { sb: SupabaseClient | null; p: StrainProfile; flash: (t: string, bad?: boolean) => void; onSaved: () => void
  /** YLD-12: lets the strain sheet's main Save also save any changed profile fields (they used to be dropped) */
  saveRef?: { current: null | (() => Promise<boolean>) } }) {
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(p.set ?? {}).map(([k, x]) => [k, x == null ? '' : String(x)])))
  const [busy, setBusy] = useState(false)
  async function save(m: string, fields: Field[], quiet = false): Promise<boolean> {
    if (!sb) return false
    const vals: Record<string, string | number | null> = {}
    for (const f of fields) {
      const s = (v[f.k] ?? '').trim()
      if (s === String(p.set?.[f.k] ?? '')) continue
      if (f.k === 'harvest_mmdd' && s && !/^\d{2}-\d{2}$/.test(s)) { flash('Harvest date looks like 10-08 (month-day)', true); return false }
      if (!f.text && s !== '' && !Number.isFinite(Number(s))) { flash(`${f.l}: that's not a number`, true); return false }
      vals[f.k] = s === '' ? null : f.text ? s : Number(s)
    }
    // 325: a low can't be above its high (the database checks too)
    for (const [lo, hi, nm] of [['solventless_pct', 'solventless_high_pct', 'Solventless'], ['hydrocarbon_pct', 'hydrocarbon_high_pct', 'Hydrocarbon']] as const) {
      const a = (v[lo] ?? '').trim(), b = (v[hi] ?? '').trim()
      if (fields.some(f => f.k === lo) && a !== '' && b !== '' && Number(a) > Number(b)) { flash(`${nm} yield: the low (${a}%) is above the high (${b}%)`, true); return false }
    }
    if (!Object.keys(vals).length) return true
    setBusy(true)
    const { error } = await sb.rpc('set_strain_info', { p_strain: p.id, p_vals: vals })
    setBusy(false)
    if (error) flash(/set_strain_info/.test(error.message) ? 'Run 040_strains_access_pallets.sql in Supabase first'
      : /Unknown strain field \w+_high_pct/.test(error.message) ? 'Run 325_strain_yield_ranges.sql in Supabase first' : error.message, true)
    else { if (!quiet) flash(`${p.name}: ${m} saved`); onSaved() }
    return !error
  }
  // YLD-12: every fold this person can change, that has unsaved edits
  async function saveAll() {
    for (const g of GROUPS) {
      if (!isAdminOf(g.m) || !g.fields.some(f => (v[f.k] ?? '').trim() !== String(p.set?.[f.k] ?? ''))) continue
      if (!(await save(g.l, g.fields, true))) return false
    }
    return true
  }
  if (saveRef) saveRef.current = saveAll
  const tab = useContext(StrainTab)
  useEffect(() => () => { if (saveRef) saveRef.current = null }, [])
  // in the tabbed strain card only the open tab's group shows (this stays mounted, so the card's Save still saves every group)
  const groups = tab == null ? GROUPS : GROUPS.filter(g => g.m === tab)
  if (tab != null && !groups.length) return null
  return <div className="sprofile">
    {groups.map(g => {
      const can = isAdminOf(g.m), dirty = g.fields.some(f => (v[f.k] ?? '') !== String(p.set?.[f.k] ?? ''))
      const body = <>
        {g.fields.map(f => {
          const a = f.auto?.(p.auto) ?? '', over = p.set?.[f.k] != null
          return <div key={f.k} className={`field sfield${f.half ? ' half' : ''}`}>
            <label>{f.l}{f.unit ? ` (${f.unit})` : ''}{f.hint && <span className="muted"> · {f.hint}</span>}</label>
            <div className="row">
              <ListInput value={v[f.k] ?? ''} disabled={!can} list={f.k === 'photo_url' ? 'strain-photos' : undefined} inputMode={f.text ? undefined : 'decimal'} placeholder={f.auto ? (a ? 'auto' : 'no data yet') : ''}
                onChange={e => setV(s => ({ ...s, [f.k]: e.target.value }))} />
              {can && over && f.auto && <button className="ghost small" onClick={() => setV(s => ({ ...s, [f.k]: '' }))}>Use auto</button>}
            </div>
            {f.auto && <div className="muted small">{a ? `Auto: ${a}` : 'Auto: not enough data yet'}{over ? ' · overridden' : ''}</div>}
            {f.k === 'photo_url' && <datalist id="strain-photos">{STRAIN_PHOTOS.map(u => <option key={u} value={u} />)}</datalist>}
            {f.k === 'photo_url' && v.photo_url && /^(https?:|\/)/.test(v.photo_url) && <img className="sphoto" src={v.photo_url} alt={p.name} />}
          </div>
        })}
        {g.m === 'sales' && <ReportedBox sb={sb} p={p} />}
        {can ? <div className="row"><button className="primary small" disabled={busy || !dirty} onClick={() => save(g.l, g.fields)}>Save {g.l.toLowerCase()}</button></div>
          : <p className="muted small">Only a {g.l === 'Sales and extraction' ? 'Sales' : g.l} Admin can change these.</p>}
      </>
      return tab != null ? <div key={g.m} className="stabsec">{body}</div>
        : <Fold key={g.m} id={`strain.${g.m}`} title={g.l} open={g.m === 'sales'} count={can ? '' : '· view only'}>{body}</Fold>
    })}
    {p.set?.updated_by && <p className="muted small">Last change {p.set.updated_by.split('@')[0]}{p.set.updated_at ? ` · ${new Date(p.set.updated_at).toLocaleDateString()}` : ''}</p>}
  </div>
}
