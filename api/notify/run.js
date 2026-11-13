// Sends what's queued (216): push notifications now; emails once CCI grants Mail.Send (Admin setting notify.email_on);
// texts once a texting service is connected (Twilio env vars + setting notify.sms_on).
// Runs every minute (vercel.json cron, GET with CRON_SECRET) and right after something happens in the app (POST, no body).
// Env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY; email: MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET (same Entra app as the backup);
// texts: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (a registered number or messaging service SID starting MG).
import webpush from 'web-push'

const SB = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const send = (res, code, body) => res.status(code).json(body)

async function rpc(fn, args) {
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) })
  const t = await r.text()
  if (!r.ok) throw new Error(`${fn}: ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}

async function graphToken() {
  const r = await fetch(`https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.MS_CLIENT_ID, client_secret: process.env.MS_CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error_description || j.error || `Microsoft sign-in ${r.status}`)
  return j.access_token
}

let running = false
export default async function handler(req, res) {
  if (req.method === 'GET') {
    const secret = process.env.CRON_SECRET
    if (secret && req.headers.authorization !== `Bearer ${secret}`) return send(res, 401, { error: 'no' })
  } else if (req.method !== 'POST') return send(res, 405, { error: 'GET or POST' })
  if (!SB || !SERVICE) return send(res, 200, { skipped: 'Supabase service key not set in Vercel' })
  if (running) return send(res, 200, { skipped: 'already sending' })
  running = true
  const done = { push: [], subs_gone: [], subs_ok: [], email: [], sms: [] }
  try {
    // 224: staged GVR pallets not shipping within 2 days: one 'Move back to GVR' alert each (queues its push)
    await rpc('gvr_stage_sweep').catch(() => {})
    // 230: carrier stops nobody recorded by the end of the day (6pm Pacific): one push per stop per day
    await rpc('stop_unrecorded_sweep').catch(() => {})
    // 351: Feedback & Bugs reports In progress 3 days with nothing happening go back to Approved
    await rpc('feedback_stale_sweep').catch(() => {})
    const q = await rpc('notify_claim', { p_limit: 50 })
    // ---- push ----
    if (q.push?.length && q.vapid?.public) {
      webpush.setVapidDetails(q.vapid.subject || 'mailto:aziz@lifted-organics.com', q.vapid.public, q.vapid.private)
      for (const m of q.push) {
        const payload = JSON.stringify({ title: m.title, body: m.body || '', url: m.url || '/', tag: m.tag || undefined })
        let ok = false, err = m.subs.length ? null : 'no device'
        for (const s of m.subs) {
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 12 })
            ok = true; done.subs_ok.push(s.id)
          } catch (e) {
            if (e.statusCode === 404 || e.statusCode === 410) done.subs_gone.push(s.id)
            err = `${e.statusCode || ''} ${e.body || e.message}`.trim().slice(0, 300)
          }
        }
        done.push.push({ id: m.id, ok: ok || !m.subs.length, error: ok ? null : err })
      }
    }
    // ---- email (Microsoft 365) ----
    if (q.email?.length) {
      const from = q.email_from
      if (!from || !process.env.MS_CLIENT_SECRET) {
        for (const m of q.email) done.email.push({ id: m.id, ok: false, error: !from ? 'Set notify.email_from (the mailbox it sends from)' : 'Microsoft app not set up in Vercel' })
      } else {
        let tok = null
        try { tok = await graphToken() } catch (e) { for (const m of q.email) done.email.push({ id: m.id, ok: false, error: String(e.message).slice(0, 300) }) }
        if (tok) for (const m of q.email) {
          const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`, {
            method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: { subject: m.subject, body: { contentType: 'Text', content: m.body || '' }, toRecipients: [{ emailAddress: { address: m.to_email } }] }, saveToSentItems: false }),
          })
          done.email.push({ id: m.id, ok: r.ok, error: r.ok ? null : (await r.text()).slice(0, 300) })
        }
      }
    }
    // ---- texts (Twilio) ----
    if (q.sms?.length) {
      const sid = process.env.TWILIO_ACCOUNT_SID, auth = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_FROM
      for (const m of q.sms) {
        if (!sid || !auth || !from) { done.sms.push({ id: m.id, ok: false, error: 'Texting not connected (Twilio)' }); continue }
        const digits = String(m.to_phone).replace(/[^\d+]/g, '')
        const to = digits.startsWith('+') ? digits : `+1${digits.replace(/^1(?=\d{10}$)/, '')}`
        const form = new URLSearchParams({ To: to, Body: m.body })
        if (from.startsWith('MG')) form.set('MessagingServiceSid', from); else form.set('From', from)
        const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${sid}:${auth}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form,
        })
        done.sms.push({ id: m.id, ok: r.ok, error: r.ok ? null : (await r.text()).slice(0, 300) })
      }
    }
    if (done.push.length || done.email.length || done.sms.length || done.subs_gone.length) await rpc('notify_done', { p: done })
    return send(res, 200, { push: done.push.length, email: done.email.length, sms: done.sms.length })
  } catch (e) {
    return send(res, 200, { error: String(e?.message ?? e).slice(0, 300) })
  } finally { running = false }
}
