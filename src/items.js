import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { MTag } from './mtag';
import { useEffect, useMemo, useState } from 'react';
import { rpc } from './ship';
import { StrainLink } from './strainCard';
const SQL = '171_item_cards';
const usd = (x) => `$${Number(x).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** the menu price: the card's own, else the market price for that product + crop year (175) */
const priceText = (r) => r.price_per_lb != null ? `${usd(r.price_per_lb)}${r.price_bho != null ? ` · BHO ${usd(r.price_bho)}` : ''}` : r.market != null ? `${usd(r.market)} market` : '';
const n0 = (x) => Number(x ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const licLabel = (l) => `${l.site ?? l.license}${l.kind === 'processor' ? ' proc' : l.kind === 'nursery' ? ' nursery' : ''}`;
export const STRAIN_TYPES = ['Indica', 'Indica Hybrid', 'Hybrid', 'Sativa Hybrid', 'Sativa'];
export function loadItemCards(sb) { return rpc(sb, 'item_cards', {}, SQL); }
/** Sales › Items: every item card, with filters */
export function ItemsView({ sb, flash, canEdit, canPrice = false }) {
    const [rows, setRows] = useState(null);
    const [q, setQ] = useState('');
    const [prod, setProd] = useState('');
    const [year, setYear] = useState('');
    const [farm, setFarm] = useState('');
    const [lic, setLic] = useState('');
    const [show, setShow] = useState('stock');
    const [open, setOpen] = useState(null);
    const load = async () => { try {
        setRows(await loadItemCards(sb));
    }
    catch (e) {
        flash(e.message, true);
        setRows([]);
    } };
    useEffect(() => { load(); }, []);
    const all = rows ?? [];
    const prods = useMemo(() => [...new Map(all.map(r => [r.finish, r.product ?? r.finish])).entries()], [rows]);
    const years = useMemo(() => [...new Set(all.map(r => r.crop_year))].sort((a, b) => b - a), [rows]);
    const lics = useMemo(() => [...new Map(all.flatMap(r => r.licenses).map(l => [l.license, licLabel(l)])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [rows]);
    const flagged = (r) => r.licenses.length === 0 || r.pkgs_other_item > 0;
    const ql = q.trim().toLowerCase();
    const list = all.filter(r => (!ql || r.strain.toLowerCase().includes(ql) || r.sku.toLowerCase().includes(ql) || r.metrc_name.toLowerCase().includes(ql))
        && (!prod || r.finish === prod) && (!year || String(r.crop_year) === year) && (!farm || r.site === farm)
        && (!lic || r.licenses.some(l => l.license === lic))
        && (show === 'all' || (show === 'stock' && r.packages > 0) || (show === 'on' && r.on_menu) || (show === 'off' && !r.on_menu) || (show === 'flag' && flagged(r))));
    const nFlag = all.filter(flagged).length;
    async function toggleMenu(r) {
        try {
            await rpc(sb, 'set_item_card', { p_item: r.id, p_on_menu: !r.on_menu }, SQL);
            setRows(rs => (rs ?? []).map(x => x.id === r.id ? { ...x, on_menu: !r.on_menu } : x));
        }
        catch (e) {
            flash(e.message, true);
        }
    }
    const chip = (k, l) => _jsx("button", { className: show === k ? 'primary small' : 'ghost small', onClick: () => setShow(k), children: l }, k);
    return _jsxs("div", { className: "list inv", children: [_jsxs("div", { className: "row between wrap toolbar", children: [_jsx("h2", { children: "Items" }), _jsx("div", { className: "row", children: _jsx("button", { className: "ghost small", onClick: load, children: "Refresh" }) })] }), _jsx("p", { className: "muted", children: "Every item card. One card is one METRC item, and it shows on every license where METRC has it. New cards are made from a strain card (tap a strain name \u203A Items) and go to METRC on their own." }), _jsxs("div", { className: "row wrap toolbar", style: { gap: 6 }, children: [_jsx("input", { type: "search", placeholder: "Search strain or SKU", value: q, onChange: e => setQ(e.target.value), style: { minWidth: 200 } }), _jsxs("select", { value: prod, onChange: e => setProd(e.target.value), children: [_jsx("option", { value: "", children: "All products" }), prods.map(([k, l]) => _jsx("option", { value: k, children: l }, k))] }), _jsxs("select", { value: year, onChange: e => setYear(e.target.value), children: [_jsx("option", { value: "", children: "All crop years" }), years.map(y => _jsx("option", { children: y }, y))] }), _jsxs("select", { value: farm, onChange: e => setFarm(e.target.value), children: [_jsx("option", { value: "", children: "Both farms" }), _jsx("option", { value: "OHR", children: "OHR" }), _jsx("option", { value: "GVR", children: "GVR" })] }), _jsxs("select", { value: lic, onChange: e => setLic(e.target.value), children: [_jsx("option", { value: "", children: "All licenses" }), lics.map(([k, l]) => _jsxs("option", { value: k, children: [l, " \u00B7 ", k] }, k))] })] }), _jsxs("div", { className: "row wrap toolbar", style: { gap: 6 }, children: [chip('stock', 'Has stock'), chip('all', 'All'), chip('on', 'On the menu'), chip('off', 'Off the menu'), chip('flag', `Flags${nFlag ? ` (${nFlag})` : ''}`), _jsxs("span", { className: "muted small", children: [list.length.toLocaleString(), " of ", all.length.toLocaleString(), " cards"] })] }), rows === null && _jsx("p", { className: "muted", children: "Loading\u2026" }), rows && !list.length && _jsx("p", { className: "muted", children: "No item cards match." }), list.length > 0 && _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "ct", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Strain" }), _jsx("th", { children: "Product" }), _jsx("th", { children: "Crop" }), _jsx("th", { children: "Farm" }), _jsx("th", { children: "In METRC on" }), _jsx("th", { className: "num", children: "Packages" }), _jsx("th", { className: "num", children: "Lbs" }), _jsx("th", { className: "num", children: "Price /lb" }), _jsx("th", { children: "On menu" }), _jsx("th", {})] }) }), _jsx("tbody", { children: list.map(r => _jsxs("tr", { className: "tap", onClick: () => setOpen(r), children: [_jsxs("td", { children: [_jsx(StrainLink, { name: r.strain }), r.strain_type && _jsx("div", { className: "muted small", children: r.strain_type })] }), _jsx("td", { children: r.product ?? r.finish }), _jsx("td", { children: r.crop_year }), _jsx("td", { children: r.site }), _jsx("td", { className: "small", children: r.licenses.length ? r.licenses.map(l => _jsx("span", { className: "pill", title: l.license, style: { marginRight: 4 }, children: licLabel(l) }, l.license)) : _jsx("span", { className: "pill m-warn", children: "not in METRC" }) }), _jsx("td", { className: "num", children: r.packages ? n0(r.packages) : '' }), _jsx("td", { className: "num", children: r.lbs ? n0(r.lbs) : '' }), _jsx("td", { className: "num small", children: r.price_per_lb != null ? priceText(r) : _jsx("span", { className: "muted", children: priceText(r) || 'call' }) }), _jsx("td", { onClick: e => e.stopPropagation(), children: canEdit
                                            ? _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: r.on_menu, onChange: () => toggleMenu(r) }), " ", r.on_menu ? 'On' : 'Off'] })
                                            : r.on_menu ? 'On' : 'Off' }), _jsx("td", { className: "small", children: r.pkgs_other_item > 0 && _jsxs("span", { className: "pill m-warn", title: "METRC has some of these packages on a different item", children: [r.pkgs_other_item, " on another METRC item"] }) })] }, r.id)) })] }) }), open && _jsx(ItemCardSheet, { sb: sb, card: open, canEdit: canEdit, canPrice: canPrice, flash: flash, onClose: () => setOpen(null), onChanged: c => { setRows(rs => (rs ?? []).map(x => x.id === c.id ? c : x.strain_id === c.strain_id && x.finish === c.finish && x.crop_year === c.crop_year ? { ...x, price_per_lb: c.price_per_lb, price_bho: c.price_bho } : x)); setOpen(c); } })] });
}
/** one item card */
export function ItemCardSheet({ sb, card, canEdit, canPrice = false, flash, onClose, onChanged }) {
    const [pkgs, setPkgs] = useState(null);
    const [busy, setBusy] = useState(false);
    const [pe, setPe] = useState(null);
    async function savePrice(clear) {
        const p = clear ? null : pe?.p.trim() ? Number(pe.p) : null, b = clear || card.finish !== 'FF' ? null : pe?.b.trim() ? Number(pe.b) : null;
        if (!clear && (p == null || !(p >= 0) || (b != null && !(b >= 0)))) {
            flash('Enter a price in $/lb', true);
            return;
        }
        setBusy(true);
        try {
            await rpc(sb, 'set_item_price', { p_item: card.id, p_price: p, p_bho: b }, '176_pricing');
            onChanged({ ...card, price_per_lb: p, price_bho: b });
            setPe(null);
            flash(clear ? 'Price cleared: it uses the market price' : 'Price saved');
        }
        catch (e) {
            flash(e.message, true);
        }
        finally {
            setBusy(false);
        }
    }
    useEffect(() => { rpc(sb, 'item_card_packages', { p_item: card.id }, SQL).then(setPkgs, e => { flash(e.message, true); setPkgs([]); }); }, [card.id]);
    async function set(on_menu, active) {
        setBusy(true);
        try {
            await rpc(sb, 'set_item_card', { p_item: card.id, p_on_menu: on_menu, p_active: active }, SQL);
            onChanged({ ...card, on_menu: on_menu ?? card.on_menu, active: active ?? card.active });
            flash('Saved');
        }
        catch (e) {
            flash(e.message, true);
        }
        finally {
            setBusy(false);
        }
    }
    return _jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: "sheet form", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsxs("h2", { children: [_jsx(StrainLink, { name: card.strain }), " \u00B7 ", card.product ?? card.finish, " \u00B7 ", card.crop_year, " \u00B7 ", card.site] }), _jsx("button", { className: "ghost", onClick: onClose, children: "\u2715" })] }), _jsx("p", { className: "mono small", style: { margin: 0 }, children: card.sku }), _jsxs("p", { className: "muted small", style: { marginTop: 2 }, children: ["METRC item name: ", _jsx("span", { className: "mono", children: card.metrc_name }), card.strain_type ? ` · ${card.strain_type}` : ''] }), _jsx("div", { className: "field", children: _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", disabled: !canEdit || busy, checked: card.on_menu, onChange: e => set(e.target.checked, null) }), _jsxs("span", { children: [_jsx("b", { children: "On the menu" }), " ", _jsx("span", { className: "muted", children: "off = it doesn't show on the open menu or the portal. Packages stay in inventory." })] })] }) }), _jsx("div", { className: "field", children: _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", disabled: !canEdit || busy, checked: card.active, onChange: e => set(null, e.target.checked) }), _jsxs("span", { children: [_jsx("b", { children: "Active" }), " ", _jsx("span", { className: "muted", children: "off = kept for history, not picked for new packages" })] })] }) }), _jsx("h3", { children: "Price" }), pe ? _jsxs("div", { className: "row wrap", style: { gap: 6 }, children: [_jsxs("label", { className: "small", children: [card.finish === 'FF' ? 'SHO ' : '', "$/lb ", _jsx("input", { type: "number", min: "0", step: "0.01", inputMode: "decimal", style: { width: 110 }, value: pe.p, autoFocus: true, onChange: e => setPe({ ...pe, p: e.target.value }) })] }), card.finish === 'FF' && _jsxs("label", { className: "small", children: ["BHO $/lb ", _jsx("input", { type: "number", min: "0", step: "0.01", inputMode: "decimal", style: { width: 110 }, placeholder: "same", value: pe.b, onChange: e => setPe({ ...pe, b: e.target.value }) })] }), _jsx("button", { className: "primary small", disabled: busy, onClick: () => savePrice(false), children: "Save" }), _jsx("button", { className: "ghost small", disabled: busy, onClick: () => setPe(null), children: "Cancel" })] })
                    : _jsxs("div", { className: "row wrap", style: { gap: 6 }, children: [_jsx("span", { children: card.price_per_lb != null ? _jsxs("b", { children: [priceText(card), "/lb"] }) : card.market != null ? _jsxs(_Fragment, { children: ["Market price ", _jsxs("b", { children: [usd(card.market), "/lb"] }), " ", _jsxs("span", { className: "muted small", children: ["(", card.crop_year, " ", card.product ?? card.finish, ")"] })] }) : _jsx("span", { className: "muted", children: "No price: Call/Email for Price" }) }), canPrice && _jsx("button", { className: "ghost small", disabled: busy, onClick: () => setPe({ p: card.price_per_lb != null ? String(card.price_per_lb) : '', b: card.price_bho != null ? String(card.price_bho) : '' }), children: card.price_per_lb != null ? 'Change' : 'Set a price for this strain' }), canPrice && card.price_per_lb != null && _jsx("button", { className: "ghost small", disabled: busy, onClick: () => savePrice(true), children: "Use market price" })] }), _jsxs("p", { className: "muted small", style: { marginTop: 2 }, children: ["One price for ", card.strain, " ", card.product ?? card.finish, " ", card.crop_year, " on both farms' cards. Outside customers pay it unless they have a contract price; special prices are still changed on the sales order.", !canPrice && ' Sales Admins change prices in Items.'] }), _jsx("h3", { children: "In METRC" }), card.licenses.length === 0 ? _jsx("p", { className: "warn-t", children: "METRC doesn't have this item on any license yet. A \"Create item in METRC\" to-do sends it (Compliance \u203A METRC \u203A To do)." })
                    : _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "ct", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "License" }), _jsx("th", { children: "METRC item ID" })] }) }), _jsx("tbody", { children: card.licenses.map(l => _jsxs("tr", { children: [_jsxs("td", { children: [licLabel(l), " ", _jsx("span", { className: "mono small", children: l.license }), l.license === card.license && _jsx("span", { className: "muted small", children: " (home)" })] }), _jsx("td", { className: "mono", children: l.metrc_id })] }, l.license)) })] }) }), _jsx("h3", { children: "Packages on this item" }), pkgs === null ? _jsx("p", { className: "muted", children: "Loading\u2026" }) : !pkgs.length ? _jsx("p", { className: "muted", children: "None in inventory." })
                    : _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "ct", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Package" }), _jsx("th", { children: "Tag" }), _jsx("th", { className: "num", children: "Lbs" }), _jsx("th", { children: "METRC has it on" })] }) }), _jsx("tbody", { children: pkgs.map(p => {
                                        const other = p.metrc_item && p.metrc_item.toLowerCase() !== card.metrc_name.toLowerCase();
                                        return _jsxs("tr", { children: [_jsx("td", { children: p.code }), _jsx("td", { className: "small", children: _jsx(MTag, { t: p.tag }) }), _jsx("td", { className: "num", children: n0(p.lbs) }), _jsx("td", { className: "small", children: p.metrc_item ? _jsxs("span", { className: other ? 'warn-t' : 'muted', children: [other ? p.metrc_item : 'this item', p.metrc_license ? ` · ${p.metrc_license}` : ''] }) : _jsx("span", { className: "muted", children: "not active in METRC" }) })] }, p.pallet_id);
                                    }) })] }) }), _jsx("p", { className: "muted small", children: "To move a package to another item: open the package \u203A New package \u203A All of it \u203A pick the item (a repackage, same as METRC)." })] }) });
}
/** strain card › Items: this strain's cards, a type picker and + New item */
export function StrainItems({ sb, strainId, strainType, flash, canEdit, onChanged }) {
    const canPrice = false; // prices are changed in Items (Sales Admins)
    const [rows, setRows] = useState(null);
    const [type, setType] = useState(strainType ?? '');
    const [adding, setAdding] = useState(false);
    const [f, setF] = useState({ year: String(new Date().getFullYear()), site: 'OHR', finish: 'FF' });
    const [open, setOpen] = useState(null);
    const [busy, setBusy] = useState(false);
    const load = async () => { try {
        setRows((await loadItemCards(sb)).filter(r => r.strain_id === strainId));
    }
    catch (e) {
        flash(e.message, true);
        setRows([]);
    } };
    useEffect(() => { load(); }, [strainId]);
    async function saveType(v) {
        setType(v);
        try {
            await rpc(sb, 'set_strain_type', { p_strain: strainId, p_type: v || null }, SQL);
            flash(v ? `Type: ${v}` : 'Type cleared');
            onChanged?.();
        }
        catch (e) {
            flash(e.message, true);
        }
    }
    async function add() {
        setBusy(true);
        try {
            await rpc(sb, 'new_item_card', { p_strain: strainId, p_year: Number(f.year), p_site: f.site, p_finish: f.finish }, SQL);
            flash('Item card made. It goes to METRC on its own (Compliance › METRC › To do).');
            setAdding(false);
            await load();
        }
        catch (e) {
            flash(e.message, true);
        }
        finally {
            setBusy(false);
        }
    }
    const finishes = [['FF', 'Fresh Frozen'], ['DH', 'Dry Harvest (wet)'], ['UF', 'Unbucked Dry Flower'], ['BF', 'Bucked Dry Flower'], ['ST', 'Standards'], ['SM', 'Smalls'], ['TR', 'Trim (dry flower)'], ['BT', 'Trim (bucking)']];
    return _jsxs("section", { style: { marginTop: 12 }, children: [_jsx("h3", { children: "Type and items" }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Type" }), _jsxs("select", { value: type, disabled: !canEdit, onChange: e => saveType(e.target.value), children: [_jsx("option", { value: "", children: "Not set" }), STRAIN_TYPES.map(t => _jsx("option", { children: t }, t))] }), _jsx("span", { className: "muted small", children: " sets the indica / sativa % and sends the change to METRC (Compliance \u203A METRC \u203A To do)" })] }), rows === null ? _jsx("p", { className: "muted", children: "Loading\u2026" }) : !rows.length ? _jsx("p", { className: "muted", children: "No item cards yet." })
                : _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "ct", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Product" }), _jsx("th", { children: "Crop" }), _jsx("th", { children: "Farm" }), _jsx("th", { children: "In METRC on" }), _jsx("th", { className: "num", children: "Lbs" }), _jsx("th", { children: "Menu" })] }) }), _jsx("tbody", { children: rows.map(r => _jsxs("tr", { className: "tap", onClick: () => setOpen(r), children: [_jsx("td", { children: r.product ?? r.finish }), _jsx("td", { children: r.crop_year }), _jsx("td", { children: r.site }), _jsx("td", { className: "small", children: r.licenses.length ? r.licenses.map(l => licLabel(l)).join(', ') : _jsx("span", { className: "warn-t", children: "not yet" }) }), _jsx("td", { className: "num", children: r.lbs ? n0(r.lbs) : '' }), _jsx("td", { children: r.on_menu ? 'On' : 'Off' })] }, r.id)) })] }) }), canEdit && !adding && _jsx("button", { className: "ghost small", onClick: () => setAdding(true), children: "+ New item" }), adding && _jsxs("div", { className: "row wrap", style: { gap: 6, marginTop: 6 }, children: [_jsx("select", { value: f.finish, onChange: e => setF({ ...f, finish: e.target.value }), children: finishes.map(([k, l]) => _jsx("option", { value: k, children: l }, k)) }), _jsxs("select", { value: f.site, onChange: e => setF({ ...f, site: e.target.value }), children: [_jsx("option", { children: "OHR" }), _jsx("option", { children: "GVR" })] }), _jsx("input", { type: "number", value: f.year, onChange: e => setF({ ...f, year: e.target.value }), style: { width: 90 }, "aria-label": "Crop year" }), _jsx("button", { className: "primary small", disabled: busy, onClick: add, children: busy ? '…' : 'Make it' }), _jsx("button", { className: "ghost small", onClick: () => setAdding(false), children: "Cancel" })] }), open && _jsx(ItemCardSheet, { sb: sb, card: open, canEdit: canEdit, canPrice: canPrice, flash: flash, onClose: () => setOpen(null), onChanged: c => { setRows(rs => (rs ?? []).map(x => x.id === c.id ? c : x.strain_id === c.strain_id && x.finish === c.finish && x.crop_year === c.crop_year ? { ...x, price_per_lb: c.price_per_lb, price_bho: c.price_bho } : x)); setOpen(c); } })] });
}
