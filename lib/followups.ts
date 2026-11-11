import 'server-only'
import { db } from './supabase-admin'
import type { InsuranceLead, LeadType } from './fields'
import { getSettings, isQuietHours, officeHour, officeToday, renderForLead, type Settings } from './settings'
import { sendWelcome } from './ingest'
import { textLead } from './texting'
import { emailFollowUpDigest } from './notify'
import { smsProvider } from './sms'

export interface FollowupStep {
  id: string
  position: number
  name: string | null
  delay_days: number
  send_hour: number
  lead_types: LeadType[]
  body: string
  enabled: boolean
  stop_if_replied: boolean
  stop_if_status: string[]
}

const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** The scheduled job (every 15 minutes): morning welcome texts, follow-up texts, follow-up reminder email */
export async function runScheduled(): Promise<Record<string, unknown>> {
  const s = await getSettings()
  const report: Record<string, unknown> = {}
  const quiet = isQuietHours(s)

  // 1. Welcome texts held overnight
  if (!quiet && smsProvider()) {
    const { data: queued } = await db().from('leads').select('*').eq('welcome_sms_status', 'queued').order('created_at').limit(50)
    let n = 0
    for (const lead of (queued ?? []) as InsuranceLead[]) {
      await sendWelcome(lead, s)
      n++
    }
    report.welcomeSent = n
  }

  // 2. Follow-up texts
  if (!quiet && s.followups_enabled && smsProvider()) report.followups = await runFollowups(s)

  // 3. Morning email: follow-ups due today (once a day, from 7am)
  const today = officeToday(s)
  if (officeHour(s) >= 7 && s.last_follow_up_digest !== today) {
    await db().from('settings').update({ last_follow_up_digest: today }).eq('id', 1)
    const { data: due } = await db().from('leads').select('*').lte('follow_up_date', today).not('status', 'in', '(sold,lost)').order('follow_up_date').limit(200)
    try {
      await emailFollowUpDigest((due ?? []) as InsuranceLead[], s, today)
      report.digest = due?.length ?? 0
    } catch (err) {
      report.digestError = err instanceof Error ? err.message : String(err)
    }
  }
  return report
}

async function runFollowups(s: Settings) {
  const { data: stepRows } = await db().from('followup_steps').select('*').eq('enabled', true).order('delay_days').order('position')
  const steps = (stepRows ?? []) as FollowupStep[]
  if (!steps.length) return { sent: 0 }
  const hour = officeHour(s)
  const today = officeToday(s)
  const maxDelay = Math.max(...steps.map((x) => x.delay_days))
  const since = new Date(Date.now() - (maxDelay + 3) * 86400_000).toISOString()

  const { data: leadRows } = await db()
    .from('leads')
    .select('*')
    .gte('created_at', since)
    .eq('sms_opted_out', false)
    .eq('followups_paused', false)
    .eq('welcome_sms_status', 'sent')
    .not('phone_e164', 'is', null)
    .limit(1000)
  const leads = (leadRows ?? []) as InsuranceLead[]
  if (!leads.length) return { sent: 0 }

  const { data: sendRows } = await db().from('followup_sends').select('lead_id, step_id').in('lead_id', leads.map((l) => l.id))
  const done = new Set((sendRows ?? []).map((r) => `${r.lead_id}:${r.step_id}`))
  let sent = 0
  let failed = 0

  for (const lead of leads) {
    if (sent >= 60) break
    // Don't stack texts: nothing if we texted them in the last 18 hours
    if (lead.last_message_at && Date.now() - new Date(lead.last_message_at).getTime() < 18 * 3600_000) continue
    const created = officeToday(s, new Date(lead.created_at))
    for (const step of steps) {
      if (done.has(`${lead.id}:${step.id}`)) continue
      if (step.lead_types?.length && !step.lead_types.includes(lead.lead_type)) continue
      if (addDays(created, step.delay_days) > today || hour < step.send_hour) continue
      // Too late for this one (more than 2 days past) - skip it quietly
      const skipReason =
        addDays(created, step.delay_days + 2) < today ? 'missed its day'
        : step.stop_if_replied && lead.last_inbound_at ? 'lead already replied'
        : step.stop_if_status?.includes(lead.status) ? `lead is ${lead.status}`
        : null
      if (skipReason) {
        await db().from('followup_sends').insert({ lead_id: lead.id, step_id: step.id, status: 'skipped', error: skipReason })
        continue
      }
      try {
        await textLead(lead, renderForLead(step.body, lead, s), 'followup')
        await db().from('followup_sends').insert({ lead_id: lead.id, step_id: step.id, status: 'sent' })
        sent++
      } catch (err) {
        await db().from('followup_sends').insert({ lead_id: lead.id, step_id: step.id, status: 'failed', error: err instanceof Error ? err.message : String(err) })
        failed++
      }
      break // one follow-up per lead per run
    }
  }
  return { sent, failed }
}
