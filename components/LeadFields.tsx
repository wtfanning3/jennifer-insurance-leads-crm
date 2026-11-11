'use client'

import {
  CONTACT_FIELDS,
  EXISTING_COVERAGE_FIELDS,
  LEAD_TYPE_DEFS,
  type InsuranceLead,
  type LeadDetails,
  type LeadType,
  type SectionValues,
} from '@/lib/fields'

export type LeadDraft = Partial<InsuranceLead> & { lead_type: LeadType; details: LeadDetails }

const WIDE = new Set(['email', 'street', 'business_name'])

function Field({ label, value, onChange, wide, long }: { label: string; value: string; onChange: (v: string) => void; wide?: boolean; long?: boolean }) {
  return (
    <div className={wide || long ? 'sm:col-span-2' : ''}>
      <label className="label">{label}</label>
      {long ? (
        <textarea className="input" rows={2} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  )
}

/** Every field of a lead, in SmartFinancial's sections, editable */
export default function LeadFields({ lead, onChange }: { lead: LeadDraft; onChange: (l: LeadDraft) => void }) {
  const def = LEAD_TYPE_DEFS[lead.lead_type]
  const rec = lead as unknown as Record<string, string | null>
  const set = (k: string, v: string) => onChange({ ...lead, [k]: v })
  const setSection = (key: string, values: SectionValues | SectionValues[]) => onChange({ ...lead, details: { ...lead.details, [key]: values } })

  return (
    <div className="space-y-5">
      <section className="card p-4 sm:p-5">
        <h3 className="h2 mb-3">Contact Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {CONTACT_FIELDS.filter((f) => def.contactFields.includes(f.key)).map((f) => (
            <Field key={f.key} label={f.label} value={rec[f.key] ?? ''} onChange={(v) => set(f.key, v)} wide={WIDE.has(f.key)} />
          ))}
        </div>
      </section>

      {def.existingCoverage && (
        <section className="card p-4 sm:p-5">
          <h3 className="h2 mb-3">Existing Coverage</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {EXISTING_COVERAGE_FIELDS.map((f) => (
              <Field key={f.key} label={f.label} value={rec[f.key] ?? ''} onChange={(v) => set(f.key, v)} />
            ))}
          </div>
        </section>
      )}

      {def.sections.map((s) => {
        const raw = lead.details?.[s.key]
        if (s.repeat) {
          const list = (Array.isArray(raw) ? raw : []) as SectionValues[]
          const items = list.length ? list : [{}]
          return (
            <section key={s.key} className="card p-4 sm:p-5">
              {items.map((item, i) => (
                <div key={i} className={i > 0 ? 'mt-5 pt-5 border-t border-line' : ''}>
                  <div className="flex items-center mb-3">
                    <h3 className="h2">{s.title} #{i + 1}</h3>
                    {items.length > 1 && (
                      <button type="button" className="ml-auto text-xs text-crimson hover:underline" onClick={() => setSection(s.key, items.filter((_, j) => j !== i))}>
                        Remove {s.title.toLowerCase()}
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    {s.fields.map((f) => (
                      <Field key={f.key} label={f.label} long={f.long} wide={f.wide} value={item[f.key] ?? ''} onChange={(v) => setSection(s.key, items.map((it, j) => (j === i ? { ...it, [f.key]: v } : it)))} />
                    ))}
                  </div>
                </div>
              ))}
              <button type="button" className="btn-ghost mt-3 text-xs" onClick={() => setSection(s.key, [...items, {}])}>
                + Add {s.title.toLowerCase()}
              </button>
            </section>
          )
        }
        const values = (raw && !Array.isArray(raw) ? raw : {}) as SectionValues
        return (
          <section key={s.key} className="card p-4 sm:p-5">
            <h3 className="h2 mb-3">{s.title}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              {s.fields.map((f) => (
                <Field key={f.key} label={f.label} long={f.long} wide={f.wide || f.key === 'description'} value={values[f.key] ?? ''} onChange={(v) => setSection(s.key, { ...values, [f.key]: v })} />
              ))}
            </div>
          </section>
        )
      })}

      {lead.details?.other && Object.keys(lead.details.other).length > 0 && (
        <section className="card p-4 sm:p-5">
          <h3 className="h2 mb-1">Other Information</h3>
          <p className="text-xs text-muted mb-3">Anything else that came with the lead.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries(lead.details.other).map(([k, v]) => (
              <Field key={k} label={k} value={v} onChange={(nv) => setSection('other', { ...lead.details.other!, [k]: nv })} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
