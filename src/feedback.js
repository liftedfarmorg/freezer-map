import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
const KIND = { problem: ["Something's not working", 'm-warn'], question: ['Question', 'm-mute'], idea: ['Idea', 'm-ok'] };
// portal screen keys -> what the customer sees
const SCREEN = { home: 'Home', resmenu: 'Reserves & Menu', reserves: 'Contract Reserves', edit: 'Edit reserves', menu: 'Open Menu', order: 'New order',
    review: 'Review order', ordered: 'Order sent', orders: 'Orders & Statement', contract: 'My Contract', holds: 'Sample Holds', activity: 'Reserve History', yields: 'Yields', yield: 'Report yields',
    reqReview: 'Review reserve request', sent: 'Reserve request sent', ysent: 'Yields sent' };
const SEEN_KEY = 'fb-seen-at';
const when = (s) => new Date(s).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
export function FeedbackView({ sb, flash }) {
    const [rows, setRows] = useState(null);
    const [kind, setKind] = useState('all');
    const [q, setQ] = useState('');
    // what counted as "new" when the page opened (then we mark everything as seen)
    const [seenAt] = useState(() => { try {
        return localStorage.getItem(SEEN_KEY) ?? '';
    }
    catch {
        return '';
    } });
    async function load() {
        if (!sb) {
            setRows([]);
            return;
        }
        const { data, error } = await sb.rpc('list_portal_feedback', { p_limit: 1000 });
        if (error) {
            flash(/list_portal_feedback/.test(error.message) ? 'Customer feedback needs SQL 324 run first.' : error.message, true);
            setRows([]);
            return;
        }
        setRows((data ?? []));
        try {
            localStorage.setItem(SEEN_KEY, new Date().toISOString());
        }
        catch { /* private mode */ }
    }
    useEffect(() => { load(); }, []);
    const ql = q.trim().toLowerCase();
    const list = useMemo(() => (rows ?? []).filter(r => (kind === 'all' || r.kind === kind)
        && (!ql || [r.customer, r.user_name, r.user_email, r.message].some(x => (x ?? '').toLowerCase().includes(ql)))), [rows, kind, ql]);
    const nNew = (rows ?? []).filter(r => r.created_at > seenAt).length;
    return _jsxs("div", { className: "list", children: [_jsxs("div", { className: "row between wrap toolbar", children: [_jsx("h2", { children: "Customer feedback" }), _jsxs("div", { className: "row", children: [_jsxs("select", { value: kind, onChange: e => setKind(e.target.value), "aria-label": "Show", children: [_jsx("option", { value: "all", children: "Everything" }), _jsx("option", { value: "problem", children: "Something's not working" }), _jsx("option", { value: "question", children: "Questions" }), _jsx("option", { value: "idea", children: "Ideas" })] }), _jsx("input", { type: "search", placeholder: "Search customer or text", value: q, onChange: e => setQ(e.target.value), style: { minWidth: 200 } }), _jsx("button", { className: "ghost small", onClick: load, children: "Refresh" })] })] }), _jsxs("p", { className: "muted", children: ["Notes customers send from the portal's Help & feedback button, newest first. Nothing to close out; reach out to the customer if it needs an answer.", nNew > 0 && seenAt ? ` ${nNew} new since you last looked.` : ''] }), rows === null && _jsx("p", { className: "muted", children: "Loading\u2026" }), rows && !list.length && _jsx("p", { className: "muted", children: rows.length ? 'Nothing matches.' : 'No feedback yet.' }), list.map(r => {
                const [kl, kc] = KIND[r.kind] ?? [r.kind, ''];
                return _jsxs("div", { className: "card", children: [_jsxs("div", { className: "row between wrap", children: [_jsxs("div", { children: [_jsx("b", { children: r.customer ?? 'Unknown customer' }), " ", _jsx("span", { className: `pill ${kc}`, children: kl }), seenAt && r.created_at > seenAt && _jsxs(_Fragment, { children: [" ", _jsx("span", { className: "pill m-bad", children: "New" })] }), _jsxs("div", { className: "muted small", children: [r.user_name ?? r.user_email ?? '', r.user_name && r.user_email ? ` · ${r.user_email}` : ''] })] }), _jsxs("div", { className: "muted small", style: { textAlign: 'right' }, children: [when(r.created_at), (r.screen || r.device) && _jsxs("div", { children: [r.screen ? `from ${SCREEN[r.screen] ?? r.screen}` : '', r.screen && r.device ? ' · ' : '', r.device ? r.device.split(' · ')[0] : ''] })] })] }), _jsx("div", { style: { whiteSpace: 'pre-wrap', marginTop: 8 }, children: r.message }), r.user_email && _jsx("div", { className: "small", style: { marginTop: 8 }, children: _jsx("a", { href: `mailto:${r.user_email}?subject=${encodeURIComponent('Re: your note in the Lifted portal')}`, children: "Reply by email" }) })] }, r.id);
            })] });
}
