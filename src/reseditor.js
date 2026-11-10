import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// Msg RES-11: staff reserve editor, built like the customer portal's Reserves & Menu (Aziz: "they should both work like
// this"). Used by Sales > Reserves > a customer, and by + Add reserves. KPIs, filters (Reserved / Not reserved / SHO / BHO),
// a +/− step chooser, one sortable table of their reserves + their open-order strains + everything open on the menu,
// and a Change reserve stepper on every row. Staff changes save straight away (set_reserve), not as a request.
// Limits are the same as before: not under shipped + open SOs; up by at most what's open on the menu.
import { useEffect, useMemo, useState } from 'react';
import { StrainLink } from './strainCard';
const n0 = (v) => Math.round(v).toLocaleString();
const k = (s) => s.trim().toLowerCase();
const STEPS = [[10, '10 lbs'], [50, '50 lbs'], [100, '100 lbs'], [650, 'A full pallet']];
const TYPE_ORDER = { S: 1, 'S/H': 2, H: 3, 'I/H': 4, I: 5 };
const TYPE_LONG = { S: 'Sativa', 'S/H': 'Sativa hybrid', H: 'Hybrid', 'I/H': 'Indica hybrid', I: 'Indica' };
const sign = (v) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${n0(Math.abs(v))}`;
function Stepper({ val, step, min, max, bad, label, onChange }) {
    const [txt, setTxt] = useState(null);
    const clamp = (n) => Math.min(Math.max(n, min), Math.max(max, min));
    const shown = txt ?? (val ? sign(val).replace('±', '') : '');
    return _jsxs("span", { className: `rstep ${val ? 'on' : ''} ${bad ? 'bad' : ''}`, children: [_jsx("button", { type: "button", disabled: val <= min, onClick: () => { setTxt(null); onChange(clamp(val - step)); }, "aria-label": `${step} lbs less ${label}`, children: "\u2212" }), _jsx("input", { type: "text", inputMode: "numeric", value: shown, placeholder: "\u00B10", "aria-label": `Change to ${label} reserve, lbs`, "aria-invalid": bad ? 'true' : 'false', onFocus: e => e.target.select(), onChange: e => { const t = e.target.value.replace(/[−–]/g, '-').replace(/[^0-9+-]/g, ''); setTxt(t); const n = Number(t.replace('+', '')); if (t === '' || t === '-' || t === '+')
                    onChange(0);
                else if (!isNaN(n))
                    onChange(n); }, onBlur: () => setTxt(null), onKeyDown: e => { if (e.key === 'Enter')
                    e.target.blur(); } }), _jsx("button", { type: "button", disabled: val >= max, onClick: () => { setTxt(null); onChange(clamp(val + step)); }, "aria-label": `${step} lbs more ${label}`, children: "+" })] });
}
export function ReserveEditor({ backend, cid, cname, year, cur, flash, onSaved, canEdit = true, reservesOff }) {
    const [bal, setBal] = useState(null);
    const [orders, setOrders] = useState(null);
    const [open, setOpen] = useState(null);
    const [tags, setTags] = useState({});
    const [terms, setTerms] = useState([]);
    const [rev, setRev] = useState(0);
    const [ed, setEd] = useState({}); // strain key -> change (+/− lbs)
    const [fRes, setFRes] = useState('all');
    const [fG, setFG] = useState('all');
    const [q, setQ] = useState('');
    const [srt, setSrt] = useState({ k: 's', up: true });
    const [step, setStepRaw] = useState(() => { try {
        return Number(localStorage.getItem('fm.res.step')) || 10;
    }
    catch {
        return 10;
    } });
    const [custom, setCustom] = useState(false);
    const [stepTxt, setStepTxt] = useState(null);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const setStep = (n) => { setStepRaw(n); try {
        localStorage.setItem('fm.res.step', String(n));
    }
    catch { /* private mode */ } };
    useEffect(() => {
        backend.listBalances().then(setBal).catch(() => setBal([]));
        backend.listOrders().then(setOrders).catch(() => setOrders([]));
        backend.client()?.rpc('staff_ff_open').then(({ data, error }) => setOpen(error ? [] : (data ?? [])), () => setOpen([]));
        backend.listTerms().then(setTerms).catch(() => { });
    }, [rev]);
    useEffect(() => {
        backend.client()?.rpc('menu_strain_tags').then(({ data }) => {
            const m = {};
            for (const x of (data ?? []))
                for (const n of [x.strain, ...(x.aliases ?? [])])
                    if (n && !(k(n) in m))
                        m[k(n)] = { g: x.grade, t: x.strain_type };
            setTags(m);
        }, () => { });
    }, []);
    useEffect(() => { setEd({}); }, [cid, year]);
    const rows = useMemo(() => {
        if (!bal || !open || !orders)
            return [];
        const m = new Map();
        for (const b of bal)
            if (b.customer_id === cid && (b.crop_year ?? cur) === year && (Number(b.reserved) > 0 || Number(b.shipped) > 0 || Number(b.pending) > 0))
                m.set(k(b.strain), { key: k(b.strain), strain: b.strain, res: Number(b.reserved), ful: Number(b.shipped), so: Number(b.pending), rem: Math.max(0, Number(b.remaining)), open: 0, has: true });
        // RES-7: strains on their confirmed or shipped orders with no reserve yet; once a reserve exists those lbs count against it
        for (const o of orders)
            if (o.customer_id === cid && (o.status === 'pending' || o.status === 'shipped'))
                for (const l of o.order_lines) {
                    if ((l.product ?? 'fresh_frozen') !== 'fresh_frozen' || (l.crop_year ?? cur) !== year || m.get(k(l.strain))?.has)
                        continue;
                    const x = m.get(k(l.strain)) ?? { key: k(l.strain), strain: l.strain, res: 0, ful: 0, so: 0, rem: 0, open: 0, has: false };
                    if (o.status === 'pending')
                        x.so += Number(l.lbs);
                    else
                        x.ful += Number(l.lbs);
                    m.set(x.key, x);
                }
        for (const o of open)
            if (o.crop_year === year && Number(o.open_lbs) > 0) {
                const x = m.get(k(o.strain));
                if (x)
                    x.open = Number(o.open_lbs);
                else
                    m.set(k(o.strain), { key: k(o.strain), strain: o.strain, res: 0, ful: 0, so: 0, rem: 0, open: Number(o.open_lbs), has: false });
            }
        return [...m.values()];
    }, [bal, open, orders, cid, year, cur]);
    const tagOf = (s) => tags[k(s)] ?? { g: null, t: null };
    const minOf = (r) => r.ful + r.so;
    const maxOf = (r) => Math.max(r.res, r.ful + r.so) + r.open;
    const errOf = (r, to) => to < minOf(r) && !(to === 0 && !r.has) ? `Can't go under ${n0(minOf(r))} (shipped + open SOs)`
        : to > maxOf(r) ? `${n0(maxOf(r))} is the most (${n0(Math.max(r.res, r.ful + r.so))} theirs + ${n0(r.open)} open)` : '';
    const changes = rows.filter(r => (ed[r.key] ?? 0) !== 0).map(r => { const to = r.res + ed[r.key]; return { r, to, d: ed[r.key], err: errOf(r, to) }; });
    const bad = changes.filter(x => x.err);
    const okD = changes.filter(x => !x.err).reduce((a, x) => a + x.d, 0);
    const tot = rows.reduce((t, r) => ({ res: t.res + r.res, ful: t.ful + r.ful, so: t.so + r.so, rem: t.rem + r.rem, open: t.open + r.open }), { res: 0, ful: 0, so: 0, rem: 0, open: 0 });
    const t = terms.find(x => x.customer_id === cid && x.crop_year === year);
    const contract = t?.contract_lbs ?? null;
    const newRes = tot.res + okD;
    const remNow = (r) => { const d = ed[r.key] ?? 0; return d ? Math.max(0, r.res + d - r.ful - r.so) : r.rem; };
    const newRem = rows.reduce((a, r) => a + remNow(r), 0);
    const ql = q.trim().toLowerCase();
    const val = (r) => srt.k === 's' ? r.strain.toLowerCase() : srt.k === 'g' ? { SHO: 1, BHO: 2 }[tagOf(r.strain).g ?? ''] ?? 9
        : srt.k === 't' ? TYPE_ORDER[tagOf(r.strain).t ?? ''] ?? 9 : srt.k === 'rem' ? (r.has ? r.rem : 0) : r[srt.k];
    const list = rows.filter(r => (fRes === 'all' || (fRes === 'res') === r.has) && (fG === 'all' || tagOf(r.strain).g === fG) && (!ql || r.strain.toLowerCase().includes(ql)))
        .sort((a, b) => {
        const x = val(a), y = val(b);
        const d = typeof x === 'string' ? x.localeCompare(y) : x - y;
        return (srt.up ? d : -d) || a.strain.localeCompare(b.strain);
    });
    const sh = (key, label, num = true) => _jsx("th", { className: `${num ? 'num ' : ''}sortth${srt.k === key ? ' on' : ''}`, "aria-sort": srt.k === key ? (srt.up ? 'ascending' : 'descending') : 'none', children: _jsxs("button", { className: "linkbtn", onClick: () => setSrt(o => ({ k: key, up: o.k === key ? !o.up : key === 's' })), children: [label, srt.k === key ? (srt.up ? ' ▲' : ' ▼') : ''] }) });
    const chip = (on, label, f) => _jsx("button", { className: `rchip ${on ? 'on' : ''}`, "aria-pressed": on, onClick: f, children: label }, label);
    const gradeCell = (s) => { const g = tagOf(s).g; return g ? _jsx("span", { className: `gtag g-${g.toLowerCase()}`, children: g }) : null; };
    const typeCell = (s) => { const ty = tagOf(s).t; return ty ? _jsx("span", { className: "ttag", title: TYPE_LONG[ty], children: ty }) : null; };
    async function save() {
        if (!changes.length || bad.length)
            return;
        setBusy(true);
        let done = 0;
        try {
            for (const x of changes) {
                await backend.setReserve(cid, x.r.strain, x.to, note.trim() || undefined, year !== cur ? year : undefined);
                done++;
            }
            flash(`${done} reserve${done === 1 ? '' : 's'} saved for ${cname}`);
            setEd({});
            setNote('');
            setRev(v => v + 1);
            await onSaved?.();
        }
        catch (e) {
            flash(`${done ? `${done} saved, then: ` : ''}${String(e.message ?? e)}`, true);
            if (done) {
                setRev(v => v + 1);
                await onSaved?.();
            }
        }
        finally {
            setBusy(false);
        }
    }
    if (!bal || !open || !orders)
        return _jsx("p", { className: "muted", children: "Loading reserves and the open menu\u2026" });
    const sum = changes.slice(0, 3).map(x => x.r.has ? `${x.r.strain} ${n0(x.r.res)} → ${n0(x.to)}` : `${x.r.strain} new ${n0(x.to)}`).join(' · ') + (changes.length > 3 ? ` +${changes.length - 3} more` : '');
    return _jsxs("div", { className: "reditor", children: [_jsxs("div", { className: "rkpis", children: [_jsxs("div", { children: [_jsx("span", { children: "Reserved" }), _jsxs("b", { children: [n0(newRes), " lbs"] }), okD !== 0 && _jsxs("i", { className: "muted", children: ["was ", n0(tot.res)] })] }), _jsxs("div", { children: [_jsx("span", { children: "Fulfilled" }), _jsxs("b", { children: [n0(tot.ful), " lbs"] })] }), _jsxs("div", { children: [_jsx("span", { children: "On open SOs" }), _jsxs("b", { children: [n0(tot.so), " lbs"] })] }), _jsxs("div", { className: "tint", children: [_jsx("span", { children: "Remaining" }), _jsxs("b", { children: [n0(newRem), " lbs"] })] }), _jsxs("div", { children: [_jsx("span", { children: "Open menu available" }), _jsxs("b", { children: [n0(tot.open), " lbs"] })] })] }), contract != null && _jsxs("p", { className: `small ${newRes > contract ? 'warn-t' : 'muted'}`, style: { margin: 0 }, children: ["Contract ", n0(contract), " lbs for ", year, newRes > contract ? ` · ${n0(newRes - contract)} over` : newRes < contract ? ` · ${n0(contract - newRes)} still to reserve` : ' · right on it'] }), reservesOff && _jsxs("div", { className: "warnbox", children: [cname, " is menu only: reserves are off for them. Turn them on in Sales \u203A Customers if they're a contract customer."] }), _jsxs("section", { className: "rcard", children: [_jsxs("div", { className: "rbar", children: [_jsxs("div", { className: "rchips", role: "group", "aria-label": "Filter strains", children: [chip(fRes === 'all' && fG === 'all', 'All', () => { setFRes('all'); setFG('all'); }), chip(fRes === 'res', 'Reserved', () => setFRes(fRes === 'res' ? 'all' : 'res')), chip(fRes === 'not', 'Not reserved', () => setFRes(fRes === 'not' ? 'all' : 'not')), chip(fG === 'SHO', 'SHO', () => setFG(fG === 'SHO' ? 'all' : 'SHO')), chip(fG === 'BHO', 'BHO', () => setFG(fG === 'BHO' ? 'all' : 'BHO'))] }), canEdit && _jsxs("div", { className: "rstepset", role: "group", "aria-label": "How much + and \u2212 move", children: [_jsx("span", { children: "+/\u2212 step" }), STEPS.map(([n, tt]) => _jsx("button", { "aria-pressed": step === n && !custom, className: step === n && !custom ? 'on' : '', title: tt, onClick: () => { setCustom(false); setStep(n); }, children: n }, n)), custom || !STEPS.some(([n]) => n === step)
                                        ? _jsx("input", { type: "text", inputMode: "numeric", "aria-label": "Custom step, lbs", autoFocus: custom, value: stepTxt ?? String(step), onChange: e => { const tx = e.target.value.replace(/[^0-9]/g, '').slice(0, 5); setStepTxt(tx); if (Number(tx) >= 1)
                                                setStep(Number(tx)); }, onBlur: () => { setStepTxt(null); setCustom(false); }, onKeyDown: e => { if (e.key === 'Enter')
                                                e.target.blur(); } })
                                        : _jsx("button", { onClick: () => { setCustom(true); setStepTxt(''); }, children: "Custom" }), _jsx("span", { children: "lbs" })] }), _jsx("input", { className: "search", type: "search", placeholder: "Search strains", value: q, onChange: e => setQ(e.target.value), "aria-label": "Search strains" })] }), _jsx("div", { className: "rscroll", children: _jsxs("table", { className: "ctable rtable", children: [_jsx("thead", { children: _jsxs("tr", { children: [sh('s', 'Strain', false), sh('g', 'Grade', false), sh('t', 'Type', false), sh('res', 'Reserved'), sh('ful', 'Fulfilled'), sh('so', 'Open SO'), sh('rem', 'Remaining'), sh('open', _jsxs(_Fragment, { children: ["Open menu", _jsx("br", {}), "available"] })), canEdit && _jsx("th", { className: "num", children: "Change reserve" })] }) }), _jsxs("tbody", { children: [list.length === 0 && _jsx("tr", { children: _jsx("td", { colSpan: 9, className: "muted", children: "Nothing matches." }) }), list.map(r => {
                                            const d = ed[r.key] ?? 0, to = r.res + d, e = d ? errOf(r, to) : '';
                                            return _jsxs("tr", { className: d ? (e ? 'bad' : 'on') : '', children: [_jsxs("td", { className: "c-n", children: [_jsx(StrainLink, { name: r.strain }), !r.has && d > 0 && _jsxs(_Fragment, { children: [" ", _jsx("span", { className: "pill newp", children: "New" })] }), !r.has && r.so > 0 && _jsxs("div", { className: "muted small", children: [n0(r.so), " on their open order, no reserve yet"] }), e && _jsx("div", { className: "warn-t small", children: e }), _jsxs("span", { className: "rtags-ph", children: [gradeCell(r.strain), typeCell(r.strain)] })] }), _jsx("td", { className: "c-g", children: gradeCell(r.strain) }), _jsx("td", { className: "c-t", children: typeCell(r.strain) }), _jsx("td", { className: "num", "data-l": "reserved ", children: d ? _jsxs(_Fragment, { children: [_jsxs("span", { className: "muted", children: [n0(r.res), " \u2192"] }), " ", _jsx("b", { children: n0(to) })] }) : r.has ? n0(r.res) : _jsx("span", { className: "muted", children: "\u2013" }) }), _jsx("td", { className: "num", "data-l": "fulfilled ", children: r.has || r.ful ? n0(r.ful) : _jsx("span", { className: "muted", children: "\u2013" }) }), _jsx("td", { className: "num", "data-l": "open SO ", children: r.has || r.so ? n0(r.so) : _jsx("span", { className: "muted", children: "\u2013" }) }), _jsx("td", { className: "num c-rem", "data-l": "remaining ", children: _jsx("b", { className: d ? (e ? 'warn-t' : 'ok-t') : '', children: d ? (e ? '–' : n0(remNow(r))) : r.has ? n0(r.rem) : _jsx("span", { className: "muted", children: "\u2013" }) }) }), _jsx("td", { className: "num muted", "data-l": "open ", children: n0(r.open) }), canEdit && _jsx("td", { className: "num c-st", children: _jsx(Stepper, { val: d, step: step, min: r.has ? minOf(r) - r.res : 0, max: maxOf(r) - r.res, bad: !!e, label: r.strain, onChange: n => setEd(m => { const x = { ...m }; if (n)
                                                                x[r.key] = n;
                                                            else
                                                                delete x[r.key]; return x; }) }) })] }, r.key);
                                        })] }), list.length > 0 && _jsx("tfoot", { children: _jsxs("tr", { children: [_jsx("td", { children: _jsx("b", { children: "Total lbs" }) }), _jsx("td", {}), _jsx("td", {}), _jsx("td", { className: "num", children: _jsx("b", { children: n0(newRes) }) }), _jsx("td", { className: "num", children: n0(tot.ful) }), _jsx("td", { className: "num", children: n0(tot.so) }), _jsx("td", { className: "num", children: _jsx("b", { className: "ok-t", children: n0(newRem) }) }), _jsx("td", { className: "num muted", children: n0(tot.open) }), canEdit && _jsx("td", {})] }) })] }) })] }), _jsx("p", { className: "muted small", style: { margin: '0 4px' }, children: "Fulfilled = shipped. Open SO = on their confirmed orders that haven't shipped (those lbs count against the reserve). Remaining = reserved \u2212 fulfilled \u2212 open SO. Open menu available = what anyone can still reserve or order. Saving changes the reserve right away (no request)." }), canEdit && changes.length > 0 && _jsxs("div", { className: "rdock", children: [_jsxs("div", { className: "grow", children: [_jsxs("b", { children: [changes.length, " change", changes.length === 1 ? '' : 's', " \u00B7 ", sign(okD), " lbs"] }), _jsxs("div", { className: "muted small", children: [sum, bad.length > 0 && _jsxs("span", { className: "warn-t", children: [" \u00B7 ", bad.map(x => x.r.strain).join(', '), ": fix the red line"] })] })] }), _jsx("input", { type: "text", placeholder: "Reason (optional, they see it in Reserve History)", value: note, onChange: e => setNote(e.target.value), "aria-label": "Reason" }), _jsx("button", { className: "ghost", disabled: busy, onClick: () => { setEd({}); setNote(''); }, children: "Cancel" }), _jsx("button", { className: "primary", disabled: busy || bad.length > 0, onClick: save, children: busy ? 'Saving…' : bad.length ? 'Fix the red lines' : `Save ${changes.length}` })] })] });
}
