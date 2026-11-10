import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// Msg 296: short lists people pick from, kept in app_settings as a JSON array.
// Sales › Product categories (what a customer buys) and Cultivation / Nursery › Nurseries (where a strain comes from).
import { useEffect, useState } from 'react';
export const PRODUCT_CATEGORIES_KEY = 'sales.product_categories';
export const NURSERIES_KEY = 'grow.nurseries';
export const DEFAULT_CATEGORIES = ['Fresh Frozen', 'Standards', 'Trim', 'Smalls', 'Hash', 'Rosin', 'Liquid Live Resin', 'Distillate'];
export const DEFAULT_NURSERIES = ['1PN', 'Refined Genetics', 'Haze Valley Nursery'];
const parse = (v, dflt) => { try {
    const a = JSON.parse(v ?? '');
    return Array.isArray(a) && a.every(x => typeof x === 'string') ? a : dflt;
}
catch {
    return dflt;
} };
/** the list (falls back to the starting list until it's saved once) */
export function useCatList(backend, key, dflt) {
    const [list, setList] = useState(dflt);
    const reload = () => backend.appSettings().then(s => setList(parse(s[key], dflt))).catch(() => { });
    useEffect(() => { reload(); }, [key]);
    return { list, setList, reload };
}
/** the settings panel: add, rename, move up, remove; shows how many records use each */
export function CatListPanel({ backend, k, dflt, title, intro, noun, canEdit, flash, usedBy }) {
    const { list, setList, reload } = useCatList(backend, k, dflt);
    const [add, setAdd] = useState('');
    const [ren, setRen] = useState(null);
    const sb = backend.client();
    async function save(next, msg) {
        const clean = [...new Set(next.map(x => x.trim()).filter(Boolean))];
        setList(clean);
        const { error } = sb ? await sb.rpc('set_list_setting', { p_key: k, p_items: clean }) : { error: { message: 'No database' } };
        if (error) {
            flash(/set_list_setting/.test(error.message) ? 'Needs 296_settings_lists.sql run in Supabase first' : error.message, true);
            reload();
        }
        else
            flash(msg);
    }
    const move = (i) => { if (i < 1)
        return; const a = [...list]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; save(a, 'Order saved'); };
    return _jsxs("div", { className: "catlist", children: [_jsx("h3", { children: title }), _jsx("p", { className: "muted", children: intro }), _jsx("div", { className: "cwrap settable-w", children: _jsxs("table", { className: "ctable settable", children: [_jsx("thead", { children: _jsxs("tr", { children: [canEdit && _jsx("th", { style: { width: 44 } }), _jsx("th", { children: noun }), usedBy && _jsx("th", { className: "num", children: "Used by" }), canEdit && _jsx("th", {})] }) }), _jsx("tbody", { children: list.map((c, i) => _jsxs("tr", { children: [canEdit && _jsx("td", { children: _jsx("button", { className: "ghost small", "aria-label": `Move ${c} up`, disabled: i === 0, onClick: () => move(i), children: "\u25B2" }) }), _jsx("td", { children: ren?.i === i ? _jsx("input", { value: ren.v, onChange: e => setRen({ i, v: e.target.value }), autoFocus: true }) : _jsx("b", { children: c }) }), usedBy && _jsx("td", { className: "num", children: usedBy(c) }), canEdit && _jsx("td", { className: "row end", style: { gap: 6 }, children: ren?.i === i
                                            ? _jsxs(_Fragment, { children: [_jsx("button", { className: "primary small", disabled: !ren.v.trim(), onClick: () => { const a = [...list]; a[i] = ren.v; setRen(null); save(a, 'Renamed'); }, children: "Save" }), _jsx("button", { className: "ghost small", onClick: () => setRen(null), children: "Cancel" })] })
                                            : _jsxs(_Fragment, { children: [_jsx("button", { className: "ghost small", onClick: () => setRen({ i, v: c }), children: "Rename" }), _jsx("button", { className: "ghost small danger", onClick: () => save(list.filter((_, j) => j !== i), `${c} removed`), children: "Remove" })] }) })] }, c)) })] }) }), canEdit && _jsxs("div", { className: "row", style: { gap: 8, marginTop: 8 }, children: [_jsx("input", { value: add, placeholder: `New ${noun.toLowerCase()}`, onChange: e => setAdd(e.target.value), onKeyDown: e => { if (e.key === 'Enter' && add.trim()) {
                            save([...list, add], `${add.trim()} added`);
                            setAdd('');
                        } } }), _jsx("button", { className: "primary", disabled: !add.trim() || list.some(x => x.toLowerCase() === add.trim().toLowerCase()), onClick: () => { save([...list, add], `${add.trim()} added`); setAdd(''); }, children: "+ Add" })] })] });
}
/** tick boxes for a multi-pick (a customer's categories, a strain's nurseries) */
export function MultiPick({ options, value, onChange }) {
    const all = [...options, ...value.filter(v => !options.includes(v))];
    return _jsx("div", { className: "mpick", children: all.map(o => {
            const on = value.includes(o);
            return _jsxs("button", { type: "button", className: `mpick-b ${on ? 'on' : ''}`, "aria-pressed": on, onClick: () => onChange(on ? value.filter(x => x !== o) : [...value, o]), children: [_jsx("i", { children: on ? '✓' : '' }), o] }, o);
        }) });
}
