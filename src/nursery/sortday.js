import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { GEN_LABEL, fmtD, n0, today } from './calc';
import { DateIn, Sheet } from '../cult/ui';
import { t, tn } from '../i18n';
const FIELDS = ['vigorous', 'minimal', 'none', 'dead'];
const FLABEL = { vigorous: 'Vigorous', minimal: 'Minimal', none: 'No roots', dead: 'Dead / contam.' };
const k = (n, f) => `s${n}_${f}`;
const val = (s) => (s.trim() === '' ? null : Number(s.replace(/,/g, '')));
/** Sort day: one trailer at a time, every rooting batch in a grid. Cut counts, then sort 1 and sort 2, like the sheet. */
export function SortDay({ d, api, flash, onClose, onSaved }) {
    const rooting = d.batches.filter(b => b.stage === 'rooting');
    const count = (id) => rooting.filter(b => b.room_id === id).length;
    // every trailer, plus any other place something is rooting
    const rooms = d.rooms.filter(r => (r.kind === 'trailer' && r.active) || count(r.id) > 0);
    const unplaced = count(null);
    const best = [...rooms].sort((a, b) => count(b.id) - count(a.id))[0];
    const [room, setRoom] = useState(best && count(best.id) ? best.id : unplaced ? null : rooms[0]?.id ?? null);
    const [which, setWhich] = useState(() => {
        const rs = rooting.filter(b => b.room_id === room);
        return rs.length && rs.every(b => b.sort1_on) ? 2 : 1;
    });
    const [on, setOn] = useState(today());
    const [edits, setEdits] = useState({});
    const [busy, setBusy] = useState(false);
    const rows = useMemo(() => rooting.filter(b => b.room_id === room).sort((a, b) => a.strain.localeCompare(b.strain) || a.cut_on.localeCompare(b.cut_on)), [rooting, room]);
    const cols = which === 'cut' ? ['cuttings'] : FIELDS.map(f => k(which, f));
    const shown = (b, f) => edits[b.id]?.[f] ?? (b[f] == null ? '' : String(b[f]));
    const num = (b, f) => { const v = val(shown(b, f)); return v != null && isFinite(v) ? v : null; };
    const set = (id, f, v) => setEdits(e => ({ ...e, [id]: { ...e[id], [f]: v.replace(/[^\d,]/g, '') } }));
    const changed = rows.filter(b => edits[b.id] && Object.entries(edits[b.id]).some(([f, v]) => val(v) !== (b[f] ?? null)));
    const bad = rows.some(b => cols.some(f => { const v = val(shown(b, f)); return v != null && (!isFinite(v) || v < 0); }));
    // what a sort should add up to: sort 1 = cuttings; sort 2 re-sorts sort 1's minimal + no roots
    const expect = (b) => which === 1 ? num(b, 'cuttings') : which === 2 ? (num(b, 's1_minimal') ?? 0) + (num(b, 's1_none') ?? 0) : null;
    const total = (b) => which === 'cut' ? null : FIELDS.reduce((a, f) => a + (num(b, k(which, f)) ?? 0), 0);
    const entered = (b) => which !== 'cut' && FIELDS.some(f => num(b, k(which, f)) != null);
    const rootedNow = (b) => {
        const v1 = num(b, 's1_vigorous'), v2 = num(b, 's2_vigorous'), cut = num(b, 'cuttings');
        if (v1 == null && v2 == null)
            return null;
        const r = (v1 ?? 0) + (v2 ?? 0);
        return { r, p: cut ? r / cut : null };
    };
    const move = (e, r, col) => {
        const dr = e.key === 'Enter' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
        if (!dr)
            return;
        e.preventDefault();
        const next = document.querySelector(`.sortday input[data-r="${r + dr}"][data-c="${col}"]`)
            ?? (dr === 1 ? document.querySelector(`.sortday input[data-r="0"][data-c="${col + 1}"]`) : null);
        next?.focus();
        next?.select();
    };
    const save = async () => {
        setBusy(true);
        try {
            const one = async (b) => {
                const x = { id: b.id };
                for (const [f, v] of Object.entries(edits[b.id]))
                    x[f] = val(v);
                if (which !== 'cut' && entered({ ...b, ...x }) && !b[`sort${which}_on`])
                    x[`sort${which}_on`] = on ?? today();
                if (x.cuttings != null)
                    x.trays = Math.round(x.cuttings / (d.settings.tray || 72) * 10) / 10;
                await api.save('nursery_batches', x);
            };
            for (let i = 0; i < changed.length; i += 8)
                await Promise.all(changed.slice(i, i + 8).map(one));
            const n = changed.length;
            setEdits({});
            await onSaved(t(n === 1 ? '1 batch saved' : '{n} batches saved', { n }));
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
        finally {
            setBusy(false);
        }
    };
    const pick = (id) => {
        if (changed.length && !confirm(t('Leave without saving the {n} changed rows?', { n: changed.length })))
            return;
        setEdits({});
        setRoom(id);
    };
    const roomName = (id) => id == null ? t('No location') : d.rooms.find(r => r.id === id)?.name ?? '';
    return (_jsx(Sheet, { title: t('Sort day'), sub: t('Every rooting batch in one trailer. Type the counts, Enter goes down the column.'), onClose: onClose, wide: true, children: _jsxs("div", { className: "sortday", children: [_jsxs("div", { className: "seg", children: [rooms.map(r => _jsxs("button", { className: room === r.id ? 'on' : '', onClick: () => pick(r.id), children: [r.name, " ", _jsx("span", { className: "muted", children: count(r.id) })] }, r.id)), unplaced > 0 && _jsxs("button", { className: room == null ? 'on' : '', onClick: () => pick(null), children: [t('No location'), " ", _jsx("span", { className: "muted", children: unplaced })] })] }), _jsxs("div", { className: "row wrap sdbar", children: [_jsx("div", { className: "seg", children: [['cut', t('Cut counts')], [1, t('Sort 1')], [2, t('Sort 2')]].map(([w, l]) => _jsx("button", { className: which === w ? 'on' : '', onClick: () => setWhich(w), children: l }, String(w))) }), which !== 'cut' && _jsxs("label", { className: "row sddate", children: [t('Sorted on'), " ", _jsx(DateIn, { value: on, onChange: setOn })] })] }), which === 2 && _jsx("p", { className: "muted small-note", children: t('Sort 2 re-sorts the minimal and no-root ones from sort 1.') }), !rows.length ? _jsx("p", { className: "muted", children: t('Nothing rooting in {room}.', { room: roomName(room) }) }) : _jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable sdtable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('Strain') }), _jsx("th", { className: "hide-s", children: t('Gen') }), _jsx("th", { className: "hide-s", children: t('Cut') }), which === 'cut' ? _jsx("th", { className: "num", children: t('Cuttings') }) : _jsxs(_Fragment, { children: [_jsx("th", { className: "num hide-s", children: which === 1 ? t('Cuttings') : t('To re-sort') }), FIELDS.map(f => _jsx("th", { className: "num", children: t(FLABEL[f]) }, f)), _jsx("th", { className: "num", children: t('Total') })] }), _jsx("th", { className: "num", children: t('Rooted') })] }) }), _jsx("tbody", { children: rows.map((b, r) => {
                                    const ex = expect(b), tot = total(b), off = entered(b) && ex != null && tot !== ex, rr = rootedNow(b);
                                    return _jsxs("tr", { className: changed.includes(b) ? 'edited' : '', children: [_jsx("td", { title: b.name ?? '', children: _jsx("b", { children: b.strain }) }), _jsx("td", { className: "hide-s", children: _jsx("span", { className: `gpill g${b.gen}`, children: GEN_LABEL[b.gen] }) }), _jsx("td", { className: "nowrap hide-s", children: fmtD(b.cut_on) }), which !== 'cut' && _jsx("td", { className: "num hide-s", children: which === 2 && !b.sort1_on && b.s1_minimal == null && b.s1_none == null ? _jsx("span", { className: "muted", children: "\u2014" }) : n0(ex) }), cols.map((f, col) => _jsx("td", { className: "num", children: _jsx("input", { className: "qty", inputMode: "numeric", "data-r": r, "data-c": col, value: shown(b, f), onChange: e => set(b.id, f, e.target.value), onKeyDown: e => move(e, r, col), onFocus: e => e.target.select() }) }, f)), which !== 'cut' && _jsxs("td", { className: `num ${off ? 'bad-t' : ''}`, title: off ? t('Should add up to {n}', { n: n0(ex) }) : '', children: [entered(b) ? n0(tot) : '', off ? ` / ${n0(ex)}` : ''] }), _jsx("td", { className: "num", children: rr ? _jsxs("span", { className: rr.p != null && rr.p < 0.85 ? 'warn-t' : '', children: [n0(rr.r), rr.p != null ? ` · ${Math.round(rr.p * 100)}%` : ''] }) : '' })] }, b.id);
                                }) })] }) }), _jsx("p", { className: "muted small-note", children: which === 'cut' ? t('Cuttings stuck per batch. Imported Gen 2 batches came in at 36 each until counted.') : t('Rooted = vigorous at sort 1 + vigorous at sort 2. Red totals don\'t add up to what was sorted.') }), _jsxs("div", { className: "row between csave", children: [_jsx("span", { className: "muted", children: changed.length ? tn(changed.length, '1 changed', '{n} changed') : '' }), _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost", onClick: onClose, children: t('Close') }), _jsx("button", { className: "primary", disabled: busy || bad || !changed.length, onClick: save, children: busy ? t('Saving…') : t('Save {n}', { n: changed.length || '' }) })] })] })] }) }));
}
