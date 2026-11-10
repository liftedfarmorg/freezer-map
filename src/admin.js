import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { MODULES } from './types';
import { axisDate, Card, Cards, DashHead, Empty, lastDays, Meter, Spark, Tile, Tiles, ymd } from './dash';
const n0 = (x) => Math.round(Number(x)).toLocaleString();
const plural = (n, w) => `${n} ${n === 1 ? w : w === 'person' ? 'people' : /(ch|sh|s|x)$/.test(w) ? w + 'es' : w + 's'}`;
const money = (x) => '$' + Math.round(Number(x)).toLocaleString();
const fmt = (s) => s ? new Date(s + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
/** Admin Dashboard: the whole company on one page */
export function AdminDashboard({ backend, open }) {
    const [o, setO] = useState(null);
    const [err, setErr] = useState(null);
    useEffect(() => { backend.adminOverview().then(setO).catch(e => setErr(String(e?.message ?? e))); }, [backend]);
    const [lbsHist, setLbsHist] = useState(new Map());
    useEffect(() => { backend.dashSeries(['freezer_lbs'], lastDays(90)[0]).then(rs => setLbsHist(new Map(rs.map(r => [r.day, r.value])))).catch(() => { }); }, [backend]);
    if (err)
        return _jsxs("div", { className: "list", children: [_jsx("h2", { children: "Dashboard" }), _jsx("div", { className: "warnbox", children: err })] });
    if (!o)
        return _jsx("p", { className: "muted", children: "Loading\u2026" });
    const vs = o.season.done_est ? o.season.actual / o.season.done_est - 1 : null;
    const N = o.nursery, B = o.billing, L = o.logs;
    const waiting = o.sales.requests + o.sales.to_confirm + o.needs_spot + o.season.unlogged + (N?.late ?? 0) + (N?.positive_tests ?? 0) + (B?.overdue ?? 0) + (o.licenses?.expiring.length ?? 0);
    const month = new Date().toLocaleDateString(undefined, { month: 'long' });
    return (_jsxs("div", { className: "dash", children: [_jsx(DashHead, { title: "Dashboard", sub: `Company overview · ${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}` }), _jsxs(Tiles, { children: [_jsx(Tile, { wide: true, label: "In the freezers", value: `${n0(o.freezers.lbs)} lbs`, range: "90 days", onClick: () => open('dist.map'), kv: [[n0(o.freezers.pallets), 'pallets'], [n0(o.open_spaces), 'open spots']], chart: _jsx(Spark, { data: lastDays(90).map((d, i, a) => (i === a.length - 1 ? Number(o.freezers.lbs) : lbsHist.get(d) ?? null)), labels: [axisDate(lastDays(90)[0]), 'Today'] }), foot: (() => { const w = lbsHist.get(ymd(new Date(Date.now() - 7 * 864e5))); return w ? `${o.freezers.lbs >= w ? '▲' : '▼'} ${Math.abs((o.freezers.lbs / w - 1) * 100).toFixed(1)}% this week` : 'Map'; })() }), _jsx(Tile, { label: `${o.crop_year} fresh frozen`, value: `${n0(o.season.actual)} lbs`, sub: vs != null ? `${vs >= 0 ? '+' : ''}${Math.round(vs * 100)}% vs estimate · ${o.season.done}/${o.season.harvests} harvests` : `${o.season.done}/${o.season.harvests} harvests`, tone: vs == null ? undefined : vs < -0.1 ? 'heads' : 'ok', onClick: () => open('cult.yields') }), _jsx(Tile, { label: `${o.crop_year} reserves left`, value: `${n0(o.reserves.remaining)} lbs`, sub: `of ${n0(o.reserves.reserved)} · ${plural(o.reserves.customers, 'customer')}`, onClick: () => open('sales.customer') }), _jsx(Tile, { label: `${o.next.year} reserves`, value: `${n0(o.next.reserved)} lbs`, sub: `${plural(o.next.customers, 'customer')} · ${n0(o.next.requested)} lbs asked${o.next.deadline ? ` · deadline ${fmt(o.next.deadline)}` : ''}`, tone: "info", onClick: () => open('sales.strain') }), _jsx(Tile, { label: `Sold in ${month}`, value: `${n0(o.sales.lbs_ordered_month)} lbs`, sub: `${plural(o.sales.orders_month, 'order')}${o.sales.value_month ? ` · ${money(o.sales.value_month)}` : ''} · ${n0(o.sales.lbs_shipped_month)} shipped`, onClick: () => open('sales.orders') }), N && _jsx(Tile, { label: "Nursery", value: `${n0(N.rooting + N.ready)} clones`, sub: `${n0(N.ready)} ready · ${n0(N.owed)} owed on ${plural(N.open_orders, 'order')}${N.late ? `, ${N.late} late` : ''}`, tone: N.late ? 'warn' : undefined, onClick: () => open('nurs.dashboard') }), B && _jsx(Tile, { label: "Unpaid invoices", value: money(B.open_amt), sub: `${plural(B.open, 'invoice')}${B.overdue ? ` · ${money(B.overdue_amt)} overdue` : ' · none overdue'}`, tone: B.overdue ? 'warn' : 'ok', foot: B.overdue ? 'Follow up' : undefined, onClick: () => open('sales.invoices') }), _jsx(Tile, { label: "Waiting on someone", value: waiting, sub: waiting ? 'requests, orders, deliveries, invoices' : 'nothing waiting', tone: waiting ? 'heads' : 'ok' }), _jsx(Tile, { label: "Loads", value: o.loads.active, sub: `${o.loads.active ? `${o.loads.in_transit} in transit` : 'none active'}${o.open_orders != null ? ` · ${plural(o.open_orders, 'order')} to ship` : ''}`, onClick: () => open('dist.transit') }), L && _jsx(Tile, { label: `Logs in ${month}`, value: L.month, sub: `${L.pesticide_month ? `${plural(L.pesticide_month, 'pesticide spray')}` : 'no pesticide sprays'}${L.labor_hours_month ? ` · ${n0(L.labor_hours_month)} labor hrs` : ''}`, onClick: () => open('cult.logs') })] }), _jsxs(Cards, { children: [_jsx(Card, { title: "Waiting on someone", children: _jsx("div", { className: "dlist", children: [
                                [o.sales.to_confirm, 'Orders to confirm', 'Sales', 'sales.orders'],
                                [o.sales.requests, 'Reserve requests to approve', 'Sales', 'sales.requests'],
                                [o.needs_spot, 'Pallets that need a spot', 'Distribution', 'dist.review'],
                                [o.season.unlogged, 'Harvests not logged', 'Cultivation', 'cult.review'],
                                ...(N ? [[N.late, 'Late clone deliveries', 'Nursery', 'nurs.review'], [N.positive_tests, 'Positive lab tests, nothing culled', 'Nursery', 'nurs.review'],
                                    [N.no_tag, 'Clone batches with no METRC tag', 'Nursery', 'nurs.review']] : []),
                                ...(B ? [[B.overdue, 'Overdue invoices', 'Billing', 'sales.invoices'], [B.not_sent, 'Open invoices not emailed yet', 'Billing', 'sales.invoices']] : []),
                                ...(o.licenses ? [[o.licenses.expiring.length, 'Licenses expiring in 90 days', 'Admin', 'admin.settings']] : []),
                            ].map(([n, l, m, j]) => (_jsxs("button", { className: "drow click", onClick: () => open(j), children: [_jsxs("span", { children: [_jsx("b", { children: l }), _jsxs("span", { className: "muted", children: [" \u00B7 ", m] })] }), _jsx("span", { className: `pill ${n ? 'warnp' : ''}`, children: n })] }, String(l)))) }) }), _jsx(Card, { title: `${o.crop_year} season`, children: _jsxs("div", { className: "dlist", children: [_jsx(Meter, { label: "Fresh frozen harvested", right: _jsxs(_Fragment, { children: [n0(o.season.actual), " of ", n0(o.season.est), " lbs est."] }), value: o.season.actual, max: Math.max(o.season.est, o.season.actual), tone: "ok" }), _jsx(Meter, { label: "Reserves shipped", right: _jsxs(_Fragment, { children: [n0(o.reserves.shipped), " of ", n0(o.reserves.reserved), " lbs"] }), value: o.reserves.shipped, max: o.reserves.reserved, tone: "ok" }), _jsx(Meter, { label: "Reserves on open orders", right: _jsxs(_Fragment, { children: [n0(o.reserves.pending), " lbs"] }), value: o.reserves.pending, max: o.reserves.reserved })] }) }), N && _jsx(Card, { title: "Nursery", action: "Nursery", onAction: () => open('nurs.dashboard'), children: _jsxs("div", { className: "dlist", children: [_jsx(Meter, { label: "Ready vs owed", right: _jsxs(_Fragment, { children: [n0(N.ready), " ready \u00B7 ", n0(N.rooting), " rooting / ", n0(N.owed), " owed"] }), value: N.ready + N.rooting, max: Math.max(N.owed, N.ready + N.rooting, 1), tone: N.ready + N.rooting >= N.owed ? 'ok' : 'warn' }), _jsxs("button", { className: "drow click", onClick: () => open('nurs.mothers'), children: [_jsxs("span", { children: [_jsx("b", { children: "Mother plants" }), _jsxs("span", { className: "muted", children: [" \u00B7 ", plural(N.mom_lots, 'lot')] })] }), _jsx("b", { children: n0(N.moms) })] }), _jsxs("button", { className: "drow click", onClick: () => open('nurs.batches'), children: [_jsxs("span", { children: [_jsx("b", { children: "Rooting" }), _jsxs("span", { className: "muted", children: [" \u00B7 ", plural(N.rooting_batches, 'batch')] })] }), _jsx("b", { children: n0(N.rooting) })] }), _jsxs("button", { className: "drow click", onClick: () => open('nurs.orders'), children: [_jsxs("span", { children: [_jsx("b", { children: "Delivered" }), _jsxs("span", { className: "muted", children: [" \u00B7 ", month, " ", n0(N.delivered_month)] })] }), _jsxs("b", { children: [n0(N.delivered_year), " this year"] })] }), _jsxs("button", { className: "drow click", onClick: () => open('nurs.breeding'), children: [_jsxs("span", { children: [_jsx("b", { children: "Breeding" }), _jsxs("span", { className: "muted", children: [" \u00B7 ", plural(N.runs, 'run'), ", ", plural(N.hunts, 'hunt'), ", ", N.scored, " of ", N.phenos, " phenos scored"] })] }), _jsx("b", { children: plural(N.keepers, 'keeper') })] })] }) }), B && _jsx(Card, { title: "Billing", action: "Invoices", onAction: () => open('sales.invoices'), children: _jsxs("div", { className: "dlist", children: [_jsx(Meter, { label: `Paid in ${month}`, right: _jsxs(_Fragment, { children: [money(B.paid_month), " of ", money(B.billed_month), " billed"] }), value: B.paid_month, max: Math.max(B.billed_month, B.paid_month, 1), tone: "ok" }), _jsxs("div", { className: "drow", children: [_jsxs("span", { children: [_jsx("b", { children: "Open" }), _jsxs("span", { className: "muted", children: [" \u00B7 ", plural(B.open, 'invoice')] })] }), _jsx("b", { children: money(B.open_amt) })] }), _jsxs("div", { className: "drow", children: [_jsxs("span", { children: [_jsx("b", { children: "Overdue" }), _jsxs("span", { className: "muted", children: [" \u00B7 ", plural(B.overdue, 'invoice')] })] }), _jsx("b", { className: B.overdue ? 'bad-t' : '', children: money(B.overdue_amt) })] }), B.nursery_open_amt > 0 && _jsxs("button", { className: "drow click", onClick: () => open('nurs.invoices'), children: [_jsxs("span", { children: [_jsx("b", { children: "Clone invoices open" }), _jsx("span", { className: "muted", children: " \u00B7 Nursery" })] }), _jsx("b", { children: money(B.nursery_open_amt) })] })] }) }), L && _jsx(Card, { title: `Field logs · ${month}`, action: "Cultivation logs", onAction: () => open('cult.logs'), children: _jsxs("div", { className: "dlist", children: [[['cultivation', 'Cultivation', 'cult.logs'], ['nursery', 'Nursery', 'nurs.logs']].map(([m, l, j]) => (_jsxs("button", { className: "drow click", onClick: () => open(j), children: [_jsxs("span", { children: [_jsx("b", { children: l }), _jsxs("span", { className: "muted", children: [" \u00B7 ", ['spray', 'feed', 'labor'].map(k => `${L.by[`${m}.${k}`] ?? 0} ${k}`).join(' · ')] })] }), _jsx("b", { children: ['spray', 'feed', 'labor'].reduce((a, k) => a + (L.by[`${m}.${k}`] ?? 0), 0) })] }, m))), _jsxs("div", { className: "drow", children: [_jsxs("span", { children: [_jsx("b", { children: "Pesticide sprays" }), _jsx("span", { className: "muted", children: " \u00B7 for the use report" })] }), _jsx("b", { className: L.pesticide_month ? 'warn-t' : '', children: L.pesticide_month })] }), L.last && _jsxs("div", { className: "muted small-note", children: ["Last log ", fmt(L.last), "."] })] }) }), o.licenses && o.licenses.expiring.length > 0 && _jsx(Card, { title: "Licenses expiring", action: "Licenses", onAction: () => open('admin.settings'), children: _jsx("div", { className: "dlist", children: o.licenses.expiring.map(x => _jsxs("div", { className: "drow", children: [_jsxs("span", { children: [_jsx("b", { children: x.license }), _jsxs("span", { className: "muted", children: [" \u00B7 ", x.kind] })] }), _jsx("span", { className: "pill warnp", children: fmt(x.expires) })] }, x.license)) }) }), _jsxs(Card, { title: "Who uses what", action: "Users", onAction: () => open('admin.users'), children: [_jsxs("div", { className: "dlist", children: [_jsxs("button", { className: "drow click", onClick: () => open('admin.users'), children: [_jsxs("span", { children: [_jsx("b", { children: "Signed in this week" }), _jsxs("span", { className: "muted", children: [" \u00B7 ", o.people.staff_week, " of ", o.people.staff, " staff \u00B7 ", o.people.customers_month, " of ", o.people.customers, " customers this month"] })] }), _jsx("b", { children: o.people.staff_week })] }), _jsxs("div", { className: "drow", children: [_jsxs("span", { children: [_jsx("b", { children: "Owners" }), _jsx("span", { className: "muted", children: " \u00B7 everything" })] }), _jsx("b", { children: o.people.owners })] }), MODULES.map(m => _jsxs("div", { className: "drow", children: [_jsxs("span", { children: [_jsx("b", { children: m.label }), _jsxs("span", { className: "muted", children: [" \u00B7 ", m.what] })] }), _jsx("b", { children: (o.people.by_module ?? {})[m.key] ?? 0 })] }, m.key)), !o.people.staff && _jsx(Empty, { children: "No staff yet." })] }), _jsxs("div", { className: "muted small-note", children: ["Owners aren't counted per module.", o.people.view_only ? ` ${plural(o.people.view_only, 'person')} view only somewhere.` : ''] })] })] })] }));
}
const APP_KEYS = [
    { k: 'crop_year', l: 'Current crop year', hint: 'The crop on the open menu and current reserves. Change it when the new crop takes over.' },
    { k: 'company.legal', l: 'Legal name on documents', hint: 'Default: DNA Organics, Inc. (dba Lifted Farms)' },
    { k: 'company.address', l: 'Address', hint: 'Use a new line for the city line. Default: 1961 Main St. #146 / Watsonville, CA 95076' },
    { k: 'company.email', l: 'Email', hint: 'On invoices and in the portal. Default: accounting@lifted-organics.com' },
    { k: 'company.phone', l: 'Phone' }, { k: 'company.web', l: 'Website' }, { k: 'company.license', l: 'License #', hint: 'Optional, under the address on documents' },
    { k: 'company.remit', l: 'Remit to (bank details)', hint: 'e.g. Remit to: [Bank] · Account ••••0000 · Routing 122243224 | Check payable to: DNA Organics, Inc.', area: true },
    { k: 'company.crypto', l: 'Crypto line' },
    { k: 'company.late_terms', l: 'Late payment terms', hint: 'The 1.5% monthly finance charge paragraph. Blank = the standard wording.', area: true },
];
/** Admin > Settings > App settings: things that apply to the whole app */
export function AppSettingsPanel({ backend, flash }) {
    const [v, setV] = useState(null);
    const [was, setWas] = useState({});
    const [busy, setBusy] = useState(false);
    useEffect(() => { backend.appSettings().then(x => { setV(x); setWas(x); }).catch(() => setV({})); }, [backend]);
    if (!v)
        return _jsx("p", { className: "muted", children: "Loading\u2026" });
    const changed = APP_KEYS.filter(x => (v[x.k] ?? '') !== (was[x.k] ?? ''));
    async function save() {
        setBusy(true);
        try {
            for (const x of changed)
                await backend.setAppSetting(x.k, (v[x.k] ?? '').trim());
            setWas(v);
            flash('Saved');
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs("div", { className: "form-panel", children: [APP_KEYS.map(x => (_jsxs("div", { className: "field", children: [_jsx("label", { children: x.l }), x.area || x.k === 'company.address' ? _jsx("textarea", { rows: 3, value: v[x.k] ?? '', onChange: e => setV({ ...v, [x.k]: e.target.value }) })
                        : _jsx("input", { value: v[x.k] ?? '', inputMode: x.k === 'crop_year' ? 'numeric' : undefined, onChange: e => setV({ ...v, [x.k]: e.target.value }) }), x.hint && _jsx("p", { className: "muted", children: x.hint })] }, x.k))), _jsx("p", { className: "muted", children: "These show on every sales order and invoice. Each module's own settings (vehicles, customers, payment terms, sites, fields) are under Settings in that module." }), _jsxs("button", { className: "primary", disabled: busy || !changed.length, onClick: save, children: ["Save", changed.length ? ` ${changed.length} change${changed.length > 1 ? 's' : ''}` : ''] })] }));
}
/** Admin > Review: what's stuck anywhere in the company, plus people and logins that need a look */
export function AdminReview({ backend, open }) {
    const [o, setO] = useState(null);
    const [users, setUsers] = useState(null);
    const [logins, setLogins] = useState(new Map());
    const [err, setErr] = useState(null);
    useEffect(() => {
        backend.adminOverview().then(setO).catch(e => setErr(String(e?.message ?? e)));
        Promise.all([backend.listUsers(), backend.userLogins()]).then(([u, l]) => { setUsers(u); setLogins(l); }).catch(() => setUsers([]));
    }, [backend]);
    if (err)
        return _jsxs("div", { className: "list", children: [_jsx("h2", { children: "Review" }), _jsx("div", { className: "warnbox", children: err })] });
    if (!o || !users)
        return _jsx("p", { className: "muted", children: "Loading\u2026" });
    const staff = users.filter(u => ['admin', 'sales', 'crew'].includes(u.role));
    const noMods = staff.filter(u => !u.owner && !Object.keys(u.access ?? {}).length);
    const never = staff.filter(u => !u.last_seen);
    const custs = users.filter(u => u.role === 'customer');
    const notInvited = custs.filter(u => !logins.get(u.email)?.invited_at && !logins.get(u.email)?.claimed);
    const notSetUp = custs.filter(u => logins.get(u.email)?.invited_at && !logins.get(u.email)?.claimed);
    const work = [
        [o.sales.to_confirm, 'Orders to confirm', 'Sales', 'sales.orders'],
        [o.sales.requests, 'Reserve requests to approve', 'Sales', 'sales.requests'],
        [o.needs_spot, 'Pallets that need a spot', 'Distribution', 'dist.review'],
        [o.season.unlogged, 'Harvests not logged', 'Cultivation', 'cult.review'],
    ];
    const stuck = work.filter(w => w[0] > 0);
    const people = [
        [noMods, 'Staff with no modules', 'They can sign in but see nothing. Give them a module or set them to No access.'],
        [never, 'Never signed in', 'Added but haven\'t used the app yet.'],
        [notInvited, 'Customers not invited', 'No portal invite link made yet.'],
        [notSetUp, 'Customers invited, not set up', 'Link sent but no password yet. Links work for 14 days.'],
    ];
    const nothing = !stuck.length && people.every(p => !p[0].length);
    return (_jsxs("div", { className: "list dash", children: [_jsx("h2", { children: "Review" }), nothing && _jsx("p", { className: "muted", children: "Nothing needs attention anywhere." }), stuck.length > 0 && _jsxs("section", { className: "dcard", children: [_jsx("div", { className: "dcard-h", children: _jsx("h3", { children: "Waiting in the modules" }) }), _jsx("div", { className: "dlist", children: stuck.map(([n, l, m, j]) => _jsxs("button", { className: "drow click", onClick: () => open(j), children: [_jsxs("span", { children: [_jsx("b", { children: l }), _jsxs("span", { className: "muted", children: [" \u00B7 ", m] })] }), _jsx("span", { className: "pill warnp", children: n })] }, l)) })] }), people.filter(p => p[0].length).map(([list, l, note]) => (_jsxs("section", { className: "dcard", children: [_jsxs("div", { className: "dcard-h", children: [_jsxs("h3", { children: [l, " ", _jsx("span", { className: "side-badge", children: list.length })] }), _jsx("button", { className: "linkbtn", onClick: () => open('admin.users'), children: "Users \u203A" })] }), _jsx("p", { className: "muted", children: note }), _jsx("div", { className: "dlist", children: list.map(u => _jsx("div", { className: "drow", children: _jsxs("span", { children: [_jsx("b", { children: u.display_name || u.email }), u.display_name && _jsxs("span", { className: "muted", children: [" \u00B7 ", u.email] })] }) }, u.email)) })] }, l)))] }));
}
