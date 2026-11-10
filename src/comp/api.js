// Compliance module: documents (private storage bucket "compliance"), deadlines, CCOF materials, METRC queue / reconcile / errors.
function fail(error) {
    if (!error)
        return;
    if (/comp_reconcile_nursery/i.test(error.message))
        throw new Error(`${error.message} (run 076_nursery_reconcile.sql in Supabase)`);
    if (/metrc_locations|metrc_strains|metrc_location_map|metrc_strain_map|metrc_plant|metrc_map_|metrc_app_transfers|metrc_stop_checks|touch_tags/i.test(error.message))
        throw new Error(`${error.message} (run 075_metrc_phase12.sql in Supabase)`);
    if (/metrc_push|metrc_connection|metrc_set_mode|metrc_me|push_state/i.test(error.message))
        throw new Error(`${error.message} (run 070_metrc_push.sql in Supabase)`);
    if (/reconcile_view|recon_apply|recon_ignores/i.test(error.message))
        throw new Error(`${error.message} (run 074_recon_apply.sql in Supabase)`);
    if (/reconcile_live|metrc_sync|metrc_packages|metrc_trail/i.test(error.message))
        throw new Error(`${error.message} (run 071_metrc_sync.sql in Supabase)`);
    if (/comp_|pallet_trace|test_files|customer_license_status|does not exist|schema cache/i.test(error.message) && /function|relation|column/i.test(error.message))
        throw new Error(`${error.message} (run 055_compliance.sql and 056_ccof_list.sql in Supabase)`);
    throw new Error(error.message);
}
export const BUCKET = 'compliance';
export const STATUS_LABEL = { approved: 'Approved', pending: 'Pending', not_allowed: 'Not allowed', unknown: 'Not reviewed' };
export const CATEGORY_LABEL = { license: 'License', ccof: 'CCOF', metrc: 'METRC', testing: 'Testing', report: 'Report', sop: 'SOP', tax: 'Tax', insurance: 'Insurance', vehicles: 'Vehicles', other: 'Other' };
const safeName = (n) => n.normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').slice(-80) || 'file';
const uuid = () => crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
export class CompApi {
    constructor(sb) {
        this.sb = sb;
    }
    async rpc(fn, args) { const { data, error } = await this.sb.rpc(fn, args ?? {}); fail(error); return data; }
    // ----- files -----
    /** put a file in the private bucket; returns its path */
    async upload(file, docType) {
        const path = `${docType}/${new Date().getFullYear()}/${uuid()}-${safeName(file.name)}`;
        const { error } = await this.sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
        if (error)
            throw new Error(/bucket|not found/i.test(error.message) ? `${error.message} (run 055_compliance.sql in Supabase)` : error.message);
        return path;
    }
    async signedUrl(path, download) {
        const { data, error } = await this.sb.storage.from(BUCKET).createSignedUrl(path, 300, download ? { download } : undefined);
        if (error)
            throw new Error(error.message);
        return data.signedUrl;
    }
    /** open a stored file in a new tab (the tab opens first so phones don't block it) */
    async open(f) {
        if (!f.file_path && f.link_url) {
            window.open(f.link_url, '_blank', 'noopener');
            return;
        }
        if (!f.file_path)
            return;
        const w = window.open('', '_blank');
        try {
            const u = await this.signedUrl(f.file_path);
            if (w)
                w.location.href = u;
            else
                window.location.href = u;
        }
        catch (e) {
            w?.close();
            throw e;
        }
    }
    async addDoc(p) { return this.rpc('comp_add_doc', { p }); }
    async updateDoc(id, p) { return this.rpc('comp_update_doc', { p_id: id, p }); }
    async deleteDoc(id) { return this.rpc('comp_delete_doc', { p_id: id }); }
    async link(doc, kind, ref, on = true) { return this.rpc('comp_link_doc', { p_doc: doc, p_kind: kind, p_ref: ref, p_on: on }); }
    async docTypes() { const { data, error } = await this.sb.from('comp_doc_types').select('*').order('sort').order('label'); fail(error); return (data ?? []); }
    async saveDocType(t) { return this.rpc('comp_save_doc_type', { p: t }); }
    async docs(opts = {}) {
        let q = this.sb.from('comp_docs').select('*, links:comp_doc_links(doc_id, ref_kind, ref_id)').order('created_at', { ascending: false }).limit(5000);
        q = opts.deleted ? q.not('deleted_at', 'is', null) : q.is('deleted_at', null);
        const { data, error } = await q;
        fail(error);
        return (data ?? []);
    }
    async docsFor(kind, ref) {
        const { data, error } = await this.sb.from('comp_doc_links').select('doc:comp_docs(*)').eq('ref_kind', kind).eq('ref_id', String(ref));
        fail(error);
        return (data ?? []).map(x => x.doc).filter((d) => !!d && !d.deleted_at && d.current)
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    async versions(id) {
        // walk back through replaces_id
        const out = [];
        let cur = id;
        for (let i = 0; cur != null && i < 30; i++) {
            const r = await this.sb.from('comp_docs').select('*').eq('id', cur).maybeSingle();
            fail(r.error);
            const d = r.data;
            if (!d)
                break;
            out.push(d);
            cur = d.replaces_id;
        }
        return out;
    }
    // ----- deadlines -----
    deadlines() { return this.rpc('comp_deadlines'); }
    async obligations() { const { data, error } = await this.sb.from('comp_obligations').select('*').order('due_on', { nullsFirst: true }); fail(error); return (data ?? []); }
    async obLog(id) { const { data, error } = await this.sb.from('comp_obligation_log').select('*').eq('obligation_id', id).order('done_on', { ascending: false }).limit(50); fail(error); return (data ?? []); }
    saveObligation(o) { return this.rpc('comp_save_obligation', { p: o }); }
    doneObligation(id, done, note, doc) { return this.rpc('comp_done_obligation', { p_id: id, p_done: done, p_note: note, p_doc: doc }); }
    deleteObligation(id) { return this.rpc('comp_delete_obligation', { p_id: id }); }
    // ----- CCOF -----
    async materials() { const { data, error } = await this.sb.from('input_products').select('*').order('name'); fail(error); return (data ?? []); }
    setMaterial(id, p) { return this.rpc('comp_set_material', { p_id: id, p }); }
    issues(since) { return this.rpc('comp_material_issues', { p_since: since ?? null }); }
    appLog(from, to, site, module) {
        return this.rpc('comp_app_log', { p_from: from, p_to: to, p_site: site, p_module: module }).then(r => (r ?? []).map(x => ({ ...x, products: x.products ?? [] })));
    }
    async ccofList() { const { data, error } = await this.sb.from('comp_ccof_list').select('*').eq('active', true).order('category').order('name'); fail(error); return (data ?? []); }
    importCcof(date, rows, file) { return this.rpc('comp_import_ccof', { p_date: date, p_rows: rows, p_file: file }); }
    linkCcof(product, code) { return this.rpc('comp_link_ccof', { p_product: product, p_code: code ?? '' }); }
    async certs() { const { data, error } = await this.sb.from('comp_certs').select('*').order('site'); fail(error); return (data ?? []); }
    setCert(site, on, notes) { return this.rpc('comp_set_cert', { p_site: site, p_ccof: on, p_notes: notes ?? null }); }
    // ----- METRC -----
    async actions(status, limit = 2000) {
        let q = this.sb.from('comp_metrc_actions').select('*').order('at', { ascending: false }).limit(limit);
        if (status)
            q = q.eq('status', status);
        const { data, error } = await q;
        fail(error);
        return (data ?? []);
    }
    /** Stop: hold a queued to-do, stop a long send after its batch, or (waste / finish) cancel both and reopen the harvest */
    stopMetrc(id) { return this.rpc('metrc_stop', { p_id: id }); }
    releaseMetrc(id) { return this.rpc('metrc_release', { p_id: id }); }
    setActions(ids, status, note) { return this.rpc('comp_metrc_set', { p_ids: ids, p_status: status, p_note: note ?? null }); }
    async uploads() { const { data, error } = await this.sb.from('comp_metrc_uploads').select('*').order('uploaded_at', { ascending: false }).limit(60); fail(error); return (data ?? []); }
    uploadMetrc(license, file, rows) { return this.rpc('comp_metrc_upload', { p_license: license, p_file: file, p_rows: rows }); }
    reconcile(id) { return this.rpc('comp_reconcile', { p_upload: id }); }
    async errors() { const { data, error } = await this.sb.from('comp_metrc_errors').select('*').order('happened_on', { ascending: false }).order('id', { ascending: false }).limit(500); fail(error); return (data ?? []); }
    saveError(e) { return this.rpc('comp_save_error', { p: e }); }
    fixError(id, fix, playbook, title, reopen = false) { return this.rpc('comp_fix_error', { p_id: id, p_fix: fix, p_playbook: playbook, p_title: title, p_reopen: reopen }); }
    async playbook() { const { data, error } = await this.sb.from('comp_playbook').select('*').order('title'); fail(error); return (data ?? []); }
    savePlay(p) { return this.rpc('comp_save_playbook', { p }); }
    // ----- licenses, customers, testing -----
    async licenses() { const { data, error } = await this.sb.from('licenses').select('*').order('sort').order('license_no'); fail(error); return (data ?? []); }
    setLicenseExpiry(no, d) { return this.rpc('comp_set_license_expiry', { p_license: no, p_expires: d }); }
    customers() { return this.rpc('comp_customers'); }
    setCustomerLicense(id, license, expires) { return this.rpc('comp_set_customer_license', { p_customer: id, p_license: license, p_expires: expires }); }
    testsNoFile() { return this.rpc('comp_tests_no_file'); }
    trace(palletId) { return this.rpc('pallet_trace', { p_pallet: palletId }); }
    // ----- dashboard, settings -----
    overview() { return this.rpc('comp_overview'); }
    setSetting(key, value) { return this.rpc('comp_set_setting', { p_key: key, p_value: value }); }
    async backupRuns() { const { data, error } = await this.sb.from('comp_backup_runs').select('*').order('id', { ascending: false }).limit(10); fail(error); return (data ?? []); }
    // ----- METRC through T3 -----
    async pushKinds() { const { data, error } = await this.sb.from('metrc_push_kinds').select('*').order('sort'); fail(error); return (data ?? []); }
    setPushMode(kind, mode) { return this.rpc('metrc_set_mode', { p_kind: kind, p_mode: mode }); }
    async t3Conn() { const { data, error } = await this.sb.from('metrc_connection').select('*').eq('id', 1).maybeSingle(); fail(error); return data; }
    async metrc(body) {
        const { data } = await this.sb.auth.getSession();
        const r = await fetch('/api/metrc/run', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify(body) });
        const j = await r.json().catch(() => ({ error: `The server didn't answer (${r.status})` }));
        if (!r.ok)
            throw new Error(j.error ?? `Error ${r.status}`);
        return j;
    }
    reconcileNursery() { return this.rpc('comp_reconcile_nursery', {}); }
    farmLicenses() { return this.rpc('comp_farm_licenses', {}); }
    reconcilePlants(license) { return this.rpc('comp_reconcile_plants', { p_license: license }); }
    reconcileFarmHarvests(license) { return this.rpc('comp_reconcile_farm_harvests', { p_license: license }); }
    async countPlants(license) {
        const { data } = await this.sb.auth.getSession();
        const r = await fetch('/api/metrc/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify({ licenses: [license], only: 'plants' }) });
        const j = await r.json().catch(() => ({ error: `The server didn't answer (${r.status})` }));
        if (!r.ok)
            throw new Error(j.error ?? `Error ${r.status}`);
        return j;
    }
    reconcileLive(license) { return this.rpc('comp_reconcile_view', { p_license: license }); }
    reconApply(rows, dry) {
        return this.rpc('comp_recon_apply', { p_rows: rows, p_dry: dry });
    }
    syncStatus() { return this.rpc('metrc_sync_status'); }
    async pullMetrc(licenses) {
        const { data } = await this.sb.auth.getSession();
        const r = await fetch('/api/metrc/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify({ licenses }) });
        const j = await r.json().catch(() => ({ error: `The server didn't answer (${r.status})` }));
        if (!r.ok)
            throw new Error(j.error ?? `Error ${r.status}`);
        return j;
    }
    testT3() { return this.metrc({ action: 'test' }); }
    testApi() { return this.metrc({ action: 'test_api' }); }
    setRoute(kind, route, fallback) { return this.rpc('metrc_set_route', { p_kind: kind, p_route: route, p_fallback: fallback }); }
    usage() { return this.rpc('metrc_usage_now', {}); }
    setUsage(service, limit, warn) { return this.rpc('metrc_set_usage', { p_service: service, p_limit: limit, p_warn: warn }); }
    // ----- Phase 2 mapping -----
    async mapData() {
        const all = async (q) => {
            const out = [];
            for (let a = 0;; a += 1000) {
                const { data, error } = await q(a, a + 999);
                fail(error);
                const d = (data ?? []);
                out.push(...d);
                if (d.length < 1000)
                    break;
            }
            return out;
        };
        const sb = this.sb;
        const [locs, strains, batches, counts, locMap, strainMap, fields, rooms, st, licenses, nurserySites] = await Promise.all([
            all((a, b) => sb.from('metrc_locations').select('*').eq('archived', false).order('name').range(a, b)),
            all((a, b) => sb.from('metrc_strains').select('*').eq('archived', false).order('name').range(a, b)),
            all((a, b) => sb.from('metrc_plant_batches').select('license,id,name,type,strain,location,location_id,untracked,planted_on,state').eq('state', 'active').order('name').range(a, b)),
            all((a, b) => sb.from('metrc_plant_counts').select('*').eq('run', 'live').range(a, b)),
            all((a, b) => sb.from('metrc_location_map').select('*').range(a, b)),
            all((a, b) => sb.from('metrc_strain_map').select('*').range(a, b)),
            all((a, b) => sb.from('fields').select('id,site,code,name,active').order('site').order('sort').range(a, b)),
            all((a, b) => sb.from('nursery_rooms').select('id,site,name,active').order('site').order('sort').range(a, b)),
            all((a, b) => sb.from('strains').select('name').eq('active', true).order('name').range(a, b)),
            all((a, b) => sb.from('licenses').select('license_no,kind,site,active').range(a, b)),
            all((a, b) => sb.from('nursery_sites').select('code,license').range(a, b)),
        ]);
        return { locs, strains, batches, counts, locMap, strainMap, fields, rooms, appStrains: st.map(x => x.name), licenses, nurserySites };
    }
    mapLocation(kind, ref, license, locationId) { return this.rpc('metrc_map_location', { p_kind: kind, p_ref: ref, p_license: license, p_location_id: locationId }); }
    mapStrain(strain, license, strainId) { return this.rpc('metrc_map_strain', { p_strain: strain, p_license: license, p_strain_id: strainId }); }
    sendMetrc(ids) { return this.metrc({ action: 'send', ids }); }
    /** start the SharePoint backup now (server function) */
    async runBackup() {
        const { data } = await this.sb.auth.getSession();
        const r = await fetch('/api/compliance/backup', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: '{}' });
        const j = await r.json().catch(() => ({ error: `The server didn't answer (${r.status})` }));
        if (!r.ok)
            throw new Error(j.error ?? `Error ${r.status}`);
        return j;
    }
}
