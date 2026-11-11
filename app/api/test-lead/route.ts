import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/auth'
import { parseLeadText } from '@/lib/parse-lead'
import { ingestLead } from '@/lib/ingest'
import { SAMPLE_LEADS } from '@/lib/samples'
import { LEAD_TYPES, type LeadType } from '@/lib/fields'
import { toE164 } from '@/lib/phone'

// Settings > "Send a test lead": runs one of SmartFinancial's sample leads
// through exactly what a real lead goes through (saved, emailed, texted).
// Put your own cell number in to receive the welcome text and try the chatbot.
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const denied = await requireStaff()
  if (denied) return denied
  const { type = 'auto', phone, email } = (await req.json().catch(() => ({}))) as { type?: LeadType; phone?: string; email?: string }
  if (!LEAD_TYPES.includes(type)) return NextResponse.json({ error: 'Unknown lead type' }, { status: 400 })
  let text = SAMPLE_LEADS[type]
  const e164 = toE164(phone)
  if (phone && !e164) return NextResponse.json({ error: 'That phone number does not look right (10 digits).' }, { status: 400 })
  if (e164) text = text.replace('555-123-4567', e164)
  if (email) text = text.replace(/Email \S+/, `Email ${email}`)
  text = text.replace(/^Name (\S+)/m, 'Name TEST-$1')
  try {
    const parsed = parseLeadText(text)
    // A unique id so the same test can be run again
    parsed.source_lead_id = `test-${Date.now()}`
    return NextResponse.json(await ingestLead(parsed, { test: true, text }, 'test'))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
