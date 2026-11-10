import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { errText } from '../cult/ui';
const KIND = { cultivation: 'Farm (OHR / GVR cultivation)', processor: 'GVR Processing (both farms)', nursery: 'Nursery (1PN)' };
const FIN = { FF: 'Fresh Frozen', DH: 'Dry Harvest (wet weight)', UF: 'Unbucked', BF: 'Bucked', ST: 'Standards', SM: 'Smalls', TR: 'Dry Trim',
    BT: 'Bucking Trim', DB: 'Dry Biomass', DS: 'Dry Sift Biomass', CL: 'Clone', UR: 'Unrooted cutting (URC)', SD: 'Seed' };
export function ItemRules({ c }) {
    const [rules, setRules] = useState([]);
    const [edit, setEdit] = useState({});
    const load = () => c.api.sb.from('metrc_item_rules').select('*').order('license_kind').order('sort').then(r => setRules((r.data ?? [])));
    useEffect(() => { load(); }, []);
    const key = (r) => `${r.license_kind}|${r.finish}`;
    async function save(r, patch) {
        const n = { ...r, ...patch };
        try {
            const { error } = await c.api.sb.rpc('save_metrc_item_rule', { p_kind: n.license_kind, p_finish: n.finish, p_default_on: n.default_on, p_label: n.label ?? '', p_category: n.category ?? '', p_uom: n.uom ?? '' });
            if (error)
                throw new Error(error.message);
            await load();
            c.flash('Saved');
        }
        catch (e) {
            c.flash(errText(e), true);
        }
        setEdit(x => { const y = { ...x }; delete y[key(r)]; return y; });
    }
    const txt = (r, k, ph) => {
        const v = edit[key(r)]?.[k] ?? r[k] ?? '';
        return _jsx("input", { value: String(v), placeholder: ph, disabled: !c.isAdmin, style: { width: '100%' }, onChange: e => setEdit(x => ({ ...x, [key(r)]: { ...x[key(r)], [k]: e.target.value } })), onBlur: () => { const nv = edit[key(r)]?.[k]; if (nv !== undefined && nv !== (r[k] ?? ''))
                save(r, { [k]: nv }); } });
    };
    return _jsxs(_Fragment, { children: [_jsx("h3", { style: { marginTop: 14 }, children: "New strain items" }), _jsx("p", { className: "muted small", children: "What a strain's METRC sheet makes on each kind of license. Ticked = on by default (the rest can be ticked per strain). Category and unit as METRC names them; blank = copy from an existing item of the same kind on that license." }), _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "ct", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "License" }), _jsx("th", { children: "Item" }), _jsx("th", { children: "Default" }), _jsx("th", { children: "Name ends" }), _jsx("th", { children: "METRC category" }), _jsx("th", { children: "Unit" })] }) }), _jsx("tbody", { children: rules.map((r, i) => _jsxs("tr", { children: [_jsx("td", { className: "small", children: i === 0 || rules[i - 1].license_kind !== r.license_kind ? KIND[r.license_kind] : '' }), _jsx("td", { children: FIN[r.finish] ?? r.finish }), _jsx("td", { children: _jsx("input", { type: "checkbox", checked: r.default_on, disabled: !c.isAdmin, onChange: e => save(r, { default_on: e.target.checked }) }) }), _jsx("td", { children: txt(r, 'label', 'finish label') }), _jsx("td", { children: txt(r, 'category', 'copy') }), _jsx("td", { children: txt(r, 'uom', 'copy') })] }, key(r))) })] }) })] });
}
