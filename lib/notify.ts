import 'server-only'
import { sendEmail, escapeHtml } from './email'
import { logEvent } from './events'
import { LEAD_TYPE_LABELS, leadName, leadSummaryLines, type InsuranceLead } from './fields'
import { formatPhone } from './phone'
import { appBaseUrl, logoUrl, notifyEmailList, type Settings } from './settings'

function wrapHtml(s: Settings, heading: string, bodyHtml: string, button?: { href: string; label: string }) {
  return `<!doctype html><html><body style="margin:0;background:#F7F8FB;font-family:Arial,Helvetica,sans-serif;color:#1F2430">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">
  <div style="text-align:center;margin-bottom:16px"><img src="${escapeHtml(logoUrl(s))}" alt="${escapeHtml(s.agency_name ?? '')}" style="max-height:64px;max-width:200px"></div>
  <div style="background:#fff;border:1px solid #E4E7EC;border-radius:10px;padding:24px">
    <h2 style="margin:0 0 16px;color:#0B2F86;font-size:20px">${escapeHtml(heading)}</h2>
    ${bodyHtml}
    ${button ? `<p style="margin:24px 0 0"><a href="${escapeHtml(button.href)}" style="background:#0B2F86;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;display:inline-block;font-weight:bold">${escapeHtml(button.label)}</a></p>` : ''}
  </div>
  <p style="text-align:center;color:#667085;font-size:12px;margin-top:16px">${escapeHtml(s.agency_name ?? '')}</p>
</div></body></html>`
}

function linesToHtml(lines: string[]): string {
  return lines
    .map((l) => {
      if (!l) return '<div style="height:10px"></div>'
      if (/^[A-Z0-9 #&]+$/.test(l)) return `<div style="font-weight:bold;color:#0B2F86;margin-top:8px;border-bottom:1px solid #E4E7EC;padding-bottom:2px">${escapeHtml(l)}</div>`
      const i = l.indexOf(': ')
      return i > 0
        ? `<div style="padding:2px 0"><span style="color:#667085">${escapeHtml(l.slice(0, i))}:</span> ${escapeHtml(l.slice(i + 2))}</div>`
        : `<div>${escapeHtml(l)}</div>`
    })
    .join('\n')
}

export async function emailNewLead(lead: InsuranceLead, s: Settings, textStatus: string) {
  const to = notifyEmailList(s)
  if (!to.length) return
  const url = `${appBaseUrl()}/leads/${lead.id}`
  const lines = leadSummaryLines(lead)
  const name = lead.business_name ? `${leadName(lead)} (${lead.business_name})` : leadName(lead)
  const subject = `New ${LEAD_TYPE_LABELS[lead.lead_type]} lead: ${name}${lead.phone ? ` ${formatPhone(lead.phone)}` : ''}`
  const text = [`New ${LEAD_TYPE_LABELS[lead.lead_type]} insurance lead from SmartFinancial.`, `Text message: ${textStatus}`, '', ...lines, '', `Open in the CRM: ${url}`].join('\n')
  const html = wrapHtml(
    s,
    `New ${LEAD_TYPE_LABELS[lead.lead_type]} lead: ${name}`,
    `<p style="margin:0 0 12px;color:#667085">Text message: ${escapeHtml(textStatus)}</p>${linesToHtml(lines)}`,
    { href: url, label: 'Open lead' }
  )
  try {
    await sendEmail({ to, subject, text, html, replyTo: lead.email ?? undefined })
    await logEvent(lead, 'lead_emailed', { to })
  } catch (err) {
    await logEvent(lead, 'email_failed', { to, error: err instanceof Error ? err.message : String(err) })
    throw err
  }
}

export async function emailReply(lead: InsuranceLead, s: Settings, inbound: string, botNote: string | null, botReplied: string | null) {
  const to = notifyEmailList(s)
  if (!to.length || !s.notify_on_reply) return
  const url = `${appBaseUrl()}/leads/${lead.id}`
  const subject = `${botNote !== null && botReplied === null ? 'Needs you: ' : ''}${leadName(lead)} texted back`
  const parts = [`${leadName(lead)} (${LEAD_TYPE_LABELS[lead.lead_type]} lead${lead.phone ? `, ${formatPhone(lead.phone)}` : ''}) texted:`, '', `"${inbound}"`]
  if (botReplied) parts.push('', `The assistant replied: "${botReplied}"`)
  if (botNote) parts.push('', `Note: ${botNote}`)
  parts.push('', `Open the conversation: ${url}`)
  const html = wrapHtml(s, `${leadName(lead)} texted back`, parts.slice(0, -2).map((p) => (p ? `<p style="margin:0 0 8px">${escapeHtml(p)}</p>` : '')).join(''), { href: url, label: 'Open conversation' })
  await sendEmail({ to, subject, text: parts.join('\n'), html })
}

export async function emailFollowUpDigest(leads: InsuranceLead[], s: Settings, today: string) {
  const to = notifyEmailList(s)
  if (!to.length || !leads.length) return
  const base = appBaseUrl()
  const rows = leads.map((l) => `${l.follow_up_date && l.follow_up_date < today ? '(overdue) ' : ''}${leadName(l)} - ${LEAD_TYPE_LABELS[l.lead_type]}${l.phone ? `, ${formatPhone(l.phone)}` : ''}${l.notes ? ` - Latest note: ${l.notes.split('\n')[0].slice(0, 80)}` : ''}\n${base}/leads/${l.id}`)
  const subject = `Follow-ups due today: ${leads.length}`
  const html = wrapHtml(
    s,
    subject,
    leads
      .map((l) => `<p style="margin:0 0 12px"><a href="${escapeHtml(`${base}/leads/${l.id}`)}" style="color:#0B2F86;font-weight:bold">${escapeHtml(leadName(l))}</a> - ${escapeHtml(LEAD_TYPE_LABELS[l.lead_type])}${l.phone ? `, ${escapeHtml(formatPhone(l.phone))}` : ''}${l.follow_up_date && l.follow_up_date < today ? ' <span style="color:#C8102E">(overdue)</span>' : ''}${l.notes ? `<br><span style="color:#667085">${escapeHtml(l.notes.split('\n')[0].slice(0, 120))}</span>` : ''}</p>`)
      .join(''),
    { href: `${base}/leads?followup=due`, label: 'Open follow-ups' }
  )
  await sendEmail({ to, subject, text: rows.join('\n\n'), html })
}
