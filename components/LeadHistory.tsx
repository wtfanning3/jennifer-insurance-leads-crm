'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-browser'
import { dateTime } from '@/lib/format'
import { actorLabel, describeEvent, type ActivityEvent } from '@/lib/activity'

/** Everything that happened to this lead, newest first */
export default function LeadHistory({ leadId, refreshKey }: { leadId: string; refreshKey?: string }) {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null)
  const [all, setAll] = useState(false)
  useEffect(() => {
    supabase().from('events').select('*').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(200).then(({ data }) => setEvents((data ?? []) as ActivityEvent[]))
  }, [leadId, refreshKey])
  if (!events) return null
  const shown = all ? events : events.slice(0, 8)
  return (
    <div className="card p-4 text-sm">
      <h3 className="h2 mb-2">History</h3>
      {events.length === 0 && <p className="text-muted">Nothing yet.</p>}
      <ol className="space-y-2 border-l-2 border-sky pl-3">
        {shown.map((e) => (
          <li key={e.id}>
            <div className="break-words">{describeEvent(e)}</div>
            <div className="text-xs text-muted">{dateTime(e.created_at)} · {actorLabel(e.actor)}</div>
          </li>
        ))}
      </ol>
      {events.length > 8 && <button className="mt-2 text-xs text-navy hover:underline" onClick={() => setAll(!all)}>{all ? 'Show less' : `Show all ${events.length}`}</button>}
    </div>
  )
}
