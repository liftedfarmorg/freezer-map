import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Select } from './combo';
import { ScanButton } from './scan';
import { sameTag, useScanHandler } from './scanroute';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { metrcRun, openMetrcManifest } from './metrcCall';
import { lbs } from './forms';
import { PickupForm, PickupPanel, ShipLine, money, rpc } from './ship';
import { STATE_LABEL, orderGot, orderLbs, heldInFreezers } from './fulfill';
import { PlanMyPick } from './pickplanui';
import { StopAlerts, StopOutcomeSheet, outcomeText } from './driver';
import { kickNotify } from './push';
/** the license a site's freezers sit under: the hub there (GVR processor), else the site's cultivation license (same rule as site_license() in 045) */
export function siteLicense(lics, site) {
    const c = lics.filter(l => l.active && (l.site ?? '').toUpperCase() === site.toUpperCase() && ['processor', 'distributor', 'cultivation'].includes(l.kind))
        .sort((a, b) => Number(b.hub) - Number(a.hub) || Number(b.kind === 'processor') - Number(a.kind === 'processor') || a.sort - b.sort || a.license_no.localeCompare(b.license_no));
    return c[0]?.license_no ?? null;
}
export const STOP_COLORS = ['#2b7a5e', '#566f74', '#a8732a', '#7a5876', '#4f6b3a', '#8a5a44', '#3e6f8a', '#3a3436']; // brand family (Msg 288): teal, slate, amber, plum, olive, clay, steel, ink
export const stopColor = (seq) => STOP_COLORS[(seq - 1) % STOP_COLORS.length];
const STATUS = { planning: 'Planning', loading: 'Loading', departing: 'Departing', in_transit: 'In transit', delivered: 'Delivered', cancelled: 'Cancelled' };
const isPickup = (l) => l?.kind === 'pickup';
const PICKUP_KIND = 'Customer pickup';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
const fmtDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const editable = (l) => l.status === 'planning' || l.status === 'loading';
const n0 = (x) => Math.round(Number(x)).toLocaleString();
const soOf = (o) => o.so ?? `Order #${o.id}`;
const palletIds = (o) => o.lines.flatMap(l => l.picks.map(pk => pk.pallet_id));
/** orders for a customer that aren't on a load yet (not shipped/cancelled) */
const notLoaded = (ctx, customerId) => (ctx.orders ?? []).filter(o => o.customer_id === customerId && !o.stop && ['open', 'needs_ok', 'ready'].includes(o.state));
/** an order can go on a load once it has a pallet; it can only leave once it's complete and OK'd */
const canGoOn = (o) => orderGot(o) > 0;
const FILL_LABEL = { open: 'still needs pallets', needs_ok: 'waiting on Sales to OK amounts' };
/** put orders on a load, then refresh Fulfillment so both sides match */
async function attachOrders(ctx, loadId, ids) {
    for (const id of ids)
        await ctx.api.orderToLoad(id, loadId);
    await ctx.refreshOrders?.();
}
function label(ctx, p) {
    if (p.kind === 'mixed') {
        const c = ctx.contents(p.id);
        return `Mixed · ${c.length} pkg${c.length === 1 ? '' : 's'}`;
    }
    return p.strain ?? p.label ?? '';
}
// ---------- list ----------
/** the route a load runs: the farm (or pickup) through its numbered stops; delivered ones turn green (Msg 286) */
function RouteLine({ ctx, l, st }) {
    return _jsxs("div", { className: "tc-route", children: [_jsxs("span", { className: "tc-stop origin", children: [_jsx("i", { children: "\u25CF" }), isPickup(l) ? 'Pickup' : 'Farm'] }), st.map(s => _jsxs(Fragment, { children: [_jsx("span", { className: `tc-link ${s.status}` }), _jsxs("span", { className: `tc-stop ${s.status}`, children: [_jsx("i", { style: { ['--sc']: stopColor(s.seq) }, children: s.status === 'delivered' ? '✓' : s.status === 'not_delivered' ? '✕' : s.seq }), ctx.customers.find(c => c.id === s.customer_id)?.name] })] }, s.id))] });
}
export function TransitView({ ctx, onOpen, onNew }) {
    const [pickup, setPickup] = useState(false);
    const open = ctx.loads.filter(l => l.status !== 'delivered' && l.status !== 'cancelled');
    const done = ctx.loads.filter(l => l.status === 'delivered' || l.status === 'cancelled');
    const card = (l) => {
        const v = ctx.vehicles.find(x => x.id === l.vehicle_id);
        const st = ctx.stops.filter(s => s.load_id === l.id).sort((a, b) => a.seq - b.seq);
        const it = ctx.items.filter(i => i.load_id === l.id);
        const w = it.reduce((a, i) => { const p = ctx.pallet(i.pallet_id); return a + (p ? ctx.weight(p) : 0); }, 0);
        return (_jsxs("button", { className: `li loadcard tcard st-${l.status}`, onClick: () => onOpen(l.id), children: [_jsxs("div", { className: "tc-top", children: [_jsx("b", { className: "tc-code", children: l.code }), _jsx("span", { className: `pill s-${l.status}`, children: STATUS[l.status] })] }), _jsxs("div", { className: "tc-meta", children: [_jsx("span", { children: _jsx("b", { children: isPickup(l) ? 'Customer pickup' : v?.name ?? 'Vehicle?' }) }), _jsx("span", { children: fmtDate(l.load_date) }), l.driver && _jsx("span", { children: l.driver })] }), _jsx(RouteLine, { ctx: ctx, l: l, st: st }), (() => {
                    const os = (ctx.orders ?? []).filter(o => o.stop && st.some(s => s.id === o.stop.id));
                    return os.length > 0 && _jsx("div", { className: "tc-orders", children: os.map(o => _jsxs("span", { className: "pill", children: [soOf(o), " \u00B7 ", o.customer] }, o.id)) });
                })(), _jsxs("div", { className: "tc-fill", children: [!isPickup(l) && _jsx("span", { className: "tc-bar", children: _jsx("i", { style: { width: `${Math.min(100, v?.spaces ? Math.round(it.length / v.spaces * 100) : 0)}%` } }) }), _jsxs("span", { className: "muted", children: [isPickup(l) ? `${it.length} pallet${it.length === 1 ? '' : 's'}` : `${it.length}/${v?.spaces ?? '?'} positions`, " \u00B7 ", it.filter(i => i.loaded).length, " loaded \u00B7 ", lbs(w)] })] })] }, l.id));
    };
    return (_jsxs("div", { className: "list", children: [_jsxs("div", { className: "row between", children: [_jsx("h2", { children: "Transit" }), _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost", onClick: () => setPickup(true), children: "+ Pickup" }), _jsx("button", { className: "primary", onClick: onNew, children: "+ New load" })] })] }), _jsx(StopAlerts, { sb: ctx.api.client(), only: ['distribution', 'sales'] }), pickup && _jsx(PickupForm, { customers: ctx.customers, onClose: () => setPickup(false), onCreate: async (cust, date, notes) => {
                    let id = 0;
                    if (await ctx.run(async () => { id = (await rpc(ctx.api.client(), 'create_pickup', { p_customer: cust, p_date: date, p_notes: notes || null })).id; }, 'Pickup made')) {
                        setPickup(false);
                        onOpen(id);
                    }
                } }), open.length === 0 && _jsx("p", { className: "muted", children: "No active loads. Tap New load to plan one." }), open.length > 0 && _jsxs("h3", { className: "tc-h", children: ["Active ", _jsx("span", { className: "muted", children: open.length })] }), _jsx("div", { className: "tc-list", children: open.map(card) }), done.length > 0 && _jsxs(_Fragment, { children: [_jsxs("h3", { className: "tc-h", children: ["Last 14 days ", _jsx("span", { className: "muted", children: done.length })] }), _jsx("div", { className: "tc-list", children: done.map(card) })] })] }));
}
// ---------- create / edit ----------
export function LoadForm({ ctx, load, onClose, onSaved }) {
    const vehicles = ctx.vehicles.filter(v => (v.active || v.id === load?.vehicle_id) && v.kind !== PICKUP_KIND);
    const customers = ctx.customers.filter(c => c.active);
    const existing = load ? ctx.stops.filter(s => s.load_id === load.id).sort((a, b) => a.seq - b.seq) : [];
    const [vehicle, setVehicle] = useState(load?.vehicle_id ?? vehicles[0]?.id ?? null);
    const [date, setDate] = useState(load?.load_date ?? today());
    const [driver, setDriver] = useState(load?.driver ?? '');
    const [notes, setNotes] = useState(load?.notes ?? '');
    const [stops, setStops] = useState(existing.map(s => ({ id: s.id, customer_id: s.customer_id, manifest: s.manifest ?? '', delivered: s.status === 'delivered' })));
    // ready orders to put on this load when it's saved (ticked by default for stops added here)
    const [attach, setAttach] = useState(new Set());
    const addStop = (id) => {
        setStops(s => [...s, { customer_id: id, manifest: '' }]);
        const ready = notLoaded(ctx, id).filter(o => o.state === 'ready').map(o => o.id);
        if (ready.length)
            setAttach(a => new Set([...a, ...ready]));
    };
    const removeStop = (i) => {
        const cid = stops[i]?.customer_id;
        setStops(st => st.filter((_, j) => j !== i));
        if (cid != null && !stops.some((x, j) => j !== i && x.customer_id === cid))
            setAttach(a => new Set([...a].filter(id => (ctx.orders ?? []).find(o => o.id === id)?.customer_id !== cid)));
    };
    const toggleAttach = (id) => setAttach(a => { const n = new Set(a); if (n.has(id))
        n.delete(id);
    else
        n.add(id); return n; });
    const move = (i, d) => setStops(s => { const n = [...s]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); return n; });
    const ok = vehicle != null && stops.length > 0;
    async function save() {
        const clean = stops.map(({ delivered: _d, ...s }) => s);
        const ids = [...attach].filter(id => { const o = (ctx.orders ?? []).find(x => x.id === id); return o && canGoOn(o) && !o.stop && clean.some(s => s.customer_id === o.customer_id); });
        const withOrders = ids.length ? ` with ${ids.length} order${ids.length === 1 ? '' : 's'}` : '';
        if (load) {
            const a = await ctx.run(() => ctx.api.updateLoad(load.id, vehicle, date, driver, notes), 'Load updated');
            if (a && await ctx.run(async () => { await ctx.api.setStops(load.id, clean); if (ids.length)
                await attachOrders(ctx, load.id, ids); }, `Stops saved${withOrders}`))
                onSaved(load.id);
        }
        else {
            let id = 0;
            if (await ctx.run(async () => { id = (await ctx.api.createLoad(vehicle, date, clean, driver, notes)).id; if (ids.length)
                await attachOrders(ctx, id, ids); }, `Load created${withOrders}`))
                onSaved(id);
        }
    }
    return (_jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: "sheet form", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsx("h2", { children: load ? `Edit ${load.code}` : 'New load' }), _jsx("button", { className: "ghost", onClick: onClose, children: "\u2715" })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Vehicle" }), _jsxs("div", { className: "choices col", children: [vehicles.map(v => (_jsxs("button", { className: vehicle === v.id ? 'on' : '', onClick: () => setVehicle(v.id), children: [_jsx("b", { children: v.name }), " ", _jsxs("span", { className: "muted", children: ["\u00B7 ", v.spaces, " spaces", v.owner && v.owner !== 'Lifted' ? ` · ${v.owner}` : ''] })] }, v.id))), vehicles.length === 0 && _jsx("span", { className: "muted", children: "Add vehicles in Distribution \u203A Settings \u203A Vehicles first." })] })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Date" }), _jsx("input", { type: "date", value: date, onChange: e => setDate(e.target.value) })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Stops, in delivery order" }), stops.map((s, i) => (_jsxs("div", { className: "stoprow", style: { ['--sc']: stopColor(i + 1) }, children: [_jsx("span", { className: "stopnum", children: i + 1 }), _jsxs("div", { className: "grow", children: [_jsx("b", { children: customers.find(c => c.id === s.customer_id)?.name ?? ctx.customers.find(c => c.id === s.customer_id)?.name }), s.delivered && _jsx("span", { className: "muted", children: " \u00B7 delivered" }), stops.findIndex(x => x.customer_id === s.customer_id) === i && (() => {
                                            const on = s.id != null ? (ctx.orders ?? []).filter(o => o.stop?.id === s.id) : [];
                                            const waiting = notLoaded(ctx, s.customer_id);
                                            if (!on.length && !waiting.length)
                                                return null;
                                            return _jsxs("div", { className: "stoporders", children: [on.map(o => _jsxs("div", { className: "small ok-t", children: ["\u2713 ", soOf(o), " on this stop \u00B7 ", n0(orderGot(o)), " lbs"] }, o.id)), waiting.map(o => canGoOn(o)
                                                        ? _jsxs("label", { className: "sattach", children: [_jsx("input", { type: "checkbox", checked: attach.has(o.id), onChange: () => toggleAttach(o.id) }), _jsxs("span", { children: ["Load ", _jsx("b", { children: soOf(o) }), " ", _jsxs("span", { className: "muted", children: ["\u00B7 ", n0(orderGot(o)), o.state !== 'ready' ? ` of ${n0(orderLbs(o))}` : '', " lbs \u00B7 ", o.lines.length, " strain", o.lines.length === 1 ? '' : 's', o.state !== 'ready' ? ` · ${STATE_LABEL[o.state]}` : ''] })] })] }, o.id)
                                                        : _jsxs("div", { className: "small muted", children: [soOf(o), " \u00B7 no pallets yet \u00B7 assign some in Fulfillment first"] }, o.id))] });
                                        })()] }), _jsxs("div", { className: "stopbtns", children: [_jsx("button", { className: "ghost small", disabled: i === 0, onClick: () => move(i, -1), children: "\u2191" }), _jsx("button", { className: "ghost small", disabled: i === stops.length - 1, onClick: () => move(i, 1), children: "\u2193" }), _jsx("button", { className: "ghost small", disabled: s.delivered, onClick: () => removeStop(i), children: "\u2715" })] })] }, i))), _jsx(StopSearch, { ctx: ctx, customers: customers, taken: new Set(stops.map(s => s.customer_id)), onPick: addStop }), customers.filter(c => c.kind === 'external').length === 0 && _jsx("div", { className: "muted small-note", children: "No customers yet. Add them in Settings, Customers." })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Driver" }), (() => {
                            const v = ctx.vehicles.find(x => x.id === vehicle);
                            const ds = (ctx.drivers ?? []).filter(x => x.active && (v?.carrier_id != null ? x.carrier_id === v.carrier_id : x.carrier_id == null));
                            const sorted = [...ds.filter(x => vehicle != null && x.asset_ids.includes(vehicle)), ...ds.filter(x => vehicle == null || !x.asset_ids.includes(vehicle))];
                            const legacy = driver.trim() && !sorted.some(x => x.name.toLowerCase() === driver.trim().toLowerCase());
                            return _jsxs(Select, { value: sorted.find(x => x.name.toLowerCase() === driver.trim().toLowerCase())?.name ?? driver, onChange: e => setDriver(e.target.value), children: [_jsx("option", { value: "", children: "No driver yet" }), legacy && _jsxs("option", { value: driver, children: [driver, " (not in Vehicles \u203A Drivers)"] }), sorted.map(x => _jsx("option", { value: x.name, children: x.name }, x.id))] });
                        })(), _jsx("span", { className: "muted small", children: "Pick from Vehicles \u203A Drivers so the load shows on that driver's phone (carrier trucks: the carrier's drivers, who get a link)." })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Notes (optional)" }), _jsx("input", { value: notes, onChange: e => setNotes(e.target.value) })] }), _jsxs("div", { className: "row end", children: [_jsx("button", { className: "ghost", onClick: onClose, children: "Cancel" }), _jsx("button", { className: "primary", disabled: !ok || ctx.busy, onClick: save, children: load ? 'Save' : 'Create load' })] })] }) }));
}
// ---------- detail ----------
export function LoadView({ ctx, loadId, onBack, onEdit }) {
    const l = ctx.loads.find(x => x.id === loadId);
    const [placeItem, setPlaceItem] = useState(null);
    const [picker, setPicker] = useState(null);
    const [posOpen, setPosOpen] = useState(null);
    const [lics, setLics] = useState([]);
    const [checks, setChecks] = useState([]);
    const [xfers, setXfers] = useState([]);
    const [modes, setModes] = useState({});
    const [checking, setChecking] = useState(false);
    const [bump, setBump] = useState(0);
    const [openCheck, setOpenCheck] = useState(null);
    const [blockers, setBlockers] = useState(null);
    const [ship, setShip] = useState(new Map());
    const [left, setLeft] = useState(null);
    const [manifestFor, setManifestFor] = useState(null);
    const [departAsk, setDepartAsk] = useState(false);
    const [carrier, setCarrier] = useState(null);
    const [pulling, setPulling] = useState(false); // PICK-2: whole-load pull route
    // 215: the driver portal's view of this load (packages, outcomes), the outcome sheet, the carrier driver's link
    const [dl, setDl] = useState(null);
    const [dlOff, setDlOff] = useState(false); // 215 not run yet: the old Mark delivered button
    const [outFor, setOutFor] = useState(null);
    const [dlink, setDlink] = useState(null);
    const dsig = JSON.stringify([l?.status, l?.driver_id, ctx.stops.filter(s => s.load_id === loadId).map(s => [s.id, s.status, s.outcome, s.fixed_at])]);
    const loadDl = () => {
        const sb = ctx.api.client();
        if (!sb || !l || isPickup(l) || !['in_transit', 'delivered'].includes(l.status)) {
            setDl(null);
            return;
        }
        rpc(sb, 'driver_load', { p_load: l.id }, '215_driver_portal').then(d => { setDl(d); setDlOff(false); }).catch(() => { setDl(null); setDlOff(true); });
    };
    useEffect(loadDl, [dsig]);
    const carrierTruck = !!l && !isPickup(l) && ctx.vehicles.find(x => x.id === l.vehicle_id)?.carrier_id != null;
    useEffect(() => {
        const sb = ctx.api.client();
        setDlink(null);
        if (!sb || !l || !carrierTruck || !l.driver_id || ['delivered', 'cancelled'].includes(l.status) || !ctx.canRecord)
            return;
        rpc(sb, 'driver_link_for_load', { p_load: l.id }, '215_driver_portal').then(setDlink).catch(() => setDlink(null));
    }, [l?.id, l?.driver_id, l?.status, carrierTruck]);
    useEffect(() => {
        const sb = ctx.api.client();
        if (!sb)
            return;
        sb.from('licenses').select('license_no, kind, site, hub, sort, active').then(({ data }) => setLics((data ?? [])));
        sb.from('metrc_push_kinds').select('kind,mode').in('kind', ['transfer', 'manifest']).then(({ data }) => setModes(Object.fromEntries((data ?? []).map(k => [k.kind, k.mode]))));
    }, [ctx.api]);
    const stopIds = ctx.stops.filter(s => s.load_id === loadId).map(s => s.id);
    const loadMetrc = async () => {
        const sb = ctx.api.client();
        if (!sb || !stopIds.length)
            return;
        const [a, b] = await Promise.all([sb.from('metrc_stop_checks').select('*').in('stop_id', stopIds), sb.from('metrc_app_transfers').select('*').in('stop_id', stopIds)]);
        setChecks((a.data ?? []));
        setXfers((b.data ?? []));
    };
    useEffect(() => { loadMetrc(); }, [loadId, stopIds.join(',')]);
    const lNow = ctx.loads.find(x => x.id === loadId);
    const sig = JSON.stringify([lNow?.status, lNow?.carrier_cost, lNow?.pickup_driver, lNow?.pickup_dl, lNow?.pickup_make, lNow?.pickup_model, lNow?.pickup_plate,
        ctx.items.filter(i => i.load_id === loadId).map(i => [i.id, i.loaded, i.stop_id]),
        ctx.stops.filter(s => s.load_id === loadId).map(s => [s.id, s.status, s.ship_override, s.manifest]),
        (ctx.orders ?? []).filter(o => o.stop?.load_id === loadId).map(o => [o.id, o.fill, o.shipping, o.lines.map(l => l.picks.map(p => [p.pallet_id, p.lbs]))]), bump]);
    useEffect(() => {
        const sb = ctx.api.client();
        if (!sb || !lNow || !['planning', 'loading', 'departing'].includes(lNow.status)) {
            setBlockers(null);
            setShip(new Map());
            return;
        }
        let gone = false;
        rpc(sb, 'load_blockers', { p_load: loadId }).then(b => { if (!gone)
            setBlockers(b); }).catch(() => { if (!gone)
            setBlockers(null); });
        Promise.all(stopIds.map(id => rpc(sb, 'stop_shipping', { p_stop: id }).then(x => [id, x]).catch(() => null)))
            .then(rs => { if (!gone)
            setShip(new Map(rs.filter((x) => !!x))); });
        return () => { gone = true; };
    }, [sig]);
    // 207: a pallet not received in METRC yet blocks Depart; send that receive right from here (Aziz 11/4)
    async function sendReceive(id) {
        const sb = ctx.api.client();
        if (!sb)
            return;
        await ctx.run(async () => {
            const r = await metrcRun(sb, { action: 'send', ids: [id] });
            const x = r.results.find(y => y.id === id);
            setBump(n => n + 1);
            if (r.not_sent?.includes(id))
                throw new Error('Receiving isn\'t switched on for the app (Compliance › Settings › METRC through T3). Receive it in METRC, then click Done on the to-do.');
            if (!x)
                throw new Error('Not sent: run out of time, try again');
            if (x.state === 'failed')
                throw new Error(x.error ?? 'Receive failed');
            if (x.state === 'waiting')
                throw new Error(x.error ?? 'METRC has nothing to receive yet');
            if (!r.live)
                throw new Error('METRC sending is on dry run (not Live), so nothing was received. Receive it in METRC, then click Done on the to-do.');
        }, 'Received in METRC');
    }
    async function runChecks() {
        const sb = ctx.api.client();
        if (!sb || !l)
            return;
        setChecking(true);
        await ctx.run(async () => { await metrcRun(sb, { action: 'checklist', load_id: l.id }); await loadMetrc(); }, 'METRC check done');
        setChecking(false);
    }
    async function depart() {
        if (!l)
            return;
        const sb = ctx.api.client();
        if (!sb) {
            await ctx.run(() => ctx.api.departLoad(l.id), `${l.code} in transit`);
            return;
        }
        if (!metrcOn) {
            // no manifest to make first: check, leave, invoice
            await ctx.run(async () => {
                await rpc(sb, 'depart_prepare', { p_load: l.id });
                const r = await rpc(sb, 'depart_finish', { p_load: l.id });
                if (r.departed === false)
                    throw new Error(r.error ?? 'Nothing left yet.');
                setLeft(r);
            }, isPickup(l) ? `${l.code} picked up` : `${l.code} left`);
            return;
        }
        await ctx.run(async () => {
            const r = await metrcRun(sb, { action: 'depart', load_id: l.id });
            await loadMetrc();
            if (!r.departed)
                throw new Error(`Nothing left yet. ${r.error ?? ''}`);
            setLeft(r);
        }, `${l.code} ${isPickup(l) ? 'picked up' : 'left'}: METRC manifests made`);
    }
    async function departBack() {
        if (!l)
            return;
        await ctx.run(() => rpc(ctx.api.client(), 'depart_back', { p_load: l.id }), `${l.code} back to loading`);
    }
    // Scan while loading: a planned pallet is marked on the truck; one that isn't on this load can be added
    useScanHandler(l && editable(l) ? tag => {
        const its = ctx.items.filter(i => i.load_id === l.id);
        const it = its.find(i => sameTag(ctx.pallet(i.pallet_id)?.package_tag, tag) || ctx.contents(i.pallet_id).some(c => sameTag(c.package_tag, tag)));
        if (it) {
            const p = ctx.pallet(it.pallet_id);
            if (it.loaded)
                setPosOpen(it.position);
            else
                ctx.run(() => ctx.api.loadPallet(it.id), `${p?.code ?? 'Pallet'} on the truck · position ${it.position}`);
            return true;
        }
        const p = ctx.available.find(x => sameTag(x.package_tag, tag));
        if (p) {
            setPicker({ stop: null, position: null, pre: p.id });
            return true;
        }
        return false;
    } : null);
    if (!l)
        return _jsxs("div", { className: "list", children: [_jsx("button", { className: "ghost", onClick: onBack, children: "\u2039 Transit" }), _jsx("p", { className: "muted", children: "Load not found." })] });
    const v = ctx.vehicles.find(x => x.id === l.vehicle_id);
    const stops = ctx.stops.filter(s => s.load_id === l.id).sort((a, b) => a.seq - b.seq);
    const items = ctx.items.filter(i => i.load_id === l.id);
    const stopOf = (id) => stops.find(s => s.id === id);
    const cust = (s) => ctx.customers.find(c => c.id === s?.customer_id);
    const totalW = items.reduce((a, i) => { const p = ctx.pallet(i.pallet_id); return a + (p ? ctx.weight(p) : 0); }, 0);
    const canEdit = editable(l);
    const spaces = v?.spaces ?? 0, across = v?.across ?? 2;
    const rows = Math.ceil(spaces / across);
    // stops the app sends to METRC need a green checklist from the last hour before Depart (depart_load checks it too)
    const internalStop = (s) => { const c = cust(s); return c?.kind === 'internal' && ['OHR', 'GVR'].includes((c?.name ?? '').toUpperCase()); };
    const fresh = (iso) => Date.now() - new Date(iso).getTime() < 60 * 60000;
    const metrcOn = stops.some(s => s.status === 'pending' && (modes[internalStop(s) ? 'transfer' : 'manifest'] ?? 'off') !== 'off');
    const metrcBlock = stops.filter(s => s.status === 'pending' && items.some(i => i.stop_id === s.id) && (modes[internalStop(s) ? 'transfer' : 'manifest'] ?? 'off') !== 'off')
        .filter(s => { const cs = checks.filter(x => x.stop_id === s.id); return !cs.length || cs.some(x => !x.ok || !fresh(x.checked_at)); }).map(s => s.seq);
    // PICK-2: one pull route for every stop on the load (orders still needing pallets get planned; assigned / planned pallets still in a freezer come along)
    const loadOrders = (ctx.orders ?? []).filter(o => o.stop?.load_id === l.id && o.state !== 'shipped' && o.state !== 'cancelled');
    if (pulling && ctx.loc && ctx.freeFor && ctx.backend && ctx.flash && ctx.reloadAll) {
        const loc = ctx.loc;
        const held = heldInFreezers(loadOrders, ctx.pallet, loc);
        const seen = new Set(held.map(r => r.pallet.id));
        for (const i of items) {
            const p = ctx.pallet(i.pallet_id);
            if (!p || i.loaded || seen.has(p.id) || p.status !== 'in_freezer')
                continue;
            const L = loc(p);
            if (L.fz == null || L.staging)
                continue;
            held.push({ lineId: -i.stop_id, pallet: p, lbs: ctx.weight(p), whole: true, held: true });
        }
        const seqOfLine = (lineId) => lineId < 0 ? stopOf(-lineId)?.seq : stops.find(s => loadOrders.some(o => o.stop?.id === s.id && o.lines.some(x => x.id === lineId)))?.seq;
        const desc = [...stops].sort((a, b) => b.seq - a.seq).map(s => `Stop ${s.seq}`).join(', ');
        return _jsx(PlanMyPick, { orders: loadOrders, cands: ctx.freeFor, loc: loc, pallet: ctx.pallet, contents: ctx.contents, backend: ctx.backend, reload: ctx.reloadAll, flash: ctx.flash, back: () => setPulling(false), title: `Pull route · ${l.code}`, sub: stops.length > 1 ? `Stage pulled pallets last stop first: ${desc}` : undefined, backLabel: l.code, walkKey: `pmp-walk:l${l.id}`, held: held, tagOf: id => { const q = seqOfLine(id); return q ? { label: `Stop ${q}`, color: stopColor(q) } : undefined; } });
    }
    function tapPos(pos) {
        const here = items.filter(i => i.position === pos);
        if (placeItem) {
            const it = placeItem;
            if (pos === it.position) {
                setPlaceItem(null);
                return;
            }
            const others = here.filter(i => i.id !== it.id);
            const go = async () => { setPlaceItem(null); await ctx.run(() => ctx.api.moveItem(it.id, pos, null, others.length > 0), `Moved to position ${pos}`); };
            if (others.length)
                ctx.confirm(`Position ${pos} has ${others.map(o => ctx.pallet(o.pallet_id)?.code).join(', ')}. Stack them?`, 'Stack', go);
            else
                go();
            return;
        }
        if (here.length)
            setPosOpen(pos);
        else if (canEdit)
            setPicker({ stop: null, position: pos });
    }
    return (_jsxs("div", { className: "loadview", children: [_jsxs("div", { className: "lv-head", children: [_jsx("button", { className: "linkbtn lv-back", onClick: onBack, children: "\u2039 Transit" }), _jsxs("div", { className: "lv-title", children: [_jsx("h2", { children: l.code }), _jsx("span", { className: `pill s-${l.status}`, children: STATUS[l.status] }), _jsx("span", { className: "grow" }), canEdit && !isPickup(l) && _jsx("button", { className: "ghost small", onClick: onEdit, children: "Edit" })] }), _jsxs("div", { className: "lv-meta", children: [isPickup(l) ? 'Customer pickup' : v?.name, " \u00B7 ", fmtDate(l.load_date), l.driver ? ` · ${l.driver}` : '', " \u00B7 ", isPickup(l) ? `${items.length} pallet${items.length === 1 ? '' : 's'}` : `${items.length}/${spaces} positions`, " \u00B7 ", lbs(totalW)] }), _jsx(RouteLine, { ctx: ctx, l: l, st: stops }), !isPickup(l) && spaces > 0 && _jsx("span", { className: "tc-bar", children: _jsx("i", { style: { width: `${Math.min(100, Math.round(new Set(items.map(i => i.position)).size / spaces * 100))}%` } }) }), l.notes && _jsx("div", { className: "muted", children: l.notes })] }), canEdit && ctx.loc && ctx.freeFor && (loadOrders.length > 0 || items.some(i => !i.loaded)) && _jsxs("div", { className: "pmp-bar", children: [_jsxs("div", { className: "grow", children: [_jsx("b", { children: "Pull route" }), _jsx("div", { className: "small", children: "Every stop in one walk, as few freezers as it can." })] }), _jsx("button", { className: "primary", onClick: () => setPulling(true), children: "Plan the pull \u203A" })] }), l.status === 'departing' && _jsxs("div", { className: "warnbox", children: [_jsx("b", { children: "Departing." }), " ", l.depart_error ?? 'Making the METRC manifests. Nothing has left yet.', _jsxs("div", { className: "row", style: { marginTop: 8 }, children: [_jsx("button", { className: "primary small", disabled: ctx.busy, onClick: depart, children: "Depart again" }), _jsx("button", { className: "ghost small", disabled: ctx.busy, onClick: () => ctx.confirm(`Send ${l.code} back to loading? Its manifest to-dos are cancelled. (Only works if METRC hasn't made a manifest yet.)`, 'Back to loading', departBack), children: "Back to loading" })] })] }), left && (l.status === 'in_transit' || l.status === 'delivered') && (() => {
                const dep = l.departed_at ? new Date(l.departed_at) : new Date();
                const at = (d) => d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
                const stops = ctx.stops.filter(s => s.load_id === l.id && s.manifest && /^\d{6,}$/.test(s.manifest.trim())).sort((a, b) => a.seq - b.seq);
                return _jsxs("div", { className: "okbox", children: [_jsxs("b", { children: [isPickup(l) ? 'Picked up' : 'Departs', " ", at(dep), "."] }), " ", left.invoices?.length ? _jsxs(_Fragment, { children: ["Invoices made: ", left.invoices.map(i => `${i.inv} ${i.customer} ${money(i.total)}`).join(' · '), ". They go to QuickBooks at ", at(new Date(dep.getTime() + 30 * 60000)), " (30 minutes after departure) unless someone changes them."] }) : 'No invoices (transfer only).', stops.length > 0 && _jsx("div", { className: "row wrap", style: { marginTop: 8, gap: 6 }, children: stops.map(s => _jsxs("button", { className: "primary small", onClick: () => {
                                    const sb = ctx.api.client();
                                    const fr = ctx.items.filter(i => i.stop_id === s.id).map(i => i.from_site).filter(Boolean);
                                    const lic = siteLicense(lics, fr[0] ?? '');
                                    if (sb && lic)
                                        openMetrcManifest(sb, lic, s.manifest.trim()).catch(e => ctx.run(() => Promise.reject(e), ''));
                                }, children: ["Print manifest ", s.manifest, " \u00B7 stop ", s.seq, " ", ctx.customers.find(c => c.id === s.customer_id)?.name ?? ''] }, s.id)) }), !stops.length && _jsx(_Fragment, { children: " Print the METRC manifest from each stop below." }), _jsx("div", { className: "row end", children: _jsx("button", { className: "ghost small", onClick: () => setLeft(null), children: "OK" }) })] });
            })(), departAsk && _jsx(DepartSheet, { l: l, pickup: isPickup(l), n: items.length, metrcOn: metrcOn, busy: ctx.busy, onClose: () => setDepartAsk(false), onGo: async (at) => {
                    setDepartAsk(false);
                    const sb = ctx.api.client();
                    if (sb) {
                        try {
                            await rpc(sb, 'set_depart_time', { p_load: l.id, p_at: at.toISOString() });
                        }
                        catch (e) {
                            const m = e.message;
                            if (!/set_depart_time|schema cache/i.test(m)) {
                                await ctx.run(() => Promise.reject(e), '');
                                return;
                            }
                        }
                    }
                    await depart();
                } }), isPickup(l) && _jsx(PickupPanel, { load: l, canEdit: canEdit, sb: ctx.api.client(), carrierId: ctx.customers.find(c => stops.some(s => s.customer_id === c.id))?.pickup_carrier_id ?? null, onSave: v => ctx.run(() => rpc(ctx.api.client(), 'set_pickup_driver', { p_load: l.id, p_driver: v.driver, p_dl: v.dl, p_make: v.make, p_model: v.model, p_plate: v.plate, p_license: v.license }), 'Driver saved') }), !isPickup(l) && v?.carrier_id != null && _jsxs("div", { className: "dcard row wrap between", children: [_jsxs("span", { children: [_jsx("b", { children: "Carrier's cost for this run:" }), " ", l.carrier_cost != null ? money(l.carrier_cost) : _jsx("span", { className: "warn-t", children: "not entered" }), " ", _jsx("span", { className: "muted small", children: "(split across the customer stops)" })] }), (canEdit || l.status === 'departing') && (carrier == null
                        ? _jsx("button", { className: "ghost small", onClick: () => setCarrier(l.carrier_cost != null ? String(l.carrier_cost) : ''), children: l.carrier_cost != null ? 'Change' : 'Enter cost' })
                        : _jsxs("span", { className: "row", children: [_jsx("input", { type: "number", step: "0.01", min: "0", value: carrier, onChange: e => setCarrier(e.target.value), style: { width: 110 } }), _jsx("button", { className: "primary small", onClick: async () => { if (await ctx.run(() => rpc(ctx.api.client(), 'set_load_carrier_cost', { p_load: l.id, p_cost: carrier === '' ? null : Number(carrier) }), 'Carrier cost saved'))
                                        setCarrier(null); }, children: "Save" }), _jsx("button", { className: "ghost small", onClick: () => setCarrier(null), children: "Cancel" })] }))] }), carrierTruck && !l.driver_id && !['delivered', 'cancelled'].includes(l.status) && _jsx("div", { className: "warnbox", children: "Pick the carrier's driver (Edit) so they get a link to record each stop." }), dlink && (() => {
                const url = `${location.origin}/?drive=${dlink.token}`;
                const msg = `Lifted Farms load ${l.code}: record each stop here (open it again any time): ${url}`;
                return _jsxs("div", { className: "dcard", children: [_jsxs("div", { children: [_jsxs("b", { children: ["Driver link for ", dlink.driver ?? 'the driver'] }), " ", _jsx("span", { className: "muted small", children: "(no login; works until the load is done)" })] }), _jsxs("div", { className: "row wrap", style: { gap: 6, marginTop: 6 }, children: [_jsx("button", { className: "ghost small", onClick: () => navigator.clipboard.writeText(url).then(() => ctx.run(async () => { }, 'Link copied')), children: "Copy link" }), dlink.phone && _jsxs("a", { className: "ghost small btnlink", href: `sms:${dlink.phone.replace(/[^\d+]/g, '')}${/iPhone|iPad/.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(msg)}`, children: ["Text to ", dlink.phone] }), dlink.email && _jsxs("a", { className: "ghost small btnlink", href: `mailto:${dlink.email}?subject=${encodeURIComponent(`Lifted Farms load ${l.code}`)}&body=${encodeURIComponent(msg)}`, children: ["Email ", dlink.email] }), typeof navigator.share === 'function' && _jsx("button", { className: "ghost small", onClick: () => navigator.share({ title: `Load ${l.code}`, text: msg }).catch(() => { }), children: "Share\u2026" }), _jsx("button", { className: "ghost small", onClick: () => ctx.confirm('Make a new link? The old one stops working.', 'New link', async () => { await ctx.run(async () => setDlink(await rpc(ctx.api.client(), 'driver_link_for_load', { p_load: l.id, p_new: true }, '215_driver_portal')), 'New link made'); }), children: "New link" })] })] });
            })(), _jsx("div", { className: "stops", children: stops.map(s => {
                    const its = items.filter(i => i.stop_id === s.id);
                    const w = its.reduce((a, i) => { const p = ctx.pallet(i.pallet_id); return a + (p ? ctx.weight(p) : 0); }, 0);
                    const c = cust(s);
                    const site = c?.kind === 'internal' && ['OHR', 'GVR'].includes((c?.name ?? '').toUpperCase());
                    const dest = site ? (c?.name ?? '').toUpperCase() : null;
                    const froms = [...new Set(its.map(i => { const p = ctx.pallet(i.pallet_id); return i.from_site ?? (p ? ctx.siteOf(p) : null); }).filter((x) => !!x))].sort();
                    const L = (st) => { const n = siteLicense(lics, st); return n ? `${st} ${n}` : st; };
                    const already = dest && froms.includes(dest);
                    // orders riding on this stop, ready orders that could, and pallets that belong to no order
                    const sOrders = (ctx.orders ?? []).filter(o => o.stop?.id === s.id);
                    const waiting = canEdit && s.status === 'pending' && c?.kind === 'external' ? notLoaded(ctx, s.customer_id) : [];
                    const top = (id) => ctx.pallet(id)?.container_id ?? id;
                    const mine = new Set(sOrders.flatMap(palletIds).flatMap(id => [id, top(id)]));
                    const loose = c?.kind === 'external' && ['planning', 'loading', 'departing'].includes(l.status) ? its.filter(i => !mine.has(i.pallet_id)).length : 0;
                    const carrying = site ? [...new Set(its.map(i => ctx.held(i.pallet_id)).filter((x) => !!x))] : [];
                    return (_jsxs("div", { className: `stopcard ${s.status}`, style: { ['--sc']: stopColor(s.seq) }, children: [_jsxs("div", { className: "row between", children: [_jsxs("div", { children: [_jsx("span", { className: "stopnum", children: s.seq }), " ", _jsx("b", { children: c?.name }), s.manifest && _jsxs("span", { className: "muted", children: [" \u00B7 manifest ", s.manifest] })] }), (() => {
                                        const ds = dl?.stops.find(x => x.id === s.id);
                                        const o = s.outcome ?? ds?.outcome;
                                        const officeOk = ctx.canRecord && !isPickup(l) && ['in_transit', 'delivered'].includes(l.status);
                                        // 224: taken off while departing (its manifest voided or never made)
                                        if (s.status === 'cancelled')
                                            return _jsxs("span", { className: "pill m-off", children: ["Taken off", s.off_reason ? ` (${s.off_reason})` : ''] });
                                        if (l.status === 'departing' && ctx.canRecord && s.status === 'pending')
                                            return _jsx("button", { className: "ghost small", disabled: ctx.busy, onClick: () => ctx.confirm(`Take stop ${s.seq} (${c?.name}) off ${l.code}? Its pallets come off the truck into Needs a spot and its orders go back to Ready. If its METRC manifest is already made, a Void to-do goes to Compliance (approve it there). The other stops carry on.`, 'Take stop off', async () => { await ctx.run(async () => { const { error } = await ctx.api.client().rpc('stop_off_departing', { p_stop: s.id }); if (error)
                                                    throw new Error(error.message); await ctx.refreshOrders?.(); }, `Stop ${s.seq} taken off ${l.code}`); }), children: "Take stop off" });
                                        if (o || s.status !== 'pending') {
                                            const bad = o && o !== 'delivered' && o !== 'dropped_off';
                                            return _jsxs("span", { className: "row", style: { gap: 6 }, children: [_jsx("span", { className: `pill ${bad ? 's-back' : 's-delivered'}`, children: o ? outcomeText({ outcome: o, outcome_reason: s.outcome_reason ?? ds?.outcome_reason ?? null }) : site ? 'Received' : 'Delivered' }), officeOk && !site && ds && !ds.back_started && _jsx("button", { className: "ghost small", disabled: ctx.busy, onClick: () => setOutFor(ds), children: "Change" })] });
                                        }
                                        if (dlOff && l.status === 'in_transit')
                                            return _jsx("button", { className: "primary small", disabled: ctx.busy, onClick: () => ctx.confirm(`Mark stop ${s.seq} (${c?.name}) ${site ? 'received' : 'delivered'}? ${its.length} pallet${its.length === 1 ? '' : 's'} ${site ? `will be received at ${c?.name} and need a freezer spot` : 'will leave inventory'}.`, site ? 'Received' : 'Delivered', async () => { await ctx.run(() => ctx.api.deliverStop(s.id), `Stop ${s.seq} ${site ? 'received' : 'delivered'}`); }), children: site ? 'Mark received' : 'Mark delivered' });
                                        return l.status === 'in_transit' && officeOk && _jsx("button", { className: "primary small", disabled: ctx.busy || !ds, title: ds ? '' : 'Loading the packages…', onClick: () => ds && setOutFor(ds), children: "Record outcome" });
                                    })()] }), _jsxs("div", { className: "muted", children: [its.length, " pallet", its.length === 1 ? '' : 's', " \u00B7 ", lbs(w)] }), (() => {
                                const ds = dl?.stops.find(x => x.id === s.id);
                                if (!ds || !ds.outcome)
                                    return null;
                                const back = ds.packages.filter(p => p.back);
                                // everything off this stop is back in inventory (Receive back done): say so instead of "coming back"
                                const allBack = ds.back_started && its.every(i => { const p = ctx.pallet(i.pallet_id); return !!p && (p.status === 'in_freezer' || p.status === 'unslotted'); });
                                return _jsxs("div", { className: "small-note stop-outcome", children: [ds.receiver_name ? _jsxs(_Fragment, { children: ["Received by ", _jsx("b", { children: ds.receiver_name }), " \u00B7 "] }) : '', ds.outcome_by, ds.outcome_via === 'office' ? ' (office)' : ds.outcome_via === 'link' ? '' : ' (driver)', ds.outcome_at ? ` · ${new Date(ds.outcome_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : '', ds.outcome_note && _jsxs("div", { children: ["Note: ", ds.outcome_note] }), back.length > 0 && _jsxs("div", { className: "warn-t", children: ["\u21A9 ", back.length, " ", allBack ? 'received back' : `coming back${ds.back_started ? ' (receiving started)' : ''}`, ": ", back.map(p => `${p.code}${p.reason ? ` (${p.reason.replace('_', ' ')})` : ''}`).join(', ')] }), ds.has_photo && _jsx("button", { className: "ghost small", onClick: () => rpc(ctx.api.client(), 'stop_photo', { p_stop: s.id }, '215_driver_portal').then(u => { if (u) {
                                                const w = window.open();
                                                if (w)
                                                    w.document.write(`<img src="${u}" style="max-width:100%">`);
                                            } }).catch(e => ctx.run(() => Promise.reject(e), '')), children: "\uD83D\uDCF7 Photo" })] });
                            })(), (sOrders.length > 0 || waiting.length > 0 || loose > 0 || carrying.length > 0) && _jsxs("div", { className: "stoporders", children: [sOrders.map(o => {
                                        const ids = palletIds(o), tops = new Set(ids.map(top)), on = its.filter(i => tops.has(i.pallet_id)), onTruck = ids.filter(id => on.some(i => i.loaded && i.pallet_id === top(id))).length;
                                        return _jsxs("div", { className: "row sorderrow", children: [_jsxs("button", { className: "sorder", onClick: () => ctx.openOrder?.(o.id), children: [_jsxs("span", { children: [_jsx("b", { children: soOf(o) }), " ", _jsxs("span", { className: "muted", children: ["\u00B7 ", n0(orderGot(o)), " lbs \u00B7 ", o.lines.length, " strain", o.lines.length === 1 ? '' : 's'] }), s.status === 'pending' && o.fill && o.fill !== 'ready' && _jsxs("span", { className: "warn-t", children: [" \u00B7 ", FILL_LABEL[o.fill]] })] }), _jsxs("span", { className: "muted", children: [s.status === 'delivered' ? 'shipped' : `${onTruck}/${ids.length} on truck`, " \u203A"] })] }), canEdit && s.status === 'pending' && _jsx("button", { className: "ghost small", disabled: ctx.busy || onTruck > 0, title: onTruck ? 'Put its pallets back in a freezer first' : 'Take this order off the load', onClick: () => ctx.confirm(`Take ${soOf(o)} off ${l.code}? Its pallets come off the truck plan and it goes back to Ready in Fulfillment.`, 'Take off', async () => { await ctx.run(async () => { await ctx.api.orderOffLoad(o.id); await ctx.refreshOrders?.(); }, `${soOf(o)} taken off ${l.code}`); }), children: "Take off" })] }, o.id);
                                    }), waiting.map(o => canGoOn(o)
                                        ? _jsxs("div", { className: "sorder ready", children: [_jsxs("span", { children: [_jsx("b", { children: soOf(o) }), " ", _jsxs("span", { className: "muted", children: ["\u00B7 ", o.state === 'ready' ? 'ready' : STATE_LABEL[o.state].toLowerCase(), " \u00B7 ", n0(orderGot(o)), o.state !== 'ready' ? ` of ${n0(orderLbs(o))}` : '', " lbs"] })] }), _jsx("button", { className: "primary small", disabled: ctx.busy, onClick: () => ctx.run(() => attachOrders(ctx, l.id, [o.id]), `${soOf(o)} on ${l.code}`), children: "+ Add to stop" })] }, o.id)
                                        : _jsxs("button", { className: "sorder", onClick: () => ctx.openOrder?.(o.id), children: [_jsxs("span", { children: [_jsx("b", { children: soOf(o) }), " ", _jsxs("span", { className: "muted", children: ["\u00B7 ", STATE_LABEL[o.state], " \u00B7 ", n0(orderGot(o)), " of ", n0(orderLbs(o)), " lbs"] })] }), _jsx("span", { className: "muted", children: "Fulfillment \u203A" })] }, o.id)), loose > 0 && _jsxs("div", { className: "small-note warn-t", children: [loose, " pallet", loose === 1 ? " isn't" : "s aren't", " on any order for ", c?.name, ". It can't leave until ", loose === 1 ? "it's" : "they're", " on an order (assign in Fulfillment) or off the truck."] }), carrying.length > 0 && _jsxs("div", { className: "small-note muted", children: ["Carrying pallets held for ", carrying.join(', ')] })] }), its.length > 0 && _jsx("div", { className: `small-note lic ${froms.length > 1 || already ? 'warn-t' : 'muted'}`, children: dest ? _jsxs(_Fragment, { children: ["Transfer: ", froms.map(L).join(' + ') || '?', " \u2192 ", _jsx("b", { children: L(dest) }), already ? ` · some of these are already at ${dest}` : ''] })
                                    : _jsxs(_Fragment, { children: ["Ships from ", froms.map(L).join(' and ') || '?', froms.length > 1 ? ' · two licenses means two METRC manifests' : ''] }) }), c?.kind === 'external' && _jsx(ShipLine, { sh: s.ship_saved_at ? { billed: true, saved: true, rule: s.ship_rule ?? undefined, charge: s.ship_charge, value: s.ship_value, descr: s.ship_desc,
                                    override: s.ship_override, reason: s.ship_override_reason } : ship.get(s.id), canEdit: !!ctx.canShip && (canEdit || l.status === 'departing') && s.status === 'pending', onSet: (amount, reason) => ctx.run(() => rpc(ctx.api.client(), 'set_stop_shipping', { p_stop: s.id, p_amount: amount, p_reason: reason || null }), amount == null ? 'Shipping back to calculated' : 'Shipping saved') }), its.length > 0 && _jsx(StopMetrc, { checks: checks.filter(x => x.stop_id === s.id), xfers: xfers.filter(x => x.stop_id === s.id), on: modes[site ? 'transfer' : 'manifest'] ?? 'off', open: openCheck === s.id, onToggle: () => setOpenCheck(o => o === s.id ? null : s.id), pending: s.status === 'pending' }), _jsxs("div", { className: "row", children: [canEdit && _jsx("button", { className: "ghost small", onClick: () => setPicker({ stop: s.id, position: null }), children: "+ Add pallets" }), canEdit && ctx.newMixedOnStop && its.length > 0 && _jsx("button", { className: "ghost small", onClick: () => ctx.newMixedOnStop(s.id, its.some(i => i.loaded)), children: "+ Mixed pallet" }), !s.manifest && ['in_transit', 'delivered'].includes(l.status) && its.length > 0 && (manifestFor?.stop === s.id
                                        ? _jsxs("span", { className: "row", children: [_jsx("input", { placeholder: "METRC manifest #", value: manifestFor.value, onChange: e => setManifestFor({ stop: s.id, value: e.target.value }), style: { width: 150 } }), _jsx("button", { className: "primary small", disabled: !manifestFor.value.trim(), onClick: async () => { if (await ctx.run(() => rpc(ctx.api.client(), 'set_stop_manifest', { p_stop: s.id, p_manifest: manifestFor.value }), 'Manifest # saved (and on the invoice)'))
                                                        setManifestFor(null); }, children: "Save" }), _jsx("button", { className: "ghost small", onClick: () => setManifestFor(null), children: "Cancel" })] })
                                        : _jsx("button", { className: "ghost small", onClick: () => setManifestFor({ stop: s.id, value: '' }), children: "Enter manifest #" })), s.manifest && /^\d{6,}$/.test(s.manifest.trim()) && froms.length > 0 && _jsx("button", { className: "ghost small", onClick: () => {
                                            const sb = ctx.api.client();
                                            const lic = siteLicense(lics, froms[0]);
                                            if (sb && lic)
                                                openMetrcManifest(sb, lic, s.manifest.trim()).catch(e => ctx.run(() => Promise.reject(e), ''));
                                        }, children: ['in_transit', 'delivered'].includes(l.status) ? 'Print METRC manifest' : 'METRC manifest' })] })] }, s.id));
                }) }), outFor && _jsx(StopOutcomeSheet, { stop: outFor, load: l.code, office: true, onClose: () => setOutFor(null), onSave: async (p) => {
                    const { error } = await ctx.api.client().rpc('record_stop_outcome', { p_stop: outFor.id, p });
                    if (error)
                        throw new Error(error.message);
                    setOutFor(null);
                    loadDl();
                    kickNotify(ctx.api.client());
                    await ctx.run(async () => { await ctx.refreshOrders?.(); }, 'Outcome saved');
                } }), placeItem && _jsxs("div", { className: "movebar", children: [_jsxs("div", { children: [_jsxs("b", { children: ["Moving ", ctx.pallet(placeItem.pallet_id)?.code, " on the truck"] }), _jsx("div", { className: "muted", children: "Tap a position." })] }), _jsx("button", { className: "ghost", onClick: () => setPlaceItem(null), children: "Cancel" })] }), isPickup(l) ? _jsxs("div", { className: "list pickuplist", children: [items.length === 0 && _jsx("p", { className: "muted", children: "No pallets yet. Add the customer's orders above (or + Add pallets)." }), items.map(i => {
                        const p = ctx.pallet(i.pallet_id);
                        return _jsxs("button", { className: "li setrow", onClick: () => setPosOpen(i.position), children: [_jsxs("div", { className: "grow", children: [_jsx("b", { children: p?.code }), " ", _jsxs("span", { className: "muted", children: [p ? label(ctx, p) : '', " \u00B7 ", p ? lbs(ctx.weight(p)) : ''] })] }), _jsx("span", { className: `pill ${i.loaded ? 's-in_transit' : 's-planning'}`, children: i.loaded ? 'Pulled' : p ? `Pull from ${ctx.freezerSpot(p.slot_id)}` : 'Planned' })] }, i.id);
                    })] }) : _jsxs("div", { className: "truck-wrap", children: [_jsx("div", { className: "truck-label", children: "NOSE" }), _jsx("div", { className: "truck", style: { gridTemplateColumns: `repeat(${across}, 1fr)` }, children: Array.from({ length: rows * across }, (_, k) => {
                            const pos = k + 1;
                            if (pos > spaces)
                                return _jsx("div", {}, pos);
                            const here = items.filter(i => i.position === pos).sort((a, b) => (b.layer ?? 1) - (a.layer ?? 1) || b.id - a.id);
                            // top comes off first: a lower layer for an earlier stop means unstacking at that stop
                            const blocked = here.some((u, k) => here.slice(k + 1).some(d => (stopOf(d.stop_id)?.seq ?? 0) < (stopOf(u.stop_id)?.seq ?? 0) && stopOf(d.stop_id)?.status !== 'delivered'));
                            return (_jsxs("button", { className: `tpos ${here.length ? 'full' : 'empty'} ${here.length > 1 ? 'stacked' : ''} ${placeItem ? 'target' : ''}`, onClick: () => tapPos(pos), style: here.length ? { ['--sc']: stopColor(stopOf(here[0].stop_id)?.seq ?? 1) } : undefined, children: [_jsxs("span", { className: "code", children: [pos, here.length > 1 && _jsxs("span", { className: "stackbadge", children: ["stack of ", here.length] })] }), blocked && _jsxs("span", { className: "small warn-t", children: ["Unstack at stop ", Math.min(...here.map(i => stopOf(i.stop_id)?.seq ?? 99))] }), here.length === 0 && _jsx("span", { className: "muted", children: placeItem ? 'Here' : canEdit ? '+ Add' : 'empty' }), here.map(i => {
                                        const p = ctx.pallet(i.pallet_id);
                                        const s = stopOf(i.stop_id);
                                        return (_jsxs("span", { className: `titem ${s?.status === 'delivered' || l.status === 'delivered' ? 'done' : ''}`, style: { ['--sc']: stopColor(s?.seq ?? 1) }, children: [_jsx("b", { children: p?.code }), " ", _jsx("span", { className: "tstop", children: s?.seq }), here.length > 1 && _jsx("span", { className: "tlayer", children: i === here[0] ? 'top' : i === here[here.length - 1] ? 'bottom' : 'middle' }), _jsx("span", { className: "strain", children: p ? label(ctx, p) : '' }), _jsxs("span", { className: "w", children: [p ? lbs(ctx.weight(p)) : '', " \u00B7 ", p && (p.status === 'in_freezer' || p.status === 'unslotted') && (s?.status === 'delivered' || l.status === 'delivered')
                                                            ? `${s?.status === 'delivered' ? '✓' : '↩'} ${p.slot_id ? ctx.freezerSpot(p.slot_id) : 'needs a spot'}${(() => { const h = ctx.held(p.id) ?? ctx.contents(p.id).map(x => ctx.held(x.id)).find(Boolean); return h ? ` · ${h.split(' · ')[0]}` : ''; })()}`
                                                            : s?.status === 'delivered' ? `✓ ${ctx.customers.find(c => c.id === s.customer_id)?.name ?? 'delivered'}`
                                                                : i.loaded ? '✓ on truck' : p ? ctx.freezerSpot(p.slot_id) : ''] })] }, i.id));
                                    })] }, pos));
                        }) }), _jsx("div", { className: "truck-label door", children: "DOOR" })] }), canEdit && blockers && blockers.length > 0 && _jsxs("div", { className: "warnbox blockers", children: [_jsx("b", { children: "Before it can leave:" }), _jsx("ul", { children: blockers.map((b, k) => {
                            const rcv = /isn't received in METRC yet \(to-do #(\d+)\)/.exec(b.text);
                            return _jsxs("li", { children: [b.seq ? `Stop ${b.seq}: ` : '', b.order_id ? _jsx("a", { onClick: () => ctx.openOrder?.(b.order_id), children: b.text }) : b.text, rcv && _jsxs(_Fragment, { children: [" ", _jsx("button", { className: "primary small", disabled: ctx.busy, onClick: () => sendReceive(Number(rcv[1])), children: "Send receive" })] })] }, k);
                        }) })] }), _jsxs("div", { className: "row actions", children: [canEdit && !isPickup(l) && _jsx("button", { className: "ghost", disabled: ctx.busy || !items.length, onClick: () => ctx.run(() => ctx.api.arrangeLoad(l.id), 'Arranged: last stop at the nose'), children: "Auto-arrange" }), canEdit && items.length > 0 && _jsx("button", { className: "ghost", disabled: ctx.busy || checking, onClick: runChecks, children: checking ? 'Checking METRC…' : 'Check METRC' }), canEdit && (() => {
                        const go = isPickup(l) ? 'Picked up' : 'Depart';
                        const blocked = (blockers?.length ?? 0) > 0;
                        return _jsx("button", { className: "primary", disabled: ctx.busy || !items.length || metrcBlock.length > 0 || blocked, title: metrcBlock.length ? `METRC checklist not green: stop ${metrcBlock.join(', ')}` : blocked ? 'See the list above' : '', onClick: () => setDepartAsk(true), children: metrcBlock.length ? `${go} (METRC check)` : blocked ? `${go} (not ready)` : go });
                    })(), canEdit && _jsx("button", { className: "ghost", disabled: ctx.busy, onClick: () => ctx.confirm(`Cancel ${l.code}? Planned pallets stay where they are${(ctx.orders ?? []).some(o => o.stop?.load_id === l.id) ? ', and its orders go back to Ready in Fulfillment' : ''}.`, 'Cancel load', async () => { if (await ctx.run(async () => { await ctx.api.cancelLoad(l.id); await ctx.refreshOrders?.(); }, `${l.code} cancelled`))
                            onBack(); }), children: "Cancel load" })] }), canEdit && _jsx("p", { className: "muted", children: "Depart puts everything planned on the truck (no need to tap \"Pulled onto truck\" first, but you can, or scan tags while loading). To move a pallet, tap its position, then Move on truck and tap where it goes (tap a full position to stack). In a stack, Put on top sets the order; the top comes off first. Depart unlocks when every order is complete and OK'd; it makes the METRC manifests first, then the invoices." }), posOpen != null && (_jsx(PositionSheet, { ctx: ctx, load: l, pos: posOpen, items: items.filter(i => i.position === posOpen), stops: stops, onClose: () => setPosOpen(null), onMove: it => { setPosOpen(null); setPlaceItem(it); }, onStack: () => { const p = posOpen; setPosOpen(null); setPicker({ stop: null, position: p, stack: true }); } })), picker && (_jsx(PalletPicker, { ctx: ctx, load: l, stops: stops.filter(s => s.status === 'pending'), initialStop: picker.stop, position: picker.position, pre: picker.pre, stack: picker.stack, free: spaces - new Set(items.map(i => i.position)).size, onClose: () => setPicker(null) }))] }));
}
/** the METRC side of a stop: the checklist (Check METRC) and the manifest the app made */
function StopMetrc({ checks, xfers, on, open, onToggle, pending }) {
    const made = xfers.filter(x => x.state !== 'voided');
    const fresh = (iso) => Date.now() - new Date(iso).getTime() < 60 * 60000;
    const ok = checks.length > 0 && checks.every(c => c.ok && fresh(c.checked_at));
    const bad = checks.flatMap(c => c.checks.filter(x => !x.ok).map(x => ({ ...x, license: c.license })));
    if (!made.length && !checks.length && (!pending || on === 'off'))
        return null;
    return _jsxs("div", { className: "small-note", children: [made.map(x => _jsxs("div", { children: [_jsxs("b", { children: ["METRC manifest ", x.manifest ?? '(number pending)'] }), " ", _jsxs("span", { className: "muted", children: ["\u00B7 made by the app \u00B7 ", x.transfer_type ?? '', x.state === 'received' ? ' · received' : ''] })] }, x.id)), pending && !made.length && _jsxs("button", { className: "linkbtn", onClick: onToggle, children: [_jsx("span", { className: `pill ${!checks.length ? 'm-mute' : ok ? 'm-ok' : 'm-bad'}`, children: !checks.length ? 'METRC: not checked' : ok ? 'METRC: ready' : !bad.length ? 'METRC: check again (over an hour old)' : `METRC: ${bad.length} to fix` }), on === 'off' && _jsx("span", { className: "muted", children: " (done by hand in METRC)" }), " ", open ? '▴' : '▾'] }), open && checks.map(c => _jsxs("div", { className: "mlist", children: [_jsxs("div", { className: "muted small", children: ["From ", c.license, " \u00B7 checked ", new Date(c.checked_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })] }), c.checks.map(x => _jsxs("div", { className: x.ok ? '' : 'neg', children: [x.ok ? '✓' : '✗', " ", x.label, x.detail ? _jsxs("span", { className: x.ok ? 'muted' : '', children: [": ", x.detail] }) : null] }, x.key))] }, c.license))] });
}
/** type to find a stop: customers with ready orders first, then Lifted sites and labs, then everyone else */
function StopSearch({ ctx, customers, taken, onPick }) {
    const [q, setQ] = useState('');
    const [open, setOpen] = useState(false);
    const [hi, setHi] = useState(0);
    const ready = useMemo(() => {
        const m = new Map();
        for (const o of ctx.orders ?? [])
            if (o.state === 'ready' && !o.stop)
                m.set(o.customer_id, [...(m.get(o.customer_id) ?? []), o]);
        return m;
    }, [ctx.orders]);
    const ql = q.trim().toLowerCase();
    const group = (c) => ready.has(c.id) ? 0 : c.kind === 'internal' ? 1 : 2;
    const GROUP = ['Ready orders', 'Lifted sites and labs', 'Customers'];
    const shown = customers
        .filter(c => !taken.has(c.id) && (!ql || c.name.toLowerCase().includes(ql)))
        .sort((a, b) => group(a) - group(b) || (ql ? Number(!a.name.toLowerCase().startsWith(ql)) - Number(!b.name.toLowerCase().startsWith(ql)) : 0) || a.name.localeCompare(b.name))
        .slice(0, 60);
    const pick = (c) => { onPick(c.id); setQ(''); setHi(0); setOpen(false); };
    return (_jsxs("div", { className: "stopsearch", children: [_jsx("input", { value: q, placeholder: "+ Add a stop: type a customer or site", autoComplete: "off", role: "combobox", "aria-expanded": open, onFocus: () => { setOpen(true); setHi(0); }, onClick: () => setOpen(true), onBlur: () => setTimeout(() => setOpen(false), 150), onChange: e => { setQ(e.target.value); setOpen(true); setHi(0); }, onKeyDown: e => {
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setOpen(true);
                        setHi(i => Math.min(i + 1, shown.length - 1));
                    }
                    else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setHi(i => Math.max(i - 1, 0));
                    }
                    else if (e.key === 'Enter') {
                        e.preventDefault();
                        if (open && shown[hi])
                            pick(shown[hi]);
                    }
                    else if (e.key === 'Escape')
                        setOpen(false);
                } }), _jsx("button", { type: "button", className: "combo-arrow", tabIndex: -1, "aria-label": "Show stops", onMouseDown: e => { e.preventDefault(); setOpen(o => !o); }, children: "\u25BE" }), open && _jsxs("ul", { className: "stoplist", role: "listbox", children: [shown.length === 0 && _jsxs("li", { className: "none muted", children: ["No match", ql ? ` for "${q.trim()}"` : '', ". Customers are added in Sales \u203A Customers."] }), shown.map((c, i) => {
                        const os = ready.get(c.id) ?? [];
                        return _jsxs("li", { role: "option", "aria-selected": i === hi, className: i === hi ? 'hi' : '', onMouseEnter: () => setHi(i), onMouseDown: e => { e.preventDefault(); pick(c); }, children: [(i === 0 || group(shown[i - 1]) !== group(c)) && _jsx("div", { className: "sgroup", children: GROUP[group(c)] }), _jsxs("div", { className: "sname", children: [c.name, os.length > 0 && _jsxs("span", { className: "sready", children: [os.map(soOf).join(', '), " ready \u00B7 ", n0(os.reduce((a, o) => a + orderGot(o), 0)), " lbs"] })] })] }, c.id);
                    })] })] }));
}
function PositionSheet({ ctx, load, pos, items: raw, stops, onClose, onMove, onStack }) {
    const canEdit = editable(load);
    const items = [...raw].sort((a, b) => (b.layer ?? 1) - (a.layer ?? 1) || b.id - a.id); // top first
    return (_jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: "sheet form", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsxs("h2", { children: ["Position ", pos, items.length > 1 ? ` · stack of ${items.length}` : ''] }), _jsx("button", { className: "ghost", onClick: onClose, children: "\u2715" })] }), items.length > 1 && _jsx("p", { className: "muted small-note", children: "Top first. The top pallet comes off first, so it should be for the earliest stop." }), items.map((i, k) => {
                    const p = ctx.pallet(i.pallet_id);
                    if (!p)
                        return null;
                    return (_jsxs("div", { className: "mixline", children: [_jsxs("div", { className: "row between", children: [_jsxs("div", { children: [items.length > 1 && _jsx("span", { className: "tlayer", children: k === 0 ? 'top' : k === items.length - 1 ? 'bottom' : 'middle' }), " ", _jsx("a", { onClick: () => { onClose(); ctx.openPallet(p.id); }, children: _jsx("b", { children: p.code }) }), " ", label(ctx, p), " ", _jsxs("span", { className: "muted", children: ["\u00B7 ", lbs(ctx.weight(p))] })] }), (() => {
                                        // after the load left: the stop's outcome, not the truck plan
                                        const st = stops.find(x => x.id === i.stop_id);
                                        const spot = p.slot_id != null ? ctx.freezerSpot(p.slot_id) : 'Needs a spot';
                                        const here = p.status === 'in_freezer' || p.status === 'unslotted';
                                        // received at our site: where it is now (e.g. GVR Staging · 18); came back: same, marked back
                                        if (st?.status === 'delivered')
                                            return _jsx("span", { className: "pill s-delivered", children: here ? `✓ ${spot}` : 'Delivered' });
                                        if (load.status === 'delivered' && here)
                                            return _jsxs("span", { className: "pill s-back", children: ["\u21A9 ", spot] });
                                        return _jsx("span", { className: `pill ${i.loaded ? 's-in_transit' : 's-planning'}`, children: i.loaded ? 'On truck' : 'Planned' });
                                    })()] }), !i.loaded && _jsxs("div", { className: "muted", children: ["Pull from ", p.slot_id != null ? ctx.freezerSpot(p.slot_id) : ctx.where(p)] }), canEdit && (_jsxs("div", { className: "field", children: [_jsx("label", { children: "Stop" }), _jsx(Select, { value: i.stop_id, onChange: e => ctx.run(() => ctx.api.moveItem(i.id, null, +e.target.value, false), 'Stop changed'), children: stops.filter(s => s.status === 'pending').map(s => _jsxs("option", { value: s.id, children: [s.seq, ". ", ctx.customers.find(c => c.id === s.customer_id)?.name] }, s.id)) })] })), canEdit && (_jsxs("div", { className: "row", children: [!i.loaded && _jsx("button", { className: "primary", disabled: ctx.busy, onClick: async () => { if (await ctx.run(() => ctx.api.loadPallet(i.id), `${p.code} on the truck`))
                                            onClose(); }, children: "Pulled onto truck" }), _jsx("button", { className: "ghost", disabled: ctx.busy, onClick: () => { onClose(); ctx.openPallet(p.id); }, children: "Split, merge, weigh\u2026" }), _jsx("button", { className: "ghost", disabled: ctx.busy, onClick: () => onMove(i), children: "Move on truck" }), items.length > 1 && k > 0 && _jsx("button", { className: "ghost", disabled: ctx.busy, onClick: () => ctx.run(() => ctx.api.stackTop(i.id), `${p.code} on top`), children: "Put on top" }), !i.loaded
                                        ? _jsx("button", { className: "ghost", disabled: ctx.busy, onClick: async () => { if (await ctx.run(() => ctx.api.removeItem(i.id), `${p.code} removed from ${load.code}`))
                                                onClose(); }, children: "Remove from load" })
                                        : _jsx("button", { className: "ghost", disabled: ctx.busy, onClick: () => { onClose(); ctx.putBack(i, p); }, children: "Put back in a freezer" })] }))] }, i.id));
                }), canEdit && _jsx("div", { className: "row end", children: _jsx("button", { className: "ghost", onClick: onStack, children: "+ Stack a pallet here" }) })] }) }));
}
function PalletPicker({ ctx, load, stops, initialStop, position, free, onClose, pre, stack }) {
    const [stop, setStop] = useState(initialStop ?? (stops.length === 1 ? stops[0].id : null));
    const [q, setQ] = useState('');
    const [picked, setPicked] = useState(pre != null ? [pre] : []);
    const single = position != null;
    const results = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s)
            return [];
        return ctx.available.filter(p => [p.code, p.strain, p.package_tag].some(v => v?.toLowerCase().includes(s))
            || (p.kind === 'mixed' && ctx.contents(p.id).some(c => [c.code, c.strain].some(v => v?.toLowerCase().includes(s))))).slice(0, 40);
    }, [q, ctx.available]);
    const toggle = (id) => setPicked(x => x.includes(id) ? x.filter(y => y !== id) : single ? [id] : [...x, id]);
    const pickedW = picked.reduce((a, id) => { const p = ctx.pallet(id); return a + (p ? ctx.weight(p) : 0); }, 0);
    async function save() {
        let done = 0;
        const ok = await ctx.run(async () => {
            for (const id of picked) {
                await ctx.api.planPallet(load.id, stop, id, single ? position : null, !!stack);
                done++;
            }
            if (!single)
                await ctx.api.arrangeLoad(load.id);
        }, `${picked.length} pallet${picked.length === 1 ? '' : 's'} planned on ${load.code}`);
        if (ok || done)
            onClose();
    }
    return (_jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: "sheet form", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsx("h2", { children: single ? `${stack ? 'Stack on' : 'Add to'} position ${position}` : `Add pallets to ${load.code}` }), _jsx("button", { className: "ghost", onClick: onClose, children: "\u2715" })] }), pre != null && _jsxs("div", { className: "infobox", children: [ctx.pallet(pre)?.code, " isn't on ", load.code, " yet. Pick the stop and tap Add to load.", ctx.held(pre) ? ` It's held for ${ctx.held(pre)}.` : ''] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Stop" }), _jsx("div", { className: "choices", children: stops.map(s => _jsxs("button", { className: stop === s.id ? 'on' : '', style: { ['--sc']: stopColor(s.seq) }, onClick: () => setStop(s.id), children: [_jsx("span", { className: "stopnum", children: s.seq }), " ", ctx.customers.find(c => c.id === s.customer_id)?.name] }, s.id)) })] }), _jsxs("div", { className: "field", children: [_jsxs("label", { children: ["Find pallets ", !single && _jsxs("span", { className: "muted", children: ["(", free, " open position", free === 1 ? '' : 's', ")"] })] }), _jsxs("div", { className: "row tagrow", children: [_jsx("input", { className: "grow-in", value: q, onChange: e => setQ(e.target.value), placeholder: "Search strain, pallet # or tag", autoFocus: pre == null }), _jsx(ScanButton, { onScan: setQ })] }), (results.length > 0 || picked.length > 0) && (_jsx("div", { className: "picklist", children: [...picked.map(id => ctx.pallet(id)).filter(Boolean), ...results.filter(r => !picked.includes(r.id))].map(p => (_jsxs("label", { className: `pick ${picked.includes(p.id) ? 'on' : ''}`, children: [_jsx("input", { type: single ? 'radio' : 'checkbox', checked: picked.includes(p.id), onChange: () => toggle(p.id) }), _jsx("b", { children: p.code }), _jsxs("span", { children: [label(ctx, p), " \u00B7 ", lbs(ctx.weight(p)), p.origin_site ? _jsxs("span", { className: "muted", children: [" \u00B7 grown at ", p.origin_site] }) : null] }), _jsxs("span", { className: "muted", children: [ctx.where(p), ctx.held(p.id) ? _jsxs("span", { className: "warn-t", children: [" \u00B7 held for ", ctx.held(p.id)] }) : null] })] }, p.id))) })), q.trim() && results.length === 0 && _jsx("div", { className: "muted small-note", children: "Nothing available matches. Pallets already on a load, or packages on a mixed pallet, don't show here." }), _jsx("div", { className: "muted small-note", children: "A pallet held for an order can go to that customer, or to OHR/GVR on a transfer (it stays held)." })] }), picked.length > 0 && _jsxs("div", { className: "muted", children: [picked.length, " selected \u00B7 ", lbs(pickedW), !single && picked.length > free ? ` · only ${free} open position${free === 1 ? '' : 's'}: the rest get stacked two high, earlier stop on top` : ''] }), _jsx("p", { className: "muted small-note", children: "Need part of a pallet? Split it first (or build a mixed pallet), then add the new piece here." }), _jsxs("div", { className: "row end", children: [_jsx("button", { className: "ghost", onClick: onClose, children: "Cancel" }), _jsx("button", { className: "primary", disabled: !stop || !picked.length || ctx.busy, onClick: save, children: "Add to load" })] })] }) }));
}
/** From a pallet card: choose an open load and stop */
export function PickLoad({ ctx, ps, onClose }) {
    const label = ps.length === 1 ? ps[0].code : `${ps.length} pallets`;
    const open = ctx.loads.filter(editable);
    return (_jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: "sheet form", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsxs("h2", { children: ["Put ", label, " on a load"] }), _jsx("button", { className: "ghost", onClick: onClose, children: "\u2715" })] }), open.length === 0 && _jsx("p", { className: "muted", children: "No loads being planned. Create one in Transit first." }), open.map(l => {
                    const v = ctx.vehicles.find(x => x.id === l.vehicle_id);
                    return (_jsxs("div", { className: "mixline", children: [_jsxs("div", { children: [_jsx("b", { children: l.code }), " \u00B7 ", v?.name, " \u00B7 ", fmtDate(l.load_date)] }), _jsx("div", { className: "choices", children: ctx.stops.filter(s => s.load_id === l.id && s.status === 'pending').sort((a, b) => a.seq - b.seq).map(s => (_jsxs("button", { style: { ['--sc']: stopColor(s.seq) }, disabled: ctx.busy, onClick: async () => { if (await ctx.run(async () => { for (const p of ps)
                                        await ctx.api.planPallet(l.id, s.id, p.id, null, false); await ctx.api.arrangeLoad(l.id); }, `${label} planned on ${l.code}`))
                                        onClose(); }, children: [_jsx("span", { className: "stopnum", children: s.seq }), " ", ctx.customers.find(c => c.id === s.customer_id)?.name] }, s.id))) })] }, l.id));
                }), _jsxs("div", { className: "metrcnote", children: [_jsx("b", { children: "METRC" }), " At Depart each stop gets its METRC transfer manifest (to the customer or the other license): made by the app when Compliance has it switched on, otherwise on the METRC to-do list."] })] }) }));
}
/** Depart: when the truck actually leaves (default now; the night before for an early start) */
function DepartSheet({ l, pickup, n, metrcOn, busy, onClose, onGo }) {
    const local = (d) => { const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
    const [v, setV] = useState(local(new Date()));
    const at = new Date(v);
    const ok = !isNaN(at.getTime()) && at.getTime() > Date.now() - 12 * 3600000 && at.getTime() < Date.now() + 3 * 86400000;
    const later = ok && at.getTime() > Date.now() + 10 * 60000;
    const fmt = (d) => d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    return _jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: "sheet form", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsxs("h2", { children: [pickup ? 'Picked up' : 'Depart', " ", l.code] }), _jsx("button", { className: "ghost", onClick: onClose, children: "\u2715" })] }), _jsxs("p", { children: [pickup ? 'They are leaving' : 'Truck is leaving', " with ", n, " pallet", n === 1 ? '' : 's', "."] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Departure time" }), _jsx("input", { type: "datetime-local", value: v, onChange: e => setV(e.target.value) }), _jsxs("div", { className: "row", style: { gap: 6, marginTop: 6 }, children: [_jsx("button", { className: "ghost small", onClick: () => setV(local(new Date())), children: "Now" }), [5, 6, 7].map(h => {
                                    const d = new Date();
                                    d.setDate(d.getDate() + (new Date().getHours() >= h ? 1 : 0));
                                    d.setHours(h, 0, 0, 0);
                                    return _jsxs("button", { className: "ghost small", onClick: () => setV(local(d)), children: [d.getDate() !== new Date().getDate() ? 'Tomorrow ' : '', h, ":00 am"] }, h);
                                })] }), !ok && _jsx("div", { className: "warn-t small-note", children: "Pick a time between 12 hours ago and 3 days from now." })] }), _jsxs("div", { className: "metrcnote", children: [_jsx("b", { children: "What happens now" }), " ", metrcOn ? 'The METRC manifests are made right away' : 'The orders are marked shipped', metrcOn ? ` (estimated departure ${ok ? fmt(at) : '…'}), so you can print them tonight. The orders are marked shipped` : '', " and the invoices are made. ", !pickup && _jsxs(_Fragment, { children: ["Customer invoices go to QuickBooks at ", _jsx("b", { children: ok ? fmt(new Date(at.getTime() + 30 * 60000)) : '…' }), ", 30 minutes after departure."] }), later && _jsx(_Fragment, { children: " The load shows In transit from now; the pallets are on the truck." })] }), _jsxs("div", { className: "row end", children: [_jsx("button", { className: "ghost", onClick: onClose, children: "Cancel" }), _jsx("button", { className: "primary", disabled: busy || !ok, onClick: () => onGo(at), children: pickup ? 'Picked up' : later ? `Depart at ${fmt(at)}` : 'Depart now' })] })] }) });
}
