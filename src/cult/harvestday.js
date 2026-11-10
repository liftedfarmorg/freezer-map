import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { NumIn, errText } from './ui';
import { can } from '../fold';
import { clock, computeBonus, hm } from './bonuscalc';
// Cultivation > Harvest: the day's card for a site. Entered once (first variety of the day) and used by every
// harvest at that site that day: room start, first box tagged, labor, La Meta, breaks. Feeds the Live Bonus screen.
const money = (n) => `$${n.toFixed(2)}`;
const hhmm = (s) => (s ? s.slice(0, 5) : '');
const nowHHMM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const fmtT = (s) => { const m = hm(s); return m == null ? '' : clock(m); };
const KIND = { break: 'Break', lunch: 'Lunch', pause: 'Line paused' };
const toForm = (d) => ({ room_start: hhmm(d.room_start), box_start: hhmm(d.box_start), people: d.people, buckers: d.buckers, cutters: d.cutters,
    est_hours: d.est_hours, hurdle: d.hurdle, hourly: d.hourly, per_lb: d.per_lb });
export function HarvestDayCard({ site, day, api, flash, startOpen }) {
    const [d, setD] = useState(null);
    const [f, setF] = useState(null);
    const [open, setOpen] = useState(!!startOpen);
    const [busy, setBusy] = useState(false);
    const [link, setLink] = useState(null);
    const [live, setLive] = useState(null);
    const [edBreak, setEdBreak] = useState(null);
    const [err, setErr] = useState(null);
    const load = async () => {
        try {
            const x = await api.harvestDay(site, day);
            setD(x);
            setF(toForm(x));
            setErr(null);
            if (x.is_new || x.people == null || x.box_start == null)
                setOpen(true);
            const tok = link ?? await api.bonusLink(site).catch(() => null);
            if (tok) {
                setLink(tok);
                const b = await api.bonusLive(tok, day).catch(() => null);
                if (b)
                    setLive(computeBonus(b, b.now_min));
            }
        }
        catch (e) {
            setErr(errText(e));
        }
    };
    useEffect(() => { load(); }, [site, day]);
    useEffect(() => { const t = setInterval(load, 60000); return () => clearInterval(t); }, [site, day, link]);
    if (err)
        return _jsxs("section", { className: "dcard hdaycard", children: [_jsx("div", { className: "dcard-h", children: _jsxs("h3", { children: ["Harvest day \u00B7 ", site] }) }), _jsx("p", { className: "warn-t small", children: err })] });
    if (!d || !f)
        return null;
    const edit = can('cultivation', 'edit', 'user');
    const set = (v) => setF(s => (s ? { ...s, ...v } : s));
    const changed = d.is_new || JSON.stringify(f) !== JSON.stringify(toForm(d));
    const run = async (fn, ok) => {
        setBusy(true);
        try {
            await fn();
            await load();
            flash(ok);
        }
        catch (e) {
            flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    };
    const save = () => run(() => api.saveHarvestDay(site, day, { ...f, room_start: f.room_start || null, box_start: f.box_start || null }), `${site} harvest day saved`);
    const going = d.breaks.find(b => !b.end_at);
    const url = link ? `${location.origin}/?bonus=${link}` : null;
    const isToday = day === new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const summary = [d.box_start ? `boxes from ${fmtT(d.box_start)}` : 'box start not set', d.people ? `${d.people} people` : null, d.buckers ? `${d.buckers} buckers` : null, d.hurdle ? `meta ${d.hurdle}` : null].filter(Boolean).join(' · ');
    return (_jsxs("section", { className: "dcard hdaycard", children: [_jsxs("div", { className: "dcard-h", children: [_jsxs("h3", { children: ["Harvest day \u00B7 ", site] }), _jsx("button", { className: "linkbtn", onClick: () => setOpen(o => !o), children: open ? 'Close' : 'Labor, breaks…' })] }), live && live.pallets > 0 && _jsxs("div", { className: "ckpis hk", children: [_jsxs("div", { children: [_jsx("b", { children: live.corr != null ? live.corr.toFixed(1) : '—' }), _jsxs("span", { children: ["lbs / person", live.hurdle ? ` (meta ${live.hurdle})` : ''] })] }), _jsxs("div", { children: [_jsx("b", { children: live.speed != null ? Math.round(live.speed) : '—' }), _jsx("span", { children: "lbs / bucker / hr" })] }), _jsxs("div", { children: [_jsx("b", { children: live.avgPalletMin != null ? live.avgPalletMin.toFixed(1) : '—' }), _jsx("span", { children: "min / pallet" })] }), _jsxs("div", { children: [_jsx("b", { children: money(live.bonusRate) }), _jsx("span", { children: live.won ? 'bonus / hr earned' : 'bonus / hr so far (paid at the meta)' })] })] }), !open && _jsxs("p", { className: "muted small", children: [summary, going ? ` · ${KIND[going.kind].toLowerCase()} since ${fmtT(going.start_at)}` : '', d.end_at ? ` · ended ${fmtT(d.end_at)}` : ''] }), open && _jsxs(_Fragment, { children: [d.is_new && _jsxs("p", { className: "cnote", children: ["Not started yet. The numbers are from the last harvest day at ", site, "; fix them and Save."] }), _jsxs("div", { className: "hpal hday3", children: [_jsxs("label", { children: [_jsxs("span", { children: ["Room start", edit && isToday && !f.room_start && _jsxs(_Fragment, { children: [" \u00B7 ", _jsx("a", { className: "linkbtn", onClick: e => { e.preventDefault(); set({ room_start: nowHHMM() }); }, children: "now" })] })] }), _jsx("input", { type: "time", value: f.room_start, disabled: !edit, onChange: e => set({ room_start: e.target.value }) })] }), _jsxs("label", { children: [_jsxs("span", { children: ["First box tagged", edit && isToday && !f.box_start && _jsxs(_Fragment, { children: [" \u00B7 ", _jsx("a", { className: "linkbtn", onClick: e => { e.preventDefault(); set({ box_start: nowHHMM() }); }, children: "now" })] })] }), _jsx("input", { type: "time", value: f.box_start, disabled: !edit, onChange: e => set({ box_start: e.target.value }) })] }), _jsxs("label", { children: [_jsx("span", { children: "People (labor chart)" }), _jsx(NumIn, { value: f.people, onChange: v => set({ people: v }) })] }), _jsxs("label", { children: [_jsx("span", { children: "Buckers" }), _jsx(NumIn, { value: f.buckers, onChange: v => set({ buckers: v }) })] }), _jsxs("label", { children: [_jsx("span", { children: "Cutters" }), _jsx(NumIn, { value: f.cutters, onChange: v => set({ cutters: v }) })] }), _jsxs("label", { children: [_jsx("span", { children: "Est. hours" }), _jsx(NumIn, { value: f.est_hours, onChange: v => set({ est_hours: v }) })] }), _jsxs("label", { children: [_jsx("span", { children: "La Meta (lbs / person)" }), _jsx(NumIn, { value: f.hurdle, onChange: v => set({ hurdle: v }) })] }), _jsxs("label", { children: [_jsx("span", { children: "Base $ / hr" }), _jsx(NumIn, { value: f.hourly, onChange: v => set({ hourly: v }) })] }), _jsxs("label", { children: [_jsx("span", { children: "Bonus $ / lb" }), _jsx(NumIn, { value: f.per_lb, onChange: v => set({ per_lb: v }) })] }), edit && _jsx("button", { className: "primary", disabled: busy || !changed, onClick: save, children: d.is_new ? 'Start the day' : 'Save' })] }), _jsxs("h4", { className: "csec", children: ["Breaks ", _jsx("span", { className: "muted", children: "time on a break doesn't count toward pallet times or speed" })] }), d.breaks.length > 0 && _jsx("div", { className: "dlist", children: d.breaks.map(b => edBreak?.id === b.id
                            ? _jsxs("div", { className: "drow hbreak", children: [_jsxs("select", { value: edBreak.kind, onChange: e => setEdBreak({ ...edBreak, kind: e.target.value }), children: [_jsx("option", { value: "break", children: "Break" }), _jsx("option", { value: "lunch", children: "Lunch" }), _jsx("option", { value: "pause", children: "Line paused" })] }), _jsx("input", { type: "time", value: edBreak.start, onChange: e => setEdBreak({ ...edBreak, start: e.target.value }), "aria-label": "Start" }), _jsx("input", { type: "time", value: edBreak.end, onChange: e => setEdBreak({ ...edBreak, end: e.target.value }), "aria-label": "End" }), _jsx("button", { className: "primary small", disabled: busy || !edBreak.start, onClick: () => run(() => api.breakEdit(b.id, edBreak.kind, edBreak.start, edBreak.end || null), 'Break fixed').then(() => setEdBreak(null)), children: "Save" }), _jsx("button", { className: "ghost small", onClick: () => setEdBreak(null), children: "Cancel" }), _jsx("button", { className: "ghost small", disabled: busy, onClick: () => run(() => api.breakRemove(b.id), 'Break removed').then(() => setEdBreak(null)), children: "\u2715" })] }, b.id)
                            : _jsxs("div", { className: "drow", children: [_jsxs("span", { className: "grow", children: [_jsx("b", { children: KIND[b.kind] ?? b.kind }), " ", _jsxs("span", { className: "muted", children: [fmtT(b.start_at), " to ", b.end_at ? fmtT(b.end_at) : 'now', b.end_at ? ` · ${(hm(b.end_at) - hm(b.start_at))} min` : ''] })] }), edit && !b.end_at && _jsx("button", { className: "primary small", disabled: busy, onClick: () => run(() => api.breakEnd(b.id), b.kind === 'pause' ? 'Line running again' : `${KIND[b.kind]} ended`), children: "End now" }), edit && _jsx("button", { className: "ghost small", disabled: busy, onClick: () => setEdBreak({ id: b.id, kind: b.kind, start: hhmm(b.start_at), end: hhmm(b.end_at) }), children: "Edit" })] }, b.id)) }), edit && !going && !d.end_at && _jsxs("div", { className: "row wrap", children: [isToday && _jsxs(_Fragment, { children: [_jsx("button", { className: "ghost", disabled: busy, onClick: () => run(() => api.breakStart(site, day, 'break'), 'Break started'), children: "Start break now" }), _jsx("button", { className: "ghost", disabled: busy, onClick: () => run(() => api.breakStart(site, day, 'lunch'), 'Lunch started'), children: "Start lunch now" }), _jsx("button", { className: "ghost hpause", disabled: busy, title: "Line down, technical issue: the time doesn't count", onClick: () => run(() => api.breakStart(site, day, 'pause'), 'Line paused'), children: "\u23F8 Pause the line" })] }), _jsx("button", { className: "linkbtn", disabled: busy, onClick: () => { const s = window.prompt('Break start (HH:MM, 24-hour)', '10:00'); if (s && /^\d{1,2}:\d{2}$/.test(s))
                                    run(() => api.breakStart(site, day, 'break', s), 'Break added'); }, children: "Add a past break\u2026" })] })] }), open && edit && !d.is_new && _jsx("div", { className: "row wrap hend", children: d.end_at
                    ? _jsxs(_Fragment, { children: [_jsxs("span", { className: "muted", children: ["Day ended at ", fmtT(d.end_at), ". The bonus screen shows the final numbers."] }), _jsx("button", { className: "linkbtn", disabled: busy, onClick: () => run(() => api.reopenDay(site, day), 'Day reopened'), children: "Reopen the day" })] })
                    : _jsx("button", { className: "ghost", disabled: busy, onClick: () => window.confirm(`End the ${site} harvest day now? Anything still running (a break or pause) ends too, and the bonus screen shows the final numbers.`) && run(() => api.endDay(site, day), 'Harvest day ended'), children: "End the day" }) }), url && _jsxs("div", { className: "row wrap hbonus", children: [_jsx("a", { className: "ghost small", href: url, target: "_blank", rel: "noreferrer", children: "Open Live Bonus screen" }), _jsx("button", { className: "ghost small", onClick: () => navigator.clipboard?.writeText(url).then(() => flash('Link copied. Open it on the TV.'), () => window.prompt('Copy this link', url)), children: "Copy TV link" }), open && can('cultivation', 'bonus_link') && _jsx("button", { className: "linkbtn", disabled: busy, onClick: () => { if (window.confirm(`Make a new ${site} TV link? The old one stops working.`))
                            run(async () => setLink(await api.bonusLinkReset(site)), 'New link made'); }, children: "New link" })] })] }));
}
