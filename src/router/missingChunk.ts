import type { Router } from 'vue-router'
import { useListStore } from '@/stores/list'
import { useToastStore } from '@/stores/toast'

// A deploy replaces the files of the previous build. With the app open since before, a screen not
// opened yet asks for a file that is gone: the new version is loaded, already on that screen.

const LAST_KEY = 'family-app:reloaded-for-chunk'
/** Failing again this soon is not an old build: reloading once more wouldn't help. */
const AGAIN_MS = 20_000

/** How Chrome, Firefox and Safari (and Vite, for styles) say a lazy screen's file didn't load. */
export function isMissingChunk(error: unknown): boolean {
  return /dynamically imported module|importing a module script failed|unable to preload css/i.test(
    error instanceof Error ? error.message : String(error),
  )
}

function reloadedJustNow(): boolean {
  try {
    const last = Number(sessionStorage.getItem(LAST_KEY))
    sessionStorage.setItem(LAST_KEY, String(Date.now()))
    return Date.now() - last < AGAIN_MS
  } catch {
    return true // Without storage there is no telling: better not risk reloading in a loop.
  }
}

export function reloadOnMissingChunk(router: Router) {
  router.onError((error, to) => {
    if (!isMissingChunk(error)) return
    // Reloading would lose the shopping changes still waiting to be saved.
    if (!navigator.onLine || useListStore().pendingWrites || reloadedJustNow()) {
      useToastStore().show('No se ha podido abrir esa pantalla. Comprueba la conexión y vuelve a probar.')
      return
    }
    window.location.assign(router.resolve(to.fullPath).href)
  })
}
