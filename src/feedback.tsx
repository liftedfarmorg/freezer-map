import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

// 233: Sales > Customer feedback. Notes customers send from the portal's "Help & feedback" button.
// Not a ticket queue: nothing to open, assign or close. Newest first; "New" marks what came in since you last looked here.

interface FB { id: number; created_at: string; customer_id: number | null; customer: string | null; user_email: string | null; user_name: string | null
  kind: 'problem' | 'question' | 'idea'; message: string; screen: string | null; device: string | null }

const KIND: Record<FB['kind'], [string, string]> = { problem: ["Something's not working", 'm-warn'], question: ['Question', 'm-mute'], idea: ['Idea', 'm-ok'] }
// portal screen keys -> what the customer sees
const SCREEN: Record<string, string> = { home: 'Home', resmenu: 'Reserves & Menu', reserves: 'Contract Reserves', edit: 'Edit reserves', menu: 'Open Menu', order: 'New order',
  review: 'Review order', ordered: 'Order sent', orders: 'Orders & Statement', contract: 'My Contract', holds: 'Sample Holds', activity: 'Reserve History', yields: 'Yields', yield: 'Report yields',
  reqReview: 'Review reserve request', sent: 'Reserve request sent', ysent: 'Yields sent' }
const SEEN_KEY = 'fb-seen-at'
const when = (s: string) => new Date(s).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

export function FeedbackView({ sb, flash }: { sb: SupabaseClient | null; flash: (t: string, bad?: boolean) => void }) {
  const [rows, setRows] = useState<FB[] | null>(null)
  const [kind, setKind] = useState<'all' | FB['kind']>('all')
  const [q, setQ] = useState('')
  // what counted as "new" when the page opened (then we mark everything as seen)
  const [seenAt] = useState(() => { try { return localStorage.getItem(SEEN_KEY) ?? '' } catch { return '' } })
  async function load() {
    if (!sb) { setRows([]); return }
    const { data, error } = await sb.rpc('list_portal_feedback', { p_limit: 1000 })
    if (error) { flash(/list_portal_feedback/.test(error.message) ? 'Customer feedback needs SQL 233 run first.' : error.message, true); setRows([]); return }
    setRows((data ?? []) as FB[])
    try { localStorage.setItem(SEEN_KEY, new Date().toISOString()) } catch { /* private mode */ }
  }
  useEffect(() => { load() }, [])
  const ql = q.trim().toLowerCase()
  const list = useMemo(() => (rows ?? []).filter(r => (kind === 'all' || r.kind === kind)
    && (!ql || [r.customer, r.user_name, r.user_email, r.message].some(x => (x ?? '').toLowerCase().includes(ql)))), [rows, kind, ql])
  const nNew = (rows ?? []).filter(r => r.created_at > seenAt).length
  return <div className="list">
    <div className="row between wrap toolbar"><h2>Customer feedback</h2>
      <div className="row">
        <select value={kind} onChange={e => setKind(e.target.value as typeof kind)} aria-label="Show">
          <option value="all">Everything</option><option value="problem">Something's not working</option><option value="question">Questions</option><option value="idea">Ideas</option></select>
        <input type="search" placeholder="Search customer or text" value={q} onChange={e => setQ(e.target.value)} style={{ minWidth: 200 }} />
        <button className="ghost small" onClick={load}>Refresh</button>
      </div></div>
    <p className="muted">Notes customers send from the portal's Help &amp; feedback button, newest first. Nothing to close out; reach out to the customer if it needs an answer.{nNew > 0 && seenAt ? ` ${nNew} new since you last looked.` : ''}</p>
    {rows === null && <p className="muted">Loading…</p>}
    {rows && !list.length && <p className="muted">{rows.length ? 'Nothing matches.' : 'No feedback yet.'}</p>}
    {list.map(r => { const [kl, kc] = KIND[r.kind] ?? [r.kind, '']
      return <div key={r.id} className="card">
        <div className="row between wrap">
          <div><b>{r.customer ?? 'Unknown customer'}</b> <span className={`pill ${kc}`}>{kl}</span>{seenAt && r.created_at > seenAt && <> <span className="pill m-bad">New</span></>}
            <div className="muted small">{r.user_name ?? r.user_email ?? ''}{r.user_name && r.user_email ? ` · ${r.user_email}` : ''}</div></div>
          <div className="muted small" style={{ textAlign: 'right' }}>{when(r.created_at)}
            {(r.screen || r.device) && <div>{r.screen ? `from ${SCREEN[r.screen] ?? r.screen}` : ''}{r.screen && r.device ? ' · ' : ''}{r.device ? r.device.split(' · ')[0] : ''}</div>}</div>
        </div>
        <div style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{r.message}</div>
        {r.user_email && <div className="small" style={{ marginTop: 8 }}><a href={`mailto:${r.user_email}?subject=${encodeURIComponent('Re: your note in the Lifted portal')}`}>Reply by email</a></div>}
      </div> })}
  </div>
}
