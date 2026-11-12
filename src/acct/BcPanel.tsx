// Accounting > Settings > Business Central (213): the trial copy of invoices into Business Central.
// QuickBooks stays the books. Invoices already in QuickBooks are copied to BC (as drafts unless Post is on).
import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Select } from '../combo'
import { Empty } from '../dash'
import { dfmt, money } from '../docs'
import { useSaved } from '../saved'

type Flash = (t: string, bad?: boolean) => void
const msg = (e: unknown) => String((e as Error)?.message ?? e)
const when = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
const differs = (a: number | null | undefined, b: number | null | undefined) => a != null && b != null && Math.abs(Number(a) - Number(b)) >= 0.01

interface Status { env: string | null; configured: boolean; connected?: boolean; company?: string; error?: string; missing?: string[] }
interface Copy { status: 'draft' | 'posted' | 'error' | 'deleted'; bc_number: string | null; bc_total: number | null; app_total: number | null; note: string | null; error: string | null; sent_by: string | null; sent_at: string; checked_at: string | null }
interface Row { id: number; inv: string; date: string; customer: string; total: number; status: string; qbo: { status: 'sent' | 'error'; total: number | null; doc_number: string | null } | null; bc: Copy | null }
interface MapRow { kind: 'product' | 'class' | 'terms' | 'customer'; key: string; value: string }
interface Config { settings: Record<string, string>; map: MapRow[]; customers: { id: number; name: string; legal_name: string | null; qbo_name: string | null }[]; terms: { code: string; label: string | null }[] }
interface Lists {
  company: string
  items: { number: string; name: string; type: string }[]; accounts: { number: string; name: string; category: string }[]
  dims: { code: string; name: string; values: { code: string; name: string }[] }[]; terms: { code: string; name: string }[]
  customers: { number: string; name: string; blocked: string | null }[]
  matches: {
    product: Record<string, { lineType: string; number: string; label: string; how: string } | null>
    class: Record<string, { dims: { code: string; valueCode: string; how: string }[]; missing: string[] }>
    terms: Record<string, { code: string; displayName: string; how: string } | null>
    customer: Record<string, { number: string; name: string; how: string } | null>
  }
}

class BcApi {
  constructor(private sb: SupabaseClient) {}
  async server<T>(body: object): Promise<T> {
    const { data } = await this.sb.auth.getSession()
    const r = await fetch('/api/bc/run', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({ error: `The server didn't answer (${r.status})` }))
    if (!r.ok) throw new Error(j.error ?? `Error ${r.status}`)
    return j as T
  }
  private async rpc<T>(fn: string, args?: object): Promise<T> { const { data, error } = await this.sb.rpc(fn, args ?? {}); if (error) throw new Error(error.message); return data as T }
  config() { return this.rpc<Config>('bc_config') }
  list(env: string) { return this.rpc<Row[]>('bc_list', { p_env: env }).then(r => r ?? []) }
  save(settings: Record<string, string> | null, map: MapRow[] | null) { return this.rpc<void>('bc_save', { p_settings: settings, p_map: map }) }
  products() { return this.sb.from('acct_products').select('code,name,active').order('sort').then(({ data, error }) => { if (error) throw new Error(error.message); return (data ?? []) as { code: string; name: string; active: boolean }[] }) }
  classes() { return this.sb.from('acct_classes').select('name,active').order('sort').then(({ data, error }) => { if (error) throw new Error(error.message); return (data ?? []) as { name: string; active: boolean }[] }) }
}

export function BcPanel({ sb, flash, canEdit }: { sb: SupabaseClient; flash: Flash; canEdit: boolean }) {
  const api = useMemo(() => new BcApi(sb), [sb])
  const [st, setSt] = useState<Status | null>(null)
  const [cfg, setCfg] = useState<Config | null>(null)
  const [sec, setSec] = useSaved<'invoices' | 'matching' | 'settings'>('acct.BcPanel.BcPanel.sec', 'invoices')
  const [err, setErr] = useState<string | null>(null)
  const loadCfg = () => api.config().then(c => { setCfg(c); setErr(null) }).catch(e => setErr(msg(e)))
  const loadSt = () => api.server<Status>({ action: 'status' }).then(setSt).catch(e => setSt({ env: null, configured: false, error: msg(e) }))
  useEffect(() => { loadSt(); loadCfg() }, [])
  useEffect(() => { if (st && (!st.configured || !st.connected)) setSec('settings') }, [st?.configured, st?.connected])

  if (err) return <div className="warnbox">Couldn't load the Business Central settings. Run 213_business_central.sql in Supabase first. ({err})</div>
  if (!st || !cfg) return <p className="muted">Loading…</p>
  const on = cfg.settings.auto_push === 'true', post = cfg.settings.post === 'true'
  return (
    <div className="dlist">
      <p>Business Central environment: <b>{st.env ?? 'not set'}</b>{st.company ? <> · company <b>{st.company}</b></> : null}{' '}
        <span className={`pill ${post ? 'acct-error' : 'warnp'}`}>{post ? 'POSTS INVOICES' : 'DRAFTS ONLY'}</span>{' '}
        <span className={`pill ${on ? 'acct-sent' : 'acct-pending'}`}>{on ? 'COPYING' : 'COPYING OFF'}</span></p>
      {!st.configured ? <div className="warnbox">Not set up in Vercel yet. Missing: {(st.missing ?? []).join(', ')}. Add them in Vercel › Settings › Environment Variables, then redeploy.</div>
        : st.connected ? <p className="ok-t">✓ Connected</p> : <div className="warnbox">Can't reach Business Central: {st.error}</div>}
      <div className="seg tabs">{([['invoices', 'Invoices'], ['matching', 'Matching'], ['settings', 'Settings']] as const).map(([k, l]) => <button key={k} className={sec === k ? 'on' : ''} onClick={() => setSec(k)}>{l}</button>)}</div>
      {sec === 'invoices' && st.env && <Invoices api={api} env={st.env} flash={flash} canEdit={canEdit && !!st.connected} />}
      {sec === 'invoices' && !st.env && <Empty>Set BC_ENVIRONMENT in Vercel first.</Empty>}
      {sec === 'matching' && <Matching api={api} cfg={cfg} flash={flash} connected={!!st.connected} reload={loadCfg} />}
      {sec === 'settings' && <Settings api={api} cfg={cfg} st={st} flash={flash} reload={() => { loadSt(); loadCfg() }} />}
    </div>
  )
}

// ---------- the invoices: QuickBooks and Business Central side by side ----------
function Invoices({ api, env, flash, canEdit }: { api: BcApi; env: string; flash: Flash; canEdit: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [f, setF] = useSaved<'all' | 'waiting' | 'problems' | 'inbc' | 'differs'>('acct.BcPanel.Invoices.f', 'all')
  const [busy, setBusy] = useState<string | null>(null)
  const [q, setQ] = useSaved('acct.BcPanel.Invoices.q', '')
  const load = () => api.list(env).then(setRows).catch(e => flash(msg(e), true))
  useEffect(() => { load() }, [env])
  if (!rows) return <p className="muted">Loading…</p>
  const inQbo = (r: Row) => r.qbo?.status === 'sent'
  const waiting = (r: Row) => inQbo(r) && r.status !== 'void' && (!r.bc || r.bc.status === 'error')
  const problem = (r: Row) => r.bc?.status === 'error' || r.bc?.status === 'deleted' || !!r.bc?.note
  const inBc = (r: Row) => r.bc?.status === 'draft' || r.bc?.status === 'posted'
  const diff = (r: Row) => inBc(r) && (differs(r.bc?.bc_total, r.total) || (inQbo(r) && differs(r.bc?.bc_total, r.qbo?.total)))
  const test = { all: () => true, waiting, problems: problem, inbc: inBc, differs: diff }[f]
  const ql = q.trim().toLowerCase()
  const shown = rows.filter(r => test(r) && (!ql || `${r.inv} ${r.customer} ${r.bc?.bc_number ?? ''}`.toLowerCase().includes(ql)))
  const act = async (label: string, fn: () => Promise<void>) => { setBusy(label); try { await fn() } catch (e) { flash(msg(e), true) } finally { setBusy(null); load() } }
  const sendOne = (r: Row, resend: boolean) => {
    if (resend && !confirm(`Send ${r.inv} again? The draft in Business Central (${r.bc?.bc_number ?? ''}) is deleted and a new one is made from the app.`)) return
    act(`send${r.id}`, async () => {
      const x = await api.server<{ mode: string; status: string; number: string; note: string | null }>({ action: 'send', invoice_id: r.id, resend })
      flash(`${r.inv} ${x.mode === 'linked' ? 'linked to' : x.mode === 'replaced' ? 'replaced in Business Central as' : 'copied to Business Central as'} ${x.number} (${x.status})${x.note ? ` · ${x.note}` : ''}`)
    })
  }
  const count = (t: (r: Row) => boolean) => rows.filter(t).length
  return (
    <div>
      <p className="muted small">Invoices on or after the start date. Each one is copied to Business Central once it's in QuickBooks. QuickBooks stays the books: payments and balances still come from QuickBooks.</p>
      <div className="row wrap">
        {canEdit && <button className="primary small" disabled={!!busy || !count(waiting)} onClick={() => act('due', async () => {
          const r = await api.server<{ due: number; sent: number; failed: number }>({ action: 'send_due' })
          flash(r.due ? `${r.sent} copied${r.failed ? `, ${r.failed} with a problem` : ''}${r.due > r.sent + r.failed ? ` · ${r.due - r.sent - r.failed} left: click again` : ''}` : 'Nothing waiting', r.failed > 0)
        })}>{busy === 'due' ? 'Copying…' : `Send waiting now (${count(waiting)})`}</button>}
        <button className="ghost small" disabled={!!busy} onClick={() => act('check', async () => {
          const r = await api.server<{ checked: number; posted?: number; deleted?: number }>({ action: 'check' })
          flash(`Checked ${r.checked} in Business Central${r.posted ? ` · ${r.posted} posted` : ''}${r.deleted ? ` · ${r.deleted} not found there any more` : ''}`)
        })}>{busy === 'check' ? 'Checking…' : 'Check Business Central'}</button>
      </div>
      <div className="row toolbar wrap">
        <div className="seg">{([['all', 'All'], ['waiting', 'Waiting'], ['problems', 'Problems'], ['inbc', 'In BC'], ['differs', 'Totals differ']] as const).map(([k, l]) =>
          <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l} ({count({ all: () => true, waiting, problems: problem, inbc: inBc, differs: diff }[k])})</button>)}</div>
        <input className="search" type="search" placeholder="Invoice #, customer" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      {!shown.length ? <Empty>None here.</Empty> : (
        <div className="tablewrap"><table className="restable">
          <thead><tr><th>Invoice</th><th>Customer</th><th className="num">App</th><th className="num">QuickBooks</th><th>Business Central</th><th /></tr></thead>
          <tbody>{shown.map(r => {
            const b = r.bc
            const bad = diff(r)
            return (
              <tr key={r.id}>
                <td><b>{r.inv}</b><div className="muted small">{dfmt(r.date)}{r.status === 'void' ? ' · void' : ''}</div></td>
                <td>{r.customer}</td>
                <td className="num">{money(r.total)}</td>
                <td className="num">{inQbo(r) ? money(Number(r.qbo?.total ?? r.total)) : <span className="muted small">{r.qbo?.status === 'error' ? 'error' : 'not yet'}</span>}</td>
                <td>
                  {!b ? <span className={`pill ${inQbo(r) ? 'acct-pending' : 'inv-void'}`}>{inQbo(r) ? 'Waiting' : 'After QuickBooks'}</span> : <>
                    <span className={`pill ${b.status === 'posted' ? 'acct-sent' : b.status === 'draft' ? 'inv-open' : b.status === 'error' ? 'acct-error' : 'inv-void'}`}>
                      {b.status === 'posted' ? 'Posted' : b.status === 'draft' ? 'Draft' : b.status === 'error' ? 'Problem' : 'Deleted in BC'}</span>
                    {b.bc_number && <> <b>{b.bc_number}</b></>}
                    {b.bc_total != null && <> · <span className={bad ? 'bad-t' : ''}>{money(Number(b.bc_total))}</span></>}
                    {b.error && <div className="bad-t small">{b.error}</div>}
                    {b.note && <div className="warn-t small">{b.note}</div>}
                    <div className="muted small">{when(b.sent_at)}{b.sent_by ? ` · ${b.sent_by.split('@')[0]}` : ''}</div>
                  </>}
                </td>
                <td className="nowrap">{canEdit && inQbo(r) && r.status !== 'void' && (!b || b.status === 'error' || b.status === 'deleted') &&
                    <button className="ghost small" disabled={!!busy} onClick={() => sendOne(r, false)}>{busy === `send${r.id}` ? 'Copying…' : b ? 'Try again' : 'Send'}</button>}
                  {canEdit && b?.status === 'draft' && <button className="ghost small" disabled={!!busy} onClick={() => sendOne(r, true)}>{busy === `send${r.id}` ? 'Copying…' : 'Send again'}</button>}</td>
              </tr>)
          })}</tbody>
        </table></div>)}
    </div>
  )
}

// ---------- matching: app products, classes, payment terms and customers to Business Central ----------
function Matching({ api, cfg, flash, connected, reload }: { api: BcApi; cfg: Config; flash: Flash; connected: boolean; reload: () => Promise<void> }) {
  const [L, setL] = useState<Lists | null>(null)
  const [products, setProducts] = useState<{ code: string; name: string; active: boolean }[]>([])
  const [classes, setClasses] = useState<{ name: string; active: boolean }[]>([])
  const [ed, setEd] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [lerr, setLerr] = useState<string | null>(null)
  const saved = useMemo(() => new Map(cfg.map.map(r => [`${r.kind}|${r.key}`, r.value])), [cfg])
  const load = () => {
    setLerr(null)
    return Promise.all([api.server<Lists>({ action: 'lists' }), api.products(), api.classes()])
      .then(([l, p, c]) => { setL(l); setProducts(p.filter(x => x.active)); setClasses(c.filter(x => x.active)) })
      .catch(e => setLerr(msg(e)))
  }
  useEffect(() => { if (connected) load() }, [connected])
  if (!connected) return <Empty>Connect Business Central first (Settings).</Empty>
  if (lerr) return <div className="warnbox">Couldn't read Business Central: {lerr} <button className="linkbtn" onClick={load}>Try again</button></div>
  if (!L) return <p className="muted">Reading items, dimensions, payment terms and customers from Business Central…</p>
  const dims = String(cfg.settings.class_dims || '').split(',').map(x => x.trim()).filter(Boolean)
  const val = (k: string) => ed[k] ?? saved.get(k) ?? ''
  const set = (k: string, v: string) => setEd({ ...ed, [k]: v })
  const changed = Object.entries(ed).filter(([k, v]) => (saved.get(k) ?? '') !== v)
  async function save() {
    setBusy(true)
    try {
      await api.save(null, changed.map(([k, v]) => { const [kind, ...rest] = k.split('|'); return { kind: kind as MapRow['kind'], key: rest.join('|'), value: v } }))
      await reload(); setEd({}); await load(); flash('Matches saved')
    } catch (e) { flash(msg(e), true) } finally { setBusy(false) }
  }
  const prodOpts = [...L.items.map(i => ({ v: `item:${i.number}`, l: `Item ${i.number} · ${i.name}` })), ...L.accounts.map(a => ({ v: `account:${a.number}`, l: `G/L ${a.number} · ${a.name}${a.category ? ` (${a.category})` : ''}` }))]
  const custs = cfg.customers.map(c => ({ ...c, m: L.matches.customer[c.id] }))
  const unmatched = custs.filter(c => !c.m)
  return (
    <div>
      <p className="muted small">Anything left on "Same name" is matched by name each time (items by name, dimension values by name or code, customers by their QuickBooks name). Pick one to override it. Invoices with anything unmatched aren't copied and show as a problem.</p>
      <h3>Products</h3>
      <p className="muted small">Each app product goes to a Business Central item, or a G/L account (discount, return and refund lines post more simply to a G/L account if BC turns down negative item lines).</p>
      <div className="tablewrap"><table className="restable">
        <thead><tr><th>App product</th><th>Business Central</th></tr></thead>
        <tbody>{products.map(p => { const k = `product|${p.code}`, auto = L.matches.product[p.code]; return (
          <tr key={p.code}><td><b>{p.name}</b></td><td>
            <Select value={val(k)} onChange={e => set(k, e.target.value)}>
              <option value="">{`Same name${auto && auto.how === 'name' ? `: ${auto.label}` : ' (none found)'}`}</option>
              {prodOpts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </Select>{!auto && !val(k) && <div className="bad-t small">Not matched</div>}</td></tr>) })}</tbody>
      </table></div>

      <h3>Classes</h3>
      {!dims.length ? <div className="warnbox">Classes aren't copied yet: pick the dimension(s) they go to in Settings first.</div> : (
        <div className="tablewrap"><table className="restable">
          <thead><tr><th>App class</th>{dims.map(d => <th key={d}>{d}</th>)}</tr></thead>
          <tbody>{classes.map(c => { const m = L.matches.class[c.name]; return (
            <tr key={c.name}><td><b>{c.name}</b></td>{dims.map(d => {
              const dim = L.dims.find(x => x.code.toUpperCase() === d.toUpperCase()), k = `class|${c.name}|${dim?.code ?? d}`
              const auto = m?.dims.find(x => x.code.toUpperCase() === d.toUpperCase())
              return <td key={d}>{!dim ? <span className="bad-t small">No dimension {d} in BC</span> : <>
                <Select value={val(k)} onChange={e => set(k, e.target.value)}>
                  <option value="">{`Same name${auto && auto.how === 'name' ? `: ${auto.valueCode}` : ' (none found)'}`}</option>
                  {dim.values.map(v => <option key={v.code} value={v.code}>{v.code} · {v.name}</option>)}
                </Select>{!auto && !val(k) && <div className="bad-t small">Not matched</div>}</>}</td>
            })}</tr>) })}</tbody>
        </table></div>)}

      <h3>Payment terms</h3>
      <p className="muted small">Unmatched terms aren't a problem: Business Central uses the customer's terms, and the app's due date is set on the invoice.</p>
      {!cfg.terms.length ? <Empty>No terms on recent invoices.</Empty> : (
        <div className="tablewrap"><table className="restable">
          <thead><tr><th>App terms</th><th>Business Central</th></tr></thead>
          <tbody>{cfg.terms.map(t => { const k = `terms|${t.code}`, auto = L.matches.terms[t.code]; return (
            <tr key={t.code}><td><b>{t.label ?? t.code}</b> <span className="muted small">{t.code}</span></td><td>
              <Select value={val(k)} onChange={e => set(k, e.target.value)}>
                <option value="">{`Same name${auto && auto.how === 'name' ? `: ${auto.code}` : ' (none found: customer\'s terms)'}`}</option>
                {L.terms.map(x => <option key={x.code} value={x.code}>{x.code} · {x.name}</option>)}
              </Select></td></tr>) })}</tbody>
        </table></div>)}

      <h3>Customers {unmatched.length > 0 && <span className="pill acct-error">{unmatched.length} not matched</span>}</h3>
      <p className="muted small">Customers on invoices since the start date. Matched by their QuickBooks name, then legal name, then app name. Unmatched ones are listed first.</p>
      <div className="tablewrap"><table className="restable">
        <thead><tr><th>App customer</th><th>Business Central</th></tr></thead>
        <tbody>{[...unmatched, ...custs.filter(c => c.m)].map(c => { const k = `customer|${c.id}`; return (
          <tr key={c.id}><td><b>{c.name}</b>{c.qbo_name && c.qbo_name !== c.name && <div className="muted small">QuickBooks: {c.qbo_name}</div>}</td><td>
            <Select value={val(k)} onChange={e => set(k, e.target.value)}>
              <option value="">{`Same name${c.m && c.m.how === 'name' ? `: ${c.m.number} · ${c.m.name}` : ' (none found)'}`}</option>
              {L.customers.map(x => <option key={x.number} value={x.number}>{x.number} · {x.name}{x.blocked && x.blocked.trim() ? ` (blocked: ${x.blocked})` : ''}</option>)}
            </Select>{!c.m && !val(k) && <div className="bad-t small">Not matched</div>}</td></tr>) })}</tbody>
      </table></div>
      <div className="row wrap">
        <button className="primary" disabled={busy || !changed.length} onClick={save}>{busy ? 'Saving…' : changed.length ? `Save ${changed.length} match${changed.length === 1 ? '' : 'es'}` : 'Saved'}</button>
        {changed.length > 0 && <button className="ghost" onClick={() => setEd({})}>Undo changes</button>}
        <button className="ghost" disabled={busy} onClick={() => { setL(null); load() }}>Read Business Central again</button>
      </div>
    </div>
  )
}

// ---------- settings ----------
function Settings({ api, cfg, st, flash, reload }: { api: BcApi; cfg: Config; st: Status; flash: Flash; reload: () => void }) {
  const s = cfg.settings
  const [start, setStart] = useState(s.start_date ?? '')
  const [dims, setDims] = useState<string[]>(String(s.class_dims || '').split(',').map(x => x.trim()).filter(Boolean))
  const [all, setAll] = useState<{ code: string; name: string; values: number }[] | null>(null)
  const [test, setTest] = useState<{ company: string; customers: number; items: number; accounts: number; terms: number; dims: { code: string; name: string; values: number }[] } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const act = async (label: string, fn: () => Promise<void>) => { setBusy(label); try { await fn() } catch (e) { flash(msg(e), true) } finally { setBusy(null) } }
  const saveOne = (k: string, v: string, done: string) => act(k, async () => { await api.save({ [k]: v }, null); reload(); flash(done) })
  const on = s.auto_push === 'true', post = s.post === 'true', nums = s.use_app_numbers === 'true'
  const runTest = () => act('test', async () => { const t = await api.server<NonNullable<typeof test>>({ action: 'test' }); setTest(t); setAll(t.dims); reload(); flash(`Connected to ${t.company}`) })
  useEffect(() => { if (st.connected && !all) api.server<NonNullable<typeof test>>({ action: 'test' }).then(t => { setTest(t); setAll(t.dims) }).catch(() => {}) }, [st.connected])
  const dimsChanged = dims.join(',') !== String(s.class_dims || '').split(',').map(x => x.trim()).filter(Boolean).join(',')
  return (
    <div>
      <h3>Connection</h3>
      <div className="row wrap"><button className="primary small" disabled={!!busy || !st.configured} onClick={runTest}>{busy === 'test' ? 'Testing…' : 'Test connection'}</button></div>
      {test && <p className="ok-t small">✓ {test.company}: {test.customers} customers, {test.items} items, {test.accounts} G/L accounts, {test.terms} payment terms, {test.dims.length} dimensions.</p>}

      <h3>Copy automatically</h3>
      <p>{on ? <b className="ok-t">On</b> : <b className="bad-t">Off</b>} · {on ? 'every 10 minutes, invoices in QuickBooks since the start date are copied to Business Central.' : 'nothing is copied on its own. Use Send waiting now on Invoices, or Send on one invoice.'}</p>
      <div className="row wrap"><button className={on ? 'ghost' : 'primary'} disabled={!!busy || !st.connected}
        onClick={() => { if (confirm(on ? 'Stop copying invoices to Business Central automatically?' : `Copy invoices to Business Central automatically? Invoices in QuickBooks dated ${dfmt(s.start_date)} or later go within 10 minutes, ${post ? 'and they are POSTED.' : 'as drafts.'}`)) saveOne('auto_push', on ? 'false' : 'true', on ? 'Copying is off' : 'Copying is on') }}>
        {busy === 'auto_push' ? 'Saving…' : on ? 'Turn copying off' : 'Turn copying on'}</button></div>

      <h3>Start date</h3>
      <p className="muted small">Invoices dated on or after this are copied. Move it earlier to backfill; they go 25 at a time.</p>
      <div className="row wrap"><input type="date" value={start} onChange={e => setStart(e.target.value)} />
        <button className="ghost small" disabled={!!busy || !start || start === s.start_date} onClick={() => saveOne('start_date', start, 'Start date saved')}>Save</button></div>

      <h3>Post in Business Central</h3>
      <p>{post ? <b className="bad-t">On</b> : <b className="ok-t">Off (drafts only)</b>} · {post
        ? 'copies are posted. Posted invoices are permanent in Business Central and can only be reversed with a credit memo.'
        : 'copies stay as unposted drafts you can check, delete or send again. Recommended until you\'re sure which environment becomes your real books.'}</p>
      <div className="row wrap"><button className="ghost small" disabled={!!busy} onClick={() => {
        if (confirm(post ? 'Go back to drafts only? Invoices already posted stay posted.' : `Post copies in Business Central (${st.env})? Posted invoices are permanent there and can only be reversed with credit memos. Only do this in an environment you're happy to have test entries in.`))
          saveOne('post', post ? 'false' : 'true', post ? 'Drafts only' : 'Copies will be posted')
      }}>{busy === 'post' ? 'Saving…' : post ? 'Drafts only' : 'Post copies'}</button></div>

      <h3>Invoice numbers</h3>
      <p className="muted small">The app's invoice number always goes in External Document No. {nums ? 'It\'s also used as the BC invoice number (the BC number series needs Manual Nos. turned on).' : 'Business Central numbers the invoice from its own series.'}</p>
      <label className="check"><input type="checkbox" checked={nums} disabled={!!busy} onChange={e => saveOne('use_app_numbers', e.target.checked ? 'true' : 'false', 'Saved')} /> Use the app's invoice number as the Business Central number</label>

      <h3>Dimensions for classes</h3>
      <p className="muted small">Business Central has no classes. Each invoice line's class goes to the dimension(s) ticked here; match the values on Matching.</p>
      {!all ? <p className="muted small">{st.connected ? 'Reading dimensions…' : 'Connect first.'}</p> : <>
        {all.map(d => <label key={d.code} className="check"><input type="checkbox" checked={dims.some(x => x.toUpperCase() === d.code.toUpperCase())}
          onChange={e => setDims(e.target.checked ? [...dims, d.code] : dims.filter(x => x.toUpperCase() !== d.code.toUpperCase()))} /> <b>{d.code}</b> {d.name} <span className="muted small">({d.values} values)</span></label>)}
        {!all.length && <Empty>No dimensions in this company.</Empty>}
        <div className="row wrap"><button className="ghost small" disabled={!!busy || !dimsChanged} onClick={() => saveOne('class_dims', dims.join(','), 'Saved')}>Save dimensions</button></div>
      </>}

      <h3>How it works</h3>
      <ul className="muted small">
        <li>QuickBooks stays the books. Nothing here changes how invoices go to QuickBooks, lock, or get paid.</li>
        <li>An invoice is copied only once it's in QuickBooks, so Business Central gets final invoices you can tie out on Invoices.</li>
        <li>The app's invoice number goes in External Document No. Before making anything, the app looks for that number in Business Central and links instead of making a second one.</li>
        <li>If anything doesn't match (customer, product, class), nothing is made and the invoice shows as a problem. It tries again every hour, or click Try again after fixing the match.</li>
        <li>Changed in QuickBooks after it was copied? Business Central doesn't follow. Use Send again for a draft; fix a posted one in Business Central.</li>
        <li>The Business Central login lives in Vercel (BC_TENANT_ID, BC_CLIENT_ID, BC_CLIENT_SECRET, BC_ENVIRONMENT, BC_COMPANY). Nobody can read it from the app.</li>
      </ul>
    </div>
  )
}
