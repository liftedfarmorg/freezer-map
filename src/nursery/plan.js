import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Select } from '../combo';
import { Fragment, useMemo, useState } from 'react';
import { fmtD, n0, planSeason, sum, today } from './calc';
import { F, NumIn, SaveBar, Sheet, TextIn } from '../cult/ui';
import { t, tn } from '../i18n';
/** Nursery > Plan: from the farm orders back to G4 trays, G3 field moms, G2 greenhouse moms, G1, with cut-by dates */
export function PlanTab({ d, c, api, flash, onSaved }) {
    const years = [...new Set([...d.orders.map(o => o.crop_year), ...d.mothers.map(m => m.season).filter((y) => !!y), new Date().getFullYear() + 1])].sort((a, b) => b - a);
    const [year, setYear] = useState(() => { const y = new Date().getFullYear(); return d.orders.some(o => o.crop_year === y + 1) || new Date().getMonth() >= 6 ? y + 1 : y; });
    const [q, setQ] = useState('');
    const [open, setOpen] = useState(null);
    const rows = useMemo(() => planSeason(d, c, year), [d, c, year]);
    const ql = q.trim().toLowerCase();
    const shown = rows.filter(r => !ql || r.strain.toLowerCase().includes(ql));
    const S = d.settings, now = today();
    const T = (f) => sum(shown.map(f));
    const short = (g) => Math.max(0, g.need - g.have - g.rooting);
    const cell = (g, label) => {
        const s = short(g), due = g.cutBy && g.cutBy < now && s > 0;
        return _jsxs(_Fragment, { children: [_jsx("td", { className: "num", children: n0(g.need) }), _jsxs("td", { className: "num", children: [g.have ? n0(g.have) : _jsx("span", { className: "muted", children: "0" }), g.rooting ? _jsxs("span", { className: "muted", children: [" +", n0(g.rooting)] }) : ''] }), _jsx("td", { className: `num ${s ? (due ? 'bad-t' : 'warn-t') : 'ok-t'}`, title: s ? `${label}: ${t('cut {n} ({trays} trays) by {date}', { n: n0(g.cut), trays: g.trays, date: fmtD(g.cutBy) })}` : t('covered'), children: s ? `−${n0(s)}` : '✓' }), _jsx("td", { className: "nowrap small", children: fmtD(g.cutBy) })] });
    };
    return _jsxs(_Fragment, { children: [_jsx("div", { className: "row toolbar between", children: _jsxs("div", { className: "row", children: [_jsx(Select, { value: year, onChange: e => setYear(Number(e.target.value)), children: years.map(y => _jsx("option", { value: y, children: t('{y} season', { y }) }, y)) }), _jsx("input", { className: "search", type: "search", placeholder: t('Strain'), value: q, onChange: e => setQ(e.target.value) })] }) }), _jsxs("details", { className: "muted small-note howto", children: [_jsx("summary", { children: t('How the plan works') }), t('PLAN_HOWTO_1', { year, buffer: S.buffer, tray: S.tray, g3: S.cutsG3, g2: S.cutsG2 }), ' ', t('PLAN_HOWTO_2', { root: S.rootDays, veg: S.g3VegDays, g3root: S.g3RootDays, g2: S.g2Lead, g1: S.g1Lead }), ' ', t('PLAN_HOWTO_3')] }), !rows.length ? _jsx("p", { className: "muted", children: t('No clone orders for {year} yet. They come from Cultivation → Plan → Nursery deliveries (nursery 1PN), or add them under Orders.', { year }) }) : (_jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable plantable", children: [_jsxs("thead", { children: [_jsxs("tr", { className: "grp", children: [_jsx("th", { colSpan: 3 }), _jsx("th", { colSpan: 3, className: "g4", children: t('G4 production clones') }), _jsx("th", { colSpan: 4, className: "g3", children: t('G3 field moms') }), _jsx("th", { colSpan: 4, className: "g2", children: t('G2 greenhouse moms') }), _jsx("th", { colSpan: 4, className: "g1", children: "G1" })] }), _jsxs("tr", { children: [_jsx("th", { children: t('Strain') }), _jsx("th", { className: "num", children: t('Ordered') }), _jsx("th", { children: t('1st delivery') }), _jsx("th", { className: "num", children: t('Cuttings') }), _jsx("th", { className: "num", children: t('Trays') }), _jsx("th", { children: t('Cut by') }), _jsx("th", { className: "num", children: t('Need') }), _jsx("th", { className: "num", children: t('Have') }), _jsx("th", { className: "num", children: t('Short') }), _jsx("th", { children: t('Cut by') }), _jsx("th", { className: "num", children: t('Need') }), _jsx("th", { className: "num", children: t('Have') }), _jsx("th", { className: "num", children: t('Short') }), _jsx("th", { children: t('Cut by') }), _jsx("th", { className: "num", children: t('Need') }), _jsx("th", { className: "num", children: t('Have') }), _jsx("th", { className: "num", children: t('Short') }), _jsx("th", { children: t('Cut by') })] })] }), _jsxs("tbody", { children: [shown.map(r => (_jsxs("tr", { className: "tap", onClick: () => setOpen(r), children: [_jsxs("td", { children: [r.strain, r.custom && _jsx("span", { className: "muted", title: t('Custom cuts per mom'), children: " *" })] }), _jsx("td", { className: "num", children: r.orders ? n0(r.orders) : _jsx("span", { className: "muted", children: "\u2014" }) }), _jsx("td", { className: "nowrap", children: fmtD(r.firstDeliver) }), _jsxs("td", { className: "num", children: [n0(r.g4.cuttings), r.g4.cut ? _jsxs("span", { className: "muted", children: [" (", n0(r.g4.cut), " cut)"] }) : ''] }), _jsx("td", { className: "num", children: n0(r.g4.trays) }), _jsx("td", { className: `nowrap small ${r.g4.cutBy && r.g4.cutBy < now && r.g4.cut < r.g4.cuttings ? 'bad-t' : ''}`, children: fmtD(r.g4.cutBy) }), cell(r.g3, 'G3'), cell(r.g2, 'G2'), cell(r.g1, 'G1')] }, r.strain))), _jsxs("tr", { className: "tot", children: [_jsx("td", { children: t('Total') }), _jsx("td", { className: "num", children: n0(T(r => r.orders)) }), _jsx("td", {}), _jsx("td", { className: "num", children: n0(T(r => r.g4.cuttings)) }), _jsx("td", { className: "num", children: n0(T(r => r.g4.trays)) }), _jsx("td", {}), _jsx("td", { className: "num", children: n0(T(r => r.g3.need)) }), _jsx("td", { className: "num", children: n0(T(r => r.g3.have)) }), _jsx("td", { className: "num", children: n0(T(r => short(r.g3))) }), _jsx("td", {}), _jsx("td", { className: "num", children: n0(T(r => r.g2.need)) }), _jsx("td", { className: "num", children: n0(T(r => r.g2.have)) }), _jsx("td", { className: "num", children: n0(T(r => short(r.g2))) }), _jsx("td", {}), _jsx("td", { className: "num", children: n0(T(r => r.g1.need)) }), _jsx("td", { className: "num", children: n0(T(r => r.g1.have)) }), _jsx("td", { className: "num", children: n0(T(r => short(r.g1))) }), _jsx("td", {})] })] })] }) })), rows.length > 0 && _jsx(SpaceCheck, { d: d, rows: shown }), open && _jsx(StrainPlanSheet, { d: d, r: open, api: api, flash: flash, onClose: () => setOpen(null), onSaved: onSaved })] });
}
/** does the plan fit: G3 field moms vs hoop space, G2 moms vs bench count */
function SpaceCheck({ d, rows }) {
    const hoops = d.rooms.filter(r => r.active && r.kind === 'hoop');
    const cap = (place) => sum(hoops.filter(h => h.place === place).map(h => h.capacity ?? sum(h.beds.map(b => b.cap))));
    const places = [...new Set(hoops.map(h => h.place))];
    const need = sum(rows.map(r => r.g3.need));
    const total = sum(places.map(cap));
    return (_jsxs("div", { className: "calcbox spacebox", children: [_jsx("span", { children: t('G3 field moms needed') }), _jsx("b", { children: n0(need) }), places.map(p => _jsxs(Fragment, { children: [_jsxs("span", { children: [t('Hoop space at {p}', { p }), hoops.some(h => h.place === p && h.rented) ? ` (${t('rented')})` : ''] }), _jsx("b", { children: n0(cap(p)) })] }, p)), _jsx("span", { children: t(need > total ? 'Over by' : 'Room left') }), _jsx("b", { className: need > total ? 'bad-t' : 'ok-t', children: n0(Math.abs(total - need)) }), _jsx("span", { children: t('G4 trays to root') }), _jsxs("b", { children: [n0(sum(rows.map(r => r.g4.trays))), " (", t('trailers hold {n} at a time', { n: n0(sum(d.rooms.filter(r => r.kind === 'trailer' && r.active).map(r => r.trays ?? 0))) }), ")"] })] }));
}
function StrainPlanSheet({ d, r, api, flash, onClose, onSaved }) {
    const p = d.strainPlan.find(x => x.strain.toLowerCase() === r.strain.toLowerCase());
    const [g3, setG3] = useState(p?.cuts_g3 ?? null);
    const [g2, setG2] = useState(p?.cuts_g2 ?? null);
    const [g1, setG1] = useState(p?.cuts_g1 ?? null);
    const [notes, setNotes] = useState(p?.notes ?? null);
    const [busy, setBusy] = useState(false);
    const S = d.settings;
    const save = async () => {
        setBusy(true);
        try {
            await api.saveStrainPlan({ strain: r.strain, cuts_g3: g3, cuts_g2: g2, cuts_g1: g1, notes });
            onClose();
            await onSaved(t('{strain} plan saved', { strain: r.strain }));
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
        finally {
            setBusy(false);
        }
    };
    const line = (g, n) => _jsxs(_Fragment, { children: [_jsx("span", { children: n }), _jsxs("b", { children: [t('need {n}', { n: n0(g.need) }), " \u00B7 ", t('have {n}', { n: n0(g.have) }), g.rooting ? ` + ${n0(g.rooting)} ${t('rooting')}` : '', " \u00B7 ", t('cut {n} ({trays} trays) by {date}', { n: n0(g.cut), trays: g.trays, date: fmtD(g.cutBy, true) || '—' })] })] });
    return (_jsxs(Sheet, { title: r.strain, sub: `${t('{n} plants ordered', { n: n0(r.orders) })} · ${tn(r.nOrders, '{n} order', '{n} orders')} · ${t('first delivery')} ${fmtD(r.firstDeliver, true) || '—'}`, onClose: onClose, children: [_jsxs("div", { className: "calcbox", children: [_jsx("span", { children: t('G4 production clones') }), _jsxs("b", { children: [n0(r.g4.cuttings), " cuttings \u00B7 ", r.g4.trays, " ", r.g4.trays === 1 ? 'tray' : 'trays', " \u00B7 cut by ", fmtD(r.g4.cutBy, true) || '—'] }), line(r.g3, 'G3 field moms'), _jsx("span", { children: t('Plant G3 by') }), _jsx("b", { children: fmtD(r.plantBy, true) || '—' }), line(r.g2, 'G2 greenhouse moms'), line(r.g1, 'G1')] }), _jsxs("h3", { children: ["Cuts per mom for ", r.strain] }), _jsxs("div", { className: "grid3", children: [_jsx(F, { label: t('G3 field mom'), hint: `(${t('default')} ${S.cutsG3})`, children: _jsx(NumIn, { value: g3, onChange: setG3 }) }), _jsx(F, { label: t('G2 greenhouse mom'), hint: `(${t('default')} ${S.cutsG2})`, children: _jsx(NumIn, { value: g2, onChange: setG2 }) }), _jsx(F, { label: "G1", hint: `(${t('default')} ${S.cutsG1})`, children: _jsx(NumIn, { value: g1, onChange: setG1 }) })] }), _jsx(F, { label: t('Notes'), children: _jsx(TextIn, { value: notes, onChange: setNotes, placeholder: t('e.g. slow rooter, cut twice') }) }), _jsx(SaveBar, { busy: busy, onCancel: onClose, onSave: save })] }));
}
