'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-browser'
import { dateTime, prettyDate } from '@/lib/format'
import type { InsuranceLead } from '@/lib/fields'

interface Step { id: string; name: string | null; delay_days: number; send_hour: number; lead_types: string[]; enabled: boolean; stop_if_replied: boolean; stop_if_status: string[] }
interface Send { step_id: string; status: string; error: string | null; sent_at: string }

const hour = (h: number) => (h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`)

/** This lead's automatic follow-up texts: sent, planned, or not sending (and why) */
export default function LeadFollowups({ lead }: { lead: InsuranceLead }) {
  const [steps, setSteps] = useState<Step[]>([])
  const [sends, setSends] = useState<Send[]>([])
  const [globalOn, setGlobalOn] = useState(true)

  useEffect(() => {
    supabase().from('followup_steps').select('*').order('delay_days').order('position').then(({ data }) => setSteps((data ?? []) as Step[]))
    supabase().from('followup_sends').select('*').eq('lead_id', lead.id).then(({ data }) => setSends((data ?? []) as Send[]))
    supabase().from('settings').select('followups_enabled').eq('id', 1).maybeSingle().then(({ data }) => setGlobalOn(data?.followups_enabled !== false))
  }, [lead.id, lead.updated_at])

  const created = new Date(lead.created_at)
  const rows = steps
    .filter((s) => !s.lead_types?.length || s.lead_types.includes(lead.lead_type))
    .map((s) => {
      const send = sends.find((x) => x.step_id === s.id)
      const due = new Date(created.getFullYear(), created.getMonth(), created.getDate() + s.delay_days)
      const dueYmd = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`
      let state: { text: string; tone: 'ok' | 'muted' | 'bad' | 'plan' }
      if (send?.status === 'sent') state = { text: `Sent ${dateTime(send.sent_at)}`, tone: 'ok' }
      else if (send?.status === 'failed') state = { text: `Failed: ${send.error ?? ''}`, tone: 'bad' }
      else if (send?.status === 'skipped') state = { text: `Skipped (${send.error ?? ''})`, tone: 'muted' }
      else if (!s.enabled || !globalOn) state = { text: 'Turned off in Settings', tone: 'muted' }
      else if (lead.sms_opted_out) state = { text: 'Not sending - opted out', tone: 'muted' }
      else if (lead.followups_paused) state = { text: 'Not sending - paused for this lead', tone: 'muted' }
      else if (lead.welcome_sms_status !== 'sent') state = { text: 'Waits for the welcome text', tone: 'muted' }
      else if (s.stop_if_replied && lead.last_inbound_at) state = { text: 'Not sending - they replied', tone: 'muted' }
      else if (s.stop_if_status?.includes(lead.status)) state = { text: `Not sending - lead is ${lead.status}`, tone: 'muted' }
      else state = { text: `Planned ${prettyDate(dueYmd)}, after ${hour(s.send_hour)}`, tone: 'plan' }
      return { s, state }
    })

  if (!rows.length) return null
  return (
    <div className="card p-4 text-sm">
      <h3 className="h2 mb-2">Follow-up texts</h3>
      <ul className="space-y-2">
        {rows.map(({ s, state }) => (
          <li key={s.id}>
            <div className="font-medium">{s.name || `Day ${s.delay_days}`}</div>
            <div className={state.tone === 'ok' ? 'text-success' : state.tone === 'bad' ? 'text-crimson' : state.tone === 'plan' ? 'text-navy' : 'text-muted'}>{state.text}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}
