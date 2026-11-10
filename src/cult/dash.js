import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { addDays, calcHarvest, daySummary, fieldName, fmtD, KIND_SHORT, monday, n0, sum, testRows, today } from './calc';
import { axisDate, Bars, Card, Cards, DashHead, Empty, Legend, Meter, Spark, Tile, Tiles } from '../dash';
const z = (x) => (x ? n0(x) : '');
/** Cultivation Dashboard: what needs doing this week, and how the season is going. */
export function CultDashboard({ d, c, site, onOpen, go }) {
    const now = today();
    const live = d.harvests.filter(h => h.status !== 'cancelled' && (!site || h.site === site));
    const sites = d.sites.map(s => s.code).filter(s => !site || s === site);
    const thisYear = d.year === d.currentYear;
    // next 7 days, from today
    const days = Array.from({ length: 7 }, (_, i) => addDays(now, i));
    const ds = daySummary(c, live, days);
    const dayTot = days.map(day => {
        const xs = [...(ds.get(day)?.values() ?? [])];
        return { day, plants: sum(xs.map(x => x.plants)), lbs: sum(xs.map(x => x.lbs)), ice: sum(xs.map(x => x.dryIce)),
            people: sum(xs.map(x => x.deleafPeople + x.buckPeople)), deleaf: sum(xs.map(x => x.deleafPeople)), buck: sum(xs.map(x => x.buckPeople)), n: sum(xs.map(x => x.strains.length)) };
    });
    const week = { plants: sum(dayTot.map(x => x.plants)), lbs: sum(dayTot.map(x => x.lbs)), n: sum(dayTot.map(x => x.n)) };
    const peak = dayTot.reduce((a, x) => (x.people > a.people ? x : a), dayTot[0]);
    // dry ice ordered on the Wednesday of the week before the harvest
    const wk = monday(now);
    const ice = live.filter(h => h.status === 'planned' && h.kind === 'ff').map(h => ({ h, k: calcHarvest(c, h) }))
        .filter(x => x.k.dryIceOrder && x.k.dryIceOrder >= wk && x.k.dryIceOrder <= addDays(wk, 13) && (x.h.planned_on ?? '') >= now)
        .sort((a, b) => a.k.dryIceOrder.localeCompare(b.k.dryIceOrder) || a.h.planned_on.localeCompare(b.h.planned_on));
    const iceNow = ice.filter(x => x.k.dryIceOrder <= addDays(wk, 6));
    const iceBy = new Map();
    for (const x of ice) {
        const g = iceBy.get(x.k.dryIceOrder) ?? iceBy.set(x.k.dryIceOrder, { lbs: 0, hs: [] }).get(x.k.dryIceOrder);
        g.lbs += x.k.dryIce ?? 0;
        g.hs.push(x);
    }
    // testing that needs action
    const tr = testRows(d, c, now);
    const act = [...tr.area, ...tr.strain].filter(r => (!site || r.site === site) && (r.status === 'ORDER NOW' || r.status === 'Window passed - sample ASAP'))
        .sort((a, b) => (a.suggested ?? a.first ?? '').localeCompare(b.suggested ?? b.first ?? ''));
    const late = act.filter(r => r.status !== 'ORDER NOW').length;
    // harvests whose day has passed but nobody logged them
    const unlogged = live.filter(h => h.status === 'planned' && !h.stage && h.planned_on && h.planned_on < now).sort((a, b) => a.planned_on.localeCompare(b.planned_on));
    // today on the Harvest screen
    const ids = new Set(live.map(h => h.id));
    const todayP = d.pallets.filter(p => ids.has(p.harvest_id) && p.harvest_date === now && !p.parent_id && p.status !== 'archived');
    const going = live.filter(h => h.stage === 'harvesting');
    const todayH = live.filter(h => h.planned_on === now && h.status === 'planned' && !h.stage);
    // season: fresh frozen actual vs estimate
    const ff = live.filter(h => h.kind === 'ff');
    const season = sites.map(s => {
        const hs = ff.filter(h => h.site === s);
        const done = hs.filter(h => h.status === 'done');
        const est = sum(hs.map(h => calcHarvest(c, h).estFF));
        const doneEst = sum(done.map(h => calcHarvest(c, h).estFF));
        const act = sum(done.map(h => calcHarvest(c, h).actFF));
        return { s, n: hs.length, done: done.length, est, doneEst, act };
    });
    const S = { n: sum(season.map(x => x.n)), done: sum(season.map(x => x.done)), est: sum(season.map(x => x.est)), doneEst: sum(season.map(x => x.doneEst)), act: sum(season.map(x => x.act)) };
    const vs = S.doneEst ? S.act / S.doneEst - 1 : null;
    // season curve: fresh frozen in so far vs the estimate, week by week
    const curve = (() => {
        const pts = ff.map(h => ({ h, k: calcHarvest(c, h) }));
        const days = pts.flatMap(x => [x.h.planned_on, x.h.harvested_on]).filter((x) => !!x).sort();
        if (!days.length)
            return null;
        const wk0 = monday(days[0]), end = monday(days[days.length - 1] > now ? days[days.length - 1] : now);
        const weeks = [];
        for (let w = wk0; w <= end; w = addDays(w, 7))
            weeks.push(w);
        const nowI = weeks.findIndex(w => addDays(w, 6) >= now);
        let ea = 0, aa = 0;
        const est = weeks.map(w => { const e = addDays(w, 6); ea += sum(pts.filter(x => x.h.planned_on && x.h.planned_on >= w && x.h.planned_on <= e).map(x => x.k.estFF ?? 0)); return ea; });
        const act = weeks.map((w, i) => { const e = addDays(w, 6); aa += sum(pts.filter(x => x.h.status === 'done' && (x.h.harvested_on ?? x.h.planned_on) && (x.h.harvested_on ?? x.h.planned_on) >= w && (x.h.harvested_on ?? x.h.planned_on) <= e).map(x => x.k.actFF ?? 0)); return nowI >= 0 && i > nowI ? null : aa; });
        return { weeks, est, act };
    })();
    const estToDate = curve ? curve.est[Math.max(0, curve.act.reduce((a, v, i) => (v != null ? i : a), 0))] : 0;
    return (_jsxs("div", { className: "dash", children: [_jsx(DashHead, { title: "Dashboard", sub: `Cultivation · ${site ?? 'all sites'} · ${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}` }), thisYear && _jsxs(Tiles, { children: [_jsx(Tile, { label: "Harvest today", value: `${n0(sum(todayP.map(p => p.og_weight)))} lbs`, sub: [todayP.length && `${todayP.length} pallets packed`, going.length && `${going.length} harvesting now`, todayH.length && `${todayH.length} not started`].filter(Boolean).join(' · ') || 'nothing scheduled today', tone: going.length ? 'info' : undefined, onClick: () => go('harvest') }), _jsx(Tile, { wide: true, label: "Next 7 days", value: `${n0(week.lbs)} lbs`, onClick: () => go('week'), range: "Next 7 days", kv: week.n ? [[week.n, 'harvests'], [n0(week.plants), 'plants'], ...(peak.people ? [[`${peak.people} people`, fmtD(peak.day, true)]] : [])] : undefined, sub: week.n ? undefined : 'no harvests scheduled', chart: week.n ? _jsx(Bars, { items: dayTot.map(x => ({ label: new Date(x.day + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' }), value: x.lbs, title: `${fmtD(x.day, true)}: ${n0(x.lbs)} lbs · ${x.people} people` })) }) : undefined, foot: iceNow.length ? `Dry ice: order ${n0(sum(iceNow.map(x => x.k.dryIce)))} lbs by ${fmtD(iceNow[0].k.dryIceOrder, true)}` : 'Week' }), _jsx(Tile, { label: "Most people needed", value: peak.people || 0, sub: peak.people ? `${fmtD(peak.day, true)} · ${peak.deleaf} deleaf, ${peak.buck} buck` : 'no crews needed', tone: peak.people ? 'info' : undefined, onClick: () => go('week') }), _jsx(Tile, { label: "Dry ice to order this week", value: `${n0(sum(iceNow.map(x => x.k.dryIce)))} lbs`, sub: iceNow.length ? `by ${fmtD(iceNow[0].k.dryIceOrder, true)} for ${iceNow.length} harvests` : 'nothing due', tone: iceNow.length ? 'heads' : 'ok' }), _jsx(Tile, { label: "Tests to sample", value: act.length, sub: act.length ? (late ? `${late} past the window` : 'window open now') : 'nothing due', tone: late ? 'warn' : act.length ? 'heads' : 'ok', foot: act.length ? 'Sample' : undefined, onClick: () => go('testing') }), _jsx(Tile, { label: "Harvests not logged", value: unlogged.length, sub: unlogged.length ? `oldest ${fmtD(unlogged[0].planned_on, true)}` : 'all caught up', tone: unlogged.length ? 'warn' : 'ok', foot: unlogged.length ? 'Log them' : undefined, onClick: () => go('schedule') }), _jsx(Tile, { wide: true, label: "Season fresh frozen", value: `${n0(S.act)} lbs`, tone: vs == null ? undefined : vs < -0.1 ? 'heads' : 'ok', onClick: () => go('yields'), range: _jsxs(_Fragment, { children: [_jsx(Legend, { now: "Actual", then: "Estimate" }), _jsx("span", { children: "Season" })] }), kv: [[S.est ? `${Math.round(S.act / S.est * 100)}%` : '–', `of ${n0(S.est)} est.`], ...season.filter(x => x.n).map(x => [`${n0(x.act)}`, x.s]), [`${S.done}/${S.n}`, 'harvests']], chart: curve ? _jsx(Spark, { data: curve.act, ghost: curve.est, labels: [axisDate(curve.weeks[0]), axisDate(curve.weeks[curve.weeks.length - 1])] }) : undefined, foot: S.doneEst ? `${vs >= 0 ? '+' : ''}${Math.round(vs * 100)}% vs estimate so far${estToDate ? ` · ${n0(estToDate)} expected by now` : ''}` : 'Yields' })] }), !thisYear && _jsxs("p", { className: "muted", children: ["Looking at the ", d.year, " season. The this-week numbers only show for ", d.currentYear, "."] }), _jsxs(Cards, { children: [thisYear && _jsxs(Card, { title: "Next 7 days", action: "Week", onAction: () => go('week'), wide: true, children: [_jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Day" }), !site && _jsx("th", { children: "Site" }), _jsx("th", { children: "Harvesting" }), _jsx("th", { className: "num", children: "Plants" }), _jsx("th", { className: "num", children: "Lbs FF" }), _jsx("th", { className: "num", children: "Dry ice" }), _jsx("th", { className: "num", children: "Deleaf" }), _jsx("th", { className: "num", children: "Buck" })] }) }), _jsx("tbody", { children: days.map(day => {
                                                const cs = sites.map(s => ({ s, x: ds.get(day)?.get(s) })).filter(v => v.x && (v.x.strains.length || v.x.deleafStrains.length));
                                                if (!cs.length)
                                                    return _jsxs("tr", { className: "heat0", children: [_jsxs("td", { className: "nowrap", children: [fmtD(day, true), day === now && ' (today)'] }), _jsx("td", { colSpan: site ? 6 : 7, className: "muted", children: "\u2014" })] }, day);
                                                return cs.map((v, i) => (_jsxs("tr", { className: day === now ? 'today' : '', children: [_jsx("td", { className: "nowrap", children: i === 0 ? _jsxs(_Fragment, { children: [fmtD(day, true), day === now && ' (today)'] }) : '' }), !site && _jsx("td", { children: v.s }), _jsx("td", { children: v.x.strains.join(', ') || _jsx("span", { className: "muted", children: "deleaf for tomorrow" }) }), _jsx("td", { className: "num", children: z(v.x.plants) }), _jsx("td", { className: "num", children: z(v.x.lbs) }), _jsx("td", { className: "num", children: z(v.x.dryIce) }), _jsx("td", { className: "num", children: _jsx("b", { children: v.x.deleafPeople || '' }) }), _jsx("td", { className: "num", children: _jsx("b", { children: v.x.buckPeople || '' }) })] }, day + v.s)));
                                            }) })] }) }), _jsx("div", { className: "muted small-note", children: "Deleaf and buck are people for the day. Deleafing happens the day before each fresh frozen harvest." })] }), thisYear && _jsx(Card, { title: "Testing: act now", badge: act.length, action: "Testing", onAction: () => go('testing'), children: act.length ? _jsxs("div", { className: "dlist", children: [act.slice(0, 8).map(r => (_jsxs("div", { className: "drow", children: [_jsxs("span", { children: [_jsx("b", { children: r.ref }), _jsxs("span", { className: "muted", children: [" \u00B7 first harvest ", fmtD(r.first, true)] })] }), _jsx("span", { className: `pill ${r.status === 'ORDER NOW' ? 'warnp' : 'badp'}`, children: r.status === 'ORDER NOW' ? `sample by ${fmtD(r.suggested, true)}` : 'sample ASAP' })] }, r.key))), act.length > 8 && _jsxs("div", { className: "muted small-note", children: ["+", act.length - 8, " more"] })] }) : _jsx(Empty, { children: "No samples due right now." }) }), thisYear && _jsx(Card, { title: "Dry ice orders", action: "Week", onAction: () => go('week'), children: iceBy.size ? _jsx("div", { className: "dlist", children: [...iceBy.entries()].map(([on, g]) => (_jsxs("div", { className: "drow", children: [_jsxs("span", { children: [_jsxs("b", { children: ["Order ", fmtD(on, true)] }), _jsxs("span", { className: "muted", children: [" \u00B7 ", g.hs.map(x => `${x.h.strain} ${fmtD(x.h.planned_on)}`).join(', ')] })] }), _jsxs("b", { children: [n0(g.lbs), " lbs"] })] }, on))) }) : _jsx(Empty, { children: "No dry ice orders due in the next two weeks." }) }), _jsx(Card, { title: "Needs logging", badge: unlogged.length, action: "Schedule", onAction: () => go('schedule'), children: unlogged.length ? _jsxs("div", { className: "dlist", children: [unlogged.slice(0, 8).map(h => (_jsxs("button", { className: "drow click", onClick: () => onOpen(h), children: [_jsxs("span", { children: [_jsx("b", { children: h.strain }), _jsxs("span", { className: "muted", children: [" \u00B7 ", h.site, " ", fieldName(c, h.field_id), " \u00B7 ", KIND_SHORT[h.kind]] })] }), _jsx("span", { className: "pill badp", children: fmtD(h.planned_on, true) })] }, h.id))), unlogged.length > 8 && _jsxs("div", { className: "muted small-note", children: ["+", unlogged.length - 8, " more"] })] }) : _jsx(Empty, { children: "Every past harvest has been logged." }) }), _jsx(Card, { title: `${d.year} season`, action: "Yields", onAction: () => go('yields'), children: _jsxs("div", { className: "dlist", children: [season.filter(x => x.n).map(x => (_jsx(Meter, { label: _jsxs(_Fragment, { children: [_jsx("b", { children: x.s }), " ", _jsxs("span", { className: "muted", children: [x.done, "/", x.n, " harvests"] })] }), right: _jsxs(_Fragment, { children: [n0(x.act), " of ", n0(x.est), " lbs est."] }), value: x.act, max: Math.max(x.est, x.act), tone: "ok" }, x.s))), !season.some(x => x.n) && _jsx(Empty, { children: "No fresh frozen harvests this season." }), S.doneEst > 0 && _jsxs("div", { className: "muted small-note", children: ["Harvests done so far came in at ", n0(S.act), " lbs against ", n0(S.doneEst), " estimated (", vs >= 0 ? '+' : '', Math.round(vs * 100), "%)."] })] }) })] })] }));
}
