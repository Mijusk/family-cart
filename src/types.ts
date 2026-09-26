// Mirrors the planned Supabase tables (camelCase here; the data layer will map snake_case columns).

export type ItemStatus = 'pending' | 'in_cart' | 'purchased' | 'not_found'

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
  addedBy: string
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
}
