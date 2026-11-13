// Plan my pick (Msg PICK-1, PICK-2): its own page from a Fulfillment order (one order) or a load on Transit (every
// order on the load). Builds a pick that opens as few freezers as possible, lets you change any pallet, then either
// assigns it (Use this plan) or walks it on a phone (Walk this plan: scan each pallet, swap with a reason, assign
// what you picked at the end). Assigning uses the same calls as + Assign pallets (pick_pallet / pick_part).
// Pallets in Staging are left out (Aziz PICK-2: that's usually not where they really are).
// PICK-12: closest to the freezer door first, then fewest freezers; Print makes a full pick sheet (printPickSheet).
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Backend } from './api'
import type { FLine, FOrder, Pallet } from './types'
import { makePlan, rescore, route, type Loc, type Mode, type PLine, type PRow } from './pickplan'
import { useBack, scrollTop } from './nav'
import { ScanButton } from './scan'
import { sameTag, useScanHandler } from './scanroute'
import { useSaved } from './saved'

const n0 = (x: number) => Math.round(Number(x)).toLocaleString()
const w = (p: Pallet) => Number(p.current_weight ?? 0)
const got = (l: FLine) => l.picks.reduce((a, p) => a + Number(p.lbs), 0)
const MODES: { k: Mode; label: string }[] = [
  { k: 'freezers', label: 'Closest to the door, then fewest freezers' }, { k: 'oldest', label: 'Oldest harvest first' }, { k: 'splits', label: 'Fewest splits' }]
const REASONS = ['Not there', 'Buried', 'Damaged', 'Other']
/** a mixed pallet's strains, short: "A, B and 13 more" */
const mixList = (cs: Pallet[]) => { const n = [...new Set(cs.map(c => c.strain).filter(Boolean))] as string[]; return n.length > 3 ? `${n.slice(0, 2).join(', ')} and ${n.length - 2} more` : n.join(', ') || `${cs.length} packages` }
const boxes = (lbs: number) => lbs % 10 === 0 ? ` ${lbs / 10} boxes` : ''

/** a row on the route: a planned pick, or a pallet already assigned (held) that still has to come out of a freezer */
export interface RRow extends PRow { held?: boolean }
export interface Tag { label: string; color: string }
type Saved = { rows: { lineId: number; id: number; lbs: number; whole: boolean; held?: boolean }[]; done: number[]; notes: Record<number, string> }
const store = {
  get(k: string): Saved | null { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) as Saved : null } catch { return null } },
  set(k: string, v: Saved | null) { try { if (v) localStorage.setItem(k, JSON.stringify(v)); else localStorage.removeItem(k) } catch { /* private mode: walk still works, just isn't kept */ } },
}

/** PICK-12: print a real pick sheet (every freezer, every pallet, full METRC tags, check boxes, sign-off) in its own
 *  page instead of window.print() on the app screen, which only printed what was on screen. */
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
export function printPickSheet(o: {
  title: string; sub?: string; site: string | null; orders: FOrder[]; groups: [number, RRow[]][]; loc: (p: Pallet) => Loc
  pallet: (id: number) => Pallet | undefined; contents: (id: number) => Pallet[]; tagOf?: (lineId: number) => Tag | undefined
  lineOf: (id: number) => FLine | undefined; lines: PLine[]; short: Map<number, number>; splits: number; inWay: number
}) {
  const { groups, loc } = o
  const nPal = groups.reduce((a, [, rs]) => a + rs.length, 0)
  const picked = new Set(groups.flatMap(([, rs]) => rs.map(r => r.pallet.id)))
  const planned = (id: number) => groups.reduce((a, [, rs]) => a + rs.filter(r => r.lineId === id).reduce((b, r) => b + r.lbs, 0), 0)
  const who = (id: number) => { const t = o.tagOf?.(id); return t ? `<span class="tag" style="background:${esc(t.color)}">${esc(t.label)}</span> ` : '' }
  const orderHead = o.orders.map(x => `<div><b>${esc(x.so ?? `Order ${x.id}`)}</b> ${esc(x.customer)}${x.po ? ` · PO ${esc(x.po)}` : ''}${x.wanted_date ? ` · wanted ${esc(x.wanted_date)}` : ''}${x.stop ? ` · ${esc(x.stop.load)}` : ''}</div>`).join('')
  const lineRows = o.orders.flatMap(x => x.lines.filter(l => !l.cant_fill).map(l => {
    const pl = o.lines.find(z => z.id === l.id), need = pl?.need ?? 0, already = Number(l.lbs) - need, short = o.short.get(l.id)
    return `<tr><td>${who(l.id)}${esc(l.strain)}${l.crop_year ? ` <span class="m">${esc(l.crop_year)}</span>` : ''}</td><td class="n">${n0(l.lbs)}</td><td class="n">${already > 0.5 ? n0(already) : ''}</td><td class="n">${n0(planned(l.id))}</td><td class="n ${short ? 'bad' : ''}">${short ? `${n0(short)} short` : ''}</td></tr>` })).join('')
  const fzHtml = groups.map(([, rs], gi) => {
    const L0 = loc(rs[0].pallet)
    const way = new Map<number, Pallet>()
    for (const r of rs) for (const id of loc(r.pallet).inFront) if (!picked.has(id)) { const p = o.pallet(id); if (p) way.set(id, p) }
    const body = rs.map(r => {
      const L = loc(r.pallet), p = r.pallet, mix = p.kind === 'mixed' ? o.contents(p.id) : []
      const what = mix.length ? `Mixed pallet: ${mix.length} packages<div class="mix">${mix.map(c => `${esc(c.package_tag ?? '')} ${esc(c.strain ?? '')} ${n0(w(c))} lbs`).join('<br>')}</div>` : esc(p.strain ?? '')
      return `<tr><td class="ck">☐</td><td><b>${esc(L.spot)}</b><div class="m">${esc(L.side)}${L.side ? (L.front === 1 ? ', at the door' : `, ${L.front} back`) : ''}</div></td>
        <td><b>${esc(p.code)}</b></td><td class="tagc">${esc(p.package_tag ?? '')}</td><td>${who(r.lineId)}${what}</td>
        <td class="n"><b>${n0(r.lbs)}</b></td><td class="n">${n0(w(p))}</td><td>${r.held ? 'Assigned' : r.whole ? 'Whole' : `<b>Split</b>${boxes(r.lbs)}`}</td><td class="note"></td></tr>` }).join('')
    return `<section><h2>${gi + 1}. ${esc(L0.fzLabel)} <span class="m">${rs.length} pallet${rs.length === 1 ? '' : 's'}</span></h2>
      ${way.size ? `<p class="way">Move out of the way first: ${[...way.values()].map(p => `${esc(p.code)} (${esc(loc(p).spot)})`).join(', ')}</p>` : ''}
      <table><thead><tr><th></th><th>Spot</th><th>Pallet</th><th>METRC tag</th><th>Strain</th><th class="n">Take lbs</th><th class="n">Pallet lbs</th><th>Do</th><th>Notes</th></tr></thead><tbody>${body}</tbody></table></section>` }).join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Pick sheet ${esc(o.orders.map(x => x.so ?? '').filter(Boolean).join(' '))}</title><style>
    @page { size: letter; margin: 0.45in; }
    body { font: 11px/1.35 system-ui, -apple-system, "Segoe UI", Arial, sans-serif; color: #111; margin: 0; }
    h1 { font-size: 18px; margin: 0 0 2px; } h2 { font-size: 13.5px; margin: 14px 0 4px; } .m { color: #666; font-weight: 400; font-size: 10px; }
    .top { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 8px; }
    .sum { font-weight: 600; margin: 4px 0; } table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #bbb; padding: 3px 5px; text-align: left; vertical-align: top; }
    th { background: #eee; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; } .n { text-align: right; white-space: nowrap; }
    .ck { width: 16px; font-size: 15px; text-align: center; } .tagc { font-family: ui-monospace, Consolas, monospace; font-size: 10px; white-space: nowrap; }
    .note { width: 90px; } .mix { font-size: 9.5px; color: #333; margin-top: 2px; font-family: ui-monospace, Consolas, monospace; }
    .tag { display: inline-block; padding: 0 5px; border-radius: 3px; color: #fff; font-size: 9.5px; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .bad { color: #b00020; font-weight: 600; } .way { margin: 2px 0 4px; font-weight: 600; } section { break-inside: auto; } tr { break-inside: avoid; }
    .sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 22px; } .sign div { border-top: 1px solid #111; padding-top: 3px; }
  </style></head><body>
    <div class="top"><div><h1>Pick sheet${/plan my pick/i.test(o.title) ? '' : `: ${esc(o.title)}`}</h1>${o.sub && o.orders.length !== 1 ? `<div>${esc(o.sub)}</div>` : ''}${orderHead}</div>
      <div style="text-align:right"><div><b>${esc(o.site ?? '')}</b></div><div>Printed ${esc(new Date().toLocaleString())}</div></div></div>
    <div class="sum">${groups.length} freezer${groups.length === 1 ? '' : 's'} · ${nPal} pallet${nPal === 1 ? '' : 's'} · ${o.splits} split${o.splits === 1 ? '' : 's'}${o.inWay ? ` · ${o.inWay} to move out of the way` : ''} · closest to the door first</div>
    <table><thead><tr><th>Line</th><th class="n">Ordered lbs</th><th class="n">Already picked</th><th class="n">On this sheet</th><th class="n">Short</th></tr></thead><tbody>${lineRows}</tbody></table>
    ${fzHtml}
    <div class="sign"><div>Picked by</div><div>Checked by</div><div>Date / time</div></div>
  </body></html>`
  // FBQ-7 (Aziz): phones (iPhone Safari / Home Screen app) can't print a hidden frame. Open the sheet as its own page
  // with a Print button; the iPhone print sheet also does Save to Files / share.
  const phone = matchMedia('(pointer: coarse)').matches || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  if (phone) {
    const bar = `<div class="pbar"><button onclick="window.print()">Print</button><button onclick="window.close()">Close</button></div>
      <style>.pbar{position:sticky;top:0;display:flex;gap:10px;padding:10px 0;background:#fff;z-index:2}.pbar button{font:600 17px system-ui;padding:10px 18px;border-radius:10px;border:1px solid #166534;background:#166534;color:#fff}.pbar button+button{background:#fff;color:#166534}@media print{.pbar{display:none}}</style>`
    const page = html.replace('<body>', `<body>${bar}`).replace('</body>', '<script>setTimeout(function(){try{window.print()}catch(e){}},400)</script></body>')
    const url = URL.createObjectURL(new Blob([page], { type: 'text/html' }))
    const w = window.open(url, '_blank')
    if (!w) location.href = url
    setTimeout(() => URL.revokeObjectURL(url), 120000)
    return
  }
  const f = document.createElement('iframe')
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(f)
  const d = f.contentDocument!
  d.open(); d.write(html); d.close()
  const go = () => { f.contentWindow?.focus(); f.contentWindow?.print(); setTimeout(() => f.remove(), 60000) }
  if (d.readyState === 'complete') setTimeout(go, 50); else f.onload = go
}

export function PlanMyPick({ orders, cands, loc, pallet, contents, backend, reload, flash, back, title, sub, tagOf, held = [], walkKey, backLabel }: {
  orders: FOrder[]; cands: (l: FLine) => Pallet[]; loc: (p: Pallet) => Loc; pallet: (id: number) => Pallet | undefined; backend: Backend
  contents: (id: number) => Pallet[]   // packages on a mixed pallet
  reload: () => Promise<void>; flash: (t: string, bad?: boolean) => void; back: () => void
  title: string; sub?: string; tagOf?: (lineId: number) => Tag | undefined; held?: RRow[]; walkKey: string; backLabel: string
}) {
  useBack(true, back)
  const [tol, setTol] = useState(5)
  useEffect(() => {
    backend.client()?.rpc('fill_tolerance').then(({ data }) => { if (data != null && Number(data) >= 0) setTol(Number(data)) }, () => {})
  }, [backend])
  const allLines = useMemo(() => orders.flatMap(o => o.lines), [orders])
  const lineOf = (id: number) => allLines.find(l => l.id === id)
  // lines that still need lbs, and the free pallets for each (not Staging), split by site
  const all = useMemo(() => allLines.filter(l => !l.cant_fill).map(l => ({ id: l.id, strain: l.strain, need: Math.max(0, Number(l.lbs) - got(l)),
    cands: cands(l).filter(p => { const L = loc(p); return L.fz != null && !L.staging }) })), [allLines, cands, loc])
  const sites = useMemo(() => {
    const m = new Map<string, number>()
    // open on the site with the most work: assigned pallets to pull, then free lbs for lines that still need some
    for (const l of all) for (const p of l.cands) { const s = loc(p).site; if (s) m.set(s, (m.get(s) ?? 0) + (l.need > 0.5 ? Math.min(w(p), l.need) : 0)) }
    for (const r of held) { const s = loc(r.pallet).site; if (s) m.set(s, (m.get(s) ?? 0) + 1e6) }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s)
  }, [all, held, loc])
  const [site, setSite] = useSaved<string | null>('pickplanui.lineOf.site', null)
  const st = site ?? sites[0] ?? null
  const lines: PLine[] = useMemo(() => all.map(l => ({ ...l, cands: l.cands.filter(p => loc(p).site === st) })), [all, st, loc])
  const [mode, setMode] = useSaved<Mode>('pickplanui.lineOf.mode', 'freezers')
  const fresh = useMemo(() => makePlan(lines, tol, mode, loc), [lines, tol, mode, loc])
  const [rows, setRows] = useState<PRow[] | null>(null)
  const [change, setChange] = useState<number | null>(null)   // pallet id being changed
  useEffect(() => { setRows(null); setChange(null) }, [mode, st, tol])
  const plan = rows ? rescore(lines, rows, loc) : fresh
  const [showMap, setShowMap] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const heldHere = held.filter(r => loc(r.pallet).site === st)
  const routeRows: RRow[] = useMemo(() => route([...heldHere, ...plan.rows], loc), [plan, heldHere.map(r => r.pallet.id).join(','), loc])
  const nFz = new Set(routeRows.map(r => loc(r.pallet).fz)).size
  const inWay = (() => { const ids = new Set(routeRows.map(r => r.pallet.id)), b = new Set<number>(); for (const r of routeRows) for (const i of loc(r.pallet).inFront) if (!ids.has(i)) b.add(i); return b.size })()

  const groups = useMemo(() => {
    const m = new Map<number, RRow[]>()
    for (const r of routeRows) { const k = loc(r.pallet).fz ?? -1; m.set(k, [...(m.get(k) ?? []), r]) }
    return [...m.entries()]
  }, [routeRows, loc])
  const nothing = lines.every(l => l.need <= tol) && !heldHere.length

  // the walk (phone): kept on the phone so it survives losing service or closing the app
  const [walk, setWalk] = useState<Saved | null>(() => store.get(walkKey))
  const saveWalk = (v: Saved | null) => { setWalk(v); store.set(walkKey, v) }
  const startWalk = () => { saveWalk({ rows: routeRows.map(r => ({ lineId: r.lineId, id: r.pallet.id, lbs: r.lbs, whole: r.whole, held: (r as RRow).held })), done: [], notes: {} }); scrollTop() }
  const [walking, setWalking] = useState(false)

  const assign = async (rs: PRow[]) => {
    setBusy(true)
    let done = 0
    try {
      for (const r of rs) {
        if (r.whole) await backend.pickPallet(r.lineId, r.pallet.id)
        else await backend.pickPart(r.lineId, r.pallet.id, r.lbs, null)
        done++
      }
      await reload(); flash(`${done} pallet${done === 1 ? '' : 's'} assigned. Splits are tag pending until the new label goes on.`)
      return true
    } catch (e) {
      if (done) await reload()
      flash(`${done ? `${done} assigned, then: ` : ''}${String((e as Error).message ?? e)}`, true)
      return false
    } finally { setBusy(false) }
  }

  // other free pallets for a line, with what each does to the route
  const altsFor = (lineId: number, lbs: number, skip: Set<number>, fzIn: Set<number | null>) => {
    const l = lines.find(x => x.id === lineId)
    return (l?.cands ?? []).filter(p => !skip.has(p.id) && w(p) > 0).map(p => {
      const L = loc(p), same = fzIn.has(L.fz), d = w(p) - lbs
      const bits = [same ? 'Already going there' : '+1 freezer',
        Math.abs(d) <= tol ? 'whole' : d > 0 ? `split ${n0(d)} back` : `${n0(-d)} short`,
        L.inFront.length ? `${L.inFront.length} in the way` : '']
      return { p, L, same, text: bits.filter(Boolean).join(' · ') }
    }).sort((a, b) => Number(b.same) - Number(a.same) || a.L.inFront.length - b.L.inFront.length || Math.abs(w(a.p) - lbs) - Math.abs(w(b.p) - lbs))
  }
  const alts = (r: PRow) => altsFor(r.lineId, r.lbs, new Set(routeRows.map(x => x.pallet.id)), new Set(routeRows.filter(x => x !== r).map(x => loc(x.pallet).fz)))
  const swap = (r: PRow, p: Pallet) => {
    const whole = w(p) <= r.lbs + tol
    setRows(plan.rows.map(x => x === r ? { lineId: r.lineId, pallet: p, lbs: whole ? w(p) : r.lbs, whole } : x))
    setChange(null)
  }
  const chip = (lineId: number) => { const t = tagOf?.(lineId); return t ? <span className="pmp-tag" style={{ background: t.color }}>{t.label}</span> : null }

  if (walk && walking) return <Walk walk={walk} save={saveWalk} pallet={pallet} contents={contents} loc={loc} altsFor={altsFor} chip={chip} busy={busy} lineOf={lineOf} tol={tol}
    close={() => { setWalking(false); scrollTop() }} finish={async rs => { if (await assign(rs)) { saveWalk(null); setWalking(false) } }} />

  return (
    <div className="list fulfill pmp">
      <button className="backbtn2" onClick={back}>{backLabel}</button>
      <h2>{title}{sub && <span className="muted"> {sub}</span>}</h2>
      {walk && <div className="pmp-bar"><div className="grow"><b>Walk in progress</b><div className="small">{walk.done.length} of {walk.rows.length} picked. It's saved on this phone.</div></div>
        <button className="ghost" onClick={() => saveWalk(null)}>Clear it</button>
        <button className="primary" onClick={() => { setWalking(true); scrollTop() }}>Resume walk ›</button></div>}
      {sites.length > 1 && <div className="seg small-seg" role="group" aria-label="Site">
        {sites.map(s => <button key={s} className={s === st ? 'on' : ''} onClick={() => setSite(s)}>{s}</button>)}</div>}

      {nothing ? <div className="okbox">Every line already has its pallets{held.length ? ' and nothing assigned is left in a freezer here' : ''}.</div> : <>
        <div className="pmp-sum">
          <b>{nFz} freezer{nFz === 1 ? '' : 's'} · {routeRows.length} pallet{routeRows.length === 1 ? '' : 's'} · {plan.splits} split{plan.splits === 1 ? '' : 's'}</b>
          {inWay > 0 && <span className="muted"> · {inWay} pallet{inWay === 1 ? '' : 's'} to move out of the way</span>}
          {plan.rows.length > 0 && <label className="pmp-mode">Plan for <select value={mode} onChange={e => setMode(e.target.value as Mode)}>
            {MODES.map(m => <option key={m.k} value={m.k}>{m.label}</option>)}</select></label>}
        </div>
        <div className="row wrap pmp-act">
          <button className="primary" disabled={busy || !routeRows.length} onClick={() => { startWalk(); setWalking(true) }}>Walk this plan ›</button>
          {plan.rows.length > 0 && <button className="ghost" disabled={busy} onClick={async () => { if (await assign(plan.rows)) back() }}>{busy ? 'Assigning…' : 'Use this plan now'}</button>}
          <button className="ghost" onClick={() => printPickSheet({ title, sub, site: st, orders, groups, loc, pallet, contents, tagOf, lineOf, lines, short: plan.short, splits: plan.splits, inWay })}>Print pick sheet</button>
        </div>
        <p className="muted small pmp-note">Walk this plan: scan each pallet as it comes out, swap any that aren't there, and assign what you picked at the end. Use this plan now: assigns and holds these pallets right away, same as + Assign pallets. Either way, splits get a pending tag until the new label goes on.</p>
        {heldHere.length > 0 && <div className="muted small">{heldHere.length} already assigned pallet{heldHere.length === 1 ? '' : 's'} still in a freezer {heldHere.length === 1 ? 'is' : 'are'} on the route too (marked Assigned).</div>}
        {rows && <div className="muted small">You changed this plan. <button className="linkbtn" onClick={() => setRows(null)}>Start over</button></div>}
        {/* FBQ-5 (Aziz): short at this site: say what the other site has (freezers and reefers only, not Staging), or the total short */}
        {[...plan.short.entries()].map(([id, lbs]) => {
          const others = new Map<string, { lbs: number; n: number }>()
          for (const p of all.find(l => l.id === id)?.cands ?? []) { const s = loc(p).site; if (!s || s === st) continue; const x = others.get(s) ?? { lbs: 0, n: 0 }; x.lbs += w(p); x.n++; others.set(s, x) }
          const there = [...others.entries()].filter(([, x]) => x.lbs > 0.5)
          const total = Math.max(0, lbs - there.reduce((a, [, x]) => a + x.lbs, 0))
          return <div key={id} className="warnbox">{chip(id)} {lineOf(id)?.strain}: {n0(lbs)} lbs short at {st}.{' '}
            {there.length ? <>{there.map(([s, x]) => `${s} has ${n0(x.lbs)} lbs free (${x.n} pallet${x.n === 1 ? '' : 's'})`).join(', ')}{total > 0.5 ? `; still ${n0(total)} lbs short in total` : ''}. {there.map(([s]) => <button key={s} className="linkbtn" onClick={() => setSite(s)}>Plan at {s} ›</button>)}
              <div className="small muted">Assign what's here first, then plan the rest at the other site. Moving product between OHR and GVR needs a METRC manifest.</div></>
              : <>No free pallets of it at the other site either: {n0(lbs)} lbs short in total.</>}
          </div>
        })}

        {groups.map(([fz, rs], gi) => {
          const L0 = loc(rs[0].pallet)
          return (
            <section key={fz} className="pmp-fz">
              <div className="row between"><h3>{gi + 1}. {L0.fzLabel}</h3>
                <button className="linkbtn" onClick={() => setShowMap(showMap === fz ? null : fz)}>{showMap === fz ? 'Hide map' : 'Show map'}</button></div>
              {showMap === fz && <FzMap rows={rs} loc={loc} />}
              {rs.map(r => {
                const L = loc(r.pallet)
                return (
                  <div key={r.pallet.id}>
                    <div className={`pmp-row ${change === r.pallet.id ? 'on' : ''}`}>
                      <b className="pmp-spot">{L.spot}</b>
                      <b className="pmp-code">{r.pallet.code}</b>
                      <span className="grow">{chip(r.lineId)} {r.pallet.kind === 'mixed' ? `Mixed: ${mixList(contents(r.pallet.id))}` : r.pallet.strain}<span className="muted small"> {L.side ? `· ${L.side}${L.front === 1 ? ', at the door' : `, ${L.front} back`}` : ''}{L.inFront.length ? ` · ${L.inFront.length} in the way` : ''}</span></span>
                      <span className="pmp-lbs">{n0(r.lbs)}{!r.whole ? <span className="muted"> of {n0(w(r.pallet))}</span> : ''} lbs</span>
                      <span className={`pmp-do ${r.held ? 'held' : r.whole ? '' : 'split'}`}>{r.held ? 'Assigned' : r.whole ? 'Whole' : `Split${boxes(r.lbs)}`}</span>
                      {r.held ? <span className="pmp-chg" /> : <button className="linkbtn pmp-chg" onClick={() => { setChange(change === r.pallet.id ? null : r.pallet.id) }}>{change === r.pallet.id ? 'Cancel' : 'Change'}</button>}
                    </div>
                    {change === r.pallet.id && (
                      <div className="pmp-alts">
                        <div className="muted small">Change {r.pallet.code}: the {lineOf(r.lineId)?.strain} line needs {n0(r.lbs)} lbs from here. Each choice says what it does to the plan.</div>
                        {alts(r).slice(0, 6).map(a => (
                          <div key={a.p.id} className="pmp-alt">
                            <b className="pmp-code">{a.p.code}</b>
                            <span className="muted">{a.L.fzLabel.replace(/^\w+ /, '')} · {a.L.spot}</span>
                            <span className="pmp-lbs">{n0(w(a.p))} lbs</span>
                            <span className={`grow small ${a.same ? 'ok-t' : 'warn-t'}`}>{a.text}</span>
                            <button className="ghost small" onClick={() => swap(r, a.p)}>Use {a.p.code}</button>
                          </div>
                        ))}
                        {!alts(r).length && <div className="muted small">No other free {lineOf(r.lineId)?.strain} pallets in freezers at {st}.</div>}
                      </div>
                    )}
                  </div>
                )
              })}
            </section>
          )
        })}


      </>}
    </div>
  )
}

/** the phone walk: one pallet at a time, door to back, freezer by freezer */
function Walk({ walk, save, pallet, contents, loc, altsFor, chip, busy, lineOf, tol, close, finish }: {
  walk: Saved; save: (v: Saved) => void; pallet: (id: number) => Pallet | undefined; contents: (id: number) => Pallet[]; loc: (p: Pallet) => Loc
  altsFor: (lineId: number, lbs: number, skip: Set<number>, fzIn: Set<number | null>) => { p: Pallet; L: Loc; same: boolean; text: string }[]
  chip: (lineId: number) => ReactNode; busy: boolean; lineOf: (id: number) => FLine | undefined; tol: number
  close: () => void; finish: (rows: PRow[]) => void
}) {
  useBack(true, close)
  const rows = walk.rows.map(r => ({ ...r, p: pallet(r.id) })).filter((r): r is typeof r & { p: Pallet } => !!r.p)
  const done = new Set(walk.done)
  const left = rows.filter(r => !done.has(r.id))
  const next = left[0]
  const fzs = [...new Set(rows.map(r => loc(r.p).fz))]
  const fzNow = next ? loc(next.p).fz : null
  const here = rows.filter(r => loc(r.p).fz === fzNow)
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null)
  const [swapFor, setSwapFor] = useState<number | null>(null)
  const [why, setWhy] = useState(REASONS[0])
  const mark = (id: number) => { if (!done.has(id)) save({ ...walk, done: [...walk.done, id] }) }
  const scan = (tag: string) => {
    const r = rows.find(x => sameTag(x.p.package_tag, tag) || (x.p.kind === 'mixed' && contents(x.id).some(c => sameTag(c.package_tag, tag))))
    if (!r) { setMsg({ t: "That tag isn't on this pick. Check the label and scan again.", bad: true }); return }
    if (done.has(r.id)) { setMsg({ t: `${r.p.code} is already picked.` }); return }
    mark(r.id); setMsg({ t: `${r.p.code} picked${r.whole ? '' : `: split ${n0(r.lbs)} lbs off it`}.` })
  }
  useScanHandler(tag => { scan(tag); return true })
  const swapRow = swapFor != null ? rows.find(r => r.id === swapFor) : undefined
  const doSwap = (p: Pallet) => {
    if (!swapRow) return
    const whole = w(p) <= swapRow.lbs + tol
    save({ ...walk, rows: walk.rows.map(r => r.id === swapRow.id ? { lineId: r.lineId, id: p.id, lbs: whole ? w(p) : r.lbs, whole } : r),
      notes: { ...walk.notes, [swapRow.id]: `${why}: ${swapRow.p.code} (${loc(swapRow.p).spot}), took ${p.code} instead` } })
    setSwapFor(null); setMsg({ t: `Swapped ${swapRow.p.code} for ${p.code}.` })
  }
  const toAssign: PRow[] = rows.filter(r => done.has(r.id) && !r.held).map(r => ({ lineId: r.lineId, pallet: r.p, lbs: r.lbs, whole: r.whole }))
  const L = next ? loc(next.p) : null

  return (
    <div className="list fulfill pmp walk">
      <button className="backbtn2" onClick={close}>Plan</button>
      {next && L ? <>
        <div className="muted small">Freezer {fzs.indexOf(fzNow) + 1} of {fzs.length}</div>
        <div className="row between"><h2>{L.fzLabel}</h2><b className="ok-t">{walk.done.length} of {rows.length} picked</b></div>
        <div className="walk-bar"><i style={{ width: `${Math.round(walk.done.length / Math.max(1, rows.length) * 100)}%` }} /></div>
        {msg && <div className={msg.bad ? 'warnbox' : 'okbox'}>{msg.t}</div>}
        {here.filter(r => done.has(r.id)).map(r => <div key={r.id} className="walk-done">✓ <b>{loc(r.p).spot} · {r.p.code}</b> <span className="muted">{r.p.strain} · {n0(r.lbs)} lbs</span></div>)}
        <div className="walk-card">
          <div className="row between"><span className="walk-k">Next</span>{chip(next.lineId)}</div>
          <div className="walk-spot"><b>{L.spot}</b><span>{L.side ? `${L.side} side, ${L.front === 1 ? 'at the door' : `${L.front} back from the door`}` : ''}</span></div>
          {L.inFront.length > 0 && <div className="warn-t small">{L.inFront.length} pallet{L.inFront.length === 1 ? '' : 's'} in front of it</div>}
          <div className="walk-grid">
            <div><span>Pallet</span><b>{next.p.code}</b></div>
            {next.p.kind === 'mixed'
              ? <><div><span>Tag</span><b className="small">Scan any package on it</b></div>
                <div><span>Mixed pallet</span><b>{mixList(contents(next.id))}</b></div>
                <div><span>On the pallet</span><b>{n0(contents(next.id).reduce((a, c) => a + w(c), 0))} lbs</b></div></>
              : <><div><span>Tag ends</span><b className="mono">…{(next.p.package_tag ?? '').slice(-7) || 'no tag'}</b></div>
                <div><span>Strain</span><b>{next.p.strain}</b></div>
                <div><span>On the pallet</span><b>{n0(w(next.p))} lbs{next.p.boxes ? ` · ${next.p.boxes} boxes` : ''}</b></div></>}
          </div>
          <div className={`walk-do ${next.whole ? '' : 'split'}`}>{next.whole ? 'Take the whole pallet' : `Take${boxes(next.lbs)} (${n0(next.lbs)} lbs). Leave ${n0(w(next.p) - next.lbs)} lbs on ${next.p.code}.`}</div>
        </div>
        {here.filter(r => !done.has(r.id) && r !== next).map(r => <div key={r.id} className="walk-done muted"><b>{loc(r.p).spot} · {r.p.code}</b> {r.p.strain} · {n0(r.lbs)} lbs</div>)}
        {(() => { const nf = left.find(r => loc(r.p).fz !== fzNow); return nf ? <div className="muted small">Then: <b>{loc(nf.p).fzLabel}</b> · {left.filter(r => loc(r.p).fz === loc(nf.p).fz).length} pallet(s)</div> : null })()}
        <div className="walk-act">
          <ScanButton onScan={scan} />
          <button className="ghost" onClick={() => { mark(next.id); setMsg({ t: `${next.p.code} marked picked without a scan.` }) }}>Picked (no scan)</button>
          {!next.held && <button className="ghost" onClick={() => { setSwapFor(next.id); setWhy(REASONS[0]) }}>Not here / swap</button>}
        </div>
      </> : <>
        <h2>All {rows.length} picked</h2>
        {Object.values(walk.notes).length > 0 && <div className="warnbox">{Object.values(walk.notes).map(n => <div key={n}>{n}</div>)}</div>}
        {toAssign.length > 0
          ? <><p>Assign the {toAssign.length} pallet{toAssign.length === 1 ? '' : 's'} you picked to {toAssign.length === 1 ? 'its line' : 'their lines'}? Splits get a pending tag until the new label goes on.</p>
            <div className="row wrap"><button className="primary" disabled={busy} onClick={() => finish(toAssign)}>{busy ? 'Assigning…' : 'Assign what I picked'}</button></div></>
          : <p className="muted">Everything on this walk was already assigned. Nothing else to do here.</p>}
      </>}

      {swapRow && (
        <div className="scrim" onClick={() => setSwapFor(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-h"><div><h2>Swap {swapRow.p.code} ({loc(swapRow.p).spot})</h2><div className="muted">{lineOf(swapRow.lineId)?.strain} line still needs {n0(swapRow.lbs)} lbs</div></div>
              <button className="ghost" aria-label="Close" onClick={() => setSwapFor(null)}>✕</button></div>
            <div className="small"><b>Why?</b></div>
            <div className="row wrap">{REASONS.map(r => <button key={r} className={`chip ${why === r ? 'on' : ''}`} onClick={() => setWhy(r)}>{r}</button>)}</div>
            <div className="small" style={{ marginTop: 8 }}><b>Pick another</b></div>
            {altsFor(swapRow.lineId, swapRow.lbs, new Set(rows.map(r => r.id)), new Set(left.filter(r => r.id !== swapRow.id).map(r => loc(r.p).fz))).slice(0, 5).map(a => (
              <button key={a.p.id} className="walk-alt" onClick={() => doSwap(a.p)}>
                <b>{a.L.spot}</b><span className="grow"><b>{a.p.code}</b> · {a.L.fzLabel.replace(/^\w+ /, '')} · {n0(w(a.p))} lbs<span className={`small ${a.same ? 'ok-t' : 'warn-t'}`}> {a.text}</span></span><span aria-hidden="true">›</span>
              </button>))}
            <div className="muted small" style={{ marginTop: 6 }}>Or scan a different {lineOf(swapRow.lineId)?.strain} pallet off the shelf: close this and use + Assign pallets on the order.</div>
          </div>
        </div>
      )}
    </div>
  )
}

/** the freezer from the door: 2 sides, back wall at the top */
function FzMap({ rows, loc }: { rows: RRow[]; loc: (p: Pallet) => Loc }) {
  const max = Math.max(9, ...rows.map(r => loc(r.pallet).front))
  const L0 = loc(rows[0].pallet)
  const spots: { k: string; label: string; on: boolean; split: boolean }[] = []
  for (let f = max; f >= 1; f--) for (const side of ['Left', 'Right']) {
    const rs = rows.filter(x => loc(x.pallet).front === f && loc(x.pallet).side === side)
    const r = rs[0]
    spots.push({ k: `${f}${side}`, label: r ? `${loc(r.pallet).spot} · ${rs.map(x => x.pallet.code).join(', ')}` : '', on: !!r, split: rs.some(x => !x.whole) })
  }
  if (!L0.side) return <div className="muted small">{rows.map(r => loc(r.pallet).spot).join(', ')}</div>
  return (
    <div className="pmp-map" aria-label={`${L0.fzLabel} map`}>
      <div className="muted small center-t">Back wall</div>
      <div className="pmp-grid">{spots.map(s => <div key={s.k} className={`pmp-cell ${s.on ? (s.split ? 'split' : 'on') : ''}`}>{s.label}</div>)}</div>
      <div className="pmp-door">Door</div>
    </div>
  )
}
