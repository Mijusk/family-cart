// Service worker: only notifications for now (no offline cache, so a deploy is never stale).
// The send-notifications Edge Function pushes { title, body, url, tag }.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

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
