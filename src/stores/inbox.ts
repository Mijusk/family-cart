import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { toInboxNotification } from '@/lib/mappers'
import type { InboxNotification } from '@/types'
import { useGroupStore } from './group'

// The bell: the latest notifications of the signed-in person, whether or not a device received
// them (the database keeps them 30 days). Unread = newer than people.notifications_seen_at.
// Design notes: docs/notificaciones.md §5.

const LIMIT = 50

export const useInboxStore = defineStore('inbox', () => {
  const groupStore = useGroupStore()
  const items = ref<InboxNotification[]>([])
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')

  const seenAt = computed(() => {
    const at = groupStore.me?.notificationsSeenAt
    return at ? Date.parse(at) : 0
  })

  function isUnread(n: InboxNotification, since = seenAt.value): boolean {
    return Date.parse(n.createdAt) > since
  }

  const unreadCount = computed(() => items.value.filter((n) => isUnread(n)).length)

  let loading: Promise<void> | null = null

  /** Loads the list; quietly (keeping what is on screen) when it is already there. */
  function load(): Promise<void> {
    loading ??= (async () => {
      if (status.value !== 'ready') status.value = 'loading'
      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('id, kind, title, body, url, created_at')
          .order('created_at', { ascending: false })
          .limit(LIMIT)
        if (error) throw error
        items.value = data.map(toInboxNotification)
        status.value = 'ready'
      } catch (e) {
        console.error('inbox', e)
        if (status.value !== 'ready') status.value = 'error'
      } finally {
        loading = null
      }
    })()
    return loading
  }

  /** Everything on the list counts as seen (on every device of this person). */
  async function markSeen() {
    const me = groupStore.me
    if (!me || unreadCount.value === 0) return
    const { error } = await supabase.rpc('mark_notifications_seen')
    if (error) {
      console.error('inbox', error)
      return
    }
    groupStore.me = { ...me, notificationsSeenAt: new Date().toISOString() }
  }

  // Another account on this device: nothing of the previous one stays.
  watch(
    () => groupStore.userId,
    () => {
      items.value = []
      status.value = 'idle'
    },
  )

  return { items, status, unreadCount, seenAt, isUnread, load, markSeen }
})
