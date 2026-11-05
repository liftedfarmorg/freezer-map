import { Select } from './combo'
import { useEffect, useMemo, useState } from 'react'
import type { Backend } from './api'
import type { Balance, Customer, Invoice, NewOrderLine, PaymentTerm, Product, Strain } from './types'
import { PRODUCT_LABEL, SALE_PRODUCTS } from './types'
import type { SalesDoc } from './docs'
import { dfmt, docTitle, downloadPdf, emailHref, makePdf, money, shareUrl, textHref } from './docs'
import { Tile, Tiles } from './dash'

type Flash = (t: string, bad?: boolean) => void
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const STATUS: Record<string, string> = { open: 'Open', paid: 'Paid', void: 'Void' }
const ACCT: Record<string, string> = { pending: 'Not in QuickBooks yet', sent: 'In QuickBooks', error: 'QuickBooks error', skip: 'Not sent to QuickBooks' }

/** one SO or invoice: preview, download, email, text, link; invoices can be adjusted until they're in accounting */
export function DocSheet({ backend, kind, id, flash, onClose, onChanged, canEdit, canVoid, sender }: {
  backend: Backend; kind: 'invoice' | 'so' | 'nso'; id: number; flash: Flash; onClose: () => void; onChanged?: () => void
  canEdit: boolean; canVoid: boolean; sender?: string | null
}) {
  const [d, setD] = useState<SalesDoc | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [terms, setTerms] = useState<PaymentTerm[]>([])
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState(false)
  const load = async () => {
    try {
      const doc = await backend.getDoc(kind, id); setD(doc)
      const blob = await makePdf(doc); setUrl(u => { if (u) URL.revokeObjectURL(u); return URL.createObjectURL(blob) })
    } catch (e) { flash(String((e as Error).message ?? e), true); onClose() }
  }
  useEffect(() => { load(); backend.paymentTerms().then(setTerms).catch(() => {}) }, [kind, id])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  const run = async (f: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try { await f(); await load(); onChanged?.(); flash(ok) } catch (e) { flash(String((e as Error).message ?? e), true) } finally { setBusy(false) }
  }
  const editable = canEdit && d?.kind === 'invoice' && d.status !== 'void' && d.acct_status !== 'sent'
  async function copy() { if (!d) return; try { await navigator.clipboard.writeText(shareUrl(d)); flash('Link copied') } catch { flash(shareUrl(d)) } }
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet docsheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-h"><h2>{d ? `${docTitle(d)} ${d.number}` : 'Loading…'}</h2><button className="ghost" onClick={onClose}>✕</button></div>
        {d && <>
          <div className="row wrap docmeta">
            <b>{d.customer.name}</b><span className="muted">{money(d.total)} · {d.terms}{d.kind === 'invoice' && d.due ? ` · due ${dfmt(d.due)}` : ''}</span>
            {d.kind === 'invoice' && <span className={`pill inv-${d.status}`}>{STATUS[d.status]}</span>}
            {d.kind === 'invoice' && d.acct_status && <span className={`pill acct-${d.acct_status}`}>{ACCT[d.acct_status]}</span>}
            {d.kind === 'invoice' && d.sent_at && <span className="muted">emailed {dfmt(d.sent_at.slice(0, 10))}</span>}
            {d.kind === 'invoice' && d.manifest && <span className="muted">METRC manifest {d.manifest}</span>}
          </div>
          {d.kind === 'invoice' && d.acct_status !== 'sent' && d.status !== 'void' && d.push_after && <p className="small-note muted">Goes to QuickBooks at {new Date(d.push_after).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}{new Date(d.push_after).toDateString() !== new Date().toDateString() ? ` ${dfmt(d.push_after.slice(0, 10))}` : ''}. Editing it restarts the 30 minutes.</p>}
          {d.kind === 'invoice' && (d.acct_flags?.length ?? 0) > 0 && <div className="warnbox small">{d.acct_flags!.map((f, k) => <div key={k}>{f}</div>)}</div>}
          <div className="row wrap docact">
            <button className="primary" disabled={busy} onClick={() => downloadPdf(d)}>Download PDF</button>
            <a className="btn ghost" href={emailHref(d, sender)} onClick={() => { if (d.kind === 'invoice') backend.markInvoiceSent(d.id, d.customer.billing_email ?? '').then(load).catch(() => {}) }}>Email</a>
            <a className="btn ghost" href={textHref(d)}>Text</a>
            <button className="ghost" onClick={copy}>Copy link</button>
            {editable && <button className="ghost" onClick={() => setEdit(!edit)}>{edit ? 'Done editing' : 'Edit'}</button>}
          </div>
          {!d.customer.billing_email && <p className="muted">No billing email for {d.customer.name}. A Sales Admin can add it in Sales → Settings → Customers.</p>}
          <p className="muted small">Email opens your own mail app with the link filled in. Attach the PDF too if the customer prefers it.</p>
          {edit && editable && <InvoiceEditor d={d} terms={terms} busy={busy} run={run} backend={backend} />}
          {d.kind === 'invoice' && canEdit && d.status !== 'void' && (
            <div className="row wrap docact">
              {d.acct_status === 'sent' ? <span className="muted small">Payments are recorded in QuickBooks; paid shows here after the hourly check.</span>
                : d.status === 'open' ? <button className="ghost small" disabled={busy} onClick={() => run(() => backend.setInvoiceStatus(d.id, 'paid'), 'Marked paid')}>Mark paid</button>
                : <button className="ghost small" disabled={busy} onClick={() => run(() => backend.setInvoiceStatus(d.id, 'open'), 'Marked open')}>Mark not paid</button>}
              {canVoid && d.acct_status !== 'sent' && <button className="ghost small" disabled={busy} onClick={() => { const why = prompt(`Void ${d.number}? Say why (optional):`); if (why !== null) run(() => backend.setInvoiceStatus(d.id, 'void', why), 'Voided') }}>Void</button>}
            </div>
          )}
          {url ? <iframe className="docframe" title={d.number} src={url} /> : <p className="muted">Making the PDF…</p>}
        </>}
      </div>
    </div>
  )
}

function InvoiceEditor({ d, terms, busy, run, backend }: { d: SalesDoc; terms: PaymentTerm[]; busy: boolean; run: (f: () => Promise<unknown>, ok: string) => Promise<void>; backend: Backend }) {
  const [date, setDate] = useState(d.date ?? today())
  const [po, setPo] = useState(d.po ?? '')
  const [notes, setNotes] = useState(d.notes ?? '')
  const [charge, setCharge] = useState({ product: 'SHIPPING', desc: '', qty: '1', price: '' })
  // QuickBooks products for charges (046): shipping, discounts, returns, refunds
  const [products, setProducts] = useState<{ code: string; name: string; grp: string }[]>([])
  useEffect(() => { backend.client()?.from('acct_products').select('code,name,grp').eq('active', true).order('sort').then(({ data }) => setProducts(((data ?? []) as { code: string; name: string; grp: string }[]).filter(x => ['shipping', 'adjust', 'other'].includes(x.grp)))) }, [])
  const chosen = products.find(x => x.code === charge.product)
  const addCharge = async () => {
    const sb = backend.client()
    if (sb && chosen) {
      const { error } = await sb.rpc('acct_add_line', { p_inv: d.id, p_product: chosen.code, p_description: charge.desc.trim() || chosen.name, p_qty: Number(charge.qty) || 1, p_price: Number(charge.price), p_applies_to: null })
      if (error) throw new Error(error.message)
    } else await backend.setInvoiceLine(d.id, null, charge.desc || 'Customer Shipping', Number(charge.qty) || 1, Number(charge.price))
  }
  return (
    <div className="invedit">
      <div className="grid2">
        <label><span>Payment terms</span>
          <Select value={d.terms_code ?? ''} disabled={busy} onChange={e => run(() => backend.setInvoiceTerms(d.id, e.target.value), 'Terms changed')}>
            {terms.filter(t => t.active || t.code === d.terms_code).map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
          </Select></label>
        <label><span>Invoice date</span><input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label><span>Customer PO</span><input value={po} onChange={e => setPo(e.target.value)} /></label>
        <label><span>Notes on the invoice</span><input value={notes} onChange={e => setNotes(e.target.value)} /></label>
      </div>
      {(date !== d.date || po !== (d.po ?? '') || notes !== (d.notes ?? '')) && <button className="primary small" disabled={busy} onClick={() => run(() => backend.setInvoiceInfo(d.id, date, po, notes), 'Saved')}>Save</button>}
      <table className="restable invlines"><thead><tr><th>Line</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Amount</th><th /></tr></thead>
        <tbody>{d.lines.map(l => <LineRow key={l.id} l={l} busy={busy} onPrice={p => run(() => backend.setInvoiceLine(d.id, l.id, l.description, null, p), 'Price changed')}
          onRemove={l.kind === 'charge' ? () => run(() => backend.removeInvoiceLine(d.id, l.id), 'Removed') : undefined} />)}</tbody></table>
      <div className="row wrap invcharge">
        {products.length > 0 && <Select value={charge.product} onChange={e => setCharge({ ...charge, product: e.target.value })}>{products.map(x => <option key={x.code} value={x.code}>{x.name}</option>)}</Select>}
        <input value={charge.desc} onChange={e => setCharge({ ...charge, desc: e.target.value })} placeholder={chosen ? `Description (default: ${chosen.name})` : 'Charge (shipping, storage…)'} />
        <input type="number" value={charge.qty} onChange={e => setCharge({ ...charge, qty: e.target.value })} placeholder="Qty" />
        <input type="number" value={charge.price} onChange={e => setCharge({ ...charge, price: e.target.value })} placeholder={chosen?.grp === 'adjust' ? 'Amount off' : 'Price'} />
        <button className="ghost small" disabled={busy || (!chosen && !charge.desc.trim()) || charge.price === ''} onClick={() => run(addCharge, chosen?.grp === 'adjust' ? 'Discount added' : 'Charge added').then(() => setCharge({ product: charge.product, desc: '', qty: '1', price: '' }))}>+ Add</button>
      </div>
      <p className="muted small">Quantities come from what actually shipped. Change prices here, or add shipping, discounts, returns or refunds (they go on as a minus amount). Contract customers get a $0 "Free shipping - contract" line automatically. Locked once the invoice is in QuickBooks.</p>
    </div>
  )
}

function LineRow({ l, busy, onPrice, onRemove }: { l: SalesDoc['lines'][number]; busy: boolean; onPrice: (p: number) => void; onRemove?: () => void }) {
  const [p, setP] = useState(String(l.price))
  return (
    <tr><td>{l.description}</td><td className="num">{Number(l.qty).toLocaleString()} {l.uom}</td>
      <td className="num"><input className="qty" type="number" step="0.01" value={p} onChange={e => setP(e.target.value)} onBlur={() => { if (Number(p) !== Number(l.price) && p !== '') onPrice(Number(p)) }} disabled={busy} /></td>
      <td className="num">{money(l.amount)}</td><td>{onRemove && <button className="ghost small" disabled={busy} onClick={onRemove}>✕</button>}</td></tr>
  )
}

/** Sales > Invoices */
export function InvoicesView({ backend, customers, flash, isAdmin, sender, scope = 'sales' }: { backend: Backend; customers: Customer[]; flash: Flash; isAdmin: boolean; sender?: string | null; scope?: 'sales' | 'nursery' }) {
  const [rows, setRows] = useState<Invoice[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [f, setF] = useState<'open' | 'overdue' | 'paid' | 'void' | 'all'>('open')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const load = () => backend.listInvoices(scope).then(r => { setRows(r); setErr(null) }).catch(e => setErr(String(e?.message ?? e)))
  useEffect(() => { load() }, [])
  const cname = useMemo(() => { const m = new Map(customers.map(c => [c.id, c.name])); return (id: number) => m.get(id) ?? `#${id}` }, [customers])
  if (err) return <div className="list"><h2>Invoices</h2><div className="warnbox">{err}</div></div>
  if (!rows) return <p className="muted">Loading…</p>
  const now = today()
  const overdue = (i: Invoice) => i.status === 'open' && !!i.due_date && i.due_date < now
  const ql = q.trim().toLowerCase()
  const shown = rows.filter(i => (f === 'all' || (f === 'overdue' ? overdue(i) : i.status === f)) && (!ql || `${i.inv_number} ${cname(i.customer_id)} ${i.po_number ?? ''}`.toLowerCase().includes(ql)))
  const sum = (xs: Invoice[]) => xs.reduce((a, i) => a + Number(i.total), 0)
  const openI = rows.filter(i => i.status === 'open'), od = rows.filter(overdue)
  const notAcct = rows.filter(i => i.status !== 'void' && i.acct_status === 'pending')
  return (
    <div className="list invoices">
      <h2>Invoices</h2>
      <Tiles>
        <Tile label="Open" value={money(sum(openI))} sub={`${openI.length} invoices`} onClick={() => setF('open')} />
        <Tile label="Overdue" value={money(sum(od))} sub={`${od.length} invoices`} tone={od.length ? 'warn' : 'ok'} onClick={() => setF('overdue')} />
        <Tile label="Not in QuickBooks yet" value={notAcct.length} sub="Accounting sends them" tone={notAcct.length ? 'info' : undefined} />
      </Tiles>
      <div className="row toolbar">
        <div className="seg">{(['open', 'overdue', 'paid', 'void', 'all'] as const).map(k => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{k[0].toUpperCase() + k.slice(1)}</button>)}</div>
        <input className="search" type="search" placeholder="Invoice #, customer or PO" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      {!shown.length && <p className="muted">{scope === 'nursery' ? 'No invoices here. A clone invoice is made each time plants are delivered on an order.' : 'No invoices here. Invoices are made when an order\'s stop is delivered, or from the order with "Make invoice".'}</p>}
      {shown.map(i => (
        <button key={i.id} className="li setrow" onClick={() => setOpen(i.id)}>
          <div className="grow"><div><b>{i.inv_number}</b> <span className={`pill inv-${overdue(i) ? 'overdue' : i.status}`}>{overdue(i) ? 'Overdue' : STATUS[i.status]}</span></div>
            <div className="muted">{cname(i.customer_id)} · {dfmt(i.invoice_date)} · {i.terms_label}{i.due_date ? ` · due ${dfmt(i.due_date)}` : ''}{i.sent_at ? ' · emailed' : ''}</div></div>
          <b className="num">{money(i.total)}</b>
        </button>
      ))}
      {open != null && <DocSheet backend={backend} kind="invoice" id={open} flash={flash} onClose={() => setOpen(null)} onChanged={load} canEdit canVoid={isAdmin} sender={sender} />}
    </div>
  )
}

/** Sales > Orders > New order */
/** customer license check (Compliance, 055): warn, don't block (we're mostly wholesale) */
export function licenseWarning(c: Customer): string | null {
  if (c.kind !== 'external') return null
  if (!c.license?.trim()) return `No state license on file for ${c.name}.`
  const exp = c.license_expires
  if (exp && exp < new Date().toISOString().slice(0, 10)) return `${c.name}'s license (${c.license}) expired ${exp}.`
  return null
}

const CUR_YEAR = new Date().getFullYear()
const sk = (strain: string, product: string) => `${strain.trim().toLowerCase()}|${product}`
/** lbs on hand per strain + product + crop year (pallets in freezers or waiting for a spot) */
function useStockByYear(backend: Backend) {
  const [m, setM] = useState<Map<string, Map<number, number>> | null>(null)
  useEffect(() => {
    const sb = backend.client(); if (!sb) return
    let on = true
    ;(async () => {
      const out = new Map<string, Map<number, number>>()
      for (let a = 0; ; a += 1000) {
        const { data, error } = await sb.from('pallets').select('strain,product,crop_year,current_weight').in('status', ['in_freezer', 'unslotted'])
          .eq('kind', 'package').not('strain', 'is', null).order('id').range(a, a + 999)
        if (error || !data) break
        for (const p of data as { strain: string; product: string | null; crop_year: number | null; current_weight: number | null }[]) {
          if (p.crop_year == null) continue
          const k = sk(p.strain, p.product ?? 'fresh_frozen'); const y = out.get(k) ?? new Map<number, number>()
          y.set(p.crop_year, (y.get(p.crop_year) ?? 0) + Number(p.current_weight ?? 0)); out.set(k, y)
        }
        if (data.length < 1000) break
      }
      if (on) setM(out)
    })().catch(() => {})
    return () => { on = false }
  }, [])
  return m
}
/** the year to sell from: this year if it's in stock, else the newest year that is */
const pickYear = (stock: Map<string, Map<number, number>> | null, strain: string, product: string) => {
  const y = stock?.get(sk(strain, product)); if (!y) return CUR_YEAR
  if ((y.get(CUR_YEAR) ?? 0) > 0) return CUR_YEAR
  const has = [...y.entries()].filter(([, l]) => l > 0).map(([yr]) => yr).sort((a, b) => b - a)
  return has[0] ?? CUR_YEAR
}

export function NewOrderSheet({ backend, customers, strains, flash, onClose, onDone }: {
  backend: Backend; customers: Customer[]; strains: Strain[]; flash: Flash; onClose: () => void; onDone: (id: number) => void
}) {
  const [cust, setCust] = useState<number | null>(null)
  const [po, setPo] = useState('')
  const [wanted, setWanted] = useState('')
  const [notes, setNotes] = useState('')
  const [termsCode, setTermsCode] = useState<string>('')
  const [shipping, setShipping] = useState('')
  const [quoted, setQuoted] = useState(false)
  const [est, setEst] = useState<{ charge: number | null; descr: string | null; rule: string; problem: string | null } | null>(null)
  const [terms, setTerms] = useState<PaymentTerm[]>([])
  const [lines, setLines] = useState<{ strain: string; lbs: string; price: string; product: Product; sample?: boolean; hold?: string; year: number; yearSet?: boolean }[]>([{ strain: '', lbs: '', price: '', product: 'fresh_frozen', year: CUR_YEAR }])
  const stock = useStockByYear(backend)
  // strain or product changed: the year follows what's in stock, until someone picks a year by hand
  useEffect(() => { setLines(ls => ls.map(l => l.yearSet || !l.strain.trim() ? l : { ...l, year: pickYear(stock, l.strain, l.product) })) }, [stock])
  const [busy, setBusy] = useState(false)
  useEffect(() => { backend.paymentTerms().then(setTerms).catch(() => {}) }, [])
  // market price per crop year (164): what a customer with no contract price pays
  const [market, setMarket] = useState<Map<number, number>>(new Map())
  useEffect(() => { backend.client()?.from('market_prices').select('crop_year,price_per_lb').eq('finish', 'FF')
    .then(r => setMarket(new Map(((r.data ?? []) as { crop_year: number; price_per_lb: number }[]).map(x => [Number(x.crop_year), Number(x.price_per_lb)]))), () => {}) }, [])
  const c = customers.find(x => x.id === cust)
  useEffect(() => { setTermsCode(c?.payment_terms ?? '') }, [cust])
  // what the load would charge them on a single-stop box truck run (the load works it out for real at Depart)
  useEffect(() => {
    setEst(null)
    const sb = backend.client()
    if (!sb || cust == null) return
    sb.rpc('ship_quote', { p_customers: [cust], p_class: 'box', p_carrier_cost: null }).then(({ data }) => { const r = (data ?? [])[0]; if (r) setEst(r) })
  }, [cust])
  // Strain pick list (Aziz 11/4, same as the order editor): fresh frozen / standards / smalls = the open menu (+ this customer's
  // reserves on fresh frozen); other products aren't on the menu, so they list what's on hand. One option per strain + crop year.
  const [menu, setMenu] = useState<{ product: string; strain: string; crop_year: number; open_lbs: number }[] | null>(null)
  const [bal, setBal] = useState<Balance[]>([])
  useEffect(() => { backend.client()?.rpc('staff_menu').then(({ data }) => setMenu((data ?? []) as { product: string; strain: string; crop_year: number; open_lbs: number }[]), () => setMenu([])) }, [])
  useEffect(() => { backend.listBalances().then(setBal).catch(() => {}) }, [])
  const MENU_CODE: Partial<Record<Product, string>> = { fresh_frozen: 'FF', standards: 'ST', smalls: 'SM' }
  const optionsFor = (product: Product) => {
    const m = new Map<string, { k: string; strain: string; year: number; open: number; res: number }>()
    const at = (strain: string, year: number) => { const k = `${strain.toLowerCase()}|${year}`; let x = m.get(k); if (!x) { x = { k, strain, year, open: 0, res: 0 }; m.set(k, x) } return x }
    const code = MENU_CODE[product]
    if (code) for (const r of menu ?? []) { if (r.product === code && Number(r.open_lbs) > 0) at(r.strain, r.crop_year).open += Number(r.open_lbs) }
    else if (stock) for (const [k, ys] of stock) { const [name, prod] = [k.slice(0, k.lastIndexOf('|')), k.slice(k.lastIndexOf('|') + 1)]
      if (prod !== product) continue
      const shown = strains.find(s => s.name.toLowerCase() === name)?.name ?? name
      for (const [y, v] of ys) if (v > 0) at(shown, y).open += Math.floor(v) }
    if (product === 'fresh_frozen' && cust != null) for (const b of bal) if (b.customer_id === cust && Number(b.remaining) > 0) at(b.strain, b.crop_year ?? CUR_YEAR).res += Number(b.remaining)
    return [...m.values()].sort((a, b) => a.strain.localeCompare(b.strain) || b.year - a.year)
  }
  const lineKey = (l: { strain: string; year: number }) => `${l.strain.trim().toLowerCase()}|${l.year}`
  // blocked past what's available: all lines of the same product + strain + crop year together
  const lineAvail = (l: typeof lines[number]) => optionsFor(l.product).find(x => x.k === lineKey(l))
  const lineOver = (l: typeof lines[number]) => {
    if (!l.strain.trim() || !(Number(l.lbs) > 0)) return null
    const a = lineAvail(l), max = a ? a.open + a.res : 0
    const used = lines.filter(x => x.product === l.product && lineKey(x) === lineKey(l)).reduce((t, x) => t + (Number(x.lbs) || 0), 0)
    return used > max ? max : null
  }
  const anyOver = lines.some(l => lineOver(l) != null)
  const ok = cust != null && lines.some(l => l.strain.trim() && Number(l.lbs) > 0) && !anyOver
  async function save() {
    setBusy(true)
    try {
      const ls: NewOrderLine[] = lines.filter(l => l.strain.trim() && Number(l.lbs) > 0).map(l => ({ strain: l.strain.trim(), lbs: Number(l.lbs), price: l.price === '' ? null : Number(l.price), product: l.product, crop_year: l.year }))
      const o = await backend.createOrder(cust!, ls, po, wanted || null, notes, termsCode || null)
      const used = lines.filter(l => l.strain.trim() && Number(l.lbs) > 0)
      if (used.some(l => l.sample)) {
        try {
          // lines come back in the order they were sent
          const { data } = await backend.client()!.from('order_lines').select('id').eq('order_id', o.id).order('id')
          const ids = ((data ?? []) as { id: number }[]).map(x => x.id)
          await backend.setOrderSample(o.id, true, used.map((l, i) => ({ line_id: ids[i], sample: !!l.sample && l.product === 'fresh_frozen', hold_lbs: l.sample ? Number(l.hold || 0) || null : null })).filter(x => x.line_id))
        } catch (e) { flash(`Order made, but the sample lines weren't saved: ${(e as Error).message}`, true) }
      }
      if (shipping !== '') {
        const { error } = await backend.client()?.rpc('set_order_shipping', { p_order: o.id, p_amount: Number(shipping), p_quoted: quoted }) ?? { error: null }
        if (error) flash(`Order made, but shipping wasn't saved: ${error.message}`, true)
      }
      flash(`${o.so_number} created`); onDone(o.id)
    } catch (e) { flash(String((e as Error).message ?? e), true) } finally { setBusy(false) }
  }
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet form neworder" onClick={e => e.stopPropagation()}>
        <div className="sheet-h"><h2>New sales order</h2><button className="ghost" onClick={onClose}>✕</button></div>
        <div className="field"><label>Customer</label>
          <Select value={cust ?? ''} onChange={e => setCust(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Pick a customer…</option>
            {customers.filter(x => x.active && x.kind === 'external').sort((a, b) => a.name.localeCompare(b.name)).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
          {c && <span className="muted">{c.price_per_lb != null ? `Contract price ${money(Number(c.price_per_lb))}/lb` : `No contract price: market price ${[...new Set(lines.filter(l => l.product === 'fresh_frozen').map(l => l.year))].map(y => market.has(y) ? `${money(market.get(y)!)}/lb (${y} crop)` : `not set for ${y}`).join(', ') || 'applies'}`} · {terms.find(t => t.code === c.payment_terms)?.label ?? 'Due on receipt'}</span>}
          {c && licenseWarning(c) && <div className="warnbox">{licenseWarning(c)} Compliance keeps customer licenses in Compliance › Library › Customer licenses.</div>}</div>
        <div className="field"><label>Lines <span className="muted">(price blank = their contract price for fresh frozen, or the market price if they have none; dry products get priced on the invoice)</span></label>
          {lines.map((l, i) => (<div key={i} className="nolinewrap">
            <div className="row noline">
              <Select value={l.product} aria-label="Product" onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, product: e.target.value as Product, strain: '', year: CUR_YEAR, yearSet: false } : x))}>
                {SALE_PRODUCTS.map(p => <option key={p} value={p}>{PRODUCT_LABEL[p]}</option>)}</Select>
              {(() => { const opts = optionsFor(l.product), cur = l.strain.trim() ? lineKey(l) : ''
                return <Select value={cur} aria-label="Strain" disabled={!menu || !stock} onChange={e => { const o = opts.find(x => x.k === e.target.value)
                  setLines(ls => ls.map((x, j) => j === i ? { ...x, strain: o?.strain ?? '', year: o?.year ?? CUR_YEAR, yearSet: true } : x)) }}>
                  <option value="">{!menu || !stock ? 'Loading…' : opts.length ? 'Strain' : 'Nothing available'}</option>
                  {cur && !opts.some(x => x.k === cur) && <option value={cur}>{l.strain} ({l.year}) · not available</option>}
                  {opts.map(x => <option key={x.k} value={x.k}>{x.strain}{x.year !== CUR_YEAR ? ` (${x.year} crop)` : ''} · {Math.round(x.open + x.res).toLocaleString()} lbs available{x.res > 0 ? ` (${Math.round(x.res).toLocaleString()} reserve${x.open > 0 ? ` + ${Math.round(x.open).toLocaleString()} open` : ''})` : ''}</option>)}
                </Select> })()}
              <input type="number" placeholder="lbs" value={l.lbs} onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, lbs: e.target.value } : x))} />
              <input type="number" placeholder="$/lb" value={l.price} onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, price: e.target.value } : x))} />
              {lines.length > 1 && <button className="ghost small" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}>✕</button>}
            </div>
            {lineOver(l) != null && <div className="small-note" style={{ color: 'var(--bad)', fontWeight: 600 }}>Only {Math.round(lineOver(l)!).toLocaleString()} lbs of {l.strain} ({l.year}) available{lines.filter(x => x.product === l.product && lineKey(x) === lineKey(l)).length > 1 ? ' across these lines' : ''}</div>}
            {l.product === 'fresh_frozen' && <div className="row nosample">
              <label className="check"><input type="checkbox" checked={!!l.sample} onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, sample: e.target.checked } : x))} /> Sample</label>
              {l.sample && <><input type="number" step="10" min="0" placeholder="hold lbs" value={l.hold ?? ''} onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, hold: e.target.value } : x))} />
                <span className="muted small">lbs to hold for them</span></>}
            </div>}
          </div>
          ))}
          <button className="ghost small" onClick={() => setLines(ls => [...ls, { strain: '', lbs: '', price: '', product: ls[ls.length - 1]?.product ?? 'fresh_frozen', year: CUR_YEAR }])}>+ Line</button></div>
        {lines.some(l => l.sample) && <p className="muted small">Sample lines hold the "hold lbs" for {c?.name ?? 'the customer'} from now until {c?.sample_hold_days ?? 10} days after the order ships. Cancelling the order drops the hold.</p>}
        <div className="grid2">
          <div className="field"><label>Customer PO</label><input value={po} onChange={e => setPo(e.target.value)} /></div>
          <div className="field"><label>Requested Delivery Date</label><input type="date" value={wanted} onChange={e => setWanted(e.target.value)} /></div>
        </div>
        <div className="field"><label>Payment terms <span className="muted">(this order only)</span></label>
          <Select value={termsCode} onChange={e => setTermsCode(e.target.value)}>
            <option value="">{c ? `Customer default (${terms.find(t => t.code === c.payment_terms)?.label ?? 'Due on receipt'})` : 'Customer default'}</option>
            {terms.filter(t => t.active).map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
          </Select></div>
        <div className="field"><label>Shipping <span className="muted">(blank = the load works it out when it leaves)</span></label>
          <input type="number" step="0.01" min="0" value={shipping} onChange={e => setShipping(e.target.value)} placeholder={est?.charge != null ? String(est.charge) : '0.00'} />
          {est && <span className="muted small">{est.rule === 'free' ? `Contract customer: FREE shipping${est.descr ? ` ${est.descr.replace('FREE contract shipping', '').trim()}` : ''}`
            : est.rule === 'pickup' ? 'They pick up: no shipping'
            : est.problem ? est.problem : `Estimate, one stop on a box truck: $${Number(est.charge).toFixed(2)} (${est.descr})`}</span>}
          {shipping !== '' && <label className="check"><input type="checkbox" checked={quoted} onChange={e => setQuoted(e.target.checked)} /> I quoted this to the customer (it wins over the load's calculation)</label>}</div>
        <div className="field"><label>Notes</label><input value={notes} onChange={e => setNotes(e.target.value)} /></div>
        <p className="muted">The order is confirmed and gets its SO number right away, then shows in Distribution → Fulfillment.</p>
        <div className="row between"><span /><div className="row"><button className="ghost" onClick={onClose}>Cancel</button><button className="primary" disabled={busy || !ok} onClick={save}>Create order</button></div></div>
      </div>
    </div>
  )
}

/** Sales > Settings > Payment terms */
export function TermsPanel({ backend, flash, canEdit }: { backend: Backend; flash: Flash; canEdit: boolean }) {
  const [rows, setRows] = useState<PaymentTerm[] | null>(null)
  const [ed, setEd] = useState<{ code: string; label: string; parts: { pct: string; days: string }[]; cod: boolean; active: boolean; isNew: boolean } | null>(null)
  const load = () => backend.paymentTerms().then(setRows).catch(() => setRows([]))
  useEffect(() => { load() }, [])
  if (!rows) return <p className="muted">Loading…</p>
  const desc = (t: PaymentTerm) => t.schedule.map(p => `${p.pct}% ${p.days ? `in ${p.days} days` : 'on the invoice date'}`).join(', ')
  async function save() {
    if (!ed) return
    try {
      await backend.setPaymentTerm({ code: ed.code, label: ed.label, schedule: ed.parts.map(p => ({ pct: Number(p.pct), days: Number(p.days) || 0 })), cod: ed.cod, active: ed.active })
      setEd(null); await load(); flash('Saved')
    } catch (e) { flash(String((e as Error).message ?? e), true) }
  }
  return (
    <div className="dlist">
      <p className="muted">Set each customer's default in Customers. Sales can change the terms on any order or invoice.</p>
      {canEdit && <button className="primary small" onClick={() => setEd({ code: '', label: '', parts: [{ pct: '100', days: '30' }], cod: false, active: true, isNew: true })}>+ Payment terms</button>}
      {rows.map(t => (
        <button key={t.code} className="drow click" disabled={!canEdit} onClick={() => setEd({ code: t.code, label: t.label, parts: t.schedule.map(p => ({ pct: String(p.pct), days: String(p.days) })), cod: t.cod, active: t.active, isNew: false })}>
          <span><b>{t.label}</b><span className="muted"> · {t.code} · {desc(t)}{t.cod ? ' · cash on delivery' : ''}</span></span>{!t.active && <span className="pill">retired</span>}</button>
      ))}
      {ed && (
        <div className="scrim" onClick={() => setEd(null)}>
          <div className="sheet form" onClick={e => e.stopPropagation()}>
            <div className="sheet-h"><h2>{ed.isNew ? 'New payment terms' : ed.label}</h2><button className="ghost" onClick={() => setEd(null)}>✕</button></div>
            <div className="grid2"><div className="field"><label>Code</label><input value={ed.code} disabled={!ed.isNew} onChange={e => setEd({ ...ed, code: e.target.value.toUpperCase() })} placeholder="NET60" /></div>
              <div className="field"><label>Name on invoices</label><input value={ed.label} onChange={e => setEd({ ...ed, label: e.target.value })} placeholder="Net 60" /></div></div>
            <div className="field"><label>Parts <span className="muted">(must add up to 100%)</span></label>
              {ed.parts.map((p, i) => (
                <div key={i} className="row noline"><input type="number" value={p.pct} onChange={e => setEd({ ...ed, parts: ed.parts.map((x, j) => j === i ? { ...x, pct: e.target.value } : x) })} /><span>% due</span>
                  <input type="number" value={p.days} onChange={e => setEd({ ...ed, parts: ed.parts.map((x, j) => j === i ? { ...x, days: e.target.value } : x) })} /><span>days after the invoice</span>
                  {ed.parts.length > 1 && <button className="ghost small" onClick={() => setEd({ ...ed, parts: ed.parts.filter((_, j) => j !== i) })}>✕</button>}</div>))}
              <button className="ghost small" onClick={() => setEd({ ...ed, parts: [...ed.parts, { pct: '', days: '' }] })}>+ Part</button></div>
            <label className="check"><input type="checkbox" checked={ed.cod} onChange={e => setEd({ ...ed, cod: e.target.checked })} /> Cash on delivery</label>
            <label className="check"><input type="checkbox" checked={ed.active} onChange={e => setEd({ ...ed, active: e.target.checked })} /> In use</label>
            <div className="row between"><span /><div className="row"><button className="ghost" onClick={() => setEd(null)}>Cancel</button>
              <button className="primary" disabled={!ed.code.trim() || !ed.label.trim() || ed.parts.reduce((a, p) => a + Number(p.pct || 0), 0) !== 100} onClick={save}>Save</button></div></div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Sales settings > Market price: $/lb per product + crop year (e.g. 2026 Fresh Frozen) for outside customers with no contract price (164, 175) */
type MarketPrice = { crop_year: number; finish: string; price_per_lb: number; updated_by: string | null; updated_at: string }
const MENU_FINISHES: [string, string][] = [['FF', 'Fresh Frozen'], ['ST', 'Standards'], ['SM', 'Smalls']]
export function MarketPricePanel({ backend, flash, canEdit }: { backend: Backend; flash: Flash; canEdit: boolean }) {
  const sb = backend.client()
  const [rows, setRows] = useState<MarketPrice[] | null>(null)
  const [missing, setMissing] = useState(false)
  const [cur, setCur] = useState(CUR_YEAR)
  const [fin, setFin] = useState('FF')
  const [others, setOthers] = useState<[string, string][]>([])
  const [ed, setEd] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const load = async () => {
    if (!sb) { setRows([]); return }
    const { data, error } = await sb.from('market_prices').select('*').order('crop_year', { ascending: false })
    setMissing(!!error && /market_prices/.test(error.message)); setRows(error ? [] : ((data ?? []) as MarketPrice[]).map(r => ({ ...r, finish: r.finish ?? 'FF' })))
  }
  useEffect(() => {
    load(); backend.reserveYears().then(y => setCur(y.current)).catch(() => {})
    sb?.from('finishes').select('code,name').then(r => setOthers(((r.data ?? []) as { code: string; name: string }[]).filter(f => !MENU_FINISHES.some(m => m[0] === f.code)).map(f => [f.code, f.name])), () => {})
  }, [])
  if (!rows) return <p className="muted">Loading…</p>
  if (missing) return <div className="warnbox">Market prices need 164_market_price.sql run in Supabase.</div>
  const finName = (f: string) => [...MENU_FINISHES, ...others].find(x => x[0] === f)?.[1] ?? f
  const mine = rows.filter(r => r.finish === fin)
  const years = [...new Set([cur + 1, cur, cur - 1, ...mine.map(r => r.crop_year)])].sort((a, b) => b - a)
  async function save(y: number, clear: boolean) {
    if (!sb) return
    const v = (ed[y] ?? '').trim()
    if (!clear && !(Number(v) >= 0 && v !== '')) { flash('Enter a price in $/lb', true); return }
    setBusy(true)
    try {
      const { error } = await sb.rpc('set_market_price', { p_year: y, p_price: clear ? null : Number(v), p_finish: fin })
      if (error) throw new Error(error.message)
      setEd(e => { const n = { ...e }; delete n[y]; return n }); await load()
      flash(clear ? `${y} ${finName(fin)} market price cleared` : `${y} ${finName(fin)} market price saved: ${money(Number(v))}/lb`)
    } catch (e) { flash(String((e as Error).message ?? e), true) } finally { setBusy(false) }
  }
  const pill = (k: string, l: string) => <button key={k} className={fin === k ? 'primary small' : 'ghost small'} onClick={() => { setFin(k); setEd({}) }}>{l}</button>
  return (
    <div className="dlist">
      <p className="muted">One price per product and crop year, for every strain (e.g. 2026 Fresh Frozen). Outside customers with no contract price pay it on portal orders,
        Sales orders and invoices, unless the strain's item card has its own price. The open menu shows the item card price, else this. Contract customers always pay
        their contract price. Orders already placed keep their prices.</p>
      <div className="row wrap" style={{ gap: 6 }}>
        {MENU_FINISHES.map(([k, l]) => pill(k, l))}
        {others.length > 0 && <select value={MENU_FINISHES.some(m => m[0] === fin) ? '' : fin} onChange={e => { if (e.target.value) { setFin(e.target.value); setEd({}) } }}>
          <option value="">Other product…</option>{others.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}
      </div>
      {years.map(y => {
        const r = mine.find(x => x.crop_year === y), editing = ed[y] !== undefined
        return (
          <div key={y} className="drow">
            <span><b>{y} {finName(fin)}</b>{y === cur && <span className="muted"> · current crop</span>}<br />
              <span className="muted">{r ? `${money(Number(r.price_per_lb))}/lb · set by ${r.updated_by ?? 'someone'} ${new Date(r.updated_at).toLocaleDateString()}` : 'Not set: Call/Email for Price on the menu, and customers without a contract price get no price'}</span></span>
            {canEdit && (editing
              ? <span className="row noline">
                  <input type="number" min="0" step="0.01" inputMode="decimal" style={{ width: 110 }} placeholder="$/lb" value={ed[y]} autoFocus
                    onChange={e => setEd({ ...ed, [y]: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') save(y, false) }} />
                  <button className="primary small" disabled={busy} onClick={() => save(y, false)}>Save</button>
                  <button className="ghost small" disabled={busy} onClick={() => setEd(e => { const n = { ...e }; delete n[y]; return n })}>Cancel</button>
                </span>
              : <span className="row noline">
                  <button className="ghost small" disabled={busy} onClick={() => setEd({ ...ed, [y]: r ? String(r.price_per_lb) : '' })}>{r ? 'Change' : 'Set price'}</button>
                  {r && <button className="ghost small" disabled={busy} onClick={() => { if (confirm(`Clear the ${y} ${finName(fin)} market price?`)) save(y, true) }}>Clear</button>}
                </span>)}
          </div>
        )
      })}
      {!canEdit && <p className="muted">Only a Sales Admin can change the market price.</p>}
    </div>
  )
}

/** the page behind a texted / emailed link: anyone with the link sees the document and can download it */
/** Sales settings > Contract product prices: one price per product across all strains for a contract customer (175). Fresh frozen stays on their terms. */
type Cpp = { customer_id: number; crop_year: number; finish: string; price_per_lb: number; updated_by: string | null; updated_at: string }
export function ContractProductPrices({ backend, flash, canEdit }: { backend: Backend; flash: Flash; canEdit: boolean }) {
  const sb = backend.client()
  const [rows, setRows] = useState<Cpp[] | null>(null)
  const [custs, setCusts] = useState<{ id: number; name: string }[]>([])
  const [fins, setFins] = useState<[string, string][]>([])
  const [f, setF] = useState({ cust: '', year: String(CUR_YEAR), fin: 'ST', price: '' })
  const [busy, setBusy] = useState(false)
  const load = async () => {
    if (!sb) { setRows([]); return }
    const { data, error } = await sb.from('customer_product_prices').select('*').order('crop_year', { ascending: false })
    if (error) flash(/customer_product_prices/.test(error.message) ? 'Contract product prices need 176_pricing.sql run in Supabase.' : error.message, true)
    setRows(error ? [] : (data ?? []) as Cpp[])
  }
  useEffect(() => {
    load()
    sb?.from('customers').select('id,name').order('name').then(r => setCusts((r.data ?? []) as { id: number; name: string }[]), () => {})
    sb?.from('finishes').select('code,name').then(r => setFins(((r.data ?? []) as { code: string; name: string }[]).filter(x => x.code !== 'FF').map(x => [x.code, x.name])), () => {})
  }, [])
  const custName = (id: number) => custs.find(c => c.id === id)?.name ?? `#${id}`
  const finName = (c: string) => fins.find(x => x[0] === c)?.[1] ?? c
  async function save(cust: number, year: number, fin: string, price: number | null) {
    if (!sb) return
    setBusy(true)
    try {
      const { error } = await sb.rpc('set_customer_product_price', { p_customer: cust, p_year: year, p_finish: fin, p_price: price })
      if (error) throw new Error(error.message)
      await load(); flash(price == null ? 'Contract price removed' : `Saved: ${custName(cust)} ${year} ${finName(fin)} ${money(price)}/lb`)
      if (price != null) setF(x => ({ ...x, price: '' }))
    } catch (e) { flash(String((e as Error).message ?? e), true) } finally { setBusy(false) }
  }
  if (!rows) return <p className="muted">Loading…</p>
  return (
    <div className="dlist">
      <p className="muted">A contract customer's price for a product, the same for every strain (e.g. their 2026 Smalls price). It carries into later crop years until
        a newer one is set. Their fresh frozen price stays on their payment terms. Orders already placed keep their prices; special prices are still changed on the sales order.</p>
      {!rows.length && <p className="muted">No contract product prices yet.</p>}
      {rows.map(r => (
        <div key={`${r.customer_id}-${r.crop_year}-${r.finish}`} className="drow">
          <span><b>{custName(r.customer_id)}</b> · {r.crop_year} {finName(r.finish)}<br />
            <span className="muted">{money(Number(r.price_per_lb))}/lb · set by {r.updated_by ?? 'someone'} {new Date(r.updated_at).toLocaleDateString()}</span></span>
          {canEdit && <button className="ghost small" disabled={busy} onClick={() => { if (confirm(`Remove ${custName(r.customer_id)}'s ${r.crop_year} ${finName(r.finish)} price?`)) save(r.customer_id, r.crop_year, r.finish, null) }}>Remove</button>}
        </div>
      ))}
      {canEdit ? <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
        <select value={f.cust} onChange={e => setF({ ...f, cust: e.target.value })}><option value="">Customer…</option>{custs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select value={f.fin} onChange={e => setF({ ...f, fin: e.target.value })}>{fins.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <input type="number" style={{ width: 90 }} value={f.year} onChange={e => setF({ ...f, year: e.target.value })} aria-label="Crop year" />
        <input type="number" min="0" step="0.01" inputMode="decimal" style={{ width: 110 }} placeholder="$/lb" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} />
        <button className="primary small" disabled={busy || !f.cust || !(Number(f.price) >= 0) || f.price.trim() === ''} onClick={() => save(Number(f.cust), Number(f.year), f.fin, Number(f.price))}>Save price</button>
      </div> : <p className="muted">Only a Sales Admin can change contract prices.</p>}
    </div>
  )
}

export function SharedDocPage({ backend, token }: { backend: Backend; token: string }) {
  const [d, setD] = useState<SalesDoc | null | undefined>(undefined)
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { backend.sharedDoc(token).then(async doc => { setD(doc); if (doc) setUrl(URL.createObjectURL(await makePdf(doc))) }).catch(() => setD(null)) }, [token])
  useEffect(() => { if (d) document.title = `${docTitle(d)} ${d.number} · Lifted Farms` }, [d])
  if (d === undefined) return <div className="center muted">Loading…</div>
  if (!d) return <div className="center"><img className="logo-login logo-l" src="/logo-light.svg" alt="Lifted Farms" /><img className="logo-login logo-d" src="/logo-dark.svg" alt="Lifted Farms" /><h2>This link doesn't work</h2><p className="muted">It may have been replaced. Ask Lifted Farms for a new one.</p></div>
  return (
    <div className="shareddoc">
      <div className="row between wrap"><div><img className="logo-img logo-l" src="/logo-light.svg" alt="Lifted Farms" /><img className="logo-img logo-d" src="/logo-dark.svg" alt="Lifted Farms" /></div>
        <div className="row"><button className="primary" onClick={() => downloadPdf(d)}>Download PDF</button></div></div>
      <h2>{docTitle(d)} {d.number}</h2>
      <p className="muted">{d.customer.name} · {money(d.total)} · {d.terms}{d.kind === 'invoice' && d.due ? ` · due ${dfmt(d.due)}` : ''}{d.kind === 'invoice' && d.status === 'paid' ? ' · paid, thank you' : ''}</p>
      {url ? <iframe className="docframe big" title={d.number} src={url} /> : <p className="muted">Making the PDF…</p>}
    </div>
  )
}
