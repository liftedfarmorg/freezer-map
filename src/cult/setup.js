import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { CompFleet } from '../fleet/Fleet';
import { useEffect, useState } from 'react';
import { n0, n2, pct } from './calc';
import { F, NumIn, Pick, SaveBar, Sheet, TextIn, errText } from './ui';
import { can, Fold } from '../fold';
import { ModulePeople } from '../users';
const TABLE_LABEL = {
    cult_harvests: 'Harvest', cult_plantings: 'Planting', cult_tests: 'Test', cult_flower_picks: 'Dry flower pick', cult_demand: 'Plan strain',
    cult_plan: 'Plan row', cult_nursery_orders: 'Nursery delivery', cult_receipts: 'Plants received', app_settings: 'Setting',
};
/** one line for a Cultivation change log row */
export function describeLog(r) {
    const what = TABLE_LABEL[r.tbl] ?? r.tbl;
    const name = (r.data?.strain ?? r.was?.strain ?? '');
    const keys = r.op === 'update' ? Object.keys(r.data ?? {}).filter(k => !['updated_by', 'updated_at'].includes(k)) : [];
    return `${what} ${r.op === 'insert' ? 'added' : r.op === 'delete' ? 'deleted' : 'changed'}${name ? `: ${name}` : ''}${keys.length ? ` (${keys.join(', ').replace(/_/g, ' ')})` : ''}`;
}
export function SetupTab({ d, api, sb, flash, onSaved }) {
    const [site, setSite] = useState(null);
    const [field, setField] = useState(null);
    const [labs, setLabs] = useState(d.settings.labs.join(', '));
    const [eq, setEq] = useState(d.settings.equipment.join(', '));
    const [ready, setReady] = useState(d.settings.readyDays);
    async function saveSettings() {
        try {
            await api.setSetting('cult.labs', labs.split(',').map(s => s.trim()).filter(Boolean).join('|'));
            await api.setSetting('cult.equipment', eq.split(',').map(s => s.trim()).join('|'));
            await api.setSetting('cult.ready_days', String(ready ?? 2));
            await onSaved('Settings saved');
        }
        catch (e) {
            flash(errText(e), true);
        }
    }
    return (_jsxs(_Fragment, { children: [_jsxs(Fold, { id: "cset.sites", title: "Sites", count: d.sites.length, open: true, children: [_jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Site" }), _jsx("th", { children: "License" }), _jsx("th", { className: "num", children: "Row ft / acre" }), _jsx("th", { className: "num", children: "Dry ice / 10 lb" }), _jsx("th", { className: "num", children: "Truck (raw lbs)" }), _jsx("th", { className: "num", children: "Work day" }), _jsx("th", { className: "num", children: "Deleaf rate" }), _jsx("th", { className: "num", children: "Buck rate" }), _jsx("th", { className: "num", children: "Dry conv." }), _jsx("th", { children: "Pallets" })] }) }), _jsx("tbody", { children: d.sites.map(s => (_jsxs("tr", { className: "tap", onClick: () => setSite(s), children: [_jsxs("td", { children: [_jsx("b", { children: s.code }), " ", _jsx("span", { className: "muted", children: s.name })] }), _jsx("td", { className: "small", children: s.license }), _jsx("td", { className: "num", children: n0(s.row_feet_per_acre) }), _jsx("td", { className: "num", children: s.dry_ice_per_10lb }), _jsx("td", { className: "num", children: n0(s.truck_raw_lbs) }), _jsxs("td", { className: "num", children: [s.workday_hours, " h"] }), _jsx("td", { className: "num", children: s.deleaf_rate ?? '' }), _jsx("td", { className: "num", children: s.buck_rate ?? '' }), _jsx("td", { className: "num", children: pct(s.dry_conversion) }), _jsxs("td", { children: [s.pallet_prefix, "###"] })] }, s.code))) })] }) }), _jsx("p", { className: "cnote", children: "Deleaf and buck rates here are the defaults for harvests that don't have their own. Row feet per acre: 13,068 for 40\" beds, 17,424 for 60\" beds." })] }), _jsxs(Fold, { id: "cset.fields", title: "Fields", count: d.fields.filter(f => f.active).length, right: _jsx("button", { className: "primary small", onClick: () => setField({ site: 'OHR', kind: 'flower', active: true, aliases: [], sort: 50 }), children: "+ Field" }), children: [_jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Site" }), _jsx("th", { children: "Code" }), _jsx("th", { children: "Name" }), _jsx("th", { children: "Also written as" }), _jsx("th", { className: "num", children: "Acres" }), _jsx("th", { children: "Use" })] }) }), _jsx("tbody", { children: d.fields.map(f => (_jsxs("tr", { className: `tap ${f.active ? '' : 'cancelled'}`, onClick: () => setField(f), children: [_jsx("td", { children: f.site }), _jsx("td", { children: _jsx("b", { children: f.code }) }), _jsx("td", { children: f.name }), _jsx("td", { className: "small", children: f.aliases.join(', ') }), _jsx("td", { className: "num", children: n2(f.acres) }), _jsx("td", { children: f.kind })] }, f.id))) })] }) }), _jsx("p", { className: "cnote", children: "Pallet zones, harvest log fields and planting zones all match to these by code, name or \"also written as\" (\"Block 1- A\", \"1A\", \"Field 8A\")." })] }), _jsxs(Fold, { id: "cset.lists", title: "Lists", children: [_jsx(F, { label: "Labs", hint: "comma separated", children: _jsx(TextIn, { value: labs, onChange: v => setLabs(v ?? '') }) }), _jsx(F, { label: "Biomass equipment", hint: "cut, merge, combine, strip header", children: _jsx(TextIn, { value: eq, onChange: v => setEq(v ?? '') }) }), _jsx(F, { label: "Days from harvest to ready", hint: "(availability)", children: _jsx(NumIn, { value: ready, onChange: setReady }) }), _jsx("button", { className: "primary", onClick: saveSettings, children: "Save lists" })] }), _jsx(Fold, { id: "cset.tags", title: "METRC tags from pallet numbers", children: _jsx(TagRules, { api: api, flash: flash }) }), _jsx(Fold, { id: "cset.vehicles", title: "Vehicles and equipment", children: _jsx(CompFleet, { sb: sb, flash: flash, dept: "cultivation" }) }), _jsx(Fold, { id: "cset.people", title: "People", children: _jsx(ModulePeople, { sb: sb, module: "cultivation", flash: flash }) }), _jsx("p", { className: "cnote", children: "Every change in Cultivation is listed under Activity." }), site && _jsx(SiteSheet, { s: site, api: api, flash: flash, onClose: () => setSite(null), onSaved: async (m) => { setSite(null); await onSaved(m); } }), field && _jsx(FieldSheet, { d: d, f: field, api: api, flash: flash, onClose: () => setField(null), onSaved: async (m) => { setField(null); await onSaved(m); } })] }));
}
function SiteSheet({ s, api, flash, onClose, onSaved }) {
    const [x, setX] = useState(s);
    const [busy, setBusy] = useState(false);
    const set = (v) => setX(o => ({ ...o, ...v }));
    async function save() { setBusy(true); try {
        await api.save('sites', x);
        await onSaved('Site saved');
    }
    catch (e) {
        flash(errText(e), true);
    }
    finally {
        setBusy(false);
    } }
    return (_jsxs(Sheet, { title: `${s.code} settings`, onClose: onClose, children: [_jsxs("div", { className: "grid2", children: [_jsx(F, { label: "Name", children: _jsx(TextIn, { value: x.name, onChange: v => set({ name: v ?? s.name }) }) }), _jsx(F, { label: "License", children: _jsx(TextIn, { value: x.license, onChange: v => set({ license: v }) }) }), _jsx(F, { label: "Row feet per acre", children: _jsx(NumIn, { value: x.row_feet_per_acre, onChange: v => set({ row_feet_per_acre: v ?? 13068 }) }) }), _jsx(F, { label: "Dry ice per 10 lb box", children: _jsx(NumIn, { value: x.dry_ice_per_10lb, onChange: v => set({ dry_ice_per_10lb: v ?? 3 }) }) }), _jsx(F, { label: "Raw lbs per truck", children: _jsx(NumIn, { value: x.truck_raw_lbs, onChange: v => set({ truck_raw_lbs: v ?? 10000 }) }) }), _jsx(F, { label: "Work day (hours)", children: _jsx(NumIn, { value: x.workday_hours, onChange: v => set({ workday_hours: v ?? 8 }) }) }), _jsx(F, { label: "Deleaf rate", hint: "plants/man-hr", children: _jsx(NumIn, { value: x.deleaf_rate, onChange: v => set({ deleaf_rate: v }) }) }), _jsx(F, { label: "Buck rate", hint: "lbs/man-hr", children: _jsx(NumIn, { value: x.buck_rate, onChange: v => set({ buck_rate: v }) }) }), _jsx(F, { label: "Dry conversion", hint: "0.075 = 7.5%", children: _jsx(NumIn, { value: x.dry_conversion, onChange: v => set({ dry_conversion: v ?? 0.075 }) }) }), _jsx(F, { label: "Pallet letter", children: _jsx(TextIn, { value: x.pallet_prefix, onChange: v => set({ pallet_prefix: v ? v.toUpperCase() : null }) }) })] }), _jsx(SaveBar, { busy: busy, onSave: save, onCancel: onClose })] }));
}
function FieldSheet({ d, f, api, flash, onClose, onSaved }) {
    const [x, setX] = useState(f);
    const [busy, setBusy] = useState(false);
    const set = (v) => setX(o => ({ ...o, ...v }));
    async function save() { setBusy(true); try {
        await api.save('fields', x);
        await onSaved('Field saved');
    }
    catch (e) {
        flash(errText(e), true);
    }
    finally {
        setBusy(false);
    } }
    return (_jsxs(Sheet, { title: f.id ? `${f.site} ${f.code}` : 'Add field', onClose: onClose, children: [_jsxs("div", { className: "grid2", children: [_jsx(F, { label: "Site", children: _jsx(Pick, { value: x.site ?? 'OHR', onChange: v => set({ site: v ?? 'OHR' }), options: d.sites.map(s => ({ v: s.code, l: s.code })) }) }), _jsx(F, { label: "Code", hint: "short, like 1A", children: _jsx(TextIn, { value: x.code, onChange: v => set({ code: v ?? '' }) }) }), _jsx(F, { label: "Name", children: _jsx(TextIn, { value: x.name, onChange: v => set({ name: v ?? '' }), placeholder: "Block 1- A" }) }), _jsx(F, { label: "Acres", hint: "net planted", children: _jsx(NumIn, { value: x.acres, onChange: v => set({ acres: v }) }) }), _jsx(F, { label: "Use", children: _jsx(Pick, { value: x.kind ?? 'flower', onChange: v => set({ kind: v ?? 'flower' }), options: ['flower', 'biomass', 'both', 'trials', 'nursery'].map(k => ({ v: k, l: k })) }) }), _jsx(F, { label: "Order", children: _jsx(NumIn, { value: x.sort, onChange: v => set({ sort: v ?? 0 }) }) })] }), _jsx(F, { label: "Also written as", hint: "comma separated", children: _jsx(TextIn, { value: (x.aliases ?? []).join(', '), onChange: v => set({ aliases: (v ?? '').split(',').map(s => s.trim()).filter(Boolean) }) }) }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: x.active !== false, onChange: e => set({ active: e.target.checked }) }), " In use"] }), _jsx(SaveBar, { busy: busy, disabled: !x.code?.trim() || !x.name?.trim(), onSave: save, onCancel: onClose })] }));
}
/** pallet # → METRC package tag, per site and letter: tag = prefix + (offset + number) padded to the digits. P53 at OHR = 1A406030007AD3D000010053. */
function TagRules({ api, flash }) {
    const [rules, setRules] = useState(null);
    const [ed, setEd] = useState(null);
    const [busy, setBusy] = useState(false);
    const load = () => api.tagRules().then(setRules);
    useEffect(() => { load(); }, []);
    const mine = can('cultivation', 'tag_rules');
    const sample = (r, n = 53) => r.prefix ? r.prefix + String((Number(r.offset) || 0) + n).padStart(Number(r.digits) || 9, '0') : '';
    const save = async (r) => {
        setBusy(true);
        try {
            await api.saveTagRule(r);
            await load();
            setEd(null);
            flash(r.delete ? 'Rule removed' : 'Tag rule saved');
        }
        catch (e) {
            flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    };
    if (!rules)
        return _jsx("p", { className: "muted", children: "Loading\u2026" });
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: "cwrap tight", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Site" }), _jsx("th", { children: "Pallets" }), _jsx("th", { children: "Tag for #53" }), _jsx("th", { className: "hide-s", children: "License" }), _jsx("th", {})] }) }), _jsxs("tbody", { children: [rules.map(r => _jsxs("tr", { className: r.active ? '' : 'cancelled', children: [_jsx("td", { children: r.site }), _jsxs("td", { children: [r.letter, "\u2026"] }), _jsx("td", { className: "mono small", children: sample(r) }), _jsx("td", { className: "hide-s", children: r.license ?? '' }), _jsx("td", { children: mine && _jsx("button", { className: "ghost small", onClick: () => setEd(r), children: "Edit" }) })] }, r.site + r.letter)), !rules.length && _jsx("tr", { children: _jsx("td", { colSpan: 5, className: "muted", children: "No rules yet. Tags are typed or scanned." }) })] })] }) }), mine && !ed && _jsx("button", { className: "ghost small", onClick: () => setEd({ site: 'OHR', letter: 'P', offset: 0, digits: 9, active: true }), children: "+ Rule" }), ed && _jsxs("div", { className: "grid3", children: [_jsx(F, { label: "Site", children: _jsx(TextIn, { value: ed.site, onChange: v => setEd({ ...ed, site: (v ?? '').toUpperCase() }) }) }), _jsx(F, { label: "Pallet letter", children: _jsx(TextIn, { value: ed.letter, onChange: v => setEd({ ...ed, letter: (v ?? '').toUpperCase() }) }) }), _jsx(F, { label: "Tag start", hint: "before the number", children: _jsx(TextIn, { value: ed.prefix, onChange: v => setEd({ ...ed, prefix: (v ?? '').toUpperCase().replace(/\s/g, '') }) }) }), _jsx(F, { label: "Add to the number", children: _jsx(NumIn, { value: ed.offset, onChange: v => setEd({ ...ed, offset: v ?? 0 }) }) }), _jsx(F, { label: "Digits", children: _jsx(NumIn, { value: ed.digits, onChange: v => setEd({ ...ed, digits: v ?? 9 }) }) }), _jsx(F, { label: "License", children: _jsx(TextIn, { value: ed.license, onChange: v => setEd({ ...ed, license: v }) }) }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: ed.active !== false, onChange: e => setEd({ ...ed, active: e.target.checked }) }), " ", _jsx("span", { children: "On" })] }), _jsxs("p", { className: "cnote", style: { gridColumn: '1 / -1' }, children: [ed.letter ?? '', "53 \u2192 ", _jsx("span", { className: "mono", children: sample(ed) || '…' })] }), _jsxs("div", { className: "row", style: { gridColumn: '1 / -1' }, children: [_jsx("button", { className: "ghost", onClick: () => setEd(null), children: "Cancel" }), rules.some(r => r.site === ed.site && r.letter === ed.letter) && _jsx("button", { className: "ghost danger", disabled: busy, onClick: () => save({ site: ed.site, letter: ed.letter, delete: true }), children: "Remove" }), _jsx("button", { className: "primary", disabled: busy || !ed.site || !ed.letter || !ed.prefix, onClick: () => save(ed), children: "Save rule" })] })] }), _jsx("p", { className: "cnote", children: "The Harvest log fills in each pallet's METRC tag from its number. Trial (T) pallets have no rule: their tags are checked against METRC and typed. A tag typed or scanned on a pallet always wins." })] }));
}
