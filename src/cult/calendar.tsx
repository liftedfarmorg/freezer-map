import { useEffect, useMemo, useState } from 'react'
import { addDays, fmtD, monday, n0, sum, today } from './calc'
import type { Ctx } from './calc'
import type { CultApi } from './api'
import type { CultData, Harvest, NurseryOrder, PlanData } from './types'
import { Kpis, Pick, errText } from './ui'
import { WeekTab } from './week'
import { useSaved } from '../saved'

// FB-0013 (Garrett) / Aziz 11/12: Cultivation "Week" is now "Calendar" with two tabs.
// Harvest = the week view as it was. Planting = next year's plan by day: planting, receive at the farm, ship from the
// nursery and cut at the nursery, from the plan's nursery deliveries. Read only; dates are changed in Plan.
// Dates not set on a delivery are worked out the same way the plan will (CULT-PLAN-1): receive = planting minus 5 days,
// ship = receive (same day), cut = ship minus 17 days. Those show as "est.".

type Kind = 'plant' | 'receive' | 'ship' | 'cut'
const KINDS: { k: Kind; l: string }[] = [{ k: 'plant', l: 'Planting' }, { k: 'receive', l: 'Receive at farm' }, { k: 'ship', l: 'Nursery ships' }, { k: 'cut', l: 'Nursery cuts' }]
const RECEIVE_DAYS = 5, CUT_DAYS = 17
type Ev = { day: string; kind: Kind; o: NurseryOrder; est: boolean }

export function CalendarTab({ d, c, site, onOpen, api }: { d: CultData; c: Ctx; site: string | null; onOpen: (h: Harvest) => void; api: CultApi }) {
  const [sub, setSub] = useSaved<'harvest' | 'planting'>('cult.calendar.sub', 'harvest')
  return <>
    <div className="row toolbar calsub">
      <div className="seg">
        <button className={sub === 'harvest' ? 'on' : ''} onClick={() => setSub('harvest')}>Harvest</button>
        <button className={sub === 'planting' ? 'on' : ''} onClick={() => setSub('planting')}>Planting</button>
      </div>
    </div>
    {sub === 'harvest' ? <WeekTab d={d} c={c} site={site} onOpen={onOpen} /> : <PlantingCal d={d} site={site} api={api} />}
  </>
}

function events(o: NurseryOrder): Ev[] {
  const plantRaw = o.plant_on ?? (o.deliver_on ? addDays(o.deliver_on, RECEIVE_DAYS) : null)
  if (!plantRaw && !o.deliver_on) return []
  const receive = o.deliver_on ?? addDays(plantRaw!, -RECEIVE_DAYS)
  const plant = plantRaw ?? addDays(receive, RECEIVE_DAYS)
  const cut = o.cut_on ?? addDays(receive, -CUT_DAYS)
  return [
    { day: plant, kind: 'plant', o, est: !o.plant_on },
    { day: receive, kind: 'receive', o, est: !o.deliver_on },
    { day: receive, kind: 'ship', o, est: !o.deliver_on },
    { day: cut, kind: 'cut', o, est: !o.cut_on },
  ]
}

function PlantingCal({ d, site, api }: { d: CultData; site: string | null; api: CultApi }) {
  const [year, setYear] = useSaved<number>('cult.calendar.planting.year', d.currentYear + 1)
  const [show, setShow] = useSaved<Kind[]>('cult.calendar.planting.show', ['plant', 'receive', 'ship', 'cut'])
  const [nursery, setNursery] = useSaved<string>('cult.calendar.planting.nursery', '')
  const [q, setQ] = useState('')
  const [p, setP] = useState<PlanData | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [wk, setWk] = useState<string | null>(null)
  useEffect(() => { let gone = false; setP(null); api.loadPlan(year).then(x => { if (!gone) { setP(x); setErr(null) } }).catch(e => { if (!gone) setErr(errText(e)) }); return () => { gone = true } }, [api, year])

  const orders = useMemo(() => (p?.orders ?? []).filter(o => o.status !== 'cancelled' && (!site || o.site === site)
    && (!nursery || (o.nursery ?? '') === nursery) && (!q || o.strain.toLowerCase().includes(q.toLowerCase()))), [p, site, nursery, q])
  const evs = useMemo(() => orders.flatMap(events).filter(e => show.includes(e.kind)).sort((a, b) => a.day.localeCompare(b.day)), [orders, show])
  // the plan rows with no delivery yet (no dates to put on the calendar)
  const undated = useMemo(() => (p?.plan ?? []).filter(r => (!site || r.site === site) && (!nursery || (r.nursery ?? '') === nursery)
    && (!q || r.strain.toLowerCase().includes(q.toLowerCase())) && !(p?.orders ?? []).some(o => o.plan_id === r.id && o.status !== 'cancelled' && (o.plant_on || o.deliver_on))), [p, site, nursery, q])
  const nurseries = [...new Set((p?.orders ?? []).map(o => o.nursery ?? '').filter(Boolean))].sort()

  // start on this week if the season is on now, else the first week with something on it
  const now = today()
  const first = evs.length ? monday(evs[0].day) : monday(now)
  const last = evs.length ? monday(evs[evs.length - 1].day) : monday(now)
  const w = wk ?? (monday(now) >= first && monday(now) <= last ? monday(now) : first)
  const days = Array.from({ length: 7 }, (_, i) => addDays(w, i))
  const inWeek = evs.filter(e => e.day >= days[0] && e.day <= days[6])
  const tot = (k: Kind) => sum(inWeek.filter(e => e.kind === k).map(e => e.o.plants))
  const toggle = (k: Kind) => setShow(show.includes(k) ? show.filter(x => x !== k) : [...show, k])
  const years = [...new Set([d.currentYear + 1, d.currentYear, ...d.years])].sort((a, b) => b - a)

  return <>
    <div className="row toolbar calfilters">
      <Pick value={year} onChange={v => { if (v != null) { setYear(v); setWk(null) } }} options={years.map(y => ({ v: y, l: `${y} plan` }))} />
      <div className="seg calkinds">{KINDS.map(k => <button key={k.k} className={show.includes(k.k) ? 'on' : ''} onClick={() => toggle(k.k)}>{k.l}</button>)}</div>
      {nurseries.length > 1 && <Pick value={nursery} onChange={v => setNursery(v ?? '')} options={[{ v: '', l: 'All nurseries' }, ...nurseries.map(n => ({ v: n, l: n }))]} />}
      <input className="search" type="search" placeholder="Search strain" value={q} onChange={e => setQ(e.target.value)} />
    </div>
    {err ? <div className="warnbox">Couldn't load the {year} plan: {err}</div> : !p ? <p className="muted">Loading the {year} plan…</p> : <>
      <div className="cweek">
        <button className="ghost small" onClick={() => setWk(addDays(w, -7))}>‹ Prev</button>
        <b>Week of {fmtD(w)} – {fmtD(days[6])}</b>
        <button className="ghost small" onClick={() => setWk(addDays(w, 7))}>Next ›</button>
        {evs.length > 0 && w !== first && <button className="ghost small" onClick={() => setWk(first)}>First week</button>}
        {w !== monday(now) && <button className="ghost small" onClick={() => setWk(monday(now))}>This week</button>}
      </div>
      <Kpis items={[[n0(tot('plant')), 'plants going in'], [n0(tot('receive')), 'plants received'], [n0(tot('cut')), 'cuttings to take'],
        [n0(new Set(inWeek.map(e => e.o.strain)).size), 'strains']]} />
      <div className="cwrap"><table className="ctable caltable">
        <thead><tr><th>Day</th><th>What</th><th>Strain</th><th>Farm</th><th className="hide-s">Nursery</th><th className="num">Plants</th></tr></thead>
        <tbody>{days.map(day => {
          const es = inWeek.filter(e => e.day === day).sort((a, b) => KINDS.findIndex(k => k.k === a.kind) - KINDS.findIndex(k => k.k === b.kind) || a.o.strain.localeCompare(b.o.strain))
          if (!es.length) return <tr key={day} className="heat0"><td className="nowrap">{fmtD(day, true)}</td><td colSpan={5} className="muted">—</td></tr>
          return es.map((e, i) => <tr key={`${day}-${e.kind}-${e.o.id}`}>
            <td className="nowrap">{i === 0 ? fmtD(day, true) : ''}</td>
            <td className="nowrap"><span className={`kpill cal-${e.kind}`}>{KINDS.find(k => k.k === e.kind)!.l}</span>{e.est && <span className="muted small"> est.</span>}</td>
            <td>{e.o.strain}</td><td>{e.o.site}</td><td className="hide-s">{e.o.nursery ?? ''}</td><td className="num">{n0(e.o.plants)}</td>
          </tr>)
        })}</tbody>
      </table></div>
      {!evs.length && <p className="muted">Nothing dated in the {year} plan{site ? ` at ${site}` : ''} yet. Dates come from the plan's nursery deliveries (Cultivation › Plan).</p>}
      {undated.length > 0 && <>
        <h3 className="csec">No dates yet <span className="muted">{undated.length} plan row{undated.length === 1 ? '' : 's'} · {n0(sum(undated.map(r => r.plants)))} plants</span></h3>
        <p className="muted small">{undated.slice(0, 40).map(r => `${r.strain} (${r.site}, ${n0(r.plants)})`).join(' · ')}{undated.length > 40 ? ` · and ${undated.length - 40} more` : ''}</p>
      </>}
      <p className="cnote">From the {year} plan's nursery deliveries. Dates not set on a delivery are estimated (est.): receive at the farm {RECEIVE_DAYS} days before planting, the nursery ships the same day, and cuts {CUT_DAYS} days before that. Change dates in Cultivation › Plan.</p>
    </>}
  </>
}
