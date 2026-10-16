// Domain types: the Supabase tables in camelCase (src/lib/mappers.ts converts rows).

export type ItemStatus = 'pending' | 'in_cart' | 'purchased' | 'not_found'

/** manual: "Finalizar compra"; timeout: closed by the 4-hour job; cancelled: cart sent back to the list. */
export type TripClosedReason = 'manual' | 'timeout' | 'cancelled'

export interface Group {
  id: string
  name: string
  inviteCode: string
  timezone: string
  shoppingEnabled: boolean
  calendarEnabled: boolean
  createdAt: string
}

export type MemberRole = 'admin' | 'member'

/** pending: asked to join and waiting for an admin; active: in the group. */
export type MemberStatus = 'pending' | 'active'

/** A human. Without an account (a child without a phone) when hasAccount is false. */
export interface Person {
  id: string
  displayName: string
  color: string
  hasAccount: boolean
  /** Folder of the last event this person created; new events go there. */
  lastCalendarId: string | null
}

/** A person inside a group. Name and color come from the person. */
export interface Member {
  id: string
  groupId: string
  personId: string
  name: string
  color: string
  hasAccount: boolean
  role: MemberRole
  status: MemberStatus
  /** When they asked to join (or were added). */
  createdAt: string
  /** Set when they left or were removed; kept so the history still shows their name. */
  leftAt: string | null
}

/** A group the signed-in person is in, or has asked to join. */
export interface Membership {
  groupId: string
  groupName: string
  /** The member this person is in that group. */
  memberId: string
  role: MemberRole
  status: MemberStatus
  joinedAt: string
}

/** Catalog entry used for autocomplete. */
export interface Product {
  id: string
  groupId: string
  normalizedName: string
  displayName: string
  lastQuantity: number
  timesUsed: number
}

export interface Item {
  id: string
  groupId: string
  name: string
  quantity: number
  note: string | null
  /** Object in the item-photos bucket: `<groupId>/<uuid>.jpg`. */
  photoPath: string | null
  status: ItemStatus
  /** Null if that member was removed from the group. */
  addedBy: string | null
  addedAt: string
  tripId: string | null
  purchasedBy: string | null
  purchasedAt: string | null
}

export interface Trip {
  id: string
  groupId: string
  memberId: string
  startedAt: string
  finishedAt: string | null
  closedReason: TripClosedReason | null
}

// ── Calendar ──────────────────────────────────────────────────

/** A day as 'YYYY-MM-DD', in the calendar's own wall-clock (no time zone conversion). */
export type IsoDate = string

/** A time of day as 'HH:MM', 24 h. */
export type ClockTime = string

export type RepeatKind = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly'

/** full: the group sees everything; busy: only that the owner is busy, with no title or details. */
export type ShareLevel = 'full' | 'busy'

/** A folder of one person's calendar ("Trabajo", "Colegio"…). */
export interface Calendar {
  id: string
  ownerId: string
  name: string
  color: string
  position: number
}

export interface CalendarShare {
  calendarId: string
  groupId: string
  level: ShareLevel
}

/** When an event happens and how it repeats. Also the shape of a busy slot. */
export interface EventTiming {
  allDay: boolean
  startDate: IsoDate
  /** Null for all-day events. An end earlier than the start means it ends the next day. */
  startTime: ClockTime | null
  endTime: ClockTime | null
  repeat: RepeatKind
  /** ISO weekdays (1 = Monday … 7 = Sunday), for weekly and biweekly. */
  repeatWeekdays: number[] | null
  repeatUntil: IsoDate | null
}

export interface CalendarEvent extends EventTiming {
  id: string
  calendarId: string
  title: string
  notes: string | null
  location: string | null
  timezone: string
  createdBy: string | null
  createdAt: string
  updatedBy: string | null
  updatedAt: string
}

/** Fields one occurrence can change. */
export type EventOverrides = Partial<
  Pick<CalendarEvent, 'title' | 'notes' | 'location' | 'allDay' | 'startDate' | 'startTime' | 'endTime'>
>

/** One occurrence of a repeating event cancelled or changed. */
export interface EventException {
  eventId: string
  /** The date the occurrence had in the series (it can be moved with overrides.startDate). */
  occurrenceDate: IsoDate
  status: 'cancelled' | 'modified'
  overrides: EventOverrides
}

/** An event of a folder shared as "busy": times only. */
export interface BusyEvent extends EventTiming {
  id: string
  ownerId: string
  exceptions: EventException[]
}

/** One appearance of an event on the calendar. */
export interface Occurrence {
  /** Unique per event and series date. */
  key: string
  eventId: string
  ownerId: string
  color: string
  /** Null for a busy slot. */
  title: string | null
  location: string | null
  busy: boolean
  /** The date this occurrence has in the series; identifies it for exceptions. */
  seriesDate: IsoDate
  /** The day it starts (differs from seriesDate when moved). */
  date: IsoDate
  allDay: boolean
  startTime: ClockTime | null
  endTime: ClockTime | null
  /** Ends the day after it starts. */
  crossesMidnight: boolean
  repeating: boolean
  /** Changed for this day only. */
  modified: boolean
}

export type HistoryAction = 'create' | 'update' | 'delete' | 'restore' | 'purge'

export interface HistoryEntry {
  id: number
  eventId: string
  action: HistoryAction
  changedBy: string | null
  changedAt: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

/** A deleted folder (with the events deleted along with it) or a single deleted event. */
export interface TrashItem {
  kind: 'calendar' | 'event'
  id: string
  /** Folder name or event title. */
  title: string
  color: string
  ownerId: string | null
  /** For an event: the folder it was in. */
  folderName: string | null
  startDate: IsoDate | null
  repeating: boolean
  /** For a folder: events that come back with it. */
  eventCount: number
  deletedAt: string
  deletedBy: string | null
}
