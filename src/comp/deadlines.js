import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Select } from '../combo';
import { useEffect, useState } from 'react';
import { CATEGORY_LABEL } from './api';
import { DocList, SITES, fmtD, today } from './files';
import { DocSheet } from './library';
import { DateIn, F, NumIn, Pick, SaveBar, Sheet, TextIn, errText } from '../cult/ui';
const KIND_LABEL = { obligation: 'Deadline', doc: 'Document', license: 'License', material: 'Material listing', customer: 'Customer license', fleet: 'Vehicle' };
const REPEAT = [{ v: 1, l: 'Every month' }, { v: 3, l: 'Every 3 months' }, { v: 6, l: 'Every 6 months' }, { v: 12, l: 'Every year' }, { v: 24, l: 'Every 2 years' }];
export const dueText = (d) => d.due_on == null ? 'needs a date' : d.days_left < 0 ? `${-d.days_left} day${d.days_left === -1 ? '' : 's'} late` : d.days_left === 0 ? 'today' : `in ${d.days_left} day${d.days_left === 1 ? '' : 's'}`;
export const dueTone = (d) => d.due_on == null ? 'cp-warn' : d.days_left < 0 ? 'cp-bad' : d.days_left <= d.remind_days ? 'cp-warn' : 'cp-mute';
export function Deadlines({ c }) {
    const [rows, setRows] = useState(null);
    const [obs, setObs] = useState([]);
    const [cat, setCat] = useState(null);
    const [site, setSite] = useState(null);
    const [edit, setEdit] = useState(null);
    const [done, setDone] = useState(null);
    const [doc, setDoc] = useState(null);
    const [all, setAll] = useState(false);
    const load = async () => { try {
        const [d, o] = await Promise.all([c.api.deadlines(), c.api.obligations()]);
        setRows(d);
        setObs(o);
    }
    catch (e) {
        c.flash(errText(e), true);
        setRows([]);
    } };
    useEffect(() => { load(); }, []);
    const xs = (rows ?? []).filter(d => (!cat || d.category === cat) && (!site || d.site === site || (site === '-' && !d.site)));
    const groups = [
        ['Late', xs.filter(d => d.due_on && d.days_left < 0)],
        ['Due soon', xs.filter(d => d.due_on && d.days_left >= 0 && d.days_left <= d.remind_days)],
        ['Needs a date', xs.filter(d => !d.due_on && d.kind === 'obligation')],
        ['Coming up', xs.filter(d => d.due_on && d.days_left > d.remind_days && (all || d.days_left <= 365))],
    ];
    const noDate = xs.filter(d => !d.due_on && d.kind !== 'obligation');
    async function openRow(d) {
        if (d.kind === 'obligation') {
            const o = obs.find(x => String(x.id) === d.ref);
            if (o)
                setEdit(o);
            return;
        }
        if (d.kind === 'doc') {
            try {
                const ds = await c.api.docs();
                const x = ds.find(y => String(y.id) === d.ref);
                if (x)
                    setDoc(x);
            }
            catch (e) {
                c.flash(errText(e), true);
            }
            return;
        }
        if (d.kind === 'license')
            c.go('library', 'licenses');
        else if (d.kind === 'customer')
            c.go('library', 'customers');
        else if (d.kind === 'material')
            c.go('ccof', 'materials');
        else if (d.kind === 'fleet')
            c.go('fleet');
    }
    const cats = [...new Set((rows ?? []).map(d => d.category))].sort();
    return _jsxs("div", { className: "list", children: [_jsxs("div", { className: "row between wrap toolbar", children: [_jsx("h2", { children: "Deadlines" }), c.canEdit && _jsx("button", { className: "primary", onClick: () => setEdit({ category: 'other', remind_days: 30, active: true }), children: "+ Deadline" })] }), _jsx("p", { className: "muted", children: "Everything that's due, in one list: recurring deadlines, plus anything with an expiry date (documents, our licenses, material listings, customer licenses)." }), _jsxs("div", { className: "row wrap toolbar", children: [_jsxs("div", { className: "chips", children: [_jsx("button", { className: !cat ? 'on' : '', onClick: () => setCat(null), children: "All" }), cats.map(k => _jsx("button", { className: cat === k ? 'on' : '', onClick: () => setCat(cat === k ? null : k), children: CATEGORY_LABEL[k] ?? k }, k))] }), _jsxs(Select, { value: site ?? '', onChange: e => setSite(e.target.value || null), "aria-label": "Site", children: [_jsx("option", { value: "", children: "All sites" }), _jsx("option", { value: "-", children: "Company" }), SITES.map(s => _jsx("option", { children: s }, s))] })] }), rows == null ? _jsx("p", { className: "muted", children: "Loading\u2026" }) : groups.map(([g, ds]) => ds.length > 0 && _jsxs("div", { className: "dueg", children: [_jsxs("h3", { children: [g, " ", _jsx("span", { className: "muted", children: ds.length })] }), _jsx("div", { className: "clist", children: ds.map(d => _jsxs("button", { className: "crow", onClick: () => openRow(d), children: [_jsxs("span", { className: "grow", children: [_jsxs("span", { className: "kind", children: [KIND_LABEL[d.kind], d.repeat_months ? ` · ${REPEAT.find(r => r.v === d.repeat_months)?.l.toLowerCase() ?? `every ${d.repeat_months} mo`}` : ''] }), _jsx("div", { className: "t", children: d.title }), _jsx("div", { className: "muted small", children: [CATEGORY_LABEL[d.category] ?? d.category, d.site, d.owner_email?.split('@')[0]].filter(Boolean).join(' · ') })] }), _jsxs("span", { className: "nowrap", style: { textAlign: 'right' }, children: [_jsx("div", { children: d.due_on ? fmtD(d.due_on) : '' }), _jsx("span", { className: `pill ${dueTone(d)}`, children: dueText(d) })] })] }, d.kind + d.ref)) })] }, g)), rows != null && !all && xs.some(d => d.due_on && d.days_left > 365) && _jsx("button", { className: "linkbtn", onClick: () => setAll(true), children: "Show everything more than a year out \u203A" }), noDate.length > 0 && _jsxs("div", { className: "dueg", children: [_jsxs("h3", { children: ["Licenses with no expiry date ", _jsx("span", { className: "muted", children: noDate.length })] }), _jsx("div", { className: "clist", children: noDate.map(d => _jsxs("button", { className: "crow", onClick: () => openRow(d), children: [_jsx("span", { className: "grow", children: d.title }), _jsx("span", { className: "pill cp-warn", children: "set a date" })] }, d.kind + d.ref)) })] }), edit && _jsx(ObSheet, { c: c, o: edit, onClose: () => setEdit(null), onDone: o => { setEdit(null); setDone(o); }, onSaved: async () => { setEdit(null); await load(); await c.reload(); } }), done && _jsx(DoneSheet, { c: c, o: done, onClose: () => setDone(null), onSaved: async () => { setDone(null); await load(); await c.reload(); } }), doc && _jsx(DocSheet, { c: c, d: doc, onClose: () => setDoc(null), onChanged: async () => { await load(); await c.reload(); } })] });
}
function ObSheet({ c, o, onClose, onSaved, onDone }) {
    const [x, setX] = useState(o);
    const [busy, setBusy] = useState(false);
    const [log, setLog] = useState([]);
    useEffect(() => { if (o.id)
        c.api.obLog(o.id).then(setLog).catch(() => { }); }, [o.id]);
    const set = (v) => setX(s => ({ ...s, ...v }));
    async function save() { setBusy(true); try {
        await c.api.saveObligation(x);
        c.flash('Saved');
        await onSaved();
    }
    catch (e) {
        c.flash(errText(e), true);
    }
    finally {
        setBusy(false);
    } }
    async function del() {
        if (!confirm('Delete this deadline and its history?'))
            return;
        setBusy(true);
        try {
            await c.api.deleteObligation(o.id);
            c.flash('Deleted');
            await onSaved();
        }
        catch (e) {
            c.flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    const ro = !c.canEdit;
    return _jsxs(Sheet, { title: o.id ? o.title : 'New deadline', onClose: onClose, children: [o.id && c.canEdit && x.active !== false && _jsxs("div", { className: "row", style: { marginBottom: 8 }, children: [_jsx("button", { className: "primary", onClick: () => onDone(o), children: "Mark done" }), _jsx("span", { className: "muted small", children: o.repeat_months ? 'The next due date is set automatically.' : 'One-time: it comes off the list.' })] }), _jsx(F, { label: "What's due", children: _jsx(TextIn, { value: x.title, onChange: v => set({ title: v ?? '' }), autoFocus: !o.id }) }), _jsxs("div", { className: "grid2", children: [_jsx(F, { label: "Due", children: _jsx(DateIn, { value: x.due_on, onChange: v => set({ due_on: v }) }) }), _jsx(F, { label: "Repeats", children: _jsx(Pick, { value: x.repeat_months ?? null, blank: "One time", options: REPEAT, onChange: v => set({ repeat_months: v }) }) }), _jsx(F, { label: "Category", children: _jsx(Pick, { value: x.category ?? 'other', options: Object.entries(CATEGORY_LABEL).map(([v, l]) => ({ v, l })), onChange: v => set({ category: v ?? 'other' }) }) }), _jsx(F, { label: "Site", children: _jsx(Pick, { value: x.site ?? null, blank: "Company (all sites)", options: SITES.map(s => ({ v: s, l: s })), onChange: v => set({ site: v }) }) }), _jsx(F, { label: "Warn", hint: "days ahead", children: _jsx(NumIn, { value: x.remind_days ?? 30, onChange: v => set({ remind_days: v ?? 30 }) }) }), _jsx(F, { label: "Files go under", children: _jsx(Pick, { value: x.doc_type ?? null, blank: "\u2014", options: c.types.map(t => ({ v: t.key, l: t.label })), onChange: v => set({ doc_type: v }) }) })] }), _jsx(F, { label: "Owner", hint: "email", children: _jsx(TextIn, { value: x.owner_email, onChange: v => set({ owner_email: v }), placeholder: "name@lifted-organics.com" }) }), _jsx(F, { label: "Notes", children: _jsx("textarea", { value: x.notes ?? '', onChange: e => set({ notes: e.target.value || null }) }) }), o.id && _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: x.active !== false, onChange: e => set({ active: e.target.checked }) }), " On the list"] }), log.length > 0 && _jsxs(_Fragment, { children: [_jsx("h3", { children: "Done before" }), _jsx("div", { className: "dlist", children: log.map(l => _jsx("div", { className: "drow", children: _jsxs("span", { className: "grow", children: [fmtD(l.done_on), " ", _jsxs("span", { className: "muted", children: ["by ", l.done_by?.split('@')[0], l.due_on ? ` (was due ${fmtD(l.due_on)})` : ''] }), l.note && _jsx("div", { className: "small", children: l.note })] }) }, l.id)) })] }), o.id && _jsx(DocList, { api: c.api, kind: "obligation", refId: o.id, docType: x.doc_type ?? 'reports', flash: c.flash, canAdd: c.canEdit, title: "Files", empty: "Filings, confirmations and receipts for this deadline go here." }), !ro && _jsx(SaveBar, { busy: busy, onSave: save, onCancel: onClose, onDelete: o.id && c.isAdmin ? del : undefined, disabled: !x.title?.trim() })] });
}
function DoneSheet({ c, o, onClose, onSaved }) {
    const [when, setWhen] = useState(today());
    const [note, setNote] = useState(null);
    const [busy, setBusy] = useState(false);
    async function save() {
        setBusy(true);
        try {
            const nxt = await c.api.doneObligation(o.id, when ?? today(), note, null);
            c.flash(nxt ? `Done. Next due ${fmtD(nxt)}` : 'Done');
            await onSaved();
        }
        catch (e) {
            c.flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    return _jsxs(Sheet, { title: `Done: ${o.title}`, onClose: onClose, children: [_jsx("div", { className: "grid2", children: _jsx(F, { label: "Done on", children: _jsx(DateIn, { value: when, onChange: setWhen }) }) }), _jsx(F, { label: "Note", hint: "confirmation #, who you talked to\u2026", children: _jsx(TextIn, { value: note, onChange: setNote }) }), _jsx(DocList, { api: c.api, kind: "obligation", refId: o.id, docType: o.doc_type ?? 'reports', flash: c.flash, title: "Proof (optional)", empty: "Drop the filing or confirmation here." }), _jsx(SaveBar, { busy: busy, onSave: save, onCancel: onClose, saveLabel: "Mark done" })] });
}
