import { NextRequest, NextResponse, after } from 'next/server'
import { db } from '@/lib/supabase-admin'
import { keywordOf, telnyxSignatureOk, twilioSignatureOk } from '@/lib/sms'
import { getSettings, officePhoneFor, type Settings } from '@/lib/settings'
import { textLead } from '@/lib/texting'
import { botReply, type SmsRow } from '@/lib/bot'
import { emailReply } from '@/lib/notify'
import { sendEmail } from '@/lib/email'
import { notifyEmailList } from '@/lib/settings'
import { formatPhone, toE164 } from '@/lib/phone'
import { leadName, type InsuranceLead } from '@/lib/fields'
import { aiConfigured } from '@/lib/ai'

// Texts FROM leads arrive here (Twilio or Telnyx "incoming message" webhook):
//   https://<your CRM>/api/webhooks/sms
// The chatbot answers, STOP / START / HELP are handled, and staff get an email.
export const maxDuration = 60

const BOT_REPLIES_PER_DAY = 15

interface Inbound {
  provider: 'twilio' | 'telnyx'
  from: string
  body: string
  id: string | null
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  let inbound: Inbound | null = null

  if ((req.headers.get('content-type') ?? '').includes('form-urlencoded')) {
    // Twilio
    const params = Object.fromEntries(new URLSearchParams(raw))
    const url = process.env.SMS_WEBHOOK_URL || `${req.nextUrl.origin}${req.nextUrl.pathname}${req.nextUrl.search}`
    if (!twilioSignatureOk(url, params, req.headers.get('x-twilio-signature'))) {
      return new NextResponse('Invalid signature', { status: 403 })
    }
    if (params.Body !== undefined && params.From) inbound = { provider: 'twilio', from: params.From, body: params.Body, id: params.MessageSid ?? params.SmsSid ?? null }
  } else {
    // Telnyx
    if (!telnyxSignatureOk(raw, req.headers.get('telnyx-signature-ed25519'), req.headers.get('telnyx-timestamp'))) {
      return new NextResponse('Invalid signature', { status: 403 })
    }
    try {
      const data = JSON.parse(raw)?.data
      if (data?.event_type === 'message.received') {
        inbound = { provider: 'telnyx', from: data.payload?.from?.phone_number, body: data.payload?.text ?? '', id: data.payload?.id ?? null }
      }
    } catch {}
  }

  if (inbound) {
    const msg = inbound
    // Answer the texting service right away; the reply is worked out after
    after(() => handleInbound(msg).catch((err) => console.error('[sms webhook]', err)))
  }
  return inbound?.provider === 'twilio' || !inbound
    ? new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
    : NextResponse.json({ ok: true })
}

async function handleInbound(msg: Inbound) {
  const from = toE164(msg.from) ?? msg.from
  const body = String(msg.body ?? '').trim()
  const s = await getSettings()

  // Already got this one (texting services sometimes send twice)
  if (msg.id) {
    const { data: dupe } = await db().from('sms_messages').select('id').eq('provider', msg.provider).eq('provider_id', msg.id).maybeSingle()
    if (dupe) return
  }

  const { data: leadRow } = await db().from('leads').select('*').eq('phone_e164', from).order('created_at', { ascending: false }).limit(1).maybeSingle()
  const lead = leadRow as InsuranceLead | null

  await db().from('sms_messages').insert({ lead_id: lead?.id ?? null, direction: 'in', sender: 'lead', body: body || '(picture or empty message)', provider: msg.provider, provider_id: msg.id, status: 'received' })

  if (!lead) {
    await sendEmail({
      to: notifyEmailList(s),
      subject: `Text from an unknown number ${formatPhone(from)}`,
      text: `${formatPhone(from)} texted your lead line, but they don't match any lead in the CRM:\n\n"${body}"`,
    }).catch(() => {})
    return
  }

  const now = new Date().toISOString()
  await db().from('leads').update({ last_inbound_at: now, last_message_at: now, unread_messages: (lead.unread_messages ?? 0) + 1 }).eq('id', lead.id)

  const keyword = keywordOf(body)
  if (keyword === 'stop') {
    // Twilio / Telnyx send the carrier-required "you're unsubscribed" reply themselves
    await db().from('leads').update({ sms_opted_out: true, sms_opted_out_at: now, bot_paused: true }).eq('id', lead.id)
    await emailReply(lead, s, body, 'Opted out of texts (replied STOP). No more texts will be sent to them.', null).catch(() => {})
    return
  }
  if (keyword === 'start') {
    await db().from('leads').update({ sms_opted_out: false, sms_opted_out_at: null }).eq('id', lead.id)
    await emailReply(lead, s, body, 'Opted back in to texts (replied START).', null).catch(() => {})
    return
  }
  if (keyword === 'help') {
    const office = officePhoneFor(lead, s)
    await textLead({ ...lead, sms_opted_out: false }, `${s.agency_name}: ${office ? `call us at ${formatPhone(office)}` : 'reply here and we will help'}. Msg & data rates may apply. Reply STOP to opt out.`, 'system').catch(() => {})
    return
  }
  if (lead.sms_opted_out) return

  const decision = await maybeBotReply(lead, s)
  await emailReply(lead, s, body, decision.note, decision.reply).catch((err) => console.error('[sms webhook] email', err))
}

async function maybeBotReply(lead: InsuranceLead, s: Settings): Promise<{ reply: string | null; note: string | null }> {
  if (!s.bot_enabled) return { reply: null, note: null }
  if (lead.bot_paused) return { reply: null, note: 'The assistant is paused for this lead - please reply yourself.' }
  if (!aiConfigured()) return { reply: null, note: 'The assistant is not set up (no AI key) - please reply yourself.' }

  const since = new Date(Date.now() - 86400_000).toISOString()
  const { count } = await db().from('sms_messages').select('id', { count: 'exact', head: true }).eq('lead_id', lead.id).eq('sender', 'bot').gte('created_at', since)
  if ((count ?? 0) >= BOT_REPLIES_PER_DAY) {
    await db().from('leads').update({ bot_paused: true }).eq('id', lead.id)
    return { reply: null, note: `The assistant has replied ${BOT_REPLIES_PER_DAY} times today and paused itself - please take over.` }
  }

  const { data: history } = await db().from('sms_messages').select('direction, sender, body, created_at').eq('lead_id', lead.id).neq('status', 'failed').order('created_at').limit(60)
  try {
    const d = await botReply(lead, (history ?? []) as SmsRow[], s)
    if (d.handoff) await db().from('leads').update({ bot_paused: true }).eq('id', lead.id)
    if (d.reply) await textLead(lead, d.reply, 'bot')
    return { reply: d.reply || null, note: d.handoff ? `Needs you: ${d.note || 'the assistant handed this conversation to you'}. The assistant is now paused for ${leadName(lead)}.` : d.note || null }
  } catch (err) {
    return { reply: null, note: `The assistant could not reply (${err instanceof Error ? err.message : err}) - please reply yourself.` }
  }
}
