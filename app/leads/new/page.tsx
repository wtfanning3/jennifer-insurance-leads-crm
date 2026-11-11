'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'
import { LEAD_TYPES, LEAD_TYPE_LABELS, type LeadType } from '@/lib/fields'
import { toE164 } from '@/lib/phone'
import LeadFields, { type LeadDraft } from '@/components/LeadFields'

// Add a lead by hand (a phone call, a referral, a lead from somewhere else)
export default function NewLeadPage() {
  const router = useRouter()
  const [lead, setLead] = useState<LeadDraft>({ lead_type: 'auto', details: {} })
  const [followUp, setFollowUp] = useState('')
  const [notes, setNotes] = useState('')
  const [sendWelcome, setSendWelcome] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!lead.first_name?.trim() && !lead.last_name?.trim() && !lead.business_name?.trim()) return setError('Add a name first.')
    setBusy(true)
    setError(null)
    const record = {
      ...lead,
      phone_e164: toE164(lead.phone),
      follow_up_date: followUp || null,
      notes: notes || null,
      source: 'manual',
      welcome_sms_status: 'skipped',
    }
    const { data, error } = await supabase().from('leads').insert(record).select('id').single()
    if (error || !data) {
      setBusy(false)
      return setError(error?.message ?? 'Could not save')
    }
    if (sendWelcome) {
      const res = await fetch(`/api/leads/${data.id}/text`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'welcome' }) })
      if (!res.ok) alert(`The lead was saved, but the welcome text was not sent: ${(await res.json()).error}`)
    }
    router.push(`/leads/${data.id}`)
  }

  return (
    <div className="space-y-5">
      <h1 className="h1">Add a lead</h1>
      <div className="card p-4 sm:p-5">
        <label className="label">Lead type</label>
        <div className="flex flex-wrap gap-2">
          {LEAD_TYPES.map((t: LeadType) => (
            <button key={t} type="button" onClick={() => setLead({ ...lead, lead_type: t })} className={`rounded-full px-4 py-1.5 text-sm font-medium border ${lead.lead_type === t ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-line hover:bg-sky-light'}`}>
              {LEAD_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>
      <LeadFields lead={lead} onChange={setLead} />
      <div className="card p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="label">Follow-up date</label>
          <input type="date" className="input" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Notes</label>
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <label className="sm:col-span-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={sendWelcome} onChange={(e) => setSendWelcome(e.target.checked)} />
          Send the welcome text now (only if they agreed to get texts from you)
        </label>
      </div>
      {error && <p className="text-crimson text-sm">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Save lead'}</button>
        <button className="btn-secondary" onClick={() => router.back()}>Cancel</button>
      </div>
    </div>
  )
}
