import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { Select } from './combo';
/** call a database function; a missing function means the SQL file hasn't been run yet */
export async function rpc(sb, fn, args = {}, sql = '089_depart_invoice') {
    if (!sb)
        throw new Error('Not in the demo');
    const { data, error } = await sb.rpc(fn, args);
    if (error) {
        if (/Could not find the function|does not exist|schema cache/i.test(error.message))
            throw new Error(`Run ${sql}.sql in Supabase first`);
        throw new Error(error.message);
    }
    return data;
}
export const money = (n) => n == null ? '' : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const RULE_LABEL = { calc: 'Calculated', free: 'Free (contract)', split: 'Split', pickup: 'They pick up' };
export const CLASS_LABEL = { van: 'Reefer van', box: 'Reefer box truck', carrier: 'Outside carrier', pickup: 'Customer pickup' };
const FACILITY = '1363 Green Valley Rd, Watsonville, CA 95076';
const mapUrl = (a) => `https://maps.google.com/maps?q=${encodeURIComponent(a)}`;
const dirUrl = (a) => `https://maps.google.com/maps/dir/${encodeURIComponent(FACILITY)}/${encodeURIComponent(a)}`;
// ---------- a stop's shipping line (load screen) ----------
export function ShipLine({ sh, canEdit, onSet }) {
    const [edit, setEdit] = useState(false);
    const [amt, setAmt] = useState('');
    const [why, setWhy] = useState('');
    if (!sh || !sh.billed)
        return null;
    const charge = sh.charge;
    return _jsxs("div", { className: "small-note shipline", children: [_jsxs("div", { className: "row between wrap", children: [_jsxs("span", { children: [sh.rule === 'pickup' ? _jsx("b", { children: "Customer pickup: no shipping" })
                                : sh.problem ? _jsx("span", { className: "warn-t", children: sh.problem })
                                    : _jsxs(_Fragment, { children: [_jsxs("b", { children: ["Shipping ", sh.rule === 'free' ? 'FREE (contract)' : money(charge)] }), " ", _jsxs("span", { className: "muted", children: ["\u00B7 ", sh.descr] })] }), sh.override != null && _jsxs("span", { className: "muted", children: [" \u00B7 typed by Sales", sh.reason ? ` (${sh.reason})` : ''] }), sh.override == null && sh.quoted != null && _jsx("span", { className: "muted", children: " \u00B7 as quoted on the order" })] }), canEdit && !edit && sh.rule !== 'pickup' && _jsx("button", { className: "linkbtn", onClick: () => { setAmt(sh.override != null ? String(sh.override) : ''); setWhy(sh.reason ?? ''); setEdit(true); }, children: "Change" })] }), edit && _jsxs("div", { className: "row wrap", style: { marginTop: 6 }, children: [_jsx("input", { type: "number", step: "0.01", min: "0", placeholder: charge != null ? String(charge) : 'Amount', value: amt, onChange: e => setAmt(e.target.value), style: { width: 110 } }), _jsx("input", { placeholder: "Why (shows on the invoice)", value: why, onChange: e => setWhy(e.target.value), className: "grow" }), _jsx("button", { className: "primary small", disabled: amt === '' || !why.trim(), onClick: async () => { await onSet(Number(amt), why); setEdit(false); }, children: "Save" }), sh.override != null && _jsx("button", { className: "ghost small", onClick: async () => { await onSet(null, ''); setEdit(false); }, children: "Use calculated" }), _jsx("button", { className: "ghost small", onClick: () => setEdit(false), children: "Cancel" })] })] });
}
// ---------- pickup: the customer's driver and truck ----------
export function PickupPanel({ load, canEdit, onSave, sb, carrierId }) {
    const [v, setV] = useState({ driver: load.pickup_driver ?? '', dl: load.pickup_dl ?? '', make: load.pickup_make ?? '', model: load.pickup_model ?? '', plate: load.pickup_plate ?? '', license: load.pickup_license ?? '' });
    useEffect(() => { setV({ driver: load.pickup_driver ?? '', dl: load.pickup_dl ?? '', make: load.pickup_make ?? '', model: load.pickup_model ?? '', plate: load.pickup_plate ?? '', license: load.pickup_license ?? '' }); }, [load.id, load.pickup_driver, load.pickup_dl, load.pickup_make, load.pickup_model, load.pickup_plate, load.pickup_license]);
    const dirty = v.driver !== (load.pickup_driver ?? '') || v.dl !== (load.pickup_dl ?? '') || v.make !== (load.pickup_make ?? '') || v.model !== (load.pickup_model ?? '')
        || v.plate !== (load.pickup_plate ?? '') || v.license !== (load.pickup_license ?? '');
    // fill in from Vehicles › Carriers (212); the customer's pickup carrier is picked to start
    const [ks, setKs] = useState([]);
    const [kid, setKid] = useState(carrierId ?? null);
    useEffect(() => { sb?.rpc('pickup_carriers').then(({ data }) => setKs((data ?? [])), () => { }); }, [sb]);
    useEffect(() => { setKid(carrierId ?? null); }, [carrierId]);
    const k = ks.find(x => x.id === kid) ?? null;
    const pickCarrier = (id) => { setKid(id); const c = ks.find(x => x.id === id); if (c?.license_no)
        setV(x => ({ ...x, license: c.license_no ?? '' })); };
    const f = (k, l, ph = '') => _jsxs("div", { className: "field", children: [_jsx("label", { children: l }), _jsx("input", { value: v[k], disabled: !canEdit, placeholder: ph, onChange: e => setV(x => ({ ...x, [k]: e.target.value })) })] });
    return _jsxs("section", { className: "dcard pickup", children: [_jsx("b", { children: "Their driver and truck" }), " ", _jsx("span", { className: "muted", children: "(goes on the METRC manifest; they're the transporter)" }), canEdit && ks.length > 0 && _jsxs("div", { className: "grid3", children: [_jsxs("div", { className: "field", children: [_jsx("label", { children: "Carrier" }), _jsxs(Select, { value: kid == null ? '' : String(kid), onChange: e => pickCarrier(e.target.value ? Number(e.target.value) : null), children: [_jsx("option", { value: "", children: "Type it in" }), ks.map(x => _jsx("option", { value: x.id, children: x.name }, x.id))] })] }), k && _jsxs("div", { className: "field", children: [_jsx("label", { children: "Driver" }), _jsxs(Select, { value: "", onChange: e => { const d = k.drivers[Number(e.target.value)]; if (d)
                                    setV(x => ({ ...x, driver: d.name, dl: d.license_no ?? '' })); }, children: [_jsx("option", { value: "", children: k.drivers.length ? 'Pick a driver' : 'No drivers saved' }), k.drivers.map((d, i) => _jsx("option", { value: i, children: d.name }, i))] })] }), k && _jsxs("div", { className: "field", children: [_jsx("label", { children: "Truck" }), _jsxs(Select, { value: "", onChange: e => { const t = k.trucks[Number(e.target.value)]; if (t)
                                    setV(x => ({ ...x, make: t.make ?? '', model: t.model ?? '', plate: t.plate ?? '' })); }, children: [_jsx("option", { value: "", children: k.trucks.length ? 'Pick a truck' : 'No trucks saved' }), k.trucks.map((t, i) => _jsx("option", { value: i, children: [t.name, t.plate].filter(Boolean).join(' · ') }, i))] })] })] }), _jsxs("div", { className: "grid2", children: [f('driver', 'Driver name'), f('dl', "Driver's license #")] }), _jsxs("div", { className: "grid3", children: [f('make', 'Make', 'Ford'), f('model', 'Model', 'Transit'), f('plate', 'Plate')] }), f('license', 'Their transport license #', 'Distributor or Type 13'), canEdit && dirty && _jsx("div", { className: "row end", children: _jsx("button", { className: "primary small", onClick: () => onSave(v), children: "Save driver" }) })] });
}
export function PickupForm({ customers, onClose, onCreate }) {
    const [cust, setCust] = useState(null);
    const [date, setDate] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }));
    const [notes, setNotes] = useState('');
    return _jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: "sheet form", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsx("h2", { children: "New customer pickup" }), _jsx("button", { className: "ghost", onClick: onClose, children: "\u2715" })] }), _jsx("p", { className: "muted", children: "The customer comes with their own driver and truck. Put their orders on it like a load; \"Picked up\" makes the METRC manifest (they're the transporter) and the invoice, with no shipping." }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Customer" }), _jsxs(Select, { value: cust ?? '', onChange: e => setCust(e.target.value ? Number(e.target.value) : null), children: [_jsx("option", { value: "", children: "Pick a customer\u2026" }), customers.filter(c => c.active && c.kind === 'external').sort((a, b) => a.name.localeCompare(b.name)).map(c => _jsx("option", { value: c.id, children: c.name }, c.id))] })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Pickup date" }), _jsx("input", { type: "date", value: date, onChange: e => setDate(e.target.value) })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Notes (optional)" }), _jsx("input", { value: notes, onChange: e => setNotes(e.target.value) })] }), _jsxs("div", { className: "row end", children: [_jsx("button", { className: "ghost", onClick: onClose, children: "Cancel" }), _jsx("button", { className: "primary", disabled: cust == null, onClick: () => onCreate(cust, date, notes), children: "Create pickup" })] })] }) });
}
// ---------- Sales > Shipping: quick quote ----------
export function ShippingQuote({ sb, customers, flash }) {
    const [picked, setPicked] = useState([]);
    const [cls, setCls] = useState('box');
    const [cost, setCost] = useState('');
    const [rows, setRows] = useState(null);
    const ext = useMemo(() => customers.filter(c => c.active && c.kind === 'external').sort((a, b) => a.name.localeCompare(b.name)), [customers]);
    useEffect(() => {
        if (!picked.length) {
            setRows(null);
            return;
        }
        rpc(sb, 'ship_quote', { p_customers: picked, p_class: cls, p_carrier_cost: cls === 'carrier' && cost !== '' ? Number(cost) : null })
            .then(setRows).catch(e => flash(e.message, true));
    }, [picked.join(','), cls, cost]);
    const move = (i, d) => setPicked(p => { const n = [...p]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); return n; });
    const total = (rows ?? []).reduce((a, r) => a + Number(r.charge ?? 0), 0);
    return _jsxs("div", { className: "list ship", children: [_jsx("h2", { children: "Shipping quote" }), _jsx("p", { className: "muted", children: "Pick the customers on the run in delivery order. Same math as the load screen: the zones' round-trip prices split across the stops, plus the multi-stop fee; contract customers ride free, split customers pay their share." }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Vehicle" }), _jsx("div", { className: "choices", children: ['box', 'van', 'carrier'].map(k => _jsx("button", { className: cls === k ? 'on' : '', onClick: () => setCls(k), children: CLASS_LABEL[k] }, k)) })] }), cls === 'carrier' && _jsxs("div", { className: "field", children: [_jsx("label", { children: "Carrier's cost for the run ($)" }), _jsx("input", { type: "number", step: "0.01", min: "0", value: cost, onChange: e => setCost(e.target.value) })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Stops" }), picked.map((id, i) => {
                        const r = rows?.find(x => x.customer_id === id), c = ext.find(x => x.id === id);
                        return _jsxs("div", { className: "stoprow", children: [_jsx("span", { className: "stopnum", children: i + 1 }), _jsxs("div", { className: "grow", children: [_jsx("b", { children: c?.name }), " ", _jsxs("span", { className: "muted", children: ["\u00B7 ", r?.zone ?? 'no zone', " \u00B7 ", RULE_LABEL[r?.rule ?? 'calc']] }), _jsx("div", { children: r?.problem ? _jsx("span", { className: "warn-t", children: r.problem }) : r ? _jsxs(_Fragment, { children: [_jsx("b", { children: r.rule === 'free' ? 'FREE' : money(r.charge) }), " ", _jsx("span", { className: "muted", children: r.descr })] }) : null }), r?.address && _jsxs("div", { className: "small", children: [_jsx("a", { href: mapUrl(r.address), target: "_blank", rel: "noreferrer", children: "Map" }), " \u00B7 ", _jsx("a", { href: dirUrl(r.address), target: "_blank", rel: "noreferrer", children: "Directions" })] })] }), _jsxs("div", { className: "stopbtns", children: [_jsx("button", { className: "ghost small", disabled: i === 0, onClick: () => move(i, -1), children: "\u2191" }), _jsx("button", { className: "ghost small", disabled: i === picked.length - 1, onClick: () => move(i, 1), children: "\u2193" }), _jsx("button", { className: "ghost small", onClick: () => setPicked(p => p.filter(x => x !== id)), children: "\u2715" })] })] }, id);
                    }), _jsxs(Select, { value: "", onChange: e => e.target.value && setPicked(p => [...p, Number(e.target.value)]), children: [_jsx("option", { value: "", children: "+ Add a customer\u2026" }), ext.filter(c => !picked.includes(c.id)).map(c => _jsx("option", { value: c.id, children: c.name }, c.id))] })] }), rows && rows.length > 0 && _jsx("p", { children: _jsxs("b", { children: ["Charged to customers: ", money(total)] }) })] });
}
// ---------- Sales > Settings > Shipping ----------
export function ShippingSettings({ sb, flash, canEdit }) {
    const [s, setS] = useState(null);
    const [zone, setZone] = useState(null);
    const [q, setQ] = useState('');
    const load = () => rpc(sb, 'ship_settings').then(setS).catch(e => flash(e.message, true));
    useEffect(() => { load(); }, []);
    if (!s)
        return _jsx("p", { className: "muted", children: "Loading\u2026" });
    const run = async (f, ok) => { try {
        await f();
        flash(ok);
        await load();
    }
    catch (e) {
        flash(e.message, true);
    } };
    const num = (v) => v === '' || v == null ? null : Number(v);
    const cs = s.customers.filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase()));
    return _jsxs("div", { className: "shipset", children: [_jsx("h3", { children: "Zones" }), _jsxs("p", { className: "muted small", children: ["Round-trip price from 1363 Green Valley Rd (same from OHR). Miles x $/mi is for reference. Multi-stop fee: ", money(s.fee), " a stop when a run has more than one billed stop."] }), _jsxs("table", { className: "tbl", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Zone" }), _jsx("th", { children: "Miles (RT)" }), _jsx("th", { children: "Van" }), _jsx("th", { children: "Box truck" }), _jsx("th", {})] }) }), _jsx("tbody", { children: s.zones.map(z => _jsxs("tr", { className: z.active ? '' : 'muted', children: [_jsx("td", { children: z.name }), _jsx("td", { children: z.miles_rt ?? '' }), _jsxs("td", { children: [money(z.price_van), " ", _jsxs("span", { className: "muted small", children: ["(", money((z.miles_rt ?? 0) * (z.rate_van ?? 0)), ")"] })] }), _jsxs("td", { children: [money(z.price_box), " ", _jsxs("span", { className: "muted small", children: ["(", money((z.miles_rt ?? 0) * (z.rate_box ?? 0)), ")"] })] }), _jsx("td", { children: canEdit && _jsx("button", { className: "linkbtn", onClick: () => setZone(z), children: "Edit" }) })] }, z.id)) })] }), canEdit && _jsx("button", { className: "ghost small", onClick: () => setZone({ name: '', active: true }), children: "+ Zone" }), zone && _jsxs("div", { className: "dcard", children: [_jsx("div", { className: "grid3", children: ['name', 'miles_rt', 'rate_van', 'rate_box', 'price_van', 'price_box'].map(k => _jsxs("div", { className: "field", children: [_jsx("label", { children: { name: 'Name', miles_rt: 'Miles round trip', rate_van: '$/mi van', rate_box: '$/mi box truck', price_van: 'Price van', price_box: 'Price box truck' }[k] }), _jsx("input", { type: k === 'name' ? 'text' : 'number', value: String(zone[k] ?? ''), onChange: e => setZone(z => ({ ...z, [k]: e.target.value })) })] }, k)) }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: zone.active !== false, onChange: e => setZone(z => ({ ...z, active: e.target.checked })) }), " Active"] }), _jsxs("div", { className: "row end", children: [_jsx("button", { className: "ghost", onClick: () => setZone(null), children: "Cancel" }), _jsx("button", { className: "primary", onClick: () => run(() => rpc(sb, 'save_ship_zone', { p_id: zone.id ?? null, p_name: zone.name, p_miles: num(zone.miles_rt), p_rate_van: num(zone.rate_van),
                                    p_rate_box: num(zone.rate_box), p_price_van: num(zone.price_van), p_price_box: num(zone.price_box), p_active: zone.active !== false }), 'Zone saved').then(() => setZone(null)), children: "Save zone" })] })] }), _jsx("h3", { children: "Vehicles" }), _jsx("p", { className: "muted small", children: "Which price column each truck uses. Outside carriers: their actual cost is typed on the load and split the same way." }), s.vehicles.map(v => _jsxs("div", { className: "row between setrow", children: [_jsx("span", { children: v.name }), _jsxs(Select, { value: v.class ?? '', disabled: !canEdit, onChange: e => run(() => rpc(sb, 'set_vehicle_ship_class', { p_vehicle: v.id, p_class: e.target.value || null }), `${v.name} updated`), children: [_jsx("option", { value: "", children: `Default (${CLASS_LABEL[v.auto_class]})` }), ['van', 'box', 'carrier'].map(k => _jsx("option", { value: k, children: CLASS_LABEL[k] }, k))] })] }, v.id)), _jsx("h3", { children: "Customers" }), _jsx("p", { className: "muted small", children: "Blank rule: contract customers ride free, everyone else is calculated. Split: Lifted pays that % of their share of an outside carrier." }), _jsx("input", { className: "search", type: "search", placeholder: "Customer", value: q, onChange: e => setQ(e.target.value) }), cs.map(c => _jsx(CustomerShip, { c: c, zones: s.zones, canEdit: canEdit, onSave: (zoneId, rule, pct) => run(() => rpc(sb, 'set_customer_shipping', { p_customer: c.id, p_zone: zoneId, p_rule: rule, p_pct: pct }), `${c.name} saved`) }, c.id))] });
}
function CustomerShip({ c, zones, canEdit, onSave }) {
    const [pct, setPct] = useState(c.pct != null ? String(c.pct) : '50');
    return _jsxs("div", { className: `row wrap setrow ${c.zone_id ? '' : 'warn-row'}`, children: [_jsxs("span", { className: "grow", children: [_jsx("b", { children: c.name }), c.contract && _jsx("span", { className: "muted", children: " \u00B7 contract" }), !c.zone_id && _jsx("span", { className: "warn-t", children: " \u00B7 no zone" })] }), _jsxs(Select, { value: c.zone_id ?? '', disabled: !canEdit, onChange: e => onSave(e.target.value ? Number(e.target.value) : null, c.rule, c.pct), children: [_jsx("option", { value: "", children: "No zone" }), zones.filter(z => z.active || z.id === c.zone_id).map(z => _jsx("option", { value: z.id, children: z.name }, z.id))] }), _jsxs(Select, { value: c.rule ?? '', disabled: !canEdit, onChange: e => onSave(c.zone_id, e.target.value || null, e.target.value === 'split' ? Number(pct) || 50 : null), children: [_jsx("option", { value: "", children: `Default (${RULE_LABEL[c.auto_rule]})` }), ['calc', 'free', 'split', 'pickup'].map(k => _jsx("option", { value: k, children: RULE_LABEL[k] }, k))] }), c.rule === 'split' && _jsxs(_Fragment, { children: [_jsx("input", { type: "number", min: "1", max: "100", value: pct, disabled: !canEdit, style: { width: 64 }, onChange: e => setPct(e.target.value), onBlur: () => Number(pct) !== c.pct && onSave(c.zone_id, 'split', Number(pct)) }), _jsx("span", { className: "muted small", children: "% Lifted pays" })] })] });
}
/** Sales > Settings > Fulfillment: how far off a line can be (lbs) and still count as filled without Sales' OK */
export function FillTolerance({ sb, flash, canEdit }) {
    const [v, setV] = useState('');
    const [cur, setCur] = useState(null);
    const load = () => rpc(sb, 'fill_tolerance', {}, '106_fill_tolerance').then(n => { setCur(Number(n)); setV(String(n)); }).catch(e => flash(e.message, true));
    useEffect(() => { load(); }, []);
    const save = async () => {
        try {
            await rpc(sb, 'set_fill_tolerance', { p_lbs: Number(v) }, '106_fill_tolerance');
            flash(`Lines within ${Number(v)} lbs count as filled`);
            await load();
        }
        catch (e) {
            flash(e.message, true);
        }
    };
    return _jsxs("div", { className: "shipset", children: [_jsx("h3", { children: "Filling order lines" }), _jsx("p", { className: "muted small", children: "A line counts as filled when what's assigned is within this many lbs of what was ordered (over or short), so it doesn't wait on Sales to OK it. The invoice bills what was actually assigned. 0 = must match exactly." }), _jsxs("div", { className: "row", children: [_jsxs("label", { children: ["Within ", _jsx("input", { type: "number", inputMode: "decimal", min: 0, max: 100, step: 0.5, value: v, disabled: !canEdit, onChange: e => setV(e.target.value), style: { maxWidth: 90 } }), " lbs"] }), canEdit && _jsx("button", { className: "primary small", disabled: v === '' || Number(v) === cur || !(Number(v) >= 0), onClick: save, children: "Save" })] }), cur == null && _jsx("p", { className: "muted small", children: "Loading\u2026" })] });
}
