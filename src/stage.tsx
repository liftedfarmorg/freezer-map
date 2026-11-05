// Stage at OHR (SQL 197): OHR can't receive GVR product in METRC, so GVR pallets for a customer order go to OHR in the app
// only, and the METRC manifest runs from GVR straight to the customer. Made at staging with the staging driver and truck,
// updated to the load's driver, truck and times at Depart. Staged pallets that aren't going anywhere get a red alert.
import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Select } from './combo'
import { metrcRun, openMetrcManifest } from './metrcCall'
import type { Customer, FOrder, Load, LoadDriver, LoadStop, Vehicle } from './types'

export interface Stage {
  id: number; pallet_id: number; code: string; customer: string | null; order_id: number | null; so: string | null
  load_id: number | null; load: string | null; load_status: string | null; ship_date: string; stage_driver: string | null
  license: string; manifest: string | null; other_load: { load_id: number; load: string } | null; problem: string | null
}
interface StageResult { ok: boolean; error?: string | null; load?: string; staged?: number; manifests?: { manifest: string | null; license: string }[]; live?: boolean }

const fmt = (s: string | null) => s ? new Date(s + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return ymd(d) }

/** whether staging is on, and what's staged now (with problems) */
export function useStages(sb: SupabaseClient | null) {
  const [on, setOn] = useState(false)
  const [stages, setStages] = useState<Stage[]>([])
  const refresh = useCallback(async () => {
    if (!sb) return
    const { data, error } = await sb.rpc('gvr_stage_list')
    if (error) { setOn(false); setStages([]); return }   // 197 not run yet
    const d = data as { on: boolean; stages: Stage[] }
    setOn(!!d?.on); setStages(d?.stages ?? [])
  }, [sb])
  useEffect(() => { refresh() }, [refresh])
  return { on, stages, refresh }
}

async function act(sb: SupabaseClient, body: object, flash: (t: string, bad?: boolean) => void, ok: (r: StageResult) => string) {
  const r = await metrcRun<StageResult>(sb, body)
  if (r.ok === false || r.error) { flash(r.error ?? 'METRC didn\'t take it', true); return r }
  flash(`${ok(r)}${r.live === false ? ' (METRC dry run: nothing sent)' : ''}`)
  return r
}

/** red alerts for staged pallets that aren't going anywhere, and the list of what's staged (with the manifest) */
export function StageAlerts({ sb, stages, refresh, flash, openLoad, onlyProblems, orderId, onChanged }: {
  sb: SupabaseClient | null; stages: Stage[]; refresh: () => Promise<void>; flash: (t: string, bad?: boolean) => void
  openLoad?: (id: number) => void; onlyProblems?: boolean; orderId?: number; onChanged?: () => Promise<void> | void
}) {
  const [busy, setBusy] = useState(false)
  const mine = orderId != null ? stages.filter(s => s.order_id === orderId) : stages
  const bad = mine.filter(s => s.problem)
  const fine = onlyProblems ? [] : mine.filter(s => !s.problem)
  if (!sb || (!bad.length && !fine.length)) return null
  const run = async (body: object, ok: (r: StageResult) => string) => {
    setBusy(true)
    try { await act(sb, body, flash, ok); await refresh(); await onChanged?.() } catch (e) { flash(String((e as Error).message ?? e), true) } finally { setBusy(false) }
  }
  const pdf = (s: Stage) => openMetrcManifest(sb, s.license, s.manifest!).catch(e => flash(String((e as Error).message ?? e), true))
  const row = (s: Stage) => (
    <div key={s.id} className="drow">
      <span className="grow"><b>{s.code}</b> <span className="muted">{s.customer}{s.so ? ` · ${s.so}` : ''}{s.load ? ` · ${s.load}` : ''} · ships {fmt(s.ship_date)}{s.manifest ? ` · manifest ${s.manifest}` : ''}</span>
        {s.problem && <><br /><span className="bad-t">{s.problem}</span></>}</span>
      {s.manifest && <button className="ghost small" onClick={() => pdf(s)}>Manifest PDF</button>}
      {s.load_id != null && openLoad && <button className="ghost small" onClick={() => openLoad(s.load_id!)}>Open load</button>}
      {s.other_load && <button className="ghost small" disabled={busy} onClick={() => run({ action: 'stage_relink', stage_id: s.id }, r => `${s.code} now ships on ${r.load ?? s.other_load!.load}`)}>Use {s.other_load.load}</button>}
      <button className={`${s.problem ? 'primary' : 'ghost'} small`} disabled={busy} onClick={() => {
        if (window.confirm(`Move ${s.code} back to GVR? Its METRC manifest is voided (or updated, if other staged pallets stay on it). Bring it back to GVR today.`))
          run({ action: 'unstage', stage_id: s.id }, () => `${s.code} is back at GVR in the app. Bring it back.`)
      }}>Move back to GVR</button>
    </div>
  )
  return (
    <section className="dcard stagebox">
      {bad.length > 0 && <div className="stagebad">
        <b>GVR product at OHR with nowhere to go ({bad.length})</b>
        <div className="small-note">These are on a live METRC manifest from GVR, sitting at OHR. Put each on a load to its customer, or move it back to GVR today.</div>
      </div>}
      <div className="dlist">{bad.map(row)}</div>
      {fine.length > 0 && <>
        <div className="muted small-note">Staged at OHR (GVR license, manifest straight to the customer){orderId != null ? '' : ` · ${fine.length}`}</div>
        <div className="dlist">{fine.map(row)}</div>
      </>}
    </section>
  )
}

/** Stage at OHR on an order: truck, driver, ship date and the load */
export function StageForm({ sb, o, gvr, loads, stops, customers, vehicles, drivers, busy, setBusy, close, flash, done }: {
  sb: SupabaseClient; o: FOrder; gvr: number; loads: Load[]; stops: LoadStop[]; customers: Customer[]; vehicles: Vehicle[]; drivers: LoadDriver[]
  busy: boolean; setBusy: (b: boolean) => void; close: () => void; flash: (t: string, bad?: boolean) => void; done: () => Promise<void>
}) {
  const vs = vehicles.filter(v => v.active && v.kind !== 'Customer pickup').sort((a, b) => Number(a.carrier_id != null) - Number(b.carrier_id != null) || a.name.localeCompare(b.name))
  const ds = drivers.filter(d => d.active).sort((a, b) => Number(a.carrier_id != null) - Number(b.carrier_id != null) || a.name.localeCompare(b.name))
  const [v, setV] = useState<number | null>(vs[0]?.id ?? null)
  const [driver, setDriver] = useState('')
  const [date, setDate] = useState(o.wanted_date && o.wanted_date > ymd(new Date()) ? o.wanted_date : tomorrow())
  // the load: the order's own if it's on one; else the open one to this customer on that date (or one you pick), else a new draft
  const hasCust = (l: Load) => stops.some(s => s.load_id === l.id && s.customer_id === o.customer_id && s.status === 'pending')
  const open = loads.filter(l => (l.status === 'planning' || l.status === 'loading') && hasCust(l)).sort((a, b) => a.load_date.localeCompare(b.load_date))
  const auto = open.find(l => l.load_date === date) ?? null
  const [pick, setPick] = useState<number | 'auto'>('auto')
  const chosen = o.stop ? null : pick === 'auto' ? auto : open.find(l => l.id === pick) ?? null
  const cust = customers.find(c => c.id === o.customer_id)
  const go = async () => {
    setBusy(true)
    try {
      const r = await act(sb, { action: 'stage', order_id: o.id, vehicle_id: v, driver: driver.trim(), ship_date: date, load_id: o.stop ? null : chosen?.id ?? null },
        flash, r => `${r.staged} pallet${r.staged === 1 ? '' : 's'} staged on ${r.load}. METRC manifest ${r.manifests?.find(m => m.manifest)?.manifest ?? ''} from GVR to ${o.customer}: open it from Staged at OHR.`)
      if (r.ok !== false && !r.error) { await done(); close() }
    } catch (e) { flash(String((e as Error).message ?? e), true) } finally { setBusy(false) }
  }
  return (
    <div className="dlist stageform">
      <div className="row between"><b>Stage at OHR ({gvr} pallet{gvr === 1 ? '' : 's'} at GVR)</b><button className="ghost small" onClick={close}>Cancel</button></div>
      <p className="muted small-note">OHR can't receive GVR product in METRC. The pallets move to OHR in the app only, and the METRC manifest goes from GVR straight to {o.customer}{cust?.license ? ` (${cust.license})` : ''}, made now with this driver and truck so they have it before leaving GVR. When the load departs, the manifest is updated to the load's driver, truck and times.</p>
      <div className="field"><label>Truck taking it to OHR</label>
        <Select value={v ?? ''} onChange={e => setV(Number(e.target.value))}>{vs.map(x => <option key={x.id} value={x.id}>{x.name}{x.plate ? ` · ${x.plate}` : ''}{x.carrier_id != null ? ` · ${x.owner ?? 'outside'}` : ''}</option>)}</Select></div>
      <div className="field"><label>Driver</label>
        <input list="stage-drivers" value={driver} onChange={e => setDriver(e.target.value)} placeholder="Pick a driver" />
        <datalist id="stage-drivers">{ds.map(d => <option key={d.id} value={d.name} />)}</datalist></div>
      {o.stop
        ? <div className="okbox">Ships on <b>{o.stop.load}</b> ({fmt(o.stop.load_date)}), the load this order is already on.</div>
        : <>
          <div className="field"><label>Ship date (on the manifest)</label><input type="date" value={date} min={ymd(new Date())} onChange={e => setDate(e.target.value)} /></div>
          <div className="field"><label>Load</label>
            <Select value={String(pick)} onChange={e => setPick(e.target.value === 'auto' ? 'auto' : Number(e.target.value))}>
              <option value="auto">{auto ? `${auto.code} (${fmt(auto.load_date)}, already going to ${o.customer})` : `New draft load to ${o.customer} on ${fmt(date)}`}</option>
              {open.filter(l => l.id !== auto?.id).map(l => <option key={l.id} value={l.id}>{l.code} ({fmt(l.load_date)})</option>)}
            </Select></div>
          {chosen && chosen.load_date !== date && <p className="warn-t small-note">{chosen.code} is on {fmt(chosen.load_date)}: that's the ship date that goes on the manifest.</p>}
        </>}
      <div className="row end"><button className="primary" disabled={busy || v == null || !driver.trim()} onClick={go}>Stage and make the METRC manifest</button></div>
    </div>
  )
}

/** the red alerts on their own (Transit / loads list) */
export function StageAlertsAuto({ sb, flash, openLoad, onChanged }: { sb: SupabaseClient | null; flash: (t: string, bad?: boolean) => void; openLoad?: (id: number) => void; onChanged?: () => Promise<void> | void }) {
  const st = useStages(sb)
  return <StageAlerts sb={sb} stages={st.stages} refresh={st.refresh} flash={flash} openLoad={openLoad} onlyProblems onChanged={onChanged} />
}
