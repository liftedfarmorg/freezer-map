import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Select } from './combo';
import { useEffect, useState } from 'react';
import { MODULES } from './types';
const LEVELS = [['view', 'View'], ['user', 'User'], ['admin', 'Admin'], ['owner', 'Owner only']];
export function PermissionsPanel({ sb, flash }) {
    const [rules, setRules] = useState(null);
    const [ovs, setOvs] = useState([]);
    const [people, setPeople] = useState([]);
    const [err, setErr] = useState(null);
    const [busy, setBusy] = useState(false);
    const [add, setAdd] = useState(null);
    const load = async () => {
        if (!sb)
            return;
        const [r, o, u] = await Promise.all([sb.from('perm_rules').select('*').order('module').order('sort'), sb.from('perm_overrides').select('*').order('email'),
            sb.from('app_users').select('email,display_name').in('role', ['admin', 'sales', 'crew']).order('email')]);
        if (r.error) {
            setErr(/perm_rules/.test(r.error.message) ? 'Run 058_access.sql in Supabase first.' : r.error.message);
            return;
        }
        setRules(r.data);
        setOvs((o.data ?? []));
        setPeople((u.data ?? []).map(x => ({ email: x.email, name: x.display_name })));
    };
    useEffect(() => { load(); }, [sb]);
    const rpc = async (fn, args, ok) => {
        if (!sb)
            return;
        setBusy(true);
        const { error } = await sb.rpc(fn, args);
        setBusy(false);
        if (error)
            flash(error.message, true);
        else {
            flash(ok);
            await load();
        }
    };
    if (err)
        return _jsx("div", { className: "warnbox", children: err });
    if (!rules)
        return _jsx("p", { className: "muted", children: "Loading\u2026" });
    const mods = MODULES.filter(m => rules.some(r => r.module === m.key));
    const ruleOf = (k) => rules.find(r => `${r.module}.${r.action}` === k);
    const nameOf = (e) => people.find(p => p.email === e)?.name || e;
    return (_jsxs("div", { className: "perms", children: [_jsx("p", { className: "muted", children: "Who can do what in each module. Owners can always do everything. A level includes the ones above it (Admin can do what User can). Changes apply the next time each person loads the app." }), mods.map(m => (_jsxs("div", { children: [_jsx("h3", { className: "grouph", children: m.label }), _jsx("div", { className: "dlist", children: rules.filter(r => r.module === m.key).map(r => (_jsxs("div", { className: "drow", children: [_jsxs("span", { className: "grow", children: [r.label, r.updated_by && _jsxs("span", { className: "muted small", children: [" \u00B7 changed by ", r.updated_by.split('@')[0]] })] }), _jsx("div", { className: "seg", children: LEVELS.filter(([v]) => r.action !== 'make_admins' || v === 'admin' || v === 'owner').map(([v, l]) => _jsx("button", { disabled: busy, className: r.min_level === v ? 'on' : '', onClick: () => r.min_level !== v && rpc('save_perm_rule', { p_module: r.module, p_action: r.action, p_min: v }, `${r.label}: ${l} and up`), children: l }, v)) })] }, r.action))) })] }, m.key))), _jsxs("h3", { className: "grouph", children: ["Exceptions for one person ", _jsx("span", { className: "muted", children: ovs.length })] }), _jsx("p", { className: "muted small", children: "Let someone do one thing their level wouldn't allow, or stop them doing something it would." }), _jsx("div", { className: "dlist", children: ovs.map(o => {
                    const r = ruleOf(`${o.module}.${o.action}`);
                    return _jsxs("div", { className: "drow", children: [_jsxs("span", { className: "grow", children: [_jsx("b", { children: nameOf(o.email) }), " ", _jsx("span", { className: o.allow ? 'pos' : 'neg', children: o.allow ? 'can' : "can't" }), " ", r ? `${r.label.charAt(0).toLowerCase()}${r.label.slice(1)}` : o.action, _jsxs("span", { className: "muted small", children: [" \u00B7 ", MODULES.find(m => m.key === o.module)?.label] })] }), _jsx("button", { className: "ghost small", disabled: busy, onClick: () => rpc('save_perm_override', { p_email: o.email, p_module: o.module, p_action: o.action, p_allow: null }, 'Exception removed'), children: "Remove" })] }, `${o.email}.${o.module}.${o.action}`);
                }) }), !add ? _jsx("button", { className: "ghost small", onClick: () => setAdd({ email: '', key: '', allow: true }), children: "+ Exception" })
                : _jsxs("div", { className: "dcard", children: [_jsxs("div", { className: "field", children: [_jsx("label", { children: "Person" }), _jsxs(Select, { value: add.email, onChange: e => setAdd({ ...add, email: e.target.value }), children: [_jsx("option", { value: "", children: "Pick someone\u2026" }), people.map(p => _jsx("option", { value: p.email, children: p.name ? `${p.name} (${p.email})` : p.email }, p.email))] })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Action" }), _jsxs(Select, { value: add.key, onChange: e => setAdd({ ...add, key: e.target.value }), children: [_jsx("option", { value: "", children: "Pick an action\u2026" }), mods.map(m => _jsx("optgroup", { label: m.label, children: rules.filter(r => r.module === m.key).map(r => _jsx("option", { value: `${r.module}.${r.action}`, children: r.label }, r.action)) }, m.key))] })] }), _jsxs("div", { className: "seg", children: [_jsx("button", { className: add.allow ? 'on' : '', onClick: () => setAdd({ ...add, allow: true }), children: "Allow" }), _jsx("button", { className: !add.allow ? 'on' : '', onClick: () => setAdd({ ...add, allow: false }), children: "Don't allow" })] }), _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost", onClick: () => setAdd(null), children: "Cancel" }), _jsx("button", { className: "primary", disabled: busy || !add.email || !add.key, onClick: () => { const [m, a] = add.key.split('.'); rpc('save_perm_override', { p_email: add.email, p_module: m, p_action: a, p_allow: add.allow }, 'Exception saved').then(() => setAdd(null)); }, children: "Save" })] })] })] }));
}
