// QuickBooks Online helpers for the server functions in api/qbo/. (Files starting with _ are not routes.)
// Needs in Vercel: QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_ENV (sandbox | production), SUPABASE_SERVICE_ROLE_KEY,
// plus the VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY the app already has. Optional: QBO_REDIRECT_URI, STAFF_APP_URL.
// The QuickBooks tokens live in qbo_connection, which only the service role can read.

export const ENV = (process.env.QBO_ENV || 'sandbox').toLowerCase() === 'production' ? 'production' : 'sandbox'
export const API = process.env.QBO_API_BASE || (ENV === 'production' ? 'https://quickbooks.api.intuit.com' : 'https://sandbox-quickbooks.api.intuit.com')
export const APP_URL = process.env.STAFF_APP_URL || 'https://freezer-map-8i3h.vercel.app'
export const REDIRECT = process.env.QBO_REDIRECT_URI || `${APP_URL}/api/qbo/callback`
const MINOR = 'minorversion=75'

// ---------- Intuit's sign-in addresses ----------
// Read from Intuit's discovery document (as Intuit recommends, so a change on their side is picked up on its own).
// Addresses from Intuit's "Authorization discovery documents" page. If the document can't be read, the last good copy or these built-in ones are used.
const DISCOVERY_URL = ENV === 'production'
  ? 'https://developer.api.intuit.com/.well-known/openid_configuration'
  : 'https://developer.api.intuit.com/.well-known/openid_sandbox_configuration'
const BUILT_IN = {
  authorize: 'https://appcenter.intuit.com/connect/oauth2',
  token: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
  revoke: 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke',
}
const DISCOVERY_KEEP = 12 * 3600000, DISCOVERY_WAIT = 10 * 60000
let discovered = null, discoveredAt = 0, discoveryFailedAt = 0
/** only ever send our keys to an https intuit.com address */
const intuitUrl = u => { try { const x = new URL(u); return x.protocol === 'https:' && (x.hostname === 'intuit.com' || x.hostname.endsWith('.intuit.com')) } catch { return false } }
export async function endpoints() {
  const now = Date.now()
  if (!(discovered && now - discoveredAt < DISCOVERY_KEEP) && now - discoveryFailedAt > DISCOVERY_WAIT) {
    try {
      const r = await fetch(DISCOVERY_URL, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(4000) })
      const d = r.ok ? await r.json() : null
      if (!d || ![d.authorization_endpoint, d.token_endpoint, d.revocation_endpoint].every(intuitUrl)) throw new Error('unusable discovery document')
      discovered = { authorize: d.authorization_endpoint, token: d.token_endpoint, revoke: d.revocation_endpoint }
      discoveredAt = now
    } catch { discoveryFailedAt = now }   // try again in 10 minutes; meanwhile the last good or built-in addresses
  }
  const e = discovered || BUILT_IN
  return process.env.QBO_TOKEN_URL ? { ...e, token: process.env.QBO_TOKEN_URL } : e
}

const SB = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

export function missingSetup() {
  const miss = []
  if (!process.env.QBO_CLIENT_ID) miss.push('QBO_CLIENT_ID')
  if (!process.env.QBO_CLIENT_SECRET) miss.push('QBO_CLIENT_SECRET')
  if (!SERVICE) miss.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!SB || !ANON) miss.push('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  return miss
}

// ---------- Supabase ----------
const serviceHeaders = () => SERVICE.startsWith('sb_')
  ? { apikey: SERVICE, 'Content-Type': 'application/json' }            // new-style secret key
  : { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }

async function sbFetch(path, opts, headers) {
  const r = await fetch(`${SB}${path}`, { ...opts, headers: { ...headers, ...(opts && opts.headers) } })
  const text = await r.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (!r.ok) throw new Error((body && (body.message || body.hint)) || `Database error ${r.status}`)
  return body
}
/** call a database function as the server (service role) */
export const rpc = (fn, args) => sbFetch(`/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args || {}) }, serviceHeaders())
/** read / write a table as the server */
export const table = (path, opts) => sbFetch(`/rest/v1/${path}`, opts || {}, serviceHeaders())
export const upsert = (tbl, rows, onConflict) => table(`${tbl}${onConflict ? `?on_conflict=${onConflict}` : ''}`, {
  method: 'POST', body: JSON.stringify(rows), headers: { Prefer: 'resolution=merge-duplicates,return=representation' } })

/** who is calling (their own login), and what they can do in Accounting */
export async function caller(req) {
  const auth = req.headers.authorization || ''
  if (!auth.startsWith('Bearer ')) return null
  try {
    const me = await sbFetch('/rest/v1/rpc/acct_me', { method: 'POST', body: '{}' }, { apikey: ANON, Authorization: auth, 'X-Tab-Id': String(req.headers['x-tab-id'] || ''), 'Content-Type': 'application/json' })
    return me && me.level ? me : null
  } catch { return null }
}
/** call a database function as the person calling (their own login and permissions) */
export function userRpc(req, fn, args) {
  const auth = req.headers.authorization || ''
  if (!auth.startsWith('Bearer ')) return Promise.reject(new Error('Sign in first'))
  return sbFetch(`/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args || {}) }, { apikey: ANON, Authorization: auth, 'X-Tab-Id': String(req.headers['x-tab-id'] || ''), 'Content-Type': 'application/json' })
}

// ---------- stored files (private bucket qbo-docs, 149) ----------
const BUCKET = 'qbo-docs'
const objPath = p => p.split('/').map(encodeURIComponent).join('/')
export async function storeFile(path, buf, type = 'application/pdf') {
  const r = await fetch(`${SB}/storage/v1/object/${BUCKET}/${objPath(path)}`, { method: 'POST', body: buf,
    headers: { ...serviceHeaders(), 'Content-Type': type, 'x-upsert': 'true', 'Cache-Control': 'no-cache' } })
  if (!r.ok) throw new Error(`Couldn't store the file (${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)})`)
}
/** a link to a stored file that works for a few minutes */
export async function signedUrl(path, seconds = 300) {
  const r = await fetch(`${SB}/storage/v1/object/sign/${BUCKET}/${objPath(path)}`, { method: 'POST', body: JSON.stringify({ expiresIn: seconds }),
    headers: { ...serviceHeaders(), 'Content-Type': 'application/json' } })
  const j = await r.json().catch(() => ({}))
  const u = j.signedURL || j.signedUrl
  if (!r.ok || !u) throw new Error(`Couldn't open the stored copy (${r.status})`)
  return u.startsWith('http') ? u : `${SB}/storage/v1${u.startsWith('/') ? '' : '/'}${u}`
}

// ---------- QuickBooks login ----------
const basic = () => 'Basic ' + Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString('base64')

export async function authorizeUrl(state) {
  const q = new URLSearchParams({ client_id: process.env.QBO_CLIENT_ID, response_type: 'code', scope: 'com.intuit.quickbooks.accounting', redirect_uri: REDIRECT, state })
  return `${(await endpoints()).authorize}?${q}`
}

async function tokenCall(params) {
  const r = await fetch((await endpoints()).token, { method: 'POST', headers: { Authorization: basic(), Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) { const e = new Error(j.error_description || j.error || `QuickBooks sign-in failed (${r.status})`); e.status = r.status; e.code = j.error; throw e }
  return j
}
// Intuit turned the sign-in down (invalid_grant: refresh token expired or revoked; invalid_client: wrong keys).
// The app never asks again with the same login: it waits until an Accounting Admin reconnects (callback.js clears this).
const RECONNECT = 'Reconnect needed: '
const tokenRow = t => ({
  access_token: t.access_token, refresh_token: t.refresh_token,
  access_expires_at: new Date(Date.now() + (Number(t.expires_in) || 3600) * 1000).toISOString(),
  refresh_expires_at: new Date(Date.now() + (Number(t.x_refresh_token_expires_in) || 8640000) * 1000).toISOString(),
})
export const exchangeCode = code => tokenCall({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT }).then(tokenRow)

export async function revoke(token) {
  await fetch((await endpoints()).revoke, { method: 'POST', headers: { Authorization: basic(), Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }).catch(() => {})
}

/** the connection for this environment, with a fresh access token */
export async function connection() {
  const rows = await table(`qbo_connection?env=eq.${ENV}&select=*`)
  const c = rows && rows[0]
  if (!c) throw new Error(`QuickBooks (${ENV}) isn't connected yet. An Accounting Admin can connect it in Accounting > Settings.`)
  // turned down before: don't try that login again
  if (String(c.last_error || '').startsWith(RECONNECT))
    throw new Error(`The QuickBooks connection needs to be reconnected (${c.last_error.slice(RECONNECT.length)}). An Accounting Admin can do it in Accounting > Settings.`)
  // renew only when the access token (1 hour) has run out or is about to
  if (!c.access_token || new Date(c.access_expires_at).getTime() < Date.now() + 5 * 60000) {
    let t
    try { t = tokenRow(await tokenCall({ grant_type: 'refresh_token', refresh_token: c.refresh_token })) }
    catch (e) {
      const refused = e.status >= 400 && e.status < 500   // Intuit said no: stop until someone reconnects
      await table(`qbo_connection?env=eq.${ENV}`, { method: 'PATCH', body: JSON.stringify({ last_error: refused ? `${RECONNECT}${e.message}` : `Couldn't reach QuickBooks to renew the sign-in: ${e.message}` }) }).catch(() => {})
      throw new Error(refused ? `The QuickBooks connection expired (${e.message}). An Accounting Admin needs to connect it again in Accounting > Settings.`
        : `Couldn't reach QuickBooks (${e.message}). It will try again on the next scheduled check.`)
    }
    await table(`qbo_connection?env=eq.${ENV}`, { method: 'PATCH', body: JSON.stringify(t) })
    Object.assign(c, t)
  }
  return c
}

// ---------- QuickBooks API ----------
function qboError(j, status) {
  const f = j && j.Fault && j.Fault.Error && j.Fault.Error[0]
  if (f) return `${f.Message}${f.Detail && f.Detail !== f.Message ? `: ${f.Detail}` : ''}${f.code ? ` (${f.code})` : ''}`
  return (j && (j.message || j.error)) || `QuickBooks error ${status}`
}
export async function qbo(c, method, path, body) {
  const sep = path.includes('?') ? '&' : '?'
  const r = await fetch(`${API}/v3/company/${c.realm_id}/${path}${sep}${MINOR}`, {
    method, headers: { Authorization: `Bearer ${c.access_token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const j = await r.json().catch(() => ({}))
  if (r.status === 401) {
    // access token refused before its hour was up (e.g. disconnected in QuickBooks): renew once on the next check, never again with this one
    await table(`qbo_connection?env=eq.${ENV}`, { method: 'PATCH', body: JSON.stringify({ access_expires_at: new Date(0).toISOString() }) }).catch(() => {})
  }
  if (!r.ok || j.Fault) { const e = new Error(qboError(j, r.status)); e.status = r.status; e.tid = r.headers.get('intuit_tid'); throw e }
  return j
}
const esc = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")
export async function query(c, sql) {
  const j = await qbo(c, 'GET', `query?query=${encodeURIComponent(sql)}`)
  return j.QueryResponse || {}
}
export async function findOne(c, entity, field, value) {
  const r = await query(c, `select * from ${entity} where ${field} = '${esc(value)}'`)
  return (r[entity] || [])[0] || null
}
export async function companyName(c) {
  const j = await qbo(c, 'GET', `companyinfo/${c.realm_id}`)
  return j.CompanyInfo && (j.CompanyInfo.CompanyName || j.CompanyInfo.LegalName)
}

// ---------- matching our things to QuickBooks ids ----------
async function getRef(kind, key) {
  const r = await table(`qbo_refs?env=eq.${ENV}&kind=eq.${kind}&key=eq.${encodeURIComponent(key)}&select=qbo_id`)
  return r && r[0] ? r[0].qbo_id : null
}
const setRef = (kind, key, qbo_id, name) => upsert('qbo_refs', [{ env: ENV, kind, key: String(key), qbo_id: String(qbo_id), name, updated_at: new Date().toISOString() }], 'env,kind,key')

export async function itemId(c, code, name) {
  const have = await getRef('item', code)
  if (have) return have
  const it = await findOne(c, 'Item', 'Name', name)
  if (!it) throw new Error(`The product "${name}" isn't in QuickBooks${ENV === 'sandbox' ? ' (run Set up sandbox in Accounting > Settings)' : ''}. Add it there with exactly that name, or rename it in Accounting > Settings > Products.`)
  if (it.Active === false) throw new Error(`The product "${name}" is inactive in QuickBooks.`)
  await setRef('item', code, it.Id, it.Name)
  return it.Id
}
export async function classId(c, name) {
  const have = await getRef('class', name)
  if (have) return have
  const cl = await findOne(c, 'Class', 'Name', name)
  if (!cl) throw new Error(`The class "${name}" isn't in QuickBooks${ENV === 'sandbox' ? ' (run Set up sandbox in Accounting > Settings)' : ''}. Add it there with exactly that name, or rename it in Accounting > Settings > Classes.`)
  await setRef('class', name, cl.Id, cl.Name)
  return cl.Id
}
export async function termId(c, code, label) {
  if (!label) return null
  const have = await getRef('term', code)
  if (have) return have === 'none' ? null : have
  const t = await findOne(c, 'Term', 'Name', label)
  await setRef('term', code, t ? t.Id : 'none', t ? t.Name : null)
  return t ? t.Id : null
}
const addr = text => {
  const ls = String(text || '').split(/\n|;\s*/).map(s => s.trim()).filter(Boolean)
  if (!ls.length) return undefined
  const a = {}
  ls.slice(0, 5).forEach((l, i) => { a[`Line${i + 1}`] = l.slice(0, 500) })
  return a
}

// ---------- email addresses ----------
// The billing email box in the app can hold several addresses ("a@x.com, b@x.com; c@x.com").
// QuickBooks keeps several in one box too, comma-separated (its own screens do this): the invoice To box
// (BillEmail) takes 100 characters, Cc (BillEmailCc) 200, the customer's email 100.
/** every address in the box, in order, each once */
export function emailList(text) {
  const seen = new Set(), out = []
  for (const part of String(text || '').split(/[,;\s]+/)) {
    const a = part.replace(/^[<("']+|[>)"'.]+$/g, '')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a) || seen.has(a.toLowerCase())) continue
    seen.add(a.toLowerCase()); out.push(a)
  }
  return out
}
/** as many addresses as fit in max characters (comma, no space), and the ones that didn't */
function packEmails(list, max) {
  const take = [], rest = []
  let len = 0
  for (const a of list) {
    const add = a.length + (take.length ? 1 : 0)
    if (len + add <= max) { take.push(a); len += add } else rest.push(a)
  }
  return [take.join(','), rest]
}
/** the invoice's email boxes: everything in To, then Cc for what doesn't fit. oneTo: only the first address in To, the rest in Cc */
export function invoiceEmails(text, oneTo = false) {
  const all = emailList(text)
  if (!all.length) return { left: [] }
  const [to, rest] = oneTo ? [all[0], all.slice(1)] : packEmails(all, 100)
  const [cc, left] = packEmails(rest, 200)
  return { BillEmail: to ? { Address: to } : undefined, BillEmailCc: cc ? { Address: cc } : undefined, left }
}
const emailError = e => /e-?mail/i.test(String((e && e.message) || e))
/** send an invoice with all the billing addresses; if QuickBooks ever refuses several in the To box, send again with one To and the rest as Cc */
export async function sendWithEmails(send, body, text) {
  try { return await send(body) }
  catch (e) {
    if (!emailError(e) || !String((body.BillEmail && body.BillEmail.Address) || '').includes(',')) throw e
    const m = invoiceEmails(text, true)
    const b = { ...body, BillEmail: m.BillEmail }
    if (m.BillEmailCc) b.BillEmailCc = m.BillEmailCc; else delete b.BillEmailCc
    return send(b)
  }
}

export async function customerId(c, cu) {
  const have = await getRef('customer', cu.id)
  if (have) return have
  // the QuickBooks name (from the QuickBooks import) is matched first and exactly; then the legal name, then the app name
  const qn = cu.qbo_name ? String(cu.qbo_name).trim() : ''
  let found = qn ? await findOne(c, 'Customer', 'DisplayName', qn) : null
  const name = (qn || String(cu.legal_name || cu.name).replace(/:/g, '-')).slice(0, 500)
  if (!found && !qn) found = await findOne(c, 'Customer', 'DisplayName', name)
  if (!found && cu.name && cu.name !== name) found = await findOne(c, 'Customer', 'DisplayName', cu.name)
  if (!found) {
    const body = { DisplayName: name, CompanyName: name.slice(0, 100) }
    const emails = emailList(cu.email)
    if (emails.length) body.PrimaryEmailAddr = { Address: packEmails(emails, 100)[0] || emails[0].slice(0, 100) }
    if (cu.phone) body.PrimaryPhone = { FreeFormNumber: String(cu.phone).slice(0, 30) }
    if (cu.billing_address) body.BillAddr = addr(cu.billing_address)
    if (cu.ship_to_address) body.ShipAddr = addr(cu.ship_to_address)
    const notes = [cu.license ? `License ${cu.license}` : null, cu.contact ? `Billing contact ${cu.contact}` : null].filter(Boolean).join(' · ')
    if (notes) body.Notes = notes.slice(0, 2000)
    // all the billing addresses; if QuickBooks refuses several, just the first
    found = (await qbo(c, 'POST', 'customer', body).catch(e => (emailError(e) && emails.length > 1
      ? qbo(c, 'POST', 'customer', { ...body, PrimaryEmailAddr: { Address: emails[0].slice(0, 100) } }) : Promise.reject(e)))).Customer
  }
  await setRef('customer', cu.id, found.Id, found.DisplayName)
  return found.Id
}

// ---------- one invoice ----------
const r2 = n => Math.round(Number(n) * 100) / 100
export class Busy extends Error {}
/** send one invoice; one at a time per invoice (a click and the auto-send can't make two QuickBooks invoices) */
export async function pushInvoice(c, invoiceId, by) {
  const got = await rpc('acct_claim_push', { p_inv: invoiceId, p_env: ENV }).catch(e => (/acct_claim_push|function|schema cache|404/i.test(String(e.message)) ? true : Promise.reject(e)))
  if (got === false) throw new Busy('This invoice is being sent right now. Check again in a minute.')
  try { return await pushInvoice_(c, invoiceId, by) }
  finally { await rpc('acct_release_push', { p_inv: invoiceId, p_env: ENV }).catch(() => {}) }
}
async function pushInvoice_(c, invoiceId, by) {
  const p = await rpc('acct_invoice_payload', { p_inv: invoiceId })
  if (p.problems && p.problems.length) throw new Error(p.problems.join(' '))
  const custId = await customerId(c, p.customer)
  const lines = [], map = []
  for (const l of p.lines) {
    const amount = r2(l.amount), qty = Number(l.qty), price = Number(l.price)
    const detail = { ItemRef: { value: await itemId(c, l.product, l.item) }, ClassRef: { value: await classId(c, l.class) } }
    const asAmount = !(qty && Math.abs(r2(qty * price) - amount) < 0.005)
    if (!asAmount) { detail.Qty = qty; detail.UnitPrice = price } else { detail.Qty = 1; detail.UnitPrice = amount }
    map.push({ line_id: l.line_id, as_amount: asAmount || undefined, split: l.split || undefined })
    lines.push({ DetailType: 'SalesItemLineDetail', Amount: amount, Description: String(l.description || '').slice(0, 4000), SalesItemLineDetail: detail })
  }
  const body = {
    DocNumber: String(p.doc_number).slice(0, 21), TxnDate: p.date, DueDate: p.due || undefined,
    CustomerRef: { value: custId }, Line: lines,
    PrivateNote: [`From the Lifted Farms app`, p.so ? `order ${p.so}` : null, p.seller_license ? `seller license ${p.seller_license}` : null, p.terms ? `terms ${p.terms}` : null].filter(Boolean).join(' · ').slice(0, 4000),
  }
  if (p.memo) body.CustomerMemo = { value: String(p.memo).slice(0, 1000) }
  // every billing address on the customer card: To first, Cc for any that don't fit
  const mail = invoiceEmails(p.customer.email)
  if (mail.BillEmail) body.BillEmail = mail.BillEmail
  if (mail.BillEmailCc) body.BillEmailCc = mail.BillEmailCc
  const term = await termId(c, p.terms_code, p.terms)
  if (term) body.SalesTermRef = { value: term }

  // already there? (sent before, or typed in by hand with the same number)
  const existing = (p.push && p.push.qbo_id) ? (await query(c, `select * from Invoice where Id = '${esc(p.push.qbo_id)}'`)).Invoice?.[0]
    : (await query(c, `select * from Invoice where DocNumber = '${esc(body.DocNumber)}'`)).Invoice?.[0]
  let inv, note = null, mode = 'created'
  if (existing && ENV === 'production') {
    // never overwrite something already in the real books: link it and say so
    inv = existing; mode = 'linked'
    note = r2(existing.TotalAmt) !== r2(p.total) ? `${body.DocNumber} was already in QuickBooks with a different total ($${existing.TotalAmt}). Linked it without changing it. Fix it in QuickBooks.`
      : `${body.DocNumber} was already in QuickBooks. Linked it.`
  } else if (existing) {
    inv = (await sendWithEmails(b => qbo(c, 'POST', 'invoice', { ...b, Id: existing.Id, SyncToken: existing.SyncToken, sparse: true }), body, p.customer.email)).Invoice; mode = 'updated'
  } else {
    inv = (await sendWithEmails(b => qbo(c, 'POST', 'invoice', b), body, p.customer.email)).Invoice
  }
  if (mode !== 'linked' && mail.left.length) note = `QuickBooks' email boxes are full. Not on the invoice: ${mail.left.join(', ')}.`
  // which QuickBooks line is which app line (prices changed there come back); only when we wrote the lines ourselves
  const ql = (inv.Line || []).filter(x => x.DetailType === 'SalesItemLineDetail')
  const lineMap = mode !== 'linked' && ql.length === map.length ? map.map((m, i) => ({ ...m, qbo_line_id: String(ql[i].Id) })) : null
  await rpc('acct_record_push', { p_inv: invoiceId, p_env: ENV, p_qbo_id: String(inv.Id), p_doc: inv.DocNumber || body.DocNumber,
    p_total: Number(inv.TotalAmt), p_balance: Number(inv.Balance), p_error: null, p_by: by, p_line_map: lineMap })
  return { qbo_id: inv.Id, doc_number: inv.DocNumber, total: inv.TotalAmt, balance: inv.Balance, mode, note }
}

// ---------- credit memos (returns, 159) ----------
/** send one credit memo (Product Return lines); one at a time per credit memo, never two in QuickBooks */
export async function pushCreditMemo(c, cmId, by) {
  const got = await rpc('cm_claim_push', { p_id: cmId })
  if (got === false) throw new Busy('This credit memo is being sent right now. Check again in a minute.')
  try { return await pushCreditMemo_(c, cmId, by) }
  finally { await rpc('cm_release_push', { p_id: cmId }).catch(() => {}) }
}
async function pushCreditMemo_(c, cmId, by) {
  const p = await rpc('cm_payload', { p_id: cmId })
  if (p.acct_status === 'sent' && p.qbo_id) return { qbo_id: p.qbo_id, doc_number: p.doc_number, total: p.total, mode: 'already sent' }
  if (p.problems && p.problems.length) throw new Error(p.problems.join(' '))
  const custId = await customerId(c, p.customer)
  const lines = []
  for (const l of p.lines) {
    const qty = Number(l.qty), price = Number(l.price), amount = r2(l.amount)
    const detail = { ItemRef: { value: await itemId(c, l.product, l.item) }, ClassRef: { value: await classId(c, l.class) } }
    if (qty && Math.abs(r2(qty * price) - amount) < 0.005) { detail.Qty = qty; detail.UnitPrice = price } else { detail.Qty = 1; detail.UnitPrice = amount }
    lines.push({ DetailType: 'SalesItemLineDetail', Amount: amount, Description: String(l.description || '').slice(0, 4000), SalesItemLineDetail: detail })
  }
  const body = { DocNumber: String(p.doc_number).slice(0, 21), TxnDate: p.date, CustomerRef: { value: custId }, Line: lines,
    PrivateNote: ['From the Lifted Farms app', p.memo].filter(Boolean).join(' · ').slice(0, 4000) }
  if (p.memo) body.CustomerMemo = { value: String(p.memo).slice(0, 1000) }
  // the customer's billing emails, same as invoices: To first, Cc for any that don't fit
  const mail = invoiceEmails(p.customer.email)
  if (mail.BillEmail) body.BillEmail = mail.BillEmail
  if (mail.BillEmailCc) body.BillEmailCc = mail.BillEmailCc
  // already there? (sent before, or typed in by hand with the same number): link it, never make a second one
  const existing = (await query(c, `select * from CreditMemo where DocNumber = '${esc(body.DocNumber)}'`)).CreditMemo?.[0]
  let cm, mode = 'created', note = null
  if (existing) {
    cm = existing; mode = 'linked'
    note = r2(existing.TotalAmt) !== r2(p.total) ? `${body.DocNumber} was already in QuickBooks with a different total ($${existing.TotalAmt}). Linked it without changing it.` : `${body.DocNumber} was already in QuickBooks. Linked it.`
  } else {
    cm = (await sendWithEmails(b => qbo(c, 'POST', 'creditmemo', b), body, p.customer.email)).CreditMemo
    if (mail.left.length) note = `QuickBooks' email boxes are full. Not on the credit memo: ${mail.left.join(', ')}.`
  }
  await rpc('cm_record_push', { p_id: cmId, p_env: ENV, p_qbo_id: String(cm.Id), p_doc: cm.DocNumber || body.DocNumber, p_total: Number(cm.TotalAmt), p_error: null, p_by: by })
  return { qbo_id: cm.Id, doc_number: cm.DocNumber, total: cm.TotalAmt, mode, note }
}
/** put the customer's billing emails on a credit memo already in QuickBooks (only the emails change) */
export async function creditMemoEmails(c, cmId) {
  const p = await rpc('cm_payload', { p_id: cmId })
  if (!p.qbo_id) throw new Error(`${p.doc_number} isn't in QuickBooks yet.`)
  const mail = invoiceEmails(p.customer.email)
  if (!mail.BillEmail) throw new Error(`${p.customer.name} has no billing email in the app (Sales > customer card).`)
  const q = (await query(c, `select * from CreditMemo where Id = '${esc(p.qbo_id)}'`)).CreditMemo?.[0]
  if (!q) throw new Error(`QuickBooks has no credit memo #${p.doc_number} any more.`)
  const body = { Id: q.Id, SyncToken: q.SyncToken, sparse: true, BillEmail: mail.BillEmail, ...(mail.BillEmailCc ? { BillEmailCc: mail.BillEmailCc } : {}) }
  const cm = (await sendWithEmails(b => qbo(c, 'POST', 'creditmemo', b), body, p.customer.email)).CreditMemo
  return { doc_number: cm.DocNumber, to: cm.BillEmail?.Address ?? null, cc: cm.BillEmailCc?.Address ?? null, left: mail.left }
}
/** the credit was already made in QuickBooks by hand under another number: link it (nothing changes in QuickBooks) */
export async function linkCreditMemo(c, cmId, docNumber, by) {
  const num = String(docNumber || '').trim()
  if (!num) throw new Error('Which QuickBooks credit memo number?')
  const p = await rpc('cm_payload', { p_id: cmId })
  if (p.acct_status === 'sent') throw new Error(`${p.doc_number} is already in QuickBooks.`)
  const found = (await query(c, `select * from CreditMemo where DocNumber = '${esc(num)}'`)).CreditMemo || []
  if (!found.length) throw new Error(`QuickBooks${ENV === 'sandbox' ? ' (sandbox)' : ''} has no credit memo numbered ${num}.`)
  if (found.length > 1) throw new Error(`QuickBooks has ${found.length} credit memos numbered ${num}.`)
  const q = found[0]
  const taken = await table(`credit_memos?qbo_env=eq.${ENV}&qbo_id=eq.${encodeURIComponent(q.Id)}&id=neq.${cmId}&select=cm_number`)
  if (taken && taken.length) throw new Error(`QuickBooks credit memo ${num} is already linked to ${taken[0].cm_number}.`)
  await rpc('cm_record_push', { p_id: cmId, p_env: ENV, p_qbo_id: String(q.Id), p_doc: q.DocNumber, p_total: Number(q.TotalAmt), p_error: null, p_by: `${by || 'someone'} (linked to QuickBooks #${q.DocNumber})` })
  const warn = r2(q.TotalAmt) !== r2(p.total) ? `Totals differ: QuickBooks $${r2(q.TotalAmt).toFixed(2)}, app $${r2(p.total).toFixed(2)}.` : null
  return { linked: true, qbo: { qbo_id: String(q.Id), doc_number: q.DocNumber, total: Number(q.TotalAmt), customer: q.CustomerRef?.name ?? null }, warning: warn }
}

// ---------- payments: balances back from QuickBooks ----------
export async function syncBalances(c) {
  const since = new Date(Date.now() - 120 * 86400000).toISOString()
  let rows
  try { rows = await table(`acct_pushes?env=eq.${ENV}&status=eq.sent&qbo_id=not.is.null&or=(balance.is.null,balance.gt.0,sent_at.gt.${since})&select=invoice_id,qbo_id,line_map,pulled_at&limit=2000`) }
  catch { rows = await table(`acct_pushes?env=eq.${ENV}&status=eq.sent&qbo_id=not.is.null&or=(balance.is.null,balance.gt.0,sent_at.gt.${since})&select=invoice_id,qbo_id&limit=2000`) }
  const out = []
  let pulled = 0, pullErr = null
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50)
    const r = await query(c, `select * from Invoice where Id in (${chunk.map(x => `'${esc(x.qbo_id)}'`).join(',')}) maxresults 100`)
    const got = new Map((r.Invoice || []).map(x => [String(x.Id), x]))
    for (const x of chunk) {
      const q = got.get(String(x.qbo_id))
      out.push(q ? { invoice_id: x.invoice_id, balance: Number(q.Balance), total: Number(q.TotalAmt) } : { invoice_id: x.invoice_id, balance: null, deleted: true })
      // prices changed in QuickBooks come back to the app (only when QuickBooks changed it since we last looked)
      if (q && x.line_map && (!x.pulled_at || new Date(q.MetaData?.LastUpdatedTime ?? 0) > new Date(x.pulled_at))) {
        const lines = (q.Line || []).filter(l => l.DetailType === 'SalesItemLineDetail').map(l => ({
          qbo_line_id: String(l.Id), item: l.SalesItemLineDetail?.ItemRef?.value ?? null, qty: l.SalesItemLineDetail?.Qty ?? null,
          price: l.SalesItemLineDetail?.UnitPrice ?? null, amount: l.Amount, description: l.Description ?? '' }))
        try { const pr = await rpc('acct_pull_lines', { p_inv: x.invoice_id, p_env: ENV, p_lines: lines, p_updated: q.MetaData?.LastUpdatedTime ?? null }); if (pr?.changes?.length) pulled++ }
        catch (e) { pullErr = String(e.message || e).slice(0, 200) }
      }
    }
  }
  const res = await rpc('acct_record_sync', { p_env: ENV, p_rows: out, p_error: null })
  return { checked: out.length, prices_pulled: pulled, ...(pullErr ? { pull_error: pullErr } : {}), ...res }
}

// ---------- customer balances and open items, for the customer dashboard and statement (060) ----------
// The QuickBooks customer balance is the headline number (it includes Roshi-era invoices, credit memos and unapplied payments).
async function queryAll(c, sql, entity) {
  const out = []
  for (let start = 1; start < 20000; start += 500) {
    const r = await query(c, `${sql} startposition ${start} maxresults 500`)
    const xs = r[entity] || []
    out.push(...xs)
    if (xs.length < 500) break
  }
  return out
}
// ---------- every app customer matched to its QuickBooks customer (149) ----------
// Matched by exact name, ignoring case and punctuation: the QuickBooks name from the customer import first, then the
// legal name, then the app name. Only a single, unclaimed match is taken; anything else is left for a person.
export const nameKey = s => String(s ?? '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()
export async function matchCustomers(c) {
  const refs = await table(`qbo_refs?env=eq.${ENV}&kind=eq.customer&select=key,qbo_id&limit=5000`)
  const have = new Set((refs || []).map(r => String(r.key)))
  const claimed = new Set((refs || []).map(r => String(r.qbo_id)))
  const ours = await table('customers?kind=eq.external&select=id,name,legal_name,qbo_name&limit=5000')
  const todo = (ours || []).filter(cu => !have.has(String(cu.id)))
  if (!todo.length) return { matched: 0, unmatched: [] }
  const theirs = await queryAll(c, 'select Id, DisplayName, CompanyName from Customer', 'Customer')
  const byName = new Map()
  const put = (k, x) => { if (!k) return; const s = byName.get(k) || new Map(); s.set(String(x.Id), x); byName.set(k, s) }
  for (const x of theirs) { put(nameKey(x.DisplayName), x); put(nameKey(x.CompanyName), x) }
  let matched = 0; const unmatched = []
  for (const cu of todo) {
    let hit = null
    for (const n of [cu.qbo_name, cu.legal_name, cu.name]) {
      const s = byName.get(nameKey(n))
      if (s && s.size === 1) { hit = [...s.values()][0]; break }
      if (s && s.size > 1) break   // two QuickBooks customers share that name: leave it for a person
    }
    if (hit && !claimed.has(String(hit.Id))) { await setRef('customer', cu.id, hit.Id, hit.DisplayName); claimed.add(String(hit.Id)); matched++ }
    else unmatched.push(cu.name)
  }
  return { matched, unmatched }
}

// ---------- copies of QuickBooks invoices and credit memos (149) ----------
// Customers see QuickBooks' own copy of each open invoice and the last 12 months of invoices on their statement.
// The details are kept in acct_qbo_docs; the PDF (exactly as QuickBooks makes it) in the private qbo-docs bucket.
export const DOC_MONTHS = 12
const docPath = (kind, id) => `${ENV}/${kind}/${id}.pdf`
export function docRow(kind, x, customerId, invoiceId) {
  const lines = (x.Line || []).filter(l => l.DetailType === 'SalesItemLineDetail').map(l => ({
    item: l.SalesItemLineDetail?.ItemRef?.name ?? null, description: l.Description ?? '', qty: l.SalesItemLineDetail?.Qty ?? null,
    price: l.SalesItemLineDetail?.UnitPrice ?? null, amount: Number(l.Amount ?? 0) }))
  return { env: ENV, kind, qbo_id: String(x.Id), customer_id: customerId ?? null, qbo_customer_id: x.CustomerRef ? String(x.CustomerRef.value) : null,
    doc_number: x.DocNumber || null, txn_date: x.TxnDate || null, due_date: x.DueDate || null, total: Number(x.TotalAmt ?? 0),
    balance: Number(kind === 'Invoice' ? (x.Balance ?? 0) : (x.RemainingCredit ?? 0)), lines, memo: x.CustomerMemo?.value ?? null,
    invoice_id: invoiceId ?? null, qbo_updated_at: x.MetaData?.LastUpdatedTime ?? null, synced_at: new Date().toISOString() }
}
/** QuickBooks' PDF of one invoice or credit memo */
export async function qboPdf(c, kind, id) {
  const r = await fetch(`${API}/v3/company/${c.realm_id}/${kind.toLowerCase()}/${encodeURIComponent(id)}/pdf?${MINOR}`, {
    headers: { Authorization: `Bearer ${c.access_token}`, Accept: 'application/pdf' } })
  if (r.status === 401) await table(`qbo_connection?env=eq.${ENV}`, { method: 'PATCH', body: JSON.stringify({ access_expires_at: new Date(0).toISOString() }) }).catch(() => {})
  if (!r.ok) { const e = new Error(`QuickBooks didn't give the PDF (${r.status})`); e.status = r.status; e.tid = r.headers.get('intuit_tid'); throw e }
  return Buffer.from(await r.arrayBuffer())
}
/** make sure the stored PDF is QuickBooks' latest; returns the stored path */
export async function ensurePdf(c, d) {
  const fresh = d.pdf_path && d.pdf_at && (!d.qbo_updated_at || new Date(d.pdf_at) >= new Date(d.qbo_updated_at))
  if (fresh) return d.pdf_path
  const path = docPath(d.kind, d.qbo_id)
  await storeFile(path, await qboPdf(c, d.kind, d.qbo_id))
  await table(`acct_qbo_docs?env=eq.${ENV}&kind=eq.${d.kind}&qbo_id=eq.${encodeURIComponent(d.qbo_id)}`, { method: 'PATCH',
    body: JSON.stringify({ pdf_path: path, pdf_at: new Date().toISOString() }), headers: { Prefer: 'return=minimal' } })
  return path
}
const docKey = (kind, id) => `${kind}:${id}`
/** keep the copies current: open ones (any age) and anything QuickBooks changed since the last run (12 months back the first time).
 *  PDFs are fetched while time is left (open and newest first); the rest on the next run or when someone opens one. */
export async function syncDocs(c, { ours, open = [], credits = [], until = Date.now() + 30000 } = {}) {
  const t0 = new Date().toISOString()
  const cutoff = new Date(Date.now() - DOC_MONTHS * 31 * 86400000).toISOString().slice(0, 10)
  const ckey = `acct.docs_cursor.${ENV}`
  const cur = (await table(`app_settings?key=eq.${ckey}&select=value`))?.[0]?.value || `${cutoff}T00:00:00Z`
  const changedInv = await queryAll(c, `select * from Invoice where MetaData.LastUpdatedTime >= '${esc(cur)}'`, 'Invoice')
  const changedCm = await queryAll(c, `select * from CreditMemo where MetaData.LastUpdatedTime >= '${esc(cur)}'`, 'CreditMemo')
  const pushes = await table(`acct_pushes?env=eq.${ENV}&status=eq.sent&qbo_id=not.is.null&select=invoice_id,qbo_id&limit=10000`)
  const linked = new Map((pushes || []).map(p => [String(p.qbo_id), p.invoice_id]))
  const pick = new Map()
  const consider = (kind, x) => {
    const cust = ours.get(String(x.CustomerRef?.value))
    if (cust == null) return
    const openNow = kind === 'Invoice' ? Number(x.Balance) > 0 : Number(x.RemainingCredit) > 0
    if (!openNow && String(x.TxnDate || '') < cutoff) return
    pick.set(docKey(kind, x.Id), docRow(kind, x, cust, kind === 'Invoice' ? linked.get(String(x.Id)) : null))
  }
  for (const x of open) consider('Invoice', x)
  for (const x of changedInv) consider('Invoice', x)
  for (const x of credits) consider('CreditMemo', x)
  for (const x of changedCm) consider('CreditMemo', x)
  const rows = [...pick.values()]
  for (let i = 0; i < rows.length; i += 200) await table('acct_qbo_docs?on_conflict=env,kind,qbo_id', { method: 'POST', body: JSON.stringify(rows.slice(i, i + 200)),
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } })
  await upsert('app_settings', [{ key: ckey, value: new Date(Date.parse(t0) - 10 * 60000).toISOString() }], 'key')
  // deleted in QuickBooks: gone here too (never lets it stop the rest)
  let pruned
  try { pruned = await pruneDocs(c, { until: until - 10000 }) } catch (e) { pruned = { remove_error: String(e.message || e).slice(0, 200) } }
  // PDFs: missing or older than QuickBooks' last change
  const stored = await table(`acct_qbo_docs?env=eq.${ENV}&customer_id=not.is.null&select=kind,qbo_id,balance,txn_date,qbo_updated_at,pdf_path,pdf_at&limit=20000`)
  const stale = (stored || []).filter(d => !d.pdf_path || (d.qbo_updated_at && (!d.pdf_at || new Date(d.pdf_at) < new Date(d.qbo_updated_at))))
    .sort((a, b) => (Number(b.balance) > 0) - (Number(a.balance) > 0) || String(b.txn_date).localeCompare(String(a.txn_date)))
  // five at a time (QuickBooks allows 10 at once per company); stops when time is up or the login is refused
  let pdfs = 0, pdfError = null, next = 0, stop = false
  const worker = async () => {
    while (!stop && next < stale.length && Date.now() < until) {
      const d = stale[next++]
      try { await ensurePdf(c, d); pdfs++ } catch (e) { pdfError = String(e.message || e).slice(0, 200); if (e.status === 401) stop = true }
    }
  }
  await Promise.all(Array.from({ length: Math.min(5, stale.length) }, worker))
  return { docs: rows.length, pdfs, pdfs_left: stale.length - pdfs, ...(pdfError ? { pdf_error: pdfError } : {}), ...pruned }
}

// ---------- deleted (or voided) in QuickBooks: the app follows (QuickBooks is the source of truth) ----------
//  * the copy of an invoice or credit memo deleted in QuickBooks is removed, PDF too: gone from statements and the portal.
//  * an app invoice that is only a copy of a QuickBooks invoice (history imports 154 / 158) is voided when QuickBooks deletes or
//    voids it, and its QuickBooks-only order (source 'qbo') is cancelled.
//  * an invoice made in the app is never voided here (it may just need linking to the right QuickBooks invoice, like a duplicate
//    deleted there): it shows in Accounting > Review as "Not found in QuickBooks" for a person to relink or void.
//  * if QuickBooks seems to be missing most of the copies (e.g. a different company connected), nothing is removed.
const COPY_BY = 'QuickBooks history import'
export async function pruneDocs(c, { until = Date.now() + 20000 } = {}) {
  const stored = (await table(`acct_qbo_docs?env=eq.${ENV}&select=kind,qbo_id,doc_number,total,invoice_id,pdf_path&limit=20000`)) || []
  const gone = [], zeroed = []
  let checked = 0
  for (const kind of ['Invoice', 'CreditMemo']) {
    const xs = stored.filter(d => d.kind === kind)
    for (let i = 0; i < xs.length && Date.now() < until; i += 50) {
      const chunk = xs.slice(i, i + 50)
      const r = await query(c, `select Id, TotalAmt from ${kind} where Id in (${chunk.map(d => `'${esc(d.qbo_id)}'`).join(',')}) maxresults 100`)
      const got = new Map((r[kind] || []).map(x => [String(x.Id), x]))
      for (const d of chunk) {
        const q = got.get(String(d.qbo_id))
        if (!q) gone.push(d)
        else if (kind === 'Invoice' && d.invoice_id && Number(q.TotalAmt) === 0) zeroed.push(d)   // voided in QuickBooks
      }
      checked += chunk.length
    }
  }
  if (!gone.length && !zeroed.length) return { docs_removed: 0 }
  if (gone.length > 10 && gone.length > checked / 2)
    return { docs_removed: 0, remove_error: `QuickBooks is missing ${gone.length} of ${checked} invoice copies. Is the right QuickBooks company connected? Nothing was removed.` }

  // app invoices linked to them
  const goneIds = new Set(gone.map(d => d.invoice_id).filter(Boolean))
  const invIds = [...new Set([...goneIds, ...zeroed.map(d => d.invoice_id)])]
  const invs = invIds.length ? (await table(`invoices?id=in.(${invIds.join(',')})&select=id,inv_number,total,status,created_by,order_id,notes`)) || [] : []
  const docOf = new Map([...gone, ...zeroed].filter(d => d.invoice_id).map(d => [d.invoice_id, d]))
  let voided = 0, flagged = 0
  const orderIds = new Set()
  for (const i of invs) {
    const d = docOf.get(i.id), deleted = goneIds.has(i.id), num = d.doc_number || d.qbo_id
    const copy = String(i.created_by || '').startsWith(COPY_BY)
    if (copy && i.status !== 'void' && (deleted || Number(i.total) !== 0)) {
      const why = `${deleted ? 'Deleted' : 'Voided'} in QuickBooks (#${num}), so voided here ${new Date().toISOString().slice(0, 10)}`
      await table(`invoices?id=eq.${i.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'void', paid_at: null, notes: [i.notes, why].filter(Boolean).join('\n'), updated_at: new Date().toISOString() }) })
      await table('events', { method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify([{ user_email: 'quickbooks', type: 'invoice_void', note: why, details: { invoice_id: i.id, inv: i.inv_number, total: i.total, qbo_id: d.qbo_id } }]) })
      voided++
      if (i.order_id) orderIds.add(i.order_id)
    } else if (!copy && deleted && i.status !== 'void') {
      await table(`acct_pushes?invoice_id=eq.${i.id}&env=eq.${ENV}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ error: 'Not found in QuickBooks (deleted or voided there?)', balance: null }) })
      flagged++
    }
  }
  // orders that only existed because of the QuickBooks invoice: cancelled once none of their invoices is left
  let cancelled = 0
  if (orderIds.size) {
    const ords = (await table(`orders?id=in.(${[...orderIds].join(',')})&source=eq.qbo&status=neq.cancelled&select=id,notes`)) || []
    for (const o of ords) {
      const left = await table(`invoices?order_id=eq.${o.id}&status=neq.void&select=id&limit=1`)
      if (left && left.length) continue
      await table(`orders?id=eq.${o.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'cancelled', notes: [o.notes, 'Cancelled: its QuickBooks invoice was deleted or voided there'].filter(Boolean).join('\n') }) })
      cancelled++
    }
  }
  // the copies and their PDFs
  for (const kind of ['Invoice', 'CreditMemo']) {
    const ids = gone.filter(d => d.kind === kind).map(d => d.qbo_id)
    for (let i = 0; i < ids.length; i += 100)
      await table(`acct_qbo_docs?env=eq.${ENV}&kind=eq.${kind}&qbo_id=in.(${ids.slice(i, i + 100).map(encodeURIComponent).join(',')})`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  }
  const paths = gone.map(d => d.pdf_path).filter(Boolean)
  if (paths.length) await fetch(`${SB}/storage/v1/object/${BUCKET}`, { method: 'DELETE', headers: serviceHeaders(), body: JSON.stringify({ prefixes: paths }) }).catch(() => {})
  return { docs_removed: gone.length, removed: gone.map(d => d.doc_number || d.qbo_id).slice(0, 20), invoices_voided: voided, orders_cancelled: cancelled, invoices_flagged: flagged }
}

export async function syncCustomers(c, { until = Date.now() + 30000 } = {}) {
  let match = { matched: 0, unmatched: [] }
  try { match = await matchCustomers(c) } catch (e) { match.error = String(e.message || e).slice(0, 200) }
  const refs = await table(`qbo_refs?env=eq.${ENV}&kind=eq.customer&select=key,qbo_id&limit=5000`)
  if (!refs || !refs.length) return { customers: 0, matched: match.matched }
  const ours = new Map(refs.map(r => [String(r.qbo_id), Number(r.key)]))
  const ids = [...ours.keys()]
  const bal = new Map(), items = new Map(ids.map(id => [id, []]))
  for (let i = 0; i < ids.length; i += 50) {
    const r = await query(c, `select Id, Balance from Customer where Id in (${ids.slice(i, i + 50).map(x => `'${esc(x)}'`).join(',')}) maxresults 100`)
    for (const x of r.Customer || []) bal.set(String(x.Id), Number(x.Balance))
  }
  const add = (ref, item) => { const k = String(ref && ref.value); if (items.has(k)) items.get(k).push(item) }
  const open = await queryAll(c, `select * from Invoice where Balance > '0'`, 'Invoice')
  for (const x of open)
    add(x.CustomerRef, { type: 'Invoice', kind: 'Invoice', qbo_id: String(x.Id), doc: x.DocNumber || null, date: x.TxnDate, due: x.DueDate || null, total: Number(x.TotalAmt), balance: Number(x.Balance) })
  const since = new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 10)
  const credits = (await queryAll(c, `select * from CreditMemo where TxnDate >= '${since}'`, 'CreditMemo')).filter(x => Number(x.RemainingCredit) > 0)
  for (const x of credits)
    add(x.CustomerRef, { type: 'Credit', kind: 'CreditMemo', qbo_id: String(x.Id), doc: x.DocNumber || null, date: x.TxnDate, due: null, total: -Number(x.TotalAmt), balance: -Number(x.RemainingCredit) })
  for (const x of await queryAll(c, `select Id, PaymentRefNum, TxnDate, TotalAmt, UnappliedAmt, CustomerRef from Payment where TxnDate >= '${since}'`, 'Payment'))
    if (Number(x.UnappliedAmt) > 0) add(x.CustomerRef, { type: 'Payment', doc: x.PaymentRefNum || null, date: x.TxnDate, due: null, total: -Number(x.TotalAmt), balance: -Number(x.UnappliedAmt) })
  const rows = ids.map(id => ({ customer_id: ours.get(id), qbo_customer_id: id, balance: bal.has(id) ? bal.get(id) : null,
    open_items: items.get(id).sort((a, b) => String(a.date).localeCompare(String(b.date))) }))
  const n = await rpc('acct_record_balances', { p_env: ENV, p_rows: rows })
  // invoice copies; never let it stop the balances (needs 149)
  let docs
  try { docs = await syncDocs(c, { ours, open, credits, until }) } catch (e) { docs = { docs_error: String(e.message || e).slice(0, 300) } }
  return { customers: n, matched: match.matched, unmatched: match.unmatched.length, ...(match.error ? { match_error: match.error } : {}), ...docs }
}

// ---------- link an app invoice to one already in QuickBooks (149) ----------
// Nothing changes in QuickBooks. Without confirm it only looks: what QuickBooks has, and what doesn't match.
export async function linkInvoice(c, invoiceId, docNumber, { confirm = false, admin = false, by = null } = {}) {
  const p = await rpc('acct_invoice_payload', { p_inv: invoiceId })
  if (p.status === 'void') throw new Error('This invoice is void.')
  const relink = p.push && p.push.status === 'sent'
  if (relink && !admin) throw new Error(`This invoice is already in QuickBooks as #${p.push.doc_number}. Only an Accounting Admin can change which QuickBooks invoice it's linked to.`)
  const num = String(docNumber || '').trim()
  if (!num) throw new Error('Which QuickBooks invoice number?')
  const found = (await query(c, `select * from Invoice where DocNumber = '${esc(num)}'`)).Invoice || []
  if (!found.length) throw new Error(`QuickBooks${ENV === 'sandbox' ? ' (sandbox)' : ''} has no invoice numbered ${num}.`)
  if (found.length > 1) throw new Error(`QuickBooks has ${found.length} invoices numbered ${num}. Give one of them a different number in QuickBooks first.`)
  const q = found[0]
  const taken = await table(`acct_pushes?env=eq.${ENV}&status=eq.sent&qbo_id=eq.${encodeURIComponent(q.Id)}&invoice_id=neq.${invoiceId}&select=invoice_id`)
  if (taken && taken.length) {
    const other = await table(`invoices?id=eq.${taken[0].invoice_id}&select=inv_number`)
    throw new Error(`QuickBooks invoice ${num} is already linked to ${other?.[0]?.inv_number ?? 'another invoice'} in the app.`)
  }
  const warnings = []
  const qName = q.CustomerRef?.name ?? null, qCust = q.CustomerRef ? String(q.CustomerRef.value) : null
  const ref = await getRef('customer', p.customer.id)
  if (ref && qCust && ref !== qCust) warnings.push(`In QuickBooks it's for ${qName}, but in the app this invoice is for ${p.customer.name}.`)
  if (!ref && qName && ![p.customer.qbo_name, p.customer.legal_name, p.customer.name].some(n => n && nameKey(n) === nameKey(qName)))
    warnings.push(`The customer names differ: QuickBooks has "${qName}", the app has "${p.customer.name}". Linking also matches them for future invoices.`)
  if (r2(q.TotalAmt) !== r2(p.total)) warnings.push(`The totals differ: QuickBooks $${r2(q.TotalAmt).toFixed(2)}, app $${r2(p.total).toFixed(2)}. QuickBooks' amount is what the statement and balances use.`)
  if (relink && String(p.push.qbo_id) !== String(q.Id)) warnings.push(`It's linked to QuickBooks #${p.push.doc_number} now. That invoice stays in QuickBooks: delete or void it there if it's a duplicate.`)
  const info = { qbo_id: String(q.Id), doc_number: q.DocNumber, date: q.TxnDate, customer: qName, total: Number(q.TotalAmt), balance: Number(q.Balance) }
  if (!confirm) return { needs_confirm: true, warnings, qbo: info }
  if (!ref && qCust) await setRef('customer', p.customer.id, qCust, qName)
  await rpc('acct_record_push', { p_inv: invoiceId, p_env: ENV, p_qbo_id: String(q.Id), p_doc: q.DocNumber, p_total: Number(q.TotalAmt),
    p_balance: Number(q.Balance), p_error: null, p_by: `${by || 'someone'} (linked to QuickBooks #${q.DocNumber})`, p_line_map: null })
  // the app didn't write these lines: no price pull-back from the old link
  await table(`acct_pushes?invoice_id=eq.${invoiceId}&env=eq.${ENV}`, { method: 'PATCH', body: JSON.stringify({ line_map: null, pulled_at: null }), headers: { Prefer: 'return=minimal' } })
  await table('acct_qbo_docs?env=eq.' + ENV + '&kind=eq.Invoice&qbo_id=eq.' + encodeURIComponent(q.Id), { method: 'PATCH', body: JSON.stringify({ invoice_id: invoiceId }), headers: { Prefer: 'return=minimal' } }).catch(() => {})
  return { linked: true, warnings, qbo: info }
}

export function send(res, status, body) { res.status(status).setHeader('Cache-Control', 'no-store'); return res.json(body) }

/** auto-send: invoices whose 30 minutes are up (one QuickBooks at a time, never twice) */
export async function autoPush(c, budgetMs = 50000) {
  const t0 = Date.now()
  const on = (await table('app_settings?key=eq.acct.auto_push&select=value'))?.[0]?.value ?? 'true'
  if (on !== 'true') return { auto_push: 'off', sent: 0 }
  const due = await rpc('acct_autopush_due', { p_env: ENV })
  let sent = 0, failed = 0, busy = 0
  for (const id of due ?? []) {
    if (Date.now() - t0 > budgetMs) break
    try { await pushInvoice(c, Number(id), 'auto (30 min after it was made)'); sent++ }
    catch (e) {
      if (e instanceof Busy) { busy++; continue }
      failed++
      const msg = String(e.message || e) + (e.tid ? ` (QuickBooks ref ${e.tid})` : '')
      await rpc('acct_record_push', { p_inv: Number(id), p_env: ENV, p_qbo_id: null, p_doc: null, p_total: null, p_balance: null, p_error: msg, p_by: 'auto' }).catch(() => {})
      if (e.status === 401) break   // QuickBooks refused the login: stop here, don't try the rest with it
    }
  }
  // credit memos from returns (159), same 30 minutes and the same on / off switch
  let cmSent = 0, cmFailed = 0
  const cmDue = await rpc('cm_autopush_due', {}).catch(() => [])
  for (const id of cmDue ?? []) {
    if (Date.now() - t0 > budgetMs) break
    try { await pushCreditMemo(c, Number(id), 'auto (30 min after it was made)'); cmSent++ }
    catch (e) {
      if (e instanceof Busy) continue
      cmFailed++
      await rpc('cm_record_push', { p_id: Number(id), p_env: ENV, p_qbo_id: null, p_doc: null, p_total: null, p_error: String(e.message || e) + (e.tid ? ` (QuickBooks ref ${e.tid})` : ''), p_by: 'auto' }).catch(() => {})
      if (e.status === 401) break
    }
  }
  return { due: (due ?? []).length, sent, failed, busy, credit_memos: { due: (cmDue ?? []).length, sent: cmSent, failed: cmFailed } }
}
