import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { rangeTxt } from '../mtag';
import { useState } from 'react';
import { daysBetween, fmtD, n0, n1, n2, plantingAcres, sum, today } from './calc';
import { Choices, DateIn, F, NumIn, Pick, SaveBar, SelAll, SelBar, SelBox, SelButton, Sheet, StrainList, TextIn, errText, useSel } from './ui';
import { TagRunBox, useHeldRuns } from './tagrun';
const SOURCES = [{ v: 'clone', l: 'Clone' }, { v: 'seed', l: 'Seed' }, { v: 'auto', l: 'Auto (seed)' }];
export function PlantingsTab({ d, c, site, q, api, flash, onSaved, openId }) {
    const [edit, setEdit] = useState(() => (openId != null ? d.plantings.find(p => p.id === openId) ?? null : null)); // 281: opened from a scanned tag
    const [rEdit, setREdit] = useState(null);
    const [view, setView] = useState('fields');
    const sel = useSel();
    const ql = q.trim().toLowerCase();
    const ps = d.plantings.filter(p => (!site || p.site === site) && (!ql || `${p.strain} ${p.nursery ?? ''} ${p.notes ?? ''}`.toLowerCase().includes(ql)));
    const groups = new Map();
    for (const p of ps) {
        const k = `${p.site}|${p.field_id ?? ''}`;
        (groups.get(k) ?? groups.set(k, []).get(k)).push(p);
    }
    const fieldOf = (k) => { const [s, f] = k.split('|'); return { site: s, f: f ? c.field.get(Number(f)) : undefined }; };
    const order = [...groups.keys()].sort((a, b) => { const x = fieldOf(a), y = fieldOf(b); return x.site.localeCompare(y.site) || (x.f?.sort ?? 99) - (y.f?.sort ?? 99); });
    const harvestedOf = (p) => d.harvests.filter(h => h.planting_id === p.id && h.status === 'done');
    const now = today();
    // receiving: received - rejected - planted, by strain and batch
    const plantedBy = new Map();
    for (const p of d.plantings) {
        const k = `${p.site}|${p.strain.toLowerCase()}|${p.batch ?? 1}`;
        plantedBy.set(k, (plantedBy.get(k) ?? 0) + (p.plants ?? 0) + (p.plant_loss ?? 0));
    }
    const rs = d.receipts.filter(r => (!site || r.site === site) && (!ql || r.strain.toLowerCase().includes(ql)));
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "row toolbar", children: [_jsxs("div", { className: "seg", children: [_jsx("button", { className: view === 'fields' ? 'on' : '', onClick: () => setView('fields'), children: "By field" }), _jsx("button", { className: view === 'receiving' ? 'on' : '', onClick: () => setView('receiving'), children: "Plants received" })] }), view === 'fields'
                        ? _jsxs(_Fragment, { children: [_jsx(SelButton, { sel: sel }), _jsx("button", { className: "primary", onClick: () => setEdit({ crop_year: d.year, site: site ?? 'OHR', source: 'clone', batch: 1 }), children: "+ Add planting" })] })
                        : _jsx("button", { className: "primary", onClick: () => setREdit({ crop_year: d.year, site: site ?? 'OHR', source: 'clone', batch: 1, received: 0, rejected: 0, received_on: now }), children: "+ Plants received" })] }), view === 'fields' && _jsxs(_Fragment, { children: [_jsxs("div", { className: "ckpis", children: [_jsxs("div", { children: [_jsx("b", { children: n0(sum(ps.filter(p => p.source === 'clone').map(p => p.plants))) }), _jsx("span", { children: "clones planted" })] }), _jsxs("div", { children: [_jsx("b", { children: n1(sum(ps.filter(p => p.source === 'clone').map(p => plantingAcres(p, c.site.get(p.site))))) }), _jsx("span", { children: "acres of clones" })] }), _jsxs("div", { children: [_jsx("b", { children: n0(sum(ps.filter(p => p.source !== 'clone').map(p => p.plants))) }), _jsx("span", { children: "seeded plants (biomass)" })] }), _jsxs("div", { children: [_jsx("b", { children: new Set(ps.map(p => p.strain.toLowerCase())).size }), _jsx("span", { children: "strains" })] }), _jsxs("div", { children: [_jsx("b", { children: ps.length }), _jsx("span", { children: "plantings" })] })] }), order.map(k => {
                        const { site: s, f } = fieldOf(k);
                        const list = groups.get(k).sort((a, b) => (a.planted_on ?? '').localeCompare(b.planted_on ?? '') || a.strain.localeCompare(b.strain));
                        const ac = sum(list.map(p => plantingAcres(p, c.site.get(p.site))));
                        return (_jsxs("div", { children: [_jsxs("h3", { className: "csec", children: [s, " ", f ? `${f.code}` : '(no field)', " ", _jsxs("span", { className: "muted", children: [f?.name, " \u00B7 ", n0(sum(list.map(p => p.plants))), " plants \u00B7 ", n2(ac), " ac", f?.acres ? ` of ${n2(f.acres)}` : ''] })] }), _jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx(SelAll, { sel: sel, ids: list.map(p => p.id) }), _jsx("th", { children: "Strain" }), _jsx("th", { children: "Planted" }), _jsx("th", { className: "num", children: "Plants" }), _jsx("th", { className: "num hide-s", children: "Spacing" }), _jsx("th", { className: "num", children: "Acres" }), _jsx("th", { className: "hide-s", children: "Nursery" }), _jsx("th", { className: "num", children: "Est. lbs/pl" }), _jsx("th", { className: "hide-s", children: "First flower" }), _jsx("th", { children: "Harvested" })] }) }), _jsx("tbody", { children: list.map(p => {
                                                    const hs = harvestedOf(p);
                                                    return (_jsxs("tr", { className: "tap", onClick: () => sel.on ? sel.toggle(p.id) : setEdit(p), children: [_jsx(SelBox, { sel: sel, id: p.id }), _jsxs("td", { children: [p.strain, p.trial && _jsxs(_Fragment, { children: [" ", _jsx("span", { className: "kpill k-trial", title: "Trial", children: "T" })] }), p.batch && p.batch > 1 ? _jsxs("span", { className: "muted", children: [" \u00B7 batch ", p.batch] }) : null, p.source !== 'clone' && _jsxs("span", { className: "muted", children: [" \u00B7 ", p.source] })] }), _jsx("td", { className: "nowrap", children: fmtD(p.planted_on) }), _jsx("td", { className: "num", children: n0(p.plants) }), _jsx("td", { className: "num hide-s", children: p.spacing_in ? `${p.spacing_in}"` : '' }), _jsx("td", { className: "num", children: n2(plantingAcres(p, c.site.get(p.site))) }), _jsx("td", { className: "hide-s", children: p.nursery ?? '' }), _jsx("td", { className: "num", children: n2(p.est_lbs_per_plant) }), _jsx("td", { className: "hide-s nowrap", children: fmtD(p.first_flower) }), _jsx("td", { className: "nowrap small", children: hs.length ? hs.map(h => fmtD(h.harvested_on)).join(', ') : p.planted_on ? _jsxs("span", { className: "muted", children: [daysBetween(p.planted_on, now), " days in"] }) : '' })] }, p.id));
                                                }) })] }) })] }, k));
                    }), !ps.length && _jsxs("p", { className: "muted", children: ["No plantings for ", d.year, site ? ` at ${site}` : '', "."] })] }), view === 'receiving' && _jsxs(_Fragment, { children: [_jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Strain" }), _jsx("th", { children: "Batch" }), _jsx("th", { children: "Site" }), _jsx("th", { children: "Nursery" }), _jsx("th", { children: "Received" }), _jsx("th", { className: "num", children: "Plants" }), _jsx("th", { className: "num", children: "Rejected" }), _jsx("th", { className: "num", children: "Planted" }), _jsx("th", { className: "num", children: "Left over" })] }) }), _jsxs("tbody", { children: [rs.map(r => {
                                            const planted = plantedBy.get(`${r.site}|${r.strain.toLowerCase()}|${r.batch}`) ?? 0;
                                            const left = r.received - r.rejected - planted;
                                            return (_jsxs("tr", { className: "tap", onClick: () => setREdit(r), children: [_jsx("td", { children: r.strain }), _jsx("td", { children: r.batch }), _jsx("td", { children: r.site }), _jsx("td", { children: r.nursery ?? '' }), _jsx("td", { className: "nowrap", children: fmtD(r.received_on) }), _jsx("td", { className: "num", children: n0(r.received) }), _jsx("td", { className: "num", children: n0(r.rejected) || '' }), _jsx("td", { className: "num", children: n0(planted) }), _jsx("td", { className: `num ${left < 0 ? 'neg' : ''}`, children: n0(left) })] }, r.id));
                                        }), !rs.length && _jsx("tr", { children: _jsxs("td", { colSpan: 9, className: "muted", children: ["Nothing received for ", d.year, "."] }) })] })] }) }), _jsx("p", { className: "cnote", children: "Planted counts plants in the field plus counted losses for the same strain and batch. Negative left over usually means a batch number doesn't match between receiving and planting." })] }), _jsx(SelBar, { sel: sel, noun: "planting", actions: [{ label: 'Delete', danger: true, run: async (ids) => {
                            try {
                                await api.removeMany('cult_plantings', ids);
                                await onSaved(`Deleted ${ids.length} plantings`);
                            }
                            catch (e) {
                                flash(errText(e), true);
                            }
                        } }] }), edit && _jsx(PlantingSheet, { d: d, c: c, p: edit, api: api, flash: flash, onClose: () => setEdit(null), onSaved: async (m) => { setEdit(null); await onSaved(m); } }), rEdit && _jsx(ReceiptSheet, { d: d, r: rEdit, api: api, flash: flash, onClose: () => setREdit(null), onSaved: async (m) => { setREdit(null); await onSaved(m); } })] }));
}
const fieldOpts = (fields, site, cur) => fields.filter(f => f.site === site && (f.active || f.id === cur)).map(f => ({ v: f.id, l: `${f.code}  (${f.name})` }));
function PlantingSheet({ d, c, p, api, flash, onClose, onSaved }) {
    const [x, setX] = useState(p);
    const [busy, setBusy] = useState(false);
    const set = (v) => setX(o => ({ ...o, ...v }));
    const run = async (f, m) => { setBusy(true); try {
        await f();
        await onSaved(m);
    }
    catch (e) {
        flash(errText(e), true);
    }
    finally {
        setBusy(false);
    } };
    const site = c.site.get(x.site ?? 'OHR');
    const held = useHeldRuns(api.sb, p.id);
    const autoAcres = x.plants && x.spacing_in ? plantingAcres({ ...x, acres: null }, site) : null;
    return (_jsxs(Sheet, { title: p.id ? p.strain : 'Add planting', sub: p.id ? `${p.site} ${c.field.get(p.field_id ?? -1)?.code ?? ''} · planted ${fmtD(p.planted_on)}` : undefined, onClose: onClose, wide: true, children: [_jsx(StrainList, { id: "cult-strains", names: d.strains.map(s => s.name) }), _jsxs("div", { className: "grid2", children: [_jsx(F, { label: "Strain", children: _jsx(TextIn, { value: x.strain, list: "cult-strains", autoFocus: !p.id, onChange: v => set({ strain: v ?? '' }) }) }), _jsx(F, { label: "Site", children: _jsx(Choices, { value: x.site ?? 'OHR', options: d.sites.map(s => ({ v: s.code, l: s.code })), onChange: v => set({ site: v, field_id: null }) }) }), _jsx(F, { label: "Field", children: _jsx(Pick, { value: x.field_id ?? null, blank: "Pick a field\u2026", options: fieldOpts(d.fields, x.site, x.field_id), onChange: v => set({ field_id: v }) }) }), _jsx(F, { label: "Source", children: _jsx(Choices, { value: x.source ?? 'clone', options: SOURCES, onChange: v => set({ source: v }) }) })] }), _jsxs("div", { className: "grid3", children: [_jsx(F, { label: "Planted on", children: _jsx(DateIn, { value: x.planted_on, onChange: v => set({ planted_on: v }) }) }), _jsx(F, { label: "Batch", children: _jsx(NumIn, { value: x.batch, onChange: v => set({ batch: v }) }) }), _jsx(F, { label: "Nursery", children: _jsx(TextIn, { value: x.nursery, list: "cult-nurseries", onChange: v => set({ nursery: v }) }) }), _jsx(F, { label: "Plants in field", children: _jsx(NumIn, { value: x.plants, onChange: v => set({ plants: v }) }) }), _jsx(F, { label: "Plant loss", children: _jsx(NumIn, { value: x.plant_loss, onChange: v => set({ plant_loss: v }) }) }), _jsx(F, { label: "Spacing", hint: "inches", children: _jsx(NumIn, { value: x.spacing_in, onChange: v => set({ spacing_in: v }) }) }), _jsx(F, { label: "Beds", children: _jsx(NumIn, { value: x.beds, onChange: v => set({ beds: v }) }) }), _jsx(F, { label: "Acres", hint: autoAcres ? '(blank = from spacing)' : '', children: _jsx(NumIn, { value: x.acres, placeholder: autoAcres ? n2(autoAcres) : '', onChange: v => set({ acres: v }) }) }), _jsx(F, { label: "Est. FF lbs / plant", children: _jsx(NumIn, { value: x.est_lbs_per_plant, onChange: v => set({ est_lbs_per_plant: v }) }) }), _jsx(F, { label: "First flower", children: _jsx(DateIn, { value: x.first_flower, onChange: v => set({ first_flower: v }) }) }), _jsx(F, { label: "License", children: _jsx(TextIn, { value: x.license, placeholder: site?.license ?? '', onChange: v => set({ license: v }) }) }), x.source !== 'clone' && _jsx(F, { label: "Seed lbs", children: _jsx(NumIn, { value: x.seed_lbs, onChange: v => set({ seed_lbs: v }) }) })] }), _jsx("datalist", { id: "cult-nurseries", children: [...new Set(d.plantings.map(p => p.nursery).filter(Boolean))].map(n => _jsx("option", { value: n }, n)) }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: x.trial ?? !!d.strains.find(s => s.name.toLowerCase() === (x.strain ?? '').toLowerCase())?.trial, onChange: e => set({ trial: e.target.checked }) }), " ", _jsxs("span", { children: ["Trial planting ", _jsx("span", { className: "muted", children: "(its pallets are T pallets; on by default for trial strains)" })] })] }), _jsx(F, { label: "Notes", children: _jsx("textarea", { value: x.notes ?? '', onChange: e => set({ notes: e.target.value || null }) }) }), x.plants && x.est_lbs_per_plant ? _jsxs("p", { className: "cnote", children: ["Projected ", n0(x.plants * x.est_lbs_per_plant), " lbs fresh frozen."] }) : null, p.id && _jsxs("div", { className: "cnote", children: [_jsx(TagRunBox, { sb: api.sb, plantingId: p.id, purpose: "batch", need: Math.ceil((p.plants ?? 0) / 100), held: held.get('batch'), onChange: held.reload }), !p.flipped_on && _jsx(TagRunBox, { sb: api.sb, plantingId: p.id, purpose: "flower", need: Math.max(0, p.plants ?? 0), held: held.get('flower'), onChange: held.reload })] }), p.id && _jsx(FlipBox, { p: p, busy: busy, run: held.get('flower'), onFlip: on => run(() => api.flip(p.id, on), 'Flipped to flowering. It is on the METRC to-do list.') }), _jsx(SaveBar, { busy: busy, disabled: !x.strain?.trim() || !x.site, onCancel: onClose, onSave: () => run(() => api.save('cult_plantings', { ...x, license: x.license ?? site?.license ?? null }), p.id ? 'Saved' : 'Planting added'), onDelete: p.id ? () => run(() => api.remove('cult_plantings', p.id), 'Planting deleted') : undefined })] }));
}
/** flip to flowering: the METRC to-do promotes the planting's immature plants with plant tags (overnight, Compliance) */
function FlipBox({ p, busy, run, onFlip }) {
    const [on, setOn] = useState(today());
    if (p.flipped_on)
        return _jsxs("p", { className: "cnote", children: ["Flipped to flowering ", fmtD(p.flipped_on), p.flipped_by ? ` by ${p.flipped_by.split('@')[0]}` : '', run ? `, tags ${rangeTxt(run.first_label, run.last_label)}` : '', "."] });
    const left = p.plants ?? 0; // Plants in field is already net of loss
    const ready = !!run && run.tags === left;
    return _jsxs("div", { className: "cnote row wrap", style: { alignItems: 'center', gap: 8 }, children: [_jsxs("span", { children: ["Flip ", n0(left), " plants to flowering on"] }), _jsx(DateIn, { value: on, onChange: setOn }), _jsx("button", { className: "ghost small", disabled: busy || left <= 0 || !ready, onClick: () => { if (confirm(`Flip ${n0(left)} ${p.strain} plants to flowering with tags ${rangeTxt(run.first_label, run.last_label)}? ${left > 2000 ? 'This many goes on the overnight run.' : 'Compliance can send it right away.'}`))
                    onFlip(on); }, children: "Flip to flowering" }), !ready && left > 0 && _jsxs("span", { className: "muted", children: ["Pick the flowering tags first (", n0(left), ", one per plant)."] })] });
}
function ReceiptSheet({ d, r, api, flash, onClose, onSaved }) {
    const [x, setX] = useState(r);
    const [busy, setBusy] = useState(false);
    const set = (v) => setX(o => ({ ...o, ...v }));
    const run = async (f, m) => { setBusy(true); try {
        await f();
        await onSaved(m);
    }
    catch (e) {
        flash(errText(e), true);
    }
    finally {
        setBusy(false);
    } };
    return (_jsxs(Sheet, { title: r.id ? `${r.strain} received` : 'Plants received', onClose: onClose, children: [_jsx(StrainList, { id: "cult-strains", names: d.strains.map(s => s.name) }), _jsxs("div", { className: "grid2", children: [_jsx(F, { label: "Strain", children: _jsx(TextIn, { value: x.strain, list: "cult-strains", autoFocus: !r.id, onChange: v => set({ strain: v ?? '' }) }) }), _jsx(F, { label: "Site", children: _jsx(Choices, { value: x.site ?? 'OHR', options: d.sites.map(s => ({ v: s.code, l: s.code })), onChange: v => set({ site: v }) }) }), _jsx(F, { label: "Received on", children: _jsx(DateIn, { value: x.received_on, onChange: v => set({ received_on: v }) }) }), _jsx(F, { label: "Batch", children: _jsx(NumIn, { value: x.batch, onChange: v => set({ batch: v ?? 1 }) }) }), _jsx(F, { label: "Plants received", children: _jsx(NumIn, { value: x.received, onChange: v => set({ received: v ?? 0 }) }) }), _jsx(F, { label: "Rejected", hint: "unplantable", children: _jsx(NumIn, { value: x.rejected, onChange: v => set({ rejected: v ?? 0 }) }) }), _jsx(F, { label: "Nursery", children: _jsx(TextIn, { value: x.nursery, onChange: v => set({ nursery: v }) }) }), _jsx(F, { label: "Source", children: _jsx(Choices, { value: x.source ?? 'clone', options: SOURCES, onChange: v => set({ source: v }) }) })] }), _jsx(F, { label: "Notes", children: _jsx(TextIn, { value: x.notes, onChange: v => set({ notes: v }) }) }), _jsx(SaveBar, { busy: busy, disabled: !x.strain?.trim(), onCancel: onClose, onSave: () => run(() => api.save('cult_receipts', x), 'Saved'), onDelete: r.id ? () => run(() => api.remove('cult_receipts', r.id), 'Removed') : undefined })] }));
}
