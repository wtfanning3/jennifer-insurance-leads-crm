'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase-browser'
import { dateTime } from '@/lib/format'
import type { InsuranceLead } from '@/lib/fields'
import AiTextArea from './AiTextArea'

interface Msg {
  id: string
  direction: 'in' | 'out'
  sender: 'lead' | 'welcome' | 'followup' | 'bot' | 'agent' | 'system'
  body: string
  status: string | null
  error: string | null
  created_at: string
}

const SENDER_LABEL: Record<Msg['sender'], string> = {
  lead: '',
  welcome: 'Welcome text',
  followup: 'Follow-up text',
  bot: 'AI assistant',
  agent: 'You',
  system: 'Automatic',
}

/** The text-message conversation with one lead, and a box to text them */
export default function Conversation({ lead, onChanged }: { lead: InsuranceLead; onChanged: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const count = useRef(0)

  const load = useCallback(async () => {
    const { data } = await supabase().from('sms_messages').select('*').eq('lead_id', lead.id).order('created_at')
    const list = (data ?? []) as Msg[]
    setMsgs(list)
    if (list.length !== count.current) {
      count.current = list.length
      // Scroll the conversation (not the page) to the newest text
      setTimeout(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight }, 50)
    }
  }, [lead.id])

  useEffect(() => {
    load()
    const t = setInterval(load, 10_000)
    return () => clearInterval(t)
  }, [load])

  async function send() {
    if (!draft.trim()) return
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/leads/${lead.id}/text`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: draft }) })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) setError(data.error || 'Could not send')
    else setDraft('')
    load()
    onChanged()
  }

  const canText = !!lead.phone_e164 && !lead.sms_opted_out

  return (
    <div className="card flex flex-col">
      <div className="px-4 py-3 border-b border-line flex items-center">
        <h3 className="h2">Text messages</h3>
        <span className="ml-auto text-xs text-muted">{lead.phone_e164 ?? 'No textable number'}</span>
      </div>
      <div ref={box} className="flex-1 overflow-y-auto max-h-[520px] min-h-[200px] p-4 space-y-3 bg-canvas">
        {msgs.length === 0 && <p className="text-sm text-muted text-center py-8">No texts yet.</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.direction === 'in' ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${m.direction === 'in' ? 'bg-white border border-line rounded-bl-sm' : m.status === 'failed' ? 'bg-crimson/10 border border-crimson/40 rounded-br-sm' : m.sender === 'bot' ? 'bg-sky text-navy-dark rounded-br-sm' : 'bg-navy text-white rounded-br-sm'}`}>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <p className={`mt-1 text-[11px] ${m.direction === 'in' || m.status === 'failed' || m.sender === 'bot' ? 'text-muted' : 'text-white/70'}`}>
                {SENDER_LABEL[m.sender] && `${SENDER_LABEL[m.sender]} · `}{dateTime(m.created_at)}
                {m.status === 'failed' && <span className="text-crimson font-semibold"> · Not sent: {m.error}</span>}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="p-4 border-t border-line">
        {!canText ? (
          <p className="text-sm text-muted">{lead.sms_opted_out ? 'This lead opted out of texts. Call or email them instead.' : 'This lead has no phone number that can get texts.'}</p>
        ) : (
          <>
            <AiTextArea value={draft} onChange={setDraft} kind="reply" leadId={lead.id} rows={3} placeholder="Type a text to this lead... (you can use {first_name}, {call_link})" showSms />
            {error && <p className="text-sm text-crimson mt-1">{error}</p>}
            <div className="mt-2 flex items-center gap-2">
              <button className="btn-primary" disabled={busy || !draft.trim()} onClick={send}>{busy ? 'Sending...' : 'Send text'}</button>
              {!lead.bot_paused && <span className="text-xs text-muted">The AI assistant answers their replies. Pause it on the right to take over.</span>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
