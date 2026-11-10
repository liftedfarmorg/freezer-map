import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { loadMenuInfo, yieldRange } from './strains';
import { useEffect, useState } from 'react';
const n0 = (x) => Math.round(Number(x ?? 0)).toLocaleString();
const STATUS = { pending: 'Waiting for approval', approved: 'Approved', declined: 'Declined', cancelled: 'Cancelled' };
// Customer portal: live open menu + reserve change requests
export function OpenMenu({ backend, reserves }) {
    const [rows, setRows] = useState(null);
    const [reqs, setReqs] = useState([]);
    const [err, setErr] = useState(null);
    const [mine, setMine] = useState(false);
    const [q, setQ] = useState('');
    const [pick, setPick] = useState(null);
    const [msg, setMsg] = useState(null);
    const [info, setInfo] = useState(new Map());
    useEffect(() => { loadMenuInfo(backend.client()).then(setInfo); }, [backend]);
    const load = () => Promise.all([backend.openMenu(), backend.listRequests().catch(() => [])])
        .then(([m, r]) => { const y = Math.max(...m.map(x => x.crop_year), 0); setRows(m); setReqs(r.filter(x => !x.crop_year || x.crop_year <= y)); setErr(null); }).catch(e => setErr(String(e?.message ?? e)));
    useEffect(() => { load(); }, []);
    if (err)
        return _jsx("p", { className: "muted", children: "The menu isn't available right now." });
    if (!rows)
        return _jsx("p", { className: "muted", children: "Loading\u2026" });
    const cy = Math.max(...rows.map(r => r.crop_year), 0);
    const older = rows.filter(r => r.crop_year < cy && Number(r.available) > 0 && (!q || r.strain.toLowerCase().includes(q.toLowerCase())));
    const olderYears = [...new Set(older.map(r => r.crop_year))].sort((a, b) => b - a);
    const cur = rows.filter(r => r.crop_year === cy);
    const shown = cur.filter(r => (reserves || Number(r.available) > 0 || Number(r.my_hold ?? 0) > 0) && (!mine || r.my_reserved != null || r.request_id != null) && (!q || r.strain.toLowerCase().includes(q.toLowerCase())));
    const totalAvail = cur.reduce((a, r) => a + Number(r.available), 0);
    return (_jsxs(_Fragment, { children: [_jsxs("p", { className: "muted", children: [cy, " crop: ", n0(totalAvail), " lbs of fresh frozen open right now, across ", cur.filter(r => Number(r.available) > 0).length, " strains.", olderYears.length > 0 && ` Older crop below.`, " Numbers update live as orders and reserves change."] }), msg && _jsxs("div", { className: "okbox", children: [msg, " ", _jsx("a", { onClick: () => setMsg(null), children: "Dismiss" })] }), _jsxs("div", { className: "row toolbar", children: [_jsx("input", { className: "search", type: "search", placeholder: "Search strains", value: q, onChange: e => setQ(e.target.value) }), reserves && _jsxs("div", { className: "seg", children: [_jsx("button", { className: !mine ? 'on' : '', onClick: () => setMine(false), children: "All" }), _jsx("button", { className: mine ? 'on' : '', onClick: () => setMine(true), children: "My reserves" })] })] }), _jsxs("table", { className: "restable menu", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Strain" }), _jsx("th", { className: "num", children: "Open" }), reserves && _jsxs(_Fragment, { children: [_jsx("th", { className: "num", children: "Your reserve" }), _jsx("th", {})] })] }) }), _jsx("tbody", { children: shown.map(r => (_jsxs("tr", { children: [_jsxs("td", { children: [r.strain, (() => {
                                            const m = info.get(r.strain.toLowerCase());
                                            const sl = yieldRange(m?.solventless_pct, m?.solventless_high_pct), hc = yieldRange(m?.hydrocarbon_pct, m?.hydrocarbon_high_pct);
                                            const bits = [sl ? `${sl} solventless` : '', hc ? `${hc} hydrocarbon` : ''].filter(Boolean);
                                            return bits.length ? _jsx("div", { className: "muted small", children: bits.join(' · ') }) : null;
                                        })(), r.request_id != null && _jsxs("div", { className: "reqnote", children: ["Requested ", n0(r.requested_lbs), " lbs \u00B7 waiting"] }), Number(r.my_hold ?? 0) > 0 && _jsxs("div", { className: "reqnote", children: ["Held for you: ", n0(r.my_hold), " lbs", r.my_hold_until ? ` until ${new Date(r.my_hold_until + 'T12:00').toLocaleDateString([], { month: 'short', day: 'numeric' })}` : ' (from your sample)'] })] }), _jsx("td", { className: "num", children: Number(r.available) > 0 ? n0(r.available) : _jsx("span", { className: "muted", children: "0" }) }), reserves && _jsxs(_Fragment, { children: [_jsx("td", { className: "num", children: r.my_reserved != null ? _jsxs(_Fragment, { children: [n0(r.my_reserved), _jsxs("div", { className: "muted small", children: [n0(r.my_left), " left"] })] }) : _jsx("span", { className: "muted", children: "-" }) }), _jsx("td", { className: "num", children: (Number(r.available) > 0 || r.my_reserved != null || r.request_id != null) &&
                                                _jsx("button", { className: "ghost small", onClick: () => setPick(r), children: r.request_id != null ? 'Edit request' : r.my_reserved != null ? 'Change' : 'Reserve' }) })] })] }, r.strain))) })] }), shown.length === 0 && _jsx("p", { className: "muted", children: "Nothing matches." }), olderYears.map(y => (_jsxs("div", { children: [_jsxs("h4", { className: "cropyear", children: [y, " crop ", _jsxs("span", { className: "muted", children: [n0(older.filter(r => r.crop_year === y).reduce((a, r) => a + Number(r.available), 0)), " lbs open"] })] }), _jsxs("table", { className: "restable menu", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Strain" }), _jsx("th", { className: "num", children: "Open" })] }) }), _jsx("tbody", { children: older.filter(r => r.crop_year === y).map(r => _jsxs("tr", { children: [_jsx("td", { children: r.strain }), _jsx("td", { className: "num", children: n0(r.available) })] }, r.strain)) })] })] }, y))), reserves && reqs.length > 0 && (_jsxs(_Fragment, { children: [_jsx("h3", { children: "Your reserve requests" }), reqs.slice(0, 30).map(r => (_jsx("div", { className: `li reqcard ${r.status}`, children: _jsxs("div", { className: "grow", children: [_jsxs("div", { children: [_jsx("b", { children: r.strain }), " ", n0(r.current_lbs), " \u2192 ", _jsxs("b", { children: [n0(r.requested_lbs), " lbs"] }), " ", _jsx("span", { className: `pill r-${r.status}`, children: STATUS[r.status] })] }), _jsxs("div", { className: "muted", children: [new Date(r.requested_at).toLocaleDateString(), r.note && _jsxs(_Fragment, { children: [" \u00B7 \"", r.note, "\""] }), r.decision_note && _jsxs(_Fragment, { children: [" \u00B7 Lifted: \"", r.decision_note, "\""] })] })] }) }, r.id)))] })), pick && _jsx(RequestSheet, { backend: backend, row: pick, req: reqs.find(x => x.id === pick.request_id) ?? null, onClose: () => setPick(null), onDone: m => { setPick(null); setMsg(m); load(); } })] }));
}
function RequestSheet({ backend, row, req, onClose, onDone }) {
    const cur = Number(row.my_reserved ?? 0);
    const committed = Number(row.my_shipped ?? 0) + Number(row.my_pending ?? 0);
    const heldMine = Math.max(Number(row.requested_lbs ?? 0) - cur, 0);
    const max = cur + Math.floor((Number(row.available) + heldMine) / 10) * 10;
    const min = Math.ceil(committed / 10) * 10;
    const [val, setVal] = useState(String(row.requested_lbs ?? (cur || Math.min(100, max))));
    const [note, setNote] = useState(req?.note ?? '');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const n = Number(val);
    const bad = val === '' || isNaN(n) ? 'Enter an amount' : n % 10 !== 0 ? 'Use multiples of 10 lbs' : n > max ? `The most you can ask for right now is ${n0(max)} lbs` : n < min ? `You've already shipped or ordered ${n0(committed)} lbs, so it can't go below ${n0(min)}` : n === cur ? 'That’s your current reserve' : null;
    const step = (d) => setVal(String(Math.max(min, Math.min(max, (Number(val) || 0) + d))));
    async function send() {
        setBusy(true);
        setErr(null);
        try {
            await backend.requestReserve(row.strain, n, note);
            onDone(`Request sent: ${row.strain} ${n0(cur)} → ${n0(n)} lbs. Lifted will review it.`);
        }
        catch (e) {
            setErr(e.message);
        }
        finally {
            setBusy(false);
        }
    }
    async function cancel() {
        if (!req)
            return;
        setBusy(true);
        try {
            await backend.cancelRequest(req.id);
            onDone('Request cancelled');
        }
        catch (e) {
            setErr(e.message);
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: "sheet form", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsx("h2", { children: row.strain }), _jsx("button", { className: "ghost", onClick: onClose, children: "\u2715" })] }), _jsxs("div", { className: "stats", children: [_jsxs("div", { children: [_jsx("span", { className: "muted", children: "Your reserve" }), _jsxs("b", { children: [n0(cur), " lbs"] })] }), _jsxs("div", { children: [_jsx("span", { className: "muted", children: "Shipped or ordered" }), _jsxs("b", { children: [n0(committed), " lbs"] })] }), _jsxs("div", { children: [_jsx("span", { className: "muted", children: "Open to add" }), _jsxs("b", { children: [n0(max - cur), " lbs"] })] })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "New reserve total (lbs)" }), _jsxs("div", { className: "row stepper", children: [_jsx("button", { className: "ghost", onClick: () => step(-100), children: "\u2212100" }), _jsx("input", { type: "number", min: min, max: max, step: "10", value: val, onChange: e => setVal(e.target.value) }), _jsx("button", { className: "ghost", onClick: () => step(100), children: "+100" })] }), !bad && _jsxs("span", { className: "muted", children: [n > cur ? `+${n0(n - cur)} lbs` : `−${n0(cur - n)} lbs`, " from your current reserve"] }), bad && val !== '' && _jsx("span", { className: "warn-t", children: bad })] }), _jsxs("div", { className: "field", children: [_jsxs("label", { children: ["Note ", _jsx("span", { className: "muted", children: "(optional)" })] }), _jsx("input", { value: note, onChange: e => setNote(e.target.value), placeholder: "Anything Lifted should know" })] }), err && _jsx("div", { className: "warn-t", children: err }), _jsx("p", { className: "muted", children: "Changes need approval from Lifted. Increases are held for you while you wait." }), _jsxs("div", { className: "row between", children: [req ? _jsx("button", { className: "ghost", disabled: busy, onClick: cancel, children: "Cancel request" }) : _jsx("span", {}), _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost", onClick: onClose, children: "Close" }), _jsx("button", { className: "primary", disabled: busy || !!bad, onClick: send, children: req ? 'Update request' : 'Send request' })] })] })] }) }));
}
// Customer portal: place an order (by strain, from their reserve plus what's open)
export function OrderForm({ backend, reserves, onClose, onDone }) {
    const [rows, setRows] = useState(null);
    const [price, setPrice] = useState(null);
    const [qty, setQty] = useState({});
    const [q, setQ] = useState('');
    const [note, setNote] = useState('');
    const [po, setPo] = useState('');
    const [wanted, setWanted] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const [smp, setSmp] = useState({});
    const [hold, setHold] = useState({});
    const [days, setDays] = useState(null);
    useEffect(() => {
        backend.openMenu().then(setRows).catch(e => setErr(String(e?.message ?? e)));
        backend.myTerms().then(t => setPrice(t?.price_per_lb != null ? Number(t.price_per_lb) : null));
        backend.mySampleHoldDays().then(setDays).catch(() => { });
    }, []);
    const key = (r) => `${r.strain}|${r.crop_year}`;
    const cy = Math.max(...(rows ?? []).map(r => r.crop_year), 0);
    const canOrder = (r) => (reserves && r.crop_year === cy ? Math.floor(Number(r.my_left ?? 0) / 10) * 10 : 0) + Math.floor(Number(r.my_hold ?? 0) / 10) * 10 + Number(r.available);
    const list = (rows ?? []).filter(r => canOrder(r) > 0 && (!q || r.strain.toLowerCase().includes(q.toLowerCase())))
        .sort((a, b) => b.crop_year - a.crop_year || Number(b.my_left ?? 0) - Number(a.my_left ?? 0) || a.strain.localeCompare(b.strain));
    const lines = Object.entries(qty).map(([k, v]) => { const [strain, y] = k.split('|'); return { strain, crop_year: Number(y), lbs: Number(v), sample: !!smp[k], hold_lbs: smp[k] && Number(hold[k] || 0) > 0 ? Number(hold[k]) : null }; }).filter(l => l.lbs > 0);
    const anySample = Object.values(smp).some(Boolean);
    const problems = lines.map(l => {
        const r = rows?.find(x => x.strain === l.strain && x.crop_year === l.crop_year);
        const nm = l.crop_year === cy ? l.strain : `${l.strain} (${l.crop_year})`;
        if (l.lbs % 10 !== 0)
            return `${nm}: use multiples of 10 lbs`;
        if (r && l.lbs > canOrder(r))
            return `${nm}: up to ${n0(canOrder(r))} lbs`;
        if (l.hold_lbs && l.hold_lbs % 10 !== 0)
            return `${nm}: hold in multiples of 10 lbs`;
        if (r && l.hold_lbs && l.lbs + l.hold_lbs > canOrder(r))
            return `${nm}: up to ${n0(Math.max(canOrder(r) - l.lbs, 0))} lbs can be held`;
        return null;
    }).filter(Boolean);
    const total = lines.reduce((a, l) => a + l.lbs, 0);
    async function submit() {
        setBusy(true);
        setErr(null);
        try {
            const id = await backend.placeOrder(lines, note, po, wanted || null);
            const held = lines.reduce((a, l) => a + (l.hold_lbs ?? 0), 0);
            onDone(`Order #${id} sent: ${n0(total)} lbs${lines.some(l => l.sample) ? ` including samples${held ? `, with ${n0(held)} lbs on hold for you` : ''}` : ''}. Lifted will confirm it.`);
        }
        catch (e) {
            setErr(e.message);
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: "sheet form wide", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsx("h2", { children: "New order" }), _jsx("button", { className: "ghost", onClick: onClose, children: "\u2715" })] }), _jsxs("p", { className: "muted", children: ["Fresh frozen, by the lb in steps of 10. You can order ", reserves ? 'your reserve plus ' : '', "anything open on the menu.", price != null ? ` Your price: $${price.toFixed(2)}/lb.` : ''] }), _jsxs("p", { className: "muted small", children: ["Want to try a strain first? Check Sample on that line and enter how much you'd want if you like it. Once Lifted confirms the order, we'll hold that for you until ", days ?? 10, " days after it ships."] }), _jsx("input", { className: "search", type: "search", placeholder: "Search strains", value: q, onChange: e => setQ(e.target.value) }), !rows && !err && _jsx("p", { className: "muted", children: "Loading\u2026" }), _jsxs("div", { className: "picklist orderlist", children: [_jsxs("table", { className: "restable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Strain" }), reserves && _jsx("th", { className: "num", children: "Your reserve left" }), _jsx("th", { className: "num", children: "Can order" }), _jsx("th", { className: "num", children: "Lbs" }), _jsx("th", { className: "ctr", children: "Sample" }), anySample && _jsx("th", { className: "num", children: "Hold for me" })] }) }), _jsx("tbody", { children: list.map(r => (_jsxs("tr", { className: Number(qty[key(r)] || 0) > 0 ? 'picked' : '', children: [_jsxs("td", { children: [r.strain, r.crop_year !== cy && _jsxs("span", { className: "pill old", children: [r.crop_year, " crop"] })] }), reserves && _jsx("td", { className: "num", children: r.my_left != null ? n0(r.my_left) : _jsx("span", { className: "muted", children: "-" }) }), _jsx("td", { className: "num", children: n0(canOrder(r)) }), _jsx("td", { className: "num", children: _jsx("input", { className: "qty", type: "number", min: "0", step: "10", max: canOrder(r), value: qty[key(r)] ?? '', placeholder: "0", onChange: e => setQty({ ...qty, [key(r)]: e.target.value }) }) }), _jsx("td", { className: "ctr", children: _jsx("input", { type: "checkbox", "aria-label": `${r.strain} is a sample`, checked: !!smp[key(r)], onChange: e => setSmp({ ...smp, [key(r)]: e.target.checked }) }) }), anySample && _jsx("td", { className: "num", children: smp[key(r)] && _jsx("input", { className: "qty", type: "number", min: "0", step: "10", value: hold[key(r)] ?? '', placeholder: "0", onChange: e => setHold({ ...hold, [key(r)]: e.target.value }) }) })] }, key(r)))) })] }), rows && list.length === 0 && _jsxs("p", { className: "muted", children: ["Nothing available to order", q ? ' matches' : '', "."] })] }), _jsxs("div", { className: "row orderfields", children: [_jsxs("div", { className: "field", children: [_jsxs("label", { children: ["PO # ", _jsx("span", { className: "muted", children: "(optional)" })] }), _jsx("input", { value: po, onChange: e => setPo(e.target.value) })] }), _jsxs("div", { className: "field", children: [_jsxs("label", { children: ["Requested Delivery Date ", _jsx("span", { className: "muted", children: "(optional)" })] }), _jsx("input", { type: "date", value: wanted, onChange: e => setWanted(e.target.value) })] })] }), _jsxs("div", { className: "field", children: [_jsxs("label", { children: ["Note ", _jsx("span", { className: "muted", children: "(optional)" })] }), _jsx("input", { value: note, onChange: e => setNote(e.target.value), placeholder: "Pickup or delivery details" })] }), problems.map(p => _jsx("div", { className: "warn-t", children: p }, p)), err && _jsx("div", { className: "warn-t", children: err }), _jsxs("div", { className: "row between", children: [_jsxs("b", { children: [n0(total), " lbs", price != null && total > 0 ? ` · $${(total * price).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : ''] }), _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost", onClick: onClose, children: "Cancel" }), _jsx("button", { className: "primary", disabled: busy || !lines.length || problems.length > 0, onClick: submit, children: "Send order" })] })] })] }) }));
}
