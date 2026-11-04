// METRC pull problems (168): when a license's nightly pull fails twice (or errors), email whoever turned on
// "METRC pull problems" in My settings. One email per license per day. Sent through Microsoft 365 (the "Freezer Map" Entra
// app, Graph sendMail, needs the Mail.Send application permission) from the mailbox in Admin > Settings "app.email_from"
// (else MS_MAIL_FROM). If Microsoft refuses, nothing is sent and Compliance > METRC > Reconcile still shows the license red.
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
  const from = (await db(`app_settings?key=eq.app.email_from&select=value`))?.[0]?.value || process.env.MS_MAIL_FROM
  if (!from || !process.env.MS_TENANT_ID || !process.env.MS_CLIENT_ID || !process.env.MS_CLIENT_SECRET) return { sent: false, reason: 'Microsoft 365 email not set up' }
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
  const tk = await fetch(`https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.MS_CLIENT_ID, client_secret: process.env.MS_CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
  }).then(r => r.json())
  if (!tk.access_token) return { sent: false, reason: `Microsoft sign-in: ${tk.error_description ?? tk.error ?? 'no token'}` }
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`, {
    method: 'POST', headers: { Authorization: `Bearer ${tk.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { subject, body: { contentType: 'HTML', content: html }, toRecipients: to.map(address => ({ emailAddress: { address } })) }, saveToSentItems: false }),
  })
  if (!res.ok) console.error('alert email', res.status, (await res.text()).slice(0, 300))
  return { sent: res.ok }
}
