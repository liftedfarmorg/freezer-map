import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Select } from '../combo';
import { errText } from '../cult/ui';
// Compliance > Settings > METRC through T3: transfers and manifests, Phase 2 reasons, cutover dates per site.
const TYPES = [['internal', 'Between our licenses (OHR / GVR)'], ['customer', 'Customer manifests'], ['processor', 'Out to a drying processor'], ['nursery', 'Nursery clones out (1PN)']];
export function T3More({ c, conn, set, save }) {
    const [drivers, setDrivers] = useState([]);
    const [trucks, setTrucks] = useState([]);
    const [text, setText] = useState({});
    // phone for questions per license (202)
    const [lics, setLics] = useState([]);
    const [ph, setPh] = useState({});
    const loadLics = () => c.api.sb.from('licenses').select('license_no,site,kind,metrc_phone').eq('active', true).order('sort').then(r => setLics((r.data ?? [])));
    const savePhone = async (l) => {
        const v = ph[l];
        if (v === undefined)
            return;
        const cur = lics.find(x => x.license_no === l)?.metrc_phone ?? '';
        if (v.trim() !== cur) {
            const { error } = await c.api.sb.rpc('set_license_phone', { p_license: l, p_phone: v });
            if (error)
                c.flash(errText(error), true);
            else {
                c.flash(`Phone for ${l} saved`);
                await loadLics();
            }
        }
        setPh(x => { const n = { ...x }; delete n[l]; return n; });
    };
    useEffect(() => {
        loadLics();
        c.api.sb.from('fleet_drivers').select('id,name,license_no').eq('active', true).is('carrier_id', null).order('name').then(r => setDrivers(r.data ?? []));
        c.api.sb.from('fleet_assets').select('id,name,make,model,plate').in('kind', ['vehicle', 'trailer']).neq('status', 'retired').order('name').then(r => setTrucks(r.data ?? []));
    }, []);
    const tr = conn?.transfer ?? {};
    const types = [...new Map(Object.values(tr).flatMap(x => x.types).map(t => [t.name, t])).values()].sort((a, b) => a.name.localeCompare(b.name));
    const reasons = [...new Set(Object.values(conn?.reasons ?? {}).flat().map(r => r.name))].sort();
    const val = (k) => text[k] ?? set[k] ?? '';
    const blur = async (k) => { if (text[k] !== undefined && text[k] !== (set[k] ?? '')) {
        try {
            await save(k, text[k]);
        }
        catch (e) {
            c.flash(errText(e), true);
        }
    } setText(t => { const n = { ...t }; delete n[k]; return n; }); };
    const inp = (k, ph) => _jsx("input", { value: val(k), placeholder: ph, disabled: !c.isAdmin, onChange: e => setText(t => ({ ...t, [k]: e.target.value })), onBlur: () => blur(k) });
    return _jsxs(_Fragment, { children: [_jsx("h3", { style: { marginTop: 14 }, children: "Transfers and manifests" }), _jsx("p", { className: "muted small", children: "No prices go on manifests, so pick types that aren't Wholesale. The transporter is our C13, or the carrier's own license when the truck belongs to a carrier that has one (Vehicles > Carriers). Types come from METRC when you test the connection." }), _jsxs("div", { className: "grid2", children: [TYPES.map(([k, l]) => {
                        const key = `comp.metrc_ttype_${k}`;
                        const v = set[key] ?? '';
                        return _jsxs("div", { className: "field", children: [_jsx("label", { children: l }), types.length ? _jsxs(Select, { value: v, disabled: !c.isAdmin, onChange: e => save(key, e.target.value), children: [_jsx("option", { value: "", children: "Pick\u2026" }), types.map(t => _jsxs("option", { value: t.name, disabled: t.wholesale, children: [t.name, t.wholesale ? ' (wholesale: needs prices)' : ''] }, t.name))] })
                                    : _jsxs("span", { className: "muted small", children: [v || 'not set', " (test the connection first)"] })] }, k);
                    }), _jsxs("div", { className: "field", children: [_jsxs("label", { children: ["Phone for questions ", _jsx("span", { className: "muted", children: "(if a license below has none)" })] }), inp('comp.metrc_phone', Object.values(tr)[0]?.phone ?? '(831) …')] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Hours on the road (arrival estimate)" }), inp('comp.metrc_transit_hours', '3')] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Runs without a load (processor, nursery): driver" }), _jsxs(Select, { value: set['comp.metrc_proc_driver'] ?? '', disabled: !c.isAdmin, onChange: e => save('comp.metrc_proc_driver', e.target.value), children: [_jsx("option", { value: "", children: "Pick\u2026" }), drivers.map(d => _jsxs("option", { value: d.name, children: [d.name, d.license_no ? '' : ' (no DL # yet)'] }, d.id))] })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Runs without a load: truck" }), _jsxs(Select, { value: set['comp.metrc_proc_vehicle'] ?? '', disabled: !c.isAdmin, onChange: e => save('comp.metrc_proc_vehicle', e.target.value), children: [_jsx("option", { value: "", children: "Pick\u2026" }), trucks.map(t => _jsxs("option", { value: String(t.id), children: [t.name, t.make && t.model && t.plate ? '' : ' (needs make / model / plate)'] }, t.id))] })] })] }), _jsx("h4", { style: { marginTop: 10 }, children: "Phone for questions, by license" }), _jsx("p", { className: "muted small", children: "Goes on every METRC manifest from that license." }), _jsx("div", { className: "grid2", children: lics.map(l => _jsxs("div", { className: "field", children: [_jsxs("label", { children: [l.site ? `${l.site} ` : '', l.kind, " \u00B7 ", l.license_no] }), _jsx("input", { type: "tel", value: ph[l.license_no] ?? l.metrc_phone ?? '', disabled: !c.isAdmin, placeholder: "831-555-0100", onChange: e => setPh(x => ({ ...x, [l.license_no]: e.target.value })), onBlur: () => savePhone(l.license_no) })] }, l.license_no)) }), Object.keys(tr).length > 0 && _jsxs("p", { className: "muted small", children: ["Drivers METRC knows: ", [...new Set(Object.values(tr).flatMap(x => x.drivers))].join(', ') || 'none', " \u00B7 Vehicles: ", [...new Set(Object.values(tr).flatMap(x => x.vehicles))].join(', ') || 'none', ". The app uses METRC's employee ID for a driver whose name matches; otherwise the driver's license number from Compliance > Vehicles."] }), _jsx("h3", { style: { marginTop: 14 }, children: "METRC tags" }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: (set['comp.tag_autofill'] ?? 'true') === 'true', disabled: !c.isAdmin, onChange: e => save('comp.tag_autofill', e.target.checked ? 'true' : 'false') }), " ", _jsxs("span", { children: ["Autofill the next available tag ", _jsx("span", { className: "muted", children: "(new tag boxes start filled in; suggestions show either way)" })] })] }), _jsx("p", { className: "muted small", children: "Tags come from METRC's available list for each license (pulled nightly, or Admin \u203A Settings \u203A Licenses \u203A Pull tags from METRC). Ranges blocked off for a purpose there are kept for that purpose." }), _jsx("h3", { style: { marginTop: 14 }, children: "Plants and harvests (Phase 2)" }), _jsxs("div", { className: "grid2", children: [_jsxs("div", { className: "field", children: [_jsx("label", { children: "Used up (Remove) reason" }), reasons.length ? _jsxs(Select, { value: reasons.find(n => n.toLowerCase() === (set['comp.metrc_reason_used'] ?? '').toLowerCase()) ?? '', disabled: !c.isAdmin, onChange: e => save('comp.metrc_reason_used', e.target.value), children: [_jsx("option", { value: "", children: "Pick\u2026" }), reasons.map(n => _jsx("option", { value: n, children: n }, n))] }) : inp('comp.metrc_reason_used')] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Lost clones (clone package adjustment reason)" }), reasons.length ? _jsxs(Select, { value: reasons.find(n => n.toLowerCase() === (set['comp.metrc_plant_adjust_reason'] ?? '').toLowerCase()) ?? '', disabled: !c.isAdmin, onChange: e => save('comp.metrc_plant_adjust_reason', e.target.value), children: [_jsx("option", { value: "", children: "Pick\u2026" }), reasons.map(n => _jsx("option", { value: n, children: n }, n))] }) : inp('comp.metrc_plant_adjust_reason')] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Destroying immature plants (waste reason, as METRC names it)" }), inp('comp.metrc_plant_waste_reason', 'e.g. Male Plants / Died')] }), _jsxs("div", { className: "field", children: [_jsxs("label", { children: ["Harvest waste type ", _jsx("span", { className: "muted", children: "(blank = METRC's first)" })] }), inp('comp.metrc_waste_type', 'e.g. Plant Material')] }), _jsxs("div", { className: "field", children: [_jsxs("label", { children: ["Hours after Finish: record harvest waste ", _jsx("span", { className: "muted", children: "(0 = right away)" })] }), inp('comp.metrc_waste_hours', '48')] }), _jsxs("div", { className: "field", children: [_jsxs("label", { children: ["Hours after Finish: finish the harvest in METRC ", _jsx("span", { className: "muted", children: "(0 = right away)" })] }), inp('comp.metrc_finish_hours', '48')] })] }), _jsx("p", { className: "muted small", children: "Counted from when Finish is pressed in the app. A change applies to harvests finished after it; to-dos already waiting keep their time. Send on a to-do sends it right away. The finish never goes before its waste." }), _jsx("h3", { style: { marginTop: 14 }, children: "Cutover per site" }), _jsx("p", { className: "muted small", children: "Plant, nursery and harvest to-dos only go to METRC from a site's cutover date on. Before that (or with no date) they stay by hand, even if the kind is on." }), _jsx("div", { className: "grid2", children: ['OHR', 'GVR', '1PN'].map(s => {
                    const key = `comp.metrc_cutover_${s}`;
                    return _jsxs("div", { className: "field", children: [_jsx("label", { children: s }), _jsx("input", { type: "date", value: set[key] ?? '', disabled: !c.isAdmin, onChange: e => save(key, e.target.value) })] }, s);
                }) })] });
}
