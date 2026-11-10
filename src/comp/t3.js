import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Select } from '../combo';
import { Fold } from '../fold';
import { F, errText } from '../cult/ui';
import { T3More } from './t3more';
import { ItemRules } from './itemrules';
import { UsageMeters } from './usage';
// Compliance > Settings > METRC sending: T3 and the METRC API (Metrc Connect). Usage meters, connection tests, Dry run / Live,
// adjustment reasons, and per kind: Off / Approve / Auto, Route (T3 or METRC API) and If it fails (138).
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const REASONS = [['drying', 'Drying'], ['scale', 'Scale variance'], ['waste', 'Waste'], ['entry', 'Entry error']];
const MODE = { off: 'Off (by hand)', approve: 'Approve each one', auto: 'Auto' };
const ROUTE = { t3: 'T3', api: 'METRC API' };
const FALL = { off: 'Stop (to-do shows the error)', safe: 'Safe only', check: 'Safe + check' };
export function T3Settings({ c }) {
    const [conn, setConn] = useState(null);
    const [kinds, setKinds] = useState([]);
    const [set, setSet] = useState({});
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const load = async () => {
        try {
            const [k, cn, s] = await Promise.all([c.api.pushKinds(), c.api.t3Conn(),
                c.api.sb.from('app_settings').select('key,value').or('key.like.comp.metrc_%,key.eq.comp.tag_autofill').then(r => r.data ?? [])]);
            setKinds(k);
            setConn(cn);
            setSet(Object.fromEntries(s.map(x => [x.key, x.value])));
            setErr(null);
        }
        catch (e) {
            setErr(errText(e));
        }
    };
    useEffect(() => { load(); }, []);
    const live = set['comp.metrc_live'] === 'true';
    async function test() {
        setBusy(true);
        try {
            const r = await c.api.testT3();
            c.flash(r.ok ? 'T3 connection works' : r.error ?? 'Connection test failed', !r.ok);
            await load();
        }
        catch (e) {
            c.flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    async function saveSetting(k, v) {
        try {
            await c.api.setSetting(k, v);
            await load();
            c.flash('Saved');
        }
        catch (e) {
            c.flash(errText(e), true);
        }
    }
    async function flipLive() {
        const msg = live
            ? 'Switch to Dry run?\n\nThe app will only check to-dos with METRC (through T3) and won\'t change anything in METRC. Auto stops.'
            : 'Switch to LIVE?\n\nSend buttons and Auto kinds will change packages in METRC for real, as the app\'s METRC user. Try a few with Dry run first.';
        if (!confirm(msg))
            return;
        await saveSetting('comp.metrc_live', live ? 'false' : 'true');
    }
    const [apiBusy, setApiBusy] = useState(false);
    async function testApi() {
        setApiBusy(true);
        try {
            const r = await c.api.testApi();
            c.flash(r.api_ok ? 'METRC API connection works' : r.api_error ?? 'METRC API test failed', !r.api_ok);
            await load();
        }
        catch (e) {
            c.flash(errText(e), true);
        }
        finally {
            setApiBusy(false);
        }
    }
    async function route(k, r, f) {
        if (r === 'api' && !confirm(`Send "${k.label}" through the METRC API?\n\nEach send counts against the METRC API's 50,000 calls a month.`))
            return;
        try {
            await c.api.setRoute(k.kind, r, f);
            await load();
            c.flash(`${k.label}: ${r ? ROUTE[r] : FALL[f]}`);
        }
        catch (e) {
            c.flash(errText(e), true);
        }
    }
    const hasRoute = kinds.some(k => k.route);
    async function mode(k, m) {
        if (m === 'auto' && !confirm(`Put "${k.label}" on Auto?\n\nWhen Live, the app sends these about every minute without anyone tapping Send.`))
            return;
        try {
            await c.api.setPushMode(k.kind, m);
            await load();
            c.flash(`${k.label}: ${MODE[m]}`);
        }
        catch (e) {
            c.flash(errText(e), true);
        }
    }
    const allReasons = [...new Set(Object.values(conn?.reasons ?? {}).flat().map(r => r.name))].sort();
    const who = conn?.who && !('error' in conn.who) ? String(conn.who.username ?? conn.who.userName ?? conn.who.name ?? conn.who.email ?? '') : '';
    const phases = [...new Set(kinds.map(k => k.phase))].sort((a, b) => a - b);
    return _jsxs(Fold, { id: "comp.set.t3", open: true, title: "METRC sending: T3 and METRC API", right: _jsx("button", { className: "ghost small", disabled: busy, onClick: test, children: busy ? 'Testing…' : 'Test T3' }), children: [err && _jsx("p", { className: "neg small", children: err }), _jsx(UsageMeters, { c: c }), _jsx("h3", { style: { marginTop: 14 }, children: "T3" }), _jsxs("p", { className: "muted", children: ["The app sends METRC to-dos through T3 as its own METRC user (the T3 secret key in Vercel). Start on ", _jsx("b", { children: "Dry run" }), ": T3 checks each to-do against METRC without changing anything. Switch to ", _jsx("b", { children: "Live" }), " once the checks look right."] }), _jsx("div", { className: "infobox", children: !conn?.tested_at ? _jsxs("span", { children: ["Not tested yet. Tap ", _jsx("b", { children: "Test connection" }), "."] }) : _jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("span", { className: `pill ${conn.ok ? 'cp-ok' : 'cp-bad'}`, children: conn.ok ? 'Connected' : 'Problem' }), " ", _jsxs("span", { className: "muted small", children: ["tested ", when(conn.tested_at), " by ", conn.tested_by?.split('@')[0]] }), who && _jsxs("span", { className: "small", children: [" \u00B7 METRC user ", _jsx("b", { children: who })] })] }), conn.error && _jsx("div", { className: "neg small", style: { marginTop: 4 }, children: conn.error }), !!conn.licenses?.length && _jsx("div", { className: "dlist", style: { marginTop: 8 }, children: conn.licenses.map(l => _jsxs("div", { className: "drow", children: [_jsxs("span", { className: "grow", children: [_jsx("b", { children: l.site ?? '' }), " ", _jsx("span", { className: "mono small", children: l.license }), " ", _jsx("span", { className: "muted small", children: l.name ?? '' }), l.reasons_error && _jsx("div", { className: "neg small", children: l.reasons_error })] }), _jsx("span", { className: "small muted", children: l.in_t3 ? `${conn.reasons?.[l.license]?.length ?? 0} adjust reasons` : '' }), _jsx("span", { className: `pill ${l.in_t3 ? 'cp-ok' : l.in_app ? 'cp-bad' : 'cp-mute'}`, children: l.in_t3 ? 'Can reach' : l.in_app ? 'Not on this user' : 'Not in the app' })] }, l.license)) })] }) }), _jsxs("div", { className: "row between wrap", style: { marginTop: 14, alignItems: 'center' }, children: [_jsx("h3", { style: { margin: 0 }, children: "METRC API (Metrc Connect)" }), _jsx("button", { className: "ghost small", disabled: apiBusy, onClick: testApi, children: apiBusy ? 'Testing…' : 'Test METRC API' })] }), _jsx("p", { className: "muted small", children: "The official METRC API, next to T3. It needs the integrator key from the Connect portal and the app user's METRC API key in Vercel (METRC_VENDOR_KEY, METRC_USER_KEY). It has no dry run, so Dry run on this route goes to the METRC sandbox (METRC_API_SANDBOX_URL). Each kind moves to it only once its API sender is built and tested." }), _jsx("div", { className: "infobox", children: !conn?.api_tested_at ? _jsxs("span", { children: ["Not tested yet. Add the keys in Vercel, then tap ", _jsx("b", { children: "Test METRC API" }), "."] }) : _jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("span", { className: `pill ${conn.api_ok ? 'cp-ok' : 'cp-bad'}`, children: conn.api_ok ? 'Connected' : 'Problem' }), " ", _jsxs("span", { className: "muted small", children: ["tested ", when(conn.api_tested_at), " by ", conn.api_tested_by?.split('@')[0]] }), conn.api_base && _jsxs("span", { className: "muted small mono", children: [" \u00B7 ", conn.api_base] }), _jsxs("span", { className: "muted small", children: [" \u00B7 sandbox ", conn.api_sandbox ? 'set' : 'not set'] })] }), conn.api_error && _jsx("div", { className: "neg small", style: { marginTop: 4 }, children: conn.api_error }), !!conn.api_licenses?.length && _jsx("div", { className: "dlist", style: { marginTop: 8 }, children: conn.api_licenses.map(l => _jsxs("div", { className: "drow", children: [_jsxs("span", { className: "grow", children: [_jsx("b", { children: l.site ?? '' }), " ", _jsx("span", { className: "mono small", children: l.license }), " ", _jsx("span", { className: "muted small", children: l.name ?? '' })] }), _jsx("span", { className: `pill ${l.in_api ? 'cp-ok' : l.in_app ? 'cp-bad' : 'cp-mute'}`, children: l.in_api ? 'Can reach' : l.in_app ? 'Not on this user' : 'Not in the app' })] }, l.license)) })] }) }), _jsxs("div", { className: "row wrap", style: { marginTop: 10, alignItems: 'center', gap: 10 }, children: [_jsx("span", { children: "Sending is" }), _jsx("span", { className: `pill ${live ? 'cp-bad' : 'cp-warn'}`, children: live ? 'LIVE' : 'Dry run' }), _jsx("button", { className: live ? 'ghost' : 'primary', disabled: !c.isAdmin || (!live && !conn?.ok), onClick: flipLive, children: live ? 'Back to Dry run' : 'Go Live' }), !live && !conn?.ok && _jsx("span", { className: "muted small", children: "Test the connection first." })] }), _jsx("h3", { style: { marginTop: 14 }, children: "Weight adjustment reasons" }), _jsx("p", { className: "muted small", children: "Which METRC reason each app reason uses. The list comes from METRC when you test the connection." }), _jsx("div", { className: "grid2", children: REASONS.map(([k, l]) => {
                    const key = `comp.metrc_reason_${k}`;
                    const v = set[key] ?? '';
                    const missing = allReasons.length > 0 && v && !allReasons.some(n => n.toLowerCase() === v.toLowerCase());
                    return _jsx(F, { label: l, hint: missing ? `"${v}" isn't one of METRC's reasons` : undefined, children: allReasons.length ? _jsxs(Select, { value: allReasons.find(n => n.toLowerCase() === v.toLowerCase()) ?? '', disabled: !c.isAdmin, onChange: e => saveSetting(key, e.target.value), children: [_jsx("option", { value: "", children: "Pick\u2026" }), allReasons.map(n => _jsx("option", { value: n, children: n }, n))] })
                            : _jsxs("span", { className: "muted small", children: [v || 'not set', " (test the connection to pick from METRC's list)"] }) }, k);
                }) }), _jsx("h3", { style: { marginTop: 14 }, children: "What the app sends" }), _jsxs("p", { className: "muted small", children: [_jsx("b", { children: "Off" }), ": done by hand in METRC, checked off on the To do list. ", _jsx("b", { children: "Approve" }), ": a Send button on each to-do. ", _jsx("b", { children: "Auto" }), ": sent about every minute while Live. Kinds the app can't send yet show their phase."] }), hasRoute && _jsxs("p", { className: "muted small", children: [_jsx("b", { children: "Route" }), ": T3 or the METRC API (METRC API only once that kind's API sender is built). ", _jsx("b", { children: "If it fails" }), ": ", _jsx("b", { children: "Safe only" }), " tries the other route only when the first one was refused before anything reached METRC (key refused, rate limit, route not set up, can't connect). ", _jsx("b", { children: "Safe + check" }), " also retries a send whose outcome is unknown (timeout, server error), only for kinds whose sender checks METRC first, so nothing is made twice. If METRC says the data is wrong, it never switches: the other route hits the same METRC rules."] }), _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "ct", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Kind" }), _jsx("th", { children: "How" }), hasRoute && _jsxs(_Fragment, { children: [_jsx("th", { children: "Route" }), _jsx("th", { children: "If it fails" })] }), _jsx("th", { className: "hide-s", children: "Changed" })] }) }), _jsx("tbody", { children: phases.map(ph => kinds.filter(k => k.phase === ph).map((k, i) => _jsxs("tr", { children: [_jsxs("td", { children: [i === 0 && _jsxs("div", { className: "muted small", children: ["Phase ", ph] }), _jsx("b", { children: k.label })] }), _jsx("td", { children: k.ready ? _jsx(Select, { value: k.mode, disabled: !c.isAdmin, onChange: e => mode(k, e.target.value), children: Object.keys(MODE).map(m => _jsx("option", { value: m, children: MODE[m] }, m)) })
                                            : _jsxs("span", { className: "muted small", children: ["by hand (coming in phase ", k.phase, ")"] }) }), hasRoute && _jsxs(_Fragment, { children: [_jsx("td", { children: k.ready ? _jsxs(Select, { value: k.route ?? 't3', disabled: !c.isAdmin, onChange: e => route(k, e.target.value, null), children: [_jsx("option", { value: "t3", children: ROUTE.t3 }), _jsxs("option", { value: "api", disabled: !k.api_ready, children: [ROUTE.api, k.api_ready ? '' : ' (not built yet)'] })] }) : '' }), _jsx("td", { children: k.ready ? _jsxs(Select, { value: k.fallback ?? 'safe', disabled: !c.isAdmin, onChange: e => route(k, null, e.target.value), children: [_jsx("option", { value: "off", children: FALL.off }), _jsx("option", { value: "safe", children: FALL.safe }), _jsxs("option", { value: "check", disabled: !k.can_verify, children: [FALL.check, k.can_verify ? '' : ' (not yet)'] })] }) : '' })] }), _jsx("td", { className: "muted small hide-s", children: k.updated_by ? `${k.updated_by.split('@')[0]} ${when(k.updated_at)}` : '' })] }, k.kind))) })] }) }), _jsx(T3More, { c: c, conn: conn, set: set, save: async (k, v) => { try {
                    await c.api.setSetting(k, v);
                    await load();
                    c.flash('Saved');
                }
                catch (e) {
                    c.flash(errText(e), true);
                } } }), _jsx(ItemRules, { c: c })] });
}
