// Msg RES-11: staff reserve editor, built like the customer portal's Reserves & Menu (Aziz: "they should both work like
// this"). Used by Sales > Reserves > a customer, and by + Add reserves. KPIs, filters (Reserved / Not reserved / SHO / BHO),
// a +/− step chooser, one sortable table of their reserves + their open-order strains + everything open on the menu,
// and a Change reserve stepper on every row. Staff changes save straight away (set_reserve), not as a request.
// Limits are the same as before: not under shipped + open SOs; up by at most what's open on the menu.
import { useEffect, useMemo, useState } from 'react'
import type { Backend } from './api'
import type { Balance, CustomerTerms, Order } from './types'
const tcls = (t: string | null | undefined) => (t ? ` t-${t.toLowerCase().replace('/', '')}` : '')
import { StrainLink } from './strainCard'

type Flash = (t: string, bad?: boolean) => void
type Tag = { g: string | null; t: string | null }
const n0 = (v: number) => Math.round(v).toLocaleString()
const k = (s: string) => s.trim().toLowerCase()
const STEPS: [number, string][] = [[10, '10 lbs'], [50, '50 lbs'], [100, '100 lbs'], [650, 'A full pallet']]
const TYPE_ORDER: Record<string, number> = { S: 1, 'S/H': 2, H: 3, 'I/H': 4, I: 5 }
const TYPE_LONG: Record<string, string> = { S: 'Sativa', 'S/H': 'Sativa hybrid', H: 'Hybrid', 'I/H': 'Indica hybrid', I: 'Indica' }
const sign = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${n0(Math.abs(v))}`

interface Row { key: string; strain: string; res: number; ful: number; so: number; rem: number; open: number; has: boolean }
type SortK = 's' | 'g' | 't' | 'res' | 'ful' | 'so' | 'rem' | 'open'

function Stepper({ val, step, min, max, bad, label, onChange }: { val: number; step: number; min: number; max: number; bad?: boolean; label: string; onChange: (n: number) => void }) {
  const [txt, setTxt] = useState<string | null>(null)
  const clamp = (n: number) => Math.min(Math.max(n, min), Math.max(max, min))
  const shown = txt ?? (val ? sign(val).replace('±', '') : '')
  return <span className={`rstep ${val ? 'on' : ''} ${bad ? 'bad' : ''}`}>
    <button type="button" disabled={val <= min} onClick={() => { setTxt(null); onChange(clamp(val - step)) }} aria-label={`${step} lbs less ${label}`}>−</button>
    <input type="text" inputMode="numeric" value={shown} placeholder="±0" aria-label={`Change to ${label} reserve, lbs`} aria-invalid={bad ? 'true' : 'false'}
      onFocus={e => e.target.select()}
      onChange={e => { const t = e.target.value.replace(/[−–]/g, '-').replace(/[^0-9+-]/g, ''); setTxt(t); const n = Number(t.replace('+', '')); if (t === '' || t === '-' || t === '+') onChange(0); else if (!isNaN(n)) onChange(n) }}
      onBlur={() => setTxt(null)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
    <button type="button" disabled={val >= max} onClick={() => { setTxt(null); onChange(clamp(val + step)) }} aria-label={`${step} lbs more ${label}`}>+</button>
  </span>
}

export function ReserveEditor({ backend, cid, cname, year, cur, flash, onSaved, canEdit = true, reservesOff }: {
  backend: Backend; cid: number; cname: string; year: number; cur: number; flash: Flash; onSaved?: () => void | Promise<void>; canEdit?: boolean; reservesOff?: boolean
}) {
  const [bal, setBal] = useState<Balance[] | null>(null)
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [open, setOpen] = useState<{ strain: string; crop_year: number; open_lbs: number }[] | null>(null)
  const [tags, setTags] = useState<Record<string, Tag>>({})
  const [terms, setTerms] = useState<CustomerTerms[]>([])
  const [rev, setRev] = useState(0)
  const [ed, setEd] = useState<Record<string, number>>({})   // strain key -> change (+/− lbs)
  const [fRes, setFRes] = useState<'all' | 'res' | 'not'>('all')
  const [fG, setFG] = useState<'all' | 'SHO' | 'BHO'>('all')
  const [q, setQ] = useState('')
  const [srt, setSrt] = useState<{ k: SortK; up: boolean }>({ k: 's', up: true })
  const [step, setStepRaw] = useState(() => { try { return Number(localStorage.getItem('fm.res.step')) || 10 } catch { return 10 } })
  const [custom, setCustom] = useState(false)
  const [stepTxt, setStepTxt] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const setStep = (n: number) => { setStepRaw(n); try { localStorage.setItem('fm.res.step', String(n)) } catch { /* private mode */ } }

  useEffect(() => {
    backend.listBalances().then(setBal).catch(() => setBal([]))
    backend.listOrders().then(setOrders).catch(() => setOrders([]))
    backend.client()?.rpc('staff_ff_open').then(({ data, error }) => setOpen(error ? [] : (data ?? []) as { strain: string; crop_year: number; open_lbs: number }[]), () => setOpen([]))
    backend.listTerms().then(setTerms).catch(() => {})
  }, [rev])
  useEffect(() => {
    backend.client()?.rpc('menu_strain_tags').then(({ data }) => {
      const m: Record<string, Tag> = {}
      for (const x of (data ?? []) as { strain: string; aliases: string[] | null; strain_type: string | null; grade: string | null }[])
        for (const n of [x.strain, ...(x.aliases ?? [])]) if (n && !(k(n) in m)) m[k(n)] = { g: x.grade, t: x.strain_type }
      setTags(m)
    }, () => {})
  }, [])
  useEffect(() => { setEd({}) }, [cid, year])

  const rows = useMemo(() => {
    if (!bal || !open || !orders) return []
    const m = new Map<string, Row>()
    for (const b of bal) if (b.customer_id === cid && (b.crop_year ?? cur) === year && (Number(b.reserved) > 0 || Number(b.shipped) > 0 || Number(b.pending) > 0))
      m.set(k(b.strain), { key: k(b.strain), strain: b.strain, res: Number(b.reserved), ful: Number(b.shipped), so: Number(b.pending), rem: Math.max(0, Number(b.remaining)), open: 0, has: true })
    // RES-7: strains on their confirmed or shipped orders with no reserve yet; once a reserve exists those lbs count against it
    for (const o of orders) if (o.customer_id === cid && (o.status === 'pending' || o.status === 'shipped')) for (const l of o.order_lines) {
      if ((l.product ?? 'fresh_frozen') !== 'fresh_frozen' || (l.crop_year ?? cur) !== year || m.get(k(l.strain))?.has) continue
      const x = m.get(k(l.strain)) ?? { key: k(l.strain), strain: l.strain, res: 0, ful: 0, so: 0, rem: 0, open: 0, has: false }
      if (o.status === 'pending') x.so += Number(l.lbs); else x.ful += Number(l.lbs)
      m.set(x.key, x)
    }
    for (const o of open) if (o.crop_year === year && Number(o.open_lbs) > 0) {
      const x = m.get(k(o.strain))
      if (x) x.open = Number(o.open_lbs)
      else m.set(k(o.strain), { key: k(o.strain), strain: o.strain, res: 0, ful: 0, so: 0, rem: 0, open: Number(o.open_lbs), has: false })
    }
    return [...m.values()]
  }, [bal, open, orders, cid, year, cur])

  const tagOf = (s: string): Tag => tags[k(s)] ?? { g: null, t: null }
  const minOf = (r: Row) => r.ful + r.so
  const maxOf = (r: Row) => Math.max(r.res, r.ful + r.so) + r.open
  const errOf = (r: Row, to: number) => to < minOf(r) && !(to === 0 && !r.has) ? `Can't go under ${n0(minOf(r))} (shipped + open SOs)`
    : to > maxOf(r) ? `${n0(maxOf(r))} is the most (${n0(Math.max(r.res, r.ful + r.so))} theirs + ${n0(r.open)} open)` : ''
  const changes = rows.filter(r => (ed[r.key] ?? 0) !== 0).map(r => { const to = r.res + ed[r.key]; return { r, to, d: ed[r.key], err: errOf(r, to) } })
  const bad = changes.filter(x => x.err)
  const okD = changes.filter(x => !x.err).reduce((a, x) => a + x.d, 0)
  const tot = rows.reduce((t, r) => ({ res: t.res + r.res, ful: t.ful + r.ful, so: t.so + r.so, rem: t.rem + r.rem, open: t.open + r.open }), { res: 0, ful: 0, so: 0, rem: 0, open: 0 })
  const t = terms.find(x => x.customer_id === cid && x.crop_year === year)
  const contract = t?.contract_lbs ?? null
  const newRes = tot.res + okD
  const remNow = (r: Row) => { const d = ed[r.key] ?? 0; return d ? Math.max(0, r.res + d - r.ful - r.so) : r.rem }
  const newRem = rows.reduce((a, r) => a + remNow(r), 0)

  const ql = q.trim().toLowerCase()
  const val = (r: Row): string | number => srt.k === 's' ? r.strain.toLowerCase() : srt.k === 'g' ? ({ SHO: 1, BHO: 2 } as Record<string, number>)[tagOf(r.strain).g ?? ''] ?? 9
    : srt.k === 't' ? TYPE_ORDER[tagOf(r.strain).t ?? ''] ?? 9 : srt.k === 'rem' ? (r.has ? r.rem : 0) : r[srt.k]
  const list = rows.filter(r => (fRes === 'all' || (fRes === 'res') === r.has) && (fG === 'all' || tagOf(r.strain).g === fG) && (!ql || r.strain.toLowerCase().includes(ql)))
    .sort((a, b) => { const x = val(a), y = val(b); const d = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)
      return (srt.up ? d : -d) || a.strain.localeCompare(b.strain) })
  const sh = (key: SortK, label: React.ReactNode, num = true) => <th className={`${num ? 'num ' : ''}sortth${srt.k === key ? ' on' : ''}`} aria-sort={srt.k === key ? (srt.up ? 'ascending' : 'descending') : 'none'}>
    <button className="linkbtn" onClick={() => setSrt(o => ({ k: key, up: o.k === key ? !o.up : key === 's' }))}>{label}{srt.k === key ? (srt.up ? ' ▲' : ' ▼') : ''}</button></th>
  const chip = (on: boolean, label: string, f: () => void) => <button key={label} className={`rchip ${on ? 'on' : ''}`} aria-pressed={on} onClick={f}>{label}</button>
  const gradeCell = (s: string) => { const g = tagOf(s).g; return g ? <span className={`gtag g-${g.toLowerCase()}`}>{g}</span> : null }
  const typeCell = (s: string) => { const ty = tagOf(s).t; return ty ? <span className={`ttag${tcls(ty)}`} title={TYPE_LONG[ty]}>{ty}</span> : null }

  async function save() {
    if (!changes.length || bad.length) return
    setBusy(true); let done = 0
    try {
      for (const x of changes) { await backend.setReserve(cid, x.r.strain, x.to, note.trim() || undefined, year !== cur ? year : undefined); done++ }
      flash(`${done} reserve${done === 1 ? '' : 's'} saved for ${cname}`); setEd({}); setNote(''); setRev(v => v + 1); await onSaved?.()
    } catch (e) { flash(`${done ? `${done} saved, then: ` : ''}${String((e as Error).message ?? e)}`, true); if (done) { setRev(v => v + 1); await onSaved?.() } }
    finally { setBusy(false) }
  }

  if (!bal || !open || !orders) return <p className="muted">Loading reserves and the open menu…</p>
  const sum = changes.slice(0, 3).map(x => x.r.has ? `${x.r.strain} ${n0(x.r.res)} → ${n0(x.to)}` : `${x.r.strain} new ${n0(x.to)}`).join(' · ') + (changes.length > 3 ? ` +${changes.length - 3} more` : '')
  return <div className="reditor">
    <div className="rkpis">
      <div><span>Reserved</span><b>{n0(newRes)} lbs</b>{okD !== 0 && <i className="muted">was {n0(tot.res)}</i>}</div>
      <div><span>Fulfilled</span><b>{n0(tot.ful)} lbs</b></div>
      <div><span>On open SOs</span><b>{n0(tot.so)} lbs</b></div>
      <div className="tint"><span>Remaining</span><b>{n0(newRem)} lbs</b></div>
      <div><span>Open menu available</span><b>{n0(tot.open)} lbs</b></div>
    </div>
    {contract != null && <p className={`small ${newRes > contract ? 'warn-t' : 'muted'}`} style={{ margin: 0 }}>Contract {n0(contract)} lbs for {year}{newRes > contract ? ` · ${n0(newRes - contract)} over` : newRes < contract ? ` · ${n0(contract - newRes)} still to reserve` : ' · right on it'}</p>}
    {reservesOff && <div className="warnbox">{cname} is menu only: reserves are off for them. Turn them on in Sales › Customers if they're a contract customer.</div>}
    <section className="rcard">
      <div className="rbar">
        <div className="rchips" role="group" aria-label="Filter strains">
          {chip(fRes === 'all' && fG === 'all', 'All', () => { setFRes('all'); setFG('all') })}
          {chip(fRes === 'res', 'Reserved', () => setFRes(fRes === 'res' ? 'all' : 'res'))}
          {chip(fRes === 'not', 'Not reserved', () => setFRes(fRes === 'not' ? 'all' : 'not'))}
          {chip(fG === 'SHO', 'SHO', () => setFG(fG === 'SHO' ? 'all' : 'SHO'))}
          {chip(fG === 'BHO', 'BHO', () => setFG(fG === 'BHO' ? 'all' : 'BHO'))}
        </div>
        {canEdit && <div className="rstepset" role="group" aria-label="How much + and − move">
          <span>+/− step</span>{STEPS.map(([n, tt]) => <button key={n} aria-pressed={step === n && !custom} className={step === n && !custom ? 'on' : ''} title={tt} onClick={() => { setCustom(false); setStep(n) }}>{n}</button>)}
          {custom || !STEPS.some(([n]) => n === step)
            ? <input type="text" inputMode="numeric" aria-label="Custom step, lbs" autoFocus={custom} value={stepTxt ?? String(step)}
                onChange={e => { const tx = e.target.value.replace(/[^0-9]/g, '').slice(0, 5); setStepTxt(tx); if (Number(tx) >= 1) setStep(Number(tx)) }}
                onBlur={() => { setStepTxt(null); setCustom(false) }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
            : <button onClick={() => { setCustom(true); setStepTxt('') }}>Custom</button>}<span>lbs</span></div>}
        <input className="search" type="search" placeholder="Search strains" value={q} onChange={e => setQ(e.target.value)} aria-label="Search strains" />
      </div>
      <div className="rscroll"><table className="ctable rtable">
        <thead><tr>{sh('s', 'Strain', false)}{sh('g', 'Grade', false)}{sh('t', 'Type', false)}{sh('res', 'Reserved')}{sh('ful', 'Fulfilled')}{sh('so', 'Open SO')}{sh('rem', 'Remaining')}{sh('open', <>Open menu<br />available</>)}{canEdit && <th className="num">Change reserve</th>}</tr></thead>
        <tbody>
          {list.length === 0 && <tr><td colSpan={9} className="muted">Nothing matches.</td></tr>}
          {list.map(r => { const d = ed[r.key] ?? 0, to = r.res + d, e = d ? errOf(r, to) : ''
            return <tr key={r.key} className={d ? (e ? 'bad' : 'on') : ''}>
              <td className="c-n"><StrainLink name={r.strain} />{!r.has && d > 0 && <> <span className="pill newp">New</span></>}
                {!r.has && r.so > 0 && <div className="muted small">{n0(r.so)} on their open order, no reserve yet</div>}
                {e && <div className="warn-t small">{e}</div>}
                <span className="rtags-ph">{gradeCell(r.strain)}{typeCell(r.strain)}</span></td>
              <td className="c-g">{gradeCell(r.strain)}</td><td className="c-t">{typeCell(r.strain)}</td>
              <td className={`num ${!d && !r.has ? 'e' : ''}`} data-l="reserved ">{d ? <><span className="muted">{n0(r.res)} →</span> <b>{n0(to)}</b></> : r.has ? n0(r.res) : <span className="muted">–</span>}</td>
              <td className={`num ${r.has || r.ful ? '' : 'e'}`} data-l="fulfilled ">{r.has || r.ful ? n0(r.ful) : <span className="muted">–</span>}</td>
              <td className={`num ${r.has || r.so ? '' : 'e'}`} data-l="open SO ">{r.has || r.so ? n0(r.so) : <span className="muted">–</span>}</td>
              <td className={`num c-rem ${!d && !r.has ? 'e' : ''}`} data-l="remaining "><b className={d ? (e ? 'warn-t' : 'ok-t') : ''}>{d ? (e ? '–' : n0(remNow(r))) : r.has ? n0(r.rem) : <span className="muted">–</span>}</b></td>
              <td className="num muted" data-l="open ">{n0(r.open)}</td>
              {canEdit && <td className="num c-st"><Stepper val={d} step={step} min={r.has ? minOf(r) - r.res : 0} max={maxOf(r) - r.res} bad={!!e} label={r.strain}
                onChange={n => setEd(m => { const x = { ...m }; if (n) x[r.key] = n; else delete x[r.key]; return x })} /></td>}
            </tr> })}
        </tbody>
        {list.length > 0 && <tfoot><tr><td><b>Total lbs</b></td><td /><td /><td className="num"><b>{n0(newRes)}</b></td><td className="num">{n0(tot.ful)}</td><td className="num">{n0(tot.so)}</td>
          <td className="num"><b className="ok-t">{n0(newRem)}</b></td><td className="num muted">{n0(tot.open)}</td>{canEdit && <td />}</tr></tfoot>}
      </table></div>
    </section>
    <p className="muted small" style={{ margin: '0 4px' }}>Fulfilled = shipped. Open SO = on their confirmed orders that haven't shipped (those lbs count against the reserve). Remaining = reserved − fulfilled − open SO. Open menu available = what anyone can still reserve or order. Saving changes the reserve right away (no request).</p>
    {canEdit && changes.length > 0 && <div className="rdock">
      <div className="grow"><b>{changes.length} change{changes.length === 1 ? '' : 's'} · {sign(okD)} lbs</b>
        <div className="muted small">{sum}{bad.length > 0 && <span className="warn-t"> · {bad.map(x => x.r.strain).join(', ')}: fix the red line</span>}</div></div>
      <input type="text" placeholder="Reason (optional, they see it in Reserve History)" value={note} onChange={e => setNote(e.target.value)} aria-label="Reason" />
      <button className="ghost" disabled={busy} onClick={() => { setEd({}); setNote('') }}>Cancel</button>
      <button className="primary" disabled={busy || bad.length > 0} onClick={save}>{busy ? 'Saving…' : bad.length ? 'Fix the red lines' : `Save ${changes.length}`}</button>
    </div>}
  </div>
}
