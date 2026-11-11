import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/auth'
import { db } from '@/lib/supabase-admin'
import { textLead } from '@/lib/texting'
import { getSettings, renderForLead, welcomeText } from '@/lib/settings'
import type { InsuranceLead } from '@/lib/fields'

// Staff texting a lead from the lead page.
//   { body: "..." }             - send this text ({first_name} etc. filled in)
//   { action: "welcome" }       - send the welcome text now
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireStaff()
  if (denied) return denied
  const { id } = await params
  const input = (await req.json().catch(() => ({}))) as { body?: string; action?: string }
  const { data: lead } = await db().from('leads').select('*').eq('id', id).maybeSingle()
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  const s = await getSettings()
  try {
    if (input.action === 'welcome') {
      await textLead(lead as InsuranceLead, welcomeText(lead as InsuranceLead, s), 'welcome')
      await db().from('leads').update({ welcome_sms_status: 'sent', welcome_sms_at: new Date().toISOString(), welcome_sms_error: null }).eq('id', id)
    } else {
      const body = renderForLead(String(input.body ?? ''), lead as InsuranceLead, s)
      await textLead(lead as InsuranceLead, body, 'agent')
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 })
  }
}
