// The calendar feed (.ics) that phone calendars subscribe to: GET /calendar-feed/<token>.ics.
// The private token in the link is the only key, so it is deployed without JWT checks. Design
// notes: docs/calendario.md §13.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { buildIcs, type Feed } from './ics.ts'

const env = (name: string) => {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing secret ${name}`)
  return value
}

const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 })

  // The token is the last part of the path (with or without .ics) or ?token=.
  const url = new URL(req.url)
  const token = (url.searchParams.get('token') ?? url.pathname.split('/').pop() ?? '').replace(/\.ics$/, '')
  if (!/^[0-9a-f]{64}$/.test(token)) return new Response('Not found', { status: 404 })

  const { data, error } = await db.rpc('feed_calendar', { feed_token: token })
  if (error) {
    console.error(error)
    return new Response('Error', { status: 500 })
  }
  if (!data) return new Response('Not found', { status: 404 })

  return new Response(req.method === 'HEAD' ? null : buildIcs(data as Feed), {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="family-app.ics"',
      'cache-control': 'private, max-age=300',
    },
  })
})
