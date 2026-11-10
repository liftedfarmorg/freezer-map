import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { errText } from '../cult/ui';
import { download, toCsv } from './csv';
import { today } from './files';
// Compliance > METRC > Reconcile > Farm plants (OHR, GVR): per strain, plants the app says are standing (planted less harvested)
// next to METRC (immature in plant batches + flowering, counted by strain), and harvested plants in each; then each harvest.
const n0 = (x) => (x == null ? '' : Math.round(Number(x)).toLocaleString());
const sgn = (x) => (x > 0 ? `+${n0(x)}` : n0(x));
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never');
const PLANT_ISSUES = [
    ['harvest_behind', 'Harvested in the app, still standing in METRC', 'Plants the app has harvested that METRC still shows immature or flowering: harvests not entered in METRC yet.'],
    ['not_flipped', 'Not flipped to flowering in METRC', 'METRC still has these as immature plant batches.'],
    ['not_in_metrc', 'Planted in the app, nothing in METRC', 'No plant batch, flowering plant or harvest of this strain on the license.'],
    ['short', 'METRC has fewer plants', 'Planted, harvested and standing in METRC add up to less than the app planted.'],
    ['over', 'METRC has more plants', 'Standing plants in METRC are more than the app expects.'],
    ['harvest_count', 'Harvested plant counts differ', 'Standing plants match; the number harvested differs.'],
    ['not_in_app', 'In METRC, no planting in the app', 'Strains METRC has on the license that no planting this season carries.'],
    ['not_counted', 'Flowering not counted yet', 'Hit Count plants now.'],
    ['ok', 'Matches', 'Within 1% (or 5 plants).'],
];
const HARVEST_ISSUES = [
    ['not_in_metrc', 'App harvests not found in METRC'], ['no_name', 'App harvests with no METRC harvest name'], ['plants', 'Plant counts differ'],
    ['weight', 'Wet weight differs'], ['open', 'Still open in METRC (weight not packaged)'], ['not_in_app', 'METRC harvests not in the app'], ['ok', 'Matches'],
];
export function FarmReconcile({ c }) {
    const [lics, setLics] = useState([]);
    const [lic, setLic] = useState(null);
    const [plants, setPlants] = useState(null);
    const [harv, setHarv] = useState(null);
    const [busy, setBusy] = useState(null);
    const [err, setErr] = useState(null);
    const [open, setOpen] = useState(new Set(['p:harvest_behind', 'p:not_flipped', 'p:not_in_metrc', 'h:not_in_metrc']));
    useEffect(() => {
        c.api.farmLicenses().then(farms => { setLics(farms); setLic(l => l ?? farms[0]?.license ?? null); }).catch(e => setErr(errText(e)));
    }, []);
    const load = async (l) => {
        setPlants(null);
        setHarv(null);
        try {
            const [p, h] = await Promise.all([c.api.reconcilePlants(l), c.api.reconcileFarmHarvests(l)]);
            setPlants(p);
            setHarv(h);
            setErr(null);
        }
        catch (e) {
            setErr(errText(e));
        }
    };
    useEffect(() => { if (lic)
        load(lic); }, [lic]);
    async function count() {
        if (!lic)
            return;
        setBusy('Counting plants in METRC (a few minutes for big licenses)…');
        try {
            const r = await c.api.countPlants(lic);
            const x = r.results[0];
            if (x?.error)
                c.flash(`${lic}: ${x.error}`, true);
            else
                c.flash(`${lic}: ${n0(x?.plants)} plants counted${x?.complete ? '' : ' (ran out of time: count again for the rest)'}${x?.notes?.length ? `. ${x.notes.join('; ')}` : ''}`);
            await load(lic);
        }
        catch (e) {
            c.flash(errText(e), true);
        }
        finally {
            setBusy(null);
        }
    }
    const tot = useMemo(() => {
        const ps = plants ?? [];
        const s = (f) => ps.reduce((a, r) => a + (f(r) || 0), 0);
        return { planted: s(r => r.planted), ah: s(r => r.app_harvested), al: s(r => r.app_live), mi: s(r => r.metrc_immature), mf: s(r => r.metrc_flowering ?? 0), mh: s(r => r.metrc_harvested),
            counted: ps.map(r => r.metrc_counted).filter(Boolean).sort().pop() ?? null };
    }, [plants]);
    const toggle = (k) => setOpen(s => { const n = new Set(s); if (n.has(k))
        n.delete(k);
    else
        n.add(k); return n; });
    const csv = () => download(`Farm plants ${lic} ${today()}.csv`, toCsv(['Issue', 'Strain', 'METRC strain', 'App fields', 'METRC locations', 'Plantings', 'Planted', 'Harvested (app)', 'Standing (app)', 'Immature (METRC)', 'Flowering (METRC)', 'Standing (METRC)', 'Harvested (METRC)', 'Difference', 'Note'], (plants ?? []).map(r => [PLANT_ISSUES.find(i => i[0] === r.issue)?.[1] ?? r.issue, r.strain, r.metrc_strain, r.fields, r.metrc_locations, r.plantings, r.planted, r.app_harvested, r.app_live,
        r.metrc_immature, r.metrc_flowering, r.metrc_live, r.metrc_harvested, r.diff, r.note])));
    return _jsxs("div", { className: "list", children: [_jsx("p", { className: "muted", children: "Farm plants this season: what the app says is standing in the field (planted, less harvested) against METRC (immature plant batches plus flowering plants, counted by strain), and harvested plants on both sides. Then each harvest against its METRC harvest." }), _jsxs("div", { className: "row wrap toolbar", children: [_jsx("div", { className: "chips", children: lics.map(l => _jsxs("button", { className: lic === l.license ? 'on' : '', onClick: () => setLic(l.license), children: [l.site, " ", l.license] }, l.license)) }), _jsx("button", { className: "ghost small", disabled: !!busy || !lic, onClick: count, children: busy ?? 'Count plants now' }), _jsx("button", { className: "ghost small", disabled: !plants?.length, onClick: csv, children: "Export CSV" }), _jsxs("span", { className: "muted small", children: ["Flowering counted ", when(tot.counted)] })] }), err && _jsx("p", { className: "neg small", children: err }), !plants && !err && _jsx("p", { className: "muted", children: "Loading\u2026" }), plants && _jsxs("div", { className: "farm-tiles", children: [_jsxs("div", { className: "card", children: [_jsx("div", { className: "muted small", children: "Planted (app)" }), _jsx("b", { children: n0(tot.planted) })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "muted small", children: "Standing: app / METRC" }), _jsxs("b", { children: [n0(tot.al), " / ", n0(tot.mi + tot.mf)] }), _jsxs("div", { className: "muted small", children: ["METRC ", n0(tot.mi), " immature, ", n0(tot.mf), " flowering"] })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "muted small", children: "Harvested: app / METRC" }), _jsxs("b", { children: [n0(tot.ah), " / ", n0(tot.mh)] })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "muted small", children: "Strains to look at" }), _jsx("b", { children: (plants ?? []).filter(r => r.issue !== 'ok').length }), _jsxs("div", { className: "muted small", children: ["of ", plants.length] })] })] }), PLANT_ISSUES.map(([i, label, help]) => {
                const rs = (plants ?? []).filter(r => r.issue === i);
                if (!rs.length)
                    return null;
                const key = `p:${i}`, on = open.has(key);
                return _jsxs("div", { className: "card", style: { marginBottom: 8 }, children: [_jsxs("button", { className: "linkbtn", onClick: () => toggle(key), children: [on ? '▾' : '▸', " ", label, " (", rs.length, ")"] }), on && _jsxs(_Fragment, { children: [_jsx("p", { className: "muted small", children: help }), _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "ct", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Strain" }), _jsx("th", { className: "hide-s", children: "Fields (app) / locations (METRC)" }), _jsx("th", { children: "Planted" }), _jsx("th", { children: "Harvested app / METRC" }), _jsx("th", { children: "Standing app" }), _jsx("th", { children: "METRC immature + flowering" }), _jsx("th", { children: "Diff" }), _jsx("th", { className: "hide-s", children: "Note" })] }) }), _jsx("tbody", { children: rs.map((r, j) => _jsxs("tr", { children: [_jsxs("td", { children: [r.strain, r.metrc_strain && r.metrc_strain.toLowerCase() !== r.strain.toLowerCase() ? _jsxs("div", { className: "muted small", children: ["METRC: ", r.metrc_strain] }) : null] }), _jsxs("td", { className: "hide-s small", children: [r.fields ?? '', r.metrc_locations ? _jsx("div", { className: "muted", children: r.metrc_locations }) : null] }), _jsx("td", { children: n0(r.planted) }), _jsxs("td", { children: [n0(r.app_harvested), " / ", n0(r.metrc_harvested)] }), _jsx("td", { children: n0(r.app_live) }), _jsxs("td", { children: [n0(r.metrc_immature), " + ", r.metrc_flowering == null ? '?' : n0(r.metrc_flowering)] }), _jsx("td", { className: r.diff ? 'neg' : '', children: sgn(r.diff) }), _jsx("td", { className: "muted small hide-s", children: r.note ?? '' })] }, j)) })] }) })] })] }, key);
            }), _jsx("h3", { style: { margin: '14px 0 6px' }, children: "Harvests" }), HARVEST_ISSUES.map(([i, label]) => {
                const rs = (harv ?? []).filter(r => r.issue === i);
                if (!rs.length)
                    return null;
                const key = `h:${i}`, on = open.has(key);
                return _jsxs("div", { className: "card", style: { marginBottom: 8 }, children: [_jsxs("button", { className: "linkbtn", onClick: () => toggle(key), children: [on ? '▾' : '▸', " ", label, " (", rs.length, ")"] }), on && _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "ct", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Harvest" }), _jsx("th", { children: "Strain" }), _jsx("th", { className: "hide-s", children: "Date" }), _jsx("th", { children: "Plants app / METRC" }), _jsx("th", { children: "Wet lb app / METRC" }), _jsx("th", { className: "hide-s", children: "Left in METRC" }), _jsx("th", { className: "hide-s", children: "Note" })] }) }), _jsx("tbody", { children: rs.map((r, j) => _jsxs("tr", { children: [_jsx("td", { className: "small", children: r.name ?? '(no name)' }), _jsxs("td", { children: [r.strain ?? '', r.field ? _jsx("div", { className: "muted small", children: r.field }) : null] }), _jsx("td", { className: "hide-s small", children: r.harvested_on ?? '' }), _jsxs("td", { children: [n0(r.app_plants), " / ", n0(r.metrc_plants)] }), _jsxs("td", { children: [n0(r.app_wet), " / ", n0(r.metrc_wet)] }), _jsx("td", { className: "hide-s", children: r.metrc_finished ? 'finished' : n0(r.metrc_left) }), _jsx("td", { className: "muted small hide-s", children: r.note ?? '' })] }, j)) })] }) })] }, key);
            })] });
}
