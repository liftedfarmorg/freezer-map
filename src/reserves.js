import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { AddReservesSheet } from './addreserves';
import { ListInput, Select } from './combo';
import { SampleHolds, SampleSheet } from './samples';
import { CustomerDashboard } from './statement';
import { StrainLink } from './strainCard';
import { useBack, scrollTop, scrollPos } from './nav';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PRODUCT_LABEL } from './types';
import { readSheet } from 'read-excel-file/browser';
import { parseCsv } from './settings';
import { OpenMenu } from './menu';
import { CatalogButton } from './catalog';
import { RequestsPanel } from './requests';
import { STATE_LABEL } from './fulfill';
const n0 = (x) => Math.round(x).toLocaleString();
const STATUS_LABEL = { shipped: 'Shipped', pending: 'Confirmed', submitted: 'Submitted', draft: 'Draft', cancelled: 'Cancelled' };
const orderLbs = (o) => o.order_lines.reduce((a, l) => a + Number(l.lbs), 0);
const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' }) : '';
// Roshi "SO Detail" export -> rows for the import
const ROSHI_COLS = {
    'id1': 'line_id', 'sales order #': 'so_number', 'customer': 'customer', 'sku name': 'sku_name', 'sku id': 'sku_id',
    'so status': 'status', 'total - gross': 'gross', 'units': 'units', 'sales order date': 'order_date', 'date shipped': 'shipped_date',
    'package tag/lot': 'package_tag',
};
async function readRoshi(f) {
    const grid = /\.csv$/i.test(f.name)
        ? parseCsv((await f.text()).replace(/^﻿/, ''))
        : (await readSheet(f)).map(r => r.map(c => c instanceof Date ? c.toISOString() : c));
    const hdr = (grid[0] ?? []).map(h => String(h ?? '').trim().toLowerCase());
    const idx = Object.fromEntries(Object.entries(ROSHI_COLS).map(([h, k]) => [k, hdr.indexOf(h)]));
    for (const need of ['so_number', 'customer', 'sku_name', 'status', 'units'])
        if (idx[need] < 0)
            throw new Error(`This doesn't look like a Roshi sales order export (no "${Object.keys(ROSHI_COLS).find(h => ROSHI_COLS[h] === need)}" column)`);
    const seen = new Map();
    return grid.slice(1).map(r => {
        const get = (k) => idx[k] >= 0 && r[idx[k]] != null && String(r[idx[k]]).trim() !== '' ? String(r[idx[k]]).trim() : null;
        const so = get('so_number') ?? '', sku = get('sku_name') ?? '';
        const key = `${so}|${get('sku_id') ?? sku}`;
        const n = (seen.get(key) ?? 0) + 1;
        seen.set(key, n);
        return {
            line_id: get('line_id') ?? `${key}|${n}`, so_number: so, customer: get('customer') ?? '', sku_name: sku, sku_id: get('sku_id'),
            status: get('status') ?? '', gross: get('gross') != null ? Number(String(get('gross')).replace(/[$,]/g, '')) : null,
            units: get('units') != null ? Number(String(get('units')).replace(/,/g, '')) : null,
            order_date: get('order_date'), shipped_date: get('shipped_date'), package_tag: get('package_tag'),
        };
    }).filter(r => /FL2[56]/.test(r.sku_name) && /fresh frozen/i.test(r.sku_name) && r.so_number);
}
export const SALES_TITLES = { menu: 'Open menu', orders: 'Orders', requests: 'Requests', customer: 'Reserves by customer', strain: 'Reserves by strain' };
/** Sales screens. The Sales module menu picks the screen (mode); isAdmin = Sales Admin (approvals, reserves, deadlines). */
export function ReservesView({ backend, customers, strains, onHand, flash, isAdmin, mode, onCounts, fulfil, onFulfil, onNewOrder, onDoc, onInvoice }) {
    const [reqs, setReqs] = useState([]);
    const [nums, setNums] = useState([]);
    const [year, setYear] = useState(null);
    const [bal, setBal] = useState(null);
    const [ys, setYs] = useState(null);
    const [ry, setRy] = useState(null); // which crop's reserves
    useEffect(() => { backend.reserveYears().then(setYs).catch(() => { }); }, []);
    const [orders, setOrders] = useState([]);
    const [err, setErr] = useState(null);
    const [open, setOpen] = useState(null);
    // RES-4: Reserves by customer as a sortable table (computers and tablets; phones keep the cards)
    const [csort, setCsort] = useState({ k: 'res', up: false });
    // RES-5: By strain table sort + which strain is open
    const [ssort, setSsort] = useState({ k: 'name', up: true });
    const [sOpen, setSOpen] = useState(null);
    const [cterms, setCterms] = useState([]);
    useEffect(() => { backend.listTerms().then(setCterms).catch(() => { }); }, []);
    const [adding, setAdding] = useState(null); // RES-1
    const [edit, setEdit] = useState(null);
    const [q, setQ] = useState('');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const [sampleOf, setSampleOf] = useState(null);
    const [holdRev, setHoldRev] = useState(0);
    const [ost, setOst] = useState('all'); // Orders table: status filter (restyle)
    const load = () => Promise.all([backend.listBalances(), backend.listOrders().catch(() => []),
        backend.listRequests().catch(() => []), backend.menuNumbers().catch(() => [])])
        .then(([b, o, r, m]) => {
        setBal(b);
        setOrders(o);
        setReqs(r);
        setNums(m);
        setErr(null);
        onCounts?.();
    }).catch(e => setErr(String(e?.message ?? e)));
    useEffect(() => { load(); }, []);
    // By customer: one customer at a time, with a Back button (and the phone's Back) to the full list
    const listY = useRef(0);
    const openCust = (id) => { listY.current = scrollPos(); setOpen(id); scrollTop(); };
    const closeCust = () => { setOpen(null); requestAnimationFrame(() => scrollTop(listY.current)); };
    useBack(mode === 'customer' && open != null && open > 0, closeCust);
    useEffect(() => { setOpen(null); }, [mode]);
    const cust = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers]);
    const cname = (id) => cust.get(id)?.name ?? `#${id}`;
    const onHandOf = (s) => onHand.get(s.toLowerCase()) ?? 0;
    const pendingByStrain = useMemo(() => {
        const m = new Map();
        for (const o of orders)
            if (o.status === 'pending')
                for (const l of o.order_lines)
                    if ((l.product ?? 'fresh_frozen') === 'fresh_frozen')
                        m.set(l.strain.toLowerCase(), (m.get(l.strain.toLowerCase()) ?? 0) + Number(l.lbs));
        return m;
    }, [orders]);
    if (err)
        return _jsxs("div", { className: "list", children: [_jsx("h2", { children: "Reserves" }), _jsxs("div", { className: "warnbox", children: ["Reserves or orders aren't set up in the database yet. Run 009_reserves.sql and 010_orders.sql in Supabase, then refresh. (", err, ")"] })] });
    if (!bal)
        return _jsxs("div", { className: "list", children: [_jsx("h2", { children: "Reserves" }), _jsx("p", { className: "muted", children: "Loading\u2026" })] });
    const cur = ys?.current ?? new Date().getFullYear();
    const rYear = ry ?? cur;
    const future = rYear > cur;
    const menuYears = [...new Set(nums.map(m => m.crop_year))].sort((a, b) => b - a);
    const yrSel = mode === 'strain' && !future ? (year ?? menuYears[0] ?? cur) : rYear;
    const dl = ys?.years.find(y => y.year === rYear)?.deadline ?? null;
    const allBal = bal;
    const yearsWith = [...new Set([cur, ...(ys?.years ?? []).map(y => y.year), ...allBal.map(r => r.crop_year ?? cur), ...(mode === 'strain' ? menuYears : [])])].sort((a, b) => a - b);
    const balY = allBal.filter(r => (r.crop_year ?? cur) === rYear);
    const ql = q.toLowerCase();
    const sum = (rs, k) => rs.reduce((a, r) => a + Number(r[k]), 0);
    const byCust = [...balY.reduce((m, r) => m.set(r.customer_id, [...(m.get(r.customer_id) ?? []), r]), new Map())]
        .map(([id, rs]) => ({ id, name: cname(id), rs }))
        .filter(c => !ql || c.name.toLowerCase().includes(ql) || c.rs.some(r => r.strain.toLowerCase().includes(ql)))
        .sort((a, b) => sum(b.rs, 'reserved') - sum(a.rs, 'reserved'));
    const focus = mode === 'customer' && open != null && open > 0 ? [...balY.reduce((m, r) => m.set(r.customer_id, [...(m.get(r.customer_id) ?? []), r]), new Map())].map(([id, rs]) => ({ id, name: cname(id), rs })).find(c => c.id === open) : undefined;
    // numbers come from the database (same math as the customer menu); fall back to local math before 011 is run
    const years = [...new Set(nums.map(m => m.crop_year))].sort((a, b) => b - a);
    const yr = year ?? years[0];
    const byStrain = (nums.length ? nums.filter(m => m.crop_year === yr).map(m => ({ s: m.strain, rs: balY.filter(r => r.strain.toLowerCase() === m.strain.toLowerCase()),
        left: Number(m.reserved_left), have: Number(m.on_hand), pend: Number(m.pending), held: Number(m.held), free: Number(m.free), hidden: !m.on_menu }))
        : [...new Set([...balY.map(r => r.strain), ...[...onHand.keys()].map(k => strains.find(s => s.name.toLowerCase() === k)?.name ?? k)])].map(s => {
            const rs = balY.filter(r => r.strain.toLowerCase() === s.toLowerCase());
            const left = sum(rs, 'remaining'), have = onHandOf(s), pend = pendingByStrain.get(s.toLowerCase()) ?? 0;
            return { s, rs, left, have, pend, held: 0, free: have - pend - left, hidden: false };
        })).filter(x => (x.have > 0 || x.left > 0) && (!ql || x.s.toLowerCase().includes(ql) || x.rs.some(r => cname(r.customer_id).toLowerCase().includes(ql))))
        .sort((a, b) => a.s.localeCompare(b.s));
    const shownOrders = [...orders].sort((a, b) => Number(b.status === 'submitted') - Number(a.status === 'submitted')).filter(o => !ql || cname(o.customer_id).toLowerCase().includes(ql) || (o.so_number ?? '').toLowerCase().includes(ql) || o.order_lines.some(l => l.strain.toLowerCase().includes(ql)));
    async function save() {
        if (!edit || edit.customer_id == null)
            return;
        const lbs = Number(edit.lbs);
        try {
            await backend.setReserve(edit.customer_id, edit.strain, lbs, edit.note?.trim() || undefined, rYear !== cur ? rYear : undefined);
            await load();
            setOpen(edit.customer_id);
            setEdit(null);
            flash(lbs === 0 ? 'Reserve removed' : 'Reserve saved');
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
    }
    async function copyMenu() {
        try {
            const rows = (await backend.openMenu()).filter(r => Number(r.available) > 0);
            const years = [...new Set(rows.map(r => r.crop_year))].sort((a, b) => b - a);
            const text = years.map(y => `${y} crop, fresh frozen (lbs open)\n` + rows.filter(r => r.crop_year === y).map(r => `${r.strain}: ${n0(Number(r.available))}`).join('\n')).join('\n\n');
            await navigator.clipboard.writeText(text);
            flash('Menu copied');
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
    }
    async function importFile(f) {
        setBusy(true);
        setResult(null);
        try {
            const rows = await readRoshi(f);
            if (!rows.length)
                throw new Error('No 2026 fresh frozen lines found in that file');
            const res = await backend.importRoshi(rows);
            setResult(res);
            await load();
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs("div", { className: "list reserves", children: [_jsxs("h2", { children: [SALES_TITLES[mode], " ", (mode === 'customer' || mode === 'strain') && _jsxs("span", { className: "muted", children: [cur, " reserves: ", n0(sum(allBal.filter(r => (r.crop_year ?? cur) === cur), 'remaining')), " lbs left of ", n0(sum(allBal.filter(r => (r.crop_year ?? cur) === cur), 'reserved'))] })] }), _jsxs("div", { className: "row toolbar", children: [_jsx("input", { className: "search", type: "search", placeholder: "Search customer, strain or SO #", value: q, onChange: e => setQ(e.target.value) }), mode === 'orders'
                        ? _jsxs(_Fragment, { children: [onNewOrder && _jsx("button", { className: "primary", onClick: onNewOrder, children: "+ New order" }), _jsxs("label", { className: `ghost filebtn ${busy ? 'disabled' : ''}`, children: [busy ? 'Importing…' : 'Import Roshi orders', _jsx("input", { type: "file", accept: ".xlsx,.csv", disabled: busy, onChange: e => { const f = e.target.files?.[0]; e.target.value = ''; if (f)
                                                importFile(f); } })] })] })
                        : isAdmin && mode !== 'requests' && mode !== 'menu' && _jsx("button", { className: "primary", onClick: () => setAdding({ preset: focus?.id ?? null }), children: "+ Add reserves" })] }), result && (_jsxs("div", { className: "okbox", children: ["Imported: ", result.orders_added, " new orders, ", result.orders_updated, " orders with a new status or date, ", result.lines_added, " new lines, ", result.lines_updated, " changed lines.", result.new_customers.length > 0 && _jsxs(_Fragment, { children: [" New customers added: ", result.new_customers.join(', '), "."] }), result.new_strains.length > 0 && _jsxs(_Fragment, { children: [" New strains added: ", result.new_strains.join(', '), "."] }), _jsx("a", { onClick: () => setResult(null), children: " Dismiss" })] })), (mode === 'customer' || mode === 'strain') && yearsWith.length > 1 && (_jsxs("div", { className: "row yearpick", children: [_jsx("div", { className: "seg yearseg", children: yearsWith.map(y => _jsxs("button", { className: y === yrSel ? 'on' : '', onClick: () => { setRy(y); if (y <= cur)
                                setYear(y); }, children: [y, " crop"] }, y)) }), future && _jsx("span", { className: "muted", children: dl ? `Customers can request ${rYear} reserves until ${new Date(dl + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}.` : `${rYear} requests are closed.` }), future && isAdmin && _jsx(DeadlineEdit, { year: rYear, value: dl, onSave: async (v) => { try {
                            await backend.setReserveDeadline(rYear, v);
                            setYs(await backend.reserveYears());
                            flash('Deadline saved');
                        }
                        catch (e) {
                            flash(String(e.message ?? e), true);
                        } } })] })), mode === 'customer' && !focus && byCust.length === 0 && _jsxs("p", { className: "muted", children: ["No ", rYear, " reserves yet."] }), mode === 'customer' && focus && (() => {
                const c = focus;
                const cOrders = orders.filter(o => o.customer_id === c.id && o.status !== 'cancelled').sort((a, b) => (b.order_date ?? '').localeCompare(a.order_date ?? ''));
                const cReqs = reqs.filter(r => r.customer_id === c.id && r.status === 'pending');
                return (_jsxs("div", { className: "custfocus", children: [_jsx("button", { className: "ghost backbtn", onClick: closeCust, children: "\u2039 All customers" }), _jsxs("div", { className: "rescard", children: [_jsxs("button", { className: "li setrow custhead", onClick: closeCust, "aria-label": `Close ${c.name}`, children: [_jsxs("div", { className: "grow", children: [_jsx("b", { children: c.name }), _jsxs("div", { className: "muted", children: [c.rs.length, " strain", c.rs.length === 1 ? '' : 's', " \u00B7 ", n0(sum(c.rs, 'shipped')), " shipped", sum(c.rs, 'pending') > 0 ? ` · ${n0(sum(c.rs, 'pending'))} pending` : ''] })] }), _jsxs("div", { className: "num", children: [_jsx("b", { children: n0(sum(c.rs, 'remaining')) }), _jsxs("div", { className: "muted", children: ["of ", n0(sum(c.rs, 'reserved')), " left \u25B4"] })] })] }), _jsx(CustReserves, { backend: backend, cid: c.id, name: c.name, rs: c.rs, nums: nums, year: rYear, cur: cur, isAdmin: isAdmin, flash: flash, onSaved: async () => { await load(); setOpen(c.id); }, onAdd: () => setAdding({ preset: c.id }) }, `${c.id}-${rYear}`)] }), _jsx(SampleHolds, { backend: backend, customerId: c.id, staff: true, flash: flash, rev: holdRev, onChanged: load }), _jsx("h3", { children: "Account" }), _jsx(CustomerDashboard, { backend: backend, customerId: c.id, staff: true }), cReqs.length > 0 && _jsxs(_Fragment, { children: [_jsx("h3", { children: "Reserve requests waiting" }), _jsxs("table", { className: "restable wide", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Strain" }), _jsx("th", { className: "num", children: "Now" }), _jsx("th", { className: "num", children: "Asked for" }), _jsx("th", { children: "Crop" })] }) }), _jsx("tbody", { children: cReqs.map(r => _jsxs("tr", { children: [_jsx("td", { children: r.strain }), _jsx("td", { className: "num", children: n0(Number(r.current_lbs)) }), _jsx("td", { className: "num", children: _jsx("b", { children: n0(Number(r.requested_lbs)) }) }), _jsx("td", { children: r.crop_year ?? cur })] }, r.id)) })] })] }), _jsx("h3", { children: "Orders" }), cOrders.length === 0 ? _jsx("p", { className: "muted", children: "No orders yet." }) : (_jsxs("table", { className: "restable wide", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Order" }), _jsx("th", { children: "Date" }), _jsx("th", { children: "Status" }), _jsx("th", { className: "num", children: "Lbs" })] }) }), _jsx("tbody", { children: cOrders.slice(0, 25).map(o => _jsxs("tr", { children: [_jsx("td", { children: o.so_number ?? `#${o.id}` }), _jsx("td", { children: fmtDate(o.order_date) }), _jsx("td", { children: _jsx("span", { className: `pill o-${o.status}`, children: STATUS_LABEL[o.status] }) }), _jsx("td", { className: "num", children: n0(orderLbs(o)) })] }, o.id)) })] })), _jsx("button", { className: "ghost backbtn", onClick: closeCust, children: "\u2039 All customers" })] }));
            })(), mode === 'customer' && !focus && byCust.length > 0 && (() => {
                const termOf = (id) => cterms.find(x => x.customer_id === id && x.crop_year === rYear);
                const contractOf = (id) => termOf(id)?.contract_lbs ?? (rYear === cur ? cust.get(id)?.contract_lbs ?? null : null);
                const mminOf = (id) => termOf(id)?.monthly_min_lbs ?? (rYear === cur ? cust.get(id)?.monthly_min_lbs ?? null : null);
                const priceOf = (id) => { const v = termOf(id)?.price_per_lb ?? (rYear === cur ? cust.get(id)?.price_per_lb ?? null : null); return v == null ? null : Number(v); };
                const rows = byCust.map(c => {
                    const res = sum(c.rs, 'reserved'), ship = sum(c.rs, 'shipped'), so = sum(c.rs, 'pending'), left = sum(c.rs, 'remaining');
                    return { ...c, strains: c.rs.length, res, ship, so, left, pct: res > 0 ? ship / res : 0, contract: contractOf(c.id), mmin: mminOf(c.id), price: priceOf(c.id) };
                });
                const val = (r) => csort.k === 'name' ? r.name.toLowerCase() : csort.k === 'contract' || csort.k === 'mmin' || csort.k === 'price' ? (r[csort.k] ?? -1) : r[csort.k];
                rows.sort((a, b) => { const x = val(a), y = val(b); const d = typeof x === 'string' ? x.localeCompare(y) : x - y; return csort.up ? d : -d; });
                const tot = rows.reduce((t, r) => ({ res: t.res + r.res, ship: t.ship + r.ship, so: t.so + r.so, left: t.left + r.left, strains: t.strains + r.strains }), { res: 0, ship: 0, so: 0, left: 0, strains: 0 });
                const th = (k, label, num = true) => _jsx("th", { className: `${num ? 'num ' : ''}sortth${csort.k === k ? ' on' : ''}`, "aria-sort": csort.k === k ? (csort.up ? 'ascending' : 'descending') : 'none', children: _jsxs("button", { className: "linkbtn", onClick: () => setCsort(s => ({ k, up: s.k === k ? !s.up : k === 'name' })), children: [label, csort.k === k ? (csort.up ? ' ▲' : ' ▼') : ''] }) });
                return _jsx("div", { className: "cwrap rescwrap", children: _jsxs("table", { className: "ctable restbl", children: [_jsx("thead", { children: _jsxs("tr", { children: [th('name', 'Customer', false), th('strains', 'Strains'), th('contract', 'Contract'), th('mmin', 'Monthly min'), th('price', '$/lb'), th('res', 'Reserved'), th('ship', 'Shipped'), th('so', 'Open SO'), th('left', 'Left'), th('pct', 'Shipped %')] }) }), _jsx("tbody", { children: rows.map(r => _jsxs("tr", { className: "tap", onClick: () => openCust(r.id), children: [_jsx("td", { children: _jsx("b", { children: r.name }) }), _jsx("td", { className: "num", children: r.strains }), _jsx("td", { className: `num ${r.contract != null && r.res > r.contract ? 'warn-t' : 'muted'}`, title: r.contract != null && r.res > r.contract ? `${n0(r.res - r.contract)} lbs over contract` : undefined, children: r.contract != null ? n0(r.contract) : '—' }), _jsx("td", { className: "num muted", children: r.mmin != null ? n0(r.mmin) : '—' }), _jsx("td", { className: "num muted", children: r.price != null ? `$${r.price.toFixed(2)}` : '—' }), _jsx("td", { className: "num", children: n0(r.res) }), _jsx("td", { className: "num", children: n0(r.ship) }), _jsx("td", { className: "num", children: r.so > 0 ? n0(r.so) : _jsx("span", { className: "muted", children: "0" }) }), _jsx("td", { className: "num", children: _jsx("b", { children: n0(r.left) }) }), _jsxs("td", { className: "num", children: [_jsx("span", { className: "respct", children: _jsx("i", { style: { width: `${Math.min(100, Math.round(r.pct * 100))}%` } }) }), " ", Math.round(r.pct * 100), "%"] })] }, r.id)) }), _jsx("tfoot", { children: _jsxs("tr", { children: [_jsx("td", { children: _jsxs("b", { children: [rows.length, " customer", rows.length === 1 ? '' : 's'] }) }), _jsx("td", { className: "num", children: tot.strains }), _jsx("td", {}), _jsx("td", {}), _jsx("td", {}), _jsx("td", { className: "num", children: _jsx("b", { children: n0(tot.res) }) }), _jsx("td", { className: "num", children: n0(tot.ship) }), _jsx("td", { className: "num", children: n0(tot.so) }), _jsx("td", { className: "num", children: _jsx("b", { children: n0(tot.left) }) }), _jsxs("td", { className: "num", children: [tot.res > 0 ? Math.round(tot.ship / tot.res * 100) : 0, "%"] })] }) })] }) });
            })(), mode === 'customer' && !focus && byCust.map(c => (_jsx("div", { className: "rescard rescard-ph", children: _jsxs("button", { className: "li setrow", onClick: () => openCust(c.id), children: [_jsxs("div", { className: "grow", children: [_jsx("b", { children: c.name }), _jsxs("div", { className: "muted", children: [c.rs.length, " strain", c.rs.length === 1 ? '' : 's', " \u00B7 ", n0(sum(c.rs, 'shipped')), " shipped", sum(c.rs, 'pending') > 0 ? ` · ${n0(sum(c.rs, 'pending'))} pending` : ''] })] }), _jsxs("div", { className: "num", children: [_jsx("b", { children: n0(sum(c.rs, 'remaining')) }), _jsxs("div", { className: "muted", children: ["of ", n0(sum(c.rs, 'reserved')), " left \u203A"] })] })] }) }, c.id))), mode === 'strain' && future && (() => {
                const tot = [...balY.reduce((m, r) => m.set(r.strain, [...(m.get(r.strain) ?? []), r]), new Map())].sort((a, b) => a[0].localeCompare(b[0]));
                const pend = reqs.filter(r => r.status === 'pending' && r.crop_year === rYear);
                return (_jsxs("table", { className: "restable wide", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Strain" }), _jsx("th", { className: "num", children: "Customers" }), _jsx("th", { className: "num", children: "Reserved" }), _jsx("th", { className: "num", children: "Requested (waiting)" })] }) }), _jsxs("tbody", { children: [tot.map(([st, rs]) => _jsxs("tr", { children: [_jsx("td", { children: st }), _jsx("td", { className: "num", children: rs.length }), _jsx("td", { className: "num", children: _jsx("b", { children: n0(sum(rs, 'reserved')) }) }), _jsx("td", { className: "num", children: n0(pend.filter(q => q.strain.toLowerCase() === st.toLowerCase()).reduce((a, q) => a + Number(q.requested_lbs) - Number(q.current_lbs), 0)) || '' })] }, st)), !tot.length && _jsx("tr", { children: _jsxs("td", { colSpan: 4, className: "muted", children: ["No ", rYear, " reserves yet."] }) })] })] }));
            })(), mode === 'strain' && !future && (_jsxs(_Fragment, { children: [(() => {
                        const rows = byStrain.map(x => ({ ...x, cust: x.rs.filter(r => Number(r.remaining) > 0 || Number(r.reserved) > 0).length }));
                        const v = (x) => ssort.k === 'name' ? x.s.toLowerCase() : ssort.k === 'cust' ? x.cust : x[ssort.k];
                        rows.sort((a, b) => { const p = v(a), q2 = v(b); const d = typeof p === 'string' ? p.localeCompare(q2) : p - q2; return ssort.up ? d : -d; });
                        const tot = rows.reduce((t, x) => ({ have: t.have + x.have, pend: t.pend + x.pend, left: t.left + x.left, free: t.free + x.free }), { have: 0, pend: 0, left: 0, free: 0 });
                        const th = (k, label, num = true) => _jsx("th", { className: `${num ? 'num ' : ''}sortth${ssort.k === k ? ' on' : ''}`, "aria-sort": ssort.k === k ? (ssort.up ? 'ascending' : 'descending') : 'none', children: _jsxs("button", { className: "linkbtn", onClick: () => setSsort(o => ({ k, up: o.k === k ? !o.up : k === 'name' })), children: [label, ssort.k === k ? (ssort.up ? ' ▲' : ' ▼') : ''] }) });
                        return _jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable restbl resstr", children: [_jsx("thead", { children: _jsxs("tr", { children: [th('name', 'Strain', false), th('cust', 'Customers'), th('have', 'On hand'), th('pend', 'Pending'), th('left', 'Res. left'), th('free', 'Free')] }) }), _jsx("tbody", { children: rows.map(x => [
                                            _jsxs("tr", { className: `tap ${sOpen === x.s ? 'open' : ''}`, onClick: () => setSOpen(sOpen === x.s ? null : x.s), children: [_jsxs("td", { children: [_jsx("span", { onClick: e => e.stopPropagation(), children: _jsx(StrainLink, { name: x.s }) }), x.hidden && _jsxs(_Fragment, { children: [" ", _jsx("span", { className: "pill old", children: "hidden" })] })] }), _jsxs("td", { className: "num c-cu", "data-l": "customers ", children: [x.cust || _jsx("span", { className: "muted", children: "0" }), x.cust > 0 && _jsxs("span", { className: "muted", children: [" ", sOpen === x.s ? '▴' : '▾'] })] }), _jsx("td", { className: "num c-st", "data-l": "on hand ", children: n0(x.have) }), _jsx("td", { className: "num c-st", "data-l": "pending ", children: x.pend ? n0(x.pend) : _jsx("span", { className: "muted", children: "0" }) }), _jsx("td", { className: "num c-st", "data-l": "res. left ", children: n0(x.left) }), _jsxs("td", { className: `num c-fr ${x.free < 0 ? 'warn-t' : ''}`, "data-l": "free ", children: [_jsx("b", { children: n0(x.free) }), x.held > 0 && _jsxs("div", { className: "muted small", children: [n0(x.held), " held"] })] })] }, x.s),
                                            sOpen === x.s && x.rs.length > 0 ? _jsx("tr", { className: "resx", children: _jsx("td", { colSpan: 6, children: [...x.rs].sort((a, b) => Number(b.remaining) - Number(a.remaining)).map(r => _jsxs("div", { className: "resxr", children: [_jsx("b", { children: cname(r.customer_id) }), _jsxs("span", { className: "muted small", children: [n0(Number(r.reserved)), " reserved \u00B7 ", n0(Number(r.shipped)), " shipped", Number(r.pending) > 0 ? ` · ${n0(Number(r.pending))} open SO` : ''] }), _jsxs("b", { className: "nw", children: [n0(Number(r.remaining)), " left"] })] }, r.id)) }) }, `${x.s}-c`) : null
                                        ]) }), _jsx("tfoot", { children: _jsxs("tr", { children: [_jsx("td", { children: _jsxs("b", { children: [rows.length, " strain", rows.length === 1 ? '' : 's'] }) }), _jsx("td", {}), _jsx("td", { className: "num", children: _jsx("b", { children: n0(tot.have) }) }), _jsx("td", { className: "num", children: n0(tot.pend) }), _jsx("td", { className: "num", children: n0(tot.left) }), _jsx("td", { className: "num", children: _jsx("b", { children: n0(tot.free) }) })] }) })] }) });
                    })(), _jsx("p", { className: "muted", children: "Free = on hand \u2212 confirmed orders \u2212 approved reserves not yet shipped \u2212 sample holds on confirmed orders. Orders waiting for confirmation and reserve requests don't take anything until they're approved. Customers see Free rounded down to 10 lbs. On hand is what's in the freezers in this app. Negative means more is promised than is in the freezers." })] })), mode === 'menu' && _jsxs(_Fragment, { children: [_jsxs("p", { className: "muted", children: ["Exactly what customers see on the portal: open lbs rounded down to 10, hidden strains left out. ", _jsx("a", { onClick: copyMenu, children: "Copy as text" })] }), _jsx("div", { className: "row toolbar", children: _jsx(CatalogButton, { backend: backend, flash: flash }) }), _jsx(OpenMenu, { backend: backend, reserves: false })] }), mode === 'requests' && _jsx(SampleHolds, { backend: backend, staff: true, showCustomer: true, flash: flash, rev: holdRev, onChanged: load }), mode === 'requests' && _jsx(RequestsPanel, { backend: backend, reqs: reqs.filter(r => !ql || cname(r.customer_id).toLowerCase().includes(ql) || r.strain.toLowerCase().includes(ql)), nums: nums, cname: cname, cur: cur, isAdmin: isAdmin, flash: flash, onDone: load }), mode === 'orders' && (_jsxs(_Fragment, { children: [orders.length === 0 && _jsx("p", { className: "muted", children: "No orders yet. Export sales orders from Roshi and import the file here." }), orders.length > 0 && _jsx("div", { className: "seg ostat", role: "group", "aria-label": "Status", children: ['all', 'submitted', 'pending', 'shipped', 'draft', 'cancelled'].filter(k => k === 'all' || shownOrders.some(o => o.status === k)).map(k => _jsxs("button", { className: ost === k ? 'on' : '', onClick: () => setOst(k), children: [k === 'all' ? 'All' : STATUS_LABEL[k], " ", _jsx("span", { className: "segn", children: k === 'all' ? shownOrders.length : shownOrders.filter(o => o.status === k).length })] }, k)) }), orders.length > 0 && _jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable otable slimmable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: "slim", children: "Order" }), _jsx("th", { className: "slim", children: "Customer" }), _jsx("th", { className: "hide-s", children: "Date" }), _jsx("th", { className: "slim", children: "Status" }), _jsx("th", { className: "hide-s", children: "Fulfillment" }), _jsx("th", { className: "num", children: "Lbs" })] }) }), _jsx("tbody", { children: shownOrders.filter(o => ost === 'all' || o.status === ost).map(o => [
                                        _jsxs("tr", { className: `tap ${open === -o.id ? 'open sel' : ''}`, onClick: () => setOpen(open === -o.id ? null : -o.id), children: [_jsxs("td", { className: "nw slim", children: [_jsx("b", { children: o.so_number ?? `Order #${o.id}` }), o.is_sample && _jsxs(_Fragment, { children: [" ", _jsx("span", { className: "pill sample", children: "Sample" })] })] }), _jsxs("td", { className: "slim", children: [cname(o.customer_id), _jsxs("div", { className: "muted small", children: [o.source === 'portal' ? 'from portal' : '', o.roshi_status && o.roshi_status !== 'Fulfilled' ? `${o.source === 'portal' ? ' · ' : ''}Roshi: ${o.roshi_status}` : ''] })] }), _jsx("td", { className: "hide-s nw", children: fmtDate(o.order_date) }), _jsx("td", { className: "slim", children: _jsx("span", { className: `pill o-${o.status}`, children: STATUS_LABEL[o.status] }) }), _jsx("td", { className: "hide-s", children: o.status === 'pending' && fulfil?.get(o.id) && _jsxs("span", { className: `pill fs-${fulfil.get(o.id).state}`, children: [STATE_LABEL[fulfil.get(o.id).state], fulfil.get(o.id).stop ? ` · ${fulfil.get(o.id).stop.load}` : ''] }) }), _jsx("td", { className: "num", children: _jsx("b", { children: n0(orderLbs(o)) }) })] }, o.id),
                                        // Msg 304: the order opens in the big side card (full-height sheet on a phone) instead of under its row
                                        open === -o.id ? _jsx("tr", { className: "xrow-side", children: _jsx("td", { colSpan: 6, className: "slim", style: { padding: 0, border: 0 }, children: _jsx("div", { className: "scrim", onClick: () => setOpen(null), children: _jsxs("div", { className: "sheet form wide side osheet", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsxs("div", { children: [_jsxs("h2", { children: [o.so_number ?? `Order #${o.id}`, o.is_sample && _jsxs(_Fragment, { children: [" ", _jsx("span", { className: "pill sample", children: "Sample" })] })] }), _jsxs("div", { className: "muted", children: [cname(o.customer_id), " \u00B7 ", fmtDate(o.order_date), " \u00B7 ", _jsx("span", { className: `pill o-${o.status}`, children: STATUS_LABEL[o.status] }), " \u00B7 ", n0(orderLbs(o)), " lbs"] })] }), _jsx("button", { className: "ghost", onClick: () => setOpen(null), children: "\u2715" })] }), _jsxs("div", { className: "rescard odetail", children: [open === -o.id && fulfil?.get(o.id)?.state === 'needs_ok' && _jsx(FillOk, { f: fulfil.get(o.id), backend: backend, flash: flash, onDone: async () => { await load(); await onFulfil?.(); } }), open === -o.id && (o.status === 'pending' || o.status === 'shipped') && onDoc && _jsxs("div", { className: "row wrap orderdocs", children: [_jsx("button", { className: "ghost small", onClick: () => onDoc('so', o.id), children: "Sales order PDF" }), onInvoice && o.status === 'shipped' && _jsx("button", { className: "ghost small", onClick: () => onInvoice(o.id), children: "Invoice" })] }), open === -o.id && o.status !== 'cancelled' && _jsx("div", { className: "row wrap orderdocs", children: _jsx("button", { className: "ghost small", onClick: () => setSampleOf(o), children: o.is_sample ? `Samples: ${o.order_lines.filter(l => l.is_sample).map(l => `${l.strain}${Number(l.hold_lbs ?? 0) > 0 ? ` (holding ${n0(Number(l.hold_lbs))})` : ''}`).join(', ')} · change` : 'Mark sample lines…' }) }), open === -o.id && _jsx(OrderEditor, { backend: backend, o: o, strains: strains, flash: flash, onChanged: load, isAdmin: isAdmin })] })] }) }) }) }, `x-${o.id}`) : null,
                                    ]) })] }) }), _jsx("p", { className: "muted", children: "Import the Roshi sales order export (the same one the menu engine uses) any time. New orders are added and existing ones are updated. Only 2026 fresh frozen lines, plus open 2025 ones, are used." })] })), sampleOf && _jsx(SampleSheet, { backend: backend, o: sampleOf, days: cust.get(sampleOf.customer_id)?.sample_hold_days ?? null, flash: flash, onClose: () => setSampleOf(null), onDone: async () => { setSampleOf(null); setHoldRev(r => r + 1); await load(); } }), adding && _jsx(AddReservesSheet, { backend: backend, customers: customers, flash: flash, preset: adding.preset, onClose: () => setAdding(null), onDone: async (id) => { setAdding(null); await load(); if (mode === 'customer')
                    setOpen(id); } }), edit && (_jsx("div", { className: "scrim", onClick: () => setEdit(null), children: _jsxs("div", { className: "sheet form", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsx("h2", { children: edit.isNew ? 'Add reserve' : 'Edit reserve' }), _jsx("button", { className: "ghost", onClick: () => setEdit(null), children: "\u2715" })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Customer" }), _jsxs(Select, { value: edit.customer_id ?? '', disabled: !edit.isNew, onChange: e => setEdit({ ...edit, customer_id: e.target.value ? Number(e.target.value) : null }), children: [_jsx("option", { value: "", children: "Pick a customer\u2026" }), customers.filter(c => c.active && c.kind === 'external').map(c => _jsx("option", { value: c.id, children: c.name }, c.id))] })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Strain" }), _jsx(ListInput, { list: "reserve-strains", value: edit.strain, disabled: !edit.isNew, onChange: e => setEdit({ ...edit, strain: e.target.value }), placeholder: "Start typing" }), _jsx("datalist", { id: "reserve-strains", children: strains.filter(s => s.active).map(s => _jsx("option", { value: s.name }, s.id)) })] }), _jsxs("div", { className: "field", children: [_jsxs("label", { children: ["Reserved lbs ", _jsx("span", { className: "muted", children: "(the full amount, including what's already shipped)" })] }), _jsx("input", { type: "number", min: "0", step: "10", value: edit.lbs, onChange: e => setEdit({ ...edit, lbs: e.target.value }), autoFocus: !edit.isNew }), edit.strain && _jsxs("span", { className: "muted", children: [n0(onHandOf(edit.strain)), " lbs on hand"] })] }), _jsxs("div", { className: "field", children: [_jsxs("label", { children: ["Reason ", _jsx("span", { className: "muted", children: "(optional; the customer sees this in their Reserve History)" })] }), _jsx("input", { type: "text", value: edit.note ?? '', onChange: e => setEdit({ ...edit, note: e.target.value }), placeholder: "e.g. Strain came in under estimate, so reserves were reduced 10%" })] }), _jsxs("div", { className: "row between", children: [!edit.isNew ? _jsx("button", { className: "ghost", onClick: () => setEdit({ ...edit, lbs: '0' }), children: "Set to 0 (remove)" }) : _jsx("span", {}), _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost", onClick: () => setEdit(null), children: "Cancel" }), _jsx("button", { className: "primary", disabled: edit.customer_id == null || !edit.strain.trim() || edit.lbs === '' || Number(edit.lbs) < 0, onClick: save, children: "Save" })] })] })] }) }))] }));
}
export function DeadlineEdit({ year, value, onSave }) {
    const [v, setV] = useState(value ?? '');
    const [open, setOpen] = useState(false);
    if (!open)
        return _jsx("a", { onClick: () => { setV(value ?? ''); setOpen(true); }, children: "Change deadline" });
    return (_jsxs("span", { className: "row", children: [_jsx("input", { type: "date", value: v, onChange: e => setV(e.target.value) }), _jsx("button", { className: "primary small", onClick: async () => { await onSave(v || null); setOpen(false); }, children: "Save" }), _jsx("button", { className: "ghost small", onClick: () => setOpen(false), children: "Cancel" }), _jsxs("span", { className: "muted", children: ["Blank closes ", year, " requests."] })] }));
}
// read-only lists for the customer portal
export function MyReserves({ backend, year }) {
    const [rows, setRows] = useState(null);
    useEffect(() => { backend.listBalances().then(b => setRows(b.filter(r => !year || r.crop_year == null || r.crop_year === year))).catch(() => setRows([])); }, [year]);
    if (!rows)
        return _jsx("p", { className: "muted", children: "Loading\u2026" });
    if (!rows.length)
        return _jsx("p", { className: "muted", children: "No reserves on file yet." });
    const t = (k) => rows.reduce((a, r) => a + Number(r[k]), 0);
    return (_jsxs("table", { className: "restable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Strain" }), _jsx("th", { className: "num", children: "Reserved" }), _jsx("th", { className: "num", children: "Shipped" }), _jsx("th", { className: "num", children: "Pending" }), _jsx("th", { className: "num", children: "Left" })] }) }), _jsx("tbody", { children: rows.map(r => _jsxs("tr", { children: [_jsx("td", { children: r.strain }), _jsx("td", { className: "num", children: n0(Number(r.reserved)) }), _jsx("td", { className: "num", children: n0(Number(r.shipped)) }), _jsx("td", { className: "num", children: n0(Number(r.pending)) }), _jsx("td", { className: "num", children: _jsx("b", { children: n0(Number(r.remaining)) }) })] }, r.id)) }), _jsx("tfoot", { children: _jsxs("tr", { children: [_jsx("td", { children: _jsx("b", { children: "Total lbs" }) }), _jsx("td", { className: "num", children: n0(t('reserved')) }), _jsx("td", { className: "num", children: n0(t('shipped')) }), _jsx("td", { className: "num", children: n0(t('pending')) }), _jsx("td", { className: "num", children: _jsx("b", { children: n0(t('remaining')) }) })] }) })] }));
}
export function MyOrders({ backend, onChange }) {
    const [rows, setRows] = useState(null);
    const [open, setOpen] = useState(null);
    useEffect(() => { backend.listOrders().then(setRows).catch(() => setRows([])); }, []);
    if (!rows)
        return _jsx("p", { className: "muted", children: "Loading\u2026" });
    if (!rows.length)
        return _jsx("p", { className: "muted", children: "No orders yet." });
    const maxYear = Math.max(...rows.flatMap(o => o.order_lines.map(l => l.crop_year ?? 0)));
    return (_jsx(_Fragment, { children: rows.map(o => (_jsxs("div", { className: "rescard", children: [_jsxs("button", { className: "li setrow", onClick: () => setOpen(open === o.id ? null : o.id), children: [_jsxs("div", { className: "grow", children: [_jsx("b", { children: o.so_number ?? `Order #${o.id}` }), " ", _jsx("span", { className: `pill o-${o.status}`, children: STATUS_LABEL[o.status] }), o.is_sample && _jsx("span", { className: "pill sample", children: "Sample" }), _jsxs("div", { className: "muted", children: [fmtDate(o.order_date), o.shipped_date && o.status === 'shipped' ? ` · shipped ${fmtDate(o.shipped_date)}` : ''] })] }), _jsxs("b", { className: "num", children: [n0(orderLbs(o)), " lbs"] })] }), open === o.id && (_jsxs("table", { className: "restable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Strain" }), _jsx("th", { className: "num", children: "Lbs" }), _jsx("th", { className: "num", children: "$/lb" })] }) }), _jsx("tbody", { children: o.order_lines.map(l => _jsxs("tr", { children: [_jsxs("td", { children: [l.strain, l.is_sample && _jsxs("span", { className: "pill sample", children: ["sample", Number(l.hold_lbs ?? 0) > 0 ? ` · holding ${n0(Number(l.hold_lbs))}` : ''] }), l.product && l.product !== 'fresh_frozen' ? _jsx("span", { className: "pill prod", children: PRODUCT_LABEL[l.product] }) : null, l.crop_year && l.crop_year < maxYear ? _jsxs("span", { className: "pill old", children: [l.crop_year, " crop"] }) : null] }), _jsx("td", { className: "num", children: n0(Number(l.lbs)) }), _jsx("td", { className: "num", children: l.price_per_lb != null ? `$${Number(l.price_per_lb).toFixed(2)}` : '' })] }, l.id)) }), (o.po_number || o.notes || o.status === 'submitted') && _jsx("tfoot", { children: _jsx("tr", { children: _jsxs("td", { colSpan: 3, children: [o.po_number && _jsxs("div", { className: "muted", children: ["PO ", o.po_number] }), o.notes && _jsxs("div", { className: "muted", children: ["\"", o.notes, "\""] }), o.status === 'submitted' && _jsx("button", { className: "ghost small", onClick: async () => {
                                                try {
                                                    await backend.cancelMyOrder(o.id);
                                                    onChange?.(`Order #${o.id} cancelled`);
                                                }
                                                catch (e) {
                                                    onChange?.(String(e.message));
                                                }
                                            }, children: "Cancel this order" })] }) }) })] }))] }, o.id))) }));
}
// staff: confirm / ship / cancel an order, change lbs or price on a line, add a line
function OrderEditor({ backend, o, strains, flash, onChanged, isAdmin }) {
    // Roshi SO # field removed (Aziz 11/4); an SO # already on the order is kept as is
    const so = o.so_number ?? '';
    const [askCancel, setAskCancel] = useState(false);
    const [wantOn, setWantOn] = useState(o.wanted_date ?? '');
    useEffect(() => { setWantOn(o.wanted_date ?? ''); }, [o.wanted_date]);
    const [shipOn, setShipOn] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
    const [edits, setEdits] = useState({});
    const cy = new Date().getFullYear();
    const [add, setAdd] = useState({ strain: '', lbs: '' });
    const [busy, setBusy] = useState(false);
    // Add a strain: what this customer can order right now = open menu + their own reserve left, per strain + crop year
    const [avail, setAvail] = useState(null);
    useEffect(() => {
        if (!(o.status === 'submitted' || o.status === 'pending'))
            return;
        let gone = false;
        // staff see the exact pounds left (211), not the portal's rounded-down-to-10
        const exact = async () => { const { data, error } = await backend.client().rpc('staff_ff_open'); if (error)
            throw error; return (data ?? []).map(r => ({ strain: r.strain, crop_year: r.crop_year, available: r.open_lbs })); };
        Promise.all([exact().catch(() => backend.openMenu().catch(() => [])), backend.listBalances().catch(() => [])]).then(([menu, bal]) => {
            const m = new Map();
            const at = (strain, year) => { const k = `${strain.toLowerCase()}|${year}`; let x = m.get(k); if (!x) {
                x = { k, strain, year, open: 0, res: 0 };
                m.set(k, x);
            } return x; };
            for (const r of menu)
                if (Number(r.available) > 0)
                    at(r.strain, r.crop_year).open += Number(r.available);
            for (const b of bal)
                if (b.customer_id === o.customer_id && Number(b.remaining) > 0)
                    at(b.strain, b.crop_year ?? cy).res += Number(b.remaining);
            if (!gone)
                setAvail([...m.values()].sort((a, b) => a.strain.localeCompare(b.strain) || b.year - a.year));
        });
        return () => { gone = true; };
    }, [o.id, o.status]);
    const addPick = avail?.find(x => x.k === add.strain) ?? null;
    // can't add more than the list shows as available (Aziz 11/4)
    const addMax = addPick ? addPick.open + addPick.res : 0, addOver = !!addPick && Number(add.lbs) > addMax;
    // Edit on a line: up to what it has now + what's still open / in reserve for that strain + crop year (fresh frozen lines)
    const lineMax = (l, year) => {
        if (!avail || (l.product && l.product !== 'fresh_frozen'))
            return Infinity;
        const x = avail.find(a => a.k === `${l.strain.toLowerCase()}|${year}`);
        // a confirmed order's lbs are already off the menu / reserve, so they count back in; a submitted one's aren't held yet
        return (x ? x.open + x.res : 0) + (o.status === 'pending' && year === (l.crop_year ?? cy) ? Number(l.lbs) : 0);
    };
    async function addLine() {
        if (!addPick)
            return;
        if (Number(add.lbs) > addMax)
            throw new Error(`Only ${n0(addMax)} lbs of ${addPick.strain} available`);
        await backend.setOrderLine(o.id, null, addPick.strain, Number(add.lbs), null);
        if (addPick.year !== cy) { // older crop: move the new line to that crop year
            const sb = backend.client();
            const { data } = await sb.from('order_lines').select('id').eq('order_id', o.id).ilike('strain', addPick.strain).order('id', { ascending: false }).limit(1);
            const id = data?.[0]?.id;
            if (id) {
                const { error } = await sb.rpc('set_order_line_year', { p_line: id, p_year: addPick.year });
                if (error)
                    throw new Error(error.message);
            }
        }
    }
    const run = async (f, ok) => {
        setBusy(true);
        try {
            await f();
            flash(ok);
            setEdits({});
            setAdd({ strain: '', lbs: '' });
            onChanged();
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
        finally {
            setBusy(false);
        }
    };
    const open_ = o.status === 'submitted' || o.status === 'pending' || o.status === 'draft';
    const total = o.order_lines.reduce((a, l) => a + Number(l.lbs) * Number(l.price_per_lb ?? 0), 0);
    return (_jsxs("div", { className: "ordered", children: [_jsxs("table", { className: "restable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Strain" }), _jsx("th", { className: "num", children: "Lbs" }), _jsx("th", { className: "num", children: "$/lb" }), open_ && _jsx("th", {})] }) }), _jsx("tbody", { children: o.order_lines.map(l => {
                            const e = edits[l.id];
                            const eMax = e ? lineMax(l, e.year) : Infinity, eOver = !!e && Number(e.lbs) > eMax;
                            return (_jsxs("tr", { children: [_jsxs("td", { children: [l.strain, !e && l.crop_year && l.crop_year !== cy ? _jsxs("span", { className: "pill old", children: [l.crop_year, " crop"] }) : null, e && _jsx(Select, { className: "inline", value: e.year, title: "Crop year", onChange: x => setEdits({ ...edits, [l.id]: { ...e, year: Number(x.target.value) } }), children: [...new Set([cy, cy - 1, cy - 2, l.crop_year ?? cy])].sort((a, b) => b - a).map(y => _jsxs("option", { value: y, children: [y, " crop"] }, y)) }), l.is_sample && _jsxs("span", { className: "pill sample", children: ["sample", Number(l.hold_lbs ?? 0) > 0 ? ` · holding ${n0(Number(l.hold_lbs))}` : ""] }), l.product && l.product !== 'fresh_frozen' ? _jsx("span", { className: "pill prod", children: PRODUCT_LABEL[l.product] }) : null, _jsxs("span", { className: "muted", children: [l.farm ? ` · ${l.farm}` : '', l.crop_year ? ` · ${l.crop_year}` : ''] }), l.price_override && _jsx("div", { className: "muted small", children: "price overridden" })] }), e ? _jsxs(_Fragment, { children: [_jsx("td", { className: "num", children: _jsx("input", { className: "qty", type: "number", step: "10", min: "0", value: e.lbs, onChange: x => setEdits({ ...edits, [l.id]: { ...e, lbs: x.target.value } }) }) }), _jsx("td", { className: "num", children: _jsx("input", { className: "qty", type: "number", step: "0.5", min: "0", value: e.price, onChange: x => setEdits({ ...edits, [l.id]: { ...e, price: x.target.value } }) }) }), _jsxs("td", { className: "num", children: [eOver && _jsxs("div", { className: "small", style: { color: 'var(--bad)', fontWeight: 600, whiteSpace: 'nowrap' }, children: ["Only ", n0(eMax), " lbs available"] }), _jsx("button", { className: "primary small", disabled: busy || eOver, onClick: () => run(async () => {
                                                            if (Number(e.lbs) > lineMax(l, e.year))
                                                                throw new Error(`Only ${n0(lineMax(l, e.year))} lbs of ${l.strain} available`);
                                                            if (Number(e.lbs) > 0 && e.year !== (l.crop_year ?? cy)) {
                                                                const { error } = await backend.client().rpc('set_order_line_year', { p_line: l.id, p_year: e.year });
                                                                if (error)
                                                                    throw new Error(/set_order_line_year|schema cache/i.test(error.message) ? `${error.message} (run 098_crop_years.sql in Supabase)` : error.message);
                                                            }
                                                            await backend.setOrderLine(o.id, l.id, l.strain, Number(e.lbs), e.price === '' ? null : Number(e.price));
                                                        }, Number(e.lbs) === 0 ? 'Line removed' : 'Line saved'), children: "Save" })] })] }) : _jsxs(_Fragment, { children: [_jsx("td", { className: "num", children: n0(Number(l.lbs)) }), _jsx("td", { className: "num", children: l.price_per_lb != null ? `$${Number(l.price_per_lb).toFixed(2)}` : '' }), open_ && _jsx("td", { className: "num", children: _jsx("button", { className: "ghost small", onClick: () => setEdits({ ...edits, [l.id]: { lbs: String(l.lbs), price: l.price_per_lb != null ? String(l.price_per_lb) : '', year: l.crop_year ?? cy } }), children: "Edit" }) })] })] }, l.id));
                        }) }), _jsxs("tfoot", { children: [open_ && _jsxs("tr", { children: [_jsx("td", { children: _jsxs(Select, { value: add.strain, onChange: e => setAdd({ ...add, strain: e.target.value }), disabled: !avail, children: [_jsx("option", { value: "", children: avail ? (avail.length ? 'Add a strain' : 'Nothing on the menu or in reserves') : 'Loading menu…' }), (avail ?? []).map(x => _jsxs("option", { value: x.k, children: [x.strain, x.year !== cy ? ` (${x.year} crop)` : '', " \u00B7 ", n0(x.open + x.res), " lbs available", x.res > 0 ? ` (${n0(x.res)} reserve${x.open > 0 ? ` + ${n0(x.open)} open` : ''})` : ''] }, x.k))] }) }), _jsx("td", { className: "num", children: _jsx("input", { className: "qty", type: "number", step: "10", min: "0", placeholder: "lbs", value: add.lbs, onChange: e => setAdd({ ...add, lbs: e.target.value }) }) }), _jsx("td", { className: "muted small", children: addOver ? _jsxs("span", { style: { color: 'var(--bad)', fontWeight: 600 }, children: ["Only ", n0(addMax), " lbs available"] }) : 'customer price' }), _jsx("td", { className: "num", children: _jsx("button", { className: "ghost small", disabled: busy || !addPick || !(Number(add.lbs) > 0) || addOver, onClick: () => run(addLine, 'Line added'), children: "Add" }) })] }), _jsx("tr", { children: _jsxs("td", { colSpan: open_ ? 4 : 3, children: [_jsxs("div", { className: "muted", children: [total > 0 && _jsxs(_Fragment, { children: ["Total $", total.toLocaleString(undefined, { maximumFractionDigits: 0 }), " \u00B7 "] }), o.po_number && _jsxs(_Fragment, { children: ["PO ", o.po_number, " \u00B7 "] }), o.wanted_date && !open_ && _jsxs(_Fragment, { children: ["requested delivery ", fmtDate(o.wanted_date), " \u00B7 "] }), o.placed_by && _jsxs(_Fragment, { children: ["placed by ", o.placed_by] }), o.confirmed_by && _jsxs(_Fragment, { children: [" \u00B7 confirmed by ", o.confirmed_by] })] }), o.notes && _jsxs("div", { className: "muted", children: ["\"", o.notes, "\""] })] }) })] })] }), open_ && (_jsxs("div", { className: "row reqact", children: [o.status === 'submitted' && _jsx("button", { className: "primary small", disabled: busy, onClick: () => run(() => backend.setOrderStatus(o.id, 'pending', so, ''), 'Order confirmed'), children: "Confirm" }), o.status === 'draft' && (isAdmin
                        ? _jsx("button", { className: "primary small", disabled: busy, onClick: () => run(() => backend.setOrderStatus(o.id, 'pending', so, ''), 'Draft confirmed'), children: "Confirm order" })
                        : _jsx("span", { className: "muted small", children: "Draft: a Sales Admin confirms it. It holds nothing until then." })), _jsxs("label", { className: "row muted small", style: { gap: 6 }, children: ["Requested Delivery Date", _jsx("input", { type: "date", value: wantOn, disabled: busy, style: { maxWidth: 150 }, "aria-label": "Requested Delivery Date", onChange: e => setWantOn(e.target.value), onBlur: () => { const v = wantOn || null; if (v === (o.wanted_date ?? null) || (v && v < '2020-01-01')) {
                                    setWantOn(o.wanted_date ?? '');
                                    return;
                                } run(async () => { const { error } = await backend.client().rpc('set_order_wanted', { p_order: o.id, p_date: v }); if (error)
                                    throw new Error(/set_order_wanted|schema cache/i.test(error.message) ? `${error.message} (run 209_order_wanted_date.sql in Supabase)` : error.message); }, v ? `Requested delivery ${fmtDate(v)}` : 'Requested delivery cleared'); } })] }), o.status !== 'draft' && _jsxs("span", { className: "row", children: [_jsx("input", { type: "date", value: shipOn, onChange: e => setShipOn(e.target.value), "aria-label": "Shipped on", title: "The day it actually shipped", style: { maxWidth: 150 } }), _jsx("button", { className: "ghost small", disabled: busy, onClick: () => run(() => backend.setOrderStatus(o.id, 'shipped', so, '', shipOn || null), 'Marked shipped'), children: "Mark shipped" })] })] })), open_ && _jsx("div", { className: "row ocancel", children: _jsx("button", { className: "ghost danger", disabled: busy, onClick: () => setAskCancel(true), children: "Cancel order\u2026" }) }), askCancel && _jsx("div", { className: "scrim confirm-scrim", onClick: () => setAskCancel(false), children: _jsxs("div", { className: "sheet form confirm", role: "dialog", "aria-modal": "true", onClick: e => e.stopPropagation(), children: [_jsxs("h2", { children: ["Cancel ", o.so_number ?? `order #${o.id}`, "?"] }), _jsx("p", { className: "muted", children: "The order is marked Cancelled. If it's on a load that hasn't left, it comes off the load and its pallets go back to Needs a spot. This can't be undone from here." }), _jsxs("div", { className: "row between fbar", children: [_jsx("button", { className: "ghost", onClick: () => setAskCancel(false), children: "Keep the order" }), _jsx("button", { className: "primary danger", disabled: busy, onClick: () => { setAskCancel(false); run(() => backend.setOrderStatus(o.id, 'cancelled', so, ''), 'Order cancelled'); }, children: "Cancel order" })] })] }) })] }));
}
/** Sales OKs what Distribution assigned when it isn't exactly what was ordered */
export function FillOk({ f, backend, flash, onDone }) {
    const [busy, setBusy] = useState(false);
    const diffs = f.lines.map(l => ({ l, got: l.picks.reduce((a, p) => a + Number(p.lbs), 0) })).filter(x => (x.got > 0 || x.l.cant_fill) && x.got !== Number(x.l.lbs));
    return (_jsxs("div", { className: "warnbox fillok", children: [_jsx("b", { children: "Distribution assigned different amounts." }), " OK them and the order lines change to match (and bill from there).", _jsxs("table", { className: "restable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Strain" }), _jsx("th", { className: "num", children: "Ordered" }), _jsx("th", { className: "num", children: "Assigned" }), _jsx("th", { className: "num", children: "Diff" })] }) }), _jsx("tbody", { children: diffs.map(({ l, got }) => _jsxs("tr", { children: [_jsx("td", { children: l.strain }), _jsx("td", { className: "num", children: n0(Number(l.lbs)) }), _jsx("td", { className: "num", children: _jsx("b", { children: l.cant_fill && !got ? "can't fill" : n0(got) }) }), _jsxs("td", { className: `num ${got > Number(l.lbs) ? 'up' : 'down'}`, children: [got > Number(l.lbs) ? '+' : '', n0(got - Number(l.lbs))] })] }, l.id)) })] }), _jsxs("div", { className: "row", children: [_jsx("button", { className: "primary small", disabled: busy, onClick: async () => {
                            setBusy(true);
                            try {
                                const n = await backend.approveFill(f.id);
                                await onDone();
                                flash(`${n} line${n === 1 ? '' : 's'} OK'd`);
                            }
                            catch (e) {
                                flash(String(e.message ?? e), true);
                            }
                            finally {
                                setBusy(false);
                            }
                        }, children: "OK these amounts" }), _jsx("span", { className: "muted", children: "Or ask Distribution to change the pallets." })] })] }));
}
/** RES-10: one customer's reserves as a sortable table. Sales Admins type a new total in Reserved and save them all at once.
 *  Same limits as Add reserves: not under shipped + open SOs, up by at most what's open on the menu. */
function CustReserves({ backend, cid, name, rs, nums, year, cur, isAdmin, flash, onSaved, onAdd }) {
    const [srt, setSrt] = useState({ k: 'name', up: true });
    const [ed, setEd] = useState({});
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const openOf = (s) => { const m = nums.find(x => x.crop_year === year && x.on_menu && x.strain.toLowerCase() === s.toLowerCase()); return m ? Math.max(0, Math.floor(Number(m.free))) : 0; };
    const rows = rs.map(r => {
        const res = Number(r.reserved), ship = Number(r.shipped), so = Number(r.pending);
        return { r, key: r.strain.toLowerCase(), res, ship, so, left: Math.max(0, Number(r.remaining)), open: openOf(r.strain), pct: res > 0 ? ship / res : 0 };
    });
    const minOf = (x) => x.ship + x.so;
    const maxOf = (x) => Math.max(x.res, x.ship + x.so) + x.open;
    const changes = rows.filter(x => ed[x.key] !== undefined && ed[x.key] !== '' && Number(ed[x.key]) !== x.res).map(x => {
        const to = Number(ed[x.key]);
        const err = !Number.isFinite(to) || to < 0 ? 'not a number' : to < minOf(x) ? `can't go under ${n0(minOf(x))} (shipped + open SOs)`
            : to > maxOf(x) ? `${n0(maxOf(x))} is the most (${n0(Math.max(x.res, x.ship + x.so))} theirs + ${n0(x.open)} open)` : '';
        return { x, to, d: to - x.res, err };
    });
    const bad = changes.some(c => c.err);
    const v = (x) => srt.k === 'name' ? x.r.strain.toLowerCase() : x[srt.k];
    rows.sort((a, b) => { const p = v(a), q = v(b); const d = typeof p === 'string' ? p.localeCompare(q) : p - q; return srt.up ? d : -d; });
    const tot = rows.reduce((t, x) => ({ res: t.res + x.res, ship: t.ship + x.ship, so: t.so + x.so, left: t.left + x.left }), { res: 0, ship: 0, so: 0, left: 0 });
    const dTot = changes.reduce((a, c) => a + c.d, 0);
    const th = (k, label, num = true, title) => _jsx("th", { className: `${num ? 'num ' : ''}sortth${srt.k === k ? ' on' : ''}`, title: title, "aria-sort": srt.k === k ? (srt.up ? 'ascending' : 'descending') : 'none', children: _jsxs("button", { className: "linkbtn", onClick: () => setSrt(o => ({ k, up: o.k === k ? !o.up : k === 'name' })), children: [label, srt.k === k ? (srt.up ? ' ▲' : ' ▼') : ''] }) });
    async function save() {
        if (!changes.length || bad)
            return;
        setBusy(true);
        let done = 0;
        try {
            for (const c of changes) {
                await backend.setReserve(cid, c.x.r.strain, c.to, note.trim() || undefined, year !== cur ? year : undefined);
                done++;
            }
            flash(`${done} reserve${done === 1 ? '' : 's'} saved for ${name}`);
            setEd({});
            setNote('');
            await onSaved();
        }
        catch (e) {
            flash(`${done ? `${done} saved, then: ` : ''}${String(e.message ?? e)}`, true);
            if (done)
                await onSaved();
        }
        finally {
            setBusy(false);
        }
    }
    return _jsxs(_Fragment, { children: [_jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable restbl rescust", children: [_jsx("thead", { children: _jsxs("tr", { children: [th('name', 'Strain', false), th('res', isAdmin ? 'Reserved (new total)' : 'Reserved'), th('ship', 'Shipped'), th('so', 'Open SO', true, 'On confirmed open sales orders; these lbs count against the reserve'), th('left', 'Left'), th('open', 'Open menu', true, 'Free on the menu: how much the reserve can go up'), th('pct', 'Shipped %')] }) }), _jsx("tbody", { children: rows.map(x => {
                                const c = changes.find(z => z.x.key === x.key);
                                return _jsxs("tr", { className: c ? (c.err ? 'bad' : 'on') : '', children: [_jsxs("td", { className: "c-n", children: [_jsx(StrainLink, { name: x.r.strain }), c?.err && _jsx("div", { className: "warn-t small", children: c.err }), Number(x.r.rejected ?? 0) > 0 && _jsxs("div", { className: "small warn-t", title: "Rejected at delivery and back on this reserve. Lower the reserve if they shouldn't get these lbs back.", children: [n0(Number(x.r.rejected)), " rejected, back on reserve"] })] }), _jsxs("td", { className: "num c-r", "data-l": "reserved ", children: [isAdmin
                                                    ? _jsx("input", { className: `qty ${c?.err ? 'bad' : ''}`, type: "number", step: "10", min: "0", inputMode: "numeric", "aria-label": `Reserve total for ${x.r.strain}`, value: ed[x.key] ?? String(x.res), onChange: e => setEd(m => ({ ...m, [x.key]: e.target.value })), onFocus: e => e.target.select() })
                                                    : n0(x.res), c && !c.err && _jsxs("div", { className: `small ${c.d > 0 ? 'ok-t' : 'warn-t'}`, children: [c.d > 0 ? '+' : '', n0(c.d)] })] }), _jsx("td", { className: "num", "data-l": "shipped ", children: n0(x.ship) }), _jsx("td", { className: "num", "data-l": "open SO ", children: x.so > 0 ? n0(x.so) : _jsx("span", { className: "muted", children: "0" }) }), _jsx("td", { className: "num c-lf", "data-l": "left ", children: _jsx("b", { children: c && !c.err ? n0(Math.max(0, c.to - x.ship - x.so)) : n0(x.left) }) }), _jsx("td", { className: "num muted", "data-l": "open ", children: n0(x.open) }), _jsxs("td", { className: "num c-pc", "data-l": "", children: [_jsx("span", { className: "respct", children: _jsx("i", { style: { width: `${Math.min(100, Math.round(x.pct * 100))}%` } }) }), " ", Math.round(x.pct * 100), "%"] })] }, x.r.id);
                            }) }), _jsx("tfoot", { children: _jsxs("tr", { children: [_jsx("td", { children: _jsxs("b", { children: [rows.length, " strain", rows.length === 1 ? '' : 's'] }) }), _jsxs("td", { className: "num", children: [_jsx("b", { children: n0(tot.res + dTot) }), dTot !== 0 && _jsxs("div", { className: "small muted", children: ["was ", n0(tot.res)] })] }), _jsx("td", { className: "num", children: n0(tot.ship) }), _jsx("td", { className: "num", children: n0(tot.so) }), _jsx("td", { className: "num", children: _jsx("b", { children: n0(tot.left + changes.filter(c => !c.err).reduce((a, c) => a + Math.max(0, c.to - c.x.ship - c.x.so) - c.x.left, 0)) }) }), _jsx("td", {}), _jsxs("td", { className: "num", children: [tot.res > 0 ? Math.round(tot.ship / tot.res * 100) : 0, "%"] })] }) })] }) }), isAdmin && changes.length > 0 && _jsxs("div", { className: "rescsave", children: [_jsxs("div", { className: "grow", children: [_jsxs("b", { children: [changes.length, " change", changes.length === 1 ? '' : 's'] }), " ", _jsxs("span", { className: "muted", children: ["\u00B7 ", dTot > 0 ? '+' : '', n0(dTot), " lbs \u00B7 new total ", n0(tot.res + dTot)] })] }), _jsx("input", { type: "text", placeholder: "Reason (optional, they see it in Reserve History)", value: note, onChange: e => setNote(e.target.value), "aria-label": "Reason" }), _jsx("button", { className: "ghost", disabled: busy, onClick: () => { setEd({}); setNote(''); }, children: "Cancel" }), _jsx("button", { className: "primary", disabled: busy || bad, onClick: save, children: busy ? 'Saving…' : bad ? 'Fix the red lines' : `Save ${changes.length}` })] }), isAdmin && _jsxs("div", { className: "row rescfoot", children: [_jsx("span", { className: "muted small", children: "Type the new total in Reserved (it includes what's shipped and on open SOs). 0 removes a reserve that has nothing shipped or on an order." }), _jsxs("button", { className: "ghost small", onClick: onAdd, children: ["+ Add strains for ", name] })] })] });
}
