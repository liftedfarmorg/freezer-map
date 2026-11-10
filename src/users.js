import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { Select } from './combo';
import { useEffect, useState } from 'react';
import { MODULES } from './types';
import { LANGS } from './i18n';
import { NotifyBox } from './notifyprefs';
import { can, isOwnerMe } from './fold';
const KINDS = [
    { k: 'staff', label: 'Staff', what: 'Lifted staff. Pick how they sign in and what they can use below.' },
    { k: 'customer', label: 'Customer', what: 'Order portal only, for one customer account' },
    { k: 'none', label: 'No access', what: 'Blocked from the app' },
];
const kindOf = (u) => u.role === 'customer' ? 'customer' : u.role === 'none' ? 'none' : 'staff';
const isStaffRole = (r) => r === 'admin' || r === 'sales' || r === 'crew';
export function accessText(u) {
    if (u.owner)
        return 'Owner: everything';
    const a = u.access ?? {};
    const parts = MODULES.filter(m => a[m.key]).map(m => m.key === 'admin' ? 'Admin module' : `${m.label}${a[m.key] === 'admin' ? ' (Admin)' : a[m.key] === 'view' ? ' (view only)' : ''}`);
    return parts.length ? parts.join(' · ') : 'no modules';
}
function ago(at) {
    if (!at)
        return 'never signed in';
    const d = (Date.now() - new Date(at).getTime()) / 864e5;
    return d < 1 ? 'active today' : d < 2 ? 'active yesterday' : `active ${Math.floor(d)} days ago`;
}
/** Admin module > Settings > Users and access */
export function UsersTab({ backend, me, customers, flash }) {
    const [users, setUsers] = useState(null);
    const [err, setErr] = useState(null);
    const [edit, setEdit] = useState(null);
    const [q, setQ] = useState('');
    const [logins, setLogins] = useState(new Map());
    const load = () => Promise.all([backend.listUsers(), backend.userLogins()])
        .then(([u, l]) => { setUsers(u); setLogins(l); setErr(null); }).catch(e => setErr(String(e?.message ?? e)));
    const loginStatus = (u) => {
        if (u.role !== 'customer')
            return '';
        const l = logins.get(u.email);
        return l?.claimed ? 'login set up' : l?.invited_at ? 'invited, not set up yet' : 'not invited yet';
    };
    useEffect(() => { load(); }, []);
    if (err)
        return _jsxs("div", { className: "warnbox", children: ["Couldn't load users. (", err, ")"] });
    if (!users)
        return _jsx("p", { className: "muted", children: "Loading users\u2026" });
    const cust = new Map(customers.map(c => [c.id, c.name]));
    const shown = users.filter(u => !q || `${u.email} ${u.display_name ?? ''} ${accessText(u)} ${cust.get(u.customer_id ?? -1) ?? ''}`.toLowerCase().includes(q.toLowerCase()));
    const groups = [
        ['Owners', shown.filter(u => u.owner)],
        ['Staff', shown.filter(u => !u.owner && isStaffRole(u.role))],
        ['No access', shown.filter(u => u.role === 'none')],
    ];
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "row toolbar", children: [_jsx("input", { className: "search", type: "search", placeholder: "Search people", value: q, onChange: e => setQ(e.target.value) }), _jsx("button", { className: "primary", onClick: () => setEdit({ role: 'crew', access: { distribution: 'user' } }), children: "+ Add person" })] }), _jsx("p", { className: "muted", children: "Anyone with a Lifted Microsoft account can sign in and starts with Distribution. You can add people before they've ever signed in (+ Add person): their modules, Driver and language are ready the first time they sign in. Staff without a Lifted email sign in with a code sent to their email (they can't be Admins). Give each person a level per module: User works in it, Admin also changes its settings and approves. Owners have everything. Customer portal logins are in the Customer logins tab." }), groups.map(([l, list]) => !list.length ? null : (_jsxs("div", { children: [_jsxs("h3", { className: "grouph", children: [l, " ", _jsx("span", { className: "muted", children: list.length })] }), list.map(u => (_jsx("button", { className: "li setrow", onClick: () => setEdit({ ...u, access: { ...(u.access ?? {}) } }), children: _jsxs("div", { className: "grow", children: [_jsxs("div", { children: [_jsx("b", { children: u.display_name || u.email }), u.email === (me.real_email ?? me.email) && _jsx("span", { className: "muted", children: " \u00B7 you" })] }), _jsx("div", { className: "muted", children: [u.display_name ? u.email : '', u.customer_id ? cust.get(u.customer_id) : '', loginStatus(u), isStaffRole(u.role) ? accessText(u) : '', u.prefs?.lang === 'es' ? 'Español' : '', ago(u.last_seen)].filter(Boolean).join(' · ') })] }) }, u.email)))] }, l))), edit && _jsx(UserForm, { user: edit, customers: customers, me: me, isMe: edit.email === (me.real_email ?? me.email), backend: backend, claimed: !!(edit.email && logins.get(edit.email)?.claimed), flash: flash, onLinked: load, onClose: () => setEdit(null), onSave: async (u, kind) => {
                    try {
                        await backend.saveUser({ email: u.email, name: u.display_name ?? '', kind, customerId: kind === 'customer' ? u.customer_id ?? null : null,
                            access: kind === 'staff' ? (u.access ?? {}) : {}, owner: me.access.owner ? !!u.owner : undefined,
                            login: kind === 'staff' && u.login_kind && u.login_kind !== edit.login_kind ? u.login_kind : null });
                        if (kind === 'staff' && (u.prefs?.lang ?? 'en') !== (edit.prefs?.lang ?? 'en'))
                            await backend.setUserLang(u.email, u.prefs?.lang ?? 'en');
                        if ((u.phone ?? '').trim() !== (edit.phone ?? '').trim())
                            await backend.setUserPhone(u.email, u.phone ?? '');
                        if (kind === 'staff' && u.driver != null && u.driver !== u.driver0) {
                            const { error } = await backend.client().rpc('set_user_driver', { p_email: u.email, p_on: u.driver });
                            if (error)
                                throw new Error(/Could not find the function|schema cache/i.test(error.message) ? 'Saved, but the Driver setting needs 216 in Supabase first' : error.message);
                        }
                        await load();
                        flash('Saved');
                        // new customer: keep the card open so the invite link can be made right away
                        if (kind === 'customer' && !edit.created_at)
                            setEdit({ ...u, role: 'customer', created_at: new Date().toISOString(), added_by: me.email });
                        else
                            setEdit(null);
                    }
                    catch (e) {
                        flash(String(e.message ?? e), true);
                    }
                }, onRemove: async (email) => {
                    try {
                        await backend.removeUser(email);
                        await load();
                        setEdit(null);
                        flash('Removed');
                    }
                    catch (e) {
                        flash(String(e.message ?? e), true);
                    }
                } })] }));
}
function UserForm({ user, customers, me, isMe, onClose, onSave, onRemove, backend, claimed, flash, onLinked }) {
    const [u, setU] = useState(user);
    const [kind, setKind] = useState(kindOf(user));
    const [busy, setBusy] = useState(false);
    const set = (x) => setU(v => ({ ...v, ...x }));
    const setLevel = (m, lv) => setU(v => { const a = { ...(v.access ?? {}) }; if (lv)
        a[m] = lv;
    else
        delete a[m]; return { ...v, access: a }; });
    const isNew = !user.created_at;
    const iOwn = me.access.owner;
    const myLv = me.access.modules;
    const manages = (m) => iOwn || (m === 'admin' ? !!myLv.admin : can(m, 'people'));
    const hasAdminModule = iOwn || !!myLv.admin;
    // Owners: only another Owner changes them. Everyone else: you change the modules you manage (the database checks each one).
    const protectedU = !!user.owner;
    const locked = (!!user.owner && !iOwn) || (!iOwn && !isNew && isMe);
    const emailLogin = (u.login_kind ?? (/@lifted-organics\.com$/i.test(u.email ?? '') || !isNew ? 'microsoft' : 'email')) === 'email';
    const kindLocked = locked || (!hasAdminModule);
    const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((u.email ?? '').trim());
    const ok = emailOk && !locked && (kind !== 'customer' || !!u.customer_id);
    const run = (f) => { setBusy(true); f().finally(() => setBusy(false)); };
    const external = customers.filter(c => c.active && c.kind === 'external');
    const a = u.access ?? {};
    // 216: a driver card for this person (Vehicles › Drivers)
    useEffect(() => {
        const sb = backend.client();
        if (!sb || isNew || !user.email)
            return;
        sb.from('fleet_drivers').select('id').eq('email', user.email).is('carrier_id', null).eq('active', true).then(({ data, error }) => {
            if (!error) {
                const on = (data ?? []).length > 0;
                setU(v => ({ ...v, driver: on, driver0: on }));
            }
        });
    }, [user.email]);
    return (_jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: "sheet form", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsx("h2", { children: isNew ? 'Add person' : 'Edit person' }), _jsx("button", { className: "ghost", onClick: onClose, children: "\u2715" })] }), locked && _jsx("div", { className: "warnbox", children: isMe ? 'Ask an Owner to change your own access.' : `${user.display_name || user.email} is an Owner. Only another Owner can change them.` }), !iOwn && !locked && _jsx("p", { className: "muted small", children: "You can change the modules you run. Admins of a module can make other Admins of it (unless Permissions says otherwise)." }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Email" }), _jsx("input", { type: "email", value: u.email ?? '', disabled: !isNew, autoFocus: isNew, onChange: e => set({ email: e.target.value }), placeholder: "name@company.com" })] }), _jsxs("div", { className: "field", children: [_jsxs("label", { children: ["Name ", _jsx("span", { className: "muted", children: "(what the app shows)" })] }), _jsx("input", { value: u.display_name ?? '', disabled: locked, onChange: e => set({ display_name: e.target.value }) })] }), kind === 'staff' && _jsxs("div", { className: "field", children: [_jsxs("label", { children: ["Phone ", _jsx("span", { className: "muted", children: "(contact number)" })] }), _jsx("input", { type: "tel", value: u.phone ?? '', onChange: e => set({ phone: e.target.value }), placeholder: "831-555-0100" })] }), kind === 'staff' && _jsxs("div", { className: "field", children: [_jsxs("label", { children: ["Language ", _jsx("span", { className: "muted", children: "(they can change it in My settings too)" })] }), _jsx("div", { className: "seg", children: LANGS.map(([v, l]) => _jsx("button", { className: (u.prefs?.lang ?? 'en') === v ? 'on' : '', disabled: locked, onClick: () => set({ prefs: { ...u.prefs, lang: v } }), children: l }, v)) })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Type" }), _jsx("div", { className: "choices col", children: KINDS.filter(k => k.k !== 'customer' || kindOf(user) === 'customer').map(k => (_jsxs("button", { className: kind === k.k ? 'on' : '', disabled: kindLocked || (isMe && k.k !== 'staff'), onClick: () => setKind(k.k), children: [_jsx("b", { children: k.label }), " ", _jsx("span", { className: "muted", children: k.what })] }, k.k))) }), kindOf(user) !== 'customer' && _jsx("p", { className: "muted small", children: "Customer portal logins are added in the Customer logins tab or on the customer's card." })] }), kind === 'customer' && (_jsxs("div", { className: "field", children: [_jsx("label", { children: "Customer account" }), _jsxs(Select, { value: u.customer_id ?? '', onChange: e => set({ customer_id: e.target.value ? Number(e.target.value) : null }), children: [_jsx("option", { value: "", children: "Pick a customer\u2026" }), external.map(c => _jsx("option", { value: c.id, children: c.name }, c.id))] }), _jsx("p", { className: "muted", children: "They'll only ever see this customer's reserves, menu and orders. After saving, send them the invite link." })] })), kind === 'staff' && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "field", children: [_jsx("label", { children: "Signs in with" }), _jsxs("div", { className: "seg", children: [_jsx("button", { className: !emailLogin ? 'on' : '', disabled: locked || (!isNew && !hasAdminModule), onClick: () => set({ login_kind: 'microsoft' }), children: "Lifted Microsoft account" }), _jsx("button", { className: emailLogin ? 'on' : '', disabled: locked || (!isNew && !hasAdminModule) || !!u.owner, onClick: () => setU(v => ({ ...v, login_kind: 'email', owner: false,
                                                access: Object.fromEntries(Object.entries(v.access ?? {}).filter(([k, l]) => k !== 'admin' && l !== 'admin')) })), children: "Email code" })] }), emailLogin && _jsx("p", { className: "muted small", children: "No Lifted email: they get a 6-digit code at this address each time they sign in. They can be View or User, never Admin." })] }), iOwn && !emailLogin && _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: !!u.owner, disabled: isMe, onChange: e => set({ owner: e.target.checked }) }), _jsxs("span", { children: [_jsx("b", { children: "Owner" }), " ", _jsx("span", { className: "muted", children: "Everything in every module, and can make other Owners" })] })] }), u.owner ? _jsx("p", { className: "muted", children: "Owners have every module as Admin." }) : (_jsxs("div", { className: "field", children: [_jsx("label", { children: "Modules" }), _jsx("div", { className: "accgrid", children: MODULES.filter(m => manages(m.key)).map(m => {
                                        const lv = a[m.key] ?? null;
                                        const makeAdmin = !emailLogin && (iOwn || can(m.key, 'make_admins'));
                                        if (m.key === 'admin' && emailLogin)
                                            return null;
                                        const opts = m.key === 'admin' ? [[null, 'Off'], ['admin', 'On']] : makeAdmin ? [[null, 'Off'], ['view', 'View'], ['user', 'User'], ['admin', 'Admin']] : [[null, 'Off'], ['view', 'View'], ['user', 'User']];
                                        const adminLocked = !makeAdmin && lv === 'admin';
                                        return (_jsxs("div", { className: "accrow", children: [_jsxs("div", { children: [_jsx("b", { children: m.label }), _jsx("div", { className: "muted", children: lv === 'admin' && m.key !== 'admin' ? m.admin : lv === 'view' ? 'Sees everything a User sees, can\'t change anything' : lv ? m.user : m.what })] }), adminLocked ? _jsx("span", { className: "pill", children: "Admin" }) : _jsx("div", { className: "seg", children: opts.map(([v, l]) => _jsx("button", { className: lv === v ? 'on' : '', disabled: locked || (isMe && m.key === 'admin' && !iOwn), onClick: () => setLevel(m.key, v), children: l }, l)) })] }, m.key));
                                    }) }), !MODULES.some(m => a[m.key]) && _jsx("p", { className: "warn-t small", children: u.driver ? 'With every module off they only see the Driver screen (a driver-only login).' : 'With every module off they\'ll only see a "no modules" message.' })] }))] })), kind === 'staff' && !isNew && (iOwn || hasAdminModule || MODULES.some(m => manages(m.key))) && _jsxs("details", { className: "field", children: [_jsxs("summary", { children: [_jsx("b", { children: "Notifications" }), " ", _jsx("span", { className: "muted", children: "(they can change these in My settings; a driver-only login can't)" })] }), _jsx(NotifyBox, { nf: (u.prefs?.notify ?? {}), busy: locked, phone: u.phone ?? '', onSave: async (x) => {
                                const { data, error } = await backend.client().rpc('set_user_notify', { p_email: u.email, p_notify: x });
                                if (error)
                                    flash(/Could not find the function|schema cache/i.test(error.message) ? 'Run 217 in Supabase first' : error.message, true);
                                else {
                                    set({ prefs: { ...u.prefs, notify: data } });
                                    flash('Notifications saved');
                                }
                            } })] }), kind === 'staff' && _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: !!u.driver, disabled: locked, onChange: e => set({ driver: e.target.checked, driver0: u.driver0 ?? false }) }), _jsxs("span", { children: [_jsx("b", { children: "Driver" }), " ", _jsx("span", { className: "muted", children: "Makes (or links) their card in Vehicles \u203A Drivers. Loads they drive show on their Driver screen. Turning it off makes the card inactive." })] })] }), !isNew && !isMe && !user.owner && (iOwn || (!protectedU && (user.role === 'customer' ? myLv.sales === 'admin' : MODULES.some(m => manages(m.key) && (user.access ?? {})[m.key])))) && (_jsxs("div", { className: "field", children: [_jsx("label", { children: "See what they see" }), _jsxs("div", { className: "row", children: [_jsxs("button", { className: "ghost small", disabled: busy, onClick: () => run(async () => { await backend.startViewAs(user.email); location.reload(); }), children: ["View as ", user.display_name || user.email] }), _jsx("span", { className: "muted", children: "Read-only, for up to 2 hours. Logged in Activity." })] })] })), !isNew && user.role === 'customer' && _jsx(LinkBox, { backend: backend, email: user.email, claimed: claimed, flash: flash, onLinked: onLinked }), isMe && _jsxs("p", { className: "muted", children: ["You can't take away your own access", iOwn ? ' or Owner' : ' or Admin module', ". Another ", iOwn ? 'Owner' : 'Admin', " can."] }), _jsxs("div", { className: "row between", children: [!isNew && !isMe && !locked && hasAdminModule
                            ? _jsx("button", { className: "ghost", disabled: busy, onClick: () => run(() => onRemove(u.email)), children: "Remove" })
                            : _jsx("span", {}), _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost", onClick: onClose, children: "Cancel" }), _jsx("button", { className: "primary", disabled: busy || !ok, onClick: () => run(() => onSave({ ...u, email: u.email.trim().toLowerCase() }, kind)), children: "Save" })] })] }), !isNew && _jsxs("p", { className: "muted", children: ["Added by ", user.added_by ?? 'unknown', " \u00B7 ", ago(user.last_seen ?? null)] })] }) }));
}
export function LinkBox({ backend, email, claimed, flash, onLinked }) {
    const [link, setLink] = useState(null);
    const [busy, setBusy] = useState(false);
    async function make(kind) {
        setBusy(true);
        try {
            const url = await backend.makeLoginLink(email, kind);
            setLink({ kind, url });
            onLinked();
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
        finally {
            setBusy(false);
        }
    }
    async function copy() {
        if (!link)
            return;
        try {
            await navigator.clipboard.writeText(link.url);
            flash('Link copied');
        }
        catch {
            flash('Select the link and copy it', true);
        }
    }
    return (_jsxs("div", { className: "field linkbox", children: [_jsxs("label", { children: ["Portal login ", _jsxs("span", { className: "muted", children: ["(", claimed ? 'set up' : 'not set up yet', ")"] })] }), _jsxs("div", { className: "row", children: [!claimed && _jsx("button", { className: "ghost small", disabled: busy, onClick: () => make('invite'), children: "Make invite link" }), claimed && _jsx("button", { className: "ghost small", disabled: busy, onClick: () => make('reset'), children: "Make password reset link" })] }), link && _jsxs(_Fragment, { children: [_jsx("input", { readOnly: true, value: link.url, onFocus: e => e.target.select() }), _jsxs("div", { className: "row", children: [_jsx("button", { className: "primary small", onClick: copy, children: "Copy link" }), _jsx("span", { className: "muted", children: "Send it to them by email or text. Works once, for 14 days. Making a new link cancels the old one." })] })] })] }));
}
/** a module's Settings > People: who has this module and at what level, and add someone to it. Owners set anything; the module's Admins
 *  (or whoever Permissions allows) add people and set levels, including Admin. Email-code people can't be Admins. The database checks all of it. */
export function ModulePeople({ sb, module, flash }) {
    const [rows, setRows] = useState(null);
    const [q, setQ] = useState('');
    const [busy, setBusy] = useState(false);
    const [add, setAdd] = useState(null);
    const own = isOwnerMe(), manage = own || can(module, 'people'), makeAdmins = own || can(module, 'make_admins');
    const load = async () => {
        if (!sb)
            return;
        let u = await sb.from('app_users').select('email,display_name,owner,last_seen,role,login_kind').in('role', ['admin', 'sales', 'crew']).order('email');
        if (u.error)
            u = await sb.from('app_users').select('email,display_name,owner,last_seen,role').in('role', ['admin', 'sales', 'crew']).order('email'); // before 058
        const a = await sb.from('module_access').select('email,level').eq('module', module);
        const lv = new Map((a.data ?? []).map(x => [x.email, x.level]));
        setRows((u.data ?? [])
            .map(x => ({ email: x.email, name: x.display_name, owner: x.owner, last: x.last_seen, lv: x.owner ? 'admin' : lv.get(x.email) ?? null, login: x.login_kind ?? 'microsoft' })));
    };
    useEffect(() => { load(); }, [sb, module]);
    if (!rows)
        return _jsx("p", { className: "muted", children: "Loading\u2026" });
    const label = MODULES.find(m => m.key === module)?.label ?? module;
    const set = async (email, level) => {
        if (!sb)
            return;
        setBusy(true);
        const { error } = await sb.rpc('set_module_level', { p_email: email, p_module: module, p_level: level ?? '' });
        setBusy(false);
        if (error)
            flash(/set_module_level/.test(error.message) ? 'Run 040_strains_access_pallets.sql in Supabase first' : error.message, true);
        else {
            flash('Access saved');
            load();
        }
    };
    const save = async () => {
        if (!sb || !add)
            return;
        setBusy(true);
        const { error } = await sb.rpc('add_module_person', { p_email: add.email.trim().toLowerCase(), p_name: add.name.trim() || null, p_module: module, p_level: add.level, p_login: add.login });
        setBusy(false);
        if (error)
            flash(/add_module_person/.test(error.message) ? 'Run 058_access.sql in Supabase first' : error.message, true);
        else {
            flash(`${add.email} added to ${label}`);
            setAdd(null);
            load();
        }
    };
    const viewAs = async (email) => {
        if (!sb)
            return;
        const { error } = await sb.rpc('start_view_as', { p_email: email });
        if (error)
            flash(error.message, true);
        else
            location.reload();
    };
    const ql = q.trim().toLowerCase();
    const shown = rows.filter(r => !ql || `${r.email} ${r.name ?? ''}`.toLowerCase().includes(ql)).sort((a, b) => Number(!a.lv) - Number(!b.lv) || a.email.localeCompare(b.email));
    const optsFor = (r) => makeAdmins && r.login !== 'email' ? [[null, 'Off'], ['view', 'View'], ['user', 'User'], ['admin', 'Admin']] : [[null, 'Off'], ['view', 'View'], ['user', 'User']];
    const emailOk = !!add && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(add.email.trim());
    return _jsxs("div", { className: "mpeople", children: [_jsx("p", { className: "muted small", children: own ? `Who has ${label}. You're an Owner, so you can set any level.` : manage ? `Who has ${label}. You can add people and set their level${makeAdmins ? ', including Admin' : ' (Off, View or User)'}. People who sign in with an email code can't be Admins.` : `Who has ${label}.` }), _jsxs("div", { className: "row", children: [_jsx("input", { className: "search", type: "search", placeholder: "Search people", value: q, onChange: e => setQ(e.target.value) }), manage && !add && _jsx("button", { className: "primary small", onClick: () => setAdd({ email: '', name: '', login: 'microsoft', level: 'user' }), children: "+ Add person" })] }), add && _jsxs("div", { className: "dcard addperson", children: [_jsxs("div", { className: "field", children: [_jsx("label", { children: "Email" }), _jsx("input", { type: "email", autoFocus: true, value: add.email, placeholder: "name@company.com", onChange: e => { const v = e.target.value; setAdd({ ...add, email: v, login: /@lifted-organics\.com\s*$/i.test(v) ? 'microsoft' : v.includes('@') ? 'email' : add.login }); } })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Name" }), _jsx("input", { value: add.name, onChange: e => setAdd({ ...add, name: e.target.value }) })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Signs in with" }), _jsxs("div", { className: "seg", children: [_jsx("button", { className: add.login === 'microsoft' ? 'on' : '', onClick: () => setAdd({ ...add, login: 'microsoft' }), children: "Lifted Microsoft account" }), _jsx("button", { className: add.login === 'email' ? 'on' : '', onClick: () => setAdd({ ...add, login: 'email', level: add.level === 'admin' ? 'user' : add.level }), children: "Email code" })] }), add.login === 'email' && _jsx("p", { className: "muted small", children: "For staff without a Lifted email: a 6-digit code is emailed each time they sign in." })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: label }), _jsx("div", { className: "seg", children: optsFor(add).filter(([v]) => v).map(([v, l]) => _jsx("button", { className: add.level === v ? 'on' : '', onClick: () => setAdd({ ...add, level: v }), children: l }, l)) })] }), _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost", onClick: () => setAdd(null), children: "Cancel" }), _jsx("button", { className: "primary", disabled: busy || !emailOk, onClick: save, children: "Add" })] })] }), _jsx("div", { className: "dlist", children: shown.map(r => {
                    const locked = !manage || r.owner || (!own && r.lv === 'admin' && !makeAdmins);
                    return _jsxs("div", { className: `drow ${r.lv ? '' : 'off'}`, children: [_jsxs("span", { className: "grow", children: [_jsx("b", { children: r.name || r.email.split('@')[0] }), _jsxs("span", { className: "muted small", children: [" \u00B7 ", r.email, r.owner ? ' · Owner' : '', r.login === 'email' ? ' · email code' : ''] })] }), locked ? _jsx("span", { className: "pill", children: r.owner ? 'Owner' : r.lv ? r.lv[0].toUpperCase() + r.lv.slice(1) : 'Off' })
                                : _jsx("div", { className: "seg", children: optsFor(r).map(([v, l]) => _jsx("button", { disabled: busy, className: r.lv === v ? 'on' : '', onClick: () => r.lv !== v && set(r.email, v), children: l }, l)) }), manage && !r.owner && (own || r.lv !== 'admin') && r.lv && _jsx("button", { className: "ghost small", title: "See what they see (read only, 2 hours)", onClick: () => viewAs(r.email), children: "View as" })] }, r.email);
                }) })] });
}
