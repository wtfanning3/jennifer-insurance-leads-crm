'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'
import { LEAD_STATUSES, LEAD_TYPES, LEAD_TYPE_LABELS, leadName, type InsuranceLead, type LeadStatus, type LeadType } from '@/lib/fields'
import { formatPhone } from '@/lib/phone'
import { localToday, prettyDate, timeAgo } from '@/lib/format'
import { StatusBadge, TypeBadge } from '@/components/Badges'

function LeadsList() {
  const params = useSearchParams()
  const router = useRouter()
  const [leads, setLeads] = useState<InsuranceLead[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [type, setType] = useState<LeadType | 'all'>((params?.get('type') as LeadType) || 'all')
  const [status, setStatus] = useState<LeadStatus | 'open' | 'all'>((params?.get('status') as LeadStatus) || 'all')
  const [q, setQ] = useState(params?.get('q') ?? '')
  const followup = params?.get('followup') === 'due'

  useEffect(() => setQ(params?.get('q') ?? ''), [params])

  useEffect(() => {
    ;(async () => {
      const out: InsuranceLead[] = []
      for (let from = 0; from < 50_000; from += 1000) {
        const { data, error } = await supabase().from('leads').select('*').order('created_at', { ascending: false }).range(from, from + 999)
        if (error) { setError(error.message); break }
        out.push(...((data ?? []) as InsuranceLead[]))
        if (!data || data.length < 1000) break
      }
      setLeads(out)
    })()
  }, [])

  const today = localToday()
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    const digits = q.replace(/\D/g, '')
    return (leads ?? []).filter((l) => {
      if (type !== 'all' && l.lead_type !== type) return false
      if (status === 'open' && (l.status === 'sold' || l.status === 'lost')) return false
      if (status !== 'all' && status !== 'open' && l.status !== status) return false
      if (followup && !(l.follow_up_date && l.follow_up_date <= today && l.status !== 'sold' && l.status !== 'lost')) return false
      if (words.length) {
        const hay = [l.first_name, l.last_name, l.email, l.business_name, l.city, l.current_carrier].join(' ').toLowerCase()
        const phoneHit = digits.length >= 3 && (l.phone ?? '').replace(/\D/g, '').includes(digits)
        if (!phoneHit && !words.every((w) => hay.includes(w))) return false
      }
      return true
    })
  }, [leads, type, status, q, followup, today])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: leads?.length ?? 0 }
    for (const l of leads ?? []) c[l.lead_type] = (c[l.lead_type] ?? 0) + 1
    return c
  }, [leads])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h1 className="h1">{followup ? 'Follow-ups Due' : 'Leads'}</h1>
        {followup && <Link href="/leads" className="text-sm text-navy hover:underline">Show all leads</Link>}
        <Link href="/leads/new" className="btn-primary ml-auto">+ Add lead</Link>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {(['all', ...LEAD_TYPES] as const).map((t) => (
          <button key={t} onClick={() => setType(t)} className={`rounded-full px-3 py-1.5 text-sm font-medium border ${type === t ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-line hover:bg-sky-light'}`}>
            {t === 'all' ? 'All' : LEAD_TYPE_LABELS[t]} <span className="opacity-70">{counts[t] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <input className="input max-w-xs" placeholder="Search name, phone, email..." value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value as LeadStatus | 'open' | 'all')}>
          <option value="all">Any status</option>
          <option value="open">Open (not sold / lost)</option>
          {LEAD_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {error && <p className="text-crimson text-sm mb-3">{error}</p>}
      {!leads ? (
        <p className="text-muted">Loading leads...</p>
      ) : shown.length === 0 ? (
        <div className="card p-8 text-center text-muted">{followup ? 'No follow-ups due. Nice work!' : 'No leads match.'}</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Phone</th>
                  <th className="px-4 py-2.5 font-medium">Texts</th>
                  <th className="px-4 py-2.5 font-medium">Follow-up</th>
                  <th className="px-4 py-2.5 font-medium">Received</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((l) => (
                  <tr key={l.id} className="border-t border-line hover:bg-sky-light/40 cursor-pointer" onClick={() => router.push(`/leads/${l.id}`)}>
                    <td className="px-4 py-3">
                      <Link href={`/leads/${l.id}`} className="font-semibold text-navy hover:underline">{leadName(l)}</Link>
                      {l.business_name && <div className="text-xs text-muted">{l.business_name}</div>}
                      {!l.business_name && l.city && <div className="text-xs text-muted">{[l.city, l.state].filter(Boolean).join(', ')}</div>}
                    </td>
                    <td className="px-4 py-3"><TypeBadge type={l.lead_type} /></td>
                    <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                    <td className="px-4 py-3 whitespace-nowrap">{l.phone ? formatPhone(l.phone) : ''}</td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      {l.unread_messages > 0 ? <span className="rounded-full bg-crimson text-white px-2 py-0.5 font-semibold">{l.unread_messages} new</span>
                        : l.sms_opted_out ? <span className="text-crimson">Opted out</span>
                        : l.last_inbound_at ? <span className="text-success">Replied</span>
                        : l.welcome_sms_status === 'queued' ? <span className="text-warn">Sends in AM</span>
                        : l.welcome_sms_status === 'failed' ? <span className="text-crimson">Failed</span>
                        : l.welcome_sms_status === 'sent' ? <span className="text-muted">Sent</span>
                        : <span className="text-muted">-</span>}
                    </td>
                    <td className={`px-4 py-3 whitespace-nowrap ${l.follow_up_date && l.follow_up_date < today ? 'text-crimson font-semibold' : l.follow_up_date === today ? 'text-warn font-semibold' : ''}`}>{prettyDate(l.follow_up_date)}</td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">{timeAgo(l.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default function LeadsPage() {
  return (
    <Suspense>
      <LeadsList />
    </Suspense>
  )
}
