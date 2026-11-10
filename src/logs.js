import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { ListInput, Select } from './combo';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { pageAll } from './pageAll';
import { MONTHS_ES, MONTHS_LONG_ES, lang, t, tn } from './i18n';
/** CCOF (Compliance, 055): warn when a product isn't approved, or its listing had expired on the log date */
function ccofWarn(name, pmap, on) {
    const k = name.trim().toLowerCase();
    if (!k)
        return null;
    const p = pmap.get(k);
    if (!p)
        return [...pmap.values()].some(x => 'ccof_status' in x) ? t('Not on the product list, so not CCOF approved yet. Check with Compliance before using it.') : null;
    if (!('ccof_status' in p))
        return null;
    if (p.ccof_status === 'not_allowed')
        return t('Not allowed by CCOF. Check with Compliance before using it.');
    if (p.ccof_status !== 'approved')
        return t('Not CCOF approved yet. Check with Compliance before using it.');
    if (p.listing_expires && on && p.listing_expires < on)
        return t('Its CCOF listing had expired on this date. Tell Compliance.');
    return null;
}
const KIND_LABEL = { spray: 'Spray', feed: 'Feed', labor: 'Labor' };
const SPRAY_TYPES = ['Feed', 'Pesticide', 'Feed + pesticide', 'Sulfur', 'Other'];
const FEED_METHODS = ['Fertigation', 'Foliar feed', 'Amendment / side dress', 'Drench', 'Other'];
export const TASKS = ['Cut', 'Clean / manicure', 'Stick', 'Sort', 'Transplant', 'Move clones', 'Plant', 'Top', 'Other'];
const FIELD_TASKS = ['Bed shaping', 'Planting', 'Cultivation', 'Hand weeding', 'Fertilizer side dress', 'Disc dead beds', 'Male scouting', 'Spraying', 'Fertigation', 'Irrigation repair', 'Harvest', 'Other'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const n = (x) => (x == null || x === '' ? null : Number(x));
const num = (x, d = 0) => (x == null || !isFinite(x) ? '' : x.toLocaleString(undefined, { maximumFractionDigits: d }));
const money = (x) => x.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const unitKey = (u) => (u ?? '').toLowerCase().replace(/\/.*$/, '').replace(/gallons?|gal\.?/, 'gal').replace(/^lbs?$/, 'lb').replace(/^oz$/, 'fl oz').trim();
/** ISO week (1-53) and its Monday */
export function isoWeek(s) {
    const d = new Date(s + 'T12:00:00'), day = (d.getDay() + 6) % 7;
    const mon = new Date(d);
    mon.setDate(d.getDate() - day);
    const th = new Date(mon);
    th.setDate(mon.getDate() + 3);
    const jan4 = new Date(th.getFullYear(), 0, 4), w1 = new Date(jan4);
    w1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
    const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    return { year: th.getFullYear(), week: Math.round((mon.getTime() - w1.getTime()) / 6048e5) + 1, monday: iso(mon) };
}
const md = (s) => { const [, m, d] = s.split('-'); return lang() === 'es' ? `${Number(d)} ${MONTHS_ES[Number(m) - 1]}` : `${Number(m)}/${Number(d)}`; };
const addD = (s, k) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + k); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** a product line's total: rate x acres, or rate x gallons of water */
function lineTotal(l, x, def) {
    if (l.rate == null)
        return null;
    const k = (l.basis ?? def) === 'acre' ? x.acres : x.water_gal;
    return k == null ? null : Math.round(l.rate * k * 100) / 100;
}
function lineCost(l, p) {
    if (!p?.price || l.total == null)
        return null;
    if (p.price_unit && l.total_unit && unitKey(p.price_unit) !== unitKey(l.total_unit))
        return null;
    return l.total * p.price;
}
export function OpsLogs({ sb, module, sites, areas, strains, flash, batches, wage, extraTabs, fieldAcres, canEditRecipes }) {
    const field = module === 'cultivation';
    const [kind, setKind] = useState('spray');
    const [extraK, setExtraK] = useState(null);
    const [rows, setRows] = useState(null);
    const [products, setProducts] = useState([]);
    const [recipes, setRecipes] = useState([]);
    const [err, setErr] = useState(null);
    const [open, setOpen] = useState(null);
    const [site, setSite] = useState(null);
    const [year, setYear] = useState(null);
    const [q, setQ] = useState('');
    const [opened, setOpened] = useState(null); // null: only the latest month open
    const load = useCallback(async () => {
        const [l, p, r] = await Promise.all([
            pageAll((a, b) => sb.from('ops_logs').select('*').eq('module', module).order('log_on', { ascending: false }).order('id', { ascending: false }).range(a, b)),
            sb.from('input_products').select('*').eq('module', module).order('name').then(r => (r.error ? sb.from('input_products').select('*').order('name') : r)),
            sb.from('ops_recipes').select('*').eq('module', module).order('sort'),
        ]);
        if (l.error) {
            setErr(/ops_logs/.test(l.error.message) ? t('Logs need 031 and 032 run in Supabase.') : l.error.message);
            return;
        }
        setRows((l.data ?? []).map(x => ({ ...x, products: x.products ?? [], sqft: n(x.sqft), water_gal: n(x.water_gal), qty: n(x.qty), hours: n(x.hours), acres: n(x.acres), run_min: n(x.run_min) })));
        setProducts((p.data ?? []).map(x => ({ ...x, price: n(x.price) })));
        setRecipes(r.error ? [] : (r.data ?? []));
        setErr(null);
    }, [sb, module]);
    useEffect(() => { load(); }, [load]);
    const pmap = useMemo(() => new Map(products.map(p => [p.name.toLowerCase(), p])), [products]);
    if (err)
        return _jsx("div", { className: "warnbox", children: err });
    if (!rows)
        return _jsx("p", { className: "muted", children: t('Loading…') });
    const years = [...new Set(rows.map(r => Number(r.log_on.slice(0, 4))))].sort((a, b) => b - a);
    const yr = year ?? years[0] ?? new Date().getFullYear();
    const ql = q.trim().toLowerCase();
    const shown = kind === 'extra' || kind === 'recipes' || kind === 'products' ? [] : rows.filter(r => r.kind === kind && (!site || r.site === site) && Number(r.log_on.slice(0, 4)) === yr &&
        (!ql || `${r.area ?? ''} ${r.task ?? ''} ${r.strain ?? ''} ${r.method ?? ''} ${r.spray_type ?? ''} ${r.notes ?? ''} ${r.products.map(p => p.product).join(' ')}`.toLowerCase().includes(ql)));
    const cost = (r) => r.products.reduce((a, l) => a + (lineCost(l, pmap.get(l.product.toLowerCase())) ?? 0), 0);
    const hrs = (r) => (r.crew ?? 1) * (r.hours ?? 0);
    // year > month > week
    const months = new Map();
    for (const r of shown) {
        const m = Number(r.log_on.slice(5, 7)) - 1, w = isoWeek(r.log_on).week;
        const mm = months.get(m) ?? months.set(m, new Map()).get(m);
        (mm.get(w) ?? mm.set(w, []).get(w)).push(r);
    }
    const first = months.size ? `${yr}-${[...months.keys()][0]}` : '';
    const isOpen = (k) => (opened ?? new Set([first])).has(k);
    const toggle = (k) => setOpened(s => { const x = new Set(s ?? [first]); if (x.has(k))
        x.delete(k);
    else
        x.add(k); return x; });
    const labor = kind === 'labor';
    const cols = labor ? (field ? 8 : 9) : (kind === 'spray' ? 9 : 9) + (sites.length > 1 ? 1 : 0);
    const head = labor
        ? field ? _jsxs("tr", { children: [_jsx("th", { children: t('Date') }), sites.length > 1 && _jsx("th", { children: t('Site') }), _jsx("th", { children: t('Task') }), _jsx("th", { children: t('Where') }), _jsx("th", { className: "num", children: t('People') }), _jsx("th", { className: "num", children: t('Hours') }), _jsx("th", { className: "num", children: t('Person-hrs') }), _jsx("th", { className: "hide-s", children: t('Equipment') }), _jsx("th", { className: "hide-s", children: t('Notes') })] })
            : _jsxs("tr", { children: [_jsx("th", { children: t('Date') }), sites.length > 1 && _jsx("th", { children: t('Site') }), _jsx("th", { children: t('Task') }), _jsx("th", { children: t('Strain') }), _jsx("th", { className: "num", children: t('Qty') }), _jsx("th", { className: "num", children: t('People') }), _jsx("th", { className: "num", children: t('Hours') }), _jsx("th", { className: "num", children: t('Per person-hr') }), wage ? _jsx("th", { className: "num", children: t('Cost / each') }) : _jsx("th", {}), _jsx("th", { className: "hide-s", children: t('Notes') })] })
        : _jsxs("tr", { children: [_jsx("th", { children: t('Date') }), sites.length > 1 && _jsx("th", { children: t('Site') }), _jsx("th", { children: t('Where') }), field && _jsx("th", { className: "num", children: t('Acres') }), _jsx("th", { children: t(kind === 'spray' ? 'Type' : 'Method') }), _jsx("th", { children: t('Products') }), _jsx("th", { className: "num", children: t(kind === 'feed' && field ? 'Solution gal' : 'Water gal') }), !field && _jsx("th", { className: "hide-s", children: t('By') }), _jsx("th", { className: "num", children: t('Cost') }), _jsx("th", { className: "hide-s", children: t('Notes') })] });
    const row = (r) => labor
        ? field ? _jsxs("tr", { className: "tap", onClick: () => setOpen(r), children: [_jsx("td", { className: "nowrap", children: md(r.log_on) }), sites.length > 1 && _jsx("td", { children: r.site }), _jsx("td", { children: r.task ? t(r.task) : '' }), _jsx("td", { children: r.area }), _jsx("td", { className: "num", children: r.crew ?? '' }), _jsx("td", { className: "num", children: num(r.hours, 2) }), _jsx("td", { className: "num", children: num(hrs(r), 1) }), _jsx("td", { className: "hide-s small", children: r.equipment }), _jsx("td", { className: "hide-s small", children: r.notes?.replace('[import FarmData2026]', '').trim() })] }, r.id)
            : _jsxs("tr", { className: "tap", onClick: () => setOpen(r), children: [_jsx("td", { className: "nowrap", children: md(r.log_on) }), sites.length > 1 && _jsx("td", { children: r.site }), _jsx("td", { children: r.task ? t(r.task) : '' }), _jsx("td", { children: r.strain }), _jsx("td", { className: "num", children: num(r.qty) }), _jsx("td", { className: "num", children: r.crew ?? '' }), _jsx("td", { className: "num", children: num(r.hours, 2) }), _jsx("td", { className: "num", children: r.qty && hrs(r) ? num(r.qty / hrs(r)) : '' }), _jsx("td", { className: "num", children: wage && r.qty && hrs(r) ? `$${(hrs(r) * wage / r.qty).toFixed(3)}` : '' }), _jsx("td", { className: "hide-s small", children: r.notes })] }, r.id)
        : _jsxs("tr", { className: "tap", onClick: () => setOpen(r), children: [_jsx("td", { className: "nowrap", children: md(r.log_on) }), sites.length > 1 && _jsx("td", { children: r.site }), _jsx("td", { children: r.area }), field && _jsx("td", { className: "num", children: num(r.acres, 1) }), _jsx("td", { children: kind === 'spray' ? _jsx("span", { className: `pill ${/pest|sulfur/i.test(r.spray_type ?? '') || r.products.some(l => pmap.get(l.product.toLowerCase())?.pesticide) ? 'warnp' : ''}`, children: t(r.spray_type ?? r.method ?? 'Spray') }) : (r.recipe ?? (r.method ? t(r.method) : '')) }), _jsx("td", { className: "small", children: r.products.map(l => `${l.product}${l.rate != null ? ` ${num(l.rate, 2)} ${l.unit ?? ''}${(l.basis ?? 'acre') === 'acre' && field ? '/ac' : ''}` : ''}`).join(', ') }), _jsx("td", { className: "num", children: num(r.water_gal) }), !field && _jsx("td", { className: "hide-s", children: r.applicator }), _jsx("td", { className: "num", children: cost(r) ? money(cost(r)) : '' }), _jsx("td", { className: "hide-s small", children: r.notes?.replace('[import FarmData2026]', '').trim() })] }, r.id);
    const sumLine = (rs) => labor ? `${rs.length} · ${num(rs.reduce((a, r) => a + hrs(r), 0), 1)} ${t('person-hrs')}`
        : `${tn(rs.length, '{n} log', '{n} logs')}${field ? ` · ${num(rs.reduce((a, r) => a + (r.acres ?? 0), 0), 1)} ${t('acres')}` : ''}${rs.some(cost) ? ` · ${money(rs.reduce((a, r) => a + cost(r), 0))}` : ''}`;
    const newLog = (k) => setOpen({ kind: k, module, site: site ?? sites[0], log_on: new Date().toISOString().slice(0, 10), products: [],
        method: k === 'feed' ? (field ? 'Fertigation' : 'Foliar feed') : k === 'spray' ? 'Foliar' : null });
    return _jsxs("div", { className: "opslogs", children: [_jsxs("div", { className: "row toolbar between", children: [_jsxs("div", { className: "row wrap", children: [_jsxs("div", { className: "seg", children: [['spray', 'feed', 'labor'].map(k => _jsx("button", { className: kind === k ? 'on' : '', onClick: () => setKind(k), children: t(KIND_LABEL[k]) }, k)), extraTabs?.map(x => _jsx("button", { className: kind === 'extra' && extraK === x.k ? 'on' : '', onClick: () => { setKind('extra'); setExtraK(x.k); }, children: x.l }, x.k)), _jsx("button", { className: kind === 'recipes' ? 'on' : '', onClick: () => setKind('recipes'), children: t('Recipes') }), _jsx("button", { className: kind === 'products' ? 'on' : '', onClick: () => setKind('products'), children: t('Products') })] }), kind !== 'extra' && kind !== 'recipes' && kind !== 'products' && _jsxs(_Fragment, { children: [_jsx(Select, { value: yr, onChange: e => setYear(Number(e.target.value)), children: (years.length ? years : [yr]).map(y => _jsx("option", { value: y, children: y }, y)) }), sites.length > 1 && _jsx("div", { className: "seg", children: [null, ...sites].map(s => _jsx("button", { className: site === s ? 'on' : '', onClick: () => setSite(s), children: s ?? t('All') }, s ?? 'all')) }), _jsx("input", { className: "search", type: "search", placeholder: t('Field, product, task'), value: q, onChange: e => setQ(e.target.value) })] })] }), kind !== 'extra' && kind !== 'recipes' && kind !== 'products' && _jsx("button", { className: "primary", onClick: () => newLog(kind), children: t('+ ' + KIND_LABEL[kind] + ' log') })] }), kind === 'extra' && extraTabs?.find(x => x.k === extraK)?.node, kind === 'products' && _jsx(Products, { sb: sb, module: module, products: products, logs: rows, canEdit: !!canEditRecipes, field: field, flash: flash, onChanged: load }), kind === 'recipes' && _jsx(Recipes, { sb: sb, module: module, recipes: recipes, products: products, canEdit: !!canEditRecipes, flash: flash, onChanged: load }), kind !== 'extra' && kind !== 'recipes' && kind !== 'products' && (!shown.length ? _jsx("p", { className: "muted", children: t('No ' + KIND_LABEL[kind].toLowerCase() + ' logs in {yr}.', { yr }) }) : _jsxs(_Fragment, { children: [_jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable logtable", children: [_jsx("thead", { children: head }), _jsx("tbody", { children: [...months.entries()].map(([m, weeks]) => {
                                        const mk = `${yr}-${m}`, mrows = [...weeks.values()].flat();
                                        return _jsxs(Fragment, { children: [_jsx("tr", { className: "mhead", onClick: () => toggle(mk), children: _jsxs("td", { colSpan: cols + 1, children: [_jsxs("b", { children: [isOpen(mk) ? '▾' : '▸', " ", lang() === 'es' ? MONTHS_LONG_ES[m] : MONTHS[m], " ", yr] }), " ", _jsxs("span", { className: "muted", children: ["\u00B7 ", sumLine(mrows)] })] }) }), isOpen(mk) && [...weeks.entries()].map(([w, rs]) => {
                                                    const mon = isoWeek(rs[0].log_on).monday;
                                                    return _jsxs(Fragment, { children: [_jsx("tr", { className: "wk", children: _jsxs("td", { colSpan: cols + 1, children: [t('Week {w}', { w }), " ", _jsxs("span", { className: "muted", children: ["\u00B7 ", t('{a} to {b}', { a: md(mon), b: md(addD(mon, 6)) }), " \u00B7 ", sumLine(rs)] })] }) }), rs.map(row)] }, `${mk}-${w}`);
                                                })] }, mk);
                                    }) })] }) }), !labor && _jsx(ProductTotals, { rows: shown, pmap: pmap, label: `${yr}${site ? ` · ${site}` : ''}` }), labor && !field && _jsx(LaborTotals, { rows: shown, wage: wage })] })), open && _jsx(LogSheet, { sb: sb, x0: open, field: field, sites: sites, areas: [...new Set([...areas, ...rows.map(r => r.area).filter((a) => !!a)])], strains: strains, products: products, recipes: recipes.filter(r => r.active), batches: batches, flash: flash, fieldAcres: fieldAcres, onClose: () => setOpen(null), onSaved: async (m) => { setOpen(null); await load(); flash(m); } })] });
}
/** what went on this year: each product's total and cost (pesticide use at a glance) */
function ProductTotals({ rows, pmap, label }) {
    const tot = new Map();
    for (const r of rows)
        for (const l of r.products) {
            if (!l.product)
                continue;
            const k = `${l.product.toLowerCase()}|${unitKey(l.total_unit)}`;
            const p = pmap.get(l.product.toLowerCase());
            const g = tot.get(k) ?? tot.set(k, { name: l.product, unit: l.total_unit ?? '', total: 0, cost: 0, logs: 0, pest: !!p?.pesticide }).get(k);
            g.total += l.total ?? 0;
            g.cost += lineCost(l, p) ?? 0;
            g.logs++;
        }
    const xs = [...tot.values()].sort((a, b) => Number(b.pest) - Number(a.pest) || b.cost - a.cost || a.name.localeCompare(b.name));
    if (!xs.length)
        return null;
    return _jsxs("details", { className: "ptotals", children: [_jsxs("summary", { children: [_jsx("b", { children: t('Product totals') }), " ", _jsxs("span", { className: "muted", children: ["\u00B7 ", label, " \u00B7 ", t('{n} products', { n: xs.length }), xs.some(x => x.cost) ? ` · ${money(xs.reduce((a, x) => a + x.cost, 0))}` : ''] })] }), _jsx("div", { className: "cwrap tight", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('Product') }), _jsx("th", { className: "num", children: t('Total') }), _jsx("th", { className: "num", children: t('Logs') }), _jsx("th", { className: "num", children: t('Cost') })] }) }), _jsx("tbody", { children: xs.map(x => _jsxs("tr", { children: [_jsxs("td", { children: [x.name, x.pest && _jsxs("span", { className: "pill warnp", children: [" ", t('pesticide')] })] }), _jsxs("td", { className: "num", children: [num(x.total, 1), " ", x.unit] }), _jsx("td", { className: "num", children: x.logs }), _jsx("td", { className: "num", children: x.cost ? money(x.cost) : '' })] }, x.name + x.unit)) })] }) })] });
}
function LaborTotals({ rows, wage }) {
    const by = new Map();
    for (const r of rows) {
        const g = by.get(r.task ?? 'Other') ?? by.set(r.task ?? 'Other', { qty: 0, hrs: 0 }).get(r.task ?? 'Other');
        g.qty += r.qty ?? 0;
        g.hrs += (r.crew ?? 1) * (r.hours ?? 0);
    }
    return _jsx("div", { className: "calcbox", children: [...by.entries()].map(([k, g]) => _jsxs(Fragment, { children: [_jsx("span", { children: t(k) }), _jsxs("b", { children: [t('{q} in {h} person-hrs', { q: num(g.qty), h: num(g.hrs, 1) }), g.hrs && g.qty ? ` · ${num(g.qty / g.hrs)}/${t('hr')}` : '', wage && g.qty ? ` · $${(g.hrs * wage / g.qty).toFixed(3)} ${t('each')}` : ''] })] }, k)) });
}
function LogSheet({ sb, x0, field, sites, areas, strains, products, recipes, batches, flash, fieldAcres, onClose, onSaved }) {
    const basis = field ? 'acre' : 'gal';
    const blank = () => ({ product: '', rate: null, unit: null, basis, total: null, total_unit: null });
    const tag = /^\[import [^\]]+\]/.exec(x0.notes ?? '')?.[0] ?? '';
    const [x, setX] = useState({ ...x0, notes: tag ? (x0.notes ?? '').slice(tag.length).trim() : x0.notes, products: x0.products?.length ? x0.products : x0.kind === 'labor' ? [] : [blank()] });
    const [busy, setBusy] = useState(false);
    // CCOF checks only where the site is certified (Compliance > Settings > Sites; 056). Unknown: Cultivation yes, Nursery no.
    const [certs, setCerts] = useState(null);
    useEffect(() => { sb.from('comp_certs').select('site,ccof').then(r => { if (!r.error)
        setCerts(Object.fromEntries((r.data ?? []).map(c => [c.site.toUpperCase(), c.ccof]))); }, () => { }); }, []);
    const certSite = (x.site ?? (x.module === 'nursery' ? '1PN' : '')).toUpperCase();
    const certified = certs?.[certSite] ?? x.module !== 'nursery';
    const [sure, setSure] = useState(false);
    const pmap = useMemo(() => new Map(products.map(p => [p.name.toLowerCase(), p])), [products]);
    const retotal = (s) => ({ ...s, products: (s.products ?? []).map(l => ({ ...l, total: lineTotal(l, s, basis), total_unit: l.unit })) });
    const set = (v) => setX(s => retotal({ ...s, ...v }));
    const setLine = (i, v) => setX(s => {
        const ps = [...(s.products ?? [])];
        let l = { ...ps[i], ...v };
        if (v.product !== undefined) {
            const p = pmap.get((v.product ?? '').toLowerCase());
            if (p)
                l = { ...l, manufacturer: p.manufacturer, ...(l.rate == null ? { rate: p.rate, unit: p.rate_unit ? p.rate_unit.replace(/\/.*$/, '') : l.unit } : {}) };
        }
        ps[i] = l;
        return retotal({ ...s, products: ps });
    });
    const useRecipe = (name) => {
        const r = recipes.find(z => z.name === name);
        if (!r)
            return;
        setX(s => retotal({ ...s, recipe: r.name, method: r.method ?? s.method, water_gal: r.water_per_acre && s.acres ? Math.round(r.water_per_acre * s.acres) : s.water_gal,
            products: r.products.map(l => ({ ...l, basis: l.basis ?? basis, total: null, total_unit: l.unit })) }));
    };
    const labor = x.kind === 'labor';
    const cost = (x.products ?? []).reduce((a, l) => a + (lineCost(l, pmap.get(l.product.toLowerCase())) ?? 0), 0);
    const pest = (x.products ?? []).filter(l => pmap.get(l.product.toLowerCase())?.pesticide);
    async function save() {
        setBusy(true);
        try {
            const ps = (x.products ?? []).filter(l => l.product.trim());
            const fresh = ps.filter(l => !pmap.has(l.product.trim().toLowerCase()));
            if (fresh.length)
                await sb.from('input_products').insert(fresh.map(l => ({ module: x.module, name: l.product.trim(), rate: l.rate, rate_unit: l.unit ? `${l.unit}/${l.basis ?? basis}` : null })));
            const row = { module: x.module, kind: x.kind, site: x.site, area: x.area || null, log_on: x.log_on, start_at: x.start_at || null, end_at: x.end_at || null, sqft: x.sqft ?? null,
                spray_type: x.spray_type || null, water_gal: x.water_gal ?? null, applicator: x.applicator || null, products: ps, task: x.task || null, strain: x.strain || null,
                batch_id: x.batch_id ?? null, qty: x.qty ?? null, crew: x.crew ?? null, hours: x.hours ?? null, notes: [tag, x.notes].filter(Boolean).join(' ') || null,
                method: x.method || null, acres: x.acres ?? null, run_min: x.run_min ?? null, equipment: x.equipment || null, recipe: x.recipe || null };
            const { error } = x.id ? await sb.from('ops_logs').update(row).eq('id', x.id) : await sb.from('ops_logs').insert(row);
            if (error)
                throw new Error(error.message.includes('column') ? t('Run 032_logs_recipes.sql in Supabase first') : error.message);
            await onSaved(x.id ? t('Log saved') : t(KIND_LABEL[x.kind] + ' logged'));
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
        finally {
            setBusy(false);
        }
    }
    async function del() {
        setBusy(true);
        const { error } = await sb.from('ops_logs').delete().eq('id', x.id);
        setBusy(false);
        if (error)
            flash(error.message, true);
        else
            await onSaved(t('Log deleted'));
    }
    const inp = (k, type = 'text', ph = '') => _jsx("input", { type: type, value: x[k] ?? '', placeholder: ph, onChange: e => set({ [k]: type === 'number' ? n(e.target.value) : e.target.value }) });
    const where = (v) => set({ area: v, ...(fieldAcres?.[v] != null && x.acres == null ? { acres: fieldAcres[v] } : {}) });
    const myRecipes = recipes.filter(r => r.kind === x.kind);
    return (_jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: "sheet form csheet wide", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsx("h2", { children: t(x.id ? KIND_LABEL[x.kind] + ' log' : 'New ' + KIND_LABEL[x.kind].toLowerCase() + ' log') }), _jsx("button", { className: "ghost", onClick: onClose, children: "\u2715" })] }), _jsxs("div", { className: "grid3", children: [_jsxs("div", { className: "field", children: [_jsx("label", { children: t('Date') }), inp('log_on', 'date')] }), sites.length > 1 && _jsxs("div", { className: "field", children: [_jsx("label", { children: t('Site') }), _jsx(Select, { value: x.site, onChange: e => set({ site: e.target.value }), children: sites.map(s => _jsx("option", { children: s }, s)) })] }), (!labor || field) && _jsxs("div", { className: "field", children: [_jsx("label", { children: t(field ? 'Field / block' : 'Where') }), _jsx(ListInput, { list: "ops-areas", value: x.area ?? '', onChange: e => where(e.target.value), placeholder: field ? t('Block 6, Field 8A…') : t('Webb, GH, Hoops 1-4…') }), _jsx("datalist", { id: "ops-areas", children: areas.map(a => _jsx("option", { value: a }, a)) })] }), field && !labor && _jsxs("div", { className: "field", children: [_jsx("label", { children: t('Acres') }), inp('acres', 'number')] }), x.kind === 'spray' && _jsxs("div", { className: "field", children: [_jsx("label", { children: t('Type') }), _jsxs(Select, { value: x.spray_type ?? '', onChange: e => set({ spray_type: e.target.value }), children: [_jsx("option", { value: "", children: "\u2014" }), SPRAY_TYPES.map(o => _jsx("option", { value: o, children: t(o) }, o))] })] }), x.kind === 'feed' && _jsxs("div", { className: "field", children: [_jsx("label", { children: t('Method') }), _jsxs(Select, { value: x.method ?? '', onChange: e => set({ method: e.target.value }), children: [_jsx("option", { value: "", children: "\u2014" }), FEED_METHODS.map(o => _jsx("option", { value: o, children: t(o) }, o))] })] }), !labor && myRecipes.length > 0 && _jsxs("div", { className: "field", children: [_jsx("label", { children: t('Recipe') }), _jsxs(Select, { value: x.recipe ?? '', onChange: e => e.target.value ? useRecipe(e.target.value) : set({ recipe: null }), children: [_jsx("option", { value: "", children: "\u2014" }), myRecipes.map(r => _jsx("option", { children: r.name }, r.id))] })] }), !labor && _jsxs("div", { className: "field", children: [_jsx("label", { children: t(x.method === 'Fertigation' ? 'Solution (gal)' : 'Water (gal)') }), inp('water_gal', 'number')] }), x.method === 'Fertigation' && _jsxs("div", { className: "field", children: [_jsx("label", { children: t('Run time (min)') }), inp('run_min', 'number')] }), !labor && !field && _jsxs("div", { className: "field", children: [_jsx("label", { children: t('Start') }), inp('start_at', 'time')] }), !labor && !field && _jsxs("div", { className: "field", children: [_jsx("label", { children: t('End') }), inp('end_at', 'time')] }), !labor && !field && _jsxs("div", { className: "field", children: [_jsx("label", { children: t('Area (sq ft)') }), inp('sqft', 'number')] }), !labor && _jsxs("div", { className: "field", children: [_jsx("label", { children: t(x.kind === 'spray' ? 'Applicator' : 'By') }), inp('applicator')] }), labor && _jsxs("div", { className: "field", children: [_jsx("label", { children: t('Task') }), _jsx(ListInput, { list: "ops-tasks", value: x.task ?? '', onChange: e => set({ task: e.target.value }) }), _jsx("datalist", { id: "ops-tasks", children: (field ? FIELD_TASKS : TASKS).map(o => _jsx("option", { value: o, children: lang() === 'es' ? t(o) : '' }, o)) })] }), labor && !field && _jsxs("div", { className: "field", children: [_jsx("label", { children: t('Strain') }), _jsx(ListInput, { list: "ops-strains", value: x.strain ?? '', onChange: e => set({ strain: e.target.value }) }), _jsx("datalist", { id: "ops-strains", children: strains.map(s => _jsx("option", { value: s }, s)) })] }), labor && batches && _jsxs("div", { className: "field", children: [_jsx("label", { children: t('Batch') }), _jsxs(Select, { value: x.batch_id ?? '', onChange: e => { const b = batches.find(v => v.id === Number(e.target.value)); set({ batch_id: b?.id ?? null, ...(b && !x.strain ? { strain: b.strain } : {}) }); }, children: [_jsx("option", { value: "", children: "\u2014" }), batches.filter(b => !x.strain || b.strain.toLowerCase() === x.strain.toLowerCase()).map(b => _jsx("option", { value: b.id, children: b.label }, b.id))] })] }), labor && !field && _jsxs("div", { className: "field", children: [_jsx("label", { children: t('How many (clones, plants)') }), inp('qty', 'number')] }), labor && _jsxs("div", { className: "field", children: [_jsx("label", { children: t('People') }), inp('crew', 'number')] }), labor && _jsxs("div", { className: "field", children: [_jsx("label", { children: t('Hours (each)') }), inp('hours', 'number')] }), labor && field && _jsxs("div", { className: "field", children: [_jsx("label", { children: t('Equipment / tools') }), inp('equipment', 'text', '6130M JD / cultivator')] })] }), !labor && _jsxs(_Fragment, { children: [_jsxs("h3", { children: [t('Products'), " ", _jsx("span", { className: "muted small", children: t(basis === 'acre' ? 'rate per acre' : 'rate per gallon of water') })] }), _jsx("datalist", { id: "ops-products", children: products.filter(p => p.active).map(p => _jsx("option", { value: p.name, children: p.manufacturer ?? '' }, p.id)) }), (x.products ?? []).map((l, i) => _jsxs("div", { className: "row prodline", children: [_jsx(ListInput, { list: "ops-products", value: l.product, placeholder: t('Product'), onChange: e => setLine(i, { product: e.target.value }) }), _jsx("input", { type: "number", value: l.rate ?? '', placeholder: t('Rate'), onChange: e => setLine(i, { rate: n(e.target.value) }) }), _jsx("input", { value: l.unit ?? '', placeholder: field ? 'gal, lb, fl oz' : 'mL', onChange: e => setLine(i, { unit: e.target.value }) }), _jsxs("span", { className: "muted small", children: [l.total != null ? `= ${num(l.total, 1)} ${l.total_unit ?? ''}` : '', (() => { const c = lineCost(l, pmap.get(l.product.toLowerCase())); return c ? ` · ${money(c)}` : ''; })()] }), _jsx("button", { className: "ghost small", onClick: () => setX(s => ({ ...s, products: (s.products ?? []).filter((_, j) => j !== i) })), children: "\u2715" }), (() => { const w = certified ? ccofWarn(l.product, pmap, x.log_on) : null; return w ? _jsx("div", { className: "warn-t small prodwarn", children: w }) : null; })()] }, i)), _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost small", onClick: () => setX(s => ({ ...s, products: [...(s.products ?? []), blank()] })), children: t('+ Product') }), cost > 0 && _jsxs("span", { className: "muted small", children: [t('Cost'), " ", money(cost), x.acres ? ` · ${money(cost / x.acres)}/${t('acre')}` : ''] })] }), pest.length > 0 && _jsxs("p", { className: "warn-t small-note", children: [t('Pesticide'), ": ", pest.map(l => l.product).join(', '), ". ", t('Record the applicator and times for the use report.')] })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: t('Notes') }), inp('notes')] }), _jsxs("div", { className: "row between csave", children: [x.id ? (sure ? _jsxs("span", { className: "row", children: [_jsx("button", { className: "ghost danger", disabled: busy, onClick: del, children: t('Yes, delete') }), _jsx("button", { className: "ghost small", onClick: () => setSure(false), children: t('Keep') })] })
                            : _jsx("button", { className: "ghost", onClick: () => setSure(true), children: t('Delete') })) : _jsx("span", {}), _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost", onClick: onClose, children: t('Cancel') }), _jsx("button", { className: "primary", disabled: busy || !x.log_on, onClick: save, children: busy ? t('Saving…') : t('Save') })] })] })] }) }));
}
/** recipes: a named product list with rates (Admins edit) */
function Recipes({ sb, module, recipes, products, canEdit, flash, onChanged }) {
    const [ed, setEd] = useState(null);
    const [busy, setBusy] = useState(false);
    const pmap = new Map(products.map(p => [p.name.toLowerCase(), p]));
    const perAcre = (r) => (r.products ?? []).reduce((a, l) => a + (lineCost({ ...l, total: l.rate, total_unit: l.unit }, pmap.get(l.product.toLowerCase())) ?? 0), 0);
    async function save() {
        setBusy(true);
        const row = { module, kind: ed.kind ?? 'feed', name: ed.name.trim(), method: ed.method || null, stage: ed.stage || null, water_per_acre: ed.water_per_acre ?? null,
            products: (ed.products ?? []).filter(l => l.product.trim()), active: ed.active !== false };
        const { error } = ed.id ? await sb.from('ops_recipes').update(row).eq('id', ed.id) : await sb.from('ops_recipes').insert(row);
        setBusy(false);
        if (error)
            flash(error.message, true);
        else {
            setEd(null);
            onChanged();
            flash(t('Recipe saved'));
        }
    }
    return _jsxs(_Fragment, { children: [_jsxs("div", { className: "row toolbar between", children: [_jsx("span", { className: "muted", children: t('Pick a recipe on a log to fill its products and rates.') }), canEdit && _jsx("button", { className: "primary", onClick: () => setEd({ kind: 'feed', products: [{ product: '', rate: null, unit: null, basis: 'acre', total: null, total_unit: null }] }), children: t('+ Recipe') })] }), !recipes.length && _jsx("p", { className: "muted", children: t('No recipes yet.') }), _jsx("div", { className: "dlist", children: recipes.map(r => _jsxs("button", { className: `drow click ${r.active ? '' : 'off'}`, onClick: () => canEdit && setEd(r), children: [_jsxs("span", { className: "grow", children: [_jsx("b", { children: r.name }), _jsxs("span", { className: "muted", children: [" \u00B7 ", t(r.kind === 'spray' ? 'Spray' : 'Feed'), r.method ? ` · ${t(r.method)}` : '', r.water_per_acre ? ` · ${t('{n} gal water/acre', { n: r.water_per_acre })}` : ''] }), _jsx("div", { className: "small muted", children: r.products.map(l => `${l.product} ${num(l.rate, 2)} ${l.unit ?? ''}`).join(', ') })] }), perAcre(r) > 0 && _jsxs("b", { children: [money(perAcre(r)), "/", t('acre')] })] }, r.id)) }), ed && _jsx("div", { className: "scrim", onClick: () => setEd(null), children: _jsxs("div", { className: "sheet form csheet wide", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsx("h2", { children: ed.id ? ed.name : t('New recipe') }), _jsx("button", { className: "ghost", onClick: () => setEd(null), children: "\u2715" })] }), _jsxs("div", { className: "grid3", children: [_jsxs("div", { className: "field", children: [_jsx("label", { children: t('Name') }), _jsx("input", { value: ed.name ?? '', onChange: e => setEd({ ...ed, name: e.target.value }) })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: t('For') }), _jsxs(Select, { value: ed.kind, onChange: e => setEd({ ...ed, kind: e.target.value }), children: [_jsx("option", { value: "feed", children: t('Feed') }), _jsx("option", { value: "spray", children: t('Spray') })] })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: t('Method') }), _jsx(ListInput, { list: "r-methods", value: ed.method ?? '', onChange: e => setEd({ ...ed, method: e.target.value }) }), _jsx("datalist", { id: "r-methods", children: [...FEED_METHODS, 'Foliar'].map(m => _jsx("option", { value: m }, m)) })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: t('Stage') }), _jsx("input", { value: ed.stage ?? '', onChange: e => setEd({ ...ed, stage: e.target.value }), placeholder: t('Vegetative, Flower…') })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: t('Water gal / acre') }), _jsx("input", { type: "number", value: ed.water_per_acre ?? '', onChange: e => setEd({ ...ed, water_per_acre: n(e.target.value) }) })] })] }), _jsx("datalist", { id: "ops-products", children: products.map(p => _jsx("option", { value: p.name }, p.id)) }), (ed.products ?? []).map((l, i) => _jsxs("div", { className: "row prodline", children: [_jsx(ListInput, { list: "ops-products", value: l.product, placeholder: t('Product'), onChange: e => setEd({ ...ed, products: ed.products.map((z, j) => j === i ? { ...z, product: e.target.value } : z) }) }), _jsx("input", { type: "number", value: l.rate ?? '', placeholder: t('Rate'), onChange: e => setEd({ ...ed, products: ed.products.map((z, j) => j === i ? { ...z, rate: n(e.target.value) } : z) }) }), _jsx("input", { value: l.unit ?? '', placeholder: t('unit'), onChange: e => setEd({ ...ed, products: ed.products.map((z, j) => j === i ? { ...z, unit: e.target.value } : z) }) }), _jsx("button", { className: "ghost small", onClick: () => setEd({ ...ed, products: ed.products.filter((_, j) => j !== i) }), children: "\u2715" })] }, i)), _jsx("button", { className: "ghost small", onClick: () => setEd({ ...ed, products: [...(ed.products ?? []), { product: '', rate: null, unit: null, basis: module === 'nursery' ? 'gal' : 'acre', total: null, total_unit: null }] }), children: t('+ Product') }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: ed.active !== false, onChange: e => setEd({ ...ed, active: e.target.checked }) }), " ", _jsx("span", { children: t('In use') })] }), _jsxs("div", { className: "row between csave", children: [_jsx("span", {}), _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost", onClick: () => setEd(null), children: t('Cancel') }), _jsx("button", { className: "primary", disabled: busy || !ed.name?.trim(), onClick: save, children: t('Save') })] })] })] }) })] });
}
/** Logs > Products: this module's own product list (rates, prices, pesticide details) and how much each was used */
function Products({ sb, module, products, logs, canEdit, field, flash, onChanged }) {
    const [ed, setEd] = useState(null);
    const [q, setQ] = useState('');
    const [f, setF] = useState('all');
    const [busy, setBusy] = useState(false);
    const yr = new Date().getFullYear();
    const use = useMemo(() => {
        const m = new Map();
        for (const r of logs)
            for (const l of r.products) {
                if (!l.product)
                    continue;
                const k = l.product.toLowerCase(), g = m.get(k) ?? { n: 0, last: '', total: 0, unit: l.total_unit ?? '', cost: 0 };
                g.n++;
                if (r.log_on > g.last)
                    g.last = r.log_on;
                if (r.log_on.startsWith(String(yr)) && l.total != null && unitKey(l.total_unit) === unitKey(g.unit))
                    g.total += l.total;
                m.set(k, g);
            }
        return m;
    }, [logs, yr]);
    const ql = q.trim().toLowerCase();
    const shown = products.filter(p => (f === 'all' ? p.active : f === 'pest' ? p.pesticide && p.active : !p.active) &&
        (!ql || `${p.name} ${p.manufacturer ?? ''} ${p.full_name ?? ''} ${p.form ?? p.kind ?? ''} ${p.npk ?? ''}`.toLowerCase().includes(ql)))
        .sort((a, b) => (use.get(b.name.toLowerCase())?.n ?? 0) - (use.get(a.name.toLowerCase())?.n ?? 0) || a.name.localeCompare(b.name));
    const per = field ? 'acre' : 'gal';
    async function save() {
        if (!ed?.name?.trim())
            return;
        setBusy(true);
        const row = { module, name: ed.name.trim(), manufacturer: ed.manufacturer || null, full_name: ed.full_name || null, form: ed.form || null, kind: ed.form || ed.kind || null,
            npk: ed.npk || null, nutrients: ed.nutrients || null, rate: ed.rate ?? null, rate_unit: ed.rate_unit || null, price: ed.price ?? null, price_unit: ed.price_unit || null,
            pesticide: !!ed.pesticide, epa_reg: ed.epa_reg || null, rei_hours: ed.rei_hours ?? null, phi_days: ed.phi_days ?? null, active_ingredient: ed.active_ingredient || null,
            label_url: ed.label_url || null, notes: ed.notes || null, active: ed.active !== false };
        const { error } = ed.id ? await sb.from('input_products').update(row).eq('id', ed.id) : await sb.from('input_products').insert(row);
        setBusy(false);
        if (error)
            flash(/duplicate|unique/.test(error.message) ? t('There\'s already a product with that name') : /module|column/.test(error.message) ? t('Run 037_products.sql in Supabase first') : error.message, true);
        else {
            setEd(null);
            onChanged();
            flash(t('Product saved'));
        }
    }
    const txt = (k, label, ph = '') => _jsxs("div", { className: "field", children: [_jsx("label", { children: t(label) }), _jsx("input", { value: ed?.[k] ?? '', placeholder: ph, disabled: !canEdit, onChange: e => setEd({ ...ed, [k]: e.target.value }) })] });
    const nm = (k, label) => _jsxs("div", { className: "field", children: [_jsx("label", { children: t(label) }), _jsx("input", { type: "number", value: ed?.[k] ?? '', disabled: !canEdit, onChange: e => setEd({ ...ed, [k]: n(e.target.value) }) })] });
    return _jsxs(_Fragment, { children: [_jsxs("div", { className: "row toolbar between", children: [_jsxs("div", { className: "row wrap", children: [_jsx("div", { className: "seg", children: [['all', t('In use')], ['pest', t('Pesticides')], ['off', t('Not used anymore')]].map(([k, l]) => _jsx("button", { className: f === k ? 'on' : '', onClick: () => setF(k), children: l }, k)) }), _jsx("input", { className: "search", type: "search", placeholder: t('Product, maker, N-P-K'), value: q, onChange: e => setQ(e.target.value) })] }), canEdit && _jsx("button", { className: "primary", onClick: () => setEd({ active: true, rate_unit: field ? 'fl oz/acre' : 'mL/gal' }), children: t('+ Product') })] }), _jsx("p", { className: "muted small-note", children: t(field ? 'Cultivation\'s products. Rates are per acre. Used = times on a log; the total is this year.' : 'The Nursery\'s products. Rates are per gallon of water. Used = times on a log; the total is this year.') }), !shown.length ? _jsx("p", { className: "muted", children: t('No products here.') }) : _jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('Product') }), _jsx("th", { className: "hide-s", children: t('Maker') }), _jsx("th", { className: "hide-s", children: t('Type') }), _jsx("th", { children: t('N-P-K') }), _jsx("th", { className: "num", children: t('Rate') }), _jsx("th", { className: "num hide-s", children: t('Price') }), _jsx("th", { className: "num", children: t('Used') }), _jsx("th", { className: "hide-s", children: t('Last used') }), _jsx("th", { className: "num hide-s", children: t('{y} total', { y: yr }) })] }) }), _jsx("tbody", { children: shown.map(p => {
                                const u = use.get(p.name.toLowerCase());
                                return (_jsxs("tr", { className: "tap", onClick: () => setEd(p), children: [_jsxs("td", { children: [_jsx("b", { children: p.name }), p.pesticide && _jsxs("span", { className: "pill warnp", children: [" ", t('pesticide')] })] }), _jsx("td", { className: "hide-s small", children: p.manufacturer }), _jsx("td", { className: "hide-s small", children: p.form ?? p.kind }), _jsx("td", { className: "small", children: p.npk }), _jsx("td", { className: "num nowrap", children: p.rate != null ? `${num(p.rate, 2)} ${p.rate_unit ?? ''}` : '' }), _jsx("td", { className: "num hide-s nowrap", children: p.price != null ? `$${num(p.price, 2)}/${p.price_unit ?? ''}` : '' }), _jsx("td", { className: "num", children: u?.n ?? '' }), _jsx("td", { className: "hide-s nowrap", children: u?.last ? md(u.last) + (u.last.startsWith(String(yr)) ? '' : ` ${u.last.slice(0, 4)}`) : '' }), _jsx("td", { className: "num hide-s nowrap", children: u?.total ? `${num(u.total, 1)} ${u.unit}` : '' })] }, p.id));
                            }) })] }) }), ed && _jsx("div", { className: "scrim", onClick: () => setEd(null), children: _jsxs("div", { className: "sheet form csheet wide", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsx("h2", { children: ed.id ? ed.name : t('New product') }), _jsx("button", { className: "ghost", onClick: () => setEd(null), children: "\u2715" })] }), !canEdit && _jsx("p", { className: "muted", children: t('Only an Admin of this module can change products.') }), _jsxs("div", { className: "grid3", children: [txt('name', 'Name'), txt('manufacturer', 'Maker'), txt('full_name', 'Full product name'), txt('form', 'Type / form', 'Liquid, WDG…'), txt('npk', 'N-P-K', '2-7-0.3'), txt('nutrients', 'Other nutrients', 'Calcium 5%, Boron…'), nm('rate', 'Typical rate'), txt('rate_unit', 'Rate unit', `mL/${per}`), _jsx("div", {}), nm('price', 'Price ($)'), txt('price_unit', 'Price per', 'gal, lb, fl oz'), _jsx("div", {})] }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", disabled: !canEdit, checked: !!ed.pesticide, onChange: e => setEd({ ...ed, pesticide: e.target.checked }) }), " ", _jsxs("span", { children: [_jsx("b", { children: t('Pesticide') }), " ", _jsx("span", { className: "muted", children: t('flags it on logs for the use report') })] })] }), ed.pesticide && _jsxs("div", { className: "grid3", children: [txt('epa_reg', 'EPA reg #'), txt('active_ingredient', 'Active ingredient'), _jsx("div", {}), nm('rei_hours', 'REI (hours)'), nm('phi_days', 'PHI (days)')] }), txt('label_url', 'Label / SDS link', 'https://…'), ed.label_url && /^https?:/.test(ed.label_url) && _jsx("p", { className: "small-note", children: _jsxs("a", { href: ed.label_url, target: "_blank", rel: "noreferrer", children: [t('Open the label'), " \u2197"] }) }), txt('notes', 'Notes'), (() => { const u = ed.name ? use.get(ed.name.toLowerCase()) : undefined; return u ? _jsx("p", { className: "muted small-note", children: t('On {n} logs, last {date}.', { n: u.n, date: md(u.last) }) }) : null; })(), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", disabled: !canEdit, checked: ed.active !== false, onChange: e => setEd({ ...ed, active: e.target.checked }) }), " ", _jsx("span", { children: t('In use') })] }), _jsxs("div", { className: "row between csave", children: [_jsx("span", {}), canEdit ? _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost", onClick: () => setEd(null), children: t('Cancel') }), _jsx("button", { className: "primary", disabled: busy || !ed.name?.trim(), onClick: save, children: busy ? t('Saving…') : t('Save') })] })
                                    : _jsx("button", { className: "ghost", onClick: () => setEd(null), children: t('Close') })] })] }) })] });
}
