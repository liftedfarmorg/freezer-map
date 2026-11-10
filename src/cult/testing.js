import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { CompApi } from '../comp/api';
import { DocList, DropZone } from '../comp/files';
import { DAY_LONG, fieldName, fmtD, testRows, today } from './calc';
import { DateIn, F, NumIn, Pick, SaveBar, Sheet, TextIn, errText } from './ui';
const stCls = (s) => `tstat t-${s.split(/[\s-]/)[0]}`;
export function TestingTab({ d, c, site, api, flash, onSaved }) {
    const [edit, setEdit] = useState(null);
    const [proto, setProto] = useState(null);
    // results files (Compliance, 055): count per test entry
    const comp = useMemo(() => new CompApi(api.sb), [api]);
    const [files, setFiles] = useState(new Map());
    const loadFiles = () => comp.sb.rpc('test_files', { p_year: d.year }).then(r => {
        const m = new Map();
        for (const x of (r.data ?? []))
            m.set(x.test_id, (m.get(x.test_id) ?? 0) + 1);
        setFiles(m);
    }, () => { });
    useEffect(() => { loadFiles(); }, [d.year]);
    const { area, strain } = testRows(d, c);
    const A = area.filter(r => !site || r.site === site), S = strain.filter(r => !site || r.site === site);
    const now = today();
    // upcoming sampling trips
    const trips = new Map();
    for (const r of [...A, ...S]) {
        if (!r.suggested || r.test?.submitted_on || r.test?.result || ['Results received', 'Harvest started', 'No harvest scheduled'].includes(r.status))
            continue;
        const day = r.suggested < now ? now : r.suggested;
        const t = trips.get(day) ?? trips.set(day, { area: 0, strain: 0 }).get(day);
        t[r.kind]++;
    }
    const urgent = [...A, ...S].filter(r => r.status === 'ORDER NOW' || r.status === 'Window passed - sample ASAP');
    async function setDay(v) {
        try {
            await api.setSetting('cult.sample_weekday', String(v));
            await onSaved(`Sampling day: ${DAY_LONG[v]}`);
        }
        catch (e) {
            flash(errText(e), true);
        }
    }
    const row = (r) => (_jsxs("tr", { className: "tap", onClick: () => setEdit(r), children: [_jsxs("td", { children: [_jsxs("span", { className: "fpill", children: [r.site, " ", fieldName(c, r.field_id)] }), r.kind === 'strain' && _jsx("div", { children: r.strain })] }), r.kind === 'area' && _jsx("td", { className: "small", children: r.composite }), _jsx("td", { className: "nowrap", children: fmtD(r.first, true) }), _jsxs("td", { className: "nowrap hide-s", children: [fmtD(r.opens), " \u2013 ", fmtD(r.closes)] }), _jsx("td", { className: "nowrap", children: _jsx("b", { children: fmtD(r.suggested, true) }) }), _jsx("td", { children: _jsx("span", { className: stCls(r.status), children: r.status }) }), _jsxs("td", { className: "small hide-s", children: [r.test?.lab ?? '', r.test?.test_ref ? _jsx("div", { className: "muted", children: r.test.test_ref }) : null] }), _jsxs("td", { className: "nowrap small", children: [r.test?.submitted_on ? `sent ${fmtD(r.test.submitted_on)}` : '', r.test?.results_on ? _jsxs("div", { children: ["back ", fmtD(r.test.results_on)] }) : null] }), _jsxs("td", { children: [_jsx("b", { className: /fail/i.test(r.test?.result ?? '') ? 'neg' : /pass/i.test(r.test?.result ?? '') ? 'pos' : '', children: r.test?.result ?? '' }), r.test?.id && files.get(r.test.id) ? _jsxs("span", { className: "pill cp-ok", title: "Results file attached", style: { marginLeft: 4 }, children: ["PDF", files.get(r.test.id) > 1 ? ` ×${files.get(r.test.id)}` : ''] })
                        : r.test?.results_on ? _jsx("span", { className: "pill cp-warn", title: "No results file yet", style: { marginLeft: 4 }, children: "no file" }) : null] })] }, r.key));
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "row toolbar", children: [_jsx("span", { className: "muted", children: "Sampling day" }), _jsx(Pick, { value: d.settings.sampleWeekday, onChange: v => v && setDay(v), options: [1, 2, 3, 4, 5, 6, 7].map(i => ({ v: i, l: DAY_LONG[i] })) }), _jsxs("span", { className: "muted", children: ["Suggested sample date = the last ", DAY_LONG[d.settings.sampleWeekday], " inside each window, so everything due that week goes on one trip."] })] }), urgent.length > 0 && _jsxs("div", { className: "warnbox", children: [urgent.length, " test", urgent.length === 1 ? '' : 's', " to sample now: ", urgent.map(r => r.kind === 'area' ? `${r.site} ${fieldName(c, r.field_id)}` : `${r.strain} (${r.site} ${fieldName(c, r.field_id)})`).join(', ')] }), _jsx("div", { className: "cwrap tight", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Protocol" }), _jsx("th", { children: "Per" }), _jsx("th", { className: "num", children: "Window" }), _jsx("th", { children: "Tests to order" })] }) }), _jsx("tbody", { children: [...d.protocols].sort((a, b) => a.kind.localeCompare(b.kind)).map(p => (_jsxs("tr", { className: "tap", onClick: () => setProto(p), children: [_jsx("td", { children: _jsx("b", { children: p.label }) }), _jsxs("td", { children: [p.per, " \u00B7 ", p.sample] }), _jsxs("td", { className: "num", children: [p.opens_days, "\u2013", p.closes_days, " days before"] }), _jsx("td", { className: "small", children: p.tests })] }, p.kind))) })] }) }), trips.size > 0 && _jsxs(_Fragment, { children: [_jsx("h3", { className: "csec", children: "Sampling trips coming up" }), _jsx("div", { className: "cwrap tight", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Day" }), _jsx("th", { className: "num", children: "Area composites" }), _jsx("th", { className: "num", children: "Dry flower strains" }), _jsx("th", { className: "num", children: "Total samples" })] }) }), _jsx("tbody", { children: [...trips.entries()].sort().map(([day, t]) => _jsxs("tr", { children: [_jsxs("td", { children: [fmtD(day, true), day === now ? ' (today)' : ''] }), _jsx("td", { className: "num", children: t.area }), _jsx("td", { className: "num", children: t.strain }), _jsx("td", { className: "num", children: _jsx("b", { children: t.area + t.strain }) })] }, day)) })] }) })] }), _jsxs("h3", { className: "csec", children: ["A. Area composites ", _jsx("span", { className: "muted", children: "one per field, timed off its first harvest (fresh frozen or biomass)" })] }), _jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Field" }), _jsx("th", { children: "Type" }), _jsx("th", { children: "First harvest" }), _jsx("th", { className: "hide-s", children: "Window" }), _jsx("th", { children: "Sample on" }), _jsx("th", { children: "Status" }), _jsx("th", { className: "hide-s", children: "Lab" }), _jsx("th", { children: "Sent / back" }), _jsx("th", { children: "Result" })] }) }), _jsx("tbody", { children: A.length ? A.map(row) : _jsx("tr", { children: _jsx("td", { colSpan: 9, className: "muted", children: "No fields with harvests yet." }) }) })] }) }), _jsxs("h3", { className: "csec", children: ["B. Dry flower strain tests ", _jsx("span", { className: "muted", children: "one per dry harvest" })] }), _jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Strain" }), _jsx("th", { children: "Dry harvest" }), _jsx("th", { className: "hide-s", children: "Window" }), _jsx("th", { children: "Sample on" }), _jsx("th", { children: "Status" }), _jsx("th", { className: "hide-s", children: "Lab" }), _jsx("th", { children: "Sent / back" }), _jsx("th", { children: "Result" })] }) }), _jsx("tbody", { children: S.length ? S.map(row) : _jsx("tr", { children: _jsx("td", { colSpan: 8, className: "muted", children: "No dry harvests on the schedule." }) }) })] }) }), _jsx("p", { className: "cnote", children: "Test entries are tied to the field or the harvest, so they stay put when the schedule changes. All samples are dried by the lab; composites also get a micro extraction." }), edit && _jsx(TestSheet, { d: d, r: edit, api: api, comp: comp, flash: flash, onClose: () => { setEdit(null); loadFiles(); }, onSaved: async (m) => { setEdit(null); loadFiles(); await onSaved(m); } }), proto && _jsx(ProtoSheet, { p: proto, api: api, flash: flash, onClose: () => setProto(null), onSaved: async (m) => { setProto(null); await onSaved(m); } })] }));
}
function TestSheet({ d, r, api, comp, flash, onClose, onSaved }) {
    const [t, setT] = useState(r.test ?? { crop_year: d.year, site: r.site, kind: r.kind, field_id: r.kind === 'area' ? r.field_id : null, harvest_id: r.harvest?.id ?? null, lab: d.settings.labs[0] ?? null });
    const [busy, setBusy] = useState(false);
    const set = (x) => setT(v => ({ ...v, ...x }));
    async function save() {
        setBusy(true);
        try {
            await api.save('cult_tests', t);
            await onSaved('Test saved');
        }
        catch (e) {
            flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    // drop results before the entry exists: save it first, then attach
    async function firstFiles(fs) {
        setBusy(true);
        try {
            const row = await api.save('cult_tests', t);
            setT(row);
            for (const f of fs) {
                const path = await comp.upload(f, 'testing');
                await comp.addDoc({ doc_type: 'testing', title: `${r.ref} pre-harvest results`, file_path: path, file_name: f.name, mime: f.type || null, size_bytes: f.size,
                    site: r.site, crop_year: d.year, links: [{ kind: 'test', id: String(row.id) }] });
            }
            flash('Results attached');
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
            await api.remove('cult_tests', t.id);
            await onSaved('Test entries cleared');
        }
        catch (e) {
            flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs(Sheet, { title: r.ref, sub: _jsxs(_Fragment, { children: ["First harvest ", fmtD(r.first, true), " \u00B7 window ", fmtD(r.opens), " \u2013 ", fmtD(r.closes), " \u00B7 sample ", fmtD(r.suggested, true)] }), onClose: onClose, children: [_jsxs("p", { className: "muted", children: ["Tests: ", r.protocol?.tests] }), _jsxs("div", { className: "grid2", children: [_jsx(F, { label: "Lab", children: _jsx(TextIn, { value: t.lab, list: "cult-labs", onChange: v => set({ lab: v }) }) }), _jsx(F, { label: "Test ID / COC #", children: _jsx(TextIn, { value: t.test_ref, onChange: v => set({ test_ref: v }), placeholder: r.ref }) }), _jsx(F, { label: "Sampled on", children: _jsx(DateIn, { value: t.sampled_on, onChange: v => set({ sampled_on: v }) }) }), _jsx(F, { label: "Submitted", children: _jsx(DateIn, { value: t.submitted_on, onChange: v => set({ submitted_on: v }) }) }), _jsx(F, { label: "Results received", children: _jsx(DateIn, { value: t.results_on, onChange: v => set({ results_on: v }) }) }), _jsx(F, { label: "Result", children: _jsx(TextIn, { value: t.result, list: "cult-results", onChange: v => set({ result: v }), placeholder: "Pass / Fail" }) })] }), _jsxs("div", { className: "grid3", children: [_jsx(F, { label: "Total THC", hint: "%", children: _jsx(NumIn, { value: t.total_thc ?? null, onChange: v => set({ total_thc: v }) }) }), _jsx(F, { label: "Total cannabinoids", hint: "%", children: _jsx(NumIn, { value: t.total_cannabinoids ?? null, onChange: v => set({ total_cannabinoids: v }) }) }), _jsx(F, { label: "Moisture", hint: "%", children: _jsx(NumIn, { value: t.moisture ?? null, onChange: v => set({ moisture: v }) }) })] }), t.id ? _jsx(DocList, { api: comp, kind: "test", refId: t.id, docType: "testing", flash: flash, title: "Results (PDF)", defaults: { site: r.site, crop_year: d.year, title: `${r.ref} pre-harvest results` }, empty: "Drop the lab's results PDF here. It shows on every package from this harvest." })
                : _jsxs(_Fragment, { children: [_jsx("div", { className: "cdl-h", children: "Results (PDF)" }), _jsx(DropZone, { compact: true, disabled: busy, onFiles: firstFiles, label: "drop the lab's results PDF (saves this entry)" })] }), _jsx("datalist", { id: "cult-labs", children: d.settings.labs.map(l => _jsx("option", { value: l }, l)) }), _jsxs("datalist", { id: "cult-results", children: [_jsx("option", { value: "Pass" }), _jsx("option", { value: "Fail" }), _jsx("option", { value: "Retest" })] }), _jsx(F, { label: "Notes", children: _jsx("textarea", { value: t.notes ?? '', onChange: e => set({ notes: e.target.value || null }) }) }), _jsx(SaveBar, { busy: busy, onSave: save, onCancel: onClose, onDelete: t.id ? del : undefined })] }));
}
function ProtoSheet({ p, api, flash, onClose, onSaved }) {
    const [x, setX] = useState(p);
    const [busy, setBusy] = useState(false);
    async function save() {
        setBusy(true);
        try {
            await api.save('cult_test_protocols', x);
            await onSaved('Protocol saved');
        }
        catch (e) {
            flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs(Sheet, { title: `${p.label} testing`, onClose: onClose, children: [_jsxs("div", { className: "grid2", children: [_jsx(F, { label: "Window opens", hint: "days before", children: _jsx(NumIn, { value: x.opens_days, onChange: v => setX({ ...x, opens_days: v ?? 0 }) }) }), _jsx(F, { label: "Window closes", hint: "days before", children: _jsx(NumIn, { value: x.closes_days, onChange: v => setX({ ...x, closes_days: v ?? 0 }) }) })] }), _jsx(F, { label: "Tests to order", children: _jsx("textarea", { value: x.tests, onChange: e => setX({ ...x, tests: e.target.value }) }) }), _jsx(SaveBar, { busy: busy, onSave: save, onCancel: onClose })] }));
}
