import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Select } from './combo';
import { useEffect, useMemo, useState } from 'react';
import { PRODUCT_LABEL, SALE_PRODUCTS } from './types';
import { dfmt, docTitle, downloadPdf, emailHref, makePdf, money, shareUrl, textHref } from './docs';
import { Tile, Tiles } from './dash';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const STATUS = { open: 'Open', paid: 'Paid', void: 'Void' };
const ACCT = { pending: 'Not in QuickBooks yet', sent: 'In QuickBooks', error: 'QuickBooks error', skip: 'Not sent to QuickBooks' };
/** one SO or invoice: preview, download, email, text, link; invoices can be adjusted until they're in accounting */
export function DocSheet({ backend, kind, id, flash, onClose, onChanged, canEdit, canVoid, sender }) {
    const [d, setD] = useState(null);
    const [url, setUrl] = useState(null);
    const [terms, setTerms] = useState([]);
    const [busy, setBusy] = useState(false);
    const [edit, setEdit] = useState(false);
    const load = async () => {
        try {
            const doc = await backend.getDoc(kind, id);
            setD(doc);
            const blob = await makePdf(doc);
            setUrl(u => { if (u)
                URL.revokeObjectURL(u); return URL.createObjectURL(blob); });
        }
        catch (e) {
            flash(String(e.message ?? e), true);
            onClose();
        }
    };
    useEffect(() => { load(); backend.paymentTerms().then(setTerms).catch(() => { }); }, [kind, id]);
    useEffect(() => () => { if (url)
        URL.revokeObjectURL(url); }, [url]);
    const run = async (f, ok) => {
        setBusy(true);
        try {
            await f();
            await load();
            onChanged?.();
            flash(ok);
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
        finally {
            setBusy(false);
        }
    };
    const editable = canEdit && d?.kind === 'invoice' && d.status !== 'void' && d.acct_status !== 'sent';
    async function copy() { if (!d)
        return; try {
        await navigator.clipboard.writeText(shareUrl(d));
        flash('Link copied');
    }
    catch {
        flash(shareUrl(d));
    } }
    return (_jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: "sheet docsheet", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsx("h2", { children: d ? `${docTitle(d)} ${d.number}` : 'Loading…' }), _jsx("button", { className: "ghost", onClick: onClose, children: "\u2715" })] }), d && _jsxs(_Fragment, { children: [_jsxs("div", { className: "row wrap docmeta", children: [_jsx("b", { children: d.customer.name }), _jsxs("span", { className: "muted", children: [money(d.total), " \u00B7 ", d.terms, d.kind === 'invoice' && d.due ? ` · due ${dfmt(d.due)}` : ''] }), d.kind === 'invoice' && _jsx("span", { className: `pill inv-${d.status}`, children: STATUS[d.status] }), d.kind === 'invoice' && d.acct_status && _jsx("span", { className: `pill acct-${d.acct_status}`, children: ACCT[d.acct_status] }), d.kind === 'invoice' && d.sent_at && _jsxs("span", { className: "muted", children: ["emailed ", dfmt(d.sent_at.slice(0, 10))] }), d.kind === 'invoice' && d.manifest && _jsxs("span", { className: "muted", children: ["METRC manifest ", d.manifest] })] }), d.kind === 'invoice' && d.acct_status !== 'sent' && d.status !== 'void' && d.push_after && _jsxs("p", { className: "small-note muted", children: ["Goes to QuickBooks at ", new Date(d.push_after).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), new Date(d.push_after).toDateString() !== new Date().toDateString() ? ` ${dfmt(d.push_after.slice(0, 10))}` : '', ". Editing it restarts the 30 minutes."] }), d.kind === 'invoice' && (d.acct_flags?.length ?? 0) > 0 && _jsx("div", { className: "warnbox small", children: d.acct_flags.map((f, k) => _jsx("div", { children: f }, k)) }), _jsxs("div", { className: "row wrap docact", children: [_jsx("button", { className: "primary", disabled: busy, onClick: () => downloadPdf(d), children: "Download PDF" }), _jsx("a", { className: "btn ghost", href: emailHref(d, sender), onClick: () => { if (d.kind === 'invoice')
                                        backend.markInvoiceSent(d.id, d.customer.billing_email ?? '').then(load).catch(() => { }); }, children: "Email" }), _jsx("a", { className: "btn ghost", href: textHref(d), children: "Text" }), _jsx("button", { className: "ghost", onClick: copy, children: "Copy link" }), editable && _jsx("button", { className: "ghost", onClick: () => setEdit(!edit), children: edit ? 'Done editing' : 'Edit' })] }), !d.customer.billing_email && _jsxs("p", { className: "muted", children: ["No billing email for ", d.customer.name, ". A Sales Admin can add it in Sales \u2192 Settings \u2192 Customers."] }), _jsx("p", { className: "muted small", children: "Email opens your own mail app with the link filled in. Attach the PDF too if the customer prefers it." }), edit && editable && _jsx(InvoiceEditor, { d: d, terms: terms, busy: busy, run: run, backend: backend }), d.kind === 'invoice' && canEdit && d.status !== 'void' && (_jsxs("div", { className: "row wrap docact", children: [d.acct_status === 'sent' ? _jsx("span", { className: "muted small", children: "Payments are recorded in QuickBooks; paid shows here after the hourly check." })
                                    : d.status === 'open' ? _jsx("button", { className: "ghost small", disabled: busy, onClick: () => run(() => backend.setInvoiceStatus(d.id, 'paid'), 'Marked paid'), children: "Mark paid" })
                                        : _jsx("button", { className: "ghost small", disabled: busy, onClick: () => run(() => backend.setInvoiceStatus(d.id, 'open'), 'Marked open'), children: "Mark not paid" }), canVoid && d.nursery && d.acct_status !== 'sent' && _jsx("button", { className: "ghost small", disabled: busy, onClick: () => { const why = prompt(`Void ${d.number}? Say why (optional):`); if (why !== null)
                                        run(() => backend.setInvoiceStatus(d.id, 'void', why), 'Voided'); }, children: "Void" })] })), d.kind === 'invoice' && !d.nursery && _jsx(Adjustments, { d: d, backend: backend, canEdit: canEdit, flash: flash, onDone: async () => { await load(); onChanged?.(); } }), url ? _jsx("iframe", { className: "docframe", title: d.number, src: url }) : _jsx("p", { className: "muted", children: "Making the PDF\u2026" })] })] }) }));
}
function InvoiceEditor({ d, terms, busy, run, backend }) {
    const [date, setDate] = useState(d.date ?? today());
    const [po, setPo] = useState(d.po ?? '');
    const [notes, setNotes] = useState(d.notes ?? '');
    const [charge, setCharge] = useState({ product: 'SHIPPING', desc: '', qty: '1', price: '' });
    // QuickBooks products for charges (046): shipping, discounts, returns, refunds
    const [products, setProducts] = useState([]);
    useEffect(() => { backend.client()?.from('acct_products').select('code,name,grp').eq('active', true).order('sort').then(({ data }) => setProducts((data ?? []).filter(x => ['shipping', 'adjust', 'other'].includes(x.grp)))); }, []);
    const chosen = products.find(x => x.code === charge.product);
    const addCharge = async () => {
        const sb = backend.client();
        if (sb && chosen) {
            const { error } = await sb.rpc('acct_add_line', { p_inv: d.id, p_product: chosen.code, p_description: charge.desc.trim() || chosen.name, p_qty: Number(charge.qty) || 1, p_price: Number(charge.price), p_applies_to: null });
            if (error)
                throw new Error(error.message);
        }
        else
            await backend.setInvoiceLine(d.id, null, charge.desc || 'Customer Shipping', Number(charge.qty) || 1, Number(charge.price));
    };
    return (_jsxs("div", { className: "invedit", children: [_jsxs("div", { className: "grid2", children: [_jsxs("label", { children: [_jsx("span", { children: "Payment terms" }), _jsx(Select, { value: d.terms_code ?? '', disabled: busy, onChange: e => run(() => backend.setInvoiceTerms(d.id, e.target.value), 'Terms changed'), children: terms.filter(t => t.active || t.code === d.terms_code).map(t => _jsx("option", { value: t.code, children: t.label }, t.code)) })] }), _jsxs("label", { children: [_jsx("span", { children: "Invoice date" }), _jsx("input", { type: "date", value: date, onChange: e => setDate(e.target.value) })] }), _jsxs("label", { children: [_jsx("span", { children: "Customer PO" }), _jsx("input", { value: po, onChange: e => setPo(e.target.value) })] }), _jsxs("label", { children: [_jsx("span", { children: "Notes on the invoice" }), _jsx("input", { value: notes, onChange: e => setNotes(e.target.value) })] })] }), (date !== d.date || po !== (d.po ?? '') || notes !== (d.notes ?? '')) && _jsx("button", { className: "primary small", disabled: busy, onClick: () => run(() => backend.setInvoiceInfo(d.id, date, po, notes), 'Saved'), children: "Save" }), _jsxs("table", { className: "restable invlines", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Line" }), _jsx("th", { className: "num", children: "Qty" }), _jsx("th", { className: "num", children: "Price" }), _jsx("th", { className: "num", children: "Amount" }), _jsx("th", {})] }) }), _jsx("tbody", { children: d.lines.map(l => _jsx(LineRow, { l: l, busy: busy, onPrice: p => run(() => backend.setInvoiceLine(d.id, l.id, l.description, null, p), 'Price changed'), onRemove: l.kind === 'charge' ? () => run(() => backend.removeInvoiceLine(d.id, l.id), 'Removed') : undefined }, l.id)) })] }), _jsxs("div", { className: "row wrap invcharge", children: [products.length > 0 && _jsx(Select, { value: charge.product, onChange: e => setCharge({ ...charge, product: e.target.value }), children: products.map(x => _jsx("option", { value: x.code, children: x.name }, x.code)) }), _jsx("input", { value: charge.desc, onChange: e => setCharge({ ...charge, desc: e.target.value }), placeholder: chosen ? `Description (default: ${chosen.name})` : 'Charge (shipping, storage…)' }), _jsx("input", { type: "number", value: charge.qty, onChange: e => setCharge({ ...charge, qty: e.target.value }), placeholder: "Qty" }), _jsx("input", { type: "number", value: charge.price, onChange: e => setCharge({ ...charge, price: e.target.value }), placeholder: chosen?.grp === 'adjust' ? 'Amount off' : 'Price' }), _jsx("button", { className: "ghost small", disabled: busy || (!chosen && !charge.desc.trim()) || charge.price === '', onClick: () => run(addCharge, chosen?.grp === 'adjust' ? 'Discount added' : 'Charge added').then(() => setCharge({ product: charge.product, desc: '', qty: '1', price: '' })), children: "+ Add" })] }), _jsx("p", { className: "muted small", children: "Quantities come from what actually shipped. Change prices here, or add shipping, discounts, returns or refunds (they go on as a minus amount). Contract customers get a $0 \"Free shipping - contract\" line automatically. Locked once the invoice is in QuickBooks." })] }));
}
function LineRow({ l, busy, onPrice, onRemove }) {
    const [p, setP] = useState(String(l.price));
    return (_jsxs("tr", { children: [_jsx("td", { children: l.description }), _jsxs("td", { className: "num", children: [Number(l.qty).toLocaleString(), " ", l.uom] }), _jsx("td", { className: "num", children: _jsx("input", { className: "qty", type: "number", step: "0.01", value: p, onChange: e => setP(e.target.value), onBlur: () => { if (Number(p) !== Number(l.price) && p !== '')
                        onPrice(Number(p)); }, disabled: busy }) }), _jsx("td", { className: "num", children: money(l.amount) }), _jsx("td", { children: onRemove && _jsx("button", { className: "ghost small", disabled: busy, onClick: onRemove, children: "\u2715" }) })] }));
}
/** Sales > Invoices */
export function InvoicesView({ backend, customers, flash, isAdmin, sender, scope = 'sales' }) {
    const [rows, setRows] = useState(null);
    const [err, setErr] = useState(null);
    const [f, setF] = useState('open');
    const [q, setQ] = useState('');
    const [open, setOpen] = useState(null);
    const load = () => backend.listInvoices(scope).then(r => { setRows(r); setErr(null); }).catch(e => setErr(String(e?.message ?? e)));
    useEffect(() => { load(); }, []);
    const cname = useMemo(() => { const m = new Map(customers.map(c => [c.id, c.name])); return (id) => m.get(id) ?? `#${id}`; }, [customers]);
    if (err)
        return _jsxs("div", { className: "list", children: [_jsx("h2", { children: "Invoices" }), _jsx("div", { className: "warnbox", children: err })] });
    if (!rows)
        return _jsx("p", { className: "muted", children: "Loading\u2026" });
    const now = today();
    const overdue = (i) => i.status === 'open' && !!i.due_date && i.due_date < now;
    const ql = q.trim().toLowerCase();
    const shown = rows.filter(i => (f === 'all' || (f === 'overdue' ? overdue(i) : i.status === f)) && (!ql || `${i.inv_number} ${cname(i.customer_id)} ${i.po_number ?? ''}`.toLowerCase().includes(ql)));
    const sum = (xs) => xs.reduce((a, i) => a + Number(i.total), 0);
    const openI = rows.filter(i => i.status === 'open'), od = rows.filter(overdue);
    const notAcct = rows.filter(i => i.status !== 'void' && i.acct_status === 'pending');
    return (_jsxs("div", { className: "list invoices", children: [_jsx("h2", { children: "Invoices" }), _jsxs(Tiles, { children: [_jsx(Tile, { label: "Open", value: money(sum(openI)), sub: `${openI.length} invoices`, onClick: () => setF('open') }), _jsx(Tile, { label: "Overdue", value: money(sum(od)), sub: `${od.length} invoices`, tone: od.length ? 'warn' : 'ok', onClick: () => setF('overdue') }), _jsx(Tile, { label: "Not in QuickBooks yet", value: notAcct.length, sub: "Accounting sends them", tone: notAcct.length ? 'info' : undefined })] }), _jsxs("div", { className: "row toolbar", children: [_jsx("div", { className: "seg", children: ['open', 'overdue', 'paid', 'void', 'all'].map(k => _jsx("button", { className: f === k ? 'on' : '', onClick: () => setF(k), children: k[0].toUpperCase() + k.slice(1) }, k)) }), _jsx("input", { className: "search", type: "search", placeholder: "Invoice #, customer or PO", value: q, onChange: e => setQ(e.target.value) })] }), !shown.length && _jsx("p", { className: "muted", children: scope === 'nursery' ? 'No invoices here. A clone invoice is made each time plants are delivered on an order.' : 'No invoices here. Invoices are made when an order\'s stop is delivered, or from the order with "Make invoice".' }), shown.map(i => (_jsxs("button", { className: "li setrow", onClick: () => setOpen(i.id), children: [_jsxs("div", { className: "grow", children: [_jsxs("div", { children: [_jsx("b", { children: i.inv_number }), " ", _jsx("span", { className: `pill inv-${overdue(i) ? 'overdue' : i.status}`, children: overdue(i) ? 'Overdue' : STATUS[i.status] })] }), _jsxs("div", { className: "muted", children: [cname(i.customer_id), " \u00B7 ", dfmt(i.invoice_date), " \u00B7 ", i.terms_label, i.due_date ? ` · due ${dfmt(i.due_date)}` : '', i.sent_at ? ' · emailed' : ''] })] }), _jsx("b", { className: "num", children: money(i.total) })] }, i.id))), open != null && _jsx(DocSheet, { backend: backend, kind: "invoice", id: open, flash: flash, onClose: () => setOpen(null), onChanged: load, canEdit: true, canVoid: isAdmin, sender: sender })] }));
}
/** Sales > Orders > New order */
/** customer license check (Compliance, 055): warn, don't block (we're mostly wholesale) */
export function licenseWarning(c) {
    if (c.kind !== 'external')
        return null;
    if (!c.license?.trim())
        return `No state license on file for ${c.name}.`;
    const exp = c.license_expires;
    if (exp && exp < new Date().toISOString().slice(0, 10))
        return `${c.name}'s license (${c.license}) expired ${exp}.`;
    return null;
}
const CUR_YEAR = new Date().getFullYear();
const sk = (strain, product) => `${strain.trim().toLowerCase()}|${product}`;
/** lbs on hand per strain + product + crop year (pallets in freezers or waiting for a spot) */
function useStockByYear(backend) {
    const [m, setM] = useState(null);
    useEffect(() => {
        const sb = backend.client();
        if (!sb)
            return;
        let on = true;
        (async () => {
            const out = new Map();
            for (let a = 0;; a += 1000) {
                const { data, error } = await sb.from('pallets').select('strain,product,crop_year,current_weight').in('status', ['in_freezer', 'unslotted'])
                    .eq('kind', 'package').not('strain', 'is', null).order('id').range(a, a + 999);
                if (error || !data)
                    break;
                for (const p of data) {
                    if (p.crop_year == null)
                        continue;
                    const k = sk(p.strain, p.product ?? 'fresh_frozen');
                    const y = out.get(k) ?? new Map();
                    y.set(p.crop_year, (y.get(p.crop_year) ?? 0) + Number(p.current_weight ?? 0));
                    out.set(k, y);
                }
                if (data.length < 1000)
                    break;
            }
            if (on)
                setM(out);
        })().catch(() => { });
        return () => { on = false; };
    }, []);
    return m;
}
export function NewOrderSheet({ backend, customers, strains, flash, onClose, onDone }) {
    // Msg 308: new order redesigned (prototype Msg 305/306): customer with context, a menu table per product where you type lbs
    // (price autofills from the customer's price and can be changed), a running summary with the total, details folded away.
    // Same saves as before: createOrder, then sample lines, then shipping.
    const [cust, setCust] = useState(null);
    const [cq, setCq] = useState('');
    const [po, setPo] = useState('');
    const [wanted, setWanted] = useState('');
    const [notes, setNotes] = useState('');
    const [termsCode, setTermsCode] = useState('');
    const [shipping, setShipping] = useState('');
    const [quoted, setQuoted] = useState(false);
    const [est, setEst] = useState(null);
    const [terms, setTerms] = useState([]);
    const [tab, setTab] = useState('fresh_frozen');
    const [q, setQ] = useState('');
    const [det, setDet] = useState(false);
    const [sumOpen, setSumOpen] = useState(false);
    const [picks, setPicks] = useState({});
    const stock = useStockByYear(backend);
    const [busy, setBusy] = useState(false);
    useEffect(() => { backend.paymentTerms().then(setTerms).catch(() => { }); }, []);
    // market price per crop year (164): what a customer with no contract price pays
    const [market, setMarket] = useState(new Map());
    useEffect(() => {
        backend.client()?.from('market_prices').select('crop_year,price_per_lb').eq('finish', 'FF')
            .then(r => setMarket(new Map((r.data ?? []).map(x => [Number(x.crop_year), Number(x.price_per_lb)]))), () => { });
    }, []);
    const c = customers.find(x => x.id === cust);
    useEffect(() => { setTermsCode(c?.payment_terms ?? ''); }, [cust]);
    // what the load would charge them on a single-stop box truck run (the load works it out for real at Depart)
    useEffect(() => {
        setEst(null);
        const sb = backend.client();
        if (!sb || cust == null)
            return;
        sb.rpc('ship_quote', { p_customers: [cust], p_class: 'box', p_carrier_cost: null }).then(({ data }) => { const r = (data ?? [])[0]; if (r)
            setEst(r); });
    }, [cust]);
    // the customer's balance and last order (for the chips and Repeat last order)
    const [cbal, setCbal] = useState(null);
    const [lastO, setLastO] = useState(null);
    useEffect(() => {
        setCbal(null);
        setLastO(null);
        const sb = backend.client();
        if (!sb || cust == null)
            return;
        Promise.all([sb.from('acct_customer_balances').select('balance').eq('customer_id', cust).eq('env', 'production'), sb.from('invoices').select('total').eq('customer_id', cust).eq('status', 'open')]).then(([qb, inv]) => {
            const b = (qb.data ?? [])[0];
            setCbal(b && b.balance != null ? Number(b.balance) : (inv.data ?? []).reduce((a, x) => a + Number(x.total), 0));
        }).catch(() => { });
        sb.from('orders').select('order_date').eq('customer_id', cust).not('status', 'in', '(draft,cancelled)')
            .order('order_date', { ascending: false }).order('id', { ascending: false }).limit(1)
            .then(({ data }) => {
            const o = (data ?? [])[0];
            setLastO({ date: o?.order_date ?? null });
        }, () => { });
    }, [cust]);
    // Strain pick list (Aziz 11/4, same as the order editor): fresh frozen / standards / smalls = the open menu (+ this customer's
    // reserves on fresh frozen); other products aren't on the menu, so they list what's on hand. One option per strain + crop year.
    const [menu, setMenu] = useState(null);
    const [bal, setBal] = useState([]);
    useEffect(() => { backend.client()?.rpc('staff_menu').then(({ data }) => setMenu((data ?? [])), () => setMenu([])); }, []);
    useEffect(() => { backend.listBalances().then(setBal).catch(() => { }); }, []);
    // fresh frozen to the exact pound for staff (211); standards / smalls stay on staff_menu
    const [ffExact, setFfExact] = useState(null);
    useEffect(() => { backend.client()?.rpc('staff_ff_open').then(({ data, error }) => setFfExact(error ? null : (data ?? [])), () => setFfExact(null)); }, []);
    const MENU_CODE = { fresh_frozen: 'FF', standards: 'ST', smalls: 'SM' };
    const optionsFor = (product) => {
        const m = new Map();
        const at = (strain, year) => { const k = `${strain.toLowerCase()}|${year}`; let x = m.get(k); if (!x) {
            x = { k, strain, year, open: 0, res: 0 };
            m.set(k, x);
        } return x; };
        const code = MENU_CODE[product];
        if (product === 'fresh_frozen' && ffExact)
            for (const r of ffExact) {
                if (Number(r.open_lbs) > 0)
                    at(r.strain, r.crop_year).open += Number(r.open_lbs);
            }
        else if (code)
            for (const r of menu ?? []) {
                if (r.product === code && Number(r.open_lbs) > 0)
                    at(r.strain, r.crop_year).open += Number(r.open_lbs);
            }
        else if (stock)
            for (const [k, ys] of stock) {
                const [name, prod] = [k.slice(0, k.lastIndexOf('|')), k.slice(k.lastIndexOf('|') + 1)];
                if (prod !== product)
                    continue;
                const shown = strains.find(s => s.name.toLowerCase() === name)?.name ?? name;
                for (const [y, v] of ys)
                    if (v > 0)
                        at(shown, y).open += Math.floor(v);
            }
        if (product === 'fresh_frozen' && cust != null)
            for (const b of bal)
                if (b.customer_id === cust && Number(b.remaining) > 0)
                    at(b.strain, b.crop_year ?? CUR_YEAR).res += Number(b.remaining);
        return [...m.values()].sort((a, b) => a.strain.localeCompare(b.strain) || b.year - a.year);
    };
    const pkey = (product, strain, year) => `${product}|${strain.trim().toLowerCase()}|${year}`;
    // Msg 315: the price each row fills in = what create_order would charge this customer (their contract price for the product,
    // else the item card price for that strain, else the market price), from order_line_prices
    const [lp, setLp] = useState(new Map());
    const optKey = cust == null || !menu || !stock ? '' : `${cust}|${tab}|${optionsFor(tab).length}`;
    useEffect(() => {
        const sb = backend.client();
        if (!sb || !optKey)
            return;
        const want = optionsFor(tab).filter(o => !lp.has(pkey(tab, o.strain, o.year))).map(o => ({ product: tab, strain: o.strain, year: o.year }));
        if (!want.length)
            return;
        sb.rpc('order_line_prices', { p_customer: cust, p_lines: want }).then(({ data, error }) => {
            if (error)
                return;
            setLp(m => { const n = new Map(m); for (const r of (data ?? []))
                n.set(pkey(r.product, r.strain, r.crop_year), r.price == null ? null : Number(r.price)); return n; });
        });
    }, [optKey]);
    useEffect(() => { setLp(new Map()); }, [cust]);
    // the price that fills in: fresh frozen = their contract price, else the market price for that crop year; dry products = on the invoice
    const autoPriceOld = (product, year) => product !== 'fresh_frozen' ? null : c?.price_per_lb != null ? Number(c.price_per_lb) : market.get(year) ?? null;
    const autoPrice = (product, year, strain) => { const k = strain ? pkey(product, strain, year) : ''; return k && lp.has(k) ? lp.get(k) : autoPriceOld(product, year); };
    const used = Object.values(picks).filter(p => Number(p.lbs) > 0);
    const availOf = (p) => { const o = optionsFor(p.product).find(x => x.k === `${p.strain.trim().toLowerCase()}|${p.year}`); return o ? o.open + o.res : 0; };
    const overOf = (p) => Number(p.lbs) > 0 && Number(p.lbs) > availOf(p) ? availOf(p) : null;
    const anyOver = used.some(p => overOf(p) != null);
    const priceOf = (p) => p.price !== undefined && p.price !== '' ? Number(p.price) : autoPrice(p.product, p.year, p.strain);
    const lbsT = used.reduce((a, p) => a + Number(p.lbs), 0);
    const dolT = used.reduce((a, p) => a + (priceOf(p) ?? 0) * Number(p.lbs), 0);
    const shipT = shipping !== '' ? Number(shipping) : est?.charge != null && !est.problem ? Number(est.charge) : 0;
    const ok = cust != null && used.length > 0 && !anyOver;
    const setPick = (k, base, ch) => setPicks(ps => ({ ...ps, [k]: Object.assign({ lbs: '' }, base, ps[k], ch) }));
    async function save(confirm = true) {
        setBusy(true);
        try {
            // price goes in only when someone changed it from the autofill; blank = their contract / market price, worked out as before
            const ls = used.map(p => {
                const auto = autoPrice(p.product, p.year, p.strain), typed = p.price !== undefined && p.price !== '' ? Number(p.price) : null;
                return { strain: p.strain.trim(), lbs: Number(p.lbs), price: typed != null && typed !== auto ? typed : null, product: p.product, crop_year: p.year };
            });
            const o = await backend.createOrder(cust, ls, po, wanted || null, notes, termsCode || null, confirm);
            if (used.some(l => l.sample)) {
                try {
                    // lines come back in the order they were sent
                    const { data } = await backend.client().from('order_lines').select('id').eq('order_id', o.id).order('id');
                    const ids = (data ?? []).map(x => x.id);
                    await backend.setOrderSample(o.id, true, used.map((l, i) => ({ line_id: ids[i], sample: !!l.sample && l.product === 'fresh_frozen', hold_lbs: l.sample ? Number(l.hold || 0) || null : null })).filter(x => x.line_id));
                }
                catch (e) {
                    flash(`Order made, but the sample lines weren't saved: ${e.message}`, true);
                }
            }
            if (shipping !== '') {
                const { error } = await backend.client()?.rpc('set_order_shipping', { p_order: o.id, p_amount: Number(shipping), p_quoted: quoted }) ?? { error: null };
                if (error)
                    flash(`Order made, but shipping wasn't saved: ${error.message}`, true);
            }
            flash(confirm ? `${o.so_number} created` : 'Draft saved. It holds nothing until a Sales Admin confirms it.');
            onDone(o.id);
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
        finally {
            setBusy(false);
        }
    }
    const ql = cq.trim().toLowerCase();
    const custOpts = customers.filter(x => x.active && x.kind === 'external' && (!ql || x.name.toLowerCase().includes(ql) || (x.address ?? '').toLowerCase().includes(ql))).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 12);
    const resLeft = cust == null ? 0 : bal.filter(b => b.customer_id === cust).reduce((a, b) => a + Math.max(0, Number(b.remaining)), 0);
    // Msg 313: strains this customer has reserves on come first
    const opts = optionsFor(tab).filter(o => !q.trim() || o.strain.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => (b.res > 0 ? 1 : 0) - (a.res > 0 ? 1 : 0));
    const loading = !menu || !stock;
    const usd = (v) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    const usd2 = (v) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const nIn = (p) => used.filter(x => x.product === p).length;
    const summary = _jsxs(_Fragment, { children: [_jsx("div", { className: "no-sum-lines", children: !used.length ? _jsx("p", { className: "muted small", style: { margin: 14 }, children: "Type lbs next to a strain. Lines show up here." })
                    : used.map(p => {
                        const k = pkey(p.product, p.strain, p.year), pr = priceOf(p);
                        return _jsxs("div", { className: `no-sline ${overOf(p) != null ? 'bad' : ''}`, children: [_jsxs("div", { className: "grow", children: [_jsx("b", { children: p.strain }), " ", p.year !== CUR_YEAR && _jsx("span", { className: "muted small", children: p.year }), _jsxs("div", { className: "muted small", children: [PRODUCT_LABEL[p.product], p.sample ? ' · sample' : '', overOf(p) != null ? ` · only ${n0f(overOf(p))} available` : ''] })] }), _jsxs("span", { className: "nw", children: [n0f(Number(p.lbs)), " lbs"] }), _jsx("span", { className: "nw", children: pr != null ? usd(pr * Number(p.lbs)) : 'on invoice' }), _jsx("button", { className: "linkbtn", "aria-label": `Remove ${p.strain}`, onClick: () => setPicks(ps => { const n = { ...ps }; delete n[k]; return n; }), children: "\u2715" })] }, k);
                    }) }), _jsxs("div", { className: "no-tot", children: [_jsxs("div", { children: [_jsx("span", { className: "muted", children: "Total lbs" }), _jsx("b", { children: n0f(lbsT) })] }), _jsxs("div", { children: [_jsx("span", { className: "muted", children: "Product" }), _jsx("span", { children: usd(dolT) })] }), _jsxs("div", { children: [_jsxs("span", { className: "muted", children: ["Shipping", shipping === '' ? ' (estimate)' : ''] }), _jsx("span", { children: cust == null ? '—' : usd(shipT) })] }), _jsxs("div", { className: "g", children: [_jsx("span", { children: "Total" }), _jsx("span", { children: usd(dolT + (cust == null ? 0 : shipT)) })] }), _jsxs("p", { className: "muted small", children: [c && _jsxs(_Fragment, { children: ["Terms: ", termsCode ? terms.find(t => t.code === termsCode)?.label ?? termsCode : terms.find(t => t.code === c.payment_terms)?.label ?? 'Due on receipt', ". "] }), used.some(p => priceOf(p) == null) && _jsx(_Fragment, { children: "Lines with no $/lb get their price when the invoice is made. " }), "Create order confirms it now (SO number, then Distribution \u2192 Fulfillment). Save as draft holds nothing until a Sales Admin confirms it."] }), _jsx("button", { className: "primary big", disabled: busy || !ok, onClick: () => save(), children: busy ? 'Saving…' : 'Create order' }), _jsx("button", { className: "ghost no-draft", disabled: busy || !ok, onClick: () => save(false), children: "Save as draft" })] })] });
    return (_jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: "sheet form neworder side no2", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsx("h2", { children: "New sales order" }), _jsx("button", { className: "ghost", onClick: onClose, children: "\u2715" })] }), _jsxs("div", { className: "no-body", children: [_jsxs("div", { className: "no-main", children: [_jsx("section", { className: "no-sec", children: !c ? _jsxs(_Fragment, { children: [_jsx("div", { className: "no-h", children: "1 \u00B7 Customer" }), _jsx("input", { className: "search", type: "search", autoFocus: true, placeholder: "Type a customer or city", value: cq, onChange: e => setCq(e.target.value), "aria-label": "Customer" }), _jsx("div", { className: "no-copts", children: custOpts.map(x => _jsxs("button", { onClick: () => { setCust(x.id); setCq(''); }, children: [_jsx("b", { children: x.name }), _jsxs("span", { className: "muted small", children: [(x.address ?? '').split(',').slice(-2, -1)[0]?.trim() ?? '', x.reserves_enabled ? ' · reserves' : ''] })] }, x.id)) })] }) : _jsxs(_Fragment, { children: [_jsxs("div", { className: "row no-cust", children: [_jsxs("div", { className: "grow", children: [_jsx("div", { className: "no-cname", children: c.name }), _jsx("div", { className: "muted small", children: lastO?.date ? `last order ${fmtShort(lastO.date)}` : lastO ? 'no orders yet' : '' })] }), _jsx("button", { className: "ghost small", onClick: () => setCust(null), children: "Change" })] }), _jsxs("div", { className: "no-chips", children: [_jsx("span", { className: "pill", children: c.price_per_lb != null ? `${usd2(Number(c.price_per_lb))}/lb contract` : market.get(CUR_YEAR) != null ? `Market ${usd2(market.get(CUR_YEAR))}/lb` : 'Market price' }), _jsx("span", { className: "pill", children: terms.find(t => t.code === c.payment_terms)?.label ?? 'Due on receipt' }), cbal != null && _jsx("span", { className: `pill ${cbal > 0 ? 'warnp' : ''}`, children: cbal > 0 ? `${usd(cbal)} owed` : 'Nothing owed' }), _jsx("span", { className: "pill", children: c.reserves_enabled ? `Reserves: ${n0f(resLeft)} lbs left` : 'Menu only' })] }), licenseWarning(c) && _jsxs("div", { className: "warnbox", children: [licenseWarning(c), " Compliance keeps customer licenses in Compliance \u203A Library \u203A Customer licenses."] })] }) }), _jsxs("section", { className: "no-sec no-menu", children: [_jsxs("div", { className: "no-tabs", children: [_jsx("span", { className: "no-h", children: "2 \u00B7 What they want" }), SALE_PRODUCTS.map(p => _jsxs("button", { className: tab === p ? 'on' : '', onClick: () => { setTab(p); setQ(''); }, children: [PRODUCT_LABEL[p], nIn(p) > 0 && _jsx("b", { children: nIn(p) })] }, p))] }), _jsx("input", { className: "search", type: "search", placeholder: "Search strains", value: q, onChange: e => setQ(e.target.value), "aria-label": "Search strains" }), loading ? _jsx("p", { className: "muted", children: "Loading what's available\u2026" }) : !opts.length ? _jsxs("p", { className: "muted", children: ["Nothing available", q ? ` for "${q}"` : '', "."] }) :
                                            _jsx("div", { className: "no-twrap", children: _jsxs("table", { className: "ctable no-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Strain" }), _jsx("th", { className: "num", children: "Open" }), tab === 'fresh_frozen' && _jsx("th", { className: "num", children: "Their reserve" }), _jsx("th", { className: "num", children: "$/lb" }), _jsx("th", { className: "num", children: "Lbs" }), tab === 'fresh_frozen' && _jsx("th", {})] }) }), _jsx("tbody", { children: opts.map(o => {
                                                                const k = pkey(tab, o.strain, o.year), p = picks[k], base = { product: tab, strain: o.strain, year: o.year }, auto = autoPrice(tab, o.year, o.strain);
                                                                const over = p && overOf(p) != null;
                                                                return _jsxs("tr", { className: p && Number(p.lbs) > 0 ? (over ? 'bad' : 'on') : '', children: [_jsxs("td", { className: "c-n", children: [_jsx("b", { children: o.strain }), " ", o.year !== CUR_YEAR && _jsxs("span", { className: "muted small", children: [o.year, " crop"] })] }), _jsx("td", { className: "num c-o", "data-l": "open ", children: n0f(o.open) }), tab === 'fresh_frozen' && _jsx("td", { className: `num c-r ${o.res > 0 ? 'resv' : 'muted'}`, "data-l": "their reserve ", children: o.res > 0 ? n0f(o.res) : '—' }), _jsx("td", { className: "num c-p", children: _jsx("input", { className: "qty price", type: "number", step: "0.25", min: "0", inputMode: "decimal", "aria-label": `$/lb for ${o.strain}`, placeholder: auto == null ? 'set later' : '', value: p?.price !== undefined ? p.price : auto != null ? String(auto) : '', onChange: e => setPick(k, base, { price: e.target.value }) }) }), _jsxs("td", { className: "num c-l", children: [_jsx("input", { className: `qty ${over ? 'bad' : ''}`, type: "number", step: "10", min: "0", inputMode: "numeric", placeholder: "0", "aria-label": `Lbs of ${o.strain}`, value: p?.lbs ?? '', onChange: e => setPick(k, base, { lbs: e.target.value }) }), over && _jsxs("div", { className: "warn-t small", children: ["only ", n0f(availOf(p))] })] }), tab === 'fresh_frozen' && _jsx("td", { className: "c-s", children: p && Number(p.lbs) > 0 && _jsxs("span", { className: "row", style: { gap: 6, flexWrap: 'nowrap' }, children: [_jsx("button", { className: `smp ${p.sample ? 'on' : ''}`, "aria-pressed": !!p.sample, onClick: () => setPick(k, base, { sample: !p.sample }), children: "Sample" }), p.sample && _jsx("input", { className: "qty", type: "number", step: "10", min: "0", placeholder: "hold", "aria-label": "Lbs to hold", value: p.hold ?? '', onChange: e => setPick(k, base, { hold: e.target.value }) })] }) })] }, k);
                                                            }) })] }) }), used.some(l => l.sample) && _jsxs("p", { className: "muted small", children: ["Sample lines hold the \"hold\" lbs for ", c?.name ?? 'the customer', " from now until ", c?.sample_hold_days ?? 10, " days after the order ships. Cancelling the order drops the hold."] })] }), _jsxs("section", { className: "no-sec", children: [_jsxs("button", { className: "linkbtn no-det", onClick: () => setDet(!det), children: [det ? '▾' : '▸', " 3 \u00B7 Details ", _jsx("span", { className: "muted", children: "PO, delivery date, terms, shipping, notes" })] }), det && _jsxs("div", { className: "no-detg", children: [_jsxs("div", { className: "field", children: [_jsx("label", { children: "Customer PO" }), _jsx("input", { value: po, onChange: e => setPo(e.target.value) })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Requested Delivery Date" }), _jsx("input", { type: "date", value: wanted, onChange: e => setWanted(e.target.value) })] }), _jsxs("div", { className: "field", children: [_jsxs("label", { children: ["Payment terms ", _jsx("span", { className: "muted", children: "(this order only)" })] }), _jsxs(Select, { value: termsCode, onChange: e => setTermsCode(e.target.value), children: [_jsx("option", { value: "", children: c ? `Customer default (${terms.find(t => t.code === c.payment_terms)?.label ?? 'Due on receipt'})` : 'Customer default' }), terms.filter(t => t.active).map(t => _jsx("option", { value: t.code, children: t.label }, t.code))] })] }), _jsxs("div", { className: "field", children: [_jsxs("label", { children: ["Shipping ", _jsx("span", { className: "muted", children: "(blank = the load works it out when it leaves)" })] }), _jsx("input", { type: "number", step: "0.01", min: "0", value: shipping, onChange: e => setShipping(e.target.value), placeholder: est?.charge != null ? String(est.charge) : '0.00' }), est && _jsx("span", { className: "muted small", children: est.rule === 'free' ? `Contract customer: FREE shipping${est.descr ? ` ${est.descr.replace('FREE contract shipping', '').trim()}` : ''}`
                                                                : est.rule === 'pickup' ? 'They pick up: no shipping'
                                                                    : est.problem ? est.problem : `Estimate, one stop on a box truck: $${Number(est.charge).toFixed(2)} (${est.descr})` }), shipping !== '' && _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: quoted, onChange: e => setQuoted(e.target.checked) }), " I quoted this to the customer (it wins over the load's calculation)"] })] }), _jsxs("div", { className: "field wide", children: [_jsx("label", { children: "Notes" }), _jsx("input", { value: notes, onChange: e => setNotes(e.target.value) })] })] })] })] }), _jsxs("aside", { className: "no-sum", children: [_jsx("div", { className: "no-h", style: { padding: '12px 14px', borderBottom: '1px solid var(--line)' }, children: "The order" }), summary] })] }), _jsxs("div", { className: "no-bar", children: [_jsxs("button", { className: "linkbtn grow", onClick: () => setSumOpen(true), children: [_jsx("b", { children: usd(dolT + (cust == null ? 0 : shipT)) }), _jsxs("span", { className: "muted small", children: [" \u00B7 ", n0f(lbsT), " lbs \u00B7 ", used.length, " line", used.length === 1 ? '' : 's', " \u25B4"] })] }), _jsx("button", { className: "ghost", disabled: busy || !ok, onClick: () => save(false), children: "Draft" }), _jsx("button", { className: "primary", disabled: busy || !ok, onClick: () => save(), children: "Create order" })] }), sumOpen && _jsx("div", { className: "scrim no-sumscrim", onClick: () => setSumOpen(false), children: _jsxs("div", { className: "sheet no-sumsheet", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsx("h2", { children: "The order" }), _jsx("button", { className: "ghost", onClick: () => setSumOpen(false), children: "\u2715" })] }), summary] }) })] }) }));
}
const n0f = (v) => Math.round(v).toLocaleString();
const fmtShort = (d) => new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
/** Sales > Settings > Payment terms */
export function TermsPanel({ backend, flash, canEdit }) {
    const [rows, setRows] = useState(null);
    const [ed, setEd] = useState(null);
    const load = () => backend.paymentTerms().then(setRows).catch(() => setRows([]));
    useEffect(() => { load(); }, []);
    if (!rows)
        return _jsx("p", { className: "muted", children: "Loading\u2026" });
    const desc = (t) => t.schedule.map(p => `${p.pct}% ${p.days ? `in ${p.days} days` : 'on the invoice date'}`).join(', ');
    async function save() {
        if (!ed)
            return;
        try {
            await backend.setPaymentTerm({ code: ed.code, label: ed.label, schedule: ed.parts.map(p => ({ pct: Number(p.pct), days: Number(p.days) || 0 })), cod: ed.cod, active: ed.active });
            setEd(null);
            await load();
            flash('Saved');
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
    }
    return (_jsxs("div", { className: "dlist", children: [_jsx("p", { className: "muted", children: "Set each customer's default in Customers. Sales can change the terms on any order or invoice." }), canEdit && _jsx("button", { className: "primary small", onClick: () => setEd({ code: '', label: '', parts: [{ pct: '100', days: '30' }], cod: false, active: true, isNew: true }), children: "+ Payment terms" }), rows.map(t => (_jsxs("button", { className: "drow click", disabled: !canEdit, onClick: () => setEd({ code: t.code, label: t.label, parts: t.schedule.map(p => ({ pct: String(p.pct), days: String(p.days) })), cod: t.cod, active: t.active, isNew: false }), children: [_jsxs("span", { children: [_jsx("b", { children: t.label }), _jsxs("span", { className: "muted", children: [" \u00B7 ", t.code, " \u00B7 ", desc(t), t.cod ? ' · cash on delivery' : ''] })] }), !t.active && _jsx("span", { className: "pill", children: "retired" })] }, t.code))), ed && (_jsx("div", { className: "scrim", onClick: () => setEd(null), children: _jsxs("div", { className: "sheet form", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsx("h2", { children: ed.isNew ? 'New payment terms' : ed.label }), _jsx("button", { className: "ghost", onClick: () => setEd(null), children: "\u2715" })] }), _jsxs("div", { className: "grid2", children: [_jsxs("div", { className: "field", children: [_jsx("label", { children: "Code" }), _jsx("input", { value: ed.code, disabled: !ed.isNew, onChange: e => setEd({ ...ed, code: e.target.value.toUpperCase() }), placeholder: "NET60" })] }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Name on invoices" }), _jsx("input", { value: ed.label, onChange: e => setEd({ ...ed, label: e.target.value }), placeholder: "Net 60" })] })] }), _jsxs("div", { className: "field", children: [_jsxs("label", { children: ["Parts ", _jsx("span", { className: "muted", children: "(must add up to 100%)" })] }), ed.parts.map((p, i) => (_jsxs("div", { className: "row noline", children: [_jsx("input", { type: "number", value: p.pct, onChange: e => setEd({ ...ed, parts: ed.parts.map((x, j) => j === i ? { ...x, pct: e.target.value } : x) }) }), _jsx("span", { children: "% due" }), _jsx("input", { type: "number", value: p.days, onChange: e => setEd({ ...ed, parts: ed.parts.map((x, j) => j === i ? { ...x, days: e.target.value } : x) }) }), _jsx("span", { children: "days after the invoice" }), ed.parts.length > 1 && _jsx("button", { className: "ghost small", onClick: () => setEd({ ...ed, parts: ed.parts.filter((_, j) => j !== i) }), children: "\u2715" })] }, i))), _jsx("button", { className: "ghost small", onClick: () => setEd({ ...ed, parts: [...ed.parts, { pct: '', days: '' }] }), children: "+ Part" })] }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: ed.cod, onChange: e => setEd({ ...ed, cod: e.target.checked }) }), " Cash on delivery"] }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: ed.active, onChange: e => setEd({ ...ed, active: e.target.checked }) }), " In use"] }), _jsxs("div", { className: "row between", children: [_jsx("span", {}), _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost", onClick: () => setEd(null), children: "Cancel" }), _jsx("button", { className: "primary", disabled: !ed.code.trim() || !ed.label.trim() || ed.parts.reduce((a, p) => a + Number(p.pct || 0), 0) !== 100, onClick: save, children: "Save" })] })] })] }) }))] }));
}
const MENU_FINISHES = [['FF', 'Fresh Frozen'], ['ST', 'Standards'], ['SM', 'Smalls']];
export function MarketPricePanel({ backend, flash, canEdit }) {
    const sb = backend.client();
    const [rows, setRows] = useState(null);
    const [missing, setMissing] = useState(false);
    const [cur, setCur] = useState(CUR_YEAR);
    const [fin, setFin] = useState('FF');
    const [others, setOthers] = useState([]);
    const [ed, setEd] = useState({});
    const [busy, setBusy] = useState(false);
    const load = async () => {
        if (!sb) {
            setRows([]);
            return;
        }
        const { data, error } = await sb.from('market_prices').select('*').order('crop_year', { ascending: false });
        setMissing(!!error && /market_prices/.test(error.message));
        setRows(error ? [] : (data ?? []).map(r => ({ ...r, finish: r.finish ?? 'FF' })));
    };
    useEffect(() => {
        load();
        backend.reserveYears().then(y => setCur(y.current)).catch(() => { });
        sb?.from('finishes').select('code,name').then(r => setOthers((r.data ?? []).filter(f => !MENU_FINISHES.some(m => m[0] === f.code)).map(f => [f.code, f.name])), () => { });
    }, []);
    if (!rows)
        return _jsx("p", { className: "muted", children: "Loading\u2026" });
    if (missing)
        return _jsx("div", { className: "warnbox", children: "Market prices need 164_market_price.sql run in Supabase." });
    const finName = (f) => [...MENU_FINISHES, ...others].find(x => x[0] === f)?.[1] ?? f;
    const mine = rows.filter(r => r.finish === fin);
    const years = [...new Set([cur + 1, cur, cur - 1, ...mine.map(r => r.crop_year)])].sort((a, b) => b - a);
    async function save(y, clear) {
        if (!sb)
            return;
        const v = (ed[y] ?? '').trim();
        if (!clear && !(Number(v) >= 0 && v !== '')) {
            flash('Enter a price in $/lb', true);
            return;
        }
        setBusy(true);
        try {
            const { error } = await sb.rpc('set_market_price', { p_year: y, p_price: clear ? null : Number(v), p_finish: fin });
            if (error)
                throw new Error(error.message);
            setEd(e => { const n = { ...e }; delete n[y]; return n; });
            await load();
            flash(clear ? `${y} ${finName(fin)} market price cleared` : `${y} ${finName(fin)} market price saved: ${money(Number(v))}/lb`);
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
        finally {
            setBusy(false);
        }
    }
    const pill = (k, l) => _jsx("button", { className: fin === k ? 'primary small' : 'ghost small', onClick: () => { setFin(k); setEd({}); }, children: l }, k);
    return (_jsxs("div", { className: "dlist", children: [_jsx("p", { className: "muted", children: "One price per product and crop year, for every strain (e.g. 2026 Fresh Frozen). Outside customers with no contract price pay it on portal orders, Sales orders and invoices, unless the strain's item card has its own price. The open menu shows the item card price, else this. Contract customers always pay their contract price. Orders already placed keep their prices." }), _jsxs("div", { className: "row wrap", style: { gap: 6 }, children: [MENU_FINISHES.map(([k, l]) => pill(k, l)), others.length > 0 && _jsxs("select", { value: MENU_FINISHES.some(m => m[0] === fin) ? '' : fin, onChange: e => { if (e.target.value) {
                            setFin(e.target.value);
                            setEd({});
                        } }, children: [_jsx("option", { value: "", children: "Other product\u2026" }), others.map(([k, l]) => _jsx("option", { value: k, children: l }, k))] })] }), years.map(y => {
                const r = mine.find(x => x.crop_year === y), editing = ed[y] !== undefined;
                return (_jsxs("div", { className: "drow", children: [_jsxs("span", { children: [_jsxs("b", { children: [y, " ", finName(fin)] }), y === cur && _jsx("span", { className: "muted", children: " \u00B7 current crop" }), _jsx("br", {}), _jsx("span", { className: "muted", children: r ? `${money(Number(r.price_per_lb))}/lb · set by ${r.updated_by ?? 'someone'} ${new Date(r.updated_at).toLocaleDateString()}` : 'Not set: Call/Email for Price on the menu, and customers without a contract price get no price' })] }), canEdit && (editing
                            ? _jsxs("span", { className: "row noline", children: [_jsx("input", { type: "number", min: "0", step: "0.01", inputMode: "decimal", style: { width: 110 }, placeholder: "$/lb", value: ed[y], autoFocus: true, onChange: e => setEd({ ...ed, [y]: e.target.value }), onKeyDown: e => { if (e.key === 'Enter')
                                            save(y, false); } }), _jsx("button", { className: "primary small", disabled: busy, onClick: () => save(y, false), children: "Save" }), _jsx("button", { className: "ghost small", disabled: busy, onClick: () => setEd(e => { const n = { ...e }; delete n[y]; return n; }), children: "Cancel" })] })
                            : _jsxs("span", { className: "row noline", children: [_jsx("button", { className: "ghost small", disabled: busy, onClick: () => setEd({ ...ed, [y]: r ? String(r.price_per_lb) : '' }), children: r ? 'Change' : 'Set price' }), r && _jsx("button", { className: "ghost small", disabled: busy, onClick: () => { if (confirm(`Clear the ${y} ${finName(fin)} market price?`))
                                            save(y, true); }, children: "Clear" })] }))] }, y));
            }), !canEdit && _jsx("p", { className: "muted", children: "Only a Sales Admin can change the market price." })] }));
}
export function ContractProductPrices({ backend, flash, canEdit }) {
    const sb = backend.client();
    const [rows, setRows] = useState(null);
    const [custs, setCusts] = useState([]);
    const [fins, setFins] = useState([]);
    const [f, setF] = useState({ cust: '', year: String(CUR_YEAR), fin: 'ST', price: '' });
    const [busy, setBusy] = useState(false);
    const load = async () => {
        if (!sb) {
            setRows([]);
            return;
        }
        const { data, error } = await sb.from('customer_product_prices').select('*').order('crop_year', { ascending: false });
        if (error)
            flash(/customer_product_prices/.test(error.message) ? 'Contract product prices need 176_pricing.sql run in Supabase.' : error.message, true);
        setRows(error ? [] : (data ?? []));
    };
    useEffect(() => {
        load();
        sb?.from('customers').select('id,name').order('name').then(r => setCusts((r.data ?? [])), () => { });
        sb?.from('finishes').select('code,name').then(r => setFins((r.data ?? []).filter(x => x.code !== 'FF').map(x => [x.code, x.name])), () => { });
    }, []);
    const custName = (id) => custs.find(c => c.id === id)?.name ?? `#${id}`;
    const finName = (c) => fins.find(x => x[0] === c)?.[1] ?? c;
    async function save(cust, year, fin, price) {
        if (!sb)
            return;
        setBusy(true);
        try {
            const { error } = await sb.rpc('set_customer_product_price', { p_customer: cust, p_year: year, p_finish: fin, p_price: price });
            if (error)
                throw new Error(error.message);
            await load();
            flash(price == null ? 'Contract price removed' : `Saved: ${custName(cust)} ${year} ${finName(fin)} ${money(price)}/lb`);
            if (price != null)
                setF(x => ({ ...x, price: '' }));
        }
        catch (e) {
            flash(String(e.message ?? e), true);
        }
        finally {
            setBusy(false);
        }
    }
    if (!rows)
        return _jsx("p", { className: "muted", children: "Loading\u2026" });
    return (_jsxs("div", { className: "dlist", children: [_jsx("p", { className: "muted", children: "A contract customer's price for a product, the same for every strain (e.g. their 2026 Smalls price). It carries into later crop years until a newer one is set. Their fresh frozen price stays on their payment terms. Orders already placed keep their prices; special prices are still changed on the sales order." }), !rows.length && _jsx("p", { className: "muted", children: "No contract product prices yet." }), rows.map(r => (_jsxs("div", { className: "drow", children: [_jsxs("span", { children: [_jsx("b", { children: custName(r.customer_id) }), " \u00B7 ", r.crop_year, " ", finName(r.finish), _jsx("br", {}), _jsxs("span", { className: "muted", children: [money(Number(r.price_per_lb)), "/lb \u00B7 set by ", r.updated_by ?? 'someone', " ", new Date(r.updated_at).toLocaleDateString()] })] }), canEdit && _jsx("button", { className: "ghost small", disabled: busy, onClick: () => { if (confirm(`Remove ${custName(r.customer_id)}'s ${r.crop_year} ${finName(r.finish)} price?`))
                            save(r.customer_id, r.crop_year, r.finish, null); }, children: "Remove" })] }, `${r.customer_id}-${r.crop_year}-${r.finish}`))), canEdit ? _jsxs("div", { className: "row wrap", style: { gap: 6, marginTop: 8 }, children: [_jsxs("select", { value: f.cust, onChange: e => setF({ ...f, cust: e.target.value }), children: [_jsx("option", { value: "", children: "Customer\u2026" }), custs.map(c => _jsx("option", { value: c.id, children: c.name }, c.id))] }), _jsx("select", { value: f.fin, onChange: e => setF({ ...f, fin: e.target.value }), children: fins.map(([k, l]) => _jsx("option", { value: k, children: l }, k)) }), _jsx("input", { type: "number", style: { width: 90 }, value: f.year, onChange: e => setF({ ...f, year: e.target.value }), "aria-label": "Crop year" }), _jsx("input", { type: "number", min: "0", step: "0.01", inputMode: "decimal", style: { width: 110 }, placeholder: "$/lb", value: f.price, onChange: e => setF({ ...f, price: e.target.value }) }), _jsx("button", { className: "primary small", disabled: busy || !f.cust || !(Number(f.price) >= 0) || f.price.trim() === '', onClick: () => save(Number(f.cust), Number(f.year), f.fin, Number(f.price)), children: "Save price" })] }) : _jsx("p", { className: "muted", children: "Only a Sales Admin can change contract prices." })] }));
}
export function SharedDocPage({ backend, token }) {
    const [d, setD] = useState(undefined);
    const [url, setUrl] = useState(null);
    useEffect(() => { backend.sharedDoc(token).then(async (doc) => { setD(doc); if (doc)
        setUrl(URL.createObjectURL(await makePdf(doc))); }).catch(() => setD(null)); }, [token]);
    useEffect(() => { if (d)
        document.title = `${docTitle(d)} ${d.number} · Lifted Farms`; }, [d]);
    if (d === undefined)
        return _jsx("div", { className: "center muted", children: "Loading\u2026" });
    if (!d)
        return _jsxs("div", { className: "center", children: [_jsx("img", { className: "logo-login logo-l", src: "/logo-light.svg", alt: "Lifted Farms" }), _jsx("img", { className: "logo-login logo-d", src: "/logo-dark.svg", alt: "Lifted Farms" }), _jsx("h2", { children: "This link doesn't work" }), _jsx("p", { className: "muted", children: "It may have been replaced. Ask Lifted Farms for a new one." })] });
    return (_jsxs("div", { className: "shareddoc", children: [_jsxs("div", { className: "row between wrap", children: [_jsxs("div", { children: [_jsx("img", { className: "logo-img logo-l", src: "/logo-light.svg", alt: "Lifted Farms" }), _jsx("img", { className: "logo-img logo-d", src: "/logo-dark.svg", alt: "Lifted Farms" })] }), _jsx("div", { className: "row", children: _jsx("button", { className: "primary", onClick: () => downloadPdf(d), children: "Download PDF" }) })] }), _jsxs("h2", { children: [docTitle(d), " ", d.number] }), _jsxs("p", { className: "muted", children: [d.customer.name, " \u00B7 ", money(d.total), " \u00B7 ", d.terms, d.kind === 'invoice' && d.due ? ` · due ${dfmt(d.due)}` : '', d.kind === 'invoice' && d.status === 'paid' ? ' · paid, thank you' : ''] }), url ? _jsx("iframe", { className: "docframe big", title: d.number, src: url }) : _jsx("p", { className: "muted", children: "Making the PDF\u2026" })] }));
}
const CM_REASONS = [['price_correction', 'Price correction (charged too much)'], ['return', 'Return'], ['rejected', 'Rejected'], ['not_delivered', 'Not delivered'],
    ['cancelled', 'Cancelled'], ['quality', 'Quality discount'], ['other', 'Other']];
const BILL_REASONS = [['price_correction', 'Price correction (charged too little)'], ['missed_charge', 'Missed charge (shipping, storage…)'], ['other', 'Other']];
const rl = (xs, k) => xs.find(x => x[0] === k)?.[1].split(' (')[0] ?? k ?? '';
function Adjustments({ d, backend, canEdit, flash, onDone }) {
    const sb = backend.client();
    const [a, setA] = useState(null);
    const [mode, setMode] = useState(null);
    const load = () => { sb?.rpc('invoice_adjustments', { p_inv: d.id }).then(({ data }) => setA(data)); };
    useEffect(load, [d.id]);
    if (!sb || !a)
        return null;
    const sent = d.acct_status === 'sent';
    const credited = a.credits.filter(c => c.status !== 'void').reduce((x, c) => x + Number(c.total), 0);
    return _jsxs("div", { className: "dcard adjbox", children: [a.parent && _jsxs("p", { className: "muted small", children: ["Bills the difference on ", a.parent.number, "."] }), (a.credits.length > 0 || a.followups.length > 0) && _jsxs("div", { className: "small", children: [a.credits.map(c => _jsxs("div", { children: ["Credit memo ", _jsx("b", { children: c.number }), " \u00B7 ", rl(CM_REASONS, c.reason), " \u00B7 \u2212", money(c.total), " \u00B7 ", dfmt(c.date), " ", _jsx("span", { className: `pill acct-${c.acct_status}`, children: ACCT[c.acct_status] ?? c.acct_status })] }, c.id)), a.followups.map(f => _jsxs("div", { children: ["Second invoice ", _jsx("b", { children: f.number }), " \u00B7 ", rl(BILL_REASONS, f.reason), " \u00B7 ", money(f.total), " \u00B7 ", dfmt(f.date), " ", _jsx("span", { className: `pill acct-${f.acct_status}`, children: ACCT[f.acct_status] ?? f.acct_status })] }, f.id)), credited > 0 && _jsxs("div", { className: "muted", children: ["Still owed on this invoice after credits: ", money(Number(d.total) - credited), " (before payments)"] })] }), canEdit && sent && !mode && _jsxs("div", { className: "row wrap", style: { gap: 6, marginTop: 6 }, children: [_jsx("button", { className: "ghost small", onClick: () => setMode('cm'), children: "Credit memo" }), _jsx("button", { className: "ghost small", onClick: () => setMode('bill'), children: "Bill the difference" }), _jsx("span", { className: "muted small", children: "It's in QuickBooks, so it can't change: they owe less = credit memo, they owe more = a second invoice." })] }), canEdit && !sent && d.status !== 'void' && _jsx("p", { className: "muted small", children: "Not in QuickBooks yet: change it with Edit. Once it's in QuickBooks, fixes are a credit memo or a second invoice." }), mode === 'cm' && _jsx(CreditForm, { d: d, sb: sb, flash: flash, onClose: () => setMode(null), onDone: async () => { setMode(null); load(); await onDone(); } }), mode === 'bill' && _jsx(BillForm, { d: d, sb: sb, products: a.products ?? [], flash: flash, onClose: () => setMode(null), onDone: async () => { setMode(null); load(); await onDone(); } })] });
}
function CreditForm({ d, sb, flash, onClose, onDone }) {
    const [why, setWhy] = useState('');
    const [notes, setNotes] = useState('');
    const [rows, setRows] = useState({});
    const [busy, setBusy] = useState(false);
    const perLb = why === 'price_correction' || why === 'quality';
    const row = (id) => rows[id] ?? { on: false, qty: '', price: '' };
    const set = (id, x) => setRows(r => ({ ...r, [id]: { ...row(id), ...x } }));
    const lines = d.lines.filter(l => Number(l.amount) > 0);
    const total = lines.reduce((t, l) => { const r = row(l.id); return r.on ? t + (Number(r.qty) || 0) * (Number(r.price) || 0) : t; }, 0);
    async function save() {
        setBusy(true);
        try {
            const { data, error } = await sb.rpc('make_credit_memo', { p_inv: d.id, p: { reason: why, notes, lines: lines.filter(l => row(l.id).on).map(l => ({ invoice_line_id: l.id, qty: Number(row(l.id).qty), price: Number(row(l.id).price) })) } });
            if (error)
                throw new Error(error.message);
            flash(`Credit memo ${data.number} made. Send it to QuickBooks from Accounting.`);
            await onDone();
        }
        catch (e) {
            flash(e.message, true);
        }
        finally {
            setBusy(false);
        }
    }
    return _jsxs("div", { className: "invedit", children: [_jsxs("b", { children: ["Credit memo on ", d.number] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Why" }), _jsxs(Select, { value: why, onChange: e => { setWhy(e.target.value); setRows({}); }, children: [_jsx("option", { value: "", children: "Pick a reason\u2026" }), CM_REASONS.map(([k, l]) => _jsx("option", { value: k, children: l }, k))] })] }), why && _jsxs(_Fragment, { children: [_jsxs("p", { className: "muted small", children: [perLb ? 'Tick the lines and enter the lbs and the amount off per lb.' : 'Tick the lines and the lbs being credited (the price is what was billed).', why === 'return' ? ' Product coming back is usually done in Sales › Returns, which makes the credit memo when it\'s received.' : ''] }), _jsxs("table", { className: "restable invlines", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", {}), _jsx("th", { children: "Line" }), _jsx("th", { className: "num", children: "Qty" }), _jsx("th", { className: "num", children: perLb ? 'Off per unit' : 'Price' }), _jsx("th", { className: "num", children: "Credit" })] }) }), _jsx("tbody", { children: lines.map(l => {
                                    const r = row(l.id);
                                    return _jsxs("tr", { children: [_jsx("td", { children: _jsx("input", { type: "checkbox", checked: r.on, onChange: e => set(l.id, { on: e.target.checked, qty: r.qty || String(l.qty), price: r.price || (perLb ? '' : String(l.price)) }) }) }), _jsxs("td", { children: [l.description, _jsxs("div", { className: "muted small", children: [Number(l.qty).toLocaleString(), " ", l.uom, " at ", money(l.price)] })] }), _jsx("td", { className: "num", children: _jsx("input", { className: "qty", type: "number", disabled: !r.on, value: r.qty, onChange: e => set(l.id, { qty: e.target.value }) }) }), _jsx("td", { className: "num", children: _jsx("input", { className: "qty", type: "number", step: "0.01", disabled: !r.on || (!perLb && why !== 'other'), value: r.price, onChange: e => set(l.id, { price: e.target.value }) }) }), _jsx("td", { className: "num", children: r.on ? money((Number(r.qty) || 0) * (Number(r.price) || 0)) : '' })] }, l.id);
                                }) })] }), _jsxs("label", { className: "field", children: [_jsxs("span", { children: ["Note ", why === 'other' ? '' : '(optional)'] }), _jsx("input", { value: notes, onChange: e => setNotes(e.target.value) })] }), _jsxs("div", { className: "row end", children: [_jsxs("span", { className: "muted", children: ["Credit total ", _jsx("b", { children: money(total) })] }), _jsx("button", { className: "ghost", onClick: onClose, children: "Cancel" }), _jsx("button", { className: "primary", disabled: busy || total <= 0 || (why === 'other' && !notes.trim()), onClick: save, children: "Make credit memo" })] })] })] });
}
function BillForm({ d, sb, products, flash, onClose, onDone }) {
    const [why, setWhy] = useState('');
    const [notes, setNotes] = useState('');
    const [lines, setLines] = useState([{ product: 'FRESH_FROZEN', description: '', qty: '', price: '' }]);
    const [busy, setBusy] = useState(false);
    const total = lines.reduce((t, l) => t + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);
    const prods = products.filter(p => !['SAMPLES_DISCOUNT', 'SALES_DISCOUNT', 'QUALITY_DISCOUNT', 'PRODUCT_RETURN', 'PRODUCT_REFUND'].includes(p.code));
    async function save() {
        setBusy(true);
        try {
            const { data, error } = await sb.rpc('make_followup_invoice', { p_inv: d.id, p: { reason: why, notes, lines: lines.map(l => ({ ...l, qty: Number(l.qty), price: Number(l.price) })) } });
            if (error)
                throw new Error(error.message);
            flash(`Invoice ${data.inv_number} made. Check it and send it to QuickBooks like any invoice.`);
            await onDone();
        }
        catch (e) {
            flash(e.message, true);
        }
        finally {
            setBusy(false);
        }
    }
    return _jsxs("div", { className: "invedit", children: [_jsxs("b", { children: ["Bill the difference on ", d.number] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Why" }), _jsxs(Select, { value: why, onChange: e => setWhy(e.target.value), children: [_jsx("option", { value: "", children: "Pick a reason\u2026" }), BILL_REASONS.map(([k, l]) => _jsx("option", { value: k, children: l }, k))] })] }), why && _jsxs(_Fragment, { children: [_jsx("p", { className: "muted small", children: why === 'price_correction' ? 'Example: billed 300 lbs at $45 instead of $50: Fresh Frozen, "Price correction Gas Face", qty 300, price 5.' : 'One line per charge.' }), lines.map((l, k) => _jsxs("div", { className: "row wrap", style: { gap: 6 }, children: [_jsx(Select, { value: l.product, onChange: e => setLines(x => x.map((y, j) => j === k ? { ...y, product: e.target.value } : y)), children: prods.map(p => _jsx("option", { value: p.code, children: p.name }, p.code)) }), _jsx("input", { placeholder: "Description", value: l.description, onChange: e => setLines(x => x.map((y, j) => j === k ? { ...y, description: e.target.value } : y)) }), _jsx("input", { className: "qty", type: "number", placeholder: "Qty", value: l.qty, onChange: e => setLines(x => x.map((y, j) => j === k ? { ...y, qty: e.target.value } : y)) }), _jsx("input", { className: "qty", type: "number", step: "0.01", placeholder: "Price", value: l.price, onChange: e => setLines(x => x.map((y, j) => j === k ? { ...y, price: e.target.value } : y)) }), lines.length > 1 && _jsx("button", { className: "ghost small", "aria-label": "Remove line", onClick: () => setLines(x => x.filter((_, j) => j !== k)), children: "\u2715" })] }, k)), _jsx("button", { className: "ghost small", onClick: () => setLines(x => [...x, { product: 'SHIPPING', description: '', qty: '1', price: '' }]), children: "+ Add line" }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Note (optional)" }), _jsx("input", { value: notes, onChange: e => setNotes(e.target.value) })] }), _jsxs("div", { className: "row end", children: [_jsxs("span", { className: "muted", children: ["New invoice total ", _jsx("b", { children: money(total) })] }), _jsx("button", { className: "ghost", onClick: onClose, children: "Cancel" }), _jsx("button", { className: "primary", disabled: busy || total <= 0 || lines.some(l => !l.description.trim()), onClick: save, children: "Make the invoice" })] })] })] });
}
