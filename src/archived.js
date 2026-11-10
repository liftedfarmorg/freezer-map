import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { MTag, tagTxt } from './mtag';
import { useEffect, useMemo, useState } from 'react';
import { Dialog, lbs } from './forms';
const SITES = ['OHR', 'GVR'];
const day = (iso) => (iso ? new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' }) : '');
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const who = (e) => (e ? e.split('@')[0] : '');
const errText = (e) => (e instanceof Error ? e.message : e?.message ?? String(e));
const LAST = { removed: 'Removed', harvest_undone: 'Harvest ✕', metrc_match: 'Reconcile', restored: 'Restored', strain_renamed: 'Strain renamed' };
function lastText(r) {
    if (!r.last)
        return 'Sheet import (10/20)';
    const t = r.last.type === 'removed' && r.last.reason === 'mistake' ? 'Removed as a mistake' : LAST[r.last.type] ?? r.last.type.replace(/_/g, ' ');
    return `${t} · ${who(r.last.by)} ${day(r.last.at)}`;
}
async function rpc(sb, fn, args = {}) {
    const { data, error } = await sb.rpc(fn, args);
    if (error) {
        if (/archived_overview|restore_pallets|delete_archived_pallet|function restore_pallet/i.test(error.message))
            throw new Error(`${error.message} (run 093_archived.sql in Supabase)`);
        throw new Error(error.message);
    }
    return data;
}
export const restoreOne = (sb, id, note, to, weight) => rpc(sb, 'restore_pallet', { p_pallet_id: id, p_note: note || null, p_slot: to.slot ?? null, p_site: to.site ?? null, p_staging: !!to.staging, p_weight: weight });
export const deleteOne = (sb, id, note) => rpc(sb, 'delete_archived_pallet', { p_pallet_id: id, p_note: note });
/** fetch one archived pallet's row (pallet card buttons) */
export async function archivedRow(sb, id) {
    const o = await rpc(sb, 'archived_overview');
    return { row: o.rows.find(r => r.id === id) ?? null, can_restore: o.can_restore, can_delete: o.can_delete };
}
export function ArchivedView({ sb, flash, onChanged, pickSpot, openPallet, initialQ }) {
    const [ov, setOv] = useState(null);
    const [busy, setBusy] = useState(null);
    const [show, setShow] = useState(initialQ ? 'all' : 'metrc');
    const [site, setSite] = useState('');
    const [q, setQ] = useState(initialQ ?? '');
    const [sel, setSel] = useState(new Set());
    const [restoring, setRestoring] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [useMetrc, setUseMetrc] = useState(true);
    const load = async () => {
        if (!sb)
            return;
        setBusy('Loading…');
        try {
            setOv(await rpc(sb, 'archived_overview'));
        }
        catch (e) {
            flash(errText(e), true);
        }
        finally {
            setBusy(null);
        }
    };
    useEffect(() => { load(); }, []);
    const rows = ov?.rows ?? [];
    const activeN = rows.filter(r => r.metrc_state).length;
    const list = useMemo(() => {
        const s = q.trim().toLowerCase();
        return rows.filter(r => (show === 'all' || r.metrc_state) && (!site || r.site === site)
            && (!s || [r.code, r.strain, r.tag, r.label, r.metrc_item].some(v => v?.toLowerCase().includes(s))));
    }, [rows, show, site, q]);
    const picked = list.filter(r => sel.has(r.id));
    const allOn = list.length > 0 && list.every(r => sel.has(r.id));
    const toggle = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const after = async () => { setSel(new Set()); onChanged(); await load(); };
    async function bulk(staging) {
        if (!sb || !picked.length)
            return;
        const where = staging ? 'its site\'s Staging' : 'Needs a spot at its site';
        if (!confirm(`Bring back ${picked.length} pallet${picked.length === 1 ? '' : 's'} to ${where}${useMetrc ? ', with METRC\'s weight where METRC has it' : ''}?`))
            return;
        setBusy('Restoring…');
        try {
            const r = await rpc(sb, 'restore_pallets', { p_ids: picked.map(p => p.id), p_note: 'Restored from Archived', p_staging: staging, p_use_metrc: useMetrc });
            flash(`${r.done} restored${r.errors.length ? `. Not restored: ${r.errors.map(e => `${e.code} (${e.error})`).join('; ')}` : ''}`, r.errors.length > 0);
            await after();
        }
        catch (e) {
            flash(errText(e), true);
        }
        finally {
            setBusy(null);
        }
    }
    const canR = !!ov?.can_restore, canD = !!ov?.can_delete;
    return _jsxs("div", { className: "list archived", children: [_jsxs("div", { className: "row between wrap toolbar", children: [_jsx("h2", { children: "Archived" }), _jsx("button", { className: "ghost small", disabled: !!busy, onClick: load, children: busy ?? 'Refresh' })] }), _jsxs("p", { className: "muted", children: ["Pallets that are out of inventory as archived: leftovers from the Freezer Map sheet import, ones removed as a mistake, ones closed by Reconcile.", ' ', _jsx("b", { children: "Active in METRC" }), " means METRC still has the package", ov?.pulled ? ` (pulled ${when(ov.pulled)})` : '', ", so it's probably real. Bring it back to a spot, Staging or Needs a spot. Nothing changes in METRC."] }), ov && !canR && _jsx("p", { className: "muted small", children: "Restoring and deleting need a Distribution Admin." }), _jsxs("div", { className: "row wrap", style: { gap: 8 }, children: [_jsxs("div", { className: "seg", children: [_jsxs("button", { className: show === 'metrc' ? 'on' : '', onClick: () => setShow('metrc'), children: ["Active in METRC (", activeN, ")"] }), _jsxs("button", { className: show === 'all' ? 'on' : '', onClick: () => setShow('all'), children: ["All (", rows.length, ")"] })] }), _jsx("div", { className: "seg", children: ['', ...SITES].map(s => _jsx("button", { className: site === s ? 'on' : '', onClick: () => setSite(s), children: s || 'Both' }, s)) }), _jsx("input", { className: "search", type: "search", placeholder: "Pallet, strain or tag", value: q, onChange: e => setQ(e.target.value) })] }), canR && picked.length > 0 && _jsxs("div", { className: "card row between wrap", children: [_jsxs("b", { children: [picked.length, " picked"] }), _jsxs("label", { className: "row small", children: [_jsx("input", { type: "checkbox", checked: useMetrc, onChange: e => setUseMetrc(e.target.checked) }), " Use METRC's weight"] }), _jsxs("div", { className: "row", children: [_jsx("button", { className: "primary small", disabled: !!busy, onClick: () => bulk(true), children: "Bring back to Staging" }), _jsx("button", { className: "ghost small", disabled: !!busy, onClick: () => bulk(false), children: "Bring back as Needs a spot" }), _jsx("button", { className: "ghost small", onClick: () => setSel(new Set()), children: "Clear" })] })] }), ov && !list.length && _jsx("p", { className: "muted", children: show === 'metrc' ? 'No archived pallets are active in METRC.' : 'Nothing archived matches.' }), list.length > 0 && _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "ct arch", children: [_jsx("thead", { children: _jsxs("tr", { children: [canR && _jsx("th", { children: _jsx("input", { type: "checkbox", checked: allOn, onChange: () => setSel(allOn ? new Set() : new Set(list.map(r => r.id))) }) }), _jsx("th", { children: "Pallet" }), _jsx("th", { children: "Strain" }), _jsx("th", { children: "Harvested" }), _jsx("th", { children: "Site" }), _jsx("th", { className: "num", children: "App" }), _jsx("th", { children: "METRC" }), _jsx("th", { children: "Archived by" }), _jsx("th", {})] }) }), _jsx("tbody", { children: list.map(r => {
                                const diff = r.metrc_state && r.metrc_lbs != null && r.lbs != null && Math.abs(r.metrc_lbs - r.lbs) >= 1;
                                return _jsxs("tr", { children: [canR && _jsx("td", { children: _jsx("input", { type: "checkbox", checked: sel.has(r.id), onChange: () => toggle(r.id) }) }), _jsxs("td", { className: "nw", children: [_jsx("a", { onClick: () => openPallet(r.id), children: _jsx("b", { children: r.code }) }), r.tag && _jsx("div", { className: "small muted", children: _jsx(MTag, { t: r.tag }) })] }), _jsx("td", { children: r.strain ?? r.label ?? '' }), _jsx("td", { className: "small nw", children: r.harvest_date ?? '' }), _jsx("td", { children: r.site ?? '?' }), _jsx("td", { className: "num nw", children: lbs(r.lbs) }), _jsxs("td", { className: "small", children: [r.metrc_state
                                                    ? _jsxs(_Fragment, { children: [_jsx("span", { className: "pill m-bad", children: r.metrc_state === 'intransit' ? 'In transit' : 'Active' }), " ", _jsx("span", { className: `nw ${diff ? 'neg' : ''}`, children: lbs(r.metrc_lbs) }), _jsx("div", { className: "muted", children: r.metrc_license })] })
                                                    : _jsx("span", { className: "muted", children: r.tag ? 'not active' : 'no tag' }), r.tag_on && _jsxs("div", { className: "neg", children: ["tag also on ", r.tag_on] })] }), _jsxs("td", { className: "small muted", children: [lastText(r), r.last?.note && _jsxs("div", { children: ["\"", r.last.note, "\""] })] }), _jsx("td", { children: _jsxs("div", { className: "row end", children: [canR && _jsx("button", { className: "primary small", disabled: !!busy || !!r.tag_on, onClick: () => setRestoring(r), children: "Restore" }), canD && _jsx("button", { className: "ghost small danger", disabled: !!busy, onClick: () => setDeleting(r), children: "Delete" })] }) })] }, r.id);
                            }) })] }) }), restoring && sb && _jsx(RestoreSheet, { r: restoring, onClose: () => setRestoring(null), onMap: (w, note) => { const r = restoring; setRestoring(null); pickSpot(r, w, note, () => { load(); }); }, onSubmit: async (to, w, note) => {
                    setBusy('Restoring…');
                    try {
                        await restoreOne(sb, restoring.id, note, to, w);
                        flash(`${restoring.code} is back${to.staging ? ` in ${to.site} Staging` : ` (Needs a spot at ${to.site})`}`);
                        setRestoring(null);
                        await after();
                    }
                    catch (e) {
                        flash(errText(e), true);
                    }
                    finally {
                        setBusy(null);
                    }
                } }), deleting && sb && _jsx(DeleteSheet, { r: deleting, onClose: () => setDeleting(null), onSubmit: async (note) => {
                    setBusy('Deleting…');
                    try {
                        await deleteOne(sb, deleting.id, note);
                        flash(`${deleting.code} deleted`);
                        setDeleting(null);
                        await after();
                    }
                    catch (e) {
                        flash(errText(e), true);
                    }
                    finally {
                        setBusy(null);
                    }
                } })] });
}
/** where an archived pallet goes back to: a spot picked on the map, the site's Staging, or Needs a spot */
export function RestoreSheet({ r, onClose, onMap, onSubmit }) {
    const [dest, setDest] = useState('map');
    const [site, setSite] = useState(r.site && SITES.includes(r.site) ? r.site : 'OHR');
    const metrcW = r.metrc_state && r.metrc_lbs && r.metrc_lbs > 0 ? r.metrc_lbs : null;
    const [w, setW] = useState(String(metrcW ?? r.lbs ?? ''));
    const [note, setNote] = useState(r.last ? '' : 'Was in a freezer; archived at the sheet import');
    const [busy, setBusy] = useState(false);
    const n = parseFloat(w);
    const weight = n > 0 && n !== r.lbs ? n : null;
    const go = async () => { if (dest === 'map') {
        onMap(weight, note);
        return;
    } setBusy(true); try {
        await onSubmit({ site, staging: dest === 'staging' }, weight, note);
    }
    finally {
        setBusy(false);
    } };
    return _jsxs(Dialog, { title: `Bring back ${r.code}`, onClose: onClose, children: [_jsxs("p", { className: "muted", children: [r.strain ?? r.label ?? '', r.harvest_date ? ` · harvested ${r.harvest_date}` : '', r.tag ? ` · tag ${tagTxt(r.tag)}` : ''] }), r.metrc_state ? _jsxs("p", { className: "small", children: ["METRC: active at ", r.metrc_license, ", ", lbs(r.metrc_lbs), r.metrc_item ? ` · ${r.metrc_item}` : ''] })
                : r.tag ? _jsx("div", { className: "warnbox", children: "METRC doesn't have this package active. Bring it back only if it's really in a freezer." }) : null, _jsxs("div", { className: "field", children: [_jsx("label", { children: "Where is it?" }), _jsxs("div", { className: "choices col", children: [_jsxs("button", { className: dest === 'map' ? 'on' : '', onClick: () => setDest('map'), children: [_jsx("b", { children: "Pick the spot on the map" }), " ", _jsx("span", { className: "muted", children: "open a freezer and tap where it is" })] }), _jsxs("button", { className: dest === 'staging' ? 'on' : '', onClick: () => setDest('staging'), children: [_jsx("b", { children: "Staging" }), " ", _jsx("span", { className: "muted", children: "the site's staging area" })] }), _jsxs("button", { className: dest === 'spot' ? 'on' : '', onClick: () => setDest('spot'), children: [_jsx("b", { children: "Needs a spot" }), " ", _jsx("span", { className: "muted", children: "back in inventory, place it later" })] })] })] }), dest !== 'map' && _jsxs("div", { className: "field", children: [_jsx("label", { children: "Site" }), _jsx("div", { className: "seg", children: SITES.map(s => _jsx("button", { className: site === s ? 'on' : '', onClick: () => setSite(s), children: s }, s)) })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Weight (lbs)" }), _jsx("input", { type: "number", inputMode: "decimal", min: "0", step: "0.01", value: w, onChange: e => setW(e.target.value) }), _jsxs("div", { className: "muted small", children: ["App had ", lbs(r.lbs) || 'none', metrcW != null ? `, METRC has ${lbs(metrcW)}` : '', "."] })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Note (optional)" }), _jsx("input", { value: note, onChange: e => setNote(e.target.value), placeholder: "Why it's coming back" })] }), _jsxs("div", { className: "row end", children: [_jsx("button", { className: "ghost", onClick: onClose, children: "Cancel" }), _jsx("button", { className: "primary", disabled: busy || !(n > 0), onClick: go, children: dest === 'map' ? 'Next: pick the spot' : 'Bring it back' })] })] });
}
export function DeleteSheet({ r, onClose, onSubmit }) {
    const [note, setNote] = useState('');
    return _jsxs(Dialog, { title: `Delete ${r.code} for good`, onClose: onClose, children: [r.metrc_state
                ? _jsxs("div", { className: "warnbox", children: ["METRC still has this package active (", lbs(r.metrc_lbs), "). It can't be deleted until it's restored or finished in METRC."] })
                : _jsxs("p", { children: [r.code, " ", r.strain ? `(${r.strain}) ` : '', "and its history are removed from the app. This can't be undone. The activity log keeps a copy of what it was."] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Why?" }), _jsx("input", { autoFocus: true, value: note, onChange: e => setNote(e.target.value), placeholder: "e.g. Duplicate row from the old sheet" })] }), _jsxs("div", { className: "row end", children: [_jsx("button", { className: "ghost", onClick: onClose, children: "Cancel" }), _jsx("button", { className: "primary danger", disabled: !note.trim() || !!r.metrc_state, onClick: () => onSubmit(note.trim()), children: "Delete" })] })] });
}
