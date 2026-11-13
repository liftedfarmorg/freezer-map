import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

// FB-0024 (Mavrik): merge this strain into another one (module Admins; Aziz 11/12, may be temporary).
// Check shows what moves (dry run, changes nothing). Merge moves live records (inventory, reserves, open orders, plantings,
// harvests, nursery, plan) to the kept strain; history (invoices, closed orders, yield history, logs, METRC copies) keeps
// the old name, which becomes one of the kept strain's Other names. The old strain is retired, not deleted. Nothing in METRC.

type Res = { dry_run: boolean; from: string; into: string; counts: Record<string, number | string | Record<string, number>>; profile?: number }
const LABEL: Record<string, string> = {
  pallets: 'pallets / packages', reserves: 'reserves', reserve_requests: 'reserve requests', order_lines: 'lines on open orders',
  cult_plan: 'plan rows', cult_demand: 'demand rows', cult_nursery_orders: 'nursery deliveries', cult_receipts: 'clone receipts',
  cult_plantings: 'plantings', cult_harvests: 'harvests', cult_flower_picks: 'flower picks', nursery_mothers: 'mothers',
  nursery_batches: 'cutting batches', nursery_plantings: 'nursery plantings', nursery_strain_plan: 'nursery plan rows', nursery_tests: 'nursery tests',
  breed_receivers: 'breeding receivers', 'breed_runs.donor_strain': 'breeding runs (donor)', 'phenos.keeper_strain': 'pheno keepers',
  'seed_lots.mother_strain': 'seed lots (mother)', 'seed_lots.father_strain': 'seed lots (father)', proc_requests: 'trim requests',
  'metrc_strain_map.app_strain': 'METRC strain map rows', profile: 'strain profile (photo, yields)',
  invoice_lines: 'invoice lines', closed_order_lines: 'lines on closed orders', items: 'items', yield_history: 'yield history rows',
}

export function StrainMerge({ sb, id, name }: { sb: SupabaseClient | null; id: number; name: string }) {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<{ id: number; name: string }[] | null>(null)
  const [into, setInto] = useState('')
  const [check, setCheck] = useState<Res | null>(null)
  const [done, setDone] = useState<Res | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!open || !sb || list) return
    sb.from('strains').select('id,name').eq('active', true).neq('id', id).order('name').then(({ data }) => setList((data ?? []) as { id: number; name: string }[]))
  }, [open, sb])
  if (!sb) return null
  const target = list?.find(s => String(s.id) === into)
  const call = async (dry: boolean) => {
    setBusy(true); setErr(null)
    const { data, error } = await sb.rpc('merge_strain', { p_from: id, p_into: Number(into), p_dry_run: dry })
    setBusy(false)
    if (error) { setErr(/merge_strain|schema cache/i.test(error.message) ? `${error.message} (run 353_merge_strain.sql in Supabase)` : error.message); return }
    if (dry) setCheck(data as Res); else { setDone(data as Res); setTimeout(() => window.location.reload(), 2500) }
  }
  const lines = (r: Res) => {
    const c = r.counts, hist = (c.history_kept ?? {}) as Record<string, number>
    const moves = Object.entries(c).filter(([k]) => k !== 'history_kept' && k !== 'profile').map(([k, v]) => `${v} ${LABEL[k] ?? k}`)
    if (r.profile || c.profile) moves.push(LABEL.profile)
    return { moves, keeps: Object.entries(hist).map(([k, v]) => `${v} ${LABEL[k] ?? k}`) }
  }
  if (!open) return <div className="row" style={{ margin: '4px 0 10px' }}>
    <button type="button" className="ghost small" onClick={() => setOpen(true)}>Merge into another strain…</button>
  </div>
  return <div className="field fsec smerge">
    <label>Merge {name} into another strain <span className="muted">(module Admins)</span></label>
    {done ? <p><b>Merged into {done.into}.</b> {lines(done).moves.join(', ') || 'Nothing live to move'}. Reloading…</p> : <>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <select value={into} onChange={e => { setInto(e.target.value); setCheck(null) }} disabled={busy} aria-label="Strain to keep">
          <option value="">{list ? 'Strain to keep…' : 'Loading…'}</option>
          {(list ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button type="button" className="ghost small" disabled={busy || !into} onClick={() => call(true)}>Check</button>
        <button type="button" className="ghost small" onClick={() => { setOpen(false); setCheck(null); setInto('') }}>Cancel</button>
      </div>
      {check && (() => { const l = lines(check); return <div className="smerge-check">
        <p><b>Moves to {check.into}:</b> {l.moves.length ? l.moves.join(', ') : 'nothing live'}.</p>
        {l.keeps.length > 0 && <p className="muted small">Stays under {check.from} (history): {l.keeps.join(', ')}. It still adds up under {check.into} through Other names.</p>}
        <p className="muted small">{check.from} becomes an Other name on {check.into}; {check.from} is retired as "{check.from} [merged into {check.into}]". METRC isn't changed.</p>
        <button type="button" className="primary small" disabled={busy} onClick={() => call(false)}>Merge into {target?.name ?? check.into}</button>
      </div> })()}
      {err && <p className="warn-t">{err}</p>}
    </>}
  </div>
}
