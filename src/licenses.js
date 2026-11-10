import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { tagTxt } from './mtag';
import { Select } from './combo';
import { ScanButton } from './scan';
import { useEffect, useState } from 'react';
import './nursery/nursery.css';
export const KIND_LABEL = {
    cultivation: 'Cultivation', processor: 'Processor', nursery: 'Nursery', distributor: 'Distributor (Type 11)', transport: 'Distributor, transport only (Type 13)',
    manufacturer: 'Manufacturer', retail: 'Retail', other: 'Other',
};
export const PURPOSE_LABEL = { mixed: 'Mixed pallets', harvest: 'Harvest pallets (fresh frozen)', plant: 'Plant tags (mothers, batches)', package: 'Packages', processing: 'Processing packages (wet, bucked, trimmed)' };
const tag = (r, n) => r.prefix + String(n).padStart(r.digits, '0');
async function rpc(sb, fn, args) {
    const { data, error } = await sb.rpc(fn, args);
    if (error && /schema cache|does not exist/.test(error.message))
        throw new Error('Run 028_licenses_nursery.sql in Supabase first');
    if (error)
        throw new Error(error.message);
    return data;
}
/** the tag ranges for one license, with a form to add one */
export function TagRanges({ sb, license, kind, ranges, used, canEdit, flash, onChanged }) {
    const [first, setFirst] = useState('');
    const [last, setLast] = useState('');
    const [purpose, setPurpose] = useState(kind === 'nursery' ? 'plant' : 'harvest');
    const [reserve, setReserve] = useState(true);
    const [busy, setBusy] = useState(false);
    const mine = ranges.filter(r => r.license === license);
    const go = async (p, ok) => {
        setBusy(true);
        try {
            await rpc(sb, 'save_tag_range', { p: { license, ...p } });
            flash(ok);
            setFirst('');
            setLast('');
            onChanged();
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
        finally {
            setBusy(false);
        }
    };
    return (_jsxs("div", { className: "tagranges", children: [_jsx("p", { className: "muted small", children: "Ranges marked \"blocked off\" keep tags for one purpose (the pallet-number tags are blocked off for harvest pallets). Once METRC's available tags are pulled, a purpose with its own blocked-off range takes tags only from it, and everything else skips blocked-off ranges. Other ranges are the old lists of issued tags, used only until METRC's list is pulled." }), !mine.length && _jsx("p", { className: "muted small", children: "No tag ranges blocked off for this license." }), [...new Set(mine.map(r => r.purpose))].map(pu => {
                const rs = mine.filter(r => r.purpose === pu), on = rs.filter(r => r.active);
                const n = (xs) => xs.reduce((a, r) => a + r.last_n - r.first_n + 1, 0);
                const row = (r) => (_jsxs("div", { className: `drow ${r.active ? '' : 'off'}`, children: [_jsxs("span", { className: "grow", children: [_jsxs("span", { className: "mono", children: [tagTxt(tag(r, r.first_n), 10), r.last_n > r.first_n ? ` to ${tagTxt(tag(r, r.last_n), 10)}` : ''] }), _jsxs("span", { className: "muted", children: [" \u00B7 ", (r.last_n - r.first_n + 1).toLocaleString(), " ", r.last_n > r.first_n ? 'tags' : 'tag', used ? ` · ${used(r).toLocaleString()} used` : '', r.active ? '' : ' · off'] }), r.reserved && _jsx("span", { className: "pill m-warn", children: "blocked off" }), r.notes && _jsxs("span", { className: "muted small", children: [" ", r.notes] })] }), canEdit && _jsx("button", { className: "ghost small", disabled: busy, onClick: () => go({ id: r.id, reserved: !r.reserved }, r.reserved ? 'Range released' : 'Range blocked off'), children: r.reserved ? 'Release' : 'Block off' }), canEdit && _jsx("button", { className: "ghost small", disabled: busy, onClick: () => go({ id: r.id, active: !r.active }, r.active ? 'Range off' : 'Range on'), children: r.active ? 'Turn off' : 'Turn on' })] }, r.id));
                return rs.length === 1 ? _jsxs("div", { children: [_jsx("b", { className: "small", children: PURPOSE_LABEL[pu] ?? pu }), row(rs[0])] }, pu) : (_jsxs("details", { className: "tagset", children: [_jsxs("summary", { children: [_jsx("b", { children: PURPOSE_LABEL[pu] ?? pu }), _jsxs("span", { className: "muted", children: [" \u00B7 ", n(on).toLocaleString(), " tags in ", on.length, " ranges", on.length < rs.length ? ` (${rs.length - on.length} off)` : ''] })] }), rs.map(row)] }, pu));
            }), canEdit && _jsxs("div", { className: "row wrap tagadd", children: [_jsx(Select, { value: purpose, onChange: e => setPurpose(e.target.value), children: Object.entries(PURPOSE_LABEL).map(([k, l]) => _jsx("option", { value: k, children: l }, k)) }), _jsx("input", { value: first, onChange: e => setFirst(e.target.value.toUpperCase()), placeholder: "First tag" }), _jsx(ScanButton, { compact: true, onScan: setFirst }), _jsx("input", { value: last, onChange: e => setLast(e.target.value.toUpperCase()), placeholder: "Last tag" }), _jsx(ScanButton, { compact: true, onScan: setLast }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: reserve, onChange: e => setReserve(e.target.checked) }), " ", _jsx("span", { children: "Block off for this purpose" })] }), _jsx("button", { className: "ghost small", disabled: busy || !first.trim() || !last.trim(), onClick: () => go({ first: first.trim(), last: last.trim(), purpose, reserved: reserve }, 'Tag range added'), children: "+ Add range" })] })] }));
}
/** Admin > Settings > Licenses */
export function LicensesPanel({ backend, flash }) {
    const sb = backend.client();
    const [lics, setLics] = useState(null);
    const [ranges, setRanges] = useState([]);
    const [freezers, setFreezers] = useState([]);
    const [ed, setEd] = useState(null);
    const [err, setErr] = useState(null);
    const [busy, setBusy] = useState(false);
    const [counts, setCounts] = useState([]);
    const [pulling, setPulling] = useState(null);
    const load = async () => {
        if (!sb)
            return;
        sb.rpc('metrc_tag_counts').then(({ data }) => setCounts((data ?? [])));
        const [l, r, f] = await Promise.all([sb.from('licenses').select('*').order('sort'), sb.from('tag_ranges').select('*').order('id'), sb.from('freezers').select('*').order('site').order('number')]);
        if (l.error) {
            setErr(/licenses/.test(l.error.message) ? 'Run 028_licenses_nursery.sql in Supabase first.' : l.error.message);
            return;
        }
        setLics(l.data);
        setRanges((r.data ?? []));
        setFreezers((f.data ?? []));
        setErr(null);
    };
    useEffect(() => { load(); }, []);
    if (!sb)
        return _jsx("p", { className: "muted", children: "Licenses need the database." });
    if (err)
        return _jsx("div", { className: "warnbox", children: err });
    if (!lics)
        return _jsx("p", { className: "muted", children: "Loading\u2026" });
    const save = async () => {
        setBusy(true);
        try {
            await rpc(sb, 'save_license', { p: ed });
            flash('License saved');
            setEd(null);
            load();
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
        finally {
            setBusy(false);
        }
    };
    const moveFreezer = async (id, lic) => {
        try {
            await rpc(sb, 'set_freezer_license', { p_freezer: id, p_license: lic });
            flash('Freezer moved');
            load();
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
    };
    const pullTags = async (lic) => {
        setPulling(lic);
        try {
            const { data } = await sb.auth.getSession();
            const r = await fetch('/api/metrc/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify({ licenses: [lic], only: 'tags' }) });
            const j = await r.json().catch(() => ({ error: `The server didn't answer (${r.status})` }));
            if (!r.ok)
                throw new Error(j.error ?? `Error ${r.status}`);
            const res = j.results?.[0];
            if (res?.error)
                throw new Error(res.error);
            flash(`${lic}: ${(res?.tags ?? 0).toLocaleString()} available tags from METRC`);
            load();
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
        finally {
            setPulling(null);
        }
    };
    const set = (v) => setEd(s => ({ ...s, ...v }));
    const real = freezers.filter(f => f.kind !== 'staging' && f.number > 0);
    return (_jsxs("div", { className: "licenses", children: [_jsx("p", { className: "muted", children: "Each state license is its own premises. Moving product between two of them is a transfer with a METRC manifest. Tags are issued per license." }), _jsx("div", { className: "row", children: _jsx("button", { className: "primary small", onClick: () => setEd({ kind: 'cultivation', active: true, hub: false }), children: "+ Add license" }) }), lics.map(l => {
                const fz = real.filter(f => f.license === l.license_no);
                return (_jsxs("section", { className: `dcard lic ${l.active ? '' : 'off'}`, children: [_jsxs("div", { className: "dcard-h", children: [_jsxs("h3", { children: [l.license_no, " ", _jsxs("span", { className: "muted", children: ["\u00B7 ", KIND_LABEL[l.kind] ?? l.kind, l.tier ? ` · ${l.tier}` : ''] })] }), _jsx("button", { className: "linkbtn", onClick: () => setEd(l), children: "Edit \u203A" })] }), _jsxs("div", { className: "muted", children: [l.entity, l.dba ? ` (dba ${l.dba})` : '', l.site ? ` · ${l.site}` : '', l.premises && l.premises !== l.site ? ` ${l.premises}` : '', l.hub ? ' · distribution hub' : '', l.expires ? ` · expires ${l.expires}` : '', l.active ? '' : ' · inactive'] }), l.notes && _jsx("div", { className: "small", children: l.notes }), fz.length > 0 && _jsxs("div", { className: "small", children: [fz.length, " ", fz.length === 1 ? 'freezer' : 'freezers', ": ", fz[0].site, " ", fz.map(f => f.number).join(', ')] }), l.kind !== 'transport' && _jsxs("div", { className: "row wrap small", style: { alignItems: 'center', gap: 8, margin: '6px 0' }, children: [_jsxs("span", { children: [_jsx("b", { children: "METRC available tags:" }), " ", (() => {
                                            const cs = counts.filter(x => x.license === l.license_no);
                                            return cs.length ? cs.map(x => `${x.free.toLocaleString()} ${x.tag_type} free (${x.available.toLocaleString()} available)`).join(' · ') + ` · pulled ${new Date(cs[0].pulled ?? '').toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'not pulled yet';
                                        })()] }), _jsx("button", { className: "ghost small", disabled: !!pulling, onClick: () => pullTags(l.license_no), children: pulling === l.license_no ? 'Pulling…' : 'Pull tags from METRC' })] }), _jsx(TagRanges, { sb: sb, license: l.license_no, kind: l.kind, ranges: ranges, canEdit: true, flash: flash, onChanged: load })] }, l.license_no));
            }), real.length > 0 && _jsxs("details", { className: "licfz", children: [_jsx("summary", { children: "Which license each freezer is under" }), _jsx("div", { className: "dlist", children: real.map(f => _jsxs("div", { className: "drow", children: [_jsxs("span", { className: "grow", children: [f.site, " freezer ", f.number] }), _jsx(Select, { value: f.license ?? '', onChange: e => moveFreezer(f.id, e.target.value), children: lics.filter(l => l.site === f.site || l.license_no === f.license).map(l => _jsxs("option", { value: l.license_no, children: [l.license_no, " \u00B7 ", KIND_LABEL[l.kind]] }, l.license_no)) })] }, f.id)) })] }), ed && (_jsx("div", { className: "scrim", onClick: () => setEd(null), children: _jsxs("div", { className: "sheet form", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsx("h2", { children: lics.some(l => l.license_no === ed.license_no) ? ed.license_no : 'New license' }), _jsx("button", { className: "ghost", onClick: () => setEd(null), children: "\u2715" })] }), _jsxs("div", { className: "grid2", children: [_jsxs("div", { className: "field", children: [_jsx("label", { children: "License #" }), _jsx("input", { value: ed.license_no ?? '', disabled: lics.some(l => l.license_no === ed.license_no), onChange: e => set({ license_no: e.target.value.toUpperCase() }) })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Type" }), _jsx(Select, { value: ed.kind, onChange: e => set({ kind: e.target.value }), children: Object.entries(KIND_LABEL).map(([k, v]) => _jsx("option", { value: k, children: v }, k)) })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Size / tier" }), _jsx("input", { value: ed.tier ?? '', onChange: e => set({ tier: e.target.value }), placeholder: "Large, Medium outdoor\u2026" })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Site code" }), _jsx("input", { value: ed.site ?? '', onChange: e => set({ site: e.target.value.toUpperCase() }), placeholder: "OHR, GVR, 1PN (blank for none)" })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Legal entity" }), _jsx("input", { value: ed.entity ?? '', onChange: e => set({ entity: e.target.value }), placeholder: "DNA Organics, Inc." })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "DBA" }), _jsx("input", { value: ed.dba ?? '', onChange: e => set({ dba: e.target.value }) })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Premises name" }), _jsx("input", { value: ed.premises ?? '', onChange: e => set({ premises: e.target.value }) })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Expires" }), _jsx("input", { type: "date", value: ed.expires ?? '', onChange: e => set({ expires: e.target.value || null }) })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Email" }), _jsx("input", { value: ed.email ?? '', onChange: e => set({ email: e.target.value }) })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Phone" }), _jsx("input", { value: ed.phone ?? '', onChange: e => set({ phone: e.target.value }) })] })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Premises address" }), _jsx("textarea", { rows: 2, value: ed.address ?? '', onChange: e => set({ address: e.target.value }) })] }), _jsxs("div", { className: "field", children: [_jsxs("label", { children: ["How to pay ", _jsx("span", { className: "muted", children: "(on invoices from this license; blank = \"Check payable to\" the entity)" })] }), _jsx("textarea", { rows: 2, value: ed.remit ?? '', onChange: e => set({ remit: e.target.value }) })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Notes" }), _jsx("input", { value: ed.notes ?? '', onChange: e => set({ notes: e.target.value }) })] }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: !!ed.hub, onChange: e => set({ hub: e.target.checked }) }), " ", _jsx("span", { children: "Distribution hub (loads from other sites go here)" })] }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: ed.active !== false, onChange: e => set({ active: e.target.checked }) }), " ", _jsx("span", { children: "Active" })] }), _jsxs("div", { className: "row between", children: [_jsx("span", {}), _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost", onClick: () => setEd(null), children: "Cancel" }), _jsx("button", { className: "primary", disabled: busy || !ed.license_no?.trim() || !ed.entity?.trim(), onClick: save, children: busy ? 'Saving…' : 'Save' })] })] })] }) }))] }));
}
