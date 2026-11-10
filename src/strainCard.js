import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { EditForm } from './settings';
import { StrainProfileEdit, loadProfiles } from './strains';
import { isAnyAdmin } from './fold';
import { StrainItems } from './items';
// The strain settings card, from anywhere: tap a strain name on a pallet, package, reserve, harvest or inventory row.
// Same card as Settings > Strains. Any module Admin can change the name, color and other names;
// each fold of the profile is still only editable by that module's Admins.
export const openStrain = (name) => { if (name)
    window.dispatchEvent(new CustomEvent('lf:strain', { detail: name })); };
/** a strain name that opens the strain card */
export function StrainLink({ name, className }) {
    if (!name)
        return null;
    return _jsx("a", { className: `slink ${className ?? ''}`, title: "Strain card", onClick: e => { e.stopPropagation(); e.preventDefault(); openStrain(name); }, children: name });
}
export function findStrain(strains, name) {
    const n = name.trim().toLowerCase();
    return strains.find(s => s.name.toLowerCase() === n) ?? strains.find(s => (s.aliases ?? []).some(a => a.toLowerCase() === n));
}
export function StrainCardHost({ backend, strains, flash, onChanged }) {
    const [name, setName] = useState(null);
    const [profiles, setProfiles] = useState(null);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        const on = (e) => setName(e.detail);
        window.addEventListener('lf:strain', on);
        return () => window.removeEventListener('lf:strain', on);
    }, []);
    const reloadProfiles = () => loadProfiles(backend.client()).then(setProfiles);
    useEffect(() => { if (name)
        reloadProfiles(); }, [name]);
    if (!name)
        return null;
    const s = findStrain(strains, name);
    const close = () => setName(null);
    if (!s)
        return (_jsx("div", { className: "scrim", onClick: close, children: _jsxs("div", { className: "sheet form", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsx("h2", { children: name }), _jsx("button", { className: "ghost", onClick: close, children: "\u2715" })] }), _jsxs("p", { className: "muted", children: [name, " isn't in the strain list. An Admin can add it in Settings \u203A Strains, or add it as another name on an existing strain."] })] }) }));
    const p = profiles?.get(s.id);
    const profile = p ? _jsx(StrainProfileEdit, { sb: backend.client(), p: p, flash: flash, onSaved: reloadProfiles }, s.id) : _jsx("p", { className: "muted", children: profiles ? '' : 'Loading…' });
    if (isAnyAdmin())
        return (_jsx(EditForm, { list: "strains", row: structuredClone(s), busy: busy, onClose: close, extra: _jsxs(_Fragment, { children: [s.code && _jsx(StrainCode, { code: s.code, flash: flash }), profile, _jsx(StrainItems, { sb: backend.client(), strainId: s.id, strainType: s.strain_type ?? null, flash: flash, canEdit: true, onChanged: onChanged })] }), onSave: async (row) => {
                setBusy(true);
                try {
                    await backend.saveRow('strains', row);
                    onChanged();
                    flash('Saved');
                    close();
                }
                catch (e) {
                    flash(e.message, true);
                }
                finally {
                    setBusy(false);
                }
            } }, s.id));
    return (_jsx("div", { className: "scrim", onClick: close, children: _jsxs("div", { className: "sheet form", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsxs("h2", { children: [_jsx("span", { className: "swatch", style: { background: s.color ?? 'transparent' } }), " ", s.name] }), _jsx("button", { className: "ghost", onClick: close, children: "\u2715" })] }), s.code && _jsx(StrainCode, { code: s.code, flash: flash }), (s.aliases ?? []).length > 0 && _jsxs("p", { className: "muted", children: ["Also called ", s.aliases.join(', ')] }), s.notes && _jsx("p", { children: s.notes }), profile, _jsx(StrainItems, { sb: backend.client(), strainId: s.id, strainType: s.strain_type ?? null, flash: flash, canEdit: false })] }) }));
}
/** the strain code (first letter + strain number, e.g. J143): used in METRC harvest names and coded nursery items */
export function StrainCode({ code, flash }) {
    async function copy() { try {
        await navigator.clipboard.writeText(code);
        flash?.(`${code} copied`);
    }
    catch {
        flash?.(code);
    } }
    return _jsxs("p", { className: "row", style: { gap: 8, alignItems: 'center' }, children: [_jsx("span", { className: "muted", children: "Strain code" }), " ", _jsx("b", { children: code }), _jsx("button", { className: "ghost small", onClick: copy, children: "Copy" }), _jsxs("span", { className: "muted small", children: ["Used in METRC harvest names (OHR-", code, "-1C-10232026-1-FF) and coded nursery items."] })] });
}
