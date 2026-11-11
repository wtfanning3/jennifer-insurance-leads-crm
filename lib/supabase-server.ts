import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/** Supabase as the signed-in person (server components and API routes) */
export async function supabaseForUser() {
  const store = await cookies()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: { name: string; value: string; options?: Record<string, unknown> }[]) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options)
        } catch {
          // Called from a server component - the proxy refreshes the session instead
        }
      },
    },
  })
}

/** The signed-in staff member, or null */
export async function currentUser() {
  const supabase = await supabaseForUser()
  const { data } = await supabase.auth.getUser()
  return data.user ?? null
}
