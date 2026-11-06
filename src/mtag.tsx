// METRC tags on screen (restyle, Msg #264): the full tag on computers and tablets, the last digits on phones.
// One solid string, no spaces. Exports always use the full tag (they never go through here).
export const isPhone = () => { try { return window.matchMedia('(max-width: 767px)').matches } catch { return false } }

/** a tag in running text: full on computer/tablet, …last n on a phone */
export const tagTxt = (t: string | null | undefined, n = 6) => !t ? '' : isPhone() ? `…${t.slice(-n)}` : t

/** a tag as its own element: full on computer/tablet, …last n on a phone (switches with the screen width) */
export function MTag({ t, n = 6, className = '' }: { t: string | null | undefined; n?: number; className?: string }) {
  if (!t) return null
  return <span className={`mtag mono ${className}`} title={t}><span className="mtag-full">{t}</span><span className="mtag-short">…{t.slice(-n)}</span></span>
}

/** flowering plantings: the last 7 digits of the first and last tags in the range */
export const rangeTxt = (a: string, b: string) => `${a.slice(-7)} – ${b.slice(-7)}`
