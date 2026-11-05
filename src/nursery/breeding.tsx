import { TagInput } from '../taginput'
import { useBack } from '../nav'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { NCtx } from './calc'
import { GEN_LABEL, fmtD, live, n0, strainKey, sum, today } from './calc'
import type { NData } from './types'
import { DateIn, F, NumIn, Pick, SaveBar, Sheet, StrainList, TextIn } from '../cult/ui'
import type { Flash } from '../cult/ui'
import { t, tn } from '../i18n'
import { pageAll } from '../pageAll'

// Breeding: pollination runs (one donor x many receivers per trailer), seed lots, pheno hunts with group scoring, keepers.
interface Run {
  id: number; site: string; season: number; name: string; project: string | null; room_id: number | null; donor_strain: string | null; donor_mother_id: number | null; donor_room_id: number | null; donor_batch_id: number | null
  donor_plants: number | null; donors_cut_on: string | null; donors_flip_on: string | null; receivers_cut_on: string | null; receivers_planted_on: string | null
  flip_on: string | null; pollinated_on: string | null; harvested_on: string | null; status: string; notes: string | null
}
interface Receiver { id?: number; run_id?: number; strain: string; mother_id: number | null; batch_id: number | null; plants: number; plant_tag: string | null; notes: string | null; _del?: boolean }
interface SeedLot {
  id: number; code: string | null; mother_strain: string | null; father_strain: string | null; run_id: number | null; receiver_id: number | null; source: string; breeder: string | null
  harvested_on: string | null; seeds: number | null; germ_pct: number | null; notes: string | null
  season: number | null; target_plants: number | null; sown: number | null; sown_on: string | null
}
interface Hunt { id: number; site: string; season: number; name: string; seed_lot_id: number | null; sown_on: string | null; planted_on: string | null; seeds_sown: number | null; germinated: number | null; room_id: number | null; status: string; notes: string | null }
interface Pheno {
  id: number; hunt_id: number; seed_lot_id: number | null; number: number; label: string | null; plant_tag: string | null; lot_tag: string | null; room_id: number | null; bed: string | null
  status: string; keeper_strain: string | null; notes: string | null; planted_on: string | null; cut_on: string | null; cut_qty: number | null; cull_reason: string | null; culled_on: string | null
}
interface Obs { id: number; pheno_id: number; stage: string; observed_on: string; traits: Record<string, string | number | null>; notes: string | null; observer: string | null }
interface DonorBatch { id: number; project: string; label: string; strains: string | null; plants: number | null; cut_on: string | null; room_id: number | null; to_room_on: string | null; move_in_on: string | null; notes: string | null }
interface Score { id: number; pheno_id: number; scorer: string; scored_on: string; vigor: number | null; structure: number | null; aroma: number | null; color: number | null; tackiness: number | null; jar: number | null; notes: string | null }
interface BData { runs: Run[]; receivers: Receiver[]; seeds: SeedLot[]; hunts: Hunt[]; phenos: Pheno[]; scores: Score[]; obs: Obs[]; donors: DonorBatch[] }

const TRAITS = [['vigor', 'Vigor'], ['structure', 'Structure'], ['aroma', 'Aroma'], ['color', 'Color'], ['tackiness', 'Tackiness'], ['jar', 'Jar test']] as const
type Trait = typeof TRAITS[number][0]
const RUN_STATUS = ['planned', 'growing', 'flowering', 'pollinated', 'harvested', 'done', 'cancelled']
const PSTATUS: Record<string, string> = { growing: 'Growing', maybe: 'Maybe', keeper: 'Keeper', culled: 'Culled', male: 'Male' }
const CULL_REASONS = ['Hermaphroditism', 'Male', 'Genetic Abnormality', 'Excessive Stretch', 'Poor Structure', 'Stunted Growth', 'Disease Susceptibility', 'Pest Susceptibility', 'Poor Stress Tolerance', 'Low Resin Production', 'Selection Redundancy']
type ObsField = { k: string; l: string; kind: 'rate' | 'num' | 'text'; unit?: string }
const OBS: { stage: string; l: string; fields: ObsField[] }[] = [
  { stage: 'preflip', l: 'Pre-flip', fields: [{ k: 'type', l: 'Type', kind: 'text' }, { k: 'height', l: 'Height average', kind: 'num', unit: 'in' }, { k: 'leaf_density', l: 'Leaf density', kind: 'rate' },
    { k: 'internode', l: 'Internodal spacing', kind: 'rate' }, { k: 'vigor', l: 'Vigor', kind: 'rate' }, { k: 'impression', l: 'Visual impression', kind: 'rate' }, { k: 'branching', l: 'Branching', kind: 'rate' },
    { k: 'canopy_shape', l: 'Canopy shape', kind: 'text' }, { k: 'trainability', l: 'Trainability', kind: 'rate' }, { k: 'sex', l: 'Sex expression', kind: 'text' }] },
  { stage: 'midflower', l: 'Mid flower', fields: [{ k: 'stretch_pct', l: 'Stretch factor', kind: 'num', unit: '%' }, { k: 'bud_formation', l: 'Bud formation', kind: 'rate' }, { k: 'resin_onset', l: 'Resin onset', kind: 'rate' }, { k: 'aroma', l: 'Aroma', kind: 'rate' }] },
  { stage: 'lateflower', l: 'Late flower', fields: [{ k: 'canopy_density', l: 'Canopy density', kind: 'rate' }, { k: 'bud_density', l: 'Bud density', kind: 'rate' }, { k: 'resin_coverage', l: 'Resin coverage', kind: 'rate' },
    { k: 'aroma', l: 'Aroma', kind: 'rate' }, { k: 'maturity', l: 'Maturity', kind: 'rate' }, { k: 'fade', l: 'Fade / health', kind: 'rate' },
    { k: 'ft_avg', l: 'Flower time left, average', kind: 'num', unit: 'days' }, { k: 'ft_low', l: 'Flower time left, low', kind: 'num', unit: 'days' }, { k: 'ft_high', l: 'Flower time left, high', kind: 'num', unit: 'days' }] },
]
const SHOW = 300
const who = (e: string) => e.split('@')[0]
const cap = (s: string) => t(s[0].toUpperCase() + s.slice(1))
const cross = (s: SeedLot) => [s.mother_strain, s.father_strain].filter(Boolean).join(' x ') || s.code || `Lot ${s.id}`
const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
const f1 = (x: number | null) => (x == null ? '' : x.toFixed(1))

export function BreedingTab({ sb, d, c, flash, me }: { sb: SupabaseClient; d: NData; c: NCtx; flash: Flash; me: string }) {
  const [tab, setTab] = useState<'runs' | 'seeds' | 'hunts'>('runs')
  const [b, setB] = useState<BData | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [run, setRun] = useState<Partial<Run> | null>(null)
  const [lot, setLot] = useState<Partial<SeedLot> | null>(null)
  const [hunt, setHunt] = useState<Partial<Hunt> | null>(null)
  const [huntView, setHuntView] = useState<number | null>(null)
  const [donor, setDonor] = useState<Partial<DonorBatch> | null>(null)
  useBack(huntView != null, () => setHuntView(null))
  const load = useCallback(async () => {
    const r = await Promise.all(['breed_runs', 'breed_receivers', 'seed_lots', 'pheno_hunts', 'phenos', 'pheno_scores', 'pheno_obs', 'breed_donor_batches'].map(t => pageAll((a, z) => sb.from(t).select('*').order('id').range(a, z))))
    const bad = r.find(x => x.error)
    if (bad?.error) { setErr(/breed_|seed_lots|pheno/.test(bad.error.message) ? t('Breeding needs 191_breeding_phenohunt.sql run in Supabase.') : bad.error.message); return }
    const [runs, receivers, seeds, hunts, phenos, scores, obs, donors] = r.map(x => x.data ?? [])
    setB({ runs: runs as Run[], receivers: receivers as Receiver[], seeds: seeds as SeedLot[], hunts: hunts as Hunt[], phenos: phenos as Pheno[], scores: scores as Score[], obs: obs as Obs[], donors: donors as DonorBatch[] }); setErr(null)
  }, [sb])
  useEffect(() => { load() }, [load])
  const saved = async (m: string) => { await load(); flash(t(m)) }
  if (err) return <div className="warnbox">{err}</div>
  if (!b) return <p className="muted">{t('Loading…')}</p>
  if (huntView != null) { const h = b.hunts.find(x => x.id === huntView); if (h) return <HuntView sb={sb} d={d} c={c} b={b} h={h} me={me} flash={flash} onBack={() => setHuntView(null)} onSaved={saved} onEdit={() => setHunt(h)} /> }
  const sown = (s: SeedLot) => s.sown ?? sum(b.hunts.filter(h => h.seed_lot_id === s.id).map(h => h.seeds_sown ?? 0))
  const lotPhenos = (id: number) => b.phenos.filter(p => p.seed_lot_id === id || (p.seed_lot_id == null && b.hunts.find(h => h.id === p.hunt_id)?.seed_lot_id === id))
  const projects = [...new Set(b.runs.map(r => r.project).filter((x): x is string => !!x))]
  return <>
    <div className="row toolbar between">
      <div className="seg">{([['runs', 'Pollination runs'], ['seeds', 'Seed lots'], ['hunts', 'Pheno hunts']] as const).map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(l)}</button>)}</div>
      {tab === 'runs' && <button className="primary" onClick={() => setRun({ season: new Date().getFullYear(), status: 'planned', room_id: d.rooms.find(r => r.name === 'Trailer 1')?.id ?? null, donor_room_id: d.rooms.find(r => r.name === 'Trailer 3')?.id ?? null })}>{t('+ Pollination run')}</button>}
      {tab === 'seeds' && <button className="primary" onClick={() => setLot({ source: 'breeder' })}>{t('+ Seed lot')}</button>}
      {tab === 'hunts' && <button className="primary" onClick={() => setHunt({ season: new Date().getFullYear(), status: 'sown', sown_on: today() })}>{t('+ Pheno hunt')}</button>}
    </div>
    {tab === 'runs' && <>
      <p className="muted small-note">{t('One run = one trailer: one donor (pollen) variety and as many receiver varieties as you put in. Donors start and flower separately (Trailer 3).')}</p>
      {!b.runs.length ? <p className="muted">{t('No pollination runs yet.')}</p> : [...projects, null].map(pj => { const rr = b.runs.filter(r => (r.project ?? null) === pj); if (!rr.length) return null
        const dbs = pj ? b.donors.filter(x => x.project === pj) : []
        return <Fragment key={pj ?? '-'}>
        {pj && <h3 className="row between"><span>{pj}</span><button className="ghost small" onClick={() => setDonor({ project: pj, room_id: d.rooms.find(r => r.name === 'Trailer 3')?.id ?? null })}>{t('+ Donor batch')}</button></h3>}
        <div className="cwrap"><table className="ctable">
        <thead><tr><th>{t('Season')}</th><th>{t('Run')}</th><th>{t('Trailer')}</th><th>{t('Donor')}</th><th className="num">{t('Receivers')}</th><th className="num">{t('Plants')}</th><th>{t('Flipped')}</th><th>{t('Pollinated')}</th><th>{t('Seeds harvested')}</th><th className="num">{t('Seeds')}</th><th>{t('Status')}</th></tr></thead>
        <tbody>{[...rr].sort((x, y) => y.season - x.season || y.id - x.id).map(r => { const rs = b.receivers.filter(z => z.run_id === r.id); const sl = b.seeds.filter(s => s.run_id === r.id)
          return <tr key={r.id} className={`tap ${r.status === 'cancelled' ? 'cancelled' : ''}`} onClick={() => setRun(r)}><td>{r.season}</td><td><b>{r.name}</b></td><td>{c.room(r.room_id) || <span className="muted">{t('not set')}</span>}</td><td>{r.donor_strain ?? '—'}</td>
            <td className="num">{rs.length}</td><td className="num">{n0(sum(rs.map(z => z.plants)))}</td><td className="nowrap">{fmtD(r.flip_on)}</td><td className="nowrap">{fmtD(r.pollinated_on)}</td>
            <td className="nowrap">{fmtD(r.harvested_on)}</td><td className="num">{sl.length ? n0(sum(sl.map(s => s.seeds ?? 0))) : ''}</td><td><span className="pill">{cap(r.status)}</span></td></tr> })}</tbody>
      </table></div>
        {dbs.length > 0 && <div className="cwrap tight"><table className="ctable">
          <thead><tr><th>{t('Donor batch')}</th><th>{t('Donors')}</th><th className="num">{t('Plants')}</th><th>{t('Cut')}</th><th>{t('Flower in')}</th><th>{t('Transplant')}</th><th>{t('Into receiver trailers')}</th></tr></thead>
          <tbody>{[...dbs].sort((x, y) => x.label.localeCompare(y.label)).map(x => <tr key={x.id} className="tap" onClick={() => setDonor(x)}><td><b>{x.label}</b></td><td>{x.strains}</td><td className="num">{n0(x.plants)}</td>
            <td className="nowrap">{fmtD(x.cut_on)}</td><td>{c.room(x.room_id)}</td><td className="nowrap">{fmtD(x.to_room_on)}</td><td className="nowrap">{fmtD(x.move_in_on)}</td></tr>)}</tbody>
        </table></div>}
        </Fragment> })}
    </>}
    {tab === 'seeds' && (!b.seeds.length ? <p className="muted">{t('No seed lots yet. They come from harvesting a run\'s receivers, or add bought or traded seeds.')}</p> : <div className="cwrap"><table className="ctable">
      <thead><tr><th>{t('Code')}</th><th>{t('Cross (seed parent x pollen)')}</th><th>{t('Source')}</th><th>{t('Season')}</th><th className="num">{t('Seeds')}</th><th className="num">{t('Plants wanted')}</th><th className="num">{t('Sown')}</th><th>{t('Sown on')}</th><th className="num">{t('Phenos')}</th><th className="num">{t('Alive')}</th><th className="num">{t('Left')}</th><th /></tr></thead>
      <tbody>{[...b.seeds].sort((x, y) => (y.season ?? 0) - (x.season ?? 0) || (x.breeder ?? '').localeCompare(y.breeder ?? '') || cross(x).localeCompare(cross(y))).map(s => { const ps = lotPhenos(s.id); return (
        <tr key={s.id} className="tap" onClick={() => setLot(s)}><td><b>{s.code}</b></td><td>{cross(s)}</td><td>{s.source === 'in-house' ? (b.runs.find(r => r.id === s.run_id)?.name ?? t('Lifted (in house)')) : s.breeder ?? cap(s.source)}</td>
          <td>{s.season ?? ''}</td><td className="num">{n0(s.seeds)}</td><td className="num">{n0(s.target_plants)}</td><td className="num">{n0(sown(s)) || ''}</td><td className="nowrap">{fmtD(s.sown_on)}</td>
          <td className="num">{ps.length || ''}</td><td className="num">{ps.length ? n0(ps.filter(p => p.status !== 'culled' && p.status !== 'male').length) : ''}</td><td className="num">{s.seeds != null ? n0(s.seeds - sown(s)) : ''}</td>
          <td><button className="ghost small" onClick={e => { e.stopPropagation(); setHunt({ season: new Date().getFullYear(), status: 'sown', sown_on: today(), seed_lot_id: s.id, name: `${s.code ?? cross(s)} hunt` }) }}>{t('Hunt…')}</button></td></tr>) })}</tbody>
    </table></div>)}
    {tab === 'hunts' && (!b.hunts.length ? <p className="muted">{t('No pheno hunts yet. Start one from a seed lot.')}</p> : <div className="cwrap"><table className="ctable">
      <thead><tr><th>{t('Season')}</th><th>{t('Hunt')}</th><th>{t('Cross')}</th><th>{t('Sown')}</th><th className="num">{t('Seeds')}</th><th className="num">{t('Up')}</th><th className="num">{t('Phenos')}</th><th className="num">{t('Scored')}</th><th className="num">{t('Keepers')}</th><th>{t('Status')}</th></tr></thead>
      <tbody>{[...b.hunts].sort((x, y) => y.season - x.season || y.id - x.id).map(h => { const ps = b.phenos.filter(p => p.hunt_id === h.id); const s = b.seeds.find(z => z.id === h.seed_lot_id)
        return <tr key={h.id} className="tap" onClick={() => setHuntView(h.id)}><td>{h.season}</td><td><b>{h.name}</b></td><td>{s ? cross(s) : ''}</td><td className="nowrap">{fmtD(h.sown_on)}</td>
          <td className="num">{n0(h.seeds_sown)}</td><td className="num">{n0(h.germinated)}</td><td className="num">{ps.length}</td>
          <td className="num">{ps.filter(p => b.scores.some(z => z.pheno_id === p.id)).length}</td><td className="num">{ps.filter(p => p.status === 'keeper').length || ''}</td><td><span className="pill">{cap(h.status)}</span></td></tr> })}</tbody>
    </table></div>)}
    {run && <RunSheet sb={sb} d={d} c={c} b={b} r0={run} flash={flash} onClose={() => setRun(null)} onSaved={saved} />}
    {lot && <SeedSheet sb={sb} d={d} s0={lot} flash={flash} onClose={() => setLot(null)} onSaved={saved} />}
    {donor && <DonorSheet sb={sb} d={d} x0={donor} flash={flash} onClose={() => setDonor(null)} onSaved={saved} />}
    {hunt && <HuntSheet sb={sb} d={d} b={b} h0={hunt} flash={flash} onClose={() => setHunt(null)} onSaved={async (m, id) => { await saved(m); if (id) setHuntView(id) }} />}
  </>
}

function RunSheet({ sb, d, c, b, r0, flash, onClose, onSaved }: { sb: SupabaseClient; d: NData; c: NCtx; b: BData; r0: Partial<Run>; flash: Flash; onClose: () => void; onSaved: (m: string) => Promise<void> }) {
  const [x, setX] = useState<Partial<Run>>(r0)
  const [recs, setRecs] = useState<Receiver[]>(() => b.receivers.filter(z => z.run_id === r0.id))
  const [busy, setBusy] = useState(false)
  const [pick, setPick] = useState(false)
  const set = (v: Partial<Run>) => setX(s => ({ ...s, ...v }))
  const trailers = d.rooms.filter(r => r.kind === 'trailer' && (r.active || r.id === x.room_id || r.id === x.donor_room_id))
  const donorLots = d.mothers.filter(m => m.status === 'active' && x.donor_strain && strainKey(m.strain) === strainKey(x.donor_strain))
  const donorBatches = d.batches.filter(z => x.donor_strain && strainKey(z.strain) === strainKey(x.donor_strain) && (z.stage === 'rooting' || z.stage === 'ready' || z.id === x.donor_batch_id))
  const seedsFor = (id?: number) => b.seeds.find(s => s.receiver_id === id)
  const shown = recs.filter(z => !z._del)
  async function save() {
    setBusy(true)
    try {
      const row = { site: d.sites[0]?.code ?? '1PN', season: x.season, name: x.name!.trim(), project: x.project?.trim() || null, room_id: x.room_id ?? null, donor_strain: x.donor_strain?.trim() || null, donor_mother_id: x.donor_mother_id ?? null, donor_batch_id: x.donor_batch_id ?? null,
        donor_room_id: x.donor_room_id ?? null, donor_plants: x.donor_plants ?? null, donors_cut_on: x.donors_cut_on ?? null, donors_flip_on: x.donors_flip_on ?? null,
        receivers_cut_on: x.receivers_cut_on ?? null, receivers_planted_on: x.receivers_planted_on ?? null, flip_on: x.flip_on ?? null, pollinated_on: x.pollinated_on ?? null,
        harvested_on: x.harvested_on ?? null, status: x.status ?? 'planned', notes: x.notes ?? null }
      let id = x.id
      if (id) { const { error } = await sb.from('breed_runs').update(row).eq('id', id); if (error) throw error }
      else { const { data, error } = await sb.from('breed_runs').insert(row).select('id').single(); if (error) throw error; id = data.id }
      const del = recs.filter(z => z._del && z.id).map(z => z.id!)
      if (del.length) { const { error } = await sb.from('breed_receivers').delete().in('id', del); if (error) throw error }
      for (const z of recs.filter(z => !z._del)) {
        const v = { run_id: id, strain: z.strain, mother_id: z.mother_id, batch_id: z.batch_id ?? null, plants: z.plants, plant_tag: z.plant_tag || null, notes: z.notes || null }
        const { error } = z.id ? await sb.from('breed_receivers').update(v).eq('id', z.id) : await sb.from('breed_receivers').insert(v)
        if (error) throw error
      }
      onClose(); await onSaved(x.id ? 'Run saved' : t('{name} added with {n} receivers', { name: x.name, n: shown.length }))
    } catch (e) { flash(String((e as { message?: string }).message ?? e), true) } finally { setBusy(false) }
  }
  async function harvest(z: Receiver) {
    if (!x.donor_strain) { flash(t('Pick the donor first'), true); return }
    const s = prompt(t('Seeds harvested from {a} x {b}?', { a: z.strain, b: x.donor_strain })); if (s == null) return
    const n = Number(s.replace(/,/g, '')); if (!isFinite(n) || n < 0) { flash(t('Enter a number'), true); return }
    const code = prompt(t('Short code for this cross (e.g. HBxP)'), `${initials(z.strain)}x${initials(x.donor_strain ?? '')}`) ?? undefined
    const { error } = await sb.from('seed_lots').insert({ code: code || null, mother_strain: z.strain, father_strain: x.donor_strain, run_id: x.id, receiver_id: z.id, source: 'in-house', harvested_on: x.harvested_on ?? today(), seeds: n })
    if (error) flash(error.message, true); else await onSaved(`${t('{n} seeds', { n: n0(n) })}: ${z.strain} x ${x.donor_strain}`)
  }
  return (
    <Sheet title={x.id ? x.name ?? t('Run') : t('New pollination run')} sub={x.id ? `${x.season} · ${t('{n} receivers', { n: shown.length })} · ${t('{n} plants', { n: n0(sum(shown.map(z => z.plants))) })}` : t('One trailer: one donor, many receivers')} onClose={onClose} wide>
      <div className="grid3">
        <F label={t('Name')}><TextIn value={x.name} onChange={v => set({ name: v ?? '' })} placeholder={t('2026 Honey Banana run')} autoFocus={!x.id} /></F>
        <F label={t('Season')}><NumIn value={x.season} onChange={v => set({ season: v ?? new Date().getFullYear() })} /></F>
        <F label={t('Status')}><Pick value={x.status} options={RUN_STATUS.map(s => ({ v: s, l: cap(s) }))} onChange={v => set({ status: v ?? 'planned' })} /></F>
        <F label={t('Receivers flower in')}><Pick value={x.room_id} blank="—" options={trailers.map(r => ({ v: r.id, l: r.name }))} onChange={v => set({ room_id: v })} /></F>
        <F label={t('Project')}><TextIn value={x.project} onChange={v => set({ project: v })} placeholder={t('2026 Seed Project')} /></F>
        <F label={t('Donor (pollen) variety')}><TextIn value={x.donor_strain} list="n-strains" onChange={v => set({ donor_strain: v ?? '', donor_mother_id: null, donor_batch_id: null })} /></F>
        <F label={t('Donor cutting batch')}><Pick value={x.donor_batch_id} blank="—" options={donorBatches.map(z => ({ v: z.id, l: `${z.name ?? z.strain} · ${fmtD(z.cut_on)} · ${n0(z.cuttings)}` }))} onChange={v => set({ donor_batch_id: v })} /></F>
        <F label={t('Donor lot')}><Pick value={x.donor_mother_id} blank="—" options={donorLots.map(m => ({ v: m.id, l: `${GEN_LABEL[m.gen]} · ${c.room(m.room_id)} · ${live(m)}` }))} onChange={v => set({ donor_mother_id: v })} /></F>
        <F label={t('Donors start / flower in')}><Pick value={x.donor_room_id} blank="—" options={d.rooms.filter(r => r.active || r.id === x.donor_room_id).map(r => ({ v: r.id, l: r.name }))} onChange={v => set({ donor_room_id: v })} /></F>
        <F label={t('Donor plants')}><NumIn value={x.donor_plants} onChange={v => set({ donor_plants: v })} /></F>
      </div>
      <StrainList id="n-strains" names={[...new Set([...d.mothers.filter(m => m.status === 'active').map(m => m.strain), ...d.strains])]} />
      <h3>{t('Dates')}</h3>
      <div className="grid3">
        <F label={t('Donors cut')}><DateIn value={x.donors_cut_on} onChange={v => set({ donors_cut_on: v })} /></F>
        <F label={t('Donors flipped')}><DateIn value={x.donors_flip_on} onChange={v => set({ donors_flip_on: v })} /></F>
        <F label={t('Receivers cut')}><DateIn value={x.receivers_cut_on} onChange={v => set({ receivers_cut_on: v })} /></F>
        <F label={t('Receivers planted')}><DateIn value={x.receivers_planted_on} onChange={v => set({ receivers_planted_on: v })} /></F>
        <F label={t('Receivers flipped')}><DateIn value={x.flip_on} onChange={v => set({ flip_on: v })} /></F>
        <F label={t('Pollinated (donors in)')}><DateIn value={x.pollinated_on} onChange={v => set({ pollinated_on: v })} /></F>
        <F label={t('Seeds harvested')}><DateIn value={x.harvested_on} onChange={v => set({ harvested_on: v })} /></F>
      </div>
      <h3 className="row between"><span>{t('Receivers')} <span className="muted small">{shown.length} varieties · {n0(sum(shown.map(z => z.plants)))} plants</span></span><button className="ghost small" onClick={() => setPick(true)}>{t('+ Add receivers…')}</button></h3>
      {shown.length > 0 && <div className="cwrap tight"><table className="ctable">
        <thead><tr><th>{t('Receiver')}</th><th>{t('From')}</th><th className="num">{t('Plants')}</th><th>{t('Tag')}</th><th className="num">{t('Seeds')}</th><th /></tr></thead>
        <tbody>{recs.map((z, i) => z._del ? null : <tr key={z.id ?? `n${i}`}><td>{z.strain}</td>
          <td className="small">{z.batch_id ? (() => { const q = d.batches.find(y => y.id === z.batch_id); return q ? `${q.name ?? t('Batch')} · ${fmtD(q.cut_on)}` : '' })() : z.mother_id ? (() => { const m = d.mothers.find(q => q.id === z.mother_id); return m ? `${GEN_LABEL[m.gen]} ${c.room(m.room_id)}` : '' })() : ''}</td>
          <td className="num"><input className="qty" type="number" value={z.plants} onChange={e => setRecs(rs => rs.map((q, j) => j === i ? { ...q, plants: Number(e.target.value) || 0 } : q))} /></td>
          <td><TagInput compact value={z.plant_tag ?? ''} onChange={v => setRecs(rs => rs.map((q, j) => j === i ? { ...q, plant_tag: v } : q))} where={{ site: d.sites[0]?.code ?? '1PN', type: 'plant' }} keep={z.id ? z.plant_tag : null} placeholder={t('METRC tag')} /></td>
          <td className="num">{seedsFor(z.id) ? n0(seedsFor(z.id)!.seeds) : z.id && x.id ? <button className="ghost small" onClick={() => harvest(z)}>{t('Seeds…')}</button> : ''}</td>
          <td>{!seedsFor(z.id) && <button className="ghost small" onClick={() => setRecs(rs => rs.map((q, j) => j === i ? { ...q, _del: true } : q))}>✕</button>}</td></tr>)}</tbody>
      </table></div>}
      <F label={t('Notes')}><TextIn value={x.notes} onChange={v => set({ notes: v })} /></F>
      <SaveBar busy={busy} disabled={!x.name?.trim()} saveLabel={x.id ? 'Save' : 'Add run'} onCancel={onClose} onSave={save}
        onDelete={x.id && !b.seeds.some(s => s.run_id === x.id) ? async () => { const { error } = await sb.from('breed_runs').delete().eq('id', x.id!); if (error) flash(error.message, true); else { onClose(); await onSaved('Run deleted') } } : undefined} />
      {pick && <ReceiverPicker d={d} c={c} have={new Set(shown.map(z => strainKey(z.strain)))} onClose={() => setPick(false)}
        onAdd={(list, plants) => { setRecs(rs => [...rs, ...list.map(l => ({ strain: l.strain, mother_id: l.mother_id, batch_id: l.batch_id ?? null, plants, plant_tag: null, notes: null }))]); setPick(false) }} />}
    </Sheet>
  )
}
const initials = (s: string) => s.split(/[\s#]+/).filter(w => /^[A-Za-z]/.test(w)).map(w => w[0].toUpperCase()).join('').slice(0, 4)

/** pick many receiver varieties at once: from this season's cutting batches (the usual way), the mother lots, or any strain */
type PickRow = { strain: string; mother_id: number | null; batch_id?: number | null }
function ReceiverPicker({ d, c, have, onClose, onAdd }: { d: NData; c: NCtx; have: Set<string>; onClose: () => void; onAdd: (l: PickRow[], plants: number) => void }) {
  const [q, setQ] = useState('')
  const [src, setSrc] = useState<'batches' | 'mothers'>('batches')
  const [sel, setSel] = useState<Map<string, PickRow>>(new Map())
  const [plants, setPlants] = useState<number | null>(3)
  const [extra, setExtra] = useState('')
  const lots = useMemo(() => {
    const m = new Map<string, PickRow & { label: string }>()
    if (src === 'batches') {
      for (const x of d.batches.filter(z => z.stage === 'rooting' || z.stage === 'ready').sort((a, b) => b.cut_on.localeCompare(a.cut_on))) {
        const k = strainKey(x.strain); if (!m.has(k)) m.set(k, { strain: x.strain, mother_id: x.mother_id, batch_id: x.id, label: `${x.name ?? t('Batch')} · ${fmtD(x.cut_on)} · ${n0(x.cuttings)}` })
      }
    } else {
      for (const x of d.mothers.filter(z => z.status === 'active' && live(z) > 0).sort((a, b) => b.gen - a.gen)) {
        const k = strainKey(x.strain); if (!m.has(k)) m.set(k, { strain: x.strain, mother_id: x.id, batch_id: null, label: `${GEN_LABEL[x.gen]} · ${c.room(x.room_id)} · ${live(x)}` })
      }
    }
    return [...m.values()].sort((a, b) => a.strain.localeCompare(b.strain))
  }, [d, c, src])
  const ql = q.trim().toLowerCase()
  const list = lots.filter(l => !have.has(strainKey(l.strain)) && (!ql || l.strain.toLowerCase().includes(ql)))
  const toggle = (l: PickRow) => setSel(s => { const x = new Map(s); if (x.has(l.strain)) x.delete(l.strain); else x.set(l.strain, { strain: l.strain, mother_id: l.mother_id, batch_id: l.batch_id ?? null }); return x })
  return (
    <div className="scrim" onClick={onClose}><div className="sheet form csheet" onClick={e => e.stopPropagation()}>
      <div className="sheet-h"><div><h2>{t('Add receivers')}</h2><div className="muted">{sel.size} picked</div></div><button className="ghost" onClick={onClose}>✕</button></div>
      <div className="row wrap"><div className="seg">{([['batches', 'Cutting batches'], ['mothers', 'Mother lots']] as const).map(([k, l]) => <button key={k} className={src === k ? 'on' : ''} onClick={() => setSrc(k)}>{t(l)}</button>)}</div>
        <input className="search" type="search" placeholder={t('Search strains')} value={q} onChange={e => setQ(e.target.value)} autoFocus />
        <button className="ghost small" onClick={() => setSel(s => { const x = new Map(s); for (const l of list) x.set(l.strain, { strain: l.strain, mother_id: l.mother_id, batch_id: l.batch_id ?? null }); return x })}>{t('All shown')}</button></div>
      <div className="pickgrid">{list.map(l => <label key={l.strain} className={`check pick ${sel.has(l.strain) ? 'on' : ''}`}><input type="checkbox" checked={sel.has(l.strain)} onChange={() => toggle(l)} />
        <span>{l.strain}<span className="muted small"> · {l.label}</span></span></label>)}</div>
      <div className="grid2">
        <F label={t('Not on the list')} hint={t('(comma separated)')}><input value={extra} onChange={e => setExtra(e.target.value)} placeholder={t('Strain A, Strain B')} /></F>
        <F label={t('Plants of each')}><NumIn value={plants} onChange={setPlants} /></F>
      </div>
      <SaveBar busy={false} disabled={!sel.size && !extra.trim()} saveLabel={t('Add {n}', { n: sel.size + extra.split(',').filter(s => s.trim()).length })} onCancel={onClose}
        onSave={() => onAdd([...sel.values(), ...extra.split(',').map(s => s.trim()).filter(Boolean).map(strain => ({ strain, mother_id: null, batch_id: null }))], plants ?? 1)} />
    </div></div>
  )
}

function DonorSheet({ sb, d, x0, flash, onClose, onSaved }: { sb: SupabaseClient; d: NData; x0: Partial<DonorBatch>; flash: Flash; onClose: () => void; onSaved: (m: string) => Promise<void> }) {
  const [x, setX] = useState<Partial<DonorBatch>>(x0)
  const [busy, setBusy] = useState(false)
  const set = (v: Partial<DonorBatch>) => setX(s => ({ ...s, ...v }))
  async function save() {
    setBusy(true)
    const row = { project: x.project!, label: x.label!.trim(), strains: x.strains || null, plants: x.plants ?? null, cut_on: x.cut_on ?? null, room_id: x.room_id ?? null, to_room_on: x.to_room_on ?? null, move_in_on: x.move_in_on ?? null, notes: x.notes || null }
    const { error } = x.id ? await sb.from('breed_donor_batches').update(row).eq('id', x.id) : await sb.from('breed_donor_batches').insert(row)
    setBusy(false)
    if (error) flash(error.message, true); else { onClose(); await onSaved('Donor batch saved') }
  }
  return (
    <Sheet title={x.id ? `${x.label}` : t('New donor batch')} sub={x.project} onClose={onClose}>
      <div className="grid2">
        <F label={t('Name')}><TextIn value={x.label} onChange={v => set({ label: v ?? '' })} placeholder={t('Batch D')} autoFocus={!x.id} /></F>
        <F label={t('Donors')}><TextIn value={x.strains} onChange={v => set({ strains: v })} placeholder={t('Rainbow Guava / Hashburger')} /></F>
        <F label={t('Plants')}><NumIn value={x.plants} onChange={v => set({ plants: v })} /></F>
        <F label={t('Cut')}><DateIn value={x.cut_on} onChange={v => set({ cut_on: v })} /></F>
        <F label={t('Flower in')}><Pick value={x.room_id} blank="—" options={d.rooms.filter(r => r.active || r.id === x.room_id).map(r => ({ v: r.id, l: r.name }))} onChange={v => set({ room_id: v })} /></F>
        <F label={t('Transplant')}><DateIn value={x.to_room_on} onChange={v => set({ to_room_on: v })} /></F>
        <F label={t('Into receiver trailers')}><DateIn value={x.move_in_on} onChange={v => set({ move_in_on: v })} /></F>
      </div>
      <F label={t('Notes')}><TextIn value={x.notes} onChange={v => set({ notes: v })} /></F>
      <SaveBar busy={busy} disabled={!x.label?.trim()} onCancel={onClose} onSave={save}
        onDelete={x.id ? async () => { const { error } = await sb.from('breed_donor_batches').delete().eq('id', x.id!); if (error) flash(error.message, true); else { onClose(); await onSaved('Donor batch deleted') } } : undefined} />
    </Sheet>
  )
}

function SeedSheet({ sb, d, s0, flash, onClose, onSaved }: { sb: SupabaseClient; d: NData; s0: Partial<SeedLot>; flash: Flash; onClose: () => void; onSaved: (m: string) => Promise<void> }) {
  const [x, setX] = useState<Partial<SeedLot>>(s0)
  const [busy, setBusy] = useState(false)
  const set = (v: Partial<SeedLot>) => setX(s => ({ ...s, ...v }))
  async function save() {
    setBusy(true)
    const row = { code: x.code || null, mother_strain: x.mother_strain || null, father_strain: x.father_strain || null, source: x.source ?? 'breeder', breeder: x.breeder || null,
      harvested_on: x.harvested_on ?? null, seeds: x.seeds ?? null, germ_pct: x.germ_pct ?? null, notes: x.notes || null,
      season: x.season ?? null, target_plants: x.target_plants ?? null, sown: x.sown ?? null, sown_on: x.sown_on ?? null }
    const { error } = x.id ? await sb.from('seed_lots').update(row).eq('id', x.id) : await sb.from('seed_lots').insert(row)
    setBusy(false)
    if (error) flash(error.message, true); else { onClose(); await onSaved('Seed lot saved') }
  }
  return (
    <Sheet title={x.id ? `${t('Seed lot')} ${x.code ?? ''}` : t('New seed lot')} sub={t(x.source === 'in-house' ? 'From a pollination run' : 'Bought or traded seeds')} onClose={onClose}>
      <div className="grid2">
        <F label={t('Code')}><TextIn value={x.code} onChange={v => set({ code: v })} placeholder={t('HBxP')} /></F>
        <F label={t('Source')}><Pick value={x.source} options={['in-house', 'breeder', 'trade', 'other'].map(s => ({ v: s, l: cap(s) }))} onChange={v => set({ source: v ?? 'breeder' })} /></F>
        <F label={t('Seed parent (receiver)')}><TextIn value={x.mother_strain} list="n-strains" onChange={v => set({ mother_strain: v })} /></F>
        <F label={t('Pollen parent (donor)')}><TextIn value={x.father_strain} list="n-strains" onChange={v => set({ father_strain: v })} /></F>
        <F label={t('Breeder')}><TextIn value={x.breeder} onChange={v => set({ breeder: v })} placeholder={t('Old Soul Seeds, Bloom Seed Co…')} /></F>
        <F label={t(x.source === 'in-house' ? 'Harvested' : 'Received')}><DateIn value={x.harvested_on} onChange={v => set({ harvested_on: v })} /></F>
        <F label={t('Seeds')}><NumIn value={x.seeds} onChange={v => set({ seeds: v })} /></F>
        <F label={t('Germination %')}><NumIn value={x.germ_pct} onChange={v => set({ germ_pct: v })} /></F>
        <F label={t('Season')}><NumIn value={x.season} onChange={v => set({ season: v })} /></F>
        <F label={t('Plants wanted')}><NumIn value={x.target_plants} onChange={v => set({ target_plants: v })} /></F>
        <F label={t('Seeds sown')}><NumIn value={x.sown} onChange={v => set({ sown: v })} /></F>
        <F label={t('Sown on')}><DateIn value={x.sown_on} onChange={v => set({ sown_on: v })} /></F>
      </div>
      <StrainList id="n-strains" names={d.strains} />
      <F label={t('Notes')}><TextIn value={x.notes} onChange={v => set({ notes: v })} /></F>
      <SaveBar busy={busy} onCancel={onClose} onSave={save}
        onDelete={x.id ? async () => { const { error } = await sb.from('seed_lots').delete().eq('id', x.id!); if (error) flash(error.message, true); else { onClose(); await onSaved('Seed lot deleted') } } : undefined} />
    </Sheet>
  )
}

function HuntSheet({ sb, d, b, h0, flash, onClose, onSaved }: { sb: SupabaseClient; d: NData; b: BData; h0: Partial<Hunt>; flash: Flash; onClose: () => void; onSaved: (m: string, id?: number) => Promise<void> }) {
  const [x, setX] = useState<Partial<Hunt>>(h0)
  const [busy, setBusy] = useState(false)
  const set = (v: Partial<Hunt>) => setX(s => ({ ...s, ...v }))
  async function save() {
    setBusy(true)
    const row = { site: d.sites[0]?.code ?? '1PN', season: x.season, name: x.name!.trim(), seed_lot_id: x.seed_lot_id ?? null, sown_on: x.sown_on ?? null, planted_on: x.planted_on ?? null, seeds_sown: x.seeds_sown ?? null,
      germinated: x.germinated ?? null, room_id: x.room_id ?? null, status: x.status ?? 'sown', notes: x.notes || null }
    const r = x.id ? await sb.from('pheno_hunts').update(row).eq('id', x.id).select('id').single() : await sb.from('pheno_hunts').insert(row).select('id').single()
    setBusy(false)
    if (r.error) flash(r.error.message, true); else { onClose(); await onSaved('Hunt saved', x.id ? undefined : r.data.id) }
  }
  return (
    <Sheet title={x.id ? x.name ?? t('Hunt') : t('New pheno hunt')} onClose={onClose}>
      <div className="grid2">
        <F label={t('Name')}><TextIn value={x.name} onChange={v => set({ name: v ?? '' })} autoFocus={!x.id} placeholder={t('2026 HBxP hunt')} /></F>
        <F label={t('Season')}><NumIn value={x.season} onChange={v => set({ season: v ?? new Date().getFullYear() })} /></F>
        <F label={t('Seed lot')} hint={t('(blank = many crosses)')}><Pick value={x.seed_lot_id} blank="—" options={b.seeds.map(s => ({ v: s.id, l: `${s.code ? s.code + ' · ' : ''}${cross(s)}` }))} onChange={v => set({ seed_lot_id: v })} /></F>
        <F label={t('Where')}><Pick value={x.room_id} blank="—" options={d.rooms.filter(r => r.active || r.id === x.room_id).map(r => ({ v: r.id, l: r.name }))} onChange={v => set({ room_id: v })} /></F>
        <F label={t('Sown')}><DateIn value={x.sown_on} onChange={v => set({ sown_on: v })} /></F>
        <F label={t('Planted')}><DateIn value={x.planted_on} onChange={v => set({ planted_on: v })} /></F>
        <F label={t('Seeds sown')}><NumIn value={x.seeds_sown} onChange={v => set({ seeds_sown: v })} /></F>
        <F label={t('Came up')}><NumIn value={x.germinated} onChange={v => set({ germinated: v })} /></F>
        <F label={t('Status')}><Pick value={x.status} options={['sown', 'growing', 'scoring', 'done', 'cancelled'].map(s => ({ v: s, l: cap(s) }))} onChange={v => set({ status: v ?? 'sown' })} /></F>
      </div>
      <F label={t('Notes')}><TextIn value={x.notes} onChange={v => set({ notes: v })} /></F>
      <SaveBar busy={busy} disabled={!x.name?.trim()} onCancel={onClose} onSave={save} />
    </Sheet>
  )
}

/** one hunt: numbered phenos (one cross or many), everyone's scores, the ranking, keepers */
function HuntView({ sb, d, c, b, h, me, flash, onBack, onSaved, onEdit }: { sb: SupabaseClient; d: NData; c: NCtx; b: BData; h: Hunt; me: string; flash: Flash; onBack: () => void; onSaved: (m: string) => Promise<void>; onEdit: () => void }) {
  const [open, setOpen] = useState<Pheno | null>(null)
  const [f, setF] = useState<'all' | 'growing' | 'keeper' | 'maybe' | 'culled'>('growing')
  const [lotF, setLotF] = useState<number | null>(null)
  const [roomF, setRoomF] = useState<number | null>(null)
  const [q, setQ] = useState('')
  const [shown, setShown] = useState(SHOW)
  const [addN, setAddN] = useState<number | null>(null)
  const [addLot, setAddLot] = useState<number | null>(h.seed_lot_id)
  const [addRoom, setAddRoom] = useState<number | null>(h.room_id)
  const s = b.seeds.find(z => z.id === h.seed_lot_id)
  const lotOf = useCallback((p: Pheno) => b.seeds.find(z => z.id === (p.seed_lot_id ?? h.seed_lot_id)), [b.seeds, h.seed_lot_id])
  const ps = useMemo(() => b.phenos.filter(p => p.hunt_id === h.id), [b.phenos, h.id])
  const scoresBy = useMemo(() => { const m = new Map<number, Score[]>(); for (const z of b.scores) { const l = m.get(z.pheno_id); if (l) l.push(z); else m.set(z.pheno_id, [z]) } return m }, [b.scores])
  const obsBy = useMemo(() => { const m = new Map<number, number>(); for (const z of b.obs) m.set(z.pheno_id, (m.get(z.pheno_id) ?? 0) + 1); return m }, [b.obs])
  const isOut = (p: Pheno) => p.status === 'culled' || p.status === 'male'
  // crosses in this hunt, for the summary and the filter
  const crosses = useMemo(() => {
    const m = new Map<number, { lot: SeedLot; rooms: Set<number>; n: number; alive: number; culled: number; cut: number; scored: number; keepers: number }>()
    for (const p of ps) { const l = lotOf(p); if (!l) continue
      const x = m.get(l.id) ?? { lot: l, rooms: new Set<number>(), n: 0, alive: 0, culled: 0, cut: 0, scored: 0, keepers: 0 }
      x.n++; if (isOut(p)) x.culled++; else x.alive++; if (p.cut_qty) x.cut += p.cut_qty; if (scoresBy.has(p.id)) x.scored++; if (p.status === 'keeper') x.keepers++; if (p.room_id) x.rooms.add(p.room_id); m.set(l.id, x) }
    return [...m.values()].sort((a, z) => Math.min(...a.rooms) - Math.min(...z.rooms) || cross(a.lot).localeCompare(cross(z.lot)))
  }, [ps, lotOf, scoresBy])
  const rooms = useMemo(() => [...new Set(ps.map(p => p.room_id).filter((x): x is number => x != null))].sort((a, z) => (d.rooms.find(r => r.id === a)?.sort ?? 0) - (d.rooms.find(r => r.id === z)?.sort ?? 0)), [ps, d.rooms])
  const ql = q.trim().toLowerCase()
  const rows = useMemo(() => ps.filter(p => (f === 'all' || p.status === f || (f === 'culled' && p.status === 'male')) && (lotF == null || lotOf(p)?.id === lotF) && (roomF == null || p.room_id === roomF)
      && (!ql || (p.label ?? '').toLowerCase().includes(ql) || (p.plant_tag ?? '').toLowerCase().includes(ql) || (p.lot_tag ?? '').toLowerCase().endsWith(ql)))
    .map(p => {
      const sc = scoresBy.get(p.id) ?? []
      const tr = Object.fromEntries(TRAITS.map(([k]) => [k, avg(sc.map(z => z[k]))])) as Record<Trait, number | null>
      return { p, sc, t: tr, total: avg(TRAITS.map(([k]) => tr[k])), mine: sc.some(z => z.scorer === me) }
    })
    .sort((a, z) => (z.total ?? -1) - (a.total ?? -1) || (c.room(a.p.room_id)).localeCompare(c.room(z.p.room_id), undefined, { numeric: true }) || (a.p.label ?? '').localeCompare(z.p.label ?? '', undefined, { numeric: true })),
  [ps, f, lotF, roomF, ql, lotOf, scoresBy, me, c])
  useEffect(() => setShown(SHOW), [f, lotF, roomF, ql])
  const add = async () => {
    const l = b.seeds.find(z => z.id === addLot)
    const { error } = await sb.rpc('pheno_hunt_number', { p_hunt: h.id, p_count: addN, p_prefix: l ? (l.code || cross(l)) : (s?.code ?? ''), p_seed_lot: addLot, p_room: addRoom })
    if (error) flash(error.message, true); else { setAddN(null); await onSaved(t('{n} phenos numbered', { n: String(addN) })) }
  }
  const nAll = ps.length, nOut = ps.filter(isOut).length
  return <div>
    <div className="row toolbar between"><button className="ghost" onClick={onBack}>{t('‹ Hunts')}</button><button className="ghost small" onClick={onEdit}>{t('Edit hunt')}</button></div>
    <h3 className="huntname">{h.name} <span className="muted">· {s ? cross(s) : tn(crosses.length, '{n} cross', '{n} crosses')} · {t('sown')} {fmtD(h.sown_on) || '—'}{h.planted_on ? ` · ${t('planted')} ${fmtD(h.planted_on)}` : ''} · {t('{n} seeds', { n: n0(h.seeds_sown) })}{h.germinated ? `, ${t('{n} up', { n: n0(h.germinated) })}` : ''}{h.room_id ? ` · ${c.room(h.room_id)}` : ''}</span></h3>
    <p className="muted small-note">{t('{a} phenos · {b} growing · {c} culled · {d} scored', { a: n0(nAll), b: n0(nAll - nOut), c: n0(nOut), d: n0(ps.filter(p => scoresBy.has(p.id)).length) })}</p>
    {crosses.length > 1 && <details className="crosslist"><summary>{t('Crosses')} ({crosses.length})</summary><div className="cwrap tight"><table className="ctable">
      <thead><tr><th>{t('Cross')}</th><th>{t('Breeder')}</th><th>{t('Where')}</th><th className="num">{t('Phenos')}</th><th className="num">{t('Growing')}</th><th className="num">{t('Culled')}</th><th className="num">{t('Cuttings')}</th><th className="num">{t('Scored')}</th><th className="num">{t('Keepers')}</th></tr></thead>
      <tbody>{crosses.map(x => <tr key={x.lot.id} className={`tap ${lotF === x.lot.id ? 'on' : ''}`} onClick={() => setLotF(lotF === x.lot.id ? null : x.lot.id)}><td><b>{cross(x.lot)}</b></td><td className="small">{x.lot.source === 'in-house' ? 'Lifted' : x.lot.breeder}</td>
        <td className="small">{[...x.rooms].map(r => c.room(r)).join(', ')}</td><td className="num">{x.n}</td><td className="num">{x.alive}</td><td className="num">{x.culled || ''}</td><td className="num">{x.cut || ''}</td><td className="num">{x.scored || ''}</td><td className="num">{x.keepers || ''}</td></tr>)}</tbody>
    </table></div></details>}
    <div className="row wrap toolbar">
      <div className="seg">{(['growing', 'maybe', 'keeper', 'culled', 'all'] as const).map(k => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{k === 'all' ? `${t('All')} (${nAll})` : t(PSTATUS[k])}</button>)}</div>
      {crosses.length > 1 && <Pick value={lotF} blank={t('All crosses')} options={crosses.map(x => ({ v: x.lot.id, l: cross(x.lot) }))} onChange={setLotF} />}
      {rooms.length > 1 && <Pick value={roomF} blank={t('All hoops')} options={rooms.map(r => ({ v: r, l: c.room(r) }))} onChange={setRoomF} />}
      <input className="search" type="search" placeholder={t('Search pheno or tag')} value={q} onChange={e => setQ(e.target.value)} />
    </div>
    <details className="addbox"><summary>{t('+ Number phenos')}</summary><span className="row wrap addpheno">
      {!h.seed_lot_id && <Pick value={addLot} blank={t('Cross…')} options={b.seeds.map(z => ({ v: z.id, l: cross(z) }))} onChange={setAddLot} />}
      <Pick value={addRoom} blank={t('Where…')} options={d.rooms.filter(r => r.active).map(r => ({ v: r.id, l: r.name }))} onChange={setAddRoom} />
      <NumIn value={addN} onChange={setAddN} placeholder={t('How many')} />
      <button className="ghost small" disabled={!addN || (!h.seed_lot_id && !addLot)} onClick={add}>{t('Number them')}</button></span>
      <p className="muted small">{t('They get the next numbers for that cross (#1, #2… in order).')}</p></details>
    <p className="muted small-note">{t('Everyone scores on their own: vigor, structure, aroma, color, tackiness and the jar test, 1-5. The table shows the group average, best first.')}</p>
    {!rows.length ? <p className="muted">{t('No phenos match.')}</p> : <div className="cwrap"><table className="ctable">
      <thead><tr><th>{t('Pheno')}</th><th>{t('Where')}</th>{TRAITS.map(([k, l]) => <th key={k} className="num">{t(l)}</th>)}<th className="num">{t('Avg')}</th><th className="num">{t('Scores')}</th><th className="num">{t('Cuts')}</th><th>{t('Status')}</th></tr></thead>
      <tbody>{rows.slice(0, shown).map(r => <tr key={r.p.id} className={`tap ${isOut(r.p) ? 'done' : ''}`} onClick={() => setOpen(r.p)}>
        <td><b>{r.p.label ?? `#${r.p.number}`}</b>{r.p.keeper_strain && r.p.keeper_strain !== r.p.label ? <span className="muted"> → {r.p.keeper_strain}</span> : ''}{obsBy.get(r.p.id) ? <span className="muted small"> · {t('notes')}</span> : ''}</td>
        <td className="small nowrap">{c.room(r.p.room_id)}{r.p.bed ? ` · ${r.p.bed}` : ''}</td>
        {TRAITS.map(([k]) => <td key={k} className="num">{f1(r.t[k])}</td>)}<td className="num"><b>{f1(r.total)}</b></td>
        <td className="num">{r.sc.length || ''}{r.mine ? ' ✓' : ''}</td><td className="num">{r.p.cut_qty || ''}</td>
        <td><span className={`pill ${r.p.status === 'keeper' ? 'okp' : r.p.status === 'maybe' ? 'warnp' : ''}`}>{t(PSTATUS[r.p.status])}</span>{r.p.cull_reason ? <span className="muted small"> {t(r.p.cull_reason)}</span> : ''}</td></tr>)}</tbody>
    </table>{rows.length > shown && <p className="row"><button className="ghost" onClick={() => setShown(n => n + SHOW)}>{t('Show more ({n} left)', { n: n0(rows.length - shown) })}</button></p>}</div>}
    {open && <PhenoSheet sb={sb} d={d} c={c} b={b} p={open} lot={lotOf(open)} me={me} flash={flash} onClose={() => setOpen(null)} onSaved={async m => { setOpen(null); await onSaved(m) }} />}
  </div>
}

function PhenoSheet({ sb, d, c, b, p, lot, me, flash, onClose, onSaved }: { sb: SupabaseClient; d: NData; c: NCtx; b: BData; p: Pheno; lot: SeedLot | undefined; me: string; flash: Flash; onClose: () => void; onSaved: (m: string) => Promise<void> }) {
  const scores = b.scores.filter(z => z.pheno_id === p.id)
  const mine = scores.find(z => z.scorer === me)
  const [sc, setSc] = useState<Partial<Score>>(mine ?? {})
  const [x, setX] = useState<Pheno>(p)
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState<string | null>(p.cull_reason ?? null)
  const [stage, setStage] = useState<string>(OBS[0].stage)
  const obsAll = b.obs.filter(z => z.pheno_id === p.id)
  const [ob, setOb] = useState<Record<string, Record<string, string | number | null>>>(() => Object.fromEntries(obsAll.map(z => [z.stage, { ...z.traits, _notes: z.notes }])))
  const run = async (f: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    setBusy(true)
    const { error } = await f()
    setBusy(false)
    if (error) flash(error.message, true); else await onSaved(ok)
  }
  const saveScore = () => run(() => mine
    ? sb.from('pheno_scores').update({ ...Object.fromEntries(TRAITS.map(([k]) => [k, sc[k] ?? null])), notes: sc.notes ?? null, scored_on: today() }).eq('id', mine.id)
    : sb.from('pheno_scores').insert({ pheno_id: p.id, ...Object.fromEntries(TRAITS.map(([k]) => [k, sc[k] ?? null])), notes: sc.notes ?? null }), 'Score saved')
  const savePheno = (v: Partial<Pheno>, ok: string) => run(() => sb.from('phenos').update({ label: v.label ?? x.label, plant_tag: v.plant_tag ?? x.plant_tag, room_id: v.room_id ?? x.room_id, bed: v.bed ?? x.bed,
    status: v.status ?? x.status, notes: v.notes ?? x.notes, cut_on: v.cut_on !== undefined ? v.cut_on : x.cut_on, cut_qty: v.cut_qty !== undefined ? v.cut_qty : x.cut_qty,
    cull_reason: v.cull_reason !== undefined ? v.cull_reason : x.cull_reason }).eq('id', p.id), ok)
  const saveObs = () => {
    const cur = ob[stage] ?? {}
    const traits = Object.fromEntries(Object.entries(cur).filter(([k, v]) => k !== '_notes' && v != null && v !== ''))
    const notes = (cur._notes as string | null) || null
    const had = obsAll.find(z => z.stage === stage)
    return run(() => had ? sb.from('pheno_obs').update({ traits, notes, observed_on: today(), observer: me }).eq('id', had.id) : sb.from('pheno_obs').insert({ pheno_id: p.id, stage, traits, notes }), 'Notes saved')
  }
  const keeper = async () => {
    const name = prompt(t('Name for this keeper (it goes on the Strains list)'), x.keeper_strain ?? x.label ?? ''); if (name == null) return
    await run(() => sb.rpc('pheno_keeper', { p_pheno: p.id, p_name: name }), t('{name} is a keeper', { name: name || x.label || '' }))
  }
  const spec = OBS.find(o => o.stage === stage)!
  const setO = (k: string, v: string | number | null) => setOb(o => ({ ...o, [stage]: { ...(o[stage] ?? {}), [k]: v } }))
  const out = x.status === 'culled' || x.status === 'male'
  return (
    <Sheet title={x.label ?? `#${x.number}`} sub={`${lot ? cross(lot) + ' · ' : ''}${c.room(x.room_id)}${x.bed ? ' ' + x.bed : ''} · ${tn(scores.length, '{n} score', '{n} scores')} · ${t(PSTATUS[x.status])}${x.cull_reason ? ` (${t(x.cull_reason)})` : ''}${x.keeper_strain ? ` · ${x.keeper_strain}` : ''}`} onClose={onClose} wide>
      {!out && <>
        <h3>{t('Your score')}</h3>
        <div className="scoregrid">{TRAITS.map(([k, l]) => <Fragment key={k}><span>{t(l)}</span>
          <div className="choices">{[1, 2, 3, 4, 5].map(v => <button key={v} type="button" className={sc[k] === v ? 'on' : ''} onClick={() => setSc(s => ({ ...s, [k]: s[k] === v ? null : v }))}>{v}</button>)}</div></Fragment>)}</div>
        <F label={t('Notes')}><TextIn value={sc.notes} onChange={v => setSc(s => ({ ...s, notes: v }))} placeholder={t('Smells like…')} /></F>
        <button className="primary" disabled={busy || !TRAITS.some(([k]) => sc[k])} onClick={saveScore}>{t(mine ? 'Update my score' : 'Save my score')}</button>
      </>}
      {scores.filter(z => z.scorer !== me).length > 0 && <><h3>{t('Everyone else')}</h3><div className="cwrap tight"><table className="ctable">
        <thead><tr><th>{t('Who')}</th>{TRAITS.map(([k, l]) => <th key={k} className="num">{t(l).slice(0, 5)}</th>)}<th>{t('Notes')}</th></tr></thead>
        <tbody>{scores.filter(z => z.scorer !== me).map(z => <tr key={z.id}><td>{who(z.scorer)}</td>{TRAITS.map(([k]) => <td key={k} className="num">{z[k] ?? ''}</td>)}<td className="small">{z.notes}</td></tr>)}</tbody>
      </table></div></>}
      <h3>{t('Grower notes')}</h3>
      <div className="seg">{OBS.map(o => <button key={o.stage} className={stage === o.stage ? 'on' : ''} onClick={() => setStage(o.stage)}>{t(o.l)}{obsAll.some(z => z.stage === o.stage) ? ' ✓' : ''}</button>)}</div>
      <div className="scoregrid">{spec.fields.map(fd => <Fragment key={fd.k}><span>{t(fd.l)}{fd.unit ? <span className="muted small"> ({fd.unit})</span> : ''}</span>
        {fd.kind === 'rate' ? <div className="choices">{[1, 2, 3, 4, 5].map(v => <button key={v} type="button" className={ob[stage]?.[fd.k] === v ? 'on' : ''} onClick={() => setO(fd.k, ob[stage]?.[fd.k] === v ? null : v)}>{v}</button>)}</div>
          : fd.kind === 'num' ? <NumIn value={(ob[stage]?.[fd.k] as number | null) ?? null} onChange={v => setO(fd.k, v)} />
            : <TextIn value={(ob[stage]?.[fd.k] as string | null) ?? null} onChange={v => setO(fd.k, v)} />}</Fragment>)}</div>
      <F label={t('Notes')}><TextIn value={(ob[stage]?._notes as string | null) ?? null} onChange={v => setO('_notes', v)} /></F>
      <button className="ghost" disabled={busy} onClick={saveObs}>{t('Save {s} notes', { s: t(spec.l).toLowerCase() })}</button>
      {obsAll.find(z => z.stage === stage) && <span className="muted small"> {t('Last by {w} on {d}', { w: who(obsAll.find(z => z.stage === stage)!.observer ?? ''), d: fmtD(obsAll.find(z => z.stage === stage)!.observed_on) })}</span>}
      <h3>{t('Plant')}</h3>
      <div className="grid3">
        <F label={t('Label')}><TextIn value={x.label} onChange={v => setX({ ...x, label: v })} /></F>
        <F label={t('Where')}><Pick value={x.room_id} blank="—" options={d.rooms.filter(r => r.active || r.id === x.room_id).map(r => ({ v: r.id, l: r.name }))} onChange={v => setX({ ...x, room_id: v })} /></F>
        <F label={t('Bed / row')}><TextIn value={x.bed} onChange={v => setX({ ...x, bed: v })} /></F>
        <F label={t('METRC plant tag')}><TagInput value={x.plant_tag ?? ''} onChange={v => setX({ ...x, plant_tag: v || null })} where={{ site: d.sites[0]?.code ?? '1PN', type: 'plant' }} keep={p.plant_tag ?? null} /></F>
        <F label={t('Came from lot (METRC)')}><input value={x.lot_tag ? `…${x.lot_tag.slice(-6)}` : '—'} readOnly title={x.lot_tag ?? ''} /></F>
        <F label={t('Planted')}><input value={fmtD(x.planted_on) || '—'} readOnly /></F>
        <F label={t('Cuttings taken')}><DateIn value={x.cut_on} onChange={v => setX({ ...x, cut_on: v })} /></F>
        <F label={t('How many cuttings')}><NumIn value={x.cut_qty} onChange={v => setX({ ...x, cut_qty: v })} /></F>
      </div>
      <F label={t('Notes')}><TextIn value={x.notes} onChange={v => setX({ ...x, notes: v })} /></F>
      <div className="row wrap docact">
        <button className="ghost" disabled={busy} onClick={() => savePheno(x, 'Saved')}>{t('Save plant details')}</button>
        {!out && <button className="primary" disabled={busy} onClick={keeper}>{t(x.status === 'keeper' ? 'Rename keeper…' : 'Keeper…')}</button>}
        {!out && x.status !== 'maybe' && <button className="ghost" disabled={busy} onClick={() => savePheno({ status: 'maybe' }, 'Marked maybe')}>{t('Maybe')}</button>}
        {x.status !== 'growing' && <button className="ghost" disabled={busy} onClick={() => savePheno({ status: 'growing', cull_reason: null }, 'Back to growing')}>{t('Back to growing')}</button>}
      </div>
      {!out && <div className="row wrap docact">
        <Pick value={reason} blank={t('Cull reason…')} options={CULL_REASONS.map(r => ({ v: r, l: t(r) }))} onChange={setReason} />
        <button className="ghost danger" disabled={busy || !reason} onClick={() => savePheno({ status: reason === 'Male' ? 'male' : 'culled', cull_reason: reason }, 'Culled')}>{t('Cull')}</button>
      </div>}
    </Sheet>
  )
}
