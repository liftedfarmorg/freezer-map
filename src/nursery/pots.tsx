// POT-2 (343): trays and pots. Pick a pot at planting, up-pot lots (bigger sizes only, part of a lot is fine), the life cycle of a lot,
// and the containers list in Nursery > Settings. Pots never go to METRC; a move done with an up-pot does (plantings, through nursery_move).
import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { NCtx } from './calc'
import { GEN_LABEL, fmtD, live, n0, today } from './calc'
import type { Batch, Mother, NContainer, NData, NPlanting } from './types'
import { DateIn, F, NumIn, Pick, SaveBar, Sheet, TextIn } from '../cult/ui'
import type { Flash } from '../cult/ui'
import { t } from '../i18n'

export const potsReady = (d: NData) => d.containers.length > 0
const byId = (d: NData, id: number | null | undefined) => (id == null ? undefined : d.containers.find(c => c.id === id))
export const potShort = (d: NData, id: number | null | undefined) => { const c = byId(d, id); return c ? c.short || c.name : '' }
const rank = (d: NData, id: number | null | undefined) => byId(d, id)?.size_rank ?? -1

/** what a lot is in, e.g. "1G" or "60 1G · 40 4"" when part of it was up-potted */
export function potText(d: NData, x: { container_id?: number | null; up_n?: number | null; up_to?: number | null }, liveN: number) {
  if (!x.up_n || !x.up_to) return potShort(d, x.container_id)
  return `${n0(x.up_n)} ${potShort(d, x.up_to)} · ${n0(Math.max(0, liveN - x.up_n))} ${potShort(d, x.container_id) || t('not set')}`
}

/** big tap chips in size order; `above` = only sizes bigger than this one (up-potting never goes smaller) */
export function PotChips({ d, kind = 'pot', value, above, onChange }: { d: NData; kind?: 'pot' | 'tray'; value: number | null; above?: number | null; onChange: (id: number) => void }) {
  const list = d.containers.filter(c => c.kind === kind && (c.active || c.id === value) && (above == null || c.size_rank > rank(d, above)))
  if (!list.length) return <p className="muted small-note">{above != null ? t('Nothing bigger in the containers list.') : t('No containers yet (Nursery > Settings > Containers).')}</p>
  return <div className="potchips">{list.map(c => <button key={c.id} type="button" className={`potchip ${value === c.id ? 'on' : ''}`} onClick={() => onChange(c.id)}>
    <b>{c.short || c.name}</b><span>{c.name}</span></button>)}</div>
}

/** after planting: put each new lot in its pot (the plant RPCs return [{mother_id | planting_id}]) */
export async function potPlanted(sb: SupabaseClient, out: unknown, to: number | null, on: string | null) {
  if (!to || !Array.isArray(out)) return
  const items = (out as { mother_id?: number; planting_id?: number }[]).map(o => (o.mother_id ? { kind: 'mother', id: o.mother_id } : o.planting_id ? { kind: 'planting', id: o.planting_id } : null)).filter(Boolean)
  if (!items.length) return
  const { error } = await sb.rpc('nursery_pot', { p_items: items, p_to: to, p_what: 'planted', p_on: on, p_note: null, p_room: null })
  if (error) throw new Error(t('Planted, but the pot wasn\'t saved: {e}', { e: error.message }))
}

export interface UpItem { kind: 'mother' | 'planting'; id: number; label: string; live: number; container_id: number | null; up_n: number | null; up_to: number | null; room_id: number | null; tag: string | null }
export const upMother = (m: Mother, label?: string): UpItem => ({ kind: 'mother', id: m.id, label: label ?? `${m.strain} · ${GEN_LABEL[m.gen]}`, live: live(m), container_id: m.container_id ?? null, up_n: m.up_n ?? null, up_to: m.up_to ?? null, room_id: m.room_id, tag: m.plant_tag })
export const upPlanting = (p: NPlanting, label?: string): UpItem => ({ kind: 'planting', id: p.id, label: label ?? p.strain, live: p.flipped_n ?? p.plants, container_id: p.container_id ?? null, up_n: p.up_n ?? null, up_to: p.up_to ?? null, room_id: p.room_id, tag: p.plant_tag })

/** Up pot: one or many lots into a bigger pot. Whole lot by default; type a number to do part of it today and the rest later. */
export function UpPotSheet({ sb, d, items, title, flash, onClose, onDone }: { sb: SupabaseClient; d: NData; items: UpItem[]; title?: string; flash: Flash; onClose: () => void; onDone: (m: string) => Promise<void> }) {
  const rest = (x: UpItem) => Math.max(0, x.live - (x.up_n ?? 0))
  const [rows, setRows] = useState(() => items.map(x => ({ x, on: rest(x) > 0, n: rest(x) as number | null })))
  const picked = rows.filter(r => r.on)
  // smallest pot allowed = bigger than the biggest pot any picked lot is in now
  const above = picked.reduce<number | null>((a, r) => (rank(d, r.x.container_id) > rank(d, a) ? r.x.container_id : a), null)
  const pending = [...new Set(picked.map(r => r.x.up_to).filter((v): v is number => v != null))]
  const firstUp = d.containers.filter(c => c.kind === 'pot' && c.active && c.size_rank > rank(d, above))[0]?.id ?? null
  const [to, setTo] = useState<number | null>(() => pending.length === 1 ? pending[0] : firstUp)
  const [room, setRoom] = useState<number | null>(null)
  const [on, setOn] = useState<string | null>(today())
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (i: number, v: Partial<(typeof rows)[number]>) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...v } : r)))
  const tc = byId(d, to)
  const bad = (r: (typeof rows)[number]) => !r.n || r.n <= 0 ? t('how many?') : r.n > rest(r.x) ? t('only {n} left', { n: n0(rest(r.x)) })
    : r.x.up_to && r.x.up_to !== to ? t('the rest goes into {pot}', { pot: potShort(d, r.x.up_to) }) : to && rank(d, to) <= rank(d, r.x.container_id) ? t('not bigger') : null
  const ok = !!to && picked.length > 0 && picked.every(r => !bad(r))
  const go = async () => {
    setBusy(true)
    try {
      const { error } = await sb.rpc('nursery_pot', { p_items: picked.map(r => ({ kind: r.x.kind, id: r.x.id, plants: r.n })), p_to: to, p_what: 'up_pot', p_on: on, p_note: note, p_room: room })
      if (error) throw new Error(error.message)
      const mv = room ? picked.filter(r => r.x.kind === 'planting' && r.x.room_id !== room) : []
      if (mv.length) { const m = await sb.rpc('nursery_move', { p_items: mv.map(r => ({ planting: r.x.id })), p_room: room, p_on: on }); if (m.error) throw new Error(t('Up-potted, but the move didn\'t go: {e}', { e: m.error.message })) }
      const part = picked.some(r => (r.n ?? 0) < rest(r.x))
      await onDone(t('{n} plants up-potted to {pot}', { n: n0(picked.reduce((a, r) => a + (r.n ?? 0), 0)), pot: tc?.name ?? '' }) + (room ? ` · ${d.rooms.find(x => x.id === room)?.name ?? ''}` : '') + (part ? ` · ${t('the rest can be done later')}` : ''))
    } catch (e) { flash(String((e as Error).message ?? e), true) } finally { setBusy(false) }
  }
  return (
    <Sheet side title={title ?? t('Up pot')} sub={t('Into a bigger pot. Sizes can be skipped, never smaller. Do part of a lot now and the rest later if you need to.')} onClose={onClose}>
      <F label={t('Into')}><PotChips d={d} value={to} above={above} onChange={setTo} /></F>
      {items.length > 1 && <div className="row wrap toolbar"><button className="ghost small" onClick={() => setRows(rs => rs.map(r => ({ ...r, on: rest(r.x) > 0 })))}>{t('All')}</button>
        <button className="ghost small" onClick={() => setRows(rs => rs.map(r => ({ ...r, on: false })))}>{t('None')}</button></div>}
      <div className="cwrap tight"><table className="ctable">
        <thead><tr>{items.length > 1 && <th />}<th>{t('Lot')}</th><th>{t('Now in')}</th><th className="num">{t('Plants')}</th></tr></thead>
        <tbody>{rows.map((r, i) => { const why = r.on ? bad(r) : null
          return <tr key={`${r.x.kind}${r.x.id}`}>{items.length > 1 && <td><input type="checkbox" checked={r.on} disabled={!rest(r.x)} onChange={e => set(i, { on: e.target.checked })} /></td>}
            <td>{r.x.label}{r.x.tag ? <span className="muted small mono"> …{r.x.tag.slice(-6)}</span> : ''}{why && <div className="warn-t small">{why}</div>}</td>
            <td className="small">{potText(d, r.x, r.x.live) || <span className="muted">{t('not set')}</span>}<div className="muted">{d.rooms.find(q => q.id === r.x.room_id)?.name ?? ''}</div></td>
            <td className="num"><NumIn value={r.n} onChange={v => set(i, { n: v })} /><div className="muted small">{t('of {n}', { n: n0(rest(r.x)) })}</div></td></tr> })}</tbody>
      </table></div>
      <div className="grid3">
        <F label={t('Moved to')} hint={t('(optional)')}><Pick value={room} blank={t('Same place')} options={d.rooms.filter(x => x.active && x.kind !== 'trailer').map(x => ({ v: x.id, l: `${x.name}${x.place !== 'Webb' ? ` (${x.place})` : ''}` }))} onChange={setRoom} /></F>
        <F label={t('Up-potted on')}><DateIn value={on} onChange={setOn} /></F>
        <F label={t('Note')}><TextIn value={note} onChange={setNote} /></F>
      </div>
      <p className="muted small-note">{room ? t('The move goes to METRC right away when the METRC location changes (a bench to another bench in the greenhouse stays in the app). Pot sizes stay in the app (METRC doesn\'t track them).') : t('Pot sizes stay in the app (METRC doesn\'t track them).')}</p>
      <SaveBar busy={busy} disabled={!ok} saveLabel={t('Up pot {n}', { n: n0(picked.reduce((a, r) => a + (r.n ?? 0), 0)) })} onCancel={onClose} onSave={go} />
    </Sheet>
  )
}

interface PotEvent { id: number; what: string; from_id: number | null; to_id: number | null; plants: number | null; room_from: number | null; room_to: number | null; on_date: string; note: string | null; done_by: string }
/** a mother lot's (or planting's) life cycle: cut, ready, planted, every up-pot and move, retired */
export function LifeCycle({ sb, d, c, kind, lot, batch }: { sb: SupabaseClient; d: NData; c: NCtx; kind: 'mother' | 'planting'; lot: Mother | NPlanting; batch?: Batch }) {
  const [ev, setEv] = useState<PotEvent[] | null>(null)
  useEffect(() => { sb.from('nursery_pot_events').select('*').eq('lot_kind', kind).eq('lot_id', lot.id).order('on_date').order('id').then(r => setEv((r.data ?? []) as PotEvent[])) }, [sb, kind, lot.id])
  const m = kind === 'mother' ? lot as Mother : null, p = kind === 'planting' ? lot as NPlanting : null
  const steps: { on: string | null; what: string; sub?: string }[] = []
  if (batch) {
    steps.push({ on: batch.cut_on, what: t('Cut: {n} cuttings', { n: n0(batch.cuttings) }), sub: [potShort(d, batch.container_id) || '72c', c.room(batch.room_id), batch.name].filter(Boolean).join(' · ') })
    if (batch.stage !== 'rooting' && batch.ready_on) steps.push({ on: batch.ready_on, what: t('Rooted, ready') })
  }
  const planted = ev?.find(e => e.what === 'planted')
  steps.push({ on: m?.started_on ?? p?.planted_on ?? null, what: m ? t('Planted as {gen} moms', { gen: GEN_LABEL[m.gen] }) : t('Planted'),
    sub: [planted ? potShort(d, planted.to_id) : '', c.room(lot.room_id ?? null), lot.plant_tag ? `…${lot.plant_tag.slice(-6)}` : ''].filter(Boolean).join(' · ') })
  for (const e of ev ?? []) if (e.what !== 'planted') steps.push({ on: e.on_date, what: t('Up-potted {n}: {a} → {b}', { n: n0(e.plants), a: potShort(d, e.from_id) || '?', b: potShort(d, e.to_id) }),
    sub: [e.room_to && e.room_to !== e.room_from ? t('moved to {where}', { where: c.room(e.room_to) }) : '', e.note, e.done_by.split('@')[0]].filter(Boolean).join(' · ') })
  if (p?.flipped_on) steps.push({ on: p.flipped_on, what: t('Flipped to flowering: {n} plants', { n: n0(p.flipped_n) }) })
  if (m && m.status !== 'active') steps.push({ on: m.ended_on, what: m.status === 'retired' ? t('Retired') : t('Destroyed') })
  if (m?.lost) steps.push({ on: null, what: t('{n} lost along the way', { n: n0(m.lost) }) })
  return <div className="lifecycle">
    {ev == null ? <p className="muted">{t('Loading…')}</p> : steps.map((s, i) => <div key={i} className="lc-step"><span className="lc-dot" /><div><b>{s.what}</b>
      <div className="muted small">{[fmtD(s.on), s.sub].filter(Boolean).join(' · ')}</div></div></div>)}
    {ev && !ev.length && <p className="muted small-note">{t('Pot changes show here from now on (up-pots done in the app).')}</p>}
  </div>
}

/** Nursery > Settings > Containers: the trays and pots list, smallest first */
export function ContainersPanel({ d, sb, flash, onSaved }: { d: NData; sb: SupabaseClient; flash: Flash; onSaved: (m: string) => Promise<void> }) {
  const [x, setX] = useState<Partial<NContainer> | null>(null)
  const [busy, setBusy] = useState(false)
  const list = [...d.containers].sort((a, b) => a.size_rank - b.size_rank || a.id - b.id)
  const save = async (v: Partial<NContainer>, msg: string) => {
    setBusy(true)
    const { error } = v.id ? await sb.from('nursery_containers').update(v).eq('id', v.id) : await sb.from('nursery_containers').insert(v)
    setBusy(false)
    if (error) flash(error.message.replace(/duplicate key.*/, t('There\'s already a container with that name')), true); else { setX(null); await onSaved(msg) }
  }
  // swap places with the one above / below (the order is the size order)
  const nudge = async (i: number, dir: -1 | 1) => {
    const a = list[i], b = list[i + dir]; if (!a || !b) return
    setBusy(true)
    const r1 = await sb.from('nursery_containers').update({ size_rank: b.size_rank === a.size_rank ? a.size_rank + dir : b.size_rank }).eq('id', a.id)
    const r2 = await sb.from('nursery_containers').update({ size_rank: a.size_rank }).eq('id', b.id)
    setBusy(false)
    const e = r1.error ?? r2.error; if (e) flash(e.message, true); else await onSaved(t('Order saved'))
  }
  if (!potsReady(d)) return <p className="warn-t small-note">{t('Containers need 343_nursery_containers_up_pot.sql run in Supabase.')}</p>
  return <>
    <p className="muted small-note">{t('Smallest to largest. Cuttings go into a tray; planting and up-potting use pots. Up-potting can skip sizes but never goes smaller, so keep this in size order.')}</p>
    <div className="dlist">{list.map((c, i) => <div key={c.id} className={`drow ${c.active ? '' : 'off'}`}>
      <span className="grow"><b>{c.name}</b><span className="muted"> · {c.short} · {c.kind === 'tray' ? t('tray, {n} cells', { n: c.cells }) : t('pot')}{c.active ? '' : ` · ${t('not in use')}`}</span></span>
      <span className="row"><button className="ghost small" disabled={busy || i === 0} onClick={() => nudge(i, -1)} aria-label={t('Smaller')}>↑</button>
        <button className="ghost small" disabled={busy || i === list.length - 1} onClick={() => nudge(i, 1)} aria-label={t('Bigger')}>↓</button>
        <button className="ghost small" onClick={() => setX(c)}>{t('Edit')}</button></span></div>)}</div>
    <button className="linkbtn" onClick={() => setX({ kind: 'pot', cells: 1, active: true, size_rank: (list[list.length - 1]?.size_rank ?? 0) + 10 })}>{t('+ Container')}</button>
    {x && <Sheet side title={x.id ? x.name ?? '' : t('New container')} onClose={() => setX(null)}>
      <div className="grid2">
        <F label={t('Name')}><TextIn value={x.name} onChange={v => setX(s => ({ ...s, name: v ?? '' }))} autoFocus={!x.id} placeholder={t('3 Gallon Pots')} /></F>
        <F label={t('Short name')} hint={t('(for tables)')}><TextIn value={x.short} onChange={v => setX(s => ({ ...s, short: v }))} placeholder="3G" /></F>
        <F label={t('Kind')}><Pick value={x.kind} options={[{ v: 'pot', l: t('Pot') }, { v: 'tray', l: t('Cutting tray') }]} onChange={v => setX(s => ({ ...s, kind: v ?? 'pot', cells: v === 'tray' ? s?.cells ?? 72 : 1 }))} /></F>
        {x.kind === 'tray' && <F label={t('Cells per tray')}><NumIn value={x.cells} onChange={v => setX(s => ({ ...s, cells: v ?? 1 }))} /></F>}
      </div>
      <label className="check"><input type="checkbox" checked={x.active !== false} onChange={e => setX(s => ({ ...s, active: e.target.checked }))} /> <span>{t('In use')}</span></label>
      {!x.id && <p className="muted small-note">{t('It goes at the bottom (biggest). Use the arrows to put it in its size order.')}</p>}
      <SaveBar busy={busy} disabled={!x.name?.trim()} onCancel={() => setX(null)}
        onSave={() => save({ id: x.id, name: x.name!.trim(), short: x.short?.trim() || null, kind: x.kind ?? 'pot', cells: x.kind === 'tray' ? Math.max(1, x.cells ?? 72) : 1, active: x.active !== false, size_rank: x.size_rank ?? 0 }, t('Container saved'))} />
    </Sheet>}
  </>
}
