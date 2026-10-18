import { nextTick, onMounted, onUnmounted, type Ref } from 'vue'

/** How far a finger has to move sideways to count as a swipe, unless it flicks. */
const MIN_DISTANCE = 60
const FLICK_SPEED = 0.4 // px per ms
/** Movement before deciding whether the finger goes sideways or scrolls the page. */
const LOCK_DISTANCE = 10
/** Swipes from the screen edges belong to the phone (back and forward gestures). */
const EDGE = 24

const OUT_MS = 140
const IN_MS = 220

/**
 * Swiping sideways anywhere on the screen moves to the next day, week or month (finger to the
 * left, `move(1)`) or the previous one (`move(-1)`). `area` follows the finger and slides out,
 * and the new one slides in from the other side. Rows that scroll sideways (the filter chips)
 * keep their own swipe.
 *
 * Returns `go`, for the arrows to slide the same way.
 */
export function useSwipe(area: Ref<HTMLElement | null>, move: (direction: 1 | -1) => unknown) {
  let start: { x: number; y: number; time: number } | null = null
  let axis: 'x' | 'y' | null = null
  let dx = 0
  let busy = false

  function onStart(e: TouchEvent) {
    const touch = e.touches[0]
    start = null
    axis = null
    dx = 0
    if (busy || e.touches.length !== 1 || !touch) return
    if (touch.clientX < EDGE || touch.clientX > window.innerWidth - EDGE) return
    if (inSideScroller(e.target)) return
    start = { x: touch.clientX, y: touch.clientY, time: e.timeStamp }
  }

  function onMove(e: TouchEvent) {
    const touch = e.touches[0]
    if (!start || !touch) return
    dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (!axis) {
      if (Math.abs(dx) > LOCK_DISTANCE && Math.abs(dx) > Math.abs(dy)) axis = 'x'
      else if (Math.abs(dy) > LOCK_DISTANCE) axis = 'y'
    }
    if (axis !== 'x') return
    // Sideways: the page doesn't scroll while the content follows the finger.
    e.preventDefault()
    if (area.value && !reducedMotion()) area.value.style.transform = `translateX(${dx}px)`
  }

  function onEnd(e: TouchEvent) {
    if (!start || axis !== 'x') {
      start = null
      return
    }
    const speed = Math.abs(dx) / Math.max(1, e.timeStamp - start.time)
    start = null
    if (Math.abs(dx) >= MIN_DISTANCE || (Math.abs(dx) > LOCK_DISTANCE * 2 && speed > FLICK_SPEED)) {
      void go(dx < 0 ? 1 : -1, dx)
    } else {
      settle()
    }
  }

  function onCancel() {
    if (start && axis === 'x') settle()
    start = null
  }

  /** Back to where it was, the finger didn't go far enough. */
  function settle() {
    const el = area.value
    if (!el) return
    el.style.transform = ''
    el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: IN_MS, easing: 'ease-out' })
  }

  async function go(direction: 1 | -1, from = 0) {
    const el = area.value
    if (!el || reducedMotion()) {
      await move(direction)
      return
    }
    busy = true
    try {
      const width = el.offsetWidth
      el.style.transform = ''
      await el.animate(
        [
          { transform: `translateX(${from}px)`, opacity: 1 },
          { transform: `translateX(${-direction * width}px)`, opacity: 0 },
        ],
        { duration: OUT_MS, easing: 'ease-in', fill: 'forwards' },
      ).finished
      await move(direction)
      await nextTick()
      el.getAnimations().forEach((a) => a.cancel())
      el.animate(
        [
          { transform: `translateX(${direction * width * 0.4}px)`, opacity: 0 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: IN_MS, easing: 'ease-out' },
      )
    } finally {
      busy = false
    }
  }

  onMounted(() => {
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onCancel, { passive: true })
  })
  onUnmounted(() => {
    window.removeEventListener('touchstart', onStart)
    window.removeEventListener('touchmove', onMove)
    window.removeEventListener('touchend', onEnd)
    window.removeEventListener('touchcancel', onCancel)
  })

  return go
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function inSideScroller(target: EventTarget | null): boolean {
  for (let el = target instanceof Element ? target : null; el; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true
  }
  return false
}
