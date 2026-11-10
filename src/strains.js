import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { ListInput } from './combo';
import { useEffect, useState } from 'react';
import { Fold, isAdminOf } from './fold';
import { STRAIN_PHOTOS } from './strainPhotos';
export async function loadProfiles(sb) {
    if (!sb)
        return new Map();
    const { data, error } = await sb.rpc('strain_profiles');
    if (error)
        return new Map();
    return new Map((data ?? []).map(p => [p.id, p]));
}
/** menu facts by lower-case strain name (anyone signed in, customers too) */
export async function loadMenuInfo(sb) {
    if (!sb)
        return new Map();
    const { data, error } = await sb.rpc('strain_menu_info');
    if (error)
        return new Map();
    return new Map((data ?? []).map(m => [m.name.toLowerCase(), m]));
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const mmdd = (s) => { if (!s)
    return ''; const [m, d] = s.split('-').map(Number); return m ? `${MON[m - 1]} ${d}` : s; };
const f1 = (x, d = 1) => (x == null ? '' : String(Math.round(Number(x) * 10 ** d) / 10 ** d));
/** 325: a yield as a range, low–high ("4.5–6%"); one number when only one is set or they match; '' when neither */
export function yieldRange(lo, hi, sep = '–') {
    const a = lo == null ? null : Number(lo), b = hi == null ? null : Number(hi);
    if (a == null && b == null)
        return '';
    if (a == null || b == null || a === b)
        return `${f1(a ?? b)}%`;
    return `${f1(a)}${sep}${f1(b)}%`;
}
/** effective value: override, else auto */
export const eff = (p, k) => (p?.set?.[k] ?? p?.auto?.[k] ?? null);
export function profileLine(p) {
    if (!p)
        return '';
    const s = p.set, bits = [
        yieldRange(s.solventless_pct, s.solventless_high_pct) ? `${yieldRange(s.solventless_pct, s.solventless_high_pct)} solventless` : '',
        yieldRange(s.hydrocarbon_pct, s.hydrocarbon_high_pct) ? `${yieldRange(s.hydrocarbon_pct, s.hydrocarbon_high_pct)} hydrocarbon` : '',
        eff(p, 'yield_lbs_plant') != null ? `${f1(eff(p, 'yield_lbs_plant'), 2)} lbs/plant` : '',
        eff(p, 'rooting_pct') != null ? `${f1(eff(p, 'rooting_pct'), 0)}% rooting` : '',
        eff(p, 'harvest_mmdd') ? `harvest ~${mmdd(eff(p, 'harvest_mmdd'))}` : '',
    ];
    return bits.filter(Boolean).join(' · ');
}
const GROUPS = [
    { m: 'nursery', l: 'Nursery', fields: [
            { k: 'rooting_pct', l: 'Rooting rate', unit: '%', auto: a => a.rooting_pct != null ? `${f1(a.rooting_pct)}% from ${a.rooting_n} sorted batch${a.rooting_n === 1 ? '' : 'es'}` : '' },
            { k: 'cuts_per_plant', l: 'Cuts per plant', auto: a => a.cuts_per_plant != null ? `${f1(a.cuts_per_plant)} from ${a.cuts_src}` : '' },
        ] },
    { m: 'cultivation', l: 'Cultivation', fields: [
            { k: 'yield_lbs_plant', l: 'Fresh frozen per plant', unit: 'lbs', auto: a => a.yield_lbs_plant != null ? `${f1(a.yield_lbs_plant, 2)} lbs from ${a.yield_n} harvest${a.yield_n === 1 ? '' : 's'}` : '' },
            { k: 'harvest_mmdd', l: 'Typical harvest date', text: true, hint: 'MM-DD', auto: a => a.harvest_mmdd ? `${mmdd(a.harvest_mmdd)} (average of ${a.harvest_n})` : '' },
        ] },
    { m: 'sales', l: 'Sales and extraction', fields: [
            // 325: each yield is a low and a high, side by side; blank high = just the low
            { k: 'solventless_pct', l: 'SHO yield, low', unit: '%', half: true },
            { k: 'solventless_high_pct', l: 'high', unit: '%', hint: 'blank = one number', half: true },
            { k: 'hydrocarbon_pct', l: 'BHO yield, low', unit: '%', half: true },
            { k: 'hydrocarbon_high_pct', l: 'high', unit: '%', hint: 'blank = one number', half: true },
            { k: 'spot_price', l: 'Spot price', unit: '$/lb', hint: 'blank = the catalog\'s price' },
            { k: 'photo_url', l: 'Photo', text: true, hint: 'pick one of ours, or paste a link' },
            { k: 'menu_note', l: 'Menu note', text: true, hint: 'a line for the menu and catalog' },
        ] },
];
/** the strain sheet's profile: one fold per module; only that module's Admins can override */
export function StrainProfileEdit({ sb, p, flash, onSaved, saveRef }) {
    const [v, setV] = useState(() => Object.fromEntries(Object.entries(p.set ?? {}).map(([k, x]) => [k, x == null ? '' : String(x)])));
    const [busy, setBusy] = useState(false);
    async function save(m, fields, quiet = false) {
        if (!sb)
            return false;
        const vals = {};
        for (const f of fields) {
            const s = (v[f.k] ?? '').trim();
            if (s === String(p.set?.[f.k] ?? ''))
                continue;
            if (f.k === 'harvest_mmdd' && s && !/^\d{2}-\d{2}$/.test(s)) {
                flash('Harvest date looks like 10-08 (month-day)', true);
                return false;
            }
            if (!f.text && s !== '' && !Number.isFinite(Number(s))) {
                flash(`${f.l}: that's not a number`, true);
                return false;
            }
            vals[f.k] = s === '' ? null : f.text ? s : Number(s);
        }
        // 325: a low can't be above its high (the database checks too)
        for (const [lo, hi, nm] of [['solventless_pct', 'solventless_high_pct', 'Solventless'], ['hydrocarbon_pct', 'hydrocarbon_high_pct', 'Hydrocarbon']]) {
            const a = (v[lo] ?? '').trim(), b = (v[hi] ?? '').trim();
            if (fields.some(f => f.k === lo) && a !== '' && b !== '' && Number(a) > Number(b)) {
                flash(`${nm} yield: the low (${a}%) is above the high (${b}%)`, true);
                return false;
            }
        }
        if (!Object.keys(vals).length)
            return true;
        setBusy(true);
        const { error } = await sb.rpc('set_strain_info', { p_strain: p.id, p_vals: vals });
        setBusy(false);
        if (error)
            flash(/set_strain_info/.test(error.message) ? 'Run 040_strains_access_pallets.sql in Supabase first'
                : /Unknown strain field \w+_high_pct/.test(error.message) ? 'Run 325_strain_yield_ranges.sql in Supabase first' : error.message, true);
        else {
            if (!quiet)
                flash(`${p.name}: ${m} saved`);
            onSaved();
        }
        return !error;
    }
    // YLD-12: every fold this person can change, that has unsaved edits
    async function saveAll() {
        for (const g of GROUPS) {
            if (!isAdminOf(g.m) || !g.fields.some(f => (v[f.k] ?? '').trim() !== String(p.set?.[f.k] ?? '')))
                continue;
            if (!(await save(g.l, g.fields, true)))
                return false;
        }
        return true;
    }
    if (saveRef)
        saveRef.current = saveAll;
    useEffect(() => () => { if (saveRef)
        saveRef.current = null; }, []);
    return _jsxs("div", { className: "sprofile", children: [GROUPS.map(g => {
                const can = isAdminOf(g.m), dirty = g.fields.some(f => (v[f.k] ?? '') !== String(p.set?.[f.k] ?? ''));
                return _jsxs(Fold, { id: `strain.${g.m}`, title: g.l, open: g.m === 'sales', count: can ? '' : '· view only', children: [g.fields.map(f => {
                            const a = f.auto?.(p.auto) ?? '', over = p.set?.[f.k] != null;
                            return _jsxs("div", { className: `field sfield${f.half ? ' half' : ''}`, children: [_jsxs("label", { children: [f.l, f.unit ? ` (${f.unit})` : '', f.hint && _jsxs("span", { className: "muted", children: [" \u00B7 ", f.hint] })] }), _jsxs("div", { className: "row", children: [_jsx(ListInput, { value: v[f.k] ?? '', disabled: !can, list: f.k === 'photo_url' ? 'strain-photos' : undefined, inputMode: f.text ? undefined : 'decimal', placeholder: f.auto ? (a ? 'auto' : 'no data yet') : '', onChange: e => setV(s => ({ ...s, [f.k]: e.target.value })) }), can && over && f.auto && _jsx("button", { className: "ghost small", onClick: () => setV(s => ({ ...s, [f.k]: '' })), children: "Use auto" })] }), f.auto && _jsxs("div", { className: "muted small", children: [a ? `Auto: ${a}` : 'Auto: not enough data yet', over ? ' · overridden' : ''] }), f.k === 'photo_url' && _jsx("datalist", { id: "strain-photos", children: STRAIN_PHOTOS.map(u => _jsx("option", { value: u }, u)) }), f.k === 'photo_url' && v.photo_url && /^(https?:|\/)/.test(v.photo_url) && _jsx("img", { className: "sphoto", src: v.photo_url, alt: p.name })] }, f.k);
                        }), can ? _jsx("div", { className: "row", children: _jsxs("button", { className: "primary small", disabled: busy || !dirty, onClick: () => save(g.l, g.fields), children: ["Save ", g.l.toLowerCase()] }) })
                            : _jsxs("p", { className: "muted small", children: ["Only a ", g.l === 'Sales and extraction' ? 'Sales' : g.l, " Admin can change these."] })] }, g.m);
            }), p.set?.updated_by && _jsxs("p", { className: "muted small", children: ["Last change ", p.set.updated_by.split('@')[0], p.set.updated_at ? ` · ${new Date(p.set.updated_at).toLocaleDateString()}` : ''] })] });
}
