import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// The server's own database access (receiving leads and texts, the scheduled
// job). Uses the service role key, which is never sent to the browser.
let cached: SupabaseClient | null = null
export function db(): SupabaseClient {
  if (cached) return cached
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see docs/SETUP.md).')
  cached = createClient(url, key, { auth: { persistSession: false } })
  return cached
}
