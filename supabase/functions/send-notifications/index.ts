// Sends what is waiting in public.notifications to every device of each person (Web Push).
// pg_cron wakes it every minute through public.dispatch_notifications(), with a shared secret
// in the x-notifications-secret header (it is deployed without JWT checks). Design notes:
// docs/notificaciones.md.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const env = (name: string) => {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing secret ${name}`)
  return value
}

webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

interface Notification {
  id: string
  person_id: string
  title: string
  body: string
  url: string
}

Deno.serve(async (req) => {
  if (req.headers.get('x-notifications-secret') !== env('NOTIFICATIONS_SECRET')) {
    return new Response('Forbidden', { status: 403 })
  }

  // Claimed by marking them sent first, so two runs at once never send the same one twice.
  // Older than an hour, they are no longer worth sending.
  const since = new Date(Date.now() - 3_600_000).toISOString()
  const { data: claimed, error } = await db
    .from('notifications')
    .update({ sent_at: new Date().toISOString() })
    .is('sent_at', null)
    .gt('created_at', since)
    .select('id, person_id, title, body, url')
  if (error) throw error
  const notifications = (claimed ?? []) as Notification[]
  if (!notifications.length) return Response.json({ sent: 0 })

  const people = [...new Set(notifications.map((n) => n.person_id))]
  const { data: devices, error: devicesError } = await db
    .from('push_subscriptions')
    .select('id, person_id, endpoint, p256dh, auth')
    .in('person_id', people)
  if (devicesError) throw devicesError

  let sent = 0
  const gone = new Set<string>()
  await Promise.all(
    notifications.flatMap((n) =>
      (devices ?? [])
        .filter((d) => d.person_id === n.person_id)
        .map(async (d) => {
          try {
            await webpush.sendNotification(
              { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
              JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: n.id }),
              { TTL: 3600, urgency: 'high' },
            )
            sent++
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode
            // The browser dropped this subscription (app uninstalled, permission withdrawn).
            if (status === 404 || status === 410) gone.add(d.id)
            else console.error('push failed', status, (e as Error).message)
          }
        }),
    ),
  )
  if (gone.size) await db.from('push_subscriptions').delete().in('id', [...gone])
  return Response.json({ notifications: notifications.length, sent, removed: gone.size })
})
