// Msg 296: short lists people pick from, kept in app_settings as a JSON array.
// Sales › Product categories (what a customer buys) and Cultivation / Nursery › Nurseries (where a strain comes from).
import { useEffect, useState } from 'react'
import type { Backend } from './api'

export const PRODUCT_CATEGORIES_KEY = 'sales.product_categories'
export const NURSERIES_KEY = 'grow.nurseries'
export const DEFAULT_CATEGORIES = ['Fresh Frozen', 'Standards', 'Trim', 'Smalls', 'Hash', 'Rosin', 'Liquid Live Resin', 'Distillate']
export const DEFAULT_NURSERIES = ['1PN', 'Refined Genetics', 'Haze Valley Nursery']

const parse = (v: string | undefined, dflt: string[]) => { try { const a = JSON.parse(v ?? ''); return Array.isArray(a) && a.every(x => typeof x === 'string') ? a as string[] : dflt } catch { return dflt } }

/** the list (falls back to the starting list until it's saved once) */
export function useCatList(backend: Backend, key: string, dflt: string[]) {
  const [list, setList] = useState<string[]>(dflt)
  const reload = () => backend.appSettings().then(s => setList(parse(s[key], dflt))).catch(() => {})
  useEffect(() => { reload() }, [key])
  return { list, setList, reload }
}

/** the settings panel: add, rename, move up, remove; shows how many records use each */
export function CatListPanel({ backend, k, dflt, title, intro, noun, canEdit, flash, usedBy }: {
  backend: Backend; k: string; dflt: string[]; title: string; intro: string; noun: string; canEdit: boolean
  flash: (m: string, bad?: boolean) => void; usedBy?: (name: string) => number
}) {
  const { list, setList, reload } = useCatList(backend, k, dflt)
  const [add, setAdd] = useState('')
  const [ren, setRen] = useState<{ i: number; v: string } | null>(null)
  const sb = backend.client()
  async function save(next: string[], msg: string) {
    const clean = [...new Set(next.map(x => x.trim()).filter(Boolean))]
    setList(clean)
    const { error } = sb ? await sb.rpc('set_list_setting', { p_key: k, p_items: clean }) : { error: { message: 'No database' } }
    if (error) { flash(/set_list_setting/.test(error.message) ? 'Needs 296_settings_lists.sql run in Supabase first' : error.message, true); reload() } else flash(msg)
  }
  const move = (i: number) => { if (i < 1) return; const a = [...list]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; save(a, 'Order saved') }
  return <div className="catlist">
    <h3>{title}</h3>
    <p className="muted">{intro}</p>
    <div className="cwrap settable-w"><table className="ctable settable">
      <thead><tr>{canEdit && <th style={{ width: 44 }} />}<th>{noun}</th>{usedBy && <th className="num">Used by</th>}{canEdit && <th />}</tr></thead>
      <tbody>{list.map((c, i) => <tr key={c}>
        {canEdit && <td><button className="ghost small" aria-label={`Move ${c} up`} disabled={i === 0} onClick={() => move(i)}>▲</button></td>}
        <td>{ren?.i === i ? <input value={ren.v} onChange={e => setRen({ i, v: e.target.value })} autoFocus /> : <b>{c}</b>}</td>
        {usedBy && <td className="num">{usedBy(c)}</td>}
        {canEdit && <td className="row end" style={{ gap: 6 }}>{ren?.i === i
          ? <><button className="primary small" disabled={!ren.v.trim()} onClick={() => { const a = [...list]; a[i] = ren.v; setRen(null); save(a, 'Renamed') }}>Save</button><button className="ghost small" onClick={() => setRen(null)}>Cancel</button></>
          : <><button className="ghost small" onClick={() => setRen({ i, v: c })}>Rename</button><button className="ghost small danger" onClick={() => save(list.filter((_, j) => j !== i), `${c} removed`)}>Remove</button></>}</td>}
      </tr>)}</tbody></table></div>
    {canEdit && <div className="row" style={{ gap: 8, marginTop: 8 }}>
      <input value={add} placeholder={`New ${noun.toLowerCase()}`} onChange={e => setAdd(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && add.trim()) { save([...list, add], `${add.trim()} added`); setAdd('') } }} />
      <button className="primary" disabled={!add.trim() || list.some(x => x.toLowerCase() === add.trim().toLowerCase())} onClick={() => { save([...list, add], `${add.trim()} added`); setAdd('') }}>+ Add</button></div>}
  </div>
}

/** tick boxes for a multi-pick (a customer's categories, a strain's nurseries) */
export function MultiPick({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const all = [...options, ...value.filter(v => !options.includes(v))]
  return <div className="mpick">{all.map(o => { const on = value.includes(o)
    return <button type="button" key={o} className={`mpick-b ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => onChange(on ? value.filter(x => x !== o) : [...value, o])}><i>{on ? '✓' : ''}</i>{o}</button> })}</div>
}
