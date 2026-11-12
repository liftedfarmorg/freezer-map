import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PRODUCT_LABEL } from './types'
import type { Product } from './types'

// STRAIN-INV-1: "Where it is now" on the strain card: inventory (pallets by product, crop year and freezer), nursery (mothers,
// cutting batches) and field (this year's plantings and harvests), plus seed lots. Matches the strain by its name and other names.
type Row = { sec: 'inv' | 'nur' | 'fld' | 'seed'; stage: string; tone: string; where: string; sub?: string; qty: string; qtySub?: string; details: string; since: string; sort: string }
interface Data { rows: Row[]; lbs: number; pallets: number; moms: number; rooting: number; field: number; last: { n: number; lbs: number } }

const lc = (x: string | null | undefined) => (x ?? '').trim().toLowerCase()
const n0 = (n: number) => Math.round(n).toLocaleString()
const md = (d: string | null | undefined) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '')
const esc = (s: string) => s.replace(/[%_\\]/g, m => `\\${m}`)
const SEC: Record<Row['sec'], string> = { inv: 'Inventory', nur: 'Nursery (1PN)', fld: 'Field', seed: 'Seed' }
const USE: Record<string, string> = { g1: 'G1 moms', g2: 'G2 moms', g3: 'G3 moms', g4: 'Gen 4 plants', phenos: 'Phenos', keepers: 'Pheno keepers', trials: 'Trials', receivers: 'Receivers', donors: 'Donors' }

async function byNames<T>(sb: SupabaseClient, table: string, cols: string, col: string, names: string[], more: (q: any) => any): Promise<T[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out = new Map<number, T>()
  for (const n of names) {
    const { data } = await more(sb.from(table).select(cols).ilike(col, esc(n))).limit(2000)
    for (const r of (data ?? []) as (T & { id: number })[]) out.set(r.id, r)
  }
  return [...out.values()]
}

async function loadWhere(sb: SupabaseClient, names: string[]): Promise<Data> {
  const year = new Date().getFullYear()
  type P = { id: number; product: string | null; crop_year: number | null; status: string; current_weight: number | null; slot_id: number | null; zone: string | null }
  const [pal, moms, bats, pls, hvs] = await Promise.all([
    byNames<P>(sb, 'pallets', 'id,product,crop_year,status,current_weight,slot_id,zone', 'strain', names, q => q.eq('kind', 'package').in('status', ['in_freezer', 'unslotted', 'in_transit', 'at_processor', 'archived'])),
    byNames<{ id: number; gen: number | null; season: number | null; room_id: number | null; qty: number | null; started_on: string | null }>(sb, 'nursery_mothers', 'id,gen,season,room_id,qty,started_on', 'strain', names, q => q.eq('status', 'active')),
    byNames<{ id: number; room_id: number | null; cut_on: string | null; cuttings: number | null; lost: number | null; stage: string; use: string | null; ready_on: string | null }>(sb, 'nursery_batches', 'id,room_id,cut_on,cuttings,lost,stage,use,ready_on', 'strain', names, q => q.in('stage', ['rooting', 'ready'])),
    byNames<{ id: number; site: string; field_id: number | null; plants: number | null; plant_loss: number | null; planted_on: string | null; flipped_on: string | null; trial: boolean | null }>(sb, 'cult_plantings', 'id,site,field_id,plants,plant_loss,planted_on,flipped_on,trial', 'strain', names, q => q.eq('crop_year', year)),
    byNames<{ id: number; site: string; field_id: number | null; kind: string | null; status: string | null; stage: string | null; plants: number | null; plants_harvested: number | null; harvested_on: string | null; planned_on: string | null }>(sb, 'cult_harvests', 'id,site,field_id,kind,status,stage,plants,plants_harvested,harvested_on,planned_on', 'strain', names, q => q.eq('crop_year', year)),
  ])
  const { data: seeds } = await sb.from('seed_lots').select('id,code,mother_strain,father_strain,seeds,harvested_on').gt('seeds', 0)
  // lookups: slots + freezers, nursery rooms, fields
  const slotIds = [...new Set(pal.map(p => p.slot_id).filter((x): x is number => x != null))]
  const [{ data: slots }, { data: rooms }, { data: fields }] = await Promise.all([
    slotIds.length ? sb.from('slots').select('id,code,freezer_id').in('id', slotIds) : Promise.resolve({ data: [] }),
    sb.from('nursery_rooms').select('id,name'),
    sb.from('fields').select('id,site,code,name'),
  ])
  const slot = new Map(((slots ?? []) as { id: number; code: string; freezer_id: number }[]).map(s => [s.id, s]))
  const frIds = [...new Set([...slot.values()].map(s => s.freezer_id))]
  const { data: frz } = frIds.length ? await sb.from('freezers').select('id,site,number').in('id', frIds) : { data: [] }
  const fr = new Map(((frz ?? []) as { id: number; site: string; number: number }[]).map(f => [f.id, f]))
  const room = new Map(((rooms ?? []) as { id: number; name: string }[]).map(r => [r.id, r.name]))
  const field = new Map(((fields ?? []) as { id: number; site: string; code: string; name: string }[]).map(f => [f.id, f]))
  const fieldName = (id: number | null) => (id != null && field.get(id) ? field.get(id)!.name : '')

  const rows: Row[] = []
  // inventory: live pallets grouped by product + crop year + freezer (Staging / in transit / at processor as their own place)
  const live = pal.filter(p => p.status !== 'archived')
  const groups = new Map<string, P[]>()
  for (const p of live) {
    const s = p.slot_id != null ? slot.get(p.slot_id) : undefined, f = s ? fr.get(s.freezer_id) : undefined
    const place = p.status === 'in_transit' ? 'In transit' : p.status === 'at_processor' ? 'At the processor' : f ? `${f.site} · Freezer ${f.number}` : 'Staging'
    const k = `${p.product ?? 'fresh_frozen'}|${p.crop_year ?? ''}|${place}`
    groups.set(k, [...(groups.get(k) ?? []), p])
  }
  for (const [k, ps] of groups) {
    const [prod, yr, place] = k.split('|')
    const lbs = ps.reduce((a, p) => a + Number(p.current_weight ?? 0), 0)
    const sizes = new Map<number, number>(); for (const p of ps) { const w = Math.round(Number(p.current_weight ?? 0)); sizes.set(w, (sizes.get(w) ?? 0) + 1) }
    const codes = ps.map(p => (p.slot_id != null ? slot.get(p.slot_id)?.code : null)).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))
    rows.push({ sec: 'inv', stage: PRODUCT_LABEL[prod as Product] ?? prod, tone: prod === 'fresh_frozen' ? 'frz' : 'dry', where: place, sub: codes.join(', '), qty: `${n0(lbs)} lb`,
      qtySub: `${ps.length} pallet${ps.length === 1 ? '' : 's'}`, details: [yr && `${yr} crop`, [...sizes].sort((a, b) => b[1] - a[1]).map(([w, n]) => `${n} × ${n0(w)}`).join(', ')].filter(Boolean).join(' · '), since: '', sort: `0${yr ? 9999 - Number(yr) : ''}${place}` })
  }
  // nursery: mothers by generation + room, cutting batches
  const mg = new Map<string, { n: number; season: number | null; since: string | null }>()
  for (const m of moms) { const k = `${m.gen ?? ''}|${m.room_id ?? ''}`; const g = mg.get(k) ?? { n: 0, season: m.season, since: m.started_on }; g.n += m.qty ?? 1; if (m.started_on && (!g.since || m.started_on < g.since)) g.since = m.started_on; mg.set(k, g) }
  for (const [k, g] of mg) { const [gen, rid] = k.split('|')
    rows.push({ sec: 'nur', stage: `Mothers${gen ? ` · G${gen}` : ''}`, tone: 'mom', where: room.get(Number(rid)) ?? '—', qty: `${n0(g.n)} plants`, details: g.season ? `${g.season} season` : '', since: g.since ? `Started ${md(g.since)}` : '', sort: `1a${gen}` }) }
  for (const b of bats) {
    const left = (b.cuttings ?? 0) - (b.lost ?? 0)
    rows.push({ sec: 'nur', stage: b.stage === 'ready' ? 'Ready' : 'Rooting', tone: b.stage === 'ready' ? 'veg' : 'root', where: room.get(b.room_id ?? -1) ?? '—', qty: `${n0(left)} cuttings`,
      details: b.use ? USE[b.use] ?? b.use : 'No use assigned yet', since: b.cut_on ? `Cut ${md(b.cut_on)}` : '', sort: `1b${b.cut_on ?? ''}` })
  }
  // field: this year's plantings and harvests
  for (const p of pls) rows.push({ sec: 'fld', stage: p.flipped_on ? 'Flowering' : 'Planted', tone: 'veg', where: `${p.site} · ${fieldName(p.field_id) || '—'}`, qty: `${n0((p.plants ?? 0) - (p.plant_loss ?? 0))} plants`,
    details: [`${year} crop`, p.trial ? 'Trial' : ''].filter(Boolean).join(' · '), since: p.flipped_on ? `Flipped ${md(p.flipped_on)}` : p.planted_on ? `Planted ${md(p.planted_on)}` : '', sort: `2a${p.planted_on ?? ''}` })
  for (const h of hvs) {
    const done = h.status === 'done' || !!h.harvested_on
    rows.push({ sec: 'fld', stage: `${done ? 'Harvested' : h.stage === 'drying' ? 'Drying' : h.stage === 'harvesting' ? 'Harvesting' : 'Harvest planned'}${h.kind ? ` · ${h.kind.toUpperCase()}` : ''}`, tone: done ? 'hv' : 'root',
      where: `${h.site} · ${fieldName(h.field_id) || '—'}`, qty: `${n0(h.plants_harvested ?? h.plants ?? 0)} plants`, details: done ? 'Done' : '', since: h.harvested_on ? md(h.harvested_on) : h.planned_on ? `Planned ${md(h.planned_on)}` : '', sort: `2b${h.harvested_on ?? h.planned_on ?? ''}` })
  }
  // seed lots of this strain (by the cross name or code)
  const nm = new Set(names.map(lc))
  for (const s of (seeds ?? []) as { id: number; code: string | null; mother_strain: string | null; father_strain: string | null; seeds: number | null; harvested_on: string | null }[]) {
    if (!nm.has(lc(`${s.mother_strain} x ${s.father_strain}`)) && !nm.has(lc(s.code))) continue
    rows.push({ sec: 'seed', stage: 'Seed lot', tone: 'mom', where: s.code ?? '—', qty: `${n0(s.seeds ?? 0)} seeds`, details: `${s.mother_strain ?? '?'} x ${s.father_strain ?? '?'}`, since: s.harvested_on ? `Harvested ${md(s.harvested_on)}` : '', sort: '3' })
  }
  rows.sort((a, b) => a.sort.localeCompare(b.sort))
  const arch = pal.filter(p => p.status === 'archived')
  return { rows, lbs: live.reduce((a, p) => a + Number(p.current_weight ?? 0), 0), pallets: live.length, moms: moms.reduce((a, m) => a + (m.qty ?? 1), 0),
    rooting: bats.reduce((a, b) => a + (b.cuttings ?? 0) - (b.lost ?? 0), 0), field: pls.reduce((a, p) => a + (p.plants ?? 0) - (p.plant_loss ?? 0), 0),
    last: { n: arch.length, lbs: arch.reduce((a, p) => a + Number(p.current_weight ?? 0), 0) } }
}

export function StrainWhere({ sb, name, aliases }: { sb: SupabaseClient | null; name: string; aliases: string[] }) {
  const [d, setD] = useState<Data | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const key = [name, ...aliases].join('|')
  useEffect(() => {
    if (!sb || !name) return
    let on = true
    loadWhere(sb, [name, ...aliases].filter(Boolean)).then(x => { if (on) setD(x) }, e => { if (on) setErr(String(e?.message ?? e)) })
    return () => { on = false }
  }, [sb, key])
  if (!sb) return null
  return (
    <div className="swhere">
      <h3>Where it is now</h3>
      {err ? <p className="muted small">Couldn't load: {err}</p> : !d ? <p className="muted small">Loading…</p> : <>
        <div className="sw-chips">
          <div className="sw-chip inv"><b>{n0(d.lbs)} lb</b><span>Inventory · {d.pallets} pallet{d.pallets === 1 ? '' : 's'}</span></div>
          <div className="sw-chip nur"><b>{n0(d.moms)}</b><span>Mothers</span></div>
          <div className="sw-chip nur"><b>{n0(d.rooting)}</b><span>Cuttings rooting</span></div>
          <div className="sw-chip fld"><b>{n0(d.field)}</b><span>Plants in field</span></div>
        </div>
        {!d.rows.length ? <p className="muted small">Nothing in inventory, the nursery or the field right now.</p> : <div className="cwrap"><table className="ctable sw-t">
          <thead><tr><th>Stage</th><th>Where</th><th className="num">Qty</th><th className="hide-s">Details</th><th className="hide-s">Since</th></tr></thead>
          <tbody>{d.rows.map((r, i) => <FragmentRow key={i} r={r} first={i === 0 || d.rows[i - 1].sec !== r.sec} />)}</tbody>
        </table></div>}
        {d.last.n > 0 && <p className="muted small sw-foot">Archived: {d.last.n} pallet{d.last.n === 1 ? '' : 's'}, {n0(d.last.lbs)} lb.</p>}
      </>}
    </div>
  )
}
function FragmentRow({ r, first }: { r: Row; first: boolean }) {
  return <>
    {first && <tr className="sw-sec"><td colSpan={5}>{SEC[r.sec]}</td></tr>}
    <tr><td><span className={`sw-st s-${r.tone}`}>{r.stage}</span></td>
      <td><b>{r.where}</b>{r.sub ? <div className="sw-sub">{r.sub}</div> : null}</td>
      <td className="num"><b>{r.qty}</b>{r.qtySub ? <div className="sw-sub">{r.qtySub}</div> : null}</td>
      <td className="hide-s">{r.details}</td><td className="hide-s nowrap">{r.since}</td></tr>
  </>
}
