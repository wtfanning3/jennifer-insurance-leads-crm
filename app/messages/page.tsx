'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase-browser'
import { leadName, type InsuranceLead } from '@/lib/fields'
import { timeAgo } from '@/lib/format'
import { TypeBadge } from '@/components/Badges'

interface Row { lead: InsuranceLead; last: { body: string; direction: string; sender: string; created_at: string } | null }

// Every lead conversation, newest first; unread ones on top
export default function MessagesPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [unknown, setUnknown] = useState<{ body: string; created_at: string }[]>([])

  useEffect(() => {
    const load = async () => {
      const { data: leads } = await supabase().from('leads').select('*').not('last_message_at', 'is', null).order('last_message_at', { ascending: false }).limit(300)
      const ids = (leads ?? []).map((l) => l.id)
      const { data: msgs } = ids.length ? await supabase().from('sms_messages').select('lead_id, body, direction, sender, created_at').in('lead_id', ids).order('created_at', { ascending: false }).limit(2000) : { data: [] }
      const last = new Map<string, Row['last']>()
      for (const m of msgs ?? []) if (!last.has(m.lead_id)) last.set(m.lead_id, m)
      const list = ((leads ?? []) as InsuranceLead[]).map((lead) => ({ lead, last: last.get(lead.id) ?? null }))
      list.sort((a, b) => Number(b.lead.unread_messages > 0) - Number(a.lead.unread_messages > 0))
      setRows(list)
      const { data: orphans } = await supabase().from('sms_messages').select('body, created_at').is('lead_id', null).order('created_at', { ascending: false }).limit(20)
      setUnknown(orphans ?? [])
    }
    load()
    const t = setInterval(load, 20_000)
    return () => clearInterval(t)
  }, [])

  return (
    <div>
      <h1 className="h1 mb-4">Text Messages</h1>
      {!rows ? <p className="text-muted">Loading...</p> : rows.length === 0 ? (
        <div className="card p-8 text-center text-muted">No texts yet. They show up here once leads start getting and answering texts.</div>
      ) : (
        <div className="card divide-y divide-line">
          {rows.map(({ lead, last }) => (
            <Link key={lead.id} href={`/leads/${lead.id}`} className={`flex items-start gap-3 px-4 py-3 hover:bg-sky-light/40 ${lead.unread_messages > 0 ? 'bg-sky-light/30' : ''}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`truncate ${lead.unread_messages > 0 ? 'font-bold text-navy' : 'font-semibold'}`}>{leadName(lead)}</span>
                  <TypeBadge type={lead.lead_type} />
                  {lead.bot_paused && !lead.sms_opted_out && <span className="text-[11px] text-warn font-semibold">Needs you</span>}
                  {lead.sms_opted_out && <span className="text-[11px] text-crimson">Opted out</span>}
                </div>
                {last && <p className="text-sm text-muted truncate">{last.direction === 'in' ? '' : last.sender === 'bot' ? 'Assistant: ' : 'You: '}{last.body}</p>}
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs text-muted">{timeAgo(lead.last_message_at)}</div>
                {lead.unread_messages > 0 && <span className="mt-1 inline-block rounded-full bg-crimson text-white text-xs px-2 py-0.5">{lead.unread_messages}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
      {unknown.length > 0 && (
        <div className="mt-6">
          <h2 className="h2 mb-2">From numbers that aren&apos;t leads</h2>
          <div className="card divide-y divide-line">
            {unknown.map((m, i) => <div key={i} className="px-4 py-2 text-sm"><span className="text-muted text-xs mr-2">{timeAgo(m.created_at)}</span>{m.body}</div>)}
          </div>
        </div>
      )}
    </div>
  )
}
