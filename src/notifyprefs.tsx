import { useEffect, useState } from 'react'
import { t } from './i18n'

// 217: which notifications someone gets (types) and how (push / email / text). Used in My settings, the Driver screen
// and Admin › Users (an Admin sets them for someone, e.g. a driver-only login).
export type NotifyPrefs = Record<string, boolean | undefined>
export const NOTIFY_TYPES: [string, string, string][] = [
  ['t_load_assigned', 'Put on a load', 'when you\'re picked as the driver of a load'],
  ['t_load_left', 'Load departed: record your stops', 'when a load you drive leaves, with the link to record each stop'],
  ['t_delivery', 'Delivery problems', 'a stop that wasn\'t a plain delivery (rejected, not delivered)'],
  ['t_metrc', 'METRC follow-ups', 'manifests to void or rejections to check after a delivery'],
  ['t_staging', 'Move back to GVR', 'a GVR pallet staged at OHR whose order was cancelled or isn\'t shipping within 2 days'],
  ['t_acct', 'Accounting flags', 'a credit memo is needed (order cancelled after its invoice)'],
  ['t_other', 'Other alerts', 'everything else for the modules you\'re in'],
]
const CHANNELS: [string, string, boolean][] = [['alerts_push', 'Push', true], ['alerts_email', 'Email', false], ['alerts_text', 'Text', false]]

export function NotifyBox({ nf, onSave, busy, only, phone, notes = true }: { nf: NotifyPrefs; onSave: (x: NotifyPrefs) => void; busy?: boolean; only?: string[]; phone?: string | null; notes?: boolean }) {
  const on = (k: string, dflt: boolean) => nf[k] ?? dflt
  return <div className="notifybox">
    <div className="muted small">{t('How')}</div>
    <div className="row wrap" style={{ gap: 12 }}>{CHANNELS.map(([k, l, d]) => <label key={k} className="check"><input type="checkbox" disabled={busy} checked={on(k, d)} onChange={e => onSave({ [k]: e.target.checked })} /><span>{t(l)}</span></label>)}</div>
    {notes && <p className="muted small">{t('Push needs it turned on for each phone or computer. Email starts once Lifted\'s email sending is connected; texts once texting is connected.')}{phone === null || phone === '' ? ` ${t('Texts need a phone number.')}` : ''}</p>}
    <div className="muted small" style={{ marginTop: 6 }}>{t('What')}</div>
    {NOTIFY_TYPES.filter(([k]) => !only || only.includes(k)).map(([k, l, w]) => <label key={k} className="check"><input type="checkbox" disabled={busy} checked={on(k, true)} onChange={e => onSave({ [k]: e.target.checked })} />
      <span><b>{t(l)}</b> <span className="muted">{t(w)}</span></span></label>)}
  </div>
}

// 224: Admin > Settings > Alerts: extra people per alert type, on top of the module's own people
export function AlertPeopleAll({ sb, flash }: { sb: import('@supabase/supabase-js').SupabaseClient | null; flash: (m: string, bad?: boolean) => void }) {
  const [rows, setRows] = useState<{ kind: string; label: string; who: string; people: string }[] | null>(null)
  const [edit, setEdit] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const load = () => sb?.rpc('alert_people_list').then(({ data, error }) => { if (error) flash(error.message, true); else setRows((data ?? []) as never) })
  useEffect(() => { load() }, [sb])
  if (!sb) return null
  if (!rows) return <p className="muted">Loading…</p>
  return <section className="dcard"><h3>Who gets alerts</h3>
    <p className="muted small">Each alert goes to the people in its module. Add anyone else here (emails, separated by commas). Each person picks push / email and which types they want in My settings; Admins can set it for them in Users.</p>
    {rows.map(r => {
      const v = edit[r.kind] ?? r.people
      return <div key={r.kind} className="field" style={{ marginTop: 10 }}>
        <label><b>{r.label}</b> <span className="muted small">· goes to {r.who}, plus:</span></label>
        <div className="row wrap"><input style={{ minWidth: 320, flex: 1 }} value={v} placeholder="name@lifted-organics.com" onChange={e => setEdit(x => ({ ...x, [r.kind]: e.target.value }))} />
          <button className="primary small" disabled={busy === r.kind || v === r.people} onClick={async () => {
            setBusy(r.kind); const { error } = await sb.rpc('set_alert_people', { p_kind: r.kind, p_emails: v }); setBusy(null)
            if (error) flash(error.message, true); else { flash('Saved'); setEdit(x => { const y = { ...x }; delete y[r.kind]; return y }); load() } }}>Save</button></div>
      </div>
    })}
  </section>
}
