import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import { applyTheme, savedTheme } from './theme'
import { UpdateBanner } from './update'
import { installTabHeader } from './tabid'
import { installPreviewGuard } from './preview'
installPreviewGuard()
installTabHeader()

applyTheme(savedTheme())

// After a new version ships, a phone still running the old page asks for code files that no longer exist
// (catalog/invoice PDFs, the scanner, Production/Nursery). Reload once to get the new version instead of failing.
// A screen opened for the first time after a deploy (a lazy page like Production) fails with "Failed to fetch dynamically
// imported module" without going through vite:preloadError, so the error screen catches it too (Msg R-201, 11/4).
const STALE = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i
function reloadOnce(): boolean {
  let last = 0
  try { last = Number(sessionStorage.getItem('fm.reloadedAt') ?? 0) } catch { /* private */ }
  if (Date.now() - last < 30000) return false       // already tried; let the error show
  try { sessionStorage.setItem('fm.reloadedAt', String(Date.now())) } catch { /* private */ }
  location.reload()
  return true
}
window.addEventListener('vite:preloadError', e => { if (reloadOnce()) e.preventDefault() })
window.addEventListener('unhandledrejection', e => { if (STALE.test(String((e.reason as Error)?.message ?? e.reason ?? ''))) reloadOnce() })

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) { return { err } }
  componentDidCatch(err: Error) { if (STALE.test(String(err?.message ?? ''))) reloadOnce() }
  render() {
    if (!this.state.err) return this.props.children
    if (STALE.test(String(this.state.err.message ?? ''))) return (
      <div className="center">
        <h2>A new version of the app is out</h2>
        <p className="muted">Reload to get it. Nothing you saved is lost.</p>
        <button className="primary" onClick={() => location.reload()}>Reload</button>
      </div>
    )
    return (
      <div className="center">
        <h2>Something went wrong</h2>
        <p className="muted">{this.state.err.message}</p>
        <button className="primary" onClick={() => location.reload()}>Reload</button>
      </div>
    )
  }
}

// 174: the public open menu (lifted-orders.app/menu/<code>): no login, nothing else of the app
const menuCode = /^\/menu\/([A-Za-z0-9]{8,40})\/?$/.exec(location.pathname)?.[1]
const PublicMenu = React.lazy(async () => {
  const [{ PublicMenuPage }, { createClient }] = await Promise.all([import('./openmenu'), import('@supabase/supabase-js')])
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined, key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  const sb = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null
  return { default: () => <PublicMenuPage sb={sb} code={menuCode!} /> }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>{menuCode ? <React.Suspense fallback={null}><PublicMenu /></React.Suspense> : <App />}</ErrorBoundary>
    <UpdateBanner />
  </React.StrictMode>,
)
