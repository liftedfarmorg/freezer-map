import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { MTag } from './mtag';
import { StrainLink } from './strainCard';
// Inventory tabs for Distribution and Sales, built on the shared InvTable (Processing has its own in proc/).
import { useEffect, useState } from 'react';
import { InvTable } from './invtable';
import { FINISH_LABEL, PRODUCT_LABEL } from './types';
const n0 = (x) => (x == null || !isFinite(x) ? '' : Math.round(x).toLocaleString());
const daysSince = (iso) => iso ? Math.max(0, Math.round((Date.now() - new Date(iso.slice(0, 10) + 'T12:00:00').getTime()) / 864e5)) : null;
const GradeChip = ({ g }) => _jsx("span", { className: `pill grade ${g.toLowerCase()}`, children: g });
const prodOf = (p) => (p.product ?? 'fresh_frozen');
const live = (p) => p.status === 'in_freezer' || p.status === 'unslotted' || p.status === 'in_transit';
const itemName = (i) => i ? `${FINISH_LABEL[i.finish] ?? i.finish} · ${i.crop_year} · ${i.site}` : '';
const yearOf = (c, p) => p.crop_year ?? c.item(p.item_id)?.crop_year ?? (p.harvest_date ? Number(p.harvest_date.slice(0, 4)) : null);
// ---------- Distribution: where is it ----------
export function DistInventory({ c, onMove, flash }) {
    const rows = c.pallets.filter(p => p.kind !== 'mixed' && live(p));
    const freezerOf = (p) => { const w = c.where(p).replace(/^on \S+ · /, ''); return w.split(' · ')[0]; };
    const spotOf = (p) => { const m = p.container_id ? c.pallet(p.container_id) : undefined; return m ? `${c.where(m)} · ${m.code}` : c.where(p); };
    const flags = (p) => [
        p.slot_id == null && !p.container_id && p.status === 'unslotted' ? 'Needs a spot' : '',
        p.tag_pending ? 'Tag pending' : '', c.held(p.id) ? `Held: ${c.held(p.id)}` : '',
        c.onLoad(p.id) ? `On ${c.onLoad(p.id)}` : '', c.inRun(p.id) ? `In run ${c.inRun(p.id)}` : '',
        p.needs_review ? 'Flagged' : '',
    ].filter(Boolean);
    const physical = new Set(rows.map(p => p.container_id ?? p.id)).size;
    const cols = [
        { k: 'code', l: 'Pallet', phone: true, get: p => _jsxs(_Fragment, { children: [_jsx("b", { children: p.code }), p.container_id ? _jsxs("span", { className: "pill mixedp", children: ["on ", c.pallet(p.container_id)?.code] }) : null] }), val: p => p.code },
        { k: 'strain', l: 'Strain', phone: true, get: p => _jsxs(_Fragment, { children: [p.strain ?? p.label ?? '', prodOf(p) !== 'fresh_frozen' && _jsx("span", { className: "pill prod", children: PRODUCT_LABEL[prodOf(p)] })] }), val: p => p.strain ?? '' },
        { k: 'grade', l: 'Grade', phone: true, get: p => _jsx(GradeChip, { g: c.grade(p).grade }), val: p => c.grade(p).grade },
        { k: 'lbs', l: 'Lbs', num: true, phone: true, get: p => n0(p.current_weight), val: p => Number(p.current_weight ?? 0) },
        { k: 'where', l: 'Location', phone: true, get: p => _jsx("span", { className: "small", children: c.where(p) }), val: p => c.where(p) },
        { k: 'item', l: 'Item', get: p => _jsx("span", { className: "small", children: itemName(c.item(p.item_id)) }), val: p => c.item(p.item_id)?.sku ?? '' },
        { k: 'lot', l: 'Harvest lot', get: p => _jsx("span", { className: "mono small", children: c.lot(p.lot_id)?.code ?? '' }), val: p => c.lot(p.lot_id)?.code ?? '' },
        { k: 'tag', l: 'METRC tag', get: p => _jsx("span", { className: "small", children: p.package_tag ? _jsx(MTag, { t: p.package_tag, n: 8 }) : p.tag_pending ? 'pending' : '' }), val: p => p.package_tag ?? '' },
        { k: 'age', l: 'Days', num: true, get: p => n0(daysSince(p.harvest_date)), val: p => daysSince(p.harvest_date) ?? -1 },
        { k: 'flags', l: 'Flags', get: p => _jsx("span", { className: "flags", children: flags(p).map(f => _jsx("span", { className: "pill warnp", children: f }, f)) }), val: p => flags(p).join('; ') },
        { k: 'harvested', l: 'Harvested', on: false, get: p => p.harvest_date ?? '', val: p => p.harvest_date ?? '' },
        { k: 'farm', l: 'Grown at', on: false, get: p => p.origin_site ?? '', val: p => p.origin_site ?? '' },
        { k: 'sku', l: 'SKU', on: false, get: p => _jsx("span", { className: "mono small", children: c.item(p.item_id)?.sku ?? '' }), val: p => c.item(p.item_id)?.sku ?? '' },
    ];
    const spotOrder = (k) => k.replace(/(\d+)/g, m => m.padStart(4, '0'));
    const containerByKey = new Map();
    for (const p of rows)
        if (p.container_id)
            containerByKey.set(spotOf(p), p.container_id);
    const groups = [
        { k: 'freezer', l: 'Freezer', key: freezerOf, order: spotOrder },
        { k: 'spot', l: 'Spot', key: spotOf, order: spotOrder,
            head: (k, rs) => containerByKey.has(k) ? _jsxs(_Fragment, { children: [k, " ", _jsxs("span", { className: "pill mixedp", children: ["Mixed \u00B7 ", rs.length, " pkg"] })] }) : k,
            open: k => { const id = containerByKey.get(k); if (id)
                c.open(id); } },
        { k: 'strain', l: 'Strain', key: p => p.strain ?? '' },
        { k: 'item', l: 'Item', key: p => itemName(c.item(p.item_id)) ? `${p.strain} · ${itemName(c.item(p.item_id))}` : `${p.strain ?? ''} · no item` },
        { k: 'lot', l: 'Harvest lot', key: p => c.lot(p.lot_id) ? `${c.lot(p.lot_id).code} · ${p.strain}` : 'No lot' },
        { k: 'grade', l: 'Grade', key: p => c.grade(p).grade },
    ];
    const chips = [
        { k: 'year', l: 'Crop year', get: p => String(yearOf(c, p) ?? '') },
        { k: 'form', l: 'Form', get: p => PRODUCT_LABEL[prodOf(p)] },
        { k: 'grade', l: 'Grade', get: p => c.grade(p).grade },
        { k: 'flag', l: 'Status', get: p => flags(p)[0]?.split(':')[0] ?? 'OK' },
    ];
    const actions = [{ label: 'Move', run: async (ids) => {
                const on = ids.filter(id => c.pallet(id)?.container_id);
                if (on.length) {
                    const codes = on.map(id => c.pallet(id).code);
                    flash(`${codes.join(', ')} ${codes.length === 1 ? 'is' : 'are'} on a mixed pallet. Open the package and use Take off, or move the mixed pallet itself.`, true);
                    return;
                }
                onMove(ids);
            } }];
    const cards = (rs) => {
        const w = (xs) => xs.reduce((a, p) => a + Number(p.current_weight ?? 0), 0);
        const needs = rs.filter(p => p.slot_id == null && !p.container_id && p.status === 'unslotted');
        const held = rs.filter(p => c.held(p.id)), flagged = rs.filter(p => p.needs_review);
        return _jsxs(_Fragment, { children: [_jsxs("div", { className: "icard", children: [_jsx("span", { children: "On hand" }), _jsx("b", { children: n0(w(rs)) }), _jsxs("small", { children: ["lbs \u00B7 ", n0(new Set(rs.map(p => p.container_id ?? p.id)).size), " pallets"] })] }), _jsxs("div", { className: "icard", children: [_jsx("span", { children: "Packages" }), _jsx("b", { children: n0(rs.length) }), _jsxs("small", { children: [rs.filter(p => c.grade(p).grade === 'BHO').length, " BHO"] })] }), _jsxs("div", { className: `icard ${needs.length ? 'warn' : ''}`, children: [_jsx("span", { children: "Needs a spot" }), _jsx("b", { children: n0(needs.length) }), _jsxs("small", { children: [n0(w(needs)), " lbs"] })] }), _jsxs("div", { className: "icard", children: [_jsx("span", { children: "Held for orders" }), _jsx("b", { children: n0(held.length) }), _jsxs("small", { children: [n0(w(held)), " lbs"] })] }), _jsxs("div", { className: `icard ${flagged.length ? 'bad' : ''}`, children: [_jsx("span", { children: "Flagged" }), _jsx("b", { children: n0(flagged.length) }), _jsx("small", { children: "need a look" })] })] });
    };
    return _jsx(InvTable, { id: "dist", title: "Inventory", rows: rows, rowId: p => p.id, cols: cols, groups: groups, defaultGroup: "freezer", defaultSort: "where", chips: chips, site: { opts: ['OHR', 'GVR', '1PN'], get: p => c.site(p) }, cards: cards, text: p => `${p.code} ${p.strain ?? ''} ${p.package_tag ?? ''} ${c.lot(p.lot_id)?.code ?? ''} ${c.where(p)}`, lbs: p => Number(p.current_weight ?? 0), onOpen: p => c.open(p.id), actions: actions, note: _jsx(_Fragment, { children: "Every package in inventory. Packages on a mixed pallet are listed one by one; group by Spot to see the mixed pallet. Sort by Days for the oldest product." }), totals: rs => _jsxs(_Fragment, { children: ["on ", _jsx("b", { children: new Set(rs.map(p => p.container_id ?? p.id)).size.toLocaleString() }), " pallets", rs.length === rows.length ? '' : ` (of ${physical.toLocaleString()})`, " \u00B7 ", rs.filter(p => c.grade(p).grade === 'BHO').length, " BHO"] }) });
}
export function SalesInventory({ c, strains, sb, onNewOrder }) {
    const [bal, setBal] = useState([]);
    const [prices, setPrices] = useState([]);
    useEffect(() => {
        if (!sb)
            return;
        sb.from('reserve_balances').select('*').then(r => setBal((r.data ?? [])), () => { });
        sb.from('strain_prices').select('crop_year,strain_id,grade,price_per_lb').then(r => setPrices((r.data ?? [])), () => { });
    }, [sb]);
    const canon = new Map();
    for (const s of strains)
        for (const n of [s.name, ...(s.aliases ?? [])])
            canon.set(n.toLowerCase().trim(), s);
    const strainOf = (n) => canon.get((n ?? '').toLowerCase().trim());
    const pk = c.pallets.filter(p => p.kind !== 'mixed' && live(p) && p.status !== 'in_transit');
    const m = new Map();
    let id = 0;
    for (const p of pk) {
        const st = strainOf(p.strain), name = st?.name ?? p.strain ?? '?';
        const g = c.grade(p).grade, y = yearOf(c, p), f = prodOf(p);
        const k = `${name}|${f}|${g}|${y}`;
        const r = m.get(k) ?? m.set(k, { id: ++id, strain: name, form: f, grade: g, year: y, packages: [], onHand: 0, held: 0, reserved: 0, available: 0, price: null }).get(k);
        r.packages.push(p);
        const w = Number(p.current_weight ?? 0);
        r.onHand += w;
        if (c.held(p.id))
            r.held += w;
    }
    // reserves left (fresh frozen) go on the strain's row for its default grade
    for (const b of bal) {
        const st = strainOf(b.strain), name = st?.name ?? b.strain, g = st?.default_grade ?? 'SHO';
        const r = [...m.values()].find(x => x.strain === name && x.form === 'fresh_frozen' && x.grade === g && (b.crop_year == null || x.year === b.crop_year));
        if (r)
            r.reserved += Math.max(0, Number(b.remaining ?? 0));
    }
    for (const r of m.values()) {
        r.available = r.onHand - r.held - r.reserved;
        const st = strainOf(r.strain);
        r.price = prices.find(x => st && x.strain_id === st.id && x.grade === r.grade && x.crop_year === r.year)?.price_per_lb ?? null;
    }
    const rows = [...m.values()];
    const cols = [
        { k: 'strain', l: 'Strain', phone: true, get: r => _jsx("b", { children: _jsx(StrainLink, { name: r.strain }) }), val: r => r.strain },
        { k: 'form', l: 'Form', phone: true, get: r => PRODUCT_LABEL[r.form], val: r => PRODUCT_LABEL[r.form] },
        { k: 'grade', l: 'Grade', phone: true, get: r => _jsx(GradeChip, { g: r.grade }), val: r => r.grade },
        { k: 'year', l: 'Crop', get: r => r.year ?? '', val: r => r.year ?? 0 },
        { k: 'onhand', l: 'On hand', num: true, get: r => n0(r.onHand), val: r => r.onHand },
        { k: 'held', l: 'Held for orders', num: true, get: r => n0(r.held), val: r => r.held },
        { k: 'reserved', l: 'Reserved', num: true, get: r => n0(r.reserved), val: r => r.reserved },
        { k: 'avail', l: 'Available', num: true, phone: true, get: r => r.available < 0 ? _jsxs("b", { className: "bad-t", children: ["Short ", n0(-r.available)] }) : _jsx("b", { children: n0(r.available) }), val: r => r.available },
        { k: 'pallets', l: 'Pallets', num: true, get: r => r.packages.length, val: r => r.packages.length },
        { k: 'price', l: 'List $/lb', num: true, get: r => r.price != null ? `$${r.price.toFixed(2)}` : '', val: r => r.price ?? '' },
    ];
    const groups = [
        { k: 'form', l: 'Form', key: r => PRODUCT_LABEL[r.form], order: k => Object.values(PRODUCT_LABEL).indexOf(k) },
        { k: 'year', l: 'Crop year', key: r => String(r.year ?? ''), order: k => -Number(k || 0) },
        { k: 'grade', l: 'Grade', key: r => r.grade },
    ];
    const chips = [
        { k: 'year', l: 'Crop year', get: r => String(r.year ?? '') },
        { k: 'form', l: 'Form', get: r => PRODUCT_LABEL[r.form] },
        { k: 'grade', l: 'Grade', get: r => r.grade },
        { k: 'short', l: 'Show', get: r => r.available < 0 ? 'Short' : r.available > 0 ? 'Available' : 'None left' },
    ];
    const expand = (r) => {
        const byLot = new Map();
        for (const p of r.packages) {
            const k = c.lot(p.lot_id)?.code ?? 'No lot';
            (byLot.get(k) ?? byLot.set(k, []).get(k)).push(p);
        }
        return _jsx("div", { className: "drill", children: [...byLot.entries()].sort().map(([k, ps]) => _jsxs("div", { className: "drill-lot", children: [_jsxs("div", { className: "row between", children: [_jsxs("span", { children: [_jsx("span", { className: "mono", children: k }), (() => { const l = c.lot(ps[0].lot_id); return l?.site ? _jsxs("span", { className: "muted", children: [" \u00B7 ", l.site] }) : null; })()] }), _jsxs("span", { className: "muted", children: [ps.length, " \u00B7 ", n0(ps.reduce((a, p) => a + Number(p.current_weight ?? 0), 0)), " lbs"] })] }), _jsx("div", { className: "drill-p", children: ps.map(p => _jsxs("a", { onClick: () => c.open(p.id), className: "chip", children: [p.code, " ", n0(p.current_weight), c.held(p.id) ? ' · held' : '', p.grade ? ` · ${p.grade}` : ''] }, p.id)) })] }, k)) });
    };
    return _jsx(InvTable, { id: "sales", title: "Inventory", rows: rows, rowId: r => r.id, cols: cols, groups: groups, defaultGroup: "form", defaultSort: "strain", chips: chips, noun: "product", text: r => `${r.strain} ${PRODUCT_LABEL[r.form]} ${r.grade} ${r.year ?? ''} ${r.packages.map(p => `${p.code} ${c.lot(p.lot_id)?.code ?? ''}`).join(' ')}`, lbs: r => r.onHand, expand: expand, toolbar: onNewOrder ? _jsx("button", { className: "primary small", onClick: onNewOrder, children: "New order" }) : undefined, rowClass: r => r.available < 0 ? 'shortrow' : '', note: _jsx(_Fragment, { children: "What you can sell, by strain, form and grade. Available = on hand \u2212 held for orders \u2212 reserves left. Tap a row to see its harvest lots and pallets." }), totals: rs => _jsxs(_Fragment, { children: ["available ", _jsx("b", { children: n0(rs.reduce((a, r) => a + Math.max(0, r.available), 0)) }), " lbs", rs.some(r => r.available < 0) ? _jsxs(_Fragment, { children: [" \u00B7 ", _jsxs("b", { className: "bad-t", children: [rs.filter(r => r.available < 0).length, " short"] })] }) : null] }) });
}
