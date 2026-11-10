import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// Customer portal (redesign, 150): mobile-first home with tiles, Contract Reserves, Open Menu, Place an order,
// Orders & Statement, My Contract and Sample Holds for You. Layout and behaviour follow the approved prototype
// (see the project doc customer-portal-redesign-spec.md). Styles live in cportal.css, scoped under .cp.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import './cportal.css';
import { downloadStatement } from './statement';
/* ---------- helpers ---------- */
const c = (s) => s.split(/\s+/).filter(Boolean).map(x => 'cp-' + x).join(' ');
const fmt = (n) => Math.round(Number(n ?? 0)).toLocaleString('en-US');
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const money2 = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const f10 = (n) => Math.max(0, Math.floor(Number(n ?? 0) / 10) * 10);
const not10 = (v) => v % 10 !== 0;
const actDay = (at) => new Date(at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const actWhen = (at) => `${actDay(at)} · ${new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
/** typed lbs snap to the nearest 10 when the box is left (34 → 30, 35 → 40) */
const round10 = (v) => Math.sign(v) * Math.round(Math.abs(v) / 10) * 10;
const TEN = 'Use steps of 10 lbs, like 120 or 130';
const lc = (s) => s.toLowerCase();
const kOf = (s, y) => lc(s) + '|' + y;
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const day = (v) => (v ? new Date(v.slice(0, 10) + 'T12:00') : null);
const shortDate = (v) => day(v)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) ?? '';
const niceDate = (v) => new Date(v + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const daysUntil = (v) => { const d = day(v); if (!d)
    return 0; d.setHours(0, 0, 0, 0); return Math.max(0, Math.round((d.getTime() - today0().getTime()) / 86400000)); };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const snap = (v, d) => Math.max(0, d > 0 ? Math.floor(v / 10) * 10 + 10 : Math.ceil(v / 10) * 10 - 10);
const soLabel = (o) => o.so_number || `Order #${o.id}`;
const priceFmt = (p) => `$${p % 1 ? p.toFixed(2) : p}/lb`;
/** QuickBooks' invoice lines as the portal shows them: fresh frozen lines are lbs of a strain; other lines (shipping, discounts, deposits) keep their amount */
function qboLines(lines) {
    const out = [];
    for (const l of lines) {
        const desc = (l.description ?? '').split('\n')[0].trim(), text = `${l.item ?? ''} ${l.description ?? ''}`;
        const amount = l.amount != null ? Number(l.amount) : null;
        if (/fresh frozen/i.test(text) && Number(l.price ?? 0) >= 0 && Number(l.qty ?? 0) > 0) {
            const yr = /\bFL(\d{2})-/.exec(l.description ?? '');
            out.push({ s: desc.replace(/\s*-\s*fresh frozen$/i, '') || (l.item ?? ''), y: yr ? 2000 + Number(yr[1]) : null, lbs: Number(l.qty), price: l.price != null ? Number(l.price) : null, amount });
        }
        else if (amount)
            out.push({ s: desc || (l.item ?? '').replace(/^.*:/, ''), y: null, lbs: null, price: null, amount });
    }
    return out;
}
const I = {
    back: _jsx("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", "aria-hidden": "true", children: _jsx("path", { d: "m15 6-6 6 6 6" }) }),
    down: _jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "#5f6b64", strokeWidth: "2", strokeLinecap: "round", "aria-hidden": "true", children: _jsx("path", { d: "m6 9 6 6 6-6" }) }),
    up: _jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "#5f6b64", strokeWidth: "2", strokeLinecap: "round", "aria-hidden": "true", children: _jsx("path", { d: "m6 15 6-6 6 6" }) }),
    chat: _jsxs("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [_jsx("path", { d: "M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.2A8 8 0 1 1 21 12Z" }), _jsx("path", { d: "M9 10.5h6M9 13.5h4" })] }),
    clock: _jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", "aria-hidden": "true", style: { verticalAlign: '-3px' }, children: [_jsx("circle", { cx: "12", cy: "12", r: "9" }), _jsx("path", { d: "M12 7v5l3 2" })] }),
    user: _jsxs("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", "aria-hidden": "true", children: [_jsx("circle", { cx: "12", cy: "8", r: "4" }), _jsx("path", { d: "M4 21c1-4 4.5-6 8-6s7 2 8 6" })] }),
    plusbox: _jsxs("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", "aria-hidden": "true", style: { verticalAlign: '-2px' }, children: [_jsx("rect", { x: "4", y: "4", width: "16", height: "16", rx: "4" }), _jsx("path", { d: "M12 8v8M8 12h8" })] }),
    share: _jsxs("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-label": "Share", role: "img", style: { verticalAlign: '-2px' }, children: [_jsx("path", { d: "M12 3v12M8 7l4-4 4 4" }), _jsx("path", { d: "M6 11v9h12v-9" })] }),
    close: _jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", "aria-hidden": "true", children: _jsx("path", { d: "M6 6l12 12M18 6 6 18" }) }),
    search: _jsxs("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", "aria-hidden": "true", children: [_jsx("circle", { cx: "11", cy: "11", r: "7" }), _jsx("path", { d: "m20 20-3.5-3.5" })] }),
    doc: _jsxs("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [_jsx("path", { d: "M7 3h7l5 5v13H7z" }), _jsx("path", { d: "M14 3v5h5" })] }),
    check: _jsx("svg", { width: "32", height: "32", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.6", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: _jsx("path", { d: "m5 12.5 4.5 4.5L19 7.5" }) }),
    cal: _jsxs("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", "aria-hidden": "true", children: [_jsx("rect", { x: "3", y: "5", width: "18", height: "16", rx: "2" }), _jsx("path", { d: "M3 10h18M8 3v4M16 3v4" })] }),
};
/** typed quantity in lbs with −/+ 10 buttons */
function Stepper({ val, on, bad, label, onChange, autoFocus }) {
    return (_jsxs("span", { className: c(`stepper ${on ? 'on' : ''} ${bad ? 'bad' : ''}`), children: [_jsx("button", { type: "button", onClick: () => onChange(snap(val, -10)), "aria-label": `Less ${label}`, children: "\u2212" }), _jsx("input", { type: "text", inputMode: "numeric", pattern: "[0-9]*", value: val ? String(val) : '', placeholder: "0", "aria-label": `${label} lbs`, "aria-invalid": bad ? 'true' : 'false', autoFocus: autoFocus, onChange: e => { const d = e.target.value.replace(/[^0-9]/g, '').slice(0, 6); onChange(d ? Number(d) : 0); }, onBlur: () => { if (not10(val))
                    onChange(round10(val)); }, onKeyDown: e => { if (e.key === 'Enter')
                    e.target.blur(); } }), _jsx("button", { type: "button", onClick: () => onChange(snap(val, 10)), "aria-label": `More ${label}`, children: "+" })] }));
}
/** an adjustment (+/−) to a reserve: − and + move by `step`; typing "-50" or "50" works too */
function AdjStepper({ val, step, min, max, bad, label, onChange, plain, what = 'reserve' }) {
    // − and + stop at the limits (no lower than what's already shipped or ordered, no more than is available)
    const clamp = (n) => Math.min(Math.max(n, min), Math.max(max, min));
    const [txt, setTxt] = useState(null); // while typing, keep what they typed (e.g. a lone "-")
    const shown = txt ?? (plain ? (val ? String(val) : '') : val > 0 ? `+${val}` : val < 0 ? `−${Math.abs(val)}` : '');
    return (_jsxs("span", { className: c(`stepper adj ${val ? 'on' : ''} ${bad ? 'bad' : ''}`), children: [_jsx("button", { type: "button", disabled: val <= min, onClick: () => { setTxt(null); onChange(clamp(val - step)); }, "aria-label": `${step} lbs less ${label}`, children: "\u2212" }), _jsx("input", { type: "text", inputMode: "numeric", value: shown, placeholder: plain ? '0' : '±0', "aria-label": plain ? `${label} ${what}, lbs` : `Change to ${label} reserve, lbs`, "aria-invalid": bad ? 'true' : 'false', onChange: e => { const t = e.target.value.replace(/[−–]/g, '-').replace(/[^0-9+-]/g, ''); setTxt(t); const n = Number(t.replace('+', '')); if (t === '' || t === '-' || t === '+')
                    onChange(0);
                else if (!isNaN(n))
                    onChange(n); }, onBlur: () => {
                    setTxt(null);
                    if (not10(val)) {
                        let r = round10(val);
                        // rounding up never pushes a typed amount past the limit it was inside (e.g. 345 with 340 available → 340)
                        if (val <= max && r > max)
                            r = Math.floor(max / 10) * 10;
                        if (val >= min && r < min)
                            r = Math.ceil(min / 10) * 10;
                        onChange(r);
                    }
                }, onKeyDown: e => { if (e.key === 'Enter')
                    e.target.blur(); } }), _jsx("button", { type: "button", disabled: val >= max, onClick: () => { setTxt(null); onChange(clamp(val + step)); }, "aria-label": `${step} lbs more ${label}`, children: "+" })] }));
}
const STEPS = [[10, '10 lbs'], [50, '50 lbs'], [100, '100 lbs'], [650, 'A full pallet']];
const StepErr = ({ msg }) => _jsx("p", { className: c('err'), style: { margin: '2px 0 0' }, children: msg });
/* ---------- data ---------- */
const YIELDS_FROM = '2026-09-01'; // same date as yield_reports_from() in SQL 326
const TYPE_SHORT = { Sativa: 'S', 'Sativa Hybrid': 'S/H', Hybrid: 'H', 'Indica Hybrid': 'I/H', Indica: 'I' };
const TYPE_ORDER = { S: 1, 'S/H': 2, H: 3, 'I/H': 4, I: 5 };
const TYPE_LONG = { S: 'Sativa', 'S/H': 'Sativa hybrid', H: 'Hybrid', 'I/H': 'Indica hybrid', I: 'Indica' };
async function loadAll(backend) {
    const safe = (p, d) => p.catch(() => d);
    const actFn = backend.reserveActivity;
    const acts = actFn ? await safe(actFn.call(backend), []) : [];
    const yFn = backend.myYields;
    const yields = yFn ? await safe(yFn.call(backend), null) : null; // null = this backend doesn't do yields yet (screens stay hidden)
    const [terms, ys, menu, bal, reqs, orders, flags, st, mc, holds, hd] = await Promise.all([
        safe(backend.myTerms(), null), safe(backend.reserveYears(), null), safe(backend.openMenu(), []), safe(backend.listBalances(), []),
        safe(backend.listRequests(), []), safe(backend.listOrders(), []), safe(backend.myOrderFlags(), []),
        safe(backend.statement(), null), safe(backend.myContract(), null), safe(backend.sampleHolds(), []), safe(backend.mySampleHoldDays(), null),
    ]);
    const cy = ys?.current ?? mc?.year ?? Math.max(new Date().getFullYear(), ...menu.map(m => m.crop_year));
    const years = [...new Set([cy, ...menu.map(m => m.crop_year), ...orders.flatMap(o => o.order_lines.map(l => l.crop_year ?? cy))])];
    const ps = await Promise.all(years.map(y => safe(backend.myTermsFor(y), null).then(t => [y, t?.price_per_lb ?? null])));
    // 175: this customer's price per strain + crop year (contract, else item card, else market), same as place_order uses
    const lp = await safe(Promise.resolve(backend.client()?.rpc('my_line_prices')).then(r => (r?.data ?? [])), []);
    const linePrices = Object.fromEntries(lp.map(x => [`${x.strain}|${x.crop_year}`, x.price != null ? Number(x.price) : null]));
    // 196: grade + type per strain (until 196 is run this comes back empty and the columns show –)
    const tg = await safe(Promise.resolve(backend.client()?.rpc('menu_strain_tags')).then(r => (r?.data ?? [])), []);
    const tags = {};
    for (const x of tg) {
        const v = { g: x.grade ?? null, t: x.strain_type ? TYPE_SHORT[x.strain_type] ?? null : null };
        for (const n of [x.strain, ...(x.aliases ?? [])])
            if (n && !(n.toLowerCase().trim() in tags))
                tags[n.toLowerCase().trim()] = v;
    }
    const qbo = await safe(backend.qboInvoiceLines((st?.invoices ?? []).map(i => i.qbo_id).filter((x) => !!x)), {});
    const prices = {};
    for (const [y, p] of ps)
        prices[y] = p != null ? Number(p) : (terms?.price_per_lb != null ? Number(terms.price_per_lb) : null);
    return { cy, contract: !!(terms?.reserves_enabled ?? mc?.reserves_enabled), terms, menu, bal, reqs, orders, flags, st, mc, holds, holdDays: hd ?? 10, acts, yields, prices, linePrices, qbo, tags };
}
/* ---------- the portal ---------- */
export function Portal({ backend, me, signOut }) {
    useEffect(() => { document.title = 'Lifted Farms Orders'; }, []);
    const [d, setD] = useState(null);
    const [loadErr, setLoadErr] = useState(null);
    const reload = () => loadAll(backend).then(x => { setD(x); setLoadErr(null); }).catch(e => setLoadErr(String(e?.message ?? e)));
    useEffect(() => { reload(); }, []);
    // keep numbers current: changes Lifted makes (approving, cancelling, shipping) show when the customer comes back to the portal
    const lastLoad = useRef(Date.now());
    const refresh = () => { if (Date.now() - lastLoad.current < 10000)
        return; lastLoad.current = Date.now(); reload(); };
    useEffect(() => {
        const vis = () => { if (document.visibilityState === 'visible')
            refresh(); };
        document.addEventListener('visibilitychange', vis);
        addEventListener('focus', refresh);
        const t = setInterval(() => { if (document.visibilityState === 'visible')
            refresh(); }, 120000);
        return () => { document.removeEventListener('visibilitychange', vis); removeEventListener('focus', refresh); clearInterval(t); };
    }, []);
    const [screen, setScreen] = useState('home');
    // desktop (1024px and wider): sidebar layout and dashboard home; phones and tablets keep the mobile screens
    const deskQ = '(min-width: 1024px)';
    const [desk, setDesk] = useState(() => matchMedia(deskQ).matches);
    useEffect(() => { const m = matchMedia(deskQ), f = () => setDesk(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, []);
    useEffect(() => {
        history.replaceState({ ...(history.state ?? {}), cp: 'home' }, '');
        const pop = (e) => { setScreen(e.state?.cp ?? 'home'); window.scrollTo({ top: 0 }); };
        addEventListener('popstate', pop);
        return () => removeEventListener('popstate', pop);
    }, []);
    const go = (s0) => {
        // desktop contract customers: Contract Reserves, Open Menu and Edit Reserves are one screen
        const s = desk && contract && (s0 === 'reserves' || s0 === 'menu' || s0 === 'edit') ? 'resmenu' : desk && !contract && s0 === 'menu' ? 'home' : s0;
        setScreen(s);
        history.pushState({ cp: s }, '');
        window.scrollTo({ top: 0 });
        if (s === 'home' || s === 'activity' || s === 'orders' || s === 'reserves' || s === 'menu' || s === 'resmenu')
            refresh();
    };
    // phones: while the keyboard is up, hide the bottom bar (it rides above the keyboard and covers the box) and keep the box
    // being typed in centred on screen once the keyboard has opened
    const [typing, setTyping] = useState(false);
    useEffect(() => {
        if (!matchMedia('(pointer: coarse)').matches)
            return;
        const isBox = (el) => el instanceof HTMLInputElement && ['text', 'search', 'email', 'password'].includes(el.type) && !!el.closest('.cp');
        const centre = () => { const el = document.activeElement; if (isBox(el))
            (el.closest('.cp-box, .cp-sel, .cp-mg, label') ?? el).scrollIntoView({ block: 'center', behavior: 'smooth' }); };
        let t = 0;
        const onIn = (e) => { if (!isBox(e.target))
            return; setTyping(true); clearTimeout(t); t = window.setTimeout(centre, 350); };
        const onOut = () => setTimeout(() => { if (!isBox(document.activeElement))
            setTyping(false); }, 50);
        const vv = window.visualViewport, onVV = () => { clearTimeout(t); t = window.setTimeout(centre, 120); };
        document.addEventListener('focusin', onIn);
        document.addEventListener('focusout', onOut);
        vv?.addEventListener('resize', onVV);
        return () => { document.removeEventListener('focusin', onIn); document.removeEventListener('focusout', onOut); vv?.removeEventListener('resize', onVV); clearTimeout(t); };
    }, []);
    const [toastMsg, setToastMsg] = useState(null);
    const toastT = useRef();
    const toast = (m) => { setToastMsg(m); clearTimeout(toastT.current); toastT.current = window.setTimeout(() => setToastMsg(null), 3200); };
    const [busy, setBusy] = useState(false);
    async function run(f) {
        setBusy(true);
        try {
            return await f();
        }
        catch (e) {
            toast(String(e.message ?? e));
        }
        finally {
            setBusy(false);
        }
    }
    // account
    const [acct, setAcct] = useState(false);
    const [pw, setPw] = useState('');
    const [pw2, setPw2] = useState('');
    // reserve editing (shared by Open Menu and Edit Reserves)
    const [edit, setEdit] = useState(null);
    const [editNew, setEditNew] = useState([]);
    const [menuOpen, setMenuOpen] = useState([]);
    const [editFrom, setEditFrom] = useState('reserves');
    const [reviewFrom, setReviewFrom] = useState('edit');
    const [reqNote, setReqNote] = useState('');
    const [lastReq, setLastReq] = useState([]);
    const [lastReqRows, setLastReqRows] = useState([]);
    const [lastReqNote, setLastReqNote] = useState('');
    const [q, setQ] = useState('');
    const [editQ, setEditQ] = useState('');
    const [orderQ, setOrderQ] = useState('');
    const [menuYear, setMenuYear] = useState('all');
    const [gradeF, setGradeF] = useState('all'); // grade filter on Reserves & Menu (desktop) and Open Menu (phones)
    // phones: a one-time tip to add the portal to the home screen (an icon keeps them signed in and they never need the link again)
    const [a2hs, setA2hs] = useState(() => {
        try {
            const ua = navigator.userAgent, standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
            if (standalone || localStorage.getItem('cp-a2hs-done'))
                return null;
            return /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : null;
        }
        catch {
            return null;
        }
    });
    const hideA2hs = () => { setA2hs(null); try {
        localStorage.setItem('cp-a2hs-done', '1');
    }
    catch { /* private mode */ } };
    // desktop tables: click a column header to sort; default is strain A–Z
    const [sorts, setSorts] = useState({});
    const sortOf = (t) => sorts[t] ?? { col: 's', dir: 1 };
    function sortRows(t, list, get) {
        const { col, dir } = sortOf(t), g = get[col];
        const byName = (a, b) => a.s.localeCompare(b.s) || b.y - a.y;
        return [...list].sort((a, b) => col === 's' || !g ? dir * byName(a, b) : dir * (g(a) - g(b)) || byName(a, b));
    }
    const sh = (t, col, label) => {
        const { col: c0, dir } = sortOf(t), on = c0 === col;
        return _jsxs("button", { type: "button", className: c(`sorth ${on ? 'on' : ''}`), "aria-sort": on ? (dir > 0 ? 'ascending' : 'descending') : undefined, onClick: () => setSorts({ ...sorts, [t]: { col, dir: on ? -dir : col === 's' ? 1 : -1 } }), children: [label, _jsx("i", { "aria-hidden": "true", children: on ? (dir > 0 ? '▲' : '▼') : '↕' })] }, col);
    };
    const [notRes, setNotRes] = useState(false);
    const [rmRes, setRmRes] = useState('all');
    const [stepCustom, setStepCustom] = useState(false);
    const [stepTxt, setStepTxt] = useState(null);
    const [rmStep, setRmStepRaw] = useState(() => { try {
        return Number(localStorage.getItem('cp-rm-step')) || 10;
    }
    catch {
        return 10;
    } });
    const setRmStep = (n) => { setRmStepRaw(n); try {
        localStorage.setItem('cp-rm-step', String(n));
    }
    catch { /* private mode */ } };
    // order form
    const [ord, setOrd] = useState({});
    const [smp, setSmp] = useState({});
    const [holdAsk, setHoldAsk] = useState({});
    const [po, setPo] = useState('');
    const [note, setNote] = useState('');
    const [wanted, setWanted] = useState('');
    const [editing, setEditing] = useState(null);
    const [cal, setCal] = useState(null);
    const [focusK, setFocusK] = useState(null);
    const [lastOrder, setLastOrder] = useState(null);
    // orders
    const [filter, setFilter] = useState('all');
    const [openRow, setOpenRow] = useState(null);
    const [confirmCancel, setConfirmCancel] = useState(null);
    const [stBusy, setStBusy] = useState(false);
    // holds
    const [holdSel, setHoldSel] = useState([]);
    const [holdQty, setHoldQty] = useState({});
    const [releasing, setReleasing] = useState(null);
    useEffect(() => {
        const esc = (e) => { if (e.key === 'Escape') {
            setConfirmCancel(null);
            setCal(null);
            setReleasing(null);
            setAcct(false);
        } };
        addEventListener('keydown', esc);
        return () => removeEventListener('keydown', esc);
    }, []);
    /* ---------- derived ---------- */
    const cy = d?.cy ?? new Date().getFullYear();
    const contract = !!d?.contract;
    const yrTag = (y) => y < cy ? _jsxs("span", { className: c('yr old'), children: [y, " crop"] }) : null;
    // 196: grade (SHO / BHO) and type (S … I) per strain; desktop gets columns (blank when not set), phones a small pill
    const tagOf = (s) => d?.tags[s.toLowerCase().trim()] ?? { g: null, t: null };
    const gradeCell = (s) => { const g = tagOf(s).g; return _jsx("span", { className: c('tagcell'), children: g ? _jsx("span", { className: c(`gtag g-${g.toLowerCase()}`), children: g }) : null }); };
    const typeCell = (s) => { const t = tagOf(s).t; return _jsx("span", { className: c('tagcell'), children: t ? _jsx("span", { className: c('ttag'), title: TYPE_LONG[t], children: t }) : null }); };
    // phones: the same colored grade chip (SHO teal, BHO gold) and gray type chip as the desktop columns, small and inline
    const tagPill = (s) => { const { g, t } = tagOf(s); return g || t ? _jsxs("span", { className: c('tagpair'), children: [g && _jsx("span", { className: c(`gtag g-${g.toLowerCase()}`), children: g }), t && _jsx("span", { className: c('ttag'), title: TYPE_LONG[t], children: t })] }) : null; };
    const lastOrd = useMemo(() => {
        const m = {};
        for (const o of d?.orders ?? []) {
            if (o.status === 'draft' || o.status === 'cancelled' || !o.order_date)
                continue;
            for (const l of o.order_lines) {
                const k = l.strain.toLowerCase().trim();
                if (!m[k] || o.order_date > m[k])
                    m[k] = o.order_date;
            }
        }
        return m;
    }, [d]);
    const lastOrdTxt = (s) => { const v = lastOrd[s.toLowerCase().trim()]; return v ? `Last ordered ${shortDate(v)}` : 'Not ordered before'; };
    const gradeN = (s) => ({ SHO: 1, BHO: 2 }[tagOf(s).g ?? ''] ?? 9);
    const typeN = (s) => TYPE_ORDER[tagOf(s).t ?? ''] ?? 9;
    const menuItems = useMemo(() => (d?.menu ?? []).filter(m => m.crop_year <= cy).map(m => ({
        k: kOf(m.strain, m.crop_year), s: m.strain, y: m.crop_year, open: f10(m.available), hold: Number(m.my_hold ?? 0), row: m,
    })), [d]);
    const menuRow = (k) => menuItems.find(m => m.k === k);
    const reserves = useMemo(() => {
        if (!d)
            return [];
        const out = new Map();
        for (const b of d.bal) {
            const y = b.crop_year ?? cy;
            if (y > cy || Number(b.reserved) <= 0)
                continue;
            const so = Number(b.pending) + Number(b.submitted ?? 0);
            out.set(kOf(b.strain, y), { k: kOf(b.strain, y), s: b.strain, y, res: Number(b.reserved), used: Number(b.shipped) + Number(b.pending), left: Math.max(Number(b.remaining), 0), asked: null,
                ful: Number(b.shipped), so, rem: Math.max(Number(b.reserved) - Number(b.shipped) - so, 0) });
        }
        for (const r of d.reqs) {
            const y = r.crop_year ?? cy;
            if (r.status !== 'pending' || y > cy)
                continue;
            const k = kOf(r.strain, y), x = out.get(k);
            if (x)
                x.asked = Number(r.requested_lbs);
            else
                out.set(k, { k, s: r.strain, y, res: 0, used: 0, left: 0, asked: Number(r.requested_lbs), ful: 0, so: 0, rem: 0 });
        }
        return [...out.values()].sort((a, b) => a.s.localeCompare(b.s) || b.y - a.y);
    }, [d]);
    const resRow = (k) => reserves.find(r => r.k === k);
    const dt = reserves.reduce((a, r) => ({ ful: a.ful + r.ful, so: a.so + r.so, rem: a.rem + r.rem }), { ful: 0, so: 0, rem: 0 });
    const totals = reserves.reduce((a, r) => ({ res: a.res + r.res, used: a.used + r.used, left: a.left + r.left }), { res: 0, used: 0, left: 0 });
    const liveHolds = (d?.holds ?? []).filter(h => h.state === 'submitted' || h.state === 'waiting' || h.state === 'active');
    const activeHeld = (k) => liveHolds.filter(h => h.state === 'active' && kOf(h.strain, h.crop_year) === k).reduce((a, h) => a + Number(h.remaining), 0);
    const holdLbs = (h) => Number(h.state === 'active' ? h.remaining : h.hold_lbs);
    const sampleOf = (h) => Number(d?.orders.flatMap(o => o.order_lines).find(l => l.id === h.line_id)?.lbs ?? 0);
    const holdReq = (h) => d?.reqs.find(r => r.status === 'pending' && r.hold_line_id === h.line_id);
    const priceOf = (y, s) => {
        const k = s ? `${s}|${y}` : '', lp = d?.linePrices ?? {};
        if (k && k in lp && lp[k] != null)
            return lp[k];
        return d?.prices[y] ?? (d?.terms?.price_per_lb != null ? Number(d.terms.price_per_lb) : null);
    };
    /* ---------- reserve edits ---------- */
    const ed = edit ?? Object.fromEntries(reserves.map(r => [r.k, r.asked ?? r.res]));
    const setRes = (k, v) => setEdit({ ...ed, [k]: v });
    const availFor = (k) => (menuRow(k)?.open ?? 0) + f10(activeHeld(k));
    function resErr(r) {
        const v = ed[r.k] ?? 0, base = r.asked ?? r.res;
        if (v === base)
            return ''; // only lines being changed are checked (some reserves aren't in steps of 10)
        if (not10(v))
            return TEN;
        if (v < r.used)
            return `Can't go below the ${fmt(r.used)} lbs already picked up`;
        if (v - base > availFor(r.k))
            return `Only ${fmt(availFor(r.k))} more lbs available`;
        return '';
    }
    const newErr = (n) => not10(n.lbs) ? TEN : n.lbs > availFor(n.k) ? `Only ${fmt(availFor(n.k))} lbs available` : n.lbs <= 0 ? 'Enter how many lbs to reserve, or remove it' : '';
    const changes = [
        ...editNew.filter(n => n.lbs > 0).map(n => ({ s: n.s, y: n.y, from: 0, to: n.lbs, isNew: true })),
        ...reserves.filter(r => (ed[r.k] ?? 0) !== (r.asked ?? r.res)).map(r => ({ s: r.s, y: r.y, from: r.res, to: ed[r.k] ?? 0 })),
    ];
    // problems on lines that will actually be sent (a strain just picked with no lbs yet is ignored)
    const sendErr = editNew.some(n => n.lbs > 0 && !!newErr(n)) || reserves.some(r => !!resErr(r));
    const anyResErr = editNew.some(n => !!newErr(n)) || reserves.some(r => !!resErr(r));
    const clearEdit = () => { setEdit(null); setEditNew([]); setMenuOpen([]); setReqNote(''); setEditQ(''); };
    const changedLine = (r) => {
        const v = ed[r.k] ?? 0, base = r.asked ?? r.res;
        return v !== base ? _jsxs("span", { style: { color: 'var(--teal-ink)', fontWeight: 500 }, children: ["Was ", fmt(base), " \u00B7 ", v > base ? '+' : '−', fmt(Math.abs(v - base))] }) : null;
    };
    async function sendReq() {
        const lines = changes.map(ch => ({ strain: ch.s, crop_year: ch.y, lbs: ch.to }));
        const n = await run(() => backend.requestReserveLines(lines, reqNote));
        if (n === undefined)
            return;
        setLastReq(changes);
        setLastReqRows(reqRows(changes));
        setLastReqNote(reqNote);
        clearEdit();
        await reload();
        go('sent');
    }
    /* ---------- order form ---------- */
    const addBack = {};
    if (editing && editing.status === 'pending')
        for (const l of editing.order_lines) {
            const k = kOf(l.strain, l.crop_year ?? cy);
            addBack[k] = (addBack[k] ?? 0) + Number(l.lbs);
        }
    const orderable = useMemo(() => {
        const lines = menuItems.map(m => ({ k: m.k, s: m.s, y: m.y, resLeft: contract ? f10(m.row.my_left) : 0, open: m.open + (addBack[m.k] ?? 0), hold: f10(m.hold) }));
        if (editing)
            for (const l of editing.order_lines) { // lines on the order that aren't on the menu any more
                const k = kOf(l.strain, l.crop_year ?? cy);
                if (!lines.some(x => x.k === k))
                    lines.push({ k, s: l.strain, y: l.crop_year ?? cy, resLeft: 0, open: Number(l.lbs), hold: 0 });
            }
        const isRes = (l) => contract && !!menuRow(l.k) && Number(menuRow(l.k).row.my_reserved ?? 0) > 0;
        const sort = (a, b) => a.s.localeCompare(b.s) || b.y - a.y;
        const resd = lines.filter(isRes).sort(sort);
        const others = lines.filter(l => !isRes(l) && (l.open + l.hold > 0 || l.k in ord)).sort(sort);
        return { resd, others };
    }, [menuItems, contract, editing, ord, d]);
    const lineSplit = (l, qv) => {
        const fromHold = Math.min(qv, l.hold), fromRes = Math.min(qv - fromHold, l.resLeft), fromOpen = qv - fromHold - fromRes;
        return { fromHold, fromRes, fromOpen, max: l.resLeft + l.open + l.hold };
    };
    const lineError = (l, qv) => { const sp = lineSplit(l, qv); return not10(qv) ? TEN : qv > sp.max ? `Only ${fmt(sp.max)} lbs available` : ''; };
    const holdError = (l, qv, h) => {
        const max = lineSplit(l, qv).max, room = Math.max(max - qv, 0);
        return not10(h) ? TEN : h > room ? `Only ${fmt(room)} lbs left to hold (${fmt(max)} available − ${fmt(qv)} lb sample)` : '';
    };
    const allLines = [...orderable.resd, ...orderable.others];
    const detail = allLines.filter(l => (ord[l.k] ?? 0) > 0).map(l => {
        const qv = ord[l.k], sp = lineSplit(l, qv);
        return { k: l.k, s: l.s, y: l.y, q: qv, ...sp, sample: !!smp[l.k], hold: smp[l.k] ? (holdAsk[l.k] ?? 0) : 0, price: priceOf(l.y, l.s) };
    });
    const oTot = {
        lbs: detail.reduce((a, x) => a + x.q, 0), res: detail.reduce((a, x) => a + x.fromRes, 0), open: detail.reduce((a, x) => a + x.fromOpen + x.fromHold, 0),
        amount: detail.some(x => x.price == null) ? null : detail.reduce((a, x) => a + x.q * (x.price ?? 0), 0),
        bad: allLines.some(l => l.k in ord && (!!lineError(l, ord[l.k] ?? 0) || (smp[l.k] && !!holdError(l, ord[l.k] ?? 0, holdAsk[l.k] ?? 0)))),
    };
    function newOrder(pre = {}) {
        setEditing(null);
        setOrd(pre);
        setSmp({});
        setHoldAsk({});
        setPo('');
        setNote('');
        setWanted('');
        setOrderQ('');
        go('order');
    }
    function modify(o) {
        const m = {}, s = {}, h = {};
        for (const l of o.order_lines) {
            const k = kOf(l.strain, l.crop_year ?? cy);
            m[k] = (m[k] ?? 0) + Number(l.lbs);
            if (l.is_sample) {
                s[k] = true;
                if (l.hold_lbs)
                    h[k] = Number(l.hold_lbs);
            }
        }
        setOrderQ('');
        setEditing(o);
        setOrd(m);
        setSmp(s);
        setHoldAsk(h);
        setPo(o.po_number ?? '');
        setNote(o.notes ?? '');
        setWanted(o.wanted_date ?? '');
        go('order');
    }
    function closeOrder() { const was = editing; setEditing(null); setOrd({}); go(was ? 'orders' : 'home'); }
    async function placeOrder() {
        const lines = detail.map(x => ({ strain: x.s, crop_year: x.y, lbs: x.q, sample: x.sample, hold_lbs: x.sample && x.hold > 0 ? x.hold : null }));
        const was = editing;
        const id = await run(() => was ? backend.updateMyOrder(was.id, lines, note, po, wanted || null) : backend.placeOrder(lines, note, po, wanted || null, lines.some(l => l.sample)));
        if (id === undefined)
            return;
        const fresh = await loadAll(backend).catch(() => null);
        if (fresh)
            setD(fresh);
        const o = fresh?.orders.find(x => x.id === id);
        setLastOrder({ label: o ? soLabel(o) : was ? soLabel(was) : `Order #${id}`, lbs: oTot.lbs, res: oTot.res, amount: oTot.amount, detail, modified: !!was, po, wanted, note });
        setEditing(null);
        setOrd({});
        setSmp({});
        setHoldAsk({});
        setPo('');
        setNote('');
        setWanted('');
        setOpenRow('o' + id);
        go('ordered');
    }
    /* ---------- orders & statement ---------- */
    const orows = useMemo(() => {
        if (!d)
            return [];
        const invs = d.st?.invoices ?? [];
        const used = new Set();
        const rows = [];
        for (const o of d.orders) {
            if (o.status === 'draft' || o.status === 'cancelled')
                continue;
            const lines = o.order_lines.map(l => ({ s: l.strain, y: l.crop_year ?? cy, lbs: Number(l.lbs), price: l.price_per_lb != null ? Number(l.price_per_lb) : null, amount: null }));
            const sum = lines.some(l => l.price == null) ? null : lines.reduce((a, l) => a + (l.lbs ?? 0) * (l.price ?? 0), 0);
            const holdLbs = o.order_lines.reduce((a, l) => a + (l.is_sample ? Number(l.hold_lbs ?? 0) : 0), 0);
            if (o.status === 'shipped') {
                // the invoice for this order: linked through the app, or (orders from before the app) QuickBooks' invoice numbered with the SO
                const inv = o.so_number ? invs.find(i => i.kind !== 'CreditMemo' && i.so_number === o.so_number)
                    ?? invs.find(i => i.kind !== 'CreditMemo' && !used.has(i) && i.inv_number === o.so_number) ?? null : null;
                if (inv)
                    used.add(inv);
                const paid = inv ? inv.status === 'paid' || Number(inv.balance) <= 0 : null;
                const ql = inv?.qbo_id ? d.qbo[inv.qbo_id] : undefined; // what was actually invoiced (shipped weights) when QuickBooks has it
                rows.push({ key: 'o' + o.id, label: inv?.inv_number ?? soLabel(o), status: 'shipped', paid, date: o.shipped_date ?? inv?.invoice_date ?? o.order_date, due: inv?.due_date ?? null,
                    wanted: null, lines: ql?.length ? qboLines(ql) : lines, amount: inv ? Number(paid ? inv.total : inv.balance) : sum, po: o.po_number ?? inv?.po_number ?? null, so: o.so_number, order: o, inv, holdLbs, rank: 3 });
            }
            else {
                const ful = d.flags.includes(o.id);
                // pending = Lifted confirmed it (Approved); pallets assigned = In fulfillment
                const st = ful ? 'fulfillment' : o.status === 'pending' ? 'approved' : 'submitted';
                rows.push({ key: 'o' + o.id, label: soLabel(o), status: st, paid: null, date: o.order_date, due: null, wanted: o.wanted_date ?? null,
                    lines, amount: sum, po: o.po_number ?? null, so: o.so_number, order: o, inv: null, holdLbs, rank: st === 'submitted' ? 0 : st === 'approved' ? 1 : 2 });
            }
        }
        for (const i of invs) {
            if (used.has(i) || i.kind === 'CreditMemo' || i.status === 'void')
                continue;
            const paid = i.status === 'paid' || Number(i.balance) <= 0;
            // invoices from QuickBooks can share id 0 (not made in the app), so key them by QuickBooks' id or number
            rows.push({ key: 'i' + (i.qbo_id ?? i.inv_number ?? i.id), label: i.inv_number, status: 'shipped', paid, date: i.invoice_date, due: i.due_date, wanted: null,
                lines: i.qbo_id && d.qbo[i.qbo_id] ? qboLines(d.qbo[i.qbo_id]) : [], amount: Number(paid ? i.total : i.balance),
                po: i.po_number, so: i.so_number, order: null, inv: i, holdLbs: 0, rank: 3 });
        }
        return rows.sort((a, b) => a.rank - b.rank || String(b.date ?? '').localeCompare(String(a.date ?? '')));
    }, [d]);
    const openInvoices = (d?.st?.invoices ?? []).filter(i => i.status === 'open' && Number(i.balance) > 0 && i.kind !== 'CreditMemo');
    const sb = backend.client();
    async function viewInvoice(r) {
        const i = r.inv;
        if (!i)
            return;
        if (!i.qbo_id || !sb) {
            window.open(`/?doc=${i.share_token}`, '_blank', 'noopener');
            return;
        }
        const w = window.open('', '_blank');
        try {
            const { data } = await sb.auth.getSession();
            const res = await fetch('/api/qbo/doc', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify({ kind: i.kind ?? 'Invoice', qbo_id: i.qbo_id }) });
            const j = await res.json().catch(() => ({}));
            if (!res.ok || !j.url)
                throw new Error(j.error ?? `Couldn't open it (${res.status})`);
            if (w)
                w.location.href = j.url;
            else
                location.href = j.url;
        }
        catch (e) {
            w?.close();
            toast(String(e.message ?? e));
        }
    }
    /* ---------- holds ---------- */
    const holdMenuOpen = (h) => menuRow(kOf(h.strain, h.crop_year))?.open ?? 0;
    const holdErr = (h) => {
        const v = holdQty[h.line_id] ?? holdLbs(h), max = f10(holdLbs(h)) + holdMenuOpen(h);
        return not10(v) ? TEN : v > max ? `Only ${fmt(max)} lbs available (${fmt(holdLbs(h))} held + ${fmt(holdMenuOpen(h))} on the menu)` : v <= 0 ? 'Enter how many lbs to reserve' : '';
    };
    async function holdSendAll() {
        const picked = liveHolds.filter(h => holdSel.includes(h.line_id) && h.state === 'active' && !holdReq(h));
        const by = new Map();
        for (const h of picked) {
            const k = kOf(h.strain, h.crop_year), v = holdQty[h.line_id] ?? f10(holdLbs(h)), x = by.get(k);
            if (x)
                x.v += v;
            else
                by.set(k, { h, v });
        }
        const lines = [], ch = [];
        for (const [k, { h, v }] of by) {
            const r = resRow(k), base = r ? (r.asked ?? r.res) : 0;
            lines.push({ strain: h.strain, crop_year: h.crop_year, lbs: base + v, hold_line: h.line_id });
            ch.push({ s: h.strain, y: h.crop_year, from: r?.res ?? 0, to: base + v, isNew: !r });
        }
        const n = await run(() => backend.requestReserveLines(lines, 'From sample holds'));
        if (n === undefined)
            return;
        setHoldSel([]);
        setHoldQty({});
        setLastReq(ch);
        setLastReqRows(reqRows(ch));
        setLastReqNote('From sample holds');
        await reload();
        go('sent');
    }
    async function doRelease(h) {
        const ok = await run(() => backend.releaseMyHold(h.line_id).then(() => true));
        setReleasing(null);
        if (!ok)
            return;
        setHoldSel(s => s.filter(x => x !== h.line_id));
        toast(`${fmt(holdLbs(h))} lbs of ${h.strain} released`);
        reload();
    }
    /* ---------- screens ---------- */
    const back = (to, label) => to === 'home' && desk ? null : _jsxs("button", { className: c('back'), onClick: () => go(to), children: [I.back, label] });
    const balance = d?.st?.balance;
    function Home() {
        const open = orows.filter(o => o.status !== 'shipped'), nSub = open.filter(o => o.status === 'submitted').length, nApp = open.filter(o => o.status === 'approved').length, nFul = open.filter(o => o.status === 'fulfillment').length;
        const mon = new Date().toLocaleDateString('en-US', { month: 'short' });
        const cur = d?.mc?.months?.length ? d.mc.months[d.mc.months.length - 1] : null;
        const thisMonth = cur && cur.month.slice(0, 7) === iso(new Date()).slice(0, 7) ? Number(cur.lbs) : Number(d?.st?.month.shipped ?? 0);
        const min = d?.mc?.monthly_min_lbs ?? d?.st?.month.min ?? null, leftMin = min != null ? Math.max(Number(min) - thisMonth, 0) : null;
        const menuTotal = menuItems.reduce((a, m) => a + m.open, 0), menuN = menuItems.filter(m => m.open > 0).length;
        const hs = liveHolds, act = hs.filter(h => h.state === 'active').sort((a, b) => daysUntil(a.until) - daysUntil(b.until)), soon = act[0];
        return (_jsxs("div", { className: c('screen'), children: [_jsxs("header", { className: c('hdr home-hdr'), children: [_jsxs("div", { className: c('top'), children: [_jsx("a", { className: c('logolink'), href: "https://www.liftedfarms.com", target: "_blank", rel: "noopener noreferrer", "aria-label": "Lifted website (opens in a new tab)", children: _jsx("img", { className: c('logo'), src: "/logo-dark.svg", alt: "Lifted" }) }), _jsxs("span", { className: c('row'), style: { gap: 8 }, children: [_jsx("button", { className: c('iconbtn'), onClick: openHelp, "aria-label": "Help & feedback", children: I.chat }), _jsx("button", { className: c('iconbtn'), onClick: () => setAcct(true), "aria-label": "Account settings", children: I.user })] })] }), _jsx("p", { className: c('cust'), children: me.customer_name }), _jsx("p", { className: c('bal'), children: balance ? money2(balance.amount) : '—' }), balance && balance.past_due > 0
                            ? _jsxs("p", { className: c('sub'), style: { color: '#f9a8b8' }, children: ["Balance \u00B7 ", money2(balance.past_due), " past due"] })
                            : _jsx("p", { className: c('sub mint'), children: balance ? 'Balance · nothing past due' : 'Balance' })] }), _jsxs("main", { className: c('main lift'), children: [adjustNote(), a2hs && !desk && _jsx("section", { className: c('card a2hs'), children: _jsxs("div", { className: c('row'), style: { alignItems: 'flex-start', gap: 10 }, children: [_jsxs("div", { className: c('grow'), children: [_jsx("p", { className: c('name'), style: { fontSize: 16 }, children: "Add Lifted to your home screen" }), _jsxs("p", { className: c('meta'), style: { margin: '4px 0 0' }, children: [a2hs === 'ios'
                                                        ? _jsxs(_Fragment, { children: ["In Safari, tap the ", _jsx("b", { children: "Share" }), " button ", I.share, ", then ", _jsx("b", { children: "View More" }), ", then ", I.plusbox, " ", _jsx("b", { children: "Add to Home Screen" }), "."] })
                                                        : _jsxs(_Fragment, { children: ["Tap the ", _jsx("b", { children: "\u22EE" }), " menu, then ", _jsx("b", { children: "Add to Home screen" }), " (or ", _jsx("b", { children: "Install app" }), ")."] }), ' ', "Open the portal from that icon and you'll stay signed in. You'll sign in once more the first time."] })] }), _jsx("button", { className: c('iconbtn'), style: { color: 'var(--muted)', borderColor: 'var(--line)', flex: '0 0 auto' }, onClick: hideA2hs, "aria-label": "Hide this tip", children: I.close })] }) }), contract && _jsxs("button", { className: c('tile'), onClick: () => go('reserves'), children: [_jsxs("div", { className: c('row'), children: [_jsxs("div", { className: c('grow'), children: [_jsx("p", { className: c('lbl'), children: "Contract Reserves" }), _jsxs("p", { className: c('big'), children: [fmt(totals.left), " lbs left"] })] }), _jsx("span", { className: c('pillbtn'), children: "View / Edit" })] }), _jsxs("p", { className: c('foot'), children: ["of ", fmt(totals.res), " reserved"] })] }), _jsxs("button", { className: c('tile'), onClick: () => go('menu'), children: [_jsxs("div", { className: c('row'), children: [_jsxs("div", { className: c('grow'), children: [_jsx("p", { className: c('lbl'), children: "Open Menu" }), _jsxs("p", { className: c('big'), children: [fmt(menuTotal), " lbs open"] })] }), _jsx("span", { className: c('pillbtn'), children: contract ? 'Add to Reserves' : 'View Menu' })] }), _jsx("p", { className: c('foot'), children: plural(menuN, 'strain') })] }), d?.yields && yOrders.length > 0 && _jsx("button", { className: c('tile'), onClick: () => go('yields'), children: _jsxs("div", { className: c('row'), children: [_jsxs("div", { className: c('grow'), children: [_jsx("p", { className: c('lbl'), children: "Yields" }), _jsx("p", { className: c('big'), children: yToDo.length ? `${plural(yToDo.length, 'order')} to report` : 'All reported' })] }), _jsx("span", { className: c('pillbtn'), children: "View / Report" })] }) }), _jsxs("div", { className: contract ? c('grid2') : '', children: [_jsxs("button", { className: c('tile small'), onClick: () => { setFilter('all'); go('orders'); }, children: [_jsx("p", { className: c('lbl'), children: "Orders & Statement" }), _jsxs("p", { className: c('big'), children: [open.length, " in progress"] }), open.length > 0 && _jsx("p", { className: c('foot'), style: { color: 'var(--blue)', marginTop: 4 }, children: [nSub ? `${nSub} submitted` : '', nApp ? `${nApp} approved` : '', nFul ? `${nFul} in fulfillment` : ''].filter(Boolean).join(' · ') })] }), contract && _jsxs("button", { className: c('tile small tint'), onClick: () => go('contract'), children: [_jsxs("p", { className: c('lbl'), children: ["My Contract \u00B7 ", mon] }), _jsxs("p", { className: c('big'), children: [fmt(thisMonth), " lbs ", _jsx("span", { style: { fontSize: 13, fontWeight: 500 }, children: "picked up" })] }), _jsx("p", { className: c('foot'), style: { marginTop: 4 }, children: min == null ? 'No monthly minimum' : leftMin ? _jsxs(_Fragment, { children: [_jsxs("b", { style: { color: 'var(--blue)' }, children: [fmt(leftMin), " to go"] }), " \u00B7 ", fmt(min), " lb min"] }) : _jsxs("b", { children: ["\u2713 ", fmt(min), " lb min met"] }) })] })] }), hs.length > 0 && _jsxs("button", { className: c('tile'), style: { background: 'var(--gold-bg)' }, onClick: () => go('holds'), children: [_jsxs("div", { className: c('row'), children: [_jsxs("div", { className: c('grow'), children: [_jsx("p", { className: c('lbl'), style: { color: 'var(--gold)' }, children: "Sample Holds for You" }), _jsxs("p", { className: c('big'), children: [plural(hs.length, 'strain'), " \u00B7 ", fmt(hs.reduce((a, h) => a + holdLbs(h), 0)), " lbs"] })] }), _jsx("span", { className: c('pillbtn'), style: { background: '#fff', color: 'var(--gold)' }, children: "Review" })] }), _jsx("p", { className: c('foot'), style: { color: 'var(--gold)', marginTop: 2 }, children: soon ? `Next hold ends in ${plural(daysUntil(soon.until), 'day')} (${soon.strain})` : 'Waiting on Lifted to confirm' })] })] }), _jsx("div", { className: c('dock'), children: _jsx("button", { className: c('btn full'), onClick: () => newOrder(), children: "Place an order" }) })] }));
    }
    function DeskHome() {
        const open = orows.filter(o => o.status !== 'shipped');
        const cur = d?.mc?.months?.length ? d.mc.months[d.mc.months.length - 1] : null;
        const thisMonth = cur && cur.month.slice(0, 7) === iso(new Date()).slice(0, 7) ? Number(cur.lbs) : Number(d?.st?.month.shipped ?? 0);
        const min = d?.mc?.monthly_min_lbs ?? d?.st?.month.min ?? null, leftMin = min != null ? Math.max(Number(min) - thisMonth, 0) : null;
        const months = d?.mc?.months ?? [], done = cur && cur.month.slice(0, 7) === iso(new Date()).slice(0, 7) ? months.slice(0, -1) : months;
        const since = min != null ? done.reduce((a, m) => a + Number(m.lbs) - Number(min), 0) : null;
        const menuTotal = menuItems.reduce((a, m) => a + m.open, 0), menuN = menuItems.filter(m => m.open > 0).length;
        const hs = liveHolds.slice().sort((a, b) => (a.state === 'active' ? 0 : 1) - (b.state === 'active' ? 0 : 1) || daysUntil(a.until) - daysUntil(b.until));
        const mc = d?.mc, monthName = new Date().toLocaleDateString('en-US', { month: 'long' });
        const contracted = Number(mc?.contract_lbs ?? 0), gap = contracted - reserves.filter(r => r.y === (mc?.year ?? cy)).reduce((a, r) => a + r.res, 0);
        const terms = [contract ? `${mc?.year ?? cy} crop contract` : '', mc?.payment_terms ?? d?.st?.customer.terms ?? '', mc?.price_per_lb != null ? `$${Number(mc.price_per_lb).toFixed(2)}/lb` : ''].filter(Boolean).join(' · ');
        const sign = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
        const chip = (o) => o.status === 'submitted' ? _jsx("span", { className: c('chip c-sub'), children: "Submitted" }) : o.status === 'approved' ? _jsx("span", { className: c('chip c-ok'), children: "Approved" }) : _jsx("span", { className: c('chip c-ful'), children: "In fulfillment" });
        return (_jsxs("div", { className: c('screen dhome'), children: [_jsxs("div", { className: c('dhead'), children: [_jsxs("div", { children: [_jsx("h1", { children: me.customer_name }), terms && _jsx("p", { className: c('meta'), style: { fontSize: 15, margin: '4px 0 0' }, children: terms })] }), _jsx("button", { className: c('btn hcta'), onClick: () => newOrder(), children: "Place an order" })] }), adjustNote(), _jsxs("div", { className: c('kpis'), children: [_jsxs("button", { className: c('kpi ink'), onClick: () => { setFilter('all'); go('orders'); }, children: [_jsx("p", { children: "Balance" }), _jsx("b", { children: balance ? money(balance.amount) : '—' }), _jsxs("small", { style: { color: balance && balance.past_due > 0 ? '#f9a8b8' : 'var(--mint)' }, children: [balance && balance.past_due > 0 ? `${money2(balance.past_due)} past due` : 'Nothing past due', " \u00B7 ", plural(openInvoices.length, 'open invoice')] })] }), contract && _jsxs("button", { className: c('kpi'), onClick: () => go('reserves'), children: [_jsx("p", { children: "Contract Reserves" }), _jsxs("b", { children: [fmt(dt.rem), " lbs remaining"] }), _jsxs("small", { children: ["of ", fmt(totals.res), " reserved \u00B7 ", fmt(dt.ful), " fulfilled \u00B7 ", fmt(dt.so), " on open SOs"] })] }), contract && _jsxs("button", { className: c('kpi tint'), onClick: () => go('contract'), children: [_jsxs("p", { children: ["My Contract \u00B7 ", monthName] }), _jsxs("b", { children: [fmt(thisMonth), " lbs ", _jsx("span", { style: { fontSize: 14, fontWeight: 500 }, children: "picked up" })] }), _jsxs("small", { children: [min == null ? 'No monthly minimum' : leftMin ? _jsxs(_Fragment, { children: [_jsxs("b", { style: { color: 'var(--blue)', fontSize: 13, display: 'inline' }, children: [fmt(leftMin), " to go"] }), " \u00B7 ", fmt(min), " lb min"] }) : `✓ ${fmt(min)} lb min met`, since != null && done.length > 0 ? ` · ${sign(since)} since Oct` : ''] })] }), contract ? _jsxs("button", { className: c('kpi'), onClick: () => go('menu'), children: [_jsx("p", { children: "Open Menu" }), _jsxs("b", { children: [fmt(menuTotal), " lbs open"] }), _jsxs("small", { children: [plural(menuN, 'strain'), " \u00B7 Add to Reserves"] })] })
                            : _jsxs("div", { className: c('kpi'), children: [_jsx("p", { children: "Open Menu" }), _jsxs("b", { children: [fmt(menuTotal), " lbs open"] }), _jsxs("small", { children: [plural(menuN, 'strain'), " \u00B7 see the menu below"] })] }), !contract && _jsxs("button", { className: c('kpi'), onClick: () => { setFilter('all'); go('orders'); }, children: [_jsx("p", { children: "Orders & Statement" }), _jsxs("b", { children: [open.length, " in progress"] }), _jsx("small", { children: "Orders, invoices and your statement" })] })] }), _jsxs("div", { className: c('dgrid'), children: [contract ? _jsxs("section", { className: c('card'), children: [_jsxs("div", { className: c('dcard-h'), children: [_jsx("h2", { children: "Contract Reserves" }), _jsx("button", { className: c('pillbtn'), style: { border: 0 }, onClick: () => go('resmenu'), children: "Open Reserves & Menu" })] }), reserves.length === 0 ? _jsx("p", { className: c('meta'), style: { padding: 18, margin: 0 }, children: "No reserves yet. Add strains from the open menu." }) : _jsxs("div", { className: c('hscroll'), children: [_jsxs("div", { className: c('htb head gt'), children: [sh('home', 's', 'Strain'), sh('home', 'g', 'Grade'), sh('home', 't', 'Type'), sh('home', 'res', 'Reserved'), sh('home', 'ful', 'Fulfilled'), sh('home', 'so', 'Open SO'), sh('home', 'rem', 'Remaining'), sh('home', 'open', _jsxs(_Fragment, { children: ["Open menu", _jsx("br", {}), "available"] }))] }), sortRows('home', reserves, { g: r => gradeN(r.s), t: r => typeN(r.s), res: r => r.res, ful: r => r.ful, so: r => r.so, rem: r => r.rem, open: r => menuRow(r.k)?.open ?? 0 }).map(r => _jsxs("div", { className: c('htb gt'), children: [_jsxs("span", { className: c('rmname'), children: [r.s, " ", yrTag(r.y), " ", r.asked != null && _jsxs("span", { className: c('chip c-wait'), children: [r.res ? `Asked ${fmt(r.asked)}` : `New · asked ${fmt(r.asked)}`, " \u00B7 waiting"] })] }), gradeCell(r.s), typeCell(r.s), _jsx("span", { children: r.res ? fmt(r.res) : '–' }), _jsx("span", { className: c('dim'), children: fmt(r.ful) }), _jsx("span", { className: c('dim'), children: fmt(r.so) }), _jsx("b", { children: fmt(r.rem) }), _jsx("span", { className: c('dim'), children: fmt(menuRow(r.k)?.open ?? 0) })] }, r.k)), _jsxs("div", { className: c('htb total gt'), children: [_jsxs("b", { children: ["Total \u00B7 ", plural(reserves.length, 'strain')] }), _jsx("span", {}), _jsx("span", {}), _jsx("b", { children: fmt(totals.res) }), _jsx("span", { className: c('dim'), children: fmt(dt.ful) }), _jsx("span", { className: c('dim'), children: fmt(dt.so) }), _jsx("b", { style: { color: 'var(--teal-ink)' }, children: fmt(dt.rem) }), _jsx("span", {})] })] }), gap > 0 && _jsxs("p", { className: c('meta'), style: { padding: '10px 18px 14px', margin: 0 }, children: [fmt(gap), " lbs of your ", fmt(contracted), " lb contract aren't reserved to a strain yet. ", _jsx("button", { className: c('linkish'), style: { minWidth: 0, textAlign: 'left', display: 'inline' }, onClick: () => go('menu'), children: "Add to Reserves" })] })] }) : _jsxs("section", { className: c('card'), children: [_jsxs("div", { className: c('dcard-h'), children: [_jsx("h2", { children: "Open Menu" }), _jsx("button", { className: c('pillbtn'), style: { border: 0 }, onClick: () => newOrder(), children: "Place an order" })] }), (() => {
                                    const all = menuItems.filter(m => m.open > 0), ql = q.toLowerCase(), years = [...new Set(all.map(m => m.y))].sort((a, b) => b - a);
                                    const om = all.filter(m => (!ql || m.s.toLowerCase().includes(ql)) && (menuYear === 'all' || m.y === menuYear));
                                    return _jsxs(_Fragment, { children: [all.length > 0 && _jsxs("div", { className: c('rmbar'), style: { borderTop: '1px solid var(--line)' }, children: [_jsxs("div", { className: c('filters'), role: "group", "aria-label": "Filter the menu", children: [_jsx("button", { "aria-pressed": menuYear === 'all', onClick: () => setMenuYear('all'), children: "All" }), years.length > 1 && years.map(y => _jsx("button", { "aria-pressed": menuYear === y, onClick: () => setMenuYear(menuYear === y ? 'all' : y), children: y }, y))] }), _jsxs("label", { className: c('search'), children: [I.search, _jsx("input", { type: "search", placeholder: "Search strains", value: q, onChange: e => setQ(e.target.value), "aria-label": "Search strains" })] })] }), all.length > 0 && om.length === 0 ? _jsx("p", { className: c('meta'), style: { padding: 18, margin: 0, borderTop: '1px solid var(--line)' }, children: "No strains match." }) : om.length === 0 ? _jsx("p", { className: c('meta'), style: { padding: 18, margin: 0 }, children: "Nothing on the open menu right now." }) : _jsxs("div", { className: c('hscroll tall'), children: [_jsxs("div", { className: c('htb head four'), children: [sh('homenc', 's', 'Strain'), sh('homenc', 'g', 'Grade'), sh('homenc', 't', 'Type'), sh('homenc', 'open', 'Open menu available')] }), sortRows('homenc', om, { open: m => m.open, g: m => gradeN(m.s), t: m => typeN(m.s) }).map(m => _jsxs("div", { className: c('htb four'), children: [_jsxs("span", { className: c('rmname'), children: [m.s, " ", yrTag(m.y), " ", m.hold > 0 && _jsxs("span", { className: c('chip c-wait'), children: [fmt(m.hold), " held for you"] })] }), gradeCell(m.s), typeCell(m.s), _jsx("b", { children: fmt(m.open) })] }, m.k)), _jsxs("div", { className: c('htb total four'), children: [_jsxs("b", { children: ["Total \u00B7 ", plural(om.length, 'strain')] }), _jsx("span", {}), _jsx("span", {}), _jsx("b", { style: { color: 'var(--teal-ink)' }, children: fmt(om.reduce((t, m) => t + m.open, 0)) })] })] })] });
                                })()] }), _jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 16 }, children: [_jsxs("section", { className: c('card'), children: [_jsxs("div", { className: c('dcard-h'), children: [_jsx("h2", { children: "Orders in progress" }), _jsx("button", { className: c('linkish'), style: { minWidth: 0 }, onClick: () => { setFilter('all'); go('orders'); }, children: "All orders" })] }), open.length === 0 && _jsxs("p", { className: c('meta'), style: { padding: '0 18px 16px', margin: 0 }, children: ["Nothing in progress. ", _jsx("button", { className: c('linkish'), style: { minWidth: 0, display: 'inline' }, onClick: () => newOrder(), children: "Place an order" })] }), open.map(o => _jsxs("button", { className: c('li btnrow'), style: { borderTop: '1px solid var(--line-2)' }, onClick: () => { setFilter('all'); setOpenRow(o.key); go('orders'); }, children: [_jsxs("div", { className: c('grow'), children: [_jsxs("p", { className: c('name'), children: [o.label, " ", chip(o)] }), _jsxs("p", { className: c('meta'), children: ["Placed ", shortDate(o.date), o.wanted ? _jsxs(_Fragment, { children: [" \u00B7 ", _jsxs("b", { style: { color: 'var(--ink)', fontWeight: 600 }, children: ["Requested delivery ", niceDate(o.wanted)] })] }) : ' · no date requested'] })] }), _jsxs("div", { className: c('r'), children: [_jsx("b", { className: c('num'), children: o.amount != null ? money(o.amount) : '' }), _jsxs("p", { className: c('meta'), children: [fmt(o.lines.reduce((a, l) => a + (l.lbs ?? 0), 0)), " lbs"] })] })] }, o.key))] }), yToDo.length > 0 && _jsxs("section", { className: c('card'), children: [_jsxs("div", { className: c('dcard-h'), children: [_jsx("h2", { children: "Report Yields" }), _jsx("button", { className: c('linkish'), style: { minWidth: 0 }, onClick: () => go('yields'), children: "All" })] }), yToDo.slice(0, 4).map(({ o, rep }) => _jsxs("button", { className: c('li btnrow'), style: { borderTop: '1px solid var(--line-2)' }, onClick: () => openYield(o.order.id), children: [_jsxs("div", { className: c('grow'), children: [_jsxs("p", { className: c('name'), children: [o.label, " ", rep?.savedAt ? _jsx("span", { className: c('chip c-wait'), children: "Draft" }) : null] }), _jsxs("p", { className: c('meta'), children: ["Shipped ", shortDate(o.date), " \u00B7 ", plural(new Set(o.order.order_lines.map(l => l.strain)).size, 'strain')] })] }), _jsx("span", { className: c('pillbtn'), children: rep?.savedAt ? 'Finish' : 'Report' })] }, o.key))] }), hs.length > 0 && _jsxs("section", { className: c('card'), style: { background: 'var(--gold-bg)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }, children: [_jsxs("div", { className: c('row'), style: { justifyContent: 'space-between' }, children: [_jsx("h2", { style: { margin: 0, fontSize: 18, fontWeight: 600 }, children: "Sample Holds for You" }), _jsx("button", { className: c('pillbtn'), style: { border: 0, background: '#fff', color: 'var(--gold)' }, onClick: () => go('holds'), children: "Review" })] }), hs.map(h => {
                                            const dl = daysUntil(h.until);
                                            return _jsxs("div", { className: c('row'), style: { fontSize: 14, gap: 8 }, children: [_jsxs("span", { className: c('grow'), children: [h.strain, " ", yrTag(h.crop_year)] }), _jsxs("b", { style: { width: 70, textAlign: 'right' }, children: [fmt(holdLbs(h)), " lbs"] }), _jsx("span", { style: { width: 100, textAlign: 'right', fontWeight: 600, color: h.state !== 'active' ? 'var(--blue)' : dl <= 3 ? 'var(--red)' : 'var(--gold)' }, children: h.state !== 'active' ? 'Waiting' : `${plural(dl, 'day')} left` })] }, h.line_id);
                                        })] })] })] })] }));
    }
    // ---------- help & feedback: a note to Lifted (not a ticket; Sales sees them in Sales > Customer feedback) ----------
    const [fb, setFb] = useState(null);
    // which part of the portal they're in, named the way the left menu names it (sent with feedback so the team knows where it came from)
    const NAV_OF = { edit: 'resmenu', reserves: 'resmenu', reqReview: 'resmenu', sent: 'resmenu', menu: 'resmenu', order: 'order', review: 'order', ordered: 'order', yield: 'yields', ysent: 'yields' };
    const NAV_LABEL = { home: 'Home', resmenu: 'Reserves & Menu', yields: 'Yields', holds: 'Sample Holds', orders: 'Orders & Statement', contract: 'My Contract', activity: 'Reserve History', order: 'Place an order' };
    const navOn = NAV_OF[screen] ?? screen, moduleName = NAV_LABEL[navOn] ?? navOn;
    const openHelp = () => { setAcct(false); setFb({ kind: 'problem', text: '', sent: false }); };
    async function sendFeedback() {
        if (!fb || !fb.text.trim())
            return;
        const device = `${desk ? 'Desktop' : 'Phone'} · ${navigator.userAgent.slice(0, 160)}`;
        const ok = await run(async () => {
            const r = await backend.client()?.rpc('send_portal_feedback', { p_kind: fb.kind, p_message: fb.text.trim(), p_screen: moduleName, p_device: device });
            if (r?.error)
                throw new Error(r.error.message);
            return true;
        });
        if (ok)
            setFb({ ...fb, sent: true });
    }
    function feedbackSheet() {
        if (!fb)
            return null;
        const kinds = [['problem', "Something's not working"], ['question', 'A question'], ['idea', 'An idea']];
        return _jsxs(_Fragment, { children: [_jsx("div", { className: c('scrim'), onClick: () => setFb(null) }), _jsx("div", { className: c('sheet'), role: "dialog", "aria-modal": "true", "aria-labelledby": "cp-fb-t", children: fb.sent ? _jsxs(_Fragment, { children: [_jsx("h2", { id: "cp-fb-t", style: { margin: 0, fontSize: 22 }, children: "Thanks, we got it" }), _jsxs("p", { className: c('meta'), style: { fontSize: 15, margin: 0 }, children: ["Your note went straight to the Lifted team. If it needs an answer, we'll reach out to ", me.email, "."] }), _jsx("button", { className: c('btn full'), onClick: () => setFb(null), children: "Done" })] })
                        : _jsxs(_Fragment, { children: [_jsxs("div", { className: c('row'), style: { justifyContent: 'space-between' }, children: [_jsx("h2", { id: "cp-fb-t", style: { margin: 0, fontSize: 22 }, children: "Help & feedback" }), _jsx("button", { className: c('iconbtn'), style: { color: 'var(--ink)', borderColor: 'var(--line)' }, onClick: () => setFb(null), "aria-label": "Close", children: I.close })] }), _jsx("p", { className: c('meta'), style: { fontSize: 15, margin: 0 }, children: "Tell us what's going on. It goes straight to your Lifted team." }), _jsx("div", { className: c('filters'), role: "radiogroup", "aria-label": "What is it?", children: kinds.map(([k, l]) => _jsx("button", { role: "radio", "aria-checked": fb.kind === k, "aria-pressed": fb.kind === k, onClick: () => setFb({ ...fb, kind: k }), children: l }, k)) }), _jsxs("label", { className: c('field'), children: [fb.kind === 'problem' ? 'What happened?' : fb.kind === 'question' ? 'Your question' : 'Your idea', _jsx("textarea", { className: c('fbtext'), rows: 5, maxLength: 5000, autoFocus: true, value: fb.text, onChange: e => setFb({ ...fb, text: e.target.value }), placeholder: fb.kind === 'problem' ? 'What were you trying to do, and what went wrong?' : fb.kind === 'question' ? 'Ask us anything about the portal, your orders or reserves' : 'What would make the portal better for you?' })] }), _jsxs("p", { className: c('meta'), style: { margin: 0, fontSize: 13 }, children: ["We'll see your name, that you were in ", _jsx("b", { children: moduleName }), ", and whether you're on a phone or computer."] }), _jsxs("div", { className: c('row'), style: { gap: 10 }, children: [_jsx("button", { className: c('btn ghost'), style: { flex: 1 }, onClick: () => setFb(null), children: "Cancel" }), _jsx("button", { className: c('btn'), style: { flex: 1.4 }, disabled: busy || !fb.text.trim(), onClick: sendFeedback, children: busy ? 'Sending…' : 'Send to Lifted' })] })] }) })] });
    }
    // the +/− step chooser (Reserves & Menu and the desktop order screen share it)
    function stepSet() {
        return _jsxs("div", { className: c('stepset'), role: "group", "aria-label": "How much + and \u2212 move", children: [_jsx("span", { children: "+/\u2212 step" }), STEPS.map(([n, t]) => _jsx("button", { "aria-pressed": rmStep === n && !stepCustom, title: t, onClick: () => { setStepCustom(false); setRmStep(n); }, children: n }, n)), stepCustom || !STEPS.some(([n]) => n === rmStep)
                    ? _jsx("input", { className: c('stepin'), type: "text", inputMode: "numeric", "aria-label": "Custom step, lbs", autoFocus: stepCustom, value: stepTxt ?? String(rmStep), onChange: e => { const t = e.target.value.replace(/[^0-9]/g, '').slice(0, 5); setStepTxt(t); if (Number(t) >= 10)
                            setRmStep(Math.round(Number(t) / 10) * 10); }, onBlur: () => { setStepTxt(null); setStepCustom(false); }, onKeyDown: e => { if (e.key === 'Enter')
                            e.target.blur(); } })
                    : _jsx("button", { onClick: () => { setStepCustom(true); setStepTxt(''); }, children: "Custom" }), _jsx("span", { children: "lbs" })] });
    }
    // desktop: Contract Reserves + Open Menu + Edit Reserves on one table; edits happen in the row
    function ResMenuScreen() {
        const ql = q.toLowerCase();
        const keys = [...new Set([...reserves.map(r => r.k), ...menuItems.filter(m => m.open > 0 || m.hold > 0).map(m => m.k)])];
        const all = keys.map(k => { const r = resRow(k), m = menuRow(k); return { k, s: r?.s ?? m.s, y: r?.y ?? m.y, r, m, t: editNew.find(x => x.k === k) }; })
            .sort((a, b) => a.s.localeCompare(b.s) || b.y - a.y);
        const years = [...new Set(all.map(x => x.y))].sort((a, b) => b - a);
        const list = sortRows('rm', all.filter(x => (!ql || x.s.toLowerCase().includes(ql)) && (menuYear === 'all' || x.y === menuYear) && (gradeF === 'all' || tagOf(x.s).g === gradeF)
            && (rmRes === 'all' || (rmRes === 'res' ? !!x.r : !x.r))), { res: x => x.r?.res ?? 0, ful: x => x.r?.ful ?? 0, so: x => x.r?.so ?? 0, rem: x => x.r?.res ? x.r.rem : 0, open: x => x.m?.open ?? 0, g: x => gradeN(x.s), t: x => typeN(x.s) });
        const menuBad = editNew.some(n => n.lbs > 0 && !!newErr(n)) || reserves.some(r => !!resErr(r));
        const menuTotal = menuItems.reduce((a, m) => a + m.open, 0);
        const fb = (on, label, f) => _jsx("button", { "aria-pressed": on, onClick: f, children: label }, label);
        const sum = changes.slice(0, 3).map(ch => ch.isNew ? `${ch.s}${ch.y < cy ? ` (${ch.y})` : ''} new ${fmt(ch.to)}` : `${ch.s} ${fmt(ch.from)} → ${fmt(ch.to)}`).join(' · ') + (changes.length > 3 ? ` +${changes.length - 3} more` : '');
        const bad = [...reserves.filter(r => !!resErr(r)).map(r => r.s), ...editNew.filter(n => n.lbs > 0 && !!newErr(n)).map(n => n.s)];
        return (_jsxs("div", { className: c('screen rm'), children: [_jsxs("header", { className: c('hdr'), children: [_jsxs("div", { className: c('row'), style: { justifyContent: 'space-between', alignItems: 'center' }, children: [_jsx("h1", { children: "Reserves & Menu" }), !!d?.acts.length && _jsxs("button", { className: c('pillbtn hist'), onClick: () => go('activity'), children: [I.clock, " Reserve history"] })] }), _jsx("p", { className: c('sub'), children: "Everything on the open menu and everything you have reserved, in one place. Lifted reviews every reserve change." })] }), _jsxs("div", { className: c('kpis five'), children: [_jsxs("div", { className: c('kpi'), children: [_jsx("p", { children: "Reserved" }), _jsxs("b", { children: [fmt(totals.res), " lbs"] })] }), _jsxs("div", { className: c('kpi'), children: [_jsx("p", { children: "Fulfilled" }), _jsxs("b", { children: [fmt(dt.ful), " lbs"] })] }), _jsxs("div", { className: c('kpi'), children: [_jsx("p", { children: "On open SOs" }), _jsxs("b", { children: [fmt(dt.so), " lbs"] })] }), _jsxs("div", { className: c('kpi tint'), children: [_jsx("p", { children: "Remaining" }), _jsxs("b", { children: [fmt(dt.rem), " lbs"] })] }), _jsxs("div", { className: c('kpi'), children: [_jsx("p", { children: "Open menu available" }), _jsxs("b", { children: [fmt(menuTotal), " lbs"] })] })] }), _jsxs("section", { className: c('card rmcard'), children: [_jsxs("div", { className: c('rmbar'), children: [_jsxs("div", { className: c('filters'), role: "group", "aria-label": "Filter strains", children: [fb(rmRes === 'all' && menuYear === 'all' && gradeF === 'all', 'All', () => { setRmRes('all'); setMenuYear('all'); setGradeF('all'); }), fb(rmRes === 'res', 'Reserved', () => setRmRes(rmRes === 'res' ? 'all' : 'res')), fb(rmRes === 'not', 'Not reserved', () => setRmRes(rmRes === 'not' ? 'all' : 'not')), years.map(y => fb(menuYear === y, String(y), () => setMenuYear(menuYear === y ? 'all' : y))), fb(gradeF === 'SHO', 'SHO', () => setGradeF(gradeF === 'SHO' ? 'all' : 'SHO')), fb(gradeF === 'BHO', 'BHO', () => setGradeF(gradeF === 'BHO' ? 'all' : 'BHO'))] }), stepSet(), _jsxs("label", { className: c('search'), children: [I.search, _jsx("input", { type: "search", placeholder: "Search strains", value: q, onChange: e => setQ(e.target.value), "aria-label": "Search strains" })] })] }), _jsx("div", { className: c('rmscroll'), children: _jsxs("div", { style: { minWidth: 990 }, children: [_jsxs("div", { className: c('rmt head'), children: [sh('rm', 's', 'Strain'), sh('rm', 'g', 'Grade'), sh('rm', 't', 'Type'), sh('rm', 'res', 'Reserved'), sh('rm', 'ful', 'Fulfilled'), sh('rm', 'so', 'Open SO'), sh('rm', 'rem', 'Remaining'), sh('rm', 'open', _jsxs(_Fragment, { children: ["Open menu", _jsx("br", {}), "available"] })), _jsx("span", { children: "Change reserve" })] }), list.length === 0 && _jsx("p", { className: c('meta'), style: { padding: 18, margin: 0 }, children: "Nothing matches." }), list.map(x => {
                                        const { k, r, m, t } = x, open = m?.open ?? 0;
                                        const hold = m && m.hold > 0 ? _jsxs("span", { className: c('chip c-wait'), children: [fmt(m.hold), " held for you"] }) : null;
                                        if (r) {
                                            const v = ed[k] ?? 0, base = r.asked ?? r.res, delta = v - base, changed = delta !== 0, e = resErr(r);
                                            const newRem = Math.max(v - r.ful - r.so, 0);
                                            return _jsxs("div", { className: c(`rmt ${changed ? (e ? 'bad' : 'on') : ''}`), children: [_jsxs("span", { className: c('rmname'), children: [x.s, " ", yrTag(x.y), " ", r.asked != null && _jsxs("span", { className: c('chip c-wait'), children: [r.res ? `Asked ${fmt(r.asked)}` : `New · asked ${fmt(r.asked)}`, " \u00B7 waiting"] }), hold, e && _jsx("span", { className: c('rmerr'), title: e, children: e })] }), gradeCell(x.s), typeCell(x.s), _jsx("span", { children: changed ? _jsxs(_Fragment, { children: [_jsxs("span", { className: c('muted'), children: [fmt(base), " \u2192"] }), " ", _jsx("b", { children: fmt(v) })] }) : r.res ? fmt(r.res) : _jsx("span", { className: c('muted'), children: "\u2013" }) }), r.res || r.ful || r.so ? _jsxs(_Fragment, { children: [_jsx("span", { children: fmt(r.ful) }), _jsx("span", { children: fmt(r.so) })] }) : _jsxs(_Fragment, { children: [_jsx("span", { className: c('muted'), children: "\u2013" }), _jsx("span", { className: c('muted'), children: "\u2013" })] }), _jsx("b", { style: changed ? { color: e ? 'var(--red)' : 'var(--teal-ink)' } : undefined, children: changed ? (e ? '–' : fmt(newRem)) : r.res ? fmt(r.rem) : _jsx("span", { className: c('muted'), children: "\u2013" }) }), _jsx("span", { className: c('muted'), children: fmt(open) }), _jsx("span", { children: _jsx(AdjStepper, { val: delta, step: rmStep, min: Math.ceil(r.used / 10) * 10 - base, max: availFor(k), bad: !!e, label: x.s, onChange: n => setRes(k, Math.max(base + n, 0)) }) })] }, k);
                                        }
                                        const lbs = t?.lbs ?? 0, e = lbs > 0 && t ? newErr(t) : '';
                                        const setNew = (n) => {
                                            const v = Math.max(n, 0);
                                            if (!v)
                                                setEditNew(editNew.filter(z => z.k !== k));
                                            else if (t)
                                                setEditNew(editNew.map(z => z.k === k ? { ...z, lbs: v } : z));
                                            else
                                                setEditNew([...editNew, { k, s: x.s, y: x.y, lbs: v }]);
                                        };
                                        return _jsxs("div", { className: c(`rmt ${lbs ? (e ? 'bad' : 'on') : ''}`), children: [_jsxs("span", { className: c('rmname'), children: [x.s, " ", yrTag(x.y), " ", lbs > 0 && _jsx("span", { className: c('chip c-ship'), children: "New" }), hold, e && _jsx("span", { className: c('rmerr'), title: e, children: e })] }), gradeCell(x.s), typeCell(x.s), _jsx("span", { children: lbs ? _jsxs(_Fragment, { children: [_jsx("span", { className: c('muted'), children: "0 \u2192" }), " ", _jsx("b", { children: fmt(lbs) })] }) : _jsx("span", { className: c('muted'), children: "\u2013" }) }), _jsx("span", { className: c('muted'), children: "\u2013" }), _jsx("span", { className: c('muted'), children: "\u2013" }), _jsx("b", { style: lbs ? { color: e ? 'var(--red)' : 'var(--teal-ink)' } : undefined, children: lbs && !e ? fmt(lbs) : _jsx("span", { className: c('muted'), children: "\u2013" }) }), _jsx("span", { className: c('muted'), children: fmt(open) }), _jsx("span", { children: _jsx(AdjStepper, { val: lbs, step: rmStep, min: 0, max: availFor(k), bad: !!e, label: x.s, onChange: setNew }) })] }, k);
                                    }), list.length > 0 && _jsxs("div", { className: c('rmt total'), children: [_jsx("b", { children: "Total lbs" }), _jsx("span", {}), _jsx("span", {}), _jsx("b", { children: fmt(totals.res) }), _jsx("span", { children: fmt(dt.ful) }), _jsx("span", { children: fmt(dt.so) }), _jsx("b", { style: { color: 'var(--teal-ink)' }, children: fmt(dt.rem) }), _jsx("span", { className: c('muted'), children: fmt(menuTotal) }), _jsx("span", {})] })] }) })] }), _jsx("p", { className: c('meta'), style: { margin: '0 4px' }, children: "Fulfilled = shipped. Open SO = on orders you've placed that haven't shipped. Remaining = reserved \u2212 fulfilled \u2212 open SO. Open menu available = what anyone can still reserve or order." }), (changes.length > 0 || menuBad) && _jsxs("div", { className: c('dock white'), children: [_jsxs("div", { className: c('grow'), children: [_jsxs("p", { style: { margin: 0, fontSize: 16, fontWeight: 700 }, children: ["Reserve request \u00B7 ", plural(changes.length, 'change')] }), _jsxs("p", { className: c('meta'), style: { margin: '2px 0 0' }, children: [sum, bad.length > 0 && _jsxs("span", { style: { color: 'var(--red)', fontWeight: 600 }, children: [sum ? ' · ' : '', bad.join(', '), ": fix the red line"] })] })] }), _jsx("button", { className: c('btn ghost'), onClick: clearEdit, children: "Cancel" }), _jsx("button", { className: c('btn'), disabled: !changes.length || menuBad, onClick: () => { setReviewFrom('menu'); go('reqReview'); }, children: menuBad ? 'Fix the red lines' : 'Review changes' })] })] }));
    }
    function sidebar() {
        const nav = [['home', 'Home', true], ['resmenu', 'Reserves & Menu', contract], ['yields', 'Yields', !!d?.yields], ['holds', 'Sample Holds', liveHolds.length > 0], ['orders', 'Orders & Statement', true], ['contract', 'My Contract', contract], ['activity', 'Reserve History', contract && !!d?.acts.length]];
        const on = navOn;
        return (_jsxs("aside", { className: c('side'), children: [_jsx("a", { className: c('logolink'), href: "https://www.liftedfarms.com", target: "_blank", rel: "noopener noreferrer", "aria-label": "Lifted website (opens in a new tab)", children: _jsx("img", { className: c('logo'), src: "/logo-dark.svg", alt: "Lifted" }) }), _jsx("nav", { "aria-label": "Portal", children: nav.filter(n => n[2]).map(([s0, label]) => _jsxs("button", { className: c(`nav ${on === s0 ? 'on' : ''}`), "aria-current": on === s0 ? 'page' : undefined, onClick: () => { if (s0 === 'orders')
                            setFilter('all'); go(s0); }, children: [label, s0 === 'holds' && _jsx("span", { className: c('chip c-wait'), children: liveHolds.length }), s0 === 'yields' && yToDo.length > 0 && _jsx("span", { className: c('chip c-wait'), children: yToDo.length })] }, s0)) }), _jsx("button", { className: c(`btn full ${on === 'order' ? 'on' : ''}`), style: { marginTop: 18 }, onClick: () => on === 'order' ? undefined : newOrder(), children: "Place an order" }), _jsxs("button", { className: c('nav helpnav'), onClick: openHelp, children: [I.chat, _jsx("span", { children: "Help & feedback" })] }), _jsxs("div", { className: c('side-acct'), children: [_jsx("p", { style: { margin: 0, color: '#fff', fontWeight: 600 }, children: me.display_name ?? me.customer_name }), _jsx("p", { style: { margin: '2px 0 10px', wordBreak: 'break-all' }, children: me.email }), _jsx("button", { className: c('linkish'), style: { minWidth: 0, textAlign: 'left', color: 'var(--mint)' }, onClick: () => setAcct(true), children: "Account & sign out" })] })] }));
    }
    function ContractScreen() {
        const mc = d?.mc;
        if (!mc)
            return _jsxs("div", { className: c('screen'), children: [_jsxs("header", { className: c('hdr'), children: [back('home', 'Home'), _jsx("h1", { children: "My Contract" })] }), _jsx("p", { className: c('loading'), children: "Your contract details aren't available right now." })] });
        const min = mc.monthly_min_lbs != null ? Number(mc.monthly_min_lbs) : null;
        const months = mc.months ?? [], last = months[months.length - 1];
        const isCur = !!last && last.month.slice(0, 7) === iso(new Date()).slice(0, 7);
        const done = isCur ? months.slice(0, -1) : months, now = isCur ? Number(last.lbs) : 0;
        const mName = (m) => new Date(m.slice(0, 10) + 'T12:00').toLocaleDateString('en-US', { month: 'long' });
        let run0 = 0;
        const rows = done.map(m => { const dd = Number(m.lbs) - (min ?? 0); run0 += dd; return { m: mName(m.month), lbs: Number(m.lbs), d: dd, run: run0, early: Number(m.early ?? 0) }; });
        const cum = run0;
        const sign = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
        const col = (n) => n > 0 ? 'var(--teal-ink)' : n < 0 ? 'var(--red)' : 'var(--muted)';
        const reserved = reserves.filter(r => r.y === mc.year).reduce((a, r) => a + r.res, 0), contracted = Number(mc.contract_lbs ?? 0), gap = contracted - reserved;
        const grid = { gridTemplateColumns: 'minmax(0,1fr) 72px 72px 80px' };
        const monthName = new Date().toLocaleDateString('en-US', { month: 'long' });
        return (_jsxs("div", { className: c('screen'), children: [_jsxs("header", { className: c('hdr'), children: [back('home', 'Home'), _jsx("h1", { children: "My Contract" }), _jsxs("p", { className: c('sub'), children: ["Your ", mc.year, " crop contract terms and monthly pickups"] })] }), _jsxs("main", { className: c('main'), children: [_jsxs("section", { className: c('card terms'), children: [_jsxs("div", { children: [_jsx("p", { className: c('meta'), children: "Price" }), _jsx("b", { className: c('num'), children: mc.price_per_lb != null ? _jsxs(_Fragment, { children: ["$", Number(mc.price_per_lb).toFixed(2), _jsx("small", { children: "/lb" })] }) : '—' })] }), _jsxs("div", { children: [_jsx("p", { className: c('meta'), children: "Payment terms" }), _jsx("b", { children: mc.payment_terms ?? d?.st?.customer.terms ?? '—' })] }), _jsxs("div", { children: [_jsx("p", { className: c('meta'), children: "Deposit balance" }), _jsx("b", { className: c('num'), children: mc.deposit_usd != null ? money(Number(mc.deposit_usd)) : '—' })] }), _jsxs("div", { children: [_jsx("p", { className: c('meta'), children: "Monthly minimum" }), _jsx("b", { className: c('num'), children: min != null ? `${fmt(min)} lbs` : '—' })] })] }), contracted > 0 && _jsxs("section", { className: c('card'), style: { padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }, children: [_jsxs("div", { className: c('row'), children: [_jsxs("div", { className: c('grow'), children: [_jsx("p", { className: c('meta'), style: { margin: 0 }, children: "Contracted" }), _jsxs("p", { className: c('num'), style: { margin: '2px 0 0', fontSize: 22, fontWeight: 700 }, children: [fmt(contracted), " lbs"] })] }), _jsxs("div", { className: c('r'), children: [_jsx("p", { className: c('meta'), style: { margin: 0 }, children: "Reserved" }), _jsxs("p", { className: c('num'), style: { margin: '2px 0 0', fontSize: 22, fontWeight: 700 }, children: [fmt(reserved), " lbs"] })] })] }), gap > 0 ? _jsxs("div", { className: c('row'), style: { background: 'var(--teal-bg)', borderRadius: 12, padding: '10px 12px', gap: 10 }, children: [_jsxs("p", { className: c('grow'), style: { margin: 0, color: 'var(--teal-ink)', fontSize: 14 }, children: [_jsxs("b", { children: [fmt(gap), " lbs"] }), " of your contract aren't reserved to a strain yet."] }), contract && _jsx("button", { className: c('pillbtn'), style: { border: 0, background: '#fff' }, onClick: () => go('menu'), children: "Add to Reserves" })] })
                                    : gap < 0 ? _jsxs("p", { className: c('meta'), style: { margin: 0 }, children: ["You've reserved ", fmt(-gap), " lbs more than your contract."] })
                                        : _jsx("p", { className: c('meta'), style: { margin: 0, color: 'var(--teal-ink)' }, children: "Your full contract is reserved." })] }), _jsx("h2", { className: c('h2'), children: "Monthly pickups" }), _jsxs("section", { className: c('card'), style: { padding: 18, display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }, children: [_jsxs("div", { children: [_jsxs("p", { className: c('meta'), style: { margin: 0 }, children: ["Picked up in ", monthName] }), _jsxs("p", { className: c('num'), style: { margin: '2px 0 0', fontSize: 28, fontWeight: 700 }, children: [fmt(now), " lbs"] })] }), min != null && _jsxs("div", { children: [_jsx("p", { className: c('meta'), style: { margin: 0, color: 'var(--blue)' }, children: "Left to meet minimum" }), _jsxs("p", { className: c('num'), style: { margin: '2px 0 0', fontSize: 28, fontWeight: 700, color: 'var(--blue)' }, children: [fmt(Math.max(min - now, 0)), " lbs"] })] })] }), min != null && rows.length > 0 && _jsxs("section", { className: c('card'), style: { background: 'var(--ink)', color: '#fff', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12 }, children: [_jsxs("div", { className: c('grow'), children: [_jsx("p", { style: { margin: 0, fontSize: 13, color: 'var(--muted-dk)' }, children: "Cumulative vs. minimum" }), _jsx("p", { style: { margin: '2px 0 0', fontSize: 13, color: 'var(--muted-dk)' }, children: "Since October \u00B7 completed months" })] }), _jsxs("p", { className: c('num'), style: { margin: 0, fontSize: 26, fontWeight: 700, color: cum >= 0 ? 'var(--mint)' : '#f9a8b8' }, children: [sign(cum), " lbs ", _jsx("span", { style: { fontSize: 14, fontWeight: 500 }, children: cum >= 0 ? 'over' : 'under' })] })] }), min != null && (rows.length > 0 || isCur) && _jsxs(_Fragment, { children: [_jsx("h2", { className: c('h2 small'), children: "By month" }), _jsxs("section", { className: c('card'), children: [_jsxs("div", { className: c('tbl head'), style: grid, children: [_jsx("span", { children: "Month" }), _jsx("span", { children: "Picked up" }), _jsxs("span", { children: ["vs. ", fmt(min)] }), _jsx("span", { children: "Running" })] }), rows.map(r => _jsxs("div", { className: c('tbl'), style: grid, children: [_jsxs("span", { style: { fontWeight: 500 }, children: [r.m, r.early > 0 && _jsxs("small", { className: c('meta'), style: { display: 'block', fontWeight: 400, fontSize: 12 }, children: ["incl. ", fmt(r.early), " lbs picked up before October"] })] }), _jsx("span", { children: fmt(r.lbs) }), _jsx("span", { style: { color: col(r.d) }, children: sign(r.d) }), _jsx("b", { style: { color: col(r.run) }, children: sign(r.run) })] }, r.m)), isCur && _jsxs("div", { className: c('tbl total'), style: { ...grid, color: 'var(--muted)' }, children: [_jsxs("span", { children: [monthName, " ", _jsx("small", { children: "(so far)" }), rows.length === 0 && Number(last.early) > 0 && _jsxs("small", { className: c('meta'), style: { display: 'block', fontSize: 12 }, children: ["incl. ", fmt(last.early), " lbs picked up before October"] })] }), _jsx("span", { children: fmt(now) }), _jsx("span", { children: sign(now - min) }), _jsx("span", { children: sign(cum + now - min) })] })] })] })] })] }));
    }
    // ---------- reserve history (mockup) ----------
    const [actF, setActF] = useState('all');
    const [actOpen, setActOpen] = useState([]);
    const actSeenKey = 'cp-act-seen';
    const latestAdjust = (d?.acts ?? []).filter(a => a.by === 'lifted' && a.kind === 'adjust').sort((a, b) => b.at.localeCompare(a.at))[0];
    const [actSeen, setActSeen] = useState(() => { try {
        return localStorage.getItem(actSeenKey) ?? '';
    }
    catch {
        return '';
    } });
    const showAdjustNote = !!latestAdjust && latestAdjust.id !== actSeen && (Date.now() - new Date(latestAdjust.at).getTime()) < 30 * 864e5;
    const seeHistory = () => { if (latestAdjust) {
        setActSeen(latestAdjust.id);
        try {
            localStorage.setItem(actSeenKey, latestAdjust.id);
        }
        catch { /* private mode */ }
    } go('activity'); };
    const adjustNote = () => showAdjustNote && latestAdjust ? _jsxs("button", { className: c('note gold actnote'), onClick: seeHistory, children: [_jsxs("b", { children: ["Lifted changed ", latestAdjust.lines.length === 1 ? `your ${latestAdjust.lines[0].s} reserve` : `${latestAdjust.lines.length} of your reserves`] }), " on ", actDay(latestAdjust.at), ". ", _jsx("u", { children: "See what changed and why" })] }) : null;
    function ActivityScreen() {
        const acts = [...(d?.acts ?? [])].sort((a, b) => b.at.localeCompare(a.at));
        const ql = q.toLowerCase();
        const list = acts.filter(a => (actF === 'all' || a.by === actF) && (!ql || a.lines.some(l => l.s.toLowerCase().includes(ql))));
        const months = [];
        for (const a of list) {
            const m = new Date(a.at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), g = months.find(x => x[0] === m);
            if (g)
                g[1].push(a);
            else
                months.push([m, [a]]);
        }
        const sign = (n) => n === 0 ? '0' : (n > 0 ? '+' : '−') + fmt(Math.abs(n));
        const title = (a) => a.kind === 'rejected' ? 'Rejected at delivery: back on your reserve' : a.kind === 'setup' ? `Lifted set up your ${a.lines[0]?.y ?? cy} reserves`
            : a.kind === 'adjust' ? `Lifted changed ${a.lines.length === 1 ? 'your reserve' : `${a.lines.length} of your reserves`}`
                : a.fromHold ? 'You asked to reserve a sample hold' : `You asked to change ${plural(a.lines.length, 'reserve')}`;
        const chip = (a) => a.kind === 'rejected' ? _jsx("span", { className: c('chip c-ok'), children: "Back on reserve" }) : a.kind !== 'request' ? _jsx("span", { className: c('chip c-lifted'), children: a.kind === 'setup' ? 'Contract set up' : 'Changed by Lifted' })
            : a.status === 'waiting' ? _jsx("span", { className: c('chip c-wait'), children: "Waiting on Lifted" }) : a.status === 'approved' ? _jsx("span", { className: c('chip c-ok'), children: "Approved" })
                : a.status === 'partly' ? _jsx("span", { className: c('chip c-part'), children: "Partly approved" }) : a.status === 'declined' ? _jsx("span", { className: c('chip c-no'), children: "Not approved" }) : _jsx("span", { className: c('chip'), children: "Cancelled" });
        const entry = (a) => {
            const many = a.lines.length > 6, open = actOpen.includes(a.id), lines = many && !open ? a.lines.slice(0, 5) : a.lines;
            const req = a.kind === 'request';
            const afterOf = (l) => !req ? l.to : l.after !== undefined ? (l.after == null ? null : Number(l.after)) : a.status === 'approved' ? l.to : a.status === 'partly' ? (l.ok ?? l.to) : a.status === 'waiting' ? null : l.from;
            const more = many && _jsx("button", { className: c('linkish act-more'), onClick: () => setActOpen(open ? actOpen.filter(x => x !== a.id) : [...actOpen, a.id]), children: open ? 'Show less' : `Show all ${a.lines.length} strains` });
            const decided = req && a.decidedAt ? _jsxs(_Fragment, { children: [chip(a), " ", actDay(a.decidedAt), a.decidedBy ? ` by ${a.decidedBy}` : '', a.reply ? _jsxs(_Fragment, { children: [" \u00B7 \u201C", a.reply, "\u201D"] }) : ''] }) : null;
            const noteLbl = a.by === 'you' ? 'Your note' : a.kind === 'adjust' ? 'Why' : 'Note';
            return _jsxs("section", { className: c('card act'), children: [_jsxs("div", { className: c('act-h'), children: [_jsx("span", { className: c(`act-dot ${a.by}`), "aria-hidden": "true", children: a.by === 'lifted' ? _jsx("img", { src: "/logo-dark.svg", alt: "" }) : I.user }), _jsxs("div", { className: c('grow'), children: [_jsx("p", { className: c('name'), children: title(a) }), _jsxs("p", { className: c('meta'), style: { margin: '2px 0 0' }, children: [actWhen(a.at), " \u00B7 ", a.who] })] }), chip(a)] }), a.kind === 'rejected' ? _jsxs(_Fragment, { children: [_jsxs("div", { className: c('actt head nr'), children: [_jsx("span", { children: "Strain" }), _jsx("span", {}), _jsx("span", {}), _jsx("span", { children: "Back on reserve" })] }), lines.map(l => _jsxs("div", { className: c('actt nr'), children: [_jsxs("span", { className: c('rmname'), children: [l.s, " ", yrTag(l.y)] }), _jsx("span", {}), _jsx("span", {}), _jsxs("span", { className: c('up'), children: ["+", fmt(l.to)] })] }, l.s + l.y))] }) : _jsxs(_Fragment, { children: [_jsxs("div", { className: c(`actt head ${req ? '' : 'nr'}`), children: [_jsx("span", { children: "Strain" }), _jsx("span", { children: "Before" }), req && _jsx("span", { children: "Asked for" }), _jsx("span", { children: "After" }), _jsx("span", { children: "Change" })] }), lines.map(l => {
                                const after = afterOf(l);
                                return _jsxs("div", { className: c(`actt ${req ? '' : 'nr'}`), children: [_jsxs("span", { className: c('rmname'), children: [l.s, " ", yrTag(l.y)] }), _jsx("span", { className: c('muted'), children: fmt(l.from) }), req && _jsx("span", { children: fmt(l.to) }), _jsx("b", { children: after == null ? _jsx("span", { className: c('muted'), style: { fontWeight: 500 }, children: "waiting" }) : fmt(after) }), _jsx("span", { className: c(after == null || after === l.from ? 'muted' : after > l.from ? 'up' : 'down'), children: after == null ? '–' : sign(after - l.from) })] }, l.s + l.y);
                            })] }), more, (a.note || decided) && _jsxs("div", { className: c(`act-notes ${a.by === 'lifted' && a.kind === 'adjust' ? 'gold' : ''}`), children: [a.note && _jsxs("p", { children: [_jsxs("span", { className: c('meta'), style: { display: 'inline' }, children: [noteLbl, ": "] }), a.note] }), decided && _jsx("p", { className: c(`act-reply ${a.status}`), children: decided })] })] }, a.id);
        };
        const fb = (id, label) => _jsx("button", { "aria-pressed": actF === id, onClick: () => setActF(id), children: label }, id);
        return (_jsxs("div", { className: c('screen act-screen'), children: [_jsxs("header", { className: c('hdr'), children: [back(desk ? 'resmenu' : 'reserves', desk ? 'Reserves & Menu' : 'Contract Reserves'), _jsx("h1", { children: "Reserve History" }), _jsx("p", { className: c('sub'), children: "Every change to your contract reserves: the ones you asked for, and any Lifted had to make." })] }), _jsxs("main", { className: c('main'), children: [_jsxs("div", { className: c('rmbar act-bar'), children: [_jsxs("div", { className: c('filters'), role: "group", "aria-label": "Show", children: [fb('all', 'All'), fb('you', 'Your requests'), fb('lifted', 'Changes by Lifted')] }), _jsxs("label", { className: c('search'), children: [I.search, _jsx("input", { type: "search", placeholder: "Search strains", value: q, onChange: e => setQ(e.target.value), "aria-label": "Search strains" })] })] }), list.length === 0 && _jsx("p", { className: c('loading'), children: "Nothing here yet." }), months.map(([m, as]) => _jsxs(Fragment, { children: [_jsx("p", { className: c('act-month'), children: m }), as.map(entry)] }, m))] })] }));
    }
    function ReservesScreen() {
        return (_jsxs("div", { className: c('screen'), children: [_jsxs("header", { className: c('hdr'), children: [back('home', 'Home'), _jsx("h1", { children: "Contract Reserves" }), _jsxs("p", { className: c('sub'), children: [fmt(totals.left), " of ", fmt(totals.res), " lbs left to pick up"] }), !!d?.acts.length && _jsxs("button", { className: c('pillbtn hist'), onClick: () => go('activity'), children: [I.clock, " Reserve history"] })] }), _jsxs("main", { className: c('main'), children: [_jsxs("section", { className: c('card'), children: [_jsxs("div", { className: c('tbl head'), children: [_jsx("span", { children: "Strain" }), _jsx("span", { children: "Reserved" }), _jsx("span", { children: "Picked up" }), _jsx("span", { children: "Left" })] }), reserves.length === 0 && _jsx("p", { className: c('meta'), style: { padding: 16 }, children: "No reserves yet. Add strains from the open menu." }), reserves.map(r => _jsxs("div", { style: { borderBottom: '1px solid var(--line-2)' }, children: [_jsxs("div", { className: c('tbl'), style: { border: 0 }, children: [_jsxs("span", { style: { fontWeight: 600 }, children: [r.s, " ", tagPill(r.s), " ", yrTag(r.y)] }), _jsx("span", { children: r.res ? fmt(r.res) : '–' }), _jsx("span", { style: { color: 'var(--muted)' }, children: fmt(r.used) }), _jsx("b", { children: fmt(r.left) })] }), r.asked != null && _jsx("div", { style: { padding: '0 16px 12px' }, children: _jsxs("span", { className: c('chip c-wait'), children: [r.res ? `You asked to change to ${fmt(r.asked)}` : `New: you asked for ${fmt(r.asked)}`, " \u00B7 waiting on Lifted"] }) })] }, r.k)), _jsxs("div", { className: c('tbl total'), children: [_jsx("b", { children: "Total lbs" }), _jsx("b", { children: fmt(totals.res) }), _jsx("span", { style: { color: 'var(--muted)' }, children: fmt(totals.used) }), _jsx("b", { style: { color: 'var(--teal-ink)' }, children: fmt(totals.left) })] })] }), _jsx("p", { className: c('meta'), style: { margin: '0 4px' }, children: "Picked up includes orders that are placed but not shipped yet." })] }), _jsx("div", { className: c('dock'), children: _jsx("button", { className: c('btn full'), onClick: () => { setEditFrom('reserves'); go('edit'); }, children: "Edit my reserves" }) })] }));
    }
    function EditScreen() {
        const back = editFrom === 'menu' ? ['menu', 'Open Menu'] : ['reserves', 'Contract Reserves'];
        const cancel = () => { clearEdit(); go(back[0]); };
        const items = [
            ...reserves.map(r => {
                const v = ed[r.k] ?? 0, base = r.asked ?? r.res, changed = v !== base, e = resErr(r), onMenu = fmt(menuRow(r.k)?.open ?? 0);
                const newLeft = Math.max(v - r.used, 0);
                return { s: r.s, y: r.y, el: _jsxs("div", { className: c(`box ${changed ? 'on' : ''}`), children: [_jsxs("div", { className: c('row'), style: { gap: 12 }, children: [_jsxs("div", { className: c('grow'), children: [_jsxs("p", { className: c('name'), children: [r.s, " ", yrTag(r.y)] }), _jsxs("p", { className: c('meta'), children: [changed ? _jsxs(_Fragment, { children: [changedLine(r), _jsx("br", {}), _jsxs("b", { style: { color: 'var(--ink)' }, children: [fmt(newLeft), " left"] }), " after this change"] })
                                                        : _jsxs(_Fragment, { children: [_jsxs("b", { style: { color: 'var(--ink)' }, children: [fmt(r.left), " left"] }), " \u00B7 ", fmt(r.used), " picked up", r.asked != null && _jsxs(_Fragment, { children: [_jsx("br", {}), _jsxs("span", { style: { color: 'var(--gold)' }, children: ["Asked for ", fmt(r.asked), " \u00B7 waiting"] })] })] }), _jsx("br", {}), onMenu, " on open menu"] })] }), _jsx(Stepper, { val: v, on: changed, bad: !!e, label: r.s, onChange: n => setRes(r.k, n) })] }), e && _jsx(StepErr, { msg: e })] }, r.k) };
            }),
            ...editNew.map((n, i) => {
                const e = newErr(n);
                return { s: n.s, y: n.y, el: _jsxs("div", { className: c('box on'), children: [_jsxs("div", { className: c('row'), style: { gap: 12 }, children: [_jsxs("div", { className: c('grow'), children: [_jsxs("p", { className: c('name'), children: [n.s, " ", yrTag(n.y)] }), _jsxs("p", { className: c('meta'), style: { color: 'var(--teal-ink)', fontWeight: 500 }, children: ["New \u00B7 ", fmt(menuRow(n.k)?.open ?? 0), " lbs on open menu"] })] }), _jsx(Stepper, { val: n.lbs, on: true, bad: !!e && n.lbs > 0, label: n.s, onChange: v => setEditNew(editNew.map((x, j) => j === i ? { ...x, lbs: v } : x)) })] }), e && _jsx(StepErr, { msg: e }), _jsx("button", { className: c('linkish'), style: { minWidth: 0, textAlign: 'left', color: 'var(--red)' }, onClick: () => setEditNew(editNew.filter((_, j) => j !== i)), children: "Remove" })] }, 'new' + n.k) };
            }),
        ].sort((a, b) => a.s.localeCompare(b.s) || b.y - a.y).filter(x => !editQ || x.s.toLowerCase().includes(editQ.toLowerCase()));
        return (_jsxs("div", { className: c('screen'), children: [_jsxs("header", { className: c('hdr'), children: [_jsxs("button", { className: c('back'), onClick: () => go(back[0]), children: [I.back, back[1]] }), _jsx("h1", { children: "Edit Reserves" }), _jsx("p", { className: c('sub'), children: "Set the total lbs you want for each strain, in steps of 10. Tap a number to type it. Lifted reviews each change." }), _jsxs("label", { className: c('search'), children: [I.search, _jsx("input", { type: "search", placeholder: "Search strains", value: editQ, onChange: e => setEditQ(e.target.value), "aria-label": "Search your reserves" })] })] }), _jsxs("main", { className: c('main'), children: [_jsxs("div", { className: c('colhead'), children: [_jsx("h2", { className: c('h2 small'), style: { margin: 0 }, children: "Your reserves" }), _jsx("span", { children: "Total reserve" })] }), items.map(x => x.el), items.length === 0 && _jsxs("p", { className: c('meta'), style: { margin: '0 4px' }, children: ["No reserves match \"", editQ, "\"."] }), _jsx("button", { className: c('btn ghost'), style: { height: 48, border: '1.5px dashed #9aa69e', background: 'transparent', color: 'var(--teal-dk)', fontSize: 15 }, onClick: () => go('menu'), children: "+ Add a strain from the open menu" })] }), _jsxs("div", { className: c('dock white'), children: [_jsx("button", { className: c('btn ghost'), style: { flex: 1 }, onClick: cancel, children: "Cancel" }), _jsx("button", { className: c('btn'), style: { flex: 2 }, disabled: busy || !changes.length || anyResErr, onClick: () => { setReviewFrom('edit'); go('reqReview'); }, children: anyResErr ? 'Fix the red lines' : changes.length ? 'Review changes' : 'No changes yet' })] })] }));
    }
    function reqRows(chs) {
        return [...chs].sort((a, b) => a.s.localeCompare(b.s) || b.y - a.y).map(ch => {
            const r = resRow(kOf(ch.s, ch.y)), used = (r?.ful ?? 0) + (r?.so ?? 0);
            return { ch, remB: r?.res ? r.rem : 0, remA: Math.max(ch.to - used, 0) };
        });
    }
    function reqTable(rowsR) {
        const sign = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
        const tot = rowsR.reduce((a, x) => ({ rb: a.rb + x.ch.from, ra: a.ra + x.ch.to, mb: a.mb + x.remB, ma: a.ma + x.remA }), { rb: 0, ra: 0, mb: 0, ma: 0 });
        const delta = (n) => n ? _jsxs("small", { style: { color: n > 0 ? 'var(--teal-ink)' : 'var(--red)' }, children: [" (", sign(n), ")"] }) : null;
        return _jsxs("section", { className: c('card'), children: [_jsxs("div", { className: c('rvt head'), children: [_jsx("span", { children: "Strain" }), _jsx("span", { children: "Reserve before" }), _jsx("span", { children: "Reserve after" }), _jsx("span", { children: "Remaining before" }), _jsx("span", { children: "Remaining after" })] }), rowsR.map(({ ch, remB, remA }) => _jsxs("div", { className: c('rvt'), children: [_jsxs("span", { className: c('rmname'), children: [ch.s, " ", yrTag(ch.y), " ", ch.isNew && _jsx("span", { className: c('chip c-ship'), children: "New" })] }), _jsx("span", { className: c('muted'), children: fmt(ch.from) }), _jsxs("span", { children: [_jsx("b", { children: fmt(ch.to) }), delta(ch.to - ch.from)] }), _jsx("span", { className: c('muted'), children: fmt(remB) }), _jsxs("span", { children: [_jsx("b", { children: fmt(remA) }), delta(remA - remB)] })] }, ch.s + ch.y)), _jsxs("div", { className: c('rvt total'), children: [_jsxs("b", { children: ["Total \u00B7 ", plural(rowsR.length, 'strain')] }), _jsx("span", { children: fmt(tot.rb) }), _jsxs("span", { children: [_jsx("b", { children: fmt(tot.ra) }), delta(tot.ra - tot.rb)] }), _jsx("span", { children: fmt(tot.mb) }), _jsxs("span", { children: [_jsx("b", { children: fmt(tot.ma) }), delta(tot.ma - tot.mb)] })] })] });
    }
    function ReqReviewScreen() {
        const backTo = reviewFrom;
        if (!changes.length)
            return _jsxs("div", { className: c('screen'), children: [_jsxs("header", { className: c('hdr'), children: [back(backTo, 'Keep editing'), _jsx("h1", { children: "Review your request" })] }), _jsx("p", { className: c('loading'), children: "No changes yet." })] });
        const net = changes.reduce((a, ch) => a + ch.to - ch.from, 0), sorted = [...changes].sort((a, b) => a.s.localeCompare(b.s) || b.y - a.y);
        const sign = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
        return (_jsxs("div", { className: c('screen'), children: [_jsxs("header", { className: c('hdr'), children: [back(backTo, 'Keep editing'), _jsx("h1", { children: "Review your request" }), _jsx("p", { className: c('sub'), children: "Nothing is sent until you tap Send request." })] }), _jsxs("main", { className: c('main'), children: [desk ? reqTable(reqRows(changes)) : _jsxs("section", { className: c('card'), children: [sorted.map(ch => _jsxs("div", { className: c('li'), style: { alignItems: 'flex-start' }, children: [_jsxs("div", { className: c('grow'), children: [_jsxs("p", { className: c('name'), children: [ch.s, " ", yrTag(ch.y), " ", ch.isNew && _jsx("span", { className: c('chip c-ship'), children: "New" })] }), _jsx("p", { className: c('meta num'), children: ch.isNew ? `Reserve ${fmt(ch.to)} lbs` : `${fmt(ch.from)} → ${fmt(ch.to)} lbs` })] }), _jsxs("b", { className: c('num'), style: { color: ch.to >= ch.from ? 'var(--teal-ink)' : 'var(--red)' }, children: [sign(ch.to - ch.from), " lbs"] })] }, ch.s + ch.y)), _jsxs("div", { className: c('li'), style: { background: '#f7f9f6', alignItems: 'flex-start' }, children: [_jsxs("div", { className: c('grow'), children: [_jsx("b", { children: "Total change" }), _jsxs("p", { className: c('meta'), children: [plural(changes.length, 'strain'), " \u00B7 reserves go from ", fmt(totals.res), " to ", fmt(totals.res + net), " lbs"] })] }), _jsxs("b", { className: c('num'), style: { fontSize: 18 }, children: [sign(net), " lbs"] })] })] }), _jsxs("label", { className: c('field'), children: ["Note to Lifted (optional)", _jsx("input", { type: "text", value: reqNote, onChange: e => setReqNote(e.target.value) })] }), _jsxs("div", { className: c('note gold'), children: ["Lifted reviews each change and we'll email you when it's decided. Until then they show as ", _jsx("b", { children: "waiting" }), ", and the lbs stay open on the menu for everyone."] })] }), _jsxs("div", { className: c('dock white'), children: [_jsx("button", { className: c('btn ghost'), style: { flex: 1 }, onClick: () => go(backTo), children: "Keep editing" }), _jsx("button", { className: c('btn'), style: { flex: 1.4 }, disabled: busy || sendErr, onClick: sendReq, children: busy ? 'Sending…' : 'Send request' })] })] }));
    }
    // done screens (order sent, request sent, yields sent): buttons right under the summary, Back to Home on the left
    const doneBtns = (label, onClick) => _jsxs("div", { className: c('donebtns'), children: [_jsx("button", { className: c('btn ghost'), onClick: () => go('home'), children: "Back to Home" }), _jsx("button", { className: c('btn'), onClick: onClick, children: label })] });
    function SentScreen() {
        const r = lastReq;
        return (_jsxs("div", { className: c('screen'), children: [_jsxs("header", { className: c('hdr done-hdr'), children: [_jsx("span", { className: c('check'), children: I.check }), _jsx("h1", { style: { marginTop: 6 }, children: "Request sent" }), _jsxs("p", { className: c('sub'), style: { fontSize: 15 }, children: [plural(r.length, desk ? 'change' : 'reserve change'), " sent to Lifted for review. We'll email you when Lifted approves them."] })] }), _jsxs("main", { className: c('main'), children: [desk ? _jsxs(_Fragment, { children: [reqTable(lastReqRows), lastReqNote && _jsxs("section", { className: c('card'), style: { padding: '12px 16px', fontSize: 14 }, children: [_jsx("span", { className: c('meta'), style: { display: 'inline' }, children: "Note" }), " ", lastReqNote] })] })
                            : _jsx("section", { className: c('card'), children: r.map(ch => _jsxs("div", { className: c('li'), children: [_jsxs("div", { className: c('grow'), children: [_jsxs("p", { className: c('name'), children: [ch.s, " ", yrTag(ch.y)] }), _jsx("p", { className: c('meta'), style: ch.isNew ? { color: 'var(--teal-ink)' } : undefined, children: ch.isNew ? 'New strain' : `${fmt(ch.from)} → ${fmt(ch.to)} lbs` })] }), _jsx("b", { className: c('num'), children: ch.isNew ? `${fmt(ch.to)} lbs` : `${ch.to > ch.from ? '+' : '−'}${fmt(Math.abs(ch.to - ch.from))} lbs` })] }, ch.s + ch.y)) }), doneBtns('View my reserves', () => go('reserves')), _jsxs("div", { className: c('note gold'), children: ["Until Lifted approves, these show as ", _jsx("b", { children: "waiting" }), " on your Contract Reserves, and the lbs stay open on the menu for everyone."] })] })] }));
    }
    function MenuScreen() {
        const ql = q.toLowerCase();
        const shown = menuItems.filter(m => m.open > 0 || (contract && !!resRow(m.k)));
        const list = shown.filter(m => (!ql || m.s.toLowerCase().includes(ql)) && (menuYear === 'all' || m.y === menuYear) && (gradeF === 'all' || tagOf(m.s).g === gradeF) && (!notRes || !resRow(m.k))).sort((a, b) => a.s.localeCompare(b.s) || b.y - a.y);
        const total = menuItems.reduce((a, m) => a + m.open, 0);
        const years = [...new Set(shown.map(m => m.y))].sort((a, b) => b - a);
        // strains just picked with no lbs yet aren't errors here (their red line only shows once a number is typed)
        const menuBad = editNew.some(n => n.lbs > 0 && !!newErr(n)) || reserves.some(r => !!resErr(r));
        const toggleTray = (m) => {
            if (editNew.some(t => t.k === m.k))
                setEditNew(editNew.filter(t => t.k !== m.k));
            else {
                setEditNew([...editNew, { k: m.k, s: m.s, y: m.y, lbs: 0 }]);
                setFocusK('tray' + m.k);
            }
        };
        return (_jsxs("div", { className: c('screen'), children: [_jsxs("header", { className: c('hdr'), style: { paddingBottom: 16 }, children: [back('home', 'Home'), _jsxs("div", { children: [_jsxs("div", { className: c('row'), style: { justifyContent: 'space-between', alignItems: 'baseline' }, children: [_jsx("h1", { children: "Open Menu" }), _jsxs("span", { className: c('sub'), children: [fmt(total), " lbs available"] })] }), contract && _jsx("p", { className: c('sub mint'), style: { marginTop: 4 }, children: "Pick a strain and choose how many lbs to add to your contract reserves. Lifted reviews every request." })] }), _jsxs("label", { className: c('search'), children: [I.search, _jsx("input", { type: "search", placeholder: "Search strains", value: q, onChange: e => setQ(e.target.value), "aria-label": "Search strains" })] })] }), _jsxs("main", { className: c('main'), style: { paddingTop: 12 }, children: [_jsxs("div", { className: c('filters'), role: "group", "aria-label": "Filter the menu", children: [_jsx("button", { "aria-pressed": menuYear === 'all' && !notRes && gradeF === 'all', onClick: () => { setMenuYear('all'); setNotRes(false); setGradeF('all'); }, children: "All" }), years.length > 1 && years.map(y => _jsx("button", { "aria-pressed": menuYear === y, onClick: () => setMenuYear(menuYear === y ? 'all' : y), children: y }, y)), contract && _jsx("button", { "aria-pressed": notRes, onClick: () => setNotRes(!notRes), children: "Not reserved" }), _jsx("button", { "aria-pressed": gradeF === 'SHO', onClick: () => setGradeF(gradeF === 'SHO' ? 'all' : 'SHO'), children: "SHO" }), _jsx("button", { "aria-pressed": gradeF === 'BHO', onClick: () => setGradeF(gradeF === 'BHO' ? 'all' : 'BHO'), children: "BHO" })] }), _jsxs("section", { className: c('card'), children: [_jsxs("div", { className: c(`mg mg-head ${contract ? '' : 'nc'}`), children: [_jsx("span", { children: "Strain" }), _jsxs("span", { className: c('mg-a'), children: ["Available", _jsx("span", { className: c('meta'), style: { display: 'block', fontSize: 11, margin: 0 }, children: "lbs" })] }), contract && _jsx("span", { style: { textAlign: 'right' }, children: "Your reserve" })] }), list.length === 0 && _jsx("p", { className: c('meta'), style: { padding: 14 }, children: menuItems.length ? 'Nothing matches.' : 'Nothing on the menu right now.' }), list.map(m => {
                                    const nameCell = _jsxs("div", { style: { minWidth: 0 }, children: [_jsxs("p", { className: c('name'), children: [m.s, " ", tagPill(m.s)] }), m.y < cy && _jsx("p", { className: c('meta'), style: { margin: '1px 0 0' }, children: _jsxs("span", { className: c('yr old'), style: { fontSize: 12 }, children: [m.y, " crop"] }) })] });
                                    const cells = _jsxs(_Fragment, { children: [nameCell, _jsx("b", { className: c('num mg-a'), children: fmt(m.open) })] });
                                    if (!contract)
                                        return _jsx("div", { className: c('mg nc'), children: cells }, m.k);
                                    const r = resRow(m.k), t = !r ? editNew.find(x => x.k === m.k) : undefined;
                                    let right, pick = null, sel = false;
                                    if (r) {
                                        const v = ed[r.k] ?? 0, base = r.asked ?? r.res, changed = v !== base, open = menuOpen.includes(r.k) || changed, e = resErr(r);
                                        sel = changed;
                                        right = open
                                            ? _jsxs("button", { className: c('linkish'), onClick: () => { setRes(r.k, base); setMenuOpen(menuOpen.filter(x => x !== r.k)); }, children: [_jsxs("span", { children: [fmt(r.res), " reserved"] }), changed ? 'Undo' : 'Close'] })
                                            : _jsxs("button", { className: c('linkish'), onClick: () => setMenuOpen([...menuOpen, r.k]), children: [_jsxs("span", { children: [fmt(r.res), " reserved"] }), r.asked != null ? 'Waiting · Edit' : 'Change'] });
                                        if (open)
                                            pick = _jsxs(_Fragment, { children: [_jsxs("div", { className: c('row'), style: { gap: 10, padding: '0 14px 12px', flexWrap: 'wrap' }, children: [_jsxs("span", { className: c('grow'), style: { fontSize: 14, fontWeight: 600 }, children: ["Your reserve total", _jsx("span", { className: c('meta'), style: { display: 'block', fontWeight: 400 }, children: changed ? changedLine(r) : `${fmt(r.used)} already picked up` })] }), _jsx(Stepper, { val: v, on: changed, bad: !!e, label: m.s, onChange: n => setRes(r.k, n) })] }), e && _jsx("div", { style: { padding: '0 14px 12px' }, children: _jsx(StepErr, { msg: e }) })] });
                                    }
                                    else if (t) {
                                        sel = true;
                                        const e = newErr(t);
                                        right = _jsx("button", { className: c('linkish'), style: { color: 'var(--red)' }, onClick: () => toggleTray(m), children: "Remove" });
                                        pick = _jsxs(_Fragment, { children: [_jsxs("div", { className: c('row'), style: { gap: 10, padding: '0 14px 12px', flexWrap: 'wrap' }, children: [_jsx("span", { className: c('grow'), style: { fontSize: 14, fontWeight: 600 }, children: "How many lbs to reserve?" }), _jsx(Stepper, { val: t.lbs, on: true, bad: !!e && t.lbs > 0, label: m.s, autoFocus: focusK === 'tray' + m.k, onChange: n => setEditNew(editNew.map(x => x.k === m.k ? { ...x, lbs: n } : x)) })] }), e && t.lbs > 0 && _jsx("div", { style: { padding: '0 14px 12px' }, children: _jsx(StepErr, { msg: e }) })] });
                                    }
                                    else
                                        right = _jsx("button", { className: c('outline-btn'), onClick: () => toggleTray(m), disabled: m.open <= 0, children: "+ Reserve" });
                                    return _jsxs("div", { className: sel ? c('sel') : '', style: { borderBottom: '1px solid var(--line-2)', background: sel ? 'var(--teal-tint)' : undefined }, children: [_jsxs("div", { className: c('mg'), children: [cells, _jsx("div", { style: { textAlign: 'right' }, children: right })] }), pick] }, m.k);
                                })] })] }), contract ? ((changes.length > 0 || menuBad) ? _jsxs("div", { className: c('dock white'), children: [_jsx("button", { className: c('btn ghost'), style: { flex: 1 }, onClick: clearEdit, children: "Cancel" }), _jsx("button", { className: c('btn'), style: { flex: 2 }, disabled: !changes.length || anyResErr, onClick: () => { setReviewFrom('menu'); go('reqReview'); }, children: menuBad ? 'Fix the red lines' : changes.length && !anyResErr ? 'Review changes' : 'Set the lbs' })] }) : null)
                    : _jsx("div", { className: c('dock'), children: _jsx("button", { className: c('btn full'), onClick: () => newOrder(), children: "Place an order" }) })] }));
    }
    function orderLineEl(l) {
        const picked = l.k in ord, qv = ord[l.k] ?? 0, sp = lineSplit(l, qv);
        const sub = l.resLeft ? _jsxs(_Fragment, { children: [fmt(l.resLeft), " reserve + ", fmt(l.open), " open"] }) : l.hold ? _jsxs("span", { style: { color: 'var(--gold)' }, children: ["incl. ", fmt(l.hold), " held for you"] }) : null;
        const unpick = () => { const o = { ...ord }; delete o[l.k]; setOrd(o); const s = { ...smp }; delete s[l.k]; setSmp(s); const h = { ...holdAsk }; delete h[l.k]; setHoldAsk(h); };
        const head = _jsxs("div", { className: c('mg'), children: [_jsxs("div", { style: { minWidth: 0 }, children: [_jsxs("p", { className: c('name'), children: [l.s, " ", tagPill(l.s)] }), (l.y < cy || sub) && _jsxs("p", { className: c('meta'), style: { margin: '1px 0 0' }, children: [l.y < cy && _jsxs("span", { className: c('yr old'), style: { fontSize: 12 }, children: [l.y, " crop"] }), l.y < cy && sub ? ' · ' : '', sub] }), _jsx("p", { className: c('meta'), style: { margin: '1px 0 0', fontSize: 12 }, children: lastOrdTxt(l.s) })] }), _jsx("b", { className: c('num mg-a'), children: fmt(sp.max) }), _jsx("div", { style: { textAlign: 'right' }, children: picked ? _jsx("button", { className: c('linkish'), style: { color: 'var(--red)' }, onClick: unpick, children: "Remove" })
                        : _jsx("button", { className: c('outline-btn'), onClick: () => { setOrd({ ...ord, [l.k]: 10 }); setFocusK('ord' + l.k); }, "aria-label": `Add ${l.s}`, children: "+ Add" }) })] });
        if (!picked)
            return _jsx("div", { style: { borderBottom: '1px solid var(--line-2)' }, children: head });
        const e = lineError(l, qv), sampleOk = !l.resLeft, hq = holdAsk[l.k] ?? 0, he = smp[l.k] ? holdError(l, qv, hq) : '';
        return (_jsxs("div", { style: { borderBottom: '1px solid var(--line-2)', background: 'var(--teal-tint)' }, children: [head, _jsxs("div", { style: { padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }, children: [_jsxs("div", { className: c('row'), style: { gap: 10, flexWrap: 'wrap' }, children: [_jsx("span", { className: c('grow'), style: { fontSize: 14, fontWeight: 600 }, children: "How many lbs?" }), _jsx(Stepper, { val: qv, on: true, bad: !!e, label: l.s, autoFocus: focusK === 'ord' + l.k, onChange: n => setOrd({ ...ord, [l.k]: n }) })] }), e && _jsx(StepErr, { msg: e }), _jsxs("div", { className: c('chips'), children: [qv > 0 && !not10(qv) && _jsxs(_Fragment, { children: [sp.fromRes > 0 && _jsxs("span", { className: c('chip c-res'), children: [fmt(sp.fromRes), " from your reserve"] }), sp.fromHold > 0 && _jsxs("span", { className: c('chip c-wait'), children: [fmt(sp.fromHold), " held for you"] }), sp.fromOpen > 0 && _jsxs("span", { className: c('chip c-open'), children: [fmt(sp.fromOpen), " from open menu"] })] }), sampleOk && _jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, marginLeft: 'auto' }, children: [_jsx("input", { type: "checkbox", checked: !!smp[l.k], onChange: ev => { setSmp({ ...smp, [l.k]: ev.target.checked }); if (!ev.target.checked) {
                                                const h = { ...holdAsk };
                                                delete h[l.k];
                                                setHoldAsk(h);
                                            } }, style: { width: 18, height: 18, accentColor: 'var(--teal-dk)' } }), " Sample"] })] }), sampleOk && smp[l.k] && _jsxs(_Fragment, { children: [_jsxs("div", { className: c('row'), style: { justifyContent: 'space-between', fontSize: 13, color: 'var(--muted)', background: '#fff', borderRadius: 10, padding: '8px 10px', flexWrap: 'wrap' }, children: [_jsxs("span", { children: ["If you like it, hold for me ", _jsxs("span", { style: { fontSize: 12 }, children: ["(", d?.holdDays ?? 10, " days after it ships \u00B7 up to ", fmt(Math.max(sp.max - qv, 0)), " lbs)"] })] }), _jsx(Stepper, { val: hq, bad: !!he, label: `${l.s} hold`, onChange: n => setHoldAsk({ ...holdAsk, [l.k]: n }) })] }), he && _jsx(StepErr, { msg: he })] })] })] }));
    }
    function calendar() {
        if (!cal)
            return null;
        const t0 = today0(), { y, m } = cal, first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate(), lead = first.getDay();
        const canPrev = y > t0.getFullYear() || m > t0.getMonth();
        const nav = (dd) => { let mm = m + dd, yy = y; if (mm < 0) {
            mm = 11;
            yy--;
        } if (mm > 11) {
            mm = 0;
            yy++;
        } setCal({ y: yy, m: mm }); };
        return _jsxs(_Fragment, { children: [_jsx("div", { className: c('scrim'), onClick: () => setCal(null) }), _jsxs("div", { className: c('sheet'), role: "dialog", "aria-modal": "true", "aria-labelledby": "cp-cal-t", children: [_jsxs("div", { className: c('row'), style: { justifyContent: 'space-between' }, children: [_jsx("h2", { id: "cp-cal-t", style: { margin: 0, fontSize: 20 }, children: "Requested Delivery Date" }), _jsx("button", { className: c('iconbtn'), style: { color: 'var(--ink)', borderColor: 'var(--line)' }, onClick: () => setCal(null), "aria-label": "Close", children: I.close })] }), _jsxs("div", { className: c('row'), style: { justifyContent: 'space-between' }, children: [_jsx("button", { className: c('calnav'), onClick: () => nav(-1), disabled: !canPrev, "aria-label": "Previous month", children: I.back }), _jsx("b", { style: { fontSize: 16 }, children: first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) }), _jsx("button", { className: c('calnav'), onClick: () => nav(1), "aria-label": "Next month", style: { transform: 'scaleX(-1)' }, children: I.back })] }), _jsxs("div", { className: c('cal'), children: [['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x, i) => _jsx("span", { className: c('dow'), children: x }, i)), Array.from({ length: lead }, (_, i) => _jsx("span", {}, 'l' + i)), Array.from({ length: days }, (_, i) => {
                                    const dt = new Date(y, m, i + 1), v = iso(dt), past = dt < t0, sel = wanted === v, isToday = v === iso(t0);
                                    return _jsx("button", { type: "button", className: c(`day ${sel ? 'sel' : ''} ${isToday ? 'today' : ''}`), disabled: past, "aria-pressed": sel, onClick: () => { setWanted(v); setCal(null); }, "aria-label": dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }), children: i + 1 }, v);
                                })] }), wanted && _jsx("div", { className: c('row'), children: _jsx("button", { className: c('btn ghost'), style: { flex: 1 }, onClick: () => { setWanted(''); setCal(null); }, children: "Clear date" }) })] })] });
    }
    // desktop order: same columns as Reserves & Menu; reserves, open menu and samples in their own sections
    function DeskOrderScreen() {
        const oq = orderQ.toLowerCase();
        const show = (l) => (!oq || l.s.toLowerCase().includes(oq) || l.k in ord) && (menuYear === 'all' || l.y === menuYear);
        const years = [...new Set(allLines.map(l => l.y))].sort((a, b) => b - a);
        const rg = (l) => resRow(l.k);
        const resd = sortRows('ores', orderable.resd.filter(show), { g: l => gradeN(l.s), t: l => typeN(l.s), res: l => rg(l)?.res ?? 0, ful: l => rg(l)?.ful ?? 0, so: l => rg(l)?.so ?? 0, rem: l => rg(l)?.rem ?? 0, open: l => l.open });
        const others = sortRows('oom', orderable.others.filter(show), { open: l => l.open, g: l => gradeN(l.s), t: l => typeN(l.s) });
        const clearLine = (k) => { const o = { ...ord }; delete o[k]; setOrd(o); const s0 = { ...smp }; delete s0[k]; setSmp(s0); const h = { ...holdAsk }; delete h[k]; setHoldAsk(h); };
        const setQ0 = (k, n) => { if (n > 0)
            setOrd({ ...ord, [k]: n });
        else
            clearLine(k); };
        const money0 = (l, qv) => { const p0 = priceOf(l.y, l.s); return qv > 0 && p0 != null ? money(qv * p0) : ''; };
        const label = oTot.bad ? 'Fix the red lines' : editing ? 'Review changes' : 'Review order';
        const head = (last) => _jsxs("div", { className: c('odt head'), children: [sh('ores', 's', 'Strain'), sh('ores', 'g', 'Grade'), sh('ores', 't', 'Type'), sh('ores', 'res', 'Reserved'), sh('ores', 'ful', 'Fulfilled'), sh('ores', 'so', 'Open SO'), sh('ores', 'rem', 'Remaining'), sh('ores', 'open', _jsxs(_Fragment, { children: ["Open menu", _jsx("br", {}), "available"] })), _jsx("span", { children: last }), _jsx("span", { children: "Amount" })] });
        const line = (l) => {
            const r = resRow(l.k), qv = ord[l.k] ?? 0, sp = lineSplit(l, qv), isSmp = !!smp[l.k], e = qv && !isSmp ? lineError(l, qv) : '';
            const split = qv > 0 && !e && !not10(qv) ? _jsxs(_Fragment, { children: [sp.fromRes > 0 && _jsxs("span", { className: c('chip c-res'), children: [fmt(sp.fromRes), " reserve"] }), sp.fromHold > 0 && _jsxs("span", { className: c('chip c-wait'), children: [fmt(sp.fromHold), " held"] }), sp.fromOpen > 0 && _jsxs("span", { className: c('chip c-open'), children: [fmt(sp.fromOpen), " open menu"] })] }) : null;
            return _jsxs("div", { className: c(`odt ${qv && !isSmp ? (e ? 'bad' : 'on') : ''}`), children: [_jsxs("span", { className: c('rmname'), children: [l.s, " ", yrTag(l.y), " ", l.hold > 0 && _jsxs("span", { className: c('chip c-wait'), children: [fmt(l.hold), " held for you"] }), _jsx("span", { className: c('lastord'), children: lastOrdTxt(l.s) }), e ? _jsx("span", { className: c('rmerr'), title: e, children: e }) : split && _jsx("span", { className: c('rowchips'), children: split })] }), gradeCell(l.s), typeCell(l.s), r?.res ? _jsxs(_Fragment, { children: [_jsx("span", { children: fmt(r.res) }), _jsx("span", { children: fmt(r.ful) }), _jsx("span", { children: fmt(r.so) }), _jsx("b", { children: fmt(r.rem) })] }) : _jsxs(_Fragment, { children: [_jsx("span", { className: c('muted'), children: "\u2013" }), _jsx("span", { className: c('muted'), children: "\u2013" }), _jsx("span", { className: c('muted'), children: "\u2013" }), _jsx("span", { className: c('muted'), children: "\u2013" })] }), _jsx("span", { className: c('muted'), children: fmt(l.open) }), _jsx("span", { children: isSmp ? _jsx("span", { className: c('muted'), style: { fontSize: 13 }, children: "In samples \u2193" })
                            : _jsx(AdjStepper, { plain: true, what: "to order", val: qv, step: rmStep, min: 0, max: sp.max, bad: !!e, label: l.s, onChange: n => setQ0(l.k, n) }) }), _jsx("b", { children: isSmp ? '' : money0(l, qv) })] }, l.k);
        };
        // open menu: available, order lbs, and (on any strain without a reserve) sample + hold right in the row
        const openLine = (l) => {
            const qv = ord[l.k] ?? 0, sp = lineSplit(l, qv), isSmp = !!smp[l.k], hq = holdAsk[l.k] ?? 0, canSmp = !l.resLeft;
            const e = qv ? lineError(l, qv) || (isSmp ? holdError(l, qv, hq) : '') : '';
            const split = qv > 0 && !e ? _jsxs(_Fragment, { children: [sp.fromHold > 0 && _jsxs("span", { className: c('chip c-wait'), children: [fmt(sp.fromHold), " held for you"] }), sp.fromOpen > 0 && _jsxs("span", { className: c('chip c-open'), children: [fmt(sp.fromOpen), " from open menu"] })] }) : null;
            return _jsxs("div", { className: c(`oom ${qv ? (e ? 'bad' : 'on') : ''}`), children: [_jsxs("span", { className: c('rmname'), children: [l.s, " ", yrTag(l.y), " ", l.hold > 0 && !qv && _jsxs("span", { className: c('chip c-wait'), children: [fmt(l.hold), " held for you"] }), _jsx("span", { className: c('lastord'), children: lastOrdTxt(l.s) }), isSmp && _jsx("span", { className: c('chip c-wait'), children: "Sample" }), e ? _jsx("span", { className: c('rmerr'), title: e, children: e }) : split && _jsx("span", { className: c('rowchips'), children: split })] }), gradeCell(l.s), typeCell(l.s), _jsx("span", { className: c('muted'), children: fmt(l.open) }), _jsx("span", { children: _jsx(AdjStepper, { plain: true, what: "to order", val: qv, step: isSmp ? 10 : rmStep, min: 0, max: sp.max, bad: !!lineError(l, qv) && qv > 0, label: l.s, onChange: n => setQ0(l.k, n) }) }), _jsx("span", { children: canSmp && _jsx("input", { type: "checkbox", className: c('smpchk'), checked: isSmp, "aria-label": `Order ${l.s} as a sample`, onChange: ev => { if (ev.target.checked) {
                                setSmp({ ...smp, [l.k]: true });
                                if (!ord[l.k])
                                    setOrd({ ...ord, [l.k]: 10 });
                            }
                            else {
                                const s0 = { ...smp };
                                delete s0[l.k];
                                setSmp(s0);
                                const h = { ...holdAsk };
                                delete h[l.k];
                                setHoldAsk(h);
                            } } }) }), _jsx("span", { children: isSmp ? _jsx(AdjStepper, { plain: true, what: "to hold", val: hq, step: rmStep, min: 0, max: Math.max(sp.max - qv, 0), bad: !!holdError(l, qv, hq), label: `${l.s} hold`, onChange: n => setHoldAsk({ ...holdAsk, [l.k]: n }) }) : _jsx("span", { className: c('muted'), children: "\u2013" }) }), _jsx("b", { children: money0(l, qv) })] }, l.k);
        };
        const p = priceOf(cy);
        return (_jsxs("div", { className: c('screen dorder'), children: [_jsxs("header", { className: c('hdr'), children: [_jsxs("div", { className: c('row'), style: { justifyContent: 'space-between' }, children: [_jsx("h1", { children: editing ? `Modify ${soLabel(editing)}` : 'New order' }), _jsx("button", { className: c('iconbtn'), onClick: closeOrder, "aria-label": "Close", children: I.close })] }), _jsxs("p", { className: c('sub'), children: ["Fresh frozen by the lb, in steps of 10. Use + and \u2212 or type the lbs you want.", p != null ? ` Your price: $${p.toFixed(2)}/lb.` : ''] })] }), _jsxs("div", { className: c('oside2'), children: [_jsxs("div", { className: c('olists'), children: [_jsx("section", { className: c('card'), children: _jsxs("div", { className: c('rmbar'), children: [_jsxs("div", { className: c('filters'), role: "group", "aria-label": "Filter by crop year", children: [_jsx("button", { "aria-pressed": menuYear === 'all', onClick: () => setMenuYear('all'), children: "All" }), years.map(y => _jsx("button", { "aria-pressed": menuYear === y, onClick: () => setMenuYear(menuYear === y ? 'all' : y), children: y }, y))] }), stepSet(), _jsxs("label", { className: c('search'), children: [I.search, _jsx("input", { type: "search", placeholder: "Search strains", value: orderQ, onChange: e => setOrderQ(e.target.value), "aria-label": "Search strains to order" })] })] }) }), contract && _jsxs("section", { className: c('card'), children: [_jsxs("div", { className: c('dcard-h'), children: [_jsx("h2", { children: "From your reserves" }), _jsx("span", { className: c('meta'), style: { margin: 0 }, children: "Your reserve is used first" })] }), head('Order lbs'), resd.length ? resd.map(line) : _jsx("p", { className: c('meta'), style: { padding: '12px 18px', margin: 0 }, children: oq ? 'No reserved strains match.' : 'No reserve left to order.' })] }), _jsxs("section", { className: c('card'), children: [_jsxs("div", { className: c('dcard-h'), children: [_jsx("h2", { children: "From the open menu" }), _jsxs("span", { className: c('meta'), style: { margin: 0 }, children: ["Tick Sample to try a strain first. If you like it, we hold it for you for ", d?.holdDays ?? 10, " days after the sample ships."] })] }), _jsxs("div", { className: c('oom head'), children: [sh('oom', 's', 'Strain'), sh('oom', 'g', 'Grade'), sh('oom', 't', 'Type'), sh('oom', 'open', _jsxs(_Fragment, { children: ["Open menu", _jsx("br", {}), "available"] })), _jsx("span", { children: "Order lbs" }), _jsx("span", { children: "Sample" }), _jsx("span", { children: "Hold if you like it" }), _jsx("span", { children: "Amount" })] }), others.length ? others.map(openLine) : _jsx("p", { className: c('meta'), style: { padding: '12px 18px', margin: 0 }, children: oq ? 'Nothing on the open menu matches.' : 'Nothing open on the menu right now.' })] })] }), _jsx("aside", { className: c('opanel2'), children: _jsxs("section", { className: c('card'), children: [_jsxs("div", { className: c('dcard-h'), style: { paddingBottom: 10 }, children: [_jsx("h2", { children: "Your order" }), _jsx("span", { className: c('meta'), style: { margin: 0 }, children: plural(detail.length, 'strain') })] }), detail.length === 0 && _jsx("p", { className: c('meta'), style: { padding: '0 18px 16px', margin: 0 }, children: "Use + or type lbs on any strain to start your order." }), _jsx("div", { className: c('olines'), children: detail.map(x => _jsxs("div", { className: c('oline'), children: [_jsxs("div", { className: c('row'), style: { gap: 8 }, children: [_jsxs("span", { className: c('grow'), style: { fontWeight: 600, minWidth: 0 }, children: [x.s, " ", yrTag(x.y), " ", x.sample && _jsx("span", { className: c('chip c-wait'), children: "Sample" })] }), _jsxs("span", { className: c('num'), children: [fmt(x.q), " lbs"] }), x.price != null && _jsx("b", { className: c('num'), style: { width: 78, textAlign: 'right' }, children: money(x.q * x.price) })] }), x.sample && x.hold > 0 && _jsxs("p", { className: c('meta'), style: { margin: '2px 0 0', fontSize: 12 }, children: ["Hold ", fmt(x.hold), " lbs if you like it"] })] }, x.k)) }), _jsxs("div", { style: { padding: '14px 18px', background: '#f7f9f6', borderTop: '1px solid var(--line-2)', display: 'flex', flexDirection: 'column', gap: 4 }, children: [_jsxs("p", { className: c('num'), style: { margin: 0, fontSize: 20, fontWeight: 700 }, children: [fmt(oTot.lbs), " lbs", oTot.amount != null && oTot.lbs ? ` · ${money(oTot.amount)}` : ''] }), _jsxs("div", { className: c('field'), style: { marginTop: 8 }, children: [_jsx("span", { id: "cp-wanted-l", children: "Requested Delivery Date" }), _jsxs("button", { type: "button", className: c('datebtn'), "aria-labelledby": "cp-wanted-l", "aria-haspopup": "dialog", onClick: () => { const b = wanted ? new Date(wanted + 'T12:00') : today0(); setCal({ y: b.getFullYear(), m: b.getMonth() }); }, children: [wanted ? niceDate(wanted) : _jsx("span", { style: { color: '#8a948d' }, children: "Choose a delivery date" }), I.cal] })] }), _jsxs("div", { style: { marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }, children: [_jsx("button", { className: c('btn full'), disabled: !oTot.lbs || oTot.bad, onClick: () => go('review'), children: label }), detail.length > 0 && _jsx("button", { className: c('linkish'), style: { minWidth: 0, textAlign: 'center' }, onClick: () => { setOrd({}); setSmp({}); setHoldAsk({}); }, children: "Clear order" })] })] }), _jsxs("div", { style: { padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid var(--line-2)' }, children: [_jsxs("label", { className: c('field'), children: ["Note ", _jsx("span", { className: c('meta'), style: { marginTop: -6 }, children: "optional" }), _jsx("input", { type: "text", placeholder: "Pickup or delivery details", value: note, onChange: e => setNote(e.target.value) })] }), _jsxs("label", { className: c('field'), children: ["PO # ", _jsx("span", { className: c('meta'), style: { marginTop: -6 }, children: "optional" }), _jsx("input", { type: "text", value: po, onChange: e => setPo(e.target.value) })] })] })] }) })] }), calendar()] }));
    }
    function OrderScreen() {
        const p = priceOf(cy);
        const oq = orderQ.toLowerCase(), match = (l) => !oq || l.s.toLowerCase().includes(oq) || l.k in ord;
        const section = (all) => {
            const arr = all.filter(match);
            return arr.length ? _jsxs("section", { className: c('card'), children: [_jsxs("div", { className: c('mg mg-head'), children: [_jsx("span", { children: "Strain" }), _jsxs("span", { className: c('mg-a'), children: ["Available", _jsx("span", { className: c('meta'), style: { display: 'block', fontSize: 11, margin: 0 }, children: "lbs" })] }), _jsx("span", {})] }), arr.map(l => _jsx(Fragment, { children: orderLineEl(l) }, l.k))] }) : oq && all.length ? _jsxs("p", { className: c('meta'), style: { margin: '0 4px' }, children: ["No strains match \"", orderQ, "\"."] }) : null;
        };
        return (_jsxs("div", { className: c('screen'), children: [_jsxs("header", { className: c('hdr'), children: [_jsxs("div", { className: c('row'), style: { justifyContent: 'space-between' }, children: [_jsx("h1", { children: editing ? `Modify ${soLabel(editing)}` : 'New order' }), _jsx("button", { className: c('iconbtn'), onClick: closeOrder, "aria-label": "Close", children: I.close })] }), _jsxs("p", { className: c('sub'), children: [contract ? 'Order from your contract reserves, or straight off the open menu.' : 'Order off the open menu.', " Fresh frozen by the lb, in steps of 10. Tap a number to type it.", p != null ? ` Your price: $${p.toFixed(2)}/lb.` : ''] }), _jsxs("label", { className: c('search'), children: [I.search, _jsx("input", { type: "search", placeholder: "Search strains", value: orderQ, onChange: e => setOrderQ(e.target.value), "aria-label": "Search strains to order" })] })] }), (() => {
                    const lists = _jsxs(_Fragment, { children: [contract && _jsxs(_Fragment, { children: [_jsx("h2", { className: c('h2'), style: { marginTop: 0 }, children: "From your reserves" }), section(orderable.resd) ?? _jsx("p", { className: c('meta'), style: { margin: '0 4px' }, children: "No reserve left to order." }), _jsx("h2", { className: c('h2'), style: { marginTop: 10 }, children: "From the open menu" })] }), section(orderable.others) ?? _jsx("p", { className: c('meta'), style: { margin: '0 4px' }, children: "Nothing open on the menu right now." })] });
                    const fields = _jsxs("section", { className: c('card'), style: { padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }, children: [_jsxs("div", { className: c('grid2'), children: [_jsxs("label", { className: c('field'), children: ["PO # ", _jsx("span", { className: c('meta'), style: { marginTop: -6 }, children: "optional" }), _jsx("input", { type: "text", value: po, onChange: e => setPo(e.target.value) })] }), _jsxs("div", { className: c('field'), children: [_jsx("span", { id: "cp-wanted-l", children: "Requested Delivery Date" }), _jsx("span", { className: c('meta'), style: { marginTop: -6 }, children: "optional" }), _jsxs("button", { type: "button", className: c('datebtn'), "aria-labelledby": "cp-wanted-l", "aria-haspopup": "dialog", onClick: () => { const b = wanted ? new Date(wanted + 'T12:00') : today0(); setCal({ y: b.getFullYear(), m: b.getMonth() }); }, children: [wanted ? niceDate(wanted) : _jsx("span", { style: { color: '#8a948d' }, children: "Choose a date" }), I.cal] })] })] }), _jsxs("label", { className: c('field'), children: ["Note ", _jsx("span", { className: c('meta'), style: { marginTop: -6 }, children: "optional" }), _jsx("input", { type: "text", placeholder: "Pickup or delivery details", value: note, onChange: e => setNote(e.target.value) })] })] });
                    const label = oTot.bad ? 'Fix the red lines' : editing ? 'Review changes' : 'Review order';
                    // desktop: the order builds up in a panel beside the lists, always in view
                    if (desk)
                        return _jsxs("main", { className: c('main oside'), children: [_jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }, children: lists }), _jsxs("aside", { className: c('opanel'), children: [_jsxs("section", { className: c('card'), children: [_jsxs("div", { className: c('dcard-h'), style: { paddingBottom: 8 }, children: [_jsx("h2", { children: "Your order" }), _jsx("span", { className: c('meta'), style: { margin: 0 }, children: plural(detail.length, 'strain') })] }), detail.length === 0 && _jsx("p", { className: c('meta'), style: { padding: '0 18px 14px', margin: 0 }, children: "Tap + Add on a strain to start your order." }), detail.map(x => _jsxs("div", { className: c('row'), style: { padding: '8px 18px', borderTop: '1px solid var(--line-2)', fontSize: 14 }, children: [_jsxs("span", { className: c('grow'), style: { fontWeight: 600 }, children: [x.s, " ", yrTag(x.y), " ", x.sample && _jsx("span", { className: c('chip c-wait'), children: "Sample" })] }), _jsxs("span", { className: c('num'), children: [fmt(x.q), " lbs"] }), x.price != null && _jsx("b", { className: c('num'), style: { width: 76, textAlign: 'right' }, children: money(x.q * x.price) })] }, x.k)), _jsxs("div", { style: { padding: '14px 18px', background: '#f7f9f6', borderTop: '1px solid var(--line-2)', display: 'flex', flexDirection: 'column', gap: 10 }, children: [_jsx("div", { className: c('row'), children: _jsxs("div", { className: c('grow'), children: [_jsxs("p", { className: c('num'), style: { margin: 0, fontSize: 20, fontWeight: 700 }, children: [fmt(oTot.lbs), " lbs", oTot.amount != null ? ` · ${money(oTot.amount)}` : ''] }), contract && _jsxs("p", { className: c('meta'), style: { margin: 0 }, children: [fmt(oTot.res), " from reserves \u00B7 ", fmt(oTot.open), " from open menu"] })] }) }), _jsx("button", { className: c('btn full'), disabled: !oTot.lbs || oTot.bad, onClick: () => go('review'), children: label })] })] }), fields] })] });
                    return _jsxs(_Fragment, { children: [_jsxs("main", { className: c('main'), children: [lists, fields] }), _jsxs("div", { className: c('dock white'), children: [_jsxs("div", { className: c('grow'), children: [_jsxs("p", { className: c('num'), style: { margin: 0, fontSize: 18, fontWeight: 700 }, children: [fmt(oTot.lbs), " lbs"] }), _jsxs("p", { className: c('meta'), style: { margin: 0 }, children: [contract ? `${fmt(oTot.res)} reserve · ${fmt(oTot.open)} open` : '', oTot.amount != null ? `${contract ? ' · ' : ''}${money(oTot.amount)}` : ''] })] }), _jsx("button", { className: c('btn'), disabled: !oTot.lbs || oTot.bad, onClick: () => go('review'), children: label })] })] });
                })(), calendar()] }));
    }
    const splitText = (x) => [x.fromRes ? `${fmt(x.fromRes)} from reserve` : '', x.fromHold ? `${fmt(x.fromHold)} held for you` : '', x.fromOpen ? `${fmt(x.fromOpen)} from open menu` : ''].filter(Boolean).join(' · ');
    // phone: the order as a small table (lbs / price / total), on Review your order and Order sent
    const phoneOrderTable = (detail, tot, sent = false) => _jsxs("section", { className: c('card'), style: { overflow: 'hidden' }, children: [_jsxs("div", { className: c('rvt head'), children: [_jsx("span", { children: "Strain" }), _jsx("span", { children: "Lbs" }), _jsx("span", { children: "Price" }), _jsx("span", { children: "Total" })] }), detail.map(x => _jsxs("div", { className: c('rvt'), children: [_jsxs("span", { children: [_jsxs("span", { className: c('name'), children: [x.s, " ", yrTag(x.y), " ", x.sample && _jsx("span", { className: c('chip c-wait'), children: "Sample" })] }), _jsxs("span", { className: c('meta'), children: [splitText(x), x.hold ? (sent ? ` · holding ${fmt(x.hold)} lbs after it ships` : ` · hold ${fmt(x.hold)} lbs if you like it`) : ''] })] }), _jsx("span", { children: fmt(x.q) }), _jsx("span", { children: x.price != null ? `$${x.price.toFixed(2)}` : '–' }), _jsx("b", { children: x.price != null ? money(x.q * x.price) : '–' })] }, x.k)), _jsxs("div", { className: c('rvt total'), children: [_jsxs("span", { children: [_jsx("b", { children: "Total" }), contract && tot.res > 0 && _jsxs("span", { className: c('meta'), children: [fmt(tot.res), " from reserves \u00B7 ", fmt(tot.lbs - tot.res), " from open menu"] })] }), _jsx("b", { children: fmt(tot.lbs) }), _jsx("span", {}), _jsx("b", { style: { fontSize: 16 }, children: tot.amount != null ? money(tot.amount) : '–' })] })] });
    const orderTable = (dt, tot) => _jsxs("section", { className: c('card'), children: [_jsxs("div", { className: c('ort head'), children: [_jsx("span", { children: "Strain" }), _jsx("span", { children: "Order lbs" }), _jsx("span", { children: "Price" }), _jsx("span", { children: "Total" })] }), dt.map(x => _jsxs("div", { className: c('ort'), children: [_jsxs("span", { className: c('rmname'), children: [x.s, " ", yrTag(x.y), " ", x.sample && _jsx("span", { className: c('chip c-wait'), children: "Sample" }), x.fromRes > 0 && _jsxs("span", { className: c('chip c-res'), children: [fmt(x.fromRes), " reserve"] }), x.fromHold > 0 && _jsxs("span", { className: c('chip c-wait'), children: [fmt(x.fromHold), " held"] }), x.fromOpen > 0 && _jsxs("span", { className: c('chip c-open'), children: [fmt(x.fromOpen), " open menu"] }), x.hold > 0 && _jsxs("span", { className: c('muted'), style: { fontSize: 12, fontWeight: 500 }, children: ["hold ", fmt(x.hold), " lbs if you like it"] })] }), _jsxs("span", { children: [fmt(x.q), " lbs"] }), _jsx("span", { children: x.price != null ? `$${x.price.toFixed(2)}/lb` : '–' }), _jsx("b", { children: x.price != null ? money(x.q * x.price) : '–' })] }, x.k)), _jsxs("div", { className: c('ort total'), children: [_jsxs("b", { children: ["Total \u00B7 ", plural(dt.length, 'strain')] }), _jsxs("b", { children: [fmt(tot.lbs), " lbs"] }), _jsx("span", {}), _jsx("b", { style: { fontSize: 18 }, children: tot.amount != null ? money(tot.amount) : '–' })] })] });
    function ReviewScreen() {
        if (!detail.length)
            return _jsxs("div", { className: c('screen'), children: [_jsxs("header", { className: c('hdr'), children: [back('order', 'Keep editing'), _jsx("h1", { children: "Review your order" })] }), _jsx("p", { className: c('loading'), children: "Nothing on the order yet." })] });
        return (_jsxs("div", { className: c('screen'), children: [_jsxs("header", { className: c('hdr'), children: [back('order', 'Keep editing'), _jsx("h1", { children: editing ? `Review changes to ${soLabel(editing)}` : 'Review your order' }), _jsx("p", { className: c('sub'), children: editing ? 'Saving sends the updated order back to Lifted to confirm.' : 'Nothing is sent until you tap Place order.' })] }), _jsxs("main", { className: c('main'), children: [desk ? orderTable(detail, oTot) : phoneOrderTable(detail, oTot), (po || wanted || note) && _jsxs("section", { className: c('card'), style: { padding: '12px 16px', fontSize: 14, display: 'flex', flexDirection: 'column', gap: 4 }, children: [po && _jsxs("span", { children: [_jsx("span", { className: c('meta'), style: { display: 'inline' }, children: "PO" }), " ", po] }), wanted && _jsxs("span", { children: [_jsx("span", { className: c('meta'), style: { display: 'inline' }, children: "Requested delivery" }), " ", niceDate(wanted)] }), note && _jsxs("span", { children: [_jsx("span", { className: c('meta'), style: { display: 'inline' }, children: "Note" }), " ", note] })] }), detail.filter(x => x.hold).map(x => _jsxs("div", { className: c('note gold'), children: [_jsx("b", { children: "Sample hold:" }), " we'll hold ", fmt(x.hold), " lbs of ", x.s, " for you for ", _jsxs("b", { children: [d?.holdDays ?? 10, " days after this order ships"] }), ", so you can try the sample first. The hold starts once Lifted confirms the order. ", contract ? 'Reserve' : 'Order', " them any time before it ends."] }, 'h' + x.k)), _jsx("p", { className: c('meta'), style: { margin: '0 4px' }, children: "Lifted confirms every order before it ships." })] }), _jsxs("div", { className: c('dock white'), children: [_jsx("button", { className: c('btn ghost'), style: { flex: 1 }, onClick: () => go('order'), children: "Keep editing" }), _jsx("button", { className: c('btn'), style: { flex: 1.4 }, disabled: busy, onClick: placeOrder, children: busy ? 'Sending…' : editing ? 'Save changes' : 'Place order' })] })] }));
    }
    function OrderedScreen() {
        const o = lastOrder;
        if (!o)
            return _jsx("div", { className: c('screen'), children: _jsx("p", { className: c('loading'), children: "Done." }) });
        return (_jsxs("div", { className: c('screen'), children: [_jsxs("header", { className: c('hdr done-hdr'), children: [_jsx("span", { className: c('check'), children: I.check }), _jsx("h1", { style: { marginTop: 6 }, children: o.modified ? 'Order updated' : 'Order sent' }), _jsxs("p", { className: c('sub'), style: { fontSize: 15 }, children: [o.label, desk ? '' : ` · ${fmt(o.lbs)} lbs`, ". ", o.modified ? 'Lifted will confirm the changes.' : "Lifted will confirm it and let you know when it's ready."] })] }), _jsxs("main", { className: c('main'), children: [desk ? _jsxs(_Fragment, { children: [orderTable(o.detail, o), doneBtns('View my orders', () => { setFilter('all'); go('orders'); }), (o.po || o.wanted || o.note) && _jsxs("section", { className: c('card'), style: { padding: '12px 16px', fontSize: 14, display: 'flex', flexDirection: 'column', gap: 4 }, children: [o.po && _jsxs("span", { children: [_jsx("span", { className: c('meta'), style: { display: 'inline' }, children: "PO" }), " ", o.po] }), o.wanted && _jsxs("span", { children: [_jsx("span", { className: c('meta'), style: { display: 'inline' }, children: "Requested delivery" }), " ", niceDate(o.wanted)] }), o.note && _jsxs("span", { children: [_jsx("span", { className: c('meta'), style: { display: 'inline' }, children: "Note" }), " ", o.note] })] }), o.detail.filter(x => x.hold).map(x => _jsxs("div", { className: c('note gold'), children: [_jsx("b", { children: "Sample hold:" }), " we'll hold ", fmt(x.hold), " lbs of ", x.s, " for you for ", _jsxs("b", { children: [d?.holdDays ?? 10, " days after this order ships"] }), ". The hold starts once Lifted confirms the order."] }, 'h' + x.k))] })
                            : phoneOrderTable(o.detail, { lbs: o.lbs, res: o.res, amount: o.amount ?? null }, true), !desk && doneBtns('View my orders', () => { setFilter('all'); go('orders'); }), !desk && contract && o.res > 0 && _jsxs("div", { className: c('note teal'), children: ["After this order your ", _jsx("b", { children: "contract reserves" }), " drop to ", _jsxs("b", { children: [fmt(totals.left), " lbs left"] }), ".", o.lbs - o.res > 0 ? ` The ${fmt(o.lbs - o.res)} open-menu lbs don't count against your reserve.` : ''] })] })] }));
    }
    // ---------- yields (mockup) ----------
    // A strain on an order can be split into parts: some fresh frozen washed to hash (and maybe pressed to rosin), some run to BHO.
    const G_PER = { g: 1, kg: 1000, lb: 453.592, '%': 0, '%ff': 0 };
    const UNITS = [['g', 'grams'], ['kg', 'kgs'], ['lb', 'lbs'], ['%', '% of FF']];
    const ROSIN_UNITS = [['g', 'grams'], ['kg', 'kgs'], ['lb', 'lbs'], ['%', '% of hash'], ['%ff', '% of FF']];
    const newPart = (ff) => ({ bho: false, rosin: true, ff, outV: null, outU: 'g', rosinV: null, rosinU: 'g' });
    // shipped orders made in the app, newest first, with their report (if any)
    // orders shipped since yields started (SQL 326 yield_reports_from) can be reported; older ones would swamp customers
    const yOrders = useMemo(() => (d?.yields ? orows.filter(o => o.status === 'shipped' && o.order && o.order.order_lines.length && (o.order.shipped_date ?? o.date ?? '') >= YIELDS_FROM) : [])
        .map(o => ({ o, rep: d?.yields?.find(r => r.orderId === o.order.id) ?? null })), [orows, d]);
    const yToDo = yOrders.filter(x => !x.rep?.sentAt);
    const [yOrder, setYOrder] = useState(null);
    const [yDraft, setYDraft] = useState([]);
    const [yEdit, setYEdit] = useState(true); // a sent report opens locked; Edit report unlocks it
    const [yTxt, setYTxt] = useState({}); // what's typed in each amount box, so "3." and "0.50" stay as typed
    const openYield = (orderId) => {
        const x = yOrders.find(z => z.o.order.id === orderId);
        if (!x)
            return;
        // one line per strain + crop year on the order (samples included); the first part starts with everything that shipped
        const by = new Map();
        for (const l of x.o.order.order_lines) {
            const y0 = l.crop_year ?? cy, k = l.strain + '|' + y0, v = by.get(k);
            if (v)
                v.shipped += Number(l.lbs);
            else
                by.set(k, { s: l.strain, y: y0, shipped: Number(l.lbs), parts: [], note: '' });
        }
        const saved = x.rep?.lines ?? [];
        setYDraft([...by.values()].map(l => {
            const sv = saved.find(z => z.s === l.s && z.y === l.y);
            return { ...l, note: sv?.note ?? '', issue: sv?.issue ?? null, parts: sv?.parts?.length ? sv.parts.map(p => ({ ...p })) : [newPart(l.shipped)] };
        }));
        setYEdit(!x.rep?.sentAt);
        setYTxt({});
        setYOrder(orderId);
        go('yield');
    };
    // grams for each step of one part, and the yields worked out from them
    const yCalc = (p) => {
        const ffG = (p.ff ?? 0) * G_PER.lb;
        const outG = p.outV == null ? null : p.outU === '%' ? ffG * p.outV / 100 : p.outV * G_PER[p.outU];
        const hashG = p.bho ? null : outG, bhoG = p.bho ? outG : null;
        const rosinG = p.bho || !p.rosin || p.rosinV == null ? null : p.rosinU === '%' ? (hashG == null ? null : hashG * p.rosinV / 100) : p.rosinU === '%ff' ? ffG * p.rosinV / 100 : p.rosinV * G_PER[p.rosinU];
        const of = (g, base) => g != null && base ? g / base * 100 : null;
        return { ffG, hashG, bhoG, rosinG, hashPct: of(hashG, ffG), bhoPct: of(bhoG, ffG), rosinOfHash: of(rosinG, hashG), rosinOfFF: of(rosinG, ffG) };
    };
    const pct = (n) => n == null ? '–' : `${n < 10 ? n.toFixed(2) : n.toFixed(1)}%`;
    const gFmt = (g) => g == null ? '' : g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g).toLocaleString()} g`;
    const pDone = (p) => p.outV != null || (!p.bho && p.rosinV != null);
    const yDone = (l) => l.parts.some(pDone);
    async function saveYields(send) {
        if (yOrder == null)
            return;
        const fn = backend.saveYields;
        const ok = await run(async () => { if (fn)
            await fn.call(backend, yOrder, yDraft, send); return true; });
        if (ok === undefined)
            return;
        if (send) { // confirmation page: a summary of what they just sent
            const x = yOrders.find(z => z.o.order.id === yOrder);
            setYSent({ label: x?.o.label ?? 'this order', revised: !!x?.rep?.sentAt, lines: yDraft.map(l => ({ ...l, parts: l.parts.filter(pDone) })) });
            await reload();
            go('ysent');
            return;
        }
        toast('Saved. You can finish later.');
        await reload();
        go('yields');
    }
    // "Report an issue" on a strain: what was wrong with the flower, as tick boxes plus a description
    const ISSUE_KINDS = ['Mold', 'Bud rot', 'Foreign matter', 'Other'];
    const issueTxt = (x) => [x.kinds.join(', '), x.text.trim()].filter(Boolean).join(' · ');
    const [yIssue, setYIssue] = useState(null);
    function issueSheet() {
        if (!yIssue)
            return null;
        const l = yDraft[yIssue.i];
        if (!l)
            return null;
        const close = () => setYIssue(null);
        const save = (issue) => { setYDraft(yDraft.map((z, j) => j === yIssue.i ? { ...z, issue } : z)); close(); };
        const tog = (k) => setYIssue({ ...yIssue, kinds: yIssue.kinds.includes(k) ? yIssue.kinds.filter(z => z !== k) : [...yIssue.kinds, k] });
        const ok = yIssue.kinds.length > 0 || yIssue.text.trim().length > 0;
        return _jsxs(_Fragment, { children: [_jsx("div", { className: c('scrim'), onClick: close }), _jsxs("div", { className: c('sheet'), role: "dialog", "aria-modal": "true", "aria-labelledby": "cp-yi-t", children: [_jsxs("div", { className: c('row'), style: { justifyContent: 'space-between' }, children: [_jsxs("h2", { id: "cp-yi-t", style: { margin: 0, fontSize: 22 }, children: ["Issue with ", l.s] }), _jsx("button", { className: c('iconbtn'), style: { color: 'var(--ink)', borderColor: 'var(--line)' }, onClick: close, "aria-label": "Close", children: I.close })] }), _jsx("p", { className: c('meta'), style: { fontSize: 15, margin: 0 }, children: "Something wrong with this strain? Tell us what you found." }), _jsx("div", { className: c('filters'), role: "group", "aria-label": "What was wrong", children: ISSUE_KINDS.map(k => _jsx("button", { "aria-pressed": yIssue.kinds.includes(k), onClick: () => tog(k), children: k }, k)) }), _jsxs("label", { className: c('field'), children: ["What did you find?", _jsx("textarea", { className: c('fbtext'), rows: 4, maxLength: 2000, value: yIssue.text, onChange: e => setYIssue({ ...yIssue, text: e.target.value }), placeholder: "How much was affected, where in the bags, what it looked like\u2026" })] }), _jsxs("div", { className: c('row'), style: { gap: 10 }, children: [l.issue ? _jsx("button", { className: c('btn ghost'), style: { flex: 1 }, onClick: () => save(null), children: "Remove issue" })
                                    : _jsx("button", { className: c('btn ghost'), style: { flex: 1 }, onClick: close, children: "Cancel" }), _jsx("button", { className: c('btn'), style: { flex: 1.4 }, disabled: !ok, onClick: () => save({ kinds: yIssue.kinds, text: yIssue.text.trim() }), children: "Save issue" })] })] })] });
    }
    const [ySent, setYSent] = useState(null);
    const procTxt = (p) => p.bho ? 'BHO' : p.rosin ? 'Hash + Rosin' : 'Hash';
    function YieldSentScreen() {
        const r = ySent;
        if (!r)
            return _jsx("div", { className: c('screen'), children: _jsx("p", { className: c('loading'), children: "Done." }) });
        const done = r.lines.filter(l => l.parts.length || l.issue), blank = r.lines.filter(l => !l.parts.length && !l.issue);
        const runs = done.flatMap(l => l.parts.map(p => ({ orderId: 0, label: '', date: null, p, note: '', k: yCalc(p), draft: false })));
        const all = yAgg(runs), ffLbs = runs.reduce((a, x) => a + (x.p.ff ?? 0), 0);
        // hash and BHO together, weighted by the fresh frozen run
        const outRs = runs.filter(x => (x.k.hashG ?? x.k.bhoG) != null), outFF = outRs.reduce((a, x) => a + x.k.ffG, 0);
        const outAvg = outFF > 0 ? outRs.reduce((a, x) => a + (x.k.hashG ?? x.k.bhoG ?? 0), 0) / outFF * 100 : null;
        // percentages only, all of fresh frozen: hash or BHO, and rosin
        const outCell = (p) => { const k = yCalc(p); return _jsx(_Fragment, { children: pct(p.bho ? k.bhoPct : k.hashPct) }); };
        const rosCell = (p) => {
            if (p.bho || !p.rosin || p.rosinV == null)
                return _jsx("span", { className: c('meta'), style: { display: 'inline' }, children: "\u2013" });
            const k = yCalc(p);
            return _jsx(_Fragment, { children: pct(k.rosinOfFF) });
        };
        return (_jsxs("div", { className: c('screen ysent'), children: [_jsxs("header", { className: c('hdr done-hdr'), children: [_jsx("span", { className: c('check'), children: I.check }), _jsx("h1", { style: { marginTop: 6 }, children: r.revised ? 'Revisions sent' : 'Yields sent' }), _jsxs("p", { className: c('sub'), style: { fontSize: 15 }, children: [r.label, " \u00B7 ", plural(done.length, 'strain'), " sent to Lifted. Thank you! You can view or edit this report any time from Yields."] })] }), _jsxs("main", { className: c('main'), children: [desk ? _jsxs("section", { className: c('card'), style: { padding: 0, overflow: 'hidden' }, children: [_jsxs("div", { className: c('ysum head'), children: [_jsx("span", { children: "Strain" }), _jsx("span", { children: "Process" }), _jsx("span", { children: "Fresh frozen" }), _jsx("span", { children: "Hash / BHO yield" }), _jsx("span", { children: "Rosin yield" })] }), done.map(l => _jsxs(Fragment, { children: [!l.parts.length && _jsxs("div", { className: c('ysum'), children: [_jsxs("span", { children: [_jsx("b", { children: l.s }), " ", yrTag(l.y)] }), _jsx("span", { className: c('meta'), children: "Not run" }), _jsx("span", {}), _jsx("span", {}), _jsx("span", {})] }), l.parts.map((p, pi) => _jsxs("div", { className: c(`ysum ${pi ? 'cont' : ''}`), children: [_jsx("span", { children: pi === 0 && _jsxs(_Fragment, { children: [_jsx("b", { children: l.s }), " ", yrTag(l.y), l.parts.length > 1 && _jsx("span", { className: c('meta'), children: plural(l.parts.length, 'run') })] }) }), _jsx("span", { children: procTxt(p) }), _jsx("span", { children: p.ff == null ? '–' : `${fmt(p.ff)} lbs` }), _jsx("span", { children: outCell(p) }), _jsx("span", { children: rosCell(p) })] }, pi)), l.issue && _jsxs("div", { className: c('ysum cont note'), children: [_jsx("span", {}), _jsxs("span", { className: c('yissue-txt'), children: ["Issue: ", _jsx("b", { children: issueTxt(l.issue) })] })] }), l.note && _jsxs("div", { className: c('ysum cont note'), children: [_jsx("span", {}), _jsxs("span", { className: c('meta'), children: ["Note: ", l.note] })] })] }, l.s + l.y)), _jsxs("div", { className: c('ysum total'), children: [_jsxs("span", { children: ["Total \u00B7 ", plural(done.length, 'strain')] }), _jsx("span", {}), _jsxs("span", { children: [fmt(ffLbs), " lbs"] }), _jsx("span", { children: pct(outAvg) }), _jsx("span", { children: pct(all.rosinOfFF) })] })] })
                            : _jsxs("section", { className: c('card'), children: [done.map(l => _jsx("div", { className: c('li'), style: { alignItems: 'flex-start' }, children: _jsxs("div", { className: c('grow'), children: [_jsxs("p", { className: c('name'), children: [l.s, " ", yrTag(l.y)] }), l.parts.map((p, pi) => _jsxs("p", { className: c('meta'), children: [l.parts.length > 1 ? `Run ${pi + 1}: ` : '', procTxt(p), " \u00B7 ", p.ff == null ? '–' : `${fmt(p.ff)} lbs`, " FF \u2192 ", outCell(p), !p.bho && p.rosin && p.rosinV != null && _jsxs(_Fragment, { children: [" \u00B7 rosin ", rosCell(p)] })] }, pi)), !l.parts.length && _jsx("p", { className: c('meta'), children: "Not run" }), l.issue && _jsxs("p", { className: c('yissue-txt'), children: ["Issue: ", _jsx("b", { children: issueTxt(l.issue) })] }), l.note && _jsxs("p", { className: c('meta'), style: { fontStyle: 'italic' }, children: ["\u201C", l.note, "\u201D"] })] }) }, l.s + l.y)), _jsxs("div", { className: c('li'), style: { background: '#f7f9f6' }, children: [_jsx("b", { className: c('grow'), children: "Total" }), _jsxs("b", { className: c('num'), children: [fmt(ffLbs), " lbs FF", outAvg != null ? ` · ${pct(outAvg)} yield` : ''] })] })] }), blank.length > 0 && _jsxs("div", { className: c('note gold'), children: [_jsx("b", { children: "Not reported yet:" }), " ", blank.map(l => l.s).join(', '), ". Add them any time from Yields when you've run them."] }), doneBtns('See my results', () => { setYTab('results'); go('yields'); })] })] }));
    }
    // lbs-weighted yields over a set of parts
    const yAgg = (rs) => {
        const sumG = (f) => rs.reduce((a, r) => a + (f(r) ?? 0), 0);
        const hashRs = rs.filter(r => r.k.hashG != null), bhoRs = rs.filter(r => r.k.bhoG != null), rosRs = rs.filter(r => r.k.rosinG != null), both = rosRs.filter(r => r.k.hashG != null);
        const ff = (xs) => xs.reduce((a, r) => a + r.k.ffG, 0);
        const div = (a, b) => b > 0 ? a / b * 100 : null;
        return { hashPct: div(sumG(r => r.k.hashG), ff(hashRs)), bhoPct: div(sumG(r => r.k.bhoG), ff(bhoRs)),
            rosinOfFF: div(sumG(r => r.k.rosinG), ff(rosRs)), rosinOfHash: div(both.reduce((a, r) => a + (r.k.rosinG ?? 0), 0), both.reduce((a, r) => a + (r.k.hashG ?? 0), 0)) };
    };
    const yStrains = useMemo(() => {
        const m = new Map();
        for (const r of d?.yields ?? []) {
            const o = orows.find(x => x.order?.id === r.orderId);
            for (const l of r.lines)
                for (const p of l.parts ?? []) {
                    if (!pDone(p))
                        continue;
                    const key = l.s + '|' + l.y, v = m.get(key) ?? { s: l.s, y: l.y, runs: [], lbs: 0, hashPct: null, rosinOfHash: null, rosinOfFF: null, bhoPct: null };
                    v.runs.push({ orderId: r.orderId, label: o?.label ?? `Order ${r.orderId}`, date: o?.date ?? r.savedAt, p, note: l.note, k: yCalc(p), draft: !r.sentAt });
                    m.set(key, v);
                }
        }
        for (const v of m.values()) {
            v.lbs = v.runs.reduce((a, r) => a + (r.p.ff ?? 0), 0);
            Object.assign(v, yAgg(v.runs));
            v.runs.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
        }
        return [...m.values()];
    }, [d, orows]);
    const [yTab, setYTab] = useState(null);
    const [yOpen, setYOpen] = useState(null);
    const [yProc, setYProc] = useState('all'); // SHO = hash / hash + rosin runs, BHO = BHO runs
    function YieldsScreen() {
        const tab = yTab ?? (yToDo.length ? 'report' : 'results');
        const chipOf = (r) => r?.sentAt ? _jsx("span", { className: c('chip c-ok'), children: "Sent" }) : r?.savedAt ? _jsx("span", { className: c('chip c-wait'), children: "Draft" }) : _jsx("span", { className: c('chip c-sub'), children: "To report" });
        const ql = q.toLowerCase();
        const years = [...new Set(yStrains.map(x => x.y))].sort((a, b) => b - a);
        // the SHO / BHO filter is by how they ran it (hash vs BHO), not the strain's grade: keep only those runs and redo the numbers
        const byProc = yStrains.map(x => {
            if (yProc === 'all')
                return x;
            const runs = x.runs.filter(r => yProc === 'BHO' ? r.p.bho : !r.p.bho);
            return { ...x, runs, lbs: runs.reduce((a, r) => a + (r.p.ff ?? 0), 0), ...yAgg(runs) };
        }).filter(x => x.runs.length);
        const rows = sortRows('yres', byProc.filter(x => (!ql || x.s.toLowerCase().includes(ql)) && (menuYear === 'all' || x.y === menuYear)), { runs: x => x.runs.length, lbs: x => x.lbs, hash: x => x.hashPct ?? -1, roh: x => x.rosinOfHash ?? -1, rof: x => x.rosinOfFF ?? -1, bho: x => x.bhoPct ?? -1 });
        const tot = yAgg(rows.flatMap(x => x.runs));
        // each run under its strain: on desktop the same columns as the strain row above, so every % lines up
        const runList = (x) => desk
            ? _jsx("div", { className: c('yruns2'), children: x.runs.map((r, i) => _jsxs("div", { className: c('yres sub'), children: [_jsxs("span", { className: c('yrunname'), children: [_jsx("button", { className: c('linkish'), style: { minWidth: 0, display: 'inline' }, onClick: () => openYield(r.orderId), children: r.label }), _jsx("span", { className: c('muted'), children: shortDate(r.date) }), r.draft && _jsx("span", { className: c('chip c-wait'), children: "Draft" })] }), _jsxs("span", { children: [fmt(r.p.ff ?? 0), " lbs"] }), _jsx("span", { children: pct(r.k.hashPct) }), _jsx("span", { children: pct(r.k.rosinOfHash) }), _jsx("span", { children: pct(r.k.rosinOfFF) }), _jsx("span", { children: pct(r.k.bhoPct) }), _jsx("span", {})] }, i)) })
            : _jsx("div", { className: c('yruns'), children: x.runs.map((r, i) => _jsxs("div", { className: c('ymres sub'), children: [_jsxs("span", { children: [_jsx("button", { className: c('linkish'), style: { minWidth: 0, display: 'inline', textAlign: 'left' }, onClick: () => openYield(r.orderId), children: r.label }), _jsxs("span", { className: c('meta'), children: [shortDate(r.date), " \u00B7 ", fmt(r.p.ff ?? 0), " lbs", r.draft ? ' · Draft' : ''] })] }), _jsx("span", { children: pct(r.k.hashPct) }), _jsx("span", { children: pct(r.k.rosinOfFF) }), _jsx("span", { children: pct(r.k.bhoPct) }), _jsx("span", {})] }, i)) });
        return (_jsxs("div", { className: c('screen ylist'), children: [_jsxs("header", { className: c('hdr'), children: [back('home', 'Home'), _jsx("h1", { children: "Yields" }), _jsx("p", { className: c('sub'), children: "Report how each strain ran, and see how your hash, rosin and BHO yields compare across strains and orders." })] }), _jsxs("main", { className: c('main'), children: [_jsxs("div", { className: c('filters ytabs'), role: "tablist", "aria-label": "Yields", children: [_jsx("button", { role: "tab", "aria-selected": tab === 'results', "aria-pressed": tab === 'results', onClick: () => setYTab('results'), children: "My results" }), _jsxs("button", { role: "tab", "aria-selected": tab === 'report', "aria-pressed": tab === 'report', onClick: () => setYTab('report'), children: ["Report yields", yToDo.length > 0 ? ` (${yToDo.length})` : ''] })] }), tab === 'report' ? _jsxs(_Fragment, { children: [yToDo.length > 0 && _jsxs("div", { className: c('note teal'), children: [_jsx("b", { children: plural(yToDo.length, 'order') }), " waiting for yields. It takes less than a minute per strain, and you can save and finish later."] }), _jsxs("section", { className: c('card'), children: [yOrders.length === 0 && _jsx("p", { className: c('meta'), style: { padding: 16, margin: 0 }, children: "Once an order ships, it shows up here." }), yOrders.map(({ o, rep }) => {
                                            const ls = o.order.order_lines, strains = [...new Set(ls.map(l => l.strain))], done = rep?.lines.filter(yDone).length ?? 0;
                                            return _jsxs("button", { className: c('li btnrow'), onClick: () => openYield(o.order.id), children: [_jsxs("div", { className: c('grow'), children: [_jsxs("p", { className: c('name'), children: [o.label, " ", chipOf(rep)] }), _jsxs("p", { className: c('meta'), children: ["Shipped ", shortDate(o.date), " \u00B7 ", strains.length <= 3 ? strains.join(', ') : `${strains.slice(0, 3).join(', ')} +${strains.length - 3} more`] }), rep && !rep.sentAt && _jsxs("p", { className: c('meta'), children: [done, " of ", plural(strains.length, 'strain'), " filled in"] })] }), _jsx("span", { className: c('pillbtn'), children: rep?.sentAt ? 'View / edit' : rep?.savedAt ? 'Finish' : 'Report' })] }, o.key);
                                        })] })] })
                            : yStrains.length === 0 ? _jsx("section", { className: c('card'), children: _jsxs("p", { className: c('meta'), style: { padding: 16, margin: 0 }, children: ["Nothing reported yet. Report yields on a shipped order and your results show up here. ", _jsx("button", { className: c('linkish'), style: { minWidth: 0, display: 'inline' }, onClick: () => setYTab('report'), children: "Report yields" })] }) })
                                : _jsxs(_Fragment, { children: [_jsxs("div", { className: c(`kpis ${desk ? 'five' : 'ykpis'}`), children: [_jsxs("div", { className: c('kpi'), children: [_jsx("p", { children: "Fresh frozen run" }), _jsxs("b", { children: [fmt(rows.reduce((a, x) => a + x.lbs, 0)), " lbs"] }), _jsx("small", { children: plural(rows.length, 'strain') })] }), _jsxs("div", { className: c('kpi'), children: [_jsx("p", { children: "Hash yield" }), _jsx("b", { children: pct(tot.hashPct) }), _jsx("small", { children: "of fresh frozen" })] }), _jsxs("div", { className: c('kpi'), children: [_jsx("p", { children: "Rosin yield" }), _jsx("b", { children: pct(tot.rosinOfHash) }), _jsx("small", { children: "of hash" })] }), _jsxs("div", { className: c('kpi'), children: [_jsx("p", { children: "Rosin yield" }), _jsx("b", { children: pct(tot.rosinOfFF) }), _jsx("small", { children: "of fresh frozen" })] }), _jsxs("div", { className: c('kpi'), children: [_jsx("p", { children: "BHO yield" }), _jsx("b", { children: pct(tot.bhoPct) }), _jsx("small", { children: "of fresh frozen" })] })] }), _jsxs("div", { className: c('rmbar act-bar'), children: [_jsxs("div", { className: c('filters'), role: "group", "aria-label": "Filter strains", children: [_jsx("button", { "aria-pressed": menuYear === 'all' && yProc === 'all', onClick: () => { setMenuYear('all'); setYProc('all'); }, children: "All" }), years.length > 1 && years.map(y => _jsx("button", { "aria-pressed": menuYear === y, onClick: () => setMenuYear(menuYear === y ? 'all' : y), children: y }, y)), _jsx("button", { "aria-pressed": yProc === 'SHO', title: "Hash and hash + rosin runs", onClick: () => setYProc(yProc === 'SHO' ? 'all' : 'SHO'), children: "SHO" }), _jsx("button", { "aria-pressed": yProc === 'BHO', title: "BHO runs", onClick: () => setYProc(yProc === 'BHO' ? 'all' : 'BHO'), children: "BHO" })] }), _jsxs("label", { className: c('search'), children: [I.search, _jsx("input", { type: "search", placeholder: "Search strains", value: q, onChange: e => setQ(e.target.value), "aria-label": "Search strains" })] })] }), _jsxs("section", { className: c('card'), children: [desk ? _jsxs(_Fragment, { children: [_jsxs("div", { className: c('yres head'), children: [sh('yres', 's', 'Strain'), sh('yres', 'runs', 'Runs'), sh('yres', 'lbs', 'FF run'), sh('yres', 'hash', _jsxs(_Fragment, { children: ["Hash yield", _jsx("br", {}), "of FF"] })), sh('yres', 'roh', _jsxs(_Fragment, { children: ["Rosin yield", _jsx("br", {}), "of hash"] })), sh('yres', 'rof', _jsxs(_Fragment, { children: ["Rosin yield", _jsx("br", {}), "of FF"] })), sh('yres', 'bho', _jsxs(_Fragment, { children: ["BHO yield", _jsx("br", {}), "of FF"] })), _jsx("span", {})] }), rows.map(x => {
                                                            const key = x.s + '|' + x.y, open = yOpen === key;
                                                            return _jsxs(Fragment, { children: [_jsxs("button", { className: c(`yres ${open ? 'on' : ''}`), onClick: () => setYOpen(open ? null : key), "aria-expanded": open, children: [_jsxs("span", { className: c('rmname'), children: [x.s, " ", yrTag(x.y)] }), _jsx("span", { children: x.runs.length }), _jsxs("span", { children: [fmt(x.lbs), " lbs"] }), _jsx("b", { style: { color: 'var(--teal-ink)' }, children: pct(x.hashPct) }), _jsx("b", { children: pct(x.rosinOfHash) }), _jsx("span", { children: pct(x.rosinOfFF) }), _jsx("b", { style: { color: x.bhoPct != null ? 'var(--gold)' : undefined }, children: pct(x.bhoPct) }), _jsx("span", { className: c('muted'), children: open ? I.up : I.down })] }), open && runList(x)] }, key);
                                                        })] }) : _jsxs(_Fragment, { children: [_jsxs("div", { className: c('ymres head'), children: [_jsx("span", { children: "Strain" }), _jsxs("span", { children: ["Hash", _jsx("small", { children: "% of FF" })] }), _jsxs("span", { children: ["Rosin", _jsx("small", { children: "% of FF" })] }), _jsxs("span", { children: ["BHO", _jsx("small", { children: "% of FF" })] }), _jsx("span", {})] }), rows.map(x => {
                                                            const key = x.s + '|' + x.y, open = yOpen === key;
                                                            return _jsxs("div", { style: { borderTop: '1px solid var(--line-2)' }, children: [_jsxs("button", { className: c('ymres'), onClick: () => setYOpen(open ? null : key), "aria-expanded": open, children: [_jsxs("span", { children: [_jsxs("span", { className: c('name'), children: [x.s, " ", yrTag(x.y)] }), _jsxs("span", { className: c('meta'), children: [plural(x.runs.length, 'run'), " \u00B7 ", fmt(x.lbs), " lbs"] })] }), _jsx("b", { style: { color: 'var(--teal-ink)' }, children: pct(x.hashPct) }), _jsx("b", { children: pct(x.rosinOfFF) }), _jsx("b", { style: { color: x.bhoPct != null ? 'var(--gold)' : undefined }, children: pct(x.bhoPct) }), _jsx("span", { className: c('muted'), children: open ? I.up : I.down })] }), open && runList(x)] }, key);
                                                        })] }), rows.length === 0 && _jsx("p", { className: c('meta'), style: { padding: 16, margin: 0 }, children: "No strains match." })] }), _jsx("p", { className: c('meta'), style: { margin: '0 4px' }, children: "Yields are weighted by lbs run. Hash and BHO yields are \u00F7 fresh frozen; rosin yield is \u00F7 hash (and \u00F7 fresh frozen). Drafts count too." })] })] })] }));
    }
    function YieldScreen() {
        const x = yOrders.find(z => z.o.order.id === yOrder);
        if (!x)
            return _jsxs("div", { className: c('screen'), children: [_jsxs("header", { className: c('hdr'), children: [back('yields', 'Yields'), _jsx("h1", { children: "Report yields" })] }), _jsx("p", { className: c('loading'), children: "Pick an order to report." })] });
        const setL = (i, p) => setYDraft(yDraft.map((l, j) => j === i ? { ...l, ...p } : l));
        const setP = (i, pi, p) => setYDraft(yDraft.map((l, j) => j === i ? { ...l, parts: l.parts.map((q0, k) => k === pi ? { ...q0, ...p } : q0) } : l));
        // numbers with up to 2 decimals: keep what they typed, store the number
        const typed = (key, v) => {
            let t = v.replace(/[^0-9.]/g, '');
            const dot = t.indexOf('.');
            if (dot >= 0)
                t = t.slice(0, dot + 1) + t.slice(dot + 1).replace(/\./g, '').slice(0, 2);
            setYTxt({ ...yTxt, [key]: t });
            return t === '' || t === '.' ? null : Number(t);
        };
        const shown = (key, v) => yTxt[key] ?? (v == null ? '' : String(v));
        const amount = (i, pi, l, p, which) => {
            const v = which === 'out' ? p.outV : p.rosinV, u = which === 'out' ? p.outU : p.rosinU, what = which === 'rosin' ? 'rosin' : p.bho ? 'BHO' : 'hash', key = `${i}-${pi}-${which}`;
            return _jsxs("span", { className: c('yamt'), children: [_jsx("input", { type: "text", inputMode: "decimal", placeholder: "0.00", value: shown(key, v), "aria-label": `${l.s} ${what} amount`, onChange: e => { const n = typed(key, e.target.value); setP(i, pi, which === 'out' ? { outV: n } : { rosinV: n }); } }), _jsx("select", { value: u, "aria-label": `${l.s} ${what} unit`, onChange: e => setP(i, pi, which === 'out' ? { outU: e.target.value } : { rosinU: e.target.value }), children: (which === 'rosin' ? ROSIN_UNITS : UNITS).map(([k, t]) => _jsx("option", { value: k, children: t }, k)) })] });
        };
        const filled = yDraft.filter(l => yDone(l) || l.issue).length;
        const overOf = (l) => Math.round((l.parts.reduce((a, p) => a + (p.ff ?? 0), 0) - l.shipped) * 100) / 100;
        const over = yDraft.filter(l => overOf(l) > 0);
        const sentAt = x.rep?.sentAt ?? null, locked = !!sentAt && !yEdit;
        return (_jsxs("div", { className: c('screen yform'), children: [_jsxs("header", { className: c('hdr'), children: [back('yields', 'Yields'), _jsxs("h1", { children: ["Yields \u00B7 ", x.o.label] }), _jsx("p", { className: c('sub'), children: sentAt ? `Shipped ${shortDate(x.o.date)}. Sent to Lifted ${shortDate(sentAt)}.` : `Shipped ${shortDate(x.o.date)}. Fill in what you have; leave a strain blank if you haven't run it yet.` })] }), _jsxs("main", { className: c('main'), children: [sentAt && (locked
                            ? _jsxs("div", { className: c('note ylock'), children: [_jsxs("span", { children: [I.check, " ", _jsxs("b", { children: ["Sent to Lifted ", shortDate(sentAt), "."] }), " This report is locked. Edit it to change a number, then submit your revisions."] }), _jsx("button", { className: c('btn ghost'), onClick: () => setYEdit(true), children: "Edit report" })] })
                            : _jsxs("div", { className: c('note gold'), children: [_jsx("b", { children: "Editing a sent report." }), " Your changes go to Lifted when you tap Submit revisions."] })), _jsxs("fieldset", { className: c('yfs'), disabled: locked, children: [desk && _jsxs("div", { className: c('yhead'), children: [_jsx("span", { children: "Strain" }), _jsx("span", { children: "Process" }), _jsx("span", { children: "Fresh frozen run" }), _jsx("span", { children: "Hash / BHO" }), _jsx("span", { children: "Rosin" }), _jsx("span", {})] }), yDraft.map((l, i) => {
                                    const used = l.parts.reduce((a, p) => a + (p.ff ?? 0), 0), left = Math.round((l.shipped - used) * 100) / 100;
                                    return _jsxs("section", { className: c(`card ycard ${left < 0 ? 'bad' : yDone(l) ? 'done' : ''}`), children: [_jsxs("div", { className: c('ybody'), children: [_jsxs("div", { className: c('ystrain'), children: [_jsxs("p", { className: c('name'), children: [l.s, " ", yrTag(l.y)] }), _jsxs("p", { className: c('meta'), children: [fmt(l.shipped), " lbs shipped"] }), left < 0 ? _jsxs("p", { className: c('err'), style: { margin: '4px 0 0' }, children: [fmt(-left), " lbs more than shipped. Lower the fresh frozen run", l.parts.length > 1 ? 's' : '', " to ", fmt(l.shipped), " lbs or less."] })
                                                                : l.parts.length > 1 && _jsx("p", { className: c('meta'), children: left === 0 ? 'All lbs accounted for' : `${fmt(left)} lbs not in a part yet` })] }), _jsxs("div", { className: c('yparts'), children: [l.parts.map((p, pi) => {
                                                                const k = yCalc(p);
                                                                return _jsxs("div", { className: c(`ypart ${l.parts.length > 1 ? 'split' : ''}`), children: [!desk && l.parts.length > 1 && _jsxs("p", { className: c('ypartn'), children: ["Part ", pi + 1, p.bho ? ' · BHO' : ' · Hash'] }), _jsxs("div", { className: c('ycell yproc'), role: "group", "aria-label": `What you made from ${l.s}`, children: [_jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: !p.bho, onChange: e => setP(i, pi, { bho: !e.target.checked }) }), " Hash"] }), _jsxs("label", { className: c(p.bho ? 'dim' : ''), children: [_jsx("input", { type: "checkbox", checked: !p.bho && p.rosin, disabled: p.bho, onChange: e => setP(i, pi, { rosin: e.target.checked }) }), " Rosin"] }), _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: p.bho, onChange: e => setP(i, pi, { bho: e.target.checked }) }), " BHO"] })] }), _jsxs("div", { className: c('ycell'), children: [_jsx("span", { className: c('ylbl'), children: "Fresh frozen run" }), _jsxs("span", { className: c('yamt'), children: [_jsx("input", { type: "text", inputMode: "decimal", value: shown(`${i}-${pi}-ff`, p.ff), "aria-label": `${l.s} fresh frozen run, lbs`, onChange: e => setP(i, pi, { ff: typed(`${i}-${pi}-ff`, e.target.value) }) }), _jsx("span", { className: c('yunit'), children: "lbs" })] })] }), _jsxs("div", { className: c('ycell'), children: [_jsx("span", { className: c('ylbl'), children: p.bho ? 'BHO' : 'Hash' }), amount(i, pi, l, p, 'out'), _jsx("span", { className: c('yout'), children: p.bho ? (k.bhoPct != null ? _jsxs(_Fragment, { children: [_jsx("b", { className: c('gold'), children: pct(k.bhoPct) }), " of fresh frozen", p.outU !== 'g' ? ` · ${gFmt(k.bhoG)}` : ''] }) : ' ')
                                                                                        : k.hashPct != null ? _jsxs(_Fragment, { children: [_jsx("b", { children: pct(k.hashPct) }), " of fresh frozen", p.outU !== 'g' ? ` · ${gFmt(k.hashG)}` : ''] }) : ' ' })] }), _jsx("div", { className: c(`ycell ${p.bho || !p.rosin ? 'off' : ''}`), children: p.bho || !p.rosin ? (desk ? _jsx("span", { className: c('meta'), children: p.bho ? '' : 'No rosin' }) : null) : _jsxs(_Fragment, { children: [_jsx("span", { className: c('ylbl'), children: "Rosin" }), amount(i, pi, l, p, 'rosin'), _jsx("span", { className: c('yout'), children: k.rosinOfHash != null || k.rosinOfFF != null ? _jsxs(_Fragment, { children: [k.rosinOfHash != null && _jsxs(_Fragment, { children: [_jsx("b", { children: pct(k.rosinOfHash) }), " of hash"] }), k.rosinOfHash != null && k.rosinOfFF != null ? ' · ' : '', k.rosinOfFF != null && _jsxs(_Fragment, { children: [pct(k.rosinOfFF), " of FF"] })] }) : ' ' })] }) }), _jsx("div", { className: c('ycell yx'), children: !locked && l.parts.length > 1 && _jsx("button", { className: c('iconbtn'), "aria-label": `Remove part ${pi + 1}`, onClick: () => { setL(i, { parts: l.parts.filter((_, z) => z !== pi) }); setYTxt({}); }, children: I.close }) })] }, pi);
                                                            }), !locked && _jsxs("button", { className: c('linkish ysplit'), onClick: () => setL(i, { parts: [...l.parts, { ...newPart(left > 0 ? left : null), bho: !l.parts[l.parts.length - 1].bho }] }), children: ["+ Split this strain", l.parts.length === 1 ? ' (e.g. multiple runs, or some to hash, some to BHO)' : ''] })] })] }), _jsxs("label", { className: c('ynote'), children: [_jsx("span", { className: c('ylbl'), children: "Notes" }), _jsx("input", { type: "text", placeholder: "Anything we should know: terps, color, how it washed\u2026", value: l.note, onChange: e => setL(i, { note: e.target.value }) })] }), l.issue ? _jsxs("div", { className: c('yissue'), children: [_jsxs("span", { children: [_jsx("b", { children: "Issue reported:" }), " ", issueTxt(l.issue)] }), !locked && _jsx("button", { type: "button", className: c('linkish'), onClick: () => setYIssue({ i, kinds: [...l.issue.kinds], text: l.issue.text }), children: "Edit" })] })
                                                : !locked && _jsx("button", { type: "button", className: c('linkish yissue-btn'), onClick: () => setYIssue({ i, kinds: [], text: '' }), children: "Report an issue with this strain" })] }, l.s + l.y);
                                })] })] }), locked ? _jsxs("div", { className: c('dock white'), children: [_jsx("button", { className: c('btn ghost'), style: { flex: 1 }, onClick: () => go('yields'), children: "Back to Yields" }), _jsx("button", { className: c('btn'), style: { flex: 1.4 }, onClick: () => setYEdit(true), children: "Edit report" })] })
                    : _jsxs("div", { className: c('dock white'), children: [sentAt
                                ? _jsx("button", { className: c('btn ghost'), style: { flex: 1 }, disabled: busy, onClick: () => openYield(x.o.order.id), children: "Cancel changes" })
                                : _jsx("button", { className: c('btn ghost'), style: { flex: 1 }, disabled: busy, onClick: () => saveYields(false), children: "Save for later" }), _jsx("button", { className: c('btn'), style: { flex: 1.4 }, disabled: busy || filled === 0 || over.length > 0, title: over.length ? `More lbs than shipped: ${over.map(l => l.s).join(', ')}` : undefined, onClick: () => saveYields(true), children: over.length ? (desk ? `Fix the red line${over.length > 1 ? 's' : ''} (more than shipped)` : 'Fix the red lines') : filled === 0 ? 'Fill in a strain' : sentAt ? 'Submit revisions' : desk ? `Send ${plural(filled, 'strain')} to Lifted` : 'Send to Lifted' })] }), issueSheet()] }));
    }
    function OrdersScreen() {
        const f = filter;
        const list = orows.filter(o => f === 'all' || (f === 'submitted' && o.status === 'submitted') || (f === 'approved' && o.status === 'approved') || (f === 'fulfillment' && o.status === 'fulfillment') || (f === 'shipped' && o.status === 'shipped') || (f === 'unpaid' && o.paid === false) || (f === 'paid' && o.paid === true));
        const fb = (id, label) => _jsx("button", { "aria-pressed": f === id, onClick: () => setFilter(id), children: label }, id);
        const cx = confirmCancel;
        return (_jsxs("div", { className: c('screen'), children: [_jsxs("header", { className: c('hdr'), children: [back('home', 'Home'), _jsx("h1", { children: "Orders & Statement" })] }), _jsxs("main", { className: c('main'), children: [d?.st && _jsxs("button", { className: c('tile row'), style: { gap: 12 }, disabled: stBusy, onClick: async () => { setStBusy(true); try {
                                await downloadStatement(d.st, false);
                            }
                            catch (e) {
                                toast(String(e.message ?? e));
                            }
                            finally {
                                setStBusy(false);
                            } }, children: [_jsx("span", { style: { color: 'var(--teal-dk)' }, children: I.doc }), _jsxs("div", { className: c('grow'), children: [_jsx("p", { className: c('name'), style: { fontSize: 16 }, children: "Current statement" }), _jsxs("p", { className: c('meta'), children: [money2(d.st.balance.amount), " balance \u00B7 ", plural(openInvoices.length, 'open invoice')] })] }), _jsx("span", { className: c('pillbtn'), style: { background: 'none', padding: 0 }, children: stBusy ? 'Making…' : 'PDF' })] }), _jsxs("div", { className: c('filters'), role: "group", "aria-label": "Filter orders", children: [fb('all', 'All'), fb('submitted', 'Submitted'), fb('approved', 'Approved'), fb('fulfillment', 'In fulfillment'), fb('shipped', 'Shipped'), fb('unpaid', 'Unpaid'), fb('paid', 'Paid')] }), _jsx("section", { className: c('card'), children: list.length ? list.map(o => {
                                const lbs = o.lines.reduce((a, l) => a + (l.lbs ?? 0), 0), isOpen = openRow === o.key;
                                const tags = o.status === 'submitted' ? _jsx("span", { className: c('chip c-sub'), children: "Submitted" }) : o.status === 'approved' ? _jsx("span", { className: c('chip c-ok'), children: "Approved" }) : o.status === 'fulfillment' ? _jsx("span", { className: c('chip c-ful'), children: "In fulfillment" })
                                    : _jsxs(_Fragment, { children: [_jsx("span", { className: c('chip c-ship'), children: "Shipped" }), o.paid != null && _jsxs(_Fragment, { children: [" ", _jsx("span", { className: c(`chip ${o.paid ? 'c-paid' : 'c-unpaid'}`), children: o.paid ? 'Paid' : 'Unpaid' })] })] });
                                const sub = o.status !== 'shipped'
                                    ? _jsxs(_Fragment, { children: ["Placed ", shortDate(o.date), o.wanted ? _jsxs(_Fragment, { children: [" \u00B7 ", _jsxs("b", { style: { color: 'var(--ink)', fontWeight: 600 }, children: ["Requested delivery ", niceDate(o.wanted)] })] }) : ' · no date requested'] })
                                    : _jsxs(_Fragment, { children: ["Shipped ", shortDate(o.date), o.paid === false && o.due ? ` · due ${shortDate(o.due)}` : ''] });
                                return _jsxs("div", { style: { borderBottom: '1px solid var(--line-2)', background: isOpen ? '#fbfcfb' : undefined }, children: [_jsxs("button", { className: c('li btnrow'), onClick: () => setOpenRow(isOpen ? null : o.key), "aria-expanded": isOpen, children: [_jsxs("div", { className: c('grow'), children: [_jsxs("p", { className: c('name'), children: [o.label, " ", tags] }), _jsx("p", { className: c('meta'), children: sub }), o.holdLbs > 0 && o.status !== 'shipped' && _jsxs("p", { className: c('meta'), style: { color: 'var(--gold)', fontWeight: 600 }, children: ["Sample \u00B7 ", fmt(o.holdLbs), " lbs to hold"] })] }), _jsxs("div", { className: c('r'), children: [_jsx("b", { className: c('num'), style: o.paid ? { color: 'var(--muted)' } : undefined, children: o.amount != null ? money(o.amount) : '' }), lbs > 0 && _jsxs("p", { className: c('meta'), children: [fmt(lbs), " lbs"] })] }), isOpen ? I.up : I.down] }), isOpen && _jsxs("div", { style: { padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, color: 'var(--muted)' }, children: [o.lines.map((l, i) => _jsxs("div", { className: c('row'), children: [_jsxs("span", { className: c('grow'), children: [l.s, " ", l.y != null && yrTag(l.y)] }), l.lbs != null ? _jsxs(_Fragment, { children: [_jsxs("span", { className: c('num'), style: { width: 64, textAlign: 'right' }, children: [fmt(l.lbs), " lbs"] }), _jsx("span", { className: c('num'), style: { width: 72, textAlign: 'right' }, children: l.price != null ? priceFmt(l.price) : '' })] })
                                                            : _jsx("span", { className: c('num'), style: { width: 136, textAlign: 'right' }, children: l.amount != null ? (l.amount < 0 ? '−' : '') + money2(Math.abs(l.amount)) : '' })] }, i)), o.lines.length === 0 && o.status === 'shipped' && _jsx("p", { className: c('meta'), children: "Open the invoice for the details." }), o.status === 'shipped' && o.paid === false && o.inv && Number(o.inv.balance) < Number(o.inv.total) && _jsxs("p", { className: c('meta'), children: [money(Number(o.inv.total) - Number(o.inv.balance)), " of ", money(Number(o.inv.total)), " paid \u00B7 ", money(Number(o.inv.balance)), " open"] }), (o.po || (o.status === 'shipped' && o.so && o.so !== o.label)) && _jsx("p", { className: c('meta'), children: [o.status === 'shipped' && o.so && o.so !== o.label ? `Order ${o.so}` : '', o.po ? `PO ${o.po}` : ''].filter(Boolean).join(' · ') }), o.status === 'approved' && _jsx("p", { className: c('meta'), children: "Lifted approved this order. Changing it sends it back to Lifted to approve again." }), (o.status === 'submitted' || o.status === 'approved') && o.order ? _jsxs("div", { className: c('row'), style: { gap: 8, flexWrap: 'wrap' }, children: [_jsx("button", { className: c('btn ghost'), style: { height: 44, fontSize: 15, color: 'var(--teal-dk)', borderColor: 'var(--teal-dk)', flex: 1 }, onClick: () => modify(o.order), children: "Modify order" }), _jsx("button", { className: c('btn ghost'), style: { height: 44, fontSize: 15, color: 'var(--red)', flex: 1 }, onClick: () => setConfirmCancel(o), children: "Cancel order" })] })
                                                    : o.status === 'fulfillment' ? _jsx("div", { className: c('note'), style: { background: 'var(--ful-bg)', color: 'var(--ful)', fontSize: 13, padding: '10px 12px' }, children: "Lifted is packing this order, so it can't be changed or cancelled here. Contact your Lifted rep to make changes." })
                                                        : o.status === 'shipped' ? _jsxs("div", { className: c('row'), style: { gap: 8, flexWrap: 'wrap' }, children: [o.inv ? _jsxs("button", { className: c('btn ghost'), style: { height: 44, fontSize: 15, color: 'var(--teal-dk)', borderColor: 'var(--teal-dk)', gap: 8, flex: 1 }, onClick: () => viewInvoice(o), children: [I.doc, "View invoice (PDF)"] })
                                                                    : _jsxs("button", { className: c('btn ghost'), style: { height: 44, fontSize: 15, gap: 8, flex: 1 }, disabled: true, title: "The invoice shows here as soon as Lifted sends it (usually the day it ships)", children: [I.doc, "Invoice not ready yet"] }), d?.yields && o.order && _jsx("button", { className: c('btn ghost'), style: { height: 44, fontSize: 15, color: 'var(--teal-dk)', borderColor: 'var(--teal-dk)', flex: 1 }, onClick: () => openYield(o.order.id), children: d.yields.find(r => r.orderId === o.order.id)?.sentAt ? 'View / edit yields' : 'Report yields' })] }) : null] })] }, o.key);
                            }) : _jsx("p", { className: c('meta'), style: { padding: 16 }, children: "Nothing here." }) })] }), cx && _jsxs(_Fragment, { children: [_jsx("div", { className: c('scrim'), onClick: () => setConfirmCancel(null) }), _jsxs("div", { className: c('sheet'), role: "alertdialog", "aria-modal": "true", "aria-labelledby": "cp-cx-t", children: [_jsxs("h2", { id: "cp-cx-t", style: { margin: 0, fontSize: 22 }, children: ["Cancel ", cx.label, "?"] }), _jsxs("p", { className: c('meta'), style: { fontSize: 15, margin: 0 }, children: [fmt(cx.lines.reduce((a, l) => a + (l.lbs ?? 0), 0)), " lbs", cx.amount != null ? ` · ${money(cx.amount)}` : '', ", placed ", shortDate(cx.date), cx.wanted ? `, requested delivery ${niceDate(cx.wanted)}` : '', ". Any reserve lbs on this order go back to your reserve. This can't be undone."] }), _jsx("div", { className: c('card'), style: { background: '#f7f9f6' }, children: cx.lines.map((l, i) => _jsxs("div", { className: c('li'), children: [_jsxs("span", { className: c('grow'), children: [l.s, " ", l.y != null && yrTag(l.y)] }), _jsxs("b", { className: c('num'), children: [fmt(l.lbs), " lbs"] })] }, i)) }), _jsx("button", { className: c('btn full'), style: { background: 'var(--red)' }, disabled: busy, onClick: async () => {
                                        const ok = await run(() => backend.cancelMyOrder(cx.order.id).then(() => true));
                                        setConfirmCancel(null);
                                        if (ok) {
                                            toast(`${cx.label} cancelled`);
                                            reload();
                                        }
                                    }, children: "Yes, cancel order" }), _jsx("button", { className: c('btn ghost full'), onClick: () => setConfirmCancel(null), children: "Keep order" })] })] })] }));
    }
    function HoldsScreen() {
        const rank = (h) => h.state === 'active' ? (holdReq(h) ? 1 : 0) : 2;
        const hs = liveHolds.slice().sort((a, b) => rank(a) - rank(b) || daysUntil(a.until) - daysUntil(b.until));
        const act = hs.filter(h => h.state === 'active' && !holdReq(h));
        const picked = act.filter(h => holdSel.includes(h.line_id)), lbs = picked.reduce((a, h) => a + (holdQty[h.line_id] ?? f10(holdLbs(h))), 0), bad = picked.some(h => !!holdErr(h));
        const pick = (h) => {
            if (holdSel.includes(h.line_id))
                setHoldSel(holdSel.filter(x => x !== h.line_id));
            else {
                setHoldSel([...holdSel, h.line_id]);
                setHoldQty(q0 => ({ ...q0, [h.line_id]: q0[h.line_id] ?? f10(holdLbs(h)) }));
            }
        };
        const card = (h) => {
            const k = kOf(h.strain, h.crop_year), sample = sampleOf(h), so = h.so_number ?? `order #${h.order_id}`, rq = holdReq(h);
            if (h.state !== 'active')
                return _jsxs("div", { className: c('box'), children: [_jsxs("div", { className: c('row'), children: [_jsxs("div", { className: c('grow'), children: [_jsxs("p", { className: c('name'), children: [h.strain, " ", yrTag(h.crop_year)] }), _jsx("p", { className: c('meta'), children: sample ? `${fmt(sample)} lb sample on ${so}` : `Sample on ${so}` })] }), _jsx("span", { className: c('chip c-sub'), children: "Waiting" })] }), _jsxs("p", { className: c('meta'), style: { margin: 0 }, children: ["We'll hold ", _jsxs("b", { style: { color: 'var(--ink)' }, children: [fmt(holdLbs(h)), " lbs"] }), " for ", d?.holdDays ?? 10, " days after this order ships", h.state === 'submitted' ? ', once Lifted confirms it' : '', "."] }), _jsx("div", { className: c('row'), children: _jsx("button", { className: c('btn ghost'), style: { flex: 1, height: 44, fontSize: 15, color: 'var(--red)' }, onClick: () => setReleasing(h), children: "Release" }) })] }, h.line_id);
            if (rq)
                return _jsxs("div", { className: c('box'), children: [_jsxs("div", { className: c('row'), children: [_jsxs("div", { className: c('grow'), children: [_jsxs("p", { className: c('name'), children: [h.strain, " ", yrTag(h.crop_year)] }), _jsxs("p", { className: c('meta'), children: [fmt(holdLbs(h)), " lbs held \u00B7 until ", shortDate(h.until)] })] }), _jsx("span", { className: c('chip c-wait'), children: "Reserve requested" })] }), _jsxs("p", { className: c('meta'), style: { margin: 0 }, children: ["You asked to reserve ", _jsxs("b", { style: { color: 'var(--ink)' }, children: [fmt(rq.requested_lbs), " lbs"] }), " in total. We keep holding these lbs while Lifted reviews it."] })] }, h.line_id);
            const on = holdSel.includes(h.line_id), v = holdQty[h.line_id] ?? f10(holdLbs(h)), open = menuRow(k)?.open ?? 0, max = f10(holdLbs(h)) + open, e = on ? holdErr(h) : '', dl = daysUntil(h.until);
            return _jsxs("div", { className: c(`box ${on ? 'on' : ''}`), children: [_jsxs("div", { className: c('row'), style: { alignItems: 'flex-start' }, children: [contract && _jsx("label", { className: c('hchk'), children: _jsx("input", { type: "checkbox", checked: on, onChange: () => pick(h), "aria-label": `Add ${h.strain} to reserves` }) }), _jsxs("div", { className: c('grow'), children: [_jsxs("p", { className: c('name'), style: { fontSize: 16 }, children: [h.strain, " ", yrTag(h.crop_year)] }), _jsx("p", { className: c('meta'), children: sample ? `From your ${fmt(sample)} lb sample on ${so}` : `From your sample on ${so}` })] }), _jsxs("div", { className: c('r'), children: [_jsxs("b", { className: c('num'), style: { fontSize: 18 }, children: [fmt(holdLbs(h)), " lbs"] }), _jsxs("p", { className: c('meta'), style: { color: dl <= 3 ? 'var(--red)' : 'var(--gold)', fontWeight: 600 }, children: [plural(dl, 'day'), " left"] })] })] }), _jsxs("p", { className: c('meta'), style: { margin: 0 }, children: ["Held until ", _jsx("b", { style: { color: 'var(--ink)' }, children: shortDate(h.until) }), ". After that the lbs go back on the menu."] }), on && _jsxs("div", { style: { background: '#f7f9f6', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }, children: [_jsxs("div", { className: c('row'), style: { flexWrap: 'wrap' }, children: [_jsxs("span", { className: c('grow'), style: { fontSize: 14, fontWeight: 600 }, children: ["Lbs to reserve", _jsxs("span", { className: c('meta'), style: { display: 'block', fontWeight: 400 }, children: ["Up to ", fmt(max), ": ", fmt(holdLbs(h)), " held + ", fmt(open), " available"] })] }), _jsx(Stepper, { val: v, on: true, bad: !!e, label: h.strain, onChange: n => setHoldQty({ ...holdQty, [h.line_id]: n }) })] }), e ? _jsx(StepErr, { msg: e }) : v !== f10(holdLbs(h)) ? _jsx("p", { className: c('meta'), style: { margin: 0, color: 'var(--teal-ink)', fontWeight: 500 }, children: v > holdLbs(h) ? `${fmt(v - holdLbs(h))} lbs more than your hold` : `${fmt(holdLbs(h) - v)} lbs go back on the menu` }) : null] }), _jsxs("div", { className: c('row'), style: { gap: 8 }, children: [contract ? _jsx("button", { className: c(`btn ${on ? 'ghost' : ''}`), style: { flex: 1.4, height: 44, fontSize: 15 }, onClick: () => pick(h), children: on ? '✓ Added · Undo' : 'Add to Reserves' })
                                : _jsx("button", { className: c('btn'), style: { flex: 1.4, height: 44, fontSize: 15 }, onClick: () => newOrder({ [k]: f10(holdLbs(h)) }), children: "Order it" }), _jsx("button", { className: c('btn ghost'), style: { flex: 1, height: 44, fontSize: 15, color: 'var(--red)' }, onClick: () => setReleasing(h), children: "Release" })] })] }, h.line_id);
        };
        const rel = releasing;
        return (_jsxs("div", { className: c('screen'), children: [_jsxs("header", { className: c('hdr'), children: [back('home', 'Home'), _jsx("h1", { children: "Sample Holds for You" }), _jsxs("p", { className: c('sub'), children: ["After you try a sample, we hold the lbs you asked for. ", contract ? 'Pick the ones to add to your reserves, or release them.' : 'Order them, or release them.'] })] }), _jsxs("main", { className: c('main'), children: [contract && act.length > 1 && _jsxs("div", { className: c('row'), style: { justifyContent: 'space-between', margin: '0 4px' }, children: [_jsxs("span", { className: c('meta'), style: { margin: 0 }, children: [act.length, " active holds"] }), _jsx("button", { className: c('linkish'), style: { minWidth: 0 }, onClick: () => { if (picked.length === act.length)
                                        setHoldSel([]);
                                    else {
                                        setHoldSel(act.map(h => h.line_id));
                                        setHoldQty(q0 => { const n = { ...q0 }; for (const h of act)
                                            n[h.line_id] = n[h.line_id] ?? f10(holdLbs(h)); return n; });
                                    } }, children: picked.length === act.length ? 'Clear selection' : 'Select all' })] }), hs.length ? hs.map(card) : _jsxs("div", { className: c('card'), style: { padding: 18 }, children: [_jsx("p", { className: c('name'), children: "Nothing on hold" }), _jsx("p", { className: c('meta'), children: "When you order a sample and ask us to hold more, it shows up here." })] })] }), picked.length > 0 && _jsxs("div", { className: c('dock white'), children: [_jsxs("div", { className: c('grow'), children: [_jsxs("p", { style: { margin: 0, fontSize: 16, fontWeight: 700 }, children: [plural(picked.length, 'strain'), " \u00B7 ", fmt(lbs), " lbs"] }), _jsx("p", { className: c('meta'), style: { margin: 0 }, children: "One reserve request for Lifted to review" })] }), _jsx("button", { className: c('btn'), disabled: bad || busy, onClick: holdSendAll, children: bad ? 'Fix red lines' : busy ? 'Sending…' : 'Send request' })] }), rel && _jsxs(_Fragment, { children: [_jsx("div", { className: c('scrim'), onClick: () => setReleasing(null) }), _jsxs("div", { className: c('sheet'), role: "alertdialog", "aria-modal": "true", "aria-labelledby": "cp-rl-t", children: [_jsxs("h2", { id: "cp-rl-t", style: { margin: 0, fontSize: 22 }, children: ["Release ", fmt(holdLbs(rel)), " lbs of ", rel.strain, "?"] }), _jsx("p", { className: c('meta'), style: { fontSize: 15, margin: 0 }, children: "We'll stop holding these lbs and put them back on the menu for everyone. This can't be undone." }), _jsx("button", { className: c('btn full'), style: { background: 'var(--red)' }, disabled: busy, onClick: () => doRelease(rel), children: "Yes, release" }), _jsx("button", { className: c('btn ghost full'), onClick: () => setReleasing(null), children: "Keep holding" })] })] })] }));
    }
    function account() {
        if (!acct)
            return null;
        return _jsxs(_Fragment, { children: [_jsx("div", { className: c('scrim'), onClick: () => setAcct(false) }), _jsxs("div", { className: c('sheet'), role: "dialog", "aria-modal": "true", "aria-labelledby": "cp-acct-t", children: [_jsxs("div", { className: c('row'), style: { justifyContent: 'space-between' }, children: [_jsx("h2", { id: "cp-acct-t", style: { margin: 0, fontSize: 20 }, children: "Account" }), _jsx("button", { className: c('iconbtn'), style: { color: 'var(--ink)', borderColor: 'var(--line)' }, onClick: () => setAcct(false), "aria-label": "Close", children: I.close })] }), _jsxs("p", { className: c('meta'), style: { margin: 0, fontSize: 15 }, children: [me.customer_name, _jsx("br", {}), "Signed in as ", me.display_name ? `${me.display_name} (${me.email})` : me.email] }), me.viewing_as ? _jsx("p", { className: c('meta'), children: "You're viewing the portal as this customer." }) : _jsxs(_Fragment, { children: [_jsxs("form", { className: c('pw'), onSubmit: async (e) => { e.preventDefault(); const ok = await run(() => backend.changePassword(pw).then(() => true)); if (ok) {
                                        setPw('');
                                        setPw2('');
                                        setAcct(false);
                                        toast('Password changed');
                                    } }, children: [_jsx("b", { children: "Change password" }), _jsx("input", { type: "password", autoComplete: "new-password", placeholder: "New password (8+ characters)", value: pw, onChange: e => setPw(e.target.value) }), _jsx("input", { type: "password", autoComplete: "new-password", placeholder: "New password again", value: pw2, onChange: e => setPw2(e.target.value) }), pw2.length > 0 && pw !== pw2 && _jsx("p", { className: c('err'), style: { margin: 0 }, children: "Passwords don't match" }), _jsx("button", { className: c('btn'), disabled: busy || pw.length < 8 || pw !== pw2, children: "Change password" })] }), !desk && _jsxs("button", { className: c('btn ghost full helpbtn'), onClick: openHelp, children: [I.chat, " Help & feedback"] }), _jsx("button", { className: c('btn ghost full'), onClick: signOut, children: "Sign out" })] })] })] });
    }
    // the order form screens need a loaded menu; send people home if a reload drops them somewhere odd
    useEffect(() => { if (d && !contract && (screen === 'activity' || screen === 'reserves' || screen === 'edit' || screen === 'reqReview' || screen === 'sent' || screen === 'contract'))
        setScreen('home'); }, [d, contract, screen]);
    useEffect(() => { if (focusK) {
        const t = setTimeout(() => setFocusK(null), 500);
        return () => clearTimeout(t);
    } }, [focusK]);
    const SCREENS = {
        activity: ActivityScreen, resmenu: ResMenuScreen, home: Home, contract: ContractScreen, reserves: ReservesScreen, edit: EditScreen, reqReview: ReqReviewScreen, sent: SentScreen, menu: MenuScreen,
        order: OrderScreen, review: ReviewScreen, ordered: OrderedScreen, orders: OrdersScreen, holds: HoldsScreen, yields: YieldsScreen, yield: YieldScreen, ysent: YieldSentScreen,
    };
    return (_jsxs("div", { className: ['cp', typing ? 'cp-typing' : '', desk ? 'cp-desk' : ''].filter(Boolean).join(' '), children: [desk && d && sidebar(), _jsx("div", { className: c('col'), children: !d ? _jsxs("div", { className: c('screen'), children: [_jsxs("header", { className: c('hdr home-hdr'), children: [_jsx("div", { className: c('top'), children: _jsx("a", { className: c('logolink'), href: "https://www.liftedfarms.com", target: "_blank", rel: "noopener noreferrer", "aria-label": "Lifted website (opens in a new tab)", children: _jsx("img", { className: c('logo'), src: "/logo-dark.svg", alt: "Lifted" }) }) }), _jsx("p", { className: c('cust'), children: me.customer_name })] }), _jsx("p", { className: c('loading'), children: loadErr ? _jsxs(_Fragment, { children: ["Couldn't load your account: ", loadErr, " ", _jsx("button", { className: c('linkish'), onClick: reload, children: "Try again" })] }) : 'Loading…' })] })
                    : desk && screen === 'home' ? DeskHome() : desk && screen === 'order' ? DeskOrderScreen() : SCREENS[screen]() }), account(), feedbackSheet(), toastMsg && _jsx("div", { className: c('toast'), role: "status", "aria-live": "polite", children: toastMsg })] }));
}
