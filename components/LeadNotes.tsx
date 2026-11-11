'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-browser'
import { dateTime } from '@/lib/format'
import AiTextArea from './AiTextArea'

interface Note { id: string; body: string; author: string | null; created_at: string; updated_at: string }

/** Dated notes on a lead (calls, what they want, best time...) - newest first */
export default function LeadNotes({ leadId, onChanged }: { leadId: string; onChanged?: () => void }) {
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [me, setMe] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase().from('lead_notes').select('*').eq('lead_id', leadId).order('created_at', { ascending: false })
    if (error) setError(error.message)
    setNotes((data ?? []) as Note[])
  }, [leadId])
  useEffect(() => { load(); supabase().auth.getUser().then(({ data }) => setMe(data.user?.email ?? null)) }, [load])

  async function add() {
    if (!draft.trim()) return
    setBusy(true)
    const { error } = await supabase().from('lead_notes').insert({ lead_id: leadId, body: draft.trim(), author: me })
    setBusy(false)
    if (error) return setError(error.message)
    setDraft('')
    load()
    onChanged?.()
  }
  async function saveEdit() {
    if (!editing) return
    const { error } = await supabase().from('lead_notes').update({ body: editing.body.trim() }).eq('id', editing.id)
    if (error) return setError(error.message)
    setEditing(null)
    load()
  }
  async function remove(n: Note) {
    if (!confirm('Delete this note?')) return
    await supabase().from('lead_notes').delete().eq('id', n.id)
    load()
  }

  return (
    <div className="card">
      <div className="px-4 py-3 border-b border-line flex items-center">
        <h3 className="h2">Notes</h3>
        {notes && <span className="ml-2 text-xs text-muted">{notes.length}</span>}
      </div>
      <div className="p-4 space-y-3">
        <AiTextArea value={draft} onChange={setDraft} rows={3} placeholder="Add a note: call summary, what they want, best time to reach, quotes given..." />
        <button className="btn-primary" disabled={busy || !draft.trim()} onClick={add}>{busy ? 'Saving...' : 'Add note'}</button>
        {error && <p className="text-sm text-crimson">{error}</p>}
        {notes && notes.length === 0 && <p className="text-sm text-muted">No notes yet.</p>}
        <ul className="space-y-3">
          {(notes ?? []).map((n) => (
            <li key={n.id} className="rounded-lg border border-line bg-canvas p-3">
              <div className="flex items-center gap-2 text-xs text-muted mb-1">
                <span>{dateTime(n.created_at)}</span>
                {n.author && <span>· {n.author}</span>}
                {n.updated_at && new Date(n.updated_at).getTime() - new Date(n.created_at).getTime() > 60_000 && <span>· edited</span>}
                <span className="ml-auto flex gap-3">
                  <button className="text-navy hover:underline" onClick={() => setEditing({ id: n.id, body: n.body })}>Edit</button>
                  <button className="text-crimson hover:underline" onClick={() => remove(n)}>Delete</button>
                </span>
              </div>
              {editing?.id === n.id ? (
                <div className="space-y-2">
                  <textarea className="input" rows={3} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
                  <div className="flex gap-2">
                    <button className="btn-primary py-1.5" onClick={saveEdit}>Save</button>
                    <button className="btn-ghost py-1.5" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap">{n.body}</p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
