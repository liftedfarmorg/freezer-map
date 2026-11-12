// SAVE-1 / PHENO-SCORE-2: on a computer, click and drag inside any scrolling table (.cwrap) to pan it, so columns off to the side
// can be reached without hunting for the scrollbar (e.g. the pheno table while a card is open beside it).
// A plain click still works: panning only starts after the mouse moves 6px, and then that click is swallowed.
export function installDragScroll() {
  let box: HTMLElement | null = null, x0 = 0, y0 = 0, l0 = 0, t0 = 0, moved = false
  const skip = (el: Element) => !!el.closest('input, textarea, select, button, a, label, [contenteditable="true"], .nodrag')
  document.addEventListener('mousedown', e => {
    if (e.button !== 0) return
    const t = e.target as Element
    const b = t.closest?.('.cwrap') as HTMLElement | null
    if (!b || skip(t) || (b.scrollWidth <= b.clientWidth && b.scrollHeight <= b.clientHeight)) return
    box = b; x0 = e.clientX; y0 = e.clientY; l0 = b.scrollLeft; t0 = b.scrollTop; moved = false
  })
  document.addEventListener('mousemove', e => {
    if (!box) return
    const dx = e.clientX - x0, dy = e.clientY - y0
    if (!moved && Math.abs(dx) + Math.abs(dy) < 6) return
    if (!moved) { moved = true; box.classList.add('dragging'); window.getSelection()?.removeAllRanges() }
    box.scrollLeft = l0 - dx; box.scrollTop = t0 - dy
    e.preventDefault()
  })
  document.addEventListener('mouseup', () => {
    if (!box) return
    box.classList.remove('dragging'); box = null
    if (moved) { const stop = (ev: Event) => { ev.stopPropagation(); ev.preventDefault() }; document.addEventListener('click', stop, { capture: true, once: true }); setTimeout(() => document.removeEventListener('click', stop, { capture: true }), 80) }
  })
}
