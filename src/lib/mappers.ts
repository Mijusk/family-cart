import type {
  BusyEvent,
  Calendar,
  CalendarEvent,
  CalendarShare,
  ClockTime,
  EventException,
  EventOverrides,
  Group,
  HistoryAction,
  HistoryEntry,
  Item,
  Member,
  MemberRole,
  MemberStatus,
  NotificationKind,
  Person,
  Product,
  RepeatKind,
  ShareLevel,
  Task,
  TaskList,
  TaskListShare,
  Trip,
  TripClosedReason,
} from '../types.ts'
import type { Database } from './database.types.ts'

// Rows to domain types and back. The mcp Edge Function imports this file under Deno, so its
// imports are relative and keep the .ts extension.

type Tables = Database['public']['Tables']
export type GroupRow = Tables['groups']['Row']
export type MemberRow = Tables['members']['Row']
export type PersonRow = Tables['people']['Row']
export type ProductRow = Tables['products']['Row']
export type TripRow = Tables['trips']['Row']
export type ItemRow = Tables['items']['Row']
export type ItemUpdate = Tables['items']['Update']
export type CalendarRow = Tables['calendars']['Row']
export type CalendarShareRow = Tables['calendar_shares']['Row']
export type EventRow = Tables['events']['Row']
export type EventInsert = Tables['events']['Insert']
export type EventExceptionRow = Tables['event_exceptions']['Row']
export type EventHistoryRow = Tables['event_history']['Row']
type Functions = Database['public']['Functions']
export type BusyEventRow = Functions['busy_events']['Returns'][number]

export const toGroup = (r: GroupRow): Group => ({
  id: r.id,
  name: r.name,
  inviteCode: r.invite_code,
  timezone: r.timezone,
  shoppingEnabled: r.shopping_enabled,
  calendarEnabled: r.calendar_enabled,
  tasksEnabled: r.tasks_enabled,
  createdAt: r.created_at,
})

export const toPerson = (r: PersonRow): Person => ({
  id: r.id,
  displayName: r.display_name,
  color: r.color,
  hasAccount: r.user_id !== null,
  lastCalendarId: r.last_calendar_id,
  mutedNotifications: r.muted_notifications as NotificationKind[],
})

/** A member row plus its person; an unknown person (not loaded yet) shows as "Alguien". */
export const toMember = (r: MemberRow, person: Person | undefined): Member => ({
  id: r.id,
  groupId: r.group_id,
  personId: r.person_id,
  name: person?.displayName ?? 'Alguien',
  color: person?.color ?? '#5b6b5f',
  hasAccount: person?.hasAccount ?? true,
  // Text columns with check constraints, so the generated types are plain strings.
  role: r.role as MemberRole,
  status: r.status as MemberStatus,
  createdAt: r.created_at,
  leftAt: r.left_at,
})

export const toProduct = (r: ProductRow): Product => ({
  id: r.id,
  groupId: r.group_id,
  normalizedName: r.normalized_name,
  displayName: r.display_name,
  lastQuantity: r.last_quantity,
  timesUsed: r.times_used,
})

export const toTrip = (r: TripRow): Trip => ({
  id: r.id,
  groupId: r.group_id,
  memberId: r.member_id,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  // A text column with a check constraint, so the generated type is plain string.
  closedReason: r.closed_reason as TripClosedReason | null,
})

export const toItem = (r: ItemRow): Item => ({
  id: r.id,
  groupId: r.group_id,
  name: r.name,
  quantity: r.quantity,
  note: r.note,
  photoPath: r.photo_path,
  status: r.status,
  addedBy: r.added_by,
  addedAt: r.added_at,
  tripId: r.trip_id,
  purchasedBy: r.purchased_by,
  purchasedAt: r.purchased_at,
})

export const fromItem = (i: Item): Tables['items']['Insert'] => ({
  id: i.id,
  group_id: i.groupId,
  name: i.name,
  quantity: i.quantity,
  note: i.note,
  photo_path: i.photoPath,
  status: i.status,
  added_by: i.addedBy,
  added_at: i.addedAt,
  trip_id: i.tripId,
  purchased_by: i.purchasedBy,
  purchased_at: i.purchasedAt,
})

// ── Calendar ─────────────────────────────────────────────────

/** Postgres returns times as 'HH:MM:SS'; the app works with 'HH:MM'. */
const toClock = (t: string | null): ClockTime | null => (t ? t.slice(0, 5) : null)

export const toCalendar = (r: CalendarRow): Calendar => ({
  id: r.id,
  ownerId: r.owner_id,
  name: r.name,
  color: r.color,
  position: r.position,
})

export const toCalendarShare = (r: CalendarShareRow): CalendarShare => ({
  calendarId: r.calendar_id,
  groupId: r.group_id,
  // Text columns with check constraints, so the generated types are plain strings.
  level: r.level as ShareLevel,
})

export const toEvent = (r: EventRow): CalendarEvent => ({
  id: r.id,
  calendarId: r.calendar_id,
  title: r.title,
  notes: r.notes,
  location: r.location,
  allDay: r.all_day,
  startDate: r.start_date,
  startTime: toClock(r.start_time),
  endTime: toClock(r.end_time),
  timezone: r.timezone,
  repeat: r.repeat as RepeatKind,
  repeatWeekdays: r.repeat_weekdays,
  repeatUntil: r.repeat_until,
  reminderMinutes: r.reminder_minutes,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedBy: r.updated_by,
  updatedAt: r.updated_at,
})

/** The writable fields of an event. */
export const fromEvent = (
  e: Pick<
    CalendarEvent,
    'calendarId' | 'title' | 'notes' | 'location' | 'allDay' | 'startDate' | 'startTime' | 'endTime' | 'repeat' | 'repeatWeekdays' | 'repeatUntil' | 'reminderMinutes'
  >,
) => ({
  calendar_id: e.calendarId,
  title: e.title,
  notes: e.notes,
  location: e.location,
  all_day: e.allDay,
  start_date: e.startDate,
  start_time: e.startTime,
  end_time: e.endTime,
  repeat: e.repeat,
  repeat_weekdays: e.repeatWeekdays,
  repeat_until: e.repeatUntil,
  reminder_minutes: e.reminderMinutes,
})

/** Overrides are stored with the column names of events. */
const OVERRIDE_COLUMNS = {
  title: 'title',
  notes: 'notes',
  location: 'location',
  allDay: 'all_day',
  startDate: 'start_date',
  startTime: 'start_time',
  endTime: 'end_time',
} as const satisfies Record<keyof EventOverrides, string>

export function toOverrides(json: unknown): EventOverrides {
  const source = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>
  const overrides: Record<string, unknown> = {}
  for (const [key, column] of Object.entries(OVERRIDE_COLUMNS)) {
    if (!(column in source)) continue
    const value = source[column]
    overrides[key] = key === 'startTime' || key === 'endTime' ? toClock(value as string | null) : value
  }
  return overrides as EventOverrides
}

export function fromOverrides(overrides: EventOverrides): Record<string, unknown> {
  const json: Record<string, unknown> = {}
  for (const [key, column] of Object.entries(OVERRIDE_COLUMNS)) {
    if (key in overrides) json[column] = overrides[key as keyof EventOverrides]
  }
  return json
}

export const toException = (r: Pick<EventExceptionRow, 'event_id' | 'occurrence_date' | 'status' | 'overrides'>): EventException => ({
  eventId: r.event_id,
  occurrenceDate: r.occurrence_date,
  status: r.status as EventException['status'],
  overrides: toOverrides(r.overrides),
})

export const toBusyEvent = (r: BusyEventRow): BusyEvent => ({
  id: r.id,
  ownerId: r.owner_id,
  allDay: r.all_day,
  startDate: r.start_date,
  startTime: toClock(r.start_time),
  endTime: toClock(r.end_time),
  repeat: r.repeat as RepeatKind,
  // Columns of a function's result are typed as non-null, but these can be null.
  repeatWeekdays: r.repeat_weekdays ?? null,
  repeatUntil: r.repeat_until ?? null,
  exceptions: ((r.exceptions ?? []) as { occurrence_date: string; status: string; overrides: unknown }[]).map((x) =>
    toException({ event_id: r.id, occurrence_date: x.occurrence_date, status: x.status, overrides: x.overrides as never }),
  ),
})

export const toHistoryEntry = (r: EventHistoryRow): HistoryEntry => ({
  id: r.id,
  eventId: r.event_id,
  action: r.action as HistoryAction,
  changedBy: r.changed_by,
  changedAt: r.changed_at,
  before: r.before as Record<string, unknown> | null,
  after: r.after as Record<string, unknown> | null,
})

export type TaskListRow = Tables['task_lists']['Row']
export type TaskRow = Tables['tasks']['Row']

export const toTaskList = (r: TaskListRow): TaskList => ({
  id: r.id,
  ownerId: r.owner_id,
  name: r.name,
  createdAt: r.created_at,
})

export const toTaskListShare = (r: Pick<Tables['task_list_shares']['Row'], 'list_id' | 'group_id'>): TaskListShare => ({
  listId: r.list_id,
  groupId: r.group_id,
})

export const toTask = (r: TaskRow): Task => ({
  id: r.id,
  listId: r.list_id,
  title: r.title,
  notes: r.notes,
  assignees: r.assignees,
  dueDate: r.due_date,
  position: Number(r.position),
  doneAt: r.done_at,
  doneBy: r.done_by,
  createdAt: r.created_at,
  createdBy: r.created_by,
  updatedAt: r.updated_at,
  updatedBy: r.updated_by,
})
