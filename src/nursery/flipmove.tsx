// 339: nursery Move and Flip (and planting donors), shared by donor batches, receivers and pheno hunt lots. Straight to METRC on Auto.
import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { TagInput } from '../taginput'
import type { NCtx } from './calc'
import { n0, strainKey, today } from './calc'
import type { NData, NPlanting } from './types'
import { DateIn, F, Pick, SaveBar, Sheet } from '../cult/ui'
import type { Flash } from '../cult/ui'
import { t } from '../i18n'
import { PotChips, potPlanted, potsReady } from './pots'

const site = (d: NData) => d.sites[0]?.code ?? '1PN'
const num = (tag: string) => { const m = tag.match(/([0-9]+)$/); return m ? { head: tag.slice(0, tag.length - m[1].length), n: Number(m[1]), w: m[1].length } : null }
/** the tag `k` after `tag` (…23760 + 2 = …23762) */
export const tagPlus = (tag: string, k: number) => { const x = num(tag.trim().toUpperCase()); return x ? x.head + String(x.n + k).padStart(x.w, '0') : '' }

/** consecutive runs from the free plant tags, one per count (each run its own unbroken stretch) */
async function runsFor(sb: SupabaseClient, d: NData, counts: number[], skip: Set<string>) {
  const need = counts.reduce((a, b) => a + b, 0)
  const { data, error } = await sb.rpc('nursery_next_tags', { p_site: site(d), p_count: Math.min(500, need + 200), p_type: 'plant' })
  if (error) throw error
  const free = ((data ?? []) as string[]).filter(x => !skip.has(x))
  const out: string[] = []
  let i = 0
  for (const c of counts) {
    let start = ''
    while (i < free.length) {
      let ok = true
      for (let k = 1; k < c; k++) if (free[i + k] !== tagPlus(free[i], k)) { ok = false; break }
      if (ok && i + c <= free.length) { start = free[i]; i += c; break }
      i++
    }
    out.push(start)
  }
  return out
}

export interface MoveItem { planting: NPlanting; label: string }
/** Move: tick plantings (immature batches, or their flowering plants once flipped), pick the place, one METRC move each */
export function MoveSheet({ sb, d, items, title, suggest, flash, onClose, onDone }: { sb: SupabaseClient; d: NData; items: MoveItem[]; title: string; suggest?: number | null; flash: Flash; onClose: () => void; onDone: (m: string) => Promise<void> }) {
  const [sel, setSel] = useState<Set<number>>(() => new Set(items.map(x => x.planting.id)))
  const [room, setRoom] = useState<number | null>(suggest ?? null)
  const [on, setOn] = useState<string | null>(today())
  const [busy, setBusy] = useState(false)
  const r = d.rooms.find(x => x.id === room)
  const picked = items.filter(x => sel.has(x.planting.id) && x.planting.room_id !== room)
  const go = async () => {
    setBusy(true)
    const { error } = await sb.rpc('nursery_move', { p_items: picked.map(x => ({ planting: x.planting.id })), p_room: room, p_on: on })
    setBusy(false)
    if (error) flash(error.message, true); else await onDone(t('{n} moved to {where}', { n: picked.length, where: r?.name ?? '?' }))
  }
  return (
    <Sheet side title={title} sub={t('Each one moves in METRC right away (immature batch, or its flowering plants once flipped).')} onClose={onClose}>
      <div className="grid3">
        <F label={t('Move to')}><Pick value={room} blank="—" options={d.rooms.filter(x => x.active && x.site === site(d)).map(x => ({ v: x.id, l: `${x.name}${x.place !== 'Webb' ? ` (${x.place})` : ''}` }))} onChange={setRoom} /></F>
        <F label={t('Moved on')}><DateIn value={on} onChange={setOn} /></F>
      </div>
      <div className="row wrap toolbar"><button className="ghost small" onClick={() => setSel(new Set(items.map(x => x.planting.id)))}>{t('All')}</button><button className="ghost small" onClick={() => setSel(new Set())}>{t('None')}</button></div>
      <div className="cwrap tight"><table className="ctable">
        <thead><tr><th /><th>{t('What')}</th><th className="num">{t('Plants')}</th><th>{t('Now in')}</th><th>{t('Tag')}</th></tr></thead>
        <tbody>{items.map(x => <tr key={x.planting.id}><td><input type="checkbox" checked={sel.has(x.planting.id)} onChange={e => setSel(s => { const z = new Set(s); if (e.target.checked) z.add(x.planting.id); else z.delete(x.planting.id); return z })} /></td>
          <td>{x.label}{x.planting.flipped_on ? <span className="muted small"> · {t('flowering')}</span> : ''}</td><td className="num">{n0(x.planting.flipped_n ?? x.planting.plants)}</td>
          <td>{d.rooms.find(q => q.id === x.planting.room_id)?.name ?? ''}</td><td className="mono small">…{x.planting.plant_tag.slice(-6)}</td></tr>)}</tbody>
      </table></div>
      <SaveBar busy={busy} disabled={!room || !picked.length} saveLabel={t('Move {n}', { n: picked.length })} onCancel={onClose} onSave={go} />
    </Sheet>
  )
}

export interface FlipItem { key: string; label: string; where: string; max: number; planting?: number; hunt?: number; lot?: string }
/** Flip: immature batches to Flowering, one plant tag each, a consecutive run per batch */
export function FlipSheet({ sb, d, items, title, flash, onClose, onDone }: { sb: SupabaseClient; d: NData; items: FlipItem[]; title: string; flash: Flash; onClose: () => void; onDone: (m: string) => Promise<void> }) {
  const [rows, setRows] = useState(() => items.map(x => ({ x, on: false, count: x.max, start: '' })))
  const [on, setOn] = useState<string | null>(today())
  const [busy, setBusy] = useState(false)
  const set = (i: number, v: Partial<(typeof rows)[number]>) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...v } : r)))
  const picked = rows.filter(r => r.on)
  const fill = async () => {
    try {
      const want = rows.map((r, i) => ({ r, i })).filter(z => z.r.on && !z.r.start.trim())
      const runs = await runsFor(sb, d, want.map(z => z.r.count), new Set(rows.map(r => r.start.trim().toUpperCase()).filter(Boolean)))
      setRows(rs => rs.map((r, i) => { const k = want.findIndex(z => z.i === i); return k >= 0 ? { ...r, start: runs[k] } : r }))
      if (runs.some(x => !x)) flash(t('Not enough tags in a row for some of them. Type a starting tag.'), true)
    } catch (e) { flash(String((e as Error).message ?? e), true) }
  }
  const go = async () => {
    setBusy(true)
    const p = picked.map(r => ({ ...(r.x.planting ? { planting: r.x.planting } : { hunt: r.x.hunt, lot: r.x.lot }), start: r.start.trim().toUpperCase(), count: r.count }))
    const { error } = await sb.rpc('nursery_flip', { p_items: p, p_on: on })
    setBusy(false)
    if (error) flash(error.message, true); else await onDone(t('{n} flipped to Flowering', { n: n0(picked.reduce((a, r) => a + r.count, 0)) }))
  }
  const ok = picked.length > 0 && picked.every(r => r.start.trim() && r.count > 0 && r.count <= r.x.max)
  return (
    <Sheet side title={title} sub={t('Each plant gets its own tag: a run of tags in a row, starting at the tag you give.')} onClose={onClose}>
      <div className="row wrap toolbar"><button className="ghost small" onClick={() => setRows(rs => rs.map(r => ({ ...r, on: true })))}>{t('All')}</button>
        <button className="ghost small" onClick={() => setRows(rs => rs.map(r => ({ ...r, on: false })))}>{t('None')}</button>
        <button className="ghost small" disabled={!picked.length} onClick={fill}>{t('Next tags for the picked ones')}</button>
        <F label={t('Flipped on')}><DateIn value={on} onChange={setOn} /></F></div>
      {!items.length ? <p className="muted">{t('Nothing to flip here.')}</p> : <div className="cwrap tight"><table className="ctable">
        <thead><tr><th /><th>{t('What')}</th><th>{t('Where')}</th><th className="num">{t('Plants')}</th><th>{t('First tag')}</th><th>{t('Last tag')}</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={r.x.key}><td><input type="checkbox" checked={r.on} onChange={e => set(i, { on: e.target.checked })} /></td>
          <td>{r.x.label}</td><td className="small">{r.x.where}</td>
          <td className="num"><input className="qty" type="number" value={r.count} onChange={e => set(i, { count: Math.min(r.x.max, Number(e.target.value) || 0) })} /></td>
          <td><TagInput compact value={r.start} onChange={v => set(i, { start: v })} where={{ site: site(d), type: 'plant' }} placeholder={t('METRC tag')} /></td>
          <td className="mono small">{r.start.trim() && r.count > 1 ? `…${tagPlus(r.start, r.count - 1).slice(-6)}` : ''}</td></tr>)}</tbody>
      </table></div>}
      <SaveBar busy={busy} disabled={!ok} saveLabel={t('Flip {n}', { n: n0(picked.reduce((a, r) => a + r.count, 0)) })} onCancel={onClose} onSave={go} />
    </Sheet>
  )
}

export interface DonorRow { id: number; label: string; strains: string | null; plants: number | null }
/** Plant donors: each donor batch (one strain) becomes an immature batch from that strain's package, all in one place */
export function PlantDonors({ sb, d, c, rows: rows0, flash, onClose, onDone }: { sb: SupabaseClient; d: NData; c: NCtx; rows: DonorRow[]; flash: Flash; onClose: () => void; onDone: (m: string) => Promise<void> }) {
  const pk = (s: string | null) => d.batches.filter(q => s && q.package_tag && strainKey(q.strain) === strainKey(s) && (q.stage === 'rooting' || q.stage === 'ready') && c.left(q) > 0)
    .sort((a, b) => Number(b.use === 'donors') - Number(a.use === 'donors'))
  const [rows, setRows] = useState<{ x: DonorRow; on: boolean; batch: number | null; plants: number; tag: string }[]>(() => rows0.map(x => ({ x, on: true, batch: pk(x.strains)[0]?.id ?? null, plants: x.plants ?? 0, tag: '' })))
  const [room, setRoom] = useState<number | null>(d.rooms.find(r => r.name === 'Greenhouse')?.id ?? null)
  const [on, setOn] = useState<string | null>(today())
  const [pot, setPot] = useState<number | null>(null)   // POT-2
  const [busy, setBusy] = useState(false)
  const set = (i: number, v: Partial<(typeof rows)[number]>) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...v } : r)))
  const picked = rows.filter(r => r.on)
  const fill = async () => {
    const { data, error } = await sb.rpc('nursery_next_tags', { p_site: site(d), p_count: picked.length + 10, p_type: 'plant' })
    if (error) { flash(error.message, true); return }
    const have = new Set(rows.map(r => r.tag.trim().toUpperCase()).filter(Boolean)); const pool = ((data ?? []) as string[]).filter(x => !have.has(x))
    setRows(rs => rs.map(r => (r.on && !r.tag.trim() ? { ...r, tag: pool.shift() ?? '' } : r)))
  }
  const bad = (r: (typeof rows)[number]) => { const q = d.batches.find(y => y.id === r.batch); return !q ? t('no package') : q.stage !== 'ready' ? t('package not marked ready') : r.plants > c.left(q) ? t('only {n} left', { n: c.left(q) }) : r.plants > 100 ? t('100 max') : null }
  const go = async () => {
    setBusy(true)
    const { data, error } = await sb.rpc('nursery_plant', { p_lines: picked.map(r => ({ batch: r.batch, use: 'donors', ref: r.x.id, room, plants: r.plants, tag: r.tag.trim().toUpperCase() })), p_on: on })
    if (!error) await potPlanted(sb, data, pot, on).catch(e => flash((e as Error).message, true))
    setBusy(false)
    if (error) flash(error.message, true); else await onDone(t('{n} donor batches planted', { n: picked.length }))
  }
  const ok = !!room && picked.length > 0 && picked.every(r => r.batch && r.tag.trim() && r.plants > 0 && !bad(r)) && (!potsReady(d) || pot != null)
  return (
    <Sheet side title={t('Plant donors')} sub={t('One immature batch per donor batch, from its strain\'s package. Goes to METRC right away.')} onClose={onClose}>
      <div className="grid3">
        <F label={t('Where they are now')}><Pick value={room} blank="—" options={d.rooms.filter(x => x.active && x.site === site(d)).map(x => ({ v: x.id, l: x.name }))} onChange={setRoom} /></F>
        <F label={t('Planted on')}><DateIn value={on} onChange={setOn} /></F>
      </div>
      {potsReady(d) && <F label={t('Planted into')}><PotChips d={d} value={pot} onChange={setPot} /></F>}
      <div className="row wrap toolbar"><button className="ghost small" onClick={() => setRows(rs => rs.map(r => ({ ...r, on: true })))}>{t('All')}</button><button className="ghost small" onClick={() => setRows(rs => rs.map(r => ({ ...r, on: false })))}>{t('None')}</button>
        <button className="ghost small" disabled={!picked.length} onClick={fill}>{t('Next tags for the picked ones')}</button></div>
      <div className="cwrap tight"><table className="ctable">
        <thead><tr><th /><th>{t('Donor batch')}</th><th>{t('From package')}</th><th className="num">{t('Plants')}</th><th>{t('Plant tag')}</th></tr></thead>
        <tbody>{rows.map((r, i) => { const opts = pk(r.x.strains); const why = r.on ? bad(r) : null
          return <tr key={r.x.id}><td><input type="checkbox" checked={r.on} onChange={e => set(i, { on: e.target.checked })} /></td>
            <td>{r.x.strains ?? '?'} · {r.x.label}{why && <div className="warn-t small">{why}</div>}</td>
            <td>{opts.length ? <Pick value={r.batch} options={opts.map(q => ({ v: q.id, l: `…${(q.package_tag ?? '').slice(-6)} · ${n0(c.left(q))} ${t('left')}${q.stage !== 'ready' ? ` · ${t('rooting')}` : ''}` }))} onChange={v => set(i, { batch: v })} /> : <span className="warn-t small">{t('no package for this strain')}</span>}</td>
            <td className="num"><input className="qty" type="number" value={r.plants} onChange={e => set(i, { plants: Number(e.target.value) || 0 })} /></td>
            <td><TagInput compact value={r.tag} onChange={v => set(i, { tag: v })} where={{ site: site(d), type: 'plant' }} placeholder={t('METRC tag')} /></td></tr> })}</tbody>
      </table></div>
      <SaveBar busy={busy} disabled={!ok} saveLabel={t('Plant {n}', { n: picked.length })} onCancel={onClose} onSave={go} />
    </Sheet>
  )
}
