'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'
import { LEAD_STATUSES, LEAD_TYPE_LABELS, formatAddress, leadName, type InsuranceLead, type LeadStatus } from '@/lib/fields'
import { formatPhone, toE164 } from '@/lib/phone'
import { dateTime, timeAgo } from '@/lib/format'
import LeadFields, { type LeadDraft } from '@/components/LeadFields'
import Conversation from '@/components/Conversation'
import AiTextArea from '@/components/AiTextArea'
import { StatusBadge, TypeBadge } from '@/components/Badges'

const EDITABLE_EXCLUDE = new Set(['id', 'created_at', 'updated_at', 'short_code', 'raw_payload', 'unread_messages', 'last_message_at', 'last_inbound_at'])

export default function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [lead, setLead] = useState<InsuranceLead | null>(null)
  const [draft, setDraft] = useState<LeadDraft | null>(null)
  const [dirty, setDirty] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase().from('leads').select('*').eq('id', id).maybeSingle()
    if (!data) return setNotFound(true)
    setLead(data as InsuranceLead)
    return data as InsuranceLead
  }, [id])

  useEffect(() => {
    load().then((l) => {
      if (!l) return
      setDraft(l as LeadDraft)
      // Opening the lead marks its texts as read
      if (l.unread_messages > 0) supabase().from('leads').update({ unread_messages: 0 }).eq('id', id).then(() => {})
    })
  }, [load, id])

  const edit = (d: LeadDraft) => { setDraft(d); setDirty(true) }

  /** Save some fields right away (status, toggles...) */
  async function patch(fields: Partial<InsuranceLead>, msg = 'Saved') {
    setError(null)
    const { error } = await supabase().from('leads').update(fields).eq('id', id)
    if (error) return setError(error.message)
    setLead((l) => (l ? { ...l, ...fields } : l))
    setDraft((d) => (d ? { ...d, ...fields } : d))
    setNote(msg)
    setTimeout(() => setNote(null), 2000)
  }

  async function saveAll() {
    if (!draft) return
    setSaving(true)
    const fields: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(draft)) if (!EDITABLE_EXCLUDE.has(k)) fields[k] = v === '' ? null : v
    fields.phone_e164 = toE164(draft.phone)
    await patch(fields as Partial<InsuranceLead>, 'Lead saved')
    setSaving(false)
    setDirty(false)
  }

  async function remove() {
    if (!lead) return
    if (!confirm(`Delete ${leadName(lead)} and all their texts? This can't be undone.`)) return
    const { error } = await supabase().from('leads').delete().eq('id', id)
    if (error) return setError(error.message)
    router.push('/leads')
  }

  async function resendWelcome() {
    const res = await fetch(`/api/leads/${id}/text`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'welcome' }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setError(data.error || 'Could not send')
    load()
  }

  if (notFound) return <div className="card p-8 text-center">This lead was not found (it may have been deleted). <Link className="text-navy underline" href="/leads">Back to leads</Link></div>
  if (!lead || !draft) return <p className="text-muted">Loading...</p>

  const welcomeLabel: Record<InsuranceLead['welcome_sms_status'], string> = {
    pending: 'Not sent yet',
    queued: 'Waiting for morning (after hours)',
    sent: `Sent ${dateTime(lead.welcome_sms_at)}`,
    failed: `Failed: ${lead.welcome_sms_error ?? ''}`,
    skipped: `Not sent${lead.welcome_sms_error ? ` (${lead.welcome_sms_error})` : ''}`,
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <Link href="/leads" className="text-sm text-navy hover:underline">← Leads</Link>
          <h1 className="h1 mt-1">{leadName(lead)}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <TypeBadge type={lead.lead_type} />
            <StatusBadge status={lead.status} />
            {lead.business_name && <span>{lead.business_name}</span>}
            <span>· {LEAD_TYPE_LABELS[lead.lead_type]} lead from {lead.source === 'smartfinancial' ? 'SmartFinancial' : lead.source} · {timeAgo(lead.created_at)}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {lead.phone && <a className="text-navy font-semibold hover:underline" href={`tel:${toE164(lead.phone) ?? lead.phone}`}>📞 {formatPhone(lead.phone)}</a>}
            {lead.email && <a className="text-navy hover:underline" href={`mailto:${lead.email}`}>✉️ {lead.email}</a>}
            {formatAddress(lead) && <a className="text-navy hover:underline" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${encodeURIComponent(formatAddress(lead))}`}>📍 {formatAddress(lead)}</a>}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {note && <span className="text-sm text-success">{note}</span>}
          <button className="btn-danger" onClick={remove}>Delete lead</button>
        </div>
      </div>
      {error && <p className="text-sm text-crimson">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Conversation lead={lead} onChanged={load} />
          <LeadFields lead={draft} onChange={edit} />
          <div className="sticky bottom-0 py-3 bg-canvas/90 backdrop-blur flex gap-2">
            <button className="btn-primary" disabled={!dirty || saving} onClick={saveAll}>{saving ? 'Saving...' : dirty ? 'Save changes' : 'All changes saved'}</button>
            {dirty && <button className="btn-secondary" onClick={() => { setDraft(lead as LeadDraft); setDirty(false) }}>Undo changes</button>}
          </div>
        </div>

        <aside className="space-y-5">
          <div className="card p-4 space-y-3">
            <div>
              <label className="label">Status</label>
              <select className="input" value={lead.status} onChange={(e) => patch({ status: e.target.value as LeadStatus })}>
                {LEAD_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Follow-up date</label>
              <div className="flex gap-2">
                <input type="date" className="input" value={lead.follow_up_date ?? ''} onChange={(e) => patch({ follow_up_date: e.target.value || null })} />
                {lead.follow_up_date && <button className="btn-ghost text-xs" onClick={() => patch({ follow_up_date: null })}>Clear</button>}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {[1, 2, 3, 7, 14, 30].map((d) => (
                  <button key={d} className="rounded border border-line px-1.5 py-0.5 text-[11px] text-navy hover:bg-sky-light" onClick={() => {
                    const t = new Date(); t.setDate(t.getDate() + d)
                    patch({ follow_up_date: `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}` })
                  }}>+{d}d</button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Notes</label>
              <NotesBox value={lead.notes ?? ''} onSave={(v) => patch({ notes: v || null }, 'Notes saved')} />
            </div>
          </div>

          <div className="card p-4 space-y-3 text-sm">
            <h3 className="h2">Texting</h3>
            <div>
              <span className="text-muted">Welcome text:</span> {welcomeLabel[lead.welcome_sms_status]}
              {lead.welcome_sms_status !== 'sent' && lead.phone_e164 && !lead.sms_opted_out && (
                <button className="block mt-1 text-navy font-semibold hover:underline" onClick={resendWelcome}>Send welcome text now</button>
              )}
            </div>
            {lead.call_link_clicked_at && <div className="text-success">Tapped the call link {timeAgo(lead.call_link_clicked_at)}</div>}
            <Toggle label="AI assistant answers their texts" checked={!lead.bot_paused} disabled={lead.sms_opted_out} onChange={(on) => patch({ bot_paused: !on }, on ? 'Assistant on' : 'Assistant paused')} />
            <Toggle label="Automatic follow-up texts" checked={!lead.followups_paused} disabled={lead.sms_opted_out} onChange={(on) => patch({ followups_paused: !on })} />
            <Toggle
              label="Opted out of texts"
              danger
              checked={lead.sms_opted_out}
              onChange={(on) => {
                if (!on && !confirm('Only turn texts back on if they asked you to (e.g. replied START). Continue?')) return
                patch({ sms_opted_out: on, sms_opted_out_at: on ? new Date().toISOString() : null })
              }}
            />
            {lead.sms_opted_out_at && <div className="text-xs text-crimson">Opted out {dateTime(lead.sms_opted_out_at)}</div>}
            <div>
              <label className="label">Office number for this lead&apos;s call link</label>
              <input className="input" placeholder="Leave blank to use Settings" defaultValue={lead.call_phone ?? ''} onBlur={(e) => e.target.value !== (lead.call_phone ?? '') && patch({ call_phone: e.target.value || null })} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Toggle({ label, checked, onChange, disabled, danger }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; danger?: boolean }) {
  return (
    <label className={`flex items-center gap-2 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? (danger ? 'bg-crimson' : 'bg-navy') : 'bg-gray-300'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
      <span>{label}</span>
    </label>
  )
}

function NotesBox({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <div>
      <AiTextArea value={v} onChange={setV} rows={4} placeholder="Call notes, what they want, best time to reach..." />
      {v !== value && <button className="btn-primary mt-2 py-1.5" onClick={() => onSave(v)}>Save notes</button>}
    </div>
  )
}
