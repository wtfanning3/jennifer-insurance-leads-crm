import { NextRequest, NextResponse } from 'next/server'
import { isCron, requireStaff } from '@/lib/auth'
import { runScheduled } from '@/lib/followups'

// Every 15 minutes (vercel.json): morning welcome texts, follow-up texts and
// the daily follow-up reminder email. Staff can also run it by hand.
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!isCron(req)) {
    const denied = await requireStaff()
    if (denied) return denied
  }
  try {
    return NextResponse.json({ ok: true, ...(await runScheduled()) })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
