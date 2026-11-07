// Plan my pick (Msg PICK-1): its own page from the Fulfillment order page. Builds a pick for the whole order
// that opens as few freezers as possible, lets you change any pallet, then assigns it with the same calls as
// + Assign pallets (pick_pallet / pick_part). Nothing is held until "Use this plan".
import { useEffect, useMemo, useState } from 'react'
import type { Backend } from './api'
import type { FLine, FOrder, Pallet } from './types'
import { makePlan, rescore, type Loc, type Mode, type PLine, type PRow } from './pickplan'
import { useBack, scrollTop } from './nav'

const n0 = (x: number) => Math.round(Number(x)).toLocaleString()
const w = (p: Pallet) => Number(p.current_weight ?? 0)
const got = (l: FLine) => l.picks.reduce((a, p) => a + Number(p.lbs), 0)
const MODES: { k: Mode; label: string }[] = [
  { k: 'freezers', label: 'Fewest freezers' }, { k: 'oldest', label: 'Oldest harvest first' }, { k: 'splits', label: 'Fewest splits' }]

export function PlanMyPick({ o, cands, loc, backend, reload, flash, back }: {
  o: FOrder; cands: (l: FLine) => Pallet[]; loc: (p: Pallet) => Loc; backend: Backend
  reload: () => Promise<void>; flash: (t: string, bad?: boolean) => void; back: () => void
}) {
  useBack(true, back)
  const [tol, setTol] = useState(5)
  useEffect(() => {
    backend.client()?.rpc('fill_tolerance').then(({ data }) => { if (data != null && Number(data) >= 0) setTol(Number(data)) }, () => {})
  }, [backend])
  // lines that still need lbs, and the free pallets for each, split by site
  const all = useMemo(() => o.lines.filter(l => !l.cant_fill).map(l => ({ id: l.id, strain: l.strain, need: Math.max(0, Number(l.lbs) - got(l)), cands: cands(l) })), [o, cands])
  const sites = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of all) for (const p of l.cands) { const s = loc(p).site; if (s) m.set(s, (m.get(s) ?? 0) + w(p)) }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s)
  }, [all, loc])
  const [site, setSite] = useState<string | null>(null)
  const st = site ?? sites[0] ?? null
  const lines: PLine[] = useMemo(() => all.map(l => ({ ...l, cands: l.cands.filter(p => loc(p).site === st && loc(p).fz != null) })), [all, st, loc])
  const [mode, setMode] = useState<Mode>('freezers')
  const fresh = useMemo(() => makePlan(lines, tol, mode, loc), [lines, tol, mode, loc])
  const [rows, setRows] = useState<PRow[] | null>(null)
  const [change, setChange] = useState<number | null>(null)   // pallet id being changed
  useEffect(() => { setRows(null); setChange(null) }, [mode, st, tol])
  const plan = rows ? rescore(lines, rows, loc) : fresh
  const [showMap, setShowMap] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const groups = useMemo(() => {
    const m = new Map<number, PRow[]>()
    for (const r of plan.rows) { const k = loc(r.pallet).fz ?? -1; m.set(k, [...(m.get(k) ?? []), r]) }
    return [...m.entries()]
  }, [plan, loc])
  const lineOf = (id: number) => o.lines.find(l => l.id === id)!
  const nothing = lines.every(l => l.need <= tol)

  const use = async () => {
    setBusy(true)
    let done = 0
    try {
      for (const r of plan.rows) {
        if (r.whole) await backend.pickPallet(r.lineId, r.pallet.id)
        else await backend.pickPart(r.lineId, r.pallet.id, r.lbs, null)
        done++
      }
      await reload(); flash(`${done} pallet${done === 1 ? '' : 's'} assigned. Splits are tag pending until the new label goes on.`); back()
    } catch (e) {
      if (done) await reload()
      flash(`${done ? `${done} assigned, then: ` : ''}${String((e as Error).message ?? e)}`, true)
    } finally { setBusy(false) }
  }

  // other pallets for the line, with what each does to the plan
  const alts = (r: PRow) => {
    const inPlan = new Set(plan.rows.map(x => x.pallet.id))
    const fzIn = new Set(plan.rows.filter(x => x !== r).map(x => loc(x.pallet).fz))
    const l = lines.find(x => x.id === r.lineId)
    return (l?.cands ?? []).filter(p => !inPlan.has(p.id) && w(p) > 0).map(p => {
      const L = loc(p), same = fzIn.has(L.fz), d = w(p) - r.lbs
      const bits = [same ? 'Already going there' : '+1 freezer',
        Math.abs(d) <= tol ? 'whole' : d > 0 ? `split ${n0(d)} back` : `${n0(-d)} short`,
        L.inFront.length ? `${L.inFront.length} in the way` : '']
      return { p, L, same, text: bits.filter(Boolean).join(' · ') }
    }).sort((a, b) => Number(b.same) - Number(a.same) || a.L.inFront.length - b.L.inFront.length || Math.abs(w(a.p) - r.lbs) - Math.abs(w(b.p) - r.lbs))
  }
  const swap = (r: PRow, p: Pallet) => {
    const whole = w(p) <= r.lbs + tol
    setRows(plan.rows.map(x => x === r ? { lineId: r.lineId, pallet: p, lbs: whole ? w(p) : r.lbs, whole } : x))
    setChange(null)
  }

  return (
    <div className="list fulfill pmp">
      <button className="ghost small" onClick={back}>‹ {o.so ?? `Order #${o.id}`}</button>
      <h2>Plan my pick <span className="muted">{o.customer}</span></h2>
      {sites.length > 1 && <div className="seg small-seg" role="group" aria-label="Site">
        {sites.map(s => <button key={s} className={s === st ? 'on' : ''} onClick={() => setSite(s)}>{s}</button>)}</div>}

      {nothing ? <div className="okbox">Every line already has its pallets.</div> : <>
        <div className="pmp-sum">
          <b>{plan.freezers.length} freezer{plan.freezers.length === 1 ? '' : 's'} · {plan.rows.length} pallet{plan.rows.length === 1 ? '' : 's'} · {plan.splits} split{plan.splits === 1 ? '' : 's'}</b>
          {plan.moves > 0 && <span className="muted"> · {plan.moves} pallet{plan.moves === 1 ? '' : 's'} to move out of the way</span>}
          <label className="pmp-mode">Plan for <select value={mode} onChange={e => setMode(e.target.value as Mode)}>
            {MODES.map(m => <option key={m.k} value={m.k}>{m.label}</option>)}</select></label>
        </div>
        {rows && <div className="muted small">You changed this plan. <button className="linkbtn" onClick={() => setRows(null)}>Start over</button></div>}
        {[...plan.short.entries()].map(([id, lbs]) => <div key={id} className="warnbox">{lineOf(id).strain}: {n0(lbs)} lbs short at {st}. Not enough free pallets here{sites.length > 1 ? '; try the other site' : ''}.</div>)}

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
                      <span className="grow">{r.pallet.strain}<span className="muted small"> {L.side ? `· ${L.side}${L.front === 1 ? ', at the door' : `, ${L.front} back`}` : ''}{L.inFront.length ? ` · ${L.inFront.length} in the way` : ''}</span></span>
                      <span className="pmp-lbs">{n0(r.lbs)}{!r.whole ? <span className="muted"> of {n0(w(r.pallet))}</span> : ''} lbs</span>
                      <span className={`pmp-do ${r.whole ? '' : 'split'}`}>{r.whole ? 'Whole' : `Split${r.lbs % 10 === 0 ? ` ${r.lbs / 10} boxes` : ''}`}</span>
                      <button className="linkbtn" onClick={() => { setChange(change === r.pallet.id ? null : r.pallet.id) }}>{change === r.pallet.id ? 'Cancel' : 'Change'}</button>
                    </div>
                    {change === r.pallet.id && (
                      <div className="pmp-alts">
                        <div className="muted small">Change {r.pallet.code}: the {lineOf(r.lineId).strain} line needs {n0(r.lbs)} lbs from here. Each choice says what it does to the plan.</div>
                        {alts(r).slice(0, 6).map(a => (
                          <div key={a.p.id} className="pmp-alt">
                            <b className="pmp-code">{a.p.code}</b>
                            <span className="muted">{a.L.fzLabel.replace(/^\w+ /, '')} · {a.L.spot}</span>
                            <span className="pmp-lbs">{n0(w(a.p))} lbs</span>
                            <span className={`grow small ${a.same ? 'ok-t' : 'warn-t'}`}>{a.text}</span>
                            <button className="ghost small" onClick={() => swap(r, a.p)}>Use {a.p.code}</button>
                          </div>
                        ))}
                        {!alts(r).length && <div className="muted small">No other free {lineOf(r.lineId).strain} pallets at {st}.</div>}
                      </div>
                    )}
                  </div>
                )
              })}
            </section>
          )
        })}

        <div className="row wrap pmp-act">
          <button className="primary" disabled={busy || !plan.rows.length} onClick={use}>{busy ? 'Assigning…' : 'Use this plan'}</button>
          <button className="ghost" onClick={() => { scrollTop(); window.print() }}>Print</button>
        </div>
        <p className="muted small">Use this plan assigns these pallets to the lines and holds them for this order, same as + Assign pallets. Splits get a pending tag until the new label goes on. Scanning on the floor still checks each pallet.</p>
      </>}
    </div>
  )
}

/** the freezer from the door: 2 sides, back wall at the top */
function FzMap({ rows, loc }: { rows: PRow[]; loc: (p: Pallet) => Loc }) {
  const mine = new Map(rows.map(r => [loc(r.pallet).spot, r]))
  const max = Math.max(9, ...rows.map(r => loc(r.pallet).front))
  const L0 = loc(rows[0].pallet)
  const spots: { k: string; label: string; on: boolean; split: boolean }[] = []
  for (let f = max; f >= 1; f--) for (const side of ['Left', 'Right']) {
    const r = rows.find(x => loc(x.pallet).front === f && loc(x.pallet).side === side)
    spots.push({ k: `${f}${side}`, label: r ? `${loc(r.pallet).spot} · ${r.pallet.code}` : '', on: !!r, split: !!r && !r.whole })
  }
  if (!L0.side) return <div className="muted small">{[...mine.keys()].join(', ')}</div>
  return (
    <div className="pmp-map" aria-label={`${L0.fzLabel} map`}>
      <div className="muted small center-t">Back wall</div>
      <div className="pmp-grid">{spots.map(s => <div key={s.k} className={`pmp-cell ${s.on ? (s.split ? 'split' : 'on') : ''}`}>{s.label}</div>)}</div>
      <div className="pmp-door">Door</div>
    </div>
  )
}
