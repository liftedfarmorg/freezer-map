// Piece rate pay (048): Processing logs each person's day, Accounting pays it per bi-weekly period.
function fail(error) { if (error)
    throw new Error(error.message); }
const num = (x) => (x == null ? null : Number(x));
export const TASK_LABEL = { buck: 'Bucking', trim: 'Trimming' };
/** the workbook rule: pay every flower lb when lbs/hr reaches the target, else nothing */
export function payOf(lbs, hours, r) {
    if (!r || !(hours > 0))
        return { lph: null, hit: false, pay: 0 };
    const lph = lbs / hours, hit = lph >= r.target;
    return { lph, hit, pay: hit ? Math.round(lbs * r.rate * 100) / 100 : 0 };
}
export const rateOn = (rates, task, date) => rates.filter(r => r.task === task && r.effective_from <= date).sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
/** bi-weekly periods from the anchor (12/22/2025 unless changed in app settings) */
export function periodStart(date, anchor = '2025-12-22') {
    const a = new Date(anchor + 'T12:00:00').getTime(), d = new Date(date + 'T12:00:00').getTime();
    const k = Math.floor(Math.round((d - a) / 86400000) / 14);
    return new Date(a + k * 14 * 86400000).toISOString().slice(0, 10);
}
export const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
export class PayApi {
    constructor(sb) {
        this.sb = sb;
    }
    async rpc(fn, args) { const { data, error } = await this.sb.rpc(fn, args ?? {}); fail(error); return data; }
    async employees() { const { data, error } = await this.sb.from('employees').select('*').order('name'); fail(error); return (data ?? []); }
    async rates() { const { data, error } = await this.sb.from('piece_rates').select('*').order('task').order('effective_from', { ascending: false }); fail(error); return (data ?? []).map(r => ({ ...r, rate: Number(r.rate), target: Number(r.target) })); }
    async periods() { const { data, error } = await this.sb.from('pay_periods').select('*').order('starts', { ascending: false }); fail(error); return (data ?? []); }
    entries(from, to) { return this.pay(q => q.gte('work_date', from).lte('work_date', to)); }
    /** every day logged on one run */
    runEntries(run) { return this.pay(q => q.eq('run_id', run)); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async pay(f) {
        const out = [];
        for (let a = 0;; a += 1000) {
            const { data, error } = await f(this.sb.from('piece_pay').select('*')).order('work_date').order('id').range(a, a + 999);
            fail(error);
            const rows = (data ?? []);
            out.push(...rows.map(r => ({ ...r, lbs: Number(r.lbs), mold: Number(r.mold), smalls: Number(r.smalls), trim: Number(r.trim), hours: Number(r.hours), rate: num(r.rate), target: num(r.target), lbs_hr: num(r.lbs_hr), pay: Number(r.pay), day_rate: num(r.day_rate), day_target: num(r.day_target) })));
            if (rows.length < 1000)
                break;
        }
        return out;
    }
    saveEmployee(e) { return this.rpc('employee_save', { p: e }); }
    saveRate(task, rate, target, from, notes) { return this.rpc('piece_rate_save', { p_task: task, p_rate: rate, p_target: target, p_from: from, p_notes: notes }); }
    /** rate / target: this day's own piece rate, or null for the standing rate */
    saveDay(date, task, run, strain, farm, rows, rate = null, target = null) {
        return this.rpc('piece_save_day', { p_date: date, p_task: task, p_run: run, p_strain: strain, p_farm: farm, p_rows: rows, p_rate: rate, p_target: target });
    }
    summary(start) {
        return this.rpc('pay_summary', { p_start: start }).then(s => ({
            ...s, lines: (s.lines ?? []).map(l => ({ ...l, hours: Number(l.hours), lbs: Number(l.lbs), paid_lbs: Number(l.paid_lbs), amount: Number(l.amount) })),
            adjustments: (s.adjustments ?? []).map(a => ({ ...a, amount: Number(a.amount) }))
        }));
    }
    close(start, notes) { return this.rpc('pay_close', { p_start: start, p_notes: notes }); }
    reopen(start) { return this.rpc('pay_reopen', { p_start: start }); }
    adjust(start, employee, amount, reason) { return this.rpc('pay_adjust', { p_start: start, p_employee: employee, p_amount: amount, p_reason: reason }); }
    removeAdjust(id) { return this.rpc('pay_adjust_remove', { p_id: id }); }
    exported(start) { return this.rpc('pay_mark_exported', { p_start: start }); }
}
