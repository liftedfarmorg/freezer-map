import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { tagTxt } from './mtag';
import { Select } from './combo';
import { Scanner } from './scan';
import { routeScan, sameTag } from './scanroute';
import { screenIcon, SCAN_ICON } from './icons';
import { useScrimBack, useTabHistory, scrollTop } from './nav';
import { StrainCardHost, StrainLink } from './strainCard';
import { CompFleet, CrewFleet } from './fleet/Fleet';
import { Fragment, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CONFIG_MISSING, IS_PORTAL, makeBackend, portalUrl } from './api';
import { FREEZER_STATUSES, PRODUCT_LABEL, PRODUCT_SHORT, FINISH_LABEL } from './types';
import { DistInventory, SalesInventory } from './inventory';
import { MergeForm, MergeHere, MixedBuilder, NewPackageForm, NewPalletChooser, PickMixed, SingleForm, TagForm, WeightForm, lbs } from './forms';
import { SettingsView } from './settings';
import { AllCustomerLogins } from './custlogins';
import { ModulePeople, UsersTab } from './users';
import { AlertPeopleAll } from './notifyprefs';
import { PermissionsPanel } from './perms';
import { AdminDashboard, AdminReview, AppSettingsPanel } from './admin';
import { DeadlinesPanel, SalesDashboard, SalesReview } from './salesdash';
import { MySettings } from './mine';
import { ContractProductPrices, DocSheet, InvoicesView, MarketPricePanel, NewOrderSheet, SharedDocPage, TermsPanel } from './invoices';
import { FulfillView, STATE_LABEL } from './fulfill';
import { applyTheme } from './theme';
import { money } from './docs';
import { EMPTY, active, addMoves, addToTray, backToTray, dropFromPlan, fillStaging, laneShuffle, occupants, place, slotView, suggestions, toSave } from './plan';
import { DragGhost, draggable, onDrop } from './drag';
import { ChooseDialog, PlanBar, RemoveForm, SelectBar, UndoPill } from './planui';
import { isDry, WEIGHT_REASONS } from './metrc';
import { ArchivedView, restoreOne } from './archived';
import { ReservesView, SALES_TITLES } from './reserves';
import { Portal, PortalLink, PortalLogin } from './portal';
import { BonusScreen } from './bonus';
import { DriverHome, DriverLinkPage } from './driver';
import { DistLocations } from './locations';
import { DistDashboard } from './distdash';
import { CULT_TABS, CULT_TAIL } from './cult/tabs';
import { NURSERY_TABS, NURSERY_TAIL } from './nursery/tabs';
import { ACCT_TABS, ACCT_TAIL } from './acct/tabs';
import { PROC_TABS, PROC_TAIL } from './proc/tabs';
import { COMP_TABS, COMP_TAIL } from './comp/tabs';
import { LicensesPanel, PURPOSE_LABEL } from './licenses';
import { TestRows } from './comp/trace';
import { PackageActions } from './pkgactions';
import { MetrcWeightRow } from './comp/metrcweight';
import { CatListPanel, DEFAULT_CATEGORIES, DEFAULT_NURSERIES, NURSERIES_KEY, PRODUCT_CATEGORIES_KEY } from './catlists';
import { LoadForm, LoadView, PickLoad, TransitView, stopColor } from './loads';
import { InboundView } from './inbound';
import { ReturnsView } from './returns';
import { FeedbackView } from './feedback';
import { ReportedYieldsPage } from './reportedYields';
import { ItemsView } from './items';
import { StaffOpenMenu } from './openmenu';
import { CatalogButton } from './catalog';
import { ReceivingView } from './receiving';
import { FillTolerance, ShippingQuote, ShippingSettings, rpc } from './ship';
import { metrcRun } from './metrcCall';
import { StageAlertsAuto } from './stage';
import { TagSuggestProvider } from './tagSuggest';
import { lang, setLang, t } from './i18n';
import { setMyAccess, isAnyAdmin } from './fold';
import { WeatherBar } from './weather';
const backend = makeBackend();
// Cultivation module: its own bundle, only loaded for users who have it switched on
const CultView = lazy(() => import('./cult/CultView'));
const NurseryView = lazy(() => import('./nursery/NurseryView'));
const AccountingView = lazy(() => import('./acct/AccountingView'));
const ProcessingView = lazy(() => import('./proc/ProcessingView'));
const ComplianceView = lazy(() => import('./comp/ComplianceView'));
const MOD_KEY = { dist: 'distribution', sales: 'sales', cult: 'cultivation', nurs: 'nursery', proc: 'processing', acct: 'accounting', comp: 'compliance', admin: 'admin' };
const KEY_MOD = { distribution: 'dist', sales: 'sales', cultivation: 'cult', nursery: 'nurs', processing: 'proc', accounting: 'acct', compliance: 'comp', admin: 'admin' };
/** Admin > Settings: every module's settings in one place */
const ALL_SETTINGS = [['admin', 'Admin'], ['dist', 'Distribution'], ['sales', 'Sales'], ['cult', 'Cultivation'], ['nurs', 'Nursery'], ['proc', 'Processing'], ['acct', 'Accounting'], ['comp', 'Compliance']];
const MOD_LABEL = { dist: 'Distribution', sales: 'Sales', cult: 'Cultivation', nurs: 'Nursery', proc: 'Processing', acct: 'Accounting', comp: 'Compliance', admin: 'Admin' };
const ML = (m) => t(MOD_LABEL[m]);
const MOD_WHAT = { dist: 'Freezer map · transit · review', sales: 'Reserves · menu · orders', cult: 'Harvests · fields · plan', nurs: 'Mothers · cuttings · deliveries', proc: 'Drying · bucking · trimming', acct: 'Invoices to QuickBooks · payments', comp: 'METRC · CCOF · documents · deadlines', admin: 'Company · users · app settings' };
const MOD_SHORT = { dist: 'Dist', sales: 'Sales', cult: 'Cult', nurs: 'Nursery', proc: 'Proc', acct: 'Acct', comp: 'Comp', admin: 'Admin' };
const MOD_ICON = {
    dist: _jsxs("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", "aria-hidden": "true", children: [_jsx("rect", { x: "1", y: "7", width: "14", height: "10" }), _jsx("path", { d: "M15 10h4l3 3v4h-7" }), _jsx("circle", { cx: "6", cy: "19", r: "2" }), _jsx("circle", { cx: "18", cy: "19", r: "2" })] }),
    sales: _jsxs("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", "aria-hidden": "true", children: [_jsx("path", { d: "M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" }), _jsx("circle", { cx: "7.5", cy: "7.5", r: "1.5" })] }),
    cult: _jsx("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", "aria-hidden": "true", children: _jsx("path", { d: "M12 22V12M12 12C12 7 8 4 3 4c0 5 4 8 9 8zM12 12c0-4 3-7 8-7 0 4-3 7-8 7z" }) }),
    nurs: _jsxs("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", "aria-hidden": "true", children: [_jsx("path", { d: "M7 20h10l-1.5-6h-7z" }), _jsx("path", { d: "M12 14V9" }), _jsx("path", { d: "M12 9c0-3-2-5-5-5 0 3 2 5 5 5zM12 9c0-2.5 2-4.5 5-4.5 0 2.5-2 4.5-5 4.5z" })] }),
    proc: _jsxs("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", "aria-hidden": "true", children: [_jsx("circle", { cx: "6", cy: "6", r: "3" }), _jsx("circle", { cx: "6", cy: "18", r: "3" }), _jsx("path", { d: "M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" })] }),
    acct: _jsxs("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", "aria-hidden": "true", children: [_jsx("rect", { x: "4", y: "2", width: "16", height: "20", rx: "2" }), _jsx("path", { d: "M8 6h8M8 10h2M14 10h2M8 14h2M14 14h2M8 18h2M14 18h2" })] }),
    comp: _jsxs("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", "aria-hidden": "true", children: [_jsx("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }), _jsx("path", { d: "M14 2v6h6" }), _jsx("path", { d: "m9 15 2 2 4-4" })] }),
    admin: _jsxs("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", "aria-hidden": "true", children: [_jsx("path", { d: "M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5l-8-3z" }), _jsx("path", { d: "m9 12 2 2 4-4" })] }),
};
// 215/246: Driver sits with the modules (for people who drive and have other modules)
const DRV_ICON = _jsxs("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", "aria-hidden": "true", children: [_jsx("circle", { cx: "12", cy: "12", r: "9" }), _jsx("circle", { cx: "12", cy: "12", r: "2" }), _jsx("path", { d: "M12 14v7M10.2 11.2 3.5 9.5M13.8 11.2l6.7-1.7" })] });
const stored = (k) => { try {
    return localStorage.getItem(k);
}
catch {
    return null;
} };
const store = (k, v) => { try {
    localStorage.setItem(k, v);
}
catch { /* private mode */ } };
// ---------- helpers ----------
// custom map colors from the Strains list (name or other names), set when data loads
let strainColors = new Map();
function setStrainColors(snap) {
    strainColors = new Map((snap.strains ?? []).filter(s => s.color).flatMap(s => [s.name, ...(s.aliases ?? [])].map(n => [n.toLowerCase(), s.color])));
}
function swatch(strain) {
    const c = strain ? strainColors.get(strain.toLowerCase()) : undefined;
    if (c)
        return { cls: 'cc', style: { ['--c']: c } };
    const h = hue(strain ?? null);
    return h < 0 ? { cls: 'unk' } : { cls: '', style: { ['--h']: h } };
}
function hue(strain) {
    if (!strain)
        return -1;
    let h = 0;
    for (const c of strain.toLowerCase())
        h = (h * 31 + c.charCodeAt(0)) % 360;
    return h;
}
const when = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const who = (email) => (email ?? '').split('@')[0];
function matches(p, q, ix) {
    if (!q)
        return true;
    const s = q.toLowerCase();
    if ([p.code, p.strain, p.package_tag, p.label].some(v => v?.toLowerCase().includes(s)))
        return true;
    return p.kind === 'mixed' && !!ix && (ix.contentsOf.get(p.id) ?? []).some(c => matches(c, q));
}
function buildIndex(s) {
    const freezer = new Map(s.freezers.map(f => [f.id, f]));
    const slot = new Map(s.slots.map(x => [x.id, x]));
    const slotsOf = new Map();
    for (const x of s.slots)
        (slotsOf.get(x.freezer_id) ?? slotsOf.set(x.freezer_id, []).get(x.freezer_id)).push(x);
    const inSlot = new Map();
    const contentsOf = new Map();
    for (const p of s.pallets) {
        if (p.container_id)
            (contentsOf.get(p.container_id) ?? contentsOf.set(p.container_id, []).get(p.container_id)).push(p);
        else if (p.slot_id != null)
            (inSlot.get(p.slot_id) ?? inSlot.set(p.slot_id, []).get(p.slot_id)).push(p);
    }
    const loadOf = new Map();
    for (const it of s.items ?? []) {
        const load = s.loads?.find(l => l.id === it.load_id), stop = s.stops?.find(x => x.id === it.stop_id);
        if (load && stop && ['planning', 'loading', 'in_transit'].includes(load.status))
            loadOf.set(it.pallet_id, { item: it, load, stop });
    }
    const strainGrade = new Map();
    for (const st of s.strains ?? [])
        if (st.default_grade)
            for (const n of [st.name, ...(st.aliases ?? [])])
                strainGrade.set(n.toLowerCase().trim(), st.default_grade);
    return { freezer, slot, slotsOf, inSlot, contentsOf, loadOf, pallet: new Map(s.pallets.map(p => [p.id, p])),
        sku: new Map((s.skus ?? []).map(i => [i.id, i])), lot: new Map((s.lots ?? []).map(l => [l.id, l])), strainGrade };
}
/** SHO / BHO that applies to a pallet: this pallet > its harvest lot > the strain default */
function gradeOf(ix, p) {
    if (p.grade)
        return { grade: p.grade, from: 'pallet' };
    const l = p.lot_id != null ? ix.lot.get(p.lot_id) : undefined;
    if (l?.grade)
        return { grade: l.grade, from: 'lot' };
    return { grade: ix.strainGrade.get((p.strain ?? '').toLowerCase().trim()) ?? 'SHO', from: 'strain' };
}
/** weight of a pallet; a mixed pallet weighs what's on it */
function weightOf(ix, p) {
    return p.kind === 'mixed' ? (ix.contentsOf.get(p.id) ?? []).reduce((a, c) => a + (c.current_weight ?? 0), 0) : (p.current_weight ?? 0);
}
const isPackage = (p) => p.kind !== 'mixed';
const loose = (p) => isPackage(p) && !p.container_id && (p.status === 'in_freezer' || p.status === 'unslotted');
/** freezer names: F12 / Freezer 12, trailers R1 / Reefer 1 (GVR 101-104) */
export const fShort = (f) => f.kind === 'trailer' ? `R${f.number - 100}` : `F${f.number}`;
export const fName = (f) => f.kind === 'trailer' ? `Reefer ${f.number - 100}` : `Freezer ${f.number}`;
function whereIs(ix, slotId) {
    if (slotId == null)
        return 'Needs a spot';
    const s = ix.slot.get(slotId);
    if (!s)
        return '?';
    const f = ix.freezer.get(s.freezer_id);
    return f.kind === 'staging' ? `${f.site} Staging · ${s.row}` : f.kind === 'trailer' ? `${f.site} ${fName(f)} · ${s.code.slice(2)}` : `${f.site} F${f.number} · ${s.code}`;
}
function describe(ix, e, names) {
    const code = e.pallet_id != null ? (ix.pallet.get(e.pallet_id)?.code ?? names?.get(e.pallet_id) ?? e.details?.code ?? `#${e.pallet_id}`) : '';
    switch (e.type) {
        case 'move': {
            const k = e.details?.kind;
            return `${code} ${k === 'swap' ? 'swapped' : k === 'shuffle' ? 'shuffled' : k === 'undo' ? 'moved back' : 'moved'} ${whereIs(ix, e.from_slot_id)} to ${whereIs(ix, e.to_slot_id)}`;
        }
        case 'removed': {
            const r = e.details?.reason;
            return `${code} removed: ${r === 'used' ? 'used up' : r === 'shipped' ? 'shipped outside the app' : 'entered by mistake'} (${lbs(e.lbs)})`;
        }
        case 'unslot': return `${code} taken out of ${whereIs(ix, e.from_slot_id)}`;
        case 'staged': return `${code} landed in ${whereIs(ix, e.to_slot_id)} (no spot yet)`;
        case 'restored': {
            const d = e.details;
            return `${code} brought back from Archived to ${e.to_slot_id != null ? whereIs(ix, e.to_slot_id) : `Needs a spot at ${d?.site ?? ''}`} (${lbs(e.lbs)})`;
        }
        case 'pallet_deleted': return `${code} deleted for good (was archived, ${lbs(e.lbs)})`;
        case 'created': return `${code} entered by hand at ${whereIs(ix, e.to_slot_id)} (${lbs(e.lbs)})`;
        case 'mixed_created': {
            const d = e.details;
            return `${code} mixed pallet started at ${whereIs(ix, e.to_slot_id)} with ${(d?.packages ?? []).join(', ')}`;
        }
        case 'mixed_added': {
            const d = e.details;
            return `${code}: added ${(d?.packages ?? []).join(', ')}`;
        }
        case 'mixed_on': {
            const d = e.details;
            return `${code} put on mixed pallet ${d?.mixed} (${lbs(e.lbs)})`;
        }
        case 'mixed_off': {
            const d = e.details;
            return d?.broken ? `${code} unstacked from ${d?.mixed}, now its own pallet` : `${code} taken off ${d?.mixed} to ${whereIs(ix, e.to_slot_id)}`;
        }
        case 'mixed_broken': {
            const d = e.details;
            return `${code} broken apart: ${(d?.packages ?? []).join(', ')} now separate`;
        }
        case 'import': return `${code} imported at ${whereIs(ix, e.to_slot_id)}`;
        case 'review_cleared': return `${code} review flag cleared`;
        case 'review_flagged': return `${code} flagged for review: ${e.note ?? ''}`;
        case 'split': {
            const d = e.details;
            return `${code} split: ${lbs(e.lbs)} off to ${d?.child}${d?.mixed ? ` (onto ${d.mixed})` : ''}, ${lbs(d?.remaining)} left`;
        }
        case 'split_from': {
            const d = e.details;
            return `${code} created from ${d?.parent} (${lbs(e.lbs)})${d?.mixed ? ` onto ${d.mixed}` : ''}${d?.tag ? '' : ', tag pending'}`;
        }
        case 'repackage': {
            const d = e.details;
            return `${code} repackaged onto ${tagTxt(d?.to)} (was ${tagTxt(d?.from)}), ${lbs(e.lbs)}${d?.item_name ? `, item ${d.item_name}` : ''}`;
        }
        case 'merge': {
            const d = e.details;
            return `${code} made by merging ${(d?.sources ?? []).join(', ')} (${lbs(e.lbs)})`;
        }
        case 'merged_into': {
            const d = e.details;
            return `${code} merged into ${d?.into} (${lbs(e.lbs)})`;
        }
        case 'tag_set': {
            const d = e.details;
            return `${code} METRC tag ${d?.from ? `changed from ${d.from} ` : ''}set to ${d?.to}`;
        }
        case 'weight_adjust': {
            const d = e.details;
            const r = WEIGHT_REASONS.find(x => x.k === d?.reason);
            return `${code} weight adjusted ${d?.from != null ? `from ${lbs(d.from)} ` : ''}to ${lbs(d?.to)}${r ? ` (${r.l})` : ''}`;
        }
        case 'weight_audit': {
            const d = e.details;
            return `${code} weight set ${d?.from != null ? `from ${lbs(d.from)} ` : ''}to ${lbs(d?.to)} in the app only (audit, not sent to METRC)`;
        }
        case 'manifest_sync': {
            const d = e.details;
            const m = `manifest ${d?.manifest ?? ''} (already in METRC)`;
            const tg = d?.tag ? ` ${tagTxt(d.tag)}` : '';
            if (d?.shipped_to)
                return d.new ? `${code}${tg} added as shipped to ${d.shipped_to} from ${d.from ?? ''}: ${m}` : `${code}${tg} shipped to ${d.shipped_to}: ${m}`;
            if (d?.to_site)
                return d.new ? `${code}${tg} made from ${d.from ?? ''} and sent to ${d.to_site}: ${m}` : `${code} tagged${tg}, sent to ${d.to_site}: ${m}`;
            if (typeof d?.from === 'number' || d?.to != null)
                return `${code} weight ${d?.from != null ? `from ${lbs(Number(d.from))} ` : ''}to ${lbs(d?.to)}: ${m}`;
            return `${code} caught up with ${m}`;
        }
        case 'freezer_status': {
            const f = e.freezer_id != null ? ix.freezer.get(e.freezer_id) : undefined;
            const d = e.details;
            return `${f ? `${f.site} Freezer ${f.number}` : 'Freezer'}: ${d?.from} to ${d?.to}`;
        }
        case 'sheet_sync': {
            const d = e.details;
            return `${code} filled in from the spreadsheet: ${d?.strain ?? ''} ${lbs(d?.weight)}`;
        }
        case 'load_created': return `Load ${e.details?.load} created`;
        case 'load_updated': return `Load ${e.details?.load} edited`;
        case 'load_planned': {
            const d = e.details;
            return `${code} planned on ${d?.load}, position ${d?.position}`;
        }
        case 'load_removed': return `${code} removed from ${e.details?.load}`;
        case 'loaded': {
            const d = e.details;
            return `${code} pulled from ${whereIs(ix, e.from_slot_id)} onto ${d?.load}, position ${d?.position}`;
        }
        case 'unloaded': return `${code} taken off ${e.details?.load}, back to ${whereIs(ix, e.to_slot_id)}`;
        case 'load_departed': return `Load ${e.details?.load} departed`;
        case 'load_cancelled': return `Load ${e.details?.load} cancelled`;
        case 'stop_outcome':
        case 'stop_outcome_fixed': {
            const d = e.details;
            return `${d?.load} stop ${d?.seq} ${d?.customer}: ${e.type === 'stop_outcome_fixed' ? `changed to ${d?.label} (was ${d?.was ?? 'nothing'})` : d?.label}${d?.receiver ? `, received by ${d.receiver}` : ''}${d?.back ? `, ${d.back} coming back` : ''}${d?.via === 'link' ? ' (carrier link)' : d?.via === 'office' ? ' (office)' : ''}`;
        }
        case 'reserve_back': {
            const d = e.details;
            return `${d?.customer}: ${(d?.lines ?? []).map(x => `${x.strain} ${lbs(x.lbs)}`).join(', ')} rejected at delivery (${d?.so ?? ''} ${d?.load} stop ${d?.seq}), back on their reserve. Lower the reserve if they shouldn't get it back`;
        }
        case 'reserve_back_undone': {
            const d = e.details;
            return `${d?.customer}: ${d?.load} stop ${d?.seq} changed to ${(d?.now ?? '').replace('_', ' ')}, rejected lbs no longer back on their reserve`;
        }
        case 'order_back_ready': {
            const d = e.details;
            return `${d?.so ?? 'Order'} back to Ready (rescheduled, received back from ${d?.load})`;
        }
        case 'returned_back': {
            const d = e.details;
            return `${code} came back from ${d?.customer} on ${d?.load}${d?.reason ? ` (${d.reason.replace('_', ' ')})` : ''}, received at ${d?.site}`;
        }
        case 'stop_delivered': {
            const d = e.details;
            return `${d?.load} stop ${d?.seq} delivered to ${d?.customer}`;
        }
        case 'shipped_out': return `${code} taken out of inventory: ${e.note ?? 'shipped'} (${lbs(e.lbs)})`;
        case 'shipped': {
            const d = e.details;
            return `${code} delivered to ${d?.customer} on ${d?.load} (${lbs(e.lbs)})`;
        }
        case 'received': {
            const d = e.details;
            return `${code} received at ${d?.customer} from ${d?.load}, needs a spot`;
        }
        case 'strain_renamed': {
            const d = e.details;
            return `${code} strain renamed from ${d?.from} to ${d?.to}`;
        }
        case 'settings': {
            const d = e.details;
            return `${d?.list ? d.list[0].toUpperCase() + d.list.slice(1, -1) : 'Setting'} "${d?.name}" ${e.note === 'added' ? 'added' : d?.active === false ? 'retired' : 'updated'}`;
        }
        case 'user_role': {
            const d = e.details;
            return d?.was ? `${d?.email} changed from ${d.was} to ${d.role}` : `${d?.email} added as ${d?.role}`;
        }
        case 'reserve_set': {
            const d = e.details;
            return d?.lbs === 0 ? `Reserve removed: ${d?.customer} · ${d?.strain}` : `Reserve ${d?.was != null ? `changed ${lbs(Number(d.was))} →` : 'set:'} ${d?.customer} · ${d?.strain} ${lbs(Number(d?.lbs ?? 0))}`;
        }
        case 'reserve_import': {
            const d = e.details;
            return `Reserves loaded from ${e.note ?? 'a file'}: ${d?.rows} reserves, ${d?.customers} customers, ${lbs(Number(d?.lbs ?? 0))}`;
        }
        case 'reserve_request': {
            const d = e.details;
            return `Reserve request: ${d?.customer} · ${d?.strain} ${lbs(Number(d?.from ?? 0))} → ${lbs(Number(d?.to ?? 0))}`;
        }
        case 'reserve_approved':
        case 'reserve_declined': {
            const d = e.details;
            return `Reserve request ${e.type === 'reserve_approved' ? 'approved' : 'declined'}: ${d?.customer} · ${d?.strain} ${lbs(Number(d?.from ?? 0))} → ${lbs(Number(d?.to ?? 0))}`;
        }
        case 'user_removed': return `${e.note} removed from users`;
        case 'fulfill_assigned':
        case 'fulfill_unassigned':
        case 'fulfill_cant_fill':
        case 'fulfill_can_fill':
        case 'fulfill_loaded':
        case 'fulfill_unloaded':
        case 'order_fill_ok': {
            const d = e.details;
            const o = `${d?.customer ?? ''}${d?.so ? ` ${d.so}` : ''}`;
            const code = e.pallet_id != null ? (ix.pallet.get(e.pallet_id)?.code ?? names?.get(e.pallet_id) ?? `#${e.pallet_id}`) : '';
            if (e.type === 'fulfill_assigned')
                return `${code} assigned to ${o}${e.lbs ? ` (${lbs(Number(e.lbs))})` : ''}`;
            if (e.type === 'fulfill_unassigned')
                return `${code} unassigned from ${o}`;
            if (e.type === 'fulfill_cant_fill')
                return `${o}: can't fill ${d?.strain}`;
            if (e.type === 'fulfill_can_fill')
                return `${o}: ${d?.strain} back on`;
            if (e.type === 'fulfill_loaded')
                return `${o} put on ${d?.load}`;
            if (e.type === 'fulfill_unloaded')
                return `${o} taken off ${d?.load}`;
            return `${o}: Sales OK'd ${d?.strain} at ${lbs(Number(d?.to ?? 0))} (ordered ${lbs(Number(d?.from ?? 0))})`;
        }
        case 'user_access': {
            const d = e.details;
            return `${d?.email}: ${d?.kind !== 'staff' ? d?.kind : d?.owner ? 'Owner' : Object.entries(d?.access ?? {}).map(([m, l]) => `${m} ${l}`).join(', ') || 'no modules'}`;
        }
        case 'app_setting': {
            const d = e.details;
            return `App setting ${d?.key} set to ${d?.value}`;
        }
        case 'user_hidden_modules': {
            const d = e.details;
            return `${d?.email} hidden modules: ${(d?.hidden ?? []).join(', ') || 'none'}`;
        }
        case 'user_modules': {
            const d = e.details;
            return `${d?.email} modules: ${(d?.modules ?? []).join(', ') || 'none'}`;
        }
        case 'harvested': {
            const d = e.details;
            return `${code} harvested: ${d?.strain} from ${d?.site} ${d?.field ?? ''} (${lbs(e.lbs)})${d?.tag ? '' : ', tag pending'}, needs a spot`;
        }
        case 'proc_wet': {
            const d = e.details;
            return `${code} wet package: ${d?.strain} from ${d?.site} ${d?.field ?? ''} (${lbs(e.lbs)})${d?.tag ? '' : ', tag pending'}${d?.sent ? `, sent to ${d.processor}` : ''}`;
        }
        case 'proc_sent': {
            const d = e.details;
            return `${code} sent to ${d?.processor} for drying (${lbs(e.lbs)})`;
        }
        case 'proc_received': {
            const d = e.details;
            return `${code} back from ${d?.processor ?? 'the processor'} unbucked, at ${d?.site}${d?.new_tag ? ` (new tag ${tagTxt(d.new_tag)})` : ''}`;
        }
        case 'proc_dried': return `${code} dried in house, now unbucked`;
        case 'proc_run_started': {
            const d = e.details;
            return `${d?.run} ${d?.kind === 'buck' ? 'bucking' : 'trimming'} started: ${d?.strain}, ${(d?.packages ?? []).join(', ')} (${lbs(e.lbs)})`;
        }
        case 'proc_run_done': {
            const d = e.details;
            return `${d?.run} ${d?.kind === 'buck' ? 'bucked' : 'trimmed'}: ${d?.strain} ${lbs(Number(d?.in ?? 0))} in, ${lbs(Number(d?.out ?? 0))} out, ${lbs(Number(d?.mold ?? 0))} mold, ${lbs(Number(d?.loss ?? 0))} ${d?.kind === 'buck' ? 'moisture' : 'difference'}`;
        }
        case 'proc_run_cancelled': {
            const d = e.details;
            return `${d?.run} cancelled`;
        }
        case 'proc_output': {
            const d = e.details;
            return `${code} ${d?.product} from ${d?.run}: ${d?.strain} (${lbs(e.lbs)}), needs a spot`;
        }
        case 'proc_used': {
            const d = e.details;
            return `${code} ${d?.whole ? 'used up' : `${lbs(e.lbs)} used`} in ${d?.run}`;
        }
        case 'proc_request': {
            const d = e.details;
            return `Trim request ${d?.new ? 'added' : 'changed'}: ${lbs(e.lbs)} ${d?.strain} ${d?.product}${d?.customer ? ` for ${d.customer}` : ''}${d?.due ? `, due ${d.due}` : ''}`;
        }
        case 'proc_request_status': {
            const d = e.details;
            return `Trim request marked ${d?.status}`;
        }
        case 'proc_settings': return `Processing settings: ${e.note}`;
        case 'proc_promised': {
            const d = e.details;
            return `${lbs(e.lbs)} ${d?.product} from ${code} promised to ${d?.so}`;
        }
        case 'proc_unpromised': return `Promise on ${code} taken off`;
        case 'proc_promise_filled': {
            const d = e.details;
            return `${lbs(e.lbs)} ${d?.strain} ${d?.product} put on ${d?.so}`;
        }
        case 'pay_day': {
            const d = e.details;
            return `Crew day logged: ${d?.date} ${d?.task === 'buck' ? 'bucking' : 'trimming'} ${d?.run ?? d?.strain ?? ''} (${d?.rows} ${d?.rows === 1 ? 'person' : 'people'})`;
        }
        case 'pay_employee': return `Crew: ${e.note}`;
        case 'pay_rate': {
            const d = e.details;
            return `Piece rate: ${d?.task === 'buck' ? 'bucking' : 'trimming'} $${d?.rate}/lb at ${d?.target} lb/hr from ${d?.effective_from}`;
        }
        case 'pay_closed': {
            const d = e.details;
            return `Pay period from ${d?.starts} closed${d?.total != null ? ` ($${Number(d.total).toFixed(2)})` : ''}`;
        }
        case 'pay_reopened': {
            const d = e.details;
            return `Pay period from ${d?.starts} reopened`;
        }
        case 'pay_exported': {
            const d = e.details;
            return `Pay period from ${d?.starts} sent to payroll`;
        }
        case 'pay_adjusted': {
            const d = e.details;
            return d?.removed ? `Pay adjustment removed (period from ${d?.starts})` : `Pay adjustment: ${d?.employee} $${d?.amount} (${d?.reason})`;
        }
        case 'order_created': {
            const d = e.details;
            return `${d?.so ?? 'Order'} created for ${d?.customer ?? ''}${d?.lines ? ` (${d.lines} line${d.lines === 1 ? '' : 's'})` : ''}`;
        }
        case 'acct_sent': {
            const d = e.details;
            return `${d?.inv} sent to ${d?.env === 'production' ? 'QuickBooks' : 'the QuickBooks sandbox'}${d?.total != null ? ` (${money(Number(d.total))})` : ''}`;
        }
        case 'acct_error': {
            const d = e.details;
            return `${d?.inv} couldn't go to ${d?.env === 'production' ? 'QuickBooks' : 'the sandbox'}`;
        }
        case 'acct_connected': {
            const d = e.details;
            return `QuickBooks ${d?.env} connected${d?.company ? `: ${d.company}` : ''}`;
        }
        case 'acct_disconnected': {
            const d = e.details;
            return `QuickBooks ${d?.env} disconnected`;
        }
        case 'acct_settings': return `Accounting settings: ${e.note} changed`;
        case 'comp_doc_added': {
            const d = e.details;
            return `Document added: ${e.note}${(d?.version ?? 1) > 1 ? ` (version ${d?.version})` : ''}`;
        }
        case 'comp_doc_updated': return `Document changed: ${e.note}`;
        case 'comp_doc_deleted': return `Document removed: ${e.note}`;
        case 'comp_deadline_saved': return `Deadline saved: ${e.note}`;
        case 'comp_deadline_done': {
            const d = e.details;
            return `Done: ${e.note}${d?.next ? ` (next due ${d.next})` : ''}`;
        }
        case 'comp_deadline_deleted': return `Deadline deleted: ${e.note}`;
        case 'comp_material': {
            const d = e.details;
            return `CCOF material ${e.note}${d?.changes?.ccof_status ? `: ${d.changes.ccof_status.replace('_', ' ')}` : ' updated'}`;
        }
        case 'comp_metrc_status': {
            const d = e.details;
            return `${d?.n ?? ''} METRC action${d?.n === 1 ? '' : 's'} marked ${e.note === 'todo' ? 'to do' : e.note === 'error' ? 'problem' : e.note}`;
        }
        case 'comp_metrc_upload': {
            const d = e.details;
            return `METRC export uploaded for ${e.note} (${d?.rows ?? 0} packages)`;
        }
        case 'comp_error': return `METRC error logged: ${e.note}`;
        case 'comp_error_fixed': return `METRC error fixed: ${e.note}`;
        case 'comp_playbook': return `Playbook: ${e.note}`;
        case 'comp_customer_license': {
            const d = e.details;
            return `Customer license for ${e.note}: ${d?.license ?? 'none'}${d?.expires ? `, expires ${d.expires}` : ''}`;
        }
        case 'comp_license': {
            const d = e.details;
            return `License ${e.note} expires ${d?.expires ?? '(no date)'}`;
        }
        case 'comp_setting': return `Compliance settings: ${e.note}`;
        case 'comp_backup': {
            const d = e.details;
            return `SharePoint backup: ${d?.copied ?? 0} copied, ${d?.archived ?? 0} archived, ${d?.failed ?? 0} failed`;
        }
        case 'sample_set': {
            const d = e.details;
            return `${e.note ?? 'Order'} ${d?.sample ? 'marked as a sample' : 'no longer a sample'}${d?.customer ? ` (${d.customer})` : ''}`;
        }
        case 'sample_hold': {
            const d = e.details;
            return `Sample hold ${e.note}${d?.customer ? ` for ${d.customer}` : ''}: ${d?.release ? 'released' : `until ${d?.until}`}`;
        }
        case 'fleet_driver': {
            const d = e.details;
            return `${d?.new ? 'Driver added' : 'Driver changed'}: ${e.note}${d?.carrier ? ' (carrier)' : ''}`;
        }
        case 'fleet_carrier': {
            const d = e.details;
            return `${d?.new ? 'Carrier added' : 'Carrier changed'}: ${e.note}`;
        }
        case 'fleet_asset': {
            const d = e.details;
            return `${d?.new ? 'Vehicle added' : 'Vehicle changed'}: ${e.note}`;
        }
        case 'fleet_inspection': {
            const d = e.details;
            return `Inspection${d?.result ? ` (${d.result === 'pass' ? 'passed' : d.result === 'defects' ? 'defects found' : 'out of service'})` : ''}: ${e.note}`;
        }
        case 'fleet_maintenance': return `Maintenance: ${e.note}`;
        case 'fleet_incident': return `Incident reported: ${e.note}`;
        case 'fleet_closed': {
            const d = e.details;
            return `${d?.open ? 'Reopened' : 'Closed'}: ${e.note}`;
        }
        case 'fleet_deleted': return `Vehicle report removed: ${e.note}`;
        case 'invoice_paid': {
            const d = e.details;
            return `${d?.inv} paid${d?.via ? ` (from ${d.via})` : ''}`;
        }
        default: return `${e.type} ${code}`;
    }
}
// opened from a request email: go straight to Sales > Requests or Orders
const GO = new URLSearchParams(location.search).get('go');
const GO_TAB = GO === 'requests' || GO === 'orders' ? GO : null;
// back from connecting QuickBooks (api/qbo/callback): Accounting > Settings
const GO_ACCT = GO === 'accounting';
// ?go=accounting&tab=settings: Intuit's Connect / Reconnect link (and public/qbo-disconnected.html) open Accounting > Settings
const GO_ACCT_SETTINGS = GO_ACCT && new URLSearchParams(location.search).get('tab') === 'settings';
const QBO_BACK = (() => { const q = new URLSearchParams(location.search); return q.get('qbo') ? { qbo: q.get('qbo'), msg: q.get('msg') } : null; })();
export default function App() {
    const [user, setUser] = useState(undefined);
    const [me, setMe] = useState(null);
    const [snap, setSnap] = useState(null);
    const [site, setSite] = useState('OHR');
    useEffect(() => { if (GO)
        history.replaceState(null, '', location.pathname); }, []);
    const storedMod = stored('fm.mod');
    const [view, setView] = useState(GO_ACCT ? 'acct' : GO_TAB ? 'sales' : storedMod === 'cult' ? 'cult' : storedMod === 'nurs' ? 'nursery' : storedMod === 'acct' ? 'acct' : storedMod === 'proc' ? 'proc' : storedMod === 'comp' ? 'comp' : storedMod === 'sales' ? 'sales' : storedMod === 'admin' ? 'admin' : 'dash');
    const [mod, setModS] = useState(GO_ACCT ? 'acct' : GO_TAB ? 'sales' : storedMod && storedMod in MOD_KEY ? storedMod : 'dist');
    const [cultTab, setCultTabS] = useState(() => ([...CULT_TABS, ...CULT_TAIL].find(t => t.t === stored('cult.tab'))?.t ?? 'dashboard'));
    const [salesTab, setSalesTabS] = useState(GO_TAB ?? 'dash');
    const [adminSet, setAdminSet] = useState('admin');
    const [adminTab, setAdminTabS] = useState('dash');
    const [procTab, setProcTabS] = useState(() => ([...PROC_TABS, ...PROC_TAIL].find(x => x.t === stored('proc.tab'))?.t ?? 'dashboard'));
    const [compTab, setCompTabS] = useState(() => ([...COMP_TABS, ...COMP_TAIL].find(x => x.t === stored('comp.tab'))?.t ?? 'dashboard'));
    const [acctTab, setAcctTabS] = useState(GO_ACCT ? (QBO_BACK || GO_ACCT_SETTINGS ? 'settings' : 'dashboard') : 'dashboard');
    const [nurTab, setNurTabS] = useState(() => ([...NURSERY_TABS, ...NURSERY_TAIL].find(t => t.t === stored('nur.tab'))?.t ?? 'dashboard'));
    const [modMenu, setModMenu] = useState(false);
    const [railMenu, setRailMenu] = useState(false);
    const [acctMenu, setAcctMenu] = useState(false); // phone: the initials menu (My settings, Sign out)
    const [more, setMore] = useState(false); // 281 (phone): the top pill opens modules, the bottom More opens this module's other screens
    // Scan (bottom bar in Distribution and Processing): camera open, a tag nobody has, an older pallet found by its tag
    const [scanning, setScanning] = useState(false);
    const [scanMiss, setScanMiss] = useState(null);
    const [scanned, setScanned] = useState(null);
    const top = () => { setMore(false); scrollTop(); };
    const setCultTab = (t) => { setCultTabS(t); store('cult.tab', t); setView('cult'); top(); };
    const setSalesTab = (t) => { setSalesTabS(t); setView('sales'); top(); };
    const setAdminTab = (t) => { setAdminTabS(t); setView('admin'); top(); };
    const setNurTab = (t) => { setNurTabS(t); store('nur.tab', t); setView('nursery'); top(); };
    const setAcctTab = (t) => { setAcctTabS(t); setView('acct'); top(); };
    const setProcTab = (t) => { setProcTabS(t); store('proc.tab', t); setView('proc'); top(); };
    const setCompTab = (t) => { setCompTabS(t); store('comp.tab', t); setView('comp'); top(); };
    const lastView = useRef('dash');
    const go = (v) => { if (view !== 'mine' && view !== 'fleet' && view !== 'driver')
        lastView.current = view; setView(v); top(); };
    const [freezerId, setFreezerId] = useState(null);
    const [palletId, setPalletId] = useState(null);
    const [plan, setPlan] = useState(EMPTY);
    const [selecting, setSelecting] = useState(false);
    const [sel, setSel] = useState([]);
    const [choose, setChoose] = useState(null);
    const [removeP, setRemoveP] = useState(null);
    const [archQ, setArchQ] = useState(null);
    const [lastBatch, setLastBatch] = useState(null);
    const [pickLoadMany, setPickLoadMany] = useState(null);
    const [tagPool, setTagPool] = useState([]);
    const [placing, setPlacing] = useState(null);
    const [confirm, setConfirm] = useState(null);
    const [toast, setToast] = useState(null);
    const [query, setQuery] = useState('');
    const [extra, setExtra] = useState([]);
    const [busy, setBusy] = useState(false);
    const [loadError, setLoadError] = useState(null);
    const [form, setForm] = useState(null);
    const [crossSite, setCrossSite] = useState(null);
    const [pool, setPool] = useState([]);
    const [loadId, setLoadId] = useState(null);
    const [counts, setCounts] = useState({ orders: 0, requests: 0 });
    // phone / browser Back: steps back through modules, tabs, freezers and loads; pop-up sheets close first
    useScrimBack();
    useTabHistory({ view, mod, cultTab, salesTab, adminTab, adminSet, procTab, compTab, acctTab, nurTab, freezerId, loadId }, s => {
        setModS(s.mod);
        store('fm.mod', s.mod);
        setCultTabS(s.cultTab);
        setSalesTabS(s.salesTab);
        setAdminTabS(s.adminTab);
        setAdminSet(s.adminSet);
        setProcTabS(s.procTab);
        setCompTabS(s.compTab);
        setAcctTabS(s.acctTab);
        setNurTabS(s.nurTab);
        setFreezerId(s.freezerId);
        setLoadId(s.loadId);
        setView(s.view);
        setMore(false);
        setModMenu(false);
    });
    const isSales = !!me?.access?.modules.sales;
    const salesAdmin = me?.access?.modules.sales === 'admin';
    const refreshCounts = useCallback(() => { if (isSales)
        backend.salesCounts().then(setCounts).catch(() => { }); }, [isSales]);
    useEffect(() => { refreshCounts(); if (!isSales)
        return; const t = setInterval(refreshCounts, 60000); return () => clearInterval(t); }, [isSales, refreshCounts]);
    const salesBadge = counts.orders + (salesAdmin ? counts.requests : 0);
    const [loadForm, setLoadForm] = useState(null);
    const [pickLoad, setPickLoad] = useState(null);
    const [invTick, setInvTick] = useState(0); // bumps after a pallet action so Processing reloads its own data
    const reload = useCallback(async () => { const s = await backend.load(); setStrainColors(s); setSnap(s); }, []);
    const flash = (text, bad = false) => { setToast({ text, bad }); setTimeout(() => setToast(null), bad ? 5000 : 2500); };
    useEffect(() => { backend.getUser().then(setUser); }, []);
    useEffect(() => {
        setMe(null);
        if (!user)
            return;
        backend.me().then(setMe).catch(e => setLoadError(String(e?.message ?? e)));
    }, [user]);
    const staff = !!me && ['admin', 'sales', 'crew'].includes(me.role);
    // language: the person's own setting (an Admin may have set it for them); English until signed in
    if (me && (me.access?.prefs?.lang ?? 'en') !== lang())
        setLang(me.access?.prefs?.lang ?? 'en');
    setMyAccess(me?.access ?? null);
    const lv = me?.access?.modules ?? {};
    const MODS = Object.keys(MOD_KEY).map(m => ({ m, l: ML(m), on: !!lv[MOD_KEY[m]] }));
    const myMods = MODS.filter(x => x.on);
    const noMods = staff && myMods.length === 0;
    const isDrv = !!me?.access?.driver;
    const [drvTab, setDrvTab] = useState('loads');
    const inDrv = view === 'driver' && isDrv;
    const modCount = myMods.length + (isDrv ? 1 : 0);
    const cur = myMods.some(x => x.m === mod) ? mod : myMods[0]?.m ?? 'dist';
    const inCult = cur === 'cult';
    const isAdminOf = (m) => lv[MOD_KEY[m]] === 'admin';
    const goMod = (m) => {
        setModS(m);
        store('fm.mod', m);
        setModMenu(false);
        setNewOrder(false);
        setPalletId(null); // Msg 310: a side card left open doesn't follow you to the next module
        if (m === 'cult')
            setCultTab('dashboard');
        else if (m === 'nurs')
            setNurTab('dashboard');
        else if (m === 'acct')
            setAcctTab('dashboard');
        else if (m === 'proc')
            setProcTab('dashboard');
        else if (m === 'comp')
            setCompTab('dashboard');
        else if (m === 'sales')
            setSalesTab('dash');
        else if (m === 'admin')
            setAdminTab('dash');
        else
            go('dash');
    };
    // signed in: personal settings (theme, where to start, which site)
    useEffect(() => {
        if (!me || !staff)
            return;
        const p = me.access?.prefs ?? {};
        if (p.theme)
            applyTheme(p.theme);
        if (p.start_site)
            setSite(p.start_site);
        if (!GO_TAB && !GO_ACCT && p.start_module && lv[p.start_module])
            goMod(KEY_MOD[p.start_module]);
    }, [me?.email]);
    // the module we're in isn't on for this person: go to one that is
    useEffect(() => { if (staff && cur !== mod && myMods.length)
        goMod(cur); }, [cur, mod, staff, myMods.length]);
    // Fulfillment: open orders and the pallets held for them (Distribution and Sales)
    const [forders, setForders] = useState(null);
    const [fOpen, setFOpen] = useState(null); // order open in Fulfillment (a load's stop can open one)
    useEffect(() => { if (view !== 'fulfill')
        setFOpen(null); }, [view]);
    const canFulfill = !!lv.distribution || !!lv.sales;
    const [fErr, setFErr] = useState(null);
    const [doc, setDoc] = useState(null);
    const [newOrder, setNewOrder] = useState(false);
    // Msg 323: drag the sidebar's screens into your own order (per module, saved to your login). Dashboard stays first; the 3 under
    // it are the phone bar. menuDrag = the order while a drag is going on; dragRef tracks the press before it becomes a drag.
    const [menuDrag, setMenuDrag] = useState(null);
    const dragRef = useRef(null);
    const [ordersKey, setOrdersKey] = useState(0);
    const refreshF = useCallback(async () => {
        if (!canFulfill)
            return;
        try {
            setForders(await backend.fulfillmentOrders());
            setFErr(null);
        }
        catch (e) {
            setForders([]);
            setFErr(String(e.message ?? e));
        }
    }, [canFulfill]);
    useEffect(() => {
        if (!staff || (noMods && me?.access?.driver))
            return;
        reload().then(() => setLoadError(null)).catch(e => setLoadError(String(e?.message ?? e)));
        refreshF();
        return backend.subscribe(() => { reload(); refreshF(); }, () => refreshF());
    }, [staff, reload, refreshF, noMods]);
    // search outside the live set (archived / old pallets) once the query is specific
    useEffect(() => {
        if (query.trim().length < 3) {
            setExtra([]);
            return;
        }
        const t = setTimeout(() => backend.search(query.trim()).then(setExtra).catch(() => setExtra([])), 350);
        return () => clearTimeout(t);
    }, [query]);
    const ix = useMemo(() => snap && buildIndex(snap), [snap]);
    // new mixed pallets: next tags from the site's range
    useEffect(() => {
        setTagPool([]);
        if (!ix || !form || (form.kind !== 'newmixed' && form.kind !== 'addmixed'))
            return;
        const slotId = form.kind === 'addmixed' ? form.m.slot_id : 'slot' in form ? form.slot.id : null;
        const f = slotId != null ? ix.freezer.get(ix.slot.get(slotId)?.freezer_id ?? -1) : undefined;
        if (f)
            backend.nextTags(f.site, 'mixed', 30).then(setTagPool).catch(() => { });
    }, [form?.kind, ix]);
    const L = useMemo(() => ix && {
        inSlot: id => ix.inSlot.get(id) ?? [], pallet: id => ix.pallet.get(id), slot: id => ix.slot.get(id),
        slotsOf: id => ix.slotsOf.get(id) ?? [], freezer: id => ix.freezer.get(id),
    }, [ix]);
    // a pallet that changed under the plan (moved by someone else, shipped) drops out of the tray
    useEffect(() => {
        if (!ix || !active(plan))
            return;
        const gone = [...plan.tray, ...plan.moves.map(m => m.id)].filter(id => { const p = ix.pallet.get(id); return !p || p.container_id || !['in_freezer', 'unslotted'].includes(p.status); });
        if (gone.length)
            setPlan(pl => gone.reduce(dropFromPlan, pl));
    }, [ix]);
    // undo is offered for 15 minutes
    useEffect(() => { if (!lastBatch)
        return; const t = setTimeout(() => setLastBatch(null), 15 * 60000 - (Date.now() - lastBatch.at)); return () => clearTimeout(t); }, [lastBatch]);
    function doPlace(id, slot, mode) {
        if (!L)
            return;
        const r = place(L, plan, id, slot.id, mode);
        if (r === 'choose')
            setChoose({ id, slot });
        else {
            setPlan(r);
            setChoose(null);
        }
    }
    onDrop((d, t) => {
        if (!ix || !L)
            return;
        if (d.span) { // trailer: stretch a pallet over more spots (saved right away), or back to one spot
            if ('tray' in t)
                return;
            const p = ix.pallet.get(d.id);
            act(() => backend.setSpan(d.id, t.slot === p?.slot_id ? null : t.slot), t.slot === p?.slot_id ? `${p?.code} back to one spot` : `${p?.code} now takes more spots`);
            return;
        }
        const ids = d.ids?.length ? d.ids : [d.id];
        if ('tray' in t) {
            setPlan(pl => addToTray(pl, ids));
            return;
        }
        const slot = ix.slot.get(t.slot);
        if (!slot)
            return;
        if (ids.length === 1) {
            doPlace(d.id, slot);
            return;
        }
        // a whole stack: the first one lands like a single pallet would (into an empty spot), the rest stack on it
        setPlan(pl => {
            let next = pl;
            ids.forEach((id, i) => { const r = place(L, next, id, slot.id, i === 0 && occupants(slotView(L, next, slot.id)).length === 0 ? undefined : 'stack'); if (r !== 'choose')
                next = r; });
            return next;
        });
    });
    async function applyPlan(skipCross = false) {
        if (!L)
            return;
        const moves = toSave(L, plan);
        if (!moves.length) {
            setPlan(EMPTY);
            return;
        }
        // OHR <> GVR on the map: offer a real transfer (load + METRC manifest) instead of a to-do
        if (!skipCross && ix) {
            const siteOfSlot = (id) => id == null ? null : ix.freezer.get(ix.slot.get(id)?.freezer_id ?? -1)?.site ?? null;
            const cross = moves.map(m => {
                const p = ix.pallet.get(m.pallet_id);
                const from = siteOfSlot(m.from_slot) ?? (p ? siteOf(p) : null);
                const to = siteOfSlot(m.to_slot);
                return from && to && from !== to ? { id: m.pallet_id, from: String(from), to: String(to) } : null;
            }).filter((x) => !!x);
            if (cross.length) {
                setCrossSite({ moves, cross });
                return;
            }
        }
        setBusy(true);
        try {
            const id = await backend.applyMoves(moves);
            await reload();
            setPlan(EMPTY);
            setSel([]);
            setSelecting(false);
            setLastBatch({ id, n: moves.length, at: Date.now() });
            flash(`Saved ${moves.length} move${moves.length === 1 ? '' : 's'}`);
        }
        catch (e) {
            flash(e.message, true);
            reload().catch(() => { });
        }
        finally {
            setBusy(false);
        }
    }
    async function act(fn, ok) {
        setBusy(true);
        try {
            await fn();
            await reload();
            setInvTick(t => t + 1);
            refreshF().catch(() => { });
            flash(ok);
        }
        catch (e) {
            flash(e.message, true);
        }
        finally {
            setBusy(false);
        }
    }
    async function submit(fn, ok, after) {
        setBusy(true);
        let r;
        try {
            r = await fn();
        }
        catch (e) {
            flash(e.message, true);
            setBusy(false);
            return;
        }
        // saved: close the form now; a slow or failed refresh afterwards isn't a failed save
        setForm(null);
        flash(ok(r));
        after?.(r);
        try {
            await reload();
            setInvTick(t => t + 1);
            refreshF().catch(() => { });
        }
        catch (e) {
            flash(`Saved. Refreshing the map failed (${e.message}); it updates on its own shortly.`, true);
        }
        finally {
            setBusy(false);
        }
    }
    function slotLabel(slot) {
        const f = ix.freezer.get(slot.freezer_id);
        return f.kind === 'staging' ? `${f.site} Staging · ${slot.row}` : f.kind === 'trailer' ? `${f.site} ${fName(f)} · ${slot.code.slice(2)}` : `${f.site} F${f.number} · ${slot.code}`;
    }
    function tapSlot(slot) {
        if (!ix)
            return;
        const here = ix.inSlot.get(slot.id) ?? [];
        const f = ix.freezer.get(slot.freezer_id);
        if (placing) {
            const pl = placing;
            const go = async () => { setPlacing(null); await pl.run(slot); };
            if (here.length)
                setConfirm({ text: `${slot.code} already has ${here.map(h => h.code).join(', ')}. Stack on top? Each pallet keeps its own number.`, ok: 'Stack', run: go });
            else
                go();
            return;
        }
        if (plan.current != null) {
            doPlace(plan.current, slot);
            return;
        }
        if (selecting)
            return;
        if (here.length)
            setPalletId(here[0].id);
        else if (f.status === 'Not Working')
            flash(`${fName(f)} is marked Not Working`, true);
        else
            setForm({ kind: 'newchoice', slot });
    }
    if (CONFIG_MISSING)
        return (_jsxs("div", { className: "center", children: [_jsx("h2", { children: "Setup needed" }), _jsx("p", { className: "muted", children: "This build has no database connection. In Vercel, set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then redeploy." })] }));
    const refreshUser = () => backend.getUser().then(setUser);
    const linkParams = new URLSearchParams(location.search);
    const link = linkParams.get('invite') ? { kind: 'invite', code: linkParams.get('invite') } : linkParams.get('reset') ? { kind: 'reset', code: linkParams.get('reset') } : null;
    const docToken = linkParams.get('doc');
    if (docToken)
        return _jsx(SharedDocPage, { backend: backend, token: docToken });
    const bonusToken = linkParams.get('bonus');
    if (bonusToken)
        return _jsx(BonusScreen, { backend: backend, token: bonusToken });
    const driveToken = linkParams.get('drive');
    if (driveToken && backend.client())
        return _jsx(DriverLinkPage, { sb: backend.client(), token: driveToken });
    if (link)
        return _jsx(PortalLink, { backend: backend, kind: link.kind, code: link.code, onDone: refreshUser });
    if (user === undefined)
        return _jsx(Splash, {});
    if (!user)
        return IS_PORTAL ? _jsx(PortalLogin, { backend: backend, onDone: refreshUser }) : _jsx(Login, {});
    if (user && !me && !loadError)
        return _jsx(Splash, {});
    const viewBar = me?.viewing_as ? _jsx(ViewAsBar, { me: me, stop: () => backend.stopViewAs().then(() => location.reload()) }) : null;
    if (me?.role === 'customer')
        return _jsxs(_Fragment, { children: [viewBar, _jsx(Portal, { backend: backend, me: me, signOut: () => backend.signOut().then(() => setUser(null)) })] });
    // driver-only login (215): no modules, set up as a driver: just the Driver screen
    if (me && staff && noMods && me.access?.driver && backend.client())
        return _jsxs(_Fragment, { children: [viewBar, _jsx(DriverHome, { sb: backend.client(), name: me.display_name ?? me.email, nf: (me.access?.prefs?.notify ?? {}), onLang: l => { backend.setMyPrefs({ ...(me.access?.prefs ?? {}), lang: l }).then(p => setMe(m => m && ({ ...m, access: { ...m.access, prefs: p } }))).catch(() => { }); }, signOut: () => backend.signOut().then(() => setUser(null)) })] });
    if (me && !staff)
        return _jsxs(_Fragment, { children: [viewBar, _jsx(NoAccess, { me: me, signOut: () => backend.signOut().then(() => setUser(null)) })] });
    if (loadError && !snap)
        return (_jsxs("div", { className: "center", children: [_jsx("h2", { children: "Couldn't load the app" }), _jsx("p", { className: "muted", children: loadError }), _jsxs("div", { className: "row", style: { justifyContent: 'center' }, children: [_jsx("button", { className: "primary", onClick: () => { setLoadError(null); reload().catch(e => setLoadError(String(e?.message ?? e))); }, children: "Try again" }), _jsx("button", { className: "ghost", onClick: () => backend.signOut().then(() => setUser(null)), children: "Sign out" })] })] }));
    if (!snap || !ix)
        return _jsx(Splash, {});
    const siteFreezers = snap.freezers.filter(f => f.site === site && (f.kind ?? 'freezer') === 'freezer' && f.active !== false).sort((a, b) => a.number - b.number);
    const siteTrailers = snap.freezers.filter(f => f.site === site && f.kind === 'trailer' && f.active !== false).sort((a, b) => a.number - b.number);
    const unplaced = snap.pallets.filter(p => p.status === 'unslotted' && !p.container_id);
    const review = snap.pallets.filter(p => p.needs_review);
    const pendingTags = snap.pallets.filter(p => p.tag_pending);
    const inStaging = (p) => !p.container_id && p.status === 'in_freezer' && p.slot_id != null && ix.freezer.get(ix.slot.get(p.slot_id)?.freezer_id ?? -1)?.kind === 'staging';
    const fromHarvest = snap.pallets.filter(p => inStaging(p) && p.staged_reason === 'harvest');
    const agingCut = Date.now() - STAGING_AGING_DAYS * 86400000;
    const aging = snap.pallets.filter(p => inStaging(p) && p.staged_at && Date.parse(p.staged_at) < agingCut)
        .sort((a, b) => Date.parse(a.staged_at) - Date.parse(b.staged_at));
    const reviewCount = aging.length + review.length + pendingTags.length + unplaced.length;
    const selected = palletId != null ? (ix.pallet.get(palletId) ?? pool.find(p => p.id === palletId) ?? extra.find(p => p.id === palletId) ?? (scanned?.id === palletId ? scanned : null)) : null;
    const where = (p) => {
        const m = p.container_id ? ix.pallet.get(p.container_id) : undefined;
        if (m)
            return `on ${m.code} · ${where(m)}`;
        const lo = ix.loadOf.get(p.id);
        if (p.status === 'in_transit' && lo)
            return `On truck ${lo.load.code} · position ${lo.item.position}`;
        if (p.status === 'unslotted' && p.received_site)
            return `Received at ${p.received_site}, needs a spot`;
        return whereIs(ix, p.slot_id);
    };
    // PICK-1: freezer, spot and what sits between a pallet and the door (Plan my pick)
    const locCache = new Map();
    const locOf = (p) => locCache.get(p.id) ?? (locCache.set(p.id, locCalc(p)), locCache.get(p.id));
    const locCalc = (p) => {
        const top = p.container_id ? ix.pallet.get(p.container_id) ?? p : p;
        const s = top.slot_id != null ? ix.slot.get(top.slot_id) : undefined;
        const f = s ? ix.freezer.get(s.freezer_id) : undefined;
        if (!s || !f)
            return { fz: null, fzLabel: 'Needs a spot', sort: 9999, site: top.received_site ?? null, spot: '', front: 99, side: '', inFront: [] };
        const staging = f.kind === 'staging', trailer = f.kind === 'trailer';
        const inFront = [];
        if (!staging)
            for (const o of ix.slot.values())
                if (o.freezer_id === f.id && o.col === s.col && o.front_rank < s.front_rank)
                    for (const q of ix.inSlot.get(o.id) ?? [])
                        inFront.push(q.id);
        return { fz: f.id, fzLabel: staging ? `${f.site} Staging` : trailer ? `${f.site} ${fName(f)}` : `${f.site} Freezer ${f.number}`,
            sort: staging ? 0 : trailer ? 1000 + f.number : f.number, site: f.site, staging, spot: staging ? `S${s.row}` : trailer ? s.code.slice(2) : s.code,
            front: staging ? s.row : s.front_rank, side: staging ? '' : s.col === 1 ? 'Left' : 'Right', inFront };
    };
    const siteOf = (p) => {
        const top = p.container_id ? ix.pallet.get(p.container_id) ?? p : p;
        const fz = top.slot_id != null ? ix.freezer.get(ix.slot.get(top.slot_id)?.freezer_id ?? -1) : undefined;
        return fz?.site ?? top.received_site ?? null;
    };
    const looseList = snap.pallets.filter(loose).filter(p => !ix.loadOf.has(p.id));
    const openLoads = (snap.loads ?? []).filter(l => ['planning', 'loading', 'in_transit'].includes(l.status));
    const heldBy = new Map();
    for (const o of forders ?? [])
        if (o.state !== 'shipped')
            for (const l of o.lines)
                for (const pk of l.picks)
                    heldBy.set(pk.pallet_id, o);
    // Msg 327: the customer(s) a pallet is held or loaded for; a mixed pallet goes by the packages on it
    const custOne = (id) => heldBy.get(id)?.customer ?? (ix.loadOf.has(id) ? (snap.customers ?? []).find(c => c.id === ix.loadOf.get(id).stop.customer_id)?.name : undefined);
    const custFor = (id) => { const names = [...new Set([custOne(id), ...(ix.contentsOf.get(id) ?? []).map(k => custOne(k.id))].filter(Boolean))]; return names.length ? names.join(', ') : undefined; };
    const toFulfill = (forders ?? []).filter(o => o.state === 'open' || o.state === 'ready').length;
    const canonOf = (() => { const m = new Map(); for (const st of snap.strains ?? [])
        for (const n of [st.name, ...(st.aliases ?? [])])
            m.set(n.toLowerCase(), st.name.toLowerCase()); return (x) => { const k = (x ?? '').trim().toLowerCase(); return m.get(k) ?? k; }; })();
    const ctx = {
        loads: snap.loads ?? [], stops: snap.stops ?? [], items: snap.items ?? [],
        vehicles: snap.vehicles ?? [], customers: snap.customers ?? [], drivers: snap.drivers ?? [],
        pallet: id => ix.pallet.get(id), contents: id => ix.contentsOf.get(id) ?? [], weight: p => weightOf(ix, p), where,
        freezerSpot: id => whereIs(ix, id),
        available: snap.pallets.filter(p => !p.container_id && (p.status === 'in_freezer' || (p.status === 'unslotted' && !!p.received_site)) && !ix.loadOf.has(p.id)),
        siteOf,
        held: id => { const o = heldBy.get(id); return o ? `${o.customer} · ${o.so ?? 'order'}` : undefined; },
        busy,
        run: async (fn, ok) => { setBusy(true); try {
            await fn();
            await reload();
            setInvTick(t => t + 1);
            refreshF().catch(() => { });
            flash(ok);
            return true;
        }
        catch (e) {
            flash(e.message, true);
            await reload().catch(() => { });
            refreshF().catch(() => { });
            return false;
        }
        finally {
            setBusy(false);
        } },
        confirm: (text, ok, fn) => setConfirm({ text, ok, run: fn }),
        openPallet: id => setPalletId(id),
        orders: forders ?? [],
        openOrder: id => { setFOpen(id); go('fulfill'); },
        refreshOrders: refreshF,
        canShip: isSales,
        canRecord: lv.distribution === 'user' || lv.distribution === 'admin' || !!me?.access?.owner,
        newMixedOnStop: (stop, onTruck) => setForm({ kind: 'stopmixed', stop, onTruck }),
        putBack: (item, p) => { setView('map'); startPlacing({ title: `Putting ${p.code} back in a freezer`, sub: 'Open a freezer and tap the slot.', run: slot => act(() => backend.unloadPallet(item.id, slot.id), `${p.code} back in ${slot.code}`) }); },
        api: backend,
        loc: locOf, backend, flash, reloadAll: async () => { await reload(); await refreshF(); },
        freeFor: l => snap.pallets.filter(p => (p.status === 'in_freezer' || p.status === 'unslotted') && p.pushed !== false && !p.container_id && p.kind !== 'mixed' && (p.current_weight ?? 0) > 0
            && canonOf(p.strain) === canonOf(l.strain) && (p.product ?? 'fresh_frozen') === (l.product ?? 'fresh_frozen')
            && (p.crop_year == null || l.crop_year == null || p.crop_year === l.crop_year) && !heldBy.has(p.id) && !ix.loadOf.has(p.id) && !snap.inRun?.[p.id]),
    };
    const invCtx = {
        pallets: snap.pallets, pallet: id => ix.pallet.get(id), where, grade: p => gradeOf(ix, p),
        item: id => id != null ? ix.sku.get(id) : undefined, lot: id => id != null ? ix.lot.get(id) : undefined,
        held: id => { const o = heldBy.get(id); return o ? `${o.customer} · ${o.so ?? 'order'}` : undefined; },
        onLoad: id => ix.loadOf.get(id)?.load.code, inRun: id => snap.inRun?.[id], open: id => setPalletId(id), site: siteOf,
    };
    const byNearness = (p) => (a, b) => {
        const fz = (x) => ix.slot.get(x.slot_id ?? -1)?.freezer_id;
        return Number(b.slot_id === p.slot_id) - Number(a.slot_id === p.slot_id)
            || Number(fz(b) === fz(p)) - Number(fz(a) === fz(p))
            || where(a).localeCompare(where(b), undefined, { numeric: true });
    };
    // pallets on the same stop of a load that hasn't left (planned or on the truck) can be merged / mixed with each other
    const editLoadOf = (id) => { const lo = ix.loadOf.get(id); return lo && ['planning', 'loading'].includes(lo.load.status) ? lo : undefined; };
    const sameStop = (p) => { const lo = editLoadOf(p.id); return lo ? snap.pallets.filter(x => x.id !== p.id && !x.container_id && isPackage(x) && editLoadOf(x.id)?.item.stop_id === lo.item.stop_id) : []; };
    const mergeCandidates = (p) => [...looseList, ...sameStop(p)]
        .filter(x => x.id !== p.id && x.kind !== 'mixed' && x.pushed !== false && !!x.strain && !!p.strain && x.strain.toLowerCase() === p.strain.toLowerCase()
        && (x.product ?? 'fresh_frozen') === (p.product ?? 'fresh_frozen')
        && (!isDry(p) || (x.crop_year ?? null) === (p.crop_year ?? null))) // METRC merges one item: dry needs the same product and crop
        .sort(byNearness(p));
    const mixedList = snap.pallets.filter(p => p.kind === 'mixed' && (p.status === 'in_freezer' || (p.status === 'in_transit' && !!editLoadOf(p.id))))
        .map(p => ({ p, n: ix.contentsOf.get(p.id)?.length ?? 0, w: weightOf(ix, p) }));
    const strainNames = (snap.strains ?? []).filter(s => s.active).map(s => s.name);
    const canDist = lv.distribution === 'user' || lv.distribution === 'admin';
    // a scanned tag: the screen you're on gets first go (order, load, Processing), then the pallet card, then "not found"
    const handleScan = async (tag) => {
        setScanning(false);
        if (await routeScan(tag))
            return;
        const hit = snap.pallets.find(p => sameTag(p.package_tag, tag));
        if (hit) {
            setPalletId(hit.id);
            return;
        }
        try {
            const old = (await backend.search(tag)).find(p => sameTag(p.package_tag, tag));
            if (old) {
                setScanned(old);
                setPalletId(old.id);
                return;
            }
        }
        catch { /* not found below */ }
        setScanMiss({ tag, checked: false, range: null });
        const sb = backend.client();
        const done = (range) => setScanMiss(m => m && m.tag === tag ? { ...m, checked: true, range } : m);
        if (!sb) {
            done(null);
            return;
        }
        sb.from('tag_ranges').select('*').then(({ data }) => {
            const r = (data ?? [])
                .find(r => tag.startsWith(r.prefix) && tag.length === r.prefix.length + r.digits && Number(tag.slice(r.prefix.length)) >= r.first_n && Number(tag.slice(r.prefix.length)) <= r.last_n);
            done(r ? `${r.site} · ${t(PURPOSE_LABEL[r.purpose] ?? r.purpose)}${r.license ? ` · ${r.license}` : ''}${r.active === false ? ` (${t('range switched off')})` : ''}` : null);
        });
    };
    const newWithTag = (tag) => {
        setView('map');
        startPlacing({ title: t('New pallet with tag …{x}', { x: tag.slice(-6) }), sub: t('Open a freezer and tap the slot it goes in.'), run: async (slot) => setForm({ kind: 'newsingle', slot, tag }) });
    };
    const openFreezer = (id) => { setFreezerId(id); setView('freezer'); scrollTop(); };
    const goTo = (slotId) => {
        const s = slotId != null ? ix.slot.get(slotId) : undefined;
        if (s) {
            const f = ix.freezer.get(s.freezer_id);
            setSite(f.site);
            openFreezer(f.id);
        }
    };
    const startPlacing = (pl, from) => {
        setPlacing(pl);
        setPalletId(null);
        setForm(null);
        if (from)
            goTo(from.container_id ? ix.pallet.get(from.container_id)?.slot_id ?? null : from.slot_id);
    };
    // pallet actions started outside the freezer map (Processing package sheet); the dialogs are the same ones the map uses
    const invAct = (pp, kind) => {
        const p = ix.pallet.get(pp.id) ?? pp;
        if (kind === 'split' || kind === 'merge' || kind === 'tag' || kind === 'weight')
            setForm({ kind, p });
        else if (kind === 'addto')
            setForm({ kind: 'pickmixed', p });
        else if (kind === 'load')
            setPickLoad(p);
        else if (kind === 'remove')
            setRemoveP(p);
    };
    const invFlag = (pp, why) => act(() => why == null ? backend.clearReview(pp.id) : backend.flagReview(pp.id, why), why == null ? 'Flag cleared' : 'Flagged for review');
    const invInfo = (id) => {
        const p = ix.pallet.get(id), m = p?.container_id ? ix.pallet.get(p.container_id) : undefined;
        return { load: ix.loadOf.get(id)?.load.code, mixed: m?.code, inSnap: !!p };
    };
    const banner = placing ? { title: placing.title, sub: placing.sub, cancel: () => setPlacing(null) } : null;
    const stagingOf = (st) => snap.freezers.find(f => f.site === st && f.kind === 'staging');
    const curFreezer = view === 'freezer' && freezerId != null ? ix.freezer.get(freezerId) : undefined;
    const lanes = L && plan.tray.length === 0 ? suggestions(L, plan) : [];
    const tapPallet = (p, role, s) => {
        if (placing) {
            tapSlot(s);
            return;
        }
        if (selecting && role === 'stay' && !active(plan)) {
            setSel(x => x.includes(p.id) ? x.filter(i => i !== p.id) : [...x, p.id]);
            return;
        }
        if (role === 'incoming') {
            setPlan(pl => backToTray(pl, p.id));
            return;
        }
        if (role === 'leaving') {
            setPlan(pl => dropFromPlan(pl, p.id));
            flash(`${p.code} stays where it is`);
            return;
        }
        if (plan.current != null) {
            doPlace(plan.current, s);
            return;
        }
        setPalletId(p.id);
    };
    const compact = () => {
        if (!L || !curFreezer)
            return;
        const ls = [1, 2].map(c => laneShuffle(L, plan, curFreezer, c)).filter(x => !!x);
        if (!ls.length) {
            flash('No gaps to close in this freezer');
            return;
        }
        setPlan(pl => ls.reduce((acc, l) => addMoves(acc, l.moves), pl));
        flash('Shuffle added to the plan. Tap Apply to save.');
    };
    const invStrains = snap.pallets.reduce((m, p) => p.strain ? m.set(p.strain, (m.get(p.strain) ?? 0) + 1) : m, new Map());
    // each module's settings, used in the module and again in Admin > Settings
    const distSettings = _jsx(SettingsView, { backend: backend, flash: flash, onChanged: () => { reload(); }, inventoryStrains: invStrains, title: "Distribution settings", lists: ['strains'], extra: [{ k: 'locations', l: 'Locations', node: _jsx(DistLocations, { sb: backend.client(), flash: flash, onChanged: () => { reload(); } }) }, { k: 'vehicles', l: 'Vehicles', node: _jsx(CompFleet, { sb: backend.client(), flash: flash, dept: "distribution" }) }, { k: 'people', l: 'People', node: _jsx(ModulePeople, { sb: backend.client(), module: "distribution", flash: flash }) }] }, "dist-set");
    // Msg 300: Customers has its own home in the sidebar (Sales and Admin), with Customer logins beside it
    const customersHome = (k, ro = false) => _jsx(SettingsView, { home: true, readOnly: ro, backend: backend, flash: flash, onChanged: () => { reload(); }, inventoryStrains: invStrains, title: "Customers", focus: "sales", lists: ['customers'], canTerms: salesAdmin, extra: ro ? [] : [{ k: 'logins', l: 'Customer logins', node: _jsx(AllCustomerLogins, { backend: backend, customers: snap.customers ?? [], flash: flash }) }] }, k);
    const salesSettings = _jsx(SettingsView, { backend: backend, flash: flash, onChanged: () => { reload(); }, inventoryStrains: invStrains, title: "Sales settings", focus: "sales", lists: ['strains'], canTerms: salesAdmin, extra: [
            { k: 'categories', l: 'Product categories', node: _jsx(CatListPanel, { backend: backend, k: PRODUCT_CATEGORIES_KEY, dflt: DEFAULT_CATEGORIES, title: "Product categories", noun: "Category", canEdit: salesAdmin, flash: flash, intro: "What a customer can be marked as buying (on each customer's Overview). Internal for Sales: used to sort and filter customers. Sales admins add, rename, reorder and remove them.", usedBy: c => (snap.customers ?? []).filter(x => (x.product_categories ?? []).includes(c)).length }) },
            { k: 'terms', l: 'Payment terms', node: _jsx(TermsPanel, { backend: backend, flash: flash, canEdit: salesAdmin }) },
            { k: 'market', l: 'Market price', node: _jsx(MarketPricePanel, { backend: backend, flash: flash, canEdit: salesAdmin }) },
            { k: 'contract', l: 'Contract product prices', node: _jsx(ContractProductPrices, { backend: backend, flash: flash, canEdit: salesAdmin }) },
            { k: 'deadlines', l: 'Reserve deadlines', node: _jsx(DeadlinesPanel, { backend: backend, flash: flash }) },
            { k: 'shipping', l: 'Shipping', node: _jsx(ShippingSettings, { sb: backend.client(), flash: flash, canEdit: salesAdmin || isAdminOf('dist') }) },
            { k: 'fulfill', l: 'Fulfillment', node: _jsx(FillTolerance, { sb: backend.client(), flash: flash, canEdit: salesAdmin || isAdminOf('dist') }) },
            { k: 'people', l: 'People', node: _jsx(ModulePeople, { sb: backend.client(), module: "sales", flash: flash }) }
        ] }, "sales-set");
    const cultSettings = _jsx(Suspense, { fallback: _jsx("p", { className: "muted", children: "Loading\u2026" }), children: _jsx(CultView, { backend: backend, flash: flash, tab: "setup", go: setCultTab, onPalletsChanged: () => { reload(); } }) });
    const strainSettings = _jsx("div", { className: "modset", children: _jsx(SettingsView, { backend: backend, flash: flash, onChanged: () => { reload(); }, inventoryStrains: invStrains, title: "Cultivation", lists: ['strains'], focus: "cult", extra: [{ k: 'nurseries', l: 'Nurseries', node: _jsx(CatListPanel, { backend: backend, k: NURSERIES_KEY, dflt: DEFAULT_NURSERIES, title: "Nurseries", noun: "Nursery", canEdit: isAdminOf('cult') || isAdminOf('nurs'), flash: flash, intro: "Where our plants come from: our own nursery (1PN) and outside nurseries. Pick them on each strain. Cultivation and Nursery admins edit this list.", usedBy: n => (snap.strains ?? []).filter(x => (x.nurseries ?? []).includes(n)).length }) }] }, "cult-strains") });
    const nurStrainSettings = _jsx("div", { className: "modset", children: _jsx(SettingsView, { backend: backend, flash: flash, onChanged: () => { reload(); }, inventoryStrains: invStrains, title: "Nursery", lists: ['strains'], focus: "nurs", extra: [{ k: 'nurseries', l: 'Nurseries', node: _jsx(CatListPanel, { backend: backend, k: NURSERIES_KEY, dflt: DEFAULT_NURSERIES, title: "Nurseries", noun: "Nursery", canEdit: isAdminOf('cult') || isAdminOf('nurs'), flash: flash, intro: "Where our plants come from: our own nursery (1PN) and outside nurseries. Pick them on each strain. Cultivation and Nursery admins edit this list.", usedBy: n => (snap.strains ?? []).filter(x => (x.nurseries ?? []).includes(n)).length }) }] }, "nurs-strains") });
    const selWeight = sel.reduce((a, id) => { const p = ix.pallet.get(id); return a + (p ? weightOf(ix, p) : 0); }, 0);
    // ---------- navigation: the same shape in every module ----------
    // main screens at the top (Dashboard first), then Review, Activity and Settings at the bottom
    const badge = (n, warn = false) => n > 0 ? _jsx("span", { className: `badge ${warn ? 'warn' : ''}`, children: n }) : null;
    // 171: Items is one screen, in every module's menu
    const itemsNav = { k: 'items', l: 'Items', on: view === 'items', go: () => go('items') };
    const distMain = [
        { k: 'dash', l: 'Dashboard', on: view === 'dash', go: () => go('dash') },
        { k: 'map', l: 'Map', on: view === 'map' || view === 'freezer', go: () => go(view !== 'map' && view !== 'freezer' && freezerId != null ? 'freezer' : 'map') },
        { k: 'inventory', l: 'Inventory', on: view === 'inventory', go: () => go('inventory') },
        itemsNav,
        { k: 'fulfill', l: _jsxs(_Fragment, { children: ["Fulfillment", badge(toFulfill)] }), s: t('Fulfill'), n: toFulfill, on: view === 'fulfill', go: () => go('fulfill') },
        { k: 'transit', l: _jsxs(_Fragment, { children: ["Transit", badge(openLoads.length)] }), s: 'Transit', n: openLoads.length, on: view === 'transit' || view === 'load', go: () => go('transit') },
        ...(staff ? [{ k: 'inbound', l: 'Inbound', on: view === 'inbound', go: () => go('inbound') }] : []),
        ...(staff ? [{ k: 'archived', l: 'Archived', on: view === 'archived', go: () => { setArchQ(null); go('archived'); } }] : []),
        ...(isAdminOf('dist') ? [{ k: 'customers', l: 'Customers', on: view === 'customers', go: () => go('customers') }] : []),
    ];
    const distTail = [
        { k: 'review', l: _jsxs(_Fragment, { children: ["Review", badge(reviewCount, true)] }), s: 'Review', n: reviewCount, warn: true, on: view === 'review', go: () => go('review') },
        { k: 'activity', l: 'Activity', on: view === 'activity', go: () => go('activity') },
        ...(isAdminOf('dist') ? [{ k: 'settings', l: 'Settings', on: view === 'settings', go: () => go('settings') }] : []),
    ];
    const sItem = (t, l, x) => ({ k: t, l, ...x, on: view === 'sales' && salesTab === t, go: () => setSalesTab(t) });
    const salesMain = [sItem('dash', 'Dashboard'), sItem('inventory', 'Inventory'), itemsNav, sItem('menu', SALES_TITLES.menu), sItem('orders', _jsxs(_Fragment, { children: ["Orders", badge(counts.orders, true)] }), { s: 'Orders', n: counts.orders, warn: true }), sItem('invoices', 'Invoices'), sItem('returns', 'Returns'), sItem('shipping', 'Shipping'),
        sItem('requests', _jsxs(_Fragment, { children: ["Requests", badge(counts.requests, salesAdmin)] }), { s: 'Requests', n: counts.requests, warn: salesAdmin }), sItem('customer', 'Reserves'), sItem('strain', 'By strain'), sItem('customers', 'Customers'), sItem('feedback', 'Customer feedback'), sItem('yields', 'Reported Yields')];
    const fillsToOk = (forders ?? []).filter(o => o.state === 'needs_ok').length;
    const salesTail = [sItem('review', _jsxs(_Fragment, { children: ["Review", badge(salesBadge + fillsToOk, true)] }), { s: 'Review', n: salesBadge + fillsToOk, warn: true }), sItem('activity', 'Activity'), ...(isAdminOf('sales') ? [sItem('settings', 'Settings')] : [])];
    const cItem = (t, l) => ({ k: t, l, on: view === 'cult' && cultTab === t, go: () => setCultTab(t) });
    const cultMain = [...CULT_TABS.map(x => cItem(x.t, t(x.l))), itemsNav];
    const cultTail = CULT_TAIL.filter(x => x.t !== 'setup' || isAdminOf('cult')).map(x => cItem(x.t, t(x.l)));
    const aItem = (t, l) => ({ k: t, l, on: view === 'admin' && adminTab === t, go: () => setAdminTab(t) });
    const adminMain = [aItem('dash', 'Dashboard'), aItem('customers', 'Customers')], adminTail = [aItem('review', 'Review'), aItem('activity', 'Activity'), aItem('settings', 'Settings')];
    const nItem = (t, l) => ({ k: t, l, on: view === 'nursery' && nurTab === t, go: () => setNurTab(t) });
    const nurMain = [...NURSERY_TABS.map(x => nItem(x.t, t(x.l))), itemsNav];
    const nurTail = NURSERY_TAIL.filter(x => x.t !== 'settings' || isAdminOf('nurs')).map(x => nItem(x.t, t(x.l)));
    const prItem = (t, l) => ({ k: t, l, on: view === 'proc' && procTab === t, go: () => setProcTab(t) });
    const procMain = [...PROC_TABS.map(x => prItem(x.t, t(x.l))), itemsNav];
    const procTail = PROC_TAIL.filter(x => x.t !== 'settings' || isAdminOf('proc')).map(x => prItem(x.t, t(x.l)));
    const acItem = (t, l) => ({ k: t, l, on: view === 'acct' && acctTab === t, go: () => setAcctTab(t) });
    const acctMain = [...ACCT_TABS.map(x => acItem(x.t, x.l)), itemsNav];
    const acctTail = ACCT_TAIL.filter(x => x.t !== 'settings' || isAdminOf('acct')).map(x => acItem(x.t, x.l));
    const coItem = (t, l) => ({ k: t, l, on: view === 'comp' && compTab === t, go: () => setCompTab(t) });
    const compMain = [...COMP_TABS.map(x => coItem(x.t, x.l)), itemsNav];
    const compTail = COMP_TAIL.filter(x => x.t !== 'settings' || isAdminOf('comp')).map(x => coItem(x.t, x.l));
    const NAV = {
        acct: { main: acctMain, tail: acctTail }, proc: { main: procMain, tail: procTail }, comp: { main: compMain, tail: compTail },
        dist: { main: distMain, tail: distTail }, sales: { main: salesMain, tail: salesTail }, cult: { main: cultMain, tail: cultTail }, nurs: { main: nurMain, tail: nurTail }, admin: { main: adminMain, tail: adminTail }
    };
    // Msg #248: each department's vehicles and equipment (inspections, maintenance, incidents) live in its module
    const MOD_DEPT = { dist: 'distribution', cult: 'cultivation', nurs: 'nursery', proc: 'processing' };
    const equipItem = MOD_DEPT[cur] ? { k: 'fleet', l: cur === 'dist' ? t('Vehicles') : t('Equipment'), on: view === 'fleet' && !inDrv, go: () => go('fleet') } : null;
    if (equipItem)
        NAV[cur].tail.splice(Math.max(0, NAV[cur].tail.findIndex(x => x.k === 'activity')), 0, equipItem);
    // Msg 310: going to another screen closes the app-wide side cards (new order, package) so they don't squeeze the next screen
    const closeSides = () => { setNewOrder(false); setPalletId(null); };
    const wrapGo = (x) => ({ ...x, go: () => { closeSides(); x.go(); } });
    const orderMain = (items) => {
        if (items.length < 3)
            return items;
        const [first, ...rest] = items;
        const want = menuDrag && menuDrag.mod === cur ? menuDrag.keys : me?.access?.prefs?.menu_order?.[cur];
        if (!want?.length)
            return items;
        const pos = new Map(want.map((k, i) => [k, i]));
        // screens in the saved order first; screens added since keep their place after them
        const known = rest.filter(x => pos.has(x.k)).sort((a, b) => pos.get(a.k) - pos.get(b.k)), fresh = rest.filter(x => !pos.has(x.k));
        return [first, ...known, ...fresh];
    };
    const nav = { ...NAV[cur], main: orderMain(NAV[cur].main).map(wrapGo), tail: NAV[cur].tail.map(wrapGo) };
    const saveMenuOrder = (mod, keys) => {
        const prefs = { ...(me?.access?.prefs ?? {}), menu_order: { ...(me?.access?.prefs?.menu_order ?? {}), [mod]: keys } };
        setMe(m => m && ({ ...m, access: { ...m.access, prefs } }));
        backend.setMyPrefs({ menu_order: prefs.menu_order }).catch(e => flash(`Menu order not saved: ${e.message}`, true));
    };
    const railPress = (x, e) => {
        if (e.button !== 0)
            return;
        const keys = nav.main.slice(1).map(n => n.k);
        dragRef.current = { k: x.k, y: e.clientY, keys, mod: cur, started: false, moved: false };
        const move = (ev) => {
            const d = dragRef.current;
            if (!d)
                return;
            if (!d.started && Math.abs(ev.clientY - d.y) > 5) {
                d.started = true;
                setMenuDrag({ mod: d.mod, keys: d.keys, k: d.k });
            }
        };
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            const d = dragRef.current;
            if (d?.started) {
                setMenuDrag(null);
                if (d.moved)
                    saveMenuOrder(d.mod, d.keys);
                setTimeout(() => { dragRef.current = null; }, 0);
            }
            else
                dragRef.current = null;
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    };
    const railEnter = (x, i) => {
        const d = dragRef.current;
        if (!d?.started || x.k === d.k || i === 0)
            return;
        const keys = d.keys.filter(k => k !== d.k);
        keys.splice(i - 1, 0, d.k);
        d.keys = keys;
        d.moved = true;
        setMenuDrag({ mod: d.mod, keys, k: d.k });
    };
    const railClick = (x) => { if (dragRef.current?.started)
        return; x.go(); };
    const all = [...nav.main, ...nav.tail];
    // phone bottom bar: module button, the module's first four screens (Scan in the middle in Distribution and Processing)
    const bottomFit = all.slice(0, 4);
    const extras = [];
    const bottomRest = [...all.slice(4), ...extras];
    const restOn = bottomRest.some(x => x.on);
    const restBadge = all.slice(4).reduce((a, x) => a + (x.n ?? 0), 0);
    const canScan = cur === 'dist' || cur === 'proc' || cur === 'cult' || cur === 'nurs'; // 279: Cultivation and Nursery get the Scan button too
    const shortL = (x) => x.k === 'dash' || x.k === 'dashboard' ? t('Home') : x.s ?? (typeof x.l === 'string' ? x.l : x.k);
    const curScreen = all.find(x => x.on) ?? extras.find(x => x.on);
    const pageTitle = view === 'mine' ? t('My settings') : inDrv ? t('My loads') : !curScreen || curScreen.k === 'dash' || curScreen.k === 'dashboard' ? ML(cur) : typeof curScreen.l === 'string' ? curScreen.l : curScreen.s ?? ML(cur);
    const jump = (j) => {
        const [m, t] = j.split('.');
        if (!lv[MOD_KEY[m]]) {
            flash(`You don't have ${MOD_LABEL[m]}`, true);
            return;
        }
        setModS(m);
        store('fm.mod', m);
        if (m === 'dist')
            go(t);
        else if (m === 'sales')
            setSalesTab(t);
        else if (m === 'cult')
            setCultTab(t);
        else if (m === 'nurs')
            setNurTab(t);
        else if (m === 'acct')
            setAcctTab(t);
        else if (m === 'proc')
            setProcTab(t);
        else if (m === 'comp')
            setCompTab(t);
        else
            setAdminTab(t === 'users' ? 'settings' : t);
    };
    const appName = inDrv ? t('Driver') : ML(cur);
    document.title = noMods ? 'Lifted Farms' : `${view === 'mine' ? t('My settings') : view === 'fleet' ? (cur === 'dist' ? t('Vehicles') : t('Equipment')) : view === 'driver' ? t('Driver') : ML(cur)} · Lifted Farms`;
    return (_jsx(TagSuggestProvider, { sb: backend.client(), site: site, children: _jsxs("div", { className: `app shell ${noMods ? '' : 'with-rail'} ${modCount > 1 ? 'with-mods' : ''} ${banner ? 'is-moving' : ''} mod-${cur} ${!noMods && lv[MOD_KEY[cur]] === 'view' ? 'viewonly' : ''}`, style: { ['--navw']: '248px' }, children: [viewBar, !noMods && (_jsxs("aside", { className: "rail", "aria-label": "Navigation", children: [_jsxs("div", { className: "rail-head", children: [_jsx("img", { className: "rail-logo", src: "/logo-dark.svg", alt: "Lifted Farms" }), modCount > 1 && _jsxs("div", { className: "rail-pick", children: [_jsxs("button", { className: "rail-pickbtn", "aria-haspopup": "menu", "aria-expanded": railMenu, onClick: () => setRailMenu(!railMenu), children: [_jsx("span", { className: "rail-pick-i", children: inDrv ? DRV_ICON : MOD_ICON[cur] }), _jsxs("span", { className: "rail-pick-l", children: [_jsx("small", { children: t('Module') }), _jsx("b", { children: inDrv ? t('Driver') : ML(cur) })] }), _jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", "aria-hidden": "true", children: _jsx("path", { d: "M6 9l6 6 6-6" }) })] }), railMenu && _jsxs(_Fragment, { children: [_jsx("div", { className: "modscrim", onClick: () => setRailMenu(false) }), _jsxs("div", { className: "rail-menu", role: "menu", children: [myMods.map(x => _jsxs("button", { role: "menuitem", className: cur === x.m && !inDrv ? 'on' : '', onClick: () => { setRailMenu(false); goMod(x.m); }, children: [MOD_ICON[x.m], _jsxs("span", { children: [_jsx("b", { children: x.l }), _jsx("small", { children: t(MOD_WHAT[x.m]) })] })] }, x.m)), isDrv && _jsxs("button", { role: "menuitem", className: inDrv ? 'on' : '', onClick: () => { setRailMenu(false); go('driver'); }, children: [DRV_ICON, _jsxs("span", { children: [_jsx("b", { children: t('Driver') }), _jsx("small", { children: t('My loads and stops') })] })] })] })] })] })] }), _jsxs("div", { className: "rail-icons", role: "group", "aria-label": t('Modules'), children: [modCount > 1 && myMods.map(x => _jsxs("button", { className: cur === x.m && !inDrv ? 'on' : '', title: x.l, onClick: () => goMod(x.m), children: [MOD_ICON[x.m], _jsx("span", { children: t(MOD_SHORT[x.m]) })] }, x.m)), modCount > 1 && isDrv && _jsxs("button", { className: inDrv ? 'on' : '', title: t('Driver'), onClick: () => go('driver'), children: [DRV_ICON, _jsx("span", { children: t('Driver') })] }), canScan && !inDrv && _jsxs("button", { className: "rail-iscan", title: t('Scan a METRC tag'), onClick: () => setScanning(true), children: [SCAN_ICON, _jsx("span", { children: t('Scan') })] })] }), inDrv ? _jsxs("nav", { className: "rail-screens", "aria-label": t('Driver'), children: [_jsx("div", { className: "rail-h", children: t('Driver').toUpperCase() }), _jsx("button", { className: drvTab === 'loads' ? 'on' : '', onClick: () => setDrvTab('loads'), children: t('My loads') }), _jsx("button", { className: drvTab === 'vehicles' ? 'on' : '', onClick: () => setDrvTab('vehicles'), children: t('Trucks and inspections') })] }) :
                            _jsxs("nav", { className: "rail-screens", "aria-label": `${ML(cur)} screens`, children: [_jsx("div", { className: "rail-h", children: ML(cur).toUpperCase() }), canScan && _jsxs("button", { className: "rail-scan", onClick: () => setScanning(true), children: [SCAN_ICON, _jsx("span", { children: t('Scan a tag') })] }), _jsx("div", { className: `rail-main ${menuDrag ? 'dragging' : ''}`, children: nav.main.map((x, i) => i === 0
                                            ? _jsx("button", { className: `${x.on ? 'on' : ''} rail-lock`, onClick: x.go, children: x.l }, x.k)
                                            : _jsxs("button", { className: `${x.on && !menuDrag ? 'on' : ''} rail-drag ${menuDrag?.k === x.k ? 'lifted' : ''} ${i === 1 ? 'zone-bar' : ''} ${i === 4 ? 'zone-more' : ''}`, title: t('Drag to change your order. The top 3 are your phone bar.'), onPointerDown: e => railPress(x, e), onPointerEnter: () => railEnter(x, i), onClick: () => railClick(x), children: [x.l, _jsx("span", { className: "rail-grip", "aria-hidden": "true", children: "\u22EE\u22EE" })] }, x.k)) }), nav.tail.length > 0 && _jsx("div", { className: "rail-sep" }), nav.tail.map(x => _jsx("button", { className: x.on ? 'on' : '', onClick: x.go, children: x.l }, x.k))] }), _jsxs("div", { className: "rail-acct", children: [_jsxs("button", { className: view === 'mine' ? 'on' : '', title: t('Your own settings'), onClick: () => (view === 'mine' ? go(lastView.current) : go('mine')), children: [_jsx("span", { className: "rail-av", children: ((me?.display_name || who(user) || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2) || '?').toUpperCase() }), _jsxs("span", { className: "rail-acct-l", children: [_jsx("b", { children: me?.display_name || who(user) }), _jsx("small", { children: user })] })] }), _jsx("button", { className: "rail-out", title: t('Signed in as {u}. Click to sign out.', { u: user ?? '' }), "aria-label": t('Sign out'), onClick: () => backend.signOut().then(() => setUser(null)), children: "\u23CF" })] })] })), _jsxs("header", { className: "top", children: [_jsx("img", { className: "phlogo", src: "/logo-dark.svg", alt: "Lifted", onClick: () => nav.main[0]?.go() }), !noMods && (modCount > 1 || isDrv) && _jsxs("button", { className: "phmod", "aria-label": t('Switch module, now {m}', { m: inDrv ? t('Driver') : ML(cur) }), onClick: () => setMore('mods'), children: [_jsx("span", { className: "phmod-dot" }), inDrv ? t('Driver') : ML(cur), " ", _jsx("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", "aria-hidden": "true", children: _jsx("path", { d: "M6 9l6 6 6-6" }) })] }), _jsxs("div", { className: "brand", onClick: () => nav.main[0]?.go(), children: [_jsx("img", { className: "logo-img logo-l", src: "/logo-light.svg", alt: "Lifted Farms" }), _jsx("img", { className: "logo-img logo-d", src: "/logo-dark.svg", alt: "Lifted Farms" }), " ", _jsx("span", { className: "app-name", children: appName }), _jsx("span", { className: "ptitle", children: pageTitle }), " ", backend.demo && _jsx("span", { className: "demo", children: "DEMO" })] }), modCount > 1 && (_jsxs("div", { className: "modpick", children: [_jsxs("button", { className: `modpill m-${inDrv ? 'driver' : cur}`, "aria-haspopup": "menu", "aria-expanded": modMenu, onClick: () => setModMenu(!modMenu), children: [inDrv ? t('Driver') : ML(cur), " ", _jsx("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", "aria-hidden": "true", children: _jsx("path", { d: "M6 9l6 6 6-6" }) })] }), modMenu && _jsxs(_Fragment, { children: [_jsx("div", { className: "modscrim", onClick: () => setModMenu(false) }), _jsxs("div", { className: "modmenu", role: "menu", children: [myMods.map(x => _jsxs("button", { role: "menuitem", className: cur === x.m && !inDrv ? 'on' : '', onClick: () => goMod(x.m), children: [_jsx("b", { children: x.l }), _jsx("span", { className: "muted", children: t(MOD_WHAT[x.m]) })] }, x.m)), isDrv && _jsxs("button", { role: "menuitem", className: inDrv ? 'on' : '', onClick: () => { setModMenu(false); go('driver'); }, children: [_jsx("b", { children: t('Driver') }), _jsx("span", { className: "muted", children: t('My loads and stops') })] })] })] })] })), cur === 'dist' && !noMods && view !== 'inventory' && _jsx("div", { className: "seg", children: ['OHR', 'GVR'].map(s => (_jsx("button", { className: s === site ? 'on' : '', onClick: () => { setSite(s); if (view === 'freezer')
                                    setView('map'); }, children: s }, s))) }), cur === 'dist' && !noMods && _jsxs(_Fragment, { children: [_jsx("input", { className: "search", type: "search", placeholder: "Pallet, strain or tag", value: query, onChange: e => { setQuery(e.target.value); if (view === 'freezer' || view === 'activity' || view === 'dash' || view === 'mine' || view === 'fleet')
                                        setView('map'); } }), _jsx("button", { type: "button", className: "ghost small scanbtn desk-only", title: t('Scan a METRC tag'), onClick: () => setScanning(true), children: "\uD83D\uDCF7" })] }), (cur !== 'dist' || noMods) && _jsx("span", { className: "grow" }), staff && _jsx(WeatherBar, { sb: backend.client(), canEdit: !!me?.access?.owner || lv.cultivation === 'admin', flash: flash }), _jsxs("span", { className: "phacct", children: [_jsx("button", { className: "phacct-btn", "aria-haspopup": "menu", "aria-expanded": acctMenu, "aria-label": t('Account menu'), onClick: () => setAcctMenu(!acctMenu), children: ((me?.display_name || who(user) || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2) || '?').toUpperCase() }), acctMenu && _jsxs(_Fragment, { children: [_jsx("div", { className: "modscrim", onClick: () => setAcctMenu(false) }), _jsxs("div", { className: "phacct-menu", role: "menu", children: [_jsxs("div", { className: "phacct-who", children: [_jsx("b", { children: me?.display_name || who(user) }), _jsx("small", { children: user })] }), _jsx("button", { role: "menuitem", onClick: () => { setAcctMenu(false); view === 'mine' ? go(lastView.current) : go('mine'); }, children: t('My settings') }), _jsx("button", { role: "menuitem", onClick: () => { setAcctMenu(false); backend.signOut().then(() => setUser(null)); }, children: t('Sign out') })] })] })] }), _jsxs("button", { className: `ghost small hdr-acct ${view === 'mine' ? 'on-btn' : ''}`, title: t('Your own settings'), onClick: () => (view === 'mine' ? go(lastView.current) : go('mine')), children: ["\u2699", _jsxs("span", { className: "hide-phone", children: [" ", t('My settings')] })] }), _jsxs("button", { className: "ghost small hdr-acct", title: t('Signed in as {u}. Click to sign out.', { u: user ?? '' }), onClick: () => backend.signOut().then(() => setUser(null)), children: [who(user), " \u23CF"] })] }), !noMods && _jsx("nav", { className: "tabrow", "aria-label": `${inDrv ? t('Driver') : ML(cur)} screens`, children: inDrv ? _jsxs(_Fragment, { children: [_jsx("button", { className: drvTab === 'loads' ? 'on' : '', onClick: () => setDrvTab('loads'), children: t('My loads') }), _jsx("button", { className: drvTab === 'vehicles' ? 'on' : '', onClick: () => setDrvTab('vehicles'), children: t('Trucks and inspections') })] }) : [...nav.main, ...nav.tail].map(x => _jsx("button", { className: x.on ? 'on' : '', onClick: x.go, children: x.l }, x.k)) }), banner && (_jsxs("div", { className: "movebar", children: [_jsxs("div", { children: [_jsx("b", { children: banner.title }), _jsx("div", { className: "muted", children: banner.sub })] }), _jsx("button", { className: "ghost", onClick: banner.cancel, children: "Cancel" })] })), _jsxs("main", { children: [!noMods && lv[MOD_KEY[cur]] === 'view' && view !== 'mine' && view !== 'fleet' && view !== 'driver' && _jsx("div", { className: "viewbanner", children: t('View only: you can look at everything in {m}, but not change anything.', { m: ML(cur) }) }), view === 'fleet' && _jsx(CrewFleet, { sb: backend.client(), flash: flash, dept: MOD_DEPT[cur], title: MOD_DEPT[cur] ? `${ML(cur)} ${cur === 'dist' ? t('vehicles') : t('equipment')}` : undefined }), view === 'driver' && backend.client() && _jsx(DriverHome, { embedded: true, tab: drvTab, onTab: setDrvTab, sb: backend.client(), nf: (me?.access?.prefs?.notify ?? {}), onLang: l => { backend.setMyPrefs({ ...(me?.access?.prefs ?? {}), lang: l }).then(p => setMe(m => m && ({ ...m, access: { ...m.access, prefs: p } }))).catch(() => { }); } }), view === 'items' && _jsx(ItemsView, { sb: backend.client(), flash: flash, canEdit: isAnyAdmin() || !!me?.access?.owner, canPrice: salesAdmin || !!me?.access?.owner }), view === 'mine' && _jsx(MySettings, { backend: backend, me: me, flash: flash, onSaved: (p, name) => setMe(m => m && ({ ...m, display_name: name ?? m.display_name, access: { ...m.access, prefs: p } })) }), noMods && view !== 'mine' && view !== 'fleet' && view !== 'driver' && _jsxs("div", { className: "list", children: [_jsx("h2", { children: "No modules" }), _jsx("p", { className: "muted", children: "No parts of the app are switched on for your account yet. Ask someone with the Admin module to give you access." })] }), view === 'dash' && cur === 'dist' && (_jsx(DistDashboard, { staged: { n: fromHarvest.length, lbs: fromHarvest.reduce((a, p) => a + Number(p.current_weight ?? 0), 0), sites: [...new Set(fromHarvest.map(p => ix.freezer.get(ix.slot.get(p.slot_id).freezer_id).site))],
                                go: () => { const st = fromHarvest[0] ? ix.freezer.get(ix.slot.get(fromHarvest[0].slot_id).freezer_id) : undefined; if (st) {
                                    setSite(st.site);
                                    openFreezer(st.id);
                                } } }, goMap: () => { setView('map'); setFreezerId(null); }, fulfill: forders ? { open: (forders ?? []).filter(o => o.state === 'open').length, ready: (forders ?? []).filter(o => o.state === 'ready').length, waiting: (forders ?? []).filter(o => o.state === 'needs_ok').length, go: () => go('fulfill') } : undefined, ctx: {
                                snap, site, backend,
                                slotsOf: id => ix.slotsOf.get(id) ?? [], inSlot: id => ix.inSlot.get(id) ?? [], weight: p => weightOf(ix, p),
                                onLoad: p => ix.loadOf.has(p.id) || heldBy.has(p.id), slot: id => ix.slot.get(id),
                                freezerOf: id => { const sl = ix.slot.get(id); return sl ? ix.freezer.get(sl.freezer_id) : undefined; },
                                describe: e => describe(ix, e),
                                reviewCounts: { spot: unplaced.length, tags: pendingTags.length, issues: review.length },
                                openFreezer: id => { const f = ix.freezer.get(id); setSite(f.site); openFreezer(id); },
                                openPallet: id => setPalletId(id),
                                openLoad: id => { setLoadId(id); setView('load'); scrollTop(); },
                                goReview: () => setView('review'),
                                goActivity: () => setView('activity'),
                                goTransit: () => setView('transit'),
                                searchFor: q => { setQuery(q); setView('map'); },
                            } })), view === 'map' && (_jsx(MapView, { ix: ix, freezers: siteFreezers, trailers: siteTrailers, staging: stagingOf(site), query: query, extra: extra, where: where, onOpen: openFreezer, onPallet: setPalletId })), view === 'freezer' && freezerId != null && (_jsx(FreezerView, { ix: ix, L: L, plan: plan, freezer: ix.freezer.get(freezerId), query: query, placing: !!placing, custFor: custFor, selecting: selecting, sel: sel, siblings: ix.freezer.get(freezerId)?.kind === 'trailer' ? siteTrailers : siteFreezers, onOpen: openFreezer, onBack: () => setView('map'), onSlot: tapSlot, onPalletTap: tapPallet, onSelect: () => { if (selecting) {
                                setSelecting(false);
                                setSel([]);
                            }
                            else
                                setSelecting(true); }, onOrder: id => heldBy.has(id) || ix.loadOf.has(id) || (ix.contentsOf.get(id) ?? []).some(k => heldBy.has(k.id) || ix.loadOf.has(k.id)), onCompact: compact, onStatus: (st) => setConfirm({
                                text: `Set ${fName(ix.freezer.get(freezerId))} to "${st}"?`, ok: 'Update',
                                run: () => act(() => backend.setFreezerStatus(freezerId, st), 'Freezer status updated'),
                            }) })), view === 'review' && (_jsxs(_Fragment, { children: [_jsx(ListView, { title: `Staging aging (${aging.length})`, empty: "Nothing has sat in Staging more than 2 days.", note: "In Staging more than 2 days and not going out on an order yet. Move them into a freezer, or put them on a load.", items: aging, ix: ix, where: p => `${where(p)} · ${stagedAgo(p)}${heldBy.has(p.id) || ix.loadOf.has(p.id) ? ' · on an order' : ''}`, onPallet: setPalletId }), _jsx("div", { style: { height: 18 } }), unplaced.length > 0 && _jsxs(_Fragment, { children: [_jsx(ListView, { title: `No site yet (${unplaced.length})`, empty: "", note: "Not in a freezer and the app doesn't know which site they're at, so they can't go to Staging on their own. Open one and tap Move.", items: unplaced, ix: ix, where: where, onPallet: setPalletId }), _jsx("div", { style: { height: 18 } })] }), _jsx(ListView, { title: `METRC tags pending (${pendingTags.length})`, empty: "No pending tags.", note: "Splits, merges and new pallets waiting on a METRC tag. Open one and tap Enter tag.", items: pendingTags, ix: ix, where: where, onPallet: setPalletId }), _jsx("div", { style: { height: 18 } }), _jsx(ListView, { title: `Import issues (${review.length})`, empty: "All clear.", note: "Flagged during import from the spreadsheet: duplicates, items not in the pallet list, or missing data. Fix the info and clear the flag.", items: review, ix: ix, where: where, onPallet: setPalletId, showReason: true })] })), view === 'activity' && cur === 'dist' && _jsx(ActivityView, { ix: ix, module: "distribution" }), view === 'inventory' && cur === 'dist' && _jsx(DistInventory, { c: invCtx, flash: flash, onMove: ids => { setPlan(pl => addToTray(pl, ids)); go('map'); flash(`${ids.length} in the tray. Open a freezer and tap where they go.`); } }), view === 'sales' && cur === 'sales' && (() => {
                            const goS = (m) => setSalesTab(m);
                            if (salesTab === 'dash')
                                return _jsx(SalesDashboard, { backend: backend, customers: snap.customers ?? [], isAdmin: salesAdmin, go: goS });
                            if (salesTab === 'review')
                                return _jsx(SalesReview, { backend: backend, customers: snap.customers ?? [], isAdmin: salesAdmin, go: goS, fulfil: forders, onFulfil: refreshF, flash: flash });
                            if (salesTab === 'activity')
                                return _jsx(ActivityView, { ix: ix, module: "sales" });
                            if (salesTab === 'inventory')
                                return _jsx(SalesInventory, { c: invCtx, strains: snap.strains ?? [], sb: backend.client(), onNewOrder: isSales ? () => setNewOrder(true) : undefined });
                            if (salesTab === 'menu')
                                return _jsx(StaffOpenMenu, { sb: backend.client(), flash: flash, isAdmin: salesAdmin || !!me?.access?.owner, tools: _jsx(CatalogButton, { backend: backend, flash: flash }) });
                            if (salesTab === 'returns')
                                return _jsx(ReturnsView, { sb: backend.client(), customers: snap.customers ?? [], flash: flash, canEdit: lv.sales === 'user' || lv.sales === 'admin' || !!me?.access?.owner, canSend: lv.accounting === 'user' || lv.accounting === 'admin' || !!me?.access?.owner, isAdmin: salesAdmin || !!me?.access?.owner });
                            if (salesTab === 'feedback')
                                return _jsx(FeedbackView, { sb: backend.client(), flash: flash });
                            if (salesTab === 'yields')
                                return _jsx(ReportedYieldsPage, { sb: backend.client(), flash: flash });
                            if (salesTab === 'shipping')
                                return _jsx(ShippingQuote, { sb: backend.client(), customers: snap.customers ?? [], flash: flash });
                            if (salesTab === 'invoices')
                                return _jsx(InvoicesView, { backend: backend, customers: snap.customers ?? [], flash: flash, isAdmin: salesAdmin, sender: me?.display_name });
                            if (salesTab === 'settings')
                                return salesSettings;
                            if (salesTab === 'customers')
                                return customersHome(isAdminOf('sales') ? 'sales-cust' : 'sales-cust-ro', !isAdminOf('sales'));
                            return _jsx(ReservesView, { backend: backend, flash: flash, isAdmin: salesAdmin, mode: salesTab, onCounts: refreshCounts, fulfil: new Map((forders ?? []).map(f => [f.id, f])), onFulfil: refreshF, customers: snap.customers ?? [], onNewOrder: () => setNewOrder(true), onDoc: (k, id) => setDoc({ kind: k, id }), onInvoice: async (id) => { try {
                                    const inv = await backend.makeInvoice(id);
                                    setDoc({ kind: 'invoice', id: inv.id });
                                }
                                catch (e) {
                                    flash(String(e.message ?? e), true);
                                } }, strains: snap.strains ?? [], onHand: snap.pallets.reduce((m, p) => (p.kind !== 'mixed' && p.strain && (p.status === 'in_freezer' || p.status === 'unslotted'))
                                    ? m.set(p.strain.toLowerCase(), (m.get(p.strain.toLowerCase()) ?? 0) + Number(p.current_weight ?? 0)) : m, new Map()) }, `sales-${ordersKey}`);
                        })(), view === 'fulfill' && cur === 'dist' && _jsx(FulfillView, { err: fErr, backend: backend, orders: forders, reload: async () => { await reload(); await refreshF(); }, flash: flash, pallets: snap.pallets, heldBy: heldBy, onLoad: id => ix.loadOf.has(id), inRun: id => snap.inRun?.[id], where: where, siteOf: siteOf, loc: locOf, rank: p => (p.slot_id != null ? ix.slot.get(p.slot_id)?.front_rank : null) ?? 99, canon: canonOf, loads: snap.loads ?? [], vehicles: snap.vehicles ?? [], isSales: isSales, stops: snap.stops ?? [], customers: snap.customers ?? [], drivers: snap.drivers ?? [], openId: fOpen, setOpenId: setFOpen, openLoad: id => { setLoadId(id); setView('load'); scrollTop(); }, openPallet: setPalletId }), view === 'inbound' && _jsx(InboundView, { sb: backend.client(), flash: flash, onChanged: () => { reload(); } }), view === 'archived' && _jsx(ArchivedView, { initialQ: archQ, sb: backend.client(), flash: flash, onChanged: () => { reload(); }, openPallet: async (id) => { const { data } = await backend.client().from('pallets').select('*').eq('id', id).single(); if (data) {
                                setScanned(data);
                                setPalletId(id);
                            } }, pickSpot: (r, w, note, done) => {
                                setView('map');
                                startPlacing({ title: `Putting ${r.code} back`, sub: 'Open a freezer and tap the spot it\'s in.',
                                    run: slot => act(() => restoreOne(backend.client(), r.id, note, { slot: slot.id }, w), `${r.code} is back in ${slotLabel(slot)}`).then(done) });
                            } }, archQ ?? ''), view === 'transit' && cur === 'dist' && _jsx(StageAlertsAuto, { sb: backend.client(), flash: flash, openLoad: id => { setLoadId(id); setView('load'); scrollTop(); }, onChanged: () => { reload(); } }), view === 'transit' && _jsx(TransitView, { ctx: ctx, onOpen: id => { setLoadId(id); setView('load'); scrollTop(); }, onNew: () => setLoadForm({}) }), view === 'load' && loadId != null && _jsx(LoadView, { ctx: ctx, loadId: loadId, onBack: () => setView('transit'), onEdit: () => setLoadForm({ load: (snap.loads ?? []).find(l => l.id === loadId) }) }), view === 'cult' && inCult && cultTab === 'receiving' && _jsx(ReceivingView, { sb: backend.client(), module: "cultivation", flash: flash, nurseryLicenses: ['CCL24-0000156'] }), view === 'cult' && inCult && cultTab !== 'receiving' && _jsx(Suspense, { fallback: _jsx("p", { className: "muted", children: "Loading\u2026" }), children: _jsx(CultView, { backend: backend, flash: flash, tab: cultTab, go: setCultTab, onPalletsChanged: () => { reload(); } }) }), view === 'cult' && inCult && cultTab === 'setup' && strainSettings, view === 'nursery' && cur === 'nurs' && nurTab === 'receiving' && _jsx(ReceivingView, { sb: backend.client(), module: "nursery", flash: flash }), view === 'nursery' && cur === 'nurs' && nurTab !== 'receiving' && _jsx(Suspense, { fallback: _jsx("p", { className: "muted", children: "Loading\u2026" }), children: _jsx(NurseryView, { backend: backend, flash: flash, tab: nurTab, go: setNurTab, customers: snap.customers ?? [], isAdmin: isAdminOf('nurs'), sender: me?.display_name, me: me?.email }) }), view === 'nursery' && cur === 'nurs' && nurTab === 'settings' && isAdminOf('nurs') && nurStrainSettings, view === 'proc' && cur === 'proc' && procTab === 'activity' && _jsx(ActivityView, { ix: ix, module: "processing" }), view === 'proc' && cur === 'proc' && procTab !== 'activity' && _jsx(Suspense, { fallback: _jsx("p", { className: "muted", children: "Loading\u2026" }), children: _jsx(ProcessingView, { backend: backend, flash: flash, tab: procTab, go: setProcTab, isAdmin: isAdminOf('proc'), canEdit: lv.processing === 'user' || lv.processing === 'admin', customers: snap.customers ?? [], strains: snap.strains ?? [], onChanged: () => { reload(); }, inv: { act: invAct, info: invInfo, tick: invTick, flag: invFlag } }) }), view === 'acct' && cur === 'acct' && acctTab === 'activity' && _jsx(ActivityView, { ix: ix, module: "accounting" }), view === 'acct' && cur === 'acct' && acctTab !== 'activity' && _jsx(Suspense, { fallback: _jsx("p", { className: "muted", children: "Loading\u2026" }), children: _jsx(AccountingView, { backend: backend, flash: flash, tab: acctTab, go: setAcctTab, isAdmin: isAdminOf('acct'), canEdit: lv.accounting === 'user' || lv.accounting === 'admin', notice: GO_ACCT ? QBO_BACK : null }) }), view === 'comp' && cur === 'comp' && compTab === 'activity' && _jsx(ActivityView, { ix: ix, module: "compliance" }), view === 'comp' && cur === 'comp' && compTab !== 'activity' && _jsx(Suspense, { fallback: _jsx("p", { className: "muted", children: "Loading\u2026" }), children: _jsx(ComplianceView, { backend: backend, flash: flash, tab: compTab, go: setCompTab, isAdmin: isAdminOf('comp'), canEdit: lv.compliance === 'user' || lv.compliance === 'admin', me: me?.email ?? null }) }), view === 'admin' && cur === 'admin' && adminTab === 'dash' && _jsx(AdminDashboard, { backend: backend, open: jump }), view === 'admin' && cur === 'admin' && adminTab === 'review' && _jsx(AdminReview, { backend: backend, open: jump }), view === 'admin' && cur === 'admin' && adminTab === 'activity' && _jsx(ActivityView, { ix: ix, module: "all" }), view === 'admin' && cur === 'admin' && adminTab === 'customers' && customersHome('admin-cust'), view === 'admin' && cur === 'admin' && adminTab === 'settings' && _jsxs("div", { className: "allset", children: [_jsx("div", { className: "seg setpick", children: ALL_SETTINGS.map(([k, l]) => _jsx("button", { className: adminSet === k ? 'on' : '', onClick: () => setAdminSet(k), children: l }, k)) }), adminSet === 'admin' && _jsx(SettingsView, { backend: backend, flash: flash, onChanged: () => { reload(); }, inventoryStrains: invStrains, title: "Admin settings", lists: [], canTerms: salesAdmin, startOn: "users", extra: [{ k: 'users', l: 'Users and access', node: _jsx(UsersTab, { backend: backend, me: me, customers: snap.customers ?? [], flash: flash }) },
                                        { k: 'perms', l: 'Permissions', node: _jsx(PermissionsPanel, { sb: backend.client(), flash: flash }) },
                                        { k: 'licenses', l: 'Licenses', node: _jsx(LicensesPanel, { backend: backend, flash: flash }) },
                                        { k: 'alerts', l: 'Alerts', node: _jsx(AlertPeopleAll, { sb: backend.client(), flash: flash }) },
                                        { k: 'app', l: 'App settings', node: _jsx(AppSettingsPanel, { backend: backend, flash: flash }) }] }), adminSet === 'dist' && distSettings, adminSet === 'sales' && salesSettings, adminSet === 'cult' && _jsxs(_Fragment, { children: [cultSettings, strainSettings] }), adminSet === 'nurs' && _jsx(Suspense, { fallback: _jsx("p", { className: "muted", children: "Loading\u2026" }), children: _jsx(NurseryView, { backend: backend, flash: flash, tab: "settings", go: setNurTab, customers: snap.customers ?? [], isAdmin: isAdminOf('nurs'), sender: me?.display_name, me: me?.email }) }), adminSet === 'nurs' && nurStrainSettings, adminSet === 'proc' && _jsx(Suspense, { fallback: _jsx("p", { className: "muted", children: "Loading\u2026" }), children: _jsx(ProcessingView, { backend: backend, flash: flash, tab: "settings", go: setProcTab, isAdmin: isAdminOf('proc'), canEdit: isAdminOf('proc'), customers: snap.customers ?? [], strains: snap.strains ?? [], onChanged: () => { reload(); } }) }), adminSet === 'acct' && _jsx(Suspense, { fallback: _jsx("p", { className: "muted", children: "Loading\u2026" }), children: _jsx(AccountingView, { backend: backend, flash: flash, tab: "settings", go: setAcctTab, isAdmin: isAdminOf('acct'), canEdit: isAdminOf('acct'), notice: null }) }), adminSet === 'comp' && _jsx(Suspense, { fallback: _jsx("p", { className: "muted", children: "Loading\u2026" }), children: _jsx(ComplianceView, { backend: backend, flash: flash, tab: "settings", go: setCompTab, isAdmin: isAdminOf('comp'), canEdit: isAdminOf('comp'), me: me?.email ?? null }) })] }), view === 'settings' && cur === 'dist' && distSettings, view === 'customers' && cur === 'dist' && isAdminOf('dist') && customersHome(isAdminOf('sales') ? 'dist-cust' : 'dist-cust-ro', !isAdminOf('sales'))] }), active(plan) && L && (_jsx(PlanBar, { plan: plan, code: id => ix.pallet.get(id)?.code ?? `#${id}`, lanes: lanes, busy: busy, stagingOpen: curFreezer?.kind === 'staging', onPick: id => setPlan(pl => ({ ...pl, current: id })), onDrop: id => setPlan(pl => dropFromPlan(pl, id)), onApply: () => applyPlan(), onCancel: () => setPlan(EMPTY), onShuffle: l => setPlan(pl => addMoves(pl, l.moves)), onShuffleAll: () => setPlan(pl => lanes.reduce((acc, l) => addMoves(acc, l.moves), pl)), onFillStaging: () => curFreezer && setPlan(pl => fillStaging(L, pl, curFreezer.id)) })), !active(plan) && selecting && (_jsx(SelectBar, { n: sel.length, weight: selWeight, busy: busy, onMove: () => { setPlan(pl => addToTray(pl, sel)); setSel([]); setSelecting(false); }, onLoad: () => setPickLoadMany(sel.map(id => ix.pallet.get(id)).filter(Boolean)), onClear: () => setSel([]), onDone: () => { setSelecting(false); setSel([]); } })), !active(plan) && !selecting && lastBatch && (_jsx(UndoPill, { n: lastBatch.n, onClose: () => setLastBatch(null), onUndo: () => { const b = lastBatch; setLastBatch(null); act(() => backend.undoBatch(b.id), 'Undone'); } })), _jsx(DragGhost, {}), !noMods && _jsxs(_Fragment, { children: [_jsxs("nav", { className: `bottom pbar ${canScan && !inDrv ? 'with-scan' : ''}`, "aria-label": `${inDrv ? t('Driver') : ML(cur)} screens`, children: [_jsxs("button", { className: `pmod pmore ${restOn ? 'on' : ''}`, "aria-label": t('More in {m}', { m: inDrv ? t('Driver') : ML(cur) }), onClick: () => setMore('more'), children: [_jsxs("span", { className: "pti", children: [_jsxs("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": "true", children: [_jsx("circle", { cx: "5", cy: "12", r: "2" }), _jsx("circle", { cx: "12", cy: "12", r: "2" }), _jsx("circle", { cx: "19", cy: "12", r: "2" })] }), restBadge > 0 && !inDrv && _jsx("i", { className: "pdot" })] }), _jsx("span", { className: "pl", children: t('More') })] }), inDrv && _jsxs("button", { className: `ptab ${drvTab === 'loads' ? 'on' : ''}`, onClick: () => setDrvTab('loads'), children: [_jsx("span", { className: "pti", children: DRV_ICON }), _jsx("span", { className: "pl", children: t('My loads') })] }), inDrv && _jsxs("button", { className: `ptab ${drvTab === 'vehicles' ? 'on' : ''}`, onClick: () => setDrvTab('vehicles'), children: [_jsx("span", { className: "pti", children: MOD_ICON.dist }), _jsx("span", { className: "pl", children: t('Trucks') })] }), !inDrv && bottomFit.map((x, i) => _jsxs(Fragment, { children: [canScan && i === 2 && _jsx("div", { className: "pscan-w", children: _jsx("button", { className: "pscan", "aria-label": t('Scan a METRC tag'), onClick: () => setScanning(true), children: SCAN_ICON }) }), _jsxs("button", { className: `ptab ${x.on ? 'on' : ''}`, onClick: x.go, children: [_jsxs("span", { className: "pti", children: [screenIcon(x.k), (x.n ?? 0) > 0 && _jsx("b", { className: `pbadge ${x.warn ? 'warn' : ''}`, children: x.n })] }), _jsx("span", { className: "pl", children: shortL(x) })] })] }, x.k))] }), more && (_jsx("div", { className: "scrim", onClick: () => setMore(false), children: _jsxs("div", { className: "sheet modsheet", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsx("span", {}), _jsx("button", { className: "ghost", "aria-label": t('Close'), onClick: () => setMore(false), children: "\u2715" })] }), more === 'mods' && (modCount > 1 || isDrv) && _jsxs(_Fragment, { children: [_jsx("div", { className: "msh", children: t('Switch module') }), _jsxs("div", { className: "modgrid", children: [myMods.map(x => _jsxs("button", { className: cur === x.m && !inDrv ? 'on' : '', onClick: () => { setMore(false); goMod(x.m); }, children: [MOD_ICON[x.m], _jsx("span", { children: x.l })] }, x.m)), isDrv && _jsxs("button", { className: inDrv ? 'on' : '', onClick: () => { setMore(false); go('driver'); }, children: [DRV_ICON, _jsx("span", { children: t('Driver') })] })] })] }), more === 'more' && !inDrv && _jsx("div", { className: "msh", children: t('More in {m}', { m: ML(cur) }) }), more === 'more' && !inDrv && !bottomRest.length && _jsx("p", { className: "muted", children: t('Everything in {m} is on the bar below.', { m: ML(cur) }) }), more === 'more' && !inDrv && _jsx("div", { className: "morechips", children: bottomRest.map(x => _jsx("button", { className: x.on ? 'on' : '', onClick: () => { setMore(false); x.go(); }, children: x.l }, x.k)) }), more === 'more' && inDrv && _jsx("div", { className: "morechips", children: extras.map(x => _jsx("button", { onClick: () => { setMore(false); x.go(); }, children: x.l }, x.k)) })] }) }))] }), scanning && _jsx(Scanner, { typed: true, onClose: () => setScanning(false), onScan: handleScan }), scanMiss && (_jsx("div", { className: "scrim", onClick: () => setScanMiss(null), children: _jsxs("div", { className: "sheet scanmiss", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsxs("div", { children: [_jsx("h2", { children: t('Tag not found') }), _jsx("div", { className: "mono small", children: scanMiss.tag })] }), _jsx("button", { className: "ghost", onClick: () => setScanMiss(null), children: "\u2715" })] }), _jsx("p", { className: "muted", children: t('No pallet or package in the app has this tag, current or older.') }), !scanMiss.checked ? _jsx("p", { className: "muted", children: t('Checking our METRC tag ranges…') })
                                : scanMiss.range ? _jsx("div", { className: "okbox scanrange", children: t('This tag is one of ours: {r}', { r: scanMiss.range }) })
                                    : _jsx("div", { className: "warnbox", children: t("This tag isn't in any of our METRC tag ranges. Check that it's ours before using it.") }), _jsxs("div", { className: "choices col", children: [cur === 'dist' && canDist && _jsx("button", { onClick: () => { const tg = scanMiss.tag; setScanMiss(null); newWithTag(tg); }, children: t('Make a new pallet with this tag') }), cur === 'dist' && _jsx("button", { onClick: () => { const tg = scanMiss.tag; setScanMiss(null); setQuery(tg.slice(-6)); setView('map'); }, children: t('Search by the last 6 digits') }), _jsx("button", { onClick: () => { setScanMiss(null); setScanning(true); }, children: t('Scan again') })] })] }) })), selected && !banner && (_jsx(PalletSheet, { ix: ix, p: selected, busy: busy, where: where, flash: flash, others: selected.slot_id != null && !selected.container_id ? (ix.inSlot.get(selected.slot_id) ?? []).filter(x => x.id !== selected.id) : [], onPick: setPalletId, onClose: () => setPalletId(null), onGo: () => { goTo(selected.container_id ? ix.pallet.get(selected.container_id)?.slot_id ?? null : selected.slot_id); setPalletId(null); }, onMove: () => {
                        const lo = editLoadOf(selected.id);
                        if (selected.status === 'in_transit' && lo) {
                            setPalletId(null);
                            ctx.putBack(lo.item, selected);
                            return;
                        }
                        setPlan(pl => addToTray(pl, [selected.id]));
                        setPalletId(null);
                        if (selected.slot_id != null)
                            goTo(selected.slot_id);
                        flash(`${selected.code} is in the tray. Tap the slot it goes to.`);
                    }, onRemove: () => { setRemoveP(selected); setPalletId(null); }, onArchived: staff && selected.status === 'archived' ? () => { setArchQ(selected.code); setPalletId(null); go('archived'); } : undefined, onClear: () => act(() => backend.clearReview(selected.id), 'Flag cleared'), onFlag: (why) => act(() => backend.flagReview(selected.id, why), 'Flagged for review'), onForm: (kind) => {
                        if (kind === 'addto')
                            setForm({ kind: 'pickmixed', p: selected });
                        else if (kind === 'addmixed')
                            setForm({ kind: 'addmixed', m: selected });
                        else
                            setForm({ kind, p: selected });
                    }, onTakeOff: () => {
                        const m = ix.pallet.get(selected.container_id);
                        if (editLoadOf(m.id)) {
                            setConfirm({ text: `Take ${selected.code} off ${m.code}? It stays on ${editLoadOf(m.id).load.code} as its own pallet (or move it to a freezer after).`, ok: 'Take off',
                                run: () => act(() => backend.takeOffMixed(selected.id, null), `${selected.code} off ${m.code}, still on the load`) });
                            return;
                        }
                        startPlacing({ title: `Taking ${selected.code} off ${m.code}`, sub: 'Tap the slot it goes to.',
                            run: slot => act(() => backend.takeOffMixed(selected.id, slot.id), `${selected.code} moved to ${slot.code}`) }, selected);
                    }, onBreak: () => setConfirm({
                        text: `Break ${selected.code} apart? Each package stays ${editLoadOf(selected.id) ? `on ${editLoadOf(selected.id).load.code}, stacked in its spot` : `in ${whereIs(ix, selected.slot_id)} as its own pallet, stacked in that slot`}.`, ok: 'Break apart',
                        run: async () => { await act(() => backend.breakMixed(selected.id), `${selected.code} broken apart`); setPalletId(null); },
                    }), onLineage: (ps) => setPool(ps), loadInfo: ix.loadOf.get(selected.id), held: heldBy.get(selected.id) ? `${heldBy.get(selected.id).customer} · ${heldBy.get(selected.id).so ?? 'order'} (${STATE_LABEL[heldBy.get(selected.id).state]})` : undefined, onHeld: () => { setPalletId(null); go('fulfill'); }, inRun: snap.inRun?.[selected.id], originAdmin: isAdminOf('dist') && !backend.demo, onOrigin: site => act(() => backend.setPalletOrigin(selected.id, site), `${selected.code}: grown at ${site}`), canGrade: (isAdminOf('cult') || isAdminOf('sales')) && !backend.demo, onLotGrade: (lot, grade) => setConfirm({
                        text: `Make all of lot ${lot.code} ${grade ?? `the strain default (${ix.strainGrade.get((selected.strain ?? '').toLowerCase().trim()) ?? 'SHO'})`}? Every pallet from it still in inventory follows, except pallets graded on their own.`,
                        ok: grade ? `Make it ${grade}` : 'Use strain default',
                        run: async () => {
                            setBusy(true);
                            try {
                                const r = await backend.setLotGrade(lot.id, grade);
                                await reload();
                                const held = r.held.length ? `, ${r.held.length} held for orders (check Fulfillment)` : '';
                                const shipped = r.shipped.length ? `. Already shipped: ${r.shipped.map(x => `${x.invoice} ${x.customer}`).join(', ')}` : '';
                                flash(`Lot ${lot.code}: ${grade ?? 'strain default'} · ${r.on_hand.pallets} pallets on hand${held}${shipped}`);
                            }
                            catch (e) {
                                flash(e.message, true);
                            }
                            finally {
                                setBusy(false);
                            }
                        },
                    }), onPalletGrade: grade => act(() => backend.setPalletGrade(selected.id, grade), `${selected.code}: ${grade ?? 'same as lot'}`), customerName: id => (snap.customers ?? []).find(c => c.id === id)?.name ?? '', onOpenLoad: id => { setPalletId(null); setLoadId(id); setView('load'); }, onPutOnLoad: () => setPickLoad(selected), onPulled: () => { const lo = ix.loadOf.get(selected.id); if (lo)
                        act(() => backend.loadPallet(lo.item.id), `${selected.code} on the truck`); } })), doc && _jsx(DocSheet, { backend: backend, kind: doc.kind, id: doc.id, flash: flash, onClose: () => setDoc(null), canEdit: isSales, canVoid: salesAdmin, sender: me?.display_name }), newOrder && _jsx(NewOrderSheet, { backend: backend, customers: snap.customers ?? [], strains: snap.strains ?? [], flash: flash, onClose: () => setNewOrder(false), onDone: id => { setNewOrder(false); setOrdersKey(k => k + 1); refreshF(); setDoc({ kind: 'so', id }); } }), loadForm && _jsx(LoadForm, { ctx: ctx, load: loadForm.load, onClose: () => setLoadForm(null), onSaved: id => { setLoadForm(null); setLoadId(id); setView('load'); } }), pickLoad && _jsx(PickLoad, { ctx: ctx, ps: [pickLoad], onClose: () => setPickLoad(null) }), pickLoadMany && _jsx(PickLoad, { ctx: ctx, ps: pickLoadMany, onClose: () => { setPickLoadMany(null); setSel([]); setSelecting(false); } }), choose && (() => {
                    const p = ix.pallet.get(choose.id);
                    const occ = occupants(slotView(L, { ...plan, moves: plan.moves.filter(m => m.id !== choose.id), tray: plan.tray.filter(x => x !== choose.id) }, choose.slot.id));
                    return _jsx(ChooseDialog, { p: p, occ: occ, where: slotLabel(choose.slot), canSwap: p.slot_id != null, onClose: () => setChoose(null), onPick: m => doPlace(choose.id, choose.slot, m) });
                })(), removeP && _jsx(RemoveForm, { p: removeP, busy: busy, onClose: () => setRemoveP(null), onSubmit: (r, note) => { const p = removeP; setRemoveP(null); act(() => backend.removePallet(p.id, r, note), `${p.code} removed`); } }), form?.kind === 'split' && (_jsx(NewPackageForm, { p: form.p, where: form.p.slot_id != null ? where(form.p) : null, busy: busy, onClose: () => setForm(null), loadItems: () => backend.newPackageItems(form.p.id), loadMetrcItem: () => backend.pkgMetrcItem(form.p.id), onLoad: editLoadOf(form.p.id) ? `${editLoadOf(form.p.id).load.code} with it (stop ${editLoadOf(form.p.id).stop.seq}${editLoadOf(form.p.id).item.loaded ? ', on the truck' : ''})` : null, onSubmit: (whole, n, tag, pending, dest, itemId, note) => {
                        const p = form.p;
                        if (whole) {
                            submit(() => backend.newPackage(p.id, n, tag, false, null, itemId, note), c => `${c.code} is on ${tagTxt(c.package_tag)} now. METRC to-do queued.`);
                            return;
                        }
                        const run = (slot, keep = false) => submit(() => backend.newPackage(p.id, n, tag, pending, slot, itemId, note, keep), c => `${c.code} created (${lbs(n)})${keep ? ' on the load' : ''}`, () => setPalletId(null));
                        if (dest === 'load')
                            run(null, true);
                        else if (dest === 'same')
                            run(null);
                        else
                            startPlacing({ title: `Splitting ${lbs(n)} off ${p.code}`, sub: 'Tap the slot the new piece goes to.', run: slot => run(slot.id) }, p);
                    } })), form?.kind === 'merge' && (_jsx(MergeForm, { p: form.p, candidates: mergeCandidates(form.p), whereOf: where, busy: busy, onClose: () => setForm(null), onLoad: editLoadOf(form.p.id) ? `Takes ${form.p.code}'s place on ${editLoadOf(form.p.id).load.code}` : null, onSubmit: (ids, tag, pending, dest, note) => {
                        const p = form.p;
                        const run = (slot) => submit(() => backend.mergePallets(ids, tag, pending, slot ?? p.slot_id, note), m => `${m.code} created from ${ids.length} pallets`, m => { if (view !== 'proc')
                            setPalletId(m.id); });
                        if (dest === 'same' || dest === 'load')
                            run(null);
                        else
                            startPlacing({ title: `Merging ${ids.length} pallets`, sub: 'Tap the slot for the merged pallet.', run: slot => run(slot.id) }, p);
                    } })), form?.kind === 'tag' && (_jsx(TagForm, { p: form.p, busy: busy, onClose: () => setForm(null), onSubmit: tag => submit(() => backend.setTag(form.p.id, tag), () => 'Tag saved') })), form?.kind === 'weight' && (_jsx(WeightForm, { p: form.p, busy: busy, onClose: () => setForm(null), canAppOnly: !!me?.access?.owner || !!me?.access?.perms?.distribution?.audit_weight, sb: backend.client(), onSubmit: (w, note, reason, mode) => submit(() => mode === 'app'
                        ? (async () => {
                            const { error } = await backend.client().rpc('adjust_weight_app_only', { p_pallet_id: form.p.id, p_weight: w, p_note: note });
                            if (error)
                                throw new Error(/adjust_weight_app_only|schema cache/i.test(error.message) ? `${error.message} (run 097_audit_weight.sql in Supabase)` : error.message);
                        })()
                        : mode === 'metrc'
                            // TEMPORARY (114): METRC only. Queues a METRC adjustment to w; the app's weight stays as it is
                            ? (async () => {
                                const { error } = await backend.client().rpc('adjust_weight_metrc_only', { p_pallet_id: form.p.id, p_weight: w, p_reason: reason, p_note: note || null });
                                if (error)
                                    throw new Error(/adjust_weight_metrc_only|schema cache/i.test(error.message) ? `${error.message} (run 114_weight_check.sql in Supabase)` : error.message);
                            })()
                            : backend.adjustWeight(form.p.id, w, note, reason), () => mode === 'app' ? 'Weight updated in the app only (nothing to METRC)' : mode === 'metrc' ? `METRC to-do made: METRC to ${w} lbs (app weight unchanged)` : 'Weight updated') })), form?.kind === 'newchoice' && (_jsx(NewPalletChooser, { where: slotLabel(form.slot), onClose: () => setForm(null), onPick: k => setForm({ kind: k === 'mixed' ? 'newmixed' : k === 'merged' ? 'newmerged' : 'newsingle', slot: form.slot }) })), form?.kind === 'newmixed' && (_jsx(MixedBuilder, { title: "New mixed pallet", autoTags: tagPool, target: slotLabel(form.slot), candidates: looseList, whereOf: where, busy: busy, onClose: () => setForm(null), onSubmit: (lines, note) => submit(() => backend.createMixed(form.slot.id, lines, note), m => `${m.code} created with ${lines.length} package${lines.length === 1 ? '' : 's'}`, m => setPalletId(m.id)) })), form?.kind === 'newmerged' && (_jsx(MergeHere, { where: slotLabel(form.slot), slot: form.slot.id, candidates: looseList.filter(p => p.kind !== 'mixed' && p.strain && p.current_weight), whereOf: where, busy: busy, onClose: () => setForm(null), onSubmit: (ids, tag, pending, note) => submit(() => backend.mergePallets(ids, tag, pending, form.slot.id, note), m => `${m.code} created from ${ids.length} pallets`, m => setPalletId(m.id)) })), form?.kind === 'newsingle' && (_jsx(SingleForm, { where: slotLabel(form.slot), slot: form.slot.id, tag: form.tag, strains: strainNames, busy: busy, onClose: () => setForm(null), onSubmit: i => submit(() => backend.createSingle(form.slot.id, i), p => `${p.code} created`, p => setPalletId(p.id)) })), form?.kind === 'pickmixed' && (_jsx(PickMixed, { mixed: mixedList, whereOf: where, onClose: () => setForm(null), onPick: m => setForm({ kind: 'addmixed', m, initial: [form.p] }) })), form?.kind === 'addmixed' && (_jsx(MixedBuilder, { title: `Pull for ${form.m.code}`, autoTags: tagPool, target: `${form.m.code} · ${where(form.m)}`, candidates: [...looseList, ...sameStop(form.m)], initial: form.initial, whereOf: where, busy: busy, onClose: () => setForm(null), onSubmit: (lines, note) => { const m = form.m; submit(() => backend.addToMixed(m.id, lines, note), () => `Pulled ${lines.length} for ${m.code}`, () => setPalletId(m.id)); } })), form?.kind === 'stopmixed' && (() => {
                    const st = (snap.stops ?? []).find(x => x.id === form.stop);
                    const onStop = snap.pallets.filter(x => !x.container_id && isPackage(x) && editLoadOf(x.id)?.item.stop_id === form.stop);
                    return _jsx(MixedBuilder, { title: "New mixed pallet on the load", autoTags: tagPool, target: `stop ${st?.seq ?? ''}${form.onTruck ? ', on the truck' : ' (planned)'}`, candidates: [...onStop, ...looseList], initial: onStop.slice(0, 0), whereOf: where, busy: busy, onClose: () => setForm(null), onSubmit: (lines, note) => submit(() => rpc(backend.client(), 'create_mixed_on_stop', { p_stop: form.stop, p_lines: lines, p_on_truck: form.onTruck, p_note: note || null }), m => `${m.code} made on the load with ${lines.length} package${lines.length === 1 ? '' : 's'}`) });
                })(), crossSite && _jsx(CrossSiteDialog, { cs: crossSite, vehicles: (snap.vehicles ?? []).filter(v => v.active && v.kind !== 'Customer pickup'), drivers: (snap.drivers ?? []).filter(d => d.active).map(d => d.name), code: id => ix.pallet.get(id)?.code ?? '', busy: busy, onClose: () => setCrossSite(null), onNo: async () => { setCrossSite(null); await applyPlan(true); }, onYes: async (vehicle, driver) => {
                        const cs = crossSite;
                        setCrossSite(null);
                        const sb = backend.client();
                        setBusy(true);
                        try {
                            const crossIds = new Set(cs.cross.map(c => c.id));
                            const rest = cs.moves.filter(m => !crossIds.has(m.pallet_id));
                            if (rest.length)
                                await backend.applyMoves(rest);
                            const made = [];
                            for (const to of [...new Set(cs.cross.map(c => c.to))]) {
                                const ids = cs.cross.filter(c => c.to === to).map(c => c.id);
                                const loadId = await rpc(sb, 'quick_transfer', { p_pallets: ids, p_to_site: to, p_vehicle: vehicle, p_driver: driver }, '090_receiving');
                                const { data: kinds } = await sb.from('metrc_push_kinds').select('mode').eq('kind', 'transfer');
                                if ((kinds?.[0]?.mode ?? 'off') !== 'off') {
                                    await metrcRun(sb, { action: 'checklist', load_id: loadId });
                                    const r = await metrcRun(sb, { action: 'depart', load_id: loadId });
                                    made.push(r.departed ? `transfer to ${to} made (METRC manifest)` : `load to ${to} made, but the manifest didn't go: ${r.error ?? ''} (open it in Transit)`);
                                }
                                else {
                                    await rpc(sb, 'depart_prepare', { p_load: loadId });
                                    const fin = await rpc(sb, 'depart_finish', { p_load: loadId });
                                    if (fin.departed === false)
                                        throw new Error(fin.error);
                                    made.push(`load to ${to} left (METRC transfers are Off: make the manifest by hand)`);
                                }
                            }
                            await reload();
                            setPlan(EMPTY);
                            setSel([]);
                            setSelecting(false);
                            flash(`${made.join(' · ')}. Mark it delivered in Transit when it gets there, then put the pallets in their spots.`);
                        }
                        catch (e) {
                            flash(e.message, true);
                            reload().catch(() => { });
                        }
                        finally {
                            setBusy(false);
                        }
                    } }), confirm && (_jsx("div", { className: "scrim", onClick: () => setConfirm(null), children: _jsxs("div", { className: "dialog", onClick: e => e.stopPropagation(), children: [_jsx("p", { children: confirm.text }), _jsxs("div", { className: "row end", children: [_jsx("button", { className: "ghost", onClick: () => setConfirm(null), children: "Cancel" }), _jsx("button", { className: "primary", disabled: busy, onClick: async () => { const c = confirm; setConfirm(null); await c.run(); }, children: confirm.ok })] })] }) })), snap && _jsx(StrainCardHost, { backend: backend, strains: snap.strains ?? [], flash: flash, onChanged: () => { reload(); } }), toast && _jsx("div", { className: `toast ${toast.bad ? 'bad' : ''}`, children: toast.text })] }) }));
}
// ---------- views ----------
function ViewAsBar({ me, stop }) {
    const label = { sales: 'Sales', crew: 'Crew', customer: 'Customer', none: 'No access' };
    return (_jsxs("div", { className: "viewas", children: [_jsxs("span", { children: ["Viewing as ", _jsx("b", { children: me.display_name || me.email }), " (", label[me.role] ?? me.role, me.customer_name ? ` · ${me.customer_name}` : '', "). Read-only."] }), _jsx("button", { className: "small", onClick: stop, children: "Stop" })] }));
}
function NoAccess({ me, signOut }) {
    return (_jsxs("div", { className: "center login", children: [_jsx("img", { className: "logo-login logo-l", src: "/logo-light.svg", alt: "Lifted Farms" }), _jsx("img", { className: "logo-login logo-d", src: "/logo-dark.svg", alt: "Lifted Farms" }), me.role === 'customer'
                ? _jsxs(_Fragment, { children: [_jsxs("h2", { children: ["Hi", me.display_name ? ` ${me.display_name}` : ''] }), _jsxs("p", { className: "muted", children: ["Your login is set up for ", me.customer_name ?? 'your company', ". The order portal is coming soon."] })] })
                : IS_PORTAL
                    ? _jsxs(_Fragment, { children: [_jsx("h2", { children: "Login not set up" }), _jsxs("p", { className: "muted", children: [me.email, " isn't connected to a customer account yet. Use the invite link from your Lifted contact."] })] })
                    : _jsxs(_Fragment, { children: [_jsx("h2", { children: "No access yet" }), _jsxs("p", { className: "muted", children: [me.email, " isn't set up for the Lifted Farms app. Ask an admin to add you in Settings > Users."] })] }), _jsx("button", { className: "ghost", onClick: signOut, children: "Sign out" })] }));
}
function Login() {
    const [code, setCode] = useState(null);
    const send = async () => {
        if (!code)
            return;
        setCode({ ...code, busy: true, err: null });
        try {
            await backend.sendCode(code.email);
            setCode({ ...code, sent: true, busy: false, err: null });
        }
        catch (e) {
            setCode({ ...code, busy: false, err: e.message });
        }
    };
    const verify = async () => {
        if (!code)
            return;
        setCode({ ...code, busy: true, err: null });
        try {
            await backend.verifyCode(code.email, code.code);
        }
        catch (e) {
            setCode({ ...code, busy: false, err: e.message });
        }
    };
    return (_jsxs("div", { className: "center login", children: [_jsx("img", { className: "logo-login logo-l", src: "/logo-light.svg", alt: "Lifted Farms" }), _jsx("img", { className: "logo-login logo-d", src: "/logo-dark.svg", alt: "Lifted Farms" }), _jsx("h1", { children: "Lifted Farms" }), _jsx("p", { className: "muted", children: "Distribution, sales and production" }), !code && _jsx("button", { className: "primary big", onClick: () => backend.signIn(), children: "Sign in with Microsoft" }), !code && _jsxs("p", { className: "muted small-print", children: ["No Lifted email? ", _jsx("a", { onClick: () => setCode({ email: '', sent: false, code: '', busy: false, err: null }), children: "Sign in with an email code" })] }), code && _jsxs("div", { className: "codebox", children: [!code.sent ? _jsxs(_Fragment, { children: [_jsx("input", { type: "email", autoFocus: true, placeholder: "Your email", value: code.email, onChange: e => setCode({ ...code, email: e.target.value }), onKeyDown: e => { if (e.key === 'Enter')
                                    send(); } }), _jsx("button", { className: "primary big", disabled: code.busy || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(code.email.trim()), onClick: send, children: code.busy ? 'Sending…' : 'Email me a code' })] }) : _jsxs(_Fragment, { children: [_jsxs("p", { className: "muted", children: ["We sent a 6-digit code to ", code.email, ". It works for one hour."] }), _jsx("input", { inputMode: "numeric", autoComplete: "one-time-code", autoFocus: true, placeholder: "Code", value: code.code, maxLength: 10, onChange: e => setCode({ ...code, code: e.target.value.replace(/\D/g, '') }), onKeyDown: e => { if (e.key === 'Enter')
                                    verify(); } }), _jsx("button", { className: "primary big", disabled: code.busy || code.code.length < 6, onClick: verify, children: code.busy ? 'Checking…' : 'Sign in' }), _jsx("a", { className: "small-print", onClick: () => setCode({ ...code, sent: false, code: '' }), children: "Send a new code" })] }), code.err && _jsx("p", { className: "bad-t", children: code.err }), _jsxs("p", { className: "muted small-print", children: ["Only for people an Admin has added. ", _jsx("a", { onClick: () => setCode(null), children: "Back to Microsoft sign-in" })] })] }), _jsxs("p", { className: "muted small-print", children: ["Customer? ", _jsx("a", { href: portalUrl('?portal'), children: "Sign in to the order portal" })] })] }));
}
function MiniGrid({ ix, slots, query }) {
    return (_jsx("div", { className: "mini", children: [...slots].sort((a, b) => a.row - b.row || a.col - b.col).map(s => {
            const ps = ix.inSlot.get(s.id) ?? [];
            const mixed = ps.some(p => p.kind === 'mixed');
            const sw = swatch(ps[0]?.strain);
            const hit = ps.some(p => matches(p, query, ix));
            if (ps.length > 1)
                return (_jsx("i", { className: `full stack ${query && !hit ? 'dim' : ''}`, children: ps.map(p => { const w = swatch(p.strain); return _jsx("b", { className: p.kind === 'mixed' ? 'mx' : w.cls, style: p.kind === 'mixed' ? undefined : w.style }, p.id); }) }, s.id));
            return _jsx("i", { className: `${ps.length ? `full ${mixed ? 'mx' : sw.cls}` : ''} ${query && !hit ? 'dim' : ''}`, style: ps.length && !mixed ? sw.style : undefined }, s.id);
        }) }));
}
function MapView({ ix, freezers, trailers = [], staging, query, extra, where, onOpen, onPallet }) {
    const ids = new Set(freezers.map(f => f.id));
    const inSite = (p) => p.slot_id != null && ids.has(ix.slot.get(p.slot_id)?.freezer_id ?? -1);
    const tops = [...ix.pallet.values()].filter(p => !p.container_id && inSite(p));
    const packages = [...ix.pallet.values()].filter(p => isPackage(p) && inSite(p));
    const total = packages.reduce((a, p) => a + (p.current_weight ?? 0), 0);
    const open = freezers.reduce((a, f) => f.status === 'Not Working' ? a : a + (ix.slotsOf.get(f.id) ?? []).filter(s => !ix.inSlot.get(s.id)?.length).length, 0);
    const hits = query ? [...ix.pallet.values()].filter(p => matches(p, query)) : [];
    const hitIds = new Set(hits.map(h => h.id));
    const older = extra.filter(p => !hitIds.has(p.id));
    const hitLbs = hits.filter(isPackage).reduce((a, p) => a + (p.current_weight ?? 0), 0);
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "stats", children: [_jsxs("div", { children: [_jsx("b", { children: freezers.length }), _jsx("span", { children: "freezers" })] }), _jsxs("div", { children: [_jsx("b", { children: tops.length }), _jsx("span", { children: "pallets" })] }), _jsxs("div", { children: [_jsx("b", { children: Math.round(total).toLocaleString() }), _jsx("span", { children: "lbs" })] }), _jsxs("div", { children: [_jsx("b", { children: open }), _jsx("span", { children: "open slots" })] })] }), query && (_jsxs("div", { className: "hits", children: [_jsxs("div", { className: "muted", children: [hits.length, " in inventory matching \"", query, "\"", hits.length > 0 && ` · ${lbs(hitLbs)}`] }), _jsxs("div", { className: "hitlist", children: [hits.slice(0, 60).map(p => (_jsxs("button", { className: "hit", onClick: () => onPallet(p.id), children: [_jsx("b", { children: p.code }), " ", _jsx("span", { children: p.kind === 'mixed' ? 'Mixed' : p.strain }), " ", _jsx("span", { className: "muted", children: where(p) })] }, p.id))), older.slice(0, 30).map(p => (_jsxs("button", { className: "hit old", onClick: () => onPallet(p.id), children: [_jsx("b", { children: p.code }), " ", _jsx("span", { children: p.strain }), " ", _jsx("span", { className: "muted", children: p.status })] }, p.id)))] })] })), staging && (() => {
                const ss = [...(ix.slotsOf.get(staging.id) ?? [])].sort((a, b) => a.row - b.row);
                const sp = ss.flatMap(s => ix.inSlot.get(s.id) ?? []);
                const landed = sp.filter(p => p.staged_reason && p.staged_reason !== 'harvest').length;
                return (_jsxs("button", { className: "stagecard", onClick: () => onOpen(staging.id), children: [_jsx("b", { children: "Staging" }), _jsxs("span", { className: "muted", children: [sp.length, " pallet", sp.length === 1 ? '' : 's', " \u00B7 ", lbs(sp.reduce((a, p) => a + weightOf(ix, p), 0)), " \u00B7 ", ss.length, " spots, grows as it fills", landed > 0 && _jsxs(_Fragment, { children: [" \u00B7 ", _jsxs("span", { className: "landed-t", children: [landed, " just landed"] })] })] }), _jsx("span", { className: "stage-strip", children: ss.map(s => {
                                const p = ix.inSlot.get(s.id)?.[0];
                                if (!p)
                                    return _jsx("i", { className: "open" }, s.id);
                                if (p.staged_reason && p.staged_reason !== 'harvest')
                                    return _jsx("i", { className: "landed" }, s.id);
                                const w = swatch(p.strain);
                                return _jsx("i", { className: p.kind === 'mixed' ? 'mx' : w.cls, style: p.kind === 'mixed' ? undefined : w.style }, s.id);
                            }) })] }));
            })(), [freezers, trailers].map((list, li) => list.length > 0 && (_jsxs("div", { children: [li === 1 && _jsxs("h3", { className: "map-sec", children: ["Reefer trailers", list[0]?.site === 'GVR' && _jsxs(_Fragment, { children: [" ", _jsx("span", { className: "muted", children: "dry flower \u00B7 processor license" })] })] }), _jsx("div", { className: `cards ${li === 1 ? 'trailers' : ''}`, children: list.map(f => {
                            const slots = ix.slotsOf.get(f.id) ?? [];
                            const ps = slots.flatMap(s => ix.inSlot.get(s.id) ?? []);
                            const used = slots.filter(s => ix.inSlot.get(s.id)?.length).length;
                            const w = ps.reduce((a, p) => a + weightOf(ix, p), 0);
                            return (_jsxs("button", { className: `card st-${f.status.replace(/ /g, '-')}`, onClick: () => onOpen(f.id), children: [_jsxs("div", { className: "card-h", children: [_jsx("b", { children: fShort(f) }), _jsx("span", { className: "dot", title: f.status })] }), _jsx(MiniGrid, { ix: ix, slots: slots, query: query }), _jsxs("div", { className: "card-f", children: [used, "/", slots.length, " \u00B7 ", Math.round(w / 100) / 10, "k"] })] }, f.id));
                        }) })] }, li)))] }));
}
const STAGING_AGING_DAYS = 2;
const STAGED_BADGE = { received: 'RECEIVED', harvest: 'HARVEST', processor: 'PROCESSED', split: 'SPLIT' };
function stagedAgo(p) {
    if (!p.staged_at)
        return 'in Staging';
    const d = Math.floor((Date.now() - Date.parse(p.staged_at)) / 86400000);
    return d <= 0 ? 'in Staging today' : `in Staging ${d} day${d === 1 ? '' : 's'}`;
}
const STAGE_GROUPS = [
    { key: 'orders', title: 'Building orders', note: 'Put here by hand, or held for an order or a load.' },
    { key: 'landed', title: 'Just landed', note: 'Came in with no spot: off a load, a split, or back from a processor. Move them into a freezer.' },
    { key: 'harvest', title: 'Harvest staging', note: 'Logged at harvest. Move them into freezers.' },
];
function readFolded() { try {
    return JSON.parse(localStorage.getItem('stagingFolded') ?? '[]');
}
catch {
    return [];
} }
function FreezerView({ ix, L, plan, freezer, query, placing, selecting, sel, siblings, onOpen, onBack, onSlot, onPalletTap, onStatus, onSelect, onCompact, onOrder, custFor }) {
    const staging = freezer.kind === 'staging';
    const [folded, setFolded] = useState(readFolded);
    const fold = (g) => setFolded(f => { const n = f.includes(g) ? f.filter(x => x !== g) : [...f, g]; try {
        localStorage.setItem('stagingFolded', JSON.stringify(n));
    }
    catch { /* private window */ } return n; });
    const slots = ix.slotsOf.get(freezer.id) ?? [];
    const grid = [...slots].sort((a, b) => a.row - b.row || a.col - b.col);
    const views = new Map(grid.map(s => [s.id, slotView(L, plan, s.id)]));
    const ps = grid.flatMap(s => occupants(views.get(s.id)));
    const i = siblings.findIndex(f => f.id === freezer.id);
    const prev = staging ? undefined : siblings[i - 1], next = staging ? undefined : siblings[i + 1];
    const dead = freezer.status === 'Not Working';
    const placingNow = placing || plan.tray.length > 0;
    const trailer = freezer.kind === 'trailer';
    // trailers: a pallet stretched over more spots covers the spots between its own and span_to_slot (same side)
    const coveredBy = new Map();
    if (trailer)
        for (const s of grid)
            for (const p of ix.inSlot.get(s.id) ?? []) {
                const to = p.span_to_slot != null ? ix.slot.get(p.span_to_slot) : undefined;
                if (!to)
                    continue;
                for (const x of grid)
                    if (x.id !== s.id && x.col === s.col && x.row >= Math.min(s.row, to.row) && x.row <= Math.max(s.row, to.row))
                        coveredBy.set(x.id, p);
            }
    const tile = (p, role, s, stacked, m) => {
        const on = ix.contentsOf.get(p.id) ?? [];
        const sw = swatch(p.strain);
        const picked = sel.includes(p.id);
        const note = role === 'incoming' ? `from ${m?.from != null ? whereIs(ix, m.from).split(' · ').pop() : 'no spot'}${m?.kind === 'shuffle' ? ' (shuffle)' : m?.kind === 'swap' ? ' (swap)' : ''}`
            : role === 'leaving' ? (m ? `→ ${whereIs(ix, m.to)}` : 'in the tray') : '';
        return (_jsxs("span", { "data-pallet": p.id, className: `p ${stacked ? `band ${p.kind === 'mixed' ? 'mx' : sw.cls}` : ''} r-${role} ${picked ? 'picked' : ''}`, style: stacked && p.kind !== 'mixed' ? sw.style : undefined, ...(role !== 'leaving' && !placing ? draggable({ id: p.id, label: `${p.code} · ${p.kind === 'mixed' ? 'Mixed' : p.strain ?? ''}` }) : {}), onClick: e => { e.stopPropagation(); onPalletTap(p, role, s); }, children: [_jsxs("b", { children: [selecting && _jsx("span", { className: `tick ${picked ? 'on' : ''}`, children: picked ? '✓' : '' }), p.code, p.needs_review && _jsx("span", { className: "flag", title: p.needs_review, children: "!" }), (p.tag_pending || on.some(c => c.tag_pending)) && _jsx("span", { className: "flag tag", title: "METRC tag pending", children: "T" }), ix.loadOf.has(p.id) && _jsx("span", { className: "flag load", title: `Planned on ${ix.loadOf.get(p.id).load.code}`, children: "L" }), p.pushed === false && _jsx("span", { className: "flag np", title: "Not pushed to METRC yet (Harvest log)", children: "NP" }), staging && p.staged_reason && !onOrder?.(p.id) && _jsx("span", { className: `sbadge sb-${p.staged_reason}`, title: stagedAgo(p), children: STAGED_BADGE[p.staged_reason] })] }), _jsx("span", { className: "strain", children: note ? _jsx("i", { className: "pnote", children: note }) : p.kind === 'mixed' ? `Mixed · ${on.length} pkg${on.length === 1 ? '' : 's'}: ${[...new Set(on.map(c => c.strain))].join(', ')}` : _jsxs(_Fragment, { children: [p.product && p.product !== 'fresh_frozen' && _jsx("em", { className: "prodtag", children: PRODUCT_SHORT[p.product] }), (p.product ?? 'fresh_frozen') === 'fresh_frozen' && gradeOf(ix, p).grade === 'BHO' && _jsx("em", { className: "prodtag bho", children: "BHO" }), p.strain ?? p.label ?? 'No strain'] }) }), _jsx("span", { className: "w", children: p.kind !== 'mixed' && p.current_weight == null ? 'no weight' : lbs(weightOf(ix, p)) }), role === 'stay' && custFor?.(p.id) && _jsxs("span", { className: "pcust", title: "Held or loaded for this customer", children: ["\u2192 ", custFor(p.id)] }), trailer && role === 'stay' && !placing && !stacked && _jsx("span", { className: "spangrip", title: "Drag to another spot on this side to make it take more space; drag back here to undo", ...draggable({ id: p.id, label: `${p.code}: take spots to…`, span: true }), onClick: e => e.stopPropagation(), children: "\u21D5" })] }, `${role}-${p.id}`));
    };
    return (_jsxs("div", { className: `freezer ${staging ? 'staging' : ''}`, children: [_jsxs("div", { className: "fz-head", children: [_jsx("button", { className: "ghost", onClick: onBack, children: "\u2039 All" }), _jsxs("div", { className: "fz-title", children: [_jsxs("h2", { children: [freezer.site, " ", staging ? 'Staging' : fName(freezer)] }), _jsxs("div", { className: "muted", children: [ps.length, " pallet", ps.length === 1 ? '' : 's', " \u00B7 ", lbs(ps.reduce((a, p) => a + weightOf(ix, p), 0)), staging ? ` · spots 1 to ${grid.length}` : ''] })] }), !staging && _jsx(Select, { className: `status st-${freezer.status.replace(/ /g, '-')}`, value: freezer.status, onChange: e => onStatus(e.target.value), children: FREEZER_STATUSES.map(s => _jsx("option", { children: s }, s)) })] }), _jsxs("div", { className: "row between fz-tools", children: [!staging ? _jsxs("button", { className: "ghost small", disabled: !prev, onClick: () => prev && onOpen(prev.id), children: ["\u2039 ", prev ? fShort(prev) : ''] }) : _jsx("span", {}), _jsxs("div", { className: "row", children: [_jsx("button", { className: `ghost small ${selecting ? 'on-btn' : ''}`, onClick: onSelect, children: selecting ? 'Selecting' : 'Select' }), !staging && _jsx("button", { className: "ghost small", onClick: onCompact, children: "Compact" })] }), !staging ? _jsxs("button", { className: "ghost small", disabled: !next, onClick: () => next && onOpen(next.id), children: [next ? fShort(next) : '', " \u203A"] }) : _jsx("span", {})] }), !staging && _jsx("div", { className: "muted small-t center-t", children: "BACK" }), staging && _jsx("p", { className: "muted small-note", children: "Where orders get built and where anything without a spot lands. Always 2 open spots at the end; more appear as it fills." }), (() => {
                const slotBtn = (s) => {
                    const v = views.get(s.id);
                    const occ = occupants(v);
                    const all = occ.length + v.leaving.length;
                    const stacked = all > 1;
                    const first = occ[0] ?? v.leaving[0]?.p;
                    const mixed = !stacked && first?.kind === 'mixed';
                    const sw = swatch(first?.strain);
                    const dim = query && !occ.some(p => matches(p, query, ix));
                    const ghostOnly = occ.length === 0 && v.leaving.length > 0;
                    return (_jsxs("button", { "data-slot": s.id, className: `tile ${coveredBy.has(s.id) && !all ? 'spanned' : ''} ${all ? 'full' : 'empty'} ${placingNow && !dead ? (occ.length ? 'can-combine' : 'can-drop') : ''} ${dim ? 'dim' : ''} ${stacked ? 'stacked' : all ? (mixed ? 'mx' : sw.cls) : ''} ${ghostOnly ? 'vacating' : ''} ${v.incoming.length ? 'arriving' : ''}`, style: all && !mixed && !stacked ? sw.style : undefined, disabled: placingNow && dead, onClick: () => onSlot(s), children: [_jsx("span", { className: "code", children: staging ? s.row : freezer.kind === 'trailer' ? s.code.slice(2) : s.code }), all === 0 && coveredBy.has(s.id) && _jsxs("span", { className: "muted covered", children: ["\u2195 ", coveredBy.get(s.id).code] }), all === 0 && !coveredBy.has(s.id) && _jsx("span", { className: "muted", children: placingNow ? (dead ? 'Not working' : 'Place here') : dead ? 'empty' : staging ? '' : '+ New pallet' }), stacked && !placing && v.stay.length > 1 && _jsxs("span", { className: "stackgrip", title: "Drag to move the whole stack", onClick: e => e.stopPropagation(), ...draggable({ id: v.stay[0].id, ids: v.stay.map(p => p.id), label: `Stack of ${v.stay.length}: ${v.stay.map(p => p.code).join(', ')}` }), children: ["\u283F all ", v.stay.length] }), v.stay.map(p => tile(p, 'stay', s, stacked)), v.incoming.map(x => tile(x.p, 'incoming', s, stacked, x.m)), v.leaving.map(x => tile(x.p, 'leaving', s, stacked, x.m))] }, s.id));
                };
                if (!staging)
                    return _jsx("div", { className: `grid ${dead && placingNow ? 'dead' : ''}`, children: grid.map(slotBtn) });
                const groupOf = (s) => {
                    const v = views.get(s.id);
                    const p = occupants(v)[0] ?? v.leaving[0]?.p;
                    if (!p)
                        return null;
                    if (onOrder?.(p.id))
                        return 'orders';
                    if (p.staged_reason === 'harvest')
                        return 'harvest';
                    if (p.staged_reason)
                        return 'landed';
                    return 'orders';
                };
                const open = grid.filter(s => groupOf(s) == null);
                return _jsxs(_Fragment, { children: [STAGE_GROUPS.map(g => {
                            const ss = grid.filter(s => groupOf(s) === g.key);
                            if (!ss.length)
                                return null;
                            const gp = ss.flatMap(s => occupants(views.get(s.id)));
                            const shut = folded.includes(g.key);
                            return _jsxs("div", { className: "stage-group", children: [_jsxs("button", { className: "stage-gh", onClick: () => fold(g.key), children: [_jsx("span", { className: "caret", children: shut ? '▸' : '▾' }), _jsx("b", { children: g.title }), _jsxs("span", { className: "muted", children: [" \u00B7 ", gp.length, " \u00B7 ", lbs(gp.reduce((a, p) => a + weightOf(ix, p), 0))] })] }), !shut && _jsxs(_Fragment, { children: [_jsx("p", { className: "muted small-note", children: g.note }), _jsx("div", { className: `grid stage-grid ${dead && placingNow ? 'dead' : ''}`, children: ss.map(slotBtn) })] })] }, g.key);
                        }), _jsxs("div", { className: "stage-group", children: [_jsxs("div", { className: "stage-gh static", children: [_jsx("b", { children: "Open spots" }), _jsxs("span", { className: "muted", children: [" \u00B7 ", open.length] })] }), _jsx("div", { className: `grid stage-grid ${dead && placingNow ? 'dead' : ''}`, children: open.map(slotBtn) })] })] });
            })(), !staging && _jsx("div", { className: "door", children: "DOOR" })] }));
}
function ListView({ title, note, empty, items, ix, where, onPallet, showReason }) {
    return (_jsxs("div", { className: "list", children: [_jsx("h2", { children: title }), note && _jsx("p", { className: "muted", children: note }), items.length === 0 && empty && _jsx("p", { className: "muted", children: empty }), items.map(p => (_jsxs("button", { className: "li", onClick: () => onPallet(p.id), children: [_jsxs("div", { children: [_jsx("b", { children: p.code }), " ", p.strain ?? p.label, " ", _jsx("span", { className: "muted", children: lbs(weightOf(ix, p)) })] }), _jsxs("div", { className: "muted", children: [where(p), showReason && p.needs_review && _jsxs(_Fragment, { children: [" \u00B7 ", _jsx("span", { className: "warn-t", children: p.needs_review })] })] })] }, p.id)))] }));
}
/** which module an activity line belongs to */
function eventModule(e) {
    const t = e.type, d = e.details;
    if (/^comp_/.test(t))
        return 'compliance';
    if (/^acct_/.test(t) || (t === 'invoice_paid' && d?.via === 'QuickBooks'))
        return 'accounting';
    if (/^nursery/.test(t))
        return 'nursery';
    if (/^proc_/.test(t) || t === 'pay_day' || t === 'pay_employee')
        return 'processing';
    if (/^pay_/.test(t))
        return 'accounting';
    if (/^cult_log/.test(t))
        return 'cultivation';
    if (/^invoice/.test(t))
        return 'sales';
    if (/^license/.test(t))
        return 'admin';
    if (/^(reserve|order|terms|customer_terms)/.test(t) || (t === 'settings' && /^(customers|reserve deadlines|terms)/.test(d?.list ?? '')))
        return 'sales';
    if (/^(user_|app_setting|view_as|login_|password_)/.test(t))
        return 'admin';
    return 'distribution';
}
const CULT_TBL = { cult_harvests: 'Harvest', cult_plantings: 'Planting', cult_tests: 'Test', cult_flower_picks: 'Dry flower pick', cult_demand: 'Plan strain',
    cult_plan: 'Plan row', cult_nursery_orders: 'Nursery delivery', cult_receipts: 'Plants received', app_settings: 'Cultivation setting' };
/** Activity: each module shows its own; Admin shows everything with a filter */
/** loading screen: the logo and a quiet spinner, same for every module */
function Splash() {
    return _jsxs("div", { className: "center splash", children: [_jsx("img", { className: "logo-login logo-l", src: "/logo-light.svg", alt: "Lifted Farms" }), _jsx("img", { className: "logo-login logo-d", src: "/logo-dark.svg", alt: "Lifted Farms" }), _jsx("div", { className: "spin", "aria-label": "Loading" })] });
}
function ActivityView({ ix, module }) {
    const [events, setEvents] = useState(null);
    const [cult, setCult] = useState([]);
    const [names, setNames] = useState(new Map());
    const [only, setOnly] = useState('all');
    useEffect(() => {
        backend.recentEvents(module === 'all' ? 500 : 300).then(async (evs) => {
            setEvents(evs);
            const missing = [...new Set(evs.map(e => e.pallet_id).filter((id) => id != null && !ix.pallet.has(id)))];
            if (missing.length)
                setNames(new Map((await backend.byIds(missing)).map(p => [p.id, p.code])));
        });
        const sb = backend.client();
        if (module === 'all' && sb)
            sb.from('cult_log').select('*').order('at', { ascending: false }).limit(300).then(({ data }) => setCult((data ?? []).map(r => {
                const name = (r.data?.strain ?? r.was?.strain ?? '');
                return { id: `c${r.id}`, at: r.at, who: r.user_email, mod: 'cultivation',
                    text: `${CULT_TBL[r.tbl] ?? r.tbl} ${r.op === 'insert' ? 'added' : r.op === 'delete' ? 'deleted' : 'changed'}${name ? `: ${name}` : ''}` };
            })));
    }, [ix, module]);
    const lines = [...(events ?? []).map(e => ({ id: `e${e.id}`, at: e.at, who: e.user_email, text: describe(ix, e, names), note: e.note, mod: eventModule(e) })), ...cult]
        .filter(l => module === 'all' ? only === 'all' || l.mod === only : l.mod === module)
        .sort((a, b) => b.at.localeCompare(a.at));
    const CH = [['all', 'Everything'], ['distribution', 'Distribution'], ['sales', 'Sales'], ['cultivation', 'Cultivation'], ['nursery', 'Nursery'], ['processing', 'Processing'], ['accounting', 'Accounting'], ['compliance', 'Compliance'], ['admin', 'Admin']];
    return (_jsxs("div", { className: "list", children: [_jsx("h2", { children: "Activity" }), module === 'all' && _jsx("div", { className: "seg tabs", children: CH.map(([k, l]) => _jsx("button", { className: only === k ? 'on' : '', onClick: () => setOnly(k), children: l }, k)) }), events && lines.length === 0 && _jsx("p", { className: "muted", children: "Nothing yet. Everything people do here shows up in this list." }), lines.map(l => (_jsxs("div", { className: "li static", children: [_jsxs("div", { children: [module === 'all' && only === 'all' && _jsx("span", { className: "pill", children: CH.find(c => c[0] === l.mod)?.[1] }), " ", l.text] }), _jsxs("div", { className: "muted", children: [when(l.at), " \u00B7 ", who(l.who), l.note && _jsxs(_Fragment, { children: [" \u00B7 \"", l.note, "\""] })] })] }, l.id)))] }));
}
function PalletSheet({ ix, p, others, busy, where, flash, onArchived, onClose, onGo, onMove, onRemove, onClear, onFlag, onPick, onForm, onTakeOff, onBreak, onLineage, loadInfo, customerName, onOpenLoad, onPutOnLoad, onPulled, held, onHeld, originAdmin, onOrigin, inRun, canGrade, onLotGrade, onPalletGrade }) {
    const [hist, setHist] = useState(null);
    const [kin, setKin] = useState([]);
    const contents = ix.contentsOf.get(p.id) ?? [];
    useEffect(() => { setHist(null); backend.palletEvents(p.id).then(setHist); }, [p.id, p.slot_id, p.needs_review, p.current_weight, p.package_tag, p.status, p.container_id, contents.length]);
    useEffect(() => {
        if (p.parent_id == null && p.merged_into == null && !/^C\d+$/.test(p.code) && !hist?.some(e => e.type === 'split')) {
            setKin([]);
            return;
        }
        backend.lineage(p).then(ps => { setKin(ps); onLineage(ps); }).catch(() => setKin([]));
    }, [p.id, p.parent_id, p.merged_into, hist]);
    const isMixed = p.kind === 'mixed';
    const loadEditable = !!loadInfo && ['planning', 'loading'].includes(loadInfo.load.status);
    // on a load that hasn't left (planned, or already on the truck): everything you can do in a freezer
    const live = p.status === 'in_freezer' || p.status === 'unslotted' || (p.status === 'in_transit' && loadEditable);
    const inFreezer = p.status === 'in_freezer';
    const onTruck = p.status === 'in_transit' && loadEditable;
    const container = p.container_id ? ix.pallet.get(p.container_id) : undefined;
    const parent = kin.find(k => k.id === p.parent_id);
    const children = kin.filter(k => k.parent_id === p.id);
    const into = kin.find(k => k.id === p.merged_into);
    const sources = kin.filter(k => k.merged_into === p.id);
    const item = p.item_id != null ? ix.sku.get(p.item_id) : undefined;
    const lot = p.lot_id != null ? ix.lot.get(p.lot_id) : undefined;
    const g = gradeOf(ix, p);
    const strainDefault = ix.strainGrade.get((p.strain ?? '').toLowerCase().trim()) ?? 'SHO';
    const [showSku, setShowSku] = useState(false);
    const link = (k) => _jsx("a", { onClick: () => onPick(k.id), children: k.code }, k.id);
    const join = (ks) => ks.map((k, i) => _jsxs("span", { children: [i > 0 && ', ', link(k)] }, k.id));
    const statusText = { merged: 'Merged (closed out)', shipped: 'Delivered (left inventory)', depleted: isMixed ? 'Broken apart' : 'Depleted', archived: 'Not in a freezer (old record)', in_transit: where(p) };
    return (_jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: "sheet side psheet", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsxs("div", { children: [_jsx("h2", { children: p.code }), _jsxs("div", { children: [isMixed ? `Mixed pallet · ${contents.length} package${contents.length === 1 ? '' : 's'}` : p.strain ? _jsx(StrainLink, { name: p.strain }) : p.label ?? 'No strain', !isMixed && p.product && p.product !== 'fresh_frozen' && _jsx("span", { className: "pill prod", children: PRODUCT_LABEL[p.product] })] })] }), _jsx("button", { className: "ghost", onClick: onClose, children: "\u2715" })] }), p.needs_review && _jsx("div", { className: "warnbox", children: p.needs_review }), p.tag_pending && live && _jsxs("div", { className: "warnbox", children: ["METRC tag pending. ", _jsx("a", { onClick: () => onForm('tag'), children: "Enter tag" })] }), p.pushed === false && live && _jsx("div", { className: "warnbox", children: "Not pushed to METRC yet. It can be moved, but it can't be sold, loaded, split or merged until it's pushed in the Harvest log." }), p.span_to_slot != null && ix.slot.get(p.span_to_slot) && _jsxs("div", { className: "infobox", children: ["Takes the spots through ", ix.slot.get(p.span_to_slot).code.slice(2), ". Drag its \u21D5 handle back onto its own spot to take one spot again."] }), container && _jsxs("div", { className: "infobox", children: ["On mixed pallet ", link(container), ". It moves with ", container.code, "."] }), held && _jsxs("div", { className: "infobox held", children: ["Held for ", _jsx("a", { onClick: onHeld, children: held })] }), inRun && _jsxs("div", { className: "infobox held", children: ["In processing run ", inRun, ". It stays put until the run is finished. It can still be moved to another spot."] }), loadInfo && (_jsxs("div", { className: "infobox load", style: { ['--sc']: stopColor(loadInfo.stop.seq) }, children: [loadInfo.item.loaded ? 'On the truck: ' : 'Planned on ', _jsx("a", { onClick: () => onOpenLoad(loadInfo.load.id), children: loadInfo.load.code }), ' ', "\u00B7 stop ", loadInfo.stop.seq, " ", customerName(loadInfo.stop.customer_id), " \u00B7 position ", loadInfo.item.position, loadEditable && !loadInfo.item.loaded && _jsx("div", { className: "row", style: { marginTop: 6 }, children: _jsx("button", { className: "primary small", disabled: busy, onClick: onPulled, children: "Pulled onto truck" }) })] })), _jsxs("dl", { children: [_jsx("dt", { children: "Location" }), _jsx("dd", { children: live && (p.slot_id != null || container) ? _jsx("a", { onClick: onGo, children: container ? whereIs(ix, container.slot_id) : whereIs(ix, p.slot_id) }) : live ? where(p) : statusText[p.status] ?? p.status }), (p.boxes || p.partial) ? _jsxs(_Fragment, { children: [_jsx("dt", { children: "Boxes" }), _jsxs("dd", { children: [p.boxes ?? '', p.partial ? _jsx("span", { className: "muted", children: " \u00B7 last pallet (partial)" }) : null] })] }) : null, _jsx("dt", { children: !isMixed && p.package_tag ? 'App weight' : 'Weight' }), _jsxs("dd", { children: [lbs(weightOf(ix, p)) || 'unknown', !isMixed && p.og_weight && p.og_weight !== p.current_weight ? _jsxs("span", { className: "muted", children: [" (started at ", lbs(p.og_weight), ")"] }) : null] }), !isMixed && _jsx(MetrcWeightRow, { sb: backend.client(), palletId: p.id, appLbs: p.current_weight ?? null, tag: p.package_tag ?? null }), !isMixed && _jsxs(_Fragment, { children: [_jsx("dt", { children: "METRC tag" }), _jsx("dd", { className: "mono", children: p.package_tag ?? (p.tag_pending ? 'pending' : 'none') }), _jsx("dt", { children: "Harvested" }), _jsx("dd", { children: p.harvest_date ?? '' }), _jsx("dt", { children: "Zone" }), _jsx("dd", { children: p.zone ?? '' }), _jsx("dt", { children: "Grown at" }), _jsx("dd", { children: originAdmin && onOrigin
                                        ? _jsxs(Select, { className: "inline", value: p.origin_site ?? '', onChange: e => e.target.value && onOrigin(e.target.value), children: [!p.origin_site && _jsx("option", { value: "", children: "unknown" }), ['OHR', 'GVR', 'GVR+OHR'].map(s => _jsx("option", { value: s, children: s === 'GVR+OHR' ? 'Both farms' : s }, s))] })
                                        : p.origin_site === 'GVR+OHR' ? 'Both farms (GVR and OHR)' : p.origin_site ?? 'unknown' }), _jsx("dt", { children: "Item" }), _jsx("dd", { children: item
                                        ? _jsxs(_Fragment, { children: [_jsxs("a", { onClick: () => setShowSku(v => !v), children: [FINISH_LABEL[item.finish] ?? item.finish, " \u00B7 ", item.crop_year, " \u00B7 ", item.site] }), item.metrc_status === 'to_create' && _jsx("span", { className: "pill warn", children: "not in METRC yet" }), showSku && _jsxs("div", { className: "muted small", children: [_jsx("div", { className: "mono", children: item.sku }), _jsx("div", { children: item.metrc_name })] })] })
                                        : _jsx("span", { className: "muted", children: "none (needs strain, farm and year)" }) }), _jsx("dt", { children: "Harvest lot" }), _jsx("dd", { children: lot ? _jsxs(_Fragment, { children: [_jsx("span", { className: "mono", children: lot.code }), lot.metrc_name && lot.metrc_name !== lot.code && _jsxs("div", { className: "muted small", children: ["METRC: ", lot.metrc_name] })] }) : _jsx("span", { className: "muted", children: "none" }) }), _jsx(TestRows, { sb: backend.client(), palletId: p.id, flash: flash }), _jsx("dt", { children: "Grade" }), _jsxs("dd", { children: [_jsx("span", { className: `pill grade ${g.grade.toLowerCase()}`, children: g.grade }), _jsxs("span", { className: "muted", children: [" ", g.from === 'pallet' ? 'set on this pallet' : g.from === 'lot' ? `whole lot${lot?.grade_reason ? ` (${lot.grade_reason})` : ''}` : 'strain default'] }), canGrade && _jsxs("div", { className: "row gradeset", children: [lot && onLotGrade && _jsxs("label", { children: ["Lot ", _jsxs(Select, { className: "inline", disabled: busy, value: lot.grade ?? '', onChange: e => onLotGrade(lot, (e.target.value || null)), children: [_jsxs("option", { value: "", children: ["Strain default (", strainDefault, ")"] }), _jsx("option", { value: "SHO", children: "SHO" }), _jsx("option", { value: "BHO", children: "BHO" })] })] }), onPalletGrade && _jsxs("label", { children: ["This pallet ", _jsxs(Select, { className: "inline", disabled: busy, value: p.grade ?? '', onChange: e => onPalletGrade((e.target.value || null)), children: [_jsx("option", { value: "", children: lot ? 'Same as lot' : 'Strain default' }), _jsx("option", { value: "SHO", children: "SHO" }), _jsx("option", { value: "BHO", children: "BHO" })] })] })] })] })] }), isMixed && contents.length > 0 && _jsxs(_Fragment, { children: [_jsx("dt", { children: "Grown at" }), _jsx("dd", { children: [...new Set(contents.map(c => c.origin_site ?? '?'))].sort().join(', ') })] }), parent && _jsxs(_Fragment, { children: [_jsx("dt", { children: "Split from" }), _jsx("dd", { children: link(parent) })] }), children.length > 0 && _jsxs(_Fragment, { children: [_jsx("dt", { children: "Split off" }), _jsx("dd", { children: join(children) })] }), sources.length > 0 && _jsxs(_Fragment, { children: [_jsx("dt", { children: "Made from" }), _jsx("dd", { children: join(sources) })] }), into && _jsxs(_Fragment, { children: [_jsx("dt", { children: "Merged into" }), _jsx("dd", { children: link(into) })] }), p.notes && _jsxs(_Fragment, { children: [_jsx("dt", { children: "Notes" }), _jsx("dd", { children: p.notes })] })] }), isMixed && (_jsxs("div", { className: "contents", children: [contents.length === 0 && _jsx("div", { className: "muted", children: "Nothing on this pallet." }), contents.map(c => (_jsxs("button", { className: "content", onClick: () => onPick(c.id), children: [_jsx("b", { children: c.code }), _jsx("span", { children: _jsx(StrainLink, { name: c.strain }) }), _jsx("span", { children: lbs(c.current_weight) }), _jsx("span", { className: "mono", children: c.package_tag ?? (c.tag_pending ? 'tag pending' : 'no tag') })] }, c.id)))] })), others.length > 0 && _jsxs("div", { className: "muted", children: ["Stacked with ", join(others)] }), live && isMixed && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "row actions", children: [_jsx("button", { className: "primary big", disabled: busy, onClick: onMove, children: onTruck ? 'Back to a freezer' : 'Move' }), _jsx("button", { className: "ghost big", disabled: busy || (!!loadInfo && !loadEditable), onClick: () => onForm('addmixed'), children: "Pull packages" }), _jsx("button", { className: "ghost big", disabled: busy || (!!loadInfo && !loadEditable), onClick: onBreak, children: "Break apart" })] }), _jsxs("div", { className: "row", children: [inFreezer && !loadInfo && _jsx("button", { className: "ghost small", disabled: busy, onClick: onPutOnLoad, children: "Put on a load" }), contents.length === 0 && (!loadInfo || loadEditable) && _jsx("button", { className: "ghost small danger", disabled: busy, onClick: onRemove, children: "Remove" })] })] })), live && container && (_jsxs(_Fragment, { children: [_jsx("div", { className: "row actions", children: _jsxs("button", { className: "primary big", disabled: busy, onClick: onTakeOff, children: ["Take off ", container.code] }) }), _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost small", disabled: busy, onClick: () => onForm('weight'), children: "Adjust weight" }), _jsx("button", { className: "ghost small", disabled: busy, onClick: () => onForm('tag'), children: p.package_tag ? 'Edit tag' : 'Enter tag' })] })] })), live && !isMixed && !container && (_jsx(PackageActions, { p: p, busy: busy, big: true, move: { label: onTruck ? 'Back to a freezer' : 'Move', run: onMove }, onForm: onForm, onLoad: inFreezer && !loadInfo ? onPutOnLoad : null, onRemove: !loadInfo || loadEditable ? onRemove : null, onFlag: onFlag, onClear: onClear, off: { addto: !!loadInfo && !loadEditable } })), onArchived && _jsx("div", { className: "row actions", children: _jsx("button", { className: "primary big", onClick: onArchived, children: "Bring back or delete\u2026" }) }), _jsx("h3", { children: "History" }), !hist && _jsx("p", { className: "muted", children: "Loading\u2026" }), hist?.length === 0 && _jsx("p", { className: "muted", children: "No history." }), _jsx("div", { className: "timeline", children: hist?.map(e => (_jsxs("div", { className: `hist t-${e.type}`, children: [_jsx("div", { children: describe(ix, e, new Map([[p.id, p.code]])) }), _jsxs("div", { className: "muted", children: [when(e.at), " \u00B7 ", who(e.user_email), e.note && _jsxs(_Fragment, { children: [" \u00B7 \"", e.note, "\""] })] })] }, e.id))) })] }) }));
}
/** Freezer map: pallets moved between OHR and GVR. Make a real transfer (a load and its METRC manifest) or just a to-do. */
function CrossSiteDialog({ cs, vehicles, drivers, code, busy, onClose, onNo, onYes }) {
    const [yes, setYes] = useState(false);
    const [vehicle, setVehicle] = useState(vehicles[0]?.id ?? null);
    const [driver, setDriver] = useState('');
    const routes = [...new Set(cs.cross.map(c => `${c.from} to ${c.to}`))].join(', ');
    return _jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: "sheet form", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsx("h2", { children: "Moving between farms" }), _jsx("button", { className: "ghost", onClick: onClose, children: "\u2715" })] }), _jsxs("p", { children: [cs.cross.map(c => code(c.id)).join(', '), " ", cs.cross.length === 1 ? 'goes' : 'go', " ", routes, ". That's a transfer between licenses: METRC needs a manifest."] }), !yes ? _jsxs(_Fragment, { children: [_jsxs("p", { className: "muted", children: ["Make the transfer manifest now? The app puts ", cs.cross.length === 1 ? 'it' : 'them', " on a transfer load and makes the METRC manifest. They show in transit until the load is delivered there."] }), _jsxs("div", { className: "row end wrap", children: [_jsxs("button", { className: "ghost", disabled: busy, onClick: onNo, children: ["No, just move ", cs.cross.length === 1 ? 'it' : 'them', " (to-do)"] }), _jsx("button", { className: "primary", disabled: busy, onClick: () => setYes(true), children: "Yes, make the manifest" })] })] }) : _jsxs(_Fragment, { children: [_jsxs("div", { className: "field", children: [_jsx("label", { children: "Truck" }), _jsx(Select, { value: vehicle ?? '', onChange: e => setVehicle(Number(e.target.value)), children: vehicles.map(v => _jsx("option", { value: v.id, children: v.name }, v.id)) })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Driver" }), _jsx("input", { list: "xs-drivers", value: driver, onChange: e => setDriver(e.target.value), placeholder: "Pick or type a name" }), _jsx("datalist", { id: "xs-drivers", children: drivers.map(d => _jsx("option", { value: d }, d)) })] }), _jsx("p", { className: "muted small", children: "Other moves in this batch are saved as usual." }), _jsxs("div", { className: "row end", children: [_jsx("button", { className: "ghost", onClick: () => setYes(false), children: "Back" }), _jsx("button", { className: "primary", disabled: busy || vehicle == null || !driver.trim(), onClick: () => onYes(vehicle, driver.trim()), children: "Make the transfer" })] })] })] }) });
}
