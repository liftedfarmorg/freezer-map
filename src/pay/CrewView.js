import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Select } from '../combo';
import './pay.css';
import '../cult/cult.css';
import { useEffect, useMemo, useState } from 'react';
import { PayApi, TASK_LABEL, addDays, payOf, periodStart, rateOn } from './api';
import { t } from '../i18n';
import { DateIn, F, NumIn, Pick, Sheet, SaveBar, TextIn, errText } from '../cult/ui';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const n0 = (x) => (x == null || !isFinite(x) ? '' : Math.round(x).toLocaleString());
const n2 = (x) => (x == null || !isFinite(x) ? '' : (Math.round(x * 100) / 100).toLocaleString());
const money = (x) => `$${x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const fmtD = (iso) => (iso ? new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : '');
const flowerLabel = (task) => (task === 'buck' ? t('Bucked lbs') : t('Flower lbs'));
export function CrewTab({ sb, runs, flash, canEdit, isAdmin, onOpenRun }) {
    const api = useMemo(() => new PayApi(sb), [sb]);
    const [sec, setSec] = useState('prod');
    const [emps, setEmps] = useState(null);
    const [err, setErr] = useState(null);
    const load = async () => { try {
        setEmps(await api.employees());
        setErr(null);
    }
    catch (e) {
        setErr(errText(e));
    } };
    useEffect(() => { load(); }, [api]);
    if (err)
        return _jsxs("div", { className: "list", children: [_jsx("h2", { children: t('Crew') }), _jsxs("div", { className: "warnbox", children: [t("Couldn't load the crew."), " ", t('If this is the first time, run 048_piece_rate.sql in Supabase.'), " (", err, ")"] })] });
    if (!emps)
        return _jsxs("div", { className: "list", children: [_jsx("h2", { children: t('Crew') }), _jsx("p", { className: "muted", children: t('Loading…') })] });
    const open = runs.filter(r => r.status === 'open');
    return (_jsxs("div", { className: "list crew", children: [_jsx("h2", { children: t('Crew') }), canEdit && open.length > 0 && _jsx("div", { className: "crew-runs", children: open.map(r => _jsxs("button", { className: "ghost", onClick: () => onOpenRun(r.id, today()), children: [t('Log today'), ": ", _jsx("b", { children: r.code }), " ", _jsxs("span", { className: "muted", children: [t(TASK_LABEL[r.kind]), " \u00B7 ", r.strain] })] }, r.id)) }), canEdit && !open.length && _jsx("p", { className: "muted small-note", children: t('Crew days are logged inside a run. Start a bucking or trimming run in Runs, then log each day there.') }), _jsx("div", { className: "seg wrap", children: [['prod', t('Productivity')], ['days', t('Days logged')], ['crew', t('Crew list')], ['rates', t('Piece rates')]].map(([k, l]) => _jsx("button", { className: sec === k ? 'on' : '', onClick: () => setSec(k), children: l }, k)) }), sec === 'prod' && _jsx(Productivity, { api: api, flash: flash }), sec === 'days' && _jsx(Days, { api: api, runs: runs, flash: flash, onOpenRun: onOpenRun }), sec === 'crew' && _jsx(CrewList, { api: api, emps: emps, flash: flash, canEdit: canEdit, onChanged: load }), sec === 'rates' && _jsx(RatesPanel, { sb: sb, flash: flash, canEdit: isAdmin })] }));
}
/** every crew day, newest first, one line per day and run. Tap to open that day in its run. */
function Days({ api, runs, flash, onOpenRun }) {
    const [back, setBack] = useState(14);
    const [rows, setRows] = useState(null);
    useEffect(() => { setRows(null); api.entries(addDays(today(), -back), today()).then(setRows).catch(e => flash(errText(e), true)); }, [back]);
    const lots = new Map();
    for (const e of rows ?? []) {
        const k = `${e.work_date}|${e.task}|${e.run_id ?? e.strain}`;
        const x = lots.get(k) ?? { date: e.work_date, task: e.task, run: e.run_id, strain: e.strain, people: new Set(), lbs: 0, hours: 0, pay: 0 };
        x.people.add(e.employee_id);
        x.lbs += e.lbs;
        x.hours += e.hours;
        x.pay += e.pay;
        lots.set(k, x);
    }
    const list = [...lots.values()].sort((a, b) => b.date.localeCompare(a.date));
    return _jsxs(_Fragment, { children: [_jsx("div", { className: "seg", children: [14, 42, 120].map(n => _jsx("button", { className: back === n ? 'on' : '', onClick: () => setBack(n), children: n === 14 ? t('2 weeks') : n === 42 ? t('6 weeks') : t('4 months') }, n)) }), !rows ? _jsx("p", { className: "muted", children: t('Loading…') }) : list.length ? _jsx("div", { className: "dlist", children: list.map(x => {
                    const r = runs.find(q => q.id === x.run);
                    return _jsxs("button", { className: "drow linkrow", disabled: !x.run, onClick: () => x.run && onOpenRun(x.run, x.date), children: [_jsxs("span", { className: "grow", children: [_jsx("b", { children: fmtD(x.date) }), " ", t(TASK_LABEL[x.task]), " \u00B7 ", r ? _jsx("b", { children: r.code }) : '', " ", x.strain] }), _jsxs("span", { className: "muted", children: [x.people.size, " ", t('people'), " \u00B7 ", n2(x.hours), " h"] }), _jsxs("b", { children: [n2(x.lbs), " lbs"] }), _jsx("span", { children: money(x.pay) })] }, `${x.date}${x.task}${x.run ?? x.strain}`);
                }) })
                : _jsx("p", { className: "muted", children: t('Nothing logged in this range.') })] });
}
let K = 1;
/** The crew lead's screen: one run, one day, everyone who worked it. Strain, lot and task come from the run. */
export function RunDayLog({ sb, run, date0, flash, canEdit, onSaved }) {
    const api = useMemo(() => new PayApi(sb), [sb]);
    const task = run.kind;
    const [emps, setEmps] = useState([]);
    const [rates, setRates] = useState([]);
    const [date, setDate] = useState(date0 ?? today());
    const [all, setAll] = useState(null);
    const [rows, setRows] = useState([]);
    const [busy, setBusy] = useState(false);
    const [newName, setNewName] = useState('');
    const loadAll = async () => { try {
        setAll(await api.runEntries(run.id));
    }
    catch (e) {
        flash(errText(e), true);
    } };
    useEffect(() => { Promise.all([api.employees(), api.rates()]).then(([e, r]) => { setEmps(e); setRates(r); }).catch(e => flash(errText(e), true)); loadAll(); }, [run.id]);
    useEffect(() => {
        if (!all)
            return;
        setRows(all.filter(e => e.work_date === date).map(e => ({ key: K++, id: e.id, employee_id: e.employee_id, lbs: e.lbs, mold: e.mold, smalls: e.smalls, trim: e.trim, hours: e.hours, note: e.note })));
    }, [all, date]);
    const std = rateOn(rates, task, date);
    // this day's piece rate: what was saved for the day, else the standing rate (FL25 workbook defaults)
    const [own, setOwn] = useState({ rate: null, target: null });
    useEffect(() => {
        const e = all?.find(x => x.work_date === date);
        setOwn({ rate: e?.day_rate ?? null, target: e?.day_target ?? null });
    }, [all, date]);
    const rate = std || own.rate != null ? { id: 0, task, effective_from: date, notes: null, rate: own.rate ?? std?.rate ?? 0, target: own.target ?? std?.target ?? 0 } : undefined;
    const custom = (own.rate != null && own.rate !== std?.rate) || (own.target != null && own.target !== std?.target);
    const set = (k, p) => setRows(rs => rs.map(r => (r.key === k ? { ...r, ...p } : r)));
    const used = new Set(rows.filter(r => !r.delete).map(r => r.employee_id));
    const addWorker = (id) => { if (id)
        setRows(rs => [...rs, { key: K++, employee_id: id, lbs: null, mold: null, smalls: null, trim: null, hours: rs.find(r => !r.delete && r.hours)?.hours ?? null, fresh: true }]); };
    // yesterday's crew on this run, in one tap
    const prev = all ? [...new Set(all.filter(e => e.work_date < date).map(e => e.work_date))].sort().pop() : undefined;
    const prevCrew = prev ? [...new Set(all.filter(e => e.work_date === prev).map(e => e.employee_id))].filter(id => !used.has(id) && emps.find(e => e.id === id)?.active) : [];
    async function addNew() {
        if (!newName.trim())
            return;
        try {
            const e = await api.saveEmployee({ name: newName });
            setEmps(await api.employees());
            addWorker(e.id);
            setNewName('');
        }
        catch (e) {
            flash(errText(e), true);
        }
    }
    const shown = rows.filter(r => !r.delete);
    const calc = (r) => payOf(r.lbs ?? 0, r.hours ?? 0, rate);
    const tot = { lbs: sum(shown.map(r => r.lbs ?? 0)), mold: sum(shown.map(r => r.mold ?? 0)), smalls: sum(shown.map(r => r.smalls ?? 0)), trim: sum(shown.map(r => r.trim ?? 0)),
        hours: sum(shown.map(r => r.hours ?? 0)), pay: sum(shown.map(r => calc(r).pay)) };
    async function save() {
        if (shown.some(r => !(r.hours > 0))) {
            flash(t('Everyone needs hours'), true);
            return;
        }
        setBusy(true);
        try {
            const keep = (v, d) => (v == null || v === d ? null : v);
            const n = await api.saveDay(date, task, run.id, null, null, rows.map(r => ({ id: r.id ?? null, employee_id: r.employee_id, lbs: r.lbs, mold: r.mold, smalls: r.smalls, trim: r.trim, hours: r.hours, note: r.note ?? null, delete: r.delete })), keep(own.rate, std?.rate), keep(own.target, std?.target));
            flash(t('{n} saved', { n }));
            await loadAll();
            onSaved();
        }
        catch (e) {
            flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    const days = new Map();
    for (const e of all ?? []) {
        const x = days.get(e.work_date) ?? { people: new Set(), lbs: 0, pay: 0 };
        x.people.add(e.employee_id);
        x.lbs += e.lbs;
        x.pay += e.pay;
        days.set(e.work_date, x);
    }
    const editable = canEdit && run.status !== 'cancelled';
    return _jsxs("div", { className: "crew", children: [_jsx("div", { className: "crew-top", children: _jsx(F, { label: t('Day'), children: _jsx(DateIn, { value: date, onChange: v => v && setDate(v) }) }) }), _jsxs("div", { className: "grid2 crew-rate", children: [_jsx(F, { label: t('$ per lb this day'), hint: std ? `(${t('standard')} $${std.rate.toFixed(2)})` : '', children: _jsx(NumIn, { value: own.rate ?? std?.rate ?? null, onChange: v => editable && setOwn(o => ({ ...o, rate: v })) }) }), _jsx(F, { label: t('Target lbs/hr'), hint: std ? `(${t('standard')} ${std.target})` : '', children: _jsx(NumIn, { value: own.target ?? std?.target ?? null, onChange: v => editable && setOwn(o => ({ ...o, target: v })) }) })] }), rate ? _jsxs("p", { className: `small-note ${custom ? 'warn-t' : 'muted'}`, children: [custom ? t('Special rate for this day.') + ' ' : '', t('{task}: ${rate}/lb when someone does {target} lbs/hr or more that day. Under that, no piece pay.', { task: t(TASK_LABEL[task]), rate: rate.rate.toFixed(2), target: rate.target }), custom && editable && _jsxs(_Fragment, { children: [" ", _jsx("button", { className: "linkbtn", onClick: () => setOwn({ rate: null, target: null }), children: t('Back to the standard rate') })] })] })
                : _jsx("p", { className: "warn-t small-note", children: t('No piece rate set for this day.') }), _jsxs("div", { className: "crew-rows", children: [shown.map(r => {
                        const c = calc(r);
                        return _jsxs("div", { className: `crew-row ${c.hit ? 'crew-ok' : r.hours && r.lbs ? 'crew-under' : ''}`, children: [_jsxs("div", { className: "row between", children: [_jsx(Select, { value: r.employee_id ?? '', disabled: !editable, onChange: e => set(r.key, { employee_id: Number(e.target.value) }), children: emps.filter(e => e.active || e.id === r.employee_id).map(e => _jsx("option", { value: e.id, disabled: e.id !== r.employee_id && used.has(e.id), children: e.name }, e.id)) }), _jsx("span", { className: "crew-pay", children: r.hours && r.lbs != null ? _jsxs(_Fragment, { children: [n2(c.lph), " ", t('lbs/hr'), " ", c.hit ? '✓' : '✗', " \u00B7 ", _jsx("b", { children: money(c.pay) })] }) : '' }), editable && _jsx("button", { className: "ghost small", "aria-label": t('Remove'), onClick: () => r.id ? set(r.key, { delete: true }) : setRows(rs => rs.filter(x => x.key !== r.key)), children: "\u2715" })] }), _jsxs("div", { className: `crew-nums ${task}`, children: [_jsxs("label", { children: [t('Hours'), _jsx(NumIn, { value: r.hours, onChange: v => set(r.key, { hours: v }) })] }), _jsxs("label", { children: [flowerLabel(task), _jsx(NumIn, { value: r.lbs, onChange: v => set(r.key, { lbs: v }) })] }), _jsxs("label", { children: [t('Mold'), _jsx(NumIn, { value: r.mold, onChange: v => set(r.key, { mold: v }) })] }), task === 'trim' && _jsxs("label", { children: [t('Smalls'), _jsx(NumIn, { value: r.smalls, onChange: v => set(r.key, { smalls: v }) })] }), _jsxs("label", { children: [t('Trim'), _jsx(NumIn, { value: r.trim, onChange: v => set(r.key, { trim: v }) })] })] })] }, r.key);
                    }), !shown.length && _jsx("p", { className: "muted", children: t('Nobody logged yet for this day. Add the people who worked.') })] }), editable && _jsxs("div", { className: "row wrap crew-add", children: [prevCrew.length > 0 && _jsx("button", { className: "ghost small", onClick: () => prevCrew.forEach(addWorker), children: t('+ Same crew as {d} ({n})', { d: fmtD(prev), n: prevCrew.length }) }), _jsx(Pick, { value: null, blank: t('+ Add a person…'), options: emps.filter(e => e.active && !used.has(e.id)).map(e => ({ v: e.id, l: e.name })), onChange: addWorker }), _jsx("input", { value: newName, placeholder: t('New person (name)'), onChange: e => setNewName(e.target.value), onKeyDown: e => { if (e.key === 'Enter')
                            addNew(); } }), _jsx("button", { className: "ghost small", disabled: !newName.trim(), onClick: addNew, children: t('Add') }), shown.length > 1 && shown[0].hours ? _jsx("button", { className: "ghost small", onClick: () => setRows(rs => rs.map(r => ({ ...r, hours: shown[0].hours }))), children: t('Same hours for everyone') }) : null] }), shown.length > 0 && _jsxs("div", { className: "ckpis", children: [_jsxs("div", { children: [_jsx("b", { children: n2(tot.lbs) }), _jsx("span", { children: flowerLabel(task) })] }), _jsxs("div", { children: [_jsx("b", { children: n2(tot.mold) }), _jsx("span", { children: t('Mold') })] }), task === 'trim' && _jsxs("div", { children: [_jsx("b", { children: n2(tot.smalls) }), _jsx("span", { children: t('Smalls') })] }), _jsxs("div", { children: [_jsx("b", { children: n2(tot.trim) }), _jsx("span", { children: t('Trim') })] }), _jsxs("div", { children: [_jsx("b", { children: n2(tot.hours) }), _jsx("span", { children: t('Hours') })] }), _jsxs("div", { children: [_jsx("b", { children: money(tot.pay) }), _jsx("span", { children: t('Piece pay') })] })] }), editable && _jsxs("div", { className: "row between csave", children: [_jsx("span", { className: "muted small", children: fmtD(date) }), _jsx("button", { className: "primary", disabled: busy || (!shown.length && !rows.some(r => r.delete)), onClick: save, children: busy ? t('Saving…') : t('Save the day') })] }), _jsx("h3", { className: "csec", children: t('Days on this run') }), days.size ? _jsx("div", { className: "dlist", children: [...days.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([dt, x]) => _jsxs("button", { className: `drow linkrow${dt === date ? ' on' : ''}`, onClick: () => setDate(dt), children: [_jsx("span", { className: "grow", children: _jsx("b", { children: fmtD(dt) }) }), _jsxs("span", { className: "muted", children: [x.people.size, " ", t('people')] }), _jsxs("b", { children: [n2(x.lbs), " lbs"] }), _jsx("span", { children: money(x.pay) })] }, dt)) })
                : _jsx("p", { className: "muted", children: t('No days logged on this run yet.') })] });
}
// ---------- productivity ----------
function Productivity({ api, flash }) {
    const per = periodStart(today());
    const RANGES = [
        [t('This pay period'), per, addDays(per, 13)], [t('Last pay period'), addDays(per, -14), addDays(per, -1)],
        [t('Last 90 days'), addDays(today(), -90), today()], [t('FL25 season'), '2025-08-01', '2026-07-31'], [t('FL26 season'), '2026-08-01', '2027-07-31']
    ];
    const [rg, setRg] = useState(0);
    const [task, setTask] = useState('trim');
    const [rows, setRows] = useState(null);
    useEffect(() => {
        setRows(null);
        api.entries(RANGES[rg][1], RANGES[rg][2]).then(rs => {
            setRows(rs);
            if (!rs.some(e => e.task === task)) {
                const other = task === 'trim' ? 'buck' : 'trim';
                if (rs.some(e => e.task === other))
                    setTask(other);
            }
        }).catch(e => flash(errText(e), true));
    }, [rg]);
    const es = (rows ?? []).filter(e => e.task === task);
    const by = (key) => { const m = new Map(); for (const e of es)
        m.set(key(e), [...(m.get(key(e)) ?? []), e]); return m; };
    const people = [...by(e => e.employee).entries()].map(([name, xs]) => ({ name, days: new Set(xs.map(x => x.work_date)).size, n: xs.length, hit: xs.filter(x => x.hit).length,
        hours: sum(xs.map(x => x.hours)), lbs: sum(xs.map(x => x.lbs)), mold: sum(xs.map(x => x.mold)), pay: sum(xs.map(x => x.pay)) })).sort((a, b) => b.lbs / (b.hours || 1) - a.lbs / (a.hours || 1));
    const strains = [...by(e => `${e.strain ?? '?'}|${e.crop_year ?? ''}`).entries()].map(([k, xs]) => ({ k, strain: k.split('|')[0], year: k.split('|')[1], hours: sum(xs.map(x => x.hours)),
        lbs: sum(xs.map(x => x.lbs)), mold: sum(xs.map(x => x.mold)), smalls: sum(xs.map(x => x.smalls)), trim: sum(xs.map(x => x.trim)), pay: sum(xs.map(x => x.pay)) })).sort((a, b) => b.lbs - a.lbs);
    const T = { hours: sum(es.map(x => x.hours)), lbs: sum(es.map(x => x.lbs)), pay: sum(es.map(x => x.pay)), hit: es.filter(x => x.hit).length };
    return _jsxs(_Fragment, { children: [_jsxs("div", { className: "row wrap toolbar", children: [_jsx("div", { className: "seg wrap", children: RANGES.map(([l], i) => _jsx("button", { className: rg === i ? 'on' : '', onClick: () => setRg(i), children: l }, l)) }), _jsx("div", { className: "seg", children: ['buck', 'trim'].map(k => _jsx("button", { className: task === k ? 'on' : '', onClick: () => setTask(k), children: t(TASK_LABEL[k]) }, k)) })] }), !rows ? _jsx("p", { className: "muted", children: t('Loading…') }) : !es.length ? _jsx("p", { className: "muted", children: t('Nothing logged in this range.') }) : _jsxs(_Fragment, { children: [_jsxs("div", { className: "ckpis", children: [_jsxs("div", { children: [_jsx("b", { children: n0(T.lbs) }), _jsx("span", { children: flowerLabel(task) })] }), _jsxs("div", { children: [_jsx("b", { children: n0(T.hours) }), _jsx("span", { children: t('Hours') })] }), _jsxs("div", { children: [_jsx("b", { children: n2(T.lbs / (T.hours || 1)) }), _jsx("span", { children: t('lbs/hr') })] }), _jsxs("div", { children: [_jsxs("b", { children: [Math.round((T.hit / es.length) * 100), "%"] }), _jsx("span", { children: t('days at target') })] }), _jsxs("div", { children: [_jsx("b", { children: money(T.pay) }), _jsx("span", { children: t('Piece pay') })] }), _jsxs("div", { children: [_jsx("b", { children: T.lbs ? money(T.pay / T.lbs) : '' }), _jsx("span", { children: t('per lb') })] })] }), _jsx("h3", { className: "csec", children: t('By person') }), _jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('Name') }), _jsx("th", { className: "num", children: t('Days') }), _jsx("th", { className: "num", children: t('Hours') }), _jsx("th", { className: "num", children: t('Lbs') }), _jsx("th", { className: "num", children: t('lbs/hr') }), _jsx("th", { className: "num", children: t('At target') }), _jsx("th", { className: "num hide-s", children: t('Mold') }), _jsx("th", { className: "num", children: t('Pay') })] }) }), _jsx("tbody", { children: people.map(p => _jsxs("tr", { children: [_jsx("td", { children: p.name }), _jsx("td", { className: "num", children: p.days }), _jsx("td", { className: "num", children: n2(p.hours) }), _jsx("td", { className: "num", children: n2(p.lbs) }), _jsx("td", { className: "num", children: _jsx("b", { children: n2(p.lbs / (p.hours || 1)) }) }), _jsxs("td", { className: "num", children: [Math.round((p.hit / p.n) * 100), "%"] }), _jsx("td", { className: "num hide-s", children: n2(p.mold) }), _jsx("td", { className: "num", children: money(p.pay) })] }, p.name)) })] }) }), _jsxs("h3", { className: "csec", children: [t('By strain'), " ", _jsx("span", { className: "muted", children: t('labor cost per lb') })] }), _jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('Strain') }), _jsx("th", { className: "num", children: t('Hours') }), _jsx("th", { className: "num", children: flowerLabel(task) }), _jsx("th", { className: "num", children: t('Mold') }), task === 'trim' && _jsx("th", { className: "num", children: t('Smalls') }), _jsx("th", { className: "num", children: t('Trim') }), _jsx("th", { className: "num", children: t('Pay') }), _jsx("th", { className: "num", children: t('$/lb') })] }) }), _jsx("tbody", { children: strains.map(s => _jsxs("tr", { children: [_jsxs("td", { children: [s.strain, " ", _jsx("span", { className: "muted", children: s.year })] }), _jsx("td", { className: "num", children: n0(s.hours) }), _jsx("td", { className: "num", children: n2(s.lbs) }), _jsx("td", { className: "num", children: n2(s.mold) }), task === 'trim' && _jsx("td", { className: "num", children: n2(s.smalls) }), _jsx("td", { className: "num", children: n2(s.trim) }), _jsx("td", { className: "num", children: money(s.pay) }), _jsx("td", { className: "num", children: _jsx("b", { children: s.lbs ? money(s.pay / s.lbs) : '' }) })] }, s.k)) })] }) })] })] });
}
// ---------- crew list (also in Accounting > Settings, with payroll IDs) ----------
export function CrewList({ api, emps, flash, canEdit, onChanged, payroll }) {
    const [ed, setEd] = useState(null);
    const [busy, setBusy] = useState(false);
    const [all, setAll] = useState(false);
    async function save() {
        setBusy(true);
        try {
            await api.saveEmployee(ed);
            flash(t('Saved'));
            await onChanged();
            setEd(null);
        }
        catch (e) {
            flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    const list = emps.filter(e => all || e.active);
    return _jsxs(_Fragment, { children: [_jsxs("div", { className: "row between toolbar", children: [_jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: all, onChange: e => setAll(e.target.checked) }), " ", t('Show people who left')] }), canEdit && _jsx("button", { className: "primary small", onClick: () => setEd({ active: true }), children: t('+ Person') })] }), _jsx("div", { className: "dlist", children: list.map(e => _jsxs("button", { className: "drow linkrow", disabled: !canEdit, onClick: () => setEd(e), children: [_jsxs("span", { className: "grow", children: [e.name, !e.active && _jsxs("span", { className: "muted", children: [" \u00B7 ", t('left')] })] }), payroll && _jsx("span", { className: e.payroll_id ? 'muted mono' : 'warn-t small', children: e.payroll_id ?? t('no payroll ID') })] }, e.id)) }), ed && _jsxs(Sheet, { title: ed.id ? ed.name : t('New person'), onClose: () => setEd(null), children: [_jsx(F, { label: t('Name'), children: _jsx(TextIn, { value: ed.name, onChange: v => setEd({ ...ed, name: v ?? '' }) }) }), payroll && _jsx(F, { label: t('Payroll ID'), hint: t('(as in the payroll system)'), children: _jsx(TextIn, { value: ed.payroll_id, onChange: v => setEd({ ...ed, payroll_id: v }) }) }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: ed.active !== false, onChange: e => setEd({ ...ed, active: e.target.checked }) }), " ", t('Still on the crew')] }), _jsx(SaveBar, { busy: busy, onCancel: () => setEd(null), onSave: save, disabled: !ed.name?.trim() })] })] });
}
/** piece rates with start dates (Accounting / Processing Admins) */
export function RatesPanel({ sb, flash, canEdit }) {
    const api = useMemo(() => new PayApi(sb), [sb]);
    const [rates, setRates] = useState(null);
    const [ed, setEd] = useState(null);
    const [busy, setBusy] = useState(false);
    const load = () => api.rates().then(setRates).catch(e => flash(errText(e), true));
    useEffect(() => { load(); }, [api]);
    async function save() {
        setBusy(true);
        try {
            await api.saveRate(ed.task, ed.rate, ed.target, ed.from, ed.notes);
            flash(t('Saved'));
            await load();
            setEd(null);
        }
        catch (e) {
            flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    return _jsxs(_Fragment, { children: [_jsx("p", { className: "muted", children: t('Piece pay = every flower lb x the rate, on days someone reaches the target lbs per hour. A new rate starts on its date; older days keep the old rate.') }), _jsx("div", { className: "dlist", children: (rates ?? []).map(r => _jsxs("div", { className: "drow", children: [_jsxs("span", { className: "grow", children: [_jsx("b", { children: t(TASK_LABEL[r.task]) }), " ", money(r.rate), "/lb \u00B7 ", t('target'), " ", r.target, " lbs/hr"] }), _jsxs("span", { className: "muted", children: [t('from'), " ", r.effective_from] })] }, r.id)) }), canEdit && _jsx("button", { className: "ghost small", onClick: () => setEd({ task: 'trim', rate: null, target: null, from: today(), notes: '' }), children: t('+ New rate') }), ed && _jsxs(Sheet, { title: t('New piece rate'), onClose: () => setEd(null), children: [_jsx(F, { label: t('Work'), children: _jsx(Pick, { value: ed.task, options: ['buck', 'trim'].map(k => ({ v: k, l: t(TASK_LABEL[k]) })), onChange: v => setEd({ ...ed, task: v ?? 'trim' }) }) }), _jsxs("div", { className: "grid2", children: [_jsx(F, { label: t('$ per lb'), children: _jsx(NumIn, { value: ed.rate, onChange: v => setEd({ ...ed, rate: v }) }) }), _jsx(F, { label: t('Target lbs/hr'), children: _jsx(NumIn, { value: ed.target, onChange: v => setEd({ ...ed, target: v }) }) })] }), _jsx(F, { label: t('Starts'), children: _jsx(DateIn, { value: ed.from, onChange: v => setEd({ ...ed, from: v }) }) }), _jsx(F, { label: t('Note'), children: _jsx(TextIn, { value: ed.notes, onChange: v => setEd({ ...ed, notes: v ?? '' }) }) }), _jsx(SaveBar, { busy: busy, onCancel: () => setEd(null), onSave: save, disabled: ed.rate == null || ed.target == null || !ed.from })] })] });
}
