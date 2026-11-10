import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useRef, useState } from 'react';
import { KIND_LABEL, KIND_SHORT, addDays, calcHarvest, fieldName, fmtD, isBiomass, monday, n0, n1, n2, pct, sum, today } from './calc';
import { Choices, DateIn, F, NumIn, Pick, SaveBar, SelAll, SelBar, SelBox, SelButton, Sheet, StrainList, TextIn, errText, useSel } from './ui';
export function ScheduleTab({ d, c, site, q, onOpen, api, flash, onSaved }) {
    const sel = useSel();
    const bulk = (f, m) => async () => { try {
        await f();
        await onSaved(m);
    }
    catch (e) {
        flash(errText(e), true);
    } };
    const [mode, setMode] = useState('all'); // 255: everything by default, filter from there
    const [kind, setKind] = useState('all');
    const now = today();
    const ql = q.trim().toLowerCase();
    const rows = useMemo(() => d.harvests.filter(h => (!site || h.site === site) &&
        (kind === 'all' || (kind === 'biomass') === isBiomass(h.kind)) &&
        (mode === 'all' || (mode === 'done' ? h.status === 'done' : h.status === 'planned' && (!h.planned_on || h.planned_on >= addDays(now, -7)))) &&
        (!ql || `${h.strain} ${fieldName(c, h.field_id)} ${h.site} ${h.notes ?? ''}`.toLowerCase().includes(ql))).sort((a, b) => (a.planned_on ?? '9999').localeCompare(b.planned_on ?? '9999') || (a.sched_order ?? 1e9) - (b.sched_order ?? 1e9) || a.site.localeCompare(b.site) || a.strain.localeCompare(b.strain)), [d, c, site, mode, kind, ql]);
    const weeks = new Map();
    for (const h of rows) {
        const w = h.planned_on ? monday(h.planned_on) : 'none';
        (weeks.get(w) ?? weeks.set(w, []).get(w)).push(h);
    }
    const trialOf = (h) => !!(h.planting_id && c.planting.get(h.planting_id)?.trial) || c.field.get(h.field_id ?? -1)?.kind === 'trials';
    // drag a planned harvest to reorder (desktop): it takes the date of the row it's dropped next to, and its place in that day
    const drag = useRef(null);
    const [drop, setDrop] = useState(null);
    const canDrag = mode !== 'done' && !sel.on; // HS-1: drag and the row date picker work in All and Coming up (they only touch planned harvests)
    const [bulkDate, setBulkDate] = useState(null);
    // phones / tablets: drag by the ⠿ handle (pointer events), with the page scrolling near the top or bottom edge
    const [dragging, setDragging] = useState(null);
    const scrollTimer = useRef(null);
    const stopScroll = () => { if (scrollTimer.current) {
        clearInterval(scrollTimer.current);
        scrollTimer.current = null;
    } };
    function touchOver(x, y) {
        const tr = document.elementFromPoint(x, y)?.closest('tr[data-hid]');
        const t = tr ? rows.find(r => r.id === Number(tr.dataset.hid)) : undefined;
        if (t && t.status === 'planned' && t.planned_on && t.id !== drag.current) {
            const r = tr.getBoundingClientRect();
            const after = y > r.top + r.height / 2;
            if (drop?.id !== t.id || drop.after !== after)
                setDrop({ id: t.id, after });
        }
        stopScroll();
        const edge = 70, v = y < edge ? -14 : y > window.innerHeight - edge ? 14 : 0;
        // HS-1: scroll whatever actually scrolls (on phones and tablets that's the app frame, not the window)
        const sc = (() => {
            let e = document.querySelector('tr[data-hid]')?.parentElement ?? null;
            while (e) {
                const o = getComputedStyle(e).overflowY;
                if (/auto|scroll/.test(o) && e.scrollHeight > e.clientHeight)
                    return e;
                e = e.parentElement;
            }
            return null;
        })();
        if (v)
            scrollTimer.current = window.setInterval(() => { if (sc)
                sc.scrollTop += v;
            else
                window.scrollBy(0, v); }, 30);
    }
    async function move(id, target, after) {
        const h = rows.find(x => x.id === id);
        if (!h || !target.planned_on || id === target.id)
            return;
        const day = rows.filter(x => x.planned_on === target.planned_on && x.id !== id);
        const at = day.findIndex(x => x.id === target.id) + (after ? 1 : 0);
        day.splice(at, 0, h);
        try {
            for (let i = 0; i < day.length; i++) {
                const x = day[i], o = (i + 1) * 10;
                if (x.id === id)
                    await api.save('cult_harvests', { id, planned_on: target.planned_on, sched_order: o });
                else if (x.sched_order !== o)
                    await api.save('cult_harvests', { id: x.id, sched_order: o });
            }
            await onSaved(`${h.strain} moved to ${fmtD(target.planned_on, true)}, #${at + 1} that day`);
        }
        catch (e) {
            flash(/sched_order/.test(errText(e)) ? 'Run 088_harvest_order.sql in Supabase first' : errText(e), true);
        }
    }
    const late = d.harvests.filter(h => h.status === 'planned' && h.planned_on && h.planned_on < now && (!site || h.site === site));
    // 255: summary cards over the schedule (same site and type filters, ignores the status filter)
    const base = d.harvests.filter(h => (!site || h.site === site) && (kind === 'all' || (kind === 'biomass') === isBiomass(h.kind)));
    const wk0 = monday(now), wk1 = addDays(wk0, 6);
    const thisWeek = base.filter(h => h.planned_on && h.planned_on >= wk0 && h.planned_on <= wk1);
    const upcoming = base.filter(h => h.status === 'planned' && h.planned_on && h.planned_on >= now);
    const estUp = sum(upcoming.map(h => { const k = calcHarvest(c, h); return h.kind === 'ff' ? k.estFF : null; }));
    const doneN = base.filter(h => h.status === 'done').length;
    const lateN = late.filter(h => kind === 'all' || (kind === 'biomass') === isBiomass(h.kind)).length;
    const cnt = { all: base.length, upcoming: base.filter(h => h.status === 'planned' && (!h.planned_on || h.planned_on >= addDays(now, -7))).length, done: doneN };
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "invcards", children: [_jsxs("div", { className: "icard", children: [_jsx("span", { children: "This week" }), _jsx("b", { children: thisWeek.length }), _jsxs("small", { children: [n0(sum(thisWeek.filter(h => !isBiomass(h.kind)).map(h => h.plants))), " plants"] })] }), _jsxs("div", { className: "icard", children: [_jsx("span", { children: "Coming up" }), _jsx("b", { children: upcoming.length }), _jsxs("small", { children: [n0(estUp), " lbs FF estimated"] })] }), _jsxs("div", { className: "icard", children: [_jsx("span", { children: "Harvested" }), _jsx("b", { children: doneN }), _jsxs("small", { children: ["of ", base.length, " this season"] })] }), _jsxs("div", { className: `icard ${lateN ? 'warn' : ''}`, children: [_jsx("span", { children: "Past date, not logged" }), _jsx("b", { children: lateN }), _jsx("small", { children: lateN ? 'open to log or move' : 'all caught up' })] })] }), _jsxs("div", { className: "row toolbar", children: [_jsx("div", { className: "seg", children: ['upcoming', 'all', 'done'].map(m => _jsxs("button", { className: mode === m ? 'on' : '', onClick: () => setMode(m), children: [m === 'upcoming' ? 'Coming up' : m === 'all' ? 'All' : 'Harvested', " ", _jsx("span", { className: "segn", children: cnt[m] })] }, m)) }), _jsx(Pick, { value: kind, onChange: v => setKind(v ?? 'all'), options: [{ v: 'all', l: 'Flower + biomass' }, { v: 'flower', l: 'Flower only' }, { v: 'biomass', l: 'Biomass only' }] }), _jsx(SelButton, { sel: sel }), _jsx("button", { className: "primary", onClick: () => onOpen({ crop_year: d.year, site: site ?? 'OHR', kind: 'ff', status: 'planned', raw_bins: [] }), children: "+ Add harvest" })] }), late.length > 0 && mode !== 'done' && _jsxs("p", { className: "cnote", children: [late.length, " harvest", late.length === 1 ? ' is' : 's are', " past ", late.length === 1 ? 'its' : 'their', " date and not logged yet. Open ", late.length === 1 ? 'it' : 'them', " to log what came in, move the date or cancel."] }), !rows.length && _jsxs("p", { className: "muted", children: ["Nothing here. ", mode === 'upcoming' ? 'Try All.' : ''] }), rows.length > 0 && (_jsx("div", { className: "cwrap fit", children: _jsxs("table", { className: "ctable schedt", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx(SelAll, { sel: sel, ids: rows.map(h => h.id) }), canDrag && _jsx("th", { className: "hdl", "aria-label": "Drag" }), _jsx("th", { children: "Date" }), _jsx("th", { children: "Strain" }), _jsx("th", { className: "hide-s", children: "Field" }), _jsx("th", { className: "hide-s", children: "Type" }), _jsx("th", { className: "num", children: "Plants" }), _jsx("th", { className: "num", children: "Lbs" }), _jsx("th", { className: "num hide-s", children: "Deleaf" }), _jsx("th", { className: "num hide-s", children: "Buck" }), _jsx("th", { className: "num hide-s", children: "Dry ice" }), _jsx("th", { children: "Status" })] }) }), _jsx("tbody", { children: [...weeks.entries()].map(([w, hs]) => {
                                const ks = hs.map(h => calcHarvest(c, h));
                                return [
                                    _jsxs("tr", { className: "wk", children: [_jsx("td", { colSpan: (sel.on ? 3 : 2) + (canDrag ? 1 : 0), children: w === 'none' ? 'No date yet' : `Week of ${fmtD(w)}` }), _jsx("td", { className: "hide-s" }), _jsx("td", { className: "hide-s" }), _jsx("td", { className: "num", children: n0(sum(hs.filter(h => !isBiomass(h.kind)).map(h => h.plants))) }), _jsx("td", { className: "num", children: n0(sum(ks.map((k, i) => hs[i].kind === 'ff' ? (k.actFF ?? k.estFF) : null))) }), _jsx("td", { className: "num hide-s" }), _jsx("td", { className: "num hide-s" }), _jsx("td", { className: "num hide-s", children: n0(sum(ks.map(k => k.dryIce))) }), _jsx("td", {})] }, w),
                                    ...hs.map((h, i) => {
                                        const k = ks[i];
                                        const lbs = h.kind === 'ff' ? (k.actFF != null ? _jsxs(_Fragment, { children: [_jsx("b", { children: n0(k.actFF) }), " ", _jsx("span", { className: "muted", children: "\u2713" })] }) : n0(k.estFF))
                                            : h.kind === 'dry' ? (k.actRaw != null ? _jsxs(_Fragment, { children: [_jsx("b", { children: n0(k.actRaw) }), " ", _jsx("span", { className: "muted", children: "raw \u2713" })] }) : k.estRaw != null ? _jsxs("span", { title: "raw lbs", children: [n0(k.estRaw), " raw"] }) : '')
                                                : k.estBiomass != null ? `${n0(k.estBiomass)} dry` : h.acres ? `${n1(h.acres)} ac` : '';
                                        return (_jsxs("tr", { "data-hid": h.id, className: `tap ${h.status}${dragging === h.id ? ' dragging' : ''}${drop?.id === h.id ? (drop.after ? ' dropa' : ' dropb') : ''}`, onClick: () => sel.on ? sel.toggle(h.id) : onOpen(h), draggable: canDrag && h.status === 'planned', onDragStart: e => { drag.current = h.id; e.dataTransfer.effectAllowed = 'move'; }, onDragEnd: () => { drag.current = null; setDrop(null); }, onDragOver: e => {
                                                if (!canDrag || drag.current == null || !h.planned_on || h.status !== 'planned')
                                                    return;
                                                e.preventDefault();
                                                const r = e.currentTarget.getBoundingClientRect();
                                                const after = e.clientY > r.top + r.height / 2;
                                                if (drop?.id !== h.id || drop.after !== after)
                                                    setDrop({ id: h.id, after });
                                            }, onDrop: e => { e.preventDefault(); const id = drag.current; const a = drop?.after ?? false; drag.current = null; setDrop(null); if (id != null)
                                                move(id, h, a); }, children: [_jsx(SelBox, { sel: sel, id: h.id }), canDrag && _jsx("td", { className: "hdl", onClick: e => e.stopPropagation(), children: h.status === 'planned' && h.planned_on && _jsx("span", { className: "hdl-grip", role: "button", "aria-label": `Drag ${h.strain}`, onPointerDown: e => { if (e.button > 0)
                                                            return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = h.id; setDragging(h.id); }, onPointerMove: e => { if (drag.current !== h.id)
                                                            return; touchOver(e.clientX, e.clientY); }, onPointerUp: () => { const t = drop, id = drag.current; drag.current = null; setDragging(null); setDrop(null); stopScroll(); const tgt = t && rows.find(x => x.id === t.id); if (id != null && tgt)
                                                            move(id, tgt, t.after); }, onPointerCancel: () => { drag.current = null; setDragging(null); setDrop(null); stopScroll(); }, children: "\u283F" }) }), _jsxs("td", { className: "nowrap", children: [h.status === 'planned' && !sel.on
                                                            ? _jsxs("span", { className: "cdatew", onClick: e => e.stopPropagation(), children: [_jsx("b", { className: "cdow", children: h.planned_on ? new Date(`${h.planned_on}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' }) : '' }), _jsx("input", { type: "date", className: "cdate", value: h.planned_on ?? '', "aria-label": `${h.strain} harvest date`, onChange: e => { const v = e.target.value || null; if (v !== h.planned_on)
                                                                            bulk(() => api.save('cult_harvests', { id: h.id, planned_on: v }), `${h.strain} moved to ${fmtD(v, true)}`)(); } })] })
                                                            : fmtD(h.planned_on, true), h.status === 'done' && h.harvested_on && h.harvested_on !== h.planned_on && _jsxs("div", { className: "muted small", children: ["cut ", fmtD(h.harvested_on)] })] }), _jsxs("td", { children: [h.strain, trialOf(h) && _jsxs(_Fragment, { children: [" ", _jsx("span", { className: "kpill k-trial", title: "Trial strain", children: "Trial" })] }), (h.day_no ?? 1) > 1 && _jsxs(_Fragment, { children: [" ", _jsxs("span", { className: "kpill s-planned", children: ["Day ", h.day_no] })] }), h.planted_strain && h.planted_strain !== h.strain && _jsxs("div", { className: "muted small", children: ["planted as ", h.planted_strain] }), _jsxs("div", { className: "show-s", children: [_jsxs("span", { className: "fpill", children: [h.site, " ", fieldName(c, h.field_id)] }), _jsx("span", { className: `kpill k-${h.kind}`, children: KIND_SHORT[h.kind] })] }), h.notes && _jsx("div", { className: "muted small", children: h.notes.length > 60 ? h.notes.slice(0, 60) + '…' : h.notes })] }), _jsx("td", { className: "hide-s", children: _jsxs("span", { className: "fpill", children: [h.site, " ", fieldName(c, h.field_id)] }) }), _jsx("td", { className: "hide-s", children: _jsx("span", { className: `kpill k-${h.kind}`, children: KIND_SHORT[h.kind] }) }), _jsx("td", { className: "num", children: n0(h.status === 'done' ? (h.plants_harvested ?? h.plants) : h.plants) }), _jsx("td", { className: "num", children: lbs }), _jsx("td", { className: "num hide-s", children: k.deleafPeople != null && h.status !== 'done' ? `${k.deleafPeople} ppl` : '' }), _jsx("td", { className: "num hide-s", children: k.buckPeople != null && h.status !== 'done' ? `${k.buckPeople} ppl` : '' }), _jsx("td", { className: "num hide-s", children: h.status !== 'done' ? n0(k.dryIce) : '' }), _jsx("td", { children: _jsx("span", { className: `kpill s-${h.status}`, children: h.status === 'done' ? `Harvested${k.pallets.length ? ` · ${k.pallets.length} pal` : ''}` : h.status === 'planned' ? (h.planned_on && h.planned_on < now ? 'Not logged' : 'Planned') : 'Cancelled' }) })] }, h.id));
                                    }),
                                ];
                            }) })] }) })), _jsx(SelBar, { sel: sel, noun: "harvest", actions: [
                    { label: 'Change date', run: async (ids) => setBulkDate({ ids, v: null }) },
                    { label: 'Cancel harvests', run: async (ids) => bulk(() => api.updateMany('cult_harvests', ids, { status: 'cancelled' }), `${ids.length} cancelled`)() },
                    { label: 'Back to planned', run: async (ids) => bulk(() => api.updateMany('cult_harvests', ids, { status: 'planned' }), `${ids.length} back to planned`)() },
                    { label: 'Delete', danger: true, run: async (ids) => bulk(() => api.removeMany('cult_harvests', ids), `Deleted ${ids.length} harvests`)() }
                ] }), bulkDate && _jsxs(Sheet, { title: `Change date · ${bulkDate.ids.length} harvest${bulkDate.ids.length === 1 ? '' : 's'}`, onClose: () => setBulkDate(null), children: [_jsx(F, { label: "New harvest date", children: _jsx(DateIn, { value: bulkDate.v, onChange: v => setBulkDate({ ...bulkDate, v }) }) }), _jsx("p", { className: "cnote", children: "Moves every selected harvest to this day. Harvests already logged keep their date." }), _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost", onClick: () => setBulkDate(null), children: "Cancel" }), _jsx("button", { className: "primary", disabled: !bulkDate.v, onClick: async () => {
                                    const ids = bulkDate.ids.filter(id => d.harvests.find(x => x.id === id)?.status !== 'done');
                                    const v = bulkDate.v;
                                    setBulkDate(null);
                                    sel.stop();
                                    await bulk(() => api.updateMany('cult_harvests', ids, { planned_on: v }), `${ids.length} moved to ${fmtD(v, true)}`)();
                                }, children: "Move" })] })] }), _jsx("p", { className: "cnote", children: "Drag a planned harvest up or down to reorder it (on a phone or tablet, by its \u283F handle); dropped next to another day's harvest, it takes that day. To pick any date, use the date in its row, or select several and Change date. Lbs are fresh frozen estimates (plants \u00D7 lbs/plant) until a harvest is logged, then what came in (\u2713). People = man-hours \u00F7 the site's work day. Dry ice is for fresh frozen, ordered the Wednesday the week before." })] }));
}
// ---------- one harvest ----------
const KINDS = [{ v: 'ff', l: 'Fresh frozen' }, { v: 'dry', l: 'Dry' }, { v: 'combine', l: 'Combine (biomass)' }, { v: 'strip', l: 'Strip header (biomass)' }];
/** METRC tags count up: 1A406030007AD3D000010001 -> ...0002 */
export function nextTag(tag, by = 1) {
    const m = tag.match(/^(.*?)(\d+)$/);
    if (!m)
        return tag;
    const n = (BigInt(m[2]) + BigInt(by)).toString().padStart(m[2].length, '0');
    return m[1] + n;
}
export function HarvestSheet({ d, c, harvest, api, flash, onClose, onSaved, onLog }) {
    const [h, setH] = useState({ raw_bins: [], ...harvest });
    const [busy, setBusy] = useState(false);
    const set = (x) => setH(v => ({ ...v, ...x }));
    const isNew = h.id == null;
    const site = c.site.get(h.site ?? 'OHR');
    const fields = d.fields.filter(f => f.site === h.site && (f.active || f.id === h.field_id));
    const plantings = d.plantings.filter(p => p.site === h.site && (!h.field_id || p.field_id === h.field_id) && (!h.strain || p.strain.toLowerCase() === h.strain.toLowerCase()));
    const k = calcHarvest(c, { raw_bins: [], ...h });
    const logging = h.status === 'done';
    // the strains actually planted this crop year (at this site), so a harvest can only be scheduled for something in the ground
    const planted = [...new Set(d.plantings.filter(p => !h.site || p.site === h.site).map(p => p.strain))].sort((a, b) => a.localeCompare(b));
    const strainNames = planted.length ? planted : d.strains.filter(s => s.active !== false).map(s => s.name);
    const offList = !!h.strain?.trim() && planted.length > 0 && !planted.some(n => n.toLowerCase() === h.strain.trim().toLowerCase());
    const pallets = !isNew ? (c.palletsOf.get(h.id) ?? []) : [];
    async function save(extra = {}, msg = 'Saved') {
        const row = { ...h, ...extra };
        if (!row.strain?.trim()) {
            flash('Pick a strain', true);
            return;
        }
        if (!row.site) {
            flash('Pick a site', true);
            return;
        }
        setBusy(true);
        try {
            if (row.planting_id == null && row.field_id) {
                const p = d.plantings.filter(p => p.site === row.site && p.field_id === row.field_id && p.strain.toLowerCase() === row.strain.toLowerCase())
                    .sort((a, b) => (b.plants ?? 0) - (a.plants ?? 0))[0];
                if (p)
                    row.planting_id = p.id;
            }
            if (row.status === 'done' && !row.harvested_on)
                row.harvested_on = row.planned_on ?? today();
            await api.save('cult_harvests', row);
            await onSaved(msg);
        }
        catch (e) {
            flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    async function del() {
        setBusy(true);
        try {
            await api.remove('cult_harvests', h.id);
            await onSaved('Deleted');
        }
        catch (e) {
            flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs(Sheet, { title: isNew ? 'Add harvest' : `${h.strain}`, sub: !isNew && _jsxs(_Fragment, { children: [h.site, " ", fieldName(c, h.field_id ?? null), " \u00B7 ", KIND_LABEL[h.kind], " \u00B7 ", h.status] }), onClose: onClose, wide: true, children: [_jsx(StrainList, { id: "cult-strains", names: strainNames }), _jsxs("div", { className: "grid2", children: [_jsx(F, { label: "Strain", hint: offList ? _jsxs("span", { className: "warn-t", children: ["not planted at ", h.site, " this year"] }) : 'planted strains', children: _jsx(TextIn, { value: h.strain, onChange: v => set({ strain: v ?? '', planting_id: null }), list: "cult-strains", autoFocus: isNew }) }), _jsx(F, { label: "Site", children: _jsx(Choices, { value: h.site ?? 'OHR', options: d.sites.map(s => ({ v: s.code, l: s.code })), onChange: v => set({ site: v, field_id: null, planting_id: null }) }) }), _jsx(F, { label: "Field", children: _jsx(Pick, { value: h.field_id ?? null, blank: "Pick a field\u2026", onChange: v => set({ field_id: v, planting_id: null }), options: fields.map(f => ({ v: f.id, l: `${f.code}  (${f.name})` })) }) }), _jsx(F, { label: "Type", children: _jsx(Pick, { value: h.kind ?? 'ff', onChange: v => set({ kind: v ?? 'ff' }), options: KINDS }) })] }), _jsxs("div", { className: "grid2", children: [_jsx(F, { label: h.kind === 'combine' ? 'Cut date' : 'Harvest date', hint: k.dryIceOrder ? `dry ice order by ${fmtD(k.dryIceOrder, true)}` : undefined, children: _jsx(DateIn, { value: h.planned_on, onChange: v => set({ planned_on: v }) }) }), plantings.length > 0 && _jsx(F, { label: "Planting", children: _jsx(Pick, { value: h.planting_id ?? null, blank: "Biggest match", onChange: v => set({ planting_id: v }), options: plantings.map(p => ({ v: p.id, l: `${fmtD(p.planted_on)} · ${n0(p.plants)} plants${p.batch ? ` · batch ${p.batch}` : ''}` })) }) })] }), (h.kind === 'ff' || h.kind === 'dry') && (_jsxs("div", { className: "grid3", children: [_jsx(F, { label: "Plants", children: _jsx(NumIn, { value: h.plants, onChange: v => set({ plants: v }) }) }), h.kind === 'ff' && _jsx(F, { label: "Lbs / plant", hint: "FF", children: _jsx(NumIn, { value: h.est_lbs_per_plant, onChange: v => set({ est_lbs_per_plant: v }) }) }), h.kind === 'dry' && _jsx(F, { label: "Raw lbs / plant", children: _jsx(NumIn, { value: h.est_raw_per_plant, onChange: v => set({ est_raw_per_plant: v }) }) }), h.kind === 'dry' && _jsx(F, { label: "Dry conversion", hint: `(${pct(site?.dry_conversion)} default)`, children: _jsx(NumIn, { value: h.dry_conversion, placeholder: String(site?.dry_conversion ?? 0.075), onChange: v => set({ dry_conversion: v }) }) }), h.kind === 'ff' && _jsx(F, { label: "Deleaf rate", hint: "plants/man-hr", children: _jsx(NumIn, { value: h.deleaf_rate, placeholder: site?.deleaf_rate != null ? `${site.deleaf_rate} (site)` : '', onChange: v => set({ deleaf_rate: v }) }) }), h.kind === 'ff' && _jsx(F, { label: "Buck rate", hint: "lbs/man-hr", children: _jsx(NumIn, { value: h.buck_rate, placeholder: site?.buck_rate != null ? `${site.buck_rate} (site)` : '', onChange: v => set({ buck_rate: v }) }) })] })), isBiomass(h.kind) && (_jsxs("div", { className: "grid3", children: [_jsx(F, { label: "Acres", children: _jsx(NumIn, { value: h.acres, onChange: v => set({ acres: v }) }) }), _jsx(F, { label: "Dry lbs / acre", children: _jsx(NumIn, { value: h.est_yield_per_acre, onChange: v => set({ est_yield_per_acre: v }) }) }), h.kind === 'combine' && _jsx(F, { label: "Days to merge", children: _jsx(NumIn, { value: h.days_to_merge, onChange: v => set({ days_to_merge: v }) }) }), h.kind === 'combine' && _jsx(F, { label: "Days to harvest", children: _jsx(NumIn, { value: h.days_to_harvest, onChange: v => set({ days_to_harvest: v }) }) })] })), _jsxs("div", { className: "calcbox", children: [h.kind === 'ff' && _jsxs(_Fragment, { children: [_jsx("span", { children: "Est. fresh frozen" }), _jsxs("b", { children: [n0(k.estFF), " lbs"] }), _jsx("span", { children: "Dry ice" }), _jsxs("b", { children: [n0(k.dryIce), " lbs", k.dryIceOrder ? `, order ${fmtD(k.dryIceOrder, true)}` : ''] }), _jsx("span", { children: "Deleaf (day before)" }), _jsx("b", { children: k.deleafHours != null ? `${n1(k.deleafHours)} hrs · ${k.deleafPeople} people` : '' }), _jsx("span", { children: "Buck" }), _jsx("b", { children: k.buckHours != null ? `${n1(k.buckHours)} hrs · ${k.buckPeople} people` : '' })] }), h.kind === 'dry' && _jsxs(_Fragment, { children: [_jsx("span", { children: "Raw weight" }), _jsxs("b", { children: [n0(k.estRaw), " lbs"] }), _jsx("span", { children: "Dry flower" }), _jsxs("b", { children: [n0(k.estDry), " lbs"] }), _jsx("span", { children: "Trucks" }), _jsx("b", { children: n2(k.trucks) })] }), isBiomass(h.kind) && _jsxs(_Fragment, { children: [_jsx("span", { children: "Est. dry yield" }), _jsxs("b", { children: [n0(k.estBiomass), " lbs"] }), h.kind === 'combine' && _jsxs(_Fragment, { children: [_jsx("span", { children: "Merge" }), _jsx("b", { children: fmtD(k.mergeOn, true) }), _jsx("span", { children: "Combine" }), _jsx("b", { children: fmtD(k.combineOn, true) })] })] }), k.usedDefaults.length > 0 && _jsxs("span", { style: { gridColumn: '1 / -1' }, children: ["Using the site's default ", k.usedDefaults.join(' and '), "."] })] }), _jsx(F, { label: "Notes", children: _jsx("textarea", { value: h.notes ?? '', onChange: e => set({ notes: e.target.value || null }) }) }), !isNew && !logging && h.status !== 'cancelled' && (_jsxs("p", { className: "cnote", children: ["Log what comes in on the Harvest screen (raw bins", h.kind === 'ff' ? ', then each pallet' : '', "). This is the plan."] })), logging && _jsxs(_Fragment, { children: [_jsxs("div", { className: "row between", children: [_jsx("h3", { children: "What came in" }), onLog && h.id != null && _jsx("button", { className: "ghost small", onClick: () => onLog(h.id), children: "Open harvest log \u203A" })] }), _jsxs("div", { className: "calcbox", children: [_jsx("span", { children: "Harvested" }), _jsx("b", { children: fmtD(h.harvested_on, true) || '—' }), _jsx("span", { children: "Plants harvested" }), _jsx("b", { children: n0(h.plants_harvested ?? h.plants) }), h.metrc_name && _jsxs(_Fragment, { children: [_jsx("span", { children: "METRC harvest" }), _jsx("b", { children: h.metrc_name })] }), !isBiomass(h.kind) && _jsxs(_Fragment, { children: [_jsx("span", { children: "Raw" }), _jsxs("b", { children: [n0(h.raw_lbs ?? sum(h.raw_bins ?? [])), " lbs", (h.raw_bins ?? []).length ? ` · ${(h.raw_bins ?? []).length} bins` : ''] })] }), h.kind === 'ff' && _jsxs(_Fragment, { children: [_jsx("span", { children: "Fresh frozen" }), _jsxs("b", { children: [n0(h.ff_lbs ?? k.palletLbs), " lbs"] })] }), h.kind === 'dry' && _jsxs(_Fragment, { children: [_jsx("span", { children: "Bucked / trim / mold" }), _jsxs("b", { children: [[h.bucked_lbs, h.trim_lbs, h.mold_lbs].map(v => (v == null ? '—' : n0(v))).join(' / '), " lbs"] })] })] }), _jsx("p", { className: "cnote", children: "Results are logged and fixed in the harvest log (fixing a finished harvest is for Cultivation Admins)." }), h.kind === 'ff' && k.actFF != null && k.actPlants ? _jsxs("p", { className: "cnote", children: [n2(k.actFF / k.actPlants), " lbs/plant fresh frozen", h.est_lbs_per_plant ? ` (estimate was ${n2(h.est_lbs_per_plant)})` : '', k.actRaw ? ` · ${pct(k.actFF / k.actRaw)} of raw` : ''] }) : null, h.kind === 'ff' && !isNew && _jsxs(_Fragment, { children: [_jsxs("h3", { children: ["Pallets ", _jsxs("span", { className: "muted", children: [pallets.length, " \u00B7 ", n0(k.palletLbs), " lbs"] })] }), pallets.length > 0 && (_jsx("div", { className: "cwrap tight", children: _jsx("table", { className: "ctable", children: _jsx("tbody", { children: pallets.map(p => _jsxs("tr", { children: [_jsx("td", { children: _jsx("b", { children: p.code }) }), _jsxs("td", { className: "num", children: [n0(p.og_weight), " lbs"] }), _jsx("td", { className: "mono small", children: p.package_tag ?? 'tag pending' }), _jsx("td", { className: "muted small", children: p.status === 'in_freezer' ? 'in a freezer' : p.status === 'unslotted' ? 'needs a spot' : p.status })] }, p.id)) }) }) })), !pallets.length && _jsx("p", { className: "muted", children: "No pallets logged." }), _jsx("p", { className: "cnote", children: "Pallets are only made on the Harvest screen while harvesting (tag, pallet #, then Staging on the freezer map). To fix a pallet's weight or tag, open it on the freezer map." })] })] }), _jsx(SaveBar, { busy: busy, onCancel: onClose, onDelete: isNew ? undefined : del, onSave: () => save({}, isNew ? 'Harvest added' : 'Saved') }), !isNew && _jsxs("div", { className: "row", children: [h.status !== 'cancelled' && _jsx("button", { className: "ghost small", disabled: busy, onClick: () => save({ status: 'cancelled' }, 'Harvest cancelled'), children: "Cancel this harvest" }), h.status !== 'planned' && _jsx("button", { className: "ghost small", disabled: busy, onClick: () => save({ status: 'planned' }, 'Back to planned'), children: "Back to planned" }), h.updated_by && _jsxs("span", { className: "muted", children: ["Last change ", h.updated_by.split('@')[0], h.updated_at ? ` · ${new Date(h.updated_at).toLocaleDateString()}` : ''] })] })] }));
}
