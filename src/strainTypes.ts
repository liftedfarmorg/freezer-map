// TYPE-AUTO-1: one list of strain types for the whole app (menus, reserves, settings, item cards).
// Autoflower sits outside the indica / sativa scale: it keeps whatever indica / sativa % the strain already has.
export const STRAIN_TYPES = ['Indica', 'Indica Hybrid', 'Hybrid', 'Sativa Hybrid', 'Sativa', 'Autoflower'] as const
export const TYPE_SHORT: Record<string, string> = { Sativa: 'S', 'Sativa Hybrid': 'S/H', Hybrid: 'H', 'Indica Hybrid': 'I/H', Indica: 'I', Autoflower: 'A' }
export const TYPE_LONG: Record<string, string> = { S: 'Sativa', 'S/H': 'Sativa hybrid', H: 'Hybrid', 'I/H': 'Indica hybrid', I: 'Indica', A: 'Autoflower' }
export const TYPE_ORDER: Record<string, number> = { S: 1, 'S/H': 2, H: 3, 'I/H': 4, I: 5, A: 6 }
/** short code for a type given either way ('Indica Hybrid' or 'I/H') */
export const typeShort = (t: string | null | undefined) => (t ? TYPE_SHORT[t] ?? (t in TYPE_LONG ? t : null) : null)
/** chip color class (t-s, t-sh, t-h, t-ih, t-i, t-a) in restyle.css, with a leading space */
export const tcls = (t: string | null | undefined) => { const s = typeShort(t); return s ? ` t-${s.toLowerCase().replace('/', '')}` : '' }
