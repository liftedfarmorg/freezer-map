import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { tagTxt } from '../mtag';
import { Select } from '../combo';
import { useEffect, useMemo, useState } from 'react';
import { DocList, DropZone, fmtD, today } from './files';
import { LiveReconcile } from './reconlive';
import { NurseryReconcile } from './nurseryrecon';
import { FarmReconcile } from './farmrecon';
import { Mapping } from './mapping';
import { FIELD_LABEL, download, mapColumns, readTable, toCsv, toRows } from './csv';
import { DateIn, F, Pick, SaveBar, Sheet, TextIn, errText, useSel, SelBox, SelAll, SelBar } from '../cult/ui';
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const short = (t) => (t ? (t.length > 10 ? tagTxt(t, 8) : t) : '');
const n2 = (x) => (x == null ? '' : (Math.round(Number(x) * 100) / 100).toLocaleString());
const PS = { checked: ['Dry run OK', 'cp-ok'], sending: ['Sending…', 'cp-warn'], sent: ['Sent by the app', 'cp-ok'], failed: ['Send failed', 'cp-bad'], waiting: ['Waiting', 'cp-mute'], held: ['Held', 'cp-warn'] };
const ST = { todo: ['To do', 'cp-warn'], done: ['Done', 'cp-ok'], error: ['Problem', 'cp-bad'], skipped: ['Skipped', 'cp-mute'] };
export function Metrc({ c }) {
    const view = ['todo', 'reconcile', 'mapping', 'errors', 'playbook'].find(v => v === c.sub) ?? 'todo';
    return _jsxs("div", { className: "list", children: [_jsxs("div", { className: "row between wrap toolbar", children: [_jsx("h2", { children: "METRC" }), _jsx("div", { className: "seg", children: [['todo', `To do${c.ov.metrc_todo ? ` (${c.ov.metrc_todo})` : ''}`], ['reconcile', 'Reconcile'], ['mapping', 'Mapping'], ['errors', `Errors${c.ov.errors_open ? ` (${c.ov.errors_open})` : ''}`], ['playbook', 'Playbook']].map(([k, l]) => _jsx("button", { className: view === k ? 'on' : '', onClick: () => c.go('metrc', k), children: l }, k)) })] }), view === 'todo' && _jsx(Todo, { c: c }), view === 'reconcile' && _jsx(Reconcile, { c: c }), view === 'mapping' && _jsx(Mapping, { c: c }), view === 'errors' && _jsx(Errors, { c: c }), view === 'playbook' && _jsx(Playbook, { c: c })] });
}
// progress bar on each to-do line
//   plants (harvest, planting, flip): how many plants are in METRC so far
//   waste / finish with a wait: time until it can go
//   everything else: queued, sending, waiting on an earlier to-do, failed, sent
const STEPPED = new Set(['harvest_plants', 'planting', 'flower']);
const STOPPABLE = new Set(['harvest_plants', 'flower']); // long sends that can stop between batches
const n0b = (x) => Math.round(x).toLocaleString();
function MetrcBar({ r, now }) {
    if (r.status === 'skipped')
        return null;
    const prog = r.push_response?.progress;
    const total = Number(r.details?.plants ?? 0);
    const done = r.status === 'done' || r.push_state === 'sent';
    const err = r.status === 'error' || r.push_state === 'failed';
    const sending = r.push_state === 'sending';
    const blocked = r.push_state === 'waiting' && /earlier to-do/i.test(r.push_error ?? '');
    let pct = 0, cls = '', left = '', right = '';
    if (r.kind && STEPPED.has(r.kind) && total > 0) {
        const d = done ? total : Math.min(Number(prog?.done ?? 0), total);
        pct = (d / total) * 100;
        left = `${n0b(d)} of ${n0b(total)} plants${r.push_state === 'held' ? ' · held' : sending && r.stop_requested ? ' · stopping after this batch' : ''}`;
        right = `${Math.floor(pct)}%`;
    }
    else if (done) {
        pct = 100;
        left = 'In METRC';
    }
    else if (r.due_at && new Date(r.due_at).getTime() > now) {
        const a = new Date(r.at).getTime(), b = new Date(r.due_at).getTime();
        pct = Math.max(0, Math.min(100, ((now - a) / Math.max(1, b - a)) * 100));
        cls = 'due';
        const m = Math.max(1, Math.ceil((b - now) / 60000));
        left = 'Waiting to send';
        right = m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m left` : `${m}m left`;
    }
    else if (r.push_state === 'held') {
        pct = 100;
        cls = 'wait';
        left = 'Held: press Release to send';
    }
    else if (sending) {
        pct = 100;
        cls = 'wait';
        left = r.stop_requested ? 'Stopping after this batch…' : 'Sending to METRC…';
    }
    else if (err) {
        pct = 100;
        cls = 'bad';
        left = 'Stopped';
    }
    else if (blocked) {
        pct = 100;
        cls = 'wait';
        left = 'Waiting on an earlier to-do';
    }
    else if (r.push_state === 'waiting') {
        pct = 0;
        left = 'Next run';
    }
    else
        left = 'Queued';
    if (STEPPED.has(r.kind ?? '') && total > 0) {
        if (done)
            cls = '';
        else if (sending && !r.stop_requested)
            cls = 'go';
        else if (sending || r.push_state === 'held')
            cls = 'wait';
        else if (err)
            cls = 'bad';
        else if (blocked)
            cls = 'wait';
    }
    return _jsxs("div", { className: `mbar ${cls}`, role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(pct), "aria-label": left, children: [_jsx("div", { className: "mbar-track", children: _jsx("div", { className: "mbar-fill", style: { width: `${pct}%` } }) }), _jsxs("div", { className: "mbar-label", children: [_jsx("span", { children: left }), _jsx("span", { children: right })] })] });
}
// ---------- to do: every app action METRC needs ----------
function Todo({ c }) {
    const [status, setStatus] = useState('todo');
    const [lic, setLic] = useState(null);
    const [rows, setRows] = useState(null);
    const [busy, setBusy] = useState(false);
    const [kinds, setKinds] = useState({});
    const [live, setLive] = useState(false);
    const sel = useSel();
    const load = async () => { try {
        setRows(await c.api.actions(status));
    }
    catch (e) {
        c.flash(errText(e), true);
        setRows([]);
    } };
    useEffect(() => { load(); sel.stop(); }, [status]);
    // while anything is on its way to METRC, refresh every 5 seconds so the bars move
    const [now, setNow] = useState(Date.now());
    const moving = (rows ?? []).some(r => (r.status === 'todo' || r.status === 'error') && (r.push_state === 'sending' || r.push_state === 'waiting'));
    useEffect(() => {
        const t = setInterval(() => { setNow(Date.now()); if (moving && !document.hidden)
            load(); }, moving ? 5000 : 60000);
        return () => clearInterval(t);
    }, [moving, status]);
    useEffect(() => {
        c.api.pushKinds().then(k => setKinds(Object.fromEntries(k.map(x => [x.kind, x])))).catch(() => { });
        c.api.sb.from('app_settings').select('value').eq('key', 'comp.metrc_live').maybeSingle().then(r => setLive(r.data?.value === 'true'));
    }, []);
    const sendable = (r) => (r.status === 'todo' || r.status === 'error') && r.push_state !== 'sending' && r.push_state !== 'held' && !!r.kind && !!kinds[r.kind]?.ready && kinds[r.kind]?.mode !== 'off';
    async function push(ids) {
        const go = ids.filter(id => { const r = rows?.find(x => x.id === id); return r && sendable(r); });
        if (!go.length) {
            c.flash('None of those can be sent by the app (turn the kind on in Settings > METRC through T3)', true);
            return;
        }
        if (live && !confirm(`Send ${go.length} to METRC for real?`))
            return;
        setBusy(true);
        try {
            const r = await c.api.sendMetrc(go);
            const n = (s) => r.results.filter(x => x.state === s).length;
            const first = r.results.find(x => x.state === 'failed');
            const held = (r.not_sent?.length ? `. ${r.not_sent.length} not sent (kind off, or before the site's METRC cutover date)` : '')
                + (r.out_of_time?.length ? `. ${r.out_of_time.length} not reached yet: Auto ones go on the next run; send the others again` : '');
            c.flash((r.live ? `${n('sent')} sent, ${n('failed')} failed${n('waiting') ? `, ${n('waiting')} waiting` : ''}${first ? `: ${first.error}` : ''}`
                : `Dry run: ${n('checked')} OK, ${n('failed')} failed${n('waiting') ? `, ${n('waiting')} waiting` : ''}${first ? `: ${first.error}` : ''}`) + held, n('failed') > 0);
            sel.stop();
            await load();
            await c.reload();
        }
        catch (e) {
            c.flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    const shown = (rows ?? []).filter(r => !lic || r.license === lic);
    const lics = [...new Set((rows ?? []).map(r => r.license ?? ''))].sort();
    async function setTo(s, ids) {
        let note;
        if (s === 'error') {
            note = prompt('What went wrong? (optional)') ?? undefined;
        }
        setBusy(true);
        try {
            const n = await c.api.setActions(ids, s, note);
            c.flash(`${n} marked ${ST[s][0].toLowerCase()}`);
            sel.stop();
            await load();
            await c.reload();
        }
        catch (e) {
            c.flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    // one Stop button; what it does depends on where the to-do is (see metrc_stop)
    const stoppable = (r) => (r.status === 'todo' || r.status === 'error') && !!r.kind && r.push_state !== 'held' && !r.stop_requested
        && (r.push_state !== 'sending' || STOPPABLE.has(r.kind));
    async function stop(r) {
        const reopen = r.kind === 'harvest_waste' || r.kind === 'harvest_finish';
        const ask = reopen ? `Stop the waste and finish for ${String(r.details?.batch ?? 'this harvest')} and reopen the harvest in the app?\n\nFix it, then press Finish again (that starts a new wait).`
            : r.push_state === 'sending' ? 'Stop after the batch it is on? What is already in METRC stays. Release carries on from there.'
                : 'Hold this one? It won\'t go to METRC (and nothing that depends on it will) until you press Release.';
        if (!confirm(ask))
            return;
        setBusy(true);
        try {
            const res = await c.api.stopMetrc(r.id);
            c.flash(res.startsWith('reopened') ? `Harvest reopened; its waste and finish are cancelled${res.length > 9 ? `. ${res.slice(10)}` : ''}`
                : res === 'stopping' ? 'Stopping after the batch it is on' : 'Held', res.length > 9);
            await load();
            await c.reload();
        }
        catch (e) {
            c.flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    async function release(r) {
        setBusy(true);
        try {
            await c.api.releaseMetrc(r.id);
            c.flash(kinds[r.kind ?? '']?.mode === 'auto' ? 'Released: goes on the next run' : 'Released: press Send when ready');
            await load();
        }
        catch (e) {
            c.flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    const exportCsv = () => download(`METRC to do ${today()}.csv`, toCsv(['#', 'When', 'License', 'Action', 'Package', 'Tag', 'Lbs', 'Details', 'Status', 'Note'], shown.map(r => [r.id, when(r.at), r.license, r.action, r.code, r.tag, r.lbs, r.summary, ST[r.status][0], r.note])));
    const ids = shown.map(r => r.id);
    return _jsxs(_Fragment, { children: [_jsx("p", { className: "muted", children: "Everything done in the app that also has to be done in METRC (new packages, splits, combines, weight changes, runs, transfers), from when Compliance was switched on. Check them off once they're in METRC." }), _jsxs("div", { className: "row wrap toolbar", children: [_jsx("div", { className: "chips", children: [['todo', 'To do'], ['error', 'Problem'], ['done', 'Done'], ['skipped', 'Skipped'], [null, 'All']].map(([k, l]) => _jsx("button", { className: status === k ? 'on' : '', onClick: () => setStatus(k), children: l }, l)) }), _jsxs(Select, { value: lic ?? '', onChange: e => setLic(e.target.value || null), "aria-label": "License", children: [_jsx("option", { value: "", children: "All licenses" }), lics.map(l => _jsx("option", { value: l, children: l || 'no license' }, l))] }), _jsx("button", { className: "ghost small", disabled: !shown.length, onClick: exportCsv, children: "Export CSV" }), c.canEdit && shown.length > 0 && (sel.on ? _jsx("button", { className: "ghost small", onClick: sel.stop, children: "Done selecting" }) : _jsx("button", { className: "ghost small", onClick: sel.start, children: "Select" }))] }), _jsx(SelBar, { sel: sel, noun: "action", actions: [
                    { label: live ? 'Send to METRC' : 'Dry run check', run: ids => push(ids) },
                    { label: 'Done in METRC', run: ids => setTo('done', ids) }, { label: 'Problem', run: ids => setTo('error', ids) }, { label: 'Skip', run: ids => setTo('skipped', ids) },
                    ...(status !== 'todo' ? [{ label: 'Back to to do', run: (ids) => setTo('todo', ids) }] : [])
                ] }), rows == null ? _jsx("p", { className: "muted", children: "Loading\u2026" }) : !shown.length ? _jsx("p", { className: "muted", children: status === 'todo' ? 'Nothing waiting. Everything is checked off.' : 'Nothing here.' })
                : _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "ct", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx(SelAll, { sel: sel, ids: ids }), _jsx("th", { className: "num", children: "#" }), _jsx("th", { children: "When" }), _jsx("th", { children: "Action" }), _jsx("th", { children: "Package" }), _jsx("th", { className: "hide-s", children: "Tag" }), _jsx("th", { className: "num", children: "Lbs" }), _jsx("th", { className: "hide-s", children: "License" }), _jsx("th", { children: "Status" }), c.canEdit && !sel.on && _jsx("th", {})] }) }), _jsx("tbody", { children: shown.map(r => _jsxs("tr", { onClick: () => sel.on && sel.toggle(r.id), className: sel.on ? 'tap' : '', children: [_jsx(SelBox, { sel: sel, id: r.id }), _jsx("td", { className: "num mono small", children: r.id }), _jsxs("td", { className: "nowrap small", children: [when(r.at), _jsx("div", { className: "muted", children: r.details?.by?.split('@')[0] ?? '' })] }), _jsxs("td", { children: [_jsx("b", { children: r.action }), r.due_at && r.status === 'todo' && _jsxs("div", { className: `small ${new Date(r.due_at) < new Date() ? 'neg' : 'muted'}`, children: [new Date(r.due_at) > new Date() ? 'Not before' : 'Due', " ", when(r.due_at)] }), r.summary && _jsx("div", { className: "muted small", children: r.summary }), r.note && _jsx("div", { className: `small ${r.push_state === 'sent' ? 'muted' : 'neg'}`, children: r.note }), r.push_state && _jsxs("div", { className: "small", style: { marginTop: 2 }, children: [_jsx("span", { className: `pill ${PS[r.push_state][1]}`, children: PS[r.push_state][0] }), r.push_state !== 'sent' && r.push_error && _jsxs("span", { className: r.push_state === 'failed' ? 'neg' : 'muted', children: [" ", r.push_error] }), r.push_at && _jsxs("span", { className: "muted", children: [" ", when(r.push_at)] })] }), _jsx(MetrcBar, { r: r, now: now })] }), _jsx("td", { children: r.code ?? '' }), _jsx("td", { className: "mono small hide-s", title: r.tag ?? '', children: short(r.tag) }), _jsx("td", { className: "num", children: n2(r.lbs) }), _jsx("td", { className: "mono small hide-s", children: r.license ?? '' }), _jsxs("td", { children: [_jsx("span", { className: `pill ${ST[r.status][1]}`, children: ST[r.status][0] }), r.done_by && _jsx("div", { className: "muted small", children: r.done_by.split('@')[0] })] }), c.canEdit && !sel.on && _jsxs("td", { className: "nowrap", children: [sendable(r) && _jsx("button", { className: live ? 'primary small' : 'ghost small', disabled: busy, onClick: e => { e.stopPropagation(); push([r.id]); }, children: live ? 'Send' : 'Check' }), r.push_state === 'held' && (r.status === 'todo' || r.status === 'error') && _jsx("button", { className: "primary small", disabled: busy, onClick: e => { e.stopPropagation(); release(r); }, children: "Release" }), stoppable(r) && _jsx("button", { className: "ghost small danger", disabled: busy, onClick: e => { e.stopPropagation(); stop(r); }, children: "Stop" }), r.status === 'todo' ? _jsx("button", { className: "ghost small", disabled: busy, onClick: e => { e.stopPropagation(); setTo('done', [r.id]); }, children: "Done" })
                                                    : _jsx("button", { className: "ghost small", disabled: busy, onClick: e => { e.stopPropagation(); setTo('todo', [r.id]); }, children: "Undo" })] })] }, r.id)) })] }) }), _jsxs("p", { className: "muted small", style: { marginTop: 8 }, children: [live ? 'Send' : 'Check', " goes through T3 for kinds switched on in Settings \u203A METRC through T3", live ? '' : ' (Dry run: checked with METRC, nothing changes)', ". Everything else is still done by hand in METRC and checked off here."] })] });
}
// ---------- reconcile: METRC Active Packages export vs the app ----------
const ISSUE = {
    not_in_app: ['In METRC, not in the app', 'Active in METRC but no package in the app has this tag. Add it in the app, or finish it in METRC if it\'s gone.'],
    closed_in_app: ['Closed in the app, still active in METRC', 'Shipped, used up or combined in the app. Finish or adjust it in METRC.'],
    not_in_metrc: ['In the app, missing from this METRC export', 'In a freezer under this license in the app but not in the export. Check the tag, or the package may be under another license in METRC.'],
    other_license: ['Different license', 'METRC has it under this license, the app has it in a freezer under another one. A transfer may be missing.'],
    weight: ['Weight doesn\'t match', 'More than the allowed difference between the app and METRC.'],
    item: ['Item doesn\'t match', 'The app\'s item (SKU) name differs from the METRC item.'],
    on_hold: ['On hold or failed lab test in METRC', ''],
    tag_pending: ['No tag yet in the app', 'Live packages under this license with the METRC tag still pending.'],
    stale: ['Hasn\'t moved in a while', 'Nothing has happened to these in the app for a long time. Worth a look.'],
};
const ORDER = ['closed_in_app', 'not_in_app', 'not_in_metrc', 'other_license', 'weight', 'item', 'on_hold', 'tag_pending', 'stale'];
function Reconcile({ c }) {
    const [mode, setMode] = useState('live');
    return _jsxs(_Fragment, { children: [_jsx("div", { className: "chips", style: { marginBottom: 8 }, children: [['live', 'From METRC (live)'], ['farm', 'Farm plants'], ['nursery', 'Nursery (1PN)'], ['file', 'Upload an export']].map(([k, l]) => _jsx("button", { className: mode === k ? 'on' : '', onClick: () => setMode(k), children: l }, k)) }), mode === 'live' ? _jsx(LiveReconcile, { c: c }) : mode === 'farm' ? _jsx(FarmReconcile, { c: c }) : mode === 'nursery' ? _jsx(NurseryReconcile, { c: c }) : _jsx(UploadReconcile, { c: c })] });
}
function UploadReconcile({ c }) {
    const [ups, setUps] = useState([]);
    const [lic, setLic] = useState(c.ov.licenses[0] ?? null);
    const [parsed, setParsed] = useState(null);
    const [cur, setCur] = useState(null);
    const [res, setRes] = useState(null);
    const [busy, setBusy] = useState(false);
    const loadUps = async () => { try {
        const u = await c.api.uploads();
        setUps(u);
        return u;
    }
    catch (e) {
        c.flash(errText(e), true);
        return [];
    } };
    useEffect(() => { loadUps(); }, []);
    useEffect(() => { if (!cur) {
        setRes(null);
        return;
    } setRes(null); c.api.reconcile(cur.id).then(setRes).catch(e => c.flash(errText(e), true)); }, [cur?.id]);
    async function read(fs) {
        const f = fs[0];
        try {
            const t = await readTable(f);
            const m = mapColumns(t);
            if (!m) {
                c.flash('Couldn\'t find a Tag column. Use METRC › Packages › Active › export (CSV or Excel).', true);
                return;
            }
            const rows = toRows(t, m);
            if (!rows.length) {
                c.flash('No package tags found in that file', true);
                return;
            }
            setParsed({ file: f.name, rows, cols: m.cols });
            const guess = c.ov.licenses.find(l => f.name.toUpperCase().includes(l.toUpperCase()));
            if (guess)
                setLic(guess);
        }
        catch (e) {
            c.flash(errText(e), true);
        }
    }
    async function compare() {
        if (!parsed || !lic)
            return;
        setBusy(true);
        try {
            const id = await c.api.uploadMetrc(lic, parsed.file, parsed.rows);
            const u = await loadUps();
            setCur(u.find(x => x.id === id) ?? null);
            setParsed(null);
            await c.reload();
        }
        catch (e) {
            c.flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    const by = useMemo(() => { const m = new Map(); for (const r of res ?? [])
        m.set(r.issue, [...(m.get(r.issue) ?? []), r]); return m; }, [res]);
    const exportCsv = () => cur && download(`Reconcile ${cur.license} ${cur.uploaded_at.slice(0, 10)}.csv`, toCsv(['Issue', 'Tag', 'Package', 'Strain', 'App lbs', 'METRC lbs', 'App item', 'METRC item', 'App license', 'Note'], (res ?? []).map(r => [ISSUE[r.issue][0], r.tag, r.code, r.strain, r.app_lbs, r.metrc_lbs, r.app_item, r.metrc_item, r.app_license, r.note])));
    return _jsxs(_Fragment, { children: [_jsxs("p", { className: "muted", children: ["In METRC, open Packages \u203A Active for one license and export it (CSV or Excel). Drop the file here and the app compares every package: tags, weights, items and licenses. Weight tolerance ", c.ov.weight_tol ?? 1, " lb."] }), c.canEdit && _jsxs("div", { className: "row wrap", style: { gap: 10, alignItems: 'flex-end' }, children: [_jsx(F, { label: "License", children: _jsx(Pick, { value: lic, options: c.ov.licenses.map(l => ({ v: l, l })), onChange: setLic }) }), _jsx("div", { style: { flex: 1, minWidth: 260 }, children: _jsx(DropZone, { onFiles: read, accept: ".csv,.xlsx,.txt", label: "Drop the METRC Active Packages export" }) })] }), parsed && _jsxs("div", { className: "infobox", style: { marginTop: 10 }, children: [_jsx("b", { children: parsed.file }), ": ", parsed.rows.length, " packages. Columns found: ", Object.keys(parsed.cols).map(k => FIELD_LABEL[k]).join(', '), ".", parsed.cols.qty == null && _jsx("div", { className: "warn-t", children: "No Quantity column, so weights won't be compared." }), _jsxs("div", { className: "row", style: { marginTop: 6 }, children: [_jsxs("button", { className: "primary", disabled: busy || !lic, onClick: compare, children: ["Compare with the app (", lic, ")"] }), _jsx("button", { className: "ghost", onClick: () => setParsed(null), children: "Cancel" })] })] }), ups.length > 0 && _jsxs("div", { className: "row wrap toolbar", style: { marginTop: 12 }, children: [_jsx("span", { className: "muted", children: "Uploads" }), _jsxs(Select, { value: cur?.id ?? '', onChange: e => setCur(ups.find(u => u.id === Number(e.target.value)) ?? null), children: [_jsx("option", { value: "", children: "Pick one\u2026" }), ups.map(u => _jsxs("option", { value: u.id, children: [u.license, " \u00B7 ", when(u.uploaded_at), " \u00B7 ", u.rows, " pkgs \u00B7 ", u.uploaded_by?.split('@')[0]] }, u.id))] }), cur && res && _jsx("button", { className: "ghost small", onClick: exportCsv, children: "Export CSV" })] }), cur && (res == null ? _jsx("p", { className: "muted", children: "Comparing\u2026" }) : !res.length ? _jsxs("div", { className: "infobox", style: { marginTop: 10 }, children: ["Everything matches for ", cur.license, "."] })
                : ORDER.filter(k => by.get(k)?.length).map(k => _jsxs("div", { className: "dueg", children: [_jsxs("h3", { children: [ISSUE[k][0], " ", _jsx("span", { className: "muted", children: by.get(k).length })] }), ISSUE[k][1] && _jsx("p", { className: "muted small", children: ISSUE[k][1] }), _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "ct", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Tag" }), _jsx("th", { children: "Package" }), _jsx("th", { className: "hide-s", children: "Strain" }), (k === 'weight' || k === 'not_in_app' || k === 'closed_in_app' || k === 'other_license') && _jsxs(_Fragment, { children: [_jsx("th", { className: "num", children: "App lbs" }), _jsx("th", { className: "num", children: "METRC lbs" })] }), k === 'item' && _jsxs(_Fragment, { children: [_jsx("th", { children: "App item" }), _jsx("th", { children: "METRC item" })] }), _jsx("th", { children: "Note" })] }) }), _jsx("tbody", { children: by.get(k).slice(0, 300).map((r, i) => _jsxs("tr", { children: [_jsx("td", { className: "mono small", title: r.tag ?? '', children: short(r.tag) }), _jsx("td", { children: r.code ?? '' }), _jsx("td", { className: "hide-s", children: r.strain ?? '' }), (k === 'weight' || k === 'not_in_app' || k === 'closed_in_app' || k === 'other_license') && _jsxs(_Fragment, { children: [_jsx("td", { className: "num", children: n2(r.app_lbs) }), _jsx("td", { className: "num", children: n2(r.metrc_lbs) })] }), k === 'item' && _jsxs(_Fragment, { children: [_jsx("td", { className: "small", children: r.app_item }), _jsx("td", { className: "small", children: r.metrc_item })] }), _jsx("td", { className: "small", children: [r.note, r.app_license && k === 'other_license' ? `App: ${r.app_license}` : null].filter(Boolean).join(' · ') })] }, i)) })] }) }), by.get(k).length > 300 && _jsx("p", { className: "muted small", children: "Showing 300. Export CSV for all of them." })] }, k)))] });
}
// ---------- errors + playbook ----------
function Errors({ c }) {
    const [rows, setRows] = useState(null);
    const [plays, setPlays] = useState([]);
    const [open, setOpen] = useState(null);
    const [fixed, setFixed] = useState(false);
    const load = async () => { try {
        const [e, p] = await Promise.all([c.api.errors(), c.api.playbook()]);
        setRows(e);
        setPlays(p);
    }
    catch (e) {
        c.flash(errText(e), true);
        setRows([]);
    } };
    useEffect(() => { load(); }, []);
    const shown = (rows ?? []).filter(r => fixed || r.status === 'open');
    return _jsxs(_Fragment, { children: [_jsxs("div", { className: "row between wrap toolbar", children: [_jsx("p", { className: "muted", style: { margin: 0 }, children: "Something went wrong in METRC? Log it here with a screenshot. Once it's fixed, add the fix to the playbook so the next person knows." }), _jsx("button", { className: "primary", onClick: () => setOpen({ happened_on: today() }), children: "+ Log a METRC error" })] }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: fixed, onChange: e => setFixed(e.target.checked) }), " Show fixed ones too"] }), rows == null ? _jsx("p", { className: "muted", children: "Loading\u2026" }) : !shown.length ? _jsx("p", { className: "muted", children: "No open METRC errors." }) : _jsx("div", { className: "clist", children: shown.map(r => _jsxs("button", { className: "crow", onClick: () => setOpen(r), children: [_jsxs("span", { className: "grow", children: [_jsx("span", { className: "t", children: r.what }), _jsxs("div", { className: "muted small", children: [fmtD(r.happened_on), r.license ? ` · ${r.license}` : '', r.tag ? ` · ${short(r.tag)}` : '', r.action ? ` · ${r.action}` : '', " \u00B7 ", r.created_by?.split('@')[0], r.assigned_to ? ` → ${r.assigned_to.split('@')[0]}` : ''] }), r.error_text && _jsx("div", { className: "small mono", children: r.error_text.slice(0, 140) })] }), _jsx("span", { className: `pill ${r.status === 'open' ? 'cp-bad' : 'cp-ok'}`, children: r.status === 'open' ? 'Open' : 'Fixed' })] }, r.id)) }), open && _jsx(ErrorSheet, { c: c, e: open, plays: plays, onClose: () => setOpen(null), onSaved: async () => { await load(); await c.reload(); } })] });
}
const words = (s) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3));
function ErrorSheet({ c, e, plays, onClose, onSaved }) {
    const [x, setX] = useState(e);
    const [id, setId] = useState(e.id ?? null);
    const [busy, setBusy] = useState(false);
    const [fix, setFix] = useState(e.fix ?? '');
    const [toPlay, setToPlay] = useState(true);
    const [playTitle, setPlayTitle] = useState('');
    const [pending, setPending] = useState([]);
    const set = (v) => setX(s => ({ ...s, ...v }));
    const like = useMemo(() => {
        const w = words(`${x.what ?? ''} ${x.error_text ?? ''}`);
        if (w.size < 1)
            return [];
        return plays.map(p => ({ p, n: [...words(`${p.title} ${p.symptom ?? ''}`)].filter(y => w.has(y)).length })).filter(y => y.n >= 2).sort((a, b) => b.n - a.n).slice(0, 3).map(y => y.p);
    }, [x.what, x.error_text, plays]);
    async function save() {
        setBusy(true);
        try {
            const nid = await c.api.saveError(x);
            setId(nid);
            for (const f of pending) {
                const path = await c.api.upload(f, 'metrc');
                await c.api.addDoc({ doc_type: 'metrc', title: `METRC error: ${x.what}`.slice(0, 120), file_path: path, file_name: f.name, mime: f.type || null, size_bytes: f.size, links: [{ kind: 'metrc_error', id: String(nid) }] });
            }
            setPending([]);
            c.flash('Saved');
            await onSaved();
            if (!e.id)
                onClose();
        }
        catch (err) {
            c.flash(errText(err), true);
        }
        finally {
            setBusy(false);
        }
    }
    async function markFixed(reopen = false) {
        setBusy(true);
        try {
            const pb = await c.api.fixError(id, fix, toPlay && !e.playbook_id, playTitle || null, reopen);
            c.flash(reopen ? 'Reopened' : pb && toPlay ? 'Fixed and added to the playbook' : 'Fixed');
            await onSaved();
            onClose();
        }
        catch (err) {
            c.flash(errText(err), true);
        }
        finally {
            setBusy(false);
        }
    }
    const canFix = id != null && (c.canEdit || e.created_by === c.me || e.assigned_to === c.me);
    return _jsxs(Sheet, { title: e.id ? 'METRC error' : 'Log a METRC error', onClose: onClose, children: [_jsxs("div", { className: "grid2", children: [_jsx(F, { label: "When", children: _jsx(DateIn, { value: x.happened_on, onChange: v => set({ happened_on: v ?? today() }) }) }), _jsx(F, { label: "License", children: _jsx(Pick, { value: x.license ?? null, blank: "\u2014", options: c.ov.licenses.map(l => ({ v: l, l })), onChange: v => set({ license: v }) }) }), _jsx(F, { label: "Package tag", children: _jsx(TextIn, { value: x.tag, onChange: v => set({ tag: v }) }) }), _jsx(F, { label: "What you were doing", children: _jsx(TextIn, { value: x.action, onChange: v => set({ action: v }), placeholder: "Split, transfer, adjust\u2026", list: "comp-err-actions" }) })] }), _jsx("datalist", { id: "comp-err-actions", children: ['Create package', 'Split package', 'Combine packages', 'Adjust package', 'Change item', 'Transfer / manifest', 'Finish package', 'Harvest', 'Lab test', 'Tags'].map(a => _jsx("option", { value: a }, a)) }), _jsx(F, { label: "What happened", children: _jsx(TextIn, { value: x.what, onChange: v => set({ what: v ?? '' }), autoFocus: !e.id }) }), _jsx(F, { label: "METRC's message", hint: "copy it exactly", children: _jsx("textarea", { value: x.error_text ?? '', onChange: ev => set({ error_text: ev.target.value || null }) }) }), _jsx(F, { label: "Assigned to", hint: "email", children: _jsx(TextIn, { value: x.assigned_to, onChange: v => set({ assigned_to: v }) }) }), like.length > 0 && x.status !== 'fixed' && _jsxs("div", { className: "infobox", children: [_jsx("b", { children: "Seen before?" }), like.map(p => _jsxs("div", { className: "play", style: { marginTop: 6 }, children: [_jsx("b", { children: p.title }), _jsx("pre", { children: p.fix })] }, p.id))] }), id != null ? _jsx(DocList, { api: c.api, kind: "metrc_error", refId: id, docType: "metrc", flash: c.flash, title: "Screenshots", empty: "Drop a screenshot of the error here.", defaults: { title: `METRC error: ${x.what ?? ''}`.slice(0, 120) } })
                : _jsxs(_Fragment, { children: [_jsx("div", { className: "cdl-h", children: "Screenshots" }), pending.map((f, i) => _jsxs("div", { className: "small", children: [f.name, " ", _jsx("button", { className: "ghost small", onClick: () => setPending(p => p.filter((_, j) => j !== i)), children: "\u2715" })] }, i)), _jsx(DropZone, { compact: true, onFiles: fs => setPending(p => [...p, ...fs]), label: "drop a screenshot (saved with the error)" })] }), _jsx(SaveBar, { busy: busy, onSave: save, onCancel: onClose, disabled: !x.what?.trim(), saveLabel: e.id ? 'Save' : 'Log it' }), canFix && e.id && (e.status === 'fixed'
                ? _jsxs("div", { className: "infobox", style: { marginTop: 12 }, children: [_jsx("b", { children: "Fixed" }), " ", fmtD(e.fixed_at), " by ", e.fixed_by?.split('@')[0], _jsx("pre", { style: { whiteSpace: 'pre-wrap', fontFamily: 'inherit' }, children: e.fix }), _jsx("button", { className: "ghost small", disabled: busy, onClick: () => markFixed(true), children: "Reopen" })] })
                : _jsxs("div", { style: { marginTop: 14 }, children: [_jsx("h3", { children: "Fix" }), _jsx(F, { label: "How it was fixed", children: _jsx("textarea", { value: fix, onChange: ev => setFix(ev.target.value) }) }), !e.playbook_id && _jsxs(_Fragment, { children: [_jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: toPlay, onChange: ev => setToPlay(ev.target.checked) }), " Add to the playbook"] }), toPlay && _jsx(F, { label: "Playbook title", children: _jsx(TextIn, { value: playTitle, onChange: v => setPlayTitle(v ?? ''), placeholder: (e.what ?? '').slice(0, 80) }) })] }), _jsx("button", { className: "primary", disabled: busy || !fix.trim(), onClick: () => markFixed(), children: "Mark fixed" })] }))] });
}
function Playbook({ c }) {
    const [rows, setRows] = useState(null);
    const [q, setQ] = useState('');
    const [ed, setEd] = useState(null);
    const [busy, setBusy] = useState(false);
    const load = async () => { try {
        setRows(await c.api.playbook());
    }
    catch (e) {
        c.flash(errText(e), true);
        setRows([]);
    } };
    useEffect(() => { load(); }, []);
    const shown = (rows ?? []).filter(p => !q || `${p.title} ${p.symptom ?? ''} ${p.fix} ${p.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase()));
    async function save(del = false) {
        setBusy(true);
        try {
            await c.api.savePlay({ ...ed, tags: typeof ed.tags === 'string' ? ed.tags.split(',') : ed.tags ?? [], delete: del });
            c.flash(del ? 'Deleted' : 'Saved');
            setEd(null);
            await load();
        }
        catch (e) {
            c.flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    return _jsxs(_Fragment, { children: [_jsxs("div", { className: "row between wrap toolbar", children: [_jsx("input", { className: "search", placeholder: "Search the playbook (paste METRC's message)", value: q, onChange: e => setQ(e.target.value) }), c.canEdit && _jsx("button", { className: "primary", onClick: () => setEd({ tags: [] }), children: "+ Entry" })] }), _jsx("p", { className: "muted", children: "Known METRC problems and how to fix them. Fixed errors can add themselves here." }), rows == null ? _jsx("p", { className: "muted", children: "Loading\u2026" }) : !shown.length ? _jsx("p", { className: "muted", children: rows.length ? 'Nothing matches.' : 'Nothing yet.' })
                : shown.map(p => _jsxs("div", { className: "play", children: [_jsxs("div", { className: "row between", children: [_jsx("b", { children: p.title }), c.canEdit && _jsx("button", { className: "ghost small", onClick: () => setEd(p), children: "Edit" })] }), p.symptom && _jsx("div", { className: "muted small mono", children: p.symptom }), _jsx("pre", { children: p.fix }), p.tags.length > 0 && _jsx("div", { className: "small muted", children: p.tags.join(' · ') })] }, p.id)), ed && _jsxs(Sheet, { title: ed.id ? 'Playbook entry' : 'New playbook entry', onClose: () => setEd(null), children: [_jsx(F, { label: "Title", children: _jsx(TextIn, { value: ed.title, onChange: v => setEd({ ...ed, title: v ?? '' }) }) }), _jsx(F, { label: "What you see", hint: "METRC's message", children: _jsx("textarea", { value: ed.symptom ?? '', onChange: e => setEd({ ...ed, symptom: e.target.value || null }) }) }), _jsx(F, { label: "The fix", children: _jsx("textarea", { rows: 6, value: ed.fix ?? '', onChange: e => setEd({ ...ed, fix: e.target.value }) }) }), _jsx(F, { label: "Tags", hint: "comma separated", children: _jsx(TextIn, { value: Array.isArray(ed.tags) ? ed.tags.join(', ') : String(ed.tags ?? ''), onChange: v => setEd({ ...ed, tags: (v ?? '').split(',').map(s => s.trim()).filter(Boolean) }) }) }), _jsx(SaveBar, { busy: busy, onSave: () => save(), onCancel: () => setEd(null), onDelete: ed.id && c.isAdmin ? () => { if (confirm('Delete this entry?'))
                            save(true); } : undefined, disabled: !ed.title?.trim() || !ed.fix?.trim() })] })] });
}
