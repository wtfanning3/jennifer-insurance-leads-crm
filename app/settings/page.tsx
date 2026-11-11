'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'
import { refreshBrand } from '@/lib/use-brand'
import { LEAD_TYPES, LEAD_TYPE_LABELS, type LeadType } from '@/lib/fields'
import { formatPhone, toE164 } from '@/lib/phone'
import { DEFAULT_WELCOME_TEMPLATE, fillTemplate } from '@/lib/templates'
import AiTextArea from '@/components/AiTextArea'

interface SettingsRow {
  agency_name: string | null
  agent_name: string | null
  license_number: string | null
  office_phone: string | null
  office_email: string | null
  office_address: string | null
  website_url: string | null
  office_hours: string | null
  logo_url: string | null
  icon_url: string | null
  office_phone_by_type: Partial<Record<LeadType, string>>
  notify_emails: string | null
  notify_on_reply: boolean
  welcome_enabled: boolean
  welcome_templates: Partial<Record<LeadType, string>>
  followups_enabled: boolean
  bot_enabled: boolean
  bot_instructions: string | null
  quiet_start_hour: number
  quiet_end_hour: number
  time_zone: string
}

interface Step {
  id?: string
  position: number
  name: string | null
  delay_days: number
  send_hour: number
  lead_types: LeadType[]
  body: string
  enabled: boolean
  stop_if_replied: boolean
  stop_if_status: string[]
}

const TABS = [
  { key: 'agency', label: 'Agency & logos' },
  { key: 'emails', label: 'Lead emails' },
  { key: 'welcome', label: 'Welcome text' },
  { key: 'followups', label: 'Follow-up texts' },
  { key: 'bot', label: 'AI assistant' },
  { key: 'hours', label: 'Texting hours' },
  { key: 'connections', label: 'Connections & testing' },
  { key: 'account', label: 'Account' },
] as const
type Tab = (typeof TABS)[number]['key']

const TIME_ZONES = ['America/Denver', 'America/Phoenix', 'America/Chicago', 'America/New_York', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu']

const hourLabel = (h: number) => (h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`)

function SettingsInner() {
  const params = useSearchParams()
  const router = useRouter()
  const tab = (params?.get('tab') as Tab) || 'agency'
  const [s, setS] = useState<SettingsRow | null>(null)
  const [saved, setSaved] = useState<SettingsRow | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase().from('settings').select('*').eq('id', 1).maybeSingle().then(({ data, error }) => {
      if (error) setMsg({ ok: false, text: `Could not load settings: ${error.message}. Has the database setup (supabase/migrations/0001_init.sql) been run?` })
      const row = { office_phone_by_type: {}, welcome_templates: {}, ...(data ?? {}) } as SettingsRow
      setS(row)
      setSaved(row)
    })
  }, [])

  const dirty = JSON.stringify(s) !== JSON.stringify(saved)
  const set = <K extends keyof SettingsRow>(k: K, v: SettingsRow[K]) => setS((p) => (p ? { ...p, [k]: v } : p))

  const save = useCallback(async (override?: Partial<SettingsRow>) => {
    if (!s) return
    setBusy(true)
    const row = { ...s, ...override, id: 1, updated_at: new Date().toISOString() }
    const { error } = await supabase().from('settings').upsert(row)
    setBusy(false)
    if (error) return setMsg({ ok: false, text: error.message })
    setS(row)
    setSaved(row)
    refreshBrand()
    setMsg({ ok: true, text: 'Settings saved' })
    setTimeout(() => setMsg(null), 2500)
  }, [s])

  if (!s) return <p className="text-muted">Loading settings...</p>

  return (
    <div>
      <h1 className="h1 mb-4">Settings</h1>
      <div className="flex flex-wrap gap-1 mb-5 border-b border-line">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => router.replace(`/settings?tab=${t.key}`)} className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.key ? 'border-navy text-navy' : 'border-transparent text-muted hover:text-navy'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'agency' && <AgencyTab s={s} set={set} save={save} />}
      {tab === 'emails' && (
        <Section title="Who gets the lead emails" hint="Every new lead is emailed to each address here (one per line, or separated by commas). Replies from leads are emailed too, if turned on below.">
          <textarea className="input" rows={4} value={s.notify_emails ?? ''} onChange={(e) => set('notify_emails', e.target.value)} placeholder={'jennifer@example.com\noffice@example.com'} />
          <Check label="Also email when a lead texts back (with what the assistant replied)" checked={s.notify_on_reply} onChange={(v) => set('notify_on_reply', v)} />
        </Section>
      )}
      {tab === 'welcome' && <WelcomeTab s={s} set={set} />}
      {tab === 'followups' && <FollowupsTab s={s} set={set} save={save} />}
      {tab === 'bot' && (
        <Section title="AI texting assistant" hint="When a lead texts back, the assistant answers right away: friendly, short, never quotes prices, and steers them to a call with you. When they're ready to buy, upset, or ask something it shouldn't answer, it stops and emails you to take over.">
          <Check label="Turn on the AI assistant" checked={s.bot_enabled} onChange={(v) => set('bot_enabled', v)} />
          <div>
            <label className="label">What the assistant should know or do (optional)</label>
            <AiTextArea
              kind="notes"
              rows={8}
              value={s.bot_instructions ?? ''}
              onChange={(v) => set('bot_instructions', v)}
              placeholder={'Examples:\nWe can bundle home and auto for a discount.\nWe write auto, home, renters, umbrella and small business policies in Colorado.\nJennifer usually calls back within one business hour.\nIf they ask about life insurance, say Jennifer can help with that on a call.'}
            />
          </div>
        </Section>
      )}
      {tab === 'hours' && (
        <Section title="When texts can go out" hint="Welcome and follow-up texts wait for these hours (a lead that comes in at 11 PM gets the welcome text in the morning). The assistant still answers right away when a lead texts first. Some states (such as Florida and Oklahoma) only allow texts from 8 AM to 8 PM.">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Start texting at</label>
              <select className="input" value={s.quiet_end_hour} onChange={(e) => set('quiet_end_hour', Number(e.target.value))}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Stop texting at</label>
              <select className="input" value={s.quiet_start_hour} onChange={(e) => set('quiet_start_hour', Number(e.target.value))}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Time zone</label>
              <select className="input" value={s.time_zone} onChange={(e) => set('time_zone', e.target.value)}>
                {[...new Set([s.time_zone, ...TIME_ZONES])].map((z) => <option key={z} value={z}>{z.replace('America/', '').replace('_', ' ')}</option>)}
              </select>
            </div>
          </div>
        </Section>
      )}
      {tab === 'connections' && <ConnectionsTab />}
      {tab === 'account' && <AccountTab />}

      {!['connections', 'account', 'followups'].includes(tab) && (
        <div className="sticky bottom-0 mt-5 py-3 bg-canvas/90 backdrop-blur flex items-center gap-3">
          <button className="btn-primary" disabled={!dirty || busy} onClick={() => save()}>{busy ? 'Saving...' : dirty ? 'Save settings' : 'Saved'}</button>
          {dirty && <button className="btn-secondary" onClick={() => setS(saved)}>Undo changes</button>}
          {msg && <span className={`text-sm ${msg.ok ? 'text-success' : 'text-crimson'}`}>{msg.text}</span>}
        </div>
      )}
      {['followups'].includes(tab) && msg && <p className={`mt-3 text-sm ${msg.ok ? 'text-success' : 'text-crimson'}`}>{msg.text}</p>}
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card p-4 sm:p-5 space-y-3 mb-5">
      <div>
        <h2 className="h2">{title}</h2>
        {hint && <p className="text-sm text-muted mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  )
}

function Input({ label, value, onChange, placeholder, wide }: { label: string; value: string | null; onChange: (v: string) => void; placeholder?: string; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <label className="label">{label}</label>
      <input className="input" value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

// ------------------------------------------------------------------ Agency & logos
function AgencyTab({ s, set, save }: { s: SettingsRow; set: <K extends keyof SettingsRow>(k: K, v: SettingsRow[K]) => void; save: (o?: Partial<SettingsRow>) => Promise<void> }) {
  return (
    <>
      <Section title="Agency" hint="Shown in the CRM, in emails, on the call/unsubscribe pages, and available to texts as {agency_name} and {agent_name}.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Agency name" value={s.agency_name} onChange={(v) => set('agency_name', v)} wide />
          <Input label="Agent name (as used in texts)" value={s.agent_name} onChange={(v) => set('agent_name', v)} placeholder="Jennifer" />
          <Input label="License number" value={s.license_number} onChange={(v) => set('license_number', v)} />
          <Input label="Office email" value={s.office_email} onChange={(v) => set('office_email', v)} />
          <Input label="Office address" value={s.office_address} onChange={(v) => set('office_address', v)} />
          <Input label="Website" value={s.website_url} onChange={(v) => set('website_url', v)} wide />
          <Input label="Office hours" value={s.office_hours} onChange={(v) => set('office_hours', v)} placeholder="Mon-Fri 9 AM - 5 PM" wide />
        </div>
      </Section>
      <Section title="Office phone (the &quot;tap to call&quot; link)" hint="The link in texts rings this number. You can use a different number for each kind of lead, and change it for a single lead on its page.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Input label="Main office number" value={s.office_phone} onChange={(v) => set('office_phone', v)} placeholder="(970) 555-1234" />
            {s.office_phone && !toE164(s.office_phone) && <p className="text-xs text-crimson mt-1">That doesn&apos;t look like a 10-digit phone number.</p>}
          </div>
          <div />
          {LEAD_TYPES.map((t) => (
            <Input key={t} label={`${LEAD_TYPE_LABELS[t]} leads (optional)`} value={s.office_phone_by_type?.[t] ?? ''} placeholder={s.office_phone ? `Same as main: ${formatPhone(s.office_phone)}` : 'Same as main'} onChange={(v) => set('office_phone_by_type', { ...s.office_phone_by_type, [t]: v })} />
          ))}
        </div>
      </Section>
      <Section title="Logos" hint="The large logo is used on the sign-in page, emails and the pages leads see. The small logo is used in the top bar and as the browser icon area. PNG with a transparent background looks best.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <LogoPicker label="Large logo" url={s.logo_url} fallback="/brand/logo-full.png" onSaved={(url) => save({ logo_url: url })} name="logo" />
          <LogoPicker label="Small logo" url={s.icon_url} fallback="/brand/logo-icon.png" onSaved={(url) => save({ icon_url: url })} name="icon" />
        </div>
      </Section>
    </>
  )
}

function LogoPicker({ label, url, fallback, onSaved, name }: { label: string; url: string | null; fallback: string; onSaved: (url: string | null) => void; name: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function upload(file: File) {
    if (!file.type.startsWith('image/')) return setError('Please choose an image file.')
    if (file.size > 5 * 1024 * 1024) return setError('Please use an image under 5 MB.')
    setBusy(true)
    setError(null)
    const ext = (file.name.split('.').pop() || 'png').toLowerCase()
    const path = `${name}-${Date.now()}.${ext}`
    const { error } = await supabase().storage.from('branding').upload(path, file, { contentType: file.type, upsert: true })
    setBusy(false)
    if (error) return setError(error.message)
    onSaved(supabase().storage.from('branding').getPublicUrl(path).data.publicUrl)
  }
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="label">{label}</div>
      <div className="h-28 flex items-center justify-center bg-canvas rounded mb-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url || fallback} alt="" className="max-h-24 max-w-full" />
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <label className="btn-secondary cursor-pointer">
          {busy ? 'Uploading...' : 'Upload new'}
          <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        {url && <button className="btn-ghost text-xs" onClick={() => onSaved(null)}>Use original logo</button>}
      </div>
      {error && <p className="text-xs text-crimson mt-1">{error}</p>}
    </div>
  )
}

// ------------------------------------------------------------------ Welcome text
function preview(template: string, s: SettingsRow, type: LeadType) {
  return fillTemplate(template, {
    first_name: 'Susan',
    last_name: 'Gill',
    business_name: 'Cornerstone Construction',
    lead_type: LEAD_TYPE_LABELS[type].toLowerCase(),
    agent_name: s.agent_name || 'your agent',
    agency_name: s.agency_name || 'our agency',
    office_phone: formatPhone(s.office_phone_by_type?.[type] || s.office_phone || '(970) 555-1234'),
    call_link: `${typeof window !== 'undefined' ? window.location.origin : ''}/i/c/abc123`,
    stop_link: `${typeof window !== 'undefined' ? window.location.origin : ''}/i/s/abc123`,
    website: s.website_url || '',
  })
}

function WelcomeTab({ s, set }: { s: SettingsRow; set: <K extends keyof SettingsRow>(k: K, v: SettingsRow[K]) => void }) {
  const [type, setType] = useState<LeadType>('auto')
  const custom = s.welcome_templates?.[type] ?? ''
  const used = custom.trim() || DEFAULT_WELCOME_TEMPLATE
  return (
    <Section title="Welcome text" hint="The first text every new lead gets, right when the lead comes in (or at the start of texting hours). Each kind of lead can have its own wording. The {tags} are filled in for each lead. It must say how to opt out; if it doesn't, “Reply STOP to opt out.” is added.">
      <Check label="Send a welcome text to every new lead" checked={s.welcome_enabled} onChange={(v) => set('welcome_enabled', v)} />
      <div className="flex flex-wrap gap-2">
        {LEAD_TYPES.map((t) => (
          <button key={t} onClick={() => setType(t)} className={`rounded-full px-3 py-1.5 text-sm font-medium border ${type === t ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-line hover:bg-sky-light'}`}>
            {LEAD_TYPE_LABELS[t]}{s.welcome_templates?.[t]?.trim() ? ' ✓' : ''}
          </button>
        ))}
      </div>
      <div>
        <label className="label">{LEAD_TYPE_LABELS[type]} leads - welcome text {custom.trim() ? '' : '(blank = the standard wording below)'}</label>
        <AiTextArea kind="template" leadType={LEAD_TYPE_LABELS[type]} rows={5} value={custom} placeholder={DEFAULT_WELCOME_TEMPLATE} onChange={(v) => set('welcome_templates', { ...s.welcome_templates, [type]: v })} showSms showTags />
        <div className="mt-2 flex gap-3 text-xs">
          {!custom.trim() && <button className="text-navy hover:underline" onClick={() => set('welcome_templates', { ...s.welcome_templates, [type]: DEFAULT_WELCOME_TEMPLATE })}>Start from the standard wording</button>}
          {custom.trim() && <button className="text-navy hover:underline" onClick={() => set('welcome_templates', { ...s.welcome_templates, [type]: '' })}>Go back to the standard wording</button>}
          {custom.trim() && LEAD_TYPES.filter((t) => t !== type).length > 0 && (
            <button className="text-navy hover:underline" onClick={() => set('welcome_templates', Object.fromEntries(LEAD_TYPES.map((t) => [t, custom])) as SettingsRow['welcome_templates'])}>Use this wording for all lead types</button>
          )}
        </div>
      </div>
      <Preview text={preview(used, s, type)} />
    </Section>
  )
}

function Preview({ text }: { text: string }) {
  return (
    <div>
      <div className="label">Preview (sample lead)</div>
      <div className="max-w-sm rounded-2xl rounded-bl-sm bg-gray-100 px-3.5 py-2 text-sm whitespace-pre-wrap">{text}</div>
    </div>
  )
}

// ------------------------------------------------------------------ Follow-up texts
function FollowupsTab({ s, set, save }: { s: SettingsRow; set: <K extends keyof SettingsRow>(k: K, v: SettingsRow[K]) => void; save: (o?: Partial<SettingsRow>) => Promise<void> }) {
  const [steps, setSteps] = useState<Step[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => supabase().from('followup_steps').select('*').order('delay_days').order('position').then(({ data, error }) => { if (error) setError(error.message); setSteps((data ?? []) as Step[]) }), [])
  useEffect(() => { load() }, [load])

  return (
    <>
      <Section title="Follow-up texts" hint="Automatic texts after the welcome text, on the days you choose - until the lead replies, is marked Quoted/Sold/Lost, or opts out. Each lead gets at most one text a day, and never within 18 hours of another text. You can pause follow-ups for a single lead on its page.">
        <Check label="Send follow-up texts" checked={s.followups_enabled} onChange={(v) => { set('followups_enabled', v); save({ followups_enabled: v }) }} />
      </Section>
      {error && <p className="text-sm text-crimson mb-3">{error}</p>}
      {!steps ? <p className="text-muted">Loading...</p> : (
        <div className="space-y-4">
          {steps.map((st) => <StepEditor key={st.id} step={st} s={s} onChanged={load} />)}
          <button
            className="btn-secondary"
            onClick={async () => {
              const last = steps[steps.length - 1]
              const { error } = await supabase().from('followup_steps').insert({ position: steps.length + 1, name: `Day ${(last?.delay_days ?? 0) + 7} follow-up`, delay_days: (last?.delay_days ?? 0) + 7, send_hour: 10, body: 'Hi {first_name}, {agent_name} with {agency_name} here. Still happy to help with your {lead_type} insurance quote whenever you are ready. Tap to call: {call_link}' })
              if (error) setError(error.message)
              load()
            }}
          >
            + Add a follow-up text
          </button>
        </div>
      )}
    </>
  )
}

function StepEditor({ step, s, onChanged }: { step: Step; s: SettingsRow; onChanged: () => void }) {
  const [st, setSt] = useState(step)
  const [msg, setMsg] = useState<string | null>(null)
  const dirty = JSON.stringify(st) !== JSON.stringify(step)
  const upd = <K extends keyof Step>(k: K, v: Step[K]) => setSt((p) => ({ ...p, [k]: v }))

  async function saveStep() {
    const { id, ...rest } = st
    const { error } = await supabase().from('followup_steps').update(rest).eq('id', id!)
    setMsg(error ? error.message : 'Saved')
    setTimeout(() => setMsg(null), 2000)
    onChanged()
  }
  async function del() {
    if (!confirm(`Delete "${st.name || 'this follow-up'}"?`)) return
    await supabase().from('followup_steps').delete().eq('id', st.id!)
    onChanged()
  }

  return (
    <div className={`card p-4 space-y-3 ${st.enabled ? '' : 'opacity-70'}`}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[180px]">
          <label className="label">Name</label>
          <input className="input" value={st.name ?? ''} onChange={(e) => upd('name', e.target.value)} />
        </div>
        <div>
          <label className="label">Days after the lead came in</label>
          <input type="number" min={0} max={365} className="input w-28" value={st.delay_days} onChange={(e) => upd('delay_days', Math.max(0, Number(e.target.value)))} />
        </div>
        <div>
          <label className="label">Send from</label>
          <select className="input w-28" value={st.send_hour} onChange={(e) => upd('send_hour', Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm pb-2"><input type="checkbox" checked={st.enabled} onChange={(e) => upd('enabled', e.target.checked)} /> On</label>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="text-muted">Lead types:</span>
        {LEAD_TYPES.map((t) => (
          <label key={t} className="flex items-center gap-1">
            <input type="checkbox" checked={!st.lead_types.length || st.lead_types.includes(t)} onChange={(e) => {
              const cur = st.lead_types.length ? st.lead_types : [...LEAD_TYPES]
              const next = e.target.checked ? [...new Set([...cur, t])] : cur.filter((x) => x !== t)
              upd('lead_types', next.length === LEAD_TYPES.length ? [] : next)
            }} /> {LEAD_TYPE_LABELS[t]}
          </label>
        ))}
      </div>
      <AiTextArea kind="template" rows={4} value={st.body} onChange={(v) => upd('body', v)} showSms showTags />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={st.stop_if_replied} onChange={(e) => upd('stop_if_replied', e.target.checked)} /> Don&apos;t send once the lead has texted back</label>
      <Preview text={preview(st.body, s, (st.lead_types[0] as LeadType) || 'auto')} />
      <div className="flex items-center gap-2">
        <button className="btn-primary" disabled={!dirty} onClick={saveStep}>{dirty ? 'Save' : 'Saved'}</button>
        {dirty && <button className="btn-ghost" onClick={() => setSt(step)}>Undo</button>}
        <button className="btn-danger ml-auto" onClick={del}>Delete</button>
        {msg && <span className="text-sm text-success">{msg}</span>}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ Connections & testing
interface Status {
  baseUrl: string
  sms: string | null
  smsFrom: string | null
  email: boolean
  emailFrom: string | null
  ai: boolean
  aiModel: string
  webhookSecretSet: boolean
  cronSecretSet: boolean
  leadWebhookUrl: string
  smsWebhookUrl: string
}

function ConnectionsTab() {
  const [st, setSt] = useState<Status | null>(null)
  const [type, setType] = useState<LeadType>('auto')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { fetch('/api/status').then((r) => r.json()).then(setSt).catch(() => {}) }, [])

  async function testLead() {
    setBusy(true)
    setResult(null)
    const res = await fetch('/api/test-lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, phone: phone || undefined, email: email || undefined }) })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    setResult(res.ok ? `Test lead created. Welcome text: ${data.text ?? 'n/a'}. Open it from Leads.` : `Failed: ${data.error}`)
  }
  async function runJob() {
    setBusy(true)
    const res = await fetch('/api/cron')
    setBusy(false)
    setResult(`Scheduled job: ${JSON.stringify(await res.json())}`)
  }

  const Row = ({ ok, label, detail }: { ok: boolean; label: string; detail?: string | null }) => (
    <div className="flex items-start gap-2 text-sm">
      <span className={ok ? 'text-success' : 'text-crimson'}>{ok ? '✔' : '✖'}</span>
      <span><span className="font-medium">{label}</span>{detail && <span className="text-muted"> - {detail}</span>}</span>
    </div>
  )

  return (
    <>
      <Section title="What's connected" hint="These are set in Vercel (Project > Settings > Environment Variables). See docs/SETUP.md.">
        {!st ? <p className="text-muted text-sm">Checking...</p> : (
          <div className="space-y-1.5">
            <Row ok={st.webhookSecretSet} label="SmartFinancial lead link" detail={st.webhookSecretSet ? 'ready' : 'SMARTFINANCIAL_WEBHOOK_SECRET is not set'} />
            <Row ok={!!st.sms} label="Texting" detail={st.sms ? `${st.sms === 'twilio' ? 'Twilio' : 'Telnyx'}${st.smsFrom ? `, from ${st.smsFrom}` : ''}` : 'not set up (Twilio or Telnyx)'} />
            <Row ok={st.email} label="Email" detail={st.email ? `from ${st.emailFrom}` : 'RESEND_API_KEY / EMAIL_FROM not set'} />
            <Row ok={st.ai} label="AI (assistant + writing help)" detail={st.ai ? st.aiModel : 'ANTHROPIC_API_KEY not set'} />
            <Row ok={st.cronSecretSet} label="Scheduled job (follow-ups, morning texts)" detail={st.cronSecretSet ? 'every 15 minutes' : 'CRON_SECRET not set'} />
          </div>
        )}
      </Section>
      {st && (
        <Section title="Addresses to give SmartFinancial and your texting service">
          <div>
            <div className="label">SmartFinancial lead delivery (HTTP POST) URL</div>
            <code className="block break-all rounded bg-canvas p-2 text-xs">{st.leadWebhookUrl}</code>
            <p className="text-xs text-muted mt-1">Replace YOUR_SMARTFINANCIAL_WEBHOOK_SECRET with the value you set in Vercel.</p>
          </div>
          <div>
            <div className="label">Incoming text messages webhook (Twilio / Telnyx)</div>
            <code className="block break-all rounded bg-canvas p-2 text-xs">{st.smsWebhookUrl}</code>
          </div>
        </Section>
      )}
      <Section title="Send a test lead" hint="Runs one of SmartFinancial's sample leads through everything a real lead goes through: saved, emailed, and texted. Put in your own cell number to get the welcome text and try texting the assistant.">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">Lead type</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value as LeadType)}>
              {LEAD_TYPES.map((t) => <option key={t} value={t}>{LEAD_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <Input label="Your cell (to get the text)" value={phone} onChange={setPhone} placeholder="(970) 555-1234" />
          <Input label="Email on the lead (optional)" value={email} onChange={setEmail} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy} onClick={testLead}>{busy ? 'Working...' : 'Send test lead'}</button>
          <button className="btn-secondary" disabled={busy} onClick={runJob}>Run follow-ups now</button>
        </div>
        {result && <p className="text-sm">{result}</p>}
      </Section>
    </>
  )
}

// ------------------------------------------------------------------ Account
function AccountTab() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { supabase().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? '')) }, [])
  async function change() {
    if (pw.length < 8) return setMsg('Use at least 8 characters.')
    const { error } = await supabase().auth.updateUser({ password: pw })
    setMsg(error ? error.message : 'Password changed.')
    setPw('')
  }
  return (
    <Section title="Your account" hint={`Signed in as ${email}. To add another staff member, add them in Supabase (Authentication > Users > Add user).`}>
      <div className="max-w-sm space-y-2">
        <label className="label">New password</label>
        <input type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        <button className="btn-primary" onClick={change}>Change password</button>
        {msg && <p className="text-sm">{msg}</p>}
      </div>
    </Section>
  )
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsInner />
    </Suspense>
  )
}
