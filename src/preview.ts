// Look-only preview (restyle-preview branch, Msg #264).
// On a Vercel preview build the app can read everything but save nothing: every request that would change data
// is stopped here before it leaves the browser, and middleware.js refuses every /api call on previews server side.
// Allowed on the preview: reads, signing in and out, and your own My settings (prefs, name, phone, language, push).
import { PREVIEW_READS } from './previewReads'

declare const __VERCEL_ENV__: string

const LIVE_HOSTS = ['freezer-map-8i3h.vercel.app', 'lifted-orders.app', 'www.lifted-orders.app']

export const READ_ONLY: boolean = (() => {
  try {
    if (typeof __VERCEL_ENV__ !== 'undefined' && __VERCEL_ENV__ === 'preview') return true
    const h = location.hostname
    return /\.vercel\.app$/.test(h) && !LIVE_HOSTS.includes(h)
  } catch { return false }
})()

// My settings: changes to your own account still work on the preview.
// whoami is the sign-in check: it only stamps your own "last seen" time (the same thing signing in on the live app does).
const OWN_SETTINGS = new Set(['whoami', 'set_my_prefs', 'set_my_name', 'set_my_phone', 'set_user_lang', 'push_subscribe', 'push_unsubscribe'])

export const PREVIEW_MSG = 'Preview: look only, nothing was saved'

function blocked(url: string, method: string): boolean {
  let u: URL
  try { u = new URL(url, location.href) } catch { return true }
  const p = u.pathname
  if (u.origin === location.origin && p.startsWith('/api/')) return true          // every server function (METRC, QuickBooks, BC, email, push, weather refresh)
  if (/\/auth\/v1\//.test(p)) return false                                         // sign in, sign out, token refresh
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false
  const rpc = p.match(/\/rest\/v1\/rpc\/([a-z0-9_]+)/)
  if (rpc) return !(PREVIEW_READS.has(rpc[1]) || OWN_SETTINGS.has(rpc[1]))
  if (/\/storage\/v1\/object\/sign\//.test(p)) return false                       // signed download links
  if (/\/(rest|storage|functions)\/v1\//.test(p)) return true                     // insert, update, delete, upload, edge functions
  return false                                                                      // other sites (maps, weather icons): untouched
}

let lastToast = 0
function toast() {
  const now = Date.now()
  if (now - lastToast < 1500) return
  lastToast = now
  try {
    const el = document.createElement('div')
    el.className = 'preview-toast'
    el.textContent = PREVIEW_MSG
    document.body.appendChild(el)
    setTimeout(() => el.remove(), 2600)
  } catch { /* no DOM yet */ }
}

/** Installs the guard (preview builds only). Call once, before the app renders. */
export function installPreviewGuard() {
  if (!READ_ONLY) return
  const orig = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (blocked(url, method)) {
      if (!/\/rpc\/(dash_record)\b/.test(url)) toast()   // the dashboard's own background snapshot: blocked quietly
      return new Response(JSON.stringify({ message: PREVIEW_MSG, code: 'PREVIEW', details: null, hint: null }),
        { status: 403, headers: { 'Content-Type': 'application/json' } })
    }
    return orig(input, init)
  }
  // a beacon or a service worker push would go around fetch: switch them off too
  try { navigator.sendBeacon = () => false } catch { /* read-only property on some browsers */ }
  document.documentElement.classList.add('is-preview')
}
