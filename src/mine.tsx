import { useEffect, useState } from 'react'
import type { Backend } from './api'
import { MODULES } from './types'
import type { Me, ModKey, Prefs, Site } from './types'
import { applyTheme } from './theme'
import { LANGS, lang, t } from './i18n'
import { kickNotify, pushOff, pushOn, pushState } from './push'
import { NotifyBox } from './notifyprefs'
import type { PushState } from './push'

/** Top bar ⚙: your own settings. Nothing here changes anyone else's view. */
export function MySettings({ backend, me, flash, onSaved }: { backend: Backend; me: Me; flash: (t: string, bad?: boolean) => void; onSaved: (p: Prefs, name: string | null) => void }) {
  const p = me.access.prefs ?? {}
  const [name, setName] = useState(me.display_name ?? '')
  const [busy, setBusy] = useState(false)
  // your phone (SQL 200): goes on METRC manifests when you drive
  const [phone, setPhone] = useState(''), [phone0, setPhone0] = useState('')
  useEffect(() => { backend.myPhone().then(x => { setPhone(x ?? ''); setPhone0(x ?? '') }).catch(() => {}) }, [backend])
  const savePhone = async () => {
    setBusy(true)
    try { await backend.setMyPhone(phone); setPhone0(phone.trim()); flash(t('Phone saved')) }
    catch (e) { flash(String((e as Error).message ?? e), true) } finally { setBusy(false) }
  }
  const mine = MODULES.filter(m => me.access.modules[m.key])
  const lv = me.access.modules
  async function savePref(x: Prefs, msg = 'Saved') {
    msg = t(msg)
    setBusy(true)
    try { const out = await backend.setMyPrefs(x); onSaved(out, null); flash(msg) }
    catch (e) { flash(String((e as Error).message ?? e), true) } finally { setBusy(false) }
  }
  async function saveName() {
    setBusy(true)
    try { await backend.setMyName(name); onSaved(p, name.trim() || null); flash(t('Name saved')) }
    catch (e) { flash(String((e as Error).message ?? e), true) } finally { setBusy(false) }
  }
  const seg = <T extends string>(val: T | undefined, opts: [T, string][], on: (v: T) => void) => (
    <div className="seg">{opts.map(([v, l]) => <button key={v} disabled={busy} className={val === v ? 'on' : ''} onClick={() => on(v)}>{l}</button>)}</div>
  )
  return (
    <div className="list mine">
      <h2>{t('My settings')}</h2>
      <p className="muted">{t('Just for you. Signed in as {e}', { e: me.real_email ?? me.email })}{me.viewing_as ? ` (${t('viewing as {e}: changes are off', { e: me.email })})` : ''}.</p>

      <section className="dcard"><h3>{t('Name')}</h3>
        <div className="row"><input value={name} placeholder={t('What the app shows')} onChange={e => setName(e.target.value)} />
          <button className="primary small" disabled={busy || name.trim() === (me.display_name ?? '')} onClick={saveName}>{t('Save')}</button></div>
        <p className="muted">{t('Shows on your activity and in the top bar.')}</p></section>

      <section className="dcard"><h3>{t('Phone')}</h3>
        <div className="row"><input type="tel" value={phone} placeholder="831-555-0100" onChange={e => setPhone(e.target.value)} />
          <button className="primary small" disabled={busy || phone.trim() === phone0} onClick={savePhone}>{t('Save')}</button></div>
        <p className="muted">{t('So people in the app can reach you.')}</p></section>

      <section className="dcard"><h3>{lang() === 'es' ? 'Idioma · Language' : 'Language · Idioma'}</h3>
        {seg(p.lang ?? 'en', LANGS, v => savePref({ lang: v }, v === 'es' ? 'Idioma: español' : 'Language: English'))}
        <p className="muted">{t('Screens show in this language. An Admin can also set it for you.')}</p></section>

      <section className="dcard"><h3>{t('Look')}</h3>
        {seg(p.theme ?? 'system', [['system', t('Match device')], ['light', t('Light')], ['dark', t('Dark')]], v => { applyTheme(v); savePref({ theme: v }, 'Theme saved') })}
      </section>

      <section className="dcard"><h3>{t('When the app opens')}</h3>
        {mine.length > 1 && <div className="field"><label>{t('Start in')}</label>
          {seg(p.start_module ?? '' as ModKey, [['' as ModKey, t('Where I left off')], ...mine.map(m => [m.key, t(m.label)] as [ModKey, string])], v => savePref({ start_module: (v || null) as unknown as ModKey }))}</div>}
        {lv.distribution && <div className="field"><label>{t('Freezer site')}</label>
          {seg(p.start_site ?? 'OHR' as Site, [['OHR', 'OHR'], ['GVR', 'GVR']], v => savePref({ start_site: v }))}</div>}
      </section>

      <NotifySection backend={backend} p={p} busy={busy} savePref={savePref} phone={phone0} />

      {lv.sales && <section className="dcard"><h3>{t('Emails')}</h3>
        {lv.sales === 'admin' && <label className="check"><input type="checkbox" disabled={busy} checked={p.notify?.requests !== false}
          onChange={e => savePref({ notify: { ...p.notify, requests: e.target.checked } })} /><span><b>{t('Reserve requests')}</b> <span className="muted">{t('when a customer asks to change a reserve')}</span></span></label>}
        <label className="check"><input type="checkbox" disabled={busy} checked={p.notify?.orders !== false}
          onChange={e => savePref({ notify: { ...p.notify, orders: e.target.checked } })} /><span><b>{t('New orders')}</b> <span className="muted">{t('when a customer places an order in the portal')}</span></span></label>
      </section>}

      {(me.access.owner || lv.compliance === 'admin') && <section className="dcard"><h3>{t('METRC emails')}</h3>
        <label className="check"><input type="checkbox" disabled={busy} checked={p.notify?.metrc_pull === true}
          onChange={e => savePref({ notify: { ...p.notify, metrc_pull: e.target.checked } })} /><span><b>{t('METRC pull problems')}</b> <span className="muted">{t("when a license's nightly METRC pull doesn't finish")}</span></span></label>
      </section>}

      <section className="dcard"><h3>{t('What you can use')}</h3>
        {me.access.owner ? <p>{t('Owner: every module, as Admin.')}</p> : mine.length ? <div className="dlist">{mine.map(m => (
          <div key={m.key} className="drow"><span><b>{t(m.label)}</b><span className="muted"> · {lv[m.key] === 'admin' && m.key !== 'admin' ? `${t(m.user)} ${t(m.admin)}` : t(m.user)}</span></span><span className="pill">{t(m.key === 'admin' ? 'On' : lv[m.key] === 'admin' ? 'Admin' : lv[m.key] === 'view' ? 'View only' : 'User')}</span></div>))}</div>
          : <p className="muted">{t('Nothing yet.')}</p>}
        <p className="muted">{t('Ask someone with the Admin module if you need more.')}</p>
      </section>
    </div>
  )
}

/** 216: alerts (deliveries, your loads, your modules' alerts) by push, email or text */
function NotifySection({ backend, p, busy, savePref, phone }: { backend: Backend; p: Prefs; busy: boolean; savePref: (x: Prefs, msg?: string) => Promise<void>; phone: string }) {
  const [st, setSt] = useState<PushState | null>(null)
  const [work, setWork] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { pushState().then(setSt).catch(() => setSt('unsupported')) }, [])
  const sb = backend.client()
  const nf = (p.notify ?? {}) as Record<string, boolean | undefined>
  const [testMsg, setTestMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  // Msg FB-11: send a test push to every device this person has turned on, then say whether Apple / Google took it
  async function testPush() {
    if (!sb) return
    setWork(true); setTestMsg({ text: t('Sending…') })
    try {
      const { data, error } = await sb.rpc('send_test_push')
      if (error) throw new Error(/send_test_push|schema cache/i.test(error.message) ? 'The test needs SQL 347 run first.' : error.message)
      const { id, devices } = data as { id: number; devices: number }
      kickNotify(sb)
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, i < 4 ? 1500 : 3000))
        const r = await sb.rpc('push_test_result', { p_id: id })
        const x = r.data as { sent: boolean; tries: number; error: string | null } | null
        if (x?.sent) { setTestMsg({ text: devices === 1 ? t('Sent. It should show up on your device now.') : t('Sent to your {n} devices. It should show up now.', { n: devices }) }); return }
        if (x && x.tries > 0 && x.error) { setTestMsg({ text: t("Didn't go through: {e}. Turn notifications off and on again on this device.", { e: x.error }), bad: true }); return }
      }
      setTestMsg({ text: t('Still waiting to send. It goes out within a minute; if nothing shows up, turn notifications off and on again.') })
    } catch (e) { setTestMsg({ text: (e as Error).message, bad: true }) } finally { setWork(false) }
  }
  async function toggle() {
    if (!sb) return
    setWork(true); setMsg(null)
    try { if (st === 'on') { await pushOff(sb); setSt('off') } else { await pushOn(sb); setSt('on') } }
    catch (e) { setMsg((e as Error).message) } finally { setWork(false) }
  }
  return <section className="dcard"><h3>{t('Notifications')}</h3>
    <p className="muted">{t('Delivery alerts, the loads you drive, and alerts for the modules you run.')}</p>
    <div className="field"><label>{t('Push on this device')}</label>
      {st === 'ios_needs_home' ? <p className="muted small">{t('To get notifications on iPhone: tap Share, then Add to Home Screen, and open Lifted from the Home Screen.')}</p>
        : st === 'unsupported' ? <p className="muted small">{t("This browser can't show notifications.")}</p>
        : st === 'blocked' ? <p className="warn-t small">{t('Notifications are blocked for this site. Allow them in the browser or phone settings.')}</p>
        : <div className="row"><button className={st === 'on' ? 'ghost small' : 'primary small'} disabled={work || !st} onClick={toggle}>{st === 'on' ? t('Turn off on this device') : t('Turn on notifications')}</button>
            {st === 'on' && <span className="muted small">{t('On for this device')}</span>}
            {st === 'on' && <button className="ghost small" disabled={work} onClick={testPush}>{t('Send me a test push')}</button>}</div>}
      {testMsg && <p className={testMsg.bad ? 'neg small' : 'muted small'}>{testMsg.text}</p>}
      {msg && <p className="neg small">{msg}</p>}</div>
    <NotifyBox nf={nf} busy={busy} phone={phone} onSave={x => savePref({ notify: { ...p.notify, ...x } })} />
  </section>
}
