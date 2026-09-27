import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { RealtimeChannel, RealtimeSystemPayload } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { toGroup, toMember, type GroupRow, type MemberRow } from '@/lib/mappers'
import type { Group, Member } from '@/types'
import { useListStore } from './list'

/** loading → (no-group | ready); error if Supabase can't be reached. */
export type SessionStatus = 'loading' | 'no-group' | 'ready' | 'error'

export interface InvitePreview {
  id: string
  name: string
  memberCount: number
}

export const useGroupStore = defineStore('group', () => {
  const status = ref<SessionStatus>('loading')
  const errorMessage = ref<string | null>(null)
  const userId = ref<string | null>(null)
  const current = ref<Group | null>(null)
  const members = ref<Member[]>([])
  let channel: RealtimeChannel | null = null
  let initPromise: Promise<void> | null = null

  /** Screens behind the router guard only render once status is 'ready', so the group is always there. */
  const group = computed(() => current.value!)

  /** The member this device acts as, from member_identities (several devices can share one member). */
  const myMemberId = ref('')
  const currentMemberId = computed(() => myMemberId.value)

  const inviteUrl = computed(() => `${window.location.origin}/unirse/${current.value?.inviteCode ?? ''}`)

  function isMe(id: string | null): boolean {
    return id !== null && id === currentMemberId.value
  }

  /** Member name, or "Tú" for the current device's member. */
  function memberName(id: string | null): string {
    if (isMe(id)) return 'Tú'
    const member = members.value.find((m) => m.id === id)
    if (!member && id && !lookedUp.has(id)) {
      lookedUp.add(id)
      refreshSoon()
    }
    return member?.name ?? 'Alguien'
  }

  // An unknown member id means we missed someone joining; reload the member list (once per id).
  const lookedUp = new Set<string>()
  let refreshTimer: ReturnType<typeof setTimeout> | undefined
  function refreshSoon() {
    if (refreshTimer || !current.value) return
    const gid = current.value.id
    refreshTimer = setTimeout(() => {
      refresh(gid)
        .catch(console.error)
        .finally(() => (refreshTimer = undefined))
    }, 300)
  }

  // ── Session ────────────────────────────────────────────────

  /** Signs the device in (anonymously the first time) and loads its group. Safe to call repeatedly. */
  function init(): Promise<void> {
    initPromise ??= bootstrap()
    return initPromise
  }

  async function bootstrap() {
    status.value = 'loading'
    errorMessage.value = null
    try {
      const { data } = await supabase.auth.getSession()
      let uid = data.session?.user.id
      if (!uid) {
        const { data: signIn, error } = await supabase.auth.signInAnonymously()
        if (error) throw error
        uid = signIn.user!.id
      }
      userId.value = uid
      await loadGroup()
    } catch (e) {
      console.error(e)
      status.value = 'error'
      errorMessage.value = e instanceof Error ? e.message : String(e)
      initPromise = null
    }
  }

  /** Loads the given group, or the one this device joined most recently. */
  async function loadGroup(groupId?: string) {
    let query = supabase
      .from('member_identities')
      .select('group_id, member_id')
      .eq('user_id', userId.value!)
      .order('created_at', { ascending: false })
      .limit(1)
    if (groupId) query = query.eq('group_id', groupId)
    const { data, error } = await query
    if (error) throw error
    const identity = data[0]
    if (!identity) {
      status.value = 'no-group'
      return
    }

    const gid = identity.group_id
    myMemberId.value = identity.member_id
    await Promise.all([refresh(gid), useListStore().load(gid)])
    subscribe(gid)
    status.value = 'ready'
  }

  async function refresh(gid: string) {
    const [groupRes, membersRes] = await Promise.all([
      supabase.from('groups').select().eq('id', gid).single(),
      supabase.from('members').select().eq('group_id', gid).order('created_at'),
    ])
    if (groupRes.error) throw groupRes.error
    if (membersRes.error) throw membersRes.error
    current.value = toGroup(groupRes.data)
    members.value = membersRes.data.map(toMember)
  }

  function subscribe(gid: string) {
    if (channel) void supabase.removeChannel(channel)
    channel = supabase
      .channel(`group:${gid}`)
      .on<MemberRow>('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `group_id=eq.${gid}` }, (p) => {
        if (p.eventType === 'DELETE') {
          members.value = members.value.filter((m) => m.id !== p.old.id)
          return
        }
        const member = toMember(p.new)
        const index = members.value.findIndex((m) => m.id === member.id)
        if (index === -1) members.value.push(member)
        else members.value[index] = member
      })
      .on<GroupRow>('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'groups', filter: `id=eq.${gid}` }, (p) => {
        current.value = toGroup(p.new)
      })
      // Catch up on anything missed before the listeners were live: SUBSCRIBED also fires after a
      // reconnect (phone back from background), and the system event when Postgres changes actually start.
      .on('system', {}, (p: RealtimeSystemPayload) => {
        if (p.extension === 'postgres_changes' && p.status === 'ok') refresh(gid).catch(console.error)
      })
      .subscribe((state) => {
        if (state === 'SUBSCRIBED') refresh(gid).catch(console.error)
      })
  }

  // ── Create / join ──────────────────────────────────────────

  async function createGroup(groupName: string, memberName: string) {
    const { data, error } = await supabase.rpc('create_group', { group_name: groupName, member_name: memberName })
    if (error) throw error
    await loadGroup(data)
  }

  async function previewInvite(code: string): Promise<InvitePreview | null> {
    const { data, error } = await supabase.rpc('group_by_invite', { code })
    if (error) throw error
    const row = data[0]
    return row ? { id: row.id, name: row.name, memberCount: row.member_count } : null
  }

  /** Existing member whose name matches once normalized (case, accents, spaces), if any. */
  async function findMemberByName(code: string, memberName: string): Promise<{ id: string; name: string } | null> {
    const { data, error } = await supabase.rpc('check_member_name', { code, member_name: memberName })
    if (error) throw error
    return data[0] ?? null
  }

  /** Creates a new member. The server refuses a name already taken in the group ("member name taken"). */
  async function joinGroup(code: string, memberName: string) {
    const { data, error } = await supabase.rpc('join_group', { code, member_name: memberName })
    if (error) throw error
    await loadGroup(data)
  }

  /** "It's me on another device": this device becomes that existing member. */
  async function claimMember(code: string, memberId: string) {
    const { data, error } = await supabase.rpc('claim_member', { code, member_id: memberId })
    if (error) throw error
    await loadGroup(data)
  }

  return {
    status,
    errorMessage,
    group,
    members,
    currentMemberId,
    inviteUrl,
    isMe,
    memberName,
    init,
    createGroup,
    previewInvite,
    findMemberByName,
    joinGroup,
    claimMember,
  }
})
