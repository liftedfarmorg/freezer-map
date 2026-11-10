import { Fragment, useMemo, useState } from 'react'
import './reportedYields.css'

// Sales > Reported Yields (MOCKUP). Every yield report customers send from the portal, in one place:
//   By strain   - lbs-weighted averages per strain + crop year across all customers (what will feed the sales menu)
//   By customer - who's reporting, how their runs came out, who still owes reports
//   Issues      - mold / bud rot / foreign matter etc. that customers flagged on a strain
// All yields are % of fresh frozen (FF) unless a column says otherwise. Drafts are left out unless "Include drafts" is ticked.

export type RYUnit = 'g' | 'kg' | 'lb' | '%' | '%ff'
export interface RYPart { bho: boolean; rosin: boolean; ff: number | null; outV: number | null; outU: RYUnit; rosinV: number | null; rosinU: RYUnit }
export interface RYLine { s: string; y: number; shipped: number; parts: RYPart[]; note: string; issue?: { kinds: string[]; text: string } | null }
export interface RYReport { orderId: number; label: string; shippedOn: string; customerId: number; customer: string; by: string | null; sentAt: string | null; savedAt: string | null; lines: RYLine[] }
/** shipped orders that could be reported but haven't been */
export interface RYOwed { orderId: number; label: string; shippedOn: string; customerId: number; customer: string; strains: number }
/** what the strain profile shows on the sales menu today (Strains > Yield to solventless / hydrocarbon) */
export interface RYMenu { solventless_pct: number | null; hydrocarbon_pct: number | null }

const G: Record<RYUnit, number> = { g: 1, kg: 1000, lb: 453.592, '%': 0, '%ff': 0 }
// a strain's average is "menu-ready" once enough customers have reported enough lbs that one odd run can't swing it
const READY_CUSTOMERS = 2, READY_LBS = 100

type Run = { r: RYReport; l: RYLine; p: RYPart; ffG: number; hashG: number | null; bhoG: number | null; rosinG: number | null; draft: boolean }
const calc = (r: RYReport, l: RYLine, p: RYPart): Run => {
  const ffG = (p.ff ?? 0) * G.lb
  const outG = p.outV == null ? null : p.outU === '%' || p.outU === '%ff' ? ffG * p.outV / 100 : p.outV * G[p.outU]
  const hashG = p.bho ? null : outG, bhoG = p.bho ? outG : null
  const rosinG = p.bho || !p.rosin || p.rosinV == null ? null : p.rosinU === '%' ? (hashG == null ? null : hashG * p.rosinV / 100) : p.rosinU === '%ff' ? ffG * p.rosinV / 100 : p.rosinV * G[p.rosinU]
  return { r, l, p, ffG, hashG, bhoG, rosinG, draft: !r.sentAt }
}
const done = (p: RYPart) => p.outV != null || (!p.bho && p.rosinV != null)
type Agg = { lbs: number; hash: number | null; bho: number | null; rosinFF: number | null; rosinHash: number | null; hashLo: number | null; hashHi: number | null; bhoLo: number | null; bhoHi: number | null }
/** lbs-weighted yields over a set of runs, plus the low-high of the per-run hash and BHO yields */
const agg = (rs: Run[]): Agg => {
  const sum = (xs: Run[], f: (x: Run) => number | null) => xs.reduce((a, x) => a + (f(x) ?? 0), 0)
  const div = (a: number, b: number) => b > 0 ? a / b * 100 : null
  const h = rs.filter(x => x.hashG != null), b = rs.filter(x => x.bhoG != null), ro = rs.filter(x => x.rosinG != null), both = ro.filter(x => x.hashG != null)
  const each = (xs: Run[], f: (x: Run) => number | null) => xs.map(x => div(f(x) ?? 0, x.ffG)).filter((v): v is number => v != null)
  const hs = each(h, x => x.hashG), bs = each(b, x => x.bhoG)
  return { lbs: rs.reduce((a, x) => a + (x.p.ff ?? 0), 0),
    hash: div(sum(h, x => x.hashG), sum(h, x => x.ffG)), bho: div(sum(b, x => x.bhoG), sum(b, x => x.ffG)),
    rosinFF: div(sum(ro, x => x.rosinG), sum(ro, x => x.ffG)), rosinHash: div(sum(both, x => x.rosinG), sum(both, x => x.hashG)),
    hashLo: hs.length > 1 ? Math.min(...hs) : null, hashHi: hs.length > 1 ? Math.max(...hs) : null, bhoLo: bs.length > 1 ? Math.min(...bs) : null, bhoHi: bs.length > 1 ? Math.max(...bs) : null }
}
const pct = (n: number | null | undefined) => n == null ? '–' : `${n < 10 ? n.toFixed(2) : n.toFixed(1)}%`
const pct1 = (n: number | null | undefined) => n == null ? '–' : `${n.toFixed(1)}%`
const lbs = (n: number) => `${Math.round(n).toLocaleString()} lbs`
const day = (s: string | null) => s ? new Date(s.length === 10 ? s + 'T12:00' : s).toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' }) : ''
const proc = (p: RYPart) => p.bho ? 'BHO' : p.rosin ? 'Hash + rosin' : 'Hash'

type Tab = 'strain' | 'customer' | 'issues'
type SortK = 's' | 'cust' | 'runs' | 'lbs' | 'hash' | 'rosin' | 'bho'

export function ReportedYields({ reports, owed, menu, flash }: { reports: RYReport[]; owed: RYOwed[]; menu: Record<string, RYMenu>; flash: (t: string, bad?: boolean) => void }) {
  const [tab, setTab] = useState<Tab>('strain')
  const [year, setYear] = useState<'all' | number>('all')
  const [procF, setProcF] = useState<'all' | 'sho' | 'bho'>('all')
  const [cust, setCust] = useState<'all' | number>('all')
  const [q, setQ] = useState('')
  const [drafts, setDrafts] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [openSub, setOpenSub] = useState<string | null>(null)   // a strain opened inside a customer
  const [sort, setSort] = useState<{ k: SortK; asc: boolean }>({ k: 'lbs', asc: false })
  const [menuNow, setMenuNow] = useState(menu)

  const all = useMemo(() => reports.flatMap(r => r.lines.flatMap(l => l.parts.filter(done).map(p => calc(r, l, p)))), [reports])
  const years = [...new Set(all.map(x => x.l.y))].sort((a, b) => b - a)
  const custs = [...new Map(reports.map(r => [r.customerId, r.customer])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
  const ql = q.trim().toLowerCase()
  const runs = all.filter(x => (drafts || !x.draft) && (year === 'all' || x.l.y === year) && (cust === 'all' || x.r.customerId === cust)
    && (procF === 'all' || (procF === 'bho') === x.p.bho) && (!ql || x.l.s.toLowerCase().includes(ql) || x.r.customer.toLowerCase().includes(ql)))
  const tot = agg(runs)
  const sent = reports.filter(r => r.sentAt).length
  const issues = reports.flatMap(r => r.lines.filter(l => l.issue).map(l => ({ r, l })))
    .filter(x => (drafts || x.r.sentAt) && (year === 'all' || x.l.y === year) && (cust === 'all' || x.r.customerId === cust) && (!ql || x.l.s.toLowerCase().includes(ql) || x.r.customer.toLowerCase().includes(ql)))
    .sort((a, b) => String(b.r.sentAt ?? b.r.savedAt).localeCompare(String(a.r.sentAt ?? a.r.savedAt)))

  // ---- by strain (strain + crop year)
  const strains = useMemo(() => {
    const m = new Map<string, Run[]>()
    for (const x of runs) { const k = x.l.s + '|' + x.l.y; m.set(k, [...(m.get(k) ?? []), x]) }
    return [...m.entries()].map(([k, rs]) => { const a = agg(rs), nc = new Set(rs.map(x => x.r.customerId)).size
      // ready for the menu, separately for hash (SHO) and BHO: enough customers and lbs behind that number
      const ok = (xs: Run[]) => new Set(xs.map(x => x.r.customerId)).size >= READY_CUSTOMERS && xs.reduce((t, x) => t + (x.p.ff ?? 0), 0) >= READY_LBS
      const sho = ok(rs.filter(x => x.hashG != null)), bho = ok(rs.filter(x => x.bhoG != null))
      return { k, s: rs[0].l.s, y: rs[0].l.y, rs, a, nc, sho, bho, ready: sho || bho, issues: new Set(rs.filter(x => x.l.issue).map(x => x.r.orderId)).size } })
  }, [runs])
  const val = (x: { s: string; nc: number; rs: Run[]; a: Agg }, k: SortK): number | string => k === 's' ? x.s : k === 'cust' ? x.nc : k === 'runs' ? x.rs.length : k === 'lbs' ? x.a.lbs : k === 'hash' ? x.a.hash ?? -1 : k === 'rosin' ? x.a.rosinFF ?? -1 : x.a.bho ?? -1
  const sorted = <T extends { s: string; nc: number; rs: Run[]; a: Agg }>(xs: T[]) => [...xs].sort((a, b) => { const va = val(a, sort.k), vb = val(b, sort.k)
    const c = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number); return sort.asc ? c : -c })
  const th = (k: SortK, label: React.ReactNode, cls = 'num') => <th className={cls}><button className={`ry-sort ${sort.k === k ? 'on' : ''}`} onClick={() => setSort({ k, asc: sort.k === k ? !sort.asc : k === 's' })}>{label}{sort.k === k ? (sort.asc ? ' ▲' : ' ▼') : ''}</button></th>

  // ---- by customer
  const customers = useMemo(() => {
    const m = new Map<number, Run[]>()
    for (const x of runs) m.set(x.r.customerId, [...(m.get(x.r.customerId) ?? []), x])
    return custs.filter(([id]) => cust === 'all' || id === cust).map(([id, name]) => { const rs = m.get(id) ?? [], reps = reports.filter(r => r.customerId === id)
      return { k: 'c' + id, id, s: name, rs, a: agg(rs), nc: reps.filter(r => r.sentAt).length, drafts: reps.filter(r => !r.sentAt).length, owed: owed.filter(o => o.customerId === id),
        last: reps.map(r => r.sentAt).filter(Boolean).sort().pop() ?? null, issues: reps.reduce((a, r) => a + r.lines.filter(l => l.issue).length, 0) } })
      .filter(x => !ql || x.s.toLowerCase().includes(ql) || x.rs.length)
  }, [runs, reports, owed, cust, ql])

  const useOnMenu = (s: string, a: Agg, sho: boolean, bho: boolean) => {
    const cur = menuNow[s.toLowerCase()]
    setMenuNow({ ...menuNow, [s.toLowerCase()]: { solventless_pct: sho && a.hash != null ? Math.round(a.hash * 10) / 10 : cur?.solventless_pct ?? null, hydrocarbon_pct: bho && a.bho != null ? Math.round(a.bho * 10) / 10 : cur?.hydrocarbon_pct ?? null } })
    flash(`${s}: menu yields updated to the customer average (mockup, nothing saved)`)
  }

  const runTable = (rs: Run[], who: 'customer' | 'strain' | 'none') => <table className="restable ry-runs"><thead><tr>
      {who !== 'none' && <th>{who === 'customer' ? 'Customer' : 'Strain'}</th>}<th>Order</th><th>Process</th><th className="num">FF run</th><th className="num">Hash</th><th className="num">Rosin<span>of FF</span></th><th className="num">Rosin<span>of hash</span></th><th className="num">BHO</th><th>Notes</th></tr></thead>
    <tbody>{[...rs].sort((a, b) => b.r.shippedOn.localeCompare(a.r.shippedOn)).map((x, i) => <tr key={i} className={x.draft ? 'ry-draft' : ''}>
      {who !== 'none' && <td>{who === 'customer' ? x.r.customer : <>{x.l.s} <span className="ry-yr">{x.l.y}</span></>}{x.draft && <> <span className="pill m-mute">Draft</span></>}</td>}
      <td>{x.r.label}<span className="muted"> · {day(x.r.shippedOn)}</span>{who === 'none' && x.draft && <> <span className="pill m-mute">Draft</span></>}</td><td>{proc(x.p)}</td><td className="num">{lbs(x.p.ff ?? 0)}</td>
      <td className="num">{x.hashG != null ? pct(x.hashG / x.ffG * 100) : '–'}</td><td className="num">{x.rosinG != null ? pct(x.rosinG / x.ffG * 100) : '–'}</td>
      <td className="num">{x.rosinG != null && x.hashG ? pct1(x.rosinG / x.hashG * 100) : '–'}</td><td className="num">{x.bhoG != null ? pct(x.bhoG / x.ffG * 100) : '–'}</td>
      <td className="ry-note">{x.l.issue && <span className="pill m-warn" title={x.l.issue.text}>{x.l.issue.kinds.join(', ') || 'Issue'}</span>} {x.l.note}</td></tr>)}</tbody></table>

  // inside a customer: one row per strain + crop year (their averages); tap a strain for its runs
  const custStrains = (ck: string, rs: Run[]) => {
    const m = new Map<string, Run[]>()
    for (const x of rs) { const k = x.l.s + '|' + x.l.y; m.set(k, [...(m.get(k) ?? []), x]) }
    const rows = [...m.entries()].map(([k, xs]) => ({ k: ck + '|' + k, s: xs[0].l.s, y: xs[0].l.y, rs: xs, a: agg(xs), issues: xs.filter(x => x.l.issue).length, draft: xs.every(x => x.draft) }))
      .sort((a, b) => b.y - a.y || a.s.localeCompare(b.s))
    return <table className="restable ry-runs ry-cs"><thead><tr><th>Strain</th><th className="num">Runs</th><th className="num">FF run</th><th className="num">Hash</th><th className="num">Rosin<span>of FF</span></th><th className="num">Rosin<span>of hash</span></th><th className="num">BHO</th><th /></tr></thead>
      <tbody>{rows.map(x => { const on = openSub === x.k
        return <Fragment key={x.k}><tr className={`tap ${on ? 'ry-on' : ''} ${x.draft ? 'ry-draft' : ''}`} onClick={e => { e.stopPropagation(); setOpenSub(on ? null : x.k) }}>
          <td><b>{x.s}</b> <span className="ry-yr">{x.y}</span>{x.draft && <> <span className="pill m-mute">Draft</span></>}{x.issues > 0 && <> <span className="pill m-warn">{x.rs.find(r => r.l.issue)?.l.issue?.kinds.join(', ') || 'Issue'}</span></>}</td>
          <td className="num">{x.rs.length}</td><td className="num">{lbs(x.a.lbs)}</td><td className="num"><b className="ry-hash">{pct(x.a.hash)}</b></td><td className="num">{pct(x.a.rosinFF)}</td>
          <td className="num">{pct1(x.a.rosinHash)}</td><td className="num"><b className="ry-bho">{pct(x.a.bho)}</b></td><td className="muted">{on ? '▴' : '▾'}</td></tr>
          {on && <tr className="ry-sub"><td colSpan={8}>{runTable(x.rs, 'none')}</td></tr>}</Fragment> })}</tbody></table>
  }

  return <div className="ry">
    <div className="row between wrap ry-top"><div><h2>Reported Yields</h2>
      <p className="muted" style={{ margin: 0 }}>How customers' runs came out, from the yield reports they send in the portal. Yields are lbs-weighted, % of fresh frozen.</p></div>
      <span className="pill m-warn">Mockup · sample data</span></div>

    <div className="ry-kpis">
      <div><span>Reports in</span><b>{sent}</b><small>{owed.length} shipped orders not reported yet</small></div>
      <div><span>Fresh frozen reported</span><b>{lbs(tot.lbs)}</b><small>{runs.length} runs · {new Set(runs.map(x => x.r.customerId)).size} customers</small></div>
      <div><span>Hash yield</span><b>{pct(tot.hash)}</b><small>of fresh frozen</small></div>
      <div><span>Rosin yield</span><b>{pct(tot.rosinFF)}</b><small>of FF · {pct1(tot.rosinHash)} of hash</small></div>
      <div><span>BHO yield</span><b>{pct(tot.bho)}</b><small>of fresh frozen</small></div>
      <div className={issues.length ? 'warn' : ''}><span>Issues reported</span><b>{issues.length}</b><small>mold, bud rot, foreign matter…</small></div>
    </div>

    <div className="row between wrap ry-bar">
      <div className="seg" role="tablist">
        <button className={tab === 'strain' ? 'on' : ''} onClick={() => { setTab('strain'); setOpen(null) }}>By strain</button>
        <button className={tab === 'customer' ? 'on' : ''} onClick={() => { setTab('customer'); setOpen(null); setOpenSub(null) }}>By customer</button>
        <button className={tab === 'issues' ? 'on' : ''} onClick={() => { setTab('issues'); setOpen(null) }}>Issues{issues.length ? ` (${issues.length})` : ''}</button></div>
      <div className="row">
        <select value={String(year)} onChange={e => setYear(e.target.value === 'all' ? 'all' : Number(e.target.value))} aria-label="Crop year"><option value="all">All crop years</option>{years.map(y => <option key={y} value={y}>{y} crop</option>)}</select>
        {tab !== 'issues' && <select value={procF} onChange={e => setProcF(e.target.value as typeof procF)} aria-label="Process"><option value="all">Hash, rosin &amp; BHO</option><option value="sho">Hash &amp; rosin (SHO)</option><option value="bho">BHO</option></select>}
        <select value={String(cust)} onChange={e => setCust(e.target.value === 'all' ? 'all' : Number(e.target.value))} aria-label="Customer"><option value="all">All customers</option>{custs.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        <input type="search" placeholder="Search strain or customer" value={q} onChange={e => setQ(e.target.value)} style={{ minWidth: 200 }} />
        <label className="small-check"><input type="checkbox" checked={drafts} onChange={e => setDrafts(e.target.checked)} /> Include drafts</label>
      </div></div>

    {tab === 'strain' && <>
      <div className="ry-card"><table className="restable ry-main"><thead><tr>
        {th('s', 'Strain', '')}{th('cust', 'Customers')}{th('runs', 'Runs')}{th('lbs', 'FF run')}{th('hash', <>Hash<span>of FF · range</span></>)}{th('rosin', <>Rosin<span>of FF · of hash</span></>)}{th('bho', <>BHO<span>of FF · range</span></>)}<th>For the menu</th><th /></tr></thead>
        <tbody>{sorted(strains).map(x => { const on = open === x.k, m = menuNow[x.s.toLowerCase()]
          return <Fragment key={x.k}><tr className={`tap ${on ? 'ry-on' : ''}`} onClick={() => setOpen(on ? null : x.k)}>
            <td><b>{x.s}</b> <span className="ry-yr">{x.y}</span>{x.issues > 0 && <> <span className="pill m-warn">{x.issues} issue{x.issues > 1 ? 's' : ''}</span></>}</td>
            <td className="num">{x.nc}</td><td className="num">{x.rs.length}</td><td className="num">{lbs(x.a.lbs)}</td>
            <td className="num"><b className="ry-hash">{pct(x.a.hash)}</b>{x.a.hashLo != null && <small className="ry-range">{pct(x.a.hashLo)}–{pct(x.a.hashHi)}</small>}</td>
            <td className="num"><b>{pct(x.a.rosinFF)}</b>{x.a.rosinHash != null && <small className="ry-range">{pct1(x.a.rosinHash)} of hash</small>}</td>
            <td className="num"><b className="ry-bho">{pct(x.a.bho)}</b>{x.a.bhoLo != null && <small className="ry-range">{pct(x.a.bhoLo)}–{pct(x.a.bhoHi)}</small>}</td>
            <td className="ry-menu">{x.ready ? <>{x.sho && <span className="pill m-ok">SHO {pct1(x.a.hash)}</span>} {x.bho && <span className="pill m-ok">BHO {pct1(x.a.bho)}</span>}</>
              : <span className="pill m-mute" title={`Needs reports from ${READY_CUSTOMERS}+ customers and ${READY_LBS}+ lbs`}>Needs more reports</span>}
              <small>Menu shows {m?.solventless_pct != null || m?.hydrocarbon_pct != null ? [m?.solventless_pct != null ? `${m.solventless_pct}% SHO` : '', m?.hydrocarbon_pct != null ? `${m.hydrocarbon_pct}% BHO` : ''].filter(Boolean).join(' · ') : 'no yield'}</small></td>
            <td className="muted">{on ? '▴' : '▾'}</td></tr>
            {on && <tr className="ry-detail"><td colSpan={9}>
              {runTable(x.rs, 'customer')}
              <div className="row between wrap ry-detail-f"><span className="muted">Average of {x.rs.length} run{x.rs.length > 1 ? 's' : ''} from {x.nc} customer{x.nc > 1 ? 's' : ''}. {!x.sho && x.a.hash != null ? 'Hash needs more reports before it can go on the menu. ' : ''}{!x.bho && x.a.bho != null ? 'BHO needs more reports before it can go on the menu.' : ''}</span>
                {x.ready && <button className="ghost small" onClick={e => { e.stopPropagation(); useOnMenu(x.s, x.a, x.sho, x.bho) }}>Put {[x.sho ? `${pct1(x.a.hash)} SHO` : '', x.bho ? `${pct1(x.a.bho)} BHO` : ''].filter(Boolean).join(' and ')} on the menu</button>}</div>
            </td></tr>}</Fragment> })}
          {!strains.length && <tr><td colSpan={9} className="muted">No reported runs match.</td></tr>}</tbody>
        {strains.length > 0 && <tfoot><tr><td><b>All strains</b></td><td className="num">{new Set(runs.map(x => x.r.customerId)).size}</td><td className="num">{runs.length}</td><td className="num">{lbs(tot.lbs)}</td>
          <td className="num"><b>{pct(tot.hash)}</b></td><td className="num"><b>{pct(tot.rosinFF)}</b></td><td className="num"><b>{pct(tot.bho)}</b></td><td colSpan={2} /></tr></tfoot>}
      </table></div>
      <p className="muted ry-foot">Tap a strain to see every run behind its average. <b>For the menu</b>: a hash (SHO) or BHO average turns green once {READY_CUSTOMERS}+ customers and {READY_LBS}+ lbs are behind it, so one odd run can't swing it; those are the numbers we'd show on the sales menu. "Menu shows" is what the strain profile has today (Strains › Yield to solventless / hydrocarbon).</p>
    </>}

    {tab === 'customer' && <div className="ry-card"><table className="restable ry-main"><thead><tr>
        <th>Customer</th><th className="num">Reports sent</th><th>Not reported yet</th><th className="num">FF run</th><th className="num">Hash<span>of FF</span></th><th className="num">Rosin<span>of FF</span></th><th className="num">BHO<span>of FF</span></th><th className="num">Issues</th><th>Last report</th><th /></tr></thead>
      <tbody>{customers.map(x => { const on = open === x.k
        return <Fragment key={x.k}><tr className={`tap ${on ? 'ry-on' : ''}`} onClick={() => setOpen(on ? null : x.k)}>
          <td><b>{x.s}</b></td><td className="num">{x.nc}{x.drafts > 0 && <small className="ry-range">+{x.drafts} draft</small>}</td>
          <td>{x.owed.length ? <span className="pill m-warn" title={x.owed.map(o => `${o.label} (${day(o.shippedOn)})`).join(', ')}>{x.owed.length} order{x.owed.length > 1 ? 's' : ''}</span> : <span className="muted">All reported</span>}</td>
          <td className="num">{x.a.lbs ? lbs(x.a.lbs) : '–'}</td><td className="num"><b className="ry-hash">{pct(x.a.hash)}</b></td><td className="num">{pct(x.a.rosinFF)}</td><td className="num"><b className="ry-bho">{pct(x.a.bho)}</b></td>
          <td className="num">{x.issues || '–'}</td><td className="muted">{x.last ? day(x.last) : 'Never'}</td><td className="muted">{on ? '▴' : '▾'}</td></tr>
          {on && <tr className="ry-detail"><td colSpan={10}>
            {x.rs.length ? custStrains(x.k, x.rs) : <p className="muted">No runs reported{drafts ? '' : ' (drafts hidden)'}.</p>}
            {x.owed.length > 0 && <p className="muted ry-owed">Shipped, not reported yet: {x.owed.map(o => `${o.label} (shipped ${day(o.shippedOn)}, ${o.strains} strain${o.strains > 1 ? 's' : ''})`).join(' · ')}</p>}
          </td></tr>}</Fragment> })}</tbody></table></div>}

    {tab === 'issues' && <div className="ry-issues">
      {!issues.length && <p className="muted">No issues reported.</p>}
      {issues.map(({ r, l }, i) => <div key={i} className="card ry-issue">
        <div className="row between wrap"><div><b>{l.s}</b> <span className="ry-yr">{l.y}</span> · {r.customer}{!r.sentAt && <> <span className="pill m-mute">Draft</span></>}
          <div className="muted">{r.label}, shipped {day(r.shippedOn)} · {l.shipped} lbs · reported {day(r.sentAt ?? r.savedAt)}{r.by ? ` by ${r.by}` : ''}</div></div>
          <div className="row">{(l.issue!.kinds.length ? l.issue!.kinds : ['Other']).map(k => <span key={k} className="pill m-warn">{k}</span>)}</div></div>
        {l.issue!.text && <p className="ry-issue-t">{l.issue!.text}</p>}
        {r.by && <a className="small" href={`mailto:${r.by}?subject=${encodeURIComponent(`${l.s} on ${r.label}`)}`}>Reply by email</a>}
      </div>)}
    </div>}
  </div>
}
