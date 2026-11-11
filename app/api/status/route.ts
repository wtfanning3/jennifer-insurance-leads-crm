import { NextResponse } from 'next/server'
import { requireStaff } from '@/lib/auth'
import { smsProvider } from '@/lib/sms'
import { aiConfigured, AI_MODEL } from '@/lib/ai'
import { appBaseUrl } from '@/lib/settings'

// What's connected - shown on the Settings page (never shows secret values)
export async function GET() {
  const denied = await requireStaff()
  if (denied) return denied
  const base = appBaseUrl()
  return NextResponse.json({
    baseUrl: base,
    sms: smsProvider(),
    smsFrom: process.env.TWILIO_FROM_NUMBER || process.env.TELNYX_FROM_NUMBER || (process.env.TWILIO_MESSAGING_SERVICE_SID ? 'Messaging Service' : null),
    email: !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
    emailFrom: process.env.EMAIL_FROM ?? null,
    ai: aiConfigured(),
    aiModel: AI_MODEL,
    webhookSecretSet: !!process.env.SMARTFINANCIAL_WEBHOOK_SECRET,
    cronSecretSet: !!process.env.CRON_SECRET,
    leadWebhookUrl: `${base}/api/webhooks/smartfinancial?key=YOUR_SMARTFINANCIAL_WEBHOOK_SECRET`,
    smsWebhookUrl: `${base}/api/webhooks/sms`,
  })
}
