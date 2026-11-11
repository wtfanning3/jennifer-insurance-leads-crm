import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { currentUser } from './supabase-server'

/** null when signed in; otherwise the 401 to send back */
export async function requireStaff(): Promise<NextResponse | null> {
  const user = await currentUser()
  return user ? null : NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
}

export function secretMatches(given: string | null | undefined, expected: string | undefined): boolean {
  if (!given || !expected) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" */
export function isCron(req: NextRequest): boolean {
  return secretMatches(req.headers.get('authorization')?.replace(/^Bearer\s+/i, ''), process.env.CRON_SECRET)
}
