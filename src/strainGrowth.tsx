import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

// FB-0023 (Mavrik): strain card > Cultivation: growth timeline per planting, every crop year.
// Planted, first flower, harvested, days of flower (first flower to harvest) and days in the ground (planting to harvest),
// with averages. Helps pick planting dates. First flower comes from the planting (Cultivation > Plantings); 2026 OHR
// dates were imported from Farm Data OHR 2026 (Summary tab). Matches the strain by its name and other names.

type Pl = { id: number; crop_year: number; site: string; field_id: number | null; strain: string; planted_on: string | null; first_flower: string | null; plants: number | null; plant_loss: number | null }
type Hv = { id: number; planting_id: number | null; kind: string | null; status: string | null; harvested_on: string | null; planned_on: string | null; plants_harvested: number | null }
type Row = { p: Pl; field: string; harvested: string | null; planned: boolean; flower: number | null; ground: number | null }

const esc = (s: string) => s.replace(/[%_\\]/g, m => `\\${m}`)
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 86400000)
const md = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—')
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null)

export function StrainGrowth({ sb, name, aliases }: { sb: SupabaseClient | null; name: string; aliases: string[] }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const key = [name, ...aliases].join('|')
  useEffect(() => {
    if (!sb || !name) return
    let gone = false
    ;(async () => {
      const names = [...new Set([name, ...aliases].map(n => n.trim()).filter(Boolean))]
      const pm = new Map<number, Pl>()
      for (const n of names) {
        const { data, error } = await sb.from('cult_plantings').select('id,crop_year,site,field_id,strain,planted_on,first_flower,plants,plant_loss').ilike('strain', esc(n)).limit(1000)
        if (error) throw error
        for (const r of (data ?? []) as Pl[]) pm.set(r.id, r)
      }
      const ids = [...pm.keys()]
      const [{ data: hv, error: he }, { data: fl }] = await Promise.all([
        ids.length ? sb.from('cult_harvests').select('id,planting_id,kind,status,harvested_on,planned_on,plants_harvested').in('planting_id', ids).neq('status', 'cancelled') : Promise.resolve({ data: [], error: null }),
        sb.from('fields').select('id,name'),
      ])
      if (he) throw he
      const field = new Map(((fl ?? []) as { id: number; name: string }[]).map(f => [f.id, f.name]))
      const byP = new Map<number, Hv[]>()
      for (const h of (hv ?? []) as Hv[]) if (h.planting_id != null && !/combine|strip/.test(h.kind ?? '')) (byP.get(h.planting_id) ?? byP.set(h.planting_id, []).get(h.planting_id)!).push(h)
      const out: Row[] = [...pm.values()].map(p => {
        const hs = byP.get(p.id) ?? []
        // the planting's harvest day = its first done harvest (a 2nd day "-2" counts from the first); else the planned date
        const done = hs.filter(h => h.status === 'done' && h.harvested_on).map(h => h.harvested_on!).sort()
        const plan = hs.filter(h => h.status === 'planned' && h.planned_on).map(h => h.planned_on!).sort()
        const harvested = done[0] ?? plan[0] ?? null
        const planned = !done.length && !!plan.length
        return {
          p, field: p.field_id != null ? field.get(p.field_id) ?? '' : '', harvested, planned,
          flower: p.first_flower && harvested && !planned ? days(p.first_flower, harvested) : null,
          ground: p.planted_on && harvested && !planned ? days(p.planted_on, harvested) : null,
        }
      }).sort((a, b) => b.p.crop_year - a.p.crop_year || (a.p.planted_on ?? '9').localeCompare(b.p.planted_on ?? '9') || a.p.site.localeCompare(b.p.site))
      if (!gone) { setRows(out); setErr(null) }
    })().catch(e => { if (!gone) setErr((e as Error).message) })
    return () => { gone = true }
  }, [sb, key])

  if (!sb) return null
  const years = rows ? [...new Set(rows.map(r => r.p.crop_year))] : []
  return <div className="sgrowth">
    <h3>Growth timeline</h3>
    {err ? <p className="muted small">Couldn't load: {err}</p> : !rows ? <p className="muted small">Loading…</p> : !rows.length ? <p className="muted small">No plantings of {name} yet.</p> : <>
      {years.map(y => {
        const rs = rows.filter(r => r.p.crop_year === y)
        const fl = avg(rs.map(r => r.flower).filter((x): x is number => x != null)), gr = avg(rs.map(r => r.ground).filter((x): x is number => x != null))
        const ff = rs.map(r => r.p.first_flower).filter((x): x is string => !!x).map(d => d.slice(5)).sort()
        return <div key={y} className="sg-year">
          <div className="sw-chips">
            <div className="sw-chip fld"><b>{y}</b><span>{rs.length} planting{rs.length === 1 ? '' : 's'}</span></div>
            <div className="sw-chip fld"><b>{ff.length ? `${md(`${y}-${ff[0]}`)}${ff[ff.length - 1] !== ff[0] ? ` – ${md(`${y}-${ff[ff.length - 1]}`)}` : ''}` : '—'}</b><span>First flower window</span></div>
            <div className="sw-chip fld"><b>{fl ?? '—'}</b><span>Avg days of flower</span></div>
            <div className="sw-chip fld"><b>{gr ?? '—'}</b><span>Avg days in the ground</span></div>
          </div>
          <div className="cwrap"><table className="ctable sw-t">
            <thead><tr><th>Where</th><th>Planted</th><th>First flower</th><th>Harvested</th><th className="num">Days of flower</th><th className="num">Days in ground</th><th className="num hide-s">Plants</th></tr></thead>
            <tbody>{rs.map(r => <tr key={r.p.id}>
              <td>{r.p.site}{r.field ? ` · ${r.field}` : ''}</td>
              <td className="nowrap">{md(r.p.planted_on)}</td>
              <td className="nowrap">{md(r.p.first_flower)}</td>
              <td className="nowrap">{r.harvested ? <>{md(r.harvested)}{r.planned && <span className="muted small"> planned</span>}</> : '—'}</td>
              <td className="num">{r.flower ?? '—'}</td>
              <td className="num">{r.ground ?? '—'}</td>
              <td className="num hide-s">{r.p.plants != null ? Math.round(r.p.plants).toLocaleString() : ''}</td>
            </tr>)}</tbody>
          </table></div>
        </div>
      })}
      <p className="muted small">Days of flower = first flower to harvest. Days in the ground = planting to harvest. First flower is set on each planting (Cultivation › Plantings).</p>
    </>}
  </div>
}
