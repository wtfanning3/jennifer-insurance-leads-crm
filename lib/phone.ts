/** "555-123-4567", "(555) 123-4567", "+1 555..." -> "+15551234567" (US); null if not a phone number */
export function toE164(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const digits = s.replace(/\D/g, '')
  if (s.startsWith('+') && digits.length >= 10 && digits.length <= 15) return `+${digits}`
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

/** "+15551234567" -> "(555) 123-4567" */
export function formatPhone(raw: string | null | undefined): string {
  const e = toE164(raw)
  if (!e) return String(raw ?? '')
  const d = e.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`
  return e
}
