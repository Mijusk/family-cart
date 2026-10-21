import { ref } from 'vue'

// Without connection: whether there is one, and the last data the server sent, kept on this
// device so the app can open without connection and show the shopping list as it was. Kept per
// account and dropped on signing out.

/** What the browser thinks; a request can still fail with it true (see isNetworkError). */
export const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)

const onlineWaiters: (() => void)[] = []

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    online.value = true
    onlineWaiters.splice(0).forEach((resolve) => resolve())
  })
  window.addEventListener('offline', () => (online.value = false))
}

/** Resolves at once with connection, else when it comes back. */
export function whenOnline(): Promise<void> {
  if (navigator.onLine) return Promise.resolve()
  return new Promise((resolve) => onlineWaiters.push(resolve))
}

const PREFIX = 'family-cart:offline:'
const USER_KEY = `${PREFIX}user`

// Storage can be unavailable or full (private mode, blocked site data): then there is simply no copy.

/** Saves the server's latest `value` under `key` for the signed-in account. */
export function saveSnapshot(userId: string, key: string, value: unknown) {
  try {
    localStorage.setItem(USER_KEY, userId)
    localStorage.setItem(`${PREFIX}${userId}:${key}`, JSON.stringify(value))
  } catch {
    // No copy; see above.
  }
}

export function readSnapshot<T>(userId: string, key: string): T | null {
  try {
    const raw = localStorage.getItem(`${PREFIX}${userId}:${key}`)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

/** The account the saved copies belong to: the one signed in on this device. */
export function snapshotUser(): string | null {
  try {
    return localStorage.getItem(USER_KEY)
  } catch {
    return null
  }
}

/** Forgets every copy (signing out). */
export function clearSnapshots() {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(PREFIX)) localStorage.removeItem(key)
  } catch {
    // Nothing to forget.
  }
}
