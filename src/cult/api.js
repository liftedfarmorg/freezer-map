function fail(error) {
    if (error)
        throw new Error(error.message);
}
async function all(page) {
    const out = [];
    for (let from = 0;; from += 1000) {
        const { data, error } = await page(from, from + 999);
        fail(error);
        out.push(...(data ?? []));
        if (!data || data.length < 1000)
            return out;
    }
}
const num = (v) => (v == null || v === '' ? null : Number(v));
const KEY = { sites: 'code', cult_test_protocols: 'kind' };
export class CultApi {
    constructor(sb) {
        this.sb = sb;
    }
    async load(year) {
        const settingsRows = await all((a, b) => this.sb.from('app_settings').select('key,value').range(a, b));
        const st = new Map(settingsRows.map(r => [r.key, r.value]));
        const currentYear = Number(st.get('crop_year') ?? new Date().getFullYear());
        const y = year ?? currentYear;
        const [sites, fields, plantings, harvests, tests, protocols, picks, strains, yearsH, receipts] = await Promise.all([
            all((a, b) => this.sb.from('sites').select('*').order('sort').range(a, b)),
            all((a, b) => this.sb.from('fields').select('*').order('site').order('sort').range(a, b)),
            all((a, b) => this.sb.from('cult_plantings').select('*').eq('crop_year', y).order('planted_on').range(a, b)),
            all((a, b) => this.sb.from('cult_harvests').select('*').eq('crop_year', y).order('planned_on').range(a, b)),
            all((a, b) => this.sb.from('cult_tests').select('*').eq('crop_year', y).range(a, b)),
            all((a, b) => this.sb.from('cult_test_protocols').select('*').range(a, b)),
            all((a, b) => this.sb.from('cult_flower_picks').select('*').eq('crop_year', y).range(a, b)),
            all((a, b) => this.sb.from('strains').select('*').order('name').range(a, b)),
            all((a, b) => this.sb.from('cult_harvests').select('crop_year').range(a, b)),
            all((a, b) => this.sb.from('cult_receipts').select('*').eq('crop_year', y).order('received_on').range(a, b)),
        ]);
        const ids = harvests.map(h => h.id);
        const pallets = [];
        for (let i = 0; i < ids.length; i += 150) {
            const chunk = ids.slice(i, i + 150);
            pallets.push(...await all((a, b) => this.sb.from('pallets')
                .select('*').in('harvest_id', chunk).range(a, b)));
        }
        const settings = {
            sampleWeekday: Number(st.get('cult.sample_weekday') ?? 4),
            labs: (st.get('cult.labs') ?? '').split('|').map(s => s.trim()).filter(Boolean),
            equipment: (st.get('cult.equipment') ?? 'Swather|Merger|Combine|Stripper Header').split('|'),
            readyDays: Number(st.get('cult.ready_days') ?? 2),
            bufferPct: Number(st.get('cult.buffer_pct') ?? 0),
        };
        const years = [...new Set([y, currentYear, ...yearsH.map(r => r.crop_year)])].sort((a, b) => b - a);
        const fix = (rows, keys) => rows.map(r => { const o = { ...r }; for (const k of keys)
            o[k] = num(o[k]); return o; });
        return {
            year: y, currentYear, years, settings, strains, protocols,
            sites: fix(sites, ['row_feet_per_acre', 'dry_ice_per_10lb', 'truck_raw_lbs', 'workday_hours', 'deleaf_rate', 'buck_rate', 'dry_conversion']),
            fields: fix(fields, ['acres']),
            plantings: fix(plantings, ['spacing_in', 'beds', 'acres', 'est_lbs_per_plant', 'seed_lbs']),
            harvests: fix(harvests, ['est_lbs_per_plant', 'est_raw_per_plant', 'deleaf_rate', 'buck_rate', 'dry_conversion', 'acres', 'est_yield_per_acre',
                'raw_lbs', 'ff_lbs', 'bucked_lbs', 'trim_lbs', 'mold_lbs', 'metrc_wet_lbs', 'waste_lbs']).map(h => ({ ...h, raw_bins: (h.raw_bins ?? []).map(Number) })),
            tests, picks: fix(picks, ['dry_lbs']), receipts,
            pallets: fix(pallets, ['og_weight', 'current_weight']),
        };
    }
    async loadPlan(year) {
        const [demand, plan, orders, receipts, history, actuals] = await Promise.all([
            all((a, b) => this.sb.from('cult_demand').select('*').eq('crop_year', year).order('strain').range(a, b)),
            all((a, b) => this.sb.from('cult_plan').select('*').eq('crop_year', year).order('strain').range(a, b)),
            all((a, b) => this.sb.from('cult_nursery_orders').select('*').eq('crop_year', year).not('site', 'is', null).order('deliver_on').range(a, b)),
            all((a, b) => this.sb.from('cult_receipts').select('*').eq('crop_year', year).order('received_on').range(a, b)),
            all((a, b) => this.sb.from('cult_yield_history').select('*').range(a, b)),
            all((a, b) => this.sb.from('cult_harvest_actuals').select('strain,crop_year,kind,plants,ff_lbs').eq('kind', 'ff').range(a, b)),
        ]);
        // that crop's reserves (Admin and Sales can read them; others get null)
        let reserves = null;
        const requested = new Map();
        const { data, error } = await this.sb.from('reserves').select('strain,lbs').eq('crop_year', year);
        if (!error && data) {
            reserves = new Map();
            for (const r of data)
                reserves.set(r.strain, (reserves.get(r.strain) ?? 0) + Number(r.lbs));
            const q = await this.sb.from('reserve_requests').select('strain,requested_lbs,current_lbs').eq('crop_year', year).eq('status', 'pending');
            for (const r of (q.data ?? []))
                requested.set(r.strain, (requested.get(r.strain) ?? 0) + Number(r.requested_lbs) - Number(r.current_lbs));
        }
        return {
            year, reserves, requested,
            demand: demand.map(d => ({ ...d, lbs: Number(d.lbs) })),
            plan: plan.map(p => ({ ...p, overage_pct: Number(p.overage_pct), spacing_in: num(p.spacing_in), est_lbs_per_plant: num(p.est_lbs_per_plant) })),
            orders, receipts,
            history: history.map(h => ({ ...h, ff_lbs: num(h.ff_lbs) })),
            actuals: actuals.filter(a => a.plants && a.ff_lbs).map(a => ({ strain: a.strain, crop_year: a.crop_year, plants: Number(a.plants), ff_lbs: Number(a.ff_lbs) })),
        };
    }
    async history() {
        const rows = await all((a, b) => this.sb.from('cult_yield_history').select('*').range(a, b));
        return rows.map(h => ({ ...h, ff_lbs: num(h.ff_lbs) }));
    }
    /** insert (no id) or update (with id); returns the saved row */
    async save(table, row) {
        const key = KEY[table] ?? 'id';
        const r = { ...row };
        for (const k of ['updated_at', 'updated_by', 'created_at', 'created_by'])
            delete r[k];
        const id = r[key];
        if (id != null && (key !== 'id' || typeof id === 'number')) {
            const { data, error } = await this.sb.from(table).update(r).eq(key, id).select().single();
            fail(error);
            return data;
        }
        delete r.id;
        const { data, error } = await this.sb.from(table).insert(r).select().single();
        fail(error);
        return data;
    }
    async insertMany(table, rows) {
        if (!rows.length)
            return;
        const clean = rows.map(r => { const o = { ...r }; for (const k of ['id', 'updated_at', 'updated_by', 'created_at', 'created_by'])
            delete o[k]; return o; });
        const { error } = await this.sb.from(table).insert(clean);
        fail(error);
    }
    async removeMany(table, ids) {
        for (let i = 0; i < ids.length; i += 200) {
            const { error } = await this.sb.from(table).delete().in('id', ids.slice(i, i + 200));
            fail(error);
        }
    }
    async updateMany(table, ids, patch) {
        for (let i = 0; i < ids.length; i += 200) {
            const { error } = await this.sb.from(table).update(patch).in('id', ids.slice(i, i + 200));
            fail(error);
        }
    }
    async remove(table, id) {
        const { error } = await this.sb.from(table).delete().eq('id', id);
        fail(error);
    }
    async addPallets(harvestId, rows) {
        const { data, error } = await this.sb.rpc('cult_add_pallets', { p_harvest: harvestId, p_rows: rows });
        fail(error);
        return (data ?? []);
    }
    async setSetting(key, value) {
        const { error } = await this.sb.rpc('set_cult_setting', { p_key: key, p_value: value });
        fail(error);
    }
    // ---------- Harvest screen (026) ----------
    async weights(harvestId) {
        const { data, error } = await this.sb.from('cult_weights').select('*').eq('harvest_id', harvestId).order('id');
        if (error && /cult_weights/.test(error.message))
            throw new Error('Run 026_harvest_logging.sql in Supabase first');
        fail(error);
        return (data ?? []).map(w => ({ ...w, lbs: Number(w.lbs) }));
    }
    async logWeight(harvestId, kind, lbs, tag) {
        const { error } = await this.sb.rpc('cult_log_weight', { p_harvest: harvestId, p_kind: kind, p_lbs: lbs, p_tag: tag ?? null, p_note: null });
        fail(error);
    }
    async removeWeight(id) { const { error } = await this.sb.rpc('cult_remove_weight', { p_id: id }); fail(error); }
    async startHarvest(harvestId) { const { error } = await this.sb.rpc('cult_start', { p_harvest: harvestId }); fail(error); }
    async unstart(harvestId) { const { error } = await this.sb.rpc('cult_unstart', { p_harvest: harvestId }); if (error)
        throw new Error(/cult_unstart/.test(error.message) ? 'Run 065_unstart.sql in Supabase first' : error.message); }
    async startDrying(harvestId, date, acres) {
        const { error } = await this.sb.rpc('cult_start_drying', { p_harvest: harvestId, p_date: date, p_acres: acres });
        fail(error);
    }
    /** reopen a finished harvest; cancels its waiting waste / finish to-dos. Returns a warning when METRC already has some of it. */
    async reopen(harvestId) { const { data, error } = await this.sb.rpc('cult_reopen', { p_harvest: harvestId }); if (error)
        throw new Error(/cult_reopen/.test(error.message) ? 'Run 042_finished_harvests.sql in Supabase first' : error.message); return data ?? null; }
    async finish(harvestId, plants, notes) {
        const { error } = await this.sb.rpc('cult_finish', { p_harvest: harvestId, p_plants: plants, p_notes: notes });
        fail(error);
    }
    async removePallet(palletId) { const { error } = await this.sb.rpc('cult_remove_pallet', { p_pallet: palletId }); fail(error); }
    async nextTags(site, n = 6) {
        const { data, error } = await this.sb.rpc('next_tags', { p_site: site, p_purpose: 'harvest', p_count: n });
        return error ? [] : (data ?? []);
    }
    // ---------- push to METRC (057) ----------
    async rpc(fn, args) {
        const { data, error } = await this.sb.rpc(fn, args);
        if (error && /Could not find the function|does not exist/.test(error.message))
            throw new Error('Run 057_harvest_push.sql in Supabase first');
        fail(error);
        return data;
    }
    nextPallet(harvestId, skip = 0) { return this.rpc('cult_next_pallet', { p_harvest: harvestId, p_skip: skip }); }
    editPallet(id, p) { return this.rpc('cult_edit_pallet', { p_pallet: id, p }); }
    editWeight(id, lbs) { return this.rpc('cult_edit_weight', { p_id: id, p_lbs: lbs }); }
    setPlants(harvestId, plants) { return this.rpc('cult_set_plants', { p_harvest: harvestId, p_plants: plants }); }
    rename(harvestId, strain) { return this.rpc('cult_rename', { p_harvest: harvestId, p_strain: strain }); }
    push(harvestId, pallets, allowPending = false) {
        return this.rpc('cult_push', { p_harvest: harvestId, p_pallets: pallets, p_allow_pending: allowPending });
    }
    unpush(palletId) { return this.rpc('cult_unpush', { p_pallet: palletId }); }
    // ---------- harvest day + Live Bonus (084) ----------
    async rpc84(fn, args) {
        const { data, error } = await this.sb.rpc(fn, args);
        if (error && (/harvest_day_breaks_kind_check/.test(error.message) || (/Could not find the function|does not exist/.test(error.message) && /harvest_day_(end|reopen)/.test(fn))))
            throw new Error('Run 087_harvest_pause_end.sql in Supabase first');
        if (error && /Could not find the function|does not exist/.test(error.message))
            throw new Error('Run 084_harvest_days.sql in Supabase first');
        fail(error);
        return data;
    }
    harvestDay(site, day) { return this.rpc84('harvest_day_get', { p_site: site, p_day: day }); }
    saveHarvestDay(site, day, p) { return this.rpc84('harvest_day_save', { p_site: site, p_day: day, p }); }
    breakStart(site, day, kind, at = null) { return this.rpc84('harvest_break_start', { p_site: site, p_day: day, p_kind: kind, p_at: at }); }
    breakEnd(id, at = null) { return this.rpc84('harvest_break_end', { p_id: id, p_at: at }); }
    breakEdit(id, kind, start, end) { return this.rpc84('harvest_break_edit', { p_id: id, p_kind: kind, p_start: start, p_end: end }); }
    endDay(site, day) { return this.rpc84('harvest_day_end', { p_site: site, p_day: day, p_at: null }); }
    reopenDay(site, day) { return this.rpc84('harvest_day_reopen', { p_site: site, p_day: day }); }
    breakRemove(id) { return this.rpc84('harvest_break_remove', { p_id: id }); }
    setPalletTime(id, time) { return this.rpc84('cult_set_pallet_time', { p_pallet: id, p_time: time }); }
    bonusLive(token, day = null) { return this.rpc84('bonus_live', { p_token: token, p_day: day }); }
    bonusLink(site) { return this.rpc84('bonus_link', { p_site: site }); }
    bonusLinkReset(site) { return this.rpc84('bonus_link_reset', { p_site: site }); }
    /** flip a planting to flowering (075): METRC promotes its immature plants with plant tags, overnight */
    flip(plantingId, on) { return this.rpc('cult_flip', { p_planting: plantingId, p_on: on }); }
    continueTomorrow(harvestId, plants, on, notes) {
        return this.rpc('cult_continue', { p_harvest: harvestId, p_plants: plants, p_on: on, p_notes: notes });
    }
    async metrcStatus() {
        const { data, error } = await this.sb.rpc('cult_metrc_status');
        const m = new Map();
        if (!error)
            for (const r of (data ?? []))
                m.set(Number(r.harvest_id), { open: r.open_steps, due: r.next_due });
        return m;
    }
    async tagRules() {
        const { data, error } = await this.sb.from('tag_rules').select('*').order('site');
        if (error)
            return [];
        return (data ?? []);
    }
    /** the harvest's METRC batch name: saved (it has gone to METRC or was typed) or what it will be (141) */
    batchName(harvestId) { return this.rpc('cult_batch_name_of', { p_harvest: harvestId }); }
    saveTagRule(r) { return this.rpc('save_tag_rule', { p: r }); }
    async log(limit = 150) {
        const { data, error } = await this.sb.from('cult_log').select('*').order('at', { ascending: false }).limit(limit);
        fail(error);
        return (data ?? []);
    }
}
