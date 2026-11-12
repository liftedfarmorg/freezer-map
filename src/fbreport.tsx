import { useMemo, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { t } from './i18n'
import { appVersion, deviceInfo, openRecord, recentErrors, savedState } from './fbcapture'

// Msg FB-7: Feedback & Bugs, the report sheet. Opens from the bug button in the top bar (and the account menu / More sheet
// on phones) after the app has taken a picture of the screen. Where the person was is filled in for them.
// Reports go to Admin > Feedback & Bugs (SQL 341). Everyone sees only their own; module Admins see their module's.

export type FbType = 'bug' | 'idea' | 'question'
export type FbSeverity = 'blocking' | 'slowing' | 'nice'
export interface FbWhere { module: string | null; moduleLabel: string; screen: string | null; viewingAs?: string | null; site?: string | null }
interface Pic { id: number; blob: Blob; url: string; kind: 'screen' | 'paste' | 'photo' }

const BUG_ICON = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  <path d="M8 6.5a4 4 0 0 1 8 0" /><rect x="7" y="7" width="10" height="13" rx="5" /><path d="M12 11v9M3 13h4M17 13h4M4 7l3 2M20 7l-3 2M4 20l3-2.5M20 20l-3-2.5" /></svg>
export const FbIcon = () => BUG_ICON

let picSeq = 0
const extOf = (b: Blob) => (b.type.split('/')[1] ?? 'png').replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '') || 'png'

export function FbReport({ sb, shot, where, onClose, flash }: {
  sb: SupabaseClient | null; shot: Blob | null; where: FbWhere; onClose: () => void; flash: (t: string, bad?: boolean) => void
}) {
  const [type, setType] = useState<FbType>('bug')
  const [trying, setTrying] = useState('')
  const [details, setDetails] = useState('')
  const [sev, setSev] = useState<FbSeverity | null>(null)
  const [pics, setPics] = useState<Pic[]>(() => shot ? [{ id: ++picSeq, blob: shot, url: URL.createObjectURL(shot), kind: 'screen' }] : [])
  const [busy, setBusy] = useState(false)
  const [big, setBig] = useState<Pic | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const state = useMemo(() => savedState(), [])
  const rec = useMemo(() => openRecord(state), [state])

  const add = (blobs: Blob[], kind: Pic['kind']) => {
    const imgs = blobs.filter(b => b.type.startsWith('image/') && b.size < 15 * 1024 * 1024)
    if (blobs.length && !imgs.length) { flash(t('Only pictures, up to 15 MB each'), true); return }
    setPics(ps => [...ps, ...imgs.map(b => ({ id: ++picSeq, blob: b, url: URL.createObjectURL(b), kind }))].slice(0, 6))
  }
  const onPaste = (e: React.ClipboardEvent) => {
    const files = [...e.clipboardData.items].filter(i => i.kind === 'file').map(i => i.getAsFile()).filter((f): f is File => !!f)
    if (files.length) { e.preventDefault(); add(files, 'paste') }
  }
  const pasteBtn = async () => {
    try {
      const items = await navigator.clipboard.read()
      const blobs: Blob[] = []
      for (const it of items) { const ty = it.types.find(x => x.startsWith('image/')); if (ty) blobs.push(await it.getType(ty)) }
      if (!blobs.length) flash(t('No picture on the clipboard. Take a screenshot, copy it, then paste.'), true)
      else add(blobs, 'paste')
    } catch { flash(t('Your browser blocked pasting here. Tap in a box and use Paste, or add it as a photo.'), true) }
  }
  const remove = (id: number) => setPics(ps => { const p = ps.find(x => x.id === id); if (p) URL.revokeObjectURL(p.url); return ps.filter(x => x.id !== id) })

  const whereLine = [where.moduleLabel, where.screen && where.screen !== where.moduleLabel ? where.screen : t('Home'), rec.label].filter(Boolean).join(' › ')
  const prompt = type === 'bug' ? t('What happened?') : type === 'idea' ? t('What would help?') : t("What's your question?")
  const hint = type === 'bug' ? t('What you saw, and what you expected instead') : type === 'idea' ? t('What you want the app to do, and why it would help') : t('Ask away')

  async function send() {
    if (!sb) return
    if (!details.trim()) { flash(t('Say what happened (or what would help)'), true); return }
    setBusy(true)
    try {
      const { data, error } = await sb.rpc('submit_feedback', { p: {
        type, severity: type === 'question' ? null : sev, module: where.module, screen: where.screen && where.screen !== where.moduleLabel ? where.screen : 'Home',
        record_type: rec.type, record_id: rec.id, record_label: rec.label,
        what_trying: trying.trim() || null, details: details.trim(), app_version: appVersion(),
        context: { device: deviceInfo(), url: location.pathname + location.search, title: document.title, site: where.site ?? null,
          viewing_as_ui: where.viewingAs ?? null, state, errors: recentErrors(), at_local: new Date().toString() },
      } })
      if (error) throw error
      const fb = data as { id: number; ref: string }
      let bad = 0
      for (const [i, p] of pics.entries()) {
        const path = `fb/${fb.id}/${Date.now()}-${i + 1}-${p.kind}.${extOf(p.blob)}`
        const up = await sb.storage.from('feedback').upload(path, p.blob, { contentType: p.blob.type || 'image/png', upsert: false })
        if (up.error) { bad++; continue }
        const r = await sb.rpc('add_feedback_file', { p_id: fb.id, p_path: path, p_kind: p.kind })
        if (r.error) bad++
      }
      flash(bad ? t('Sent as {r}, but {n} picture(s) didn’t upload', { r: fb.ref, n: bad }) : t('Sent as {r}. Thanks!', { r: fb.ref }), bad > 0)
      onClose()
    } catch (e) {
      const m = (e as Error).message ?? String(e)
      flash(/submit_feedback/.test(m) ? 'Feedback & Bugs needs SQL 341 run first.' : m, true)
    } finally { setBusy(false) }
  }

  return (
    <div className="scrim fb-nocap" onClick={() => !busy && onClose()}>
      <div className="sheet form fbsheet" onClick={e => e.stopPropagation()} onPaste={onPaste}>
        <div className="sheet-h"><div><h2>{t('Feedback & Bugs')}</h2><div className="muted small">{t('Goes to Aziz. You can see what happens to it later.')}</div></div>
          <button className="ghost" aria-label={t('Close')} onClick={onClose} disabled={busy}>✕</button></div>

        <div className="seg fbtype" role="radiogroup" aria-label={t('Type')}>
          {([['bug', t('Bug')], ['idea', t('Idea')], ['question', t('Question')]] as [FbType, string][]).map(([k, l]) =>
            <button key={k} role="radio" aria-checked={type === k} className={type === k ? 'on' : ''} onClick={() => setType(k)}>{l}</button>)}
        </div>

        <div className="fbwhere"><span className="muted">{t('Where')}</span> <b>{whereLine || t('This screen')}</b>
          <span className="muted small"> · {t('added for you')}</span></div>

        <div className="field"><label>{t('What were you trying to do?')} <span className="muted">({t('optional')})</span></label>
          <input value={trying} onChange={e => setTrying(e.target.value)} placeholder={t('e.g. move a pallet to F3')} maxLength={300} /></div>
        <div className="field"><label>{prompt}</label>
          <textarea rows={4} value={details} onChange={e => setDetails(e.target.value)} placeholder={hint} maxLength={4000} autoFocus={window.innerWidth >= 760} /></div>

        {type !== 'question' && <div className="field"><label>{type === 'bug' ? t('How bad?') : t('How much would it help?')}</label>
          <div className="chips tray fbsev">
            {([['blocking', type === 'bug' ? t('Blocking me') : t('A lot, I need it')], ['slowing', t('Slowing me down')], ['nice', t('Nice to have')]] as [FbSeverity, string][]).map(([k, l]) =>
              <button key={k} type="button" className={`chip ${sev === k ? 'on' : ''}`} aria-pressed={sev === k} onClick={() => setSev(sev === k ? null : k)}>{l}</button>)}
          </div></div>}

        <div className="field"><label>{t('Pictures')} <span className="muted">({t('the screen is already attached; paste or add more')})</span></label>
          <div className="fbpics">
            {pics.map(p => <div key={p.id} className="fbpic">
              <img src={p.url} alt={p.kind === 'screen' ? t('Screen') : t('Picture')} onClick={() => setBig(p)} />
              <span className="fbpic-k">{p.kind === 'screen' ? t('Screen') : p.kind === 'paste' ? t('Pasted') : t('Photo')}</span>
              <button className="fbpic-x" aria-label={t('Remove')} onClick={() => remove(p.id)}>✕</button>
            </div>)}
            {pics.length < 6 && <>
              <button type="button" className="fbadd" onClick={pasteBtn}>{t('Paste')}</button>
              <button type="button" className="fbadd" onClick={() => fileRef.current?.click()}>{t('Add photo')}</button>
            </>}
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => { add([...(e.target.files ?? [])], 'photo'); e.target.value = '' }} />
          </div>
          {!shot && <div className="muted small">{t("Couldn't picture the screen this time. Paste a screenshot or add a photo if it helps.")}</div>}
        </div>

        <div className="row end">
          <button className="ghost" onClick={onClose} disabled={busy}>{t('Cancel')}</button>
          <button className="primary" disabled={busy || !details.trim()} onClick={send}>{busy ? t('Sending…') : t('Send')}</button>
        </div>
      </div>
      {big && <div className="fbbig" onClick={e => { e.stopPropagation(); setBig(null) }}><img src={big.url} alt="" /></div>}
    </div>
  )
}
