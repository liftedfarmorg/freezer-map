import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// Admin / Sales settings > Customers > Import from QuickBooks.
// Takes the customer list exported from QuickBooks Online (CSV or Excel: the Customers page export, or the
// Customer Contact List report) and matches each QuickBooks customer to an app customer.
//  * Matched: QuickBooks wins for billing info (email, phone, contact, billing and ship-to address, company name).
//    Blank cells never clear anything. The QuickBooks name is saved as "QuickBooks name" so invoices match it exactly.
//  * Not in the app: listed unticked. Pick "Add as new customer" or match it to an app customer by hand.
import { useMemo, useState } from 'react';
import { readSheet } from 'read-excel-file/browser';
// ---------- reading the file ----------
const cellText = (v) => (v == null ? '' : String(v)).replace(/ /g, ' ').trim();
/** a heading as a plain key: "Billing Address*" > "billing address" */
export const headKey = (h) => cellText(h).toLowerCase().replace(/[*:#]/g, '').replace(/[_\-/]+/g, ' ').replace(/\s+/g, ' ').trim();
const H = {
    name: ['customer full name', 'customer', 'display name', 'customer display name', 'display name as', 'customer name', 'name'],
    company: ['company name', 'company'],
    email: ['email', 'e mail', 'email address', 'primary email', 'main email'],
    phone: ['phone', 'phone numbers', 'phone number', 'main phone', 'primary phone', 'work phone', 'business phone'],
    mobile: ['mobile', 'mobile phone', 'mobile number', 'cell'],
    contact: ['full name', 'contact', 'contact name', 'primary contact'],
    first: ['first name', 'given name'],
    last: ['last name', 'family name'],
    bill: ['billing address', 'bill to', 'bill address', 'bill to address'],
    billStreet: ['billing street', 'billing address line 1', 'billing address 1', 'bill street', 'billing street address', 'street address', 'street', 'address', 'address line 1'],
    billStreet2: ['billing address line 2', 'billing address 2', 'billing street 2', 'street address 2', 'address line 2'],
    billCity: ['billing city', 'bill city', 'city'],
    billState: ['billing state', 'bill state', 'billing state province', 'state', 'province', 'state province'],
    billZip: ['billing zip', 'billing zip code', 'billing postal code', 'bill zip', 'zip', 'zip code', 'postal code'],
    billCountry: ['billing country', 'bill country', 'country'],
    ship: ['shipping address', 'ship to', 'ship to address', 'ship address'],
    shipStreet: ['shipping street', 'shipping address line 1', 'shipping address 1', 'ship street', 'shipping street address'],
    shipStreet2: ['shipping address line 2', 'shipping address 2', 'shipping street 2'],
    shipCity: ['shipping city', 'ship city'],
    shipState: ['shipping state', 'ship state', 'shipping state province'],
    shipZip: ['shipping zip', 'shipping zip code', 'shipping postal code', 'ship zip'],
    shipCountry: ['shipping country', 'ship country'],
    terms: ['terms', 'payment terms'],
    status: ['status', 'active'],
};
/** the header row (first 15 rows; QuickBooks reports put a title above it) and where each column is */
export function findColumns(grid) {
    for (let r = 0; r < Math.min(grid.length, 15); r++) {
        const heads = grid[r].map(headKey);
        const at = {};
        for (const k of Object.keys(H)) {
            // the first synonym that matches wins ("customer full name" over "name")
            for (const syn of H[k]) {
                const i = heads.indexOf(syn);
                if (i >= 0 && !Object.values(at).includes(i)) {
                    at[k] = i;
                    break;
                }
            }
        }
        if (at.name != null && Object.keys(at).length >= 2)
            return { row: r, at };
    }
    return null;
}
const US = /^(us|usa|u\.s\.a?\.?|united states( of america)?)$/i;
function joinAddr(street, street2, city, state, zip, country) {
    const l3 = [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return [street, street2, l3, country && !US.test(country) ? country : ''].filter(Boolean).join('\n');
}
/** a one-cell address from a QuickBooks report: tidy the spacing, keep the lines */
const tidyAddr = (s) => s.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
/** "Phone: (831) 555-1212 Mobile: (831) 555-3434" > the first number */
function firstPhone(s) {
    const m = s.match(/(?:phone|main|work|mobile|cell)?\s*:?\s*([+()\d][\d\s().+-]{6,}\d(?:\s*(?:x|ext\.?)\s*\d+)?)/i);
    return (m ? m[1] : s).replace(/\s+/g, ' ').trim();
}
/** one QuickBooks customer per row; report footers and totals are skipped */
export function readQbo(grid) {
    const cols = findColumns(grid);
    if (!cols)
        return { rows: [], found: [], error: 'Couldn\'t find the QuickBooks customer columns. Export the customer list from QuickBooks (Customers > Export, or the Customer Contact List report) and pick that file.' };
    const { row, at } = cols;
    const rows = [];
    const seen = new Set();
    for (let r = row + 1; r < grid.length; r++) {
        const g = (k) => at[k] != null ? cellText(grid[r][at[k]]) : '';
        const name = g('name');
        if (!name || /^(total|grand total)\b/i.test(name))
            continue;
        const filled = grid[r].filter(c => cellText(c)).length;
        if (filled <= 1 && /\d{4}|gmt|am|pm/i.test(name) && name.split(' ').length > 3)
            continue; // "Tuesday, October 28, 2026 09:12 PM GMT-07:00"
        if (seen.has(name.toLowerCase()))
            continue;
        seen.add(name.toLowerCase());
        const q = { line: r + 1, qbo_name: name };
        const company = g('company');
        if (company)
            q.company = company;
        const email = g('email');
        if (email)
            q.email = email.replace(/\s*[,;]\s*/g, ', ');
        const phone = g('phone') || g('mobile');
        if (phone)
            q.phone = firstPhone(phone);
        const contact = g('contact') || [g('first'), g('last')].filter(Boolean).join(' ');
        if (contact && contact !== name)
            q.contact = contact;
        const bill = g('bill') ? tidyAddr(g('bill')) : joinAddr(g('billStreet'), g('billStreet2'), g('billCity'), g('billState'), g('billZip'), g('billCountry'));
        if (bill)
            q.billing_address = bill;
        const ship = g('ship') ? tidyAddr(g('ship')) : joinAddr(g('shipStreet'), g('shipStreet2'), g('shipCity'), g('shipState'), g('shipZip'), g('shipCountry'));
        if (ship)
            q.ship_to_address = ship;
        const terms = g('terms');
        if (terms)
            q.terms = terms;
        const st = g('status');
        if (st && /^(inactive|no|false|0)$/i.test(st))
            q.inactive = true;
        rows.push(q);
    }
    const label = { name: 'Customer', company: 'Company', email: 'Email', phone: 'Phone', mobile: 'Mobile', contact: 'Contact',
        bill: 'Billing address', billStreet: 'Billing address', ship: 'Shipping address', shipStreet: 'Shipping address', terms: 'Terms' };
    const found = [...new Set(Object.keys(at).map(k => label[k]).filter(Boolean))];
    return { rows, found };
}
// ---------- matching ----------
/** "Pardis Works, Inc." and "PARDIS WORKS INC" are the same customer */
export const normName = (s) => (s ?? '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(inc|incorporated|llc|l l c|corp|corporation|co|company|ltd|limited|lp|llp|pc|dba)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
export function matchCustomer(q, custs) {
    const exact = (c) => [c.qbo_name, c.legal_name, c.name].some(x => x && x.trim().toLowerCase() === q.qbo_name.toLowerCase());
    const hit = custs.find(c => c.qbo_name && c.qbo_name.trim().toLowerCase() === q.qbo_name.toLowerCase()) ?? custs.find(exact);
    if (hit)
        return hit;
    const keys = [q.qbo_name, q.company].map(normName).filter(Boolean);
    const close = custs.filter(c => [c.qbo_name, c.legal_name, c.name, c.ship_to_name].some(x => x && keys.includes(normName(x))));
    return close.length === 1 ? close[0] : null;
}
/** the app fields QuickBooks fills in for one customer */
export function fieldsFrom(q, terms) {
    const f = { qbo_name: q.qbo_name };
    if (q.company)
        f.legal_name = q.company;
    if (q.email)
        f.billing_email = q.email;
    if (q.phone)
        f.billing_phone = q.phone;
    if (q.contact)
        f.billing_contact = q.contact;
    if (q.billing_address)
        f.billing_address = q.billing_address;
    if (q.ship_to_address)
        f.ship_to_address = q.ship_to_address;
    if (q.terms && terms) {
        const t = terms.find(x => x.label.toLowerCase() === q.terms.toLowerCase() || x.code.toLowerCase() === q.terms.toLowerCase());
        if (t)
            f.payment_terms = t.code;
    }
    return f;
}
export const FIELD_LABEL = {
    qbo_name: 'QuickBooks name', legal_name: 'Legal name', billing_email: 'Billing email', billing_phone: 'Billing phone',
    billing_contact: 'Billing contact', billing_address: 'Billing address', ship_to_address: 'Ship-to address', payment_terms: 'Payment terms',
};
const same = (a, b) => cellText(a).replace(/\s+/g, ' ').toLowerCase() === cellText(b).replace(/\s+/g, ' ').toLowerCase();
/** what would change on an app customer (QuickBooks wins; blanks in the file change nothing) */
export function changesFor(c, f) {
    const out = {};
    for (const [k, v] of Object.entries(f))
        if (v != null && v !== '' && !same(c[k], v))
            out[k] = v;
    return out;
}
export function QboCustomerImport({ backend, customers, terms, flash, onDone, onClose }) {
    const [file, setFile] = useState(null);
    const [choice, setChoice] = useState({});
    const [withTerms, setWithTerms] = useState(false);
    const [busy, setBusy] = useState(false);
    const [open, setOpen] = useState(null);
    async function pick(f) {
        try {
            const grid = /\.csv$/i.test(f.name)
                ? (await import('./settings')).parseCsv((await f.text()).replace(/^﻿/, ''))
                : (await readSheet(f)).map(r => r.map(c => c instanceof Date ? c.toISOString().slice(0, 10) : cellText(c)));
            const res = readQbo(grid);
            if (res.error) {
                flash(res.error, true);
                return;
            }
            if (!res.rows.length) {
                flash(`No customers in ${f.name}`, true);
                return;
            }
            setFile({ name: f.name, rows: res.rows, found: res.found });
            setChoice({});
        }
        catch (e) {
            flash(`Couldn't read ${f.name}: ${e.message}`, true);
        }
    }
    const ext = useMemo(() => customers.filter(c => c.kind !== 'internal'), [customers]);
    const plan = useMemo(() => {
        if (!file)
            return null;
        const auto = new Map(file.rows.map(q => [q.line, matchCustomer(q, ext)]));
        // a customer two QuickBooks rows both match: neither is automatic
        const count = new Map();
        for (const c of auto.values())
            if (c)
                count.set(c.id, (count.get(c.id) ?? 0) + 1);
        return file.rows.map(q => {
            const a = auto.get(q.line);
            const ch = choice[q.line] ?? (a && count.get(a.id) === 1 ? `id:${a.id}` : 'skip');
            const target = ch.startsWith('id:') ? ext.find(c => c.id === Number(ch.slice(3))) ?? null : null;
            const f = fieldsFrom(q, withTerms ? terms : undefined);
            const changes = target ? changesFor(target, f) : null;
            return { q, ch, auto: !!(a && count.get(a.id) === 1 && !choice[q.line]), target, f, changes };
        });
    }, [file, choice, ext, withTerms, terms]);
    const matched = plan?.filter(p => p.target) ?? [];
    const updates = matched.filter(p => p.changes && Object.keys(p.changes).length);
    const adds = plan?.filter(p => p.ch === 'new') ?? [];
    const notIn = plan?.filter(p => !p.auto) ?? []; // stays listed after a hand match, so the pick can be changed
    const usedIds = new Set(matched.map(p => p.target.id));
    const unmatchedApp = ext.filter(c => c.active && !usedIds.has(c.id));
    async function apply() {
        if (!plan)
            return;
        setBusy(true);
        let done = 0;
        try {
            for (const p of updates) {
                await backend.saveRow('customers', { id: p.target.id, ...p.changes });
                done++;
            }
            for (const p of adds) {
                await backend.saveRow('customers', { name: p.q.qbo_name, kind: 'external', active: true, ...p.f });
                done++;
            }
            flash(`QuickBooks import: ${updates.length} updated, ${adds.length} added`);
            onDone();
            onClose();
        }
        catch (e) {
            flash(`Stopped after ${done}: ${e.message}`, true);
            onDone();
        }
        finally {
            setBusy(false);
        }
    }
    const show = (v) => cellText(v).replace(/\n/g, ' · ') || '(blank)';
    return (_jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: "sheet form wide qboimp", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsx("h2", { children: "Import customers from QuickBooks" }), _jsx("button", { className: "ghost", onClick: onClose, children: "\u2715" })] }), !file && _jsxs(_Fragment, { children: [_jsxs("p", { children: ["In QuickBooks Online: ", _jsx("b", { children: "Sales > Customers" }), ", then the export button above the list (Export to Excel). The ", _jsx("b", { children: "Customer Contact List" }), " report exported to Excel or CSV works too."] }), _jsx("p", { className: "muted", children: "Each QuickBooks customer is matched to an app customer by name. QuickBooks wins for billing info (email, phone, contact, billing and ship-to address, company name); blank cells don't clear anything. You see every change before anything is saved." }), _jsxs("label", { className: "primary filebtn", children: ["Pick the QuickBooks file", _jsx("input", { type: "file", accept: ".csv,.xlsx,.xls,.xlsm", onChange: e => { const f = e.target.files?.[0]; e.target.value = ''; if (f)
                                        pick(f); } })] })] }), file && plan && _jsxs(_Fragment, { children: [_jsxs("p", { className: "muted", children: [file.name, " \u00B7 ", file.rows.length, " QuickBooks customers \u00B7 columns found: ", file.found.join(', ')] }), _jsxs("div", { className: "row chips", children: [_jsxs("span", { className: "chip upd", children: [updates.length, " to update"] }), _jsxs("span", { className: "chip", children: [matched.length - updates.length, " already match"] }), _jsxs("span", { className: "chip new", children: [adds.length, " to add"] }), _jsxs("span", { className: "chip", children: [notIn.filter(p => p.ch === 'skip').length, " not in the app (skipped)"] })] }), plan.some(p => p.q.terms) && _jsxs("label", { className: "check small-check", children: [_jsx("input", { type: "checkbox", checked: withTerms, onChange: e => setWithTerms(e.target.checked) }), " Also update payment terms from QuickBooks (only terms with the same name as ours)"] }), updates.length > 0 && _jsxs(_Fragment, { children: [_jsx("h3", { children: "Updates" }), _jsx("div", { className: "picklist preview", children: updates.map(p => (_jsxs("div", { className: "prev s-update qbrow", onClick: () => setOpen(open === p.q.line ? null : p.q.line), children: [_jsxs("span", { className: "muted", children: ["row ", p.q.line] }), _jsxs("span", { children: [_jsx("b", { children: p.target.name }), p.q.qbo_name !== p.target.name && _jsxs("span", { className: "muted", children: [" \u00B7 QuickBooks: ", p.q.qbo_name] }), !p.auto && _jsx("span", { className: "muted", children: " \u00B7 matched by hand" })] }), _jsx("span", { children: Object.keys(p.changes).map(k => FIELD_LABEL[k] ?? k).join(', ') }), open === p.q.line && _jsx("div", { className: "qbdiff", children: Object.entries(p.changes).map(([k, v]) => (_jsxs("div", { children: [_jsx("b", { children: FIELD_LABEL[k] ?? k }), ": ", _jsx("span", { className: "muted", children: show(p.target[k]) }), " \u2192 ", show(v)] }, k))) })] }, p.q.line))) }), _jsx("p", { className: "muted small", children: "Tap a row to see old \u2192 new." })] }), notIn.length > 0 && _jsxs(_Fragment, { children: [_jsx("h3", { children: "In QuickBooks, not matched in the app" }), _jsx("p", { className: "muted small", children: "Skipped unless you pick one. Match it to an app customer if it's the same business under another name." }), _jsx("div", { className: "picklist preview", children: notIn.map(p => (_jsxs("div", { className: `prev qbrow ${p.ch === 'new' ? 's-new' : ''}`, children: [_jsxs("span", { className: "muted", children: ["row ", p.q.line] }), _jsxs("span", { children: [_jsx("b", { children: p.q.qbo_name }), p.q.inactive && _jsx("span", { className: "muted", children: " \u00B7 inactive in QuickBooks" }), _jsx("span", { className: "muted", children: [p.q.email, p.q.phone].filter(Boolean).length ? ' · ' + [p.q.email, p.q.phone].filter(Boolean).join(' · ') : '' })] }), _jsxs("select", { value: p.ch, onChange: e => setChoice(c => ({ ...c, [p.q.line]: e.target.value })), children: [_jsx("option", { value: "skip", children: "Don't import" }), _jsx("option", { value: "new", children: "Add as new customer" }), _jsx("optgroup", { label: "Same as app customer\u2026", children: [...(p.target ? [p.target] : []), ...unmatchedApp].map(c => _jsx("option", { value: `id:${c.id}`, children: c.name }, c.id)) })] })] }, p.q.line))) })] }), unmatchedApp.length > 0 && _jsxs("p", { className: "muted small", children: ["App customers with no QuickBooks match: ", unmatchedApp.map(c => c.name).join(', '), ". They're left as they are."] }), _jsxs("div", { className: "row end", children: [_jsx("button", { className: "ghost", onClick: () => setFile(null), children: "Pick another file" }), _jsx("button", { className: "ghost", onClick: onClose, children: "Cancel" }), _jsx("button", { className: "primary", disabled: busy || updates.length + adds.length === 0, onClick: apply, children: busy ? 'Importing…' : `Import ${updates.length + adds.length}` })] })] })] }) }));
}
