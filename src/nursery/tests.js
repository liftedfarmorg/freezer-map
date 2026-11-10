import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { GEN_LABEL, fmtD, live, n0, strainKey, today } from './calc';
import { DateIn, F, NumIn, Pick, SaveBar, Sheet, StrainList, TextIn } from '../cult/ui';
import { t, tn } from '../i18n';
const RESULT = { pending: 'Pending', negative: 'Negative', positive: 'Positive', inconclusive: 'Inconclusive' };
/** Nursery > Logs > Lab tests (HLVD and others) */
export function LabTests({ d, c, api, flash, onSaved }) {
    const [open, setOpen] = useState(null);
    const pos = d.tests.filter(x => x.result === 'positive');
    return _jsxs(_Fragment, { children: [_jsxs("div", { className: "row toolbar between", children: [_jsxs("span", { className: "muted", children: [tn(d.tests.length, '{n} test', '{n} tests'), pos.length ? ` · ${t('{n} positive', { n: pos.length })}` : ''] }), _jsx("button", { className: "primary", onClick: () => setOpen({ test: 'HLVD', round: 1, result: 'pending', tested_on: today(), culled: 0 }), children: t('+ Lab test') })] }), !d.tests.length ? _jsx("p", { className: "muted", children: t('No lab tests yet. Log HLVD rounds here (vials, results, plants culled).') }) : _jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('Date') }), _jsx("th", { children: t('Strain') }), _jsx("th", { children: t('Test') }), _jsx("th", { className: "num", children: t('Round') }), _jsx("th", { children: t('Lot / location') }), _jsx("th", { className: "num", children: t('Plants') }), _jsx("th", { className: "num", children: t('Tested') }), _jsx("th", { children: t('Vials') }), _jsx("th", { children: t('Result') }), _jsx("th", { className: "num", children: t('Culled') })] }) }), _jsx("tbody", { children: d.tests.map(x => {
                                const m = d.mothers.find(z => z.id === x.mother_id);
                                return (_jsxs("tr", { className: "tap", onClick: () => setOpen(x), children: [_jsx("td", { className: "nowrap", children: fmtD(x.tested_on) }), _jsx("td", { children: x.strain }), _jsx("td", { children: x.test }), _jsx("td", { className: "num", children: x.round }), _jsx("td", { className: "small", children: m ? `${GEN_LABEL[m.gen]} ${c.room(m.room_id)}${m.bed ? ` ${m.bed}` : ''}` : c.room(x.room_id) }), _jsx("td", { className: "num", children: n0(x.plants) }), _jsx("td", { className: "num", children: n0(x.tested) }), _jsx("td", { className: "small", children: [x.vial_from, x.vial_to].filter(Boolean).join('–') }), _jsx("td", { children: _jsx("span", { className: `pill ${x.result === 'negative' ? 'okp' : x.result === 'positive' ? 'badp' : ''}`, children: t(RESULT[x.result]) }) }), _jsx("td", { className: "num", children: x.culled || '' })] }, x.id));
                            }) })] }) }), open && _jsx(TestSheet, { d: d, c: c, t: open, api: api, flash: flash, onClose: () => setOpen(null), onSaved: onSaved })] });
}
function TestSheet({ d, c, t: t0, api, flash, onClose, onSaved }) {
    const [x, setX] = useState(t0);
    const [busy, setBusy] = useState(false);
    const set = (v) => setX(s => ({ ...s, ...v }));
    const lots = d.mothers.filter(m => m.status === 'active' && (!x.strain || strainKey(m.strain) === strainKey(x.strain)));
    const run = async (f, ok) => {
        setBusy(true);
        try {
            await f();
            onClose();
            await onSaved(ok);
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
        finally {
            setBusy(false);
        }
    };
    return (_jsxs(Sheet, { title: t0.id ? `${t0.strain} · ${t0.test} ${t('round')} ${t0.round}` : t('New lab test'), onClose: onClose, children: [_jsx(F, { label: t('Strain'), children: _jsx(TextIn, { value: x.strain, list: "n-strains", onChange: v => set({ strain: v ?? '' }), autoFocus: !t0.id }) }), _jsx(StrainList, { id: "n-strains", names: [...new Set(d.mothers.map(m => m.strain))] }), _jsxs("div", { className: "grid3", children: [_jsx(F, { label: t('Mother lot'), children: _jsx(Pick, { value: x.mother_id, blank: "\u2014", options: lots.map(m => ({ v: m.id, l: `${GEN_LABEL[m.gen]} · ${[c.room(m.room_id), m.bed].filter(Boolean).join(' ') || t('no location')} · ${live(m)}` })), onChange: v => { const m = d.mothers.find(z => z.id === v); set({ mother_id: v, ...(m ? { plants: live(m), room_id: m.room_id } : {}) }); } }) }), _jsx(F, { label: t('Test'), children: _jsx(TextIn, { value: x.test, onChange: v => set({ test: v ?? 'HLVD' }) }) }), _jsx(F, { label: t('Round'), children: _jsx(NumIn, { value: x.round, onChange: v => set({ round: v ?? 1 }) }) }), _jsx(F, { label: t('Tested on'), children: _jsx(DateIn, { value: x.tested_on, onChange: v => set({ tested_on: v ?? today() }) }) }), _jsx(F, { label: t('Plants in group'), children: _jsx(NumIn, { value: x.plants, onChange: v => set({ plants: v }) }) }), _jsx(F, { label: t('Plants sampled'), children: _jsx(NumIn, { value: x.tested, onChange: v => set({ tested: v }) }) }), _jsx(F, { label: t('First vial #'), children: _jsx(TextIn, { value: x.vial_from, onChange: v => set({ vial_from: v }) }) }), _jsx(F, { label: t('Last vial #'), children: _jsx(TextIn, { value: x.vial_to, onChange: v => set({ vial_to: v }) }) }), _jsx(F, { label: t('Result'), children: _jsx(Pick, { value: x.result, options: Object.keys(RESULT).map(k => ({ v: k, l: t(RESULT[k]) })), onChange: v => set({ result: v ?? 'pending' }) }) }), _jsx(F, { label: t('Plants culled'), children: _jsx(NumIn, { value: x.culled, onChange: v => set({ culled: v ?? 0 }) }) })] }), _jsx(F, { label: t('Action taken'), children: _jsx(TextIn, { value: x.action, onChange: v => set({ action: v }) }) }), _jsx(F, { label: t('Notes'), children: _jsx(TextIn, { value: x.notes, onChange: v => set({ notes: v }) }) }), x.result === 'positive' && _jsx("p", { className: "warn-t small-note", children: t('Positive: cull the plants and record the loss on the mother lot (Mothers → the lot → Record loss).') }), _jsx(SaveBar, { busy: busy, disabled: !x.strain?.trim(), onCancel: onClose, onSave: () => run(() => api.save('nursery_tests', { id: x.id, site: d.sites[0]?.code ?? '1PN', strain: x.strain.trim(), mother_id: x.mother_id ?? null, room_id: x.room_id ?? null,
                    test: x.test || 'HLVD', round: x.round ?? 1, plants: x.plants ?? null, tested: x.tested ?? null, vial_from: x.vial_from ?? null, vial_to: x.vial_to ?? null,
                    tested_on: x.tested_on ?? today(), result: x.result ?? 'pending', culled: x.culled ?? 0, action: x.action ?? null, notes: x.notes ?? null }), t('Test saved')), onDelete: t0.id ? () => run(() => api.remove('nursery_tests', t0.id), t('Test deleted')) : undefined })] }));
}
