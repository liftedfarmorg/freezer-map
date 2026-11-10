import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// Msg RES-1: Sales > Reserves > + Add reserve, built like New sales order (side card on computers, full screen with a
// bottom bar on phones). Pick a customer and see their reserve picture (what the customer portal shows them: reserved,
// fulfilled, on open SOs, remaining, their contract), then one table of their reserves plus every strain on the open menu
// for that crop year. Type the new total on any row; the summary lists the changes; Save runs set_reserve for each one.
import { useEffect, useMemo, useState } from 'react';
const n0 = (v) => Math.round(v).toLocaleString();
const k = (s) => s.trim().toLowerCase();
export function AddReservesSheet({ backend, customers, flash, onClose, onDone, preset }) {
    const [cust, setCust] = useState(preset ?? null);
    const [cq, setCq] = useState('');
    const [ys, setYs] = useState(null);
    const [year, setYear] = useState(null);
    const [bal, setBal] = useState(null);
    const [open, setOpen] = useState(null);
    const [terms, setTerms] = useState([]);
    const [reqs, setReqs] = useState([]);
    const [orders, setOrders] = useState(null); // RES-7: their orders on strains with no reserve yet
    const [ed, setEd] = useState({}); // strain key -> new total typed
    const [filter, setFilter] = useState('all');
    const [q, setQ] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [sumOpen, setSumOpen] = useState(false);
    useEffect(() => {
        backend.reserveYears().then(setYs).catch(() => { });
        backend.listBalances().then(setBal).catch(() => setBal([]));
        backend.listTerms().then(setTerms).catch(() => { });
        backend.listRequests().then(setReqs).catch(() => { });
        backend.listOrders().then(setOrders).catch(() => setOrders([]));
        backend.client()?.rpc('staff_ff_open').then(({ data, error }) => setOpen(error ? [] : (data ?? [])), () => setOpen([]));
    }, []);
    const cur = ys?.current ?? new Date().getFullYear();
    const yr = year ?? cur;
    const years = [...new Set([cur, ...(ys?.years ?? []).map(y => y.year)])].sort((a, b) => a - b);
    const deadline = ys?.years.find(y => y.year === yr)?.deadline ?? null;
    useEffect(() => { setEd({}); }, [cust, yr]);
    const c = customers.find(x => x.id === cust);
    const t = terms.find(x => x.customer_id === cust && x.crop_year === yr);
    const contractLbs = t?.contract_lbs ?? (yr === cur ? c?.contract_lbs ?? null : null);
    const pend = reqs.filter(r => r.customer_id === cust && r.status === 'pending' && (r.crop_year ?? cur) === yr);
    // one row per strain: their reserve (if any) + what's open on the menu
    const rows = useMemo(() => {
        if (cust == null || !bal || !open)
            return [];
        const m = new Map();
        for (const b of bal)
            if (b.customer_id === cust && (b.crop_year ?? cur) === yr && (Number(b.reserved) > 0 || Number(b.shipped) > 0 || Number(b.pending) > 0))
                m.set(k(b.strain), { key: k(b.strain), strain: b.strain, res: Number(b.reserved), ful: Number(b.shipped), so: Number(b.pending), rem: Math.max(0, Number(b.remaining)), open: 0, has: true });
        // RES-7: strains on their confirmed or shipped orders with no reserve yet: once a reserve exists those lbs count against it
        for (const o of orders ?? [])
            if (o.customer_id === cust && (o.status === 'pending' || o.status === 'shipped'))
                for (const l of o.order_lines) {
                    if ((l.product ?? 'fresh_frozen') !== 'fresh_frozen' || (l.crop_year ?? cur) !== yr || m.get(k(l.strain))?.has)
                        continue;
                    const x = m.get(k(l.strain)) ?? { key: k(l.strain), strain: l.strain, res: 0, ful: 0, so: 0, rem: 0, open: 0, has: false };
                    if (o.status === 'pending')
                        x.so += Number(l.lbs);
                    else
                        x.ful += Number(l.lbs);
                    m.set(x.key, x);
                }
        for (const o of open)
            if (o.crop_year === yr && Number(o.open_lbs) > 0) {
                const x = m.get(k(o.strain));
                if (x)
                    x.open = Number(o.open_lbs);
                else
                    m.set(k(o.strain), { key: k(o.strain), strain: o.strain, res: 0, ful: 0, so: 0, rem: 0, open: Number(o.open_lbs), has: false });
            }
        const used = (r) => r.ful + r.so > 0 ? 1 : 0;
        return [...m.values()].sort((a, b) => Number(b.has) - Number(a.has) || used(b) - used(a) || a.strain.localeCompare(b.strain));
    }, [cust, bal, open, orders, yr, cur]);
    // new total: at least what's shipped + on open SOs, at most what they have + what's open on the menu
    const minOf = (r) => r.ful + r.so;
    // what's already shipped / on their open orders came out of the menu, so it counts toward the room (RES-7)
    const maxOf = (r) => Math.max(r.res, r.ful + r.so) + r.open;
    const changes = rows.filter(r => ed[r.key] !== undefined && ed[r.key] !== '' && Number(ed[r.key]) !== r.res)
        .map(r => {
        const to = Number(ed[r.key]);
        const err = to < minOf(r) ? `can't go under ${n0(minOf(r))} (shipped + open SOs)` : to > maxOf(r) ? `${n0(maxOf(r))} is the most (${n0(r.ful + r.so > r.res ? r.ful + r.so : r.res)} theirs + ${n0(r.open)} open)` : '';
        return { r, to, d: to - r.res, err };
    });
    const bad = changes.some(x => x.err);
    const tot = { res: rows.reduce((a, r) => a + r.res, 0), ful: rows.reduce((a, r) => a + r.ful, 0), so: rows.reduce((a, r) => a + r.so, 0), rem: rows.reduce((a, r) => a + r.rem, 0) };
    const newRes = tot.res + changes.reduce((a, x) => a + x.d, 0);
    const ql = q.trim().toLowerCase();
    const shown = rows.filter(r => (filter === 'all' || (filter === 'res') === r.has) && (!ql || r.strain.toLowerCase().includes(ql)));
    async function save() {
        if (cust == null || !changes.length || bad)
            return;
        setBusy(true);
        let done = 0;
        try {
            for (const x of changes) {
                await backend.setReserve(cust, x.r.strain, x.to, note.trim() || undefined, yr !== cur ? yr : undefined);
                done++;
            }
            flash(`${done} reserve${done === 1 ? '' : 's'} saved for ${c?.name ?? 'the customer'}`);
            onDone(cust);
        }
        catch (e) {
            flash(`${done ? `${done} saved, then: ` : ''}${String(e.message ?? e)}`, true);
            if (done)
                onDone(cust);
        }
        finally {
            setBusy(false);
        }
    }
    const cql = cq.trim().toLowerCase();
    const custOpts = customers.filter(x => x.active && x.kind === 'external' && (!cql || x.name.toLowerCase().includes(cql))).sort((a, b) => Number(!!b.reserves_enabled) - Number(!!a.reserves_enabled) || a.name.localeCompare(b.name)).slice(0, 12);
    const loading = !bal || !open || !orders;
    const sign = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${n0(Math.abs(v))}`;
    const summary = _jsxs(_Fragment, { children: [_jsx("div", { className: "no-sum-lines", children: !changes.length ? _jsx("p", { className: "muted small", style: { margin: 14 }, children: "Type a new total next to a strain. Changes show up here." })
                    : changes.map(x => _jsxs("div", { className: `no-sline ${x.err ? 'bad' : ''}`, children: [_jsxs("div", { className: "grow", children: [_jsx("b", { children: x.r.strain }), _jsxs("div", { className: "muted small", children: [x.r.has ? `${n0(x.r.res)} → ${n0(x.to)}` : `new reserve`, x.err ? ` · ${x.err}` : ''] })] }), _jsxs("span", { className: "nw", children: [n0(x.to), " lbs"] }), _jsx("span", { className: `nw ${x.d > 0 ? 'ok-t' : 'warn-t'}`, children: sign(x.d) }), _jsx("button", { className: "linkbtn", "aria-label": `Undo ${x.r.strain}`, onClick: () => setEd(e => { const n = { ...e }; delete n[x.r.key]; return n; }), children: "\u2715" })] }, x.r.key)) }), _jsxs("div", { className: "no-tot", children: [_jsxs("div", { children: [_jsx("span", { className: "muted", children: "Reserved now" }), _jsxs("span", { children: [n0(tot.res), " lbs"] })] }), _jsxs("div", { children: [_jsx("span", { className: "muted", children: "Change" }), _jsxs("span", { children: [sign(newRes - tot.res), " lbs"] })] }), _jsxs("div", { className: "g", children: [_jsx("span", { children: "New total" }), _jsxs("span", { children: [n0(newRes), " lbs"] })] }), contractLbs != null && _jsxs("p", { className: `small ${newRes > contractLbs ? 'warn-t' : 'muted'}`, children: ["Contract: ", n0(contractLbs), " lbs for ", yr, newRes > contractLbs ? ` · ${n0(newRes - contractLbs)} over` : newRes < contractLbs ? ` · ${n0(contractLbs - newRes)} still to reserve` : ' · right on it'] }), _jsxs("div", { className: "field", style: { margin: '6px 0' }, children: [_jsxs("label", { children: ["Reason ", _jsx("span", { className: "muted", children: "(optional; the customer sees it in their Reserve History)" })] }), _jsx("input", { type: "text", value: note, onChange: e => setNote(e.target.value), placeholder: "e.g. Added at their request on the call 11/9" })] }), _jsx("button", { className: "primary big", disabled: busy || !changes.length || bad, onClick: save, children: busy ? 'Saving…' : bad ? 'Fix the red lines' : `Save ${changes.length || ''} change${changes.length === 1 ? '' : 's'}` })] })] });
    return (_jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: "sheet form neworder side no2 addres", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsx("h2", { children: "Add reserves" }), _jsx("button", { className: "ghost", onClick: onClose, children: "\u2715" })] }), _jsxs("div", { className: "no-body", children: [_jsxs("div", { className: "no-main", children: [_jsx("section", { className: "no-sec", children: !c ? _jsxs(_Fragment, { children: [_jsx("div", { className: "no-h", children: "1 \u00B7 Customer" }), _jsx("input", { className: "search", type: "search", autoFocus: true, placeholder: "Type a customer", value: cq, onChange: e => setCq(e.target.value), "aria-label": "Customer" }), _jsx("div", { className: "no-copts", children: custOpts.map(x => _jsxs("button", { onClick: () => { setCust(x.id); setCq(''); }, children: [_jsx("b", { children: x.name }), _jsx("span", { className: "muted small", children: x.reserves_enabled ? 'reserves on' : 'menu only (reserves off)' })] }, x.id)) })] }) : _jsxs(_Fragment, { children: [_jsxs("div", { className: "row no-cust", children: [_jsxs("div", { className: "grow", children: [_jsx("div", { className: "no-cname", children: c.name }), _jsxs("div", { className: "muted small", children: [yr, " crop", c.reserves_enabled ? '' : ' · reserves off'] })] }), !preset && _jsx("button", { className: "ghost small", onClick: () => setCust(null), children: "Change" })] }), years.length > 1 && _jsx("div", { className: "seg", role: "group", "aria-label": "Crop year", children: years.map(y => _jsx("button", { className: y === yr ? 'on' : '', onClick: () => setYear(y), children: y }, y)) }), !c.reserves_enabled && _jsxs("div", { className: "warnbox", children: [c.name, " is menu only: reserves are off for them. Turn them on in Sales \u203A Customers if they're a contract customer."] }), _jsxs("div", { className: "ar-kpis", children: [_jsxs("div", { children: [_jsx("span", { children: "Reserved" }), _jsx("b", { children: n0(tot.res) })] }), _jsxs("div", { children: [_jsx("span", { children: "Fulfilled" }), _jsx("b", { children: n0(tot.ful) })] }), _jsxs("div", { children: [_jsx("span", { children: "On open SOs" }), _jsx("b", { children: n0(tot.so) })] }), _jsxs("div", { className: "tint", children: [_jsx("span", { children: "Remaining" }), _jsx("b", { children: n0(tot.rem) })] })] }), _jsxs("div", { className: "no-chips", children: [contractLbs != null && _jsxs("span", { className: "pill", children: ["Contract ", n0(contractLbs), " lbs"] }), t?.monthly_min_lbs != null && _jsxs("span", { className: "pill", children: [n0(t.monthly_min_lbs), " lbs/month min"] }), (t?.price_per_lb ?? c.price_per_lb) != null && _jsxs("span", { className: "pill", children: ["$", Number(t?.price_per_lb ?? c.price_per_lb).toFixed(2), "/lb"] }), deadline && yr !== cur && _jsxs("span", { className: "pill", children: ["Requests due ", new Date(deadline + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })] }), pend.length > 0 && _jsxs("span", { className: "pill warnp", children: [pend.length, " reserve request", pend.length === 1 ? '' : 's', " waiting"] })] })] }) }), c && _jsxs("section", { className: "no-sec no-menu", children: [_jsxs("div", { className: "no-tabs", children: [_jsxs("span", { className: "no-h", children: ["2 \u00B7 Reserves \u00B7 ", yr, " crop"] }), ['all', 'res', 'not'].map(f => _jsx("button", { className: filter === f ? 'on' : '', onClick: () => setFilter(f), children: f === 'all' ? 'All' : f === 'res' ? 'Reserved' : 'Not reserved' }, f))] }), _jsx("input", { className: "search", type: "search", placeholder: "Search strains", value: q, onChange: e => setQ(e.target.value), "aria-label": "Search strains" }), loading ? _jsx("p", { className: "muted", children: "Loading reserves and the open menu\u2026" }) : !shown.length ? _jsxs("p", { className: "muted", children: ["Nothing here", q ? ` for "${q}"` : '', "."] }) :
                                            _jsx("div", { className: "no-twrap", children: _jsxs("table", { className: "ctable no-table ar-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Strain" }), _jsx("th", { className: "num", title: "Reserved", children: "Reserved" }), _jsx("th", { className: "num", title: "Fulfilled (shipped)", children: "Shipped" }), _jsx("th", { className: "num", title: "On open sales orders", children: "Open SO" }), _jsx("th", { className: "num", title: "Remaining", children: "Left" }), _jsx("th", { className: "num", title: "Open menu available", children: "Open menu" }), _jsx("th", { className: "num", children: "New total" })] }) }), _jsx("tbody", { children: shown.map(r => {
                                                                const v = ed[r.key] ?? '', x = changes.find(z => z.r.key === r.key);
                                                                return _jsxs("tr", { className: x ? (x.err ? 'bad' : 'on') : '', children: [_jsxs("td", { className: "c-n", children: [_jsx("b", { children: r.strain }), !r.has && x && _jsxs(_Fragment, { children: [" ", _jsx("span", { className: "pill", children: "New" })] }), !r.has && r.so > 0 && _jsxs("div", { className: "muted small", children: [n0(r.so), " on their open order, no reserve yet"] }), x?.err && _jsx("div", { className: "warn-t small", children: x.err })] }), _jsx("td", { className: "num", "data-l": "reserved ", children: r.has ? n0(r.res) : '—' }), _jsx("td", { className: "num", "data-l": "fulfilled ", children: r.has || r.ful ? n0(r.ful) : '—' }), _jsx("td", { className: "num", "data-l": "open SO ", children: r.has || r.so ? n0(r.so) : '—' }), _jsx("td", { className: "num", "data-l": "remaining ", children: _jsx("b", { children: x && !x.err ? n0(Math.max(0, x.to - r.ful - r.so)) : r.has ? n0(r.rem) : '—' }) }), _jsx("td", { className: "num muted", "data-l": "open ", children: n0(r.open) }), _jsx("td", { className: "num c-l", children: _jsx("input", { className: `qty ${x?.err ? 'bad' : ''}`, type: "number", step: "10", min: "0", inputMode: "numeric", "aria-label": `New reserve total for ${r.strain}`, placeholder: r.has ? n0(r.res).replace(/,/g, '') : '0', value: v, onChange: e => setEd(m => ({ ...m, [r.key]: e.target.value })) }) })] }, r.key);
                                                            }) })] }) }), _jsx("p", { className: "muted small", children: "New total is the whole reserve for that strain, including what's shipped and what's on their open orders (those lbs count against it, even on an order placed before the reserve). It can't go under shipped + open SOs, and can only go up by what's open on the menu. Saving changes the reserve right away (no request), the same as Edit reserve." })] })] }), _jsxs("aside", { className: "no-sum", children: [_jsx("div", { className: "no-h", style: { padding: '12px 14px', borderBottom: '1px solid var(--line)' }, children: "Changes" }), summary] })] }), _jsxs("div", { className: "no-bar", children: [_jsxs("button", { className: "linkbtn grow", onClick: () => setSumOpen(true), children: [_jsxs("b", { children: [changes.length, " change", changes.length === 1 ? '' : 's'] }), _jsxs("span", { className: "muted small", children: [" \u00B7 new total ", n0(newRes), " lbs \u25B4"] })] }), _jsx("button", { className: "primary", disabled: busy || !changes.length || bad, onClick: save, children: "Save" })] }), sumOpen && _jsx("div", { className: "scrim no-sumscrim", onClick: () => setSumOpen(false), children: _jsxs("div", { className: "sheet no-sumsheet", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsx("h2", { children: "Changes" }), _jsx("button", { className: "ghost", onClick: () => setSumOpen(false), children: "\u2715" })] }), summary] }) })] }) }));
}
