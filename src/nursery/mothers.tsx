import { MTag } from '../mtag'
import { Fragment, useState } from 'react'
import { TagInput } from '../taginput'
import type { NurseryApi } from './api'
import type { NCtx } from './calc'
import { GEN_LABEL, GEN_WHAT, fmtD, live, n0, strainKey, sum, today } from './calc'
import type { Mother, NData } from './types'
import { DateIn, F, NumIn, Pick, SaveBar, SelAll, SelBar, SelBox, SelButton, Sheet, StrainList, TextIn, useSel } from '../cult/ui'
import type { Flash } from '../cult/ui'
import { t, tn } from '../i18n'
import { useSaved } from '../saved'
import { LifeCycle, UpPotSheet, potText, potsReady, upMother } from './pots'
import type { UpItem } from './pots'

const where = (c: NCtx, m: Mother) => [c.room(m.room_id), m.bed].filter(Boolean).join(' · ')
const nextSeason = () => { const d = new Date(); return d.getFullYear() + (d.getMonth() >= 6 ? 1 : 0) }

/** Nursery > Mothers: mother lots (one METRC tag, a count) by generation */
export function MothersTab({ d, c, q, api, flash, onSaved, onOpen, onAdd }: {
  d: NData; c: NCtx; q: string; api: NurseryApi; flash: Flash; onSaved: (m: string) => Promise<void>; onOpen: (m: Mother) => void; onAdd: (v?: Partial<Mother>) => void
}) {
  const [f, setF] = useSaved<'active' | 'gone' | 'all'>('nursery.mothers.MothersTab.f', 'active')
  const [gen, setGen] = useState<0 | 1 | 2 | 3>(0)
  const sel = useSel()
  const [up, setUp] = useState<UpItem[] | null>(null)   // POT-2: bulk up pot from the picked lots
  const ql = q.trim().toLowerCase()
  const rows = d.mothers.filter(m => (f === 'all' || (f === 'active' ? m.status === 'active' : m.status !== 'active')) && (!gen || m.gen === gen) &&
    (!ql || `${m.strain} ${m.plant_tag ?? ''} ${c.room(m.room_id)} ${m.notes ?? ''}`.toLowerCase().includes(ql)))
    .sort((a, b) => a.gen - b.gen || a.strain.localeCompare(b.strain) || (a.room_id ?? 0) - (b.room_id ?? 0))
  const groups = new Map<string, Mother[]>()
  for (const m of rows) { const k = `${m.gen}|${strainKey(m.strain)}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(m) }
  const active = d.mothers.filter(m => m.status === 'active')
  const byGen = (g: number) => sum(active.filter(m => m.gen === g).map(live))
  const bulk = (v: Partial<Mother>, msg: string) => async (ids: number[]) => {
    try { await api.updateMany('nursery_mothers', ids, v); await onSaved(`${ids.length} ${t(msg)}`) } catch (e) { flash(String((e as Error).message ?? e), true) }
  }
  return <>
    <div className="row toolbar between">
      <div className="row wrap">
        <div className="seg">{([[0, `${t('All')} (${n0(sum(active.map(live)))})`], [1, `G1 (${n0(byGen(1))})`], [2, `G2 (${n0(byGen(2))})`], [3, `G3 (${n0(byGen(3))})`]] as const)
          .map(([k, l]) => <button key={k} className={gen === k ? 'on' : ''} onClick={() => setGen(k)}>{l}</button>)}</div>
        <div className="seg">{([['active', 'Active'], ['gone', 'Retired / destroyed'], ['all', 'All']] as const).map(([k, l]) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{t(l)}</button>)}</div>
      </div>
      <div className="row"><SelButton sel={sel} /><button className="primary" onClick={() => onAdd(gen ? { gen } : undefined)}>{t('+ Mother lot')}</button></div>
    </div>
    <p className="muted small-note">{t('A lot is one METRC tag with a count of plants, by strain, generation and location (a bench, or a hoop and bed). G3 lots usually come from planting out a G3 batch.')}</p>
    {!rows.length ? <p className="muted">{t('No mother lots here yet.')}</p> : <div className="cwrap"><table className="ctable">
      <thead><tr><SelAll sel={sel} ids={rows.map(m => m.id)} /><th>{t('Location')}</th><th className="num">{t('Plants')}</th>{potsReady(d) && <th>{t('Pot')}</th>}<th>{t('METRC tag')}</th><th>{t('Planted')}</th><th className="num hide-s">{t('Cuts/plant')}</th><th className="hide-s">{t('Season')}</th><th>{t('Status')}</th></tr></thead>
      <tbody>{[...groups.values()].map(ms => <Fragment key={`${ms[0].gen}${ms[0].strain}`}>
        <tr className="wk"><td colSpan={(sel.on ? 8 : 7) + (potsReady(d) ? 1 : 0)}><span className="row between"><span><span className={`gpill g${ms[0].gen}`}>{GEN_LABEL[ms[0].gen]}</span> {ms[0].strain} · {tn(sum(ms.map(live)), '{n} plant', '{n} plants')} {t('in')} {tn(ms.length, '{n} lot', '{n} lots')}</span>
          <button className="linkbtn" onClick={() => onAdd({ strain: ms[0].strain, gen: ms[0].gen, season: ms[0].season })}>{t('+ lot')}</button></span></td></tr>
        {ms.map(m => <tr key={m.id} className={`tap ${m.status !== 'active' ? 'done' : ''}`} onClick={() => sel.on ? sel.toggle(m.id) : onOpen(m)}>
          <SelBox sel={sel} id={m.id} /><td>{where(c, m) || <span className="muted">—</span>}{m.source && m.source !== 'Internal' ? <span className="muted small"> · {m.source}</span> : ''}</td>
          <td className="num">{n0(live(m) || m.qty)}{m.lost ? <span className="muted"> ({t('{n} lost', { n: n0(m.lost) })})</span> : ''}</td>
          {potsReady(d) && <td className="small nowrap">{potText(d, m, live(m)) || (m.pot ? <span className="muted">{m.pot}</span> : '')}</td>}
          <td className="small">{m.plant_tag ? <MTag t={m.plant_tag} n={10} /> : <span className="warn-t">{t('no tag')}</span>}</td>
          <td className="nowrap">{fmtD(m.started_on)}</td><td className="num hide-s">{m.cuts_per_plant ?? ''}</td><td className="hide-s">{m.season ?? ''}</td>
          <td>{m.status === 'active' ? t('Active') : `${t(m.status === 'retired' ? 'Retired' : 'Destroyed')} ${fmtD(m.ended_on)}`}</td></tr>)}
      </Fragment>)}</tbody>
    </table></div>}
    <SelBar sel={sel} noun={t('lot')} actions={[
      ...(potsReady(d) ? [{ label: t('Up pot…'), run: async (ids: number[]) => { setUp(d.mothers.filter(m => ids.includes(m.id) && m.status === 'active' && live(m) > (m.up_n ?? 0)).map(m => upMother(m))) } }] : []),
      { label: t('Retire'), run: bulk({ status: 'retired', ended_on: today() }, 'retired') },
      { label: t('Destroyed'), danger: true, run: bulk({ status: 'destroyed', ended_on: today() }, 'marked destroyed') },
    ]} />
    {up && (up.length ? <UpPotSheet sb={api.sb} d={d} items={up} title={t('Up pot {n} lots', { n: up.length })} flash={flash} onClose={() => setUp(null)} onDone={async m => { setUp(null); await onSaved(m) }} />
      : (setTimeout(() => { setUp(null); flash(t('Nothing left to up-pot in the picked lots'), true) }), null))}
  </>
}

/** add or change a mother lot */
export function MotherSheet({ d, c, m: m0, api, flash, onClose, onSaved }: { d: NData; c: NCtx; m: Partial<Mother>; api: NurseryApi; flash: Flash; onClose: () => void; onSaved: (msg: string) => Promise<void> }) {
  const isNew = !m0.id
  const site = d.sites[0]?.code ?? '1PN'
  const [x, setX] = useState<Partial<Mother>>(() => ({ site, gen: 2, qty: 1, lost: 0, status: 'active', started_on: today(), season: nextSeason(), ...m0 }))
  const [busy, setBusy] = useState(false)
  const [loss, setLoss] = useState<number | null>(null)
  const [tab, setTab] = useState<'details' | 'life'>('details')   // POT-2: side cards use tabs
  const [up, setUp] = useState(false)
  const set = (v: Partial<Mother>) => setX(s => ({ ...s, ...v }))
  const room = d.rooms.find(r => r.id === x.room_id)
  const run = async (f: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try { await f(); onClose(); await onSaved(ok) } catch (e) { flash(String((e as Error).message ?? e).replace(/duplicate key.*plant_tag.*/, t('That tag is already on another mother lot')), true) } finally { setBusy(false) }
  }
  const fillTag = async () => { const tag = (await api.nextTags(x.site ?? site, 1))[0]; if (tag) set({ plant_tag: tag }); else flash(t('No plant tags loaded for this nursery yet.'), true) }
  const locs = d.rooms.filter(r => (r.active || r.id === x.room_id) && r.kind !== 'trailer')
  const canUp = !isNew && m0.status === 'active' && potsReady(d) && live(m0 as Mother) > (m0.up_n ?? 0)
  if (up && m0.id) return <UpPotSheet sb={api.sb} d={d} items={[upMother(m0 as Mother)]} title={t('Up pot {strain}', { strain: m0.strain })} flash={flash} onClose={() => setUp(false)} onDone={async m => { setUp(false); onClose(); await onSaved(m) }} />
  return (
    <Sheet side title={isNew ? t('New mother lot') : `${m0.strain} · ${GEN_LABEL[m0.gen ?? 2]}`} sub={isNew ? t('One METRC tag, a count of plants') : `${where(c, m0 as Mother) || t('no location')} · ${t('{n} plants', { n: n0(live(m0 as Mother)) })}`} onClose={onClose}>
      {!isNew && <div className="row wrap between docact">
        <div className="seg ptabs">{([['details', 'Details'], ['life', 'Life cycle']] as const).map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(l)}</button>)}</div>
        {canUp && <button className="primary" onClick={() => setUp(true)}>{m0.up_n ? t('Up pot the rest…') : t('Up pot…')}</button>}</div>}
      {!isNew && potsReady(d) && <p className="small-note">{t('In')} <b>{potText(d, m0, live(m0 as Mother)) || t('no pot set')}</b>{m0.up_n ? <span className="muted"> · {t('part of the lot was up-potted; do the rest when it\'s done')}</span> : ''}</p>}
      {tab === 'life' && !isNew ? <LifeCycle sb={api.sb} d={d} c={c} kind="mother" lot={m0 as Mother} batch={d.batches.find(b => b.id === m0.batch_id)} /> : <>
      <F label={t('Strain')}><TextIn value={x.strain} list="n-strains" onChange={v => set({ strain: v ?? '' })} autoFocus={isNew && !m0.strain} /></F>
      <StrainList id="n-strains" names={d.strains} />
      <datalist id="n-sources">{['Internal', 'TC', 'HVN', 'Seed', 'Pheno hunt'].map(v => <option key={v} value={v} />)}</datalist>
      <div className="grid3">
        <F label={t('Generation')}><Pick value={x.gen} options={[1, 2, 3].map(g => ({ v: g as 1 | 2 | 3, l: t(GEN_WHAT[g]) }))} onChange={v => set({ gen: v ?? 2 })} /></F>
        <F label={t('For season')} hint={t('(crop year)')}><NumIn value={x.season} onChange={v => set({ season: v })} /></F>
        <F label={t('Plants')}><NumIn value={x.qty} onChange={v => set({ qty: v ?? 0 })} /></F>
        <F label={t('Location')}><Pick value={x.room_id} blank="—" options={locs.map(r => ({ v: r.id, l: `${r.name}${r.place !== 'Webb' ? ` (${r.place})` : ''}` }))} onChange={v => set({ room_id: v, bed: null })} /></F>
        {room?.kind === 'hoop' ? <F label={t('Bed')}><Pick value={x.bed} blank="—" options={(room.beds.length ? room.beds.map(b => b.bed) : ['A', 'B', 'C']).map(b => ({ v: b, l: b }))} onChange={v => set({ bed: v })} /></F>
          : !potsReady(d) ? <F label={t('Pot')}><TextIn value={x.pot} placeholder='4", 1G, 10L' onChange={v => set({ pot: v })} /></F> : null}
        {potsReady(d) && isNew && <F label={t('Pot')}><Pick value={x.container_id} blank="—" options={d.containers.filter(z => z.kind === 'pot' && z.active).map(z => ({ v: z.id, l: z.name }))} onChange={v => set({ container_id: v })} /></F>}
        <F label={t('Planted')}><DateIn value={x.started_on} onChange={v => set({ started_on: v })} /></F>
        <F label={t('Source')}><TextIn value={x.source} list="n-sources" onChange={v => set({ source: v })} placeholder={t('Internal, TC, HVN, seed')} /></F>
        <F label={t('Cuts per plant')} hint={t('(estimate)')}><NumIn value={x.cuts_per_plant} onChange={v => set({ cuts_per_plant: v })} /></F>
        <F label={t('Status')}><Pick value={x.status} options={[{ v: 'active', l: t('Active') }, { v: 'retired', l: t('Retired') }, { v: 'destroyed', l: t('Destroyed') }]}
          onChange={v => set({ status: v ?? 'active', ended_on: v && v !== 'active' ? x.ended_on ?? today() : null })} /></F>
        {x.status !== 'active' && <F label={t('Since')}><DateIn value={x.ended_on} onChange={v => set({ ended_on: v })} /></F>}
      </div>
      {!isNew && m0.status === 'active' && m0.plant_tag && x.room_id !== m0.room_id && x.room_id != null && <p className="small-note warn-t">{t('Saving moves this lot in METRC too (change of location), unless both places are the same METRC location.')}</p>}
      <F label={t('METRC plant tag')}><div className="row"><TagInput value={x.plant_tag ?? ''} onChange={v => set({ plant_tag: v || null })} where={{ site: x.site ?? site, type: 'plant' }} keep={m0.plant_tag ?? null} disabled={busy} />
        <button type="button" className="ghost small" onClick={fillTag} disabled={busy}>{t('Next tag')}</button></div></F>
      <F label={t('Notes')}><TextIn value={x.notes} onChange={v => set({ notes: v })} /></F>
      {!isNew && m0.status === 'active' && <div className="row lossrow">
        <span className="muted">{m0.lost ? t('{n} lost so far.', { n: n0(m0.lost) }) : t('Plants died or culled?')}</span>
        <NumIn value={loss} onChange={setLoss} placeholder={t('How many')} />
        <button className="ghost small" disabled={busy || !loss || loss > live(m0 as Mother)} onClick={() => run(() => api.save<Mother>('nursery_mothers', { id: m0.id, lost: (m0.lost ?? 0) + loss! }), t('{n} lost', { n: n0(loss) }))}>{t('Record loss')}</button>
      </div>}
      <SaveBar busy={busy} disabled={!x.strain?.trim() || !(Number(x.qty) > 0)} saveLabel={isNew ? 'Add lot' : 'Save'} onCancel={onClose}
        onSave={() => run(() => api.save<Mother>('nursery_mothers', { id: x.id, site: x.site ?? site, strain: x.strain!.trim(), gen: x.gen, season: x.season, qty: x.qty, room_id: x.room_id ?? null,
          bed: x.bed ?? null, pot: x.pot ?? null, source: x.source ?? null, plant_tag: x.plant_tag || null, started_on: x.started_on ?? null, cuts_per_plant: x.cuts_per_plant ?? null,
          status: x.status, ended_on: x.ended_on ?? null, notes: x.notes ?? null, ...(potsReady(d) && isNew ? { container_id: x.container_id ?? null } : {}) }), isNew ? t('{strain} {gen} lot added', { strain: x.strain, gen: GEN_LABEL[x.gen ?? 2] }) : t('Saved'))}
        onDelete={!isNew ? () => run(() => api.remove('nursery_mothers', m0.id!), t('Removed (entered by mistake)')) : undefined} />
      </>}
    </Sheet>
  )
}
