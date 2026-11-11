import { LEAD_STATUSES, LEAD_TYPE_LABELS, type LeadStatus, type LeadType } from '@/lib/fields'

const TYPE_STYLES: Record<LeadType, string> = {
  auto: 'bg-sky-light text-navy',
  home: 'bg-emerald-50 text-emerald-800',
  renters: 'bg-amber-50 text-amber-800',
  commercial: 'bg-violet-50 text-violet-800',
}
const STATUS_STYLES: Record<LeadStatus, string> = {
  new: 'bg-crimson text-white',
  contacted: 'bg-sky text-navy-dark',
  quoted: 'bg-amber-100 text-amber-900',
  sold: 'bg-success text-white',
  lost: 'bg-gray-200 text-gray-700',
}

export function TypeBadge({ type }: { type: LeadType }) {
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${TYPE_STYLES[type]}`}>{LEAD_TYPE_LABELS[type]}</span>
}

export function StatusBadge({ status }: { status: LeadStatus }) {
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}>{LEAD_STATUSES.find((s) => s.value === status)?.label ?? status}</span>
}
