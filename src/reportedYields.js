import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { Fragment, useEffect, useMemo, useState } from 'react';
import { loadMenuInfo, yieldRange } from './strains';
import './reportedYields.css';
const G = { g: 1, kg: 1000, lb: 453.592, '%': 0, '%ff': 0 };
// a strain's average is "menu-ready" once enough customers have reported enough lbs that one odd run can't swing it
const READY_CUSTOMERS = 2, READY_LBS = 100;
const calc = (r, l, p) => {
    const ffG = (p.ff ?? 0) * G.lb;
    const outG = p.outV == null ? null : p.outU === '%' || p.outU === '%ff' ? ffG * p.outV / 100 : p.outV * G[p.outU];
    const hashG = p.bho ? null : outG, bhoG = p.bho ? outG : null;
    const rosinG = p.bho || !p.rosin || p.rosinV == null ? null : p.rosinU === '%' ? (hashG == null ? null : hashG * p.rosinV / 100) : p.rosinU === '%ff' ? ffG * p.rosinV / 100 : p.rosinV * G[p.rosinU];
    return { r, l, p, ffG, hashG, bhoG, rosinG, draft: !r.sentAt };
};
const done = (p) => p.outV != null || (!p.bho && p.rosinV != null);
/** lbs-weighted yields over a set of runs, plus the low-high of the per-run hash and BHO yields */
const agg = (rs) => {
    const sum = (xs, f) => xs.reduce((a, x) => a + (f(x) ?? 0), 0);
    const div = (a, b) => b > 0 ? a / b * 100 : null;
    const h = rs.filter(x => x.hashG != null), b = rs.filter(x => x.bhoG != null), ro = rs.filter(x => x.rosinG != null), both = ro.filter(x => x.hashG != null);
    const each = (xs, f) => xs.map(x => div(f(x) ?? 0, x.ffG)).filter((v) => v != null);
    const hs = each(h, x => x.hashG), bs = each(b, x => x.bhoG), rs2 = each(ro, x => x.rosinG);
    return { lbs: rs.reduce((a, x) => a + (x.p.ff ?? 0), 0),
        hash: div(sum(h, x => x.hashG), sum(h, x => x.ffG)), bho: div(sum(b, x => x.bhoG), sum(b, x => x.ffG)),
        rosinFF: div(sum(ro, x => x.rosinG), sum(ro, x => x.ffG)), rosinHash: div(sum(both, x => x.rosinG), sum(both, x => x.hashG)),
        hashLo: hs.length > 1 ? Math.min(...hs) : null, hashHi: hs.length > 1 ? Math.max(...hs) : null, bhoLo: bs.length > 1 ? Math.min(...bs) : null, bhoHi: bs.length > 1 ? Math.max(...bs) : null,
        rosLo: rs2.length > 1 ? Math.min(...rs2) : null, rosHi: rs2.length > 1 ? Math.max(...rs2) : null };
};
const pct = (n) => n == null ? '–' : `${n < 10 ? n.toFixed(2) : n.toFixed(1)}%`;
const pct1 = (n) => n == null ? '–' : `${n.toFixed(1)}%`;
const lbs = (n) => `${Math.round(n).toLocaleString()} lbs`;
const day = (s) => s ? new Date(s.length === 10 ? s + 'T12:00' : s).toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' }) : '';
const proc = (p) => p.bho ? 'BHO' : p.rosin ? 'Hash + rosin' : 'Hash';
/** the live page: loads the reports (SQL 326) and what the menu shows today (SQL 327: higher of ours vs reported) */
export function ReportedYieldsPage({ sb, flash }) {
    const [d, setD] = useState(null);
    const [err, setErr] = useState('');
    async function load() {
        if (!sb) {
            setD({ reports: [], owed: [], menu: {} });
            return;
        }
        const [r, o, mi] = await Promise.all([sb.rpc('list_yield_reports'), sb.rpc('list_yield_owed'), loadMenuInfo(sb)]);
        if (r.error || o.error) {
            const m = (r.error ?? o.error).message;
            setErr(/list_yield/.test(m) ? 'Reported Yields needs SQL 326 run first.' : m);
            setD({ reports: [], owed: [], menu: {} });
            return;
        }
        const menu = {};
        for (const [k, v] of mi)
            menu[k] = { solventless_pct: v.solventless_pct, hydrocarbon_pct: v.hydrocarbon_pct, solventless_high_pct: v.solventless_high_pct ?? null, hydrocarbon_high_pct: v.hydrocarbon_high_pct ?? null };
        setD({ reports: (r.data ?? []), owed: (o.data ?? []), menu });
    }
    useEffect(() => { load(); }, []);
    if (!d)
        return _jsx("p", { className: "muted", children: "Loading\u2026" });
    return _jsxs(_Fragment, { children: [err && _jsx("p", { className: "muted", style: { color: 'var(--bad)' }, children: err }), _jsx(ReportedYields, { reports: d.reports, owed: d.owed, menu: d.menu, flash: flash, live: true })] });
}
export function ReportedYields({ reports, owed, menu, flash, live }) {
    const [tab, setTab] = useState('strain');
    const [year, setYear] = useState('all');
    const [procF, setProcF] = useState('all');
    const [cust, setCust] = useState('all');
    const [q, setQ] = useState('');
    const [drafts, setDrafts] = useState(false);
    const [open, setOpen] = useState(null);
    const [openSub, setOpenSub] = useState(null); // a strain opened inside a customer
    const [sort, setSort] = useState({ k: 'lbs', asc: false });
    const menuNow = menu;
    const all = useMemo(() => reports.flatMap(r => r.lines.flatMap(l => l.parts.filter(done).map(p => calc(r, l, p)))), [reports]);
    const years = [...new Set(all.map(x => x.l.y))].sort((a, b) => b - a);
    const custs = [...new Map(reports.map(r => [r.customerId, r.customer])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const ql = q.trim().toLowerCase();
    const runs = all.filter(x => (drafts || !x.draft) && (year === 'all' || x.l.y === year) && (cust === 'all' || x.r.customerId === cust)
        && (procF === 'all' || (procF === 'bho') === x.p.bho) && (!ql || x.l.s.toLowerCase().includes(ql) || x.r.customer.toLowerCase().includes(ql)));
    const tot = agg(runs);
    const sent = reports.filter(r => r.sentAt).length;
    const issues = reports.flatMap(r => r.lines.filter(l => l.issue).map(l => ({ r, l })))
        .filter(x => (drafts || x.r.sentAt) && (year === 'all' || x.l.y === year) && (cust === 'all' || x.r.customerId === cust) && (!ql || x.l.s.toLowerCase().includes(ql) || x.r.customer.toLowerCase().includes(ql)))
        .sort((a, b) => String(b.r.sentAt ?? b.r.savedAt).localeCompare(String(a.r.sentAt ?? a.r.savedAt)));
    // ---- by strain (strain + crop year)
    const strains = useMemo(() => {
        const m = new Map();
        for (const x of runs) {
            const k = x.l.s + '|' + x.l.y;
            m.set(k, [...(m.get(k) ?? []), x]);
        }
        return [...m.entries()].map(([k, rs]) => {
            const a = agg(rs), nc = new Set(rs.map(x => x.r.customerId)).size;
            // ready for the menu, separately for hash (SHO) and BHO: enough customers and lbs behind that number
            const ok = (xs) => new Set(xs.map(x => x.r.customerId)).size >= READY_CUSTOMERS && xs.reduce((t, x) => t + (x.p.ff ?? 0), 0) >= READY_LBS;
            const sho = ok(rs.filter(x => x.hashG != null)), bho = ok(rs.filter(x => x.bhoG != null));
            return { k, s: rs[0].l.s, y: rs[0].l.y, rs, a, nc, sho, bho, ready: sho || bho, issues: new Set(rs.filter(x => x.l.issue).map(x => x.r.orderId)).size };
        });
    }, [runs]);
    const val = (x, k) => k === 's' ? x.s : k === 'cust' ? x.nc : k === 'runs' ? x.rs.length : k === 'lbs' ? x.a.lbs : k === 'hash' ? x.a.hash ?? -1 : k === 'rosin' ? x.a.rosinFF ?? -1 : k === 'roh' ? x.a.rosinHash ?? -1 : x.a.bho ?? -1;
    const sorted = (xs) => [...xs].sort((a, b) => {
        const va = val(a, sort.k), vb = val(b, sort.k);
        const c = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
        return sort.asc ? c : -c;
    });
    const th = (k, label, cls = 'num') => _jsx("th", { className: cls, children: _jsxs("button", { className: `ry-sort ${sort.k === k ? 'on' : ''}`, onClick: () => setSort({ k, asc: sort.k === k ? !sort.asc : k === 's' }), children: [label, sort.k === k ? (sort.asc ? ' ▲' : ' ▼') : ''] }) });
    // ---- by customer
    const customers = useMemo(() => {
        const m = new Map();
        for (const x of runs)
            m.set(x.r.customerId, [...(m.get(x.r.customerId) ?? []), x]);
        return custs.filter(([id]) => cust === 'all' || id === cust).map(([id, name]) => {
            const rs = m.get(id) ?? [], reps = reports.filter(r => r.customerId === id);
            return { k: 'c' + id, id, s: name, rs, a: agg(rs), nc: reps.filter(r => r.sentAt).length, drafts: reps.filter(r => !r.sentAt).length, owed: owed.filter(o => o.customerId === id),
                last: reps.map(r => r.sentAt).filter(Boolean).sort().pop() ?? null, issues: reps.reduce((a, r) => a + r.lines.filter(l => l.issue).length, 0) };
        })
            .filter(x => !ql || x.s.toLowerCase().includes(ql) || x.rs.length);
    }, [runs, reports, owed, cust, ql]);
    const runTable = (rs, who) => _jsxs("table", { className: "restable ry-runs", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: who === 'customer' ? 'Customer' : 'Strain' }), _jsx("th", { children: "Order" }), _jsx("th", { children: "Process" }), _jsx("th", { className: "num", children: "FF run" }), _jsx("th", { className: "num", children: "Hash" }), _jsxs("th", { className: "num", children: ["Rosin", _jsx("span", { children: "of FF" })] }), _jsxs("th", { className: "num", children: ["Rosin", _jsx("span", { children: "of hash" })] }), _jsx("th", { className: "num", children: "BHO" }), _jsx("th", { children: "Notes" })] }) }), _jsx("tbody", { children: [...rs].sort((a, b) => b.r.shippedOn.localeCompare(a.r.shippedOn)).map((x, i) => _jsxs("tr", { className: x.draft ? 'ry-draft' : '', children: [_jsxs("td", { children: [who === 'customer' ? x.r.customer : _jsxs(_Fragment, { children: [x.l.s, " ", _jsx("span", { className: "ry-yr", children: x.l.y })] }), x.draft && _jsxs(_Fragment, { children: [" ", _jsx("span", { className: "pill m-mute", children: "Draft" })] })] }), _jsxs("td", { children: [x.r.label, _jsxs("span", { className: "muted", children: [" \u00B7 ", day(x.r.shippedOn)] })] }), _jsx("td", { children: proc(x.p) }), _jsx("td", { className: "num", children: lbs(x.p.ff ?? 0) }), _jsx("td", { className: "num", children: x.hashG != null ? pct(x.hashG / x.ffG * 100) : '–' }), _jsx("td", { className: "num", children: x.rosinG != null ? pct(x.rosinG / x.ffG * 100) : '–' }), _jsx("td", { className: "num", children: x.rosinG != null && x.hashG ? pct1(x.rosinG / x.hashG * 100) : '–' }), _jsx("td", { className: "num", children: x.bhoG != null ? pct(x.bhoG / x.ffG * 100) : '–' }), _jsxs("td", { className: "ry-note", children: [x.l.issue && _jsx("span", { className: "pill m-warn", title: x.l.issue.text, children: x.l.issue.kinds.join(', ') || 'Issue' }), " ", x.l.note] })] }, i)) })] });
    // inside a customer: one row per strain + crop year (their averages); tap a strain for its runs
    const custStrains = (ck, rs) => {
        const m = new Map();
        for (const x of rs) {
            const k = x.l.s + '|' + x.l.y;
            m.set(k, [...(m.get(k) ?? []), x]);
        }
        const rows = [...m.entries()].map(([k, xs]) => ({ k: ck + '|' + k, s: xs[0].l.s, y: xs[0].l.y, rs: xs, a: agg(xs), issues: xs.filter(x => x.l.issue).length, draft: xs.every(x => x.draft) }))
            .sort((a, b) => b.y - a.y || a.s.localeCompare(b.s));
        return _jsxs("table", { className: "restable ry-runs ry-cs", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Strain" }), _jsx("th", { className: "num", children: "Runs" }), _jsx("th", { className: "num", children: "FF run" }), _jsx("th", { className: "num", children: "Hash" }), _jsxs("th", { className: "num", children: ["Rosin", _jsx("span", { children: "of FF" })] }), _jsxs("th", { className: "num", children: ["Rosin", _jsx("span", { children: "of hash" })] }), _jsx("th", { className: "num", children: "BHO" }), _jsx("th", {})] }) }), _jsx("tbody", { children: rows.map(x => {
                        const on = openSub === x.k;
                        return _jsxs(Fragment, { children: [_jsxs("tr", { className: `tap ${on ? 'ry-on' : ''} ${x.draft ? 'ry-draft' : ''}`, onClick: e => { e.stopPropagation(); setOpenSub(on ? null : x.k); }, children: [_jsxs("td", { children: [_jsx("b", { children: x.s }), " ", _jsx("span", { className: "ry-yr", children: x.y }), x.draft && _jsxs(_Fragment, { children: [" ", _jsx("span", { className: "pill m-mute", children: "Draft" })] }), x.issues > 0 && _jsxs(_Fragment, { children: [" ", _jsx("span", { className: "pill m-warn", children: x.rs.find(r => r.l.issue)?.l.issue?.kinds.join(', ') || 'Issue' })] })] }), _jsx("td", { className: "num", children: x.rs.length }), _jsx("td", { className: "num", children: lbs(x.a.lbs) }), _jsx("td", { className: "num", children: _jsx("b", { className: "ry-hash", children: pct(x.a.hash) }) }), _jsx("td", { className: "num", children: pct(x.a.rosinFF) }), _jsx("td", { className: "num", children: pct1(x.a.rosinHash) }), _jsx("td", { className: "num", children: _jsx("b", { className: "ry-bho", children: pct(x.a.bho) }) }), _jsx("td", { className: "muted", children: on ? '▴' : '▾' })] }), on && [...x.rs].sort((a, b) => b.r.shippedOn.localeCompare(a.r.shippedOn)).map((r, i) => _jsxs("tr", { className: `ry-run ${r.draft ? 'ry-draft' : ''}`, children: [_jsxs("td", { children: [r.r.label, _jsxs("span", { className: "muted", children: [" \u00B7 ", day(r.r.shippedOn)] }), r.draft && _jsxs(_Fragment, { children: [" ", _jsx("span", { className: "pill m-mute", children: "Draft" })] }), r.l.note && _jsx("small", { className: "ry-range", children: r.l.note })] }), _jsx("td", {}), _jsx("td", { className: "num", children: lbs(r.p.ff ?? 0) }), _jsx("td", { className: "num", children: r.hashG != null ? pct(r.hashG / r.ffG * 100) : '–' }), _jsx("td", { className: "num", children: r.rosinG != null ? pct(r.rosinG / r.ffG * 100) : '–' }), _jsx("td", { className: "num", children: r.rosinG != null && r.hashG ? pct1(r.rosinG / r.hashG * 100) : '–' }), _jsx("td", { className: "num", children: r.bhoG != null ? pct(r.bhoG / r.ffG * 100) : '–' }), _jsx("td", {})] }, i))] }, x.k);
                    }) })] });
    };
    return _jsxs("div", { className: "ry", children: [_jsxs("div", { className: "row between wrap ry-top", children: [_jsxs("div", { children: [_jsx("h2", { children: "Reported Yields" }), _jsx("p", { className: "muted", style: { margin: 0 }, children: "How customers' runs came out, from the yield reports they send in the portal. Yields are lbs-weighted, % of fresh frozen." })] }), !live && _jsx("span", { className: "pill m-warn", children: "Mockup \u00B7 sample data" })] }), _jsxs("div", { className: "ry-kpis", children: [_jsxs("div", { children: [_jsx("span", { children: "Reports in" }), _jsx("b", { children: sent }), _jsxs("small", { children: [owed.length, " shipped orders not reported yet"] })] }), _jsxs("div", { children: [_jsx("span", { children: "Fresh frozen reported" }), _jsx("b", { children: lbs(tot.lbs) }), _jsxs("small", { children: [runs.length, " runs \u00B7 ", new Set(runs.map(x => x.r.customerId)).size, " customers"] })] }), _jsxs("div", { children: [_jsx("span", { children: "Hash yield" }), _jsx("b", { children: pct(tot.hash) }), _jsx("small", { children: "of fresh frozen" })] }), _jsxs("div", { children: [_jsx("span", { children: "Rosin yield" }), _jsx("b", { children: pct(tot.rosinFF) }), _jsxs("small", { children: ["of FF \u00B7 ", pct1(tot.rosinHash), " of hash"] })] }), _jsxs("div", { children: [_jsx("span", { children: "BHO yield" }), _jsx("b", { children: pct(tot.bho) }), _jsx("small", { children: "of fresh frozen" })] }), _jsxs("div", { className: issues.length ? 'warn' : '', children: [_jsx("span", { children: "Issues reported" }), _jsx("b", { children: issues.length }), _jsx("small", { children: "mold, bud rot, foreign matter\u2026" })] })] }), _jsxs("div", { className: "row between wrap ry-bar", children: [_jsxs("div", { className: "seg", role: "tablist", children: [_jsx("button", { className: tab === 'strain' ? 'on' : '', onClick: () => { setTab('strain'); setOpen(null); }, children: "By strain" }), _jsx("button", { className: tab === 'customer' ? 'on' : '', onClick: () => { setTab('customer'); setOpen(null); setOpenSub(null); }, children: "By customer" }), _jsxs("button", { className: tab === 'issues' ? 'on' : '', onClick: () => { setTab('issues'); setOpen(null); }, children: ["Issues", issues.length ? ` (${issues.length})` : ''] })] }), _jsxs("div", { className: "row", children: [_jsxs("select", { value: String(year), onChange: e => setYear(e.target.value === 'all' ? 'all' : Number(e.target.value)), "aria-label": "Crop year", children: [_jsx("option", { value: "all", children: "All crop years" }), years.map(y => _jsxs("option", { value: y, children: [y, " crop"] }, y))] }), tab !== 'issues' && _jsxs("select", { value: procF, onChange: e => setProcF(e.target.value), "aria-label": "Process", children: [_jsx("option", { value: "all", children: "Hash, rosin & BHO" }), _jsx("option", { value: "sho", children: "Hash & rosin (SHO)" }), _jsx("option", { value: "bho", children: "BHO" })] }), _jsxs("select", { value: String(cust), onChange: e => setCust(e.target.value === 'all' ? 'all' : Number(e.target.value)), "aria-label": "Customer", children: [_jsx("option", { value: "all", children: "All customers" }), custs.map(([id, n]) => _jsx("option", { value: id, children: n }, id))] }), _jsx("input", { type: "search", placeholder: "Search strain or customer", value: q, onChange: e => setQ(e.target.value), style: { minWidth: 200 } }), _jsxs("label", { className: "small-check", children: [_jsx("input", { type: "checkbox", checked: drafts, onChange: e => setDrafts(e.target.checked) }), " Include drafts"] })] })] }), tab === 'strain' && _jsxs(_Fragment, { children: [_jsx("div", { className: "ry-card", children: _jsxs("table", { className: "restable ry-main", children: [_jsx("thead", { children: _jsxs("tr", { children: [th('s', 'Strain', ''), th('cust', 'Customers'), th('runs', 'Runs'), th('lbs', 'FF run'), th('hash', _jsxs(_Fragment, { children: ["Hash", _jsx("span", { children: "of FF \u00B7 range" })] })), th('rosin', _jsxs(_Fragment, { children: ["Rosin", _jsx("span", { children: "of FF \u00B7 range" })] })), th('roh', _jsxs(_Fragment, { children: ["Rosin", _jsx("span", { children: "of hash" })] })), th('bho', _jsxs(_Fragment, { children: ["BHO", _jsx("span", { children: "of FF \u00B7 range" })] })), _jsx("th", { children: "For the menu" }), _jsx("th", {})] }) }), _jsxs("tbody", { children: [sorted(strains).map(x => {
                                            const on = open === x.k, m = menuNow[x.s.toLowerCase()];
                                            return _jsxs(Fragment, { children: [_jsxs("tr", { className: `tap ${on ? 'ry-on' : ''}`, onClick: () => setOpen(on ? null : x.k), children: [_jsxs("td", { children: [_jsx("b", { children: x.s }), " ", _jsx("span", { className: "ry-yr", children: x.y }), x.issues > 0 && _jsxs(_Fragment, { children: [" ", _jsxs("span", { className: "pill m-warn", children: [x.issues, " issue", x.issues > 1 ? 's' : ''] })] })] }), _jsx("td", { className: "num", children: x.nc }), _jsx("td", { className: "num", children: x.rs.length }), _jsx("td", { className: "num", children: lbs(x.a.lbs) }), _jsxs("td", { className: "num", children: [_jsx("b", { className: "ry-hash", children: pct(x.a.hash) }), x.a.hashLo != null && _jsxs("small", { className: "ry-range", children: [pct(x.a.hashLo), "\u2013", pct(x.a.hashHi)] })] }), _jsxs("td", { className: "num", children: [_jsx("b", { children: pct(x.a.rosinFF) }), x.a.rosLo != null && _jsxs("small", { className: "ry-range", children: [pct(x.a.rosLo), "\u2013", pct(x.a.rosHi)] })] }), _jsx("td", { className: "num", children: pct1(x.a.rosinHash) }), _jsxs("td", { className: "num", children: [_jsx("b", { className: "ry-bho", children: pct(x.a.bho) }), x.a.bhoLo != null && _jsxs("small", { className: "ry-range", children: [pct(x.a.bhoLo), "\u2013", pct(x.a.bhoHi)] })] }), _jsxs("td", { className: "ry-menu", children: [x.ready ? _jsxs(_Fragment, { children: [x.sho && _jsxs("span", { className: "pill m-ok", children: ["SHO ", pct1(x.a.hash)] }), " ", x.bho && _jsxs("span", { className: "pill m-ok", children: ["BHO ", pct1(x.a.bho)] })] })
                                                                        : _jsx("span", { className: "pill m-mute", title: `Needs reports from ${READY_CUSTOMERS}+ customers and ${READY_LBS}+ lbs`, children: "Needs more reports" }), _jsxs("small", { children: ["Menu shows ", [yieldRange(m?.solventless_pct, m?.solventless_high_pct) && `${yieldRange(m?.solventless_pct, m?.solventless_high_pct)} SHO`, yieldRange(m?.hydrocarbon_pct, m?.hydrocarbon_high_pct) && `${yieldRange(m?.hydrocarbon_pct, m?.hydrocarbon_high_pct)} BHO`].filter(Boolean).join(' · ') || 'no yield'] })] }), _jsx("td", { className: "muted", children: on ? '▴' : '▾' })] }), on && _jsx("tr", { className: "ry-detail", children: _jsxs("td", { colSpan: 10, children: [runTable(x.rs, 'customer'), _jsx("div", { className: "row between wrap ry-detail-f", children: _jsxs("span", { className: "muted", children: ["Average of ", x.rs.length, " run", x.rs.length > 1 ? 's' : '', " from ", x.nc, " customer", x.nc > 1 ? 's' : '', ". ", !x.sho && x.a.hash != null ? 'Hash needs more reports before it counts on the menu. ' : '', !x.bho && x.a.bho != null ? 'BHO needs more reports before it counts on the menu.' : ''] }) })] }) })] }, x.k);
                                        }), !strains.length && _jsx("tr", { children: _jsx("td", { colSpan: 10, className: "muted", children: "No reported runs match." }) })] }), strains.length > 0 && _jsx("tfoot", { children: _jsxs("tr", { children: [_jsx("td", { children: _jsx("b", { children: "All strains" }) }), _jsx("td", { className: "num", children: new Set(runs.map(x => x.r.customerId)).size }), _jsx("td", { className: "num", children: runs.length }), _jsx("td", { className: "num", children: lbs(tot.lbs) }), _jsx("td", { className: "num", children: _jsx("b", { children: pct(tot.hash) }) }), _jsx("td", { className: "num", children: _jsx("b", { children: pct(tot.rosinFF) }) }), _jsx("td", { className: "num", children: _jsx("b", { children: pct1(tot.rosinHash) }) }), _jsx("td", { className: "num", children: _jsx("b", { children: pct(tot.bho) }) }), _jsx("td", { colSpan: 2 })] }) })] }) }), _jsxs("p", { className: "muted ry-foot", children: ["Tap a strain to see every run behind its average. ", _jsx("b", { children: "For the menu" }), ": a hash (SHO) or BHO average turns green once ", READY_CUSTOMERS, "+ customers and ", READY_LBS, "+ lbs are behind it, so one odd run can't swing it; from then on the sales menu shows, at each end, the higher of our strain numbers vs the customers' lowest\u2013highest (automatic; Sales \u203A Open menu \u203A Menu yields can switch to customer reports only). \"Menu shows\" is what customers see today."] })] }), tab === 'customer' && _jsx("div", { className: "ry-card", children: _jsxs("table", { className: "restable ry-main", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Customer" }), _jsx("th", { className: "num", children: "Reports sent" }), _jsx("th", { children: "Not reported yet" }), _jsx("th", { className: "num", children: "FF run" }), _jsxs("th", { className: "num", children: ["Hash", _jsx("span", { children: "of FF" })] }), _jsxs("th", { className: "num", children: ["Rosin", _jsx("span", { children: "of FF" })] }), _jsxs("th", { className: "num", children: ["Rosin", _jsx("span", { children: "of hash" })] }), _jsxs("th", { className: "num", children: ["BHO", _jsx("span", { children: "of FF" })] }), _jsx("th", { className: "num", children: "Issues" }), _jsx("th", { children: "Last report" }), _jsx("th", {})] }) }), _jsx("tbody", { children: customers.map(x => {
                                const on = open === x.k;
                                return _jsxs(Fragment, { children: [_jsxs("tr", { className: `tap ${on ? 'ry-on' : ''}`, onClick: () => setOpen(on ? null : x.k), children: [_jsx("td", { children: _jsx("b", { children: x.s }) }), _jsxs("td", { className: "num", children: [x.nc, x.drafts > 0 && _jsxs("small", { className: "ry-range", children: ["+", x.drafts, " draft"] })] }), _jsx("td", { children: x.owed.length ? _jsxs("span", { className: "pill m-warn", title: x.owed.map(o => `${o.label} (${day(o.shippedOn)})`).join(', '), children: [x.owed.length, " order", x.owed.length > 1 ? 's' : ''] }) : _jsx("span", { className: "muted", children: "All reported" }) }), _jsx("td", { className: "num", children: x.a.lbs ? lbs(x.a.lbs) : '–' }), _jsx("td", { className: "num", children: _jsx("b", { className: "ry-hash", children: pct(x.a.hash) }) }), _jsx("td", { className: "num", children: pct(x.a.rosinFF) }), _jsx("td", { className: "num", children: pct1(x.a.rosinHash) }), _jsx("td", { className: "num", children: _jsx("b", { className: "ry-bho", children: pct(x.a.bho) }) }), _jsx("td", { className: "num", children: x.issues || '–' }), _jsx("td", { className: "muted", children: x.last ? day(x.last) : 'Never' }), _jsx("td", { className: "muted", children: on ? '▴' : '▾' })] }), on && _jsx("tr", { className: "ry-detail", children: _jsxs("td", { colSpan: 11, children: [x.rs.length ? custStrains(x.k, x.rs) : _jsxs("p", { className: "muted", children: ["No runs reported", drafts ? '' : ' (drafts hidden)', "."] }), x.owed.length > 0 && _jsxs("p", { className: "muted ry-owed", children: ["Shipped, not reported yet: ", x.owed.map(o => `${o.label} (shipped ${day(o.shippedOn)}, ${o.strains} strain${o.strains > 1 ? 's' : ''})`).join(' · ')] })] }) })] }, x.k);
                            }) })] }) }), tab === 'issues' && _jsxs("div", { className: "ry-issues", children: [!issues.length && _jsx("p", { className: "muted", children: "No issues reported." }), issues.map(({ r, l }, i) => _jsxs("div", { className: "card ry-issue", children: [_jsxs("div", { className: "row between wrap", children: [_jsxs("div", { children: [_jsx("b", { children: l.s }), " ", _jsx("span", { className: "ry-yr", children: l.y }), " \u00B7 ", r.customer, !r.sentAt && _jsxs(_Fragment, { children: [" ", _jsx("span", { className: "pill m-mute", children: "Draft" })] }), _jsxs("div", { className: "muted", children: [r.label, ", shipped ", day(r.shippedOn), " \u00B7 ", l.shipped, " lbs \u00B7 reported ", day(r.sentAt ?? r.savedAt), r.by ? ` by ${r.by}` : ''] })] }), _jsx("div", { className: "row", children: (l.issue.kinds.length ? l.issue.kinds : ['Other']).map(k => _jsx("span", { className: "pill m-warn", children: k }, k)) })] }), l.issue.text && _jsx("p", { className: "ry-issue-t", children: l.issue.text }), r.by && _jsx("a", { className: "small", href: `mailto:${r.by}?subject=${encodeURIComponent(`${l.s} on ${r.label}`)}`, children: "Reply by email" })] }, i))] })] });
}
