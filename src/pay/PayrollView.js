import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Select } from '../combo';
import './pay.css';
import '../cult/cult.css';
import { useEffect, useMemo, useState } from 'react';
import { PayApi, TASK_LABEL, addDays, periodStart } from './api';
import { F, NumIn, Pick, Sheet, SaveBar, TextIn, errText } from '../cult/ui';
import { CrewList, RatesPanel } from './CrewView';
// Accounting > Payroll: piece pay per bi-weekly period, the way the FL25 Payroll Summary tab laid it out.
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const money = (x) => `${x < 0 ? '-' : ''}$${Math.abs(x).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const n2 = (x) => (Math.round(x * 100) / 100).toLocaleString();
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const fmt = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString([], { month: '2-digit', day: '2-digit', year: '2-digit' });
const label = (s) => `${fmt(s)} - ${fmt(addDays(s, 13))}`;
const FARMS = ['GVR', 'OHR'];
function people(s) {
    const m = new Map();
    const get = (id, name, pid) => { let p = m.get(id); if (!p) {
        p = { id, name, payroll_id: pid, hours: 0, cells: {}, adj: 0, total: 0 };
        m.set(id, p);
    } return p; };
    for (const l of s.lines) {
        const p = get(l.employee_id, l.name, l.payroll_id), k = `${l.task}|${l.farm ?? '?'}`;
        const c = p.cells[k] ?? { pieces: 0, amount: 0 };
        c.pieces += l.paid_lbs;
        c.amount += l.amount;
        p.cells[k] = c;
        p.hours += l.hours;
        p.total += l.amount;
    }
    for (const a of s.adjustments) {
        const p = get(a.employee_id, a.name, null);
        p.adj += a.amount;
        p.total += a.amount;
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
}
export function PayrollTab({ sb, flash, canEdit, isAdmin }) {
    const api = useMemo(() => new PayApi(sb), [sb]);
    const [periods, setPeriods] = useState(null);
    const [start, setStart] = useState(() => addDays(periodStart(today()), -14));
    const [s, setS] = useState(null);
    const [err, setErr] = useState(null);
    const [adj, setAdj] = useState(false);
    const [busy, setBusy] = useState(false);
    const [sure, setSure] = useState(null);
    const load = async () => {
        try {
            const [p, x] = await Promise.all([api.periods(), api.summary(start)]);
            setPeriods(p);
            setS(x);
            setErr(null);
        }
        catch (e) {
            setErr(errText(e));
        }
    };
    useEffect(() => { setS(null); load(); }, [start]);
    const act = async (f, ok) => { setBusy(true); try {
        await f();
        flash(ok);
        setSure(null);
        await load();
    }
    catch (e) {
        flash(errText(e), true);
    }
    finally {
        setBusy(false);
    } };
    if (err)
        return _jsxs("div", { className: "list", children: [_jsx("h2", { children: "Payroll" }), _jsxs("div", { className: "warnbox", children: ["Couldn't load payroll. If this is the first time, run 048_piece_rate.sql in Supabase. (", err, ")"] })] });
    const cur = periodStart(today());
    const opts = [...new Set([cur, addDays(cur, -14), ...(periods ?? []).map(p => p.starts)])].sort().reverse();
    const ps = s ? people(s) : [];
    const cols = ['buck', 'trim'].flatMap(tk => FARMS.map(f => [tk, f]));
    const used = cols.filter(([tk, f]) => ps.some(p => p.cells[`${tk}|${f}`]));
    const extra = ps.some(p => Object.keys(p.cells).some(k => k.endsWith('|?')));
    const show = [...used, ...(extra ? ['buck', 'trim'].filter(tk => ps.some(p => p.cells[`${tk}|?`])).map(tk => [tk, '?']) : [])];
    const total = sum(ps.map(p => p.total));
    const over = addDays(start, 13) < today();
    function csv() {
        const head = ['Name', 'Payroll ID', 'Hours', ...show.flatMap(([tk, f]) => [`${TASK_LABEL[tk]} ${f} pieces (lbs)`, `${TASK_LABEL[tk]} ${f} amount`]), 'Adjustments', 'Total piece pay'];
        const lines = ps.map(p => [p.name, p.payroll_id ?? '', n2(p.hours), ...show.flatMap(([tk, f]) => { const c = p.cells[`${tk}|${f}`]; return [c ? c.pieces.toFixed(2) : '', c ? c.amount.toFixed(2) : '']; }), p.adj ? p.adj.toFixed(2) : '', p.total.toFixed(2)]);
        const txt = [head, ...lines].map(r => r.map(v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(',')).join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv' }));
        a.download = `piece-pay-${start}.csv`;
        a.click();
    }
    return (_jsxs("div", { className: "list payroll", children: [_jsxs("div", { className: "row between wrap toolbar", children: [_jsx("h2", { children: "Payroll" }), _jsx(Select, { value: start, onChange: e => setStart(e.target.value), children: opts.map(o => {
                            const p = periods?.find(x => x.starts === o);
                            return _jsxs("option", { value: o, children: [label(o), o === cur ? ' (now)' : '', p?.status === 'closed' ? (p.exported_at ? ' · paid' : ' · closed') : ''] }, o);
                        }) })] }), _jsx("p", { className: "muted", children: "Piece pay for bucking and trimming, from what the crew lead logs in Processing \u203A Crew. It goes through regular bi-weekly payroll. Close the period when it's over: the lines lock and that's what goes to payroll." }), !s ? _jsx("p", { className: "muted", children: "Loading\u2026" }) : _jsxs(_Fragment, { children: [_jsxs("div", { className: "row wrap pay-status", children: [s.status === 'closed'
                                ? _jsxs("span", { className: "pill okp", children: [s.exported_at ? `Sent to payroll ${new Date(s.exported_at).toLocaleDateString()}` : `Closed ${s.closed_at ? new Date(s.closed_at).toLocaleDateString() : ''}`, s.closed_by ? ` · ${s.closed_by}` : ''] })
                                : _jsx("span", { className: `pill ${over ? 'warnp' : ''}`, children: over ? 'Over, not closed yet' : 'Open (still being logged)' }), s.notes && _jsx("span", { className: "muted small", children: s.notes }), _jsx("span", { className: "grow" }), _jsx("b", { children: money(total) }), _jsxs("span", { className: "muted", children: [ps.length, " people \u00B7 ", s.days, " days logged"] })] }), !ps.length ? _jsx("p", { className: "muted", children: "No piece work logged in this period." }) : _jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable paytable", children: [_jsxs("thead", { children: [_jsxs("tr", { children: [_jsx("th", { rowSpan: 2, children: "Name" }), _jsx("th", { rowSpan: 2, className: "num hide-s", children: "Hours" }), show.map(([tk, f]) => _jsxs("th", { className: "num", colSpan: 2, children: [TASK_LABEL[tk], " ", f] }, tk + f)), _jsx("th", { rowSpan: 2, className: "num", children: "Adj." }), _jsx("th", { rowSpan: 2, className: "num", children: "Total" })] }), _jsx("tr", { children: show.flatMap(([tk, f]) => [_jsx("th", { className: "num", children: "Pieces" }, tk + f + 'p'), _jsx("th", { className: "num", children: "Amount" }, tk + f + 'a')]) })] }), _jsxs("tbody", { children: [ps.map(p => _jsxs("tr", { children: [_jsxs("td", { children: [p.name, !p.payroll_id && _jsx("span", { className: "warn-t small", children: " \u00B7 no payroll ID" })] }), _jsx("td", { className: "num hide-s", children: n2(p.hours) }), show.flatMap(([tk, f]) => { const c = p.cells[`${tk}|${f}`]; return [_jsx("td", { className: "num", children: c ? n2(c.pieces) : '' }, tk + f + 'p'), _jsx("td", { className: "num", children: c ? money(c.amount) : '' }, tk + f + 'a')]; }), _jsx("td", { className: "num", children: p.adj ? money(p.adj) : '' }), _jsx("td", { className: "num", children: _jsx("b", { children: money(p.total) }) })] }, p.id)), _jsxs("tr", { className: "total", children: [_jsx("td", { children: _jsx("b", { children: "Total" }) }), _jsx("td", { className: "num hide-s", children: n2(sum(ps.map(p => p.hours))) }), show.flatMap(([tk, f]) => [_jsx("td", { className: "num", children: n2(sum(ps.map(p => p.cells[`${tk}|${f}`]?.pieces ?? 0))) }, tk + f + 'p'), _jsx("td", { className: "num", children: money(sum(ps.map(p => p.cells[`${tk}|${f}`]?.amount ?? 0))) }, tk + f + 'a')]), _jsx("td", { className: "num", children: money(sum(ps.map(p => p.adj))) }), _jsx("td", { className: "num", children: _jsx("b", { children: money(total) }) })] })] })] }) }), _jsx("p", { className: "muted small-note", children: "Pieces = flower lbs on days the person reached the target. GVR / OHR = where the product was grown (cost center)." }), s.adjustments.length > 0 && _jsxs(_Fragment, { children: [_jsx("h3", { className: "csec", children: "Adjustments" }), _jsx("div", { className: "dlist", children: s.adjustments.map(a => _jsxs("div", { className: "drow", children: [_jsxs("span", { className: "grow", children: [_jsx("b", { children: a.name }), " ", _jsxs("span", { className: "muted", children: [a.reason, " \u00B7 ", a.by] })] }), _jsx("b", { children: money(a.amount) }), canEdit && !s.exported_at && _jsx("button", { className: "ghost small", disabled: busy, onClick: () => act(() => api.removeAdjust(a.id), 'Adjustment removed'), children: "\u2715" })] }, a.id)) })] }), canEdit && _jsxs("div", { className: "row wrap csave", children: [!s.exported_at && _jsx("button", { className: "ghost", onClick: () => setAdj(true), children: "+ Adjustment" }), _jsx("span", { className: "grow" }), ps.length > 0 && _jsx("button", { className: "ghost", onClick: csv, children: "Download CSV" }), s.status === 'open' && over && (sure === 'close'
                                ? _jsxs(_Fragment, { children: [_jsxs("button", { className: "primary", disabled: busy, onClick: () => act(() => api.close(start, ''), 'Period closed'), children: ["Yes, close ", label(start)] }), _jsx("button", { className: "ghost small", onClick: () => setSure(null), children: "Keep open" })] })
                                : _jsx("button", { className: "primary", onClick: () => setSure('close'), children: "Close period" })), s.status === 'closed' && !s.exported_at && _jsx("button", { className: "primary", disabled: busy, onClick: () => act(() => api.exported(start), 'Marked sent to payroll'), children: "Mark sent to payroll" }), s.status === 'closed' && isAdmin && (sure === 'reopen'
                                ? _jsxs(_Fragment, { children: [_jsx("button", { className: "ghost danger", disabled: busy, onClick: () => act(() => api.reopen(start), 'Period reopened'), children: "Yes, reopen" }), _jsx("button", { className: "ghost small", onClick: () => setSure(null), children: "No" })] })
                                : _jsx("button", { className: "ghost", onClick: () => setSure('reopen'), children: "Reopen" }))] }), _jsx(DetailFold, { api: api, start: start, flash: flash })] }), adj && _jsx(AdjSheet, { api: api, start: start, flash: flash, onClose: () => setAdj(false), onDone: load })] }));
}
function DetailFold({ api, start, flash }) {
    const [open, setOpen] = useState(false);
    const [rows, setRows] = useState(null);
    useEffect(() => { if (open) {
        setRows(null);
        api.entries(start, addDays(start, 13)).then(setRows).catch(e => flash(errText(e), true));
    } }, [open, start]);
    return _jsxs(_Fragment, { children: [_jsxs("button", { className: "linkbtn", onClick: () => setOpen(!open), children: [open ? 'Hide' : 'Show', " every day logged"] }), open && (!rows ? _jsx("p", { className: "muted", children: "Loading\u2026" }) : _jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable small-t", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Day" }), _jsx("th", { children: "Name" }), _jsx("th", { children: "Work" }), _jsx("th", { children: "Strain" }), _jsx("th", { className: "num", children: "Hours" }), _jsx("th", { className: "num", children: "Lbs" }), _jsx("th", { className: "num", children: "lbs/hr" }), _jsx("th", { className: "num", children: "Pay" })] }) }), _jsx("tbody", { children: rows.map(e => _jsxs("tr", { children: [_jsx("td", { className: "nowrap", children: fmt(e.work_date) }), _jsx("td", { children: e.employee }), _jsx("td", { children: TASK_LABEL[e.task] }), _jsxs("td", { children: [e.strain, " ", _jsx("span", { className: "muted", children: e.farm ?? '' })] }), _jsx("td", { className: "num", children: n2(e.hours) }), _jsx("td", { className: "num", children: n2(e.lbs) }), _jsx("td", { className: `num ${e.hit ? 'ok-t' : 'muted'}`, children: e.lbs_hr != null ? n2(e.lbs_hr) : '' }), _jsx("td", { className: "num", children: money(e.pay) })] }, e.id)) })] }) }))] });
}
function AdjSheet({ api, start, flash, onClose, onDone }) {
    const [emps, setEmps] = useState([]);
    const [emp, setEmp] = useState(null);
    const [amt, setAmt] = useState(null);
    const [why, setWhy] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => { api.employees().then(setEmps).catch(() => { }); }, []);
    async function save() {
        setBusy(true);
        try {
            await api.adjust(start, emp, amt, why);
            flash('Adjustment added');
            await onDone();
            onClose();
        }
        catch (e) {
            flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    return _jsxs(Sheet, { title: "Pay adjustment", sub: label(start), onClose: onClose, children: [_jsx(F, { label: "Person", children: _jsx(Pick, { value: emp, blank: "Pick\u2026", options: emps.map(e => ({ v: e.id, l: e.name })), onChange: setEmp }) }), _jsx(F, { label: "Amount", hint: "($, negative to take off)", children: _jsx(NumIn, { value: amt, onChange: setAmt }) }), _jsx(F, { label: "Reason", children: _jsx(TextIn, { value: why, onChange: v => setWhy(v ?? '') }) }), _jsx(SaveBar, { busy: busy, onCancel: onClose, onSave: save, disabled: !emp || !amt || !why.trim() })] });
}
/** Accounting > Settings > Crew and piece rates */
export function PaySettings({ sb, flash, canEdit, isAdmin }) {
    const api = useMemo(() => new PayApi(sb), [sb]);
    const [emps, setEmps] = useState(null);
    const load = async () => { try {
        setEmps(await api.employees());
    }
    catch (e) {
        flash(errText(e), true);
    } };
    useEffect(() => { load(); }, [api]);
    return _jsxs(_Fragment, { children: [_jsx("h3", { className: "csec", children: "Crew and payroll IDs" }), emps ? _jsx(CrewList, { api: api, emps: emps, flash: flash, canEdit: canEdit, onChanged: load, payroll: true }) : _jsx("p", { className: "muted", children: "Loading\u2026" }), _jsx("h3", { className: "csec", children: "Piece rates" }), _jsx(RatesPanel, { sb: sb, flash: flash, canEdit: isAdmin })] });
}
