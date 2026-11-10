import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Select } from '../combo';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CultApi } from './api';
import { makeCtx } from './calc';
import { HarvestSheet, ScheduleTab } from './schedule';
import { WeekTab } from './week';
import { TestingTab } from './testing';
import { AvailabilityTab } from './avail';
import { PlantingsTab } from './plantings';
import { YieldsTab } from './yields';
import { PlanTab } from './plan';
import { SetupTab } from './setup';
import { CultDashboard } from './dash';
import { errText } from './ui';
import './cult.css';
import { cultLabel } from './tabs';
import { t } from '../i18n';
import { ActivityTab, ReviewTab } from './review';
import { HarvestTab } from './harvest';
import { OpsLogs } from '../logs';
import { useScanHandler } from '../scanroute';
const remembered = (k, d) => { try {
    return localStorage.getItem(k) || d;
}
catch {
    return d;
} };
const remember = (k, v) => { try {
    localStorage.setItem(k, v);
}
catch { /* private mode */ } };
export default function CultView({ backend, flash, onPalletsChanged, tab, go }) {
    const api = useMemo(() => { const sb = backend.client(); return sb ? new CultApi(sb) : null; }, [backend]);
    const [site, setSiteS] = useState(() => remembered('cult.site', '') || null);
    const [year, setYear] = useState(null);
    const [logId, setLogId] = useState(null);
    useEffect(() => { if (tab !== 'harvest')
        setLogId(null); }, [tab]);
    const [d, setD] = useState(null);
    const [err, setErr] = useState(null);
    const [q, setQ] = useState('');
    const [open, setOpen] = useState(null);
    const setSite = (s) => { setSiteS(s); remember('cult.site', s ?? ''); };
    const load = useCallback(async () => {
        if (!api)
            return;
        try {
            setD(await api.load(year));
            setErr(null);
        }
        catch (e) {
            setErr(errText(e));
        }
    }, [api, year]);
    useEffect(() => { load(); }, [load]);
    const c = useMemo(() => d && makeCtx(d), [d]);
    const saved = useCallback(async (msg) => { await load(); flash(msg); if (/pallet/i.test(msg))
        onPalletsChanged(); }, [load, flash, onPalletsChanged]);
    // 281: the Scan button in Cultivation opens the planting a plant tag belongs to: its batch tags (immature planting)
    // or its flowering tags (flowering plant batch). Package tags fall through to the pallet card.
    const [openPl, setOpenPl] = useState(null);
    useScanHandler(async (tag) => {
        const sb = backend.client();
        if (!sb || !d)
            return false;
        const T = tag.trim().toUpperCase();
        const r = await sb.from('tag_assignments').select('planting_id,purpose,prefix,first_label,last_label,active').lte('first_label', T).gte('last_label', T).order('active', { ascending: false }).limit(20);
        const hit = (r.data ?? [])
            .find(x => x.planting_id != null && T.startsWith(x.prefix.toUpperCase()) && x.first_label.length === T.length && x.last_label.length === T.length);
        if (!hit)
            return false;
        if (!d.plantings.some(p => p.id === hit.planting_id)) {
            flash(t('That tag is on a planting from another crop year. Switch the season to see it.'), true);
            return true;
        }
        go('plantings');
        setOpenPl(o => ({ id: hit.planting_id, n: (o?.n ?? 0) + 1 }));
        return true;
    });
    if (!api)
        return _jsxs("div", { className: "list", children: [_jsx("h2", { children: "Cultivation" }), _jsx("p", { className: "muted", children: "Cultivation needs the database (not available in the demo)." })] });
    if (err)
        return _jsxs("div", { className: "list", children: [_jsx("h2", { children: "Cultivation" }), _jsxs("div", { className: "warnbox", children: ["Couldn't load cultivation data. If this is the first time, run 018_modules_sites_fields.sql and 019_cultivation.sql in Supabase. (", err, ")"] })] });
    if (!d || !c)
        return _jsxs("div", { className: "list", children: [_jsx("h2", { children: "Cultivation" }), _jsx("p", { className: "muted", children: "Loading\u2026" })] });
    return (_jsxs("div", { className: "cult", children: [_jsxs("div", { className: "chead", children: [tab === 'dashboard' ? _jsx("span", { className: "dev", children: t('in development') }) : _jsxs("h2", { children: [tab === 'setup' ? t('Cultivation settings') : t(cultLabel(tab)), " ", _jsx("span", { className: "dev", children: t('in development') })] }), _jsxs("div", { className: "row", children: [tab !== 'plan' && tab !== 'setup' && tab !== 'activity' && tab !== 'logs' && _jsx(Select, { value: d.year, onChange: e => setYear(Number(e.target.value)), children: [...new Set([...d.years, d.currentYear + 1])].sort((a, b) => b - a).map(y => _jsxs("option", { value: y, children: [y, " season"] }, y)) }), tab !== 'plan' && tab !== 'setup' && tab !== 'activity' && tab !== 'logs' && _jsx("div", { className: "seg", children: [null, ...d.sites.map(s => s.code)].map(s => _jsx("button", { className: site === s ? 'on' : '', onClick: () => setSite(s), children: s ?? 'All' }, s ?? 'all')) })] })] }), ['schedule', 'avail', 'plantings', 'yields', 'plan'].includes(tab) &&
                _jsx("div", { className: "row toolbar", children: _jsx("input", { className: "search", type: "search", placeholder: "Search strain, field, notes", value: q, onChange: e => setQ(e.target.value) }) }), tab === 'dashboard' && _jsx(CultDashboard, { d: d, c: c, site: site, onOpen: setOpen, go: go }), tab === 'schedule' && _jsx(ScheduleTab, { d: d, c: c, site: site, q: q, onOpen: setOpen, api: api, flash: flash, onSaved: saved }), tab === 'week' && _jsx(WeekTab, { d: d, c: c, site: site, onOpen: setOpen }), tab === 'testing' && _jsx(TestingTab, { d: d, c: c, site: site, api: api, flash: flash, onSaved: saved }), tab === 'avail' && _jsx(AvailabilityTab, { d: d, c: c, site: site, q: q, api: api, flash: flash, onSaved: saved }), tab === 'plantings' && _jsx(PlantingsTab, { d: d, c: c, site: site, q: q, api: api, flash: flash, onSaved: saved, openId: openPl?.id }, openPl?.n ?? 0), tab === 'yields' && _jsx(YieldsTab, { d: d, c: c, site: site, q: q, api: api }), tab === 'plan' && _jsx(PlanTab, { d: d, c: c, api: api, flash: flash, q: q }), tab === 'harvest' && _jsx(HarvestTab, { openFirst: logId, d: d, c: c, site: site, api: api, flash: flash, onSaved: async (m) => { await load(); flash(m); } }, logId ?? 'list'), tab === 'review' && _jsx(ReviewTab, { d: d, c: c, site: site, onOpen: setOpen, go: go }), tab === 'activity' && _jsx(ActivityTab, { api: api }), tab === 'logs' && backend.client() && _jsx(OpsLogs, { sb: backend.client(), module: "cultivation", sites: d.sites.map(s => s.code), flash: flash, areas: d.fields.filter(f => f.active).map(f => `Block ${f.code}`), strains: [...new Set(d.harvests.map(h => h.strain))].sort(), canEditRecipes: true, fieldAcres: Object.fromEntries(d.fields.filter(f => f.acres).flatMap(f => [[`Block ${f.code}`, f.acres], [`Field ${f.code}`, f.acres], [f.name, f.acres]])) }), tab === 'setup' && _jsx(SetupTab, { d: d, api: api, sb: backend.client(), flash: flash, onSaved: saved }), open && _jsx(HarvestSheet, { d: d, c: c, harvest: open, api: api, flash: flash, onClose: () => setOpen(null), onLog: id => { setOpen(null); setLogId(id); go('harvest'); }, onSaved: async (m) => { setOpen(null); await saved(m); } }, open.id ?? 'new')] }));
}
