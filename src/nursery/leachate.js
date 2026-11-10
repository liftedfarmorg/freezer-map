import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Select } from '../combo';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { pageAll } from '../pageAll';
import { fmtD, today } from './calc';
import { DateIn, F, NumIn, Pick, SaveBar, Sheet, TextIn } from '../cult/ui';
import { canEditMod } from '../fold';
import { t } from '../i18n';
const NUMS = ['minutes', 'leach_vol', 'leach_ec', 'leach_ph', 'front_ml', 'front_ec', 'front_ph', 'back_ml', 'back_ec', 'back_ph', 'water_ml_plant', 'expect_pct', 'leach_pct'];
const f = (x, d = 1) => (x == null ? '' : String(Math.round(Number(x) * 10 ** d) / 10 ** d));
const avg = (xs) => { const v = xs.filter((x) => x != null && Number(x) > 0).map(Number); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const inEc = (r) => avg([r.front_ec, r.back_ec]), inPh = (r) => avg([r.front_ph, r.back_ph]);
// Leach % = leachate volume out ÷ front emitter mL (the catch sits at the front). Expected % = average emitter mL ÷ water per plant.
// Same math as the 2026 Field Leachate sheet; the database (060) recalculates on every save too.
const r1 = (v) => Math.round(v * 10) / 10;
export function leachPct(r) {
    return r.leach_vol != null && r.front_ml != null && r.front_ml > 0 ? r1(r.leach_vol / r.front_ml * 100) : null;
}
export function expectPct(r) {
    const ins = [r.front_ml, r.back_ml].filter((v) => v != null);
    return ins.length && r.water_ml_plant != null && r.water_ml_plant > 0 ? r1(ins.reduce((a, b) => a + b, 0) / ins.length / r.water_ml_plant * 100) : null;
}
/** Nursery > Logs > Leachate: EC and pH going in vs coming out, per hoop per day */
export function Leachate({ sb, d, flash }) {
    const [rows, setRows] = useState(null);
    const [err, setErr] = useState(null);
    const [place, setPlace] = useState('');
    const [year, setYear] = useState(null);
    const [open, setOpen] = useState(null);
    const [ed, setEd] = useState(null);
    const load = async () => {
        const { data, error } = await pageAll((a, b) => sb.from('nursery_leachate').select('*').order('taken_on', { ascending: false }).order('id').range(a, b));
        if (error) {
            setErr(/nursery_leachate/.test(error.message) ? t('Leachate needs 041_leachate.sql run in Supabase.') : error.message);
            return;
        }
        setRows((data ?? []));
        setErr(null);
    };
    useEffect(() => { load(); }, [sb]);
    const rooms = useMemo(() => new Map(d.rooms.map(r => [r.id, r])), [d.rooms]);
    if (err)
        return _jsx("div", { className: "warnbox", children: err });
    if (!rows)
        return _jsx("p", { className: "muted", children: t('Loading…') });
    const years = [...new Set(rows.map(r => Number(r.taken_on.slice(0, 4))))].sort((a, b) => b - a);
    const yr = year ?? years[0] ?? new Date().getFullYear();
    const places = [...new Set(rows.map(r => rooms.get(r.room_id ?? -1)?.place).filter((p) => !!p))];
    const shown = rows.filter(r => r.taken_on.startsWith(String(yr)) && (!place || rooms.get(r.room_id ?? -1)?.place === place));
    const days = new Map();
    for (const r of shown)
        (days.get(r.taken_on) ?? days.set(r.taken_on, []).get(r.taken_on)).push(r);
    const first = [...days.keys()][0];
    const isOpen = (k) => (open ?? new Set([first])).has(k);
    const toggle = (k) => setOpen(s => { const x = new Set(s ?? [first]); if (x.has(k))
        x.delete(k);
    else
        x.add(k); return x; });
    const where = (r) => [rooms.get(r.room_id ?? -1)?.name, r.bed].filter(Boolean).join(' ');
    const sortKey = (r) => { const n = rooms.get(r.room_id ?? -1); return `${n?.place ?? ''}|${String(n?.sort ?? 999).padStart(4, '0')}|${n?.name ?? ''}`; };
    const can = canEditMod('nursery');
    return _jsxs("div", { className: "leach", children: [_jsxs("div", { className: "row toolbar between", children: [_jsxs("div", { className: "row wrap", children: [_jsx(Select, { value: yr, onChange: e => setYear(Number(e.target.value)), children: (years.length ? years : [yr]).map(y => _jsx("option", { value: y, children: y }, y)) }), places.length > 1 && _jsx("div", { className: "seg", children: ['', ...places].map(p => _jsx("button", { className: place === p ? 'on' : '', onClick: () => setPlace(p), children: p || t('All') }, p || 'all')) })] }), can && _jsx("button", { className: "primary", onClick: () => setEd({ taken_on: today(), site: d.sites[0]?.code ?? '1PN' }), children: t('+ Leachate reading') })] }), _jsx("p", { className: "muted small-note", children: t('One line per hoop per day: what went in (front and back) and what came out.') }), !days.size ? _jsx("p", { className: "muted", children: t('No leachate readings in {yr}.', { yr }) }) : _jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable logtable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('Location') }), _jsx("th", { className: "num", children: t('Out') }), _jsx("th", { className: "num", children: t('EC out') }), _jsx("th", { className: "num", children: t('pH out') }), _jsx("th", { className: "num", children: t('EC in') }), _jsx("th", { className: "num", children: t('pH in') }), _jsx("th", { className: "num hide-s", children: t('Front mL') }), _jsx("th", { className: "num hide-s", children: t('Back mL') }), _jsx("th", { className: "num hide-s", children: t('Leach %') }), _jsx("th", { className: "hide-s", children: t('Notes') })] }) }), _jsx("tbody", { children: [...days.entries()].map(([day, rs]) => _jsxs(Fragment, { children: [_jsx("tr", { className: "mhead", onClick: () => toggle(day), children: _jsxs("td", { colSpan: 10, children: [_jsxs("b", { children: [isOpen(day) ? '▾' : '▸', " ", fmtD(day, true)] }), _jsxs("span", { className: "muted", children: [" \u00B7 ", rs.length, " ", t('readings'), " \u00B7 ", t('EC'), " ", f(avg(rs.map(inEc))), " \u2192 ", f(avg(rs.map(r => r.leach_ec))), " \u00B7 ", t('pH'), " ", f(avg(rs.map(inPh))), " \u2192 ", f(avg(rs.map(r => r.leach_ph)))] })] }) }), isOpen(day) && [...rs].sort((a, b) => sortKey(a).localeCompare(sortKey(b))).map(r => {
                                        return _jsxs("tr", { className: "tap", onClick: () => setEd(r), children: [_jsx("td", { children: where(r) || '—' }), _jsx("td", { className: "num", children: f(r.leach_vol, 0) }), _jsx("td", { className: "num", children: f(r.leach_ec) }), _jsx("td", { className: "num", children: f(r.leach_ph) }), _jsx("td", { className: "num", children: f(inEc(r)) }), _jsx("td", { className: "num", children: f(inPh(r)) }), _jsx("td", { className: "num hide-s", children: f(r.front_ml, 0) }), _jsx("td", { className: "num hide-s", children: f(r.back_ml, 0) }), _jsx("td", { className: "num hide-s", children: (r.leach_pct ?? leachPct(r)) != null ? `${f(r.leach_pct ?? leachPct(r))}%` : '' }), _jsx("td", { className: "hide-s small", children: r.notes })] }, r.id);
                                    })] }, day)) })] }) }), ed && _jsx(LeachSheet, { sb: sb, d: d, x0: ed, can: can, flash: flash, onClose: () => setEd(null), onSaved: async (m) => { setEd(null); await load(); flash(m); } })] });
}
function LeachSheet({ sb, d, x0, can, flash, onClose, onSaved }) {
    const [x, setX] = useState(x0);
    const [busy, setBusy] = useState(false);
    const set = (v) => setX(s => ({ ...s, ...v }));
    const room = d.rooms.find(r => r.id === x.room_id);
    const n = (k, l) => _jsx(F, { label: t(l), children: _jsx(NumIn, { value: x[k], onChange: v => set({ [k]: v }) }) });
    async function save() {
        setBusy(true);
        const row = { site: x.site ?? '1PN', room_id: x.room_id ?? null, bed: x.bed || null, taken_on: x.taken_on, notes: x.notes || null };
        for (const k of NUMS)
            row[k] = x[k] ?? null;
        row.leach_pct = leachPct(x);
        row.expect_pct = expectPct(x);
        const { error } = x.id ? await sb.from('nursery_leachate').update(row).eq('id', x.id) : await sb.from('nursery_leachate').insert(row);
        setBusy(false);
        if (error)
            flash(error.message, true);
        else
            await onSaved(t('Leachate saved'));
    }
    async function del() {
        setBusy(true);
        const { error } = await sb.from('nursery_leachate').delete().eq('id', x.id);
        setBusy(false);
        if (error)
            flash(error.message, true);
        else
            await onSaved(t('Reading deleted'));
    }
    return _jsxs(Sheet, { title: x.id ? `${room?.name ?? t('Leachate')} · ${fmtD(x.taken_on)}` : t('New leachate reading'), onClose: onClose, wide: true, children: [_jsxs("div", { className: "grid3", children: [_jsx(F, { label: t('Date'), children: _jsx(DateIn, { value: x.taken_on, onChange: v => set({ taken_on: v ?? today() }) }) }), _jsx(F, { label: t('Location'), children: _jsx(Pick, { value: x.room_id, blank: "\u2014", options: d.rooms.filter(r => r.active || r.id === x.room_id).map(r => ({ v: r.id, l: `${r.name}${r.place !== 'Webb' && !r.name.startsWith(r.place) ? ` (${r.place})` : ''}` })), onChange: v => set({ room_id: v }) }) }), _jsx(F, { label: t('Bed'), children: _jsx(TextIn, { value: x.bed, onChange: v => set({ bed: v }) }) })] }), _jsx("h3", { children: t('Coming out') }), _jsxs("div", { className: "grid3", children: [n('leach_vol', 'Leachate volume'), n('leach_ec', 'EC out'), n('leach_ph', 'pH out')] }), _jsx("h3", { children: t('Going in') }), _jsxs("div", { className: "grid3", children: [n('front_ml', 'Front mL'), n('front_ec', 'Front EC'), n('front_ph', 'Front pH'), n('back_ml', 'Back mL'), n('back_ec', 'Back EC'), n('back_ph', 'Back pH')] }), _jsxs("div", { className: "grid3", children: [n('minutes', 'Run time (min)'), n('water_ml_plant', 'Water per plant (mL)'), _jsx(F, { label: t('Leach %'), hint: t('(auto)'), children: _jsx("div", { className: "calcval", children: leachPct(x) != null ? `${f(leachPct(x))}%` : '—' }) })] }), _jsx("div", { className: "grid3", children: _jsx(F, { label: t('Expected %'), hint: t('(auto)'), children: _jsx("div", { className: "calcval", children: expectPct(x) != null ? `${f(expectPct(x))}%` : '—' }) }) }), _jsx("p", { className: "muted small", children: t('Leach % = leachate volume ÷ front mL. Expected % = average of front and back mL ÷ water per plant.') }), _jsx(F, { label: t('Notes'), children: _jsx(TextIn, { value: x.notes, onChange: v => set({ notes: v }) }) }), x.source && x.source !== 'app' && _jsx("p", { className: "muted small", children: t('From the 2026 Field Leachate sheet.') }), can ? _jsx(SaveBar, { busy: busy, disabled: !x.taken_on, onCancel: onClose, onSave: save, onDelete: x.id ? del : undefined })
                : _jsx("div", { className: "row", children: _jsx("button", { className: "ghost", onClick: onClose, children: t('Close') }) })] });
}
