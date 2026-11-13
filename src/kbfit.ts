// Msg KB-1 (Tiffani, 11/13): on phones the keyboard covered the Notes box in the pheno card, so you couldn't see what you typed.
// iPhones don't shrink the page when the keyboard opens, so a pop-up kept running down behind the keyboard and the box you
// were typing in could sit under it. Now, while the keyboard is up, every pop-up is cut to the part of the screen above the
// keyboard (--vvh, html.kb) and the box you're typing in is scrolled into the middle of what's visible.
// Works for every pop-up in the app, not just the pheno card.

const NOT_TYPING = /^(checkbox|radio|button|submit|reset|file|range|color|image|hidden)$/

function typingIn(el: Element | null): el is HTMLElement {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true
  if (el instanceof HTMLInputElement) return !NOT_TYPING.test(el.type)
  return (el as HTMLElement).isContentEditable === true
}

export function installKeyboardFit() {
  const vv = window.visualViewport
  if (!vv) return
  const root = document.documentElement
  let full = vv.height          // visible height with no keyboard (updated whenever nobody is typing)
  let tReveal = 0

  const update = () => {
    const typing = typingIn(document.activeElement)
    if (!typing) full = vv.height
    const open = typing && vv.height < full - 120     // a keyboard is at least ~200 px; toolbars moving are less
    root.classList.toggle('kb', open)
    if (open) root.style.setProperty('--vvh', `${Math.round(vv.height)}px`)
    else root.style.removeProperty('--vvh')
  }

  // scroll the box you're typing in to the middle of the visible part, only if it's hidden or right at an edge
  const reveal = () => {
    const el = document.activeElement
    if (!typingIn(el) || !el.closest('.sheet')) return
    const r = el.getBoundingClientRect()
    const top = vv.offsetTop, bottom = vv.offsetTop + vv.height
    if (r.top < top + 60 || r.bottom > bottom - 16) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
  const revealSoon = (ms: number) => { clearTimeout(tReveal); tReveal = window.setTimeout(reveal, ms) }

  vv.addEventListener('resize', () => { update(); if (root.classList.contains('kb')) revealSoon(60) })
  document.addEventListener('focusin', () => { update(); revealSoon(350) })      // 350 ms: let the keyboard finish sliding up
  document.addEventListener('focusout', () => setTimeout(update, 120))
  update()
}
