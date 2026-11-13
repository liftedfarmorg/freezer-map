import { SPEED_RED, SPEED_YELLOW, SPEED_MAX, clock } from './bonuscalc'
import './rategraph.css'
import type { BonusView } from './bonuscalc'

// FB-0011 (Jordan): live bucking rate graph, background shaded per variety, so the room slowing down (or a variety
// that bucks slower) shows at a glance. Thick line = the day's running rate (what the Live Bonus speed shows),
// thin line + dots = each pallet's own rate. Dashed lines = the red / yellow speed marks.
// Used on the Harvest day card (English) and the Live Bonus screen (Spanish, tv).

const BANDS = ['#86efac', '#93c5fd', '#fcd34d', '#c4b5fd', '#f9a8d4', '#5eead4', '#fdba74', '#a5b4fc']

export function RateGraph({ v, tv, es }: { v: BonusView; tv?: boolean; es?: boolean }) {
  const pts = v.perPallet, run = v.series
  if (!pts.length) return <div className={`rgraph empty${tv ? ' tv' : ''}`}>{es ? 'La gráfica empieza con la primera tarima.' : 'The graph starts with the first pallet.'}</div>
  const W = tv ? 380 : 640, H = tv ? 150 : 210, L = tv ? 28 : 34, R = 6, T = tv ? 16 : 18, B = tv ? 18 : 22
  const x0 = Math.min(v.boxMin ?? pts[0].min, pts[0].min), x1 = Math.max(pts[pts.length - 1].min, x0 + 30)
  const ymax = Math.min(220, Math.max(SPEED_MAX, ...pts.map(p => p.v), ...run.map(p => p.v)) * 1.08)
  const X = (m: number) => L + (m - x0) / (x1 - x0) * (W - L - R)
  const Y = (r: number) => T + (1 - Math.min(r, ymax) / ymax) * (H - T - B)
  // varieties in the order they ran: one shaded band each (a strain that comes back gets a new band, same color)
  const color = new Map<string, string>()
  const bands: { strain: string; a: number; b: number; c: string }[] = []
  let prev = x0
  for (const p of pts) {
    if (!color.has(p.strain)) color.set(p.strain, BANDS[color.size % BANDS.length])
    const last = bands[bands.length - 1]
    if (last && last.strain === p.strain) last.b = p.min
    else bands.push({ strain: p.strain, a: prev, b: p.min, c: color.get(p.strain)! })
    prev = p.min
  }
  const hours: number[] = []
  for (let m = Math.ceil(x0 / 60) * 60; m <= x1; m += 60) hours.push(m)
  const path = (xs: { min: number; v: number }[]) => xs.map((p, i) => `${i ? 'L' : 'M'}${X(p.min).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ')
  return (
    <div className={`rgraph${tv ? ' tv' : ''}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={es ? 'Velocidad por tarima' : 'Bucking rate through the day'}>
        {bands.map((b, i) => <g key={i}>
          <rect x={X(b.a)} y={T} width={Math.max(2, X(b.b) - X(b.a))} height={H - T - B} fill={b.c} opacity={tv ? 0.32 : 0.28} />
          {X(b.b) - X(b.a) > (tv ? 40 : 46) && <text x={X(b.a) + 4} y={T - 5} className="rg-band">{b.strain.length > 22 ? b.strain.slice(0, 21) + '…' : b.strain}</text>}
        </g>)}
        {[SPEED_RED, SPEED_YELLOW].map(s => <line key={s} x1={L} x2={W - R} y1={Y(s)} y2={Y(s)} className={`rg-mark ${s === SPEED_RED ? 'r' : 'y'}`} />)}
        {[0, 50, 100, 150, 200].filter(t => t <= ymax).map(t => <text key={t} x={L - 4} y={Y(t) + 3} className="rg-ax" textAnchor="end">{t}</text>)}
        {hours.map(m => <text key={m} x={X(m)} y={H - 6} className="rg-ax" textAnchor="middle">{clock(m).replace(':00', '')}</text>)}
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} className="rg-base" />
        <path d={path(pts)} className="rg-each" />
        {pts.map(p => <circle key={p.code} cx={X(p.min)} cy={Y(p.v)} r={tv ? 3.5 : 2.6} className="rg-dot"><title>{`${p.code} · ${p.strain} · ${Math.round(p.v)} lbs/bucker/hr`}</title></circle>)}
        {run.length > 1 && <path d={path(run)} className="rg-run" />}
      </svg>
      {!tv && <div className="rg-legend">
        <span><i className="rg-k run" />{es ? 'Velocidad del día' : 'Day so far'}</span>
        <span><i className="rg-k each" />{es ? 'Cada tarima' : 'Each pallet'}</span>
        <span className="muted">{es ? `Rojo < ${SPEED_RED} · Amarillo < ${SPEED_YELLOW}` : `lbs / bucker / hr · red line ${SPEED_RED}, yellow ${SPEED_YELLOW}`}</span>
      </div>}
    </div>
  )
}
