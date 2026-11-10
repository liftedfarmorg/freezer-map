import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Select } from '../combo';
import { useEffect, useMemo, useState } from 'react';
import { AddDocsSheet, DocList, DropZone, Expiry, FileChip, SITES, daysTo, fmtD } from './files';
import { DateIn, F, Pick, SaveBar, Sheet, TextIn, errText } from '../cult/ui';
const REF_LABEL = { test: 'Pre-harvest test', pallet: 'Package', lot: 'Harvest lot', harvest: 'Harvest', material: 'Material', license: 'License',
    customer: 'Customer', metrc_error: 'METRC error', obligation: 'Deadline', processor: 'Processor', asset: 'Vehicle', fleet_log: 'Vehicle report', carrier: 'Carrier', driver: 'Driver' };
const who = (e) => (e ?? '').split('@')[0];
export function Library({ c }) {
    const view = c.sub === 'licenses' || c.sub === 'customers' ? c.sub : 'docs';
    return _jsxs("div", { className: "list", children: [_jsxs("div", { className: "row between wrap toolbar", children: [_jsx("h2", { children: "Library" }), _jsx("div", { className: "seg", children: [['docs', 'Documents'], ['licenses', 'Our licenses'], ['customers', 'Customer licenses']].map(([k, l]) => _jsx("button", { className: view === k ? 'on' : '', onClick: () => c.go('library', k), children: l }, k)) })] }), view === 'docs' && _jsx(Docs, { c: c }), view === 'licenses' && _jsx(Licenses, { c: c }), view === 'customers' && _jsx(Customers, { c: c })] });
}
// ---------- documents ----------
function Docs({ c }) {
    const [docs, setDocs] = useState(null);
    const [type, setType] = useState(null);
    const [site, setSite] = useState(null);
    const [q, setQ] = useState('');
    const [expiring, setExpiring] = useState(false);
    const [removed, setRemoved] = useState(false);
    const [adding, setAdding] = useState(null);
    const [open, setOpen] = useState(null);
    const load = async () => { try {
        setDocs(await c.api.docs({ deleted: removed }));
    }
    catch (e) {
        c.flash(errText(e), true);
        setDocs([]);
    } };
    useEffect(() => { load(); }, [removed]);
    const all = docs ?? [];
    const shownBase = all.filter(d => (removed || d.current) && (!site || (site === '-' ? !d.site : d.site === site)) &&
        (!q || `${d.title} ${d.file_name ?? ''} ${d.notes ?? ''} ${d.license_no ?? ''} ${c.typeLabel(d.doc_type)}`.toLowerCase().includes(q.toLowerCase())) &&
        (!expiring || (d.expires_on != null && (daysTo(d.expires_on) ?? 999) <= 60)));
    const counts = new Map();
    for (const d of shownBase)
        counts.set(d.doc_type, (counts.get(d.doc_type) ?? 0) + 1);
    const shown = shownBase.filter(d => !type || d.doc_type === type);
    return _jsxs("div", { onDragOver: e => e.preventDefault(), onDrop: e => { e.preventDefault(); const fs = [...e.dataTransfer.files]; if (fs.length && c.canEdit)
            setAdding(fs); }, children: [_jsx("p", { className: "muted", children: "Every compliance document in one place. Drop files anywhere on this page to add them. They're stored privately in the app and copied to SharePoint every night." }), c.canEdit && _jsxs("div", { className: "row wrap", style: { gap: 8 }, children: [_jsx("div", { style: { flex: 1, minWidth: 260 }, children: _jsx(DropZone, { onFiles: setAdding, label: "Drag documents here" }) }), _jsx("button", { className: "ghost", onClick: () => setAdding([]), children: "+ SharePoint link" })] }), _jsxs("div", { className: "row wrap toolbar", style: { marginTop: 10 }, children: [_jsx("input", { className: "search", placeholder: "Search title, file, license, notes", value: q, onChange: e => setQ(e.target.value) }), _jsxs(Select, { value: site ?? '', onChange: e => setSite(e.target.value || null), "aria-label": "Site", children: [_jsx("option", { value: "", children: "All sites" }), _jsx("option", { value: "-", children: "Company" }), SITES.map(s => _jsx("option", { children: s }, s))] }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: expiring, onChange: e => setExpiring(e.target.checked) }), " Expiring in 60 days"] }), c.isAdmin && _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: removed, onChange: e => setRemoved(e.target.checked) }), " Removed"] })] }), _jsxs("div", { className: "chips", children: [_jsxs("button", { className: !type ? 'on' : '', onClick: () => setType(null), children: ["All", _jsx("span", { className: "n", children: shownBase.length })] }), c.types.filter(t => t.active || counts.get(t.key)).map(t => _jsxs("button", { className: type === t.key ? 'on' : '', onClick: () => setType(type === t.key ? null : t.key), children: [t.label, _jsx("span", { className: "n", children: counts.get(t.key) ?? 0 })] }, t.key))] }), docs == null ? _jsx("p", { className: "muted", children: "Loading\u2026" }) : !shown.length ? _jsx("p", { className: "muted", children: all.length ? 'Nothing matches.' : 'No documents yet. Drop some files above to start.' })
                : _jsx("div", { className: "clist", children: shown.map(d => _jsx(DocRow, { c: c, d: d, onOpen: () => setOpen(d) }, d.id)) }), adding && _jsx(AddDocsSheet, { api: c.api, files: adding, types: c.types, flash: c.flash, preset: type ? { doc_type: type, site: site && site !== '-' ? site : null } : undefined, onClose: () => setAdding(null), onDone: async () => { setAdding(null); await load(); await c.reload(); } }), open && _jsx(DocSheet, { c: c, d: open, onClose: () => setOpen(null), onChanged: async () => { await load(); await c.reload(); } })] });
}
export function DocRow({ c, d, onOpen }) {
    return _jsxs("button", { className: "crow", onClick: onOpen, children: [_jsxs("span", { className: "grow", children: [_jsx("span", { className: "t", children: d.title }), d.version > 1 && _jsxs("span", { className: "muted", children: [" v", d.version] }), _jsxs("div", { className: "muted small", children: [c.typeLabel(d.doc_type), d.site ? ` · ${d.site}` : '', d.license_no ? ` · ${d.license_no}` : '', d.crop_year ? ` · ${d.crop_year}` : '', " \u00B7 added ", fmtD(d.created_at), d.created_by ? ` by ${who(d.created_by)}` : '', (d.links ?? []).length > 0 && ` · ${[...new Set((d.links ?? []).map(l => REF_LABEL[l.ref_kind]))].join(', ')}`] })] }), d.deleted_at ? _jsx("span", { className: "pill cp-mute", children: "removed" }) : _jsx(Expiry, { d: d.expires_on }), !d.file_path && _jsx("span", { className: "pill cp-info", children: "link" })] });
}
export function DocSheet({ c, d, onClose, onChanged }) {
    const [ed, setEd] = useState(null);
    const [busy, setBusy] = useState(false);
    const [vers, setVers] = useState([]);
    const [newVer, setNewVer] = useState(null);
    useEffect(() => { if (d.replaces_id)
        c.api.versions(d.replaces_id).then(setVers).catch(() => { }); }, [d.id]);
    const mine = d.created_by === c.me;
    const canEd = (c.canEdit || mine) && !d.deleted_at;
    async function save() {
        setBusy(true);
        try {
            await c.api.updateDoc(d.id, { doc_type: ed.doc_type, title: ed.title, site: ed.site ?? '', license_no: ed.license_no ?? '', crop_year: ed.crop_year ?? '',
                effective_on: ed.effective_on ?? '', expires_on: ed.expires_on ?? '', owner_email: ed.owner_email ?? '', notes: ed.notes ?? '', link_url: ed.link_url ?? '' });
            c.flash('Saved');
            await onChanged();
            onClose();
        }
        catch (e) {
            c.flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    async function del() {
        if (!confirm(`Remove "${d.title}"? It disappears here; the SharePoint copy moves to _Archived.`))
            return;
        setBusy(true);
        try {
            await c.api.deleteDoc(d.id);
            c.flash('Removed');
            await onChanged();
            onClose();
        }
        catch (e) {
            c.flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    if (newVer)
        return _jsx(AddDocsSheet, { api: c.api, files: newVer, types: c.types, flash: c.flash, lockType: true, preset: { ...d, links: (d.links ?? []).map(l => ({ kind: l.ref_kind, id: l.ref_id })), replaces: d.id }, onClose: () => setNewVer(null), onDone: async () => { setNewVer(null); await onChanged(); onClose(); } });
    return _jsxs(Sheet, { title: d.title, sub: _jsxs(_Fragment, { children: [c.typeLabel(d.doc_type), d.version > 1 ? ` · version ${d.version}` : ''] }), onClose: onClose, children: [d.deleted_at && _jsxs("div", { className: "warnbox", children: ["Removed ", fmtD(d.deleted_at), " by ", who(d.deleted_by), "."] }), !d.current && !d.deleted_at && _jsx("div", { className: "infobox", children: "An older version. A newer one replaced it." }), _jsx(FileChip, { api: c.api, f: d, flash: c.flash, sub: d.file_name ?? d.link_url ?? '' }), d.file_path && d.link_url && _jsx("p", { className: "small", children: _jsx("a", { href: d.link_url, target: "_blank", rel: "noopener", children: "Original in SharePoint \u203A" }) }), !ed ? _jsxs(_Fragment, { children: [_jsxs("dl", { children: [_jsx("dt", { children: "Site" }), _jsx("dd", { children: d.site ?? 'Company' }), d.license_no && _jsxs(_Fragment, { children: [_jsx("dt", { children: "License" }), _jsx("dd", { className: "mono", children: d.license_no })] }), d.crop_year && _jsxs(_Fragment, { children: [_jsx("dt", { children: "Crop year" }), _jsx("dd", { children: d.crop_year })] }), d.effective_on && _jsxs(_Fragment, { children: [_jsx("dt", { children: "Effective" }), _jsx("dd", { children: fmtD(d.effective_on) })] }), _jsx("dt", { children: "Expires" }), _jsx("dd", { children: d.expires_on ? _jsx(Expiry, { d: d.expires_on }) : _jsx("span", { className: "muted", children: "no date" }) }), d.owner_email && _jsxs(_Fragment, { children: [_jsx("dt", { children: "Owner" }), _jsx("dd", { children: d.owner_email })] }), _jsx("dt", { children: "Added" }), _jsxs("dd", { children: [fmtD(d.created_at), " by ", who(d.created_by)] }), (d.links ?? []).length > 0 && _jsxs(_Fragment, { children: [_jsx("dt", { children: "Linked to" }), _jsx("dd", { children: (d.links ?? []).map(l => `${REF_LABEL[l.ref_kind]} ${l.ref_id}`).join(', ') })] }), d.notes && _jsxs(_Fragment, { children: [_jsx("dt", { children: "Notes" }), _jsx("dd", { children: d.notes })] }), _jsx("dt", { children: "Backup" }), _jsx("dd", { className: "small", children: d.backed_up_at ? _jsxs(_Fragment, { children: ["In SharePoint ", fmtD(d.backed_up_at), d.sp_path ? _jsx("div", { className: "muted mono", children: d.sp_path }) : null] })
                                    : d.backup_error ? _jsx("span", { className: "neg", children: d.backup_error }) : d.file_path ? _jsx("span", { className: "muted", children: "waiting for tonight's copy" }) : _jsx("span", { className: "muted", children: "link only" }) })] }), vers.length > 0 && _jsxs(_Fragment, { children: [_jsx("h3", { children: "Earlier versions" }), _jsx("div", { className: "trace-files", children: vers.map(v => _jsx(FileChip, { api: c.api, f: v, flash: c.flash, sub: `v${v.version} · ${fmtD(v.created_at)}` }, v.id)) })] }), canEd && _jsxs("div", { className: "actions", style: { marginTop: 12 }, children: [_jsx("button", { className: "ghost", onClick: () => setEd({ ...d }), children: "Edit details" }), d.current && _jsx(DropZone, { compact: true, onFiles: fs => setNewVer(fs.slice(0, 1)), label: "drop a new version" }), _jsx("button", { className: "ghost danger", disabled: busy, onClick: del, children: "Remove" })] })] }) : _jsxs(_Fragment, { children: [_jsx(F, { label: "Title", children: _jsx(TextIn, { value: ed.title, onChange: v => setEd({ ...ed, title: v ?? '' }) }) }), _jsxs("div", { className: "grid2", children: [_jsx(F, { label: "Type", children: _jsx(Pick, { value: ed.doc_type ?? null, options: c.types.map(t => ({ v: t.key, l: t.label })), onChange: v => setEd({ ...ed, doc_type: v ?? 'other' }) }) }), _jsx(F, { label: "Site", children: _jsx(Pick, { value: ed.site ?? null, blank: "Company (all sites)", options: SITES.map(s => ({ v: s, l: s })), onChange: v => setEd({ ...ed, site: v }) }) }), _jsx(F, { label: "License", children: _jsx(TextIn, { value: ed.license_no, onChange: v => setEd({ ...ed, license_no: v }) }) }), _jsx(F, { label: "Crop year", children: _jsx(TextIn, { value: ed.crop_year != null ? String(ed.crop_year) : '', onChange: v => setEd({ ...ed, crop_year: v ? Number(v) : null }) }) }), _jsx(F, { label: "Effective", children: _jsx(DateIn, { value: ed.effective_on, onChange: v => setEd({ ...ed, effective_on: v }) }) }), _jsx(F, { label: "Expires", children: _jsx(DateIn, { value: ed.expires_on, onChange: v => setEd({ ...ed, expires_on: v }) }) })] }), _jsx(F, { label: "Owner", children: _jsx(TextIn, { value: ed.owner_email, onChange: v => setEd({ ...ed, owner_email: v }) }) }), _jsx(F, { label: "SharePoint link", children: _jsx(TextIn, { value: ed.link_url, onChange: v => setEd({ ...ed, link_url: v }) }) }), _jsx(F, { label: "Notes", children: _jsx("textarea", { value: ed.notes ?? '', onChange: e => setEd({ ...ed, notes: e.target.value || null }) }) }), _jsx(SaveBar, { busy: busy, onSave: save, onCancel: () => setEd(null), disabled: !ed.title?.trim() })] })] });
}
// ---------- our licenses ----------
function Licenses({ c }) {
    const [rows, setRows] = useState(null);
    const [open, setOpen] = useState(null);
    const load = async () => { try {
        setRows(await c.api.licenses());
    }
    catch (e) {
        c.flash(errText(e), true);
    } };
    useEffect(() => { load(); }, []);
    return _jsxs(_Fragment, { children: [_jsx("p", { className: "muted", children: "Lifted's licenses (the list itself is in Admin \u203A Settings \u203A Licenses). Set each expiry date here so renewals show on Deadlines, and keep the license PDFs with them." }), !rows ? _jsx("p", { className: "muted", children: "Loading\u2026" }) : _jsx("div", { className: "clist", children: rows.filter(l => l.active).map(l => _jsxs("button", { className: "crow", onClick: () => setOpen(l), children: [_jsxs("span", { className: "grow", children: [_jsx("span", { className: "t mono", children: l.license_no }), _jsx("div", { className: "muted small", children: [l.site, l.kind, l.tier, l.entity].filter(Boolean).join(' · ') })] }), l.expires ? _jsx(Expiry, { d: l.expires }) : _jsx("span", { className: "pill cp-warn", children: "no expiry date" })] }, l.license_no)) }), open && _jsx(LicenseSheet, { c: c, l: open, onClose: () => setOpen(null), onChanged: async () => { await load(); await c.reload(); } })] });
}
function LicenseSheet({ c, l, onClose, onChanged }) {
    const [exp, setExp] = useState(l.expires);
    const [busy, setBusy] = useState(false);
    const save = async () => { setBusy(true); try {
        await c.api.setLicenseExpiry(l.license_no, exp);
        c.flash('Saved');
        await onChanged();
    }
    catch (e) {
        c.flash(errText(e), true);
    }
    finally {
        setBusy(false);
    } };
    return _jsxs(Sheet, { title: l.license_no, sub: [l.site, l.kind, l.entity].filter(Boolean).join(' · '), onClose: onClose, children: [l.premises && _jsx("p", { className: "muted", children: l.premises }), _jsxs("div", { className: "row", children: [_jsx(F, { label: "Expires", children: _jsx(DateIn, { value: exp, onChange: setExp }) }), c.canEdit && _jsx("button", { className: "primary", disabled: busy || exp === l.expires, onClick: save, children: "Save" })] }), _jsx(DocList, { api: c.api, kind: "license", refId: l.license_no, docType: "licenses", flash: c.flash, canAdd: c.canEdit, title: "License documents", defaults: { site: l.site, license_no: l.license_no, expires_on: exp }, empty: "No license PDF here yet. Drop it below." })] });
}
// ---------- customer licenses ----------
const CUST_STATUS = { missing: ['No license', 'cp-bad'], expired: ['Expired', 'cp-bad'], expiring: ['Expiring', 'cp-warn'], no_expiry: ['No expiry date', 'cp-warn'], ok: ['OK', 'cp-ok'] };
function Customers({ c }) {
    const [rows, setRows] = useState(null);
    const [open, setOpen] = useState(null);
    const [onlyBad, setOnlyBad] = useState(false);
    const load = async () => { try {
        setRows(await c.api.customers());
    }
    catch (e) {
        c.flash(errText(e), true);
    } };
    useEffect(() => { load(); }, []);
    const shown = useMemo(() => (rows ?? []).filter(r => !onlyBad || r.status !== 'ok'), [rows, onlyBad]);
    return _jsxs(_Fragment, { children: [_jsx("p", { className: "muted", children: "Outside customers' state licenses. Sales sees a warning on a new order when the license is missing or expired." }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: onlyBad, onChange: e => setOnlyBad(e.target.checked) }), " Only the ones that need something"] }), !rows ? _jsx("p", { className: "muted", children: "Loading\u2026" }) : _jsx("div", { className: "clist", children: shown.map(r => _jsxs("button", { className: "crow", onClick: () => setOpen(r), children: [_jsxs("span", { className: "grow", children: [_jsx("span", { className: "t", children: r.name }), _jsxs("div", { className: "muted small", children: [_jsx("span", { className: "mono", children: r.license ?? 'no license on file' }), r.last_order ? ` · last order ${fmtD(r.last_order)}` : '', r.docs ? ` · ${r.docs} file${r.docs === 1 ? '' : 's'}` : ''] })] }), r.license_expires && r.status !== 'missing' ? _jsx(Expiry, { d: r.license_expires, warn: 30 }) : _jsx("span", { className: `pill ${CUST_STATUS[r.status][1]}`, children: CUST_STATUS[r.status][0] })] }, r.id)) }), open && _jsx(CustomerSheet, { c: c, r: open, onClose: () => setOpen(null), onChanged: async () => { await load(); await c.reload(); } })] });
}
function CustomerSheet({ c, r, onClose, onChanged }) {
    const [lic, setLic] = useState(r.license);
    const [exp, setExp] = useState(r.license_expires);
    const [busy, setBusy] = useState(false);
    const save = async () => { setBusy(true); try {
        await c.api.setCustomerLicense(r.id, lic, exp);
        c.flash('Saved');
        await onChanged();
    }
    catch (e) {
        c.flash(errText(e), true);
    }
    finally {
        setBusy(false);
    } };
    return _jsxs(Sheet, { title: r.name, sub: "Customer license", onClose: onClose, children: [_jsxs("div", { className: "grid2", children: [_jsx(F, { label: "State license #", children: _jsx(TextIn, { value: lic, onChange: setLic, placeholder: "C11-0000000-LIC" }) }), _jsx(F, { label: "Expires", children: _jsx(DateIn, { value: exp, onChange: setExp }) })] }), c.canEdit && _jsx("div", { className: "row", children: _jsx("button", { className: "primary", disabled: busy || (lic === r.license && exp === r.license_expires), onClick: save, children: "Save" }) }), _jsx(DocList, { api: c.api, kind: "customer", refId: r.id, docType: "customers", flash: c.flash, canAdd: c.canEdit, title: "Their license", defaults: { license_no: lic, expires_on: exp }, empty: "No copy of their license yet. Drop it below." })] });
}
