'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase-browser'
import { fetchAll } from '@/lib/fetch-all'
import { downloadCsv } from '@/lib/csv'
import { dateTime } from '@/lib/format'
import { LEAD_STATUSES, LEAD_TYPES, LEAD_TYPE_LABELS, leadSummaryLines, formatAddress, type InsuranceLead } from '@/lib/fields'
import { actorLabel, describeEvent, EVENT_LABELS, type ActivityEvent } from '@/lib/activity'
import DateRange, { presetRange, rangeBounds, type Range } from '@/components/DateRange'
import { BarList, ColumnChart, Tile, type Point } from '@/components/Charts'

interface Sms { id: string; lead_id: string | null; direction: 'in' | 'out'; sender: string; status: string | null; created_at: string }
interface FSend { lead_id: string; step_id: string; status: string; sent_at: string }
interface Step { id: string; name: string | null; delay_days: number }

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '-')
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function duration(ms: number) {
  const m = Math.round(ms / 60000)
  if (m < 1) return 'under 1 min'
  if (m < 60) return `${m} min`
  const h = m / 60
  return h < 48 ? `${h.toFixed(1)} hrs` : `${(h / 24).toFixed(1)} days`
}
const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

export default function ReportsPage() {
  const [range, setRange] = useState<Range>(presetRange('30'))
  const [data, setData] = useState<{ leads: InsuranceLead[]; sms: Sms[]; sends: FSend[]; steps: Step[]; events: ActivityEvent[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [eventType, setEventType] = useState('all')
  const [eventLimit, setEventLimit] = useState(100)

  useEffect(() => {
    setData(null)
    const { gte, lt } = rangeBounds(range)
    const inRange = <Q extends { gte: (c: string, v: string) => Q; lt: (c: string, v: string) => Q }>(q: Q, col: string) => {
      let out = q
      if (gte) out = out.gte(col, gte)
      if (lt) out = out.lt(col, lt)
      return out
    }
    Promise.all([
      fetchAll<InsuranceLead>((a, b) => inRange(supabase().from('leads').select('*'), 'created_at').order('created_at').range(a, b), 50_000),
      fetchAll<Sms>((a, b) => inRange(supabase().from('sms_messages').select('id, lead_id, direction, sender, status, created_at'), 'created_at').order('created_at').range(a, b), 100_000),
      fetchAll<FSend>((a, b) => inRange(supabase().from('followup_sends').select('*'), 'sent_at').order('sent_at').range(a, b), 50_000),
      fetchAll<Step>((a, b) => supabase().from('followup_steps').select('id, name, delay_days').order('delay_days').range(a, b)),
      fetchAll<ActivityEvent>((a, b) => inRange(supabase().from('events').select('*'), 'created_at').order('created_at', { ascending: false }).range(a, b), 50_000),
    ])
      .then(([leads, sms, sends, steps, events]) => setData({ leads, sms, sends, steps, events }))
      .catch((e) => setError(`${e.message}. (Has supabase/migrations/0002_notes_and_activity.sql been run?)`))
  }, [range])

  const r = useMemo(() => {
    if (!data) return null
    const { leads, sms, sends, steps, events } = data
    const real = leads.filter((l) => l.source !== 'test')
    const texted = real.filter((l) => l.welcome_sms_status === 'sent')
    const replied = real.filter((l) => l.last_inbound_at)
    const sold = real.filter((l) => l.status === 'sold')
    const quotedOrSold = real.filter((l) => l.status === 'quoted' || l.status === 'sold')
    const tapped = real.filter((l) => l.call_link_clicked_at)
    const welcomeDelays = real.filter((l) => l.welcome_sms_at).map((l) => new Date(l.welcome_sms_at!).getTime() - new Date(l.created_at).getTime())
    const outOk = sms.filter((m) => m.direction === 'out' && m.status !== 'failed')

    // Leads over time: by day (up to ~2 months), else by week, else by month
    const first = real[0] ? new Date(real[0].created_at) : new Date()
    const start = range.from ? new Date(`${range.from}T00:00:00`) : new Date(first.getFullYear(), first.getMonth(), first.getDate())
    const end = range.to ? new Date(`${range.to}T00:00:00`) : new Date()
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
    const bucket = days <= 62 ? 'day' : days <= 400 ? 'week' : 'month'
    const keyOf = (d: Date) => {
      if (bucket === 'day') return ymd(d)
      if (bucket === 'week') { const w = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()); return ymd(w) }
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
    const counts = new Map<string, number>()
    for (const l of real) { const k = keyOf(new Date(l.created_at)); counts.set(k, (counts.get(k) ?? 0) + 1) }
    const series: Point[] = []
    const seen = new Set<string>()
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const k = keyOf(d)
      if (seen.has(k)) continue
      seen.add(k)
      const dt = new Date(d)
      series.push({
        label: bucket === 'month' ? dt.toLocaleDateString([], { month: 'short', year: '2-digit' }) : dt.toLocaleDateString([], { month: 'numeric', day: 'numeric' }),
        hint: bucket === 'day' ? dt.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : bucket === 'week' ? `Week of ${dt.toLocaleDateString([], { month: 'short', day: 'numeric' })}` : dt.toLocaleDateString([], { month: 'long', year: 'numeric' }),
        value: counts.get(k) ?? 0,
      })
    }

    const byType = LEAD_TYPES.map((t) => {
      const ls = real.filter((l) => l.lead_type === t)
      return {
        type: t,
        received: ls.length,
        texted: ls.filter((l) => l.welcome_sms_status === 'sent').length,
        replied: ls.filter((l) => l.last_inbound_at).length,
        tapped: ls.filter((l) => l.call_link_clicked_at).length,
        quoted: ls.filter((l) => l.status === 'quoted').length,
        sold: ls.filter((l) => l.status === 'sold').length,
        lost: ls.filter((l) => l.status === 'lost').length,
        optedOut: ls.filter((l) => l.sms_opted_out).length,
      }
    })

    // Follow-up texts: sent, and how many leads replied within 2 days of one
    const inboundByLead = new Map<string, number[]>()
    for (const m of sms) if (m.direction === 'in' && m.lead_id) inboundByLead.set(m.lead_id, [...(inboundByLead.get(m.lead_id) ?? []), new Date(m.created_at).getTime()])
    const followups = steps.map((s) => {
      const ss = sends.filter((x) => x.step_id === s.id)
      const sentRows = ss.filter((x) => x.status === 'sent')
      const repliedAfter = sentRows.filter((x) => (inboundByLead.get(x.lead_id) ?? []).some((t) => t >= new Date(x.sent_at).getTime() && t - new Date(x.sent_at).getTime() <= 2 * 86400000)).length
      return { step: s, sent: sentRows.length, skipped: ss.filter((x) => x.status === 'skipped').length, failed: ss.filter((x) => x.status === 'failed').length, repliedAfter }
    })

    const sources = new Map<string, number>()
    for (const l of leads) sources.set(l.source, (sources.get(l.source) ?? 0) + 1)

    return {
      real, texted, replied, sold, quotedOrSold, tapped, series, bucket, byType, followups,
      welcomeMedian: median(welcomeDelays),
      textsSent: outOk.length,
      textsReceived: sms.filter((m) => m.direction === 'in').length,
      textsFailed: sms.filter((m) => m.status === 'failed').length,
      byKind: [
        { label: 'Welcome', value: outOk.filter((m) => m.sender === 'welcome').length },
        { label: 'Follow-up', value: outOk.filter((m) => m.sender === 'followup').length },
        { label: 'AI assistant', value: outOk.filter((m) => m.sender === 'bot').length },
        { label: 'Staff', value: outOk.filter((m) => m.sender === 'agent').length },
        { label: 'Automatic', value: outOk.filter((m) => m.sender === 'system').length },
      ],
      status: LEAD_STATUSES.map((s) => ({ label: s.label, value: real.filter((l) => l.status === s.value).length })),
      sources: [...sources.entries()].map(([k, v]) => ({ label: k === 'smartfinancial' ? 'SmartFinancial' : k === 'manual' ? 'Added by hand' : k === 'test' ? 'Test leads' : k, value: v })),
      optOuts: events.filter((e) => e.type === 'opted_out').length,
      handoffs: events.filter((e) => e.type === 'assistant_paused' && e.actor === 'system').length,
      deleted: events.filter((e) => e.type === 'lead_deleted').length,
      notes: events.filter((e) => e.type === 'note_added').length,
      statusChanges: events.filter((e) => e.type === 'status_changed').length,
      emailsFailed: events.filter((e) => e.type === 'email_failed').length,
    }
  }, [data, range])

  const events = useMemo(() => (data?.events ?? []).filter((e) => eventType === 'all' || e.type === eventType), [data, eventType])

  function exportLeads() {
    if (!r) return
    downloadCsv(`leads-${range.from ?? 'all'}-to-${range.to ?? 'now'}.csv`,
      ['Received', 'Type', 'Status', 'First name', 'Last name', 'Business', 'Phone', 'Email', 'Address', 'Current carrier', 'Policy expires', 'Follow-up date', 'Welcome text', 'Replied', 'Tapped call link', 'Opted out', 'Latest note', 'Source', 'All details'],
      r.real.map((l) => [new Date(l.created_at).toLocaleString(), LEAD_TYPE_LABELS[l.lead_type], l.status, l.first_name, l.last_name, l.business_name, l.phone, l.email, formatAddress(l), l.current_carrier, l.policy_expires, l.follow_up_date, l.welcome_sms_status, l.last_inbound_at ? 'Yes' : 'No', l.call_link_clicked_at ? 'Yes' : 'No', l.sms_opted_out ? 'Yes' : 'No', l.notes, l.source, leadSummaryLines(l).filter(Boolean).join(' | ')]))
  }
  function exportEvents() {
    downloadCsv(`activity-${range.from ?? 'all'}-to-${range.to ?? 'now'}.csv`, ['When', 'Lead', 'Lead type', 'What happened', 'By'], events.map((e) => [new Date(e.created_at).toLocaleString(), e.lead_name, e.lead_type ? LEAD_TYPE_LABELS[e.lead_type as keyof typeof LEAD_TYPE_LABELS] : '', describeEvent(e), actorLabel(e.actor)]))
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="h1 mr-auto">Reports</h1>
        <DateRange value={range} onChange={setRange} />
        <button className="btn-secondary" disabled={!r?.real.length} onClick={exportLeads}>Download leads</button>
      </div>
      {error && <p className="text-sm text-crimson">{error}</p>}
      {!r ? !error && <p className="text-muted">Loading...</p> : (
        <>
          <p className="text-xs text-muted">Leads received in these dates (test leads left out), and their status now. Texts and activity happened in these dates.</p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile label="Leads received" value={r.real.length} sub={`${r.texted.length} got the welcome text`} />
            <Tile label="Replied by text" value={pct(r.replied.length, r.texted.length)} sub={`${r.replied.length} of ${r.texted.length} texted`} />
            <Tile label="Quoted or sold" value={r.quotedOrSold.length} sub={pct(r.quotedOrSold.length, r.real.length) + ' of leads'} />
            <Tile label="Sold" value={r.sold.length} sub={`Close rate ${pct(r.sold.length, r.real.length)}`} />
            <Tile label="Texts sent" value={r.textsSent} sub={r.textsFailed ? `${r.textsFailed} failed` : 'none failed'} />
            <Tile label="Texts received" value={r.textsReceived} />
            <Tile label="Welcome text speed" value={r.welcomeMedian === null ? '-' : duration(r.welcomeMedian)} sub="typical time from lead to text" />
            <Tile label="Tapped call link" value={r.tapped.length} sub={pct(r.tapped.length, r.texted.length) + ' of texted leads'} />
          </div>

          <section className="card p-4">
            <h2 className="h2 mb-3">Leads received per {r.bucket}</h2>
            <ColumnChart points={r.series} />
          </section>

          <section className="card p-4">
            <h2 className="h2 mb-3">By lead type</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>{['Type', 'Received', 'Texted', 'Replied', 'Tapped call', 'Quoted', 'Sold', 'Lost', 'Opted out', 'Close rate'].map((h) => <th key={h} className="py-2 pr-4 font-medium whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody className="tabular-nums">
                  {r.byType.map((t) => (
                    <tr key={t.type} className="border-t border-line">
                      <td className="py-2 pr-4"><Link className="font-semibold text-navy hover:underline" href={`/leads?type=${t.type}`}>{LEAD_TYPE_LABELS[t.type]}</Link></td>
                      <td className="py-2 pr-4 font-semibold">{t.received}</td>
                      <td className="py-2 pr-4">{t.texted}</td>
                      <td className="py-2 pr-4">{t.replied} <span className="text-muted">{pct(t.replied, t.texted)}</span></td>
                      <td className="py-2 pr-4">{t.tapped}</td>
                      <td className="py-2 pr-4">{t.quoted}</td>
                      <td className="py-2 pr-4 text-success font-semibold">{t.sold}</td>
                      <td className="py-2 pr-4">{t.lost}</td>
                      <td className="py-2 pr-4">{t.optedOut}</td>
                      <td className="py-2 pr-4 font-semibold">{pct(t.sold, t.received)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4"><BarList items={r.byType.map((t) => ({ label: LEAD_TYPE_LABELS[t.type], value: t.received }))} total={r.real.length} /></div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <section className="card p-4">
              <h2 className="h2 mb-3">Where leads are now</h2>
              <BarList items={r.status} total={r.real.length} />
            </section>
            <section className="card p-4">
              <h2 className="h2 mb-1">Texts sent, by kind</h2>
              <p className="text-xs text-muted mb-3"><Link href="/texts" className="text-navy hover:underline">See every text in the Text Log →</Link></p>
              <BarList items={r.byKind} total={r.textsSent} />
            </section>
          </div>

          <section className="card p-4">
            <h2 className="h2 mb-3">Follow-up texts</h2>
            {r.followups.length === 0 ? <p className="text-sm text-muted">No follow-up texts set up.</p> : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>{['Follow-up', 'Sent', 'Replied within 2 days', 'Skipped', 'Failed'].map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}</tr>
                </thead>
                <tbody className="tabular-nums">
                  {r.followups.map((f) => (
                    <tr key={f.step.id} className="border-t border-line">
                      <td className="py-2 pr-4">{f.step.name || `Day ${f.step.delay_days}`}</td>
                      <td className="py-2 pr-4 font-semibold">{f.sent}</td>
                      <td className="py-2 pr-4">{f.repliedAfter} <span className="text-muted">{pct(f.repliedAfter, f.sent)}</span></td>
                      <td className="py-2 pr-4 text-muted">{f.skipped}</td>
                      <td className={`py-2 pr-4 ${f.failed ? 'text-crimson' : 'text-muted'}`}>{f.failed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile label="Handed to you by the assistant" value={r.handoffs} />
            <Tile label="Opted out of texts" value={r.optOuts} />
            <Tile label="Notes added" value={r.notes} />
            <Tile label="Status changes" value={r.statusChanges} />
            <Tile label="Leads deleted" value={r.deleted} />
            <Tile label="Lead emails that failed" value={r.emailsFailed} />
          </div>

          <section className="card p-4">
            <h2 className="h2 mb-3">Where leads came from</h2>
            <BarList items={r.sources} />
          </section>

          <section className="card">
            <div className="p-4 flex flex-wrap items-end gap-3">
              <h2 className="h2 mr-auto">Activity log</h2>
              <select className="input w-auto" value={eventType} onChange={(e) => setEventType(e.target.value)}>
                <option value="all">Everything</option>
                {Object.entries(EVENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button className="btn-secondary" disabled={!events.length} onClick={exportEvents}>Download</button>
            </div>
            {events.length === 0 ? <p className="px-4 pb-4 text-sm text-muted">Nothing in these dates.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-canvas text-left text-xs text-muted">
                    <tr>{['When', 'Lead', 'What happened', 'By'].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {events.slice(0, eventLimit).map((e) => (
                      <tr key={e.id} className="border-t border-line align-top">
                        <td className="px-4 py-2 whitespace-nowrap text-muted">{dateTime(e.created_at)}</td>
                        <td className="px-4 py-2 whitespace-nowrap">{e.lead_id ? <Link className="text-navy font-semibold hover:underline" href={`/leads/${e.lead_id}`}>{e.lead_name || '(no name)'}</Link> : <span className="text-muted">{e.lead_name}</span>}</td>
                        <td className="px-4 py-2 break-words">{describeEvent(e)}</td>
                        <td className="px-4 py-2 text-muted whitespace-nowrap">{actorLabel(e.actor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {events.length > eventLimit && <div className="p-3 border-t border-line text-center"><button className="btn-secondary" onClick={() => setEventLimit(eventLimit + 300)}>Show more ({events.length - eventLimit} more)</button></div>}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

