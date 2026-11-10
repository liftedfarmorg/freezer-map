import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { MTag } from '../mtag';
import { Select } from '../combo';
import { TagInput } from '../taginput';
import { CompFleet } from '../fleet/Fleet';
import { StrainLink } from '../strainCard';
import { useBack } from '../nav';
import '../cult/cult.css';
import './proc.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PRODUCT_LABEL } from '../types';
import { ProcApi } from './api';
import { Card, Cards, DashHead, Empty, Tile, Tiles } from '../dash';
import { DateIn, F, NumIn, Pick, SaveBar, Sheet, TextIn, errText, useSel, SelAll, SelBox, SelBar, SelButton } from '../cult/ui';
import { sameTag, useScanHandler } from '../scanroute';
import { ModulePeople } from '../users';
import { Fold } from '../fold';
import { CrewTab, RunDayLog } from '../pay/CrewView';
import { InvTable } from '../invtable';
import { ItemLotRows, TestRows } from '../comp/trace';
import { PackageActions } from '../pkgactions';
import { MetrcNote } from '../metrc';
import { openMetrcManifest } from '../metrcCall';
import { CloseLotButton, ComingBack, NeedsOurTag, ReceiveBackButton, lotBack } from './Returns';
// ---------- small helpers ----------
const n0 = (x) => (x == null || !isFinite(x) ? '' : Math.round(x).toLocaleString());
const n1 = (x) => (x == null || !isFinite(x) ? '' : (Math.round(x * 10) / 10).toLocaleString());
const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 1000) / 10}%` : '');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const days = (a, b) => Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000);
const fmtD = (iso) => (iso ? new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' }) : '');
const canon = (s) => (s ?? '').trim().toLowerCase();
const live = (p) => (p.status === 'in_freezer' || p.status === 'unslotted') && p.pushed !== false;
const w = (p) => p.current_weight ?? 0;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const PL = (p) => PRODUCT_LABEL[(p ?? 'fresh_frozen')] ?? p;
const REQ_PRODUCT = { standards: 'Standards', smalls: 'Smalls', trim: 'Trim', any: 'Trimmed (any)' };
const KIND = { buck: 'Bucking', sort: 'Sorting', trim: 'Trimming', machine: 'Machine trim' };
const OUTS = { buck: ['bucked', 'trim'], sort: ['bucked_standards', 'smalls'], trim: ['standards', 'smalls', 'trim'], machine: ['standards', 'trim'] };
/** what each run takes in. Hand trim also takes machine trimmed standards (to finish them by hand). */
const takes = (kind, p) => kind === 'buck' ? p.product === 'unbucked' || p.product === 'wet'
    : kind === 'sort' ? p.product === 'bucked'
        : kind === 'machine' ? ['bucked', 'bucked_standards', 'smalls'].includes(p.product ?? '')
            : ['bucked', 'bucked_standards', 'smalls'].includes(p.product ?? '') || (p.product === 'standards' && !!p.machine_trimmed);
const TAKES = { buck: 'wet or unbucked', sort: 'bucked', trim: 'bucked, bucked standards, smalls or machine trimmed standards', machine: 'bucked, bucked standards or smalls' };
/** sort and machine runs are simple: weight in, weight out, no crew or piece rate */
const simple = (k) => k === 'sort' || k === 'machine';
export default function ProcessingView({ backend, flash, tab, go, isAdmin, canEdit, strains, onChanged, inv }) {
    const sb = useMemo(() => backend.client(), [backend]);
    const api = useMemo(() => (sb ? new ProcApi(sb) : null), [sb]);
    const [d, setD] = useState(null);
    const [err, setErr] = useState(null);
    const [run, setRun] = useState(null);
    const [logDate, setLogDate] = useState(null);
    useBack(!!logDate, () => setLogDate(null));
    const [pkg, setPkg] = useState(null);
    const [startKind, setStartKind] = useState(null);
    const [sendIds, setSendIds] = useState(null);
    const [away, setAway] = useState(null);
    const load = useCallback(async () => {
        if (!api)
            return;
        try {
            setD(await api.load());
            setErr(null);
        }
        catch (e) {
            setErr(errText(e));
        }
    }, [api]);
    useEffect(() => { load(); }, [load]);
    useEffect(() => { if (inv?.tick)
        load(); }, [inv?.tick]); // a map action (split, merge, weight...) finished
    const [mf, setMf] = useState(new Map());
    useEffect(() => {
        if (!sb || !d)
            return;
        const ids = d.pallets.filter(p => p.package_tag && (p.status === 'at_processor' || p.product === 'wet' || p.product === 'unbucked')).map(p => p.id);
        if (!ids.length)
            return;
        sb.rpc('pallet_manifests', { p_ids: ids }).then(({ data }) => setMf(new Map((data ?? []).map(x => [x.pallet_id, x]))));
    }, [d, sb]);
    // Scan in Processing opens the package card (Buck, Trim, Send to processor...); other tags go to the app's pallet card
    useScanHandler(tag => {
        const p = d?.pallets.find(x => sameTag(x.package_tag, tag));
        if (!p)
            return false;
        setRun(null);
        setPkg(p);
        return true;
    });
    if (!api)
        return _jsxs("div", { className: "list", children: [_jsx("h2", { children: "Processing" }), _jsx("p", { className: "muted", children: "Processing needs the database (not available in the demo)." })] });
    if (err)
        return _jsxs("div", { className: "list", children: [_jsx("h2", { children: "Processing" }), _jsxs("div", { className: "warnbox", children: ["Couldn't load Processing. If this is the first time, run 047_processing.sql in Supabase. (", err, ")"] })] });
    if (!d)
        return _jsxs("div", { className: "list", children: [_jsx("h2", { children: "Processing" }), _jsx("p", { className: "muted", children: "Loading\u2026" })] });
    const reload = async () => { await load(); onChanged(); };
    const where = (p) => {
        if (p.status === 'at_processor')
            return `At ${d.processors.find(x => x.id === p.processor_id)?.short ?? 'processor'}${p.sent_on ? ` since ${fmtD(p.sent_on)}` : ''}`;
        if (p.status === 'depleted')
            return 'Used up';
        if (p.status === 'shipped')
            return 'Shipped';
        if (p.status === 'in_transit')
            return 'On a truck';
        if (p.slot_id == null)
            return `Needs a spot${p.received_site ? ` (${p.received_site})` : ''}`;
        const s = d.slots.get(p.slot_id), f = s ? d.freezers.get(s.freezer_id) : undefined;
        if (!s || !f)
            return '?';
        return f.kind === 'trailer' ? `${f.site} Reefer ${f.number - 100} · ${s.code.slice(2)}` : f.kind === 'staging' ? `${f.site} Staging · ${s.row}` : `${f.site} F${f.number} · ${s.code}`;
    };
    const openRuns = new Map(d.inputs.filter(i => d.runs.find(r => r.id === i.run_id)?.status === 'open').map(i => [i.pallet_id, d.runs.find(r => r.id === i.run_id)]));
    const held = new Map(d.held.map(h => [h.pallet_id, `${h.so ?? ''} ${h.customer}`.trim()]));
    const c = {
        d, api, flash, canEdit, isAdmin, reload, where,
        procName: id => d.processors.find(x => x.id === id)?.name ?? '',
        heldFor: id => held.get(id) ?? null, runOf: id => openRuns.get(id),
        openRun: (r, date) => { setRun(r); setLogDate(date ?? null); }, openPkg: p => setPkg(p),
        sb, inv,
        start: (kind, ids) => setStartKind({ kind, ids }), send: ids => setSendIds(ids), putAway: p => setAway(p),
        manifest: async (ids) => {
            try {
                const m = await api.manifest(ids);
                const { manifestPdf, manifestFile } = await import('../manifest');
                const b = await manifestPdf(m);
                const a = document.createElement('a');
                a.href = URL.createObjectURL(b);
                a.download = manifestFile(m);
                a.click();
            }
            catch (e) {
                flash(errText(e), true);
            }
        },
        mfst: p => {
            const m = mf.get(p.id);
            return m && sb ? _jsxs("button", { className: "ghost small", title: `METRC manifest ${m.manifest} (${m.license})`, onClick: e => { e.stopPropagation(); openMetrcManifest(sb, m.license, m.manifest).catch(er => flash(errText(er), true)); }, children: ["Manifest ", m.manifest.replace(/^0+/, '')] }) : null;
        },
        dried: async (ids) => { try {
            await api.dried(ids);
            flash(`${ids.length} now unbucked`);
            await reload();
        }
        catch (e) {
            flash(errText(e), true);
        } },
    };
    return (_jsxs("div", { className: "proc", children: [tab === 'dashboard' && _jsx(Dashboard, { c: c, go: go }), tab === 'inbound' && _jsx(Inbound, { c: c }), tab === 'incoming' && _jsx(Drying, { c: c }), tab === 'runs' && _jsx(Runs, { c: c, sel: run?.id ?? null, onStart: k => setStartKind({ kind: k }) }), tab === 'crew' && sb && _jsx(CrewTab, { sb: sb, runs: d.runs.filter(r => !simple(r.kind)), flash: flash, canEdit: canEdit, isAdmin: isAdmin, onOpenRun: (id, date) => { const r = d.runs.find(x => x.id === id); if (r)
                    c.openRun(r, date); } }), tab === 'orders' && _jsx(Orders, { c: c }), tab === 'inventory' && _jsx(Inventory, { c: c }), tab === 'yields' && _jsx(Yields, { c: c }), tab === 'review' && _jsx(Review, { c: c, go: go }), tab === 'settings' && (isAdmin ? _jsx(SettingsTab, { c: c, sb: sb }) : _jsxs("div", { className: "list", children: [_jsx("h2", { children: "Settings" }), _jsx("p", { className: "muted", children: "Only Processing Admins can change Processing settings." })] })), sendIds && _jsx(SendSheet, { c: c, ids: sendIds, onClose: () => setSendIds(null) }), away && _jsx(PutAwaySheet, { c: c, p: away, sb: sb, onClose: () => setAway(null) }), startKind && _jsx(StartRun, { c: c, kind: startKind.kind, req: startKind.req, pre: startKind.ids, onClose: () => setStartKind(null), onDone: r => { setStartKind(null); setRun(r); } }), run && _jsx(RunSheet, { c: c, run: d.runs.find(x => x.id === run.id) ?? run, logDate: logDate, setLogDate: setLogDate, onClose: () => { setRun(null); setLogDate(null); } }, run.id), pkg && _jsx(PackageSheet, { c: c, p: d.pallets.find(x => x.id === pkg.id) ?? pkg, onClose: () => setPkg(null) })] }));
}
// ---------- shared bits ----------
function Prod({ p }) { return _jsx("span", { className: `pill prod pr-${p}`, children: PL(p) }); }
function Tag({ p }) { return p.package_tag ? _jsx(MTag, { t: p.package_tag, className: "small" }) : p.tag_pending ? _jsx("span", { className: "warn-t small", children: "tag pending" }) : null; }
/** on hand by product (live packages only) */
function onHand(d) {
    const m = new Map();
    for (const p of d.pallets) {
        if (!(live(p) || p.status === 'at_processor'))
            continue;
        const k = p.product ?? 'fresh_frozen';
        const x = m.get(k) ?? { n: 0, lbs: 0 };
        x.n++;
        x.lbs += w(p);
        m.set(k, x);
    }
    return m;
}
/** dry harvests that still need their wet package (last 3 weeks; older ones were handled before the app) */
const toPackage = (d, all = false) => d.harvests.filter(h => (h.status === 'done' || h.harvested_on) && !d.pallets.some(p => p.from_harvest === h.id) && (all || (h.harvested_on ?? h.planned_on ?? '') >= addDays(today(), -21)));
/** the shares to use for a strain: its own runs + FL25 workbook first, then all strains, then defaults */
export function shares(d, strain, harvestDry) {
    const s = d.rates.strains[canon(strain)] ?? {}, a = d.rates.all ?? {};
    const pick = (k, def) => {
        const v = s[k], u = a[k];
        return v != null ? [v, 'strain'] : u != null ? [u, 'all'] : [def, 'default'];
    };
    const dryOwn = s.dry ?? null;
    const dry = dryOwn != null ? [dryOwn, 'strain'] : a.dry != null ? [a.dry, 'all'] : [d.rates.default_dry ?? harvestDry ?? 0.2, 'default'];
    return { dry, bt: pick('bt', 0.08), std: pick('std', 0.65), sml: pick('sml', 0.12), trm: pick('trm', 0.18), mold: pick('mold', 0.04) };
}
/** wet / unbucked weight > bucked flower + buck trim; bucked > standards / smalls / trim */
export function forecast(d, p) {
    const f = shares(d, p.strain, d.harvests.find(h => h.id === p.from_harvest)?.dry_conversion);
    const bk = p.product === 'bucked' ? w(p) : p.product === 'wet' || p.product === 'unbucked' ? w(p) * f.dry[0] : 0;
    return { f, bucked: bk, buckTrim: p.product === 'bucked' ? 0 : bk * f.bt[0], std: bk * f.std[0], sml: bk * f.sml[0], trm: bk * f.trm[0] };
}
const SRC = { strain: "this strain's history", all: 'all strains', default: 'the default' };
// ---------- Dashboard ----------
function Dashboard({ c, go }) {
    const { d } = c;
    const oh = onHand(d), g = (k) => oh.get(k) ?? { n: 0, lbs: 0 };
    const away = d.pallets.filter(p => p.status === 'at_processor');
    const openRuns = d.runs.filter(r => r.status === 'open');
    const waiting = d.lines.filter(l => l.picked < l.lbs - 0.01);
    const spot = d.pallets.filter(p => p.status === 'unslotted');
    const pend = d.pallets.filter(p => live(p) && p.tag_pending);
    const toPack = toPackage(d);
    const trimmed = ['standards', 'smalls', 'trim'];
    return (_jsxs("div", { className: "dash", children: [_jsx(DashHead, { title: "Processing", sub: "Dry flower: drying, bucking, trimming" }), _jsxs(Tiles, { children: [_jsx(Tile, { label: "At processors", value: `${n0(sum(away.map(w)))} lbs`, sub: away.length ? `${away.length} wet package${away.length === 1 ? '' : 's'} out drying` : 'nothing out', onClick: () => go('incoming') }), _jsx(Tile, { label: "Unbucked on hand", value: `${n0(g('unbucked').lbs)} lbs`, sub: g('unbucked').n ? `${g('unbucked').n} package${g('unbucked').n === 1 ? '' : 's'} · wet weight on paper` : 'none', onClick: () => go('inventory') }), _jsx(Tile, { label: "Bucked on hand", value: `${n0(g('bucked').lbs)} lbs`, sub: g('bucked').n ? `${g('bucked').n} package${g('bucked').n === 1 ? '' : 's'} ready to trim` : 'none', onClick: () => go('inventory') }), _jsx(Tile, { label: "Trimmed on hand", value: `${n0(sum(trimmed.map(k => g(k).lbs)))} lbs`, sub: trimmed.map(k => `${PL(k)} ${n0(g(k).lbs)}`).join(' · '), onClick: () => go('inventory') }), _jsx(Tile, { label: "Dry orders", value: waiting.length, sub: waiting.length ? `${n0(sum(waiting.map(l => l.lbs - l.picked)))} lbs still to fill (Fulfillment)` : 'nothing waiting', tone: waiting.length ? 'warn' : 'ok', onClick: () => go('orders') }), _jsx(Tile, { label: "Open runs", value: openRuns.length, sub: openRuns.length ? openRuns.map(r => r.code).slice(0, 3).join(', ') : 'nothing being worked', onClick: () => go('runs') }), _jsx(Tile, { label: "Needs a spot", value: spot.length, sub: spot.length ? `${n0(sum(spot.map(w)))} lbs to put in a trailer` : 'all put away', tone: spot.length ? 'warn' : 'ok', onClick: () => go('review') }), (pend.length > 0 || toPack.length > 0) && _jsx(Tile, { label: "To do", value: pend.length + toPack.length, sub: [toPack.length && `${toPack.length} dry harvests to package`, pend.length && `${pend.length} tags pending`].filter(Boolean).join(' · '), tone: "warn", onClick: () => go('review') })] }), _jsxs(Cards, { children: [_jsx(Card, { title: "Dry orders waiting", badge: waiting.length, action: "Orders", onAction: () => go('orders'), children: waiting.length ? _jsx("div", { className: "dlist", children: waiting.slice(0, 8).map(l => _jsxs("div", { className: "drow", children: [_jsxs("span", { className: "grow", children: [_jsx("b", { children: l.strain }), " ", PL(l.product), " ", _jsxs("span", { className: "muted", children: [l.so, " \u00B7 ", l.customer] })] }), _jsx("span", { className: "muted", children: l.wanted ? fmtD(l.wanted) : '' }), _jsxs("b", { children: [n0(l.picked), "/", n0(l.lbs)] })] }, l.id)) })
                            : _jsx(Empty, { children: "No dry orders waiting." }) }), _jsx(Card, { title: "Being worked", badge: openRuns.length, action: "Runs", onAction: () => go('runs'), children: openRuns.length ? _jsx("div", { className: "dlist", children: openRuns.map(r => _jsxs("div", { className: "drow", children: [_jsxs("button", { className: "rowbtn grow", onClick: () => c.openRun(r), children: [_jsx("b", { children: r.code }), " ", KIND[r.kind], " \u00B7 ", r.strain, " ", _jsxs("span", { className: "muted", children: ["since ", fmtD(r.started_on), " \u00B7 ", n0(r.input_lbs), " lbs"] })] }), c.canEdit && _jsx("button", { className: "ghost small", onClick: () => c.openRun(r, today()), children: "Log today" })] }, r.id)) })
                            : _jsx(Empty, { children: "No runs open." }) }), _jsx(Card, { wide: true, title: "On hand by strain, with forecast", action: "Inventory", onAction: () => go('inventory'), children: _jsx(ByStrain, { d: d }) })] })] }));
}
function ByStrain({ d }) {
    const cols = ['wet', 'unbucked', 'bucked', 'bucked_standards', 'standards', 'smalls', 'trim'];
    const m = new Map();
    for (const p of d.pallets) {
        if (!(live(p) || p.status === 'at_processor') || !cols.includes(p.product))
            continue;
        const k = p.strain ?? '?';
        const r = m.get(k) ?? { lbs: {}, std: 0, sml: 0, trm: 0 };
        r.lbs[p.product] = (r.lbs[p.product] ?? 0) + w(p);
        const f = forecast(d, p);
        r.std += f.std;
        r.sml += f.sml;
        r.trm += f.trm;
        m.set(k, r);
    }
    const rows = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    if (!rows.length)
        return _jsx(Empty, { children: "Nothing on hand yet." });
    return _jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable small-t", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Strain" }), cols.map(k => _jsx("th", { className: "num", children: PL(k) }, k)), _jsx("th", { className: "num", children: "~Std to come" }), _jsx("th", { className: "num", children: "~Smalls" }), _jsx("th", { className: "num", children: "~Trim" })] }) }), _jsx("tbody", { children: rows.map(([s, r]) => _jsxs("tr", { children: [_jsx("td", { children: s }), cols.map(k => _jsx("td", { className: "num", children: n0(r.lbs[k]) }, k)), _jsx("td", { className: "num muted", children: r.std ? `~${n0(r.std)}` : '' }), _jsx("td", { className: "num muted", children: r.sml ? `~${n0(r.sml)}` : '' }), _jsx("td", { className: "num muted", children: r.trm ? `~${n0(r.trm)}` : '' })] }, s)) })] }) });
}
// ---------- Drying: dry harvests > wet packages > processors > back unbucked ----------
function Inbound({ c }) {
    return _jsxs("div", { className: "list", children: [_jsx("h2", { children: "Inbound" }), _jsx("p", { className: "muted", children: "Product coming back from processors on their METRC manifest. Open a manifest, give every package a spot (our tag and a reweigh if you have them), and Receive. Which wet lot each package came from is sorted out in Drying \u203A Receive back." }), c.sb && _jsx(ComingBack, { sb: c.sb, api: c.api, flash: c.flash, reload: c.reload, isAdmin: c.isAdmin }), c.sb && _jsx(NeedsOurTag, { d: c.d, api: c.api, sb: c.sb, flash: c.flash, reload: c.reload, isAdmin: c.isAdmin, openPkg: c.openPkg })] });
}
function Drying({ c }) {
    const { d } = c;
    const [wet, setWet] = useState(null);
    const selWet = useSel();
    const [older, setOlder] = useState(false);
    const toPack = toPackage(d, older), hidden = toPackage(d, true).length - toPackage(d).length;
    const wetHere = d.pallets.filter(p => p.product === 'wet' && live(p));
    const away = d.pallets.filter(p => p.status === 'at_processor').sort((a, b) => (a.sent_on ?? '').localeCompare(b.sent_on ?? ''));
    const byProc = new Map();
    for (const p of away) {
        const k = p.processor_id ?? 0;
        byProc.set(k, [...(byProc.get(k) ?? []), p]);
    }
    const backHere = d.pallets.filter(p => p.status === 'unslotted' && p.product === 'unbucked');
    return (_jsxs("div", { className: "list", children: [_jsx("h2", { children: "Drying" }), _jsx("p", { className: "muted", children: "Dry flower leaves the farm as raw wet weight (not deleafed) in one METRC package and goes to a drying processor or our trailers. Processors send it back dry on their METRC manifest, received in Processing \u203A Inbound. Here, put what came back toward each wet lot (Receive back) and close the lot when it's all back." }), _jsxs("h3", { className: "csec", children: ["Dry harvests to package ", _jsx("span", { className: "muted", children: toPack.length || '' })] }), toPack.length ? _jsx("div", { className: "cwrap fit", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Harvested" }), _jsx("th", { children: "Strain" }), _jsx("th", { className: "hide-s", children: "Site \u00B7 field" }), _jsx("th", { className: "num", children: "Raw lbs" }), _jsx("th", {})] }) }), _jsx("tbody", { children: toPack.map(h => _jsxs("tr", { children: [_jsx("td", { className: "nowrap", children: fmtD(h.harvested_on ?? h.planned_on) }), _jsx("td", { children: h.strain }), _jsxs("td", { className: "hide-s", children: [h.site, " ", h.field ?? ''] }), _jsx("td", { className: "num", children: h.raw_lbs != null ? n0(h.raw_lbs) : _jsx("span", { className: "muted", children: "not logged" }) }), _jsx("td", { className: "num", children: c.canEdit && _jsx("button", { className: "primary small", onClick: () => setWet(h), children: "Make wet package" }) })] }, h.id)) })] }) }) : _jsx("p", { className: "muted", children: "Every dry harvest from the last 3 weeks has its wet package." }), hidden > 0 && _jsx("button", { className: "linkbtn", onClick: () => setOlder(!older), children: older ? 'Hide older harvests' : `Show ${hidden} older dry harvest${hidden === 1 ? '' : 's'} with no package` }), _jsxs("h3", { className: "csec row between", children: [_jsxs("span", { children: ["Wet, with us ", _jsx("span", { className: "muted", children: wetHere.length || '' })] }), wetHere.length > 0 && c.canEdit && _jsx(SelButton, { sel: selWet })] }), wetHere.length ? _jsx(PkgTable, { c: c, rows: wetHere, sel: selWet }) : _jsx("p", { className: "muted", children: "No wet packages waiting here." }), _jsx(SelBar, { sel: selWet, noun: "package", actions: [
                    { label: 'Send to a processor', run: async (ids) => c.send(ids) },
                    { label: 'Dried in house', run: ids => c.dried(ids) },
                    { label: 'Buck', run: async (ids) => c.start('buck', ids) },
                ] }), _jsx("h3", { className: "csec", children: _jsxs("span", { children: ["At processors ", _jsx("span", { className: "muted", children: away.length ? `${away.length} · ${n0(sum(away.map(w)))} lbs wet` : '' })] }) }), !away.length && _jsx("p", { className: "muted", children: "Nothing out at a processor." }), [...byProc.entries()].map(([pid, ps]) => _jsxs("div", { children: [_jsx("h4", { className: "subh row between", children: _jsxs("span", { children: [c.procName(pid) || 'Unknown processor', " ", _jsxs("span", { className: "muted", children: [ps.length, " \u00B7 ", n0(sum(ps.map(w))), " lbs"] })] }) }), _jsx(PkgTable, { c: c, rows: ps, extra: p => _jsxs("span", { className: "row nowrap", style: { justifyContent: 'flex-end', gap: 6 }, children: [c.mfst(p), p.sent_on ? _jsxs("span", { className: days(p.sent_on, today()) > 21 ? 'warn-t' : 'muted', children: [days(p.sent_on, today()), " days out"] }) : null, lotBack(p, d) && _jsx("span", { className: "okp pill", children: lotBack(p, d) }), c.isAdmin && _jsx(ReceiveBackButton, { p: p, d: d, api: c.api, flash: c.flash, reload: c.reload }), c.isAdmin && _jsx(CloseLotButton, { p: p, d: d, api: c.api, flash: c.flash, reload: c.reload })] }) })] }, pid)), _jsxs("h3", { className: "csec", children: ["Back, needs a spot ", _jsx("span", { className: "muted", children: backHere.length || '' })] }), backHere.length ? _jsx(PkgTable, { c: c, rows: backHere, extra: p => c.canEdit ? _jsxs("span", { className: "row", children: [_jsx("button", { className: "ghost small", onClick: e => { e.stopPropagation(); c.putAway(p); }, children: "Put in a trailer" }), _jsx("button", { className: "primary small", onClick: e => { e.stopPropagation(); c.start('buck', [p.id]); }, children: "Buck" })] }) : null })
                : _jsx("p", { className: "muted", children: "Everything that came back is in a trailer. Unbucked packages are in Inventory." }), wet && _jsx(WetSheet, { c: c, h: wet, onClose: () => setWet(null) })] }));
}
function PkgTable({ c, rows, sel, extra, showProduct, extraOnPhone = true }) {
    return _jsx("div", { className: "cwrap fit", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [sel && _jsx(SelAll, { sel: sel, ids: rows.map(p => p.id) }), _jsx("th", { children: "Package" }), showProduct && _jsx("th", { className: "hide-s", children: "Product" }), _jsx("th", { children: "Strain" }), _jsx("th", { className: "hide-s", children: "Crop" }), _jsx("th", { className: "num", children: "Lbs" }), _jsx("th", { className: "hide-s", children: "Tag" }), _jsx("th", { children: "Where" }), extra && _jsx("th", { className: extraOnPhone ? '' : 'hide-s' })] }) }), _jsx("tbody", { children: rows.map(p => {
                        const r = c.runOf(p.id), h = c.heldFor(p.id);
                        return _jsxs("tr", { className: "tap", onClick: () => c.openPkg(p), children: [sel && _jsx(SelBox, { sel: sel, id: p.id }), _jsxs("td", { children: [_jsx("b", { children: p.code }), showProduct && _jsx("span", { className: "show-s", children: _jsx(Prod, { p: p.product }) })] }), showProduct && _jsx("td", { className: "hide-s", children: _jsx(Prod, { p: p.product }) }), _jsx("td", { children: p.strain }), _jsx("td", { className: "hide-s", children: p.crop_year ?? '' }), _jsx("td", { className: "num", children: n0(w(p)) }), _jsx("td", { className: "hide-s", children: _jsx(Tag, { p: p }) }), _jsxs("td", { className: "small", children: [c.where(p), r ? _jsxs("span", { className: "pill warnp", children: ["in ", r.code] }) : null, h ? _jsxs("span", { className: "pill okp", children: ["for ", h] }) : null] }), extra && _jsx("td", { className: `num ${extraOnPhone ? '' : 'hide-s'}`, children: extra(p) })] }, p.id);
                    }) })] }) });
}
function TagIn({ value, onChange, placeholder, pallet, purpose }) {
    return _jsx(TagInput, { compact: true, value: value, onChange: onChange, where: { pallet: pallet ?? null, ...(purpose ? { purpose } : {}) }, placeholder: placeholder ?? 'Last digits or scan (blank = pending)' });
}
function WetSheet({ c, h, onClose }) {
    const procs = c.d.processors.filter(p => p.active);
    const [rows, setRows] = useState([{ lbs: h.raw_lbs, tag: '' }]);
    const [proc, setProc] = useState(procs.find(p => !p.in_house)?.id ?? null);
    const [sent, setSent] = useState(today());
    const [busy, setBusy] = useState(false);
    const tot = sum(rows.map(r => r.lbs ?? 0));
    const inHouse = procs.find(p => p.id === proc)?.in_house;
    async function save() {
        setBusy(true);
        try {
            const codes = await c.api.makeWet(h.id, rows.filter(r => r.lbs).map(r => ({ lbs: r.lbs, tag: r.tag })), proc, sent);
            c.flash(`${codes.join(', ')} made`);
            await c.reload();
            onClose();
        }
        catch (e) {
            c.flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    return _jsxs(Sheet, { title: "Wet package", sub: `${h.strain} · ${h.site} ${h.field ?? ''} · harvested ${fmtD(h.harvested_on ?? h.planned_on)}`, onClose: onClose, children: [_jsx("p", { className: "muted", children: "The raw wet weight that leaves the farm (not deleafed). Usually one package per harvest." }), rows.map((r, i) => _jsxs("div", { className: "row noline", children: [_jsx(NumIn, { value: r.lbs, placeholder: "lbs", onChange: v => setRows(rs => rs.map((x, j) => j === i ? { ...x, lbs: v } : x)) }), _jsx(TagIn, { value: r.tag, onChange: v => setRows(rs => rs.map((x, j) => j === i ? { ...x, tag: v } : x)) }), rows.length > 1 && _jsx("button", { className: "ghost small", onClick: () => setRows(rs => rs.filter((_, j) => j !== i)), children: "\u2715" })] }, i)), _jsx("button", { className: "ghost small", onClick: () => setRows(rs => [...rs, { lbs: null, tag: '' }]), children: "+ Another package" }), h.raw_lbs != null && tot !== h.raw_lbs && _jsxs("p", { className: "warn-t small-note", children: ["Packages add up to ", n0(tot), " lbs; the harvest logged ", n0(h.raw_lbs), " lbs raw."] }), _jsx(F, { label: "Going to", children: _jsx(Pick, { value: proc, blank: "Stays here for now", options: procs.map(p => ({ v: p.id, l: p.name })), onChange: setProc }) }), proc != null && !inHouse && _jsx(F, { label: "Sent", children: _jsx(DateIn, { value: sent, onChange: setSent }) }), _jsx("p", { className: "muted small-note", children: proc == null || inHouse ? 'It lands as "Needs a spot" at ' + h.site + '. Mark it "Dried in house" when it comes off the drying racks.' : 'It shows under At processors until it comes back unbucked. Its METRC manifest shows on its line once METRC has it.' }), _jsx(SaveBar, { busy: busy, onCancel: onClose, onSave: save, saveLabel: "Make package", disabled: !tot })] });
}
function SendSheet({ c, ids, onClose }) {
    const procs = c.d.processors.filter(p => p.active && !p.in_house);
    const [proc, setProc] = useState(procs[0]?.id ?? null);
    const [on, setOn] = useState(today());
    const [busy, setBusy] = useState(false);
    const [sent, setSent] = useState(false);
    async function save() {
        setBusy(true);
        try {
            await c.api.send(ids, proc, on);
            c.flash(`${ids.length} sent to ${c.procName(proc)}`);
            setSent(true);
            await c.reload();
        }
        catch (e) {
            c.flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    const pr = procs.find(p => p.id === proc);
    if (sent)
        return _jsxs(Sheet, { title: `Sent to ${pr?.name ?? 'the processor'}`, onClose: onClose, children: [_jsx("p", { children: "Make the transfer in METRC if the app isn't sending processor transfers yet. Each package's METRC manifest shows on its line under At processors once METRC has it (nightly, or Compliance \u203A METRC \u203A Pull from METRC)." }), !pr?.license && _jsxs("p", { className: "warn-t small-note", children: [pr?.name, " has no license on file yet. Add it in Processing \u203A Settings \u203A Processors."] }), _jsxs("div", { className: "row between csave", children: [_jsx("span", {}), _jsx("div", { className: "row", children: _jsx("button", { className: "primary", onClick: onClose, children: "Done" }) })] })] });
    return _jsxs(Sheet, { title: `Send ${ids.length} to a processor`, onClose: onClose, children: [_jsx(F, { label: "Processor", children: _jsx(Pick, { value: proc, options: procs.map(p => ({ v: p.id, l: p.name })), onChange: setProc }) }), _jsx(F, { label: "Sent", children: _jsx(DateIn, { value: on, onChange: setOn }) }), _jsx("p", { className: "muted small-note", children: "The packages leave the map until they come back. Next you can print the manifest sheet for the METRC transfer." }), _jsx(SaveBar, { busy: busy, onCancel: onClose, onSave: save, saveLabel: "Sent", disabled: proc == null })] });
}
/** put a package in a reefer trailer: first open spot, or pick one; pumpkin boxes stack 2 high */
/** Put away (no spot yet) or Move (has a spot): reefer trailers first, then freezers and staging at the same site.
 *  Same move_pallet the freezer map uses. Going to the other farm is a load (transfer manifest), not a move. */
function PutAwaySheet({ c, p, sb, onClose }) {
    const moving = p.slot_id != null;
    const site = (p.slot_id != null ? c.d.freezers.get(c.d.slots.get(p.slot_id)?.freezer_id ?? -1)?.site : null) ?? p.received_site ?? 'GVR';
    const KO = { trailer: 0, freezer: 1, staging: 2 };
    const boxes = [...c.d.freezers.values()].filter(f => f.site === site && (moving || f.kind === 'trailer'))
        .sort((a, b) => (KO[a.kind] ?? 3) - (KO[b.kind] ?? 3) || a.number - b.number);
    const trailers = boxes.filter(f => f.kind === 'trailer');
    const curBox = p.slot_id != null ? c.d.slots.get(p.slot_id)?.freezer_id : undefined;
    const [tr, setTr] = useState(curBox ?? boxes[0]?.id ?? null);
    const [occ, setOcc] = useState(null);
    const [busy, setBusy] = useState(false);
    const box = boxes.find(f => f.id === tr);
    const cap = box?.kind === 'trailer' ? 2 : 3; // pumpkin boxes go 2 high; freezer pallets get stacked too
    const spots = [...c.d.slots.values()].filter(s => s.freezer_id === tr).sort((a, b) => box?.kind === 'staging' ? a.row - b.row : a.code.localeCompare(b.code, undefined, { numeric: true }));
    const spotName = (s) => box?.kind === 'trailer' ? s.code.slice(2) : box?.kind === 'staging' ? String(s.row) : s.code;
    const boxName = (f) => f.kind === 'trailer' ? `Reefer ${f.number - 100}` : f.kind === 'staging' ? 'Staging' : `F${f.number}`;
    useEffect(() => {
        if (!sb || !boxes.length)
            return;
        const ids = [...c.d.slots.values()].filter(s => boxes.some(f => f.id === s.freezer_id)).map(s => s.id);
        sb.from('pallets').select('code,strain,slot_id').in('slot_id', ids).eq('status', 'in_freezer').is('container_id', null).neq('id', p.id).then(({ data }) => {
            const m = new Map();
            for (const x of (data ?? []))
                m.set(x.slot_id, [...(m.get(x.slot_id) ?? []), x]);
            setOcc(m);
        });
    }, [sb]);
    const free = (fid) => [...c.d.slots.values()].filter(s => s.freezer_id === fid && !(occ?.get(s.id)?.length)).length;
    async function put(slot, stack) {
        if (!sb)
            return;
        setBusy(true);
        try {
            const { error } = await sb.rpc('move_pallet', { p_pallet_id: p.id, p_to_slot: slot, p_combine: stack, p_note: stack ? 'stacked' : null });
            if (error)
                throw new Error(error.message);
            c.flash(`${p.code} in ${c.where({ ...p, slot_id: slot, status: 'in_freezer' })}`);
            await c.reload();
            onClose();
        }
        catch (e) {
            c.flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    const first = spots.find(s => s.id !== p.slot_id && !(occ?.get(s.id)?.length));
    return _jsx(Sheet, { title: moving ? `Move ${p.code}` : `Put ${p.code} in a trailer`, sub: `${p.strain} · ${PL(p.product)} · ${n0(w(p))} lbs${moving ? ` · now ${c.where(p)}` : ''}`, onClose: onClose, children: !boxes.length ? _jsxs("p", { className: "muted", children: ["No ", moving ? 'freezers or trailers' : 'reefer trailers', " at ", site, "."] }) : _jsxs(_Fragment, { children: [_jsx("div", { className: "seg wrap", children: boxes.map(f => _jsxs("button", { className: tr === f.id ? 'on' : '', onClick: () => setTr(f.id), children: [boxName(f), " ", _jsx("span", { className: "muted", children: occ && f.kind !== 'staging' ? `${free(f.id)} open` : '' })] }, f.id)) }), first && _jsx("div", { className: "row csave", children: _jsxs("button", { className: "primary", disabled: busy, onClick: () => put(first.id, false), children: ["First open spot (", spotName(first), ")"] }) }), _jsxs("p", { className: "muted small-note", children: ["Or tap a spot. A full spot stacks it on top", box?.kind === 'trailer' ? ' (pumpkin boxes go 2 high). Back of the trailer at the top, door at the bottom' : '', "."] }), _jsx("div", { className: "putgrid", children: spots.map(s => {
                        const o = occ?.get(s.id) ?? [], here = s.id === p.slot_id;
                        return _jsxs("button", { className: `putspot ${o.length ? 'full' : ''} ${here ? 'here' : ''}`, disabled: busy || here || o.length >= cap, onClick: () => put(s.id, o.length > 0), children: [_jsx("b", { children: spotName(s) }), _jsx("span", { children: here ? 'here now' : o.length ? o.map(x => x.code).join(' + ') : 'open' })] }, s.id);
                    }) }), !trailers.length && !moving && _jsxs("p", { className: "muted", children: ["No reefer trailers at ", site, "."] }), moving && _jsx(MetrcNote, { kind: "move", p: p })] }) });
}
// ---------- Runs ----------
function Runs({ c, onStart, sel }) {
    const [f, setF] = useState('open');
    const rows = c.d.runs.filter(r => f === 'all' ? r.status !== 'cancelled' : r.status === f);
    return (_jsxs("div", { className: "list", children: [_jsxs("div", { className: "row between wrap toolbar", children: [_jsx("h2", { children: "Runs" }), c.canEdit && _jsxs("div", { className: "row", children: [_jsx("button", { className: "primary", onClick: () => onStart('buck'), children: "+ Bucking" }), _jsx("button", { className: "primary", onClick: () => onStart('sort'), children: "+ Sorting" }), _jsx("button", { className: "primary", onClick: () => onStart('trim'), children: "+ Trimming" }), _jsx("button", { className: "primary", onClick: () => onStart('machine'), children: "+ Machine trim" })] })] }), _jsx("div", { className: "seg", children: [['open', `Being worked (${c.d.runs.filter(r => r.status === 'open').length})`], ['done', 'Done'], ['all', 'All']].map(([k, l]) => _jsx("button", { className: f === k ? 'on' : '', onClick: () => setF(k), children: l }, k)) }), !rows.length ? _jsx("p", { className: "muted", children: f === 'open' ? 'Nothing being worked. Start a bucking or trimming run when the crew starts on a lot.' : 'No runs yet.' }) : _jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable slimmable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: "slim", children: "Run" }), _jsx("th", { className: "slim", children: "Strain" }), _jsx("th", { className: "num slim", children: "In" }), _jsx("th", { className: "num", children: "Out" }), _jsx("th", { className: "num hide-s", children: "Mold" }), _jsx("th", { className: "num", children: "Moisture / diff." }), _jsx("th", { children: "Dates" })] }) }), _jsx("tbody", { children: rows.map(r => _jsxs("tr", { className: `tap ${sel === r.id ? 'sel' : ''}`, onClick: () => c.openRun(r), children: [_jsxs("td", { className: "slim", children: [_jsx("b", { children: r.code }), " ", _jsx("span", { className: "muted", children: KIND[r.kind] })] }), _jsxs("td", { className: "slim", children: [r.strain, " ", _jsx("span", { className: "muted", children: r.crop_year ?? '' })] }), _jsx("td", { className: "num slim", children: n0(r.input_lbs) }), _jsx("td", { className: "num", children: r.status === 'done' ? n0(r.output_lbs) : '' }), _jsx("td", { className: "num hide-s", children: r.status === 'done' ? n0(r.mold_lbs) : '' }), _jsx("td", { className: "num", children: r.status === 'done' ? _jsxs(_Fragment, { children: [n0(r.loss_lbs), " ", _jsx("span", { className: "muted", children: pct(r.loss_lbs ?? 0, r.input_lbs ?? 0) })] }) : '' }), _jsxs("td", { className: "nowrap small", children: [fmtD(r.started_on), r.finished_on ? ` – ${fmtD(r.finished_on)}` : r.status === 'open' ? ' · working' : ''] })] }, r.id)) })] }) })] }));
}
function StartRun({ c, kind, req, pre, onClose, onDone }) {
    const cands = c.d.pallets.filter(p => takes(kind, p) && live(p) && !c.runOf(p.id) && !c.heldFor(p.id));
    const strains = [...new Set(cands.map(p => p.strain ?? ''))].sort();
    const preStrain = pre?.length ? c.d.pallets.find(p => p.id === pre[0])?.strain ?? null : null;
    const [strain, setStrain] = useState(preStrain ?? (req ? (strains.find(s => canon(s) === canon(req.strain)) ?? req.strain) : strains.length === 1 ? strains[0] : null));
    const [pick, setPick] = useState(() => Object.fromEntries((pre ?? []).filter(id => cands.some(p => p.id === id)).map(id => [id, null])));
    const [request, setRequest] = useState(req?.id ?? null);
    const [notes, setNotes] = useState('');
    const [on, setOn] = useState(today());
    const [busy, setBusy] = useState(false);
    const list = cands.filter(p => canon(p.strain) === canon(strain));
    const reqs = c.d.requests.filter(q => q.status === 'open' && canon(q.strain) === canon(strain));
    const chosen = Object.entries(pick);
    const total = sum(chosen.map(([id, lbs]) => lbs ?? w(c.d.pallets.find(p => p.id === Number(id)))));
    async function save() {
        setBusy(true);
        try {
            const r = await c.api.startRun(kind, chosen.map(([id, lbs]) => ({ pallet: Number(id), lbs: kind === 'buck' ? null : lbs })), kind === 'trim' ? request : null, notes, 'GVR', on);
            c.flash(`${r.code} started`);
            await c.reload();
            onDone(r);
        }
        catch (e) {
            c.flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    const TITLE = { buck: 'Start bucking', sort: 'Start sorting', trim: 'Start trimming', machine: 'Start machine trim' };
    const SUB = { buck: 'Wet or unbucked packages go in whole (not weighed on the stem; wet ones count as dried in house)',
        sort: 'Bucked flower in; bucked standards and smalls out. No piece rate.', trim: 'Bucked, bucked standards or smalls (or machine trimmed standards to finish by hand), all or part of each',
        machine: 'Smalls or bucked in; standards and trim out. No piece rate. Marked machine trimmed inside the app only (never in METRC or for customers).' };
    return _jsxs(Sheet, { wide: true, side: true, title: TITLE[kind], sub: SUB[kind], onClose: onClose, children: [!cands.length ? _jsxs("p", { className: "muted", children: ["No ", TAKES[kind], " packages free to work on."] }) : _jsxs(_Fragment, { children: [_jsx(F, { label: "Strain", children: _jsx(Pick, { value: strain, blank: "Pick a strain\u2026", options: strains.map(s => ({ v: s, l: `${s} (${n0(sum(cands.filter(p => p.strain === s).map(w)))} lbs)` })), onChange: v => { setStrain(v); setPick({}); setRequest(null); } }) }), strain && _jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", {}), _jsx("th", { children: "Package" }), _jsx("th", { className: "num", children: "Lbs" }), _jsx("th", { className: "hide-s", children: "Where" }), kind !== 'buck' && _jsx("th", { className: "num", children: "Use" })] }) }), _jsx("tbody", { children: list.map(p => {
                                        const on_ = String(p.id) in pick;
                                        return _jsxs("tr", { children: [_jsx("td", { className: "selcol", children: _jsx("input", { type: "checkbox", checked: on_, onChange: () => setPick(x => { const n = { ...x }; if (on_)
                                                            delete n[p.id];
                                                        else
                                                            n[p.id] = null; return n; }) }) }), _jsxs("td", { children: [_jsx("b", { children: p.code }), " ", kind !== 'buck' && kind !== 'sort' && _jsx(Prod, { p: p.product }), p.machine_trimmed && _jsx("span", { className: "muted small", children: " machine" }), " ", _jsx(Tag, { p: p })] }), _jsx("td", { className: "num", children: n0(w(p)) }), _jsx("td", { className: "small hide-s", children: c.where(p) }), kind !== 'buck' && _jsx("td", { className: "num", children: on_ && _jsx("span", { className: "qtyin", children: _jsx(NumIn, { value: pick[p.id], placeholder: `all ${n0(w(p))}`, onChange: v => setPick(x => ({ ...x, [p.id]: v })) }) }) })] }, p.id);
                                    }) })] }) }), kind === 'trim' && reqs.length > 0 && _jsx(F, { label: "For trim request", hint: "(optional)", children: _jsx(Pick, { value: request, blank: "None (trimming ahead)", options: reqs.map(q => ({ v: q.id, l: `${n0(q.lbs)} lbs ${REQ_PRODUCT[q.product]}${q.due_on ? ` by ${fmtD(q.due_on)}` : ''}${q.customer_id ? ` · ${c.d.customers.find(x => x.id === q.customer_id)?.name ?? ''}` : ''}` })), onChange: setRequest }) }), _jsxs("div", { className: "grid2", children: [_jsx(F, { label: "Started", children: _jsx(DateIn, { value: on, onChange: setOn }) }), _jsx(F, { label: "Notes", children: _jsx(TextIn, { value: notes, onChange: v => setNotes(v ?? '') }) })] }), _jsxs("p", { className: "muted small-note", children: [chosen.length, " package", chosen.length === 1 ? '' : 's', " \u00B7 ", n0(total), " lbs", kind === 'buck' ? ' wet weight on paper' : '', ". The packages stay where they are until the run is finished."] })] }), _jsx(SaveBar, { busy: busy, onCancel: onClose, onSave: save, saveLabel: "Start", disabled: !chosen.length })] });
}
function RunSheet({ c, run, logDate, setLogDate, onClose }) {
    const { d } = c;
    const ins = d.inputs.filter(i => i.run_id === run.id).map(i => ({ i, p: d.pallets.find(p => p.id === i.pallet_id) }));
    const outs = d.pallets.filter(p => p.run_id === run.id);
    const req = run.request_id ? d.requests.find(q => q.id === run.request_id) : undefined;
    const open = run.status === 'open' && c.canEdit;
    const [rows, setRows] = useState(() => OUTS[run.kind].map(product => ({ product, lbs: null, tag: '' })));
    const [mold, setMold] = useState(null);
    const [notes, setNotes] = useState(run.notes ?? '');
    const [on, setOn] = useState(today());
    const [busy, setBusy] = useState(false);
    const [sure, setSure] = useState(false);
    const [crew, setCrew] = useState(null);
    const [filled, setFilled] = useState(false);
    const [touched, setTouched] = useState(false); // someone typed a weight: stop filling from the crew log
    const loadCrew = () => c.api.crewOf(run.id).then(setCrew).catch(() => setCrew(null));
    useEffect(() => { loadCrew(); }, [run.id]);
    // fill what came out from the crew log, so nobody types the same numbers twice. Only while nothing has been typed yet.
    useEffect(() => {
        if (!crew || !crew.people || run.status !== 'open')
            return;
        if (touched)
            return;
        const r2 = (x) => Math.round(x * 100) / 100;
        const got = run.kind === 'buck'
            ? { bucked: crew.lbs, trim: crew.trim + crew.smalls }
            : { standards: crew.lbs, smalls: crew.smalls, trim: crew.trim };
        setRows(rs => rs.map((r, i) => ({ ...r, lbs: got[r.product] && rs.findIndex(x => x.product === r.product) === i ? r2(got[r.product]) : null })));
        setMold(crew.mold ? r2(crew.mold) : null);
        setFilled(true);
    }, [crew]);
    const out = sum(rows.map(r => r.lbs ?? 0)), inp = run.input_lbs ?? 0, loss = inp - out - (mold ?? 0);
    const TRIM_TOL = 0.05; // trimming: in and out should match within 5% (water loss, sticky trays)
    const off = run.kind !== 'buck' && inp > 0 && Math.abs(loss) > inp * TRIM_TOL;
    async function fill() {
        try {
            const n = rows.filter(r => r.lbs && !r.tag).length;
            const tags = await c.api.nextTags(run.site, n);
            if (!tags.length) {
                c.flash('No processing tag range for ' + run.site + '. Add one in Admin > Settings > Licenses (Processing packages), or scan.', true);
                return;
            }
            let k = 0;
            setRows(rs => rs.map(r => (r.lbs && !r.tag && k < tags.length ? { ...r, tag: tags[k++] } : r)));
        }
        catch (e) {
            c.flash(errText(e), true);
        }
    }
    async function finish() {
        setBusy(true);
        try {
            const codes = await c.api.finishRun(run.id, rows, mold ?? 0, notes, on);
            c.flash(`${run.code} done: ${codes.join(', ')} need a spot`);
            await c.reload();
            onClose();
        }
        catch (e) {
            c.flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    async function cancel() {
        setBusy(true);
        try {
            await c.api.cancelRun(run.id);
            c.flash(`${run.code} cancelled`);
            await c.reload();
            onClose();
        }
        catch (e) {
            c.flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    if (logDate && c.sb)
        return _jsxs(Sheet, { wide: true, side: true, title: `${run.code} · ${KIND[run.kind]} · crew`, sub: `${run.strain ?? ''} ${run.crop_year ?? ''}`, onClose: onClose, children: [_jsx("button", { className: "ghost small backrun", onClick: () => setLogDate(null), children: "\u2190 Back to the run" }), _jsx(RunDayLog, { sb: c.sb, run: run, date0: logDate, flash: c.flash, canEdit: c.canEdit, onSaved: loadCrew })] });
    return _jsxs(Sheet, { wide: true, side: true, title: `${run.code} · ${KIND[run.kind]}`, sub: `${run.strain ?? ''} ${run.crop_year ?? ''} · started ${fmtD(run.started_on)}${run.finished_on ? ` · done ${fmtD(run.finished_on)}` : ''}${run.status === 'cancelled' ? ' · cancelled' : ''}`, onClose: onClose, children: [req && _jsxs("div", { className: "infobox", children: ["For trim request: ", n0(req.lbs), " lbs ", REQ_PRODUCT[req.product], req.due_on ? ` by ${fmtD(req.due_on)}` : '', req.customer_id ? ` · ${d.customers.find(x => x.id === req.customer_id)?.name}` : ''] }), _jsxs("h3", { className: "csec", children: ["In ", _jsxs("span", { className: "muted", children: [n0(inp), " lbs", run.kind === 'buck' ? ' wet, on paper' : ''] })] }), _jsx("div", { className: "dlist", children: ins.map(({ i, p }) => _jsxs("button", { className: "drow linkrow", onClick: () => p && c.openPkg(p), children: [_jsxs("span", { className: "grow", children: [_jsx("b", { children: p?.code ?? `#${i.pallet_id}` }), " ", _jsxs("span", { className: "muted", children: [p ? PL(p.product) : '', " \u00B7 ", p ? c.where(p) : ''] })] }), _jsxs("b", { children: [n0(i.lbs), " lbs"] }), !i.whole && _jsx("span", { className: "muted", children: "part" })] }, i.id)) }), !simple(run.kind) && _jsxs("h3", { className: "csec", children: ["Crew ", run.status !== 'cancelled' && _jsx("button", { className: "ghost small", onClick: () => setLogDate(today()), children: c.canEdit ? 'Log a day' : 'See the days' })] }), !simple(run.kind) && crew && !crew.people && _jsx("p", { className: "muted small-note", children: "No crew days logged on this run yet." }), !simple(run.kind) && crew && crew.people > 0 && _jsxs(_Fragment, { children: [_jsx("div", { className: "cwrap tight", children: _jsxs("table", { className: "ctable crewdays", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Day" }), _jsx("th", { className: "num", children: "People" }), _jsx("th", { className: "num", children: "Hours" }), _jsx("th", { className: "num", children: run.kind === 'buck' ? 'Bucked' : 'Flower' }), _jsx("th", { className: "num", children: "lbs/hr" }), _jsx("th", { className: "num hide-s", children: "At target" }), _jsx("th", { className: "num", children: "Pay" }), _jsx("th", { className: "num hide-s", children: "Rate" })] }) }), _jsx("tbody", { children: crew.byDay.map(x => _jsxs("tr", { className: "tap", onClick: () => setLogDate(x.date), children: [_jsx("td", { className: "nowrap", children: fmtD(x.date) }), _jsx("td", { className: "num", children: x.people }), _jsx("td", { className: "num", children: n1(x.hours) }), _jsx("td", { className: "num", children: n1(x.lbs) }), _jsx("td", { className: "num", children: _jsx("b", { children: x.hours ? (x.lbs / x.hours).toFixed(2) : '' }) }), _jsxs("td", { className: "num hide-s", children: [x.hit, "/", x.n] }), _jsxs("td", { className: "num", children: ["$", n0(x.pay)] }), _jsx("td", { className: `num hide-s${x.custom ? ' warn-t' : ''}`, children: x.rate != null ? `$${x.rate} @ ${x.target}` : '' })] }, x.date)) }), crew.byDay.length > 1 && _jsx("tfoot", { children: _jsxs("tr", { children: [_jsxs("td", { children: [crew.days, " days"] }), _jsx("td", { className: "num", children: crew.people }), _jsx("td", { className: "num", children: n1(crew.hours) }), _jsx("td", { className: "num", children: n1(crew.lbs) }), _jsx("td", { className: "num", children: _jsx("b", { children: crew.hours ? (crew.lbs / crew.hours).toFixed(2) : '' }) }), _jsxs("td", { className: "num hide-s", children: [crew.hit, "/", crew.n] }), _jsxs("td", { className: "num", children: ["$", n0(crew.pay)] }), _jsx("td", { className: "hide-s" })] }) })] }) }), _jsxs("p", { className: "muted small-note", children: [n1(crew.other), " lbs mold / smalls / trim logged too.", run.status === 'done' && run.output_lbs ? ` The crew logged ${pct(crew.lbs + crew.other, (run.output_lbs ?? 0) + (run.mold_lbs ?? 0))} of what came out.` : '', " Tap a day to open it."] })] }), run.status === 'done' && _jsxs(_Fragment, { children: [_jsxs("h3", { className: "csec", children: ["Out ", _jsxs("span", { className: "muted", children: [n0(run.output_lbs), " lbs"] })] }), _jsx("div", { className: "dlist", children: outs.map(p => _jsxs("button", { className: "drow linkrow", onClick: () => c.openPkg(p), children: [_jsxs("span", { className: "grow", children: [_jsx("b", { children: p.code }), " ", _jsx(Prod, { p: p.product }), " ", _jsx(Tag, { p: p })] }), _jsx("span", { className: "muted small", children: c.where(p) }), _jsxs("b", { children: [n0(p.og_weight), " lbs"] }), _jsx("span", { className: "muted", children: pct(p.og_weight ?? 0, inp) })] }, p.id)) }), _jsxs("div", { className: "ckpis", children: [_jsxs("div", { children: [_jsx("b", { children: n0(run.mold_lbs) }), _jsxs("span", { children: ["mold / refuse (", pct(run.mold_lbs ?? 0, inp), ")"] })] }), _jsxs("div", { children: [_jsx("b", { children: n0(run.loss_lbs) }), _jsxs("span", { children: [run.kind === 'buck' ? 'moisture' : 'difference', " (", pct(run.loss_lbs ?? 0, inp), ")"] })] })] }), run.kind === 'buck' && _jsx("p", { className: "muted small-note", children: "Record the mold as waste and the moisture as a weight change in METRC." })] }), open && _jsxs(_Fragment, { children: [_jsx("h3", { className: "csec", children: "What came out" }), simple(run.kind) ? _jsxs("p", { className: "muted small-note", children: ["Weigh what came out. ", run.kind === 'machine' ? 'The standards are marked machine trimmed in the app only.' : ''] })
                        : filled ? _jsxs("p", { className: "muted small-note", children: ["Filled in from the crew log (", crew?.days, " day", crew?.days === 1 ? '' : 's', "). If the scale says different on a package, change it here."] })
                            : !crew?.people && _jsx("p", { className: "muted small-note", children: "Log the crew's days above (Log a day) and these fill in." }), rows.map((r, i) => _jsxs("div", { className: "row noline", children: [_jsx(Select, { value: r.product, onChange: e => { setTouched(true); setRows(rs => rs.map((x, j) => j === i ? { ...x, product: e.target.value } : x)); }, children: OUTS[run.kind].map(k => _jsxs("option", { value: k, children: [PL(k), run.kind === 'buck' && k === 'trim' ? ' (buck trim)' : ''] }, k)) }), _jsx(NumIn, { value: r.lbs, placeholder: "lbs", onChange: v => { setTouched(true); setRows(rs => rs.map((x, j) => j === i ? { ...x, lbs: v } : x)); } }), _jsx(TagIn, { value: r.tag, onChange: v => setRows(rs => rs.map((x, j) => j === i ? { ...x, tag: v } : x)), pallet: ins[0]?.i.pallet_id ?? undefined, purpose: "processing" }), rows.length > 1 && _jsx("button", { className: "ghost small", onClick: () => { setTouched(true); setRows(rs => rs.filter((_, j) => j !== i)); }, children: "\u2715" })] }, i)), _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost small", onClick: () => { setTouched(true); setRows(rs => [...rs, { product: rs[rs.length - 1]?.product ?? OUTS[run.kind][0], lbs: null, tag: '' }]); }, children: "+ Another package" }), _jsx("button", { className: "ghost small", onClick: fill, children: "Fill next tags" })] }), _jsxs("div", { className: "grid2", children: [_jsx(F, { label: "Mold / refuse", hint: "(lbs, METRC waste)", children: _jsx(NumIn, { value: mold, onChange: v => { setTouched(true); setMold(v); } }) }), _jsx(F, { label: "Finished", children: _jsx(DateIn, { value: on, onChange: setOn }) })] }), _jsx(F, { label: "Notes", children: _jsx(TextIn, { value: notes, onChange: v => setNotes(v ?? '') }) }), _jsxs("div", { className: "ckpis", children: [_jsxs("div", { children: [_jsx("b", { children: n0(out) }), _jsxs("span", { children: ["out (", pct(out, inp), ")"] })] }), _jsxs("div", { children: [_jsx("b", { children: n0(mold) }), _jsx("span", { children: "mold" })] }), _jsxs("div", { children: [_jsx("b", { className: loss < 0 ? 'bad-t' : '', children: n1(loss) }), _jsxs("span", { children: [run.kind === 'buck' ? 'moisture' : 'difference', " (", pct(loss, inp), ")"] })] })] }), loss < 0 ? _jsx("p", { className: "bad-t small-note", children: "More came out than went in. Check the weights." })
                        : off && _jsxs("p", { className: "warn-t small-note", children: ["The difference is ", pct(loss, inp), " of what went in, more than the usual ", TRIM_TOL * 100, "%. Check the scale or a missing day in the crew log."] }), _jsxs("div", { className: "row between csave", children: [sure ? _jsxs("span", { className: "row", children: [_jsx("button", { className: "ghost danger", disabled: busy, onClick: cancel, children: "Yes, cancel run" }), _jsx("button", { className: "ghost small", onClick: () => setSure(false), children: "Keep" })] })
                                : _jsx("button", { className: "ghost", disabled: busy, onClick: () => setSure(true), children: "Cancel run" }), _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost", onClick: onClose, children: "Close" }), _jsx("button", { className: "primary", disabled: busy || !out, onClick: finish, children: busy ? 'Saving…' : 'Finish run' })] })] })] })] });
}
// ---------- Inventory: every dry package, as a table (shared InvTable) ----------
const STAGES = ['Wet', 'Out for drying', 'Unbucked', 'Bucked', 'Bucked Standards', 'Standards', 'Smalls', 'Trim'];
function Inventory({ c }) {
    const { d } = c;
    const stage = (p) => p.status === 'at_processor' ? 'Out for drying' : PL(p.product);
    const daysOut = (p) => p.status === 'at_processor' && p.sent_on ? days(p.sent_on, today()) : null;
    const rows = d.pallets.filter(p => live(p) || p.status === 'at_processor');
    const fc = (p) => { const f = forecast(d, p); return p.product === 'wet' || p.product === 'unbucked' ? f.bucked : p.product === 'bucked' ? f.std : 0; };
    const cols = [
        { k: 'code', l: 'Package', phone: true, get: p => _jsx("b", { children: p.code }), val: p => p.code },
        { k: 'strain', l: 'Strain', phone: true, get: p => p.strain ?? '', val: p => p.strain ?? '' },
        { k: 'stage', l: 'Stage', phone: true, get: p => _jsxs(_Fragment, { children: [_jsx(Prod, { p: p.product }), p.machine_trimmed && _jsx("span", { className: "muted small", title: "Inside the app only", children: " machine" })] }), val: stage },
        { k: 'lbs', l: 'Lbs', num: true, phone: true, get: p => _jsxs(_Fragment, { children: [n0(w(p)), p.product === 'wet' || p.product === 'unbucked' ? _jsx("span", { className: "muted small", children: " wet" }) : null] }), val: w },
        { k: 'proc', l: 'Dried by', get: p => p.processor_id ? c.procName(p.processor_id) : '', val: p => c.procName(p.processor_id) },
        { k: 'sent', l: 'Sent on', get: p => fmtD(p.sent_on), val: p => p.sent_on ?? '' },
        { k: 'out', l: 'Days out', num: true, get: p => { const n = daysOut(p); return n == null ? '' : _jsx("span", { className: n > 21 ? 'warn-t' : '', children: n }); }, val: p => daysOut(p) ?? -1 },
        { k: 'fc', l: 'Forecast', num: true, get: p => { const n = fc(p); return n ? _jsxs("span", { className: "muted small", children: ["~", n0(n), " ", p.product === 'bucked' ? 'std' : 'bucked'] }) : ''; }, val: fc },
        { k: 'held', l: 'Committed to', get: p => c.heldFor(p.id) ? _jsx("span", { className: "pill okp", children: c.heldFor(p.id) }) : '', val: p => c.heldFor(p.id) ?? '' },
        { k: 'run', l: 'Open run', get: p => c.runOf(p.id) ? _jsx("span", { className: "pill warnp", children: c.runOf(p.id).code }) : '', val: p => c.runOf(p.id)?.code ?? '' },
        { k: 'where', l: 'Where', get: p => _jsx("span", { className: "small", children: c.where(p) }), val: p => c.where(p) },
        { k: 'crop', l: 'Crop', get: p => p.crop_year ?? '', val: p => p.crop_year ?? 0 },
        { k: 'tag', l: 'METRC tag', on: false, get: p => _jsx(Tag, { p: p }), val: p => p.package_tag ?? '' },
        { k: 'farm', l: 'Grown at', on: false, get: p => p.origin_site ?? '', val: p => p.origin_site ?? '' },
    ];
    const groups = [
        { k: 'stage', l: 'Stage', key: stage, order: k => STAGES.indexOf(k) },
        { k: 'strain', l: 'Strain', key: p => p.strain ?? '' },
        { k: 'proc', l: 'Processor', key: p => p.status === 'at_processor' ? c.procName(p.processor_id) || 'Processor' : 'Here' },
        { k: 'crop', l: 'Crop year', key: p => String(p.crop_year ?? ''), order: k => -Number(k || 0) },
    ];
    const chips = [
        { k: 'stage', l: 'Stage', get: stage, order: STAGES },
        { k: 'crop', l: 'Crop year', get: p => String(p.crop_year ?? '') },
        { k: 'farm', l: 'Grown at', get: p => p.origin_site ?? '' },
    ];
    const picked = (ids) => d.pallets.filter(p => ids.includes(p.id));
    const all = (ids, ok, what) => { if (picked(ids).every(ok))
        return true; c.flash(`Pick only ${what}`, true); return false; };
    return _jsx(InvTable, { id: "proc", title: "Inventory", rows: rows, rowId: p => p.id, cols: cols, groups: groups, defaultGroup: "stage", defaultSort: "strain", chips: chips, text: p => `${p.code} ${p.strain ?? ''} ${p.package_tag ?? ''} ${stage(p)} ${c.procName(p.processor_id)}`, lbs: w, onOpen: p => c.openPkg(p), note: _jsx(_Fragment, { children: "Every dry package from wet to finished, grouped like a pipeline. Wet and unbucked weights are wet weight on paper. Tap a package for its next step, or Select several to buck, trim or send them together." }), totals: rs => { const fin = rs.filter(p => ['standards', 'smalls', 'trim'].includes(p.product ?? '')); return _jsxs(_Fragment, { children: [n0(sum(fin.map(w))), " lbs finished \u00B7 ", rs.filter(p => p.status === 'at_processor').length, " out for drying"] }); }, actions: c.canEdit ? [
            { label: 'Buck', run: async (ids) => { if (all(ids, p => (p.product === 'wet' || p.product === 'unbucked') && live(p), 'wet or unbucked packages that are here'))
                    c.start('buck', ids); } },
            { label: 'Sort', run: async (ids) => { if (all(ids, p => takes('sort', p) && live(p), 'bucked packages'))
                    c.start('sort', ids); } },
            { label: 'Trim', run: async (ids) => { if (all(ids, p => takes('trim', p) && live(p), TAKES.trim + ' packages'))
                    c.start('trim', ids); } },
            { label: 'Machine trim', run: async (ids) => { if (all(ids, p => takes('machine', p) && live(p), TAKES.machine + ' packages'))
                    c.start('machine', ids); } },
            { label: 'Send to processor', run: async (ids) => { if (all(ids, p => (p.product === 'wet' || p.product === 'unbucked') && live(p), 'wet or unbucked packages that are here'))
                    c.send(ids); } },
        ] : undefined });
}
/** forecast block: what a wet / unbucked / bucked package should turn into */
function Forecast({ c, p }) {
    const f = forecast(c.d, p);
    if (!f.bucked)
        return null;
    const src = (x) => x[1] === 'strain' ? '' : ` (${x[1] === 'all' ? 'all strains' : 'default'})`;
    return _jsxs("div", { className: "fc", children: [_jsx("b", { children: "Forecast" }), " ", _jsxs("span", { className: "muted", children: ["from ", SRC[f.f.std[1]], p.product !== 'bucked' ? `; drying ${Math.round(f.f.dry[0] * 1000) / 10}% from ${SRC[f.f.dry[1]]}` : ''] }), _jsxs("div", { children: [p.product !== 'bucked' && _jsxs(_Fragment, { children: [n0(w(p)), " wet \u2192 ", _jsxs("b", { children: ["~", n0(f.bucked), " bucked"] }), " + ~", n0(f.buckTrim), " buck trim \u2192 "] }), _jsxs("b", { children: ["~", n0(f.std)] }), " Standards", src(f.f.std), ", ", _jsxs("b", { children: ["~", n0(f.sml)] }), " Smalls, ", _jsxs("b", { children: ["~", n0(f.trm)] }), " Trim"] })] });
}
function PackageSheet({ c, p, onClose }) {
    const { d } = c;
    const r = c.runOf(p.id), h = c.heldFor(p.id);
    const made = p.run_id ? d.runs.find(x => x.id === p.run_id) : undefined;
    const usedIn = d.inputs.filter(i => i.pallet_id === p.id).map(i => d.runs.find(x => x.id === i.run_id)).filter((x) => !!x && x.status !== 'cancelled');
    const here = live(p), free = here && !r && !h, can = c.canEdit;
    const info = c.inv?.info(p.id);
    const go = (f) => { onClose(); f(); };
    return _jsxs(Sheet, { side: true, title: p.code, sub: _jsxs(_Fragment, { children: [_jsx(StrainLink, { name: p.strain }), " ", _jsx(Prod, { p: p.product })] }), onClose: onClose, children: [r && _jsxs("div", { className: "infobox", children: ["Being ", r.kind === 'buck' ? 'bucked' : r.kind === 'sort' ? 'sorted' : r.kind === 'machine' ? 'machine trimmed' : 'trimmed', " in ", _jsx("a", { onClick: () => c.openRun(r), children: r.code }), ". Open the run to finish it."] }), h && _jsxs("div", { className: "infobox held", children: ["Committed to ", h, ". Distribution ships it from Fulfillment."] }), can && _jsxs("div", { className: "actions", children: [free && p.slot_id == null && _jsx("button", { className: "ghost", onClick: () => go(() => c.putAway(p)), children: "Put in a trailer" }), free && (p.product === 'wet' || p.product === 'unbucked') && _jsx("button", { className: "primary", onClick: () => go(() => c.start('buck', [p.id])), children: "Buck" }), free && (p.product === 'wet' || p.product === 'unbucked') && _jsx("button", { className: "ghost", onClick: () => go(() => c.send([p.id])), children: "Send to processor" }), free && p.product === 'wet' && _jsx("button", { className: "ghost", onClick: () => go(() => c.dried([p.id])), children: "Dried here" }), p.status === 'at_processor' && _jsx("span", { className: "muted small", children: "Comes back on the processor's METRC manifest: Processing \u203A Drying \u203A Coming back." }), c.mfst(p), free && p.product === 'bucked' && _jsx("button", { className: "ghost", onClick: () => go(() => c.start('sort', [p.id])), children: "Sort" }), free && takes('trim', p) && _jsx("button", { className: "primary", onClick: () => go(() => c.start('trim', [p.id])), children: "Trim" }), free && takes('machine', p) && p.product !== 'bucked' && _jsx("button", { className: "ghost", onClick: () => go(() => c.start('machine', [p.id])), children: "Machine trim" })] }), can && here && c.inv && info?.inSnap && _jsxs(_Fragment, { children: [info.mixed && _jsxs("div", { className: "infobox", children: ["On mixed pallet ", info.mixed, ". It moves with it; take it off on the freezer map to make a new package from it or merge it."] }), info.load && _jsxs("div", { className: "infobox", children: ["Planned on load ", info.load, ". Take it off the load in Transit to make a new package, merge or remove it."] }), _jsx(PackageActions, { p: p, busy: false, move: p.slot_id != null && !info.mixed ? { label: 'Move', run: () => go(() => c.putAway(p)) } : null, onForm: k => go(() => c.inv.act(p, k)), onLoad: p.status === 'in_freezer' && !info.load && !info.mixed ? () => go(() => c.inv.act(p, 'load')) : null, onRemove: !info.load ? () => go(() => c.inv.act(p, 'remove')) : null, onFlag: c.inv.flag ? why => c.inv.flag(p, why) : null, onClear: c.inv.flag ? () => c.inv.flag(p, null) : null, off: { split: !!r || !!info.mixed || !w(p), merge: !!r || !!info.mixed, addto: !!r || !!info.mixed || !!info.load, remove: !!r || !!h } }), _jsx("p", { className: "muted small-note", children: "Each of these shows what to do in METRC and puts it on the Compliance METRC to-do list." })] }), _jsx(Forecast, { c: c, p: p }), _jsxs("dl", { children: [_jsx("dt", { children: "Where" }), _jsx("dd", { children: c.where(p) }), _jsx("dt", { children: "Weight" }), _jsxs("dd", { children: [n0(w(p)), " lbs", p.og_weight && p.og_weight !== p.current_weight ? _jsxs("span", { className: "muted", children: [" (started ", n0(p.og_weight), ")"] }) : null, p.product === 'wet' || p.product === 'unbucked' ? _jsx("span", { className: "muted", children: " \u00B7 wet, on paper" }) : null] }), _jsx("dt", { children: "METRC tag" }), _jsx("dd", { className: "mono", children: p.package_tag ?? (p.tag_pending ? 'pending' : 'none') }), _jsx("dt", { children: "Crop year" }), _jsx("dd", { children: p.crop_year ?? '' }), _jsx("dt", { children: "Harvested" }), _jsxs("dd", { children: [p.harvest_date ?? '', " ", p.zone ? _jsxs("span", { className: "muted", children: ["\u00B7 ", p.zone] }) : null] }), _jsx("dt", { children: "Grown at" }), _jsx("dd", { children: p.origin_site ?? '' }), _jsx(ItemLotRows, { sb: c.sb, p: p }), _jsx(TestRows, { sb: c.sb, palletId: p.id, flash: c.flash }), p.processor_id ? _jsxs(_Fragment, { children: [_jsx("dt", { children: "Dried by" }), _jsx("dd", { children: c.procName(p.processor_id) })] }) : null, made && _jsxs(_Fragment, { children: [_jsx("dt", { children: "Made in" }), _jsx("dd", { children: _jsx("a", { onClick: () => c.openRun(made), children: made.code }) })] }), usedIn.length > 0 && _jsxs(_Fragment, { children: [_jsx("dt", { children: "Used in" }), _jsx("dd", { children: usedIn.map(x => _jsxs("a", { onClick: () => c.openRun(x), children: [x.code, " "] }, x.id)) })] })] })] });
}
// ---------- Orders: confirmed orders with dry product (Distribution fills them in Fulfillment) ----------
function Orders({ c }) {
    const { d } = c;
    const [all, setAll] = useState(false);
    const byOrder = new Map();
    for (const l of d.lines)
        byOrder.set(l.order_id, [...(byOrder.get(l.order_id) ?? []), l]);
    const orders = [...byOrder.values()].filter(ls => all || ls.some(l => l.picked < l.lbs - 0.01))
        .sort((a, b) => (a[0].wanted ?? '9999').localeCompare(b[0].wanted ?? '9999') || (a[0].so ?? '').localeCompare(b[0].so ?? ''));
    return (_jsxs("div", { className: "list", children: [_jsxs("div", { className: "row between wrap toolbar", children: [_jsx("h2", { children: "Orders" }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: all, onChange: e => setAll(e.target.checked) }), " Show filled orders too"] })] }), _jsx("p", { className: "muted", children: "Confirmed orders with dry product (bucked, standards, smalls, trim). Distribution fills them from inventory in Fulfillment, the same as fresh frozen." }), !orders.length ? _jsx("p", { className: "muted", children: "No confirmed orders waiting on dry product." }) : _jsx("div", { className: "dlist", children: orders.map(ls => {
                    const o = ls[0];
                    return _jsxs("section", { className: "dcard ordcard", children: [_jsxs("div", { className: "dcard-h", children: [_jsxs("h3", { children: [o.so ?? 'Order', " ", _jsx("span", { className: "muted", children: o.customer })] }), _jsxs("span", { className: "muted", children: [o.wanted ? `wanted ${fmtD(o.wanted)}` : '', o.on_load ? ' · on a load' : ''] })] }), _jsx("div", { className: "dlist", children: ls.map(l => {
                                    const f = (() => { const have = sum(d.pallets.filter(p => p.product === l.product && live(p) && canon(p.strain) === canon(l.strain) && !c.heldFor(p.id)).map(w)); return have; })();
                                    return _jsxs("div", { className: "drow", children: [_jsxs("span", { className: "grow", children: [_jsx("b", { children: l.strain }), " ", _jsx(Prod, { p: l.product }), " ", _jsx("span", { className: "muted", children: l.crop_year })] }), _jsxs("span", { className: "muted small", children: [n0(f), " lbs free in inventory"] }), _jsxs("b", { className: l.picked >= l.lbs - 0.01 ? 'ok-t' : '', children: [n0(l.picked), " / ", n0(l.lbs), " lbs"] })] }, l.id);
                                }) })] }, o.order_id);
                }) })] }));
}
// ---------- Yields ----------
function Yields({ c }) {
    const [hist, setHist] = useState([]);
    const [labor, setLabor] = useState([]);
    useEffect(() => { c.api.history().then(setHist).catch(() => { }); }, []);
    const years = [...new Set([...c.d.runs.map(r => r.crop_year), ...c.d.pallets.map(p => p.crop_year), ...hist.map(h => h.crop_year)].filter((x) => !!x))].sort((a, b) => b - a);
    const [yr, setYr] = useState(years[0] ?? new Date().getFullYear());
    const [rows, setRows] = useState(null);
    useEffect(() => { setRows(null); c.api.yields(yr).then(setRows).catch(e => c.flash(errText(e), true)); c.api.labor(yr).then(setLabor); }, [yr]);
    // FL25 and other workbook years: from the history table when there are no runs for that strain and year
    const all = [...(rows ?? [])];
    for (const h of hist.filter(h => h.crop_year === yr)) {
        if (all.some(y => canon(y.strain) === canon(h.strain) && (y.bucked_in || y.trim_in)))
            continue;
        const ti = h.standards + h.smalls + h.trim_lbs + h.trim_mold;
        const wet = Number(h.wet_lbs ?? 0);
        all.push({ strain: h.strain, crop_year: h.crop_year, wet_lbs: wet, bucked_in: wet || h.bucked + h.buck_trim + h.buck_mold, bucked: h.bucked, buck_trim: h.buck_trim, buck_mold: h.buck_mold,
            moisture: wet ? wet - h.bucked - h.buck_trim - h.buck_mold : 0,
            trim_in: ti, standards: h.standards, smalls: h.smalls, trim_lbs: h.trim_lbs, trim_mold: h.trim_mold, trim_loss: 0, buck_runs: 0, trim_runs: 0, src: h.source });
    }
    all.sort((a, b) => a.strain.localeCompare(b.strain));
    const cost = (strain, task) => {
        const x = labor.filter(l => canon(l.strain) === canon(strain) && l.task === task);
        const lbs = sum(x.map(l => l.lbs)), pay = sum(x.map(l => l.pay));
        return lbs ? { per: pay / lbs, pay } : null;
    };
    const $ = (x) => x ? _jsxs(_Fragment, { children: ["$", x.per.toFixed(2), _jsxs("div", { className: "muted small", children: ["$", n0(x.pay)] })] }) : '';
    const z = (v) => (v ? n0(v) : '');
    const row = (y) => {
        const wetKnown = y.wet_lbs > 0;
        return _jsxs("tr", { children: [_jsxs("td", { children: [y.strain, y.src && _jsx("div", { className: "muted small", children: y.src })] }), _jsx("td", { className: "num", children: wetKnown ? z(y.wet_lbs) : '' }), _jsxs("td", { className: "num", children: [z(y.bucked), " ", _jsx("span", { className: "muted", children: wetKnown ? pct(y.bucked, y.bucked_in) : '' })] }), _jsx("td", { className: "num", children: z(y.buck_trim) }), _jsx("td", { className: "num hide-s", children: z(y.buck_mold) }), _jsx("td", { className: "num hide-s", children: wetKnown ? pct(y.moisture, y.bucked_in) : '' }), _jsxs("td", { className: "num", children: [z(y.standards), " ", _jsx("span", { className: "muted", children: pct(y.standards, y.trim_in) })] }), _jsxs("td", { className: "num", children: [z(y.smalls), " ", _jsx("span", { className: "muted", children: pct(y.smalls, y.trim_in) })] }), _jsxs("td", { className: "num", children: [z(y.trim_lbs), " ", _jsx("span", { className: "muted", children: pct(y.trim_lbs, y.trim_in) })] }), _jsxs("td", { className: "num hide-s", children: [z(y.trim_mold), " ", _jsx("span", { className: "muted", children: pct(y.trim_mold, y.trim_in) })] }), _jsx("td", { className: "num", children: _jsx("b", { children: wetKnown && y.bucked_in ? pct(y.bucked + y.buck_trim, y.bucked_in) : '' }) }), _jsx("td", { className: "num", children: $(cost(y.strain, 'buck')) }), _jsx("td", { className: "num", children: $(cost(y.strain, 'trim')) })] }, y.strain);
    };
    return (_jsxs("div", { className: "list wide", children: [_jsxs("div", { className: "row between wrap toolbar", children: [_jsx("h2", { children: "Yields" }), _jsx("div", { className: "seg", children: (years.length ? years : [new Date().getFullYear()]).map(y => _jsx("button", { className: yr === y ? 'on' : '', onClick: () => setYr(y), children: y }, y)) })] }), _jsx("p", { className: "muted", children: "Per strain and crop year, from finished runs (and the FL25 workbook). Bucking % are of the wet weight in; trimming % are of the bucked lbs in. Return from raw = bucked flower + buck trim as a share of the wet weight that was bucked. Labor $/lb = piece pay \u00F7 flower lbs from the crew logs. These numbers drive the forecasts." }), !rows ? _jsx("p", { className: "muted", children: "Loading\u2026" }) : !all.length ? _jsxs("p", { className: "muted", children: ["Nothing finished for ", yr, " yet."] }) : _jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Strain" }), _jsx("th", { className: "num", children: "Wet" }), _jsx("th", { className: "num", children: "Bucked" }), _jsx("th", { className: "num", children: "Buck trim" }), _jsx("th", { className: "num hide-s", children: "Buck mold" }), _jsx("th", { className: "num hide-s", children: "Moisture" }), _jsx("th", { className: "num", children: "Standards" }), _jsx("th", { className: "num", children: "Smalls" }), _jsx("th", { className: "num", children: "Trim" }), _jsx("th", { className: "num hide-s", children: "Trim mold" }), _jsx("th", { className: "num", children: "Return from raw" }), _jsx("th", { className: "num", children: "Bucking $/lb" }), _jsx("th", { className: "num", children: "Trimming $/lb" })] }) }), _jsx("tbody", { children: all.map(row) })] }) })] }));
}
// ---------- Review ----------
function Review({ c, go }) {
    const { d } = c;
    const spot = d.pallets.filter(p => p.status === 'unslotted');
    const pend = d.pallets.filter(p => live(p) && p.tag_pending);
    const longOut = d.pallets.filter(p => p.status === 'at_processor' && p.sent_on && days(p.sent_on, today()) > 21);
    const oldRuns = d.runs.filter(r => r.status === 'open' && days(r.started_on, today()) > 7);
    const toPack = toPackage(d);
    const none = !spot.length && !pend.length && !longOut.length && !oldRuns.length && !toPack.length;
    return (_jsxs("div", { className: "list", children: [_jsx("h2", { children: "Review" }), none && _jsx("p", { className: "muted", children: "Nothing to look at. Everything's packaged, tagged and put away." }), spot.length > 0 && _jsxs(Fold, { id: "proc.spot", open: true, title: "Needs a spot", count: spot.length, children: [_jsx("p", { className: "muted", children: "Put these in a reefer trailer." }), _jsx(PkgTable, { c: c, rows: spot, showProduct: true, extra: p => c.canEdit ? _jsx("button", { className: "ghost small", onClick: e => { e.stopPropagation(); c.putAway(p); }, children: "Put in a trailer" }) : null })] }), pend.length > 0 && _jsxs(Fold, { id: "proc.pend", open: true, title: "METRC tag pending", count: pend.length, children: [_jsx("p", { className: "muted", children: "Open the package on the map and tap Enter tag." }), _jsx(PkgTable, { c: c, rows: pend, showProduct: true })] }), toPack.length > 0 && _jsx(Fold, { id: "proc.pack", open: true, title: "Dry harvests with no wet package", count: toPack.length, right: _jsx("button", { className: "linkbtn", onClick: () => go('incoming'), children: "Drying \u203A" }), children: _jsx("div", { className: "dlist", children: toPack.map(h => _jsxs("div", { className: "drow", children: [_jsxs("span", { className: "grow", children: [h.strain, " ", _jsxs("span", { className: "muted", children: [h.site, " ", h.field ?? ''] })] }), _jsx("span", { className: "muted", children: fmtD(h.harvested_on ?? h.planned_on) }), _jsxs("b", { children: [n0(h.raw_lbs), " lbs"] })] }, h.id)) }) }), longOut.length > 0 && _jsx(Fold, { id: "proc.out", open: true, title: "Out at a processor over 3 weeks", count: longOut.length, children: _jsx(PkgTable, { c: c, rows: longOut }) }), oldRuns.length > 0 && _jsx(Fold, { id: "proc.runs", open: true, title: "Runs open over a week", count: oldRuns.length, children: _jsx("div", { className: "dlist", children: oldRuns.map(r => _jsxs("button", { className: "drow linkrow", onClick: () => c.openRun(r), children: [_jsxs("span", { className: "grow", children: [_jsx("b", { children: r.code }), " ", KIND[r.kind], " \u00B7 ", r.strain] }), _jsxs("span", { className: "muted", children: ["since ", fmtD(r.started_on)] })] }, r.id)) }) })] }));
}
// ---------- Settings ----------
function SettingsTab({ c, sb }) {
    const [ed, setEd] = useState(null);
    const [busy, setBusy] = useState(false);
    async function save() {
        setBusy(true);
        try {
            await c.api.saveProcessor(ed);
            c.flash('Processor saved');
            await c.reload();
            setEd(null);
        }
        catch (e) {
            c.flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs("div", { className: "list", children: [_jsx("h2", { children: "Processing settings" }), _jsxs(Fold, { id: "proc.set.procs", open: true, title: "Processors", count: c.d.processors.length, right: _jsx("button", { className: "ghost small", onClick: () => setEd({ active: true, in_house: false }), children: "+ Add" }), children: [_jsx("p", { className: "muted", children: "Where dry flower gets dried. License, address and contact go on the manifest sheet. \"In house\" is our own trailers (no transfer)." }), _jsx("div", { className: "dlist", children: c.d.processors.map(p => _jsxs("button", { className: "drow linkrow", onClick: () => setEd(p), children: [_jsxs("span", { className: "grow", children: [_jsx("b", { children: p.name }), " ", _jsxs("span", { className: "muted", children: [p.short ?? '', p.in_house ? ' · in house' : '', p.license ? ` · ${p.license}` : ' · no license on file'] })] }), !p.active && _jsx("span", { className: "muted", children: "off" })] }, p.id)) })] }), _jsx(DryDefault, { c: c }), _jsx(Fold, { id: "proc.set.tags", title: "METRC tags", children: _jsx("p", { className: "muted", children: "\"Fill next tags\" on a run uses the \"Processing packages\" tag range for the site (Admin \u203A Settings \u203A Licenses, on the GVR processor license). Without one, scan or type the tags, or leave them pending." }) }), _jsx(Fold, { id: "proc.set.vehicles", title: "Vehicles and equipment", children: _jsx(CompFleet, { sb: sb, flash: c.flash, dept: "processing" }) }), _jsx(Fold, { id: "proc.set.people", title: "People", children: _jsx(ModulePeople, { sb: sb, module: "processing", flash: c.flash }) }), ed && _jsxs(Sheet, { title: ed.id ? ed.name : 'New processor', onClose: () => setEd(null), children: [_jsx(F, { label: "Name", children: _jsx(TextIn, { value: ed.name, onChange: v => setEd({ ...ed, name: v ?? '' }) }) }), _jsxs("div", { className: "grid2", children: [_jsx(F, { label: "Short name", children: _jsx(TextIn, { value: ed.short, onChange: v => setEd({ ...ed, short: v }) }) }), _jsx(F, { label: "License", children: _jsx(TextIn, { value: ed.license, onChange: v => setEd({ ...ed, license: v }) }) })] }), _jsx(F, { label: "Address", children: _jsx(TextIn, { value: ed.address, onChange: v => setEd({ ...ed, address: v }) }) }), _jsxs("div", { className: "grid2", children: [_jsx(F, { label: "Contact", children: _jsx(TextIn, { value: ed.contact, onChange: v => setEd({ ...ed, contact: v }) }) }), _jsx(F, { label: "Phone", children: _jsx(TextIn, { value: ed.phone, onChange: v => setEd({ ...ed, phone: v }) }) })] }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: !!ed.in_house, onChange: e => setEd({ ...ed, in_house: e.target.checked }) }), " In house (our own trailers)"] }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: ed.active !== false, onChange: e => setEd({ ...ed, active: e.target.checked }) }), " Active"] }), _jsx(F, { label: "Notes", children: _jsx(TextIn, { value: ed.notes, onChange: v => setEd({ ...ed, notes: v }) }) }), _jsx(SaveBar, { busy: busy, onCancel: () => setEd(null), onSave: save, disabled: !ed.name })] })] }));
}
function DryDefault({ c }) {
    const [v, setV] = useState(Math.round((c.d.rates.default_dry ?? 0.2) * 1000) / 10);
    const [busy, setBusy] = useState(false);
    const save = async () => { setBusy(true); try {
        await c.api.setDryDefault((v ?? 0) / 100);
        c.flash('Saved');
        await c.reload();
    }
    catch (e) {
        c.flash(errText(e), true);
    }
    finally {
        setBusy(false);
    } };
    return _jsxs(Fold, { id: "proc.set.fc", title: "Forecasts", children: [_jsx("p", { className: "muted", children: "Forecasts use each strain's own finished runs and the FL25 workbook first, then all strains together. Until there are bucking runs, wet to bucked uses this default." }), _jsxs("div", { className: "row", children: [_jsx(F, { label: "Wet to bucked (%)", children: _jsx(NumIn, { value: v, onChange: setV }) }), _jsx("button", { className: "ghost", disabled: busy || !v, onClick: save, children: "Save" })] })] });
}
