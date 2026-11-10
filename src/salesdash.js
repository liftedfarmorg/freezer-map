import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { StopAlerts } from './driver';
import { useEffect, useState } from 'react';
import { DeadlineEdit, FillOk } from './reserves';
import { Card, Cards, DashHead, Empty, Legend, Meter, Spark, Tile, Tiles } from './dash';
const n0 = (x) => Math.round(x).toLocaleString();
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const money = (x) => '$' + Math.round(x).toLocaleString();
const fmt = (s) => s ? new Date(s + (s.length === 10 ? 'T12:00:00' : '')).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
const daysTo = (s) => Math.ceil((new Date(s + 'T23:59:59').getTime() - Date.now()) / 864e5);
const loadAll = (b) => Promise.all([b.listBalances(), b.listOrders().catch(() => []), b.listRequests().catch(() => []),
    b.menuNumbers().catch(() => []), b.reserveYears()]).then(([bal, orders, reqs, nums, ys]) => ({ bal, orders, reqs, nums, ys }));
/** Sales Dashboard */
export function SalesDashboard({ backend, customers, isAdmin, go }) {
    const [d, setD] = useState(null);
    const [err, setErr] = useState(null);
    useEffect(() => { loadAll(backend).then(setD).catch(e => setErr(String(e?.message ?? e))); }, [backend]);
    const [holds, setHolds] = useState([]);
    useEffect(() => { backend.sampleHolds().then(h => setHolds(h.filter(x => x.state === 'waiting' || x.state === 'active'))).catch(() => { }); }, [backend]);
    if (err)
        return _jsx("div", { className: "list", children: _jsxs("div", { className: "warnbox", children: ["Couldn't load sales. (", err, ")"] }) });
    if (!d)
        return _jsx("p", { className: "muted", children: "Loading\u2026" });
    const cname = (id) => customers.find(c => c.id === id)?.name ?? `#${id}`;
    const cur = d.ys.current;
    const balC = d.bal.filter(r => (r.crop_year ?? cur) === cur);
    const S = (k, rs = balC) => rs.reduce((a, r) => a + Number(r[k]), 0);
    const pend = d.reqs.filter(r => r.status === 'pending');
    const toConfirm = d.orders.filter(o => o.status === 'submitted');
    const menu = d.nums.filter(m => m.on_menu && m.crop_year === cur);
    const free = menu.reduce((a, m) => a + Math.max(0, Number(m.free)), 0);
    const next = d.ys.years.filter(y => y.year > cur).sort((a, b) => a.year - b.year)[0];
    const nextBal = next ? d.bal.filter(r => r.crop_year === next.year) : [];
    const nextReq = next ? pend.filter(r => r.crop_year === next.year) : [];
    const t0 = new Date(), moS = `${t0.getFullYear()}-${String(t0.getMonth() + 1).padStart(2, '0')}-01`;
    const placed = (o) => o.order_date ?? (o.created_at ?? '').slice(0, 10);
    const monthOrders = d.orders.filter(o => o.status !== 'cancelled' && o.status !== 'draft' && placed(o) >= moS);
    const lines = (os) => os.flatMap(o => o.order_lines);
    const lbsMonth = lines(monthOrders).reduce((a, l) => a + Number(l.lbs), 0);
    const valMonth = lines(monthOrders).reduce((a, l) => a + Number(l.lbs) * Number(l.price_per_lb ?? 0), 0);
    const shippedMonth = lines(d.orders.filter(o => o.status === 'shipped' && (o.shipped_date ?? '') >= moS)).reduce((a, l) => a + Number(l.lbs), 0);
    // month to date, day by day, against last month on the same days
    const lmD = new Date(t0.getFullYear(), t0.getMonth() - 1, 1);
    const lmS = `${lmD.getFullYear()}-${String(lmD.getMonth() + 1).padStart(2, '0')}-01`;
    const dim = (y, m) => new Date(y, m + 1, 0).getDate();
    const nThis = dim(t0.getFullYear(), t0.getMonth()), nLast = dim(lmD.getFullYear(), lmD.getMonth());
    const live = d.orders.filter(o => o.status !== 'cancelled' && o.status !== 'draft');
    const cum = (startS, n, upTo) => {
        const per = new Array(n).fill(0);
        for (const o of live) {
            const p = placed(o);
            if (p >= startS && p.slice(0, 7) === startS.slice(0, 7)) {
                const i = Number(p.slice(8, 10)) - 1;
                if (i < n)
                    per[i] += o.order_lines.reduce((a, l) => a + Number(l.lbs), 0);
            }
        }
        let run = 0;
        return per.map((x, i) => (i < upTo ? (run += x) : null));
    };
    const dayNo = t0.getDate();
    const mtd = cum(moS, nThis, dayNo), lastMo = cum(lmS, nLast, nLast);
    const lastAtDay = lastMo[Math.min(dayNo, nLast) - 1] ?? 0;
    // only compare when last month had real volume by this day (not a month with a handful of app orders)
    const pace = lastAtDay >= 1000 && lastAtDay >= lbsMonth * 0.1 ? lbsMonth / lastAtDay - 1 : null;
    const moName = (x) => x.toLocaleDateString(undefined, { month: 'short' });
    const cm = new Map();
    for (const r of balC) {
        const x = cm.get(r.customer_id) ?? { res: 0, left: 0 };
        x.res += Number(r.reserved);
        x.left += Number(r.remaining);
        cm.set(r.customer_id, x);
    }
    const byCust = [...cm].sort((a, b) => b[1].res - a[1].res).slice(0, 8);
    const top = [...menu].sort((a, b) => Number(b.free) - Number(a.free)).slice(0, 6);
    return (_jsxs("div", { className: "dash", children: [_jsx(DashHead, { title: "Dashboard", sub: `Sales · ${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}` }), _jsx(StopAlerts, { sb: backend.client(), only: ['sales', 'accounting'] }), _jsxs(Tiles, { children: [_jsx(Tile, { label: "Orders to confirm", value: toConfirm.length, sub: toConfirm.length ? `oldest ${fmt(toConfirm.map(o => o.order_date ?? '').sort()[0] || null)}` : 'all caught up', tone: toConfirm.length ? 'warn' : 'ok', foot: toConfirm.length ? 'Confirm' : undefined, onClick: () => go('orders') }), _jsx(Tile, { label: "Reserve requests", value: pend.length, sub: pend.length ? `${plural(new Set(pend.map(r => r.customer_id)).size, 'customer')} waiting${isAdmin ? '' : ' (Sales Admin approves)'}` : 'none waiting', tone: pend.length ? (isAdmin ? 'warn' : 'info') : 'ok', foot: pend.length ? 'Review' : undefined, onClick: () => go('requests') }), _jsx(Tile, { label: `${cur} reserves left`, value: `${n0(S('remaining'))} lbs`, sub: `of ${n0(S('reserved'))} reserved · ${n0(S('shipped'))} shipped`, onClick: () => go('customer') }), holds.length > 0 && _jsx(Tile, { label: "Sample holds", value: `${Math.round(holds.reduce((a, h) => a + Number(h.remaining), 0)).toLocaleString()} lbs`, sub: `${holds.length} hold${holds.length === 1 ? '' : 's'}${holds.some(h => h.until && h.until <= new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)) ? ' · some end in 3 days' : ''}`, onClick: () => go('requests') }), _jsx(Tile, { label: "Open menu", value: `${n0(free)} lbs`, sub: `free to sell across ${menu.filter(m => Number(m.free) > 0).length} strains`, onClick: () => go('menu') }), _jsx(Tile, { wide: true, label: "Sold this month", value: `${n0(lbsMonth)} lbs`, onClick: () => go('orders'), range: _jsxs(_Fragment, { children: [_jsx(Legend, { now: moName(t0), then: moName(lmD) }), _jsx("span", { children: "Month to date" })] }), kv: [...(valMonth ? [[money(valMonth), 'ordered']] : []), [monthOrders.length, plural(monthOrders.length, 'order').replace(/^\d+ /, '')], [n0(shippedMonth), 'lbs shipped']], chart: _jsx(Spark, { data: mtd, ghost: lastMo, labels: [`${moName(t0)} 1`, `${moName(t0)} ${nThis}`], empty: "Shows once there are orders this month" }), foot: pace != null ? `${pace >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(pace * 100))}% vs ${moName(lmD)} pace` : 'Orders' }), next && _jsx(Tile, { label: `${next.year} requests`, value: next.deadline ? `${Math.max(0, daysTo(next.deadline))} days` : 'no deadline', sub: `${next.deadline ? `to ${fmt(next.deadline)} · ` : ''}${n0(nextBal.reduce((a, r) => a + Number(r.reserved), 0))} lbs approved, ${n0(nextReq.reduce((a, r) => a + Number(r.requested_lbs), 0))} asked`, tone: next.deadline && daysTo(next.deadline) < 14 ? 'heads' : undefined, onClick: () => go('strain') })] }), _jsxs(Cards, { children: [_jsx(Card, { title: "Orders to confirm", badge: toConfirm.length, action: "Orders", onAction: () => go('orders'), children: toConfirm.length ? _jsx("div", { className: "dlist", children: toConfirm.slice(0, 8).map(o => (_jsxs("button", { className: "drow click", onClick: () => go('orders'), children: [_jsxs("span", { children: [_jsx("b", { children: cname(o.customer_id) }), _jsxs("span", { className: "muted", children: [" \u00B7 ", o.order_lines.length, " lines", o.wanted_date ? ` · requested delivery ${fmt(o.wanted_date)}` : ''] })] }), _jsxs("b", { children: [n0(o.order_lines.reduce((a, l) => a + Number(l.lbs), 0)), " lbs"] })] }, o.id))) }) : _jsx(Empty, { children: "No orders waiting." }) }), _jsx(Card, { title: "Reserve requests", badge: pend.length, action: "Requests", onAction: () => go('requests'), children: pend.length ? _jsx("div", { className: "dlist", children: [...new Set(pend.map(r => r.customer_id))].map(id => {
                                const rs = pend.filter(r => r.customer_id === id);
                                return _jsxs("button", { className: "drow click", onClick: () => go('requests'), children: [_jsxs("span", { children: [_jsx("b", { children: cname(id) }), _jsxs("span", { className: "muted", children: [" \u00B7 ", rs.length, " strains \u00B7 ", [...new Set(rs.map(r => r.crop_year ?? cur))].join(', '), " crop"] })] }), _jsxs("b", { children: [n0(rs.reduce((a, r) => a + Number(r.requested_lbs) - Number(r.current_lbs), 0)), " lbs"] })] }, id);
                            }) }) : _jsx(Empty, { children: "No requests waiting." }) }), _jsx(Card, { title: `${cur} reserves by customer`, action: "Reserves", onAction: () => go('customer'), children: _jsxs("div", { className: "dlist", children: [byCust.map(([id, x]) => _jsx(Meter, { label: cname(id), right: _jsxs(_Fragment, { children: [n0(x.left), " left of ", n0(x.res)] }), value: x.res - x.left, max: x.res, tone: "ok" }, id)), !byCust.length && _jsxs(Empty, { children: ["No reserves for ", cur, "."] })] }) }), _jsx(Card, { title: "Most to sell", action: "Open menu", onAction: () => go('menu'), children: top.length ? _jsx("div", { className: "dlist", children: top.map(m => _jsxs("div", { className: "drow", children: [_jsxs("span", { children: [_jsx("b", { children: m.strain }), _jsxs("span", { className: "muted", children: [" \u00B7 ", n0(Number(m.on_hand)), " on hand"] })] }), _jsxs("b", { children: [n0(Number(m.free)), " lbs free"] })] }, m.strain)) }) : _jsx(Empty, { children: "Nothing on the menu." }) })] })] }));
}
/** Sales > Review: what needs a decision, in one place */
export function SalesReview({ backend, customers, isAdmin, go, fulfil, onFulfil, flash }) {
    const [d, setD] = useState(null);
    useEffect(() => { loadAll(backend).then(setD).catch(() => { }); }, [backend]);
    if (!d)
        return _jsx("p", { className: "muted", children: "Loading\u2026" });
    const cname = (id) => customers.find(c => c.id === id)?.name ?? `#${id}`;
    const cur = d.ys.current;
    const toConfirm = d.orders.filter(o => o.status === 'submitted');
    const pend = d.reqs.filter(r => r.status === 'pending');
    const over = d.bal.filter(r => (r.crop_year ?? cur) === cur && Number(r.remaining) < 0);
    const short = d.nums.filter(m => m.crop_year === cur && Number(m.free) < 0);
    const fills = (fulfil ?? []).filter(f => f.state === 'needs_ok');
    const none = !toConfirm.length && !pend.length && !over.length && !short.length && !fills.length;
    return (_jsxs("div", { className: "list dash", children: [_jsx("h2", { children: "Review" }), none && _jsx("p", { className: "muted", children: "Nothing needs attention in Sales." }), fills.length > 0 && _jsxs("section", { className: "dcard", children: [_jsx("div", { className: "dcard-h", children: _jsxs("h3", { children: ["Amounts to OK ", _jsx("span", { className: "side-badge", children: fills.length })] }) }), _jsx("p", { className: "muted", children: "Distribution assigned pallets that don't exactly match what was ordered." }), fills.map(f => _jsxs("div", { children: [_jsx("b", { children: f.customer }), " ", _jsx("span", { className: "muted", children: f.so ?? `Order #${f.id}` }), _jsx(FillOk, { f: f, backend: backend, flash: flash, onDone: async () => { await onFulfil?.(); setD(await loadAll(backend)); } })] }, f.id))] }), toConfirm.length > 0 && _jsxs("section", { className: "dcard", children: [_jsxs("div", { className: "dcard-h", children: [_jsxs("h3", { children: ["Orders to confirm ", _jsx("span", { className: "side-badge", children: toConfirm.length })] }), _jsx("button", { className: "linkbtn", onClick: () => go('orders'), children: "Orders \u203A" })] }), _jsx("div", { className: "dlist", children: toConfirm.map(o => _jsxs("button", { className: "drow click", onClick: () => go('orders'), children: [_jsxs("span", { children: [_jsx("b", { children: cname(o.customer_id) }), _jsxs("span", { className: "muted", children: [" \u00B7 placed ", fmt(o.order_date)] })] }), _jsxs("b", { children: [n0(o.order_lines.reduce((a, l) => a + Number(l.lbs), 0)), " lbs"] })] }, o.id)) })] }), pend.length > 0 && _jsxs("section", { className: "dcard", children: [_jsxs("div", { className: "dcard-h", children: [_jsxs("h3", { children: ["Reserve requests waiting ", _jsx("span", { className: "side-badge", children: pend.length })] }), _jsx("button", { className: "linkbtn", onClick: () => go('requests'), children: "Requests \u203A" })] }), !isAdmin && _jsx("p", { className: "muted", children: "A Sales Admin approves these." }), _jsx("div", { className: "dlist", children: [...new Set(pend.map(r => r.customer_id))].map(id => _jsxs("button", { className: "drow click", onClick: () => go('requests'), children: [_jsx("span", { children: _jsx("b", { children: cname(id) }) }), _jsxs("span", { children: [pend.filter(r => r.customer_id === id).length, " strains"] })] }, id)) })] }), over.length > 0 && _jsxs("section", { className: "dcard", children: [_jsx("div", { className: "dcard-h", children: _jsxs("h3", { children: ["Ordered past their reserve ", _jsx("span", { className: "side-badge", children: over.length })] }) }), _jsx("div", { className: "dlist", children: over.map(r => _jsxs("div", { className: "drow", children: [_jsxs("span", { children: [_jsx("b", { children: cname(r.customer_id) }), _jsxs("span", { className: "muted", children: [" \u00B7 ", r.strain] })] }), _jsxs("span", { className: "pill badp", children: [n0(Number(r.remaining)), " lbs"] })] }, r.id)) })] }), short.length > 0 && _jsxs("section", { className: "dcard", children: [_jsxs("div", { className: "dcard-h", children: [_jsxs("h3", { children: ["Promised more than we have ", _jsx("span", { className: "side-badge", children: short.length })] }), _jsx("button", { className: "linkbtn", onClick: () => go('strain'), children: "By strain \u203A" })] }), _jsx("div", { className: "dlist", children: short.map(m => _jsxs("div", { className: "drow", children: [_jsxs("span", { children: [_jsx("b", { children: m.strain }), _jsxs("span", { className: "muted", children: [" \u00B7 ", n0(Number(m.on_hand)), " on hand, ", n0(Number(m.reserved_left)), " reserved left"] })] }), _jsxs("span", { className: "pill badp", children: [n0(Number(m.free)), " lbs"] })] }, m.strain)) })] })] }));
}
/** Sales > Settings > Deadlines: when customers can request reserves for future crops */
export function DeadlinesPanel({ backend, flash }) {
    const [ys, setYs] = useState(null);
    useEffect(() => { backend.reserveYears().then(setYs).catch(() => { }); }, [backend]);
    if (!ys)
        return _jsx("p", { className: "muted", children: "Loading\u2026" });
    const futures = [...new Set([ys.current + 1, ...ys.years.map(y => y.year).filter(y => y > ys.current)])].sort();
    return (_jsxs("div", { className: "dlist", children: [_jsx("p", { className: "muted", children: "Customers can ask for reserves on a future crop in the portal until its deadline. You approve them under Requests." }), futures.map(y => (_jsxs("div", { className: "drow", children: [_jsxs("b", { children: [y, " crop"] }), _jsx(DeadlineEdit, { year: y, value: ys.years.find(x => x.year === y)?.deadline ?? null, onSave: async (v) => { try {
                            await backend.setReserveDeadline(y, v);
                            setYs(await backend.reserveYears());
                            flash('Deadline saved');
                        }
                        catch (e) {
                            flash(String(e.message ?? e), true);
                        } } })] }, y)))] }));
}
