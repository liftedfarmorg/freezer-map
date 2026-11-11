import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

// PHENO-PIC-7: background photo queue for the field. Snap a photo and move on: it's shrunk, saved on the phone (IndexedDB, so it
// survives Safari reloading the page), and sent in the background. Weak signal: every try times out instead of hanging, and the queue
// keeps retrying (5s, 15s, 30s, then every 60s, and right away when the phone gets signal back). Each photo has a fixed storage path,
// so a try that timed out but actually landed counts as done on the next try.
export interface QItem { id: string; phenoId: number; kind: string; at: number; status: 'waiting' | 'sending' | 'failed'; tries: number; err: string; url: string }
interface Stored { id: string; phenoId: number; kind: string; at: number; blob: Blob }

const BUCKET = 'nursery'
const UPLOAD_MS = 60_000
const ROW_MS = 20_000
const uuid = () => (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
const timeout = <T,>(p: PromiseLike<T>, ms: number, what: string) =>
  Promise.race([Promise.resolve(p), new Promise<never>((_, no) => setTimeout(() => no(new Error(`${what} timed out (weak signal)`)), ms))])
const permanent = (m: string) => /row-level|policy|denied|violates check|bucket not found|not allowed|mime/i.test(m)

// ---------- phone storage ----------
function idb(): Promise<IDBDatabase | null> {
  return new Promise(res => {
    try {
      const r = indexedDB.open('lifted-photo-queue', 1)
      r.onupgradeneeded = () => { r.result.createObjectStore('q', { keyPath: 'id' }) }
      r.onsuccess = () => res(r.result); r.onerror = () => res(null)
    } catch { res(null) }
  })
}
async function idbDo<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await idb(); if (!db) return null
  return new Promise(res => { try { const q = f(db.transaction('q', mode).objectStore('q')); q.onsuccess = () => res(q.result); q.onerror = () => res(null) } catch { res(null) } })
}

// ---------- shrink: 1280px JPEG, never more than 10s ----------
async function shrinkFast(f: File): Promise<Blob> {
  if (!/^image\//i.test(f.type) || f.size < 400 * 1024) return f
  const go = async () => {
    const bmp = await createImageBitmap(f)
    const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height))
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k)
    cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height); bmp.close?.()
    const b = await new Promise<Blob | null>(r => cv.toBlob(r, 'image/jpeg', 0.78))
    return b && b.size < f.size ? b : f
  }
  try { return await timeout(go(), 10_000, 'Shrinking') } catch { return f }
}

// ---------- the queue ----------
let sb: SupabaseClient | null = null
let items: QItem[] = []
const blobs = new Map<string, Blob>()
const subs = new Set<() => void>()
const doneSubs = new Set<(phenoId: number) => void>()
let running = false
let timer: ReturnType<typeof setTimeout> | null = null
const emit = () => subs.forEach(f => f())
const set = (id: string, v: Partial<QItem>) => { items = items.map(x => (x.id === id ? { ...x, ...v } : x)); emit() }

/** call once when the Nursery module opens: picks up photos still on the phone from before (e.g. Safari reloaded) */
export async function startQueue(client: SupabaseClient) {
  if (sb) { sb = client; return }
  sb = client
  try { window.addEventListener('online', () => kick(true)) } catch { /* no window */ }
  const all = (await idbDo<Stored[]>('readonly', s => s.getAll() as IDBRequest<Stored[]>)) ?? []
  for (const x of all.sort((a, b) => a.at - b.at)) {
    if (items.some(i => i.id === x.id)) continue
    blobs.set(x.id, x.blob)
    items.push({ id: x.id, phenoId: x.phenoId, kind: x.kind, at: x.at, status: 'waiting', tries: 0, err: '', url: URL.createObjectURL(x.blob) })
  }
  emit(); kick(true)
}

export async function enqueue(phenoId: number, kind: string, files: File[]) {
  for (const f of files) {
    const id = uuid(), at = Date.now()
    const blob = await shrinkFast(f)
    blobs.set(id, blob)
    items = [...items, { id, phenoId, kind, at, status: 'waiting', tries: 0, err: '', url: URL.createObjectURL(blob) }]; emit()
    await idbDo('readwrite', s => s.put({ id, phenoId, kind, at, blob } satisfies Stored))
  }
  kick(true)
}

export function retryAll() { items = items.map(x => (x.status === 'failed' ? { ...x, status: 'waiting', tries: 0, err: '' } : x)); emit(); kick(true) }
export async function discard(id: string) {
  const x = items.find(i => i.id === id); if (x) URL.revokeObjectURL(x.url)
  items = items.filter(i => i.id !== id); blobs.delete(id); emit()
  await idbDo('readwrite', s => s.delete(id))
}

function kick(now = false) {
  if (timer) { clearTimeout(timer); timer = null }
  if (now) void work()
}

async function sendOne(x: QItem) {
  const blob = blobs.get(x.id); if (!blob || !sb) throw new Error('Photo is gone from this phone')
  const path = `pheno/${x.phenoId}/${x.id}.jpg`
  const up = await timeout(sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false }), UPLOAD_MS, 'Upload')
  if (up.error && !/already exists|duplicate/i.test(up.error.message)) throw new Error(up.error.message)
  const ins = await timeout(sb.from('pheno_photos').insert({ pheno_id: x.phenoId, file_path: path, kind: x.kind }), ROW_MS, 'Saving')
  if (ins.error && !/duplicate|unique/i.test(ins.error.message)) throw new Error(ins.error.message)
}

async function work() {
  if (running) return
  running = true
  try {
    for (;;) {
      const x = items.find(i => i.status === 'waiting'); if (!x) break
      set(x.id, { status: 'sending' })
      try {
        await sendOne(x)
        await discard(x.id)
        doneSubs.forEach(f => f(x.phenoId))
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e)
        const tries = x.tries + 1
        set(x.id, { status: permanent(m) ? 'failed' : 'waiting', tries, err: m })
        if (!permanent(m)) {   // back off, then the loop picks it up again
          running = false
          timer = setTimeout(() => void work(), [5_000, 15_000, 30_000][tries - 1] ?? 60_000)
          return
        }
      }
    }
  } finally { running = false }
}

/** live view of the queue (all photos, or one pheno's) */
export function useQueue(phenoId?: number): QItem[] {
  const [, force] = useState(0)
  useEffect(() => { const f = () => force(n => n + 1); subs.add(f); return () => { subs.delete(f) } }, [])
  return phenoId == null ? items : items.filter(i => i.phenoId === phenoId)
}
/** run something when a photo finishes sending (refresh the list / photo counts) */
export function useQueueDone(f: (phenoId: number) => void) {
  useEffect(() => { doneSubs.add(f); return () => { doneSubs.delete(f) } }, [f])
}
