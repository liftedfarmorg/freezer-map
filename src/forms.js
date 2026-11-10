import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { tagTxt } from './mtag';
import { TextIn } from './cult/ui';
import { useEffect, useMemo, useState } from 'react';
import { metrcWeight } from './comp/metrcweight';
import { TagInput } from './taginput';
import { ScanButton } from './scan';
import { MetrcNote, WEIGHT_REASONS, defaultReason } from './metrc';
// Small shared pieces for the action dialogs (split, merge, tag, weight).
const PL = (p) => ({ wet: 'Wet', unbucked: 'Unbucked', bucked: 'Bucked', bucked_standards: 'Bucked Standards', standards: 'Standards', smalls: 'Smalls', trim: 'Trim' }[p.product ?? ''] ?? '');
export const lbs = (n) => n == null ? '' : `${(Math.round(n * 100) / 100).toLocaleString()} lbs`;
export function Dialog({ title, children, onClose }) {
    return (_jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: "sheet form", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsx("h2", { children: title }), _jsx("button", { className: "ghost", onClick: onClose, children: "\u2715" })] }), children] }) }));
}
function TagField({ tag, setTag, pending, setPending, label = 'New METRC tag', pallet, slot, keep }) {
    return (_jsxs("div", { className: "field", children: [_jsx("label", { children: label }), _jsx(TagInput, { value: tag, onChange: setTag, where: { pallet, slot }, keep: keep, disabled: pending, autofill: !!setPending && !pending }), setPending && _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: !!pending, onChange: e => setPending(e.target.checked) }), " Tag pending, I'll add it later"] })] }));
}
function DestField({ dest, setDest, sameLabel, loadLabel }) {
    return (_jsxs("div", { className: "field", children: [_jsx("label", { children: "Where does it go?" }), _jsxs("div", { className: "choices", children: [loadLabel && _jsx("button", { className: dest === 'load' ? 'on' : '', onClick: () => setDest('load'), children: loadLabel }), sameLabel && _jsx("button", { className: dest === 'same' ? 'on' : '', onClick: () => setDest('same'), children: sameLabel }), _jsx("button", { className: dest === 'other' ? 'on' : '', onClick: () => setDest('other'), children: "Pick a slot" })] }), dest === 'other' && _jsx("div", { className: "muted", children: "After you tap the button below, tap the slot on the freezer map." })] }));
}
export function SplitForm({ p, where, busy, onClose, onSubmit, onLoad }) {
    const [amt, setAmt] = useState('');
    const [tag, setTag] = useState('');
    const [pending, setPending] = useState(false);
    const [dest, setDest] = useState(onLoad ? 'load' : where ? 'same' : 'other');
    const [note, setNote] = useState('');
    const n = parseFloat(amt);
    const w = p.current_weight ?? 0;
    const ok = n > 0 && n < w && (pending || tag.trim().length > 0);
    return (_jsxs(Dialog, { title: `Split ${p.code}`, onClose: onClose, children: [_jsxs("p", { className: "muted", children: [p.strain, " \u00B7 ", lbs(w), " now. The part you split off becomes a new pallet with its own number and METRC tag. ", p.code, " keeps the rest."] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Lbs to split off" }), _jsx("input", { type: "number", inputMode: "decimal", min: "0", step: "0.01", value: amt, onChange: e => setAmt(e.target.value), autoFocus: true }), amt && _jsx("div", { className: n > 0 && n < w ? 'muted' : 'warn-t', children: n > 0 && n < w ? `New pallet ${lbs(n)} · ${p.code} keeps ${lbs(w - n)}` : `Must be more than 0 and less than ${lbs(w)}` })] }), _jsx(TagField, { tag: tag, setTag: setTag, pending: pending, setPending: setPending, pallet: p.id }), _jsx(DestField, { dest: dest, setDest: setDest, sameLabel: where && p.status !== 'in_transit' ? `Same slot (${where})${onLoad ? ', off the load' : ''}` : null, loadLabel: onLoad ? `Stays on ${onLoad}` : null }), onLoad && dest !== 'load' && _jsxs("div", { className: "muted small", children: ["The piece comes off the load", p.status === 'in_transit' ? ' and the truck' : '', ". If ", p.code, " is held for an order, that line gets lighter."] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Note (optional)" }), _jsx("input", { value: note, onChange: e => setNote(e.target.value), placeholder: "e.g. pulled for Acquamarcia order" })] }), _jsx(MetrcNote, { kind: "split", p: p }), _jsxs("div", { className: "row end", children: [_jsx("button", { className: "ghost", onClick: onClose, children: "Cancel" }), _jsx("button", { className: "primary", disabled: !ok || busy, onClick: () => onSubmit(n, pending ? null : tag, pending, dest, note), children: "Split" })] })] }));
}
/** One button for split (part of it) and repackage (all of it): in METRC both are a new package from the package. */
export function NewPackageForm({ p, where, busy, onClose, onSubmit, onLoad, loadItems, loadMetrcItem }) {
    const w = p.current_weight ?? 0;
    const [whole, setWhole] = useState(false);
    const [amt, setAmt] = useState('');
    const [tag, setTag] = useState('');
    const [pending, setPending] = useState(false);
    const [dest, setDest] = useState(onLoad ? 'load' : where ? 'same' : 'other');
    const [note, setNote] = useState('');
    const [items, setItems] = useState(null);
    const [itemId, setItemId] = useState(null);
    const [metrcItem, setMetrcItem] = useState(null);
    useEffect(() => { let on = true; loadMetrcItem?.().then(x => { if (on)
        setMetrcItem(x); }).catch(() => { }); return () => { on = false; }; }, [p.id]);
    useEffect(() => { let on = true; loadItems().then(x => { if (on)
        setItems(x); }).catch(() => { if (on)
        setItems([]); }); return () => { on = false; }; }, [p.id]);
    const cur = items?.find(i => i.current);
    const others = (items ?? []).filter(i => !i.current);
    const n = whole ? w : parseFloat(amt);
    const canWhole = !!p.package_tag && (p.status === 'in_freezer' || p.status === 'unslotted') && !onLoad;
    const okAmt = whole ? w > 0 : n > 0 && n < w;
    const ok = okAmt && (whole ? tag.trim().length > 0 : (pending || tag.trim().length > 0));
    const picked = items?.find(i => i.id === itemId);
    return (_jsxs(Dialog, { title: `New package from ${p.code}`, onClose: onClose, children: [_jsxs("p", { className: "muted", children: [p.strain, PL(p) ? ` ${PL(p)}` : '', " \u00B7 ", lbs(w), " now", p.package_tag ? ` · tag ${tagTxt(p.package_tag)}` : ''] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "How much goes in the new package?" }), _jsxs("div", { className: "choices", children: [_jsx("button", { className: !whole ? 'on' : '', onClick: () => { if (whole)
                                    setTag(''); setWhole(false); }, children: "Part of it (split)" }), _jsx("button", { className: whole ? 'on' : '', disabled: !canWhole, onClick: () => { if (!whole)
                                    setTag(''); setWhole(true); setPending(false); }, children: "All of it (repackage)" })] }), !canWhole && _jsx("div", { className: "muted small", children: !p.package_tag ? 'All of it needs the current METRC tag first.' : onLoad ? 'All of it: take it off the load first.' : `All of it: only from a freezer or unslotted (${p.status.replace('_', ' ')}).` })] }), !whole && _jsxs("div", { className: "field", children: [_jsx("label", { children: "Lbs for the new package" }), _jsx("input", { type: "number", inputMode: "decimal", min: "0", step: "0.01", value: amt, onChange: e => setAmt(e.target.value), autoFocus: true }), amt && _jsx("div", { className: n > 0 && n < w ? 'muted' : 'warn-t', children: n > 0 && n < w ? `New pallet ${lbs(n)} · ${p.code} keeps ${lbs(w - n)}` : `Must be more than 0 and less than ${lbs(w)}. For all of it, pick All of it.` })] }), whole && _jsxs("div", { className: "muted", children: [p.code, " keeps its number, spot and history. Only the tag", itemId ? ' and item' : '', " change. All ", lbs(w), " goes on the new tag."] }), whole ? _jsx(TagField, { tag: tag, setTag: setTag, pallet: p.id, label: "New METRC tag (type the last digits of the label you're putting on)" }) : _jsx(TagField, { tag: tag, setTag: setTag, pending: pending, setPending: setPending, pallet: p.id }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Item" }), _jsxs("select", { style: { width: '100%', maxWidth: '100%' }, value: itemId ?? '', onChange: e => setItemId(e.target.value ? Number(e.target.value) : null), disabled: items == null, children: [_jsx("option", { value: "", children: items == null ? 'Loading…' : `Same item${cur ? ` (${cur.metrc_name})` : ''}` }), others.map(i => _jsx("option", { value: i.id, children: i.metrc_name }, i.id))] }), picked && _jsxs("div", { className: "muted small", children: ["The new package goes on ", picked.metrc_name, ". METRC needs that item on this license."] }), !picked && cur && metrcItem && metrcItem.toLowerCase() !== cur.metrc_name.toLowerCase() && _jsxs("div", { className: "warn-t small", children: ["METRC has ", tagTxt(p.package_tag), " as ", metrcItem, ". Same item means the app's item: the new package goes on ", cur.metrc_name, ". METRC needs that item on this license."] })] }), !whole && _jsx(DestField, { dest: dest, setDest: setDest, sameLabel: where && p.status !== 'in_transit' ? `Same slot (${where})${onLoad ? ', off the load' : ''}` : null, loadLabel: onLoad ? `Stays on ${onLoad}` : null }), !whole && onLoad && dest !== 'load' && _jsxs("div", { className: "muted small", children: ["The piece comes off the load", p.status === 'in_transit' ? ' and the truck' : '', ". If ", p.code, " is held for an order, that line gets lighter."] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Note (optional)" }), _jsx("input", { value: note, onChange: e => setNote(e.target.value), placeholder: whole ? 'e.g. label on the trim bin is 7194' : 'e.g. pulled for Acquamarcia order' })] }), _jsxs("div", { className: "metrc-note muted small", children: ["METRC: ", whole
                        ? `new package on the new tag from ${tagTxt(p.package_tag)}, all ${lbs(w)}, ${picked ? picked.metrc_name : 'same item'}. The old tag goes to 0 and is finished.`
                        : `new package split from ${tagTxt(p.package_tag)} with the new tag, ${picked ? picked.metrc_name : 'same item'}. ${p.code} keeps the rest under its tag.`] }), _jsxs("div", { className: "row end", children: [_jsx("button", { className: "ghost", onClick: onClose, children: "Cancel" }), _jsx("button", { className: "primary", disabled: !ok || busy, onClick: () => onSubmit(whole, n, (whole || !pending) ? tag : null, !whole && pending, dest, itemId, note), children: whole ? 'Repackage' : 'Split' })] })] }));
}
export function MergeForm({ p, candidates, whereOf, busy, onClose, onSubmit, onLoad }) {
    const [picked, setPicked] = useState(new Set());
    const [tag, setTag] = useState('');
    const [pending, setPending] = useState(false);
    const [dest, setDest] = useState(onLoad ? 'load' : p.slot_id != null ? 'same' : 'other');
    const [note, setNote] = useState('');
    const total = useMemo(() => (p.current_weight ?? 0) + candidates.filter(c => picked.has(c.id)).reduce((a, c) => a + (c.current_weight ?? 0), 0), [picked, candidates, p]);
    const toggle = (id) => setPicked(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const ok = picked.size > 0 && (pending || tag.trim().length > 0);
    return (_jsxs(Dialog, { title: `Merge ${p.code}`, onClose: onClose, children: [_jsxs("p", { className: "muted", children: ["Combine ", p.strain, p.product && p.product !== 'fresh_frozen' ? ` ${PL(p)}` : '', " pallets into one new C pallet with a new METRC tag. The originals are closed out and linked in history."] }), _jsxs("div", { className: "field", children: [_jsxs("label", { children: ["Merge with (", candidates.length, " other ", p.strain, p.product && p.product !== 'fresh_frozen' ? ` ${PL(p)}` : '', " pallets)"] }), _jsxs("div", { className: "picklist", children: [candidates.length === 0 && _jsxs("div", { className: "muted", children: ["No other ", p.strain, " pallets in inventory."] }), candidates.map(c => (_jsxs("label", { className: `pick ${picked.has(c.id) ? 'on' : ''}`, children: [_jsx("input", { type: "checkbox", checked: picked.has(c.id), onChange: () => toggle(c.id) }), _jsx("b", { children: c.code }), _jsx("span", { children: lbs(c.current_weight) }), _jsx("span", { className: "muted", children: whereOf(c) })] }, c.id)))] }), picked.size > 0 && _jsxs("div", { className: "muted", children: ["New pallet: ", picked.size + 1, " pallets \u00B7 ", lbs(total)] })] }), _jsx(TagField, { tag: tag, setTag: setTag, pending: pending, setPending: setPending, pallet: p.id }), onLoad ? _jsxs("div", { className: "field", children: [_jsx("label", { children: "Where does it go?" }), _jsxs("div", { className: "muted", children: [onLoad, " (on the truck if any of them is). Pallets from freezers get pulled onto it."] })] })
                : _jsx(DestField, { dest: dest, setDest: setDest, sameLabel: p.slot_id != null ? `${p.code}'s slot (${whereOf(p)})` : null }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Note (optional)" }), _jsx("input", { value: note, onChange: e => setNote(e.target.value) })] }), _jsx(MetrcNote, { kind: "merge", p: p, n: picked.size + 1 }), _jsxs("div", { className: "row end", children: [_jsx("button", { className: "ghost", onClick: onClose, children: "Cancel" }), _jsxs("button", { className: "primary", disabled: !ok || busy, onClick: () => onSubmit([p.id, ...picked], pending ? null : tag, pending, dest, note), children: ["Merge ", picked.size + 1, " pallets"] })] })] }));
}
export function TagForm({ p, busy, onClose, onSubmit }) {
    const [tag, setTag] = useState(p.package_tag ?? '');
    return (_jsxs(Dialog, { title: `METRC tag for ${p.code}`, onClose: onClose, children: [_jsx(TagField, { label: "Tag", tag: tag, setTag: setTag, pallet: p.id, keep: p.package_tag }), _jsx(MetrcNote, { kind: "tag", p: p }), _jsxs("div", { className: "row end", children: [_jsx("button", { className: "ghost", onClick: onClose, children: "Cancel" }), _jsx("button", { className: "primary", disabled: !tag.trim() || busy, onClick: () => onSubmit(tag), children: "Save tag" })] })] }));
}
export function WeightForm({ p, busy, onClose, onSubmit, canAppOnly, sb }) {
    const [w, setW] = useState(p.current_weight != null ? String(p.current_weight) : '');
    const [note, setNote] = useState('');
    const [reason, setReason] = useState(defaultReason(p));
    const [mode, setMode] = useState('both');
    // TEMPORARY (114): METRC's weight from the last pull, for "METRC only"
    const [mw, setMw] = useState(null);
    useEffect(() => { if (sb && canAppOnly && p.package_tag)
        metrcWeight(sb, p.id).then(setMw).catch(() => setMw(null)); }, [sb, canAppOnly, p.id, p.package_tag]);
    const metrcLbs = mw?.found ? (mw.lbs ?? mw.qty ?? null) : null;
    const pick = (m) => {
        setMode(m);
        if (m === 'metrc')
            setW(metrcLbs != null ? String(metrcLbs) : '');
        else
            setW(p.current_weight != null ? String(p.current_weight) : '');
    };
    const n = parseFloat(w);
    const base = mode === 'metrc' ? metrcLbs : p.current_weight;
    const diff = n >= 0 && base != null ? Math.round((n - base) * 100) / 100 : null;
    const appOnly = mode === 'app';
    return (_jsxs(Dialog, { title: `Adjust weight · ${p.code}`, onClose: onClose, children: [_jsxs("p", { className: "muted", children: ["App: ", lbs(p.current_weight) || 'unknown', p.package_tag && mw ? _jsxs(_Fragment, { children: [" \u00B7 METRC: ", mw.found ? lbs(metrcLbs) : 'not in the last pull'] }) : null, ". Use this for a reweigh or to fix a wrong number."] }), canAppOnly && _jsxs("div", { className: "field", children: [_jsx("label", { children: "Change" }), _jsxs("div", { className: "choices col", children: [_jsxs("button", { className: mode === 'both' ? 'on' : '', onClick: () => pick('both'), children: [_jsx("b", { children: "App and METRC" }), " ", _jsx("span", { className: "muted", children: "the normal way: the app changes and METRC follows" })] }), _jsxs("button", { className: mode === 'app' ? 'on' : '', onClick: () => pick('app'), children: [_jsx("b", { children: "App only" }), " ", _jsx("span", { className: "muted", children: "fix the app's number, nothing goes to METRC" })] }), p.package_tag && _jsxs("button", { className: mode === 'metrc' ? 'on' : '', onClick: () => pick('metrc'), children: [_jsx("b", { children: "METRC only" }), " ", _jsx("span", { className: "muted", children: "fix METRC's number, the app's weight stays" })] })] })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: mode === 'metrc' ? 'New METRC weight (lbs)' : 'New weight (lbs)' }), _jsx("input", { type: "number", inputMode: "decimal", min: "0", step: "0.01", value: w, autoFocus: true, onChange: e => setW(e.target.value) }), diff != null && diff !== 0 && _jsxs("div", { className: "muted", children: [diff > 0 ? '+' : '', lbs(diff), mode === 'metrc' ? ' in METRC' : ''] })] }), !appOnly && _jsxs("div", { className: "field", children: [_jsx("label", { children: mode === 'metrc' ? 'METRC reason' : 'Reason' }), _jsx("div", { className: "choices col", children: WEIGHT_REASONS.map(r => _jsxs("button", { className: reason === r.k ? 'on' : '', onClick: () => setReason(r.k), children: [_jsx("b", { children: r.l }), " ", _jsx("span", { className: "muted", children: r.hint })] }, r.k)) })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: appOnly ? 'Why (goes in the history)' : 'Note (optional)' }), _jsx("input", { value: note, onChange: e => setNote(e.target.value), placeholder: appOnly ? 'e.g. METRC already right after the 10/28 audit' : mode === 'metrc' ? 'e.g. match Farm Data (296.82)' : 'e.g. reweighed on scale 2' })] }), appOnly ? _jsxs("div", { className: "metrcnote", children: [_jsx("b", { children: "METRC" }), " Nothing. Only the app's weight changes. Use it when METRC is already right or you're fixing METRC by hand."] })
                : mode === 'metrc' ? _jsxs("div", { className: "metrcnote", children: [_jsx("b", { children: "METRC" }), " A to-do adjusts package ", p.package_tag, " to exactly ", n >= 0 ? lbs(n) : 'this weight', ". The app's weight stays ", lbs(p.current_weight) || 'as it is', "."] })
                    : _jsx(MetrcNote, { kind: "weight", p: p, reason: reason }), _jsxs("div", { className: "row end", children: [_jsx("button", { className: "ghost", onClick: onClose, children: "Cancel" }), _jsx("button", { className: "primary", disabled: !(n >= 0) || busy || (appOnly && !note.trim()) || (mode === 'metrc' && metrcLbs != null && Math.abs(n - metrcLbs) < 0.005), onClick: () => onSubmit(n, note, reason, mode), children: "Save" })] })] }));
}
// ---------- new pallet from an empty slot ----------
export function NewPalletChooser({ where, onClose, onPick }) {
    return (_jsxs(Dialog, { title: `New pallet in ${where}`, onClose: onClose, children: [_jsxs("button", { className: "bigchoice", onClick: () => onPick('mixed'), children: [_jsx("b", { children: "Mixed pallet (M)" }), _jsx("span", { className: "muted", children: "Stack packages from other pallets onto one pallet. Whole packages keep their METRC tag; partial amounts get split off with a new tag." })] }), _jsxs("button", { className: "bigchoice", onClick: () => onPick('merged'), children: [_jsx("b", { children: "Merged pallet (C)" }), _jsx("span", { className: "muted", children: "Combine partial pallets of the same strain into one new C pallet with a new METRC tag. The originals are closed out and linked in history." })] }), _jsxs("button", { className: "bigchoice", onClick: () => onPick('single'), children: [_jsx("b", { children: "Single pallet" }), _jsx("span", { className: "muted", children: "Enter one package by hand: product that's in the freezer but not in the app yet." })] })] }));
}
export function MixedBuilder({ title, target, candidates, initial, whereOf, busy, onClose, onSubmit, autoTags = [] }) {
    const [q, setQ] = useState('');
    const [lines, setLines] = useState((initial ?? []).map(p => ({ p, whole: true, lbs: '', tag: '', pending: false })));
    const [note, setNote] = useState('');
    const picked = new Set(lines.map(l => l.p.id));
    const results = q.trim().length < 1 ? [] : candidates
        .filter(c => !picked.has(c.id) && [c.code, c.strain, c.package_tag].some(v => v?.toLowerCase().includes(q.trim().toLowerCase())))
        .slice(0, 12);
    // next tag from the site's range that no other line is using
    const nextAuto = (ls) => autoTags.find(t => !ls.some(l => l.tag === t)) ?? '';
    const withAuto = (ls) => ls.map((l, i) => {
        if (l.whole && l.auto)
            return { ...l, tag: '', auto: false };
        if (!l.whole && !l.pending && !l.tag) {
            const t = nextAuto(ls.slice(0, i).concat(ls.slice(i + 1)));
            return t ? { ...l, tag: t, auto: true } : l;
        }
        return l;
    });
    const upd = (i, ch) => setLines(ls => withAuto(ls.map((l, j) => j === i ? { ...l, ...ch, ...('tag' in ch ? { auto: false } : {}) } : l)));
    const lineLbs = (l) => l.whole ? (l.p.current_weight ?? 0) : (parseFloat(l.lbs) || 0);
    const lineErr = (l) => {
        if (l.whole)
            return '';
        const n = parseFloat(l.lbs), w = l.p.current_weight ?? 0;
        if (!(n > 0))
            return 'Enter lbs';
        if (n >= w)
            return `That's the whole pallet (${lbs(w)}). Use Whole.`;
        if (!l.pending && !l.tag.trim())
            return 'New tag or pending';
        return '';
    };
    const total = lines.reduce((a, l) => a + lineLbs(l), 0);
    const ok = lines.length > 0 && lines.every(l => !lineErr(l));
    return (_jsxs(Dialog, { title: title, onClose: onClose, children: [_jsxs("p", { className: "muted", children: ["Going to ", target, ". Add each package: take the whole pallet (keeps its METRC tag) or enter lbs to split off (needs a new tag or pending)."] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Add a package" }), _jsxs("div", { className: "row tagrow", children: [_jsx("input", { className: "grow-in", value: q, onChange: e => setQ(e.target.value), placeholder: "Search strain, pallet # or tag", autoFocus: true }), _jsx(ScanButton, { onScan: setQ })] }), results.length > 0 && (_jsx("div", { className: "picklist", children: results.map(c => (_jsxs("button", { className: "pick addrow", onClick: () => { setLines(ls => withAuto([...ls, { p: c, whole: false, lbs: '', tag: '', pending: false }])); setQ(''); }, children: [_jsx("b", { children: c.code }), _jsx("span", { children: c.strain }), _jsxs("span", { className: "muted", children: [lbs(c.current_weight), " \u00B7 ", whereOf(c)] })] }, c.id))) }))] }), lines.map((l, i) => (_jsxs("div", { className: "mixline", children: [_jsxs("div", { className: "row between", children: [_jsxs("div", { children: [_jsx("b", { children: l.p.code }), " ", l.p.strain, " ", _jsxs("span", { className: "muted", children: ["\u00B7 has ", lbs(l.p.current_weight), " \u00B7 ", whereOf(l.p)] })] }), _jsx("button", { className: "ghost small", onClick: () => setLines(ls => ls.filter((_, j) => j !== i)), children: "\u2715" })] }), _jsxs("div", { className: "row", children: [_jsxs("div", { className: "choices", children: [_jsx("button", { className: !l.whole ? 'on' : '', onClick: () => upd(i, { whole: false }), children: "Part" }), _jsx("button", { className: l.whole ? 'on' : '', onClick: () => upd(i, { whole: true }), children: "Whole" })] }), !l.whole && _jsx("input", { className: "lbs-in", type: "number", inputMode: "decimal", placeholder: "lbs", value: l.lbs, onChange: e => upd(i, { lbs: e.target.value }) })] }), l.whole
                        ? _jsxs("div", { className: "muted", children: ["Keeps tag ", l.p.package_tag ?? '(none)'] })
                        : _jsxs("div", { className: "row", children: [_jsx(TagInput, { value: l.tag, onChange: t => upd(i, { tag: t }), where: { pallet: l.p.id }, disabled: l.pending, placeholder: "New METRC tag: last digits or scan" }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: l.pending, onChange: e => upd(i, { pending: e.target.checked, ...(e.target.checked && l.auto ? { tag: '' } : {}) }) }), " Pending"] })] }), !l.whole && l.auto && _jsxs("div", { className: "muted small-note", children: ["Next tag in the range (ends ", _jsx("b", { children: l.tag.slice(-6) }), "), filled in for you. Scan or type over it if you're using a different one."] }), lineErr(l) && _jsx("div", { className: "warn-t small-note", children: lineErr(l) })] }, l.p.id))), lines.length > 0 && _jsxs("div", { className: "muted", children: [lines.length, " package", lines.length > 1 ? 's' : '', " \u00B7 ", lbs(total)] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Note (optional)" }), _jsx("input", { value: note, onChange: e => setNote(e.target.value), placeholder: "e.g. Acquamarcia order" })] }), _jsxs("div", { className: "metrcnote", children: [_jsx("b", { children: "METRC" }), " Whole packages keep their tags: nothing to do in METRC. A partial amount is split into a new package with its own tag (it goes on the METRC to-do list)."] }), _jsxs("div", { className: "row end", children: [_jsx("button", { className: "ghost", onClick: onClose, children: "Cancel" }), _jsx("button", { className: "primary", disabled: !ok || busy, onClick: () => onSubmit(lines.map(l => l.whole
                            ? { pallet_id: l.p.id, lbs: null }
                            : { pallet_id: l.p.id, lbs: parseFloat(l.lbs), tag: l.pending ? null : l.tag.trim(), tag_pending: l.pending }), note), children: busy ? 'Saving…' : 'Save' })] })] }));
}
export function SingleForm({ where, slot, strains, busy, onClose, onSubmit, tag: scanned }) {
    const [code, setCode] = useState('');
    const [strain, setStrain] = useState('');
    const [w, setW] = useState('');
    const [tag, setTag] = useState(scanned ?? '');
    const [pending, setPending] = useState(false);
    const [hd, setHd] = useState('');
    const [note, setNote] = useState('');
    const known = strains.some(s => s.toLowerCase() === strain.trim().toLowerCase());
    const ok = strain.trim() && parseFloat(w) > 0 && (pending || tag.trim());
    return (_jsxs(Dialog, { title: `Single pallet in ${where}`, onClose: onClose, children: [_jsxs("div", { className: "field", children: [_jsxs("label", { children: ["Pallet # ", _jsx("span", { className: "muted", children: "(from the label; leave blank to auto-number S1, S2\u2026)" })] }), _jsx("input", { value: code, onChange: e => setCode(e.target.value.toUpperCase()), placeholder: "e.g. T011", autoFocus: true })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Strain" }), _jsx(TextIn, { list: "strain-list", value: strain, onChange: v => setStrain(v ?? ''), placeholder: "Start typing" }), _jsx("datalist", { id: "strain-list", children: strains.map(s => _jsx("option", { value: s }, s)) }), strain.trim() && !known && _jsx("div", { className: "warn-t small-note", children: "Not in the Strains list. Check the spelling, or add it in Settings." })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Weight (lbs)" }), _jsx("input", { type: "number", inputMode: "decimal", value: w, onChange: e => setW(e.target.value) })] }), _jsx(TagField, { label: "METRC tag", tag: tag, setTag: setTag, pending: pending, setPending: setPending, slot: slot }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Harvest date (optional)" }), _jsx("input", { type: "date", value: hd, onChange: e => setHd(e.target.value) })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Note (optional)" }), _jsx("input", { value: note, onChange: e => setNote(e.target.value), placeholder: "e.g. found during count" })] }), _jsxs("div", { className: "row end", children: [_jsx("button", { className: "ghost", onClick: onClose, children: "Cancel" }), _jsx("button", { className: "primary", disabled: !ok || busy, onClick: () => onSubmit({ code, strain: strain.trim(), lbs: parseFloat(w), tag: pending ? null : tag, tag_pending: pending, harvest_date: hd || null, note }), children: "Create" })] })] }));
}
export function PickMixed({ mixed, whereOf, onClose, onPick }) {
    return (_jsxs(Dialog, { title: "Pull for which mixed pallet?", onClose: onClose, children: [mixed.length === 0 && _jsx("p", { className: "muted", children: "No mixed pallets yet. Tap an empty slot on the map and choose New pallet, Mixed." }), _jsx("div", { className: "picklist", children: mixed.map(m => (_jsxs("button", { className: "pick addrow", onClick: () => onPick(m.p), children: [_jsx("b", { children: m.p.code }), _jsxs("span", { children: [m.n, " packages \u00B7 ", lbs(m.w)] }), _jsx("span", { className: "muted", children: whereOf(m.p) })] }, m.p.id))) })] }));
}
/** Merge started from an empty slot: pick a strain, check its partials, new tag, lands in this slot */
export function MergeHere({ where, slot, candidates, whereOf, busy, onClose, onSubmit }) {
    const [strain, setStrain] = useState('');
    const [picked, setPicked] = useState(new Set());
    const [tag, setTag] = useState('');
    const [pending, setPending] = useState(false);
    const [note, setNote] = useState('');
    const strains = [...new Set(candidates.map(c => c.strain))].sort();
    const list = candidates.filter(c => c.strain.toLowerCase() === strain.trim().toLowerCase())
        .sort((a, b) => (a.current_weight ?? 0) - (b.current_weight ?? 0));
    const toggle = (id) => setPicked(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const total = list.filter(c => picked.has(c.id)).reduce((a, c) => a + (c.current_weight ?? 0), 0);
    const ok = picked.size >= 2 && (pending || tag.trim().length > 0);
    return (_jsxs(Dialog, { title: `Merged pallet in ${where}`, onClose: onClose, children: [_jsxs("div", { className: "field", children: [_jsx("label", { children: "Strain" }), _jsx(TextIn, { list: "merge-strains", value: strain, onChange: v => { setStrain(v ?? ''); setPicked(new Set()); }, placeholder: "Start typing", autoFocus: true }), _jsx("datalist", { id: "merge-strains", children: strains.map(s => _jsx("option", { value: s }, s)) })] }), strain.trim() && (_jsxs("div", { className: "field", children: [_jsxs("label", { children: ["Pallets to combine (", list.length, " available, smallest first)"] }), _jsxs("div", { className: "picklist", children: [list.length === 0 && _jsxs("div", { className: "muted", style: { padding: 10 }, children: ["No ", strain, " pallets available."] }), list.map(c => (_jsxs("label", { className: `pick ${picked.has(c.id) ? 'on' : ''}`, children: [_jsx("input", { type: "checkbox", checked: picked.has(c.id), onChange: () => toggle(c.id) }), _jsx("b", { children: c.code }), _jsx("span", { children: lbs(c.current_weight) }), _jsx("span", { className: "muted", children: whereOf(c) })] }, c.id)))] }), picked.size > 0 && _jsxs("div", { className: "muted", children: [picked.size, " pallets \u00B7 ", lbs(total), picked.size < 2 ? ' · pick at least two' : ''] })] })), _jsx(TagField, { tag: tag, setTag: setTag, pending: pending, setPending: setPending, slot: slot }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Note (optional)" }), _jsx("input", { value: note, onChange: e => setNote(e.target.value) })] }), _jsxs("div", { className: "row end", children: [_jsx("button", { className: "ghost", onClick: onClose, children: "Cancel" }), _jsxs("button", { className: "primary", disabled: !ok || busy, onClick: () => onSubmit([...picked], pending ? null : tag, pending, note), children: ["Merge ", picked.size || '', " pallets"] })] })] }));
}
