import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Select } from '../combo';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AcctApi, GRP_LABEL } from './api';
import { Card, Cards, DashHead, Empty, Tile, Tiles } from '../dash';
import { DocSheet } from '../invoices';
import { ModulePeople } from '../users';
import { dfmt, money as money2 } from '../docs';
import { PayrollTab, PaySettings } from '../pay/PayrollView';
import { BcPanel } from './BcPanel';
import { StopAlerts } from '../driver';
const money = money2;
/** whole dollars for the big tiles */
const dollars = (n) => (n < 0 ? '-$' : '$') + Math.round(Math.abs(n)).toLocaleString();
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const when = (iso) => iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const msg = (e) => String(e?.message ?? e);
const ENV_LABEL = { sandbox: 'QuickBooks sandbox (test company)', production: 'QuickBooks (real books)' };
const EnvPill = ({ env }) => _jsx("span", { className: `pill ${env === 'sandbox' ? 'warnp' : 'acct-sent'}`, children: env === 'sandbox' ? 'SANDBOX' : 'LIVE' });
const unpaid = (i) => i.push?.status === 'sent' && Number(i.push.balance ?? i.push.total ?? 0) > 0;
const toSend = (i) => i.outside && i.status !== 'void' && i.push?.status !== 'sent';
export default function AccountingView({ backend, flash, tab, go, isAdmin, canEdit, notice }) {
    const sb = useMemo(() => backend.client(), [backend]);
    const api = useMemo(() => (sb ? new AcctApi(sb) : null), [sb]);
    const [rows, setRows] = useState(null);
    const [ov, setOv] = useState(null);
    const [conn, setConn] = useState(null);
    const [err, setErr] = useState(null);
    const [open, setOpen] = useState(null);
    const [pdf, setPdf] = useState(null);
    const load = useCallback(async () => {
        if (!api)
            return;
        try {
            const [r, o] = await Promise.all([api.invoices(), api.overview()]);
            setRows(r);
            setOv(o);
            setErr(null);
        }
        catch (e) {
            setErr(msg(e));
        }
    }, [api]);
    const status = useCallback(async () => {
        if (!api)
            return;
        try {
            setConn(await api.server('run', { action: 'status' }));
        }
        catch (e) {
            setConn({ env: 'sandbox', connected: false, error: msg(e) });
        }
    }, [api]);
    useEffect(() => { load(); status(); }, [load, status]);
    useEffect(() => {
        if (!notice)
            return;
        if (notice.qbo === 'connected') {
            flash('QuickBooks connected');
            status();
            load();
        }
        else
            flash(`QuickBooks didn't connect: ${notice.msg ?? 'unknown error'}`, true);
    }, [notice]);
    if (!api)
        return _jsxs("div", { className: "list", children: [_jsx("h2", { children: "Accounting" }), _jsx("p", { className: "muted", children: "Accounting needs the database (not available in the demo)." })] });
    if (err)
        return _jsxs("div", { className: "list", children: [_jsx("h2", { children: "Accounting" }), _jsxs("div", { className: "warnbox", children: ["Couldn't load Accounting. If this is the first time, run 046_accounting.sql in Supabase. (", err, ")"] })] });
    if (!rows || !ov)
        return _jsxs("div", { className: "list", children: [_jsx("h2", { children: "Accounting" }), _jsx("p", { className: "muted", children: "Loading\u2026" })] });
    const env = conn?.env ?? ov.env;
    const sheet = open != null && _jsx(SendSheet, { api: api, id: open, flash: flash, canEdit: canEdit, isAdmin: isAdmin, env: env, onClose: () => setOpen(null), onChanged: load, onPdf: () => setPdf(open) });
    const pdfSheet = pdf != null && _jsx(DocSheet, { backend: backend, kind: "invoice", id: pdf, flash: flash, onClose: () => setPdf(null), onChanged: load, canEdit: false, canVoid: false });
    const banner = conn && !conn.connected
        ? _jsxs("div", { className: "warnbox", children: ["QuickBooks isn't connected. ", conn.error, isAdmin && tab !== 'settings' && _jsxs(_Fragment, { children: [" ", _jsx("button", { className: "linkbtn", onClick: () => go('settings'), children: "Connect it in Settings \u203A" })] })] })
        : env === 'sandbox' ? _jsx("div", { className: "viewbanner", children: "Sandbox: invoices go to the QuickBooks test company, not your real books. Nothing here is locked or marked paid by the sandbox." }) : null;
    return (_jsxs("div", { className: "acct", children: [(tab === 'dashboard' || tab === 'send') && _jsx(StopAlerts, { sb: sb, only: ['accounting'] }), tab === 'dashboard' && _jsx(Dashboard, { api: api, ov: ov, rows: rows, conn: conn, env: env, go: go, open: setOpen, banner: banner }), tab === 'send' && _jsx(SendList, { api: api, rows: rows, env: env, canEdit: canEdit && !!conn?.connected, flash: flash, open: setOpen, reload: load, banner: banner }), tab === 'sent' && _jsx(SentList, { api: api, rows: rows, env: env, flash: flash, open: setOpen, reload: load, lastSync: ov.last_sync, connected: !!conn?.connected, banner: banner }), tab === 'payroll' && sb && _jsx(PayrollTab, { sb: sb, flash: flash, canEdit: canEdit, isAdmin: isAdmin }), tab === 'review' && _jsx(ReviewTab, { api: api, rows: rows, open: setOpen }), tab === 'settings' && isAdmin && _jsx(SettingsTab, { api: api, flash: flash, conn: conn, env: env, refresh: () => { status(); load(); }, sb: sb, canEdit: canEdit }), tab === 'settings' && !isAdmin && _jsxs("div", { className: "list", children: [_jsx("h2", { children: "Settings" }), _jsx("p", { className: "muted", children: "Only Accounting Admins can change Accounting settings." })] }), sheet, pdfSheet] }));
}
// ---------- Dashboard ----------
function Dashboard({ api, ov, rows, conn, env, go, open, banner }) {
    const errs = rows.filter(i => i.push?.status === 'error' && i.status !== 'void');
    const oldest = rows.filter(toSend).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
    const od = rows.filter(i => unpaid(i) && i.due && i.due < today()).sort((a, b) => (a.due ?? '').localeCompare(b.due ?? '')).slice(0, 8);
    // credit memos from returns (159) waiting for QuickBooks count on the To send tile too
    const [cms, setCms] = useState([]);
    useEffect(() => { api.creditMemosToSend().then(setCms).catch(() => { }); }, [api]);
    const toSendN = ov.to_send + cms.length;
    return (_jsxs("div", { className: "dash", children: [_jsx(DashHead, { title: "Accounting", sub: _jsxs(_Fragment, { children: [ENV_LABEL[env], " ", _jsx(EnvPill, { env: env }), conn?.company ? ` · ${conn.company}` : ''] }) }), banner, _jsxs(Tiles, { children: [_jsx(Tile, { label: "To send", value: toSendN, sub: cms.length ? `${money(ov.to_send_amt)} invoices · -${money(cms.reduce((t, c) => t + c.total, 0))} in ${cms.length} credit memo${cms.length === 1 ? '' : 's'}` : money(ov.to_send_amt), tone: toSendN ? 'info' : 'ok', onClick: () => go('send') }), _jsx(Tile, { label: "Couldn't send", value: ov.errors, sub: "need a fix", tone: ov.errors ? 'warn' : 'ok', onClick: () => go('review') }), _jsx(Tile, { label: "Unpaid in QuickBooks", value: dollars(ov.unpaid_amt), sub: `${ov.unpaid} invoices`, onClick: () => go('sent') }), _jsx(Tile, { label: "Overdue", value: dollars(ov.overdue_amt), sub: `${ov.overdue} invoices`, tone: ov.overdue ? 'warn' : 'ok', onClick: () => go('sent') }), _jsx(Tile, { label: "Sent this month", value: ov.sent_month, sub: money(ov.sent_month_amt) })] }), _jsxs(Cards, { children: [_jsxs(Card, { title: "Oldest waiting to send", badge: toSendN, action: "To send", onAction: () => go('send'), children: [cms.map(c => _jsxs("button", { className: "drow click", onClick: () => go('send'), children: [_jsxs("span", { children: [_jsx("b", { children: c.number }), " ", _jsx("span", { className: "pill", children: "Credit memo" }), " ", _jsxs("span", { className: "muted", children: [c.customer, " \u00B7 ", dfmt(c.date)] })] }), _jsxs("b", { children: ["-", money(c.total)] })] }, `cm${c.id}`)), oldest.length ? oldest.map(i => _jsxs("button", { className: "drow click", onClick: () => open(i.id), children: [_jsxs("span", { children: [_jsx("b", { children: i.inv }), " ", _jsxs("span", { className: "muted", children: [i.customer, " \u00B7 ", dfmt(i.date)] })] }), _jsx("b", { children: money(i.total) })] }, i.id))
                                : !cms.length && _jsx(Empty, { children: "Nothing waiting. Every outside invoice is in QuickBooks." })] }), _jsx(Card, { title: "Couldn't send", badge: errs.length, action: "Review", onAction: () => go('review'), children: errs.length ? errs.slice(0, 8).map(i => _jsx("button", { className: "drow click", onClick: () => open(i.id), children: _jsxs("span", { children: [_jsx("b", { children: i.inv }), " ", _jsx("span", { className: "muted", children: i.push?.error })] }) }, i.id))
                            : _jsx(Empty, { children: "No errors." }) }), _jsxs(Card, { title: "Overdue in QuickBooks", badge: ov.overdue, action: "In QuickBooks", onAction: () => go('sent'), children: [od.length ? od.map(i => _jsxs("button", { className: "drow click", onClick: () => open(i.id), children: [_jsxs("span", { children: [_jsx("b", { children: i.inv }), " ", _jsxs("span", { className: "muted", children: [i.customer, " \u00B7 due ", dfmt(i.due)] })] }), _jsx("b", { children: money(Number(i.push?.balance ?? i.total)) })] }, i.id))
                                : _jsxs(Empty, { children: ["Nothing overdue", ov.last_sync ? '' : ' (no sync yet)', "."] }), _jsxs("p", { className: "muted small", children: ["Paid / balance last checked ", ov.last_sync ? when(ov.last_sync) : 'never', ". It checks every hour, 7am to 8pm Monday to Saturday."] })] })] })] }));
}
// ---------- To send ----------
function SendList({ api, rows, env, canEdit, flash, open, reload, banner }) {
    const [f, setF] = useState('send');
    const [q, setQ] = useState('');
    const [sel, setSel] = useState([]);
    const [busy, setBusy] = useState(null);
    const [results, setResults] = useState([]);
    const ql = q.trim().toLowerCase();
    const base = f === 'send' ? rows.filter(toSend) : f === 'internal' ? rows.filter(i => !i.outside && i.status !== 'void') : rows.filter(i => i.status === 'void');
    const shown = base.filter(i => !ql || `${i.inv} ${i.customer} ${i.so ?? ''}`.toLowerCase().includes(ql)).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
    async function sendMany() {
        const ids = shown.filter(i => sel.includes(i.id));
        const out = [];
        for (const [k, i] of ids.entries()) {
            setBusy(`Sending ${k + 1} of ${ids.length}…`);
            try {
                const r = await api.server('run', { action: 'push', invoice_id: i.id });
                out.push({ inv: i.inv, ok: true, text: r.note ?? (r.mode === 'updated' ? 'updated' : 'sent') });
            }
            catch (e) {
                out.push({ inv: i.inv, ok: false, text: msg(e) });
            }
        }
        setBusy(null);
        setSel([]);
        setResults(out);
        await reload();
        const bad = out.filter(x => !x.ok).length;
        flash(bad ? `${out.length - bad} sent, ${bad} couldn't go` : `${out.length} sent to QuickBooks`, bad > 0);
    }
    return (_jsxs("div", { className: "list", children: [_jsxs("h2", { children: ["To send ", _jsx(EnvPill, { env: env })] }), banner, _jsxs("div", { className: "row toolbar wrap", children: [_jsx("div", { className: "seg", children: [['send', `Outside sales (${rows.filter(toSend).length})`], ['internal', 'Our own farms'], ['void', 'Void']].map(([k, l]) => _jsx("button", { className: f === k ? 'on' : '', onClick: () => { setF(k); setSel([]); }, children: l }, k)) }), _jsx("input", { className: "search", type: "search", placeholder: "Invoice #, customer or SO", value: q, onChange: e => setQ(e.target.value) })] }), f === 'send' && _jsxs("p", { className: "muted small", children: ["Invoices to outside customers that aren't in ", env === 'sandbox' ? 'the sandbox' : 'QuickBooks', " yet. New ones go on their own 30 minutes after they're made (editing restarts the clock); price fixes made in QuickBooks come back here. You can still open one and send it now, or tick several."] }), f === 'internal' && _jsx("p", { className: "muted small", children: "Transfers to our own farms (clones to OHR / GVR and so on). These never go to QuickBooks." }), f === 'send' && canEdit && shown.length > 0 && (_jsxs("div", { className: "row wrap", children: [_jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: sel.length > 0 && sel.length === shown.length, onChange: e => setSel(e.target.checked ? shown.map(i => i.id) : []) }), " Select all"] }), sel.length > 0 && _jsx("button", { className: "primary small", disabled: !!busy, onClick: sendMany, children: busy ?? `Send ${sel.length} to QuickBooks` })] })), results.length > 0 && _jsxs("div", { className: `${results.every(r => r.ok) ? 'viewbanner' : 'warnbox'} small`, children: [results.map(r => _jsxs("div", { children: [_jsx("b", { children: r.inv }), ": ", r.ok ? '✓ ' : '✕ ', r.text] }, r.inv)), _jsx("button", { className: "linkbtn", onClick: () => setResults([]), children: "Hide" })] }), f === 'send' && _jsx(CreditMemosToSend, { api: api, env: env, canEdit: canEdit, flash: flash }), !shown.length && _jsx(Empty, { children: f === 'send' ? 'Nothing to send.' : 'None.' }), shown.map(i => (_jsxs("div", { className: "li setrow acctrow", children: [f === 'send' && canEdit && _jsx("input", { type: "checkbox", checked: sel.includes(i.id), onChange: e => setSel(s => e.target.checked ? [...s, i.id] : s.filter(x => x !== i.id)) }), _jsxs("button", { className: "grow plain", onClick: () => open(i.id), children: [_jsxs("div", { children: [_jsx("b", { children: i.inv }), " ", i.nursery && _jsx("span", { className: "pill", children: "1PN" }), " ", i.push?.status === 'error' && _jsx("span", { className: "pill acct-error", children: "Couldn't send" }), " ", _jsx("span", { className: `pill inv-${i.status}`, children: i.status === 'paid' ? 'Paid (app)' : i.status === 'void' ? 'Void' : 'Open' })] }), _jsxs("div", { className: "muted", children: [i.customer, " \u00B7 ", dfmt(i.date), i.so ? ` · ${i.so}` : '', i.terms ? ` · ${i.terms}` : ''] }), i.push?.status === 'error' && _jsx("div", { className: "bad-t small", children: i.push.error }), i.push_after && i.push?.status !== 'error' && _jsxs("div", { className: "small muted", children: ["Goes automatically at ", new Date(i.push_after).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })] })] }), _jsx("b", { className: "num", children: money(i.total) })] }, i.id)))] }));
}
// ---------- credit memos from returns (159), on To send ----------
function CreditMemosToSend({ api, env, canEdit, flash }) {
    const [rows, setRows] = useState(null);
    const [busy, setBusy] = useState(null);
    const load = useCallback(async () => setRows(await api.creditMemosToSend()), [api]);
    const [view, setView] = useState(null);
    useEffect(() => { load(); }, [load]);
    if (!rows || !rows.length)
        return null;
    async function send(c) {
        if (!confirm(`Send credit memo ${c.number} (${money(c.total)}, ${c.customer}) to ${env === 'sandbox' ? 'the sandbox' : 'QuickBooks'} now?`))
            return;
        setBusy(c.number);
        try {
            const r = await api.server('run', { action: 'push_cm', credit_memo_id: c.id });
            flash(r.note ?? `${c.number} is in QuickBooks (#${r.doc_number})`);
        }
        catch (e) {
            flash(msg(e), true);
        }
        finally {
            setBusy(null);
            await load();
        }
    }
    async function link(c) {
        const num = prompt(`Already made in QuickBooks by hand? Type that credit memo's number to link ${c.number} to it (nothing changes in QuickBooks):`, '');
        if (!num)
            return;
        setBusy(c.number);
        try {
            const r = await api.server('run', { action: 'link_cm', credit_memo_id: c.id, qbo_doc: num });
            flash(`${c.number} linked to QuickBooks #${r.qbo.doc_number}${r.warning ? `. ${r.warning}` : ''}`);
        }
        catch (e) {
            flash(msg(e), true);
        }
        finally {
            setBusy(null);
            await load();
        }
    }
    return _jsxs(_Fragment, { children: [_jsxs("h3", { children: ["Credit memos (", rows.length, ")"] }), _jsx("p", { className: "muted small", children: "From returns (Sales \u203A Returns), made when the product was received in METRC. They go on their own 30 minutes after they're made while auto-send is on." }), rows.map(c => {
                const at = new Date(new Date(c.created_at).getTime() + 30 * 60000);
                return _jsxs("div", { className: "li setrow acctrow", children: [_jsxs("button", { className: "grow plain", onClick: () => setView(c), children: [_jsxs("div", { children: [_jsx("b", { children: c.number }), " ", _jsx("span", { className: "pill", children: "Credit memo" }), " ", c.acct_status === 'error' && _jsx("span", { className: "pill acct-error", children: "Couldn't send" })] }), _jsxs("div", { className: "muted", children: [c.customer, " \u00B7 ", dfmt(c.date), " \u00B7 return ", c.rma] }), c.error && _jsx("div", { className: "bad-t small", children: c.error }), c.acct_status === 'pending' && _jsx("div", { className: "small muted", children: at > new Date() ? `Goes automatically at ${at.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Goes with the next automatic send (if auto-send is on)' })] }), _jsxs("b", { className: "num", children: ["-", money(c.total)] }), canEdit && _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost small", disabled: !!busy, onClick: () => link(c), children: "Already in QuickBooks?" }), _jsx("button", { className: "primary small", disabled: !!busy, onClick: () => send(c), children: busy === c.number ? 'Sending…' : 'Send now' })] })] }, c.id);
            }), _jsx("h3", { children: "Invoices" }), view && _jsx(CmPreview, { api: api, c: view, env: env, canEdit: canEdit, busy: !!busy, onClose: () => setView(null), onSend: async () => { const c = view; setView(null); await send(c); } })] });
}
/** what the credit memo will look like in QuickBooks, before it's sent */
function CmPreview({ api, c, env, canEdit, busy, onClose, onSend }) {
    const [p, setP] = useState(null);
    const [err, setErr] = useState(null);
    useEffect(() => { api.cmPayload(c.id).then(setP).catch(e => setErr(msg(e))); }, [c.id]);
    return _jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: "sheet form wide", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsxs("h3", { children: ["Credit memo ", c.number] }), _jsx("button", { className: "ghost", "aria-label": "Close", onClick: onClose, children: "\u2715" })] }), err && _jsx("p", { className: "bad-t", children: err }), !p && !err && _jsx("p", { className: "muted", children: "Loading\u2026" }), p && _jsxs(_Fragment, { children: [_jsxs("dl", { children: [_jsx("dt", { children: "Customer" }), _jsxs("dd", { children: [_jsx("b", { children: p.customer.qbo_name || p.customer.legal_name }), p.customer.qbo_name && p.customer.qbo_name !== p.customer.name ? _jsxs("span", { className: "muted", children: [" (", p.customer.name, " in the app)"] }) : null] }), _jsx("dt", { children: "Date" }), _jsx("dd", { children: dfmt(p.date) }), _jsx("dt", { children: "Number" }), _jsx("dd", { children: p.doc_number }), _jsx("dt", { children: "Return" }), _jsx("dd", { children: p.rma }), p.memo && _jsxs(_Fragment, { children: [_jsx("dt", { children: "Message" }), _jsx("dd", { children: p.memo })] })] }), _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "ct", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Product / service" }), _jsx("th", { children: "Description" }), _jsx("th", { children: "Class" }), _jsx("th", { className: "num", children: "Qty (lbs)" }), _jsx("th", { className: "num", children: "Rate" }), _jsx("th", { className: "num", children: "Amount" })] }) }), _jsx("tbody", { children: p.lines.map(l => _jsxs("tr", { children: [_jsx("td", { children: l.item ?? _jsx("span", { className: "bad-t", children: l.product }) }), _jsx("td", { children: l.description }), _jsx("td", { children: l.class ?? _jsx("span", { className: "bad-t", children: "none" }) }), _jsx("td", { className: "num", children: Number(l.qty).toLocaleString(undefined, { maximumFractionDigits: 2 }) }), _jsx("td", { className: "num", children: money(l.price) }), _jsx("td", { className: "num", children: money(l.amount) })] }, l.line_id)) }), _jsx("tfoot", { children: _jsxs("tr", { children: [_jsx("td", { colSpan: 5, children: _jsx("b", { children: "Total credit" }) }), _jsx("td", { className: "num", children: _jsx("b", { children: money(p.total) }) })] }) })] }) }), p.problems.length > 0 && _jsx("div", { className: "warnbox small", children: p.problems.map(x => _jsx("div", { children: x }, x)) }), _jsxs("p", { className: "muted small", children: ["This is what goes to ", env === 'sandbox' ? 'the sandbox' : 'QuickBooks', ": one line per strain, the customer as matched in QuickBooks, the class from the farm and crop year."] })] }), _jsxs("div", { className: "row between", children: [_jsx("button", { className: "ghost", onClick: onClose, children: "Close" }), canEdit && _jsx("button", { className: "primary", disabled: busy || !p || p.problems.length > 0, onClick: onSend, children: "Send now" })] })] }) });
}
// ---------- In QuickBooks ----------
function SentList({ api, rows, env, flash, open, reload, lastSync, connected, banner }) {
    const [f, setF] = useState('unpaid');
    const [q, setQ] = useState('');
    const [busy, setBusy] = useState(false);
    const sent = rows.filter(i => i.push?.status === 'sent');
    const ql = q.trim().toLowerCase();
    const isOd = (i) => unpaid(i) && !!i.due && i.due < today();
    const shown = sent.filter(i => (f === 'all' || (f === 'unpaid' ? unpaid(i) : f === 'overdue' ? isOd(i) : !unpaid(i))) && (!ql || `${i.inv} ${i.customer} ${i.push?.doc_number ?? ''}`.toLowerCase().includes(ql)));
    async function sync() {
        setBusy(true);
        try {
            const r = await api.server('run', { action: 'sync' });
            await reload();
            const parts = [`Checked ${r.checked} sent invoice${r.checked === 1 ? '' : 's'}`, r.paid ? `${r.paid} now paid` : '', r.reopened ? `${r.reopened} reopened` : '',
                r.changed ? `${r.changed} changed in QuickBooks` : '',
                r.customers != null ? `${r.customers} customer balances from QuickBooks${r.matched ? ` (${r.matched} newly matched)` : ''}` : '',
                r.unmatched ? `${r.unmatched} customers not matched to QuickBooks` : '',
                r.docs != null ? `${r.docs} invoice copies updated` : '',
                r.docs_removed ? `${r.docs_removed} deleted in QuickBooks, removed here` : '',
                r.invoices_voided ? `${r.invoices_voided} copied invoice${r.invoices_voided === 1 ? '' : 's'} voided${r.orders_cancelled ? ` (${r.orders_cancelled} order${r.orders_cancelled === 1 ? '' : 's'} cancelled)` : ''}` : '',
                r.invoices_flagged ? `${r.invoices_flagged} app invoice${r.invoices_flagged === 1 ? '' : 's'} no longer in QuickBooks: see Review` : '',
                r.pdfs_left ? `${r.pdfs_left} PDFs still to fetch: click again` : r.docs != null ? 'all PDFs saved' : ''];
            const err = r.docs_error ?? r.customers_error ?? r.remove_error;
            flash(parts.filter(Boolean).join(' · ') + (err ? ` · Problem: ${err}` : ''), !!err);
        }
        catch (e) {
            flash(msg(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    const tot = (xs) => xs.reduce((a, i) => a + Number(i.push?.balance ?? i.push?.total ?? 0), 0);
    return (_jsxs("div", { className: "list", children: [_jsxs("div", { className: "row between wrap", children: [_jsxs("h2", { children: ["In QuickBooks ", _jsx(EnvPill, { env: env })] }), _jsx("button", { className: "ghost small", disabled: busy || !connected, onClick: sync, children: busy ? 'Checking…' : 'Check payments now' })] }), banner, _jsxs("p", { className: "muted small", children: ["QuickBooks is where payments are recorded. Balances here come from QuickBooks (last checked ", lastSync ? when(lastSync) : 'never', "; it checks every hour)."] }), _jsxs(Tiles, { children: [_jsx(Tile, { label: "Unpaid", value: dollars(tot(sent.filter(unpaid))), sub: `${sent.filter(unpaid).length} invoices`, onClick: () => setF('unpaid') }), _jsx(Tile, { label: "Overdue", value: dollars(tot(sent.filter(isOd))), sub: `${sent.filter(isOd).length} invoices`, tone: sent.some(isOd) ? 'warn' : 'ok', onClick: () => setF('overdue') })] }), _jsxs("div", { className: "row toolbar wrap", children: [_jsx("div", { className: "seg", children: ['unpaid', 'overdue', 'paid', 'all'].map(k => _jsx("button", { className: f === k ? 'on' : '', onClick: () => setF(k), children: k[0].toUpperCase() + k.slice(1) }, k)) }), _jsx("input", { className: "search", type: "search", placeholder: "Invoice #, customer", value: q, onChange: e => setQ(e.target.value) })] }), !shown.length && _jsx(Empty, { children: "None here." }), shown.map(i => (_jsxs("button", { className: "li setrow", onClick: () => open(i.id), children: [_jsxs("div", { className: "grow", children: [_jsxs("div", { children: [_jsx("b", { children: i.inv }), " ", _jsx("span", { className: `pill ${isOd(i) ? 'inv-overdue' : unpaid(i) ? 'inv-open' : 'inv-paid'}`, children: isOd(i) ? 'Overdue' : unpaid(i) ? 'Unpaid' : 'Paid' }), i.push?.error && _jsx("span", { className: "pill acct-error", children: i.push.error })] }), _jsxs("div", { className: "muted", children: [i.customer, " \u00B7 ", dfmt(i.date), i.due ? ` · due ${dfmt(i.due)}` : '', " \u00B7 QuickBooks #", i.push?.doc_number, " \u00B7 sent ", when(i.push?.sent_at), " by ", (i.push?.sent_by ?? '').split('@')[0]] })] }), _jsxs("div", { className: "num", children: [_jsx("b", { children: money(Number(i.push?.balance ?? i.total)) }), _jsxs("div", { className: "muted small", children: ["of ", money(Number(i.push?.total ?? i.total))] })] })] }, i.id)))] }));
}
// ---------- Review ----------
function ReviewTab({ api, rows, open }) {
    const [noProduct, setNoProduct] = useState(null);
    useEffect(() => { api.linesWithoutProduct().then(setNoProduct).catch(() => setNoProduct(new Set())); }, [rows]);
    const errs = rows.filter(i => i.push?.status === 'error' && i.status !== 'void');
    const gone = rows.filter(i => i.push?.status === 'sent' && i.push.error);
    const missing = rows.filter(i => toSend(i) && noProduct?.has(i.id));
    const changed = rows.filter(i => i.push?.status === 'sent' && i.push.total != null && Math.abs(Number(i.push.total) - Number(i.total)) > 0.005);
    const paidHere = rows.filter(i => toSend(i) && i.status === 'paid');
    const sec = (title, note, xs, extra) => xs.length > 0 && (_jsxs(_Fragment, { children: [_jsxs("h3", { children: [title, " (", xs.length, ")"] }), _jsx("p", { className: "muted small", children: note }), xs.map(i => _jsxs("button", { className: "li setrow", onClick: () => open(i.id), children: [_jsxs("div", { className: "grow", children: [_jsx("b", { children: i.inv }), " ", _jsxs("span", { className: "muted", children: [i.customer, " \u00B7 ", dfmt(i.date)] }), extra && _jsx("div", { className: "small", children: extra(i) })] }), _jsx("b", { className: "num", children: money(i.total) })] }, i.id))] }));
    const flagged = rows.filter(i => (i.flags?.length ?? 0) > 0);
    const none = !errs.length && !gone.length && !missing.length && !changed.length && !paidHere.length && !flagged.length;
    return (_jsxs("div", { className: "list", children: [_jsx("h2", { children: "Review" }), none && _jsx(Empty, { children: "All clear." }), sec("Couldn't send", 'Open it to see why. Usually a product or class that isn\'t in QuickBooks with the same name, or a line with no product.', errs, i => _jsx("span", { className: "bad-t", children: i.push?.error })), sec('Lines with no QuickBooks product', 'Pick a product for each line before sending.', missing), sec('Not found in QuickBooks anymore', 'Sent, but the last check couldn\'t find it (deleted or voided in QuickBooks?).', gone, i => _jsx("span", { className: "bad-t", children: i.push?.error })), sec('Different total in QuickBooks', 'Someone changed it in QuickBooks after it was sent, or it was changed here before the lock.', changed, i => _jsxs("span", { children: ["QuickBooks ", money(Number(i.push?.total)), " \u00B7 app ", money(i.total)] })), sec('Changed in QuickBooks: check these', 'Prices changed in QuickBooks come back to the app on their own. These are changes the app didn\'t copy (quantities match METRC and never change here; lines it doesn\'t know).', flagged, i => _jsx("span", { className: "warn-t", children: i.flags.join(' · ') })), sec('Marked paid in the app but not in QuickBooks', 'Payments belong in QuickBooks. Send the invoice, then record the payment there.', paidHere)] }));
}
function LinkBox({ api, id, env, relink, flash, onLinked }) {
    const [openBox, setOpenBox] = useState(false);
    const [num, setNum] = useState('');
    const [look, setLook] = useState(null);
    const [busy, setBusy] = useState(false);
    const where = env === 'sandbox' ? 'the sandbox' : 'QuickBooks';
    async function call(confirm) {
        setBusy(true);
        try {
            const r = await api.server('run', { action: 'link', invoice_id: id, qbo_doc: num.trim(), confirm });
            if (r.linked) {
                flash(`Linked to ${where} #${r.qbo.doc_number}. Nothing was changed in QuickBooks.`);
                setOpenBox(false);
                setLook(null);
                setNum('');
                await onLinked();
            }
            else
                setLook(r);
        }
        catch (e) {
            flash(msg(e), true);
            setLook(null);
        }
        finally {
            setBusy(false);
        }
    }
    if (!openBox)
        return _jsx("p", { className: "muted small", children: _jsx("button", { className: "linkbtn", onClick: () => setOpenBox(true), children: relink ? `Linked to the wrong ${where} invoice? Change the link` : `Already in ${where} under another number? Link it instead of sending` }) });
    return (_jsxs("div", { className: "infobox linkbox", children: [_jsx("p", { className: "small", children: relink ? `Point this invoice at a different invoice in ${where}. The one it's linked to now stays there: delete or void it in QuickBooks if it's a duplicate.`
                    : `Type the invoice number ${where} has for this sale. The app links to it and stops waiting to send; nothing is created or changed in QuickBooks. Paid status and balance then come from QuickBooks.` }), _jsxs("div", { className: "row wrap", children: [_jsx("input", { value: num, onChange: e => { setNum(e.target.value); setLook(null); }, placeholder: `${env === 'sandbox' ? 'Sandbox' : 'QuickBooks'} invoice #`, onKeyDown: e => { if (e.key === 'Enter' && num.trim())
                            call(false); } }), _jsx("button", { className: "ghost small", disabled: busy || !num.trim(), onClick: () => call(false), children: busy && !look ? 'Looking…' : 'Find it' }), _jsx("button", { className: "ghost small", onClick: () => { setOpenBox(false); setLook(null); }, children: "Cancel" })] }), look && _jsxs(_Fragment, { children: [_jsxs("p", { children: [_jsxs("b", { children: ["#", look.qbo.doc_number] }), " \u00B7 ", look.qbo.customer ?? '?', " \u00B7 ", dfmt(look.qbo.date), " \u00B7 ", money(look.qbo.total), look.qbo.balance > 0 ? ` · ${money(look.qbo.balance)} open` : ' · paid'] }), look.warnings.length > 0 && _jsx("div", { className: "warnbox", children: look.warnings.map((w, k) => _jsx("div", { children: w }, k)) }), _jsx("button", { className: "primary small", disabled: busy, onClick: () => call(true), children: busy ? 'Linking…' : look.warnings.length ? 'Link anyway' : `Link to #${look.qbo.doc_number}` })] })] }));
}
function SendSheet({ api, id, flash, canEdit, isAdmin = false, env, onClose, onChanged, onPdf }) {
    const [p, setP] = useState(null);
    const [products, setProducts] = useState([]);
    const [classes, setClasses] = useState([]);
    const [busy, setBusy] = useState(false);
    const [add, setAdd] = useState(null);
    const load = useCallback(async () => { try {
        setP(await api.payload(id));
    }
    catch (e) {
        flash(msg(e), true);
        onClose();
    } }, [api, id]);
    useEffect(() => { load(); api.products().then(setProducts).catch(() => { }); api.classes().then(setClasses).catch(() => { }); }, [load]);
    if (!p)
        return _jsx("div", { className: "scrim", onClick: onClose, children: _jsx("div", { className: "sheet", onClick: e => e.stopPropagation(), children: _jsx("p", { className: "muted", children: "Loading\u2026" }) }) });
    const locked = p.push?.status === 'sent' && env === 'production';
    const editable = canEdit && !locked && p.status !== 'void';
    const run = async (f, ok) => { setBusy(true); try {
        await f();
        await load();
        onChanged();
        if (ok)
            flash(ok);
    }
    catch (e) {
        flash(msg(e), true);
    }
    finally {
        setBusy(false);
    } };
    const byLine = new Map();
    for (const l of p.lines)
        byLine.set(l.line_id, [...(byLine.get(l.line_id) ?? []), l]);
    const productLines = p.lines.filter(l => ['flower', 'bio', 'clones'].includes(l.grp ?? ''));
    async function send() {
        setBusy(true);
        try {
            const r = await api.server('run', { action: 'push', invoice_id: id });
            flash(r.note ?? `${r.doc_number} ${r.mode === 'updated' ? 'updated in' : 'sent to'} ${env === 'sandbox' ? 'the sandbox' : 'QuickBooks'}`, !!r.note && /different/.test(r.note));
            await load();
            onChanged();
        }
        catch (e) {
            flash(msg(e), true);
            await load();
            onChanged();
        }
        finally {
            setBusy(false);
        }
    }
    const sentLabel = p.push?.status === 'sent' ? `In ${env === 'sandbox' ? 'the sandbox' : 'QuickBooks'} as #${p.push.doc_number} · sent ${when(p.push.sent_at)} by ${(p.push.sent_by ?? '').split('@')[0]}` : null;
    return (_jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: "sheet docsheet acctsheet", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsxs("h2", { children: [p.doc_number, " ", _jsx(EnvPill, { env: env })] }), _jsx("button", { className: "ghost", onClick: onClose, children: "\u2715" })] }), _jsxs("div", { className: "row wrap docmeta", children: [_jsx("b", { children: p.customer.legal_name }), _jsxs("span", { className: "muted", children: [money(p.total), " \u00B7 ", dfmt(p.date), " \u00B7 ", p.terms, p.due ? ` · due ${dfmt(p.due)}` : '', p.so ? ` · ${p.so}` : ''] }), p.nursery && _jsx("span", { className: "pill", children: "1PN" }), _jsx("button", { className: "ghost small", onClick: onPdf, children: "Invoice PDF" })] }), sentLabel && _jsxs("p", { className: "ok-t", children: [sentLabel, p.push?.balance != null ? ` · balance ${money(Number(p.push.balance))}` : ''] }), p.push?.status === 'error' && _jsxs("div", { className: "warnbox", children: ["Last try: ", p.push.error] }), p.problems.length > 0 && _jsx("div", { className: "warnbox", children: p.problems.map((x, k) => _jsx("div", { children: x }, k)) }), !p.customer.qbo_id && p.customer.kind === 'external' && _jsxs("p", { className: "muted small", children: ["The customer isn't linked to QuickBooks yet. On send it's matched by name (\"", p.customer.qbo_name || p.customer.legal_name, "\") or added."] }), _jsxs("table", { className: "restable acctlines", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Line" }), _jsx("th", { children: "QuickBooks product" }), _jsx("th", { children: "Class" }), _jsx("th", { className: "num", children: "Qty" }), _jsx("th", { className: "num", children: "Price" }), _jsx("th", { className: "num", children: "Amount" }), editable && _jsx("th", {})] }) }), _jsx("tbody", { children: p.lines.map((l, k) => {
                                const first = byLine.get(l.line_id)?.[0] === l;
                                const split = (byLine.get(l.line_id)?.length ?? 1) > 1;
                                return (_jsxs("tr", { children: [_jsx("td", { className: "desc", children: l.description.split('\n').map((s, j) => _jsx("div", { className: j ? 'muted small' : '', children: s }, j)) }), _jsx("td", { children: editable && first ? _jsxs(Select, { value: l.product ?? '', disabled: busy, onChange: e => run(() => api.setLine(id, l.line_id, e.target.value || null, l.class_set ?? null, l.applies_to ?? null)), children: [_jsx("option", { value: "", children: "Pick\u2026" }), products.filter(x => x.active || x.code === l.product).map(x => _jsx("option", { value: x.code, children: x.name }, x.code))] })
                                                : _jsx("span", { className: l.product ? '' : 'bad-t', children: l.item ?? 'none' }) }), _jsxs("td", { children: [editable && first && !split ? _jsxs(Select, { value: l.class_set ?? '', disabled: busy, onChange: e => run(() => api.setLine(id, l.line_id, l.product, e.target.value || null, l.applies_to ?? null)), children: [_jsx("option", { value: "", children: l.class && !l.class_set ? `${l.class} (from rules)` : l.class_set ? 'Back to the rules' : 'Pick…' }), classes.filter(c => c.active).map(c => _jsx("option", { value: c.name, children: c.name }, c.name))] })
                                                    : _jsx("span", { className: l.class ? '' : 'bad-t', children: l.class ?? 'none' }), _jsxs("div", { className: "muted small", children: [[l.site, l.year].filter(Boolean).join(' · '), split ? ' · split by farm' : ''] })] }), _jsx("td", { className: "num", children: Number(l.qty).toLocaleString() }), _jsx("td", { className: "num", children: money(Number(l.price)) }), _jsx("td", { className: "num", children: money(Number(l.amount)) }), editable && _jsx("td", { children: first && l.kind === 'charge' && _jsx("button", { className: "ghost small", disabled: busy, title: "Remove line", onClick: () => run(() => api.removeLine(id, l.line_id), 'Removed'), children: "\u2715" }) })] }, k));
                            }) }), _jsx("tfoot", { children: _jsxs("tr", { children: [_jsx("td", { colSpan: 5, children: _jsx("b", { children: "Total" }) }), _jsx("td", { className: "num", children: _jsx("b", { children: money(p.total) }) }), editable && _jsx("td", {})] }) })] }), _jsx("p", { className: "muted small", children: "The class comes from where each package was grown and its harvest year (Accounting \u203A Settings \u203A Class rules). Picking a class in the dropdown overrides the rules for that line." }), editable && (add ? (_jsxs("div", { className: "row wrap invcharge", children: [_jsx(Select, { value: add.product, onChange: e => setAdd({ ...add, product: e.target.value }), children: products.filter(x => x.active && ['shipping', 'adjust', 'other'].includes(x.grp)).map(x => _jsx("option", { value: x.code, children: x.name }, x.code)) }), _jsx("input", { placeholder: "Description (optional)", value: add.desc, onChange: e => setAdd({ ...add, desc: e.target.value }) }), _jsx("input", { type: "number", step: "0.01", placeholder: "Amount", value: add.amount, onChange: e => setAdd({ ...add, amount: e.target.value }) }), products.find(x => x.code === add.product)?.grp === 'adjust' && _jsxs(Select, { value: add.applies, onChange: e => setAdd({ ...add, applies: e.target.value }), children: [_jsx("option", { value: "", children: "Applies to: biggest line" }), [...new Map(productLines.map(l => [l.line_id, l])).values()].map(l => _jsx("option", { value: l.line_id, children: l.description.split('\n')[0] }, l.line_id))] }), _jsx("button", { className: "primary small", disabled: busy || add.amount === '', onClick: () => run(() => api.addLine(id, add.product, add.desc, 1, Number(add.amount), add.applies ? Number(add.applies) : null), 'Line added').then(() => setAdd(null)), children: "Add" }), _jsx("button", { className: "ghost small", onClick: () => setAdd(null), children: "Cancel" }), products.find(x => x.code === add.product)?.grp === 'adjust' && _jsx("span", { className: "muted small", children: "Discounts, returns and refunds go on as a minus amount." })] })) : _jsx("button", { className: "ghost small", onClick: () => setAdd({ product: products.find(x => x.grp === 'shipping')?.code ?? 'SHIPPING', desc: '', amount: '', applies: '' }), children: "+ Shipping, discount, return or refund" })), p.memo && _jsxs("div", { className: "muted small acctmemo", children: [_jsx("b", { children: "Message on the invoice:" }), " ", p.memo.split('\n').map((s, k) => _jsx("div", { children: s }, k))] }), _jsxs("div", { className: "row between wrap", children: [_jsx("span", { className: "muted small", children: locked ? 'Locked: it\'s in your real QuickBooks. Make changes there.' : env === 'sandbox' && p.push?.status === 'sent' ? 'Sending again updates the sandbox copy.' : '' }), canEdit && !locked && _jsx("button", { className: "primary", disabled: busy || p.problems.length > 0, onClick: send, children: busy ? 'Working…' : p.push?.status === 'sent' ? 'Send again (update)' : `Send to ${env === 'sandbox' ? 'sandbox' : 'QuickBooks'}` })] }), canEdit && p.status !== 'void' && (!locked || isAdmin) &&
                    _jsx(LinkBox, { api: api, id: id, env: env, relink: locked, flash: flash, onLinked: async () => { await load(); onChanged(); } })] }) }));
}
// ---------- Settings ----------
function SettingsTab({ api, flash, conn, env, refresh, sb, canEdit }) {
    const [sec, setSec] = useState('conn');
    return (_jsxs("div", { className: "list", children: [_jsx("h2", { children: "Accounting settings" }), _jsx("div", { className: "seg tabs", children: [['conn', 'QuickBooks'], ['bc', 'Business Central'], ['products', 'Products'], ['classes', 'Classes'], ['rules', 'Class rules'], ['pay', 'Crew and piece rates'], ['people', 'People']].map(([k, l]) => _jsx("button", { className: sec === k ? 'on' : '', onClick: () => setSec(k), children: l }, k)) }), sec === 'conn' && _jsx(ConnPanel, { api: api, flash: flash, conn: conn, env: env, refresh: refresh }), sec === 'bc' && sb && _jsx(BcPanel, { sb: sb, flash: flash, canEdit: canEdit }), sec === 'products' && _jsx(ProductsPanel, { api: api, flash: flash }), sec === 'classes' && _jsx(ClassesPanel, { api: api, flash: flash }), sec === 'rules' && _jsx(RulesPanel, { api: api, flash: flash }), sec === 'pay' && sb && _jsx(PaySettings, { sb: sb, flash: flash, canEdit: canEdit, isAdmin: true }), sec === 'people' && _jsx(ModulePeople, { sb: sb, module: "accounting", flash: flash }), sec === 'people' && _jsx(AlertPeople, { sb: sb, flash: flash })] }));
}
/** Settings > QuickBooks: auto-send on / off. Off = nothing goes to QuickBooks on its own (pause it while switching sandbox to the real books). */
function AutoSend({ api, flash, env, conn }) {
    const [auto, setAuto] = useState(null);
    const [err, setErr] = useState(null);
    const [busy, setBusy] = useState(false);
    const load = () => api.server('run', { action: 'auto' }).then(a => { setAuto(a); setErr(null); }).catch(e => setErr(msg(e)));
    useEffect(() => { load(); }, [conn]);
    async function flip(on) {
        if (!auto)
            return;
        const waiting = auto.due ? `${auto.due >= 40 ? '40 or more invoices are' : auto.due === 1 ? '1 invoice is' : `${auto.due} invoices are`} already waiting and will go to ${ENV_LABEL[env]} within 10 minutes.` : '';
        const ask = on
            ? `Turn auto-send on? New invoices for outside customers will go to ${ENV_LABEL[env]} ${auto.minutes} minutes after they're made.${waiting ? `\n\n${waiting} Check To send first.` : ''}`
            : 'Turn auto-send off? Nothing goes to QuickBooks on its own until it\'s back on. Invoices made while it\'s off won\'t go later on their own: send them from To send.';
        if (!confirm(ask))
            return;
        setBusy(true);
        try {
            setAuto(await api.server('run', { action: 'auto', on }));
            flash(on ? 'Auto-send is on' : 'Auto-send is off');
        }
        catch (e) {
            flash(msg(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs(_Fragment, { children: [_jsx("h3", { children: "Auto-send" }), err ? _jsxs("p", { className: "bad-t small", children: ["Couldn't load auto-send: ", err] }) : !auto ? _jsx("p", { className: "muted small", children: "Loading\u2026" }) : _jsxs(_Fragment, { children: [_jsxs("p", { children: [auto.on ? _jsx("b", { className: "ok-t", children: "On" }) : _jsx("b", { className: "bad-t", children: "Off" }), ' · ', auto.on ? `new invoices for outside customers go to ${ENV_LABEL[env]} ${auto.minutes} minutes after they're made, which is when the stop is delivered (editing restarts the clock).`
                                : 'nothing goes to QuickBooks on its own. Send invoices by hand from To send.'] }), !!auto.due && _jsxs("p", { className: auto.on ? 'muted small' : 'warn-t small', children: [auto.due >= 40 ? '40 or more invoices are' : auto.due === 1 ? '1 invoice is' : `${auto.due} invoices are`, " past their wait", auto.on ? ' and going out now.' : ' and will go within 10 minutes of turning auto-send on.'] }), _jsx("div", { className: "row wrap", children: _jsx("button", { className: auto.on ? 'ghost' : 'primary', disabled: busy, onClick: () => flip(!auto.on), children: busy ? 'Saving…' : auto.on ? 'Turn auto-send off' : 'Turn auto-send on' }) }), _jsx("p", { className: "muted small", children: "Turn it off before switching from the sandbox to your real QuickBooks, send one invoice by hand to check it, then turn it back on. While it's off, new invoices aren't queued, so they won't go later on their own." })] })] }));
}
function ConnPanel({ api, flash, conn, env, refresh }) {
    const [busy, setBusy] = useState(null);
    const [rows, setRows] = useState([]);
    const [check, setCheck] = useState(null);
    const [refs, setRefs] = useState(null);
    useEffect(() => { api.connection().then(c => setRows(c.connections)).catch(() => { }); }, [conn]);
    const act = async (label, f) => { setBusy(label); try {
        await f();
    }
    catch (e) {
        flash(msg(e), true);
    }
    finally {
        setBusy(null);
    } };
    const cur = rows.find(r => r.env === env);
    return (_jsxs("div", { className: "dlist acctconn", children: [_jsxs("p", { children: ["Connected to: ", _jsx("b", { children: ENV_LABEL[env] }), " ", _jsx(EnvPill, { env: env })] }), conn?.connected ? _jsxs("p", { className: "ok-t", children: ["\u2713 ", conn.company ?? 'Connected', cur ? ` · connected by ${(cur.connected_by ?? '').split('@')[0]} ${when(cur.connected_at)}` : ''] })
                : _jsxs("p", { className: "bad-t", children: ["Not connected", conn?.error ? `: ${conn.error}` : ''] }), cur?.last_error && _jsxs("p", { className: "bad-t small", children: ["Last problem: ", cur.last_error] }), _jsxs("div", { className: "row wrap", children: [_jsx("button", { className: "primary", disabled: !!busy, onClick: () => act('connect', async () => { const r = await api.server('connect', {}); location.href = r.url; }), children: conn?.connected ? 'Reconnect' : 'Connect QuickBooks' }), conn?.connected && env === 'sandbox' && _jsx("button", { className: "ghost", disabled: !!busy, onClick: () => act('setup', async () => { const r = await api.server('run', { action: 'setup' }); flash(`Sandbox set up: ${r.classes} classes and ${r.products} products added (income account "${r.income_account}")`); }), children: busy === 'setup' ? 'Setting up…' : 'Set up sandbox' }), conn?.connected && _jsx("button", { className: "ghost", disabled: !!busy, onClick: () => act('check', async () => setCheck(await api.server('run', { action: 'check' }))), children: busy === 'check' ? 'Checking…' : 'Check products and classes' }), conn?.connected && _jsx("button", { className: "ghost", disabled: !!busy, onClick: () => { if (confirm(`Disconnect ${ENV_LABEL[env]}? Sending stops until someone connects again.`))
                            act('disc', async () => { await api.server('run', { action: 'disconnect' }); flash('Disconnected'); refresh(); }); }, children: "Disconnect" })] }), check && (check.missing.products.length || check.missing.classes.length
                ? _jsxs("div", { className: "warnbox", children: ["Not found in QuickBooks with exactly these names:", check.missing.products.length > 0 && _jsxs("div", { children: ["Products: ", check.missing.products.join(', ')] }), check.missing.classes.length > 0 && _jsxs("div", { children: ["Classes: ", check.missing.classes.join(', ')] }), _jsxs("div", { className: "small", children: ["Add them in QuickBooks, or fix the names here under Products / Classes.", env === 'sandbox' ? ' On the sandbox, Set up sandbox adds them.' : ''] })] })
                : _jsxs("p", { className: "ok-t", children: ["\u2713 All ", check.products, " products and the ", check.classes, " classes the rules use are in QuickBooks."] })), _jsx(AutoSend, { api: api, flash: flash, env: env, conn: conn }), _jsx("h3", { children: "How it works" }), _jsxs("ul", { className: "muted small", children: [_jsx("li", { children: "Which QuickBooks the app talks to is set in Vercel (QBO_ENV = sandbox or production). Switching means changing that, redeploying, and connecting here again." }), _jsx("li", { children: "The sandbox is Intuit's test company. Sending there doesn't lock invoices or mark them paid." }), _jsx("li", { children: "In the real QuickBooks: sent invoices lock in the app, and paid / balance come back from QuickBooks every hour, 7am to 8pm Monday to Saturday (or Check payments now)." }), _jsx("li", { children: "Already in QuickBooks under another number? Open the invoice in To send and link it: nothing is created or changed in QuickBooks." }), _jsx("li", { children: "Customers are matched to QuickBooks by name on each check. Their statement then shows QuickBooks' balance and invoices, and each invoice opens QuickBooks' own copy." }), _jsx("li", { children: "Deleted an invoice in QuickBooks? The next check removes it here too. If the app made that invoice, it stays and shows in Review so you can link it to the right QuickBooks invoice or void it." }), _jsx("li", { children: "The QuickBooks login is kept on the server. Nobody can read it from the app." }), _jsxs("li", { children: ["Problems with QuickBooks? Email ", _jsx("a", { href: "mailto:accounting@lifted-organics.com?subject=QuickBooks%20connection", children: "accounting@lifted-organics.com" }), ". Include the error message and its QuickBooks ref, if it shows one."] })] }), _jsx("h3", { children: "Matched in QuickBooks" }), refs == null ? _jsx("button", { className: "ghost small", onClick: () => api.refs().then(setRefs).catch(e => flash(msg(e), true)), children: "Show matches" }) : (_jsxs("div", { className: "dlist", children: [refs.filter(r => r.env === env).map(r => (_jsxs("div", { className: "drow", children: [_jsxs("span", { children: [_jsx("b", { children: r.kind }), " ", r.key, " \u2192 ", r.name ?? r.qbo_id, " ", _jsxs("span", { className: "muted small", children: ["#", r.qbo_id] })] }), _jsx("button", { className: "ghost small", title: "Look it up again on the next send", onClick: () => api.forgetRef(r.kind, r.key).then(() => api.refs().then(setRefs)).catch(e => flash(msg(e), true)), children: "Forget" })] }, `${r.kind}${r.key}`))), !refs.some(r => r.env === env) && _jsx(Empty, { children: "Nothing matched yet. Customers, products and classes get matched the first time an invoice uses them." })] }))] }));
}
function ProductsPanel({ api, flash }) {
    const [rows, setRows] = useState(null);
    const [ed, setEd] = useState(null);
    const load = () => api.products().then(setRows).catch(e => flash(msg(e), true));
    useEffect(() => { load(); }, []);
    if (!rows)
        return _jsx("p", { className: "muted", children: "Loading\u2026" });
    const save = async () => { if (!ed)
        return; try {
        await api.saveProduct(ed);
        setEd(null);
        await load();
        flash('Saved');
    }
    catch (e) {
        flash(msg(e), true);
    } };
    return (_jsxs("div", { className: "dlist", children: [_jsx("p", { className: "muted small", children: "Names must match the QuickBooks product / service list exactly. The group decides the class (Class rules) and where the product shows up." }), _jsx("button", { className: "primary small", onClick: () => setEd({ code: '', name: '', grp: 'flower', active: true, isNew: true }), children: "+ Product" }), rows.map(p => _jsxs("button", { className: "drow click", onClick: () => setEd({ ...p, isNew: false }), children: [_jsxs("span", { children: [_jsx("b", { children: p.name }), _jsxs("span", { className: "muted", children: [" \u00B7 ", GRP_LABEL[p.grp]] })] }), !p.active && _jsx("span", { className: "pill", children: "off" })] }, p.code)), ed && _jsx("div", { className: "scrim", onClick: () => setEd(null), children: _jsxs("div", { className: "sheet form", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsx("h2", { children: ed.isNew ? 'New product' : ed.name }), _jsx("button", { className: "ghost", onClick: () => setEd(null), children: "\u2715" })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Name in QuickBooks" }), _jsx("input", { value: ed.name, onChange: e => setEd({ ...ed, name: e.target.value }), placeholder: "Fresh Frozen" })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Group" }), _jsx(Select, { value: ed.grp, onChange: e => setEd({ ...ed, grp: e.target.value }), children: Object.keys(GRP_LABEL).map(g => _jsx("option", { value: g, children: GRP_LABEL[g] }, g)) })] }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: ed.active, onChange: e => setEd({ ...ed, active: e.target.checked }) }), " In use"] }), _jsxs("div", { className: "row between", children: [_jsx("span", {}), _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost", onClick: () => setEd(null), children: "Cancel" }), _jsx("button", { className: "primary", disabled: !ed.name.trim(), onClick: save, children: "Save" })] })] })] }) })] }));
}
function ClassesPanel({ api, flash }) {
    const [rows, setRows] = useState(null);
    const [ed, setEd] = useState(null);
    const load = () => api.classes().then(setRows).catch(e => flash(msg(e), true));
    useEffect(() => { load(); }, []);
    if (!rows)
        return _jsx("p", { className: "muted", children: "Loading\u2026" });
    const save = async () => { if (!ed)
        return; try {
        await api.saveClass(ed.name, ed.old, ed.active);
        setEd(null);
        await load();
        flash('Saved');
    }
    catch (e) {
        flash(msg(e), true);
    } };
    return (_jsxs("div", { className: "dlist", children: [_jsx("p", { className: "muted small", children: "Your QuickBooks classes, named exactly as in QuickBooks. Renaming here changes the rules that use it." }), _jsx("button", { className: "primary small", onClick: () => setEd({ name: '', old: null, active: true }), children: "+ Class" }), rows.map(c => _jsxs("button", { className: "drow click", onClick: () => setEd({ name: c.name, old: c.name, active: c.active }), children: [_jsxs("span", { children: [_jsx("b", { children: c.name }), c.notes && _jsxs("span", { className: "muted", children: [" \u00B7 ", c.notes] })] }), !c.active && _jsx("span", { className: "pill", children: "off" })] }, c.name)), ed && _jsx("div", { className: "scrim", onClick: () => setEd(null), children: _jsxs("div", { className: "sheet form", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsx("h2", { children: ed.old ?? 'New class' }), _jsx("button", { className: "ghost", onClick: () => setEd(null), children: "\u2715" })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Name in QuickBooks" }), _jsx("input", { value: ed.name, onChange: e => setEd({ ...ed, name: e.target.value }) })] }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: ed.active, onChange: e => setEd({ ...ed, active: e.target.checked }) }), " In use"] }), _jsxs("div", { className: "row between", children: [_jsx("span", {}), _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost", onClick: () => setEd(null), children: "Cancel" }), _jsx("button", { className: "primary", disabled: !ed.name.trim(), onClick: save, children: "Save" })] })] })] }) })] }));
}
function RulesPanel({ api, flash }) {
    const [rows, setRows] = useState(null);
    const [classes, setClasses] = useState([]);
    const [dirty, setDirty] = useState(false);
    const load = () => Promise.all([api.rules(), api.classes()]).then(([r, c]) => { setRows(r); setClasses(c); setDirty(false); }).catch(e => flash(msg(e), true));
    useEffect(() => { load(); }, []);
    if (!rows)
        return _jsx("p", { className: "muted", children: "Loading\u2026" });
    const set = (k, patch) => { setRows(rows.map((r, j) => j === k ? { ...r, ...patch } : r)); setDirty(true); };
    const move = (k, d) => { const r = [...rows]; const [x] = r.splice(k, 1); r.splice(k + d, 0, x); setRows(r); setDirty(true); };
    const num = (v) => v === '' ? null : Number(v);
    const save = async () => { try {
        await api.saveRules(rows);
        await load();
        flash('Rules saved');
    }
    catch (e) {
        flash(msg(e), true);
    } };
    return (_jsxs("div", { children: [_jsx("p", { className: "muted small", children: "Each invoice line's class: the first rule that matches wins. Farm comes from the package's METRC batch (FL26-GV\u2026 = GVR, FL26-OH\u2026 = OHR); outside nursery sales are 1PN. Year is the crop / harvest year. Blank = any. Discounts, returns and refunds take the class of the line they apply to." }), _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "restable rules", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", {}), _jsx("th", { children: "Farm" }), _jsx("th", { children: "Group" }), _jsx("th", { children: "From year" }), _jsx("th", { children: "To year" }), _jsx("th", { children: "Class" }), _jsx("th", { children: "Note" }), _jsx("th", {})] }) }), _jsx("tbody", { children: rows.map((r, k) => (_jsxs("tr", { children: [_jsxs("td", { className: "nowrap", children: [_jsx("button", { className: "ghost small", disabled: k === 0, onClick: () => move(k, -1), children: "\u2191" }), _jsx("button", { className: "ghost small", disabled: k === rows.length - 1, onClick: () => move(k, 1), children: "\u2193" })] }), _jsx("td", { children: _jsxs(Select, { value: r.site ?? '', onChange: e => set(k, { site: e.target.value || null }), children: [_jsx("option", { value: "", children: "Any" }), ['OHR', 'GVR', '1PN'].map(s => _jsx("option", { children: s }, s))] }) }), _jsx("td", { children: _jsxs(Select, { value: r.grp ?? '', onChange: e => set(k, { grp: e.target.value || null }), children: [_jsx("option", { value: "", children: "Any" }), Object.keys(GRP_LABEL).filter(g => g !== 'adjust').map(g => _jsx("option", { value: g, children: GRP_LABEL[g].split(' (')[0] }, g))] }) }), _jsx("td", { children: _jsx("input", { className: "qty", type: "number", value: r.year_from ?? '', onChange: e => set(k, { year_from: num(e.target.value) }) }) }), _jsx("td", { children: _jsx("input", { className: "qty", type: "number", value: r.year_to ?? '', onChange: e => set(k, { year_to: num(e.target.value) }) }) }), _jsx("td", { children: _jsx(Select, { value: r.class_name, onChange: e => set(k, { class_name: e.target.value }), children: classes.map(c => _jsx("option", { children: c.name }, c.name)) }) }), _jsx("td", { children: _jsx("input", { value: r.notes ?? '', onChange: e => set(k, { notes: e.target.value || null }) }) }), _jsx("td", { children: _jsx("button", { className: "ghost small", onClick: () => { setRows(rows.filter((_, j) => j !== k)); setDirty(true); }, children: "\u2715" }) })] }, k))) })] }) }), _jsxs("div", { className: "row wrap", children: [_jsx("button", { className: "ghost small", onClick: () => { setRows([...rows, { site: null, grp: null, year_from: null, year_to: null, class_name: classes[0]?.name ?? '', notes: null }]); setDirty(true); }, children: "+ Rule" }), dirty && _jsxs(_Fragment, { children: [_jsx("button", { className: "primary small", onClick: save, children: "Save rules" }), _jsx("button", { className: "ghost small", onClick: load, children: "Undo changes" })] })] })] }));
}
/** 218: who gets Accounting alerts, besides everyone in the Accounting module */
function AlertPeople({ sb, flash }) {
    const [v, setV] = useState(null);
    const [busy, setBusy] = useState(false);
    useEffect(() => { sb?.rpc('acct_alert_people').then(({ data }) => setV(String(data ?? ''))); }, [sb]);
    if (!sb || v === null)
        return null;
    return _jsxs("section", { className: "dcard", style: { marginTop: 12 }, children: [_jsx("h3", { children: "Accounting alerts" }), _jsx("p", { className: "muted small", children: "Everyone in the Accounting module gets them, plus these people (emails, separated by commas). Each person picks push / email in My settings." }), _jsxs("div", { className: "row wrap", children: [_jsx("input", { style: { minWidth: 320 }, value: v, onChange: e => setV(e.target.value), placeholder: "matt@lifted-organics.com, nikki@lifted-organics.com" }), _jsx("button", { className: "primary small", disabled: busy, onClick: async () => {
                            setBusy(true);
                            const { data, error } = await sb.rpc('set_acct_alert_people', { p_emails: v });
                            setBusy(false);
                            if (error)
                                flash(error.message, true);
                            else {
                                setV(String(data ?? ''));
                                flash('Saved');
                            }
                        }, children: "Save" })] })] });
}
