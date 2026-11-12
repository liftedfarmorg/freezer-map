// Msg FB-7: Feedback & Bugs. Remembers the last few problems in this browser tab (errors, failed calls) so a bug report
// carries them, works out where the person is (screen state saved in sessionStorage, the open card), and takes a picture
// of the screen. Only for the report; nothing here is sent anywhere until someone sends a report.

declare const __APP_COMMIT__: string

export interface FbErr { at: string; kind: 'error' | 'promise' | 'console' | 'http' | 'network'; msg: string }
const ring: FbErr[] = []
const push = (kind: FbErr['kind'], msg: string) => {
  ring.push({ at: new Date().toISOString(), kind, msg: msg.slice(0, 400) })
  if (ring.length > 15) ring.shift()
}
export const recentErrors = () => [...ring]

let installed = false
export function installFbCapture() {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('error', e => push('error', `${e.message}${e.filename ? ` @ ${e.filename.split('/').pop()}:${e.lineno}` : ''}`))
  window.addEventListener('unhandledrejection', e => push('promise', String((e.reason as Error)?.message ?? e.reason ?? '')))
  const ce = console.error.bind(console)
  console.error = (...a: unknown[]) => { try { push('console', a.map(x => x instanceof Error ? x.message : typeof x === 'string' ? x : JSON.stringify(x)).join(' ')) } catch { /* circular */ } ce(...a) }
  const orig = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const short = (() => { try { const u = new URL(url, location.href); return `${init?.method ?? (input instanceof Request ? input.method : 'GET')} ${u.host === location.host ? '' : u.host}${u.pathname}` } catch { return url.slice(0, 120) } })()
    try {
      const r = await orig(input, init)
      if (r.status >= 400 && !/\/storage\/v1\/object\/sign|\/auth\/v1\/token/.test(url)) {
        let body = ''
        try { body = (await r.clone().text()).slice(0, 200) } catch { /* stream */ }
        push('http', `${r.status} ${short}${body ? ` · ${body}` : ''}`)
      }
      return r
    } catch (e) {
      push('network', `${short} · ${(e as Error)?.message ?? e}`)
      throw e
    }
  }
}

export const appVersion = (): string => {
  const c = typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : ''
  const js = [...document.scripts].map(s => s.getAttribute('src') ?? '').find(s => /\/assets\/index-[^/]+\.js$/.test(s))?.split('/').pop() ?? ''
  return [c, js].filter(Boolean).join(' ') || 'dev'
}

/** everything this tab remembers about where you are (tabs, filters, open records), from useSaved */
export function savedState(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i) ?? ''
      if (!k.startsWith('s.')) continue
      const raw = sessionStorage.getItem(k) ?? ''
      if (raw.length > 300) continue
      try { out[k.slice(2)] = JSON.parse(raw) } catch { out[k.slice(2)] = raw }
    }
  } catch { /* private window */ }
  return out
}

/** the record that's open, best guess: the open card's title and a saved ".open"-style key that has a value */
export function openRecord(state: Record<string, unknown>): { type: string | null; id: string | null; label: string | null } {
  const heads = [...document.querySelectorAll<HTMLElement>('.scrim .sheet h2, .scrim .sheet h3, .side-card h2, .sidecard h2, aside.card h2')]
    .filter(h => h.offsetParent !== null)
  const label = heads.length ? (heads[heads.length - 1].innerText || '').trim().slice(0, 120) || null : null
  const hit = Object.entries(state).filter(([k, v]) => /\.(open|openId|fOpen|hunt|freezer)$|\.open[A-Z]\w*$/.test(k) && v != null && v !== '' && v !== false)
  const last = hit[hit.length - 1]
  if (!last) return { type: null, id: null, label }
  const k = last[0]
  const comp = k.split('.').slice(-2).join(' ')
  return { type: comp, id: typeof last[1] === 'object' ? JSON.stringify(last[1]).slice(0, 80) : String(last[1]), label }
}

export function deviceInfo() {
  const w = window.innerWidth
  return {
    width: w, height: window.innerHeight, dpr: window.devicePixelRatio,
    kind: w < 760 ? 'phone' : w < 1000 ? 'tablet' : 'desktop',
    standalone: (navigator as unknown as { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches,
    ua: navigator.userAgent.slice(0, 220), lang: navigator.language,
    theme: document.documentElement.dataset.theme ?? null,
  }
}

/** a picture of what's on screen right now (the app page; the phone's own bars aren't part of it). null if it can't. */
export async function captureScreen(): Promise<Blob | null> {
  const shell = document.querySelector<HTMLElement>('.app.shell') ?? document.body
  const top = shell.scrollTop
  const w = window.innerWidth, h = window.innerHeight
  try {
    const { domToBlob } = await import('modern-screenshot')
    const kids = [...shell.children] as HTMLElement[]
    // which children scroll with the page (everything but the fixed/sticky bars)
    const moves = kids.map(el => { const p = getComputedStyle(el).position; return p === 'static' || p === 'relative' })
    const blob = await Promise.race([
      domToBlob(shell, {
        width: w, height: h, scale: w < 760 ? 2 : 1, type: 'image/jpeg', quality: 0.85,
        backgroundColor: getComputedStyle(document.body).backgroundColor || '#ffffff',
        timeout: 4000,
        filter: n => !(n instanceof HTMLElement && (n.classList.contains('fb-nocap') || n.tagName === 'VIDEO')),
        onCloneNode: cloned => {
          const c = cloned as HTMLElement
          c.style.height = `${h}px`; c.style.overflow = 'hidden'
          if (top > 0) [...c.children].forEach((el, i) => { if (moves[i]) (el as HTMLElement).style.transform = `translateY(${-top}px)` })
        },
      }),
      new Promise<null>(res => setTimeout(() => res(null), 8000)),
    ])
    return blob
  } catch (e) {
    console.warn('Screen capture failed', e)
    return null
  }
}
