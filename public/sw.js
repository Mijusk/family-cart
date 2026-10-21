// Service worker: notifications, and the app itself so it opens without connection.
// The send-notifications Edge Function pushes { title, body, url, tag }.
//
// Pages go to the network first (a deploy is never stale) and fall back to the last copy. The
// build's files have a hash in their name, so a cached one is always right: they are cached when
// this worker installs (the list comes from /sw-precache.js, written by the build) and when used.
// Supabase is another origin and never goes through here.

try {
  importScripts('/sw-precache.js') // sets self.PRECACHE = { version, files }
} catch {
  // Dev server: there is no build, so nothing to precache.
}
const PRECACHE = self.PRECACHE ?? { version: 'dev', files: [] }
const CACHE_PREFIX = 'family-app-'
const CACHE = CACHE_PREFIX + PRECACHE.version
/** Where the app's page is kept: every route serves it (see vercel.json). */
const APP_PAGE = '/'
/** The files in public/ the app uses (the dev server's modules are left alone). */
const STATIC_FILES = /^\/(icons\/|favicon\.svg$|manifest\.webmanifest$)/

self.addEventListener('install', (event) => {
  self.skipWaiting()
  // A file that fails leaves it for when it is used; notifications must keep working anyway.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.all([APP_PAGE, ...PRECACHE.files].map((url) => cache.add(url).catch(() => {}))))
      .catch(() => {}),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/sw')) return
  if (request.mode === 'navigate') event.respondWith(networkFirst(request, APP_PAGE))
  else if (url.pathname.startsWith('/assets/')) event.respondWith(cacheFirst(request))
  else if (STATIC_FILES.test(url.pathname)) event.respondWith(networkFirst(request, request))
})

async function cacheFirst(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) void cache.put(request, response.clone())
  return response
}

/** The network's answer, kept under `key`; without connection, the last one kept. */
async function networkFirst(request, key) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) void cache.put(key, response.clone())
    return response
  } catch (e) {
    const cached = await cache.match(key)
    if (cached) return cached
    throw e
  }
}

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Family App', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: data.tag,
      lang: 'es',
      data: { url: data.url || '/' },
    }),
  )
})

// Tapping it opens the app there: in a window already open if there is one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin)
      if (open && 'navigate' in open) {
        return open.navigate(url).then((w) => (w ?? open).focus()).catch(() => self.clients.openWindow(url))
      }
      return self.clients.openWindow(url)
    }),
  )
})
