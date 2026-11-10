import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { MTag, tagTxt } from '../mtag';
import { useEffect, useMemo, useState } from 'react';
import { metrcRun } from '../metrcCall';
import { TagInput } from '../taginput';
import { NumIn, Sheet, errText } from '../cult/ui';
const n0 = (x) => (x == null || !isFinite(Number(x)) ? '' : Math.round(Number(x)).toLocaleString());
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const ageDays = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : 0);
export const OVERDUE_DAYS = 2;
/** Deliveries from processors waiting in METRC, with Receive (Processing > Inbound) */
export function ComingBack({ sb, api, flash, reload, isAdmin }) {
    const [rows, setRows] = useState(null);
    const [live, setLive] = useState(false);
    const [busy, setBusy] = useState(null);
    const [open, setOpen] = useState(null);
    const [ed, setEd] = useState({});
    const [spots, setSpots] = useState({});
    const load = async () => {
        setBusy('Asking METRC…');
        try {
            const r = await metrcRun(sb, { action: 'proc_returns' });
            setRows(r.deliveries);
            setLive(r.live);
            const e = {};
            for (const d of r.deliveries)
                for (const i of d.items ?? [])
                    e[i.tag] = { slot_id: null, our_tag: '', reweigh: null };
            setEd(e);
        }
        catch (err) {
            flash(errText(err), true);
            setRows([]);
        }
        finally {
            setBusy(null);
        }
    };
    useEffect(() => { load(); }, []);
    const set = (tag, p) => setEd(x => ({ ...x, [tag]: { ...x[tag], ...p } }));
    const loadSpots = async (site) => {
        const { data, error } = await sb.rpc('proc_open_spots', { p_site: site });
        if (error) {
            flash(error.message, true);
            return;
        }
        setSpots(x => ({ ...x, [site]: (data ?? []) }));
    };
    /** room left in a spot, counting what this delivery already put there */
    const left = (d, s, except) => s.cap - s.used - (d.items ?? []).filter(i => i.tag !== except && ed[i.tag]?.slot_id === s.id).length;
    function fillSpots(d) {
        const list = spots[d.site] ?? [];
        const taken = new Map();
        for (const i of d.items ?? []) {
            const id = ed[i.tag]?.slot_id;
            if (id)
                taken.set(id, (taken.get(id) ?? 0) + 1);
        }
        const next = { ...ed };
        for (const i of d.items ?? []) {
            if (next[i.tag]?.slot_id)
                continue;
            // an empty spot first (no stacking unless the site is full), reefers before freezers
            const s = list.find(x => x.used === 0 && !taken.get(x.id)) ?? list.find(x => x.cap - x.used - (taken.get(x.id) ?? 0) > 0);
            if (!s)
                break;
            taken.set(s.id, (taken.get(s.id) ?? 0) + 1);
            next[i.tag] = { ...next[i.tag], slot_id: s.id };
        }
        setEd(next);
    }
    async function suggestTags(d) {
        const empty = (d.items ?? []).filter(i => !ed[i.tag]?.our_tag);
        if (!empty.length)
            return;
        const tags = await api.nextTags(d.site, empty.length).catch(() => []);
        empty.forEach((i, k) => { if (tags[k])
            set(i.tag, { our_tag: tags[k] }); });
    }
    async function receive(d) {
        const items = d.items ?? [];
        if (items.some(i => !ed[i.tag]?.slot_id)) {
            flash('Pick a spot for every package', true);
            return;
        }
        const tags = items.map(i => ed[i.tag]?.our_tag.trim()).filter(Boolean);
        if (new Set(tags).size !== tags.length) {
            flash('The same tag is on two packages', true);
            return;
        }
        const msg = [
            live ? `Receive manifest ${d.manifest} from ${d.from} in METRC (${items.length} packages, ${n0(items.reduce((a, i) => a + Number(i.qty), 0))} lb)?` : `Dry run: check that METRC would take manifest ${d.manifest}? Nothing changes until Compliance goes Live.`,
            tags.length ? `${tags.length} go${tags.length === 1 ? 'es' : ''} straight onto our tag in METRC (labels on).` : '',
            tags.length < items.length ? `${items.length - tags.length} wait${items.length - tags.length === 1 ? 's' : ''} for our tag (Needs our tag).` : '',
        ].filter(Boolean).join('\n');
        if (!confirm(msg))
            return;
        setBusy(`Receiving ${d.manifest}…`);
        try {
            const r = await metrcRun(sb, {
                action: 'proc_return_receive', license: d.license, delivery_id: d.delivery_id,
                lines: items.map(i => ({ tag: i.tag, slot_id: ed[i.tag]?.slot_id ?? null, our_tag: ed[i.tag]?.our_tag.trim() || null, reweigh: ed[i.tag]?.reweigh ?? null })),
            });
            const bad = (r.sent ?? []).filter(x => x.state !== 'sent' && x.state !== 'checked' && x.state !== 'skipped');
            flash([r.info, bad.length ? `METRC retag problem: ${bad.map(b => `#${b.id} ${b.error ?? b.info ?? b.state}`).join('; ')}` : ''].filter(Boolean).join(' · '), !r.ok || bad.length > 0);
            if (r.live && r.ok) {
                setOpen(null);
                await reload();
                await load();
            }
        }
        catch (err) {
            flash(errText(err), true);
        }
        finally {
            setBusy(null);
        }
    }
    const ok = (rows ?? []).filter(d => !d.error);
    const errs = (rows ?? []).filter(d => d.error);
    return _jsxs(_Fragment, { children: [_jsxs("h3", { className: "csec row between", children: [_jsxs("span", { children: ["Manifests from processors ", _jsx("span", { className: "muted", children: ok.length || '' })] }), _jsxs("span", { className: "row", children: [_jsx("span", { className: `pill ${live ? 'm-bad' : 'm-warn'}`, children: live ? 'METRC Live' : 'Dry run' }), _jsx("button", { className: "ghost small", disabled: !!busy, onClick: load, children: busy ?? 'Refresh' })] })] }), errs.map(d => _jsxs("p", { className: "neg small", children: [d.site, " ", d.license, ": ", d.error] }, d.license)), rows && !ok.length && !busy && _jsx("p", { className: "muted", children: "No processor manifests waiting in METRC." }), ok.map(d => {
                const key = `${d.license}${d.delivery_id}`, items = d.items ?? [], isOpen = open === key, list = spots[d.site] ?? [];
                const missing = items.filter(i => !ed[i.tag]?.slot_id).length;
                return _jsxs("div", { className: "card", children: [_jsxs("div", { className: "row between wrap", children: [_jsxs("div", { children: [_jsx("b", { children: d.from }), " ", _jsx("span", { className: "muted", children: "manifest" }), " ", _jsx("b", { children: d.manifest }), _jsxs("div", { className: "muted small", children: ["to ", d.site, " \u00B7 left ", when(d.departed), d.driver ? ` · ${d.driver}` : ''] }), _jsxs("div", { className: "small", children: [items.length, " package", items.length === 1 ? '' : 's', " \u00B7 ", n0(items.reduce((a, i) => a + Number(i.qty), 0)), " lb"] })] }), _jsx("button", { className: isOpen ? 'ghost small' : 'primary small', onClick: () => { setOpen(isOpen ? null : key); if (!isOpen) {
                                        loadSpots(d.site);
                                        suggestTags(d);
                                    } }, children: isOpen ? 'Hide' : 'Open' })] }), isOpen && _jsxs(_Fragment, { children: [_jsx("div", { className: "cwrap fit", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Their tag" }), _jsx("th", { children: "METRC item" }), _jsx("th", { className: "num", children: "Lbs" }), _jsx("th", { children: "Spot" }), _jsxs("th", { children: ["Our tag ", _jsx("span", { className: "muted", children: "(label on)" })] }), _jsx("th", { className: "num", children: "Reweigh" }), _jsx("th", { className: "hide-s", children: "Wet lot" })] }) }), _jsx("tbody", { children: items.map(i => {
                                                    const e = ed[i.tag] ?? { slot_id: null, our_tag: '', reweigh: null };
                                                    const off = e.reweigh != null && Math.abs(e.reweigh - Number(i.qty)) > 0.5;
                                                    return _jsxs("tr", { children: [_jsx("td", { className: "small", children: _jsx(MTag, { t: i.tag }) }), _jsx("td", { className: "small", children: i.item }), _jsx("td", { className: "num", children: n0(i.qty) }), _jsx("td", { children: _jsxs("select", { value: e.slot_id ?? '', onChange: x => set(i.tag, { slot_id: x.target.value ? Number(x.target.value) : null }), className: e.slot_id ? '' : 'need', children: [_jsx("option", { value: "", children: "Pick a spot" }), list.filter(s => s.id === e.slot_id || left(d, s, i.tag) > 0).map(s => _jsxs("option", { value: s.id, children: [s.label, s.used || left(d, s, i.tag) < s.cap - s.used ? ' (stack)' : '', s.holds ? ` · ${s.holds}` : ''] }, s.id))] }) }), _jsx("td", { children: _jsx(TagInput, { compact: true, value: e.our_tag, onChange: v => set(i.tag, { our_tag: v }), where: { site: d.site, purpose: 'processing' }, placeholder: "Optional" }) }), _jsxs("td", { className: "num", children: [_jsx(NumIn, { value: e.reweigh, onChange: v => set(i.tag, { reweigh: v }), placeholder: "Optional" }), off ? _jsxs("div", { className: "warn-t small", children: ["Off by ", n0((e.reweigh ?? 0) - Number(i.qty))] }) : null] }), _jsx("td", { className: "hide-s small", children: i.wet_lot ? _jsxs(_Fragment, { children: [i.wet_lot, " ", _jsx("span", { className: "muted", children: "(METRC)" })] }) : _jsx("span", { className: "muted", children: "set in Drying" }) })] }, i.tag);
                                                }) })] }) }), _jsxs("div", { className: "row between wrap", children: [_jsx("span", { className: "muted small", children: "Lands at the manifest weight in its spot. A tag here means our label is on: METRC moves it onto our tag right away. Blank = Needs our tag." }), _jsxs("span", { className: "row", children: [missing > 0 && _jsxs("button", { className: "ghost small", disabled: !list.length, onClick: () => fillSpots(d), children: ["Fill open spots (", missing, ")"] }), isAdmin ? _jsx("button", { className: "primary", disabled: !!busy || missing > 0, onClick: () => receive(d), children: busy ?? (missing ? `${missing} need a spot` : live ? 'Receive' : 'Check (dry run)') })
                                                    : _jsx("span", { className: "muted small", children: "A Processing Admin receives these." })] })] })] })] }, key);
            })] });
}
/** Back on the processor's tag: Repackage onto our tag(s) (174, 175). Several lines at once: tag + item + lbs each. The first line starts
 *  with the whole package; every line is a split piece onto our tag, and a last line that takes all that's left repackages the package
 *  itself. Total can't be more than the package; anything left stays on their tag. METRC: new packages from theirs, on the license METRC
 *  has it on. Warns when the package is an input to an open run (finish the run instead). */
export function NeedsOurTag({ d, sb, flash, reload, isAdmin, openPkg }) {
    const rows = useMemo(() => d.pallets.filter(p => p.their_tag && (p.status === 'in_freezer' || p.status === 'unslotted')), [d]);
    const [form, setForm] = useState(null);
    const lot = (id) => d.pallets.find(p => p.id === id);
    const inRun = (id) => { const i = d.inputs.find(x => x.pallet_id === id && d.runs.some(r => r.id === x.run_id && r.status === 'open')); return i ? d.runs.find(r => r.id === i.run_id) ?? null : null; };
    if (!rows.length)
        return null;
    return _jsxs(_Fragment, { children: [_jsxs("h3", { className: "csec", children: ["Needs our tag ", _jsx("span", { className: "muted", children: rows.length })] }), _jsx("div", { className: "cwrap fit", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Package" }), _jsx("th", { children: "Strain" }), _jsx("th", { className: "num", children: "Lbs" }), _jsx("th", { className: "hide-s", children: "Their tag" }), _jsx("th", { className: "hide-s", children: "Wet lot" }), _jsx("th", { children: "Back" }), _jsx("th", {})] }) }), _jsx("tbody", { children: rows.map(p => {
                                const age = ageDays(p.returned_at), late = age > OVERDUE_DAYS, w = lot(p.wet_lot_id), run = inRun(p.id);
                                return _jsxs("tr", { children: [_jsxs("td", { className: "tap", onClick: () => openPkg(p), children: [_jsx("b", { children: p.code }), run ? _jsxs("span", { className: "pill warnp", children: ["in ", run.code] }) : null] }), _jsx("td", { children: p.strain }), _jsx("td", { className: "num", children: n0(p.current_weight) }), _jsx("td", { className: "hide-s small", children: _jsx(MTag, { t: p.package_tag }) }), _jsx("td", { className: "hide-s small", children: w ? `${w.code}${w.status === 'at_processor' ? ' (open)' : ''}` : _jsx("span", { className: "warn-t", children: "none" }) }), _jsxs("td", { className: late ? 'neg small' : 'muted small', children: [Math.floor(age), "d", late ? ' · overdue' : ''] }), _jsx("td", { children: isAdmin ? _jsx("button", { className: run ? 'ghost small' : 'primary small', onClick: () => setForm(p), children: "Repackage" }) : null })] }, p.id);
                            }) })] }) }), _jsxs("p", { className: "muted small", children: ["Repackage: put our labels on, then one line per new tag (item and lbs). More than ", OVERDUE_DAYS, " days on the processor's tag is overdue."] }), form && _jsx(RepackageSheet, { p: form, run: inRun(form.id), sb: sb, flash: flash, reload: reload, onClose: () => setForm(null) })] });
}
const r2 = (x) => Math.round(x * 100) / 100;
function RepackageSheet({ p, run, sb, flash, reload, onClose }) {
    const w = Number(p.current_weight ?? 0);
    const [lines, setLines] = useState([{ tag: '', item: null, lbs: w }]);
    const [items, setItems] = useState(null);
    const [metrcItem, setMetrcItem] = useState(null);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        let on = true;
        sb.rpc('new_package_items', { p_pallet_id: p.id }).then(({ data }) => { if (on)
            setItems((data ?? [])); });
        sb.rpc('pallet_metrc_item', { p_pallet_id: p.id }).then(({ data }) => { if (on)
            setMetrcItem(data ?? null); });
        return () => { on = false; };
    }, [p.id]);
    const cur = items?.find(i => i.current);
    const total = r2(lines.reduce((a, l) => a + (l.lbs ?? 0), 0));
    const left = r2(w - total);
    const over = total > w + 0.0001;
    const ok = !over && lines.every(l => l.tag.trim().length === 24 && (l.lbs ?? 0) > 0);
    const set = (i, x) => setLines(ls => ls.map((l, j) => j === i ? { ...l, ...x } : l));
    const itemName = (id) => (id ? items?.find(i => i.id === id)?.metrc_name : cur?.metrc_name) ?? 'same item';
    async function save() {
        const sum = lines.map(l => `${tagTxt(l.tag)}: ${n0(l.lbs)} lb, ${itemName(l.item)}`).join('\n');
        if (!confirm(`${p.code}: our labels are on?\n${sum}\n${left > 0.0001 ? `${n0(left)} lb stays on their tag (${p.package_tag}).` : `Their tag ${p.package_tag} goes to 0 and is finished.`}`))
            return;
        setBusy(true);
        try {
            const { data, error } = await sb.rpc('proc_repackage_multi', { p_pallet: p.id, p_lines: lines.map(l => ({ tag: l.tag.trim(), item_id: l.item, lbs: l.lbs })) });
            if (error)
                throw new Error(error.message);
            const res = data;
            const k = await metrcRun(sb, { action: 'kick' }).catch(() => null);
            const bad = (k?.results ?? []).filter(x => x.state === 'error');
            const done = `${res.lines.map(l => `${l.code} ${tagTxt(l.tag)} ${n0(l.lbs)} lb`).join(', ')}${res.left ? ` · ${n0(res.left)} lb still on their tag` : ''}`;
            flash(bad.length ? `${done}. METRC: ${bad.map(b => `#${b.id} ${b.error ?? b.info}`).join('; ')}` : done, bad.length > 0);
            await reload();
            onClose();
        }
        catch (e) {
            flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    return _jsxs(Sheet, { wide: true, title: `Repackage ${p.code} ${p.strain ?? ''}`, sub: `${n0(w)} lb on their tag ${tagTxt(p.package_tag)}${metrcItem ? ` · METRC: ${metrcItem}` : ''}`, onClose: onClose, children: [run && _jsxs("p", { className: "warn-t", children: [p.code, " is an input to open run ", run.code, ". Finish the run instead (what comes out goes on our tags). Repackaging it now takes it out from under the run."] }), lines.map((l, i) => _jsxs("div", { className: "row noline", children: [_jsx(TagInput, { compact: true, value: l.tag, onChange: v => set(i, { tag: v }), where: { pallet: p.id, purpose: 'processing' }, placeholder: "Label you put on" }), _jsxs("select", { value: l.item ?? '', onChange: e => set(i, { item: e.target.value ? Number(e.target.value) : null }), disabled: items == null, children: [_jsx("option", { value: "", children: items == null ? 'Loading…' : `Same item${cur ? ` (${cur.metrc_name})` : ''}` }), (items ?? []).filter(x => !x.current).map(x => _jsx("option", { value: x.id, children: x.metrc_name }, x.id))] }), _jsx(NumIn, { value: l.lbs, placeholder: "lbs", onChange: v => set(i, { lbs: v }) }), lines.length > 1 && _jsx("button", { className: "ghost small", onClick: () => setLines(ls => ls.filter((_, j) => j !== i)), children: "\u2715" })] }, i)), _jsx("div", { className: "row", children: _jsx("button", { className: "ghost small", onClick: () => setLines(ls => [...ls, { tag: '', item: ls[ls.length - 1]?.item ?? null, lbs: left > 0 ? left : null }]), children: "+ Another tag" }) }), _jsx("p", { className: over ? 'neg' : 'muted small', children: over ? `That's ${n0(total)} lb. ${p.code} only has ${n0(w)} lb.` : `${n0(total)} of ${n0(w)} lb${left > 0.0001 ? ` · ${n0(left)} lb stays on their tag` : ' · all of it'}` }), _jsx("p", { className: "muted small", children: "The item has to be on GVR processing's list in METRC. Every new package is made from their tag in METRC; the last line takes what's left and the package keeps its number and spot." }), _jsxs("div", { className: "row between csave", children: [_jsx("span", {}), _jsxs("span", { className: "row", children: [_jsx("button", { className: "ghost", onClick: onClose, children: "Cancel" }), _jsx("button", { className: "primary", disabled: busy || !ok, onClick: save, children: busy ? 'Saving…' : `Repackage (${lines.length} tag${lines.length === 1 ? '' : 's'})` })] })] })] });
}
/** close a wet lot out at a processor (everything came back): yield = dry back / wet sent */
export function CloseLotButton({ p, d, api, flash, reload }) {
    const [busy, setBusy] = useState(false);
    const back = d.pallets.filter(x => x.wet_lot_id === p.id);
    const dry = back.reduce((a, x) => a + Number(x.og_weight ?? x.current_weight ?? 0), 0);
    async function go(e) {
        e.stopPropagation();
        const wet = Number(p.og_weight ?? p.current_weight ?? 0);
        if (!confirm(back.length ? `Close ${p.code}? ${n0(dry)} lb dry came back from ${n0(wet)} lb wet (${wet ? Math.round(dry / wet * 1000) / 10 : '?'}%).`
            : `Close ${p.code} with nothing back? Its yield will be 0%.`))
            return;
        setBusy(true);
        try {
            const r = await api.closeLot(p.id);
            flash(`${r.code} closed: ${n0(r.dry)} lb from ${n0(r.wet)} lb wet (${r.yield_pct ?? '?'}%)`);
            await reload();
        }
        catch (err) {
            flash(errText(err), true);
        }
        finally {
            setBusy(false);
        }
    }
    return _jsx("button", { className: back.length ? 'primary small' : 'ghost small', disabled: busy, onClick: go, children: busy ? '…' : 'Close lot' });
}
/** Drying > Receive back: put packages that came back toward this wet lot (or take them off). No METRC: they're received in Inbound. */
export function ReceiveBackButton({ p, d, api, flash, reload }) {
    const [open, setOpen] = useState(false);
    return _jsxs(_Fragment, { children: [_jsx("button", { className: "ghost small", onClick: e => { e.stopPropagation(); setOpen(true); }, children: "Receive back" }), open && _jsx(ReceiveBackSheet, { lot: p, d: d, api: api, flash: flash, reload: reload, onClose: () => setOpen(false) })] });
}
function ReceiveBackSheet({ lot, d, api, flash, reload, onClose }) {
    const live = (x) => x.status === 'in_freezer' || x.status === 'unslotted';
    const linked = d.pallets.filter(x => x.wet_lot_id === lot.id);
    const same = (x) => (x.strain ?? '').toLowerCase() === (lot.strain ?? '').toLowerCase();
    // came back from a processor (received in Inbound, or by hand) and not on a lot yet
    const cands = d.pallets.filter(x => !x.wet_lot_id && live(x) && x.id !== lot.id && x.product !== 'wet' && (x.returned_at || x.their_tag))
        .sort((a, b) => Number(same(b)) - Number(same(a)) || (b.returned_at ?? '').localeCompare(a.returned_at ?? ''));
    const [pick, setPick] = useState(() => new Set(cands.filter(same).map(x => x.id)));
    const [busy, setBusy] = useState(false);
    const wet = Number(lot.og_weight ?? lot.current_weight ?? 0);
    const back = linked.reduce((a, x) => a + Number(x.og_weight ?? x.current_weight ?? 0), 0);
    const adding = cands.filter(x => pick.has(x.id)).reduce((a, x) => a + Number(x.og_weight ?? x.current_weight ?? 0), 0);
    async function save() {
        setBusy(true);
        try {
            for (const id of pick)
                await api.linkReturn(id, lot.id);
            flash(`${pick.size} put toward ${lot.code}`);
            await reload();
            onClose();
        }
        catch (e) {
            flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    async function unlink(x) {
        if (!confirm(`Take ${x.code} off ${lot.code}?`))
            return;
        setBusy(true);
        try {
            await api.linkReturn(x.id, null);
            flash(`${x.code} taken off ${lot.code}`);
            await reload();
            onClose();
        }
        catch (e) {
            flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    const row = (x) => _jsxs(_Fragment, { children: [_jsx("b", { children: x.code }), " ", _jsxs("span", { className: "muted", children: [x.strain, " \u00B7 ", n0(x.og_weight ?? x.current_weight), " lb \u00B7 ", tagTxt(x.package_tag), x.their_tag ? ' (their tag)' : ''] })] });
    return _jsxs(Sheet, { title: `Receive back: ${lot.code} ${lot.strain ?? ''}`, sub: `${n0(wet)} lb wet · ${n0(back)} lb back so far${wet ? ` (${Math.round(back / wet * 1000) / 10}%)` : ''}`, onClose: onClose, children: [_jsx("h4", { className: "subh", children: "On this lot" }), linked.length ? linked.map(x => _jsxs("div", { className: "row between noline", children: [_jsx("span", { children: row(x) }), _jsx("button", { className: "ghost small", disabled: busy, onClick: () => unlink(x), children: "Take off" })] }, x.id))
                : _jsx("p", { className: "muted", children: "Nothing yet." }), _jsx("h4", { className: "subh", children: "Came back, not on a lot" }), cands.length ? cands.map(x => _jsxs("label", { className: "row noline check", children: [_jsx("input", { type: "checkbox", checked: pick.has(x.id), onChange: e => setPick(s => { const n = new Set(s); if (e.target.checked)
                            n.add(x.id);
                        else
                            n.delete(x.id); return n; }) }), _jsxs("span", { children: [row(x), same(x) ? '' : _jsx("span", { className: "warn-t small", children: " \u00B7 different strain" })] })] }, x.id))
                : _jsx("p", { className: "muted", children: "Nothing waiting. Packages show up here once they're received in Processing \u203A Inbound." }), _jsxs("div", { className: "row between csave", children: [_jsx("span", { className: "muted small", children: pick.size ? `Adds ${n0(adding)} lb: ${n0(back + adding)} of ${n0(wet)} wet (${wet ? Math.round((back + adding) / wet * 1000) / 10 : '?'}%)` : '' }), _jsxs("span", { className: "row", children: [_jsx("button", { className: "ghost", onClick: onClose, children: "Cancel" }), _jsx("button", { className: "primary", disabled: busy || !pick.size, onClick: save, children: busy ? '…' : `Put ${pick.size || ''} toward ${lot.code}` })] })] })] });
}
/** "X lb back of Y wet (Z%)" for a wet lot */
export function lotBack(p, d) {
    const back = d.pallets.filter(x => x.wet_lot_id === p.id).reduce((a, x) => a + Number(x.og_weight ?? x.current_weight ?? 0), 0);
    const wet = Number(p.og_weight ?? p.current_weight ?? 0);
    return back ? `${n0(back)} lb back (${wet ? Math.round(back / wet * 1000) / 10 : '?'}%)` : null;
}
