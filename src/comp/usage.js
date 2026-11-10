import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { errText } from '../cult/ui';
// Usage meters for T3 and the METRC API (138). Both have 50,000 calls a month. Warnings at 70% and 90% (Compliance > Settings).
// Nothing is paused at any level yet: we're measuring first.
const n0 = (x) => Math.round(x).toLocaleString();
const SRC = { worker: 'Auto sends (every minute)', overnight: 'Overnight jobs', nightly: 'Nightly METRC pull', app: 'People in the app' };
const month = (iso) => new Date(`${iso}T12:00:00`).toLocaleString([], { month: 'long' });
const tone = (pct, warn) => (pct >= (warn[1] ?? 90) ? 'bad' : pct >= (warn[0] ?? 70) ? 'warn' : 'ok');
export const warnLevels = (u) => (u?.warn ?? '70,90').split(',').map(Number).filter(Boolean).sort((a, b) => a - b);
export function useUsage(c) {
    const [u, setU] = useState(null);
    const [err, setErr] = useState(null);
    const load = () => c.api.usage().then(x => { setU(x); setErr(null); }).catch(e => setErr(errText(e)));
    useEffect(() => { load(); }, []);
    return { u, err, load };
}
function Bar({ pct, cls }) {
    const color = cls === 'bad' ? 'var(--bad)' : cls === 'warn' ? 'var(--warn)' : 'var(--brand)';
    return _jsx("div", { className: "mbar-track", style: { height: 10, borderRadius: 5 }, children: _jsx("div", { style: { width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: 5 } }) });
}
function Meter({ s, warn }) {
    const t = tone(s.pct, warn);
    const pt = tone(s.projected_pct, warn);
    const days = s.days.slice(-14);
    const max = Math.max(1, ...days.map(d => d.calls));
    const partial = s.counting_since > s.period;
    return _jsxs("div", { className: "infobox", style: { marginBottom: 10 }, children: [_jsxs("div", { className: "row between wrap", style: { alignItems: 'baseline', gap: 8 }, children: [_jsx("b", { children: s.label }), _jsxs("span", { className: "small", children: [_jsx("b", { children: n0(s.calls) }), " of ", n0(s.limit), " calls in ", month(s.period), " ", _jsxs("span", { className: `pill cp-${t}`, children: [s.pct, "%"] })] })] }), _jsx("div", { style: { margin: '6px 0' }, children: _jsx(Bar, { pct: s.pct, cls: t }) }), _jsxs("div", { className: "row wrap small muted", style: { gap: 14 }, children: [_jsxs("span", { children: ["Today ", _jsx("b", { children: n0(s.today) })] }), _jsxs("span", { children: ["Average ", _jsx("b", { children: n0(s.avg_per_day) }), "/day"] }), _jsxs("span", { children: ["Month end at this pace ", _jsx("b", { style: { color: pt === 'ok' ? undefined : pt === 'warn' ? 'var(--warn)' : 'var(--bad)' }, children: n0(s.projected) }), " (", s.projected_pct, "%)"] }), _jsxs("span", { children: [n0(s.reads), " reads \u00B7 ", n0(s.writes), " writes", s.errors ? ` · ${n0(s.errors)} errors` : ''] })] }), partial && _jsxs("div", { className: "muted small", children: ["Counting started ", new Date(`${s.counting_since}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' }), ", so this month is partial. The pace uses only the days counted."] }), !!Object.keys(s.by_source).length && _jsx("div", { className: "dlist", style: { marginTop: 6 }, children: Object.entries(s.by_source).sort((a, b) => b[1] - a[1]).map(([k, v]) => _jsxs("div", { className: "drow small", children: [_jsx("span", { className: "grow", children: SRC[k] ?? k }), _jsx("b", { children: n0(v) }), _jsxs("span", { className: "muted", style: { width: 44, textAlign: 'right' }, children: [s.calls ? Math.round(v * 100 / s.calls) : 0, "%"] })] }, k)) }), days.length > 1 && _jsx("div", { style: { display: 'flex', alignItems: 'flex-end', gap: 3, height: 40, marginTop: 8 }, title: "Calls per day, last 14 days", children: days.map(d => _jsx("div", { title: `${d.day}: ${n0(d.calls)} calls`, style: { flex: 1, height: `${Math.max(4, d.calls * 100 / max)}%`, background: 'var(--line)', borderRadius: 2 } }, d.day)) }), !s.calls && _jsx("div", { className: "muted small", children: "No calls counted yet this month." })] });
}
/** Compliance > Settings: both meters, limits and warning levels */
export function UsageMeters({ c }) {
    const { u, err, load } = useUsage(c);
    const warn = warnLevels(u);
    const [edit, setEdit] = useState(false);
    const [lim, setLim] = useState({});
    const [w, setW] = useState('');
    useEffect(() => { if (u) {
        setLim(Object.fromEntries(u.services.map(s => [s.service, String(s.limit)])));
        setW(u.warn ?? '70,90');
    } }, [u]);
    async function save() {
        try {
            for (const s of u?.services ?? [])
                if (Number(lim[s.service]) !== s.limit)
                    await c.api.setUsage(s.service, Number(lim[s.service]), null);
            if (w !== (u?.warn ?? ''))
                await c.api.setUsage(null, null, w);
            setEdit(false);
            await load();
            c.flash('Saved');
        }
        catch (e) {
            c.flash(errText(e), true);
        }
    }
    return _jsxs(_Fragment, { children: [_jsxs("div", { className: "row between wrap", style: { alignItems: 'center' }, children: [_jsx("h3", { style: { margin: '4px 0' }, children: "Usage this month" }), _jsxs("span", { className: "row", style: { gap: 6 }, children: [_jsx("button", { className: "ghost small", onClick: load, children: "Refresh" }), c.isAdmin && _jsx("button", { className: "ghost small", onClick: () => setEdit(!edit), children: edit ? 'Close' : 'Limits' })] })] }), _jsxs("p", { className: "muted small", children: ["Every call the app makes to T3 and the METRC API is counted here. Warnings at ", warn.join('% and '), "%. Nothing is paused yet: we're measuring first."] }), err && _jsx("p", { className: "neg small", children: /metrc_usage_now|function|schema cache/i.test(err) ? 'Run 138_metrc_route_usage.sql to turn the meters on.' : err }), edit && u && _jsxs("div", { className: "infobox", style: { marginBottom: 10 }, children: [_jsxs("div", { className: "row wrap", style: { gap: 10 }, children: [u.services.map(s => _jsxs("label", { className: "small", children: [s.label, " calls a month", _jsx("br", {}), _jsx("input", { type: "number", min: 0, value: lim[s.service] ?? '', onChange: e => setLim({ ...lim, [s.service]: e.target.value }), style: { width: 110 } })] }, s.service)), _jsxs("label", { className: "small", children: ["Warn at (%)", _jsx("br", {}), _jsx("input", { value: w, onChange: e => setW(e.target.value), style: { width: 90 } })] })] }), _jsx("div", { style: { marginTop: 8 }, children: _jsx("button", { className: "primary small", onClick: save, children: "Save" }) })] }), u?.services.map(s => _jsx(Meter, { s: s, warn: warn }, s.service))] });
}
/** a warning line for the Compliance dashboard and Review once a meter passes the first warning level */
export function UsageWarning({ c }) {
    const { u } = useUsage(c);
    const warn = warnLevels(u);
    const hot = (u?.services ?? []).filter(s => s.pct >= (warn[0] ?? 70));
    if (!hot.length)
        return null;
    return _jsxs("div", { className: "infobox", style: { borderColor: 'var(--warn)', marginBottom: 12 }, children: [hot.map(s => _jsxs("div", { children: [_jsxs("span", { className: `pill cp-${tone(s.pct, warn)}`, children: [s.pct, "%"] }), " ", _jsx("b", { children: s.label }), " has used ", n0(s.calls), " of its ", n0(s.limit), " calls this month", _jsxs("span", { className: "muted small", children: [" \u00B7 at this pace ", n0(s.projected), " by month end"] })] }, s.service)), c.isAdmin && _jsx("button", { className: "linkbtn small", onClick: () => c.go('settings'), children: "See usage in Settings \u203A" })] });
}
