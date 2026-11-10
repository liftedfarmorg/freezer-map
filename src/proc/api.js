function fail(error) { if (error)
    throw new Error(error.message); }
const num = (x) => (x == null ? null : Number(x));
const PAL_NUM = ['og_weight', 'current_weight'];
export class ProcApi {
    constructor(sb) {
        this.sb = sb;
    }
    /** the database hands back at most 1,000 rows per request: keep asking until it's all here (there are 1,100+ freezer spots) */
    async all(q) {
        const out = [];
        for (let a = 0;; a += 1000) {
            const { data, error } = await q(a, a + 999);
            if (error)
                return { data: null, error };
            out.push(...(data ?? []));
            if ((data ?? []).length < 1000)
                return { data: out, error: null };
        }
    }
    async rpc(fn, args) { const { data, error } = await this.sb.rpc(fn, args ?? {}); fail(error); return data; }
    async load() {
        const [pal, runs, inputs, reqs, procs, extra, slots, fz] = await Promise.all([
            this.all((a, b) => this.sb.from('pallets').select('*').neq('product', 'fresh_frozen').not('status', 'in', '(archived,merged)').order('id', { ascending: false }).range(a, b)),
            this.all((a, b) => this.sb.from('proc_runs').select('*').order('id', { ascending: false }).range(a, b)),
            this.all((a, b) => this.sb.from('proc_run_inputs').select('*').order('id').range(a, b)),
            this.sb.from('proc_requests').select('*').order('due_on', { ascending: true, nullsFirst: false }).limit(1000),
            this.sb.from('proc_processors').select('*').order('sort').order('name'),
            this.rpc('proc_data'),
            this.all((a, b) => this.sb.from('slots').select('id,code,row,freezer_id').order('id').range(a, b)),
            this.sb.from('freezers').select('id,site,number,kind'),
        ]);
        for (const r of [pal, runs, inputs, reqs, procs, slots, fz])
            fail(r.error);
        const pallets = (pal.data ?? []).map(p => { const x = { ...p }; for (const k of PAL_NUM)
            x[k] = num(x[k]); return x; });
        const nums = (rows, keys) => rows.map(r => { const x = { ...r }; for (const k of keys)
            x[k] = num(x[k]); return x; });
        return {
            pallets,
            runs: nums(runs.data ?? [], ['input_lbs', 'output_lbs', 'mold_lbs', 'loss_lbs']),
            inputs: nums(inputs.data ?? [], ['lbs']),
            requests: nums(reqs.data ?? [], ['lbs']),
            processors: (procs.data ?? []),
            harvests: nums(extra.harvests ?? [], ['raw_lbs']),
            lines: nums(extra.lines ?? [], ['lbs', 'picked', 'promised']).map(l => ({ ...l, promised: l.promised ?? 0 })),
            promises: nums(extra.promises ?? [], ['lbs']), rates: extra.rates ?? { default_dry: 0.075, all: {}, strains: {} },
            customers: extra.customers ?? [], held: extra.held ?? [],
            slots: new Map((slots.data ?? []).map(s => [s.id, s])),
            freezers: new Map((fz.data ?? []).map(f => [f.id, f])),
        };
    }
    yields(year) { return this.rpc('proc_yields', { p_year: year }).then(r => (r ?? []).map(y => Object.fromEntries(Object.entries(y).map(([k, v]) => [k, k === 'strain' ? v : num(v)])))); }
    nextTags(site, n) { return this.rpc('next_tags', { p_site: site, p_purpose: 'processing', p_count: n }); }
    makeWet(harvest, rows, processor, sent) {
        return this.rpc('proc_make_wet', { p_harvest: harvest, p_rows: rows, p_processor: processor, p_sent: sent });
    }
    send(ids, processor, on) { return this.rpc('proc_send', { p_ids: ids, p_processor: processor, p_on: on }); }
    receive(ids, site, tags) { return this.rpc('proc_receive', { p_ids: ids, p_site: site, p_tags: tags }); }
    /** 117 processor returns: our label is on (METRC new package from theirs), close a wet lot, link a return to its lot */
    retag(pallet, tag) { return this.rpc('proc_retag', { p_pallet: pallet, p_tag: tag }); }
    closeLot(lot) { return this.rpc('proc_close_lot', { p_lot: lot }); }
    linkReturn(pallet, lot) { return this.rpc('proc_link_return', { p_pallet: pallet, p_lot: lot }); }
    dried(ids) { return this.rpc('proc_mark_dried', { p_ids: ids }); }
    startRun(kind, inputs, request, notes, site, on) {
        return this.rpc('proc_start_run', { p_kind: kind, p_inputs: inputs, p_request: request, p_notes: notes, p_site: site, p_on: on });
    }
    editRun(run, inputs, request, notes) {
        return this.rpc('proc_edit_run', { p_run: run, p_inputs: inputs, p_request: request, p_notes: notes });
    }
    cancelRun(run) { return this.rpc('proc_cancel_run', { p_run: run }); }
    finishRun(run, outputs, mold, notes, on) {
        return this.rpc('proc_finish_run', { p_run: run, p_outputs: outputs.filter(o => o.lbs).map(o => ({ product: o.product, lbs: o.lbs, tag: o.tag })), p_mold: mold, p_notes: notes, p_on: on });
    }
    saveRequest(r) { return this.rpc('proc_save_request', { p: r }); }
    requestStatus(id, status) { return this.rpc('proc_request_status', { p_id: id, p_status: status }); }
    commit(line, pallet, lbs, tag) { return this.rpc('proc_commit', { p_line: line, p_pallet: pallet, p_lbs: lbs, p_tag: tag }); }
    /** what the crew logged on a run (048), in total and per day */
    async crewOf(run) {
        const { data, error } = await this.sb.from('piece_pay').select('*').eq('run_id', run);
        fail(error);
        const r = (data ?? []).map(x => ({ employee_id: Number(x.employee_id), work_date: String(x.work_date), lbs: Number(x.lbs), mold: Number(x.mold),
            smalls: Number(x.smalls), trim: Number(x.trim), hours: Number(x.hours), pay: Number(x.pay), hit: !!x.hit, rate: num(x.rate), target: num(x.target), custom: x.day_rate != null || x.day_target != null }));
        const tot = (xs) => {
            const s = (f) => xs.reduce((a, x) => a + f(x), 0);
            return { people: new Set(xs.map(x => x.employee_id)).size, lbs: s(x => x.lbs), mold: s(x => x.mold), smalls: s(x => x.smalls), trim: s(x => x.trim),
                other: s(x => x.mold + x.smalls + x.trim), hours: s(x => x.hours), pay: s(x => x.pay), hit: xs.filter(x => x.hit).length, n: xs.length };
        };
        const dates = [...new Set(r.map(x => x.work_date))].sort();
        const byDay = dates.map(date => { const xs = r.filter(x => x.work_date === date); return { date, ...tot(xs), rate: xs[0]?.rate ?? null, target: xs[0]?.target ?? null, custom: xs.some(x => x.custom) }; });
        return { ...tot(r), days: dates.length, byDay };
    }
    commitForecast(line, pallet, lbs) { return this.rpc('proc_commit_forecast', { p_line: line, p_pallet: pallet, p_lbs: lbs }); }
    setDryDefault(pct) { return this.rpc('proc_set_dry_default', { p_pct: pct }); }
    uncommit(id) { return this.rpc('proc_uncommit', { p_id: id }); }
    async idsOf(codes) { const { data, error } = await this.sb.from('pallets').select('id').in('code', codes); fail(error); return (data ?? []).map(x => x.id); }
    manifest(ids) { return this.rpc('proc_manifest', { p_ids: ids }); }
    async history() { const { data, error } = await this.sb.from('proc_yield_history').select('*'); fail(error); return (data ?? []).map(h => ({ ...h, bucked: Number(h.bucked), buck_mold: Number(h.buck_mold), buck_trim: Number(h.buck_trim), standards: Number(h.standards), trim_mold: Number(h.trim_mold), smalls: Number(h.smalls), trim_lbs: Number(h.trim_lbs) })); }
    labor(year) { return this.rpc('proc_labor', { p_year: year }).then(r => (r ?? []).map(x => ({ ...x, lbs: Number(x.lbs), hours: Number(x.hours), pay: Number(x.pay) }))).catch(() => []); }
    saveProcessor(p) { return this.rpc('proc_save_processor', { p }); }
}
