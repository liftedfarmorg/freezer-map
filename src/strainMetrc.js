import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
// New strain > METRC (132). The strain's METRC sheet: everything METRC needs on every Lifted license (the strain, farm items,
// GVR Processing items for both farms, 1PN Clone / URC / Seed for the seasons and crop years ticked), what's already there,
// and Send, which queues METRC to-dos (strain_create, item_create) that go through T3 like every other kind.
// Also the METRC codes list for coded nursery strains (real name next to the code, download as a spreadsheet).
import { useEffect, useMemo, useState } from 'react';
import { metrcRun } from './metrcCall';
import { download, toCsv } from './comp/csv';
const KIND = { cultivation: 'Cultivation', processor: 'Processing', nursery: 'Nursery' };
const FIN = { FF: 'Fresh Frozen', DH: 'Dry Harvest (wet)', UF: 'Unbucked', BF: 'Bucked', ST: 'Standards', SM: 'Smalls', TR: 'Dry Trim',
    BT: 'Bucking Trim', DB: 'Dry Biomass', DS: 'Dry Sift Biomass', CL: 'Clone', UR: 'URC', SD: 'Seed' };
export function loadStrainPlan(sb, strain, opts) {
    return Promise.resolve(sb.rpc('metrc_strain_plan', { p_strain: strain, p_opts: opts })).then(({ data, error }) => { if (error)
        throw new Error(error.message); return data; });
}
async function pullSetup(sb) {
    const { data } = await sb.auth.getSession();
    for (let i = 0; i < 4; i++) {
        const r = await fetch('/api/metrc/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify({ only: 'setup' }) });
        const j = await r.json().catch(() => ({ error: `The server didn't answer (${r.status})` }));
        if (!r.ok)
            throw new Error(j.error ?? `Error ${r.status}`);
        if (j.done)
            return j;
        const bad = (j.results ?? []).find((x) => x.error);
        if (bad)
            throw new Error(`${bad.license}: ${bad.error}`);
    }
    throw new Error('METRC took too long. Try Refresh again.');
}
export function StrainMetrcSheet({ sb, strainId, flash, onClose, isNew }) {
    const [plan, setPlan] = useState(null);
    const [err, setErr] = useState(null);
    const [years, setYears] = useState(null);
    const [seasons, setSeasons] = useState(['FL']);
    const [coded, setCoded] = useState(null);
    const [f, setF] = useState(null);
    const [off, setOff] = useState(new Set()); // new rows the person unticked
    const [on, setOn] = useState(new Set()); // optional rows (Seed, Dry Biomass...) the person ticked
    const [busy, setBusy] = useState(null);
    const [skipLic, setSkipLic] = useState(new Set()); // licenses left out this time
    const opts = useMemo(() => ({ ...(years ? { years } : {}), seasons, ...(coded != null ? { coded } : {}) }), [years, seasons, coded]);
    const load = () => loadStrainPlan(sb, strainId, opts).then(p => {
        setPlan(p);
        setErr(null);
        if (!years)
            setYears(p.years);
        if (coded == null)
            setCoded(p.strain.coded);
        if (!f)
            setF({ metrc_name: p.strain.metrc_name, testing: p.strain.testing, thc: String(p.strain.thc), cbd: String(p.strain.cbd), indica: String(p.strain.indica), sativa: String(p.strain.sativa) });
    }).catch((e) => setErr(String(e.message ?? e)));
    useEffect(() => { load(); }, [opts]);
    const ticked = (r) => r.state === 'new' && !skipLic.has(r.license) && (r.on ? !off.has(r.key) : on.has(r.key));
    const toggle = (r) => {
        if (r.on)
            setOff(s => { const n = new Set(s); if (n.has(r.key))
                n.delete(r.key);
            else
                n.add(r.key); return n; });
        else
            setOn(s => { const n = new Set(s); if (n.has(r.key))
                n.delete(r.key);
            else
                n.add(r.key); return n; });
    };
    const rows = plan?.rows ?? [];
    const picked = rows.filter(ticked);
    const byLicense = useMemo(() => {
        const m = new Map();
        for (const r of rows)
            m.set(r.license, [...(m.get(r.license) ?? []), r]);
        return [...m.entries()];
    }, [rows]);
    const hasNursery = rows.some(r => r.license_kind === 'nursery');
    const nameChanged = !!plan && !!f && f.metrc_name.trim() !== plan.strain.metrc_name;
    const splitOk = !f || Number(f.indica) + Number(f.sativa) === 100;
    async function refresh() {
        setBusy('pull');
        try {
            await pullSetup(sb);
            await load();
            flash('Strains and items refreshed from METRC');
        }
        catch (e) {
            flash(e.message, true);
        }
        finally {
            setBusy(null);
        }
    }
    async function queue() {
        if (!plan || !f || !picked.length)
            return;
        setBusy('send');
        try {
            const { data, error } = await sb.rpc('metrc_strain_queue', { p_strain: strainId, p_keys: picked.map(r => r.key),
                p_opts: { ...opts, metrc_name: f.metrc_name.trim(), testing: f.testing, thc: f.thc, cbd: f.cbd, indica: f.indica, sativa: f.sativa } });
            if (error)
                throw new Error(error.message);
            const r = data;
            const n = r.strains + r.items;
            const modes = r.modes ?? {};
            const offNow = [modes.strain_create, modes.item_create].every(m => !m || m === 'off');
            const auto = [modes.strain_create, modes.item_create].some(m => m === 'auto');
            if (auto)
                metrcRun(sb, { action: 'kick' }).catch(() => { });
            flash(`${n} METRC to-do${n === 1 ? '' : 's'} made (${r.strains} strain, ${r.items} item${r.items === 1 ? '' : 's'}). `
                + (offNow ? 'New strain sends are Off in Compliance > Settings > METRC through T3, so they wait on the METRC to-do list.'
                    : auto ? 'Sending now.' : 'They wait for Send on the METRC to-do list.'));
            setOff(new Set());
            setOn(new Set());
            await load();
        }
        catch (e) {
            flash(e.message, true);
        }
        finally {
            setBusy(null);
        }
    }
    const set = (k, v) => setF(x => (x ? { ...x, [k]: v } : x));
    return (_jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: "sheet form wide", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsxs("h2", { children: ["METRC: ", plan?.strain.name ?? 'strain'] }), _jsx("button", { className: "ghost", onClick: onClose, children: "\u2715" })] }), err && _jsx("div", { className: "warnbox", children: err }), !plan || !f ? _jsx("p", { className: "muted", children: "Loading\u2026" }) : _jsxs(_Fragment, { children: [isNew && _jsx("p", { className: "muted", children: "Strain added. Here's what METRC needs for it on every license." }), !plan.can_send && _jsx("div", { className: "warnbox", children: "Only Cultivation, Nursery or Compliance Admins (or Admin) can send a strain to METRC. This is what it would need." }), _jsxs("div", { className: "field", children: [_jsx("label", { children: "Name in METRC" }), _jsx("input", { value: f.metrc_name, disabled: !plan.can_send, onChange: e => set('metrc_name', e.target.value) }), nameChanged && _jsx("span", { className: "muted small", children: "Item names below update when you send. Use the exact METRC spelling." })] }), hasNursery && _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: !!coded, disabled: !plan.can_send || plan.strain.coded, onChange: e => setCoded(e.target.checked) }), "Nursery: use the strain code ", plan.strain.code, " instead of the name on 1PN (strain and items)", plan.strain.coded ? ' · coded (stays coded)' : ''] }), _jsxs("div", { className: "row", style: { gap: 14, margin: '10px 0' }, children: [_jsx("span", { className: "muted small", children: "Crop years" }), [plan.this_year, plan.this_year + 1].map(y => (_jsxs("label", { className: "check small-check", children: [_jsx("input", { type: "checkbox", checked: (years ?? plan.years).includes(y), onChange: e => setYears(ys => { const cur = ys ?? plan.years; const n = e.target.checked ? [...cur, y] : cur.filter(x => x !== y); return n.length ? n.sort() : cur; }) }), " ", y] }, y))), hasNursery && _jsxs(_Fragment, { children: [_jsx("span", { className: "muted small", children: "Nursery seasons" }), ['FL', 'SP'].map(s => (_jsxs("label", { className: "check small-check", children: [_jsx("input", { type: "checkbox", checked: seasons.includes(s), onChange: e => setSeasons(ss => { const n = e.target.checked ? [...ss, s] : ss.filter(x => x !== s); return n.length ? n : ss; }) }), " ", s === 'FL' ? 'Fall (FL)' : 'Spring (SP)'] }, s)))] })] }), rows.some(r => r.what === 'strain' && r.state === 'new') && plan.can_send && (_jsxs("details", { className: "field", children: [_jsxs("summary", { className: "muted small", children: ["Strain details METRC asks for: ", f.testing === 'None' ? 'no testing' : f.testing, ", THC ", f.thc, "%, CBD ", f.cbd, "%, Indica/Sativa ", f.indica, "/", f.sativa] }), _jsxs("div", { className: "row", style: { gap: 8, marginTop: 8 }, children: [_jsxs("select", { value: f.testing, onChange: e => set('testing', e.target.value), children: [_jsx("option", { value: "None", children: "Testing: None" }), _jsx("option", { value: "InHouse", children: "In house" }), _jsx("option", { value: "ThirdParty", children: "Third party" })] }), ['thc', 'cbd', 'indica', 'sativa'].map(k => (_jsxs("label", { className: "small", children: [k.toUpperCase(), " % ", _jsx("input", { style: { width: 70 }, inputMode: "decimal", value: f[k], onChange: e => set(k, e.target.value) })] }, k)))] }), !splitOk && _jsx("div", { className: "warnbox", children: "Indica + Sativa has to add up to 100." })] })), _jsxs("div", { className: "row between", style: { margin: '8px 0' }, children: [_jsxs("span", { className: "muted small", children: ["Checked against METRC ", plan.pulled_at ? new Date(plan.pulled_at).toLocaleString() : 'never (Refresh first)'] }), _jsx("button", { className: "ghost small", disabled: !!busy, onClick: refresh, children: busy === 'pull' ? 'Refreshing…' : 'Refresh from METRC' })] }), byLicense.map(([lic, rs]) => (_jsxs("div", { className: "metrc-lic", children: [_jsxs("label", { className: "check", style: { margin: '12px 0 4px' }, children: [_jsx("input", { type: "checkbox", checked: !skipLic.has(lic), disabled: !plan.can_send, onChange: e => setSkipLic(x => { const n = new Set(x); if (e.target.checked)
                                                n.delete(lic);
                                            else
                                                n.add(lic); return n; }) }), _jsxs("b", { style: { fontSize: 15 }, children: [rs[0].site, " ", KIND[rs[0].license_kind]] }), " ", _jsx("span", { className: "muted small", children: lic })] }), !skipLic.has(lic) && rs.map(r => (_jsxs("label", { className: "check small-check", style: { alignItems: 'flex-start', margin: '3px 0' }, children: [_jsx("input", { type: "checkbox", checked: r.state !== 'new' || ticked(r), disabled: r.state !== 'new' || !plan.can_send, onChange: () => toggle(r) }), _jsxs("span", { children: [r.what === 'strain' ? _jsxs("b", { children: ["Strain: ", r.name] }) : _jsx(_Fragment, { children: r.name }), r.what === 'item' && _jsxs("span", { className: "muted", children: [" \u00B7 ", FIN[r.finish ?? ''] ?? r.finish, r.category ? ` · ${r.category}` : ''] }), ' ', r.state === 'in_metrc' ? _jsxs("span", { className: "pill", children: ["In METRC", r.metrc_name && r.metrc_name !== r.name ? `: ${r.metrc_name}` : ''] })
                                                    : r.state === 'queued' ? _jsxs("span", { className: "pill warn", children: ["To-do", r.action_id ? ` #${r.action_id}` : ''] })
                                                        : !r.on ? _jsx("span", { className: "muted", children: "(optional)" }) : null] })] }, r.key)))] }, lic))), plan.can_send && _jsxs("div", { className: "row end", style: { marginTop: 14 }, children: [_jsx("button", { className: "ghost", onClick: onClose, children: picked.length ? 'Not now' : 'Close' }), _jsx("button", { className: "primary", disabled: !!busy || !picked.length || !splitOk, onClick: queue, children: busy === 'send' ? 'Sending…' : `Send ${picked.length} to METRC` })] }), _jsx("p", { className: "muted small", children: "Send makes METRC to-dos (Compliance > METRC). They follow the New strain switches in Compliance > Settings > METRC through T3 (Off, Approve, Auto) and Dry run / Live, like every other METRC action." })] })] }) }));
}
/** coded nursery strains: the code, the real name, and what METRC has under the code */
export function StrainCodesSheet({ sb, onClose }) {
    const [rows, setRows] = useState(null);
    const [err, setErr] = useState(null);
    const [q, setQ] = useState('');
    useEffect(() => { sb.rpc('metrc_strain_codes').then(({ data, error }) => { if (error)
        setErr(error.message);
    else
        setRows((data ?? [])); }); }, []);
    const shown = (rows ?? []).filter(r => !q || `${r.code} ${r.name} ${r.aliases.join(' ')}`.toLowerCase().includes(q.toLowerCase()));
    function exportIt() {
        const out = (rows ?? []).flatMap(r => (r.items.length ? r.items : [null]).map(i => [r.code, r.name, r.aliases.join(', '), r.active ? 'Yes' : 'No',
            i?.license ?? '', i ? (i.what === 'strain' ? 'Strain' : 'Item') : '', i?.name ?? '', i?.status === 'in_metrc' ? 'In METRC' : i ? 'To-do' : '']));
        download(`METRC strain codes ${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + toCsv(['Code', 'Strain', 'Other names', 'Active', 'License', 'Type', 'METRC name', 'Status'], out));
    }
    return (_jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: "sheet form wide", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsx("h2", { children: "METRC strain codes" }), _jsx("button", { className: "ghost", onClick: onClose, children: "\u2715" })] }), _jsx("p", { className: "muted small", children: "Nursery strains that go into METRC on 1PN as a number. Everyone in the app still sees the real name." }), err && _jsx("div", { className: "warnbox", children: err }), _jsxs("div", { className: "row toolbar", children: [_jsx("input", { className: "search", type: "search", placeholder: "Search code or strain", value: q, onChange: e => setQ(e.target.value) }), _jsx("button", { className: "ghost small", disabled: !rows?.length, onClick: exportIt, children: "Download as spreadsheet" })] }), !rows ? (err ? null : _jsx("p", { className: "muted", children: "Loading\u2026" })) : !rows.length ? _jsx("p", { className: "muted", children: "No coded strains yet. Tick \"use the number code\" on a strain's METRC sheet." }) : (_jsxs("table", { className: "tbl", style: { width: '100%' }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: { textAlign: 'left' }, children: "Code" }), _jsx("th", { style: { textAlign: 'left' }, children: "Strain" }), _jsx("th", { style: { textAlign: 'left' }, children: "In METRC on 1PN" })] }) }), _jsx("tbody", { children: shown.map(r => (_jsxs("tr", { children: [_jsx("td", { children: _jsx("b", { children: r.code }) }), _jsxs("td", { children: [r.name, !r.active && _jsx("span", { className: "muted", children: " \u00B7 retired" }), r.aliases.length ? _jsxs("div", { className: "muted small", children: ["also: ", r.aliases.join(', ')] }) : null] }), _jsxs("td", { className: "small", children: [r.items.filter(i => i.what === 'item').map(i => _jsxs("div", { children: [i.name, i.status !== 'in_metrc' && _jsx("span", { className: "muted", children: " (to-do)" })] }, i.name)), !r.items.length && _jsx("span", { className: "muted", children: "nothing yet" })] })] }, r.id))) })] }))] }) }));
}
/** Item generator: many strains at once (a new crop year, a new season, an item added to the rules later). Same plan and
 *  queue as one strain's METRC sheet, filtered by license and item type; only what METRC doesn't have yet is made. */
export function ItemGeneratorSheet({ sb, flash, onClose }) {
    const yr = new Date().getFullYear();
    const [strains, setStrains] = useState(null);
    const [lics, setLics] = useState([]);
    const [rules, setRules] = useState([]);
    const [pick, setPick] = useState(new Set());
    const [q, setQ] = useState('');
    const [years, setYears] = useState([yr + 1]);
    const [seasons, setSeasons] = useState(['FL']);
    const [licOn, setLicOn] = useState(null);
    const [fin, setFin] = useState(null); // license_kind|finish
    const [withStrain, setWithStrain] = useState(true);
    const [preview, setPreview] = useState(null);
    const [busy, setBusy] = useState(null);
    const [canSend, setCanSend] = useState(false);
    useEffect(() => {
        sb.from('strains').select('id,name,active,trial,metrc_coded').order('name').then(r => setStrains((r.data ?? [])));
        sb.from('licenses').select('license_no,kind,site').eq('active', true).in('kind', ['cultivation', 'processor', 'nursery']).order('sort').then(r => {
            const l = (r.data ?? []);
            setLics(l);
            setLicOn(new Set(l.map(x => x.license_no)));
        });
        sb.from('metrc_item_rules').select('license_kind,finish,default_on').order('license_kind').order('sort').then(r => {
            const rs = (r.data ?? []);
            setRules(rs);
            setFin(new Set(rs.filter(x => x.default_on).map(x => `${x.license_kind}|${x.finish}`)));
        });
    }, []);
    useEffect(() => { setPreview(null); }, [pick, years, seasons, licOn, fin, withStrain]);
    const shown = (strains ?? []).filter(s => s.active && (!q || s.name.toLowerCase().includes(q.toLowerCase())));
    const flip = (set, v) => set(x => { const n = new Set(x); if (n.has(v))
        n.delete(v);
    else
        n.add(v); return n; });
    async function look() {
        if (!licOn || !fin)
            return;
        setBusy('look');
        const ids = [...pick], out = [];
        try {
            for (let i = 0; i < ids.length; i += 6) {
                const part = await Promise.all(ids.slice(i, i + 6).map(id => loadStrainPlan(sb, id, { years, seasons })));
                for (const p of part) {
                    setCanSend(p.can_send);
                    const rows = p.rows.filter(r => r.state === 'new' && licOn.has(r.license)
                        && (r.what === 'strain' ? withStrain : fin.has(`${r.license_kind}|${r.finish}`)));
                    // an item needs its strain on that license: keep the strain row when an item there is picked
                    const need = new Set(rows.filter(r => r.what === 'item').map(r => r.license));
                    const extra = p.rows.filter(r => r.what === 'strain' && r.state === 'new' && need.has(r.license) && !rows.includes(r));
                    const all = [...extra, ...rows];
                    out.push({ id: p.strain.id, name: p.strain.name, keys: all.map(r => r.key), rows: all });
                }
            }
            setPreview(out);
        }
        catch (e) {
            flash(e.message, true);
        }
        finally {
            setBusy(null);
        }
    }
    async function queue() {
        if (!preview)
            return;
        setBusy('send');
        let n = 0, done = 0;
        try {
            for (const p of preview.filter(x => x.keys.length)) {
                const { data, error } = await sb.rpc('metrc_strain_queue', { p_strain: p.id, p_keys: p.keys, p_opts: { years, seasons } });
                if (error)
                    throw new Error(`${p.name}: ${error.message}`);
                const r = data;
                n += r.strains + r.items;
                done++;
            }
            metrcRun(sb, { action: 'kick' }).catch(() => { });
            flash(`${n} METRC to-dos made for ${done} strain${done === 1 ? '' : 's'}. They follow the New strain switches in Compliance > Settings > METRC through T3.`);
            setPreview(null);
        }
        catch (e) {
            flash(`Stopped after ${done} strains (${n} to-dos): ${e.message}`, true);
        }
        finally {
            setBusy(null);
        }
    }
    const total = (preview ?? []).reduce((a, p) => a + p.keys.length, 0);
    const kinds = [...new Set(rules.map(r => r.license_kind))];
    return (_jsx("div", { className: "scrim", onClick: onClose, children: _jsxs("div", { className: "sheet form wide", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "sheet-h", children: [_jsx("h2", { children: "METRC item generator" }), _jsx("button", { className: "ghost", onClick: onClose, children: "\u2715" })] }), _jsx("p", { className: "muted small", children: "Make METRC items for many strains at once: a new crop year, a new season, or an item type added later. Only what METRC doesn't have yet is made. Coded nursery strains use their code." }), _jsxs("div", { className: "row", style: { gap: 14, margin: '8px 0' }, children: [_jsx("span", { className: "muted small", children: "Crop years" }), [yr, yr + 1].map(y => _jsxs("label", { className: "check small-check", children: [_jsx("input", { type: "checkbox", checked: years.includes(y), onChange: e => setYears(ys => { const n = e.target.checked ? [...ys, y] : ys.filter(x => x !== y); return n.length ? n.sort() : ys; }) }), " ", y] }, y)), _jsx("span", { className: "muted small", children: "Nursery seasons" }), ['FL', 'SP'].map(se => _jsxs("label", { className: "check small-check", children: [_jsx("input", { type: "checkbox", checked: seasons.includes(se), onChange: e => setSeasons(ss => { const n = e.target.checked ? [...ss, se] : ss.filter(x => x !== se); return n.length ? n : ss; }) }), " ", se === 'FL' ? 'Fall' : 'Spring'] }, se))] }), _jsxs("div", { className: "row", style: { gap: 14, margin: '8px 0' }, children: [_jsx("span", { className: "muted small", children: "Licenses" }), lics.map(l => _jsxs("label", { className: "check small-check", children: [_jsx("input", { type: "checkbox", checked: !!licOn?.has(l.license_no), onChange: () => setLicOn(x => { const n = new Set(x ?? []); if (n.has(l.license_no))
                                        n.delete(l.license_no);
                                    else
                                        n.add(l.license_no); return n; }) }), " ", l.site, " ", KIND[l.kind]] }, l.license_no))] }), kinds.map(k => _jsxs("div", { className: "row", style: { gap: 10, margin: '4px 0' }, children: [_jsx("span", { className: "muted small", style: { minWidth: 80 }, children: KIND[k] }), rules.filter(r => r.license_kind === k).map(r => _jsxs("label", { className: "check small-check", children: [_jsx("input", { type: "checkbox", checked: !!fin?.has(`${k}|${r.finish}`), onChange: () => setFin(x => { const n = new Set(x ?? []); const key = `${k}|${r.finish}`; if (n.has(key))
                                        n.delete(key);
                                    else
                                        n.add(key); return n; }) }), " ", FIN[r.finish] ?? r.finish] }, r.finish))] }, k)), _jsxs("label", { className: "check small-check", style: { margin: '6px 0' }, children: [_jsx("input", { type: "checkbox", checked: withStrain, onChange: e => setWithStrain(e.target.checked) }), " Also make the strain where METRC doesn't have it"] }), _jsxs("div", { className: "row toolbar", style: { marginTop: 10 }, children: [_jsx("input", { className: "search", type: "search", placeholder: "Search strains", value: q, onChange: e => setQ(e.target.value) }), _jsx("button", { className: "ghost small", onClick: () => setPick(x => { const n = new Set(x); shown.filter(s => !s.trial).forEach(s => n.add(s.id)); return n; }), children: "Select all shown (not trials)" }), _jsxs("button", { className: "ghost small", disabled: !pick.size, onClick: () => setPick(new Set()), children: ["Clear (", pick.size, ")"] })] }), _jsx("div", { style: { maxHeight: 220, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 10, padding: '4px 8px' }, children: !strains ? _jsx("p", { className: "muted", children: "Loading\u2026" }) : shown.map(s => _jsxs("label", { className: "check small-check", style: { margin: '3px 0' }, children: [_jsx("input", { type: "checkbox", checked: pick.has(s.id), onChange: () => flip(setPick, s.id) }), " ", s.name, s.trial ? _jsx("span", { className: "muted", children: " \u00B7 trial" }) : null, s.metrc_coded ? _jsx("span", { className: "muted", children: " \u00B7 coded" }) : null] }, s.id)) }), preview && _jsxs("div", { style: { margin: '10px 0' }, children: [_jsxs("b", { children: [total, " to make"] }), " ", _jsxs("span", { className: "muted small", children: ["across ", preview.filter(p => p.keys.length).length, " strains (", preview.filter(p => !p.keys.length).length, " already have everything)"] }), _jsx("div", { style: { maxHeight: 220, overflow: 'auto', marginTop: 6 }, className: "small", children: preview.filter(p => p.keys.length).map(p => _jsxs("details", { children: [_jsxs("summary", { children: [p.name, ": ", p.keys.length] }), p.rows.map(r => _jsxs("div", { className: "muted", children: [r.license, " \u00B7 ", r.what === 'strain' ? `Strain ${r.name}` : r.name] }, r.key))] }, p.id)) })] }), _jsxs("div", { className: "row end", style: { marginTop: 12 }, children: [_jsx("button", { className: "ghost", disabled: !!busy || !pick.size, onClick: look, children: busy === 'look' ? 'Checking…' : 'Preview' }), _jsx("button", { className: "primary", disabled: !!busy || !preview || !total || !canSend, onClick: queue, children: busy === 'send' ? 'Sending…' : `Send ${total} to METRC` })] }), preview && !canSend && _jsx("p", { className: "muted small", children: "Only Cultivation, Nursery or Compliance Admins (or Admin) can send to METRC." })] }) }));
}
