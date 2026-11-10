import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { Select } from '../combo';
import { errText } from '../cult/ui';
// Compliance > METRC > Mapping (Phase 2): what METRC calls our fields, nursery rooms, drying rooms and strains,
// plus what's growing where in METRC (plant batches and plant counts from the nightly pull).
const n0 = (x) => (x == null ? '' : Math.round(Number(x)).toLocaleString());
export function Mapping({ c }) {
    const [d, setD] = useState(null);
    const [site, setSite] = useState('OHR');
    const [busy, setBusy] = useState(null);
    const [q, setQ] = useState('');
    const load = async () => { try {
        setD(await c.api.mapData());
    }
    catch (e) {
        c.flash(errText(e), true);
    } };
    useEffect(() => { load(); }, []);
    const lic = useMemo(() => {
        if (!d)
            return null;
        if (site === '1PN')
            return d.nurserySites.find(n => n.code === '1PN')?.license ?? null;
        return d.licenses.find(l => l.active && l.kind === 'cultivation' && (l.site ?? '').toUpperCase() === site)?.license_no ?? null;
    }, [d, site]);
    if (!d)
        return _jsx("p", { className: "muted", children: "Loading\u2026" });
    const locs = d.locs.filter(l => l.license === lic);
    const mapped = (kind, ref) => d.locMap.find(m => m.app_kind === kind && m.app_ref === ref && m.license === lic);
    const counts = (locId) => {
        if (!locId)
            return null;
        const b = d.batches.filter(x => x.license === lic && x.location_id === locId).reduce((s, x) => s + Number(x.untracked ?? 0), 0);
        const v = d.counts.filter(x => x.license === lic && x.location_id === locId && x.phase === 'vegetative').reduce((s, x) => s + x.plants, 0);
        const f = d.counts.filter(x => x.license === lic && x.location_id === locId && x.phase === 'flowering').reduce((s, x) => s + x.plants, 0);
        return [b && `${n0(b)} immature`, v && `${n0(v)} veg`, f && `${n0(f)} flowering`].filter(Boolean).join(' · ') || 'empty';
    };
    async function setLoc(kind, ref, id) {
        if (!lic)
            return;
        try {
            await c.api.mapLocation(kind, ref, lic, id ? Number(id) : null);
            await load();
            c.flash('Saved');
        }
        catch (e) {
            c.flash(errText(e), true);
        }
    }
    async function setStrain(name, id) {
        if (!lic)
            return;
        try {
            await c.api.mapStrain(name, lic, id ? Number(id) : null);
            await load();
            c.flash('Saved');
        }
        catch (e) {
            c.flash(errText(e), true);
        }
    }
    async function pull() {
        setBusy('Pulling from METRC…');
        try {
            for (let i = 0; i < 12; i++) {
                const r = await c.api.pullMetrc(lic ? [lic] : undefined);
                const bad = r.results.find(x => x.error);
                if (bad) {
                    c.flash(`${bad.license}: ${bad.error}`, true);
                    break;
                }
                if (r.done) {
                    c.flash('METRC pulled');
                    break;
                }
                setBusy(`Still pulling… pass ${i + 2}`);
            }
            await load();
        }
        catch (e) {
            c.flash(errText(e), true);
        }
        finally {
            setBusy(null);
        }
    }
    const locSelect = (kind, ref, filter) => {
        const m = mapped(kind, ref);
        const opts = locs.filter(l => filter(l) || l.id === m?.location_id);
        return _jsxs(Select, { value: m ? String(m.location_id) : '', disabled: !c.isAdmin || !locs.length, onChange: e => setLoc(kind, ref, e.target.value), children: [_jsx("option", { value: "", children: locs.length ? 'Not mapped' : 'Pull from METRC first' }), opts.map(l => _jsxs("option", { value: String(l.id), children: [l.name, l.type_name ? ` (${l.type_name})` : ''] }, l.id))] });
    };
    const metrcStrains = d.strains.filter(s => s.license === lic);
    const strainOf = (name) => {
        const m = d.strainMap.find(x => x.app_strain.toLowerCase() === name.toLowerCase() && x.license === lic);
        if (m)
            return { id: m.strain_id, how: 'mapped' };
        const s = metrcStrains.find(x => x.name.toLowerCase() === name.toLowerCase());
        return s ? { id: s.id, how: 'same name' } : null;
    };
    const fields = d.fields.filter(f => f.site.toUpperCase() === site && f.active);
    const rooms = d.rooms.filter(r => r.site.toUpperCase() === site && r.active);
    const strains = d.appStrains.filter(s => !q || s.toLowerCase().includes(q.toLowerCase()));
    const unmatched = d.appStrains.filter(s => !strainOf(s)).length;
    const lastPull = d.locs.filter(l => l.license === lic).length;
    return _jsxs("div", { className: "list", children: [_jsx("p", { className: "muted", children: "For plant, nursery and harvest work the app needs to know what METRC calls our places and strains. Pull from METRC, then map each field (and nursery room) to its METRC location, pick each site's drying / harvest location, and fix strains that don't match by name." }), _jsxs("div", { className: "row wrap toolbar", children: [_jsx("div", { className: "seg", children: ['OHR', 'GVR', '1PN'].map(s => _jsx("button", { className: site === s ? 'on' : '', onClick: () => setSite(s), children: s }, s)) }), _jsxs("span", { className: "muted small", children: [lic ?? 'no license', " \u00B7 ", lastPull, " METRC locations \u00B7 ", metrcStrains.length, " strains"] }), _jsx("button", { className: "ghost small", disabled: !!busy, onClick: pull, children: busy ?? 'Pull from METRC' })] }), site !== '1PN' && _jsxs(_Fragment, { children: [_jsx("h3", { children: "Drying / harvest location" }), _jsx("div", { className: "grid2", children: _jsxs("div", { className: "field", children: [_jsxs("label", { children: ["Where ", site, " harvests go in METRC"] }), locSelect('drying', site, l => l.for_harvests !== false)] }) }), _jsx("h3", { children: "Fields" }), _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "ct", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Field" }), _jsx("th", { children: "METRC location" }), _jsx("th", { className: "hide-s", children: "In METRC there" })] }) }), _jsxs("tbody", { children: [fields.map(f => _jsxs("tr", { children: [_jsxs("td", { children: [_jsx("b", { children: f.name }), f.code ? _jsxs("span", { className: "muted small", children: [" ", f.code] }) : null] }), _jsx("td", { children: locSelect('field', String(f.id), l => l.for_plants !== false || l.for_plant_batches !== false) }), _jsx("td", { className: "muted small hide-s", children: counts(mapped('field', String(f.id))?.location_id) })] }, f.id)), !fields.length && _jsx("tr", { children: _jsxs("td", { colSpan: 3, className: "muted", children: ["No fields for ", site] }) })] })] }) })] }), site === '1PN' && _jsxs(_Fragment, { children: [_jsx("h3", { children: "Nursery rooms" }), _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "ct", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Room" }), _jsx("th", { children: "METRC location" }), _jsx("th", { className: "hide-s", children: "In METRC there" })] }) }), _jsxs("tbody", { children: [rooms.map(r => _jsxs("tr", { children: [_jsx("td", { children: _jsx("b", { children: r.name }) }), _jsx("td", { children: locSelect('room', String(r.id), l => l.for_plant_batches !== false || l.for_plants !== false) }), _jsx("td", { className: "muted small hide-s", children: counts(mapped('room', String(r.id))?.location_id) })] }, r.id)), !rooms.length && _jsx("tr", { children: _jsx("td", { colSpan: 3, className: "muted", children: "No rooms" }) })] })] }) })] }), _jsxs("h3", { children: ["Strains ", unmatched > 0 && metrcStrains.length > 0 && _jsxs("span", { className: "pill m-warn", children: [unmatched, " not matched on ", lic] })] }), _jsx("input", { placeholder: "Find a strain", value: q, onChange: e => setQ(e.target.value) }), _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "ct", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "App strain" }), _jsxs("th", { children: ["METRC strain on ", lic] }), _jsx("th", { className: "hide-s", children: "How" })] }) }), _jsx("tbody", { children: strains.map(s => {
                                const m = strainOf(s);
                                return _jsxs("tr", { children: [_jsx("td", { children: s }), _jsx("td", { children: _jsxs(Select, { value: m ? String(m.id) : '', disabled: !c.isAdmin || !metrcStrains.length, onChange: e => setStrain(s, e.target.value), children: [_jsx("option", { value: "", children: metrcStrains.length ? 'No match' : 'Pull first' }), metrcStrains.map(x => _jsx("option", { value: String(x.id), children: x.name }, x.id))] }) }), _jsx("td", { className: `small hide-s ${m ? 'muted' : 'neg'}`, children: m?.how ?? 'none' })] }, s);
                            }) })] }) }), _jsxs("h3", { children: ["Plant batches in METRC (", lic, ")"] }), _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "ct", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Batch" }), _jsx("th", { children: "Strain" }), _jsx("th", { children: "Location" }), _jsx("th", { children: "Immature" }), _jsx("th", { className: "hide-s", children: "Planted" })] }) }), _jsxs("tbody", { children: [d.batches.filter(b => b.license === lic).slice(0, 300).map(b => _jsxs("tr", { children: [_jsx("td", { className: "mono small", children: b.name }), _jsx("td", { children: b.strain }), _jsx("td", { children: b.location }), _jsx("td", { children: n0(b.untracked) }), _jsx("td", { className: "muted small hide-s", children: b.planted_on ?? '' })] }, b.id)), !d.batches.some(b => b.license === lic) && _jsx("tr", { children: _jsx("td", { colSpan: 5, className: "muted", children: "None (or not pulled yet)" }) })] })] }) }), d.counts.some(x => x.license === lic) && _jsxs(_Fragment, { children: [_jsxs("h3", { children: ["Tagged plants in METRC (", lic, ")"] }), _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "ct", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Phase" }), _jsx("th", { children: "Location" }), _jsx("th", { children: "Strain" }), _jsx("th", { children: "Plants" }), _jsx("th", { className: "hide-s", children: "Planted" })] }) }), _jsx("tbody", { children: d.counts.filter(x => x.license === lic).sort((a, b) => a.phase.localeCompare(b.phase) || String(a.location).localeCompare(String(b.location))).map(x => _jsxs("tr", { children: [_jsx("td", { children: x.phase }), _jsx("td", { children: x.location }), _jsx("td", { children: x.strain }), _jsx("td", { children: n0(x.plants) }), _jsxs("td", { className: "muted small hide-s", children: [x.oldest ?? '', x.newest && x.newest !== x.oldest ? ` to ${x.newest}` : ''] })] }, `${x.phase}${x.location_id}${x.strain}`)) })] }) })] })] });
}
