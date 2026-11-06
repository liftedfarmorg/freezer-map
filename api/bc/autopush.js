// Every 10 minutes (vercel.json cron): copy invoices that are in QuickBooks to Business Central (213), when
// Accounting > Settings > Business Central > Copy automatically is on. QuickBooks sending is separate and never waits on this.
// If CRON_SECRET is set in Vercel, Vercel sends it and anything else is turned away.
import { rpc, send } from '../qbo/_lib.js'
import { BC_ENV, bcMissing, sendDue } from './_lib.js'

export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return send(res, 401, { error: 'no' })
  if (bcMissing().length) return send(res, 200, { skipped: 'not set up' })
  try {
    const cfg = await rpc('bc_config', {})
    if (cfg?.settings?.auto_push !== 'true') return send(res, 200, { env: BC_ENV, auto_push: 'off' })
    return send(res, 200, { env: BC_ENV, ...(await sendDue('auto (after QuickBooks)')) })
  } catch (e) {
    return send(res, 500, { error: String(e.message || e) })
  }
}
