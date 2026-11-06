// Business Central actions for Accounting > Settings > Business Central (213):
// { action: 'status' | 'test' | 'lists' | 'send' (invoice_id, resend?) | 'send_due' | 'check' }
// Settings and matches are saved straight from the app (bc_save); this is everything that talks to Business Central.
import { caller, send, table } from '../qbo/_lib.js'
import { BC_ENV, Busy, bcMissing, checkCopies, company, context, recordError, sendDue, sendInvoice } from './_lib.js'

export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })
  const body = req.body || {}
  const action = String(body.action || '')
  const me = await caller(req)
  if (!me) return send(res, 403, { error: 'The Accounting module isn\'t switched on for your account' })
  const miss = bcMissing()
  if (miss.length) return send(res, action === 'status' ? 200 : 400, { env: BC_ENV || null, configured: false, missing: miss,
    error: `Business Central isn't set up in Vercel yet. Missing: ${miss.join(', ')}` })
  const edit = me.can_edit && !me.viewing_as
  const admin = me.admin && !me.viewing_as
  try {
    if (action === 'status') {
      try { const c = await company(); return send(res, 200, { env: BC_ENV, configured: true, connected: true, company: c.name }) }
      catch (e) { return send(res, 200, { env: BC_ENV, configured: true, connected: false, error: String(e.message || e) }) }
    }
    if (action === 'test') {
      const c = await company()
      const x = await context()
      return send(res, 200, { env: BC_ENV, company: c.name, customers: x.L.customers.length, items: x.L.items.length, accounts: x.L.accounts.length,
        terms: x.L.terms.length, dims: x.L.dims.map(d => ({ code: d.code, name: d.displayName, values: d.values.length })) })
    }
    if (action === 'lists') {
      // what's in Business Central for the matching screen, and how each app product / class / terms / customer matches now
      const x = await context()
      const [products, classes] = await Promise.all([table('acct_products?select=code,name,active&order=sort'), table('acct_classes?select=name,active&order=sort')])
      const matches = { product: {}, class: {}, terms: {}, customer: {} }
      for (const p of products) matches.product[p.code] = x.m.product(p.code, p.name)
      for (const cl of classes) matches.class[cl.name] = x.m.classDims(cl.name)
      for (const t of x.config.terms || []) matches.terms[t.code] = x.m.terms(t.code, t.label)
      for (const cu of x.config.customers || []) { const m = x.m.customer(cu); matches.customer[cu.id] = m && { number: m.number, name: m.displayName, how: m.how } }
      return send(res, 200, {
        env: BC_ENV, company: (await company()).name,
        items: x.L.items.filter(i => !i.blocked).map(i => ({ number: i.number, name: i.displayName, type: i.type })),
        accounts: x.L.accounts.filter(a => !a.blocked).map(a => ({ number: a.number, name: a.displayName, category: a.category })),
        dims: x.L.dims.map(d => ({ code: d.code, name: d.displayName, values: d.values.map(v => ({ code: v.code, name: v.displayName })) })),
        terms: x.L.terms.map(t => ({ code: t.code, name: t.displayName })),
        customers: x.L.customers.map(c => ({ number: c.number, name: c.displayName, blocked: c.blocked || null })),
        matches,
      })
    }
    if (action === 'send') {
      if (!edit) return send(res, 403, { error: 'You can only view Accounting' })
      const id = Number(body.invoice_id)
      if (!id) return send(res, 400, { error: 'Which invoice?' })
      try { return send(res, 200, { env: BC_ENV, ...(await sendInvoice(id, me.email, { resend: body.resend === true })) }) }
      catch (e) {
        if (e instanceof Busy) return send(res, 409, { error: e.message })
        await recordError(id, e, me.email)
        return send(res, 400, { error: String(e.message || e) })
      }
    }
    if (action === 'send_due') {
      // Send waiting now: same as the 10-minute check, even when automatic copying is off
      if (!admin) return send(res, 403, { error: 'Only an Accounting Admin' })
      return send(res, 200, { env: BC_ENV, ...(await sendDue(me.email)) })
    }
    if (action === 'check') {
      return send(res, 200, { env: BC_ENV, ...(await checkCopies()) })
    }
    return send(res, 400, { error: 'Unknown action' })
  } catch (e) {
    return send(res, 400, { error: String(e.message || e) })
  }
}
