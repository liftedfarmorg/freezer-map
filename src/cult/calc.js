// Cultivation math: the same formulas as the Harvest Scheduling Workbook, done from the database rows.
import { MONTHS_ES, lang } from '../i18n';
// ---------- dates (YYYY-MM-DD strings, no time zones) ----------
export const toDate = (s) => new Date(s + 'T12:00:00');
export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const today = () => iso(new Date());
export const addDays = (s, n) => { const d = toDate(s); d.setDate(d.getDate() + n); return iso(d); };
/** Monday = 1 ... Sunday = 7 (Excel WEEKDAY(x, 2)) */
export const weekday = (s) => ((toDate(s).getDay() + 6) % 7) + 1;
export const monday = (s) => addDays(s, 1 - weekday(s));
export const daysBetween = (a, b) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 864e5);
export const DAY = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAY_LONG = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export function fmtD(s, withDay = false) {
    if (!s)
        return '';
    const d = toDate(s);
    if (lang() === 'es')
        return (withDay ? DAY_ES[weekday(s)] + ' ' : '') + `${d.getDate()} ${MONTHS_ES[d.getMonth()]}`; // 11 oct: no mixing up 10/11 and 11/10
    return (withDay ? DAY[weekday(s)] + ' ' : '') + `${d.getMonth() + 1}/${d.getDate()}`;
}
export const DAY_ES = ['', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
export const n0 = (x) => (x == null || !isFinite(x) ? '' : Math.round(x).toLocaleString());
export const n1 = (x) => (x == null || !isFinite(x) ? '' : (Math.round(x * 10) / 10).toLocaleString());
export const n2 = (x) => (x == null || !isFinite(x) ? '' : (Math.round(x * 100) / 100).toLocaleString());
export const pct = (x) => (x == null || !isFinite(x) ? '' : `${Math.round(x * 1000) / 10}%`);
export const sum = (xs) => xs.reduce((a, b) => a + (b ?? 0), 0);
export const KIND_LABEL = { ff: 'Fresh frozen', dry: 'Dry', combine: 'Combine', strip: 'Strip header' };
/** the in-app harvest name: the METRC harvest name's twin with the strain name instead of the strain code (142)
 *  SITE-Strain-FIELD-MMDDYYYY-N-KIND, e.g. OHR-Jelly Cake x Oreoz-1C-10232026-1-FF. N = harvest number for the planting. Never saved. */
export function appHarvestName(h, all, c) {
    const fid = h.field_id ?? (h.planting_id ? c.planting.get(h.planting_id)?.field_id ?? null : null);
    const field = fid != null ? c.field.get(fid)?.code ?? 'X' : 'X';
    const on = h.harvested_on ?? h.planned_on ?? new Date().toISOString().slice(0, 10);
    const key = (x) => [x.harvested_on ?? x.planned_on ?? '', x.day_no ?? 1, x.id];
    const before = (a, b) => { const x = key(a), y = key(b); return x[0] < y[0] || (x[0] === y[0] && (x[1] < y[1] || (x[1] === y[1] && x[2] < y[2]))); };
    const n = h.planting_id ? 1 + all.filter(o => o.planting_id === h.planting_id && o.id !== h.id && o.status !== 'cancelled' && before(o, h)).length : 1;
    const kind = h.kind === 'ff' ? 'FF' : h.kind === 'dry' ? 'D' : 'BM';
    return `${h.site}-${h.strain}-${field}-${on.slice(5, 7)}${on.slice(8, 10)}${on.slice(0, 4)}-${n}-${kind}`;
}
export const KIND_SHORT = { ff: 'FF', dry: 'Dry', combine: 'Combine', strip: 'Strip' };
export const isBiomass = (k) => k === 'combine' || k === 'strip';
export function makeCtx(d) {
    const palletsOf = new Map();
    for (const p of d.pallets)
        (palletsOf.get(p.harvest_id) ?? palletsOf.set(p.harvest_id, []).get(p.harvest_id)).push(p);
    return {
        site: new Map(d.sites.map(s => [s.code, s])),
        field: new Map(d.fields.map(f => [f.id, f])),
        planting: new Map(d.plantings.map(p => [p.id, p])),
        palletsOf,
        testOfField: new Map(d.tests.filter(t => t.kind === 'area' && t.field_id != null).map(t => [t.field_id, t])),
        testOfHarvest: new Map(d.tests.filter(t => t.kind === 'strain' && t.harvest_id != null).map(t => [t.harvest_id, t])),
        protocol: new Map(d.protocols.map(p => [p.kind, p])),
    };
}
export const fieldName = (c, id) => (id == null ? '?' : c.field.get(id)?.code ?? '?');
export function calcHarvest(c, h) {
    const s = c.site.get(h.site);
    const work = s?.workday_hours || 8;
    const used = [];
    const deleafRate = h.deleaf_rate ?? (s?.deleaf_rate ?? null);
    const buckRate = h.buck_rate ?? (s?.buck_rate ?? null);
    if (h.kind === 'ff' && h.deleaf_rate == null && deleafRate != null)
        used.push('deleaf rate');
    if (h.kind === 'ff' && h.buck_rate == null && buckRate != null)
        used.push('bucking rate');
    const conv = h.dry_conversion ?? s?.dry_conversion ?? 0.075;
    const estFF = h.kind === 'ff' && h.plants != null && h.est_lbs_per_plant != null ? h.plants * h.est_lbs_per_plant : null;
    const estRaw = h.kind === 'dry' && h.plants != null && h.est_raw_per_plant != null ? h.plants * h.est_raw_per_plant : null;
    const estDry = estRaw != null ? estRaw * conv : null;
    const estBiomass = isBiomass(h.kind) && h.acres != null && h.est_yield_per_acre != null ? h.acres * h.est_yield_per_acre : null;
    const dryIce = estFF != null ? (estFF / 10) * (s?.dry_ice_per_10lb ?? 3) : null;
    const dryIceOrder = h.kind === 'ff' && h.planned_on ? addDays(h.planned_on, -(weekday(h.planned_on) - 1) - 5) : null;
    const deleafHours = h.kind === 'ff' && h.plants != null && deleafRate ? h.plants / deleafRate : null;
    const buckHours = estFF != null && buckRate ? estFF / buckRate : null;
    const pallets = (c.palletsOf.get(h.id) ?? []).filter(p => !p.parent_id);
    const palletLbs = sum(pallets.map(p => p.og_weight));
    const actFF = h.kind === 'ff' && h.status === 'done' ? (h.ff_lbs ?? (pallets.length ? palletLbs : null)) : null;
    const actRaw = h.raw_lbs ?? (h.raw_bins.length ? sum(h.raw_bins) : null);
    const actPlants = h.status === 'done' ? (h.plants_harvested ?? h.plants) : null;
    return {
        date: h.planned_on, estFF, estRaw, estDry, estBiomass, dryIce, dryIceOrder,
        deleafRate, deleafHours, deleafPeople: deleafHours != null ? Math.ceil(deleafHours / work) : null,
        buckRate, buckHours, buckPeople: buckHours != null ? Math.ceil(buckHours / work) : null,
        trucks: estRaw != null ? estRaw / (s?.truck_raw_lbs || 10000) : null,
        conv,
        mergeOn: h.kind === 'combine' && h.planned_on && h.days_to_merge != null ? addDays(h.planned_on, h.days_to_merge) : null,
        combineOn: h.kind === 'combine' && h.planned_on && h.days_to_harvest != null ? addDays(h.planned_on, h.days_to_harvest) : null,
        palletLbs, pallets, actFF, actRaw, actPlants,
        actLbsPerPlant: actFF != null && actPlants ? actFF / actPlants : null,
        usedDefaults: used,
    };
}
export function emptyDay() { return { strains: [], plants: 0, lbs: 0, dryIce: 0, buckHours: 0, buckPeople: 0, deleafStrains: [], deleafPlants: 0, deleafHours: 0, deleafPeople: 0 }; }
/** day -> site -> totals, for live (not cancelled) harvests. Harvest columns are by harvest day, deleafing the day before. */
export function daySummary(c, hs, days) {
    const out = new Map();
    for (const d of days)
        out.set(d, new Map());
    const cell = (d, site) => { const m = out.get(d); return m.get(site) ?? m.set(site, emptyDay()).get(site); };
    for (const h of hs) {
        if (h.status === 'cancelled' || !h.planned_on || isBiomass(h.kind))
            continue;
        const k = calcHarvest(c, h);
        if (out.has(h.planned_on)) {
            const x = cell(h.planned_on, h.site);
            x.strains.push(`${h.strain}${h.kind === 'dry' ? ' (dry)' : ''}`);
            x.plants += h.plants ?? 0;
            x.lbs += k.estFF ?? 0;
            x.dryIce += k.dryIce ?? 0;
            x.buckHours += k.buckHours ?? 0;
        }
        const dl = addDays(h.planned_on, -1);
        if (h.kind === 'ff' && out.has(dl)) {
            const x = cell(dl, h.site);
            x.deleafStrains.push(h.strain);
            x.deleafPlants += h.plants ?? 0;
            x.deleafHours += k.deleafHours ?? 0;
        }
    }
    for (const [, m] of out)
        for (const [site, x] of m) {
            const w = c.site.get(site)?.workday_hours || 8;
            x.buckPeople = Math.ceil(x.buckHours / w);
            x.deleafPeople = Math.ceil(x.deleafHours / w);
        }
    return out;
}
export function biomassEvents(c, hs, equipment) {
    const out = [];
    const eq = (i, d) => equipment[i] || d;
    for (const h of hs) {
        if (h.status === 'cancelled' || !isBiomass(h.kind) || !h.planned_on)
            continue;
        const k = calcHarvest(c, h);
        const a = h.acres ?? 0;
        if (h.kind === 'strip') {
            out.push({ date: h.planned_on, activity: 'Strip Harvest', equipment: eq(3, 'Stripper Header'), h, acres: a, lbs: k.estBiomass });
            continue;
        }
        out.push({ date: h.planned_on, activity: 'Cut', equipment: eq(0, 'Swather'), h, acres: a, lbs: null });
        if (k.mergeOn)
            out.push({ date: k.mergeOn, activity: 'Merge', equipment: eq(1, 'Merger'), h, acres: a, lbs: null });
        if (k.combineOn)
            out.push({ date: k.combineOn, activity: 'Harvest', equipment: eq(2, 'Combine'), h, acres: a, lbs: k.estBiomass });
    }
    return out.sort((x, y) => x.date.localeCompare(y.date));
}
function status(first, opens, closes, t, now) {
    if (!first)
        return 'No harvest scheduled';
    if (t?.result || t?.results_on)
        return 'Results received';
    if (t?.submitted_on)
        return 'Submitted';
    if (opens && now < opens)
        return 'Upcoming';
    if (closes && now <= closes)
        return 'ORDER NOW';
    if (now < first)
        return 'Window passed - sample ASAP';
    return 'Harvest started';
}
/** latest sampling day on or before the window closes */
export function suggestedSample(closes, sampleWeekday) {
    const back = (((weekday(closes) - sampleWeekday) % 7) + 7) % 7;
    return addDays(closes, -back);
}
export function testRows(d, c, now = today()) {
    const live = d.harvests.filter(h => h.status !== 'cancelled' && h.planned_on);
    const byField = new Map();
    for (const h of live)
        if (h.field_id != null && h.kind !== 'dry')
            (byField.get(h.field_id) ?? byField.set(h.field_id, []).get(h.field_id)).push(h);
    const area = [];
    const fieldsWith = new Set([...byField.keys(), ...d.tests.filter(t => t.kind === 'area').map(t => t.field_id)]);
    for (const fid of fieldsWith) {
        const f = c.field.get(fid);
        if (!f)
            continue;
        const hs = byField.get(fid) ?? [];
        const ff = hs.filter(h => h.kind === 'ff').map(h => h.planned_on).sort()[0] ?? null;
        const bio = hs.filter(h => isBiomass(h.kind)).map(h => h.planned_on).sort()[0] ?? null;
        const first = [ff, bio].filter(Boolean).sort()[0] ?? null;
        const proto = c.protocol.get(first && first === ff ? 'ff' : 'biomass');
        const opens = first && proto ? addDays(first, -proto.opens_days) : null;
        const closes = first && proto ? addDays(first, -proto.closes_days) : null;
        const t = c.testOfField.get(fid);
        const composite = ff && bio ? 'FF + Biomass' : ff ? 'Fresh Frozen' : bio ? 'Biomass' : '';
        area.push({ key: `a${fid}`, kind: 'area', site: f.site, field_id: fid, first, composite, protocol: proto, opens, closes,
            suggested: closes ? suggestedSample(closes, d.settings.sampleWeekday) : null, status: status(first, opens, closes, t, now), test: t,
            ref: `${composite} | ${f.site} ${f.code}` });
    }
    area.sort((a, b) => a.site.localeCompare(b.site) || (c.field.get(a.field_id)?.sort ?? 0) - (c.field.get(b.field_id)?.sort ?? 0));
    const proto = c.protocol.get('dry');
    const strain = live.filter(h => h.kind === 'dry').sort((a, b) => a.planned_on.localeCompare(b.planned_on)).map(h => {
        const first = h.planned_on;
        const opens = first && proto ? addDays(first, -proto.opens_days) : null;
        const closes = first && proto ? addDays(first, -proto.closes_days) : null;
        const t = c.testOfHarvest.get(h.id);
        const st = status(first, opens, closes, t, now);
        return { key: `s${h.id}`, kind: 'strain', site: h.site, field_id: h.field_id, harvest: h, strain: h.strain, first, composite: 'Individual',
            protocol: proto, opens, closes, suggested: closes ? suggestedSample(closes, d.settings.sampleWeekday) : null,
            status: h.status === 'done' && st !== 'Results received' && st !== 'Submitted' ? 'Harvest started' : st, test: t,
            ref: `${h.strain} | ${h.site} ${fieldName(c, h.field_id)}` };
    });
    return { area, strain };
}
// ---------- availability ----------
/** fresh frozen lbs by strain and week (actual when harvested, estimate when not) */
export function availability(d, c, site) {
    const weeks = new Set();
    const by = new Map();
    for (const h of d.harvests) {
        if (h.kind !== 'ff' || h.status === 'cancelled' || (site && h.site !== site))
            continue;
        const date = h.harvested_on ?? h.planned_on;
        if (!date)
            continue;
        const k = calcHarvest(c, h);
        const w = monday(date);
        weeks.add(w);
        const m = by.get(h.strain) ?? by.set(h.strain, new Map()).get(h.strain);
        const x = m.get(w) ?? m.set(w, { est: 0, act: 0 }).get(w);
        if (h.status === 'done' && k.actFF != null)
            x.act += k.actFF;
        else
            x.est += k.estFF ?? 0;
    }
    const ws = [...weeks].sort();
    return { weeks: ws, rows: [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])) };
}
// ---------- plantings ----------
export function plantingAcres(p, s) {
    if (p.acres != null)
        return p.acres;
    if (p.plants == null || p.spacing_in == null)
        return null;
    return (p.plants * (p.spacing_in / 12)) / (s?.row_feet_per_acre || 13068);
}
export const acresFor = (plants, spacingIn, s) => spacingIn ? (plants * (spacingIn / 12)) / (s?.row_feet_per_acre || 13068) : null;
export function yieldsByStrain(d, c, site) {
    const m = new Map();
    for (const h of d.harvests) {
        if (h.kind !== 'ff' || h.status !== 'done' || (site && h.site !== site))
            continue;
        const k = calcHarvest(c, h);
        if (k.actFF == null || !k.actPlants)
            continue;
        const y = m.get(h.strain) ?? m.set(h.strain, { strain: h.strain, plants: 0, lbs: 0, harvests: 0, est: 0, daysInGround: [], daysFlower: [] }).get(h.strain);
        y.plants += k.actPlants;
        y.lbs += k.actFF;
        y.harvests++;
        y.est += k.estFF ?? 0;
        const p = h.planting_id != null ? c.planting.get(h.planting_id) : undefined;
        const hd = h.harvested_on ?? h.planned_on;
        if (p?.planted_on && hd)
            y.daysInGround.push(daysBetween(p.planted_on, hd));
        if (p?.first_flower && hd)
            y.daysFlower.push(daysBetween(p.first_flower, hd));
    }
    return [...m.values()];
}
export const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
// ---------- strain names ----------
export function strainResolver(d) {
    const m = new Map();
    for (const s of d.strains) {
        m.set(s.name.toLowerCase(), s.name);
        for (const a of s.aliases ?? [])
            if (!m.has(a.toLowerCase()))
                m.set(a.toLowerCase(), s.name);
    }
    return (x) => m.get(x.trim().toLowerCase()) ?? x.trim();
}
