// Business Central helpers for the server functions in api/bc/ (files starting with _ are not routes). Trial (213):
// invoices already in QuickBooks are copied into Business Central. QuickBooks stays the books; nothing here touches it.
// Needs in Vercel: BC_TENANT_ID, BC_CLIENT_ID, BC_CLIENT_SECRET, BC_ENVIRONMENT, BC_COMPANY
// (plus the Supabase keys the QuickBooks functions already use). The BC login never leaves the server.
import { nameKey, rpc, table } from '../qbo/_lib.js'

export const BC_ENV = String(process.env.BC_ENVIRONMENT || '').trim()
const TENANT = String(process.env.BC_TENANT_ID || '').trim()
const CLIENT = String(process.env.BC_CLIENT_ID || '').trim()
const SECRET = String(process.env.BC_CLIENT_SECRET || '')
const COMPANY = String(process.env.BC_COMPANY || '').trim()
const ROOT = () => `https://api.businesscentral.dynamics.com/v2.0/${encodeURIComponent(TENANT)}/${encodeURIComponent(BC_ENV)}/api/v2.0`

export function bcMissing() {
  const miss = []
  if (!TENANT) miss.push('BC_TENANT_ID')
  if (!CLIENT) miss.push('BC_CLIENT_ID')
  if (!SECRET) miss.push('BC_CLIENT_SECRET')
  if (!BC_ENV) miss.push('BC_ENVIRONMENT')
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) miss.push('SUPABASE_SERVICE_ROLE_KEY')
  return miss
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const r2 = n => Math.round(Number(n) * 100) / 100
/** a value inside an OData filter: 'it''s' */
const odq = s => String(s ?? '').replace(/'/g, "''")

// ---------- Microsoft sign-in (client credentials: the app's own login, no person) ----------
const AADSTS = {
  AADSTS7000215: 'the client secret is wrong. Use the secret\'s Value, not its Secret ID (BC_CLIENT_SECRET in Vercel).',
  AADSTS7000222: 'the client secret has expired. Make a new one in Entra and update BC_CLIENT_SECRET in Vercel.',
  AADSTS700016: 'Microsoft can\'t find the app. Check BC_CLIENT_ID (the Application (client) ID) and BC_TENANT_ID in Vercel.',
  AADSTS90002: 'Microsoft can\'t find the tenant. Check BC_TENANT_ID in Vercel (Directory (tenant) ID).',
  AADSTS900023: 'BC_TENANT_ID in Vercel isn\'t a valid tenant ID.',
  AADSTS500011: 'Business Central isn\'t set up in this Microsoft tenant.',
  AADSTS650052: 'the app has no permission for Business Central yet. In Entra, add API.ReadWrite.All and grant admin consent.',
}
let tok = null, tokExp = 0
async function token() {
  if (tok && Date.now() < tokExp - 120000) return tok
  const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(TENANT)}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT, client_secret: SECRET, scope: 'https://api.businesscentral.dynamics.com/.default' }),
    signal: AbortSignal.timeout(15000),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.access_token) {
    const d = String(j.error_description || j.error || `error ${r.status}`)
    const code = (d.match(/AADSTS\d+/) || [])[0]
    const e = new Error(`Microsoft sign-in failed${code ? ` (${code})` : ''}: ${(code && AADSTS[code]) || d.split(/\r?\n/)[0].slice(0, 300)}`)
    e.status = 401; e.signin = true
    throw e
  }
  tok = j.access_token
  tokExp = Date.now() + (Number(j.expires_in) || 3600) * 1000
  return tok
}

// ---------- Business Central API ----------
function bcError(j, status, text) {
  const m = j && j.error ? `${j.error.message || ''}${j.error.code ? ` (${j.error.code})` : ''}` : String(text || '').slice(0, 300)
  if (status === 401) return `Business Central turned the app's login away. Check that the app is on the Microsoft Entra Applications page in ${BC_ENV} with State = Enabled. ${m}`.trim()
  if (status === 403) return `Business Central says the app isn't allowed to do this. Check the permission sets on its Microsoft Entra Applications card in ${BC_ENV}. ${m}`.trim()
  if (status === 404 && /environment/i.test(m)) return `Business Central has no environment named "${BC_ENV}" (BC_ENVIRONMENT in Vercel). ${m}`.trim()
  return m || `Business Central error ${status}`
}
/** one call. path is relative to .../api/v2.0/ (or a full nextLink). PATCH and DELETE send If-Match: * (BC requires it). */
export async function bc(method, path, body, { retry = 2 } = {}) {
  const t = await token()
  const url = /^https:\/\//.test(path) ? path : `${ROOT()}/${path}`
  if (!url.startsWith('https://api.businesscentral.dynamics.com/')) throw new Error('Not a Business Central address')
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${t}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(method === 'PATCH' || method === 'DELETE' ? { 'If-Match': '*' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  })
  // too many calls: wait and try again. Server errors: only reads are tried again (a POST may already have made something).
  if (retry > 0 && (r.status === 429 || (r.status >= 500 && method === 'GET'))) {
    const wait = Math.min((Number(r.headers.get('retry-after')) || 2) * 1000, 8000)
    await sleep(wait)
    return bc(method, path, body, { retry: retry - 1 })
  }
  if (r.status === 204) return null
  const text = await r.text()
  let j = null
  try { j = text ? JSON.parse(text) : null } catch { j = null }
  if (!r.ok) { const e = new Error(bcError(j, r.status, text)); e.status = r.status; throw e }
  return j
}
/** every page of a list */
export async function getAll(path) {
  const out = []
  let next = path
  for (let k = 0; next && k < 200; k++) {
    const j = await bc('GET', next)
    out.push(...((j && j.value) || []))
    next = j && j['@odata.nextLink']
  }
  return out
}

// ---------- the company (BC_COMPANY) ----------
let companyCache = null
export async function company() {
  if (companyCache) return companyCache
  const list = await getAll('companies?$select=id,name,displayName')
  const names = list.map(x => x.name).join(', ') || 'none'
  let c = null
  if (COMPANY) c = list.find(x => x.name === COMPANY || x.displayName === COMPANY) || list.find(x => nameKey(x.name) === nameKey(COMPANY) || nameKey(x.displayName) === nameKey(COMPANY))
  else if (list.length === 1) c = list[0]
  if (!c) throw new Error(COMPANY ? `Business Central (${BC_ENV}) has no company named "${COMPANY}". Companies there: ${names}. Fix BC_COMPANY in Vercel.`
    : `Set BC_COMPANY in Vercel to one of the companies in ${BC_ENV}: ${names}.`)
  companyCache = c
  return c
}
const co = async p => `companies(${(await company()).id})/${p}`

// ---------- what's in Business Central, and how the app's things match it ----------
export async function bcLists() {
  const [customers, items, accounts, dims, terms] = await Promise.all([
    getAll(await co('customers?$select=id,number,displayName,blocked')),
    getAll(await co('items?$select=id,number,displayName,type,blocked')),
    getAll(await co('accounts?$select=id,number,displayName,category,blocked')),
    getAll(await co('dimensions?$select=id,code,displayName')),
    getAll(await co('paymentTerms?$select=id,code,displayName')),
  ])
  for (const d of dims) d.values = await getAll(await co(`dimensions(${d.id})/dimensionValues?$select=id,code,displayName`))
  return { customers, items, accounts, dims, terms }
}

export async function settingsAndMap() {
  const c = await rpc('bc_config', {})
  const s = c.settings || {}
  return {
    config: c,
    settings: {
      auto_push: s.auto_push === 'true', post: s.post === 'true', use_app_numbers: s.use_app_numbers === 'true',
      start_date: s.start_date || null,
      class_dims: String(s.class_dims || '').split(',').map(x => x.trim()).filter(Boolean),
    },
    map: c.map || [],
  }
}

/** the matching rules. A match set on the Business Central screen wins; otherwise the same name. */
export function matcher(L, map, settings) {
  const set = new Map(map.map(r => [`${r.kind}|${r.key}`, r.value]))
  const items = L.items.filter(x => !x.blocked)
  const accounts = L.accounts.filter(x => !x.blocked)
  // a customer blocked for Invoice or All can't be invoiced in BC (Ship only blocks shipping)
  const custs = L.customers.filter(x => !/^(invoice|all)$/i.test(String(x.blocked || '').trim()))
  const dims = new Map(L.dims.map(d => [String(d.code).toUpperCase(), d]))
  const same = (a, b) => !!a && !!b && nameKey(a) === nameKey(b)
  return {
    /** an app product (code, name) → { lineType: 'Item' | 'Account', number, label, how } */
    product(code, name) {
      const v = set.get(`product|${code}`)
      if (v) {
        const [kind, ...rest] = v.split(':'); const no = rest.join(':')
        if (kind === 'account') { const a = accounts.find(x => x.number === no); return a ? { lineType: 'Account', number: a.number, label: `${a.number} ${a.displayName}`, how: 'set' } : null }
        const i = items.find(x => x.number === no); return i ? { lineType: 'Item', number: i.number, label: `${i.number} ${i.displayName}`, how: 'set' } : null
      }
      const i = items.find(x => same(x.displayName, name)) || items.find(x => same(x.number, code)) || items.find(x => same(x.number, name))
      return i ? { lineType: 'Item', number: i.number, label: `${i.number} ${i.displayName}`, how: 'name' } : null
    },
    /** an app class → the dimension values for each dimension the classes go to (bc.class_dims), and what's missing */
    classDims(cls) {
      const out = [], missing = []
      for (const code of settings.class_dims) {
        const d = dims.get(String(code).toUpperCase())
        if (!d) { missing.push(`dimension ${code} isn't in Business Central`); continue }
        if (!cls) { missing.push(`no class on the line for ${d.code}`); continue }
        const v = set.get(`class|${cls}|${d.code}`)
        const hit = v ? d.values.find(x => x.code === v) : (d.values.find(x => same(x.displayName, cls)) || d.values.find(x => same(x.code, cls)))
        if (hit) out.push({ code: d.code, valueCode: hit.code, how: v ? 'set' : 'name' })
        else missing.push(`class "${cls}" has no ${d.code} value`)
      }
      return { dims: out, missing }
    },
    /** payment terms (app terms code / label) → BC payment terms, or null (then BC uses the customer's and the due date is set) */
    terms(code, label) {
      if (!code && !label) return null
      const v = code ? set.get(`terms|${code}`) : null
      if (v) { const t = L.terms.find(x => x.code === v); return t ? { ...t, how: 'set' } : null }
      const t = L.terms.find(x => same(x.code, code)) || L.terms.find(x => same(x.displayName, label)) || L.terms.find(x => same(x.code, label))
      return t ? { ...t, how: 'name' } : null
    },
    /** an app customer → BC customer: set on the screen, else the QuickBooks name, legal name or app name */
    customer(cu) {
      const v = set.get(`customer|${cu.id}`)
      if (v) { const c = custs.find(x => x.number === v); return c ? { ...c, how: 'set' } : null }
      for (const n of [cu.qbo_name, cu.legal_name, cu.name]) {
        const c = n && custs.find(x => same(x.displayName, n))
        if (c) return { ...c, how: 'name' }
      }
      return null
    },
  }
}

/** everything one run needs, read once (lists, settings, matches) */
export async function context() {
  const [L, sm] = await Promise.all([bcLists(), settingsAndMap()])
  return { L, ...sm, m: matcher(L, sm.map, sm.settings) }
}

// ---------- one invoice ----------
export class Busy extends Error {}
export async function sendInvoice(invoiceId, by, opts = {}) {
  const got = await rpc('bc_claim', { p_inv: invoiceId, p_env: BC_ENV })
  if (got === false) throw new Busy('This invoice is being copied to Business Central right now. Check again in a minute.')
  try { return await sendInvoice_(invoiceId, by, opts) }
  finally { await rpc('bc_release', { p_inv: invoiceId, p_env: BC_ENV }).catch(() => {}) }
}

const firstLine = s => String(s || '').split('\n')[0].trim()
/** Draft and In Review are unposted; Open, Paid, Canceled, Corrective are posted */
const bcStatus = st => (!st || st === 'Draft' || st === 'In Review') ? 'draft' : 'posted'
const byExt = ext => `salesInvoices?$filter=${encodeURIComponent(`externalDocumentNumber eq '${odq(ext)}'`)}&$select=id,number,status,totalAmountIncludingTax,externalDocumentNumber`
async function sendInvoice_(invoiceId, by, { ctx = null, resend = false } = {}) {
  const p = await rpc('acct_invoice_payload', { p_inv: invoiceId })
  if (p.problems && p.problems.length) throw new Error(p.problems.join(' '))
  const qb = await table(`acct_pushes?invoice_id=eq.${invoiceId}&status=eq.sent&select=env,total`)
  if (!qb || !qb.length) throw new Error(`${p.doc_number} isn't in QuickBooks yet. It's copied to Business Central once it's in QuickBooks.`)
  const x = ctx || await context()

  // everything must match before anything is made in Business Central
  const probs = []
  const cust = x.m.customer(p.customer)
  if (!cust) probs.push(`No customer named "${p.customer.qbo_name || p.customer.legal_name || p.customer.name}" in Business Central. Add it there with that name, or match it in Accounting > Settings > Business Central.`)
  const lines = []
  for (const l of p.lines) {
    const prod = x.m.product(l.product, l.item)
    if (!prod) { probs.push(`Product "${l.item}" has no Business Central item. Match it in Accounting > Settings > Business Central.`); continue }
    const cd = x.m.classDims(l.class)
    if (cd.missing.length) probs.push(`${cd.missing.join('; ')}. Match it in Accounting > Settings > Business Central.`)
    const amount = r2(l.amount), qty = Number(l.qty), price = Number(l.price)
    const exact = qty && Math.abs(r2(qty * price) - amount) < 0.005
    const parts = String(l.description || '').split('\n').map(s => s.trim()).filter(Boolean)
    lines.push({
      body: { lineType: prod.lineType, lineObjectNumber: prod.number, description: (firstLine(l.description) || l.item || '').slice(0, 100),
              quantity: exact ? qty : 1, unitPrice: exact ? price : amount },
      dims: cd.dims,
      // the batch line goes on as a comment line under it (tags stay in the app and QuickBooks)
      comments: parts.slice(1).filter(s => /^batch /i.test(s)).map(s => s.slice(0, 100)).slice(0, 1),
    })
  }
  if (probs.length) throw new Error([...new Set(probs)].join(' '))

  // already in Business Central? (copied before, or typed in by hand with the same number in External Document No.)
  const ext = String(p.doc_number).slice(0, 35)
  const found = (await bc('GET', await co(byExt(ext))))?.value || []
  let mode = 'created'
  if (found.length && !resend) {
    const f = found[0]
    const status = bcStatus(f.status)
    const note = `Already in Business Central as ${f.number}. Linked it, nothing changed there.${found.length > 1 ? ` (${found.length} there with this number.)` : ''}`
    await rpc('bc_record', { p_inv: invoiceId, p_env: BC_ENV, p_status: status, p_bc_id: f.id, p_bc_number: f.number, p_bc_total: Number(f.totalAmountIncludingTax), p_note: note, p_error: null, p_by: by })
    return { mode: 'linked', status, number: f.number, total: Number(f.totalAmountIncludingTax), note }
  }
  if (found.length && resend) {
    const posted = found.find(f => bcStatus(f.status) === 'posted')
    if (posted) throw new Error(`${ext} is posted in Business Central (${posted.number}). A posted invoice can't be replaced: correct it in Business Central with a credit memo.`)
    for (const f of found) await bc('DELETE', await co(`salesInvoices(${f.id})`))
    // the old draft is gone: if making the new one fails, it shows as a problem, not as a draft that isn't there
    await rpc('bc_checked', { p_env: BC_ENV, p_rows: [{ invoice_id: invoiceId, status: 'deleted' }] })
    mode = 'replaced'
  }

  // the invoice
  const head = { customerId: cust.id, invoiceDate: p.date, postingDate: p.date, externalDocumentNumber: ext }
  if (x.settings.use_app_numbers) head.number = String(p.doc_number).slice(0, 20)
  if (p.po) head.customerPurchaseOrderReference = String(p.po).slice(0, 35)
  const terms = x.m.terms(p.terms_code, p.terms)
  if (terms) head.paymentTermsId = terms.id
  let inv = await bc('POST', await co('salesInvoices'), head)
  try {
    if (p.due && inv.dueDate !== p.due) inv = await bc('PATCH', await co(`salesInvoices(${inv.id})`), { dueDate: p.due })
    for (const ln of lines) {
      const made = await bc('POST', await co(`salesInvoices(${inv.id})/salesInvoiceLines`), ln.body)
      for (const d of ln.dims) {
        await bc('POST', await co(`salesInvoices(${inv.id})/salesInvoiceLines(${made.id})/dimensionSetLines`), { parentId: made.id, code: d.code, valueCode: d.valueCode })
      }
      for (const c of ln.comments) await bc('POST', await co(`salesInvoices(${inv.id})/salesInvoiceLines`), { lineType: 'Comment', description: c })
    }
  } catch (e) {
    // never leave a half-made draft behind
    await bc('DELETE', await co(`salesInvoices(${inv.id})`)).catch(() => {})
    throw e
  }

  // post it only when Post in Business Central is on (off = drafts you can delete)
  let postErr = null
  if (x.settings.post) {
    try { await bc('POST', await co(`salesInvoices(${inv.id})/Microsoft.NAV.post`)) }
    catch (e) { postErr = String(e.message || e) }
  }
  const now = (await bc('GET', await co(`salesInvoices(${inv.id})?$select=id,number,status,totalAmountIncludingTax`)).catch(() => null))
    || (await bc('GET', await co(byExt(ext))))?.value?.[0]
    || inv
  const status = bcStatus(now.status)
  const total = Number(now.totalAmountIncludingTax ?? inv.totalAmountIncludingTax)
  const notes = []
  if (Math.abs(r2(total) - r2(p.total)) >= 0.01) notes.push(`Business Central total $${r2(total).toFixed(2)} differs from the app's $${r2(p.total).toFixed(2)} (sales tax on the customer in BC?).`)
  if (!terms && (p.terms_code || p.terms)) notes.push(`No Business Central payment terms for "${p.terms || p.terms_code}": used the customer's terms and set the due date.`)
  if (postErr) notes.push(`Made as a draft. Posting failed: ${postErr}`)
  if (mode === 'replaced') notes.push('Replaced the earlier draft.')
  const note = notes.join(' ') || null
  await rpc('bc_record', { p_inv: invoiceId, p_env: BC_ENV, p_status: status, p_bc_id: now.id || inv.id, p_bc_number: now.number || inv.number,
    p_bc_total: total, p_note: note, p_error: null, p_by: by })
  return { mode, status, number: now.number || inv.number, total, note }
}

/** record a failed copy (never wipes out one that's already in BC) */
export const recordError = (invoiceId, e, by) =>
  rpc('bc_record', { p_inv: invoiceId, p_env: BC_ENV, p_status: 'error', p_bc_id: null, p_bc_number: null, p_bc_total: null, p_note: null,
    p_error: String((e && e.message) || e).slice(0, 2000), p_by: by }).catch(() => {})

/** copy the invoices that are due (cron, or Send waiting now). Stops before the time budget runs out. */
export async function sendDue(by, budgetMs = 45000) {
  const t0 = Date.now()
  const due = (await rpc('bc_due', { p_env: BC_ENV, p_limit: 25 })) || []
  if (!due.length) return { due: 0, sent: 0, failed: 0 }
  const ctx = await context()
  let sent = 0, failed = 0, busy = 0
  for (const id of due) {
    if (Date.now() - t0 > budgetMs) break
    try { await sendInvoice(Number(id), by, { ctx }); sent++ }
    catch (e) {
      if (e instanceof Busy) { busy++; continue }
      failed++
      await recordError(Number(id), e, by)
      if (e.status === 401) break   // the login was turned away: don't try the rest with it
    }
  }
  return { due: due.length, sent, failed, busy }
}

/** Check Business Central: what BC says now about the copies (posted or deleted there by hand, totals) */
export async function checkCopies(budgetMs = 40000) {
  const t0 = Date.now()
  const rows = await table(`bc_pushes?env=eq.${encodeURIComponent(BC_ENV)}&status=in.(draft,posted,deleted)&select=invoice_id,bc_id,bc_number,status&order=sent_at.desc&limit=500`)
  if (!rows.length) return { checked: 0 }
  const invs = await table(`invoices?id=in.(${rows.map(r => r.invoice_id).join(',')})&select=id,inv_number`)
  const numOf = new Map(invs.map(i => [i.id, String(i.inv_number).slice(0, 35)]))
  const out = []
  for (let k = 0; k < rows.length; k += 15) {
    if (Date.now() - t0 > budgetMs) break
    const chunk = rows.slice(k, k + 15)
    const f = chunk.map(r => `externalDocumentNumber eq '${odq(numOf.get(r.invoice_id))}'`).join(' or ')
    const got = (await bc('GET', await co(`salesInvoices?$filter=${encodeURIComponent(f)}&$select=id,number,status,totalAmountIncludingTax,externalDocumentNumber`)))?.value || []
    for (const r of chunk) {
      const hit = got.find(g => g.id === r.bc_id) || got.find(g => g.externalDocumentNumber === numOf.get(r.invoice_id))
      out.push(hit ? { invoice_id: r.invoice_id, status: bcStatus(hit.status), bc_id: hit.id, bc_number: hit.number, bc_total: Number(hit.totalAmountIncludingTax) }
        : { invoice_id: r.invoice_id, status: 'deleted' })
    }
  }
  await rpc('bc_checked', { p_env: BC_ENV, p_rows: out })
  return { checked: out.length, posted: out.filter(r => r.status === 'posted').length, deleted: out.filter(r => r.status === 'deleted').length }
}
