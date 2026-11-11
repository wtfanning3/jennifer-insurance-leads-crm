import { NextRequest } from 'next/server'
import { db } from '@/lib/supabase-admin'
import { getSettings } from '@/lib/settings'
import { publicPage } from '@/lib/public-page'
import { sendEmail } from '@/lib/email'
import { leadName } from '@/lib/fields'
import { notifyEmailList } from '@/lib/settings'
import { escapeHtml } from '@/lib/email'

// "Stop texts" link. Opening it shows a button; the button opts them out.
// (Phones and spam filters open links to preview them - this way a preview
// never unsubscribes anyone.) Replying STOP works too.
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const s = await getSettings()
  return publicPage(
    s,
    'Stop texts',
    `<h1>Stop text messages?</h1><p>Tap the button and we won't text you again.</p>
<form method="POST" action="${escapeHtml(`/i/s/${encodeURIComponent(code)}`)}"><button class="btn red" type="submit">Stop texts</button></form>
<p class="small">You can also reply STOP to any of our texts.</p>`
  )
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const s = await getSettings()
  const { data: lead } = await db().from('leads').select('id, first_name, last_name, phone, sms_opted_out').eq('short_code', code).maybeSingle()
  if (lead && !lead.sms_opted_out) {
    await db().from('leads').update({ sms_opted_out: true, sms_opted_out_at: new Date().toISOString(), bot_paused: true }).eq('id', lead.id)
    await sendEmail({
      to: notifyEmailList(s),
      subject: `Opted out of texts: ${leadName(lead)}`,
      text: `${leadName(lead)}${lead.phone ? ` (${lead.phone})` : ''} used the "stop texts" link. No more texts will be sent to them.`,
    }).catch(() => {})
  }
  return publicPage(s, 'Texts stopped', `<h1>You're unsubscribed</h1><p>You won't get any more text messages from us.${s.office_phone ? ' If you still want a quote, just give us a call.' : ''}</p>`)
}
