import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Select } from './combo';
import { Fold } from './fold';
import { DEFAULT_CATEGORIES, DEFAULT_NURSERIES, MultiPick, NURSERIES_KEY, PRODUCT_CATEGORIES_KEY, useCatList } from './catlists';
import { StrainProfileEdit, eff, loadProfiles, mmdd, yieldRange } from './strains';
import { useEffect, useMemo, useRef, useState } from 'react';
import { readSheet } from 'read-excel-file/browser';
import { QboCustomerImport } from './qboImport';
import { CustomerLogins } from './custlogins';
import { ItemGeneratorSheet, StrainCodesSheet, StrainMetrcSheet, loadStrainPlan } from './strainMetrc';
const COLS = {
    vehicles: [
        { key: 'name', label: 'Name', kind: 'text', synonyms: ['name', 'vehicle', 'vehicle name', 'truck'] },
        { key: 'plate', label: 'Plate', kind: 'text', synonyms: ['plate', 'license plate', 'plate #', 'plate number', 'tag'] },
        { key: 'kind', label: 'Type', kind: 'text', synonyms: ['type', 'kind', 'vehicle type'], hint: 'Freezer truck, trailer…' },
        { key: 'spaces', label: 'Pallet spaces', kind: 'int', synonyms: ['spaces', 'pallet spaces', 'pallets', 'capacity'] },
        { key: 'across', label: 'Pallets across', kind: 'int', synonyms: ['across', 'pallets across', 'width'], hint: 'usually 2' },
        { key: 'owner', label: 'Owner / carrier', kind: 'text', synonyms: ['owner', 'carrier', 'company'], hint: 'Lifted, or the carrier name' },
        { key: 'notes', label: 'Notes', kind: 'text', synonyms: ['notes', 'note', 'comments'] },
        { key: 'active', label: 'Active', kind: 'active', synonyms: ['active', 'status'] },
    ],
    customers: [
        { key: 'name', label: 'Name', kind: 'text', synonyms: ['name', 'customer', 'customer name', 'company', 'business name'] },
        { key: 'kind', label: 'Internal or external', kind: 'kind', synonyms: ['type', 'kind', 'internal', 'internal/external'] },
        { key: 'license', label: 'License #', kind: 'text', synonyms: ['license', 'license #', 'license number', 'licence', 'state license'] },
        { key: 'address', label: 'Address', kind: 'text', synonyms: ['address', 'location', 'ship to'] },
        { key: 'contact', label: 'Contact', kind: 'text', synonyms: ['contact', 'phone', 'email', 'contact info'] },
        { key: 'qbo_name', label: 'QuickBooks name', kind: 'text', synonyms: ['quickbooks name', 'qbo name', 'qb name', 'quickbooks customer'], hint: 'exactly as in QuickBooks; invoices are matched on it. Import from QuickBooks fills it in' },
        { key: 'legal_name', label: 'Legal name', kind: 'text', synonyms: ['legal name', 'legal', 'entity', 'company legal name'], hint: 'on invoices, if different' },
        { key: 'payment_terms', label: 'Payment terms', kind: 'terms', synonyms: ['payment terms', 'terms', 'net'], hint: 'default for this customer' },
        { key: 'sample_hold_days', label: 'Sample hold (days)', kind: 'int', synonyms: ['sample hold', 'sample hold days', 'hold days'], hint: 'how long a sample order holds product after it ships; blank = 10' },
        { key: 'billing_address', label: 'Billing address', kind: 'area', synonyms: ['billing address', 'bill to', 'billing'] },
        { key: 'billing_contact', label: 'Billing contact', kind: 'text', synonyms: ['billing contact', 'ap contact', 'accounts payable'] },
        { key: 'billing_email', label: 'Billing email', kind: 'text', synonyms: ['billing email', 'ap email', 'invoice email'], hint: 'invoices go here' },
        { key: 'billing_phone', label: 'Billing phone', kind: 'text', synonyms: ['billing phone', 'ap phone'] },
        { key: 'ship_to_name', label: 'Ship-to premises name', kind: 'text', synonyms: ['ship to name', 'premises name', 'receiving premises'] },
        { key: 'ship_to_address', label: 'Ship-to address', kind: 'area', synonyms: ['ship to', 'ship to address', 'shipping address', 'premises address'], hint: 'blank = Address' },
        { key: 'receiving_contact', label: 'Receiving contact', kind: 'text', synonyms: ['receiving contact', 'receiving', 'dock contact'] },
        { key: 'reserves_enabled', label: 'Reserves', kind: 'bool', synonyms: ['reserves', 'reserves enabled', 'has reserves'], hint: 'off: portal ordering from the open menu only' },
        { key: 'price_per_lb', label: 'Price $/lb', kind: 'num', synonyms: ['price', 'price per lb', 'price/lb', '$/lb', 'contract price'], hint: 'fresh frozen contract price, used on orders and invoices; blank = the market price (Sales settings › Market price)' },
        { key: 'contract_lbs', label: 'Contract lbs', kind: 'num', synonyms: ['contract lbs', 'contract', 'contracted lbs'] },
        { key: 'monthly_min_lbs', label: 'Monthly minimum lbs', kind: 'num', synonyms: ['monthly min', 'monthly minimum', 'min lbs'] },
        { key: 'deposit_usd', label: 'Deposit $', kind: 'num', synonyms: ['deposit', 'deposit $', 'deposit usd'] },
        { key: 'storage_fee', label: 'Storage fee', kind: 'num', synonyms: ['storage', 'storage fee'] },
        { key: 'notes', label: 'Notes', kind: 'text', synonyms: ['notes', 'note', 'comments'] },
        { key: 'active', label: 'Active', kind: 'active', synonyms: ['active', 'status'] },
    ],
    strains: [
        { key: 'name', label: 'Name', kind: 'text', synonyms: ['name', 'strain', 'strain name', 'cultivar'] },
        { key: 'aliases', label: 'Other names', kind: 'aliases', synonyms: ['aliases', 'alias', 'other names', 'also known as', 'aka'], hint: 'comma separated' },
        { key: 'show_on_menu', label: 'Show on menu', kind: 'bool', synonyms: ['show on menu', 'on menu', 'menu'], hint: 'off: customers can\'t order new lbs of it' },
        { key: 'trial', label: 'Trial strain', kind: 'bool', synonyms: ['trial', 'trial strain'], hint: 'T pallets; follows it through the crop plan, plantings, harvests and inventory. Turn off when it goes into production.' },
        { key: 'color', label: 'Map color', kind: 'color', synonyms: ['color', 'colour', 'map color', 'hex'], hint: '#RRGGBB' },
        { key: 'notes', label: 'Notes', kind: 'text', synonyms: ['notes', 'note', 'comments', 'lineage'] },
        { key: 'active', label: 'Active', kind: 'active', synonyms: ['active', 'status'] },
    ],
};
// how the Settings › Section picker groups the sections (Msg 296)
const SECTION_GROUPS = [
    ['Lists', ['customers', 'strains', 'locations', 'vehicles', 'nurseries']],
    ['Sales', ['categories', 'terms', 'market', 'contract', 'deadlines', 'shipping', 'fulfill']],
    ['People', ['users', 'logins', 'people', 'perms']],
    ['System', ['licenses', 'alerts', 'app']],
];
const TITLES = { vehicles: 'Vehicles', customers: 'Customers', strains: 'Strains' };
const SINGULAR = { vehicles: 'vehicle', customers: 'customer', strains: 'strain' };
const LOCKED = new Set(['ohr', 'gvr']);
// ---------- value parsing ----------
const norm = (v) => (v == null ? '' : String(v)).trim();
function parseColor(v) {
    if (!v)
        return undefined;
    const m = v.replace(/^#/, '').match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m)
        return null; // invalid
    const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
    return '#' + h.toLowerCase();
}
function parseActive(v) {
    if (!v)
        return undefined;
    return !/^(no|n|false|0|retired|inactive)$/i.test(v);
}
function parseKind(v) {
    if (!v)
        return undefined;
    return /^(internal|int|yes|y|true|1)$/i.test(v) ? 'internal' : 'external';
}
const parseAliases = (v) => v ? v.split(/[,;|]/).map(x => x.trim()).filter(Boolean) : [];
export function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let q = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) {
            if (c === '"' && text[i + 1] === '"') {
                cell += '"';
                i++;
            }
            else if (c === '"')
                q = false;
            else
                cell += c;
        }
        else if (c === '"')
            q = true;
        else if (c === ',') {
            row.push(cell);
            cell = '';
        }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n')
                i++;
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
        }
        else
            cell += c;
    }
    if (cell || row.length) {
        row.push(cell);
        rows.push(row);
    }
    return rows;
}
function buildPlan(list, grid, existing) {
    const cols = COLS[list];
    // header = first row in the top 10 that has a recognisable name column
    let hi = -1, map = {};
    for (let r = 0; r < Math.min(grid.length, 10) && hi < 0; r++) {
        const heads = grid[r].map(h => norm(h).toLowerCase());
        const m = {};
        for (const c of cols) {
            const i = heads.findIndex(h => c.synonyms.includes(h));
            if (i >= 0)
                m[c.key] = i;
        }
        if (m.name != null) {
            hi = r;
            map = m;
        }
    }
    if (hi < 0)
        return { plan: [], found: [], error: `Couldn't find a "${cols[0].label}" column in the first rows. Download the template to see the expected headings.` };
    const byName = new Map(existing.map(e => [e.name.toLowerCase(), e]));
    const seen = new Set();
    const plan = [];
    for (let r = hi + 1; r < grid.length; r++) {
        const get = (k) => map[k] != null ? norm(grid[r][map[k]]) : '';
        const name = get('name');
        if (!name)
            continue;
        const key = name.toLowerCase();
        if (seen.has(key)) {
            plan.push({ line: r + 1, name, status: 'error', msg: 'Listed twice in the file' });
            continue;
        }
        seen.add(key);
        const ex = byName.get(key);
        const row = {};
        let bad = '';
        for (const c of cols) {
            if (c.key === 'name' || map[c.key] == null)
                continue;
            const v = get(c.key);
            if (c.kind === 'text') {
                if (v)
                    row[c.key] = v;
            }
            else if (c.kind === 'bool') {
                const b = parseActive(v);
                if (b !== undefined)
                    row[c.key] = b;
            }
            else if (c.kind === 'num') {
                if (v) {
                    const n = Number(v.replace(/[$,]/g, ''));
                    if (isNaN(n) || n < 0)
                        bad = `"${v}" isn't a number for ${c.label}`;
                    else
                        row[c.key] = n;
                }
            }
            else if (c.kind === 'int') {
                if (v) {
                    const n = parseInt(v, 10);
                    if (!(n > 0))
                        bad = `"${v}" isn't a whole number for ${c.label}`;
                    else
                        row[c.key] = n;
                }
            }
            else if (c.kind === 'active') {
                const a = parseActive(v);
                if (a !== undefined)
                    row.active = a;
            }
            else if (c.kind === 'kind') {
                const k = parseKind(v);
                if (k)
                    row.kind = k;
            }
            else if (c.kind === 'color') {
                const col = parseColor(v);
                if (col === null)
                    bad = `"${v}" isn't a color like #A1B2C3`;
                else if (col)
                    row.color = col;
            }
            else if (c.kind === 'aliases') {
                const al = parseAliases(v);
                if (al.length)
                    row.aliases = [...new Set([...(ex?.aliases ?? []), ...al])];
            }
        }
        if (bad) {
            plan.push({ line: r + 1, name, status: 'error', msg: bad });
            continue;
        }
        if (list === 'customers' && ex && LOCKED.has(key) && ((row.kind && row.kind !== 'internal') || row.active === false)) {
            delete row.kind;
            delete row.active;
        }
        if (!ex) {
            plan.push({ line: r + 1, name, status: 'new', row: { name, ...row } });
            continue;
        }
        const changes = Object.keys(row).filter(k => JSON.stringify(ex[k] ?? null) !== JSON.stringify(row[k]));
        if (!changes.length)
            plan.push({ line: r + 1, name: ex.name, status: 'same' });
        else
            plan.push({ line: r + 1, name: ex.name, status: 'update', changes, row: { id: ex.id, ...Object.fromEntries(changes.map(k => [k, row[k]])) } });
    }
    return { plan, found: cols.filter(c => map[c.key] != null).map(c => c.label) };
}
function downloadTemplate(list, rows) {
    const cols = COLS[list];
    const esc = (v) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const cell = (r, c) => {
        const v = r[c.key];
        if (c.kind === 'active')
            return v === false ? 'No' : 'Yes';
        if (c.kind === 'aliases')
            return v?.join(', ') ?? '';
        return v == null ? '' : String(v);
    };
    const lines = [cols.map(c => c.label), ...rows.map(r => cols.map(c => cell(r, c)))].map(l => l.map(esc).join(','));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${TITLES[list]} - Lifted Inventory.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// ---------- screen ----------
/** A module's Settings: the shared lists it uses (vehicles, customers, strains) plus any extra sections of its own.
 *  The Strains list is the same one in every module that shows it. */
export function SettingsView({ backend, inventoryStrains, onChanged, flash, lists, title, extra, canTerms, focus = 'dist', startOn, home, readOnly }) {
    const [data, setData] = useState(null);
    const [err, setErr] = useState(null);
    const [tab, setTab] = useState(lists[0] ?? 'strains');
    const [q, setQ] = useState('');
    const [showRetired, setShowRetired] = useState(false);
    const [edit, setEdit] = useState(null);
    const profSave = useRef(null); // YLD-12: StrainProfileEdit's save-all, for the sheet's Save
    const [plan, setPlan] = useState(null);
    const [busy, setBusy] = useState(false);
    const [other, setOther] = useState(startOn ?? (lists.length ? null : extra?.[0]?.k ?? null));
    const [qbo, setQbo] = useState(false);
    const [ordF, setOrdF] = useState('all'); // customers table: All / Reserves on / Menu only
    const [terms, setTerms] = useState([]);
    const [metrcFor, setMetrcFor] = useState(null);
    const [codes, setCodes] = useState(false);
    const [gen, setGen] = useState(false);
    const sb = backend.client();
    const cats = useCatList(backend, PRODUCT_CATEGORIES_KEY, DEFAULT_CATEGORIES).list;
    const nurseries = useCatList(backend, NURSERIES_KEY, DEFAULT_NURSERIES).list;
    const [pickOpen, setPickOpen] = useState(false);
    const [catF, setCatF] = useState('');
    const [where, setWhere] = useState('all');
    // strains in the nursery (active mothers) and in the field (this crop year's plantings). Outside nurseries = the strain card's Nurseries.
    const [grow, setGrow] = useState(null);
    useEffect(() => {
        if (!lists.includes('strains') || !sb)
            return;
        const y = new Date().getFullYear();
        Promise.all([sb.from('nursery_mothers').select('strain').eq('status', 'active'), sb.from('cult_plantings').select('strain').gte('crop_year', y)]).then(([m, p]) => {
            const lc = (x) => x.trim().toLowerCase();
            const pl = (p.data ?? []);
            setGrow({ moms: new Set((m.data ?? []).map(r => lc(r.strain))), field: new Set(pl.map(r => lc(r.strain))) });
        }).catch(() => { });
    }, []);
    // customer balances: QuickBooks' balance when production is connected, else the app's open invoices
    const [bal, setBal] = useState(new Map());
    useEffect(() => {
        if (!lists.includes('customers') || !sb)
            return;
        Promise.all([sb.from('acct_customer_balances').select('customer_id,balance').eq('env', 'production'), sb.from('invoices').select('customer_id,total').eq('status', 'open')]).then(([q, i]) => {
            const m = new Map();
            const qb = (q.data ?? []);
            if (qb.length)
                qb.forEach(r => { if (r.balance != null)
                    m.set(r.customer_id, Number(r.balance)); });
            else
                (i.data ?? []).forEach(r => m.set(r.customer_id, (m.get(r.customer_id) ?? 0) + Number(r.total)));
            setBal(m);
        }).catch(() => { });
    }, []);
    // each customer's last order date (newest first, a page at a time)
    const [last, setLast] = useState(new Map());
    useEffect(() => {
        if (!lists.includes('customers') || !sb)
            return;
        (async () => {
            const m = new Map();
            for (let from = 0; from < 20000; from += 1000) {
                const { data: o, error } = await sb.from('orders').select('customer_id,order_date').not('status', 'in', '(draft,cancelled)').not('order_date', 'is', null)
                    .order('order_date', { ascending: false }).range(from, from + 999);
                if (error || !o?.length)
                    break;
                for (const x of o)
                    if (!m.has(x.customer_id))
                        m.set(x.customer_id, x.order_date.slice(0, 10));
                if (o.length < 1000)
                    break;
            }
            setLast(m);
        })().catch(() => { });
    }, []);
    useEffect(() => { if (lists.includes('customers'))
        backend.paymentTerms().then(t => setTerms(t.filter(x => x.active))).catch(() => { }); }, []);
    const [carriers, setCarriers] = useState([]);
    useEffect(() => { if (lists.includes('customers'))
        sb?.rpc('pickup_carriers').then(({ data }) => setCarriers((data ?? [])), () => { }); }, []);
    const load = () => backend.loadSettings().then(d => { setData(d); setErr(null); }).catch(e => setErr(String(e?.message ?? e)));
    useEffect(() => { load(); }, []);
    const [profiles, setProfiles] = useState(new Map());
    const loadProfilesNow = () => { if (lists.includes('strains'))
        loadProfiles(backend.client()).then(setProfiles); };
    useEffect(loadProfilesNow, []);
    const rows = (data?.[tab] ?? []);
    const names = (r) => [r.name, ...((r.aliases) ?? [])].map(x => x.trim().toLowerCase());
    const inWhere = (r) => tab !== 'strains' || where === 'all' ? true
        : where === 'inv' ? palletsOf(r, inventoryStrains) > 0
            : where === 'nurs' ? names(r).some(n => grow?.moms.has(n))
                : where === 'field' ? names(r).some(n => grow?.field.has(n))
                    : (r.nurseries ?? []).some(x => !/^1PN$/i.test(x.trim()));
    const shown = rows.filter(r => (showRetired || r.active) && inWhere(r) && (tab !== 'customers' || !catF || (r.product_categories ?? []).includes(catF))
        && (!q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase())));
    // strains on pallets that the list doesn't know (by name or other name)
    const unknownStrains = useMemo(() => {
        if (!data)
            return [];
        const known = new Set(data.strains.flatMap(s => [s.name, ...(s.aliases ?? [])]).map(x => x.toLowerCase()));
        return [...inventoryStrains.entries()].filter(([n]) => !known.has(n.toLowerCase())).map(([n]) => n);
    }, [data, inventoryStrains]);
    async function save(row) {
        setBusy(true);
        try {
            // YLD-12: the sheet's Save also saves the strain profile folds (yields, spot price, photo, note...); Retire / Restore doesn't
            const retireOnly = Object.keys(row).every(k => k === 'id' || k === 'active');
            if (tab === 'strains' && row.id && !retireOnly && profSave.current && !(await profSave.current()))
                return;
            // strain type goes through set_strain_type (it also sets METRC's indica / sativa %), not a plain update
            const st = tab === 'strains' && 'strain_type' in row ? row.strain_type ?? null : undefined;
            const was = tab === 'strains' ? ((data?.strains ?? []).find(x => x.id === row.id)?.strain_type ?? null) : null;
            const plain = { ...row };
            delete plain.strain_type;
            await backend.saveRow(tab, plain);
            if (st !== undefined && st !== was && row.id && sb) {
                const { error } = await sb.rpc('set_strain_type', { p_strain: row.id, p_type: st });
                if (error)
                    throw new Error(error.message);
            }
            await load();
            onChanged();
            setEdit(null);
            flash('Saved');
            // a new strain: show what METRC needs for it (only to people who can send it)
            if (tab === 'strains' && !row.id && sb) {
                const { data: made } = await sb.from('strains').select('id').ilike('name', String(row.name ?? '').trim().replace(/[%_\\]/g, m => `\\${m}`)).limit(1);
                const id = made?.[0]?.id;
                if (id)
                    loadStrainPlan(sb, id, {}).then(p => { if (p.can_send)
                        setMetrcFor({ id, isNew: true }); }).catch(() => { });
            }
        }
        catch (e) {
            flash(e.message, true);
        }
        finally {
            setBusy(false);
        }
    }
    async function addMissing() {
        setBusy(true);
        try {
            for (const n of unknownStrains)
                await backend.saveRow('strains', { name: n });
            await load();
            onChanged();
            flash(`${unknownStrains.length} strains added`);
        }
        catch (e) {
            flash(e.message, true);
        }
        finally {
            setBusy(false);
        }
    }
    async function pickFile(f) {
        try {
            const grid = /\.csv$/i.test(f.name)
                ? parseCsv((await f.text()).replace(/^﻿/, ''))
                : (await readSheet(f)).map(r => r.map(c => c instanceof Date ? c.toISOString().slice(0, 10) : norm(c)));
            const res = buildPlan(tab, grid, rows);
            if (res.error) {
                flash(res.error, true);
                return;
            }
            setPlan({ rows: res.plan, found: res.found, file: f.name });
        }
        catch (e) {
            flash(`Couldn't read ${f.name}: ${e.message}`, true);
        }
    }
    async function applyPlan() {
        if (!plan)
            return;
        setBusy(true);
        let done = 0;
        try {
            for (const r of plan.rows)
                if ((r.status === 'new' || r.status === 'update') && r.row) {
                    await backend.saveRow(tab, r.row);
                    done++;
                }
            await load();
            onChanged();
            setPlan(null);
            flash(`Imported ${done} ${TITLES[tab].toLowerCase()}`);
        }
        catch (e) {
            await load();
            flash(`Stopped after ${done}: ${e.message}`, true);
        }
        finally {
            setBusy(false);
        }
    }
    if (err)
        return _jsxs("div", { className: "list", children: [_jsx("h2", { children: "Settings" }), _jsxs("div", { className: "warnbox", children: ["Settings aren't set up in the database yet. Run the 003_settings.sql update in Supabase, then refresh. (", err, ")"] })] });
    if (!data)
        return _jsx("div", { className: "muted", children: "Loading settings\u2026" });
    return (_jsxs("div", { className: "list settings", children: [(() => {
                // Msg 296: one "Settings › Section ▾" picker instead of a row of tabs, sections grouped
                const secs = [...lists.map(t => ({ k: `list:${t}`, l: TITLES[t], n: data[t].filter(r => r.active).length, go: () => { setTab(t); setQ(''); setOther(null); }, on: t === tab && !other })),
                    ...(extra ?? []).map(x => ({ k: x.k, l: x.l, n: null, go: () => setOther(x.k), on: other === x.k }))];
                const cur = secs.find(x => x.on) ?? secs[0];
                const groups = SECTION_GROUPS.map(([g, keys]) => ({ g, items: secs.filter(x => keys.includes(x.k.replace(/^list:/, ''))) })).filter(x => x.items.length);
                const rest = secs.filter(x => !SECTION_GROUPS.some(([, keys]) => keys.includes(x.k.replace(/^list:/, ''))));
                if (rest.length)
                    groups.push({ g: 'More', items: rest });
                if (home)
                    return _jsxs("div", { className: "setpick-h home", children: [_jsx("h2", { children: title }), secs.length > 1 && _jsx("div", { className: "seg", children: secs.map(x => _jsxs("button", { className: x.on ? 'on' : '', onClick: x.go, children: [x.l, x.n != null && _jsxs("span", { className: "muted", children: [" ", x.n] })] }, x.k)) })] });
                return _jsxs("div", { className: "setpick-h", children: [_jsx("h2", { children: _jsxs("span", { className: "muted", children: [title.replace(/ settings$/, ''), " settings \u203A"] }) }), secs.length > 1 ? _jsxs("span", { className: "setpick-w", children: [_jsxs("button", { className: "setpick-btn", "aria-haspopup": "menu", "aria-expanded": pickOpen, onClick: () => setPickOpen(!pickOpen), children: [cur?.l, cur?.n != null && _jsxs("span", { className: "muted", children: [" ", cur.n] }), " \u25BE"] }), pickOpen && _jsxs(_Fragment, { children: [_jsx("div", { className: "modscrim", onClick: () => setPickOpen(false) }), _jsx("div", { className: "setpick-menu", role: "menu", children: groups.map(gr => _jsxs("div", { children: [_jsx("div", { className: "setpick-g", children: gr.g }), gr.items.map(x => _jsxs("button", { role: "menuitem", className: x.on ? 'on' : '', onClick: () => { x.go(); setPickOpen(false); }, children: [x.l, x.n != null && _jsxs("span", { className: "muted", children: [" ", x.n] })] }, x.k))] }, gr.g)) })] })] }) : _jsx("h2", { children: cur?.l })] });
            })(), other ? extra?.find(x => x.k === other)?.node : _jsxs(_Fragment, { children: [_jsxs("div", { className: "row toolbar", children: [_jsx("input", { className: "search", type: "search", placeholder: `Search ${TITLES[tab].toLowerCase()}`, value: q, onChange: e => setQ(e.target.value) }), tab === 'customers' && !readOnly && _jsx("button", { className: "ghost", onClick: () => setQbo(true), children: "Import from QuickBooks" }), tab === 'strains' && sb && _jsx("button", { className: "ghost", onClick: () => setCodes(true), children: "METRC codes" }), tab === 'strains' && sb && _jsx("button", { className: "ghost", onClick: () => setGen(true), children: "METRC item generator" }), !readOnly && _jsx("button", { className: "primary", onClick: () => setEdit(tab === 'customers' ? { kind: 'external', active: true } : tab === 'strains' ? { aliases: [], active: true, show_on_menu: true } : { active: true, spaces: 8, across: 2 }), children: "+ Add" })] }), !readOnly && _jsxs(Fold, { id: `set.${tab}.tools`, title: "Import, export and retired", children: [_jsxs("div", { className: "row toolbar", children: [_jsxs("label", { className: "ghost small filebtn", children: ["Import spreadsheet", _jsx("input", { type: "file", accept: ".xlsx,.xlsm,.csv", onChange: e => { const f = e.target.files?.[0]; e.target.value = ''; if (f)
                                                    pickFile(f); } })] }), _jsx("button", { className: "ghost small", onClick: () => downloadTemplate(tab, rows), children: "Download as spreadsheet" }), _jsxs("label", { className: "check small-check", children: [_jsx("input", { type: "checkbox", checked: showRetired, onChange: e => setShowRetired(e.target.checked) }), " Show retired"] })] }), _jsxs("p", { className: "muted", children: ["Import adds new ", TITLES[tab].toLowerCase(), " and updates existing ones by name. Blank cells don't overwrite anything. The download doubles as a template."] })] }), tab === 'strains' && unknownStrains.length > 0 && (_jsxs("div", { className: "warnbox", children: [unknownStrains.length, " strain", unknownStrains.length > 1 ? 's' : '', " on pallets ", unknownStrains.length > 1 ? "aren't" : "isn't", " in the list: ", unknownStrains.slice(0, 6).join(', '), unknownStrains.length > 6 ? '…' : '', ". ", _jsxs("a", { onClick: addMissing, children: ["Add ", unknownStrains.length > 1 ? 'them' : 'it'] }), ", or add ", unknownStrains.length > 1 ? 'them' : 'it', " as another name on an existing strain."] })), shown.length === 0 && _jsx("p", { className: "muted", children: "Nothing here yet. Add one, or import a spreadsheet." }), tab === 'customers' && _jsx("div", { className: "seg setf", role: "group", "aria-label": "What they buy", children: ['', ...cats].map(k => _jsx("button", { className: catF === k ? 'on' : '', onClick: () => setCatF(k), children: k || 'Any category' }, k || 'any')) }), tab === 'strains' && _jsx("div", { className: "seg setf", role: "group", "aria-label": "Where", children: [['all', 'All'], ['inv', 'In inventory'], ['nurs', 'In the nursery'], ['field', 'In the field'], ['out', 'Outside nurseries']].map(([k, l]) => _jsx("button", { className: where === k ? 'on' : '', onClick: () => setWhere(k), children: l }, k)) }), tab === 'customers' && shown.length > 0 && (() => {
                        const ext = shown.filter(c => c.active && c.kind !== 'internal');
                        return _jsx("div", { className: "seg setf", role: "group", "aria-label": "Ordering", children: [['all', 'All', ext.length], ['res', 'Reserves on', ext.filter(c => c.reserves_enabled).length], ['menu', 'Menu only', ext.filter(c => !c.reserves_enabled).length]].map(([k, l, n]) => _jsxs("button", { className: ordF === k ? 'on' : '', onClick: () => setOrdF(k), children: [l, " ", _jsx("span", { className: "segn", children: n })] }, k)) });
                    })(), groupsOf(tab, shown, inventoryStrains).map(([gk, gl, gr]) => gr.length > 0 && (_jsx(Fold, { id: `set.${tab}.${gk}`, title: gl, count: gr.length, open: gk === 'main', force: !!q || (!!home && gk === 'main'), children: _jsx(SetTable, { list: tab, rows: gr.filter(r => tab !== 'customers' || gk !== 'main' || ordF === 'all' || (r.reserves_enabled ? 'res' : 'menu') === ordF), terms: terms, profiles: profiles, inv: inventoryStrains, focus: focus, onOpen: r => setEdit(structuredClone(r)), bal: bal, last: last, sel: edit?.id ?? null }) }, gk))), edit && _jsx(EditForm, { readOnly: readOnly, list: tab, row: edit, busy: busy, onClose: () => setEdit(null), onSave: save, terms: terms, carriers: carriers, cats: cats, nurseries: nurseries, tabExtra: tab === 'customers' && edit.id != null && edit.kind !== 'internal' ? {
                            contract: canTerms && !readOnly ? _jsx(TermsByYear, { backend: backend, c: edit }) : null,
                            logins: readOnly ? null : _jsx(CustomerLogins, { backend: backend, customerId: edit.id, customerName: String(edit.name ?? ''), flash: flash })
                        } : undefined, extra: tab === 'customers' ? null
                            : tab === 'strains' && edit.id != null ? _jsxs(_Fragment, { children: [sb && _jsx("div", { className: "row", style: { margin: '6px 0 10px' }, children: _jsx("button", { className: "ghost small", onClick: () => { const id = edit.id; setEdit(null); setMetrcFor({ id, isNew: false }); }, children: "METRC: strain and items on every license" }) }), profiles.get(edit.id) && _jsx(StrainProfileEdit, { sb: backend.client(), p: profiles.get(edit.id), flash: flash, onSaved: loadProfilesNow, saveRef: profSave })] }) : null }, `${tab}-${edit.id ?? 'new'}`), metrcFor && sb && _jsx(StrainMetrcSheet, { sb: sb, strainId: metrcFor.id, isNew: metrcFor.isNew, flash: flash, onClose: () => { setMetrcFor(null); load(); } }), codes && sb && _jsx(StrainCodesSheet, { sb: sb, onClose: () => setCodes(false) }), gen && sb && _jsx(ItemGeneratorSheet, { sb: sb, flash: flash, onClose: () => setGen(false) }), plan && _jsx(ImportPreview, { list: tab, plan: plan, busy: busy, onClose: () => setPlan(null), onApply: applyPlan }), qbo && tab === 'customers' && _jsx(QboCustomerImport, { backend: backend, customers: rows, terms: terms, flash: flash, onDone: () => { load(); onChanged(); }, onClose: () => setQbo(false) })] })] }));
}
const palletsOf = (s, inv) => [s.name, ...(s.aliases ?? [])].reduce((a, x) => a + (inv.get(x) ?? [...inv.entries()].find(([k]) => k.toLowerCase() === x.toLowerCase())?.[1] ?? 0), 0);
const money = (v, d = 2) => (v == null ? null : `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`);
const cityOf = (a) => { const p = (a ?? '').split(',').map(x => x.trim()); return p.length >= 3 ? p[p.length - 2] : null; };
function setCols(list, terms, profiles, inv, focus, bal, last) {
    if (list === 'customers') {
        const C = (r) => r;
        return [
            { k: 'name', l: 'Customer', v: r => r.name, cell: r => _jsxs(_Fragment, { children: [_jsx("b", { children: r.name }), !r.active && _jsx("span", { className: "muted", children: " \u00B7 retired" })] }) },
            { k: 'bal', l: 'Balance', num: true, slim: true, v: r => bal?.get(r.id) ?? null, cell: r => bal?.has(r.id) ? money(bal.get(r.id)) : null },
            { k: 'last', l: 'Last order', slim: true, v: r => last?.get(r.id) ?? null, cell: r => last?.has(r.id) ? new Date(last.get(r.id) + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' }) : null },
            { k: 'ord', l: 'Ordering', v: r => C(r).kind === 'internal' ? 'Internal' : C(r).reserves_enabled ? 'Reserves on' : 'Menu only',
                cell: r => C(r).kind === 'internal' ? _jsx("span", { className: "pill", children: "Internal" }) : _jsx("span", { className: `pill ${C(r).reserves_enabled ? 'p-res' : ''}`, children: C(r).reserves_enabled ? 'Reserves on' : 'Menu only' }) },
            { k: 'terms', l: 'Terms', v: r => { const c = C(r).payment_terms; return c ? terms.find(t => t.code === c)?.label ?? c : null; } },
            { k: 'price', l: '$ / lb', num: true, v: r => C(r).price_per_lb ?? null, cell: r => money(C(r).price_per_lb) },
            { k: 'cl', l: 'Contract lbs', num: true, v: r => C(r).contract_lbs ?? null, cell: r => C(r).contract_lbs == null ? null : Number(C(r).contract_lbs).toLocaleString() },
            { k: 'mm', l: 'Monthly min', num: true, v: r => C(r).monthly_min_lbs ?? null, cell: r => C(r).monthly_min_lbs == null ? null : Number(C(r).monthly_min_lbs).toLocaleString() },
            { k: 'dep', l: 'Deposit', num: true, v: r => C(r).deposit_usd ?? null, cell: r => money(C(r).deposit_usd, 0) },
            { k: 'lic', l: 'License', v: r => C(r).license, cell: r => C(r).license && _jsx("span", { className: "mono", children: C(r).license }) },
            { k: 'city', l: 'City', v: r => cityOf(C(r).address) },
            { k: 'contact', l: 'Contact', v: r => C(r).contact },
            { k: 'be', l: 'Billing email', v: r => C(r).billing_email, cell: r => C(r).billing_email && _jsx("span", { className: "trunc", children: C(r).billing_email }) },
            { k: 'qbo', l: 'QuickBooks name', v: r => C(r).qbo_name },
        ];
    }
    if (list === 'vehicles') {
        const V = (r) => r;
        return [
            { k: 'name', l: 'Vehicle', v: r => r.name, cell: r => _jsxs(_Fragment, { children: [_jsx("b", { children: r.name }), !r.active && _jsx("span", { className: "muted", children: " \u00B7 retired" })] }) },
            { k: 'spaces', l: 'Spaces', num: true, v: r => V(r).spaces ?? null },
            { k: 'across', l: 'Across', num: true, v: r => V(r).across ?? null },
            { k: 'owner', l: 'Owner', v: r => V(r).owner },
            { k: 'kind', l: 'Kind', v: r => V(r).kind },
            { k: 'plate', l: 'Plate', v: r => V(r).plate, cell: r => V(r).plate && _jsx("span", { className: "mono", children: V(r).plate }) },
            { k: 'notes', l: 'Notes', v: r => V(r).notes, cell: r => V(r).notes && _jsx("span", { className: "trunc", children: V(r).notes }) },
        ];
    }
    const S = (r) => r, P = (r) => profiles.get(r.id);
    const n = (x, d = 1) => { const v = r1(x, d); return v == null ? null : Number(v); };
    const all = [
        { k: 'name', l: 'Strain', v: r => r.name, cell: r => {
                const ph = P(r)?.set?.photo_url;
                return _jsxs("span", { className: "stcell", children: [ph ? _jsx("img", { className: "sthumb sm", src: ph, alt: "", loading: "lazy" }) : _jsx("span", { className: "sthumb sm init", style: { background: S(r).color || `hsl(${hueOf(r.name)} 35% var(--thumb-l))` }, children: initials(r.name) }), _jsx("b", { children: r.name })] });
            } },
        { k: 'code', l: 'Code', v: r => S(r).code ?? null, cell: r => S(r).code && _jsx("span", { className: "pill", children: S(r).code }) },
        { k: 'status', l: 'Status', v: r => !r.active ? 'Retired' : S(r).trial ? 'Trial' : S(r).show_on_menu === false ? 'Hidden' : 'On menu',
            cell: r => !r.active ? _jsx("span", { className: "pill", children: "Retired" }) : _jsxs(_Fragment, { children: [S(r).trial && _jsx("span", { className: "pill s-trial", children: "Trial" }), " ", S(r).show_on_menu === false ? _jsx("span", { className: "pill", children: "Hidden" }) : _jsx("span", { className: "pill p-res", children: "On menu" })] }) },
        { k: 'pallets', l: 'Pallets', num: true, v: r => palletsOf(S(r), inv) || null },
        // 325: shows the low–high range; sorts by the low
        { k: 'sl', l: 'Yield to SHO %', num: true, v: r => n(P(r)?.set?.solventless_pct ?? P(r)?.set?.solventless_high_pct), cell: r => yieldRange(P(r)?.set?.solventless_pct, P(r)?.set?.solventless_high_pct).replace('%', '') || null },
        { k: 'hc', l: 'Yield to BHO %', num: true, v: r => n(P(r)?.set?.hydrocarbon_pct ?? P(r)?.set?.hydrocarbon_high_pct), cell: r => yieldRange(P(r)?.set?.hydrocarbon_pct, P(r)?.set?.hydrocarbon_high_pct).replace('%', '') || null },
        { k: 'y', l: 'Lbs / plant', num: true, v: r => n(eff(P(r), 'yield_lbs_plant'), 2) },
        { k: 'ro', l: 'Rooting %', num: true, v: r => n(eff(P(r), 'rooting_pct'), 0) },
        { k: 'cu', l: 'Cuts / mother', num: true, v: r => n(eff(P(r), 'cuts_per_plant'), 0) },
        { k: 'hv', l: 'Harvest', v: r => eff(P(r), 'harvest_mmdd') ?? null, cell: r => { const h = eff(P(r), 'harvest_mmdd'); return h ? `~${mmdd(h)}` : null; } },
        { k: 'type', l: 'Type', v: r => S(r).strain_type ?? null, cell: r => S(r).strain_type ? _jsx("span", { className: "pill", title: S(r).strain_type, children: TYPE_SHORT5[S(r).strain_type] ?? S(r).strain_type }) : null },
        { k: 'lin', l: 'Lineage', v: r => S(r).lineage ?? null, cell: r => S(r).lineage && _jsx("span", { className: "trunc", children: S(r).lineage }) },
        { k: 'nur', l: 'Nurseries', v: r => S(r).nurseries?.join(', ') || null, cell: r => S(r).nurseries?.length ? _jsx("span", { className: "trunc", children: S(r).nurseries.join(', ') }) : null },
        { k: 'aka', l: 'Other names', v: r => S(r).aliases?.join(', ') || null, cell: r => S(r).aliases?.length ? _jsx("span", { className: "trunc muted", children: S(r).aliases.join(', ') }) : null },
    ];
    // each module sees the numbers it works with (Msg 295)
    const BY = {
        dist: ['pallets', 'hv', 'type', 'aka'],
        sales: ['pallets', 'sl', 'hc', 'type', 'lin'],
        cult: ['y', 'hv', 'type', 'lin', 'nur'],
        nurs: ['ro', 'cu', 'type', 'lin', 'nur'],
    };
    const keep = ['name', 'code', 'status', ...BY[focus]];
    return keep.map(k => all.find(x => x.k === k)).filter(Boolean).map(x => (x.k === 'code' || x.k === 'type' ? { ...x, slim: true } : x));
}
function SetTable({ list, rows, terms, profiles, inv, focus, onOpen, bal, last, sel }) {
    const cols = setCols(list, terms, profiles, inv, focus, bal, last);
    const [sort, setSort] = useState({ k: 'name', dir: 1 });
    const c = cols.find(x => x.k === sort.k) ?? cols[0];
    const sorted = [...rows].sort((a, b) => {
        const x = c.v(a), y = c.v(b);
        if (x == null && y == null)
            return 0;
        if (x == null)
            return 1;
        if (y == null)
            return -1;
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * sort.dir;
    });
    if (!rows.length)
        return _jsx("p", { className: "muted", children: "None." });
    return (_jsx("div", { className: "cwrap settable-w", children: _jsxs("table", { className: `ctable settable slimmable t-${list}`, children: [_jsx("thead", { children: _jsx("tr", { children: cols.map((x, i) => _jsx("th", { className: `${x.num ? 'num' : ''} ${i === 0 ? 'pin' : ''} ${i === 0 || x.slim ? 'slim' : ''}`, "aria-sort": sort.k === x.k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none', children: _jsxs("button", { onClick: () => setSort(s => ({ k: x.k, dir: s.k === x.k ? -s.dir : 1 })), children: [x.l, sort.k === x.k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''] }) }, x.k)) }) }), _jsx("tbody", { children: sorted.map(r => _jsx("tr", { className: `tap ${r.active ? '' : 'retired'} ${sel != null && r.id === sel ? 'sel' : ''}`, tabIndex: 0, onClick: () => onOpen(r), onKeyDown: e => { if (e.key === 'Enter')
                            onOpen(r); }, children: cols.map((x, i) => { const v = x.cell ? x.cell(r) : x.v(r); return _jsx("td", { className: `${x.num ? 'num' : ''} ${i === 0 ? 'pin' : ''} ${i === 0 || x.slim ? 'slim' : ''}`, children: v == null || v === '' || v === false ? _jsx("span", { className: "muted", children: "\u2014" }) : typeof v === 'number' ? v.toLocaleString() : v }, x.k); }) }, r.id)) })] }) }));
}
const r1 = (x, d = 1) => (x == null ? null : String(Math.round(Number(x) * 10 ** d) / 10 ** d));
/** the order strain numbers show in, per module (first ones matter most there) */
const initials = (n) => (n.replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('') || '?').toUpperCase();
/** a steady pastel per strain when it has no color of its own */
const hueOf = (n) => [...n].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
/** one strain in the Settings list: photo (or initials), name and tags, then the numbers that matter in this module */
/** the folds a list splits into: [key, title, rows] */
function groupsOf(list, rows, inv) {
    if (list === 'strains') {
        const st = rows;
        const has = (s) => [s.name, ...(s.aliases ?? [])].some(x => (inv.get(x) ?? [...inv.entries()].find(([k]) => k.toLowerCase() === x.toLowerCase())?.[1] ?? 0) > 0);
        return [['main', 'In the freezers', st.filter(r => r.active && r.show_on_menu !== false && has(r))], ['menu', 'On the menu, none in the freezers', st.filter(r => r.active && r.show_on_menu !== false && !has(r))], ['hidden', 'Hidden from menu', st.filter(r => r.active && r.show_on_menu === false)],
            ['retired', 'Retired', st.filter(r => !r.active)]];
    }
    if (list === 'customers') {
        const cs = rows;
        return [['main', 'Customers', cs.filter(r => r.active && r.kind !== 'internal')], ['internal', 'Our sites and labs', cs.filter(r => r.active && r.kind === 'internal')], ['retired', 'Retired', cs.filter(r => !r.active)]];
    }
    return [['main', TITLES[list], rows.filter(r => r.active)], ['retired', 'Retired', rows.filter(r => !r.active)]];
}
// the customer form, split into tabs (Msg 296)
const CUST_TAB = { billing_address: 'billing', billing_contact: 'billing', billing_email: 'billing', billing_phone: 'billing',
    ship_to_name: 'shipping', ship_to_address: 'shipping', receiving_contact: 'shipping',
    payment_terms: 'contract', sample_hold_days: 'contract', reserves_enabled: 'contract', price_per_lb: 'contract', contract_lbs: 'contract', monthly_min_lbs: 'contract', deposit_usd: 'contract', storage_fee: 'contract' };
const STRAIN_TYPES_5 = ['Indica', 'Indica Hybrid', 'Hybrid', 'Sativa Hybrid', 'Sativa'];
const TYPE_SHORT5 = { Indica: 'I', 'Indica Hybrid': 'I/H', Hybrid: 'H', 'Sativa Hybrid': 'S/H', Sativa: 'S' };
export function EditForm({ list, row, busy, onClose, onSave, extra, terms, carriers, cats, nurseries, tabExtra, readOnly }) {
    const [r, setR] = useState(row);
    const [touched, setTouched] = useState(new Set());
    const set = (k, v) => { setR(x => ({ ...x, [k]: v })); setTouched(t => new Set(t).add(k)); };
    const locked = list === 'customers' && row.id != null && LOCKED.has(String(row.name).toLowerCase());
    const [aliasText, setAliasText] = useState((row.aliases ?? []).join(', '));
    const colorOk = !r.color || /^#[0-9a-f]{6}$/i.test(String(r.color));
    const [ctab, setCtab] = useState('overview');
    const isCust = list === 'customers', ext = isCust && r.kind !== 'internal';
    function submit() {
        const out = { ...r, name: String(r.name ?? '').trim() };
        for (const k of Object.keys(out))
            if (typeof out[k] === 'string' && k !== 'name')
                out[k] = out[k].trim() || null;
        if (list === 'strains')
            out.aliases = parseAliases(aliasText);
        // the new fields (296) only go out once they exist or someone set them
        for (const k of ['product_categories', 'lineage', 'nurseries'])
            if (!(k in row) && !touched.has(k))
                delete out[k];
        onSave(out);
    }
    const fieldFor = (c) => (_jsxs("div", { className: "field", children: [_jsxs("label", { children: [c.label, c.hint && _jsxs("span", { className: "muted", children: [" (", c.hint, ")"] })] }), c.kind === 'kind' ? (_jsx("div", { className: "choices", children: ['external', 'internal'].map(k => (_jsx("button", { disabled: locked, className: r.kind === k ? 'on' : '', onClick: () => set('kind', k), children: k === 'internal' ? 'Internal (our site or lab)' : 'External customer' }, k))) })) : c.kind === 'aliases' ? (_jsx("input", { value: aliasText, onChange: e => setAliasText(e.target.value), placeholder: "e.g. KLP, Key Lime" })) : c.kind === 'color' ? (_jsxs("div", { className: "row", children: [_jsx("input", { type: "color", value: colorOk && r.color ? String(r.color) : '#cccccc', onChange: e => set('color', e.target.value) }), _jsx("input", { style: { flex: 1 }, value: String(r.color ?? ''), placeholder: "Auto", onChange: e => set('color', e.target.value) }), Boolean(r.color) && _jsx("button", { className: "ghost small", onClick: () => set('color', null), children: "Auto" })] })) : c.kind === 'area' ? (_jsx("textarea", { rows: 3, value: String(r[c.key] ?? ''), onChange: e => set(c.key, e.target.value) })) : c.kind === 'terms' ? (_jsxs(Select, { value: String(r[c.key] ?? ''), onChange: e => set(c.key, e.target.value || null), children: [_jsx("option", { value: "", children: "Due on receipt (default)" }), (terms ?? []).map(t => _jsx("option", { value: t.code, children: t.label }, t.code))] })) : c.kind === 'bool' ? (_jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: Boolean(r[c.key] ?? c.key === 'show_on_menu'), onChange: e => set(c.key, e.target.checked) }), " On"] })) : c.kind === 'num' ? (_jsx("input", { type: "number", min: "0", step: "any", value: String(r[c.key] ?? ''), onChange: e => set(c.key, e.target.value === '' ? null : Number(e.target.value)) })) : c.kind === 'int' ? (_jsx("input", { type: "number", min: "1", step: "1", value: String(r[c.key] ?? ''), onChange: e => set(c.key, e.target.value === '' ? null : parseInt(e.target.value, 10)) })) : (_jsx("input", { value: String(r[c.key] ?? ''), disabled: locked && c.key === 'name', autoFocus: c.key === 'name', onChange: e => set(c.key, e.target.value) }))] }, c.key));
    const cols = COLS[list].filter(c => c.kind !== 'active');
    const carrier = ext && _jsxs("div", { className: "field", children: [_jsxs("label", { children: ["Pickup carrier ", _jsx("span", { className: "muted", children: "(who picks up for them; fills in the driver, truck and transport license on a Customer pickup. Vehicles \u203A Carriers)" })] }), _jsxs(Select, { value: r.pickup_carrier_id == null ? '' : String(r.pickup_carrier_id), onChange: e => set('pickup_carrier_id', e.target.value ? Number(e.target.value) : null), children: [_jsx("option", { value: "", children: "None" }), (carriers ?? []).map(k => _jsxs("option", { value: k.id, children: [k.name, k.license_no ? ` · ${k.license_no}` : ''] }, k.id))] })] });
    const tabs = [['overview', 'Overview'], ['billing', 'Billing'], ['shipping', 'Shipping'], ['contract', 'Contract and terms'], ...(tabExtra?.logins ? [['logins', 'Portal logins']] : [])];
    return (_jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: `sheet form ${isCust || list === 'strains' ? 'big side' : ''}`, onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsx("h2", { children: row.id ? (String(row.name ?? '') || `Edit ${SINGULAR[list]}`) : `Add ${SINGULAR[list]}` }), _jsx("button", { className: "ghost", onClick: onClose, children: "\u2715" })] }), isCust ? _jsxs(_Fragment, { children: [_jsx("nav", { className: "ftabs", children: tabs.map(([k, l]) => _jsx("button", { className: ctab === k ? 'on' : '', onClick: () => setCtab(k), children: l }, k)) }), _jsxs("fieldset", { className: "rofs", disabled: !!readOnly, children: [ctab === 'overview' && ext && _jsxs("div", { className: "field fsec", children: [_jsxs("label", { children: ["What they buy ", _jsx("span", { className: "muted", children: "(product categories; Sales admins edit the list in Sales settings \u203A Product categories)" })] }), _jsx(MultiPick, { options: cats ?? [], value: r.product_categories ?? [], onChange: v => set('product_categories', v) })] }), _jsx("div", { className: "fgrid", children: cols.filter(c => (CUST_TAB[c.key] ?? 'overview') === ctab).map(fieldFor) }), ctab === 'shipping' && carrier] }), ctab === 'contract' && tabExtra?.contract, ctab === 'logins' && tabExtra?.logins] }) : list === 'strains' ? _jsxs(_Fragment, { children: [_jsx("div", { className: "fgrid", children: cols.filter(c => ['name', 'aliases'].includes(c.key)).map(fieldFor) }), _jsxs("div", { className: "field fsec", children: [_jsxs("label", { children: ["Type ", _jsx("span", { className: "muted", children: "(one; shows on the menus in the app and the customer portal)" })] }), _jsx("div", { className: "mpick", children: STRAIN_TYPES_5.map(t => {
                                        const on = r.strain_type === t;
                                        return _jsxs("button", { type: "button", className: `mpick-b ${on ? 'on' : ''}`, "aria-pressed": on, onClick: () => set('strain_type', on ? null : t), children: [_jsx("i", { children: on ? '✓' : '' }), t, " (", TYPE_SHORT5[t], ")"] }, t);
                                    }) })] }), _jsxs("div", { className: "fgrid", children: [_jsxs("div", { className: "field", children: [_jsxs("label", { children: ["Lineage ", _jsx("span", { className: "muted", children: "(parents or cross, for example Gelato 41 x Mule Fuel)" })] }), _jsx("input", { value: String(r.lineage ?? ''), placeholder: "Mother x Father", onChange: e => set('lineage', e.target.value) })] }), _jsxs("div", { className: "field", children: [_jsxs("label", { children: ["Nurseries ", _jsx("span", { className: "muted", children: "(where we get it; pick all that apply)" })] }), _jsx(MultiPick, { options: nurseries ?? [], value: r.nurseries ?? [], onChange: v => set('nurseries', v) })] })] }), _jsx("div", { className: "fgrid", children: cols.filter(c => !['name', 'aliases'].includes(c.key)).map(fieldFor) })] }) : cols.map(fieldFor), !colorOk && _jsx("div", { className: "warn-t", children: "Color must look like #A1B2C3" }), !isCust && list !== 'strains' && carrier, extra, locked && _jsxs("p", { className: "muted", children: [String(row.name), " is a Lifted site. You can edit its details but not rename or retire it."] }), readOnly ? _jsxs("div", { className: "row between fbar", children: [_jsx("span", { className: "muted", children: "View only" }), _jsx("button", { className: "ghost", onClick: onClose, children: "Close" })] }) : _jsxs("div", { className: "row between fbar", children: [row.id && !locked
                            ? _jsx("button", { className: "ghost", disabled: busy, onClick: () => onSave({ id: row.id, active: !r.active }), children: r.active ? 'Retire' : 'Restore' })
                            : _jsx("span", {}), _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost", onClick: onClose, children: "Cancel" }), _jsx("button", { className: "primary", disabled: busy || !String(r.name ?? '').trim() || !colorOk, onClick: submit, children: "Save" })] })] })] }) }));
}
function ImportPreview({ list, plan, busy, onClose, onApply }) {
    const count = (s) => plan.rows.filter(r => r.status === s).length;
    const n = count('new'), u = count('update');
    return (_jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: "sheet form wide", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsxs("h2", { children: ["Import ", TITLES[list].toLowerCase()] }), _jsx("button", { className: "ghost", onClick: onClose, children: "\u2715" })] }), _jsxs("p", { className: "muted", children: [plan.file, " \u00B7 columns found: ", plan.found.join(', ')] }), _jsxs("div", { className: "row chips", children: [_jsxs("span", { className: "chip new", children: [n, " new"] }), _jsxs("span", { className: "chip upd", children: [u, " updates"] }), _jsxs("span", { className: "chip", children: [count('same'), " unchanged"] }), count('error') > 0 && _jsxs("span", { className: "chip err", children: [count('error'), " skipped"] })] }), _jsxs("div", { className: "picklist preview", children: [plan.rows.filter(r => r.status !== 'same').map(r => (_jsxs("div", { className: `prev s-${r.status}`, children: [_jsxs("span", { className: "muted", children: ["row ", r.line] }), _jsx("b", { children: r.name }), _jsx("span", { children: r.status === 'new' ? 'new' : r.status === 'update' ? `update ${r.changes?.join(', ')}` : r.msg })] }, r.line))), n + u + count('error') === 0 && _jsx("div", { className: "muted", style: { padding: 10 }, children: "Everything in the file already matches." })] }), _jsxs("div", { className: "row end", children: [_jsx("button", { className: "ghost", onClick: onClose, children: "Cancel" }), _jsx("button", { className: "primary", disabled: busy || n + u === 0, onClick: onApply, children: busy ? 'Importing…' : `Import ${n + u}` })] })] }) }));
}
// contract terms by crop year: the terms above carry over until a later year gets its own
const TERM_KEYS = [
    { k: 'price_per_lb', l: 'Price $/lb' }, { k: 'contract_lbs', l: 'Contract lbs' }, { k: 'monthly_min_lbs', l: 'Monthly min lbs' },
    { k: 'deposit_usd', l: 'Deposit $' }, { k: 'storage_fee', l: 'Storage fee' },
];
function TermsByYear({ backend, c }) {
    const [rows, setRows] = useState(null);
    const [ys, setYs] = useState(null);
    const [edit, setEdit] = useState(null);
    const [msg, setMsg] = useState(null);
    const load = () => backend.listTerms().then(t => setRows(t.filter(x => x.customer_id === c.id))).catch(() => setRows([]));
    useEffect(() => { load(); backend.reserveYears().then(setYs).catch(() => { }); }, [c.id]);
    if (!rows || !ys)
        return null;
    const cur = ys.current;
    const years = [...new Set([...ys.years.map(y => y.year).filter(y => y > cur), ...rows.map(r => r.crop_year)])].sort((a, b) => a - b);
    if (!years.length)
        return null;
    const base = c;
    const inForce = (y) => rows.filter(r => r.crop_year <= y).sort((a, b) => b.crop_year - a.crop_year)[0];
    const fmt = (t) => t.price_per_lb != null ? `$${Number(t.price_per_lb).toFixed(2)}/lb` : 'market price';
    async function save(clear) {
        if (!edit)
            return;
        try {
            await backend.setTerms(edit, clear);
            setEdit(null);
            setMsg(clear ? `${edit.crop_year} terms removed` : `${edit.crop_year} terms saved`);
            load();
        }
        catch (e) {
            setMsg(String(e.message ?? e));
        }
    }
    return (_jsxs("div", { className: "field", children: [_jsx("label", { children: "Terms by crop year" }), _jsxs("p", { className: "muted", children: ["The terms above are this customer's ", cur, " terms and carry over to later crops until a year gets its own."] }), years.map(y => {
                const own = rows.find(r => r.crop_year === y), f = inForce(y);
                return (_jsxs("div", { className: "row between", children: [_jsxs("span", { children: [_jsx("b", { children: y }), " ", _jsx("span", { className: "muted", children: own ? fmt(own) : `same as ${f ? f.crop_year : cur} (${fmt((f ?? base))})` })] }), _jsx("button", { className: "ghost small", onClick: () => setEdit(own ?? { customer_id: c.id, crop_year: y,
                                price_per_lb: (f ?? base).price_per_lb ?? null, contract_lbs: (f ?? base).contract_lbs ?? null, monthly_min_lbs: (f ?? base).monthly_min_lbs ?? null,
                                deposit_usd: (f ?? base).deposit_usd ?? null, storage_fee: (f ?? base).storage_fee ?? null }), children: own ? 'Edit' : `Set ${y} terms` })] }, y));
            }), edit && (_jsxs("div", { className: "card-ish", children: [_jsxs("b", { children: [edit.crop_year, " terms"] }), TERM_KEYS.map(t => (_jsxs("div", { className: "field", children: [_jsx("label", { children: t.l }), _jsx("input", { type: "number", min: "0", step: "any", value: edit[t.k] == null ? '' : String(edit[t.k]), onChange: e => setEdit({ ...edit, [t.k]: e.target.value === '' ? null : Number(e.target.value) }) })] }, t.k))), _jsxs("div", { className: "row", children: [_jsxs("button", { className: "primary small", onClick: () => save(false), children: ["Save ", edit.crop_year, " terms"] }), rows.some(r => r.crop_year === edit.crop_year) && _jsx("button", { className: "ghost small", onClick: () => save(true), children: "Remove (carry over instead)" }), _jsx("button", { className: "ghost small", onClick: () => setEdit(null), children: "Cancel" })] })] })), msg && _jsx("p", { className: "muted", children: msg })] }));
}
