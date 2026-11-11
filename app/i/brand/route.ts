import { NextResponse } from 'next/server'
import { getSettings } from '@/lib/settings'

// Agency name and logos (public - also shown on the sign-in page)
export async function GET() {
  const s = await getSettings().catch(() => null)
  return NextResponse.json(
    {
      agency_name: s?.agency_name ?? null,
      agent_name: s?.agent_name ?? null,
      logo_url: s?.logo_url ?? null,
      icon_url: s?.icon_url ?? null,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
