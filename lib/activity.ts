import { LEAD_STATUSES, fieldLabel } from './fields'

export interface ActivityEvent {
  id: string
  lead_id: string | null
  lead_name: string | null
  lead_type: string | null
  type: string
  detail: Record<string, unknown>
  actor: string
  created_at: string
}

export const EVENT_LABELS: Record<string, string> = {
  lead_created: 'Lead received',
  lead_edited: 'Lead edited',
  status_changed: 'Status changed',
  follow_up_set: 'Follow-up date',
  note_added: 'Note added',
  opted_out: 'Opted out of texts',
  opted_in: 'Texts turned back on',
  assistant_paused: 'AI assistant paused',
  assistant_on: 'AI assistant on',
  followups_paused: 'Follow-up texts paused',
  followups_on: 'Follow-up texts on',
  call_link_tapped: 'Tapped the call link',
  lead_deleted: 'Lead deleted',
  lead_emailed: 'Lead emailed',
  email_failed: 'Lead email failed',
}

const statusLabel = (s: unknown) => LEAD_STATUSES.find((x) => x.value === s)?.label ?? String(s ?? '')
const SECTION_LABELS: Record<string, string> = { details: 'coverage / drivers / vehicles / home / business details', call_phone: 'call link number' }

/** One line describing what happened */
export function describeEvent(e: ActivityEvent): string {
  const d = e.detail ?? {}
  switch (e.type) {
    case 'lead_created':
      return `Lead received${d.source ? ` from ${d.source === 'smartfinancial' ? 'SmartFinancial' : d.source === 'manual' ? 'manual entry' : d.source}` : ''}`
    case 'status_changed':
      return `Status: ${statusLabel(d.from)} → ${statusLabel(d.to)}`
    case 'follow_up_set':
      return d.to ? `Follow-up date set to ${d.to}` : 'Follow-up date cleared'
    case 'note_added':
      return `Note: ${String(d.note ?? '')}`
    case 'lead_edited':
      return `Edited ${((d.fields as string[]) ?? []).map((f) => SECTION_LABELS[f] ?? fieldLabel(f).toLowerCase().replace(/_/g, ' ')).join(', ')}`
    case 'lead_emailed':
      return `Lead emailed to ${((d.to as string[]) ?? []).join(', ')}`
    case 'email_failed':
      return `Lead email failed: ${d.error ?? ''}`
    case 'lead_deleted':
      return `Lead deleted (was ${statusLabel(d.status)})`
    default:
      return EVENT_LABELS[e.type] ?? e.type
  }
}

export const actorLabel = (a: string) => (a === 'system' ? 'Automatic' : a)
