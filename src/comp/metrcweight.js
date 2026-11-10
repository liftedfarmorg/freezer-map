import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
const r2 = (n) => Math.round(n * 100) / 100;
const fmt = (n) => (n == null ? '?' : `${r2(Number(n)).toLocaleString()} lbs`);
const when = (s) => {
    if (!s)
        return '';
    const d = new Date(s);
    return d.toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const STATE = { active: '', intransit: 'in transit', transferred: 'transferred out', inactive: 'finished', gone: 'gone from METRC' };
/** what METRC had for this pallet's tag at the last pull (null = 114 not run, or no access) */
export async function metrcWeight(sb, palletId) {
    const { data, error } = await sb.rpc('pallet_metrc_weight', { p_pallet_id: palletId });
    return error ? null : data;
}
async function liveWeight(sb, palletId) {
    const { data } = await sb.auth.getSession();
    const r = await fetch('/api/metrc/run', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ action: 'package_weight', pallet_id: palletId }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok)
        return { error: j.error || `METRC check failed (${r.status})` };
    return j;
}
/** <dl> row: METRC weight, with how far it is from the app's */
export function MetrcWeightRow({ sb, palletId, appLbs, tag }) {
    const [w, setW] = useState(undefined);
    const [live, setLive] = useState(null);
    const [checking, setChecking] = useState(false);
    useEffect(() => { if (!sb)
        return; setW(undefined); setLive(null); metrcWeight(sb, palletId).then(setW).catch(() => setW(null)); }, [sb, palletId, appLbs, tag]);
    if (!sb || w === null)
        return null; // 114 not run yet
    if (!tag)
        return null; // no tag, nothing to compare
    const diffNote = (m) => {
        if (m == null || appLbs == null)
            return null;
        const d = r2(Number(m) - appLbs);
        return d === 0 ? _jsx("span", { className: "pill okp", children: "same as app" }) : _jsxs("span", { className: "pill warnp", children: [d > 0 ? '+' : '', d.toLocaleString(), " lbs vs app"] });
    };
    const check = async () => {
        setChecking(true);
        try {
            setLive(await liveWeight(sb, palletId));
        }
        catch (e) {
            setLive({ error: e instanceof Error ? e.message : String(e) });
        }
        finally {
            setChecking(false);
        }
    };
    return _jsxs(_Fragment, { children: [_jsx("dt", { children: "METRC weight" }), _jsxs("dd", { children: [w === undefined ? _jsx("span", { className: "muted", children: "\u2026" })
                        : !w.found ? _jsx("span", { className: "muted", children: "not in METRC's last pull" })
                            : _jsxs(_Fragment, { children: [fmt(w.lbs ?? w.qty), " ", STATE[w.state ?? ''] ? _jsxs("span", { className: "muted", children: ["(", STATE[w.state ?? ''], ")"] }) : null, " ", diffNote(w.lbs ?? w.qty), _jsxs("div", { className: "muted small", children: ["as of the last METRC pull", w.seen_at ? `, ${when(w.seen_at)}` : ''] })] }), live && ('error' in live ? _jsx("div", { className: "small neg", children: live.error })
                        : !live.found ? _jsxs("div", { className: "small", children: [_jsx("b", { children: "Right now:" }), " not on this license in METRC"] })
                            : _jsxs("div", { className: "small", children: [_jsx("b", { children: "Right now:" }), " ", fmt(live.qty), live.uom && !/^lb/i.test(live.uom) ? ` (${live.uom})` : '', STATE[live.state ?? ''] ? _jsxs("span", { className: "muted", children: [" (", STATE[live.state ?? ''], ")"] }) : null, " ", diffNote(live.qty)] })), w?.open_todos ? _jsxs("div", { className: "muted small", children: [w.open_todos, " METRC to-do", w.open_todos === 1 ? '' : 's', " still waiting on this tag, so a difference can be expected"] }) : null, _jsx("div", { children: _jsx("a", { className: "small", onClick: () => !checking && check(), children: checking ? 'Checking METRC…' : 'Check METRC now' }) })] })] });
}
