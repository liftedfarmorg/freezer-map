import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
const n0 = (x) => Math.round(x).toLocaleString();
const when = (s) => new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
/** Sales > Requests: waiting requests grouped by what the customer sent together; Admins approve or decline
 *  several at once and can approve a different amount than asked. */
export function RequestsPanel({ backend, reqs, nums, cname, cur, isAdmin, flash, onDone }) {
    const pending = reqs.filter(r => r.status === 'pending');
    const groups = new Map();
    for (const r of pending) {
        const k = r.batch_id ?? `one-${r.id}`;
        (groups.get(k) ?? groups.set(k, []).get(k)).push(r);
    }
    const done = reqs.filter(r => r.status !== 'pending').slice(0, 80);
    return (_jsxs(_Fragment, { children: [!isAdmin && _jsx("p", { className: "muted", children: "Only an Admin can approve reserve changes." }), groups.size === 0 && _jsx("p", { className: "muted", children: "No requests waiting." }), [...groups.entries()].map(([k, rs]) => _jsx(Batch, { backend: backend, rs: rs, nums: nums, cname: cname, cur: cur, isAdmin: isAdmin, flash: flash, onDone: onDone }, k)), done.length > 0 && _jsxs(_Fragment, { children: [_jsx("h3", { className: "grouph", children: "Decided" }), _jsxs("table", { className: "restable wide", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Customer" }), _jsx("th", { children: "Strain" }), _jsx("th", { className: "num", children: "Asked" }), _jsx("th", { className: "num", children: "Result" }), _jsx("th", { children: "By" })] }) }), _jsx("tbody", { children: done.map(r => (_jsxs("tr", { children: [_jsxs("td", { children: [cname(r.customer_id), r.crop_year && r.crop_year !== cur ? _jsx("span", { className: "pill old", children: r.crop_year }) : null, _jsx("div", { className: "muted small", children: when(r.requested_at) })] }), _jsx("td", { children: r.strain }), _jsxs("td", { className: "num", children: [n0(Number(r.current_lbs)), " \u2192 ", n0(Number(r.requested_lbs))] }), _jsxs("td", { className: "num", children: [_jsx("span", { className: `pill r-${r.status}`, children: r.status }), r.status === 'approved' && r.approved_lbs != null && Number(r.approved_lbs) !== Number(r.requested_lbs) && _jsxs("div", { className: "small", children: ["at ", n0(Number(r.approved_lbs))] })] }), _jsxs("td", { className: "small", children: [r.decided_by?.split('@')[0], r.decision_note && _jsxs("div", { className: "muted", children: ["\"", r.decision_note, "\""] })] })] }, r.id))) })] })] })] }));
}
function Batch({ backend, rs, nums, cname, cur, isAdmin, flash, onDone }) {
    const first = rs[0];
    const [pick, setPick] = useState(() => new Set(rs.map(r => r.id)));
    const [amt, setAmt] = useState(() => Object.fromEntries(rs.map(r => [r.id, String(Number(r.requested_lbs))])));
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const yr = first.crop_year ?? cur;
    const sorted = [...rs].sort((a, b) => a.strain.localeCompare(b.strain));
    const tog = (id) => setPick(s => { const n = new Set(s); if (n.has(id))
        n.delete(id);
    else
        n.add(id); return n; });
    const all = pick.size === rs.length;
    async function go(approve) {
        const ids = sorted.filter(r => pick.has(r.id));
        if (!ids.length) {
            flash('Tick the lines first', true);
            return;
        }
        const bad = ids.find(r => approve && !(Number(amt[r.id]) >= 0));
        if (bad) {
            flash(`${bad.strain}: enter an amount`, true);
            return;
        }
        setBusy(true);
        try {
            const res = await backend.decideRequests(ids.map(r => ({ id: r.id, approve, lbs: approve ? Number(amt[r.id]) : null })), note);
            await onDone();
            flash(approve ? `Approved ${res.approved}. Reserves updated.` : `Declined ${res.declined}`);
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs("div", { className: "rescard reqbatch", children: [_jsxs("div", { className: "reqhead", children: [_jsxs("div", { children: [_jsx("b", { children: cname(first.customer_id) }), " ", _jsxs("span", { className: "pill old", children: [yr, " crop"] }), " ", _jsxs("span", { className: "pill r-pending", children: [rs.length, " waiting"] })] }), _jsxs("div", { className: "muted", children: [first.requested_by, " \u00B7 ", when(first.requested_at), first.note && _jsxs(_Fragment, { children: [" \u00B7 \"", first.note, "\""] })] })] }), _jsxs("table", { className: "restable", children: [_jsx("thead", { children: _jsxs("tr", { children: [isAdmin && _jsx("th", { className: "selcol", children: _jsx("input", { type: "checkbox", checked: all, onChange: () => setPick(all ? new Set() : new Set(rs.map(r => r.id))), "aria-label": "Pick all" }) }), _jsx("th", { children: "Strain" }), _jsx("th", { className: "num", children: "Now" }), _jsx("th", { className: "num", children: "Asked" }), isAdmin && _jsx("th", { className: "num", children: "Approve at" }), yr === cur && _jsx("th", { className: "num", children: "Free" })] }) }), _jsx("tbody", { children: sorted.map(r => {
                            const d = Number(r.requested_lbs) - Number(r.current_lbs);
                            const m = yr === cur ? nums.find(x => x.strain.toLowerCase() === r.strain.toLowerCase() && x.crop_year === cur) : undefined;
                            return (_jsxs("tr", { className: pick.has(r.id) ? '' : 'unpicked', children: [isAdmin && _jsx("td", { className: "selcol", children: _jsx("input", { type: "checkbox", checked: pick.has(r.id), onChange: () => tog(r.id), "aria-label": `Pick ${r.strain}` }) }), _jsx("td", { children: r.strain }), _jsx("td", { className: "num", children: n0(Number(r.current_lbs)) }), _jsxs("td", { className: "num", children: [_jsx("b", { children: n0(Number(r.requested_lbs)) }), " ", _jsxs("span", { className: d > 0 ? 'up' : 'down', children: ["(", d > 0 ? '+' : '', n0(d), ")"] })] }), isAdmin && _jsx("td", { className: "num", children: _jsx("input", { className: "qty", type: "number", min: "0", step: "10", value: amt[r.id] ?? '', onChange: e => setAmt({ ...amt, [r.id]: e.target.value }), "aria-label": `Approve ${r.strain} at` }) }), yr === cur && _jsx("td", { className: "num", children: m ? n0(Number(m.free)) : '' })] }, r.id));
                        }) })] }), isAdmin && (_jsxs("div", { className: "row reqact", children: [_jsx("input", { placeholder: "Note to the customer (optional)", value: note, onChange: e => setNote(e.target.value) }), _jsxs("button", { className: "ghost small", disabled: busy || !pick.size, onClick: () => go(false), children: ["Decline ", pick.size] }), _jsxs("button", { className: "primary small", disabled: busy || !pick.size, onClick: () => go(true), children: ["Approve ", pick.size] })] }))] }));
}
