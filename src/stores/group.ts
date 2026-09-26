import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import * as seed from '@/mocks/seed'
import type { Group, Member } from '@/types'

export const useGroupStore = defineStore('group', () => {
  const group = ref<Group>(structuredClone(seed.group))
  const members = ref<Member[]>(structuredClone(seed.members))
  const currentMemberId = ref(seed.CURRENT_MEMBER_ID)

  const me = computed(() => members.value.find((m) => m.id === currentMemberId.value)!)

  const inviteUrl = computed(() => `${window.location.origin}/unirse/${group.value.inviteCode}`)

  function isMe(id: string | null): boolean {
    return id === currentMemberId.value
  }

  /** Member name, or "Tú" for the current device's member. */
  function memberName(id: string | null): string {
    if (isMe(id)) return 'Tú'
    return members.value.find((m) => m.id === id)?.name ?? 'Alguien'
  }

  return { group, members, currentMemberId, me, inviteUrl, isMe, memberName }
})
