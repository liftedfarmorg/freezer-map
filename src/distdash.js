import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { axisDate, Card, Cards, DashHead, lastDays, Legend, Meter, projectTo, Spark, Tile, Tiles, ymd } from './dash';
const n0 = (n) => Math.round(n).toLocaleString();
// ---------- Site Overview (workbook rows 5 to 15) ----------
export function Overview({ ctx }) {
    const stats = useMemo(() => {
        const calc = (sites) => {
            const fz = ctx.snap.freezers.filter(f => sites.includes(f.site) && (f.kind ?? 'freezer') === 'freezer' && f.active !== false);
            let open = 0, withOpen = 0, pallets = 0, w = 0;
            for (const f of fz) {
                const slots = ctx.slotsOf(f.id);
                const empty = f.status === 'Not Working' ? 0 : slots.filter(s => ctx.inSlot(s.id).length === 0).length;
                open += empty;
                if (empty > 0)
                    withOpen++;
                for (const s of slots)
                    for (const p of ctx.inSlot(s.id)) {
                        pallets++;
                        w += ctx.weight(p);
                    }
            }
            const by = (st) => fz.filter(f => f.status === st).length;
            const avg = pallets ? w / pallets : 0;
            return { total: fz.length, on: by('On'), off: by('Off'), att: by('Needs Attention'), dead: by('Not Working'), withOpen, open, pallets, w, avg, est: open * avg };
        };
        return { OHR: calc(['OHR']), GVR: calc(['GVR']), All: calc(['OHR', 'GVR']) };
    }, [ctx.snap]);
    const rows = [
        ['Total freezers', s => String(s.total)],
        ['On', s => String(s.on)],
        ['Off', s => String(s.off)],
        ['Needs attention', s => String(s.att), 'att'],
        ['Not working', s => String(s.dead), 'dead'],
        ['Freezers w/ open spaces', s => String(s.withOpen)],
        ['Open spaces', s => String(s.open)],
        ['Pallets stored', s => String(s.pallets)],
        ['Total weight (lbs)', s => n0(s.w)],
        ['Avg lbs / pallet', s => n0(s.avg)],
        ['Est. open space (lbs)', s => n0(s.est)],
    ];
    return (_jsxs("table", { className: "side-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", {}), _jsx("th", { children: "OHR" }), _jsx("th", { children: "GVR" }), _jsx("th", { children: "Both" })] }) }), _jsx("tbody", { children: rows.map(([label, f, cls]) => (_jsxs("tr", { className: cls === 'att' && stats.All.att ? 'att' : cls === 'dead' && stats.All.dead ? 'dead' : '', children: [_jsx("td", { children: label }), _jsx("td", { children: f(stats.OHR) }), _jsx("td", { children: f(stats.GVR) }), _jsx("td", { children: _jsx("b", { children: f(stats.All) }) })] }, label))) })] }));
}
// ---------- Loads ----------
export function Loads({ ctx, loads }) {
    const st = { planning: 'Planning', loading: 'Loading', in_transit: 'In transit' };
    const stops = ctx.snap.stops ?? [], items = ctx.snap.items ?? [];
    return (_jsxs("div", { className: "side-list", children: [loads.length === 0 && _jsx("div", { className: "muted small-note", children: "No active loads." }), loads.map(l => {
                const v = ctx.snap.vehicles?.find(x => x.id === l.vehicle_id);
                const its = items.filter(i => i.load_id === l.id);
                const sts = stops.filter(s => s.load_id === l.id).sort((a, b) => a.seq - b.seq);
                return (_jsxs("button", { className: "side-load", onClick: () => ctx.openLoad(l.id), children: [_jsxs("div", { className: "row between", children: [_jsx("b", { children: l.code }), _jsx("span", { className: `pill s-${l.status}`, children: st[l.status] })] }), _jsxs("div", { className: "muted", children: [v?.name, " \u00B7 ", its.filter(i => i.loaded).length, "/", its.length, " loaded \u00B7 ", sts.map(s => ctx.snap.customers?.find(c => c.id === s.customer_id)?.name).join(' → ')] })] }, l.id));
            }), _jsx("button", { className: "ghost small", onClick: ctx.goTransit, children: "All loads" })] }));
}
// ---------- Activity ----------
export function Activity({ ctx }) {
    const [evs, setEvs] = useState(null);
    // Distribution's own work only (Processing and payroll have their own Activity)
    useEffect(() => { ctx.backend.recentEvents(40).then(es => setEvs(es.filter(e => !/^(proc_|pay_|acct_|cult_log|nursery)/.test(e.type)).slice(0, 10))).catch(() => setEvs([])); }, [ctx.snap]);
    return (_jsxs("div", { className: "side-list", children: [evs === null && _jsx("div", { className: "muted small-note", children: "Loading\u2026" }), evs?.length === 0 && _jsx("div", { className: "muted small-note", children: "Nothing yet." }), evs?.map(e => (_jsxs("div", { className: "side-ev", children: [_jsx("div", { children: ctx.describe(e) }), _jsxs("div", { className: "muted", children: [new Date(e.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }), " \u00B7 ", (e.user_email ?? '').split('@')[0]] })] }, e.id))), _jsx("button", { className: "ghost small", onClick: ctx.goActivity, children: "All activity" })] }));
}
export function DistDashboard({ ctx, sales, goMap, fulfill, staged }) {
    const fz = ctx.snap.freezers.filter(f => (f.kind ?? 'freezer') === 'freezer' && f.active !== false);
    const per = useMemo(() => {
        const out = new Map();
        for (const f of fz) {
            const slots = ctx.slotsOf(f.id);
            let used = 0, pallets = 0, w = 0;
            for (const s of slots) {
                const ps = ctx.inSlot(s.id);
                if (ps.length)
                    used++;
                pallets += ps.length;
                for (const p of ps)
                    w += ctx.weight(p);
            }
            out.set(f.id, { slots: slots.length, used, pallets, lbs: w, open: f.status === 'Not Working' ? 0 : slots.length - used });
        }
        return out;
    }, [ctx.snap]);
    const tot = (fs) => fs.reduce((a, f) => { const x = per.get(f.id); return { slots: a.slots + x.slots, used: a.used + x.used, pallets: a.pallets + x.pallets, lbs: a.lbs + x.lbs, open: a.open + x.open }; }, { slots: 0, used: 0, pallets: 0, lbs: 0, open: 0 });
    const all = tot(fz);
    const avg = all.pallets ? all.lbs / all.pallets : 0;
    const trouble = fz.filter(f => f.status === 'Needs Attention' || f.status === 'Not Working');
    const loads = (ctx.snap.loads ?? []).filter(l => ['planning', 'loading', 'in_transit'].includes(l.status));
    const moving = loads.filter(l => l.status === 'in_transit').length;
    const rc = ctx.reviewCounts;
    const d0 = new Date(), today = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-${String(d0.getDate()).padStart(2, '0')}`;
    const outToday = loads.filter(l => l.load_date === today && l.status !== 'in_transit').length;
    const siteLbs = (s) => tot(fz.filter(f => f.site === s)).lbs;
    const fullPct = all.slots ? all.used / all.slots : 0;
    // trend lines (066): save today's numbers, read back the last 90 days (+ the same days last year)
    const [hist, setHist] = useState(new Map());
    useEffect(() => {
        if (!fz.length)
            return;
        ctx.backend.dashRecord({ freezer_lbs: Math.round(all.lbs), freezer_lbs_ohr: Math.round(siteLbs('OHR')), freezer_lbs_gvr: Math.round(siteLbs('GVR')),
            pallets: all.pallets, open_spaces: all.open, tags_pending: rc.tags, metrc_issues: rc.issues, freezer_problems: trouble.length }).catch(() => { });
    }, [ctx.snap, rc.tags, rc.issues]);
    useEffect(() => {
        const from = new Date();
        from.setDate(from.getDate() - 90 - 366);
        ctx.backend.dashSeries(['freezer_lbs', 'open_spaces', 'metrc_issues'], ymd(from)).then(rows => {
            const m = new Map();
            for (const r of rows)
                (m.get(r.key) ?? m.set(r.key, new Map()).get(r.key)).set(r.day, r.value);
            setHist(m);
        }).catch(() => { });
    }, [ctx.backend]);
    const series = (key, days, now) => days.map((d, i) => (i === days.length - 1 && now != null ? now : hist.get(key)?.get(d) ?? null));
    const d90 = lastDays(90), d30 = lastDays(30), d14 = lastDays(14);
    const yearAgo = (d) => { const x = new Date(d + 'T12:00:00'); x.setFullYear(x.getFullYear() - 1); return ymd(x); };
    const lbs90 = series('freezer_lbs', d90, all.lbs);
    const lbsLY = d90.map(d => hist.get('freezer_lbs')?.get(yearAgo(d)) ?? null);
    const hasLY = lbsLY.filter(v => v != null).length > 1;
    const wkAgo = lbs90[lbs90.length - 8];
    const wkPct = wkAgo ? (all.lbs - wkAgo) / wkAgo : null;
    const lyNow = lbsLY[lbsLY.length - 1];
    const open30 = series('open_spaces', d30, all.open);
    const fill = projectTo(open30, 0);
    const proj = fill.hitsIn != null && fill.hitsIn <= 60 ? [...open30.map(() => null), ...Array.from({ length: Math.min(fill.hitsIn, 14) }, (_, i) => Math.max(0, all.open + fill.slope * (i + 1)))] : undefined;
    const iss14 = series('metrc_issues', d14, rc.issues);
    const iss7 = iss14[iss14.length - 8];
    const pctTxt = (p) => `${p >= 0 ? '▲' : '▼'} ${Math.abs(p * 100).toFixed(1)}%`;
    const spaceTone = all.open < 10 ? 'warn' : (fullPct >= 0.85 || (fill.hitsIn != null && fill.hitsIn <= 14)) ? 'heads' : undefined;
    const dead = trouble.filter(f => f.status === 'Not Working');
    return (_jsxs("div", { className: "dash", children: [_jsx(DashHead, { title: "Dashboard", sub: `Distribution · ${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}` }), _jsxs(Tiles, { children: [_jsx(Tile, { wide: true, label: "In the freezers", value: `${n0(all.lbs)} lbs`, onClick: goMap, range: _jsxs(_Fragment, { children: [hasLY && _jsx(Legend, { now: d0.getFullYear(), then: d0.getFullYear() - 1 }), _jsx("span", { children: "90 days" })] }), kv: [[n0(all.pallets), 'pallets'], [n0(avg), 'avg lbs'], ...(lyNow ? [[`${all.lbs >= lyNow ? '+' : ''}${Math.round((all.lbs / lyNow - 1) * 100)}%`, 'vs this day last year']] : [[`OHR ${all.lbs ? Math.round(siteLbs('OHR') / all.lbs * 100) : 0}%`, `GVR ${all.lbs ? Math.round(siteLbs('GVR') / all.lbs * 100) : 0}%`]])], chart: _jsx(Spark, { data: lbs90, ghost: hasLY ? lbsLY : undefined, labels: [axisDate(d90[0]), 'Today'] }), foot: wkPct != null ? `${pctTxt(wkPct)} this week` : 'Map' }), dead.length > 0
                        ? _jsx(Tile, { label: "Freezer problems", value: `${dead.map(f => `${f.site} F${f.number}`).slice(0, 2).join(', ')} down`, sub: trouble.length > dead.length ? `${trouble.length - dead.length} more need attention` : 'not working', tone: "bad", foot: "Act now", onClick: () => ctx.openFreezer(dead[0].id) })
                        : _jsx(Tile, { label: "Freezer problems", value: trouble.length, sub: trouble.length ? trouble.map(f => `${f.site} F${f.number}`).slice(0, 4).join(', ') : `all ${fz.filter(f => f.status === 'On').length} running`, tone: trouble.length ? 'heads' : 'ok', foot: trouble.length ? 'Needs attention' : undefined, onClick: trouble.length ? () => ctx.openFreezer(trouble[0].id) : undefined }), _jsx(Tile, { label: "Open spaces", value: n0(all.open), sub: `${Math.round(fullPct * 100)}% full · about ${n0(all.open * avg)} lbs of room`, tone: spaceTone, onClick: goMap, range: "30 days", chart: _jsx(Spark, { data: open30, project: proj }), foot: fill.hitsIn != null && fill.hitsIn <= 60 ? `Full in ~${fill.hitsIn} days` : 'Map' }), _jsx(Tile, { label: "METRC tags pending", value: rc.tags, sub: rc.issues ? `${rc.issues} import issues` : 'no import issues', tone: rc.tags ? 'warn' : rc.issues ? 'heads' : 'ok', onClick: ctx.goReview, range: "14 days", chart: _jsx(Spark, { data: iss14 }), foot: rc.tags || rc.issues ? `${iss7 != null && rc.issues !== iss7 ? `${rc.issues > iss7 ? '▲' : '▼'} ${Math.abs(rc.issues - iss7)} issues this week · ` : ''}Fix` : undefined }), staged && _jsx(Tile, { label: "Harvest staging", value: staged.n, sub: staged.n ? `${n0(staged.lbs)} lbs in ${staged.sites.join(' + ')} Staging` : 'nothing waiting', tone: staged.n ? 'heads' : 'ok', foot: staged.n ? 'Put away' : undefined, onClick: staged.n ? staged.go : undefined }), _jsx(Tile, { label: "Needs a spot", value: rc.spot, sub: rc.spot ? 'pallets not in a freezer' : 'all pallets placed', tone: rc.spot ? 'warn' : 'ok', foot: rc.spot ? 'Place them' : undefined, onClick: ctx.goReview }), fulfill && _jsx(Tile, { label: "Orders to fulfill", value: fulfill.open + fulfill.ready, sub: [fulfill.open && `${fulfill.open} need pallets`, fulfill.ready && `${fulfill.ready} ready to load`, fulfill.waiting && `${fulfill.waiting} waiting on Sales`].filter(Boolean).join(' · ') || 'all caught up', tone: fulfill.open ? 'warn' : fulfill.ready ? 'heads' : 'ok', foot: fulfill.open + fulfill.ready ? 'Fulfillment' : undefined, onClick: fulfill.go }), _jsx(Tile, { label: "Loads", value: loads.length, sub: loads.length ? [outToday && `${outToday} going out today`, moving && `${moving} in transit`].filter(Boolean).join(' · ') || 'being planned' : 'none active', tone: outToday ? 'info' : undefined, onClick: ctx.goTransit }), sales && _jsx(Tile, { label: "Sales", value: sales.orders + (sales.isAdmin ? sales.requests : 0), sub: [`${sales.orders} orders to confirm`, sales.isAdmin && `${sales.requests} reserve requests`].filter(Boolean).join(' · '), tone: sales.orders + (sales.isAdmin ? sales.requests : 0) ? 'info' : undefined, foot: sales.orders + (sales.isAdmin ? sales.requests : 0) ? 'Review' : undefined, onClick: sales.go })] }), _jsxs(Cards, { children: [_jsx(Card, { title: "Freezer space", action: "Map", onAction: goMap, wide: true, children: _jsxs("div", { className: "dsites", children: [['OHR', 'GVR'].map(site => {
                                    const fs = fz.filter(f => f.site === site).sort((a, b) => a.number - b.number);
                                    if (!fs.length)
                                        return null;
                                    const t = tot(fs);
                                    return (_jsxs("div", { className: "dsite", children: [_jsx(Meter, { label: _jsx("b", { children: site }), right: _jsxs(_Fragment, { children: [n0(t.used), " of ", n0(t.slots), " spots full \u00B7 ", _jsxs("b", { children: [n0(t.open), " open"] })] }), value: t.used, max: t.slots, tone: t.slots && t.used / t.slots > 0.92 ? 'warn' : 'ok' }), _jsx("div", { className: "dfz", children: fs.map(f => {
                                                    const x = per.get(f.id);
                                                    const full = x.slots ? x.used / x.slots : 0;
                                                    return (_jsxs("button", { className: `dfz-c st-${f.status.replace(/ /g, '-')}`, title: `${site} F${f.number}: ${f.status} · ${x.open} open · ${n0(x.lbs)} lbs`, onClick: () => ctx.openFreezer(f.id), children: [_jsxs("span", { children: ["F", f.number] }), _jsx("i", { style: { height: `${Math.round(full * 100)}%` } }), _jsx("em", { children: f.status === 'Not Working' ? '✕' : x.open })] }, f.id));
                                                }) })] }, site));
                                }), _jsx("div", { className: "muted small-note", children: "Each box is a freezer: fill shows how full it is, the number is open spots. Amber needs attention, red isn't working, grey is off." })] }) }), _jsx(Card, { title: "Loads", badge: loads.length, children: _jsx(Loads, { ctx: ctx, loads: loads }) }), _jsx(Card, { title: "Recent activity", children: _jsx(Activity, { ctx: ctx }) }), _jsx(Card, { title: "Site overview", children: _jsx(Overview, { ctx: ctx }) })] })] }));
}
