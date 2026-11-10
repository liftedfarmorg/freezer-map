import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
// Sample holds (feedback #3, 061): a sample order holds product for that customer while the sample is on its way
// and for N days after it ships (Settings › Customers › Sample hold days, default 10). What they order of it afterwards
// uses the hold up. Sales can release a hold or change the date it runs until.
const n0 = (x) => Math.round(Number(x ?? 0)).toLocaleString();
const d = (iso) => (iso ? new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' }) : '');
const STATE_L = { submitted: 'Starts when the order is confirmed', waiting: 'Holding until the sample ships', active: 'Holding', expired: 'Expired', used: 'Ordered', released: 'Released', cancelled: 'Cancelled' };
const live = (h) => h.state === 'waiting' || h.state === 'active';
export const holdLine = (h) => h.state === 'waiting' ? 'holding, clock starts when the sample ships' : h.state === 'active' ? `held until ${d(h.until)}` : STATE_L[h.state].toLowerCase();
/** a customer's (or everyone's) sample holds. Staff can release or extend. */
export function SampleHolds({ backend, customerId, staff, flash, title = 'Sample holds', showCustomer, rev = 0, onChanged }) {
    const [rows, setRows] = useState(null);
    const [past, setPast] = useState(false);
    const [ext, setExt] = useState(null);
    const load = () => backend.sampleHolds(customerId, past).then(setRows).catch(() => setRows([]));
    useEffect(() => { load(); }, [customerId, past, rev]);
    if (!rows)
        return null;
    const shown = rows.filter(h => past || live(h) || h.state === 'submitted' || (h.until && h.until >= new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)));
    if (!shown.length && !staff)
        return null;
    async function act(h, release, until) {
        try {
            await backend.setSampleHold(h.line_id, release, until ?? null);
            flash?.(release ? `${h.strain} hold released` : `${h.strain} held until ${d(until)}`);
            setExt(null);
            await load();
            onChanged?.();
        }
        catch (e) {
            flash?.(String(e.message ?? e), true);
        }
    }
    return (_jsxs("div", { className: "sholds", children: [_jsxs("h3", { children: [title, " ", staff && _jsxs("label", { className: "check small-check sh-past", children: [_jsx("input", { type: "checkbox", checked: past, onChange: e => setPast(e.target.checked) }), " Show old ones"] })] }), !shown.length ? _jsx("p", { className: "muted", children: "No sample holds right now. Check \"Sample order\" on an order to hold product while the customer tries it." }) : (_jsx("div", { className: "cwrap", children: _jsxs("table", { className: "restable wide", children: [_jsx("thead", { children: _jsxs("tr", { children: [showCustomer && _jsx("th", { children: "Customer" }), _jsx("th", { children: "Strain" }), _jsx("th", { className: "num", children: "Held" }), _jsx("th", { children: "Status" }), staff && _jsx("th", { className: "hide-s", children: "Sample" }), staff && _jsx("th", {})] }) }), _jsx("tbody", { children: shown.map(h => _jsxs("tr", { className: live(h) ? '' : 'muted', children: [showCustomer && _jsx("td", { children: h.customer }), _jsxs("td", { children: [h.strain, h.crop_year !== new Date().getFullYear() && _jsxs("span", { className: "pill old", children: [h.crop_year, " crop"] })] }), _jsxs("td", { className: "num", children: [_jsx("b", { children: n0(live(h) ? h.remaining : h.hold_lbs) }), h.used_lbs > 0 && _jsxs("div", { className: "muted small", children: [n0(h.used_lbs), " of ", n0(h.hold_lbs), " ordered"] })] }), _jsxs("td", { children: [_jsx("span", { className: `pill ${h.state === 'active' ? 'cp-ok' : h.state === 'waiting' || h.state === 'submitted' ? 'cp-warn' : 'cp-mute'}`, children: STATE_L[h.state] }), h.state === 'active' && _jsxs("div", { className: "muted small", children: ["until ", d(h.until)] })] }), staff && _jsxs("td", { className: "hide-s small", children: [h.so_number ?? `#${h.order_id}`, h.shipped_on ? ` · shipped ${d(h.shipped_on)}` : ''] }), staff && _jsx("td", { className: "nowrap", children: ext?.id === h.line_id
                                            ? _jsxs("span", { className: "row", children: [_jsx("input", { type: "date", value: ext.until, onChange: e => setExt({ id: h.line_id, until: e.target.value }) }), _jsx("button", { className: "primary small", disabled: !ext.until, onClick: () => act(h, false, ext.until), children: "Save" }), _jsx("button", { className: "ghost small", onClick: () => setExt(null), children: "\u2715" })] })
                                            : _jsxs(_Fragment, { children: [(live(h) || h.state === 'expired' || h.state === 'released') && _jsx("button", { className: "ghost small", onClick: () => setExt({ id: h.line_id, until: h.until ?? new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) }), children: live(h) ? 'Extend' : 'Hold again' }), live(h) && _jsx("button", { className: "ghost small", onClick: () => { if (confirm(`Release the ${n0(h.remaining)} lb ${h.strain} hold for ${h.customer}? It goes back on the open menu.`))
                                                            act(h, true); }, children: "Release" })] }) })] }, h.line_id)) })] }) }))] }));
}
/** Sales: mark which lines of an order are samples and how much each holds */
export function SampleSheet({ backend, o, days, flash, onClose, onDone }) {
    const lines = o.order_lines.filter(l => (l.product ?? 'fresh_frozen') === 'fresh_frozen');
    const [smp, setSmp] = useState(() => Object.fromEntries(lines.map(l => [l.id, !!l.is_sample])));
    const [hold, setHold] = useState(() => Object.fromEntries(lines.map(l => [l.id, l.hold_lbs ? String(l.hold_lbs) : ''])));
    const [busy, setBusy] = useState(false);
    async function save() {
        setBusy(true);
        try {
            await backend.setOrderSample(o.id, false, lines.map(l => ({ line_id: l.id, sample: !!smp[l.id], hold_lbs: smp[l.id] && hold[l.id] !== '' ? Number(hold[l.id]) : null })));
            flash('Sample lines saved');
            onDone();
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: "sheet form", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsxs("h2", { children: ["Samples \u00B7 ", o.so_number ?? `#${o.id}`] }), _jsx("button", { className: "ghost", onClick: onClose, children: "\u2715" })] }), _jsxs("p", { className: "muted", children: ["Check the lines that are samples and how much to hold for them. The hold comes off the open menu once the order is confirmed, lasts until ", days ?? 10, " days after the order ships (customer setting), and goes away if the order is cancelled."] }), _jsxs("table", { className: "restable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Strain" }), _jsx("th", { className: "num", children: "Lbs" }), _jsx("th", { className: "ctr", children: "Sample" }), _jsx("th", { className: "num", children: "Hold lbs" })] }) }), _jsx("tbody", { children: lines.map(l => _jsxs("tr", { children: [_jsx("td", { children: l.strain }), _jsx("td", { className: "num", children: n0(l.lbs) }), _jsx("td", { className: "ctr", children: _jsx("input", { type: "checkbox", checked: !!smp[l.id], onChange: e => setSmp({ ...smp, [l.id]: e.target.checked }) }) }), _jsx("td", { className: "num", children: smp[l.id] && _jsx("input", { className: "qty", type: "number", min: "0", step: "10", value: hold[l.id] ?? '', placeholder: "0", onChange: e => setHold({ ...hold, [l.id]: e.target.value }) }) })] }, l.id)) })] }), _jsxs("div", { className: "row between csave", children: [_jsx("span", {}), _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost", onClick: onClose, children: "Cancel" }), _jsx("button", { className: "primary", disabled: busy, onClick: save, children: "Save" })] })] })] }) }));
}
