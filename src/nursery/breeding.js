import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { tagTxt } from '../mtag';
import { TagInput } from '../taginput';
import { useBack } from '../nav';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { GEN_LABEL, fmtD, live, n0, strainKey, sum, today } from './calc';
import { DateIn, F, NumIn, Pick, SaveBar, Sheet, StrainList, TextIn } from '../cult/ui';
import { t, tn } from '../i18n';
import { pageAll } from '../pageAll';
const TRAITS = [['vigor', 'Vigor'], ['structure', 'Structure'], ['aroma', 'Aroma'], ['color', 'Color'], ['tackiness', 'Tackiness'], ['jar', 'Jar test']];
const RUN_STATUS = ['planned', 'growing', 'flowering', 'pollinated', 'harvested', 'done', 'cancelled'];
const PSTATUS = { growing: 'Growing', maybe: 'Maybe', keeper: 'Keeper', culled: 'Culled', male: 'Male' };
const CULL_REASONS = ['Hermaphroditism', 'Male', 'Genetic Abnormality', 'Excessive Stretch', 'Poor Structure', 'Stunted Growth', 'Disease Susceptibility', 'Pest Susceptibility', 'Poor Stress Tolerance', 'Low Resin Production', 'Selection Redundancy'];
const OBS = [
    { stage: 'preflip', l: 'Pre-flip', fields: [{ k: 'type', l: 'Type', kind: 'text' }, { k: 'height', l: 'Height average', kind: 'num', unit: 'in' }, { k: 'leaf_density', l: 'Leaf density', kind: 'rate' },
            { k: 'internode', l: 'Internodal spacing', kind: 'rate' }, { k: 'vigor', l: 'Vigor', kind: 'rate' }, { k: 'impression', l: 'Visual impression', kind: 'rate' }, { k: 'branching', l: 'Branching', kind: 'rate' },
            { k: 'canopy_shape', l: 'Canopy shape', kind: 'text' }, { k: 'trainability', l: 'Trainability', kind: 'rate' }, { k: 'sex', l: 'Sex expression', kind: 'text' }] },
    { stage: 'midflower', l: 'Mid flower', fields: [{ k: 'stretch_pct', l: 'Stretch factor', kind: 'num', unit: '%' }, { k: 'bud_formation', l: 'Bud formation', kind: 'rate' }, { k: 'resin_onset', l: 'Resin onset', kind: 'rate' }, { k: 'aroma', l: 'Aroma', kind: 'rate' }] },
    { stage: 'lateflower', l: 'Late flower', fields: [{ k: 'canopy_density', l: 'Canopy density', kind: 'rate' }, { k: 'bud_density', l: 'Bud density', kind: 'rate' }, { k: 'resin_coverage', l: 'Resin coverage', kind: 'rate' },
            { k: 'aroma', l: 'Aroma', kind: 'rate' }, { k: 'maturity', l: 'Maturity', kind: 'rate' }, { k: 'fade', l: 'Fade / health', kind: 'rate' },
            { k: 'ft_avg', l: 'Flower time left, average', kind: 'num', unit: 'days' }, { k: 'ft_low', l: 'Flower time left, low', kind: 'num', unit: 'days' }, { k: 'ft_high', l: 'Flower time left, high', kind: 'num', unit: 'days' }] },
];
const SHOW = 300;
const who = (e) => e.split('@')[0];
const cap = (s) => t(s[0].toUpperCase() + s.slice(1));
const cross = (s) => [s.mother_strain, s.father_strain].filter(Boolean).join(' x ') || s.code || `Lot ${s.id}`;
const avg = (xs) => { const v = xs.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const f1 = (x) => (x == null ? '' : x.toFixed(1));
export function BreedingTab({ sb, d, c, flash, me, openTag }) {
    const [tab, setTab] = useState('runs');
    const [b, setB] = useState(null);
    const [err, setErr] = useState(null);
    const [run, setRun] = useState(null);
    const [lot, setLot] = useState(null);
    const [hunt, setHunt] = useState(null);
    const [huntView, setHuntView] = useState(null);
    const [donor, setDonor] = useState(null);
    useBack(huntView != null, () => setHuntView(null));
    const load = useCallback(async () => {
        const r = await Promise.all(['breed_runs', 'breed_receivers', 'seed_lots', 'pheno_hunts', 'phenos', 'pheno_scores', 'pheno_obs', 'breed_donor_batches'].map(t => pageAll((a, z) => sb.from(t).select('*').order('id').range(a, z))));
        const bad = r.find(x => x.error);
        if (bad?.error) {
            setErr(/breed_|seed_lots|pheno/.test(bad.error.message) ? t('Breeding needs 191_breeding_phenohunt.sql run in Supabase.') : bad.error.message);
            return;
        }
        const [runs, receivers, seeds, hunts, phenos, scores, obs, donors] = r.map(x => x.data ?? []);
        const want = [...new Set(seeds.flatMap(z => z.package_tags ?? []))];
        const pk = want.length ? await sb.from('metrc_packages').select('label,item,qty,uom').in('label', want) : { data: [] };
        const pkgs = new Map((pk.data ?? []).map(z => [z.label, z]));
        setB({ runs: runs, receivers: receivers, seeds: seeds, hunts: hunts, phenos: phenos, scores: scores, obs: obs, donors: donors, pkgs });
        setErr(null);
    }, [sb]);
    useEffect(() => { load(); }, [load]);
    const [openPheno, setOpenPheno] = useState(null);
    useEffect(() => {
        if (!b || !openTag)
            return;
        if (openTag.hunt != null) {
            setTab('hunts');
            setHuntView(openTag.hunt);
            setOpenPheno(openTag.pheno ?? null);
        }
        else if (openTag.run != null) {
            const r = b.runs.find(x => x.id === openTag.run);
            if (r) {
                setTab('runs');
                setHuntView(null);
                setRun(r);
            }
        }
    }, [b, openTag?.n]);
    const saved = async (m) => { await load(); flash(t(m)); };
    if (err)
        return _jsx("div", { className: "warnbox", children: err });
    if (!b)
        return _jsx("p", { className: "muted", children: t('Loading…') });
    if (huntView != null) {
        const h = b.hunts.find(x => x.id === huntView);
        if (h)
            return _jsx(HuntView, { sb: sb, d: d, c: c, b: b, h: h, me: me, flash: flash, openPheno: openPheno, onBack: () => { setHuntView(null); setOpenPheno(null); }, onSaved: saved, onEdit: () => setHunt(h) }, `${h.id}-${openPheno ?? ''}`);
    }
    const sown = (s) => s.sown ?? sum(b.hunts.filter(h => h.seed_lot_id === s.id).map(h => h.seeds_sown ?? 0));
    const lotPhenos = (id) => b.phenos.filter(p => p.seed_lot_id === id || (p.seed_lot_id == null && b.hunts.find(h => h.id === p.hunt_id)?.seed_lot_id === id));
    const projects = [...new Set(b.runs.map(r => r.project).filter((x) => !!x))];
    return _jsxs(_Fragment, { children: [_jsxs("div", { className: "row toolbar between", children: [_jsx("div", { className: "seg", children: [['runs', 'Pollination runs'], ['seeds', 'Seed lots'], ['hunts', 'Pheno hunts']].map(([k, l]) => _jsx("button", { className: tab === k ? 'on' : '', onClick: () => setTab(k), children: t(l) }, k)) }), tab === 'runs' && _jsx("button", { className: "primary", onClick: () => setRun({ season: new Date().getFullYear(), status: 'planned', room_id: d.rooms.find(r => r.name === 'Trailer 1')?.id ?? null, donor_room_id: d.rooms.find(r => r.name === 'Trailer 3')?.id ?? null }), children: t('+ Pollination run') }), tab === 'seeds' && _jsx("button", { className: "primary", onClick: () => setLot({ source: 'breeder' }), children: t('+ Seed lot') }), tab === 'hunts' && _jsx("button", { className: "primary", onClick: () => setHunt({ season: new Date().getFullYear(), status: 'sown', sown_on: today() }), children: t('+ Pheno hunt') })] }), tab === 'runs' && _jsxs(_Fragment, { children: [_jsx("p", { className: "muted small-note", children: t('One run = one trailer: one donor (pollen) variety and as many receiver varieties as you put in. Donors start and flower separately (Trailer 3).') }), !b.runs.length ? _jsx("p", { className: "muted", children: t('No pollination runs yet.') }) : [...projects, null].map(pj => {
                        const rr = b.runs.filter(r => (r.project ?? null) === pj);
                        if (!rr.length)
                            return null;
                        const dbs = pj ? b.donors.filter(x => x.project === pj) : [];
                        return _jsxs(Fragment, { children: [pj && _jsxs("h3", { className: "row between", children: [_jsx("span", { children: pj }), _jsx("button", { className: "ghost small", onClick: () => setDonor({ project: pj, room_id: d.rooms.find(r => r.name === 'Trailer 3')?.id ?? null }), children: t('+ Donor batch') })] }), _jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('Season') }), _jsx("th", { children: t('Run') }), _jsx("th", { children: t('Trailer') }), _jsx("th", { children: t('Donor') }), _jsx("th", { className: "num", children: t('Receivers') }), _jsx("th", { className: "num", children: t('Plants') }), _jsx("th", { children: t('Flipped') }), _jsx("th", { children: t('Pollinated') }), _jsx("th", { children: t('Seeds harvested') }), _jsx("th", { className: "num", children: t('Seeds') }), _jsx("th", { children: t('Status') })] }) }), _jsx("tbody", { children: [...rr].sort((x, y) => y.season - x.season || y.id - x.id).map(r => {
                                                    const rs = b.receivers.filter(z => z.run_id === r.id);
                                                    const sl = b.seeds.filter(s => s.run_id === r.id);
                                                    return _jsxs("tr", { className: `tap ${r.status === 'cancelled' ? 'cancelled' : ''}`, onClick: () => setRun(r), children: [_jsx("td", { children: r.season }), _jsx("td", { children: _jsx("b", { children: r.name }) }), _jsx("td", { children: c.room(r.room_id) || _jsx("span", { className: "muted", children: t('not set') }) }), _jsx("td", { children: r.donor_strain ?? '—' }), _jsx("td", { className: "num", children: rs.length }), _jsx("td", { className: "num", children: n0(sum(rs.map(z => z.plants))) }), _jsx("td", { className: "nowrap", children: fmtD(r.flip_on) }), _jsx("td", { className: "nowrap", children: fmtD(r.pollinated_on) }), _jsx("td", { className: "nowrap", children: fmtD(r.harvested_on) }), _jsx("td", { className: "num", children: sl.length ? n0(sum(sl.map(s => s.seeds ?? 0))) : '' }), _jsx("td", { children: _jsx("span", { className: "pill", children: cap(r.status) }) })] }, r.id);
                                                }) })] }) }), dbs.length > 0 && _jsx("div", { className: "cwrap tight", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('Donor batch') }), _jsx("th", { children: t('Donors') }), _jsx("th", { className: "num", children: t('Plants') }), _jsx("th", { children: t('Cut') }), _jsx("th", { children: t('Flower in') }), _jsx("th", { children: t('Transplant') }), _jsx("th", { children: t('Into receiver trailers') })] }) }), _jsx("tbody", { children: [...dbs].sort((x, y) => x.label.localeCompare(y.label)).map(x => _jsxs("tr", { className: "tap", onClick: () => setDonor(x), children: [_jsx("td", { children: _jsx("b", { children: x.label }) }), _jsx("td", { children: x.strains }), _jsx("td", { className: "num", children: n0(x.plants) }), _jsx("td", { className: "nowrap", children: fmtD(x.cut_on) }), _jsx("td", { children: c.room(x.room_id) }), _jsx("td", { className: "nowrap", children: fmtD(x.to_room_on) }), _jsx("td", { className: "nowrap", children: fmtD(x.move_in_on) })] }, x.id)) })] }) })] }, pj ?? '-');
                    })] }), tab === 'seeds' && (!b.seeds.length ? _jsx("p", { className: "muted", children: t('No seed lots yet. They come from harvesting a run\'s receivers, or add bought or traded seeds.') }) : _jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('Code') }), _jsx("th", { children: t('Cross (seed parent x pollen)') }), _jsx("th", { children: t('Source') }), _jsx("th", { children: t('Season') }), _jsx("th", { className: "num", children: t('Seeds') }), _jsx("th", { className: "num", children: t('Plants wanted') }), _jsx("th", { className: "num", children: t('Sown') }), _jsx("th", { children: t('Sown on') }), _jsx("th", { className: "num", children: t('Phenos') }), _jsx("th", { className: "num", children: t('Alive') }), _jsx("th", { className: "num", children: t('Left') }), _jsx("th", { children: t('METRC seed package') }), _jsx("th", {})] }) }), _jsx("tbody", { children: [...b.seeds].sort((x, y) => (y.season ?? 0) - (x.season ?? 0) || (x.breeder ?? '').localeCompare(y.breeder ?? '') || cross(x).localeCompare(cross(y))).map(s => {
                                const ps = lotPhenos(s.id);
                                return (_jsxs("tr", { className: "tap", onClick: () => setLot(s), children: [_jsx("td", { children: _jsx("b", { children: s.code }) }), _jsx("td", { children: cross(s) }), _jsx("td", { children: s.source === 'in-house' ? (b.runs.find(r => r.id === s.run_id)?.name ?? t('Lifted (in house)')) : s.breeder ?? cap(s.source) }), _jsx("td", { children: s.season ?? '' }), _jsx("td", { className: "num", children: n0(s.seeds) }), _jsx("td", { className: "num", children: n0(s.target_plants) }), _jsx("td", { className: "num", children: n0(sown(s)) || '' }), _jsx("td", { className: "nowrap", children: fmtD(s.sown_on) }), _jsx("td", { className: "num", children: ps.length || '' }), _jsx("td", { className: "num", children: ps.length ? n0(ps.filter(p => p.status !== 'culled' && p.status !== 'male').length) : '' }), _jsx("td", { className: "num", children: s.seeds != null ? n0(s.seeds - sown(s)) : '' }), _jsx("td", { className: "small nowrap", children: (s.package_tags ?? []).length ? s.package_tags.map(l => { const k = b.pkgs.get(l); return `${tagTxt(l)}${k ? ` · ${k.qty ?? ''} ${k.uom ?? ''}` : ''}`; }).join(', ') : _jsx("span", { className: "muted", children: t('none') }) }), _jsx("td", { children: _jsx("button", { className: "ghost small", onClick: e => { e.stopPropagation(); setHunt({ season: new Date().getFullYear(), status: 'sown', sown_on: today(), seed_lot_id: s.id, name: `${s.code ?? cross(s)} hunt` }); }, children: t('Hunt…') }) })] }, s.id));
                            }) })] }) })), tab === 'hunts' && (!b.hunts.length ? _jsx("p", { className: "muted", children: t('No pheno hunts yet. Start one from a seed lot.') }) : _jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('Season') }), _jsx("th", { children: t('Hunt') }), _jsx("th", { children: t('Cross') }), _jsx("th", { children: t('Sown') }), _jsx("th", { className: "num", children: t('Seeds') }), _jsx("th", { className: "num", children: t('Up') }), _jsx("th", { className: "num", children: t('Phenos') }), _jsx("th", { className: "num", children: t('Scored') }), _jsx("th", { className: "num", children: t('Keepers') }), _jsx("th", { children: t('Status') })] }) }), _jsx("tbody", { children: [...b.hunts].sort((x, y) => y.season - x.season || y.id - x.id).map(h => {
                                const ps = b.phenos.filter(p => p.hunt_id === h.id);
                                const s = b.seeds.find(z => z.id === h.seed_lot_id);
                                return _jsxs("tr", { className: "tap", onClick: () => setHuntView(h.id), children: [_jsx("td", { children: h.season }), _jsx("td", { children: _jsx("b", { children: h.name }) }), _jsx("td", { children: s ? cross(s) : '' }), _jsx("td", { className: "nowrap", children: fmtD(h.sown_on) }), _jsx("td", { className: "num", children: n0(h.seeds_sown) }), _jsx("td", { className: "num", children: n0(h.germinated) }), _jsx("td", { className: "num", children: ps.length }), _jsx("td", { className: "num", children: ps.filter(p => b.scores.some(z => z.pheno_id === p.id)).length }), _jsx("td", { className: "num", children: ps.filter(p => p.status === 'keeper').length || '' }), _jsx("td", { children: _jsx("span", { className: "pill", children: cap(h.status) }) })] }, h.id);
                            }) })] }) })), run && _jsx(RunSheet, { sb: sb, d: d, c: c, b: b, r0: run, flash: flash, onClose: () => setRun(null), onSaved: saved }), lot && _jsx(SeedSheet, { sb: sb, d: d, s0: lot, flash: flash, onClose: () => setLot(null), onSaved: saved }), donor && _jsx(DonorSheet, { sb: sb, d: d, x0: donor, flash: flash, onClose: () => setDonor(null), onSaved: saved }), hunt && _jsx(HuntSheet, { sb: sb, d: d, b: b, h0: hunt, flash: flash, onClose: () => setHunt(null), onSaved: async (m, id) => { await saved(m); if (id)
                    setHuntView(id); } })] });
}
function RunSheet({ sb, d, c, b, r0, flash, onClose, onSaved }) {
    const [x, setX] = useState(r0);
    const [recs, setRecs] = useState(() => b.receivers.filter(z => z.run_id === r0.id));
    const [busy, setBusy] = useState(false);
    const [pick, setPick] = useState(false);
    const set = (v) => setX(s => ({ ...s, ...v }));
    const trailers = d.rooms.filter(r => r.kind === 'trailer' && (r.active || r.id === x.room_id || r.id === x.donor_room_id));
    const donorLots = d.mothers.filter(m => m.status === 'active' && x.donor_strain && strainKey(m.strain) === strainKey(x.donor_strain));
    const donorBatches = d.batches.filter(z => x.donor_strain && strainKey(z.strain) === strainKey(x.donor_strain) && (z.stage === 'rooting' || z.stage === 'ready' || z.id === x.donor_batch_id));
    const seedsFor = (id) => b.seeds.find(s => s.receiver_id === id);
    const shown = recs.filter(z => !z._del);
    async function save() {
        setBusy(true);
        try {
            const row = { site: d.sites[0]?.code ?? '1PN', season: x.season, name: x.name.trim(), project: x.project?.trim() || null, room_id: x.room_id ?? null, donor_strain: x.donor_strain?.trim() || null, donor_mother_id: x.donor_mother_id ?? null, donor_batch_id: x.donor_batch_id ?? null,
                donor_room_id: x.donor_room_id ?? null, donor_plants: x.donor_plants ?? null, donors_cut_on: x.donors_cut_on ?? null, donors_flip_on: x.donors_flip_on ?? null,
                receivers_cut_on: x.receivers_cut_on ?? null, receivers_planted_on: x.receivers_planted_on ?? null, flip_on: x.flip_on ?? null, pollinated_on: x.pollinated_on ?? null,
                harvested_on: x.harvested_on ?? null, status: x.status ?? 'planned', notes: x.notes ?? null };
            let id = x.id;
            if (id) {
                const { error } = await sb.from('breed_runs').update(row).eq('id', id);
                if (error)
                    throw error;
            }
            else {
                const { data, error } = await sb.from('breed_runs').insert(row).select('id').single();
                if (error)
                    throw error;
                id = data.id;
            }
            const del = recs.filter(z => z._del && z.id).map(z => z.id);
            if (del.length) {
                const { error } = await sb.from('breed_receivers').delete().in('id', del);
                if (error)
                    throw error;
            }
            for (const z of recs.filter(z => !z._del)) {
                const v = { run_id: id, strain: z.strain, mother_id: z.mother_id, batch_id: z.batch_id ?? null, plants: z.plants, plant_tag: z.plant_tag || null, notes: z.notes || null };
                const { error } = z.id ? await sb.from('breed_receivers').update(v).eq('id', z.id) : await sb.from('breed_receivers').insert(v);
                if (error)
                    throw error;
            }
            onClose();
            await onSaved(x.id ? 'Run saved' : t('{name} added with {n} receivers', { name: x.name, n: shown.length }));
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
        finally {
            setBusy(false);
        }
    }
    async function harvest(z) {
        if (!x.donor_strain) {
            flash(t('Pick the donor first'), true);
            return;
        }
        const s = prompt(t('Seeds harvested from {a} x {b}?', { a: z.strain, b: x.donor_strain }));
        if (s == null)
            return;
        const n = Number(s.replace(/,/g, ''));
        if (!isFinite(n) || n < 0) {
            flash(t('Enter a number'), true);
            return;
        }
        const code = prompt(t('Short code for this cross (e.g. HBxP)'), `${initials(z.strain)}x${initials(x.donor_strain ?? '')}`) ?? undefined;
        const { error } = await sb.from('seed_lots').insert({ code: code || null, mother_strain: z.strain, father_strain: x.donor_strain, run_id: x.id, receiver_id: z.id, source: 'in-house', harvested_on: x.harvested_on ?? today(), seeds: n });
        if (error)
            flash(error.message, true);
        else
            await onSaved(`${t('{n} seeds', { n: n0(n) })}: ${z.strain} x ${x.donor_strain}`);
    }
    return (_jsxs(Sheet, { title: x.id ? x.name ?? t('Run') : t('New pollination run'), sub: x.id ? `${x.season} · ${t('{n} receivers', { n: shown.length })} · ${t('{n} plants', { n: n0(sum(shown.map(z => z.plants))) })}` : t('One trailer: one donor, many receivers'), onClose: onClose, wide: true, children: [_jsxs("div", { className: "grid3", children: [_jsx(F, { label: t('Name'), children: _jsx(TextIn, { value: x.name, onChange: v => set({ name: v ?? '' }), placeholder: t('2026 Honey Banana run'), autoFocus: !x.id }) }), _jsx(F, { label: t('Season'), children: _jsx(NumIn, { value: x.season, onChange: v => set({ season: v ?? new Date().getFullYear() }) }) }), _jsx(F, { label: t('Status'), children: _jsx(Pick, { value: x.status, options: RUN_STATUS.map(s => ({ v: s, l: cap(s) })), onChange: v => set({ status: v ?? 'planned' }) }) }), _jsx(F, { label: t('Receivers flower in'), children: _jsx(Pick, { value: x.room_id, blank: "\u2014", options: trailers.map(r => ({ v: r.id, l: r.name })), onChange: v => set({ room_id: v }) }) }), _jsx(F, { label: t('Project'), children: _jsx(TextIn, { value: x.project, onChange: v => set({ project: v }), placeholder: t('2026 Seed Project') }) }), _jsx(F, { label: t('Donor (pollen) variety'), children: _jsx(TextIn, { value: x.donor_strain, list: "n-strains", onChange: v => set({ donor_strain: v ?? '', donor_mother_id: null, donor_batch_id: null }) }) }), _jsx(F, { label: t('Donor cutting batch'), children: _jsx(Pick, { value: x.donor_batch_id, blank: "\u2014", options: donorBatches.map(z => ({ v: z.id, l: `${z.name ?? z.strain} · ${fmtD(z.cut_on)} · ${n0(z.cuttings)}` })), onChange: v => set({ donor_batch_id: v }) }) }), _jsx(F, { label: t('Donor lot'), children: _jsx(Pick, { value: x.donor_mother_id, blank: "\u2014", options: donorLots.map(m => ({ v: m.id, l: `${GEN_LABEL[m.gen]} · ${c.room(m.room_id)} · ${live(m)}` })), onChange: v => set({ donor_mother_id: v }) }) }), _jsx(F, { label: t('Donors start / flower in'), children: _jsx(Pick, { value: x.donor_room_id, blank: "\u2014", options: d.rooms.filter(r => r.active || r.id === x.donor_room_id).map(r => ({ v: r.id, l: r.name })), onChange: v => set({ donor_room_id: v }) }) }), _jsx(F, { label: t('Donor plants'), children: _jsx(NumIn, { value: x.donor_plants, onChange: v => set({ donor_plants: v }) }) })] }), _jsx(StrainList, { id: "n-strains", names: [...new Set([...d.mothers.filter(m => m.status === 'active').map(m => m.strain), ...d.strains])] }), _jsx("h3", { children: t('Dates') }), _jsxs("div", { className: "grid3", children: [_jsx(F, { label: t('Donors cut'), children: _jsx(DateIn, { value: x.donors_cut_on, onChange: v => set({ donors_cut_on: v }) }) }), _jsx(F, { label: t('Donors flipped'), children: _jsx(DateIn, { value: x.donors_flip_on, onChange: v => set({ donors_flip_on: v }) }) }), _jsx(F, { label: t('Receivers cut'), children: _jsx(DateIn, { value: x.receivers_cut_on, onChange: v => set({ receivers_cut_on: v }) }) }), _jsx(F, { label: t('Receivers planted'), children: _jsx(DateIn, { value: x.receivers_planted_on, onChange: v => set({ receivers_planted_on: v }) }) }), _jsx(F, { label: t('Receivers flipped'), children: _jsx(DateIn, { value: x.flip_on, onChange: v => set({ flip_on: v }) }) }), _jsx(F, { label: t('Pollinated (donors in)'), children: _jsx(DateIn, { value: x.pollinated_on, onChange: v => set({ pollinated_on: v }) }) }), _jsx(F, { label: t('Seeds harvested'), children: _jsx(DateIn, { value: x.harvested_on, onChange: v => set({ harvested_on: v }) }) })] }), _jsxs("h3", { className: "row between", children: [_jsxs("span", { children: [t('Receivers'), " ", _jsxs("span", { className: "muted small", children: [shown.length, " varieties \u00B7 ", n0(sum(shown.map(z => z.plants))), " plants"] })] }), _jsx("button", { className: "ghost small", onClick: () => setPick(true), children: t('+ Add receivers…') })] }), shown.length > 0 && _jsx("div", { className: "cwrap tight", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('Receiver') }), _jsx("th", { children: t('From') }), _jsx("th", { className: "num", children: t('Plants') }), _jsx("th", { children: t('Tag') }), _jsx("th", { className: "num", children: t('Seeds') }), _jsx("th", {})] }) }), _jsx("tbody", { children: recs.map((z, i) => z._del ? null : _jsxs("tr", { children: [_jsx("td", { children: z.strain }), _jsx("td", { className: "small", children: z.batch_id ? (() => { const q = d.batches.find(y => y.id === z.batch_id); return q ? `${q.name ?? t('Batch')} · ${fmtD(q.cut_on)}` : ''; })() : z.mother_id ? (() => { const m = d.mothers.find(q => q.id === z.mother_id); return m ? `${GEN_LABEL[m.gen]} ${c.room(m.room_id)}` : ''; })() : '' }), _jsx("td", { className: "num", children: _jsx("input", { className: "qty", type: "number", value: z.plants, onChange: e => setRecs(rs => rs.map((q, j) => j === i ? { ...q, plants: Number(e.target.value) || 0 } : q)) }) }), _jsx("td", { children: _jsx(TagInput, { compact: true, value: z.plant_tag ?? '', onChange: v => setRecs(rs => rs.map((q, j) => j === i ? { ...q, plant_tag: v } : q)), where: { site: d.sites[0]?.code ?? '1PN', type: 'plant' }, keep: z.id ? z.plant_tag : null, placeholder: t('METRC tag') }) }), _jsx("td", { className: "num", children: seedsFor(z.id) ? n0(seedsFor(z.id).seeds) : z.id && x.id ? _jsx("button", { className: "ghost small", onClick: () => harvest(z), children: t('Seeds…') }) : '' }), _jsx("td", { children: !seedsFor(z.id) && _jsx("button", { className: "ghost small", onClick: () => setRecs(rs => rs.map((q, j) => j === i ? { ...q, _del: true } : q)), children: "\u2715" }) })] }, z.id ?? `n${i}`)) })] }) }), _jsx(F, { label: t('Notes'), children: _jsx(TextIn, { value: x.notes, onChange: v => set({ notes: v }) }) }), _jsx(SaveBar, { busy: busy, disabled: !x.name?.trim(), saveLabel: x.id ? 'Save' : 'Add run', onCancel: onClose, onSave: save, onDelete: x.id && !b.seeds.some(s => s.run_id === x.id) ? async () => { const { error } = await sb.from('breed_runs').delete().eq('id', x.id); if (error)
                    flash(error.message, true);
                else {
                    onClose();
                    await onSaved('Run deleted');
                } } : undefined }), pick && _jsx(ReceiverPicker, { d: d, c: c, have: new Set(shown.map(z => strainKey(z.strain))), onClose: () => setPick(false), onAdd: (list, plants) => { setRecs(rs => [...rs, ...list.map(l => ({ strain: l.strain, mother_id: l.mother_id, batch_id: l.batch_id ?? null, plants, plant_tag: null, notes: null }))]); setPick(false); } })] }));
}
const initials = (s) => s.split(/[\s#]+/).filter(w => /^[A-Za-z]/.test(w)).map(w => w[0].toUpperCase()).join('').slice(0, 4);
function ReceiverPicker({ d, c, have, onClose, onAdd }) {
    const [q, setQ] = useState('');
    const [src, setSrc] = useState('batches');
    const [sel, setSel] = useState(new Map());
    const [plants, setPlants] = useState(3);
    const [extra, setExtra] = useState('');
    const lots = useMemo(() => {
        const m = new Map();
        if (src === 'batches') {
            for (const x of d.batches.filter(z => z.stage === 'rooting' || z.stage === 'ready').sort((a, b) => b.cut_on.localeCompare(a.cut_on))) {
                const k = strainKey(x.strain);
                if (!m.has(k))
                    m.set(k, { strain: x.strain, mother_id: x.mother_id, batch_id: x.id, label: `${x.name ?? t('Batch')} · ${fmtD(x.cut_on)} · ${n0(x.cuttings)}` });
            }
        }
        else {
            for (const x of d.mothers.filter(z => z.status === 'active' && live(z) > 0).sort((a, b) => b.gen - a.gen)) {
                const k = strainKey(x.strain);
                if (!m.has(k))
                    m.set(k, { strain: x.strain, mother_id: x.id, batch_id: null, label: `${GEN_LABEL[x.gen]} · ${c.room(x.room_id)} · ${live(x)}` });
            }
        }
        return [...m.values()].sort((a, b) => a.strain.localeCompare(b.strain));
    }, [d, c, src]);
    const ql = q.trim().toLowerCase();
    const list = lots.filter(l => !have.has(strainKey(l.strain)) && (!ql || l.strain.toLowerCase().includes(ql)));
    const toggle = (l) => setSel(s => { const x = new Map(s); if (x.has(l.strain))
        x.delete(l.strain);
    else
        x.set(l.strain, { strain: l.strain, mother_id: l.mother_id, batch_id: l.batch_id ?? null }); return x; });
    return (_jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: "sheet form csheet", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsxs("div", { children: [_jsx("h2", { children: t('Add receivers') }), _jsxs("div", { className: "muted", children: [sel.size, " picked"] })] }), _jsx("button", { className: "ghost", onClick: onClose, children: "\u2715" })] }), _jsxs("div", { className: "row wrap", children: [_jsx("div", { className: "seg", children: [['batches', 'Cutting batches'], ['mothers', 'Mother lots']].map(([k, l]) => _jsx("button", { className: src === k ? 'on' : '', onClick: () => setSrc(k), children: t(l) }, k)) }), _jsx("input", { className: "search", type: "search", placeholder: t('Search strains'), value: q, onChange: e => setQ(e.target.value), autoFocus: true }), _jsx("button", { className: "ghost small", onClick: () => setSel(s => { const x = new Map(s); for (const l of list)
                                x.set(l.strain, { strain: l.strain, mother_id: l.mother_id, batch_id: l.batch_id ?? null }); return x; }), children: t('All shown') })] }), _jsx("div", { className: "pickgrid", children: list.map(l => _jsxs("label", { className: `check pick ${sel.has(l.strain) ? 'on' : ''}`, children: [_jsx("input", { type: "checkbox", checked: sel.has(l.strain), onChange: () => toggle(l) }), _jsxs("span", { children: [l.strain, _jsxs("span", { className: "muted small", children: [" \u00B7 ", l.label] })] })] }, l.strain)) }), _jsxs("div", { className: "grid2", children: [_jsx(F, { label: t('Not on the list'), hint: t('(comma separated)'), children: _jsx("input", { value: extra, onChange: e => setExtra(e.target.value), placeholder: t('Strain A, Strain B') }) }), _jsx(F, { label: t('Plants of each'), children: _jsx(NumIn, { value: plants, onChange: setPlants }) })] }), _jsx(SaveBar, { busy: false, disabled: !sel.size && !extra.trim(), saveLabel: t('Add {n}', { n: sel.size + extra.split(',').filter(s => s.trim()).length }), onCancel: onClose, onSave: () => onAdd([...sel.values(), ...extra.split(',').map(s => s.trim()).filter(Boolean).map(strain => ({ strain, mother_id: null, batch_id: null }))], plants ?? 1) })] }) }));
}
function DonorSheet({ sb, d, x0, flash, onClose, onSaved }) {
    const [x, setX] = useState(x0);
    const [busy, setBusy] = useState(false);
    const set = (v) => setX(s => ({ ...s, ...v }));
    async function save() {
        setBusy(true);
        const row = { project: x.project, label: x.label.trim(), strains: x.strains || null, plants: x.plants ?? null, cut_on: x.cut_on ?? null, room_id: x.room_id ?? null, to_room_on: x.to_room_on ?? null, move_in_on: x.move_in_on ?? null, notes: x.notes || null };
        const { error } = x.id ? await sb.from('breed_donor_batches').update(row).eq('id', x.id) : await sb.from('breed_donor_batches').insert(row);
        setBusy(false);
        if (error)
            flash(error.message, true);
        else {
            onClose();
            await onSaved('Donor batch saved');
        }
    }
    return (_jsxs(Sheet, { title: x.id ? `${x.label}` : t('New donor batch'), sub: x.project, onClose: onClose, children: [_jsxs("div", { className: "grid2", children: [_jsx(F, { label: t('Name'), children: _jsx(TextIn, { value: x.label, onChange: v => set({ label: v ?? '' }), placeholder: t('Batch D'), autoFocus: !x.id }) }), _jsx(F, { label: t('Donors'), children: _jsx(TextIn, { value: x.strains, onChange: v => set({ strains: v }), placeholder: t('Rainbow Guava / Hashburger') }) }), _jsx(F, { label: t('Plants'), children: _jsx(NumIn, { value: x.plants, onChange: v => set({ plants: v }) }) }), _jsx(F, { label: t('Cut'), children: _jsx(DateIn, { value: x.cut_on, onChange: v => set({ cut_on: v }) }) }), _jsx(F, { label: t('Flower in'), children: _jsx(Pick, { value: x.room_id, blank: "\u2014", options: d.rooms.filter(r => r.active || r.id === x.room_id).map(r => ({ v: r.id, l: r.name })), onChange: v => set({ room_id: v }) }) }), _jsx(F, { label: t('Transplant'), children: _jsx(DateIn, { value: x.to_room_on, onChange: v => set({ to_room_on: v }) }) }), _jsx(F, { label: t('Into receiver trailers'), children: _jsx(DateIn, { value: x.move_in_on, onChange: v => set({ move_in_on: v }) }) })] }), _jsx(F, { label: t('Notes'), children: _jsx(TextIn, { value: x.notes, onChange: v => set({ notes: v }) }) }), _jsx(SaveBar, { busy: busy, disabled: !x.label?.trim(), onCancel: onClose, onSave: save, onDelete: x.id ? async () => { const { error } = await sb.from('breed_donor_batches').delete().eq('id', x.id); if (error)
                    flash(error.message, true);
                else {
                    onClose();
                    await onSaved('Donor batch deleted');
                } } : undefined })] }));
}
function SeedSheet({ sb, d, s0, flash, onClose, onSaved }) {
    const [x, setX] = useState(s0);
    const [busy, setBusy] = useState(false);
    const set = (v) => setX(s => ({ ...s, ...v }));
    async function save() {
        setBusy(true);
        const row = { code: x.code || null, mother_strain: x.mother_strain || null, father_strain: x.father_strain || null, source: x.source ?? 'breeder', breeder: x.breeder || null,
            harvested_on: x.harvested_on ?? null, seeds: x.seeds ?? null, germ_pct: x.germ_pct ?? null, notes: x.notes || null,
            season: x.season ?? null, target_plants: x.target_plants ?? null, sown: x.sown ?? null, sown_on: x.sown_on ?? null };
        const { error } = x.id ? await sb.from('seed_lots').update(row).eq('id', x.id) : await sb.from('seed_lots').insert(row);
        setBusy(false);
        if (error)
            flash(error.message, true);
        else {
            onClose();
            await onSaved('Seed lot saved');
        }
    }
    return (_jsxs(Sheet, { title: x.id ? `${t('Seed lot')} ${x.code ?? ''}` : t('New seed lot'), sub: t(x.source === 'in-house' ? 'From a pollination run' : 'Bought or traded seeds'), onClose: onClose, children: [_jsxs("div", { className: "grid2", children: [_jsx(F, { label: t('Code'), children: _jsx(TextIn, { value: x.code, onChange: v => set({ code: v }), placeholder: t('HBxP') }) }), _jsx(F, { label: t('Source'), children: _jsx(Pick, { value: x.source, options: ['in-house', 'breeder', 'trade', 'other'].map(s => ({ v: s, l: cap(s) })), onChange: v => set({ source: v ?? 'breeder' }) }) }), _jsx(F, { label: t('Seed parent (receiver)'), children: _jsx(TextIn, { value: x.mother_strain, list: "n-strains", onChange: v => set({ mother_strain: v }) }) }), _jsx(F, { label: t('Pollen parent (donor)'), children: _jsx(TextIn, { value: x.father_strain, list: "n-strains", onChange: v => set({ father_strain: v }) }) }), _jsx(F, { label: t('Breeder'), children: _jsx(TextIn, { value: x.breeder, onChange: v => set({ breeder: v }), placeholder: t('Old Soul Seeds, Bloom Seed Co…') }) }), _jsx(F, { label: t(x.source === 'in-house' ? 'Harvested' : 'Received'), children: _jsx(DateIn, { value: x.harvested_on, onChange: v => set({ harvested_on: v }) }) }), _jsx(F, { label: t('Seeds'), children: _jsx(NumIn, { value: x.seeds, onChange: v => set({ seeds: v }) }) }), _jsx(F, { label: t('Germination %'), children: _jsx(NumIn, { value: x.germ_pct, onChange: v => set({ germ_pct: v }) }) }), _jsx(F, { label: t('Season'), children: _jsx(NumIn, { value: x.season, onChange: v => set({ season: v }) }) }), _jsx(F, { label: t('Plants wanted'), children: _jsx(NumIn, { value: x.target_plants, onChange: v => set({ target_plants: v }) }) }), _jsx(F, { label: t('Seeds sown'), children: _jsx(NumIn, { value: x.sown, onChange: v => set({ sown: v }) }) }), _jsx(F, { label: t('Sown on'), children: _jsx(DateIn, { value: x.sown_on, onChange: v => set({ sown_on: v }) }) })] }), _jsx(StrainList, { id: "n-strains", names: d.strains }), _jsx(F, { label: t('Notes'), children: _jsx(TextIn, { value: x.notes, onChange: v => set({ notes: v }) }) }), _jsx(SaveBar, { busy: busy, onCancel: onClose, onSave: save, onDelete: x.id ? async () => { const { error } = await sb.from('seed_lots').delete().eq('id', x.id); if (error)
                    flash(error.message, true);
                else {
                    onClose();
                    await onSaved('Seed lot deleted');
                } } : undefined })] }));
}
function HuntSheet({ sb, d, b, h0, flash, onClose, onSaved }) {
    const [x, setX] = useState(h0);
    const [busy, setBusy] = useState(false);
    const set = (v) => setX(s => ({ ...s, ...v }));
    async function save() {
        setBusy(true);
        const row = { site: d.sites[0]?.code ?? '1PN', season: x.season, name: x.name.trim(), seed_lot_id: x.seed_lot_id ?? null, sown_on: x.sown_on ?? null, planted_on: x.planted_on ?? null, seeds_sown: x.seeds_sown ?? null,
            germinated: x.germinated ?? null, room_id: x.room_id ?? null, status: x.status ?? 'sown', notes: x.notes || null };
        const r = x.id ? await sb.from('pheno_hunts').update(row).eq('id', x.id).select('id').single() : await sb.from('pheno_hunts').insert(row).select('id').single();
        setBusy(false);
        if (r.error)
            flash(r.error.message, true);
        else {
            onClose();
            await onSaved('Hunt saved', x.id ? undefined : r.data.id);
        }
    }
    return (_jsxs(Sheet, { title: x.id ? x.name ?? t('Hunt') : t('New pheno hunt'), onClose: onClose, children: [_jsxs("div", { className: "grid2", children: [_jsx(F, { label: t('Name'), children: _jsx(TextIn, { value: x.name, onChange: v => set({ name: v ?? '' }), autoFocus: !x.id, placeholder: t('2026 HBxP hunt') }) }), _jsx(F, { label: t('Season'), children: _jsx(NumIn, { value: x.season, onChange: v => set({ season: v ?? new Date().getFullYear() }) }) }), _jsx(F, { label: t('Seed lot'), hint: t('(blank = many crosses)'), children: _jsx(Pick, { value: x.seed_lot_id, blank: "\u2014", options: b.seeds.map(s => ({ v: s.id, l: `${s.code ? s.code + ' · ' : ''}${cross(s)}` })), onChange: v => set({ seed_lot_id: v }) }) }), _jsx(F, { label: t('Where'), children: _jsx(Pick, { value: x.room_id, blank: "\u2014", options: d.rooms.filter(r => r.active || r.id === x.room_id).map(r => ({ v: r.id, l: r.name })), onChange: v => set({ room_id: v }) }) }), _jsx(F, { label: t('Sown'), children: _jsx(DateIn, { value: x.sown_on, onChange: v => set({ sown_on: v }) }) }), _jsx(F, { label: t('Planted'), children: _jsx(DateIn, { value: x.planted_on, onChange: v => set({ planted_on: v }) }) }), _jsx(F, { label: t('Seeds sown'), children: _jsx(NumIn, { value: x.seeds_sown, onChange: v => set({ seeds_sown: v }) }) }), _jsx(F, { label: t('Came up'), children: _jsx(NumIn, { value: x.germinated, onChange: v => set({ germinated: v }) }) }), _jsx(F, { label: t('Status'), children: _jsx(Pick, { value: x.status, options: ['sown', 'growing', 'scoring', 'done', 'cancelled'].map(s => ({ v: s, l: cap(s) })), onChange: v => set({ status: v ?? 'sown' }) }) })] }), _jsx(F, { label: t('Notes'), children: _jsx(TextIn, { value: x.notes, onChange: v => set({ notes: v }) }) }), _jsx(SaveBar, { busy: busy, disabled: !x.name?.trim(), onCancel: onClose, onSave: save })] }));
}
/** one hunt: numbered phenos (one cross or many), everyone's scores, the ranking, keepers */
function HuntView({ sb, d, c, b, h, me, flash, onBack, onSaved, onEdit, openPheno }) {
    const [open, setOpen] = useState(() => (openPheno != null ? b.phenos.find(p => p.id === openPheno) ?? null : null));
    const [f, setF] = useState('growing');
    const [lotF, setLotF] = useState(null);
    const [roomF, setRoomF] = useState(null);
    const [q, setQ] = useState('');
    const [shown, setShown] = useState(SHOW);
    const [who_, setWho] = useState(null);
    const [tying, setTying] = useState(false);
    const [addN, setAddN] = useState(null);
    const [addLot, setAddLot] = useState(h.seed_lot_id);
    const [addRoom, setAddRoom] = useState(h.room_id);
    const s = b.seeds.find(z => z.id === h.seed_lot_id);
    const lotOf = useCallback((p) => b.seeds.find(z => z.id === (p.seed_lot_id ?? h.seed_lot_id)), [b.seeds, h.seed_lot_id]);
    const ps = useMemo(() => b.phenos.filter(p => p.hunt_id === h.id), [b.phenos, h.id]);
    const scoresBy = useMemo(() => { const m = new Map(); for (const z of b.scores) {
        const l = m.get(z.pheno_id);
        if (l)
            l.push(z);
        else
            m.set(z.pheno_id, [z]);
    } return m; }, [b.scores]);
    const obsBy = useMemo(() => { const m = new Map(); for (const z of b.obs)
        m.set(z.pheno_id, (m.get(z.pheno_id) ?? 0) + 1); return m; }, [b.obs]);
    const isOut = (p) => p.status === 'culled' || p.status === 'male';
    // crosses in this hunt, for the summary and the filter
    const crosses = useMemo(() => {
        const m = new Map();
        for (const p of ps) {
            const l = lotOf(p);
            if (!l)
                continue;
            const x = m.get(l.id) ?? { lot: l, rooms: new Set(), n: 0, alive: 0, culled: 0, cut: 0, scored: 0, keepers: 0 };
            x.n++;
            if (isOut(p))
                x.culled++;
            else
                x.alive++;
            if (p.cut_qty)
                x.cut += p.cut_qty;
            if (scoresBy.has(p.id))
                x.scored++;
            if (p.status === 'keeper')
                x.keepers++;
            if (p.room_id)
                x.rooms.add(p.room_id);
            m.set(l.id, x);
        }
        return [...m.values()].sort((a, z) => Math.min(...a.rooms) - Math.min(...z.rooms) || cross(a.lot).localeCompare(cross(z.lot)));
    }, [ps, lotOf, scoresBy]);
    const rooms = useMemo(() => [...new Set(ps.map(p => p.room_id).filter((x) => x != null))].sort((a, z) => (d.rooms.find(r => r.id === a)?.sort ?? 0) - (d.rooms.find(r => r.id === z)?.sort ?? 0)), [ps, d.rooms]);
    const ql = q.trim().toLowerCase();
    const rows = useMemo(() => ps.filter(p => (f === 'all' || p.status === f || (f === 'culled' && p.status === 'male')) && (lotF == null || lotOf(p)?.id === lotF) && (roomF == null || p.room_id === roomF)
        && (!ql || (p.label ?? '').toLowerCase().includes(ql) || (p.plant_tag ?? '').toLowerCase().includes(ql) || (p.lot_tag ?? '').toLowerCase().endsWith(ql)))
        .map(p => {
        const all = scoresBy.get(p.id) ?? [];
        const sc = who_ ? all.filter(z => z.scorer === who_) : all;
        const tr = Object.fromEntries(TRAITS.map(([k]) => [k, avg(sc.map(z => z[k]))]));
        return { p, sc, t: tr, total: avg(TRAITS.map(([k]) => tr[k])), mine: sc.some(z => z.scorer === me) };
    })
        .sort((a, z) => (z.total ?? -1) - (a.total ?? -1) || (c.room(a.p.room_id)).localeCompare(c.room(z.p.room_id), undefined, { numeric: true }) || (a.p.label ?? '').localeCompare(z.p.label ?? '', undefined, { numeric: true })), [ps, f, lotF, roomF, ql, lotOf, scoresBy, me, c, who_]);
    useEffect(() => setShown(SHOW), [f, lotF, roomF, ql]);
    const add = async () => {
        const l = b.seeds.find(z => z.id === addLot);
        const { error } = await sb.rpc('pheno_hunt_number', { p_hunt: h.id, p_count: addN, p_prefix: l ? (l.code || cross(l)) : (s?.code ?? ''), p_seed_lot: addLot, p_room: addRoom });
        if (error)
            flash(error.message, true);
        else {
            setAddN(null);
            await onSaved(t('{n} phenos numbered', { n: String(addN) }));
        }
    };
    const nAll = ps.length, nOut = ps.filter(isOut).length;
    const scorers = useMemo(() => [...new Set(b.scores.filter(z => ps.some(p => p.id === z.pheno_id)).map(z => z.scorer))].sort(), [b.scores, ps]);
    const tie = async () => {
        setTying(true);
        const { data, error } = await sb.rpc('pheno_tie_tags', { p_hunt: h.id });
        setTying(false);
        if (error) {
            flash(error.message, true);
            return;
        }
        const r = data;
        await onSaved(t('{n} phenos got a METRC tag (unconfirmed). {a} cross/hoops have fewer tags than phenos, {b} have more.', { n: n0(r.tied), a: r.short.length, b: r.extra.length }));
    };
    const untagged = ps.filter(p => !isOut(p) && !p.plant_tag).length, unconf = ps.filter(p => p.plant_tag && !p.tag_confirmed).length;
    return _jsxs("div", { children: [_jsxs("div", { className: "row toolbar between", children: [_jsx("button", { className: "ghost", onClick: onBack, children: t('‹ Hunts') }), _jsx("button", { className: "ghost small", onClick: onEdit, children: t('Edit hunt') })] }), _jsxs("h3", { className: "huntname", children: [h.name, " ", _jsxs("span", { className: "muted", children: ["\u00B7 ", s ? cross(s) : tn(crosses.length, '{n} cross', '{n} crosses'), " \u00B7 ", t('sown'), " ", fmtD(h.sown_on) || '—', h.planted_on ? ` · ${t('planted')} ${fmtD(h.planted_on)}` : '', " \u00B7 ", t('{n} seeds', { n: n0(h.seeds_sown) }), h.germinated ? `, ${t('{n} up', { n: n0(h.germinated) })}` : '', h.room_id ? ` · ${c.room(h.room_id)}` : ''] })] }), _jsx("p", { className: "muted small-note", children: t('{a} phenos · {b} growing · {c} culled · {d} scored', { a: n0(nAll), b: n0(nAll - nOut), c: n0(nOut), d: n0(ps.filter(p => scoresBy.has(p.id)).length) }) }), crosses.length > 1 && _jsxs("details", { className: "crosslist", children: [_jsxs("summary", { children: [t('Crosses'), " (", crosses.length, ")"] }), _jsx("div", { className: "cwrap tight", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('Cross') }), _jsx("th", { children: t('Breeder') }), _jsx("th", { children: t('Where') }), _jsx("th", { className: "num", children: t('Phenos') }), _jsx("th", { className: "num", children: t('Growing') }), _jsx("th", { className: "num", children: t('Culled') }), _jsx("th", { className: "num", children: t('Cuttings') }), _jsx("th", { className: "num", children: t('Scored') }), _jsx("th", { className: "num", children: t('Keepers') })] }) }), _jsx("tbody", { children: crosses.map(x => _jsxs("tr", { className: `tap ${lotF === x.lot.id ? 'on' : ''}`, onClick: () => setLotF(lotF === x.lot.id ? null : x.lot.id), children: [_jsx("td", { children: _jsx("b", { children: cross(x.lot) }) }), _jsx("td", { className: "small", children: x.lot.source === 'in-house' ? 'Lifted' : x.lot.breeder }), _jsx("td", { className: "small", children: [...x.rooms].map(r => c.room(r)).join(', ') }), _jsx("td", { className: "num", children: x.n }), _jsx("td", { className: "num", children: x.alive }), _jsx("td", { className: "num", children: x.culled || '' }), _jsx("td", { className: "num", children: x.cut || '' }), _jsx("td", { className: "num", children: x.scored || '' }), _jsx("td", { className: "num", children: x.keepers || '' })] }, x.lot.id)) })] }) })] }), _jsxs("div", { className: "row wrap toolbar", children: [_jsx("div", { className: "seg", children: ['growing', 'maybe', 'keeper', 'culled', 'all'].map(k => _jsx("button", { className: f === k ? 'on' : '', onClick: () => setF(k), children: k === 'all' ? `${t('All')} (${nAll})` : t(PSTATUS[k]) }, k)) }), crosses.length > 1 && _jsx(Pick, { value: lotF, blank: t('All crosses'), options: crosses.map(x => ({ v: x.lot.id, l: cross(x.lot) })), onChange: setLotF }), rooms.length > 1 && _jsx(Pick, { value: roomF, blank: t('All hoops'), options: rooms.map(r => ({ v: r, l: c.room(r) })), onChange: setRoomF }), _jsx("input", { className: "search", type: "search", placeholder: t('Search pheno or tag'), value: q, onChange: e => setQ(e.target.value) }), _jsx(Pick, { value: who_, blank: t('Group average'), options: scorers.map(z => ({ v: z, l: z === me ? t('My scorecard') : who(z) })), onChange: setWho })] }), (untagged > 0 || unconf > 0) && _jsxs("p", { className: "muted small-note", children: [t('{a} growing phenos without a METRC tag · {b} tags not confirmed yet', { a: n0(untagged), b: n0(unconf) }), untagged > 0 && _jsxs(_Fragment, { children: [" ", _jsx("button", { className: "ghost small", disabled: tying, onClick: tie, children: t(tying ? 'Tying…' : 'Tie tags from METRC') })] })] }), _jsxs("details", { className: "addbox", children: [_jsx("summary", { children: t('+ Number phenos') }), _jsxs("span", { className: "row wrap addpheno", children: [!h.seed_lot_id && _jsx(Pick, { value: addLot, blank: t('Cross…'), options: b.seeds.map(z => ({ v: z.id, l: cross(z) })), onChange: setAddLot }), _jsx(Pick, { value: addRoom, blank: t('Where…'), options: d.rooms.filter(r => r.active).map(r => ({ v: r.id, l: r.name })), onChange: setAddRoom }), _jsx(NumIn, { value: addN, onChange: setAddN, placeholder: t('How many') }), _jsx("button", { className: "ghost small", disabled: !addN || (!h.seed_lot_id && !addLot), onClick: add, children: t('Number them') })] }), _jsx("p", { className: "muted small", children: t('They get the next numbers for that cross (#1, #2… in order).') })] }), _jsx("p", { className: "muted small-note", children: t(who_ ? 'Showing one person\'s scorecard, best first.' : 'Everyone scores on their own card: vigor, structure, aroma, color, tackiness and the jar test, 1-5. The table shows the group average, best first; pick a person to see their scorecard.') }), !rows.length ? _jsx("p", { className: "muted", children: t('No phenos match.') }) : _jsxs("div", { className: "cwrap", children: [_jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('Pheno') }), _jsx("th", { children: t('Where') }), TRAITS.map(([k, l]) => _jsx("th", { className: "num", children: t(l) }, k)), _jsx("th", { className: "num", children: t('Avg') }), _jsx("th", { className: "num", children: t('Scores') }), _jsx("th", { className: "num", children: t('Cuts') }), _jsx("th", { children: t('Status') })] }) }), _jsx("tbody", { children: rows.slice(0, shown).map(r => _jsxs("tr", { className: `tap ${isOut(r.p) ? 'done' : ''}`, onClick: () => setOpen(r.p), children: [_jsxs("td", { children: [_jsx("b", { children: r.p.label ?? `#${r.p.number}` }), r.p.keeper_strain && r.p.keeper_strain !== r.p.label ? _jsxs("span", { className: "muted", children: [" \u2192 ", r.p.keeper_strain] }) : '', obsBy.get(r.p.id) ? _jsxs("span", { className: "muted small", children: [" \u00B7 ", t('notes')] }) : ''] }), _jsxs("td", { className: "small nowrap", children: [c.room(r.p.room_id), r.p.bed ? ` · ${r.p.bed}` : '', r.p.plant_tag ? _jsxs("span", { className: r.p.tag_confirmed ? '' : 'muted', children: [" \u00B7 ", tagTxt(r.p.plant_tag, 5), r.p.tag_confirmed ? '' : '?'] }) : ''] }), TRAITS.map(([k]) => _jsx("td", { className: "num", children: f1(r.t[k]) }, k)), _jsx("td", { className: "num", children: _jsx("b", { children: f1(r.total) }) }), _jsxs("td", { className: "num", children: [r.sc.length || '', r.mine ? ' ✓' : ''] }), _jsx("td", { className: "num", children: r.p.cut_qty || '' }), _jsxs("td", { children: [_jsx("span", { className: `pill ${r.p.status === 'keeper' ? 'okp' : r.p.status === 'maybe' ? 'warnp' : ''}`, children: t(PSTATUS[r.p.status]) }), r.p.cull_reason ? _jsxs("span", { className: "muted small", children: [" ", t(r.p.cull_reason)] }) : ''] })] }, r.p.id)) })] }), rows.length > shown && _jsx("p", { className: "row", children: _jsx("button", { className: "ghost", onClick: () => setShown(n => n + SHOW), children: t('Show more ({n} left)', { n: n0(rows.length - shown) }) }) })] }), open && _jsx(PhenoSheet, { sb: sb, d: d, c: c, b: b, p: open, lot: lotOf(open), me: me, flash: flash, onClose: () => setOpen(null), onSaved: async (m) => { setOpen(null); await onSaved(m); } })] });
}
function PhenoSheet({ sb, d, c, b, p, lot, me, flash, onClose, onSaved }) {
    const scores = b.scores.filter(z => z.pheno_id === p.id);
    const mine = scores.find(z => z.scorer === me);
    const [sc, setSc] = useState(mine ?? {});
    const [x, setX] = useState(p);
    const [busy, setBusy] = useState(false);
    const [reason, setReason] = useState(p.cull_reason ?? null);
    const [stage, setStage] = useState(OBS[0].stage);
    const obsAll = b.obs.filter(z => z.pheno_id === p.id);
    const obsMine = obsAll.filter(z => z.observer === me);
    const [ob, setOb] = useState(() => Object.fromEntries(obsMine.map(z => [z.stage, { ...z.traits, _notes: z.notes }])));
    const run = async (f, ok) => {
        setBusy(true);
        const { error } = await f();
        setBusy(false);
        if (error)
            flash(error.message, true);
        else
            await onSaved(ok);
    };
    const saveScore = () => run(() => mine
        ? sb.from('pheno_scores').update({ ...Object.fromEntries(TRAITS.map(([k]) => [k, sc[k] ?? null])), notes: sc.notes ?? null, scored_on: today() }).eq('id', mine.id)
        : sb.from('pheno_scores').insert({ pheno_id: p.id, ...Object.fromEntries(TRAITS.map(([k]) => [k, sc[k] ?? null])), notes: sc.notes ?? null }), 'Score saved');
    const savePheno = (v, ok) => run(() => sb.from('phenos').update({ label: v.label ?? x.label, plant_tag: v.plant_tag ?? x.plant_tag, room_id: v.room_id ?? x.room_id, bed: v.bed ?? x.bed,
        status: v.status ?? x.status, notes: v.notes ?? x.notes, cut_on: v.cut_on !== undefined ? v.cut_on : x.cut_on, cut_qty: v.cut_qty !== undefined ? v.cut_qty : x.cut_qty,
        cull_reason: v.cull_reason !== undefined ? v.cull_reason : x.cull_reason }).eq('id', p.id), ok);
    const saveObs = () => {
        const cur = ob[stage] ?? {};
        const traits = Object.fromEntries(Object.entries(cur).filter(([k, v]) => k !== '_notes' && v != null && v !== ''));
        const notes = cur._notes || null;
        const had = obsMine.find(z => z.stage === stage);
        return run(() => had ? sb.from('pheno_obs').update({ traits, notes, observed_on: today() }).eq('id', had.id) : sb.from('pheno_obs').insert({ pheno_id: p.id, stage, traits, notes }), 'Notes saved');
    };
    const keeper = async () => {
        const name = prompt(t('Name for this keeper (it goes on the Strains list)'), x.keeper_strain ?? x.label ?? '');
        if (name == null)
            return;
        await run(() => sb.rpc('pheno_keeper', { p_pheno: p.id, p_name: name }), t('{name} is a keeper', { name: name || x.label || '' }));
    };
    const spec = OBS.find(o => o.stage === stage);
    const setO = (k, v) => setOb(o => ({ ...o, [stage]: { ...(o[stage] ?? {}), [k]: v } }));
    const out = x.status === 'culled' || x.status === 'male';
    return (_jsxs(Sheet, { title: x.label ?? `#${x.number}`, sub: `${lot ? cross(lot) + ' · ' : ''}${c.room(x.room_id)}${x.bed ? ' ' + x.bed : ''} · ${tn(scores.length, '{n} score', '{n} scores')} · ${t(PSTATUS[x.status])}${x.cull_reason ? ` (${t(x.cull_reason)})` : ''}${x.keeper_strain ? ` · ${x.keeper_strain}` : ''}`, onClose: onClose, wide: true, children: [!out && _jsxs(_Fragment, { children: [_jsx("h3", { children: t('Your score') }), _jsx("div", { className: "scoregrid", children: TRAITS.map(([k, l]) => _jsxs(Fragment, { children: [_jsx("span", { children: t(l) }), _jsx("div", { className: "choices", children: [1, 2, 3, 4, 5].map(v => _jsx("button", { type: "button", className: sc[k] === v ? 'on' : '', onClick: () => setSc(s => ({ ...s, [k]: s[k] === v ? null : v })), children: v }, v)) })] }, k)) }), _jsx(F, { label: t('Notes'), children: _jsx(TextIn, { value: sc.notes, onChange: v => setSc(s => ({ ...s, notes: v })), placeholder: t('Smells like…') }) }), _jsx("button", { className: "primary", disabled: busy || !TRAITS.some(([k]) => sc[k]), onClick: saveScore, children: t(mine ? 'Update my score' : 'Save my score') })] }), scores.filter(z => z.scorer !== me).length > 0 && _jsxs(_Fragment, { children: [_jsx("h3", { children: t('Everyone else') }), _jsx("div", { className: "cwrap tight", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('Who') }), TRAITS.map(([k, l]) => _jsx("th", { className: "num", children: t(l).slice(0, 5) }, k)), _jsx("th", { children: t('Notes') })] }) }), _jsx("tbody", { children: scores.filter(z => z.scorer !== me).map(z => _jsxs("tr", { children: [_jsx("td", { children: who(z.scorer) }), TRAITS.map(([k]) => _jsx("td", { className: "num", children: z[k] ?? '' }, k)), _jsx("td", { className: "small", children: z.notes })] }, z.id)) })] }) })] }), _jsx("h3", { children: t('Your grower notes') }), _jsx("div", { className: "seg", children: OBS.map(o => _jsxs("button", { className: stage === o.stage ? 'on' : '', onClick: () => setStage(o.stage), children: [t(o.l), obsMine.some(z => z.stage === o.stage) ? ' ✓' : ''] }, o.stage)) }), _jsx("div", { className: "scoregrid", children: spec.fields.map(fd => _jsxs(Fragment, { children: [_jsxs("span", { children: [t(fd.l), fd.unit ? _jsxs("span", { className: "muted small", children: [" (", fd.unit, ")"] }) : ''] }), fd.kind === 'rate' ? _jsx("div", { className: "choices", children: [1, 2, 3, 4, 5].map(v => _jsx("button", { type: "button", className: ob[stage]?.[fd.k] === v ? 'on' : '', onClick: () => setO(fd.k, ob[stage]?.[fd.k] === v ? null : v), children: v }, v)) })
                            : fd.kind === 'num' ? _jsx(NumIn, { value: ob[stage]?.[fd.k] ?? null, onChange: v => setO(fd.k, v) })
                                : _jsx(TextIn, { value: ob[stage]?.[fd.k] ?? null, onChange: v => setO(fd.k, v) })] }, fd.k)) }), _jsx(F, { label: t('Notes'), children: _jsx(TextIn, { value: ob[stage]?._notes ?? null, onChange: v => setO('_notes', v) }) }), _jsx("button", { className: "ghost", disabled: busy, onClick: saveObs, children: t('Save {s} notes', { s: t(spec.l).toLowerCase() }) }), obsMine.find(z => z.stage === stage) && _jsxs("span", { className: "muted small", children: [" ", t('Saved {d}', { d: fmtD(obsMine.find(z => z.stage === stage).observed_on) })] }), obsAll.some(z => z.stage === stage && z.observer !== me) && _jsxs(_Fragment, { children: [_jsx("h3", { children: t('Everyone else, {s}', { s: t(spec.l).toLowerCase() }) }), _jsx("div", { className: "cwrap tight", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('Who') }), spec.fields.map(fd => _jsx("th", { className: "num", children: t(fd.l).split(/[ ,]/)[0] }, fd.k)), _jsx("th", { children: t('Notes') })] }) }), _jsx("tbody", { children: obsAll.filter(z => z.stage === stage && z.observer !== me).map(z => _jsxs("tr", { children: [_jsxs("td", { children: [who(z.observer ?? ''), _jsxs("span", { className: "muted small", children: [" ", fmtD(z.observed_on)] })] }), spec.fields.map(fd => _jsx("td", { className: "num", children: z.traits[fd.k] ?? '' }, fd.k)), _jsx("td", { className: "small", children: z.notes })] }, z.id)) })] }) })] }), _jsx("h3", { children: t('Plant') }), _jsxs("div", { className: "grid3", children: [_jsx(F, { label: t('Label'), children: _jsx(TextIn, { value: x.label, onChange: v => setX({ ...x, label: v }) }) }), _jsx(F, { label: t('Where'), children: _jsx(Pick, { value: x.room_id, blank: "\u2014", options: d.rooms.filter(r => r.active || r.id === x.room_id).map(r => ({ v: r.id, l: r.name })), onChange: v => setX({ ...x, room_id: v }) }) }), _jsx(F, { label: t('Bed / row'), children: _jsx(TextIn, { value: x.bed, onChange: v => setX({ ...x, bed: v }) }) }), _jsx(F, { label: x.plant_tag && !x.tag_confirmed ? _jsxs(_Fragment, { children: [t('METRC plant tag'), " ", _jsx("span", { className: "pill warnp", children: t('not confirmed') })] }) : t('METRC plant tag'), hint: x.plant_tag && !x.tag_confirmed ? t('Tied by number order from METRC. Check the tag on the plant.') : undefined, children: _jsx(TagInput, { value: x.plant_tag ?? '', onChange: v => setX({ ...x, plant_tag: v || null }), where: { site: d.sites[0]?.code ?? '1PN', type: 'plant' }, keep: p.plant_tag ?? null }) }), _jsx(F, { label: t('Came from lot (METRC)'), children: _jsx("input", { value: x.lot_tag ? tagTxt(x.lot_tag) : '—', readOnly: true, title: x.lot_tag ?? '' }) }), _jsx(F, { label: t('Planted'), children: _jsx("input", { value: fmtD(x.planted_on) || '—', readOnly: true }) }), _jsx(F, { label: t('Cuttings taken'), children: _jsx(DateIn, { value: x.cut_on, onChange: v => setX({ ...x, cut_on: v }) }) }), _jsx(F, { label: t('How many cuttings'), children: _jsx(NumIn, { value: x.cut_qty, onChange: v => setX({ ...x, cut_qty: v }) }) })] }), _jsx(F, { label: t('Notes'), children: _jsx(TextIn, { value: x.notes, onChange: v => setX({ ...x, notes: v }) }) }), _jsxs("div", { className: "row wrap docact", children: [_jsx("button", { className: "ghost", disabled: busy, onClick: () => savePheno(x, 'Saved'), children: t('Save plant details') }), p.plant_tag && !p.tag_confirmed && x.plant_tag === p.plant_tag && _jsx("button", { className: "ghost", disabled: busy, onClick: () => run(() => sb.from('phenos').update({ tag_confirmed: true }).eq('id', p.id), 'Tag confirmed'), children: t('Tag is right on the plant') }), !out && _jsx("button", { className: "primary", disabled: busy, onClick: keeper, children: t(x.status === 'keeper' ? 'Rename keeper…' : 'Keeper…') }), !out && x.status !== 'maybe' && _jsx("button", { className: "ghost", disabled: busy, onClick: () => savePheno({ status: 'maybe' }, 'Marked maybe'), children: t('Maybe') }), x.status !== 'growing' && _jsx("button", { className: "ghost", disabled: busy, onClick: () => savePheno({ status: 'growing', cull_reason: null }, 'Back to growing'), children: t('Back to growing') })] }), !out && _jsxs("div", { className: "row wrap docact", children: [_jsx(Pick, { value: reason, blank: t('Cull reason…'), options: CULL_REASONS.map(r => ({ v: r, l: t(r) })), onChange: setReason }), _jsx("button", { className: "ghost danger", disabled: busy || !reason, onClick: () => savePheno({ status: reason === 'Male' ? 'male' : 'culled', cull_reason: reason }, 'Culled'), children: t('Cull') })] })] }));
}
