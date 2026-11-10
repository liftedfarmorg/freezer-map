import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
export function DashHead({ title, sub, right }) {
    return (_jsxs("div", { className: "dhead", children: [_jsxs("div", { children: [_jsx("h2", { children: title }), sub && _jsx("div", { className: "muted", children: sub })] }), right && _jsx("div", { className: "row", children: right })] }));
}
export function Tiles({ children }) { return _jsx("div", { className: "dtiles", children: children }); }
/** "539,707 lbs" -> big number + small unit */
function bigValue(v) {
    if (typeof v !== 'string')
        return v;
    const m = /^(.+?) (lbs|clones|days)$/.exec(v);
    return m ? _jsxs(_Fragment, { children: [m[1], _jsx("span", { className: "dt-u", children: m[2] })] }) : v;
}
/** one number that matters, with what it means and where to go about it.
 *  wide: spans two columns (headline numbers) · range: chart window label · chart: <Spark>/<Bars> · kv: side figures on wide tiles · foot: the next move */
export function Tile({ value, label, sub, tone, onClick, foot, wide, range, chart, kv }) {
    const cls = `dtile ${tone && tone !== 'ok' ? 't-' + tone : ''} ${wide ? 'w2' : ''} ${onClick ? 'click' : ''}`;
    const big = _jsx("b", { className: "dt-v", children: bigValue(value) });
    const body = _jsxs(_Fragment, { children: [_jsxs("div", { className: "dt-b", children: [_jsxs("div", { className: "dt-h", children: [_jsxs("span", { className: "dt-l", children: [_jsx("i", { className: "dt-dot", "aria-hidden": "true" }), label] }), range != null && _jsx("span", { className: "dt-r", children: range }), onClick && foot == null && range == null && _jsx("span", { className: "dt-go", "aria-hidden": "true", children: "\u203A" })] }), kv?.length ? _jsxs("div", { className: "dt-row", children: [big, _jsx("div", { className: "dt-kv", children: kv.map(([v, l], i) => _jsxs("span", { children: [_jsx("b", { children: v }), l] }, i)) })] }) : big, sub != null && sub !== '' && _jsx("span", { className: "dt-s", children: sub }), chart && _jsx("div", { className: "dt-c", children: chart })] }), foot != null && foot !== '' && _jsxs("div", { className: "dt-f", children: [_jsx("span", { children: foot }), onClick && _jsx("span", { "aria-hidden": "true", children: "\u203A" })] })] });
    return onClick ? _jsx("button", { className: cls, onClick: onClick, children: body }) : _jsx("div", { className: cls, children: body });
}
const pts = (a) => (a ?? []).map((v, i) => [i, v]).filter((p) => p[1] != null && isFinite(p[1]));
/** a small trend line. All arrays share one x axis (index = day/step).
 *  data: the real line (nulls where there's nothing yet) · ghost: comparison (last year / last month), dashed ·
 *  project: where it's heading, dotted, from the last real point on · goal: a flat target line · labels: under the axis */
export function Spark({ data, ghost, project, goal, labels, empty = 'Trend starts building today' }) {
    const real = pts(data);
    if (real.length < 2)
        return _jsx("div", { className: "dt-empty", children: empty });
    const n = Math.max(data.length, ghost?.length ?? 0, project?.length ?? 0);
    const g = pts(ghost), pr = pts(project);
    const vals = [...real, ...g, ...pr].map(p => p[1]).concat(goal != null ? [goal] : []);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi === lo) {
        hi += 1;
        lo -= 1;
    }
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;
    const X = (i) => (n > 1 ? (i / (n - 1)) * 100 : 0);
    const Y = (v) => 40 - ((v - lo) / (hi - lo)) * 40;
    const line = (ps) => ps.map(([i, v]) => `${X(i).toFixed(2)},${Y(v).toFixed(2)}`).join(' ');
    const last = real[real.length - 1];
    const area = `M${X(real[0][0]).toFixed(2)},40 L${line(real).split(' ').join(' L')} L${X(last[0]).toFixed(2)},40 Z`;
    const proj = pr.filter(p => p[0] > last[0]);
    return (_jsxs("div", { className: "spark", children: [_jsxs("div", { className: "spark-p", children: [_jsxs("svg", { viewBox: "0 0 100 40", preserveAspectRatio: "none", "aria-hidden": "true", children: [goal != null && _jsx("line", { x1: "0", x2: "100", y1: Y(goal), y2: Y(goal), className: "sp-goal", vectorEffect: "non-scaling-stroke" }), g.length > 1 && _jsx("polyline", { points: line(g), className: "sp-ghost", vectorEffect: "non-scaling-stroke" }), _jsx("path", { d: area, className: "sp-area" }), proj.length > 0 && _jsx("polyline", { points: line([last, ...proj]), className: "sp-proj", vectorEffect: "non-scaling-stroke" }), _jsx("polyline", { points: line(real), className: "sp-line", vectorEffect: "non-scaling-stroke" })] }), _jsx("i", { className: "sp-dot", style: { left: `${X(last[0])}%`, top: `${(Y(last[1]) / 40) * 100}%` } })] }), labels && _jsx("div", { className: "sp-ax", children: labels.map((l, i) => _jsx("span", { children: l }, i)) })] }));
}
/** a row of day bars (next 7 days and the like); the biggest bar is solid */
export function Bars({ items }) {
    const max = Math.max(1, ...items.map(x => x.value));
    const top = items.reduce((a, x, i) => (x.value > items[a].value ? i : a), 0);
    return (_jsx("div", { className: "dbars", children: items.map((x, i) => (_jsxs("div", { title: x.title, children: [_jsx("i", { className: i === top && x.value > 0 ? 'pk' : '', style: { height: `${x.value > 0 ? Math.max(4, (x.value / max) * 100) : 0}%` } }), _jsx("span", { children: x.label })] }, i))) }));
}
/** legend for a Spark: solid line = now, dashed = the comparison */
export function Legend({ now, then }) {
    return _jsxs("span", { className: "dt-lg", children: [_jsxs("span", { children: [_jsx("i", {}), now] }), then && _jsxs("span", { children: [_jsx("i", { className: "g" }), then] })] });
}
export function Cards({ children }) { return _jsx("div", { className: "dcards", children: children }); }
export function Card({ title, badge, action, onAction, wide, children }) {
    return (_jsxs("section", { className: `dcard ${wide ? 'wide' : ''}`, children: [_jsxs("div", { className: "dcard-h", children: [_jsxs("h3", { children: [title, badge != null && badge !== 0 && badge !== '' && _jsx("span", { className: "side-badge", children: badge })] }), action && onAction && _jsxs("button", { className: "linkbtn", onClick: onAction, children: [action, " \u203A"] })] }), _jsx("div", { className: "dcard-b", children: children })] }));
}
/** a horizontal bar: how full / how far along */
export function Meter({ value, max, tone, label, right }) {
    const p = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
    return (_jsxs("div", { className: "dmeter", children: [(label || right) && _jsxs("div", { className: "dmeter-l", children: [_jsx("span", { children: label }), _jsx("span", { children: right })] }), _jsx("div", { className: "dmeter-bar", role: "meter", "aria-valuemin": 0, "aria-valuemax": max, "aria-valuenow": value, children: _jsx("i", { className: tone ? 't-' + tone : '', style: { width: `${p * 100}%` } }) })] }));
}
export function Empty({ children }) { return _jsx("div", { className: "muted dempty", children: children }); }
// ---------- trend helpers ----------
/** yyyy-mm-dd in local time */
export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** the last `days` days ending today, as yyyy-mm-dd */
export function lastDays(days, end = new Date()) {
    return Array.from({ length: days }, (_, i) => { const d = new Date(end); d.setDate(d.getDate() - (days - 1 - i)); return ymd(d); });
}
/** short date for axis labels */
export const axisDate = (s) => new Date(s + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
/** straight line through the last `fit` points: how many more steps until it reaches `target` (null if it isn't heading there) */
export function projectTo(series, target, fit = 14) {
    const ps = pts(series).slice(-fit);
    if (ps.length < 5)
        return { slope: 0, hitsIn: null };
    const mx = ps.reduce((a, p) => a + p[0], 0) / ps.length, my = ps.reduce((a, p) => a + p[1], 0) / ps.length;
    const num = ps.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0), den = ps.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
    const slope = den ? num / den : 0;
    const last = ps[ps.length - 1][1];
    if (!slope || (target - last) / slope <= 0)
        return { slope, hitsIn: null };
    return { slope, hitsIn: Math.ceil((target - last) / slope) };
}
