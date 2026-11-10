import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { CompApi } from './api';
import { FINISH_LABEL } from '../types';
import { FileChip, fmtD } from './files';
import './comp.css';
// Rows for any inventory card (<dl>): item, harvest lot and the pre-harvest test (+ its files), plus COAs on the package itself.
const num = (x, u = '%') => (x == null ? null : `${Math.round(Number(x) * 100) / 100}${u}`);
/** item + harvest lot rows (for cards that don't already show them) */
export function ItemLotRows({ sb, p }) {
    const [item, setItem] = useState(null);
    const [lot, setLot] = useState(null);
    const [show, setShow] = useState(false);
    useEffect(() => {
        if (!sb)
            return;
        setItem(null);
        setLot(null);
        if (p.item_id != null)
            sb.from('items').select('*').eq('id', p.item_id).maybeSingle().then(r => setItem((r.data ?? null)), () => { });
        if (p.lot_id != null)
            sb.from('harvest_lots').select('*').eq('id', p.lot_id).maybeSingle().then(r => setLot((r.data ?? null)), () => { });
    }, [sb, p.id, p.item_id, p.lot_id]);
    return _jsxs(_Fragment, { children: [_jsx("dt", { children: "Item" }), _jsx("dd", { children: item
                    ? _jsxs(_Fragment, { children: [_jsxs("a", { onClick: () => setShow(v => !v), children: [FINISH_LABEL[item.finish] ?? item.finish, " \u00B7 ", item.crop_year, " \u00B7 ", item.site] }), item.metrc_status === 'to_create' && _jsx("span", { className: "pill warnp", children: "not in METRC yet" }), show && _jsxs("div", { className: "muted small", children: [_jsx("div", { className: "mono", children: item.sku }), _jsx("div", { children: item.metrc_name })] })] })
                    : _jsx("span", { className: "muted", children: p.item_id != null ? '…' : 'none (needs strain, farm and year)' }) }), _jsx("dt", { children: "Harvest lot" }), _jsx("dd", { children: lot ? _jsxs(_Fragment, { children: [_jsx("span", { className: "mono", children: lot.code }), lot.metrc_name && lot.metrc_name !== lot.code && _jsxs("div", { className: "muted small", children: ["METRC: ", lot.metrc_name] })] })
                    : _jsx("span", { className: "muted", children: p.lot_id != null ? '…' : 'none' }) })] });
}
/** pre-harvest test row (+ COAs on the package) */
export function TestRows({ sb, palletId, flash }) {
    const api = useMemo(() => (sb ? new CompApi(sb) : null), [sb]);
    const [t, setT] = useState(undefined);
    useEffect(() => { if (!api)
        return; setT(undefined); api.trace(palletId).then(setT).catch(() => setT(null)); }, [api, palletId]);
    if (!api || t === undefined)
        return _jsxs(_Fragment, { children: [_jsx("dt", { children: "Pre-harvest test" }), _jsx("dd", { className: "muted", children: "\u2026" })] });
    if (t === null)
        return null; // Compliance (055) not run yet
    const x = t.test;
    const pass = /pass/i.test(x?.result ?? ''), bad = /fail/i.test(x?.result ?? '');
    return _jsxs(_Fragment, { children: [_jsx("dt", { children: "Pre-harvest test" }), _jsx("dd", { children: !x ? _jsx("span", { className: "muted", children: t.harvest ? 'none on file for this harvest' : 'no harvest linked' }) : _jsxs(_Fragment, { children: [x.result ? _jsx("b", { className: pass ? 'pos' : bad ? 'neg' : '', children: x.result }) : _jsx("span", { className: "muted", children: x.results_on ? 'results back' : 'waiting on results' }), _jsxs("span", { className: "muted", children: [" \u00B7 ", x.kind === 'area' ? `${t.harvest?.site ?? ''} ${t.harvest?.field ?? ''} area composite` : `${t.harvest?.strain ?? ''} strain test`, x.lab ? ` · ${x.lab}` : '', x.results_on ? ` · ${fmtD(x.results_on)}` : ''] }), (x.total_thc != null || x.total_cannabinoids != null || x.moisture != null) && _jsx("div", { className: "small", children: [x.total_thc != null && `THC ${num(x.total_thc)}`, x.total_cannabinoids != null && `Total cannabinoids ${num(x.total_cannabinoids)}`, x.moisture != null && `Moisture ${num(x.moisture)}`].filter(Boolean).join(' · ') }), x.files.length > 0 ? _jsx("div", { className: "trace-files", children: x.files.map(f => _jsx(FileChip, { api: api, f: f, flash: flash }, f.id)) })
                            : _jsx("div", { className: "muted small", children: "No results file yet (Cultivation \u203A Testing)." })] }) }), t.docs.length > 0 && _jsxs(_Fragment, { children: [_jsx("dt", { children: "COA / docs" }), _jsx("dd", { children: _jsx("div", { className: "trace-files", children: t.docs.map(f => _jsx(FileChip, { api: api, f: f, flash: flash }, f.id)) }) })] })] });
}
