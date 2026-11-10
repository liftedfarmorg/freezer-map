function fail(error) { if (error)
    throw new Error(error.message); }
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
export class NurseryApi {
    constructor(sb) {
        this.sb = sb;
    }
    async load() {
        const opt = async (f) => { try {
            return await f();
        }
        catch {
            return [];
        } }; // tables from 031 (before it's run)
        const [strainPlan, tests] = await Promise.all([
            opt(() => all((a, b) => this.sb.from('nursery_strain_plan').select('*').range(a, b))),
            opt(() => all((a, b) => this.sb.from('nursery_tests').select('*').order('tested_on', { ascending: false }).range(a, b))),
        ]);
        const [sites, rooms, mothers, batches, orders, deliveries, licenses, ranges, strains, st] = await Promise.all([
            all((a, b) => this.sb.from('nursery_sites').select('*').order('sort').range(a, b)),
            all((a, b) => this.sb.from('nursery_rooms').select('*').order('sort').order('name').range(a, b)),
            all((a, b) => this.sb.from('nursery_mothers').select('*').order('strain').order('id').range(a, b)),
            all((a, b) => this.sb.from('nursery_batches').select('*').order('cut_on', { ascending: false }).order('id', { ascending: false }).range(a, b)),
            all((a, b) => this.sb.from('cult_nursery_orders').select('*').not('nursery_site', 'is', null).order('deliver_on', { ascending: true, nullsFirst: false }).range(a, b)),
            all((a, b) => this.sb.from('nursery_deliveries').select('*').order('delivered_on', { ascending: false }).range(a, b)),
            all((a, b) => this.sb.from('licenses').select('*').order('sort').range(a, b)),
            all((a, b) => this.sb.from('tag_ranges').select('*').order('id').range(a, b)),
            all((a, b) => this.sb.from('strains').select('name,active').order('name').range(a, b)),
            all((a, b) => this.sb.from('app_settings').select('key,value').like('key', 'nursery.%').range(a, b)),
        ]);
        const s = new Map(st.map(r => [r.key, r.value]));
        const nv = (k, d) => { const v = Number(s.get(k)); return s.has(k) && isFinite(v) ? v : d; };
        return {
            sites, licenses, ranges, deliveries, tests,
            strainPlan: strainPlan.map(p => ({ ...p, cuts_g3: num(p.cuts_g3), cuts_g2: num(p.cuts_g2), cuts_g1: num(p.cuts_g1) })),
            rooms: rooms.map(r => ({ ...r, place: r.place ?? 'Webb', beds: r.beds ?? [], rented: !!r.rented })),
            mothers: mothers.map(m => ({ ...m, qty: m.qty ?? 1, lost: m.lost ?? 0, gen: m.gen ?? 2, cuts_per_plant: num(m.cuts_per_plant) })),
            batches: batches.map(b => ({ ...b, tags: b.tags ?? [], gen: b.gen ?? 4, trays: num(b.trays) })),
            orders: orders.map(o => ({ ...o, price_each: num(o.price_each) })),
            strains: strains.filter(x => x.active !== false).map(x => x.name),
            settings: {
                price: nv('nursery.clone_price', 5), terms: s.get('nursery.terms') ?? 'COD', rootDays: nv('nursery.root_days', 16), readyWarn: nv('nursery.ready_warn_days', 14),
                buffer: nv('nursery.buffer_pct', 15), deliverPct: nv('nursery.deliver_pct', 3), tray: nv('nursery.tray', 72) || 72,
                cutsG3: nv('nursery.cuts_g3', 18) || 18, cutsG2: nv('nursery.cuts_g2', 15) || 15, cutsG1: nv('nursery.cuts_g1', 15) || 15,
                g3VegDays: nv('nursery.g3_veg_days', 40), g3RootDays: nv('nursery.g3_root_days', 40), g2Lead: nv('nursery.g2_lead_days', 115), g1Lead: nv('nursery.g1_lead_days', 116),
                wage: nv('nursery.wage', 24),
            },
        };
    }
    async rpc(fn, args) {
        const { data, error } = await this.sb.rpc(fn, args);
        if (error && /schema cache|does not exist/.test(error.message))
            throw new Error('Run the latest nursery SQL (028, 031) in Supabase first');
        fail(error);
        return data;
    }
    saveOrder(o) { return this.rpc('nursery_save_order', { p: o }); }
    setStatus(id, status, note) { return this.rpc('nursery_order_status', { p_order: id, p_status: status, p_note: note ?? null }); }
    /** Ship: make the METRC transfer from 1PN right away; if METRC refuses it, the server takes the delivery back */
    async ship(ref) {
        const { metrcRun } = await import('../metrcCall');
        return metrcRun(this.sb, { action: 'nursery_ship', ref });
    }
    deliver(orderId, lines, date, manifest, notes) {
        return this.rpc('nursery_deliver', { p_order: orderId, p_lines: lines, p_date: date, p_manifest: manifest, p_notes: notes });
    }
    undoDelivery(ref) { return this.rpc('nursery_undo_delivery', { p_ref: ref }); }
    async nextTags(site, n, type = 'plant') { try {
        return await this.rpc('nursery_next_tags', { p_site: site, p_count: n, p_type: type }) ?? [];
    }
    catch {
        return [];
    } }
    /** autofill switch (Compliance > Settings > METRC tags) */
    async tagAutofill() { const { data } = await this.sb.from('app_settings').select('value').eq('key', 'comp.tag_autofill').maybeSingle(); return (data?.value ?? 'true') === 'true'; }
    setSetting(key, value) { return this.rpc('set_nursery_setting', { p_key: key, p_value: value }); }
    saveRange(p) { return this.rpc('save_tag_range', { p }); }
    // mothers, batches, rooms, sites: plain table writes (the database checks who can)
    async save(table, row) {
        const { id, ...rest } = row;
        for (const k of ['created_at', 'updated_at', 'created_by'])
            delete rest[k];
        const q = id ? this.sb.from(table).update(rest).eq('id', id) : this.sb.from(table).insert(rest);
        const { error } = await q;
        fail(error);
    }
    async insertMany(table, rows) { const { error } = await this.sb.from(table).insert(rows); fail(error); }
    async updateMany(table, ids, v) { const { error } = await this.sb.from(table).update(v).in('id', ids); fail(error); }
    async remove(table, id) { const { error } = await this.sb.from(table).delete().eq('id', id); fail(error); }
    async saveStrainPlan(p) {
        const { error } = await this.sb.from('nursery_strain_plan').upsert({ ...p, updated_at: new Date().toISOString() }, { onConflict: 'strain' });
        fail(error);
    }
    plantMoms(batchId, roomId, bed, qty, tag, on) {
        return this.rpc('nursery_plant_moms', { p_batch: batchId, p_room: roomId, p_bed: bed, p_qty: qty, p_tag: tag, p_on: on });
    }
    async saveSite(code, v) { const { error } = await this.sb.from('nursery_sites').update(v).eq('code', code); fail(error); }
    async activity(limit = 300) {
        const { data, error } = await this.sb.from('events').select('id,at,user_email,type,note,details').like('type', 'nursery%').order('at', { ascending: false }).limit(limit);
        fail(error);
        return (data ?? []);
    }
}
