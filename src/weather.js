import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// Weather in the top bar: blended forecast for OHR (Paicines) and Watsonville (GVR + 1PN), risk flags, VPD.
// Data comes from the hourly /api/weather/refresh job (see supabase/067_weather.sql). Computer: 5 days; phone: today.
// Click / tap opens the 10-day panel with hourly detail for today and tomorrow, NWS alerts and the flag settings.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { t } from './i18n';
const TZ = 'America/Los_Angeles';
const KEY = 'fm.wx.site';
const stored = () => { try {
    return localStorage.getItem(KEY);
}
catch {
    return null;
} };
const store = (v) => { try {
    localStorage.setItem(KEY, v);
}
catch { /* private mode */ } };
// keep in step with DEFAULT_RULES in api/weather/_wx.js
export const DEFAULT_RULES = {
    botrytis: { on: true, rh: 90, dewgap: 2, tmin: 59, tmax: 77, watch_hrs: 6, warn_hrs: 10 },
    mildew: { on: true, day_tmin: 68, day_tmax: 80, rh_min: 40, rh_max: 70, day_hrs: 3, night_rh: 85, warn_days: 3 },
    rain: { on: true, watch_pop: 40, watch_in: 0.1, warn_pop: 70, warn_in: 0.25, harvest: true },
    frost: { on: true, watch: 36, warn: 32 },
    heat_crew: { on: true, watch: 80, warn: 95 },
    heat_plant: { on: true, watch: 95, warn: 100, vpd: 2.0 },
    wind: { on: true, watch: 25, warn: 35 },
    spray: { on: true, wind_min: 2, wind_max: 10, tmax: 85, dry_hrs: 24, pop_max: 30 },
    smoke: { on: true, watch: 101, warn: 151 },
    vpd: { low: 0.4, lowish: 0.8, good: 1.6, high: 2.0 },
};
const merge = (r) => Object.fromEntries(Object.entries(DEFAULT_RULES).map(([k, v]) => [k, { ...v, ...(r?.[k] ?? {}) }]));
const FLAG_LABEL = { botrytis: 'Botrytis', mildew: 'Mildew', rain: 'Rain', frost: 'Frost', heat_crew: 'Crew heat', heat_plant: 'Plant heat',
    wind: 'Wind', smoke: 'Smoke', fire: 'Fire weather', spray: 'Spray window' };
const FLAG_ICON = { botrytis: '🍄', mildew: '🍂', rain: '🌧', frost: '❄️', heat_crew: '🥵', heat_plant: '🌡', wind: '💨', smoke: '🌫', fire: '🔥', spray: '✅' };
// ---------- formatting ----------
const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' });
const dateFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'numeric', day: 'numeric' });
const hourFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const localDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const localHour = (d) => Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(d)) % 24;
const addDays = (day, n) => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dn = (day, today) => day === today ? t('Today') : day === addDays(today, 1) ? t('Tmrw') : t(dayFmt.format(new Date(day + 'T12:00:00Z')));
const r0 = (v) => (v == null ? '–' : Math.round(v).toString());
const ago = (iso) => {
    if (!iso)
        return '';
    const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    return m < 1 ? t('just now') : m < 60 ? t('{n} min ago', { n: m }) : t('{n} hr ago', { n: Math.round(m / 60) });
};
const compass = (d) => d == null ? '' : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(d / 45) % 8];
export function wxIcon(icon, night = false) {
    switch (icon) {
        case 'rain': return '🌧';
        case 'chance': return '🌦';
        case 'fog': return '🌫';
        case 'cloud': return '☁️';
        case 'partly': return night ? '☁️' : '⛅';
        default: return night ? '🌙' : '☀️';
    }
}
function vpdClass(v, b) {
    if (v == null)
        return '';
    if (v < b.low)
        return 'vpd-wet';
    if (v < b.lowish)
        return 'vpd-low';
    if (v <= b.good)
        return 'vpd-good';
    if (v <= b.high)
        return 'vpd-high';
    return 'vpd-stress';
}
const worst = (fs) => fs.some(f => f.level === 'warning') ? 'warning' : fs.some(f => f.level === 'watch') ? 'watch' : null;
// ---------- data ----------
function useWeather(sb, siteId) {
    const [sites, setSites] = useState([]);
    const [days, setDays] = useState([]);
    const [flags, setFlags] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [now, setNow] = useState(null);
    const [lastRun, setLastRun] = useState(null);
    const [missing, setMissing] = useState(false);
    const load = useCallback(async () => {
        if (!sb)
            return;
        const today = localDay(new Date());
        const h0 = new Date(Date.now() - 3600 * 1000).toISOString(), h1 = new Date(Date.now() + 3600 * 1000).toISOString();
        const [s, d, f, a, n, r] = await Promise.all([
            sb.from('weather_sites').select('id,name,address,rules,obs_station').eq('active', true).order('sort'),
            sb.from('weather_daily').select('*').eq('site_id', siteId).gte('day', today).order('day').limit(10),
            sb.from('weather_flags').select('id,day,kind,level,starts,ends,why').eq('site_id', siteId).gte('day', today).order('day'),
            sb.from('weather_alerts').select('*').eq('site_id', siteId),
            sb.from('weather_hourly').select('*').eq('site_id', siteId).gte('t', h0).lte('t', h1).order('t'),
            sb.from('weather_runs').select('ran_at,ok').order('ran_at', { ascending: false }).limit(1),
        ]);
        if (s.error) {
            setMissing(true);
            return;
        }
        setMissing(false);
        setSites((s.data ?? []));
        setDays((d.data ?? []));
        setFlags((f.data ?? []));
        setAlerts((a.data ?? []).filter(x => !x.ends || Date.parse(x.ends) > Date.now()));
        const hs = (n.data ?? []);
        const cur = hs.filter(x => Date.parse(x.t) <= Date.now()).pop() ?? hs[0] ?? null;
        setNow(cur);
        const last = (r.data?.[0] ?? null);
        setLastRun(last);
        return last;
    }, [sb, siteId]);
    useEffect(() => {
        let alive = true;
        let kicked = false;
        const tick = async () => {
            const last = await load();
            if (!alive)
                return;
            // forecast more than 90 minutes old (or never run): ask the server to refresh, then reload
            const stale = !last || Date.now() - Date.parse(last.ran_at) > 90 * 60 * 1000;
            if (stale && !kicked) {
                kicked = true;
                try {
                    await fetch('/api/weather/refresh');
                }
                catch { /* offline */ }
                if (alive)
                    await load();
            }
        };
        tick();
        const iv = setInterval(tick, 15 * 60 * 1000);
        return () => { alive = false; clearInterval(iv); };
    }, [load]);
    return { sites, days, flags, alerts, now, lastRun, missing, reload: load };
}
// ---------- top bar ----------
export function WeatherBar({ sb, canEdit, flash }) {
    const [siteId, setSiteIdS] = useState(() => stored() ?? 'ohr');
    const setSiteId = (v) => { setSiteIdS(v); store(v); };
    const w = useWeather(sb, siteId);
    const [open, setOpen] = useState(false);
    if (!sb || w.missing)
        return null;
    const today = localDay(new Date());
    const site = w.sites.find(s => s.id === siteId);
    const d0 = w.days.find(d => d.day === today) ?? w.days[0];
    if (!site || !d0)
        return null;
    const flagsOn = (day) => w.flags.filter(f => f.day === day && f.level !== 'good');
    const night = (() => { const h = localHour(new Date()); return h < 7 || h >= 19; })();
    const alertN = w.alerts.length;
    const label = site.id === 'wat' ? 'WAT' : site.name;
    return (_jsxs(_Fragment, { children: [_jsxs("button", { type: "button", className: `wxbar ${alertN ? (w.alerts.some(a => /warning/i.test(a.event ?? '')) ? 'wx-has-bad' : 'wx-has-warn') : worst(flagsOn(d0.day)) ? `wx-has-${worst(flagsOn(d0.day)) === 'warning' ? 'bad' : 'warn'}` : ''}`, title: t('{s} weather. Click for 10 days, flags and alerts.', { s: site.name }), onClick: () => setOpen(true), children: [_jsx("span", { className: "wx-site", children: label }), alertN > 0 && _jsxs("span", { className: "wx-alert", title: w.alerts.map(a => a.event).join(', '), children: ["\u26A0", alertN > 1 ? alertN : ''] }), _jsxs("span", { className: "wx-today", children: [_jsx("span", { className: "wx-ic", children: wxIcon(w.now?.icon ?? d0.icon, night) }), _jsxs("b", { children: [r0(w.now?.temp_f ?? d0.hi_f), "\u00B0"] }), _jsxs("span", { className: "wx-hl", children: [r0(d0.hi_f), "/", r0(d0.lo_f)] }), (d0.pop ?? 0) >= 10 && _jsxs("span", { className: "wx-pop", children: [r0(d0.pop), "%"] }), worst(flagsOn(d0.day)) && _jsx("i", { className: `wx-dot ${worst(flagsOn(d0.day))}` })] }), _jsx("span", { className: "wx-days", children: w.days.slice(0, 5).map((d, i) => {
                            const lv = worst(flagsOn(d.day));
                            return (_jsxs("span", { className: `wx-day i${i}`, children: [_jsx("span", { className: "wx-dn", children: dn(d.day, today) }), _jsx("span", { className: "wx-ic", children: wxIcon(d.icon) }), _jsxs("span", { className: "wx-t", children: [_jsxs("b", { children: [r0(d.hi_f), "\u00B0"] }), _jsxs("span", { className: "wx-lo", children: [r0(d.lo_f), "\u00B0"] })] }), _jsx("span", { className: `wx-pop ${(d.pop ?? 0) < 10 ? 'none' : ''}`, children: (d.pop ?? 0) >= 10 ? `${r0(d.pop)}%` : '·' }), lv && _jsx("i", { className: `wx-dot ${lv}` })] }, d.day));
                        }) })] }), open && createPortal(_jsx(WeatherPanel, { sb: sb, w: w, siteId: siteId, setSiteId: setSiteId, canEdit: canEdit, flash: flash, onClose: () => setOpen(false) }), document.body)] }));
}
// ---------- 10-day panel ----------
function WeatherPanel({ sb, w, siteId, setSiteId, canEdit, flash, onClose }) {
    const today = localDay(new Date());
    const [hours, setHours] = useState([]);
    const [hDay, setHDay] = useState(0);
    const [openDay, setOpenDay] = useState(null);
    const [openAlert, setOpenAlert] = useState(null);
    const [editing, setEditing] = useState(false);
    const site = w.sites.find(s => s.id === siteId);
    const rules = useMemo(() => merge(site?.rules), [site]);
    useEffect(() => {
        let alive = true;
        const from = new Date(Date.now() - 3600 * 1000).toISOString();
        const to = new Date(Date.parse(addDays(today, 2) + 'T12:00:00Z')).toISOString();
        sb.from('weather_hourly').select('*').eq('site_id', siteId).gte('t', from).lt('t', to).order('t')
            .then(({ data }) => { if (alive)
            setHours((data ?? [])); });
        return () => { alive = false; };
    }, [sb, siteId, w.lastRun?.ran_at, today]);
    // first tab: the next 24 hours from now; second: tomorrow (midnight to midnight)
    const hShown = hDay === 0
        ? hours.filter(h => Date.parse(h.t) + 3600 * 1000 > Date.now() && Date.parse(h.t) < Date.now() + 24 * 3600 * 1000)
        : hours.filter(h => localDay(new Date(h.t)) === addDays(today, 1));
    const spray = w.flags.filter(f => f.kind === 'spray' && f.starts && f.ends);
    const inSpray = (h) => spray.some(f => Date.parse(h.t) >= Date.parse(f.starts) && Date.parse(h.t) < Date.parse(f.ends));
    const issued = w.days[0]?.issued_at;
    return (_jsx("div", { className: "scrim wxscrim", onClick: onClose, children: _jsxs("div", { className: "sheet wxpanel", onClick: e => e.stopPropagation(), role: "dialog", "aria-label": t('Weather'), children: [_jsxs("div", { className: "sheet-h", children: [_jsxs("div", { children: [_jsx("h2", { style: { margin: 0 }, children: t('Weather') }), _jsxs("div", { className: "muted", children: [t('Blend of NWS, ECMWF, GFS, HRRR, NBM, Canada and Germany models'), issued ? ` · ${t('updated {a}', { a: ago(w.lastRun?.ran_at ?? issued) })}` : ''] })] }), _jsx("button", { className: "ghost", "aria-label": t('Close'), onClick: onClose, children: "\u2715" })] }), _jsxs("div", { className: "wx-top", children: [_jsx("div", { className: "seg", children: w.sites.map(s => _jsx("button", { className: s.id === siteId ? 'on' : '', onClick: () => setSiteId(s.id), children: s.name }, s.id)) }), site?.address && _jsx("span", { className: "muted wx-addr", children: site.address })] }), w.alerts.length > 0 && _jsx("div", { className: "wx-alerts", children: w.alerts.map(a => (_jsxs("div", { className: `warnbox wx-alertbox ${/warning/i.test(a.event ?? '') ? 'bad' : ''}`, onClick: () => setOpenAlert(openAlert === a.id ? null : a.id), children: [_jsxs("b", { children: ["\u26A0 ", a.event] }), a.ends && _jsxs("span", { className: "muted", children: [" \u00B7 ", t('until {d}', { d: `${t(dayFmt.format(new Date(a.ends)))} ${timeFmt.format(new Date(a.ends))}` })] }), openAlert === a.id ? _jsxs("div", { className: "wx-alerttext", children: [a.headline && _jsx("p", { children: _jsx("b", { children: a.headline }) }), _jsx("p", { children: a.description }), a.instruction && _jsx("p", { children: a.instruction })] })
                                : _jsx("div", { className: "muted", children: t('Tap for details') })] }, a.id))) }), _jsxs("div", { className: "wx-hhead", children: [_jsxs("div", { className: "seg small-seg", children: [_jsx("button", { className: hDay === 0 ? 'on' : '', onClick: () => setHDay(0), children: t('Next 24 hrs') }), _jsx("button", { className: hDay === 1 ? 'on' : '', onClick: () => setHDay(1), children: t('Tomorrow') })] }), _jsx("span", { className: "muted", children: t('Green = spray window') })] }), _jsxs("div", { className: "wx-hours", children: [hShown.length === 0 && _jsx("div", { className: "muted", children: t('No hourly data yet.') }), hShown.map(h => {
                            const d = new Date(h.t), hr = localHour(d);
                            return (_jsxs("div", { className: `wx-h ${inSpray(h) ? 'spray' : ''}`, children: [_jsx("div", { className: "wx-hh", children: hourFmt.format(d).replace(' ', '').toLowerCase() }), _jsx("div", { className: "wx-ic", children: wxIcon(h.icon, hr < 7 || hr >= 19) }), _jsxs("div", { className: "wx-ht", children: [r0(h.temp_f), "\u00B0"] }), _jsx("div", { className: "wx-hp", children: (h.pop ?? 0) >= 10 ? `${r0(h.pop)}%` : '' }), _jsxs("div", { className: "wx-hw", title: `${t('Wind / gusts, mph')} ${compass(h.wind_dir)}`, children: [r0(h.wind_mph), h.gust_mph != null && h.gust_mph > (h.wind_mph ?? 0) + 4 ? `g${r0(h.gust_mph)}` : ''] }), _jsxs("div", { className: "wx-hr", children: [r0(h.rh), "%"] }), _jsx("div", { className: `wx-hv ${vpdClass(h.vpd, rules.vpd)}`, title: "VPD kPa", children: h.vpd == null ? '–' : h.vpd.toFixed(1) })] }, h.t));
                        })] }), _jsx("div", { className: "wx-hlegend muted", children: t('Rows: rain chance · wind (g = gusts, mph) · humidity · VPD kPa') }), _jsx("div", { className: "wx-list", children: w.days.map((d, i) => {
                        const fs = w.flags.filter(f => f.day === d.day);
                        const isOpen = openDay === d.day;
                        return (_jsxs("div", { className: `wx-row ${i >= 7 ? 'far' : ''} ${isOpen ? 'open' : ''}`, onClick: () => setOpenDay(isOpen ? null : d.day), children: [_jsxs("div", { className: "wx-r1", children: [_jsxs("div", { className: "wx-rd", children: [_jsx("b", { children: dn(d.day, today) }), _jsxs("span", { className: "muted", children: [" ", dateFmt.format(new Date(d.day + 'T12:00:00Z'))] })] }), _jsx("div", { className: "wx-ic wx-icbig", children: wxIcon(d.icon) }), _jsxs("div", { className: "wx-rt", children: [_jsxs("b", { children: [r0(d.hi_f), "\u00B0"] }), " ", _jsxs("span", { className: "muted", children: [r0(d.lo_f), "\u00B0"] })] }), _jsx("div", { className: "wx-rp", children: (d.pop ?? 0) >= 10 ? _jsxs(_Fragment, { children: [r0(d.pop), "%", (d.precip_in ?? 0) >= 0.01 && _jsxs("span", { className: "muted", children: [" ", d.precip_in.toFixed(2), "\""] })] }) : _jsx("span", { className: "muted", children: "\u2013" }) }), _jsxs("div", { className: "wx-rw", children: ["\uD83D\uDCA8 ", r0(d.wind_mph), d.gust_mph != null ? _jsxs("span", { className: "muted", children: ["/", r0(d.gust_mph)] }) : null] }), _jsxs("div", { className: "wx-rv", children: [_jsx("span", { className: `vpdchip ${vpdClass(d.vpd_max, rules.vpd)}`, title: t('Peak VPD (afternoon), kPa'), children: d.vpd_max?.toFixed(1) ?? '–' }), _jsx("span", { className: `vpdchip ${vpdClass(d.vpd_min, rules.vpd)}`, title: t('Lowest VPD (overnight), kPa'), children: d.vpd_min?.toFixed(1) ?? '–' })] }), _jsx("div", { className: "wx-rc", title: t('Confidence: how much the models agree ({n} models)', { n: d.n_models ?? 0 }), children: _jsx("span", { className: "wx-conf", children: _jsx("span", { style: { width: `${d.confidence ?? 0}%` }, className: (d.confidence ?? 0) >= 70 ? 'hi' : (d.confidence ?? 0) >= 45 ? 'mid' : 'lo' }) }) })] }), fs.length > 0 && _jsx("div", { className: "wx-flags", children: fs.map(f => _jsxs("span", { className: `wx-flag ${f.level}`, children: [FLAG_ICON[f.kind] ?? '•', " ", t(FLAG_LABEL[f.kind] ?? f.kind), f.level === 'warning' ? '!' : ''] }, f.id)) }), isOpen && _jsxs("div", { className: "wx-more", children: [_jsxs("div", { className: "muted", children: [t('Humidity {a}-{b}%', { a: r0(d.rh_min), b: r0(d.rh_max) }), " \u00B7 VPD ", d.vpd_min?.toFixed(2), "-", d.vpd_max?.toFixed(2), " kPa", d.aqi_max != null ? ` · AQI ${r0(d.aqi_max)}` : '', " \u00B7 ", t('Confidence {c}%', { c: d.confidence ?? 0 })] }), fs.map(f => _jsxs("div", { className: `wx-why ${f.level}`, children: [FLAG_ICON[f.kind], " ", _jsx("b", { children: t(FLAG_LABEL[f.kind] ?? f.kind) }), " ", f.level === 'good' ? '' : `(${t(f.level)})`, ": ", f.why] }, f.id)), fs.length === 0 && _jsx("div", { className: "muted", children: t('No flags this day.') })] })] }, d.day));
                    }) }), _jsxs("div", { className: "wx-foot muted", children: [_jsxs("span", { children: [t('VPD'), ": ", _jsxs("span", { className: "vpdchip vpd-wet", children: ["<", String(rules.vpd.low)] }), " ", _jsx("span", { className: "vpdchip vpd-low", children: t('low') }), " ", _jsx("span", { className: "vpdchip vpd-good", children: t('good') }), " ", _jsx("span", { className: "vpdchip vpd-high", children: t('high') }), " ", _jsxs("span", { className: "vpdchip vpd-stress", children: [">", String(rules.vpd.high)] })] }), _jsx("span", { children: t('Days 8-10 are faded: treat them as a rough guess.') }), canEdit && _jsx("button", { className: "ghost small", onClick: () => setEditing(true), children: t('Flag settings') })] }), editing && site && _jsx(RulesEditor, { sb: sb, site: site, flash: flash, onClose: () => setEditing(false), onSaved: () => { setEditing(false); w.reload(); } })] }) }));
}
// ---------- flag settings (Owners + Cultivation Admins) ----------
const FIELDS = {
    botrytis: [['rh', 'Humidity % at or above'], ['dewgap', 'or dew point within °F'], ['tmin', 'Temp from °F'], ['tmax', 'Temp to °F'], ['watch_hrs', 'Watch: hours in a row'], ['warn_hrs', 'Warning: hours in a row']],
    mildew: [['day_tmin', 'Day temp from °F'], ['day_tmax', 'Day temp to °F'], ['rh_min', 'Day humidity from %'], ['rh_max', 'Day humidity to %'], ['day_hrs', 'Warm hours needed'], ['night_rh', 'Night humidity % at or above'], ['warn_days', 'Warning: days in a row']],
    rain: [['watch_pop', 'Watch: chance %'], ['watch_in', 'Watch: inches'], ['warn_pop', 'Warning: chance %'], ['warn_in', 'Warning: inches']],
    frost: [['watch', 'Watch: low °F or below'], ['warn', 'Warning: low °F or below']],
    heat_crew: [['watch', 'Watch: high °F (shade)'], ['warn', 'Warning: high °F (high heat)']],
    heat_plant: [['watch', 'Watch: high °F'], ['warn', 'Warning: high °F'], ['vpd', 'Watch: VPD kPa or above']],
    wind: [['watch', 'Watch: gusts mph'], ['warn', 'Warning: gusts mph']],
    spray: [['wind_min', 'Wind from mph'], ['wind_max', 'Wind to mph'], ['tmax', 'Below °F'], ['dry_hrs', 'Dry for hours after'], ['pop_max', 'Max rain chance %']],
    smoke: [['watch', 'Watch: AQI'], ['warn', 'Warning: AQI']],
    vpd: [['low', 'Too wet below kPa'], ['lowish', 'Low below kPa'], ['good', 'Good up to kPa'], ['high', 'High up to kPa (above = stress)']],
};
function RulesEditor({ sb, site, flash, onClose, onSaved }) {
    const [r, setR] = useState(() => merge(site.rules));
    const [busy, setBusy] = useState(false);
    const set = (k, f, v) => setR(x => ({ ...x, [k]: { ...x[k], [f]: v } }));
    const save = async () => {
        setBusy(true);
        const { error } = await sb.rpc('weather_save_rules', { p_site: site.id, p_rules: r });
        if (error) {
            setBusy(false);
            flash(error.message, true);
            return;
        }
        flash(t('Saved. Updating the flags…'));
        // recompute the flags now with the new settings, then reload
        try {
            await fetch('/api/weather/refresh');
        }
        catch { /* next hourly run picks it up */ }
        setBusy(false);
        onSaved();
    };
    return (_jsx("div", { className: "scrim", onClick: e => { e.stopPropagation(); onClose(); }, children: _jsxs("div", { className: "sheet form wide wxrules", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsxs("div", { children: [_jsx("h2", { style: { margin: 0 }, children: t('Flag settings: {s}', { s: site.name }) }), _jsx("div", { className: "muted", children: t('Each site has its own. Flags update as soon as you save.') })] }), _jsx("button", { className: "ghost", onClick: onClose, children: "\u2715" })] }), Object.keys(FIELDS).map(k => (_jsxs("fieldset", { className: `wx-rule ${k !== 'vpd' && !r[k].on ? 'off' : ''}`, children: [_jsx("legend", { children: k !== 'vpd' ? _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: !!r[k].on, onChange: e => set(k, 'on', e.target.checked) }), " ", FLAG_ICON[k], " ", t(FLAG_LABEL[k])] }) : _jsx("b", { children: t('VPD colors') }) }), _jsxs("div", { className: "wx-rgrid", children: [FIELDS[k].map(([f, l]) => (_jsxs("label", { children: [_jsx("span", { className: "muted", children: t(l) }), _jsx("input", { type: "number", step: "any", inputMode: "decimal", value: String(r[k][f] ?? ''), disabled: k !== 'vpd' && !r[k].on, onChange: e => set(k, f, e.target.value === '' ? DEFAULT_RULES[k][f] : Number(e.target.value)) })] }, f))), k === 'rain' && _jsxs("label", { className: "small-check", children: [_jsx("input", { type: "checkbox", checked: !!r.rain.harvest, onChange: e => set('rain', 'harvest', e.target.checked) }), " ", t('Any rain watch on a scheduled harvest day becomes a warning')] })] })] }, k))), _jsxs("div", { className: "row", style: { display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 12 }, children: [_jsx("button", { className: "ghost", onClick: () => setR(merge(site.id === 'ohr' ? { botrytis: { on: false } } : {})), children: t('Back to defaults') }), _jsx("button", { disabled: busy, onClick: save, children: busy ? t('Saving…') : t('Save') })] })] }) }));
}
