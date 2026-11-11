import { NextRequest, NextResponse } from 'next/server'
import { secretMatches } from '@/lib/auth'
import { parseLeadBody, leadTypeFromText } from '@/lib/parse-lead'
import { ingestLead } from '@/lib/ingest'
import { sendEmail } from '@/lib/email'
import { getSettings, notifyEmailList } from '@/lib/settings'

// SmartFinancial (or an email parser / Zapier) sends each new lead here.
//   POST https://<your CRM>/api/webhooks/smartfinancial?key=<SMARTFINANCIAL_WEBHOOK_SECRET>
// The secret can also go in an "X-Webhook-Secret" header or "Authorization: Bearer ...".
// Body: JSON, a form post, or the lead as plain text. Add &type=auto (home /
// renters / commercial) if the lead itself doesn't say which kind it is.
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const key =
    req.nextUrl.searchParams.get('key') ||
    req.headers.get('x-webhook-secret') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    null
  if (!secretMatches(key, process.env.SMARTFINANCIAL_WEBHOOK_SECRET)) {
    return NextResponse.json({ ok: false, error: 'Invalid or missing key' }, { status: 401 })
  }

  const raw = await req.text()
  const contentType = req.headers.get('content-type') ?? ''
  let body: unknown = null
  if (contentType.includes('json') || /^\s*[{[]/.test(raw)) {
    try { body = JSON.parse(raw) } catch { body = null }
  } else if (contentType.includes('form-urlencoded')) {
    body = Object.fromEntries(new URLSearchParams(raw))
  }
  const typeHint = leadTypeFromText(req.nextUrl.searchParams.get('type')).type

  try {
    const parsed = parseLeadBody(body, raw, typeHint)
    const result = await ingestLead(parsed, body ?? { text: raw })
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[smartfinancial webhook]', msg)
    // Let staff know - the lead would otherwise be lost
    try {
      const s = await getSettings()
      await sendEmail({
        to: notifyEmailList(s),
        subject: 'A SmartFinancial lead could not be saved',
        text: `A lead arrived but could not be saved in the CRM: ${msg}\n\nHere is what was received:\n\n${raw.slice(0, 20000)}`,
      })
    } catch {}
    // 500 so SmartFinancial retries
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
