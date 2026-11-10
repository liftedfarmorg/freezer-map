import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { can } from './fold';
const STATUS = ['On', 'Off', 'Needs Attention', 'Not Working'];
const label = (l) => (l.kind === 'trailer' ? `Reefer ${l.number - 100}` : `Freezer ${l.number}`);
export function DistLocations({ sb, flash, onChanged }) {
    const [site, setSite] = useState('GVR');
    const [locs, setLocs] = useState(null);
    const [ed, setEd] = useState(null);
    const [busy, setBusy] = useState(false);
    const [showRetired, setShowRetired] = useState(false);
    const edit = can('distribution', 'locations');
    const formRef = useRef(null);
    useEffect(() => { if (ed)
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [ed?.at, ed?.id, ed == null]);
    const load = async () => {
        if (!sb)
            return;
        const f = await sb.from('freezers').select('*').order('number');
        const s = { data: [] };
        for (let a = 0;; a += 1000) { // the API hands back 1,000 rows at a time
            const r = await sb.from('slots').select('freezer_id,row').order('id').range(a, a + 999);
            s.data.push(...(r.data ?? []));
            if (!r.data || r.data.length < 1000)
                break;
        }
        if (f.error) {
            flash(f.error.message, true);
            return;
        }
        const deep = new Map();
        for (const x of (s.data ?? []))
            deep.set(x.freezer_id, Math.max(deep.get(x.freezer_id) ?? 0, x.row));
        setLocs((f.data ?? []).filter(l => l.kind !== 'staging').map(l => ({ ...l, rows: deep.get(l.id) ?? 0 })));
    };
    useEffect(() => { load(); }, [sb]);
    if (!sb)
        return _jsx("p", { className: "muted", children: "Locations need the database." });
    if (!locs)
        return _jsx("p", { className: "muted", children: "Loading\u2026" });
    const run = async (fn, args, ok) => {
        setBusy(true);
        try {
            const { error } = await sb.rpc(fn, args);
            if (error)
                throw new Error(/Could not find the function/.test(error.message) ? 'Run 086_dist_locations.sql in Supabase first' : error.message);
            flash(ok);
            setEd(null);
            await load();
            onChanged();
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
        finally {
            setBusy(false);
        }
    };
    const here = locs.filter(l => l.site === site && (showRetired || l.active !== false));
    const retired = locs.filter(l => l.site === site && l.active === false).length;
    const next = (kind) => {
        const nums = locs.filter(l => l.site === site && l.kind === kind).map(l => (kind === 'trailer' ? l.number - 100 : l.number));
        return String(nums.length ? Math.max(...nums) + 1 : 1);
    };
    const startAdd = (kind) => setEd({ at: kind, id: null, site, kind, number: next(kind), rows: kind === 'trailer' ? '13' : '9', status: 'On', notes: '' });
    const save = () => ed && run('loc_freezer_save', { p: { id: ed.id, site: ed.site, kind: ed.kind, number: Number(ed.number), rows: Number(ed.rows), status: ed.status, notes: ed.notes } }, `${ed.kind === 'trailer' ? 'Reefer' : 'Freezer'} ${ed.number} saved`);
    const group = (kind, title) => {
        const rows = here.filter(l => l.kind === kind);
        return (_jsxs("section", { className: "dcard", children: [_jsxs("div", { className: "dcard-h", children: [_jsxs("h3", { children: [title, " ", _jsx("span", { className: "muted", children: rows.length })] }), edit && _jsxs("button", { className: "ghost small", disabled: busy, onClick: () => startAdd(kind), children: ["+ Add ", kind === 'trailer' ? 'reefer' : 'freezer'] })] }), ed && ed.at === kind && _jsxs("section", { className: "dcard locedit", ref: formRef, children: [_jsxs("div", { className: "dcard-h", children: [_jsxs("h3", { children: [ed.id ? 'Change' : 'Add', " ", ed.kind === 'trailer' ? 'reefer' : 'freezer', " at ", ed.site] }), _jsx("button", { className: "linkbtn", onClick: () => setEd(null), children: "Cancel" })] }), _jsxs("div", { className: "locform", children: [_jsxs("label", { children: [_jsx("span", { children: "Type" }), _jsxs("select", { value: ed.kind, onChange: e => setEd({ ...ed, kind: e.target.value }), children: [_jsx("option", { value: "freezer", children: "Freezer" }), _jsx("option", { value: "trailer", children: "Reefer trailer" })] })] }), _jsxs("label", { children: [_jsx("span", { children: "Number" }), _jsx("input", { inputMode: "numeric", value: ed.number, onChange: e => setEd({ ...ed, number: e.target.value.replace(/\D/g, '') }) })] }), _jsxs("label", { children: [_jsx("span", { children: "Spots deep (each column)" }), _jsx("input", { inputMode: "numeric", value: ed.rows, onChange: e => setEd({ ...ed, rows: e.target.value.replace(/\D/g, '') }) })] }), _jsxs("label", { children: [_jsx("span", { children: "Site" }), _jsxs("select", { value: ed.site, onChange: e => setEd({ ...ed, site: e.target.value }), children: [_jsx("option", { children: "OHR" }), _jsx("option", { children: "GVR" })] })] }), _jsxs("label", { children: [_jsx("span", { children: "Status" }), _jsx("select", { value: ed.status, onChange: e => setEd({ ...ed, status: e.target.value }), children: STATUS.map(s => _jsx("option", { children: s }, s)) })] }), _jsxs("label", { className: "wide", children: [_jsx("span", { children: "Notes" }), _jsx("input", { value: ed.notes, onChange: e => setEd({ ...ed, notes: e.target.value }), placeholder: "Optional" })] })] }), _jsxs("p", { className: "muted small", children: ["Two columns, ", Number(ed.rows) || 0, " spots deep = ", 2 * (Number(ed.rows) || 0), " spots (up to 13 deep). Spot names follow the number, like ", ed.kind === 'trailer' ? `R${ed.number || 1}A` : `${ed.number || 1}A`, "."] }), _jsx("div", { className: "row", children: _jsx("button", { className: "primary", disabled: busy || !Number(ed.number) || !Number(ed.rows), onClick: save, children: "Save" }) })] }), rows.length ? _jsx("div", { className: "dlist", children: rows.map(l => (_jsxs("div", { className: `drow${l.active === false ? ' locoff' : ''}`, children: [_jsxs("span", { className: "grow", children: [_jsx("b", { children: label(l) }), " ", _jsxs("span", { className: "muted", children: [l.rows ? `2 × ${l.rows} spots` : 'no spots', l.status !== 'On' ? ` · ${l.status}` : '', l.notes ? ` · ${l.notes}` : '', l.active === false ? ' · retired' : ''] })] }), edit && l.active !== false && _jsx("button", { className: "ghost small", disabled: busy, onClick: () => setEd({ at: l.kind, id: l.id, site: l.site, kind: l.kind, number: String(l.kind === 'trailer' ? l.number - 100 : l.number), rows: String(l.rows || 9), status: l.status, notes: l.notes ?? '' }), children: "Edit" }), edit && (l.active === false
                                ? _jsx("button", { className: "ghost small", disabled: busy, onClick: () => run('loc_freezer_active', { p_id: l.id, p_active: true }, `${label(l)} is back on the map`), children: "Bring back" })
                                : _jsx("button", { className: "ghost small", disabled: busy, onClick: () => window.confirm(`Retire ${label(l)}? It comes off the map; its history stays.`) && run('loc_freezer_active', { p_id: l.id, p_active: false }, `${label(l)} retired`), children: "Retire" })), edit && _jsx("button", { className: "ghost small", disabled: busy, title: "Only if nothing was ever in it", onClick: () => window.confirm(`Delete ${label(l)} for good? Only works if nothing was ever in it.`) && run('loc_freezer_delete', { p_id: l.id }, `${label(l)} deleted`), children: "\u2715" })] }, l.id))) }) : _jsxs("p", { className: "muted", children: ["None at ", site, "."] })] }));
    };
    return (_jsxs("div", { className: "locset", children: [_jsxs("div", { className: "row wrap between", children: [_jsx("div", { className: "seg", children: ['OHR', 'GVR'].map(s => _jsx("button", { className: site === s ? 'on' : '', onClick: () => { setSite(s); setEd(null); }, children: s }, s)) }), retired > 0 && _jsxs("label", { className: "check small-check", children: [_jsx("input", { type: "checkbox", checked: showRetired, onChange: e => setShowRetired(e.target.checked) }), " Show retired (", retired, ")"] })] }), !edit && _jsx("p", { className: "muted small", children: "Only a Distribution Admin can change these." }), group('freezer', 'Freezers'), group('trailer', 'Reefer trailers'), _jsx("p", { className: "muted small", children: "Retired ones come off the freezer map but keep their history. Delete only works on one added by mistake (nothing was ever in it)." })] }));
}
