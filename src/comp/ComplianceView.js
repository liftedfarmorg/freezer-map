import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import '../cult/cult.css';
import './comp.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { scrollTop } from '../nav';
import { CompApi } from './api';
import { T3Settings } from './t3';
import { UsageWarning } from './usage';
import { Card, Cards, DashHead, Empty, Tile, Tiles } from '../dash';
import { F, NumIn, SaveBar, Sheet, TextIn, errText } from '../cult/ui';
import { ModulePeople } from '../users';
import { Fold } from '../fold';
import { Library } from './library';
import { Deadlines, dueText, dueTone } from './deadlines';
import { Ccof } from './ccof';
import { Metrc } from './metrc';
import { fmtD } from './files';
import { CompFleet, FleetCard } from '../fleet/Fleet';
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const ago = (iso) => (iso ? Math.round((Date.now() - new Date(iso).getTime()) / 86400000) : null);
export default function ComplianceView({ backend, flash, tab, go, isAdmin, canEdit, me }) {
    const sb = useMemo(() => backend.client(), [backend]);
    const api = useMemo(() => (sb ? new CompApi(sb) : null), [sb]);
    const [ov, setOv] = useState(null);
    const [types, setTypes] = useState([]);
    const [err, setErr] = useState(null);
    const [sub, setSub] = useState(null);
    const load = useCallback(async () => {
        if (!api)
            return;
        try {
            const [o, t] = await Promise.all([api.overview(), api.docTypes()]);
            setOv(o);
            setTypes(t);
            setErr(null);
        }
        catch (e) {
            setErr(errText(e));
        }
    }, [api]);
    useEffect(() => { load(); }, [load]);
    useEffect(() => { setSub(null); }, [tab]);
    if (!api)
        return _jsxs("div", { className: "list", children: [_jsx("h2", { children: "Compliance" }), _jsx("p", { className: "muted", children: "Compliance needs the database (not available in the demo)." })] });
    if (err)
        return _jsxs("div", { className: "list", children: [_jsx("h2", { children: "Compliance" }), _jsxs("div", { className: "warnbox", children: ["Couldn't load Compliance. If this is the first time, run 055_compliance.sql in Supabase. (", err, ")"] })] });
    if (!ov)
        return _jsxs("div", { className: "list", children: [_jsx("h2", { children: "Compliance" }), _jsx("p", { className: "muted", children: "Loading\u2026" })] });
    const c = {
        api, flash, canEdit, isAdmin, types, ov, me, reload: load, sub,
        go: (t, s) => { if (t !== tab)
            go(t); setSub(s ?? null); scrollTop(); },
        typeLabel: k => types.find(t => t.key === k)?.label ?? k ?? '',
    };
    return (_jsxs("div", { className: "comp", children: [tab === 'dashboard' && _jsx(Dashboard, { c: c }), tab === 'deadlines' && _jsx(Deadlines, { c: c }), tab === 'library' && _jsx(Library, { c: c }), tab === 'ccof' && _jsx(Ccof, { c: c }), tab === 'metrc' && _jsx(Metrc, { c: c }), tab === 'fleet' && _jsx(CompFleet, { sb: sb, flash: flash }), tab === 'review' && _jsx(Review, { c: c }), tab === 'settings' && (isAdmin ? _jsx(SettingsTab, { c: c }) : _jsxs("div", { className: "list", children: [_jsx("h2", { children: "Settings" }), _jsx("p", { className: "muted", children: "Only Compliance Admins can change Compliance settings." })] }))] }));
}
// ---------- Dashboard ----------
function Dashboard({ c }) {
    const { ov } = c;
    const [dl, setDl] = useState(null);
    useEffect(() => { c.api.deadlines().then(setDl).catch(() => setDl([])); }, []);
    const soon = (dl ?? []).filter(d => d.due_on && d.days_left <= Math.max(d.remind_days, 30)).slice(0, 8);
    const b = ov.backup;
    const backupTone = !ov.sp_site ? 'warn' : b?.error || (b?.failed ?? 0) > 0 ? 'bad' : b && (ago(b.started_at) ?? 9) <= 2 ? 'ok' : 'warn';
    return _jsxs("div", { className: "list", children: [_jsx(DashHead, { title: "Compliance", sub: "METRC, CCOF, licenses and the paper that proves it" }), _jsx(UsageWarning, { c: c }), _jsxs(Tiles, { children: [_jsx(Tile, { value: ov.overdue, label: "Late", sub: "deadlines past due", tone: ov.overdue ? 'bad' : 'ok', onClick: () => c.go('deadlines') }), _jsx(Tile, { value: ov.due_soon, label: "Due soon", sub: `${ov.due_30} in the next 30 days`, tone: ov.due_soon ? 'warn' : undefined, onClick: () => c.go('deadlines') }), _jsx(Tile, { value: ov.metrc_todo, label: "METRC to do", sub: ov.metrc_error ? `${ov.metrc_error} with a problem` : 'app actions to enter in METRC', tone: ov.metrc_error ? 'warn' : ov.metrc_todo ? 'heads' : 'ok', onClick: () => c.go('metrc', 'todo') }), _jsx(Tile, { value: ov.errors_open, label: "METRC errors", sub: `${ov.playbook} fixes in the playbook`, tone: ov.errors_open ? 'warn' : undefined, onClick: () => c.go('metrc', 'errors') }), _jsx(Tile, { value: `${ov.materials_approved}/${ov.materials}`, label: "Materials approved", sub: ov.not_on_list ? `${ov.not_on_list} not on the CCOF list` : ov.materials_unreviewed ? `${ov.materials_unreviewed} not reviewed yet` : 'all on the CCOF list', tone: ov.materials_unreviewed ? 'warn' : 'ok', onClick: () => c.go('ccof', 'materials') }), _jsx(Tile, { value: ov.material_issues, label: "Log lines not approved", sub: "this year, certified sites", tone: ov.material_issues ? 'warn' : 'ok', onClick: () => c.go('review') }), _jsx(Tile, { value: ov.tests_no_file, label: "Test results, no file", sub: "Cultivation \u203A Testing", tone: ov.tests_no_file ? 'warn' : 'ok', onClick: () => c.go('review') }), _jsx(Tile, { value: ov.customers_missing, label: "Customer licenses", sub: "missing or expired", tone: ov.customers_missing ? 'warn' : 'ok', onClick: () => c.go('library', 'customers') }), _jsx(Tile, { value: ov.docs, label: "Documents", sub: ov.backup_waiting ? `${ov.backup_waiting} waiting for SharePoint` : 'all copied to SharePoint', onClick: () => c.go('library') }), _jsx(Tile, { value: !ov.sp_site ? 'Off' : b ? fmtD(b.started_at) : 'Never', label: "SharePoint backup", sub: !ov.sp_site ? 'not set up yet' : b?.error ?? (b ? `${b.copied} copied, ${b.failed} failed` : 'runs nightly'), tone: backupTone, onClick: c.isAdmin ? () => c.go('settings') : undefined })] }), _jsxs(Cards, { children: [_jsx(Card, { title: "Coming due", badge: soon.length, action: "Deadlines", onAction: () => c.go('deadlines'), children: dl == null ? _jsx("p", { className: "muted", children: "Loading\u2026" }) : !soon.length ? _jsx(Empty, { children: "Nothing due in the next 30 days." })
                            : _jsx("div", { className: "dlist", children: soon.map(d => _jsxs("div", { className: "drow", children: [_jsxs("span", { className: "grow", children: [d.title, _jsx("div", { className: "muted small", children: d.site ?? '' })] }), _jsxs("span", { className: "nowrap", children: [fmtD(d.due_on), " ", _jsx("span", { className: `pill ${dueTone(d)}`, children: dueText(d) })] })] }, d.kind + d.ref)) }) }), _jsxs(Card, { title: "METRC reconciliation", action: "Reconcile", onAction: () => c.go('metrc', 'reconcile'), children: [_jsx("div", { className: "dlist", children: ov.licenses.map(l => {
                                    const at = ov.last_recon[l];
                                    const d = ago(at);
                                    return _jsxs("div", { className: "drow", children: [_jsx("span", { className: "grow mono", children: l }), _jsx("span", { className: `pill ${d == null ? 'cp-warn' : d > 35 ? 'cp-warn' : 'cp-ok'}`, children: at ? `${fmtD(at)}` : 'never' })] }, l);
                                }) }), _jsx("p", { className: "muted small", children: "Upload each license's METRC Active Packages export at least monthly." })] }), _jsx(FleetCard, { sb: c.api.sb, go: () => c.go('fleet') }), _jsxs(Card, { title: "Library", action: "Open", onAction: () => c.go('library'), children: [_jsx("div", { className: "dlist", children: c.types.filter(t => (ov.docs_by_type[t.key] ?? 0) > 0).map(t => _jsxs("div", { className: "drow", children: [_jsx("span", { className: "grow", children: t.label }), _jsx("b", { children: ov.docs_by_type[t.key] })] }, t.key)) }), !ov.docs && _jsx(Empty, { children: "No documents yet. Open the Library and drop files in." })] })] })] });
}
// ---------- Review ----------
function Review({ c }) {
    const [dl, setDl] = useState(null);
    const [issues, setIssues] = useState([]);
    const [mats, setMats] = useState([]);
    const [tests, setTests] = useState([]);
    const [errs, setErrs] = useState([]);
    const [bad, setBad] = useState([]);
    useEffect(() => {
        c.api.deadlines().then(setDl).catch(() => setDl([]));
        c.api.issues().then(setIssues).catch(() => { });
        c.api.materials().then(setMats).catch(() => { });
        c.api.testsNoFile().then(setTests).catch(() => { });
        c.api.errors().then(e => setErrs(e.filter(x => x.status === 'open'))).catch(() => { });
        c.api.docs().then(ds => setBad(ds.filter(d => d.backup_error))).catch(() => { });
    }, []);
    const late = (dl ?? []).filter(d => d.due_on && d.days_left < 0);
    const noDate = (dl ?? []).filter(d => !d.due_on);
    // log lines grouped by product
    const byProd = new Map();
    for (const i of issues) {
        const k = `${i.module}|${i.product.toLowerCase()}`;
        const x = byProd.get(k);
        if (x) {
            x.n++;
            if (i.log_on > x.last)
                x.last = i.log_on;
        }
        else
            byProd.set(k, { product: i.product, module: i.module, issue: i.issue, n: 1, last: i.log_on, id: i.product_id });
    }
    const prods = [...byProd.values()].sort((a, b) => b.n - a.n);
    const noPaper = mats.filter(m => m.active && m.ccof_status === 'approved' && !m.listing);
    const stale = c.ov.licenses.filter(l => { const d = ago(c.ov.last_recon[l]); return d == null || d > 35; });
    const none = dl != null && !late.length && !noDate.length && !prods.length && !noPaper.length && !tests.length && !errs.length && !stale.length && !bad.length && !c.ov.customers_missing;
    return _jsxs("div", { className: "list", children: [_jsx("h2", { children: "Review" }), _jsx(UsageWarning, { c: c }), none && _jsx("p", { className: "muted", children: "Nothing to look at. Everything's current." }), late.length > 0 && _jsx(Fold, { id: "comp.late", open: true, title: "Late", count: late.length, right: _jsx("button", { className: "linkbtn", onClick: () => c.go('deadlines'), children: "Deadlines \u203A" }), children: _jsx("div", { className: "dlist", children: late.map(d => _jsxs("div", { className: "drow", children: [_jsx("span", { className: "grow", children: d.title }), _jsx("span", { className: `pill ${dueTone(d)}`, children: dueText(d) })] }, d.kind + d.ref)) }) }), prods.length > 0 && _jsxs(Fold, { id: "comp.prods", open: true, title: "Products used in logs without CCOF approval", count: prods.length, right: _jsx("button", { className: "linkbtn", onClick: () => c.go('ccof', 'materials'), children: "Materials \u203A" }), children: [_jsx("p", { className: "muted", children: "From this year's Feed and Spray logs. Approve the product (with its listing) or find out why it was used." }), _jsx("div", { className: "dlist", children: prods.map(p => _jsxs("div", { className: "drow", children: [_jsxs("span", { className: "grow", children: [_jsx("b", { children: p.product }), " ", _jsxs("span", { className: "muted", children: [p.module === 'nursery' ? 'Nursery' : 'Cultivation', " \u00B7 ", p.issue] })] }), _jsxs("span", { className: "muted small", children: [p.n, " line", p.n === 1 ? '' : 's', " \u00B7 last ", fmtD(p.last)] })] }, p.module + p.product)) })] }), tests.length > 0 && _jsxs(Fold, { id: "comp.tests", open: true, title: "Test results with no file", count: tests.length, children: [_jsx("p", { className: "muted", children: "Results are back but nobody attached the PDF. Cultivation \u203A Testing \u203A open the test \u203A drop the PDF." }), _jsx("div", { className: "dlist", children: tests.map(t => _jsxs("div", { className: "drow", children: [_jsxs("span", { className: "grow", children: [t.site, " ", t.ref, " ", _jsxs("span", { className: "muted", children: [t.kind === 'area' ? 'area composite' : 'strain test', t.lab ? ` · ${t.lab}` : ''] })] }), _jsxs("span", { className: "muted small", children: ["back ", fmtD(t.results_on), t.result ? ` · ${t.result}` : ''] })] }, t.id)) })] }), errs.length > 0 && _jsx(Fold, { id: "comp.errs", open: true, title: "Open METRC errors", count: errs.length, right: _jsx("button", { className: "linkbtn", onClick: () => c.go('metrc', 'errors'), children: "Errors \u203A" }), children: _jsx("div", { className: "dlist", children: errs.map(e => _jsxs("div", { className: "drow", children: [_jsx("span", { className: "grow", children: e.what }), _jsx("span", { className: "muted small", children: fmtD(e.happened_on) })] }, e.id)) }) }), stale.length > 0 && _jsx(Fold, { id: "comp.recon", title: "Licenses not reconciled in 35 days", count: stale.length, right: _jsx("button", { className: "linkbtn", onClick: () => c.go('metrc', 'reconcile'), children: "Reconcile \u203A" }), children: _jsx("div", { className: "dlist", children: stale.map(l => _jsxs("div", { className: "drow", children: [_jsx("span", { className: "grow mono", children: l }), _jsx("span", { className: "muted small", children: c.ov.last_recon[l] ? `last ${fmtD(c.ov.last_recon[l])}` : 'never' })] }, l)) }) }), c.ov.customers_missing > 0 && _jsx(Fold, { id: "comp.cust", title: "Customers with no license or an expired one", count: c.ov.customers_missing, right: _jsx("button", { className: "linkbtn", onClick: () => c.go('library', 'customers'), children: "Customer licenses \u203A" }), children: _jsx("p", { className: "muted", children: "Sales gets a warning when they start an order for these." }) }), noDate.length > 0 && _jsx(Fold, { id: "comp.nodate", title: "Deadlines and licenses with no date", count: noDate.length, right: _jsx("button", { className: "linkbtn", onClick: () => c.go('deadlines'), children: "Deadlines \u203A" }), children: _jsx("div", { className: "dlist", children: noDate.map(d => _jsx("div", { className: "drow", children: _jsx("span", { className: "grow", children: d.title }) }, d.kind + d.ref)) }) }), noPaper.length > 0 && _jsx(Fold, { id: "comp.nopaper", title: "Approved with no listing on file", count: noPaper.length, right: _jsx("button", { className: "linkbtn", onClick: () => c.go('ccof', 'materials'), children: "Materials \u203A" }), children: _jsx("div", { className: "dlist", children: noPaper.map(m => _jsx("div", { className: "drow", children: _jsxs("span", { className: "grow", children: [m.name, " ", _jsx("span", { className: "muted", children: m.manufacturer ?? '' })] }) }, m.id)) }) }), bad.length > 0 && _jsx(Fold, { id: "comp.bk", title: "Didn't copy to SharePoint", count: bad.length, children: _jsx("div", { className: "dlist", children: bad.map(d => _jsxs("div", { className: "drow", children: [_jsx("span", { className: "grow", children: d.title }), _jsx("span", { className: "small neg", children: d.backup_error })] }, d.id)) }) })] });
}
// ---------- Settings ----------
function SettingsTab({ c }) {
    const [ed, setEd] = useState(null);
    const [busy, setBusy] = useState(false);
    const [runs, setRuns] = useState([]);
    const [site, setSite] = useState(c.ov.sp_site ?? '');
    const [root, setRoot] = useState(c.ov.sp_root ?? 'Compliance Archive');
    const [tol, setTol] = useState(Number(c.ov.weight_tol ?? 1));
    const [stale, setStale] = useState(Number(c.ov.stale_days ?? 90));
    useEffect(() => { c.api.backupRuns().then(setRuns).catch(() => { }); }, []);
    const sb = c.api.sb;
    async function saveType() {
        setBusy(true);
        try {
            await c.api.saveDocType(ed);
            c.flash('Saved');
            setEd(null);
            await c.reload();
        }
        catch (e) {
            c.flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    async function set(k, v) { try {
        await c.api.setSetting(k, v);
        c.flash('Saved');
        await c.reload();
    }
    catch (e) {
        c.flash(errText(e), true);
    } }
    async function runNow() {
        setBusy(true);
        try {
            const r = await c.api.runBackup();
            c.flash(r.skipped ? `Backup didn't run: ${r.skipped}` : `Backup: ${r.copied ?? 0} copied, ${r.archived ?? 0} archived, ${r.failed ?? 0} failed${r.left_over ? `, ${r.left_over} left for next time` : ''}`, !!(r.skipped || r.failed));
            setRuns(await c.api.backupRuns());
            await c.reload();
        }
        catch (e) {
            c.flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    return _jsxs("div", { className: "list", children: [_jsx("h2", { children: "Compliance settings" }), _jsxs(Fold, { id: "comp.set.sp", open: true, title: "SharePoint backup", right: _jsx("button", { className: "ghost small", disabled: busy || !c.ov.sp_site, onClick: runNow, children: "Run now" }), children: [_jsxs("p", { className: "muted", children: ["Every night, new and changed files are copied to SharePoint into ", _jsxs("b", { children: [root || 'Compliance Archive', " / document type / site / year"] }), ". The folders are made automatically. Removed documents move to an _Archived folder there and are never deleted."] }), _jsxs("div", { className: "grid2", children: [_jsx(F, { label: "SharePoint site", hint: "e.g. liftedorganicscom.sharepoint.com/sites/LiftedOrganicsCorporate", children: _jsx(TextIn, { value: site, onChange: v => setSite(v ?? '') }) }), _jsx(F, { label: "Top folder", children: _jsx(TextIn, { value: root, onChange: v => setRoot(v ?? '') }) })] }), _jsxs("div", { className: "row", children: [_jsx("button", { className: "primary", disabled: site === (c.ov.sp_site ?? '') && root === (c.ov.sp_root ?? ''), onClick: async () => { await set('comp.sp_site', site); await set('comp.sp_root', root); }, children: "Save" }), _jsx("span", { className: "muted small", children: "Changing these copies everything again into the new place." })] }), runs.length > 0 && _jsx("div", { className: "dlist", style: { marginTop: 10 }, children: runs.map(r => _jsxs("div", { className: "drow", children: [_jsxs("span", { className: "grow", children: [when(r.started_at), " ", _jsx("span", { className: "muted", children: r.started_by ?? '' })] }), _jsx("span", { className: "small", children: r.error ? _jsx("span", { className: "neg", children: r.error }) : `${r.copied} copied · ${r.archived} archived · ${r.failed} failed${r.left_over ? ` · ${r.left_over} left` : ''}` })] }, r.id)) }), _jsxs("div", { className: "setup", children: [_jsx("p", { className: "muted small", style: { marginTop: 10 }, children: _jsx("b", { children: "One-time setup (Microsoft 365 admin):" }) }), _jsxs("ol", { className: "small muted", children: [_jsxs("li", { children: ["Entra admin center \u203A App registrations \u203A the \"Freezer Map\" app (or a new one) \u203A API permissions \u203A Microsoft Graph \u203A Application permission ", _jsx("b", { children: "Sites.Selected" }), " \u203A Grant admin consent."] }), _jsxs("li", { children: ["Give that app ", _jsx("b", { children: "write" }), " access to just the site above (SharePoint admin or Graph: POST /sites/{site-id}/permissions with role \"write\")."] }), _jsxs("li", { children: ["Vercel \u203A Settings \u203A Environment Variables: ", _jsx("span", { className: "mono", children: "MS_TENANT_ID" }), ", ", _jsx("span", { className: "mono", children: "MS_CLIENT_ID" }), ", ", _jsx("span", { className: "mono", children: "MS_CLIENT_SECRET" }), " (and ", _jsx("span", { className: "mono", children: "SUPABASE_SERVICE_ROLE_KEY" }), ", already there for QuickBooks). Redeploy."] }), _jsx("li", { children: "Fill in the site above, then Run now." })] })] })] }), _jsx(T3Settings, { c: c }), _jsx(Sites, { c: c }), _jsxs(Fold, { id: "comp.set.types", title: "Document types", count: c.types.length, right: _jsx("button", { className: "ghost small", onClick: () => setEd({ active: true, expires: false, sort: 50 }), children: "+ Add" }), children: [_jsx("p", { className: "muted", children: "Each type is a folder in SharePoint. Types that expire ask for an expiry date when you add a document." }), _jsx("div", { className: "dlist", children: c.types.map(t => _jsxs("button", { className: "drow linkrow", onClick: () => setEd(t), children: [_jsxs("span", { className: "grow", children: [_jsx("b", { children: t.label }), " ", _jsxs("span", { className: "muted", children: [t.folder !== t.label ? `folder "${t.folder}"` : '', t.expires ? ' · expires' : ''] }), t.notes && _jsx("div", { className: "muted small", children: t.notes })] }), !t.active && _jsx("span", { className: "muted", children: "off" }), _jsx("b", { children: c.ov.docs_by_type[t.key] ?? 0 })] }, t.key)) })] }), _jsx(Fold, { id: "comp.set.recon", title: "METRC reconcile", children: _jsxs("div", { className: "row wrap", children: [_jsx(F, { label: "Weight difference allowed (lbs)", children: _jsx(NumIn, { value: tol, onChange: setTol }) }), _jsx("button", { className: "ghost", onClick: () => set('comp.weight_tol', String(tol ?? 1)), children: "Save" }), _jsx(F, { label: "Flag packages unchanged for (days)", children: _jsx(NumIn, { value: stale, onChange: setStale }) }), _jsx("button", { className: "ghost", onClick: () => set('comp.stale_days', String(stale ?? 90)), children: "Save" })] }) }), _jsx(Fold, { id: "comp.set.people", title: "People", children: _jsx(ModulePeople, { sb: sb, module: "compliance", flash: c.flash }) }), ed && _jsxs(Sheet, { title: ed.key ? ed.label : 'New document type', onClose: () => setEd(null), children: [_jsx(F, { label: "Name", children: _jsx(TextIn, { value: ed.label, onChange: v => setEd({ ...ed, label: v ?? '', key: ed.key ?? undefined }) }) }), _jsx(F, { label: "SharePoint folder", hint: "blank = same as the name", children: _jsx(TextIn, { value: ed.folder, onChange: v => setEd({ ...ed, folder: v ?? '' }) }) }), _jsx(F, { label: "Order", children: _jsx(NumIn, { value: ed.sort ?? 50, onChange: v => setEd({ ...ed, sort: v ?? 50 }) }) }), _jsx(F, { label: "Notes", children: _jsx(TextIn, { value: ed.notes, onChange: v => setEd({ ...ed, notes: v }) }) }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: !!ed.expires, onChange: e => setEd({ ...ed, expires: e.target.checked }) }), " These expire"] }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: ed.active !== false, onChange: e => setEd({ ...ed, active: e.target.checked }) }), " Active"] }), _jsx(SaveBar, { busy: busy, onSave: () => saveType(), onCancel: () => setEd(null), disabled: !ed.label?.trim() })] })] });
}
function Sites({ c }) {
    const [rows, setRows] = useState([]);
    const [busy, setBusy] = useState(false);
    const load = () => c.api.certs().then(setRows).catch(e => c.flash(errText(e), true));
    useEffect(() => { load(); }, []);
    async function flip(x) {
        const on = !x.ccof;
        const msg = on
            ? `Mark ${x.site} (${x.label ?? x.site}) as CCOF certified?\n\nIts Feed and Spray logs and products will be checked against the CCOF list, and its crew will see warnings for products that aren't approved.`
            : `Mark ${x.site} (${x.label ?? x.site}) as NOT CCOF certified?\n\nIts logs and products will be left out of the CCOF checks, warnings and the application log. Only do this if the site really isn't certified.`;
        if (!confirm(msg))
            return;
        setBusy(true);
        try {
            await c.api.setCert(x.site, on);
            c.flash(`${x.site} ${on ? 'is CCOF certified' : 'is not CCOF certified'}`);
            await load();
            await c.reload();
        }
        catch (e) {
            c.flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    return _jsxs(Fold, { id: "comp.set.sites", open: true, title: "Sites and certifications", count: rows.length, children: [_jsx("p", { className: "muted", children: "Which sites are CCOF (OCal) certified. Sites that aren't are left out of the CCOF checks." }), _jsx("div", { className: "dlist", children: rows.map(x => _jsxs("label", { className: "drow check", style: { cursor: 'pointer' }, children: [_jsx("input", { type: "checkbox", checked: x.ccof, disabled: busy, onChange: () => flip(x) }), _jsxs("span", { className: "grow", children: [_jsx("b", { children: x.site }), " ", _jsx("span", { className: "muted", children: x.label ?? '' }), x.notes && _jsx("div", { className: "muted small", children: x.notes })] }), _jsx("span", { className: `pill ${x.ccof ? 'cp-ok' : 'cp-mute'}`, children: x.ccof ? 'CCOF certified' : 'Not certified' }), _jsx("span", { className: "muted small", children: x.updated_by && x.updated_by !== 'setup' ? `${x.updated_by.split('@')[0]} ${fmtD(x.updated_at)}` : '' })] }, x.site)) })] });
}
