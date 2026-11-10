import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { availability, fmtD, monday, n0, pct, sum, today } from './calc';
import { F, NumIn, SaveBar, Sheet, StrainList, TextIn, errText } from './ui';
export function AvailabilityTab({ d, c, site, q, api, flash, onSaved }) {
    const { weeks, rows } = availability(d, c, site);
    const [edit, setEdit] = useState(null);
    const ql = q.trim().toLowerCase();
    const shown = rows.filter(([s, m]) => (!ql || s.toLowerCase().includes(ql)) && [...m.values()].some(x => x.est + x.act > 0));
    const thisWeek = monday(today());
    const tot = (w) => sum(shown.map(([, m]) => { const x = m.get(w); return x ? x.est + x.act : 0; }));
    // dry flower picks: when each strain is scheduled to be harvested dry (or fresh frozen only)
    const picks = d.picks.filter(p => !ql || p.strain.toLowerCase().includes(ql)).map(p => {
        const hs = d.harvests.filter(h => h.strain.toLowerCase() === p.strain.toLowerCase() && h.status !== 'cancelled' && h.planned_on && (!site || h.site === site));
        const dryH = hs.filter(h => h.kind === 'dry').sort((a, b) => a.planned_on.localeCompare(b.planned_on));
        const ffH = hs.filter(h => h.kind === 'ff').sort((a, b) => a.planned_on.localeCompare(b.planned_on));
        const first = dryH[0] ?? ffH[0];
        const convs = dryH.map(h => h.dry_conversion).filter((x) => x != null);
        const conv = convs.length ? convs.reduce((a, b) => a + b, 0) / convs.length : (c.site.get(first?.site ?? 'OHR')?.dry_conversion ?? 0.075);
        return { p, first, type: dryH.length ? 'Dry' : ffH.length ? 'Fresh frozen only' : 'Not scheduled', conv, wet: conv ? p.dry_lbs / conv : null };
    });
    return (_jsxs(_Fragment, { children: [_jsxs("h3", { className: "csec", children: ["Fresh frozen by week ", _jsxs("span", { className: "muted", children: ["lbs; estimates until harvested, then actual \u00B7 ready ", d.settings.readyDays, " days after harvest"] })] }), !weeks.length ? _jsx("p", { className: "muted", children: "No fresh frozen harvests this season." }) : (_jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable", style: { minWidth: Math.max(640, 180 + weeks.length * 70) }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Strain" }), weeks.map(w => _jsx("th", { className: `num ${w === thisWeek ? 'on' : ''}`, children: fmtD(w) }, w)), _jsx("th", { className: "num", children: "Season" })] }) }), _jsxs("tbody", { children: [_jsxs("tr", { className: "tot", children: [_jsx("td", { children: "All strains" }), weeks.map(w => _jsx("td", { className: "num", children: n0(tot(w)) }, w)), _jsx("td", { className: "num", children: n0(sum(weeks.map(tot))) })] }), shown.map(([s, m]) => {
                                    const all = sum([...m.values()].map(x => x.est + x.act));
                                    return (_jsxs("tr", { children: [_jsx("td", { children: s }), weeks.map(w => {
                                                const x = m.get(w);
                                                const v = x ? x.est + x.act : 0;
                                                return _jsx("td", { className: "num", title: x ? `${n0(x.act)} harvested, ${n0(x.est)} estimated` : '', children: v ? (x.act && !x.est ? _jsx("b", { children: n0(v) }) : n0(v)) : '' }, w);
                                            }), _jsx("td", { className: "num", children: _jsx("b", { children: n0(all) }) })] }, s));
                                })] })] }) })), _jsx("p", { className: "cnote", children: "Bold = already harvested. Week columns start Monday. Hover a number to see harvested vs estimated." }), _jsxs("div", { className: "row between", children: [_jsxs("h3", { className: "csec", children: ["Dry flower picks ", _jsx("span", { className: "muted", children: "dry lbs wanted \u2192 wet lbs to harvest" })] }), _jsx("button", { className: "primary small", onClick: () => setEdit({ crop_year: d.year, strain: '', dry_lbs: 0 }), children: "+ Add strain" })] }), _jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Strain" }), _jsx("th", { className: "num", children: "Dry lbs wanted" }), _jsx("th", { children: "Scheduled" }), _jsx("th", { children: "Site" }), _jsx("th", { children: "Type" }), _jsx("th", { className: "num", children: "Conversion" }), _jsx("th", { className: "num", children: "Wet lbs to harvest" })] }) }), _jsxs("tbody", { children: [picks.map(x => (_jsxs("tr", { className: "tap", onClick: () => setEdit(x.p), children: [_jsx("td", { children: x.p.strain }), _jsx("td", { className: "num", children: n0(x.p.dry_lbs) }), _jsx("td", { className: "nowrap", children: x.first ? fmtD(x.first.planned_on, true) : _jsx("span", { className: "warn-t", children: "Not scheduled" }) }), _jsx("td", { children: x.first?.site ?? '' }), _jsx("td", { className: x.type === 'Dry' ? '' : 'warn-t', children: x.type }), _jsx("td", { className: "num", children: pct(x.conv) }), _jsx("td", { className: "num", children: n0(x.wet) })] }, x.p.id))), !picks.length && _jsx("tr", { children: _jsxs("td", { colSpan: 7, className: "muted", children: ["No dry flower picks for ", d.year, " yet."] }) })] }), picks.length > 0 && _jsx("tfoot", { children: _jsxs("tr", { className: "tot", children: [_jsx("td", { children: "Total" }), _jsx("td", { className: "num", children: n0(sum(picks.map(x => x.p.dry_lbs))) }), _jsx("td", { colSpan: 4 }), _jsx("td", { className: "num", children: n0(sum(picks.map(x => x.wet))) })] }) })] }) }), _jsx("p", { className: "cnote", children: "\"Fresh frozen only\" means the strain is on the schedule but has no dry harvest yet. Add one on the Schedule tab (type Dry)." }), edit && _jsx(PickSheet, { d: d, p: edit, api: api, flash: flash, onClose: () => setEdit(null), onSaved: async (m) => { setEdit(null); await onSaved(m); } })] }));
}
function PickSheet({ d, p, api, flash, onClose, onSaved }) {
    const [x, setX] = useState(p);
    const [busy, setBusy] = useState(false);
    const run = async (f, m) => { setBusy(true); try {
        await f();
        await onSaved(m);
    }
    catch (e) {
        flash(errText(e), true);
    }
    finally {
        setBusy(false);
    } };
    return (_jsxs(Sheet, { title: p.id ? p.strain : 'Dry flower pick', onClose: onClose, children: [_jsx(StrainList, { id: "cult-strains", names: d.strains.map(s => s.name) }), _jsx(F, { label: "Strain", children: _jsx(TextIn, { value: x.strain, list: "cult-strains", autoFocus: !p.id, onChange: v => setX({ ...x, strain: v ?? '' }) }) }), _jsx(F, { label: "Dry lbs wanted", children: _jsx(NumIn, { value: x.dry_lbs, onChange: v => setX({ ...x, dry_lbs: v ?? 0 }) }) }), _jsx(F, { label: "Notes", children: _jsx(TextIn, { value: x.notes, onChange: v => setX({ ...x, notes: v }) }) }), _jsx(SaveBar, { busy: busy, disabled: !x.strain?.trim(), onCancel: onClose, onSave: () => run(() => api.save('cult_flower_picks', x), 'Saved'), onDelete: p.id ? () => run(() => api.remove('cult_flower_picks', p.id), 'Removed') : undefined })] }));
}
