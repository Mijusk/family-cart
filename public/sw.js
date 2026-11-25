// Service worker: notifications, and the app itself so it opens without connection.
// The send-notifications Edge Function pushes { title, body, url, tag }.
//
// Pages go to the network first (a deploy is never stale) and fall back to the last copy, also
// when the network takes too long. The build's files have a hash in their name, so a cached one is
// always right: they are cached when this worker installs (the list comes from /sw-precache.js, written by the build) and when used.
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
/** With a copy to show, how long a page waits for a slow network. */
const PATIENCE_MS = 4000
/** How long an open window has to say it goes to a notification's screen by itself. */
const ANSWER_MS = 1500
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
  if (STATIC_FILES.test(url.pathname)) event.respondWith(networkFirst(event, request))
  else if (request.mode === 'navigate') event.respondWith(networkFirst(event, APP_PAGE, PATIENCE_MS))
  else if (url.pathname.startsWith('/assets/')) event.respondWith(cacheFirst(request))
})

async function cacheFirst(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) void cache.put(request, response.clone())
  return response
}

/**
 * The network's answer, kept under `key`; without connection, or past `patience`, the last one
 * kept (the answer is still kept for the next time when it comes).
 */
async function networkFirst(event, key, patience) {
  const cache = await caches.open(CACHE)
  const network = fetch(event.request).then((response) => {
    if (response.ok && !response.redirected) void cache.put(key, response.clone())
    return response
  })
  event.waitUntil(network.catch(() => {}))
  const cached = await cache.match(key)
  if (!cached) return network
  const tooLong = patience ? new Promise((resolve) => setTimeout(resolve, patience, cached)) : network
  return Promise.race([network, tooLong]).catch(() => cached)
}

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    Promise.all([
      showIt(data),
      // An open app puts it on the bell's list straight away.
      self.clients.matchAll({ type: 'window' }).then((windows) => windows.forEach((w) => w.postMessage({ type: 'notification' }))),
    ]),
  )
})

function showIt(data) {
  return self.registration.showNotification(data.title || 'Family-App', {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: data.tag,
    lang: 'es',
    data: { url: data.url || '/' },
  })
}

// Tapping it opens the app there: in a window already open if there is one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(openAt(new URL(event.notification.data?.url || '/', self.location.origin)))
})

/**
 * An open window goes there by itself, as with any link: what is being typed isn't lost without
 * asking, nor the shopping changes still to be saved. One that doesn't answer (an older version of
 * the app) is taken there by loading the page.
 */
async function openAt(url) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const open = windows.find((w) => new URL(w.url).origin === self.location.origin)
  if (!open) return self.clients.openWindow(url.href)
  await open.focus().catch(() => {})
  if (await goesByItself(open, url.pathname + url.search + url.hash)) return
  return open.navigate(url.href).catch(() => self.clients.openWindow(url.href))
}

function goesByItself(client, path) {
  return new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel()
    port1.onmessage = () => resolve(true)
    setTimeout(resolve, ANSWER_MS, false)
    client.postMessage({ type: 'open', path }, [port2])
  })
}
