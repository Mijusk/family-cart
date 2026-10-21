import type { NotificationKind } from '@/types'
import { supabase } from './supabase'

// Notifications on this device (Web Push). The service worker (public/sw.js) shows them; the
// send-notifications Edge Function sends them. Design notes: docs/notificaciones.md.

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

/**
 * What this device can do:
 * - unsupported: the browser has no Web Push, or the app has no key configured.
 * - install-first: an iPhone or iPad with the app open in Safari; it has to be on the home screen.
 * - denied: notifications were blocked for this site; only the browser's settings undo it.
 * - off / on: ready to turn on, or already on.
 */
export type PushState = 'unsupported' | 'install-first' | 'denied' | 'off' | 'on'

/** Each kind a person can turn off (people.muted_notifications), in the order Cuenta lists them. */
export const NOTIFICATION_KINDS: { kind: NotificationKind; label: string }[] = [
  { kind: 'event_reminder', label: 'Recordatorios de eventos' },
  { kind: 'event_changed', label: 'Cambios en tus eventos' },
  { kind: 'task_assigned', label: 'Tareas que te asignan' },
  { kind: 'task_due', label: 'Tareas para hoy' },
  { kind: 'join_request', label: 'Solicitudes para entrar en tus grupos' },
  { kind: 'member_approved', label: 'Cuando te aceptan en un grupo' },
]

const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** Opened from the home screen icon, not from a browser tab. */
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** Registered once at start: notifications, and the app cached to open without connection (see public/sw.js). */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.register('/sw.js').catch((e) => console.error('service worker', e))
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration('/')
  return (await registration?.pushManager.getSubscription()) ?? null
}

export async function pushState(): Promise<PushState> {
  if (isIos() && !isStandalone()) return 'install-first'
  if (!supported() || !VAPID_PUBLIC_KEY) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted') return 'off'
  return (await currentSubscription()) ? 'on' : 'off'
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

/**
 * Asks for permission (it has to follow a tap) and saves this device for the signed-in person.
 * Returns the state it ends in: 'on', or 'denied' / 'off' if the person said no.
 */
export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
  const registration = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY!) }))
  const json = subscription.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', {
    endpoint: subscription.endpoint,
    p256dh: json.keys!.p256dh!,
    auth: json.keys!.auth!,
  })
  if (error) throw error
  return 'on'
}

/** Stops notifications on this device. Also on signing out, so the next person doesn't get mine. */
export async function disablePush() {
  if (!supported()) return
  const subscription = await currentSubscription()
  if (!subscription) return
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
  await subscription.unsubscribe()
  if (error) throw error
}
