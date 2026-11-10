import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// Stage at OHR (SQL 197): OHR can't receive GVR product in METRC, so GVR pallets for a customer order go to OHR in the app
// only, and the METRC manifest runs from GVR straight to the customer. Made at staging with the staging driver and truck,
// updated to the load's driver, truck and times at Depart. Staged pallets that aren't going anywhere get a red alert.
import { useCallback, useEffect, useState } from 'react';
import { Select } from './combo';
import { metrcRun, openMetrcManifest } from './metrcCall';
const fmt = (s) => s ? new Date(s + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return ymd(d); };
/** whether staging is on, and what's staged now (with problems) */
export function useStages(sb) {
    const [on, setOn] = useState(false);
    const [stages, setStages] = useState([]);
    const refresh = useCallback(async () => {
        if (!sb)
            return;
        const { data, error } = await sb.rpc('gvr_stage_list');
        if (error) {
            setOn(false);
            setStages([]);
            return;
        } // 197 not run yet
        const d = data;
        setOn(!!d?.on);
        setStages(d?.stages ?? []);
    }, [sb]);
    useEffect(() => { refresh(); }, [refresh]);
    return { on, stages, refresh };
}
async function act(sb, body, flash, ok) {
    const r = await metrcRun(sb, body);
    if (r.ok === false || r.error) {
        flash(r.error ?? 'METRC didn\'t take it', true);
        return r;
    }
    flash(`${ok(r)}${r.live === false ? ' (METRC dry run: nothing sent)' : ''}`);
    return r;
}
/** red alerts for staged pallets that aren't going anywhere, and the list of what's staged (with the manifest) */
export function StageAlerts({ sb, stages, refresh, flash, openLoad, onlyProblems, orderId, onChanged }) {
    const [busy, setBusy] = useState(false);
    const mine = orderId != null ? stages.filter(s => s.order_id === orderId) : stages;
    const bad = mine.filter(s => s.problem);
    const fine = onlyProblems ? [] : mine.filter(s => !s.problem);
    if (!sb || (!bad.length && !fine.length))
        return null;
    const run = async (body, ok) => {
        setBusy(true);
        try {
            await act(sb, body, flash, ok);
            await refresh();
            await onChanged?.();
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
        finally {
            setBusy(false);
        }
    };
    const pdf = (s) => openMetrcManifest(sb, s.license, s.manifest).catch(e => flash(String(e.message ?? e), true));
    const row = (s) => (_jsxs("div", { className: "drow", children: [_jsxs("span", { className: "grow", children: [_jsx("b", { children: s.code }), " ", _jsxs("span", { className: "muted", children: [s.customer, s.so ? ` · ${s.so}` : '', s.load ? ` · ${s.load}` : '', " \u00B7 ships ", fmt(s.ship_date), s.manifest ? ` · manifest ${s.manifest}` : ''] }), s.problem && _jsxs(_Fragment, { children: [_jsx("br", {}), _jsx("span", { className: "bad-t", children: s.problem })] })] }), s.manifest && _jsx("button", { className: "ghost small", onClick: () => pdf(s), children: "Manifest PDF" }), s.load_id != null && openLoad && _jsx("button", { className: "ghost small", onClick: () => openLoad(s.load_id), children: "Open load" }), s.other_load && _jsxs("button", { className: "ghost small", disabled: busy, onClick: () => run({ action: 'stage_relink', stage_id: s.id }, r => `${s.code} now ships on ${r.load ?? s.other_load.load}`), children: ["Use ", s.other_load.load] }), _jsx("button", { className: `${s.problem ? 'primary' : 'ghost'} small`, disabled: busy, onClick: () => {
                    if (window.confirm(`Move ${s.code} back to GVR? Its METRC manifest is voided (or updated, if other staged pallets stay on it). Bring it back to GVR today.`))
                        run({ action: 'unstage', stage_id: s.id }, () => `${s.code} is back at GVR in the app. Bring it back.`);
                }, children: "Move back to GVR" })] }, s.id));
    return (_jsxs("section", { className: "dcard stagebox", children: [bad.length > 0 && _jsxs("div", { className: "stagebad", children: [_jsxs("b", { children: ["GVR product at OHR with nowhere to go (", bad.length, ")"] }), _jsx("div", { className: "small-note", children: "These are on a live METRC manifest from GVR, sitting at OHR. Put each on a load to its customer, or move it back to GVR today." })] }), _jsx("div", { className: "dlist", children: bad.map(row) }), fine.length > 0 && _jsxs(_Fragment, { children: [_jsxs("div", { className: "muted small-note", children: ["Staged at OHR (GVR license, manifest straight to the customer)", orderId != null ? '' : ` · ${fine.length}`] }), _jsx("div", { className: "dlist", children: fine.map(row) })] })] }));
}
/** Stage at OHR on an order: truck, driver, ship date and the load */
export function StageForm({ sb, o, gvr, loads, stops, customers, vehicles, drivers, busy, setBusy, close, flash, done }) {
    const vs = vehicles.filter(v => v.active && v.kind !== 'Customer pickup').sort((a, b) => Number(a.carrier_id != null) - Number(b.carrier_id != null) || a.name.localeCompare(b.name));
    const ds = drivers.filter(d => d.active).sort((a, b) => Number(a.carrier_id != null) - Number(b.carrier_id != null) || a.name.localeCompare(b.name));
    const [v, setV] = useState(vs[0]?.id ?? null);
    const [driver, setDriver] = useState('');
    const [date, setDate] = useState(o.wanted_date && o.wanted_date > ymd(new Date()) ? o.wanted_date : tomorrow());
    // the load: the order's own if it's on one; else the open one to this customer on that date (or one you pick), else a new draft
    const hasCust = (l) => stops.some(s => s.load_id === l.id && s.customer_id === o.customer_id && s.status === 'pending');
    const open = loads.filter(l => (l.status === 'planning' || l.status === 'loading') && hasCust(l)).sort((a, b) => a.load_date.localeCompare(b.load_date));
    const auto = open.find(l => l.load_date === date) ?? null;
    const [pick, setPick] = useState('auto');
    const chosen = o.stop ? null : pick === 'auto' ? auto : open.find(l => l.id === pick) ?? null;
    const cust = customers.find(c => c.id === o.customer_id);
    const go = async () => {
        setBusy(true);
        try {
            const r = await act(sb, { action: 'stage', order_id: o.id, vehicle_id: v, driver: driver.trim(), ship_date: date, load_id: o.stop ? null : chosen?.id ?? null }, flash, r => `${r.staged} pallet${r.staged === 1 ? '' : 's'} staged on ${r.load}. METRC manifest ${r.manifests?.find(m => m.manifest)?.manifest ?? ''} from GVR to ${o.customer}: open it from Staged at OHR.`);
            if (r.ok !== false && !r.error) {
                await done();
                close();
            }
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
        finally {
            setBusy(false);
        }
    };
    return (_jsxs("div", { className: "dlist stageform", children: [_jsxs("div", { className: "row between", children: [_jsxs("b", { children: ["Stage at OHR (", gvr, " pallet", gvr === 1 ? '' : 's', " at GVR)"] }), _jsx("button", { className: "ghost small", onClick: close, children: "Cancel" })] }), _jsxs("p", { className: "muted small-note", children: ["OHR can't receive GVR product in METRC. The pallets move to OHR in the app only, and the METRC manifest goes from GVR straight to ", o.customer, cust?.license ? ` (${cust.license})` : '', ", made now with this driver and truck so they have it before leaving GVR. When the load departs, the manifest is updated to the load's driver, truck and times."] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Truck taking it to OHR" }), _jsx(Select, { value: v ?? '', onChange: e => setV(Number(e.target.value)), children: vs.map(x => _jsxs("option", { value: x.id, children: [x.name, x.plate ? ` · ${x.plate}` : '', x.carrier_id != null ? ` · ${x.owner ?? 'outside'}` : ''] }, x.id)) })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Driver" }), _jsx("input", { list: "stage-drivers", value: driver, onChange: e => setDriver(e.target.value), placeholder: "Pick a driver" }), _jsx("datalist", { id: "stage-drivers", children: ds.map(d => _jsx("option", { value: d.name }, d.id)) })] }), o.stop
                ? _jsxs("div", { className: "okbox", children: ["Ships on ", _jsx("b", { children: o.stop.load }), " (", fmt(o.stop.load_date), "), the load this order is already on."] })
                : _jsxs(_Fragment, { children: [_jsxs("div", { className: "field", children: [_jsx("label", { children: "Ship date (on the manifest)" }), _jsx("input", { type: "date", value: date, min: ymd(new Date()), onChange: e => setDate(e.target.value) })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Load" }), _jsxs(Select, { value: String(pick), onChange: e => setPick(e.target.value === 'auto' ? 'auto' : Number(e.target.value)), children: [_jsx("option", { value: "auto", children: auto ? `${auto.code} (${fmt(auto.load_date)}, already going to ${o.customer})` : `New draft load to ${o.customer} on ${fmt(date)}` }), open.filter(l => l.id !== auto?.id).map(l => _jsxs("option", { value: l.id, children: [l.code, " (", fmt(l.load_date), ")"] }, l.id))] })] }), chosen && chosen.load_date !== date && _jsxs("p", { className: "warn-t small-note", children: [chosen.code, " is on ", fmt(chosen.load_date), ": that's the ship date that goes on the manifest."] })] }), _jsx("div", { className: "row end", children: _jsx("button", { className: "primary", disabled: busy || v == null || !driver.trim(), onClick: go, children: "Stage and make the METRC manifest" }) })] }));
}
/** the red alerts on their own (Transit / loads list) */
export function StageAlertsAuto({ sb, flash, openLoad, onChanged }) {
    const st = useStages(sb);
    return _jsx(StageAlerts, { sb: sb, stages: st.stages, refresh: st.refresh, flash: flash, openLoad: openLoad, onlyProblems: true, onChanged: onChanged });
}
