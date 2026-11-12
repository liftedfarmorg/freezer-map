import { useState } from 'react'
import { TagInput } from '../taginput'
import type { NurseryApi } from './api'
import type { NCtx } from './calc'
import { GEN_LABEL, GEN_WHAT, STAGE_LABEL, USES, USE_LABEL, addDays, batchName, daysBetween, fmtD, live, n0, rooted, strainKey, today, useOf } from './calc'
import type { Batch, NData, NUse, Stage } from './types'
import { DateIn, F, NumIn, Pick, SaveBar, Sheet, StrainList, TextIn } from '../cult/ui'
import type { Flash } from '../cult/ui'
import { t, tn } from '../i18n'
import { useSaved } from '../saved'
import { LifeCycle, PotChips, UpPotSheet, potText, potsReady, upMother, upPlanting } from './pots'
import type { UpItem } from './pots'

const stagePill = (b: Batch) => {
  const late = b.stage === 'rooting' && b.ready_on && b.ready_on < today()
  return <span className={`pill ${b.stage === 'ready' ? 'okp' : late ? 'warnp' : ''}`}>{late ? t('Rooting (past ready date)') : t(STAGE_LABEL[b.stage])}</span>
}
const pct = (x: number | null) => (x == null ? '' : `${Math.round(x * 100)}%`)
export const success = (b: Batch) => { const r = rooted(b); return r == null || !b.cuttings ? null : r / b.cuttings }

/** Nursery > Batches: cuttings taken, rooting, sorts, ready, out the door (or into the hoops as moms) */
export function BatchesTab({ d, c, q, onOpen, onNew, onSortDay }: { d: NData; c: NCtx; q: string; onOpen: (b: Batch) => void; onNew: () => void; onSortDay: () => void }) {
  const [f, setF] = useSaved<'live' | Stage | 'all'>('nursery.batches.BatchesTab.f', 'live')
  const [gen, setGen] = useState<0 | 1 | 2 | 3 | 4>(0)
  const ql = q.trim().toLowerCase()
  const rows = d.batches.filter(b => (f === 'all' || (f === 'live' ? b.stage === 'rooting' || b.stage === 'ready' : b.stage === f)) && (!gen || b.gen === gen) &&
    (!ql || `${b.strain} ${b.name ?? ''} ${b.package_tag ?? ''} ${b.tags.join(' ')} ${b.notes ?? ''}`.toLowerCase().includes(ql)))
  const n = (s: Stage) => d.batches.filter(b => b.stage === s).length
  return <>
    <div className="row toolbar between">
      <div className="row wrap">
        <div className="seg">{([['live', t('In the nursery ({n})', { n: n('rooting') + n('ready') })], ['rooting', t('Rooting')], ['ready', t('Ready')], ['done', t('Done')], ['all', t('All')]] as const)
          .map(([k, l]) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l}</button>)}</div>
        <div className="seg">{([0, 4, 3, 2, 1] as const).map(g => <button key={g} className={gen === g ? 'on' : ''} onClick={() => setGen(g)}>{g ? GEN_LABEL[g] : t('All gens')}</button>)}</div>
      </div>
      <div className="row"><button className="ghost" onClick={onSortDay}>{t('Sort day')}</button><button className="primary" onClick={onNew}>{t('+ Cuttings taken')}</button></div>
    </div>
    {!rows.length ? <p className="muted">{t('No batches here. When cuttings are taken, add them with "Cuttings taken".')}</p> : <div className="cwrap"><table className="ctable">
      <thead><tr><th>{t('Cut')}</th><th>{t('Gen')}</th><th>{t('Strain')}</th><th className="num">{t('Cuttings')}</th><th className="num hide-s">{t('Trays')}</th><th className="num">{t('Rooted')}</th><th className="num">{t('Left')}</th><th>{t('Ready')}</th><th className="hide-s">{t('Where / for')}</th><th>{t('Stage')}</th><th className="hide-s">{t('Package')}</th></tr></thead>
      <tbody>{rows.map(b => {
        const o = b.order_id ? d.orders.find(x => x.id === b.order_id) : undefined, s = success(b)
        return <tr key={b.id} className={`tap ${b.stage === 'done' ? 'done' : b.stage === 'cancelled' ? 'cancelled' : ''}`} onClick={() => onOpen(b)}>
          <td className="nowrap">{fmtD(b.cut_on)}</td><td><span className={`gpill g${b.gen}`}>{GEN_LABEL[b.gen]}</span></td><td>{b.strain}</td>
          <td className="num">{n0(b.cuttings)}</td><td className="num hide-s">{b.trays ?? ''}</td>
          <td className="num">{s == null ? '' : <span className={s < 0.85 ? 'warn-t' : ''}>{pct(s)}</span>}</td><td className="num"><b>{n0(c.left(b))}</b></td>
          <td className="nowrap">{fmtD(b.ready_on)}</td><td className="hide-s small">{[c.room(b.room_id), o ? `${c.to(o)} ${fmtD(o.deliver_on)}` : ''].filter(Boolean).join(' · ')}</td><td>{stagePill(b)}</td>
          <td className="hide-s small nowrap">{b.package_tag ? <><span className="mono">…{b.package_tag.slice(-6)}</span> <span className="muted">{t(USE_LABEL[useOf(b)])}</span></> : <span className="warn-t">{t('no package')}</span>}</td>
        </tr>
      })}</tbody>
    </table></div>}
  </>
}

const nextSeason = (gen: number, cut: string) => { const y = Number(cut.slice(0, 4)), m = Number(cut.slice(5, 7)); return gen === 4 || gen === 3 ? y + (gen === 3 && m >= 7 ? 1 : 0) : y + (m >= 6 ? 1 : 0) }

export function BatchSheet({ d, c, b: b0, api, flash, onClose, onSaved }: { d: NData; c: NCtx; b: Partial<Batch>; api: NurseryApi; flash: Flash; onClose: () => void; onSaved: (m: string) => Promise<void> }) {
  const isNew = !b0.id
  const site = b0.site ?? d.sites[0]?.code ?? '1PN'
  const defTray = d.containers.find(z => z.kind === 'tray' && z.active)?.id ?? null   // POT-2: cuttings always go into a tray (72c)
  const [x, setX] = useState<Partial<Batch>>(() => ({ site, cut_on: today(), tags: [], lost: 0, gen: 4, container_id: isNew ? defTray : null,
    room_id: isNew ? d.rooms.find(r => r.active && r.kind === 'trailer')?.id ?? null : null, ...b0 }))
  const [busy, setBusy] = useState(false)
  const [good, setGood] = useState<number | null>(null)
  const [mode, setMode] = useState<'edit' | 'ready' | 'loss' | 'plant' | 'split'>('edit')
  const [loss, setLoss] = useState<number | null>(null)
  const set = (v: Partial<Batch>) => setX(s => ({ ...s, ...v }))
  const tray = d.containers.find(z => z.id === (x.container_id ?? defTray))?.cells ?? (d.settings.tray || 72)
  const [up, setUp] = useState<UpItem[] | null>(null)
  const [life, setLife] = useState<UpItem | null>(null)
  const kids = b0.id ? [...d.mothers.filter(m => m.batch_id === b0.id && m.status === 'active').map(m => upMother(m)),
    ...d.plantings.filter(p => p.batch_id === b0.id).map(p => upPlanting(p, `${p.strain} · ${t(USE_LABEL[p.use])}`))] : []
  const delivered = b0.id ? c.fromBatch.get(b0.id) ?? 0 : 0
  const autoName = x.strain && x.cut_on ? batchName(x.site ?? site, x.cut_on, x.strain) + (x.gen && x.gen < 4 ? `-G${x.gen}` : '') : ''
  const gen = x.gen ?? 4
  const orders = d.orders.filter(o => c.isOpen(o) && (!x.strain || strainKey(o.strain) === strainKey(x.strain)))
  const moms = d.mothers.filter(m => m.status === 'active' && (!x.strain || strainKey(m.strain) === strainKey(x.strain)) && (gen === 1 || m.gen === gen - 1))
  const r = rooted({ ...(b0 as Batch), ...(x as Batch) })
  const run = async (f: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try { await f(); onClose(); await onSaved(ok) } catch (e) { flash(String((e as Error).message ?? e), true) } finally { setBusy(false) }
  }
  const save = () => run(() => api.save<Batch>('nursery_batches', {
    id: x.id, site: x.site ?? site, room_id: x.room_id ?? null, strain: x.strain!.trim(), name: (x.name ?? '').trim() || autoName || null, order_id: gen === 4 ? x.order_id ?? null : null,
    cut_on: x.cut_on!, cuttings: x.cuttings!, lost: x.lost ?? 0, ready_on: x.ready_on ?? (x.cut_on ? addDays(x.cut_on, d.settings.rootDays) : null), stage: x.stage ?? 'rooting', tags: x.tags ?? [], use: x.use ?? null, package_tag: (x.package_tag ?? '').trim().toUpperCase() || null, notes: x.notes ?? null,
    gen, season: x.season ?? (x.cut_on ? nextSeason(gen, x.cut_on) : null), mother_id: x.mother_id ?? null, trays: x.trays ?? (x.cuttings ? Math.round(x.cuttings / tray * 10) / 10 : null),
    emerged_on: x.emerged_on ?? null, moved_out_on: x.moved_out_on ?? null, ...(potsReady(d) ? { container_id: x.container_id ?? null } : {}),
    sort1_on: x.sort1_on ?? null, s1_vigorous: x.s1_vigorous ?? null, s1_minimal: x.s1_minimal ?? null, s1_none: x.s1_none ?? null, s1_dead: x.s1_dead ?? null,
    sort2_on: x.sort2_on ?? null, s2_vigorous: x.s2_vigorous ?? null, s2_minimal: x.s2_minimal ?? null, s2_none: x.s2_none ?? null, s2_dead: x.s2_dead ?? null,
  }), isNew ? t('{n} {strain} {gen} cuttings added', { n: n0(x.cuttings), strain: x.strain, gen: GEN_LABEL[gen] }) : t('Saved'))

  if (mode === 'ready' && b0.id) return (
    <Sheet side title={`${b0.strain}: ${t('ready')}`} sub={`${b0.name ?? ''} · ${t('{n} cut {date}', { n: n0(b0.cuttings), date: fmtD(b0.cut_on) })}`} onClose={() => setMode('edit')}>
      <F label={t('Good plants (rooted, ready to go)')}><NumIn value={good} onChange={setGood} autoFocus /></F>
      <p className="muted small-note">{t('The rest ({n}) count as lost.', { n: n0(Math.max(0, c.left(b0 as Batch) - (good ?? 0))) })}{r != null ? ' ' + t('The sorts say {n} rooted.', { n: n0(r) }) : ''}</p>
      <SaveBar busy={busy} disabled={good == null || good < 0 || good > c.left(b0 as Batch)} saveLabel={t('Mark ready')} onCancel={() => setMode('edit')}
        onSave={() => run(() => api.save<Batch>('nursery_batches', { id: b0.id, stage: 'ready', ready_on: today(), lost: (b0.lost ?? 0) + Math.max(0, c.left(b0 as Batch) - good!) }), t('{n} {strain} ready', { n: n0(good), strain: b0.strain }))} />
    </Sheet>
  )
  if (mode === 'loss' && b0.id) return (
    <Sheet side title={`${b0.strain}: ${t('losses')}`} sub={t('{n} left in {batch}', { n: n0(c.left(b0 as Batch)), batch: b0.name ?? t('this batch') })} onClose={() => setMode('edit')}>
      <F label={t('Plants lost (died, culled)')}><NumIn value={loss} onChange={setLoss} autoFocus /></F>
      <SaveBar busy={busy} disabled={!loss || loss < 0 || loss > c.left(b0 as Batch)} saveLabel={t('Record loss')} onCancel={() => setMode('edit')}
        onSave={() => run(() => api.save<Batch>('nursery_batches', { id: b0.id, lost: (b0.lost ?? 0) + loss!, ...(loss === c.left(b0 as Batch) ? { stage: delivered ? 'done' : 'cancelled' } : {}) }), t('{n} lost', { n: n0(loss) }))} />
    </Sheet>
  )
  if (mode === 'plant' && b0.id) return <PlantSheet d={d} c={c} b={b0 as Batch} api={api} flash={flash} onBack={() => setMode('edit')} onDone={async m => { onClose(); await onSaved(m) }} />
  if (up) return <UpPotSheet sb={api.sb} d={d} items={up} flash={flash} onClose={() => setUp(null)} onDone={async m => { setUp(null); onClose(); await onSaved(m) }} />
  if (life) { const lot = life.kind === 'mother' ? d.mothers.find(m => m.id === life.id) : d.plantings.find(p => p.id === life.id)
    if (lot) return <Sheet side title={life.label} sub={t('Life cycle')} onClose={() => setLife(null)}><LifeCycle sb={api.sb} d={d} c={c} kind={life.kind} lot={lot} batch={b0 as Batch} /></Sheet> }
  if (mode === 'split' && b0.id) return <SplitSheet d={d} c={c} b={b0 as Batch} api={api} flash={flash} onBack={() => setMode('edit')} onDone={async m => { onClose(); await onSaved(m) }} />

  const sortRow = (n: 1 | 2) => {
    const k = (f: string) => `s${n}_${f}` as keyof Batch
    return <div className="sortrow">
      <F label={t('Sort {n}', { n })}><DateIn value={x[`sort${n}_on` as keyof Batch] as string | null} onChange={v => set({ [`sort${n}_on`]: v } as Partial<Batch>)} /></F>
      {(['vigorous', 'minimal', 'none', 'dead'] as const).map(f => <F key={f} label={t(f === 'none' ? 'No roots' : f === 'dead' ? 'Dead / contam.' : f === 'vigorous' ? 'Vigorous' : 'Minimal')}>
        <NumIn value={x[k(f)] as number | null} onChange={v => set({ [k(f)]: v } as Partial<Batch>)} /></F>)}
    </div>
  }
  return (
    <Sheet side title={isNew ? t('Cuttings taken') : t('{strain} · {gen} batch', { strain: b0.strain, gen: GEN_LABEL[b0.gen ?? 4] })} sub={isNew ? t('One batch per strain per cut day') : `${b0.name ?? ''} · ${t('{n} left', { n: n0(c.left(b0 as Batch)) })} · ${t(STAGE_LABEL[b0.stage ?? 'rooting'])}`} onClose={onClose} wide>
      {!isNew && (b0.stage === 'rooting' || b0.stage === 'ready') && <div className="row wrap docact">
        {b0.stage === 'rooting' && <button className="primary" disabled={busy} onClick={() => { setGood(r ?? c.left(b0 as Batch)); setMode('ready') }}>{t('Mark ready…')}</button>}
        {b0.package_tag && <button className="ghost" disabled={busy} onClick={() => setMode('split')}>{t('Split…')}</button>}
        {b0.package_tag && <button className="primary" disabled={busy} onClick={() => setMode('plant')}>{useOf(b0 as Batch) === 'g4' ? t('Plant…') : t('Plant as {use}…', { use: t(USE_LABEL[useOf(b0 as Batch)]) })}</button>}
        <button className="ghost" disabled={busy} onClick={() => setMode('loss')}>{t('Record losses…')}</button>
        {b0.stage === 'ready' && <button className="ghost" disabled={busy} onClick={() => run(() => api.save<Batch>('nursery_batches', { id: b0.id, stage: 'rooting' }), t('Back to rooting'))}>{t('Back to rooting')}</button>}
      </div>}
      <div className="grid3">
        <F label={t('Generation')}><Pick value={gen} options={[4, 3, 2, 1].map(g => ({ v: g as 1 | 2 | 3 | 4, l: t(GEN_WHAT[g]) }))} onChange={v => set({ gen: v ?? 4, mother_id: null })} /></F>
        <F label={t('Strain')}><TextIn value={x.strain} list="n-strains" onChange={v => set({ strain: v ?? '' })} autoFocus={isNew && !b0.strain} /></F>
        <F label={t('Cut on')}><DateIn value={x.cut_on} onChange={v => set({ cut_on: v ?? today() })} /></F>
        <F label={t('Cuttings')}><NumIn value={x.cuttings} onChange={v => set({ cuttings: v ?? undefined })} /></F>
        {potsReady(d) && <F label={t('Tray')}><Pick value={x.container_id ?? defTray} options={d.containers.filter(z => z.kind === 'tray' && (z.active || z.id === x.container_id)).map(z => ({ v: z.id, l: z.name }))} onChange={v => set({ container_id: v })} /></F>}
        <F label={t('Trays')} hint={t('({n} per tray)', { n: tray })}><NumIn value={x.trays ?? (x.cuttings ? Math.round(x.cuttings / tray * 10) / 10 : null)} onChange={v => set({ trays: v })} /></F>
        <F label={t('Rooting in')}><Pick value={x.room_id} blank="—" options={d.rooms.filter(r => r.active || r.id === x.room_id).map(r => ({ v: r.id, l: `${r.name}${r.place !== 'Webb' ? ` (${r.place})` : ''}` }))} onChange={v => set({ room_id: v })} /></F>
        <F label={t('Cut from')} hint={gen === 1 ? '' : t('({gen} lots)', { gen: GEN_LABEL[gen - 1] })}><Pick value={x.mother_id} blank="—" options={moms.map(m => ({ v: m.id, l: `${m.strain} ${GEN_LABEL[m.gen]} · ${[c.room(m.room_id), m.bed].filter(Boolean).join(' ') || t('no location')} · ${live(m)}` }))} onChange={v => set({ mother_id: v })} /></F>
        <F label={t('Ready by')} hint={x.ready_on ? '' : t('({n} days)', { n: d.settings.rootDays })}><DateIn value={x.ready_on ?? (x.cut_on ? addDays(x.cut_on, d.settings.rootDays) : null)} onChange={v => set({ ready_on: v })} /></F>
        {gen === 4 ? <F label={t('For order')} hint={t('(optional)')}><Pick value={x.order_id} blank={t('Not for a particular order')} options={orders.map(o => ({ v: o.id, l: `${c.to(o)} · ${n0(o.plants)} · ${fmtD(o.deliver_on) || t('no date')}` }))} onChange={v => set({ order_id: v })} /></F>
          : <F label={t('For season')}><NumIn value={x.season ?? (x.cut_on ? nextSeason(gen, x.cut_on) : null)} onChange={v => set({ season: v })} /></F>}
      </div>
      <StrainList id="n-strains" names={[...new Set([...d.mothers.filter(m => m.status === 'active').map(m => m.strain), ...d.strains])]} />
      <F label={t('METRC batch name')}><TextIn value={x.name} placeholder={autoName} onChange={v => set({ name: v })} /></F>
      {kids.length > 0 && <>
        <h3 className="row between"><span>{t('Planted from this package')}</span>{potsReady(d) && kids.length > 1 && kids.some(k => k.live > (k.up_n ?? 0)) && <button className="primary small" onClick={() => setUp(kids.filter(k => k.live > (k.up_n ?? 0)))}>{t('Up pot all…')}</button>}</h3>
        <div className="cwrap tight"><table className="ctable">
          <thead><tr><th>{t('Lot')}</th><th>{t('Where')}</th><th className="num">{t('Plants')}</th><th>{t('Pot')}</th><th /></tr></thead>
          <tbody>{kids.map(k => <tr key={`${k.kind}${k.id}`} className="tap" onClick={() => setLife(k)}><td>{k.label}{k.tag ? <span className="muted small mono"> …{k.tag.slice(-6)}</span> : ''}</td>
            <td className="small">{c.room(k.room_id)}</td><td className="num">{n0(k.live)}</td><td className="small">{potText(d, k, k.live) || <span className="muted">—</span>}</td>
            <td className="nowrap">{potsReady(d) && k.live > (k.up_n ?? 0) && <button className="ghost small" onClick={e => { e.stopPropagation(); setUp([k]) }}>{t('Up pot…')}</button>}</td></tr>)}</tbody>
        </table></div>
        <p className="muted small-note">{t('Tap a lot for its life cycle.')}</p>
      </>}
      <h3>{t('METRC package')}</h3>
      {x.parent_id ? <p className="small-note muted">{t('Split from')} {(() => { const pb = d.batches.find(z => z.id === x.parent_id); return pb ? `${pb.name ?? pb.strain} · …${(pb.package_tag ?? '').slice(-6)}` : '#' + x.parent_id })()}</p> : null}
      <div className="grid3">
        <F label={t('Package tag')} hint={t('(one tag, any number of plants)')}>
          <TagInput value={x.package_tag ?? ''} onChange={v => set({ package_tag: v || null })} where={{ site: x.site ?? site, type: 'package' }} autofill={isNew} disabled={busy || !!x.parent_id} />
        </F>
        <F label={t('For')}><Pick value={useOf({ use: x.use ?? null, gen: x.gen ?? 4 })} options={USES.map(u => ({ v: u, l: t(USE_LABEL[u]) }))} onChange={v => set({ use: (v as NUse | null) ?? null })} /></F>
        {(() => { const mp = x.package_tag ? d.mpkgs.get(x.package_tag.toUpperCase()) : undefined; const lf = isNew ? null : c.left(b0 as Batch)
          return <div className="field"><label>{t('In METRC')}</label><div className="calcline">{!x.package_tag ? <span className="muted">{t('no tag yet')}</span>
            : !mp ? <span className="warn-t">{t('not an active package (last pull)')}</span>
            : <><b>{n0(mp.qty)}</b> {mp.uom ?? ''}{lf != null && mp.qty != null && Math.round(mp.qty) !== lf ? <span className="warn-t"> · {t('app has {n} left', { n: n0(lf) })}</span> : ''}<div className="muted small">{mp.item}</div></>}</div></div> })()}
      </div>
      {!isNew && <><h3>{t('Rooting')}</h3>
      <div className="grid3">
        <F label={t('First roots seen')}><DateIn value={x.emerged_on} onChange={v => set({ emerged_on: v })} /></F>
        <F label={t('Moved outside')}><DateIn value={x.moved_out_on} onChange={v => set({ moved_out_on: v })} /></F>
        <div className="field"><label>{t('Rooted so far')}</label><div className="calcline">{r == null ? <span className="muted">{t('enter a sort')}</span> : <><b>{n0(r)}</b> {t('of')} {n0(x.cuttings)} · {pct(x.cuttings ? r / x.cuttings : null)}
          {x.sort1_on && x.cut_on ? <span className="muted"> · {t('{n} days to first sort', { n: daysBetween(x.cut_on, x.sort1_on) })}</span> : ''}</>}</div></div>
      </div>
      {sortRow(1)}{sortRow(2)}
      <p className="muted small-note">{t('Rooted = vigorous at sort 1 + vigorous at sort 2 (sort 2 re-sorts the minimal and no-root ones).')}</p></>}
      <F label={t('Notes')}><TextIn value={x.notes} onChange={v => set({ notes: v })} /></F>
      {!isNew && delivered > 0 && <p className="muted small-note">{t('{n} plants from this batch were delivered.', { n: n0(delivered) })}</p>}
      <SaveBar busy={busy} disabled={!x.strain?.trim() || !(Number(x.cuttings) > 0) || !x.cut_on} saveLabel={isNew ? t('Add batch') : t('Save')} onCancel={onClose} onSave={save}
        onDelete={!isNew && !delivered ? () => run(() => api.remove('nursery_batches', b0.id!), t('Batch deleted')) : undefined} />
    </Sheet>
  )
}

const MOM_USES = ['g1', 'g2', 'g3']
/** where a use plants: moms on benches / greenhouse / hoops (G3 hoops only), the rest anywhere active */
const roomsFor = (d: NData, use: NUse | null) => d.rooms.filter(r => r.active && (!use || !MOM_USES.includes(use) ? true : use === 'g3' ? r.kind === 'hoop' : ['bench', 'greenhouse', 'hoop'].includes(r.kind)))
const openRuns = (d: NData) => d.runs.filter(r => !['done', 'cancelled', 'harvested'].includes(r.status))

/** 337 Plant: immature plant batches from this package, for its use. One plant tag per 100 plants. G4 picks a nursery use first. */
function PlantSheet({ d, c, b, api, flash, onBack, onDone }: { d: NData; c: NCtx; b: Batch; api: NurseryApi; flash: Flash; onBack: () => void; onDone: (m: string) => Promise<void> }) {
  const left = c.left(b)
  const u0 = useOf(b)
  const [use, setUse] = useState<NUse | null>(u0 === 'g4' ? null : u0)
  const [ref, setRef] = useState<number | null>(b.use_ref ?? null)
  const [room, setRoom] = useState<number | null>(null)
  const [bed, setBed] = useState<string | null>(null)
  const [qty, setQty] = useState<number | null>(left)
  const [tags, setTags] = useState<string[]>([])
  const [on, setOn] = useState<string | null>(today())
  const [pot, setPot] = useState<number | null>(null)   // POT-2: no default, they pick
  const [busy, setBusy] = useState(false)
  const run = use === 'receivers' ? d.runs.find(r => r.id === ref) : undefined
  const donor = use === 'donors' ? d.donorBatches.find(x => x.id === ref) : undefined
  const locs = roomsFor(d, use)
  const where = use === 'receivers' ? run?.room_id ?? null : room ?? (use === 'donors' ? donor?.room_id ?? null : null)
  const r = d.rooms.find(x => x.id === where)
  const n = Math.max(1, Math.ceil((qty ?? 0) / 100))
  const lines = Array.from({ length: n }, (_, i) => Math.min(100, (qty ?? 0) - i * 100))
  const fill = async () => {
    const have = tags.slice(0, n).filter(Boolean)
    const pool = (await api.nextTags(b.site, n + 10, 'plant')).filter(x => !have.includes(x))
    if (!pool.length) { flash(t('No plant tags loaded for this nursery yet (Admin → Settings → Licenses).'), true); return }
    setTags(Array.from({ length: n }, (_, i) => tags[i] || pool.shift() || ''))
  }
  const go = async () => {
    setBusy(true)
    try {
      const out = await api.plant(lines.map((p, i) => ({ batch: b.id, use: use!, ref: use === 'receivers' || use === 'donors' ? ref : null, room: where, bed, plants: p, tag: (tags[i] ?? '').trim().toUpperCase() })), on)
      if (pot) { const items = (out as { mother_id?: number; planting_id?: number }[]).flatMap((o): { kind: 'mother' | 'planting'; id: number }[] => o.mother_id ? [{ kind: 'mother', id: o.mother_id }] : o.planting_id ? [{ kind: 'planting', id: o.planting_id }] : [])
        if (items.length) await api.pot(items, pot, 'planted', on).catch(e => flash(t('Planted, but the pot wasn\'t saved: {e}', { e: (e as Error).message }), true)) }
      await onDone(t('{n} {strain} planted as {use}', { n: n0(qty), strain: b.strain, use: t(USE_LABEL[use!]) }) + (r ? ` · ${r.name}` : ''))
    } catch (e) { flash(String((e as Error).message ?? e), true) } finally { setBusy(false) }
  }
  const ready = b.stage === 'ready'
  const ok = ready && use && use !== 'g4' && (qty ?? 0) > 0 && (qty ?? 0) <= left && where != null && (use !== 'receivers' || ref != null) && tags.slice(0, n).filter(x => x.trim()).length === n && (!potsReady(d) || pot != null)
  return (
    <Sheet side title={t('Plant {strain}', { strain: b.strain })} sub={`…${(b.package_tag ?? '').slice(-6)} · ${t('{n} plants left', { n: n0(left) })} · ${t('one immature batch per plant tag (up to 100)')}`} onClose={onBack}>
      {!ready && <p className="warn-t small-note">{t('Mark the package ready first (Mark ready… on the batch).')}</p>}
      <div className="grid3">
        <F label={t('Plant as')}><Pick value={use} blank={u0 === 'g4' ? t('Pick: G4 isn\'t planted here') : undefined} options={USES.filter(x => x !== 'g4').map(x => ({ v: x, l: t(USE_LABEL[x]) }))} onChange={v => { setUse(v as NUse | null); setRoom(null); setBed(null) }} /></F>
        {use === 'receivers' && <F label={t('Pollination run')}><Pick value={ref} blank="—" options={openRuns(d).map(x => ({ v: x.id, l: `${x.name}${x.room_id ? ` · ${d.rooms.find(q => q.id === x.room_id)?.name ?? ''}` : ''}` }))} onChange={setRef} /></F>}
        {use === 'donors' && <F label={t('Donor batch')}><Pick value={ref} blank="—" options={d.donorBatches.filter(x => !x.strains || strainKey(x.strains) === strainKey(b.strain)).map(x => ({ v: x.id, l: `${x.strains ?? ''} · ${x.label} · ${x.project}` }))} onChange={setRef} /></F>}
        {use === 'receivers' ? <div className="field"><label>{t('Where')}</label><div className="calcline">{run ? (r?.name ?? <span className="warn-t">{t('Set the trailer on the run first')}</span>) : <span className="muted">{t('the run\'s trailer')}</span>}</div></div>
          : <F label={t('Where')}><Pick value={where} blank="—" options={locs.map(x => ({ v: x.id, l: `${x.name}${x.place !== 'Webb' ? ` (${x.place})` : ''}` }))} onChange={v => { setRoom(v); setBed(null) }} /></F>}
        {r?.kind === 'hoop' && <F label={t('Bed')}><Pick value={bed} blank="—" options={(r.beds.length ? r.beds.map(x => x.bed) : ['A', 'B', 'C']).map(x => ({ v: x, l: x }))} onChange={setBed} /></F>}
        <F label={t('Plants')}><NumIn value={qty} onChange={setQty} /></F>
        <F label={t('Planted on')}><DateIn value={on} onChange={setOn} /></F>
      </div>
      {potsReady(d) && <F label={t('Planted into')}><PotChips d={d} value={pot} onChange={setPot} /></F>}
      <h3 className="row between"><span>{t('Plant tags')} <span className="muted small">{tn(n, '{n} immature batch', '{n} immature batches')}</span></span><button type="button" className="ghost small" onClick={fill} disabled={busy}>{t('Next tags')}</button></h3>
      {lines.map((p, i) => <div key={i} className="row"><span className="muted small" style={{ minWidth: 70 }}>{t('{n} plants', { n: n0(p) })}</span>
        <TagInput value={tags[i] ?? ''} onChange={v => setTags(s => { const z = [...s]; z[i] = v; return z })} where={{ site: b.site, type: 'plant' }} disabled={busy} /></div>)}
      <p className="muted small-note">{use && MOM_USES.includes(use) ? t('Becomes a mother lot (Nursery > Mothers).') : use ? t('Goes to METRC right away: an immature plant batch from this package.') : ''}</p>
      <SaveBar busy={busy} disabled={!ok} saveLabel={t('Plant {n}', { n: n0(qty) })} onCancel={onBack} onSave={go} />
    </Sheet>
  )
}

/** 337 Split: a new METRC package (its own tag) off this one, for a use. Goes to METRC right away. */
function SplitSheet({ d, c, b, api, flash, onBack, onDone }: { d: NData; c: NCtx; b: Batch; api: NurseryApi; flash: Flash; onBack: () => void; onDone: (m: string) => Promise<void> }) {
  const left = c.left(b)
  const [qty, setQty] = useState<number | null>(null)
  const [use, setUse] = useState<NUse | null>(null)
  const [ref, setRef] = useState<number | null>(null)
  const [tag, setTag] = useState('')
  const [on, setOn] = useState<string | null>(today())
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    try { await api.split(b.id, qty!, use!, ref, tag.trim().toUpperCase(), on); await onDone(t('{n} {strain} split onto …{tag} for {use}', { n: n0(qty), strain: b.strain, tag: tag.slice(-6), use: t(USE_LABEL[use!]) })) }
    catch (e) { flash(String((e as Error).message ?? e), true) } finally { setBusy(false) }
  }
  const ok = (qty ?? 0) > 0 && (qty ?? 0) <= left && use && tag.trim() && (use !== 'receivers' || ref != null)
  return (
    <Sheet side title={t('Split {strain}', { strain: b.strain })} sub={`…${(b.package_tag ?? '').slice(-6)} · ${t('{n} plants left', { n: n0(left) })} · ${t('new package, same item')}`} onClose={onBack}>
      <div className="grid3">
        <F label={t('Plants')}><NumIn value={qty} onChange={setQty} autoFocus /></F>
        <F label={t('For')}><Pick value={use} blank="—" options={USES.map(x => ({ v: x, l: t(USE_LABEL[x]) }))} onChange={v => { setUse(v as NUse | null); setRef(null) }} /></F>
        {use === 'receivers' && <F label={t('Pollination run')}><Pick value={ref} blank="—" options={openRuns(d).map(x => ({ v: x.id, l: x.name }))} onChange={setRef} /></F>}
        {use === 'donors' && <F label={t('Donor batch')} hint={t('(optional)')}><Pick value={ref} blank="—" options={d.donorBatches.filter(x => !x.strains || strainKey(x.strains) === strainKey(b.strain)).map(x => ({ v: x.id, l: `${x.strains ?? ''} · ${x.label} · ${x.project}` }))} onChange={setRef} /></F>}
        <F label={t('Split on')}><DateIn value={on} onChange={setOn} /></F>
      </div>
      <F label={t('New package tag (the one in your hand)')}><div className="row"><TagInput value={tag} onChange={setTag} where={{ site: b.site, type: 'package' }} disabled={busy} />
        <button type="button" className="ghost small" onClick={async () => { const x = (await api.nextTags(b.site, 1, 'package'))[0]; if (x) setTag(x) }}>{t('Next tag')}</button></div></F>
      <p className="muted small-note">{t('Goes to METRC right away: a new clone package from …{tag}.', { tag: (b.package_tag ?? '').slice(-6) })}</p>
      <SaveBar busy={busy} disabled={!ok} saveLabel={t('Split {n}', { n: n0(qty) })} onCancel={onBack} onSave={go} />
    </Sheet>
  )
}
