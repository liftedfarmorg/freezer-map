import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import './openmenu.css';
const GROUP = { ff: 'Fresh Frozen', df: 'Dry Flower' };
const PROD = { FF: 'Fresh Frozen', ST: 'Standards', SM: 'Smalls' };
const SALES = 'sales@lifted-organics.com';
const fmt = (n) => Math.round(n).toLocaleString('en-US');
// 196: type short codes (S, S/H, H, I/H, I); grade + type are columns on wide screens, one small pill on phones
const TSHORT = { Sativa: 'S', 'Sativa Hybrid': 'S/H', Hybrid: 'H', 'Indica Hybrid': 'I/H', Indica: 'I' };
const TORDER = { S: 1, 'S/H': 2, H: 3, 'I/H': 4, I: 5 };
const tShort = (r) => (r.strain_type && TSHORT[r.strain_type]) || null;
const pct = (v) => (v == null ? '–' : `${Number(v).toFixed(1)}%`);
// 325: low–high when both are set and differ, else the one number
const isRange = (lo, hi) => lo != null && hi != null && Number(hi) !== Number(lo);
const yld = (lo, hi) => isRange(lo, hi) ? `${Number(lo).toFixed(1)}–${Number(hi).toFixed(1)}%` : pct(lo ?? hi ?? null);
export function MenuBoard({ rows, variant }) {
    const [group, setGroup] = useState('ff');
    const [year, setYear] = useState('all');
    const [q, setQ] = useState('');
    const [sort, setSort] = useState({ col: 's', dir: 1 });
    const [open, setOpen] = useState(null);
    const inGroup = rows.filter(r => (group === 'ff' ? r.product === 'FF' : r.product !== 'FF') && r.open_lbs > 0);
    const years = useMemo(() => [...new Set(inGroup.map(r => r.crop_year))].sort((a, b) => b - a), [rows, group]);
    const ql = q.trim().toLowerCase();
    const list = inGroup.filter(r => (year === 'all' || r.crop_year === year) && (!ql || r.strain.toLowerCase().includes(ql)));
    const byName = (a, b) => a.strain.localeCompare(b.strain) || b.crop_year - a.crop_year || a.product.localeCompare(b.product);
    const val = (r) => sort.col === 'y' ? r.crop_year : sort.col === 'open' ? r.open_lbs : sort.col === 'price' ? (r.price ?? 1e9) : sort.col === 'g' ? { SHO: 1, BHO: 2 }[r.grade ?? ''] ?? 9 : sort.col === 't' ? TORDER[tShort(r) ?? ''] ?? 9 : sort.col === 'sho' ? Number(r.sho ?? r.sho_high ?? -1) : sort.col === 'bho' ? Number(r.bho ?? r.bho_high ?? -1) : 0;
    const sorted = [...list].sort((a, b) => sort.col === 's' ? sort.dir * byName(a, b) : sort.col === 'p' ? sort.dir * a.product.localeCompare(b.product) || byName(a, b) : sort.dir * (val(a) - val(b)) || byName(a, b));
    const total = list.reduce((t, r) => t + r.open_lbs, 0);
    const allTotal = inGroup.reduce((t, r) => t + r.open_lbs, 0);
    const strains = new Set(inGroup.map(r => r.strain.toLowerCase())).size;
    const sh = (col, label) => {
        const on = sort.col === col;
        return _jsxs("button", { type: "button", className: `om-sort ${on ? 'on' : ''}`, "aria-sort": on ? (sort.dir > 0 ? 'ascending' : 'descending') : undefined, onClick: () => setSort({ col, dir: on ? -sort.dir : col === 's' || col === 'p' ? 1 : -1 }), children: [label, _jsx("i", { "aria-hidden": "true", children: on ? (sort.dir > 0 ? '▲' : '▼') : '↕' })] });
    };
    const dry = group === 'df';
    // YLD-11/13: SHO / BHO yield columns on fresh frozen: always on the staff Open menu; on the public link only once a strain has a yield
    const hasY = (r) => r.sho != null || r.sho_high != null || r.bho != null || r.bho_high != null;
    const showY = !dry && (variant === 'staff' || inGroup.some(hasY)), yl = showY ? ' yl' : '';
    const price = (r) => r.price != null ? `$${Number(r.price).toLocaleString('en-US', { maximumFractionDigits: 2 })}` : _jsx("a", { className: "om-call", href: `mailto:${SALES}`, onClick: e => e.stopPropagation(), children: "Call/Email" });
    return _jsxs("div", { className: `om om-${variant}`, children: [_jsxs("div", { className: "om-kpis", children: [_jsxs("div", { className: "om-kpi", children: [_jsxs("p", { children: [GROUP[group], " available"] }), _jsxs("b", { children: [fmt(allTotal), " lbs"] })] }), _jsxs("div", { className: "om-kpi", children: [_jsx("p", { children: "Strains" }), _jsx("b", { children: strains })] })] }), _jsxs("section", { className: "om-card", children: [_jsx("div", { className: "om-bar om-tabs", children: Object.keys(GROUP).map(g => _jsx("button", { "aria-pressed": group === g, onClick: () => { setGroup(g); setYear('all'); }, children: GROUP[g] }, g)) }), _jsxs("div", { className: "om-bar", children: [_jsxs("div", { className: "om-pills", children: [_jsx("button", { "aria-pressed": year === 'all', onClick: () => setYear('all'), children: "All" }), years.length > 1 && years.map(y => _jsx("button", { "aria-pressed": year === y, onClick: () => setYear(year === y ? 'all' : y), children: y }, y))] }), _jsx("input", { className: "om-search", type: "search", placeholder: "Search strains", value: q, onChange: e => setQ(e.target.value), "aria-label": "Search strains" })] }), _jsxs("div", { className: "om-scroll", children: [_jsxs("div", { className: `om-row om-head ${dry ? 'dry' : ''}${yl}`, children: [sh('s', 'Strain'), !dry && _jsx("span", { className: "om-tc", children: sh('g', 'Grade') }), _jsx("span", { className: "om-tc", children: sh('t', 'Type') }), showY && _jsxs(_Fragment, { children: [_jsx("span", { className: "om-tc", children: sh('sho', 'SHO yield') }), _jsx("span", { className: "om-tc", children: sh('bho', 'BHO yield') })] }), dry && sh('p', 'Product'), sh('y', 'Crop year'), sh('open', 'Available (lbs)'), sh('price', 'Price / lb')] }), !sorted.length && _jsx("p", { className: "om-empty", children: inGroup.length ? 'No strains match.' : `No ${GROUP[group].toLowerCase()} on the menu right now.` }), sorted.map(r => _jsxs("div", { className: `om-row ${dry ? 'dry' : ''}${yl}`, children: [_jsxs("span", { children: [_jsx("button", { className: "om-name", onClick: () => setOpen(r), children: r.strain }), (() => { const t = tShort(r), g = dry ? null : r.grade; return g || t ? _jsx("span", { className: "om-tagpill", children: [g, t].filter(Boolean).join(' · ') }) : null; })(), showY && hasY(r) && _jsx("span", { className: "om-ymob", children: [r.sho != null || r.sho_high != null ? `SHO ${yld(r.sho, r.sho_high)}` : '', r.bho != null || r.bho_high != null ? `BHO ${yld(r.bho, r.bho_high)}` : ''].filter(Boolean).join(' · ') })] }), !dry && _jsx("span", { className: "om-tc", children: r.grade ? _jsx("span", { className: `om-gtag g-${r.grade.toLowerCase()}`, children: r.grade }) : null }), _jsx("span", { className: "om-tc", children: tShort(r) ? _jsx("span", { className: "om-ttag", title: r.strain_type ?? '', children: tShort(r) }) : null }), showY && _jsxs(_Fragment, { children: [_jsx("span", { className: "om-tc om-dim", children: yld(r.sho, r.sho_high) }), _jsx("span", { className: "om-tc om-dim", children: yld(r.bho, r.bho_high) })] }), dry && _jsx("span", { className: "om-dim", children: PROD[r.product] }), _jsx("span", { className: "om-dim", children: r.crop_year }), _jsx("b", { children: fmt(r.open_lbs) }), _jsx("span", { className: "om-price", children: price(r) })] }, `${r.product}|${r.strain}|${r.crop_year}`)), sorted.length > 0 && _jsxs("div", { className: `om-row om-total ${dry ? 'dry' : ''}${yl}`, children: [_jsxs("b", { children: ["Total \u00B7 ", sorted.length, " line", sorted.length === 1 ? '' : 's'] }), !dry && _jsx("span", { className: "om-tc" }), _jsx("span", { className: "om-tc" }), showY && _jsxs(_Fragment, { children: [_jsx("span", { className: "om-tc" }), _jsx("span", { className: "om-tc" })] }), dry && _jsx("span", {}), _jsx("span", {}), _jsx("b", { className: "om-green", children: fmt(total) }), _jsx("span", {})] })] })] }), _jsxs("p", { className: "om-note", children: ["Available = lbs on hand that aren't reserved or already on a confirmed order. Numbers change as orders and reserves are confirmed.", group === 'ff' ? ' Fresh frozen is sold in 10 lb boxes.' : '', " Prices are per lb and can change."] }), open && _jsx(StrainPop, { line: open, onClose: () => setOpen(null) })] });
}
// 327 (YLD-15): the customers' reported lowest–highest under each yield, from the first sent report
const rep = (lo, hi, n) => Number(n ?? 0) > 0 && (lo != null || hi != null) ? _jsxs("span", { className: "om-rep", children: ["Customer reports: ", yld(lo ?? null, hi), " \u00B7 ", n, " run", Number(n) === 1 ? '' : 's'] }) : null;
function StrainPop({ line, onClose }) {
    useEffect(() => { const k = (e) => { if (e.key === 'Escape')
        onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
    const ty = line.strain_type ?? null;
    return _jsx("div", { className: "om-ov", onClick: onClose, role: "dialog", "aria-modal": "true", "aria-label": line.strain, children: _jsxs("div", { className: "om-sheet", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "om-ph", children: [line.photo_url ? _jsx("img", { src: line.photo_url, alt: line.strain }) : _jsx("div", { className: "om-nophoto", children: "Photo coming soon" }), _jsx("button", { className: "om-x", "aria-label": "Close", onClick: onClose, children: "\u00D7" })] }), _jsxs("div", { className: "om-sb", children: [_jsxs("p", { className: "om-kind", children: [PROD[line.product], " \u00B7 ", line.crop_year, " crop"] }), _jsx("h2", { children: line.strain }), _jsxs("p", { className: "om-lin", children: [ty && _jsx("span", { className: `om-type t-${ty.split(' ')[0].toLowerCase()}`, children: ty }), line.lineage ?? 'Lineage coming soon'] }), line.product === 'FF'
                            ? _jsxs("div", { className: "om-yl", children: [_jsxs("div", { children: [_jsx("p", { children: "SHO \u00B7 solventless" }), _jsx("b", { children: yld(line.sho, line.sho_high) }), _jsx("small", { children: isRange(line.sho, line.sho_high) ? 'yield range' : 'avg yield' }), rep(line.rep_sho_lo, line.rep_sho_hi, line.rep_sho_runs)] }), _jsxs("div", { children: [_jsx("p", { children: "BHO \u00B7 hydrocarbon" }), _jsx("b", { children: yld(line.bho, line.bho_high) }), _jsx("small", { children: isRange(line.bho, line.bho_high) ? 'yield range' : 'avg yield' }), rep(line.rep_bho_lo, line.rep_bho_hi, line.rep_bho_runs)] })] })
                            : _jsx("div", { className: "om-yl one", children: _jsxs("div", { children: [_jsx("p", { children: "THC" }), _jsx("b", { children: pct(line.thc) }), _jsx("small", { children: "latest lab test" })] }) }), line.note && _jsx("p", { className: "om-snote", children: line.note }), _jsxs("p", { className: "om-lin", children: [line.product === 'FF' ? (Number(line.rep_sho_runs ?? 0) + Number(line.rep_bho_runs ?? 0) > 0 ? 'Yields combine our washes and customer reports. Your results can vary. '
                                    : isRange(line.sho, line.sho_high) || isRange(line.bho, line.bho_high) ? 'Yields are from our washes. Your results can vary. ' : 'Yields are averages from our washes. Your results can vary. ') : '', "Questions: ", _jsx("a", { className: "om-call", href: `mailto:${SALES}`, children: SALES })] })] })] }) });
}
/** Sales > Open menu */
export function StaffOpenMenu({ sb, flash, isAdmin, tools }) {
    const [rows, setRows] = useState(null);
    const [err, setErr] = useState(null);
    const load = () => {
        if (!sb) {
            setRows([]);
            return;
        }
        sb.rpc('staff_menu').then(({ data, error }) => { if (error)
            setErr(/does not exist|schema cache/i.test(error.message) ? 'Run 174_open_menu.sql in Supabase first' : error.message);
        else
            setRows((data ?? [])); });
    };
    useEffect(load, []);
    async function copyText() {
        const r = rows ?? [], keys = [...new Set(r.map(x => `${x.crop_year}|${x.product}`))].sort((a, b) => b.localeCompare(a));
        const text = keys.map(k => {
            const [y, p] = k.split('|');
            return `${y} crop, ${PROD[p].toLowerCase()} (lbs open)\n` + r.filter(x => String(x.crop_year) === y && x.product === p).map(x => `${x.strain}: ${fmt(x.open_lbs)}${x.price != null ? ` @ $${x.price}/lb` : ''}`).join('\n');
        }).join('\n\n');
        try {
            await navigator.clipboard.writeText(text);
            flash('Menu copied');
        }
        catch (e) {
            flash(e.message, true);
        }
    }
    return _jsxs("div", { className: "list inv", children: [_jsxs("div", { className: "row between wrap toolbar", children: [_jsx("h2", { children: "Open menu" }), _jsxs("div", { className: "row", children: [rows && rows.length > 0 && _jsx("button", { className: "ghost small", onClick: copyText, children: "Copy as text" }), tools] })] }), _jsx(PublicLinkBox, { sb: sb, flash: flash, isAdmin: isAdmin }), _jsx(MenuYieldSource, { sb: sb, flash: flash, isAdmin: isAdmin, onChanged: load }), err ? _jsx("p", { className: "warn-t", children: err }) : !rows ? _jsx("p", { className: "muted", children: "Loading\u2026" }) : _jsx(MenuBoard, { rows: rows, variant: "staff" })] });
}
/** 327 (YLD-15): where menu yields come from. Sales Admins switch it; the cut-over to customer reports only. */
export function MenuYieldSource({ sb, flash, isAdmin, onChanged }) {
    const [v, setV] = useState(null);
    const [busy, setBusy] = useState(false);
    useEffect(() => { sb?.rpc('menu_yield_settings').then(({ data, error }) => setV(error ? null : data ?? null)); }, []);
    if (!v)
        return null;
    const LBL = { higher: 'Higher of ours and customer reports', reported: 'Customer reports only' };
    async function pick(n) {
        if (n === v || !sb)
            return;
        setBusy(true);
        const { data, error } = await sb.rpc('set_menu_yield_source', { p_source: n });
        setBusy(false);
        if (error) {
            flash(error.message, true);
            return;
        }
        setV(data);
        flash(`Menu yields: ${LBL[n].toLowerCase()}`);
        onChanged?.();
    }
    return _jsxs("div", { className: "om-link", children: [_jsxs("span", { children: [_jsx("b", { children: "Menu yields" }), " ", _jsx("span", { className: "muted small", children: v === 'reported' ? "customers' lowest–highest only; blank where nobody has reported"
                            : 'our strain numbers; once 2+ customers and 100+ lbs have reported a strain, each end shows the higher of ours vs theirs' })] }), isAdmin ? _jsx("select", { value: v, disabled: busy, onChange: e => pick(e.target.value), "aria-label": "Menu yields", children: Object.entries(LBL).map(([k, l]) => _jsx("option", { value: k, children: l }, k)) })
                : _jsx("span", { className: "muted small", children: LBL[v] ?? v })] });
}
/** the public link: copy it, switch it off, or make a new one (kills the old one). Sales Admins change it. */
export function PublicLinkBox({ sb, flash, isAdmin }) {
    const [s, setS] = useState(null);
    const [busy, setBusy] = useState(false);
    useEffect(() => { sb?.rpc('public_menu_settings').then(({ data }) => setS(data ?? null)); }, []);
    if (!s)
        return null;
    const url = s.code ? `https://www.lifted-orders.app/menu/${s.code}` : null;
    async function set(on, fresh) {
        if (fresh && s?.code && !confirm('Make a new link? The old link stops working right away.'))
            return;
        setBusy(true);
        try {
            const { data, error } = await sb.rpc('set_public_menu', { p_on: on, p_new_code: fresh });
            if (error)
                throw new Error(error.message);
            setS(data);
            flash(fresh ? 'New link made' : on ? 'Public menu is on' : 'Public menu is off');
        }
        catch (e) {
            flash(e.message, true);
        }
        finally {
            setBusy(false);
        }
    }
    async function copy() { if (!url)
        return; try {
        await navigator.clipboard.writeText(url);
        flash('Link copied');
    }
    catch {
        flash(url);
    } }
    return _jsxs("div", { className: "om-link", children: [_jsxs("span", { children: [_jsx("b", { children: "Public link" }), " ", _jsx("span", { className: "muted small", children: "anyone with it can see this menu, no login. No ordering, no reserves." })] }), s.on && url ? _jsx("a", { className: "mono small", href: url, target: "_blank", rel: "noopener noreferrer", children: url }) : _jsx("span", { className: "muted small", children: s.code ? 'Off' : 'Not made yet' }), _jsxs("span", { className: "row", style: { gap: 6 }, children: [s.on && url && _jsx("button", { className: "ghost small", onClick: copy, children: "Copy link" }), isAdmin && _jsx("button", { className: "ghost small", disabled: busy, onClick: () => set(!s.on, !s.code), children: s.on ? 'Turn off' : s.code ? 'Turn on' : 'Make the link' }), isAdmin && s.code && _jsx("button", { className: "ghost small", disabled: busy, onClick: () => set(null, true), children: "New link" })] })] });
}
/** lifted-orders.app/menu/<code>: no login */
export function PublicMenuPage({ sb, code }) {
    const [rows, setRows] = useState(null);
    const [at, setAt] = useState(null);
    useEffect(() => {
        document.title = 'Open Menu · Lifted Farms';
        const load = () => sb?.rpc('public_menu', { p_code: code }).then(({ data }) => { setRows((data ?? [])); setAt(new Date()); });
        load();
        const t = setInterval(load, 5 * 60000);
        return () => clearInterval(t);
    }, [code]);
    return _jsxs("div", { className: "om-page", children: [_jsx("header", { className: "om-hdr", children: _jsxs("div", { className: "om-wrap", children: [_jsxs("div", { className: "om-top", children: [_jsx("a", { href: "https://www.liftedfarms.com", target: "_blank", rel: "noopener noreferrer", children: _jsx("img", { className: "om-logo", src: "/logo-dark.svg", alt: "Lifted" }) }), _jsxs("span", { className: "om-live", children: [_jsx("i", {}), "Live", at ? ` · ${at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''] })] }), _jsx("h1", { children: "Open Menu" }), _jsx("p", { className: "om-sub", children: "CCOF certified OCal \u00B7 updates live as orders and reserves change" })] }) }), _jsx("main", { className: "om-wrap om-main", children: rows === null ? _jsx("p", { className: "om-empty", children: "Loading\u2026" }) : !rows.length ? _jsxs("p", { className: "om-empty", children: ["This menu link isn't active. Ask Lifted Sales for a current link: ", _jsx("a", { className: "om-call", href: `mailto:${SALES}`, children: SALES })] })
                    : _jsxs(_Fragment, { children: [_jsx(MenuBoard, { rows: rows, variant: "public" }), _jsxs("div", { className: "om-contact", children: [_jsx("b", { children: "Want to order or reserve?" }), "Contact Lifted Sales at ", _jsx("a", { href: `mailto:${SALES}`, children: SALES }), ". Existing customers can order in the customer portal."] })] }) }), _jsx("footer", { className: "om-foot", children: "Lifted Farms \u00B7 CCOF certified OCal \u00B7 Watsonville, CA" })] });
}
