import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { metrcRun } from './metrcCall'

// Distribution > Inbound: METRC transfers coming in to our licenses (from OHR / GVR, processors, nurseries, outside sellers).
// Receive takes the delivery in METRC (Live; a dry-run check otherwise) and brings the packages into the app: ones the app
// knows come back into inventory at the site (Needs a spot), new ones are added and flagged to check strain and product.

interface Item { id: number; tag: string; item: string | null; strain: string | null; qty: number; uom: string; state: string | null
  app?: { id: number; code: string; status: string; lbs: number | null; site: string | null }
  return?: { return_id: number; rma: string; how: string } }
interface Delivery { license: string; site: string; transfer_id?: number; delivery_id?: number; manifest?: string; from_license?: string; from?: string; type?: string
  departed?: string; arrival?: string; driver?: string; vehicle?: string; packages?: number; items?: Item[]; error?: string
  return?: { id: number; rma: string; customer: string; sure: boolean } }

const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '')
const STATUS: Record<string, string> = { in_transit: 'on a load', at_processor: 'at processor', shipped: 'shipped', unslotted: 'needs a spot', in_freezer: 'in a freezer', depleted: 'used up', merged: 'merged', archived: 'archived' }

export function InboundView({ sb, flash, onChanged }: { sb: SupabaseClient | null; flash: (m: string, bad?: boolean) => void; onChanged: () => void }) {
  const module = 'distribution'
  const [rows, setRows] = useState<Delivery[] | null>(null)
  const [live, setLive] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  // returns (159): which return a delivery is received against (0 = not a return)
  const [retFor, setRetFor] = useState<Record<string, number>>({})
  const retOf = (d: Delivery) => retFor[`${d.license}${d.delivery_id}`] ?? (d.return?.id ?? 0)
  const load = async () => {
    if (!sb) return
    setBusy('Asking METRC…')
    try { const r = await metrcRun<{ live: boolean; deliveries: Delivery[] }>(sb, { action: 'incoming', module }); setRows(r.deliveries); setLive(r.live) }
    catch (e) { flash(e instanceof Error ? e.message : String(e), true); setRows([]) } finally { setBusy(null) }
  }
  useEffect(() => { load() }, [])
  async function receive(d: Delivery) {
    if (!sb || !d.delivery_id) return
    const rid = retOf(d)
    if (!confirm(live ? `Receive manifest ${d.manifest} from ${d.from} in METRC (${d.items?.length ?? d.packages} packages) and bring it into the app?${rid && d.return ? `\n\nAs return ${d.return.rma}: the packages go back into inventory as returned and a credit memo is made for ${d.return.customer}.` : ''}`
      : `Dry run: check that METRC would take manifest ${d.manifest}? (Nothing changes until Compliance goes Live.)`)) return
    setBusy(`Receiving ${d.manifest}…`)
    try {
      const r = await metrcRun<{ ok: boolean; info: string }>(sb, { action: 'inbound_receive', license: d.license, delivery_id: d.delivery_id, module, ...(rid ? { return_id: rid } : {}) })
      flash(r.info, !r.ok)
      if (live && r.ok) { onChanged(); await load() }
    } catch (e) { flash(e instanceof Error ? e.message : String(e), true) } finally { setBusy(null) }
  }
  const ok = (rows ?? []).filter(d => !d.error)
  const errs = (rows ?? []).filter(d => d.error)
  return <div className="list">
    <ComingBack sb={sb} flash={flash} onChanged={onChanged} />
    <div className="row between wrap toolbar"><h2>Inbound</h2>
      <div className="row"><span className={`pill ${live ? 'm-bad' : 'm-warn'}`}>{live ? 'METRC Live' : 'Dry run'}</span>
        <button className="ghost small" disabled={!!busy} onClick={load}>{busy ?? 'Refresh'}</button></div></div>
    <p className="muted">Product packages on their way to OHR and GVR (plants go to Production › Receiving, anything for 1PN to Nursery › Receiving). Receive takes the whole delivery in METRC{live ? '' : ' (a dry-run check until Compliance goes Live)'} and brings its packages into the app (Needs a spot).</p>
    {errs.map(d => <p key={d.license} className="neg small">{d.site} {d.license}: {d.error}</p>)}
    {rows && !ok.length && !busy && <p className="muted">Nothing incoming.</p>}
    {ok.map(d => {
      const known = (d.items ?? []).filter(i => i.app).length
      return <div key={`${d.license}${d.delivery_id}`} className="card">
        <div className="row between wrap">
          <div><b>{d.manifest}</b> <span className="muted">from</span> <b>{d.from}</b> <span className="muted small">{d.from_license}</span>
            <div className="muted small">to {d.site} {d.license} · {d.type ?? ''} · left {when(d.departed)}{d.arrival ? ` · due ${when(d.arrival)}` : ''}{d.driver ? ` · ${d.driver}` : ''}{d.vehicle ? ` · ${d.vehicle}` : ''}</div>
            <div className="small">{d.items?.length ?? d.packages} packages{known ? ` · ${known} the app knows` : ''}</div>
            {d.return && <div className="row small" style={{ gap: 6, marginTop: 4 }}><span className="pill m-warn">Return {d.return.rma}</span>
              <span className="muted">{d.return.customer}{d.return.sure ? ' · our tags' : ' · from their license'}</span>
              <select value={retOf(d)} onChange={e => setRetFor(m => ({ ...m, [`${d.license}${d.delivery_id}`]: Number(e.target.value) }))}>
                <option value={d.return.id}>Receive as {d.return.rma}</option><option value={0}>Not a return</option></select></div>}</div>
          <div className="row">
            <button className="ghost small" onClick={() => setOpen(o => o === d.delivery_id ? null : d.delivery_id ?? null)}>{open === d.delivery_id ? 'Hide' : 'Packages'}</button>
            <button className="primary small" disabled={!!busy} onClick={() => receive(d)}>{live ? 'Receive' : 'Check'}</button>
          </div>
        </div>
        {open === d.delivery_id && <div className="tablewrap"><table className="ct"><thead><tr><th>Tag</th><th>Item</th><th>Qty</th><th>In the app</th></tr></thead>
          <tbody>{(d.items ?? []).map(i => <tr key={i.tag}><td className="mono small">{i.tag}</td><td>{i.item}</td><td>{i.qty} {i.uom}</td>
            <td className="small">{i.return && <span className="pill m-warn">{i.return.rma}</span>} {i.app ? <>{i.app.code} <span className="muted">({STATUS[i.app.status] ?? i.app.status})</span></> : /^(lb|lbs)/i.test(i.uom) ? <span className="muted">new: added on receive</span> : <span className="muted">plant package (METRC only)</span>}</td></tr>)}</tbody></table></div>}
      </div>
    })}
  </div>
}

// 215: packages coming back on our own trucks (rejected or not delivered). Receive back = into Needs a spot (Staging) at the farm.
// Nothing goes to METRC from here: Rama voids the manifest (not delivered) or checks the customer's rejection (alert in Transit).
interface Back { id: number; stop_id: number; load_id: number; load: string; load_status: string; seq: number; customer: string; outcome: string; outcome_reason: string | null; outcome_at: string | null
  manifest: string | null; kind: 'rejected' | 'not_delivered'; reason: string | null; note: string | null; pallet_id: number; code: string; tag: string | null; strain: string | null; lbs: number | null
  item: string | null; from_site: string | null; staged: boolean }
function ComingBack({ sb, flash, onChanged }: { sb: SupabaseClient | null; flash: (m: string, bad?: boolean) => void; onChanged: () => void }) {
  const [rows, setRows] = useState<Back[]>([])
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [site, setSite] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const load = async () => {
    if (!sb) return
    const { data, error } = await sb.rpc('returns_coming_back')
    if (!error) setRows((data ?? []) as Back[])
  }
  useEffect(() => {
    load()
    if (!sb) return
    const ch = sb.channel('comingback').on('postgres_changes', { event: '*', schema: 'public', table: 'stop_returns' }, () => load()).subscribe()
    return () => { sb.removeChannel(ch) }
  }, [sb])
  if (!rows.length) return null
  const loads = [...new Map(rows.map(r => [r.load_id, r])).values()]
  async function receive(loadId: number) {
    const mine = rows.filter(r => r.load_id === loadId)
    const ids = mine.filter(r => sel.has(r.id)).map(r => r.id)
    const use = ids.length ? ids : mine.map(r => r.id)
    const st = site[loadId] ?? mine[0]?.from_site ?? 'GVR'
    if (!sb || !confirm(`Receive ${use.length} package${use.length === 1 ? '' : 's'} back at ${st}? They go to Needs a spot (Staging) like any received pallet. Nothing is sent to METRC.`)) return
    setBusy(true)
    try {
      const { data, error } = await sb.rpc('receive_returns', { p_ids: use, p_site: st })
      if (error) throw new Error(error.message)
      const r = data as { received: number; restaged: number; ready?: number }
      flash(`${r.received} received back at ${st}${r.ready ? `. ${r.ready} rescheduled order${r.ready === 1 ? ' is' : 's are'} back to Ready in Fulfillment` : ''}${r.restaged ? `. ${r.restaged} GVR pallet${r.restaged === 1 ? ' is' : 's are'} staged at OHR again: Move back to GVR or put on a load (Fulfillment)` : ''}`)
      setSel(new Set()); onChanged(); await load()
    } catch (e) { flash(e instanceof Error ? e.message : String(e), true) } finally { setBusy(false) }
  }
  return <div className="card" style={{ borderColor: 'var(--warn)' }}>
    <h3>↩ Coming back on our trucks</h3>
    <p className="muted small">Rejected or not delivered at the stop. Receive them when the truck is back; they land in Needs a spot. Tick some to receive only those.</p>
    {loads.map(l => {
      const mine = rows.filter(r => r.load_id === l.load_id)
      return <div key={l.load_id} className="dcard">
        <div className="row between wrap"><b>{l.load}</b>
          <span className="row" style={{ gap: 6 }}>
            <select value={site[l.load_id] ?? l.from_site ?? 'GVR'} onChange={e => setSite(x => ({ ...x, [l.load_id]: e.target.value }))}>{['GVR', 'OHR'].map(x => <option key={x} value={x}>at {x}</option>)}</select>
            <button className="primary small" disabled={busy} onClick={() => receive(l.load_id)}>Receive back{mine.some(r => sel.has(r.id)) ? ` (${mine.filter(r => sel.has(r.id)).length})` : ''}</button></span></div>
        {mine.map(r => <label key={r.id} className="row small" style={{ gap: 6, padding: '3px 0' }}>
          <input type="checkbox" checked={sel.has(r.id)} onChange={() => setSel(x => { const n = new Set(x); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n })} />
          <span><b>{r.code}</b> {r.item ?? r.strain} <span className="mono">{r.tag}</span> · {Number(r.lbs ?? 0).toLocaleString()} lbs · stop {r.seq} {r.customer}:{' '}
            <span className="warn-t">{r.kind === 'rejected' ? `rejected${r.reason ? ` (${r.reason.replace('_', ' ')})` : ''}` : `not delivered${r.outcome_reason ? ` (${r.outcome_reason.replace('_', ' ')})` : ''}`}</span>
            {r.note ? ` · "${r.note}"` : ''}{r.staged ? ' · GVR pallet staged at OHR' : ''}</span></label>)}
      </div>
    })}
  </div>
}
