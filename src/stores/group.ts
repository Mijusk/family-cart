import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { isAuthRetryableFetchError, type RealtimeChannel, type RealtimeSystemPayload } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { toGroup, toMember, toPerson, type GroupRow } from '@/lib/mappers'
import type { Group, Member, MemberRole, Membership, NotificationKind, Person } from '@/types'
import { errorText, isNetworkError } from '@/utils/errors'
import { useCalendarStore } from './calendar'
import { useListStore } from './list'
import { useTasksStore } from './tasks'

/**
 * loading → signed-out | no-group | ready; error if Supabase can't be reached.
 * no-group: signed in, but not an active member of any group (maybe waiting for approval).
 */
export type SessionStatus = 'loading' | 'signed-out' | 'no-group' | 'ready' | 'error'

export interface InvitePreview {
  id: string
  name: string
  memberCount: number
}

export interface GroupSettings {
  name?: string
  shoppingEnabled?: boolean
  calendarEnabled?: boolean
  tasksEnabled?: boolean
}

/** A membership row with its group's name, as loadMe and loadMemberships read it. */
interface MembershipRow {
  id: string
  group_id: string
  role: string
  status: string
  created_at: string
  groups: { name: string } | null
}

/** Last group opened on this device, so the app reopens it next time. */
const ACTIVE_GROUP_KEY = 'family-cart:active-group'

// Storage can be unavailable (private mode, blocked site data); the app then just opens the newest group.
function readActiveGroup(): string | null {
  try {
    return localStorage.getItem(ACTIVE_GROUP_KEY)
  } catch {
    return null
  }
}

function writeActiveGroup(groupId: string | null) {
  try {
    if (groupId) localStorage.setItem(ACTIVE_GROUP_KEY, groupId)
    else localStorage.removeItem(ACTIVE_GROUP_KEY)
  } catch {
    // Not remembered; see readActiveGroup.
  }
}

export const useGroupStore = defineStore('group', () => {
  const status = ref<SessionStatus>('loading')
  const errorMessage = ref<string | null>(null)
  /** Whether the last failed load never reached the server, as opposed to the server answering with an error. */
  const offline = ref(false)
  const userId = ref<string | null>(null)
  const email = ref<string | null>(null)
  /** The signed-in person. */
  const me = ref<Person | null>(null)
  const current = ref<Group | null>(null)
  /** Everyone who has ever been in the current group, pending requests included. */
  const members = ref<Member[]>([])
  /** Every group this person is in or has asked to join, newest first. */
  const memberships = ref<Membership[]>([])
  let channel: RealtimeChannel | null = null
  let myChannel: RealtimeChannel | null = null
  /** Group being shown (or opened); late answers for any other group are discarded. */
  let activeGroupId: string | null = null
  let initPromise: Promise<void> | null = null
  let listening = false

  /** Screens behind the router guard only render once status is 'ready', so the group is always there. */
  const group = computed(() => current.value!)

  /** The member this person is in the current group. */
  const myMemberId = ref('')
  const currentMemberId = computed(() => myMemberId.value)

  /** People currently in the group; those who left stay in `members` so the history keeps their names. */
  const activeMembers = computed(() => members.value.filter((m) => m.status === 'active' && !m.leftAt))
  const pendingMembers = computed(() => members.value.filter((m) => m.status === 'pending' && !m.leftAt))

  const isAdmin = computed(() => members.value.some((m) => m.id === myMemberId.value && m.role === 'admin'))

  const activeMemberships = computed(() => memberships.value.filter((m) => m.status === 'active'))
  const pendingMemberships = computed(() => memberships.value.filter((m) => m.status === 'pending'))

  const inviteUrl = computed(() => `${window.location.origin}/unirse/${current.value?.inviteCode ?? ''}`)

  function isMe(id: string | null): boolean {
    return id !== null && id === currentMemberId.value
  }

  /** Member name, or "Tú" for the signed-in person's member. */
  function memberName(id: string | null): string {
    if (isMe(id)) return 'Tú'
    const member = members.value.find((m) => m.id === id)
    if (!member && id && !lookedUp.has(id)) {
      lookedUp.add(id)
      refreshSoon()
    }
    return member?.name ?? 'Alguien'
  }

  function memberColor(id: string | null): string | undefined {
    return members.value.find((m) => m.id === id)?.color
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

  /** Loads the session and its group. Safe to call repeatedly. */
  function init(): Promise<void> {
    listenToAuth()
    initPromise ??= bootstrap()
    return initPromise
  }

  /** Starts over after signing in or out. */
  function reload(): Promise<void> {
    initPromise = null
    return init()
  }

  async function bootstrap() {
    status.value = 'loading'
    errorMessage.value = null
    try {
      const { data, error } = await supabase.auth.getSession()
      // Offline: show the retry screen. Any other auth error (an expired or revoked session) means
      // signing in again.
      if (error && isAuthRetryableFetchError(error)) throw error
      const user = error ? null : data.session?.user
      if (!user) {
        clearSession()
        status.value = 'signed-out'
        return
      }
      userId.value = user.id
      email.value = user.email ?? null
      // Sessions from before email accounts (anonymous devices) have no person: start over.
      if (user.is_anonymous || !(await loadMe())) {
        // Cleared first, so the SIGNED_OUT event this fires doesn't start another reload.
        clearSession()
        await supabase.auth.signOut({ scope: 'local' })
        status.value = 'signed-out'
        return
      }
      subscribeToMine()
      await pickGroup()
    } catch (e) {
      fail(e)
    }
  }

  /** Signing in or out on this tab or another one starts the app over for the new session. */
  function listenToAuth() {
    if (listening) return
    listening = true
    supabase.auth.onAuthStateChange((event, session) => {
      const newUser = session?.user.id ?? null
      const signedOut = event === 'SIGNED_OUT' && userId.value !== null
      const otherUser = newUser !== null && userId.value !== null && newUser !== userId.value
      if (signedOut || otherUser) {
        // Deferred: Supabase calls this while holding its auth lock, and reload() queries again.
        setTimeout(() => void reload(), 0)
      } else if (event === 'USER_UPDATED' && session) {
        email.value = session.user.email ?? null
      }
    })
  }

  /** Shows the error screen; its retry button runs init() again from scratch. */
  function fail(e: unknown) {
    console.error(e)
    status.value = 'error'
    errorMessage.value = errorText(e) || 'Error desconocido'
    offline.value = isNetworkError(e) || isAuthRetryableFetchError(e)
    initPromise = null
  }

  function clearSession() {
    closeGroup()
    if (myChannel) void supabase.removeChannel(myChannel)
    myChannel = null
    userId.value = null
    email.value = null
    me.value = null
    memberships.value = []
  }

  /**
   * Loads the signed-in person with their groups; false if this account has none. One request,
   * since every round trip adds to the first load on a phone.
   */
  async function loadMe(): Promise<boolean> {
    const { data, error } = await supabase
      .from('people')
      .select('*, members!members_person_id_fkey(id, group_id, role, status, created_at, groups(name))')
      .eq('user_id', userId.value!)
      .is('members.left_at', null)
      .order('created_at', { referencedTable: 'members', ascending: false })
      .maybeSingle()
    if (error) throw error
    me.value = data ? toPerson(data) : null
    memberships.value = data ? data.members.map(toMembership) : []
    return !!data
  }

  async function loadMemberships() {
    const { data, error } = await supabase
      .from('members')
      .select('id, group_id, role, status, created_at, groups(name)')
      .eq('person_id', me.value!.id)
      .is('left_at', null)
      .order('created_at', { ascending: false })
    if (error) throw error
    memberships.value = data.map(toMembership)
  }

  function toMembership(d: MembershipRow): Membership {
    return {
      groupId: d.group_id,
      // A pending member can't see the group yet.
      groupName: d.groups?.name ?? '',
      memberId: d.id,
      role: d.role as MemberRole,
      status: d.status as Membership['status'],
      joinedAt: d.created_at,
    }
  }

  /** Opens `groupId` if given, else the last group opened on this device, else the newest one. */
  async function loadGroup(groupId?: string) {
    await loadMemberships()
    await pickGroup(groupId)
  }

  /** As loadGroup, with the memberships already loaded. */
  async function pickGroup(groupId?: string) {
    const wanted = groupId ?? readActiveGroup()
    const active = activeMemberships.value
    const target = active.find((m) => m.groupId === wanted) ?? active[0]
    if (!target) {
      closeGroup()
      status.value = 'no-group'
      return
    }
    await openGroup(target)
  }

  async function openGroup(membership: Membership) {
    // Remembered first, so a retry after a failed load reopens this group.
    writeActiveGroup(membership.groupId)
    activeGroupId = membership.groupId
    myMemberId.value = membership.memberId
    lookedUp.clear()
    await Promise.all([refresh(membership.groupId), useListStore().load(membership.groupId)])
    subscribe(membership.groupId)
    status.value = 'ready'
  }

  /** Stops listening to the current group and forgets its data. */
  function closeGroup() {
    if (channel) void supabase.removeChannel(channel)
    channel = null
    activeGroupId = null
    current.value = null
    members.value = []
    myMemberId.value = ''
    useListStore().unload()
    useCalendarStore().unload()
    useTasksStore().unload()
  }

  /** Every screen follows: lists, history and group all read the active group. */
  async function switchGroup(groupId: string) {
    const target = activeMemberships.value.find((m) => m.groupId === groupId)
    if (!target || groupId === current.value?.id) return
    status.value = 'loading'
    try {
      await openGroup(target)
    } catch (e) {
      fail(e)
    }
  }

  function isActiveMemberOf(groupId: string): boolean {
    return activeMemberships.value.some((m) => m.groupId === groupId)
  }

  function isPendingIn(groupId: string): boolean {
    return pendingMemberships.value.some((m) => m.groupId === groupId)
  }

  async function refresh(gid: string) {
    // The group, its members and their people in one request.
    const { data, error } = await supabase
      .from('groups')
      .select('*, members(*, people!members_person_id_fkey(*))')
      .eq('id', gid)
      .order('created_at', { referencedTable: 'members' })
      .single()
    if (error) throw error
    // Switched group while loading: this answer belongs to the old one.
    if (gid !== activeGroupId) return
    current.value = toGroup(data)
    members.value = data.members.map((m) => toMember(m, m.people ? toPerson(m.people) : undefined))
    const mine = data.members.find((m) => m.person_id === me.value?.id)?.people
    if (mine) me.value = toPerson(mine)
    renameMembership(current.value)
  }

  function renameMembership(group: Group) {
    const membership = memberships.value.find((m) => m.groupId === group.id)
    if (membership) membership.groupName = group.name
  }

  function subscribe(gid: string) {
    if (channel) void supabase.removeChannel(channel)
    // Member and person changes are rare (joins, approvals, renames): reloading the whole
    // list is simpler than patching it, and keeps names and roles consistent.
    channel = supabase
      .channel(`group:${gid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `group_id=eq.${gid}` }, () =>
        refreshSoon(),
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'people' }, () => refreshSoon())
      .on<GroupRow>('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'groups', filter: `id=eq.${gid}` }, (p) => {
        current.value = toGroup(p.new)
        renameMembership(current.value)
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

  /**
   * My own membership rows: being approved, removed or made admin anywhere. A pending request
   * that gets approved opens that group; losing the current group opens another one.
   */
  function subscribeToMine() {
    if (myChannel) void supabase.removeChannel(myChannel)
    const pid = me.value!.id
    myChannel = supabase
      .channel(`person:${pid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `person_id=eq.${pid}` }, () => {
        void onMyMembershipsChanged()
      })
      .subscribe()
  }

  async function onMyMembershipsChanged() {
    try {
      await loadMemberships()
      const stillIn = current.value && isActiveMemberOf(current.value.id)
      if (status.value === 'no-group' || (status.value === 'ready' && !stillIn)) {
        await pickGroup()
      }
    } catch (e) {
      console.error(e)
    }
  }

  /**
   * Brings everything up to date in place, without loading screens: for the app coming back
   * from the background or the connection coming back, before Realtime has caught up by itself.
   */
  async function catchUp() {
    if (status.value !== 'ready' && status.value !== 'no-group') return
    const gid = current.value?.id
    // Approved somewhere, or no longer in this group: this also opens the right group.
    const work: Promise<unknown>[] = [onMyMembershipsChanged()]
    if (gid) {
      work.push(refresh(gid), useListStore().refresh())
      useCalendarStore().reloadSoon()
      useTasksStore().reloadSoon()
    }
    for (const result of await Promise.allSettled(work)) {
      if (result.status === 'rejected') console.error(result.reason)
    }
  }

  // ── Create / join ──────────────────────────────────────────

  async function createGroup(groupName: string, sections: { shopping: boolean; calendar: boolean; tasks: boolean }) {
    const { data, error } = await supabase.rpc('create_group', {
      group_name: groupName,
      with_shopping: sections.shopping,
      with_calendar: sections.calendar,
      with_tasks: sections.tasks,
    })
    if (error) throw error
    await loadGroup(data)
  }

  async function previewInvite(code: string): Promise<InvitePreview | null> {
    const { data, error } = await supabase.rpc('group_by_invite', { code })
    if (error) throw error
    const row = data[0]
    return row ? { id: row.id, name: row.name, memberCount: row.member_count } : null
  }

  /** Asks to join; an admin has to approve it. */
  async function requestJoin(code: string) {
    const { error } = await supabase.rpc('request_join', { code })
    if (error) throw error
    await loadMemberships()
  }

  /** Withdraws a pending request. */
  async function cancelRequest(groupId: string) {
    const { error } = await supabase.rpc('leave_group', { gid: groupId })
    if (error) throw error
    await loadMemberships()
  }

  async function previewClaim(code: string): Promise<{ id: string; displayName: string } | null> {
    const { data, error } = await supabase.rpc('profile_by_claim_code', { code })
    if (error) throw error
    const row = data[0]
    return row ? { id: row.id, displayName: row.display_name } : null
  }

  /** This account becomes that profile, with its groups and history. */
  async function claimProfile(code: string) {
    const { error } = await supabase.rpc('claim_profile', { code })
    if (error) throw error
    await loadMe()
    subscribeToMine()
    await pickGroup()
  }

  /**
   * Leaves the active group and opens the next one, if any.
   * Returns the name of the group left.
   */
  async function leaveGroup(): Promise<string> {
    const left = current.value!
    const { error } = await supabase.rpc('leave_group', { gid: left.id })
    if (error) throw error
    memberships.value = memberships.value.filter((m) => m.groupId !== left.id)
    writeActiveGroup(null)
    const next = activeMemberships.value[0]
    if (next) {
      status.value = 'loading'
      try {
        await openGroup(next)
      } catch (e) {
        fail(e)
      }
    } else {
      closeGroup()
      status.value = 'no-group'
    }
    return left.name
  }

  // ── Admin ──────────────────────────────────────────────────

  async function rpcThenRefresh(run: () => PromiseLike<{ error: unknown }>) {
    const { error } = await run()
    if (error) throw error
    await refresh(current.value!.id)
  }

  const approveMember = (memberId: string) =>
    rpcThenRefresh(() => supabase.rpc('approve_member', { member_id: memberId }))

  const rejectMember = (memberId: string) =>
    rpcThenRefresh(() => supabase.rpc('reject_member', { member_id: memberId }))

  const removeMember = (memberId: string) =>
    rpcThenRefresh(() => supabase.rpc('remove_member', { member_id: memberId }))

  const setMemberRole = (memberId: string, role: MemberRole) =>
    rpcThenRefresh(() => supabase.rpc('set_member_role', { member_id: memberId, new_role: role }))

  /** Adds someone without an account (a young child) to the current group. */
  const createProfile = (displayName: string) =>
    rpcThenRefresh(() => supabase.rpc('create_profile', { gid: current.value!.id, display_name: displayName }))

  /** Code for that profile's owner to take it over from their own new account. */
  async function createClaimCode(personId: string): Promise<string> {
    const { data, error } = await supabase.rpc('create_claim_code', { pid: personId })
    if (error) throw error
    return data
  }

  /** The old invite link stops working. */
  async function regenerateInviteCode() {
    const { data, error } = await supabase.rpc('regenerate_invite_code', { gid: current.value!.id })
    if (error) throw error
    current.value = { ...current.value!, inviteCode: data }
  }

  async function updateGroup(settings: GroupSettings) {
    const { data, error } = await supabase
      .from('groups')
      .update({
        name: settings.name,
        shopping_enabled: settings.shoppingEnabled,
        calendar_enabled: settings.calendarEnabled,
        tasks_enabled: settings.tasksEnabled,
      })
      .eq('id', current.value!.id)
      .select()
      .single()
    if (error) throw error
    current.value = toGroup(data)
    renameMembership(current.value)
  }

  // ── Profile ────────────────────────────────────────────────

  /** My own name and color, or those of a profile I manage. */
  async function updatePerson(
    personId: string,
    changes: { displayName?: string; color?: string; mutedNotifications?: NotificationKind[] },
  ) {
    const { data, error } = await supabase
      .from('people')
      .update({ display_name: changes.displayName, color: changes.color, muted_notifications: changes.mutedNotifications })
      .eq('id', personId)
      .select()
      .single()
    if (error) throw error
    if (personId === me.value?.id) me.value = toPerson(data)
    if (current.value) await refresh(current.value.id)
  }

  return {
    status,
    errorMessage,
    offline,
    email,
    me,
    group,
    members,
    activeMembers,
    pendingMembers,
    isAdmin,
    memberships,
    activeMemberships,
    pendingMemberships,
    currentMemberId,
    inviteUrl,
    isMe,
    memberName,
    memberColor,
    init,
    reload,
    catchUp,
    switchGroup,
    isActiveMemberOf,
    isPendingIn,
    leaveGroup,
    createGroup,
    previewInvite,
    requestJoin,
    cancelRequest,
    previewClaim,
    claimProfile,
    approveMember,
    rejectMember,
    removeMember,
    setMemberRole,
    createProfile,
    createClaimCode,
    regenerateInviteCode,
    updateGroup,
    updatePerson,
  }
})
