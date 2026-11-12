import { useCallback, useState } from 'react'

// PHENO-SCORE-2 / SAVE-1: screen state that survives a refresh (F5, pull-to-refresh, iPhone reloading the page).
// Kept in sessionStorage: per browser tab, cleared when the tab closes, so two tabs can sit on different screens.
// Use it for where you are (tabs, filters, search, sort, year/site pickers, which record is open), not for forms or pop-ups.
export function readSaved<T>(key: string, fallback: T): T {
  try { const raw = sessionStorage.getItem('s.' + key); if (raw != null) return JSON.parse(raw) as T } catch { /* private window */ }
  return fallback
}
export function writeSaved(key: string, v: unknown) {
  try { if (v === undefined) sessionStorage.removeItem('s.' + key); else sessionStorage.setItem('s.' + key, JSON.stringify(v)) } catch { /* private window / full */ }
}
export function useSaved<T>(key: string, init: T | (() => T)): [T, (v: T | ((o: T) => T)) => void] {
  const [v, setV] = useState<T>(() => {
    try { const raw = sessionStorage.getItem('s.' + key); if (raw != null) return JSON.parse(raw) as T } catch { /* private window */ }
    return typeof init === 'function' ? (init as () => T)() : init
  })
  const set = useCallback((n: T | ((o: T) => T)) => setV(o => {
    const next = typeof n === 'function' ? (n as (o: T) => T)(o) : n
    writeSaved(key, next)
    return next
  }), [key])
  return [v, set]
}

/** BACK-1: forget what's open (drill-down) but keep filters: keys ending in .open / .openId, the open hunt, the open pheno, the open order and freezer */
export function clearDrill() {
  try {
    const drop: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i) ?? ''
      if (/^s\..*\.(open|openId|hunt|freezer|fOpen|screen)$/.test(k) || k === 'nur.lastPheno') drop.push(k)
    }
    drop.forEach(k => sessionStorage.removeItem(k))
  } catch { /* private window */ }
}
