// Domain types: the Supabase tables in camelCase (src/lib/mappers.ts converts rows).

export type ItemStatus = 'pending' | 'in_cart' | 'purchased' | 'not_found'

/** manual: "Finalizar compra"; timeout: closed by the 4-hour job; cancelled: cart sent back to the list. */
export type TripClosedReason = 'manual' | 'timeout' | 'cancelled'

export interface Group {
  id: string
  name: string
  inviteCode: string
  createdAt: string
}

export interface Member {
  id: string
  groupId: string
  name: string
  createdAt: string
  /** Set when their last device left the group; kept so the history still shows their name. */
  leftAt: string | null
}

/** A group this device belongs to, for the group switcher. */
export interface Membership {
  groupId: string
  groupName: string
  /** The member this device acts as in that group. */
  memberId: string
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
