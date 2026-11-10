import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { clock, computeBonus, hm, SPEED_MAX, SPEED_RED, SPEED_YELLOW, speedLevel } from './cult/bonuscalc';
import './bonus.css';
// Live Bonus: the TV screen in the pack shed. Public link /?bonus=<token> (one per site, from Cultivation > Harvest).
// No login. Refreshes every 20 seconds; the clock ticks in between. Spanish on purpose: it's for the crew.
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fecha = (day) => { const d = new Date(`${day}T12:00:00`); return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`; };
const money = (n) => `$${n.toFixed(2)}`;
const n0 = (n) => Math.round(n).toLocaleString('en-US');
const pct = (n, max) => `${Math.max(0, Math.min(100, (n / max) * 100)).toFixed(1)}%`;
const STATUS = { g: 'VAN BIEN · EN CAMINO', y: 'CERCA · HAY QUE APURAR', r: 'LEJOS DE LA META', wait: 'ESPERANDO LA PRIMERA TARIMA' };
const MISSING = { 'box start': 'hora de la primera caja', people: 'personas', buckers: 'buckers', 'La Meta': 'la meta' };
export function BonusScreen({ backend, token }) {
    const [d, setD] = useState(undefined);
    const [at, setAt] = useState(Date.now());
    const [, tick] = useState(0);
    const day = new URLSearchParams(location.search).get('day');
    const stage = useRef(null);
    const [fit, setFit] = useState({ s: 1, x: 0, y: 0 });
    useEffect(() => {
        document.title = 'Bono en vivo · Lifted Farms';
        document.documentElement.lang = 'es';
        const l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = 'https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;600;700;800&family=Barlow:wght@500;600&display=swap';
        document.head.appendChild(l);
    }, []);
    useEffect(() => {
        const sb = backend.client();
        if (!sb) {
            setD(null);
            return;
        }
        let stop = false;
        const load = () => sb.rpc('bonus_live', { p_token: token, p_day: day || null }).then(({ data, error }) => {
            if (stop)
                return;
            if (error) {
                if (d === undefined)
                    setD(null);
                return;
            } // keep the last good numbers on a blip
            setD((data ?? null));
            setAt(Date.now());
        });
        load();
        const a = setInterval(load, 20000), b = setInterval(() => tick(x => x + 1), 15000);
        return () => { stop = true; clearInterval(a); clearInterval(b); };
    }, [token]);
    useEffect(() => {
        const go = () => { const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080); setFit({ s, x: (window.innerWidth - 1920 * s) / 2, y: (window.innerHeight - 1080 * s) / 2 }); };
        go();
        window.addEventListener('resize', go);
        return () => window.removeEventListener('resize', go);
    }, []);
    if (d === undefined)
        return _jsx("div", { className: "bz-wrap", children: _jsx("p", { className: "bz-msg", children: "Cargando\u2026" }) });
    if (!d)
        return _jsx("div", { className: "bz-wrap", children: _jsx("p", { className: "bz-msg", children: "Este enlace no funciona. Pide uno nuevo en Cultivo \u203A Cosecha." }) });
    const nowMin = d.now_min + (d.is_today ? (Date.now() - at) / 60000 : 0);
    const v = computeBonus(d, nowMin);
    return (_jsx("div", { className: "bz-wrap", children: _jsxs("div", { className: `bz${!v.ready || v.onBreak ? ' banner' : ''}`, ref: stage, style: { transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.s})` }, "data-level": v.level, children: [_jsxs("div", { className: "bz-top", children: [_jsxs("div", { className: "bz-brand", children: [_jsx("img", { className: "bz-logo", src: "/logo-light.svg", alt: "Lifted Farms" }), _jsxs("span", { className: "bz-dim", children: ["Cosecha en vivo \u00B7 ", d.site] })] }), _jsxs("div", { className: "bz-var", children: [_jsx("span", { className: "bz-cap", children: "Variedad ahora" }), _jsx("b", { children: v.variety ?? '—' })] }), _jsxs("div", { className: "bz-clock", children: [_jsx("b", { children: v.ended ? `Terminó ${clock(hm(v.ended))}` : d.is_today ? clock(nowMin) : 'Día cerrado' }), _jsx("span", { className: "bz-dim", children: fecha(d.day) })] })] }), (!v.ready || v.onBreak) && _jsx("div", { className: "bz-banner", children: v.onBreak ? (v.onBreak.kind === 'pause' ? `Línea en pausa desde ${clock(hm(v.onBreak.start_at))}. El tiempo no cuenta.` : `${v.onBreak.kind === 'lunch' ? 'Almuerzo' : 'Descanso'} desde ${clock(hm(v.onBreak.start_at))}. El tiempo no cuenta.`)
                        : `Falta en la tarjeta del día: ${v.missing.map(m => MISSING[m] ?? m).join(', ')}` }), _jsxs("div", { className: "bz-main", children: [_jsx(Hero, { v: v }), _jsxs("div", { className: "bz-col", children: [_jsx(Meta, { v: v }), _jsx(Speed, { v: v })] })] }), _jsx(Bottom, { v: v })] }) }));
}
function Hero({ v }) {
    // the bonus rate they've built so far: only goes up as pallets come in (never a projection that can drop)
    const over = !!v.ended && !v.won;
    const rate = v.packed > 0 ? v.bonusRate : 0;
    const label = v.won ? 'Bono ganado · por hora' : over ? 'Sin bono hoy' : 'Bono acumulado · por hora';
    const big = over ? money(0) : money(rate);
    const sub = over ? (v.corr != null && v.hurdle != null ? `Faltaron ${n0(v.hurdle - v.corr)} libras por persona.` : '')
        : v.ended && v.won ? `Día terminado. ${n0(v.packed)} libras empacadas.`
            : v.level === 'wait' ? (v.pallets ? 'Completen la tarjeta del día en Cultivo › Cosecha.' : 'Los números empiezan con la primera tarima.')
                : v.won ? 'Sube con cada libra que empaquen.'
                    : v.corr != null && v.hurdle != null ? `Se gana al llegar a la meta: faltan ${n0(v.hurdle - v.corr)} libras por persona.` : '';
    return (_jsxs("div", { className: "bz-card bz-hero", children: [_jsxs("div", { className: "bz-pill", children: [_jsx("i", {}), v.won ? '¡META ALCANZADA!' : over ? 'DÍA TERMINADO' : v.level === 'wait' && v.pallets ? 'FALTAN DATOS DEL DÍA' : STATUS[v.level]] }), _jsxs("div", { className: "bz-herorow", children: [_jsxs("div", { className: "bz-herobody", children: [_jsx("div", { className: "bz-herolab", children: label }), _jsx("div", { className: `bz-heroval${v.won ? ' won' : ''}`, children: big }), _jsx("div", { className: "bz-herosub", children: sub })] }), _jsx(StatusIcon, { level: v.level, won: v.won })] })] }));
}
/** big status symbol: shape and color both change, so it reads from across the shed and for color-blind crew */
function StatusIcon({ level, won }) {
    const dark = '#0D1310';
    if (won || level === 'g')
        return (_jsxs("svg", { className: `bz-icon${won ? ' won' : ''}`, viewBox: "0 0 100 100", role: "img", "aria-label": "En meta", children: [_jsx("circle", { cx: "50", cy: "50", r: "46", fill: "var(--gi)" }), _jsx("path", { d: "M28 52 L44 67 L73 35", fill: "none", stroke: "#FFFFFF", strokeWidth: "11", strokeLinecap: "round", strokeLinejoin: "round" })] }));
    if (level === 'y')
        return (_jsxs("svg", { className: "bz-icon", viewBox: "0 0 100 100", role: "img", "aria-label": "Cerca", children: [_jsx("path", { d: "M50 6 Q54 6 56.5 10.5 L95 82 Q97.5 88 91 90 L9 90 Q2.5 88 5 82 L43.5 10.5 Q46 6 50 6 Z", fill: "var(--yi)" }), _jsx("rect", { x: "44", y: "30", width: "12", height: "34", rx: "6", fill: dark }), _jsx("circle", { cx: "50", cy: "76", r: "7", fill: dark })] }));
    if (level === 'r')
        return (_jsxs("svg", { className: "bz-icon", viewBox: "0 0 100 100", role: "img", "aria-label": "Lejos", children: [_jsx("path", { d: "M31 4 H69 L96 31 V69 L69 96 H31 L4 69 V31 Z", fill: "var(--ri)" }), _jsx("path", { d: "M33 33 L67 67 M67 33 L33 67", stroke: "#FFFFFF", strokeWidth: "11", strokeLinecap: "round" })] }));
    return (_jsxs("svg", { className: "bz-icon", viewBox: "0 0 100 100", role: "img", "aria-label": "Esperando", children: [_jsx("circle", { cx: "50", cy: "50", r: "43", fill: "none", stroke: "#B5C2BA", strokeWidth: "7" }), _jsx("path", { d: "M50 24 V50 L66 62", fill: "none", stroke: "#56665D", strokeWidth: "8", strokeLinecap: "round", strokeLinejoin: "round" })] }));
}
function Meta({ v }) {
    const meta = v.hurdle ?? 0, corr = v.corr ?? 0;
    const scale = Math.max(meta * 1.25, corr * 1.05, 1);
    const left = meta && v.corr != null ? Math.max(0, meta - corr) : null;
    return (_jsxs("div", { className: "bz-card bz-sm", children: [_jsxs("div", { className: "bz-head", children: [_jsx("b", { children: "La meta" }), _jsx("span", { className: "bz-dim", children: "libras por persona hoy" })] }), _jsxs("div", { className: "bz-nums", children: [_jsxs("div", { children: [_jsx("span", { className: "bz-cap", children: "Ahora" }), _jsx("b", { className: `bz-xl${v.won ? ' won' : ''}`, children: v.corr != null ? v.corr.toFixed(1) : '—' })] }), _jsxs("div", { children: [_jsx("span", { className: "bz-cap", children: "Meta" }), _jsx("b", { className: "bz-l", children: v.hurdle != null ? n0(v.hurdle) : '—' })] }), _jsxs("div", { children: [_jsx("span", { className: "bz-cap", children: v.won ? 'Arriba de la meta' : 'Faltan' }), _jsx("b", { className: "bz-l lv", children: left == null ? '—' : v.won ? '+' + n0(corr - meta) : n0(left) })] })] }), _jsxs("div", { className: "bz-bar", children: [_jsx("div", { className: "bz-track" }), _jsx("div", { className: `bz-fill${v.won ? ' won' : ''}`, style: { width: pct(corr, scale) } }), meta > 0 && _jsx("div", { className: "bz-mark", style: { left: pct(meta, scale) } })] }), _jsxs("div", { className: "bz-legend", children: [_jsx("span", { children: "Barra: libras por persona hasta ahora" }), _jsx("span", { children: "Negra: meta" })] })] }));
}
function Speed({ v }) {
    const lv = speedLevel(v.speed);
    const behind = !v.won && v.need != null && (v.speed == null || v.need > v.speed);
    return (_jsxs("div", { className: "bz-card bz-sm", children: [_jsxs("div", { className: "bz-head", children: [_jsx("b", { children: "Velocidad" }), _jsx("span", { className: "bz-dim", children: "libras por bucker por hora" })] }), _jsxs("div", { className: "bz-speed", children: [_jsx("b", { className: `bz-xl sp-${lv}`, children: v.speed != null ? Math.round(v.speed) : '—' }), _jsx("span", { children: v.won ? 'Meta ya alcanzada' : v.need == null ? '' : v.speed != null && v.need <= v.speed ? 'A este ritmo llegan a la meta' : `Necesitan ${Math.ceil(v.need)} para llegar a la meta` })] }), _jsxs("div", { className: "bz-bar", children: [_jsxs("div", { className: "bz-zones", children: [_jsx("i", { style: { width: pct(SPEED_RED, SPEED_MAX) } }), _jsx("i", { style: { width: pct(SPEED_YELLOW - SPEED_RED, SPEED_MAX) } }), _jsx("i", {})] }), v.speed != null && _jsx("div", { className: `bz-fill sp-${lv}`, style: { width: pct(Math.min(v.speed, SPEED_MAX), SPEED_MAX) } }), behind && _jsx("div", { className: "bz-mark", style: { left: pct(Math.min(v.need, SPEED_MAX), SPEED_MAX) } })] }), _jsxs("div", { className: "bz-legend", children: [_jsxs("span", { children: ["Rojo < ", SPEED_RED, " \u00B7 Amarillo ", SPEED_RED, " a ", SPEED_YELLOW, " \u00B7 Verde > ", SPEED_YELLOW] }), _jsx("span", { children: behind ? 'Negra: velocidad necesaria' : '' })] })] }));
}
function Bottom({ v }) {
    // speed at each pallet (last 28), grouped by variety, shaded per variety
    const shown = v.series.slice(-28);
    const groups = [];
    for (const s of shown) {
        const g = groups[groups.length - 1];
        if (g && g.strain === s.strain)
            g.bars.push(s);
        else
            groups.push({ strain: s.strain, bars: [s] });
    }
    const tiles = [
        { label: 'Libras empacadas', value: n0(v.packed), sub: 'hoy' },
        { label: 'Tarimas', value: String(v.pallets), sub: 'hoy' },
        { label: 'Min. por tarima', value: v.avgPalletMin != null ? v.avgPalletMin.toFixed(1) : '—', sub: 'promedio' },
        { label: 'Personas', value: v.people != null ? String(v.people) : '—', sub: v.buckers != null ? `${v.buckers} buckers` : '' },
        { label: 'Horas', value: v.workedH.toFixed(1), sub: `de ${v.estHours} trabajadas` },
    ];
    return (_jsxs("div", { className: "bz-bottom", children: [_jsxs("div", { className: "bz-card bz-spark", children: [_jsx("span", { className: "bz-cap", children: "Por tarima" }), _jsx("div", { className: "bz-groups", children: groups.length ? groups.map((g, i) => (_jsxs("div", { className: `bz-group b${i % 2}`, style: { flexGrow: g.bars.length }, children: [_jsx("span", { className: "bz-glab", children: g.strain }), _jsx("div", { className: "bz-bars", children: g.bars.map(b => _jsx("i", { className: `sp-${speedLevel(b.v)}`, style: { height: pct(Math.min(b.v, SPEED_MAX), SPEED_MAX) }, title: `${b.code} · ${Math.round(b.v)}` }, b.code)) })] }, i))) : _jsx("span", { className: "bz-dim", children: "Sin tarimas todav\u00EDa" }) })] }), tiles.map(t => _jsxs("div", { className: "bz-card bz-tile", children: [_jsx("span", { className: "bz-cap", children: t.label }), _jsx("b", { children: t.value }), _jsx("span", { className: "bz-dim", children: t.sub })] }, t.label))] }));
}
