import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { rangeTxt } from '../mtag';
import { useEffect, useState } from 'react';
import { metrcRun } from '../metrcCall';
import { n0 } from './calc';
import { errText } from './ui';
const WHAT = { batch: 'Batch tags', flower: 'Flowering tags' };
const tail = (l) => l.slice(-9);
const span = (a, b) => (a === b ? a : `${a} – ${tail(b)}`); // batch tags: the full first tag, the end of the last
export function useHeldRuns(sb, plantingId) {
    const [runs, setRuns] = useState([]);
    const load = async () => {
        if (!plantingId)
            return;
        const { data } = await sb.from('tag_assignments').select('id,purpose,first_label,last_label,tags,license,created_by,created_at').eq('planting_id', plantingId).eq('active', true);
        setRuns((data ?? []));
    };
    useEffect(() => { load(); }, [plantingId]);
    return { runs, reload: load, get: (p) => runs.find(r => r.purpose === p) ?? null };
}
/** pick / check / hold one run for a planting */
export function TagRunBox({ sb, plantingId, purpose, need, held, locked, onChange }) {
    const [open, setOpen] = useState(false);
    const [count, setCount] = useState(need);
    const [first, setFirst] = useState('');
    const [chk, setChk] = useState(null);
    const [busy, setBusy] = useState(null);
    const [err, setErr] = useState(null);
    const call = (b) => metrcRun(sb, { action: 'tag_range', planting_id: plantingId, purpose, ...b });
    const suggest = async (after) => {
        setBusy('Finding the next unbroken run…');
        setErr(null);
        try {
            const r = await call({ count, after });
            if (!r.ok) {
                setErr(r.error ?? 'No run found');
                setChk(null);
            }
            else {
                setFirst(r.first);
                setChk(r);
            }
        }
        catch (e) {
            setErr(errText(e));
        }
        finally {
            setBusy(null);
        }
    };
    const check = async (f) => {
        setBusy('Checking the run against METRC…');
        setErr(null);
        try {
            setChk(await call({ first: f, count }));
        }
        catch (e) {
            setErr(errText(e));
            setChk(null);
        }
        finally {
            setBusy(null);
        }
    };
    const hold = async () => {
        setBusy('Holding the run…');
        setErr(null);
        try {
            const r = await call({ first, count, save: true });
            setChk(r);
            if (r.saved) {
                setOpen(false);
                onChange();
            }
        }
        catch (e) {
            setErr(errText(e));
        }
        finally {
            setBusy(null);
        }
    };
    const release = async () => {
        if (!confirm(`Let go of the ${WHAT[purpose].toLowerCase()} held for this planting?`))
            return;
        const { error } = await sb.rpc('tag_unassign', { p_planting: plantingId, p_purpose: purpose });
        if (error)
            setErr(error.message);
        else
            onChange();
    };
    // opening the picker suggests a run straight away
    useEffect(() => { if (open && !first && need > 0)
        suggest(); }, [open]);
    // a typed (or scanned) start tag is checked once it's a whole tag
    useEffect(() => {
        if (!open)
            return;
        const f = first.trim().toUpperCase();
        if (f.length !== 24 || (chk?.first === f && chk?.count === count))
            return;
        const t = setTimeout(() => check(f), 500);
        return () => clearTimeout(t);
    }, [first, count, open]);
    const short = held && held.tags !== need;
    return (_jsxs("div", { className: "tagrun", children: [_jsxs("div", { className: "row wrap", style: { alignItems: 'center', gap: 8 }, children: [_jsx("b", { children: WHAT[purpose] }), _jsx("span", { className: "muted", children: purpose === 'batch' ? `one per 100 plants: ${n0(need)} needed` : `one per plant: ${n0(need)} needed` }), held
                        ? _jsxs("span", { className: "mono", children: [purpose === 'flower' ? rangeTxt(held.first_label, held.last_label) : span(held.first_label, held.last_label), " ", _jsxs("span", { className: "muted", children: ["(", n0(held.tags), ")"] })] })
                        : _jsx("span", { className: "warn-t", children: "none picked" }), !locked && !open && _jsx("button", { className: "ghost small", onClick: () => { setCount(need); setFirst(''); setChk(null); setOpen(true); }, children: held ? 'Change' : 'Pick run' }), !locked && held && !open && _jsx("button", { className: "ghost small", onClick: release, children: "Release" })] }), short && !open && _jsxs("div", { className: "warn-t small-note", children: ["The run has ", n0(held.tags), " tags; the planting needs ", n0(need), ". ", purpose === 'flower' ? 'Pick it again before the flip.' : 'Pick it again if the batches need more.'] }), locked && held && _jsx("div", { className: "muted small-note", children: "In METRC already: the run can't change." }), open && _jsxs("div", { className: "tagrun-pick", children: [_jsxs("div", { className: "tagrun-row", children: [_jsxs("div", { className: "field", children: [_jsx("label", { children: "Tags" }), _jsx("input", { type: "number", min: 1, value: count, onChange: e => { setCount(Math.max(1, Math.floor(Number(e.target.value) || 1))); setChk(null); } })] }), _jsxs("div", { className: "field grow", children: [_jsxs("label", { children: ["First tag ", _jsx("span", { className: "muted", children: "(type it, or Suggest)" })] }), _jsx("input", { className: "mono-in", value: first, placeholder: "1A40603000\u2026", onChange: e => { setFirst(e.target.value.toUpperCase().replace(/\s/g, '')); setChk(null); } })] }), _jsx("button", { className: "ghost small", disabled: !!busy, onClick: () => suggest(), children: "Suggest" }), chk?.last && _jsx("button", { className: "ghost small", disabled: !!busy, onClick: () => suggest(chk.last), children: "Next run" })] }), busy && _jsx("div", { className: "muted small-note", children: busy }), err && _jsx("div", { className: "tr-bad small-note", children: err }), chk && !busy && (chk.ok
                        ? _jsxs("div", { className: "tr-ok small-note", children: ["\u2713 ", span(chk.first, chk.last), ": all ", n0(chk.count), " tags are available on ", chk.license, " and free in the app."] })
                        : _jsxs("div", { className: "tr-bad small-note", children: [span(chk.first, chk.last), ": ", n0(chk.bad_tags ?? 0), " of ", n0(chk.count), " tags can't be used.", _jsx("ul", { className: "mlist", children: (chk.problems ?? []).map((p, i) => _jsxs("li", { children: [_jsx("span", { className: "mono", children: span(p.from, p.to) }), p.tags > 1 ? ` (${n0(p.tags)})` : '', ": ", p.why] }, i)) })] })), _jsxs("div", { className: "row end", style: { gap: 8 }, children: [_jsx("button", { className: "ghost small", onClick: () => setOpen(false), children: "Cancel" }), _jsxs("button", { className: "primary small", disabled: !!busy || !chk?.ok || chk.first !== first.trim().toUpperCase() || chk.count !== count, onClick: hold, children: ["Hold these ", n0(count), " tags"] })] })] })] }));
}
