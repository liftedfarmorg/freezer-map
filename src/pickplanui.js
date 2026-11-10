import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// Plan my pick (Msg PICK-1, PICK-2): its own page from a Fulfillment order (one order) or a load on Transit (every
// order on the load). Builds a pick that opens as few freezers as possible, lets you change any pallet, then either
// assigns it (Use this plan) or walks it on a phone (Walk this plan: scan each pallet, swap with a reason, assign
// what you picked at the end). Assigning uses the same calls as + Assign pallets (pick_pallet / pick_part).
// Pallets in Staging are left out (Aziz PICK-2: that's usually not where they really are).
import { useEffect, useMemo, useState } from 'react';
import { makePlan, rescore, route } from './pickplan';
import { useBack, scrollTop } from './nav';
import { ScanButton } from './scan';
import { sameTag, useScanHandler } from './scanroute';
const n0 = (x) => Math.round(Number(x)).toLocaleString();
const w = (p) => Number(p.current_weight ?? 0);
const got = (l) => l.picks.reduce((a, p) => a + Number(p.lbs), 0);
const MODES = [
    { k: 'freezers', label: 'Fewest freezers' }, { k: 'oldest', label: 'Oldest harvest first' }, { k: 'splits', label: 'Fewest splits' }
];
const REASONS = ['Not there', 'Buried', 'Damaged', 'Other'];
/** a mixed pallet's strains, short: "A, B and 13 more" */
const mixList = (cs) => { const n = [...new Set(cs.map(c => c.strain).filter(Boolean))]; return n.length > 3 ? `${n.slice(0, 2).join(', ')} and ${n.length - 2} more` : n.join(', ') || `${cs.length} packages`; };
const boxes = (lbs) => lbs % 10 === 0 ? ` ${lbs / 10} boxes` : '';
const store = {
    get(k) { try {
        const s = localStorage.getItem(k);
        return s ? JSON.parse(s) : null;
    }
    catch {
        return null;
    } },
    set(k, v) { try {
        if (v)
            localStorage.setItem(k, JSON.stringify(v));
        else
            localStorage.removeItem(k);
    }
    catch { /* private mode: walk still works, just isn't kept */ } },
};
export function PlanMyPick({ orders, cands, loc, pallet, contents, backend, reload, flash, back, title, sub, tagOf, held = [], walkKey, backLabel }) {
    useBack(true, back);
    const [tol, setTol] = useState(5);
    useEffect(() => {
        backend.client()?.rpc('fill_tolerance').then(({ data }) => { if (data != null && Number(data) >= 0)
            setTol(Number(data)); }, () => { });
    }, [backend]);
    const allLines = useMemo(() => orders.flatMap(o => o.lines), [orders]);
    const lineOf = (id) => allLines.find(l => l.id === id);
    // lines that still need lbs, and the free pallets for each (not Staging), split by site
    const all = useMemo(() => allLines.filter(l => !l.cant_fill).map(l => ({ id: l.id, strain: l.strain, need: Math.max(0, Number(l.lbs) - got(l)),
        cands: cands(l).filter(p => { const L = loc(p); return L.fz != null && !L.staging; }) })), [allLines, cands, loc]);
    const sites = useMemo(() => {
        const m = new Map();
        // open on the site with the most work: assigned pallets to pull, then free lbs for lines that still need some
        for (const l of all)
            for (const p of l.cands) {
                const s = loc(p).site;
                if (s)
                    m.set(s, (m.get(s) ?? 0) + (l.need > 0.5 ? Math.min(w(p), l.need) : 0));
            }
        for (const r of held) {
            const s = loc(r.pallet).site;
            if (s)
                m.set(s, (m.get(s) ?? 0) + 1e6);
        }
        return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
    }, [all, held, loc]);
    const [site, setSite] = useState(null);
    const st = site ?? sites[0] ?? null;
    const lines = useMemo(() => all.map(l => ({ ...l, cands: l.cands.filter(p => loc(p).site === st) })), [all, st, loc]);
    const [mode, setMode] = useState('freezers');
    const fresh = useMemo(() => makePlan(lines, tol, mode, loc), [lines, tol, mode, loc]);
    const [rows, setRows] = useState(null);
    const [change, setChange] = useState(null); // pallet id being changed
    useEffect(() => { setRows(null); setChange(null); }, [mode, st, tol]);
    const plan = rows ? rescore(lines, rows, loc) : fresh;
    const [showMap, setShowMap] = useState(null);
    const [busy, setBusy] = useState(false);
    const heldHere = held.filter(r => loc(r.pallet).site === st);
    const routeRows = useMemo(() => route([...heldHere, ...plan.rows], loc), [plan, heldHere.map(r => r.pallet.id).join(','), loc]);
    const nFz = new Set(routeRows.map(r => loc(r.pallet).fz)).size;
    const inWay = (() => { const ids = new Set(routeRows.map(r => r.pallet.id)), b = new Set(); for (const r of routeRows)
        for (const i of loc(r.pallet).inFront)
            if (!ids.has(i))
                b.add(i); return b.size; })();
    const groups = useMemo(() => {
        const m = new Map();
        for (const r of routeRows) {
            const k = loc(r.pallet).fz ?? -1;
            m.set(k, [...(m.get(k) ?? []), r]);
        }
        return [...m.entries()];
    }, [routeRows, loc]);
    const nothing = lines.every(l => l.need <= tol) && !heldHere.length;
    // the walk (phone): kept on the phone so it survives losing service or closing the app
    const [walk, setWalk] = useState(() => store.get(walkKey));
    const saveWalk = (v) => { setWalk(v); store.set(walkKey, v); };
    const startWalk = () => { saveWalk({ rows: routeRows.map(r => ({ lineId: r.lineId, id: r.pallet.id, lbs: r.lbs, whole: r.whole, held: r.held })), done: [], notes: {} }); scrollTop(); };
    const [walking, setWalking] = useState(false);
    const assign = async (rs) => {
        setBusy(true);
        let done = 0;
        try {
            for (const r of rs) {
                if (r.whole)
                    await backend.pickPallet(r.lineId, r.pallet.id);
                else
                    await backend.pickPart(r.lineId, r.pallet.id, r.lbs, null);
                done++;
            }
            await reload();
            flash(`${done} pallet${done === 1 ? '' : 's'} assigned. Splits are tag pending until the new label goes on.`);
            return true;
        }
        catch (e) {
            if (done)
                await reload();
            flash(`${done ? `${done} assigned, then: ` : ''}${String(e.message ?? e)}`, true);
            return false;
        }
        finally {
            setBusy(false);
        }
    };
    // other free pallets for a line, with what each does to the route
    const altsFor = (lineId, lbs, skip, fzIn) => {
        const l = lines.find(x => x.id === lineId);
        return (l?.cands ?? []).filter(p => !skip.has(p.id) && w(p) > 0).map(p => {
            const L = loc(p), same = fzIn.has(L.fz), d = w(p) - lbs;
            const bits = [same ? 'Already going there' : '+1 freezer',
                Math.abs(d) <= tol ? 'whole' : d > 0 ? `split ${n0(d)} back` : `${n0(-d)} short`,
                L.inFront.length ? `${L.inFront.length} in the way` : ''];
            return { p, L, same, text: bits.filter(Boolean).join(' · ') };
        }).sort((a, b) => Number(b.same) - Number(a.same) || a.L.inFront.length - b.L.inFront.length || Math.abs(w(a.p) - lbs) - Math.abs(w(b.p) - lbs));
    };
    const alts = (r) => altsFor(r.lineId, r.lbs, new Set(routeRows.map(x => x.pallet.id)), new Set(routeRows.filter(x => x !== r).map(x => loc(x.pallet).fz)));
    const swap = (r, p) => {
        const whole = w(p) <= r.lbs + tol;
        setRows(plan.rows.map(x => x === r ? { lineId: r.lineId, pallet: p, lbs: whole ? w(p) : r.lbs, whole } : x));
        setChange(null);
    };
    const chip = (lineId) => { const t = tagOf?.(lineId); return t ? _jsx("span", { className: "pmp-tag", style: { background: t.color }, children: t.label }) : null; };
    if (walk && walking)
        return _jsx(Walk, { walk: walk, save: saveWalk, pallet: pallet, contents: contents, loc: loc, altsFor: altsFor, chip: chip, busy: busy, lineOf: lineOf, tol: tol, close: () => { setWalking(false); scrollTop(); }, finish: async (rs) => { if (await assign(rs)) {
                saveWalk(null);
                setWalking(false);
            } } });
    return (_jsxs("div", { className: "list fulfill pmp", children: [_jsxs("button", { className: "ghost small", onClick: back, children: ["\u2039 ", backLabel] }), _jsxs("h2", { children: [title, sub && _jsxs("span", { className: "muted", children: [" ", sub] })] }), walk && _jsxs("div", { className: "pmp-bar", children: [_jsxs("div", { className: "grow", children: [_jsx("b", { children: "Walk in progress" }), _jsxs("div", { className: "small", children: [walk.done.length, " of ", walk.rows.length, " picked. It's saved on this phone."] })] }), _jsx("button", { className: "ghost", onClick: () => saveWalk(null), children: "Clear it" }), _jsx("button", { className: "primary", onClick: () => { setWalking(true); scrollTop(); }, children: "Resume walk \u203A" })] }), sites.length > 1 && _jsx("div", { className: "seg small-seg", role: "group", "aria-label": "Site", children: sites.map(s => _jsx("button", { className: s === st ? 'on' : '', onClick: () => setSite(s), children: s }, s)) }), nothing ? _jsxs("div", { className: "okbox", children: ["Every line already has its pallets", held.length ? ' and nothing assigned is left in a freezer here' : '', "."] }) : _jsxs(_Fragment, { children: [_jsxs("div", { className: "pmp-sum", children: [_jsxs("b", { children: [nFz, " freezer", nFz === 1 ? '' : 's', " \u00B7 ", routeRows.length, " pallet", routeRows.length === 1 ? '' : 's', " \u00B7 ", plan.splits, " split", plan.splits === 1 ? '' : 's'] }), inWay > 0 && _jsxs("span", { className: "muted", children: [" \u00B7 ", inWay, " pallet", inWay === 1 ? '' : 's', " to move out of the way"] }), plan.rows.length > 0 && _jsxs("label", { className: "pmp-mode", children: ["Plan for ", _jsx("select", { value: mode, onChange: e => setMode(e.target.value), children: MODES.map(m => _jsx("option", { value: m.k, children: m.label }, m.k)) })] })] }), heldHere.length > 0 && _jsxs("div", { className: "muted small", children: [heldHere.length, " already assigned pallet", heldHere.length === 1 ? '' : 's', " still in a freezer ", heldHere.length === 1 ? 'is' : 'are', " on the route too (marked Assigned)."] }), rows && _jsxs("div", { className: "muted small", children: ["You changed this plan. ", _jsx("button", { className: "linkbtn", onClick: () => setRows(null), children: "Start over" })] }), [...plan.short.entries()].map(([id, lbs]) => _jsxs("div", { className: "warnbox", children: [chip(id), " ", lineOf(id)?.strain, ": ", n0(lbs), " lbs short at ", st, ". Not enough free pallets in freezers here", sites.length > 1 ? '; try the other site' : '', "."] }, id)), groups.map(([fz, rs], gi) => {
                        const L0 = loc(rs[0].pallet);
                        return (_jsxs("section", { className: "pmp-fz", children: [_jsxs("div", { className: "row between", children: [_jsxs("h3", { children: [gi + 1, ". ", L0.fzLabel] }), _jsx("button", { className: "linkbtn", onClick: () => setShowMap(showMap === fz ? null : fz), children: showMap === fz ? 'Hide map' : 'Show map' })] }), showMap === fz && _jsx(FzMap, { rows: rs, loc: loc }), rs.map(r => {
                                    const L = loc(r.pallet);
                                    return (_jsxs("div", { children: [_jsxs("div", { className: `pmp-row ${change === r.pallet.id ? 'on' : ''}`, children: [_jsx("b", { className: "pmp-spot", children: L.spot }), _jsx("b", { className: "pmp-code", children: r.pallet.code }), _jsxs("span", { className: "grow", children: [chip(r.lineId), " ", r.pallet.kind === 'mixed' ? `Mixed: ${mixList(contents(r.pallet.id))}` : r.pallet.strain, _jsxs("span", { className: "muted small", children: [" ", L.side ? `· ${L.side}${L.front === 1 ? ', at the door' : `, ${L.front} back`}` : '', L.inFront.length ? ` · ${L.inFront.length} in the way` : ''] })] }), _jsxs("span", { className: "pmp-lbs", children: [n0(r.lbs), !r.whole ? _jsxs("span", { className: "muted", children: [" of ", n0(w(r.pallet))] }) : '', " lbs"] }), _jsx("span", { className: `pmp-do ${r.held ? 'held' : r.whole ? '' : 'split'}`, children: r.held ? 'Assigned' : r.whole ? 'Whole' : `Split${boxes(r.lbs)}` }), r.held ? _jsx("span", { className: "pmp-chg" }) : _jsx("button", { className: "linkbtn pmp-chg", onClick: () => { setChange(change === r.pallet.id ? null : r.pallet.id); }, children: change === r.pallet.id ? 'Cancel' : 'Change' })] }), change === r.pallet.id && (_jsxs("div", { className: "pmp-alts", children: [_jsxs("div", { className: "muted small", children: ["Change ", r.pallet.code, ": the ", lineOf(r.lineId)?.strain, " line needs ", n0(r.lbs), " lbs from here. Each choice says what it does to the plan."] }), alts(r).slice(0, 6).map(a => (_jsxs("div", { className: "pmp-alt", children: [_jsx("b", { className: "pmp-code", children: a.p.code }), _jsxs("span", { className: "muted", children: [a.L.fzLabel.replace(/^\w+ /, ''), " \u00B7 ", a.L.spot] }), _jsxs("span", { className: "pmp-lbs", children: [n0(w(a.p)), " lbs"] }), _jsx("span", { className: `grow small ${a.same ? 'ok-t' : 'warn-t'}`, children: a.text }), _jsxs("button", { className: "ghost small", onClick: () => swap(r, a.p), children: ["Use ", a.p.code] })] }, a.p.id))), !alts(r).length && _jsxs("div", { className: "muted small", children: ["No other free ", lineOf(r.lineId)?.strain, " pallets in freezers at ", st, "."] })] }))] }, r.pallet.id));
                                })] }, fz));
                    }), _jsxs("div", { className: "row wrap pmp-act", children: [_jsx("button", { className: "primary", disabled: busy || !routeRows.length, onClick: () => { startWalk(); setWalking(true); }, children: "Walk this plan \u203A" }), plan.rows.length > 0 && _jsx("button", { className: "ghost", disabled: busy, onClick: async () => { if (await assign(plan.rows))
                                    back(); }, children: busy ? 'Assigning…' : 'Use this plan now' }), _jsx("button", { className: "ghost", onClick: () => { scrollTop(); window.print(); }, children: "Print" })] }), _jsx("p", { className: "muted small", children: "Walk this plan: scan each pallet as it comes out, swap any that aren't there, and assign what you picked at the end. Use this plan now: assigns and holds these pallets right away, same as + Assign pallets. Either way, splits get a pending tag until the new label goes on." })] })] }));
}
/** the phone walk: one pallet at a time, door to back, freezer by freezer */
function Walk({ walk, save, pallet, contents, loc, altsFor, chip, busy, lineOf, tol, close, finish }) {
    useBack(true, close);
    const rows = walk.rows.map(r => ({ ...r, p: pallet(r.id) })).filter((r) => !!r.p);
    const done = new Set(walk.done);
    const left = rows.filter(r => !done.has(r.id));
    const next = left[0];
    const fzs = [...new Set(rows.map(r => loc(r.p).fz))];
    const fzNow = next ? loc(next.p).fz : null;
    const here = rows.filter(r => loc(r.p).fz === fzNow);
    const [msg, setMsg] = useState(null);
    const [swapFor, setSwapFor] = useState(null);
    const [why, setWhy] = useState(REASONS[0]);
    const mark = (id) => { if (!done.has(id))
        save({ ...walk, done: [...walk.done, id] }); };
    const scan = (tag) => {
        const r = rows.find(x => sameTag(x.p.package_tag, tag) || (x.p.kind === 'mixed' && contents(x.id).some(c => sameTag(c.package_tag, tag))));
        if (!r) {
            setMsg({ t: "That tag isn't on this pick. Check the label and scan again.", bad: true });
            return;
        }
        if (done.has(r.id)) {
            setMsg({ t: `${r.p.code} is already picked.` });
            return;
        }
        mark(r.id);
        setMsg({ t: `${r.p.code} picked${r.whole ? '' : `: split ${n0(r.lbs)} lbs off it`}.` });
    };
    useScanHandler(tag => { scan(tag); return true; });
    const swapRow = swapFor != null ? rows.find(r => r.id === swapFor) : undefined;
    const doSwap = (p) => {
        if (!swapRow)
            return;
        const whole = w(p) <= swapRow.lbs + tol;
        save({ ...walk, rows: walk.rows.map(r => r.id === swapRow.id ? { lineId: r.lineId, id: p.id, lbs: whole ? w(p) : r.lbs, whole } : r),
            notes: { ...walk.notes, [swapRow.id]: `${why}: ${swapRow.p.code} (${loc(swapRow.p).spot}), took ${p.code} instead` } });
        setSwapFor(null);
        setMsg({ t: `Swapped ${swapRow.p.code} for ${p.code}.` });
    };
    const toAssign = rows.filter(r => done.has(r.id) && !r.held).map(r => ({ lineId: r.lineId, pallet: r.p, lbs: r.lbs, whole: r.whole }));
    const L = next ? loc(next.p) : null;
    return (_jsxs("div", { className: "list fulfill pmp walk", children: [_jsx("button", { className: "ghost small", onClick: close, children: "\u2039 Plan" }), next && L ? _jsxs(_Fragment, { children: [_jsxs("div", { className: "muted small", children: ["Freezer ", fzs.indexOf(fzNow) + 1, " of ", fzs.length] }), _jsxs("div", { className: "row between", children: [_jsx("h2", { children: L.fzLabel }), _jsxs("b", { className: "ok-t", children: [walk.done.length, " of ", rows.length, " picked"] })] }), _jsx("div", { className: "walk-bar", children: _jsx("i", { style: { width: `${Math.round(walk.done.length / Math.max(1, rows.length) * 100)}%` } }) }), msg && _jsx("div", { className: msg.bad ? 'warnbox' : 'okbox', children: msg.t }), here.filter(r => done.has(r.id)).map(r => _jsxs("div", { className: "walk-done", children: ["\u2713 ", _jsxs("b", { children: [loc(r.p).spot, " \u00B7 ", r.p.code] }), " ", _jsxs("span", { className: "muted", children: [r.p.strain, " \u00B7 ", n0(r.lbs), " lbs"] })] }, r.id)), _jsxs("div", { className: "walk-card", children: [_jsxs("div", { className: "row between", children: [_jsx("span", { className: "walk-k", children: "Next" }), chip(next.lineId)] }), _jsxs("div", { className: "walk-spot", children: [_jsx("b", { children: L.spot }), _jsx("span", { children: L.side ? `${L.side} side, ${L.front === 1 ? 'at the door' : `${L.front} back from the door`}` : '' })] }), L.inFront.length > 0 && _jsxs("div", { className: "warn-t small", children: [L.inFront.length, " pallet", L.inFront.length === 1 ? '' : 's', " in front of it"] }), _jsxs("div", { className: "walk-grid", children: [_jsxs("div", { children: [_jsx("span", { children: "Pallet" }), _jsx("b", { children: next.p.code })] }), next.p.kind === 'mixed'
                                        ? _jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("span", { children: "Tag" }), _jsx("b", { className: "small", children: "Scan any package on it" })] }), _jsxs("div", { children: [_jsx("span", { children: "Mixed pallet" }), _jsx("b", { children: mixList(contents(next.id)) })] }), _jsxs("div", { children: [_jsx("span", { children: "On the pallet" }), _jsxs("b", { children: [n0(contents(next.id).reduce((a, c) => a + w(c), 0)), " lbs"] })] })] })
                                        : _jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("span", { children: "Tag ends" }), _jsxs("b", { className: "mono", children: ["\u2026", (next.p.package_tag ?? '').slice(-7) || 'no tag'] })] }), _jsxs("div", { children: [_jsx("span", { children: "Strain" }), _jsx("b", { children: next.p.strain })] }), _jsxs("div", { children: [_jsx("span", { children: "On the pallet" }), _jsxs("b", { children: [n0(w(next.p)), " lbs", next.p.boxes ? ` · ${next.p.boxes} boxes` : ''] })] })] })] }), _jsx("div", { className: `walk-do ${next.whole ? '' : 'split'}`, children: next.whole ? 'Take the whole pallet' : `Take${boxes(next.lbs)} (${n0(next.lbs)} lbs). Leave ${n0(w(next.p) - next.lbs)} lbs on ${next.p.code}.` })] }), here.filter(r => !done.has(r.id) && r !== next).map(r => _jsxs("div", { className: "walk-done muted", children: [_jsxs("b", { children: [loc(r.p).spot, " \u00B7 ", r.p.code] }), " ", r.p.strain, " \u00B7 ", n0(r.lbs), " lbs"] }, r.id)), (() => { const nf = left.find(r => loc(r.p).fz !== fzNow); return nf ? _jsxs("div", { className: "muted small", children: ["Then: ", _jsx("b", { children: loc(nf.p).fzLabel }), " \u00B7 ", left.filter(r => loc(r.p).fz === loc(nf.p).fz).length, " pallet(s)"] }) : null; })(), _jsxs("div", { className: "walk-act", children: [_jsx(ScanButton, { onScan: scan }), _jsx("button", { className: "ghost", onClick: () => { mark(next.id); setMsg({ t: `${next.p.code} marked picked without a scan.` }); }, children: "Picked (no scan)" }), !next.held && _jsx("button", { className: "ghost", onClick: () => { setSwapFor(next.id); setWhy(REASONS[0]); }, children: "Not here / swap" })] })] }) : _jsxs(_Fragment, { children: [_jsxs("h2", { children: ["All ", rows.length, " picked"] }), Object.values(walk.notes).length > 0 && _jsx("div", { className: "warnbox", children: Object.values(walk.notes).map(n => _jsx("div", { children: n }, n)) }), toAssign.length > 0
                        ? _jsxs(_Fragment, { children: [_jsxs("p", { children: ["Assign the ", toAssign.length, " pallet", toAssign.length === 1 ? '' : 's', " you picked to ", toAssign.length === 1 ? 'its line' : 'their lines', "? Splits get a pending tag until the new label goes on."] }), _jsx("div", { className: "row wrap", children: _jsx("button", { className: "primary", disabled: busy, onClick: () => finish(toAssign), children: busy ? 'Assigning…' : 'Assign what I picked' }) })] })
                        : _jsx("p", { className: "muted", children: "Everything on this walk was already assigned. Nothing else to do here." })] }), swapRow && (_jsx("div", { className: "scrim", onClick: () => setSwapFor(null), children: _jsxs("div", { className: "sheet", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsxs("div", { children: [_jsxs("h2", { children: ["Swap ", swapRow.p.code, " (", loc(swapRow.p).spot, ")"] }), _jsxs("div", { className: "muted", children: [lineOf(swapRow.lineId)?.strain, " line still needs ", n0(swapRow.lbs), " lbs"] })] }), _jsx("button", { className: "ghost", "aria-label": "Close", onClick: () => setSwapFor(null), children: "\u2715" })] }), _jsx("div", { className: "small", children: _jsx("b", { children: "Why?" }) }), _jsx("div", { className: "row wrap", children: REASONS.map(r => _jsx("button", { className: `chip ${why === r ? 'on' : ''}`, onClick: () => setWhy(r), children: r }, r)) }), _jsx("div", { className: "small", style: { marginTop: 8 }, children: _jsx("b", { children: "Pick another" }) }), altsFor(swapRow.lineId, swapRow.lbs, new Set(rows.map(r => r.id)), new Set(left.filter(r => r.id !== swapRow.id).map(r => loc(r.p).fz))).slice(0, 5).map(a => (_jsxs("button", { className: "walk-alt", onClick: () => doSwap(a.p), children: [_jsx("b", { children: a.L.spot }), _jsxs("span", { className: "grow", children: [_jsx("b", { children: a.p.code }), " \u00B7 ", a.L.fzLabel.replace(/^\w+ /, ''), " \u00B7 ", n0(w(a.p)), " lbs", _jsxs("span", { className: `small ${a.same ? 'ok-t' : 'warn-t'}`, children: [" ", a.text] })] }), _jsx("span", { "aria-hidden": "true", children: "\u203A" })] }, a.p.id))), _jsxs("div", { className: "muted small", style: { marginTop: 6 }, children: ["Or scan a different ", lineOf(swapRow.lineId)?.strain, " pallet off the shelf: close this and use + Assign pallets on the order."] })] }) }))] }));
}
/** the freezer from the door: 2 sides, back wall at the top */
function FzMap({ rows, loc }) {
    const max = Math.max(9, ...rows.map(r => loc(r.pallet).front));
    const L0 = loc(rows[0].pallet);
    const spots = [];
    for (let f = max; f >= 1; f--)
        for (const side of ['Left', 'Right']) {
            const rs = rows.filter(x => loc(x.pallet).front === f && loc(x.pallet).side === side);
            const r = rs[0];
            spots.push({ k: `${f}${side}`, label: r ? `${loc(r.pallet).spot} · ${rs.map(x => x.pallet.code).join(', ')}` : '', on: !!r, split: rs.some(x => !x.whole) });
        }
    if (!L0.side)
        return _jsx("div", { className: "muted small", children: rows.map(r => loc(r.pallet).spot).join(', ') });
    return (_jsxs("div", { className: "pmp-map", "aria-label": `${L0.fzLabel} map`, children: [_jsx("div", { className: "muted small center-t", children: "Back wall" }), _jsx("div", { className: "pmp-grid", children: spots.map(s => _jsx("div", { className: `pmp-cell ${s.on ? (s.split ? 'split' : 'on') : ''}`, children: s.label }, s.k)) }), _jsx("div", { className: "pmp-door", children: "Door" })] }));
}
