import 'server-only'

// Emails (new-lead alerts, reply alerts, follow-up reminders) go out through
// Resend (resend.com). Set RESEND_API_KEY and EMAIL_FROM in Vercel.
export interface EmailParams {
  to: string[]
  subject: string
  text: string
  html?: string
  replyTo?: string
}

export async function sendEmail({ to, subject, text, html, replyTo }: EmailParams): Promise<void> {
  if (!to.length) return
  const key = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!key || !from) throw new Error('Email is not set up - add RESEND_API_KEY and EMAIL_FROM in Vercel (see docs/SETUP.md).')
  // One email per address, so nobody sees the others' addresses
  const results = await Promise.allSettled(
    to.map(async (addr) => {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [addr], subject, text, ...(html ? { html } : {}), ...(replyTo ? { reply_to: replyTo } : {}) }),
      })
      if (!res.ok) throw new Error(`Resend (${addr}): ${(await res.text()).slice(0, 300)}`)
    })
  )
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failed.length === to.length) throw failed[0].reason
  for (const f of failed) console.error('[email]', f.reason)
}

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
