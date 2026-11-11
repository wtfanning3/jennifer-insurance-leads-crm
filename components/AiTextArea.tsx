'use client'

import { useState } from 'react'
import { smsSegments, TEMPLATE_TAGS } from '@/lib/templates'

type Kind = 'template' | 'reply' | 'notes' | 'general'

const QUICK: { label: string; instruction: string }[] = [
  { label: 'Improve', instruction: 'Improve it: clearer, friendlier, fix spelling and grammar.' },
  { label: 'Shorter', instruction: 'Make it shorter - one text message (under 160 characters) if possible, keeping the meaning.' },
  { label: 'Friendlier', instruction: 'Make it warmer and more personal.' },
  { label: 'More professional', instruction: 'Make it more professional.' },
  { label: 'Fix spelling', instruction: 'Only fix spelling, grammar and punctuation. Change nothing else.' },
]

/**
 * A text box with AI help: "Tell AI" what you want (or pick Improve /
 * Shorter / ...), see the suggestion, then Use it or try again. Undo puts the
 * old text back. "Open in" copies a ready-made prompt for ChatGPT / Claude.
 */
export default function AiTextArea({
  value,
  onChange,
  kind = 'general',
  leadId,
  leadType,
  rows = 4,
  placeholder,
  showSms = false,
  showTags = false,
  id,
}: {
  value: string
  onChange: (v: string) => void
  kind?: Kind
  leadId?: string
  leadType?: string
  rows?: number
  placeholder?: string
  showSms?: boolean
  showTags?: boolean
  id?: string
}) {
  const [open, setOpen] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [undo, setUndo] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function ask(instr: string) {
    setBusy(true)
    setError(null)
    setSuggestion(null)
    try {
      const res = await fetch('/api/ai/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: value, instruction: instr, kind, leadId, leadType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'The AI could not help with that.')
      setSuggestion(data.text)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function use() {
    if (suggestion === null) return
    setUndo(value)
    onChange(suggestion)
    setSuggestion(null)
  }

  async function openIn(where: 'chatgpt' | 'claude') {
    const prompt = [
      kind === 'template' || kind === 'reply' ? 'Help me write a short text message (SMS) to an insurance lead.' : 'Help me write this.',
      kind === 'template' ? `Keep these tags as-is where used: ${TEMPLATE_TAGS.map((t) => t.tag).join(' ')}` : '',
      instruction ? `What I want: ${instruction}` : '',
      value ? `Current text:\n${value}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {}
    const url = where === 'chatgpt' ? `https://chatgpt.com/?q=${encodeURIComponent(prompt)}` : `https://claude.ai/new?q=${encodeURIComponent(prompt)}`
    window.open(url, '_blank', 'noopener')
  }

  const seg = showSms ? smsSegments(value) : null

  return (
    <div>
      <textarea id={id} className="input font-[inherit]" rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <button type="button" className="font-semibold text-navy hover:underline" onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide AI help' : '✨ AI help'}
        </button>
        {undo !== null && (
          <button type="button" className="text-navy hover:underline" onClick={() => { onChange(undo); setUndo(null) }}>
            Undo AI change
          </button>
        )}
        {seg && seg.chars > 0 && (
          <span className={`ml-auto ${seg.segments > 3 ? 'text-crimson' : 'text-muted'}`} title="Long texts are sent as several parts; each part is billed">
            {seg.chars} characters · {seg.segments} text{seg.segments === 1 ? '' : 's'}{seg.unicode ? ' (has emoji/special characters)' : ''}
          </span>
        )}
      </div>
      {showTags && (
        <div className="mt-1 flex flex-wrap gap-1">
          {TEMPLATE_TAGS.map((t) => (
            <button key={t.tag} type="button" title={t.meaning} className="rounded bg-sky-light px-1.5 py-0.5 text-[11px] text-navy hover:bg-sky" onClick={() => onChange(`${value}${value && !value.endsWith(' ') ? ' ' : ''}${t.tag}`)}>
              {t.tag}
            </button>
          ))}
        </div>
      )}
      {open && (
        <div className="mt-2 rounded-lg border border-sky bg-sky-light/50 p-3 space-y-2">
          <div className="flex gap-2">
            <input
              className="input"
              placeholder={value ? 'Tell AI what to change (e.g. "mention we can bundle home and auto")' : 'Tell AI what to write'}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ask(instruction) } }}
            />
            <button type="button" className="btn-primary shrink-0" disabled={busy} onClick={() => ask(instruction)}>
              {busy ? 'Writing...' : value ? 'Tell AI' : 'Write it'}
            </button>
          </div>
          {value && (
            <div className="flex flex-wrap gap-1.5">
              {QUICK.map((q) => (
                <button key={q.label} type="button" disabled={busy} className="rounded-full border border-line bg-white px-2.5 py-1 text-xs text-navy hover:bg-sky-light" onClick={() => ask(q.instruction)}>
                  {q.label}
                </button>
              ))}
            </div>
          )}
          {error && <p className="text-xs text-crimson">{error}</p>}
          {suggestion !== null && (
            <div className="rounded-md border border-line bg-white p-3">
              <p className="whitespace-pre-wrap text-sm">{suggestion}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" className="btn-primary py-1.5" onClick={use}>Use this</button>
                <button type="button" className="btn-secondary py-1.5" disabled={busy} onClick={() => ask(instruction)}>Try again</button>
                <button type="button" className="btn-ghost py-1.5" onClick={() => setSuggestion(null)}>Discard</button>
              </div>
            </div>
          )}
          <div className="text-[11px] text-muted">
            Or open in{' '}
            <button type="button" className="text-navy hover:underline" onClick={() => openIn('chatgpt')}>ChatGPT</button>{' / '}
            <button type="button" className="text-navy hover:underline" onClick={() => openIn('claude')}>Claude</button>
            {copied && <span className="ml-2 text-success">Prompt copied - paste it if it doesn&apos;t appear</span>}
          </div>
        </div>
      )}
    </div>
  )
}
