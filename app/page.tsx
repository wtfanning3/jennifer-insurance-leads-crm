'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase-browser'
import { LEAD_TYPES, LEAD_TYPE_LABELS, leadName, type InsuranceLead } from '@/lib/fields'
import { formatPhone } from '@/lib/phone'
import { localToday, prettyDate, timeAgo } from '@/lib/format'
import { useBrand } from '@/lib/use-brand'
import { StatusBadge, TypeBadge } from '@/components/Badges'

export default function Dashboard() {
  const brand = useBrand()
  const [leads, setLeads] = useState<InsuranceLead[] | null>(null)

  useEffect(() => {
    const since = new Date(Date.now() - 120 * 86400_000).toISOString()
    supabase().from('leads').select('*').or(`created_at.gte.${since},follow_up_date.not.is.null,unread_messages.gt.0`).order('created_at', { ascending: false }).limit(2000).then(({ data }) => setLeads((data ?? []) as InsuranceLead[]))
  }, [])

  const today = localToday()
  const all = leads ?? []
  const startOfWeek = new Date(); startOfWeek.setDate(startOfWeek.getDate() - 7)
  const newToday = all.filter((l) => new Date(l.created_at).toDateString() === new Date().toDateString())
  const thisWeek = all.filter((l) => new Date(l.created_at) >= startOfWeek)
  const unread = all.filter((l) => l.unread_messages > 0)
  const needsYou = all.filter((l) => l.bot_paused && !l.sms_opted_out && l.last_inbound_at && l.status !== 'sold' && l.status !== 'lost' && new Date(l.last_inbound_at) >= startOfWeek)
  const due = all.filter((l) => l.follow_up_date && l.follow_up_date <= today && l.status !== 'sold' && l.status !== 'lost').sort((a, b) => (a.follow_up_date! < b.follow_up_date! ? -1 : 1))
  const sold30 = all.filter((l) => l.status === 'sold' && new Date(l.updated_at) >= new Date(Date.now() - 30 * 86400_000)).length
  const failed = all.filter((l) => l.welcome_sms_status === 'failed' && new Date(l.created_at) >= startOfWeek)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">{greeting()}, {brand.agent_name}</h1>
        <p className="text-muted text-sm">{brand.agency_name}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="New leads today" value={newToday.length} href="/leads" />
        <Stat label="Last 7 days" value={thisWeek.length} href="/leads" />
        <Stat label="Unread texts" value={unread.reduce((n, l) => n + l.unread_messages, 0)} href="/messages" alert={unread.length > 0} />
        <Stat label="Follow-ups due" value={due.length} href="/leads?followup=due" alert={due.length > 0} />
      </div>

      <div className="card p-4">
        <h2 className="h2 mb-3">Last 7 days by type</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {LEAD_TYPES.map((t) => (
            <Link key={t} href={`/leads?type=${t}`} className="rounded-lg border border-line p-3 hover:bg-sky-light/40">
              <div className="text-xs text-muted">{LEAD_TYPE_LABELS[t]}</div>
              <div className="text-2xl font-bold text-navy">{thisWeek.filter((l) => l.lead_type === t).length}</div>
            </Link>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">Sold in the last 30 days: <span className="font-semibold text-success">{sold30}</span></p>
      </div>

      {(unread.length > 0 || needsYou.length > 0) && (
        <List title="Texts that need you" empty="" leads={[...new Map([...unread, ...needsYou].map((l) => [l.id, l])).values()]} right={(l) => (l.unread_messages > 0 ? <span className="rounded-full bg-crimson text-white text-xs px-2 py-0.5">{l.unread_messages} new</span> : <span className="text-xs text-warn font-semibold">Assistant handed off</span>)} />
      )}
      {failed.length > 0 && <List title="Welcome texts that failed" empty="" leads={failed} right={(l) => <span className="text-xs text-crimson">{l.welcome_sms_error}</span>} />}
      <List title="Follow-ups due" empty="No follow-ups due today." leads={due.slice(0, 15)} right={(l) => <span className={`text-xs font-semibold ${l.follow_up_date! < today ? 'text-crimson' : 'text-warn'}`}>{l.follow_up_date! < today ? 'Overdue · ' : ''}{prettyDate(l.follow_up_date)}</span>} />
      <List title="Newest leads" empty={leads ? 'No leads yet. Use Settings > Send a test lead to try it out.' : 'Loading...'} leads={all.slice(0, 10)} right={(l) => <span className="text-xs text-muted">{timeAgo(l.created_at)}</span>} />
    </div>
  )
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function Stat({ label, value, href, alert }: { label: string; value: number; href: string; alert?: boolean }) {
  return (
    <Link href={href} className="card p-4 hover:shadow-sm">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-3xl font-bold ${alert ? 'text-crimson' : 'text-navy'}`}>{value}</div>
    </Link>
  )
}

function List({ title, empty, leads, right }: { title: string; empty: string; leads: InsuranceLead[]; right: (l: InsuranceLead) => React.ReactNode }) {
  return (
    <div className="card">
      <h2 className="h2 px-4 pt-4 pb-2">{title}</h2>
      {leads.length === 0 ? <p className="px-4 pb-4 text-sm text-muted">{empty}</p> : (
        <div className="divide-y divide-line">
          {leads.map((l) => (
            <Link key={l.id} href={`/leads/${l.id}`} className="flex flex-wrap items-center gap-2 px-4 py-2.5 hover:bg-sky-light/40">
              <span className="font-semibold text-navy">{leadName(l)}</span>
              <TypeBadge type={l.lead_type} />
              <StatusBadge status={l.status} />
              {l.phone && <span className="text-sm text-muted">{formatPhone(l.phone)}</span>}
              <span className="ml-auto">{right(l)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
