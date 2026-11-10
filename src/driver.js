import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import { Scanner } from './scan';
import { sameTag } from './scanroute';
import { openMetrcManifest } from './metrcCall';
import { LANGS, lang, setLang, t } from './i18n';
import { kickNotify, pushOn, pushState } from './push';
import { NotifyBox } from './notifyprefs';
import { CrewFleet } from './fleet/Fleet';
export const OUTCOME_LABEL = { delivered: 'Delivered', partly_rejected: 'Partly rejected', fully_rejected: 'Fully rejected', not_delivered: 'Not delivered', dropped_off: 'Dropped off' };
export const REJECT_REASONS = [['quality', 'Quality'], ['wrong_strain', 'Wrong strain'], ['damaged', 'Damaged'], ['overshipped', 'Overshipped'], ['other', 'Other']];
export const NOT_DELIVERED = [['cancelled', 'Customer cancelled'], ['rescheduled', 'Customer rescheduled'], ['couldnt_deliver', "Couldn't deliver"]];
const reasonLabel = (r) => [...REJECT_REASONS, ...NOT_DELIVERED].find(x => x[0] === r)?.[1] ?? r ?? '';
export const outcomeText = (s) => !s.outcome ? '' : s.outcome === 'not_delivered' || s.outcome === 'fully_rejected' ? `${t(OUTCOME_LABEL[s.outcome])}: ${t(reasonLabel(s.outcome_reason))}` : t(OUTCOME_LABEL[s.outcome]);
const STATUS_L = { planning: 'Planning', loading: 'Loading', departing: 'Departing', in_transit: 'On the road', delivered: 'Done', cancelled: 'Cancelled' };
const when = (iso) => iso ? new Date(iso).toLocaleString(lang() === 'es' ? 'es-US' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const day = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(lang() === 'es' ? 'es-US' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const n0 = (n) => Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const uuid = () => crypto.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
const QKEY = 'fm.driverq';
function readQ() { try {
    return JSON.parse(localStorage.getItem(QKEY) ?? '[]');
}
catch {
    return [];
} }
function writeQ(q) { try {
    localStorage.setItem(QKEY, JSON.stringify(q));
}
catch { /* full or private: the send below still runs */ } }
const offline = (m) => !navigator.onLine || /failed to fetch|network|load failed|fetch failed|timed? ?out|NetworkError/i.test(m);
let flushing = false;
/** send what's waiting; returns errors the server gave (those are taken off the phone and shown) */
export async function flushQueue(sb) {
    if (flushing)
        return [];
    flushing = true;
    const errs = [];
    try {
        for (const q of readQ()) {
            if (q.error)
                continue;
            const { error } = q.kind === 'link'
                ? await sb.rpc('driver_link_outcome', { p_token: q.token, p_stop: q.stop, p: { ...q.p, client: q.client } })
                : await sb.rpc('record_stop_outcome', { p_stop: q.stop, p: { ...q.p, client: q.client } });
            if (error && offline(error.message))
                break;
            const rest = readQ().filter(x => x.client !== q.client);
            if (error) {
                errs.push(`${q.label}: ${error.message}`);
                rest.push({ ...q, error: error.message });
            }
            writeQ(rest);
        }
    }
    finally {
        flushing = false;
    }
    return errs;
}
function useQueue(sb, onSent) {
    const [q, setQ] = useState(readQ);
    const [errs, setErrs] = useState([]);
    const flush = useCallback(async () => {
        const before = readQ().filter(x => !x.error).length;
        const e = await flushQueue(sb);
        const now = readQ();
        setQ(now);
        if (e.length)
            setErrs(x => [...x, ...e]);
        if (now.filter(x => !x.error).length < before) {
            onSent();
            kickNotify(sb);
        }
    }, [sb, onSent]);
    useEffect(() => {
        flush();
        const t1 = setInterval(flush, 20000);
        window.addEventListener('online', flush);
        return () => { clearInterval(t1); window.removeEventListener('online', flush); };
    }, [flush]);
    const add = async (x) => { writeQ([...readQ().filter(y => y.stop !== x.stop || y.error), x]); setQ(readQ()); await flush(); };
    const dismiss = (client) => { writeQ(readQ().filter(x => x.client !== client)); setQ(readQ()); };
    return { q, add, errs, clearErrs: () => setErrs([]), dismiss };
}
/** shrink a photo on the phone before it's saved (and maybe kept offline) */
async function shrink(f, max = 1280) {
    const url = URL.createObjectURL(f);
    try {
        const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        return c.toDataURL('image/jpeg', 0.7);
    }
    finally {
        URL.revokeObjectURL(url);
    }
}
async function showManifest(mode, stop) {
    if (!stop.manifest)
        return;
    if (mode.kind === 'auth') {
        const lic = stop.packages.find(p => p.license)?.license;
        if (!lic)
            throw new Error(t('No license found for this manifest'));
        return openMetrcManifest(mode.sb, lic, stop.manifest.trim());
    }
    const w = window.open('', '_blank');
    try {
        const r = await fetch('/api/metrc/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'link_manifest_pdf', token: mode.token, stop: stop.id }) });
        const j = await r.json().catch(() => ({ error: `Error ${r.status}` }));
        if (!r.ok)
            throw new Error(j.error ?? `Error ${r.status}`);
        const bytes = Uint8Array.from(atob(j.base64), ch => ch.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: j.type || 'application/pdf' }));
        if (w)
            w.location.href = url;
        else {
            const a = document.createElement('a');
            a.href = url;
            a.download = `METRC manifest ${stop.manifest}.pdf`;
            a.click();
        }
    }
    catch (e) {
        w?.close();
        throw e;
    }
}
function LangPick({ onLang }) {
    const [, bump] = useState(0);
    return _jsx("div", { className: "seg small", children: LANGS.map(([k, l]) => _jsx("button", { className: lang() === k ? 'on' : '', onClick: () => { setLang(k); onLang?.(k); bump(x => x + 1); }, children: l }, k)) });
}
export function DriverHome({ sb, name, onLang, signOut, embedded, nf: nf0, tab: tab0, onTab }) {
    const [tabS, setTabS] = useState('loads');
    const tab = tab0 ?? tabS;
    const setTab = (x) => { setTabS(x); onTab?.(x); };
    const [fmsg, setFmsg] = useState(null);
    const [nf, setNf] = useState(nf0 ?? {});
    const [nmsg, setNmsg] = useState(null);
    const [loads, setLoads] = useState(null);
    const [err, setErr] = useState(null);
    const [, bump] = useState(0);
    const reload = useCallback(async () => {
        const { data, error } = await sb.rpc('driver_loads');
        if (error) {
            if (!offline(error.message))
                setErr(/Could not find the function|schema cache/i.test(error.message) ? 'Run 215_driver_portal.sql in Supabase first' : error.message);
            return;
        }
        setErr(null);
        setLoads((data.loads) ?? []);
        try {
            localStorage.setItem('fm.driverloads', JSON.stringify(data));
        }
        catch { /* fine */ }
    }, [sb]);
    useEffect(() => {
        try {
            const c = JSON.parse(localStorage.getItem('fm.driverloads') ?? 'null');
            if (c?.loads)
                setLoads(c.loads);
        }
        catch { /* nothing kept */ }
        reload();
        let tm;
        const ch = sb.channel('driver').on('postgres_changes', { event: '*', schema: 'public', table: 'loads' }, () => { clearTimeout(tm); tm = window.setTimeout(reload, 500); })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'load_stops' }, () => { clearTimeout(tm); tm = window.setTimeout(reload, 500); }).subscribe();
        const iv = setInterval(reload, 60000);
        return () => { sb.removeChannel(ch); clearInterval(iv); };
    }, [sb, reload]);
    const mode = { kind: 'auth', sb };
    const qu = useQueue(sb, reload);
    return _jsxs("div", { className: `drv ${embedded ? '' : 'drv-full'}`, children: [!embedded && _jsxs("header", { className: "drv-top", children: [_jsx("b", { children: t('Lifted Farms · Driver') }), _jsx("span", { className: "grow" }), _jsx(LangPick, { onLang: l => { onLang?.(l); bump(x => x + 1); } }), signOut && _jsx("button", { className: "ghost small", onClick: signOut, children: t('Sign out') })] }), !onTab && _jsx("div", { className: "drv-tabs", children: _jsx("div", { className: "seg", children: [['loads', t('My loads')], ['vehicles', t('Trucks and inspections')]].map(([k, l]) => _jsx("button", { className: tab === k ? 'on' : '', onClick: () => setTab(k), children: l }, k)) }) }), fmsg && _jsx("div", { className: `toast ${fmsg.bad ? 'bad' : ''}`, onClick: () => setFmsg(null), children: fmsg.m }), tab === 'vehicles' ? _jsx(CrewFleet, { sb: sb, dept: "distribution", driver: true, title: t('Trucks and inspections'), flash: (m, bad) => { setFmsg({ m, bad }); setTimeout(() => setFmsg(null), 4000); } }) :
                _jsxs("div", { className: "list", children: [_jsxs("div", { className: "row between wrap", children: [_jsx("h2", { children: t('My loads') }), embedded && _jsx(LangPick, { onLang: l => { onLang?.(l); bump(x => x + 1); } })] }), name && _jsx("p", { className: "muted", children: t('Signed in as {u}', { u: name }) }), _jsx(QueueBox, { qu: qu }), _jsx(PushBanner, { sb: sb }), _jsxs("details", { className: "card small", children: [_jsx("summary", { children: t('My notifications') }), _jsx(NotifyBox, { nf: nf, only: ['t_load_assigned', 't_load_left'], notes: false, onSave: async (x) => {
                                        const next = { ...nf, ...x };
                                        setNf(next);
                                        const { error } = await sb.rpc('set_my_notify', { p_notify: x });
                                        setNmsg(error ? error.message : t('Saved'));
                                    } }), nmsg && _jsx("span", { className: "muted small", children: nmsg })] }), err && _jsx("p", { className: "neg", children: err }), loads === null ? _jsx("p", { className: "muted", children: t('Loading…') })
                            : !loads.length ? _jsx("div", { className: "card", children: _jsx("p", { className: "muted", children: t('No loads for you right now. When Distribution puts you on a load as the driver, it shows here.') }) })
                                : loads.map(l => _jsx(LoadCard, { l: l, mode: mode, qu: qu }, l.id))] })] });
}
// =====================================================================================================
// an outside carrier's driver: one load, no login
// =====================================================================================================
export function DriverLinkPage({ sb, token }) {
    const [l, setL] = useState(null);
    const [err, setErr] = useState(null);
    const [, bump] = useState(0);
    const key = `fm.drivelink.${token.slice(0, 12)}`;
    const reload = useCallback(async () => {
        const { data, error } = await sb.rpc('driver_link_load', { p_token: token });
        if (error) {
            if (!offline(error.message))
                setErr(error.message);
            return;
        }
        setErr(null);
        setL(data);
        try {
            localStorage.setItem(key, JSON.stringify(data));
        }
        catch { /* fine */ }
    }, [sb, token, key]);
    useEffect(() => {
        if (!localStorage.getItem('fm.lang') && /^es/i.test(navigator.language))
            setLang('es');
        try {
            const c = JSON.parse(localStorage.getItem(key) ?? 'null');
            if (c?.id)
                setL(c);
        }
        catch { /* nothing kept */ }
        reload();
        const iv = setInterval(reload, 60000);
        return () => clearInterval(iv);
    }, [reload, key]);
    const mode = { kind: 'link', sb, token };
    const qu = useQueue(sb, reload);
    return _jsxs("div", { className: "drv drv-full", children: [_jsxs("header", { className: "drv-top", children: [_jsx("img", { className: "logo-img logo-l", src: "/logo-light.svg", alt: "Lifted Farms", style: { height: 26 } }), _jsx("img", { className: "logo-img logo-d", src: "/logo-dark.svg", alt: "Lifted Farms", style: { height: 26 } }), _jsx("span", { className: "grow" }), _jsx(LangPick, { onLang: () => bump(x => x + 1) })] }), _jsxs("div", { className: "list", children: [l && _jsx("p", { className: "muted", children: t('Hi {n}. Record what happened at each stop. Open this link again any time to come back.', { n: l.link_driver ?? '' }) }), _jsx(QueueBox, { qu: qu }), err && _jsx("div", { className: "warnbox", children: t(err) }), !l && !err && _jsx("p", { className: "muted", children: t('Loading…') }), l && _jsx(LoadCard, { l: l, mode: mode, qu: qu, open: true })] })] });
}
function QueueBox({ qu }) {
    const waiting = qu.q.filter(x => !x.error), failed = qu.q.filter(x => x.error);
    return _jsxs(_Fragment, { children: [waiting.length > 0 && _jsxs("div", { className: "warnbox", children: ["\uD83D\uDCF6 ", t('Saved on phone, not sent yet: {n}. It sends by itself when there is signal.', { n: waiting.map(x => x.label).join(', ') })] }), failed.map(x => _jsxs("div", { className: "warnbox neg", children: [t("Couldn't save {s}: {e}", { s: x.label, e: x.error ?? '' }), " ", _jsx("button", { className: "ghost small", onClick: () => qu.dismiss(x.client), children: t('OK') })] }, x.client))] });
}
function LoadCard({ l, mode, qu, open: open0 }) {
    const [open, setOpen] = useState(open0 ?? l.status === 'in_transit');
    const [stop, setStop] = useState(null);
    const [msg, setMsg] = useState(null);
    const left = l.status === 'in_transit' || l.status === 'delivered';
    const queuedFor = (s) => qu.q.find(x => x.stop === s.id && !x.error);
    const done = l.stops.filter(s => s.outcome || s.status !== 'pending' || queuedFor(s)).length;
    return _jsxs("div", { className: "card drv-load", children: [_jsxs("button", { className: "drv-loadhead", onClick: () => setOpen(o => !o), children: [_jsxs("div", { children: [_jsx("b", { children: l.code }), " ", _jsx("span", { className: `pill s-${l.status}`, children: t(STATUS_L[l.status] ?? l.status) }), l.driving_for && _jsx("span", { className: "pill", children: l.driving_for }), _jsxs("div", { className: "muted small", children: [day(l.load_date), l.vehicle ? ` · ${l.vehicle}` : '', l.departed_at ? ` · ${t('left {d}', { d: when(l.departed_at) })}` : l.depart_planned ? ` · ${t('leaves {d}', { d: when(l.depart_planned) })}` : ''] })] }), _jsxs("span", { className: "muted", children: [t('{a} of {b} stops', { a: done, b: l.stops.length }), " ", open ? '▾' : '▸'] })] }), open && _jsxs(_Fragment, { children: [l.driving_for && _jsxs("div", { className: "infobox", children: ["\uD83D\uDE9A ", t('Driving for {c}', { c: l.driving_for })] }), l.notes && _jsx("p", { className: "muted small", children: l.notes }), !left && _jsx("div", { className: "infobox", children: t('Waiting for Distribution to depart this load. You can look at the stops; outcomes open once it leaves.') }), msg && _jsx("p", { className: "neg small", children: msg }), l.stops.map(s => {
                        const qd = queuedFor(s);
                        const back = s.packages.filter(p => p.back).length;
                        return _jsxs("div", { className: `drv-stop ${s.outcome || s.status !== 'pending' ? 'done' : ''}`, children: [_jsxs("div", { className: "row between wrap", children: [_jsxs("div", { children: [_jsx("span", { className: "stopnum", children: s.seq }), " ", _jsx("b", { children: s.customer })] }), qd ? _jsxs("span", { className: "pill s-departing", children: ["\uD83D\uDCF6 ", t('Not sent yet')] })
                                            : s.outcome ? _jsx("span", { className: `pill ${s.outcome === 'delivered' || s.outcome === 'dropped_off' ? 's-delivered' : 's-back'}`, children: outcomeText(s) })
                                                : s.status === 'delivered' ? _jsx("span", { className: "pill s-delivered", children: t(s.site ? 'Dropped off' : 'Delivered') }) : null] }), s.address && _jsx("div", { className: "small", children: _jsxs("a", { href: `https://maps.google.com/?q=${encodeURIComponent(s.address)}`, target: "_blank", rel: "noreferrer", children: ["\uD83D\uDCCD ", s.address] }) }), (s.contact || s.phone) && _jsxs("div", { className: "small", children: [s.contact && _jsxs("span", { children: [s.contact, " "] }), s.phone && _jsxs("a", { href: `tel:${s.phone.replace(/[^\d+]/g, '')}`, children: ["\uD83D\uDCDE ", s.phone] })] }), _jsxs("div", { className: "muted small", children: [s.manifest ? _jsxs(_Fragment, { children: [t('Manifest'), " ", _jsx("b", { children: s.manifest }), " \u00B7 "] }) : '', t('{n} pallets', { n: s.pallets }), " \u00B7 ", t('{n} packages', { n: s.packages.length }), " \u00B7 ", n0(s.packages.reduce((a, p) => a + Number(p.lbs ?? 0), 0)), " lbs"] }), s.receiver_name && _jsxs("div", { className: "muted small", children: [t('Received by {n}', { n: s.receiver_name }), back ? ` · ${t('{n} coming back', { n: back })}` : ''] }), _jsxs("details", { className: "small", children: [_jsx("summary", { children: t('Packages') }), s.packages.map(p => _jsxs("div", { className: `drv-pkg ${p.back ? 'neg' : ''}`, children: [_jsx("b", { children: p.item ?? p.strain }), " ", _jsx("span", { className: "mono", children: p.tag }), " \u00B7 ", n0(p.lbs), " lbs", p.back ? ` · ${t('coming back')}${p.reason ? ` (${t(reasonLabel(p.reason))})` : ''}` : ''] }, p.id))] }), _jsxs("div", { className: "row wrap", style: { gap: 6, marginTop: 6 }, children: [s.manifest && /^\d{6,}$/.test(s.manifest.trim()) && left && _jsx("button", { className: "ghost small", onClick: () => showManifest(mode, s).catch(e => setMsg(e.message)), children: t('Show manifest') }), left && !qd && !s.outcome && s.status === 'pending' && _jsx("button", { className: "primary", onClick: () => setStop(s), children: t('What happened here?') })] })] }, s.id);
                    }), l.coming_back > 0 && _jsxs("div", { className: "warnbox", children: ["\u21A9 ", t('{n} packages coming back to {f}. The crew receives them in Distribution › Inbound.', { n: l.coming_back, f: l.back_to ?? t('the farm') })] })] }), stop && _jsx(StopOutcomeSheet, { stop: stop, load: l.code, mode: mode, onClose: () => setStop(null), onSave: async (p) => { await qu.add({ client: uuid(), stop: stop.id, load: l.id, p, kind: mode.kind, token: mode.kind === 'link' ? mode.token : undefined, at: new Date().toISOString(), label: `${l.code} ${t('stop')} ${stop.seq}` }); setStop(null); } })] });
}
// =====================================================================================================
// the outcome form (driver, carrier link, office)
// =====================================================================================================
export function StopOutcomeSheet({ stop, load, office, onClose, onSave }) {
    const site = !!stop.site;
    const [o, setO] = useState(office && stop.outcome ? stop.outcome : null);
    const [why, setWhy] = useState(stop.outcome_reason ?? '');
    const [note, setNote] = useState(stop.outcome_note ?? '');
    const [rcv, setRcv] = useState(stop.receiver_name ?? '');
    const [rej, setRej] = useState(() => Object.fromEntries(stop.packages.filter(p => p.back).map(p => [p.id, { reason: p.reason ?? '', note: p.note ?? '' }])));
    const [photo, setPhoto] = useState(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const [scan, setScan] = useState(false);
    const [sure, setSure] = useState(false);
    const file = useRef(null);
    const choices = site ? ['dropped_off', 'not_delivered'] : ['delivered', 'partly_rejected', 'fully_rejected', 'not_delivered'];
    const nRej = Object.keys(rej).length;
    const problem = !o ? t('Pick what happened')
        : o !== 'not_delivered' && !rcv.trim() ? t('Enter the name of the person who received it')
            : o === 'not_delivered' && !why ? t('Pick why it wasn\'t delivered')
                : o === 'not_delivered' && why === 'couldnt_deliver' && !note.trim() ? t('Add a note: what happened?')
                    : o === 'fully_rejected' && !why ? t('Pick why they rejected it')
                        : o === 'partly_rejected' && !nRej ? t('Tap the rejected packages')
                            : o === 'partly_rejected' && nRej === stop.packages.length ? t('Every package was rejected: choose Fully rejected')
                                : o === 'partly_rejected' && Object.values(rej).some(r => !r.reason) ? t('Pick a reason for each rejected package') : null;
    const toggle = (id) => setRej(r => { const n = { ...r }; if (n[id])
        delete n[id];
    else
        n[id] = { reason: '', note: '' }; return n; });
    const onScan = (tag) => {
        setScan(false);
        const p = stop.packages.find(x => x.tag && sameTag(x.tag, tag));
        if (!p) {
            setErr(t('That tag isn\'t on this stop: {t}', { t: tag }));
            return;
        }
        setErr(null);
        if (!rej[p.id])
            toggle(p.id);
    };
    const summary = !o ? '' : o === 'partly_rejected' ? t('{n} of {m} packages rejected and coming back on the truck. The rest stays with {c}.', { n: nRej, m: stop.packages.length, c: stop.customer })
        : o === 'fully_rejected' || o === 'not_delivered' ? t('All {m} packages come back on the truck.', { m: stop.packages.length })
            : o === 'dropped_off' ? t('{m} packages left at {c}. The crew puts them in a freezer.', { m: stop.packages.length, c: stop.customer })
                : t('All {m} packages delivered to {c}.', { m: stop.packages.length, c: stop.customer });
    async function save() {
        if (problem || !o)
            return;
        if (!sure) {
            setSure(true);
            return;
        }
        setBusy(true);
        setErr(null);
        try {
            await onSave({ outcome: o, reason: o === 'not_delivered' || o === 'fully_rejected' ? why : null, note: note.trim() || null, receiver: o === 'not_delivered' ? (rcv.trim() || null) : rcv.trim(),
                photo, rejects: o === 'partly_rejected' ? Object.entries(rej).map(([id, r]) => ({ id: Number(id), reason: r.reason, note: r.note.trim() || null })) : [] });
        }
        catch (e) {
            setErr(e.message);
            setSure(false);
        }
        finally {
            setBusy(false);
        }
    }
    return _jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: "sheet drv-sheet", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsxs("div", { children: [_jsx("h2", { children: t('Stop {n}: {c}', { n: stop.seq, c: stop.customer }) }), _jsxs("div", { className: "muted small", children: [load, stop.manifest ? ` · ${t('Manifest')} ${stop.manifest}` : ''] })] }), _jsx("button", { className: "ghost", onClick: onClose, children: "\u2715" })] }), _jsx("div", { className: "drv-choices", children: choices.map(c => _jsx("button", { className: `drv-choice c-${c} ${o === c ? 'on' : ''}`, onClick: () => { setO(c); setSure(false); if (c !== o)
                            setWhy(''); }, children: t(OUTCOME_LABEL[c]) }, c)) }), o === 'partly_rejected' && _jsxs("div", { className: "field", children: [_jsxs("div", { className: "row between", children: [_jsx("label", { children: t('Which packages were rejected?') }), _jsxs("button", { className: "ghost small", onClick: () => setScan(true), children: ["\uD83D\uDCF7 ", t('Scan')] })] }), stop.packages.map(p => {
                            const r = rej[p.id];
                            return _jsxs("div", { className: `drv-rej ${r ? 'on' : ''}`, children: [_jsxs("label", { className: "row", children: [_jsx("input", { type: "checkbox", checked: !!r, onChange: () => { toggle(p.id); setSure(false); } }), " ", _jsxs("span", { children: [_jsx("b", { children: p.item ?? p.strain }), _jsx("br", {}), _jsx("span", { className: "mono small", children: p.tag }), " \u00B7 ", n0(p.lbs), " lbs"] })] }), r && _jsxs("div", { className: "row wrap", style: { gap: 6 }, children: [_jsxs("select", { value: r.reason, onChange: e => setRej(x => ({ ...x, [p.id]: { ...r, reason: e.target.value } })), children: [_jsx("option", { value: "", children: t('Reason…') }), REJECT_REASONS.map(([k, l]) => _jsx("option", { value: k, children: t(l) }, k))] }), _jsx("input", { placeholder: t('Note (optional)'), value: r.note, onChange: e => setRej(x => ({ ...x, [p.id]: { ...r, note: e.target.value } })) })] })] }, p.id);
                        })] }), o === 'fully_rejected' && _jsxs("div", { className: "field", children: [_jsx("label", { children: t('Why did they reject it?') }), _jsxs("select", { value: why, onChange: e => setWhy(e.target.value), children: [_jsx("option", { value: "", children: t('Reason…') }), REJECT_REASONS.map(([k, l]) => _jsx("option", { value: k, children: t(l) }, k))] })] }), o === 'not_delivered' && _jsxs("div", { className: "field", children: [_jsx("label", { children: t('Why not?') }), _jsx("div", { className: "drv-choices", children: NOT_DELIVERED.filter(([k]) => !site || k === 'couldnt_deliver').map(([k, l]) => _jsx("button", { className: `drv-choice small ${why === k ? 'on' : ''}`, onClick: () => setWhy(k), children: t(l) }, k)) }), why === 'couldnt_deliver' && _jsx("div", { className: "muted small", children: t('Closed, no one there, truck problem… say what happened in the note.') })] }), o && _jsxs(_Fragment, { children: [_jsxs("div", { className: "field", children: [_jsx("label", { children: o === 'not_delivered' ? t('Who did you talk to? (optional)') : t('Name of the person who received it') }), _jsx("input", { value: rcv, onChange: e => setRcv(e.target.value), autoComplete: "off" })] }), _jsxs("div", { className: "field", children: [_jsxs("label", { children: [t('Note'), " ", o === 'not_delivered' && why === 'couldnt_deliver' ? '' : t('(optional)')] }), _jsx("textarea", { value: note, onChange: e => setNote(e.target.value), rows: 2 })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: t('Photo (optional): the signed manifest, damage…') }), _jsx("input", { ref: file, type: "file", accept: "image/*", capture: "environment", style: { display: 'none' }, onChange: async (e) => { const f = e.target.files?.[0]; if (f) {
                                        try {
                                            setPhoto(await shrink(f));
                                        }
                                        catch {
                                            setErr(t('Couldn\'t read that photo'));
                                        }
                                    } } }), _jsxs("div", { className: "row", children: [_jsxs("button", { className: "ghost small", onClick: () => file.current?.click(), children: ["\uD83D\uDCF7 ", photo ? t('Retake photo') : t('Take a photo')] }), photo && _jsxs(_Fragment, { children: [_jsx("img", { src: photo, alt: "", style: { height: 48, borderRadius: 6 } }), _jsx("button", { className: "ghost small", onClick: () => setPhoto(null), children: "\u2715" })] })] })] })] }), err && _jsx("p", { className: "neg", children: err }), sure && !problem && _jsxs("div", { className: "infobox", children: [_jsx("b", { children: t('Check before sending:') }), " ", t(OUTCOME_LABEL[o]), ". ", summary, office ? '' : ` ${t('Once sent, only the office can change it.')}`] }), _jsxs("div", { className: "row end", children: [_jsx("button", { className: "ghost", onClick: onClose, children: t('Cancel') }), _jsx("button", { className: "primary", disabled: !!problem || busy, title: problem ?? '', onClick: save, children: busy ? t('Saving…') : sure ? t('Yes, send') : t('Save') })] }), problem && o && _jsx("p", { className: "muted small", style: { textAlign: 'right' }, children: problem }), scan && _jsx(Scanner, { typed: true, onClose: () => setScan(false), onScan: onScan })] }) });
}
export function StopAlerts({ sb, only }) {
    const [rows, setRows] = useState([]);
    const load = useCallback(() => { sb?.rpc('stop_alerts').then(({ data, error }) => { if (!error)
        setRows((data ?? [])); }); }, [sb]);
    useEffect(() => { load(); const iv = setInterval(load, 60000); return () => clearInterval(iv); }, [load]);
    const shown = rows.filter(a => !only || only.includes(a.module));
    if (!shown.length)
        return null;
    return _jsxs("div", { className: "warnbox", style: { marginBottom: 10 }, children: [_jsx("b", { children: t('Delivery alerts') }), shown.map(a => _jsxs("div", { className: "row between", style: { gap: 8, padding: '4px 0', borderTop: '1px solid var(--line)' }, children: [_jsxs("div", { className: "small", children: [_jsx("b", { children: a.title }), _jsx("div", { className: "muted", children: a.body })] }), _jsx("button", { className: "ghost small", onClick: () => sb?.rpc('stop_alert_done', { p_id: a.id }).then(load), children: t('Done') })] }, a.id))] });
}
/** "Turn on notifications" for this phone (Driver screen) */
export function PushBanner({ sb }) {
    const [st, setSt] = useState(null);
    const [msg, setMsg] = useState(null);
    useEffect(() => { pushState().then(setSt).catch(() => setSt('unsupported')); }, []);
    if (!st || st === 'on' || st === 'unsupported')
        return msg ? _jsx("p", { className: "muted small", children: msg }) : null;
    if (st === 'ios_needs_home')
        return _jsx("div", { className: "infobox small", children: t('To get notifications on iPhone: tap Share, then Add to Home Screen, and open Lifted from the Home Screen.') });
    if (st === 'blocked')
        return _jsx("div", { className: "warnbox small", children: t('Notifications are blocked for this app. Allow them in the phone settings to get alerts about your loads.') });
    return _jsxs("div", { className: "infobox row between wrap", style: { gap: 8 }, children: [_jsx("span", { children: t('Get a notification when you\'re put on a load and when it leaves.') }), _jsx("button", { className: "primary small", onClick: () => pushOn(sb).then(() => { setSt('on'); setMsg(t('Notifications are on for this device.')); }).catch(e => setMsg(e.message)), children: t('Turn on notifications') }), msg && _jsx("span", { className: "neg small", children: msg })] });
}
