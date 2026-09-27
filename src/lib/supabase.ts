import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY: copia .env.example a .env.local')
}

/**
 * A local Supabase (127.0.0.1 / localhost) is reached through whatever host served the page:
 * localhost on the PC, the PC's current LAN address on a phone. No IP to keep up to date in
 * .env.local when the router hands out a new one. Hosted URLs are used as they are.
 */
function resolveUrl(configured: string): string {
  const parsed = new URL(configured)
  if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') {
    parsed.hostname = window.location.hostname
  }
  return parsed.origin
}

export const supabase = createClient<Database>(resolveUrl(url), key)
