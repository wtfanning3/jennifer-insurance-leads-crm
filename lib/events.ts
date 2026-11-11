import 'server-only'
import { db } from './supabase-admin'
import { leadName, type InsuranceLead } from './fields'

/** Adds a line to the activity log (lead page History, Reports). Never throws. */
export async function logEvent(lead: Pick<InsuranceLead, 'id' | 'first_name' | 'last_name' | 'lead_type'> | null, type: string, detail: Record<string, unknown> = {}) {
  try {
    await db().from('events').insert({ lead_id: lead?.id ?? null, lead_name: lead ? leadName(lead) : null, lead_type: lead?.lead_type ?? null, type, detail, actor: 'system' })
  } catch (err) {
    console.error('[events]', err)
  }
}
