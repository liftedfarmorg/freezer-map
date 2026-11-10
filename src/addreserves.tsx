// Msg RES-1: Sales > Reserves > + Add reserves, a side card like New sales order. Pick a customer (contract, monthly min,
// $/lb, deadline, waiting requests show as chips), then the shared reserve editor (reseditor.tsx, RES-11) that works like
// the portal's Reserves & Menu: filters, +/− step, Change reserve on every row, Save runs set_reserve for each change.
import { useEffect, useState } from 'react'
import type { Backend } from './api'
import type { Customer, CustomerTerms, ReserveRequest, ReserveYears } from './types'
import { ReserveEditor } from './reseditor'

type Flash = (t: string, bad?: boolean) => void
const n0 = (v: number) => Math.round(v).toLocaleString()

export function AddReservesSheet({ backend, customers, flash, onClose, onDone, preset }: {
  backend: Backend; customers: Customer[]; flash: Flash; onClose: () => void; onDone: (customerId: number) => void; preset?: number | null
}) {
  const [cust, setCust] = useState<number | null>(preset ?? null)
  const [cq, setCq] = useState('')
  const [ys, setYs] = useState<ReserveYears | null>(null)
  const [year, setYear] = useState<number | null>(null)
  const [terms, setTerms] = useState<CustomerTerms[]>([])
  const [reqs, setReqs] = useState<ReserveRequest[]>([])
  useEffect(() => {
    backend.reserveYears().then(setYs).catch(() => {})
    backend.listTerms().then(setTerms).catch(() => {})
    backend.listRequests().then(setReqs).catch(() => {})
  }, [])
  const cur = ys?.current ?? new Date().getFullYear()
  const yr = year ?? cur
  const years = [...new Set([cur, ...(ys?.years ?? []).map(y => y.year)])].sort((a, b) => a - b)
  const deadline = ys?.years.find(y => y.year === yr)?.deadline ?? null
  const c = customers.find(x => x.id === cust)
  const t = terms.find(x => x.customer_id === cust && x.crop_year === yr)
  const contractLbs = t?.contract_lbs ?? (yr === cur ? c?.contract_lbs ?? null : null)
  const pend = reqs.filter(r => r.customer_id === cust && r.status === 'pending' && (r.crop_year ?? cur) === yr)

  const cql = cq.trim().toLowerCase()
  const custOpts = customers.filter(x => x.active && x.kind === 'external' && (!cql || x.name.toLowerCase().includes(cql))).sort((a, b) => Number(!!b.reserves_enabled) - Number(!!a.reserves_enabled) || a.name.localeCompare(b.name)).slice(0, 12)
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet form neworder side no2 addres one" onClick={e => e.stopPropagation()}>
        <div className="sheet-h"><h2>Add reserves</h2><button className="ghost" onClick={onClose}>✕</button></div>
        <div className="no-body">
          <div className="no-main">
            <section className="no-sec">
              {!c ? <>
                <div className="no-h">1 · Customer</div>
                <input className="search" type="search" autoFocus placeholder="Type a customer" value={cq} onChange={e => setCq(e.target.value)} aria-label="Customer" />
                <div className="no-copts">{custOpts.map(x => <button key={x.id} onClick={() => { setCust(x.id); setCq('') }}><b>{x.name}</b><span className="muted small">{x.reserves_enabled ? 'reserves on' : 'menu only (reserves off)'}</span></button>)}</div>
              </> : <>
                <div className="row no-cust"><div className="grow"><div className="no-cname">{c.name}</div>
                  <div className="muted small">{yr} crop{c.reserves_enabled ? '' : ' · reserves off'}</div></div>
                  {!preset && <button className="ghost small" onClick={() => setCust(null)}>Change</button>}</div>
                {years.length > 1 && <div className="seg" role="group" aria-label="Crop year">{years.map(y => <button key={y} className={y === yr ? 'on' : ''} onClick={() => setYear(y)}>{y}</button>)}</div>}
                {!c.reserves_enabled && <div className="warnbox">{c.name} is menu only: reserves are off for them. Turn them on in Sales › Customers if they're a contract customer.</div>}
                <div className="no-chips">
                  {contractLbs != null && <span className="pill">Contract {n0(contractLbs)} lbs</span>}
                  {t?.monthly_min_lbs != null && <span className="pill">{n0(t.monthly_min_lbs)} lbs/month min</span>}
                  {(t?.price_per_lb ?? c.price_per_lb) != null && <span className="pill">${Number(t?.price_per_lb ?? c.price_per_lb).toFixed(2)}/lb</span>}
                  {deadline && yr !== cur && <span className="pill">Requests due {new Date(deadline + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}
                  {pend.length > 0 && <span className="pill warnp">{pend.length} reserve request{pend.length === 1 ? '' : 's'} waiting</span>}
                </div>
              </>}
            </section>
            {c && <ReserveEditor key={`${c.id}-${yr}`} backend={backend} cid={c.id} cname={c.name} year={yr} cur={cur} flash={flash} onSaved={() => onDone(c.id)} />}
          </div>
        </div>
      </div>
    </div>
  )
}
