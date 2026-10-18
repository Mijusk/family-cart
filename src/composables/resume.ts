import { onMounted, onUnmounted } from 'vue'

/** Away for less than this (a glance at a notification) doesn't count as coming back. */
const AWAY_MS = 30_000

/**
 * Calls `onResume` when the app comes back after a while in the background, or when the
 * connection comes back. Realtime reconnects by itself too, but on phones that can take a while.
 */
export function useOnResume(onResume: () => void) {
  let hiddenAt: number | null = null

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      return
    }
    const away = hiddenAt === null ? 0 : Date.now() - hiddenAt
    hiddenAt = null
    if (away > AWAY_MS) onResume()
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('online', onResume)
  })
  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('online', onResume)
  })
}
