import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { tagTxt } from '../mtag';
import { StrainLink } from '../strainCard';
import { TagInput } from '../taginput';
import { useBack, scrollTop } from '../nav';
import { useEffect, useRef, useState } from 'react';
import { addDays, appHarvestName, calcHarvest, fieldName, fmtD, KIND_LABEL, n0, n1, sum, today } from './calc';
import { DateIn, errText, F, NumIn, TextIn } from './ui';
import { can } from '../fold';
import { nextTag } from './schedule';
import { HarvestDayCard } from './harvestday';
// Cultivation > Harvest: log a harvest as it happens. Built for a phone in the field or the pack shed.
// Fresh frozen: raw bins, then each pallet as it's made (it lands in Staging on the freezer map right away).
// Dry flower: raw weight only (bucking and trimming belong to Processing later).
// Combine biomass: each tote's dry weight. Stripper header: log the cut, it dries, then enter the dry weight.
const STEP = { ff: 'Raw bins, then pallets', dry: 'Raw weight', combine: 'Dry weight per tote', strip: 'Cut, dry, then dry weight' };
export function HarvestTab({ d, c, site, api, flash, onSaved, openFirst }) {
    const [day, setDay] = useState(today());
    const [openId, setOpenId] = useState(openFirst ?? null);
    const hs = d.harvests.filter(h => (!site || h.site === site) && h.status !== 'cancelled');
    const open = d.harvests.find(h => h.id === openId && h.status !== 'cancelled');
    useBack(!!open, () => setOpenId(null));
    if (open)
        return _jsx(LogPage, { h: open, d: d, c: c, api: api, flash: flash, onSaved: onSaved, back: () => setOpenId(null) });
    const now = today();
    const going = hs.filter(h => h.stage === 'harvesting');
    const drying = hs.filter(h => h.stage === 'drying');
    const planned = hs.filter(h => h.status === 'planned' && !h.stage && h.planned_on === day);
    // the week after the picked day, grouped by day
    const weekEnd = addDays(day, 7);
    const ahead = hs.filter(h => h.status === 'planned' && !h.stage && h.planned_on && h.planned_on > day && h.planned_on <= weekEnd);
    const aheadDays = [...new Set(ahead.map(h => h.planned_on))].sort();
    const behind = day === now ? hs.filter(h => h.status === 'planned' && !h.stage && h.planned_on && h.planned_on < now) : [];
    const done = hs.filter(h => h.status === 'done' && h.harvested_on === day);
    // a harvest day card per site with fresh frozen work that day (the picked site only, when one is picked)
    const daySites = site ? (hs.some(h => h.kind === 'ff') ? [site] : []) : [...new Set([...going, ...planned, ...done].filter(h => h.kind === 'ff').map(h => h.site))].sort();
    const card = (h, extra) => _jsx(HCard, { h: h, c: c, name: appHarvestName(h, d.harvests, c), extra: extra, onOpen: () => { setOpenId(h.id); scrollTop(); }, start: h.status === 'planned' && !h.stage && h.planned_on != null && h.planned_on <= now }, h.id);
    const order = (a, b) => (a.sched_order ?? 1e9) - (b.sched_order ?? 1e9) || a.site.localeCompare(b.site) || a.strain.localeCompare(b.strain);
    return (_jsxs("div", { className: "hlog", children: [_jsxs("div", { className: "row wrap hday", children: [_jsx("button", { className: "ghost small hday-arw", "aria-label": "Day before", onClick: () => setDay(addDays(day, -1)), children: "\u2039" }), _jsx(DateIn, { value: day, onChange: v => setDay(v ?? now) }), _jsx("button", { className: "ghost small hday-arw", "aria-label": "Next day", onClick: () => setDay(addDays(day, 1)), children: "\u203A" }), day !== now && _jsx("button", { className: "ghost small", onClick: () => setDay(now), children: "Today" })] }), daySites.map(s => _jsx(HarvestDayCard, { site: s, day: day, api: api, flash: flash }, `${s}-${day}`)), going.length > 0 && _jsxs("section", { children: [_jsx("h3", { className: "csec", children: "Harvesting now" }), going.map(h => card(h, `Started ${fmtD(h.harvested_on, true)}`))] }), _jsxs("section", { children: [_jsx("h3", { className: "csec", children: day === now ? 'On the schedule today' : `Scheduled ${fmtD(day, true)}` }), planned.length ? _jsx(DayGroup, { label: day === now ? 'Today' : fmtD(day, true), hs: [...planned].sort(order), c: c, card: card, startOpen: true }, `d-${day}`)
                        : _jsxs("p", { className: "muted", children: ["Nothing scheduled", site ? ` at ${site}` : '', aheadDays.length ? '' : ' this week', ". Pick another day, or add the harvest on the Schedule."] })] }), _jsxs("section", { children: [_jsxs("h3", { className: "csec", children: ["Next 7 days ", _jsxs("span", { className: "muted", children: ["through ", fmtD(weekEnd, true), " \u00B7 tap a day to see its harvests"] })] }), aheadDays.length ? aheadDays.map(dd => _jsx(DayGroup, { label: fmtD(dd, true), hs: ahead.filter(h => h.planned_on === dd).sort(order), c: c, card: card }, dd))
                        : _jsxs("p", { className: "muted", children: ["Nothing else scheduled", site ? ` at ${site}` : '', " in the next 7 days."] })] }), drying.length > 0 && _jsxs("section", { children: [_jsx("h3", { className: "csec", children: "Drying" }), drying.map(h => card(h, `Cut ${fmtD(h.harvested_on, true)} · enter the dry weight when it's out`))] }), behind.length > 0 && _jsxs("section", { children: [_jsxs("h3", { className: "csec", children: ["Not logged yet ", _jsx("span", { className: "muted", children: "from earlier days" })] }), behind.map(h => card(h, `Scheduled ${fmtD(h.planned_on, true)}`))] }), done.length > 0 && _jsxs("section", { children: [_jsxs("h3", { className: "csec", children: ["Finished ", day === now ? 'today' : fmtD(day, true)] }), done.map(h => card(h, 'Done'))] })] }));
}
/** a day on the harvest list: totals first (Jordan: projected FF lbs, dry lbs), tap to see the strains */
function DayGroup({ label, hs, c, card, startOpen }) {
    const [open, setOpen] = useState(!!startOpen);
    const ks = hs.map(h => calcHarvest(c, h));
    const ff = sum(ks.map(k => k.estFF)), dry = sum(ks.map(k => k.estDry)), raw = sum(ks.map(k => k.estRaw)), bio = sum(ks.map(k => k.estBiomass));
    const plants = sum(hs.filter(h => h.kind === 'ff' || h.kind === 'dry').map(h => h.plants));
    const buck = sum(ks.map(k => k.buckPeople)), deleaf = sum(ks.map(k => k.deleafPeople)), ice = sum(ks.map(k => k.dryIce));
    const sites = [...new Set(hs.map(h => h.site))].join(' + ');
    return (_jsxs("div", { className: `hdaygrp${open ? ' open' : ''}`, children: [_jsxs("button", { className: "hdaysum", onClick: () => setOpen(o => !o), "aria-expanded": open, children: [_jsxs("div", { className: "hdaysum-h", children: [_jsx("b", { children: label }), " ", _jsxs("span", { className: "muted", children: [sites, " \u00B7 ", hs.length, " harvest", hs.length === 1 ? '' : 's'] }), _jsx("span", { className: "hgo", children: open ? '▾' : '▸' })] }), _jsxs("div", { className: "hdaysum-k", children: [ff > 0 && _jsxs("span", { children: [_jsxs("b", { children: ["~", n0(ff)] }), " FF lbs"] }), dry > 0 && _jsxs("span", { children: [_jsxs("b", { children: ["~", n0(dry)] }), " dry lbs ", _jsxs("em", { className: "muted", children: ["(", n0(raw), " wet)"] })] }), bio > 0 && _jsxs("span", { children: [_jsxs("b", { children: ["~", n0(bio)] }), " biomass lbs"] }), plants > 0 && _jsxs("span", { children: [_jsx("b", { children: n0(plants) }), " plants"] }), buck > 0 && _jsxs("span", { children: [_jsx("b", { children: n0(buck) }), " buckers"] }), deleaf > 0 && _jsxs("span", { children: [_jsx("b", { children: n0(deleaf) }), " deleafers"] }), ice > 0 && _jsxs("span", { children: [_jsx("b", { children: n0(ice) }), " lbs dry ice"] })] })] }), open && _jsx("div", { className: "hdaygrp-list", children: hs.map(h => card(h)) })] }));
}
/** one harvest on the list: what it is, how big, and where it's at */
function HCard({ h, c, name, extra, onOpen, start }) {
    const k = calcHarvest(c, h);
    const pl = h.planting_id ? c.planting.get(h.planting_id) : undefined;
    const trial = !!pl?.trial || c.field.get(h.field_id ?? -1)?.kind === 'trials';
    const going = h.stage === 'harvesting';
    const plants = h.plants_harvested ?? h.plants;
    const est = h.kind === 'ff' ? k.estFF : h.kind === 'dry' ? k.estRaw : k.estBiomass;
    const logged = h.kind === 'ff' ? k.palletLbs : h.kind === 'dry' ? (k.actRaw ?? 0) : Number(h.dry_lbs ?? 0);
    const rawLbs = sum(h.raw_bins);
    const pct = est ? Math.min(100, Math.round(((logged || 0) / est) * 100)) : null;
    const facts = [];
    if (plants)
        facts.push(`${n0(plants)} plants`);
    if (h.kind === 'ff') {
        if (k.estFF)
            facts.push(`~${n0(k.estFF)} lbs FF`);
        // 255: lbs/plant is the estimate until the plants harvested are saved, then the real number
        if (h.plants_harvested && logged > 0)
            facts.push(`${n1(logged / h.plants_harvested)} lbs/plant`);
        else if (h.est_lbs_per_plant)
            facts.push(`${n1(h.est_lbs_per_plant)} lbs/plant est.`);
        if (!going && h.status === 'planned') {
            if (k.deleafPeople)
                facts.push(`${k.deleafPeople} deleafers`);
            if (k.buckPeople)
                facts.push(`${k.buckPeople} buckers`);
            if (k.dryIce)
                facts.push(`${n0(k.dryIce)} lbs dry ice`);
        }
    }
    else if (h.kind === 'dry') {
        if (k.estRaw)
            facts.push(`~${n0(k.estRaw)} lbs wet`);
        if (k.estDry)
            facts.push(`~${n0(k.estDry)} lbs dry`);
    }
    else {
        if (h.acres)
            facts.push(`${n1(h.acres)} acres`);
        if (k.estBiomass)
            facts.push(`~${n0(k.estBiomass)} lbs biomass`);
    }
    if (h.metrc_name && h.metrc_name !== name)
        facts.push(`METRC ${h.metrc_name}`);
    return (_jsxs("div", { className: "li setrow hcard", role: "button", tabIndex: 0, onClick: onOpen, onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen();
        } }, children: [_jsxs("div", { className: "grow", children: [_jsxs("div", { children: [_jsx("b", { children: h.strain }), trial && _jsxs(_Fragment, { children: [" ", _jsx("span", { className: "kpill k-trial", title: "Trial strain", children: "Trial" })] }), (h.day_no ?? 1) > 1 && _jsxs(_Fragment, { children: [" ", _jsxs("span", { className: "kpill s-planned", children: ["Day ", h.day_no] })] }), " ", _jsxs("span", { className: "muted", children: [h.site, " ", fieldName(c, h.field_id)] }), " ", _jsx("span", { className: `kpill k-${h.kind}`, children: KIND_LABEL[h.kind] })] }), _jsx("div", { className: "muted small", children: name }), _jsx("div", { className: "hfacts", children: facts.map((f, i) => _jsx("span", { children: f }, i)) }), (going || logged > 0) && h.kind === 'ff' ? _jsxs("div", { className: "hprog", children: [_jsx("div", { className: "hprog-bar", children: _jsx("i", { style: { width: `${pct ?? 0}%` } }) }), _jsxs("span", { children: [k.pallets.length, " pallet", k.pallets.length === 1 ? '' : 's', " \u00B7 ", _jsx("b", { children: n0(logged) }), " lbs packed", est ? ` of ~${n0(est)} (${pct}%)` : '', rawLbs ? ` · ${n0(rawLbs)} lbs raw in ${h.raw_bins.length} bin${h.raw_bins.length === 1 ? '' : 's'}` : ''] })] })
                        : _jsxs("div", { className: "muted small", children: [extra ?? STEP[h.kind], logged > 0 ? ` · ${n0(logged)} lbs logged` : ''] }), going && extra && _jsx("div", { className: "muted small", children: extra })] }), start && _jsx("button", { className: "primary small hstart", onClick: e => { e.stopPropagation(); onOpen(); }, children: "Start" }), _jsx("span", { className: "hgo", children: "\u203A" })] }));
}
function LogPage({ h, d, c, api, flash, onSaved, back }) {
    const [ws, setWs] = useState(null);
    const [busy, setBusy] = useState(false);
    const [metrc, setMetrc] = useState(null);
    const k = calcHarvest(c, h);
    const loadW = () => api.weights(h.id).then(setWs).catch(e => { setWs([]); flash(errText(e), true); });
    const loadM = () => api.metrcStatus().then(m => setMetrc(m.get(h.id) ?? null)).catch(() => setMetrc(null));
    useEffect(() => { loadW(); loadM(); }, [h.id]);
    const run = async (f, ok) => {
        setBusy(true);
        try {
            await f();
            await Promise.all([loadW(), loadM(), onSaved(ok)]);
        }
        catch (e) {
            flash(errText(e), true);
        }
        finally {
            setBusy(false);
        }
    };
    const raw = (ws ?? []).filter(w => w.kind === 'raw'), totes = (ws ?? []).filter(w => w.kind === 'tote'), dry = (ws ?? []).filter(w => w.kind === 'dry');
    const pallets = k.pallets.filter(p => p.status !== 'archived').sort((a, b) => a.id - b.id);
    const done = h.status === 'done';
    const canFix = can('cultivation', 'edit_finished');
    const [editing, setEditing] = useState(false);
    const locked = done && !editing;
    const pl = h.planting_id ? c.planting.get(h.planting_id) : undefined;
    const trial = !!pl?.trial || c.field.get(h.field_id ?? -1)?.kind === 'trials';
    // 158: combine harvests make Dry Biomass pallets, numbered B1, B2...
    const prefix = h.kind === 'combine' ? 'B' : trial ? 'T' : c.site.get(h.site)?.pallet_prefix ?? 'P';
    // plants still standing in the planting (before this harvest)
    const leftBefore = pl ? Math.max((pl.plants ?? 0) - (pl.plant_loss ?? 0) - sum(d.harvests.filter(x => x.planting_id === pl.id && x.id !== h.id && x.status === 'done' && x.kind === h.kind).map(x => x.plants_harvested ?? 0)), 0) : null;
    const rawLbs = sum(raw.map(w => w.lbs)) || sum(h.raw_bins);
    return (_jsxs("div", { className: "hlog", children: [_jsx("button", { className: "ghost small hback", onClick: back, children: "\u2039 Harvest" }), _jsxs("h2", { children: [_jsx(StrainLink, { name: h.strain }), " ", trial && _jsx("span", { className: "kpill k-trial", title: "Trial strain", children: "Trial" }), " ", (h.day_no ?? 1) > 1 && _jsxs("span", { className: "kpill s-planned", children: ["Day ", h.day_no] }), " ", _jsxs("span", { className: "muted", children: [h.site, " ", fieldName(c, h.field_id)] })] }), h.planted_strain && h.planted_strain !== h.strain && _jsxs("p", { className: "muted small", children: ["Planted as ", h.planted_strain, " (renamed at harvest; the planting keeps its name)"] }), _jsxs("div", { className: "row wrap", children: [_jsx("span", { className: `kpill k-${h.kind}`, children: KIND_LABEL[h.kind] }), _jsxs("span", { className: "muted", children: [done ? `Finished · harvested ${fmtD(h.harvested_on, true)}` : h.stage === 'drying' ? `Drying since ${fmtD(h.harvested_on, true)}` : h.stage === 'harvesting' ? `Harvesting · started ${fmtD(h.harvested_on, true)}` : `Scheduled ${fmtD(h.planned_on, true)}`, h.plants ? ` · ${n0(h.plants)} plants scheduled` : '', h.acres ? ` · ${n1(h.acres)} acres` : ''] })] }), _jsx("p", { className: "small", style: { margin: '6px 0 0' }, children: _jsx("b", { children: appHarvestName(h, d.harvests, c) }) }), _jsx(BatchName, { h: h, api: api, busy: busy, run: run }), metrc && metrc.open > 0 && _jsxs("p", { className: "cnote", children: ["Waiting on METRC: ", metrc.open, " step", metrc.open === 1 ? '' : 's', " on the Compliance to-do list", metrc.due ? `, next due ${new Date(metrc.due).toLocaleString([], { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : '', "."] }), !locked && (h.kind === 'ff' || h.kind === 'dry') && _jsx(Rename, { h: h, d: d, api: api, busy: busy, run: run }), (h.kind === 'ff' || h.kind === 'dry' || h.kind === 'combine') && _jsx(Plants, { h: h, api: api, busy: busy, done: locked, run: run, leftBefore: leftBefore }), h.kind === 'ff' && _jsxs(_Fragment, { children: [(h.stage === 'harvesting' || done) && _jsx(HarvestDayCard, { site: h.site, day: h.stage === 'harvesting' ? today() : h.harvested_on ?? today(), api: api, flash: flash }), _jsxs("div", { className: "ckpis hk", children: [_jsxs("div", { children: [_jsx("b", { children: n0(k.palletLbs) }), _jsxs("span", { children: ["lbs packed", k.estFF ? ` of ~${n0(k.estFF)}` : ''] })] }), _jsxs("div", { children: [_jsx("b", { children: pallets.length }), _jsxs("span", { children: ["pallets (", pallets.filter(p => p.pushed !== false).length, " pushed)"] })] }), _jsxs("div", { children: [_jsx("b", { children: n0(rawLbs) }), _jsxs("span", { children: ["lbs raw (", raw.length || h.raw_bins.length, " bin", (raw.length || h.raw_bins.length) === 1 ? '' : 's', ")"] })] }), _jsxs("div", { children: [_jsx("b", { children: k.palletLbs && (h.plants_harvested ?? h.plants) ? n1(k.palletLbs / (h.plants_harvested ?? h.plants)) : '' }), _jsxs("span", { children: ["lbs / plant", h.est_lbs_per_plant ? ` (est ${n1(h.est_lbs_per_plant)})` : ''] })] })] }), _jsx(Weights, { title: "Raw bins", kind: "raw", rows: raw, busy: busy, done: locked, unit: "bin", admin: canFix, onAdd: lbs => run(() => api.logWeight(h.id, 'raw', lbs), `Bin ${n0(lbs)} lbs`), onRemove: id => run(() => api.removeWeight(id), 'Removed'), onEdit: (id, lbs) => run(() => api.editWeight(id, lbs), `Bin changed to ${n1(lbs)} lbs`) }), _jsx(PalletLog, { h: h, api: api, busy: busy, done: locked, pallets: pallets, run: run, prefix: prefix }), !locked && _jsx(BulkPallets, { h: h, api: api, busy: busy, run: run, prefix: prefix, pallets: pallets })] }), h.kind === 'dry' && _jsxs(_Fragment, { children: [_jsxs("div", { className: "ckpis hk", children: [_jsxs("div", { children: [_jsx("b", { children: n0(rawLbs) }), _jsxs("span", { children: ["lbs raw", k.estRaw ? ` of ~${n0(k.estRaw)}` : ''] })] }), _jsxs("div", { children: [_jsx("b", { children: raw.length || h.raw_bins.length }), _jsxs("span", { children: ["bin", (raw.length || h.raw_bins.length) === 1 ? '' : 's'] })] })] }), _jsx(Weights, { title: "Raw weight", kind: "raw", rows: raw, busy: busy, done: locked, unit: "bin", admin: canFix, onAdd: lbs => run(() => api.logWeight(h.id, 'raw', lbs), `Bin ${n0(lbs)} lbs`), onRemove: id => run(() => api.removeWeight(id), 'Removed'), onEdit: (id, lbs) => run(() => api.editWeight(id, lbs), `Bin changed to ${n1(lbs)} lbs`) }), _jsx("p", { className: "cnote", children: "Only the raw weight is logged here. Finishing sends the plants and wet weight to the METRC to-do list. Bucking and trimming are logged in Processing." })] }), h.kind === 'combine' && _jsxs(_Fragment, { children: [_jsxs("div", { className: "ckpis hk", children: [_jsxs("div", { children: [_jsx("b", { children: n0(sum(pallets.map(p => p.og_weight)) + sum(totes.map(w => w.lbs))) }), _jsxs("span", { children: ["lbs Dry Biomass", k.estBiomass ? ` of ~${n0(k.estBiomass)}` : ''] })] }), _jsxs("div", { children: [_jsx("b", { children: pallets.length }), _jsxs("span", { children: ["pallets (", pallets.filter(p => p.pushed !== false).length, " pushed)"] })] })] }), _jsx(PalletLog, { h: h, api: api, busy: busy, done: locked, pallets: pallets, run: run, prefix: prefix }), !locked && _jsx(BulkPallets, { h: h, api: api, busy: busy, run: run, prefix: prefix, pallets: pallets }), _jsx("p", { className: "cnote", children: "Dry Biomass pallets (B numbers) go to the freezers or reefers like fresh frozen. Pushing sends the plants and the pallet weight to METRC as the harvest, and each pallet becomes a Dry Biomass package (SU before Sept 1, FL after)." }), totes.length > 0 && _jsx(Weights, { title: "Totes (logged before Dry Biomass pallets)", kind: "tote", rows: totes, busy: busy, done: true, unit: "tote", site: h.site, withTag: true, onAdd: (lbs, tag) => run(() => api.logWeight(h.id, 'tote', lbs, tag), `Tote ${n0(lbs)} lbs`), onRemove: id => run(() => api.removeWeight(id), 'Removed') })] }), h.kind === 'strip' && _jsx(StripLog, { h: h, api: api, busy: busy, done: locked, dry: dry, run: run, estDry: k.estBiomass }), !done && (h.kind !== 'strip' || h.stage === 'drying') && _jsx(Finish, { h: h, busy: busy, run: run, api: api, back: back, raw: raw, pallets: pallets, ready: h.kind === 'ff' ? pallets.length > 0 : h.kind === 'dry' ? raw.length > 0 || h.raw_bins.length > 0 : h.kind === 'combine' ? pallets.length > 0 || totes.length > 0 : dry.length > 0 }), done && !canFix && _jsx("p", { className: "cnote", children: "Finished. Only a Cultivation Admin can change a finished harvest." }), done && canFix && !editing && _jsxs("div", { className: "row hfin", children: [_jsx("button", { className: "ghost", onClick: () => setEditing(true), children: "Edit finished harvest\u2026" }), _jsx("span", { className: "muted", children: "Fix totals, add a forgotten bin or pallet, or remove one logged by mistake." })] }), done && canFix && editing && _jsx(FixTotals, { flash: flash, h: h, api: api, busy: busy, run: run, k: k, onDone: () => setEditing(false) }), d.year !== d.currentYear && _jsxs("p", { className: "cnote", children: ["This is the ", d.year, " season."] })] }));
}
/** the METRC harvest name: saved once the plants go to METRC; before that, what it will be. Cultivation Admins can change it until then. */
function BatchName({ h, api, busy, run }) {
    const [b, setB] = useState(null);
    const [ed, setEd] = useState(null);
    useEffect(() => { let on = true; api.batchName(h.id).then(x => { if (on)
        setB(x); }).catch(() => { if (on)
        setB(null); }); return () => { on = false; }; }, [h.id, h.metrc_name, h.harvested_on, h.strain, h.field_id]);
    const name = b?.name ?? h.metrc_name;
    if (!name)
        return null;
    const canEdit = !b?.in_metrc && can('cultivation', 'edit_finished');
    if (ed != null)
        return (_jsxs("div", { className: "row wrap", style: { gap: 8, margin: '6px 0' }, children: [_jsx("input", { value: ed, onChange: e => setEd(e.target.value), style: { minWidth: 280 }, placeholder: b?.generated ?? '' }), _jsx("button", { className: "primary small", disabled: busy, onClick: () => run(() => api.save('cult_harvests', { id: h.id, metrc_name: ed.trim() || null }), ed.trim() ? 'METRC name set' : 'METRC name back to the standard one').then(() => setEd(null)), children: "Save" }), _jsx("button", { className: "ghost small", onClick: () => setEd(null), children: "Cancel" }), b?.generated && _jsxs("span", { className: "muted small", children: ["Blank = ", b.generated] })] }));
    return (_jsxs("p", { className: "muted small", style: { margin: '4px 0' }, children: ["METRC harvest ", _jsx("b", { children: name }), b && !b.in_metrc && _jsxs(_Fragment, { children: [" \u00B7 ", b.saved ? 'typed by hand' : 'set when the plants go to METRC'] }), b && !b.in_metrc && b.metrc_date && b.metrc_date !== h.harvested_on && _jsxs(_Fragment, { children: [" \u00B7 METRC harvest date ", fmtD(b.metrc_date, true), " (the day it's pushed)"] }), canEdit && _jsxs(_Fragment, { children: [" \u00B7 ", _jsx("a", { className: "linkbtn", onClick: () => setEd(b?.saved ? name : ''), children: "Change" })] })] }));
}
/** planting mix-up: the harvest (and its pallets) take the strain it really is; the planting keeps its planted name */
function Rename({ h, d, api, busy, run }) {
    const [open, setOpen] = useState(false);
    const [v, setV] = useState(null);
    if (!can('cultivation', 'rename_harvest', 'user'))
        return null;
    if (!open)
        return _jsx("div", { className: "row hfin", children: _jsxs("button", { className: "linkbtn", onClick: () => setOpen(true), children: ["Not ", h.strain, "? Rename this harvest\u2026"] }) });
    return (_jsxs("section", { className: "dcard", children: [_jsxs("div", { className: "dcard-h", children: [_jsx("h3", { children: "Rename this harvest" }), _jsx("button", { className: "linkbtn", onClick: () => setOpen(false), children: "Close" })] }), _jsxs("p", { className: "muted small", children: ["For a planting mix-up. The harvest and its pallets take the new name; the planting stays ", h.planted_strain ?? h.strain, "."] }), _jsxs("div", { className: "hpal", children: [_jsxs("label", { className: "htag", children: [_jsx("span", { children: "It's really" }), _jsx(TextIn, { value: v, onChange: setV, list: "cult-strains-all", placeholder: "Strain", autoFocus: true })] }), _jsx("datalist", { id: "cult-strains-all", children: d.strains.filter(s => s.active !== false).map(s => _jsx("option", { value: s.name }, s.name)) }), _jsx("button", { className: "primary", disabled: busy || !v?.trim(), onClick: () => run(() => api.rename(h.id, v.trim()), `Renamed to ${v}`).then(() => setOpen(false)), children: "Rename" })] })] }));
}
/** plants harvested: starts as the scheduled plants; METRC harvests this many plants into the batch at push */
function Plants({ h, api, busy, done, run, leftBefore }) {
    const saved = h.plants_harvested ?? h.plants ?? null;
    const [v, setV] = useState(saved);
    useEffect(() => setV(h.plants_harvested ?? h.plants ?? null), [h.plants_harvested, h.plants]);
    const left = leftBefore == null ? null : Math.max(leftBefore - (v ?? 0), 0);
    const changed = v !== (h.plants_harvested ?? null);
    return (_jsxs("section", { className: "dcard", children: [_jsxs("div", { className: "dcard-h", children: [_jsx("h3", { children: "Plants harvested" }), (h.metrc_plants ?? 0) > 0 && _jsxs("span", { className: "muted small", children: [n0(h.metrc_plants), " in METRC"] })] }), _jsxs("div", { className: "hadd", children: [_jsx("input", { type: "number", inputMode: "numeric", value: v ?? '', disabled: done, onChange: e => setV(e.target.value === '' ? null : Number(e.target.value)), "aria-label": "Plants harvested" }), !done && _jsx("button", { className: "primary", disabled: busy || v == null || !changed, onClick: () => run(() => api.setPlants(h.id, v), `${n0(v)} plants`), children: h.plants_harvested == null ? 'Confirm' : 'Save' })] }), _jsxs("p", { className: "muted small", children: [h.plants_harvested == null && !done ? `Filled in from the schedule (${h.plants ? n0(h.plants) : 'none'}). Change it if the crew cut more or fewer.` : '', left != null ? ` ${n0(left)} plant${left === 1 ? '' : 's'} left in the planting after this.` : ''] })] }));
}
/** a list of weights with a quick add box (Enter adds). Tap a bin to fix it while it isn't in METRC yet. */
function Weights({ title, kind, rows, busy, done, unit, withTag, site, admin, onAdd, onRemove, onEdit }) {
    const [v, setV] = useState('');
    const [tag, setTag] = useState('');
    const [ed, setEd] = useState(null);
    const ref = useRef(null);
    const add = () => { const n = Number(v); if (!(n > 0))
        return; onAdd(n, tag.trim() || null); setV(''); setTag(''); ref.current?.focus(); };
    const open = (r) => !done && (!r.pushed || admin);
    const saveEd = () => { if (ed && Number(ed.v) > 0 && onEdit)
        onEdit(ed.id, Number(ed.v)); setEd(null); };
    return (_jsxs("section", { className: "dcard", children: [_jsxs("div", { className: "dcard-h", children: [_jsxs("h3", { children: [title, " ", _jsxs("span", { className: "muted", children: [rows.length, " \u00B7 ", n0(sum(rows.map(r => r.lbs))), " lbs"] })] }), rows.some(r => r.pushed) && rows.some(r => !r.pushed) && _jsxs("span", { className: "muted small", children: [rows.filter(r => !r.pushed).length, " not in METRC yet"] })] }), !done && _jsxs("div", { className: "hadd", children: [_jsx("input", { ref: ref, type: "number", inputMode: "decimal", placeholder: `${unit} lbs`, value: v, onChange: e => setV(e.target.value), onKeyDown: e => { if (e.key === 'Enter')
                            add(); }, "data-kind": kind }), withTag && _jsx(TagInput, { compact: true, value: tag, onChange: setTag, where: { site: site ?? null, purpose: 'harvest' }, disabled: busy, placeholder: "Tag (optional)" }), _jsxs("button", { className: "primary", disabled: busy || !(Number(v) > 0), onClick: add, children: ["Add ", unit] })] }), rows.length > 0 && _jsx("div", { className: "binrow", children: rows.map((r, i) => ed?.id === r.id
                    ? _jsx("span", { className: "binedit", children: _jsx("input", { type: "number", inputMode: "decimal", autoFocus: true, value: ed.v, onChange: e => setEd({ id: r.id, v: e.target.value }), onKeyDown: e => { if (e.key === 'Enter')
                                saveEd(); if (e.key === 'Escape')
                                setEd(null); }, onBlur: saveEd, "aria-label": `${unit} ${i + 1} lbs` }) }, r.id)
                    : _jsxs("span", { title: (r.tag ?? '') + (r.pushed ? ' · in METRC' : ''), className: r.pushed ? 'inmetrc' : '', children: [onEdit && open(r) ? _jsxs("a", { className: "binfix", onClick: () => !busy && setEd({ id: r.id, v: String(r.lbs) }), children: [i + 1, ": ", n1(r.lbs)] }) : _jsxs(_Fragment, { children: [i + 1, ": ", n1(r.lbs)] }), r.tag ? ` · ${tagTxt(r.tag)}` : '', open(r) && _jsx("a", { onClick: () => !busy && onRemove(r.id), children: "\u00D7" })] }, r.id)) }), onEdit && !done && rows.length > 0 && _jsxs("p", { className: "muted small", children: ["Tap a ", unit, " to fix its weight.", rows.some(r => r.pushed) ? ' Bins with a check are already in METRC.' : ''] })] }));
}
/** P + the METRC tag's last 4 digits: 1A4…10053 → P53 (trials: T053). Used only where a site has no tag rule. */
export function palletFromTag(tag, prefix = 'P') {
    const m = /(\d{4})$/.exec(tag.trim());
    if (!m)
        return '';
    const n = Number(m[1]);
    return n ? prefix + (prefix === 'T' ? String(n).padStart(3, '0') : String(n)) : '';
}
/** fresh frozen pallets: logged as they're made (not pushed), fixed freely, then pushed to METRC as packages */
function PalletLog({ h, api, busy, done, pallets, run, prefix }) {
    const last = pallets[pallets.length - 1];
    const [lbs, setLbs] = useState(650);
    const [boxes, setBoxes] = useState(last?.boxes ?? null);
    const [partial, setPartial] = useState(false);
    const [next, setNext] = useState(null);
    const [code, setCode] = useState(null);
    const [tag, setTag] = useState(null);
    const [pick, setPick] = useState(new Set());
    const [edit, setEdit] = useState(null);
    useEffect(() => { if (!done)
        api.nextPallet(h.id).then(setNext).catch(() => setNext(null)); }, [h.id, pallets.length, done]);
    const shownCode = code ?? next?.code ?? '';
    const shownTag = tag ?? (code == null ? next?.tag ?? '' : '');
    const waiting = pallets.filter(p => p.pushed === false);
    const pushed = pallets.filter(p => p.pushed !== false);
    const canPush = can('cultivation', 'push', 'user');
    const canUnpush = can('cultivation', 'unpush');
    async function save() {
        const c = shownCode.trim();
        // a tag typed or cleared by hand wins; otherwise the database makes it from the pallet # (site tag rule)
        await run(() => api.addPallets(h.id, [{ lbs: lbs, tag: shownTag.trim(), code: c || undefined, boxes, partial, pending: tag != null && !tag.trim() }]), `Pallet ${c} saved: ${n0(lbs)} lbs, in Staging (not pushed yet)`);
        setPartial(false);
        setLbs(650);
        setCode(null);
        setTag(null);
    }
    async function push(ids) {
        const list = ids ? waiting.filter(p => ids.includes(p.id)) : waiting;
        const pending = list.filter(p => !p.package_tag);
        if (pending.length && !window.confirm(`${pending.map(p => p.code).join(', ')} ha${pending.length === 1 ? 's' : 've'} no METRC tag. Push as tag pending?`))
            return;
        const plantsFirst = h.plants_harvested == null ? h.plants : null;
        if (h.plants_harvested == null) {
            if (!h.plants) {
                window.alert('Enter the plants harvested first (above). METRC harvests the plants into the batch at the first push.');
                return;
            }
            if (!window.confirm(`Plants harvested: ${n0(h.plants)} (from the schedule). Push with that? Cancel to change it first.`))
                return;
        }
        await run(async () => {
            if (plantsFirst)
                await api.setPlants(h.id, plantsFirst);
            return api.push(h.id, ids, pending.length > 0);
        }, `${list.length} pallet${list.length === 1 ? '' : 's'} pushed. The packages are on the METRC to-do list.`);
        setPick(new Set());
    }
    const tog = (id) => setPick(s => { const n = new Set(s); if (n.has(id))
        n.delete(id);
    else
        n.add(id); return n; });
    return (_jsxs("section", { className: "dcard", children: [_jsx("div", { className: "dcard-h", children: _jsxs("h3", { children: ["Pallets ", _jsxs("span", { className: "muted", children: [pallets.length, " \u00B7 ", n0(sum(pallets.map(p => p.og_weight))), " lbs"] })] }) }), !done && _jsxs("div", { className: "hpal", children: [_jsxs("label", { children: [_jsx("span", { children: "Weight" }), _jsx(NumIn, { value: lbs, onChange: setLbs })] }), _jsxs("label", { children: [_jsx("span", { children: "Boxes" }), _jsx(NumIn, { value: boxes, onChange: setBoxes })] }), _jsxs("label", { children: [_jsxs("span", { children: ["Pallet # ", code != null && next && code !== next.code ? _jsxs("a", { className: "linkbtn", onClick: () => { setCode(null); setTag(null); }, children: ["use ", next.code] }) : _jsx("em", { className: "muted", children: "(next)" })] }), _jsx("input", { value: shownCode, placeholder: `${prefix}…`, onChange: e => { setCode(e.target.value.toUpperCase().replace(/\s/g, '')); setTag(null); }, style: { width: 110 } })] }), _jsxs("label", { className: "htag", children: [_jsxs("span", { children: ["METRC tag ", tag == null && code == null && next?.tag ? (next.available === false ? _jsx("em", { className: "warn-t", children: "(from the pallet #, but not on METRC's available list: check it)" }) : _jsx("em", { className: "muted", children: "(from the pallet #)" }))
                                        : tag == null && code != null ? _jsx("em", { className: "muted", children: "(from the pallet # when saved)" }) : !shownTag ? _jsx("em", { className: "muted", children: "(blank = pending)" }) : null] }), _jsx(TagInput, { value: shownTag, onChange: setTag, where: { site: h.site, purpose: 'harvest' }, disabled: busy, placeholder: code != null ? 'Auto from pallet #' : 'Last digits or scan' })] }), shownCode && pallets.some(p => p.code === shownCode) && _jsxs("p", { className: "warn-t small", children: [shownCode, " is already on this harvest."] }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: partial, onChange: e => setPartial(e.target.checked) }), " ", _jsx("span", { children: "Last pallet (partial)" })] }), _jsx("button", { className: "primary", disabled: busy || !(Number(lbs) > 0), onClick: save, children: "Save pallet" }), _jsxs("p", { className: "cnote", children: ["Saved pallets go into ", h.site, " Staging on the freezer map and can be moved, but they aren't packages until they're pushed. Fix anything before you push."] })] }), waiting.length > 0 && _jsxs(_Fragment, { children: [_jsxs("h4", { className: "csec", children: ["Not pushed ", _jsxs("span", { className: "muted", children: [waiting.length, " \u00B7 ", n0(sum(waiting.map(p => p.og_weight))), " lbs"] })] }), _jsx("div", { className: "dlist", children: [...waiting].reverse().map(p => edit === p.id
                            ? _jsx(EditPallet, { p: p, busy: busy, onCancel: () => setEdit(null), onSave: x => run(() => api.editPallet(p.id, x), `${x.code ?? p.code} fixed`).then(() => setEdit(null)) }, p.id)
                            : _jsxs("div", { className: "drow", children: [canPush && !done && _jsx("input", { type: "checkbox", checked: pick.has(p.id), onChange: () => tog(p.id), "aria-label": `Pick ${p.code}` }), _jsxs("span", { className: "grow", children: [_jsx("b", { children: p.code }), " ", _jsx(PalletTime, { p: p, api: api, run: run, busy: busy }), " ", _jsxs("span", { className: "muted", children: [p.boxes ? `${p.boxes} boxes · ` : '', p.package_tag ? tagTxt(p.package_tag, 8) : _jsx("em", { className: "warn-t", children: "tag pending" }), p.partial ? ' · partial' : ''] })] }), _jsxs("b", { children: [n0(Number(p.og_weight)), " lbs"] }), !done && _jsxs(_Fragment, { children: [_jsx("button", { className: "ghost small", disabled: busy, onClick: () => setEdit(p.id), children: "Edit" }), _jsx("button", { className: "ghost small", disabled: busy, title: "Logged by mistake", onClick: () => run(() => api.removePallet(p.id), `${p.code} removed`), children: "\u2715" })] })] }, p.id)) }), !done && canPush && _jsxs("div", { className: "row wrap hpush", children: [_jsxs("button", { className: "primary", disabled: busy, onClick: () => push(null), children: ["Push all ", waiting.length, " to METRC"] }), pick.size > 0 && pick.size < waiting.length && _jsxs("button", { className: "ghost", disabled: busy, onClick: () => push([...pick]), children: ["Push ", pick.size, " picked"] })] }), !done && !canPush && _jsx("p", { className: "cnote", children: "A Cultivation lead pushes these to METRC." }), _jsx("p", { className: "cnote", children: "Push puts the plants and the raw bins into the METRC batch, then makes a package for each pallet (on the Compliance METRC to-do list)." })] }), pushed.length > 0 && _jsxs(_Fragment, { children: [waiting.length > 0 && _jsxs("h4", { className: "csec", children: ["Pushed ", _jsxs("span", { className: "muted", children: [pushed.length, " \u00B7 ", n0(sum(pushed.map(p => p.og_weight))), " lbs"] })] }), _jsx("div", { className: "dlist", children: [...pushed].reverse().map(p => (_jsxs("div", { className: "drow", children: [_jsxs("span", { className: "grow", children: [_jsx("b", { children: p.code }), " ", _jsx(PalletTime, { p: p, api: api, run: run, busy: busy }), " ", _jsxs("span", { className: "muted", children: [p.boxes ? `${p.boxes} boxes · ` : '', p.package_tag ? tagTxt(p.package_tag, 8) : 'tag pending', p.partial ? ' · partial' : ''] })] }), _jsxs("b", { children: [n0(Number(p.og_weight)), " lbs"] }), !done && canUnpush && _jsx("button", { className: "ghost small", disabled: busy, title: "Take it back to Not pushed (only if METRC hasn't been done)", onClick: () => run(() => api.unpush(p.id), `${p.code} un-pushed`), children: "Un-push" }), done && _jsx("button", { className: "ghost small", disabled: busy, title: "Logged by mistake", onClick: () => run(() => api.removePallet(p.id), `${p.code} removed`), children: "\u2715" })] }, p.id))) })] })] }));
}
/** when the pallet was finished: the save time unless someone fixed it. Tap to fix (Jordan's sheet: the time the last box was tagged). */
function PalletTime({ p, api, run, busy }) {
    const at = p.built_at ?? p.created_at;
    const [ed, setEd] = useState(null);
    if (!at)
        return null;
    const d = new Date(at);
    const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const shown = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (ed != null)
        return _jsxs("span", { className: "ptime", children: [_jsx("input", { type: "time", value: ed, autoFocus: true, onChange: e => setEd(e.target.value), "aria-label": `${p.code} time`, onKeyDown: e => { if (e.key === 'Escape')
                        setEd(null); } }), _jsx("button", { className: "primary small", disabled: busy || !ed, onClick: () => run(() => api.setPalletTime(p.id, ed), `${p.code} time ${ed}`).then(() => setEd(null)), children: "Save" }), p.built_at && _jsx("button", { className: "ghost small", disabled: busy, title: "Back to when it was saved", onClick: () => run(() => api.setPalletTime(p.id, null), `${p.code} back to its save time`).then(() => setEd(null)), children: "Reset" }), _jsx("button", { className: "ghost small", onClick: () => setEd(null), children: "\u2715" })] });
    return _jsxs("a", { className: "ptime binfix", title: p.built_at ? 'Time fixed by hand. Tap to change.' : 'When it was saved. Tap to fix.', onClick: () => !busy && setEd(hhmm), children: [shown, p.built_at ? '*' : ''] });
}
function EditPallet({ p, busy, onSave, onCancel }) {
    const [lbs, setLbs] = useState(p.og_weight);
    const [boxes, setBoxes] = useState(p.boxes ?? null);
    const [code, setCode] = useState(p.code);
    const [tag, setTag] = useState(p.package_tag ?? '');
    const [partial, setPartial] = useState(!!p.partial);
    const tagChanged = tag !== (p.package_tag ?? '');
    return (_jsx("div", { className: "dcard hedit", children: _jsxs("div", { className: "hpal", children: [_jsxs("label", { children: [_jsx("span", { children: "Weight" }), _jsx(NumIn, { value: lbs, onChange: setLbs })] }), _jsxs("label", { children: [_jsx("span", { children: "Boxes" }), _jsx(NumIn, { value: boxes, onChange: setBoxes })] }), _jsxs("label", { children: [_jsx("span", { children: "Pallet #" }), _jsx("input", { value: code, onChange: e => setCode(e.target.value.toUpperCase().replace(/\s/g, '')) })] }), _jsxs("label", { className: "htag", children: [_jsxs("span", { children: ["METRC tag ", code !== p.code && !tagChanged ? _jsx("em", { className: "muted", children: "(follows the new pallet #)" }) : null] }), _jsx(TagInput, { value: tag, onChange: setTag, where: { pallet: p.id, purpose: 'harvest' }, keep: p.package_tag, disabled: busy, placeholder: "Last digits or scan (blank = pending)" })] }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", checked: partial, onChange: e => setPartial(e.target.checked) }), " ", _jsx("span", { children: "Partial" })] }), _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost", onClick: onCancel, children: "Cancel" }), _jsx("button", { className: "primary", disabled: busy || !(Number(lbs) > 0), onClick: () => onSave({ lbs, boxes, partial, ...(code !== p.code ? { code } : {}),
                                ...(tagChanged ? (tag ? { tag } : { pending: true }) : {}) }), children: "Save" })] })] }) }));
}
function StripLog({ h, api, busy, done, dry, run, estDry }) {
    const [day, setDay] = useState(h.planned_on && h.planned_on < today() ? h.planned_on : today());
    const [acres, setAcres] = useState(h.acres);
    if (!h.stage && !done)
        return (_jsxs("section", { className: "dcard", children: [_jsx("div", { className: "dcard-h", children: _jsx("h3", { children: "Log the cut" }) }), _jsx("p", { className: "muted", children: "Stripper header material comes off wet and isn't weighed until it's dry. Log the cut now; it waits under Drying until the dry weight is in." }), _jsxs("div", { className: "hpal", children: [_jsxs("label", { children: [_jsx("span", { children: "Cut on" }), _jsx(DateIn, { value: day, onChange: setDay })] }), _jsxs("label", { children: [_jsx("span", { children: "Acres" }), _jsx(NumIn, { value: acres, onChange: setAcres })] }), _jsx("button", { className: "primary", disabled: busy, onClick: () => run(() => api.startDrying(h.id, day, acres), 'Cut logged, now drying'), children: "Cut done, start drying" })] })] }));
    return _jsxs(_Fragment, { children: [_jsxs("div", { className: "ckpis hk", children: [_jsxs("div", { children: [_jsx("b", { children: n0(sum(dry.map(w => w.lbs))) }), _jsxs("span", { children: ["lbs dry", estDry ? ` of ~${n0(estDry)}` : ''] })] }), _jsxs("div", { children: [_jsx("b", { children: dry.length }), _jsx("span", { children: "weights" })] })] }), _jsx(Weights, { title: "Dry weight", kind: "dry", rows: dry, busy: busy, done: done, unit: "weight", site: h.site, withTag: true, onAdd: (lbs, tag) => run(() => api.logWeight(h.id, 'dry', lbs, tag), `Dry ${n0(lbs)} lbs`), onRemove: id => run(() => api.removeWeight(id), 'Removed') })] });
}
function Finish({ h, busy, run, api, back, ready, raw, pallets }) {
    const [plants, setPlants] = useState(h.plants_harvested ?? h.plants);
    const [notes, setNotes] = useState('');
    const [open, setOpen] = useState(null);
    const [on, setOn] = useState(null);
    const waiting = pallets.filter(p => p.pushed === false);
    const wet = sum(raw.map(w => w.lbs)) || sum(h.raw_bins);
    const packed = sum(pallets.map(p => Number(p.og_weight ?? 0)));
    const waste = Math.max(wet - packed, 0);
    const blocked = h.kind === 'ff' && waiting.length > 0;
    const flower = h.kind === 'ff' || h.kind === 'dry';
    // opened by mistake: nothing logged yet, so it can go back on the schedule
    const nothing = h.stage === 'harvesting' && raw.length === 0 && h.raw_bins.length === 0 && pallets.length === 0 && !(Number(h.metrc_plants ?? 0) > 0) && !(Number(h.metrc_wet_lbs ?? 0) > 0);
    if (!open)
        return (_jsxs("div", { className: "row wrap hfin", children: [_jsx("button", { className: "ghost", disabled: busy || !ready || blocked, onClick: () => setOpen('finish'), children: "Finish harvest\u2026" }), flower && _jsx("button", { className: "ghost", disabled: busy || !ready || blocked, onClick: () => setOpen('continue'), children: "Continue tomorrow\u2026" }), !ready ? _jsx("span", { className: "muted", children: "Log something first." }) : blocked ? _jsxs("span", { className: "muted", children: ["Push every pallet first (", waiting.length, " not pushed)."] }) : null, nothing && _jsx("button", { className: "ghost", disabled: busy, onClick: () => run(() => api.unstart(h.id), `${h.strain} is back on the schedule${h.planned_on ? ` for ${fmtD(h.planned_on, true)}` : ''}`).then(back), children: "Didn't start: back on the schedule" })] }));
    const cont = open === 'continue';
    return (_jsxs("section", { className: "dcard", children: [_jsx("div", { className: "dcard-h", children: _jsx("h3", { children: cont ? 'Continue tomorrow' : 'Finish harvest' }) }), cont && _jsx("p", { className: "muted small", children: "Today's part is finished as its own harvest. A new harvest is added for the rest of the planting, with its own METRC name (the next harvest number for this planting)." }), h.kind === 'ff' && wet > 0 && _jsxs("p", { className: "cnote", children: ["METRC: waste of ", _jsxs("b", { children: [n1(waste), " lbs"] }), " (raw ", n1(wet), " \u2212 packed ", n1(packed), ") is recorded 48 hours after you finish, then the harvest is finished in METRC. Both go on the Compliance to-do list."] }), h.kind === 'dry' && _jsxs("p", { className: "cnote", children: ["METRC: the plants and ", n1(wet), " lbs wet weight go on the Compliance to-do list."] }), _jsxs("div", { className: "hpal", children: [flower && _jsxs("label", { children: [_jsxs("span", { children: ["Plants harvested", cont ? ' today' : ''] }), _jsx(NumIn, { value: plants, onChange: setPlants })] }), cont && _jsxs("label", { children: [_jsx("span", { children: "Next day" }), _jsx(DateIn, { value: on, onChange: setOn })] }), _jsxs("label", { className: "htag", children: [_jsx("span", { children: "Notes" }), _jsx("input", { value: notes, onChange: e => setNotes(e.target.value), placeholder: "Optional" })] }), _jsxs("div", { className: "row", children: [_jsx("button", { className: "ghost", onClick: () => setOpen(null), children: "Not yet" }), cont
                                ? _jsx("button", { className: "primary", disabled: busy, onClick: () => run(() => api.continueTomorrow(h.id, plants, on, notes || null), 'Today finished. Tomorrow is on the schedule.').then(back), children: "Finish today, continue tomorrow" })
                                : _jsx("button", { className: "primary", disabled: busy, onClick: () => run(() => api.finish(h.id, plants, notes || null), 'Harvest finished').then(back), children: "Finish" })] })] })] }));
}
/** back-fill: several pallets at once (how many × lbs each); numbers and tags come from the next free pallet numbers */
function BulkPallets({ h, api, busy, run, prefix, pallets }) {
    const [open, setOpen] = useState(false);
    const [n, setN] = useState(null);
    const [lbs, setLbs] = useState(650);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const set = (i, v) => setRows(rs => rs.map((x, j) => (j === i ? { ...x, ...v } : x)));
    const dup = rows.map(r => r.code).filter((c, i, a) => c && (a.indexOf(c) !== i || pallets.some(p => p.code === c)));
    if (!open)
        return _jsxs("div", { className: "row hfin", children: [_jsx("button", { className: "ghost", disabled: busy, onClick: () => setOpen(true), children: "Back-fill several pallets\u2026" }), _jsx("span", { className: "muted", children: "From paper, after the fact" })] });
    async function addRows() {
        const k = Math.min(60, n ?? 1);
        setLoading(true);
        try {
            const out = [];
            for (let i = 0; i < k; i++) {
                const nx = await api.nextPallet(h.id, rows.length + i).catch(() => null);
                out.push({ lbs: lbs ? String(lbs) : '', code: nx?.code ?? '', tag: nx?.tag ?? '' });
            }
            setRows(rs => [...rs, ...out]);
        }
        finally {
            setLoading(false);
        }
    }
    async function make() {
        const good = rows.filter(r => Number(r.lbs) > 0);
        await run(() => api.addPallets(h.id, good.map(r => ({ lbs: Number(r.lbs), tag: r.tag.trim(), code: r.code || undefined, pending: !r.auto && !r.tag.trim() }))), `${good.length} pallet${good.length === 1 ? '' : 's'} added, in Staging (not pushed yet)`);
        setRows([]);
        setOpen(false);
    }
    return (_jsxs("section", { className: "dcard", children: [_jsxs("div", { className: "dcard-h", children: [_jsx("h3", { children: "Back-fill pallets" }), _jsx("button", { className: "linkbtn", onClick: () => { setRows([]); setOpen(false); }, children: "Close" })] }), _jsxs("div", { className: "hpal", children: [_jsxs("label", { children: [_jsx("span", { children: "How many" }), _jsx(NumIn, { value: n, onChange: setN })] }), _jsxs("label", { children: [_jsx("span", { children: "Lbs each" }), _jsx(NumIn, { value: lbs, onChange: setLbs })] }), _jsx("button", { className: "ghost", disabled: !n || n <= 0 || loading, onClick: addRows, children: loading ? 'Numbering…' : 'Add rows' })] }), rows.map((r, i) => (_jsxs("div", { className: "palrow bfrow", children: [_jsx("span", { className: "muted small", children: i + 1 }), _jsx("input", { inputMode: "decimal", placeholder: "lbs", value: r.lbs, onChange: e => set(i, { lbs: e.target.value }) }), _jsx(TagInput, { compact: true, value: r.tag, onChange: tag => set(i, { tag, auto: false }), where: { site: h.site, purpose: 'harvest' }, placeholder: "Tag: last digits (blank = pending)" }), _jsx("input", { className: "bfcode", placeholder: `${prefix}…`, value: r.code, onChange: e => set(i, { code: e.target.value.toUpperCase().replace(/\s/g, ''), tag: '', auto: true }), title: "Pallet # (the tag follows it when saved)" }), _jsx("button", { className: "ghost small", onClick: () => setRows(rs => rs.filter((_, j) => j !== i)), children: "\u2715" })] }, i))), rows.length > 0 && _jsxs(_Fragment, { children: [dup.length > 0 && _jsxs("p", { className: "warn-t small", children: ["Already used: ", [...new Set(dup)].join(', ')] }), _jsxs("div", { className: "row", children: [rows[0].tag && rows.length > 1 && _jsx("button", { className: "ghost small", onClick: () => setRows(rs => rs.map((x, j) => ({ ...x, tag: nextTag(rs[0].tag, j) }))), children: "Number the tags in order from the first" }), _jsxs("button", { className: "primary", disabled: busy || !rows.some(r => Number(r.lbs) > 0) || dup.length > 0, onClick: make, children: ["Create ", rows.length, " pallet", rows.length === 1 ? '' : 's', " (", n0(sum(rows.map(r => Number(r.lbs) || 0))), " lbs)"] })] }), _jsxs("p", { className: "cnote", children: ["Pallet # and tag are the next free numbers (the tag follows the pallet # where the site has a tag rule). New pallets go to ", h.site, " Staging, not pushed."] })] })] }));
}
/** Cultivation Admins: fix a finished harvest's totals, or reopen it */
function FixTotals({ h, api, busy, run, k, onDone, flash }) {
    const [x, setX] = useState(h);
    const set = (v) => setX(s => ({ ...s, ...v }));
    return (_jsxs("section", { className: "dcard", children: [_jsxs("div", { className: "dcard-h", children: [_jsx("h3", { children: "Fix the totals" }), _jsx("span", { className: "muted small", children: "Cultivation Admins only \u00B7 every change is in Activity" })] }), _jsxs("div", { className: "grid3", children: [_jsx(F, { label: "Harvested on", children: _jsx(DateIn, { value: x.harvested_on, onChange: v => set({ harvested_on: v }) }) }), _jsx(F, { label: "Plants harvested", children: _jsx(NumIn, { value: x.plants_harvested, onChange: v => set({ plants_harvested: v }) }) }), _jsx(F, { label: "METRC harvest name", children: _jsx(TextIn, { value: x.metrc_name, onChange: v => set({ metrc_name: v }) }) }), h.kind !== 'combine' && h.kind !== 'strip' && _jsx(F, { label: "Raw lbs", hint: "(blank = bins)", children: _jsx(NumIn, { value: x.raw_lbs, placeholder: sum(h.raw_bins) ? n1(sum(h.raw_bins)) : '', onChange: v => set({ raw_lbs: v }) }) }), h.kind === 'ff' && _jsx(F, { label: "Fresh frozen lbs", hint: "(blank = pallets)", children: _jsx(NumIn, { value: x.ff_lbs, placeholder: k.palletLbs ? n1(k.palletLbs) : '', onChange: v => set({ ff_lbs: v }) }) }), h.kind === 'dry' && _jsxs(_Fragment, { children: [_jsx(F, { label: "Bucked lbs", children: _jsx(NumIn, { value: x.bucked_lbs, onChange: v => set({ bucked_lbs: v }) }) }), _jsx(F, { label: "Trim lbs", children: _jsx(NumIn, { value: x.trim_lbs, onChange: v => set({ trim_lbs: v }) }) }), _jsx(F, { label: "Mold lbs", children: _jsx(NumIn, { value: x.mold_lbs, onChange: v => set({ mold_lbs: v }) }) })] })] }), _jsxs("div", { className: "row wrap", children: [_jsx("button", { className: "primary", disabled: busy, onClick: () => run(() => api.save('cult_harvests', { id: h.id, harvested_on: x.harvested_on, plants_harvested: x.plants_harvested ?? null, metrc_name: x.metrc_name ?? null,
                            raw_lbs: x.raw_lbs ?? null, ff_lbs: x.ff_lbs ?? null, bucked_lbs: x.bucked_lbs ?? null, trim_lbs: x.trim_lbs ?? null, mold_lbs: x.mold_lbs ?? null }), 'Harvest fixed'), children: "Save totals" }), _jsx("button", { className: "ghost", disabled: busy, onClick: async () => {
                            let w = null;
                            await run(async () => { w = await api.reopen(h.id); }, 'Reopened: back to Harvesting. Waste and finish that hadn\'t gone to METRC yet are cancelled');
                            if (w)
                                flash(w, true);
                        }, children: "Reopen harvest" }), _jsx("button", { className: "ghost", onClick: onDone, children: "Done editing" })] }), _jsx("p", { className: "cnote", children: "Bins and pallets above are unlocked while you're editing. Reopen puts it back under Harvesting so the crew can keep logging, then Finish it again. Waste and finish still waiting to go to METRC are cancelled; Finish makes new ones." })] }));
}
