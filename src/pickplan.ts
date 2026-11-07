// Plan my pick (Msg PICK-1): picks pallets for a whole order so the crew opens as few freezers as possible.
// Pure functions, no database calls. The UI (pickplanui.tsx) turns a plan into order_picks with the same
// pick_pallet / pick_part calls as + Assign pallets.
import type { Pallet } from './types'

export interface Loc {
  fz: number | null        // freezer / staging / trailer id (null = needs a spot)
  fzLabel: string          // "GVR Freezer 14", "GVR Staging", "GVR Reefer 2"
  sort: number             // walk order: staging 0, freezers by number, trailers after
  site: string | null
  spot: string             // "14I", "S4", "C"
  front: number            // 1 = at the door
  side: string             // "Left" / "Right" / ""
  inFront: number[]        // pallet ids between this one and the door (same side)
  staging?: boolean        // PICK-2: in Staging (left out of Plan my pick)
}
export interface PLine { id: number; strain: string; need: number; cands: Pallet[] }
export type Mode = 'freezers' | 'oldest' | 'splits'
export interface PRow { lineId: number; pallet: Pallet; lbs: number; whole: boolean }
export interface Plan { rows: PRow[]; short: Map<number, number>; freezers: number[]; moves: number; splits: number }

const w = (p: Pallet) => Number(p.current_weight ?? 0)
const hd = (p: Pallet) => p.harvest_date ?? '9999'

/** pallets for one line out of a pool, in the order the mode prefers */
function fillLine(need: number, pool: Pallet[], tol: number, mode: Mode, loc: (p: Pallet) => Loc, used: Set<number>, lineId: number): PRow[] {
  const c = pool.filter(p => !used.has(p.id) && w(p) > 0)
  const order = (a: Pallet, b: Pallet) =>
    mode === 'oldest' ? hd(a).localeCompare(hd(b)) || loc(a).front - loc(b).front
    : mode === 'splits' ? w(b) - w(a) || loc(a).front - loc(b).front
    : loc(a).inFront.length - loc(b).inFront.length || w(b) - w(a)
  const rows: PRow[] = []
  let left = need
  // one pallet that matches what's needed (within the fill tolerance) beats everything
  const exact = c.filter(p => Math.abs(w(p) - left) <= tol).sort(order)[0]
  if (exact && mode !== 'oldest') { used.add(exact.id); return [{ lineId, pallet: exact, lbs: w(exact), whole: true }] }
  const sorted = [...c].sort(order)
  while (left > tol) {
    const fits = sorted.find(p => !used.has(p.id) && w(p) <= left + tol)
    if (fits && mode !== 'oldest') { used.add(fits.id); rows.push({ lineId, pallet: fits, lbs: w(fits), whole: true }); left -= w(fits); continue }
    if (mode === 'oldest') {
      const p = sorted.find(x => !used.has(x.id))
      if (!p) break
      used.add(p.id)
      if (w(p) <= left + tol) { rows.push({ lineId, pallet: p, lbs: w(p), whole: true }); left -= w(p) }
      else { rows.push({ lineId, pallet: p, lbs: round(left), whole: false }); left = 0 }
      continue
    }
    // nothing fits whole: split the smallest one that covers what's left
    const big = c.filter(p => !used.has(p.id) && w(p) > left + tol).sort((a, b) => w(a) - w(b) || order(a, b))[0]
    if (!big) break
    used.add(big.id); rows.push({ lineId, pallet: big, lbs: round(left), whole: false }); left = 0
  }
  return rows
}
const round = (x: number) => Math.round(x * 100) / 100

function score(lines: PLine[], rows: PRow[], loc: (p: Pallet) => Loc): Plan {
  const short = new Map<number, number>()
  for (const l of lines) {
    const got = rows.filter(r => r.lineId === l.id).reduce((a, r) => a + r.lbs, 0)
    if (l.need - got > 0.5) short.set(l.id, round(l.need - got))
  }
  const picked = new Set(rows.map(r => r.pallet.id))
  const block = new Set<number>()
  for (const r of rows) for (const id of loc(r.pallet).inFront) if (!picked.has(id)) block.add(id)
  const freezers = [...new Set(rows.map(r => loc(r.pallet).fz ?? -1))]
  return { rows: route(rows, loc), short, freezers, moves: block.size, splits: rows.filter(r => !r.whole).length }
}

/** walk order: freezers in the site's order, door to back inside each */
export function route<T extends PRow>(rows: T[], loc: (p: Pallet) => Loc): T[] {
  return [...rows].sort((a, b) => {
    const la = loc(a.pallet), lb = loc(b.pallet)
    return la.sort - lb.sort || (la.fz ?? 0) - (lb.fz ?? 0) || la.front - lb.front || la.spot.localeCompare(lb.spot)
  })
}

function plain(lines: PLine[], tol: number, mode: Mode, loc: (p: Pallet) => Loc, allow?: Set<number>) {
  const used = new Set<number>()
  const rows: PRow[] = []
  for (const l of [...lines].sort((a, b) => b.need - a.need)) {
    const pool = allow ? l.cands.filter(p => allow.has(loc(p).fz ?? -1)) : l.cands
    rows.push(...fillLine(l.need, pool, tol, mode, loc, used, l.id))
  }
  return score(lines, rows, loc)
}

function* combos(xs: number[], k: number, start = 0, cur: number[] = []): Generator<number[]> {
  if (cur.length === k) { yield cur; return }
  for (let i = start; i < xs.length; i++) yield* combos(xs, k, i + 1, [...cur, xs[i]])
}

export function makePlan(lines: PLine[], tol: number, mode: Mode, loc: (p: Pallet) => Loc): Plan {
  const open = lines.filter(l => l.need > tol)
  if (mode !== 'freezers') return plain(open, tol, mode, loc)
  const fz = [...new Set(open.flatMap(l => l.cands.map(p => loc(p).fz ?? -1)))]
  let best: Plan | null = null
  const better = (a: Plan, b: Plan | null): boolean => {
    if (!b) return true
    const sa = sumShort(a), sb = sumShort(b)
    if (Math.abs(sa - sb) > 0.5) return sa < sb
    if (a.freezers.length !== b.freezers.length) return a.freezers.length < b.freezers.length
    if (a.moves !== b.moves) return a.moves < b.moves
    return a.splits < b.splits
  }
  // smallest set of freezers that can cover every line, then the fewest pallets in the way and splits inside it
  for (let k = 1; k <= Math.min(fz.length, 4) && !best; k++) {
    let tried = 0
    for (const set of combos(fz, k)) {
      const s = new Set(set)
      const covers = open.every(l => l.cands.filter(p => s.has(loc(p).fz ?? -1)).reduce((a, p) => a + w(p), 0) >= l.need - tol)
      if (!covers) continue
      const p = plain(open, tol, mode, loc, s)
      if (p.short.size === 0 && better(p, best)) best = p
      if (++tried > 400) break
    }
  }
  if (best) return best
  // more than 4 freezers needed: add freezers one at a time, each time the one that finishes the most lines
  // (most lbs still needed as the tie-break), then drop any freezer the rest can do without
  const lbsOf = (l: PLine, s: Set<number>) => l.cands.filter(p => s.has(loc(p).fz ?? -1)).reduce((a, p) => a + w(p), 0)
  const done = (l: PLine, s: Set<number>) => lbsOf(l, s) >= l.need - tol
  const chosen = new Set<number>()
  while (open.some(l => !done(l, chosen))) {
    let pick = -2, gain = -1, lbs = -1
    for (const f of fz) {
      if (chosen.has(f)) continue
      const s = new Set(chosen); s.add(f)
      const g = open.filter(l => !done(l, chosen) && done(l, s)).length
      const more = open.filter(l => !done(l, chosen)).reduce((a, l) => a + Math.min(l.need, lbsOf(l, s)) - Math.min(l.need, lbsOf(l, chosen)), 0)
      if (g > gain || (g === gain && more > lbs)) { pick = f; gain = g; lbs = more }
    }
    if (pick === -2 || (gain === 0 && lbs <= 0)) break
    chosen.add(pick)
  }
  for (const f of [...chosen]) {
    const s = new Set(chosen); s.delete(f)
    if (open.every(l => done(l, s) || !done(l, chosen))) chosen.delete(f)
  }
  return plain(open, tol, mode, loc, chosen)
}
const sumShort = (p: Plan) => [...p.short.values()].reduce((a, b) => a + b, 0)

export function rescore(lines: PLine[], rows: PRow[], loc: (p: Pallet) => Loc): Plan { return score(lines, rows, loc) }
