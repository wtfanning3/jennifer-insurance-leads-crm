import { NextRequest } from 'next/server'
import { db } from '@/lib/supabase-admin'
import { getSettings, officePhoneFor } from '@/lib/settings'
import { formatPhone } from '@/lib/phone'
import { publicPage } from '@/lib/public-page'
import { escapeHtml } from '@/lib/email'

// "Tap to call our office" link in texts: opens the phone's dialer with the
// office number (Settings, or the one set for this lead / lead type), and
// notes on the lead that they tapped it.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const s = await getSettings()
  const { data: lead } = await db().from('leads').select('id, lead_type, call_phone, call_link_clicked_at').eq('short_code', code).maybeSingle()
  const phone = officePhoneFor(lead ?? { lead_type: 'auto', call_phone: null }, s)
  if (lead && !lead.call_link_clicked_at) await db().from('leads').update({ call_link_clicked_at: new Date().toISOString() }).eq('id', lead.id)
  if (!phone) return publicPage(s, 'Call us', `<h1>Call ${escapeHtml(s.agency_name ?? 'us')}</h1><p>Please reply to our text and we'll call you right away.</p>`)
  const tel = `tel:${phone}`
  return publicPage(
    s,
    'Call us',
    `<h1>Call ${escapeHtml(s.agent_name || s.agency_name || 'us')}</h1><p>Tap below to call our office about your quote.</p>
<a class="btn" href="${escapeHtml(tel)}">Call ${escapeHtml(formatPhone(phone))}</a>
${s.office_hours ? `<p class="small">Office hours: ${escapeHtml(s.office_hours)}</p>` : ''}`,
    `<script>setTimeout(function(){location.href=${JSON.stringify(tel)}},400)</script>`
  )
}
