import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { CompFleet } from '../fleet/Fleet';
import { useState } from 'react';
import { live, n0, sum } from './calc';
import { F, NumIn, Pick, SaveBar, Sheet, TextIn } from '../cult/ui';
import { t } from '../i18n';
import { Fold } from '../fold';
import { ModulePeople } from '../users';
import { TagRanges } from '../licenses';
const KIND = { bench: 'Greenhouse bench', greenhouse: 'Greenhouse', hoop: 'Hoop', trailer: 'Rooting trailer', veg: 'Veg', other: 'Other' };
// setting key, label, hint
const NUMS = [
    ['buffer', 'nursery.buffer_pct', 'Extra cuttings %', 'covers losses'],
    ['deliverPct', 'nursery.deliver_pct', 'Deliver over order %', 'what you aim to send'],
    ['tray', 'nursery.tray', 'Cells per tray', ''],
    ['cutsG3', 'nursery.cuts_g3', 'Cuts per G3 field mom', ''],
    ['cutsG2', 'nursery.cuts_g2', 'Cuts per G2 greenhouse mom', ''],
    ['cutsG1', 'nursery.cuts_g1', 'Cuts per G1 mom', ''],
    ['rootDays', 'nursery.root_days', 'Days to root (G4)', 'cut to delivery'],
    ['g3VegDays', 'nursery.g3_veg_days', 'G3 planted → first G4 cut', 'days'],
    ['g3RootDays', 'nursery.g3_root_days', 'G3 cut → planted', 'days'],
    ['g2Lead', 'nursery.g2_lead_days', 'G2 cut → G3 cut', 'days'],
    ['g1Lead', 'nursery.g1_lead_days', 'G1 cut → G2 cut', 'days'],
    ['readyWarn', 'nursery.ready_warn_days', 'Flag ready batches after', 'days'],
    ['wage', 'nursery.wage', 'Hourly wage (labor cost)', '$'],
    ['price', 'nursery.clone_price', 'Price per clone', '$ (default)'],
];
/** Nursery > Settings (Nursery Admins) */
export function SetupTab({ d, sb, api, terms, flash, onSaved }) {
    const [vals, setVals] = useState(() => Object.fromEntries(NUMS.map(([k]) => [k, d.settings[k]])));
    const [termsCode, setTerms] = useState(d.settings.terms);
    const [busy, setBusy] = useState(false);
    const [room, setRoom] = useState(null);
    const run = async (f, ok) => {
        setBusy(true);
        try {
            await f();
            await onSaved(ok);
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
        finally {
            setBusy(false);
        }
    };
    const changed = NUMS.filter(([k]) => vals[k] !== d.settings[k]);
    const nLics = d.licenses.filter(l => l.kind === 'nursery');
    const used = (r) => {
        const inR = (t) => !!t && t.startsWith(r.prefix) && t.length === r.prefix.length + r.digits && (n => n >= r.first_n && n <= r.last_n)(Number(t.slice(r.prefix.length)));
        return d.mothers.filter(m => inR(m.plant_tag)).length + d.batches.reduce((a, b) => a + b.tags.filter(inR).length, 0);
    };
    const places = [...new Set(d.rooms.map(r => r.place))];
    const inRoom = (id) => sum(d.mothers.filter(m => m.room_id === id).map(live));
    return (_jsxs("div", { className: "dash", children: [_jsxs(Fold, { id: "nset.plan", title: t('Planning numbers'), open: true, children: [_jsxs("div", { className: "nset", children: [NUMS.map(([k, , l, h]) => _jsx(F, { label: t(l), hint: h ? `(${t(h)})` : undefined, children: _jsx(NumIn, { value: vals[k], onChange: v => setVals(s => ({ ...s, [k]: v })) }) }, k)), _jsx(F, { label: t('Payment terms'), hint: t('(default)'), children: _jsx(Pick, { value: termsCode, options: terms.filter(t => t.active || t.code === termsCode).map(t => ({ v: t.code, l: t.label })), onChange: setTerms }) })] }), (changed.length > 0 || termsCode !== d.settings.terms) && _jsx("button", { className: "primary small", disabled: busy, onClick: () => run(async () => {
                            for (const [k, key] of changed)
                                await api.setSetting(key, String(vals[k] ?? 0));
                            if (termsCode !== d.settings.terms)
                                await api.setSetting('nursery.terms', termsCode ?? 'COD');
                        }, t('Saved')), children: t('Save') }), _jsx("p", { className: "muted small-note", children: t('The Plan screen uses these. Cuts per mom can also be set per strain (tap a strain on the Plan). Each clone order can have its own price and terms.') })] }), _jsx(Fold, { id: "nset.locations", title: t('Locations'), count: d.rooms.filter(r => r.active).length, right: _jsx("button", { className: "linkbtn", onClick: () => setRoom({ site: d.sites[0]?.code, place: 'Webb', kind: 'hoop', active: true, beds: [{ bed: 'A', cap: 150 }, { bed: 'B', cap: 200 }, { bed: 'C', cap: 150 }] }), children: t('+ Add ›') }), children: places.map(p => {
                    const rs = d.rooms.filter(r => r.place === p);
                    const hoops = rs.filter(r => r.kind === 'hoop');
                    return (_jsxs("div", { className: "locgroup", children: [_jsxs("b", { children: [p, rs.some(r => r.rented) ? ' (rented)' : ''] }), _jsxs("span", { className: "muted small", children: [" \u00B7 ", hoops.length, " hoops, ", n0(sum(hoops.map(h => h.capacity ?? 0))), " mom spots", rs.some(r => r.kind === 'trailer') ? ` · ${rs.filter(r => r.kind === 'trailer').length} trailers` : ''] }), _jsx("div", { className: "locgrid", children: rs.map(r => _jsxs("button", { className: `loc ${r.active ? '' : 'off'}`, onClick: () => setRoom(r), children: [_jsx("b", { children: r.name }), _jsx("span", { className: "muted", children: r.kind === 'hoop' ? `${n0(inRoom(r.id))} / ${n0(r.capacity)}` : r.kind === 'trailer' ? t('{n} trays', { n: n0(r.trays) }) : inRoom(r.id) ? t('{n} moms', { n: n0(inRoom(r.id)) }) : t(KIND[r.kind]) })] }, r.id)) })] }, p));
                }) }), _jsxs(Fold, { id: "nset.sites", title: t('Nursery sites'), count: d.sites.length, children: [_jsx("div", { className: "dlist", children: d.sites.map(s => {
                            const l = d.licenses.find(x => x.license_no === s.license);
                            return _jsx("div", { className: "drow", children: _jsxs("span", { className: "grow", children: [_jsx("b", { children: s.name }), _jsxs("span", { className: "muted", children: [" \u00B7 ", t('license'), " ", s.license ?? t('none'), l ? ` · ${l.entity}` : ''] })] }) }, s.code);
                        }) }), _jsx("p", { className: "muted small-note", children: t('Invoices for clones come from the nursery license\'s entity. Edit licenses in Admin → Settings → Licenses.') })] }), nLics.map(l => _jsx(Fold, { id: `nset.tags.${l.license_no}`, title: `${t('METRC tags')} · ${l.license_no}`, children: _jsx(TagRanges, { sb: sb, license: l.license_no, kind: "nursery", ranges: d.ranges, used: used, canEdit: true, flash: flash, onChanged: () => onSaved(t('Tags updated')) }) }, l.license_no)), _jsx(Fold, { id: "nset.vehicles", title: t('Vehicles and equipment'), children: _jsx(CompFleet, { sb: sb, flash: flash, dept: "nursery" }) }), _jsx(Fold, { id: "nset.people", title: t('People'), children: _jsx(ModulePeople, { sb: sb, module: "nursery", flash: flash }) }), room && _jsx(RoomSheet, { d: d, r: room, api: api, busy: busy, run: run, onClose: () => setRoom(null) })] }));
}
function RoomSheet({ d, r, api, busy, run, onClose }) {
    const [x, setX] = useState(r);
    const set = (v) => setX(s => ({ ...s, ...v }));
    const beds = x.beds ?? [];
    const setBed = (i, cap) => set({ beds: beds.map((b, j) => (j === i ? { ...b, cap: cap ?? 0 } : b)) });
    const used = r.id ? d.mothers.some(m => m.room_id === r.id) || d.batches.some(b => b.room_id === r.id) : false;
    return (_jsxs(Sheet, { title: r.id ? r.name ?? t('Location') : t('New location'), onClose: onClose, children: [_jsxs("div", { className: "grid2", children: [_jsx(F, { label: t('Name'), children: _jsx(TextIn, { value: x.name, onChange: v => set({ name: v ?? '' }), autoFocus: !r.id, placeholder: t('Hoop 19') }) }), _jsx(F, { label: t('Place'), children: _jsx(TextIn, { value: x.place, list: "n-places", onChange: v => set({ place: v ?? 'Webb' }) }) }), _jsx(F, { label: t('Kind'), children: _jsx(Pick, { value: x.kind, options: Object.keys(KIND).map(k => ({ v: k, l: t(KIND[k]) })), onChange: v => set({ kind: v ?? 'other' }) }) }), x.kind === 'trailer' && _jsx(F, { label: t('Trays it holds'), children: _jsx(NumIn, { value: x.trays, onChange: v => set({ trays: v }) }) })] }), _jsx("datalist", { id: "n-places", children: [...new Set(d.rooms.map(z => z.place))].map(p => _jsx("option", { value: p }, p)) }), x.kind === 'hoop' && _jsxs(_Fragment, { children: [_jsx("h3", { children: t('Beds (plants each)') }), _jsx("div", { className: "grid3", children: beds.map((b, i) => _jsx(F, { label: `${t('Bed')} ${b.bed}`, children: _jsx(NumIn, { value: b.cap, onChange: v => setBed(i, v) }) }, b.bed)) }), _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost small", onClick: () => set({ beds: [...beds, { bed: String.fromCharCode(65 + beds.length), cap: 0 }] }), children: t('+ Bed') }), beds.length > 0 && _jsx("button", { className: "ghost small", onClick: () => set({ beds: beds.slice(0, -1) }), children: t('− Bed') }), _jsx("span", { className: "muted small", children: t('{n} plants', { n: n0(sum(beds.map(b => b.cap))) }) })] })] }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: !!x.rented, onChange: e => set({ rented: e.target.checked }) }), " ", _jsx("span", { children: t('Rented space') })] }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: x.active !== false, onChange: e => set({ active: e.target.checked }) }), " ", _jsx("span", { children: t('In use') })] }), _jsx(SaveBar, { busy: busy, disabled: !x.name?.trim(), onCancel: onClose, onSave: () => run(() => api.save('nursery_rooms', { id: x.id, site: x.site ?? d.sites[0]?.code, place: (x.place ?? 'Webb').trim(), name: x.name.trim(), kind: x.kind ?? 'other',
                    active: x.active !== false, rented: !!x.rented, beds: x.kind === 'hoop' ? beds : [], capacity: x.kind === 'hoop' ? sum(beds.map(b => b.cap)) : null, trays: x.kind === 'trailer' ? x.trays ?? null : null }), t('Location saved')).then(onClose), onDelete: r.id && !used ? () => run(() => api.remove('nursery_rooms', r.id), t('Location removed')).then(onClose) : undefined })] }));
}
