import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Select } from '../combo';
import { useState } from 'react';
import { lang, t } from '../i18n';
export function Sheet({ title, sub, onClose, children, wide, side }) {
    return (_jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: `sheet form ${wide ? 'wide' : ''} ${side ? 'side' : ''} csheet`, onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsxs("div", { children: [_jsx("h2", { children: title }), sub && _jsx("div", { className: "muted", children: sub })] }), _jsx("button", { className: "ghost", onClick: onClose, children: "\u2715" })] }), children] }) }));
}
export function F({ label, hint, children, half }) {
    return _jsxs("div", { className: `field ${half ? 'half' : ''}`, children: [_jsxs("label", { children: [label, hint && _jsxs("span", { className: "muted", children: [" ", hint] })] }), children] });
}
const toNum = (s) => (s.trim() === '' ? null : Number(s.replace(/,/g, '')));
/** number input that keeps what's typed until it's a number */
export function NumIn({ value, onChange, placeholder, step, autoFocus }) {
    const [text, setText] = useState(null);
    const shown = text ?? (value == null ? '' : String(value));
    return _jsx("input", { inputMode: "decimal", value: shown, placeholder: placeholder, step: step, autoFocus: autoFocus, onChange: e => { setText(e.target.value); const n = toNum(e.target.value); if (n === null || isFinite(n))
            onChange(n); }, onBlur: () => setText(null) });
}
export function DateIn({ value, onChange }) {
    return _jsx("input", { type: "date", value: value ?? '', onChange: e => onChange(e.target.value || null) });
}
export function TextIn({ value, onChange, placeholder, list, autoFocus }) {
    if (list)
        return _jsx(Combo, { value: value, onChange: onChange, placeholder: placeholder, list: list, autoFocus: autoFocus });
    return _jsx("input", { value: value ?? '', placeholder: placeholder, autoFocus: autoFocus, onChange: e => onChange(e.target.value === '' ? null : e.target.value) });
}
/** a text box with a real drop-down: the choices come from the <datalist id={list}> on the page (shown on focus, filtered as you type).
 *  Browsers' own datalist pop-ups are easy to miss, so this draws its own. */
function Combo({ value, onChange, placeholder, list, autoFocus }) {
    const [open, setOpen] = useState(false);
    const [hi, setHi] = useState(0);
    const [opts, setOpts] = useState([]);
    const load = () => {
        const el = document.getElementById(list);
        setOpts(el ? [...el.options].map(o => o.value).filter(Boolean) : []);
    };
    const q = (value ?? '').trim().toLowerCase();
    const exact = opts.some(o => o.toLowerCase() === q);
    const shown = (q && !exact ? opts.filter(o => o.toLowerCase().includes(q)).sort((a, b) => Number(!a.toLowerCase().startsWith(q)) - Number(!b.toLowerCase().startsWith(q))) : opts).slice(0, 60);
    const pick = (v) => { onChange(v); setOpen(false); };
    return (_jsxs("span", { className: "combo", children: [_jsx("input", { value: value ?? '', placeholder: placeholder ?? 'Pick or type', autoFocus: autoFocus, autoComplete: "off", role: "combobox", "aria-expanded": open, onFocus: () => { load(); setOpen(true); setHi(0); }, onBlur: () => setTimeout(() => setOpen(false), 150), onChange: e => { onChange(e.target.value === '' ? null : e.target.value); if (!open)
                    load(); setOpen(true); setHi(0); }, onKeyDown: e => {
                    if (!open || !shown.length)
                        return;
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setHi(i => Math.min(i + 1, shown.length - 1));
                    }
                    else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setHi(i => Math.max(i - 1, 0));
                    }
                    else if (e.key === 'Enter' && shown[hi]) {
                        e.preventDefault();
                        pick(shown[hi]);
                    }
                    else if (e.key === 'Escape')
                        setOpen(false);
                } }), _jsx("button", { type: "button", className: "combo-arrow", tabIndex: -1, "aria-label": "Show choices", onMouseDown: e => { e.preventDefault(); load(); setOpen(o => !o); }, children: "\u25BE" }), open && shown.length > 0 && _jsx("ul", { className: "combo-list", role: "listbox", children: shown.map((o, i) => _jsx("li", { role: "option", "aria-selected": i === hi, className: i === hi ? 'hi' : '', onMouseDown: e => { e.preventDefault(); pick(o); }, children: o }, o)) })] }));
}
export function Pick({ value, options, onChange, blank }) {
    return (_jsxs(Select, { value: value == null ? '' : String(value), onChange: e => {
            const o = options.find(x => String(x.v) === e.target.value);
            onChange(o ? o.v : null);
        }, children: [blank !== undefined && _jsx("option", { value: "", children: blank }), options.map(o => _jsx("option", { value: String(o.v), children: o.l }, String(o.v)))] }));
}
export function Choices({ value, options, onChange }) {
    return _jsx("div", { className: "choices", children: options.map(o => _jsx("button", { type: "button", className: value === o.v ? 'on' : '', onClick: () => onChange(o.v), children: o.l }, o.v)) });
}
/** strain names to pick from (any text is fine, it gets matched to the Strains list when saved) */
export function StrainList({ id, names }) {
    return _jsx("datalist", { id: id, children: names.map(n => _jsx("option", { value: n }, n)) });
}
export function SaveBar({ busy, onSave, onCancel, onDelete, saveLabel, disabled }) {
    const [sure, setSure] = useState(false);
    return (_jsxs("div", { className: "row between csave", children: [onDelete ? (sure
                ? _jsxs("span", { className: "row", children: [_jsx("button", { className: "ghost danger", disabled: busy, onClick: onDelete, children: t('Yes, delete') }), _jsx("button", { className: "ghost small", onClick: () => setSure(false), children: t('Keep') })] })
                : _jsx("button", { className: "ghost", disabled: busy, onClick: () => setSure(true), children: t('Delete') })) : _jsx("span", {}), _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost", onClick: onCancel, children: t('Cancel') }), _jsx("button", { className: "primary", disabled: busy || disabled, onClick: onSave, children: busy ? t('Saving…') : saveLabel ?? t('Save') })] })] }));
}
export function Kpis({ items }) {
    return _jsx("div", { className: "ckpis", children: items.map(([v, l], i) => _jsxs("div", { children: [_jsx("b", { children: v }), _jsx("span", { children: l })] }, i)) });
}
export function useSel() {
    const [on, setOn] = useState(false);
    const [ids, setIds] = useState(new Set());
    return {
        on, ids,
        start: () => setOn(true),
        stop: () => { setOn(false); setIds(new Set()); },
        toggle: id => setIds(s => { const n = new Set(s); if (n.has(id))
            n.delete(id);
        else
            n.add(id); return n; }),
        setAll: (list, v) => setIds(s => { const n = new Set(s); for (const id of list) {
            if (v)
                n.add(id);
            else
                n.delete(id);
        } return n; }),
    };
}
/** checkbox header cell: ticks every row shown */
export function SelAll({ sel, ids }) {
    if (!sel.on)
        return null;
    const all = ids.length > 0 && ids.every(id => sel.ids.has(id));
    return _jsx("th", { className: "selcol", children: _jsx("input", { type: "checkbox", checked: all, onChange: () => sel.setAll(ids, !all) }) });
}
export function SelBox({ sel, id }) {
    if (!sel.on)
        return null;
    return _jsx("td", { className: "selcol", onClick: e => e.stopPropagation(), children: id != null && _jsx("input", { type: "checkbox", checked: sel.ids.has(id), onChange: () => sel.toggle(id) }) });
}
export function SelButton({ sel, label }) {
    return sel.on ? _jsx("button", { className: "ghost small", onClick: sel.stop, children: t('Done selecting') }) : _jsx("button", { className: "ghost small", onClick: sel.start, children: label ?? t('Select') });
}
/** bar that sticks to the bottom while rows are picked */
export function SelBar({ sel, noun, actions }) {
    const [sure, setSure] = useState(null);
    const [busy, setBusy] = useState(false);
    if (!sel.on || !sel.ids.size)
        return null;
    const ids = [...sel.ids];
    const go = async (a) => {
        if (a.danger && sure !== a.label) {
            setSure(a.label);
            return;
        }
        setBusy(true);
        try {
            await a.run(ids);
            sel.stop();
        }
        finally {
            setBusy(false);
            setSure(null);
        }
    };
    return (_jsxs("div", { className: "selbar", children: [_jsx("b", { children: lang() === 'es' ? t('{n} picked', { n: ids.length }) : `${ids.length} ${noun}${ids.length === 1 ? '' : 's'} picked` }), _jsxs("div", { className: "row", children: [actions.map(a => _jsx("button", { disabled: busy, className: a.danger ? (sure === a.label ? 'primary dangerbg' : 'ghost danger') : 'ghost', onClick: () => go(a), children: a.danger && sure === a.label ? `Yes, ${a.label.toLowerCase()} ${ids.length}` : a.label }, a.label)), _jsx("button", { className: "ghost", onClick: sel.stop, children: t('Cancel') })] })] }));
}
export const errText = (e) => String(e?.message ?? e);
