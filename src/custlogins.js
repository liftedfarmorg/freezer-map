import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Customer portal logins (SQL 203, 208).
//  * CustomerLogins: the customer card (Settings > Customers) lists who logs in for that customer.
//  * AllCustomerLogins: Sales > Settings > Customer logins, every customer login in one list.
// Owners, the Admin module and Sales Admins add logins, make invite/reset links, turn logins off and View as.
// Anyone with Sales can see the lists.
import { useCallback, useEffect, useState } from 'react';
import { LinkBox } from './users';
const ago = (s) => s ? new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
const status = (u) => u.claimed ? 'login set up' : u.invited_at ? `invited ${ago(u.invited_at)}, not set up yet` : 'not invited yet';
async function viewAs(sb, email, flash) {
    const { error } = await sb.rpc('start_view_as', { p_email: email });
    if (error)
        flash(/can_view_as_customers/.test(error.message) ? 'Run 208_customer_logins_view_as.sql in Supabase first' : error.message, true);
    else
        location.reload();
}
function useRun(flash, load) {
    const [busy, setBusy] = useState(false);
    const run = async (f, ok) => {
        setBusy(true);
        try {
            const { error } = await f();
            if (error) {
                flash(error.message, true);
                return false;
            }
            flash(ok);
            await load();
            return true;
        }
        finally {
            setBusy(false);
        }
    };
    return { busy, run };
}
function LoginRow({ backend, sb, u, list, customerName, showCustomer, open, setOpen, busy, run, flash, load }) {
    return _jsxs("div", { children: [_jsxs("div", { className: "drow", children: [_jsxs("span", { className: "grow", children: [_jsx("b", { children: u.name || u.email }), showCustomer && _jsx("span", { className: "pill", style: { marginLeft: 6 }, children: customerName }), ' ', _jsx("span", { className: "muted", children: [u.name ? u.email : '', u.phone, status(u), u.last_seen ? `last in ${ago(u.last_seen)}` : ''].filter(Boolean).join(' · ') })] }), list.can_view_as && _jsx("button", { className: "ghost small", title: "See the portal the way they see it (read only, this tab only, 2 hours)", onClick: () => viewAs(sb, u.email, flash), children: "View as" }), list.can_edit && _jsx("button", { className: "ghost small", onClick: () => setOpen(open === u.email ? null : u.email), children: u.claimed ? 'Reset link' : 'Invite link' }), list.can_edit && _jsx("button", { className: "ghost small", disabled: busy, onClick: () => { if (window.confirm(`Turn off ${u.email}'s login for ${customerName}?`))
                            run(() => sb.rpc('remove_customer_login', { p_email: u.email }), 'Login turned off'); }, children: "Turn off" })] }), open === u.email && _jsx(LinkBox, { backend: backend, email: u.email, claimed: u.claimed, flash: flash, onLinked: load })] });
}
function AddLogin({ customers, fixed, busy, onCancel, onAdd }) {
    const [a, setA] = useState({ cust: fixed?.id ?? 0, email: '', name: '', phone: '' });
    const custName = fixed?.name ?? customers?.find(c => c.id === a.cust)?.name ?? 'this customer';
    return _jsxs("div", { className: "dlist", children: [!fixed && _jsxs("select", { value: a.cust, onChange: e => setA({ ...a, cust: Number(e.target.value) }), children: [_jsx("option", { value: 0, children: "Pick the customer\u2026" }), (customers ?? []).filter(c => c.active && c.kind === 'external').sort((x, y) => x.name.localeCompare(y.name)).map(c => _jsx("option", { value: c.id, children: c.name }, c.id))] }), _jsx("input", { type: "email", autoFocus: !!fixed, placeholder: "Email", value: a.email, onChange: e => setA({ ...a, email: e.target.value }) }), _jsx("input", { placeholder: "Name", value: a.name, onChange: e => setA({ ...a, name: e.target.value }) }), _jsx("input", { type: "tel", placeholder: "Phone (optional)", value: a.phone, onChange: e => setA({ ...a, phone: e.target.value }) }), _jsxs("div", { className: "row end", children: [_jsx("button", { className: "ghost small", onClick: onCancel, children: "Cancel" }), _jsx("button", { className: "primary small", disabled: busy || !a.email.trim() || !a.cust, onClick: () => onAdd(a.cust, a.email.trim().toLowerCase(), a.name, a.phone), children: "Add" })] }), _jsxs("p", { className: "muted small", children: ["They'll only ever see ", custName, "'s reserves, menu and orders. After adding, make the invite link and send it to them."] })] });
}
export function CustomerLogins({ backend, customerId, customerName, flash }) {
    const sb = backend.client();
    const [list, setList] = useState(null);
    const [add, setAdd] = useState(false);
    const [open, setOpen] = useState(null);
    const load = useCallback(async () => {
        if (!sb)
            return;
        const { data, error } = await sb.rpc('customer_logins', { p_customer: customerId });
        if (error) {
            setList({ can_edit: false, users: [] });
            return;
        }
        const d = data;
        setList({ ...d, users: d.users ?? [] });
    }, [sb, customerId]);
    useEffect(() => { load(); }, [load]);
    const { busy, run } = useRun(flash, load);
    if (!sb || list == null)
        return null;
    const rows = list.users;
    return (_jsxs("div", { className: "field custlogins", children: [_jsxs("label", { children: ["Portal logins ", _jsxs("span", { className: "muted", children: ["(", rows.length, ")"] })] }), !rows.length && _jsxs("p", { className: "muted small", children: ["Nobody logs in for ", customerName, " yet."] }), _jsx("div", { className: "dlist", children: rows.map(u => _jsx(LoginRow, { backend: backend, sb: sb, u: u, list: list, customerName: customerName, open: open, setOpen: setOpen, busy: busy, run: run, flash: flash, load: load }, u.email)) }), list.can_edit && !add && _jsx("button", { className: "ghost small", onClick: () => setAdd(true), children: "+ Add a login" }), list.can_edit && add && _jsx(AddLogin, { fixed: { id: customerId, name: customerName }, busy: busy, onCancel: () => setAdd(false), onAdd: async (cid, em, name, phone) => { if (await run(() => sb.rpc('save_customer_login', { p_customer: cid, p_email: em, p_name: name, p_phone: phone }), `${em} added. Make their invite link.`)) {
                    setAdd(false);
                    setOpen(em);
                } } })] }));
}
export function AllCustomerLogins({ backend, customers, flash }) {
    const sb = backend.client();
    const [list, setList] = useState(null);
    const [err, setErr] = useState(null);
    const [q, setQ] = useState('');
    const [add, setAdd] = useState(false);
    const [open, setOpen] = useState(null);
    const load = useCallback(async () => {
        if (!sb)
            return;
        const { data, error } = await sb.rpc('all_customer_logins');
        if (error) {
            setErr(/all_customer_logins/.test(error.message) ? 'Run 208_customer_logins_view_as.sql in Supabase first.' : error.message);
            setList({ can_edit: false, users: [] });
            return;
        }
        const d = data;
        setErr(null);
        setList({ ...d, users: d.users ?? [] });
    }, [sb]);
    useEffect(() => { load(); }, [load]);
    const { busy, run } = useRun(flash, load);
    if (!sb || list == null)
        return _jsx("p", { className: "muted", children: "Loading\u2026" });
    const ql = q.trim().toLowerCase();
    const rows = list.users.filter(u => !ql || `${u.email} ${u.name ?? ''} ${u.customer ?? ''} ${u.phone ?? ''}`.toLowerCase().includes(ql));
    const setUp = list.users.filter(u => u.claimed).length;
    return (_jsxs("div", { className: "custlogins", children: [_jsxs("p", { className: "muted small", children: [list.users.length, " customer logins, ", setUp, " set up. ", list.can_edit ? 'Add a login, make the invite or reset link, turn one off, or View as to see the portal the way they do (this tab only).' : 'Only Sales Admins, Admins and Owners can change these.'] }), err && _jsx("div", { className: "warnbox", children: err }), _jsxs("div", { className: "row toolbar", children: [_jsx("input", { className: "search", type: "search", placeholder: "Search name, email or customer", value: q, onChange: e => setQ(e.target.value) }), list.can_edit && !add && _jsx("button", { className: "primary", onClick: () => setAdd(true), children: "+ Add a login" })] }), list.can_edit && add && _jsx(AddLogin, { customers: customers, busy: busy, onCancel: () => setAdd(false), onAdd: async (cid, em, name, phone) => { if (await run(() => sb.rpc('save_customer_login', { p_customer: cid, p_email: em, p_name: name, p_phone: phone }), `${em} added. Make their invite link.`)) {
                    setAdd(false);
                    setOpen(em);
                } } }), !rows.length && !err && _jsx("p", { className: "muted", children: ql ? 'Nobody matches.' : 'No customer logins yet.' }), _jsx("div", { className: "dlist", children: rows.map(u => _jsx(LoginRow, { backend: backend, sb: sb, u: u, list: list, customerName: u.customer ?? '', showCustomer: true, open: open, setOpen: setOpen, busy: busy, run: run, flash: flash, load: load }, u.email)) })] }));
}
