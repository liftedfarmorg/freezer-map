import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { calcHarvest, fieldName, fmtD, KIND_SHORT, n0, testRows, today } from './calc';
import { describeLog } from './setup';
/** Cultivation > Review: things that need someone's attention */
export function ReviewTab({ d, c, site, onOpen, go }) {
    const now = today();
    const live = d.harvests.filter(h => h.status !== 'cancelled' && (!site || h.site === site));
    const unlogged = live.filter(h => h.status === 'planned' && !h.stage && h.planned_on && h.planned_on < now).sort((a, b) => a.planned_on.localeCompare(b.planned_on));
    const noWeight = live.filter(h => h.status === 'done' && h.kind === 'ff' && calcHarvest(c, h).actFF == null);
    const tests = useMemo(() => { const t = testRows(d, c, now); return [...t.area, ...t.strain].filter(r => (!site || r.site === site) && r.status === 'Window passed - sample ASAP'); }, [d, c, site, now]);
    // a planting is on the schedule if a harvest points at it, or one is planned for the same field and strain, or the whole field is (biomass)
    const hs = d.harvests.filter(h => h.status !== 'cancelled');
    const planted = new Set(hs.filter(h => h.planting_id != null).map(h => h.planting_id));
    const fs = new Set(hs.flatMap(h => [`${h.crop_year}|${h.field_id}|${h.strain.toLowerCase()}`, ...(h.kind === 'combine' || h.kind === 'strip' ? [`${h.crop_year}|${h.field_id}|*`] : [])]));
    const noHarvest = d.plantings.filter(p => (!site || p.site === site) && (p.plants ?? 0) > 0 && !planted.has(p.id) && !fs.has(`${p.crop_year}|${p.field_id}|${p.strain.toLowerCase()}`) && !fs.has(`${p.crop_year}|${p.field_id}|*`));
    const total = unlogged.length + noWeight.length + tests.length + noHarvest.length;
    const hRow = (h, tag) => (_jsxs("button", { className: "drow click", onClick: () => onOpen(h), children: [_jsxs("span", { children: [_jsx("b", { children: h.strain }), _jsxs("span", { className: "muted", children: [" \u00B7 ", h.site, " ", fieldName(c, h.field_id), " \u00B7 ", KIND_SHORT[h.kind]] })] }), _jsx("span", { className: "pill badp", children: tag })] }, h.id));
    return (_jsxs("div", { className: "dash", children: [total === 0 && _jsxs("p", { className: "muted", children: ["Nothing needs attention in the ", d.year, " season", site ? ` at ${site}` : '', "."] }), unlogged.length > 0 && _jsxs("section", { className: "dcard", children: [_jsx("div", { className: "dcard-h", children: _jsxs("h3", { children: ["Harvests not logged ", _jsx("span", { className: "side-badge", children: unlogged.length })] }) }), _jsx("p", { className: "muted", children: "The day has passed but nobody logged the harvest. Log it on the Harvest screen, or tap one to edit or cancel it." }), _jsx("div", { className: "dlist", children: unlogged.map(h => hRow(h, fmtD(h.planned_on, true))) })] }), noWeight.length > 0 && _jsxs("section", { className: "dcard", children: [_jsx("div", { className: "dcard-h", children: _jsxs("h3", { children: ["Harvested, no weight ", _jsx("span", { className: "side-badge", children: noWeight.length })] }) }), _jsx("p", { className: "muted", children: "Marked done with no fresh frozen lbs and no pallets. Add the weight so yields and the season total are right." }), _jsx("div", { className: "dlist", children: noWeight.map(h => hRow(h, fmtD(h.harvested_on ?? h.planned_on, true))) })] }), tests.length > 0 && _jsxs("section", { className: "dcard", children: [_jsxs("div", { className: "dcard-h", children: [_jsxs("h3", { children: ["Tests past their window ", _jsx("span", { className: "side-badge", children: tests.length })] }), _jsx("button", { className: "linkbtn", onClick: () => go('testing'), children: "Testing \u203A" })] }), _jsx("div", { className: "dlist", children: tests.map(r => _jsxs("div", { className: "drow", children: [_jsxs("span", { children: [_jsx("b", { children: r.ref }), _jsxs("span", { className: "muted", children: [" \u00B7 first harvest ", fmtD(r.first, true)] })] }), _jsx("span", { className: "pill badp", children: "sample ASAP" })] }, r.key)) })] }), noHarvest.length > 0 && _jsxs("section", { className: "dcard", children: [_jsxs("div", { className: "dcard-h", children: [_jsxs("h3", { children: ["Plantings with no harvest ", _jsx("span", { className: "side-badge", children: noHarvest.length })] }), _jsx("button", { className: "linkbtn", onClick: () => go('plantings'), children: "Fields \u203A" })] }), _jsx("p", { className: "muted", children: "In the ground but not on the harvest schedule yet." }), _jsxs("div", { className: "dlist", children: [noHarvest.slice(0, 30).map(p => _jsxs("div", { className: "drow", children: [_jsxs("span", { children: [_jsx("b", { children: p.strain }), _jsxs("span", { className: "muted", children: [" \u00B7 ", p.site, " ", fieldName(c, p.field_id), p.planted_on ? ` · planted ${fmtD(p.planted_on)}` : ''] })] }), _jsxs("span", { children: [n0(p.plants), " plants"] })] }, p.id)), noHarvest.length > 30 && _jsxs("div", { className: "muted small-note", children: ["+", noHarvest.length - 30, " more"] })] })] })] }));
}
/** Cultivation > Activity: every change made in Cultivation */
export function ActivityTab({ api }) {
    const [log, setLog] = useState(null);
    useEffect(() => { api.log(300).then(setLog).catch(() => setLog([])); }, [api]);
    if (!log)
        return _jsx("p", { className: "muted", children: "Loading\u2026" });
    if (!log.length)
        return _jsx("p", { className: "muted", children: "No changes yet." });
    return (_jsx("div", { className: "list", children: log.map(r => (_jsxs("div", { className: "li static", children: [_jsx("div", { children: describeLog(r) }), _jsxs("div", { className: "muted", children: [new Date(r.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }), " \u00B7 ", (r.user_email ?? '').split('@')[0]] })] }, r.id))) }));
}
