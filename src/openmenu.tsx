import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import './openmenu.css'

// 174: the new open menu. Sales > Open menu (staff) and the public link (lifted-orders.app/menu/<code>, no login).
// Fresh Frozen + Dry Flower (Standards, Smalls), crop year buttons, search, sortable columns, total row; tap a strain name for
// its card (photo, type, lineage, SHO / BHO yield on fresh frozen, THC on dry flower). Matt's customer portal menu is separate.

export interface MenuLine { product: 'FF' | 'ST' | 'SM'; strain: string; crop_year: number; open_lbs: number; price: number | null; strain_type: string | null
  lineage: string | null; sho: number | null; bho: number | null; thc: number | null; photo_url: string | null; note: string | null
  /** 196: strain's default grade (SHO / BHO); missing until 196 is run */
  grade?: string | null
  /** 325: high end of the SHO / BHO yield (sho / bho are the low); missing until 325 is run */
  sho_high?: number | null; bho_high?: number | null }
type Group = 'ff' | 'df'
const GROUP: Record<Group, string> = { ff: 'Fresh Frozen', df: 'Dry Flower' }
const PROD: Record<MenuLine['product'], string> = { FF: 'Fresh Frozen', ST: 'Standards', SM: 'Smalls' }
const SALES = 'sales@lifted-organics.com'
const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
// 196: type short codes (S, S/H, H, I/H, I); grade + type are columns on wide screens, one small pill on phones
const TSHORT: Record<string, string> = { Sativa: 'S', 'Sativa Hybrid': 'S/H', Hybrid: 'H', 'Indica Hybrid': 'I/H', Indica: 'I' }
const TORDER: Record<string, number> = { S: 1, 'S/H': 2, H: 3, 'I/H': 4, I: 5 }
const tShort = (r: MenuLine) => (r.strain_type && TSHORT[r.strain_type]) || null
const pct = (v: number | null) => (v == null ? '–' : `${Number(v).toFixed(1)}%`)
// 325: low–high when both are set and differ, else the one number
const isRange = (lo: number | null, hi: number | null | undefined) => lo != null && hi != null && Number(hi) !== Number(lo)
const yld = (lo: number | null, hi: number | null | undefined) => isRange(lo, hi) ? `${Number(lo).toFixed(1)}–${Number(hi).toFixed(1)}%` : pct(lo ?? hi ?? null)

export function MenuBoard({ rows, variant }: { rows: MenuLine[]; variant: 'staff' | 'public' }) {
  const [group, setGroup] = useState<Group>('ff')
  const [year, setYear] = useState<number | 'all'>('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ col: 's' | 'y' | 'p' | 'open' | 'price' | 'g' | 't' | 'sho' | 'bho'; dir: number }>({ col: 's', dir: 1 })
  const [open, setOpen] = useState<MenuLine | null>(null)
  const inGroup = rows.filter(r => (group === 'ff' ? r.product === 'FF' : r.product !== 'FF') && r.open_lbs > 0)
  const years = useMemo(() => [...new Set(inGroup.map(r => r.crop_year))].sort((a, b) => b - a), [rows, group])
  const ql = q.trim().toLowerCase()
  const list = inGroup.filter(r => (year === 'all' || r.crop_year === year) && (!ql || r.strain.toLowerCase().includes(ql)))
  const byName = (a: MenuLine, b: MenuLine) => a.strain.localeCompare(b.strain) || b.crop_year - a.crop_year || a.product.localeCompare(b.product)
  const val = (r: MenuLine) => sort.col === 'y' ? r.crop_year : sort.col === 'open' ? r.open_lbs : sort.col === 'price' ? (r.price ?? 1e9) : sort.col === 'g' ? ({ SHO: 1, BHO: 2 } as Record<string, number>)[r.grade ?? ''] ?? 9 : sort.col === 't' ? TORDER[tShort(r) ?? ''] ?? 9 : sort.col === 'sho' ? Number(r.sho ?? r.sho_high ?? -1) : sort.col === 'bho' ? Number(r.bho ?? r.bho_high ?? -1) : 0
  const sorted = [...list].sort((a, b) => sort.col === 's' ? sort.dir * byName(a, b) : sort.col === 'p' ? sort.dir * a.product.localeCompare(b.product) || byName(a, b) : sort.dir * (val(a) - val(b)) || byName(a, b))
  const total = list.reduce((t, r) => t + r.open_lbs, 0)
  const allTotal = inGroup.reduce((t, r) => t + r.open_lbs, 0)
  const strains = new Set(inGroup.map(r => r.strain.toLowerCase())).size
  const sh = (col: typeof sort.col, label: string) => {
    const on = sort.col === col
    return <button type="button" className={`om-sort ${on ? 'on' : ''}`} aria-sort={on ? (sort.dir > 0 ? 'ascending' : 'descending') : undefined}
      onClick={() => setSort({ col, dir: on ? -sort.dir : col === 's' || col === 'p' ? 1 : -1 })}>{label}<i aria-hidden="true">{on ? (sort.dir > 0 ? '▲' : '▼') : '↕'}</i></button>
  }
  const dry = group === 'df'
  // YLD-11/13: SHO / BHO yield columns on fresh frozen: always on the staff Open menu; on the public link only once a strain has a yield
  const hasY = (r: MenuLine) => r.sho != null || r.sho_high != null || r.bho != null || r.bho_high != null
  const showY = !dry && (variant === 'staff' || inGroup.some(hasY)), yl = showY ? ' yl' : ''
  const price = (r: MenuLine) => r.price != null ? `$${Number(r.price).toLocaleString('en-US', { maximumFractionDigits: 2 })}` : <a className="om-call" href={`mailto:${SALES}`} onClick={e => e.stopPropagation()}>Call/Email</a>
  return <div className={`om om-${variant}`}>
    <div className="om-kpis">
      <div className="om-kpi"><p>{GROUP[group]} available</p><b>{fmt(allTotal)} lbs</b></div>
      <div className="om-kpi"><p>Strains</p><b>{strains}</b></div>
    </div>
    <section className="om-card">
      <div className="om-bar om-tabs">{(Object.keys(GROUP) as Group[]).map(g => <button key={g} aria-pressed={group === g} onClick={() => { setGroup(g); setYear('all') }}>{GROUP[g]}</button>)}</div>
      <div className="om-bar">
        <div className="om-pills">
          <button aria-pressed={year === 'all'} onClick={() => setYear('all')}>All</button>
          {years.length > 1 && years.map(y => <button key={y} aria-pressed={year === y} onClick={() => setYear(year === y ? 'all' : y)}>{y}</button>)}
        </div>
        <input className="om-search" type="search" placeholder="Search strains" value={q} onChange={e => setQ(e.target.value)} aria-label="Search strains" />
      </div>
      <div className="om-scroll">
        <div className={`om-row om-head ${dry ? 'dry' : ''}${yl}`}>{sh('s', 'Strain')}{!dry && <span className="om-tc">{sh('g', 'Grade')}</span>}<span className="om-tc">{sh('t', 'Type')}</span>{showY && <><span className="om-tc">{sh('sho', 'SHO yield')}</span><span className="om-tc">{sh('bho', 'BHO yield')}</span></>}{dry && sh('p', 'Product')}{sh('y', 'Crop year')}{sh('open', 'Available (lbs)')}{sh('price', 'Price / lb')}</div>
        {!sorted.length && <p className="om-empty">{inGroup.length ? 'No strains match.' : `No ${GROUP[group].toLowerCase()} on the menu right now.`}</p>}
        {sorted.map(r => <div key={`${r.product}|${r.strain}|${r.crop_year}`} className={`om-row ${dry ? 'dry' : ''}${yl}`}>
          <span><button className="om-name" onClick={() => setOpen(r)}>{r.strain}</button>{(() => { const t = tShort(r), g = dry ? null : r.grade; return g || t ? <span className="om-tagpill">{[g, t].filter(Boolean).join(' · ')}</span> : null })()}
            {showY && hasY(r) && <span className="om-ymob">{[r.sho != null || r.sho_high != null ? `SHO ${yld(r.sho, r.sho_high)}` : '', r.bho != null || r.bho_high != null ? `BHO ${yld(r.bho, r.bho_high)}` : ''].filter(Boolean).join(' · ')}</span>}</span>
          {!dry && <span className="om-tc">{r.grade ? <span className={`om-gtag g-${r.grade.toLowerCase()}`}>{r.grade}</span> : null}</span>}
          <span className="om-tc">{tShort(r) ? <span className="om-ttag" title={r.strain_type ?? ''}>{tShort(r)}</span> : null}</span>
          {showY && <><span className="om-tc om-dim">{yld(r.sho, r.sho_high)}</span><span className="om-tc om-dim">{yld(r.bho, r.bho_high)}</span></>}
          {dry && <span className="om-dim">{PROD[r.product]}</span>}
          <span className="om-dim">{r.crop_year}</span><b>{fmt(r.open_lbs)}</b><span className="om-price">{price(r)}</span>
        </div>)}
        {sorted.length > 0 && <div className={`om-row om-total ${dry ? 'dry' : ''}${yl}`}><b>Total · {sorted.length} line{sorted.length === 1 ? '' : 's'}</b>{!dry && <span className="om-tc" />}<span className="om-tc" />{showY && <><span className="om-tc" /><span className="om-tc" /></>}{dry && <span />}<span /><b className="om-green">{fmt(total)}</b><span /></div>}
      </div>
    </section>
    <p className="om-note">Available = lbs on hand that aren't reserved or already on a confirmed order. Numbers change as orders and reserves are confirmed.{group === 'ff' ? ' Fresh frozen is sold in 10 lb boxes.' : ''} Prices are per lb and can change.</p>
    {open && <StrainPop line={open} onClose={() => setOpen(null)} />}
  </div>
}

function StrainPop({ line, onClose }: { line: MenuLine; onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [])
  const ty = line.strain_type ?? null
  return <div className="om-ov" onClick={onClose} role="dialog" aria-modal="true" aria-label={line.strain}>
    <div className="om-sheet" onClick={e => e.stopPropagation()}>
      <div className="om-ph">{line.photo_url ? <img src={line.photo_url} alt={line.strain} /> : <div className="om-nophoto">Photo coming soon</div>}
        <button className="om-x" aria-label="Close" onClick={onClose}>×</button></div>
      <div className="om-sb">
        <p className="om-kind">{PROD[line.product]} · {line.crop_year} crop</p>
        <h2>{line.strain}</h2>
        <p className="om-lin">{ty && <span className={`om-type t-${ty.split(' ')[0].toLowerCase()}`}>{ty}</span>}{line.lineage ?? 'Lineage coming soon'}</p>
        {line.product === 'FF'
          ? <div className="om-yl"><div><p>SHO · solventless</p><b>{yld(line.sho, line.sho_high)}</b><small>{isRange(line.sho, line.sho_high) ? 'yield range' : 'avg yield'}</small></div><div><p>BHO · hydrocarbon</p><b>{yld(line.bho, line.bho_high)}</b><small>{isRange(line.bho, line.bho_high) ? 'yield range' : 'avg yield'}</small></div></div>
          : <div className="om-yl one"><div><p>THC</p><b>{pct(line.thc)}</b><small>latest lab test</small></div></div>}
        {line.note && <p className="om-snote">{line.note}</p>}
        <p className="om-lin">{line.product === 'FF' ? (isRange(line.sho, line.sho_high) || isRange(line.bho, line.bho_high) ? 'Yields are from our washes. Your results can vary. ' : 'Yields are averages from our washes. Your results can vary. ') : ''}Questions: <a className="om-call" href={`mailto:${SALES}`}>{SALES}</a></p>
      </div>
    </div>
  </div>
}

/** Sales > Open menu */
export function StaffOpenMenu({ sb, flash, isAdmin, tools }: { sb: SupabaseClient | null; flash: (t: string, bad?: boolean) => void; isAdmin: boolean; tools?: React.ReactNode }) {
  const [rows, setRows] = useState<MenuLine[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!sb) { setRows([]); return }
    sb.rpc('staff_menu').then(({ data, error }) => { if (error) setErr(/does not exist|schema cache/i.test(error.message) ? 'Run 174_open_menu.sql in Supabase first' : error.message); else setRows((data ?? []) as MenuLine[]) })
  }, [])
  async function copyText() {
    const r = rows ?? [], keys = [...new Set(r.map(x => `${x.crop_year}|${x.product}`))].sort((a, b) => b.localeCompare(a))
    const text = keys.map(k => { const [y, p] = k.split('|') as [string, MenuLine['product']]
      return `${y} crop, ${PROD[p].toLowerCase()} (lbs open)\n` + r.filter(x => String(x.crop_year) === y && x.product === p).map(x => `${x.strain}: ${fmt(x.open_lbs)}${x.price != null ? ` @ $${x.price}/lb` : ''}`).join('\n') }).join('\n\n')
    try { await navigator.clipboard.writeText(text); flash('Menu copied') } catch (e) { flash((e as Error).message, true) }
  }
  return <div className="list inv">
    <div className="row between wrap toolbar"><h2>Open menu</h2><div className="row">{rows && rows.length > 0 && <button className="ghost small" onClick={copyText}>Copy as text</button>}{tools}</div></div>
    <PublicLinkBox sb={sb} flash={flash} isAdmin={isAdmin} />
    {err ? <p className="warn-t">{err}</p> : !rows ? <p className="muted">Loading…</p> : <MenuBoard rows={rows} variant="staff" />}
  </div>
}

/** the public link: copy it, switch it off, or make a new one (kills the old one). Sales Admins change it. */
export function PublicLinkBox({ sb, flash, isAdmin }: { sb: SupabaseClient | null; flash: (t: string, bad?: boolean) => void; isAdmin: boolean }) {
  const [s, setS] = useState<{ on: boolean; code: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { sb?.rpc('public_menu_settings').then(({ data }) => setS((data as { on: boolean; code: string | null } | null) ?? null)) }, [])
  if (!s) return null
  const url = s.code ? `https://www.lifted-orders.app/menu/${s.code}` : null
  async function set(on: boolean | null, fresh: boolean) {
    if (fresh && s?.code && !confirm('Make a new link? The old link stops working right away.')) return
    setBusy(true)
    try { const { data, error } = await sb!.rpc('set_public_menu', { p_on: on, p_new_code: fresh }); if (error) throw new Error(error.message); setS(data as typeof s); flash(fresh ? 'New link made' : on ? 'Public menu is on' : 'Public menu is off') }
    catch (e) { flash((e as Error).message, true) } finally { setBusy(false) }
  }
  async function copy() { if (!url) return; try { await navigator.clipboard.writeText(url); flash('Link copied') } catch { flash(url) } }
  return <div className="om-link">
    <span><b>Public link</b> <span className="muted small">anyone with it can see this menu, no login. No ordering, no reserves.</span></span>
    {s.on && url ? <a className="mono small" href={url} target="_blank" rel="noopener noreferrer">{url}</a> : <span className="muted small">{s.code ? 'Off' : 'Not made yet'}</span>}
    <span className="row" style={{ gap: 6 }}>
      {s.on && url && <button className="ghost small" onClick={copy}>Copy link</button>}
      {isAdmin && <button className="ghost small" disabled={busy} onClick={() => set(!s.on, !s.code)}>{s.on ? 'Turn off' : s.code ? 'Turn on' : 'Make the link'}</button>}
      {isAdmin && s.code && <button className="ghost small" disabled={busy} onClick={() => set(null, true)}>New link</button>}
    </span>
  </div>
}

/** lifted-orders.app/menu/<code>: no login */
export function PublicMenuPage({ sb, code }: { sb: SupabaseClient | null; code: string }) {
  const [rows, setRows] = useState<MenuLine[] | null>(null)
  const [at, setAt] = useState<Date | null>(null)
  useEffect(() => {
    document.title = 'Open Menu · Lifted Farms'
    const load = () => sb?.rpc('public_menu', { p_code: code }).then(({ data }) => { setRows((data ?? []) as MenuLine[]); setAt(new Date()) })
    load(); const t = setInterval(load, 5 * 60000); return () => clearInterval(t)
  }, [code])
  return <div className="om-page">
    <header className="om-hdr"><div className="om-wrap">
      <div className="om-top"><a href="https://www.liftedfarms.com" target="_blank" rel="noopener noreferrer"><img className="om-logo" src="/logo-dark.svg" alt="Lifted" /></a>
        <span className="om-live"><i />Live{at ? ` · ${at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}</span></div>
      <h1>Open Menu</h1>
      <p className="om-sub">CCOF certified OCal · updates live as orders and reserves change</p>
    </div></header>
    <main className="om-wrap om-main">
      {rows === null ? <p className="om-empty">Loading…</p> : !rows.length ? <p className="om-empty">This menu link isn't active. Ask Lifted Sales for a current link: <a className="om-call" href={`mailto:${SALES}`}>{SALES}</a></p>
        : <>
          <MenuBoard rows={rows} variant="public" />
          <div className="om-contact"><b>Want to order or reserve?</b>Contact Lifted Sales at <a href={`mailto:${SALES}`}>{SALES}</a>. Existing customers can order in the customer portal.</div>
        </>}
    </main>
    <footer className="om-foot">Lifted Farms · CCOF certified OCal · Watsonville, CA</footer>
  </div>
}
