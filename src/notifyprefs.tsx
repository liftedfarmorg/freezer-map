import { t } from './i18n'

// 217: which notifications someone gets (types) and how (push / email / text). Used in My settings, the Driver screen
// and Admin › Users (an Admin sets them for someone, e.g. a driver-only login).
export type NotifyPrefs = Record<string, boolean | undefined>
export const NOTIFY_TYPES: [string, string, string][] = [
  ['t_load_assigned', 'Put on a load', 'when you\'re picked as the driver of a load'],
  ['t_load_left', 'Load leaving', 'when a load you drive departs'],
  ['t_delivery', 'Delivery problems', 'a stop that wasn\'t a plain delivery (rejected, not delivered)'],
  ['t_metrc', 'METRC follow-ups', 'manifests to void or rejections to check after a delivery'],
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
