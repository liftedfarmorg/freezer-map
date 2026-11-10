import { CompApi } from '../comp/api';
function fail(error) {
    if (!error)
        return;
    if (/fleet_|does not exist|schema cache/i.test(error.message) && /function|relation|column/i.test(error.message))
        throw new Error(`${error.message} (run the latest Supabase updates: 060 and 063)`);
    throw new Error(error.message);
}
/** phone photos are big: shrink to 1600px JPEG before uploading (other files go as they are) */
export async function shrink(f) {
    if (!/^image\/(jpeg|png|webp|heic|heif)/i.test(f.type) || f.size < 600 * 1024)
        return f;
    try {
        const bmp = await createImageBitmap(f);
        const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(bmp.width * k);
        cv.height = Math.round(bmp.height * k);
        cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
        const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.82));
        if (!blob || blob.size >= f.size)
            return f;
        return new File([blob], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
    }
    catch {
        return f;
    }
}
export class FleetApi {
    constructor(sb) {
        this.sb = sb;
        this.comp = new CompApi(sb);
    }
    async rpc(fn, args) { const { data, error } = await this.sb.rpc(fn, args ?? {}); fail(error); return data; }
    async data() {
        const d = await this.rpc('fleet_data');
        if (!d)
            throw new Error('Sign in with your Lifted account to see vehicles');
        // before 063 runs: no drivers / carriers / departments yet
        const all = ['distribution', 'cultivation', 'nursery', 'processing', 'company'];
        return { ...d, drivers: d.drivers ?? [], carriers: d.carriers ?? [], my_depts: d.my_depts ?? (d.can_edit ? all : []), carrier_admin: d.carrier_admin ?? d.can_edit,
            assets: d.assets.map(a => ({ ...a, department: a.department ?? 'company', driver_ids: a.driver_ids ?? [], carrier_id: a.carrier_id ?? null })) };
    }
    due() { return this.rpc('fleet_due'); }
    saveAsset(p) { return this.rpc('fleet_save_asset', { p }); }
    saveDriver(p) { return this.rpc('fleet_save_driver', { p }); }
    saveCarrier(p) { return this.rpc('fleet_save_carrier', { p }); }
    /** put a driver on the app (email-code login, or Microsoft for a Lifted address) as a User of their department */
    async addToApp(name, email, module) {
        const { error } = await this.sb.rpc('add_module_person', { p_email: email.trim().toLowerCase(), p_name: name, p_module: module, p_level: 'user', p_login: null });
        fail(error);
    }
    saveLog(p) { return this.rpc('fleet_save_log', { p }); }
    closeLog(id, note, reopen = false) { return this.rpc('fleet_close_log', { p_id: id, p_note: note, p_open: reopen }); }
    deleteLog(id) { return this.rpc('fleet_delete_log', { p_id: id }); }
    async addFiles(logId, files, onStep) {
        for (const [i, f0] of files.entries()) {
            onStep?.(files.length > 1 ? `${i + 1} / ${files.length}…` : '…');
            const f = await shrink(f0);
            const path = await this.comp.upload(f, 'fleet');
            await this.rpc('fleet_add_file', { p_log: logId, p: { file_path: path, file_name: f.name, mime: f.type || null, size_bytes: f.size } });
        }
    }
    files(logId) { return this.comp.docsFor('fleet_log', logId); }
}
