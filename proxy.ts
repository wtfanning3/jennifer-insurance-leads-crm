import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Every page needs a signed-in staff member, except the links leads tap in
// texts, the webhooks (SmartFinancial, Twilio/Telnyx - they check their own
// secrets) and the scheduled job (checks CRON_SECRET).
const PUBLIC = ['/login', '/i/', '/api/webhooks/', '/api/cron', '/brand/', '/icon.png', '/favicon.ico']

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  if (PUBLIC.some((p) => path === p || path.startsWith(p))) return NextResponse.next()

  let response = NextResponse.next({ request })
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list: { name: string; value: string; options?: Record<string, unknown> }[]) => {
        for (const { name, value } of list) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of list) response.cookies.set(name, value, options)
      },
    },
  })
  const { data } = await supabase.auth.getUser()
  if (!data.user) {
    if (path.startsWith('/api/')) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
    const url = new URL('/login', request.url)
    if (path !== '/') url.searchParams.set('next', path)
    return NextResponse.redirect(url)
  }
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
