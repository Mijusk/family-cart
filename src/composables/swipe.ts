import { onMounted, onUnmounted } from 'vue'

/** How far and how straight a finger has to move sideways to count as a swipe. */
const MIN_DISTANCE = 60
const MAX_SLOPE = 0.6
const MAX_DURATION = 600
/** Swipes from the screen edges belong to the phone (back and forward gestures). */
const EDGE = 24

/**
 * Calls `onSwipe(1)` when the finger moves to the left (next day, week or month) and
 * `onSwipe(-1)` when it moves to the right, anywhere on the screen while the view is mounted.
 * Rows that scroll sideways (the filter chips) keep their own swipe.
 */
export function useSwipe(onSwipe: (direction: 1 | -1) => void) {
  let start: { x: number; y: number; time: number } | null = null

  function onStart(e: TouchEvent) {
    const touch = e.touches[0]
    start = null
    if (e.touches.length !== 1 || !touch) return
    if (touch.clientX < EDGE || touch.clientX > window.innerWidth - EDGE) return
    if (inSideScroller(e.target)) return
    start = { x: touch.clientX, y: touch.clientY, time: e.timeStamp }
  }

  function onEnd(e: TouchEvent) {
    const touch = e.changedTouches[0]
    if (!start || !touch) return
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    const quick = e.timeStamp - start.time < MAX_DURATION
    start = null
    if (quick && Math.abs(dx) >= MIN_DISTANCE && Math.abs(dy) <= Math.abs(dx) * MAX_SLOPE) onSwipe(dx < 0 ? 1 : -1)
  }

  function onCancel() {
    start = null
  }

  onMounted(() => {
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onCancel, { passive: true })
  })
  onUnmounted(() => {
    window.removeEventListener('touchstart', onStart)
    window.removeEventListener('touchend', onEnd)
    window.removeEventListener('touchcancel', onCancel)
  })
}

function inSideScroller(target: EventTarget | null): boolean {
  for (let el = target instanceof Element ? target : null; el; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true
  }
  return false
}
