import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { MTag } from '../mtag';
import { useEffect, useMemo, useState } from 'react';
import { Sheet, errText } from '../cult/ui';
import { DropZone } from './files';
import { readTable } from './csv';
import { ISSUE_LABEL, ISSUE_ORDER, isPlant, reconExcel, reconPdf, shows } from './reconexport';
// Compliance > METRC > Reconcile (live): METRC pulled through T3 every night and on demand, compared with every package in the app.
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never');
const n2 = (x) => (x == null ? '' : (Math.round(Number(x) * 100) / 100).toLocaleString());
const HELP = {
    weight: 'METRC and the app have different weights. "What METRC shows" lists the packages METRC made from it and where they went.',
    not_in_metrc: 'In a freezer in the app, but not active in METRC under this license: shipped, transferred, combined or finished there.',
    not_in_app: 'Active in METRC, no package in the app has this tag. New harvest packages entered in METRC show up here.',
    closed_in_app: 'Shipped, used up or combined in the app, still active in METRC.',
};
export function LiveReconcile({ c }) {
    const [st, setSt] = useState([]);
    const [lic, setLic] = useState(null);
    const [rows, setRows] = useState({});
    const [busy, setBusy] = useState(null);
    const [open, setOpen] = useState(new Set(['weight', 'not_in_metrc']));
    // 1PN is nursery plant packages, not pallets: it has its own tab (Reconcile > Nursery)
    const loadSt = async () => { try {
        const s = (await c.api.syncStatus()).filter(x => x.site !== '1PN');
        setSt(s);
        setLic(l => l ?? s.find(x => x.active > 0)?.license ?? s[0]?.license ?? null);
        return s;
    }
    catch (e) {
        c.flash(errText(e), true);
        return [];
    } };
    const loadRows = async (l) => { try {
        const r = await c.api.reconcileLive(l);
        setRows(m => ({ ...m, [l]: r }));
        return r;
    }
    catch (e) {
        c.flash(errText(e), true);
        return [];
    } };
    useEffect(() => { loadSt(); }, []);
    useEffect(() => { if (lic && !rows[lic])
        loadRows(lic); }, [lic]);
    async function pull() {
        setBusy('Pulling from METRC…');
        try {
            let closed = 0;
            for (let i = 0; i < 12; i++) { // big first pull: the server stops at ~4 minutes and carries on next call
                const r = await c.api.pullMetrc();
                closed += r.closed ?? 0;
                const left = r.results.filter(x => !x.complete);
                const bad = r.results.find(x => x.error);
                if (bad) {
                    c.flash(`${bad.license}: ${bad.error}`, true);
                    break;
                }
                if (r.done) {
                    c.flash(`METRC pulled for ${r.results.length} license${r.results.length === 1 ? '' : 's'}${closed ? `. ${closed} to-dos were already done in METRC and are closed.` : ''}`);
                    break;
                }
                setBusy(`Still pulling (${left.map(x => x.license).join(', ')})… pass ${i + 2}`);
            }
            await loadSt();
            setRows({});
            if (lic)
                await loadRows(lic);
            await c.reload();
        }
        catch (e) {
            c.flash(errText(e), true);
        }
        finally {
            setBusy(null);
        }
    }
    async function allRows() {
        const out = [];
        for (const s of st.filter(x => x.active > 0 || x.last_pull)) {
            const r = rows[s.license] ?? await loadRows(s.license);
            out.push(...r.filter(x => !isPlant(x)).map(x => ({ ...x, license: s.license, site: s.site })));
        }
        return out;
    }
    const pulledAt = st.map(s => s.last_pull).filter(Boolean).sort()[0] ?? null;
    const fname = `METRC mismatches ${new Date().toISOString().slice(0, 10)}`;
    async function excel() { setBusy('Building Excel…'); try {
        await reconExcel(await allRows(), fname);
    }
    catch (e) {
        c.flash(errText(e), true);
    }
    finally {
        setBusy(null);
    } }
    async function pdf() { setBusy('Building PDF…'); try {
        await reconPdf(await allRows(), { name: fname, who: c.me ?? '', pulled: when(pulledAt) });
    }
    catch (e) {
        c.flash(errText(e), true);
    }
    finally {
        setBusy(null);
    } }
    const cur = lic ? rows[lic] : null;
    const by = useMemo(() => { const m = new Map(); for (const r of cur ?? [])
        if (!isPlant(r))
            m.set(r.issue, [...(m.get(r.issue) ?? []), r]); return m; }, [cur]);
    const plants = (cur ?? []).filter(isPlant);
    const [plan, setPlan] = useState(null);
    async function readBack(fs) {
        const f = fs[0];
        setBusy('Reading the sheet…');
        try {
            const t = await readTable(f);
            const h = (t[0] ?? []).map(x => x.trim().toLowerCase());
            const ki = h.indexOf('key'), ai = h.indexOf('action'), ri = h.indexOf('reason');
            if (ki < 0 || ai < 0) {
                c.flash('That sheet has no Key / Action columns. Use the Excel exported from here.', true);
                return;
            }
            const rows = t.slice(1).map(r => ({ key: (r[ki] ?? '').trim(), action: (r[ai] ?? '').trim(), reason: ri >= 0 ? (r[ri] ?? '').trim() : '' })).filter(r => r.key && r.action);
            if (!rows.length) {
                c.flash('No rows have an Action filled in', true);
                return;
            }
            const res = await c.api.reconApply(rows, true);
            setPlan({ file: f.name, rows, res });
        }
        catch (e) {
            c.flash(errText(e), true);
        }
        finally {
            setBusy(null);
        }
    }
    async function apply() {
        if (!plan)
            return;
        setBusy('Applying…');
        try {
            const r = await c.api.reconApply(plan.rows, false);
            c.flash(`${r.done} applied${r.skipped ? `, ${r.skipped} skipped` : ''}`, r.skipped > 0);
            setPlan(null);
            setRows({});
            if (lic)
                await loadRows(lic);
            await c.reload();
        }
        catch (e) {
            c.flash(errText(e), true);
        }
        finally {
            setBusy(null);
        }
    }
    const toggle = (k) => setOpen(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
    return _jsxs(_Fragment, { children: [_jsx("p", { className: "muted", children: "METRC is pulled through T3 every night (and when you tap Pull), then compared with every package in the app. Each gap says what METRC did with the package: split, shipped on which manifest, finished. Export to Excel, fill in Action and Reason, and drop it back here to fix the app in bulk." }), _jsx("p", { className: "muted small", children: "1PN (nursery) has its own report: Nursery (1PN) above." }), _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "ct", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "License" }), _jsx("th", { className: "num", children: "Active in METRC" }), _jsx("th", { children: "Last full pull" }), _jsx("th", { children: "Last try" }), _jsx("th", { className: "num", children: "METRC items" }), _jsx("th", {})] }) }), _jsx("tbody", { children: st.map(s => _jsxs("tr", { className: `tap ${lic === s.license ? 'sel' : ''}`, onClick: () => setLic(s.license), children: [_jsxs("td", { children: [_jsx("b", { children: s.site }), " ", _jsx("span", { className: "mono small", children: s.license })] }), _jsx("td", { className: "num", children: s.active.toLocaleString() }), _jsx("td", { className: "small", children: s.last_pull ? when(s.last_pull) : _jsx("span", { className: "neg", children: "never" }) }), _jsxs("td", { className: "small", children: [s.last_try ? _jsxs(_Fragment, { children: [when(s.last_try), " ", s.complete ? _jsx("span", { className: "pill cp-ok", children: "finished" }) : _jsx("span", { className: "pill cp-bad", children: "didn't finish" })] }) : _jsx("span", { className: "muted", children: "none" }), s.error && _jsx("div", { className: "neg small", children: s.error }), !s.complete && s.last_try_note && _jsx("div", { className: "muted small", children: s.last_try_note })] }), _jsxs("td", { className: "num small", children: [s.items != null ? s.items.toLocaleString() : '', s.items_at && _jsx("div", { className: "muted small", children: when(s.items_at) })] }), _jsx("td", { children: lic === s.license && _jsx("span", { className: "pill cp-ok", children: "showing" }) })] }, s.license)) })] }) }), _jsxs("div", { className: "row wrap toolbar", style: { marginTop: 8 }, children: [c.canEdit && _jsx("button", { className: "primary", disabled: !!busy, onClick: pull, children: busy?.startsWith('Pull') || busy?.startsWith('Still') ? busy : 'Pull from METRC now' }), _jsx("button", { className: "ghost", disabled: !!busy || !st.some(s => s.last_pull), onClick: excel, children: "Excel (all licenses)" }), _jsx("button", { className: "ghost", disabled: !!busy || !st.some(s => s.last_pull), onClick: pdf, children: "PDF (all licenses)" }), busy && !busy.startsWith('Pull') && !busy.startsWith('Still') && _jsx("span", { className: "muted small", children: busy })] }), c.canEdit && st.some(s => s.last_pull) && _jsx("div", { style: { marginTop: 10 }, children: _jsx(DropZone, { onFiles: readBack, accept: ".xlsx", label: "Drop the filled-in mismatch Excel to apply it" }) }), plan && _jsxs(Sheet, { title: `Apply ${plan.file}`, onClose: () => setPlan(null), children: [_jsxs("p", { className: "muted", children: ["Nothing has changed yet. ", _jsx("b", { children: plan.res.done }), " row", plan.res.done === 1 ? '' : 's', " will be applied", plan.res.skipped ? _jsxs(_Fragment, { children: [", ", _jsx("b", { children: plan.res.skipped }), " skipped (reasons below)"] }) : '', ". \"Use METRC\" changes the app only; it never sends anything to METRC. \"Keep app\" weight and finish rows become METRC to-dos."] }), _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "ct", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Issue" }), _jsx("th", { children: "Action" }), _jsx("th", { children: "What happens" })] }) }), _jsx("tbody", { children: plan.res.rows.map((r, i) => _jsxs("tr", { children: [_jsx("td", { className: "small", children: ISSUE_LABEL[r.issue] ?? r.issue }), _jsx("td", { className: "small", children: r.action }), _jsx("td", { className: `small ${r.ok ? '' : 'neg'}`, children: r.msg })] }, i)) })] }) }), _jsxs("div", { className: "row", style: { marginTop: 10 }, children: [_jsx("button", { className: "primary", disabled: !!busy || !plan.res.done, onClick: apply, children: busy === 'Applying…' ? busy : `Apply ${plan.res.done}` }), _jsx("button", { className: "ghost", onClick: () => setPlan(null), children: "Cancel" })] })] }), lic && (cur == null ? _jsx("p", { className: "muted", children: "Comparing\u2026" }) : !st.find(s => s.license === lic)?.last_pull ? _jsx("p", { className: "muted", children: "Not pulled yet. Tap Pull from METRC now." })
                : !cur.length ? _jsxs("div", { className: "infobox", style: { marginTop: 10 }, children: ["Everything matches for ", lic, "."] })
                    : ISSUE_ORDER.filter(k => by.get(k)?.length).map(k => _jsxs("div", { className: "dueg", children: [_jsxs("h3", { className: "tap", onClick: () => toggle(k), children: [open.has(k) ? '▾' : '▸', " ", ISSUE_LABEL[k], " ", _jsx("span", { className: "muted", children: by.get(k).length })] }), open.has(k) && _jsxs(_Fragment, { children: [HELP[k] && _jsx("p", { className: "muted small", children: HELP[k] }), _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "ct", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Package" }), _jsx("th", { className: "hide-s", children: "Tag" }), _jsx("th", { className: "hide-s", children: "Strain / item" }), _jsx("th", { className: "num", children: "App" }), _jsx("th", { className: "num", children: "METRC" }), _jsx("th", { className: "hide-s", children: "App spot" }), _jsx("th", { children: "What METRC shows" })] }) }), _jsx("tbody", { children: by.get(k).map((r, i) => _jsxs("tr", { children: [_jsx("td", { children: r.code ?? '' }), _jsx("td", { className: "small hide-s", children: _jsx(MTag, { t: r.tag, n: 8 }) }), _jsx("td", { className: "small hide-s", children: r.strain ?? r.metrc_item ?? '' }), _jsx("td", { className: "num", children: n2(r.app_lbs) }), _jsx("td", { className: "num", children: n2(r.metrc_lbs) }), _jsx("td", { className: "small hide-s", children: r.app_spot ?? '' }), _jsxs("td", { className: "small", children: [shows(r), r.note && _jsx("div", { className: "muted", children: r.note }), r.metrc_location && _jsxs("div", { className: "muted", children: ["METRC: ", r.metrc_location, r.metrc_changed ? `, changed ${when(r.metrc_changed)}` : ''] })] })] }, `${r.tag}-${r.pallet_id}-${i}`)) })] }) })] })] }, k))), plants.length > 0 && _jsxs("div", { className: "dueg", children: [_jsxs("h3", { className: "tap", onClick: () => toggle('plants'), children: [open.has('plants') ? '▾' : '▸', " Plant packages in METRC (clones, seeds) ", _jsx("span", { className: "muted", children: plants.length })] }), open.has('plants') && _jsxs(_Fragment, { children: [_jsx("p", { className: "muted small", children: "The app doesn't track clones and seeds as pallets yet (Phase 2, nursery). Left out of the counts and the Excel / PDF." }), _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "ct", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Tag" }), _jsx("th", { children: "Item" }), _jsx("th", { className: "num", children: "Qty" }), _jsx("th", { children: "Location" })] }) }), _jsx("tbody", { children: plants.slice(0, 300).map((r, i) => _jsxs("tr", { children: [_jsx("td", { className: "small", children: _jsx(MTag, { t: r.tag, n: 8 }) }), _jsx("td", { className: "small", children: r.metrc_item }), _jsx("td", { className: "num", children: n2(r.metrc_lbs) }), _jsx("td", { className: "small", children: r.metrc_location ?? '' })] }, i)) })] }) })] })] })] });
}
