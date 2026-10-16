import { onScopeDispose, ref, watch, type Ref, type WatchSource } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

// "X está editando este evento": Realtime Presence on one channel per event. Whoever has the
// edit form open is tracked; the event card only listens. Last save wins (docs/calendario.md).

interface Editor {
  personId: string
  name: string
}

/**
 * Names of the other people editing `eventId` right now. When `me` is given, I count as
 * editing it too. Call from a component's setup; it leaves the channel when the component goes.
 */
export function useEditors(eventId: WatchSource<string | null>, me?: () => Editor | null): Ref<string[]> {
  const names = ref<string[]>([])
  let channel: RealtimeChannel | null = null
  const myId = () => me?.()?.personId ?? null

  function leave() {
    if (channel) void supabase.removeChannel(channel)
    channel = null
    names.value = []
  }

  watch(
    eventId,
    (id) => {
      leave()
      if (!id) return
      const ch = supabase.channel(`event-edit:${id}`)
      ch.on('presence', { event: 'sync' }, () => {
        const others = new Map<string, string>()
        for (const entries of Object.values(ch.presenceState<Editor>())) {
          for (const e of entries) if (e.personId !== myId()) others.set(e.personId, e.name)
        }
        names.value = [...others.values()]
      }).subscribe((state) => {
        const editor = me?.()
        if (state === 'SUBSCRIBED' && editor) void ch.track(editor)
      })
      channel = ch
    },
    { immediate: true },
  )

  onScopeDispose(leave)
  return names
}

/** "Daniel", "Daniel y Marta", "Daniel, Marta y Lucía". */
export function namesList(names: string[]): string {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`
}
