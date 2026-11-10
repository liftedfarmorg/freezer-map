import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Select } from '../combo';
import { useMemo, useState } from 'react';
import { STATUS_LABEL, fmtD, n0, strainKey, sum, today } from './calc';
import { DateIn, F, NumIn, Pick, SaveBar, Sheet, StrainList, TextIn } from '../cult/ui';
import { t } from '../i18n';
const money = (x) => x.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
export const statusPill = (o, c) => {
    const late = c.isOpen(o) && o.deliver_on && o.deliver_on < today();
    return _jsx("span", { className: `pill ${late ? 'badp' : o.status === 'received' ? 'okp' : o.status === 'planned' ? '' : o.status === 'cancelled' ? '' : 'warnp'}`, children: late ? t('Late') : t(STATUS_LABEL[o.status]) });
};
/** Nursery > Orders: what the farms (and outside farms) want, and when */
export function OrdersTab({ d, c, q, onOpen, onNew }) {
    const [f, setF] = useState('open');
    const ql = q.trim().toLowerCase();
    const rows = d.orders.filter(o => (f === 'all' || (f === 'open' ? c.isOpen(o) : !c.isOpen(o))) &&
        (!ql || `${o.strain} ${c.to(o)} ${o.so_number ?? ''} ${o.notes ?? ''}`.toLowerCase().includes(ql)));
    if (f !== 'open')
        rows.sort((a, b) => (b.deliver_on ?? '').localeCompare(a.deliver_on ?? ''));
    const open = d.orders.filter(c.isOpen);
    return _jsxs(_Fragment, { children: [_jsxs("div", { className: "row toolbar between", children: [_jsx("div", { className: "seg", children: [['open', `${t('Open')} (${open.length})`], ['done', t('Delivered / cancelled')], ['all', t('All')]].map(([k, l]) => _jsx("button", { className: f === k ? 'on' : '', onClick: () => setF(k), children: l }, k)) }), _jsx("button", { className: "primary", onClick: onNew, children: t('+ New order') })] }), f === 'open' && _jsx("p", { className: "muted small-note", children: t('Cultivation\'s nursery deliveries for {sites} show up here by themselves. Add orders for outside farms with New order.', { sites: d.sites.map(s => s.code).join(', ') }) }), !rows.length ? _jsx("p", { className: "muted", children: t('No orders here.') }) : _jsx("div", { className: "cwrap", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('Deliver') }), _jsx("th", { children: t('Strain') }), _jsx("th", { children: t('To') }), _jsx("th", { className: "num", children: t('Plants') }), _jsx("th", { className: "num", children: t('Delivered') }), _jsx("th", { className: "num hide-s", children: t('Cut') }), _jsx("th", { className: "hide-s", children: t('SO') }), _jsx("th", { children: t('Status') })] }) }), _jsx("tbody", { children: rows.map(o => (_jsxs("tr", { className: `tap ${o.status === 'cancelled' ? 'cancelled' : ''}`, onClick: () => onOpen(o), children: [_jsx("td", { className: "nowrap", children: fmtD(o.deliver_on, true) || _jsx("span", { className: "muted", children: t('no date') }) }), _jsx("td", { children: o.strain }), _jsx("td", { children: c.to(o) }), _jsx("td", { className: "num", children: n0(o.plants) }), _jsx("td", { className: "num", children: n0(c.delivered.get(o.id) ?? 0) || '' }), _jsx("td", { className: "num hide-s", children: c.cutFor.get(o.id) ? n0(c.cutFor.get(o.id)) : o.cut_on ? _jsx("span", { className: "muted", children: fmtD(o.cut_on) }) : '' }), _jsx("td", { className: "hide-s nowrap", children: o.so_number ?? '' }), _jsx("td", { children: statusPill(o, c) })] }, o.id))) })] }) })] });
}
/** one order: details, confirm, deliver, documents */
export function OrderSheet({ d, c, o: o0, customers, terms, api, flash, isAdmin, onClose, onSaved, onDoc }) {
    const isNew = !o0.id;
    const [edit, setEdit] = useState(isNew);
    const [x, setX] = useState(o0);
    const [busy, setBusy] = useState(false);
    const [deliver, setDeliver] = useState(false);
    const set = (v) => setX(s => ({ ...s, ...v }));
    const run = async (f, ok, close = true) => {
        setBusy(true);
        try {
            await f();
            if (close)
                onClose();
            await onSaved(ok);
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
        finally {
            setBusy(false);
        }
    };
    const outside = customers.filter(k => k.kind !== 'internal');
    const farms = [...new Set(['OHR', 'GVR'])];
    const where = x.site ? `site:${x.site}` : x.customer_id ? `c:${x.customer_id}` : '';
    const dels = d.deliveries.filter(v => v.order_id === o0.id);
    const refs = [...new Set(dels.map(v => v.ref))];
    const price = x.price_each ?? d.settings.price;
    if (deliver && o0.id)
        return _jsx(DeliverSheet, { d: d, c: c, o: o0, api: api, flash: flash, onClose: () => setDeliver(false), onDone: async (m, inv) => { onClose(); await onSaved(m); if (inv)
                onDoc('invoice', inv); } });
    return (_jsxs(Sheet, { title: isNew ? t('New clone order') : `${o0.strain} · ${t('{n} plants', { n: n0(o0.plants) })}`, sub: isNew ? t('For an outside farm, or one of ours') : `${c.to(o0)} · ${o0.so_number ?? t('no SO yet')} · ${t(STATUS_LABEL[o0.status ?? 'planned'])}`, onClose: onClose, children: [!edit && o0.id && _jsxs(_Fragment, { children: [_jsxs("div", { className: "calcbox", children: [_jsx("span", { children: t('To') }), _jsx("b", { children: c.to(o0) }), _jsx("span", { children: t('Deliver') }), _jsx("b", { children: fmtD(o0.deliver_on, true) || '—' }), _jsx("span", { children: t('Cut by') }), _jsx("b", { children: fmtD(o0.cut_on, true) || '—' }), _jsx("span", { children: t('Plants') }), _jsxs("b", { children: [n0(o0.plants), " (", t('{n} delivered', { n: n0(c.delivered.get(o0.id) ?? 0) }), ")"] }), _jsx("span", { children: t('Cuttings taken for it') }), _jsx("b", { children: n0(c.cutFor.get(o0.id) ?? 0) }), _jsx("span", { children: t('Price') }), _jsxs("b", { children: [money(price), " ", t('each'), " \u00B7 ", money(price * (o0.plants ?? 0))] }), _jsx("span", { children: t('Terms') }), _jsx("b", { children: terms.find(t => t.code === (o0.payment_terms ?? d.settings.terms))?.label ?? o0.payment_terms ?? d.settings.terms }), o0.po_number && _jsxs(_Fragment, { children: [_jsx("span", { children: t('PO') }), _jsx("b", { children: o0.po_number })] }), o0.plan_id && _jsxs(_Fragment, { children: [_jsx("span", { children: t('From') }), _jsx("b", { children: t('Cultivation plan') })] })] }), o0.notes && _jsx("p", { className: "muted", children: o0.notes }), o0.status === 'planned' && _jsx("p", { className: "muted", children: t('Cultivation has this planned but hasn\'t ordered it yet. Confirm it to give it an SO number and start cutting.') }), _jsxs("div", { className: "row wrap docact", children: [c.isOpen(o0) && _jsx("button", { className: "primary", disabled: busy, onClick: () => setDeliver(true), children: t('Deliver…') }), (o0.status === 'planned' || o0.status === 'ordered') && _jsx("button", { className: "ghost", disabled: busy, onClick: () => run(() => api.setStatus(o0.id, 'confirmed'), t('Confirmed'), false), children: t('Confirm') }), o0.so_number && _jsx("button", { className: "ghost", onClick: () => onDoc('nso', o0.id), children: t('Sales order') }), _jsx("button", { className: "ghost", onClick: () => setEdit(true), children: t('Edit') }), c.isOpen(o0) && !dels.length && _jsx("button", { className: "ghost danger", disabled: busy, onClick: () => { if (confirm(t('Cancel this order?')))
                                    run(() => api.setStatus(o0.id, 'cancelled'), t('Cancelled')); }, children: t('Cancel order') }), o0.status === 'cancelled' && _jsx("button", { className: "ghost", disabled: busy, onClick: () => run(() => api.setStatus(o0.id, 'confirmed'), t('Back on')), children: t('Put back on') })] }), refs.length > 0 && _jsxs(_Fragment, { children: [_jsx("h3", { children: t('Deliveries') }), _jsx("div", { className: "dlist", children: refs.map(r => {
                                    const vs = dels.filter(v => v.ref === r), v = vs[0];
                                    return _jsxs("div", { className: "drow", children: [_jsxs("span", { className: "grow", children: [_jsx("b", { children: fmtD(v.delivered_on, true) }), " ", _jsxs("span", { className: "muted", children: ["\u00B7 ", t('{n} plants', { n: n0(sum(vs.map(z => z.plants))) }), vs.some(z => z.batch_id) ? ` · ${vs.map(z => d.batches.find(b => b.id === z.batch_id)?.name ?? (z.batch_id ? `${t('batch')} ${z.batch_id}` : t('no batch'))).join(', ')}` : '', v.manifest ? ` · ${t('manifest')} ${v.manifest}` : ` · ${t('no manifest')}`] })] }), v.invoice_id && _jsx("button", { className: "ghost small", onClick: () => onDoc('invoice', v.invoice_id), children: t('Invoice') }), isAdmin && _jsx("button", { className: "ghost small", disabled: busy, title: t('Entered by mistake'), onClick: () => { if (confirm(t('Take back this delivery? Its invoice is voided and the plants come off Cultivation\'s received list.')))
                                                    run(() => api.undoDelivery(r), t('Delivery taken back'), false); }, children: t('Undo') })] }, r);
                                }) })] })] }), edit && _jsxs(_Fragment, { children: [_jsx(F, { label: t('Strain'), children: _jsx(TextIn, { value: x.strain, list: "n-strains", onChange: v => set({ strain: v ?? '' }), autoFocus: isNew }) }), _jsx(StrainList, { id: "n-strains", names: d.strains }), _jsxs("div", { className: "grid2", children: [_jsx(F, { label: t('To'), children: _jsxs(Select, { value: where, onChange: e => { const v = e.target.value; set(v.startsWith('site:') ? { site: v.slice(5), customer_id: null } : { site: null, customer_id: v ? Number(v.slice(2)) : null }); }, children: [_jsx("option", { value: "", children: t('Pick…') }), _jsx("optgroup", { label: t('Our farms'), children: farms.map(s => _jsx("option", { value: `site:${s}`, children: s }, s)) }), _jsx("optgroup", { label: t('Outside farms and partners'), children: outside.map(k => _jsx("option", { value: `c:${k.id}`, children: k.name }, k.id)) })] }) }), _jsx(F, { label: t('Plants'), children: _jsx(NumIn, { value: x.plants, onChange: v => set({ plants: v ?? 0 }) }) }), _jsx(F, { label: t('Cut by'), children: _jsx(DateIn, { value: x.cut_on, onChange: v => set({ cut_on: v }) }) }), _jsx(F, { label: t('Deliver on'), children: _jsx(DateIn, { value: x.deliver_on, onChange: v => set({ deliver_on: v }) }) }), _jsx(F, { label: t('Price each'), hint: `${t('blank')} = ${money(d.settings.price)}`, children: _jsx(NumIn, { value: x.price_each, onChange: v => set({ price_each: v }) }) }), _jsx(F, { label: t('Payment terms'), children: _jsx(Pick, { value: x.payment_terms, blank: `${t('Default')} (${terms.find(x => x.code === d.settings.terms)?.label ?? d.settings.terms})`, options: terms.filter(t => t.active || t.code === x.payment_terms).map(t => ({ v: t.code, l: t.label })), onChange: v => set({ payment_terms: v }) }) }), _jsx(F, { label: t('Customer PO'), children: _jsx(TextIn, { value: x.po_number, onChange: v => set({ po_number: v }) }) }), d.sites.length > 1 && _jsx(F, { label: t('Nursery'), children: _jsx(Pick, { value: x.nursery_site, options: d.sites.map(s => ({ v: s.code, l: s.name })), onChange: v => set({ nursery_site: v ?? undefined }) }) })] }), _jsx(F, { label: t('Notes'), children: _jsx(TextIn, { value: x.notes, onChange: v => set({ notes: v }) }) }), !isNew && o0.plan_id && _jsx("p", { className: "muted small-note", children: t('This came from Cultivation\'s plan. Changes here show up there too.') }), _jsx(SaveBar, { busy: busy, disabled: !x.strain?.trim() || !(Number(x.plants) > 0) || (!x.site && !x.customer_id), saveLabel: isNew ? t('Add order') : t('Save'), onCancel: () => (isNew ? onClose() : (setX(o0), setEdit(false))), onSave: () => run(() => api.saveOrder({ id: x.id, nursery_site: x.nursery_site ?? d.sites[0]?.code, site: x.site ?? null, customer_id: x.customer_id ?? null, strain: x.strain.trim(), plants: Number(x.plants),
                            cut_on: x.cut_on ?? null, deliver_on: x.deliver_on ?? null, price_each: x.price_each ?? null, po_number: x.po_number ?? null, payment_terms: x.payment_terms ?? null, notes: x.notes ?? null }), isNew ? t('Order added (confirmed, SO number given)') : t('Saved')) })] })] }));
}
/** deliver plants on an order: from which batches, the manifest; makes the invoice */
function DeliverSheet({ d, c, o, api, flash, onClose, onDone }) {
    const owed = c.owed(o);
    const batches = useMemo(() => d.batches.filter(b => strainKey(b.strain) === strainKey(o.strain) && (b.stage === 'ready' || b.stage === 'rooting') && c.left(b) > 0)
        .sort((a, b) => (a.order_id === o.id ? 0 : 1) - (b.order_id === o.id ? 0 : 1) || (a.stage === 'ready' ? 0 : 1) - (b.stage === 'ready' ? 0 : 1) || a.cut_on.localeCompare(b.cut_on)), [d, c, o]);
    const [qty, setQty] = useState(() => {
        const q = {};
        let need = Math.max(owed, Math.ceil(o.plants * (1 + d.settings.deliverPct / 100)) - (c.delivered.get(o.id) ?? 0));
        for (const b of batches) {
            if (b.stage !== 'ready' && b.order_id !== o.id)
                continue;
            const n = Math.min(need, c.left(b));
            if (n > 0) {
                q[b.id] = n;
                need -= n;
            }
        }
        return q;
    });
    const [loose, setLoose] = useState(null);
    const [date, setDate] = useState(today());
    const [manifest, setManifest] = useState('');
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const total = sum(Object.values(qty)) + (loose ?? 0);
    const over = batches.find(b => (qty[b.id] ?? 0) > c.left(b));
    async function save() {
        setBusy(true);
        try {
            const lines = [...batches.filter(b => (qty[b.id] ?? 0) > 0).map(b => ({ batch: b.id, plants: qty[b.id] })), ...(loose ? [{ batch: null, plants: loose }] : [])];
            const r = await api.deliver(o.id, lines, date, manifest.trim() || null, notes.trim() || null);
            // the METRC transfer from 1PN, right away (nothing ships if METRC refuses it)
            let extra = '';
            if (!manifest.trim()) {
                const sh = await api.ship(r.ref).catch(e => ({ sent: false, undone: false, error: String(e.message ?? e) }));
                if (sh.undone)
                    throw new Error(`METRC didn't take the transfer, so nothing shipped: ${sh.error}`);
                extra = sh.sent ? (sh.live ? ' · METRC transfer made' : ' · METRC dry run OK') : sh.info ? ` · ${sh.info}` : sh.error ? ` · METRC transfer not made yet (${sh.error}); it's on the to-do list` : '';
            }
            await onDone(`${t('{n} plants delivered', { n: n0(r.plants) })}${r.invoice ? ` · ${r.invoice}` : ''}${extra}${o.site ? `. ${o.site} counts them in Cultivation › Receiving.` : ''}`, r.invoice_id);
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs(Sheet, { title: t('Deliver {strain}', { strain: o.strain }), sub: `${c.to(o)} · ${t('{n} plants still owed', { n: n0(owed) })}${o.so_number ? ` · ${o.so_number}` : ''}`, onClose: onClose, children: [_jsxs("div", { className: "grid2", children: [_jsx(F, { label: t('Delivered on'), children: _jsx(DateIn, { value: date, onChange: setDate }) }), _jsx(F, { label: t('METRC manifest #'), children: _jsx("input", { value: manifest, onChange: e => setManifest(e.target.value), placeholder: t('Transfer manifest') }) })] }), _jsx("h3", { children: t('From which batches') }), !batches.length && _jsxs("p", { className: "muted", children: ["No ", o.strain, " batches with plants left. Add the batch on the Batches screen, or enter plants not from a batch below."] }), batches.length > 0 && _jsx("div", { className: "cwrap tight", children: _jsxs("table", { className: "ctable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('Batch') }), _jsx("th", { children: t('Cut') }), _jsx("th", { children: t('Stage') }), _jsx("th", { className: "num", children: t('Left') }), _jsx("th", { className: "num", children: t('Sending') })] }) }), _jsx("tbody", { children: batches.map(b => _jsxs("tr", { children: [_jsxs("td", { children: [b.name ?? `#${b.id}`, b.order_id === o.id && _jsxs("span", { className: "muted", children: [" ", t('· for this order')] })] }), _jsx("td", { className: "nowrap", children: fmtD(b.cut_on) }), _jsx("td", { children: t(b.stage === 'ready' ? 'Ready' : 'Rooting') }), _jsx("td", { className: "num", children: n0(c.left(b)) }), _jsx("td", { className: "num", children: _jsx(NumIn, { value: qty[b.id] ?? null, onChange: v => setQty(s => ({ ...s, [b.id]: v })) }) })] }, b.id)) })] }) }), _jsx(F, { label: t('Plants not from a batch'), hint: t('(only if they weren\'t tracked)'), children: _jsx(NumIn, { value: loose, onChange: setLoose }) }), _jsx(F, { label: t('Notes'), children: _jsx("input", { value: notes, onChange: e => setNotes(e.target.value), placeholder: t('Optional') }) }), _jsxs("p", { className: "muted small-note", children: [t('Sending {n} of {owed} owed', { n: n0(total), owed: n0(owed) }), d.settings.deliverPct ? ` (${t('aim: order + {p}%', { p: d.settings.deliverPct })})` : '', ".", ' ', t('This makes the invoice from {who}', { who: d.licenses.find(l => l.license_no === d.sites.find(s => s.code === o.nursery_site)?.license)?.entity ?? t('the nursery') }), o.site ? t(' and adds the plants to {site}\'s received list in Cultivation.', { site: o.site }) : '.'] }), over && _jsxs("p", { className: "warn-t", children: [over.name ?? `#${over.id}`, " ", t('only has {n} left.', { n: n0(c.left(over)) })] }), _jsx(SaveBar, { busy: busy, disabled: total <= 0 || !!over, saveLabel: t('Deliver {n}', { n: n0(total) }), onCancel: onClose, onSave: save })] }));
}
