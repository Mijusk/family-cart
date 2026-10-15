import type { Group, Item, Member, MemberRole, MemberStatus, Person, Product, Trip, TripClosedReason } from '@/types'
import type { Database } from './database.types'

type Tables = Database['public']['Tables']
export type GroupRow = Tables['groups']['Row']
export type MemberRow = Tables['members']['Row']
export type PersonRow = Tables['people']['Row']
export type ProductRow = Tables['products']['Row']
export type TripRow = Tables['trips']['Row']
export type ItemRow = Tables['items']['Row']
export type ItemUpdate = Tables['items']['Update']

export const toGroup = (r: GroupRow): Group => ({
  id: r.id,
  name: r.name,
  inviteCode: r.invite_code,
  timezone: r.timezone,
  shoppingEnabled: r.shopping_enabled,
  calendarEnabled: r.calendar_enabled,
  createdAt: r.created_at,
})

export const toPerson = (r: PersonRow): Person => ({
  id: r.id,
  displayName: r.display_name,
  color: r.color,
  hasAccount: r.user_id !== null,
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
