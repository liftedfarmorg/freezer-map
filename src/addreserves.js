import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// Msg RES-1: Sales > Reserves > + Add reserves, a side card like New sales order. Pick a customer (contract, monthly min,
// $/lb, deadline, waiting requests show as chips), then the shared reserve editor (reseditor.tsx, RES-11) that works like
// the portal's Reserves & Menu: filters, +/− step, Change reserve on every row, Save runs set_reserve for each change.
import { useEffect, useState } from 'react';
import { ReserveEditor } from './reseditor';
const n0 = (v) => Math.round(v).toLocaleString();
export function AddReservesSheet({ backend, customers, flash, onClose, onDone, preset }) {
    const [cust, setCust] = useState(preset ?? null);
    const [cq, setCq] = useState('');
    const [ys, setYs] = useState(null);
    const [year, setYear] = useState(null);
    const [terms, setTerms] = useState([]);
    const [reqs, setReqs] = useState([]);
    useEffect(() => {
        backend.reserveYears().then(setYs).catch(() => { });
        backend.listTerms().then(setTerms).catch(() => { });
        backend.listRequests().then(setReqs).catch(() => { });
    }, []);
    const cur = ys?.current ?? new Date().getFullYear();
    const yr = year ?? cur;
    const years = [...new Set([cur, ...(ys?.years ?? []).map(y => y.year)])].sort((a, b) => a - b);
    const deadline = ys?.years.find(y => y.year === yr)?.deadline ?? null;
    const c = customers.find(x => x.id === cust);
    const t = terms.find(x => x.customer_id === cust && x.crop_year === yr);
    const contractLbs = t?.contract_lbs ?? (yr === cur ? c?.contract_lbs ?? null : null);
    const pend = reqs.filter(r => r.customer_id === cust && r.status === 'pending' && (r.crop_year ?? cur) === yr);
    const cql = cq.trim().toLowerCase();
    const custOpts = customers.filter(x => x.active && x.kind === 'external' && (!cql || x.name.toLowerCase().includes(cql))).sort((a, b) => Number(!!b.reserves_enabled) - Number(!!a.reserves_enabled) || a.name.localeCompare(b.name)).slice(0, 12);
    return (_jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: "sheet form neworder side no2 addres one", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsx("h2", { children: "Add reserves" }), _jsx("button", { className: "ghost", onClick: onClose, children: "\u2715" })] }), _jsx("div", { className: "no-body", children: _jsxs("div", { className: "no-main", children: [_jsx("section", { className: "no-sec", children: !c ? _jsxs(_Fragment, { children: [_jsx("div", { className: "no-h", children: "1 \u00B7 Customer" }), _jsx("input", { className: "search", type: "search", autoFocus: true, placeholder: "Type a customer", value: cq, onChange: e => setCq(e.target.value), "aria-label": "Customer" }), _jsx("div", { className: "no-copts", children: custOpts.map(x => _jsxs("button", { onClick: () => { setCust(x.id); setCq(''); }, children: [_jsx("b", { children: x.name }), _jsx("span", { className: "muted small", children: x.reserves_enabled ? 'reserves on' : 'menu only (reserves off)' })] }, x.id)) })] }) : _jsxs(_Fragment, { children: [_jsxs("div", { className: "row no-cust", children: [_jsxs("div", { className: "grow", children: [_jsx("div", { className: "no-cname", children: c.name }), _jsxs("div", { className: "muted small", children: [yr, " crop", c.reserves_enabled ? '' : ' · reserves off'] })] }), !preset && _jsx("button", { className: "ghost small", onClick: () => setCust(null), children: "Change" })] }), years.length > 1 && _jsx("div", { className: "seg", role: "group", "aria-label": "Crop year", children: years.map(y => _jsx("button", { className: y === yr ? 'on' : '', onClick: () => setYear(y), children: y }, y)) }), !c.reserves_enabled && _jsxs("div", { className: "warnbox", children: [c.name, " is menu only: reserves are off for them. Turn them on in Sales \u203A Customers if they're a contract customer."] }), _jsxs("div", { className: "no-chips", children: [contractLbs != null && _jsxs("span", { className: "pill", children: ["Contract ", n0(contractLbs), " lbs"] }), t?.monthly_min_lbs != null && _jsxs("span", { className: "pill", children: [n0(t.monthly_min_lbs), " lbs/month min"] }), (t?.price_per_lb ?? c.price_per_lb) != null && _jsxs("span", { className: "pill", children: ["$", Number(t?.price_per_lb ?? c.price_per_lb).toFixed(2), "/lb"] }), deadline && yr !== cur && _jsxs("span", { className: "pill", children: ["Requests due ", new Date(deadline + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })] }), pend.length > 0 && _jsxs("span", { className: "pill warnp", children: [pend.length, " reserve request", pend.length === 1 ? '' : 's', " waiting"] })] })] }) }), c && _jsx(ReserveEditor, { backend: backend, cid: c.id, cname: c.name, year: yr, cur: cur, flash: flash, onSaved: () => onDone(c.id) }, `${c.id}-${yr}`)] }) })] }) }));
}
