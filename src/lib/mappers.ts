import type { Group, Item, Member, Product, Trip, TripClosedReason } from '@/types'
import type { Database } from './database.types'

type Tables = Database['public']['Tables']
export type GroupRow = Tables['groups']['Row']
export type MemberRow = Tables['members']['Row']
export type ProductRow = Tables['products']['Row']
export type TripRow = Tables['trips']['Row']
export type ItemRow = Tables['items']['Row']
export type ItemUpdate = Tables['items']['Update']

export const toGroup = (r: GroupRow): Group => ({
  id: r.id,
  name: r.name,
  inviteCode: r.invite_code,
  createdAt: r.created_at,
})

export const toMember = (r: MemberRow): Member => ({
  id: r.id,
  groupId: r.group_id,
  name: r.name,
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
  status: i.status,
  added_by: i.addedBy,
  added_at: i.addedAt,
  trip_id: i.tripId,
  purchased_by: i.purchasedBy,
  purchased_at: i.purchasedAt,
})
