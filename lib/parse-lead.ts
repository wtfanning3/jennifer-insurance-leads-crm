// Reads a SmartFinancial lead into Insurance Lead fields. Takes either:
//  - JSON (SmartFinancial's HTTP Post / webhook delivery, Zapier, a form...):
//    keys are matched by name, in any capitals or spelling style
//    (first_name, FirstName, "First Name"...), nested objects and
//    driver / vehicle lists included; or
//  - the lead as text (the SmartFinancial lead email, forwarded through an
//    email parser): "Name Susan Gill    Phone 555-123-4567" lines, with
//    "Existing Coverage", "Driver #1", "Vehicle #1"... headings.
// Anything that doesn't match a known field is kept under "Other", so nothing
// in a lead is ever lost (the whole original is saved too).

import {
  CONTACT_FIELDS,
  EXISTING_COVERAGE_FIELDS,
  LEAD_TYPE_DEFS,
  normLabel,
  type FieldDef,
  type LeadDetails,
  type LeadType,
  type SectionDef,
  type SectionValues,
} from './fields'

export interface ParsedLead {
  lead_type: LeadType | null
  /** e.g. "Life Insurance" when the lead is a kind we don't handle */
  unsupportedType: string | null
  columns: Record<string, string>
  details: LeadDetails
  source_lead_id: string | null
}

const COLUMN_FIELDS = [...CONTACT_FIELDS, ...EXISTING_COVERAGE_FIELDS]

/** "Auto Insurance", "auto", "Homeowners", "Business Insurance"... */
export function leadTypeFromText(text: string | null | undefined): { type: LeadType | null; unsupported: string | null } {
  const t = String(text ?? '').toLowerCase()
  if (!t.trim()) return { type: null, unsupported: null }
  if (/\b(life|health|medicare|final expense)\b/.test(t)) return { type: null, unsupported: String(text).trim() }
  if (/renter/.test(t)) return { type: 'renters', unsupported: null }
  if (/\b(auto|car|vehicle|motor)/.test(t)) return { type: 'auto', unsupported: null }
  if (/(business|commercial|general liability|bop|workers)/.test(t)) return { type: 'commercial', unsupported: null }
  if (/(home|house|property|condo|dwelling)/.test(t)) return { type: 'home', unsupported: null }
  return { type: null, unsupported: null }
}

/** "123 Main Street, Unit 304, Columbus, OH 43215" -> its parts */
export function parseAddress(full: string): Record<string, string> {
  const parts = String(full ?? '').split(',').map((p) => p.trim()).filter(Boolean)
  const out: Record<string, string> = {}
  if (!parts.length) return out
  const last = parts[parts.length - 1]
  const sz = last.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/)
  if (sz) {
    out.state = sz[1].toUpperCase()
    out.zip = sz[2]
    parts.pop()
  } else if (/^\d{5}(-\d{4})?$/.test(last)) {
    out.zip = last
    parts.pop()
    if (parts.length && /^[A-Za-z]{2}$/.test(parts[parts.length - 1])) out.state = parts.pop()!.toUpperCase()
  }
  if (parts.length >= 2) out.city = parts.pop()!
  if (parts.length) out.street = parts.shift()!
  if (parts.length) out.unit = parts.join(', ')
  return out
}

function splitName(full: string): { first_name?: string; last_name?: string } {
  const words = String(full ?? '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return {}
  if (words.length === 1) return { first_name: words[0] }
  return { first_name: words[0], last_name: words.slice(1).join(' ') }
}

function matchField(fields: FieldDef[], key: string): FieldDef | undefined {
  const n = normLabel(key)
  if (!n) return undefined
  return fields.find((f) => normLabel(f.key) === n || normLabel(f.label) === n || (f.aliases ?? []).some((a) => normLabel(a) === n))
}

function emptyParsed(): ParsedLead {
  return { lead_type: null, unsupportedType: null, columns: {}, details: {}, source_lead_id: null }
}

function setOther(p: ParsedLead, key: string, value: string) {
  if (!value) return
  p.details.other = p.details.other ?? {}
  let k = key
  for (let i = 2; p.details.other[k] !== undefined && p.details.other[k] !== value; i++) k = `${key} (${i})`
  p.details.other[k] = value
}

// ---------------------------------------------------------------- text

const IGNORE_LINES = new Set(['prospectdata', 'auto', 'home', 'health', 'life', 'commercial', 'renters', 'contactinformation'])

interface TextSection {
  kind: 'contact' | 'existing' | 'section' | 'skip'
  def?: SectionDef
  index?: number
}

export function parseLeadText(text: string, typeHint?: LeadType | null): ParsedLead {
  const p = emptyParsed()
  const lines = String(text ?? '').replace(/\r/g, '').split('\n')

  // First pass: find the lead type ("Type Auto Insurance")
  let type: LeadType | null = typeHint ?? null
  if (!type) {
    for (const line of lines) {
      for (const seg of line.split(/\t+| {2,}/)) {
        const m = seg.trim().match(/^type\s*:?\s+(.+insurance.*)$/i)
        if (m) {
          const r = leadTypeFromText(m[1])
          if (r.unsupported) p.unsupportedType = r.unsupported
          type = r.type
        }
      }
      if (type || p.unsupportedType) break
    }
  }
  if (!type && !p.unsupportedType) {
    const all = text.toLowerCase()
    type = /vehicle #|driver #/.test(all) ? 'auto' : /business information/.test(all) ? 'commercial' : /ownership\s+rent/.test(all) ? 'renters' : /home details/.test(all) ? 'home' : null
  }
  p.lead_type = type
  const sections = type ? LEAD_TYPE_DEFS[type].sections : []

  let current: TextSection = { kind: 'contact' }
  const repeatCount: Record<string, number> = {}

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    const n = normLabel(line)
    if (IGNORE_LINES.has(n) || /^check out our sample|^if you have questions/i.test(line)) continue

    // Headings
    if (n === 'existingcoverage' || n === 'currentcoverage') { current = { kind: 'existing' }; continue }
    const rep = line.match(/^(driver|vehicle|applicant)\s*#?\s*(\d+)\s*$/i)
    if (rep) {
      const def = sections.find((s) => s.repeat && s.headings.includes(rep[1].toLowerCase()))
      if (!def) { current = { kind: 'skip' }; continue }
      const idx = (repeatCount[def.key] = (repeatCount[def.key] ?? 0) + 1) - 1
      current = { kind: 'section', def, index: idx }
      continue
    }
    const headed = sections.find((s) => !s.repeat && s.headings.some((h) => normLabel(h) === n))
    if (headed) { current = { kind: 'section', def: headed }; continue }
    if (/^(desired coverage|home details|business information|property details)$/i.test(line)) { current = { kind: 'skip' }; continue }

    const segs = line.split(/\t+| {2,}/).map((x) => x.trim()).filter(Boolean)
    for (let i = 0; i < segs.length; i++) {
      let seg = segs[i]
      // Label and value in separate cells ("Name" | "Sam Miller") - put them together
      if (isBareLabel(seg, current) && i + 1 < segs.length && !isBareLabel(segs[i + 1], current)) seg = `${seg} ${segs[++i]}`
      handleSegment(p, seg, current, type)
    }
  }
  return p
}

function isBareLabel(seg: string, current: TextSection): boolean {
  const l = seg.toLowerCase().replace(/:$/, '').trim()
  if (['name', 'address', 'type'].includes(l)) return true
  const fields = [...COLUMN_FIELDS, ...(current.def?.fields ?? [])]
  return fields.some((f) => [f.label, ...(f.aliases ?? [])].some((x) => x.toLowerCase() === l))
}

function bestLabel(seg: string, fields: FieldDef[]): { field: FieldDef; value: string } | null {
  const lower = seg.toLowerCase()
  let best: { field: FieldDef; value: string; len: number } | null = null
  for (const f of fields) {
    for (const label of [f.label, ...(f.aliases ?? [])]) {
      const l = label.toLowerCase()
      if ((lower.startsWith(`${l} `) || lower.startsWith(`${l}:`) || lower === l) && (!best || l.length > best.len)) {
        best = { field: f, value: seg.slice(l.length).replace(/^\s*:?\s*/, '').trim(), len: l.length }
      }
    }
  }
  return best ? { field: best.field, value: best.value } : null
}

function sectionTarget(p: ParsedLead, def: SectionDef, index?: number): SectionValues {
  if (def.repeat) {
    const arr = (Array.isArray(p.details[def.key]) ? p.details[def.key] : []) as SectionValues[]
    while (arr.length <= (index ?? 0)) arr.push({})
    p.details[def.key] = arr
    return arr[index ?? 0]
  }
  const existing = p.details[def.key]
  if (existing && !Array.isArray(existing)) return existing
  const obj: SectionValues = {}
  p.details[def.key] = obj
  return obj
}

function handleSegment(p: ParsedLead, seg: string, current: TextSection, type: LeadType | null) {
  if (current.kind === 'skip') { setOther(p, 'Note', seg); return }
  if (current.kind === 'section' && current.def) {
    const hit = bestLabel(seg, current.def.fields)
    const target = sectionTarget(p, current.def, current.index)
    if (hit) { if (hit.value) target[hit.field.key] = hit.value; return }
    // "General Liability" on its own line under Desired Coverage (commercial)
    if (type === 'commercial' && current.def.key === 'coverage' && !target.coverage_type) { target.coverage_type = seg; return }
    // Fall through to contact/existing labels (some leads mix them)
  }
  // Contact + existing coverage
  if (/^type\b/i.test(seg) && current.kind !== 'section') return // "Type Auto Insurance" - already read
  if (/^name\b/i.test(seg) && !/^name\s+of\b/i.test(seg)) {
    const v = seg.replace(/^name\s*:?\s*/i, '')
    if (!p.columns.first_name && !p.columns.last_name) Object.assign(p.columns, splitName(v))
    return
  }
  if (/^address\b/i.test(seg)) {
    const v = seg.replace(/^address\s*:?\s*/i, '')
    for (const [k, val] of Object.entries(parseAddress(v))) if (!p.columns[k]) p.columns[k] = val
    return
  }
  const fields = current.kind === 'existing' ? [...EXISTING_COVERAGE_FIELDS, ...CONTACT_FIELDS] : [...CONTACT_FIELDS, ...EXISTING_COVERAGE_FIELDS]
  const hit = bestLabel(seg, fields)
  if (hit) {
    if (hit.value && !p.columns[hit.field.key]) p.columns[hit.field.key] = hit.value
    return
  }
  setOther(p, 'Note', seg)
}

// ---------------------------------------------------------------- JSON

const TYPE_KEYS = ['leadtype', 'type', 'insurancetype', 'product', 'producttype', 'vertical', 'lineofbusiness', 'lob', 'category', 'requesttype', 'quotetype']
const ID_KEYS = ['leadid', 'smartfinancialid', 'sfleadid', 'requestid', 'quoterequestid', 'id', 'leadnumber']
const TEXT_KEYS = ['text', 'body', 'plain', 'bodyplain', 'emailbody', 'leadtext', 'raw', 'textbody', 'strippedtext', 'message']
const NAME_KEYS = ['name', 'fullname', 'contactname', 'customername', 'applicantname', 'prospectname']
const ADDRESS_KEYS = ['address', 'fulladdress', 'mailingaddress', 'streetaddressfull']

type Json = string | number | boolean | null | Json[] | { [k: string]: Json }

function scalar(v: Json): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  return null
}

function prettyKey(path: string[]): string {
  return path
    .map((k) => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim())
    .map((k) => k.charAt(0).toUpperCase() + k.slice(1))
    .join(' > ')
}

export function parseLeadJson(input: Record<string, Json>, typeHint?: LeadType | null): ParsedLead {
  let p = emptyParsed()

  // The lead as text inside the JSON (an email parser / Zapier "body")
  const textEntry = Object.entries(input).find(([k, v]) => TEXT_KEYS.includes(normLabel(k)) && typeof v === 'string' && v.length > 40 && /\n|\t/.test(v))
  const htmlEntry = Object.entries(input).find(([k, v]) => HTML_KEYS.includes(normLabel(k)) && typeof v === 'string' && /<(td|br|p|div|tr)\b/i.test(v))
  const embeddedText = textEntry ? (textEntry[1] as string) : htmlEntry ? htmlToText(htmlEntry[1] as string) : null

  // Lead type
  let type: LeadType | null = typeHint ?? null
  if (!type) {
    for (const [k, v] of Object.entries(input)) {
      if (TYPE_KEYS.includes(normLabel(k)) && typeof v === 'string') {
        const r = leadTypeFromText(v)
        if (r.type) { type = r.type; break }
        if (r.unsupported) p.unsupportedType = r.unsupported
      }
    }
  }
  if (embeddedText) {
    p = parseLeadText(embeddedText, type)
    type = p.lead_type
  }
  if (!type && !p.unsupportedType) {
    const keys = JSON.stringify(input).toLowerCase()
    type = /"vehicles?"|"drivers?"/.test(keys) ? 'auto' : /"business/.test(keys) ? 'commercial' : /renter/.test(keys) ? 'renters' : /"(home|property|dwelling)/.test(keys) ? 'home' : null
  }
  p.lead_type = type
  const sections = type ? LEAD_TYPE_DEFS[type].sections : []

  const walk = (value: Json, path: string[], sectionHint: SectionDef | null) => {
    const key = path[path.length - 1] ?? ''
    const nk = normLabel(key)
    if (Array.isArray(value)) {
      const rep = sections.find((s) => s.repeat && s.headings.some((h) => nk.includes(h)))
      if (rep) {
        value.forEach((item, i) => {
          if (item && typeof item === 'object' && !Array.isArray(item)) {
            const target = sectionTarget(p, rep, i)
            for (const [k2, v2] of Object.entries(item)) {
              const s = scalar(v2 as Json)
              if (!s) continue
              const f = matchField(rep.fields, k2) ?? (rep.key === 'drivers' && NAME_KEYS.includes(normLabel(k2)) ? rep.fields[0] : undefined)
              if (f) target[f.key] = s
              else if (/^first ?name$/i.test(k2) || /^last ?name$/i.test(k2)) target.name = [target.name, s].filter(Boolean).join(' ')
              else setOther(p, `${prettyKey([key])} #${i + 1} ${prettyKey([k2])}`, s)
            }
          }
        })
        return
      }
      const allScalar = value.every((v) => scalar(v) !== null || v === null)
      if (allScalar) {
        const s = value.map(scalar).filter(Boolean).join(', ')
        if (s) walk(s, path, sectionHint)
        return
      }
      value.forEach((v, i) => walk(v, [...path, String(i + 1)], sectionHint))
      return
    }
    if (value && typeof value === 'object') {
      const hint = sections.find((s) => s.key === nk || s.headings.some((h) => normLabel(h) === nk || nk.includes(normLabel(h).replace(/details|information/, ''))) ) ?? sectionHint
      const rep = sections.find((s) => s.repeat && s.headings.some((h) => nk.startsWith(h)))
      if (rep) {
        // { driver: {...} } or { driver1: {...} }
        const idx = Math.max(0, (Number(nk.replace(/\D/g, '')) || 1) - 1)
        const target = sectionTarget(p, rep, idx)
        for (const [k2, v2] of Object.entries(value)) {
          const s = scalar(v2 as Json)
          const f = s ? matchField(rep.fields, k2) : undefined
          if (s && f) target[f.key] = s
          else if (s) setOther(p, prettyKey([...path, k2]), s)
        }
        return
      }
      for (const [k2, v2] of Object.entries(value)) walk(v2 as Json, [...path, k2], hint)
      return
    }
    const s = scalar(value)
    if (!s) return
    if (embeddedText && path.length === 1 && TEXT_KEYS.includes(nk)) return
    if (path.length === 1 && TYPE_KEYS.includes(nk) && leadTypeFromText(s).type) return
    if (ID_KEYS.includes(nk) && !p.source_lead_id && path.length <= 2) { p.source_lead_id = s; return }

    // A section named by the parent object goes first ("home": {"type": ...})
    if (sectionHint && !sectionHint.repeat) {
      const f = matchField(sectionHint.fields, key)
      if (f) { sectionTarget(p, sectionHint)[f.key] = s; return }
    }
    if (NAME_KEYS.includes(nk)) {
      if (!p.columns.first_name && !p.columns.last_name) Object.assign(p.columns, splitName(s))
      return
    }
    if (ADDRESS_KEYS.includes(nk) && !/\d{5}/.test(p.columns.zip ?? '') && s.includes(',')) {
      for (const [k, val] of Object.entries(parseAddress(s))) if (!p.columns[k]) p.columns[k] = val
      return
    }
    const col = matchField(COLUMN_FIELDS, key)
    if (col) { p.columns[col.key] = s; return }
    for (const sec of sections) {
      if (sec.repeat) continue
      const f = matchField(sec.fields, key)
      if (f) { sectionTarget(p, sec)[f.key] = s; return }
    }
    // Driver / vehicle fields given flat ("vehicle_1_make", "driver1Birthday")
    const flat = key.match(/^(driver|vehicle)[\s_-]*(\d+)?[\s_-]*(.+)$/i)
    if (flat) {
      const rep = sections.find((x) => x.repeat && x.headings.includes(flat[1].toLowerCase()))
      const f = rep ? matchField(rep.fields, flat[3]) : undefined
      if (rep && f) { sectionTarget(p, rep, Math.max(0, Number(flat[2] || 1) - 1))[f.key] = s; return }
    }
    setOther(p, prettyKey(path), s)
  }

  for (const [k, v] of Object.entries(input)) {
    // A forwarded email: only its text is the lead - skip the email's own headers etc.
    if (embeddedText && (EMAIL_KEYS.includes(normLabel(k)) || HTML_KEYS.includes(normLabel(k)))) continue
    walk(v, [k], null)
  }
  return p
}

const HTML_KEYS = ['html', 'bodyhtml', 'htmlbody', 'strippedhtml']
const EMAIL_KEYS = ['headers', 'envelope', 'attachments', 'charsets', 'spamscore', 'spamreport', 'dkim', 'spf', 'senderip', 'to', 'from', 'cc', 'subject', 'replyplain', 'messageid', 'date', 'recipient', 'sender', 'signature', 'timestamp', 'token']

/** The lead email's HTML -> the same "Label Value" lines as the text version */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(td|th)>/gi, '\t')
    .replace(/<(br|\/p|\/div|\/tr|\/h\d|\/li)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \u00a0]*\t[ \u00a0\t]*/g, '\t')
    .replace(/[ \u00a0]{2,}/g, ' ')
    .split('\n')
    .map((l) => l.replace(/^\t+|\t+$/g, '').trim())
    .filter(Boolean)
    .join('\n')
}

/** JSON body, form post or plain text - whichever arrived */
export function parseLeadBody(body: unknown, rawText: string, typeHint?: LeadType | null): ParsedLead {
  if (body && typeof body === 'object' && !Array.isArray(body)) return parseLeadJson(body as Record<string, Json>, typeHint)
  if (Array.isArray(body) && body[0] && typeof body[0] === 'object') return parseLeadJson(body[0] as Record<string, Json>, typeHint)
  return parseLeadText(rawText, typeHint)
}
