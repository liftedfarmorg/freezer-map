import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
// Accounting > Settings > Business Central (213): the trial copy of invoices into Business Central.
// QuickBooks stays the books. Invoices already in QuickBooks are copied to BC (as drafts unless Post is on).
import { useEffect, useMemo, useState } from 'react';
import { Select } from '../combo';
import { Empty } from '../dash';
import { dfmt, money } from '../docs';
const msg = (e) => String(e?.message ?? e);
const when = (iso) => iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const differs = (a, b) => a != null && b != null && Math.abs(Number(a) - Number(b)) >= 0.01;
class BcApi {
    constructor(sb) {
        this.sb = sb;
    }
    async server(body) {
        const { data } = await this.sb.auth.getSession();
        const r = await fetch('/api/bc/run', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify(body) });
        const j = await r.json().catch(() => ({ error: `The server didn't answer (${r.status})` }));
        if (!r.ok)
            throw new Error(j.error ?? `Error ${r.status}`);
        return j;
    }
    async rpc(fn, args) { const { data, error } = await this.sb.rpc(fn, args ?? {}); if (error)
        throw new Error(error.message); return data; }
    config() { return this.rpc('bc_config'); }
    list(env) { return this.rpc('bc_list', { p_env: env }).then(r => r ?? []); }
    save(settings, map) { return this.rpc('bc_save', { p_settings: settings, p_map: map }); }
    products() { return this.sb.from('acct_products').select('code,name,active').order('sort').then(({ data, error }) => { if (error)
        throw new Error(error.message); return (data ?? []); }); }
    classes() { return this.sb.from('acct_classes').select('name,active').order('sort').then(({ data, error }) => { if (error)
        throw new Error(error.message); return (data ?? []); }); }
}
export function BcPanel({ sb, flash, canEdit }) {
    const api = useMemo(() => new BcApi(sb), [sb]);
    const [st, setSt] = useState(null);
    const [cfg, setCfg] = useState(null);
    const [sec, setSec] = useState('invoices');
    const [err, setErr] = useState(null);
    const loadCfg = () => api.config().then(c => { setCfg(c); setErr(null); }).catch(e => setErr(msg(e)));
    const loadSt = () => api.server({ action: 'status' }).then(setSt).catch(e => setSt({ env: null, configured: false, error: msg(e) }));
    useEffect(() => { loadSt(); loadCfg(); }, []);
    useEffect(() => { if (st && (!st.configured || !st.connected))
        setSec('settings'); }, [st?.configured, st?.connected]);
    if (err)
        return _jsxs("div", { className: "warnbox", children: ["Couldn't load the Business Central settings. Run 213_business_central.sql in Supabase first. (", err, ")"] });
    if (!st || !cfg)
        return _jsx("p", { className: "muted", children: "Loading\u2026" });
    const on = cfg.settings.auto_push === 'true', post = cfg.settings.post === 'true';
    return (_jsxs("div", { className: "dlist", children: [_jsxs("p", { children: ["Business Central environment: ", _jsx("b", { children: st.env ?? 'not set' }), st.company ? _jsxs(_Fragment, { children: [" \u00B7 company ", _jsx("b", { children: st.company })] }) : null, ' ', _jsx("span", { className: `pill ${post ? 'acct-error' : 'warnp'}`, children: post ? 'POSTS INVOICES' : 'DRAFTS ONLY' }), ' ', _jsx("span", { className: `pill ${on ? 'acct-sent' : 'acct-pending'}`, children: on ? 'COPYING' : 'COPYING OFF' })] }), !st.configured ? _jsxs("div", { className: "warnbox", children: ["Not set up in Vercel yet. Missing: ", (st.missing ?? []).join(', '), ". Add them in Vercel \u203A Settings \u203A Environment Variables, then redeploy."] })
                : st.connected ? _jsx("p", { className: "ok-t", children: "\u2713 Connected" }) : _jsxs("div", { className: "warnbox", children: ["Can't reach Business Central: ", st.error] }), _jsx("div", { className: "seg tabs", children: [['invoices', 'Invoices'], ['matching', 'Matching'], ['settings', 'Settings']].map(([k, l]) => _jsx("button", { className: sec === k ? 'on' : '', onClick: () => setSec(k), children: l }, k)) }), sec === 'invoices' && st.env && _jsx(Invoices, { api: api, env: st.env, flash: flash, canEdit: canEdit && !!st.connected }), sec === 'invoices' && !st.env && _jsx(Empty, { children: "Set BC_ENVIRONMENT in Vercel first." }), sec === 'matching' && _jsx(Matching, { api: api, cfg: cfg, flash: flash, connected: !!st.connected, reload: loadCfg }), sec === 'settings' && _jsx(Settings, { api: api, cfg: cfg, st: st, flash: flash, reload: () => { loadSt(); loadCfg(); } })] }));
}
// ---------- the invoices: QuickBooks and Business Central side by side ----------
function Invoices({ api, env, flash, canEdit }) {
    const [rows, setRows] = useState(null);
    const [f, setF] = useState('all');
    const [busy, setBusy] = useState(null);
    const [q, setQ] = useState('');
    const load = () => api.list(env).then(setRows).catch(e => flash(msg(e), true));
    useEffect(() => { load(); }, [env]);
    if (!rows)
        return _jsx("p", { className: "muted", children: "Loading\u2026" });
    const inQbo = (r) => r.qbo?.status === 'sent';
    const waiting = (r) => inQbo(r) && r.status !== 'void' && (!r.bc || r.bc.status === 'error');
    const problem = (r) => r.bc?.status === 'error' || r.bc?.status === 'deleted' || !!r.bc?.note;
    const inBc = (r) => r.bc?.status === 'draft' || r.bc?.status === 'posted';
    const diff = (r) => inBc(r) && (differs(r.bc?.bc_total, r.total) || (inQbo(r) && differs(r.bc?.bc_total, r.qbo?.total)));
    const test = { all: () => true, waiting, problems: problem, inbc: inBc, differs: diff }[f];
    const ql = q.trim().toLowerCase();
    const shown = rows.filter(r => test(r) && (!ql || `${r.inv} ${r.customer} ${r.bc?.bc_number ?? ''}`.toLowerCase().includes(ql)));
    const act = async (label, fn) => { setBusy(label); try {
        await fn();
    }
    catch (e) {
        flash(msg(e), true);
    }
    finally {
        setBusy(null);
        load();
    } };
    const sendOne = (r, resend) => {
        if (resend && !confirm(`Send ${r.inv} again? The draft in Business Central (${r.bc?.bc_number ?? ''}) is deleted and a new one is made from the app.`))
            return;
        act(`send${r.id}`, async () => {
            const x = await api.server({ action: 'send', invoice_id: r.id, resend });
            flash(`${r.inv} ${x.mode === 'linked' ? 'linked to' : x.mode === 'replaced' ? 'replaced in Business Central as' : 'copied to Business Central as'} ${x.number} (${x.status})${x.note ? ` · ${x.note}` : ''}`);
        });
    };
    const count = (t) => rows.filter(t).length;
    return (_jsxs("div", { children: [_jsx("p", { className: "muted small", children: "Invoices on or after the start date. Each one is copied to Business Central once it's in QuickBooks. QuickBooks stays the books: payments and balances still come from QuickBooks." }), _jsxs("div", { className: "row wrap", children: [canEdit && _jsx("button", { className: "primary small", disabled: !!busy || !count(waiting), onClick: () => act('due', async () => {
                            const r = await api.server({ action: 'send_due' });
                            flash(r.due ? `${r.sent} copied${r.failed ? `, ${r.failed} with a problem` : ''}${r.due > r.sent + r.failed ? ` · ${r.due - r.sent - r.failed} left: click again` : ''}` : 'Nothing waiting', r.failed > 0);
                        }), children: busy === 'due' ? 'Copying…' : `Send waiting now (${count(waiting)})` }), _jsx("button", { className: "ghost small", disabled: !!busy, onClick: () => act('check', async () => {
                            const r = await api.server({ action: 'check' });
                            flash(`Checked ${r.checked} in Business Central${r.posted ? ` · ${r.posted} posted` : ''}${r.deleted ? ` · ${r.deleted} not found there any more` : ''}`);
                        }), children: busy === 'check' ? 'Checking…' : 'Check Business Central' })] }), _jsxs("div", { className: "row toolbar wrap", children: [_jsx("div", { className: "seg", children: [['all', 'All'], ['waiting', 'Waiting'], ['problems', 'Problems'], ['inbc', 'In BC'], ['differs', 'Totals differ']].map(([k, l]) => _jsxs("button", { className: f === k ? 'on' : '', onClick: () => setF(k), children: [l, " (", count({ all: () => true, waiting, problems: problem, inbc: inBc, differs: diff }[k]), ")"] }, k)) }), _jsx("input", { className: "search", type: "search", placeholder: "Invoice #, customer", value: q, onChange: e => setQ(e.target.value) })] }), !shown.length ? _jsx(Empty, { children: "None here." }) : (_jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "restable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Invoice" }), _jsx("th", { children: "Customer" }), _jsx("th", { className: "num", children: "App" }), _jsx("th", { className: "num", children: "QuickBooks" }), _jsx("th", { children: "Business Central" }), _jsx("th", {})] }) }), _jsx("tbody", { children: shown.map(r => {
                                const b = r.bc;
                                const bad = diff(r);
                                return (_jsxs("tr", { children: [_jsxs("td", { children: [_jsx("b", { children: r.inv }), _jsxs("div", { className: "muted small", children: [dfmt(r.date), r.status === 'void' ? ' · void' : ''] })] }), _jsx("td", { children: r.customer }), _jsx("td", { className: "num", children: money(r.total) }), _jsx("td", { className: "num", children: inQbo(r) ? money(Number(r.qbo?.total ?? r.total)) : _jsx("span", { className: "muted small", children: r.qbo?.status === 'error' ? 'error' : 'not yet' }) }), _jsx("td", { children: !b ? _jsx("span", { className: `pill ${inQbo(r) ? 'acct-pending' : 'inv-void'}`, children: inQbo(r) ? 'Waiting' : 'After QuickBooks' }) : _jsxs(_Fragment, { children: [_jsx("span", { className: `pill ${b.status === 'posted' ? 'acct-sent' : b.status === 'draft' ? 'inv-open' : b.status === 'error' ? 'acct-error' : 'inv-void'}`, children: b.status === 'posted' ? 'Posted' : b.status === 'draft' ? 'Draft' : b.status === 'error' ? 'Problem' : 'Deleted in BC' }), b.bc_number && _jsxs(_Fragment, { children: [" ", _jsx("b", { children: b.bc_number })] }), b.bc_total != null && _jsxs(_Fragment, { children: [" \u00B7 ", _jsx("span", { className: bad ? 'bad-t' : '', children: money(Number(b.bc_total)) })] }), b.error && _jsx("div", { className: "bad-t small", children: b.error }), b.note && _jsx("div", { className: "warn-t small", children: b.note }), _jsxs("div", { className: "muted small", children: [when(b.sent_at), b.sent_by ? ` · ${b.sent_by.split('@')[0]}` : ''] })] }) }), _jsxs("td", { className: "nowrap", children: [canEdit && inQbo(r) && r.status !== 'void' && (!b || b.status === 'error' || b.status === 'deleted') &&
                                                    _jsx("button", { className: "ghost small", disabled: !!busy, onClick: () => sendOne(r, false), children: busy === `send${r.id}` ? 'Copying…' : b ? 'Try again' : 'Send' }), canEdit && b?.status === 'draft' && _jsx("button", { className: "ghost small", disabled: !!busy, onClick: () => sendOne(r, true), children: busy === `send${r.id}` ? 'Copying…' : 'Send again' })] })] }, r.id));
                            }) })] }) }))] }));
}
// ---------- matching: app products, classes, payment terms and customers to Business Central ----------
function Matching({ api, cfg, flash, connected, reload }) {
    const [L, setL] = useState(null);
    const [products, setProducts] = useState([]);
    const [classes, setClasses] = useState([]);
    const [ed, setEd] = useState({});
    const [busy, setBusy] = useState(false);
    const [lerr, setLerr] = useState(null);
    const saved = useMemo(() => new Map(cfg.map.map(r => [`${r.kind}|${r.key}`, r.value])), [cfg]);
    const load = () => {
        setLerr(null);
        return Promise.all([api.server({ action: 'lists' }), api.products(), api.classes()])
            .then(([l, p, c]) => { setL(l); setProducts(p.filter(x => x.active)); setClasses(c.filter(x => x.active)); })
            .catch(e => setLerr(msg(e)));
    };
    useEffect(() => { if (connected)
        load(); }, [connected]);
    if (!connected)
        return _jsx(Empty, { children: "Connect Business Central first (Settings)." });
    if (lerr)
        return _jsxs("div", { className: "warnbox", children: ["Couldn't read Business Central: ", lerr, " ", _jsx("button", { className: "linkbtn", onClick: load, children: "Try again" })] });
    if (!L)
        return _jsx("p", { className: "muted", children: "Reading items, dimensions, payment terms and customers from Business Central\u2026" });
    const dims = String(cfg.settings.class_dims || '').split(',').map(x => x.trim()).filter(Boolean);
    const val = (k) => ed[k] ?? saved.get(k) ?? '';
    const set = (k, v) => setEd({ ...ed, [k]: v });
    const changed = Object.entries(ed).filter(([k, v]) => (saved.get(k) ?? '') !== v);
    async function save() {
        setBusy(true);
        try {
            await api.save(null, changed.map(([k, v]) => { const [kind, ...rest] = k.split('|'); return { kind: kind, key: rest.join('|'), value: v }; }));
            await reload();
            setEd({});
            await load();
            flash('Matches saved');
        }
        catch (e) {
            flash(msg(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    const prodOpts = [...L.items.map(i => ({ v: `item:${i.number}`, l: `Item ${i.number} · ${i.name}` })), ...L.accounts.map(a => ({ v: `account:${a.number}`, l: `G/L ${a.number} · ${a.name}${a.category ? ` (${a.category})` : ''}` }))];
    const custs = cfg.customers.map(c => ({ ...c, m: L.matches.customer[c.id] }));
    const unmatched = custs.filter(c => !c.m);
    return (_jsxs("div", { children: [_jsx("p", { className: "muted small", children: "Anything left on \"Same name\" is matched by name each time (items by name, dimension values by name or code, customers by their QuickBooks name). Pick one to override it. Invoices with anything unmatched aren't copied and show as a problem." }), _jsx("h3", { children: "Products" }), _jsx("p", { className: "muted small", children: "Each app product goes to a Business Central item, or a G/L account (discount, return and refund lines post more simply to a G/L account if BC turns down negative item lines)." }), _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "restable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "App product" }), _jsx("th", { children: "Business Central" })] }) }), _jsx("tbody", { children: products.map(p => {
                                const k = `product|${p.code}`, auto = L.matches.product[p.code];
                                return (_jsxs("tr", { children: [_jsx("td", { children: _jsx("b", { children: p.name }) }), _jsxs("td", { children: [_jsxs(Select, { value: val(k), onChange: e => set(k, e.target.value), children: [_jsx("option", { value: "", children: `Same name${auto && auto.how === 'name' ? `: ${auto.label}` : ' (none found)'}` }), prodOpts.map(o => _jsx("option", { value: o.v, children: o.l }, o.v))] }), !auto && !val(k) && _jsx("div", { className: "bad-t small", children: "Not matched" })] })] }, p.code));
                            }) })] }) }), _jsx("h3", { children: "Classes" }), !dims.length ? _jsx("div", { className: "warnbox", children: "Classes aren't copied yet: pick the dimension(s) they go to in Settings first." }) : (_jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "restable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "App class" }), dims.map(d => _jsx("th", { children: d }, d))] }) }), _jsx("tbody", { children: classes.map(c => {
                                const m = L.matches.class[c.name];
                                return (_jsxs("tr", { children: [_jsx("td", { children: _jsx("b", { children: c.name }) }), dims.map(d => {
                                            const dim = L.dims.find(x => x.code.toUpperCase() === d.toUpperCase()), k = `class|${c.name}|${dim?.code ?? d}`;
                                            const auto = m?.dims.find(x => x.code.toUpperCase() === d.toUpperCase());
                                            return _jsx("td", { children: !dim ? _jsxs("span", { className: "bad-t small", children: ["No dimension ", d, " in BC"] }) : _jsxs(_Fragment, { children: [_jsxs(Select, { value: val(k), onChange: e => set(k, e.target.value), children: [_jsx("option", { value: "", children: `Same name${auto && auto.how === 'name' ? `: ${auto.valueCode}` : ' (none found)'}` }), dim.values.map(v => _jsxs("option", { value: v.code, children: [v.code, " \u00B7 ", v.name] }, v.code))] }), !auto && !val(k) && _jsx("div", { className: "bad-t small", children: "Not matched" })] }) }, d);
                                        })] }, c.name));
                            }) })] }) })), _jsx("h3", { children: "Payment terms" }), _jsx("p", { className: "muted small", children: "Unmatched terms aren't a problem: Business Central uses the customer's terms, and the app's due date is set on the invoice." }), !cfg.terms.length ? _jsx(Empty, { children: "No terms on recent invoices." }) : (_jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "restable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "App terms" }), _jsx("th", { children: "Business Central" })] }) }), _jsx("tbody", { children: cfg.terms.map(t => {
                                const k = `terms|${t.code}`, auto = L.matches.terms[t.code];
                                return (_jsxs("tr", { children: [_jsxs("td", { children: [_jsx("b", { children: t.label ?? t.code }), " ", _jsx("span", { className: "muted small", children: t.code })] }), _jsx("td", { children: _jsxs(Select, { value: val(k), onChange: e => set(k, e.target.value), children: [_jsx("option", { value: "", children: `Same name${auto && auto.how === 'name' ? `: ${auto.code}` : ' (none found: customer\'s terms)'}` }), L.terms.map(x => _jsxs("option", { value: x.code, children: [x.code, " \u00B7 ", x.name] }, x.code))] }) })] }, t.code));
                            }) })] }) })), _jsxs("h3", { children: ["Customers ", unmatched.length > 0 && _jsxs("span", { className: "pill acct-error", children: [unmatched.length, " not matched"] })] }), _jsx("p", { className: "muted small", children: "Customers on invoices since the start date. Matched by their QuickBooks name, then legal name, then app name. Unmatched ones are listed first." }), _jsx("div", { className: "tablewrap", children: _jsxs("table", { className: "restable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "App customer" }), _jsx("th", { children: "Business Central" })] }) }), _jsx("tbody", { children: [...unmatched, ...custs.filter(c => c.m)].map(c => {
                                const k = `customer|${c.id}`;
                                return (_jsxs("tr", { children: [_jsxs("td", { children: [_jsx("b", { children: c.name }), c.qbo_name && c.qbo_name !== c.name && _jsxs("div", { className: "muted small", children: ["QuickBooks: ", c.qbo_name] })] }), _jsxs("td", { children: [_jsxs(Select, { value: val(k), onChange: e => set(k, e.target.value), children: [_jsx("option", { value: "", children: `Same name${c.m && c.m.how === 'name' ? `: ${c.m.number} · ${c.m.name}` : ' (none found)'}` }), L.customers.map(x => _jsxs("option", { value: x.number, children: [x.number, " \u00B7 ", x.name, x.blocked && x.blocked.trim() ? ` (blocked: ${x.blocked})` : ''] }, x.number))] }), !c.m && !val(k) && _jsx("div", { className: "bad-t small", children: "Not matched" })] })] }, c.id));
                            }) })] }) }), _jsxs("div", { className: "row wrap", children: [_jsx("button", { className: "primary", disabled: busy || !changed.length, onClick: save, children: busy ? 'Saving…' : changed.length ? `Save ${changed.length} match${changed.length === 1 ? '' : 'es'}` : 'Saved' }), changed.length > 0 && _jsx("button", { className: "ghost", onClick: () => setEd({}), children: "Undo changes" }), _jsx("button", { className: "ghost", disabled: busy, onClick: () => { setL(null); load(); }, children: "Read Business Central again" })] })] }));
}
// ---------- settings ----------
function Settings({ api, cfg, st, flash, reload }) {
    const s = cfg.settings;
    const [start, setStart] = useState(s.start_date ?? '');
    const [dims, setDims] = useState(String(s.class_dims || '').split(',').map(x => x.trim()).filter(Boolean));
    const [all, setAll] = useState(null);
    const [test, setTest] = useState(null);
    const [busy, setBusy] = useState(null);
    const act = async (label, fn) => { setBusy(label); try {
        await fn();
    }
    catch (e) {
        flash(msg(e), true);
    }
    finally {
        setBusy(null);
    } };
    const saveOne = (k, v, done) => act(k, async () => { await api.save({ [k]: v }, null); reload(); flash(done); });
    const on = s.auto_push === 'true', post = s.post === 'true', nums = s.use_app_numbers === 'true';
    const runTest = () => act('test', async () => { const t = await api.server({ action: 'test' }); setTest(t); setAll(t.dims); reload(); flash(`Connected to ${t.company}`); });
    useEffect(() => { if (st.connected && !all)
        api.server({ action: 'test' }).then(t => { setTest(t); setAll(t.dims); }).catch(() => { }); }, [st.connected]);
    const dimsChanged = dims.join(',') !== String(s.class_dims || '').split(',').map(x => x.trim()).filter(Boolean).join(',');
    return (_jsxs("div", { children: [_jsx("h3", { children: "Connection" }), _jsx("div", { className: "row wrap", children: _jsx("button", { className: "primary small", disabled: !!busy || !st.configured, onClick: runTest, children: busy === 'test' ? 'Testing…' : 'Test connection' }) }), test && _jsxs("p", { className: "ok-t small", children: ["\u2713 ", test.company, ": ", test.customers, " customers, ", test.items, " items, ", test.accounts, " G/L accounts, ", test.terms, " payment terms, ", test.dims.length, " dimensions."] }), _jsx("h3", { children: "Copy automatically" }), _jsxs("p", { children: [on ? _jsx("b", { className: "ok-t", children: "On" }) : _jsx("b", { className: "bad-t", children: "Off" }), " \u00B7 ", on ? 'every 10 minutes, invoices in QuickBooks since the start date are copied to Business Central.' : 'nothing is copied on its own. Use Send waiting now on Invoices, or Send on one invoice.'] }), _jsx("div", { className: "row wrap", children: _jsx("button", { className: on ? 'ghost' : 'primary', disabled: !!busy || !st.connected, onClick: () => { if (confirm(on ? 'Stop copying invoices to Business Central automatically?' : `Copy invoices to Business Central automatically? Invoices in QuickBooks dated ${dfmt(s.start_date)} or later go within 10 minutes, ${post ? 'and they are POSTED.' : 'as drafts.'}`))
                        saveOne('auto_push', on ? 'false' : 'true', on ? 'Copying is off' : 'Copying is on'); }, children: busy === 'auto_push' ? 'Saving…' : on ? 'Turn copying off' : 'Turn copying on' }) }), _jsx("h3", { children: "Start date" }), _jsx("p", { className: "muted small", children: "Invoices dated on or after this are copied. Move it earlier to backfill; they go 25 at a time." }), _jsxs("div", { className: "row wrap", children: [_jsx("input", { type: "date", value: start, onChange: e => setStart(e.target.value) }), _jsx("button", { className: "ghost small", disabled: !!busy || !start || start === s.start_date, onClick: () => saveOne('start_date', start, 'Start date saved'), children: "Save" })] }), _jsx("h3", { children: "Post in Business Central" }), _jsxs("p", { children: [post ? _jsx("b", { className: "bad-t", children: "On" }) : _jsx("b", { className: "ok-t", children: "Off (drafts only)" }), " \u00B7 ", post
                        ? 'copies are posted. Posted invoices are permanent in Business Central and can only be reversed with a credit memo.'
                        : 'copies stay as unposted drafts you can check, delete or send again. Recommended until you\'re sure which environment becomes your real books.'] }), _jsx("div", { className: "row wrap", children: _jsx("button", { className: "ghost small", disabled: !!busy, onClick: () => {
                        if (confirm(post ? 'Go back to drafts only? Invoices already posted stay posted.' : `Post copies in Business Central (${st.env})? Posted invoices are permanent there and can only be reversed with credit memos. Only do this in an environment you're happy to have test entries in.`))
                            saveOne('post', post ? 'false' : 'true', post ? 'Drafts only' : 'Copies will be posted');
                    }, children: busy === 'post' ? 'Saving…' : post ? 'Drafts only' : 'Post copies' }) }), _jsx("h3", { children: "Invoice numbers" }), _jsxs("p", { className: "muted small", children: ["The app's invoice number always goes in External Document No. ", nums ? 'It\'s also used as the BC invoice number (the BC number series needs Manual Nos. turned on).' : 'Business Central numbers the invoice from its own series.'] }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: nums, disabled: !!busy, onChange: e => saveOne('use_app_numbers', e.target.checked ? 'true' : 'false', 'Saved') }), " Use the app's invoice number as the Business Central number"] }), _jsx("h3", { children: "Dimensions for classes" }), _jsx("p", { className: "muted small", children: "Business Central has no classes. Each invoice line's class goes to the dimension(s) ticked here; match the values on Matching." }), !all ? _jsx("p", { className: "muted small", children: st.connected ? 'Reading dimensions…' : 'Connect first.' }) : _jsxs(_Fragment, { children: [all.map(d => _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: dims.some(x => x.toUpperCase() === d.code.toUpperCase()), onChange: e => setDims(e.target.checked ? [...dims, d.code] : dims.filter(x => x.toUpperCase() !== d.code.toUpperCase())) }), " ", _jsx("b", { children: d.code }), " ", d.name, " ", _jsxs("span", { className: "muted small", children: ["(", d.values, " values)"] })] }, d.code)), !all.length && _jsx(Empty, { children: "No dimensions in this company." }), _jsx("div", { className: "row wrap", children: _jsx("button", { className: "ghost small", disabled: !!busy || !dimsChanged, onClick: () => saveOne('class_dims', dims.join(','), 'Saved'), children: "Save dimensions" }) })] }), _jsx("h3", { children: "How it works" }), _jsxs("ul", { className: "muted small", children: [_jsx("li", { children: "QuickBooks stays the books. Nothing here changes how invoices go to QuickBooks, lock, or get paid." }), _jsx("li", { children: "An invoice is copied only once it's in QuickBooks, so Business Central gets final invoices you can tie out on Invoices." }), _jsx("li", { children: "The app's invoice number goes in External Document No. Before making anything, the app looks for that number in Business Central and links instead of making a second one." }), _jsx("li", { children: "If anything doesn't match (customer, product, class), nothing is made and the invoice shows as a problem. It tries again every hour, or click Try again after fixing the match." }), _jsx("li", { children: "Changed in QuickBooks after it was copied? Business Central doesn't follow. Use Send again for a draft; fix a posted one in Business Central." }), _jsx("li", { children: "The Business Central login lives in Vercel (BC_TENANT_ID, BC_CLIENT_ID, BC_CLIENT_SECRET, BC_ENVIRONMENT, BC_COMPANY). Nobody can read it from the app." })] })] }));
}
