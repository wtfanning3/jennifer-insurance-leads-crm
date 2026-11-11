import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/auth'
import { askClaude } from '@/lib/ai'
import { db } from '@/lib/supabase-admin'
import { getSettings } from '@/lib/settings'
import { LEAD_TYPE_LABELS, leadName, leadSummaryLines, type InsuranceLead } from '@/lib/fields'
import { TEMPLATE_TAGS } from '@/lib/templates'

// "AI help" on any text box: rewrites what's there (or writes something new)
// the way staff ask. kind:
//   template - a welcome / follow-up text with {tags}
//   reply    - the next text to one lead (uses their details + conversation)
//   notes    - chatbot instructions
//   general  - anything else
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const denied = await requireStaff()
  if (denied) return denied
  const { text = '', instruction = '', kind = 'general', leadId, leadType } = (await req.json().catch(() => ({}))) as {
    text?: string
    instruction?: string
    kind?: 'template' | 'reply' | 'notes' | 'general'
    leadId?: string
    leadType?: string
  }
  const s = await getSettings()
  const agency = `${s.agency_name} (a Farmers Insurance agency${s.office_address ? ` in ${s.office_address}` : ''}${s.agent_name ? `, agent ${s.agent_name}` : ''})`

  const rules = [
    `You help the staff of ${agency} write.`,
    'Return only the finished text - no quotes around it, no explanation, no markdown.',
  ]
  let context = ''
  if (kind === 'template' || kind === 'reply') {
    rules.push(
      'This is a text message (SMS) to an insurance lead who requested a quote through SmartFinancial. Keep it short and personal, like a real person texting: ideally under 300 characters. No emojis unless asked.',
      'Never promise prices, savings amounts, approval or coverage. Do not ask for Social Security numbers, license numbers or payment details.'
    )
  }
  if (kind === 'template') {
    rules.push(
      `It is a reusable template${leadType ? ` for ${leadType} leads` : ''}. Use these tags where they fit (they are filled in automatically when sent) and keep any tags already used unless asked: ${TEMPLATE_TAGS.map((t) => `${t.tag} = ${t.meaning}`).join('; ')}.`,
      'A first (welcome) text must end with "Reply STOP to opt out."'
    )
  }
  if (kind === 'notes') rules.push('These are instructions and facts for an AI texting assistant that answers leads. Write clear, short bullet-free sentences it can follow.')
  if (kind === 'reply' && leadId) {
    const { data: lead } = await db().from('leads').select('*').eq('id', leadId).maybeSingle()
    if (lead) {
      const { data: msgs } = await db().from('sms_messages').select('direction, sender, body').eq('lead_id', leadId).order('created_at').limit(40)
      context = [
        `Lead: ${leadName(lead as InsuranceLead)} - ${LEAD_TYPE_LABELS[(lead as InsuranceLead).lead_type]}`,
        ...leadSummaryLines(lead as InsuranceLead),
        '',
        'Conversation so far (oldest first):',
        ...(msgs ?? []).map((m) => `${m.direction === 'in' ? 'LEAD' : 'US'}: ${m.body}`),
      ].join('\n')
      rules.push('Write the next text to send this lead. You may use {call_link} to include the tap-to-call link.')
    }
  }

  const ask = [
    context ? `${context}\n` : '',
    text.trim() ? `Current text:\n${text.trim()}\n` : 'There is no text yet - write it from scratch.\n',
    `What to do: ${instruction.trim() || (text.trim() ? 'Improve it: clearer, friendlier, fix spelling and grammar.' : 'Write it.')}`,
  ].join('\n')

  try {
    const out = await askClaude({ system: rules.join('\n'), messages: [{ role: 'user', content: ask }] })
    return NextResponse.json({ text: out.replace(/^["“](.*)["”]$/s, '$1').trim() })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 })
  }
}
