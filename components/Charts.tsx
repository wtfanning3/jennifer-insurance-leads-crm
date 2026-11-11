'use client'

import { useState } from 'react'

// Simple, readable charts: one color (magnitude), thin bars, a tooltip on
// hover, and a table view. Text stays in ink colors; the bar carries the value.
const BAR = '#2a78d6'

export interface Point { label: string; value: number; hint?: string }

/** Vertical bars over time (leads per day / week / month) */
export function ColumnChart({ points, unit = '' }: { points: Point[]; unit?: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  const max = Math.max(1, ...points.map((p) => p.value))
  const total = points.reduce((n, p) => n + p.value, 0)
  if (!points.length) return <p className="text-sm text-muted">No data for these dates.</p>
  const labelEvery = Math.max(1, Math.ceil(points.length / 8))
  return (
    <div>
      {table ? (
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <tbody>
              {points.map((p) => (
                <tr key={p.label} className="border-t border-line"><td className="py-1 pr-4">{p.hint ?? p.label}</td><td className="py-1 text-right font-semibold">{p.value}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <div className="flex items-end gap-[2px] h-48 border-b border-line" onMouseLeave={() => setHover(null)}>
            {points.map((p, i) => (
              <div key={p.label} className="relative flex-1 h-full flex items-end cursor-default" onMouseEnter={() => setHover(i)}>
                <div className="w-full rounded-t" style={{ height: `${(p.value / max) * 100}%`, minHeight: p.value ? 3 : 0, background: BAR, opacity: hover === null || hover === i ? 1 : 0.45 }} />
              </div>
            ))}
          </div>
          {hover !== null && (
            <div className="pointer-events-none absolute -top-2 z-10 rounded-md border border-line bg-white px-2.5 py-1.5 text-xs shadow-md" style={{ left: `clamp(0px, calc(${((hover + 0.5) / points.length) * 100}% - 60px), calc(100% - 120px))` }}>
              <div className="text-muted">{points[hover].hint ?? points[hover].label}</div>
              <div className="font-semibold text-ink">{points[hover].value}{unit}</div>
            </div>
          )}
          <div className="flex gap-[2px] mt-1 text-[11px] text-muted">
            {points.map((p, i) => <div key={p.label} className="flex-1 text-center truncate">{i % labelEvery === 0 ? p.label : ''}</div>)}
          </div>
          <div className="absolute right-0 top-0 text-[11px] text-muted bg-white/80 px-1">max {max}</div>
        </div>
      )}
      <div className="mt-2 flex text-xs text-muted">
        <span>Total {total}{unit}</span>
        <button className="ml-auto text-navy hover:underline" onClick={() => setTable(!table)}>{table ? 'Show chart' : 'Show table'}</button>
      </div>
    </div>
  )
}

/** Horizontal bars with the value written at the end (categories) */
export function BarList({ items, total }: { items: Point[]; total?: number }) {
  const max = Math.max(1, ...items.map((p) => p.value))
  return (
    <div className="space-y-2">
      {items.map((p) => (
        <div key={p.label} className="grid grid-cols-[8rem_1fr_auto] items-center gap-3 text-sm" title={p.hint}>
          <span className="truncate">{p.label}</span>
          <div className="h-3 rounded bg-canvas">
            <div className="h-3 rounded" style={{ width: `${(p.value / max) * 100}%`, minWidth: p.value ? 4 : 0, background: BAR }} />
          </div>
          <span className="w-20 text-right font-semibold tabular-nums">
            {p.value}
            {total ? <span className="ml-1 font-normal text-muted">{Math.round((p.value / Math.max(1, total)) * 100)}%</span> : null}
          </span>
        </div>
      ))}
    </div>
  )
}

export function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-2xl font-bold text-navy tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
    </div>
  )
}
