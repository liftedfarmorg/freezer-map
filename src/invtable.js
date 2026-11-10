import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Select } from './combo';
// Inventory table shared by Distribution, Sales and Processing: one table, a preset view per module.
// Group by, filter chips, column picker, sort, totals, select for bulk actions, export to Excel (CSV).
import './cult/cult.css';
import { useMemo, useState } from 'react';
import { SelAll, SelBox, SelBar, SelButton, useSel } from './cult/ui';
const store = (k) => { try {
    return JSON.parse(localStorage.getItem(k) ?? 'null');
}
catch {
    return null;
} };
const save = (k, v) => { try {
    localStorage.setItem(k, JSON.stringify(v));
}
catch { /* private window */ } };
const n0 = (x) => Math.round(x).toLocaleString();
export function InvTable({ id, title, note, rows, rowId, cols, groups, defaultGroup, defaultSort, chips, text, lbs, onOpen, expand, totals, actions, noun = 'package', toolbar, rowClass, site, cards }) {
    const key = `fm.inv.${id}`;
    const saved = store(key);
    const [g, setG] = useState(saved?.g && (saved.g === 'none' || groups.some(x => x.k === saved.g)) ? saved.g : defaultGroup);
    const [hide, setHide] = useState(new Set(saved?.hide ?? []));
    const [show, setShow] = useState(new Set(saved?.show ?? []));
    const [sort, setSort] = useState(saved?.sort ?? (defaultSort ? [defaultSort, 1] : null));
    const [pick, setPick] = useState({});
    const [q, setQ] = useState('');
    const [closed, setClosed] = useState(new Set());
    const [openRow, setOpenRow] = useState(null);
    const [colMenu, setColMenu] = useState(false);
    const [expMenu, setExpMenu] = useState(false);
    const siteKey = `fm.inv.${id}.site`;
    const [st, setSt] = useState(() => { const v = store(siteKey); return typeof v === 'string' && (v === 'All' || site?.opts.includes(v)) ? v : 'All'; });
    const pickSite = (v) => { setSt(v); save(siteKey, v); };
    const sel = useSel();
    const persist = (p) => save(key, { g, hide: [...hide], show: [...show], sort, ...p });
    const visible = cols.filter(c => c.on === false ? show.has(c.k) : !hide.has(c.k));
    const toggleCol = (c) => {
        if (c.on === false) {
            const s = new Set(show);
            s.has(c.k) ? s.delete(c.k) : s.add(c.k);
            setShow(s);
            persist({ show: [...s] });
        }
        else {
            const h = new Set(hide);
            h.has(c.k) ? h.delete(c.k) : h.add(c.k);
            setHide(h);
            persist({ hide: [...h] });
        }
    };
    // filter
    const ql = q.trim().toLowerCase();
    const shown = useMemo(() => rows.filter(r => (!site || st === 'All' || site.get(r) === st) && (!ql || text(r).toLowerCase().includes(ql))
        && (chips ?? []).every(c => !pick[c.k]?.size || pick[c.k].has(c.get(r) ?? ''))), [rows, ql, pick, chips, st]);
    // sort
    const valOf = (c, r) => { const v = c.val ? c.val(r) : c.get(r); return typeof v === 'number' ? v : v == null ? '' : String(v); };
    const sorted = useMemo(() => {
        if (!sort)
            return shown;
        const c = cols.find(x => x.k === sort[0]);
        if (!c)
            return shown;
        return [...shown].sort((a, b) => {
            const x = valOf(c, a), y = valOf(c, b);
            return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * sort[1];
        });
    }, [shown, sort]);
    // group
    const grp = groups.find(x => x.k === g);
    const grouped = useMemo(() => {
        if (!grp)
            return [['', sorted]];
        const m = new Map();
        for (const r of sorted) {
            const k = grp.key(r);
            (m.get(k) ?? m.set(k, []).get(k)).push(r);
        }
        const ord = (k, rs) => grp.order ? grp.order(k, rs) : k;
        return [...m.entries()].sort((a, b) => {
            const x = ord(a[0], a[1]), y = ord(b[0], b[1]);
            return typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
        });
    }, [sorted, g]);
    const totLbs = shown.reduce((a, r) => a + lbs(r), 0);
    const stamp = () => `${id}-inventory${site && st !== 'All' ? `-${st}` : ''}-${new Date().toISOString().slice(0, 10)}`;
    const exportRows = () => {
        const head = [...(grp ? [grp.l] : []), ...visible.map(c => c.l)];
        const body = [];
        for (const [k, rs] of grouped)
            for (const r of rs)
                body.push([...(grp ? [k] : []), ...visible.map(c => valOf(c, r))]);
        return { head, body };
    };
    const exportCsv = () => {
        const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
        const { head, body } = exportRows();
        const lines = [head, ...body].map(l => l.map(esc).join(','));
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
        a.download = `${stamp()}.csv`;
        a.click();
    };
    const exportXlsx = async () => {
        const { default: writeXlsxFile } = await import('write-excel-file/browser');
        const { head, body } = exportRows();
        await writeXlsxFile([head.map(v => ({ value: v, fontWeight: 'bold', backgroundColor: '#E6F3EE' })),
            ...body.map(l => l.map(v => ({ value: v === '' ? null : v, type: typeof v === 'number' ? Number : String })))], { stickyRowsCount: 1, columns: head.map(h => ({ width: /tag/i.test(h) ? 28 : Math.max(10, h.length + 4) })) }).toFile(`${stamp()}.xlsx`);
    };
    const exportPdf = async () => {
        const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
        const { head, body } = exportRows();
        const pdf = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
        const M = 28;
        pdf.setFont('helvetica', 'bold').setFontSize(14).setTextColor(35, 31, 32).text(`${typeof title === 'string' ? title : 'Inventory'}${site && st !== 'All' ? ` · ${st}` : ''}`, M, M + 8);
        pdf.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(95, 107, 100).text(`${shown.length} ${noun}${shown.length === 1 ? '' : 's'} · ${n0(totLbs)} lbs · printed ${new Date().toLocaleString()}`, M, M + 22);
        autoTable(pdf, { startY: M + 32, margin: { left: M, right: M }, head: [head], body: body.map(l => l.map(v => typeof v === 'number' ? v.toLocaleString() : v)),
            styles: { fontSize: 7, cellPadding: 2.5, overflow: 'linebreak' }, headStyles: { fillColor: [35, 31, 32], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [247, 249, 246] } });
        pdf.save(`${stamp()}.pdf`);
    };
    const chipOpts = (c) => {
        const vs = [...new Set(rows.map(r => c.get(r) ?? '').filter(Boolean))];
        return c.order ? vs.sort((a, b) => (c.order.indexOf(a) + 1 || 99) - (c.order.indexOf(b) + 1 || 99)) : vs.sort();
    };
    const togglePick = (c, v) => setPick(p => { const s = new Set(p[c] ?? []); s.has(v) ? s.delete(v) : s.add(v); return { ...p, [c]: s }; });
    const ncol = visible.length + (sel.on ? 1 : 0);
    return (_jsxs("div", { className: "list inv", children: [_jsxs("div", { className: "row between wrap toolbar", children: [_jsx("h2", { children: title }), _jsxs("div", { className: "row wrap", children: [toolbar, actions?.length ? _jsx(SelButton, { sel: sel }) : null, _jsxs("span", { className: "colpick", children: [_jsx("button", { className: "ghost small", "aria-haspopup": "menu", "aria-expanded": expMenu, onClick: () => setExpMenu(v => !v), children: "Export \u25BE" }), expMenu && _jsxs("div", { className: "colmenu expmenu", role: "menu", onMouseLeave: () => setExpMenu(false), children: [_jsx("button", { role: "menuitem", onClick: () => { setExpMenu(false); exportXlsx(); }, children: "Excel (.xlsx)" }), _jsx("button", { role: "menuitem", onClick: () => { setExpMenu(false); exportCsv(); }, children: "CSV" }), _jsx("button", { role: "menuitem", onClick: () => { setExpMenu(false); exportPdf(); }, children: "PDF" })] })] })] })] }), site && _jsx("div", { className: "seg invsite", role: "group", "aria-label": "Site", children: [...site.opts, 'All'].map(v => _jsx("button", { className: st === v ? 'on' : '', onClick: () => pickSite(v), children: v }, v)) }), cards && _jsx("div", { className: "invcards", children: cards(shown) }), note && _jsx("p", { className: "muted", children: note }), _jsxs("div", { className: "row wrap toolbar invbar", children: [_jsx("input", { className: "search", type: "search", placeholder: "Search strain, pallet, tag, lot", value: q, onChange: e => setQ(e.target.value) }), _jsxs("label", { className: "row", children: ["Group by ", _jsxs(Select, { className: "inline", value: g, onChange: e => { setG(e.target.value); persist({ g: e.target.value }); }, children: [groups.map(x => _jsx("option", { value: x.k, children: x.l }, x.k)), _jsx("option", { value: "none", children: "Nothing" })] })] }), _jsxs("span", { className: "colpick", children: [_jsx("button", { className: "ghost small", onClick: () => setColMenu(v => !v), children: "Columns" }), colMenu && _jsx("div", { className: "colmenu", onMouseLeave: () => setColMenu(false), children: cols.map(c => _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: visible.includes(c), onChange: () => toggleCol(c) }), " ", c.l] }, c.k)) })] })] }), chips?.length ? _jsx("div", { className: "chips", children: chips.map(c => {
                    const opts = chipOpts(c);
                    if (opts.length < 2)
                        return null;
                    return _jsxs("span", { className: "chipset", children: [_jsx("span", { className: "muted small", children: c.l }), opts.map(v => _jsx("button", { className: `chip ${pick[c.k]?.has(v) ? 'on' : ''}`, onClick: () => togglePick(c.k, v), children: c.label ? c.label(v) : v }, v))] }, c.k);
                }) }) : null, _jsxs("div", { className: "invtot", children: [_jsx("b", { children: shown.length.toLocaleString() }), " ", noun, shown.length === 1 ? '' : 's', " \u00B7 ", _jsx("b", { children: n0(totLbs) }), " lbs", totals ? _jsxs(_Fragment, { children: [" \u00B7 ", totals(shown)] }) : null, grp && grouped.length > 1 && _jsxs(_Fragment, { children: [" \u00B7 ", _jsx("a", { onClick: () => setClosed(closed.size ? new Set() : new Set(grouped.map(x => x[0]))), children: closed.size ? 'Open all' : 'Fold all' })] })] }), !shown.length ? _jsx("p", { className: "muted", children: "Nothing matches." }) :
                _jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable invt", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx(SelAll, { sel: sel, ids: shown.map(rowId) }), visible.map(c => _jsxs("th", { className: `${c.num ? 'num' : ''} ${c.phone ? '' : 'hide-s'} sortable`, onClick: () => { const s = sort?.[0] === c.k ? [c.k, sort[1] === 1 ? -1 : 1] : [c.k, 1]; setSort(s); persist({ sort: s }); }, children: [c.l, sort?.[0] === c.k ? (sort[1] === 1 ? ' ▲' : ' ▼') : ''] }, c.k))] }) }), _jsx("tbody", { children: grouped.map(([k, rs]) => {
                                    const isClosed = closed.has(k);
                                    return [
                                        grp && _jsx("tr", { className: "wk ghead", children: _jsx("td", { colSpan: ncol, children: _jsxs("span", { className: "row between", children: [_jsxs("span", { children: [_jsx("a", { className: "fold", onClick: () => setClosed(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; }), children: isClosed ? '▸' : '▾' }), ' ', grp.open ? _jsx("a", { onClick: () => grp.open(k), children: grp.head ? grp.head(k, rs) : k || '(none)' }) : grp.head ? grp.head(k, rs) : k || '(none)'] }), _jsxs("span", { className: "muted", children: [rs.length, " \u00B7 ", n0(rs.reduce((a, r) => a + lbs(r), 0)), " lbs"] })] }) }) }, `g-${k}`),
                                        ...(isClosed ? [] : rs.flatMap(r => {
                                            const idr = rowId(r);
                                            return [
                                                _jsxs("tr", { className: `tap ${rowClass?.(r) ?? ''}`, onClick: () => expand ? setOpenRow(o => o === idr ? null : idr) : onOpen?.(r), children: [_jsx(SelBox, { sel: sel, id: idr }), visible.map(c => _jsx("td", { className: `${c.num ? 'num' : ''} ${c.phone ? '' : 'hide-s'}`, children: c.get(r) }, c.k))] }, idr),
                                                expand && openRow === idr ? _jsx("tr", { className: "xrow", children: _jsx("td", { colSpan: ncol, children: expand(r) }) }, `x-${idr}`) : null,
                                            ];
                                        })),
                                    ];
                                }) })] }) }), actions && _jsx(SelBar, { sel: sel, noun: noun, actions: actions })] }));
}
