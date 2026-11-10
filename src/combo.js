import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Type-to-search pickers used everywhere instead of the browser's plain drop-downs.
//  <Select>    drop-in for <select>: same value / onChange(e.target.value) / <option> / <optgroup> children.
//              Short lists (7 or fewer) stay a normal drop-down; longer ones become a box you can type in.
//  <ListInput> drop-in for <input list="id">: free text with a real suggestion list from the <datalist>.
import { Children, Fragment, isValidElement, useMemo, useRef, useState } from 'react';
const text = (n) => {
    if (n == null || typeof n === 'boolean')
        return '';
    if (typeof n === 'string' || typeof n === 'number')
        return String(n);
    if (Array.isArray(n))
        return n.map(text).join('');
    if (isValidElement(n))
        return text(n.props.children);
    return '';
};
function collect(children, group, out = []) {
    Children.forEach(children, c => {
        if (!isValidElement(c))
            return;
        const p = c.props;
        if (c.type === Fragment)
            collect(p.children, group, out);
        else if (c.type === 'optgroup')
            collect(p.children, p.label, out);
        else if (c.type === 'option') {
            const label = text(p.children);
            out.push({ value: p.value != null ? String(p.value) : label, label: label || String(p.value ?? ''), group, disabled: p.disabled });
        }
    });
    return out;
}
const rank = (q) => (o) => {
    const l = o.label.toLowerCase();
    return l.startsWith(q) ? 0 : l.split(/[\s(·/-]+/).some(w => w.startsWith(q)) ? 1 : 2;
};
function useList(opts, q) {
    return useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s)
            return opts;
        const r = rank(s);
        return opts.filter(o => o.label.toLowerCase().includes(s) || o.value.toLowerCase().includes(s))
            .map((o, i) => ({ o, i, k: r(o) })).sort((a, b) => a.k - b.k || a.i - b.i).map(x => x.o);
    }, [opts, q]);
}
function Menu({ shown, hi, setHi, pick, current, empty }) {
    return (_jsxs("ul", { className: "combo-list sel-list", role: "listbox", children: [shown.length === 0 && _jsx("li", { className: "none muted", children: empty ?? 'No match' }), shown.map((o, i) => (_jsxs("li", { role: "option", "aria-selected": o.value === current, className: `${i === hi ? 'hi' : ''} ${o.value === current ? 'cur' : ''} ${o.disabled ? 'dis' : ''}`, onMouseEnter: () => setHi(i), onMouseDown: e => { e.preventDefault(); if (!o.disabled)
                    pick(o); }, children: [o.group && (i === 0 || shown[i - 1].group !== o.group) && _jsx("div", { className: "sel-group", children: o.group }), _jsx("div", { className: "sel-opt", children: o.label })] }, `${o.group ?? ''}|${o.value}|${i}`)))] }));
}
/** drop-in for <select>: type to filter when the list is long */
export function Select(props) {
    const { value, onChange, disabled, className, style, children, ...rest } = props;
    const opts = useMemo(() => collect(children), [children]);
    const real = opts.filter(o => o.value !== '');
    if (real.length <= 7) {
        return _jsx("select", { value: value == null ? '' : value, onChange: e => onChange?.({ target: { value: e.target.value } }), disabled: disabled, className: className, style: style, ...rest, children: children });
    }
    return _jsx(SearchSelect, { ...props, opts: opts });
}
function SearchSelect({ value, onChange, disabled, className, style, opts, title, id, name, autoFocus, ...rest }) {
    const cur = value == null ? '' : String(value);
    const blank = opts.find(o => o.value === '');
    const sel = opts.find(o => o.value === cur && o.value !== '');
    const [q, setQ] = useState(null); // null = not typing: show the chosen one
    const [open, setOpen] = useState(false);
    const [hi, setHi] = useState(0);
    const ref = useRef(null);
    const shown = useList(opts.filter(o => o.value !== '' || !q), q ?? '');
    const pick = (o) => { setQ(null); setOpen(false); if (o.value !== cur)
        onChange?.({ target: { value: o.value } }); ref.current?.blur(); };
    const start = () => { if (disabled)
        return; setOpen(true); setHi(Math.max(0, shown.findIndex(o => o.value === cur))); };
    return (_jsxs("span", { className: `combo sel ${className ?? ''}`, style: style, children: [_jsx("input", { ref: ref, value: q ?? sel?.label ?? '', placeholder: blank?.label || 'Type to search', disabled: disabled, title: title, id: id, name: name, autoFocus: autoFocus, "aria-label": rest['aria-label'], autoComplete: "off", role: "combobox", "aria-expanded": open, onFocus: e => { start(); e.target.select(); }, onClick: start, onBlur: () => setTimeout(() => { setOpen(false); setQ(null); }, 150), onChange: e => { setQ(e.target.value); setOpen(true); setHi(0); }, onKeyDown: e => {
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        if (!open)
                            start();
                        else
                            setHi(i => Math.min(i + 1, shown.length - 1));
                    }
                    else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setHi(i => Math.max(i - 1, 0));
                    }
                    else if (e.key === 'Enter') {
                        e.preventDefault();
                        if (open && shown[hi])
                            pick(shown[hi]);
                    }
                    else if (e.key === 'Escape') {
                        setOpen(false);
                        setQ(null);
                    }
                    else if (e.key === 'Tab' && open && q && shown[hi])
                        pick(shown[hi]);
                } }), _jsx("button", { type: "button", className: "combo-arrow", tabIndex: -1, "aria-label": "Show choices", disabled: disabled, onMouseDown: e => { e.preventDefault(); if (open)
                    setOpen(false);
                else {
                    ref.current?.focus();
                } }, children: "\u25BE" }), open && _jsx(Menu, { shown: shown, hi: hi, setHi: setHi, pick: pick, current: cur, empty: q ? `No match for "${q.trim()}"` : 'Nothing to pick' })] }));
}
/** drop-in for <input list="...">: any text is fine, the datalist's options show as suggestions while typing */
export function ListInput({ list, value, onChange, className, style, disabled, ...rest }) {
    const [open, setOpen] = useState(false);
    const [hi, setHi] = useState(0);
    const [opts, setOpts] = useState([]);
    const ref = useRef(null);
    const q = value == null ? '' : String(value);
    const exact = opts.some(o => o.value.toLowerCase() === q.trim().toLowerCase());
    const shown = useList(opts, exact ? '' : q).slice(0, 80);
    if (!list)
        return _jsx("input", { value: value, onChange: onChange, className: className, style: style, disabled: disabled, ...rest });
    const load = () => {
        const el = document.getElementById(list);
        setOpts(el ? [...el.options].filter(o => o.value).map(o => ({ value: o.value, label: o.label && o.label !== o.value ? `${o.value} · ${o.label}` : o.value })) : []);
    };
    const set = (v) => onChange?.({ target: { value: v }, currentTarget: { value: v } });
    const pick = (o) => { set(o.value); setOpen(false); };
    return (_jsxs("span", { className: "combo", style: style, children: [_jsx("input", { ref: ref, value: value, className: className, disabled: disabled, autoComplete: "off", role: "combobox", "aria-expanded": open, ...rest, onFocus: e => { load(); setOpen(true); setHi(0); rest.onFocus?.(e); }, onClick: () => { load(); setOpen(true); }, onBlur: e => { setTimeout(() => setOpen(false), 150); rest.onBlur?.(e); }, onChange: e => { onChange?.(e); if (!open)
                    load(); setOpen(true); setHi(0); }, onKeyDown: e => {
                    if (open && shown.length) {
                        if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setHi(i => Math.min(i + 1, shown.length - 1));
                            return;
                        }
                        if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setHi(i => Math.max(i - 1, 0));
                            return;
                        }
                        if (e.key === 'Enter' && !exact) {
                            e.preventDefault();
                            pick(shown[hi]);
                            return;
                        }
                        if (e.key === 'Escape') {
                            setOpen(false);
                            return;
                        }
                    }
                    rest.onKeyDown?.(e);
                } }), _jsx("button", { type: "button", className: "combo-arrow", tabIndex: -1, "aria-label": "Show suggestions", disabled: disabled, onMouseDown: e => { e.preventDefault(); if (open)
                    setOpen(false);
                else {
                    load();
                    setOpen(true);
                    ref.current?.focus();
                } }, children: "\u25BE" }), open && shown.length > 0 && _jsx(Menu, { shown: shown, hi: hi, setHi: setHi, pick: pick, current: q })] }));
}
