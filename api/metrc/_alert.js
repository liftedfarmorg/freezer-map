// METRC pull problems (168): when a license's nightly pull fails twice (or errors), email whoever turned on
// "METRC pull problems" in My settings. One email per license per day. Uses Resend like notify-request.js:
// without RESEND_API_KEY nothing is sent, and Compliance > METRC > Reconcile still shows the license in red.
import { db, rpc } from './_core.js'

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

export async function alertPullProblem(license, r, tries) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  const seen = (await db(`metrc_sync_state?license=eq.${encodeURIComponent(license)}&step=eq.alert&select=cursor`))?.[0]?.cursor
  if (seen === today) return { sent: false, reason: 'already emailed today' }
  const to = await rpc('metrc_alert_list', {})
  if (!Array.isArray(to) || !to.length) return { sent: false, reason: 'nobody turned it on' }
  await db('metrc_sync_state?on_conflict=license,step', { method: 'POST', body: JSON.stringify([{ license, step: 'alert', cursor: today, updated_at: new Date().toISOString() }]),
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } })
  const key = process.env.RESEND_API_KEY
  if (!key) return { sent: false, reason: 'email not set up (RESEND_API_KEY)' }
  const site = (await db(`licenses?license_no=eq.${encodeURIComponent(license)}&select=site`))?.[0]
  const app = process.env.STAFF_APP_URL || 'https://freezer-map-8i3h.vercel.app'
  const why = r.error ? `METRC / T3 answered with an error: ${r.error}` : (r.notes ?? []).filter(n => /ran out of time/.test(n)).join('; ') || 'it didn\'t finish'
  const subject = `METRC pull didn't finish: ${site?.site ?? ''} ${license}`.trim()
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">
    <p>Last night's METRC pull for <b>${esc(site?.site ?? '')} ${esc(license)}</b> didn't finish after ${tries} tries.</p>
    <p>${esc(why)}</p>
    <p>The app's copy of METRC for this license may be out of date until it does. Check Compliance &gt; METRC &gt; Reconcile, or tap Pull from METRC now.</p>
    <p><a href="${esc(app)}">Open the app</a></p>
    <p style="color:#69736c;font-size:13px">You get this because "METRC pull problems" is on in your My settings.</p></div>`
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.NOTIFY_FROM || 'Lifted Orders <orders@lifted-orders.app>', to, subject, html }),
  })
  return { sent: res.ok }
}
