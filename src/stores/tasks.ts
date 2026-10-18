import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { RealtimeChannel, RealtimeSystemPayload } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { toPerson, toTask, toTaskList, toTaskListShare } from '@/lib/mappers'
import type { Database } from '@/lib/database.types'
import { byPosition, positionBetween } from '@/lib/tasks'
import type { IsoDate, Person, Task, TaskList, TaskListShare, TaskTrashItem } from '@/types'
import { dayIn } from '@/utils/days'
import { useGroupStore } from './group'

const REALTIME_TABLES = ['task_lists', 'task_list_shares', 'tasks']

type TaskUpdate = Database['public']['Tables']['tasks']['Update']

/** What the task screens change; the rest is set by the database. */
export type TaskChange = Partial<Pick<Task, 'title' | 'notes' | 'assignedTo' | 'dueDate'>>

/** Someone a task can go to. */
export interface Assignee {
  personId: string
  name: string
  color: string
}

/**
 * Every task list the signed-in person can see, with their tasks (not the deleted ones). Lists
 * are few, so everything is loaded at once; the screens pick the ones of the current group.
 * Design notes: docs/tareas.md.
 */
export const useTasksStore = defineStore('tasks', () => {
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const lists = ref<TaskList[]>([])
  const shares = ref<TaskListShare[]>([])
  const tasks = ref<Task[]>([])
  /** People named by the tasks (owners, assignees, authors) beyond the current group. */
  const people = ref<Record<string, Person>>({})
  let loadedGroupId: string | null = null

  // ── Reading ────────────────────────────────────────────────

  function listById(id: string): TaskList | undefined {
    return lists.value.find((l) => l.id === id)
  }

  function taskById(id: string): Task | undefined {
    return tasks.value.find((t) => t.id === id)
  }

  function sharedGroupIds(listId: string): string[] {
    return shares.value.filter((s) => s.listId === listId).map((s) => s.groupId)
  }

  /** Today in the current group's time zone. */
  function today(): IsoDate {
    return dayIn(useGroupStore().group.timezone)
  }

  /** The group's day a moment falls on (when a task was ticked, say). */
  function dayOf(iso: string): IsoDate {
    return dayIn(useGroupStore().group.timezone, iso)
  }

  /** A profile without an account in this group, managed by me as its admin. */
  function managesProfile(personId: string): boolean {
    const groupStore = useGroupStore()
    return groupStore.isAdmin && groupStore.activeMembers.some((m) => m.personId === personId && !m.hasAccount)
  }

  /** Rename, share and delete: the owner, and the admins of a profile without an account. */
  function canManage(list: TaskList): boolean {
    return list.ownerId === useGroupStore().me?.id || managesProfile(list.ownerId)
  }

  /**
   * The lists of the current group: those shared with it, and the private ones of me and of the
   * profiles I manage here. Oldest first, so "Pendientes" leads.
   */
  const groupLists = computed(() => {
    const groupStore = useGroupStore()
    const groupId = groupStore.group.id
    return lists.value
      .filter((l) => {
        const groups = sharedGroupIds(l.id)
        if (groups.includes(groupId)) return true
        return !groups.length && (l.ownerId === groupStore.me?.id || managesProfile(l.ownerId))
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name))
  })

  /** Not done, in manual order. */
  function pendingOf(listId: string): Task[] {
    return tasks.value.filter((t) => t.listId === listId && !t.doneAt).sort(byPosition)
  }

  /** Who a task of this list can go to: whoever sees it in this group, or only its owner if private. */
  function assignees(listId: string): Assignee[] {
    const groupStore = useGroupStore()
    const list = listById(listId)
    if (!list) return []
    const owner = { personId: list.ownerId, name: personName(list.ownerId), color: personColor(list.ownerId) }
    if (!sharedGroupIds(listId).includes(groupStore.group.id)) return [owner]
    const members = [...groupStore.activeMembers]
      .sort((a, b) => Number(groupStore.isMe(b.id)) - Number(groupStore.isMe(a.id)))
      .map((m) => ({ personId: m.personId, name: personName(m.personId), color: m.color }))
    return members.some((m) => m.personId === owner.personId) ? members : [owner, ...members]
  }

  /** A person's name; the signed-in person shows as `self` ("Tú", "ti"…). */
  function personName(id: string | null, self = 'Tú'): string {
    if (!id) return 'Alguien'
    const groupStore = useGroupStore()
    if (id === groupStore.me?.id) return self
    const member = groupStore.activeMembers.find((m) => m.personId === id)
    return member?.name ?? people.value[id]?.displayName ?? 'Alguien'
  }

  function personColor(id: string): string {
    const groupStore = useGroupStore()
    if (id === groupStore.me?.id) return groupStore.me.color
    return groupStore.activeMembers.find((m) => m.personId === id)?.color ?? people.value[id]?.color ?? '#5b6b5f'
  }

  /** For the calendar later: what is due on a day, and what was ticked on it. */
  function tasksOn(day: IsoDate): { due: Task[]; done: Task[] } {
    const visible = new Set(groupLists.value.map((l) => l.id))
    const inGroup = tasks.value.filter((t) => visible.has(t.listId))
    return {
      due: inGroup.filter((t) => !t.doneAt && t.dueDate === day).sort(byPosition),
      done: inGroup.filter((t) => t.doneAt && dayOf(t.doneAt) === day),
    }
  }

  // ── Loading ────────────────────────────────────────────────

  async function load(groupId: string) {
    loadedGroupId = groupId
    subscribe(groupId)
    if (status.value !== 'ready') status.value = 'loading'
    try {
      const [listRows, shareRows, taskRows] = await Promise.all([
        supabase.from('task_lists').select().is('deleted_at', null),
        supabase.from('task_list_shares').select('list_id, group_id'),
        supabase.from('tasks').select().is('deleted_at', null),
      ])
      for (const res of [listRows, shareRows, taskRows]) if (res.error) throw res.error
      if (groupId !== loadedGroupId) return
      lists.value = listRows.data!.map(toTaskList)
      shares.value = shareRows.data!.map(toTaskListShare)
      tasks.value = taskRows.data!.map(toTask)
      await loadPeople()
      status.value = 'ready'
    } catch (e) {
      console.error(e)
      if (groupId === loadedGroupId) status.value = 'error'
      throw e
    }
  }

  function reload() {
    return loadedGroupId ? load(loadedGroupId) : Promise.resolve()
  }

  /** For the views: loads only if this group isn't loaded or loading yet, or the last load failed. */
  function ensureLoaded(groupId: string): Promise<void> {
    if (groupId === loadedGroupId && (status.value === 'ready' || status.value === 'loading')) return Promise.resolve()
    return load(groupId)
  }

  /** Names for people outside the current group (a list shared with another group, say). */
  async function loadPeople(extra: (string | null)[] = []) {
    const ids = new Set<string>()
    for (const l of lists.value) ids.add(l.ownerId)
    for (const t of tasks.value) [t.assignedTo, t.createdBy, t.updatedBy, t.doneBy].forEach((id) => id && ids.add(id))
    extra.forEach((id) => id && ids.add(id))
    const groupStore = useGroupStore()
    const known = new Set([groupStore.me?.id, ...groupStore.activeMembers.map((m) => m.personId)])
    const missing = [...ids].filter((id) => !known.has(id) && !people.value[id])
    if (!missing.length) return
    // People who share no group with me any more are not visible; they show as "Alguien".
    const { data, error } = await supabase.from('people').select().in('id', missing)
    if (error) throw error
    for (const row of data) people.value[row.id] = toPerson(row)
  }

  // ── Tasks ──────────────────────────────────────────────────

  /** A new task at the end of its list. */
  async function addTask(listId: string, title: string, change: TaskChange = {}): Promise<Task> {
    const last = Math.max(0, ...tasks.value.filter((t) => t.listId === listId).map((t) => t.position))
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        list_id: listId,
        title,
        position: last + 1,
        notes: change.notes ?? null,
        assigned_to: change.assignedTo ?? null,
        due_date: change.dueDate ?? null,
      })
      .select()
      .single()
    if (error) throw error
    const task = toTask(data)
    tasks.value.push(task)
    return task
  }

  async function updateTask(id: string, change: TaskChange) {
    const row: Pick<TaskUpdate, 'title' | 'notes' | 'assigned_to' | 'due_date'> = {}
    if ('title' in change) row.title = change.title
    if ('notes' in change) row.notes = change.notes
    if ('assignedTo' in change) row.assigned_to = change.assignedTo
    if ('dueDate' in change) row.due_date = change.dueDate
    // .single(): if it was deleted (or I lost the list) meanwhile, this fails instead of doing nothing.
    const { data, error } = await supabase.from('tasks').update(row).eq('id', id).select().single()
    if (error) throw error
    replace(toTask(data))
  }

  /** Between two neighbours in the order on screen (either may be missing at the ends). */
  async function moveTask(id: string, beforeId: string | null, afterId: string | null) {
    const before = beforeId ? taskById(beforeId)?.position : undefined
    const after = afterId ? taskById(afterId)?.position : undefined
    const position = positionBetween(before, after)
    const task = taskById(id)
    if (!task || task.position === position) return
    task.position = position
    const { error } = await supabase.from('tasks').update({ position }).eq('id', id)
    if (error) {
      void reload().catch(() => {})
      throw error
    }
  }

  async function setDone(id: string, done: boolean) {
    const task = taskById(id)
    const previous = task && { doneAt: task.doneAt, doneBy: task.doneBy }
    if (task) {
      task.doneAt = done ? (task.doneAt ?? new Date().toISOString()) : null
      task.doneBy = done ? (task.doneBy ?? useGroupStore().me?.id ?? null) : null
    }
    const { error } = await supabase.rpc('set_task_done', { task_id: id, done })
    if (error) {
      if (task && previous) Object.assign(task, previous)
      throw error
    }
  }

  /** To the trash; returns the undo. */
  async function deleteTask(id: string): Promise<() => Promise<void>> {
    const { error } = await supabase.rpc('delete_task', { task_id: id })
    if (error) throw error
    tasks.value = tasks.value.filter((t) => t.id !== id)
    return () => restoreTask(id)
  }

  async function restoreTask(id: string) {
    const { error } = await supabase.rpc('restore_task', { task_id: id })
    if (error) throw error
    await reload()
  }

  function replace(task: Task) {
    const i = tasks.value.findIndex((t) => t.id === task.id)
    if (i === -1) tasks.value.push(task)
    else tasks.value[i] = task
  }

  // ── Lists ──────────────────────────────────────────────────

  /** A new list for me, or for a profile I manage, shared with the groups given. */
  async function createList(name: string, ownerId: string, groupIds: string[]): Promise<TaskList> {
    const { data, error } = await supabase.from('task_lists').insert({ owner_id: ownerId, name }).select().single()
    if (error) throw error
    const list = toTaskList(data)
    lists.value.push(list)
    for (const groupId of groupIds) await setShare(list.id, groupId, true)
    return list
  }

  async function renameList(id: string, name: string) {
    const { data, error } = await supabase.from('task_lists').update({ name }).eq('id', id).select().single()
    if (error) throw error
    const list = listById(id)
    if (list) list.name = data.name
  }

  async function setShare(listId: string, groupId: string, shared: boolean) {
    const { error } = shared
      ? await supabase.from('task_list_shares').insert({ list_id: listId, group_id: groupId })
      : await supabase.from('task_list_shares').delete().eq('list_id', listId).eq('group_id', groupId)
    if (error) throw error
    if (shared) {
      if (!sharedGroupIds(listId).includes(groupId)) shares.value.push({ listId, groupId })
    } else {
      shares.value = shares.value.filter((s) => !(s.listId === listId && s.groupId === groupId))
      // Whoever no longer sees the list was unassigned by the database.
      await reload()
    }
  }

  /** The list and its tasks to the trash; returns the undo. */
  async function deleteList(id: string): Promise<() => Promise<void>> {
    const { error } = await supabase.rpc('delete_task_list', { list_id: id })
    if (error) throw error
    lists.value = lists.value.filter((l) => l.id !== id)
    tasks.value = tasks.value.filter((t) => t.listId !== id)
    return () => restoreList(id)
  }

  async function restoreList(id: string) {
    const { error } = await supabase.rpc('restore_task_list', { list_id: id })
    if (error) throw error
    await reload()
  }

  // ── Trash ──────────────────────────────────────────────────

  /** Deleted lists I manage and deleted tasks of lists I see; a task deleted with its list goes under the list. */
  async function loadTrash(): Promise<TaskTrashItem[]> {
    const [listRows, taskRows] = await Promise.all([
      supabase.from('task_lists').select().not('deleted_at', 'is', null),
      supabase.from('tasks').select().not('deleted_at', 'is', null),
    ])
    if (listRows.error) throw listRows.error
    if (taskRows.error) throw taskRows.error
    const deletedLists = new Map(listRows.data.map((l) => [l.id, l]))
    const items: TaskTrashItem[] = [
      ...listRows.data.map((l) => ({
        kind: 'list' as const,
        id: l.id,
        title: l.name,
        listName: null,
        taskCount: taskRows.data.filter((t) => t.list_id === l.id && t.deletion_batch === l.deletion_batch).length,
        deletedAt: l.deleted_at!,
        deletedBy: l.deleted_by,
      })),
      ...taskRows.data
        .filter((t) => deletedLists.get(t.list_id)?.deletion_batch !== t.deletion_batch)
        .map((t) => ({
          kind: 'task' as const,
          id: t.id,
          title: t.title,
          listName: listById(t.list_id)?.name ?? deletedLists.get(t.list_id)?.name ?? null,
          taskCount: 0,
          deletedAt: t.deleted_at!,
          deletedBy: t.deleted_by,
        })),
    ].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
    await loadPeople(items.map((i) => i.deletedBy))
    return items
  }

  function restore(item: TaskTrashItem) {
    return item.kind === 'list' ? restoreList(item.id) : restoreTask(item.id)
  }

  async function purge(item: TaskTrashItem) {
    const { error } =
      item.kind === 'list'
        ? await supabase.rpc('purge_task_list', { list_id: item.id })
        : await supabase.rpc('purge_task', { task_id: item.id })
    if (error) throw error
  }

  // ── Realtime ───────────────────────────────────────────────

  let channel: RealtimeChannel | null = null
  let channelGroupId: string | null = null
  let reloadTimer: ReturnType<typeof setTimeout> | undefined

  /** Changes come in bursts (a list and its tasks): one reload for them all. */
  function reloadSoon() {
    clearTimeout(reloadTimer)
    reloadTimer = setTimeout(() => reload().catch(console.error), 300)
  }

  /** Postgres changes bring what RLS lets me see; any of them reloads everything. */
  function subscribe(groupId: string) {
    if (channelGroupId === groupId) return
    if (channel) void supabase.removeChannel(channel)
    channelGroupId = groupId
    let ch = supabase.channel(`tasks:${groupId}`)
    for (const table of REALTIME_TABLES) ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, reloadSoon)
    channel = ch
      // Catch up on anything missed before the listeners were live (also after a reconnect).
      .on('system', {}, (p: RealtimeSystemPayload) => {
        if (p.extension === 'postgres_changes' && p.status === 'ok') reloadSoon()
      })
      .subscribe((state) => {
        if (state === 'SUBSCRIBED') reloadSoon()
      })
  }

  function unload() {
    if (channel) void supabase.removeChannel(channel)
    channel = null
    channelGroupId = null
    clearTimeout(reloadTimer)
    loadedGroupId = null
    status.value = 'idle'
    lists.value = []
    shares.value = []
    tasks.value = []
  }

  return {
    status,
    lists,
    tasks,
    groupLists,
    listById,
    taskById,
    sharedGroupIds,
    today,
    dayOf,
    canManage,
    pendingOf,
    assignees,
    personName,
    personColor,
    tasksOn,
    load,
    ensureLoaded,
    reload,
    unload,
    addTask,
    updateTask,
    moveTask,
    setDone,
    deleteTask,
    createList,
    renameList,
    setShare,
    deleteList,
    loadTrash,
    restore,
    purge,
  }
})
