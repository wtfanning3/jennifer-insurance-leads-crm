import 'server-only'
import { db } from './supabase-admin'
import type { InsuranceLead } from './fields'
import type { ParsedLead } from './parse-lead'
import { toE164 } from './phone'
import { getSettings, isQuietHours, welcomeText, type Settings } from './settings'
import { textLead } from './texting'
import { emailNewLead } from './notify'
import { smsProvider } from './sms'

export interface IngestResult {
  ok: boolean
  leadId?: string
  duplicate?: boolean
  ignored?: string
  text?: string
}

/** Saves a lead (or updates it if SmartFinancial sent the same one again), emails it, and texts it */
export async function ingestLead(parsed: ParsedLead, raw: unknown, source = 'smartfinancial'): Promise<IngestResult> {
  if (!parsed.lead_type) {
    return { ok: true, ignored: parsed.unsupportedType ? `${parsed.unsupportedType} leads are not handled` : 'Could not tell the lead type (auto, home, renters or commercial)' }
  }
  const s = await getSettings()
  const phoneE164 = toE164(parsed.columns.phone)
  const record = { ...parsed.columns, lead_type: parsed.lead_type, details: parsed.details, phone_e164: phoneE164, source, source_lead_id: parsed.source_lead_id, raw_payload: raw as object }

  // The same lead sent again (same SmartFinancial id, or same phone + type within a day)
  let existing: InsuranceLead | null = null
  if (parsed.source_lead_id) {
    const { data } = await db().from('leads').select('*').eq('source_lead_id', parsed.source_lead_id).limit(1).maybeSingle()
    existing = data
  }
  if (!existing && phoneE164) {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const { data } = await db().from('leads').select('*').eq('phone_e164', phoneE164).eq('lead_type', parsed.lead_type).gte('created_at', since).limit(1).maybeSingle()
    existing = data
  }
  if (existing) {
    // Fill in anything new; keep what staff already changed
    const patch: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(parsed.columns)) if (v && !(existing as unknown as Record<string, unknown>)[k]) patch[k] = v
    patch.details = { ...parsed.details, ...existing.details }
    await db().from('leads').update(patch).eq('id', existing.id)
    return { ok: true, leadId: existing.id, duplicate: true }
  }

  const { data: lead, error } = await db().from('leads').insert(record).select('*').single()
  if (error || !lead) throw new Error(`Could not save the lead: ${error?.message}`)

  const textStatus = await sendWelcome(lead as InsuranceLead, s)
  try {
    await emailNewLead(lead as InsuranceLead, s, textStatus)
  } catch (err) {
    console.error('[ingest] lead email failed', err)
  }
  return { ok: true, leadId: lead.id, text: textStatus }
}

/** The first text to a new lead - now, or queued for the morning. Returns what happened, in words. */
export async function sendWelcome(lead: InsuranceLead, s: Settings): Promise<string> {
  const skip = async (why: string) => {
    await db().from('leads').update({ welcome_sms_status: 'skipped', welcome_sms_error: why }).eq('id', lead.id)
    return `not sent - ${why}`
  }
  if (!s.welcome_enabled) return skip('welcome texts are turned off in Settings')
  if (!lead.phone_e164) return skip('no valid phone number')
  if (lead.sms_opted_out) return skip('opted out of texts')
  if (!smsProvider()) return skip('texting is not set up yet')
  if (isQuietHours(s)) {
    await db().from('leads').update({ welcome_sms_status: 'queued' }).eq('id', lead.id)
    return `will be sent at ${s.quiet_end_hour}:00 (it's after hours)`
  }
  try {
    await textLead(lead, welcomeText(lead, s), 'welcome')
    await db().from('leads').update({ welcome_sms_status: 'sent', welcome_sms_at: new Date().toISOString(), welcome_sms_error: null }).eq('id', lead.id)
    return 'sent'
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await db().from('leads').update({ welcome_sms_status: 'failed', welcome_sms_error: msg }).eq('id', lead.id)
    return `failed - ${msg}`
  }
}
