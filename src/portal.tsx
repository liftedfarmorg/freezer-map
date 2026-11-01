import { useEffect, useState } from 'react'
import type { Backend } from './api'
import type { LinkInfo } from './types'

const clean = () => history.replaceState(null, '', location.pathname)

function Shell({ children }: { children: React.ReactNode }) {
  useEffect(() => { document.title = 'Lifted Farms Orders' }, [])
  return (
    <div className="center login portal-auth">
      <img className="logo-login logo-l" src="/logo-light.svg" alt="Lifted Farms" /><img className="logo-login logo-d" src="/logo-dark.svg" alt="Lifted Farms" />
      {children}
    </div>
  )
}

function PasswordPair({ pw, setPw, pw2, setPw2 }: { pw: string; setPw: (v: string) => void; pw2: string; setPw2: (v: string) => void }) {
  return (
    <>
      <div className="field"><label>Password <span className="muted">(8+ characters)</span></label>
        <input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></div>
      <div className="field"><label>Password again</label>
        <input type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} /></div>
      {pw2.length > 0 && pw !== pw2 && <div className="warn-t">Passwords don't match</div>}
    </>
  )
}

export function PortalLogin({ backend, onDone }: { backend: Backend; onDone: () => void }) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null)
    try { await backend.passwordSignIn(email, pw); onDone() } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }
  return (
    <Shell>
      <h1>Lifted Farms Orders</h1>
      <form className="authform" onSubmit={go}>
        <div className="field"><label>Email</label>
          <input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} autoFocus /></div>
        <div className="field"><label>Password</label>
          <input type="password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} /></div>
        {err && <div className="warn-t">{err}</div>}
        <button className="primary big" disabled={busy || !email || !pw}>Sign in</button>
      </form>
      <p className="muted">New here or forgot your password? Ask your Lifted contact for a link.</p>
    </Shell>
  )
}

// opened from an invite or reset link
export function PortalLink({ backend, kind, code, onDone }: { backend: Backend; kind: 'invite' | 'reset'; code: string; onDone: () => void }) {
  const [info, setInfo] = useState<LinkInfo | null | undefined>(undefined)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { backend.signOut().then(() => backend.checkLink(code)).then(i => setInfo(i && i.kind === kind ? i : null)).catch(e => { setErr(String(e.message ?? e)); setInfo(null) }) }, [code])

  async function go(e: React.FormEvent) {
    e.preventDefault(); if (!info) return
    setBusy(true); setErr(null)
    try {
      if (kind === 'invite') await backend.claimInvite(code, info.email, pw)
      else { await backend.resetPassword(code, pw); await backend.passwordSignIn(info.email, pw) }
      clean(); onDone()
    } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }

  if (info === undefined) return <Shell><p className="muted">Checking your link…</p></Shell>
  if (!info) return (
    <Shell>
      <h2>This link doesn't work</h2>
      <p className="muted">{err ?? 'It may have expired or already been used.'} Ask your Lifted contact for a new one.</p>
      <button className="ghost" onClick={() => { clean(); onDone() }}>Go to sign in</button>
    </Shell>
  )
  const ok = pw.length >= 8 && pw === pw2
  return (
    <Shell>
      <h1>{kind === 'invite' ? `Welcome${info.display_name ? `, ${info.display_name}` : ''}` : 'Set a new password'}</h1>
      <p className="muted">{kind === 'invite' ? `Set a password for the ${info.customer_name ?? ''} ordering portal.` : 'Pick a new password for your login.'}</p>
      <form className="authform" onSubmit={go}>
        <div className="field"><label>Email</label><input type="email" autoComplete="username" value={info.email} disabled /></div>
        <PasswordPair pw={pw} setPw={setPw} pw2={pw2} setPw2={setPw2} />
        {err && <div className="warn-t">{err}</div>}
        <button className="primary big" disabled={busy || !ok}>{kind === 'invite' ? 'Create my login' : 'Save password'}</button>
      </form>
    </Shell>
  )
}

// the signed-in portal itself (redesign, 150) lives in cportal.tsx
export { Portal } from './cportal'
