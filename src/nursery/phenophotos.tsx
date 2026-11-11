import { useCallback, useEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { shrink } from '../fleet/api'
import { fmtD } from './calc'
import type { Flash } from '../cult/ui'
import { t } from '../i18n'

// PHENO-PIC-1 (337): photos on a pheno. Tap Take photo (phone camera), or Upload for several at once from the camera roll.
// Pick what it's a photo of first (Plant / Jar / Bud). Everyone with Nursery access sees them; you can delete your own.
export interface PhenoPhoto { id: number; pheno_id: number; file_path: string; kind: string; caption: string | null; taken_by: string; created_at: string }
const BUCKET = 'nursery'
const KINDS: [string, string][] = [['plant', 'Plant'], ['jar', 'Jar'], ['bud', 'Bud'], ['other', 'Other']]
const uuid = () => (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
const who = (e: string) => e.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

export function PhenoPhotos({ sb, phenoId, me, admin, flash, onCount }: { sb: SupabaseClient; phenoId: number; me: string; admin: boolean; flash: Flash; onCount?: (n: number) => void }) {
  const [list, setList] = useState<PhenoPhoto[] | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [kind, setKind] = useState('plant')
  const [busy, setBusy] = useState<string | null>(null)
  const [big, setBig] = useState<PhenoPhoto | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const cam = useRef<HTMLInputElement>(null)
  const roll = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const { data, error } = await sb.from('pheno_photos').select('*').eq('pheno_id', phenoId).order('created_at', { ascending: false })
    if (error) { setErr(/pheno_photos|does not exist|schema cache/i.test(error.message) ? t('Photos need 337_pheno_photos.sql run in Supabase.') : error.message); setList([]); return }
    const ps = (data ?? []) as PhenoPhoto[]
    setList(ps); setErr(null); onCount?.(ps.length)
    if (ps.length) {
      const s = await sb.storage.from(BUCKET).createSignedUrls(ps.map(p => p.file_path), 3600)
      setUrls(Object.fromEntries((s.data ?? []).filter(x => x.signedUrl && x.path).map(x => [x.path as string, x.signedUrl])))
    }
  }, [sb, phenoId])
  useEffect(() => { load() }, [load])

  const add = async (fl: FileList | null) => {
    const files = [...(fl ?? [])].filter(f => f.type.startsWith('image/') || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name))
    if (!files.length) return
    try {
      for (const [i, f0] of files.entries()) {
        setBusy(files.length > 1 ? `${i + 1} / ${files.length}…` : '…')
        const f = await shrink(f0)
        const ext = (f.name.match(/\.(\w+)$/)?.[1] ?? 'jpg').toLowerCase()
        const path = `pheno/${phenoId}/${uuid()}.${ext}`
        const up = await sb.storage.from(BUCKET).upload(path, f, { contentType: f.type || 'image/jpeg', upsert: false })
        if (up.error) throw new Error(/bucket|not found/i.test(up.error.message) ? `${up.error.message} (run 337_pheno_photos.sql in Supabase)` : up.error.message)
        const ins = await sb.from('pheno_photos').insert({ pheno_id: phenoId, file_path: path, kind })
        if (ins.error) { await sb.storage.from(BUCKET).remove([path]); throw new Error(ins.error.message) }
      }
      flash(files.length > 1 ? t('{n} photos added', { n: files.length }) : t('Photo added'))
      await load()
    } catch (e) { flash(e instanceof Error ? e.message : String(e), true) } finally { setBusy(null) }
  }

  const del = async (p: PhenoPhoto) => {
    if (!confirm(t('Delete this photo?'))) return
    setBusy('…')
    const r = await sb.from('pheno_photos').delete().eq('id', p.id)
    if (r.error) { setBusy(null); flash(r.error.message, true); return }
    await sb.storage.from(BUCKET).remove([p.file_path])
    setBusy(null); setBig(null); flash(t('Photo deleted')); await load()
  }

  const setKindOf = async (p: PhenoPhoto, k: string) => {
    const r = await sb.from('pheno_photos').update({ kind: k }).eq('id', p.id)
    if (r.error) { flash(r.error.message, true); return }
    setBig({ ...p, kind: k }); await load()
  }

  const mineOrAdmin = (p: PhenoPhoto) => p.taken_by === me || admin
  return (
    <div className="pphotos">
      <h3>{t('Photos')}{list && list.length > 0 ? <span className="muted small"> {list.length}</span> : ''}</h3>
      {err ? <div className="warnbox">{err}</div> : <>
        <div className="pp-bar">
          <div className="seg pp-kind">{KINDS.slice(0, 3).map(([k, l]) => <button key={k} type="button" className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{t(l)}</button>)}</div>
          <button className="primary" disabled={!!busy} onClick={() => cam.current?.click()}>📷 {busy ? t('Uploading photos {s}', { s: busy }) : t('Take photo')}</button>
          <button className="ghost" disabled={!!busy} onClick={() => roll.current?.click()}>{t('Upload photos')}</button>
          <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={e => { add(e.target.files); e.target.value = '' }} />
          <input ref={roll} type="file" accept="image/*" multiple hidden onChange={e => { add(e.target.files); e.target.value = '' }} />
        </div>
        {list == null ? <p className="muted small">{t('Loading…')}</p>
          : list.length === 0 ? <p className="muted small">{t('No photos yet. Pick Plant, Jar or Bud, then take a photo.')}</p>
            : <div className="pp-grid">{list.map(p => <button key={p.id} type="button" className="pp-th" onClick={() => setBig(p)} title={`${who(p.taken_by)} · ${fmtD(p.created_at.slice(0, 10))}`}>
              {urls[p.file_path] ? <img src={urls[p.file_path]} alt="" loading="lazy" /> : <span className="muted small">…</span>}
              <span className="pp-tag">{t(KINDS.find(k => k[0] === p.kind)?.[1] ?? 'Other')}</span>
            </button>)}</div>}
      </>}
      {big && <div className="scrim pp-big" onClick={() => setBig(null)}>
        <div className="pp-bigin" onClick={e => e.stopPropagation()}>
          {urls[big.file_path] && <img src={urls[big.file_path]} alt="" />}
          <div className="pp-bigbar">
            <span className="small">{t(KINDS.find(k => k[0] === big.kind)?.[1] ?? 'Other')} · {who(big.taken_by)} · {fmtD(big.created_at.slice(0, 10))}</span>
            {mineOrAdmin(big) && <div className="seg">{KINDS.map(([k, l]) => <button key={k} type="button" className={big.kind === k ? 'on' : ''} onClick={() => setKindOf(big, k)}>{t(l)}</button>)}</div>}
            <span className="row">
              {mineOrAdmin(big) && <button className="ghost danger" disabled={!!busy} onClick={() => del(big)}>{t('Delete')}</button>}
              <button className="ghost" onClick={() => setBig(null)}>{t('Close')}</button>
            </span>
          </div>
        </div>
      </div>}
    </div>
  )
}
