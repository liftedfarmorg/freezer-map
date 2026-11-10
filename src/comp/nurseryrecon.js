import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { errText } from '../cult/ui';
import { download, toCsv } from './csv';
import { today } from './files';
// Compliance > METRC > Reconcile > Nursery (1PN): clone packages against cutting batches, mother lots against METRC plant batches.
const n0 = (x) => (x == null ? '' : Math.round(Number(x)).toLocaleString());
const GROUPS = [
    ['clones', 'count', 'Clone packages: count is off', 'METRC count vs. what the batch should still have (cuttings, less lost, delivered and planted as mothers).'],
    ['clones', 'not_in_metrc', 'Clone packages: not active in METRC', 'The batch still has plants in the app, but its package isn\'t active in METRC.'],
    ['clones', 'no_tag', 'Cutting batches with no package tag', 'Plants left in the app, no clone package tag to match.'],
    ['clones', 'not_in_app', 'In METRC, not on any cutting batch', 'Clone or seed packages in METRC that no batch in the app carries.'],
    ['mothers', 'count', 'Mother lots: count is off', 'Plants alive in the app vs. the METRC plant batch.'],
    ['mothers', 'not_in_metrc', 'Mother lots: not in METRC', 'Active lot in the app with a tag no active METRC plant batch has.'],
    ['mothers', 'no_tag', 'Mother lots with no plant tag', ''],
    ['mothers', 'closed_in_app', 'Mother lots closed in the app, active in METRC', ''],
    ['mothers', 'not_in_app', 'In METRC, no mother lot in the app', 'Immature plant batches on the nursery license that no lot in the app carries.'],
];
export function NurseryReconcile({ c }) {
    const [rows, setRows] = useState(null);
    const [busy, setBusy] = useState(null);
    const [err, setErr] = useState(null);
    const [open, setOpen] = useState(new Set(['clones:count', 'mothers:count']));
    const load = async () => { try {
        setRows(await c.api.reconcileNursery());
        setErr(null);
    }
    catch (e) {
        setErr(errText(e));
        setRows(null);
    } };
    useEffect(() => { load(); }, []);
    async function pull() {
        setBusy('Pulling 1PN from METRC…');
        try {
            const lic = (await c.api.syncStatus()).filter(s => s.site === '1PN').map(s => s.license);
            for (let i = 0; i < 8; i++) {
                const r = await c.api.pullMetrc(lic.length ? lic : undefined);
                const bad = r.results.find(x => x.error);
                if (bad) {
                    c.flash(`${bad.license}: ${bad.error}`, true);
                    break;
                }
                if (r.done) {
                    c.flash('1PN pulled from METRC');
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
    const csv = () => download(`Nursery METRC mismatches ${today()}.csv`, toCsv(['What', 'Issue', 'Tag', 'Strain', 'Batch / room', 'App', 'METRC', 'METRC item', 'METRC location', 'Note'], (rows ?? []).map(r => [r.kind, GROUPS.find(g => g[0] === r.kind && g[1] === r.issue)?.[2] ?? r.issue, r.tag, r.strain, r.name, r.app_n, r.metrc_n, r.metrc_item, r.metrc_location, r.note])));
    return _jsxs("div", { className: "list", children: [_jsx("p", { className: "muted", children: "1PN in METRC (from the last pull) against the Nursery module: each clone package against the cutting batch that carries its tag, and each mother lot against its METRC plant batch." }), _jsxs("div", { className: "row wrap toolbar", children: [_jsx("button", { className: "ghost small", disabled: !!busy, onClick: pull, children: busy ?? 'Pull 1PN from METRC' }), _jsx("button", { className: "ghost small", disabled: !rows?.length, onClick: csv, children: "Export CSV" }), rows && _jsx("span", { className: "muted small", children: rows.length ? `${rows.length} to look at` : 'Everything matches' })] }), err && _jsx("p", { className: "neg small", children: err }), _jsx("div", {}), !rows && !err && _jsx("p", { className: "muted", children: "Loading\u2026" }), GROUPS.map(([k, i, label, help]) => {
                const rs = (rows ?? []).filter(r => r.kind === k && r.issue === i);
                if (!rs.length)
                    return null;
                const key = `${k}:${i}`, on = open.has(key);
                return _jsxs("div", { className: "card", style: { marginBottom: 8 }, children: [_jsxs("button", { className: "linkbtn", onClick: () => setOpen(s => { const n = new Set(s); if (on)
                                n.delete(key);
                            else
                                n.add(key); return n; }), children: [on ? '▾' : '▸', " ", label, " (", rs.length, ")"] }), on && _jsxs(_Fragment, { children: [help && _jsx("p", { className: "muted small", children: help }), _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "ct", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Tag" }), _jsx("th", { children: "Strain" }), _jsx("th", { className: "hide-s", children: k === 'clones' ? 'Batch' : 'Room' }), _jsx("th", { children: "App" }), _jsx("th", { children: "METRC" }), _jsx("th", { className: "hide-s", children: "Note" })] }) }), _jsx("tbody", { children: rs.map((r, j) => _jsxs("tr", { children: [_jsx("td", { className: "mono small", children: r.tag ?? '' }), _jsx("td", { children: r.strain ?? r.metrc_item ?? '' }), _jsx("td", { className: "hide-s", children: r.name ?? r.metrc_location ?? '' }), _jsx("td", { children: n0(r.app_n) }), _jsx("td", { children: n0(r.metrc_n) }), _jsx("td", { className: "muted small hide-s", children: r.note ?? '' })] }, j)) })] }) })] })] }, key);
            })] });
}
