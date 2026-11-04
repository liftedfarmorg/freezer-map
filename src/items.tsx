import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { rpc } from './ship'
import { StrainLink } from './strainCard'

// 171: item cards. One card = one app item = one METRC item name (crop year + farm + product + strain). The same card applies on
// every license where METRC has that item (METRC makes it on a license when a package is received there), so the card's licenses
// come from METRC's item lists. New cards are made in the app (strain card › Items › + New item) and sent to METRC (170).
// Flags only, no automatic fixes. Any module Admin can change cards.

type Flash = (t: string, bad?: boolean) => void
export interface ItemCard {
  id: number; sku: string; strain_id: number; strain: string; strain_type: string | null; finish: string; product: string | null; crop_year: number; season: string | null
  site: string; license: string | null; metrc_name: string; on_menu: boolean; active: boolean; metrc_status: string
  licenses: { license: string; site: string | null; kind: string | null; metrc_id: number }[]; home_in_metrc: boolean
  packages: number; lbs: number; pkgs_other_item: number; created_at: string
}
interface CardPkg { pallet_id: number; code: string | null; tag: string | null; status: string; lbs: number | null; metrc_license: string | null; metrc_item: string | null }

const SQL = '171_item_cards'
const n0 = (x: number | null | undefined) => Number(x ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
const licLabel = (l: { license: string; site: string | null; kind: string | null }) =>
  `${l.site ?? l.license}${l.kind === 'processor' ? ' proc' : l.kind === 'nursery' ? ' nursery' : ''}`
export const STRAIN_TYPES = ['Indica', 'Indica Hybrid', 'Hybrid', 'Sativa Hybrid', 'Sativa'] as const

export function loadItemCards(sb: SupabaseClient | null) { return rpc<ItemCard[]>(sb, 'item_cards', {}, SQL) }

/** Sales › Items: every item card, with filters */
export function ItemsView({ sb, flash, canEdit }: { sb: SupabaseClient | null; flash: Flash; canEdit: boolean }) {
  const [rows, setRows] = useState<ItemCard[] | null>(null)
  const [q, setQ] = useState('')
  const [prod, setProd] = useState('')
  const [year, setYear] = useState('')
  const [farm, setFarm] = useState('')
  const [lic, setLic] = useState('')
  const [show, setShow] = useState<'all' | 'stock' | 'on' | 'off' | 'flag'>('stock')
  const [open, setOpen] = useState<ItemCard | null>(null)
  const load = async () => { try { setRows(await loadItemCards(sb)) } catch (e) { flash((e as Error).message, true); setRows([]) } }
  useEffect(() => { load() }, [])
  const all = rows ?? []
  const prods = useMemo(() => [...new Map(all.map(r => [r.finish, r.product ?? r.finish])).entries()], [rows])
  const years = useMemo(() => [...new Set(all.map(r => r.crop_year))].sort((a, b) => b - a), [rows])
  const lics = useMemo(() => [...new Map(all.flatMap(r => r.licenses).map(l => [l.license, licLabel(l)])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [rows])
  const flagged = (r: ItemCard) => r.licenses.length === 0 || r.pkgs_other_item > 0
  const ql = q.trim().toLowerCase()
  const list = all.filter(r => (!ql || r.strain.toLowerCase().includes(ql) || r.sku.toLowerCase().includes(ql) || r.metrc_name.toLowerCase().includes(ql))
    && (!prod || r.finish === prod) && (!year || String(r.crop_year) === year) && (!farm || r.site === farm)
    && (!lic || r.licenses.some(l => l.license === lic))
    && (show === 'all' || (show === 'stock' && r.packages > 0) || (show === 'on' && r.on_menu) || (show === 'off' && !r.on_menu) || (show === 'flag' && flagged(r))))
  const nFlag = all.filter(flagged).length
  async function toggleMenu(r: ItemCard) {
    try { await rpc(sb, 'set_item_card', { p_item: r.id, p_on_menu: !r.on_menu }, SQL); setRows(rs => (rs ?? []).map(x => x.id === r.id ? { ...x, on_menu: !r.on_menu } : x)) }
    catch (e) { flash((e as Error).message, true) }
  }
  const chip = (k: typeof show, l: string) => <button key={k} className={show === k ? 'primary small' : 'ghost small'} onClick={() => setShow(k)}>{l}</button>
  return <div className="list">
    <div className="row between wrap toolbar"><h2>Items</h2>
      <div className="row"><button className="ghost small" onClick={load}>Refresh</button></div></div>
    <p className="muted">Every item card. One card is one METRC item, and it shows on every license where METRC has it. New cards are made from a strain card (tap a strain name › Items) and go to METRC on their own.</p>
    <div className="row wrap toolbar" style={{ gap: 6 }}>
      <input type="search" placeholder="Search strain or SKU" value={q} onChange={e => setQ(e.target.value)} style={{ minWidth: 200 }} />
      <select value={prod} onChange={e => setProd(e.target.value)}><option value="">All products</option>{prods.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <select value={year} onChange={e => setYear(e.target.value)}><option value="">All crop years</option>{years.map(y => <option key={y}>{y}</option>)}</select>
      <select value={farm} onChange={e => setFarm(e.target.value)}><option value="">Both farms</option><option value="OHR">OHR</option><option value="GVR">GVR</option></select>
      <select value={lic} onChange={e => setLic(e.target.value)}><option value="">All licenses</option>{lics.map(([k, l]) => <option key={k} value={k}>{l} · {k}</option>)}</select>
    </div>
    <div className="row wrap toolbar" style={{ gap: 6 }}>
      {chip('stock', 'Has stock')}{chip('all', 'All')}{chip('on', 'On the menu')}{chip('off', 'Off the menu')}{chip('flag', `Flags${nFlag ? ` (${nFlag})` : ''}`)}
      <span className="muted small">{list.length.toLocaleString()} of {all.length.toLocaleString()} cards</span>
    </div>
    {rows === null && <p className="muted">Loading…</p>}
    {rows && !list.length && <p className="muted">No item cards match.</p>}
    {list.length > 0 && <div className="tablewrap"><table className="ct"><thead><tr><th>Strain</th><th>Product</th><th>Crop</th><th>Farm</th><th>In METRC on</th>
      <th className="num">Packages</th><th className="num">Lbs</th><th>On menu</th><th /></tr></thead>
      <tbody>{list.map(r => <tr key={r.id} className="tap" onClick={() => setOpen(r)}>
        <td><StrainLink name={r.strain} />{r.strain_type && <div className="muted small">{r.strain_type}</div>}</td>
        <td>{r.product ?? r.finish}</td><td>{r.crop_year}</td><td>{r.site}</td>
        <td className="small">{r.licenses.length ? r.licenses.map(l => <span key={l.license} className="pill" title={l.license} style={{ marginRight: 4 }}>{licLabel(l)}</span>) : <span className="pill m-warn">not in METRC</span>}</td>
        <td className="num">{r.packages ? n0(r.packages) : ''}</td><td className="num">{r.lbs ? n0(r.lbs) : ''}</td>
        <td onClick={e => e.stopPropagation()}>{canEdit
          ? <label className="check"><input type="checkbox" checked={r.on_menu} onChange={() => toggleMenu(r)} /> {r.on_menu ? 'On' : 'Off'}</label>
          : r.on_menu ? 'On' : 'Off'}</td>
        <td className="small">{r.pkgs_other_item > 0 && <span className="pill m-warn" title="METRC has some of these packages on a different item">{r.pkgs_other_item} on another METRC item</span>}</td>
      </tr>)}</tbody></table></div>}
    {open && <ItemCardSheet sb={sb} card={open} canEdit={canEdit} flash={flash} onClose={() => setOpen(null)} onChanged={c => { setRows(rs => (rs ?? []).map(x => x.id === c.id ? c : x)); setOpen(c) }} />}
  </div>
}

/** one item card */
export function ItemCardSheet({ sb, card, canEdit, flash, onClose, onChanged }: { sb: SupabaseClient | null; card: ItemCard; canEdit: boolean; flash: Flash; onClose: () => void; onChanged: (c: ItemCard) => void }) {
  const [pkgs, setPkgs] = useState<CardPkg[] | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { rpc<CardPkg[]>(sb, 'item_card_packages', { p_item: card.id }, SQL).then(setPkgs, e => { flash((e as Error).message, true); setPkgs([]) }) }, [card.id])
  async function set(on_menu: boolean | null, active: boolean | null) {
    setBusy(true)
    try { await rpc(sb, 'set_item_card', { p_item: card.id, p_on_menu: on_menu, p_active: active }, SQL); onChanged({ ...card, on_menu: on_menu ?? card.on_menu, active: active ?? card.active }); flash('Saved') }
    catch (e) { flash((e as Error).message, true) } finally { setBusy(false) }
  }
  return <div className="scrim" onClick={onClose}><div className="sheet form" onClick={e => e.stopPropagation()}>
    <div className="sheet-h"><h2><StrainLink name={card.strain} /> · {card.product ?? card.finish} · {card.crop_year} · {card.site}</h2><button className="ghost" onClick={onClose}>✕</button></div>
    <p className="mono small" style={{ margin: 0 }}>{card.sku}</p>
    <p className="muted small" style={{ marginTop: 2 }}>METRC item name: <span className="mono">{card.metrc_name}</span>{card.strain_type ? ` · ${card.strain_type}` : ''}</p>
    <div className="field"><label className="check"><input type="checkbox" disabled={!canEdit || busy} checked={card.on_menu} onChange={e => set(e.target.checked, null)} />
      <span><b>On the menu</b> <span className="muted">off = it doesn't show on the open menu or the portal. Packages stay in inventory.</span></span></label></div>
    <div className="field"><label className="check"><input type="checkbox" disabled={!canEdit || busy} checked={card.active} onChange={e => set(null, e.target.checked)} />
      <span><b>Active</b> <span className="muted">off = kept for history, not picked for new packages</span></span></label></div>
    <h3>In METRC</h3>
    {card.licenses.length === 0 ? <p className="warn-t">METRC doesn't have this item on any license yet. A "Create item in METRC" to-do sends it (Compliance › METRC › To do).</p>
      : <div className="tablewrap"><table className="ct"><thead><tr><th>License</th><th>METRC item ID</th></tr></thead>
        <tbody>{card.licenses.map(l => <tr key={l.license}><td>{licLabel(l)} <span className="mono small">{l.license}</span>{l.license === card.license && <span className="muted small"> (home)</span>}</td><td className="mono">{l.metrc_id}</td></tr>)}</tbody></table></div>}
    <h3>Packages on this item</h3>
    {pkgs === null ? <p className="muted">Loading…</p> : !pkgs.length ? <p className="muted">None in inventory.</p>
      : <div className="tablewrap"><table className="ct"><thead><tr><th>Package</th><th>Tag</th><th className="num">Lbs</th><th>METRC has it on</th></tr></thead>
        <tbody>{pkgs.map(p => { const other = p.metrc_item && p.metrc_item.toLowerCase() !== card.metrc_name.toLowerCase()
          return <tr key={p.pallet_id}><td>{p.code}</td><td className="mono small">{p.tag ? `…${p.tag.slice(-6)}` : ''}</td><td className="num">{n0(p.lbs)}</td>
            <td className="small">{p.metrc_item ? <span className={other ? 'warn-t' : 'muted'}>{other ? p.metrc_item : 'this item'}{p.metrc_license ? ` · ${p.metrc_license}` : ''}</span> : <span className="muted">not active in METRC</span>}</td></tr> })}</tbody></table></div>}
    <p className="muted small">To move a package to another item: open the package › New package › All of it › pick the item (a repackage, same as METRC).</p>
  </div></div>
}

/** strain card › Items: this strain's cards, a type picker and + New item */
export function StrainItems({ sb, strainId, strainType, flash, canEdit, onChanged }: { sb: SupabaseClient | null; strainId: number; strainType: string | null; flash: Flash; canEdit: boolean; onChanged?: () => void }) {
  const [rows, setRows] = useState<ItemCard[] | null>(null)
  const [type, setType] = useState(strainType ?? '')
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ year: String(new Date().getFullYear()), site: 'OHR', finish: 'FF' })
  const [open, setOpen] = useState<ItemCard | null>(null)
  const [busy, setBusy] = useState(false)
  const load = async () => { try { setRows((await loadItemCards(sb)).filter(r => r.strain_id === strainId)) } catch (e) { flash((e as Error).message, true); setRows([]) } }
  useEffect(() => { load() }, [strainId])
  async function saveType(v: string) {
    setType(v)
    try { await rpc(sb, 'set_strain_type', { p_strain: strainId, p_type: v || null }, SQL); flash(v ? `Type: ${v}` : 'Type cleared'); onChanged?.() }
    catch (e) { flash((e as Error).message, true) }
  }
  async function add() {
    setBusy(true)
    try { await rpc(sb, 'new_item_card', { p_strain: strainId, p_year: Number(f.year), p_site: f.site, p_finish: f.finish }, SQL); flash('Item card made. It goes to METRC on its own (Compliance › METRC › To do).'); setAdding(false); await load() }
    catch (e) { flash((e as Error).message, true) } finally { setBusy(false) }
  }
  const finishes: [string, string][] = [['FF', 'Fresh Frozen'], ['DH', 'Dry Harvest (wet)'], ['UF', 'Unbucked Dry Flower'], ['BF', 'Bucked Dry Flower'], ['ST', 'Standards'], ['SM', 'Smalls'], ['TR', 'Trim (dry flower)'], ['BT', 'Trim (bucking)']]
  return <section style={{ marginTop: 12 }}>
    <h3>Type and items</h3>
    <div className="field"><label>Type</label>
      <select value={type} disabled={!canEdit} onChange={e => saveType(e.target.value)}><option value="">Not set</option>{STRAIN_TYPES.map(t => <option key={t}>{t}</option>)}</select>
      <span className="muted small"> sets the METRC indica / sativa % for this strain</span></div>
    {rows === null ? <p className="muted">Loading…</p> : !rows.length ? <p className="muted">No item cards yet.</p>
      : <div className="tablewrap"><table className="ct"><thead><tr><th>Product</th><th>Crop</th><th>Farm</th><th>In METRC on</th><th className="num">Lbs</th><th>Menu</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.id} className="tap" onClick={() => setOpen(r)}><td>{r.product ?? r.finish}</td><td>{r.crop_year}</td><td>{r.site}</td>
          <td className="small">{r.licenses.length ? r.licenses.map(l => licLabel(l)).join(', ') : <span className="warn-t">not yet</span>}</td>
          <td className="num">{r.lbs ? n0(r.lbs) : ''}</td><td>{r.on_menu ? 'On' : 'Off'}</td></tr>)}</tbody></table></div>}
    {canEdit && !adding && <button className="ghost small" onClick={() => setAdding(true)}>+ New item</button>}
    {adding && <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
      <select value={f.finish} onChange={e => setF({ ...f, finish: e.target.value })}>{finishes.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <select value={f.site} onChange={e => setF({ ...f, site: e.target.value })}><option>OHR</option><option>GVR</option></select>
      <input type="number" value={f.year} onChange={e => setF({ ...f, year: e.target.value })} style={{ width: 90 }} aria-label="Crop year" />
      <button className="primary small" disabled={busy} onClick={add}>{busy ? '…' : 'Make it'}</button><button className="ghost small" onClick={() => setAdding(false)}>Cancel</button>
    </div>}
    {open && <ItemCardSheet sb={sb} card={open} canEdit={canEdit} flash={flash} onClose={() => setOpen(null)} onChanged={c => { setRows(rs => (rs ?? []).map(x => x.id === c.id ? c : x)); setOpen(c) }} />}
  </section>
}
