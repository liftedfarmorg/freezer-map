import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { t } from './i18n'
import { useSaved } from './saved'
import { Tile, Tiles } from './dash'

// Msg FB-8: Feedback & Bugs, step 3.
//  * FbInbox: Admin > Feedback & Bugs. Every report this person can see (triagers: all; module Admins: their module's).
//  * FbCard: the big side card for one report, tabs across the top (Overview, Pictures, Comments, Details, History).
//    Triagers approve / ask / decline / mark duplicate / rewrite it for Claude / copy the Claude brief.
//  * MyReports: what I sent and where each one stands (account menu, the report sheet, and push links for non-admins).
// Push links end in ?fb=<id>; App.tsx opens the card from that.

export type FbStatus = 'new' | 'needs_info' | 'approved' | 'in_progress' | 'ready_to_test' | 'done' | 'declined' | 'duplicate'
export interface FbRow {
  id: number; ref: string; type: 'bug' | 'idea' | 'question'; status: FbStatus; severity: string | null; priority: string | null
  module: string | null; screen: string | null; section: string | null; record_type: string | null; record_id: string | null; record_label: string | null
  title: string | null; what_trying: string | null; details: string; edited_spec: string | null; decision_note: string | null; duplicate_of: number | null
  reporter_email: string | null; reporter_name: string | null; context: Record<string, unknown>; app_version: string | null; source: string
  created_at: string; updated_at: string; approved_at: string | null; ready_at: string | null; done_at: string | null; commit_ref: string | null; claude_notes: string | null
}
interface FbComment { id: number; author_email: string | null; author_name: string | null; body: string; internal: boolean; created_at: string }
interface FbEvent { id: number; actor_email: string | null; from_status: string | null; to_status: string | null; note: string | null; created_at: string }
interface FbFile { id: number; file_path: string; kind: string; url?: string }

export const FB_STATUS: Record<FbStatus, string> = { new: 'New', needs_info: 'Needs info', approved: 'Approved', in_progress: 'In progress',
  ready_to_test: 'Ready to test', done: 'Done', declined: 'Declined', duplicate: 'Duplicate' }
const OPEN: FbStatus[] = ['new', 'needs_info', 'approved', 'in_progress', 'ready_to_test']
const TYPE_L: Record<FbRow['type'], string> = { bug: 'Bug', idea: 'Idea', question: 'Question' }
const SEV_L: Record<string, string> = { blocking: 'Blocking', slowing: 'Slowing down', nice: 'Nice to have' }
const MOD_L: Record<string, string> = { distribution: 'Distribution', sales: 'Sales', cultivation: 'Cultivation', nursery: 'Nursery', processing: 'Processing',
  accounting: 'Accounting', compliance: 'Compliance', admin: 'Admin', driver: 'Driver' }
const PRI_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }

const when = (s: string) => new Date(s).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const day = (s: string) => new Date(s).toLocaleDateString([], { month: 'short', day: 'numeric' })
const age = (s: string) => { const d = Math.floor((Date.now() - new Date(s).getTime()) / 86400000); return d <= 0 ? t('today') : d === 1 ? t('1 day') : t('{n} days', { n: d }) }
export const fbTitle = (r: Pick<FbRow, 'title' | 'details'>) => r.title || (r.details.length > 90 ? r.details.slice(0, 88).trimEnd() + '…' : r.details)
export const fbWhere = (r: Pick<FbRow, 'module' | 'screen'>) => [r.module ? MOD_L[r.module] ?? r.module : null, r.screen].filter(Boolean).join(' › ')
export const StatusPill = ({ s }: { s: FbStatus }) => <span className={`pill fbs fbs-${s}`}>{t(FB_STATUS[s])}</span>

/** delete a report for good (SQL 346): its pictures come out of the bucket first, then the report */
export async function deleteFeedback(sb: SupabaseClient, id: number, reason?: string) {
  const { data: fs } = await sb.from('feedback_files').select('file_path').eq('feedback_id', id)
  const paths = ((fs ?? []) as { file_path: string }[]).map(x => x.file_path)
  if (paths.length) await sb.storage.from('feedback').remove(paths)   // a leftover picture is harmless; don't stop the delete over it
  const { error } = await sb.rpc('delete_feedback', { p_id: id, p_reason: reason?.trim() || null })
  if (error) throw new Error(/delete_feedback|schema cache/i.test(error.message) ? 'Deleting needs SQL 346 run first.' : error.message)
}

/** copy text that's still being fetched. Safari (iPhone) only allows a copy right on the tap, so the clipboard
 *  is handed a promise; Chrome takes that too. Falls back to a plain copy. */
async function copyLater(text: Promise<string>) {
  const CI = (window as unknown as { ClipboardItem?: new (x: Record<string, Promise<Blob>>) => ClipboardItem }).ClipboardItem
  let err: unknown = null
  const blob = text.then(t => new Blob([t], { type: 'text/plain' })).catch(e => { err = e; throw e })
  if (CI && navigator.clipboard?.write) {
    try { await navigator.clipboard.write([new CI({ 'text/plain': blob })]); return }
    catch (e) { if (err) throw err; void e }
  }
  await navigator.clipboard.writeText(await text)
}
async function briefs(sb: SupabaseClient, ids: number[]) {
  const { data, error } = ids.length === 1 ? await sb.rpc('feedback_brief', { p_id: ids[0] }) : await sb.rpc('feedback_briefs', { p_ids: ids })
  if (error) throw new Error(/feedback_briefs|schema cache/i.test(error.message) ? 'Copying several needs SQL 347 run first.' : error.message)
  return String(data)
}

const COLS = 'id, ref, type, status, severity, priority, module, screen, section, record_type, record_id, record_label, title, what_trying, details, edited_spec, decision_note, duplicate_of, reporter_email, reporter_name, context, app_version, source, created_at, updated_at, approved_at, ready_at, done_at, commit_ref, claude_notes'

/** is this person a triager? (SQL 341) */
export function useTriager(sb: SupabaseClient | null) {
  const [v, setV] = useState(false)
  useEffect(() => { if (sb) sb.rpc('is_feedback_triager').then(r => setV(r.data === true)) }, [sb])
  return v
}

// ===================================================================================================== inbox
type Filter = 'open' | FbStatus | 'closed' | 'all'
export function FbInbox({ sb, me, flash, openId, onOpened, onCount }: {
  sb: SupabaseClient | null; me: string | null; flash: (t: string, bad?: boolean) => void; openId?: number | null; onOpened?: () => void; onCount?: () => void
}) {
  const triager = useTriager(sb)
  const [rows, setRows] = useState<FbRow[] | null>(null)
  const [f, setF] = useSaved<Filter>('fbinbox.FbInbox.f', 'open')
  const [ty, setTy] = useSaved<string>('fbinbox.FbInbox.ty', '')
  const [md, setMd] = useSaved<string>('fbinbox.FbInbox.md', '')
  const [q, setQ] = useSaved('fbinbox.FbInbox.q', '')
  const [open, setOpen] = useSaved<number | null>('fbinbox.FbInbox.open', null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [bulk, setBulk] = useState<null | 'done' | 'delete'>(null)
  const [bulkNote, setBulkNote] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  async function load() {
    if (!sb) { setRows([]); return }
    const { data, error } = await sb.from('feedback').select(COLS).order('id', { ascending: false }).limit(2000)
    if (error) { flash(/feedback/.test(error.message) ? 'Feedback & Bugs needs SQL 341 run first.' : error.message, true); setRows([]); return }
    setRows((data ?? []) as FbRow[])
  }
  useEffect(() => { load() }, [sb])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (openId) { setOpen(openId); onOpened?.() } }, [openId])   // eslint-disable-line react-hooks/exhaustive-deps

  const n = (s: FbStatus) => (rows ?? []).filter(r => r.status === s).length
  const shown = useMemo(() => {
    const qq = q.trim().toLowerCase()
    return (rows ?? []).filter(r =>
      (f === 'all' || (f === 'open' ? OPEN.includes(r.status) : f === 'closed' ? !OPEN.includes(r.status) : r.status === f))
      && (!ty || r.type === ty) && (!md || r.module === md)
      && (!qq || [r.ref, r.title, r.details, r.what_trying, r.reporter_name, r.screen, r.record_label].some(x => (x ?? '').toLowerCase().includes(qq))))
      .sort((a, b) => f === 'open' || f === 'approved'
        ? (OPEN.indexOf(a.status) - OPEN.indexOf(b.status)) || ((PRI_ORDER[a.priority ?? ''] ?? 3) - (PRI_ORDER[b.priority ?? ''] ?? 3)) || b.id - a.id
        : b.id - a.id)
  }, [rows, f, ty, md, q])
  useEffect(() => { setPicked(new Set()); setBulk(null) }, [f, ty, md, q])
  const pick = (id: number) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const allPicked = shown.length > 0 && shown.every(r => picked.has(r.id))
  async function runBulk() {
    if (!sb || !bulk || !picked.size) return
    setBulkBusy(true)
    let ok = 0, bad = 0, last = ''
    for (const id of picked) {
      try {
        if (bulk === 'delete') await deleteFeedback(sb, id, bulkNote)
        else { const { error } = await sb.rpc('triage_feedback', { p_id: id, p: { status: 'done', note: bulkNote.trim() || null } }); if (error) throw new Error(error.message) }
        ok++
      } catch (e) { bad++; last = (e as Error).message }
    }
    setBulkBusy(false)
    flash(bad ? t('{ok} done, {bad} failed: {m}', { ok, bad, m: last }) : bulk === 'delete' ? t('Deleted {n}', { n: ok }) : t('Marked {n} done', { n: ok }), bad > 0)
    if (open != null && picked.has(open) && bulk === 'delete') setOpen(null)
    setPicked(new Set()); setBulk(null); setBulkNote(''); load(); onCount?.()
  }
  async function copyPicked() {
    if (!sb || !picked.size) return
    const ids = shown.filter(r => picked.has(r.id)).map(r => r.id)
    try { await copyLater(briefs(sb, ids)); flash(t('{n} Claude briefs copied. Paste them into a chat with Claude.', { n: ids.length })) }
    catch (e) { flash((e as Error).message && !/document is not focused|NotAllowed/i.test((e as Error).message) ? (e as Error).message : t("Couldn't copy here. Try again from a computer."), true) }
  }
  const mods = useMemo(() => [...new Set((rows ?? []).map(r => r.module).filter((x): x is string => !!x))].sort(), [rows])
  const FILTERS: [Filter, string][] = [['open', 'Open'], ['new', 'New'], ['needs_info', 'Needs info'], ['approved', 'Approved'], ['in_progress', 'In progress'], ['ready_to_test', 'Ready to test'], ['closed', 'Closed'], ['all', 'All']]

  return (
    <div className="list settings fbinbox">
      <div className="setpick-h home"><h2>{t('Feedback & Bugs')}</h2></div>
      {!triager && rows && <p className="muted">{t("You see your own reports and your modules' reports here. Aziz approves or declines them.")}</p>}
      <Tiles>
        <Tile label={t('New')} value={n('new')} sub={t('waiting for a decision')} tone={n('new') ? 'warn' : 'ok'} onClick={() => setF('new')} />
        <Tile label={t('Needs info')} value={n('needs_info')} sub={t('asked the reporter')} onClick={() => setF('needs_info')} />
        <Tile label={t('Approved')} value={n('approved') + n('in_progress')} sub={t('for Claude to build')} tone={n('approved') ? 'info' : undefined} onClick={() => setF('approved')} />
        <Tile label={t('Ready to test')} value={n('ready_to_test')} sub={t('built, waiting on the reporter')} onClick={() => setF('ready_to_test')} />
      </Tiles>
      <div className="row toolbar">
        <div className="seg setf">{FILTERS.map(([k, l]) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{t(l)}</button>)}</div>
      </div>
      <div className="row toolbar">
        <select value={ty} onChange={e => setTy(e.target.value)} aria-label={t('Type')}><option value="">{t('All types')}</option>{(['bug', 'idea', 'question'] as const).map(k => <option key={k} value={k}>{t(TYPE_L[k])}</option>)}</select>
        <select value={md} onChange={e => setMd(e.target.value)} aria-label={t('Module')}><option value="">{t('All modules')}</option>{mods.map(m => <option key={m} value={m}>{t(MOD_L[m] ?? m)}</option>)}</select>
        <input className="search" type="search" placeholder={t('FB number, words, person or screen')} value={q} onChange={e => setQ(e.target.value)} />
      </div>
      {triager && picked.size > 0 && <div className="fbbulk">
        {bulk ? <>
          <b>{bulk === 'delete' ? t('Delete {n} for good? Comments and pictures go too. This can\'t be undone.', { n: picked.size }) : t('Mark {n} done?', { n: picked.size })}</b>
          <input value={bulkNote} onChange={e => setBulkNote(e.target.value)} placeholder={bulk === 'delete' ? t('Why (optional, kept in the log)') : t('Note (optional, shows in History)')} maxLength={300} />
          <div className="row end"><button className="ghost" disabled={bulkBusy} onClick={() => { setBulk(null); setBulkNote('') }}>{t('Cancel')}</button>
            <button className={bulk === 'delete' ? 'danger-bg' : 'primary'} disabled={bulkBusy} onClick={runBulk}>{bulkBusy ? t('Working…') : bulk === 'delete' ? t('Delete') : t('Mark done')}</button></div>
        </> : <>
          <b>{t('{n} picked', { n: picked.size })}</b>
          <div className="row"><button className="primary small" onClick={copyPicked}>{t('Copy Claude briefs')}</button>
            <button className="ghost small" onClick={() => setBulk('done')}>{t('Mark done')}</button>
            <button className="ghost small danger" onClick={() => setBulk('delete')}>{t('Delete')}</button>
            <button className="ghost small" onClick={() => setPicked(new Set())}>{t('Clear')}</button></div>
        </>}
      </div>}
      {rows === null ? <p className="muted">{t('Loading…')}</p> : !shown.length ? <p className="muted">{t('Nothing here.')}</p> :
        <div className="cwrap"><table className="ctable settable slimmable fbtable">
          <thead><tr>{triager && <th className="slim fbpick"><input type="checkbox" aria-label={t('Pick all')} checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(shown.map(r => r.id)))} /></th>}<th className="slim">#</th><th className="slim">{t('Report')}</th><th>{t('Where')}</th><th>{t('From')}</th><th>{t('How bad')}</th><th>{t('Priority')}</th><th className="slim">{t('Status')}</th><th>{t('Age')}</th></tr></thead>
          <tbody>{shown.map(r => <tr key={r.id} className={`tap ${open === r.id ? 'sel' : ''}`} onClick={() => setOpen(r.id)}>
            {triager && <td className="slim fbpick" onClick={e => e.stopPropagation()}><input type="checkbox" aria-label={t('Pick {r}', { r: r.ref })} checked={picked.has(r.id)} onChange={() => pick(r.id)} /></td>}
            <td className="slim nowrap mono">{r.ref}</td>
            <td className="slim fbt"><span className={`fbtype fbtype-${r.type}`}>{t(TYPE_L[r.type])}</span> <b>{fbTitle(r)}</b></td>
            <td className="nowrap">{fbWhere(r)}</td>
            <td className="nowrap">{r.reporter_name ?? ''}</td>
            <td className="nowrap">{r.severity ? t(SEV_L[r.severity] ?? r.severity) : ''}</td>
            <td className="nowrap">{r.priority ? t(r.priority[0].toUpperCase() + r.priority.slice(1)) : ''}</td>
            <td className="slim nowrap"><StatusPill s={r.status} /></td>
            <td className="nowrap muted">{age(r.created_at)}</td>
          </tr>)}</tbody>
          <tfoot><tr><td colSpan={triager ? 9 : 8}><b>{shown.length} {shown.length === 1 ? t('report') : t('reports')}</b></td></tr></tfoot>
        </table></div>}
      {open != null && <FbCard sb={sb} id={open} flash={flash} triager={triager} me={me} onClose={() => setOpen(null)} onChanged={() => { load(); onCount?.() }} onDeleted={() => { setOpen(null); load(); onCount?.() }} onOpenOther={id => setOpen(id)} />}
    </div>
  )
}

// ===================================================================================================== one report
type CTab = 'overview' | 'pictures' | 'comments' | 'details' | 'history'
export function FbCard({ sb, id, flash, triager, me, onClose, onChanged, onDeleted, onOpenOther, sheetClass = 'side' }: {
  sb: SupabaseClient | null; id: number; flash: (t: string, bad?: boolean) => void; triager: boolean; me?: string | null
  onClose: () => void; onChanged?: () => void; onDeleted?: () => void; onOpenOther?: (id: number) => void; sheetClass?: string
}) {
  const [r, setR] = useState<FbRow | null>(null)
  const [missing, setMissing] = useState(false)
  const [comments, setComments] = useState<FbComment[]>([])
  const [events, setEvents] = useState<FbEvent[]>([])
  const [files, setFiles] = useState<FbFile[]>([])
  const [tab, setTab] = useState<CTab>('overview')
  const [busy, setBusy] = useState(false)
  const [act, setAct] = useState<null | 'needs_info' | 'declined' | 'duplicate' | 'broken' | 'done' | 'delete'>(null)
  const [txt, setTxt] = useState('')
  const [edit, setEdit] = useState<{ title: string; priority: string; edited_spec: string } | null>(null)
  const [cmt, setCmt] = useState('')
  const [internal, setInternal] = useState(false)
  const [big, setBig] = useState<string | null>(null)

  async function load() {
    if (!sb) return
    const [a, c, e, fl] = await Promise.all([
      sb.from('feedback').select(COLS).eq('id', id).maybeSingle(),
      sb.from('feedback_comments').select('*').eq('feedback_id', id).order('id'),
      sb.from('feedback_events').select('*').eq('feedback_id', id).order('id'),
      sb.from('feedback_files').select('*').eq('feedback_id', id).order('id'),
    ])
    if (a.error) { flash(a.error.message, true); return }
    if (!a.data) { setMissing(true); return }
    setR(a.data as FbRow); setComments((c.data ?? []) as FbComment[]); setEvents((e.data ?? []) as FbEvent[])
    const fs = (fl.data ?? []) as FbFile[]
    if (fs.length) {
      const s = await sb.storage.from('feedback').createSignedUrls(fs.map(x => x.file_path), 3600)
      const m = new Map((s.data ?? []).map(x => [x.path, x.signedUrl]))
      fs.forEach(x => { x.url = m.get(x.file_path) ?? undefined })
    }
    setFiles(fs)
  }
  useEffect(() => { setR(null); setMissing(false); setTab('overview'); setAct(null); setEdit(null); load() }, [id])   // eslint-disable-line react-hooks/exhaustive-deps

  async function triage(p: Record<string, unknown>, ok: string) {
    if (!sb) return
    setBusy(true)
    const { error } = await sb.rpc('triage_feedback', { p_id: id, p })
    setBusy(false)
    if (error) { flash(error.message, true); return }
    flash(ok); setAct(null); setTxt(''); setEdit(null); await load(); onChanged?.()
  }
  async function verdict(works: boolean, note?: string) {
    if (!sb) return
    setBusy(true)
    const { error } = await sb.rpc('feedback_verdict', { p_id: id, p_works: works, p_note: note ?? null })
    setBusy(false)
    if (error) { flash(error.message, true); return }
    flash(works ? t('Marked done. Thanks!') : t('Sent back to be fixed')); setAct(null); setTxt(''); await load(); onChanged?.()
  }
  async function comment(body: string, asInternal = false) {
    if (!sb || !body.trim()) return
    setBusy(true)
    const { error } = await sb.rpc('comment_feedback', { p_id: id, p_body: body.trim(), p_internal: asInternal })
    setBusy(false)
    if (error) { flash(error.message, true); return }
    setCmt(''); setInternal(false); setTxt(''); flash(t('Added')); await load(); onChanged?.()
  }
  async function del(reason: string) {
    if (!sb || !r) return
    setBusy(true)
    try { await deleteFeedback(sb, id, reason); flash(t('{r} deleted', { r: r.ref })); (onDeleted ?? onClose)() }
    catch (e) { flash((e as Error).message, true) }
    finally { setBusy(false) }
  }
  async function copyBrief() {
    if (!sb) return
    try { await copyLater(briefs(sb, [id])); flash(t('Claude brief copied. Paste it into a chat with Claude.')) }
    catch (e) { flash((e as Error).message && !/document is not focused|NotAllowed/i.test((e as Error).message) ? (e as Error).message : t("Couldn't copy here. Try again from a computer."), true) }
  }

  const mine = !!r && !!me && r.reporter_email === me
  const open = r ? OPEN.includes(r.status) : false
  const tabs: [CTab, string][] = [['overview', t('Overview')], ['pictures', `${t('Pictures')}${files.length ? ` (${files.length})` : ''}`],
    ['comments', `${t('Comments')}${comments.length ? ` (${comments.length})` : ''}`], ['details', t('Details')], ['history', t('History')]]
  const ctx = (r?.context ?? {}) as { device?: Record<string, unknown>; errors?: { at: string; kind: string; msg: string }[]; url?: string; site?: string; viewing_as?: string; state?: Record<string, unknown>; sheet_row?: number }
  const lastQuestion = [...comments].reverse().find(c => !c.internal && c.author_email !== r?.reporter_email)

  let body: ReactNode = null
  if (r && tab === 'overview') body = <>
    <div className="fbmeta">
      <span><StatusPill s={r.status} /> <span className={`fbtype fbtype-${r.type}`}>{t(TYPE_L[r.type])}</span></span>
      <span><span className="muted">{t('Where')}</span> {fbWhere(r) || '—'}{r.record_label ? ` › ${r.record_label}` : ''}</span>
      <span><span className="muted">{t('From')}</span> {r.reporter_name ?? '?'} · {when(r.created_at)}</span>
      {r.severity && <span><span className="muted">{t('How bad')}</span> {t(SEV_L[r.severity] ?? r.severity)}</span>}
      {r.priority && <span><span className="muted">{t('Priority')}</span> {t(r.priority[0].toUpperCase() + r.priority.slice(1))}</span>}
      {r.duplicate_of && <span><span className="muted">{t('Duplicate of')}</span> <a href="#" onClick={e => { e.preventDefault(); onOpenOther?.(r.duplicate_of!) }}>FB-{String(r.duplicate_of).padStart(4, '0')}</a></span>}
    </div>

    {/* the reporter: a question to answer, or a fix to test */}
    {r.status === 'needs_info' && mine && <div className="warnbox fbask">
      <b>{t('A question for you')}</b>{lastQuestion && <p>{lastQuestion.body}</p>}
      <textarea rows={3} value={txt} onChange={e => setTxt(e.target.value)} placeholder={t('Your answer')} />
      <div className="row end"><button className="primary" disabled={busy || !txt.trim()} onClick={() => comment(txt)}>{t('Send answer')}</button></div>
    </div>}
    {r.status === 'ready_to_test' && (mine || triager) && <div className="okbox fbtest">
      <b>{t('Ready to test')}</b>{r.claude_notes && <p>{r.claude_notes}</p>}
      {act === 'broken' ? <>
        <textarea rows={3} value={txt} onChange={e => setTxt(e.target.value)} placeholder={t("What's still wrong?")} />
        <div className="row end"><button className="ghost" onClick={() => { setAct(null); setTxt('') }}>{t('Cancel')}</button>
          <button className="primary" disabled={busy || !txt.trim()} onClick={() => verdict(false, txt)}>{t('Send back')}</button></div>
      </> : <div className="row"><button className="primary" disabled={busy} onClick={() => verdict(true)}>{t('Works now')}</button>
        <button className="ghost" disabled={busy} onClick={() => { setAct('broken'); setTxt('') }}>{t('Still broken')}</button></div>}
    </div>}

    <div className="fbsec"><div className="fbsec-h">{t('Their words')}</div>
      {r.what_trying && <p><span className="muted">{t('Trying to:')}</span> {r.what_trying}</p>}
      <p className="fbwords">{r.details}</p></div>
    {r.edited_spec && <div className="fbsec"><div className="fbsec-h">{t("Aziz's version (what Claude builds)")}</div><p className="fbwords">{r.edited_spec}</p></div>}
    {r.decision_note && <div className="fbsec"><div className="fbsec-h">{t('Decision notes')}</div><p className="fbwords">{r.decision_note}</p></div>}
    {(r.commit_ref || (r.claude_notes && r.status !== 'ready_to_test')) && <div className="fbsec"><div className="fbsec-h">{t('Claude')}</div>
      {r.claude_notes && <p className="fbwords">{r.claude_notes}</p>}{r.commit_ref && <p className="muted mono small">{r.commit_ref}</p>}</div>}
    {files[0]?.url && <button className="fbthumb" onClick={() => setTab('pictures')}><img src={files[0].url} alt="" />{files.length > 1 && <span>+{files.length - 1}</span>}</button>}

    {/* triage */}
    {triager && <div className="fbtriage">
      <div className="fbsec-h">{t('Decide')}</div>
      {edit ? <div className="fbedit">
        <div className="field"><label>{t('Short title')}</label><input value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} maxLength={120} /></div>
        <div className="field"><label>{t('Priority')}</label><div className="seg">{(['', 'high', 'medium', 'low'] as const).map(k => <button key={k} className={edit.priority === k ? 'on' : ''} onClick={() => setEdit({ ...edit, priority: k })}>{k ? t(k[0].toUpperCase() + k.slice(1)) : t('None')}</button>)}</div></div>
        <div className="field"><label>{t('Your version for Claude')} <span className="muted">({t("what to build; their words stay as they are")})</span></label>
          <textarea rows={5} value={edit.edited_spec} onChange={e => setEdit({ ...edit, edited_spec: e.target.value })} /></div>
        <div className="row end"><button className="ghost" onClick={() => setEdit(null)}>{t('Cancel')}</button>
          <button className="primary" disabled={busy} onClick={() => triage({ title: edit.title, priority: edit.priority, edited_spec: edit.edited_spec }, t('Saved'))}>{t('Save')}</button></div>
      </div> : act === 'done' || act === 'delete' ? <div className={`fbedit ${act === 'delete' ? 'fbdel' : ''}`}>
        {act === 'delete' && <p><b>{t('Delete {r} for good?', { r: r.ref })}</b> {t("Its comments, history and pictures go too. This can't be undone. (Decline keeps it on record instead.)")}</p>}
        <div className="field"><label>{act === 'done' ? t('What was done (optional, shows in History)') : t('Why (optional, kept in the log)')}</label>
          <textarea rows={2} value={txt} onChange={e => setTxt(e.target.value)} autoFocus /></div>
        <div className="row end"><button className="ghost" disabled={busy} onClick={() => { setAct(null); setTxt('') }}>{t('Cancel')}</button>
          {act === 'done' ? <button className="primary" disabled={busy} onClick={() => triage({ status: 'done', note: txt.trim() || null }, t('Marked done'))}>{t('Mark done')}</button>
            : <button className="danger-bg" disabled={busy} onClick={() => del(txt)}>{busy ? t('Deleting…') : t('Delete for good')}</button>}</div>
      </div> : act === 'needs_info' || act === 'declined' || act === 'duplicate' ? <div className="fbedit">
        <div className="field"><label>{act === 'needs_info' ? t('Your question for {n} (they get a push)', { n: r.reporter_name ?? t('them') }) : act === 'declined' ? t("Why it's declined (they'll see this)") : t('FB number it duplicates')}</label>
          {act === 'duplicate' ? <input inputMode="numeric" value={txt} onChange={e => setTxt(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 17" />
            : <textarea rows={3} value={txt} onChange={e => setTxt(e.target.value)} autoFocus />}</div>
        <div className="row end"><button className="ghost" onClick={() => { setAct(null); setTxt('') }}>{t('Cancel')}</button>
          <button className="primary" disabled={busy || !txt.trim()} onClick={() =>
            act === 'needs_info' ? triage({ status: 'needs_info', question: txt }, t('Question sent'))
            : act === 'declined' ? triage({ status: 'declined', decision_note: txt }, t('Declined'))
            : triage({ status: 'duplicate', duplicate_of: Number(txt) }, t('Marked duplicate'))}>
            {act === 'needs_info' ? t('Send question') : act === 'declined' ? t('Decline') : t('Mark duplicate')}</button></div>
      </div> : <div className="fbacts">
        {(r.status === 'new' || r.status === 'needs_info') && <button className="primary" disabled={busy} onClick={() => triage({ status: 'approved' }, t('Approved'))}>{t('Approve')}</button>}
        {open && r.status !== 'needs_info' && <button className="ghost" disabled={busy} onClick={() => { setAct('needs_info'); setTxt('') }}>{t('Ask a question')}</button>}
        {open && <button className="ghost" disabled={busy} onClick={() => { setAct('declined'); setTxt('') }}>{t('Decline')}</button>}
        {open && <button className="ghost" disabled={busy} onClick={() => { setAct('duplicate'); setTxt('') }}>{t('Duplicate')}</button>}
        <button className="ghost" disabled={busy} onClick={() => setEdit({ title: r.title ?? '', priority: r.priority ?? '', edited_spec: r.edited_spec ?? '' })}>{t('Edit for Claude')}</button>
        {open && <button className="ghost" disabled={busy} onClick={() => { setAct('done'); setTxt('') }}>{t('Mark done')}</button>}
        {!open && <button className="ghost" disabled={busy} onClick={() => triage({ status: 'new' }, t('Reopened'))}>{t('Reopen')}</button>}
        <button className="ghost" onClick={copyBrief}>{t('Copy Claude brief')}</button>
        <button className="ghost danger" disabled={busy} onClick={() => { setAct('delete'); setTxt('') }}>{t('Delete')}</button>
      </div>}
    </div>}
  </>
  if (r && tab === 'pictures') body = !files.length ? <p className="muted">{t('No pictures with this one.')}</p> :
    <div className="fbgallery">{files.map(f => <figure key={f.id}>{f.url ? <img src={f.url} alt="" onClick={() => setBig(f.url!)} /> : <div className="muted">{t("Couldn't load")}</div>}
      <figcaption className="muted small">{f.kind === 'screen' ? t('Screen when they tapped the button') : f.kind === 'paste' ? t('Pasted') : t('Photo')}</figcaption></figure>)}</div>
  if (r && tab === 'comments') body = <>
    {!comments.length && <p className="muted">{t('No comments yet.')}</p>}
    {comments.map(c => <div key={c.id} className={`fbcmt ${c.internal ? 'internal' : ''}`}>
      <div className="fbcmt-h"><b>{c.author_name ?? c.author_email ?? 'Claude'}</b>{c.internal && <span className="pill">{t('internal')}</span>}<span className="muted small">{when(c.created_at)}</span></div>
      <div className="fbwords">{c.body}</div></div>)}
    <div className="field"><label>{t('Add a comment')}</label><textarea rows={3} value={cmt} onChange={e => setCmt(e.target.value)} /></div>
    <div className="row between">
      {triager ? <label className="row"><input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} /> {t('Internal (only triagers see it)')}</label> : <span />}
      <button className="primary" disabled={busy || !cmt.trim()} onClick={() => comment(cmt, internal)}>{t('Add')}</button></div>
  </>
  if (r && tab === 'details') body = <dl className="fbdl">
    <dt>{t('Number')}</dt><dd className="mono">{r.ref}{r.source === 'sheet' && ctx.sheet_row ? ` · ${t('old sheet row {n}', { n: ctx.sheet_row })}` : ''}</dd>
    <dt>{t('Screen')}</dt><dd>{fbWhere(r) || '—'}{r.section ? ` › ${r.section}` : ''}</dd>
    {(r.record_label || r.record_id) && <><dt>{t('Open record')}</dt><dd>{r.record_label ?? ''}{r.record_type ? <span className="muted"> · {r.record_type} {r.record_id}</span> : null}</dd></>}
    {ctx.device && <><dt>{t('Device')}</dt><dd>{String(ctx.device.kind ?? '')} · {String(ctx.device.width)}×{String(ctx.device.height)}{ctx.device.standalone ? ` · ${t('Home Screen app')}` : ''}<div className="muted small">{String(ctx.device.ua ?? '')}</div></dd></>}
    {r.app_version && <><dt>{t('App version')}</dt><dd className="mono small">{r.app_version}</dd></>}
    {ctx.site && <><dt>{t('Site')}</dt><dd>{ctx.site}</dd></>}
    {ctx.viewing_as && <><dt>{t('Viewing as')}</dt><dd>{ctx.viewing_as}</dd></>}
    <dt>{t('Recent errors')}</dt><dd>{ctx.errors?.length ? <ul className="fberrs">{ctx.errors.map((x, i) => <li key={i}><span className="muted small">{new Date(x.at).toLocaleTimeString()} {x.kind}</span> {x.msg}</li>)}</ul> : <span className="muted">{t('None')}</span>}</dd>
    {ctx.state && <><dt>{t('Screen state')}</dt><dd><details><summary className="muted">{t('Show')}</summary><pre className="fbpre">{JSON.stringify(ctx.state, null, 1)}</pre></details></dd></>}
  </dl>
  if (r && tab === 'history') body = <div className="fbhist">{events.map(e => <div key={e.id} className="hist">
    <span className="muted small">{when(e.created_at)}</span> {e.from_status ? <>{t(FB_STATUS[e.from_status as FbStatus] ?? e.from_status)} → </> : null}<b>{t(FB_STATUS[e.to_status as FbStatus] ?? e.to_status ?? '')}</b>
    {e.note && <> · {e.note}</>} <span className="muted small">· {e.actor_email === 'import' ? t('import') : e.actor_email === 'claude' ? 'Claude' : (e.actor_email ?? '').split('@')[0]}</span></div>)}</div>

  return (
    <div className="scrim" onClick={onClose}>
      <div className={`sheet form big ${sheetClass} fbcard`} onClick={e => e.stopPropagation()}>
        <div className="sheet-h"><div><div className="muted mono small">{r?.ref ?? `FB-${String(id).padStart(4, '0')}`}{r ? ` · ${day(r.created_at)}` : ''}</div><h2>{r ? fbTitle(r) : missing ? t('Not found') : t('Loading…')}</h2></div>
          <button className="ghost" aria-label={t('Close')} onClick={onClose}>✕</button></div>
        {missing && <p className="muted">{t("This report doesn't exist, or it isn't one you can see.")}</p>}
        {r && <nav className="ftabs">{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</nav>}
        {body}
      </div>
      {big && <div className="fbbig" onClick={e => { e.stopPropagation(); setBig(null) }}><img src={big} alt="" /></div>}
    </div>
  )
}

// ===================================================================================================== my reports
export function MyReports({ sb, me, flash, openId, onClose }: {
  sb: SupabaseClient | null; me: string; flash: (t: string, bad?: boolean) => void; openId?: number | null; onClose: () => void
}) {
  const [rows, setRows] = useState<FbRow[] | null>(null)
  const [open, setOpen] = useState<number | null>(openId ?? null)
  async function load() {
    if (!sb) { setRows([]); return }
    const { data, error } = await sb.from('feedback').select(COLS).eq('reporter_email', me).order('id', { ascending: false }).limit(500)
    if (error) { flash(error.message, true); setRows([]); return }
    setRows((data ?? []) as FbRow[])
  }
  useEffect(() => { load() }, [sb, me])   // eslint-disable-line react-hooks/exhaustive-deps
  if (open != null) return <FbCard sb={sb} id={open} flash={flash} triager={false} me={me} sheetClass="" onClose={() => { setOpen(null); load() }} onChanged={load} onOpenOther={setOpen} />
  const waiting = (rows ?? []).filter(r => r.status === 'needs_info' || r.status === 'ready_to_test')
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet form fbmine" onClick={e => e.stopPropagation()}>
        <div className="sheet-h"><div><h2>{t('My reports')}</h2><div className="muted small">{t('Feedback & Bugs you sent, newest first')}</div></div><button className="ghost" aria-label={t('Close')} onClick={onClose}>✕</button></div>
        {waiting.length > 0 && <div className="warnbox">{t('{n} waiting on you: a question to answer or a fix to test.', { n: waiting.length })}</div>}
        {rows === null ? <p className="muted">{t('Loading…')}</p> : !rows.length ? <p className="muted">{t("You haven't sent any yet. Tap the bug button on any screen.")}</p> :
          <div className="fbminelist">{rows.map(r => <button key={r.id} className="fbmine-row" onClick={() => setOpen(r.id)}>
            <span className="fbmine-top"><span className="mono small muted">{r.ref}</span><StatusPill s={r.status} /></span>
            <b>{fbTitle(r)}</b>
            <span className="muted small">{fbWhere(r)}{fbWhere(r) ? ' · ' : ''}{day(r.created_at)}</span>
          </button>)}</div>}
      </div>
    </div>
  )
}
