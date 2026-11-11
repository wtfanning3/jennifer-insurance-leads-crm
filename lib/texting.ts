import 'server-only'
import { db } from './supabase-admin'
import { sendSms } from './sms'
import type { InsuranceLead } from './fields'

export type OutSender = 'welcome' | 'followup' | 'bot' | 'agent' | 'system'

/**
 * Texts a lead and saves the text in their conversation. Throws (and saves
 * the failed text with its error) if it couldn't be sent.
 * `force` sends even to someone who opted out - only for the one
 * "you're unsubscribed" confirmation.
 */
export async function textLead(lead: Pick<InsuranceLead, 'id' | 'phone_e164' | 'sms_opted_out'>, body: string, sender: OutSender, force = false) {
  if (!lead.phone_e164) throw new Error('This lead has no phone number that can get texts.')
  if (lead.sms_opted_out && !force) throw new Error('This lead opted out of texts.')
  const text = body.trim()
  if (!text) throw new Error('The text is empty.')
  try {
    const sent = await sendSms(lead.phone_e164, text)
    await db().from('sms_messages').insert({ lead_id: lead.id, direction: 'out', sender, body: text, provider: sent.provider, provider_id: sent.id, status: sent.status ?? 'sent' })
    await db().from('leads').update({ last_message_at: new Date().toISOString() }).eq('id', lead.id)
    return sent
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await db().from('sms_messages').insert({ lead_id: lead.id, direction: 'out', sender, body: text, status: 'failed', error: msg })
    throw err
  }
}
