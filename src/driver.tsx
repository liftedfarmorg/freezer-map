import { useCallback, useEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Scanner } from './scan'
import { sameTag } from './scanroute'
import { openMetrcManifest } from './metrcCall'
import { LANGS, lang, setLang, t } from './i18n'
import type { Lang } from './i18n'
import { kickNotify, pushOn, pushState } from './push'
import type { PushState } from './push'
import { NotifyBox } from './notifyprefs'
import type { NotifyPrefs } from './notifyprefs'

// Driver portal (215, Msg #239/#242): drivers record what happened at each stop.
//  * DriverHome: a signed-in driver's loads (driver-only logins land here; app users who drive open it from the Driver button)
//  * DriverLinkPage: an outside carrier's driver, from a one-load link (/?drive=<token>), no login
//  * StopOutcomeSheet: the outcome form, also used by the office in Distribution > Transit
// Outcomes are kept on the phone until they're sent (no signal in freezers and on some routes).

export interface DPkg { id: number; top_id: number; code: string; tag: string | null; item: string | null; strain: string | null; lbs: number | null; license: string | null; back: boolean; reason: string | null; note: string | null }
export interface DStop { id: number; seq: number; customer: string; site: string | null; address: string | null; contact: string | null; phone: string | null; manifest: string | null
  status: 'pending' | 'delivered' | 'not_delivered'; outcome: Outcome | null; outcome_reason: string | null; outcome_note: string | null; receiver_name: string | null
  outcome_at: string | null; outcome_by: string | null; outcome_via: string | null; has_photo: boolean; back_started: boolean; packages: DPkg[]; pallets: number }
export interface DLoad { id: number; code: string; status: string; load_date: string; depart_planned: string | null; departed_at: string | null; driver: string | null; notes: string | null
  vehicle: string | null; stops: DStop[]; coming_back: number; back_to: string | null; link_driver?: string | null; carrier?: string | null; driving_for?: string | null }
export type Outcome = 'delivered' | 'partly_rejected' | 'fully_rejected' | 'not_delivered' | 'dropped_off'
export type DMode = { kind: 'auth'; sb: SupabaseClient } | { kind: 'link'; sb: SupabaseClient; token: string }

export const OUTCOME_LABEL: Record<Outcome, string> = { delivered: 'Delivered', partly_rejected: 'Partly rejected', fully_rejected: 'Fully rejected', not_delivered: 'Not delivered', dropped_off: 'Dropped off' }
export const REJECT_REASONS: [string, string][] = [['quality', 'Quality'], ['wrong_strain', 'Wrong strain'], ['damaged', 'Damaged'], ['overshipped', 'Overshipped'], ['other', 'Other']]
export const NOT_DELIVERED: [string, string][] = [['cancelled', 'Customer cancelled'], ['rescheduled', 'Customer rescheduled'], ['couldnt_deliver', "Couldn't deliver"]]
const reasonLabel = (r: string | null) => [...REJECT_REASONS, ...NOT_DELIVERED].find(x => x[0] === r)?.[1] ?? r ?? ''
export const outcomeText = (s: Pick<DStop, 'outcome' | 'outcome_reason'>) =>
  !s.outcome ? '' : s.outcome === 'not_delivered' || s.outcome === 'fully_rejected' ? `${t(OUTCOME_LABEL[s.outcome])}: ${t(reasonLabel(s.outcome_reason))}` : t(OUTCOME_LABEL[s.outcome])
const STATUS_L: Record<string, string> = { planning: 'Planning', loading: 'Loading', departing: 'Departing', in_transit: 'On the road', delivered: 'Done', cancelled: 'Cancelled' }
const when = (iso: string | null) => iso ? new Date(iso).toLocaleString(lang() === 'es' ? 'es-US' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(lang() === 'es' ? 'es-US' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const n0 = (n: number | null | undefined) => Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
const uuid = () => (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16) })

// ---------- the phone's outbox ----------
interface Queued { client: string; stop: number; load: number; p: Record<string, unknown>; kind: 'auth' | 'link'; token?: string; at: string; label: string; error?: string }
const QKEY = 'fm.driverq'
function readQ(): Queued[] { try { return JSON.parse(localStorage.getItem(QKEY) ?? '[]') as Queued[] } catch { return [] } }
function writeQ(q: Queued[]) { try { localStorage.setItem(QKEY, JSON.stringify(q)) } catch { /* full or private: the send below still runs */ } }
const offline = (m: string) => !navigator.onLine || /failed to fetch|network|load failed|fetch failed|timed? ?out|NetworkError/i.test(m)
let flushing = false
/** send what's waiting; returns errors the server gave (those are taken off the phone and shown) */
export async function flushQueue(sb: SupabaseClient): Promise<string[]> {
  if (flushing) return []
  flushing = true
  const errs: string[] = []
  try {
    for (const q of readQ()) {
      if (q.error) continue
      const { error } = q.kind === 'link'
        ? await sb.rpc('driver_link_outcome', { p_token: q.token, p_stop: q.stop, p: { ...q.p, client: q.client } })
        : await sb.rpc('record_stop_outcome', { p_stop: q.stop, p: { ...q.p, client: q.client } })
      if (error && offline(error.message)) break
      const rest = readQ().filter(x => x.client !== q.client)
      if (error) { errs.push(`${q.label}: ${error.message}`); rest.push({ ...q, error: error.message }) }
      writeQ(rest)
    }
  } finally { flushing = false }
  return errs
}
function useQueue(sb: SupabaseClient, onSent: () => void) {
  const [q, setQ] = useState<Queued[]>(readQ)
  const [errs, setErrs] = useState<string[]>([])
  const flush = useCallback(async () => {
    const before = readQ().filter(x => !x.error).length
    const e = await flushQueue(sb)
    const now = readQ()
    setQ(now)
    if (e.length) setErrs(x => [...x, ...e])
    if (now.filter(x => !x.error).length < before) { onSent(); kickNotify(sb) }
  }, [sb, onSent])
  useEffect(() => {
    flush()
    const t1 = setInterval(flush, 20000)
    window.addEventListener('online', flush)
    return () => { clearInterval(t1); window.removeEventListener('online', flush) }
  }, [flush])
  const add = async (x: Queued) => { writeQ([...readQ().filter(y => y.stop !== x.stop || y.error), x]); setQ(readQ()); await flush() }
  const dismiss = (client: string) => { writeQ(readQ().filter(x => x.client !== client)); setQ(readQ()) }
  return { q, add, errs, clearErrs: () => setErrs([]), dismiss }
}

/** shrink a photo on the phone before it's saved (and maybe kept offline) */
async function shrink(f: File, max = 1280): Promise<string> {
  const url = URL.createObjectURL(f)
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url })
    const k = Math.min(1, max / Math.max(img.width, img.height))
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.7)
  } finally { URL.revokeObjectURL(url) }
}

async function showManifest(mode: DMode, stop: DStop) {
  if (!stop.manifest) return
  if (mode.kind === 'auth') {
    const lic = stop.packages.find(p => p.license)?.license
    if (!lic) throw new Error(t('No license found for this manifest'))
    return openMetrcManifest(mode.sb, lic, stop.manifest.trim())
  }
  const w = window.open('', '_blank')
  try {
    const r = await fetch('/api/metrc/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'link_manifest_pdf', token: mode.token, stop: stop.id }) })
    const j = await r.json().catch(() => ({ error: `Error ${r.status}` }))
    if (!r.ok) throw new Error(j.error ?? `Error ${r.status}`)
    const bytes = Uint8Array.from(atob(j.base64), ch => ch.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bytes], { type: j.type || 'application/pdf' }))
    if (w) w.location.href = url; else { const a = document.createElement('a'); a.href = url; a.download = `METRC manifest ${stop.manifest}.pdf`; a.click() }
  } catch (e) { w?.close(); throw e }
}

function LangPick({ onLang }: { onLang?: (l: Lang) => void }) {
  const [, bump] = useState(0)
  return <div className="seg small">{LANGS.map(([k, l]) => <button key={k} className={lang() === k ? 'on' : ''} onClick={() => { setLang(k); onLang?.(k); bump(x => x + 1) }}>{l}</button>)}</div>
}

// =====================================================================================================
// a signed-in driver
// =====================================================================================================
export function DriverHome({ sb, name, onLang, signOut, embedded, nf: nf0 }: { sb: SupabaseClient; name?: string | null; onLang?: (l: Lang) => void; signOut?: () => void; embedded?: boolean; nf?: NotifyPrefs }) {
  const [nf, setNf] = useState<NotifyPrefs>(nf0 ?? {})
  const [nmsg, setNmsg] = useState<string | null>(null)
  const [loads, setLoads] = useState<DLoad[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [, bump] = useState(0)
  const reload = useCallback(async () => {
    const { data, error } = await sb.rpc('driver_loads')
    if (error) { if (!offline(error.message)) setErr(/Could not find the function|schema cache/i.test(error.message) ? 'Run 215_driver_portal.sql in Supabase first' : error.message); return }
    setErr(null); setLoads(((data as { loads: DLoad[] }).loads) ?? [])
    try { localStorage.setItem('fm.driverloads', JSON.stringify(data)) } catch { /* fine */ }
  }, [sb])
  useEffect(() => {
    try { const c = JSON.parse(localStorage.getItem('fm.driverloads') ?? 'null'); if (c?.loads) setLoads(c.loads) } catch { /* nothing kept */ }
    reload()
    let tm: number | undefined
    const ch = sb.channel('driver').on('postgres_changes', { event: '*', schema: 'public', table: 'loads' }, () => { clearTimeout(tm); tm = window.setTimeout(reload, 500) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'load_stops' }, () => { clearTimeout(tm); tm = window.setTimeout(reload, 500) }).subscribe()
    const iv = setInterval(reload, 60000)
    return () => { sb.removeChannel(ch); clearInterval(iv) }
  }, [sb, reload])
  const mode: DMode = { kind: 'auth', sb }
  const qu = useQueue(sb, reload)
  return <div className={`drv ${embedded ? '' : 'drv-full'}`}>
    {!embedded && <header className="drv-top"><b>{t('Lifted Farms · Driver')}</b><span className="grow" /><LangPick onLang={l => { onLang?.(l); bump(x => x + 1) }} />
      {signOut && <button className="ghost small" onClick={signOut}>{t('Sign out')}</button>}</header>}
    <div className="list">
      <div className="row between wrap"><h2>{t('My loads')}</h2>{embedded && <LangPick onLang={l => { onLang?.(l); bump(x => x + 1) }} />}</div>
      {name && <p className="muted">{t('Signed in as {u}', { u: name })}</p>}
      <QueueBox qu={qu} />
      <PushBanner sb={sb} />
      <details className="card small"><summary>{t('My notifications')}</summary>
        <NotifyBox nf={nf} only={['t_load_assigned', 't_load_left', 't_delivery']} notes={false} onSave={async x => {
          const next = { ...nf, ...x }; setNf(next)
          const { error } = await sb.rpc('set_my_notify', { p_notify: x }); setNmsg(error ? error.message : t('Saved'))
        }} />{nmsg && <span className="muted small">{nmsg}</span>}</details>
      {err && <p className="neg">{err}</p>}
      {loads === null ? <p className="muted">{t('Loading…')}</p>
        : !loads.length ? <div className="card"><p className="muted">{t('No loads for you right now. When Distribution puts you on a load as the driver, it shows here.')}</p></div>
        : loads.map(l => <LoadCard key={l.id} l={l} mode={mode} qu={qu} />)}
    </div>
  </div>
}

// =====================================================================================================
// an outside carrier's driver: one load, no login
// =====================================================================================================
export function DriverLinkPage({ sb, token }: { sb: SupabaseClient; token: string }) {
  const [l, setL] = useState<DLoad | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [, bump] = useState(0)
  const key = `fm.drivelink.${token.slice(0, 12)}`
  const reload = useCallback(async () => {
    const { data, error } = await sb.rpc('driver_link_load', { p_token: token })
    if (error) { if (!offline(error.message)) setErr(error.message); return }
    setErr(null); setL(data as DLoad)
    try { localStorage.setItem(key, JSON.stringify(data)) } catch { /* fine */ }
  }, [sb, token, key])
  useEffect(() => {
    if (!localStorage.getItem('fm.lang') && /^es/i.test(navigator.language)) setLang('es')
    try { const c = JSON.parse(localStorage.getItem(key) ?? 'null'); if (c?.id) setL(c) } catch { /* nothing kept */ }
    reload(); const iv = setInterval(reload, 60000); return () => clearInterval(iv)
  }, [reload, key])
  const mode: DMode = { kind: 'link', sb, token }
  const qu = useQueue(sb, reload)
  return <div className="drv drv-full">
    <header className="drv-top"><img className="logo-img logo-l" src="/logo-light.svg" alt="Lifted Farms" style={{ height: 26 }} /><img className="logo-img logo-d" src="/logo-dark.svg" alt="Lifted Farms" style={{ height: 26 }} />
      <span className="grow" /><LangPick onLang={() => bump(x => x + 1)} /></header>
    <div className="list">
      {l && <p className="muted">{t('Hi {n}. Record what happened at each stop. Open this link again any time to come back.', { n: l.link_driver ?? '' })}</p>}
      <QueueBox qu={qu} />
      {err && <div className="warnbox">{t(err)}</div>}
      {!l && !err && <p className="muted">{t('Loading…')}</p>}
      {l && <LoadCard l={l} mode={mode} qu={qu} open />}
    </div>
  </div>
}

function QueueBox({ qu }: { qu: ReturnType<typeof useQueue> }) {
  const waiting = qu.q.filter(x => !x.error), failed = qu.q.filter(x => x.error)
  return <>
    {waiting.length > 0 && <div className="warnbox">📶 {t('Saved on phone, not sent yet: {n}. It sends by itself when there is signal.', { n: waiting.map(x => x.label).join(', ') })}</div>}
    {failed.map(x => <div key={x.client} className="warnbox neg">{t("Couldn't save {s}: {e}", { s: x.label, e: x.error ?? '' })} <button className="ghost small" onClick={() => qu.dismiss(x.client)}>{t('OK')}</button></div>)}
  </>
}

function LoadCard({ l, mode, qu, open: open0 }: { l: DLoad; mode: DMode; qu: ReturnType<typeof useQueue>; open?: boolean }) {
  const [open, setOpen] = useState(open0 ?? l.status === 'in_transit')
  const [stop, setStop] = useState<DStop | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const left = l.status === 'in_transit' || l.status === 'delivered'
  const queuedFor = (s: DStop) => qu.q.find(x => x.stop === s.id && !x.error)
  const done = l.stops.filter(s => s.outcome || s.status !== 'pending' || queuedFor(s)).length
  return <div className="card drv-load">
    <button className="drv-loadhead" onClick={() => setOpen(o => !o)}>
      <div><b>{l.code}</b> <span className={`pill s-${l.status}`}>{t(STATUS_L[l.status] ?? l.status)}</span>{l.driving_for && <span className="pill">{l.driving_for}</span>}
        <div className="muted small">{day(l.load_date)}{l.vehicle ? ` · ${l.vehicle}` : ''}{l.departed_at ? ` · ${t('left {d}', { d: when(l.departed_at) })}` : l.depart_planned ? ` · ${t('leaves {d}', { d: when(l.depart_planned) })}` : ''}</div></div>
      <span className="muted">{t('{a} of {b} stops', { a: done, b: l.stops.length })} {open ? '▾' : '▸'}</span>
    </button>
    {open && <>
      {l.driving_for && <div className="infobox">🚚 {t('Driving for {c}', { c: l.driving_for })}</div>}
      {l.notes && <p className="muted small">{l.notes}</p>}
      {!left && <div className="infobox">{t('Waiting for Distribution to depart this load. You can look at the stops; outcomes open once it leaves.')}</div>}
      {msg && <p className="neg small">{msg}</p>}
      {l.stops.map(s => {
        const qd = queuedFor(s)
        const back = s.packages.filter(p => p.back).length
        return <div key={s.id} className={`drv-stop ${s.outcome || s.status !== 'pending' ? 'done' : ''}`}>
          <div className="row between wrap"><div><span className="stopnum">{s.seq}</span> <b>{s.customer}</b></div>
            {qd ? <span className="pill s-departing">📶 {t('Not sent yet')}</span>
              : s.outcome ? <span className={`pill ${s.outcome === 'delivered' || s.outcome === 'dropped_off' ? 's-delivered' : 's-back'}`}>{outcomeText(s)}</span>
              : s.status === 'delivered' ? <span className="pill s-delivered">{t(s.site ? 'Dropped off' : 'Delivered')}</span> : null}</div>
          {s.address && <div className="small"><a href={`https://maps.google.com/?q=${encodeURIComponent(s.address)}`} target="_blank" rel="noreferrer">📍 {s.address}</a></div>}
          {(s.contact || s.phone) && <div className="small">{s.contact && <span>{s.contact} </span>}{s.phone && <a href={`tel:${s.phone.replace(/[^\d+]/g, '')}`}>📞 {s.phone}</a>}</div>}
          <div className="muted small">{s.manifest ? <>{t('Manifest')} <b>{s.manifest}</b> · </> : ''}{t('{n} pallets', { n: s.pallets })} · {t('{n} packages', { n: s.packages.length })} · {n0(s.packages.reduce((a, p) => a + Number(p.lbs ?? 0), 0))} lbs</div>
          {s.receiver_name && <div className="muted small">{t('Received by {n}', { n: s.receiver_name })}{back ? ` · ${t('{n} coming back', { n: back })}` : ''}</div>}
          <details className="small"><summary>{t('Packages')}</summary>
            {s.packages.map(p => <div key={p.id} className={`drv-pkg ${p.back ? 'neg' : ''}`}><b>{p.item ?? p.strain}</b> <span className="mono">{p.tag}</span> · {n0(p.lbs)} lbs{p.back ? ` · ${t('coming back')}${p.reason ? ` (${t(reasonLabel(p.reason))})` : ''}` : ''}</div>)}
          </details>
          <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
            {s.manifest && /^\d{6,}$/.test(s.manifest.trim()) && left && <button className="ghost small" onClick={() => showManifest(mode, s).catch(e => setMsg((e as Error).message))}>{t('Show manifest')}</button>}
            {left && !qd && !s.outcome && s.status === 'pending' && <button className="primary" onClick={() => setStop(s)}>{t('What happened here?')}</button>}
          </div>
        </div>
      })}
      {l.coming_back > 0 && <div className="warnbox">↩ {t('{n} packages coming back to {f}. The crew receives them in Distribution › Inbound.', { n: l.coming_back, f: l.back_to ?? t('the farm') })}</div>}
    </>}
    {stop && <StopOutcomeSheet stop={stop} load={l.code} mode={mode} onClose={() => setStop(null)}
      onSave={async p => { await qu.add({ client: uuid(), stop: stop.id, load: l.id, p, kind: mode.kind, token: mode.kind === 'link' ? mode.token : undefined, at: new Date().toISOString(), label: `${l.code} ${t('stop')} ${stop.seq}` }); setStop(null) }} />}
  </div>
}

// =====================================================================================================
// the outcome form (driver, carrier link, office)
// =====================================================================================================
export function StopOutcomeSheet({ stop, load, office, onClose, onSave }: { stop: DStop; load: string; mode?: DMode; office?: boolean; onClose: () => void
  onSave: (p: Record<string, unknown>) => Promise<void> }) {
  const site = !!stop.site
  const [o, setO] = useState<Outcome | null>(office && stop.outcome ? stop.outcome : null)
  const [why, setWhy] = useState(stop.outcome_reason ?? '')
  const [note, setNote] = useState(stop.outcome_note ?? '')
  const [rcv, setRcv] = useState(stop.receiver_name ?? '')
  const [rej, setRej] = useState<Record<number, { reason: string; note: string }>>(() => Object.fromEntries(stop.packages.filter(p => p.back).map(p => [p.id, { reason: p.reason ?? '', note: p.note ?? '' }])))
  const [photo, setPhoto] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [scan, setScan] = useState(false)
  const [sure, setSure] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const choices: Outcome[] = site ? ['dropped_off', 'not_delivered'] : ['delivered', 'partly_rejected', 'fully_rejected', 'not_delivered']
  const nRej = Object.keys(rej).length
  const problem = !o ? t('Pick what happened')
    : o !== 'not_delivered' && !rcv.trim() ? t('Enter the name of the person who received it')
    : o === 'not_delivered' && !why ? t('Pick why it wasn\'t delivered')
    : o === 'not_delivered' && why === 'couldnt_deliver' && !note.trim() ? t('Add a note: what happened?')
    : o === 'fully_rejected' && !why ? t('Pick why they rejected it')
    : o === 'partly_rejected' && !nRej ? t('Tap the rejected packages')
    : o === 'partly_rejected' && nRej === stop.packages.length ? t('Every package was rejected: choose Fully rejected')
    : o === 'partly_rejected' && Object.values(rej).some(r => !r.reason) ? t('Pick a reason for each rejected package') : null
  const toggle = (id: number) => setRej(r => { const n = { ...r }; if (n[id]) delete n[id]; else n[id] = { reason: '', note: '' }; return n })
  const onScan = (tag: string) => {
    setScan(false)
    const p = stop.packages.find(x => x.tag && sameTag(x.tag, tag))
    if (!p) { setErr(t('That tag isn\'t on this stop: {t}', { t: tag })); return }
    setErr(null); if (!rej[p.id]) toggle(p.id)
  }
  const summary = !o ? '' : o === 'partly_rejected' ? t('{n} of {m} packages rejected and coming back on the truck. The rest stays with {c}.', { n: nRej, m: stop.packages.length, c: stop.customer })
    : o === 'fully_rejected' || o === 'not_delivered' ? t('All {m} packages come back on the truck.', { m: stop.packages.length })
    : o === 'dropped_off' ? t('{m} packages left at {c}. The crew puts them in a freezer.', { m: stop.packages.length, c: stop.customer })
    : t('All {m} packages delivered to {c}.', { m: stop.packages.length, c: stop.customer })
  async function save() {
    if (problem || !o) return
    if (!sure) { setSure(true); return }
    setBusy(true); setErr(null)
    try {
      await onSave({ outcome: o, reason: o === 'not_delivered' || o === 'fully_rejected' ? why : null, note: note.trim() || null, receiver: o === 'not_delivered' ? (rcv.trim() || null) : rcv.trim(),
        photo, rejects: o === 'partly_rejected' ? Object.entries(rej).map(([id, r]) => ({ id: Number(id), reason: r.reason, note: r.note.trim() || null })) : [] })
    } catch (e) { setErr((e as Error).message); setSure(false) } finally { setBusy(false) }
  }
  return <div className="scrim" onClick={onClose}>
    <div className="sheet drv-sheet" onClick={e => e.stopPropagation()}>
      <div className="sheet-h"><div><h2>{t('Stop {n}: {c}', { n: stop.seq, c: stop.customer })}</h2><div className="muted small">{load}{stop.manifest ? ` · ${t('Manifest')} ${stop.manifest}` : ''}</div></div>
        <button className="ghost" onClick={onClose}>✕</button></div>
      <div className="drv-choices">{choices.map(c => <button key={c} className={`drv-choice c-${c} ${o === c ? 'on' : ''}`} onClick={() => { setO(c); setSure(false); if (c !== o) setWhy('') }}>{t(OUTCOME_LABEL[c])}</button>)}</div>

      {o === 'partly_rejected' && <div className="field"><div className="row between"><label>{t('Which packages were rejected?')}</label><button className="ghost small" onClick={() => setScan(true)}>📷 {t('Scan')}</button></div>
        {stop.packages.map(p => { const r = rej[p.id]
          return <div key={p.id} className={`drv-rej ${r ? 'on' : ''}`}>
            <label className="row"><input type="checkbox" checked={!!r} onChange={() => { toggle(p.id); setSure(false) }} /> <span><b>{p.item ?? p.strain}</b><br /><span className="mono small">{p.tag}</span> · {n0(p.lbs)} lbs</span></label>
            {r && <div className="row wrap" style={{ gap: 6 }}>
              <select value={r.reason} onChange={e => setRej(x => ({ ...x, [p.id]: { ...r, reason: e.target.value } }))}><option value="">{t('Reason…')}</option>{REJECT_REASONS.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}</select>
              <input placeholder={t('Note (optional)')} value={r.note} onChange={e => setRej(x => ({ ...x, [p.id]: { ...r, note: e.target.value } }))} />
            </div>}
          </div> })}</div>}
      {o === 'fully_rejected' && <div className="field"><label>{t('Why did they reject it?')}</label>
        <select value={why} onChange={e => setWhy(e.target.value)}><option value="">{t('Reason…')}</option>{REJECT_REASONS.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}</select></div>}
      {o === 'not_delivered' && <div className="field"><label>{t('Why not?')}</label>
        <div className="drv-choices">{NOT_DELIVERED.filter(([k]) => !site || k === 'couldnt_deliver').map(([k, l]) => <button key={k} className={`drv-choice small ${why === k ? 'on' : ''}`} onClick={() => setWhy(k)}>{t(l)}</button>)}</div>
        {why === 'couldnt_deliver' && <div className="muted small">{t('Closed, no one there, truck problem… say what happened in the note.')}</div>}</div>}
      {o && <>
        <div className="field"><label>{o === 'not_delivered' ? t('Who did you talk to? (optional)') : t('Name of the person who received it')}</label>
          <input value={rcv} onChange={e => setRcv(e.target.value)} autoComplete="off" /></div>
        <div className="field"><label>{t('Note')} {o === 'not_delivered' && why === 'couldnt_deliver' ? '' : t('(optional)')}</label><textarea value={note} onChange={e => setNote(e.target.value)} rows={2} /></div>
        <div className="field"><label>{t('Photo (optional): the signed manifest, damage…')}</label>
          <input ref={file} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={async e => { const f = e.target.files?.[0]; if (f) { try { setPhoto(await shrink(f)) } catch { setErr(t('Couldn\'t read that photo')) } } }} />
          <div className="row"><button className="ghost small" onClick={() => file.current?.click()}>📷 {photo ? t('Retake photo') : t('Take a photo')}</button>
            {photo && <><img src={photo} alt="" style={{ height: 48, borderRadius: 6 }} /><button className="ghost small" onClick={() => setPhoto(null)}>✕</button></>}</div></div>
      </>}
      {err && <p className="neg">{err}</p>}
      {sure && !problem && <div className="infobox"><b>{t('Check before sending:')}</b> {t(OUTCOME_LABEL[o!])}. {summary}{office ? '' : ` ${t('Once sent, only the office can change it.')}`}</div>}
      <div className="row end">
        <button className="ghost" onClick={onClose}>{t('Cancel')}</button>
        <button className="primary" disabled={!!problem || busy} title={problem ?? ''} onClick={save}>{busy ? t('Saving…') : sure ? t('Yes, send') : t('Save')}</button>
      </div>
      {problem && o && <p className="muted small" style={{ textAlign: 'right' }}>{problem}</p>}
      {scan && <Scanner typed onClose={() => setScan(false)} onScan={onScan} />}
    </div>
  </div>
}

// =====================================================================================================
// delivery alerts (Transit, Sales): anything other than a plain delivery, and METRC follow-ups for Rama
// =====================================================================================================
interface StopAlert { id: number; module: string; kind: string; title: string; body: string | null; created_at: string }
export function StopAlerts({ sb, only }: { sb: SupabaseClient | null; only?: string[] }) {
  const [rows, setRows] = useState<StopAlert[]>([])
  const load = useCallback(() => { sb?.rpc('stop_alerts').then(({ data, error }) => { if (!error) setRows((data ?? []) as StopAlert[]) }) }, [sb])
  useEffect(() => { load(); const iv = setInterval(load, 60000); return () => clearInterval(iv) }, [load])
  const shown = rows.filter(a => !only || only.includes(a.module))
  if (!shown.length) return null
  return <div className="warnbox" style={{ marginBottom: 10 }}>
    <b>{t('Delivery alerts')}</b>
    {shown.map(a => <div key={a.id} className="row between" style={{ gap: 8, padding: '4px 0', borderTop: '1px solid var(--line)' }}>
      <div className="small"><b>{a.title}</b><div className="muted">{a.body}</div></div>
      <button className="ghost small" onClick={() => sb?.rpc('stop_alert_done', { p_id: a.id }).then(load)}>{t('Done')}</button></div>)}
  </div>
}

/** "Turn on notifications" for this phone (Driver screen) */
export function PushBanner({ sb }: { sb: SupabaseClient }) {
  const [st, setSt] = useState<PushState | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { pushState().then(setSt).catch(() => setSt('unsupported')) }, [])
  if (!st || st === 'on' || st === 'unsupported') return msg ? <p className="muted small">{msg}</p> : null
  if (st === 'ios_needs_home') return <div className="infobox small">{t('To get notifications on iPhone: tap Share, then Add to Home Screen, and open Lifted from the Home Screen.')}</div>
  if (st === 'blocked') return <div className="warnbox small">{t('Notifications are blocked for this app. Allow them in the phone settings to get alerts about your loads.')}</div>
  return <div className="infobox row between wrap" style={{ gap: 8 }}><span>{t('Get a notification when you\'re put on a load and when it leaves.')}</span>
    <button className="primary small" onClick={() => pushOn(sb).then(() => { setSt('on'); setMsg(t('Notifications are on for this device.')) }).catch(e => setMsg((e as Error).message))}>{t('Turn on notifications')}</button>
    {msg && <span className="neg small">{msg}</span>}</div>
}
