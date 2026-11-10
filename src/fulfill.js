import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { tagTxt } from './mtag';
import { Select } from './combo';
import { TagInput } from './taginput';
import { ScanButton } from './scan';
import { useBack, scrollTop } from './nav';
import { sameTag, useScanHandler } from './scanroute';
import { useEffect, useMemo, useState } from 'react';
import { StageAlerts, StageForm, useStages } from './stage';
import { Meter } from './dash';
import { PRODUCT_LABEL } from './types';
import { PlanMyPick } from './pickplanui';
const n0 = (x) => Math.round(Number(x)).toLocaleString();
const fmt = (s) => s ? new Date(s + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// on a customer pickup (P- load, 089): the customer comes to get it with their own driver and truck
const isPk = (o) => o.stop?.load_kind === 'pickup' || !!o.stop?.load?.startsWith('P-');
export const STATE_LABEL = { open: 'Needs pallets', needs_ok: 'Waiting on Sales', ready: 'Ready to load', loaded: 'On a load', shipped: 'Shipped', cancelled: 'Cancelled', submitted: 'Not confirmed', draft: 'Draft' };
const GROUPS = ['open', 'needs_ok', 'ready', 'loaded', 'shipped'];
/** PICK-2: pallets already assigned to these orders that are still sitting in a freezer (not Staging): they're on the pull route too */
export function heldInFreezers(os, pal, loc) {
    const get = typeof pal === 'function' ? pal : (id) => pal.get(id);
    const out = [];
    const byTop = new Map();
    for (const o of os)
        for (const l of o.lines)
            for (const pk of l.picks) {
                const pk0 = get(pk.pallet_id);
                const p = pk0?.container_id ? get(pk0.container_id) : pk0; // a package on a mixed pallet: pull the mixed pallet once
                if (!p || p.status !== 'in_freezer')
                    continue;
                const L = loc(p);
                if (L.fz == null || L.staging)
                    continue;
                const had = byTop.get(p.id);
                if (had)
                    had.lbs += Number(pk.lbs);
                else {
                    const r = { lineId: l.id, pallet: p, lbs: Number(pk.lbs), whole: true, held: true };
                    byTop.set(p.id, r);
                    out.push(r);
                }
            }
    return out;
}
/** PICK-5: folding long orders and big mixed pallets. Phones only for now; flip these to fold on computers too (Aziz decides from the prototype). */
const FOLD_ON_COMPUTERS = false;
function useNarrow() {
    const q = '(max-width: 640px)';
    const [n, setN] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(q).matches);
    useEffect(() => { const m = window.matchMedia?.(q); if (!m)
        return; const f = () => setN(m.matches); m.addEventListener?.('change', f); return () => m.removeEventListener?.('change', f); }, []);
    return n;
}
const got = (l) => l.picks.reduce((a, p) => a + Number(p.lbs), 0);
export const orderLbs = (o) => o.lines.reduce((a, l) => a + Number(l.lbs), 0);
export const orderGot = (o) => o.lines.reduce((a, l) => a + got(l), 0);
/** Distribution > Fulfillment: confirmed orders get pallets, then go on a load */
export function FulfillView(props) {
    const { orders } = props;
    const [ownId, setOwnId] = useState(null);
    const openId = props.setOpenId ? (props.openId ?? null) : ownId;
    const setOpenId = props.setOpenId ?? setOwnId;
    const [q, setQ] = useState('');
    const [allShipped, setAllShipped] = useState(false);
    useBack(openId != null, () => setOpenId(null));
    const stage = useStages(props.backend.client());
    if (props.err)
        return _jsxs("div", { className: "list fulfill", children: [_jsx("h2", { children: "Fulfillment" }), _jsx("div", { className: "warnbox", children: props.err })] });
    if (!orders)
        return _jsx("p", { className: "muted", children: "Loading\u2026" });
    const cur = orders.find(o => o.id === openId);
    if (cur)
        return _jsx(OrderPage, { ...props, o: cur, back: () => setOpenId(null), stage: stage });
    const ql = q.trim().toLowerCase();
    const shown = orders.filter(o => !ql || `${o.customer} ${o.so ?? ''} ${o.po ?? ''} ${o.lines.map(l => l.strain).join(' ')}`.toLowerCase().includes(ql));
    return (_jsxs("div", { className: "list fulfill", children: [_jsx("h2", { children: "Fulfillment" }), _jsx("p", { className: "muted", children: "Confirmed orders. Assign pallets to each line, then put the order on a load. Pallets you assign are held for that customer." }), _jsx(StageAlerts, { sb: props.backend.client(), stages: stage.stages, refresh: stage.refresh, flash: props.flash, openLoad: props.openLoad, onChanged: props.reload }), _jsx("div", { className: "row toolbar", children: _jsx("input", { className: "search", type: "search", placeholder: "Customer, SO # or strain", value: q, onChange: e => setQ(e.target.value) }) }), !shown.length && _jsx("p", { className: "muted", children: "No open orders." }), GROUPS.map(g => {
                const all = shown.filter(o => o.state === g);
                if (!all.length)
                    return null;
                // shipped: newest first; 10 unless searching or "Show all"
                if (g === 'shipped')
                    all.sort((a, b) => (b.shipped_date ?? b.order_date ?? '').localeCompare(a.shipped_date ?? a.order_date ?? '') || b.id - a.id);
                const cut = g === 'shipped' && !ql && !allShipped && all.length > 10;
                const os = cut ? all.slice(0, 10) : all;
                return (_jsxs("section", { children: [_jsxs("h3", { className: "grouph", children: [STATE_LABEL[g], " ", _jsx("span", { className: "muted", children: all.length })] }), _jsx("div", { className: "cwrap settable-w fwrap", children: _jsxs("table", { className: "ctable settable ftable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: "pin", children: "Customer" }), _jsx("th", { children: "Order" }), _jsx("th", { className: "num", children: "Strains" }), _jsx("th", { className: "num", children: "Lbs" }), (g === 'open' || g === 'needs_ok') && _jsx("th", { children: "Picked" }), _jsx("th", { children: g === 'shipped' ? 'Shipped' : 'Requested' }), _jsx("th", { children: "Load" }), _jsx("th", { children: "Status" })] }) }), _jsx("tbody", { children: os.map(o => {
                                            const want = orderLbs(o), have = orderGot(o);
                                            const late = o.wanted_date && o.wanted_date < today() && (g === 'open' || g === 'needs_ok' || g === 'ready');
                                            return (_jsxs("tr", { className: "tap", tabIndex: 0, onClick: () => { setOpenId(o.id); scrollTop(); }, onKeyDown: e => { if (e.key === 'Enter') {
                                                    setOpenId(o.id);
                                                    scrollTop();
                                                } }, children: [_jsx("td", { className: "pin", children: _jsx("b", { children: o.customer }) }), _jsxs("td", { children: [o.so ?? `Order #${o.id}`, o.source === 'portal' ? _jsx("span", { className: "muted", children: " \u00B7 portal" }) : o.source === 'roshi' ? _jsx("span", { className: "muted", children: " \u00B7 Roshi" }) : o.source === 'qbo' ? _jsx("span", { className: "muted", children: " \u00B7 QuickBooks" }) : ''] }), _jsx("td", { className: "num", children: o.lines.length }), _jsx("td", { className: "num", children: _jsx("b", { children: n0(want) }) }), (g === 'open' || g === 'needs_ok') && _jsxs("td", { className: "fmeter", children: [_jsx(Meter, { value: have, max: want, tone: have > 0 ? 'ok' : undefined }), _jsxs("span", { className: "muted small", children: [n0(have), " lbs"] })] }), _jsx("td", { children: g === 'shipped' ? (o.shipped_date ? fmt(o.shipped_date) : _jsx("span", { className: "muted", children: "\u2014" })) : o.wanted_date ? _jsx("span", { className: late ? 'bad-t' : '', children: fmt(o.wanted_date) }) : o.order_date ? _jsxs("span", { className: "muted", children: ["ordered ", fmt(o.order_date)] }) : _jsx("span", { className: "muted", children: "\u2014" }) }), _jsx("td", { children: o.stop ? _jsxs(_Fragment, { children: [o.stop.load, " ", _jsx("span", { className: "muted", children: fmt(o.stop.load_date) })] }) : _jsx("span", { className: "muted", children: "\u2014" }) }), _jsx("td", { children: _jsx("span", { className: `pill fs-${g === 'loaded' && o.fill && o.fill !== 'ready' ? o.fill : g}`, children: g === 'open' && have > 0 ? `${Math.round(have / want * 100)}%`
                                                                : g === 'loaded' && o.fill && o.fill !== 'ready' ? `${isPk(o) ? 'Pickup' : 'On a load'} · ${o.fill === 'open' ? 'needs pallets' : 'needs OK'}`
                                                                    : g === 'loaded' && isPk(o) ? 'Customer pickup'
                                                                        : g === 'shipped' && o.stop?.stop_status === 'delivered' ? 'Delivered' : STATE_LABEL[g] }) })] }, o.id));
                                        }) })] }) }), _jsx("div", { className: "fcards", children: os.map(o => {
                                const want = orderLbs(o), have = orderGot(o);
                                const late = o.wanted_date && o.wanted_date < today() && (g === 'open' || g === 'needs_ok' || g === 'ready');
                                const when = g === 'shipped' ? (o.shipped_date ? `Shipped ${fmt(o.shipped_date)}` : '') : o.wanted_date ? `Wanted ${fmt(o.wanted_date)}` : o.order_date ? `Ordered ${fmt(o.order_date)}` : '';
                                return (_jsxs("button", { className: "fcard", onClick: () => { setOpenId(o.id); scrollTop(); }, children: [_jsxs("span", { className: "fcard-top", children: [_jsx("b", { children: o.customer }), _jsx("span", { className: `pill fs-${g === 'loaded' && o.fill && o.fill !== 'ready' ? o.fill : g}`, children: g === 'open' && have > 0 ? `${Math.round(have / want * 100)}%`
                                                        : g === 'loaded' && o.fill && o.fill !== 'ready' ? (o.fill === 'open' ? 'Needs pallets' : 'Needs OK')
                                                            : g === 'loaded' && isPk(o) ? 'Pickup'
                                                                : g === 'shipped' && o.stop?.stop_status === 'delivered' ? 'Delivered' : STATE_LABEL[g] })] }), _jsxs("span", { className: "muted small", children: [o.so ?? `Order #${o.id}`, " \u00B7 ", o.lines.length, " strain", o.lines.length === 1 ? '' : 's', " \u00B7 ", _jsxs("b", { children: [n0(want), " lbs"] })] }), (g === 'open' || g === 'needs_ok') && _jsxs("span", { className: "fcard-m", children: [_jsx(Meter, { value: have, max: want, tone: have > 0 ? 'ok' : undefined }), _jsxs("span", { className: "muted small", children: [n0(have), " picked"] })] }), (when || o.stop) && _jsxs("span", { className: "small", children: [_jsx("span", { className: late ? 'bad-t' : 'muted', children: when }), o.stop ? _jsxs("span", { className: "muted", children: [when ? ' · ' : '', o.stop.load, " ", fmt(o.stop.load_date)] }) : null] })] }, o.id));
                            }) }), cut && _jsxs("button", { className: "ghost small", onClick: () => setAllShipped(true), children: ["Show all ", all.length, " shipped"] })] }, g));
            })] }));
}
function OrderPage({ o, back, backend, reload, flash, pallets, heldBy, onLoad, inRun, where, siteOf, rank, canon, loc, loads, vehicles, isSales, openLoad, openPallet, stops, customers, drivers, stage }) {
    const [adding, setAdding] = useState(null);
    const [busy, setBusy] = useState(false);
    const [loadPick, setLoadPick] = useState(false);
    const [sendTo, setSendTo] = useState(null);
    const [staging, setStaging] = useState(false);
    const [combine, setCombine] = useState(null);
    const [packSel, setPackSel] = useState([]);
    const [scanRes, setScanRes] = useState(null);
    const [planning, setPlanning] = useState(false);
    const [showFilled, setShowFilled] = useState(false); // PICK-5
    const [openMix, setOpenMix] = useState([]); // PICK-5
    const narrow = useNarrow();
    // on a load that hasn't left: still editable (it can only leave once it's complete and OK'd)
    const onOpenLoad = o.state === 'loaded' && !!o.stop && ['planning', 'loading'].includes(o.stop.load_status);
    const fill = o.state === 'loaded' ? (o.fill ?? 'ready') : o.state;
    const editable = o.state === 'open' || o.state === 'needs_ok' || o.state === 'ready' || onOpenLoad;
    const run = async (f, ok) => {
        setBusy(true);
        try {
            await f();
            await reload();
            flash(ok);
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
        finally {
            setBusy(false);
        }
    };
    // Scan on this page: the pallet goes to the line it matches (same strain and product), or says why it can't
    const assign = (l, p) => {
        const over = Number(p.current_weight ?? 0) - Math.max(0, Number(l.lbs) - got(l));
        return run(() => backend.pickPallet(l.id, p.id), `${p.code} assigned to ${l.strain}${over > 0.5 ? ` (${n0(over)} lbs over)` : ''}`);
    };
    useScanHandler(editable ? tag => {
        const p = pallets.find(x => sameTag(x.package_tag, tag));
        if (!p)
            return false;
        if (o.lines.some(l => l.picks.some(pk => pk.pallet_id === p.id))) {
            flash(`${p.code} is already on this order`);
            return true;
        }
        const prod = (x) => x.product ?? 'fresh_frozen';
        const sameYear = (l) => p.crop_year == null || l.crop_year == null || p.crop_year === l.crop_year;
        const fits = o.lines.filter(l => !l.cant_fill && canon(l.strain) === canon(p.strain) && prod(l) === prod(p) && sameYear(l));
        const line = fits.find(l => got(l) < Number(l.lbs)) ?? fits[0];
        const other = heldBy.get(p.id);
        const why = other ? `Held for ${other.customer} · ${other.so ?? 'another order'}. Unassign it there first.`
            : !line && o.lines.some(l => canon(l.strain) === canon(p.strain) && prod(l) === prod(p)) ? `Wrong crop year: ${p.code} is ${p.crop_year} crop, the ${p.strain} line wants ${o.lines.filter(l => canon(l.strain) === canon(p.strain)).map(l => l.crop_year).join(' / ')}.`
                : !line ? (o.lines.some(l => canon(l.strain) === canon(p.strain))
                    ? `Wrong product: this is ${PRODUCT_LABEL[prod(p)] ?? prod(p)}, and the ${p.strain} line wants ${o.lines.filter(l => canon(l.strain) === canon(p.strain)).map(l => PRODUCT_LABEL[prod(l)]).join(' or ')}.`
                    : `Wrong strain: ${p.strain ?? 'this pallet has no strain'}${p.strain ? " isn't on this order" : ''}. This order is ${[...new Set(o.lines.map(l => l.strain))].join(', ')}.`)
                    : p.kind === 'mixed' ? 'This is a mixed pallet. Scan the tag on the package you want instead.'
                        : p.container_id && pallets.some(x => x.container_id === p.container_id && x.id !== p.id && heldBy.get(x.id)?.customer_id !== o.customer_id)
                            ? `This package is on ${pallets.find(x => x.id === p.container_id)?.code ?? 'a mixed pallet'} with packages that aren't for ${o.customer}. Take it off on the freezer map first.`
                            : onLoad(p.id) ? 'Already on a load.'
                                : inRun?.(p.id) ? `In a processing run (${inRun(p.id)}).`
                                    : p.status !== 'in_freezer' && p.status !== 'unslotted' ? `Not in a freezer: ${where(p)}.`
                                        : p.pushed === false ? "Logged at harvest, not a METRC package yet."
                                            : !(Number(p.current_weight) > 0) ? 'No weight on it. Fix the weight first.'
                                                : null;
        if (why) {
            setScanRes({ p, msg: why });
            return true;
        }
        const need = Math.max(0, Number(line.lbs) - got(line)), w = Number(p.current_weight);
        if (need > 0 && w > need + 0.5) {
            setScanRes({ p, line, msg: `${p.code} has ${n0(w)} lbs and the ${line.strain} line needs ${n0(need)} more. Assign the whole pallet, or take part of it.` });
            return true;
        }
        assign(line, p);
        return true;
    } : null);
    const freeFor = (l) => pallets.filter(p => (p.status === 'in_freezer' || p.status === 'unslotted') && p.pushed !== false && !p.container_id && p.kind !== 'mixed' && (p.current_weight ?? 0) > 0
        && canon(p.strain) === canon(l.strain) && (p.product ?? 'fresh_frozen') === (l.product ?? 'fresh_frozen')
        && (p.crop_year == null || l.crop_year == null || p.crop_year === l.crop_year) && !heldBy.has(p.id) && !onLoad(p.id) && !inRun?.(p.id));
    const pal = useMemo(() => new Map(pallets.map(p => [p.id, p])), [pallets]);
    // where this order's pallets are right now (OHR / GVR / on a truck)
    const at = new Map();
    for (const l of o.lines)
        for (const pk of l.picks) {
            const p = pal.get(pk.pallet_id);
            const s = p ? (p.status === 'in_transit' ? 'truck' : siteOf(p) ?? '?') : '?';
            at.set(s, (at.get(s) ?? 0) + 1);
        }
    const sites = [...at.keys()].filter(s => s === 'OHR' || s === 'GVR').sort();
    const moving = o.state !== 'shipped' && o.state !== 'loaded';
    // PICK-2: freezers this order already uses (for the notes on + Assign pallets)
    const orderFz = new Set(loc ? o.lines.flatMap(l => l.picks.map(pk => pal.get(pk.pallet_id))).filter((p) => !!p && p.status === 'in_freezer').map(p => loc(p).fz) : []);
    const needs = o.lines.some(l => !l.cant_fill && Number(l.lbs) - got(l) > 5);
    const toPull = loc ? heldInFreezers([o], pal, loc).length : 0;
    const planBar = needs || toPull > 0;
    if (planning && loc)
        return _jsx(PlanMyPick, { orders: [o], cands: freeFor, loc: loc, pallet: id => pal.get(id), contents: id => pallets.filter(p => p.container_id === id), backend: backend, reload: reload, flash: flash, back: () => { setPlanning(false); scrollTop(); }, title: "Plan my pick", sub: o.customer, backLabel: o.so ?? `Order #${o.id}`, walkKey: `pmp-walk:o${o.id}`, held: heldInFreezers([o], pal, loc) });
    return (_jsxs("div", { className: "list fulfill", children: [_jsx("button", { className: "ghost small", onClick: back, children: "\u2039 Fulfillment" }), _jsxs("h2", { children: [o.customer, " ", _jsx("span", { className: "muted", children: o.so ?? `Order #${o.id}` })] }), _jsxs("div", { className: "row wrap", children: [_jsx("span", { className: `pill fs-${o.state}`, children: STATE_LABEL[o.state] }), _jsx("span", { className: "muted", children: [o.po && `PO ${o.po}`, o.order_date && `ordered ${fmt(o.order_date)}`, o.wanted_date && `requested delivery ${fmt(o.wanted_date)}`, o.source === 'roshi' ? 'from Roshi' : o.source === 'portal' ? 'from the portal' : o.source === 'qbo' ? 'from QuickBooks' : ''].filter(Boolean).join(' · ') })] }), o.state === 'shipped' && _jsxs("div", { className: "okbox shipline-top", children: ["Shipped ", fmt(o.shipped_date), o.stop ? ` on ${o.stop.load}` : '', o.stop?.stop_status === 'delivered' ? ' · Delivered' : '', (o.stop?.manifest || o.inv_manifest) ? ` · METRC manifest ${o.stop?.manifest || o.inv_manifest}` : '', o.inv ? ` · invoice ${o.inv}` : '', "."] }), o.notes && _jsxs("p", { className: "muted", children: ["\"", o.notes, "\""] }), editable && loc && planBar && _jsxs("div", { className: "pmp-bar", children: [_jsxs("div", { className: "grow", children: [_jsx("b", { children: !needs ? `${toPull} assigned pallet${toPull === 1 ? '' : 's'} still in freezers` : orderGot(o) > 0 ? 'Still needs pallets' : 'Nothing picked yet' }), _jsx("div", { className: "small", children: needs ? 'Let the app find the rest in as few freezers as it can.' : 'Walk the route to pull them, door to back.' })] }), _jsx("button", { className: "primary", onClick: () => { setPlanning(true); scrollTop(); }, children: needs ? 'Plan my pick ›' : 'Pull route ›' })] }), editable && _jsx("p", { className: "muted small-note scanhint", children: "Tap Scan and scan a pallet's tag to assign it to the line it matches." }), scanRes && (_jsx("div", { className: "scrim", onClick: () => setScanRes(null), children: _jsxs("div", { className: "sheet scanpick", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsxs("div", { children: [_jsx("h2", { children: scanRes.p.code }), _jsxs("div", { className: "muted", children: [scanRes.p.strain ?? 'No strain', " \u00B7 ", n0(Number(scanRes.p.current_weight ?? 0)), " lbs \u00B7 ", where(scanRes.p)] })] }), _jsx("button", { className: "ghost", onClick: () => setScanRes(null), children: "\u2715" })] }), _jsx("div", { className: scanRes.line ? 'okbox' : 'warnbox', children: scanRes.msg }), _jsxs("div", { className: "row end wrap", children: [_jsx("button", { className: "ghost", onClick: () => { setScanRes(null); openPallet(scanRes.p.id); }, children: "Open pallet" }), scanRes.line && _jsx("button", { className: "ghost", disabled: busy, onClick: () => { setAdding(scanRes.line.id); setScanRes(null); }, children: "Take part" }), scanRes.line && _jsx("button", { className: "primary", disabled: busy, onClick: () => { assign(scanRes.line, scanRes.p); setScanRes(null); }, children: "Assign whole pallet" })] })] }) })), fill === 'needs_ok' && _jsxs("div", { className: "warnbox", children: ["Some lines don't match what was ordered. ", isSales ? 'OK the new amounts below, or change the pallets.' : `Sales has to OK the new amounts before this can ${onOpenLoad ? 'leave' : 'go on a load'}.`, isSales && _jsx("div", { className: "row", style: { marginTop: 8 }, children: _jsx("button", { className: "primary small", disabled: busy, onClick: () => run(() => backend.approveFill(o.id), 'Amounts OK\'d'), children: "OK these amounts" }) })] }), (() => {
                // PICK-5: long orders fold the lines that are already filled into one row (open, short, over and can't-fill lines stay open)
                const filled = (l) => !l.cant_fill && l.picks.length > 0 && Math.abs(got(l) - Number(l.lbs)) <= 0.5 && adding !== l.id;
                const nFilled = o.lines.filter(filled).length;
                const fold = (narrow || FOLD_ON_COMPUTERS) && o.lines.length > 6 && nFilled >= 3;
                return fold ? _jsxs("button", { className: "fold-filled", onClick: () => setShowFilled(v => !v), "aria-expanded": showFilled, children: [_jsxs("span", { children: [_jsxs("b", { className: "ok-t", children: [nFilled, " line", nFilled === 1 ? '' : 's', " filled \u2713"] }), _jsxs("span", { className: "muted", children: [" of ", o.lines.length] })] }), _jsx("span", { className: "linkbtn", children: showFilled ? 'Hide' : 'Show' })] }) : null;
            })(), o.lines.filter(l => {
                const fold = (narrow || FOLD_ON_COMPUTERS) && o.lines.length > 6 && o.lines.filter(x => !x.cant_fill && x.picks.length > 0 && Math.abs(got(x) - Number(x.lbs)) <= 0.5).length >= 3;
                return !fold || showFilled || adding === l.id || !(!l.cant_fill && l.picks.length > 0 && Math.abs(got(l) - Number(l.lbs)) <= 0.5);
            }).map(l => {
                const g = got(l), diff = g - Number(l.lbs);
                return (_jsxs("section", { className: "dcard fline", children: [_jsxs("div", { className: "dcard-h", children: [_jsxs("h3", { children: [l.strain, l.product && l.product !== 'fresh_frozen' ? _jsx("span", { className: "pill prod", children: PRODUCT_LABEL[l.product] }) : null, l.crop_year && l.crop_year !== new Date().getFullYear() ? _jsx("span", { className: "pill old", children: l.crop_year }) : null] }), o.state === 'shipped' && !l.picks.length
                                    ? _jsxs("span", { className: "ok-t", children: [_jsx("b", { children: n0(Number(l.lbs)) }), " lbs shipped"] }) /* history (Roshi / QuickBooks): no pallets were assigned in the app */
                                    : _jsxs("span", { className: g === 0 ? 'muted' : diff === 0 ? 'ok-t' : 'warn-t', children: [_jsx("b", { children: n0(g) }), " of ", n0(Number(l.lbs)), " lbs", l.ordered_lbs != null ? _jsxs("span", { className: "muted", children: [" (ordered ", n0(Number(l.ordered_lbs)), ")"] }) : null, g > 0 && diff !== 0 ? _jsxs("span", { children: [" \u00B7 ", diff > 0 ? `${n0(diff)} over` : `${n0(-diff)} short`] }) : g > 0 ? ' ✓' : ''] })] }), _jsxs("div", { className: "dlist", children: [l.picks.map(pk => {
                                    const p = pal.get(pk.pallet_id);
                                    return (_jsxs("div", { className: "drow", children: [_jsx("button", { className: "linkbtn", onClick: () => openPallet(pk.pallet_id), children: _jsx("b", { children: pk.code }) }), _jsxs("span", { className: "grow muted", children: [p ? where(p) : '', pk.tag ? ` · ${tagTxt(pk.tag)}` : pk.tag_pending ? ' · tag pending' : '', p?.origin_site ? ` · grown at ${p.origin_site}` : ''] }), _jsxs("b", { children: [n0(Number(pk.lbs)), " lbs"] }), editable && !(p?.container_id && pallets.some(x => x.container_id === p.container_id && x.id !== p.id)) && _jsx("button", { className: "ghost small", disabled: busy, title: "Unassign", onClick: () => run(() => backend.unpick(pk.id), `${pk.code} unassigned`), children: "\u2715" })] }, pk.id));
                                }), l.cant_fill && _jsxs("div", { className: "drow", children: [_jsxs("span", { className: "grow warn-t", children: [_jsx("b", { children: "Can't fill." }), " Sales has to OK sending this order without it."] }), editable && _jsx("button", { className: "ghost small", disabled: busy, onClick: () => run(() => backend.cantFill(l.id, false), 'Line back on'), children: "Undo" })] }), editable && !l.cant_fill && adding !== l.id && _jsxs("div", { className: "row", children: [_jsxs("button", { className: "ghost small grow", disabled: busy, onClick: () => setAdding(l.id), children: ["+ ", g ? 'Add another pallet' : 'Assign pallets'] }), _jsx("button", { className: "ghost small", disabled: busy, title: "Pull from several pallets of this strain into one new METRC tag", onClick: () => setCombine(l), children: "Combine into one tag" }), g === 0 && _jsx("button", { className: "ghost small", disabled: busy, onClick: () => run(() => backend.cantFill(l.id, true), `${l.strain} marked can't fill`), children: "Can't fill" })] }), editable && adding === l.id && _jsx(Pick, { line: l, need: Math.max(0, Number(l.lbs) - g), busy: busy, close: () => setAdding(null), cands: freeFor(l), where: where, rank: rank, loc: loc, orderFz: orderFz, onWhole: p => run(() => backend.pickPallet(l.id, p.id), `${p.code} assigned`).then(() => setAdding(null)), onPart: (p, lbs, tag) => run(() => backend.pickPart(l.id, p.id, lbs, tag), `${n0(lbs)} lbs from ${p.code} assigned. Split it when you pull it.`).then(() => setAdding(null)) })] })] }, l.id));
            }), editable && (() => {
                // packing: build mixed pallets from this order's packages (they stay held), or add to one already started for this customer
                const mine = o.lines.flatMap(l => l.picks.map(pk => pal.get(pk.pallet_id))).filter((p) => !!p);
                const loose = mine.filter(p => !p.container_id && (p.status === 'in_freezer' || p.status === 'unslotted'));
                const mixedIds = [...new Set(pallets.filter(x => x.container_id && heldBy.get(x.id)?.customer_id === o.customer_id).map(x => x.container_id))];
                const tops = new Set(mine.map(p => p.container_id ?? p.id)).size;
                if (!mine.length)
                    return null;
                const toggle = (id) => setPackSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
                const sel = packSel.filter(id => loose.some(p => p.id === id));
                const selW = sel.reduce((a, id) => a + Number(pal.get(id)?.current_weight ?? 0), 0);
                const mix = (into) => run(() => backend.orderMixedPallet(o.id, sel, into), into ? `Added to ${pal.get(into)?.code}` : 'Mixed pallet made').then(() => setPackSel([]));
                return _jsxs("section", { className: "dcard pack", children: [_jsxs("div", { className: "row between wrap", children: [_jsx("b", { children: "Pack for the truck" }), _jsxs("span", { className: "muted", children: [tops, " truck position", tops === 1 ? '' : 's'] })] }), mixedIds.map(mid => {
                            const m = pal.get(mid), cs = pallets.filter(x => x.container_id === mid);
                            const others = [...new Set(cs.map(x => heldBy.get(x.id)).filter(h => h && h.id !== o.id).map(h => h.so ?? `order #${h.id}`))];
                            return _jsxs("div", { className: "packm", children: [_jsxs("div", { className: "row between", children: [_jsx("button", { className: "linkbtn", onClick: () => openPallet(mid), children: _jsx("b", { children: m?.code ?? 'Mixed' }) }), _jsxs("span", { className: "muted", children: [cs.length, " pkg", cs.length === 1 ? '' : 's', " \u00B7 ", n0(cs.reduce((a, x) => a + Number(x.current_weight ?? 0), 0)), " lbs", m ? ` · ${where(m)}` : ''] })] }), (narrow || FOLD_ON_COMPUTERS) && cs.length > 4 && !openMix.includes(mid)
                                        ? _jsxs("button", { className: "linkbtn small", onClick: () => setOpenMix(v => [...v, mid]), children: [cs.length, " packages \u00B7 Show"] })
                                        : _jsxs("div", { className: "muted small", children: [cs.map(x => `${x.code} ${x.strain ?? ''}`).join(' · '), (narrow || FOLD_ON_COMPUTERS) && cs.length > 4 && _jsxs(_Fragment, { children: [" ", _jsx("button", { className: "linkbtn small", onClick: () => setOpenMix(v => v.filter(x => x !== mid)), children: "Hide" })] })] }), others.length > 0 && _jsxs("div", { className: "small-note warn-t", children: ["Also carries ", others.join(', '), ": they go on the truck together."] })] }, mid);
                        }), loose.length > 0 && _jsxs(_Fragment, { children: [_jsx("div", { className: "muted small-note", children: loose.length > 1 ? 'Tick packages to put on one mixed pallet (each keeps its own tag).' : 'This package can go on a mixed pallet with this customer\'s other packages.' }), loose.map(p => _jsxs("label", { className: `pick ${sel.includes(p.id) ? 'on' : ''}`, children: [_jsx("input", { type: "checkbox", checked: sel.includes(p.id), onChange: () => toggle(p.id) }), _jsx("b", { children: p.code }), _jsxs("span", { children: [p.strain, " \u00B7 ", n0(Number(p.current_weight ?? 0)), " lbs"] }), _jsx("span", { className: "muted", children: where(p) })] }, p.id)), sel.length > 0 && _jsxs("div", { className: "row wrap", children: [sel.length > 1 && _jsxs("button", { className: "primary small", disabled: busy, onClick: () => mix(null), children: ["Build mixed pallet (", sel.length, " \u00B7 ", n0(selW), " lbs)"] }), mixedIds.map(mid => _jsxs("button", { className: "ghost small", disabled: busy, onClick: () => mix(mid), children: ["Add to ", pal.get(mid)?.code] }, mid))] }), sel.length > 1 && _jsx("p", { className: "muted small-note", children: "The mixed pallet goes in the slot of the first ticked one that's in a freezer (stacked), or waits on Needs a spot if none are. Move it on the freezer map if you need to." })] })] });
            })(), (moving || (onOpenLoad && stage.on && (at.get('GVR') ?? 0) > 0)) && at.size > 0 && _jsxs("section", { className: "dcard", children: [_jsxs("div", { className: "row between wrap", children: [_jsxs("span", { children: [_jsx("b", { children: "Where it is:" }), " ", _jsx("span", { className: "muted", children: [...at.entries()].map(([s, n]) => `${n} at ${s === 'truck' ? 'on a truck' : s}`).join(' · ') })] }), !sendTo && !staging && _jsx("div", { className: "row", children: ['GVR', 'OHR'].filter(s => [...at.keys()].some(k => k !== s && k !== 'truck' && k !== '?')).filter(s => moving || s === 'OHR').map(s => 
                                // 197: OHR can't receive GVR product in METRC: GVR pallets are staged at OHR instead (manifest straight to the customer)
                                s === 'OHR' && stage.on && (at.get('GVR') ?? 0) > 0
                                    ? _jsx("button", { className: "ghost small", disabled: busy, onClick: () => setStaging(true), children: "Stage at OHR" }, s)
                                    : _jsxs("button", { className: "ghost small", disabled: busy, onClick: () => setSendTo(s), children: ["Send to ", s] }, s)) })] }), sites.length > 1 && !stage.on && _jsx("p", { className: "warn-t small-note", children: "This order is at OHR and GVR. Send one side over first, or it ships on two METRC manifests (one per license)." }), staging && backend.client() && _jsx(StageForm, { sb: backend.client(), o: o, gvr: at.get('GVR') ?? 0, loads: loads, stops: stops ?? [], customers: customers ?? [], vehicles: vehicles, drivers: drivers ?? [], busy: busy, setBusy: setBusy, close: () => setStaging(false), flash: flash, done: async () => { await stage.refresh(); await reload(); } }), sendTo && _jsx(LoadChooser, { o: o, loads: loads, vehicles: vehicles, stops: stops, customers: customers, busy: busy, close: () => setSendTo(null), title: `Send the pallets that aren't at ${sendTo} to ${sendTo}`, onPick: id => run(() => backend.orderTransfer(o.id, id, sendTo), `On the load to ${sendTo}`).then(() => setSendTo(null)), onNew: (v, d) => run(() => backend.orderTransferNew(o.id, v, d, sendTo), `New load to ${sendTo} made`).then(() => setSendTo(null)) }), sendTo && _jsxs("p", { className: "muted small-note", children: ["They stay held for ", o.customer, ". When the load is delivered they're received at ", sendTo, ", and can go straight onto the customer's load from there."] })] }), _jsx(StageAlerts, { sb: backend.client(), stages: stage.stages, refresh: stage.refresh, flash: flash, openLoad: openLoad, orderId: o.id, onChanged: reload }), _jsxs("section", { className: "dcard", children: [o.state === 'ready' && !loadPick && _jsxs("div", { className: "row between", children: [_jsxs("span", { children: [_jsx("b", { children: "Ready." }), " ", _jsx("span", { className: "muted", children: "Every line has its pallets." })] }), _jsx("button", { className: "primary", disabled: busy, onClick: () => setLoadPick(true), children: "Put on a load" })] }), (o.state === 'open' || o.state === 'needs_ok') && orderGot(o) > 0 && !loadPick && _jsxs("div", { className: "row between wrap", children: [_jsx("span", { className: "muted", children: "It can go on a load now and keep filling there. It can't leave until every line is filled and OK'd." }), _jsx("button", { className: "ghost", disabled: busy, onClick: () => setLoadPick(true), children: "Put on a load" })] }), ['ready', 'open', 'needs_ok'].includes(o.state) && loadPick && _jsx(LoadChooser, { o: o, loads: loads, vehicles: vehicles, stops: stops, customers: customers, busy: busy, close: () => setLoadPick(false), onPick: id => run(() => backend.orderToLoad(o.id, id), 'On the load').then(() => setLoadPick(false)), onNew: (v, d) => run(async () => { const l = await backend.createLoad(v, d, [{ customer_id: o.customer_id, manifest: '' }], '', ''); await backend.orderToLoad(o.id, l.id); }, 'New load made with this order').then(() => setLoadPick(false)), onPickup: d => run(async () => {
                            const { data, error } = await backend.client().rpc('create_pickup', { p_customer: o.customer_id, p_date: d, p_notes: null });
                            if (error)
                                throw new Error(error.message);
                            await backend.orderToLoad(o.id, data.id);
                        }, `Customer pickup made: ${o.customer} comes to get it`).then(() => setLoadPick(false)) }), o.state === 'loaded' && onOpenLoad && fill !== 'ready' && _jsxs("div", { className: "warnbox", children: ["On the load, but it can't leave yet: ", fill === 'open' ? 'some lines still need pallets' : 'Sales has to OK the amounts that differ', "."] }), o.state === 'loaded' && o.stop && _jsxs("div", { className: "row between wrap", children: [_jsxs("span", { children: [isPk(o) ? 'Customer pickup' : 'On', " ", _jsx("b", { children: o.stop.load }), " ", _jsxs("span", { className: "muted", children: ["\u00B7 ", fmt(o.stop.load_date), " \u00B7 ", o.stop.load_status.replace('_', ' ')] })] }), _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost small", onClick: () => openLoad(o.stop.load_id), children: "Open load" }), (o.stop.load_status === 'planning' || o.stop.load_status === 'loading' || o.stop.load_status === 'cancelled') && _jsx("button", { className: "ghost small", disabled: busy, onClick: () => run(() => backend.orderOffLoad(o.id), isPk(o) ? 'Not a pickup any more' : 'Taken off the load'), children: isPk(o) ? 'Not a pickup' : 'Take off load' })] })] }), combine && _jsx(Combine, { o: o, line: combine, pallets: pallets, heldBy: heldBy, onLoad: onLoad, inRun: inRun, where: where, rank: rank, canon: canon, busy: busy, close: () => setCombine(null), submit: (src, tag) => run(() => backend.combineForLine(combine.id, src, tag), `Combined into one ${combine.strain} package${tag ? '' : ' (tag pending)'}`).then(() => setCombine(null)) }), o.state === 'open' && orderGot(o) === 0 && _jsx("span", { className: "muted", children: "Assign pallets to every line. If a line ends up over or short, Sales OKs the amount before it can leave." })] })] }));
}
/** pallets to choose from: ones that cover what's left first (smallest), then front slots first */
function Pick({ line, need, cands, where, rank, busy, close, onWhole, onPart, loc, orderFz }) {
    const [part, setPart] = useState(null);
    const w = (p) => Number(p.current_weight ?? 0);
    // PICK-2: freezers this order already goes to come first inside each group
    const going = (p) => loc && orderFz?.size && orderFz.has(loc(p).fz) ? 0 : 1;
    const sorted = [...cands].sort((a, b) => {
        const ca = w(a) >= need ? 0 : 1, cb = w(b) >= need ? 0 : 1;
        return ca - cb || going(a) - going(b) || (ca === 0 ? w(a) - w(b) : w(b) - w(a)) || rank(a) - rank(b);
    });
    const hint = (p) => {
        if (!loc)
            return null;
        const L = loc(p);
        if (L.fz == null || L.staging)
            return null;
        const g = orderFz?.has(L.fz);
        const t = [orderFz?.size ? (g ? `Already going to ${L.fzLabel.replace(/^\w+ /, '')}` : '+1 freezer') : '', L.inFront.length ? `${L.inFront.length} in the way` : ''].filter(Boolean).join(' · ');
        return t ? _jsx("span", { className: `pmp-hint ${g ? 'ok' : ''}`, children: t }) : null;
    };
    const total = cands.reduce((a, p) => a + w(p), 0);
    // suggestions first; "Show all" lists every free pallet; search or scan to find a particular one
    const [all, setAll] = useState(false);
    const [q, setQ] = useState('');
    const [picked, setPicked] = useState(null);
    useScanHandler(tag => {
        const p = cands.find(x => sameTag(x.package_tag, tag));
        if (!p)
            return false; // not free for this line: the order page explains why
        setPicked(p.id);
        setQ('');
        return true;
    });
    const qq = q.trim().toLowerCase();
    const hit = (p) => !qq || [p.code, p.package_tag, where(p)].some(v => v?.toLowerCase().includes(qq));
    const chosen = picked != null ? cands.find(p => p.id === picked) : undefined;
    const list = qq ? sorted.filter(hit) : all ? sorted : sorted.slice(0, 5);
    const row = (p, on = false) => (_jsxs("div", { className: `drow ${on ? 'picked' : ''}`, children: [_jsxs("span", { className: "grow", children: [_jsx("b", { children: p.code }), " ", _jsxs("span", { className: "muted", children: [where(p), p.package_tag ? ` · ${tagTxt(p.package_tag)}` : ''] }), " ", hint(p)] }), _jsxs("b", { children: [n0(w(p)), " lbs"] }), need > 0 && w(p) > need && _jsxs("button", { className: "primary small", disabled: busy, onClick: () => setPart({ p, lbs: String(Math.round(need * 100) / 100), tag: '' }), children: ["Take ", n0(need)] }), w(p) > 0 && _jsx("button", { className: "ghost small", disabled: busy, onClick: () => setPart({ p, lbs: '', tag: '' }), children: "Part\u2026" }), _jsx("button", { className: `${need > 0 && w(p) > need ? 'ghost' : 'primary'} small`, disabled: busy, onClick: () => onWhole(p), children: need > 0 && w(p) > need ? 'Whole' : 'Assign' })] }, p.id));
    return (_jsxs("div", { className: "fpick", children: [_jsxs("div", { className: "row between", children: [_jsxs("b", { children: [cands.length, " free ", line.strain, " pallet", cands.length === 1 ? '' : 's', " ", _jsxs("span", { className: "muted", children: ["(", n0(total), " lbs)"] })] }), _jsx("button", { className: "ghost small", onClick: close, children: "Close" })] }), cands.length > 0 && _jsxs("div", { className: "row tagrow", children: [_jsx("input", { className: "grow-in", type: "search", value: q, placeholder: "Find: pallet #, tag digits or freezer", onChange: e => { setQ(e.target.value); setPicked(null); } }), _jsx(ScanButton, { onScan: tag => { const p = cands.find(x => sameTag(x.package_tag, tag)); if (p) {
                            setPicked(p.id);
                            setQ('');
                        }
                        else
                            setQ(tag.slice(-6)); } })] }), !cands.length && _jsx("p", { className: "muted", children: "Nothing free for this strain. Pallets already held for an order, on a load or in a processing run don't show." }), chosen && _jsx(_Fragment, { children: row(chosen, true) }), !chosen && _jsxs(_Fragment, { children: [!qq && !all && cands.length > 0 && _jsxs("div", { className: "muted small", children: ["Suggested (covers what's left first", orderFz?.size ? ', freezers this order already goes to' : '', ", then the closest spots)"] }), list.map(p => row(p)), qq && !list.length && _jsxs("p", { className: "muted small", children: ["No free ", line.strain, " pallet matches \"", q, "\". Held, on a load or a different crop year ones don't show."] }), !qq && sorted.length > 5 && _jsx("button", { className: "ghost small", onClick: () => setAll(v => !v), children: all ? 'Suggestions only' : `Show all ${sorted.length}` })] }), chosen && _jsx("button", { className: "ghost small", onClick: () => setPicked(null), children: "Back to the list" }), part && (_jsx("div", { className: "scrim", onClick: () => setPart(null), children: _jsxs("div", { className: "sheet form", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsxs("h2", { children: ["Take part of ", part.p.code] }), _jsx("button", { className: "ghost", onClick: () => setPart(null), children: "\u2715" })] }), _jsxs("p", { className: "muted", children: [part.p.code, " has ", n0(w(part.p)), " lbs. The part you take becomes its own package for this order (the rest stays as ", part.p.code, "). Split it for real when you pull it."] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Lbs for this order" }), _jsx("input", { type: "number", inputMode: "decimal", value: part.lbs, onChange: e => setPart({ ...part, lbs: e.target.value }) })] }), _jsxs("div", { className: "field", children: [_jsxs("label", { children: ["New METRC tag ", _jsx("span", { className: "muted", children: "(blank = tag pending)" })] }), _jsx(TagInput, { value: part.tag, onChange: tag => setPart({ ...part, tag }), where: { pallet: part.p.id }, placeholder: "Last digits, scan, or leave blank" })] }), _jsxs("div", { className: "row between", children: [_jsx("span", {}), _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost", onClick: () => setPart(null), children: "Cancel" }), _jsxs("button", { className: "primary", disabled: busy || !(Number(part.lbs) > 0 && Number(part.lbs) < w(part.p)), onClick: () => { onPart(part.p, Number(part.lbs), part.tag.trim() || null); setPart(null); }, children: ["Assign ", n0(Number(part.lbs) || 0), " lbs"] })] })] })] }) }))] }));
}
function LoadChooser({ o, loads, vehicles, stops = [], customers = [], busy, close, onPick, onNew, onPickup, title }) {
    // loads that already stop at this customer come first (the order joins that stop)
    const stopsAt = (l) => stops.filter(s => s.load_id === l.id).sort((a, b) => a.seq - b.seq);
    const hasMe = (l) => stopsAt(l).some(s => s.customer_id === o.customer_id && s.status === 'pending');
    const open = loads.filter(l => (l.status === 'planning' || l.status === 'loading') && (l.kind !== 'pickup' || stops.some(s => s.load_id === l.id && s.customer_id === o.customer_id)))
        .sort((a, b) => (title ? 0 : Number(hasMe(b)) - Number(hasMe(a))) || a.load_date.localeCompare(b.load_date));
    const names = (l) => stopsAt(l).map(s => customers.find(c => c.id === s.customer_id)?.name ?? '?').join(', ');
    const vs = vehicles.filter(v => v.active && v.kind !== 'Customer pickup');
    const [v, setV] = useState(vs[0]?.id ?? null);
    const [d, setD] = useState(o.wanted_date && o.wanted_date >= today() ? o.wanted_date : today());
    return (_jsxs("div", { className: "dlist lchoose", children: [_jsxs("div", { className: "row between", children: [_jsx("b", { children: title ?? `Put ${o.customer} on a load` }), _jsx("button", { className: "ghost small", onClick: close, children: "Cancel" })] }), open.map(l => _jsxs("button", { className: "drow click", disabled: busy, onClick: () => onPick(l.id), children: [_jsxs("span", { children: [_jsx("b", { children: l.code }), _jsxs("span", { className: "muted", children: [" \u00B7 ", fmt(l.load_date), " \u00B7 ", vehicles.find(x => x.id === l.vehicle_id)?.name ?? '', " \u00B7 ", l.status] }), stopsAt(l).length > 0 && _jsxs("span", { className: "muted small", children: [_jsx("br", {}), "Stops: ", names(l)] }), !title && hasMe(l) && _jsxs("span", { className: "ok-t small", children: [_jsx("br", {}), "Already stops at ", o.customer, ": joins that stop"] })] }), _jsx("span", { className: "lc-add", children: "Add \u203A" })] }, l.id)), !open.length && _jsx("p", { className: "muted", children: "No loads being planned. Make a new one:" }), _jsxs("div", { className: "drow lc-new", children: [_jsx("span", { className: "grow", children: _jsx("b", { children: "New load" }) }), _jsx(Select, { value: v ?? '', onChange: e => setV(Number(e.target.value)), children: vs.map(x => _jsx("option", { value: x.id, children: x.name }, x.id)) }), _jsx("input", { type: "date", value: d, onChange: e => setD(e.target.value) }), _jsx("button", { className: "primary small", disabled: busy || v == null, onClick: () => onNew(v, d), children: "Make load" })] }), onPickup && _jsxs("div", { className: "drow lc-new", children: [_jsxs("span", { className: "grow", children: [_jsx("b", { children: "Customer pickup" }), _jsxs("span", { className: "muted small", children: [_jsx("br", {}), o.customer, " comes to get it with their own driver and truck"] })] }), _jsx("input", { type: "date", value: d, onChange: e => setD(e.target.value) }), _jsx("button", { className: "ghost small", disabled: busy, onClick: () => onPickup(d), children: "Make pickup" })] })] }));
}
/** pull from several pallets of one strain (whole or part of each) into one new METRC package for this line */
function Combine({ o, line, pallets, heldBy, onLoad, inRun, where, rank, canon, busy, close, submit }) {
    const w = (p) => Number(p.current_weight ?? 0);
    const prod = (x) => x.product ?? 'fresh_frozen';
    const cands = pallets.filter(p => (p.status === 'in_freezer' || p.status === 'unslotted') && p.pushed !== false && !p.container_id && p.kind !== 'mixed' && w(p) > 0
        && canon(p.strain) === canon(line.strain) && prod(p) === prod(line) && (p.crop_year == null || p.crop_year === line.crop_year)
        && (!heldBy.has(p.id) || heldBy.get(p.id).id === o.id) && !onLoad(p.id) && !inRun?.(p.id));
    const onLine = new Set(line.picks.map(pk => pk.pallet_id));
    const [sel, setSel] = useState(() => new Map(cands.filter(p => onLine.has(p.id)).map(p => [p.id, String(w(p))])));
    const [tag, setTag] = useState('');
    // what the line still needs from the pallets picked here (other picks on the line stay)
    const kept = line.picks.filter(pk => !sel.has(pk.pallet_id)).reduce((a, pk) => a + Number(pk.lbs), 0);
    const need = Math.max(0, Number(line.lbs) - kept);
    const total = [...sel.values()].reduce((a, v) => a + (Number(v) || 0), 0);
    const toggle = (p) => setSel(m => {
        const n = new Map(m);
        if (n.has(p.id))
            n.delete(p.id);
        else {
            const rest = need - [...n.values()].reduce((a, v) => a + (Number(v) || 0), 0);
            n.set(p.id, String(rest > 0 ? Math.min(w(p), Math.round(rest * 100) / 100) : w(p)));
        }
        return n;
    });
    const sorted = [...cands].sort((a, b) => Number(sel.has(b.id)) - Number(sel.has(a.id)) || Number(onLine.has(b.id)) - Number(onLine.has(a.id)) || rank(a) - rank(b) || w(a) - w(b));
    const bad = [...sel.entries()].some(([id, v]) => { const p = cands.find(x => x.id === id); return !p || !(Number(v) > 0) || Number(v) > w(p) + 0.001; });
    return (_jsx("div", { className: "scrim", onClick: close, children: _jsxs("div", { className: "sheet form", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsxs("div", { children: [_jsx("h2", { children: "Combine into one tag" }), _jsxs("div", { className: "muted", children: [line.strain, " \u00B7 ", PRODUCT_LABEL[prod(line)] ?? prod(line), " \u00B7 ", line.crop_year] })] }), _jsx("button", { className: "ghost", onClick: close, children: "\u2715" })] }), _jsxs("p", { className: "muted small-note", children: ["Tick the pallets to pull from and how much from each. They become one new package for ", o.so ?? 'this order', "; what's left stays on each pallet."] }), _jsxs("div", { className: total > 0 && Math.abs(total - need) > 0.5 ? 'warnbox' : 'okbox', children: ["Line needs ", _jsx("b", { children: n0(need) }), " lbs from these \u00B7 picked ", _jsx("b", { children: n0(total) }), " lbs", total > 0 && Math.abs(total - need) > 0.5 ? ` (${total > need ? `${n0(total - need)} over` : `${n0(need - total)} short`})` : ''] }), !cands.length && _jsxs("p", { className: "muted", children: ["No free ", line.strain, " pallets for ", line.crop_year, "."] }), _jsx("div", { className: "picklist", children: sorted.slice(0, 30).map(p => (_jsxs("div", { className: `pick combine ${sel.has(p.id) ? 'on' : ''}`, children: [_jsx("input", { type: "checkbox", checked: sel.has(p.id), onChange: () => toggle(p) }), _jsxs("span", { className: "grow", onClick: () => toggle(p), children: [_jsx("b", { children: p.code }), " ", _jsxs("span", { className: "muted", children: [n0(w(p)), " lbs \u00B7 ", where(p), onLine.has(p.id) ? ' · on this line' : ''] })] }), sel.has(p.id) && _jsxs("span", { className: "row lbsin", children: [_jsx("input", { type: "number", inputMode: "decimal", value: sel.get(p.id), onChange: e => setSel(m => new Map(m).set(p.id, e.target.value)) }), _jsx("button", { className: "ghost small", onClick: () => setSel(m => new Map(m).set(p.id, String(w(p)))), children: "All" })] })] }, p.id))) }), _jsxs("div", { className: "field", children: [_jsxs("label", { children: ["New METRC tag ", _jsx("span", { className: "muted", children: "(blank = tag pending)" })] }), _jsx(TagInput, { value: tag, onChange: setTag, where: { pallet: cands[0]?.id ?? null }, placeholder: "Last digits, scan, or leave blank" })] }), _jsxs("div", { className: "metrcnote", children: [_jsx("b", { children: "METRC" }), " Goes on the METRC to-do as Combine packages: one new package from ", sel.size || 'these', " source", sel.size === 1 ? '' : 's', "."] }), _jsxs("div", { className: "row end", children: [_jsx("button", { className: "ghost", onClick: close, children: "Cancel" }), _jsxs("button", { className: "primary", disabled: busy || sel.size < 2 || bad, onClick: () => submit([...sel.entries()].map(([id, v]) => { const p = cands.find(x => x.id === id); return { pallet_id: id, lbs: Number(v) >= w(p) - 0.001 ? null : Number(v) }; }), tag.trim() || null), children: ["Combine ", sel.size > 1 ? `${sel.size} pallets` : '', " \u00B7 ", n0(total), " lbs"] })] })] }) }));
}
