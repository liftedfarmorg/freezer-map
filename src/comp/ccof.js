import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Select } from '../combo';
import { useEffect, useMemo, useState } from 'react';
import { STATUS_LABEL } from './api';
import { AddDocsSheet, DocList, DropZone, Expiry, SITES, fmtD, today } from './files';
import { DocRow, DocSheet } from './library';
import { LOG_HEAD, appLogPdf, logRows } from './applog';
import { download, toCsv } from './csv';
import { readCcofPdf } from './ccoflist';
import { DateIn, F, Pick, SaveBar, Sheet, TextIn, errText } from '../cult/ui';
const ST_CLS = { approved: 'cp-ok', pending: 'cp-warn', not_allowed: 'cp-bad', unknown: 'cp-mute' };
const LISTINGS = ['OMRI', 'CDFA OIM', 'WSDA', 'CCOF approved', 'Not listed'];
const MOD = (m) => (m === 'nursery' ? 'Nursery' : 'Cultivation');
export function Ccof({ c }) {
    const view = ['materials', 'list', 'log', 'certs', 'records'].find(v => v === c.sub) ?? 'materials';
    return _jsxs("div", { className: "list", children: [_jsxs("div", { className: "row between wrap toolbar", children: [_jsx("h2", { children: "CCOF" }), _jsx("div", { className: "seg", children: [['materials', 'Approved materials'], ['list', 'CCOF list'], ['log', 'Application log'], ['certs', 'Certificates'], ['records', 'Records']].map(([k, l]) => _jsx("button", { className: view === k ? 'on' : '', onClick: () => c.go('ccof', k), children: l }, k)) })] }), c.ov.certs && Object.values(c.ov.certs).some(v => !v) && _jsxs("p", { className: "muted small", children: ["Not CCOF certified: ", Object.entries(c.ov.certs).filter(([, v]) => !v).map(([k]) => k).join(', '), ". Their logs and products are left out of the CCOF checks (Settings \u203A Sites)."] }), view === 'materials' && _jsx(Materials, { c: c }), view === 'list' && _jsx(CcofListView, { c: c }), view === 'log' && _jsx(AppLogView, { c: c }), view === 'certs' && _jsx(TypeDocs, { c: c, types: ['ccof_cert'], note: "OCal certificates, the OSP, inspection reports and CCOF letters. Put an expiry date on the certificate so the renewal shows on Deadlines." }), view === 'records' && _jsx(TypeDocs, { c: c, types: ['ccof_records', 'receipts'], note: "Soil affidavits, cover crop records, labeling approvals, post harvest handling, and receipts for inputs (inspectors ask for these)." })] });
}
// ---------- approved materials (the Cultivation and Nursery product lists) ----------
function Materials({ c }) {
    const [rows, setRows] = useState(null);
    const [issues, setIssues] = useState([]);
    const [st, setSt] = useState(null);
    const nurseryCert = c.ov.certs?.['1PN'] ?? true;
    const [mod, setMod] = useState(nurseryCert ? null : 'cultivation');
    const [q, setQ] = useState('');
    const [open, setOpen] = useState(null);
    const [list, setList] = useState([]);
    const load = async () => { try {
        const [m, i, l] = await Promise.all([c.api.materials(), c.api.issues(), c.api.ccofList().catch(() => [])]);
        setRows(m);
        setIssues(i);
        setList(l);
    }
    catch (e) {
        c.flash(errText(e), true);
        setRows([]);
    } };
    useEffect(() => { load(); }, []);
    const used = useMemo(() => { const m = new Map(); for (const i of issues)
        m.set(`${i.module}|${i.product.toLowerCase()}`, (m.get(`${i.module}|${i.product.toLowerCase()}`) ?? 0) + 1); return m; }, [issues]);
    const all = (rows ?? []).filter(m => m.active || st === 'inactive');
    const shown = all.filter(m => (!st || (st === 'inactive' ? !m.active : m.ccof_status === st)) && (!mod || m.module === mod) &&
        (!q || `${m.name} ${m.manufacturer ?? ''} ${m.kind ?? ''} ${m.listing ?? ''}`.toLowerCase().includes(q.toLowerCase())));
    const n = (s) => all.filter(m => m.ccof_status === s).length;
    const orphan = [...new Map(issues.filter(i => i.product_id == null).map(i => [`${i.module}|${i.product.toLowerCase()}`, i])).values()];
    return _jsxs(_Fragment, { children: [_jsx("p", { className: "muted", children: "The Cultivation and Nursery product lists, with CCOF approval. Feed and Spray logs warn when someone uses a product that isn't approved here, and those show in Review." }), _jsxs("div", { className: "row wrap toolbar", children: [_jsx("input", { className: "search", placeholder: "Search products", value: q, onChange: e => setQ(e.target.value) }), _jsxs(Select, { value: mod ?? '', onChange: e => setMod(e.target.value || null), "aria-label": "List", children: [_jsx("option", { value: "", children: "Cultivation + Nursery" }), _jsx("option", { value: "cultivation", children: "Cultivation" }), _jsxs("option", { value: "nursery", children: ["Nursery", nurseryCert ? '' : ' (not certified)'] })] })] }), _jsxs("div", { className: "chips", children: [_jsxs("button", { className: !st ? 'on' : '', onClick: () => setSt(null), children: ["All", _jsx("span", { className: "n", children: all.length })] }), Object.keys(STATUS_LABEL).map(s => _jsxs("button", { className: st === s ? 'on' : '', onClick: () => setSt(st === s ? null : s), children: [STATUS_LABEL[s], _jsx("span", { className: "n", children: n(s) })] }, s)), _jsx("button", { className: st === 'inactive' ? 'on' : '', onClick: () => setSt(st === 'inactive' ? null : 'inactive'), children: "Inactive" })] }), orphan.length > 0 && _jsxs("div", { className: "warnbox", children: ["Used in logs this year but not on a product list: ", orphan.map(i => `${i.product} (${MOD(i.module)})`).join(', '), ". Add them in ", MOD(orphan[0].module), " \u203A Logs \u203A Products."] }), rows == null ? _jsx("p", { className: "muted", children: "Loading\u2026" }) : _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "ct", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Product" }), _jsx("th", { className: "hide-s", children: "Maker" }), _jsx("th", { className: "hide-s", children: "List" }), _jsx("th", { children: "CCOF" }), _jsx("th", { className: "hide-s", children: "CCOF #" }), _jsx("th", { className: "hide-s", children: "Listing" }), _jsx("th", { children: "Expires" }), _jsx("th", { className: "num hide-s", children: "Log lines this year" })] }) }), _jsx("tbody", { children: shown.map(m => {
                                const u = used.get(`${m.module}|${m.name.toLowerCase()}`);
                                return _jsxs("tr", { className: `tap ${u && m.ccof_status !== 'approved' ? 'flag' : ''}`, onClick: () => setOpen(m), children: [_jsxs("td", { children: [_jsx("b", { children: m.name }), m.pesticide && _jsx("span", { className: "pill warnp", style: { marginLeft: 6 }, children: "pesticide" }), _jsx("div", { className: "muted small", children: m.kind ?? '' })] }), _jsx("td", { className: "hide-s", children: m.manufacturer ?? '' }), _jsx("td", { className: "hide-s", children: MOD(m.module) }), _jsx("td", { children: _jsx("span", { className: `pill ${ST_CLS[m.ccof_status]}`, children: STATUS_LABEL[m.ccof_status] }) }), _jsx("td", { className: "mono small hide-s", children: m.ccof_code ?? _jsx("span", { className: "muted", children: "not on list" }) }), _jsx("td", { className: "hide-s", children: m.listing ?? '' }), _jsx("td", { children: m.listing_expires ? _jsx(Expiry, { d: m.listing_expires, warn: 30 }) : '' }), _jsx("td", { className: "num hide-s", children: u ? _jsxs("span", { className: "neg", children: [u, " not approved"] }) : '' })] }, m.id);
                            }) })] }) }), open && _jsx(MaterialSheet, { c: c, m: open, list: list, uses: used.get(`${open.module}|${open.name.toLowerCase()}`) ?? 0, onClose: () => setOpen(null), onSaved: async () => { setOpen(null); await load(); await c.reload(); } })] });
}
function MaterialSheet({ c, m, list, uses, onClose, onSaved }) {
    const [lq, setLq] = useState('');
    const [linking, setLinking] = useState(false);
    const entry = list.find(e => e.code === m.ccof_code);
    const guesses = useMemo(() => {
        const w = (lq || m.name).toLowerCase().split(/[^a-z0-9.]+/).filter(x => x.length > 1);
        return list.map(e => ({ e, n: w.filter(x => `${e.name} ${e.manufacturer ?? ''} ${e.code}`.toLowerCase().includes(x)).length })).filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 8).map(x => x.e);
    }, [lq, list, m.name]);
    async function link(code) {
        setBusy(true);
        try {
            await c.api.linkCcof(m.id, code);
            c.flash(code ? `Linked to CCOF ${code}` : 'Unlinked');
            await onSaved();
        }
        catch (e) {
            c.flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    const [x, setX] = useState(m);
    const [busy, setBusy] = useState(false);
    const set = (v) => setX(s => ({ ...s, ...v }));
    async function save() {
        setBusy(true);
        try {
            await c.api.setMaterial(m.id, { ccof_status: x.ccof_status, listing: x.listing ?? '', listing_no: x.listing_no ?? '', listing_expires: x.listing_expires ?? '',
                restrictions: x.restrictions ?? '', ccof_notes: x.ccof_notes ?? '', epa_reg: x.epa_reg ?? '' });
            c.flash('Saved');
            await onSaved();
        }
        catch (e) {
            c.flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    return _jsxs(Sheet, { title: m.name, sub: _jsxs(_Fragment, { children: [m.manufacturer ?? '', " \u00B7 ", MOD(m.module), " list", m.pesticide ? ' · pesticide' : ''] }), onClose: onClose, children: [uses > 0 && m.ccof_status !== 'approved' && _jsxs("div", { className: "warnbox", children: ["Used on ", uses, " log line", uses === 1 ? '' : 's', " this year without approval."] }), _jsxs("div", { className: "infobox", children: [entry ? _jsxs(_Fragment, { children: [_jsxs("b", { children: ["CCOF ", entry.code] }), " \u00B7 ", entry.name, " ", _jsxs("span", { className: "muted", children: ["(", entry.manufacturer, ")"] }), _jsxs("div", { className: "small", children: [entry.status, entry.listing ? ` · ${entry.listing}` : '', entry.approved_on ? ` · approved ${fmtD(entry.approved_on)}` : ''] }), entry.restriction && _jsxs("div", { className: "small", children: [_jsx("b", { children: "Restriction:" }), " ", entry.restriction] }), entry.action_required && _jsx("div", { className: "small neg", children: "CCOF action required" }), c.canEdit && _jsxs("div", { className: "row", style: { marginTop: 6 }, children: [_jsx("button", { className: "ghost small", disabled: busy, onClick: () => setLinking(v => !v), children: "Change" }), _jsx("button", { className: "ghost small", disabled: busy, onClick: () => link(null), children: "Unlink" })] })] })
                        : _jsxs(_Fragment, { children: [_jsx("b", { children: "Not linked to the CCOF list." }), " ", c.canEdit && !linking && _jsx("button", { className: "linkbtn", onClick: () => setLinking(true), children: "Find it on the list \u203A" })] }), linking && c.canEdit && _jsxs("div", { style: { marginTop: 8 }, children: [_jsx("input", { className: "search", placeholder: "Search the CCOF list (name, maker or code)", value: lq, onChange: e => setLq(e.target.value), autoFocus: true }), _jsxs("div", { className: "dlist", style: { marginTop: 6 }, children: [guesses.map(e => _jsxs("button", { className: "drow linkrow", disabled: busy, onClick: () => link(e.code), children: [_jsxs("span", { className: "grow", children: [_jsx("span", { className: "mono small", children: e.code }), " ", e.name, " ", _jsx("span", { className: "muted small", children: e.manufacturer })] }), _jsx("span", { className: "small", children: e.status })] }, e.id)), !guesses.length && _jsx("p", { className: "muted small", children: "Nothing matches. If it isn't on the list, add it in MyCCOF before using it." })] })] })] }), _jsxs("div", { className: "grid2", children: [_jsx(F, { label: "CCOF status", children: _jsx(Pick, { value: x.ccof_status ?? 'unknown', options: Object.keys(STATUS_LABEL).map(s => ({ v: s, l: STATUS_LABEL[s] })), onChange: v => set({ ccof_status: v ?? 'unknown' }) }) }), _jsx(F, { label: "Listed by", children: _jsx(Pick, { value: x.listing ?? null, blank: "\u2014", options: LISTINGS.map(l => ({ v: l, l })), onChange: v => set({ listing: v }) }) }), _jsx(F, { label: "Listing / cert #", children: _jsx(TextIn, { value: x.listing_no, onChange: v => set({ listing_no: v }) }) }), _jsx(F, { label: "Listing expires", children: _jsx(DateIn, { value: x.listing_expires, onChange: v => set({ listing_expires: v }) }) }), m.pesticide && _jsx(F, { label: "EPA / CA reg #", children: _jsx(TextIn, { value: x.epa_reg, onChange: v => set({ epa_reg: v }) }) })] }), _jsx(F, { label: "Restrictions / annotations", hint: "e.g. 'allowed only for\u2026'", children: _jsx("textarea", { value: x.restrictions ?? '', onChange: e => set({ restrictions: e.target.value || null }) }) }), _jsx(F, { label: "Notes", children: _jsx("textarea", { value: x.ccof_notes ?? '', onChange: e => set({ ccof_notes: e.target.value || null }) }) }), m.ccof_by && _jsxs("p", { className: "muted small", children: ["Last set by ", m.ccof_by.split('@')[0], " ", fmtD(m.ccof_at)] }), _jsx(DocList, { api: c.api, kind: "material", refId: m.id, docType: m.pesticide ? 'pesticides' : 'fertilizers', flash: c.flash, canAdd: c.canEdit, title: "Label, SDS, listing certificate", defaults: { expires_on: x.listing_expires ?? null }, empty: "Drop the label, SDS and OMRI / OIM listing here." }), c.canEdit && _jsx(SaveBar, { busy: busy, onSave: save, onCancel: onClose })] });
}
// ---------- application log ----------
function AppLogView({ c }) {
    const y = new Date().getFullYear();
    const [from, setFrom] = useState(`${y}-01-01`);
    const [to, setTo] = useState(today());
    const [site, setSite] = useState(null);
    const [mod, setMod] = useState('cultivation');
    const [kind, setKind] = useState('both');
    const [rows, setRows] = useState(null);
    const [mats, setMats] = useState([]);
    useEffect(() => { c.api.materials().then(setMats).catch(() => { }); }, []);
    useEffect(() => { if (!from || !to)
        return; setRows(null); c.api.appLog(from, to, site, mod).then(setRows).catch(e => { c.flash(errText(e), true); setRows([]); }); }, [from, to, site, mod]);
    const logs = (rows ?? []).filter(l => kind === 'both' || l.kind === kind);
    const ok = (module, product) => { const m = mats.find(x => x.module === module && x.name.toLowerCase() === product.toLowerCase()); return !!m && m.ccof_status === 'approved'; };
    const lines = logRows(logs);
    const flags = logs.flatMap(l => (l.products.length ? l.products : [{ product: '' }]).map(p => !!p.product && !ok(l.module, p.product)));
    const name = `Application log ${site ?? 'all sites'} ${from} to ${to}`;
    async function pdf() {
        try {
            const b = await appLogPdf(logs, { from: from, to: to, site, who: c.me?.split('@')[0] ?? '', entity: 'Lifted Farms (DNA Organics, Inc.)' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(b);
            a.download = `${name}.pdf`;
            a.click();
        }
        catch (e) {
            c.flash(errText(e), true);
        }
    }
    return _jsxs(_Fragment, { children: [_jsx("p", { className: "muted", children: "Built from the Feed and Spray logs in Cultivation and Nursery, in the Farm Data layout. Nothing to enter here. Highlighted lines use a product that isn't approved in Approved materials." }), _jsxs("div", { className: "row wrap toolbar", children: [_jsx(F, { label: "From", children: _jsx(DateIn, { value: from, onChange: setFrom }) }), _jsx(F, { label: "To", children: _jsx(DateIn, { value: to, onChange: setTo }) }), _jsx(F, { label: "Site", children: _jsx(Pick, { value: site, blank: "All sites", options: SITES.map(s => ({ v: s, l: s })), onChange: setSite }) }), _jsx(F, { label: "Logs", children: _jsx(Pick, { value: mod, blank: "Cultivation + Nursery", options: [{ v: 'cultivation', l: 'Cultivation' }, { v: 'nursery', l: 'Nursery' }], onChange: setMod }) }), _jsx(F, { label: "Kind", children: _jsx(Pick, { value: kind, options: [{ v: 'both', l: 'Feed + Spray' }, { v: 'feed', l: 'Feed only' }, { v: 'spray', l: 'Spray only' }], onChange: v => setKind(v ?? 'both') }) })] }), _jsxs("div", { className: "row", children: [_jsx("button", { className: "primary", disabled: !logs.length, onClick: pdf, children: "Download PDF" }), _jsx("button", { className: "ghost", disabled: !logs.length, onClick: () => download(`${name}.csv`, toCsv(LOG_HEAD.slice(0, 11).concat('Total unit'), lines)), children: "CSV" }), _jsxs("span", { className: "muted", children: [logs.length, " application", logs.length === 1 ? '' : 's', flags.some(Boolean) ? ` · ${flags.filter(Boolean).length} line(s) not approved` : ''] })] }), rows == null ? _jsx("p", { className: "muted", children: "Loading\u2026" }) : !logs.length ? _jsx("p", { className: "muted", children: "No Feed or Spray logs in these dates." }) : _jsx("div", { className: "tablewrap", style: { marginTop: 10 }, children: _jsxs("table", { className: "ct", children: [_jsx("thead", { children: _jsx("tr", { children: LOG_HEAD.map((h, i) => _jsx("th", { className: [4, 5, 8, 10].includes(i) ? 'num' : '', children: h }, i)) }) }), _jsx("tbody", { children: lines.map((r, i) => _jsx("tr", { className: `${r[0] ? 'grp' : ''} ${flags[i] ? 'flag' : ''}`, children: r.map((v, j) => _jsx("td", { className: [4, 5, 8, 10].includes(j) ? 'num' : '', children: j < 2 ? _jsx("b", { children: v }) : v }, j)) }, i)) })] }) })] });
}
// ---------- documents of one or two types (Certificates, Records) ----------
export function TypeDocs({ c, types, note }) {
    const [docs, setDocs] = useState(null);
    const [adding, setAdding] = useState(null);
    const [open, setOpen] = useState(null);
    const load = async () => { try {
        setDocs((await c.api.docs()).filter(d => types.includes(d.doc_type) && d.current));
    }
    catch (e) {
        c.flash(errText(e), true);
        setDocs([]);
    } };
    useEffect(() => { load(); }, [types.join()]);
    return _jsxs(_Fragment, { children: [_jsx("p", { className: "muted", children: note }), c.canEdit && _jsx(DropZone, { onFiles: setAdding, label: `Drag ${types.map(c.typeLabel).join(' or ').toLowerCase()} here` }), docs == null ? _jsx("p", { className: "muted", children: "Loading\u2026" }) : !docs.length ? _jsx("p", { className: "muted", children: "Nothing here yet." }) : _jsx("div", { className: "clist", style: { marginTop: 10 }, children: docs.map(d => _jsx(DocRow, { c: c, d: d, onOpen: () => setOpen(d) }, d.id)) }), adding && _jsx(AddDocsSheet, { api: c.api, files: adding, types: c.types, flash: c.flash, preset: { doc_type: types[0] }, onClose: () => setAdding(null), onDone: async () => { setAdding(null); await load(); await c.reload(); } }), open && _jsx(DocSheet, { c: c, d: open, onClose: () => setOpen(null), onChanged: async () => { await load(); await c.reload(); } })] });
}
// ---------- the CCOF OSP materials list (from MyCCOF) ----------
function CcofListView({ c }) {
    const [rows, setRows] = useState(null);
    const [mats, setMats] = useState([]);
    const [q, setQ] = useState('');
    const [cat, setCat] = useState(null);
    const [preview, setPreview] = useState(null);
    const [busy, setBusy] = useState(false);
    const load = async () => { try {
        const [l, m] = await Promise.all([c.api.ccofList(), c.api.materials()]);
        setRows(l);
        setMats(m);
    }
    catch (e) {
        c.flash(errText(e), true);
        setRows([]);
    } };
    useEffect(() => { load(); }, []);
    async function read(fs) {
        const f = fs.find(x => /\.pdf$/i.test(x.name)) ?? fs[0];
        setBusy(true);
        try {
            const r = await readCcofPdf(f);
            if (r.rows.length < 5)
                throw new Error('No materials found in that PDF. Use the OSP Materials List from MyCCOF.');
            setPreview({ file: f, rows: r.rows, date: r.listDate });
        }
        catch (e) {
            c.flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    async function doImport() {
        if (!preview)
            return;
        setBusy(true);
        try {
            const r = await c.api.importCcof(preview.date, preview.rows, preview.file.name);
            // keep the PDF itself in the Library too
            try {
                const path = await c.api.upload(preview.file, 'ccof_cert');
                await c.api.addDoc({ doc_type: 'ccof_cert', title: `CCOF OSP Materials List${preview.date ? ` ${preview.date}` : ''}`, file_path: path, file_name: preview.file.name,
                    mime: preview.file.type || 'application/pdf', size_bytes: preview.file.size, effective_on: preview.date });
            }
            catch { /* list is in; the file copy is a bonus */ }
            c.flash(`CCOF list loaded: ${r.active} entries (${r.new} new), ${r.linked} product${r.linked === 1 ? '' : 's'} linked by name${r.off_list ? `, ${r.off_list} no longer on the list` : ''}`);
            setPreview(null);
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
    const byCode = useMemo(() => { const m = new Map(); for (const x of mats)
        if (x.ccof_code)
            m.set(x.ccof_code, [...(m.get(x.ccof_code) ?? []), x]); return m; }, [mats]);
    const cats = [...new Set((rows ?? []).map(r => r.category ?? 'Other'))];
    const shown = (rows ?? []).filter(r => (!cat || (r.category ?? 'Other') === cat) && (!q || `${r.code} ${r.name} ${r.manufacturer ?? ''} ${r.restriction ?? ''}`.toLowerCase().includes(q.toLowerCase())));
    const date = rows?.[0]?.list_date;
    return _jsxs(_Fragment, { children: [_jsxs("p", { className: "muted", children: ["Lifted's approved materials as CCOF has them (MyCCOF \u203A OSP Materials List)", date ? `, list from ${fmtD(date)}` : '', ". To update it, download a fresh list from MyCCOF and drop the PDF here. Products are matched by name; link the rest from Approved materials."] }), c.canEdit && (busy && !preview ? _jsx("p", { className: "muted", children: "Reading the PDF\u2026" }) : _jsx(DropZone, { onFiles: read, accept: ".pdf", label: "Drop the CCOF OSP Materials List PDF" })), preview && _jsxs("div", { className: "infobox", style: { marginTop: 10 }, children: [_jsx("b", { children: preview.file.name }), ": ", preview.rows.length, " materials", preview.date ? `, generated ${fmtD(preview.date)}` : '', ". ", preview.rows.filter(r => r.action_required).length, " need action.", _jsxs("div", { className: "row", style: { marginTop: 6 }, children: [_jsx("button", { className: "primary", disabled: busy, onClick: doImport, children: "Load this list" }), _jsx("button", { className: "ghost", onClick: () => setPreview(null), children: "Cancel" })] })] }), _jsx("div", { className: "row wrap toolbar", style: { marginTop: 10 }, children: _jsx("input", { className: "search", placeholder: "Search the CCOF list", value: q, onChange: e => setQ(e.target.value) }) }), _jsxs("div", { className: "chips", children: [_jsxs("button", { className: !cat ? 'on' : '', onClick: () => setCat(null), children: ["All", _jsx("span", { className: "n", children: rows?.length ?? 0 })] }), cats.map(k => _jsx("button", { className: cat === k ? 'on' : '', onClick: () => setCat(cat === k ? null : k), children: k }, k))] }), rows == null ? _jsx("p", { className: "muted", children: "Loading\u2026" }) : !rows.length ? _jsx("p", { className: "muted", children: "No CCOF list loaded yet." }) : _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "ct", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Code" }), _jsx("th", { children: "Material" }), _jsx("th", { className: "hide-s", children: "Maker" }), _jsx("th", { children: "Status" }), _jsx("th", { className: "hide-s", children: "Restriction / comment" }), _jsx("th", { children: "In the app as" })] }) }), _jsx("tbody", { children: shown.map(r => {
                                const ms = byCode.get(r.code) ?? [];
                                return _jsxs("tr", { className: r.action_required ? 'flag' : '', children: [_jsx("td", { className: "mono small nowrap", children: r.code }), _jsxs("td", { children: [_jsx("b", { children: r.name }), _jsx("div", { className: "muted small", children: r.approved_on ? `approved ${fmtD(r.approved_on)}` : '' })] }), _jsx("td", { className: "hide-s small", children: r.manufacturer }), _jsxs("td", { children: [_jsx("span", { className: `pill ${r.action_required ? 'cp-bad' : /restricted/i.test(r.status ?? '') ? 'cp-warn' : 'cp-ok'}`, children: r.action_required ? 'Action required' : r.status }), _jsx("div", { className: "muted small", children: r.listing })] }), _jsxs("td", { className: "hide-s small", children: [r.restriction, r.comment && _jsx("div", { className: "muted", children: r.comment })] }), _jsx("td", { className: "small", children: ms.map(m => `${m.name}${m.module === 'nursery' ? ' (nursery)' : ''}`).join(', ') })] }, r.id);
                            }) })] }) })] });
}
