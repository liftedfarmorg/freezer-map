import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { FleetApi } from './api';
import { AddDocsSheet, DropZone, Expiry, FileChip, SITES, daysTo, fmtD, today } from '../comp/files';
import { Choices, DateIn, F, NumIn, Pick, SaveBar, Sheet, TextIn, errText } from '../cult/ui';
import { Card, DashHead, Empty, Tile, Tiles } from '../dash';
import { t } from '../i18n';
import { reportPdf } from './pdf';
import './fleet.css';
// Vehicles and equipment.
//  - Compliance › Vehicles: the list, insurance and registrations (with expiry → Deadlines), every report, closing defects and incidents.
//  - Each department module's Vehicles / Equipment screen and the Driver module (CrewFleet): file an inspection, maintenance
//    or incident report from a phone, with photos. Everyone in the department can inspect its equipment (Msg #248).
export const KIND_L = { vehicle: 'Vehicle', trailer: 'Trailer', equipment: 'Equipment' };
export const LOG_L = { maintenance: 'Maintenance', inspection: 'Inspection', incident: 'Incident' };
const RESULT_L = { pass: 'Passed', defects: 'Defects found', out_of_service: 'Out of service' };
const STATUS_L = { active: 'In service', out_of_service: 'Out of service', retired: 'Retired' };
const DOC_KINDS = [{ key: 'insurance', l: 'Insurance', add: 'Add insurance policy' }, { key: 'transport', l: 'Registration', add: 'Add registration' }];
const who = (e) => (e ?? '').split('@')[0];
const n0 = (x) => (x == null ? '' : Math.round(Number(x)).toLocaleString());
export const assetName = (a) => (a ? `${a.unit_no ? `${a.unit_no} · ` : ''}${a.name}` : '');
const reading = (a) => (a?.kind === 'vehicle' ? 'odometer' : 'hours');
function useFleet(sb) {
    const api = useMemo(() => (sb ? new FleetApi(sb) : null), [sb]);
    const [d, setD] = useState(null);
    const [err, setErr] = useState(null);
    const load = async () => { if (!api)
        return; try {
        setD(await api.data());
        setErr(null);
    }
    catch (e) {
        setErr(errText(e));
    } };
    useEffect(() => { load(); }, [api]);
    return { api, d, err, load };
}
/** insurance / registration status for one asset: ok, expiring, expired or missing */
function paperOf(a, key) {
    const ds = a.docs.filter(x => x.doc_type === key);
    if (!ds.length)
        return { tone: a.kind === 'equipment' ? 'cp-mute' : 'cp-warn', text: 'none', d: null };
    const exp = ds.map(x => x.expires_on).filter((x) => !!x).sort().pop() ?? null;
    const n = daysTo(exp);
    return { tone: n == null ? 'cp-ok' : n < 0 ? 'cp-bad' : n <= 60 ? 'cp-warn' : 'cp-ok', text: exp ? (n < 0 ? `expired ${fmtD(exp)}` : `to ${fmtD(exp)}`) : 'on file', d: exp };
}
function inspDue(a) {
    if (!a.inspect_every_days || a.status === 'retired')
        return null;
    const base = a.last_inspection ?? null;
    if (!base)
        return 0;
    return (daysTo(base) ?? 0) + a.inspect_every_days;
}
// =====================================================================================================
// Top bar › Vehicles: for everyone on staff
// =====================================================================================================
/** Inspections, maintenance and incidents for one department (its module's Vehicles / Equipment screen, and the Driver module).
 *  Everyone in the department can inspect its vehicles and equipment; company-wide ones show in every department. (Msg #248) */
export function CrewFleet({ sb, flash, dept, title, driver }) {
    const { api, d, err, load } = useFleet(sb);
    const [rep, setRep] = useState(null);
    const h = title ?? t('Vehicles and equipment');
    if (!api)
        return _jsxs("div", { className: "list", children: [_jsx("h2", { children: h }), _jsx("p", { className: "muted", children: t('Needs the database (not in the demo).') })] });
    if (err)
        return _jsxs("div", { className: "list", children: [_jsx("h2", { children: h }), _jsx("div", { className: "warnbox", children: err })] });
    if (!d)
        return _jsxs("div", { className: "list", children: [_jsx("h2", { children: h }), _jsx("p", { className: "muted", children: t('Loading…') })] });
    const mineIds = new Set(d.drivers.filter(x => x.email && x.email === d.me).flatMap(x => x.asset_ids));
    const inScope = (a) => a.carrier_id == null && a.body_type !== 'Customer pickup' && (!dept || a.department === dept || a.department === 'company' || mineIds.has(a.id));
    const ids = new Set(d.assets.filter(inScope).map(a => a.id));
    const mine = d.logs.filter(l => l.created_by === d.me).slice(0, 20);
    const open = d.logs.filter(l => l.status === 'open' && (l.asset_id == null || ids.has(l.asset_id)));
    const dueNow = d.assets.filter(a => inScope(a) && a.status === 'active' && (inspDue(a) ?? 99) <= 0).sort((a, b) => Number(mineIds.has(b.id)) - Number(mineIds.has(a.id)));
    const list = d.assets.filter(a => inScope(a) && a.status !== 'retired').sort((a, b) => Number(mineIds.has(b.id)) - Number(mineIds.has(a.id)) || assetName(a).localeCompare(assetName(b)));
    return _jsxs("div", { className: "list fleet comp", children: [_jsx("h2", { children: h }), _jsx("p", { className: "muted", children: driver ? t('Your trucks first. Inspect before you go, and report anything wrong. Photos help.') : t('File a report from your phone. Photos help.') }), _jsxs("div", { className: "fbig", children: [_jsxs("button", { className: "fbtn", onClick: () => setRep({ kind: 'inspection' }), children: [_jsx("b", { children: t('Inspection') }), _jsx("span", { children: t('Pre-trip or equipment check') })] }), _jsxs("button", { className: "fbtn", onClick: () => setRep({ kind: 'maintenance' }), children: [_jsx("b", { children: t('Maintenance') }), _jsx("span", { children: t('Service, repair, oil change') })] }), _jsxs("button", { className: "fbtn bad", onClick: () => setRep({ kind: 'incident' }), children: [_jsx("b", { children: t('Report an incident') }), _jsx("span", { children: t('Accident, damage, injury, near miss') })] })] }), dueNow.length > 0 && _jsxs("section", { className: "dcard", children: [_jsx("h3", { children: t('Inspection due') }), _jsx("div", { className: "dlist", children: dueNow.map(a => _jsxs("button", { className: "drow linkrow", onClick: () => setRep({ kind: 'inspection', asset_id: a.id }), children: [_jsxs("span", { className: "grow", children: [_jsx("b", { children: assetName(a) }), " ", _jsx("span", { className: "muted", children: a.site ?? '' })] }), _jsx("span", { className: "pill cp-warn", children: a.last_inspection ? t('last {d}', { d: fmtD(a.last_inspection) }) : t('never') })] }, a.id)) })] }), open.length > 0 && _jsxs("section", { className: "dcard", children: [_jsx("h3", { children: t('Open items') }), _jsx(LogList, { d: d, logs: open, onOpen: l => setRep(l) })] }), dept && _jsxs("section", { className: "dcard", children: [_jsx("h3", { children: driver ? t('Trucks and trailers') : t('Vehicles and equipment') }), list.length ? _jsx("div", { className: "dlist", children: list.map(a => {
                            const di = inspDue(a);
                            return _jsxs("button", { className: "drow linkrow", onClick: () => setRep({ kind: 'inspection', asset_id: a.id }), children: [_jsxs("span", { className: "grow", children: [mineIds.has(a.id) ? '★ ' : '', _jsx("b", { children: assetName(a) }), " ", _jsx("span", { className: "muted", children: [a.body_type ?? t(KIND_L[a.kind]), a.site, a.department === 'company' ? t('company-wide') : ''].filter(Boolean).join(' · ') })] }), a.status === 'out_of_service' ? _jsx("span", { className: "pill cp-bad", children: t('Out of service') }) : di != null ? _jsx("span", { className: `pill ${di <= 0 ? 'cp-warn' : 'cp-ok'}`, children: di <= 0 ? t('inspection due') : t('inspect in {n}d', { n: di }) }) : null] }, a.id);
                        }) }) : _jsx("p", { className: "muted", children: t('Nothing listed for this department yet. Admins add them in Settings › Vehicles.') })] }), _jsxs("section", { className: "dcard", children: [_jsx("h3", { children: t('My reports') }), mine.length ? _jsx(LogList, { d: d, logs: mine, onOpen: l => setRep(l) }) : _jsx("p", { className: "muted", children: t('Nothing yet.') })] }), rep && _jsx(ReportSheet, { api: api, d: d, x0: rep, flash: flash, only: dept ? ids : undefined, onClose: () => setRep(null), onSaved: async (m) => { setRep(null); await load(); flash(m); } })] });
}
// =====================================================================================================
// Compliance › Vehicles
// =====================================================================================================
export const DEPT_L = { distribution: 'Distribution', cultivation: 'Cultivation', nursery: 'Nursery', processing: 'Processing', company: 'Company-wide' };
const DEPTS = ['distribution', 'cultivation', 'nursery', 'processing', 'company'];
/** Compliance › Vehicles (everything), or one department's Settings › Vehicles (dept set: only theirs, no paperwork) */
export function CompFleet({ sb, flash, dept }) {
    const { api, d, err, load } = useFleet(sb);
    const [tab, setTab] = useState('assets');
    const [asset, setAsset] = useState(null);
    const [driver, setDriver] = useState(null);
    const [carrier, setCarrier] = useState(null);
    const [rep, setRep] = useState(null);
    const [kind, setKind] = useState('all');
    const [depF, setDepF] = useState('all');
    const [openOnly, setOpenOnly] = useState(false);
    const [q, setQ] = useState('');
    const [retired, setRetired] = useState(false);
    const title = dept ? `${DEPT_L[dept]} vehicles` : 'Vehicles';
    if (!api)
        return _jsxs("div", { className: "list", children: [_jsx("h2", { children: title }), _jsx("p", { className: "muted", children: "Needs the database (not in the demo)." })] });
    if (err)
        return _jsxs("div", { className: "list", children: [_jsx("h2", { children: title }), _jsx("div", { className: "warnbox", children: err })] });
    if (!d)
        return _jsxs("div", { className: "list", children: [_jsx("h2", { children: title }), _jsx("p", { className: "muted", children: "Loading\u2026" })] });
    const ql = q.trim().toLowerCase();
    const has = (xs) => !ql || xs.some(x => String(x ?? '').toLowerCase().includes(ql));
    const ours = d.assets.filter(a => a.carrier_id == null && (!dept || a.department === dept));
    const live = ours.filter(a => a.status !== 'retired');
    const paperIssues = live.filter(a => a.kind !== 'equipment' && DOC_KINDS.some(k => paperOf(a, k.key).tone !== 'cp-ok'));
    const openDef = d.logs.filter(l => l.status === 'open' && l.kind === 'inspection');
    const openInc = d.logs.filter(l => l.status === 'open' && l.kind === 'incident');
    const out = live.filter(a => a.status === 'out_of_service');
    const due = live.filter(a => (inspDue(a) ?? 99) <= 0);
    const assets = ours.filter(a => (retired || a.status !== 'retired') && (dept || depF === 'all' || a.department === depF)
        && has([a.name, a.unit_no, a.plate, a.vin, a.make, a.model, a.site, a.body_type, ...d.drivers.filter(x => a.driver_ids.includes(x.id)).map(x => x.name)]));
    const drivers = d.drivers.filter(x => x.carrier_id == null && (!dept || x.department === dept) && (retired || x.active) && has([x.name, x.phone, x.email]));
    const carriers = d.carriers.filter(c => (retired || c.active) && has([c.name, c.contact_name, c.phone, c.license_no]));
    const logs = d.logs.filter(l => (kind === 'all' || l.kind === kind) && (!openOnly || l.status === 'open')
        && (!dept || ours.some(a => a.id === l.asset_id))
        && has([l.summary, assetName(d.assets.find(a => a.id === l.asset_id)), l.created_by, l.vendor]));
    const myDepts = d.my_depts;
    const canAdd = dept ? myDepts.includes(dept) : myDepts.length > 0;
    const showCarriers = !dept || dept === 'distribution';
    const tabs = [['assets', 'Vehicles & equipment'], ['drivers', 'Drivers'], ...(showCarriers ? [['carriers', 'Outside carriers']] : []), ['reports', 'Reports']];
    return _jsxs("div", { className: `list fleet comp ${dept ? 'deptfleet' : ''}`, children: [dept ? _jsxs(_Fragment, { children: [_jsx("h2", { children: title }), _jsxs("p", { className: "muted", children: [DEPT_L[dept], "'s vehicles, equipment and drivers. Same list as Compliance \u203A Vehicles, where Compliance keeps the insurance and registrations."] })] })
                : _jsx(DashHead, { title: "Vehicles and equipment", sub: "Every company vehicle and piece of equipment by department, our drivers, outside carriers, and reports" }), !dept && _jsxs(Tiles, { children: [_jsx(Tile, { value: live.length, label: "Vehicles and equipment", sub: DEPTS.map(x => [x, live.filter(a => a.department === x).length]).filter(([, n]) => n).map(([x, n]) => `${n} ${DEPT_L[x].toLowerCase()}`).join(' · ') || 'none yet', onClick: () => { setTab('assets'); setQ(''); } }), _jsx(Tile, { value: out.length, label: "Out of service", tone: out.length ? 'bad' : 'ok', sub: out.map(a => a.unit_no ?? a.name).join(', ') || 'none', onClick: () => setTab('assets') }), _jsx(Tile, { value: openDef.length, label: "Open defects", sub: "from inspections", tone: openDef.length ? 'warn' : 'ok', onClick: () => { setTab('reports'); setKind('inspection'); setOpenOnly(true); } }), _jsx(Tile, { value: openInc.length, label: "Open incidents", sub: "to follow up", tone: openInc.length ? 'warn' : 'ok', onClick: () => { setTab('reports'); setKind('incident'); setOpenOnly(true); } }), _jsx(Tile, { value: paperIssues.length, label: "Insurance / registration", sub: "missing, expiring or expired", tone: paperIssues.length ? 'warn' : 'ok', onClick: () => setTab('assets') }), _jsx(Tile, { value: d.drivers.filter(x => x.active && x.carrier_id == null).length, label: "Our drivers", sub: `${d.drivers.filter(x => x.active && x.carrier_id == null && !x.has_login).length} not on the app yet`, onClick: () => setTab('drivers') }), _jsx(Tile, { value: d.carriers.filter(c => c.active).length, label: "Outside carriers", sub: `${d.carriers.filter(c => c.active && (!c.license_expires || (daysTo(c.license_expires) ?? 0) < 30)).length} license missing or expiring`, onClick: () => setTab('carriers') }), _jsx(Tile, { value: due.length, label: "Inspection due", sub: "by each one's schedule", tone: due.length ? 'warn' : 'ok', onClick: () => setTab('assets') })] }), _jsxs("div", { className: "row toolbar wrap", children: [_jsx("div", { className: "seg", children: tabs.map(([k, l]) => _jsx("button", { className: tab === k ? 'on' : '', onClick: () => setTab(k), children: l }, k)) }), _jsx("input", { className: "search", type: "search", placeholder: "Search", value: q, onChange: e => setQ(e.target.value) }), tab === 'assets' && canAdd && _jsx("button", { className: "primary", onClick: () => setAsset({ kind: 'vehicle', status: 'active', checklist: 'vehicle', department: dept ?? (depF !== 'all' ? depF : myDepts[0]) }), children: "+ Add" }), tab === 'drivers' && canAdd && _jsx("button", { className: "primary", onClick: () => setDriver({ active: true, department: dept ?? (myDepts.includes('distribution') ? 'distribution' : myDepts[0]) }), children: "+ Driver" }), tab === 'carriers' && d.carrier_admin && _jsx("button", { className: "primary", onClick: () => setCarrier({ active: true }), children: "+ Carrier" }), tab === 'reports' && _jsxs("span", { className: "row wrap", children: [_jsx("button", { className: "ghost small", onClick: () => setRep({ kind: 'inspection' }), children: "+ Inspection" }), _jsx("button", { className: "ghost small", onClick: () => setRep({ kind: 'maintenance' }), children: "+ Maintenance" }), _jsx("button", { className: "ghost small", onClick: () => setRep({ kind: 'incident' }), children: "+ Incident" })] })] }), tab === 'assets' && _jsxs(_Fragment, { children: [!dept && _jsx("div", { className: "row wrap", children: _jsx(Choices, { value: depF, options: [{ v: 'all', l: 'All' }, ...DEPTS.map(x => ({ v: x, l: DEPT_L[x] }))], onChange: setDepF }) }), !assets.length ? _jsx(Empty, { children: ours.length ? 'Nothing matches.' : canAdd ? 'Nothing here yet. Add the trucks, trailers, pickups, tractors and other equipment.' : 'Nothing here yet.' })
                        : _jsx("div", { className: "clist", children: assets.map(a => {
                                const di = inspDue(a);
                                const dn = d.drivers.filter(x => a.driver_ids.includes(x.id)).map(x => x.name);
                                return _jsxs("button", { className: `crow fasset ${a.status === 'retired' ? 'retired' : ''}`, onClick: () => setAsset(a), children: [_jsxs("span", { className: "grow", children: [_jsxs("span", { className: "kind", children: [dept ? '' : `${DEPT_L[a.department]} · `, a.body_type ?? KIND_L[a.kind], a.site ? ` · ${a.site}` : '', a.plate ? ` · ${a.plate}` : ''] }), _jsx("b", { children: assetName(a) }), " ", _jsxs("span", { className: "muted", children: [[a.year, a.make, a.model].filter(Boolean).join(' '), a.pallet_spaces ? ` · ${a.pallet_spaces} pallet spaces` : ''] }), dn.length > 0 && _jsxs("div", { className: "muted small", children: ["Drivers: ", dn.join(', ')] }), _jsxs("div", { className: "row wrap fpills", children: [a.status !== 'active' && _jsx("span", { className: `pill ${a.status === 'out_of_service' ? 'cp-bad' : 'cp-mute'}`, children: STATUS_L[a.status] }), !dept && a.kind !== 'equipment' && DOC_KINDS.map(k => { const p = paperOf(a, k.key); return _jsxs("span", { className: `pill ${p.tone}`, children: [k.l, ": ", p.text] }, k.key); }), di != null && _jsx("span", { className: `pill ${di <= 0 ? 'cp-warn' : 'cp-ok'}`, children: di <= 0 ? 'inspection due' : `inspect in ${di}d` }), a.open > 0 && _jsxs("span", { className: "pill cp-bad", children: [a.open, " open"] })] })] }), _jsx("span", { className: "muted small nowrap", children: a.odometer ? `${n0(a.odometer)} mi` : a.hours ? `${n0(a.hours)} hrs` : '' })] }, a.id);
                            }) }), _jsxs("label", { className: "check small-check", children: [_jsx("input", { type: "checkbox", checked: retired, onChange: e => setRetired(e.target.checked) }), " Show retired"] })] }), tab === 'drivers' && _jsxs(_Fragment, { children: [!drivers.length ? _jsx(Empty, { children: "No drivers yet. Add your drivers, with or without an app login, and the vehicles each one drives." })
                        : _jsx("div", { className: "clist", children: drivers.map(x => _jsx("button", { className: `crow ${x.active ? '' : 'retired'}`, onClick: () => setDriver(x), children: _jsxs("span", { className: "grow", children: [_jsxs("span", { className: "kind", children: [x.department ? DEPT_L[x.department] : '', x.phone ? ` · ${x.phone}` : ''] }), _jsx("b", { children: x.name }), " ", _jsx("span", { className: "muted", children: d.assets.filter(a => x.asset_ids.includes(a.id)).map(a => assetName(a)).join(', ') }), _jsxs("div", { className: "row wrap fpills", children: [_jsx("span", { className: `pill ${x.has_login ? 'cp-ok' : 'cp-mute'}`, children: x.has_login ? 'on the app' : 'no app login' }), x.license_expires ? _jsx(Expiry, { d: x.license_expires, warn: 30 }) : _jsx("span", { className: "pill cp-warn", children: "no license date" })] })] }) }, x.id)) }), _jsxs("label", { className: "check small-check", children: [_jsx("input", { type: "checkbox", checked: retired, onChange: e => setRetired(e.target.checked) }), " Show inactive"] })] }), tab === 'carriers' && _jsxs(_Fragment, { children: [!carriers.length ? _jsx(Empty, { children: "No outside carriers yet." })
                        : _jsx("div", { className: "clist", children: carriers.map(c => {
                                const trucks = d.assets.filter(a => a.carrier_id === c.id && a.status !== 'retired'), ds = d.drivers.filter(x => x.carrier_id === c.id && x.active);
                                const coi = c.docs.filter(x => x.doc_type === 'insurance').map(x => x.expires_on).filter((x) => !!x).sort().pop() ?? null;
                                return _jsx("button", { className: `crow ${c.active ? '' : 'retired'}`, onClick: () => setCarrier(c), children: _jsxs("span", { className: "grow", children: [_jsx("span", { className: "kind", children: [c.contact_name, c.phone].filter(Boolean).join(' · ') || 'no contact yet' }), _jsx("b", { children: c.name }), " ", _jsxs("span", { className: "muted", children: [trucks.length, " truck", trucks.length === 1 ? '' : 's', " \u00B7 ", ds.length, " driver", ds.length === 1 ? '' : 's'] }), _jsxs("div", { className: "row wrap fpills", children: [c.license_expires ? _jsx("span", { className: "pill cp-mute", children: "License" }) : _jsx("span", { className: "pill cp-warn", children: "no license on file" }), c.license_expires && _jsx(Expiry, { d: c.license_expires, warn: 30 }), coi ? _jsxs(_Fragment, { children: [_jsx("span", { className: "pill cp-mute", children: "Insurance" }), _jsx(Expiry, { d: coi, warn: 30 })] }) : _jsx("span", { className: "pill cp-warn", children: "no insurance certificate" })] })] }) }, c.id);
                            }) }), _jsxs("label", { className: "check small-check", children: [_jsx("input", { type: "checkbox", checked: retired, onChange: e => setRetired(e.target.checked) }), " Show inactive"] })] }), tab === 'reports' && _jsxs(_Fragment, { children: [_jsxs("div", { className: "row wrap", children: [_jsx(Choices, { value: kind, options: [{ v: 'all', l: 'All' }, { v: 'inspection', l: 'Inspections' }, { v: 'maintenance', l: 'Maintenance' }, { v: 'incident', l: 'Incidents' }], onChange: setKind }), _jsxs("label", { className: "check small-check", children: [_jsx("input", { type: "checkbox", checked: openOnly, onChange: e => setOpenOnly(e.target.checked) }), " Open only"] })] }), logs.length ? _jsx(LogList, { d: d, logs: logs, onOpen: l => setRep(l), showAsset: true }) : _jsxs(Empty, { children: ["No reports", openOnly ? ' open' : '', "."] })] }), asset && _jsx(AssetSheet, { api: api, d: d, a0: asset, flash: flash, paperwork: !dept, onClose: () => setAsset(null), onSaved: async (m, keep) => { await load(); flash(m); if (!keep)
                    setAsset(null); }, onReport: x => setRep(x) }), driver && _jsx(DriverSheet, { api: api, d: d, x0: driver, flash: flash, onClose: () => setDriver(null), onSaved: async (m, keep) => { await load(); flash(m); if (!keep)
                    setDriver(null); } }), carrier && _jsx(CarrierSheet, { api: api, d: d, x0: carrier, flash: flash, onClose: () => setCarrier(null), onSaved: async (m, keep) => { await load(); flash(m); if (!keep)
                    setCarrier(null); } }), rep && _jsx(ReportSheet, { api: api, d: d, x0: rep, flash: flash, onClose: () => setRep(null), onSaved: async (m) => { setRep(null); await load(); flash(m); } })] });
}
/** Compliance dashboard card */
export function FleetCard({ sb, go }) {
    const { d } = useFleet(sb);
    if (!d || !d.assets.length)
        return null;
    const live = d.assets.filter(a => a.status !== 'retired' && a.carrier_id == null);
    const rows = [
        ['Out of service', live.filter(a => a.status === 'out_of_service').length, 'cp-bad'],
        ['Open defects', d.logs.filter(l => l.status === 'open' && l.kind === 'inspection').length, 'cp-warn'],
        ['Open incidents', d.logs.filter(l => l.status === 'open' && l.kind === 'incident').length, 'cp-bad'],
        ['Insurance / registration issues', live.filter(a => a.kind !== 'equipment' && DOC_KINDS.some(k => paperOf(a, k.key).tone !== 'cp-ok')).length, 'cp-warn'],
    ];
    return _jsx(Card, { title: "Vehicles and equipment", action: "Open", onAction: go, children: _jsx("div", { className: "dlist", children: rows.map(([l, n, tone]) => _jsxs("div", { className: "drow", children: [_jsx("span", { className: "grow", children: l }), _jsx("span", { className: `pill ${n ? tone : 'cp-ok'}`, children: n })] }, l)) }) });
}
function LogList({ d, logs, onOpen, showAsset = true }) {
    return _jsx("div", { className: "clist", children: logs.map(l => {
            const a = d.assets.find(x => x.id === l.asset_id);
            return _jsxs("button", { className: "crow", onClick: () => onOpen(l), children: [_jsxs("span", { className: "grow", children: [_jsxs("span", { className: "kind", children: [t(LOG_L[l.kind]), " \u00B7 ", fmtD(l.happened_on), l.created_by ? ` · ${who(l.created_by)}` : ''] }), _jsx("b", { children: l.summary ?? (l.result ? t(RESULT_L[l.result]) : t(LOG_L[l.kind])) }), showAsset && a && _jsxs("span", { className: "muted", children: [" ", assetName(a)] }), l.files > 0 && _jsxs("span", { className: "muted small", children: [" \u00B7 ", l.files, " ", l.files === 1 ? t('photo') : t('photos')] })] }), l.status === 'open' ? _jsx("span", { className: `pill ${l.kind === 'incident' ? 'cp-bad' : 'cp-warn'}`, children: t('open') })
                        : l.kind === 'inspection' && l.result ? _jsx("span", { className: `pill ${l.result === 'pass' ? 'cp-ok' : 'cp-mute'}`, children: t(RESULT_L[l.result]) })
                            : l.cost ? _jsxs("span", { className: "muted small", children: ["$", Number(l.cost).toLocaleString()] }) : null] }, l.id);
        }) });
}
// =====================================================================================================
// One vehicle / piece of equipment
// =====================================================================================================
function AssetSheet({ api, d, a0, flash, paperwork = true, onClose, onSaved, onReport }) {
    const [x, setX] = useState(() => ({ driver_ids: [], ...a0 }));
    const [busy, setBusy] = useState(false);
    const set = (v) => setX(s => ({ ...s, ...v }));
    const carrierTruck = x.carrier_id != null;
    const can = carrierTruck ? d.carrier_admin : d.my_depts.includes((a0.department ?? x.department ?? 'company'));
    const a = d.assets.find(y => y.id === a0.id);
    const logs = d.logs.filter(l => l.asset_id === a0.id);
    const transport = x.kind !== 'equipment';
    const ourDrivers = d.drivers.filter(r => r.carrier_id == null && (r.active || (x.driver_ids ?? []).includes(r.id)));
    async function save() {
        setBusy(true);
        try {
            const { docs: _docs, open: _open, last_inspection: _li, last_service: _ls, ...p } = x;
            const id = await api.saveAsset(p);
            if (!x.id)
                set({ id });
            await onSaved(x.id ? 'Saved' : `${x.name} added.${paperwork && !carrierTruck ? ' Now attach its insurance and registration.' : ''}`, !x.id && paperwork && !carrierTruck);
        }
        catch (e) {
            flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    const txt = (k, l, hint) => _jsx(F, { label: l, hint: hint, children: _jsx(TextIn, { value: x[k], onChange: v => set({ [k]: v }) }) });
    const num = (k, l, hint) => _jsx(F, { label: l, hint: hint, children: _jsx(NumIn, { value: x[k], onChange: v => set({ [k]: v }) }) });
    const carrier = d.carriers.find(c => c.id === x.carrier_id);
    return _jsxs(Sheet, { wide: true, title: x.id ? assetName(a ?? x) : carrierTruck ? `Add a ${carrier?.name ?? 'carrier'} truck` : 'Add vehicle or equipment', sub: x.id ? `${carrierTruck ? carrier?.name ?? 'Outside carrier' : DEPT_L[(x.department ?? 'company')]} · ${x.body_type ?? KIND_L[x.kind ?? 'vehicle']}${x.site ? ` · ${x.site}` : ''}` : undefined, onClose: onClose, children: [x.id && !carrierTruck && _jsxs("div", { className: "row wrap freps", children: [_jsx("button", { className: "ghost small", onClick: () => onReport({ kind: 'inspection', asset_id: x.id }), children: "+ Inspection" }), _jsx("button", { className: "ghost small", onClick: () => onReport({ kind: 'maintenance', asset_id: x.id }), children: "+ Maintenance" }), _jsx("button", { className: "ghost small", onClick: () => onReport({ kind: 'incident', asset_id: x.id }), children: "+ Incident" })] }), _jsxs("fieldset", { disabled: !can, className: "fset", children: [_jsxs("div", { className: "grid3", children: [!carrierTruck && _jsx(F, { label: "Department", children: _jsx(Pick, { value: (x.department ?? 'company'), options: DEPTS.filter(k => d.my_depts.includes(k) || k === x.department).map(k => ({ v: k, l: DEPT_L[k] })), onChange: v => set({ department: v ?? 'company' }) }) }), _jsx(F, { label: "Type", children: _jsx(Pick, { value: x.kind ?? 'vehicle', options: ['vehicle', 'trailer', 'equipment'].map(k => ({ v: k, l: KIND_L[k] })), onChange: v => set({ kind: v ?? 'vehicle', checklist: x.checklist && x.checklist !== x.kind ? x.checklist : v ?? 'vehicle' }) }) }), txt('body_type', 'What it is', x.kind === 'equipment' ? 'Tractor, Combine, Forklift…' : 'Reefer truck, Box truck, Pickup…'), txt('name', 'Name', 'e.g. 20\' Freezer Truck'), !carrierTruck && txt('unit_no', 'Unit #', 'our number, e.g. T3'), !carrierTruck && _jsx(F, { label: "Home site", children: _jsx(Pick, { value: x.site ?? null, blank: "\u2014", options: SITES.map(s => ({ v: s, l: s })), onChange: v => set({ site: v }) }) }), txt('make', 'Make'), txt('model', 'Model'), num('year', 'Year'), txt('vin', x.kind === 'equipment' ? 'Serial #' : 'VIN'), transport && txt('plate', 'Plate'), transport && num('pallet_spaces', 'Pallet spaces', 'for loads'), transport && num('pallets_across', 'Pallets across', 'usually 2'), _jsx(F, { label: "Status", children: _jsx(Pick, { value: x.status ?? 'active', options: ['active', 'out_of_service', 'retired'].map(s => ({ v: s, l: STATUS_L[s] })), onChange: v => set({ status: v ?? 'active' }) }) }), !carrierTruck && _jsx(F, { label: "Inspection checklist", children: _jsx(Pick, { value: x.checklist ?? null, blank: "\u2014", options: d.checklists.map(c => ({ v: c.key, l: c.label })), onChange: v => set({ checklist: v }) }) })] }), !carrierTruck && _jsxs(_Fragment, { children: [_jsx(F, { label: "Drivers", hint: "who drives it (they see it first when filing an inspection)", children: _jsxs("div", { className: "row wrap fchips", children: [ourDrivers.map(r => {
                                            const on = (x.driver_ids ?? []).includes(r.id);
                                            return _jsx("button", { type: "button", className: `chip ${on ? 'on' : ''}`, onClick: () => set({ driver_ids: on ? (x.driver_ids ?? []).filter(i => i !== r.id) : [...(x.driver_ids ?? []), r.id] }), children: r.name }, r.id);
                                        }), !ourDrivers.length && _jsx("span", { className: "muted small", children: "No drivers yet. Add them on the Drivers tab." })] }) }), _jsx("h3", { children: "Schedule" }), _jsxs("div", { className: "grid3", children: [num('inspect_every_days', 'Inspect every (days)', 'blank = no schedule'), num('service_every_days', 'Service every (days)'), x.kind === 'vehicle' ? num('service_every_miles', 'Service every (miles)') : num('service_every_hours', 'Service every (hours)'), x.kind === 'vehicle' ? num('odometer', 'Odometer (mi)', 'updates from reports') : num('hours', 'Hours', 'updates from reports')] })] }), _jsx(F, { label: "Notes", children: _jsx("textarea", { value: x.notes ?? '', onChange: e => set({ notes: e.target.value || null }) }) })] }), can ? _jsx(SaveBar, { busy: busy, onSave: save, onCancel: onClose, disabled: !x.name?.trim(), saveLabel: x.id ? 'Save' : 'Add' })
                : _jsx("p", { className: "muted small", children: "Only Compliance or this department's Admins can change it. Anyone can file reports." }), x.id && paperwork && !carrierTruck && _jsx(AssetDocs, { api: api, refKind: "asset", refId: x.id, name: x.name ?? '', site: x.site ?? null, can: d.can_edit, flash: flash, onChanged: () => onSaved('Saved', true) }), x.id && !carrierTruck && _jsxs(_Fragment, { children: [_jsx("h3", { children: "History" }), logs.length ? _jsx(LogList, { d: d, logs: logs, onOpen: l => onReport(l), showAsset: false }) : _jsx("p", { className: "muted", children: "No reports yet." })] })] });
}
// =====================================================================================================
// One driver (ours, with or without an app login; or a carrier's)
// =====================================================================================================
function DriverSheet({ api, d, x0, flash, onClose, onSaved }) {
    const [x, setX] = useState(() => ({ asset_ids: [], active: true, ...x0 }));
    const [busy, setBusy] = useState(false);
    const set = (v) => setX(s => ({ ...s, ...v }));
    const isCarrier = x.carrier_id != null;
    const can = isCarrier ? d.carrier_admin : d.my_depts.includes((x0.department ?? x.department ?? 'distribution'));
    const carrier = d.carriers.find(c => c.id === x.carrier_id);
    const ours = d.assets.filter(a => a.carrier_id == null && a.status !== 'retired' && a.kind !== 'equipment' || (x.asset_ids ?? []).includes(a.id));
    const live = d.drivers.find(r => r.id === x.id);
    // 216: app users, so a card can be tied to someone's app login (ours, or a carrier card for someone who also drives for us)
    const [users, setUsers] = useState([]);
    useEffect(() => { api.sb.rpc('driver_app_users').then(({ data }) => setUsers((data ?? []))); }, []);
    const known = users.find(u => u.email === (x.email ?? '').trim().toLowerCase());
    async function save() {
        setBusy(true);
        try {
            const { has_login: _h, ...p } = x;
            const id = await api.saveDriver(isCarrier ? { ...p, asset_ids: undefined } : p);
            if (!x.id)
                set({ id });
            await onSaved(x.id ? 'Saved' : `${x.name} added`);
        }
        catch (e) {
            flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    async function invite() {
        if (!x.email?.trim()) {
            flash('Add their email first', true);
            return;
        }
        setBusy(true);
        try {
            if (x.id)
                await api.saveDriver({ id: x.id, name: x.name, email: x.email });
            await api.addToApp(x.name ?? '', x.email, (x.department && x.department !== 'company' ? x.department : 'distribution'));
            await onSaved(`${x.name} is on the app. They sign in with their email${/@lifted-organics\.com$/i.test(x.email) ? ' (Microsoft)' : ' and a code'}.`, true);
        }
        catch (e) {
            flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    // 215: a login that only sees the Driver screen (no modules)
    async function driverOnly() {
        if (!x.email?.trim()) {
            flash('Add their email first', true);
            return;
        }
        setBusy(true);
        try {
            if (x.id)
                await api.saveDriver({ id: x.id, name: x.name, email: x.email });
            const { data, error } = await api.sb.rpc('fleet_driver_app', { p_driver: x.id });
            if (error)
                throw new Error(/Could not find the function|schema cache/i.test(error.message) ? 'Run 215_driver_portal.sql in Supabase first' : error.message);
            const r = data;
            await onSaved(r.already ? `${x.name} already has an app login; the Driver button shows for them.` : `${x.name} can sign in at the app with ${r.email}${r.login === 'email' ? ' and a code sent to that email' : ' (Microsoft)'}. They only see the Driver screen.`, true);
        }
        catch (e) {
            flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    const txt = (k, l, hint, ph) => _jsx(F, { label: l, hint: hint, children: _jsx(TextIn, { value: x[k], placeholder: ph, onChange: v => set({ [k]: v }) }) });
    return _jsxs(Sheet, { title: x.id ? x.name : isCarrier ? `New ${carrier?.name ?? 'carrier'} driver` : 'New driver', sub: isCarrier ? carrier?.name : x.department ? DEPT_L[x.department] : undefined, onClose: onClose, children: [_jsxs("fieldset", { disabled: !can, className: "fset", children: [_jsxs("div", { className: "grid2", children: [txt('name', 'Name'), !isCarrier && _jsx(F, { label: "Department", children: _jsx(Pick, { value: (x.department ?? 'distribution'), options: DEPTS.filter(k => d.my_depts.includes(k) || k === x.department).map(k => ({ v: k, l: DEPT_L[k] })), onChange: v => set({ department: v }) }) }), txt('phone', 'Phone'), _jsx(F, { label: "App login", hint: isCarrier ? 'if this driver also uses our app (e.g. drives for us too): their loads for this carrier show on their Driver screen' : 'their loads show on their Driver screen', children: _jsx(Pick, { value: known ? known.email : x.email ? '__other' : '', options: [{ v: '', l: 'None' }, ...users.map(u => ({ v: u.email, l: `${u.name} · ${u.email}${u.cards?.some(c => c.id !== x.id && c.active) ? ` (also ${u.cards.filter(c => c.id !== x.id && c.active).map(c => c.carrier ?? 'our card').join(', ')})` : ''}` })), ...(!isCarrier ? [{ v: '__other', l: 'Someone else (type their email)…' }] : [])], onChange: v => { if (v === '__other')
                                        set({ email: x.email && !known ? x.email : '' });
                                    else {
                                        const u = users.find(y => y.email === v);
                                        set({ email: v || null, ...(u && !x.name?.trim() ? { name: u.name } : {}), ...(u && !x.phone && u.phone ? { phone: u.phone } : {}) });
                                    } } }) }), !isCarrier && !known && x.email != null && txt('email', 'Email', 'for a driver-only login', 'name@…'), txt('license_no', "Driver's license #"), txt('license_class', 'Class', 'C, B, A…'), _jsx(F, { label: "License expires", hint: "shows on Deadlines", children: _jsx(DateIn, { value: x.license_expires, onChange: v => set({ license_expires: v }) }) }), _jsx(F, { label: "Status", children: _jsx(Pick, { value: x.active === false ? 'off' : 'on', options: [{ v: 'on', l: 'Active' }, { v: 'off', l: 'Inactive' }], onChange: v => set({ active: v !== 'off' }) }) })] }), !isCarrier && _jsx(F, { label: "Drives", hint: "vehicles they drive", children: _jsxs("div", { className: "row wrap fchips", children: [ours.map(a => {
                                    const on = (x.asset_ids ?? []).includes(a.id);
                                    return _jsx("button", { type: "button", className: `chip ${on ? 'on' : ''}`, onClick: () => set({ asset_ids: on ? (x.asset_ids ?? []).filter(i => i !== a.id) : [...(x.asset_ids ?? []), a.id] }), children: assetName(a) }, a.id);
                                }), !ours.length && _jsx("span", { className: "muted small", children: "No vehicles yet." })] }) }), _jsx(F, { label: "Notes", children: _jsx("textarea", { value: x.notes ?? '', onChange: e => set({ notes: e.target.value || null }) }) })] }), !isCarrier && x.id && (live?.has_login ? _jsxs("p", { className: "okbox", children: ["On the app as ", live.email, ". Loads with ", x.name?.split(' ')[0], " as the driver show on their Driver screen (\uD83D\uDE9B Driver)."] })
                : can && _jsxs("div", { className: "infobox", children: ["Not on the app yet. ", x.email ? _jsxs(_Fragment, { children: [_jsx("button", { className: "ghost small", disabled: busy, onClick: driverOnly, children: "Driver-only login" }), " sees only their loads and stops (Driver screen), nothing else.", _jsx("br", {}), _jsxs("button", { className: "ghost small", disabled: busy, onClick: invite, children: ["Add ", x.name?.split(' ')[0], " to the app"] }), " as a ", DEPT_L[(x.department && x.department !== 'company' ? x.department : 'distribution')], " User, so they can also file vehicle reports and use Distribution."] }) : 'Add their email to put them on the app.'] })), isCarrier && _jsx("p", { className: "muted small", children: "Carrier drivers don't get a login. When they're picked as the driver on a load, the load gets a link for them (Transit \u203A the load \u203A Driver link)." }), can ? _jsx(SaveBar, { busy: busy, onSave: save, onCancel: onClose, disabled: !x.name?.trim(), saveLabel: x.id ? 'Save' : 'Add' }) : _jsx("p", { className: "muted small", children: "Only Compliance or this department's Admins can change drivers." })] });
}
// =====================================================================================================
// One outside carrier: contact, license, insurance certificate, their trucks and drivers
// =====================================================================================================
function CarrierSheet({ api, d, x0, flash, onClose, onSaved }) {
    const [x, setX] = useState(() => ({ active: true, ...x0 }));
    const [busy, setBusy] = useState(false);
    const [truck, setTruck] = useState(null);
    const [drv, setDrv] = useState(null);
    const set = (v) => setX(s => ({ ...s, ...v }));
    const can = d.carrier_admin;
    const trucks = d.assets.filter(a => a.carrier_id === x.id), drivers = d.drivers.filter(r => r.carrier_id === x.id);
    async function save() {
        setBusy(true);
        try {
            const { docs: _d, ...p } = x;
            const id = await api.saveCarrier(p);
            if (!x.id)
                set({ id });
            await onSaved(x.id ? 'Saved' : `${x.name} added. Add their trucks, drivers and insurance certificate below.`, true);
        }
        catch (e) {
            flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    const txt = (k, l, hint) => _jsx(F, { label: l, hint: hint, children: _jsx(TextIn, { value: x[k], onChange: v => set({ [k]: v }) }) });
    return _jsxs(Sheet, { wide: true, title: x.id ? x.name : 'New outside carrier', sub: "Outside carrier", onClose: onClose, children: [_jsxs("fieldset", { disabled: !can, className: "fset", children: [_jsxs("div", { className: "grid3", children: [txt('name', 'Company'), txt('license_no', 'License #', 'their DCC distributor / transport license'), _jsx(F, { label: "License expires", hint: "shows on Deadlines", children: _jsx(DateIn, { value: x.license_expires, onChange: v => set({ license_expires: v }) }) }), txt('contact_name', 'Contact'), txt('phone', 'Phone'), txt('email', 'Email')] }), txt('address', 'Address'), _jsx(F, { label: "Notes", children: _jsx("textarea", { value: x.notes ?? '', onChange: e => set({ notes: e.target.value || null }) }) }), x.id && _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: x.active !== false, onChange: e => set({ active: e.target.checked }) }), " Active (off takes their trucks off the load list)"] })] }), can ? _jsx(SaveBar, { busy: busy, onSave: save, onCancel: onClose, disabled: !x.name?.trim(), saveLabel: x.id ? 'Save' : 'Add' }) : _jsx("p", { className: "muted small", children: "Only Compliance or a Distribution Admin can change carriers." }), x.id && _jsxs(_Fragment, { children: [_jsx(AssetDocs, { api: api, refKind: "carrier", refId: x.id, name: x.name ?? '', site: null, can: can, flash: flash, onChanged: () => onSaved('Saved', true), kinds: [{ key: 'insurance', l: 'Insurance certificate (COI)', add: 'Add insurance certificate' }, { key: 'partners', l: 'License', add: 'Add license copy' }] }), _jsxs("div", { className: "row between", children: [_jsx("h3", { children: "Trucks" }), can && _jsx("button", { className: "ghost small", onClick: () => setTruck({ kind: 'trailer', status: 'active', carrier_id: x.id, department: 'company', pallet_spaces: 24, pallets_across: 2 }), children: "+ Truck" })] }), trucks.length ? _jsx("div", { className: "clist", children: trucks.map(a => _jsx("button", { className: `crow ${a.status === 'retired' ? 'retired' : ''}`, onClick: () => setTruck(a), children: _jsxs("span", { className: "grow", children: [_jsx("b", { children: a.name }), " ", _jsx("span", { className: "muted", children: [a.body_type, a.plate, a.pallet_spaces ? `${a.pallet_spaces} pallet spaces` : ''].filter(Boolean).join(' · ') })] }) }, a.id)) })
                        : _jsx("p", { className: "muted", children: "No trucks yet. Their trucks show up when you build a load." }), _jsxs("div", { className: "row between", children: [_jsx("h3", { children: "Drivers" }), can && _jsx("button", { className: "ghost small", onClick: () => setDrv({ carrier_id: x.id, active: true }), children: "+ Driver" })] }), drivers.length ? _jsx("div", { className: "clist", children: drivers.map(r => _jsxs("button", { className: `crow ${r.active ? '' : 'retired'}`, onClick: () => setDrv(r), children: [_jsxs("span", { className: "grow", children: [_jsx("b", { children: r.name }), " ", _jsx("span", { className: "muted", children: [r.phone, r.license_no].filter(Boolean).join(' · ') })] }), r.license_expires && _jsx(Expiry, { d: r.license_expires, warn: 30 })] }, r.id)) })
                        : _jsx("p", { className: "muted", children: "No drivers yet. They're only names here, never app users." })] }), truck && _jsx(AssetSheet, { api: api, d: d, a0: truck, flash: flash, paperwork: false, onClose: () => setTruck(null), onSaved: async (m, keep) => { await onSaved(m, true); if (!keep)
                    setTruck(null); }, onReport: () => { } }), drv && _jsx(DriverSheet, { api: api, d: d, x0: drv, flash: flash, onClose: () => setDrv(null), onSaved: async (m, keep) => { await onSaved(m, true); if (!keep)
                    setDrv(null); } })] });
}
function AssetDocs({ api, refKind, refId, name, site, can, flash, onChanged, kinds = DOC_KINDS }) {
    const assetId = refId;
    const [docs, setDocs] = useState(null);
    const [types, setTypes] = useState([]);
    const [adding, setAdding] = useState(null);
    const [linking, setLinking] = useState(null);
    const load = async () => { try {
        setDocs((await api.comp.docsFor(refKind, assetId)).filter(x => x.doc_type !== 'fleet'));
    }
    catch (e) {
        setDocs([]);
        flash(errText(e), true);
    } };
    useEffect(() => { load(); api.comp.docTypes().then(setTypes).catch(() => { }); }, [assetId]);
    async function unlink(doc) {
        if (!confirm(`Take "${doc.title}" off ${name}? The document stays in the Library.`))
            return;
        try {
            await api.comp.link(doc.id, refKind, String(assetId), false);
            await load();
            onChanged();
        }
        catch (e) {
            flash(errText(e), true);
        }
    }
    return _jsxs("div", { className: "fdocs", children: [kinds.map(k => {
                const ds = (docs ?? []).filter(x => x.doc_type === k.key);
                return _jsxs("div", { className: "cdoclist", children: [_jsx("div", { className: "cdl-h", children: k.l }), docs == null ? _jsx("p", { className: "muted small", children: "Loading\u2026" }) : !ds.length ? _jsxs("p", { className: "muted small", children: ["No ", k.l.toLowerCase(), " on file."] })
                            : ds.map(doc => _jsxs("div", { className: "row cdl-row", children: [_jsx(FileChip, { api: api.comp, f: doc, flash: flash, sub: fmtD(doc.effective_on ?? doc.created_at) }), doc.expires_on ? _jsx(Expiry, { d: doc.expires_on }) : _jsx("span", { className: "pill cp-warn", children: "no expiry date" }), can && _jsx("button", { className: "ghost small", title: "Take off this vehicle", onClick: () => unlink(doc), children: "\u2715" })] }, doc.id)), can && _jsxs("div", { className: "row wrap", children: [_jsx(DropZone, { compact: true, onFiles: fs => setAdding({ key: k.key, files: fs }), label: k.add }), _jsx("button", { className: "linkbtn small", onClick: async () => { try {
                                        setLinking({ key: k.key, all: (await api.comp.docs()).filter(x => x.doc_type === k.key && x.current) });
                                    }
                                    catch (e) {
                                        flash(errText(e), true);
                                    } }, children: refKind === 'carrier' ? 'Pick one already in the Library' : k.key === 'insurance' ? 'Already uploaded? Add this vehicle to a policy' : 'Pick one already in the Library' })] })] }, k.key);
            }), adding && _jsx(AddDocsSheet, { api: api.comp, files: adding.files, types: types, flash: flash, lockType: true, preset: { doc_type: adding.key, site, title: `${name} ${adding.key === 'insurance' ? (refKind === 'carrier' ? 'insurance certificate' : 'insurance') : refKind === 'carrier' ? 'license' : 'registration'}`, links: [{ kind: refKind, id: String(assetId) }] }, onClose: () => setAdding(null), onDone: async () => { setAdding(null); await load(); onChanged(); } }), linking && _jsx(Sheet, { title: linking.key === 'insurance' ? 'Add to a policy' : 'Pick a registration', onClose: () => setLinking(null), children: !linking.all.length ? _jsx("p", { className: "muted", children: "None in the Library yet." })
                    : _jsx("div", { className: "clist", children: linking.all.map(doc => _jsxs("button", { className: "crow", disabled: (docs ?? []).some(x => x.id === doc.id), onClick: async () => {
                                try {
                                    await api.comp.link(doc.id, refKind, String(assetId));
                                    setLinking(null);
                                    await load();
                                    onChanged();
                                    flash(`${name} added to ${doc.title}`);
                                }
                                catch (e) {
                                    flash(errText(e), true);
                                }
                            }, children: [_jsxs("span", { className: "grow", children: [_jsx("b", { children: doc.title }), " ", _jsx("span", { className: "muted", children: doc.site ?? '' })] }), doc.expires_on && _jsx(Expiry, { d: doc.expires_on })] }, doc.id)) }) })] });
}
export function ReportSheet({ api, d, x0, flash, onClose, onSaved, only }) {
    const [x, setX] = useState(() => ({ happened_on: today(), ...x0 }));
    const [det, setDet] = useState(() => ({ ...(x0.details ?? {}) }));
    const [files, setFiles] = useState([]);
    const [saved, setSaved] = useState(null);
    const [busy, setBusy] = useState(null);
    const [note, setNote] = useState('');
    const set = (v) => setX(s => ({ ...s, ...v }));
    const sd = (v) => setDet(s => ({ ...s, ...v }));
    const kind = x.kind;
    const a = d.assets.find(y => y.id === x.asset_id);
    const isNew = !x.id;
    const mineToday = x.created_by === d.me && !!x.created_at && Date.now() - new Date(x.created_at).getTime() < 86400000;
    const canSave = isNew || d.can_edit || mineToday;
    const canPhoto = isNew || d.can_edit || x.created_by === d.me;
    const cl = d.checklists.find(c => c.key === (a?.checklist ?? a?.kind ?? 'vehicle'));
    const items = det.items ?? {};
    const defects = cl?.items.filter(i => items[i.k] === 'defect') ?? [];
    const unanswered = cl?.items.filter(i => !items[i.k]) ?? [];
    useEffect(() => { if (x.id)
        api.files(x.id).then(setSaved).catch(() => setSaved([])); }, [x.id]);
    // the result follows the checklist until someone picks one
    useEffect(() => { if (kind === 'inspection' && isNew && x.result !== 'out_of_service')
        set({ result: defects.length ? 'defects' : unanswered.length ? undefined : 'pass' }); }, [defects.length, unanswered.length]);
    // the vehicles this person drives come first
    const mine = new Set(d.drivers.filter(r => r.email && r.email === d.me).flatMap(r => r.asset_ids));
    const assetOpts = d.assets.filter(y => (y.carrier_id == null && y.status !== 'retired' && (!only || only.has(y.id))) || y.id === x.asset_id)
        .sort((p, q) => Number(mine.has(q.id)) - Number(mine.has(p.id)) || assetName(p).localeCompare(assetName(q)))
        .map(y => ({ v: y.id, l: `${mine.has(y.id) ? '★ ' : ''}${assetName(y)}${y.status === 'out_of_service' ? ` (${t('out of service')})` : ''}` }));
    const missing = kind !== 'incident' && !x.asset_id ? t('Pick the vehicle or equipment')
        : kind === 'inspection' && !x.result ? (unanswered.length ? t('{n} checklist items left', { n: unanswered.length }) : t('Pick the result'))
            : kind !== 'inspection' && !x.summary?.trim() ? (kind === 'incident' ? t('Say what happened') : t('Say what was done')) : null;
    async function save() {
        setBusy(t('Saving…'));
        try {
            const summary = kind === 'inspection' && !x.summary?.trim() ? `${t(RESULT_L[x.result])}${defects.length ? `: ${defects.map(i => t(i.l)).join(', ')}` : ''}` : x.summary;
            const id = await api.saveLog({ ...x, summary, details: det, files: undefined });
            if (files.length)
                await api.addFiles(id, files, s => setBusy(t('Uploading photos {s}', { s })));
            await onSaved(isNew ? (kind === 'incident' ? t('Incident reported. Compliance will follow up.') : t('Report saved')) : t('Saved'));
        }
        catch (e) {
            flash(errText(e), true);
        }
        finally {
            setBusy(null);
        }
    }
    async function addNow(fs) {
        if (!x.id) {
            setFiles(f => [...f, ...fs]);
            return;
        }
        setBusy(t('Uploading…'));
        try {
            await api.addFiles(x.id, fs, s => setBusy(t('Uploading photos {s}', { s })));
            setSaved(await api.files(x.id));
            flash(t('Photos added'));
        }
        catch (e) {
            flash(errText(e), true);
        }
        finally {
            setBusy(null);
        }
    }
    async function close(reopen = false) {
        setBusy('…');
        try {
            await api.closeLog(x.id, note, reopen);
            await onSaved(reopen ? 'Reopened' : 'Closed');
        }
        catch (e) {
            flash(errText(e), true);
        }
        finally {
            setBusy(null);
        }
    }
    async function del() {
        setBusy('…');
        try {
            await api.deleteLog(x.id);
            await onSaved(t('Report removed'));
        }
        catch (e) {
            flash(errText(e), true);
        }
        finally {
            setBusy(null);
        }
    }
    async function pdf() {
        try {
            const b = await reportPdf(x, det, a, cl, saved ?? []);
            const u = URL.createObjectURL(b);
            window.open(u, '_blank');
            setTimeout(() => URL.revokeObjectURL(u), 60000);
        }
        catch (e) {
            flash(errText(e), true);
        }
    }
    const title = isNew ? (kind === 'incident' ? t('Report an incident') : kind === 'inspection' ? t('New inspection') : t('New maintenance')) : `${t(LOG_L[kind])} · ${fmtD(x.happened_on)}`;
    const rd = reading(a);
    const ta = (k, l, ph) => _jsx(F, { label: t(l), children: _jsx("textarea", { value: det[k] ?? '', placeholder: ph ? t(ph) : undefined, onChange: e => sd({ [k]: e.target.value }) }) });
    return _jsxs(Sheet, { wide: true, title: title, sub: !isNew ? `${assetName(a)}${x.created_by ? ` · ${t('by {w}', { w: who(x.created_by) })}` : ''}` : undefined, onClose: onClose, children: [!isNew && x.status === 'open' && _jsx("div", { className: kind === 'incident' ? 'warnbox' : 'infobox', children: kind === 'incident' ? t('Open: Compliance is following up.') : t('Open: defects to fix.') }), !isNew && x.status === 'closed' && x.closed_at && _jsxs("div", { className: "okbox", children: [t('Closed {d} by {w}', { d: fmtD(x.closed_at), w: who(x.closed_by) }), x.closed_note ? `: ${x.closed_note}` : ''] }), !canSave && _jsx("p", { className: "muted small", children: t('View only. Only Compliance can change a report after the day it was filed.') }), _jsxs("fieldset", { disabled: !canSave || !!busy, className: "fset", children: [_jsxs("div", { className: "grid3", children: [_jsx(F, { label: kind === 'incident' ? t('Vehicle or equipment (if any)') : t('Vehicle or equipment'), children: _jsx(Pick, { value: x.asset_id ?? null, blank: kind === 'incident' ? t('None / other') : t('Pick one…'), options: assetOpts, onChange: v => set({ asset_id: v }) }) }), _jsx(F, { label: t('Date'), children: _jsx(DateIn, { value: x.happened_on, onChange: v => set({ happened_on: v ?? today() }) }) }), kind === 'incident' ? _jsx(F, { label: t('Time'), children: _jsx("input", { type: "time", value: x.happened_at?.slice(0, 5) ?? '', onChange: e => set({ happened_at: e.target.value || null }) }) })
                                : a && a.kind !== 'trailer' || kind === 'maintenance' ? _jsx(F, { label: rd === 'odometer' ? t('Odometer (mi)') : t('Hours'), hint: a?.[rd] ? t('last {n}', { n: n0(a[rd]) }) : undefined, children: _jsx(NumIn, { value: x[rd] ?? null, onChange: v => set({ [rd]: v }) }) }) : null] }), kind === 'inspection' && _jsx(_Fragment, { children: !a ? _jsx("p", { className: "muted", children: t('Pick the vehicle or equipment to see its checklist.') }) : !cl ? _jsx("p", { className: "muted", children: t('No checklist set for this one.') }) : _jsxs(_Fragment, { children: [_jsxs("div", { className: "row between", children: [_jsx("h3", { children: t(cl.label) }), canSave && _jsx("button", { type: "button", className: "linkbtn small", onClick: () => sd({ items: Object.fromEntries(cl.items.map(i => [i.k, items[i.k] === 'defect' ? 'defect' : 'ok'])) }), children: t('Mark the rest OK') })] }), _jsx("div", { className: "fcheck", children: cl.items.map(i => _jsxs("div", { className: `fci ${items[i.k] ?? ''}`, children: [_jsx("span", { className: "grow", children: t(i.l) }), _jsx("span", { className: "fcb", children: ['ok', 'defect', 'na'].map(v => _jsx("button", { type: "button", className: items[i.k] === v ? `on ${v}` : '', onClick: () => sd({ items: { ...items, [i.k]: v } }), children: v === 'ok' ? t('OK') : v === 'defect' ? t('Problem') : t('N/A') }, v)) }), items[i.k] === 'defect' && _jsx("input", { className: "fcnote", placeholder: t('What\'s wrong?'), value: det.item_notes?.[i.k] ?? '', onChange: e => sd({ item_notes: { ...(det.item_notes ?? {}), [i.k]: e.target.value } }) })] }, i.k)) }), _jsx(F, { label: t('Result'), children: _jsx(Choices, { value: (x.result ?? ''), options: [{ v: 'pass', l: t('Passed') }, { v: 'defects', l: t('Defects found') }, { v: 'out_of_service', l: t('Out of service') }], onChange: v => set({ result: v }) }) }), x.result === 'out_of_service' && _jsx("p", { className: "small neg", children: t('Not safe to use. It shows as out of service until Compliance puts it back.') }), ta('defects', 'Other notes')] }) }), kind === 'maintenance' && _jsxs(_Fragment, { children: [_jsx(F, { label: t('What was done'), children: _jsx(TextIn, { value: x.summary, onChange: v => set({ summary: v }), placeholder: t('Oil change, new tires, brake pads…') }) }), ta('parts', 'Parts and details'), _jsxs("div", { className: "grid3", children: [_jsx(F, { label: t('Done by'), children: _jsx(TextIn, { value: x.performed_by, onChange: v => set({ performed_by: v }), placeholder: t('our crew or shop name') }) }), _jsx(F, { label: t('Shop / vendor'), children: _jsx(TextIn, { value: x.vendor, onChange: v => set({ vendor: v }) }) }), _jsx(F, { label: t('Cost ($)'), children: _jsx(NumIn, { value: x.cost ?? null, onChange: v => set({ cost: v }) }) })] }), _jsx("h3", { children: t('Next service') }), _jsxs("div", { className: "grid3", children: [_jsx(F, { label: t('Due date'), children: _jsx(DateIn, { value: x.next_due_on, onChange: v => set({ next_due_on: v }) }) }), rd === 'odometer' ? _jsx(F, { label: t('Due at (mi)'), children: _jsx(NumIn, { value: x.next_due_miles ?? null, onChange: v => set({ next_due_miles: v }) }) })
                                        : _jsx(F, { label: t('Due at (hours)'), children: _jsx(NumIn, { value: x.next_due_hours ?? null, onChange: v => set({ next_due_hours: v }) }) })] })] }), kind === 'incident' && _jsxs(_Fragment, { children: [_jsx(F, { label: t('What happened'), children: _jsx(TextIn, { value: x.summary, onChange: v => set({ summary: v }), placeholder: t('One line, e.g. backed into the gate post at GVR') }) }), ta('actions', 'Full description', 'What happened, step by step'), _jsxs("div", { className: "grid2", children: [_jsx(F, { label: t('Where'), children: _jsx(TextIn, { value: det.location, onChange: v => sd({ location: v ?? '' }) }) }), _jsx(F, { label: t('People involved'), children: _jsx(TextIn, { value: det.people, onChange: v => sd({ people: v ?? '' }) }) })] }), _jsx(F, { label: t('Anyone hurt?'), children: _jsx(Choices, { value: det.injuries == null ? '' : det.injuries ? 'yes' : 'no', options: [{ v: 'no', l: t('No') }, { v: 'yes', l: t('Yes') }], onChange: v => sd({ injuries: v === 'yes' }) }) }), det.injuries && ta('injury_notes', 'Who and what kind of injury'), det.injuries && _jsx("p", { className: "small neg", children: t('Get care first. Tell your supervisor right away.') }), ta('damage', 'Damage', 'Our vehicle or equipment, other vehicles, property'), _jsxs("div", { className: "grid2", children: [_jsx(F, { label: t('Other vehicle (plate, driver, insurance)'), children: _jsx(TextIn, { value: det.vehicle_other, onChange: v => sd({ vehicle_other: v ?? '' }) }) }), _jsx(F, { label: t('Police report #'), children: _jsx(TextIn, { value: det.police_report, onChange: v => sd({ police_report: v ?? '' }) }) })] }), _jsx(F, { label: t('Witnesses'), children: _jsx(TextIn, { value: det.witnesses, onChange: v => sd({ witnesses: v ?? '' }) }) })] })] }), _jsx("h3", { children: t('Photos and files') }), saved && saved.length > 0 && _jsx("div", { className: "cdoclist", children: saved.map(f => _jsx("div", { className: "row cdl-row", children: _jsx(FileChip, { api: api.comp, f: f, flash: flash }) }, f.id)) }), files.length > 0 && _jsx("div", { className: "ffiles", children: files.map((f, i) => _jsxs("span", { className: "pill cp-mute", children: [f.name, " ", _jsx("a", { onClick: () => setFiles(fs => fs.filter((_, j) => j !== i)), children: "\u2715" })] }, i)) }), canPhoto && !busy && _jsx(DropZone, { compact: true, onFiles: addNow, label: t('Take photos of the damage, defects or receipts'), accept: "image/*,application/pdf" }), busy && _jsx("p", { className: "muted", children: busy }), canSave && _jsx(SaveBar, { busy: !!busy, onSave: save, onCancel: onClose, disabled: !!missing, saveLabel: isNew ? (kind === 'incident' ? t('Send report') : t('Save report')) : t('Save'), onDelete: !isNew ? del : undefined }), missing && canSave && _jsx("p", { className: "muted small right", children: missing }), !canSave && _jsx("div", { className: "row", children: _jsx("button", { className: "ghost", onClick: onClose, children: t('Close') }) }), !isNew && _jsxs("div", { className: "row wrap fclose", children: [_jsx("button", { className: "ghost small", onClick: pdf, children: "PDF" }), d.can_edit && x.status === 'open' && _jsxs(_Fragment, { children: [_jsx("input", { placeholder: "How it was fixed / followed up", value: note, onChange: e => setNote(e.target.value) }), _jsx("button", { className: "primary small", disabled: !!busy || !note.trim(), onClick: () => close(), children: "Close it" })] }), d.can_edit && x.status === 'closed' && (kind === 'incident' || x.result !== 'pass') && _jsx("button", { className: "ghost small", disabled: !!busy, onClick: () => close(true), children: "Reopen" })] })] });
}
