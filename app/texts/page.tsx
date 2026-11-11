'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase-browser'
import { fetchAll } from '@/lib/fetch-all'
import { downloadCsv } from '@/lib/csv'
import { dateTime } from '@/lib/format'
import { LEAD_TYPES, LEAD_TYPE_LABELS, type LeadType } from '@/lib/fields'
import { formatPhone } from '@/lib/phone'
import DateRange, { presetRange, rangeBounds, type Range } from '@/components/DateRange'
import { TypeBadge } from '@/components/Badges'

interface Row {
  id: string
  lead_id: string | null
  direction: 'in' | 'out'
  sender: string
  body: string
  status: string | null
  error: string | null
  created_at: string
  leads: { first_name: string | null; last_name: string | null; business_name: string | null; lead_type: LeadType; phone: string | null } | null
}

const KIND: Record<string, string> = { lead: 'From lead', welcome: 'Welcome', followup: 'Follow-up', bot: 'AI assistant', agent: 'Staff', system: 'Automatic' }

// Every text sent and received, with filters and a spreadsheet download
export default function TextLogPage() {
  const [range, setRange] = useState<Range>(presetRange('30'))
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [direction, setDirection] = useState<'all' | 'in' | 'out'>('all')
  const [kind, setKind] = useState('all')
  const [type, setType] = useState<LeadType | 'all'>('all')
  const [failedOnly, setFailedOnly] = useState(false)
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(200)

  useEffect(() => {
    setRows(null)
    const { gte, lt } = rangeBounds(range)
    fetchAll<Row>((a, b) => {
      let query = supabase().from('sms_messages').select('*, leads(first_name, last_name, business_name, lead_type, phone)').order('created_at', { ascending: false })
      if (gte) query = query.gte('created_at', gte)
      if (lt) query = query.lt('created_at', lt)
      return query.range(a, b)
    }, 50_000).then(setRows).catch((e) => setError(e.message))
  }, [range])

  const name = (r: Row) => (r.leads ? [r.leads.first_name, r.leads.last_name].filter(Boolean).join(' ') || r.leads.business_name || '(no name)' : 'Unknown number')

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    return (rows ?? []).filter((r) => {
      if (direction !== 'all' && r.direction !== direction) return false
      if (kind !== 'all' && r.sender !== kind) return false
      if (type !== 'all' && r.leads?.lead_type !== type) return false
      if (failedOnly && r.status !== 'failed') return false
      if (words.length) {
        const hay = `${name(r)} ${r.body} ${r.leads?.phone ?? ''}`.toLowerCase()
        if (!words.every((w) => hay.includes(w))) return false
      }
      return true
    })
  }, [rows, direction, kind, type, failedOnly, q])

  const sent = shown.filter((r) => r.direction === 'out' && r.status !== 'failed').length
  const received = shown.filter((r) => r.direction === 'in').length
  const failed = shown.filter((r) => r.status === 'failed').length

  function exportCsv() {
    downloadCsv(`texts-${range.from ?? 'all'}-to-${range.to ?? 'now'}.csv`, ['Date', 'Lead', 'Lead type', 'Phone', 'Direction', 'Kind', 'Message', 'Status', 'Error'], shown.map((r) => [
      new Date(r.created_at).toLocaleString(), name(r), r.leads ? LEAD_TYPE_LABELS[r.leads.lead_type] : '', r.leads?.phone ?? '', r.direction === 'in' ? 'Received' : 'Sent', KIND[r.sender] ?? r.sender, r.body, r.status ?? '', r.error ?? '',
    ]))
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h1 className="h1">Text Log</h1>
        <Link href="/messages" className="text-sm text-navy hover:underline">Conversations →</Link>
        <button className="btn-secondary ml-auto" disabled={!shown.length} onClick={exportCsv}>Download spreadsheet</button>
      </div>

      <div className="card p-4 mb-4 flex flex-wrap items-end gap-3">
        <DateRange value={range} onChange={setRange} />
        <div>
          <label className="label">Sent / received</label>
          <select className="input w-auto" value={direction} onChange={(e) => setDirection(e.target.value as 'all' | 'in' | 'out')}>
            <option value="all">Both</option><option value="out">Sent</option><option value="in">Received</option>
          </select>
        </div>
        <div>
          <label className="label">Kind</label>
          <select className="input w-auto" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="all">All kinds</option>
            {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Lead type</label>
          <select className="input w-auto" value={type} onChange={(e) => setType(e.target.value as LeadType | 'all')}>
            <option value="all">All types</option>
            {LEAD_TYPES.map((t) => <option key={t} value={t}>{LEAD_TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="label">Search</label>
          <input className="input" placeholder="Name, phone or words in the text" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm pb-2"><input type="checkbox" checked={failedOnly} onChange={(e) => setFailedOnly(e.target.checked)} /> Failed only</label>
      </div>

      {error && <p className="text-sm text-crimson mb-3">{error}</p>}
      {rows && <p className="text-sm text-muted mb-2"><b className="text-ink">{shown.length}</b> texts · {sent} sent · {received} received{failed ? <span className="text-crimson"> · {failed} failed</span> : null}</p>}

      {!rows ? <p className="text-muted">Loading texts...</p> : shown.length === 0 ? (
        <div className="card p-8 text-center text-muted">No texts match.</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2.5 font-medium whitespace-nowrap">When</th>
                  <th className="px-3 py-2.5 font-medium">Lead</th>
                  <th className="px-3 py-2.5 font-medium"></th>
                  <th className="px-3 py-2.5 font-medium">Kind</th>
                  <th className="px-3 py-2.5 font-medium w-1/2">Message</th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, limit).map((r) => (
                  <tr key={r.id} className="border-t border-line align-top">
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted">{dateTime(r.created_at)}</td>
                    <td className="px-3 py-2.5">
                      {r.lead_id ? <Link href={`/leads/${r.lead_id}`} className="font-semibold text-navy hover:underline">{name(r)}</Link> : <span className="text-muted">{name(r)}</span>}
                      {r.leads?.phone && <div className="text-xs text-muted whitespace-nowrap">{formatPhone(r.leads.phone)}</div>}
                    </td>
                    <td className="px-3 py-2.5">{r.leads && <TypeBadge type={r.leads.lead_type} />}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={r.direction === 'in' ? 'font-semibold text-success' : ''}>{r.direction === 'in' ? '← Received' : `→ ${KIND[r.sender] ?? r.sender}`}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="whitespace-pre-wrap break-words">{r.body}</p>
                      {r.status === 'failed' && <p className="text-xs text-crimson mt-1">Not sent: {r.error}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shown.length > limit && (
            <div className="p-3 border-t border-line text-center">
              <button className="btn-secondary" onClick={() => setLimit(limit + 500)}>Show more ({shown.length - limit} more)</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
