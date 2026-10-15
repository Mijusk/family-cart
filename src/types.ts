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
