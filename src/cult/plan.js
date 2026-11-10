import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { Select } from '../combo';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { acresFor, addDays, fmtD, n0, n1, n2, sum } from './calc';
import { Choices, DateIn, F, Kpis, NumIn, Pick, SaveBar, SelAll, SelBar, SelBox, SelButton, Sheet, StrainList, TextIn, errText, useSel } from './ui';
const STATUSES = ['planned', 'ordered', 'confirmed', 'received', 'cancelled'];
const lc = (s) => s.toLowerCase();
export function PlanTab({ d, c, api, flash, q }) {
    const [year, setYear] = useState(d.currentYear + 1);
    const [p, setP] = useState(null);
    const [err, setErr] = useState(null);
    const [dEdit, setDEdit] = useState(null);
    const [pEdit, setPEdit] = useState(null);
    const [oEdit, setOEdit] = useState(null);
    const [busy, setBusy] = useState(false);
    const [bufferPct, setBufferPct] = useState(d.settings.bufferPct);
    const selD = useSel(), selP = useSel(), selO = useSel();
    const load = useCallback(() => api.loadPlan(year).then(x => { setP(x); setErr(null); }).catch(e => setErr(errText(e))), [api, year]);
    useEffect(() => { setP(null); load(); }, [load]);
    const saved = async (m) => { setDEdit(null); setPEdit(null); setOEdit(null); await load(); flash(m); };
    // lbs per plant from history: the two most recent seasons before the plan year, weighted by plants
    const lppHist = useMemo(() => {
        const m = new Map();
        if (!p)
            return m;
        const rows = [...p.history.map(h => ({ strain: h.strain, crop_year: h.crop_year, plants: h.plants ?? 0, ff_lbs: h.ff_lbs ?? 0 })), ...p.actuals];
        const yrs = [...new Set(rows.map(r => r.crop_year))].filter(y => y < year).sort((a, b) => b - a).slice(0, 2);
        for (const r of rows) {
            if (!yrs.includes(r.crop_year) || !r.plants || !r.ff_lbs)
                continue;
            const x = m.get(lc(r.strain)) ?? m.set(lc(r.strain), { plants: 0, lbs: 0, years: new Set() }).get(lc(r.strain));
            x.plants += r.plants;
            x.lbs += r.ff_lbs;
            x.years.add(r.crop_year);
        }
        return m;
    }, [p, year]);
    if (err)
        return _jsxs("div", { className: "warnbox", children: ["Couldn't load the plan: ", err] });
    if (!p)
        return _jsxs("p", { className: "muted", children: ["Loading the ", year, " plan\u2026"] });
    const ql = q.trim().toLowerCase();
    const planLpp = (r) => r.est_lbs_per_plant ?? (r.strain ? (() => { const h = lppHist.get(lc(r.strain)); return h ? h.lbs / h.plants : null; })() : null);
    const resOf = (s) => { let t = 0; for (const [k, v] of p.reserves ?? [])
        if (lc(k) === lc(s))
            t += v; return t; };
    const reqOf = (s) => { let t = 0; for (const [k, v] of p.requested)
        if (lc(k) === lc(s))
            t += v; return t; };
    const strains = [...new Set([...p.demand.map(x => x.strain), ...p.plan.map(x => x.strain), ...(p.reserves?.keys() ?? []), ...p.requested.keys()].map(s => s))]
        .filter((s, i, a) => a.findIndex(t => lc(t) === lc(s)) === i).filter(s => !ql || lc(s).includes(ql)).sort((a, b) => a.localeCompare(b));
    const rows = strains.map(s => {
        const dem = p.demand.find(x => lc(x.strain) === lc(s));
        const pl = p.plan.filter(x => lc(x.strain) === lc(s));
        const h = lppHist.get(lc(s));
        const lpp = pl.find(x => x.est_lbs_per_plant != null)?.est_lbs_per_plant ?? (h ? h.lbs / h.plants : null);
        const reserved = resOf(s), buffer = reserved * bufferPct / 100, extra = dem?.lbs ?? 0, waiting = reqOf(s);
        const need = reserved + buffer + extra;
        const plantsNeeded = lpp && need ? Math.ceil((need / lpp) * 1.03) : null;
        const planned = sum(pl.map(x => x.plants));
        const projected = sum(pl.map(x => x.plants * (planLpp(x) ?? 0)));
        return { s, dem, pl, h, lpp, need, plantsNeeded, planned, projected, delta: projected - need, reserved, buffer, extra, waiting };
    });
    const bySite = d.sites.map(s => {
        const pl = p.plan.filter(x => x.site === s.code);
        const acres = sum(pl.map(x => acresFor(x.plants, x.spacing_in, s)));
        const avail = sum(d.fields.filter(f => f.site === s.code && f.active && f.kind !== 'biomass').map(f => f.acres));
        return { s, plants: sum(pl.map(x => Math.ceil(x.plants * (1 + x.overage_pct / 100)))), acres, avail };
    });
    const bulk = (f, m) => async () => { try {
        await f();
        await saved(m);
    }
    catch (e) {
        flash(errText(e), true);
    } };
    async function saveBuffer(v) {
        try {
            await api.setSetting('cult.buffer_pct', String(v));
            setBufferPct(v);
            flash(`Buffer set to ${v}%`);
        }
        catch (e) {
            flash(errText(e), true);
        }
    }
    async function copyPlan(from) {
        setBusy(true);
        try {
            const prev = await api.loadPlan(from);
            await api.insertMany('cult_plan', prev.plan.map(({ id: _id, crop_year: _y, ...r }) => ({ ...r, crop_year: year, est_lbs_per_plant: null })));
            await saved(`Copied ${prev.plan.length} rows from the ${from} plan`);
        }
        catch (e) {
            flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "row toolbar", children: [_jsx("b", { children: "Plan for" }), _jsx(Select, { value: year, onChange: e => setYear(Number(e.target.value)), children: [d.currentYear + 2, d.currentYear + 1, d.currentYear, d.currentYear - 1].map(y => _jsx("option", { value: y, children: y }, y)) }), _jsx("span", { className: "muted", children: "Buffer on top of reserves" }), _jsx("input", { className: "bufin", inputMode: "decimal", defaultValue: String(bufferPct), onBlur: e => { const v = Number(e.target.value); if (isFinite(v) && v >= 0 && v !== bufferPct)
                            saveBuffer(v); } }, bufferPct), _jsx("span", { className: "muted", children: "%" }), !p.plan.length && _jsxs("button", { className: "ghost small", disabled: busy, onClick: () => copyPlan(year - 1), children: ["Start from the ", year - 1, " plan"] })] }), _jsx(Kpis, { items: [
                    [n0(sum(rows.map(r => r.reserved))), `lbs reserved for ${year}`], [n0(sum(rows.map(r => r.waiting))), 'lbs requested, waiting'],
                    [n0(sum(rows.map(r => r.need))), 'lbs needed'], [n0(sum(rows.map(r => r.projected))), 'lbs projected'],
                    ...bySite.map(x => [`${n0(x.plants)}`, `${x.s.code} plants to order (with overage)`]),
                    ...bySite.map(x => [`${n1(x.acres)}${x.avail ? ` / ${n1(x.avail)}` : ''}`, `${x.s.code} acres planned${x.avail ? ' / flower fields' : ''}`]),
                ] }), _jsxs("div", { className: "row between", children: [_jsxs("h3", { className: "csec", children: ["By strain ", _jsx("span", { className: "muted", children: "what to grow for, and whether the plan covers it" })] }), _jsxs("div", { className: "row", children: [_jsx(SelButton, { sel: selD }), _jsx("button", { className: "primary small", onClick: () => setDEdit({ crop_year: year, strain: '', lbs: 0 }), children: "+ Strain" })] })] }), _jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx(SelAll, { sel: selD, ids: rows.map(r => r.dem?.id).filter((x) => x != null) }), _jsx("th", { children: "Strain" }), _jsx("th", { className: "num", children: "Reserved" }), _jsx("th", { className: "num hide-s", children: "+ Buffer" }), _jsx("th", { className: "num hide-s", children: "+ Extra" }), _jsx("th", { className: "num", children: "Lbs needed" }), _jsx("th", { className: "num", children: "Lbs / plant" }), _jsx("th", { className: "num", children: "Plants needed" }), _jsx("th", { className: "num", children: "Planned" }), _jsx("th", { className: "num", children: "Projected lbs" }), _jsx("th", { className: "num", children: "Short / over" }), _jsx("th", {})] }) }), _jsxs("tbody", { children: [rows.map(r => (_jsxs("tr", { className: "tap", onClick: () => selD.on ? r.dem && selD.toggle(r.dem.id) : setDEdit(r.dem ?? { crop_year: year, strain: r.s, lbs: 0 }), children: [_jsx(SelBox, { sel: selD, id: r.dem?.id }), _jsxs("td", { children: [r.s, r.waiting > 0 && _jsxs("div", { className: "muted small", children: [n0(r.waiting), " lbs requested, waiting"] })] }), _jsx("td", { className: "num", children: r.reserved ? n0(r.reserved) : '' }), _jsx("td", { className: "num hide-s", children: r.buffer ? n0(r.buffer) : '' }), _jsx("td", { className: "num hide-s", children: r.extra ? n0(r.extra) : '' }), _jsx("td", { className: "num", children: _jsx("b", { children: r.need ? n0(r.need) : '' }) }), _jsxs("td", { className: "num", title: r.h ? `${[...r.h.years].sort().join(' + ')}: ${n0(r.h.lbs)} lbs from ${n0(r.h.plants)} plants` : 'no history', children: [n2(r.lpp), !r.lpp && _jsx("span", { className: "warn-t", children: "?" })] }), _jsx("td", { className: "num", children: n0(r.plantsNeeded) }), _jsx("td", { className: "num", children: n0(r.planned) || '' }), _jsx("td", { className: "num", children: n0(r.projected) || '' }), _jsx("td", { className: `num ${r.delta < 0 ? 'neg' : 'pos'}`, children: r.need || r.projected ? (r.delta > 0 ? '+' : '') + n0(r.delta) : '' }), _jsx("td", { onClick: e => e.stopPropagation(), children: r.plantsNeeded && r.planned < r.plantsNeeded / 1.03 &&
                                                _jsx("button", { className: "ghost small", onClick: () => setPEdit({ crop_year: year, site: 'OHR', strain: r.s, plants: Math.ceil((r.plantsNeeded / 1.03) - r.planned), overage_pct: 3, source: 'clone', trial: false, est_lbs_per_plant: null }), children: "Plan it" }) })] }, r.s))), !rows.length && _jsx("tr", { children: _jsxs("td", { colSpan: 13, className: "muted", children: ["Nothing yet. ", year, " reserves show up here as customers ask for them and they're approved. Add extra strains with + Strain."] }) })] }), rows.length > 0 && _jsx("tfoot", { children: _jsxs("tr", { className: "tot", children: [selD.on && _jsx("td", {}), _jsx("td", { children: "Total" }), _jsx("td", { className: "num", children: n0(sum(rows.map(r => r.reserved))) }), _jsx("td", { className: "num hide-s", children: n0(sum(rows.map(r => r.buffer))) }), _jsx("td", { className: "num hide-s", children: n0(sum(rows.map(r => r.extra))) }), _jsx("td", { className: "num", children: n0(sum(rows.map(r => r.need))) }), _jsx("td", {}), _jsx("td", { className: "num", children: n0(sum(rows.map(r => r.plantsNeeded))) }), _jsx("td", { className: "num", children: n0(sum(rows.map(r => r.planned))) }), _jsx("td", { className: "num", children: n0(sum(rows.map(r => r.projected))) }), _jsx("td", { className: "num", children: n0(sum(rows.map(r => r.delta))) }), _jsx("td", {})] }) })] }) }), _jsxs("p", { className: "cnote", children: ["Lbs needed = ", year, " reserves (approved) + ", bufferPct, "% buffer + any extra lbs you add per strain. ", !p.reserves && 'You can\'t see reserves with your role, so only extra lbs count. ', "Lbs / plant: what's set on the plan, otherwise the average from the last two seasons (hover for the numbers). Plants needed includes 3% overage."] }), _jsxs("div", { className: "row between", children: [_jsxs("h3", { className: "csec", children: ["Crop plan ", _jsxs("span", { className: "muted", children: [p.plan.length, " rows"] })] }), _jsxs("div", { className: "row", children: [_jsx(SelButton, { sel: selP }), _jsx("button", { className: "primary small", onClick: () => setPEdit({ crop_year: year, site: 'OHR', strain: '', plants: 0, overage_pct: 3, source: 'clone', trial: false }), children: "+ Add to plan" })] })] }), d.sites.map(s => {
                const pl = p.plan.filter(x => x.site === s.code && (!ql || lc(x.strain).includes(ql))).sort((a, b) => Number(a.trial) - Number(b.trial) || a.strain.localeCompare(b.strain));
                if (!pl.length)
                    return null;
                return (_jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx(SelAll, { sel: selP, ids: pl.map(x => x.id) }), _jsx("th", { children: s.code }), _jsx("th", { children: "Nursery" }), _jsx("th", { className: "num", children: "Plants" }), _jsx("th", { className: "num", children: "To order" }), _jsx("th", { className: "num hide-s", children: "Spacing" }), _jsx("th", { className: "num", children: "Acres" }), _jsx("th", { className: "num", children: "Lbs / pl" }), _jsx("th", { className: "num", children: "Projected" }), _jsx("th", { className: "hide-s", children: "Deliveries" })] }) }), _jsx("tbody", { children: pl.map(x => {
                                    const os = p.orders.filter(o => o.plan_id === x.id && o.status !== 'cancelled');
                                    return (_jsxs("tr", { className: "tap", onClick: () => selP.on ? selP.toggle(x.id) : setPEdit(x), children: [_jsx(SelBox, { sel: selP, id: x.id }), _jsxs("td", { children: [x.strain, x.trial && _jsx("span", { className: "kpill s-planned", children: " trial" }), x.field_id && _jsx("span", { className: "fpill", style: { marginLeft: 4 }, children: c.field.get(x.field_id)?.code })] }), _jsxs("td", { children: [x.nursery ?? '', x.source !== 'clone' ? ` · ${x.source}` : ''] }), _jsx("td", { className: "num", children: n0(x.plants) }), _jsx("td", { className: "num", children: n0(Math.ceil(x.plants * (1 + x.overage_pct / 100))) }), _jsx("td", { className: "num hide-s", children: x.spacing_in ? `${x.spacing_in}"` : '' }), _jsx("td", { className: "num", children: n2(acresFor(x.plants, x.spacing_in, s)) }), _jsx("td", { className: "num", children: n2(planLpp(x)) }), _jsx("td", { className: "num", children: n0(x.plants * (planLpp(x) ?? 0)) || '' }), _jsx("td", { className: "hide-s small", children: os.map(o => `${n0(o.plants)} ${fmtD(o.deliver_on)}`).join(', ') })] }, x.id));
                                }) }), _jsx("tfoot", { children: _jsxs("tr", { className: "tot", children: [_jsx("td", { colSpan: selP.on ? 3 : 2, children: "Total" }), _jsx("td", { className: "num", children: n0(sum(pl.map(x => x.plants))) }), _jsx("td", { className: "num", children: n0(sum(pl.map(x => Math.ceil(x.plants * (1 + x.overage_pct / 100))))) }), _jsx("td", { className: "hide-s" }), _jsx("td", { className: "num", children: n1(sum(pl.map(x => acresFor(x.plants, x.spacing_in, s)))) }), _jsx("td", {}), _jsx("td", { className: "num", children: n0(sum(pl.map(x => x.plants * (planLpp(x) ?? 0)))) }), _jsx("td", { className: "hide-s" })] }) })] }) }, s.code));
            }), _jsxs("div", { className: "row between", children: [_jsxs("h3", { className: "csec", children: ["Nursery deliveries ", _jsxs("span", { className: "muted", children: [p.orders.filter(o => o.status !== 'cancelled').length, " \u00B7 ", n0(sum(p.orders.filter(o => o.status !== 'cancelled').map(o => o.plants))), " plants"] })] }), _jsxs("div", { className: "row", children: [_jsx(SelButton, { sel: selO }), _jsx("button", { className: "primary small", onClick: () => setOEdit({ crop_year: year, site: 'OHR', strain: '', plants: 0, status: 'planned' }), children: "+ Delivery" })] })] }), _jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx(SelAll, { sel: selO, ids: p.orders.filter(o => !ql || lc(o.strain).includes(ql)).map(o => o.id) }), _jsx("th", { children: "Delivery" }), _jsx("th", { children: "Plant" }), _jsx("th", { children: "Strain" }), _jsx("th", { children: "Site" }), _jsx("th", { children: "Nursery" }), _jsx("th", { className: "num", children: "Plants" }), _jsx("th", { children: "Status" })] }) }), _jsxs("tbody", { children: [p.orders.filter(o => !ql || lc(o.strain).includes(ql)).map(o => (_jsxs("tr", { className: `tap ${o.status === 'cancelled' ? 'cancelled' : ''}`, onClick: () => selO.on ? selO.toggle(o.id) : setOEdit(o), children: [_jsx(SelBox, { sel: selO, id: o.id }), _jsx("td", { className: "nowrap", children: fmtD(o.deliver_on, true) }), _jsx("td", { className: "nowrap", children: fmtD(o.plant_on, true) }), _jsx("td", { children: o.strain }), _jsx("td", { children: o.site }), _jsx("td", { children: o.nursery ?? '' }), _jsx("td", { className: "num", children: n0(o.plants) }), _jsx("td", { children: _jsx("span", { className: `kpill ${o.status === 'received' ? 's-done' : 's-planned'}`, children: o.status }) })] }, o.id))), !p.orders.length && _jsx("tr", { children: _jsx("td", { colSpan: 7, className: "muted", children: "No deliveries yet. Open a plan row to add its deliveries." }) })] })] }) }), _jsx(SelBar, { sel: selD, noun: "strain", actions: [{ label: 'Delete', danger: true, run: async (ids) => bulk(() => api.removeMany('cult_demand', ids), `Removed ${ids.length} from lbs needed`)() }] }), _jsx(SelBar, { sel: selP, noun: "plan row", actions: [{ label: 'Delete', danger: true, run: async (ids) => bulk(() => api.removeMany('cult_plan', ids), `Removed ${ids.length} plan rows`)() }] }), _jsx(SelBar, { sel: selO, noun: "delivery", actions: [
                    ...['ordered', 'confirmed', 'received'].map(st => ({ label: `Mark ${st}`, run: async (ids) => bulk(() => api.updateMany('cult_nursery_orders', ids, { status: st }), `${ids.length} marked ${st}`)() })),
                    { label: 'Delete', danger: true, run: async (ids) => bulk(() => api.removeMany('cult_nursery_orders', ids), `Removed ${ids.length} deliveries`)() }
                ] }), dEdit && _jsx(DemandSheet, { d: d, x: dEdit, hist: dEdit.strain ? lppHist.get(lc(dEdit.strain)) : undefined, reserve: dEdit.strain ? resOf(dEdit.strain) : null, year: year, api: api, flash: flash, onClose: () => setDEdit(null), onSaved: saved }), pEdit && _jsx(PlanSheet, { d: d, c: c, x: pEdit, lpp: planLpp({ ...pEdit, est_lbs_per_plant: null }), orders: p.orders.filter(o => pEdit.id != null && o.plan_id === pEdit.id), api: api, flash: flash, onClose: () => setPEdit(null), onSaved: saved, onOrder: o => { setPEdit(null); setOEdit(o); } }), oEdit && _jsx(OrderSheet, { d: d, x: oEdit, api: api, flash: flash, onClose: () => setOEdit(null), onSaved: saved })] }));
}
function DemandSheet({ d, x: x0, hist, reserve, year, api, flash, onClose, onSaved }) {
    const [x, setX] = useState(x0);
    const [busy, setBusy] = useState(false);
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
    return (_jsxs(Sheet, { title: x0.id ? x0.strain : x0.strain || 'Strain to grow', sub: `${x0.crop_year} plan`, onClose: onClose, children: [_jsx(StrainList, { id: "cult-strains", names: d.strains.map(s => s.name) }), _jsx(F, { label: "Strain", children: _jsx(TextIn, { value: x.strain, list: "cult-strains", autoFocus: !x0.strain, onChange: v => setX({ ...x, strain: v ?? '' }) }) }), _jsx(F, { label: "Extra fresh frozen lbs to grow", hint: `(on top of ${n0(reserve ?? 0)} lbs of ${year} reserves and the buffer)`, children: _jsx(NumIn, { value: x.lbs, onChange: v => setX({ ...x, lbs: v ?? 0 }) }) }), _jsx(F, { label: "Notes", children: _jsx(TextIn, { value: x.notes, onChange: v => setX({ ...x, notes: v }) }) }), hist && _jsxs("p", { className: "cnote", children: ["History: ", n0(hist.lbs), " lbs from ", n0(hist.plants), " plants (", [...hist.years].sort().join(', '), ") = ", n2(hist.lbs / hist.plants), " lbs/plant."] }), _jsx(SaveBar, { busy: busy, disabled: !x.strain?.trim(), onCancel: onClose, onSave: () => run(() => api.save('cult_demand', x), 'Saved'), onDelete: x0.id ? () => run(() => api.remove('cult_demand', x0.id), 'Removed') : undefined })] }));
}
function PlanSheet({ d, c, x: x0, lpp, orders, api, flash, onClose, onSaved, onOrder }) {
    const [x, setX] = useState(x0);
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
    const s = c.site.get(x.site ?? 'OHR');
    const toOrder = Math.ceil((x.plants ?? 0) * (1 + (x.overage_pct ?? 3) / 100));
    const ordered = sum(orders.filter(o => o.status !== 'cancelled').map(o => o.plants));
    const use = x.est_lbs_per_plant ?? lpp;
    return (_jsxs(Sheet, { title: x0.id ? x0.strain : 'Add to plan', sub: `${x0.crop_year} plan`, onClose: onClose, wide: true, children: [_jsx(StrainList, { id: "cult-strains", names: d.strains.map(t => t.name) }), _jsxs("div", { className: "grid2", children: [_jsx(F, { label: "Strain", children: _jsx(TextIn, { value: x.strain, list: "cult-strains", autoFocus: !x0.strain, onChange: v => set({ strain: v ?? '' }) }) }), _jsx(F, { label: "Site", children: _jsx(Choices, { value: x.site ?? 'OHR', options: d.sites.map(t => ({ v: t.code, l: t.code })), onChange: v => set({ site: v, field_id: null }) }) })] }), _jsxs("div", { className: "grid3", children: [_jsx(F, { label: "Plants", children: _jsx(NumIn, { value: x.plants, onChange: v => set({ plants: v ?? 0 }) }) }), _jsx(F, { label: "Overage %", children: _jsx(NumIn, { value: x.overage_pct, onChange: v => set({ overage_pct: v ?? 0 }) }) }), _jsx(F, { label: "Spacing", hint: "inches", children: _jsx(NumIn, { value: x.spacing_in, onChange: v => set({ spacing_in: v }) }) }), _jsx(F, { label: "Nursery", children: _jsx(TextIn, { value: x.nursery, onChange: v => set({ nursery: v }) }) }), _jsx(F, { label: "Source", children: _jsx(Pick, { value: x.source ?? 'clone', onChange: v => set({ source: (v ?? 'clone') }), options: [{ v: 'clone', l: 'Clone' }, { v: 'seed', l: 'Seed' }, { v: 'auto', l: 'Auto' }] }) }), _jsx(F, { label: "Lbs / plant", hint: lpp ? `(history ${n2(lpp)})` : '', children: _jsx(NumIn, { value: x.est_lbs_per_plant, placeholder: lpp ? n2(lpp) : '', onChange: v => set({ est_lbs_per_plant: v }) }) }), _jsx(F, { label: "Field", hint: "(optional)", children: _jsx(Pick, { value: x.field_id ?? null, blank: "Not set", onChange: v => set({ field_id: v }), options: d.fields.filter(f => f.site === x.site && f.active).map(f => ({ v: f.id, l: `${f.code} (${f.name})` })) }) }), _jsx(F, { label: "Trial", children: _jsx(Choices, { value: x.trial ? 'y' : 'n', options: [{ v: 'n', l: 'No' }, { v: 'y', l: 'Trial' }], onChange: v => set({ trial: v === 'y' }) }) })] }), _jsxs("div", { className: "calcbox", children: [_jsx("span", { children: "Plants to order" }), _jsx("b", { children: n0(toOrder) }), _jsx("span", { children: "Acres" }), _jsx("b", { children: n2(acresFor(x.plants ?? 0, x.spacing_in ?? null, s)) }), _jsx("span", { children: "Projected" }), _jsx("b", { children: use ? `${n0((x.plants ?? 0) * use)} lbs FF` : 'set lbs/plant' }), _jsx("span", { children: "On deliveries" }), _jsxs("b", { children: [n0(ordered), " of ", n0(toOrder)] })] }), _jsx(F, { label: "Notes", children: _jsx(TextIn, { value: x.notes, onChange: v => set({ notes: v }) }) }), x0.id != null && _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost small", onClick: () => onOrder({ crop_year: x0.crop_year, plan_id: x0.id, site: x.site, strain: x.strain, nursery: x.nursery, plants: Math.max(0, toOrder - ordered), status: 'planned' }), children: "+ Delivery for this" }), orders.map(o => _jsxs("a", { onClick: () => onOrder(o), children: [n0(o.plants), " on ", fmtD(o.deliver_on) || '?'] }, o.id))] }), _jsx(SaveBar, { busy: busy, disabled: !x.strain?.trim(), onCancel: onClose, onSave: () => run(() => api.save('cult_plan', x), x0.id ? 'Saved' : 'Added to plan'), onDelete: x0.id ? () => run(() => api.remove('cult_plan', x0.id), 'Removed from plan') : undefined })] }));
}
function OrderSheet({ d, x: x0, api, flash, onClose, onSaved }) {
    const [x, setX] = useState(x0);
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
    return (_jsxs(Sheet, { title: x0.id ? `${x0.strain} delivery` : 'Nursery delivery', sub: `${x0.crop_year} plan`, onClose: onClose, children: [_jsx(StrainList, { id: "cult-strains", names: d.strains.map(t => t.name) }), _jsxs("div", { className: "grid2", children: [_jsx(F, { label: "Strain", children: _jsx(TextIn, { value: x.strain, list: "cult-strains", onChange: v => set({ strain: v ?? '' }) }) }), _jsx(F, { label: "Site", children: _jsx(Choices, { value: x.site ?? 'OHR', options: d.sites.map(t => ({ v: t.code, l: t.code })), onChange: v => set({ site: v }) }) }), _jsx(F, { label: "Nursery", children: _jsx(TextIn, { value: x.nursery, onChange: v => set({ nursery: v }) }) }), _jsx(F, { label: "Plants", children: _jsx(NumIn, { value: x.plants, onChange: v => set({ plants: v ?? 0 }) }) }), _jsx(F, { label: "Cut date", children: _jsx(DateIn, { value: x.cut_on, onChange: v => set({ cut_on: v }) }) }), _jsx(F, { label: "Delivery", children: _jsx(DateIn, { value: x.deliver_on, onChange: v => set({ deliver_on: v, plant_on: x.plant_on ?? (v ? addDays(v, 5) : null) }) }) }), _jsx(F, { label: "Plant date", children: _jsx(DateIn, { value: x.plant_on, onChange: v => set({ plant_on: v }) }) }), _jsx(F, { label: "Status", children: _jsx(Pick, { value: x.status ?? 'planned', onChange: v => set({ status: v ?? 'planned' }), options: STATUSES.map(s => ({ v: s, l: s[0].toUpperCase() + s.slice(1) })) }) })] }), _jsx(F, { label: "Notes", children: _jsx(TextIn, { value: x.notes, onChange: v => set({ notes: v }) }) }), _jsx(SaveBar, { busy: busy, disabled: !x.strain?.trim(), onCancel: onClose, onSave: () => run(() => api.save('cult_nursery_orders', x), 'Saved'), onDelete: x0.id ? () => run(() => api.remove('cult_nursery_orders', x0.id), 'Removed') : undefined })] }));
}
