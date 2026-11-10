import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { Select } from './combo';
import { money, rpc } from './ship';
export const REASONS = { quality: 'Quality', yield: 'Yield', wrong_strain: 'Wrong strain', overshipped: 'Overshipped', damaged: 'Damaged', not_delivered: 'Not delivered (on manifest, not on truck)', other: 'Other' };
const REASON_SHORT = { ...REASONS, not_delivered: 'Not delivered', mixed: 'Several reasons' };
const STATUS = { open: ['Waiting for the product', 'm-warn'], received: ['Received', 'm-ok'], credited: ['Credited', 'm-ok'], cancelled: ['Cancelled', 'm-off'] };
const ACCT = { pending: 'goes to QuickBooks 30 min after it was made', sent: 'in QuickBooks', error: 'not sent', skip: 'not sent' };
const n2 = (x) => Number(x ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const day = (s) => (s ? new Date(s.length <= 10 ? s + 'T12:00:00' : s).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '');
async function qboRun(sb, body) {
    const { data } = await sb.auth.getSession();
    const r = await fetch('/api/qbo/run', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({ error: `The server didn't answer (${r.status})` }));
    if (!r.ok)
        throw new Error(j.error ?? `Error ${r.status}`);
    return j;
}
export function ReturnsView({ sb, customers, flash, canEdit, canSend, isAdmin }) {
    const [rows, setRows] = useState(null);
    const [show, setShow] = useState('open');
    const [making, setMaking] = useState(false);
    const [recv, setRecv] = useState(null);
    const [busy, setBusy] = useState(null);
    const load = async () => { try {
        setRows(await rpc(sb, 'returns_list', {}, '159_returns'));
    }
    catch (e) {
        flash(e.message, true);
        setRows([]);
    } };
    useEffect(() => { load(); }, []);
    const list = (rows ?? []).filter(r => show === 'all' || r.status === 'open' || r.status === 'received' || r.credits.some(c => c.acct_status !== 'sent'));
    async function cancel(r) {
        const note = prompt(`Cancel ${r.rma} for ${r.customer}? Add a note (optional):`, '');
        if (note === null)
            return;
        setBusy(r.rma);
        try {
            await rpc(sb, 'cancel_return', { p_id: r.id, p_note: note }, '159_returns');
            flash(`${r.rma} cancelled`);
            await load();
        }
        catch (e) {
            flash(e.message, true);
        }
        finally {
            setBusy(null);
        }
    }
    async function sendCm(c) {
        if (!sb || !confirm(`Send ${c.number} (${money(c.total)}) to QuickBooks now?`))
            return;
        setBusy(c.number);
        try {
            const r = await qboRun(sb, { action: 'push_cm', credit_memo_id: c.id });
            flash(r.note ?? `${c.number} is in QuickBooks (#${r.doc_number})`);
            await load();
        }
        catch (e) {
            flash(e.message, true);
            await load();
        }
        finally {
            setBusy(null);
        }
    }
    async function emailsCm(c) {
        if (!sb)
            return;
        setBusy(c.number);
        try {
            const r = await qboRun(sb, { action: 'push_cm', emails_only: true, credit_memo_id: c.id });
            flash(`${c.number} in QuickBooks now emails ${[r.to, r.cc].filter(Boolean).join(', ')}${r.left.length ? `. Didn't fit: ${r.left.join(', ')}` : ''}`);
        }
        catch (e) {
            flash(e.message, true);
        }
        finally {
            setBusy(null);
        }
    }
    async function linkCm(c) {
        if (!sb)
            return;
        const num = prompt(`Already made in QuickBooks by hand? Type that credit memo's number to link ${c.number} to it (nothing changes in QuickBooks):`, '');
        if (!num)
            return;
        setBusy(c.number);
        try {
            const r = await qboRun(sb, { action: 'link_cm', credit_memo_id: c.id, qbo_doc: num });
            flash(`${c.number} linked to QuickBooks #${r.qbo.doc_number}${r.warning ? `. ${r.warning}` : ''}`);
            await load();
        }
        catch (e) {
            flash(e.message, true);
        }
        finally {
            setBusy(null);
        }
    }
    return _jsxs("div", { className: "list", children: [_jsxs("div", { className: "row between wrap toolbar", children: [_jsx("h2", { children: "Returns" }), _jsxs("div", { className: "row", children: [_jsxs("select", { value: show, onChange: e => setShow(e.target.value), children: [_jsx("option", { value: "open", children: "Open" }), _jsx("option", { value: "all", children: "All" })] }), _jsx("button", { className: "ghost small", onClick: load, children: "Refresh" }), canEdit && _jsx("button", { className: "primary small", onClick: () => setMaking(true), children: "New return" })] })] }), _jsx("p", { className: "muted", children: "Start a return from a shipped order. The customer sends the product back on a METRC manifest; Distribution \u203A Inbound receives it (it goes back into inventory to sell), and that makes the credit memo (Product Return, received lbs \u00D7 invoice price), which goes to QuickBooks 30 minutes later." }), rows === null && _jsx("p", { className: "muted", children: "Loading\u2026" }), rows && !list.length && _jsx("p", { className: "muted", children: show === 'open' ? 'No open returns.' : 'No returns yet.' }), list.map(r => {
                const [sl, sc] = STATUS[r.status];
                const want = r.lines.reduce((s, l) => s + Number(l.lbs), 0), got = r.lines.reduce((s, l) => s + Number(l.received_lbs), 0);
                return _jsxs("div", { className: "card", children: [_jsxs("div", { className: "row between wrap", children: [_jsxs("div", { children: [_jsx("b", { children: r.rma }), " \u00B7 ", _jsx("b", { children: r.customer }), " ", _jsx("span", { className: `pill ${sc}`, children: sl }), _jsxs("div", { className: "muted small", children: [REASON_SHORT[r.reason] ?? r.reason, r.so ? ` · order ${r.so}` : r.order_id ? ` · order #${r.order_id}` : '', " \u00B7 started ", day(r.created_at), r.created_by ? ` by ${r.created_by}` : '', r.received_at ? ` · received ${day(r.received_at)}${r.manifest ? ` (manifest ${r.manifest})` : ''}` : ''] }), r.notes && _jsx("div", { className: "small", children: r.notes })] }), _jsxs("div", { className: "row", children: [_jsxs("span", { className: "small", children: [n2(got), " of ", n2(want), " lbs back"] }), canEdit && r.status !== 'cancelled' && got < want - 0.001 && _jsx("button", { className: "ghost small", disabled: !!busy, onClick: () => setRecv({ r, credit: false }), children: "Already received in METRC" }), isAdmin && r.status !== 'cancelled' && r.lines.some(l => l.reason === 'not_delivered' && Number(l.received_lbs) < Number(l.lbs) - 0.001) &&
                                            _jsx("button", { className: "ghost small", disabled: !!busy, onClick: () => setRecv({ r, credit: true }), children: "Credit without receiving" }), canEdit && r.status === 'open' && got === 0 && _jsx("button", { className: "ghost small", disabled: !!busy, onClick: () => cancel(r), children: busy === r.rma ? '…' : 'Cancel' })] })] }), _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "ct", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Strain" }), _jsx("th", { children: "Crop" }), _jsx("th", { children: "Farm" }), _jsx("th", { children: "Reason" }), _jsx("th", { className: "num", children: "Lbs" }), _jsx("th", { className: "num", children: "Received" }), _jsx("th", { className: "num", children: "$/lb" }), _jsx("th", { children: "Packages" })] }) }), _jsx("tbody", { children: r.lines.map(l => _jsxs("tr", { children: [_jsx("td", { children: l.strain }), _jsx("td", { children: l.crop_year ?? '' }), _jsx("td", { children: l.site ?? _jsx("span", { className: "warn-t", children: "?" }) }), _jsx("td", { className: "small", children: REASON_SHORT[l.reason ?? r.reason] ?? l.reason }), _jsx("td", { className: "num", children: n2(l.lbs) }), _jsx("td", { className: "num", children: n2(l.received_lbs) }), _jsx("td", { className: "num", children: l.price == null ? _jsx("span", { className: "warn-t", children: "none" }) : money(l.price) }), _jsx("td", { className: "small", children: l.packages.length ? l.packages.map(p => `${p.code ?? p.tag} ${n2(p.lbs)}`).join(', ') : _jsx("span", { className: "muted mono", children: l.tags.join(', ') || 'tags we shipped: none on file' }) })] }, l.id)) })] }) }), r.credits.map(c => _jsxs("div", { className: "row between wrap small", style: { marginTop: 6 }, children: [_jsxs("span", { children: ["Credit memo ", _jsx("b", { children: c.number }), " ", money(c.total), " \u00B7 ", c.acct_status === 'sent' ? _jsxs(_Fragment, { children: ["in QuickBooks", c.qbo_doc && c.qbo_doc !== c.number ? ` as #${c.qbo_doc}` : ''] }) : _jsx("span", { className: c.acct_status === 'error' ? 'neg' : 'muted', children: ACCT[c.acct_status] }), c.error && _jsxs("span", { className: "neg", children: [" \u00B7 ", c.error] })] }), canSend && c.acct_status === 'sent' && _jsx("button", { className: "ghost small", disabled: !!busy, onClick: () => emailsCm(c), children: busy === c.number ? '…' : 'Put billing emails on it in QuickBooks' }), canSend && c.acct_status !== 'sent' && _jsxs("span", { className: "row", children: [_jsx("button", { className: "ghost small", disabled: !!busy, onClick: () => linkCm(c), children: "Already in QuickBooks?" }), _jsx("button", { className: "primary small", disabled: !!busy, onClick: () => sendCm(c), children: busy === c.number ? 'Sending…' : 'Send now' })] })] }, c.id))] }, r.id);
            }), recv && _jsx(ReceiveSheet, { sb: sb, ret: recv.r, creditOnly: recv.credit, flash: flash, onClose: () => setRecv(null), onDone: async () => { setRecv(null); await load(); } }), making && _jsx(NewReturn, { sb: sb, customers: customers, flash: flash, onClose: () => setMaking(false), onMade: async () => { setMaking(false); await load(); } })] });
}
function NewReturn({ sb, customers, flash, onClose, onMade }) {
    const [cust, setCust] = useState('');
    const [orders, setOrders] = useState(null);
    const [order, setOrder] = useState('');
    const [lines, setLines] = useState(null);
    const [lbs, setLbs] = useState({});
    const [why, setWhy] = useState({});
    const [farm, setFarm] = useState({});
    const [reason, setReason] = useState('');
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const ext = useMemo(() => customers.filter(c => c.kind === 'external').sort((a, b) => a.name.localeCompare(b.name)), [customers]);
    useEffect(() => {
        setOrders(null);
        setOrder('');
        setLines(null);
        if (!cust)
            return;
        rpc(sb, 'returnable_orders', { p_customer: cust }, '159_returns').then(setOrders).catch(e => { flash(e.message, true); setOrders([]); });
    }, [cust]);
    useEffect(() => {
        setLines(null);
        setLbs({});
        setWhy({});
        setFarm({});
        if (!order)
            return;
        rpc(sb, 'return_order_lines', { p_order: order }, '159_returns').then(setLines).catch(e => { flash(e.message, true); setLines([]); });
    }, [order]);
    const picked = (lines ?? []).filter(l => Number(lbs[l.id] || 0) > 0);
    const over = picked.filter(l => Number(lbs[l.id]) > Number(l.shipped_lbs) - Number(l.returned_lbs) + 0.001);
    const whyOf = (id) => why[id] || reason;
    const noWhy = picked.filter(l => !whyOf(l.id));
    const total = picked.reduce((s, l) => s + Number(lbs[l.id]) * Number(l.price ?? 0), 0);
    async function save() {
        if (!order || noWhy.length || !picked.length || over.length)
            return;
        setBusy(true);
        try {
            const r = await rpc(sb, 'create_return', { p_order: order, p_reason: reason, p_notes: notes,
                p_lines: picked.map(l => ({ line_id: l.id, lbs: Number(lbs[l.id]), reason: whyOf(l.id), site: farm[l.id] || l.site || '' })) }, '159_returns');
            flash(`${r.rma} started. Ask the customer to put ${r.rma} on their METRC manifest back to us.`);
            onMade();
        }
        catch (e) {
            flash(e.message, true);
        }
        finally {
            setBusy(false);
        }
    }
    return _jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: "sheet form wide", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsx("h3", { children: "New return" }), _jsx("button", { className: "ghost", "aria-label": "Close", onClick: onClose, children: "\u2715" })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Customer" }), _jsxs(Select, { value: cust === '' ? '' : String(cust), onChange: e => setCust(e.target.value ? Number(e.target.value) : ''), children: [_jsx("option", { value: "", children: "Pick a customer" }), ext.map(c => _jsx("option", { value: c.id, children: c.name }, c.id))] })] }), cust !== '' && _jsxs("div", { className: "field", children: [_jsx("label", { children: "Shipped order" }), _jsxs(Select, { value: order === '' ? '' : String(order), onChange: e => setOrder(e.target.value ? Number(e.target.value) : ''), children: [_jsx("option", { value: "", children: orders === null ? 'Loading…' : orders.length ? 'Pick the order it shipped on' : 'No shipped orders in the last 2 years' }), (orders ?? []).map(o => _jsxs("option", { value: o.id, children: [o.so ?? `#${o.id}`, " \u00B7 ", day(o.shipped), " \u00B7 ", n2(o.lbs), " lbs \u00B7 ", o.strains] }, o.id))] })] }), lines && _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "ct", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Strain" }), _jsx("th", { children: "Crop" }), _jsx("th", { children: "Farm" }), _jsx("th", { className: "num", children: "Shipped" }), _jsx("th", { className: "num", children: "Can return" }), _jsx("th", { className: "num", children: "$/lb" }), _jsx("th", { className: "num", children: "Lbs back" }), _jsx("th", { children: "Reason" })] }) }), _jsx("tbody", { children: lines.map(l => {
                                    const can = Math.max(Number(l.shipped_lbs) - Number(l.returned_lbs), 0);
                                    const bad = Number(lbs[l.id] || 0) > can + 0.001;
                                    return _jsxs("tr", { children: [_jsx("td", { children: l.strain }), _jsx("td", { children: l.crop_year ?? '' }), _jsx("td", { children: _jsxs("select", { value: farm[l.id] ?? l.site ?? '', onChange: e => setFarm(m => ({ ...m, [l.id]: e.target.value })), children: [!l.site && _jsx("option", { value: "", children: "?" }), _jsx("option", { value: "OHR", children: "OHR" }), _jsx("option", { value: "GVR", children: "GVR" })] }) }), _jsx("td", { className: "num", children: n2(l.shipped_lbs) }), _jsx("td", { className: "num", children: n2(can) }), _jsx("td", { className: "num", children: l.price == null ? _jsx("span", { className: "warn-t", children: "none" }) : money(l.price) }), _jsx("td", { className: "num", children: _jsx("input", { type: "number", min: 0, step: "0.01", max: can, disabled: can <= 0, style: { width: 90 }, className: bad ? 'bad' : '', value: lbs[l.id] ?? '', onChange: e => setLbs(m => ({ ...m, [l.id]: e.target.value })) }) }), _jsx("td", { children: _jsxs("select", { value: why[l.id] ?? '', disabled: can <= 0, onChange: e => setWhy(m => ({ ...m, [l.id]: e.target.value })), children: [_jsx("option", { value: "", children: reason ? `Same (${REASON_SHORT[reason]})` : 'Pick' }), Object.entries(REASONS).map(([k, v]) => _jsx("option", { value: k, children: REASON_SHORT[k] ?? v }, k))] }) })] }, l.id);
                                }) })] }) }), lines && !lines.length && _jsx("p", { className: "muted", children: "Nothing on this order can come back." }), over.length > 0 && _jsxs("p", { className: "neg small", children: [over.map(l => l.strain).join(', '), ": more than can come back."] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Reason (for every line, unless a line says otherwise)" }), _jsxs("select", { value: reason, onChange: e => setReason(e.target.value), children: [_jsx("option", { value: "", children: "Pick a reason" }), Object.entries(REASONS).map(([k, v]) => _jsx("option", { value: k, children: v }, k))] })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Notes" }), _jsx("textarea", { rows: 2, value: notes, onChange: e => setNotes(e.target.value), placeholder: "What happened (optional)" })] }), _jsx("p", { className: "muted small", children: "Quality and Yield release the customer's reserve on that strain (they keep only what they kept). Not delivered is credited as Product Refund; everything else as Product Return." }), picked.length > 0 && _jsxs("p", { className: "small", children: ["Credit if all of it comes back: ", _jsx("b", { children: money(total) }), " ", _jsx("span", { className: "muted", children: "(the credit memo uses the weight we actually receive)" })] }), _jsxs("div", { className: "row between", children: [_jsx("button", { className: "ghost", onClick: onClose, children: "Cancel" }), _jsx("button", { className: "primary", disabled: busy || !order || noWhy.length > 0 || !picked.length || over.length > 0, onClick: save, children: busy ? 'Saving…' : 'Start return' })] })] }) });
}
/** "Already received in METRC": pick the packages already in the app; or (Sales Admins) credit Not delivered lines without any package */
function ReceiveSheet({ sb, ret, creditOnly, flash, onClose, onDone }) {
    const [cands, setCands] = useState(creditOnly ? [] : null);
    const [pick, setPick] = useState({});
    const [credit, setCredit] = useState({});
    const [manifest, setManifest] = useState(ret.manifest ?? '');
    const [all, setAll] = useState(false);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (creditOnly)
            return;
        rpc(sb, 'return_candidates', { p_return: ret.id }, '161_return_receive_manual').then(c => {
            setCands(c);
            setPick(Object.fromEntries(c.map(x => [x.id, { on: x.ours, line: x.line_id ?? '', lbs: String(x.received_lbs ?? x.lbs_now ?? '') }])));
            const m = c.find(x => x.ours && x.manifest)?.manifest;
            if (m && !ret.manifest)
                setManifest(m);
        }).catch(e => { flash(e.message, true); setCands([]); });
    }, []);
    const left = (l) => Math.max(Number(l.lbs) - Number(l.received_lbs), 0);
    const shown = (cands ?? []).filter(c => all || c.ours || (c.strain && ret.lines.some(l => l.strain.toLowerCase() === c.strain.toLowerCase())) || pick[c.id]?.on);
    const chosen = (cands ?? []).filter(c => pick[c.id]?.on);
    const bad = chosen.filter(c => !pick[c.id].line || !(Number(pick[c.id].lbs) > 0));
    // two packages on one line can't take in more than the line has left (e.g. the package we shipped from and the customer's repackaged one)
    const overLines = ret.lines.filter(l => chosen.filter(c => Number(pick[c.id].line) === l.id).reduce((t, c) => t + Number(pick[c.id].lbs || 0), 0) > left(l) + 0.001);
    const items = creditOnly
        ? ret.lines.filter(l => Number(credit[l.id] || 0) > 0).map(l => ({ line_id: l.id, lbs: Number(credit[l.id]) }))
        : chosen.map(c => ({ pallet_id: c.id, line_id: Number(pick[c.id].line), lbs: Number(pick[c.id].lbs) }));
    const amount = items.reduce((s, i) => s + i.lbs * Number(ret.lines.find(l => l.id === i.line_id)?.price ?? 0), 0);
    async function save() {
        if (!items.length || bad.length || overLines.length)
            return;
        if (!confirm(`${creditOnly ? 'Credit' : 'Receive'} ${items.length} line(s) on ${ret.rma} for ${ret.customer}? This makes a ${money(amount)} credit memo that goes to QuickBooks in 30 minutes.`))
            return;
        setBusy(true);
        try {
            const r = await rpc(sb, 'return_receive_manual', { p_return: ret.id, p_items: items, p_manifest: manifest || null, p_credit_only: creditOnly }, '161_return_receive_manual');
            flash(`${ret.rma}: credit memo ${r.credit_memo} (${money(r.total)}) made. It goes to QuickBooks in 30 minutes.`);
            onDone();
        }
        catch (e) {
            flash(e.message, true);
        }
        finally {
            setBusy(false);
        }
    }
    return _jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: "sheet form wide", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsxs("h3", { children: [creditOnly ? 'Credit without receiving' : 'Already received in METRC', " \u00B7 ", ret.rma] }), _jsx("button", { className: "ghost", "aria-label": "Close", onClick: onClose, children: "\u2715" })] }), creditOnly ? _jsxs(_Fragment, { children: [_jsx("p", { className: "muted small", children: "For Not delivered lines only, when nothing will come back on a METRC transfer. The credit is Product Refund." }), _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "ct", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Strain" }), _jsx("th", { className: "num", children: "Left" }), _jsx("th", { className: "num", children: "$/lb" }), _jsx("th", { className: "num", children: "Lbs to credit" })] }) }), _jsx("tbody", { children: ret.lines.filter(l => l.reason === 'not_delivered' && left(l) > 0).map(l => _jsxs("tr", { children: [_jsx("td", { children: l.strain }), _jsx("td", { className: "num", children: n2(left(l)) }), _jsx("td", { className: "num", children: money(l.price) }), _jsx("td", { className: "num", children: _jsx("input", { type: "number", min: 0, max: left(l), step: "0.01", style: { width: 90 }, value: credit[l.id] ?? '', onChange: e => setCredit(m => ({ ...m, [l.id]: e.target.value })) }) })] }, l.id)) })] }) })] }) : _jsxs(_Fragment, { children: [_jsxs("p", { className: "muted small", children: ["The packages came in before this return existed (or were received on Inbound without picking it). Tick the ones that belong to ", ret.rma, ", check the line and the lbs that came in. They're marked returned on that line (farm and crop year from the line), just like a receive on Inbound."] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "METRC manifest it came in on" }), _jsx("input", { value: manifest, onChange: e => setManifest(e.target.value), placeholder: "e.g. 0011790727" })] }), cands === null && _jsx("p", { className: "muted", children: "Loading\u2026" }), cands && !cands.length && _jsx("p", { className: "muted", children: "No packages received on Inbound in the last 120 days that aren't on a return yet." }), cands && cands.length > 0 && _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "ct", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", {}), _jsx("th", { children: "Package" }), _jsx("th", { children: "Strain" }), _jsx("th", { children: "Received" }), _jsx("th", { children: "Return line" }), _jsx("th", { className: "num", children: "Lbs in" })] }) }), _jsx("tbody", { children: shown.map(c => {
                                            const pk = pick[c.id] ?? { on: false, line: '', lbs: '' };
                                            const set = (v) => setPick(m => ({ ...m, [c.id]: { ...pk, ...v } }));
                                            return _jsxs("tr", { children: [_jsx("td", { children: _jsx("input", { type: "checkbox", checked: pk.on, onChange: e => set({ on: e.target.checked }) }) }), _jsxs("td", { children: [c.code, c.ours && _jsx("span", { className: "pill m-ok", style: { marginLeft: 4 }, children: "our tag" }), _jsx("div", { className: "muted small mono", children: c.tag })] }), _jsxs("td", { children: [c.strain, _jsx("div", { className: "muted small", children: c.status })] }), _jsxs("td", { className: "small", children: [c.received_on ? day(c.received_on) : '', c.manifest ? ` · ${c.manifest}` : '', _jsx("div", { className: "muted", children: c.from_name })] }), _jsx("td", { children: _jsxs("select", { value: pk.line, onChange: e => set({ line: e.target.value ? Number(e.target.value) : '' }), children: [_jsx("option", { value: "", children: "Pick" }), ret.lines.map(l => _jsxs("option", { value: l.id, children: [l.strain, " (", REASON_SHORT[l.reason ?? ret.reason] ?? l.reason, ", ", n2(left(l)), " left)"] }, l.id))] }) }), _jsx("td", { className: "num", children: _jsx("input", { type: "number", min: 0, step: "0.01", style: { width: 90 }, value: pk.lbs, onChange: e => set({ lbs: e.target.value }) }) })] }, c.id);
                                        }) })] }) }), cands && cands.length > shown.length && _jsxs("button", { className: "ghost small", onClick: () => setAll(true), children: ["Show all ", cands.length, " recent packages"] }), bad.length > 0 && _jsx("p", { className: "neg small", children: "Pick a return line and lbs for every ticked package." }), overLines.length > 0 && _jsxs("p", { className: "neg small", children: ["More lbs ticked than are left on: ", overLines.map(l => `${l.strain} (${n2(left(l))} left)`).join(', '), ". Untick the extra package."] })] }), items.length > 0 && _jsxs("p", { className: "small", children: ["Credit memo: ", _jsx("b", { children: money(amount) }), " (", items.length, " line", items.length === 1 ? '' : 's', ")"] }), _jsxs("div", { className: "row between", children: [_jsx("button", { className: "ghost", onClick: onClose, children: "Cancel" }), _jsx("button", { className: "primary", disabled: busy || !items.length || bad.length > 0 || overLines.length > 0, onClick: save, children: busy ? 'Saving…' : creditOnly ? 'Credit' : 'Receive' })] })] }) });
}
