function fail(error) { if (error)
    throw new Error(error.message); }
export const GRP_LABEL = { flower: 'Flower (fresh frozen, standards, smalls, trim)', bio: 'Biomass', clones: 'Clones', shipping: 'Shipping', adjust: 'Discount / return / refund', other: 'Other' };
export class AcctApi {
    constructor(sb) {
        this.sb = sb;
    }
    async rpc(fn, args) { const { data, error } = await this.sb.rpc(fn, args ?? {}); fail(error); return data; }
    /** the server functions (QuickBooks) */
    async server(path, body) {
        const { data } = await this.sb.auth.getSession();
        const r = await fetch(`/api/qbo/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify(body) });
        const j = await r.json().catch(() => ({ error: `The server didn't answer (${r.status})` }));
        if (!r.ok)
            throw new Error(j.error ?? `Error ${r.status}`);
        return j;
    }
    overview() { return this.rpc('acct_overview'); }
    /** what will go to QuickBooks for one credit memo (lines, customer, problems) */
    cmPayload(id) { return this.rpc('cm_payload', { p_id: id }); }
    /** credit memos from returns (159) that aren't in QuickBooks yet */
    async creditMemosToSend() {
        const rs = await this.rpc('returns_list').catch(() => []);
        return (rs ?? []).flatMap(r => r.credits.filter(c => c.status === 'open' && c.acct_status !== 'sent').map(c => ({ ...c, rma: r.rma, customer: r.customer, total: Number(c.total) })));
    }
    invoices() { return this.rpc('acct_invoices').then(r => (r ?? []).map(i => ({ ...i, total: Number(i.total) }))); }
    payload(id) { return this.rpc('acct_invoice_payload', { p_inv: id }); }
    connection() { return this.rpc('acct_connection'); }
    async products() { const { data, error } = await this.sb.from('acct_products').select('*').order('sort'); fail(error); return (data ?? []); }
    async classes() { const { data, error } = await this.sb.from('acct_classes').select('*').order('sort'); fail(error); return (data ?? []); }
    async rules() { const { data, error } = await this.sb.from('acct_class_rules').select('*').order('sort').order('id'); fail(error); return (data ?? []); }
    async refs() { const { data, error } = await this.sb.from('qbo_refs').select('*').order('kind').order('key'); fail(error); return (data ?? []); }
    async linesWithoutProduct() { const { data, error } = await this.sb.from('invoice_lines').select('invoice_id').is('acct_product', null).limit(1000); fail(error); return new Set((data ?? []).map(x => x.invoice_id)); }
    setLine(inv, line, product, cls, appliesTo = null) { return this.rpc('acct_set_line', { p_inv: inv, p_line: line, p_product: product ?? '', p_class: cls ?? '', p_applies_to: appliesTo }); }
    addLine(inv, product, description, qty, price, appliesTo) { return this.rpc('acct_add_line', { p_inv: inv, p_product: product, p_description: description, p_qty: qty, p_price: price, p_applies_to: appliesTo }); }
    removeLine(inv, line) { return this.rpc('remove_invoice_line', { p_inv: inv, p_line: line }); }
    saveProduct(p) { return this.rpc('acct_save_product', { p_code: p.code, p_name: p.name, p_grp: p.grp, p_active: p.active }); }
    saveClass(name, old, active) { return this.rpc('acct_save_class', { p_name: name, p_old: old, p_active: active }); }
    saveRules(rules) { return this.rpc('acct_save_rules', { p_rules: rules }); }
    forgetRef(kind, key) { return this.rpc('acct_forget_ref', { p_kind: kind, p_key: key }); }
}
