import { supabase, supabaseUrl } from './supabase'

// The private calendar link phone calendars subscribe to (docs/calendario.md §13). Whoever has
// it reads the person's calendar, so it is only shown in Cuenta and can be replaced or removed.

/** https link, for copying into Google Calendar ("Desde URL"). */
export function feedUrl(token: string): string {
  return `${supabaseUrl}/functions/v1/calendar-feed/${token}.ics`
}

/** webcal link: opens the phone's calendar app ready to subscribe (iPhone, Outlook…). */
export function feedSubscribeUrl(token: string): string {
  return feedUrl(token).replace(/^https?:/, 'webcal:')
}

export async function loadFeedToken(): Promise<string | null> {
  const { data, error } = await supabase.from('calendar_feeds').select('token').maybeSingle()
  if (error) throw error
  return data?.token ?? null
}

/** Creates the link, or a new one that replaces it. */
export async function createFeed(): Promise<string> {
  const { data, error } = await supabase.rpc('create_calendar_feed')
  if (error) throw error
  return data
}

export async function deleteFeed(): Promise<void> {
  const { error } = await supabase.rpc('delete_calendar_feed')
  if (error) throw error
}
