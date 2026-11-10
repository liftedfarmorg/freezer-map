import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { TagInput } from '../taginput';
import { GEN_LABEL, GEN_WHAT, STAGE_LABEL, addDays, batchName, daysBetween, fmtD, live, n0, rooted, strainKey, tagsNeeded, today } from './calc';
import { DateIn, F, NumIn, Pick, SaveBar, Sheet, StrainList, TextIn } from '../cult/ui';
import { ScanButton } from '../scan';
import { t } from '../i18n';
const stagePill = (b) => {
    const late = b.stage === 'rooting' && b.ready_on && b.ready_on < today();
    return _jsx("span", { className: `pill ${b.stage === 'ready' ? 'okp' : late ? 'warnp' : ''}`, children: late ? t('Rooting (past ready date)') : t(STAGE_LABEL[b.stage]) });
};
const pct = (x) => (x == null ? '' : `${Math.round(x * 100)}%`);
export const success = (b) => { const r = rooted(b); return r == null || !b.cuttings ? null : r / b.cuttings; };
/** Nursery > Batches: cuttings taken, rooting, sorts, ready, out the door (or into the hoops as moms) */
export function BatchesTab({ d, c, q, onOpen, onNew, onSortDay }) {
    const [f, setF] = useState('live');
    const [gen, setGen] = useState(0);
    const ql = q.trim().toLowerCase();
    const rows = d.batches.filter(b => (f === 'all' || (f === 'live' ? b.stage === 'rooting' || b.stage === 'ready' : b.stage === f)) && (!gen || b.gen === gen) &&
        (!ql || `${b.strain} ${b.name ?? ''} ${b.tags.join(' ')} ${b.notes ?? ''}`.toLowerCase().includes(ql)));
    const n = (s) => d.batches.filter(b => b.stage === s).length;
    return _jsxs(_Fragment, { children: [_jsxs("div", { className: "row toolbar between", children: [_jsxs("div", { className: "row wrap", children: [_jsx("div", { className: "seg", children: [['live', t('In the nursery ({n})', { n: n('rooting') + n('ready') })], ['rooting', t('Rooting')], ['ready', t('Ready')], ['done', t('Done')], ['all', t('All')]]
                                    .map(([k, l]) => _jsx("button", { className: f === k ? 'on' : '', onClick: () => setF(k), children: l }, k)) }), _jsx("div", { className: "seg", children: [0, 4, 3, 2, 1].map(g => _jsx("button", { className: gen === g ? 'on' : '', onClick: () => setGen(g), children: g ? GEN_LABEL[g] : t('All gens') }, g)) })] }), _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost", onClick: onSortDay, children: t('Sort day') }), _jsx("button", { className: "primary", onClick: onNew, children: t('+ Cuttings taken') })] })] }), !rows.length ? _jsx("p", { className: "muted", children: t('No batches here. When cuttings are taken, add them with "Cuttings taken".') }) : _jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('Cut') }), _jsx("th", { children: t('Gen') }), _jsx("th", { children: t('Strain') }), _jsx("th", { className: "num", children: t('Cuttings') }), _jsx("th", { className: "num hide-s", children: t('Trays') }), _jsx("th", { className: "num", children: t('Rooted') }), _jsx("th", { className: "num", children: t('Left') }), _jsx("th", { children: t('Ready') }), _jsx("th", { className: "hide-s", children: t('Where / for') }), _jsx("th", { children: t('Stage') }), _jsx("th", { className: "hide-s", children: t('Tags') })] }) }), _jsx("tbody", { children: rows.map(b => {
                                const o = b.order_id ? d.orders.find(x => x.id === b.order_id) : undefined, s = success(b);
                                return _jsxs("tr", { className: `tap ${b.stage === 'done' ? 'done' : b.stage === 'cancelled' ? 'cancelled' : ''}`, onClick: () => onOpen(b), children: [_jsx("td", { className: "nowrap", children: fmtD(b.cut_on) }), _jsx("td", { children: _jsx("span", { className: `gpill g${b.gen}`, children: GEN_LABEL[b.gen] }) }), _jsx("td", { children: b.strain }), _jsx("td", { className: "num", children: n0(b.cuttings) }), _jsx("td", { className: "num hide-s", children: b.trays ?? '' }), _jsx("td", { className: "num", children: s == null ? '' : _jsx("span", { className: s < 0.85 ? 'warn-t' : '', children: pct(s) }) }), _jsx("td", { className: "num", children: _jsx("b", { children: n0(c.left(b)) }) }), _jsx("td", { className: "nowrap", children: fmtD(b.ready_on) }), _jsx("td", { className: "hide-s small", children: [c.room(b.room_id), o ? `${c.to(o)} ${fmtD(o.deliver_on)}` : ''].filter(Boolean).join(' · ') }), _jsx("td", { children: stagePill(b) }), _jsx("td", { className: "hide-s", children: b.tags.length ? b.tags.length : _jsx("span", { className: "warn-t", children: t('none') }) })] }, b.id);
                            }) })] }) })] });
}
const nextSeason = (gen, cut) => { const y = Number(cut.slice(0, 4)), m = Number(cut.slice(5, 7)); return gen === 4 || gen === 3 ? y + (gen === 3 && m >= 7 ? 1 : 0) : y + (m >= 6 ? 1 : 0); };
export function BatchSheet({ d, c, b: b0, api, flash, onClose, onSaved }) {
    const isNew = !b0.id;
    const site = b0.site ?? d.sites[0]?.code ?? '1PN';
    const tray = d.settings.tray || 72;
    const [x, setX] = useState(() => ({ site, cut_on: today(), tags: [], lost: 0, gen: 4,
        room_id: isNew ? d.rooms.find(r => r.active && r.kind === 'trailer')?.id ?? null : null, ...b0 }));
    const [tagText, setTagText] = useState((b0.tags ?? []).join('\n'));
    const [busy, setBusy] = useState(false);
    const [good, setGood] = useState(null);
    const [mode, setMode] = useState('edit');
    const [loss, setLoss] = useState(null);
    const set = (v) => setX(s => ({ ...s, ...v }));
    const tags = tagText.split(/[\s,]+/).map(t => t.trim().toUpperCase()).filter(Boolean);
    const delivered = b0.id ? c.fromBatch.get(b0.id) ?? 0 : 0;
    const autoName = x.strain && x.cut_on ? batchName(x.site ?? site, x.cut_on, x.strain) + (x.gen && x.gen < 4 ? `-G${x.gen}` : '') : '';
    const gen = x.gen ?? 4;
    const orders = d.orders.filter(o => c.isOpen(o) && (!x.strain || strainKey(o.strain) === strainKey(x.strain)));
    const moms = d.mothers.filter(m => m.status === 'active' && (!x.strain || strainKey(m.strain) === strainKey(x.strain)) && (gen === 1 || m.gen === gen - 1));
    const r = rooted({ ...b0, ...x });
    const run = async (f, ok) => {
        setBusy(true);
        try {
            await f();
            onClose();
            await onSaved(ok);
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
        finally {
            setBusy(false);
        }
    };
    const fillTags = async () => {
        const need = tagsNeeded(x.cuttings ?? 1) - tags.length;
        if (need <= 0)
            return;
        const pool = (await api.nextTags(x.site ?? site, need + 20)).filter(t => !tags.includes(t)).slice(0, need);
        if (!pool.length) {
            flash(t('No plant tags loaded for this nursery yet (Admin → Settings → Licenses).'), true);
            return;
        }
        setTagText([...tags, ...pool].join('\n'));
    };
    const save = () => run(() => api.save('nursery_batches', {
        id: x.id, site: x.site ?? site, room_id: x.room_id ?? null, strain: x.strain.trim(), name: (x.name ?? '').trim() || autoName || null, order_id: gen === 4 ? x.order_id ?? null : null,
        cut_on: x.cut_on, cuttings: x.cuttings, lost: x.lost ?? 0, ready_on: x.ready_on ?? (x.cut_on ? addDays(x.cut_on, d.settings.rootDays) : null), stage: x.stage ?? 'rooting', tags, package_tag: (x.package_tag ?? '').trim().toUpperCase() || null, notes: x.notes ?? null,
        gen, season: x.season ?? (x.cut_on ? nextSeason(gen, x.cut_on) : null), mother_id: x.mother_id ?? null, trays: x.trays ?? (x.cuttings ? Math.round(x.cuttings / tray * 10) / 10 : null),
        emerged_on: x.emerged_on ?? null, moved_out_on: x.moved_out_on ?? null,
        sort1_on: x.sort1_on ?? null, s1_vigorous: x.s1_vigorous ?? null, s1_minimal: x.s1_minimal ?? null, s1_none: x.s1_none ?? null, s1_dead: x.s1_dead ?? null,
        sort2_on: x.sort2_on ?? null, s2_vigorous: x.s2_vigorous ?? null, s2_minimal: x.s2_minimal ?? null, s2_none: x.s2_none ?? null, s2_dead: x.s2_dead ?? null,
    }), isNew ? t('{n} {strain} {gen} cuttings added', { n: n0(x.cuttings), strain: x.strain, gen: GEN_LABEL[gen] }) : t('Saved'));
    if (mode === 'ready' && b0.id)
        return (_jsxs(Sheet, { title: `${b0.strain}: ${t('ready')}`, sub: `${b0.name ?? ''} · ${t('{n} cut {date}', { n: n0(b0.cuttings), date: fmtD(b0.cut_on) })}`, onClose: () => setMode('edit'), children: [_jsx(F, { label: t('Good plants (rooted, ready to go)'), children: _jsx(NumIn, { value: good, onChange: setGood, autoFocus: true }) }), _jsxs("p", { className: "muted small-note", children: [t('The rest ({n}) count as lost.', { n: n0(Math.max(0, b0.cuttings - delivered - (good ?? 0))) }), r != null ? ' ' + t('The sorts say {n} rooted.', { n: n0(r) }) : ''] }), _jsx(SaveBar, { busy: busy, disabled: good == null || good < 0 || good > b0.cuttings - delivered, saveLabel: t('Mark ready'), onCancel: () => setMode('edit'), onSave: () => run(() => api.save('nursery_batches', { id: b0.id, stage: 'ready', ready_on: today(), lost: b0.cuttings - delivered - good }), t('{n} {strain} ready', { n: n0(good), strain: b0.strain })) })] }));
    if (mode === 'loss' && b0.id)
        return (_jsxs(Sheet, { title: `${b0.strain}: ${t('losses')}`, sub: t('{n} left in {batch}', { n: n0(c.left(b0)), batch: b0.name ?? t('this batch') }), onClose: () => setMode('edit'), children: [_jsx(F, { label: t('Plants lost (died, culled)'), children: _jsx(NumIn, { value: loss, onChange: setLoss, autoFocus: true }) }), _jsx(SaveBar, { busy: busy, disabled: !loss || loss < 0 || loss > c.left(b0), saveLabel: t('Record loss'), onCancel: () => setMode('edit'), onSave: () => run(() => api.save('nursery_batches', { id: b0.id, lost: (b0.lost ?? 0) + loss, ...(loss === c.left(b0) ? { stage: delivered ? 'done' : 'cancelled' } : {}) }), t('{n} lost', { n: n0(loss) })) })] }));
    if (mode === 'plant' && b0.id)
        return _jsx(PlantMoms, { d: d, c: c, b: b0, api: api, flash: flash, onBack: () => setMode('edit'), onDone: async (m) => { onClose(); await onSaved(m); } });
    const sortRow = (n) => {
        const k = (f) => `s${n}_${f}`;
        return _jsxs("div", { className: "sortrow", children: [_jsx(F, { label: t('Sort {n}', { n }), children: _jsx(DateIn, { value: x[`sort${n}_on`], onChange: v => set({ [`sort${n}_on`]: v }) }) }), ['vigorous', 'minimal', 'none', 'dead'].map(f => _jsx(F, { label: t(f === 'none' ? 'No roots' : f === 'dead' ? 'Dead / contam.' : f === 'vigorous' ? 'Vigorous' : 'Minimal'), children: _jsx(NumIn, { value: x[k(f)], onChange: v => set({ [k(f)]: v }) }) }, f))] });
    };
    return (_jsxs(Sheet, { title: isNew ? t('Cuttings taken') : t('{strain} · {gen} batch', { strain: b0.strain, gen: GEN_LABEL[b0.gen ?? 4] }), sub: isNew ? t('One batch per strain per cut day') : `${b0.name ?? ''} · ${t('{n} left', { n: n0(c.left(b0)) })} · ${t(STAGE_LABEL[b0.stage ?? 'rooting'])}`, onClose: onClose, wide: true, children: [!isNew && (b0.stage === 'rooting' || b0.stage === 'ready') && _jsxs("div", { className: "row wrap docact", children: [b0.stage === 'rooting' && _jsx("button", { className: "primary", disabled: busy, onClick: () => { setGood(r ?? c.left(b0)); setMode('ready'); }, children: t('Mark ready…') }), (b0.gen ?? 4) < 4 && _jsx("button", { className: "primary", disabled: busy, onClick: () => setMode('plant'), children: t('Plant as {gen} moms…', { gen: GEN_LABEL[b0.gen] }) }), _jsx("button", { className: "ghost", disabled: busy, onClick: () => setMode('loss'), children: t('Record losses…') }), b0.stage === 'ready' && _jsx("button", { className: "ghost", disabled: busy, onClick: () => run(() => api.save('nursery_batches', { id: b0.id, stage: 'rooting' }), t('Back to rooting')), children: t('Back to rooting') })] }), _jsxs("div", { className: "grid3", children: [_jsx(F, { label: t('Generation'), children: _jsx(Pick, { value: gen, options: [4, 3, 2, 1].map(g => ({ v: g, l: t(GEN_WHAT[g]) })), onChange: v => set({ gen: v ?? 4, mother_id: null }) }) }), _jsx(F, { label: t('Strain'), children: _jsx(TextIn, { value: x.strain, list: "n-strains", onChange: v => set({ strain: v ?? '' }), autoFocus: isNew && !b0.strain }) }), _jsx(F, { label: t('Cut on'), children: _jsx(DateIn, { value: x.cut_on, onChange: v => set({ cut_on: v ?? today() }) }) }), _jsx(F, { label: t('Cuttings'), children: _jsx(NumIn, { value: x.cuttings, onChange: v => set({ cuttings: v ?? undefined }) }) }), _jsx(F, { label: t('Trays'), hint: t('({n} per tray)', { n: tray }), children: _jsx(NumIn, { value: x.trays ?? (x.cuttings ? Math.round(x.cuttings / tray * 10) / 10 : null), onChange: v => set({ trays: v }) }) }), _jsx(F, { label: t('Rooting in'), children: _jsx(Pick, { value: x.room_id, blank: "\u2014", options: d.rooms.filter(r => r.active || r.id === x.room_id).map(r => ({ v: r.id, l: `${r.name}${r.place !== 'Webb' ? ` (${r.place})` : ''}` })), onChange: v => set({ room_id: v }) }) }), _jsx(F, { label: t('Cut from'), hint: gen === 1 ? '' : t('({gen} lots)', { gen: GEN_LABEL[gen - 1] }), children: _jsx(Pick, { value: x.mother_id, blank: "\u2014", options: moms.map(m => ({ v: m.id, l: `${m.strain} ${GEN_LABEL[m.gen]} · ${[c.room(m.room_id), m.bed].filter(Boolean).join(' ') || t('no location')} · ${live(m)}` })), onChange: v => set({ mother_id: v }) }) }), _jsx(F, { label: t('Ready by'), hint: x.ready_on ? '' : t('({n} days)', { n: d.settings.rootDays }), children: _jsx(DateIn, { value: x.ready_on ?? (x.cut_on ? addDays(x.cut_on, d.settings.rootDays) : null), onChange: v => set({ ready_on: v }) }) }), gen === 4 ? _jsx(F, { label: t('For order'), hint: t('(optional)'), children: _jsx(Pick, { value: x.order_id, blank: t('Not for a particular order'), options: orders.map(o => ({ v: o.id, l: `${c.to(o)} · ${n0(o.plants)} · ${fmtD(o.deliver_on) || t('no date')}` })), onChange: v => set({ order_id: v }) }) })
                        : _jsx(F, { label: t('For season'), children: _jsx(NumIn, { value: x.season ?? (x.cut_on ? nextSeason(gen, x.cut_on) : null), onChange: v => set({ season: v }) }) })] }), _jsx(StrainList, { id: "n-strains", names: [...new Set([...d.mothers.filter(m => m.status === 'active').map(m => m.strain), ...d.strains])] }), _jsx(F, { label: t('METRC batch name'), children: _jsx(TextIn, { value: x.name, placeholder: autoName, onChange: v => set({ name: v }) }) }), _jsx(F, { label: t('Clone package tag (METRC)'), hint: t('one package for this cutting event'), children: _jsx(TagInput, { value: x.package_tag ?? '', onChange: v => set({ package_tag: v || null }), where: { site: x.site ?? site, type: 'package' }, autofill: isNew, disabled: busy }) }), _jsxs(F, { label: t('METRC tags'), hint: t('({n} of {of}: one per 100 plants)', { n: tags.length, of: tagsNeeded(x.cuttings ?? 1) }), children: [_jsx("textarea", { rows: Math.max(2, Math.min(6, tags.length + 1)), value: tagText, onChange: e => setTagText(e.target.value.toUpperCase()), placeholder: t('One tag per line') }), _jsxs("div", { className: "row", children: [_jsx("button", { type: "button", className: "ghost small", onClick: fillTags, disabled: busy || tags.length >= tagsNeeded(x.cuttings ?? 1), children: t('Fill next tags') }), _jsx(ScanButton, { onScan: t => setTagText(s => (s.trim() ? `${s.trim()}\n${t}` : t)), disabled: busy })] })] }), !isNew && _jsxs(_Fragment, { children: [_jsx("h3", { children: t('Rooting') }), _jsxs("div", { className: "grid3", children: [_jsx(F, { label: t('First roots seen'), children: _jsx(DateIn, { value: x.emerged_on, onChange: v => set({ emerged_on: v }) }) }), _jsx(F, { label: t('Moved outside'), children: _jsx(DateIn, { value: x.moved_out_on, onChange: v => set({ moved_out_on: v }) }) }), _jsxs("div", { className: "field", children: [_jsx("label", { children: t('Rooted so far') }), _jsx("div", { className: "calcline", children: r == null ? _jsx("span", { className: "muted", children: t('enter a sort') }) : _jsxs(_Fragment, { children: [_jsx("b", { children: n0(r) }), " ", t('of'), " ", n0(x.cuttings), " \u00B7 ", pct(x.cuttings ? r / x.cuttings : null), x.sort1_on && x.cut_on ? _jsxs("span", { className: "muted", children: [" \u00B7 ", t('{n} days to first sort', { n: daysBetween(x.cut_on, x.sort1_on) })] }) : ''] }) })] })] }), sortRow(1), sortRow(2), _jsx("p", { className: "muted small-note", children: t('Rooted = vigorous at sort 1 + vigorous at sort 2 (sort 2 re-sorts the minimal and no-root ones).') })] }), _jsx(F, { label: t('Notes'), children: _jsx(TextIn, { value: x.notes, onChange: v => set({ notes: v }) }) }), !isNew && delivered > 0 && _jsx("p", { className: "muted small-note", children: t('{n} plants from this batch were delivered.', { n: n0(delivered) }) }), _jsx(SaveBar, { busy: busy, disabled: !x.strain?.trim() || !(Number(x.cuttings) > 0) || !x.cut_on, saveLabel: isNew ? t('Add batch') : t('Save'), onCancel: onClose, onSave: save, onDelete: !isNew && !delivered ? () => run(() => api.remove('nursery_batches', b0.id), t('Batch deleted')) : undefined })] }));
}
/** G1-G3 batch planted out: becomes a mother lot (one tag per lot) */
function PlantMoms({ d, c, b, api, flash, onBack, onDone }) {
    const left = c.left(b);
    const kinds = b.gen === 3 ? ['hoop'] : ['bench', 'greenhouse', 'hoop'];
    const locs = d.rooms.filter(r => r.active && kinds.includes(r.kind));
    const [room, setRoom] = useState(locs[0]?.id ?? null);
    const [bed, setBed] = useState(null);
    const [qty, setQty] = useState(left);
    const [tag, setTag] = useState('');
    const [on, setOn] = useState(today());
    const [busy, setBusy] = useState(false);
    const r = d.rooms.find(x => x.id === room);
    const used = r ? d.mothers.filter(m => m.room_id === r.id && m.status === 'active' && (!bed || m.bed === bed)).reduce((a, m) => a + live(m), 0) : 0;
    const cap = r?.kind === 'hoop' ? (bed ? r.beds.find(x => x.bed === bed)?.cap : r.capacity) ?? null : null;
    const go = async () => {
        setBusy(true);
        try {
            await api.plantMoms(b.id, room, bed, qty, tag || null, on);
            await onDone(t('{n} {strain} {gen} moms planted', { n: n0(qty), strain: b.strain, gen: GEN_LABEL[b.gen] }) + (r ? ` · ${r.name}${bed ? ` ${bed}` : ''}` : ''));
        }
        catch (e) {
            flash(String(e.message ?? e).replace(/duplicate key.*plant_tag.*/, t('That tag is already on another mother lot')), true);
        }
        finally {
            setBusy(false);
        }
    };
    return (_jsxs(Sheet, { title: t('Plant {strain} as {gen} moms', { strain: b.strain, gen: GEN_LABEL[b.gen] }), sub: t('{n} plants left in {batch}. Plant them in one lot, or a few (one tag each).', { n: n0(left), batch: b.name ?? t('this batch') }), onClose: onBack, children: [_jsxs("div", { className: "grid3", children: [_jsx(F, { label: t('Where'), children: _jsx(Pick, { value: room, options: locs.map(x => ({ v: x.id, l: `${x.name}${x.place !== 'Webb' ? ` (${x.place})` : ''}` })), onChange: v => { setRoom(v); setBed(null); } }) }), r?.kind === 'hoop' && _jsx(F, { label: t('Bed'), children: _jsx(Pick, { value: bed, blank: "\u2014", options: (r.beds.length ? r.beds.map(x => x.bed) : ['A', 'B', 'C']).map(x => ({ v: x, l: x })), onChange: setBed }) }), _jsx(F, { label: t('Plants'), children: _jsx(NumIn, { value: qty, onChange: setQty }) }), _jsx(F, { label: t('Planted on'), children: _jsx(DateIn, { value: on, onChange: setOn }) })] }), _jsx(F, { label: t('METRC plant tag for this lot'), children: _jsxs("div", { className: "row", children: [_jsx(TagInput, { value: tag, onChange: setTag, where: { site: b.site, type: 'plant' }, disabled: busy }), _jsx("button", { type: "button", className: "ghost small", onClick: async () => { const t = (await api.nextTags(b.site, 1))[0]; if (t)
                                setTag(t); }, children: t('Next tag') })] }) }), cap != null && _jsxs("p", { className: `small-note ${used + (qty ?? 0) > cap ? 'warn-t' : 'muted'}`, children: [r.name, bed ? ` ${t('bed')} ${bed}` : '', ": ", t('{n} planted of {cap} spots', { n: n0(used), cap: n0(cap) }), used + (qty ?? 0) > cap ? ' ' + t('(this goes over)') : '', "."] }), _jsx(SaveBar, { busy: busy, disabled: !qty || qty <= 0 || qty > left, saveLabel: t('Plant {n}', { n: n0(qty) }), onCancel: onBack, onSave: go })] }));
}
