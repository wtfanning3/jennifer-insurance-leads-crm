'use client'

export interface Range { key: string; from: string | null; to: string | null }

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const PRESETS: { key: string; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7', label: 'Last 7 days' },
  { key: '30', label: 'Last 30 days' },
  { key: '90', label: 'Last 90 days' },
  { key: 'month', label: 'This month' },
  { key: 'lastmonth', label: 'Last month' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom' },
]

/** Dates (YYYY-MM-DD, inclusive) for a preset */
export function presetRange(key: string, custom?: { from: string | null; to: string | null }): Range {
  const now = new Date()
  const today = ymd(now)
  const daysAgo = (n: number) => ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n))
  switch (key) {
    case 'today': return { key, from: today, to: today }
    case '7': return { key, from: daysAgo(6), to: today }
    case '30': return { key, from: daysAgo(29), to: today }
    case '90': return { key, from: daysAgo(89), to: today }
    case 'month': return { key, from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: today }
    case 'lastmonth': return { key, from: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: ymd(new Date(now.getFullYear(), now.getMonth(), 0)) }
    case 'year': return { key, from: ymd(new Date(now.getFullYear(), 0, 1)), to: today }
    case 'custom': return { key, from: custom?.from ?? daysAgo(29), to: custom?.to ?? today }
    default: return { key: 'all', from: null, to: null }
  }
}

/** Start / end instants (local time) for database filters */
export function rangeBounds(r: Range): { gte: string | null; lt: string | null } {
  const start = r.from ? new Date(`${r.from}T00:00:00`) : null
  const end = r.to ? new Date(`${r.to}T00:00:00`) : null
  if (end) end.setDate(end.getDate() + 1)
  return { gte: start?.toISOString() ?? null, lt: end?.toISOString() ?? null }
}

export default function DateRange({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="label">Dates</label>
        <select className="input w-auto" value={value.key} onChange={(e) => onChange(presetRange(e.target.value, value))}>
          {PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </div>
      {value.key === 'custom' && (
        <>
          <div>
            <label className="label">From</label>
            <input type="date" className="input w-auto" value={value.from ?? ''} onChange={(e) => onChange({ ...value, from: e.target.value || null })} />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" className="input w-auto" value={value.to ?? ''} onChange={(e) => onChange({ ...value, to: e.target.value || null })} />
          </div>
        </>
      )}
    </div>
  )
}
