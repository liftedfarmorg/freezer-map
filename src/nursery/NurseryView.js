import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { tagTxt } from '../mtag';
import { ScanButton } from '../scan';
import { sameTag, useScanHandler } from '../scanroute';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { NurseryApi } from './api';
import { GEN_LABEL, STAGE_LABEL, addDays, dueWithin, fmtD, live, makeCtx, n0, planSeason, strainKey, sum, today } from './calc';
import { nurseryLabel } from './tabs';
import { OrderSheet, OrdersTab, statusPill } from './orders';
import { BatchSheet, BatchesTab } from './batches';
import { MotherSheet, MothersTab } from './mothers';
import { PlanTab } from './plan';
import { LabTests } from './tests';
import { Leachate } from './leachate';
import { BreedingTab } from './breeding';
import { OpsLogs } from '../logs';
import { SetupTab } from './setup';
import { Card, Cards, DashHead, Empty, Meter, Tile, Tiles } from '../dash';
import { DocSheet, InvoicesView } from '../invoices';
import { errText } from '../cult/ui';
import { SortDay } from './sortday';
import { lang, t, tn } from '../i18n';
import '../cult/cult.css';
import './nursery.css';
export default function NurseryView({ backend, flash, tab, go, customers, isAdmin, sender, me }) {
    const sb = useMemo(() => backend.client(), [backend]);
    const api = useMemo(() => (sb ? new NurseryApi(sb) : null), [sb]);
    const [d, setD] = useState(null);
    const [err, setErr] = useState(null);
    const [q, setQ] = useState('');
    const [terms, setTerms] = useState([]);
    const [order, setOrder] = useState(null);
    const [batch, setBatch] = useState(null);
    const [mother, setMother] = useState(null);
    const [doc, setDoc] = useState(null);
    const [sortDay, setSortDay] = useState(false);
    const [openTag, setOpenTag] = useState(null);
    const load = useCallback(async () => {
        if (!api)
            return;
        try {
            setD(await api.load());
            setErr(null);
        }
        catch (e) {
            setErr(errText(e));
        }
    }, [api]);
    useEffect(() => { load(); backend.paymentTerms().then(setTerms).catch(() => { }); }, [load]);
    const cust = useMemo(() => new Map(customers.map(c => [c.id, c.name])), [customers]);
    const c = useMemo(() => d && makeCtx(d, cust), [d, cust]);
    const saved = useCallback(async (m) => { await load(); flash(t(m)); }, [load, flash]);
    // 281: the Scan button in Nursery opens what the tag is on: a mother lot, a clone package (batch),
    // a flowering plant (pheno) or a flowering planting (pollination run receivers). Anything else falls through to the pallet card.
    useScanHandler(async (tag) => {
        if (!d || !sb)
            return false;
        const m = d.mothers.find(x => sameTag(x.plant_tag, tag));
        if (m) {
            setMother(m);
            return true;
        }
        const bt = d.batches.find(x => sameTag(x.package_tag, tag) || (x.tags ?? []).some(y => sameTag(y, tag)));
        if (bt) {
            setBatch(bt);
            return true;
        }
        const T = tag.trim();
        const ph = await sb.from('phenos').select('id,hunt_id').ilike('plant_tag', T).limit(1);
        if (ph.data?.length) {
            go('breeding');
            setOpenTag(o => ({ pheno: ph.data[0].id, hunt: ph.data[0].hunt_id, n: (o?.n ?? 0) + 1 }));
            return true;
        }
        const rc = await sb.from('breed_receivers').select('id,run_id').ilike('plant_tag', T).limit(1);
        if (rc.data?.length) {
            go('breeding');
            setOpenTag(o => ({ run: rc.data[0].run_id, n: (o?.n ?? 0) + 1 }));
            return true;
        }
        return false;
    });
    const title = _jsxs("h2", { children: [tab === 'dashboard' ? '' : t(nurseryLabel(tab)), " ", _jsx("span", { className: "dev", children: t('new') })] });
    if (!api || !sb)
        return _jsxs("div", { className: "list", children: [_jsx("h2", { children: t('Nursery') }), _jsx("p", { className: "muted", children: t('The Nursery needs the database (not available in the demo).') })] });
    if (err)
        return _jsxs("div", { className: "list", children: [_jsx("h2", { children: t('Nursery') }), _jsxs("div", { className: "warnbox", children: [t('Couldn\'t load the nursery. If this is the first time, run 028_licenses_nursery.sql in Supabase.'), " (", err, ")"] })] });
    if (!d || !c)
        return _jsxs("div", { className: "list", children: [_jsx("h2", { children: t('Nursery') }), _jsx("p", { className: "muted", children: t('Loading…') })] });
    const search = ['orders', 'batches', 'mothers'].includes(tab);
    const areas = [...new Set(['Webb', 'GH', ...d.rooms.filter(r => r.active).map(r => r.name), ...d.rooms.map(r => r.place)])];
    return (_jsxs("div", { className: "cult nursery", children: [tab !== 'dashboard' && tab !== 'invoices' && _jsx("div", { className: "chead", children: title }), search && _jsxs("div", { className: "row toolbar", children: [_jsx("input", { className: "search", type: "search", placeholder: t('Search strain, tag, farm, notes'), value: q, onChange: e => setQ(e.target.value) }), _jsx(ScanButton, { onScan: setQ })] }), tab === 'dashboard' && _jsx(NurseryDashboard, { d: d, c: c, go: go, onOrder: setOrder, onBatch: setBatch }), tab === 'orders' && _jsx(OrdersTab, { d: d, c: c, q: q, onOpen: setOrder, onNew: () => setOrder({ nursery_site: d.sites[0]?.code, status: 'confirmed' }) }), tab === 'batches' && _jsx(BatchesTab, { d: d, c: c, q: q, onOpen: setBatch, onNew: () => setBatch({}), onSortDay: () => setSortDay(true) }), tab === 'plan' && _jsx(PlanTab, { d: d, c: c, api: api, flash: flash, onSaved: saved }), tab === 'mothers' && _jsx(MothersTab, { d: d, c: c, q: q, api: api, flash: flash, onSaved: saved, onOpen: setMother, onAdd: v => setMother(v ?? {}) }), tab === 'breeding' && _jsx(BreedingTab, { sb: sb, d: d, c: c, flash: flash, me: me ?? '', openTag: openTag }), tab === 'logs' && _jsx(OpsLogs, { sb: sb, module: "nursery", sites: d.sites.map(s => s.code), areas: areas, strains: [...new Set([...d.mothers.map(m => m.strain), ...d.strains])], flash: flash, wage: d.settings.wage, canEditRecipes: isAdmin, batches: d.batches.filter(b => b.stage !== 'cancelled').slice(0, 300).map(b => ({ id: b.id, strain: b.strain, label: `${fmtD(b.cut_on)} ${b.strain} ${GEN_LABEL[b.gen]} · ${n0(b.cuttings)}` })), extraTabs: [{ k: 'leach', l: t('Leachate'), node: _jsx(Leachate, { sb: sb, d: d, flash: flash }) }, { k: 'lab', l: t('Lab tests'), node: _jsx(LabTests, { d: d, c: c, api: api, flash: flash, onSaved: saved }) }] }), tab === 'invoices' && _jsx(InvoicesView, { backend: backend, customers: customers, flash: flash, isAdmin: isAdmin, sender: sender, scope: "nursery" }), tab === 'review' && _jsx(NurseryReview, { d: d, c: c, onOrder: setOrder, onBatch: setBatch, onMother: setMother, go: go }), tab === 'activity' && _jsx(NurseryActivity, { api: api }), tab === 'settings' && (isAdmin ? _jsx(SetupTab, { d: d, sb: sb, api: api, terms: terms, flash: flash, onSaved: saved }) : _jsx("p", { className: "muted", children: t('Only a Nursery Admin can change Nursery settings.') })), order && _jsx(OrderSheet, { d: d, c: c, o: order, customers: customers, terms: terms, api: api, flash: flash, isAdmin: isAdmin, onClose: () => setOrder(null), onSaved: async (m) => { await saved(m); }, onDoc: (kind, id) => setDoc({ kind, id }) }, order.id ?? 'new'), batch && _jsx(BatchSheet, { d: d, c: c, b: batch, api: api, flash: flash, onClose: () => setBatch(null), onSaved: saved }, batch.id ?? 'new'), sortDay && _jsx(SortDay, { d: d, api: api, flash: flash, onClose: () => setSortDay(false), onSaved: saved }), mother && _jsx(MotherSheet, { d: d, c: c, m: mother, api: api, flash: flash, onClose: () => setMother(null), onSaved: saved }, mother.id ?? 'new'), doc && _jsx(DocSheet, { backend: backend, kind: doc.kind, id: doc.id, flash: flash, onClose: () => setDoc(null), onChanged: load, canEdit: true, canVoid: isAdmin, sender: sender })] }));
}
/** what needs doing this week, what's ready, and the mother stock */
function NurseryDashboard({ d, c, go, onOrder, onBatch }) {
    const now = today(), wk = addDays(now, 6);
    const mothers = d.mothers.filter(m => m.status === 'active' && live(m) > 0);
    const mStrains = new Set(mothers.map(m => strainKey(m.strain)));
    const gN = (g) => sum(mothers.filter(m => m.gen === g).map(live));
    const rooting = d.batches.filter(b => b.stage === 'rooting');
    const ready = d.batches.filter(b => b.stage === 'ready' && c.left(b) > 0);
    const readySoon = rooting.filter(b => b.ready_on && b.ready_on <= wk);
    const due = dueWithin(d, c, 6);
    const late = due.filter(o => o.deliver_on < now);
    const toCut = d.orders.filter(o => c.isOpen(o) && o.status !== 'planned' && o.cut_on && o.cut_on <= wk && (c.short.get(o.id) ?? 0) > 0)
        .sort((a, b) => a.cut_on.localeCompare(b.cut_on));
    const next = d.orders.filter(o => c.isOpen(o)).slice(0, 12);
    const strains = [...c.byStrain.entries()].filter(([, v]) => v.owed || v.ready || v.rooting).sort((a, b) => b[1].owed - a[1].owed).slice(0, 10);
    const name = (k) => d.batches.find(b => strainKey(b.strain) === k)?.strain ?? d.orders.find(o => strainKey(o.strain) === k)?.strain ?? d.mothers.find(m => strainKey(m.strain) === k)?.strain ?? k;
    const mBy = new Map();
    for (const m of mothers)
        mBy.set(m.strain, (mBy.get(m.strain) ?? 0) + live(m));
    return (_jsxs("div", { className: "dash", children: [_jsx(DashHead, { title: t('Dashboard'), sub: `${t('Nursery')} · ${d.sites.map(s => s.name).join(', ')} · ${new Date().toLocaleDateString(lang() === 'es' ? 'es-MX' : undefined, { weekday: 'long', month: 'long', day: 'numeric' })}` }), _jsxs(Tiles, { children: [_jsx(Tile, { label: t('Deliveries this week'), value: n0(sum(due.map(o => c.owed(o)))), sub: due.length ? `${t('plants')} · ${tn(due.length, '{n} order', '{n} orders')}${late.length ? `, ${t('{n} late', { n: late.length })}` : ''}` : t('nothing due'), tone: late.length ? 'warn' : due.length ? 'info' : 'ok', onClick: () => go('orders') }), _jsx(Tile, { label: t('Ready to go'), value: n0(sum(ready.map(c.left))), sub: ready.length ? `${t('plants in')} ${tn(ready.length, '{n} batch', '{n} batches')}` : t('no batches ready'), tone: ready.length ? 'ok' : undefined, onClick: () => go('batches') }), _jsx(Tile, { label: t('Rooting'), value: n0(sum(rooting.map(c.left))), sub: rooting.length ? `${tn(rooting.length, '{n} batch', '{n} batches')}${readySoon.length ? ` · ${t('{n} ready by {date}', { n: readySoon.length, date: fmtD(wk, true) })}` : ''}` : t('nothing rooting'), onClick: () => go('batches') }), _jsx(Tile, { label: t('To cut this week'), value: toCut.length, sub: toCut.length ? t('first by {date}', { date: fmtD(toCut[0].cut_on, true) }) : t('all orders covered'), tone: toCut.some(o => o.cut_on < now) ? 'warn' : toCut.length ? 'warn' : 'ok', onClick: () => go('orders') }), _jsx(Tile, { label: t('Mother plants'), value: n0(sum(mothers.map(live))), sub: `${[1, 2, 3].filter(gN).map(g => `${GEN_LABEL[g]} ${n0(gN(g))}`).join(' · ') || t('none yet')} · ${t('{n} strains', { n: mStrains.size })}`, onClick: () => go('mothers') })] }), _jsxs(Cards, { children: [_jsx(Card, { title: t('Next deliveries'), action: t('Orders'), onAction: () => go('orders'), wide: true, children: next.length ? _jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('Deliver') }), _jsx("th", { children: t('Strain') }), _jsx("th", { children: t('To') }), _jsx("th", { className: "num", children: t('Owed') }), _jsx("th", { className: "num", children: t('Ready now') }), _jsx("th", { children: t('Status') })] }) }), _jsx("tbody", { children: next.map(o => {
                                            const s = c.byStrain.get(strainKey(o.strain));
                                            return (_jsxs("tr", { className: "tap", onClick: () => onOrder(o), children: [_jsx("td", { className: "nowrap", children: fmtD(o.deliver_on, true) || '—' }), _jsx("td", { children: o.strain }), _jsx("td", { children: c.to(o) }), _jsx("td", { className: "num", children: n0(c.owed(o)) }), _jsx("td", { className: "num", children: s?.ready ? n0(s.ready) : _jsx("span", { className: "muted", children: "0" }) }), _jsx("td", { children: statusPill(o, c) })] }, o.id));
                                        }) })] }) }) : _jsx(Empty, { children: t('No open orders. Cultivation\'s nursery deliveries show up here when it plans them.') }) }), _jsx(Card, { title: t('Cuttings to take'), badge: toCut.length, action: t('Batches'), onAction: () => go('batches'), children: toCut.length ? _jsx("div", { className: "dlist", children: toCut.slice(0, 8).map(o => (_jsxs("button", { className: "drow click", onClick: () => onBatch({ strain: o.strain, order_id: o.id, cuttings: c.short.get(o.id) }), children: [_jsxs("span", { children: [_jsx("b", { children: o.strain }), _jsxs("span", { className: "muted", children: [" \u00B7 ", t('{n} more for {to}', { n: n0(c.short.get(o.id)), to: c.to(o) })] })] }), _jsx("span", { className: `pill ${o.cut_on < now ? 'badp' : 'warnp'}`, children: t('cut by {date}', { date: fmtD(o.cut_on, true) }) })] }, o.id))) }) : _jsx(Empty, { children: t('No cuttings due in the next week.') }) }), _jsx(Card, { title: t('Ready vs owed, by strain'), children: strains.length ? _jsx("div", { className: "dlist", children: strains.map(([k, v]) => (_jsx(Meter, { label: _jsxs(_Fragment, { children: [_jsx("b", { children: name(k) }), " ", _jsxs("span", { className: "muted", children: [n0(v.rooting), " ", t('rooting')] })] }), right: _jsxs(_Fragment, { children: [n0(v.ready), " ", t('ready'), " / ", n0(v.owed), " ", t('owed')] }), value: v.ready, max: Math.max(v.owed, v.ready, 1), tone: v.ready >= v.owed ? 'ok' : v.ready + v.rooting >= v.owed ? 'warn' : 'bad' }, k))) }) : _jsx(Empty, { children: t('Nothing owed or rooting.') }) }), _jsx(Card, { title: t('Mothers'), action: t('Mothers'), onAction: () => go('mothers'), children: mBy.size ? _jsxs("div", { className: "dlist", children: [[...mBy.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([s, n]) => _jsxs("div", { className: "drow", children: [_jsx("span", { children: s }), _jsx("b", { children: n })] }, s)), mBy.size > 10 && _jsx("div", { className: "muted small-note", children: t('+{n} more strains', { n: mBy.size - 10 }) })] }) : _jsx(Empty, { children: t('No mother plants entered yet.') }) })] })] }));
}
/** Nursery > Review: things that need someone */
function NurseryReview({ d, c, onOrder, onBatch, onMother, go }) {
    const now = today();
    const late = d.orders.filter(o => c.isOpen(o) && o.deliver_on && o.deliver_on < now);
    const unconfirmed = d.orders.filter(o => (o.status === 'planned' || o.status === 'ordered') && c.isOpen(o) && o.deliver_on && o.deliver_on <= addDays(now, 21));
    const shortStrains = dueWithin(d, c, 14).filter(o => o.status !== 'planned' && (c.short.get(o.id) ?? 0) > 0);
    const stuck = d.batches.filter(b => b.stage === 'rooting' && b.ready_on && b.ready_on < now);
    const stale = d.batches.filter(b => b.stage === 'ready' && c.left(b) > 0 && b.ready_on && b.ready_on < addDays(now, -d.settings.readyWarn));
    const noTags = d.batches.filter(b => (b.stage === 'rooting' || b.stage === 'ready') && !b.tags.length);
    const motherNoTag = d.mothers.filter(m => m.status === 'active' && live(m) > 0 && !m.plant_tag);
    const noManifest = [...new Map(d.deliveries.filter(x => !x.manifest).map(x => [x.ref, x])).values()];
    const yr = now.slice(0, 4), plan = [...planSeason(d, c, Number(yr)), ...planSeason(d, c, Number(yr) + 1)];
    const behind = plan.flatMap(r => [['G3', r.g3], ['G2', r.g2], ['G1', r.g1]].filter(([, g]) => g.cutBy && g.cutBy <= addDays(now, 14) && g.need > g.have + g.rooting)
        .map(([n, g]) => ({ r, n, g })));
    const positives = d.tests.filter(t => t.result === 'positive' && !t.culled);
    const total = behind.length + positives.length + late.length + unconfirmed.length + shortStrains.length + stuck.length + stale.length + noTags.length + motherNoTag.length + noManifest.length;
    const oRow = (o, tag, bad = true) => _jsxs("button", { className: "drow click", onClick: () => onOrder(o), children: [_jsxs("span", { children: [_jsx("b", { children: o.strain }), _jsxs("span", { className: "muted", children: [" \u00B7 ", t('{n} for {to}', { n: n0(c.owed(o)), to: c.to(o) })] })] }), _jsx("span", { className: `pill ${bad ? 'badp' : 'warnp'}`, children: tag })] }, o.id);
    const bRow = (b, tag) => _jsxs("button", { className: "drow click", onClick: () => onBatch(b), children: [_jsxs("span", { children: [_jsx("b", { children: b.strain }), _jsxs("span", { className: "muted", children: [" \u00B7 ", b.name ?? `#${b.id}`, " \u00B7 ", t('{n} plants', { n: n0(c.left(b)) }), " \u00B7 ", t(STAGE_LABEL[b.stage])] })] }), _jsx("span", { className: "pill warnp", children: tag })] }, b.id);
    const sec = (title, n, note, body, action) => n > 0 && (_jsxs("section", { className: "dcard", children: [_jsxs("div", { className: "dcard-h", children: [_jsxs("h3", { children: [t(title), " ", _jsx("span", { className: "side-badge", children: n })] }), action && _jsxs("button", { className: "linkbtn", onClick: () => go(action[1]), children: [t(action[0]), " \u203A"] })] }), _jsx("p", { className: "muted", children: t(note, { n: d.settings.readyWarn }) }), _jsx("div", { className: "dlist", children: body })] }));
    return (_jsxs("div", { className: "dash", children: [total === 0 && _jsx("p", { className: "muted", children: t('Nothing needs attention in the nursery.') }), sec('Moms to cut soon', behind.length, 'From the Plan: a generation is short and its cut-by date is within two weeks (or passed).', behind.map(({ r, n, g }) => (_jsxs("button", { className: "drow click", onClick: () => go('plan'), children: [_jsxs("span", { children: [_jsx("b", { children: r.strain }), _jsxs("span", { className: "muted", children: [" \u00B7 ", t('{gen} need {need}, have {have} · cut {cut}', { gen: n, need: n0(g.need), have: n0(g.have + g.rooting), cut: n0(g.cut) })] })] }), _jsx("span", { className: `pill ${g.cutBy < now ? 'badp' : 'warnp'}`, children: t('cut by {date}', { date: fmtD(g.cutBy, true) }) })] }, r.strain + n))), ['Plan', 'plan']), sec('Positive lab tests', positives.length, 'Positive and nothing culled yet.', positives.map(x => _jsxs("button", { className: "drow click", onClick: () => go('logs'), children: [_jsxs("span", { children: [_jsx("b", { children: x.strain }), _jsxs("span", { className: "muted", children: [" \u00B7 ", x.test, " ", t('round'), " ", x.round, " \u00B7 ", fmtD(x.tested_on)] })] }), _jsx("span", { className: "pill badp", children: t('positive') })] }, x.id)), ['Logs', 'logs']), sec('Late deliveries', late.length, 'The delivery date has passed and plants are still owed.', late.map(o => oRow(o, fmtD(o.deliver_on, true)))), sec('Short for upcoming deliveries', shortStrains.length, 'Ready plus rooting isn\'t enough for what\'s owed in the next two weeks. Take more cuttings.', shortStrains.map(o => oRow(o, `${t('{n} short', { n: n0(c.short.get(o.id)) })} · ${fmtD(o.deliver_on, true)}`))), sec('Not confirmed yet', unconfirmed.length, 'Cultivation planned these but they aren\'t confirmed. Confirm them to give them an SO number.', unconfirmed.map(o => oRow(o, fmtD(o.deliver_on, true), false))), sec('Past their ready date', stuck.length, 'Still rooting after the ready-by date. Mark them ready, or record losses.', stuck.map(b => bRow(b, t('ready by {date}', { date: fmtD(b.ready_on, true) })))), sec('Ready for a while', stale.length, 'Ready more than {n} days and not delivered.', stale.map(b => bRow(b, `${t('ready')} ${fmtD(b.ready_on, true)}`))), sec('Batches with no METRC tag', noTags.length, 'Every immature plant batch needs a tag (one per 100 plants).', noTags.map(b => bRow(b, t('no tag')))), sec('Mother lots with no METRC tag', motherNoTag.length, 'Each mother lot needs its plant tag.', motherNoTag.slice(0, 30).map(m => _jsxs("button", { className: "drow click", onClick: () => onMother(m), children: [_jsxs("span", { children: [_jsx("b", { children: m.strain }), _jsxs("span", { className: "muted", children: [" \u00B7 ", GEN_LABEL[m.gen], " \u00B7 ", t('{n} plants', { n: n0(live(m)) }), " \u00B7 ", t('planted'), " ", fmtD(m.started_on)] })] }), _jsx("span", { className: "pill warnp", children: t('no tag') })] }, m.id)), ['Mothers', 'mothers']), sec('Deliveries with no manifest', noManifest.length, 'Plants left the nursery without a METRC manifest number on record.', noManifest.slice(0, 30).map(x => {
                const o = d.orders.find(v => v.id === x.order_id);
                return o ? oRow(o, fmtD(x.delivered_on, true), false) : null;
            }))] }));
}
const ACT = {
    nursery_order_new: 'New clone order', nursery_order_edit: 'Order changed', nursery_order_confirmed: 'Order confirmed', nursery_order_cancelled: 'Order cancelled', nursery_order_ordered: 'Order marked ordered',
    nursery_order_received: 'Order marked delivered', nursery_delivered: 'Delivered', nursery_delivery_undone: 'Delivery taken back',
    nursery_batches_insert: 'Cuttings taken', nursery_batches_update: 'Batch changed', nursery_batches_delete: 'Batch deleted',
    nursery_mothers_insert: 'Mother added', nursery_mothers_update: 'Mother changed', nursery_mothers_delete: 'Mother removed',
    nursery_setting: 'Setting changed', nursery_invoice_paid: 'Invoice paid', nursery_invoice_open: 'Invoice marked not paid', nursery_invoice_void: 'Invoice voided', nursery_invoice_sent: 'Invoice emailed',
};
function NurseryActivity({ api }) {
    const [rows, setRows] = useState(null);
    useEffect(() => { api.activity().then(setRows).catch(() => setRows([])); }, [api]);
    if (!rows)
        return _jsx("p", { className: "muted", children: t('Loading…') });
    if (!rows.length)
        return _jsx("p", { className: "muted", children: t('Nothing yet. Everything done in the Nursery shows up here.') });
    const what = (r) => {
        const x = r.details ?? {}, row = (x.row ?? {});
        const bits = [ACT[r.type] ? t(ACT[r.type]) : r.type.replace(/_/g, ' '), r.note];
        if (r.type === 'nursery_delivered')
            bits.push(`${t('{n} plants', { n: String(x.plants) })} → ${x.site ?? x.customer ?? ''}${x.invoice ? ` · ${x.invoice}` : ''}`);
        if (r.type === 'nursery_batches_insert')
            bits.push(t('{n} cuttings', { n: String(row.cuttings) }));
        if (r.type === 'nursery_order_new')
            bits.push(`${t('{n} plants', { n: String(x.plants) })}${x.so ? ` · ${x.so}` : ''}`);
        if (r.type === 'nursery_mothers_insert' && row.plant_tag)
            bits.push(tagTxt(String(row.plant_tag), 8));
        if (r.type.startsWith('nursery_invoice'))
            bits.push(String(x.inv ?? ''));
        return bits.filter(Boolean).join(' · ');
    };
    return _jsx("div", { className: "list", children: rows.map(r => _jsxs("div", { className: "li static", children: [_jsx("div", { children: what(r) }), _jsxs("div", { className: "muted", children: [new Date(r.at).toLocaleString(lang() === 'es' ? 'es-MX' : [], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }), " \u00B7 ", (r.user_email ?? '').split('@')[0]] })] }, r.id)) });
}
