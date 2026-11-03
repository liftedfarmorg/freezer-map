import { useEffect, useState } from 'react'
import type { Backend } from './api'
import type { LinkInfo } from './types'
import './cportal.css'

const clean = () => history.replaceState(null, '', location.pathname)

// signed-out screens share the portal's look (cportal.css): black header with the logo, a white card for the form
function Shell({ title, sub, children, foot }: { title: string; sub?: string; children: React.ReactNode; foot?: React.ReactNode }) {
  useEffect(() => { document.title = 'Lifted Farms Orders' }, [])
  return (
    <div className="cp">
      <div className="cp-col">
        <div className="cp-screen" style={{ paddingBottom: 32 }}>
          <header className="cp-hdr cp-auth-hdr">
            <img className="cp-logo" src="/logo-dark.svg" alt="Lifted Farms" />
            <h1>{title}</h1>
            {sub && <p className="cp-sub">{sub}</p>}
          </header>
          <main className="cp-main cp-lift">
            <section className="cp-card cp-authcard">{children}</section>
            {foot && <p className="cp-meta" style={{ margin: '4px 6px 0', textAlign: 'center' }}>{foot}</p>}
          </main>
        </div>
      </div>
    </div>
  )
}

function PasswordPair({ pw, setPw, pw2, setPw2 }: { pw: string; setPw: (v: string) => void; pw2: string; setPw2: (v: string) => void }) {
  return (
    <>
      <label className="cp-field">Password <span className="cp-meta" style={{ marginTop: -4 }}>8 or more characters</span>
        <input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></label>
      <label className="cp-field">Password again
        <input type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} /></label>
      {pw2.length > 0 && pw !== pw2 && <p className="cp-err" style={{ margin: 0 }}>Passwords don't match</p>}
    </>
  )
}

// the sign-in screen remembers the last email that signed in on this device
const EMAIL_KEY = 'cp-last-email'
const lastEmail = () => { try { return localStorage.getItem(EMAIL_KEY) ?? '' } catch { return '' } }
const rememberEmail = (e: string) => { try { localStorage.setItem(EMAIL_KEY, e.trim().toLowerCase()) } catch { /* private mode */ } }

function SignInForm({ backend, onDone, email0 }: { backend: Backend; onDone: () => void; email0?: string }) {
  const [email, setEmail] = useState(email0 ?? lastEmail())
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null)
    try { await backend.passwordSignIn(email, pw); rememberEmail(email); clean(); onDone() } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }
  return (
    <form className="cp-authform" onSubmit={go}>
      <label className="cp-field">Email
        <input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} autoFocus={!email} /></label>
      <label className="cp-field">Password
        <input type="password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} autoFocus={!!email} /></label>
      {err && <p className="cp-err" style={{ margin: 0 }}>{err}</p>}
      <button className="cp-btn cp-full" disabled={busy || !email || !pw}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  )
}

export function PortalLogin({ backend, onDone }: { backend: Backend; onDone: () => void }) {
  return (
    <Shell title="Customer Portal" sub="Sign in to see your reserves, the open menu, and your orders." foot="New here or forgot your password? Ask your Lifted contact for a link.">
      <SignInForm backend={backend} onDone={onDone} />
    </Shell>
  )
}

// opened from an invite or reset link. An old link is never a dead end: if the login is already set up we show
// sign-in with the email filled in, and if they're already signed in we go straight into the portal.
export function PortalLink({ backend, kind, code, onDone }: { backend: Backend; kind: 'invite' | 'reset'; code: string; onDone: () => void }) {
  const [info, setInfo] = useState<LinkInfo | null | undefined>(undefined)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    (async () => {
      try {
        const [i, signedIn] = await Promise.all([backend.checkLink(code), backend.getUser()])
        const live = i && i.kind === kind && (i.status ?? 'ok') === 'ok'
        // a used or unknown link while already signed in on this device: just open the portal
        if (!live && signedIn) { clean(); onDone(); return }
        setInfo(i && i.kind === kind ? i : i && i.status === 'signin' ? i : null)
      } catch (e) { setErr(String((e as Error).message ?? e)); setInfo(null) }
    })()
  }, [code])

  async function go(e: React.FormEvent) {
    e.preventDefault(); if (!info) return
    setBusy(true); setErr(null)
    try {
      if (kind === 'invite') await backend.claimInvite(code, info.email, pw)
      else { await backend.resetPassword(code, pw); await backend.passwordSignIn(info.email, pw) }
      rememberEmail(info.email); clean(); onDone()
    } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }

  if (info === undefined) return <Shell title="Customer Portal"><p className="cp-meta" style={{ margin: 0 }}>Checking your link…</p></Shell>
  if (info?.status === 'signin') return (
    <Shell title={`Welcome back${info.display_name ? `, ${info.display_name}` : ''}`} sub="Your login is already set up. Sign in with your password."
      foot="Forgot your password? Ask your Lifted contact for a reset link.">
      <SignInForm backend={backend} onDone={onDone} email0={info.email} />
    </Shell>
  )
  if (!info || info.status === 'expired') return (
    <Shell title={info ? 'This invite has expired' : "This link doesn't work"} sub="Ask your Lifted contact for a new one."
      foot="Already set up your login? Sign in with your email and password.">
      <p className="cp-meta" style={{ margin: 0, fontSize: 15 }}>{err ?? (info ? 'Invites last 14 days. Your Lifted contact can send a fresh one in a minute.' : 'It may be incomplete. Try tapping it again, or sign in below.')}</p>
      <button className="cp-btn cp-full" onClick={() => { clean(); onDone() }}>Go to sign in</button>
    </Shell>
  )
  const ok = pw.length >= 8 && pw === pw2
  return (
    <Shell title={kind === 'invite' ? `Welcome${info.display_name ? `, ${info.display_name}` : ''}` : 'Set a new password'}
      sub={kind === 'invite' ? `Set a password for the ${info.customer_name ? info.customer_name + ' ' : ''}customer portal.` : 'Pick a new password for your login.'}
      foot={kind === 'invite' ? 'Next time, just open lifted-orders.app and sign in with this email and password.' : undefined}>
      <form className="cp-authform" onSubmit={go}>
        {/* read-only (not disabled) so the phone's password manager saves the email with the new password */}
        <label className="cp-field">Email<input type="email" name="email" autoComplete="username" value={info.email} readOnly /></label>
        <PasswordPair pw={pw} setPw={setPw} pw2={pw2} setPw2={setPw2} />
        {err && <p className="cp-err" style={{ margin: 0 }}>{err}</p>}
        <button className="cp-btn cp-full" disabled={busy || !ok}>{busy ? 'Saving…' : kind === 'invite' ? 'Create my login' : 'Save password'}</button>
      </form>
    </Shell>
  )
}

// the signed-in portal itself (redesign, 150) lives in cportal.tsx
export { Portal } from './cportal'
