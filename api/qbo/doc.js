// A customer's copy of a QuickBooks invoice or credit memo (149): { kind: 'Invoice' | 'CreditMemo', qbo_id } → { url }
// Staff in Sales or Accounting can open any customer's; a customer only their own (checked as them, acct_doc_access).
// The PDF is QuickBooks' own. It's kept in the private qbo-docs bucket and fetched from QuickBooks when missing or changed there.
import { ENV, connection, ensurePdf, missingSetup, send, signedUrl, table, userRpc } from './_lib.js'

export const config = { maxDuration: 30 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })
  if (missingSetup().length) return send(res, 503, { error: 'QuickBooks isn\'t set up yet' })
  const body = req.body || {}
  const kind = body.kind === 'CreditMemo' ? 'CreditMemo' : body.kind === 'Invoice' ? 'Invoice' : null
  const id = String(body.qbo_id ?? '').trim()
  if (!kind || !/^\d{1,20}$/.test(id)) return send(res, 400, { error: 'Which document?' })
  let d
  try { d = (await table(`acct_qbo_docs?env=eq.${ENV}&kind=eq.${kind}&qbo_id=eq.${id}&select=*`))?.[0] }
  catch { return send(res, 503, { error: 'Invoice copies aren\'t set up yet (149_qbo_invoice_copies.sql)' }) }
  if (!d) return send(res, 404, { error: 'That copy isn\'t here yet. It comes in on the next hourly check.' })
  let ok = false
  try { ok = (await userRpc(req, 'acct_doc_access', { p_customer: d.customer_id })) === true } catch { ok = false }
  if (!ok) return send(res, 403, { error: 'Not yours to open' })
  try {
    let path = d.pdf_path
    try { path = await ensurePdf(await connection(), d) }
    catch (e) { if (!path) throw e }   // QuickBooks not reachable: the stored copy will do
    return send(res, 200, { url: await signedUrl(path, 300), doc_number: d.doc_number })
  } catch (e) {
    return send(res, 502, { error: `Couldn't get the copy from QuickBooks: ${String(e.message || e).slice(0, 200)}${e.tid ? ` (QuickBooks ref ${e.tid})` : ''}` })
  }
}
