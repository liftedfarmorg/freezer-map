import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { tagTxt } from './mtag';
import { useEffect, useState } from 'react';
import { metrcRun } from './metrcCall';
import { rpc } from './ship';
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const STATUS = { in_transit: 'On the way', counts_off: 'Counts off: nursery fixing the manifest', recount: 'Manifest fixed: count again', received: 'Received' };
export function ReceivingView({ sb, module, flash, nurseryLicenses = [] }) {
    const [checks, setChecks] = useState(null);
    const [alerts, setAlerts] = useState([]);
    const [inc, setInc] = useState(null);
    const [live, setLive] = useState(false);
    const [busy, setBusy] = useState(null);
    const load = async () => {
        if (!sb)
            return;
        rpc(sb, 'receiving_list', { p_module: module }, '090_receiving').then(setChecks).catch(e => { flash(e.message, true); setChecks([]); });
        rpc(sb, 'my_alerts', { p_module: module }, '090_receiving').then(setAlerts).catch(() => setAlerts([]));
    };
    const loadMetrc = async () => {
        if (!sb)
            return;
        setBusy('Asking METRC…');
        try {
            const r = await metrcRun(sb, { action: 'incoming', module });
            setInc(r.deliveries);
            setLive(r.live);
        }
        catch (e) {
            flash(e.message, true);
            setInc([]);
        }
        finally {
            setBusy(null);
        }
    };
    useEffect(() => { load(); loadMetrc(); }, [module]);
    const run = async (f, ok) => {
        setBusy('Saving…');
        try {
            await f();
            flash(ok);
            await load();
        }
        catch (e) {
            flash(e.message, true);
        }
        finally {
            setBusy(null);
        }
    };
    // deliveries the app made from 1PN show under "From 1PN"; METRC's copy of them is left out below
    const appManifests = new Set((checks ?? []).map(c => c.manifest).filter(Boolean));
    const outside = (inc ?? []).filter(d => !d.error && !(d.manifest && appManifests.has(d.manifest)) && !(module === 'cultivation' && nurseryLicenses.includes(d.from_license ?? '')));
    const mine = (checks ?? []).filter(c => module === 'cultivation' ? true : c.status === 'counts_off' || c.status === 'recount' || c.status === 'in_transit');
    return _jsxs("div", { className: "list receiving", children: [_jsxs("div", { className: "row between wrap toolbar", children: [_jsx("h2", { children: "Receiving" }), _jsxs("div", { className: "row", children: [inc && _jsx("span", { className: `pill ${live ? 'm-bad' : 'm-warn'}`, children: live ? 'METRC Live' : 'Dry run' }), _jsx("button", { className: "ghost small", disabled: !!busy, onClick: () => { load(); loadMetrc(); }, children: busy ?? 'Refresh' })] })] }), _jsx("p", { className: "muted", children: module === 'cultivation'
                    ? 'Clones and plants coming to OHR and GVR. Count what came off the truck against the manifest. If it matches, receive it. If not, the nursery is told to fix the manifest first. Dead or damaged plants: receive the full count, then they\'re logged as a loss.'
                    : 'Deliveries to 1PN, and nursery deliveries Cultivation counted short or over: fix the manifest in METRC, then press Manifest fixed.' }), alerts.length > 0 && _jsx("section", { className: "dcard alerts", children: alerts.map(a => _jsxs("div", { className: "alertrow", children: [_jsxs("div", { className: "row between", children: [_jsx("b", { children: a.title }), _jsx("button", { className: "linkbtn", onClick: () => run(() => rpc(sb, 'alert_done', { p_id: a.id }, '090_receiving'), 'Done'), children: "Done" })] }), a.body && _jsx("div", { className: "small pre", children: a.body }), _jsxs("div", { className: "muted small", children: [when(a.created_at), a.created_by ? ` · ${a.created_by}` : ''] })] }, a.id)) }), _jsxs("h3", { children: ["From 1PN ", mine.length > 0 && _jsx("span", { className: "muted", children: mine.filter(c => c.status !== 'received').length })] }), checks && !mine.length && _jsx("p", { className: "muted", children: "Nothing on the way." }), mine.map(c => module === 'cultivation'
                ? _jsx(CountCard, { c: c, busy: !!busy, onCount: async (counts, dead, note) => {
                        setBusy('Saving…');
                        try {
                            const r = await rpc(sb, 'delivery_count', { p_ref: c.ref, p_counts: counts, p_dead: dead, p_note: note || null }, '090_receiving');
                            flash(r.status === 'counts_off' ? `Counts off. The nursery has been told to fix the manifest (${(r.off ?? '').trim()}). It stays here until they do.` : `Received ${c.strain} at ${c.site}`);
                            await load();
                        }
                        catch (e) {
                            flash(e.message, true);
                        }
                        finally {
                            setBusy(null);
                        }
                    } }, c.ref)
                : _jsx(FixCard, { c: c, busy: !!busy, onFixed: (note, counts) => run(() => rpc(sb, 'delivery_fixed', { p_ref: c.ref, p_note: note || null, p_counts: counts }, '090_receiving'), 'Cultivation has been told to recount') }, c.ref)), _jsxs("h3", { children: ["From outside ", outside.length > 0 && _jsx("span", { className: "muted", children: outside.length })] }), inc && !outside.length && !busy && _jsx("p", { className: "muted", children: "Nothing incoming from outside." }), (inc ?? []).filter(d => d.error).map(d => _jsxs("p", { className: "neg small", children: [d.site, " ", d.license, ": ", d.error] }, d.license)), outside.map(d => _jsx(OutsideCard, { d: d, live: live, busy: !!busy, module: module, onReceive: (dead) => run(async () => {
                    const r = await metrcRun(sb, { action: 'inbound_receive', license: d.license, delivery_id: d.delivery_id, module });
                    if (!r.ok)
                        throw new Error(r.info);
                    if (live && module === 'cultivation')
                        await rpc(sb, 'outside_plants_received', { p_site: d.site, p_manifest: d.manifest, p_from: d.from, p_lines: (d.items ?? []).map(i => ({ strain: i.strain, tag: i.tag, qty: i.qty })), p_dead: dead }, '090_receiving');
                    await loadMetrc();
                }, live ? `Received manifest ${d.manifest}` : 'Dry run OK (nothing received until Compliance goes Live)'), onOff: (lines, email, note) => run(async () => {
                    const r = await rpc(sb, 'outside_counts_off', { p_module: module, p_license: d.license, p_manifest: d.manifest ?? null, p_from: d.from ?? null,
                        p_from_license: d.from_license ?? null, p_email: email || null, p_lines: lines, p_note: note || null }, '090_receiving');
                    if (!r.emailed)
                        flash('No email for them: call them to fix the manifest.', true);
                }, email ? `Counts off: ${d.from} will get an email once email sending is set up` : 'Counts off: noted') }, `${d.license}${d.delivery_id}`))] });
}
function CountCard({ c, busy, onCount }) {
    const [n, setN] = useState({});
    const [dead, setDead] = useState('');
    const [note, setNote] = useState('');
    const open = c.status === 'in_transit' || c.status === 'recount';
    const all = c.lines.every(l => n[l.id] !== undefined && n[l.id] !== '');
    return _jsxs("div", { className: `card rc-${c.status}`, children: [_jsxs("div", { className: "row between wrap", children: [_jsxs("div", { children: [_jsx("b", { children: c.strain }), " ", _jsxs("span", { className: "muted", children: ["to ", c.site, c.so ? ` · ${c.so}` : '', c.manifest ? ` · manifest ${c.manifest}` : '', c.shipped_on ? ` · shipped ${c.shipped_on}` : ''] })] }), _jsx("span", { className: `pill ${c.status === 'received' ? 'm-ok' : c.status === 'counts_off' ? 'm-bad' : 'm-warn'}`, children: STATUS[c.status] })] }), c.status === 'recount' && c.fix_note && _jsxs("div", { className: "small", children: ["Nursery: ", c.fix_note] }), c.status === 'counts_off' && c.counted && _jsx("div", { className: "small warn-t", children: c.counted.filter(x => x.counted !== x.plants).map(x => `${x.name}: manifest ${x.plants}, counted ${x.counted}`).join(' · ') }), open && _jsxs(_Fragment, { children: [c.lines.map(l => _jsxs("div", { className: "row between countrow", children: [_jsxs("span", { children: [_jsx("b", { children: l.batch }), " ", _jsxs("span", { className: "muted", children: [l.strain, l.tag ? ` · ${tagTxt(l.tag, 8)}` : ''] })] }), _jsxs("span", { className: "row", children: [_jsxs("span", { className: "muted small", children: ["manifest ", l.plants] }), _jsx("input", { type: "number", min: "0", inputMode: "numeric", placeholder: "counted", value: n[l.id] ?? '', onChange: e => setN(x => ({ ...x, [l.id]: e.target.value })), style: { width: 90 } })] })] }, l.id)), _jsxs("div", { className: "grid2", children: [_jsxs("div", { className: "field", children: [_jsx("label", { children: "Dead or damaged (received, logged as a loss)" }), _jsx("input", { type: "number", min: "0", value: dead, onChange: e => setDead(e.target.value), placeholder: "0" })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Note" }), _jsx("input", { value: note, onChange: e => setNote(e.target.value) })] })] }), _jsxs("div", { className: "row end", children: [_jsx("button", { className: "ghost small", disabled: busy, onClick: () => setN(Object.fromEntries(c.lines.map(l => [l.id, String(l.plants)]))), children: "Counts match the manifest" }), _jsx("button", { className: "primary", disabled: busy || !all, onClick: () => onCount(c.lines.map(l => ({ id: l.id, counted: Number(n[l.id]) })), Number(dead) || 0, note), children: "Receive" })] })] })] });
}
function FixCard({ c, busy, onFixed }) {
    const [note, setNote] = useState('');
    const [useCounted, setUseCounted] = useState(true);
    return _jsxs("div", { className: `card rc-${c.status}`, children: [_jsxs("div", { className: "row between wrap", children: [_jsxs("div", { children: [_jsx("b", { children: c.strain }), " ", _jsxs("span", { className: "muted", children: ["to ", c.site, c.so ? ` · ${c.so}` : '', c.manifest ? ` · manifest ${c.manifest}` : ''] })] }), _jsx("span", { className: `pill ${c.status === 'counts_off' ? 'm-bad' : 'm-warn'}`, children: STATUS[c.status] })] }), c.status === 'in_transit' && _jsx("div", { className: "muted small", children: "Waiting for Cultivation to count it." }), c.status === 'recount' && _jsx("div", { className: "muted small", children: "Cultivation is recounting." }), c.status === 'counts_off' && c.counted && _jsxs(_Fragment, { children: [c.counted.map(x => _jsxs("div", { className: `small ${x.counted !== x.plants ? 'warn-t' : ''}`, children: [x.name, " (", x.strain, "): manifest ", x.plants, ", Cultivation counted ", x.counted] }, x.id)), c.note && _jsxs("div", { className: "small", children: ["Cultivation: ", c.note] }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: useCounted, onChange: e => setUseCounted(e.target.checked) }), " I changed the manifest to Cultivation's counts (the app's delivery changes to match)"] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Note for Cultivation" }), _jsx("input", { value: note, onChange: e => setNote(e.target.value), placeholder: "e.g. manifest updated, 2 short" })] }), _jsx("div", { className: "row end", children: _jsx("button", { className: "primary", disabled: busy, onClick: () => onFixed(note, useCounted ? c.counted.map(x => ({ id: x.id, plants: x.counted })) : null), children: "Manifest fixed" }) })] })] });
}
function OutsideCard({ d, live, busy, module, onReceive, onOff }) {
    const [n, setN] = useState({});
    const [dead, setDead] = useState('');
    const [email, setEmail] = useState('');
    const [note, setNote] = useState('');
    const items = d.items ?? [];
    const all = items.every(i => n[i.tag] !== undefined && n[i.tag] !== '');
    const off = items.filter(i => n[i.tag] !== undefined && n[i.tag] !== '' && Number(n[i.tag]) !== Number(i.qty));
    return _jsxs("div", { className: "card", children: [_jsxs("div", { children: [_jsx("b", { children: d.manifest }), " ", _jsx("span", { className: "muted", children: "from" }), " ", _jsx("b", { children: d.from }), " ", _jsx("span", { className: "muted small", children: d.from_license }), _jsxs("div", { className: "muted small", children: ["to ", d.site, " ", d.license, " \u00B7 left ", when(d.departed), d.driver ? ` · ${d.driver}` : '', d.vehicle ? ` · ${d.vehicle}` : ''] })] }), items.map(i => _jsxs("div", { className: "row between countrow", children: [_jsxs("span", { children: [_jsx("b", { children: i.item }), " ", _jsx("span", { className: "muted mono small", children: tagTxt(i.tag, 8) })] }), _jsxs("span", { className: "row", children: [_jsxs("span", { className: "muted small", children: ["manifest ", i.qty, " ", i.uom] }), _jsx("input", { type: "number", min: "0", placeholder: "counted", value: n[i.tag] ?? '', onChange: e => setN(x => ({ ...x, [i.tag]: e.target.value })), style: { width: 90 } })] })] }, i.tag)), module === 'cultivation' && d.plants !== false && _jsxs("div", { className: "field", children: [_jsx("label", { children: "Dead or damaged (received, logged as a loss)" }), _jsx("input", { type: "number", min: "0", value: dead, onChange: e => setDead(e.target.value), placeholder: "0" })] }), off.length > 0 && _jsxs("div", { className: "warnbox small", children: ["Counts don't match: ", off.map(i => `${i.item}: ${i.qty} vs ${n[i.tag]}`).join(' · '), ". Tell them to fix the manifest before receiving.", _jsxs("div", { className: "field", children: [_jsx("label", { children: "Their email" }), _jsx("input", { type: "email", value: email, onChange: e => setEmail(e.target.value), placeholder: "sent once email is set up" })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Note" }), _jsx("input", { value: note, onChange: e => setNote(e.target.value) })] }), _jsx("div", { className: "row end", children: _jsx("button", { className: "primary small", disabled: busy, onClick: () => onOff(items.map(i => ({ item: i.item, tag: i.tag, qty: Number(i.qty), counted: Number(n[i.tag] ?? i.qty) })), email, note), children: "Counts off: tell them" }) })] }), _jsxs("div", { className: "row end", children: [_jsx("button", { className: "ghost small", disabled: busy, onClick: () => setN(Object.fromEntries(items.map(i => [i.tag, String(i.qty)]))), children: "Counts match the manifest" }), _jsx("button", { className: "primary", disabled: busy || !all || off.length > 0, onClick: () => onReceive(Number(dead) || 0), children: live ? 'Receive' : 'Check (dry run)' })] })] });
}
