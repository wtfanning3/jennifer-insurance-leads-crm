import 'server-only'
import { db } from './supabase-admin'
import { LEAD_TYPE_LABELS, type InsuranceLead, type LeadType } from './fields'
import { formatPhone, toE164 } from './phone'
import { DEFAULT_WELCOME_TEMPLATE, fillTemplate } from './templates'

export interface Settings {
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
  last_follow_up_digest: string | null
}

export const DEFAULT_SETTINGS: Settings = {
  agency_name: 'Jennifer Richardson Fanning Insurance Agency',
  agent_name: 'Jennifer',
  license_number: '161620',
  office_phone: null,
  office_email: null,
  office_address: 'Fort Collins, CO',
  website_url: 'https://agents.farmers.com/co/fort-collins/jennifer-richardson-fanning/',
  office_hours: null,
  logo_url: null,
  icon_url: null,
  office_phone_by_type: {},
  notify_emails: null,
  notify_on_reply: true,
  welcome_enabled: true,
  welcome_templates: {},
  followups_enabled: true,
  bot_enabled: true,
  bot_instructions: null,
  quiet_start_hour: 20,
  quiet_end_hour: 8,
  time_zone: 'America/Denver',
  last_follow_up_digest: null,
}

export async function getSettings(): Promise<Settings> {
  const { data } = await db().from('settings').select('*').eq('id', 1).maybeSingle()
  const merged = { ...DEFAULT_SETTINGS } as Record<string, unknown>
  for (const [k, v] of Object.entries(data ?? {})) if (v !== null && v !== undefined) merged[k] = v
  return merged as unknown as Settings
}

/** Where the CRM is reachable from the internet (links in texts and emails) */
export function appBaseUrl(): string {
  const url = process.env.PUBLIC_LINK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000')
  return url.replace(/\/+$/, '')
}

export const logoUrl = (s: Settings) => s.logo_url || `${appBaseUrl()}/brand/logo-full.png`
export const iconUrl = (s: Settings) => s.icon_url || `${appBaseUrl()}/brand/logo-icon.png`

/** The office number a lead's "tap to call" link rings */
export function officePhoneFor(lead: Pick<InsuranceLead, 'lead_type' | 'call_phone'>, s: Settings): string | null {
  return toE164(lead.call_phone) ?? toE164(s.office_phone_by_type?.[lead.lead_type]) ?? toE164(s.office_phone)
}

export const callLink = (lead: Pick<InsuranceLead, 'short_code'>) => `${appBaseUrl()}/i/c/${lead.short_code}`
export const stopLink = (lead: Pick<InsuranceLead, 'short_code'>) => `${appBaseUrl()}/i/s/${lead.short_code}`

export function renderForLead(template: string, lead: InsuranceLead, s: Settings): string {
  const office = officePhoneFor(lead, s)
  return fillTemplate(template, {
    first_name: lead.first_name?.trim() || 'there',
    last_name: lead.last_name?.trim() || '',
    business_name: lead.business_name?.trim() || 'your business',
    lead_type: LEAD_TYPE_LABELS[lead.lead_type].toLowerCase(),
    agent_name: s.agent_name?.trim() || 'your agent',
    agency_name: s.agency_name?.trim() || 'our agency',
    office_phone: office ? formatPhone(office) : '',
    call_link: callLink(lead),
    stop_link: stopLink(lead),
    website: s.website_url ?? '',
  })
}

export function welcomeText(lead: InsuranceLead, s: Settings): string {
  const t = s.welcome_templates?.[lead.lead_type]?.trim() || DEFAULT_WELCOME_TEMPLATE
  let text = renderForLead(t, lead, s)
  // The first text must say how to stop - added if the wording left it out
  if (!/\bstop\b/i.test(text)) text += `\nReply STOP to opt out.`
  return text
}

/** Hour of day (0-23) in the office time zone */
export function officeHour(s: Settings, at = new Date()): number {
  try {
    return Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: s.time_zone }).format(at)) % 24
  } catch {
    return at.getUTCHours()
  }
}

/** Too late / too early to start texting someone */
export function isQuietHours(s: Settings, at = new Date()): boolean {
  const h = officeHour(s, at)
  const { quiet_start_hour: start, quiet_end_hour: end } = s
  if (start === end) return false
  return start > end ? h >= start || h < end : h >= start && h < end
}

/** Today (YYYY-MM-DD) in the office time zone */
export function officeToday(s: Settings, at = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: s.time_zone }).format(at)
  } catch {
    return at.toISOString().slice(0, 10)
  }
}

export function notifyEmailList(s: Settings): string[] {
  const raw = s.notify_emails || process.env.NOTIFY_EMAILS || ''
  return [...new Set(raw.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))]
}
