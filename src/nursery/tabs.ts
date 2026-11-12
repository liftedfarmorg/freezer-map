import type { NTab } from './types'
// Nursery screens: shared by the app's navigation and the module itself
export const NURSERY_TABS: { t: NTab; l: string }[] = [
  { t: 'dashboard', l: 'Dashboard' }, { t: 'receiving', l: 'Receiving' }, { t: 'plan', l: 'Plan' }, { t: 'orders', l: 'Orders' }, { t: 'batches', l: 'Batches' }, { t: 'mothers', l: 'Mothers' }, { t: 'breeding', l: 'Breeding' }, { t: 'seedlots', l: 'Seed Lots' }, { t: 'phenohunts', l: 'Pheno Hunts' },
  { t: 'logs', l: 'Logs' }, { t: 'invoices', l: 'Invoices' },
]
/** bottom of the menu, same in every module ('settings' is Nursery Admins only) */
export const NURSERY_TAIL: { t: NTab; l: string }[] = [{ t: 'review', l: 'Review' }, { t: 'activity', l: 'Activity' }, { t: 'settings', l: 'Settings' }]
export const nurseryLabel = (t: NTab) => [...NURSERY_TABS, ...NURSERY_TAIL].find(x => x.t === t)?.l ?? 'Nursery'
export type { NTab }
// PHENO-PIC-3: the open pheno is remembered for 2 hours (Breeding > Pheno Hunts reopens it after the phone reloads the app)
export const LAST_PHENO = 'nur.lastPheno'
export function lastPheno(): { hunt: number; pheno: number } | null {
  try { const v = JSON.parse(sessionStorage.getItem(LAST_PHENO) ?? 'null'); return v && Date.now() - v.at < 2 * 3600e3 ? v : null } catch { return null }
}
