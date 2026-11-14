// Emails staff when a customer asks to change a reserve (to Admins) or places or changes an order (to Sales and Admins),
// and emails the customer's portal logins when an Admin approves or declines their reserve requests (kind 'decision', 150).
// Needs RESEND_API_KEY in Vercel (Settings > Environment Variables). Without it, nothing is sent.
// Optional: NOTIFY_FROM (default "Lifted Orders <orders@lifted-orders.app>"), STAFF_APP_URL.
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const lbs = n => Number(n ?? 0).toLocaleString('en-US')
const wrap = body => `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">${body}</div>`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const key = process.env.RESEND_API_KEY
  if (!key) return res.status(200).json({ sent: false, reason: 'email not set up' })
  const url = process.env.VITE_SUPABASE_URL, anon = process.env.VITE_SUPABASE_ANON_KEY
  const auth = req.headers.authorization || ''
  const body = req.body || {}
  if (body.kind === 'decision') return decision(req, res, { key, url, anon, auth, body })
  const id = Number(body.id), kind = body.kind === 'order' ? 'order' : 'reserve'
  if (!url || !anon || !auth.startsWith('Bearer ') || !id) return res.status(400).json({ error: 'bad request' })

  // the database only answers for the person who made the request or order, once
  const r = await fetch(`${url}/rest/v1/rpc/${kind === 'order' ? 'order_notification' : 'request_notification'}`, {
    method: 'POST', headers: { apikey: anon, Authorization: auth, 'X-Tab-Id': String(req.headers['x-tab-id'] || ''), 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_id: id }),
  })
  if (!r.ok) return res.status(400).json({ error: 'not allowed' })
  const q = await r.json()
  const to = kind === 'order' ? q && q.to : q && q.admins
  if (!q || !to || !to.length) return res.status(200).json({ sent: false })

  const app = process.env.STAFF_APP_URL || 'https://freezer-map-8i3h.vercel.app'
  const who = q.by_name ? `${q.by_name} (${q.by})` : q.by
  let subject, html
  if (kind === 'order') {
    const total = (q.lines || []).reduce((a, l) => a + Number(l.lbs), 0)
    const rows = (q.lines || []).map(l => `<tr><td style="padding:2px 12px 2px 0">${esc(l.strain)}</td><td style="text-align:right">${lbs(l.lbs)} lbs</td><td style="text-align:right;padding-left:12px">${l.price != null ? '$' + Number(l.price).toFixed(2) + '/lb' : ''}</td></tr>`).join('')
    const changed = !!body.modified
    subject = `${changed ? 'Changed order' : 'New order'}: ${q.customer} · ${lbs(total)} lbs`
    html = wrap(`<p><b>${esc(q.customer)}</b> ${changed ? 'changed an order. It now has' : 'placed an order for'} ${lbs(total)} lbs${changed ? ' and is back to Submitted for you to confirm again' : ''}.</p>
      <table style="border-collapse:collapse">${rows}</table>
      <p>Placed by ${esc(who)}${q.po ? `<br>PO: ${esc(q.po)}` : ''}${q.wanted ? `<br>Requested Delivery Date: ${esc(q.wanted)}` : ''}${q.note ? `<br>Note: "${esc(q.note)}"` : ''}</p>
      <p><a href="${esc(app)}/?go=orders">Review and confirm in Lifted Inventory Management</a> (Sales &gt; Orders).</p>`)
  } else {
    const up = Number(q.to) > Number(q.from)
    const what = Number(q.from) === 0 ? `add ${lbs(q.to)} lbs of ${q.strain}` : Number(q.to) === 0 ? `drop their ${lbs(q.from)} lbs of ${q.strain}`
      : `${up ? 'raise' : 'lower'} ${q.strain} from ${lbs(q.from)} to ${lbs(q.to)} lbs`
    const yr = q.crop_year ? ` (${q.crop_year} crop)` : ''
    if (q.lines && q.lines.length > 1) {
      const rows = q.lines.map(l => `<tr><td style="padding:2px 12px 2px 0">${esc(l.strain)}</td><td style="text-align:right">${lbs(l.from)} → <b>${lbs(l.to)}</b> lbs</td></tr>`).join('')
      subject = `Reserve requests${yr}: ${q.customer} · ${q.lines.length} strains`
      html = wrap(`<p><b>${esc(q.customer)}</b> sent ${q.lines.length} reserve changes${esc(yr)}.</p><table>${rows}</table>
        <p>Requested by ${esc(who)}${q.note ? `<br>Note: "${esc(q.note)}"` : ''}</p>
        <p><a href="${esc(app)}/?go=requests">Approve, change or decline in Lifted Inventory Management</a> (Sales &gt; Requests). Only a Sales Admin can approve.</p>`)
    } else {
    subject = `Reserve request${yr}: ${q.customer} · ${q.strain} ${lbs(q.from)} → ${lbs(q.to)} lbs`
    html = wrap(`<p><b>${esc(q.customer)}</b> wants to ${esc(what)}${esc(yr)}.</p>
      <p>Requested by ${esc(who)}${q.note ? `<br>Note: "${esc(q.note)}"` : ''}</p>
      <p><a href="${esc(app)}/?go=requests">Approve or decline in Lifted Inventory Management</a> (Sales &gt; Requests). Only a Sales Admin can approve.</p>`)
    }
  }
  const send = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.NOTIFY_FROM || 'Lifted Orders <orders@lifted-orders.app>', to, subject, html }),
  })
  return res.status(200).json({ sent: send.ok })
}

// an Admin decided reserve requests: tell each customer once (request_decision_notification marks them emailed)
async function decision(req, res, { key, url, anon, auth, body }) {
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean) : []
  if (!url || !anon || !auth.startsWith('Bearer ') || !ids.length) return res.status(400).json({ error: 'bad request' })
  const r = await fetch(`${url}/rest/v1/rpc/request_decision_notification`, {
    method: 'POST', headers: { apikey: anon, Authorization: auth, 'X-Tab-Id': String(req.headers['x-tab-id'] || ''), 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_ids: ids }),
  })
  if (!r.ok) return res.status(400).json({ error: 'not allowed' })
  const groups = (await r.json()) || []
  const portal = process.env.PORTAL_URL || 'https://www.lifted-orders.app'
  let sent = 0
  for (const g of groups) {
    if (!g.to || !g.to.length) continue
    const yr = l => (l.crop_year ? ` (${l.crop_year} crop)` : '')
    const line = l => {
      if (l.status === 'declined') return `<li><b>${esc(l.strain)}</b>${esc(yr(l))}: not approved. Your reserve stays at ${lbs(l.from)} lbs.${l.note ? ` <i>${esc(l.note)}</i>` : ''}</li>`
      const got = l.approved != null ? Number(l.approved) : Number(l.asked)
      const part = got !== Number(l.asked) ? ` (you asked for ${lbs(l.asked)})` : ''
      return `<li><b>${esc(l.strain)}</b>${esc(yr(l))}: approved. Your reserve is now <b>${lbs(got)} lbs</b>${part}.${l.note ? ` <i>${esc(l.note)}</i>` : ''}</li>`
    }
    const ok = g.lines.filter(l => l.status === 'approved').length, no = g.lines.length - ok
    const subject = no === 0 ? 'Lifted approved your reserve request' : ok === 0 ? 'Update on your reserve request' : 'Lifted reviewed your reserve request'
    const html = wrap(`<p>Hi ${esc(g.customer)},</p><p>Lifted reviewed your reserve request:</p><ul>${g.lines.map(line).join('')}</ul>
      <p><a href="${esc(portal)}">See your Contract Reserves</a></p><p>Lifted Farms</p>`)
    const send = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.NOTIFY_FROM || 'Lifted Orders <orders@lifted-orders.app>', to: g.to, subject, html }),
    })
    if (send.ok) sent++
  }
  return res.status(200).json({ sent })
}
